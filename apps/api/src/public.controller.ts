import {BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Req, UnauthorizedException, UseGuards} from '@nestjs/common';
import {ApiBearerAuth, ApiProperty, ApiTags} from '@nestjs/swagger';
import {Throttle, ThrottlerGuard} from '@nestjs/throttler';
import {IsBoolean, IsString, Length, Matches} from 'class-validator';
import {Request} from 'express';
import {randomBytes} from 'crypto';
import {Prisma} from '../generated/client';
import {hashToken, Roles, SessionGuard, StaffRequest} from './auth';
import {scope} from './offences.service';
import {PrismaService} from './prisma.service';
import {IncidentDto} from './staff.dto';
import {serial} from './transactions';

export class VerifyTicketDto {
  @ApiProperty() @IsString() @Length(10, 100) reference!: string;
  @ApiProperty() @Matches(/^[a-f0-9]{16}$/) verificationCode!: string;
}
export class AlertDto {
  @ApiProperty() @IsString() @Length(3, 100) @Matches(/\S/) title!: string;
  @ApiProperty() @IsString() @Length(3, 1000) @Matches(/\S/) message!: string;
}
export class AlertStatusDto {@ApiProperty() @IsBoolean() active!: boolean;}
const warning = 'DEMO — NOT VALID FOR PAYMENT OR ENFORCEMENT';
async function publicTicket(tx: Prisma.TransactionClient, ticketId: string) {
  const ticket = await tx.ticket.findUniqueOrThrow({where: {id: ticketId}, include: {publicAccess: true, offence: {include: {category: true}}}});
  return {warning, reference: ticket.publicReference, demoAmount: ticket.demoFineAmountSnapshot, status: ticket.status, issuedAt: ticket.issuedAt, category: ticket.offence.category.name, paymentStatus: ticket.publicAccess?.paidAt ? 'SIMULATED_PAID' : 'NOT_SIMULATED', simulatedAt: ticket.publicAccess?.paidAt ?? null, receiptReference: ticket.publicAccess?.receiptReference ?? null};
}
@ApiTags('Public demo services') @Controller('public')
export class PublicController {
  constructor(private readonly db: PrismaService) {}
  @Get('notices')
  async notices() {
    const [settings, alerts] = await Promise.all([this.db.systemSetting.findUnique({where: {key: 'demo'}}), this.db.trafficAlert.findMany({where: {active: true}, select: {id: true, title: true, message: true, createdAt: true}, orderBy: {createdAt: 'desc'}, take: 50})]);
    return {warning, notice: settings?.publicNotice ?? 'Fictional training environment.', alerts};
  }
  @Post('tickets/verify') @HttpCode(200) @UseGuards(ThrottlerGuard) @Throttle({default: {limit: 5, ttl: 60000}})
  verify(@Body() dto: VerifyTicketDto) {
    return serial(this.db, async tx => {
      const ticket = await tx.ticket.findUnique({where: {publicReference: dto.reference}, include: {publicAccess: true}});
      if (!ticket?.publicAccess || ticket.publicAccess.codeHash !== hashToken(dto.verificationCode)) throw new UnauthorizedException('Ticket verification failed');
      const token = randomBytes(32).toString('hex'); const expiresAt = new Date(Date.now() + 600000);
      await tx.publicTicketSession.deleteMany({where: {expiresAt: {lte: new Date()}}});
      await tx.publicTicketSession.create({data: {ticketId: ticket.id, tokenHash: hashToken(token), expiresAt}});
      await tx.auditEvent.create({data: {action: 'PUBLIC_TICKET_VERIFIED', entityType: 'Ticket', entityId: ticket.id}});
      return {token, expiresAt, ticket: await publicTicket(tx, ticket.id)};
    });
  }
  private async ticketId(tx: Prisma.TransactionClient, req: Request) {
    const match = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization ?? '');
    if (!match) throw new UnauthorizedException('Verify the demo ticket first');
    const session = await tx.publicTicketSession.findUnique({where: {tokenHash: hashToken(match[1])}});
    if (!session || session.expiresAt <= new Date()) throw new UnauthorizedException('Ticket access expired. Verify again.');
    return session.ticketId;
  }
  @Get('tickets/current') @ApiBearerAuth()
  current(@Req() req: Request) {return serial(this.db, async tx => publicTicket(tx, await this.ticketId(tx, req)));}
  @Post('tickets/payment-simulation') @HttpCode(200) @ApiBearerAuth() @UseGuards(ThrottlerGuard) @Throttle({default: {limit: 10, ttl: 60000}})
  simulate(@Req() req: Request) {
    return serial(this.db, async tx => {
      const id = await this.ticketId(tx, req); const ticket = await tx.ticket.findUniqueOrThrow({where: {id}, include: {publicAccess: true}});
      if (ticket.status === 'CANCELLED') throw new ConflictException('Cancelled demo tickets cannot be paid');
      if (!ticket.publicAccess?.paidAt) {
        await tx.publicTicketAccess.update({where: {ticketId: id}, data: {paidAt: new Date(), receiptReference: `DEMO-${randomBytes(12).toString('hex')}`}});
        await tx.auditEvent.create({data: {action: 'PAYMENT_SIMULATED', entityType: 'Ticket', entityId: id}});
      }
      return publicTicket(tx, id);
    });
  }
  @Post('tickets/logout') @HttpCode(204)
  async logout(@Req() req: Request) {const token = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization ?? '')?.[1]; if (token) await this.db.publicTicketSession.deleteMany({where: {tokenHash: hashToken(token)}});}
  @Post('incidents') @UseGuards(ThrottlerGuard) @Throttle({default: {limit: 5, ttl: 60000}})
  report(@Body() dto: IncidentDto) {
    if ((dto.latitude == null) !== (dto.longitude == null)) throw new BadRequestException('Provide both coordinates or neither');
    return serial(this.db, async tx => {
      const existing = await tx.incident.findUnique({where: {requestKey: dto.requestKey}});
      if (existing) {
        if (existing.source !== 'PUBLIC_UNVERIFIED' || existing.type !== dto.type || existing.location !== dto.location || existing.description !== dto.description || existing.latitude !== (dto.latitude ?? null) || existing.longitude !== (dto.longitude ?? null)) throw new ConflictException('Request key already used');
      } else {
        const supervisor = await tx.user.findFirst({where: {role: 'SUPERVISOR', active: true}, orderBy: {email: 'asc'}});
        if (!supervisor) throw new ConflictException('Demo reporting is temporarily unavailable');
        const incident = await tx.incident.create({data: {...dto, supervisorId: supervisor.id, source: 'PUBLIC_UNVERIFIED'}});
        await tx.auditEvent.create({data: {action: 'PUBLIC_INCIDENT_REPORTED', entityType: 'Incident', entityId: incident.id}});
      }
      return {warning, message: 'Demo report received for supervisor review. This is not an emergency service.'};
    });
  }
}
@ApiTags('Public service management') @ApiBearerAuth() @UseGuards(SessionGuard) @Controller()
export class PublicManagementController {
  constructor(private readonly db: PrismaService) {}
  @Post('tickets/:id/access-code') @Roles('OFFICER')
  code(@Req() req: StaffRequest, @Param('id', ParseUUIDPipe) id: string) {
    return serial(this.db, async tx => {
      const ticket = await tx.ticket.findFirst({where: {id, offence: scope(req.actor)}});
      if (!ticket) throw new NotFoundException('Ticket not found');
      const verificationCode = randomBytes(8).toString('hex');
      await tx.publicTicketAccess.upsert({where: {ticketId: id}, create: {ticketId: id, codeHash: hashToken(verificationCode)}, update: {codeHash: hashToken(verificationCode)}});
      await tx.publicTicketSession.deleteMany({where: {ticketId: id}});
      await tx.auditEvent.create({data: {actorId: req.actor.id, action: 'TICKET_ACCESS_CODE_ROTATED', entityType: 'Ticket', entityId: id}});
      return {warning, reference: ticket.publicReference, verificationCode};
    });
  }
  @Get('alerts') @Roles('SUPERVISOR')
  alerts() {return this.db.trafficAlert.findMany({take: 50, orderBy: {createdAt: 'desc'}});}
  @Post('alerts') @Roles('SUPERVISOR')
  create(@Req() req: StaffRequest, @Body() dto: AlertDto) {return serial(this.db, async tx => {const alert = await tx.trafficAlert.create({data: {...dto, createdBy: req.actor.id}}); await tx.auditEvent.create({data: {actorId: req.actor.id, action: 'DEMO_ALERT_PUBLISHED', entityType: 'TrafficAlert', entityId: alert.id}}); return alert;});}
  @Patch('alerts/:id') @Roles('SUPERVISOR')
  update(@Req() req: StaffRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AlertStatusDto) {return serial(this.db, async tx => {if (!await tx.trafficAlert.findFirst({where: {id, createdBy: req.actor.id}})) throw new NotFoundException('Alert not found'); const alert = await tx.trafficAlert.update({where: {id}, data: dto}); await tx.auditEvent.create({data: {actorId: req.actor.id, action: 'DEMO_ALERT_UPDATED', entityType: 'TrafficAlert', entityId: id, safeMetadata: {active: dto.active}}}); return alert;});}
}
