// ════════════════════════════════════════════════════════════════
// SPACE SHOOTER 4.0 — карта сектора и реликвии
//  Сектор: 4 шага по 2–3 узла и босс. Перед каждой обычной волной (кроме
//  самой первой в забеге) игрок выбирает узел, связанный с прошлым:
//  бой, элита, торговец, ремонт, тайник, событие. После волны — награда
//  узла. Реликвии — редкие предметы забега (эффекты — в game.js).
//  4.1: реликвии больше не выдаются в забеге — вместо них сундуки (элита, босс,
//  тайник, события, торговец); открываются на экране итогов, реликвия — в коллекцию,
//  в забег берутся из коллекции (MP.startRelics).
// ════════════════════════════════════════════════════════════════
'use strict';

(function () {
  const U = SS.util, D = SS.data;
  let G, FX, A, M, game;

  const MP = {
    init() { G = SS.gfx; FX = SS.fx; A = SS.audio; M = SS.meta; game = SS.game; },
  };
  SS.map = MP;

  const STEPS = 4, LANES = 3;
  const key = (c, r) => c + ':' + r;

  // ── генерация: в каждом шаге 2–3 узла, связи — к тому же или соседнему ряду ──
  MP.generate = function (sector) {
    const cols = [];
    let shops = 0, elites = 0;
    for (let c = 0; c < STEPS; c++) {
      const col = [];
      for (let r = 0; r < LANES; r++) col.push(c === 0 || Math.random() < 0.8 ? { r } : null);
      if (col.filter(Boolean).length < 2) col[1] = col[1] || { r: 1 };
      for (const n of col) {
        if (!n) continue;
        const types = Object.keys(D.MAP_NODES).filter((t) => (c > 0 || D.MAP_NODES[t].first) && !(t === 'shop' && shops >= 1) && !(t === 'elite' && elites >= 2));
        n.t = U.pickWeighted(types, (t) => D.MAP_NODES[t].w);
        if (n.t === 'shop') shops++;
        if (n.t === 'elite') elites++;
      }
      cols.push(col);
    }
    // связи вперёд: у каждого узла хотя бы одна, у каждого следующего — хотя бы одна входящая
    const links = {};
    for (let c = 0; c < STEPS - 1; c++) {
      const next = cols[c + 1];
      for (let r = 0; r < LANES; r++) {
        if (!cols[c][r]) continue;
        const near = [r - 1, r, r + 1].filter((q) => q >= 0 && q < LANES && next[q]);
        const pick = near.length ? near.filter(() => Math.random() < 0.6) : [];
        if (!pick.length) pick.push(near.length ? U.pick(near) : next.findIndex(Boolean));
        links[key(c, r)] = pick;
      }
      for (let q = 0; q < LANES; q++) {
        if (!next[q] || Object.keys(links).some((k) => +k.split(':')[0] === c && links[k].includes(q))) continue;
        const from = [q - 1, q, q + 1, 0, 1, 2].find((r) => r >= 0 && r < LANES && cols[c][r]);
        links[key(c, from)].push(q);
      }
    }
    return { sector, cols, links, at: null, path: [] };
  };

  // какие узлы можно выбрать на шаге step
  MP.choices = function (map, step) {
    const col = map.cols[step];
    if (step === 0 || !map.at) return col.filter(Boolean).map((n) => n.r);
    return (map.links[key(map.at.c, map.at.r)] || []).filter((r) => col[r]);
  };

  // нужна ли карта перед волной n: обычная волна, не первая в забеге, корабль цел и бой идёт
  MP.need = function (n) {
    const run = game.run;
    return n > 1 && n % 5 !== 0 && game.state === 'play' && game.player.alive && run.mapStep !== n;
  };

  MP.offer = function (n) {
    const run = game.run, sector = Math.floor((n - 1) / 5), step = (n - 1) % 5;
    if (!run.map || run.map.sector !== sector) run.map = MP.generate(sector);
    const choices = MP.choices(run.map, step);
    run.mapStep = n;
    if (!choices.length) { game.nextWave(); return; }
    game.state = 'perk';
    game.offerKind = 'map';
    game.pointer.id = null;
    A.play('skill', { rate: 1.1 });
    SS.emit('mapOffer', { map: run.map, step, choices, n });
  };

  MP.choose = function (step, r) {
    const run = game.run, map = run.map;
    if (game.state !== 'perk' || game.offerKind !== 'map' || !map || !MP.choices(map, step).includes(r)) return false;
    map.at = { c: step, r };
    map.path.push(key(step, r));
    run.mapNode = map.cols[step][r].t;
    game.offerKind = null;
    game.state = 'play';
    game.player.inv = Math.max(game.player.inv, 0.8);
    A.play('click');
    if (run.mapNode === 'elite') MP.visit('elite', null, () => game.nextWave());
    else game.nextWave();
    return true;
  };

  // узел меняет саму волну: элита — больше врагов и элита чаще (как опасный путь), тайник — волна полегче
  MP.apply = function (w) {
    const run = game.run;
    w.node = w.boss ? 'boss' : run.mapNode || 'fight';
    run.mapNode = null;
    if (w.node === 'elite') { w.danger = true; w.budget *= D.DANGER.count; }
    if (w.node === 'cache') w.budget *= 0.8;
  };

  // ── награда узла после волны; true — показано окно, волна начнётся после выбора ──
  MP.reward = function (w) {
    const p = game.player;
    if (game.state !== 'play' || !p.alive) return false;
    if (w.node === 'elite') { MP.chestScene(Math.random() < 0.25 ? 'silver' : 'bronze', 'ЭЛИТА ПОВЕРЖЕНА', () => game.nextWave()); return true; }
    // торговец, тайник, ремонт и событие — сначала короткая сцена, награда в её конце
    if (w.node === 'shop' || w.node === 'cache' || w.node === 'repair' || w.node === 'event') {
      const ev = w.node === 'event' ? U.pick(D.MAP_EVENTS) : null;
      MP.visit(w.node, ev, () => { if (!nodeReward(w, ev)) game.nextWave(); });
      return true;
    }
    return false;
  };
  function nodeReward(w, ev) {
    const p = game.player, run = game.run;
    if (w.node === 'shop') {
      const o = game.merchantOffer();
      // вместо реликвии — закрытый сундук (откроется после забега)
      o.cards.splice(o.cards.length - 1, 0, { id: 'chest:silver', ico: G.chestImg('silver'), name: D.CHESTS.silver.name, desc: 'Откроется после забега: реликвия в коллекцию', rar: 'epic', price: Math.round((300 + w.n * 25) * priceCut() / 10) * 10 });
      return show(o);
    }
    if (w.node === 'event') {
      return show({ title: ev.title, sub: ev.sub, cards: ev.cards.map((c) => Object.assign({}, c, { id: 'ev:' + ev.id + ':' + c.id })) });
    }
    if (w.node === 'repair') {
      if (p.lives < p.maxLives) game.heal(Math.min(2, p.maxLives - p.lives), '🔧 РЕМОНТ');
      else if (!p.shield) { p.shield = true; game.shieldFx(); FX.text(p.x, p.y - p.w, '🔧 ЩИТ', '#3dffa2', 15, 1.1); }
      return false;
    }
    if (w.node === 'cache') {
      const coins = Math.round((20 + w.n * 2.5) * game.st.coins / game.coinK);
      run.coins += coins; M.addCoins(coins);
      FX.text(p.x, p.y - p.w, '📦 +' + coins, '#ffc83d', 16, 1.2);
      A.play('coin', { rate: 0.8 });
      if (Math.random() < 0.35) MP.giveChest('bronze');
      game.hudDirty = true;
      return false;
    }
    return false;
  }

  function show(offer) {
    game.state = 'perk';
    game.offerKind = 'event';
    game.offer = offer;
    game.pointer.id = null;
    A.play('skill', { rate: 1.2 });
    SS.emit('eventOffer', offer);
    return true;
  }
  function priceCut() { return (game.skill('sk_scavenger') ? 0.7 : 1) * (game.relic('r_chart') ? 0.75 : 1); }

  // ── 4.1: сундук получен — сразу в сохранение (закрытым), в забеге только счётчик ──
  // Звёздная карта и высокие сложности иногда улучшают сундук на ступень
  MP.giveChest = function (tier, quiet) {
    const run = game.run;
    const up = (game.relic('r_chart') ? 0.3 : 0) + (['nightmare', 'god', 'hell'].includes(game.diffId) ? 0.2 : 0);
    if (tier !== 'gold' && Math.random() < up) tier = D.CHEST_ORDER[D.CHEST_ORDER.indexOf(tier) + 1];
    M.addChest(tier);
    (run.chests || (run.chests = [])).push(tier);
    if (!quiet) {
      A.play('perk', { rate: 0.8 });
      SS.emit('toast', { ico: 'chest', title: 'СУНДУК', text: D.CHESTS[tier].short + ' — откроется после забега', info: true, dur: 2200 });
    }
    SS.emit('chest', tier);
    game.hudDirty = true;
    return tier;
  };
  // сундук босса: первые боссы — серебро, дальше всё чаще золото
  MP.bossChest = function () {
    const n = game.run.bosses;
    return Math.random() < Math.min(0.75, Math.max(0, n - 1) * 0.2) ? 'gold' : 'silver';
  };
  // сцена: сундук падает в кадр, рвётся открыться и улетает в трюм; дальше onEnd
  MP.chestScene = function (tier, cap, onEnd) {
    if (game.state !== 'play') { MP.giveChest(tier); onEnd(); return; }
    tier = MP.giveChest(tier, true);
    const def = D.CHESTS[tier];
    game.startScene({ kind: 'visit', node: 'chest', tier, color: def.color, v: { cap, name: def.short + ' СУНДУК', sub: 'Откроется после забега' }, end: 2.3, cardT: 0.55, onEnd, done: false });
    A.play('teleport', { rate: 1.1, vol: 0.5 });
  };

  // ── реликвия в забеге (4.1 — только взятые из коллекции на старте) ──
  MP.grant = function (id, quiet) {
    const run = game.run, p = game.player, def = D.RELICS[id];
    if (!def || run.relics[id]) return;
    run.relics[id] = 1;
    if (id === 'r_kevlar') { p.maxLives++; p.lives++; }
    if (id === 'r_arsenal') p.bombs = Math.min(9, p.bombs + 2);
    if (id === 'r_glassblade') { p.maxLives = Math.max(1, p.maxLives - 2); p.lives = Math.min(p.lives, p.maxLives); }
    game.refreshStats();
    if (!quiet) {
      FX.glowPuff(p.x, p.y, D.RELIC_RARITY[def.rar].color, 120 * G.S, 0.5);
      FX.ring(p.x, p.y, p.w * 0.4, p.w * 1.8, D.RELIC_RARITY[def.rar].color, 0.5, 4);
      A.play('perk', { rate: 0.9 });
      SS.emit('toast', { ico: def.ico, title: 'РЕЛИКВИЯ', text: def.name, info: true, dur: 2200 });
    }
    game.hudDirty = true;
  };
  // старт забега: реликвии из коллекции (в испытании дня — нет: у всех одинаковые условия)
  MP.startRelics = function () {
    if (game.run.challenge) return;
    for (const id of M.relicLoadout()) MP.grant(id, true);
  };

  // ════════════════════════════════════════════════════════════
  // СЦЕНЫ УЗЛОВ: 2,4 с — что происходит, до окна выбора (тап — пропустить)
  // ════════════════════════════════════════════════════════════
  const VISIT = {
    shop:   { cap: 'УЗЕЛ КАРТЫ', name: 'ТОРГОВЕЦ', sub: 'Лавка пристыковалась — заглянем', color: '#ffc83d' },
    cache:  { cap: 'УЗЕЛ КАРТЫ', name: 'ТАЙНИК', sub: 'Контейнер с добычей', color: '#b06bff' },
    repair: { cap: 'УЗЕЛ КАРТЫ', name: 'РЕМОНТ', sub: 'Ремонтный корабль чинит обшивку', color: '#3dffa2' },
    elite:  { cap: 'ТРЕВОГА', name: 'ЭЛИТНЫЙ ПАТРУЛЬ', sub: 'Врагов больше — награда: реликвия', color: '#ff3d5a' },
  };
  MP.visit = function (node, ev, onEnd) {
    if (game.state !== 'play') { onEnd(); return; }
    const v = node === 'event' ? { cap: 'СОБЫТИЕ', name: ev.title, sub: ev.sub, color: '#7fe7ff' } : VISIT[node];
    game.startScene({ kind: 'visit', node, ev, color: v.color, v, end: 2.4, cardT: 0.35, onEnd, done: false });
    A.play(node === 'elite' ? 'warning' : 'teleport', { rate: node === 'elite' ? 1 : 0.8, vol: 0.6 });
  };
  MP.updateVisit = function (sc) {
    const p = game.player, S = G.S;
    if (!sc.card && sc.t >= sc.cardT) sc.card = { cap: sc.v.cap, name: sc.v.name, sub: sc.v.sub, at: sc.t, y: 0.58 };
    // ремонт и тайник отдают награду прямо в сцене — видно, откуда она
    if (!sc.done && sc.t >= 1.5) {
      sc.done = true;
      if (sc.node === 'repair') { FX.ring(p.x, p.y, p.w * 0.3, p.w * 1.6, '#3dffa2', 0.5, 4); FX.sparks(p.x, p.y, '#3dffa2', 14, 200); }
      if (sc.node === 'cache') { FX.explode(G.FW / 2, G.H * 0.42, 1, '#ffc83d'); FX.ring(G.FW / 2, G.H * 0.42, 10 * S, 90 * S, '#ffc83d', 0.4, 4); }
      if (sc.node === 'elite') FX.vignette('#ff2a48', 1.2, 0.6, true);
    }
    if (sc.node === 'elite' && Math.random() < 0.1) FX.shake(0.05);
    if (sc.node === 'chest') {
      const col = D.CHESTS[sc.tier].color, cy = G.H * 0.36;
      // приземление: удар, искры; потом крышка рвётся открыться; в конце — в трюм
      if (!sc.landed && sc.t >= 0.6) {
        sc.landed = true;
        FX.ring(G.FW / 2, cy + 20 * S, 10 * S, 110 * S, col, 0.45, 4);
        FX.sparks(G.FW / 2, cy + 24 * S, col, 16, 260);
        FX.shake(0.18);
        A.play('mine', { rate: 0.6, vol: 0.45 });
      }
      if (sc.landed && sc.t < 1.6 && Math.random() < 0.25) FX.sparks(G.FW / 2 + U.rand(-40, 40) * S, cy + U.rand(-30, 20) * S, col, 1, 60);
      if (!sc.gone && sc.t >= 1.6) { sc.gone = true; A.play('coin', { rate: 0.7, vol: 0.7 }); }
    }
  };
  // падение с отскоком
  function bounceOut(k) {
    const n = 7.5625, d = 2.75;
    if (k < 1 / d) return n * k * k;
    if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75;
    if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375;
    return n * (k -= 2.625 / d) * k + 0.984375;
  }
  // вращающиеся лучи за наградой
  function rays(ctx, x, y, r, col, t, a, n) {
    n = n || 10;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, G.hexA(col, 0.9)); g.addColorStop(1, G.hexA(col, 0));
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = g;
    ctx.translate(x, y); ctx.rotate(t * 0.5); ctx.translate(-x, -y);
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const a0 = i * U.TAU / n; ctx.moveTo(x, y); ctx.arc(x, y, r, a0, a0 + U.TAU / n * 0.38); ctx.closePath(); }
    ctx.fill();
    ctx.restore();
  }
  MP.rays = rays;
  // актёр сцены в координатах поля
  MP.drawVisit = function (ctx, sc) {
    const S = G.S, t = sc.t, p = game.player, k = Math.min(1, t / 0.9), ease = 1 - Math.pow(1 - k, 3);
    const cx = G.FW / 2;
    ctx.save();
    if (sc.node === 'shop') {
      const y = U.lerp(-120 * S, G.H * 0.36, ease) + Math.sin(t * 2) * 4 * S;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.4;
      ctx.drawImage(G.soft('#ffc83d', 64), cx - 110 * S, y - 110 * S, 220 * S, 220 * S);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      G.draw(ctx, 'p_merchant', cx, y, 130 * S);
    } else if (sc.node === 'repair') {
      const y = U.lerp(-100 * S, p.y - p.w * 1.5, ease) + Math.sin(t * 3) * 3 * S;
      G.draw(ctx, 'p_medship', cx, y, 60 * S, Math.PI);
      if (t > 0.9) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 20); ctx.strokeStyle = '#3dffa2'; ctx.lineWidth = 3 * S; ctx.beginPath(); ctx.moveTo(cx, y + 25 * S); ctx.lineTo(p.x, p.y - p.w * 0.3); ctx.stroke(); }
    } else if (sc.node === 'cache') {
      const y = U.lerp(-60 * S, G.H * 0.42, ease);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45 + 0.2 * Math.sin(t * 8);
      ctx.drawImage(G.soft('#ffc83d', 64), cx - 60 * S, y - 60 * S, 120 * S, 120 * S);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = sc.done ? Math.max(0, 1 - (t - 1.5) * 3) : 1;
      G.draw(ctx, 'p_crate', cx, y, 64 * S, Math.sin(t * 3) * 0.1);
    } else if (sc.node === 'elite') {
      // строй элиты проходит по верху экрана
      for (let i = 0; i < 3; i++) {
        const y = U.lerp(-80 * S, G.H * 0.22, ease) - Math.abs(i - 1) * 30 * S;
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5;
        ctx.drawImage(G.soft('#ff3d5a', 64), cx + (i - 1) * 80 * S - 40 * S, y - 40 * S, 80 * S, 80 * S);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        G.draw(ctx, 'e_heavyfighter', cx + (i - 1) * 80 * S, y, 58 * S, Math.PI);
      }
    } else if (sc.node === 'chest') {
      const col = D.CHESTS[sc.tier].color;
      let x = cx, y = U.lerp(-90 * S, G.H * 0.36, bounceOut(Math.min(1, t / 0.6))), w = 96 * S, a = 1;
      // улетает в трюм — к счётчику сундуков вверху справа
      if (t > 1.6) { const q = U.clamp((t - 1.6) / 0.55, 0, 1), e = q * q; x = U.lerp(cx, G.FW - 34 * S, e); y = U.lerp(G.H * 0.36, 34 * S, e); w *= 1 - 0.75 * e; a = 1 - q * 0.7; }
      ctx.globalCompositeOperation = 'lighter';
      rays(ctx, x, y, w * 1.7, col, t, 0.3 * a * Math.min(1, t * 2));
      ctx.globalAlpha = 0.5 * a; ctx.drawImage(G.soft(col, 64), x - w, y - w, w * 2, w * 2);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
      // крышка подпрыгивает рывками — сундук «просится» открыться
      const jolt = t > 0.75 && t < 1.55 && Math.sin(t * 9) > 0.2 ? Math.abs(Math.sin(t * 40)) : 0;
      const m = G.drawChest(ctx, sc.tier, x + (jolt ? (Math.random() - 0.5) * 3 * S : 0), y, w, 0, jolt);
      if (jolt > 0.1) {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = jolt * 0.9 * a;
        ctx.drawImage(G.glow(col, 64), x - w * 0.55, m.mouth - w * 0.1, w * 1.1, w * 0.2);
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    } else if (sc.node === 'event') {
      const id = sc.ev.id, y = G.H * 0.36, a = Math.min(1, t * 2);
      ctx.globalAlpha = a;
      if (id === 'anomaly' && G.frame('fx_vortex')) { ctx.globalCompositeOperation = 'lighter'; G.draw(ctx, 'fx_vortex', cx, y, 180 * S, t * 2); }
      else if (id === 'wreck' || id === 'distress') {
        G.draw(ctx, 'e_cargo', cx + Math.sin(t * 0.7) * 10 * S, y, 110 * S, 2.4 + t * 0.15);
        if (id === 'distress' && Math.sin(t * 10) > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(G.glow('#ff3d5a', 64), cx - 40 * S, y - 40 * S, 80 * S, 80 * S); }
      } else if (id === 'black') G.draw(ctx, 'p_merchant_s', cx, y + Math.sin(t * 2) * 4 * S, 100 * S);
      else if (id === 'station') G.draw(ctx, 'p_merchant', cx, y, 140 * S, 0.3);
      else {
        ctx.font = Math.round(80 * S) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(sc.ev.ico, cx, y + Math.sin(t * 3) * 5 * S);
      }
    }
    ctx.restore();
  };

  // ── событие на карте: исход выбора ──
  MP.resolve = function (ev, card) {
    const p = game.player, run = game.run;
    const say = (ico, text) => SS.emit('toast', { ico, title: 'СОБЫТИЕ', text, info: true, dur: 2400 });
    if (card === 'pass') return;
    if (ev === 'wreck' && card === 'search') {
      if (Math.random() < 0.6) MP.giveChest('bronze');
      else { run.nextDanger = true; say('⚠️', 'Засада! Следующая волна элитная'); }
    } else if (ev === 'black' && card === 'blood') {
      p.lives = Math.max(1, p.lives - 1);
      FX.flash('#ff3d5a', 0.3); A.play('playerHit', { vol: 0.5 }); SS.emit('playerHit');
      MP.giveChest('gold');
    } else if (ev === 'anomaly' && card === 'enter') {
      if (Math.random() < 0.5) {
        const mods = D.MODULES.filter((m) => game.mod(m.id) < m.max);
        if (mods.length) { const m = U.pick(mods); run.mods[m.id] = (run.mods[m.id] || 0) + 1; run.parts = game.shipParts(run.mods); game.refreshStats(); say(m.ico, 'Аномалия подарила модуль: ' + m.name); }
      } else { p.lives = Math.max(1, p.lives - 1); FX.flash('#b06bff', 0.3); SS.emit('playerHit'); say('🌀', 'Аномалия задела корабль: −1 жизнь'); }
    } else if (ev === 'distress') {
      if (card === 'help') { run.coins += 100; M.addCoins(100); say('🤝', 'Экипаж спасён: +100 монет'); }
      else { MP.giveChest('silver'); run.nextDanger = true; }
    } else if (ev === 'station') {
      if (card === 'fix') game.heal(1, '🏚️ РЕМОНТ');
      else { p.bombs = Math.min(9, p.bombs + 1); run.coins += 50; M.addCoins(50); say('💣', '+1 бомба и 50 монет'); }
    } else if (ev === 'slot' && card === 'play') {
      if (Math.random() < 0.5) { run.coins += 250; M.addCoins(250); A.play('coin', { rate: 1.3 }); say('🎰', 'Джекпот! +250 монет'); }
      else say('🎰', 'Не повезло');
    }
    game.hudDirty = true;
  };
})();
