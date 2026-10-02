import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Payment, Prisma } from '../generated/client';
import { PrismaService } from './prisma.service';
import { serial } from './transactions';

export const reference = (prefix: string) =>
  `${prefix}-${randomBytes(12).toString('hex')}`;
export const ticketInclude = {
  publicAccess: { select: { paidAt: true, receiptReference: true } },
  offence: {
    include: {
      category: true,
      vehicle: true,
      officer: {
        select: { name: true, profile: { select: { badgeNumber: true } } },
      },
    },
  },
} as const;
type LedgerTicket = Prisma.TicketGetPayload<{ include: typeof ticketInclude }>;
export function effectivePaymentStatus(
  ticket: {
    status: string;
    dueAt: Date | null;
    publicAccess: { paidAt: Date | null } | null;
  },
  now = new Date(),
) {
  if (ticket.publicAccess?.paidAt) return 'PAID';
  if (ticket.status === 'CANCELLED') return 'CANCELLED';
  return ticket.dueAt && ticket.dueAt < now ? 'OVERDUE' : 'PENDING';
}
export function ledgerTicket(ticket: LedgerTicket) {
  return {
    reference: ticket.publicReference,
    amount: ticket.demoFineAmountSnapshot.toString(),
    currency: 'UNITS',
    status: ticket.offence.status,
    paymentStatus: effectivePaymentStatus(ticket),
    demeritPoints:
      ticket.status === 'CANCELLED' ? 0 : ticket.demeritPointsSnapshot,
    issuedAt: ticket.issuedAt,
    dueAt: ticket.dueAt,
    category: ticket.offence.category.name,
    description: ticket.offence.category.description,
    registration: ticket.offence.vehicle.registrationNumber,
    location: ticket.offence.location,
    officer: ticket.offence.officer.name,
    serviceNumber: ticket.offence.officer.profile?.badgeNumber ?? null,
    paidAt: ticket.publicAccess?.paidAt ?? null,
    receiptReference: ticket.publicAccess?.receiptReference ?? null,
    timeline: [
      { status: 'ISSUED', at: ticket.issuedAt },
      ...(ticket.offence.reviewedAt
        ? [{ status: ticket.offence.status, at: ticket.offence.reviewedAt }]
        : []),
      ...(ticket.publicAccess?.paidAt
        ? [{ status: 'PAID', at: ticket.publicAccess.paidAt }]
        : []),
    ],
  };
}
export function paymentView(payment: Payment) {
  return {
    reference: payment.paymentReference,
    amount: payment.amount.toString(),
    currency: payment.currency,
    method: payment.method,
    last4: payment.last4,
    status: payment.status,
    createdAt: payment.createdAt,
    paidAt: payment.paidAt,
    receiptReference: payment.receiptReference,
    failureReason: payment.failureReason,
    simulated: true,
  };
}
export type SimulationOutcome =
  'APPROVE' | 'DECLINE' | 'TIMEOUT' | 'ERROR' | 'CANCEL';
