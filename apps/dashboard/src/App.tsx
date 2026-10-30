import { Field } from './Field';
import { PublicQrStatus } from './TicketQr';
import { apiUrl, responseError, serviceUnavailable } from './api';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { AdminPanel } from './AdminPanel';
import { StaffWorkspace } from './OfficerWorkspace';
import { MotoristDashboard } from './MotoristDashboard';
import { EvidencePanel } from './EvidencePanel';
import {
  roleLabel,
  statusLabel,
  StatusBadge,
  formatCurrency,
  paymentMethodLabel,
  ticketLabel,
} from './presentation';

type User = {
  id: string;
  name: string;
  role: 'USER' | 'OFFICER' | 'SUPERVISOR' | 'ADMIN';
};
type Offence = {
  observedAt?: string;
  officer?: { name: string };
  paymentStatus?: string | null;
  id: string;
  location: string;
  notes: string;
  status: string;
  revision: number;
  vehicle: { registrationNumber: string };
  category: { name: string };
  ticket: null | {
    id: string;
    publicReference: string;
    displayReference?: string;
    demoFineAmountSnapshot: string;
    demeritPointsSnapshot?: number;
    motorist?: { name: string };
    status: string;
    payments?: { method: string; status: string; paidAt: string | null }[];
  };
};
type Session = { token: string; user: User };
export function App() {
  const [qrToken, setQrToken] = useState(() =>
    window.location.pathname === '/verify'
      ? (new URLSearchParams(window.location.hash.slice(1)).get('token') ??
        new URLSearchParams(window.location.search).get('token') ??
        '')
      : '',
  );
  useEffect(() => {
    if (window.location.pathname === '/verify')
      window.history.replaceState({}, '', '/verify');
  }, []);
  const adminLogin = window.location.pathname === '/admin';
  const [session, setSession] = useState<Session | null>(null);
  const currentSession = useRef<Session | null>(null);
  currentSession.current = session;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Offence[]>([]);
  const [selected, setSelected] = useState<Offence | null>(null);
  const detailPanel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selected) detailPanel.current?.scrollIntoView?.({ block: 'start' });
  }, [selected?.id]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [search, setSearch] = useState('');
  const api = useCallback(
    async (path: string, body?: unknown, method?: string) => {
      let response: Response;
      try {
        response = await fetch(apiUrl(path), {
          method: method ?? (body === undefined ? 'GET' : 'POST'),
          headers: {
            ...(body instanceof FormData
              ? {}
              : { 'Content-Type': 'application/json' }),
            ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
          },
          body:
            body instanceof FormData
              ? body
              : body === undefined
                ? undefined
                : JSON.stringify(body),
          signal: AbortSignal.timeout(body instanceof FormData ? 60000 : 10000),
        });
      } catch {
        throw new Error(serviceUnavailable);
      }
      if (
        response.status === 401 &&
        session &&
        currentSession.current?.token === session.token
      ) {
        setSession(null);
        setItems([]);
        setSelected(null);
      }
      if (!response.ok) {
        throw await responseError(response);
      }
      return response.status === 204 ? undefined : response.json();
    },
    [session],
  );

  useEffect(() => {
    if (
      !session ||
      session.user.role === 'ADMIN' ||
      session.user.role === 'USER'
    ) {
      setLoading(false);
      return;
    }
    let active = true;
    const refresh = async () => {
      if (active) setLoading(true);
      try {
        const data = await api(
          `/offences?page=${page}&pageSize=20&q=${encodeURIComponent(search)}${status ? `&status=${status}` : ''}${paymentStatus ? `&paymentStatus=${paymentStatus}` : ''}`,
        );
        if (active) {
          setItems(data.items);
          setSelected((old) =>
            old
              ? (data.items.find((item: Offence) => item.id === old.id) ?? old)
              : null,
          );
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
  }, [api, session, page, status, search, paymentStatus]);

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
          category: adminLogin ? 'ADMIN' : form.get('category'),
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
      <header
        className={
          ['USER', 'OFFICER', 'SUPERVISOR'].includes(session?.user.role ?? '')
            ? 'motorist-header'
            : undefined
        }
      >
        <div>
          <span className="eyebrow">TRAFFIC OPERATIONS</span>
          <h1>Smart Traffic</h1>
          <p className="brand-subtitle">In support of ZRP</p>
        </div>
        {session && (
          <div className="session-info">
            <div className="session-identity">
              <strong>{session.user.name}</strong>
              <span className="session-role">
                {roleLabel(session.user.role)}
              </span>
            </div>
            <button disabled={busy} onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        )}
      </header>
      <main
        className={
          ['USER', 'OFFICER', 'SUPERVISOR'].includes(session?.user.role ?? '')
            ? 'motorist-main'
            : undefined
        }
        aria-busy={busy || loading}
      >
        {loading && <p role="status">Refreshing records…</p>}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {!session && qrToken && <PublicQrStatus api={api} token={qrToken} />}
        {!session ? (
          <section className="login">
            <h2>{adminLogin ? 'Administrator sign in' : 'Sign in'}</h2>
            <p>
              Sign in with your account to access traffic management services.
            </p>
            <form onSubmit={login}>
              {!adminLogin && (
                <Field>
                  Login category
                  <select
                    name="category"
                    defaultValue="USER"
                    required
                    disabled={busy}
                  >
                    <option value="USER">User</option>
                    <option value="OFFICER">Officer</option>
                    <option value="SUPERVISOR">Supervisor</option>
                  </select>
                </Field>
              )}
              <Field>
                Email
                <input
                  name="email"
                  placeholder="name@example.com"
                  type="email"
                  autoComplete="username"
                  required
                />
              </Field>
              <Field>
                Password
                <input
                  name="password"
                  placeholder="Enter your password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </Field>
              <button disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </section>
        ) : session.user.role === 'USER' ? (
          <MotoristDashboard
            initialQrToken={qrToken}
            onQrConsumed={() => setQrToken('')}
            api={api}
            user={session.user}
            accountToken={session.token}
            onSessionExpired={() => {
              setSession(null);
              setError('Your session expired. Please sign in again.');
            }}
          />
        ) : session.user.role === 'ADMIN' ? (
          <AdminPanel api={api} />
        ) : (
          <StaffWorkspace
            api={api}
            token={session.token}
            user={session.user}
            onOpen={(id) => void open(id)}
          >
            <section>
              <h2>
                {session.user.role === 'SUPERVISOR'
                  ? 'Assigned offences'
                  : 'Your activity'}
              </h2>
              <p>
                Activity records · refreshes every 10 seconds · {total} matching
                records
              </p>
              <div className="filter-bar">
                <Field>
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
                      <option key={state} value={state}>
                        {statusLabel(state)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field>
                  Search plate, location or ticket reference
                  <input
                    value={search}
                    placeholder="Registration, location or ticket reference"
                    maxLength={80}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                  />
                </Field>
                <Field>
                  Payment status
                  <select
                    value={paymentStatus}
                    onChange={(e) => {
                      setPaymentStatus(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All payments</option>
                    {['PENDING', 'PAID', 'OVERDUE', 'FAILED'].map((s) => (
                      <option value={s} key={s}>
                        {statusLabel(s)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div
                className="table-wrap"
                tabIndex={0}
                role="region"
                aria-label="Traffic offences table"
              >
                <table>
                  <thead>
                    <tr>
                      <th>Vehicle registration</th>
                      <th>Category</th>
                      <th>Status</th>
                      <th>Payment</th>
                      <th className="action-column">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.vehicle.registrationNumber}</td>
                        <td>{item.category.name}</td>
                        <td>
                          <StatusBadge value={item.status} />
                        </td>
                        <td>
                          {item.paymentStatus ? (
                            <StatusBadge value={item.paymentStatus} />
                          ) : (
                            '—'
                          )}
                        </td>
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
                <p className="empty-state">
                  No traffic offences found. New officer submissions appear here
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
              <section aria-label="Offence detail" ref={detailPanel}>
                <h2>
                  {selected.vehicle.registrationNumber} ·{' '}
                  <StatusBadge value={selected.status} />
                </h2>
                <h3>{selected.category.name}</h3>
                <p>
                  Officer: {selected.officer?.name ?? 'Not recorded'} ·
                  Motorist:{' '}
                  {selected.ticket?.motorist?.name ?? 'No linked motorist'}
                </p>
                {selected.observedAt && (
                  <p>
                    Observed {new Date(selected.observedAt).toLocaleString()}
                  </p>
                )}
                {selected.ticket && (
                  <p>
                    {selected.ticket.demeritPointsSnapshot ?? 0} demerit points
                  </p>
                )}
                <p>{selected.location}</p>
                <p>{selected.notes}</p>
                {session.user.role === 'OFFICER' &&
                  selected.status === 'DRAFT' && (
                    <form
                      key={`${selected.id}-${selected.revision}`}
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const data = new FormData(e.currentTarget);
                        setBusy(true);
                        setError('');
                        try {
                          const updated = await api(
                            `/offences/${selected.id}`,
                            {
                              revision: selected.revision,
                              location: data.get('location'),
                              notes: data.get('notes'),
                            },
                            'PATCH',
                          );
                          setSelected(updated);
                          setItems((old) =>
                            old.map((row) =>
                              row.id === updated.id ? updated : row,
                            ),
                          );
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <h3>Edit your draft</h3>
                      <Field>
                        Draft location
                        <input
                          name="location"
                          required
                          minLength={3}
                          maxLength={200}
                          defaultValue={selected.location}
                        />
                      </Field>
                      <Field>
                        Draft notes
                        <textarea
                          name="notes"
                          required
                          minLength={3}
                          maxLength={2000}
                          defaultValue={selected.notes}
                        />
                      </Field>
                      <button disabled={busy}>Save draft changes</button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          setError('');
                          try {
                            await api(`/offences/${selected.id}/discard`, {});
                            const updated = await api(
                              `/offences/${selected.id}`,
                            );
                            setSelected(updated);
                            setItems((old) =>
                              old.map((row) =>
                                row.id === updated.id ? updated : row,
                              ),
                            );
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Discard draft (retain audit)
                      </button>
                    </form>
                  )}
                {selected.ticket && (
                  <div className="ticket">
                    <h3>Traffic ticket</h3>
                    <p>Reference: {ticketLabel(selected.ticket)}</p>
                    {selected.paymentStatus && (
                      <p>
                        Payment: <StatusBadge value={selected.paymentStatus} />
                      </p>
                    )}
                    {selected.ticket.payments?.[0] && (
                      <p>
                        Method:{' '}
                        {paymentMethodLabel(selected.ticket.payments[0].method)}{' '}
                        ·{' '}
                        {selected.ticket.payments[0].paidAt
                          ? new Date(
                              selected.ticket.payments[0].paidAt,
                            ).toLocaleString()
                          : statusLabel(selected.ticket.payments[0].status)}
                      </p>
                    )}
                    <p>
                      Amount:{' '}
                      {formatCurrency(selected.ticket.demoFineAmountSnapshot)} ·{' '}
                      <StatusBadge value={selected.ticket.status} />
                    </p>
                  </div>
                )}
                <EvidencePanel
                  key={selected.id}
                  api={api}
                  token={session.token}
                  offenceId={selected.id}
                  draft={selected.status === 'DRAFT'}
                  ticketId={selected.ticket?.id}
                  officer={session.user.role === 'OFFICER'}
                />
                {session.user.role === 'SUPERVISOR' &&
                  ['SUBMITTED', 'UNDER_REVIEW'].includes(selected.status) && (
                    <form
                      key={`${selected.id}-${selected.status}`}
                      onSubmit={review}
                    >
                      <Field>
                        Review outcome
                        <select name="status">
                          {(selected.status === 'SUBMITTED'
                            ? ['UNDER_REVIEW']
                            : ['CONFIRMED', 'CANCELLED']
                          ).map((state) => (
                            <option key={state} value={state}>
                              {statusLabel(state)}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field>
                        Review notes
                        <textarea
                          name="notes"
                          required
                          minLength={3}
                          maxLength={1000}
                        />
                      </Field>
                      <button disabled={busy}>Save review</button>
                    </form>
                  )}
              </section>
            )}
          </StaffWorkspace>
        )}
      </main>
      <footer className="app-footer">
        Academic Prototype — No real payments or enforcement
      </footer>
    </>
  );
}
