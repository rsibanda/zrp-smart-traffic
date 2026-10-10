import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, SessionGuard, StaffRequest } from './auth';
import { PageQuery } from './dto';
import { PrismaService } from './prisma.service';
import { ReviewVehicleDto, VehicleAccountsService } from './vehicle-accounts';
import { CURRENCY } from './currency';

@ApiTags('Command centre')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Roles('SUPERVISOR')
@Controller('supervisor')
export class SupervisorController {
  constructor(
    private readonly db: PrismaService,
    private readonly vehicles: VehicleAccountsService,
  ) {}

  @Get('summary')
  async summary(@Req() r: StaffRequest) {
    // Zimbabwe local calendar day (UTC+02:00); payment visibility follows offence assignment.
    const local = new Date(Date.now() + 2 * 3600000);
    const start = new Date(
      Date.UTC(
        local.getUTCFullYear(),
        local.getUTCMonth(),
        local.getUTCDate(),
      ) -
        2 * 3600000,
    );
    const end = new Date(start.getTime() + 86400000);
    const [payments, pendingVehicleApprovals] = await this.db.$transaction([
      this.db.payment.aggregate({
        where: {
          status: 'SUCCESS',
          paidAt: { gte: start, lt: end },
          ticket: {
            offence: { supervisorId: r.actor.id, status: { not: 'DRAFT' } },
          },
        },
        _sum: { amount: true },
      }),
      this.db.vehicleLinkRequest.count({ where: { status: 'PENDING' } }),
    ]);
    return {
      paymentsToday: Number(payments._sum.amount ?? 0),
      currency: CURRENCY,
      pendingVehicleApprovals,
    };
  }

  @Get('payments')
  async payments(@Req() r: StaffRequest, @Query() q: PageQuery) {
    const where = {
      ticket: {
        offence: {
          supervisorId: r.actor.id,
          status: { not: 'DRAFT' as const },
        },
      },
    };
    const [items, total] = await this.db.$transaction([
      this.db.payment.findMany({
        where,
        select: {
          paymentReference: true,
          amount: true,
          currency: true,
          method: true,
          status: true,
          createdAt: true,
          paidAt: true,
          motorist: { select: { name: true } },
          ticket: { select: { displayReference: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.payment.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  @Get('vehicle-link-requests') requests(@Query() q: PageQuery) {
    return this.vehicles.requests(null, q);
  }
  @Get('vehicle-link-requests/:id') detail(
    @Req() r: StaffRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.vehicles.requestDetail(r.actor.id, id);
  }
  @Post('vehicle-link-requests/:id/review') review(
    @Req() r: StaffRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewVehicleDto,
  ) {
    return this.vehicles.review(r.actor.id, id, dto);
  }
}
