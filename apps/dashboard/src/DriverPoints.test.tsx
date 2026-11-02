import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DriverIdentification, PointsHistory } from './DriverPoints';

afterEach(cleanup);
it('requires explicit responsibility confirmation and clears it when the licence changes', async () => {
  const api = vi
    .fn()
    .mockResolvedValue({
      id: 'driver',
      fullName: 'Sample Driver',
      licenceStatus: 'VALID',
    });
  const change = vi.fn();
  render(<DriverIdentification api={api} onChange={change} />);
  fireEvent.change(screen.getByLabelText('Driver licence number'), {
    target: { value: 'TEST-123' },
  });
  fireEvent.click(screen.getByText('Find verified driver'));
  await screen.findByText(/Sample Driver/);
  expect(change).not.toHaveBeenCalledWith('driver');
  fireEvent.click(screen.getByRole('checkbox'));
  expect(change).toHaveBeenLastCalledWith('driver');
  fireEvent.change(screen.getByLabelText('Driver licence number'), {
    target: { value: 'OTHER-123' },
  });
  expect(change).toHaveBeenLastCalledWith('');
  expect(screen.queryByRole('checkbox')).toBeNull();
});
it('renders the server balance and compensating credit without computing from a displayed page', () => {
  render(
    <PointsHistory
      balance={{
        status: 'VERIFIED',
        remaining: 9,
        allowance: 12,
        totalDeducted: 3,
        history: [
          {
            reference: 'INF-TEST',
            event: 'CANCELLATION',
            delta: 4,
            at: '2026-10-30T10:00:00Z',
            reason: 'Cancelled ticket credit',
          },
        ],
      }}
    />,
  );
  expect(screen.getByText('Points Remaining: 9 / 12')).toBeTruthy();
  expect(screen.getByText(/\+4 points/)).toBeTruthy();
  expect(screen.getByText(/Paying a fine does not restore/)).toBeTruthy();
});
