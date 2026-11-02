import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '../generated/client';
import { OffencesService } from './offences.service';
import { PrismaService } from './prisma.service';
import { CreateOffenceDto } from './dto';

const actor = { id: 'officer', name: '', email: '', role: 'OFFICER' as const };
const categories = [
  {
    id: 'a',
    name: 'Speeding',
    demoFineAmount: new Prisma.Decimal('50.10'),
    demeritPoints: 3,
    paymentDueDays: 30,
    active: true,
  },
  {
    id: 'b',
    name: 'Parking',
    demoFineAmount: new Prisma.Decimal('25.20'),
    demeritPoints: 0,
    paymentDueDays: 30,
    active: true,
  },
];
function fixture(driverId: string | null = null) {
  const draft = {
    id: 'draft',
    categoryId: 'a',
    category: categories[0],
    status: 'DRAFT',
    revision: 0,
    responsibleDriverId: driverId,
    vehicle: { motoristId: 'owner' },
    ticket: null as Record<string, unknown> | null,
    charges: categories.map((category) => ({
      categoryId: category.id,
      category,
    })),
  };
  const tx = {
    offence: {
      findFirst: jest.fn(async () => draft),
      findUnique: jest.fn(async () => null as unknown),
      create: jest.fn(
        async (args: {
          data: {
            categoryId: string;
            charges: { create: Array<{ categoryId: string }> };
          };
        }) => args.data,
      ),
      update: jest.fn(async () => draft),
    },
    offenceCategory: {
      findMany: jest.fn(async () => categories),
      count: jest.fn(async () => categories.length),
    },
    offenceCharge: {
      upsert: jest.fn(
        async ({
          update,
          where,
        }: {
          update: object;
          where: { offenceId_categoryId: { categoryId: string } };
        }) => {
          Object.assign(
            draft.charges.find(
              (c) => c.categoryId === where.offenceId_categoryId.categoryId,
            )!,
            update,
          );
        },
      ),
    },
    vehicle: { findUnique: jest.fn(async () => ({ id: 'vehicle' })) },
    user: {
      findUniqueOrThrow: jest.fn(async () => ({ supervisorId: 'supervisor' })),
      findFirst: jest.fn(async () => ({ id: 'supervisor' })),
    },
    driver: {
      findUnique: jest.fn(async () => ({
        motoristId: 'driver-account',
        identityVerifiedAt: new Date(),
        pointsAccount: {},
        motorist: { active: true, role: 'USER' },
      })),
    },
    driverPointsLedger: { create: jest.fn() },
    ticket: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        draft.ticket = { id: 'ticket', ...data };
        return draft.ticket;
      }),
    },
    auditEvent: { create: jest.fn() },
  };
  const db = { $transaction: async (fn: (tx: unknown) => unknown) => fn(tx) };
  return {
    service: new OffencesService(db as unknown as PrismaService),
    tx,
    draft,
  };
}
const dto = {
  requestKey: 'key',
  vehicleId: 'vehicle',
  categoryIds: ['b', 'a'],
  notes: '',
  location: 'Test location',
  observedAt: new Date().toISOString(),
};

describe('Multiple offences on one infringement', () => {
  it('creates one draft containing every selected category', async () => {
    const { service, tx } = fixture();
    await service.create(actor, dto);
    expect(tx.offence.create).toHaveBeenCalledTimes(1);
    expect(tx.offence.create.mock.calls[0][0].data).toMatchObject({
      categoryId: 'a',
      charges: { create: [{ categoryId: 'a' }, { categoryId: 'b' }] },
    });
  });
  it.each([{ ids: [] }, { ids: ['a', 'a'] }, { ids: ['a', 'A'] }])(
    'rejects empty or duplicate selections $ids',
    async ({ ids }) => {
      const { service, tx } = fixture();
      await expect(
        service.create(actor, { ...dto, categoryIds: ids }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.offence.create).not.toHaveBeenCalled();
    },
  );
  it('rejects missing, conflicting, unknown and inactive selections', async () => {
    const { service, tx } = fixture();
    await expect(
      service.create(actor, { ...dto, categoryIds: undefined }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(actor, { ...dto, categoryId: 'a' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    tx.offenceCategory.findMany.mockResolvedValueOnce([categories[0]]);
    await expect(service.create(actor, dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
  it('retries the same category set regardless of order and rejects changed selections', async () => {
    const { service, tx, draft } = fixture();
    tx.offence.findUnique.mockResolvedValue({
      ...draft,
      officerId: actor.id,
      vehicleId: dto.vehicleId,
      notes: dto.notes,
      location: dto.location,
      observedAt: new Date(dto.observedAt),
      latitude: null,
      longitude: null,
    });
    await service.create(actor, { ...dto, categoryIds: ['a', 'b'] });
    expect(tx.offence.create).not.toHaveBeenCalled();
    await expect(
      service.create(actor, { ...dto, categoryIds: ['a'] }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('sums decimal fines, preserves zero-point lines and debits the combined points exactly once', async () => {
    const { service, tx } = fixture('driver');
    const ticket = await service.submit(actor, 'draft');
    expect(ticket!.demoFineAmountSnapshot.toString()).toBe('75.3');
    expect(ticket!.demeritPointsSnapshot).toBe(3);
    expect(tx.offenceCharge.upsert).toHaveBeenCalledTimes(2);
    expect(tx.driverPointsLedger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        delta: -3,
        ticketId: 'ticket',
        driverId: 'driver',
      }),
    });
    expect(await service.submit(actor, 'draft')).toEqual(ticket);
    expect(tx.ticket.create).toHaveBeenCalledTimes(1);
    expect(tx.driverPointsLedger.create).toHaveBeenCalledTimes(1);
  });
  it('keeps identification pending and refuses to issue any inactive selection', async () => {
    const { service, tx, draft } = fixture();
    expect((await service.submit(actor, 'draft'))!.pointsAssessment).toBe(
      'PENDING_DRIVER_IDENTIFICATION',
    );
    expect(tx.driverPointsLedger.create).not.toHaveBeenCalled();
    draft.ticket = null;
    draft.charges = [
      { categoryId: 'a', category: { ...categories[0], active: false } },
    ];
    await expect(service.submit(actor, 'draft')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
  it('replaces the selection on draft edits, retaining revision protection', async () => {
    const { service, tx, draft } = fixture();
    await service.update(actor, 'draft', {
      revision: 0,
      categoryIds: ['b', 'a'],
    });
    expect(tx.offence.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          charges: {
            deleteMany: {},
            create: [{ categoryId: 'a' }, { categoryId: 'b' }],
          },
        }),
      }),
    );
    draft.status = 'SUBMITTED';
    await expect(
      service.update(actor, 'draft', { revision: 0, categoryIds: ['a'] }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('continues to accept the existing single-category request', async () => {
    const { service, tx } = fixture();
    tx.offenceCategory.findMany.mockResolvedValueOnce([categories[0]]);
    const single: CreateOffenceDto = {
      ...dto,
      categoryIds: undefined,
      categoryId: 'a',
    };
    await service.create(actor, single);
    expect(tx.offence.create.mock.calls[0][0].data.charges.create).toEqual([
      { categoryId: 'a' },
    ]);
  });
});
