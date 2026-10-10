import { FormEvent, useEffect, useRef, useState } from 'react';
import type { Api } from './AdminPanel';
import { Field } from './Field';
import { readable, StatusBadge } from './presentation';

type Request = {
  vehicle?: { make: string; model: string } | null;
  id: string;
  registration: string;
  kind: string;
  status: string;
  submittedAt: string;
  reviewedAt?: string;
  reviewNote?: string;
  motorist: { name: string; email: string };
};
type Detail = Request & {
  vehicle: {
    make: string;
    model: string;
    colour: string;
    registrationStatus: string;
  } | null;
  linkedToAnotherMotorist: boolean;
  ownershipStatus: string;
  history: (Request & { reviewer?: { name: string } })[];
};
const label = (status: string) => (status === 'VERIFIED' ? 'APPROVED' : status);
const date = (value?: string) =>
  value ? new Date(value).toLocaleString() : 'Not recorded';
export function VehicleApprovals({
  api,
  onChange,
  base = '/supervisor/vehicle-link-requests',
}: {
  api: Api;
  onChange?: () => void;
  base?: string;
}) {
  const [rows, setRows] = useState<Request[]>([]),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0);
  const [detail, setDetail] = useState<Detail | null>(null),
    [decision, setDecision] = useState(''),
    [note, setNote] = useState(''),
    [checked, setChecked] = useState(false);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let active = true,
      fetching = false;
    async function load() {
      if (fetching) return;
      fetching = true;
      try {
        const data = await api(`${base}?page=${page}&pageSize=10`);
        if (active) {
          setRows(data.items);
          setTotal(data.total);
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
  }, [api, base, page, revision]);
  useEffect(() => {
    if (detail && !dialog.current?.open) dialog.current?.showModal();
    if (!detail) dialog.current?.close();
  }, [detail]);
  async function open(r: Request) {
    setBusy(true);
    setError('');
    setDecision('');
    setNote('');
    setChecked(false);
    try {
      setDetail(await api(`${base}/${r.id}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!detail || busy) return;
    setBusy(true);
    setError('');
    try {
      await api(`${base}/${detail.id}/review`, {
        status: decision,
        note,
        checked,
      });
      setDetail(null);
      setRevision((v) => v + 1);
      onChange?.();
    } catch (e) {
      setError((e as Error).message);
      setDecision('');
    } finally {
      setBusy(false);
    }
  }
  function choose(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setDecision(
      ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement).value,
    );
  }
  return (
    <section className="vehicle-approvals">
      <div className="section-heading">
        <h2>Pending Vehicle Approvals</h2>
        <span className="muted">Requests and decisions</span>
      </div>
      {error && !detail && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!rows.length && (
        <p className="empty-state">No vehicle requests found.</p>
      )}
      {rows.map((r) => (
        <article className="approval-row" key={r.id}>
          <div>
            <h3>
              {r.registration} <StatusBadge value={label(r.status)} />
            </h3>
            <p>
              {r.motorist.name} · {readable(r.kind)} request
            </p>
            {r.vehicle && (
              <p>
                {r.vehicle.make} {r.vehicle.model}
              </p>
            )}
            <small>Submitted {date(r.submittedAt)}</small>
          </div>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void open(r)}
          >
            View Request
          </button>
        </article>
      ))}
      {total > 10 && (
        <div className="pagination">
          <button
            disabled={page === 1 || busy}
            onClick={() => setPage(page - 1)}
          >
            Previous requests
          </button>
          <span>Page {page}</span>
          <button
            disabled={page * 10 >= total || busy}
            onClick={() => setPage(page + 1)}
          >
            Next requests
          </button>
        </div>
      )}
      <dialog
        ref={dialog}
        aria-label="Vehicle approval request"
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setDetail(null);
        }}
      >
        {detail && (
          <>
            <h2>
              {decision
                ? decision === 'VERIFIED'
                  ? 'Approve Vehicle Request?'
                  : 'Reject Vehicle Request?'
                : 'Vehicle Request Details'}
            </h2>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <h3>
              {detail.registration} · {detail.motorist.name}
            </h3>
            {decision ? (
              <>
                <p>
                  {decision === 'REJECTED'
                    ? 'This will reject the request without changing the vehicle account link.'
                    : detail.kind === 'LINK'
                      ? 'This will link the vehicle to the motorist account.'
                      : 'This will remove the vehicle link from the motorist account.'}
                </p>
                <p>Decision note: {note}</p>
                <div className="card-actions">
                  <button
                    disabled={busy}
                    className="secondary"
                    onClick={() => setDecision('')}
                  >
                    Back
                  </button>
                  <button
                    className="button-primary"
                    disabled={busy}
                    onClick={() => void submit()}
                  >
                    {busy
                      ? 'Saving…'
                      : decision === 'VERIFIED'
                        ? 'Approve'
                        : 'Confirm Rejection'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <dl className="approval-details">
                  <dt>Account reference</dt>
                  <dd>{detail.motorist.email}</dd>
                  <dt>Submitted</dt>
                  <dd>{date(detail.submittedAt)}</dd>
                  <dt>Request</dt>
                  <dd>
                    {readable(detail.kind)} ·{' '}
                    <StatusBadge value={label(detail.status)} />
                  </dd>
                  <dt>Vehicle</dt>
                  <dd>
                    {detail.vehicle
                      ? `${detail.vehicle.make} ${detail.vehicle.model} · ${detail.vehicle.colour}`
                      : 'No internal vehicle record'}
                  </dd>
                  <dt>Registration status</dt>
                  <dd>
                    {detail.vehicle?.registrationStatus ?? 'Not recorded'}
                  </dd>
                  <dt>Ownership verification</dt>
                  <dd>
                    <StatusBadge value={detail.ownershipStatus} />
                  </dd>
                  <dt>Linked to another motorist</dt>
                  <dd>
                    {detail.linkedToAnotherMotorist
                      ? 'Yes — approval unavailable'
                      : 'No'}
                  </dd>
                </dl>
                <h3>Request history</h3>
                {detail.history.map((h) => (
                  <p key={h.id}>
                    {date(h.submittedAt)} · {readable(h.kind)} ·{' '}
                    {readable(label(h.status))}
                    {h.reviewer && ` · ${h.reviewer.name}`}
                    {h.reviewNote && ` · ${h.reviewNote}`}
                  </p>
                ))}
                {detail.status === 'PENDING' && (
                  <form onSubmit={choose}>
                    <Field>
                      Review note
                      <textarea
                        required
                        minLength={3}
                        maxLength={500}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Record the ownership checks and your decision"
                      />
                    </Field>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        required
                        checked={checked}
                        onChange={(e) => setChecked(e.target.checked)}
                      />
                      I have checked this request and supporting account
                      information.
                    </label>
                    <div className="card-actions">
                      <button
                        className="secondary"
                        value="REJECTED"
                        disabled={busy}
                      >
                        Reject
                      </button>
                      <button
                        value="VERIFIED"
                        disabled={
                          busy ||
                          !detail.vehicle ||
                          detail.linkedToAnotherMotorist
                        }
                      >
                        {detail.kind === 'LINK'
                          ? 'Approve Vehicle'
                          : 'Approve Unlink'}
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setDetail(null)}
            >
              Close request
            </button>
          </>
        )}
      </dialog>
    </section>
  );
}
