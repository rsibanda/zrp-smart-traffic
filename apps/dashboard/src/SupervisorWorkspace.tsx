import { Charge, chargeLines, OffenceLines } from './OffenceLines';
import { ReactNode, useEffect, useState } from 'react';
import type { Api } from './AdminPanel';
import { MotoristIcon, MotoristIconName } from './MotoristIcon';
import { OperationsPanel } from './OperationsPanel';
import { VehicleApprovals } from './VehicleApprovals';
import {
  formatCurrency,
  paymentMethodLabel,
  readable,
  StatusBadge,
  ticketLabel,
} from './presentation';

type Row = {
  id: string;
  status: string;
  location: string;
  createdAt: string;
  observedAt?: string;
  type?: string;
  name?: string;
  startAt?: string;
  endAt?: string;
  reporter?: { name: string };
  officer?: { name: string };
  category?: { name: string };
  charges?: Charge[];
  vehicle?: { registrationNumber: string };
  paymentStatus?: string;
  ticket?: {
    displayReference?: string;
    demoFineAmountSnapshot: string;
    demeritPointsSnapshot: number;
    motorist?: { name: string };
  };
};
type Payment = {
  paymentReference: string;
  amount: string;
  currency: string;
  method: string;
  status: string;
  createdAt: string;
  paidAt?: string;
  motorist: { name: string };
  ticket: { displayReference?: string };
};
type Overview = {
  submittedOffences: number;
  openIncidents: number;
  activeCheckpoints: number;
  officers: { name: string; active: boolean }[];
};
type Summary = {
  paymentsToday: number;
  currency: string;
  pendingVehicleApprovals: number;
};
const destinations = [
  'Dashboard',
  'Offence Review',
  'Incidents',
  'Checkpoints',
  'Payments',
  'Reports',
];
const slugs: Record<string, string> = {
  Dashboard: 'dashboard',
  'Offence Review': 'reviews',
  Incidents: 'incidents',
  Checkpoints: 'checkpoints',
  Payments: 'payments',
  Reports: 'reports',
  Vehicles: 'vehicles',
  More: 'more',
  Profile: 'profile',
};
const date = (value?: string) =>
  value ? new Date(value).toLocaleString() : 'Not recorded';
const currentTab = () =>
  Object.keys(slugs).find(
    (key) => location.pathname === `/supervisor/${slugs[key]}`,
  ) ?? 'Dashboard';
