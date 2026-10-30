import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import {
  Equals,
  IsEmail,
  IsInt,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Prisma } from '../generated/client';
import { Actor, Roles, SessionGuard, StaffRequest } from './auth';
import { PrismaService } from './prisma.service';
import { serial } from './transactions';

class DriverIdentityDto {
  @ApiProperty() @IsString() @Length(3, 80) licenceNumber!: string;
  @ApiProperty() @IsEmail() motoristEmail!: string;
  @ApiProperty() @Equals(true) verified!: boolean;
  @ApiProperty() @IsString() @Length(3, 500) reason!: string;
}
class DriverLookupDto {
  @ApiProperty() @IsString() @Length(3, 80) licenceNumber!: string;
}
class PointsPolicyDto {
  @ApiProperty() @IsInt() @Min(1) @Max(100) allowance!: number;
  @ApiProperty() @IsString() @Length(3, 500) reason!: string;
}

export async function issuePoints(
  tx: Prisma.TransactionClient,
  ticket: { id: string; demeritPointsSnapshot: number },
  driverId: string | null,
  actorId: string,
) {
  if (!driverId) return;
  const driver = await tx.driver.findUnique({
    where: { id: driverId },
    include: { motorist: true, pointsAccount: true },
  });
  if (
    !driver?.identityVerifiedAt ||
    !driver.pointsAccount ||
    !driver.motorist?.active ||
    driver.motorist.role !== 'USER'
  )
    throw new ConflictException(
      'Driver identity changed. Refresh and verify the responsible driver before issuing.',
    );
  await tx.driverPointsLedger.create({
    data: {
      driverId,
      ticketId: ticket.id,
      event: 'ISSUANCE',
      delta: -ticket.demeritPointsSnapshot,
      actorId,
      reason: 'Configured points snapshot deducted on ticket issuance.',
    },
  });
  await tx.auditEvent.create({
    data: {
      actorId,
      action: 'DRIVER_POINTS_DEBITED',
      entityType: 'Ticket',
      entityId: ticket.id,
      safeMetadata: { points: ticket.demeritPointsSnapshot },
    },
  });
}
export async function reversePoints(
  tx: Prisma.TransactionClient,
  ticketId: string,
  actorId: string,
) {
  const debit = await tx.driverPointsLedger.findUnique({
    where: { ticketId_event: { ticketId, event: 'ISSUANCE' } },
  });
  if (
    !debit ||
    (await tx.driverPointsLedger.findUnique({
      where: { ticketId_event: { ticketId, event: 'CANCELLATION' } },
    }))
  )
    return;
  await tx.driverPointsLedger.create({
    data: {
      driverId: debit.driverId,
      ticketId,
      event: 'CANCELLATION',
      delta: -debit.delta,
      actorId,
      reason: 'Compensating credit for cancelled infringement.',
    },
  });
  await tx.auditEvent.create({
    data: {
      actorId,
      action: 'DRIVER_POINTS_CREDITED',
      entityType: 'Ticket',
      entityId: ticketId,
      safeMetadata: { points: -debit.delta },
    },
  });
}

