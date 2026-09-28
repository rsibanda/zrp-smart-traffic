import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PublicPortal } from './PublicPortal';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('verifies before payment simulation, sends the public token, and closes access', async () => {
  const ticket = {
    reference: 'demo-random-reference',
    category: 'Fictional category',
    demoAmount: '25.00',
    status: 'ISSUED',
    paymentStatus: 'NOT_SIMULATED',
  };
  const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith('/notices'))
      return {
        ok: true,
        status: 200,
        json: async () => ({ notice: 'Fictional notices only', alerts: [] }),
      };
    if (url.endsWith('/verify')) {
      expect(options?.headers).toMatchObject({
        Authorization: 'Bearer user-session',
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({ token: 'public-session', ticket }),
      };
    }
    if (url.endsWith('/payment-simulation')) {
      expect(options?.headers).toMatchObject({
        Authorization: 'Bearer public-session',
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ...ticket,
          paymentStatus: 'SIMULATED_PAID',
          receiptReference: 'DEMO-receipt',
        }),
      };
    }
    return { ok: true, status: 204 };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <PublicPortal accountToken="user-session" onSessionExpired={vi.fn()} />,
  );
  expect(screen.queryByRole('button', { name: 'Simulate payment' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Ticket reference'), {
    target: { value: ticket.reference },
  });
  fireEvent.change(screen.getByLabelText('Verification code'), {
    target: { value: 'abcdef0123456789' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Verify Ticket' }));
  await screen.findByRole('button', { name: 'Simulate payment' });
  fireEvent.click(screen.getByRole('button', { name: 'Simulate payment' }));
  await screen.findByText(/DEMO-receipt/);
  expect(
    (
      screen.getByRole('button', {
        name: 'Simulate payment',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Close ticket access' }));
  await waitFor(() =>
    expect(screen.queryByText('Verified Traffic Ticket')).toBeNull(),
  );
});
