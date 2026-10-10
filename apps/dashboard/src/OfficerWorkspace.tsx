import { ReactNode, useEffect, useState } from 'react';
import type { Api } from './AdminPanel';
import { CitationTerminal } from './CitationTerminal';
import { OperationsPanel } from './OperationsPanel';
import { SupervisorWorkspace } from './SupervisorWorkspace';
import { MotoristIcon, type MotoristIconName } from './MotoristIcon';
import {
  formatCurrency,
  readable,
  StatusBadge,
  ticketLabel,
} from './presentation';

type RecordItem = {
  id: string;
  status: string;
  location: string;
  createdAt?: string;
  observedAt?: string;
  type?: string;
  name?: string;
  startAt?: string;
  endAt?: string;
  vehicle?: {
    registrationNumber: string;
    motoristId?: string | null;
    motorist?: { name: string } | null;
  };
  category?: { name: string };
  ticket?: {
    displayReference?: string;
    issuedAt?: string;
    demoFineAmountSnapshot: string;
  } | null;
  paymentStatus?: string;
};
const destinations = [
  {
    title: 'Dashboard',
    mobile: 'Home',
    path: '/officer/dashboard',
    icon: 'home',
  },
  {
    title: 'Issue Infringement',
    mobile: 'Issue',
    path: '/officer/issue',
    icon: 'receipt',
  },
  {
    title: 'Incidents',
    mobile: 'Incidents',
    path: '/officer/incidents',
    icon: 'fine',
  },
  {
    title: 'Checkpoints',
    mobile: 'Checkpoints',
    path: '/officer/checkpoints',
    icon: 'checkpoint',
  },
  {
    title: 'My Activity',
    mobile: 'Profile',
    path: '/officer/activity',
    icon: 'profile',
  },
] as const;
const current = () =>
  window.location.pathname === '/officer/profile'
    ? 'Profile'
    : (destinations.find((d) => d.path === window.location.pathname)?.title ??
      'Dashboard');
const day = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Harare',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
const date = (value?: string) =>
  value
    ? new Date(value).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Time not recorded';
