export const DEFAULT_CURRENCY = 'USD';
export function formatCurrency(
  value: string | number | null | undefined,
  currency = DEFAULT_CURRENCY,
) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat('en-ZW', {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
  })
    .format(amount)
    .replace(/^\$/, 'US$');
}
export function paymentMethodLabel(method?: string | null) {
  return (
    (
      { ECOCASH: 'EcoCash', INNBUCKS: 'InnBucks', CARD: 'Bank Card' } as Record<
        string,
        string
      >
    )[method ?? ''] ?? 'Payment'
  );
}
// Opaque lookup keys remain API-only. Older servers show a neutral label.
export function ticketLabel(ticket: { displayReference?: string }) {
  return ticket.displayReference ?? 'Traffic ticket';
}
export function readable(value: string) {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
export function roleLabel(role: string) {
  return (
    (
      {
        USER: 'MOTORIST',
        OFFICER: 'TRAFFIC OFFICER',
        SUPERVISOR: 'SUPERVISOR',
        ADMIN: 'ADMINISTRATOR',
      } as Record<string, string>
    )[role] ?? readable(role)
  );
}
// Presentation only: API values and transition rules remain authoritative.
export function statusLabel(status: string, kind = 'offence') {
  if (kind === 'incident')
    return (
      (
        { OPEN: 'Submitted', IN_PROGRESS: 'Under Review' } as Record<
          string,
          string
        >
      )[status] ?? readable(status)
    );
  if (kind === 'payment')
    return (
      (
        { NOT_SIMULATED: 'Pending', SIMULATED_PAID: 'Paid' } as Record<
          string,
          string
        >
      )[status] ?? readable(status)
    );
  return status === 'SUCCESS' ? 'Paid' : readable(status);
}
export function StatusBadge({ value, kind }: { value: string; kind?: string }) {
  return (
    <span className="status-badge" data-status={value}>
      {statusLabel(value, kind)}
    </span>
  );
}
export function auditLabel(action: string) {
  return readable(action.replace(/^DEMO_ALERT_/, 'ALERT_'));
}
