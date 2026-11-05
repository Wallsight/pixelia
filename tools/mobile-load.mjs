// Dev tool: loads the game in headless Chrome as a phone (touch, small viewport,
// mobile UA) and reports the loading status, console errors and a screenshot.
// Usage: node tools/mobile-load.mjs <outDir>   Env: URL, W, H, WAIT (ms), CPU (slowdown factor),
// FLAGS (extra Chrome flags, e.g. --disable-3d-apis to test a phone without WebGL)
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[2];
const URL = process.env.URL ?? 'http://127.0.0.1:5173/';
const LINUX = process.platform === 'linux';
const CHROME = process.env.CHROME ?? (LINUX ? '/usr/bin/chromium' : 'C:/Program Files/Google/Chrome/Application/chrome.exe');
const GPU = LINUX
  ? ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--ignore-gpu-blocklist']
  : ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'];
const PORT = 9334;
const profile = mkdtempSync(join(tmpdir(), 'pixelia-mob-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--remote-debugging-address=127.0.0.1',
  `--user-data-dir=${profile}`, '--no-first-run', ...GPU, ...(process.env.FLAGS ?? '').split(' ').filter(Boolean), 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* not up */ }
}
if (!target) { console.error('chrome did not start'); chrome.kill(); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const waiting = new Map(); const logs = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) logs.push(`[${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description).join(' '));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') logs.push('[log] ' + m.params.entry.text);
});
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; waiting.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;
const W = Number(process.env.W ?? 390), H = Number(process.env.H ?? 844);

await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 3, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
if (process.env.CPU) await send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU) });
await send('Page.navigate', { url: URL });
const t0 = Date.now();
let last = '';
while (Date.now() - t0 < Number(process.env.WAIT ?? 90000)) {
  await sleep(1000);
  const s = await ev("(document.getElementById('status')?.textContent ?? '') + ' | start disabled=' + document.getElementById('start')?.disabled + ' | chunks=' + (window.__loaded?.() ?? '?')");
  if (s !== last) { console.log(((Date.now() - t0) / 1000).toFixed(0) + 's', s); last = s; }
  if (await ev("document.getElementById('start')?.disabled === false")) break;
}
const s = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(OUT, 'mobile-load.png'), Buffer.from(s.result.data, 'base64'));
console.log(logs.length ? logs.join('\n') : 'no console errors');
ws.close(); chrome.kill(); process.exit(0);
