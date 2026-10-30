import { MotoristIcon, type MotoristIconName } from './MotoristIcon';
import { VehicleManager } from './VehicleManager';
import { TicketScanner } from './TicketQr';
import { DriverBalance, PointsHistory } from './DriverPoints';
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
  driverIdentification?: string;
  pointsDeducted?: number;
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
  driverPoints?: DriverBalance;
  currency?: string;
  totalPayable: number;
  pendingFines: number;
  demeritPoints: number;
  paidFines: number;
  registeredVehicles: number;
};
const motoristPages = [
  {
    title: 'Dashboard',
    mobile: 'Home',
    path: '/motorist/dashboard',
    icon: 'home',
  },
  {
    title: 'My Infringements',
    mobile: 'Fines',
    path: '/motorist/infringements',
    icon: 'fine',
  },
  {
    title: 'Payments',
    mobile: 'Payments',
    path: '/motorist/payments',
    icon: 'payment',
  },
  {
    title: 'My Vehicles',
    mobile: 'Vehicles',
    path: '/motorist/vehicles',
    icon: 'vehicle',
  },
  {
    title: 'Profile',
    mobile: 'Profile',
    path: '/motorist/profile',
    icon: 'profile',
  },
] as const;
const secondaryPages = [
  { title: 'Traffic Notices & Reports', path: '/motorist/notices' },
  { title: 'My Reports', path: '/motorist/reports' },
];
const currentPage = () =>
  [...motoristPages, ...secondaryPages].find(
    (p) =>
      window.location.pathname === p.path ||
      (p.title === 'My Vehicles' &&
        window.location.pathname.startsWith(p.path + '/')),
  )?.title ?? 'Dashboard';
const money = formatCurrency;
const date = (value: string | null) =>
  value ? new Date(value).toLocaleString() : 'Not specified';
