// Бот-тестировщик (4.2.2): прогон игры перед релизом.
//
// Запуск (из корня проекта, нужен только Node 22+ и установленный Chrome или Edge):
//     node tools/soak.mjs                  — 3 минуты на «Норме», процессор замедлен ×4
//     node tools/soak.mjs --seconds 600 --cpu 6 --diff hard
//
// Сам поднимает локальный сервер, открывает скрытый браузер размером с телефон, запускает забег
// и ведёт бессмертного бота: выбирает улучшения и узлы карты наугад, пропускает сцены. Раз в секунду
// снимает FPS, память и число объектов, ловит ошибки. В конце — сводка; код выхода 1, если были ошибки.
// Браузер можно указать явно: CHROME_PATH="C:\...\chrome.exe" node tools/soak.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((a) => a.trim().split(/\s+/)));
const SECONDS = +(args.seconds || 180);
const CPU = +(args.cpu || 4);
const DIFF = args.diff || 'normal';
const W = +(args.width || 390), H = +(args.height || 780);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── статический сервер без кэша ──
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
function serve() {
  const srv = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = normalize(join(ROOT, path === '/' ? 'index.html' : path));
    if (!file.startsWith(ROOT + sep) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(readFileSync(file));
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

// ── браузер ──
function findBrowser() {
  const env = process.env.CHROME_PATH;
  const pf = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
  const list = [env,
    ...pf.map((p) => join(p, 'Google', 'Chrome', 'Application', 'chrome.exe')),
    ...pf.map((p) => join(p, 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
  return list.find((p) => p && existsSync(p));
}

async function launch(exe) {
  const profile = mkdtempSync(join(tmpdir(), 'ss-soak-'));
  const proc = spawn(exe, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank'], { stdio: 'ignore' });
  // порт браузер пишет в DevToolsActivePort внутри профиля
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 150 && !existsSync(portFile); i++) await sleep(100);
  if (!existsSync(portFile)) throw new Error('браузер не запустился: ' + exe);
  await sleep(200);
  const port = readFileSync(portFile, 'utf8').split('\n')[0].trim();
  return { proc, profile, port };
}

// ── крошечный клиент DevTools-протокола ──
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const wait = new Map(), on = {};
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && wait.has(msg.id)) { const [res, rej] = wait.get(msg.id); wait.delete(msg.id); msg.error ? rej(new Error(msg.error.message)) : res(msg.result); }
    else if (msg.method && on[msg.method]) on[msg.method](msg.params);
  };
  const ready = new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const send = (method, params = {}) => new Promise((res, rej) => { wait.set(++id, [res, rej]); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  return { ready, send, evaluate, on, close: () => ws.close() };
}

// ── что выполняется в странице ──
const BOT = `(() => {
  const log = window._soak = { samples: [], errors: [], start: performance.now() };
  addEventListener('error', (e) => log.errors.push(e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno));
  addEventListener('unhandledrejection', (e) => log.errors.push('promise: ' + (e.reason && e.reason.stack || e.reason)));
  let last = performance.now(), frames = 0, worst = 0, long = 0;
  const raf = (now) => { const dt = now - last; last = now; frames++; worst = Math.max(worst, dt); if (dt > 50) long++; requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  const g = SS.game, ui = SS.ui;
  let sweep = 0;
  setInterval(() => {
    try {
      if (g.state === 'idle' || g.state === 'over') return;
      if (g.player) g.player.inv = Math.max(g.player.inv, 5);
      if ((g.scene || g.state === 'cutscene') && g.skipScene) g.skipScene();
      if (g.state === 'tip') { g.closeTip(); return; }
      if (g.state === 'perk') {
        if (g.offerKind === 'map') {
          const run = g.run, step = (run.mapStep - 1) % 5, ch = SS.map.choices(run.map, step);
          ui.hide('#scr-map');
          SS.map.choose(step, ch[Math.floor(Math.random() * ch.length)]);
          return;
        }
        const cards = [...document.querySelectorAll('#perkCards .perk-card')].filter((c) => c.offsetParent && !c.classList.contains('wait') && !c.classList.contains('poor'));
        if (cards.length) cards[Math.floor(Math.random() * cards.length)].click();
        else { const skip = [...document.querySelectorAll('#scr-perk button')].find((b) => b.offsetParent && !b.classList.contains('perk-card') && /мимо|пропуст|дальше|отказ/i.test(b.textContent)); if (skip) skip.click(); }
      }
      if (g.state === 'play' && g.player && g.player.alive) { sweep += 0.05; g.player.x = SS.gfx.FW / 2 + Math.sin(sweep) * SS.gfx.FW * 0.35; if (g.clampPlayer) g.clampPlayer(); }
    } catch (e) { log.errors.push('бот: ' + e.message); }
  }, 100);
  setInterval(() => {
    const r = g.run || {}, F = SS.fx;
    log.samples.push({ t: Math.round((performance.now() - log.start) / 1000), fps: frames, worst: Math.round(worst), long,
      heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 0, st: g.state, wave: g.wave ? g.wave.n : 0,
      en: g.enemies.length, eb: g.ebullets.length, parts: F.parts.length, coins: r.coins || 0, q: SS.main.quality });
    frames = 0; worst = 0; long = 0;
  }, 1000);
  return true;
})()`;

const START = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 100 && !(window.SS && SS.ui && SS.ui.cur === 'menu'); i++) await sleep(100);
  if (!(window.SS && SS.ui && SS.ui.cur === 'menu')) throw new Error('меню не открылось за 10 с');
  SS.store.s.settings.intro = false;
  SS.ui.hide('#scr-login'); SS.ui.hide('#scr-dialog');
  document.querySelector('#btnPlay').click(); await sleep(600);
  const diff = document.querySelector('.diff-row[data-diff="${DIFF}"]');
  if (diff && !diff.classList.contains('locked')) diff.click();
  const mode = [...document.querySelectorAll('.mode-btn')].find((b) => /ОБЫЧН/.test(b.textContent));
  if (mode) mode.click();
  await sleep(200);
  document.querySelector('#btnDiffGo').click();
  return SS.VERSION;
})()`;

const SUMMARY = `(() => {
  const L = window._soak, s = L.samples.slice(5), play = s.filter((x) => x.st === 'play');
  const pct = (a, p) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length * p)] || 0; };
  const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  return { secs: L.samples.length, playSecs: play.length, wave: s.length ? s[s.length - 1].wave : 0, coins: s.length ? s[s.length - 1].coins : 0,
    fpsAvg: Math.round(avg(play.map((x) => x.fps))), fpsLow1: pct(play.map((x) => x.fps), 0.01), worst: Math.max(0, ...play.map((x) => x.worst)),
    long: play.reduce((a, x) => a + x.long, 0), heapMin: Math.min(...s.map((x) => x.heap)), heapMax: Math.max(...s.map((x) => x.heap)),
    heapEnd: s.length ? s[s.length - 1].heap : 0, maxEnemies: Math.max(0, ...s.map((x) => x.en)), maxBullets: Math.max(0, ...s.map((x) => x.eb)),
    maxParts: Math.max(0, ...s.map((x) => x.parts)), quality: [...new Set(s.map((x) => x.q))], errors: L.errors.slice(0, 20) };
})()`;

async function main() {
  const exe = findBrowser();
  if (!exe) { console.error('Не нашёл Chrome или Edge. Укажите путь: CHROME_PATH="...chrome.exe" node tools/soak.mjs'); process.exit(2); }
  const srv = await serve();
  const url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  const br = await launch(exe);
  let page;
  const pageErrors = [];
  try {
    const t = await (await fetch('http://127.0.0.1:' + br.port + '/json/new?about:blank', { method: 'PUT' })).json();
    page = cdp(t.webSocketDebuggerUrl);
    await page.ready;
    page.on['Runtime.exceptionThrown'] = (p) => pageErrors.push(p.exceptionDetails.exception?.description?.split('\n')[0] || p.exceptionDetails.text);
    await page.send('Runtime.enable');
    await page.send('Network.enable');
    await page.send('Network.setBlockedURLs', { urls: ['*sw.js*'] });   // service worker отдавал бы старые файлы
    await page.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await page.send('Emulation.setCPUThrottlingRate', { rate: CPU });
    await page.send('Page.enable');
    await page.send('Page.navigate', { url });
    const ver = await page.evaluate(START);
    await page.evaluate(BOT);
    console.log(`Space Shooter ${ver}: ${SECONDS} с, «${DIFF}», процессор ×${CPU}, экран ${W}×${H}, ${exe.split(/[\\/]/).pop()}`);
    for (let left = SECONDS; left > 0; left -= 10) {
      await sleep(Math.min(10, left) * 1000);
      const s = await page.evaluate('(() => { const a = window._soak.samples; const x = a[a.length - 1] || {}; return x; })()');
      console.log(`  ${String(s.t).padStart(4)} с  волна ${String(s.wave).padStart(2)}  FPS ${String(s.fps).padStart(2)}  память ${s.heap} МБ  враги ${s.en}  пули ${s.eb}  монеты ${s.coins}`);
    }
    const r = await page.evaluate(SUMMARY);
    const errors = [...new Set([...r.errors, ...pageErrors])];
    console.log('\nИТОГ');
    console.log(`  волна ${r.wave}, монеты за забег ${r.coins}, в бою ${r.playSecs} из ${r.secs} с`);
    console.log(`  FPS в бою: средний ${r.fpsAvg}, худший 1% секунд ${r.fpsLow1}; кадров дольше 50 мс: ${r.long}, самый долгий ${r.worst} мс`);
    console.log(`  память: ${r.heapMin}–${r.heapMax} МБ, в конце ${r.heapEnd} МБ; качество графики ${r.quality.join(', ')}`);
    console.log(`  максимум: врагов ${r.maxEnemies}, вражеских пуль ${r.maxBullets}, частиц ${r.maxParts}`);
    if (r.fpsAvg && r.fpsAvg < 50) console.log('  ⚠ средний FPS ниже 50 — на слабых телефонах будет дёргаться');
    if (errors.length) { console.log(`  ✗ ошибок: ${errors.length}`); for (const e of errors) console.log('    ' + e); process.exitCode = 1; }
    else console.log('  ✓ ошибок нет');
  } finally {
    try { if (page) page.close(); } catch (e) { /* уже закрыт */ }
    br.proc.kill();
    srv.close();
    await sleep(500);
    try { rmSync(br.profile, { recursive: true, force: true }); } catch (e) { /* браузер ещё держит файлы */ }
  }
}

main().catch((e) => { console.error('Не получилось:', e.message); process.exit(2); });
