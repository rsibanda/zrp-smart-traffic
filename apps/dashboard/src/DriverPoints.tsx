import { useEffect, useState } from 'react';
import type { Api } from './AdminPanel';
import { Field } from './Field';

export type DriverBalance = {
  status: string;
  remaining: number | null;
  allowance: number | null;
  totalDeducted: number;
  history: {
    reference: string;
    event: string;
    delta: number;
    at: string;
    reason: string;
  }[];
};
export function DriverIdentification({
  api,
  onChange,
}: {
  api: Api;
  onChange: (id: string) => void;
}) {
  const [licence, setLicence] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [driver, setDriver] = useState<{
    id: string;
    fullName: string;
    licenceStatus: string;
  } | null>(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    onChange('');
  }, []);
  return (
    <fieldset>
      <legend>Responsible driver</legend>
      <p>
        Identify the driver explicitly. Vehicle ownership does not establish
        responsibility. If unknown, points remain pending identification.
      </p>
      <Field>
        Driver licence number
        <input
          value={licence}
          disabled={busy}
          maxLength={80}
          onChange={(e) => {
            setLicence(e.target.value);
            setDriver(null);
            setChecked(false);
            onChange('');
          }}
          placeholder="Exact licence number"
        />
      </Field>
      <button
        type="button"
        className="secondary"
        disabled={busy || licence.trim().length < 3}
        onClick={async () => {
          setBusy(true);
          setError('');
          setDriver(null);
          setChecked(false);
          onChange('');
          try {
            setDriver(
              await api(
                `/drivers/verified?licenceNumber=${encodeURIComponent(licence.trim())}`,
              ),
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Find verified driver
      </button>
      {error && <p role="alert">{error}</p>}
      {driver && (
        <>
          <p>
            {driver.fullName} · {driver.licenceStatus}
          </p>
          <label>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => {
                setChecked(e.target.checked);
                onChange(e.target.checked ? driver.id : '');
              }}
            />
            I verified this is the driver responsible for this infringement.
          </label>
        </>
      )}
      {!checked && (
        <p className="muted">
          Pending driver identification — no points will be deducted.
        </p>
      )}
    </fieldset>
  );
}
export function DriverIdentitySettings({ api }: { api: Api }) {
  const [opened, setOpened] = useState(false),
    [allowance, setAllowance] = useState(12),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  return (
    <section>
      <h2>Driver identity & points policy</h2>
      <button
        className="secondary"
        onClick={() => {
          setOpened(!opened);
          void api('/admin/driver-points/policy')
            .then((p) => setAllowance(p.allowance))
            .catch((e) => setError(e.message));
        }}
      >
        Manage driver verification
      </button>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {opened && (
        <>
          <p>
            Academic assumptions only. Verification links an existing driver to
            one motorist account. Vehicle ownership alone is insufficient.
            Historical tickets are not deducted retrospectively.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setError('');
              try {
                const r = await api('/admin/driver-identities/verify', {
                  licenceNumber: f.get('licence'),
                  motoristEmail: f.get('email'),
                  verified: true,
                  reason: f.get('reason'),
                });
                setMessage(
                  `${r.name} verified to ${r.motorist}. Opening allowance created only if absent.`,
                );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Field>
              Existing driver licence number
              <input name="licence" minLength={3} maxLength={80} required />
            </Field>
            <Field>
              Motorist account email
              <input name="email" type="email" required />
            </Field>
            <Field>
              Verification reason
              <textarea name="reason" minLength={3} maxLength={500} required />
            </Field>
            <label>
              <input type="checkbox" required />I verified this account belongs
              to the licensed driver.
            </label>
            <button>Verify driver identity</button>
          </form>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await api('/admin/driver-points/policy', {
                  allowance,
                  reason: f.get('reason'),
                });
                setMessage(
                  'Policy saved for new points accounts. Existing balances are unchanged.',
                );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <h3>Starting allowance for new drivers</h3>
            <Field>
              Illustrative points allowance
              <input
                type="number"
                min="1"
                max="100"
                value={allowance}
                onChange={(e) => setAllowance(Number(e.target.value))}
                required
              />
            </Field>
            <Field>
              Policy change reason
              <textarea name="reason" minLength={3} maxLength={500} required />
            </Field>
            <button>Save policy</button>
          </form>
        </>
      )}
    </section>
  );
}
export function PointsHistory({ balance }: { balance?: DriverBalance }) {
  if (!balance || balance.status !== 'VERIFIED')
    return (
      <p>
        Driver identity verification pending. Vehicle ownership does not assign
        driver points.
      </p>
    );
  return (
    <section>
      <h2>
        Points Remaining: {balance.remaining} / {balance.allowance}
      </h2>
      <p>
        {balance.totalDeducted} total deducted. Paying a fine does not restore
        points. Academic policy; historical tickets are not backfilled.
      </p>
      <details>
        <summary>View points history</summary>
        {balance.history.map((entry, i) => (
          <p key={i}>
            <strong>{entry.reference}</strong> · {entry.delta > 0 ? '+' : ''}
            {entry.delta} points · {entry.reason} ·{' '}
            {new Date(entry.at).toLocaleString()}
          </p>
        ))}
      </details>
    </section>
  );
}
