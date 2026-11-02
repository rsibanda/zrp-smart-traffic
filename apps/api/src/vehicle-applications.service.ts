import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/client';
import { Actor } from './auth';
import { PageQuery } from './dto';
import { PrismaService } from './prisma.service';
import { serial } from './transactions';
import {
  ApplicationDto,
  ApplicationFeeDto,
  ApplicationReviewDto,
  ApplicationSubmitDto,
  VehicleCategoryDto,
} from './vehicle-application.dto';
import {
  reference,
  SimulatedPaymentProvider,
  SimulationOutcome,
} from './payments.service';

export const applicationFiles = {
  id: true,
  kind: true,
  mimeType: true,
  byteSize: true,
  createdAt: true,
} as const;
const include = {
  request: {
    select: {
      registration: true,
      status: true,
      submittedAt: true,
      reviewedAt: true,
      reviewNote: true,
      motoristId: true,
      motorist: { select: { name: true, email: true } },
    },
  },
  category: true,
  files: { select: applicationFiles, orderBy: { createdAt: 'asc' as const } },
  decisions: {
    select: {
      status: true,
      reason: true,
      createdAt: true,
      reviewer: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  payments: { orderBy: { createdAt: 'desc' as const }, take: 25 },
} as const;
type Application = Prisma.VehicleApplicationGetPayload<{
  include: typeof include;
}>;
function view(row: Application, staff: boolean) {
  const { request, ...data } = row;
  return {
    ...data,
    requestKey: undefined,
    registration: request.registration,
    status: request.status,
    submittedAt: request.submittedAt,
    reviewedAt: request.reviewedAt,
    reviewNote: request.reviewNote,
    ...(staff ? { applicant: request.motorist } : {}),
    notice: 'Academic Prototype — No real payments or enforcement',
  };
}
export const applicationScope = (
  actor: Actor,
): Prisma.VehicleApplicationWhereInput =>
  actor.role === 'USER'
    ? { request: { motoristId: actor.id } }
    : actor.role === 'SUPERVISOR'
      ? { request: { status: { not: 'DRAFT' } } }
      : { requestId: '00000000-0000-0000-0000-000000000000' };
export function ensureEditable(status: string) {
  if (!['DRAFT', 'CHANGES_REQUESTED'].includes(status))
    throw new ConflictException(
      'Only drafts and applications awaiting changes can be edited.',
    );
}

@Injectable()
export class VehicleApplicationsService {
  constructor(private readonly db: PrismaService) {}
  categories(admin = false) {
    return this.db.vehicleCategory.findMany({
      where: admin ? {} : { active: true },
      orderBy: { label: 'asc' },
    });
  }
  category(actor: Actor, dto: VehicleCategoryDto, id?: string) {
    return serial(this.db, async (tx) => {
      const data = { ...dto, currency: 'USD' };
      const row = id
        ? await tx.vehicleCategory.update({ where: { id }, data })
        : await tx.vehicleCategory.create({ data });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: 'VEHICLE_CATEGORY_CONFIGURED',
          entityType: 'VehicleCategory',
          entityId: row.id,
          safeMetadata: { feeMinor: row.feeMinor, active: row.active },
        },
      });
      return row;
    });
  }
  async list(actor: Actor, q: PageQuery) {
    const where = applicationScope(actor);
    const [items, total] = await this.db.$transaction([
      this.db.vehicleApplication.findMany({
        where,
        include,
        take: q.pageSize,
        skip: (q.page - 1) * q.pageSize,
        orderBy: { updatedAt: 'desc' },
      }),
      this.db.vehicleApplication.count({ where }),
    ]);
    return {
      items: items.map((row) => view(row, actor.role === 'SUPERVISOR')),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  async detail(actor: Actor, id: string) {
    const row = await this.db.vehicleApplication.findFirst({
      where: { AND: [{ requestId: id }, applicationScope(actor)] },
      include,
    });
    if (!row) throw new NotFoundException('Application not found');
    const result = view(row, actor.role === 'SUPERVISOR');
    if (actor.role !== 'SUPERVISOR') return result;
    const vehicle = await this.db.vehicle.findUnique({
      where: { registrationNumber: row.request.registration },
      select: { motoristId: true },
    });
    await this.db.auditEvent.create({
      data: {
        actorId: actor.id,
        action: 'VEHICLE_APPLICATION_VIEWED',
        entityType: 'VehicleApplication',
        entityId: id,
      },
    });
    return {
      ...result,
      linkedToAnotherMotorist:
        !!vehicle?.motoristId && vehicle.motoristId !== row.request.motoristId,
    };
  }
  async save(actor: Actor, dto: ApplicationDto, id?: string) {
    const { registration, revision, requestKey, categoryId, ...fields } = dto;
    const details = { ...fields, category: { connect: { id: categoryId } } };
    return serial(this.db, async (tx) => {
      const existing = await tx.vehicleApplication.findUnique({
        where: id ? { requestId: id } : { requestKey },
        include,
      });
      if (existing && existing.request.motoristId !== actor.id)
        throw new NotFoundException('Application not found');
      if (id && !existing) throw new NotFoundException('Application not found');
      if (!id && existing) return view(existing, false);
      if (existing) {
        ensureEditable(existing.request.status);
        if (existing.revision !== revision)
          throw new ConflictException(
            'Application changed. Refresh before saving.',
          );
        if (
          existing.categoryId !== dto.categoryId &&
          existing.request.status === 'CHANGES_REQUESTED'
        )
          throw new ConflictException(
            'The submitted category and fee snapshot cannot be changed. Start a new application.',
          );
      }
      const category = await tx.vehicleCategory.findFirst({
        where: { id: dto.categoryId, active: true },
      });
      if (!category)
        throw new BadRequestException('Select an active vehicle category.');
      if (
        await tx.vehicleLinkRequest.findFirst({
          where: {
            motoristId: actor.id,
            registration,
            id: { not: id },
            status: {
              in: ['DRAFT', 'PENDING_REVIEW', 'CHANGES_REQUESTED', 'PENDING'],
            },
          },
        })
      )
        throw new ConflictException(
          'You already have an open request for this registration.',
        );
      const result = existing
        ? await tx.vehicleApplication.update({
            where: { requestId: id },
            data: {
              ...details,
              revision: { increment: 1 },
              ...(existing.request.status === 'DRAFT'
                ? { feeMinor: category.feeMinor }
                : {}),
              request: { update: { registration } },
            },
            include,
          })
        : await tx.vehicleApplication.create({
            data: {
              ...details,
              requestKey,
              feeMinor: category.feeMinor,
              request: {
                create: {
                  motoristId: actor.id,
                  registration,
                  kind: 'APPLICATION' as const,
                  status: 'DRAFT' as const,
                },
              },
            },
            include,
          });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: 'VEHICLE_APPLICATION_SAVED',
          entityType: 'VehicleApplication',
          entityId: result.requestId,
        },
      });
      return view(result, false);
    });
  }
  async submit(actor: Actor, id: string, dto: ApplicationSubmitDto) {
    return serial(this.db, async (tx) => {
      const row = await tx.vehicleApplication.findFirst({
        where: { requestId: id, request: { motoristId: actor.id } },
        include,
      });
      if (!row) throw new NotFoundException('Application not found');
      if (row.request.status === 'PENDING_REVIEW') return view(row, false);
      ensureEditable(row.request.status);
      if (row.revision !== dto.revision)
        throw new ConflictException(
          'Application changed. Refresh before submitting.',
        );
      if (!row.category.active)
        throw new ConflictException(
          'This category is no longer accepting applications.',
        );
      for (const kind of ['OWNERSHIP', 'FRONT', 'REAR_PLATE'])
        if (!row.files.some((f) => f.kind === kind))
          throw new BadRequestException(
            `Attach the required ${kind.toLowerCase().replace('_', ' ')} file before submitting.`,
          );
      const result = await tx.vehicleApplication.update({
        where: { requestId: id },
        data: {
          declaration: true,
          revision: { increment: 1 },
          request: {
            update: { status: 'PENDING_REVIEW', submittedAt: new Date() },
          },
        },
        include,
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: 'VEHICLE_APPLICATION_SUBMITTED',
          entityType: 'VehicleApplication',
          entityId: id,
        },
      });
      return view(result, false);
    });
  }
  async review(actor: Actor, id: string, dto: ApplicationReviewDto) {
    return serial(this.db, async (tx) => {
      const row = await tx.vehicleApplication.findUnique({
        where: { requestId: id },
        include,
      });
      if (!row || row.request.status === 'DRAFT')
        throw new NotFoundException('Application not found');
      if (
        row.request.status !== 'PENDING_REVIEW' ||
        row.revision !== dto.revision
      )
        throw new ConflictException(
          'Application changed or was reviewed. Refresh before deciding.',
        );
      if (dto.status === 'APPROVED') {
        const applicant = await tx.user.findFirst({
          where: { id: row.request.motoristId, role: 'USER', active: true },
        });
        if (!applicant)
          throw new ConflictException(
            'An active motorist account is required.',
          );
        const vehicle = await tx.vehicle.findUnique({
          where: { registrationNumber: row.request.registration },
        });
        if (vehicle?.motoristId && vehicle.motoristId !== applicant.id)
          throw new ConflictException(
            'Vehicle is linked to another account. Resolve ownership through a separate verified transfer.',
          );
        // Preserve existing vehicle facts and every historical ticket snapshot.
        const linked = vehicle
          ? await tx.vehicle.update({
              where: { id: vehicle.id },
              data: { motoristId: applicant.id, linkVerifiedAt: new Date() },
            })
          : await tx.vehicle.create({
              data: {
                registrationNumber: row.request.registration,
                make: row.make,
                model: row.model,
                colour: row.colour,
                registrationStatus: 'VERIFIED',
                motoristId: applicant.id,
                linkVerifiedAt: new Date(),
              },
            });
        await tx.auditEvent.create({
          data: {
            actorId: actor.id,
            action: 'VEHICLE_MOTORIST_LINKED',
            entityType: 'Vehicle',
            entityId: linked.id,
            safeMetadata: { requestId: id },
          },
        });
      }
      const result = await tx.vehicleApplication.update({
        where: { requestId: id },
        data: {
          revision: { increment: 1 },
          request: {
            update: {
              status: dto.status,
              reviewedAt: new Date(),
              reviewedBy: actor.id,
              reviewNote: dto.reason,
            },
          },
          decisions: {
            create: {
              status: dto.status,
              reason: dto.reason,
              reviewerId: actor.id,
            },
          },
        },
        include,
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: `VEHICLE_APPLICATION_${dto.status}`,
          entityType: 'VehicleApplication',
          entityId: id,
        },
      });
      return view(result, true);
    });
  }
  fee(actor: Actor, id: string, dto: ApplicationFeeDto) {
    return serial(this.db, async (tx) => {
      const app = await tx.vehicleApplication.findFirst({
        where: { requestId: id, request: { motoristId: actor.id } },
      });
      if (!app) throw new NotFoundException('Application not found');
      const request = await tx.vehicleLinkRequest.findUniqueOrThrow({
        where: { id },
      });
      if (['DRAFT', 'REJECTED'].includes(request.status))
        throw new ConflictException(
          'Submit the application before simulating its fee.',
        );
      const existing = await tx.vehicleApplicationPayment.findUnique({
        where: { requestKey: dto.requestKey },
      });
      if (existing) {
        if (existing.applicationId !== id || existing.method !== dto.method)
          throw new ConflictException('Request key already used.');
        return existing;
      }
      if (
        await tx.vehicleApplicationPayment.findFirst({
          where: {
            applicationId: id,
            status: { in: ['SUCCESS', 'PROCESSING'] },
          },
        })
      )
        throw new ConflictException(
          'A fee payment already exists or is processing.',
        );
      const payment = await tx.vehicleApplicationPayment.create({
        data: {
          applicationId: id,
          requestKey: dto.requestKey,
          method: dto.method,
          reference: reference('APP-PAY'),
          feeMinor: app.feeMinor,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: 'APPLICATION_FEE_STARTED',
          entityType: 'VehicleApplication',
          entityId: id,
        },
      });
      return payment;
    });
  }
  outcome(actor: Actor, paymentReference: string, outcome: SimulationOutcome) {
    return serial(this.db, async (tx) => {
      const payment = await tx.vehicleApplicationPayment.findFirst({
        where: {
          reference: paymentReference,
          application: { request: { motoristId: actor.id } },
        },
      });
      if (!payment) throw new NotFoundException('Payment not found');
      if (payment.status !== 'PROCESSING') return payment;
      const status = new SimulatedPaymentProvider().resolve(outcome);
      const result = await tx.vehicleApplicationPayment.update({
        where: { id: payment.id },
        data: {
          status,
          ...(status === 'SUCCESS'
            ? { paidAt: new Date(), receiptReference: reference('APP-RCPT') }
            : {}),
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.id,
          action: `APPLICATION_FEE_${status}`,
          entityType: 'VehicleApplication',
          entityId: payment.applicationId,
        },
      });
      return result;
    });
  }
}
