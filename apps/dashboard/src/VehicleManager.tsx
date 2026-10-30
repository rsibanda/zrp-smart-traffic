import { VehicleApprovals } from './VehicleApprovals';
import { VehicleApplications } from './VehicleApplications';
import { useEffect, useRef, useState } from 'react';
import type { Api } from './AdminPanel';
import { Field } from './Field';
import { formatCurrency, readable, StatusBadge } from './presentation';

type Vehicle = {
  registrationNumber: string;
  make: string;
  model: string;
  colour: string;
  registrationStatus: string;
  ownershipStatus: string;
  nickname: string | null;
  linkVerifiedAt: string | null;
  activeInfringements: number;
  linkedInfringements: number;
  paidInfringements: number;
  totalPayable: number;
  paidAmount: number;
  currency: string;
};
type LinkRequest = {
  id: string;
  registration: string;
  kind: string;
  status: string;
  submittedAt: string;
  reviewedAt: string | null;
};
type Detail = Vehicle & {
  checkedAt: string;
  statusSource: string;
  history: LinkRequest[];
  infringements: {
    items: {
      reference: string;
      displayReference: string;
      category: string;
      amount: string;
      currency: string;
      paymentStatus: string;
      demeritPoints: number;
    }[];
    total: number;
  };
};
type Inventory = {
  items: Vehicle[];
  total: number;
  summary: {
    registeredVehicles: number;
    activeInfringements: number;
    totalPayable: number;
    vehiclesRequiringAttention: number;
    currency: string;
  };
};
const date = (value: string | null) =>
  value ? new Date(value).toLocaleString() : 'Not recorded';
