import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actor, Roles, SessionGuard, StaffRequest } from './auth';
import { PrismaService } from './prisma.service';
import { CheckpointDto, CheckpointReviewDto, IncidentDto, IncidentReviewDto, SearchQuery } from './staff.dto';
import { Prisma } from '../generated/client';
import { serial } from './transactions';

export function incidentScope(actor: Actor): Prisma.IncidentWhereInput {return actor.role === 'OFFICER' ? {reportedBy: actor.id} : {supervisorId: actor.id};}
export async function assignedSupervisor(tx: Prisma.TransactionClient, officerId: string) {
  const officer = await tx.user.findUniqueOrThrow({where: {id: officerId}});
  if (!officer.supervisorId) throw new ConflictException('Ask an administrator to assign an active supervisor');
  const supervisor = await tx.user.findFirst({where: {id: officer.supervisorId ?? undefined, role: 'SUPERVISOR', active: true}, orderBy: {email: 'asc'}});
  if (!supervisor) throw new ConflictException('Ask an administrator to assign an active supervisor');
  return supervisor.id;
}
const incidentDetails = {reporter: {select: {id: true, name: true}}} as const;
@ApiTags('Operations') @ApiBearerAuth() @UseGuards(SessionGuard) @Controller()
export class OperationsController {
  constructor(private readonly db: PrismaService) {}
  @Get('incidents') @Roles('OFFICER', 'SUPERVISOR')
  async incidents(@Req() req: StaffRequest, @Query() query: SearchQuery) {
    const where: Prisma.IncidentWhereInput = {AND: [incidentScope(req.actor), query.q ? {OR: [{location: {contains: query.q, mode: 'insensitive'}}, {description: {contains: query.q, mode: 'insensitive'}}]} : {}]};
    const [items, total] = await this.db.$transaction([
      this.db.incident.findMany({where, include: incidentDetails, orderBy: [{createdAt: 'desc'}, {id: 'desc'}], skip: (query.page - 1) * query.pageSize, take: query.pageSize}),
      this.db.incident.count({where}),
    ]);
    return {items, total, page: query.page, pageSize: query.pageSize};
  }
  @Post('incidents') @Roles('OFFICER')
  createIncident(@Req() req: StaffRequest, @Body() dto: IncidentDto) {
    if ((dto.latitude == null) !== (dto.longitude == null)) throw new BadRequestException('Provide both coordinates or neither');
    return serial(this.db, async tx => {
      const existing = await tx.incident.findUnique({where: {requestKey: dto.requestKey}});
      if (existing) {
        if (existing.reportedBy !== req.actor.id || existing.type !== dto.type || existing.description !== dto.description || existing.location !== dto.location || existing.latitude !== (dto.latitude ?? null) || existing.longitude !== (dto.longitude ?? null)) throw new ConflictException('Request key already used for a different report');
        return existing;
      }
      const supervisorId = await assignedSupervisor(tx, req.actor.id);
      const result = await tx.incident.create({data: {...dto, reportedBy: req.actor.id, supervisorId}});
      await tx.auditEvent.create({data: {actorId: req.actor.id, action: 'INCIDENT_REPORTED', entityType: 'Incident', entityId: result.id}});
      return result;
    });
  }
  @Patch('incidents/:id') @Roles('SUPERVISOR')
  reviewIncident(@Req() req: StaffRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: IncidentReviewDto) {
    return serial(this.db, async tx => {
      const record = await tx.incident.findFirst({where: {id, supervisorId: req.actor.id}});
      if (!record) throw new NotFoundException('Incident not found');
      if (!(record.status === 'OPEN' && ['IN_PROGRESS', 'CANCELLED'].includes(dto.status) || record.status === 'IN_PROGRESS' && ['RESOLVED', 'CANCELLED'].includes(dto.status))) throw new ConflictException('Invalid incident transition');
      const result = await tx.incident.update({where: {id}, data: {status: dto.status, resolutionNotes: dto.notes}});
      await tx.auditEvent.create({data: {actorId: req.actor.id, action: 'INCIDENT_REVIEWED', entityType: 'Incident', entityId: id, safeMetadata: {from: record.status, to: dto.status}}});
      return result;
    });
  }
  @Get('checkpoints') @Roles('OFFICER', 'SUPERVISOR')
  async checkpoints(@Query() query: SearchQuery) {
    const where = query.q ? {name: {contains: query.q, mode: 'insensitive' as const}} : {};
    const [items, total] = await this.db.$transaction([
      this.db.checkpoint.findMany({where, orderBy: [{startAt: 'desc'}, {id: 'desc'}], skip: (query.page - 1) * query.pageSize, take: query.pageSize}),
      this.db.checkpoint.count({where}),
    ]);
    return {items, total, page: query.page, pageSize: query.pageSize};
  }
  @Post('checkpoints') @Roles('SUPERVISOR')
  createCheckpoint(@Req() req: StaffRequest, @Body() dto: CheckpointDto) {
    if (new Date(dto.endAt) <= new Date(dto.startAt)) throw new BadRequestException('End time must follow start time');
    return serial(this.db, async tx => {
      const result = await tx.checkpoint.create({data: {...dto, startAt: new Date(dto.startAt), endAt: new Date(dto.endAt), createdBy: req.actor.id}});
      await tx.auditEvent.create({data: {actorId: req.actor.id, action: 'CHECKPOINT_CREATED', entityType: 'Checkpoint', entityId: result.id}});
      return result;
    });
  }
  @Patch('checkpoints/:id') @Roles('SUPERVISOR')
  checkpointStatus(@Req() req: StaffRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CheckpointReviewDto) {
    return serial(this.db, async tx => {
      const record = await tx.checkpoint.findFirst({where: {id, createdBy: req.actor.id}});
      if (!record) throw new NotFoundException('Checkpoint not found');
      if (!(record.status === 'PLANNED' && ['ACTIVE', 'CLOSED'].includes(dto.status) || record.status === 'ACTIVE' && dto.status === 'CLOSED')) throw new ConflictException('Invalid checkpoint transition');
      if (dto.status === 'ACTIVE' && (new Date() < record.startAt || new Date() >= record.endAt)) throw new ConflictException('Activate only within the scheduled period');
      const result = await tx.checkpoint.update({where: {id}, data: {status: dto.status}});
      await tx.auditEvent.create({data: {actorId: req.actor.id, action: 'CHECKPOINT_UPDATED', entityType: 'Checkpoint', entityId: id, safeMetadata: {from: record.status, to: dto.status}}});
      return result;
    });
  }
  @Get('analytics/overview') @Roles('SUPERVISOR')
  async overview(@Req() req: StaffRequest) {
    const now = new Date();
    const since = new Date(now); since.setUTCHours(0, 0, 0, 0); since.setUTCDate(since.getUTCDate() - 6);
    const [openIncidents, submittedOffences, activeCheckpoints, tickets, trend, officers] = await Promise.all([
      this.db.incident.count({where: {supervisorId: req.actor.id, status: {in: ['OPEN', 'IN_PROGRESS']}}}),
      this.db.offence.count({where: {supervisorId: req.actor.id, status: {in: ['SUBMITTED', 'UNDER_REVIEW']}}}),
      this.db.checkpoint.count({where: {status: 'ACTIVE', startAt: {lte: now}, endAt: {gt: now}}}),
      this.db.ticket.groupBy({by: ['status'], where: {offence: {supervisorId: req.actor.id}}, _count: {_all: true}}),
      this.db.$queryRaw<{day: Date; count: bigint}[]>`SELECT date_trunc('day', "createdAt") AS day, count(*) AS count FROM "Offence" WHERE "supervisorId" = ${req.actor.id}::uuid AND "status" != 'DRAFT' AND "createdAt" >= ${since} GROUP BY day ORDER BY day`,
      this.db.user.findMany({where: {role: 'OFFICER', supervisorId: req.actor.id}, select: {id: true, name: true, active: true, _count: {select: {offences: {where: {supervisorId: req.actor.id, status: {not: 'DRAFT'}}}, incidents: {where: {supervisorId: req.actor.id}}}}}, orderBy: {name: 'asc'}}),
    ]);
    return {demo: true, openIncidents, submittedOffences, activeCheckpoints, tickets: tickets.map(row => ({status: row.status, count: row._count._all})), trend: Array.from({length: 7}, (_, index) => {const day = new Date(since); day.setUTCDate(day.getUTCDate() + index); return {day: day.toISOString().slice(0, 10), count: Number(trend.find(row => row.day.getTime() === day.getTime())?.count ?? 0)};}), officers};
  }
}
