// ════════════════════════════════════════════════════════════════
// SPACE SHOOTER 4.1 — реликвии и сундуки (интерфейс)
//  • коллекция реликвий и слоты «в забег» (окно из меню и из выбора сложности)
//  • открытие сундуков на экране итогов: тап → тряска → крышка → реликвия
//  Логика сундуков — store.js (meta.openChest), выпадение в забеге — map.js
// ════════════════════════════════════════════════════════════════
'use strict';

(function () {
  const U = SS.util, D = SS.data, $ = U.$, $$ = U.$$, ic = U.icon;
  let G, A, M, T, ui, store;

  const RL = {};
  SS.relicsUi = RL;
  const rc = (id) => D.RELIC_RARITY[D.RELICS[id].rar].color;
  const rname = (id) => D.RELIC_RARITY[D.RELICS[id].rar].name;

  RL.init = function () {
    G = SS.gfx; A = SS.audio; M = SS.meta; T = SS.tg; ui = SS.ui; store = SS.store;
    $('#btnRelicsClose').addEventListener('click', () => RL.close());
    $('#scr-relics').addEventListener('click', (e) => { if (e.target.id === 'scr-relics') RL.close(); });
    $('#relicGrid').addEventListener('click', (e) => { const b = e.target.closest('.rcell'); if (b) RL.tap(b.dataset.id); });
    $('#relicSlots').addEventListener('click', (e) => { const b = e.target.closest('.rslot.full'); if (b) RL.tap(b.dataset.id, true); });
    $('#diffRelics').addEventListener('click', () => { A.play('click'); T.haptic('select'); RL.show(); });
    $('#chestCv').addEventListener('pointerdown', (e) => { e.preventDefault(); RL.chestTap(); });
    $('#btnChestNext').addEventListener('click', () => RL.chestNext());
    $('#btnChestAll').addEventListener('click', () => RL.chestAll());
  };

  // ════════════════════════════════════════════════════════════
  // КОЛЛЕКЦИЯ
  // ════════════════════════════════════════════════════════════
  RL.show = function () {
    RL.sel = null;
    RL.render();
    ui.show('#scr-relics');
    T.back(() => RL.close());
  };
  RL.close = function () {
    A.play('back');
    ui.hide('#scr-relics');
    if (ui.isShown('#scr-diff')) { RL.renderDiff(); T.back(() => ui.back()); }
    else T.back(ui.cur === 'menu' ? null : () => ui.back());
  };
  RL.isOpen = () => ui.isShown('#scr-relics');

  RL.render = function () {
    const s = store.s, slots = M.relicSlots(), lo = M.relicLoadout();
    let h = '<small>В ЗАБЕГ</small>';
    for (let i = 0; i < D.RELIC_SLOTS.length; i++) {
      const id = lo[i];
      if (id) h += '<button class="rslot full" data-id="' + id + '" style="--rc:' + rc(id) + '"><span>' + D.RELICS[id].ico + '</span></button>';
      else if (i < slots) h += '<div class="rslot empty"><span>+</span></div>';
      else h += '<div class="rslot locked">' + ic('lock') + '<small>ур. ' + D.RELIC_SLOTS[i] + '</small></div>';
    }
    $('#relicSlots').innerHTML = h;
    // вся коллекция: найденные — цветные, ненайденные — «?» в рамке своей редкости
    const order = ['common', 'rare', 'epic', 'legendary', 'cursed'];
    const ids = Object.keys(D.RELICS).sort((a, b) => order.indexOf(D.RELICS[a].rar) - order.indexOf(D.RELICS[b].rar));
    $('#relicGrid').innerHTML = ids.map((id) => {
      const own = !!s.relics[id], on = lo.includes(id);
      return '<button class="rcell' + (own ? '' : ' unknown') + (on ? ' on' : '') + (id === RL.sel ? ' sel' : '') + '" data-id="' + id + '" style="--rc:' + rc(id) + '">' + (own ? D.RELICS[id].ico : '?') + '</button>';
    }).join('');
    RL.renderDetail();
    const n = M.relicCount(), total = Object.keys(D.RELICS).length, next = D.RELIC_SLOTS[slots];
    $('#relicHint').innerHTML = 'Собрано <b>' + n + ' / ' + total + '</b>. Реликвии — только из сундуков: элита, боссы, тайники, события и торговец. ' +
      'Сундуки открываются после забега' + (s.chests.length ? ' — ждут: <b>' + s.chests.length + '</b>' : '') + '.' +
      (next ? '<br>Следующий слот — на уровне корабля ' + next + '.' : '');
  };
  RL.renderDetail = function () {
    const el = $('#relicDetail'), id = RL.sel, s = store.s;
    if (!id) { el.innerHTML = '<div class="rd-empty">Нажмите на реликвию: найденная встанет в слот или уйдёт из него</div>'; return; }
    const r = D.RELICS[id], own = !!s.relics[id], on = M.relicLoadout().includes(id);
    el.style.setProperty('--rc', rc(id));
    el.innerHTML = '<div class="rd-ico">' + (own ? r.ico : '?') + '</div><div class="rd-txt"><small>' + rname(id) + (on ? ' · В ЗАБЕГЕ' : '') + '</small>' +
      '<b>' + (own ? r.name : 'НЕ НАЙДЕНА') + '</b><span>' + (own ? r.desc : 'Выпадает из сундуков') + '</span></div>';
  };
  RL.tap = function (id, fromSlot) {
    RL.sel = id;
    if (!store.s.relics[id]) { A.play('click'); RL.render(); return; }
    const r = M.toggleRelic(id);
    if (r === 'full') { A.play('error'); T.haptic('error'); ui.toast({ ico: 'lock', title: 'СЛОТЫ ЗАНЯТЫ', text: 'Уберите реликвию из слота, чтобы взять эту', info: true }); }
    else { A.play(r === 'on' ? 'perk' : 'back', { vol: 0.6 }); T.haptic('select'); }
    if (fromSlot && r === 'off') RL.sel = id;
    RL.render();
  };

  // строка реликвий в окне выбора сложности
  RL.renderDiff = function () {
    const el = $('#diffRelics'), daily = ui._diffSel === 'daily';
    if (!el) return;
    const lo = M.relicLoadout(), slots = M.relicSlots();
    let h = '<small>РЕЛИКВИИ</small><div class="rr-slots">';
    for (let i = 0; i < slots; i++) h += lo[i] ? '<span style="--rc:' + rc(lo[i]) + '">' + D.RELICS[lo[i]].ico + '</span>' : '<span class="e">+</span>';
    h += '</div><em>' + (daily ? 'не в испытании' : M.relicCount() ? 'изменить ›' : 'найдите в сундуках ›') + '</em>';
    el.innerHTML = h;
    el.classList.toggle('off', daily);
  };

  // ════════════════════════════════════════════════════════════
  // ИТОГИ: сундуки, которые ждут открытия
  // ════════════════════════════════════════════════════════════
  RL.renderGo = function (got) {
    const el = $('#goChests'), list = store.s.chests;
    if (!list.length) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    const shown = list.slice(0, 5).map((t, i) => G.chestImg(t, 'gc-ico" style="animation-delay:' + (i * 0.12) + 's')).join('');
    el.innerHTML = '<div class="gc-row">' + shown + (list.length > 5 ? '<b>+' + (list.length - 5) + '</b>' : '') + '</div>' +
      '<div class="gc-txt"><b>' + (got ? 'СУНДУКИ ЗА ЗАБЕГ: ' + got : 'СУНДУКИ ЖДУТ') + '</b><small>Внутри — реликвии в коллекцию</small></div>' +
      '<button class="btn primary" id="btnOpenChests">ОТКРЫТЬ</button>';
    $('#btnOpenChests').addEventListener('click', () => { A.play('click'); T.haptic('medium'); RL.openChests(); });
  };

  // ════════════════════════════════════════════════════════════
  // ОТКРЫТИЕ СУНДУКА
  //  drop (падает с отскоком) → idle (ждёт тапа) → shake (рвётся, из щели свет цвета редкости)
  //  → open (крышка, вспышка, реликвия поднимается) → show (карточка)
  // ════════════════════════════════════════════════════════════
  let cv, ctx, raf = 0, last = 0, W = 0, H = 0, dpr = 1;
  const ch = { phase: 'idle', t: 0, tier: 'bronze', res: null, parts: [], ring: [] };

  RL.openChests = function () {
    if (!store.s.chests.length) return;
    cv = $('#chestCv'); ctx = cv.getContext('2d');
    ui.show('#scr-chest');
    T.back(() => RL.chestClose());
    resize();
    RL.chestStart();
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
  };
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = cv.getBoundingClientRect();
    W = Math.max(200, r.width); H = Math.max(200, r.height);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }
  RL.chestStart = function () {
    Object.assign(ch, { phase: 'drop', t: 0, tier: store.s.chests[0], res: null, parts: [], ring: [], shakeK: 0 });
    $('#chestCard').hidden = true;
    $('#btnChestNext').hidden = true;
    $('#btnChestAll').hidden = store.s.chests.length < 2;
    $('#chestTip').textContent = D.CHESTS[ch.tier].name;
    $('#chestTip').classList.remove('tap');
    left();
    A.play('teleport', { rate: 1.2, vol: 0.4 });
  };
  function left() {
    const n = store.s.chests.length - (ch.res ? 0 : 1);
    $('#chestLeft').innerHTML = n > 0 ? 'Ещё сундуков: <b>' + n + '</b>' : '';
  }
  RL.chestTap = function () {
    if (ch.phase === 'drop') { ch.t = 0.7; return; }
    if (ch.phase !== 'idle') return;
    ch.res = M.openChest();
    if (!ch.res) return;
    ch.phase = 'shake'; ch.t = 0;
    $('#chestTip').textContent = '';
    T.haptic('medium');
    A.play('click', { rate: 0.7 });
  };
  RL.chestNext = function () {
    A.play('click');
    if (store.s.chests.length) RL.chestStart();
    else RL.chestClose();
  };
  // открыть все разом — список выпавшего
  RL.chestAll = function () {
    const res = [];
    if (ch.phase === 'shake') return;
    while (store.s.chests.length) res.push(M.openChest());
    if (!res.length) return;
    A.play('levelup'); T.haptic('success');
    ch.phase = 'all'; ch.t = 0; ch.res = res[res.length - 1]; ch.all = res;
    burst(W / 2, H * 0.55, '#ffc83d', 60);
    $('#chestTip').textContent = '';
    $('#btnChestAll').hidden = true;
    let coins = 0;
    const rows = res.map((r) => {
      coins += r.coins;
      return '<div class="ca-row" style="--rc:' + rc(r.id) + '"><span class="ca-ico">' + D.RELICS[r.id].ico + '</span><div><b>' + D.RELICS[r.id].name + '</b><small>' + (r.dupe ? 'повтор → +' + r.coins + ' монет' : 'НОВАЯ · ' + rname(r.id)) + '</small></div></div>';
    }).join('');
    showCard('<div class="cc-cap">ОТКРЫТО СУНДУКОВ: ' + res.length + '</div><div class="ca-list">' + rows + '</div>' + (coins ? '<div class="cc-dupe">За повторы: +' + U.fmt(coins) + ' ' + ic('coin') + '</div>' : ''));
    left();
  };
  RL.chestClose = function () {
    ui.hide('#scr-chest');
    cancelAnimationFrame(raf); raf = 0;
    RL.renderGo(0);
    T.back(() => ui.back());
    SS.emit('coins', store.s.coins);
  };
  function showCard(html) {
    const el = $('#chestCard');
    el.innerHTML = html;
    el.hidden = false;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    $('#btnChestNext').hidden = false;
    $('#btnChestNext').textContent = store.s.chests.length ? 'СЛЕДУЮЩИЙ (' + store.s.chests.length + ')' : 'ГОТОВО';
  }
  function reveal() {
    const r = ch.res, def = D.RELICS[r.id], col = rc(r.id);
    $('#chestCard').style.setProperty('--rc', col);
    const equipped = !r.dupe && M.relicLoadout().includes(r.id);
    showCard('<div class="cc-cap" style="color:' + col + '">' + rname(r.id) + (r.dupe ? ' · ПОВТОР' : ' · НОВАЯ') + '</div>' +
      '<div class="cc-name">' + def.name + '</div><div class="cc-desc">' + def.desc + '</div>' +
      (r.dupe ? '<div class="cc-dupe">Уже в коллекции → +' + U.fmt(r.coins) + ' ' + ic('coin') + '</div>' : equipped ? '<div class="cc-eq">Встала в свободный слот — полетит в следующий забег</div>' : '<div class="cc-eq">В коллекции. Взять в забег — «Реликвии» в меню</div>'));
    $('#btnChestAll').hidden = store.s.chests.length < 2;
    left();
  }

  function burst(x, y, col, n, sp) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * U.TAU, v = (sp || 260) * (0.3 + Math.random());
      ch.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life: 0.6 + Math.random() * 0.8, t: 0, col: Math.random() < 0.3 ? '#fff' : col, s: 2 + Math.random() * 3 });
    }
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!ui.isShown('#scr-chest')) return;
    update(dt);
    draw();
  }
  function update(dt) {
    ch.t += dt;
    const cx = W / 2, cy = H * 0.6;
    if (ch.phase === 'drop' && ch.t >= 0.7) {
      ch.phase = 'idle'; ch.t = 0;
      burst(cx, cy + 40, D.CHESTS[ch.tier].color, 14, 140);
      A.play('mine', { rate: 0.6, vol: 0.4 }); T.haptic('light');
      $('#chestTip').textContent = 'Нажмите на сундук'; $('#chestTip').classList.add('tap');
    }
    if (ch.phase === 'shake') {
      // три рывка с нарастанием; искры из щели
      const col = rc(ch.res.id);
      if (Math.random() < 0.3 + ch.t) ch.parts.push({ x: cx + U.rand(-40, 40), y: cy - 6, vx: U.rand(-60, 60), vy: U.rand(-160, -60), life: 0.5, t: 0, col, s: 2 + Math.random() * 2 });
      const k = Math.floor(ch.t / 0.3);
      if (k !== ch.shakeK && k < 3) { ch.shakeK = k; A.play('click', { rate: 0.7 + k * 0.15 }); T.haptic(k === 2 ? 'heavy' : 'medium'); }
      if (ch.t >= 1.0) {
        ch.phase = 'open'; ch.t = 0;
        const rar = D.RELICS[ch.res.id].rar;
        burst(cx, cy - 10, col, rar === 'legendary' ? 90 : rar === 'epic' ? 60 : 40, rar === 'legendary' ? 380 : 280);
        ch.ring.push({ t: 0, col });
        A.play(rar === 'legendary' || rar === 'epic' ? 'levelup' : 'perk');
        T.haptic('success');
      }
    }
    if (ch.phase === 'open' && ch.t >= 0.9 && !ch.shown) { ch.shown = true; reveal(); }
    if (ch.phase !== 'open') ch.shown = false;
    for (const p of ch.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; p.vx *= 0.985; }
    ch.parts = ch.parts.filter((p) => p.t < p.life);
    for (const r of ch.ring) r.t += dt;
    ch.ring = ch.ring.filter((r) => r.t < 0.8);
  }

  function draw() {
    const c = ctx, t = ch.t, cx = W / 2, cy = H * 0.6;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const tierCol = D.CHESTS[ch.tier].color;
    const col = ch.res && ch.phase !== 'drop' && ch.phase !== 'idle' ? rc(ch.res.id) : tierCol;
    const opened = ch.phase === 'open' || ch.phase === 'all';
    // лучи и ореол
    c.globalCompositeOperation = 'lighter';
    const glowK = ch.phase === 'drop' ? Math.min(1, t / 0.7) * 0.5 : ch.phase === 'idle' ? 0.5 + 0.12 * Math.sin(t * 3) : ch.phase === 'shake' ? 0.6 + t * 0.5 : 1;
    SS.map.rays(c, cx, opened ? cy - 70 : cy, (opened ? 240 : 170), col, performance.now() / 1000, (opened ? 0.45 : 0.22) * glowK, opened ? 14 : 10);
    c.globalAlpha = 0.55 * glowK;
    const gr = opened ? 230 : 150;
    c.drawImage(G.soft(col, 64), cx - gr, (opened ? cy - 70 : cy) - gr, gr * 2, gr * 2);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    // сундук
    let y = cy, open = 0, jolt = 0, sx = 0;
    if (ch.phase === 'drop') y = U.lerp(-120, cy, bounceOut(Math.min(1, t / 0.7)));
    if (ch.phase === 'idle') { y = cy + Math.sin(t * 2.4) * 3; jolt = Math.sin(t * 2.4) > 0.96 ? 0.6 : 0; }
    if (ch.phase === 'shake') { const q = (t % 0.3) / 0.3; jolt = q < 0.4 ? Math.sin(q / 0.4 * Math.PI) * (1 + ch.shakeK * 0.6) : 0; sx = jolt ? (Math.random() - 0.5) * 6 * (1 + ch.shakeK) : 0; }
    if (opened) open = Math.min(1, t / 0.35);
    const w = Math.min(W * 0.5, 190);
    const m = G.drawChest(c, ch.tier, cx + sx, y, w, open, jolt);
    // свет из щели и столб света из открытого сундука
    c.globalCompositeOperation = 'lighter';
    if (jolt > 0.05) { c.globalAlpha = Math.min(1, jolt); c.drawImage(G.glow(col, 64), cx - w * 0.55, m.mouth - w * 0.12, w * 1.1, w * 0.24); }
    if (opened) {
      const k = Math.min(1, t / 0.3);
      const g = c.createLinearGradient(0, m.mouth - 260, 0, m.mouth);
      g.addColorStop(0, G.hexA(col, 0)); g.addColorStop(1, G.hexA(col, 0.55 * k));
      c.globalAlpha = 1; c.fillStyle = g;
      c.beginPath(); c.moveTo(cx - w * 0.36, m.mouth); c.lineTo(cx + w * 0.36, m.mouth); c.lineTo(cx + w * 0.6, m.mouth - 260); c.lineTo(cx - w * 0.6, m.mouth - 260); c.closePath(); c.fill();
    }
    // кольцо вспышки
    for (const r of ch.ring) { const q = r.t / 0.8; c.globalAlpha = 1 - q; c.strokeStyle = r.col; c.lineWidth = 6 * (1 - q) + 1; c.beginPath(); c.arc(cx, m.mouth, 30 + q * 220, 0, U.TAU); c.stroke(); }
    // искры
    for (const p of ch.parts) { c.globalAlpha = Math.max(0, 1 - p.t / p.life); c.fillStyle = p.col; c.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    // реликвия поднимается из сундука
    if (opened && ch.res) {
      const k = U.clamp((t - 0.15) / 0.6, 0, 1), e = 1 - Math.pow(1 - k, 3);
      const ry = U.lerp(m.mouth, cy - 150, e) + (k >= 1 ? Math.sin(t * 2.2) * 4 : 0), size = U.lerp(20, 86, e);
      relicBadge(c, cx, ry, size, ch.res.id, k);
    }
  }
  // значок реликвии: шестиугольник цвета редкости и иконка
  function relicBadge(c, x, y, s, id, a) {
    const col = rc(id);
    c.save();
    c.globalAlpha = a;
    c.translate(x, y);
    c.beginPath();
    for (let i = 0; i < 6; i++) { const q = Math.PI / 6 + i * Math.PI / 3; c.lineTo(Math.cos(q) * s * 0.62, Math.sin(q) * s * 0.62); }
    c.closePath();
    const g = c.createLinearGradient(0, -s / 2, 0, s / 2);
    g.addColorStop(0, '#2a3046'); g.addColorStop(1, '#0d1020');
    c.fillStyle = g; c.shadowColor = col; c.shadowBlur = 24; c.fill();
    c.shadowBlur = 0; c.lineWidth = Math.max(2, s * 0.06); c.strokeStyle = col; c.stroke();
    // iOS (WebKit) заливает эмодзи текущим fillStyle: с тёмным градиентом фона иконка выходит чёрной
    c.fillStyle = '#fff';
    c.font = Math.round(s * 0.62) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(D.RELICS[id].ico, 0, s * 0.03);
    c.restore();
  }
  function bounceOut(k) {
    const n = 7.5625, d = 2.75;
    if (k < 1 / d) return n * k * k;
    if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75;
    if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375;
    return n * (k -= 2.625 / d) * k + 0.984375;
  }
})();
