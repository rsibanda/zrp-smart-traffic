import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { PublicQrStatus, TicketScanner, tokenFromQr } from './TicketQr';

afterEach(cleanup);
const token = 'a'.repeat(64);
describe('Ticket QR verification', () => {
  it('accepts only the configured origin and ticket route without navigating arbitrary QR URLs', () => {
    expect(
      tokenFromQr(
        `https://traffic.example/verify#token=${token}`,
        'https://traffic.example',
      ),
    ).toBe(token);
    for (const value of [
      `https://other.example/verify#token=${token}`,
      `https://traffic.example/#token=${token}`,
      'javascript:alert(1)',
      'not a URL',
    ])
      expect(() => tokenFromQr(value, 'https://traffic.example')).toThrow();
  });
  it('shows only a sign-in instruction for valid public scans', async () => {
    const api = vi.fn().mockResolvedValue({ status: 'VALID' });
    render(<PublicQrStatus api={api} token={token} />);
    await screen.findByText(/Sign in as the linked motorist/);
    expect(api).toHaveBeenCalledWith('/public/ticket-qr/status', { token });
    expect(document.body.textContent).not.toContain(token);
  });
  it('opens only the ticket returned by authenticated verification', async () => {
    const api = vi
      .fn()
      .mockResolvedValue({ reference: 'opaque-ticket-reference' });
    const opened = vi.fn();
    render(
      <TicketScanner api={api} initialToken={token} onVerified={opened} />,
    );
    await waitFor(() =>
      expect(opened).toHaveBeenCalledWith('opaque-ticket-reference'),
    );
    expect(api).toHaveBeenCalledWith('/motorist/ticket-qr/verify', { token });
    expect(screen.getByLabelText('Choose QR image')).toBeTruthy();
  });
  it('retains scanning and manual fallback after an entitlement failure', async () => {
    const api = vi
      .fn()
      .mockRejectedValue(new Error('Ticket unavailable for this account.'));
    const opened = vi.fn();
    render(
      <TicketScanner api={api} initialToken={token} onVerified={opened} />,
    );
    await screen.findByText('Ticket unavailable for this account.');
    expect(opened).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Start camera' })).toBeTruthy();
    expect(screen.getByText(/reference and verification code/)).toBeTruthy();
  });
});
