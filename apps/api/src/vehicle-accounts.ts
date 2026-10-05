import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { Equals, IsBoolean, IsIn, IsString, Length } from 'class-validator';
import { Prisma } from '../generated/client';
import { Roles, SessionGuard, StaffRequest } from './auth';
import { CURRENCY } from './currency';
import { PageQuery, VehicleQuery } from './dto';
import {
  effectivePaymentStatus,
  ledgerTicket,
  ticketInclude,
} from './payments.service';
import { PrismaService } from './prisma.service';
import { serial } from './transactions';

class NicknameDto {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(0, 60)
  nickname!: string;
}
class ReviewVehicleDto {
  @ApiProperty({ enum: ['VERIFIED', 'REJECTED'] })
  @IsIn(['VERIFIED', 'REJECTED'])
  status!: 'VERIFIED' | 'REJECTED';
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(3, 500)
  note!: string;
  @ApiProperty({
    description:
      'Administrator confirms the account and supporting ownership information have been checked.',
  })
  @IsBoolean()
  @Equals(true)
  checked!: boolean;
}
const vehicleFields = {
  registrationNumber: true,
  make: true,
  model: true,
  colour: true,
  registrationStatus: true,
  nickname: true,
  linkVerifiedAt: true,
} as const;
const requestFields = {
  id: true,
  registration: true,
  kind: true,
  status: true,
  submittedAt: true,
  reviewedAt: true,
} as const;
const normalize = (registration: string) =>
  registration.replace(/[\s-]/g, '').toUpperCase();
type AmountTicket = {
  status: string;
  dueAt: Date | null;
  demoFineAmountSnapshot: Prisma.Decimal;
  publicAccess: { paidAt: Date | null } | null;
};
function totals(tickets: AmountTicket[]) {
  const pending = tickets.filter((t) =>
    ['PENDING', 'OVERDUE'].includes(effectivePaymentStatus(t)),
  );
  const paid = tickets.filter((t) => effectivePaymentStatus(t) === 'PAID');
  const sum = (rows: AmountTicket[]) =>
    rows.reduce(
      (n, t) => n + Math.round(Number(t.demoFineAmountSnapshot) * 100),
      0,
    ) / 100;
  return {
    linkedInfringements: tickets.length,
    activeInfringements: pending.length,
    paidInfringements: paid.length,
    totalPayable: sum(pending),
    paidAmount: sum(paid),
    currency: CURRENCY,
  };
}
const amountFields = {
  status: true,
  dueAt: true,
  demoFineAmountSnapshot: true,
  publicAccess: { select: { paidAt: true } },
} as const;

