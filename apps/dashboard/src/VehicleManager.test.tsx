import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { VehicleManager, VehicleRequestReview } from './VehicleManager';
afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});
const summary = {
  registeredVehicles: 0,
  activeInfringements: 0,
  totalPayable: 0,
  vehiclesRequiringAttention: 0,
  currency: 'USD',
};
it('supports an empty state and a verified-review request without claiming a vehicle', async () => {
  let submitted = false;
  const api = vi.fn(async (path: string, body?: unknown) => {
    if (path.startsWith('/motorist/vehicles?'))
      return { items: [], total: 0, summary };
    if (path.startsWith('/motorist/vehicles/requests?'))
      return {
        items: submitted
          ? [
              {
                id: 'request',
                registration: 'ABC1234',
                kind: 'LINK',
                status: 'PENDING',
                submittedAt: '2026-10-05T08:00:00Z',
              },
            ]
          : [],
        total: submitted ? 1 : 0,
      };
    if (path === '/motorist/vehicles/check')
      return {
        registration: 'ABC1234',
        ownershipStatus: 'PENDING',
        message: 'Ownership verification required.',
      };
    if (path === '/motorist/vehicles/link-request') {
      expect(body).toEqual({ registration: 'ABC1234' });
      submitted = true;
      return { status: 'PENDING' };
    }
    throw Error(path);
  });
  render(<VehicleManager api={api} onTicket={() => {}} />);
  await screen.findByText('No vehicles are linked to your account yet.');
  fireEvent.click(
    screen.getAllByRole('button', { name: '+ Register Vehicle' })[0],
  );
  const dialog = screen.getByRole('dialog', { name: 'Register Vehicle' });
  fireEvent.change(
    within(dialog).getByLabelText('Vehicle Registration Number'),
    { target: { value: 'abc-1234' } },
  );
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Check Vehicle' }),
  );
  fireEvent.click(
    await within(dialog).findByRole('button', { name: 'Submit Link Request' }),
  );
  await screen.findByText(
    'Link request submitted. Your vehicle will appear after administrator approval.',
  );
  expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
  expect(
    screen.getByText('No vehicles are linked to your account yet.'),
  ).toBeTruthy();
});
it('renders only stored vehicle fields, checks internal status and opens a linked ticket', async () => {
  const vehicle = {
    registrationNumber: 'ABC1234',
    make: 'Toyota',
    model: 'Corolla',
    colour: 'Silver',
    registrationStatus: 'REGISTERED',
    ownershipStatus: 'VERIFIED',
    nickname: null,
    linkVerifiedAt: null,
    activeInfringements: 1,
    linkedInfringements: 1,
    paidInfringements: 0,
    totalPayable: 80,
    paidAmount: 0,
    currency: 'USD',
  };
  const detail = {
    ...vehicle,
    checkedAt: '2026-10-05T08:00:00Z',
    statusSource:
      'Internal Smart Traffic records only; no national registry connection.',
    history: [],
    infringements: {
      items: [
        {
          reference: 'opaque',
          displayReference: 'INF-2026-000125',
          category: 'Speeding',
          amount: '80',
          currency: 'USD',
          paymentStatus: 'PENDING',
          demeritPoints: 3,
        },
      ],
      total: 1,
    },
  };
  const api = vi.fn(async (path: string) => {
    if (path.startsWith('/motorist/vehicles?'))
      return {
        items: [vehicle],
        total: 1,
        summary: {
          ...summary,
          registeredVehicles: 1,
          totalPayable: 80,
          activeInfringements: 1,
        },
      };
    if (path.startsWith('/motorist/vehicles/requests?'))
      return { items: [], total: 0 };
    return detail;
  });
  const open = vi.fn();
  render(<VehicleManager api={api} onTicket={open} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Check Status' }));
  await screen.findByRole('dialog', { name: 'Vehicle status' });
  expect(screen.getByText(detail.statusSource)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Close status' }));
  fireEvent.click(screen.getByRole('button', { name: 'View Details' }));
  await screen.findByText('INF-2026-000125');
  expect(window.location.pathname).toBe('/motorist/vehicles/ABC1234');
  expect(
    screen
      .getByRole('button', { name: 'Request Unlink' })
      .hasAttribute('disabled'),
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'View Ticket' }));
  expect(open).toHaveBeenCalledWith('opaque');
  expect(screen.queryByText('opaque')).toBeNull();
});
it('submits an administrator decision with an explicit verification attestation', async () => {
  const api = vi.fn(async (path: string) =>
    path.includes('/review')
      ? { status: 'VERIFIED' }
      : {
          items: [
            {
              id: 'r',
              registration: 'ABC1234',
              kind: 'LINK',
              status: 'PENDING',
              submittedAt: '2026-10-05T08:00:00Z',
              motorist: {
                name: 'Sample Motorist',
                email: 'sample@example.invalid',
              },
            },
          ],
          total: 1,
        },
  );
  render(<VehicleRequestReview api={api} />);
  await screen.findByText('ABC1234 · Link');
  fireEvent.change(screen.getByLabelText('Review note'), {
    target: { value: 'Ownership evidence checked' },
  });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  expect(api).toHaveBeenCalledWith('/admin/vehicle-link-requests/r/review', {
    status: 'VERIFIED',
    note: 'Ownership evidence checked',
    checked: true,
  });
});
