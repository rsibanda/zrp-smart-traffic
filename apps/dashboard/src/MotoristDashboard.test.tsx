import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MotoristDashboard, receiptText } from './MotoristDashboard';
afterEach(cleanup);
it('uses linked records, retains a payment request key after connection loss, and sends only test last4', async () => {
  let paid = false,
    attempts = 0;
  const ticket = {
    reference: 'reference-test-123456',
    displayReference: 'INF-2026-000125',
    amount: '80',
    category: 'Speeding',
    registration: 'ABC1234',
    location: 'Intersection',
    issuedAt: '2026-10-02T09:00:00Z',
    dueAt: null,
    status: 'SUBMITTED',
    paymentStatus: 'PENDING',
    demeritPoints: 3,
  };
  const calls: unknown[] = [];
  const api = vi.fn(async (path: string, body?: unknown) => {
    if (path === '/motorist/dashboard')
      return {
        totalPayable: paid ? 0 : 80,
        pendingFines: paid ? 0 : 1,
        demeritPoints: 3,
        paidFines: paid ? 1 : 0,
        registeredVehicles: 1,
      };
    if (path.startsWith('/motorist/infringements?'))
      return {
        items: [{ ...ticket, paymentStatus: paid ? 'PAID' : 'PENDING' }],
        total: 1,
      };
    if (path === '/motorist/payments') {
      calls.push(body);
      if (attempts++ === 0) throw new Error('Connection lost');
      return {
        reference: 'PAY-test',
        amount: '80',
        method: 'CARD',
        last4: '4242',
        status: 'PROCESSING',
      };
    }
    if (path.endsWith('/outcome')) {
      expect(body).toEqual({ outcome: 'APPROVE' });
      paid = true;
      return {
        reference: 'PAY-test',
        amount: '80',
        method: 'CARD',
        last4: '4242',
        status: 'SUCCESS',
      };
    }
    throw new Error(`Unexpected endpoint: ${path}`);
  });
  render(
    <MotoristDashboard
      api={api}
      accountToken="test"
      user={{ name: 'Sample Motorist' }}
      onSessionExpired={() => {}}
    />,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Pay Now' }));
  fireEvent.change(screen.getByLabelText('Payment method'), {
    target: { value: 'CARD' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('button', { name: 'Retry same payment request' });
  await waitFor(() =>
    expect(
      screen
        .getByRole('button', { name: 'Retry same payment request' })
        .hasAttribute('disabled'),
    ).toBe(false),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry same payment request' }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Simulate Approve' }),
  );
  await screen.findByRole('button', { name: 'View Receipt' });
  expect(calls[0]).toEqual(calls[1]);
  expect(calls[0]).toMatchObject({
    method: 'CARD',
    last4: '4242',
    reference: ticket.reference,
  });
  expect(JSON.stringify(calls)).not.toContain('4242 4242 4242 4242');
  const dialog = screen.getByRole('dialog', { name: 'Pay Traffic Fine' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Pay Now' })).toBeNull(),
  );
  expect(screen.getByText('3 pts')).toBeTruthy();
});
it('exports a receipt with an explicit simulation disclosure', () => {
  const text = receiptText({
    reference: 'PAY-test',
    ticketReference: 'ticket-reference',
    ticketDisplayReference: 'INF-2026-000125',
    amount: '80',
    method: 'CARD',
    status: 'SUCCESS',
    last4: '4242',
    createdAt: '2026-10-02T09:00:00Z',
    paidAt: '2026-10-02T09:00:00Z',
    receiptReference: 'RCT-test',
    failureReason: null,
    motorist: 'Sample Motorist',
    registration: 'ABC1234',
    offence: 'Speeding',
    notice:
      'Simulated payment receipt — no funds transferred. Academic Prototype.',
  });
  expect(text).toContain('US$80.00');
  expect(text).toContain('Bank Card');
  expect(text).toContain('INF-2026-000125');
  expect(text).not.toContain('ticket-reference');
  expect(text).toContain('no funds transferred');
  expect(text).not.toContain('undefined');
});

it('opens a paid ticket receipt directly and hides the opaque lookup key', async () => {
  const api = vi.fn(async (path: string) => {
    if (path === '/motorist/dashboard')
      return {
        totalPayable: 0,
        pendingFines: 0,
        demeritPoints: 3,
        paidFines: 1,
        registeredVehicles: 1,
        currency: 'USD',
      };
    if (path.startsWith('/motorist/infringements?'))
      return {
        total: 1,
        items: [
          {
            reference: 'opaque-secret-reference',
            displayReference: 'INF-2026-000125',
            category: 'Speeding',
            registration: 'ABC1234',
            location: 'Harare Central',
            amount: '25',
            currency: 'USD',
            demeritPoints: 3,
            paymentStatus: 'PAID',
            status: 'CONFIRMED',
            issuedAt: '2026-10-02T09:00:00Z',
            receiptPaymentReference: 'PAY-test',
          },
        ],
      };
    if (path === '/motorist/payments/PAY-test/receipt')
      return {
        reference: 'PAY-test',
        ticketDisplayReference: 'INF-2026-000125',
        amount: '25',
        currency: 'USD',
        method: 'ECOCASH',
        status: 'SUCCESS',
        receiptReference: 'RCT-test',
        motorist: 'Sample Motorist',
        registration: 'ABC1234',
        offence: 'Speeding',
        paidAt: '2026-10-02T09:00:00Z',
        notice: 'Simulated payment receipt — no funds transferred.',
      };
    throw new Error(path);
  });
  render(
    <MotoristDashboard
      api={api}
      accountToken="test"
      user={{ name: 'Sample Motorist' }}
      onSessionExpired={() => {}}
    />,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'View Receipt' }));
  const receipt = await screen.findByRole('dialog', {
    name: 'Payment receipt',
  });
  expect(receipt.textContent).toContain('EcoCash');
  expect(receipt.textContent).toContain('US$25.00');
  expect(screen.queryByText('opaque-secret-reference')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Pay Now' })).toBeNull();
});
