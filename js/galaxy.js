// ════════════════════════════════════════════════════════════════
// SPACE SHOOTER 4.1 — карта галактики (окно выбора узла перед волной)
//  Холст вместо кнопок: туманность сектора, узлы — объекты в космосе
//  (враги, торговец, медкорабль, тайник, аномалия), гиперкоридоры с бегущим
//  светом, корабль игрока на карте. Тап по узлу — описание и подсветка всех
//  узлов, куда можно попасть дальше этим путём; «ЛЕТИМ» — корабль летит по
//  коридору, потом начинается волна. Иногда мимо дрейфует потерянный груз —
//  тап по нему даёт немного монет.
//  Генерация и правила карты — map.js
// ════════════════════════════════════════════════════════════════
'use strict';

(function () {
  const U = SS.util, D = SS.data, $ = U.$;
  let G, A, T, M, game, ui;

  const GX = {};
  SS.galaxy = GX;

  let cv, ctx, W = 360, H = 520, dpr = 1, raf = 0, last = 0;
  const st = { d: null, t: 0, nodes: [], boss: null, entry: null, sel: null, reach: null, fly: null, bg: null, stars: [], trail: [], pod: null, comet: null, cometT: 3 };
  // враги, которые «стоят» на узлах боя
  const FIGHT = ['e_interceptor2', 'e_assault2', 'e_swarm', 'e_crab', 'e_bombardier', 'e_ram'];
  const key = (c, r) => c + ':' + r;

  GX.init = function () {
    G = SS.gfx; A = SS.audio; T = SS.tg; M = SS.meta; game = SS.game; ui = SS.ui;
    cv = $('#mapCv'); ctx = cv.getContext('2d');
    cv.addEventListener('pointerdown', onTap);
    window.addEventListener('resize', () => { if (ui.isShown('#scr-map') && st.d) { resize(); layout(); } });
  };

  // ── открыть карту ──
  GX.show = function (d) {
    st.d = d; st.t = 0; st.sel = null; st.reach = null; st.fly = null; st.trail = [];
    st.pod = Math.random() < 0.4 ? { t: 0, side: Math.random() < 0.5 ? -1 : 1, y: U.rand(0.35, 0.7), got: false } : null;
    const map = d.map, sec = game.sectorDef(map.sector);
    if (!map.seed) map.seed = (Math.random() * 1e9) | 0;
    $('#mapTitle').textContent = 'СЕКТОР ' + (map.sector + 1);
    $('#mapSub').textContent = sec.name + ' · волна ' + d.n;
    $('#mapSteps').innerHTML = [0, 1, 2, 3].map((c) => '<i class="' + (c < d.step ? 'done' : c === d.step ? 'cur' : '') + '"></i>').join('') + '<b class="boss">' + U.icon('crown') + '</b>';
    ui.show('#scr-map');
    resize();
    st.bg = makeBg(sec, map.seed);
    layout();
    info(null);
    $('#btnMapGo').disabled = true;
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
  };

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = cv.getBoundingClientRect();
    W = Math.max(240, r.width); H = Math.max(300, r.height);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }

  // ── раскладка: 4 шага снизу вверх, босс наверху; узлы чуть сдвинуты, чтобы не было сетки ──
  function layout() {
    const d = st.d, map = d.map, rnd = U.seeded(map.seed);
    const padX = Math.min(W * 0.2, 80), yOf = (c) => H * (0.8 - c * 0.165);
    st.nodes = [];
    map.cols.forEach((col, c) => col.forEach((n, r) => {
      if (!n) { rnd(); rnd(); return; }
      const x = U.lerp(padX, W - padX, r / 2) + (rnd() - 0.5) * W * 0.1, y = yOf(c) + (rnd() - 0.5) * H * 0.045;
      st.nodes.push({ c, r, t: n.t, x, y, ph: rnd() * U.TAU, spr: FIGHT[(map.seed + c * 5 + r * 2) % FIGHT.length], def: D.MAP_NODES[n.t] });
    }));
    const bd = game.bossDef(map.sector + 1);
    st.boss = { x: W / 2, y: H * 0.115, def: bd, boss: true };
    st.entry = { x: W / 2, y: H * 0.95 };
    const path = new Set(map.path);
    for (const n of st.nodes) {
      const k = key(n.c, n.r);
      n.done = path.has(k);
      n.cur = !!(map.at && map.at.c === n.c && map.at.r === n.r);
      n.can = n.c === d.step && d.choices.includes(n.r);
    }
    // что вообще ещё достижимо отсюда (остальное гаснет)
    st.open = reachFrom(d.choices.map((r) => key(d.step, r)));
    st.ship = st.nodes.find((n) => n.cur) || st.entry;
  }
  const nodeAt = (c, r) => st.nodes.find((n) => n.c === c && n.r === r);
  // все узлы, куда можно попасть из набора узлов (включая их самих)
  function reachFrom(keys) {
    const map = st.d.map, out = new Set(keys), q = keys.slice();
    while (q.length) {
      const k = q.shift(), [c, r] = k.split(':').map(Number);
      for (const nr of map.links[k] || []) { const nk = key(c + 1, nr); if (!out.has(nk)) { out.add(nk); q.push(nk); } }
    }
    return out;
  }

  // ── фон: небо сектора, туманности, пыль, далёкая спиральная галактика ──
  function makeBg(sec, seed) {
    const c = document.createElement('canvas');
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    const x = c.getContext('2d'), rnd = U.seeded(seed + 7);
    x.scale(dpr, dpr);
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sec.sky[1]); g.addColorStop(0.6, sec.sky[0]); g.addColorStop(1, '#010208');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      const col = sec.neb[i % sec.neb.length], r = U.lerp(90, 230, rnd());
      x.globalAlpha = 0.1 + rnd() * 0.14;
      x.drawImage(G.soft(col, 128), rnd() * W - r, rnd() * H - r, r * 2, r * 2 * (0.6 + rnd() * 0.5));
    }
    // спиральная галактика в углу
    const gx = W * (rnd() < 0.5 ? 0.18 : 0.82), gy = H * U.lerp(0.25, 0.6, rnd()), arms = 2;
    x.globalAlpha = 0.5;
    x.drawImage(G.soft(sec.neb[1], 64), gx - 26, gy - 18, 52, 36);
    for (let i = 0; i < 420; i++) {
      const arm = i % arms, k = rnd(), a = arm * Math.PI + k * 5.2, rr = 4 + k * 46;
      const px = gx + Math.cos(a) * rr + (rnd() - 0.5) * 7, py = gy + Math.sin(a) * rr * 0.45 + (rnd() - 0.5) * 4;
      x.globalAlpha = (1 - k) * 0.55; x.fillStyle = rnd() < 0.3 ? '#fff' : sec.neb[(i >> 1) % sec.neb.length];
      x.fillRect(px, py, 1.2, 1.2);
    }
    // пыль и звёзды
    x.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 260; i++) { x.globalAlpha = 0.15 + rnd() * 0.55; x.fillStyle = rnd() < 0.15 ? sec.star : '#fff'; const s = rnd() < 0.06 ? 2 : 1; x.fillRect(rnd() * W, rnd() * H, s, s); }
    x.globalAlpha = 1;
    // мерцающие звёзды поверх
    st.stars = [];
    for (let i = 0; i < 26; i++) st.stars.push({ x: rnd() * W, y: rnd() * H, p: rnd() * U.TAU, s: 1 + rnd() * 1.6, col: rnd() < 0.4 ? sec.star : '#fff' });
    return c;
  }

  // ── кадр ──
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!ui.isShown('#scr-map') || !st.d) { cancelAnimationFrame(raf); raf = 0; return; }
    st.t += dt;
    update(dt);
    draw();
  }

  function update(dt) {
    // полёт по коридору
    const f = st.fly;
    if (f) {
      f.t += dt;
      const k = Math.min(1, f.t / f.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const p = bez(f.a, f.b, e), p2 = bez(f.a, f.b, Math.min(1, e + 0.02));
      f.x = p.x; f.y = p.y; f.ang = Math.atan2(p2.y - p.y, p2.x - p.x) + Math.PI / 2;
      for (let i = 0; i < 2; i++) st.trail.push({ x: p.x + U.rand(-2, 2), y: p.y + U.rand(-2, 2), t: 0, life: 0.5 });
      if (k >= 1 && !f.ended) { f.ended = true; setTimeout(f.done, 120); }
    }
    for (const p of st.trail) p.t += dt;
    st.trail = st.trail.filter((p) => p.t < p.life);
    // комета
    st.cometT -= dt;
    if (!st.comet && st.cometT <= 0) { const l = Math.random() < 0.5; st.comet = { x: l ? -20 : W + 20, y: U.rand(0.05, 0.5) * H, vx: (l ? 1 : -1) * U.rand(160, 240), vy: U.rand(30, 70), t: 0 }; st.cometT = U.rand(5, 9); }
    if (st.comet) { const c = st.comet; c.t += dt; c.x += c.vx * dt; c.y += c.vy * dt; if (c.x < -40 || c.x > W + 40 || c.y > H + 40) st.comet = null; }
    // потерянный груз
    if (st.pod && !st.pod.got) { st.pod.t += dt; if (st.pod.t > 16) st.pod = null; }
  }

  // кривая коридора: вертикальные касательные — плавная «лиана» между узлами
  function bez(a, b, t) {
    const dy = (b.y - a.y) * 0.5, u = 1 - t;
    const x = u * u * u * a.x + 3 * u * u * t * a.x + 3 * u * t * t * b.x + t * t * t * b.x;
    const y = u * u * u * a.y + 3 * u * u * t * (a.y + dy) + 3 * u * t * t * (b.y - dy) + t * t * t * b.y;
    return { x, y };
  }
  function lane(a, b) {
    const dy = (b.y - a.y) * 0.5;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.bezierCurveTo(a.x, a.y + dy, b.x, b.y - dy, b.x, b.y);
  }

  function draw() {
    const c = ctx, t = st.t, d = st.d, map = d.map;
    c.setTransform(1, 0, 0, 1, 0, 0);
    // фон чуть «дышит»
    const ox = Math.sin(t * 0.07) * 4 * dpr, oy = Math.cos(t * 0.05) * 3 * dpr;
    c.drawImage(st.bg, ox - 6 * dpr, oy - 6 * dpr, cv.width + 12 * dpr, cv.height + 12 * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const s of st.stars) { c.globalAlpha = 0.35 + 0.65 * Math.max(0, Math.sin(t * 1.7 + s.p)); c.fillStyle = s.col; c.fillRect(s.x - s.s / 2, s.y - s.s / 2, s.s, s.s); }
    c.globalAlpha = 1;
    if (st.comet) drawComet(c, st.comet);
    const intro = (k) => U.clamp((t - k) / 0.35, 0, 1);
    // ── коридоры ──
    const sel = st.sel, selKey = sel && !sel.boss ? key(sel.c, sel.r) : null;
    const on = (n) => (st.reach ? st.reach.has(key(n.c, n.r)) : st.open.has(key(n.c, n.r)));
    c.lineCap = 'round';
    for (const k in map.links) {
      const [ac, ar] = k.split(':').map(Number), a = nodeAt(ac, ar);
      if (!a) continue;
      for (const br of map.links[k]) {
        const b = nodeAt(ac + 1, br);
        if (b) drawLane(a, b, a.done && b.done ? 'walk' : (on(a) && on(b) && ac >= d.step) ? (st.reach ? 'prev' : 'open') : 'dim', intro(0.1 + ac * 0.08));
      }
    }
    for (const n of st.nodes) if (n.c === 3) drawLane(n, st.boss, (st.reach ? st.reach.has(key(n.c, n.r)) : st.open.has(key(n.c, n.r))) ? (st.reach ? 'prev' : 'open') : 'dim', intro(0.4));
    // от корабля к доступным узлам — бегущий свет
    for (const n of st.nodes) if (n.can) drawLane(st.ship, n, selKey === key(n.c, n.r) ? 'sel' : 'can', intro(0.05));
    if (!map.at) for (const n of st.nodes) if (n.c === 0 && !n.can) drawLane(st.entry, n, 'dim', intro(0.05));
    // ── узлы ──
    for (const n of st.nodes) drawNode(c, n, intro(0.12 + n.c * 0.08), on(n));
    drawBoss(c, st.boss, intro(0.45));
    // ── потерянный груз ──
    if (st.pod) drawPod(c, st.pod);
    // ── корабль и шлейф ──
    c.globalCompositeOperation = 'lighter';
    for (const p of st.trail) { const k = 1 - p.t / p.life; c.globalAlpha = k * 0.8; c.drawImage(G.glow('#7fe7ff', 32), p.x - 7 * k, p.y - 7 * k, 14 * k, 14 * k); }
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    drawShip(c);
  }

  function drawLane(a, b, kind, k) {
    if (k <= 0) return;
    const c = ctx, t = st.t;
    c.save();
    c.globalAlpha = k;
    if (kind === 'walk') { c.strokeStyle = 'rgba(61,224,255,.85)'; c.lineWidth = 3; c.shadowColor = '#3de0ff'; c.shadowBlur = 8; lane(a, b); c.stroke(); }
    else if (kind === 'can' || kind === 'sel') {
      c.strokeStyle = kind === 'sel' ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.14)'; c.lineWidth = kind === 'sel' ? 6 : 4; lane(a, b); c.stroke();
      c.setLineDash([2, 12]); c.lineDashOffset = -t * (kind === 'sel' ? 60 : 30);
      c.strokeStyle = kind === 'sel' ? '#fff' : 'rgba(200,240,255,.85)'; c.lineWidth = kind === 'sel' ? 3.5 : 2.5;
      c.shadowColor = '#7fe7ff'; c.shadowBlur = kind === 'sel' ? 12 : 6; lane(a, b); c.stroke();
    } else if (kind === 'prev') { c.setLineDash([6, 7]); c.lineDashOffset = -t * 14; c.strokeStyle = 'rgba(255,214,120,.7)'; c.lineWidth = 2; lane(a, b); c.stroke(); }
    else if (kind === 'open') { c.setLineDash([4, 8]); c.strokeStyle = 'rgba(170,200,255,.32)'; c.lineWidth = 1.6; lane(a, b); c.stroke(); }
    else { c.setLineDash([2, 9]); c.strokeStyle = 'rgba(140,160,220,.12)'; c.lineWidth = 1.2; lane(a, b); c.stroke(); }
    c.restore();
  }

  // узел: подсветка, диск-«портал» цвета узла, объект на нём, подпись
  function drawNode(c, n, k, on) {
    if (k <= 0) return;
    const t = st.t, col = n.def.color, isSel = st.sel === n;
    const R = 21 * (isSel ? 1.18 : 1) * (0.6 + 0.4 * U.easeOutBack(k));
    const live = n.can || n.done || on;
    const a = k * (n.can || isSel ? 1 : n.done ? 0.85 : on ? (st.reach ? 0.9 : 0.62) : 0.22);
    const bob = Math.sin(t * 1.6 + n.ph) * 2;
    const x = n.x, y = n.y + bob;
    c.save();
    // ореол
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = a * (n.can ? 0.55 + 0.25 * Math.sin(t * 4 + n.ph) : 0.3);
    c.drawImage(G.soft(col, 64), x - R * 2.4, y - R * 2.4, R * 4.8, R * 4.8);
    c.globalCompositeOperation = 'source-over';
    // диск
    c.globalAlpha = a;
    const g = c.createRadialGradient(x - R * 0.3, y - R * 0.4, R * 0.1, x, y, R);
    g.addColorStop(0, G.hexA(col, 0.55)); g.addColorStop(0.6, 'rgba(10,14,36,.92)'); g.addColorStop(1, 'rgba(4,6,18,.95)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, R, 0, U.TAU); c.fill();
    c.lineWidth = n.can || isSel ? 2.4 : 1.4; c.strokeStyle = n.done && !n.can ? '#3de0ff' : G.hexA(col, live ? 0.95 : 0.5); c.stroke();
    // вращающееся кольцо у доступных
    if (n.can || isSel) {
      c.save(); c.translate(x, y); c.rotate(t * (isSel ? 1.6 : 0.8) + n.ph);
      c.setLineDash([5, 6]); c.lineWidth = isSel ? 2.5 : 1.8; c.strokeStyle = isSel ? '#fff' : col;
      c.beginPath(); c.arc(0, 0, R + 6 + (isSel ? 2 : Math.sin(t * 4) * 1.5), 0, U.TAU); c.stroke();
      c.restore();
    }
    // объект узла
    if (!live) c.filter = 'grayscale(0.8) brightness(0.7)';
    drawObj(c, n, x, y, R);
    c.filter = 'none';
    // отметка пройденного
    if (n.done) {
      c.globalAlpha = a; c.fillStyle = '#3de0ff';
      c.beginPath(); c.arc(x + R * 0.75, y - R * 0.75, 6, 0, U.TAU); c.fill();
      c.strokeStyle = '#04121f'; c.lineWidth = 2; c.beginPath(); c.moveTo(x + R * 0.75 - 3, y - R * 0.75); c.lineTo(x + R * 0.75 - 0.5, y - R * 0.75 + 2.5); c.lineTo(x + R * 0.75 + 3.5, y - R * 0.75 - 2.5); c.stroke();
    }
    // подпись
    if (n.can || isSel || (on && st.reach)) {
      c.globalAlpha = a; c.font = '700 ' + (isSel ? 10.5 : 9.5) + 'px Orbitron, Rajdhani, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'top';
      c.fillStyle = 'rgba(0,0,0,.6)'; c.fillText(n.def.name, x + 1, y + R + 13);
      c.fillStyle = n.can || isSel ? '#fff' : G.hexA(col, 0.9); c.fillText(n.def.name, x, y + R + 12);
    }
    c.restore();
  }
  // что стоит на узле: враги, торговец, медкорабль, ящик, аномалия
  function drawObj(c, n, x, y, R) {
    const t = st.t;
    if (n.t === 'fight') G.draw(c, n.spr, x, y, R * 1.35, Math.PI);
    else if (n.t === 'elite') {
      for (const s of [-1, 1]) G.draw(c, 'e_interceptor2', x + s * R * 0.62, y + R * 0.3, R * 0.75, Math.PI);
      G.draw(c, 'e_heavyfighter', x, y - R * 0.08, R * 1.25, Math.PI);
    } else if (n.t === 'shop') {
      G.draw(c, 'p_merchant_s', x, y + Math.sin(t * 2 + n.ph) * 1.5, R * 1.45);
      // мигают огни лавки
      if (Math.sin(t * 5 + n.ph) > 0.3) { c.globalCompositeOperation = 'lighter'; c.drawImage(G.glow('#ffc83d', 32), x - R * 0.7 - 5, y - R * 0.55 - 5, 10, 10); c.drawImage(G.glow('#ff5c3d', 32), x + R * 0.7 - 5, y - R * 0.55 - 5, 10, 10); c.globalCompositeOperation = 'source-over'; }
    } else if (n.t === 'repair') {
      G.draw(c, 'p_medship', x, y, R * 1.05);
      c.globalCompositeOperation = 'lighter'; c.globalAlpha *= 0.5 + 0.5 * Math.sin(t * 3 + n.ph);
      c.strokeStyle = '#3dffa2'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, R * (0.55 + ((t * 0.8 + n.ph) % 1) * 0.5), 0, U.TAU); c.stroke();
      c.globalCompositeOperation = 'source-over';
    } else if (n.t === 'cache') {
      G.draw(c, 'ast_m1', x + R * 0.15, y + R * 0.18, R * 1.35, n.ph + t * 0.2);
      G.draw(c, 'p_crate', x - R * 0.05, y - R * 0.12, R * 1.0, Math.sin(t * 1.5 + n.ph) * 0.12);
    } else if (n.t === 'event') {
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha *= 0.8;
      G.draw(c, 'fx_vortex', x, y, R * 1.9, t * 1.4 + n.ph);
      c.restore();
      c.font = '900 ' + Math.round(R * 1.05) + 'px Orbitron, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#e8fbff'; c.shadowColor = '#7fe7ff'; c.shadowBlur = 10; c.fillText('?', x, y + 1); c.shadowBlur = 0;
    }
  }
  // босс сектора: красная планета-крепость и сам босс
  function drawBoss(c, b, k) {
    if (k <= 0) return;
    const t = st.t, col = b.def.color || '#ff3d5a', R = 34 * (0.6 + 0.4 * U.easeOutBack(k)), x = b.x, y = b.y;
    const isSel = st.sel === b;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = k * (0.45 + 0.2 * Math.sin(t * 2.2));
    c.drawImage(G.soft(col, 64), x - R * 2.6, y - R * 2.2, R * 5.2, R * 4.4);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = k;
    const g = c.createRadialGradient(x - R * 0.35, y - R * 0.45, R * 0.1, x, y, R);
    g.addColorStop(0, G.hexA(col, 0.6)); g.addColorStop(0.7, 'rgba(40,6,14,.95)'); g.addColorStop(1, 'rgba(12,2,6,.98)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, R, 0, U.TAU); c.fill();
    c.lineWidth = isSel ? 3 : 2; c.strokeStyle = isSel ? '#fff' : col; c.stroke();
    c.save(); c.translate(x, y); c.rotate(-t * 0.4); c.setLineDash([3, 9]); c.strokeStyle = G.hexA(col, 0.8); c.lineWidth = 2; c.beginPath(); c.arc(0, 0, R + 7, 0, U.TAU); c.stroke(); c.restore();
    G.draw(c, b.def.sprite, x, y + Math.sin(t * 1.3) * 2, R * 1.55, b.def.rot || 0);
    c.font = '700 10px Orbitron, Rajdhani, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'top';
    c.fillStyle = 'rgba(0,0,0,.6)'; c.fillText('БОСС · ' + b.def.name, x + 1, y + R + 9);
    c.fillStyle = '#ffd0d6'; c.fillText('БОСС · ' + b.def.name, x, y + R + 8);
    c.restore();
  }
  function drawShip(c) {
    const f = st.fly, s = st.ship, t = st.t;
    const x = f ? f.x : s.x, y = f ? f.y : s.y + (s === st.entry ? 0 : 36) + Math.sin(t * 2.4) * 1.5, ang = f ? f.ang : 0;
    const look = game.shipLook(M.s.ship.model, M.s.ship.skin), w = 30;
    c.save();
    c.translate(x, y); c.rotate(ang);
    c.globalCompositeOperation = 'lighter';
    const fl = 0.7 + 0.3 * Math.random();
    c.globalAlpha = 0.85; c.drawImage(G.glow('#5cc8ff', 32), -8 * fl, w * 0.36, 16 * fl, 22 * fl);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    if (look.cv) G.drawCanvas(c, look.cv, 0, 0, w); else G.draw(c, look.sprite, 0, 0, w);
    c.restore();
  }
  function drawComet(c, m) {
    c.save();
    const a = Math.atan2(m.vy, m.vx), L = 46;
    const g = c.createLinearGradient(m.x, m.y, m.x - Math.cos(a) * L, m.y - Math.sin(a) * L);
    g.addColorStop(0, 'rgba(220,245,255,.9)'); g.addColorStop(1, 'rgba(120,200,255,0)');
    c.strokeStyle = g; c.lineWidth = 2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(m.x, m.y); c.lineTo(m.x - Math.cos(a) * L, m.y - Math.sin(a) * L); c.stroke();
    c.globalCompositeOperation = 'lighter'; c.drawImage(G.glow('#bfe9ff', 32), m.x - 6, m.y - 6, 12, 12);
    c.restore();
  }
  // потерянный груз: дрейфует через карту, мигает; тап — монеты
  function podPos(p) {
    const k = p.t / 16;
    return { x: p.side < 0 ? U.lerp(-20, W + 20, k) : U.lerp(W + 20, -20, k), y: H * p.y + Math.sin(p.t * 1.3) * 10 };
  }
  function drawPod(c, p) {
    if (p.got) {
      p.gt = (p.gt || 0) + 1 / 60;
      c.save(); c.globalAlpha = Math.max(0, 1 - p.gt); c.font = '700 14px Orbitron, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#ffc83d';
      c.fillText('+' + p.coins, p.x, p.y - 14 - p.gt * 30); c.restore();
      if (p.gt > 1) st.pod = null;
      return;
    }
    const q = podPos(p);
    p.x = q.x; p.y = q.y;
    c.save();
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5 + 0.5 * Math.sin(st.t * 6);
    c.drawImage(G.glow('#ffc83d', 32), q.x - 16, q.y - 16, 32, 32);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    G.draw(c, 'p_crate', q.x, q.y, 22, st.t * 0.8);
    c.restore();
  }

  // ── тап по карте ──
  function onTap(e) {
    if (!st.d || st.fly) return;
    e.preventDefault();
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    // груз
    if (st.pod && !st.pod.got && Math.hypot(st.pod.x - x, st.pod.y - y) < 30) {
      const p = st.pod, coins = Math.round(8 + st.d.n * 1.2);
      p.got = true; p.coins = coins;
      game.run.coins += coins; M.addCoins(coins); game.hudDirty = true;
      A.play('coin', { rate: 1.2 }); T.haptic('success');
      return;
    }
    let best = null, bd = 40;
    for (const n of st.nodes) { const dd = Math.hypot(n.x - x, n.y - y); if (dd < bd) { bd = dd; best = n; } }
    if (Math.hypot(st.boss.x - x, st.boss.y - y) < 48) best = st.boss;
    if (!best) return;
    // повторный тап по выбранному доступному узлу — летим
    if (best === st.sel && best.can) { GX.go(); return; }
    select(best);
  }
  function select(n) {
    st.sel = n;
    st.reach = n.boss ? null : reachFrom([key(n.c, n.r)]);
    info(n);
    $('#btnMapGo').disabled = !n.can;
    A.play(n.can ? 'click' : 'back', { vol: 0.6 });
    T.haptic('select');
  }
  function info(n) {
    const el = $('#mapInfo');
    if (!n) { el.innerHTML = '<div class="mi-hint">Выберите светящийся узел · тап по любому — подробности</div>'; el.style.removeProperty('--nc'); return; }
    if (n.boss) {
      el.style.setProperty('--nc', n.def.color || '#ff3d5a');
      el.innerHTML = '<div class="mi-name">БОСС: ' + n.def.name + '</div><div class="mi-desc">' + U.escape(n.def.title || '') + '. После боя — трофейный сундук и станция</div>';
      return;
    }
    el.style.setProperty('--nc', n.def.color);
    const tag = n.can ? '<span class="mi-tag ok">МОЖНО ЛЕТЕТЬ</span>' : n.done ? '<span class="mi-tag">ПРОЙДЕН</span>' : n.c < st.d.step ? '<span class="mi-tag">ПОЗАДИ</span>' : st.open.has(key(n.c, n.r)) ? '<span class="mi-tag">ДАЛЬШЕ ПО ПУТИ</span>' : '<span class="mi-tag no">НЕТ ПУТИ</span>';
    const more = n.can && st.reach ? '<div class="mi-more">Отсюда дальше: ' + routeText(st.reach, n) + '</div>' : '';
    el.innerHTML = '<div class="mi-name">' + n.def.name + tag + '</div><div class="mi-desc">' + n.def.desc + '</div>' + more;
  }
  // что встретится дальше по выбранному пути (по типам)
  function routeText(reach, from) {
    const cnt = {};
    for (const n of st.nodes) if (n !== from && n.c > from.c && reach.has(key(n.c, n.r))) cnt[n.t] = (cnt[n.t] || 0) + 1;
    const parts = Object.keys(cnt).map((t) => D.MAP_NODES[t].name.toLowerCase() + (cnt[t] > 1 ? ' ×' + cnt[t] : ''));
    return parts.length ? parts.join(', ') : 'сразу босс';
  }

  // ── «ЛЕТИМ»: корабль летит по коридору, затем волна ──
  GX.go = function () {
    const n = st.sel;
    if (!n || !n.can || st.fly) return false;
    const from = st.ship;
    st.fly = { a: { x: from.x, y: from.y + (from === st.entry ? 0 : 36) }, b: { x: n.x, y: n.y }, t: 0, dur: 0.75, x: from.x, y: from.y, ang: 0,
      done: () => {
        st.fly = null;
        if (!SS.map.choose(n.c, n.r)) { A.play('error'); return; }
        ui.hide('#scr-map');
      } };
    $('#btnMapGo').disabled = true;
    A.play('teleport', { rate: 1.3, vol: 0.5 });
    T.haptic('success');
    return true;
  };
})();
