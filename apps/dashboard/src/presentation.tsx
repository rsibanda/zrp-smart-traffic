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
        { OPEN: 'Submitted', IN_PROGRESS: 'Under review' } as Record<
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
  return readable(status);
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
