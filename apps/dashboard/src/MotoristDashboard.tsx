import { useEffect, useRef, useState } from 'react';
import { PublicPortal } from './PublicPortal';
import { Field } from './Field';
import {
  readable,
  StatusBadge,
  formatCurrency,
  paymentMethodLabel,
  ticketLabel,
} from './presentation';

export type { Api as AccountApi } from './AdminPanel';
import type { Api as AccountApi } from './AdminPanel';
type Ticket = {
  displayReference?: string;
  currency?: string;
  receiptPaymentReference?: string | null;
  reference: string;
  amount: string;
  category: string;
  registration: string;
  location: string;
  issuedAt: string;
  dueAt: string | null;
  status: string;
  paymentStatus: string;
  demeritPoints: number;
  officer: string;
  serviceNumber: string | null;
  description: string;
  timeline: { status: string; at: string }[];
  payments?: Payment[];
};
type Payment = {
  currency?: string;
  ticketDisplayReference?: string;
  reference: string;
  ticketReference?: string;
  amount: string;
  method: string;
  status: string;
  last4: string | null;
  createdAt: string;
  paidAt: string | null;
  receiptReference: string | null;
  failureReason: string | null;
};
type Receipt = Payment & {
  ticketReference: string;
  motorist: string;
  registration: string;
  offence: string;
  notice: string;
};
type Summary = {
  currency?: string;
  totalPayable: number;
  pendingFines: number;
  demeritPoints: number;
  paidFines: number;
  registeredVehicles: number;
};
type Vehicle = {
  activeInfringements: number;
  totalPayable: number;
  registrationNumber: string;
  make: string;
  model: string;
  colour: string;
  registrationStatus: string;
};
const money = formatCurrency;
const date = (value: string | null) =>
  value ? new Date(value).toLocaleString() : 'Not specified';
