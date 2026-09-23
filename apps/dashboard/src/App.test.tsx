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
  expect(screen.getByText(/UNIVERSITY PROTOTYPE/)).toBeTruthy();
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
