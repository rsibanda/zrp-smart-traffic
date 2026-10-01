import { Field } from './Field';
import { apiFetch, responseError } from './api';
import { FormEvent, useEffect, useState } from 'react';
import { Api } from './AdminPanel';
type Item = { id: string; byteSize: number; createdAt: string };
export function EvidencePanel({
  api,
  token,
  offenceId,
  draft,
  ticketId,
  officer,
}: {
  api: Api;
  token: string;
  offenceId: string;
  draft: boolean;
  ticketId?: string;
  officer: boolean;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  useEffect(() => {
    void api(`/offences/${offenceId}/evidence`)
      .then(setItems)
      .catch((e) => setError(e.message));
    setCode('');
  }, [api, offenceId]);
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function download(id: string) {
    const response = await apiFetch(`/evidence/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error('Evidence unavailable or access expired.');
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = `evidence-${id}.jpg`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void perform(async () => {
      const response = await apiFetch(`/offences/${offenceId}/evidence`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: data,
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) {
        throw await responseError(response);
      }
      setItems(await api(`/offences/${offenceId}/evidence`));
      form.reset();
    });
  }
  return (
    <div>
      <h3>Private evidence</h3>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            {new Date(item.createdAt).toLocaleString()} ·{' '}
            {Math.ceil(item.byteSize / 1024)} KB{' '}
            <button
              disabled={busy}
              onClick={() => void perform(() => download(item.id))}
            >
              Download image
            </button>
          </li>
        ))}
      </ul>
      {!items.length && <p>No evidence attached.</p>}
      {officer && draft && (
        <form onSubmit={upload}>
          <Field>
            Evidence image (JPEG/PNG, up to 5 MB)
            <input
              name="file"
              type="file"
              accept="image/jpeg,image/png"
              required
            />
          </Field>
          <button disabled={busy}>Upload private evidence</button>
        </form>
      )}
      {officer && ticketId && (
        <div>
          <h3>Motorist verification</h3>
          <p>
            Generate a separate access code for this traffic ticket. Generating
            again invalidates the previous code and public sessions.
          </p>
          <button
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                const result = await api(
                  `/tickets/${ticketId}/access-code`,
                  {},
                );
                setCode(result.verificationCode);
              })
            }
          >
            Generate motorist access code
          </button>
          {code && (
            <p role="status">
              Verification code: <code>{code}</code>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
