import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from './App';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('shows demo identity and reports failed login without opening protected content', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Invalid credentials' }),
    }),
  );
  render(<App />);
  expect(screen.getByText(/Academic Prototype/)).toBeTruthy();
  expect(
    screen.getAllByRole('option').map((option) => option.textContent),
  ).toEqual(['User', 'Officer', 'Supervisor']);
  expect(screen.queryByLabelText('User services')).toBeNull();
  expect(screen.queryByLabelText('Ticket reference')).toBeNull();
  fireEvent.change(screen.getByLabelText('Login category'), {
    target: { value: 'OFFICER' },
  });
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'officer@demo.invalid' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'incorrect' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await waitFor(() =>
    expect(screen.getAllByRole('alert')[0].textContent).toContain(
      'Invalid credentials',
    ),
  );
  expect(screen.queryByText('Your activity')).toBeNull();
});
it('opens motorist services only after User sign-in and clears them on sign-out', async () => {
  const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith('/auth/login')) {
      expect(JSON.parse(String(options?.body))).toMatchObject({
        category: 'USER',
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          token: 'user-session',
          user: { id: 'user', name: 'Demo User', role: 'USER' },
        }),
      };
    }
    if (url.endsWith('/auth/logout')) return { ok: true, status: 204 };
    if (url.includes('/motorist/'))
      return {
        ok: true,
        status: 200,
        json: async () =>
          url.endsWith('/dashboard')
            ? {
                totalPayable: 0,
                pendingFines: 0,
                demeritPoints: 0,
                paidFines: 0,
                registeredVehicles: 0,
              }
            : { items: [], total: 0 },
      };
    if (url.endsWith('/public/notices'))
      return {
        ok: true,
        status: 200,
        json: async () => ({ notice: 'Fictional notices', alerts: [] }),
      };
    throw new Error('Unexpected request: ' + url);
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'user@demo.invalid' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'demo-test-only' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByRole('heading', { name: 'Welcome back, Demo User' });
  expect(screen.queryByText('Your activity')).toBeNull();
  expect(fetchMock.mock.calls.some(([url]) => url.includes('/offences'))).toBe(
    false,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByLabelText('Login category');
  expect(screen.queryByLabelText('User services')).toBeNull();
});
