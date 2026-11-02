// Local acceptance demonstration. Retains two synthetic records for UI review.
// Re-running reuses fixed draft/payment request keys rather than duplicating data.
import { config } from 'dotenv';
config({ path: '.env' });
const origin = 'http://127.0.0.1:3000/api/v1';
const sessions = [];
async function api(token, path, body) {
  const response = await fetch(`${origin}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}
async function login(name, category) {
  const result = await api(null, '/auth/login', {
    email: `${name}@demo.invalid`,
    password: process.env.DEMO_PASSWORD,
    category,
  });
  sessions.push(result.token);
  return result.token;
}
try {
  const officer = await login('officer', 'OFFICER');
  const motorist = await login('user', 'USER');
  const supervisor = await login('supervisor', 'SUPERVISOR');
  const vehicle = (await api(officer, '/vehicles?registration=ABC1234'))
    .items[0];
  const categories = await api(officer, '/offence-categories');
  for (const [suffix, categoryCode, paid] of [
    ['01', 'TRF-SPD', false],
    ['02', 'TRF-PAR', true],
  ]) {
    const category = categories.find((c) => c.code === categoryCode);
    if (!category || !vehicle.motoristId)
      throw new Error('Run the local development seed first.');
    const draft = await api(officer, '/offences', {
      requestKey: `f0000000-0000-4000-8000-0000000000${suffix}`,
      vehicleId: vehicle.id,
      categoryId: category.id,
      location: 'Samora Machel Avenue, Harare',
      notes:
        'Synthetic acceptance record for the account and payment workflow.',
      observedAt: '2026-10-02T09:00:00Z',
    });
    const ticket = await api(officer, `/offences/${draft.id}/submit`, {});
    let accountTicket = await api(
      motorist,
      `/motorist/infringements/${ticket.publicReference}`,
    );
    if (paid && accountTicket.paymentStatus !== 'PAID') {
      const payment = await api(motorist, '/motorist/payments', {
        requestKey: 'f0000000-0000-4000-8000-000000000003',
        reference: ticket.publicReference,
        method: 'CARD',
        last4: '4242',
      });
      const result = await api(
        motorist,
        `/motorist/payments/${payment.reference}/outcome`,
        { outcome: 'APPROVE' },
      );
      if (result.status !== 'SUCCESS')
        throw new Error('Acceptance payment failed');
      await api(motorist, `/motorist/payments/${payment.reference}/receipt`);
      accountTicket = await api(
        motorist,
        `/motorist/infringements/${ticket.publicReference}`,
      );
    }
    const staffTicket = await api(supervisor, `/offences/${draft.id}`);
    if (staffTicket.paymentStatus !== accountTicket.paymentStatus)
      throw new Error('Cross-role payment state mismatch');
  }
  const summary = await api(motorist, '/motorist/dashboard');
  if (summary.registeredVehicles < 1 || summary.paidFines < 1)
    throw new Error('Account totals did not update');
  console.log(
    'PASS: officer issue → motorist account → simulated card payment → receipt → assigned supervisor. Two synthetic acceptance records retained.',
  );
} finally {
  for (const token of sessions) await api(token, '/auth/logout', {});
}
