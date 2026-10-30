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
    [category, setCategory] = useState('');
  const [vehicle, setVehicle] = useState<Vehicle | null>(null),
    [registration, setRegistration] = useState('');
  const [draft, setDraft] = useState<{ id: string } | null>(null),
    [ticket, setTicket] = useState<{
      id: string;
      publicReference: string;
      displayReference?: string;
      demoFineAmountSnapshot: string;
    } | null>(null);
  const [code, setCode] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const pending = useRef<unknown>(null);
  const preview = useRef<HTMLDialogElement>(null);
  const selected = categories.find((c) => c.id === category);
  useEffect(() => {
    let active = true;
    void api('/offence-categories')
      .then((data) => {
        if (active) {
          setCategories(data);
          setCategory('');
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
                    const data = new FormData(e.currentTarget);
                    if (!pending.current)
                      pending.current = {
                        requestKey: crypto.randomUUID(),
                        vehicleId: vehicle.id,
                        categoryId: category,
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
                      <Field>
                        Offence category
                        <select
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          required
                        >
                          <option value="" disabled>
                            Select an offence category
                          </option>
                          {categories.map((c) => (
                            <option value={c.id} key={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </Field>
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
                    The selected category determines the fine and points.
                    Observation time is recorded when the draft is saved.
                  </p>
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
          <span>Calculated Fine</span>
          <strong className="officer-fine-total">
            {selected
              ? formatCurrency(selected.demoFineAmount)
              : 'Select an offence'}
          </strong>
          <span>Demerit Points</span>
          <strong className="officer-points">
            {selected ? selected.demeritPoints + ' Points' : 'Not selected'}
          </strong>
          <p>Review the saved draft and optional evidence before issuing.</p>
          {!ticket &&
            (!draft ? (
              <button
                form={formId}
                type="submit"
                disabled={busy || !vehicle || !selected}
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
          {vehicle?.registrationNumber} · {selected?.name}
        </p>
        <p>
          {formatCurrency(selected?.demoFineAmount)} ·{' '}
          {selected?.demeritPoints ?? 0} points
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