export function receiptText(r: Receipt) {
  return [
    'ZRP Smart Traffic Management System',
    'PAYMENT RECEIPT',
    `Receipt: ${r.receiptReference}`,
    `Transaction: ${r.reference}`,
    `Ticket: ${r.ticketDisplayReference ?? 'Traffic ticket'}`,
    `Motorist: ${r.motorist}`,
    `Vehicle: ${r.registration}`,
    `Offence: ${r.offence}`,
    `Amount: ${money(r.amount, r.currency)}`,
    `Method: ${paymentMethodLabel(r.method)} ${r.last4 ? `•••• ${r.last4}` : ''}`,
    `Status: ${r.status === 'SUCCESS' ? 'Paid' : readable(r.status)}`,
    `Date: ${date(r.paidAt)}`,
    r.notice,
  ].join('\n');
}
export function MotoristDashboard({
  api,
  accountToken,
  user,
  onSessionExpired,
}: {
  api: AccountApi;
  accountToken: string;
  user: { name: string };
  onSessionExpired: () => void;
}) {
  const [tab, setTab] = useState('Dashboard');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [incidents, setIncidents] = useState<
    { type: string; location: string; status: string; createdAt: string }[]
  >([]);
  const [page, setPage] = useState(1),
    [total, setTotal] = useState(0);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [paying, setPaying] = useState<Ticket | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [method, setMethod] = useState('ECOCASH');
  const requestKey = useRef<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    receiptDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (paying || payment) dialog.current?.showModal();
    else dialog.current?.close();
  }, [paying, payment]);
  useEffect(() => {
    if (receipt) receiptDialog.current?.showModal();
    else receiptDialog.current?.close();
  }, [receipt]);
  async function refresh() {
    const s = await api('/motorist/dashboard');
    setSummary(s);
    const endpoint =
      tab === 'Payments'
        ? 'payments'
        : tab === 'My Vehicles'
          ? 'vehicles'
          : tab === 'My Reports'
            ? 'incidents'
            : 'infringements';
    const data = await api(`/motorist/${endpoint}?page=${page}&pageSize=12`);
    setTotal(data.total);
    if (endpoint === 'payments') setPayments(data.items);
    else if (endpoint === 'vehicles') setVehicles(data.items);
    else if (endpoint === 'incidents') setIncidents(data.items);
    else setTickets(data.items);
  }
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const s = await api('/motorist/dashboard');
        const endpoint =
          tab === 'Payments'
            ? 'payments'
            : tab === 'My Vehicles'
              ? 'vehicles'
              : tab === 'My Reports'
                ? 'incidents'
                : 'infringements';
        const data = await api(
          `/motorist/${endpoint}?page=${page}&pageSize=12`,
        );
        if (!active) return;
        setSummary(s);
        setTotal(data.total);
        if (endpoint === 'payments') setPayments(data.items);
        else if (endpoint === 'vehicles') setVehicles(data.items);
        else if (endpoint === 'incidents') setIncidents(data.items);
        else setTickets(data.items);
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api, page, tab]);
  async function perform(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function finish(outcome: string) {
    if (!payment) return;
    const result = await api(
      `/motorist/payments/${payment.reference}/outcome`,
      { outcome },
    );
    setPayment(result);
    await refresh();
    if (selected)
      setSelected(await api(`/motorist/infringements/${selected.reference}`));
  }
  function download(r: Receipt) {
    const url = URL.createObjectURL(
      new Blob([receiptText(r)], { type: 'text/plain;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${r.receiptReference}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const openReceipt = (reference: string) =>
    perform(async () => {
      setReceipt(await api(`/motorist/payments/${reference}/receipt`));
    });
  function begin(t: Ticket) {
    requestKey.current = crypto.randomUUID();
    setUncertain(false);
    setMethod('ECOCASH');
    setPaying(t);
    setPayment(null);
  }
  return (
    <div className="motorist-workspace">
      <nav className="workspace-tabs" aria-label="Motorist services">
        {[
          'Dashboard',
          'My Infringements',
          'Payments',
          'My Vehicles',
          'Traffic Notices & Reports',
          'My Reports',
          'Profile',
        ].map((item) => (
          <button
            key={item}
            aria-current={tab === item ? 'page' : undefined}
            onClick={() => {
              setTab(item);
              setPage(1);
              setSelected(null);
            }}
          >
            {item}
          </button>
        ))}
      </nav>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {tab === 'Profile' ? (
        <section>
          <h2>My Profile</h2>
          <p>{user.name}</p>
          <p>Motorist</p>
          <p>
            Vehicle links are verified and managed by an administrator. Ticket
            access can also be verified using your ticket reference and
            verification code.
          </p>
        </section>
      ) : tab === 'Traffic Notices & Reports' ? (
        <PublicPortal
          accountToken={accountToken}
          onSessionExpired={onSessionExpired}
        />
      ) : (
        <>
          <section className="ledger-heading">
            <span className="eyebrow">MOTORIST SERVICES</span>
            <h2>{tab === 'Dashboard' ? `Welcome, ${user.name}` : tab}</h2>
            <p>Account records refresh every 10 seconds.</p>
          </section>
          {!summary ? (
            <p role="status">Loading your traffic records…</p>
          ) : (
            <div className="ledger-metrics">
              {[
                [
                  'Total Payable',
                  money(summary.totalPayable, summary.currency),
                ],
                ['Pending Fines', summary.pendingFines],
                ['Demerit Points', `${summary.demeritPoints} pts`],
                ['Paid Fines', summary.paidFines],
                ['Registered Vehicles', summary.registeredVehicles],
              ].map(([label, value]) => (
                <div className="metric-card" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          )}
          {['Dashboard', 'My Infringements'].includes(tab) && (
            <section>
              <h2>My Infringements</h2>
              <p className="muted">
                Configured reference amounts and points. Payment does not remove
                demerit points.
              </p>
              {!tickets.length && (
                <p className="empty-state">
                  No active traffic infringements. Use Traffic Notices &amp;
                  Reports to verify an existing ticket.
                </p>
              )}
              <div className="ledger-grid">
                {tickets.map((t) => (
                  <article
                    className="infringement-card"
                    data-status={t.paymentStatus}
                    key={t.reference}
                  >
                    <div className="card-title">
                      <h3>{t.category || 'Traffic offence'}</h3>
                      <StatusBadge value={t.paymentStatus} />
                    </div>
                    <p>
                      <strong>{t.registration}</strong> · {date(t.issuedAt)}
                    </p>
                    <p className="reference ticket-reference">
                      {ticketLabel(t)}
                    </p>
                    <p className="record-location">
                      <span className="muted">Location</span> {t.location}
                    </p>
                    <p>
                      <strong className="points">
                        {t.demeritPoints} demerit points
                      </strong>{' '}
                      · <StatusBadge value={t.status} />
                    </p>
                    <div className="card-actions">
                      <strong className="fine-amount">
                        {money(t.amount, t.currency)}
                      </strong>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          void perform(async () =>
                            setSelected(
                              await api(
                                `/motorist/infringements/${t.reference}`,
                              ),
                            ),
                          )
                        }
                      >
                        View details
                      </button>
                      {t.paymentStatus === 'PAID' &&
                        t.receiptPaymentReference && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              void openReceipt(t.receiptPaymentReference!)
                            }
                          >
                            View Receipt
                          </button>
                        )}
                      {['PENDING', 'OVERDUE'].includes(t.paymentStatus) && (
                        <button disabled={busy} onClick={() => begin(t)}>
                          Pay Now
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
          {tab === 'My Vehicles' && (
            <section>
              <h2>Registered Vehicles</h2>
              {!vehicles.length && (
                <p className="empty-state">No registered vehicles found.</p>
              )}
              <div className="ledger-grid">
                {vehicles.map((v) => (
                  <article
                    className="infringement-card"
                    key={v.registrationNumber}
                  >
                    <h3>{v.registrationNumber}</h3>
                    <p>
                      {v.make} {v.model} · {v.colour}
                    </p>
                    <StatusBadge value={v.registrationStatus} />
                    <p>
                      {v.activeInfringements} active infringements ·{' '}
                      {money(v.totalPayable)} outstanding
                    </p>
                  </article>
                ))}
              </div>
            </section>
          )}
          {tab === 'My Reports' && (
            <section>
              <h2>My Incident Reports</h2>
              {!incidents.length && (
                <p className="empty-state">No incidents found.</p>
              )}
              {incidents.map((r, i) => (
                <article className="infringement-card" key={i}>
                  <h3>{readable(r.type)}</h3>
                  <p>
                    {r.location} · {date(r.createdAt)}
                  </p>
                  <StatusBadge value={r.status} kind="incident" />
                </article>
              ))}
            </section>
          )}
          {tab === 'Payments' && (
            <section>
              <h2>Payment History</h2>
              {!payments.length && (
                <p className="empty-state">No payment history available.</p>
              )}
              {payments.map((p) => (
                <article
                  className="infringement-card payment-card"
                  data-status={p.status}
                  key={p.reference}
                >
                  <div className="card-title">
                    <h3>
                      {money(p.amount, p.currency)} ·{' '}
                      {paymentMethodLabel(p.method)}
                    </h3>
                    <StatusBadge value={p.status} />
                  </div>
                  <p className="muted payment-reference">
                    Transaction: {p.reference}
                  </p>
                  <p>
                    Ticket:{' '}
                    <span className="reference">
                      {p.ticketDisplayReference ?? 'Traffic ticket'}
                    </span>
                  </p>
                  <p>{date(p.createdAt)}</p>
                  {p.failureReason && <p>{p.failureReason}</p>}
                  {p.status === 'SUCCESS' && (
                    <button
                      onClick={() => void openReceipt(p.reference)}
                      disabled={busy}
                    >
                      View Receipt
                    </button>
                  )}
                  {p.status === 'PROCESSING' && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        setPaying(null);
                        setPayment(p);
                      }}
                    >
                      Resume payment
                    </button>
                  )}
                </article>
              ))}
            </section>
          )}
          <div className="pagination">
            <button
              disabled={page === 1 || busy}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} · {total} records
            </span>
            <button
              disabled={page * 12 >= total || busy}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
          {selected && (
            <section aria-label="Infringement details">
              <h2>{selected.category}</h2>
              <p className="reference">{ticketLabel(selected)}</p>
              <p>{selected.description}</p>
              <dl className="detail-grid">
                <dt>Vehicle</dt>
                <dd>{selected.registration}</dd>
                <dt>Location</dt>
                <dd>{selected.location}</dd>
                <dt>Issuing officer</dt>
                <dd>
                  {selected.officer} {selected.serviceNumber}
                </dd>
                <dt>Due date</dt>
                <dd>{date(selected.dueAt)}</dd>
                <dt>Amount</dt>
                <dd>{money(selected.amount, selected.currency)}</dd>
                <dt>Points</dt>
                <dd>{selected.demeritPoints}</dd>
              </dl>
              <h3>Status timeline</h3>
              {selected.timeline.map((s, i) => (
                <p key={i}>
                  <StatusBadge value={s.status} /> {date(s.at)}
                </p>
              ))}
              <h3>Payment attempts</h3>
              {!selected.payments?.length && (
                <p>No payment history available.</p>
              )}
              {selected.payments?.map((p) => (
                <p key={p.reference}>
                  {paymentMethodLabel(p.method)} ·{' '}
                  <StatusBadge value={p.status} />{' '}
                  {p.status === 'SUCCESS' && (
                    <button
                      disabled={busy}
                      onClick={() => void openReceipt(p.reference)}
                    >
                      View Receipt
                    </button>
                  )}
                </p>
              ))}
              <button className="secondary" onClick={() => setSelected(null)}>
                Back to Infringements
              </button>
            </section>
          )}
        </>
      )}
      <dialog
        ref={dialog}
        aria-labelledby="payment-heading"
        onCancel={(e) => {
          e.preventDefault();
        }}
      >
        <h2 id="payment-heading">Pay Traffic Fine</h2>
        <p className="muted">Payment simulation. No money is collected.</p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {!payment && paying && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void perform(async () => {
                setUncertain(true);
                const result = await api('/motorist/payments', {
                  reference: paying.reference,
                  requestKey: requestKey.current,
                  method,
                  ...(method === 'CARD' ? { last4: '4242' } : {}),
                });
                setPayment(result);
                setUncertain(false);
              });
            }}
          >
            <p>
              {paying.category} · {paying.registration}
            </p>
            <p className="reference">{ticketLabel(paying)}</p>
            <strong className="fine-amount">
              {money(paying.amount, paying.currency)}
            </strong>
            <fieldset disabled={busy || uncertain}>
              <Field>
                Payment method
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  <option value="ECOCASH">EcoCash</option>
                  <option value="INNBUCKS">InnBucks</option>
                  <option value="CARD">Bank Card</option>
                </select>
              </Field>
              {method === 'CARD' ? (
                <>
                  <p>
                    Use these test details only. Card fields stay on this
                    device.
                  </p>
                  <Field>
                    Cardholder name
                    <input
                      required
                      defaultValue="Test Motorist"
                      maxLength={80}
                      autoComplete="off"
                    />
                  </Field>
                  <Field>
                    Test card number
                    <input
                      required
                      pattern="4242 4242 4242 4242"
                      defaultValue="4242 4242 4242 4242"
                      inputMode="numeric"
                      autoComplete="off"
                    />
                  </Field>
                  <div className="form-grid">
                    <Field>
                      Test expiry
                      <input
                        required
                        pattern="12/30"
                        defaultValue="12/30"
                        autoComplete="off"
                      />
                    </Field>
                    <Field>
                      Test CVV
                      <input
                        required
                        pattern="123"
                        defaultValue="123"
                        type="password"
                        autoComplete="off"
                      />
                    </Field>
                  </div>
                </>
              ) : (
                <Field>
                  Test mobile number
                  <input
                    required
                    pattern="0770000000"
                    defaultValue="0770000000"
                    inputMode="tel"
                    autoComplete="off"
                  />
                  <small>
                    Use 0770000000. No SMS or provider request is sent.
                  </small>
                </Field>
              )}
            </fieldset>
            <button disabled={busy}>
              {uncertain ? 'Retry same payment request' : 'Continue'}
            </button>
          </form>
        )}
        {payment && (
          <>
            <p className="reference">{payment.reference}</p>
            <p>
              {money(payment.amount, payment.currency)} ·{' '}
              {paymentMethodLabel(payment.method)}{' '}
              {payment.last4 && `•••• ${payment.last4}`}
            </p>
            <StatusBadge value={payment.status} />
            {payment.failureReason && <p>{payment.failureReason}</p>}
            {payment.status === 'PROCESSING' ? (
              <>
                <p>Confirm a simulated outcome. No funds will be deducted.</p>
                <div className="card-actions">
                  {['APPROVE', 'DECLINE', 'TIMEOUT', 'ERROR', 'CANCEL'].map(
                    (outcome) => (
                      <button
                        key={outcome}
                        className={outcome === 'APPROVE' ? '' : 'secondary'}
                        disabled={busy}
                        onClick={() => void perform(() => finish(outcome))}
                      >
                        Simulate {readable(outcome)}
                      </button>
                    ),
                  )}
                </div>
              </>
            ) : (
              payment.status === 'SUCCESS' && (
                <button
                  disabled={busy}
                  onClick={() => void openReceipt(payment.reference)}
                >
                  View Receipt
                </button>
              )
            )}
          </>
        )}
        {busy && <p role="status">Processing payment…</p>}
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            setPaying(null);
            setPayment(null);
            setError('');
          }}
        >
          Close
        </button>
      </dialog>
      <dialog
        ref={receiptDialog}
        aria-label="Payment receipt"
        onClose={() => setReceipt(null)}
      >
        {receipt && (
          <>
            <pre className="receipt">{receiptText(receipt)}</pre>
            <div className="card-actions no-print">
              <button onClick={() => window.print()}>Print / Save PDF</button>
              <button onClick={() => download(receipt)}>
                Download Receipt
              </button>
              <button className="secondary" onClick={() => setReceipt(null)}>
                Close receipt
              </button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
