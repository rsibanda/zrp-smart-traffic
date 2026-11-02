// Environment-only credentials. Reads role screens' APIs and revokes test sessions.
// No records are created, reset or deleted.
import assert from 'node:assert/strict';

const apiOrigin = process.env.DEPLOYMENT_API_URL;
const webOrigin = process.env.DEPLOYMENT_WEB_URL;
const password = process.env.ZRP_DEMO_PASSWORD;
if (
  !apiOrigin?.startsWith('https://') ||
  !webOrigin?.startsWith('https://') ||
  !password
)
  throw new Error(
    'Set DEPLOYMENT_API_URL, DEPLOYMENT_WEB_URL and ZRP_DEMO_PASSWORD',
  );
const sessions = new Set();
let step = 'health';
async function request(path, { token, body, status = 200 } = {}) {
  const response = await fetch(`${apiOrigin}/api/v1${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Origin: webOrigin,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  assert.equal(response.status, status, `${step}: unexpected HTTP status`);
  assert.equal(response.headers.get('access-control-allow-origin'), webOrigin);
  return response.status === 204 ? null : response.json();
}
try {
  const health = await fetch(`${apiOrigin}/health`, {
    signal: AbortSignal.timeout(90000),
  });
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');
  step = 'published frontend';
  for (const path of ['/', '/admin']) {
    const response = await fetch(webOrigin + path);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('id="root"'));
    const assetPath = html.match(/src="([^"]+\.js)"/)?.[1];
    assert.ok(assetPath);
    const script = await fetch(new URL(assetPath, webOrigin));
    assert.equal(script.status, 200);
    assert.ok((await script.text()).includes(apiOrigin));
  }
  for (const [name, role, path] of [
    ['admin', 'ADMIN', '/admin/users'],
    ['officer', 'OFFICER', '/offences'],
    ['supervisor', 'SUPERVISOR', '/analytics/overview'],
    ['user', 'USER', '/motorist/dashboard'],
  ]) {
    step = `${role} login`;
    const login = await request('/auth/login', {
      body: { email: `${name}@demo.invalid`, password, category: role },
    });
    assert.equal(login.user.role, role);
    assert.ok(login.token);
    sessions.add(login.token);
    step = `${role} authenticated profile and dashboard API`;
    const me = await request('/auth/me', { token: login.token });
    assert.equal(me.role, role);
    const dashboard = await request(path, { token: login.token });
    if (role === 'SUPERVISOR') {
      await request('/supervisor/summary', { token: login.token });
      await request('/supervisor/payments', { token: login.token });
      await request('/supervisor/vehicle-link-requests', {
        token: login.token,
      });
    } else {
      await request('/supervisor/summary', { token: login.token, status: 403 });
    }
    if (role === 'ADMIN') {
      await request('/admin/vehicle-link-requests', { token: login.token });
    }
    if (role === 'USER') {
      step = 'motorist references, currency and account totals';
      const options = { token: login.token };
      const vehicles = await request('/motorist/vehicles', options);
      await request('/motorist/vehicles/requests', options);
      await request('/admin/vehicle-link-requests', {
        ...options,
        status: 403,
      });
      const tickets = await request('/motorist/infringements', options);
      assert.equal(dashboard.currency, 'USD');
      assert.equal(dashboard.registeredVehicles, vehicles.total);
      assert.ok(
        tickets.items.every((ticket) =>
          /^INF-\d{4}-\d{6,}$/.test(ticket.displayReference),
        ),
      );
      if (tickets.items.length === tickets.total) {
        assert.equal(
          dashboard.demeritPoints,
          tickets.items.reduce((sum, ticket) => sum + ticket.demeritPoints, 0),
        );
        assert.equal(
          dashboard.paidFines,
          tickets.items.filter((ticket) => ticket.paymentStatus === 'PAID')
            .length,
        );
      }
      console.log(
        'Motorist readable references, USD currency, vehicle count and ticket totals passed',
      );
    }
    if (role !== 'ADMIN')
      await request('/admin/users', { token: login.token, status: 403 });
    if (role === 'USER')
      await request('/vehicles?registration=ABC1234', {
        token: login.token,
        status: 403,
      });
    step = `${role} logout`;
    await request('/auth/logout', {
      token: login.token,
      body: {},
      status: 204,
    });
    sessions.delete(login.token);
    await request('/auth/me', { token: login.token, status: 401 });
    console.log(
      `${role}: login, profile, dashboard API, permissions and logout passed`,
    );
  }
  step = 'invalid credentials';
  await request('/auth/login', {
    body: { email: 'officer@demo.invalid', password: 'invalid-password' },
    status: 401,
  });
  console.log(
    'Hosted login checks passed. CORS and published frontend checked; browser interaction was not exercised.',
  );
} catch {
  // Never dump provider errors, tokens, credentials or response bodies.
  console.error(`Hosted login check failed at: ${step}`);
  process.exitCode = 1;
} finally {
  for (const token of sessions) {
    await request('/auth/logout', { token, body: {}, status: 204 }).catch(
      () => undefined,
    );
  }
}
