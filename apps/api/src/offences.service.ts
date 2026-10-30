import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OffenceStatus, Prisma } from '../generated/client';
import { randomBytes } from 'crypto';
import { Actor } from './auth';
import {
  CreateOffenceDto,
  OffenceQuery,
  ReviewDto,
  UpdateOffenceDto,
} from './dto';
import { PrismaService } from './prisma.service';
import { assignedSupervisor } from './operations.controller';
import { effectivePaymentStatus } from './payments.service';
import { issuePoints, reversePoints } from './driver-points';

export function scope(actor: Actor): Prisma.OffenceWhereInput {
  if (actor.role === 'OFFICER') return { officerId: actor.id };
  if (actor.role === 'SUPERVISOR')
    return { supervisorId: actor.id, status: { not: 'DRAFT' } };
  // Admins manage configuration/audit; they do not receive operational record access.
  return { id: '00000000-0000-0000-0000-000000000000' };
}
export function canTransition(from: OffenceStatus, to: OffenceStatus) {
  return (
    (from === 'SUBMITTED' && to === 'UNDER_REVIEW') ||
    (from === 'UNDER_REVIEW' && (to === 'CONFIRMED' || to === 'CANCELLED'))
  );
}
const details = {
  officer: { select: { name: true } },
  vehicle: true,
  category: true,
  ticket: {
    include: {
      motorist: { select: { name: true } },
      publicAccess: { select: { paidAt: true, receiptReference: true } },
      payments: {
        select: { method: true, status: true, paidAt: true },
        orderBy: { createdAt: 'desc' as const },
        take: 1,
      },
    },
  },
} as const;

@Injectable()
export class OffencesService {
  constructor(private readonly db: PrismaService) {}

