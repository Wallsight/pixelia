// Dev tool: screenshots the UI on phone, tablet and desktop sizes for a UI/UX check.
// For each device: the loading menu, play after Start, every HUD message at once (__ui),
// the map and the pause screen. Needs the dev server (hooks come from ?dev).
// Usage: node tools/ui-tour.mjs <outDir> [device ...]   Env: URL
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEVICES = {
  phone: { width: 390, height: 844, dpr: 3, touch: true },
  'phone-land': { width: 844, height: 390, dpr: 3, touch: true },
  'phone-small': { width: 360, height: 640, dpr: 2, touch: true },
  tablet: { width: 820, height: 1180, dpr: 2, touch: true },
  'tablet-land': { width: 1180, height: 820, dpr: 2, touch: true },
  laptop: { width: 1366, height: 768, dpr: 1, touch: false },
  desktop: { width: 1920, height: 1080, dpr: 1, touch: false },
};
const [OUT, ...wanted] = process.argv.slice(2);
const list = wanted.length ? wanted : Object.keys(DEVICES);
const URL = process.env.URL ?? 'http://127.0.0.1:5173/';
const LINUX = process.platform === 'linux';
const CHROME = process.env.CHROME ?? (LINUX ? '/usr/bin/chromium' : 'C:/Program Files/Google/Chrome/Application/chrome.exe');
const GPU = LINUX
  ? ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--ignore-gpu-blocklist']
  : ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'];
const PORT = 9335;
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--remote-debugging-address=127.0.0.1',
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'pixelia-ui-'))}`, '--no-first-run', ...GPU, 'about:blank',
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
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push('[error] ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
});
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; waiting.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Runtime.enable'); await send('Page.enable');

for (const name of list) {
  const d = DEVICES[name];
  const shot = async (step) => {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, `${name}-${step}.png`), Buffer.from(s.result.data, 'base64'));
  };
  const rect = async (sel) => JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.offsetParent)?.getBoundingClientRect() ?? null)`));
  const tap = async (sel) => {
    const r = await rect(sel);
    if (!r) { console.log(name, 'not visible:', sel); return; }
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    if (d.touch) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await sleep(60);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    }
  };
  await send('Emulation.setDeviceMetricsOverride', { width: d.width, height: d.height, deviceScaleFactor: d.dpr, mobile: d.touch });
  await send('Emulation.setTouchEmulationEnabled', { enabled: d.touch, maxTouchPoints: d.touch ? 5 : 0 });
  await send('Emulation.setEmitTouchEventsForMouse', { enabled: false });
  await send('Page.navigate', { url: `${URL}?dev` });
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) { await sleep(500); if (await ev("document.getElementById('start')?.disabled === false")) break; }
  await sleep(1500);
  await shot('1-menu');
  await tap('#start');
  await sleep(2500);
  await shot('2-play');
  await ev('__ui()');
  await sleep(1200);
  await shot('3-hud');
  if (d.touch) await tap('.t-top .t-btn:nth-child(2)'); else await ev('__map()');
  await sleep(1500);
  await shot('4-map');
  if (d.touch) { await tap('.t-top .t-btn:nth-child(2)'); await sleep(500); await tap('.t-top .t-btn:nth-child(5)'); }
  else { await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyM', key: 'm' }); await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyM', key: 'm' }); await sleep(300); await ev("document.exitPointerLock?.(); 0"); }
  await sleep(1200);
  await shot('5-pause');
  console.log(name, 'done; body:', await ev('document.body.className'));
}
console.log(logs.length ? logs.slice(0, 20).join('\n') : 'no console errors');
ws.close(); chrome.kill(); process.exit(0);
