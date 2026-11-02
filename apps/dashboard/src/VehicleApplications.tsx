import { useEffect, useRef, useState } from 'react';
import type { Api } from './AdminPanel';
import { apiUrl } from './api';
import { Field } from './Field';
import {
  formatCurrency,
  paymentMethodLabel,
  readable,
  StatusBadge,
} from './presentation';

type Category = {
  id: string;
  code: string;
  label: string;
  feeMinor: number;
  active: boolean;
};
type Attachment = {
  id: string;
  kind: string;
  mimeType: string;
  byteSize: number;
};
type Fee = {
  reference: string;
  receiptReference: string | null;
  status: string;
  method: string;
  feeMinor: number;
  createdAt: string;
  paidAt: string | null;
};
type Application = {
  requestId: string;
  categoryId: string;
  registration: string;
  status: string;
  revision: number;
  make: string;
  model: string;
  year: number;
  colour: string;
  chassis: string;
  engine: string;
  relationship: string;
  declaration: boolean;
  feeMinor: number;
  reviewNote?: string;
  files: Attachment[];
  payments: Fee[];
  applicant?: { name: string; email: string };
  linkedToAnotherMotorist?: boolean;
  decisions: {
    status: string;
    reason: string;
    createdAt: string;
    reviewer: { name: string };
  }[];
};
const kinds = [
  ['OWNERSHIP', 'Ownership document (PDF or image)'],
  ['FRONT', 'Front photograph'],
  ['REAR_PLATE', 'Rear / number plate photograph'],
  ['OTHER_1', 'Additional photograph 1'],
  ['OTHER_2', 'Additional photograph 2'],
];
const currency = (minor: number) => formatCurrency(minor / 100, 'USD');
export function VehicleApplications({
  api,
  staff = false,
}: {
  api: Api;
  staff?: boolean;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <section>
      <div className="section-heading">
        <h2>
          {staff
            ? 'Document-backed vehicle applications'
            : 'Register a vehicle'}
        </h2>
        <button className="secondary" onClick={() => setOpened(!opened)}>
          {opened
            ? 'Close applications'
            : staff
              ? 'Review vehicle applications'
              : 'New vehicle application & status'}
        </button>
      </div>
      {opened && <Applications api={api} staff={staff} />}
    </section>
  );
}
function Applications({ api, staff }: { api: Api; staff: boolean }) {
  const base = staff
    ? '/supervisor/vehicle-applications'
    : '/motorist/vehicle-applications';
  const [items, setItems] = useState<Application[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1);
  const [categories, setCategories] = useState<Category[]>([]),
    [selectedCategory, setSelectedCategory] = useState('');
  const [detail, setDetail] = useState<Application | null>(null),
    [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [limits, setLimits] = useState({
    maxFileBytes: 10485760,
    maxAttachments: 5,
  });
  const [preview, setPreview] = useState<{
    url: string;
    mimeType: string;
  } | null>(null);
  const key = useRef(crypto.randomUUID());
  const [feeMethod, setFeeMethod] = useState('ECOCASH');
  const [decision, setDecision] = useState<{
    status: string;
    reason: string;
  } | null>(null);
  const editable =
    !!detail && ['DRAFT', 'CHANGES_REQUESTED'].includes(detail.status);
  async function list() {
    const data = await api(`${base}?page=${page}&pageSize=10`);
    setItems(data.items);
    setTotal(data.total);
  }
  async function open(id: string) {
    const data = await api(`${base}/${id}`);
    setDetail(data);
    setSelectedCategory(data.categoryId);
    setCreating(false);
    setDecision(null);
  }
  async function work(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void list().catch((e) => setError(e.message));
    const timer = setInterval(() => {
      void list().catch(() => undefined);
    }, 10000);
    return () => clearInterval(timer);
  }, [api, page]);
  useEffect(() => {
    if (!staff) {
      void api('/vehicle-categories')
        .then(setCategories)
        .catch((e) => setError(e.message));
      void api('/motorist/vehicle-applications/limits')
        .then(setLimits)
        .catch((e) => setError(e.message));
    }
  }, [api, staff]);
  useEffect(() => {
    if (!preview) return;
    const timer = setTimeout(() => setPreview(null), 115000);
    return () => clearTimeout(timer);
  }, [preview]);
  async function upload(kind: string, file?: File) {
    if (!file || !detail) return;
    await work(async () => {
      if (file.size > limits.maxFileBytes)
        throw new Error(
          `Maximum file size is ${limits.maxFileBytes / 1048576} MB.`,
        );
      if (/\.hei[cf]$/i.test(file.name))
        throw new Error('Convert HEIC/HEIF to JPEG or PNG before uploading.');
      const body = new FormData();
      body.append('file', file);
      await api(`${base}/${detail.requestId}/files/${kind}`, body);
      await open(detail.requestId);
      setMessage('Attachment uploaded.');
    });
  }
  async function viewFile(file: Attachment) {
    await work(async () => {
      const data = await api(
        `/vehicle-application-files/${file.id}/download`,
        {},
      );
      setPreview({
        mimeType: data.mimeType,
        url: data.url.startsWith('/api/v1/')
          ? apiUrl(data.url.slice(7))
          : data.url,
      });
    });
  }
  function receipt(fee: Fee) {
    const text = [
      'TRAFFIC OPERATIONS',
      'Smart Traffic',
      'In support of ZRP',
      'SIMULATED APPLICATION FEE RECEIPT',
      `Receipt: ${fee.receiptReference}`,
      `Transaction: ${fee.reference}`,
      `Vehicle: ${detail?.registration}`,
      `Amount: ${currency(fee.feeMinor)}`,
      `Method: ${paymentMethodLabel(fee.method)}`,
      `Date: ${fee.paidAt}`,
      'Academic Prototype — No real payments or enforcement',
      'Payment does not approve vehicle ownership.',
    ].join('\n');
    const url = URL.createObjectURL(
      new Blob([text], { type: 'text/plain;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fee.receiptReference}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div aria-busy={busy}>
      <p>
        Applications require document review. Prices are illustrative processing
        fees; payments are simulated.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {busy && <progress aria-label="Processing application or upload" />}
      {!staff && !creating && !detail && (
        <button
          onClick={() => {
            setCreating(true);
            key.current = crypto.randomUUID();
            setSelectedCategory(categories[0]?.id ?? '');
          }}
        >
          Start new application
        </button>
      )}
      {!creating && !detail && (
        <>
          {!items.length && <p>No vehicle applications found.</p>}
          {items.map((row) => (
            <article className="infringement-card" key={row.requestId}>
              <h3>{row.registration}</h3>
              <p>
                {row.make} {row.model} · {currency(row.feeMinor)}
              </p>
              <StatusBadge value={row.status} />
              {row.applicant && <p>{row.applicant.name}</p>}
              <button
                className="secondary"
                onClick={() => void work(() => open(row.requestId))}
              >
                View application
              </button>
            </article>
          ))}
          <div className="pagination">
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous applications
            </button>
            <span>
              Page {page} · {total} applications
            </span>
            <button
              disabled={page * 10 >= total}
              onClick={() => setPage(page + 1)}
            >
              Next applications
            </button>
          </div>
        </>
      )}
      {(creating || detail) && (
        <button
          className="secondary"
          onClick={() => {
            setCreating(false);
            setDetail(null);
            setPreview(null);
            void list();
          }}
        >
          Back to applications
        </button>
      )}
      {detail && (
        <>
          <h3>{detail.registration} · Application</h3>
          <StatusBadge value={detail.status} />
          <p>
            Saved processing fee: <strong>{currency(detail.feeMinor)}</strong>
          </p>
          {detail.reviewNote && <p>Reviewer feedback: {detail.reviewNote}</p>}
          {detail.applicant && (
            <p>
              Applicant: {detail.applicant.name} · {detail.applicant.email}
            </p>
          )}
          {detail.linkedToAnotherMotorist && (
            <p role="alert">
              Ownership conflict: linked to another account. Approval is blocked
              pending a separately verified transfer.
            </p>
          )}
        </>
      )}
      {!staff && (creating || editable) && (
        <form
          key={detail?.requestId ?? 'new'}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const dto = {
              requestKey: key.current,
              revision: detail?.revision ?? 0,
              registration: form.get('registration'),
              categoryId: selectedCategory,
              make: form.get('make'),
              model: form.get('model'),
              year: Number(form.get('year')),
              colour: form.get('colour'),
              chassis: form.get('chassis'),
              engine: form.get('engine') ?? '',
              relationship: form.get('relationship'),
              declaration: form.get('declaration') === 'on',
            };
            void work(async () => {
              const saved = await api(
                detail ? `${base}/${detail.requestId}` : base,
                dto,
                detail ? 'PATCH' : 'POST',
              );
              setDetail(saved);
              setCreating(false);
              setMessage(
                'Draft saved. Add the required attachments before submitting.',
              );
              await list();
            });
          }}
        >
          <fieldset disabled={busy}>
            <legend>Vehicle details</legend>
            <div className="form-grid">
              <Field>
                Vehicle category
                <select
                  required
                  value={selectedCategory}
                  disabled={detail?.status === 'CHANGES_REQUESTED'}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  <option value="">Select category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label} · {currency(c.feeMinor)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field>
                Registration number
                <input
                  name="registration"
                  defaultValue={detail?.registration}
                  required
                  pattern="[A-Za-z0-9 -]{3,20}"
                  placeholder="ABC 1234"
                />
              </Field>
              {(['make', 'model', 'colour', 'chassis', 'engine'] as const).map(
                (field) => (
                  <Field key={field}>
                    {field === 'chassis'
                      ? 'VIN / chassis number'
                      : field === 'engine'
                        ? 'Engine number (optional)'
                        : readable(field)}
                    <input
                      name={field}
                      defaultValue={detail?.[field]}
                      required={field !== 'engine'}
                      maxLength={field === 'chassis' ? 40 : 60}
                      minLength={field === 'chassis' ? 3 : 1}
                    />
                  </Field>
                ),
              )}
              <Field>
                Manufacture year
                <input
                  name="year"
                  type="number"
                  min="1886"
                  max={new Date().getFullYear() + 1}
                  defaultValue={detail?.year}
                  required
                />
              </Field>
              <Field>
                Applicant relationship
                <select
                  name="relationship"
                  defaultValue={detail?.relationship ?? 'OWNER'}
                >
                  <option value="OWNER">Owner</option>
                  <option value="AUTHORISED_DRIVER">Authorised driver</option>
                  <option value="COMPANY_REPRESENTATIVE">
                    Company representative
                  </option>
                </select>
              </Field>
            </div>
            <label className="checkbox">
              <input
                name="declaration"
                type="checkbox"
                defaultChecked={detail?.declaration}
              />
              I declare that these application details are accurate.
            </label>
            <p>
              Selected fee:{' '}
              {currency(
                detail?.status === 'CHANGES_REQUESTED'
                  ? detail.feeMinor
                  : (categories.find((c) => c.id === selectedCategory)
                      ?.feeMinor ??
                      detail?.feeMinor ??
                      0),
              )}
              . No real payment is collected.
            </p>
            <button>Save draft details</button>
          </fieldset>
        </form>
      )}
      {detail && (
        <>
          {(staff || !editable) && (
            <dl className="detail-grid">
              {(
                [
                  'make',
                  'model',
                  'year',
                  'colour',
                  'chassis',
                  'engine',
                  'relationship',
                ] as const
              ).map((field) => (
                <div key={field}>
                  <dt>{readable(field)}</dt>
                  <dd>{detail[field] || 'Not supplied'}</dd>
                </div>
              ))}
            </dl>
          )}
          <h3>Supporting documents & photographs</h3>
          <p>
            PDF, JPEG or PNG · up to {limits.maxFileBytes / 1048576} MB per file
            · {limits.maxAttachments} attachments. Convert HEIC/HEIF to JPEG or
            PNG.
          </p>
          <div className="application-files">
            {kinds.map(([kind, label], index) => {
              const file = detail.files.find((f) => f.kind === kind);
              return (
                <div className="application-file" key={kind}>
                  <h4>
                    {label}
                    {index < 3 ? ' (required)' : ''}
                  </h4>
                  {file ? (
                    <>
                      <p>
                        {file.mimeType} · {Math.ceil(file.byteSize / 1024)} KB
                      </p>
                      <button
                        className="secondary"
                        onClick={() => void viewFile(file)}
                      >
                        View {label}
                      </button>
                    </>
                  ) : (
                    <p>No file attached.</p>
                  )}
                  {!staff && editable && (
                    <>
                      <label>
                        Choose file / replace
                        <input
                          type="file"
                          accept={
                            kind === 'OWNERSHIP'
                              ? 'application/pdf,image/jpeg,image/png,.heic,.heif'
                              : 'image/jpeg,image/png,.heic,.heif'
                          }
                          disabled={busy}
                          onChange={(e) => {
                            void upload(kind, e.target.files?.[0]);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      <label>
                        Take photo
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          disabled={busy}
                          onChange={(e) => {
                            void upload(kind, e.target.files?.[0]);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      {file && (
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() =>
                            void work(async () => {
                              await api(
                                `/motorist/vehicle-application-files/${file.id}/remove`,
                                {},
                              );
                              await open(detail.requestId);
                            })
                          }
                        >
                          Remove attachment
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {preview && (
            <div className="application-preview">
              {preview.mimeType.startsWith('image/') ? (
                <img
                  src={preview.url}
                  alt="Private application attachment preview"
                />
              ) : (
                <p>
                  PDF document ready. The private link expires after two
                  minutes.
                </p>
              )}
              <a href={preview.url} target="_blank" rel="noreferrer">
                Open / download private document
              </a>
              <button className="secondary" onClick={() => setPreview(null)}>
                Close preview
              </button>
            </div>
          )}
          {!staff && editable && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void work(async () => {
                  const result = await api(
                    `${base}/${detail.requestId}/submit`,
                    { revision: detail.revision, declaration: true },
                  );
                  setDetail(result);
                  await list();
                  setMessage('Application submitted for supervisor review.');
                });
              }}
            >
              <label>
                <input type="checkbox" required />I confirm the saved details
                and attachments are accurate.
              </label>
              <button
                disabled={
                  busy ||
                  !['OWNERSHIP', 'FRONT', 'REAR_PLATE'].every((k) =>
                    detail.files.some((f) => f.kind === k),
                  )
                }
              >
                Submit for review
              </button>
            </form>
          )}
          {staff && detail.status === 'PENDING_REVIEW' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                setDecision({
                  status: String(data.get('status')),
                  reason: String(data.get('reason')),
                });
              }}
            >
              <h3>Review decision</h3>
              <Field>
                Decision
                <select name="status">
                  <option value="APPROVED">
                    Approve verified vehicle association
                  </option>
                  <option value="CHANGES_REQUESTED">Request changes</option>
                  <option value="REJECTED">Reject</option>
                </select>
              </Field>
              <Field>
                Reason / feedback
                <textarea
                  name="reason"
                  required
                  minLength={3}
                  maxLength={1000}
                />
              </Field>
              <label>
                <input type="checkbox" required />I checked the applicant,
                vehicle details and private documents.
              </label>
              <button disabled={busy}>Review decision</button>
            </form>
          )}
          {decision && (
            <div role="alert">
              <p>
                Confirm {readable(decision.status)}: {decision.reason}
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  void work(async () => {
                    setDetail(
                      await api(`${base}/${detail.requestId}/review`, {
                        ...decision,
                        revision: detail.revision,
                        checked: true,
                      }),
                    );
                    setDecision(null);
                    await list();
                  })
                }
              >
                Confirm decision
              </button>
              <button className="secondary" onClick={() => setDecision(null)}>
                Cancel decision
              </button>
            </div>
          )}
          <h3>Review history</h3>
          {!detail.decisions.length && <p>No review decisions yet.</p>}
          {detail.decisions.map((d, i) => (
            <p key={i}>
              <StatusBadge value={d.status} /> {d.reason} · {d.reviewer.name} ·{' '}
              {new Date(d.createdAt).toLocaleString()}
            </p>
          ))}
          <h3>Application fee simulation</h3>
          <p>
            {currency(detail.feeMinor)} · Payment does not approve ownership.
          </p>
          {!staff &&
            !['DRAFT', 'REJECTED'].includes(detail.status) &&
            !detail.payments.some((p) =>
              ['SUCCESS', 'PROCESSING'].includes(p.status),
            ) && (
              <>
                <Field>
                  Payment method
                  <select
                    value={feeMethod}
                    onChange={(e) => setFeeMethod(e.target.value)}
                  >
                    <option value="ECOCASH">EcoCash</option>
                    <option value="INNBUCKS">InnBucks</option>
                    <option value="CARD">Bank Card</option>
                  </select>
                </Field>
                <p>
                  Simulation only. Never enter a real phone PIN or card details.
                </p>
                <button
                  disabled={busy}
                  onClick={() =>
                    void work(async () => {
                      await api(
                        `/motorist/vehicle-applications/${detail.requestId}/payments`,
                        { requestKey: key.current, method: feeMethod },
                      );
                      await open(detail.requestId);
                    })
                  }
                >
                  Start simulated fee payment
                </button>
              </>
            )}
          {detail.payments.map((p) => (
            <article className="application-file" key={p.reference}>
              <strong>
                {currency(p.feeMinor)} · {paymentMethodLabel(p.method)}
              </strong>
              <p>
                <StatusBadge value={p.status} /> ·{' '}
                {new Date(p.createdAt).toLocaleString()}
              </p>
              <p>{p.reference}</p>
              {p.status === 'SUCCESS' && (
                <button className="secondary" onClick={() => receipt(p)}>
                  View Receipt
                </button>
              )}
              {!staff && p.status === 'PROCESSING' && (
                <div className="card-actions">
                  {['APPROVE', 'DECLINE', 'TIMEOUT', 'CANCEL'].map(
                    (outcome) => (
                      <button
                        disabled={busy}
                        key={outcome}
                        onClick={() =>
                          void work(async () => {
                            await api(
                              `/motorist/application-payments/${p.reference}/outcome`,
                              { outcome },
                            );
                            key.current = crypto.randomUUID();
                            await open(detail.requestId);
                          })
                        }
                      >
                        Simulate {readable(outcome)}
                      </button>
                    ),
                  )}
                </div>
              )}
            </article>
          ))}
        </>
      )}
    </div>
  );
}

export function VehicleCategorySettings({ api }: { api: Api }) {
  const [rows, setRows] = useState<Category[]>([]),
    [selected, setSelected] = useState<Category | null>(null),
    [error, setError] = useState('');
  const [opened, setOpened] = useState(false);
  async function load() {
    setRows(await api('/vehicle-categories'));
  }
  return (
    <section>
      <h2>Vehicle categories & processing fees</h2>
      <button
        className="secondary"
        onClick={() => {
          setOpened(!opened);
          void load().catch((e) => setError(e.message));
        }}
      >
        Configure vehicle categories
      </button>
      {error && <p role="alert">{error}</p>}
      {opened && (
        <>
          <p>
            Illustrative USD fees for simulation. Existing application snapshots
            are preserved.
          </p>
          {rows.map((c) => (
            <p key={c.id}>
              {c.label} · {currency(c.feeMinor)} ·{' '}
              {c.active ? 'Active' : 'Disabled'}{' '}
              <button className="secondary" onClick={() => setSelected(c)}>
                Edit {c.code}
              </button>
            </p>
          ))}
          <form
            key={selected?.id ?? 'new'}
            onSubmit={async (e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              try {
                await api(
                  selected
                    ? `/admin/vehicle-categories/${selected.id}`
                    : '/admin/vehicle-categories',
                  {
                    code: data.get('code'),
                    label: data.get('label'),
                    feeMinor: Math.round(Number(data.get('fee')) * 100),
                    active: data.get('active') === 'on',
                  },
                  selected ? 'PATCH' : 'POST',
                );
                setSelected(null);
                await load();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Field>
              Category code
              <input
                name="code"
                defaultValue={selected?.code}
                pattern="[A-Z0-9_]{2,20}"
                required
              />
            </Field>
            <Field>
              Category name
              <input
                name="label"
                defaultValue={selected?.label}
                minLength={3}
                maxLength={100}
                required
              />
            </Field>
            <Field>
              Illustrative fee (US$)
              <input
                type="number"
                name="fee"
                min="0"
                max="100000"
                step="0.01"
                defaultValue={(selected?.feeMinor ?? 0) / 100}
                required
              />
            </Field>
            <label>
              <input
                type="checkbox"
                name="active"
                defaultChecked={selected?.active ?? true}
              />
              Active
            </label>
            <button>Save category</button>
            <button
              type="button"
              className="secondary"
              onClick={() => setSelected(null)}
            >
              New category
            </button>
          </form>
        </>
      )}
    </section>
  );
}
