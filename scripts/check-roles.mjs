// Requires the local API, dashboard and a headless Chrome on debugging port 9222.
// Creates one clearly labelled demo record and retains it for review.
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => {const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)];}));
let token;
async function api(path, body) {
  const response = await fetch(`http://127.0.0.1:3000/api/v1${path}`, {method: body ? 'POST' : 'GET', headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})}, body: body ? JSON.stringify(body) : undefined});
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}
const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const target = targets.find(item => item.type === 'page');
if (!target) throw new Error('No browser page available');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {socket.addEventListener('open', resolve, {once: true}); socket.addEventListener('error', reject, {once: true});});
let sequence = 0;
const pending = new Map();
socket.addEventListener('message', event => {const message = JSON.parse(event.data); const entry = pending.get(message.id); if (entry) {pending.delete(message.id); message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result);}});
function command(method, params = {}) {return new Promise((resolve, reject) => {const id = ++sequence; pending.set(id, {resolve, reject}); socket.send(JSON.stringify({id, method, params}));});}
async function evaluate(expression) {const result = await command('Runtime.evaluate', {expression, returnByValue: true}); if (result.exceptionDetails) throw new Error('Browser script failed'); return result.result.value;}
async function waitFor(expression, step) {const deadline = Date.now() + 30000; while (Date.now() < deadline) {if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 200));} throw new Error(`Timed out: ${step}`);}
async function click(text) {await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === ${JSON.stringify(text)}).click()`);}
async function login(role) {
  await waitFor('!!document.querySelector("section.login input[name=email]") && !document.querySelector("section.login button").disabled', 'staff sign in');
  await evaluate(`document.querySelector('input[name=email]').value = '${role}@demo.invalid'; document.querySelector('input[name=password]').value = ${JSON.stringify(env.DEMO_PASSWORD)}; document.querySelector('form button').click()`);
}
try {
  await command('Page.enable'); await command('Emulation.setDeviceMetricsOverride', {width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false});
  await command('Page.navigate', {url: 'http://localhost:5173'});
  await login('admin');
  await waitFor("document.body.innerText.includes('Latest 50 audit events')", 'admin security and accounts');
  const email = `browser-${randomUUID()}@demo.invalid`;
  await evaluate(`const form = document.querySelector('input[name=name]').form; form.elements.name.value = 'Fictional browser test officer'; form.elements.email.value = ${JSON.stringify(email)}; form.elements.password.value = ${JSON.stringify(env.DEMO_PASSWORD)}; form.elements.supervisorId.value = Array.from(form.elements.supervisorId.options).find(option => option.textContent === 'Fictional supervisor').value; form.querySelector('button').click();`);
  await waitFor(`document.body.innerText.includes(${JSON.stringify(email)})`, 'created demo account');
  await evaluate(`Array.from(document.querySelectorAll('tr')).find(row => row.textContent.includes(${JSON.stringify(email)})).querySelector('button').click()`);
  await waitFor("!!document.querySelector('input[name=active]')", 'account edit');
  await evaluate("const field = document.querySelector('input[name=active]'); field.click(); field.form.querySelector('button').click()");
  await waitFor(`Array.from(document.querySelectorAll('tr')).some(row => row.textContent.includes(${JSON.stringify(email)}) && row.textContent.includes('Disabled'))`, 'account disabled');
  await click('Sign out'); await login('supervisor');
  await waitFor("document.querySelector('header').innerText.includes('SUPERVISOR')", 'supervisor dashboard');
  await click('Overview'); await waitFor("document.body.innerText.includes('Assigned officer activity')", 'analytics');
  await click('Checkpoints'); await waitFor("document.body.innerText.includes('Demo training checkpoint')", 'stored checkpoints');
  await click('Show OpenStreetMap'); await waitFor("!!document.querySelector('.leaflet-control-attribution') && !!document.querySelector('.leaflet-interactive')", 'map attribution and stored coordinate marker');
  writeFileSync('.tools/operations-verified.png', Buffer.from((await command('Page.captureScreenshot', {format: 'png'})).data, 'base64'));
  await click('Sign out');
  token = (await api('/auth/login', {email: 'officer@demo.invalid', password: env.DEMO_PASSWORD})).token;
  const vehicle = (await api('/vehicles?registration=DEMO001')).items[0]; const category = (await api('/offence-categories'))[0];
  const offence = await api('/offences', {requestKey: randomUUID(), vehicleId: vehicle.id, categoryId: category.id, location: 'Fictional public portal browser test', notes: 'Demo ticket for browser payment simulation', observedAt: new Date().toISOString()});
  const ticket = await api(`/offences/${offence.id}/submit`, {}); const access = await api(`/tickets/${ticket.id}/access-code`, {});
  await waitFor("!!document.querySelector('input[name=reference]')", 'public portal');
  await evaluate(`const ticketForm = document.querySelector('input[name=reference]').form; ticketForm.elements.reference.value = ${JSON.stringify(ticket.publicReference)}; ticketForm.elements.code.value = ${JSON.stringify(access.verificationCode)}; ticketForm.querySelector('button').click()`);
  await waitFor("document.body.innerText.includes('Verified demo ticket')", 'two-factor ticket verification');
  await click('Simulate payment'); await waitFor("document.body.innerText.includes('SIMULATED_PAID')", 'payment simulation receipt');
  writeFileSync('.tools/public-verified.png', Buffer.from((await command('Page.captureScreenshot', {format: 'png'})).data, 'base64'));
  await click('Close ticket access'); await waitFor("!!document.querySelector('input[name=reference]')", 'public session closure');
  console.log('PASS: browser account creation/disable, supervisor analytics/map attribution, public ticket verification/payment simulation/logout. Labelled demo records retained.');
} finally {if (token) await api('/auth/logout', {}).catch(() => {}); socket.close();}