@Injectable()
export class DriverPointsService {
  constructor(private readonly db: PrismaService) {}
  async balance(motoristId: string) {
    const driver = await this.db.driver.findUnique({
      where: { motoristId },
      include: {
        pointsAccount: {
          include: {
            entries: {
              orderBy: { createdAt: 'desc' },
              include: { ticket: { select: { displayReference: true } } },
            },
          },
        },
      },
    });
    if (!driver?.identityVerifiedAt || !driver.pointsAccount)
      return {
        status: 'PENDING_DRIVER_IDENTIFICATION',
        remaining: null,
        allowance: null,
        totalDeducted: 0,
        history: [],
      };
    const account = driver.pointsAccount;
    const raw = account.entries.reduce((sum, event) => sum + event.delta, 0);
    return {
      status: 'VERIFIED',
      remaining: Math.max(0, raw),
      allowance: account.startingAllowance,
      policyVersion: account.policyVersion,
      totalDeducted: account.entries
        .filter((e) => e.event !== 'OPENING')
        .reduce((sum, e) => sum - e.delta, 0),
      history: account.entries.map((e) => ({
        event: e.event,
        delta: e.delta,
        reference: e.ticket?.displayReference ?? 'INITIAL',
        at: e.createdAt,
        reason: e.reason,
      })),
    };
  }
  async policy() {
    return (
      (await this.db.driverPointsPolicy.findUnique({
        where: { key: 'default' },
      })) ?? { key: 'default', allowance: 12, version: 1 }
    );
  }
  configure(actor: Actor, dto: PointsPolicyDto) {
    return serial(this.db, async (tx) => {
      const row = await tx.driverPointsPolicy.upsert({
        where: { key: 'default' },
        create: { key: 'default', allowance: dto.allowance },
        update: { allowance: dto.allowance, version: { increment: 1 } },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: 'DRIVER_POINTS_POLICY_CONFIGURED',
          entityType: 'DriverPointsPolicy',
          entityId: 'default',
          safeMetadata: {
            allowance: dto.allowance,
            reason: dto.reason,
            version: row.version,
          },
        },
      });
      return row;
    });
  }
  verify(actor: Actor, dto: DriverIdentityDto) {
    return serial(this.db, async (tx) => {
      const driver = await tx.driver.findUnique({
        where: { licenceNumber: dto.licenceNumber.trim() },
      });
      const user = await tx.user.findFirst({
        where: {
          email: dto.motoristEmail.trim().toLowerCase(),
          role: 'USER',
          active: true,
        },
      });
      if (!driver || !user)
        throw new BadRequestException(
          'Select an existing driver licence and active motorist account.',
        );
      if (driver.motoristId && driver.motoristId !== user.id)
        throw new ConflictException(
          'Driver identity is already verified to a different account.',
        );
      const other = await tx.driver.findUnique({
        where: { motoristId: user.id },
      });
      if (other && other.id !== driver.id)
        throw new ConflictException(
          'This account already has a verified driver identity.',
        );
      await tx.driver.update({
        where: { id: driver.id },
        data: {
          motoristId: user.id,
          identityVerifiedAt: driver.identityVerifiedAt ?? new Date(),
        },
      });
      if (
        !(await tx.driverPointsAccount.findUnique({
          where: { driverId: driver.id },
        }))
      ) {
        const policy = await tx.driverPointsPolicy.findUnique({
          where: { key: 'default' },
        });
        const allowance = policy?.allowance ?? 12;
        await tx.driverPointsAccount.create({
          data: {
            driverId: driver.id,
            startingAllowance: allowance,
            policyVersion: policy?.version ?? 1,
            entries: {
              create: {
                event: 'OPENING',
                delta: allowance,
                actorId: actor.id,
                reason:
                  'Opening academic allowance; historical tickets are not backfilled.',
              },
            },
          },
        });
      }
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: 'DRIVER_IDENTITY_VERIFIED',
          entityType: 'Driver',
          entityId: driver.id,
          safeMetadata: { reason: dto.reason },
        },
      });
      return { name: driver.fullName, motorist: user.name, status: 'VERIFIED' };
    });
  }
  async lookup(licenceNumber: string) {
    const driver = await this.db.driver.findFirst({
      where: {
        licenceNumber: licenceNumber.trim(),
        identityVerifiedAt: { not: null },
        motorist: { role: 'USER', active: true },
      },
      select: { id: true, fullName: true, licenceStatus: true },
    });
    if (!driver)
      throw new NotFoundException(
        'No verified driver identity found. Leave responsibility pending until identification is verified.',
      );
    return driver;
  }
}
@ApiTags('Verified driver points')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Controller()
export class DriverPointsController {
  constructor(private readonly service: DriverPointsService) {}
  @Get('motorist/driver-points') @Roles('USER') balance(
    @Req() r: StaffRequest,
  ) {
    return this.service.balance(r.actor.id);
  }
  @Get('admin/driver-points/policy') @Roles('ADMIN') policy() {
    return this.service.policy();
  }
  @Post('admin/driver-points/policy') @Roles('ADMIN') configure(
    @Req() r: StaffRequest,
    @Body() dto: PointsPolicyDto,
  ) {
    return this.service.configure(r.actor, dto);
  }
  @Post('admin/driver-identities/verify') @Roles('ADMIN') verify(
    @Req() r: StaffRequest,
    @Body() dto: DriverIdentityDto,
  ) {
    return this.service.verify(r.actor, dto);
  }
  @Get('drivers/verified')
  @Roles('OFFICER')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  lookup(@Query() q: DriverLookupDto) {
    return this.service.lookup(q.licenceNumber);
  }
}
