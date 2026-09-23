import {FormEvent, useEffect, useState} from 'react';
import {Api} from './AdminPanel';
type Alert = {id: string; title: string; message: string; active: boolean; createdBy: string};
export function AlertsPanel({api, userId}: {api: Api; userId: string}) {
  const [alerts, setAlerts] = useState<Alert[]>([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {void api('/alerts').then(setAlerts).catch(e => setError(e.message));}, [api]);
  async function perform(action: () => Promise<unknown>) {setBusy(true); setError(''); try {await action(); setAlerts(await api('/alerts'));} catch(e) {setError((e as Error).message);} finally {setBusy(false);}}
  function publish(event: FormEvent<HTMLFormElement>) {event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); void perform(async () => {await api('/alerts', {title: data.get('title'), message: data.get('message')}); form.reset();});}
  return <section><h3>Public demo traffic alerts</h3><p>Published text is visible to everyone. Use fictional information only; omit personal details.</p>{error && <p role="alert" className="error">{error}</p>}<ul>{alerts.map(alert => <li key={alert.id}><strong>{alert.title}</strong> · {alert.active ? 'Published' : 'Withdrawn'}<p>{alert.message}</p>{alert.createdBy === userId && <button disabled={busy} onClick={() => void perform(() => api(`/alerts/${alert.id}`, {active: !alert.active}, 'PATCH'))}>{alert.active ? 'Withdraw alert' : 'Republish alert'}</button>}</li>)}</ul><form onSubmit={publish}><label>Alert title<input name="title" required minLength={3} maxLength={100} /></label><label>Alert message<textarea name="message" required minLength={3} maxLength={1000} /></label><button disabled={busy}>Publish demo alert</button></form></section>;
}
