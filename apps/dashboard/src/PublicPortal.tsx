import { Field } from './Field';
import { apiUrl, responseError, serviceUnavailable } from './api';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { readable, StatusBadge } from './presentation';
type Ticket = {
  warning: string;
  reference: string;
  category: string;
  demoAmount: string;
  status: string;
  paymentStatus: string;
  receiptReference: string | null;
  simulatedAt: string | null;
};
type Notices = {
  notice: string;
  alerts: { id: string; title: string; message: string }[];
};
export function PublicPortal({
  accountToken,
  onSessionExpired,
}: {
  accountToken: string;
  onSessionExpired: () => void;
}) {
  const [notices, setNotices] = useState<Notices | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<{
    requestKey: string;
    type: string;
    location: string;
    description: string;
  } | null>(null);
  async function call(path: string, body?: unknown, access = '') {
    let response: Response;
    try {
      response = await fetch(apiUrl(`/public${path}`), {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${access || accountToken}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new Error(serviceUnavailable);
    }
    if (!response.ok) {
      if (response.status === 401 && !access) onSessionExpired();
      if (response.status === 401 && access) {
        setToken('');
        setTicket(null);
      }
      throw await responseError(response);
    }
    return response.status === 204 ? null : response.json();
  }
  useEffect(() => {
    let active = true;
    const refresh = () =>
      void call('/notices')
        .then((data) => {
          if (active) setNotices(data);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void perform(async () => {
      const result = await call('/tickets/verify', {
        reference: String(data.get('reference')).trim(),
        verificationCode: String(data.get('code')).trim(),
      });
      setToken(result.token);
      setTicket(result.ticket);
      form.reset();
    });
  }
  function report(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    pending.current ??= {
      requestKey: crypto.randomUUID(),
      type: String(data.get('type')),
      location: String(data.get('location')),
      description: String(data.get('description')),
    };
    void perform(async () => {
      const result = await call('/incidents', pending.current);
      pending.current = null;
      form.reset();
      setMessage(result.message);
    });
  }
  return (
    <section aria-label="User services" aria-busy={busy}>
      <h2>My motorist services</h2>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <h3>Traffic Notices</h3>
      <p>{notices?.notice ?? 'Loading notices…'}</p>
      <p>Traffic alerts refresh every 30 seconds.</p>
      {notices && notices.alerts.length === 0 && (
        <p>No traffic notices available.</p>
      )}
      {notices?.alerts.map((alert) => (
        <article key={alert.id}>
          <h4>{alert.title}</h4>
          <p>{alert.message}</p>
        </article>
      ))}
      {!ticket ? (
        <form onSubmit={verify}>
          <h3>Find Your Traffic Ticket</h3>
          <p>
            Enter the ticket reference and verification code provided on your
            traffic ticket.
          </p>
          <Field>
            Ticket reference
            <input
              name="reference"
              placeholder="Enter the reference shown on your ticket"
              required
              minLength={10}
              maxLength={100}
              autoComplete="off"
            />
          </Field>
          <Field>
            Verification code
            <input
              name="code"
              placeholder="Enter the 16-character verification code"
              required
              pattern="[a-f0-9]{16}"
              maxLength={16}
              autoComplete="off"
              type="password"
            />
          </Field>
          <button disabled={busy}>Verify Ticket</button>
        </form>
      ) : (
        <article className="ticket">
          <h3>Verified Traffic Ticket</h3>
          <p>Reference: {ticket.reference}</p>
          <p>
            {ticket.category} · <StatusBadge value={ticket.status} />
          </p>
          <p>Amount: {ticket.demoAmount}</p>
          <p>
            Payment status:{' '}
            <StatusBadge value={ticket.paymentStatus} kind="payment" />
          </p>
          {ticket.receiptReference && (
            <p>
              Receipt: {ticket.receiptReference}
              <br />
              {ticket.simulatedAt &&
                new Date(ticket.simulatedAt).toLocaleString()}
            </p>
          )}
          <p>
            No money is taken. This does not settle a legal fine. Ticket access
            expires after 10 minutes.
          </p>
          <button
            disabled={
              busy ||
              ticket.status === 'CANCELLED' ||
              ticket.paymentStatus === 'SIMULATED_PAID'
            }
            onClick={() =>
              void perform(async () =>
                setTicket(await call('/tickets/payment-simulation', {}, token)),
              )
            }
          >
            Simulate payment
          </button>{' '}
          <button
            disabled={busy}
            onClick={() =>
              void perform(async () =>
                setTicket(await call('/tickets/current', undefined, token)),
              )
            }
          >
            Refresh ticket status
          </button>{' '}
          <button
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                await call('/tickets/logout', {}, token);
                setTicket(null);
                setToken('');
              })
            }
          >
            Close ticket access
          </button>
        </article>
      )}
      <form onSubmit={report}>
        <h3>Report a Road Incident</h3>
        <p>
          Submit a road incident report for review by the traffic operations
          team.
        </p>
        <p className="help-text">
          For emergencies requiring immediate assistance, contact the
          appropriate emergency service.
        </p>
        <fieldset disabled={busy || pending.current != null}>
          <Field>
            Report type
            <select name="type">
              {['ACCIDENT', 'HAZARD', 'CONGESTION', 'OTHER'].map((type) => (
                <option key={type} value={type}>
                  {readable(type)}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            Incident location
            <input
              name="location"
              placeholder="Street, intersection or area"
              required
              minLength={3}
              maxLength={200}
            />
          </Field>
          <Field>
            Incident description
            <textarea
              name="description"
              placeholder="Describe the incident and relevant details"
              required
              minLength={3}
              maxLength={2000}
            />
          </Field>
        </fieldset>
        <button disabled={busy}>
          {pending.current ? 'Retry same report' : 'Submit Incident Report'}
        </button>
      </form>
    </section>
  );
}
