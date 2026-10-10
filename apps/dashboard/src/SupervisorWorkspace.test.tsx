import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SupervisorWorkspace } from './SupervisorWorkspace';
import { VehicleApprovals } from './VehicleApprovals';

afterEach(() => {
  cleanup();
  history.replaceState({}, '', '/');
});
const row = {
  id: 'internal-offence',
  createdAt: '2026-10-09T08:00:00Z',
  status: 'SUBMITTED',
  location: 'Central',
  category: { name: 'Speeding' },
  vehicle: { registrationNumber: 'ABC1234' },
  officer: { name: 'Officer Moyo' },
  paymentStatus: 'PENDING',
  ticket: {
    displayReference: 'INF-2026-000125',
    demoFineAmountSnapshot: '80',
    demeritPointsSnapshot: 3,
    motorist: { name: 'Tawanda Ncube' },
  },
};
it('uses dynamic command metrics, review actions, payment methods and navigation without exposing IDs', async () => {
  const open = vi.fn();
  const api = vi.fn(async (path: string) => {
    if (path === '/alerts') return [];
    if (path === '/analytics/overview')
      return {
        submittedOffences: 8,
        openIncidents: 3,
        activeCheckpoints: 2,
        officers: [
          {
            name: 'Officer Moyo',
            active: true,
            _count: { offences: 1, incidents: 0 },
          },
        ],
        tickets: [],
        trend: [],
      };
    if (path === '/supervisor/summary')
      return {
        paymentsToday: 1240,
        currency: 'USD',
        pendingVehicleApprovals: 3,
      };
    if (path.startsWith('/offences'))
      return { items: path.includes('UNDER_REVIEW') ? [] : [row], total: 1 };
    if (path.startsWith('/supervisor/payments'))
      return {
        items: [
          {
            paymentReference: 'payment-internal',
            amount: '80',
            currency: 'USD',
            method: 'INNBUCKS',
            status: 'SUCCESS',
            createdAt: row.createdAt,
            motorist: { name: 'Tawanda Ncube' },
            ticket: row.ticket,
          },
        ],
        total: 1,
      };
    return { items: [], total: 0 };
  });
  const { container } = render(
    <SupervisorWorkspace
      api={api}
      user={{ id: 'supervisor', role: 'SUPERVISOR', name: 'Inspector Dube' }}
      onOpen={open}
    >
      <p>Existing offence review controls</p>
    </SupervisorWorkspace>,
  );
  await screen.findByText('US$1,240.00');
  expect(
    screen.getByRole('button', { name: /Pending Vehicle Approvals/ })
      .textContent,
  ).toContain('3');
  expect(screen.getAllByText('INF-2026-000125').length).toBeGreaterThan(0);
  expect(container.textContent).not.toContain('internal-offence');
  expect(container.textContent).not.toContain('payment-internal');
  fireEvent.click(screen.getAllByRole('button', { name: 'Review' })[0]);
  expect(open).toHaveBeenCalledWith('internal-offence');
  expect(location.pathname).toBe('/supervisor/reviews');
  expect(
    screen.getByText('Existing offence review controls').closest('[hidden]'),
  ).toBeNull();
  fireEvent.click(
    within(
      screen.getByRole('navigation', { name: 'Command centre navigation' }),
    ).getByRole('button', { name: 'Payments' }),
  );
  expect(screen.getByText('InnBucks')).toBeTruthy();
  expect(screen.getByText('Paid')).toBeTruthy();
  fireEvent.click(
    within(
      screen.getByRole('navigation', {
        name: 'Mobile command centre navigation',
      }),
    ).getByRole('button', { name: 'More' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Vehicle Approvals' }));
  expect(location.pathname).toBe('/supervisor/vehicles');
  expect(await screen.findByText('No vehicle requests found.')).toBeTruthy();
});
it('requires request detail, ownership checks and explicit confirmation before supervisor approval', async () => {
  let approved = false;
  const request = {
    id: 'private-request',
    registration: 'ABC1234',
    kind: 'LINK',
    status: 'PENDING',
    submittedAt: row.createdAt,
    motorist: { name: 'Tawanda Ncube', email: 'motorist@example.invalid' },
  };
  const api = vi.fn(async (path: string, body?: unknown) => {
    if (body) {
      approved = true;
      return { status: 'VERIFIED' };
    }
    if (path.endsWith('/private-request'))
      return {
        ...request,
        vehicle: {
          make: 'Toyota',
          model: 'Corolla',
          colour: 'Silver',
          registrationStatus: 'REGISTERED',
        },
        linkedToAnotherMotorist: false,
        ownershipStatus: 'PENDING',
        history: [request],
      };
    return {
      items: [{ ...request, status: approved ? 'VERIFIED' : 'PENDING' }],
      total: 1,
    };
  });
  render(<VehicleApprovals api={api} />);
  fireEvent.click(await screen.findByRole('button', { name: 'View Request' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('Toyota Corolla · Silver')).toBeTruthy();
  fireEvent.change(within(dialog).getByLabelText('Review note'), {
    target: { value: 'Ownership evidence checked' },
  });
  fireEvent.click(within(dialog).getByRole('checkbox'));
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Approve Vehicle' }),
  );
  expect(approved).toBe(false);
  expect(
    within(dialog).getByText(
      'This will link the vehicle to the motorist account.',
    ),
  ).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: /^Approve$/ }));
  await waitFor(() => expect(approved).toBe(true));
  expect(api).toHaveBeenCalledWith(
    '/supervisor/vehicle-link-requests/private-request/review',
    { status: 'VERIFIED', note: 'Ownership evidence checked', checked: true },
  );
  await screen.findByText('Approved');
});
