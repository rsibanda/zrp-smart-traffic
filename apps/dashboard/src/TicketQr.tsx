import { useEffect, useRef, useState } from 'react';
import type { AccountApi } from './MotoristDashboard';

export type IssuedQr = {
  qrImage: string;
  verificationUrl: string;
  expiresAt: string;
  displayReference: string;
};

export function IssuedTicketQr({
  api,
  ticketId,
}: {
  api: AccountApi;
  ticketId: string;
}) {
  const [qr, setQr] = useState<IssuedQr | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const started = useRef(false);
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      void generate();
    }
  }, []);
  async function generate() {
    setBusy(true);
    setError('');
    try {
      setQr(await api(`/tickets/${ticketId}/qr`, {}));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ticket-qr">
      <button type="button" disabled={busy} onClick={() => void generate()}>
        {qr ? 'Replace QR (invalidates previous code)' : 'Generate ticket QR'}
      </button>
      {error && <p role="alert">{error}</p>}
      {qr && (
        <>
          <button
            type="button"
            className="qr-image-button secondary"
            onClick={() => dialog.current?.showModal()}
            aria-label="Enlarge ticket QR"
          >
            <img
              src={qr.qrImage}
              alt={`Scan ticket ${qr.displayReference}`}
              width="220"
              height="220"
            />
          </button>
          <p>
            Valid until {new Date(qr.expiresAt).toLocaleString()}. The motorist
            must sign in to their linked account.
          </p>
          <div className="card-actions">
            <a
              className="button secondary"
              href={qr.qrImage}
              download={`${qr.displayReference}-QR.png`}
            >
              Save QR image
            </a>
            <button
              className="secondary"
              onClick={() => {
                if (navigator.share)
                  void navigator
                    .share({
                      title: qr.displayReference,
                      url: qr.verificationUrl,
                    })
                    .catch(() =>
                      setError(
                        'Sharing was cancelled or unavailable. Save the QR image instead.',
                      ),
                    );
                else
                  setError(
                    'Sharing is unavailable in this browser. Save the QR image instead.',
                  );
              }}
            >
              Share QR link
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`/tickets/${ticketId}/qr/revoke`, {});
                  setQr(null);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Revoke QR
            </button>
          </div>
          <dialog ref={dialog} className="qr-dialog" aria-label="Ticket QR">
            <h2>{qr.displayReference}</h2>
            <img
              src={qr.qrImage}
              alt="Ticket verification QR"
              width="600"
              height="600"
            />
            <p>Academic Prototype — No real payments or enforcement</p>
            <button onClick={() => window.print()}>Print QR</button>{' '}
            <button
              className="secondary"
              onClick={() => dialog.current?.close()}
            >
              Close
            </button>
          </dialog>
        </>
      )}
    </div>
  );
}

export function tokenFromQr(value: string, origin: string) {
  const url = new URL(value);
  const token =
    new URLSearchParams(url.hash.slice(1)).get('token') ??
    url.searchParams.get('token');
  if (
    url.origin !== origin ||
    url.pathname !== '/verify' ||
    !token ||
    !/^[a-f0-9]{64}$/.test(token)
  )
    throw new Error(
      'This is not a Smart Traffic ticket QR. Use the ticket reference and verification code instead.',
    );
  return token;
}

export function TicketScanner({
  api,
  onVerified,
  initialToken,
  onConsumed,
}: {
  api: AccountApi;
  onVerified: (reference: string) => void;
  initialToken?: string;
  onConsumed?: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const scanner = useRef<import('qr-scanner').default | null>(null);
  const [active, setActive] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      scanner.current?.destroy();
    };
  }, []);
  async function verify(token: string) {
    scanner.current?.stop();
    setActive(false);
    setBusy(true);
    setError('');
    try {
      const ticket = await api('/motorist/ticket-qr/verify', { token });
      if (mounted.current) onVerified(ticket.reference);
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
      onConsumed?.();
    }
  }
  useEffect(() => {
    if (initialToken) void verify(initialToken);
  }, [initialToken]);
  async function decode(value: string) {
    const { origin } = await api('/public/ticket-qr/config');
    if (!origin)
      throw new Error(
        'QR verification is not configured. Use manual ticket verification.',
      );
    await verify(tokenFromQr(value, origin));
  }
  async function start() {
    setError('');
    setBusy(true);
    try {
      const { default: QrScanner } = await import('qr-scanner');
      if (!mounted.current || !video.current) return;
      scanner.current?.destroy();
      scanner.current = new QrScanner(
        video.current,
        (result) => {
          scanner.current?.stop();
          setActive(false);
          void decode(result.data).catch((e) => setError(e.message));
        },
        {
          preferredCamera: 'environment',
          returnDetailedScanResult: true,
          maxScansPerSecond: 5,
        },
      );
      await scanner.current.start();
      setActive(true);
    } catch {
      setError(
        'Camera unavailable or permission denied. Choose a QR image or use manual ticket verification.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ticket-scanner" aria-label="Scan Ticket QR">
      <h2>Scan Ticket QR</h2>
      <p>
        Scan a ticket issued to your account. You can also use the ticket
        reference and verification code.
      </p>
      <video
        ref={video}
        className={active ? 'qr-camera' : 'qr-camera qr-camera-hidden'}
        muted
        playsInline
        aria-label="Ticket QR camera preview"
      />
      <div className="card-actions">
        <button disabled={busy} onClick={() => void start()}>
          Start camera
        </button>
        {active && (
          <button
            className="secondary"
            onClick={() => {
              scanner.current?.stop();
              setActive(false);
            }}
          >
            Stop camera
          </button>
        )}
        <label className="qr-file-label">
          Choose QR image
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              setError('');
              setBusy(true);
              scanner.current?.stop();
              setActive(false);
              try {
                if (file.size > 10 * 1024 * 1024)
                  throw new Error('Choose an image smaller than 10 MB.');
                const { default: QrScanner } = await import('qr-scanner');
                const result = await QrScanner.scanImage(file, {
                  returnDetailedScanResult: true,
                });
                await decode(result.data);
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : 'No readable QR found. Try another image or manual verification.',
                );
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
      </div>
      {busy && <p role="status">Checking ticket…</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}

export function PublicQrStatus({
  api,
  token,
}: {
  api: AccountApi;
  token: string;
}) {
  const [message, setMessage] = useState('Checking ticket QR…');
  useEffect(() => {
    let active = true;
    void api('/public/ticket-qr/status', { token })
      .then(({ status }) => {
        if (active)
          setMessage(
            status === 'VALID'
              ? 'Valid ticket QR. Sign in as the linked motorist to view your ticket.'
              : status === 'EXPIRED'
                ? 'This ticket QR has expired. Ask the issuing officer for a new code.'
                : 'Invalid or revoked ticket QR. Use manual ticket verification.',
          );
      })
      .catch(() => {
        if (active)
          setMessage(
            'Unable to verify this QR. Check your connection or use manual ticket verification.',
          );
      });
    return () => {
      active = false;
    };
  }, [api, token]);
  return (
    <section aria-label="Ticket QR verification">
      <p role="status">{message}</p>
    </section>
  );
}
