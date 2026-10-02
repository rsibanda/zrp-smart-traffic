import { StatusBadge } from './presentation';
import { Field } from './Field';
import { FormEvent, useEffect, useState } from 'react';
import { Api } from './AdminPanel';
type Alert = {
  id: string;
  title: string;
  message: string;
  active: boolean;
  createdBy: string;
};
export function AlertsPanel({ api, userId }: { api: Api; userId: string }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api('/alerts')
      .then(setAlerts)
      .catch((e) => setError(e.message));
  }, [api]);
  async function perform(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      setAlerts(await api('/alerts'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void perform(async () => {
      await api('/alerts', {
        title: data.get('title'),
        message: data.get('message'),
      });
      form.reset();
    });
  }
  return (
    <section>
      <h3>Traffic Alerts</h3>
      <p>Published notices are visible to motorists. Omit personal details.</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <ul className="record-list">
        {alerts.length === 0 && <li>No traffic notices available.</li>}
        {alerts.map((alert) => (
          <li key={alert.id}>
            <strong>{alert.title}</strong> ·{' '}
            <StatusBadge value={alert.active ? 'PUBLISHED' : 'WITHDRAWN'} />
            <p>{alert.message}</p>
            {alert.createdBy === userId && (
              <button
                disabled={busy}
                onClick={() =>
                  void perform(() =>
                    api(
                      `/alerts/${alert.id}`,
                      { active: !alert.active },
                      'PATCH',
                    ),
                  )
                }
              >
                {alert.active ? 'Withdraw alert' : 'Republish alert'}
              </button>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={publish}>
        <Field>
          Alert title
          <input
            name="title"
            placeholder="A concise traffic advisory heading"
            required
            minLength={3}
            maxLength={100}
          />
        </Field>
        <Field>
          Alert message
          <textarea
            name="message"
            placeholder="Describe the affected area and road information"
            required
            minLength={3}
            maxLength={1000}
          />
        </Field>
        <button disabled={busy}>Publish alert</button>
      </form>
    </section>
  );
}
