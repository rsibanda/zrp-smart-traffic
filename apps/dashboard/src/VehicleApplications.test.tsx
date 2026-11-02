import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { VehicleApplications } from './VehicleApplications';

afterEach(cleanup);
it('saves a draft using the selected catalogue category and displays the server fee snapshot', async () => {
  const api = vi.fn(async (path: string, body?: unknown) => {
    if (path === '/vehicle-categories')
      return [
        {
          id: 'car',
          code: 'PC',
          label: 'Private car',
          feeMinor: 1000,
          active: true,
        },
      ];
    if (path.endsWith('/limits'))
      return { maxFileBytes: 10485760, maxAttachments: 5 };
    if (!body) return { items: [], total: 0 };
    return {
      ...(body as object),
      requestId: 'application',
      status: 'DRAFT',
      revision: 1,
      feeMinor: 1000,
      files: [],
      payments: [],
      decisions: [],
    };
  });
  render(<VehicleApplications api={api} />);
  fireEvent.click(screen.getByText('New vehicle application & status'));
  await screen.findByText('No vehicle applications found.');
  fireEvent.click(screen.getByText('Start new application'));
  await screen.findByRole('option', { name: /Private car/ });
  fireEvent.change(screen.getByLabelText('Vehicle category'), {
    target: { value: 'car' },
  });
  for (const [label, value] of [
    ['Registration number', 'ABC 1234'],
    ['Make', 'Sample'],
    ['Model', 'Saloon'],
    ['Colour', 'Blue'],
    ['VIN / chassis number', 'TEST-CHASSIS'],
    ['Manufacture year', '2020'],
  ]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.submit(
    screen.getByLabelText('Registration number').closest('form')!,
  );
  await screen.findByText(
    'Draft saved. Add the required attachments before submitting.',
  );
  expect(api).toHaveBeenCalledWith(
    '/motorist/vehicle-applications',
    expect.objectContaining({
      categoryId: 'car',
      registration: 'ABC 1234',
      year: 2020,
    }),
    'POST',
  );
  expect(screen.getByText(/Saved processing fee/).textContent).toContain(
    'US$10.00',
  );
  expect(screen.getByText('Submit for review')).toBeTruthy();
});