@Injectable()
export class VehicleAccountsService {
  constructor(private readonly db: PrismaService) {}
  async inventory(actor: string, q: PageQuery) {
    return this.db.$transaction(
      async (tx) => {
        const vehicles = await tx.vehicle.findMany({
          where: { motoristId: actor },
          select: {
            ...vehicleFields,
            offences: {
              where: { ticket: { motoristId: actor } },
              select: { ticket: { select: amountFields } },
            },
          },
          orderBy: { registrationNumber: 'asc' },
        });
        const rows = vehicles.map(({ offences, ...v }) => ({
          ...v,
          ownershipStatus: 'VERIFIED',
          ...totals(offences.flatMap((o) => (o.ticket ? [o.ticket] : []))),
        }));
        return {
          items: rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
          total: rows.length,
          page: q.page,
          pageSize: q.pageSize,
          summary: {
            registeredVehicles: rows.length,
            activeInfringements: rows.reduce(
              (n, v) => n + v.activeInfringements,
              0,
            ),
            totalPayable:
              rows.reduce((n, v) => n + Math.round(v.totalPayable * 100), 0) /
              100,
            vehiclesRequiringAttention: rows.filter(
              (v) =>
                v.activeInfringements > 0 ||
                !['REGISTERED', 'ACTIVE', 'VALID'].includes(
                  v.registrationStatus,
                ),
            ).length,
            currency: CURRENCY,
          },
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async detail(actor: string, registration: string, q: PageQuery) {
    return this.db.$transaction(
      async (tx) => {
        const vehicle = await tx.vehicle.findFirst({
          where: {
            registrationNumber: normalize(registration),
            motoristId: actor,
          },
          select: vehicleFields,
        });
        if (!vehicle) throw new NotFoundException('Vehicle not found');
        const where = {
          motoristId: actor,
          offence: {
            vehicle: { registrationNumber: vehicle.registrationNumber },
          },
        };
        const [amounts, tickets, history] = await Promise.all([
          tx.ticket.findMany({ where, select: amountFields }),
          tx.ticket.findMany({
            where,
            include: ticketInclude,
            orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
            skip: (q.page - 1) * q.pageSize,
            take: q.pageSize,
          }),
          tx.vehicleLinkRequest.findMany({
            where: {
              motoristId: actor,
              registration: vehicle.registrationNumber,
            },
            select: requestFields,
            orderBy: { submittedAt: 'desc' },
            take: 20,
          }),
        ]);
        return {
          ...vehicle,
          ownershipStatus: 'VERIFIED',
          ...totals(amounts),
          checkedAt: new Date(),
          statusSource:
            'Internal Smart Traffic records only; no national registry connection.',
          infringements: {
            items: tickets.map(ledgerTicket),
            total: amounts.length,
            page: q.page,
            pageSize: q.pageSize,
          },
          history,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async check(actor: string, registration: string) {
    // No existence oracle: unknown, unassigned and other-owned plates receive the same response.
    const own = await this.db.vehicle.findFirst({
      where: { registrationNumber: registration, motoristId: actor },
      select: vehicleFields,
    });
    return own
      ? {
          registration,
          ownershipStatus: 'VERIFIED',
          vehicle: own,
          message: 'This vehicle is already linked to your account.',
        }
      : {
          registration,
          ownershipStatus: 'PENDING',
          vehicle: null,
          message:
            'Ownership verification required. Submit a link request for administrator review. Vehicle details are available only after approval.',
        };
  }
  request(actor: string, registration: string, kind: 'LINK' | 'UNLINK') {
    return serial(this.db, async (tx) => {
      const existing = await tx.vehicleLinkRequest.findFirst({
        where: { motoristId: actor, registration, kind, status: 'PENDING' },
        select: requestFields,
      });
      if (existing) return existing;
      const own = await tx.vehicle.findFirst({
        where: { registrationNumber: registration, motoristId: actor },
      });
      if (kind === 'LINK' && own)
        throw new ConflictException(
          'Vehicle is already linked to your account.',
        );
      if (kind === 'UNLINK') {
        if (!own) throw new NotFoundException('Vehicle not found');
        await this.ensureClear(tx, own.id, actor);
      }
      const request = await tx.vehicleLinkRequest.create({
        data: { motoristId: actor, registration, kind },
        select: requestFields,
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor,
          action: `VEHICLE_${kind}_REQUESTED`,
          entityType: 'VehicleLinkRequest',
          entityId: request.id,
        },
      });
      return request;
    });
  }
  async ensureClear(
    tx: Prisma.TransactionClient,
    vehicleId: string,
    actor: string,
  ) {
    const count = await tx.ticket.count({
      where: {
        motoristId: actor,
        status: 'ISSUED',
        offence: { vehicleId },
        OR: [{ publicAccess: null }, { publicAccess: { paidAt: null } }],
      },
    });
    if (count)
      throw new ConflictException(
        'Resolve outstanding infringements before unlinking this vehicle.',
      );
  }
  nickname(actor: string, registration: string, nickname: string) {
    return serial(this.db, async (tx) => {
      const vehicle = await tx.vehicle.findFirst({
        where: {
          registrationNumber: normalize(registration),
          motoristId: actor,
        },
        select: { id: true },
      });
      if (!vehicle) throw new NotFoundException('Vehicle not found');
      const result = await tx.vehicle.update({
        where: { id: vehicle.id },
        data: { nickname: nickname || null },
        select: vehicleFields,
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor,
          action: 'VEHICLE_NICKNAME_UPDATED',
          entityType: 'Vehicle',
          entityId: vehicle.id,
        },
      });
      return result;
    });
  }
  async requests(actor: string | null, q: PageQuery) {
    const where = actor ? { motoristId: actor } : {};
    const [items, total] = await this.db.$transaction([
      this.db.vehicleLinkRequest.findMany({
        where,
        select: {
          ...requestFields,
          ...(!actor
            ? {
                motorist: { select: { name: true, email: true } },
                reviewNote: true,
              }
            : {}),
        },
        orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.vehicleLinkRequest.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
  review(reviewer: string, id: string, dto: ReviewVehicleDto) {
    return serial(this.db, async (tx) => {
      const request = await tx.vehicleLinkRequest.findUnique({
        where: { id },
        include: { motorist: { select: { role: true, active: true } } },
      });
      if (!request) throw new NotFoundException('Request not found');
      if (request.status !== 'PENDING') {
        if (request.status !== dto.status)
          throw new ConflictException('Request has already been reviewed.');
        return { status: request.status };
      }
      if (dto.status === 'VERIFIED') {
        if (!request.motorist.active || request.motorist.role !== 'USER')
          throw new BadRequestException(
            'An active motorist account is required.',
          );
        const v = await tx.vehicle.findUnique({
          where: { registrationNumber: request.registration },
        });
        if (!v)
          throw new ConflictException(
            'No internal vehicle record exists. Reject the request or establish the record through authorised administration.',
          );
        if (request.kind === 'LINK') {
          if (v.motoristId && v.motoristId !== request.motoristId)
            throw new ConflictException(
              'Vehicle is linked to another account. Ownership transfer requires separate verification.',
            );
        } else {
          if (v.motoristId !== request.motoristId)
            throw new ConflictException('Vehicle account link has changed.');
          await this.ensureClear(tx, v.id, request.motoristId);
        }
        await tx.vehicle.update({
          where: { id: v.id },
          data: {
            motoristId: request.kind === 'LINK' ? request.motoristId : null,
            nickname: null,
            linkVerifiedAt: request.kind === 'LINK' ? new Date() : null,
          },
        });
        await tx.auditEvent.create({
          data: {
            actorId: reviewer,
            action:
              request.kind === 'LINK'
                ? 'VEHICLE_MOTORIST_LINKED'
                : 'VEHICLE_MOTORIST_UNLINKED',
            entityType: 'Vehicle',
            entityId: v.id,
            safeMetadata: { requestId: id },
          },
        });
      }
      const result = await tx.vehicleLinkRequest.update({
        where: { id },
        data: {
          status: dto.status,
          reviewedAt: new Date(),
          reviewedBy: reviewer,
          reviewNote: dto.note,
        },
        select: requestFields,
      });
      await tx.auditEvent.create({
        data: {
          actorId: reviewer,
          action: `VEHICLE_REQUEST_${dto.status}`,
          entityType: 'VehicleLinkRequest',
          entityId: id,
        },
      });
      return result;
    });
  }
}

@ApiTags('Motorist vehicles')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Roles('USER')
@Controller('motorist/vehicles')
export class VehicleAccountsController {
  constructor(private readonly service: VehicleAccountsService) {}
  @Get() list(@Req() r: StaffRequest, @Query() q: PageQuery) {
    return this.service.inventory(r.actor.id, q);
  }
  @Get('requests') requests(@Req() r: StaffRequest, @Query() q: PageQuery) {
    return this.service.requests(r.actor.id, q);
  }
  @Post('check')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  check(@Req() r: StaffRequest, @Body() dto: VehicleQuery) {
    return this.service.check(r.actor.id, dto.registration);
  }
  @Post('link-request')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  link(@Req() r: StaffRequest, @Body() dto: VehicleQuery) {
    return this.service.request(r.actor.id, dto.registration, 'LINK');
  }
  @Get(':vehicleId/status') status(
    @Req() r: StaffRequest,
    @Param('vehicleId') reg: string,
  ) {
    return this.service.detail(r.actor.id, reg, new PageQuery());
  }
  @Get(':vehicleId') detail(
    @Req() r: StaffRequest,
    @Param('vehicleId') reg: string,
    @Query() q: PageQuery,
  ) {
    return this.service.detail(r.actor.id, reg, q);
  }
  @Patch(':vehicleId') nickname(
    @Req() r: StaffRequest,
    @Param('vehicleId') reg: string,
    @Body() dto: NicknameDto,
  ) {
    return this.service.nickname(r.actor.id, reg, dto.nickname);
  }
  @Post(':vehicleId/unlink-request') unlink(
    @Req() r: StaffRequest,
    @Param('vehicleId') reg: string,
  ) {
    return this.service.request(r.actor.id, normalize(reg), 'UNLINK');
  }
}
@ApiTags('Administration')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Roles('ADMIN')
@Controller('admin/vehicle-link-requests')
export class VehicleRequestsController {
  constructor(private readonly service: VehicleAccountsService) {}
  @Get() requests(@Query() q: PageQuery) {
    return this.service.requests(null, q);
  }
  @Post(':id/review') review(
    @Req() r: StaffRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewVehicleDto,
  ) {
    return this.service.review(r.actor.id, id, dto);
  }
}
