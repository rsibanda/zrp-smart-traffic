import { Charge, chargeLines, OffenceLine, OffenceLines } from './OffenceLines';
import { formatCurrency, ticketLabel, StatusBadge } from './presentation';
import { useEffect, useId, useRef, useState } from 'react';
import { Field } from './Field';
import { EvidencePanel } from './EvidencePanel';
import { AccountApi } from './MotoristDashboard';
import { IssuedTicketQr } from './TicketQr';
import { DriverIdentification } from './DriverPoints';
type Category = {
  id: string;
  name: string;
  demoFineAmount: string;
  demeritPoints: number;
  paymentDueDays: number;
};
type Vehicle = {
  id: string;
  registrationNumber: string;
  make: string;
  model: string;
  motoristId: string | null;
  motorist?: { name: string } | null;
  driver: { fullName: string; licenceStatus: string } | null;
};
export function CitationTerminal({
  api,
  token,
  onIssued,
}: {
  api: AccountApi;
  token: string;
  onIssued?: () => void;
}) {
  const formId = useId();
  const [responsibleDriver, setResponsibleDriver] = useState('');
  const [categories, setCategories] = useState<Category[]>([]),
    [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null),
    [registration, setRegistration] = useState('');
  const [draft, setDraft] = useState<{
      id: string;
      category?: Category;
      charges?: Charge[];
    } | null>(null),
    [ticket, setTicket] = useState<{
      id: string;
      publicReference: string;
      displayReference?: string;
      demoFineAmountSnapshot: string;
      demeritPointsSnapshot: number;
      offences?: OffenceLine[];
    } | null>(null);
  const [code, setCode] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const pending = useRef<unknown>(null);
  const preview = useRef<HTMLDialogElement>(null);
  const selected = categories.filter((c) => categoryIds.includes(c.id));
  const savedLines = chargeLines(draft?.charges);
  const lines =
    ticket?.offences ??
    (savedLines.length
      ? savedLines
      : selected.map((c) => ({
          categoryId: c.id,
          name: c.name,
          fine: c.demoFineAmount,
          points: c.demeritPoints,
        })));
  const fine =
    ticket?.demoFineAmountSnapshot ??
    (lines.length
      ? (
          lines.reduce((sum, c) => sum + Math.round(Number(c.fine) * 100), 0) /
          100
        ).toFixed(2)
      : undefined);
  const points =
    ticket?.demeritPointsSnapshot ??
    (lines.length ? lines.reduce((sum, c) => sum + c.points, 0) : undefined);
  const toggleCategory = (id: string) =>
    setCategoryIds((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    );
  useEffect(() => {
    let active = true;
    void api('/offence-categories')
      .then((data) => {
        if (active) {
          setCategories(data);
          setCategoryIds([]);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [api]);
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
  return (
    <section className="citation-terminal">
      <span className="eyebrow">OFFICER CITATION TERMINAL</span>
      <h2>Issue Traffic Infringement</h2>
      <ol className="citation-steps" aria-label="Citation steps">
        <li aria-current={!vehicle ? 'step' : undefined}>1. Find vehicle</li>
        <li aria-current={vehicle && !draft ? 'step' : undefined}>
          2. Record infringement
        </li>
        <li aria-current={draft && !ticket ? 'step' : undefined}>
          3. Review &amp; issue
        </li>
      </ol>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="officer-citation-layout">
        <div className="officer-citation-inputs">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void perform(async () => {
                const data = await api(
                  `/vehicles?registration=${encodeURIComponent(registration)}`,
                );
                setVehicle(data.items[0] ?? null);
                if (!data.items.length) setError('No matching records.');
              });
            }}
          >
            <div className="form-grid citation-fields">
              <Field>
                Vehicle registration
                <input
                  value={registration}
                  onChange={(e) => {
                    setRegistration(e.target.value);
                    setVehicle(null);
                  }}
                  placeholder="ABC1234"
                  required
                  disabled={busy || !!draft || uncertain}
                />
              </Field>
              <button disabled={busy || !!draft || uncertain}>
                Lookup vehicle
              </button>
            </div>
          </form>
          {vehicle && (
            <>
              <div className="vehicle-summary">
                <h3>
                  {vehicle.registrationNumber} · {vehicle.make} {vehicle.model}
                </h3>
                <p>
                  {vehicle.driver?.fullName ?? 'Driver not recorded'} · Licence:{' '}
                  {vehicle.driver?.licenceStatus ?? 'Not recorded'}
                </p>
                <p>
                  {vehicle.motoristId
                    ? `Linked motorist: ${vehicle.motorist?.name ?? 'Account verified'}`
                    : 'Account not linked. Provide a ticket verification code after issue.'}
                </p>
              </div>
              {!draft && !ticket && (
                <DriverIdentification
                  key={vehicle.id}
                  api={api}
                  onChange={setResponsibleDriver}
                />
              )}
              {!ticket && (
                <form
                  id={formId}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!selected.length) {
                      setError(
                        'Select a valid offence category before continuing.',
                      );
                      return;
                    }
                    const data = new FormData(e.currentTarget);
                    if (!pending.current)
                      pending.current = {
                        requestKey: crypto.randomUUID(),
                        vehicleId: vehicle.id,
                        categoryIds,
                        ...(responsibleDriver
                          ? { responsibleDriverId: responsibleDriver }
                          : {}),
                        location: data.get('location'),
                        notes: data.get('notes'),
                        observedAt: new Date().toISOString(),
                      };
                    void perform(async () => {
                      setUncertain(true);
                      const result = await api('/offences', pending.current);
                      setDraft(result);
                      setUncertain(false);
                      preview.current?.showModal();
                    });
                  }}
                >
                  <fieldset disabled={busy || !!draft || uncertain}>
                    <div className="form-grid citation-fields">
                      <div className="field offence-picker">
                        <span id={`${formId}-offences-label`}>
                          Offence categories
                        </span>
                        <details
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              e.currentTarget.open = false;
                              e.currentTarget.querySelector('summary')?.focus();
                            }
                          }}
                        >
                          <summary
                            aria-labelledby={`${formId}-offences-label ${formId}-offences-summary`}
                          >
                            <span id={`${formId}-offences-summary`}>
                              {selected.length
                                ? `${selected.length} offences selected`
                                : 'Select offence categories'}
                            </span>
                          </summary>
                          <div
                            className="offence-options"
                            role="group"
                            aria-label="Offence categories"
                          >
                            {categories.map((c) => (
                              <label key={c.id}>
                                <input
                                  type="checkbox"
                                  checked={categoryIds.includes(c.id)}
                                  onChange={() => toggleCategory(c.id)}
                                />
                                <span>
                                  {c.name}
                                  <small>
                                    {formatCurrency(c.demoFineAmount)} ·{' '}
                                    {c.demeritPoints} points
                                  </small>
                                </span>
                              </label>
                            ))}
                          </div>
                        </details>
                        <div
                          className="offence-chips"
                          aria-label="Selected offence chips"
                        >
                          {selected.map((c) => (
                            <button
                              type="button"
                              className="secondary offence-chip"
                              key={c.id}
                              aria-label={`Remove ${c.name}`}
                              onClick={() => toggleCategory(c.id)}
                            >
                              {c.name} <span aria-hidden="true">×</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <Field>
                        Location
                        <input
                          name="location"
                          required
                          minLength={3}
                          maxLength={200}
                          placeholder="Street or intersection"
                        />
                      </Field>
                      <Field>
                        Officer notes (optional)
                        <textarea
                          name="notes"
                          maxLength={2000}
                          placeholder="Record the observed facts"
                        />
                      </Field>
                    </div>
                  </fieldset>
                  <p className="muted">
                    The selected offences determine the combined fine and
                    points. Observation time is recorded when the draft is
                    saved.
                  </p>
                  {!selected.length && (
                    <p role="status">
                      Select a valid offence category to calculate the fine and
                      demerit points.
                    </p>
                  )}
                </form>
              )}
              {draft && !ticket && (
                <EvidencePanel
                  api={api}
                  token={token}
                  offenceId={draft.id}
                  draft={true}
                  officer={true}
                />
              )}
            </>
          )}
        </div>
        <aside className="officer-citation-summary">
          <span>Ticket Reference</span>
          <strong className="ticket-tag">
            {ticket ? ticketLabel(ticket) : 'Assigned when issued'}
          </strong>
          <StatusBadge
            value={ticket ? 'SUBMITTED' : draft ? 'DRAFT' : 'PENDING'}
          />
          <OffenceLines lines={lines} />
          <span>Total Fine</span>
          <strong className="officer-fine-total" aria-live="polite">
            {fine !== undefined ? formatCurrency(fine) : 'Select an offence'}
          </strong>
          <span>Demerit Points</span>
          <strong className="officer-points" aria-live="polite">
            {points !== undefined ? points + ' Points' : 'Not selected'}
          </strong>
          <p>Review the saved draft and optional evidence before issuing.</p>
          {!ticket &&
            (!draft ? (
              <button
                form={formId}
                type="submit"
                disabled={busy || !vehicle || !selected.length}
              >
                {uncertain ? 'Retry same draft' : 'Issue & Send'}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => preview.current?.showModal()}
              >
                Review saved draft
              </button>
            ))}
        </aside>
      </div>
      {ticket && (
        <div role="status">
          <h3>Infringement issued</h3>
          <p className="reference">{ticketLabel(ticket)}</p>
          <p>Amount: {formatCurrency(ticket.demoFineAmountSnapshot)}</p>
          <IssuedTicketQr key={ticket.id} api={api} ticketId={ticket.id} />
          <button
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                const result = await api(
                  `/tickets/${ticket.id}/access-code`,
                  {},
                );
                setCode(result.verificationCode);
              })
            }
          >
            Generate verification code
          </button>
          {code && (
            <p>
              Give this code to the motorist: <strong>{code}</strong>
            </p>
          )}
          <button
            className="secondary"
            onClick={() => {
              setTicket(null);
              setDraft(null);
              setVehicle(null);
              setCategoryIds([]);
              setCode('');
              pending.current = null;
            }}
          >
            New infringement
          </button>
        </div>
      )}
      <dialog ref={preview} aria-labelledby="citation-confirm">
        <h2 id="citation-confirm">Issue this infringement?</h2>
        <p>
          {vehicle?.registrationNumber} · {lines.map((c) => c.name).join(', ')}
        </p>
        <OffenceLines lines={lines} />
        <p>
          {fine !== undefined ? formatCurrency(fine) : 'Select an offence'} ·{' '}
          {points ?? 'Not selected'} points
        </p>
        <p>
          {vehicle?.motoristId
            ? `Linked motorist: ${vehicle.motorist?.name ?? 'Account verified'}`
            : 'Ticket verification required to link an account.'}
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="card-actions">
          <button
            className="secondary"
            disabled={busy}
            onClick={() => preview.current?.close()}
          >
            Cancel
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                const result = await api(`/offences/${draft!.id}/submit`, {});
                setTicket(result);
                onIssued?.();
                preview.current?.close();
              })
            }
          >
            Issue Infringement
          </button>
        </div>
      </dialog>
    </section>
  );
}
