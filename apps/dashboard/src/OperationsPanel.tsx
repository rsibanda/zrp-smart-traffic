import { Field } from './Field';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Api } from './AdminPanel';
import { DemoMap } from './DemoMap';
import { AlertsPanel } from './AlertsPanel';
import { readable, statusLabel, StatusBadge } from './presentation';
type Incident = {
  id: string;
  type: string;
  location: string;
  description: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  resolutionNotes: string | null;
  reporter: { name: string } | null;
};
type Checkpoint = {
  id: string;
  name: string;
  location: string;
  latitude: number;
  longitude: number;
  startAt: string;
  endAt: string;
  status: string;
  createdBy: string;
};
type Overview = {
  openIncidents: number;
  submittedOffences: number;
  activeCheckpoints: number;
  tickets: { status: string; count: number }[];
  trend: { day: string; count: number }[];
  officers: {
    id: string;
    name: string;
    active: boolean;
    _count: { offences: number; incidents: number };
  }[];
};
export function OperationsPanel({
  api,
  user,
  initialTab = '',
  hideNavigation = false,
  paused = false,
}: {
  api: Api;
  initialTab?: string;
  hideNavigation?: boolean;
  paused?: boolean;
  user: { id: string; role: string };
}) {
  const supervisor = user.role === 'SUPERVISOR';
  const [tab, setTab] = useState(initialTab);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Incident | null>(null);
  const pending = useRef<{ key: string; payload: string } | null>(null);
  const refresh = useCallback(async () => {
    if (!tab) return;
    if (tab === 'Overview') {
      setOverview(await api('/analytics/overview'));
      return;
    }
    const result = await api(
      `/${tab === 'Incidents' ? 'incidents' : 'checkpoints'}?page=${page}&q=${encodeURIComponent(q)}`,
    );
    if (tab === 'Incidents') setIncidents(result.items);
    else setCheckpoints(result.items);
    setTotal(result.total);
  }, [api, page, q, tab]);
  useEffect(() => {
    if (paused) return;
    let active = true;
    const load = () =>
      void refresh().catch((e) => {
        if (active) setError(e.message);
      });
    load();
    const timer = setInterval(load, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [refresh, paused]);
  async function perform(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      await refresh();
      setMessage('Saved successfully.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function report(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const latitude = data.get('latitude');
    const longitude = data.get('longitude');
    const payload = {
      type: data.get('type'),
      location: data.get('location'),
      description: data.get('description'),
      ...(latitude !== '' ? { latitude: Number(latitude) } : {}),
      ...(longitude !== '' ? { longitude: Number(longitude) } : {}),
    };
    const encoded = JSON.stringify(payload);
    if (pending.current && pending.current.payload !== encoded) {
      setError(
        'Retry the unchanged report first to resolve the previous submission.',
      );
      return;
    }
    pending.current ??= { key: crypto.randomUUID(), payload: encoded };
    void perform(async () => {
      await api('/incidents', { ...payload, requestKey: pending.current!.key });
      pending.current = null;
      form.reset();
    });
  }
  function checkpoint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void perform(async () => {
      await api('/checkpoints', {
        name: data.get('name'),
        location: data.get('location'),
        latitude: Number(data.get('latitude')),
        longitude: Number(data.get('longitude')),
        startAt: new Date(String(data.get('startAt'))).toISOString(),
        endAt: new Date(String(data.get('endAt'))).toISOString(),
      });
      form.reset();
    });
  }
  return (
    <section aria-label="Operations" aria-busy={busy}>
      {!hideNavigation && (
        <nav aria-label="Operational views">
          {[
            '',
            ...(supervisor ? ['Overview'] : []),
            'Incidents',
            'Checkpoints',
          ].map((name) => (
            <button
              key={name}
              aria-pressed={tab === name}
              onClick={() => {
                setTab(name);
                setPage(1);
                setQ('');
                setError('');
                setSelected(null);
              }}
            >
              {name || 'Offence review'}
            </button>
          ))}
        </nav>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {tab === 'Overview' && overview && (
        <>
          <h2>Command centre overview</h2>
          <p>
            Operational records · refreshes every 10 seconds · assigned work
            only
          </p>
          <div className="metrics">
            <p>
              <strong>{overview.openIncidents}</strong> Open incidents
            </p>
            <p>
              <strong>{overview.submittedOffences}</strong> Offences awaiting
              review
            </p>
            <p>
              <strong>{overview.activeCheckpoints}</strong> Active checkpoints
            </p>
          </div>
          <h3>Ticket status</h3>
          <ul>
            {overview.tickets.map((row) => (
              <li key={row.status}>
                <StatusBadge value={row.status} />: {row.count}
              </li>
            ))}
          </ul>
          <h3>Offences created in the last seven UTC days</h3>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Submitted or reviewed</th>
              </tr>
            </thead>
            <tbody>
              {overview.trend.map((row) => (
                <tr key={row.day}>
                  <td>{row.day}</td>
                  <td>{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>Assigned officer activity</h3>
          <table>
            <thead>
              <tr>
                <th>Officer</th>
                <th>Account</th>
                <th>Offences</th>
                <th>Incidents</th>
              </tr>
            </thead>
            <tbody>
              {overview.officers.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>
                    <StatusBadge value={row.active ? 'ACTIVE' : 'DISABLED'} />
                  </td>
                  <td>{row._count.offences}</td>
                  <td>{row._count.incidents}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {tab === 'Overview' && <AlertsPanel api={api} userId={user.id} />}
      {['Incidents', 'Checkpoints'].includes(tab) && (
        <>
          <h2>{tab}</h2>
          <p>
            {tab === 'Checkpoints' ? 'Checkpoint' : 'Incident'} records ·
            refreshes every 10 seconds
          </p>
          <Field>
            Search {tab.toLowerCase()}
            <input
              placeholder="Search by location or description"
              value={q}
              maxLength={80}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </Field>
          {tab === 'Incidents' ? (
            <div
              className="table-wrap"
              tabIndex={0}
              role="region"
              aria-label="Incidents table"
            >
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Location</th>
                    <th>Reporter</th>
                    <th>Status</th>
                    <th className="action-column">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.map((row) => (
                    <tr key={row.id}>
                      <td>{readable(row.type)}</td>
                      <td>{row.location}</td>
                      <td>
                        {row.reporter?.name ?? 'Public report (unverified)'}
                      </td>
                      <td>
                        <StatusBadge
                          value={row.status}
                          kind={tab === 'Incidents' ? 'incident' : 'checkpoint'}
                        />
                      </td>
                      <td>
                        <button onClick={() => setSelected(row)}>
                          View incident
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              className="table-wrap"
              tabIndex={0}
              role="region"
              aria-label="Checkpoints table"
            >
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Location</th>
                    <th>Schedule</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {checkpoints.map((row) => (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td>
                        {row.location}
                        <br />
                        {row.latitude}, {row.longitude}
                      </td>
                      <td>
                        {new Date(row.startAt).toLocaleString()} –{' '}
                        {new Date(row.endAt).toLocaleString()}
                      </td>
                      <td>
                        <StatusBadge
                          value={row.status}
                          kind={tab === 'Incidents' ? 'incident' : 'checkpoint'}
                        />
                      </td>
                      <td>
                        {supervisor &&
                          row.createdBy === user.id &&
                          row.status !== 'CLOSED' && (
                            <>
                              {row.status === 'PLANNED' && (
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    void perform(() =>
                                      api(
                                        `/checkpoints/${row.id}`,
                                        { status: 'ACTIVE' },
                                        'PATCH',
                                      ),
                                    )
                                  }
                                >
                                  Activate
                                </button>
                              )}
                              <button
                                disabled={busy}
                                onClick={() =>
                                  void perform(() =>
                                    api(
                                      `/checkpoints/${row.id}`,
                                      { status: 'CLOSED' },
                                      'PATCH',
                                    ),
                                  )
                                }
                              >
                                Close checkpoint
                              </button>
                            </>
                          )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!total && (
            <p className="empty-state">
              {q
                ? 'No matching records.'
                : tab === 'Incidents'
                  ? 'No incidents found.'
                  : 'No checkpoints found.'}
            </p>
          )}
          <div className="pagination">
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous {tab.toLowerCase()}
            </button>
            <span>
              Page {page} · {total} records
            </span>
            <button
              disabled={page * 20 >= total}
              onClick={() => setPage(page + 1)}
            >
              Next {tab.toLowerCase()}
            </button>
          </div>
        </>
      )}
      {['Incidents', 'Checkpoints'].includes(tab) && (
        <DemoMap
          kind={tab === 'Incidents' ? 'Incident' : 'Checkpoint'}
          markers={(tab === 'Incidents' ? incidents : checkpoints)
            .filter((row) => row.latitude != null && row.longitude != null)
            .map((row) => ({
              id: row.id,
              label: row.location,
              latitude: row.latitude!,
              longitude: row.longitude!,
            }))}
        />
      )}
      {tab === 'Incidents' && selected && (
        <article>
          <h3>
            {readable(selected.type)} ·{' '}
            <StatusBadge value={selected.status} kind="incident" />
          </h3>
          <p>{selected.description}</p>
          <p>
            {selected.location}{' '}
            {selected.latitude != null &&
              `(${selected.latitude}, ${selected.longitude})`}
          </p>
          <p>{selected.resolutionNotes}</p>
          {supervisor && ['OPEN', 'IN_PROGRESS'].includes(selected.status) && (
            <form
              key={`${selected.id}-${selected.status}`}
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                void perform(async () => {
                  await api(
                    `/incidents/${selected.id}`,
                    { status: data.get('status'), notes: data.get('notes') },
                    'PATCH',
                  );
                  setSelected(null);
                });
              }}
            >
              <Field>
                Incident outcome
                <select name="status">
                  {(selected.status === 'OPEN'
                    ? ['IN_PROGRESS', 'CANCELLED']
                    : ['RESOLVED', 'CANCELLED']
                  ).map((status) => (
                    <option key={status} value={status}>
                      {statusLabel(status, 'incident')}
                    </option>
                  ))}
                </select>
              </Field>
              <Field>
                Resolution notes
                <textarea
                  name="notes"
                  required
                  minLength={3}
                  maxLength={1000}
                />
              </Field>
              <button disabled={busy}>Save incident review</button>
            </form>
          )}
        </article>
      )}
      {tab === 'Incidents' && !supervisor && (
        <form onSubmit={report}>
          <h3>Report a Road Incident</h3>
          <fieldset className="form-grid" disabled={busy}>
            <Field>
              Incident type
              <select name="type">
                {['ACCIDENT', 'HAZARD', 'CONGESTION', 'OTHER'].map((type) => (
                  <option key={type} value={type}>
                    {readable(type)}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              Location
              <input
                name="location"
                placeholder="Street, intersection or area"
                required
                minLength={3}
                maxLength={200}
              />
            </Field>
            <Field>
              Description
              <textarea
                name="description"
                placeholder="Describe the incident and relevant details"
                required
                minLength={3}
                maxLength={2000}
              />
            </Field>
            <Coordinates optional />
            <p>
              If the connection fails, retry the unchanged report. The same
              request key prevents duplicates.
            </p>
            <button>Submit Incident Report</button>
          </fieldset>
        </form>
      )}
      {tab === 'Checkpoints' && supervisor && (
        <form onSubmit={checkpoint}>
          <h3>Create checkpoint</h3>
          <fieldset className="form-grid" disabled={busy}>
            <Field>
              Checkpoint name
              <input name="name" required minLength={3} maxLength={100} />
            </Field>
            <Field>
              Location
              <input
                name="location"
                placeholder="Street, intersection or area"
                required
                minLength={3}
                maxLength={200}
              />
            </Field>
            <Coordinates />
            <Field>
              Starts (local time)
              <input type="datetime-local" name="startAt" required />
            </Field>
            <Field>
              Ends (local time)
              <input type="datetime-local" name="endAt" required />
            </Field>
            <button>Create checkpoint</button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
function Coordinates({ optional = false }: { optional?: boolean }) {
  return (
    <>
      <Field>
        Latitude {optional && '(optional)'}
        <input
          name="latitude"
          type="number"
          step="any"
          min="-90"
          max="90"
          required={!optional}
        />
      </Field>
      <Field>
        Longitude {optional && '(optional)'}
        <input
          name="longitude"
          type="number"
          step="any"
          min="-180"
          max="180"
          required={!optional}
        />
      </Field>
    </>
  );
}