  private async transaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2034', 'P2002'].includes(error.code)
        ) {
          if (attempt < 3) continue;
          throw new ConflictException(
            'Concurrent change; retry with the same request key',
          );
        }
        throw error;
      }
    }
  }

  async create(actor: Actor, dto: CreateOffenceDto) {
    if ((dto.latitude == null) !== (dto.longitude == null))
      throw new BadRequestException('Provide both coordinates or neither');
    if (new Date(dto.observedAt).getTime() > Date.now() + 60000)
      throw new BadRequestException('Observation cannot be in the future');
    return this.transaction(async (tx) => {
      const existing = await tx.offence.findUnique({
        where: { requestKey: dto.requestKey },
        include: details,
      });
      if (existing) {
        if (
          existing.officerId !== actor.id ||
          existing.vehicleId !== dto.vehicleId ||
          existing.categoryId !== dto.categoryId ||
          existing.responsibleDriverId !== (dto.responsibleDriverId ?? null) ||
          existing.notes !== dto.notes ||
          existing.location !== dto.location ||
          existing.observedAt.getTime() !==
            new Date(dto.observedAt).getTime() ||
          existing.latitude !== (dto.latitude ?? null) ||
          existing.longitude !== (dto.longitude ?? null)
        ) {
          throw new ConflictException(
            'Request key already used for a different draft',
          );
        }
        return existing;
      }
      const vehicle = await tx.vehicle.findUnique({
        where: { id: dto.vehicleId },
      });
      const category = await tx.offenceCategory.findFirst({
        where: { id: dto.categoryId, active: true },
      });
      if (!vehicle || !category)
        throw new BadRequestException('Unknown vehicle or inactive category');
      const supervisorId = await assignedSupervisor(tx, actor.id);
      if (
        dto.responsibleDriverId &&
        !(await tx.driver.findFirst({
          where: {
            id: dto.responsibleDriverId,
            identityVerifiedAt: { not: null },
            motorist: { active: true, role: 'USER' },
            pointsAccount: { isNot: null },
          },
        }))
      )
        throw new BadRequestException(
          'The responsible driver must have a verified account identity. Leave identification pending if unknown.',
        );
      const offence = await tx.offence.create({
        data: {
          ...dto,
          driverConfirmedAt: dto.responsibleDriverId ? new Date() : null,
          observedAt: new Date(dto.observedAt),
          officerId: actor.id,
          supervisorId,
        },
        include: details,
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: 'DRAFT_CREATED',
          entityType: 'Offence',
          entityId: offence.id,
        },
      });
      return offence;
    });
  }

  async list(actor: Actor, query: OffenceQuery) {
    const where: Prisma.OffenceWhereInput = {
      AND: [
        scope(actor),
        query.status ? { status: query.status } : {},
        query.paymentStatus === 'PAID'
          ? { ticket: { publicAccess: { paidAt: { not: null } } } }
          : {},
        query.paymentStatus === 'OVERDUE'
          ? {
              ticket: {
                status: 'ISSUED',
                dueAt: { lt: new Date() },
                OR: [
                  { publicAccess: null },
                  { publicAccess: { paidAt: null } },
                ],
              },
            }
          : {},
        query.paymentStatus === 'PENDING'
          ? {
              ticket: {
                status: 'ISSUED',
                AND: [
                  { OR: [{ dueAt: null }, { dueAt: { gte: new Date() } }] },
                  {
                    OR: [
                      { publicAccess: null },
                      { publicAccess: { paidAt: null } },
                    ],
                  },
                ],
              },
            }
          : {},
        query.paymentStatus === 'FAILED'
          ? {
              ticket: {
                payments: { some: { status: { in: ['FAILED', 'TIMED_OUT'] } } },
                OR: [
                  { publicAccess: null },
                  { publicAccess: { paidAt: null } },
                ],
              },
            }
          : {},
        query.q
          ? {
              OR: [
                { location: { contains: query.q, mode: 'insensitive' } },
                {
                  vehicle: {
                    registrationNumber: {
                      contains: query.q,
                      mode: 'insensitive',
                    },
                  },
                },
                {
                  ticket: {
                    OR: [
                      {
                        publicReference: {
                          contains: query.q,
                          mode: 'insensitive',
                        },
                      },
                      {
                        displayReference: {
                          contains: query.q,
                          mode: 'insensitive',
                        },
                      },
                    ],
                  },
                },
              ],
            }
          : {},
      ],
    };
    const [items, total] = await this.db.$transaction([
      this.db.offence.findMany({
        where,
        include: details,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.offence.count({ where }),
    ]);
    return {
      items: items.map((item) => ({
        ...item,
        paymentStatus: item.ticket ? effectivePaymentStatus(item.ticket) : null,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(actor: Actor, id: string) {
    const offence = await this.db.offence.findFirst({
      where: { AND: [{ id }, scope(actor)] },
      include: details,
    });
    if (!offence) throw new NotFoundException('Record not found');
    return {
      ...offence,
      paymentStatus: offence.ticket
        ? effectivePaymentStatus(offence.ticket)
        : null,
    };
  }

  async submit(actor: Actor, id: string) {
    return this.transaction(async (tx) => {
      const offence = await tx.offence.findFirst({
        where: { id, officerId: actor.id },
        include: details,
      });
      if (!offence) throw new NotFoundException('Record not found');
      if (offence.ticket) return offence.ticket;
      if (offence.status !== 'DRAFT')
        throw new ConflictException('Only drafts can be submitted');
      if (!offence.category.active)
        throw new ConflictException(
          'Choose an active offence category before submitting',
        );
      const responsible = offence.responsibleDriverId
        ? await tx.driver.findUnique({
            where: { id: offence.responsibleDriverId },
          })
        : null;
      const ticket = await tx.ticket.create({
        data: {
          offenceId: id,
          publicReference: randomBytes(24).toString('hex'),
          demoFineAmountSnapshot: offence.category.demoFineAmount,
          motoristId: responsible?.motoristId ?? offence.vehicle.motoristId,
          demeritPointsSnapshot: offence.category.demeritPoints,
          pointsAssessment: offence.responsibleDriverId
            ? 'ASSESSED'
            : 'PENDING_DRIVER_IDENTIFICATION',
          dueAt: new Date(
            Date.now() + offence.category.paymentDueDays * 86400000,
          ),
        },
      });
      await tx.offence.update({ where: { id }, data: { status: 'SUBMITTED' } });
      await issuePoints(tx, ticket, offence.responsibleDriverId, actor.id);
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: 'TICKET_ISSUED',
          entityType: 'Offence',
          entityId: id,
        },
      });
      return ticket;
    });
  }

  async update(actor: Actor, id: string, dto: UpdateOffenceDto) {
    const { revision, ...changes } = dto;
    if ('responsibleDriverId' in changes)
      throw new BadRequestException(
        'Responsible driver is fixed for this draft. Discard it and create a corrected draft.',
      );
    if (!Object.keys(changes).length)
      throw new BadRequestException('Provide a draft change');
    if (
      Object.entries(changes).some(
        ([key, value]) =>
          value === null && !['latitude', 'longitude'].includes(key),
      )
    )
      throw new BadRequestException('Required draft fields cannot be null');
    if (
      'latitude' in changes !== 'longitude' in changes ||
      (changes.latitude == null) !== (changes.longitude == null)
    )
      throw new BadRequestException('Provide both coordinates or neither');
    if (
      changes.observedAt &&
      new Date(changes.observedAt).getTime() > Date.now() + 60000
    )
      throw new BadRequestException('Observation cannot be in the future');
    return this.transaction(async (tx) => {
      const draft = await tx.offence.findFirst({
        where: { id, officerId: actor.id },
      });
      if (!draft) throw new NotFoundException('Record not found');
      if (draft.status !== 'DRAFT' || draft.revision !== revision)
        throw new ConflictException(
          'Draft changed or was submitted. Refresh before editing.',
        );
      if (
        changes.categoryId &&
        !(await tx.offenceCategory.findFirst({
          where: { id: changes.categoryId, active: true },
        }))
      )
        throw new BadRequestException('Unknown or inactive category');
      const result = await tx.offence.update({
        where: { id },
        data: { ...changes, revision: { increment: 1 } },
        include: details,
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: 'DRAFT_UPDATED',
          entityType: 'Offence',
          entityId: id,
          safeMetadata: {
            fields: Object.keys(changes),
            revision: result.revision,
          },
        },
      });
      return result;
    });
  }

  async discard(actor: Actor, id: string) {
    return this.transaction(async (tx) => {
      const draft = await tx.offence.findFirst({
        where: { id, officerId: actor.id },
      });
      if (!draft) throw new NotFoundException('Record not found');
      if (
        draft.status === 'CANCELLED' &&
        !(await tx.ticket.findUnique({ where: { offenceId: id } }))
      )
        return draft;
      if (draft.status !== 'DRAFT')
        throw new ConflictException('Only drafts can be discarded');
      const result = await tx.offence.update({
        where: { id },
        data: { status: 'CANCELLED', revision: { increment: 1 } },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: 'DRAFT_DISCARDED',
          entityType: 'Offence',
          entityId: id,
        },
      });
      return result;
    });
  }

  async review(actor: Actor, id: string, dto: ReviewDto) {
    return this.transaction(async (tx) => {
      const offence = await tx.offence.findFirst({
        where: { AND: [{ id }, scope(actor)] },
      });
      if (!offence) throw new NotFoundException('Record not found');
      if (!canTransition(offence.status, dto.status))
        throw new ConflictException('Invalid review transition');
      const result = await tx.offence.update({
        where: { id },
        data: {
          status: dto.status,
          reviewNotes: dto.notes,
          reviewedAt: new Date(),
        },
        include: details,
      });
      if (dto.status === 'CANCELLED') {
        await tx.ticket.update({
          where: { offenceId: id },
          data: { status: 'CANCELLED' },
        });
        if (result.ticket) await reversePoints(tx, result.ticket.id, actor.id);
      }
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: 'OFFENCE_REVIEWED',
          entityType: 'Offence',
          entityId: id,
          safeMetadata: { from: offence.status, to: dto.status },
        },
      });
      return {
        ...result,
        ticket:
          result.ticket && dto.status === 'CANCELLED'
            ? { ...result.ticket, status: 'CANCELLED' }
            : result.ticket,
      };
    });
  }
}
