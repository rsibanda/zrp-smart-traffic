// Requires the local API, dashboard and a headless Chrome on debugging port 9222.
// Creates one clearly labelled demo record and retains it for review.
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);
let token;
async function api(path, body) {
  const response = await fetch(`http://127.0.0.1:3000/api/v1${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}
const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const target = targets.find((item) => item.type === 'page');
if (!target) throw new Error('No browser page available');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let sequence = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  const entry = pending.get(message.id);
  if (entry) {
    pending.delete(message.id);
    message.error
      ? entry.reject(new Error(message.error.message))
      : entry.resolve(message.result);
  }
});
function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', {
    expression,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error('Browser script failed');
  return result.result.value;
}
async function waitFor(expression, step) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out: ${step}`);
}
try {
  token = (
    await api('/auth/login', {
      email: 'officer@demo.invalid',
      password: env.DEMO_PASSWORD,
    })
  ).token;
  const vehicle = (await api('/vehicles?registration=ABC1234')).items[0];
  const category = (await api('/offence-categories'))[0];
  const offence = await api('/offences', {
    requestKey: randomUUID(),
    vehicleId: vehicle.id,
    categoryId: category.id,
    location: 'Samora Machel Avenue, Harare',
    notes: 'Created by the local dashboard workflow check.',
    observedAt: new Date().toISOString(),
  });
  const ticket = await api(`/offences/${offence.id}/submit`, {});
  await command('Page.enable');
  await command('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await command('Page.navigate', { url: 'http://localhost:5173' });
  await waitFor(
    '!!document.querySelector("input[name=email]")',
    'login screen',
  );
  await evaluate(
    "document.querySelector('select[name=category]').value = 'SUPERVISOR'",
  );
  await evaluate(
    `document.querySelector('input[name=email]').value = 'supervisor@demo.invalid'; document.querySelector('input[name=password]').value = ${JSON.stringify(env.DEMO_PASSWORD)}; document.querySelector('form button').click();`,
  );
  await waitFor(
    "document.body.innerText.includes('Assigned offences') && !!document.querySelector('tbody button')",
    'assigned records',
  );
  await evaluate("document.querySelector('tbody button').click()");
  await waitFor(
    `document.body.innerText.includes(${JSON.stringify(ticket.publicReference)})`,
    'new ticket visible',
  );
  await evaluate(
    "document.querySelector('textarea[name=notes]').value = 'Browser verification: review started'; document.querySelector('section[aria-label=\"Offence detail\"] form button').click()",
  );
  await waitFor(
    "Array.from(document.querySelectorAll('select[name=status] option')).some(option => option.value === 'CONFIRMED')",
    'under review transition',
  );
  await evaluate(
    "document.querySelector('select[name=status]').value = 'CONFIRMED'; document.querySelector('textarea[name=notes]').value = 'Observation confirmed following review.'; document.querySelector('section[aria-label=\"Offence detail\"] form button').click()",
  );
  await waitFor(
    "document.querySelector('section[aria-label=\"Offence detail\"] h2')?.textContent.includes('Confirmed')",
    'confirmed transition',
  );
  const result = await api(`/offences/${offence.id}`);
  if (result.status !== 'CONFIRMED')
    throw new Error('Officer could not see persisted review');
  const screenshot = await command('Page.captureScreenshot', { format: 'png' });
  writeFileSync(
    '.tools/dashboard-verified.png',
    Buffer.from(screenshot.data, 'base64'),
  );
  await evaluate(
    "Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Sign out').click()",
  );
  await waitFor(
    '!!document.querySelector("input[name=email]")',
    'dashboard logout',
  );
  console.log(
    `PASS: API officer submission -> browser supervisor review -> officer reads CONFIRMED. Demo offence ${offence.id}. Screenshot: .tools/dashboard-verified.png`,
  );
} finally {
  if (token) await api('/auth/logout', {}).catch(() => {});
  socket.close();
}