const initialRegistration = () => {
  const match = window.location.pathname.match(
    /^\/motorist\/vehicles\/([A-Za-z0-9-]+)$/,
  );
  return match ? decodeURIComponent(match[1]) : null;
};
export function VehicleManager({
  api,
  onTicket,
}: {
  api: Api;
  onTicket: (reference: string) => void;
}) {
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [requests, setRequests] = useState<LinkRequest[]>([]),
    [requestTotal, setRequestTotal] = useState(0);
  const [page, setPage] = useState(1),
    [requestPage, setRequestPage] = useState(1),
    [ticketPage, setTicketPage] = useState(1);
  const [registration, setRegistration] = useState<string | null>(
    initialRegistration,
  );
  const [detail, setDetail] = useState<Detail | null>(null),
    [status, setStatus] = useState<Detail | null>(null);
  const [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false),
    [plate, setPlate] = useState('');
  const [check, setCheck] = useState<{
    registration: string;
    ownershipStatus: string;
    message: string;
  } | null>(null);
  const addDialog = useRef<HTMLDialogElement>(null),
    statusDialog = useRef<HTMLDialogElement>(null);
  async function load() {
    const [list, pending] = await Promise.all([
      api(`/motorist/vehicles?page=${page}&pageSize=12`),
      api(`/motorist/vehicles/requests?page=${requestPage}&pageSize=10`),
    ]);
    setInventory(list);
    setRequests(pending.items);
    setRequestTotal(pending.total);
    if (registration)
      setDetail(
        await api(
          `/motorist/vehicles/${encodeURIComponent(registration)}?page=${ticketPage}&pageSize=10`,
        ),
      );
  }
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const [list, pending, selected] = await Promise.all([
          api(`/motorist/vehicles?page=${page}&pageSize=12`),
          api(`/motorist/vehicles/requests?page=${requestPage}&pageSize=10`),
          registration
            ? api(
                `/motorist/vehicles/${encodeURIComponent(registration)}?page=${ticketPage}&pageSize=10`,
              )
            : Promise.resolve(null),
        ]);
        if (active) {
          setInventory(list);
          setRequests(pending.items);
          setRequestTotal(pending.total);
          setDetail(selected);
        }
      } catch (e) {
        if (active) {
          setDetail(null);
          setError((e as Error).message);
        }
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api, page, registration, requestPage, ticketPage]);
  useEffect(() => {
    const pop = () => {
      setRegistration(initialRegistration());
      setTicketPage(1);
      setDetail(null);
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  useEffect(() => {
    if (adding) addDialog.current?.showModal();
    else addDialog.current?.close();
  }, [adding]);
  useEffect(() => {
    if (status) statusDialog.current?.showModal();
    else statusDialog.current?.close();
  }, [status]);
  async function perform(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function open(reg: string | null) {
    setDetail(null);
    setRegistration(reg);
    setTicketPage(1);
    window.history.pushState(
      {},
      '',
      `/motorist/vehicles${reg ? `/${encodeURIComponent(reg)}` : ''}`,
    );
  }
  function register() {
    setCheck(null);
    setPlate('');
    setAdding(true);
  }
  const summary = inventory?.summary;
  return (
    <div className="vehicle-workspace">
      {!registration && <VehicleApplications api={api} />}
      <section className="ledger-heading">
        <div className="card-title">
          <div>
            <span className="eyebrow">MOTORIST SERVICES</span>
            <h2>My Vehicles</h2>
            <p>Manage vehicles linked to your motorist account.</p>
          </div>
          <button onClick={register}>+ Register Vehicle</button>
        </div>
      </section>
      {error && !adding && !status && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="success">
          {message}
        </p>
      )}
      {summary && (
        <div className="ledger-metrics">
          {[
            ['Registered Vehicles', summary.registeredVehicles],
            ['Active Infringements', summary.activeInfringements],
            [
              'Outstanding Vehicle Fines',
              formatCurrency(summary.totalPayable, summary.currency),
            ],
            [
              'Vehicles Requiring Attention',
              summary.vehiclesRequiringAttention,
            ],
          ].map(([label, value]) => (
            <div className="metric-card" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      )}
      {!inventory && <p role="status">Loading vehicles…</p>}
      {!registration ? (
        <section>
          <h2>Registered Vehicles</h2>
          {inventory?.total === 0 && (
            <div className="empty-state">
              <h3>No vehicles are linked to your account yet.</h3>
              <p>
                Register a vehicle to track infringements, payments and vehicle
                status.
              </p>
              <button onClick={register}>+ Register Vehicle</button>
            </div>
          )}
          <div className="ledger-grid">
            {inventory?.items.map((v) => (
              <article
                className="infringement-card vehicle-card"
                key={v.registrationNumber}
              >
                <div className="card-title">
                  <h3>{v.registrationNumber}</h3>
                  <StatusBadge value={v.registrationStatus} />
                </div>
                <p>
                  {v.make} {v.model} · {v.colour}
                </p>
                {v.nickname && <p>{v.nickname}</p>}
                <p>
                  Account link: <StatusBadge value={v.ownershipStatus} />
                </p>
                <p>
                  {v.linkedInfringements} linked infringements ·{' '}
                  {v.activeInfringements} active
                </p>
                <p>
                  Outstanding{' '}
                  <strong className="fine-amount">
                    {formatCurrency(v.totalPayable, v.currency)}
                  </strong>
                </p>
                <div className="card-actions">
                  <button onClick={() => open(v.registrationNumber)}>
                    View Details
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void perform(async () =>
                        setStatus(
                          await api(
                            `/motorist/vehicles/${v.registrationNumber}/status`,
                          ),
                        ),
                      )
                    }
                  >
                    Check Status
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div className="pagination">
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous vehicles
            </button>
            <span>Page {page}</span>
            <button
              disabled={page * 12 >= (inventory?.total ?? 0)}
              onClick={() => setPage(page + 1)}
            >
              Next vehicles
            </button>
          </div>
        </section>
      ) : (
        <section>
          <button className="secondary" onClick={() => open(null)}>
            Back to My Vehicles
          </button>
          {!detail ? (
            <p role="status">Loading vehicle details…</p>
          ) : (
            <>
              <h2>Vehicle Overview · {detail.registrationNumber}</h2>
              <p>{detail.statusSource}</p>
              <dl className="detail-grid">
                <dt>Make / model</dt>
                <dd>
                  {detail.make} {detail.model}
                </dd>
                <dt>Colour</dt>
                <dd>{detail.colour}</dd>
                <dt>Registration status</dt>
                <dd>
                  <StatusBadge value={detail.registrationStatus} />
                </dd>
                <dt>Account link</dt>
                <dd>
                  <StatusBadge value={detail.ownershipStatus} />
                </dd>
                <dt>Last link verification</dt>
                <dd>{date(detail.linkVerifiedAt)}</dd>
                <dt>Active infringements</dt>
                <dd>{detail.activeInfringements}</dd>
                <dt>Paid infringements</dt>
                <dd>{detail.paidInfringements}</dd>
                <dt>Outstanding amount</dt>
                <dd>{formatCurrency(detail.totalPayable, detail.currency)}</dd>
                <dt>Paid amount</dt>
                <dd>{formatCurrency(detail.paidAmount, detail.currency)}</dd>
              </dl>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void perform(async () =>
                    setStatus(
                      await api(
                        `/motorist/vehicles/${detail.registrationNumber}/status`,
                      ),
                    ),
                  )
                }
              >
                Check Registration Status
              </button>
              <h3>Traffic Infringements</h3>
              <p className="muted">
                Only infringements assigned to your account are shown. Vehicle
                transfers do not transfer ticket ownership.
              </p>
              {!detail.infringements.items.length && (
                <p className="empty-state">No linked infringements found.</p>
              )}
              <div className="ledger-grid">
                {detail.infringements.items.map((t) => (
                  <article
                    className="infringement-card"
                    key={t.reference}
                    data-status={t.paymentStatus}
                  >
                    <div className="card-title">
                      <h3>{t.category}</h3>
                      <StatusBadge value={t.paymentStatus} />
                    </div>
                    <p className="reference">{t.displayReference}</p>
                    <p>{t.demeritPoints} demerit points</p>
                    <div className="card-actions">
                      <strong className="fine-amount">
                        {formatCurrency(t.amount, t.currency)}
                      </strong>
                      <button onClick={() => onTicket(t.reference)}>
                        View Ticket
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              <div className="pagination">
                <button
                  disabled={ticketPage === 1}
                  onClick={() => setTicketPage(ticketPage - 1)}
                >
                  Previous infringements
                </button>
                <span>Page {ticketPage}</span>
                <button
                  disabled={ticketPage * 10 >= detail.infringements.total}
                  onClick={() => setTicketPage(ticketPage + 1)}
                >
                  Next infringements
                </button>
              </div>
              <h3>Manage Vehicle</h3>
              <form
                key={detail.registrationNumber}
                onSubmit={(e) => {
                  e.preventDefault();
                  const nickname = String(
                    new FormData(e.currentTarget).get('nickname') ?? '',
                  );
                  void perform(async () => {
                    await api(
                      `/motorist/vehicles/${detail.registrationNumber}`,
                      { nickname },
                      'PATCH',
                    );
                    await load();
                    setMessage('Vehicle nickname saved.');
                  });
                }}
              >
                <Field>
                  Nickname (optional)
                  <input
                    name="nickname"
                    defaultValue={detail.nickname ?? ''}
                    maxLength={60}
                    placeholder="For example, Family car"
                  />
                </Field>
                <button disabled={busy}>Save nickname</button>
              </form>
              <p>
                Unlinking requires supervisor or administrator review and no
                outstanding infringements. Existing tickets remain on your
                account.
              </p>
              <button
                className="secondary"
                disabled={busy || detail.activeInfringements > 0}
                onClick={() =>
                  void perform(async () => {
                    await api(
                      `/motorist/vehicles/${detail.registrationNumber}/unlink-request`,
                      {},
                    );
                    await load();
                    setMessage('Unlink request submitted for review.');
                  })
                }
              >
                Request Unlink
              </button>
              <h3>Vehicle History</h3>
              {!detail.history.length && (
                <p>No account-link events recorded.</p>
              )}
              {detail.history.map((h) => (
                <p key={h.id}>
                  {readable(h.kind)} request · <StatusBadge value={h.status} />{' '}
                  · {date(h.submittedAt)}
                  {h.reviewedAt && ` · Reviewed ${date(h.reviewedAt)}`}
                </p>
              ))}
            </>
          )}
        </section>
      )}
      <section>
        <h2>Vehicle Link Requests</h2>
        <p>
          Requests are reviewed by an administrator. A pending request does not
          grant vehicle access.
        </p>
        {!requests.length && (
          <p className="empty-state">No vehicle link requests.</p>
        )}
        {requests.map((r) => (
          <article className="infringement-card" key={r.id}>
            <div className="card-title">
              <h3>
                {r.registration} · {readable(r.kind)}
              </h3>
              <StatusBadge value={r.status} />
            </div>
            <p>Submitted {date(r.submittedAt)}</p>
            {r.reviewedAt && <p>Reviewed {date(r.reviewedAt)}</p>}
          </article>
        ))}
        <div className="pagination">
          <button
            disabled={requestPage === 1}
            onClick={() => setRequestPage(requestPage - 1)}
          >
            Previous requests
          </button>
          <span>Page {requestPage}</span>
          <button
            disabled={requestPage * 10 >= requestTotal}
            onClick={() => setRequestPage(requestPage + 1)}
          >
            Next requests
          </button>
        </div>
      </section>
      <dialog
        ref={addDialog}
        aria-labelledby="vehicle-register-title"
        onCancel={() => setAdding(false)}
      >
        <h2 id="vehicle-register-title">Register Vehicle</h2>
        <p>
          Add a vehicle to your Smart Traffic account for infringement and
          payment tracking.
        </p>
        <p className="muted">
          Internal account registration only. Ownership must be verified by an
          administrator.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void perform(async () =>
              setCheck(
                await api('/motorist/vehicles/check', { registration: plate }),
              ),
            );
          }}
        >
          <Field>
            Vehicle Registration Number
            <input
              value={plate}
              onChange={(e) => {
                setPlate(e.target.value);
                setCheck(null);
              }}
              required
              maxLength={20}
              placeholder="ABC1234"
            />
          </Field>
          <button disabled={busy}>Check Vehicle</button>
        </form>
        {check && (
          <div className="vehicle-summary">
            <h3>{check.registration}</h3>
            <StatusBadge value={check.ownershipStatus} />
            <p>{check.message}</p>
            {check.ownershipStatus !== 'VERIFIED' && (
              <button
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await api('/motorist/vehicles/link-request', {
                      registration: check.registration,
                    });
                    await load();
                    setAdding(false);
                    setMessage(
                      'Link request submitted. Your vehicle will appear after administrator approval.',
                    );
                  })
                }
              >
                Submit Link Request
              </button>
            )}
          </div>
        )}
        <button
          className="secondary"
          disabled={busy}
          onClick={() => setAdding(false)}
        >
          Close
        </button>
      </dialog>
      <dialog
        ref={statusDialog}
        aria-label="Vehicle status"
        onCancel={() => setStatus(null)}
      >
        {status && (
          <>
            <h2>{status.registrationNumber} · Vehicle Status</h2>
            <p>{status.statusSource}</p>
            <p>
              Registration: <StatusBadge value={status.registrationStatus} />
            </p>
            <p>
              Account link: <StatusBadge value={status.ownershipStatus} />
            </p>
            <p>{status.activeInfringements} outstanding infringements</p>
            <strong className="fine-amount">
              {formatCurrency(status.totalPayable, status.currency)}
            </strong>
            <p>Checked {date(status.checkedAt)}</p>
          </>
        )}
        <button onClick={() => setStatus(null)}>Close status</button>
      </dialog>
    </div>
  );
}

export function VehicleRequestReview({ api }: { api: Api }) {
  return <VehicleApprovals api={api} base="/admin/vehicle-link-requests" />;
}