// Deliberately local and deterministic. No provider SDK, network request or credential.
export interface PaymentProvider {
  resolve(
    outcome: SimulationOutcome,
  ): 'SUCCESS' | 'FAILED' | 'TIMED_OUT' | 'CANCELLED';
}
export class SimulatedPaymentProvider implements PaymentProvider {
  resolve(outcome: SimulationOutcome) {
    if (outcome === 'APPROVE') return 'SUCCESS' as const;
    if (outcome === 'TIMEOUT') return 'TIMED_OUT' as const;
    if (outcome === 'CANCEL') return 'CANCELLED' as const;
    return 'FAILED' as const;
  }
}
@Injectable()
export class PaymentsService {
  private provider: PaymentProvider = new SimulatedPaymentProvider();
  constructor(private readonly db: PrismaService) {}
  initiate(
    actorId: string,
    dto: {
      reference: string;
      requestKey: string;
      method: 'ECOCASH' | 'INNBUCKS' | 'CARD';
      last4?: string;
    },
  ) {
    return serial(this.db, async (tx) => {
      const previous = await tx.payment.findUnique({
        where: { requestKey: dto.requestKey },
        include: { ticket: true },
      });
      if (previous) {
        if (
          previous.motoristId !== actorId ||
          previous.ticket.publicReference !== dto.reference ||
          previous.method !== dto.method ||
          previous.last4 !== (dto.last4 ?? null)
        )
          throw new ConflictException('Payment request key already used');
        return paymentView(previous);
      }
      const ticket = await tx.ticket.findFirst({
        where: { publicReference: dto.reference, motoristId: actorId },
        include: { publicAccess: true },
      });
      if (!ticket) throw new NotFoundException('Ticket not found');
      if (ticket.status === 'CANCELLED')
        throw new ConflictException('Cancelled tickets cannot be paid');
      if (ticket.publicAccess?.paidAt)
        throw new ConflictException('This infringement has already been paid.');
      const stale = await tx.payment.findMany({
        where: {
          ticketId: ticket.id,
          status: 'PROCESSING',
          createdAt: { lt: new Date(Date.now() - 900000) },
        },
      });
      for (const old of stale) {
        await tx.payment.update({
          where: { id: old.id },
          data: {
            status: 'TIMED_OUT',
            failureReason: 'Payment session expired.',
          },
        });
        await tx.auditEvent.create({
          data: {
            actorId,
            action: 'PAYMENT_TIMED_OUT',
            entityType: 'Payment',
            entityId: old.id,
          },
        });
      }
      const pending = await tx.payment.findFirst({
        where: { ticketId: ticket.id, status: 'PROCESSING' },
      });
      if (pending)
        throw new ConflictException(
          'A payment is already processing. Resume it from Payment History.',
        );
      const payment = await tx.payment.create({
        data: {
          ticketId: ticket.id,
          motoristId: actorId,
          requestKey: dto.requestKey,
          method: dto.method,
          last4: dto.method === 'CARD' ? dto.last4 : null,
          paymentReference: reference('PAY'),
          amount: ticket.demoFineAmountSnapshot,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          action: 'PAYMENT_INITIATED',
          entityType: 'Payment',
          entityId: payment.id,
          safeMetadata: { method: dto.method, simulated: true },
        },
      });
      return paymentView(payment);
    });
  }
  resolve(
    actorId: string,
    paymentReference: string,
    outcome: SimulationOutcome,
  ) {
    return serial(this.db, async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { paymentReference, motoristId: actorId },
        include: { ticket: { include: { publicAccess: true } } },
      });
      if (!payment) throw new NotFoundException('Payment not found');
      if (payment.status !== 'PROCESSING') return paymentView(payment);
      let status = this.provider.resolve(outcome);
      let failureReason: string | null =
        status === 'SUCCESS'
          ? null
          : 'Payment could not be completed. No funds were deducted.';
      if (payment.createdAt.getTime() < Date.now() - 900000) {
        status = 'TIMED_OUT';
        failureReason = 'The payment session expired. Start a new payment.';
      }
      if (
        payment.ticket.status === 'CANCELLED' ||
        payment.ticket.publicAccess?.paidAt
      ) {
        status = 'CANCELLED';
        failureReason = 'This infringement is no longer payable.';
      }
      const paidAt = status === 'SUCCESS' ? new Date() : null;
      const receiptReference = paidAt ? reference('RCT') : null;
      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: { status, paidAt, receiptReference, failureReason },
      });
      if (paidAt) {
        await tx.publicTicketAccess.upsert({
          where: { ticketId: payment.ticketId },
          create: {
            ticketId: payment.ticketId,
            codeHash: randomBytes(32).toString('hex'),
            paidAt,
            receiptReference,
          },
          update: { paidAt, receiptReference },
        });
        await tx.auditEvent.create({
          data: {
            actorId,
            action: 'RECEIPT_CREATED',
            entityType: 'Payment',
            entityId: payment.id,
          },
        });
      }
      await tx.auditEvent.create({
        data: {
          actorId,
          action: `PAYMENT_${status}`,
          entityType: 'Payment',
          entityId: payment.id,
          safeMetadata: { simulated: true },
        },
      });
      return paymentView(updated);
    });
  }
}