export function SupervisorWorkspace({
  api,
  user,
  onOpen,
  children,
}: {
  api: Api;
  user: { id: string; name: string; role: string };
  onOpen: (id: string) => void;
  children: ReactNode;
}) {
  const [tab, setTab] = useState(currentTab),
    [overview, setOverview] = useState<Overview | null>(null),
    [summary, setSummary] = useState<Summary | null>(null);
  const [reviews, setReviews] = useState<Row[]>([]),
    [activity, setActivity] = useState<Row[]>([]),
    [incidents, setIncidents] = useState<Row[]>([]),
    [checkpoints, setCheckpoints] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]),
    [paymentPage, setPaymentPage] = useState(1),
    [paymentTotal, setPaymentTotal] = useState(0);
  const [error, setError] = useState(''),
    [revision, setRevision] = useState(0),
    [loaded, setLoaded] = useState(false);
  function navigate(value: string) {
    setTab(value);
    history.pushState(null, '', `/supervisor/${slugs[value]}`);
  }
  useEffect(() => {
    const pop = () => setTab(currentTab());
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  useEffect(() => {
    let active = true,
      fetching = false;
    async function load() {
      if (fetching) return;
      fetching = true;
      try {
        const [o, s, submitted, under, a, i, c, p] = await Promise.all([
          api('/analytics/overview'),
          api('/supervisor/summary'),
          api('/offences?status=SUBMITTED&pageSize=5'),
          api('/offences?status=UNDER_REVIEW&pageSize=5'),
          api('/offences?pageSize=5'),
          api('/incidents?pageSize=5'),
          api('/checkpoints?pageSize=5'),
          api(`/supervisor/payments?page=${paymentPage}&pageSize=10`),
        ]);
        if (active) {
          setOverview(o);
          setSummary(s);
          setReviews(
            [...submitted.items, ...under.items]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .slice(0, 5),
          );
          setActivity(a.items);
          setIncidents(i.items);
          setCheckpoints(c.items);
          setPayments(p.items);
          setPaymentTotal(p.total);
          setLoaded(true);
          setError('');
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        fetching = false;
      }
    }
    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api, paymentPage, revision]);
  function open(row: Row) {
    navigate('Offence Review');
    onOpen(row.id);
  }
  const heading = (title: string, destination: string) => (
    <div className="section-heading">
      <h2>{title}</h2>
      <button className="text-button" onClick={() => navigate(destination)}>
        View all<span className="sr-only"> {title}</span>
      </button>
    </div>
  );
  function offences(rows: Row[], recent = false) {
    return (
      <div className="command-records">
        <table>
          <thead>
            <tr>
              <th>{recent ? 'Officer / Action' : 'Offence / Ticket'}</th>
              <th>Vehicle / Motorist</th>
              <th>Date & Location</th>
              <th>Amount / Points</th>
              <th>Status</th>
              <th className="actions-column">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-status={r.status}>
                <td data-label={recent ? 'Officer / Action' : 'Offence'}>
                  <strong>
                    {recent
                      ? (r.officer?.name ?? 'Not recorded')
                      : chargeLines(r.charges)
                          .map((c) => c.name)
                          .join(', ') ||
                        r.category?.name ||
                        'Traffic offence'}
                  </strong>
                  <OffenceLines lines={chargeLines(r.charges)} />
                  <span className="reference-chip">
                    {ticketLabel(r.ticket ?? {})}
                  </span>
                  <small>
                    {recent
                      ? 'Issued infringement'
                      : `Officer: ${r.officer?.name ?? 'Not recorded'}`}
                  </small>
                </td>
                <td data-label="Vehicle / Motorist">
                  <strong>{r.vehicle?.registrationNumber}</strong>
                  <small>
                    {r.ticket?.motorist?.name ?? 'No linked motorist'}
                  </small>
                </td>
                <td data-label="Date / Location">
                  {date(r.observedAt ?? r.createdAt)}
                  <small>{r.location}</small>
                </td>
                <td data-label="Fine">
                  <strong className="command-amount">
                    {r.ticket
                      ? formatCurrency(r.ticket.demoFineAmountSnapshot)
                      : 'Not issued'}
                  </strong>
                  <small>
                    {r.ticket?.demeritPointsSnapshot ?? 0} demerit points
                  </small>
                </td>
                <td data-label="Status">
                  <StatusBadge value={r.status} />
                  {r.paymentStatus && (
                    <StatusBadge value={r.paymentStatus} kind="payment" />
                  )}
                </td>
                <td className="actions-column">
                  <button className="secondary" onClick={() => open(r)}>
                    {['SUBMITTED', 'UNDER_REVIEW'].includes(r.status)
                      ? 'Review'
                      : 'View'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="empty-state">No matching records.</p>}
      </div>
    );
  }
  const paymentSection = (
    <section>
      {tab === 'Dashboard' ? (
        heading('Recent Payments', 'Payments')
      ) : (
        <h2>Payment History</h2>
      )}
      <div className="command-records">
        <table>
          <thead>
            <tr>
              <th>Amount / Method</th>
              <th>Ticket</th>
              <th>Motorist</th>
              <th>Date & Time</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {payments.slice(0, tab === 'Dashboard' ? 5 : 10).map((p) => (
              <tr key={p.paymentReference}>
                <td data-label="Payment">
                  <strong className="command-amount">
                    {formatCurrency(p.amount, p.currency)}
                  </strong>
                  <small>{paymentMethodLabel(p.method)}</small>
                </td>
                <td data-label="Ticket">
                  <span className="reference-chip">
                    {ticketLabel(p.ticket)}
                  </span>
                </td>
                <td data-label="Motorist">{p.motorist.name}</td>
                <td data-label="Date">{date(p.paidAt ?? p.createdAt)}</td>
                <td data-label="Status">
                  <StatusBadge value={p.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!payments.length && <p className="empty-state">No payments found.</p>}
      </div>
      {tab === 'Payments' && (
        <div className="pagination">
          <button
            disabled={paymentPage === 1}
            onClick={() => setPaymentPage(paymentPage - 1)}
          >
            Previous payments
          </button>
          <span>
            Page {paymentPage} · {paymentTotal} payments
          </span>
          <button
            disabled={paymentPage * 10 >= paymentTotal}
            onClick={() => setPaymentPage(paymentPage + 1)}
          >
            Next payments
          </button>
        </div>
      )}
    </section>
  );
  const metrics: {
    label: string;
    value: string | number;
    icon: MotoristIconName;
    tone: string;
    target: string;
  }[] = [
    {
      label: 'Pending Reviews',
      value: overview?.submittedOffences ?? '—',
      icon: 'receipt',
      tone: 'amber',
      target: 'Offence Review',
    },
    {
      label: 'Active Incidents',
      value: overview?.openIncidents ?? '—',
      icon: 'fine',
      tone: 'red',
      target: 'Incidents',
    },
    {
      label: 'Active Checkpoints',
      value: overview?.activeCheckpoints ?? '—',
      icon: 'shield',
      tone: 'green',
      target: 'Checkpoints',
    },
    {
      label: 'Payments Today',
      value: summary
        ? formatCurrency(summary.paymentsToday, summary.currency)
        : '—',
      icon: 'payment',
      tone: 'blue',
      target: 'Payments',
    },
    {
      label: 'Officers Active',
      value: overview?.officers.filter((o) => o.active).length ?? '—',
      icon: 'profile',
      tone: 'blue',
      target: 'Reports',
    },
    {
      label: 'Pending Vehicle Approvals',
      value: summary?.pendingVehicleApprovals ?? '—',
      icon: 'vehicle',
      tone: 'amber',
      target: 'Vehicles',
    },
  ];
  return (
    <div className="supervisor-workspace">
      <nav
        className="supervisor-desktop-nav"
        aria-label="Command centre navigation"
      >
        {destinations.map((d) => (
          <button
            key={d}
            className={tab === d ? 'active' : 'secondary'}
            aria-current={tab === d ? 'page' : undefined}
            onClick={() => navigate(d)}
          >
            {d}
          </button>
        ))}
      </nav>
      {error && (
        <p role="alert" className="error">
          {error}{' '}
          <button onClick={() => setRevision((v) => v + 1)}>
            Retry refresh
          </button>
        </p>
      )}
      {!loaded && !error && <p role="status">Loading command centre…</p>}
      {tab === 'Dashboard' && (
        <div className="command-dashboard">
          <section className="command-welcome">
            <h2>Welcome back, {user.name}</h2>
            <p>
              Monitor enforcement activity, review offences, manage incidents
              and checkpoints.
            </p>
            <div className="command-metrics">
              {metrics.map((m) => (
                <button
                  key={m.label}
                  className={`command-metric tone-${m.tone}`}
                  onClick={() => navigate(m.target)}
                >
                  <span className="metric-top">
                    <MotoristIcon name={m.icon} />
                    <span aria-hidden="true">›</span>
                  </span>
                  <span>{m.label}</span>
                  <strong>{m.value}</strong>
                </button>
              ))}
            </div>
            <small className="muted">
              Refreshes every 10 seconds · Payments today use Harare time ·
              Active officers are enabled assigned accounts.
            </small>
          </section>
          <section className="command-reviews">
            {heading('Pending Offence Reviews', 'Offence Review')}
            {offences(reviews)}
          </section>
          <div className="command-operations">
            <section>
              {heading('Incident Queue', 'Incidents')}
              {incidents.map((r) => (
                <article className="command-compact" key={r.id}>
                  <MotoristIcon name="fine" />
                  <div>
                    <h3>{readable(r.type ?? 'Incident')}</h3>
                    <p>
                      {r.location} · {date(r.createdAt)}
                    </p>
                    <small>
                      Reported by {r.reporter?.name ?? 'Not recorded'} ·
                      Severity / team: Not recorded
                    </small>
                    <StatusBadge value={r.status} kind="incident" />
                  </div>
                  <button
                    className="secondary"
                    onClick={() => navigate('Incidents')}
                  >
                    View
                  </button>
                </article>
              ))}
              {!incidents.length && (
                <p className="empty-state">No incidents found.</p>
              )}
            </section>
            <section>
              {heading('Checkpoints', 'Checkpoints')}
              {checkpoints.map((r) => (
                <article className="command-compact" key={r.id}>
                  <MotoristIcon name="checkpoint" />
                  <div>
                    <h3>{r.name}</h3>
                    <p>{r.location}</p>
                    <small>
                      {date(r.startAt)} – {date(r.endAt)}
                    </small>
                    <small>
                      Assigned officers / vehicles checked: Not recorded
                    </small>
                    <StatusBadge value={r.status} />
                  </div>
                  <button
                    className="secondary"
                    onClick={() => navigate('Checkpoints')}
                  >
                    View
                  </button>
                </article>
              ))}
              {!checkpoints.length && (
                <p className="empty-state">No checkpoints found.</p>
              )}
            </section>
          </div>
          <div className="command-approvals">
            <VehicleApprovals
              api={api}
              onChange={() => setRevision((v) => v + 1)}
            />
          </div>
          <div className="command-payments">{paymentSection}</div>
          <section className="command-activity">
            {heading('Officer Activity', 'Offence Review')}
            {offences(activity, true)}
          </section>
        </div>
      )}
      <div hidden={tab !== 'Offence Review'}>{children}</div>
      {['Incidents', 'Checkpoints', 'Reports'].map((d) => (
        <div key={d} hidden={tab !== d}>
          <OperationsPanel
            api={api}
            user={user}
            initialTab={d === 'Reports' ? 'Overview' : d}
            hideNavigation
            paused={tab !== d}
          />
        </div>
      ))}
      {tab === 'Payments' && paymentSection}
      {tab === 'Vehicles' && (
        <VehicleApprovals
          api={api}
          onChange={() => setRevision((v) => v + 1)}
        />
      )}
      {['More', 'Profile'].includes(tab) && (
        <section>
          <h2>
            {tab === 'Profile' ? 'My Profile' : 'Command Centre Services'}
          </h2>
          <p>{user.name} · Supervisor</p>
          <div className="card-actions">
            {['Payments', 'Reports', 'Vehicles', 'Profile'].map((d) => (
              <button key={d} className="secondary" onClick={() => navigate(d)}>
                {d === 'Vehicles' ? 'Vehicle Approvals' : d}
              </button>
            ))}
          </div>
        </section>
      )}
      <nav
        className="supervisor-bottom-nav mobile-bottom-nav"
        aria-label="Mobile command centre navigation"
      >
        {(
          [
            'Dashboard',
            'Offence Review',
            'Incidents',
            'Checkpoints',
            'More',
          ] as const
        ).map((d, i) => (
          <button
            key={d}
            aria-current={
              tab === d ||
              (d === 'More' &&
                ['Payments', 'Reports', 'Vehicles', 'Profile'].includes(tab))
                ? 'page'
                : undefined
            }
            onClick={() => navigate(d)}
          >
            <MotoristIcon
              name={
                (['home', 'receipt', 'fine', 'checkpoint', 'profile'] as const)[
                  i
                ]
              }
            />
            <span>
              {['Home', 'Reviews', 'Incidents', 'Checkpoints', 'More'][i]}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}
