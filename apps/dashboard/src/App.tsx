import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { AdminPanel } from './AdminPanel';
import { OperationsPanel } from './OperationsPanel';
import { PublicPortal } from './PublicPortal';
import { EvidencePanel } from './EvidencePanel';

type User = { id: string; name: string; role: 'OFFICER' | 'SUPERVISOR' | 'ADMIN' };
type Offence = {
  id: string;
  location: string;
  notes: string;
  status: string;
  vehicle: { registrationNumber: string };
  category: { name: string };
  ticket: null | {
    id: string;
    publicReference: string;
    demoFineAmountSnapshot: string;
    status: string;
  };
};
type Session = { token: string; user: User };
export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const currentSession = useRef<Session | null>(null);
  currentSession.current = session;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Offence[]>([]);
  const [selected, setSelected] = useState<Offence | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('');
  const api = useCallback(
    async (path: string, body?: unknown, method?: string) => {
      let response: Response;
      try {
        response = await fetch(`/api/v1${path}`, {
          method: method ?? (body === undefined ? 'GET' : 'POST'),
          headers: {
            'Content-Type': 'application/json',
            ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        throw new Error('API unavailable. Check your connection and retry.');
      }
      if (response.status === 401 && session && currentSession.current?.token === session.token) {
        setSession(null);
        setItems([]);
        setSelected(null);
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          [data.message ?? `Request failed (${response.status})`]
            .flat()
            .join('. '),
        );
      }
      return response.status === 204 ? undefined : response.json();
    },
    [session],
  );

  useEffect(() => {
    if (!session || session.user.role === 'ADMIN') {
      setLoading(false);
      return;
    }
    let active = true;
    const refresh = async () => {
      if (active) setLoading(true);
      try {
        const data = await api(
          `/offences?page=${page}&pageSize=20${status ? `&status=${status}` : ''}`,
        );
        if (active) {
          setItems(data.items);
          setTotal(data.total);
          setError('');
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api, session, page, status]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      setSession(
        await api('/auth/login', {
          email: form.get('email'),
          password: form.get('password'),
        }),
      );
      setPage(1);
      setStatus('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await api('/auth/logout', {});
      setSession(null);
      setSelected(null);
      setItems([]);
      setError('');
    } catch (e) {
      setError(`Logout could not be confirmed. ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }
  async function open(id: string) {
    setBusy(true);
    setError('');
    try {
      setSelected(await api(`/offences/${id}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const updated = await api(`/offences/${selected.id}/review`, {
        status: data.get('status'),
        notes: data.get('notes'),
      });
      setSelected(updated);
      setItems((old) =>
        old.map((item) => (item.id === updated.id ? updated : item)),
      );
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="banner">
        DEMO / UNIVERSITY PROTOTYPE — fictional records only
      </div>
      <header>
        <div>
          <span className="eyebrow">TRAFFIC OPERATIONS</span>
          <h1>Smart Traffic</h1>
        </div>
        {session && (
          <div>
            {session.user.name} · {session.user.role}{' '}
            <button disabled={busy} onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        )}
      </header>
      <main aria-busy={busy || loading}>
        {loading && <p role="status">Refreshing demo records…</p>}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {!session ? (
          <section className="login">
            <h2>Staff sign in</h2>
            <p>
              Use a locally seeded demo account. This is not an official ZRP
              system.
            </p>
            <form onSubmit={login}>
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </label>
              <button disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </section>
        ) : session.user.role === 'ADMIN' ? (
          <AdminPanel api={api} />
        ) : (
          <>
            <OperationsPanel api={api} user={session.user} />
            <section>
              <h2>
                {session.user.role === 'SUPERVISOR'
                  ? 'Assigned offences'
                  : 'Your activity'}
              </h2>
              <p>
                Stored demo records · refreshes every 10 seconds · {total}{' '}
                matching records
              </p>
              <label>
                Status
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All permitted states</option>
                  {[
                    'DRAFT',
                    'SUBMITTED',
                    'UNDER_REVIEW',
                    'CONFIRMED',
                    'CANCELLED',
                  ].map((state) => (
                    <option key={state}>{state}</option>
                  ))}
                </select>
              </label>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Demo plate</th>
                      <th>Category</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.vehicle.registrationNumber}</td>
                        <td>{item.category.name}</td>
                        <td>{item.status}</td>
                        <td>
                          <button
                            disabled={busy}
                            onClick={() => void open(item.id)}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!items.length && !loading && (
                <p>
                  No matching records. New officer submissions appear here
                  automatically.
                </p>
              )}
              <div className="pagination">
                <button
                  disabled={page <= 1 || busy}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </button>
                <span>Page {page}</span>
                <button
                  disabled={page * 20 >= total || busy}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            </section>
            {selected && (
              <section aria-label="Offence detail">
                <h2>
                  {selected.vehicle.registrationNumber} · {selected.status}
                </h2>
                <p>{selected.location}</p>
                <p>{selected.notes}</p>
                {selected.ticket && (
                  <div className="ticket">
                    <strong>DEMO — NOT VALID FOR PAYMENT OR ENFORCEMENT</strong>
                    <p>Reference: {selected.ticket.publicReference}</p>
                    <p>
                      Demo amount: {selected.ticket.demoFineAmountSnapshot}{' '}
                      training units · {selected.ticket.status}
                    </p>
                  </div>
                )}
                <EvidencePanel key={selected.id} api={api} token={session.token} offenceId={selected.id} draft={selected.status === 'DRAFT'} ticketId={selected.ticket?.id} officer={session.user.role === 'OFFICER'} />
                {session.user.role === 'SUPERVISOR' &&
                  ['SUBMITTED', 'UNDER_REVIEW'].includes(selected.status) && (
                    <form
                      key={`${selected.id}-${selected.status}`}
                      onSubmit={review}
                    >
                      <label>
                        Review outcome
                        <select name="status">
                          {(selected.status === 'SUBMITTED'
                            ? ['UNDER_REVIEW']
                            : ['CONFIRMED', 'CANCELLED']
                          ).map((state) => (
                            <option key={state}>{state}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Review notes
                        <textarea
                          name="notes"
                          required
                          minLength={3}
                          maxLength={1000}
                        />
                      </label>
                      <button disabled={busy}>Save review</button>
                    </form>
                  )}
              </section>
            )}
          </>
        )}
        {!session && <PublicPortal />}
      </main>
    </>
  );
}