export function receiptText(r: Receipt) {
  return [
    'TRAFFIC OPERATIONS',
    'Smart Traffic',
    'In support of ZRP',
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
  initialQrToken,
  onQrConsumed,
  api,
  accountToken,
  user,
  onSessionExpired,
}: {
  initialQrToken?: string;
  onQrConsumed?: () => void;
  api: AccountApi;
  accountToken: string;
  user: { name: string };
  onSessionExpired: () => void;
}) {
  const [tab, setTab] = useState<string>(currentPage);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
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
  useEffect(() => {
    const pop = () => {
      setTab(currentPage());
      setPage(1);
      setSelected(null);
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  function navigate(title: string) {
    const destination = [...motoristPages, ...secondaryPages].find(
      (p) => p.title === title,
    );
    if (!destination) return;
    window.history.pushState({}, '', destination.path);
    setTab(title);
    setPage(1);
    setSelected(null);
    setError('');
  }
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
    if (tab === 'Dashboard')
      setPayments((await api('/motorist/payments?page=1&pageSize=3')).items);
    setTotal(data.total);
    if (endpoint === 'payments') setPayments(data.items);
    else if (endpoint === 'incidents') setIncidents(data.items);
    else setTickets(data.items);
  }
  useEffect(() => {
    if (tab === 'My Vehicles') return;
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
        const recentPayments =
          tab === 'Dashboard'
            ? await api('/motorist/payments?page=1&pageSize=3')
            : null;
        if (!active) return;
        if (recentPayments) setPayments(recentPayments.items);
        setSummary(s);
        setTotal(data.total);
        if (endpoint === 'payments') setPayments(data.items);
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
      <nav
        className="motorist-nav mobile-bottom-nav"
        aria-label="Motorist services"
      >
        {motoristPages.map((item) => (
          <button
            key={item.title}
            aria-label={item.title}
            aria-current={
              tab === item.title ||
              (item.title === 'Profile' &&
                secondaryPages.some((p) => p.title === tab))
                ? 'page'
                : undefined
            }
            onClick={() => navigate(item.title)}
          >
            <MotoristIcon name={item.icon} />
            <span className="desktop-label">{item.title}</span>
            <span className="mobile-label">{item.mobile}</span>
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
          <h3>More services</h3>
          <div className="secondary-services">
            {secondaryPages.map((item) => (
              <button
                className="secondary"
                key={item.title}
                onClick={() => navigate(item.title)}
              >
                {item.title}
              </button>
            ))}
          </div>
          <p>
            Vehicle links are verified and managed by an administrator. Ticket
            access can also be verified using your ticket reference and
            verification code.
          </p>
        </section>
      ) : tab === 'My Vehicles' ? (
        <VehicleManager
          api={api}
          onTicket={(reference) =>
            void perform(async () => {
              const ticket = await api('/motorist/infringements/' + reference);
              navigate('My Infringements');
              setSelected(ticket);
            })
          }
        />
      ) : tab === 'Traffic Notices & Reports' ? (
        <PublicPortal
          accountToken={accountToken}
          onSessionExpired={onSessionExpired}
        />
      ) : (
        <>
          <section className="motorist-welcome">
            <h2
              aria-label={
                tab === 'Dashboard' ? `Welcome back, ${user.name}` : undefined
              }
            >
              {tab === 'Dashboard' ? (
                <>
                  Welcome back
                  <span className="desktop-welcome-name">, {user.name}</span>
                </>
              ) : (
                tab
              )}
            </h2>
            <p>
              {tab === 'Dashboard'
                ? 'Here is your traffic account overview.'
                : 'Your account records refresh every 10 seconds.'}
            </p>
            {tab === 'Dashboard' &&
              (!summary ? (
                <p role="status">Loading your traffic records...</p>
              ) : (
                <div className="account-summary">
                  {(
                    [
                      [
                        'Total Payable',
                        money(summary.totalPayable, summary.currency),
                        'receipt',
                        'payable',
                        'My Infringements',
                      ],
                      [
                        'Pending Fines',
                        summary.pendingFines,
                        'clock',
                        'pending',
                        'My Infringements',
                      ],
                      [
                        'Points Remaining',
                        summary.driverPoints?.status === 'VERIFIED'
                          ? `${summary.driverPoints.remaining} / ${summary.driverPoints.allowance}`
                          : 'Identity pending',
                        'shield',
                        'points',
                        'My Infringements',
                      ],
                      [
                        'Paid Fines',
                        summary.paidFines,
                        'payment',
                        'paid',
                        'Payments',
                      ],
                      [
                        'Registered Vehicles',
                        summary.registeredVehicles,
                        'vehicle',
                        'vehicles',
                        'My Vehicles',
                      ],
                    ] as const
                  ).map(([label, value, icon, tone, destination]) => (
                    <button
                      className="account-summary-card"
                      data-tone={tone}
                      key={label}
                      onClick={() => navigate(destination)}
                    >
                      <MotoristIcon name={icon as MotoristIconName} />
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </button>
                  ))}
                </div>
              ))}
          </section>
          {(tab === 'My Infringements' || initialQrToken) && (
            <PointsHistory balance={summary?.driverPoints} />
          )}
          {(tab === 'My Infringements' || initialQrToken) && (
            <TicketScanner
              api={api}
              initialToken={initialQrToken}
              onConsumed={onQrConsumed}
              onVerified={(reference) => {
                navigate('My Infringements');
                void api(`/motorist/infringements/${reference}`)
                  .then(setSelected)
                  .catch((e) => setError(e.message));
              }}
            />
          )}
          {tab === 'My Infringements' && (
            <button
              className="secondary"
              onClick={() => navigate('Traffic Notices & Reports')}
            >
              Use ticket reference & verification code
            </button>
          )}
          {['Dashboard', 'My Infringements'].includes(tab) && (
            <section>
              <div className="section-heading">
                <h2>
                  {tab === 'Dashboard' ? (
                    <>
                      <span className="desktop-label">
                        Outstanding Infringements
                      </span>
                      <span className="mobile-label">Recent Infringements</span>
                    </>
                  ) : (
                    'My Infringements'
                  )}
                </h2>
                {tab === 'Dashboard' && (
                  <button
                    className="text-action"
                    onClick={() => navigate('My Infringements')}
                  >
                    View all<span className="sr-only"> infringements</span>
                  </button>
                )}
              </div>
              {!tickets.length && (
                <p className="empty-state">
                  No traffic infringements found. Ticket verification is
                  available under Profile / Traffic Notices &amp; Reports.
                </p>
              )}
              <div className="motorist-records">
                {(tab === 'Dashboard' ? tickets.slice(0, 3) : tickets).map(
                  (t) => (
                    <article
                      className="motorist-fine"
                      data-status={t.paymentStatus}
                      key={t.reference}
                    >
                      <span className="record-state-icon">
                        <MotoristIcon
                          name={
                            t.paymentStatus === 'PAID'
                              ? 'paid'
                              : t.paymentStatus === 'PENDING'
                                ? 'clock'
                                : 'fine'
                          }
                        />
                      </span>
                      <div className="record-content">
                        <div className="record-title">
                          <h3>
                            <button
                              className="record-title-link"
                              disabled={busy}
                              onClick={() =>
                                void perform(async () =>
                                  setSelected(
                                    await api(
                                      '/motorist/infringements/' + t.reference,
                                    ),
                                  ),
                                )
                              }
                            >
                              {t.category || 'Traffic offence'}
                            </button>
                          </h3>
                          <span className="ticket-tag">{ticketLabel(t)}</span>
                        </div>
                        <p className="record-meta">
                          Vehicle: <strong>{t.registration}</strong>
                          <span>&middot;</span>
                          <time dateTime={t.issuedAt}>{date(t.issuedAt)}</time>
                        </p>
                        <p className="record-location">{t.location}</p>
                        <p className="record-points">
                          {t.driverIdentification === 'ASSESSED'
                            ? `${t.pointsDeducted ?? 0} points deducted`
                            : t.driverIdentification === 'LEGACY_NOT_ASSESSED'
                              ? 'Historical points not reassessed'
                              : 'Pending driver identification'}
                        </p>
                        <div className="record-footer">
                          <div>
                            <strong className="fine-amount">
                              {money(t.amount, t.currency)}
                            </strong>
                            <span className="payment-state">
                              {readable(t.paymentStatus)}
                            </span>
                          </div>
                          {['PENDING', 'OVERDUE'].includes(t.paymentStatus) && (
                            <button
                              className="pay-action"
                              disabled={busy}
                              onClick={() => begin(t)}
                            >
                              Pay Now
                            </button>
                          )}
                          {t.paymentStatus === 'PAID' &&
                            t.receiptPaymentReference && (
                              <button
                                className="secondary"
                                disabled={busy}
                                onClick={() =>
                                  void openReceipt(t.receiptPaymentReference!)
                                }
                              >
                                View Receipt
                              </button>
                            )}
                        </div>
                      </div>
                    </article>
                  ),
                )}
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
          {['Dashboard', 'Payments'].includes(tab) && (
            <section
              className={
                tab === 'Dashboard' ? 'recent-payments' : 'payment-history'
              }
            >
              <div className="section-heading">
                <h2>
                  {tab === 'Dashboard' ? 'Recent Payments' : 'Payment History'}
                </h2>
                {tab === 'Dashboard' && (
                  <button
                    className="text-action"
                    onClick={() => navigate('Payments')}
                  >
                    View all<span className="sr-only"> payments</span>
                  </button>
                )}
              </div>
              {!payments.length && (
                <p className="empty-state">No payment history available.</p>
              )}
              {payments.map((p) => (
                <article
                  className="motorist-payment"
                  data-status={p.status}
                  key={p.reference}
                >
                  <span className="record-state-icon">
                    <MotoristIcon
                      name={p.status === 'SUCCESS' ? 'paid' : 'payment'}
                    />
                  </span>
                  <div className="payment-content">
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
                  </div>
                  {p.status === 'SUCCESS' && (
                    <button
                      className="secondary"
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
          {tab !== 'Dashboard' && (
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
          )}
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
              <PointsHistory balance={summary?.driverPoints} />
              <p>
                {selected.driverIdentification === 'ASSESSED'
                  ? `${selected.pointsDeducted ?? 0} points deducted`
                  : selected.driverIdentification === 'LEGACY_NOT_ASSESSED'
                    ? 'Historical points not reassessed'
                    : 'Pending driver identification — no points deducted.'}
              </p>
              {['PENDING', 'OVERDUE'].includes(selected.paymentStatus) && (
                <button onClick={() => setPaying(selected)}>
                  Pay Now (Simulation)
                </button>
              )}
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
