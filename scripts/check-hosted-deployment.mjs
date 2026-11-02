// Creates one clearly labelled fictional ticket; never resets or deletes data.
// Run only against the intended demo deployment with environment-only credentials.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

const origin = process.env.DEPLOYMENT_API_URL;
const password = process.env.ZRP_DEMO_PASSWORD;
if (!origin?.startsWith('https://') || !password)
  throw new Error('Set DEPLOYMENT_API_URL and ZRP_DEMO_PASSWORD');
const tokens = {};
let step = 'health';
async function call(path, { token, body, status = 200, method } = {}) {
  const response = await fetch(`${origin}/api/v1${path}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  assert.equal(response.status, status, `${step}: HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}
try {
  const health = await fetch(`${origin}/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');
  step = 'role authentication';
  for (const [name, role] of Object.entries({
    admin: 'ADMIN',
    officer: 'OFFICER',
    supervisor: 'SUPERVISOR',
    user: 'USER',
  })) {
    const login = await call('/auth/login', {
      body: { email: `${name}@demo.invalid`, password, category: role },
    });
    assert.equal(login.user.role, role);
    tokens[name] = login.token;
    await call('/auth/me', { token: login.token });
  }
  await call('/auth/login', {
    body: { email: 'officer@demo.invalid', password: 'invalid-password' },
    status: 401,
  });
  step = 'role boundaries';
  await call('/admin/users', { token: tokens.admin });
  await call('/audit-events', { token: tokens.admin });
  await call('/admin/users', { token: tokens.officer, status: 403 });
  await call('/vehicles?registration=ABC1234', { status: 401 });
  await call('/vehicles?registration=ABC1234', {
    token: tokens.user,
    status: 403,
  });
  const vehicle = (
    await call('/vehicles?registration=ABC1234', { token: tokens.officer })
  ).items[0];
  assert.ok(vehicle);
  assert.equal(
    (await call('/vehicles?registration=ZZZ9999', { token: tokens.officer }))
      .items.length,
    0,
  );
  const categories = await call('/offence-categories', {
    token: tokens.officer,
  });
  step = 'fictional draft and private evidence';
  const draft = await call('/offences', {
    token: tokens.officer,
    status: 201,
    body: {
      requestKey: randomUUID(),
      vehicleId: vehicle.id,
      categoryId: categories[0].id,
      observedAt: new Date().toISOString(),
      location: 'Fictional deployment check',
      notes:
        'DEMO: synthetic deployment verification; not an actual traffic offence.',
    },
  });
  const jpeg = await sharp({
    create: { width: 16, height: 16, channels: 3, background: '#4b7399' },
  })
    .jpeg()
    .toBuffer();
  const form = new FormData();
  form.append(
    'file',
    new Blob([jpeg], { type: 'image/jpeg' }),
    'synthetic-demo.jpg',
  );
  const upload = await fetch(`${origin}/api/v1/offences/${draft.id}/evidence`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens.officer}` },
    body: form,
  });
  assert.equal(upload.status, 201);
  const evidence = await upload.json();
  const download = await fetch(`${origin}/api/v1/evidence/${evidence.id}`, {
    headers: { Authorization: `Bearer ${tokens.officer}` },
  });
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-type'), /image\/jpeg/);
  assert.ok((await download.arrayBuffer()).byteLength > 0);
  await call(`/evidence/${evidence.id}`, { status: 401 });
  await call(`/evidence/${evidence.id}`, { token: tokens.user, status: 403 });
  step = 'idempotent ticket and supervisor review';
  const ticket = await call(`/offences/${draft.id}/submit`, {
    token: tokens.officer,
    body: {},
    status: 201,
  });
  const retry = await call(`/offences/${draft.id}/submit`, {
    token: tokens.officer,
    body: {},
    status: 201,
  });
  assert.equal(retry.id, ticket.id);
  await call(`/offences/${draft.id}`, { token: tokens.supervisor });
  await call(`/offences/${draft.id}/review`, {
    token: tokens.officer,
    body: { status: 'UNDER_REVIEW', notes: 'Demo check' },
    status: 403,
  });
  for (const status of ['UNDER_REVIEW', 'CONFIRMED']) {
    await call(`/offences/${draft.id}/review`, {
      token: tokens.supervisor,
      body: { status, notes: 'Fictional deployment check' },
      status: 201,
    });
  }
  step = 'motorist ticket verification and payment simulation';
  const access = await call(`/tickets/${ticket.id}/access-code`, {
    token: tokens.officer,
    body: {},
    status: 201,
  });
  const verified = await call('/public/tickets/verify', {
    token: tokens.user,
    body: {
      reference: ticket.publicReference,
      verificationCode: access.verificationCode,
    },
  });
  assert.equal(verified.ticket.reference, ticket.publicReference);
  const paid = await call('/public/tickets/payment-simulation', {
    token: verified.token,
    body: {},
  });
  assert.equal(paid.paymentStatus, 'SIMULATED_PAID');
  step = 'CORS';
  const allowed = 'https://thunderous-moxie-b0872a.netlify.app';
  for (const requestedOrigin of [allowed, 'https://untrusted.example']) {
    const response = await fetch(`${origin}/api/v1/auth/me`, {
      method: 'OPTIONS',
      headers: {
        Origin: requestedOrigin,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization',
      },
    });
    if (requestedOrigin === allowed)
      assert.equal(
        response.headers.get('access-control-allow-origin'),
        allowed,
      );
    else
      assert.notEqual(
        response.headers.get('access-control-allow-origin'),
        requestedOrigin,
      );
  }
  step = 'logout';
  for (const token of Object.values(tokens)) {
    await call('/auth/logout', { token, body: {}, status: 204 });
    await call('/auth/me', { token, status: 401 });
  }
  console.log(
    JSON.stringify({
      passed: true,
      roles: 4,
      offenceId: draft.id,
      evidenceId: evidence.id,
      checks:
        'health, authentication, permissions, vehicle lookup, private evidence, idempotent ticket, review, motorist verification, simulated payment, CORS, logout',
    }),
  );
} catch (error) {
  // Never dump response bodies, tokens, passwords or provider error objects.
  console.error(
    `Hosted verification failed at ${step}: ${error instanceof assert.AssertionError ? error.message : 'request or response error'}`,
  );
  process.exitCode = 1;
}
