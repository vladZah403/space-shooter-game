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
    let shops = 0, elites = 0, escorts = 0;
    for (let c = 0; c < STEPS; c++) {
      const col = [];
      for (let r = 0; r < LANES; r++) col.push(c === 0 || Math.random() < 0.8 ? { r } : null);
      if (col.filter(Boolean).length < 2) col[1] = col[1] || { r: 1 };
      for (const n of col) {
        if (!n) continue;
        // лавка и эскорт — не больше одного на сектор, элита — не больше двух
        const types = Object.keys(D.MAP_NODES).filter((t) => (c > 0 || D.MAP_NODES[t].first) && !(t === 'shop' && shops >= 1) && !(t === 'escort' && escorts >= 1) && !(t === 'elite' && elites >= 2));
        n.t = U.pickWeighted(types, (t) => D.MAP_NODES[t].w);
        if (n.t === 'shop') shops++;
        if (n.t === 'escort') escorts++;
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
    if (run.mapNode === 'elite' || run.mapNode === 'escort') MP.visit(run.mapNode, null, () => game.nextWave());
    else game.nextWave();
    return true;
  };

  // узел меняет саму волну: элита — больше врагов и элита чаще (как опасный путь), тайник — волна полегче,
  // эскорт — в волне летит Торговец
  MP.apply = function (w) {
    const run = game.run;
    w.node = w.boss ? 'boss' : run.mapNode || 'fight';
    run.mapNode = null;
    run.escort = null;
    if (w.node === 'elite') { w.danger = true; w.budget *= D.DANGER.count; }
    if (w.node === 'cache') w.budget *= 0.8;
    if (w.node === 'escort') run.escort = { x: G.FW / 2, y: G.H * 0.66, hp: ESCORT.hp, t: 0, cd: 2.5, flash: 0 };
  };

  // ── награда узла после волны; true — показано окно, волна начнётся после выбора ──
  MP.reward = function (w) {
    const p = game.player;
    if (game.state !== 'play' || !p.alive) return false;
    if (w.node === 'escort') return escortDone();
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
      o.cards.splice(o.cards.length - 1, 0, { id: 'chest:silver', ico: G.chestImg('silver'), name: D.CHESTS.silver.name, desc: 'Откроется после забега: реликвия в коллекцию', rar: 'epic', price: Math.round((300 + w.n * 25) * o.cut / 10) * 10 });
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

  // ════════════════════════════════════════════════════════════
  // 4.2: ЭСКОРТ — Торговец идёт через волну снизу вверх, враги по очереди бьют по нему огненными
  //  снарядами. Его ранят только они (пули в игрока пролетают мимо), и их можно сбить своими выстрелами.
  //  Довели живым — скидка в следующей лавке и сундук; сбили — без награды (и без штрафа)
  // ════════════════════════════════════════════════════════════
  const ESCORT = { hp: 10, w: 84, cut: 0.7, shotCd: 2.0 };
  MP.updateEscort = function (dt) {
    const es = game.run && game.run.escort, w = game.wave;
    if (!es || !w) return;
    const S = G.S;
    es.t += dt; es.flash -= dt;
    // поднимается по мере того, как волна выпускает врагов, и покачивается из стороны в сторону
    const k = w.budget > 0 ? U.clamp(w.spent / w.budget, 0, 1) : 1;
    const ty = U.lerp(G.H * 0.66, G.H * 0.3, k), tx = G.FW / 2 + Math.sin(es.t * 0.45) * G.FW * 0.2;
    es.x = U.damp(es.x, tx, 1.2, dt); es.y = U.damp(es.y, ty, 0.8, dt);
    if (game.state !== 'play' || w.intro > 0) return;
    // время от времени кто-то из врагов выше Торговца бьёт по нему
    es.cd -= dt;
    if (es.cd <= 0) {
      es.cd = ESCORT.shotCd * U.rand(0.7, 1.3);
      const shooters = game.enemies.filter((e) => e.alive && e.hittable && !e.def.prop && !e.leaving && e.y > 20 * S && e.y < es.y - 60 * S);
      if (shooters.length) {
        const e = U.pick(shooters), a = Math.atan2(es.y - e.y, es.x - e.x), sp = game.bspd(150);
        game.ebullet(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 'fire', { escort: true });
      }
    }
    // снаряды, летящие в Торговца, сбиваются выстрелами игрока
    for (const b of game.ebullets) {
      if (b.dead || !b.escort) continue;
      for (const pb of game.bullets) {
        if (pb.dead) continue;
        const rr = b.r + (pb.r || 4 * S) + 6 * S;
        if (U.dist2(b.x, b.y, pb.x, pb.y) < rr * rr) { b.dead = true; pb.dead = true; FX.hit(b.x, b.y, '#ffc83d'); FX.text(b.x, b.y - 10 * S, 'СБИТ', '#ffc83d', 11, 0.6, -40); break; }
      }
    }
  };
  // снаряд, пущенный в Торговца, попал в него (из game.updateEBullets); true — снаряд погас
  MP.escortHit = function (b) {
    const run = game.run, es = run && run.escort;
    if (!es || !b.escort) return false;
    const S = G.S;
    if (Math.abs(b.x - es.x) > ESCORT.w * S * 0.42 || Math.abs(b.y - es.y) > ESCORT.w * S * 0.6) return false;
    es.hp--; es.flash = 0.12;
    FX.hit(b.x, b.y, '#ffc83d');
    A.play('shieldHit', { vol: 0.3, rate: 0.8 });
    if (es.hp <= 0) {
      run.escort = null;
      FX.explode(es.x, es.y, 1.6, '#ffc83d'); FX.shake(0.25);
      A.play('explodeL', { vol: 0.7 });
      SS.emit('toast', { ico: '💥', title: 'ЭСКОРТ', text: 'Торговца сбили — награды не будет', info: true, dur: 2600 });
    }
    return true;
  };
  MP.drawEscort = function (ctx) {
    const es = game.run && game.run.escort;
    if (!es) return;
    const S = G.S, w = ESCORT.w * S;
    ctx.save();
    SS.scenes.merchant(ctx, es.x, es.y, w, es.t, { thrust: 0.35 });
    if (es.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6; ctx.drawImage(G.glow('#ff5c3d', 64), es.x - w * 0.6, es.y - w * 0.6, w * 1.2, w * 1.2); }
    ctx.restore();
    // полоска прочности над кораблём
    const bw = w * 0.8, bh = 5 * S, bx = es.x - bw / 2, by = es.y - w * G.aspect('p_merchant') * 0.62 - 10 * S, k = es.hp / ESCORT.hp;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    ctx.fillStyle = k > 0.5 ? '#3dffa2' : k > 0.25 ? '#ffc83d' : '#ff3d5a'; ctx.fillRect(bx, by, bw * k, bh);
  };
  // волна зачищена: Торговец уходит в прыжок, скидка в следующей лавке и сундук
  function escortDone() {
    const run = game.run, es = run.escort, S = G.S;
    run.escort = null;
    if (!es) return false;
    run.shopCut = ESCORT.cut;
    FX.ring(es.x, es.y, 10 * S, 120 * S, '#ffc83d', 0.5, 4); FX.glowPuff(es.x, es.y, '#ffc83d', 140 * S, 0.5);
    A.play('teleport', { rate: 1.2, vol: 0.5 });
    SS.emit('toast', { ico: '🛡', title: 'ЭСКОРТ', text: 'Торговец доставлен: −30% в следующей лавке', info: true, dur: 2600 });
    MP.chestScene(Math.random() < 0.35 ? 'silver' : 'bronze', 'ТОРГОВЕЦ ДОСТАВЛЕН', () => game.nextWave());
    return true;
  }

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
    elite:  { cap: 'ТРЕВОГА', name: 'ЭЛИТНЫЙ ПАТРУЛЬ', sub: 'Врагов больше — награда: сундук', color: '#ff3d5a' },
    escort: { cap: 'УЗЕЛ КАРТЫ', name: 'ЭСКОРТ', sub: 'Доведите Торговца живым — скидка и сундук', color: '#ffc83d' },
  };
  MP.visit = function (node, ev, onEnd) {
    if (game.state !== 'play') { onEnd(); return; }
    const v = node === 'event' ? { cap: 'СОБЫТИЕ', name: ev.title, sub: ev.sub, color: '#7fe7ff' } : VISIT[node];
    game.startScene({ kind: 'visit', node, ev, color: v.color, v, end: node === 'shop' ? 2.7 : 2.4, cardT: 0.35, onEnd, done: false });
    A.play(node === 'elite' ? 'warning' : 'teleport', { rate: node === 'elite' ? 1 : 0.8, vol: 0.6 });
  };
  // анимации сцен — scenes.js
  MP.updateVisit = function (sc) { SS.scenes.update(sc); };
  MP.drawVisit = function (ctx, sc) { SS.scenes.draw(ctx, sc); };
  // вращающиеся лучи за наградой (сундук в бою и при открытии)
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
