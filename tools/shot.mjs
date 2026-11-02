// Dev tool: opens the dev server in headless Chrome (isolated temp profile),
// waits until the world is ready and saves screenshots + console errors.
// Usage: node tools/shot.mjs <outDir> "<query1>" ["<query2>" ...]
//   query example: "tp=120,-40&yaw=45&pitch=-15"
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [outDir, ...queries] = process.argv.slice(2);
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const profile = mkdtempSync(join(tmpdir(), 'pixelia-chrome-'));

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--remote-debugging-address=127.0.0.1',
  `--user-data-dir=${profile}`, '--window-size=1280,720', '--no-first-run', '--no-default-browser-check',
  '--enable-gpu', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist', '--use-angle=d3d11', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((t) => t.type === 'page');
  } catch { /* not up yet */ }
}
if (!target) { console.error('chrome did not start'); chrome.kill(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const waiting = new Map();
const logs = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
  if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
    logs.push(`[${msg.params.type}] ` + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  }
  if (msg.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text));
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') logs.push('[log] ' + msg.params.entry.text);
});
const send = (method, params = {}) => new Promise((resolve) => {
  const mid = ++id;
  waiting.set(mid, resolve);
  ws.send(JSON.stringify({ id: mid, method, params }));
});

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');

let n = 0;
for (const q of queries) {
  n++;
  await send('Page.navigate', { url: `http://127.0.0.1:5173/?shot&${q}` });
  let ready = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    await sleep(500);
    const r = await send('Runtime.evaluate', { expression: 'document.title' });
    if (r.result?.result?.value === 'READY') { ready = true; break; }
  }
  await sleep(Number(process.env.SETTLE ?? 4000)); // let remaining chunks stream in
  // HOLD="KeyW+ShiftLeft:4000" holds keys (needs &walk in the query), then reports the position.
  if (process.env.HOLD) {
    const [keys, ms] = process.env.HOLD.split(':');
    const xyz = "document.getElementById('debug').textContent.split('\\n')[1]";
    console.log('before:', (await send('Runtime.evaluate', { expression: xyz })).result?.result?.value);
    for (const code of keys.split('+')) await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code });
    await sleep(Number(ms));
    for (const code of keys.split('+')) await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code });
    await sleep(600);
    console.log('after: ', (await send('Runtime.evaluate', { expression: xyz })).result?.result?.value);
  }
  if (process.env.EVAL) {
    const r = await send('Runtime.evaluate', { expression: process.env.EVAL, returnByValue: true, awaitPromise: true });
    console.log('eval:', JSON.stringify(r.result?.result?.value ?? r.result));
  }
  const stats = await send('Runtime.evaluate', { expression: "document.getElementById('debug').textContent" });
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const file = join(outDir, `shot${n}.png`);
  writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
  console.log(`${file} ready=${ready} (${((Date.now() - t0) / 1000).toFixed(1)}s)\n${stats.result?.result?.value ?? ''}`);
}
if (logs.length) console.log('console:\n' + logs.slice(0, 30).join('\n'));
ws.close();
chrome.kill();
await sleep(500);
try { rmSync(profile, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
