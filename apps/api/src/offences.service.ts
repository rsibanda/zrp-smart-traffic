import { offenceLines } from './offence-lines';
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
  charges: {
    include: { category: true },
    orderBy: { categoryId: 'asc' as const },
  },
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

  private selection(dto: { categoryId?: string; categoryIds?: string[] }) {
    if (dto.categoryId != null && dto.categoryIds != null)
      throw new BadRequestException('Send categoryId or categoryIds, not both');
    const ids = dto.categoryIds ?? (dto.categoryId ? [dto.categoryId] : []);
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 100 ||
      new Set(ids).size !== ids.length
    )
      throw new BadRequestException(
        'Select one or more distinct offence categories',
      );
    const normalised = ids.map((id) => id.toLowerCase());
    if (new Set(normalised).size !== normalised.length)
      throw new BadRequestException('Duplicate offence category');
    return normalised.sort();
  }

  async create(actor: Actor, dto: CreateOffenceDto) {
    const categoryIds = this.selection(dto);
    const fields = { ...dto };
    delete fields.categoryId;
    delete fields.categoryIds;
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
          JSON.stringify(
            (existing.charges.length
              ? existing.charges.map((c) => c.categoryId)
              : [existing.categoryId]
            ).sort(),
          ) !== JSON.stringify(categoryIds) ||
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
      const categories = await tx.offenceCategory.findMany({
        where: { id: { in: categoryIds }, active: true },
      });
      if (!vehicle || categories.length !== categoryIds.length)
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
          ...fields,
          categoryId: categoryIds[0],
          charges: {
            create: categoryIds.map((categoryId) => ({ categoryId })),
          },
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
      if (offence.ticket)
        return { ...offence.ticket, offences: offenceLines(offence) };
      if (offence.status !== 'DRAFT')
        throw new ConflictException('Only drafts can be submitted');
      const categories = offence.charges.length
        ? offence.charges.map((charge) => charge.category)
        : [offence.category];
      if (categories.some((category) => !category.active))
        throw new ConflictException(
          'Choose an active offence category before submitting',
        );
      const responsible = offence.responsibleDriverId
        ? await tx.driver.findUnique({
            where: { id: offence.responsibleDriverId },
          })
        : null;
      // Freeze each component at issuance, alongside the existing ticket totals.
      for (const category of categories)
        await tx.offenceCharge.upsert({
          where: {
            offenceId_categoryId: { offenceId: id, categoryId: category.id },
          },
          create: {
            offenceId: id,
            categoryId: category.id,
            nameSnapshot: category.name,
            fineSnapshot: category.demoFineAmount,
            pointsSnapshot: category.demeritPoints,
          },
          update: {
            nameSnapshot: category.name,
            fineSnapshot: category.demoFineAmount,
            pointsSnapshot: category.demeritPoints,
          },
        });
      const ticket = await tx.ticket.create({
        data: {
          offenceId: id,
          publicReference: randomBytes(24).toString('hex'),
          demoFineAmountSnapshot: categories.reduce(
            (sum, c) => sum.plus(c.demoFineAmount),
            new Prisma.Decimal(0),
          ),
          motoristId: responsible?.motoristId ?? offence.vehicle.motoristId,
          demeritPointsSnapshot: categories.reduce(
            (sum, c) => sum + c.demeritPoints,
            0,
          ),
          pointsAssessment: offence.responsibleDriverId
            ? 'ASSESSED'
            : 'PENDING_DRIVER_IDENTIFICATION',
          dueAt: new Date(
            Date.now() +
              Math.min(...categories.map((c) => c.paymentDueDays)) * 86400000,
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
      return {
        ...ticket,
        offences: categories.map((c) => ({
          categoryId: c.id,
          name: c.name,
          fine: c.demoFineAmount.toString(),
          points: c.demeritPoints,
        })),
      };
    });
  }

  async update(actor: Actor, id: string, dto: UpdateOffenceDto) {
    const { revision, ...changes } = dto;
    delete changes.categoryId;
    delete changes.categoryIds;
    const selectionChanged = 'categoryId' in dto || 'categoryIds' in dto;
    const selectedIds = selectionChanged ? this.selection(dto) : undefined;
    if ('responsibleDriverId' in changes)
      throw new BadRequestException(
        'Responsible driver is fixed for this draft. Discard it and create a corrected draft.',
      );
    if (!Object.keys(changes).length && !selectionChanged)
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
        selectedIds &&
        (await tx.offenceCategory.count({
          where: { id: { in: selectedIds }, active: true },
        })) !== selectedIds.length
      )
        throw new BadRequestException('Unknown or inactive category');
      const result = await tx.offence.update({
        where: { id },
        data: {
          ...changes,
          ...(selectedIds
            ? {
                categoryId: selectedIds[0],
                charges: {
                  deleteMany: {},
                  create: selectedIds.map((categoryId) => ({ categoryId })),
                },
              }
            : {}),
          revision: { increment: 1 },
        },
        include: details,
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: 'DRAFT_UPDATED',
          entityType: 'Offence',
          entityId: id,
          safeMetadata: {
            fields: [
              ...Object.keys(changes),
              ...(selectionChanged ? ['categoryIds'] : []),
            ],
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
