import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { OfficerWorkspace, officerTotals } from './OfficerWorkspace';
afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});
it('counts only issued tickets today in Harare and active operational records', () => {
  const now = new Date('2026-10-06T12:00:00Z');
  const records = [
    {
      id: 'one',
      location: 'Central',
      status: 'SUBMITTED',
      ticket: {
        issuedAt: '2026-10-05T22:05:00Z',
        demoFineAmountSnapshot: '80',
      },
    },
    {
      id: 'two',
      location: 'Central',
      status: 'UNDER_REVIEW',
      ticket: {
        issuedAt: '2026-10-05T21:59:00Z',
        demoFineAmountSnapshot: '40',
      },
    },
    { id: 'three', location: 'Central', status: 'DRAFT', ticket: null },
  ];
  expect(
    officerTotals(
      records,
      [
        { id: 'i', location: 'Central', status: 'OPEN' },
        { id: 'r', location: 'Central', status: 'RESOLVED' },
      ],
      [
        {
          id: 'c',
          location: 'Central',
          status: 'ACTIVE',
          startAt: '2026-10-06T00:00:00Z',
          endAt: '2026-10-07T00:00:00Z',
        },
        {
          id: 'old',
          location: 'Central',
          status: 'ACTIVE',
          endAt: '2026-10-05T00:00:00Z',
        },
      ],
      now,
    ),
  ).toEqual({ issued: 1, pending: 2, incidents: 1, checkpoints: 1 });
});
it('renders the dashboard from all result pages, preserves drafts across tabs and opens activity', async () => {
  const onOpen = vi.fn();
  const api = vi.fn(async (path: string) => {
    if (path === '/offence-categories') return [];
    if (path.startsWith('/offences?'))
      return {
        items: path.includes('page=1&')
          ? Array.from({ length: 100 }, (_, i) => ({
              id: 'row-' + i,
              status: 'SUBMITTED',
              location: 'Central',
              category: { name: 'Speeding' },
              vehicle: {
                registrationNumber: 'ABC1234',
                motoristId: 'internal',
              },
              ticket: {
                displayReference: 'INF-2026-' + i,
                issuedAt: new Date().toISOString(),
                demoFineAmountSnapshot: '80',
              },
            }))
          : [
              {
                id: 'last',
                status: 'UNDER_REVIEW',
                location: 'West',
                category: { name: 'Parking' },
              },
            ],
        total: 101,
      };
    if (path.startsWith('/incidents?'))
      return {
        items: [
          {
            id: 'incident',
            status: 'OPEN',
            type: 'ACCIDENT',
            location: 'Seke Road',
            createdAt: new Date().toISOString(),
          },
        ],
        total: 1,
      };
    if (path.startsWith('/checkpoints?'))
      return {
        items: [
          {
            id: 'checkpoint',
            name: 'Central Checkpoint',
            status: 'ACTIVE',
            location: 'Harare',
          },
        ],
        total: 1,
      };
    throw Error(path);
  });
  render(
    <OfficerWorkspace
      api={api}
      token="test"
      user={{ id: 'officer', name: 'Officer Sample', role: 'OFFICER' }}
      onOpen={onOpen}
    >
      <p>Existing activity tools</p>
    </OfficerWorkspace>,
  );
  await screen.findByText('101');
  expect(
    screen.getByRole('heading', { name: 'Welcome back, Officer Sample' }),
  ).toBeTruthy();
  expect(screen.getByText('Central Checkpoint')).toBeTruthy();
  expect(screen.getByText('Severity not recorded')).toBeTruthy();
  expect(screen.queryByText('internal')).toBeNull();
  fireEvent.change(screen.getByLabelText('Vehicle registration'), {
    target: { value: 'ABC1234' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'View all activity' }));
  expect(window.location.pathname).toBe('/officer/activity');
  fireEvent.click(screen.getAllByRole('button', { name: /View INF-/ })[0]);
  expect(onOpen).toHaveBeenCalledWith('row-0');
  expect(screen.getByText('Existing activity tools')).toBeTruthy();
  const nav = screen.getByRole('navigation', { name: 'Officer services' });
  fireEvent.click(
    within(nav).getByRole('button', { name: /Issue Infringement/ }),
  );
  expect(
    (screen.getByLabelText('Vehicle registration') as HTMLInputElement).value,
  ).toBe('ABC1234');
  window.history.replaceState({}, '', '/officer/profile');
  fireEvent.popState(window);
  expect(screen.getByRole('heading', { name: 'Officer Profile' })).toBeTruthy();
  fireEvent.click(within(nav).getByRole('button', { name: /^Incidents/ }));
  const incidentForm = screen
    .getByRole('heading', { name: 'Report a Road Incident' })
    .closest('form')!;
  fireEvent.change(within(incidentForm).getByLabelText('Location'), {
    target: { value: 'Seke Road' },
  });
  fireEvent.click(within(nav).getByRole('button', { name: /^Checkpoints/ }));
  fireEvent.click(within(nav).getByRole('button', { name: /^Incidents/ }));
  expect(
    (within(incidentForm).getByLabelText('Location') as HTMLInputElement).value,
  ).toBe('Seke Road');
});
it('restores an officer issue deep link', async () => {
  window.history.replaceState({}, '', '/officer/issue');
  const api = vi.fn(async (path: string) =>
    path === '/offence-categories' ? [] : { items: [], total: 0 },
  );
  render(
    <OfficerWorkspace
      api={api}
      token="test"
      user={{ id: 'o', name: 'Officer Sample', role: 'OFFICER' }}
      onOpen={() => {}}
    >
      {null}
    </OfficerWorkspace>,
  );
  await screen.findByRole('heading', { name: 'Issue Traffic Infringement' });
  expect(screen.queryByRole('heading', { name: /Welcome back/ })).toBeNull();
  expect(screen.getByText('Assigned when issued')).toBeTruthy();
});
