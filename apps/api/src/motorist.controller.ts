import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';
import { Roles, SessionGuard, StaffRequest } from './auth';
import { PrismaService } from './prisma.service';
import { PageQuery } from './dto';
import {
  PaymentsService,
  effectivePaymentStatus,
  ledgerTicket,
  paymentView,
  ticketInclude,
  SimulationOutcome,
} from './payments.service';

export class PaymentDto {
  @ApiProperty() @IsUUID() requestKey!: string;
  @ApiProperty() @IsString() @Length(10, 100) reference!: string;
  @ApiProperty({ enum: ['ECOCASH', 'INNBUCKS', 'CARD'] })
  @IsIn(['ECOCASH', 'INNBUCKS', 'CARD'])
  method!: 'ECOCASH' | 'INNBUCKS' | 'CARD';
  @ApiPropertyOptional() @IsOptional() @Matches(/^4242$/) last4?: string;
}
export class OutcomeDto {
  @ApiProperty({ enum: ['APPROVE', 'DECLINE', 'TIMEOUT', 'ERROR', 'CANCEL'] })
  @IsIn(['APPROVE', 'DECLINE', 'TIMEOUT', 'ERROR', 'CANCEL'])
  outcome!: SimulationOutcome;
}
@ApiTags('Motorist account')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Roles('USER')
@Controller('motorist')
export class MotoristController {
  constructor(
    private readonly db: PrismaService,
    private readonly payments: PaymentsService,
  ) {}
  @Get('dashboard')
  async dashboard(@Req() req: StaffRequest) {
    const [tickets, vehicles] = await this.db.$transaction([
      this.db.ticket.findMany({
        where: { motoristId: req.actor.id },
        select: {
          status: true,
          dueAt: true,
          demoFineAmountSnapshot: true,
          demeritPointsSnapshot: true,
          publicAccess: { select: { paidAt: true } },
        },
      }),
      this.db.vehicle.count({ where: { motoristId: req.actor.id } }),
    ]);
    const rows = tickets.map((t) => ({
      amount: t.demoFineAmountSnapshot,
      paymentStatus: effectivePaymentStatus(t),
      demeritPoints: t.status === 'CANCELLED' ? 0 : t.demeritPointsSnapshot,
    }));
    const payable = rows.filter((t) =>
      ['PENDING', 'OVERDUE'].includes(t.paymentStatus),
    );
    return {
      totalPayable:
        payable.reduce(
          (sum, t) => sum + Math.round(Number(t.amount) * 100),
          0,
        ) / 100,
      pendingFines: payable.length,
      demeritPoints: rows.reduce((sum, t) => sum + t.demeritPoints, 0),
      paidFines: rows.filter((t) => t.paymentStatus === 'PAID').length,
      registeredVehicles: vehicles,
      currency: 'UNITS',
    };
  }
  @Get('infringements')
  async infringements(@Req() req: StaffRequest, @Query() q: PageQuery) {
    const where = { motoristId: req.actor.id };
    const [items, total] = await this.db.$transaction([
      this.db.ticket.findMany({
        where,
        include: ticketInclude,
        orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.ticket.count({ where }),
    ]);
    return {
      items: items.map(ledgerTicket),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  @Get('infringements/:reference')
  async infringement(
    @Req() req: StaffRequest,
    @Param('reference') reference: string,
  ) {
    const ticket = await this.db.ticket.findFirst({
      where: { publicReference: reference, motoristId: req.actor.id },
      include: ticketInclude,
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    const payments = await this.db.payment.findMany({
      where: { ticketId: ticket.id, motoristId: req.actor.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { ...ledgerTicket(ticket), payments: payments.map(paymentView) };
  }
  @Get('vehicles')
  async vehicles(@Req() req: StaffRequest, @Query() q: PageQuery) {
    const where = { motoristId: req.actor.id };
    const [items, total] = await this.db.$transaction([
      this.db.vehicle.findMany({
        where,
        select: {
          registrationNumber: true,
          make: true,
          model: true,
          colour: true,
          registrationStatus: true,
          offences: {
            where: {
              ticket: {
                motoristId: req.actor.id,
                status: 'ISSUED',
                OR: [
                  { publicAccess: null },
                  { publicAccess: { paidAt: null } },
                ],
              },
            },
            select: { ticket: { select: { demoFineAmountSnapshot: true } } },
          },
        },
        orderBy: { registrationNumber: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.vehicle.count({ where }),
    ]);
    return {
      items: items.map(({ offences, ...vehicle }) => ({
        ...vehicle,
        activeInfringements: offences.length,
        totalPayable:
          offences.reduce(
            (sum, offence) =>
              sum +
              Math.round(
                Number(offence.ticket?.demoFineAmountSnapshot ?? 0) * 100,
              ),
            0,
          ) / 100,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  @Get('incidents')
  async incidents(@Req() req: StaffRequest, @Query() q: PageQuery) {
    const where = { reportedBy: req.actor.id, source: 'PUBLIC_UNVERIFIED' };
    const [items, total] = await this.db.$transaction([
      this.db.incident.findMany({
        where,
        select: {
          type: true,
          location: true,
          description: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.incident.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
  @Get('payments')
  async history(@Req() req: StaffRequest, @Query() q: PageQuery) {
    const where = { motoristId: req.actor.id };
    const [items, total] = await this.db.$transaction([
      this.db.payment.findMany({
        where,
        include: { ticket: { select: { publicReference: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.payment.count({ where }),
    ]);
    return {
      items: items.map((p) => ({
        ...paymentView(p),
        ticketReference: p.ticket.publicReference,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  @Post('payments')
  initiate(@Req() req: StaffRequest, @Body() dto: PaymentDto) {
    if ((dto.method === 'CARD') !== (dto.last4 === '4242'))
      throw new BadRequestException(
        'Use the provided test card for card simulation.',
      );
    return this.payments.initiate(req.actor.id, dto);
  }
  @Post('payments/:reference/outcome')
  outcome(
    @Req() req: StaffRequest,
    @Param('reference') reference: string,
    @Body() dto: OutcomeDto,
  ) {
    return this.payments.resolve(req.actor.id, reference, dto.outcome);
  }
  @Get('payments/:reference/receipt')
  async receipt(
    @Req() req: StaffRequest,
    @Param('reference') reference: string,
  ) {
    const payment = await this.db.payment.findFirst({
      where: {
        paymentReference: reference,
        motoristId: req.actor.id,
        status: 'SUCCESS',
      },
      include: { ticket: { include: ticketInclude } },
    });
    if (!payment) throw new NotFoundException('Receipt not found');
    return {
      ...paymentView(payment),
      motorist: req.actor.name,
      ticketReference: payment.ticket.publicReference,
      registration: payment.ticket.offence.vehicle.registrationNumber,
      offence: payment.ticket.offence.category.name,
      notice:
        'Simulated payment receipt — no funds transferred. Academic Prototype.',
    };
  }
}
