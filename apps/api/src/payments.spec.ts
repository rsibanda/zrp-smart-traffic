import {
  effectivePaymentStatus,
  SimulatedPaymentProvider,
} from './payments.service';
describe('Payment policy', () => {
  it('derives overdue only from an unpaid, active ticket with a passed due date', () => {
    const ticket = {
      status: 'ISSUED',
      dueAt: new Date('2026-01-01'),
      publicAccess: null,
    };
    expect(effectivePaymentStatus(ticket, new Date('2026-02-01'))).toBe(
      'OVERDUE',
    );
    expect(effectivePaymentStatus({ ...ticket, dueAt: null })).toBe('PENDING');
    expect(effectivePaymentStatus({ ...ticket, status: 'CANCELLED' })).toBe(
      'CANCELLED',
    );
    expect(
      effectivePaymentStatus({
        ...ticket,
        publicAccess: { paidAt: new Date() },
      }),
    ).toBe('PAID');
  });
  it('approves only the explicit local approval outcome', () => {
    const p = new SimulatedPaymentProvider();
    expect(p.resolve('APPROVE')).toBe('SUCCESS');
    expect(p.resolve('DECLINE')).toBe('FAILED');
    expect(p.resolve('TIMEOUT')).toBe('TIMED_OUT');
    expect(p.resolve('ERROR')).toBe('FAILED');
    expect(p.resolve('CANCEL')).toBe('CANCELLED');
  });
});
