// Requires the local API, dashboard and a headless Chrome on debugging port 9222.
// Checks WCAG rules and records a small local API latency sample. No traffic records created.
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
const axe = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const report = [];
async function audit(view) {
  await command('Runtime.evaluate', { expression: axe });
  const result = await command('Runtime.evaluate', {
    expression:
      "axe.run(document, {runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']}}).then(result => ({violations: result.violations.map(item => ({id: item.id, impact: item.impact, targets: item.nodes.map(node => node.target)})), passes: result.passes.length}))",
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error('Accessibility analysis failed');
  report.push({ view, ...result.result.value });
}
async function click(text) {
  await evaluate(
    `Array.from(document.querySelectorAll('button')).find(button => button.textContent === ${JSON.stringify(text)}).click()`,
  );
}
try {
  await command('Page.enable');
  await command('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await command('Page.navigate', { url: 'http://localhost:5173' });
  await waitFor(
    "!!document.querySelector('section.login')",
    'public/login screen',
  );
  await audit('Three-category login');
  for (const role of ['admin', 'supervisor', 'user', 'officer']) {
    await command('Page.navigate', {
      url:
        role === 'admin'
          ? 'http://localhost:5173/admin'
          : 'http://localhost:5173',
    });
    await waitFor(
      role === 'admin'
        ? "document.querySelector('section.login h2')?.textContent === 'Administrator sign in'"
        : "!!document.querySelector('select[name=category]')",
      'login screen',
    );
    await evaluate(
      `if (document.querySelector('select[name=category]')) document.querySelector('select[name=category]').value = '${role.toUpperCase()}'`,
    );
    await evaluate(
      `{ const inputs = document.querySelector('section.login form'); inputs.elements.email.value = '${role}@demo.invalid'; inputs.elements.password.value = ${JSON.stringify(env.DEMO_PASSWORD)}; inputs.querySelector('button').click(); }`,
    );
    await waitFor(
      `document.querySelector('header').innerText.includes('${role === 'user' ? 'MOTORIST' : role.toUpperCase()}')`,
      'staff dashboard',
    );
    if (role === 'admin')
      await waitFor(
        "document.body.innerText.includes('Latest 50 audit events')",
        'security records',
      );
    else if (role === 'supervisor') {
      await click('Overview');
      await waitFor(
        "document.body.innerText.includes('Assigned officer activity')",
        'analytics',
      );
    }
    await audit(`${role} dashboard`);
    writeFileSync(
      `.tools/polish-${role}-desktop.png`,
      Buffer.from(
        (await command('Page.captureScreenshot', { format: 'png' })).data,
        'base64',
      ),
    );
    for (const width of [768, 390]) {
      await command('Emulation.setDeviceMetricsOverride', {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await audit(`${role} dashboard at ${width}px`);
      if (
        await evaluate(
          'document.documentElement.scrollWidth > window.innerWidth',
        )
      )
        throw new Error(`Horizontal page overflow: ${role} at ${width}px`);
    }
    writeFileSync(
      `.tools/polish-${role}-mobile.png`,
      Buffer.from(
        (await command('Page.captureScreenshot', { format: 'png' })).data,
        'base64',
      ),
    );
    await command('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await click('Sign out');
    await waitFor(
      "!!document.querySelector('section.login') && !document.querySelector('section.login button').disabled",
      'logout',
    );
  }
  await command('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await audit('Three-category login at 390px');
  const overflow = await evaluate(
    'document.documentElement.scrollWidth > window.innerWidth',
  );
  const times = [];
  for (let sample = 0; sample < 10; sample++) {
    const start = performance.now();
    await api('/public/notices');
    times.push(Math.round(performance.now() - start));
  }
  times.sort((a, b) => a - b);
  const performanceReport = {
    endpoint: '/public/notices',
    requests: times.length,
    medianMs: times[5],
    maxMs: times[9],
    mobileHorizontalOverflow: overflow,
  };
  writeFileSync(
    '.tools/accessibility-performance.json',
    JSON.stringify({ report, performance: performanceReport }, null, 2),
  );
  console.log(
    JSON.stringify({ report, performance: performanceReport }, null, 2),
  );
  if (report.some((view) => view.violations.length) || overflow)
    process.exitCode = 1;
} finally {
  socket.close();
}
