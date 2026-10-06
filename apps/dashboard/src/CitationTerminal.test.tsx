import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CitationTerminal } from './CitationTerminal';
afterEach(cleanup);
it('looks up the vehicle, creates a draft and requires confirmation before issuing', async () => {
  const api = vi.fn(async (path: string, body?: unknown) => {
    if (path === '/offence-categories')
      return [
        {
          id: 'category',
          name: 'Speeding',
          demoFineAmount: '80',
          demeritPoints: 3,
          paymentDueDays: 30,
        },
      ];
    if (path.startsWith('/vehicles?'))
      return {
        items: [
          {
            id: 'vehicle',
            registrationNumber: 'ABC1234',
            make: 'Toyota',
            model: 'Corolla',
            motoristId: 'account',
            driver: { fullName: 'Sample Motorist', licenceStatus: 'VALID' },
          },
        ],
      };
    if (path === '/offences') {
      expect(body).toMatchObject({
        vehicleId: 'vehicle',
        categoryId: 'category',
        location: 'Central intersection',
        notes: 'Observed speeding',
      });
      return { id: 'draft' };
    }
    if (path.endsWith('/evidence')) return [];
    if (path === '/offences/draft/submit')
      return {
        id: 'ticket',
        publicReference: 'ticket-reference',
        displayReference: 'INF-2026-000125',
        demoFineAmountSnapshot: '80',
      };
    throw new Error(`Unexpected endpoint ${path}`);
  });
  render(<CitationTerminal api={api} token="officer-token" />);
  await screen.findByRole('heading', { name: 'Issue Traffic Infringement' });
  fireEvent.change(screen.getByLabelText('Vehicle registration'), {
    target: { value: 'ABC1234' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Lookup vehicle' }));
  await screen.findByRole('heading', { name: 'ABC1234 · Toyota Corolla' });
  fireEvent.change(screen.getByLabelText('Location'), {
    target: { value: 'Central intersection' },
  });
  fireEvent.change(screen.getByLabelText('Offence category'), {
    target: { value: 'category' },
  });
  fireEvent.change(screen.getByLabelText('Officer notes (optional)'), {
    target: { value: 'Observed speeding' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Issue & Send' }));
  const confirm = await screen.findByRole('dialog', {
    name: 'Issue this infringement?',
  });
  expect(
    api.mock.calls.filter(([path]) => path.endsWith('/submit')),
  ).toHaveLength(0);
  fireEvent.click(
    within(confirm).getByRole('button', { name: 'Issue Infringement' }),
  );
  await screen.findByRole('heading', { name: 'Infringement issued' });
  expect(screen.getAllByText('INF-2026-000125').length).toBeGreaterThan(0);
  expect(screen.queryByText('ticket-reference')).toBeNull();
  expect(
    api.mock.calls.filter(([path]) => path.endsWith('/submit')),
  ).toHaveLength(1);
});
