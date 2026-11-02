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
          demoFineAmount: '50',
          demeritPoints: 3,
          paymentDueDays: 30,
        },
        {
          id: 'dui',
          name: 'Drunk driving (DUI)',
          demoFineAmount: '200',
          demeritPoints: 6,
          paymentDueDays: 30,
        },
        {
          id: 'parking',
          name: 'Illegal parking',
          demoFineAmount: '25',
          demeritPoints: 0,
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
        categoryIds: ['category', 'dui'],
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
        demoFineAmountSnapshot: '250',
        demeritPointsSnapshot: 9,
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
  expect(
    (screen.getByRole('button', { name: 'Issue & Send' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    screen.getByText(
      'Select a valid offence category to calculate the fine and demerit points.',
    ),
  ).not.toBeNull();
  // A synthetic submit must also be guarded, not only the disabled button.
  fireEvent.submit(
    screen.getByRole('group', { name: 'Offence categories' }).closest('form')!,
  );
  expect(api.mock.calls.some(([path]) => path === '/offences')).toBe(false);
  const summary = document.querySelector(
    '.officer-citation-summary',
  )! as HTMLElement;
  // Checkbox toggles and chips both remove selections without duplicates.
  const picker = screen
    .getByText('Select offence categories')
    .closest('details')!;
  picker.open = true;
  const speeding = screen.getByRole('checkbox', { name: /Speeding/ });
  const dui = screen.getByRole('checkbox', { name: /Drunk driving/ });
  const parking = screen.getByRole('checkbox', { name: /Illegal parking/ });
  fireEvent.click(speeding);
  fireEvent.click(dui);
  expect(within(summary).getByText('US$250.00')).not.toBeNull();
  expect(within(summary).getByText('9 Points')).not.toBeNull();
  fireEvent.click(parking);
  expect(within(summary).getByText('US$275.00')).not.toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: 'Remove Illegal parking' }),
  );
  expect((parking as HTMLInputElement).checked).toBe(false);
  fireEvent.click(dui);
  expect(within(summary).getByText('US$50.00')).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Remove Speeding' }));
  expect(
    (screen.getByRole('button', { name: 'Issue & Send' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(speeding);
  fireEvent.click(dui);
  expect(
    screen.getAllByRole('button', { name: 'Remove Speeding' }),
  ).toHaveLength(1);
  fireEvent.change(screen.getByLabelText('Location'), {
    target: { value: 'Central intersection' },
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
  expect(within(summary).getByText('US$250.00')).not.toBeNull();
  expect(within(summary).getByText('9 Points')).not.toBeNull();
  expect(
    api.mock.calls.filter(([path]) => path.endsWith('/submit')),
  ).toHaveLength(1);
});