export function officerTotals(
  offences: RecordItem[],
  incidents: RecordItem[],
  checkpoints: RecordItem[],
  now = new Date(),
) {
  return {
    issued: offences.filter(
      (r) =>
        r.ticket?.issuedAt && day(new Date(r.ticket.issuedAt)) === day(now),
    ).length,
    pending: offences.filter((r) =>
      ['SUBMITTED', 'UNDER_REVIEW'].includes(r.status),
    ).length,
    incidents: incidents.filter((r) =>
      ['OPEN', 'IN_PROGRESS'].includes(r.status),
    ).length,
    checkpoints: checkpoints.filter(
      (r) =>
        r.status === 'ACTIVE' &&
        (!r.startAt || new Date(r.startAt) <= now) &&
        (!r.endAt || new Date(r.endAt) > now),
    ).length,
  };
}
async function allRecords(
  api: Api,
  path: string,
  active: () => boolean,
): Promise<RecordItem[]> {
  const rows: RecordItem[] = [];
  for (let page = 1; active(); page++) {
    const data = await api(`${path}?page=${page}&pageSize=100`);
    rows.push(...data.items);
    if (rows.length >= data.total || data.items.length < 100) break;
  }
  return rows;
}
export function StaffWorkspace({
  api,
  token,
  user,
  onOpen,
  children,
}: {
  api: Api;
  token: string;
  user: { id: string; name: string; role: string };
  onOpen: (id: string) => void;
  children: ReactNode;
}) {
  if (user.role !== 'OFFICER')
    return (
      <SupervisorWorkspace api={api} user={user} onOpen={onOpen}>
        {children}
      </SupervisorWorkspace>
    );
  return (
    <OfficerWorkspace api={api} token={token} user={user} onOpen={onOpen}>
      {children}
    </OfficerWorkspace>
  );
}
export function OfficerWorkspace({
  api,
  token,
  user,
  onOpen,
  children,
}: {
  api: Api;
  token: string;
  user: { id: string; name: string; role: string };
  onOpen: (id: string) => void;
  children: ReactNode;
}) {
  const [tab, setTab] = useState<string>(current),
    [offences, setOffences] = useState<RecordItem[]>([]),
    [incidents, setIncidents] = useState<RecordItem[]>([]),
    [checkpoints, setCheckpoints] = useState<RecordItem[]>([]),
    [error, setError] = useState(''),
    [loaded, setLoaded] = useState(false),
    [revision, setRevision] = useState(0);
  const [activityOpen, setActivityOpen] = useState(false);
  function navigate(title: string) {
    window.history.pushState(
      {},
      '',
      title === 'Profile'
        ? '/officer/profile'
        : destinations.find((d) => d.title === title)!.path,
    );
    setTab(title);
    setActivityOpen(false);
  }
  useEffect(() => {
    const pop = () => {
      setTab(current());
      setActivityOpen(false);
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  useEffect(() => {
    let active = true,
      fetching = false;
    const refresh = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const [a, b, c] = await Promise.all([
          allRecords(api, '/offences', () => active),
          allRecords(api, '/incidents', () => active),
          allRecords(api, '/checkpoints', () => active),
        ]);
        if (active) {
          setOffences(a);
          setIncidents(b);
          setCheckpoints(c);
          setLoaded(true);
          setError('');
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        fetching = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api, revision]);
  const totals = officerTotals(offences, incidents, checkpoints);
  const activeCheckpoints = checkpoints.filter(
    (r) => officerTotals([], [], [r]).checkpoints > 0,
  );
  const activeIncidents = incidents.filter((r) =>
    ['OPEN', 'IN_PROGRESS'].includes(r.status),
  );
  const open = (id: string) => {
    navigate('My Activity');
    setActivityOpen(true);
    onOpen(id);
  };
  return (
    <div className="officer-workspace">
      <nav className="officer-nav" aria-label="Officer services">
        {destinations.map((d) => (
          <button
            key={d.title}
            aria-current={
              tab === d.title ||
              (d.title === 'My Activity' && tab === 'Profile')
                ? 'page'
                : undefined
            }
            onClick={() => navigate(d.title)}
          >
            <MotoristIcon name={d.icon} />
            <span className="officer-desktop-label">{d.title}</span>
            <span className="officer-mobile-label">{d.mobile}</span>
          </button>
        ))}
        <button
          className="officer-mobile-profile"
          aria-current={
            ['Profile', 'My Activity'].includes(tab) ? 'page' : undefined
          }
          onClick={() => navigate('Profile')}
        >
          <MotoristIcon name="profile" />
          Profile
        </button>
      </nav>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {tab === 'Dashboard' && (
        <section className="officer-welcome">
          <h2>Welcome back, {user.name}</h2>
          <p>
            Manage field enforcement, infringements and operational activity.
          </p>
          <div className="officer-metrics">
            {(
              [
                [
                  'Issued Today',
                  totals.issued,
                  'receipt',
                  'issued',
                  'My Activity',
                ],
                [
                  'Pending Reviews',
                  totals.pending,
                  'clock',
                  'pending',
                  'My Activity',
                ],
                [
                  'Active Incidents',
                  totals.incidents,
                  'fine',
                  'incidents',
                  'Incidents',
                ],
                [
                  'Open Checkpoints',
                  totals.checkpoints,
                  'checkpoint',
                  'checkpoints',
                  'Checkpoints',
                ],
              ] as const
            ).map(([label, value, icon, tone, target]) => (
              <button
                key={label}
                data-tone={tone}
                onClick={() => navigate(target)}
              >
                <MotoristIcon name={icon as MotoristIconName} />
                <span>{label}</span>
                <strong>{loaded ? value : '—'}</strong>
              </button>
            ))}
          </div>
          <button
            className="officer-mobile-issue"
            onClick={() => navigate('Issue Infringement')}
          >
            + Issue New Infringement
          </button>
        </section>
      )}
      <div
        className={
          tab === 'Dashboard'
            ? 'officer-dashboard-citation'
            : tab === 'Issue Infringement'
              ? ''
              : 'officer-hidden'
        }
      >
        <CitationTerminal
          api={api}
          token={token}
          onIssued={() => setRevision((r) => r + 1)}
        />
      </div>
      {['Incidents', 'Checkpoints'].map((view) => (
        <div key={view} hidden={tab !== view}>
          <OperationsPanel
            api={api}
            user={user}
            initialTab={view}
            hideNavigation
            paused={tab !== view}
          />
        </div>
      ))}
      {(tab === 'Dashboard' || tab === 'My Activity') && (
        <section>
          <div className="section-heading">
            <h2>
              {tab === 'Dashboard' ? (
                <>
                  <span className="officer-desktop-label">
                    Recent Officer Activity
                  </span>
                  <span className="officer-mobile-label">
                    Recent Infringements
                  </span>
                </>
              ) : (
                'My Activity'
              )}
            </h2>
            {tab === 'Dashboard' && (
              <button
                className="text-action"
                onClick={() => navigate('My Activity')}
              >
                View all<span className="sr-only"> activity</span>
              </button>
            )}
          </div>
          {!loaded && <p role="status">Loading officer records...</p>}
          {loaded && !offences.length && (
            <p className="empty-state">No traffic offences found.</p>
          )}
          <div className="officer-records">
            {(tab === 'Dashboard'
              ? offences.slice(0, 3)
              : offences.slice(0, 10)
            ).map((r) => (
              <article
                className="officer-record"
                data-status={r.status}
                key={r.id}
              >
                <span className="officer-state-icon">
                  <MotoristIcon
                    name={
                      r.status === 'CONFIRMED'
                        ? 'paid'
                        : r.status === 'UNDER_REVIEW'
                          ? 'clock'
                          : 'fine'
                    }
                  />
                </span>
                <div className="officer-record-body">
                  <div className="record-title">
                    <h3>{r.category?.name ?? 'Traffic offence'}</h3>
                    <span className="ticket-tag">
                      {r.ticket ? ticketLabel(r.ticket) : 'Draft'}
                    </span>
                  </div>
                  <p>
                    Vehicle: {r.vehicle?.registrationNumber ?? 'Not recorded'}{' '}
                    <span className="officer-dot"> &middot; </span> Motorist:{' '}
                    {r.vehicle?.motorist?.name ??
                      (r.vehicle?.motoristId ? 'Linked account' : 'Not linked')}
                  </p>
                  <p>
                    {date(r.ticket?.issuedAt ?? r.observedAt ?? r.createdAt)}{' '}
                    &middot; {r.location}
                  </p>
                </div>
                <div className="officer-record-amount">
                  <strong>
                    {r.ticket
                      ? formatCurrency(r.ticket.demoFineAmountSnapshot)
                      : 'Not issued'}
                  </strong>
                  <StatusBadge value={r.status} />
                  {r.paymentStatus && (
                    <small>Payment: {readable(r.paymentStatus)}</small>
                  )}
                </div>
                <button className="secondary" onClick={() => open(r.id)}>
                  View
                  <span className="sr-only">
                    {' '}
                    {r.ticket ? ticketLabel(r.ticket) : r.category?.name}
                  </span>
                </button>
              </article>
            ))}
          </div>
          {tab === 'My Activity' && !activityOpen && (
            <button className="secondary" onClick={() => setActivityOpen(true)}>
              Search and filter all activity
            </button>
          )}
        </section>
      )}
      <div hidden={tab !== 'My Activity' || !activityOpen}>{children}</div>
      {tab === 'Dashboard' && (
        <div className="officer-queues">
          <section>
            <div className="section-heading">
              <h2>Active Checkpoints</h2>
              <button
                className="text-action"
                onClick={() => navigate('Checkpoints')}
              >
                View all<span className="sr-only"> checkpoints</span>
              </button>
            </div>
            {!activeCheckpoints.length && (
              <p className="empty-state">No active checkpoints found.</p>
            )}
            {activeCheckpoints.slice(0, 2).map((r) => (
              <button
                className="officer-queue"
                key={r.id}
                onClick={() => navigate('Checkpoints')}
              >
                <MotoristIcon name="checkpoint" />
                <span>
                  <strong>{r.name}</strong>
                  <small>{r.location}</small>
                  <small>Officer and vehicle counts not recorded</small>
                </span>
                <StatusBadge value={r.status} />
                <span aria-hidden="true">&rsaquo;</span>
              </button>
            ))}
          </section>
          <section>
            <div className="section-heading">
              <h2>Incident Queue</h2>
              <button
                className="text-action"
                onClick={() => navigate('Incidents')}
              >
                View all<span className="sr-only"> incidents</span>
              </button>
            </div>
            {!activeIncidents.length && (
              <p className="empty-state">No active incidents found.</p>
            )}
            {activeIncidents.slice(0, 2).map((r) => (
              <button
                className="officer-queue"
                key={r.id}
                onClick={() => navigate('Incidents')}
              >
                <MotoristIcon name="fine" />
                <span>
                  <strong>{readable(r.type ?? 'Incident')}</strong>
                  <small>
                    {r.location} &middot; {date(r.createdAt)}
                  </small>
                  <small>Severity not recorded</small>
                </span>
                <StatusBadge value={r.status} kind="incident" />
                <span aria-hidden="true">&rsaquo;</span>
              </button>
            ))}
          </section>
        </div>
      )}
      {tab === 'Profile' && (
        <section>
          <h2>Officer Profile</h2>
          <p>{user.name}</p>
          <p>Traffic Officer</p>
          <button onClick={() => navigate('My Activity')}>My Activity</button>
        </section>
      )}
    </div>
  );
}
