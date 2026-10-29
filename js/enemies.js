// ════════════════════════════════════════════════════════════════
// SPACE SHOOTER 2.1 — враги и боссы
//  поведение (ИИ), схемы стрельбы, группы и строи,
//  5 мини-боссов и 13 боссов с тремя фазами атак
// ════════════════════════════════════════════════════════════════
'use strict';

(function () {
  const U = SS.util, D = SS.data;
  let G, FX, A, game;
  let uid = 100000;

  const COLORS = {
    scout: '#ff5c4d', drone: '#5cff7a', lancer: '#c86bff', debris: '#d8c3a5', asteroid: '#c9a27a', shooter: '#c06bff', assault: '#3dffd0', kamikaze: '#ff9f3d', interceptor: '#cfd8ff',
    heavy: '#ffd23d', splitter: '#7dff6b', bomber: '#aab4d8', sniper: '#5cb8ff', shielder: '#7fd8ff', techno: '#ff5c7a',
    hunter: '#b06bff', armored: '#ff9f3d', heavyfighter: '#ff4d5e', bombardier: '#ffb03d', redoubt: '#c48bff', cruiser: '#ff5c7a',
    bug: '#9dff5c', ram: '#ff6a2a', swarm: '#a6ff3d', crystal: '#3dffd2', minelayer: '#ff5c4d', platform: '#ffc83d',
    ghost: '#7ff6ff', orbit: '#ff7a3d', parasite: '#b06bff', ion: '#7fe7ff', crab: '#ff9f3d', biomech: '#ff5cf0',
    gunship: '#ff4d4d', destroyer: '#ff8a3d', cruiser_h: '#ff4d6d', battleship: '#ff6a3d', frigate: '#ffb03d',
    thief: '#ffc83d', medic: '#5cff9d', link: '#ff3d5a', mortar: '#ff8a3d', mirror: '#7ff6ff', projector: '#4cb8ff',
    icebreaker: '#bff4ff', stealth: '#6b7bff', graviton: '#b06bff', mimic: '#ffb03d',
    hive_egg: '#a6ff3d', lava_rock: '#ff6a2a', cargo: '#ff4d4d',
  };

  // стоимость врага в «бюджете» волны
  const COST = { scout: 1, drone: 0.55, shooter: 2, assault: 2, kamikaze: 1.2, interceptor: 2.5, heavy: 5, splitter: 2.2,
    bomber: 4, sniper: 3, shielder: 4.5, techno: 3.5, hunter: 3.5, armored: 8, heavyfighter: 4.5, bombardier: 5, redoubt: 5.5,
    cruiser: 9, bug: 0.5, ram: 2.5, swarm: 4, crystal: 3, minelayer: 4, platform: 5.5, ghost: 3.5, orbit: 4.5, parasite: 4.5,
    ion: 5, crab: 7, biomech: 7, lancer: 4, debris: 0, asteroid: 0, gunship: 0, destroyer: 0, cruiser_h: 0, battleship: 0, frigate: 0,
    thief: 2, medic: 3.5, link: 3, mortar: 5, mirror: 3.5, projector: 4, icebreaker: 7, stealth: 4, graviton: 5, mimic: 5.5,
    hive_egg: 0, lava_rock: 0, cargo: 0 };

  // эллиптические хитбоксы для крупных кораблей (доли ширины/высоты спрайта)
  const HITBOX = {
    boss: [0.4, 0.38], b_spider: [0.3, 0.34], b_battleship: [0.4, 0.43], b_battleship2: [0.4, 0.43],
    b_mothership: [0.45, 0.32], b_heavycruiser: [0.45, 0.32], e_destroyer: [0.38, 0.44], e_cruiser_h: [0.45, 0.3],
    b_sniper: [0.3, 0.42], b_kraken: [0.33, 0.36], b_dread: [0.42, 0.42], b_phoenix: [0.3, 0.36], b_necro: [0.36, 0.38],
    b_queen: [0.4, 0.4], b_inquisitor: [0.38, 0.4], b_chaos: [0.38, 0.38], b_overlord: [0.3, 0.36],
  };

  const E = {
    corpses: [],
    init() { G = SS.gfx; FX = SS.fx; A = SS.audio; game = SS.game; },
  };
  SS.enemies = E;

  // ════════════════════════════════════════════════════════════
  // СОЗДАНИЕ
  // ════════════════════════════════════════════════════════════
  // враги, которые зависают на месте, держатся ниже верхней панели HUD
  function minY(e) { return (SS.ui ? SS.ui.topInset() : 120) + e.h * (e.mini ? 0.5 : 0.35); }

  function setHitbox(e, sprite) {
    const hb = HITBOX[sprite];
    if (hb) { e.rx = e.w * hb[0]; e.ry = e.h * hb[1]; e.r = Math.max(e.rx, e.ry) * 0.9; }
  }

  E.hpScale = function () {
    const w = game.wave ? game.wave.n : 1;
    // после 30-й волны прочность растёт круче: туда доходят только сильные сборки
    return game.diff.hp * (1 + (w - 1) * 0.14) * (1 + Math.max(0, w - 20) * 0.05) * (1 + Math.max(0, w - 30) * 0.06);
  };

  // o: x, y, scale, hpMul, tint, child, noElite, elite, idx, amp, side, larva, sprite
  E.spawn = function (type, o) {
    o = o || {};
    const def = D.ENEMIES[type];
    if (!def) return null;
    const S = G.S, wn = game.wave ? game.wave.n : 1, diff = game.diff;
    const elite = !!o.elite || (!def.mini && !o.noElite && !o.child && Math.random() < diff.elite + Math.max(0, wn - 15) * 0.004 + (game.wave && game.wave.danger ? D.DANGER.elite : 0));
    // в дальних секторах флот противника обновляется — новые облики кораблей
    const sprite = o.sprite || (def.alt && wn > 10 && Math.random() < 0.6 ? def.alt : def.sprite);
    const scale = (elite ? 1.12 : 1) * (o.scale || 1);
    const w = Math.min(def.w * S * scale, def.horizontal ? G.FW * 0.75 : 9999);
    const asp = G.aspect(sprite);
    const hp = def.hp * E.hpScale() * (elite ? 2.2 : 1) * (o.hpMul || 1);
    const e = {
      uid: uid++, type, def, sprite, alive: true, hittable: true, boss: false, mini: !!def.mini, horiz: !!def.horizontal,
      x: o.x !== undefined ? o.x : U.rand(w * 0.6, G.FW - w * 0.6),
      y: o.y !== undefined ? o.y : -w * asp * 0.6,
      vx: 0, vy: 0, w, h: w * asp, r: w * 0.4, rx: 0, ry: 0,
      hp, maxHp: hp, score: def.score, coins: def.coins, xp: def.xp,
      elite, isChild: !!o.child, larva: !!o.larva,
      tint: elite ? { hue: 44, bright: 0.08 } : (o.tint !== undefined ? { hue: o.tint } : def.tint !== undefined ? { hue: def.tint } : null),
      cv: null, age: 0, phase: Math.random() * U.TAU, st: 0, t: 0, n: 0,
      fireT: U.rand(0.9, 1.8), fireT2: U.rand(1.6, 2.8), flash: 0, frozen: 0, alpha: 1, bank: 0, lastX: 0, leaving: false, barrier: 0,
      shield: def.shield ? def.shield * E.hpScale() : 0, shieldMax: def.shield ? def.shield * E.hpScale() : 0, shieldHitT: 0, shieldRegenWait: 0,
      spd: def.spd * S * diff.spd * (1 + Math.min(wn, 30) * 0.01) * (elite ? 1.08 : 1),
      ty: 0, baseX: 0, amp: 0, dir: 0, face: 1, spinAng: undefined,
    };
    if (def.mini) setHitbox(e, sprite);
    // «Сложно» и «Бог войны»: элита со щитом и на 15% быстрее
    if (elite && diff.eliteShield && !def.prop) { e.shield += hp * 0.35; e.shieldMax += hp * 0.35; e.spd *= 1.15; }
    e.lastX = e.x;
    e.baseX = e.x;
    // поведение можно задать при появлении (строи из spawnGroup): o.ai
    e.ai = o.ai || def.ai;
    const init = INIT[e.ai];
    if (init) init(e, o);
    if (e.ty) e.ty = Math.max(e.ty, minY(e));
    game.enemies.push(e);
    if (def.hint) SS.foes.seen(e);
    return e;
  };

  const INIT = {
    dive(e) { e.amp = U.rand(10, 30) * G.S; },
    formation(e, o) { e.idx = o.idx || 0; e.amp = (o.amp !== undefined ? o.amp : 48) * G.S; },
    hover(e) { e.ty = U.rand(0.1, 0.32) * G.H; e.stay = U.rand(9, 13); },
    zigzag(e) { e.vx = U.sign(Math.random() - 0.5) * e.spd * 1.1; e.t = U.rand(0.5, 0.9); },
    kamikaze(e) { e.ty = U.rand(0.1, 0.24) * G.H; },
    dasher(e) { e.ty = U.rand(0.12, 0.38) * G.H; },
    tank(e) { e.ty = U.rand(0.14, 0.3) * G.H; e.stay = U.rand(14, 18); },
    bomber(e, o) {
      const side = o.side || (Math.random() < 0.5 ? -1 : 1);
      e.x = side < 0 ? -e.w * 0.6 : G.FW + e.w * 0.6;
      e.y = o.y !== undefined ? o.y : Math.max(minY(e), U.rand(0.08, 0.32) * G.H);
      e.vx = -side * e.spd;
      e.baseY = e.y;
    },
    sniper(e) { e.ty = U.rand(0.06, 0.16) * G.H; },
    teleport(e) { e.x = U.rand(e.w, G.FW - e.w); e.y = U.rand(minY(e), Math.max(minY(e) + 20, G.H * 0.45)); e.alpha = 0; e.hittable = false; },
    hunter(e) { e.ty = U.rand(0.14, 0.22) * G.H; },
    redoubt(e) { e.ty = U.rand(0.14, 0.3) * G.H; e.stay = U.rand(15, 19); e.cyc = 0; },
    // ── 2.1 ──
    swarm(e, o) { e.idx = o.idx || 0; e.amp = (o.amp !== undefined ? o.amp : 56) * G.S; e.jx = 0; if (e.larva) e.dir = Math.PI / 2; },
    ram(e) { e.ty = U.rand(0.1, 0.2) * G.H; },
    carrier(e) { e.ty = U.rand(0.12, 0.28) * G.H; e.stay = U.rand(12, 15); e.spawnT = 2.4; e.spawned = 0; },
    drift(e) { e.vx = U.rand(-32, 32) * G.S; e.spinAng = Math.random() * U.TAU; e.spin = U.rand(0.6, 1.2) * U.sign(Math.random() - 0.5); },
    turret(e) { e.ty = U.rand(0.14, 0.28) * G.H; e.stay = U.rand(14, 17); e.spinAng = 0; e.cyc = 1.4; e.on = false; e.shotT = 0; },
    phase(e) { e.ty = U.rand(0.12, 0.3) * G.H; },
    orbit(e) {
      e.ax = U.rand(0.25, 0.75) * G.FW; e.ay = U.rand(0.18, 0.32) * G.H;
      e.R = U.rand(50, 80) * G.S; e.ang = -Math.PI / 2; e.w0 = (Math.random() < 0.5 ? -1 : 1) * 1.4; e.stay = 16;
      e.x = e.ax; e.spinAng = 0;
    },
    ion(e) { e.ty = U.rand(0.12, 0.26) * G.H; e.stay = U.rand(13, 16); e.chargeT = U.rand(1.6, 2.4); },
    crab(e) { e.ty = U.rand(0.16, 0.3) * G.H; e.stay = U.rand(15, 18); e.dirx = Math.random() < 0.5 ? -1 : 1; e.stepT = 0.7; e.walking = false; e.volley = 0; },
    gunship(e) { e.ty = 0.17 * G.H; e.x = G.FW / 2; e.vx = e.spd * 0.6; e.pat = 0; e.patT = 2; },
    destroyer(e) { e.ty = 0.16 * G.H; e.x = G.FW / 2; e.vx = e.spd * 0.5; e.pat = 0; e.patT = 2.2; },
    battleship(e) { e.ty = 0.16 * G.H; e.x = G.FW / 2; e.vx = e.spd * 0.5; e.pat = 0; e.patT = 2.4; },
    frigate(e) { e.ty = 0.18 * G.H; e.x = G.FW / 2; e.vx = e.spd * 0.7; e.pat = 0; e.patT = 2.0; e.run = 0; },
    // ── 3.0: строи и манёвры ──
    // проход по горизонтали: входит сбоку на своей высоте и стреляет вниз
    sweep(e, o) {
      const side = o.side || 1;
      e.x = side < 0 ? G.FW + e.w * 0.6 : -e.w * 0.6;
      e.y = e.baseY = o.y !== undefined ? o.y : U.rand(0.18, 0.4) * G.H;
      e.vx = (side < 0 ? -1 : 1) * e.spd * 1.05;
      e.fireT = U.rand(0.4, 1.0);
    },
    // пикировщик: занимает место наверху, по очереди пикирует на корабль и возвращается
    diver(e, o) { e.ty = o.ty || U.rand(0.12, 0.2) * G.H; e.slotX = e.x; e.t = o.delay || U.rand(0.8, 2.4); e.n = 0; },
    // фланг: заходит снизу из угла и уходит вверх, стреляя по кораблю
    flank(e, o) {
      const side = o.side || 1;
      e.x = side < 0 ? -e.w * 0.4 : G.FW + e.w * 0.4;
      e.y = G.H + e.h;
      e.dir = Math.atan2(-G.H * 0.9, (side < 0 ? 1 : -1) * G.FW * 0.55);
      e.fireT = 0.6; e.n = 0;
    },
    flyby(e) {
      e.face = Math.random() < 0.5 ? 1 : -1;
      e.x = e.face > 0 ? -e.w * 0.55 : G.FW + e.w * 0.55;
      e.ty = Math.max(minY(e), G.H * 0.16);
      e.y = e.ty;
      e.vx = e.face * e.spd;
      e.passes = 0; e.broadT = 0.6; e.misT = 1.5;
    },
  };

  // новые враги первые две волны после появления встречаются чаще, дешёвые — со временем реже
  function weightOf(k, wn) {
    const d = D.ENEMIES[k];
    let w = d.weight;
    if (wn - d.wave <= 1 && d.wave > 2) w *= 1.4;
    if (COST[k] <= 2.2) w *= Math.max(0.3, 1 - (wn - d.wave) * 0.03);
    return w;
  }

  // группы и строи
  E.spawnGroup = function (wn, budgetLeft) {
    const pool = Object.keys(D.ENEMIES).filter((k) => {
      const d = D.ENEMIES[k];
      return d.weight > 0 && d.wave <= wn && COST[k] <= Math.max(budgetLeft, 1.2);
    });
    if (!pool.length) return 1;
    const type = U.pickWeighted(pool, (k) => weightOf(k, wn));
    const S = G.S, FW = G.FW;
    let cost = 0;
    if (type === 'drone') {
      // V-строй или линия дронов
      const n = U.randi(4, Math.min(7, 4 + Math.floor(wn / 4)));
      const cx = U.rand(0.25, 0.75) * FW;
      const vee = Math.random() < 0.6;
      for (let i = 0; i < n; i++) {
        const off = i - (n - 1) / 2;
        E.spawn('drone', { x: U.clamp(cx + off * 34 * S, 20 * S, FW - 20 * S), y: -30 * S - (vee ? Math.abs(off) * 26 * S : i * 30 * S), idx: i, amp: vee ? 26 : 50 });
      }
      cost = n * COST.drone;
    } else if (type === 'bug') {
      // рой жуков
      const n = U.randi(5, Math.min(9, 5 + Math.floor(wn / 6)));
      const cx = U.rand(0.3, 0.7) * FW;
      for (let i = 0; i < n; i++) E.spawn('bug', { x: U.clamp(cx + U.rand(-50, 50) * S, 20 * S, FW - 20 * S), y: -24 * S - i * 18 * S, idx: i });
      cost = n * COST.bug;
    } else if (type === 'scout' && Math.random() < (wn >= 2 ? 0.45 : 0.3)) {
      // линия разведчиков
      const n = U.randi(3, Math.min(5, 3 + Math.floor(wn / 5)));
      const gap = Math.min(64 * S, (FW - 60 * S) / n);
      const x0 = U.rand(30 * S, FW - 30 * S - gap * (n - 1));
      for (let i = 0; i < n; i++) E.spawn('scout', { x: x0 + i * gap, y: -40 * S - (i % 2) * 22 * S });
      cost = n * COST.scout;
    } else if ((type === 'shooter' || type === 'assault' || type === 'heavyfighter') && wn >= 6 && Math.random() < 0.35) {
      // пара по краям
      E.spawn(type, { x: FW * 0.22 }); E.spawn(type, { x: FW * 0.78 });
      cost = COST[type] * 2;
    } else if (type === 'ram' && wn >= 12 && Math.random() < 0.4) {
      // два тарана с разных сторон
      E.spawn('ram', { x: FW * 0.25 }); E.spawn('ram', { x: FW * 0.75 });
      cost = COST.ram * 2;
    } else if ((type === 'scout' || type === 'shooter') && wn >= 5 && Math.random() < 0.3) {
      // клещи: две тройки заходят с боков на разной высоте и проходят экран, стреляя вниз
      const n = wn >= 14 ? 4 : 3;
      for (const side of [-1, 1]) {
        const y = (side < 0 ? 0.2 : 0.32) * G.H;
        for (let i = 0; i < n; i++) E.spawn(type, { ai: 'sweep', side, y: y + i * 4 * S }).x -= side * i * 46 * S;
      }
      cost = COST[type] * n * 2 * 0.8;
    } else if ((type === 'interceptor' || type === 'assault') && wn >= 8 && Math.random() < 0.35) {
      // эскадрилья пикировщиков: занимает строй наверху и по очереди пикирует на корабль
      const n = wn >= 16 ? 4 : 3, gap = Math.min(70 * S, (FW - 80 * S) / n);
      const x0 = FW / 2 - gap * (n - 1) / 2;
      for (let i = 0; i < n; i++) E.spawn(type, { ai: 'diver', x: x0 + i * gap, y: -40 * S - i * 20 * S, delay: 1.4 + i * 1.1 });
      cost = COST[type] * n;
    } else if (type === 'interceptor' && wn >= 12 && Math.random() < 0.3) {
      // фланг: пара заходит снизу из углов — с предупреждением у края экрана
      for (const side of [-1, 1]) {
        const x = side < 0 ? 16 * S : FW - 16 * S;
        FX.sprite('fx_warn', x, G.H * 0.88, { w0: 26 * S, w1: 30 * S, dur: 1.0, hold: 0.8 });
        game.after(0.9, () => E.spawn('interceptor', { ai: 'flank', side }));
      }
      A.play('warning', { vol: 0.35, rate: 1.4 });
      cost = COST.interceptor * 2;
    } else if (type === 'link') {
      // Связка всегда парой: луч между кораблями
      cost = SS.foes.spawnLink();
    } else if (type === 'drone' && wn >= 10 && Math.random() < 0.3) {
      // стена дронов во всю ширину с одним проходом
      const step = 40 * S, n = Math.floor((FW - 20 * S) / step), hole = U.randi(1, n - 2);
      for (let i = 0; i < n; i++) if (i !== hole) E.spawn('drone', { x: 20 * S + step / 2 + i * step, y: -30 * S, idx: i, amp: 0 });
      cost = (n - 1) * COST.drone * 0.7;
    } else {
      E.spawn(type);
      cost = COST[type];
    }
    return Math.max(cost, 0.5);
  };

  // мини-боссы по очереди: Ганшип → Эсминец → Рейдер → Линкор → Ракетный фрегат
  E.spawnMini = function (wn) {
    const order = D.MINI_ORDER;
    const k = Math.max(0, Math.floor((wn - 8) / 5)) % order.length;
    // большие мини-боссы лежат в позднем атласе: пока он качается, волна обходится без мини-босса
    const mf = G.frame(D.ENEMIES[order[k]].sprite);
    if (mf && mf[5] && !G.img2) return null;
    const e = E.spawn(order[k], { x: G.FW / 2 });
    if (e) SS.emit('toast', { ico: '⚠️', title: 'МИНИ-БОСС', text: e.def.name + ' приближается!', info: true, dur: 1800 });
    return e;
  };

  E.split = function (e) {
    const S = G.S;
    for (const side of [-1, 1]) {
      const c = E.spawn('drone', { x: e.x + side * 14 * S, y: e.y, child: true, hpMul: 0.8, amp: 0 });
      if (c) { c.vx = side * 120 * S; c.splitVx = side * 120 * S; }
    }
  };

  // выводок жуков (рой, паразит, королева, кракен); личинки ползут к игроку
  function brood(x, y, n, larva, spread) {
    const S = G.S;
    for (let i = 0; i < n; i++) {
      E.spawn('bug', { x: U.clamp(x + (i - (n - 1) / 2) * (spread || 16) * S, 16 * S, G.FW - 16 * S), y: y + U.rand(-6, 6) * S, child: true, noElite: true, idx: i, amp: 30, larva, hpMul: larva ? 0.7 : 1 });
    }
  }

  // ════════════════════════════════════════════════════════════
  // СТРЕЛЬБА
  // ════════════════════════════════════════════════════════════
  function fireRate() {
    return game.diff.fire * (1 + Math.min(game.threatWave(), 40) * 0.015);
  }
  function canShoot(e) {
    return game.player.alive && e.y > 10 && e.y < G.H * 0.78 && !e.leaving && e.alpha > 0.5 && e.x > -10 && e.x < G.FW + 10;
  }
  function doFire(e, f) {
    const S = G.S, k = f.kind, mx = e.x, my = e.y + e.h * 0.32;
    if (k === 'aimed') game.aimAt(mx, my, f.spd, f.bullet);
    else if (k === 'aimed3') { for (const a of [-0.17, 0, 0.17]) game.aimAt(mx, my, f.spd, f.bullet, a); }
    else if (k === 'burst') { for (let i = 0; i < f.count; i++) game.after(i * 0.12, () => { if (e.alive && canShoot(e)) game.aimAt(e.x, e.y + e.h * 0.32, f.spd, f.bullet, U.rand(-0.05, 0.05)); }); }
    else if (k === 'fan') {
      const p = game.player, base = f.down ? Math.PI / 2 : Math.atan2(p.y - my, p.x - mx);
      for (let i = 0; i < f.count; i++) { const a = base + (i / (f.count - 1) - 0.5) * f.spread; const s = game.bspd(f.spd); game.ebullet(mx, my, Math.cos(a) * s, Math.sin(a) * s, f.bullet); }
    } else if (k === 'ring') {
      const s = game.bspd(f.spd);
      for (let i = 0; i < f.count; i++) { const a = i / f.count * U.TAU + e.age; game.ebullet(e.x, e.y, Math.cos(a) * s, Math.sin(a) * s, f.bullet); }
    } else if (k === 'twin') { for (const sd of [-1, 1]) game.aimAt(e.x + sd * e.w * 0.28, my, f.spd, f.bullet); }
    else if (k === 'pincer') {
      // клешни: пары снарядов сходятся в точке игрока
      for (const sd of [-1, 1]) game.aimAt(e.x + sd * e.w * 0.42, e.y + e.h * 0.2, f.spd, f.bullet);
      for (const sd of [-1, 1]) game.aimAt(e.x + sd * e.w * 0.42, e.y + e.h * 0.2, f.spd * 0.8, f.bullet, -sd * 0.18);
    } else if (k === 'mine') { game.ebullet(e.x, e.y + e.h * 0.1, e.vx * 0.2, 50 * S, 'mine', e.elite ? { fuse: 1.9, life: 6, sprite: 'fx_mine2', w: 30, r: 10 } : { fuse: 1.9, life: 6 }); A.play('mine'); return; }
    else if (NEW_FIRE[k]) { NEW_FIRE[k](e, f, mx, my); }
    A.play('enemyShot');
  }

  // ── 3.0: новые атаки (свободные функции — их же берут боссы в bossPattern) ──
  const NEW_FIRE = {
    // спираль: два рукава пуль закручиваются за ~1 с
    spiral(e, f) {
      const n = f.count || 14, dir = e.uid % 2 ? 1 : -1, a0 = Math.random() * U.TAU;
      for (let i = 0; i < n; i++) {
        game.after(i * 0.07, () => {
          if (!e.alive || !canShoot(e)) return;
          const s = game.bspd(f.spd);
          for (const arm of [0, Math.PI]) { const a = a0 + arm + dir * i * 0.38; game.ebullet(e.x, e.y, Math.cos(a) * s, Math.sin(a) * s, f.bullet); }
        });
      }
    },
    // стена с проходом: ряд пуль во всю ширину, проход рядом с кораблём (но не ровно над ним)
    wall(e, f) {
      const S = G.S, step = 26 * S, gap = 74 * S, p = game.player;
      const gx = U.clamp(p.x + U.rand(-90, 90) * S, gap, G.FW - gap), s = game.bspd(f.spd);
      for (let x = step / 2; x < G.FW; x += step) if (Math.abs(x - gx) > gap / 2) game.ebullet(x, e.y + e.h * 0.3, 0, s, f.bullet);
      FX.ring(gx, e.y + e.h * 0.3, 4, gap / 2, '#ffd23d', 0.3, 2);
    },
    // делящаяся: крупный медленный шар через секунду лопается веером
    split(e, f, mx, my) {
      const sh = game.aimAt(mx, my, f.spd, f.bullet || 'egg', 0, { fuse: 1.0, burst: { n: f.count || 7, spd: 150, type: 'dot' } });
      if (sh) sh.w *= 1.3;
    },
    // волна: пара снарядов в противофазе виляет по пути к кораблю
    sine(e, f, mx, my) {
      for (const ph of [0, Math.PI]) game.aimAt(mx, my, f.spd, f.bullet, 0, { sine: { amp: 26 * G.S, f: 7, ph } });
    },
  };
  E.NEW_FIRE = NEW_FIRE;
  function tickFire(e, dt) {
    const f = e.def.fire;
    if (f && f.cd && !(f.from && game.threatWave() < f.from)) {
      e.fireT -= dt;
      if (e.fireT <= 0) {
        e.fireT = f.cd / fireRate() * U.rand(0.8, 1.2) * (e.elite ? 0.75 : 1);
        if (canShoot(e)) doFire(e, f);
      }
    }
    // второе орудие у тяжёлых кораблей
    const f2 = e.def.fire2;
    if (f2 && !(f2.from && game.threatWave() < f2.from)) {
      e.fireT2 -= dt;
      if (e.fireT2 <= 0) {
        e.fireT2 = f2.cd / fireRate() * U.rand(0.85, 1.15);
        if (canShoot(e)) doFire(e, f2);
      }
    }
  }
  // вертикальный луч с предупреждением; если владелец погиб до выстрела — луч гаснет
  function beam(x, y0, w, warn, dur, color, owner) {
    game.ov.beams.push({ x, y0, w, warn, dur, t: 0, color, hitDone: false, owner: owner || null });
  }

  // ════════════════════════════════════════════════════════════
  // ПОВЕДЕНИЕ
  // ════════════════════════════════════════════════════════════
  function leave(e, dt) { e.leaving = true; e.y += e.spd * 1.4 * dt; }
  function strafe(e, dt, k) {
    e.x += e.vx * dt;
    const m = e.w * (k || 0.6);
    if (e.x < m || e.x > G.FW - m) { e.vx = -e.vx; e.x = U.clamp(e.x, m, G.FW - m); }
  }
  // уклонение (с 6-й волны): враг замечает, что корабль под ним, и уходит с линии огня; реакция не мгновенная
  function dodge(e, dt) {
    if (!game.wave || game.threatWave() < 6 || !e.vx) return;
    if (e.vxBase === undefined) e.vxBase = Math.abs(e.vx);
    e.vx = U.sign(e.vx) * U.damp(Math.abs(e.vx), e.vxBase, 1.4, dt);
    e.dodgeCd = (e.dodgeCd === undefined ? U.rand(0.6, 1.6) : e.dodgeCd) - dt;
    const p = game.player;
    if (e.dodgeCd > 0 || !p.alive || p.y < e.y || Math.abs(p.x - e.x) > e.w * 0.65) return;
    const away = U.sign(e.x - p.x) || 1;
    // у края уходить некуда — уклоняется в другую сторону
    const dir = (away > 0 && e.x > G.FW - e.w * 1.4) || (away < 0 && e.x < e.w * 1.4) ? -away : away;
    e.vx = dir * e.vxBase * 2.6;
    e.dodgeCd = U.rand(1.3, 2.4) * (e.elite ? 0.6 : 1);
  }
  function arrive(e, dt, k) {
    e.y = U.damp(e.y, e.ty, k || 2.2, dt) + 10 * G.S * dt;
    return e.y >= e.ty - 6 * G.S;
  }

  const AI = {
    dive(e, dt) {
      e.y += e.spd * dt;
      e.x = U.clamp(e.baseX + Math.sin(e.age * 1.7 + e.phase) * e.amp, e.w * 0.5, G.FW - e.w * 0.5);
      tickFire(e, dt);
    },
    formation(e, dt) {
      e.y += e.spd * dt;
      if (e.splitVx) { e.baseX += e.splitVx * dt; e.splitVx *= Math.exp(-1.5 * dt); }
      e.x = U.clamp(e.baseX + Math.sin(e.age * 2.2 + e.idx * 0.7) * e.amp, e.w * 0.5, G.FW - e.w * 0.5);
    },
    hover(e, dt) {
      if (e.st === 0) {
        if (arrive(e, dt)) { e.st = 1; e.vx = U.sign(Math.random() - 0.5) * e.spd * 0.55; }
      } else if (e.st === 1) {
        e.t += dt;
        dodge(e, dt);
        strafe(e, dt);
        e.y = e.ty + Math.sin(e.age * 1.5 + e.phase) * 6 * G.S;
        tickFire(e, dt);
        if (e.t > e.stay) e.st = 2;
      } else leave(e, dt);
      // восстановление щита
      if (e.shieldMax > 0 && e.shield < e.shieldMax) {
        e.shieldRegenWait -= dt;
        if (e.shieldRegenWait <= 0) e.shield = Math.min(e.shieldMax, e.shield + e.shieldMax * 0.25 * dt);
      }
    },
    zigzag(e, dt) {
      e.y += e.spd * 0.72 * dt;
      e.x += e.vx * dt;
      e.t -= dt;
      if (e.t <= 0 || e.x < e.w * 0.55 || e.x > G.FW - e.w * 0.55) { e.vx = -e.vx; e.t = U.rand(0.5, 0.9); e.x = U.clamp(e.x, e.w * 0.55, G.FW - e.w * 0.55); }
      tickFire(e, dt);
    },
    kamikaze(e, dt) {
      const p = game.player, S = G.S;
      if (e.st === 0) {
        e.y = U.damp(e.y, e.ty, 2.5, dt) + 10 * S * dt;
        e.x = U.damp(e.x, p.x, 0.8, dt);
        e.t += dt;
        if (e.t > 0.9) { e.st = 1; e.t = 0.45; A.play('mine', { rate: 0.7 }); }
      } else if (e.st === 1) {
        e.t -= dt;
        e.dir = Math.atan2(p.y - e.y, p.x - e.x);
        if (e.t <= 0) { e.st = 2; e.v = e.spd; }
      } else {
        e.v = Math.min(560 * S * game.diff.spd, e.v + 1100 * S * dt);
        e.x += Math.cos(e.dir) * e.v * dt; e.y += Math.sin(e.dir) * e.v * dt;
        if (Math.random() < 0.6) FX.glowPuff(e.x - Math.cos(e.dir) * e.h * 0.4, e.y - Math.sin(e.dir) * e.h * 0.4, '#ff9f3d', 18 * S, 0.2);
        if (e.y > G.H + e.h || e.x < -e.w || e.x > G.FW + e.w) e.leaving = true;
      }
    },
    dasher(e, dt) {
      const p = game.player, S = G.S;
      if (e.st === 0) {
        if (arrive(e, dt, 2.4)) { e.st = 1; e.t = 0.5; }
      } else if (e.st === 1) {
        e.t -= dt;
        if (e.t <= 0) {
          const dir = U.sign(p.x - e.x);
          e.vx = dir * e.spd * 4.6;
          e.target = U.clamp(p.x + dir * 70 * S, e.w * 0.6, G.FW - e.w * 0.6);
          e.st = 2;
        }
      } else if (e.st === 2) {
        e.x += e.vx * dt;
        if (Math.random() < 0.5) FX.glowPuff(e.x - U.sign(e.vx) * e.w * 0.4, e.y, '#9fb4ff', 16 * S, 0.18);
        const done = (e.vx > 0 && e.x >= e.target) || (e.vx < 0 && e.x <= e.target) || e.x < e.w * 0.6 || e.x > G.FW - e.w * 0.6;
        if (done) {
          e.x = U.clamp(e.x, e.w * 0.6, G.FW - e.w * 0.6);
          e.vx = 0; e.n++;
          if (canShoot(e)) doFire(e, e.def.fire);
          if (e.n >= 3) e.st = 3; else { e.st = 1; e.t = 0.65; }
        }
      } else leave(e, dt);
    },
    tank(e, dt) {
      if (e.st === 0) {
        if (arrive(e, dt, 1.2)) { e.st = 1; e.vx = U.sign(Math.random() - 0.5) * e.spd * 0.6; }
      } else if (e.st === 1) {
        e.t += dt;
        dodge(e, dt);
        strafe(e, dt);
        e.y = e.ty + Math.sin(e.age + e.phase) * 5 * G.S;
        if (e.t > e.stay) e.st = 2;
      } else leave(e, dt);
      tickFire(e, dt);
    },
    // ── 3.0 ──
    sweep(e, dt) {
      e.x += e.vx * dt;
      e.y = e.baseY + Math.sin(e.age * 2.2) * 14 * G.S;
      tickFire(e, dt);
      if ((e.vx > 0 && e.x > G.FW + e.w) || (e.vx < 0 && e.x < -e.w)) { e.leaving = true; e.alive = false; }
    },
    diver(e, dt) {
      const p = game.player, S = G.S;
      if (e.st === 0) {
        // встаёт на своё место в строю и ждёт очереди
        e.y = U.damp(e.y, e.ty, 2.4, dt); e.x = U.damp(e.x, e.slotX, 2.4, dt);
        e.t -= dt;
        if (e.t <= 0 && e.y > e.ty - 10 * S) { e.st = 1; e.t = 0.45; A.play('mine', { rate: 1.3, vol: 0.5 }); }
      } else if (e.st === 1) {
        // замах: чуть приподнимается и вздрагивает — предупреждение
        e.t -= dt; e.y -= 30 * S * dt; e.x += Math.sin(e.age * 40) * 30 * S * dt;
        if (e.t <= 0) { e.st = 2; e.v = e.spd * 1.2; e.dir = Math.atan2(p.y - e.y, p.x - e.x); e.shot = false; }
      } else if (e.st === 2) {
        // пике по дуге: курс доворачивает к кораблю, на полпути — выстрел
        const want = Math.atan2(p.y - e.y, p.x - e.x);
        e.dir += U.clamp(U.angleDiff(e.dir, want), -1.6 * dt, 1.6 * dt);
        e.v = Math.min(470 * S * game.diff.spd, e.v + 700 * S * dt);
        e.x += Math.cos(e.dir) * e.v * dt; e.y += Math.sin(e.dir) * e.v * dt;
        if (!e.shot && e.y > G.H * 0.35 && canShoot(e)) { e.shot = true; doFire(e, e.def.fire || { kind: 'aimed', bullet: 'orb', spd: 230 }); }
        if (e.y > G.H + e.h) { e.n++; if (e.n >= 2) { e.alive = false; e.leaving = true; return; } e.y = -e.h; e.st = 0; e.t = U.rand(1.2, 2.6); }
      }
    },
    flank(e, dt) {
      const S = G.S;
      e.x += Math.cos(e.dir) * e.spd * 1.7 * dt; e.y += Math.sin(e.dir) * e.spd * 1.7 * dt;
      if (Math.random() < 0.4) FX.glowPuff(e.x - Math.cos(e.dir) * e.h * 0.4, e.y - Math.sin(e.dir) * e.h * 0.4, '#9fb4ff', 14 * S, 0.18);
      e.fireT -= dt;
      if (e.fireT <= 0 && e.n < 3 && e.y < G.H * 0.85) { e.fireT = 0.55; e.n++; if (game.player.alive) game.aimAt(e.x, e.y, 250, 'bolt'); A.play('enemyShot'); }
      if (e.y < -e.h) { e.leaving = true; e.alive = false; }
    },
    bomber(e, dt) {
      e.x += e.vx * dt;
      e.y = e.baseY + Math.sin(e.age * (e.def.weave ? 1.3 : 1.8)) * (e.def.weave || 10) * G.S;
      tickFire(e, dt);
      if ((e.vx > 0 && e.x > G.FW + e.w) || (e.vx < 0 && e.x < -e.w)) { e.leaving = true; e.alive = false; }
    },
    sniper(e, dt) {
      const p = game.player, S = G.S, f = e.def.fire;
      if (e.st === 0) {
        if (arrive(e, dt, 2)) { e.st = 1; e.t = 1.2; }
      } else if (e.st === 1) {
        e.t -= dt;
        e.aim = Math.atan2(p.y - e.y, p.x - e.x);
        p.lockT = 2.5; // корабль в прицеле снайпера
        if (e.t <= 0) { e.st = 2; e.t = 0.3; }
      } else if (e.st === 2) {
        e.t -= dt;
        p.lockT = 2.5; p.lockHot = 0.35;
        if (e.t <= 0) {
          if (canShoot(e)) {
            const s = game.bspd(f.spd);
            game.ebullet(e.x, e.y + e.h * 0.3, Math.cos(e.aim) * s, Math.sin(e.aim) * s, f.bullet);
            A.play('laser', { rate: 0.6, vol: 0.8 });
          }
          e.n++;
          if (e.n >= 3) e.st = 3; else { e.st = 1; e.t = f.cd / fireRate(); }
        }
      } else leave(e, dt);
    },
    teleport(e, dt) {
      const S = G.S;
      if (e.st === 0) {
        e.alpha = Math.min(1, e.alpha + dt * 3.2);
        e.hittable = e.alpha > 0.4;
        if (e.alpha >= 1) { e.st = 1; e.t = 0.35; }
      } else if (e.st === 1) {
        e.t -= dt;
        if (e.t <= 0) { if (canShoot(e)) doFire(e, e.def.fire); e.st = 2; e.t = 1.4; }
      } else if (e.st === 2) {
        e.t -= dt;
        e.y += Math.sin(e.age * 2) * 6 * S * dt;
        if (e.t <= 0) e.st = 3;
      } else {
        e.alpha = Math.max(0, e.alpha - dt * 3.2);
        e.hittable = e.alpha > 0.4;
        if (e.alpha <= 0) {
          e.n++;
          if (e.n >= 4) { e.leaving = true; e.alive = false; return; }
          FX.glowPuff(e.x, e.y, '#ff5c7a', 50 * S, 0.3);
          FX.portal(e.x, e.y, e.w * 1.1, '#ff5c7a', false);
          e.x = U.rand(e.w, G.FW - e.w); e.y = U.rand(minY(e), Math.max(minY(e) + 20, G.H * 0.45));
          FX.glowPuff(e.x, e.y, '#ff5c7a', 60 * S, 0.35);
          FX.portal(e.x, e.y, e.w * 1.1, '#ff5c7a', true);
          A.play('teleport', { vol: 0.5 });
          e.st = 0;
        }
      }
    },
    hunter(e, dt) {
      const p = game.player, S = G.S;
      if (e.st === 0) {
        e.y = U.damp(e.y, e.ty, 2.2, dt) + 8 * S * dt;
        e.x = U.damp(e.x, p.x, 2.4, dt);
        e.t += dt;
        if (e.t > 1.3) { e.st = 1; e.t = 0.38; }
      } else if (e.st === 1) {
        e.t -= dt;
        e.dir = Math.atan2(p.y - e.y, p.x - e.x);
        if (e.t <= 0) { e.st = 2; e.v = 120 * S; }
      } else {
        e.v = Math.min(600 * S * game.diff.spd, e.v + 1300 * S * dt);
        e.x += Math.cos(e.dir) * e.v * dt; e.y += Math.sin(e.dir) * e.v * dt;
        if (Math.random() < 0.6) FX.glowPuff(e.x, e.y - e.h * 0.3, '#b06bff', 20 * S, 0.2);
        if (e.y > G.H + e.h || e.x < -e.w || e.x > G.FW + e.w) {
          e.n++;
          if (e.n >= 3) { e.leaving = true; e.alive = false; return; }
          e.y = -e.h; e.x = U.rand(e.w, G.FW - e.w); e.st = 0; e.t = 0;
        }
      }
    },
    // Редут: периодически поднимает энергобарьер (неуязвим), без барьера бьёт кольцом
    redoubt(e, dt) {
      if (e.st === 0) {
        if (arrive(e, dt, 1.6)) { e.st = 1; e.vx = U.sign(Math.random() - 0.5) * e.spd * 0.5; e.barrier = 1.6; }
      } else if (e.st === 1) {
        e.t += dt;
        strafe(e, dt);
        e.y = e.ty + Math.sin(e.age * 1.2 + e.phase) * 5 * G.S;
        if (e.barrier > 0) {
          e.barrier -= dt;
          if (e.barrier <= 0) { e.cyc = 2.6; if (canShoot(e)) doFire(e, e.def.fire); }
        } else {
          e.cyc -= dt;
          if (e.cyc <= 0) { e.barrier = 1.8; A.play('shieldHit', { vol: 0.4, rate: 1.3 }); }
        }
        if (e.t > e.stay) { e.st = 2; e.barrier = 0; }
      } else leave(e, dt);
    },
    // Жук-дрон: рой с рывками; личинка паразита медленно ползёт к игроку
    swarm(e, dt) {
      const S = G.S, p = game.player;
      if (e.larva) {
        const want = Math.atan2(p.y - e.y, p.x - e.x);
        e.dir += U.clamp(U.angleDiff(e.dir, want), -1.6 * dt, 1.6 * dt);
        const v = e.spd * 0.62;
        e.x += Math.cos(e.dir) * v * dt; e.y += Math.sin(e.dir) * v * dt;
        if (e.age > 9 || e.y > G.H + e.h) { e.leaving = true; e.alive = false; }
        return;
      }
      e.y += e.spd * 0.85 * dt;
      e.jx = U.damp(e.jx, U.rand(-1, 1) * 26 * S, 3, dt);
      e.x = U.clamp(e.baseX + Math.sin(e.age * 3.1 + e.idx * 0.8) * e.amp + e.jx, e.w * 0.5, G.FW - e.w * 0.5);
    },
    // Таран: целится, показывает полосу удара и проносится вниз
    ram(e, dt) {
      const p = game.player, S = G.S;
      if (e.st === 0) {
        if (arrive(e, dt, 2.4)) { e.st = 1; e.t = 0.8; }
      } else if (e.st === 1) {
        e.t -= dt;
        e.x = U.damp(e.x, U.clamp(p.x, e.w * 0.5, G.FW - e.w * 0.5), 2.2, dt);
        if (e.t <= 0) { e.st = 2; e.t = 0.75; e.lane = e.x; A.play('railCharge', { vol: 0.3, rate: 1.6 }); }
      } else if (e.st === 2) {
        e.t -= dt;
        e.x = e.lane + U.rand(-2, 2) * S;
        if (e.t <= 0) { e.st = 3; e.v = e.spd; e.x = e.lane; }
      } else {
        e.v = Math.min(900 * S * game.diff.spd, e.v + 1800 * S * dt);
        e.y += e.v * dt;
        if (Math.random() < 0.8) FX.glowPuff(e.x + U.rand(-0.3, 0.3) * e.w, e.y - e.h * 0.5, '#ff9f3d', 18 * S, 0.22);
        if (e.y > G.H + e.h) {
          e.n++;
          if (e.n >= 2) { e.leaving = true; e.alive = false; return; }
          e.y = -e.h; e.st = 0; e.ty = Math.max(U.rand(0.1, 0.2) * G.H, minY(e));
        }
      }
    },
    // Рой: висит и выпускает жуков
    carrier(e, dt) {
      if (e.st === 0) {
        if (arrive(e, dt, 1.8)) { e.st = 1; e.vx = U.sign(Math.random() - 0.5) * e.spd * 0.45; }
      } else if (e.st === 1) {
        e.t += dt;
        strafe(e, dt);
        e.y = e.ty + Math.sin(e.age * 1.3 + e.phase) * 6 * G.S;
        e.spawnT -= dt;
        if (e.spawnT <= 0 && e.spawned < 2 && canShoot(e)) {
          e.spawnT = 4.2; e.spawned++;
          brood(e.x, e.y + e.h * 0.3, 3, false, 20);
          A.play('teleport', { vol: 0.35, rate: 1.4 });
        }
        if (e.t > e.stay) e.st = 2;
      } else leave(e, dt);
    },
    // Кристалл: медленно дрейфует и вращается; при гибели разлетается осколками
    drift(e, dt) {
      e.y += e.spd * 0.55 * dt;
      e.x += e.vx * dt;
      if (e.x < e.w * 0.6 || e.x > G.FW - e.w * 0.6) { e.vx = -e.vx; e.x = U.clamp(e.x, e.w * 0.6, G.FW - e.w * 0.6); }
      e.spinAng += e.spin * dt;
      tickFire(e, dt);
    },
    // Платформа: турель — вращается и поливает четырьмя струями
    turret(e, dt) {
      const S = G.S;
      if (e.st === 0) {
        if (arrive(e, dt, 1.6)) e.st = 1;
      } else if (e.st === 1) {
        e.t += dt;
        e.y = e.ty + Math.sin(e.age * 0.9 + e.phase) * 4 * S;
        e.spinAng += (e.on ? 1.3 : 0.5) * dt;
        e.cyc -= dt;
        if (e.cyc <= 0) { e.on = !e.on; e.cyc = e.on ? 1.9 : 1.8 / Math.pow(fireRate(), 0.5); }
        if (e.on && canShoot(e)) {
          e.shotT -= dt;
          if (e.shotT <= 0) {
            e.shotT = 0.3;
            const s = game.bspd(150);
            for (let k = 0; k < 4; k++) { const a = e.spinAng + k * Math.PI / 2; game.ebullet(e.x + Math.cos(a) * e.w * 0.4, e.y + Math.sin(a) * e.w * 0.4, Math.cos(a) * s, Math.sin(a) * s, 'orb'); }
            A.play('enemyShot', { vol: 0.35, rate: 1.3 });
          }
        }
        if (e.t > e.stay) e.st = 2;
      } else leave(e, dt);
    },
    // Призрак: становится почти невидимым, переносится к игроку и бьёт очередью
    phase(e, dt) {
      const S = G.S, p = game.player;
      if (e.st === 0) {
        if (arrive(e, dt, 2.4)) { e.st = 1; e.t = 0.45; }
      } else if (e.st === 1) {
        e.t -= dt;
        if (e.t <= 0) { if (canShoot(e)) doFire(e, e.def.fire); e.st = 2; e.t = 0.9; }
      } else if (e.st === 2) {
        e.t -= dt;
        if (e.t <= 0) { e.st = 3; A.play('teleport', { vol: 0.3, rate: 1.5 }); }
      } else if (e.st === 3) {
        e.alpha = Math.max(0.12, e.alpha - dt * 3);
        e.hittable = e.alpha > 0.4;
        if (e.alpha <= 0.12) {
          e.n++;
          if (e.n >= 4) { e.leaving = true; e.alive = false; return; }
          e.tx = U.clamp(p.x + U.rand(-90, 90) * S, e.w * 0.6, G.FW - e.w * 0.6);
          e.ty2 = U.rand(minY(e), Math.max(minY(e) + 30, G.H * 0.4));
          e.st = 4;
        }
      } else if (e.st === 4) {
        e.x = U.damp(e.x, e.tx, 5, dt); e.y = U.damp(e.y, e.ty2, 5, dt);
        if (Math.abs(e.x - e.tx) < 6 * S && Math.abs(e.y - e.ty2) < 6 * S) e.st = 5;
      } else {
        e.alpha = Math.min(1, e.alpha + dt * 3);
        e.hittable = e.alpha > 0.4;
        if (e.alpha >= 1) { e.st = 1; e.t = 0.35; }
      }
    },
    // Орбита: кружит вокруг точки, которая медленно следует за игроком
    orbit(e, dt) {
      if (e.st === 0) {
        e.y = U.damp(e.y, e.ay - e.R * 0.7, 2.2, dt) + 10 * G.S * dt;
        if (e.y >= e.ay - e.R * 0.7 - 6 * G.S) e.st = 1;
      } else if (e.st === 1) {
        e.t += dt;
        e.ax = U.damp(e.ax, U.clamp(game.player.x, e.R + e.w * 0.6, G.FW - e.R - e.w * 0.6), 0.35, dt);
        e.ang += e.w0 * dt;
        e.x = e.ax + Math.cos(e.ang) * e.R;
        e.y = Math.max(minY(e), e.ay + Math.sin(e.ang) * e.R * 0.7);
        e.spinAng += dt * 2;
        tickFire(e, dt);
        if (e.t > e.stay) e.st = 2;
      } else leave(e, dt);
    },
    // Ионный: заряжается и бьёт ионным лучом в своей колонне
    ion(e, dt) {
      const S = G.S;
      if (e.st === 0) {
        if (arrive(e, dt, 2)) { e.st = 1; e.vx = U.sign(Math.random() - 0.5) * e.spd * 0.5; }
      } else if (e.st === 1) {
        e.t += dt;
        strafe(e, dt);
        e.y = e.ty + Math.sin(e.age * 1.4 + e.phase) * 5 * S;
        e.chargeT -= dt;
        if (e.chargeT <= 0 && canShoot(e)) {
          e.st = 2; e.charge = 0.85;
          beam(e.x, e.y + e.h * 0.45, 12 * S, 0.85, 0.45, '#7ff6ff', e);
          A.play('railCharge', { vol: 0.35, rate: 1.4 });
        }
        if (e.t > e.stay) e.st = 3;
      } else if (e.st === 2) {
        e.charge -= dt;
        if (e.charge <= 0) { e.st = 1; e.chargeT = U.rand(2.8, 3.6) / Math.pow(fireRate(), 0.6); A.play('laser', { rate: 0.7, vol: 0.6 }); }
      } else leave(e, dt);
    },
    // Крабоход: ходит боком рывками и бьёт клешнями
    crab(e, dt) {
      const S = G.S;
      if (e.st === 0) {
        if (arrive(e, dt, 1.4)) e.st = 1;
      } else if (e.st === 1) {
        e.t += dt;
        e.stepT -= dt;
        if (e.walking) {
          e.x += e.dirx * e.spd * 1.7 * dt;
          if (e.x < e.w * 0.6 || e.x > G.FW - e.w * 0.6) { e.dirx = -e.dirx; e.x = U.clamp(e.x, e.w * 0.6, G.FW - e.w * 0.6); }
        }
        if (e.stepT <= 0) {
          e.walking = !e.walking;
          e.stepT = e.walking ? 0.5 : 0.65;
          if (!e.walking && canShoot(e)) {
            e.volley++;
            doFire(e, e.def.fire);
            if (e.volley % 3 === 0) doFire(e, { kind: 'fan', count: 5, spread: 0.9, bullet: 'orb', spd: 165 });
          }
        }
        e.y = e.ty + Math.abs(Math.sin(e.age * 7)) * (e.walking ? 3 : 0) * S;
        if (e.t > e.stay) e.st = 2;
      } else leave(e, dt);
    },
    gunship(e, dt) {
      const S = G.S;
      if (e.st === 0) {
        e.y = U.damp(e.y, e.ty, 1.4, dt) + 8 * S * dt;
        if (e.y >= e.ty - 6 * S) e.st = 1;
        return;
      }
      strafe(e, dt, 0.55);
      e.y = e.ty + Math.sin(e.age * 0.9) * 10 * S;
      e.patT -= dt;
      if (e.patT <= 0 && canShoot(e)) {
        e.patT = 2.7 / Math.pow(fireRate(), 0.7);
        const k = e.pat++ % 3;
        if (k === 0) { for (let i = 0; i < 3; i++) game.after(i * 0.16, () => { if (e.alive) for (const sd of [-1, 1]) game.aimAt(e.x + sd * e.w * 0.32, e.y + e.h * 0.3, 240, 'bolt'); }); }
        else if (k === 1) { const p = game.player, base = Math.atan2(p.y - e.y, p.x - e.x); for (let i = 0; i < 7; i++) { const a = base + (i / 6 - 0.5) * 1.1; const s = game.bspd(170); game.ebullet(e.x, e.y + e.h * 0.3, Math.cos(a) * s, Math.sin(a) * s, 'orb'); } }
        else { const s = game.bspd(140); for (let i = 0; i < 14; i++) { const a = i / 14 * U.TAU + e.age; game.ebullet(e.x, e.y, Math.cos(a) * s, Math.sin(a) * s, 'needle'); } }
        A.play('enemyShot');
      }
    },
    // Эсминец: носовое орудие, бортовые веера, самонаводящиеся ракеты
    destroyer(e, dt) {
      const S = G.S;
      if (e.st === 0) {
        e.y = U.damp(e.y, e.ty, 1.2, dt) + 8 * S * dt;
        if (e.y >= e.ty - 6 * S) e.st = 1;
        return;
      }
      strafe(e, dt, 0.6);
      e.y = e.ty + Math.sin(e.age * 0.7) * 8 * S;
      e.patT -= dt;
      if (e.patT <= 0 && canShoot(e)) {
        e.patT = 2.8 / Math.pow(fireRate(), 0.7);
        const k = e.pat++ % 3;
        if (k === 0) { for (let i = 0; i < 3; i++) game.after(i * 0.22, () => { if (e.alive) { game.aimAt(e.x, e.y + e.h * 0.46, 420, 'long'); A.play('laser', { rate: 0.55, vol: 0.6 }); } }); }
        else if (k === 1) { for (const sd of [-1, 1]) { const s = game.bspd(165); for (let i = 0; i < 5; i++) { const a = Math.PI / 2 + sd * (0.25 + i * 0.16); game.ebullet(e.x + sd * e.w * 0.35, e.y, Math.cos(a) * s, Math.sin(a) * s, 'orb'); } } A.play('enemyShot'); }
        else { for (const sd of [-1, 1]) { const s = game.bspd(120); game.ebullet(e.x + sd * e.w * 0.3, e.y - e.h * 0.1, sd * s * 0.6, s * 0.5, 'fire', { homing: 1.4, life: 5 }); } A.play('rocket', { rate: 0.7, vol: 0.6 }); }
      }
    },
    // Линкор: бортовые завесы, двойные лучи, кольцо с прицельным выстрелом
    battleship(e, dt) {
      const S = G.S;
      if (e.st === 0) {
        e.y = U.damp(e.y, e.ty, 1.2, dt) + 8 * S * dt;
        if (e.y >= e.ty - 6 * S) e.st = 1;
        return;
      }
      strafe(e, dt, 0.6);
      e.y = e.ty + Math.sin(e.age * 0.6) * 8 * S;
      e.patT -= dt;
      if (e.patT <= 0 && canShoot(e)) {
        e.patT = 2.9 / Math.pow(fireRate(), 0.7);
        const k = e.pat++ % 3;
        if (k === 0) {
          for (let i = 0; i < 4; i++) game.after(i * 0.16, () => { if (!e.alive) return; const s = game.bspd(200); for (const sd of [-1, 1]) game.ebullet(e.x + sd * e.w * 0.42, e.y + e.h * 0.1, sd * 22 * S, s, 'bolt'); });
          A.play('enemyShot');
        } else if (k === 1) {
          const px = game.player.x;
          for (const off of [-60, 60]) beam(U.clamp(px + off * S, 14 * S, G.FW - 14 * S), e.y + e.h * 0.45, 16 * S, 0.9, 0.5, '#ff8a3d', e);
          A.play('railCharge', { vol: 0.45, rate: 1.2 });
        } else {
          const s = game.bspd(140);
          for (let i = 0; i < 16; i++) { const a = i / 16 * U.TAU + e.age; game.ebullet(e.x, e.y, Math.cos(a) * s, Math.sin(a) * s, 'orb'); }
          game.aimAt(e.x, e.y + e.h * 0.46, 430, 'long');
          A.play('laser', { rate: 0.6, vol: 0.6 });
        }
      }
    },
    // Ракетный фрегат: рои ракет, проходы с пулемётом, прицельный веер
    frigate(e, dt) {
      const S = G.S;
      if (e.st === 0) {
        e.y = U.damp(e.y, e.ty, 1.4, dt) + 8 * S * dt;
        if (e.y >= e.ty - 6 * S) e.st = 1;
        return;
      }
      strafe(e, dt, 0.55);
      e.y = e.ty + Math.sin(e.age * 1.1) * 8 * S;
      if (e.run > 0) {
        e.run -= dt;
        e.runT = (e.runT || 0) - dt;
        if (e.runT <= 0 && canShoot(e)) { e.runT = 0.09; game.ebullet(e.x, e.y + e.h * 0.45, 0, game.bspd(320), 'needle'); }
        if (e.run <= 0) e.vx = U.sign(e.vx) * e.spd * 0.7;
      }
      e.patT -= dt;
      if (e.patT <= 0 && canShoot(e)) {
        e.patT = 2.6 / Math.pow(fireRate(), 0.7);
        const k = e.pat++ % 3;
        if (k === 0) {
          for (let i = 0; i < 4; i++) game.after(i * 0.14, () => { if (!e.alive) return; const sd = i % 2 ? 1 : -1, s = game.bspd(115); game.ebullet(e.x + sd * e.w * 0.35, e.y, sd * s * 0.7, s * 0.4, 'fire', { homing: 1.25, life: 5 }); });
          A.play('rocket', { rate: 0.75, vol: 0.6 });
        } else if (k === 1) {
          e.run = 1.3; e.vx = U.sign(e.vx || 1) * e.spd * 2.4;
        } else {
          const p = game.player, base = Math.atan2(p.y - e.y, p.x - e.x), s = game.bspd(175);
          for (let i = 0; i < 9; i++) { const a = base + (i / 8 - 0.5) * 1.2; game.ebullet(e.x, e.y + e.h * 0.3, Math.cos(a) * s, Math.sin(a) * s, 'orb'); }
          A.play('enemyShot');
        }
      }
    },
    // Рейдер: проходит по экрану горизонтально, бортовые залпы вниз; после трёх проходов уходит
    flyby(e, dt) {
      const S = G.S;
      e.x += e.vx * dt;
      e.y = e.ty + Math.sin(e.age * 1.3) * 6 * S;
      e.hittable = e.x > -e.w * 0.35 && e.x < G.FW + e.w * 0.35;
      if (e.hittable) {
        e.broadT -= dt;
        if (e.broadT <= 0 && canShoot(e)) {
          e.broadT = 0.75 / Math.pow(fireRate(), 0.6);
          const s = game.bspd(190);
          for (let i = -1; i <= 1; i++) game.ebullet(e.x + i * e.w * 0.28, e.y + e.h * 0.3, i * 18 * S, s, 'bolt');
          A.play('enemyShot', { vol: 0.6 });
        }
        e.misT -= dt;
        if (e.misT <= 0 && canShoot(e)) {
          e.misT = 2.6 / Math.pow(fireRate(), 0.6);
          const s = game.bspd(115);
          game.ebullet(e.x - e.face * e.w * 0.35, e.y, 0, s, 'fire', { homing: 1.2, life: 5 });
          A.play('rocket', { rate: 0.75, vol: 0.5 });
        }
      }
      const out = (e.vx > 0 && e.x > G.FW + e.w * 0.6) || (e.vx < 0 && e.x < -e.w * 0.6);
      if (out) {
        e.passes++;
        if (e.passes >= 3) { e.leaving = true; e.alive = false; SS.emit('toast', { ico: '💨', title: 'РЕЙДЕР', text: 'Ушёл без боя', info: true, dur: 1500 }); return; }
        e.face = -e.face; e.vx = -e.vx * 1.08;
        e.ty = Math.max(minY(e), e.ty + U.rand(-20, 40) * S);
      }
    },
  };

  // поведение и стрельба доступны врагам 3.1 (foes.js)
  E.AI = AI; E.INIT = INIT;
  E.h = { arrive, strafe, leave, dodge, tickFire, doFire, canShoot, fireRate, minY, brood };

  // ════════════════════════════════════════════════════════════
  // ОБНОВЛЕНИЕ
  // ════════════════════════════════════════════════════════════
  // 3.1: зависшие наверху враги расходятся в стороны, а не лежат друг на друге
  const NO_SEP = { swarm: 1, formation: 1, kamikaze: 1, dive: 1, diver: 1, flank: 1, sweep: 1, link: 1, egg: 1, thief: 1, drift: 1, bomber: 1, flyby: 1 };
  function separate(dt) {
    const es = game.enemies, S = G.S;
    for (let i = 0; i < es.length; i++) {
      const a = es[i];
      if (!a.alive || a.boss || a.mini || a.st !== 1 || NO_SEP[a.ai]) continue;
      for (let j = i + 1; j < es.length; j++) {
        const b = es[j];
        if (!b.alive || b.boss || b.mini || b.st !== 1 || NO_SEP[b.ai]) continue;
        const dx = b.x - a.x, dy = b.y - a.y, min = (a.w + b.w) * 0.42;
        if (Math.abs(dx) >= min || Math.abs(dy) >= (a.h + b.h) * 0.4) continue;
        const push = (min - Math.abs(dx)) * Math.min(1, dt * 3) * 0.5, sd = dx === 0 ? (i % 2 ? 1 : -1) : Math.sign(dx);
        a.x = U.clamp(a.x - sd * push, a.w * 0.5, G.FW - a.w * 0.5);
        b.x = U.clamp(b.x + sd * push, b.w * 0.5, G.FW - b.w * 0.5);
        // с края не уйти — расходимся по высоте
        if (Math.abs(dx) < 4 * S && a.ty) { a.ty = Math.max(a.ty - 20 * S * dt, minY(a)); b.ty = Math.min((b.ty || b.y) + 20 * S * dt, G.H * 0.5); }
      }
    }
  }

  E.updateAll = function (edt, dt) {
    const H = G.H;
    for (const e of game.enemies) {
      if (!e.alive) continue;
      if (e.flash > 0) e.flash -= dt;
      if (e.shieldHitT > 0) e.shieldHitT -= dt;
      if (e.boss) { updateBoss(e, edt, dt); continue; }
      let edt2 = edt;
      if (e.frozen > 0) { e.frozen -= dt; edt2 *= 0.15; }
      e.age += edt2;
      e.lastX = e.x;
      const ai = AI[e.ai || e.def.ai];
      if (ai) ai(e, edt2);
      if (!e.horiz) e.bank = U.damp(e.bank, U.clamp((e.x - e.lastX) / Math.max(edt2, 0.001) * 0.0012, -0.35, 0.35), 8, dt);
      if (e.y > H + e.h + 20 || e.y < -H) { e.alive = false; e.leaving = true; }
    }
    separate(dt);
    for (let i = E.corpses.length - 1; i >= 0; i--) {
      const c = E.corpses[i];
      c.t += dt;
      if (c.t < c.dur && Math.random() < dt * 14) {
        const x = c.x + U.rand(-0.4, 0.4) * c.w, y = c.y + U.rand(-0.35, 0.35) * c.h;
        FX.explode(x, y, U.rand(1, 2), U.pick(['#ffb03d', '#ff6a2a', c.color]));
        A.play('explodeS', { vol: 0.6 });
      }
      if (c.t >= c.dur) {
        E.corpses.splice(i, 1);
        FX.explode(c.x, c.y, 4, c.color, { kind: 'boss' });
        FX.ring(c.x, c.y, 20, Math.max(G.FW, G.H), '#ffffff', 0.8, 8);
        FX.flash('#ffffff', 0.7);
        FX.shake(1);
        A.play('explodeL');
      }
    }
  };

  // ════════════════════════════════════════════════════════════
  // УНИЧТОЖЕНИЕ
  // ════════════════════════════════════════════════════════════
  E.kill = function (e, src) {
    if (!e.alive) return;
    if (e.boss) { bossDeath(e); return; }
    e.alive = false;
    const S = G.S;
    const size = U.clamp(Math.max(e.w, e.h * 0.8) / (48 * S), 0.6, 2.6);
    const col = COLORS[e.type] || '#ffb03d';
    FX.explode(e.x, e.y, size, size > 1.4 ? '#ffb03d' : col, e.mini ? { kind: 'kill' } : e.elite ? { kind: 'crit' } : Math.random() < 0.5 ? { kind: 'ship' } : null);
    if (e.mini) { FX.explode(e.x - e.w * 0.25, e.y, 1.4, col); FX.explode(e.x + e.w * 0.25, e.y, 1.4, '#ffb03d'); }
    if (FX.quality > 0) FX.debris(e.x, e.y, col, Math.round(size * 3), 140);
    A.play(size > 1.5 ? 'explodeM' : 'explodeS', { vol: size > 1.5 ? 0.8 : 0.6 });
    if (size > 1.5) FX.shake(e.mini ? 0.45 : 0.18);
    if (e.mini) { FX.flash('#ffd9a0', 0.25); SS.tg.haptic('heavy'); }
    // посмертные эффекты: осколки кристалла, кольцо орбиты, выводок роя и паразита
    // (бомба и нова их гасят, чтобы зачистка экрана оставалась зачисткой)
    const quiet = src === 'bomb' || src === 'nova';
    const d = e.def;
    if (d.death && !quiet && game.player.alive) {
      const s = game.bspd(d.death.spd), off = Math.random() * U.TAU;
      for (let i = 0; i < d.death.n; i++) { const a = off + i / d.death.n * U.TAU; game.ebullet(e.x, e.y, Math.cos(a) * s, Math.sin(a) * s, d.death.bullet); }
    }
    if (d.brood && !quiet && !e.isChild) brood(e.x, e.y, d.brood, !!d.larva, 18);
    SS.foes.onKill(e);
    game.onEnemyKilled(e, src);
  };

  // попадание по крупным кораблям — эллипс, по остальным — круг
  // k — множитель размеров корпуса (для тарана и взрывов)
  E.hitTest = function (e, x, y, pad, k) {
    k = k || 1;
    if (e.rx) {
      const dx = (x - e.x) / (e.rx * k + pad), dy = (y - e.y) / (e.ry * k + pad);
      return dx * dx + dy * dy <= 1;
    }
    const rr = e.r * k + pad;
    return U.dist2(e.x, e.y, x, y) <= rr * rr;
  };

  // ════════════════════════════════════════════════════════════
  // БОССЫ
  // ════════════════════════════════════════════════════════════
  E.spawnBoss = function (n, tries) {
    const num = Math.max(1, Math.round(n / 5));
    const bdef = game.bossDef(num);
    const cycle = Math.floor((num - 1) / D.BOSSES.length);
    const S = G.S;
    // свой спрайт босса лежит в позднем атласе: на очень медленной сети он может ещё качаться — тогда ждём
    // (на экране идёт предупреждение), а если атлас так и не скачался, босс выходит в облике Стража своего цвета
    let sprite = bdef.sprite, hue = bdef.hue, fallback = false;
    const bf = G.frame(sprite);
    if (bf && bf[5] && !G.img2) {
      if (!G.lateFailed && (tries || 0) < 60) { game.after(0.5, () => E.spawnBoss(n, (tries || 0) + 1)); return; }
      sprite = 'boss'; hue = G.hueOf(bdef.color); fallback = true;
    }
    // прочность растёт вместе с прочностью обычных врагов; первые два босса — разминка
    const ramp = num === 1 ? 0.92 : num === 2 ? 1.6 : 2 + (num - 3) * 0.2;
    const hp = 1000 * bdef.hp * E.hpScale() * ramp * (1 + cycle * 0.3) * (num === 1 ? D.BOSS_HP_FIRST : D.BOSS_HP);
    const w = Math.min(G.FW * bdef.wf, bdef.wmax * S);
    const asp = G.aspect(sprite);
    const h = w * asp;
    const b = {
      uid: uid++, type: 'boss', def: { coins: 0, xp: 0, score: 0 }, bdef, sprite, fallback, boss: true, mini: false,
      alive: true, hittable: true, entering: true,
      x: G.FW / 2, y: -h * 0.6, w, h, r: w * 0.37, rx: 0, ry: 0,
      hp, maxHp: hp, phase: 1, age: 0, mt: 0, flash: 0, frozen: 0, alpha: 1, bank: 0, face: -1, lastX: G.FW / 2,
      shield: bdef.shield ? hp * bdef.shield * 0.4 : 0, shieldMax: bdef.shield ? hp * bdef.shield * 0.4 : 0, shieldHitT: 0, shieldRegenWait: 0, fx: 1,
      cv: hue !== undefined && hue !== null ? G.tinted(sprite, { hue }) : null,
      // корпус целиком ниже полосы босса, но не ниже середины экрана
      baseY: Math.max(G.H * 0.2, Math.min((SS.ui ? SS.ui.topInset() : 120) + h * 0.5 + 4 * S, G.H * 0.52 - h * 0.5)), reborn: false, cycle, num,
      pt: {}, orbs: [], spin: 0, aim: null, dive: null, dash: null, vuln: 0, trans: 0, rage: false,
    };
    setHitbox(b, sprite);
    if (bdef.id === 'phoenix') for (let i = 0; i < 3; i++) b.orbs.push({ a: i / 3 * U.TAU });
    game.boss = b;
    game.enemies.push(b);
    game.run.bossDamaged = false;
    FX.sprite('fx_warp', G.FW / 2, (SS.ui ? SS.ui.topInset() : 120) + 50 * S, { w0: 120 * S, w1: 230 * S, dur: 1.5, hold: 0.45, fadeIn: 0.15, alpha: 0.8, hue: G.hueOf(bdef.color) });
    // в кат-сцене рёв и тряска — вместе с карточкой имени (game.sceneName)
    if (game.state !== 'cutscene') { A.play('bossRoar'); FX.shake(0.4); }
    SS.emit('bossSpawn', b);
    SS.emit('intensity');
  };

  function bcd(b, base) { return base / Math.pow(game.diff.fire, 0.55) / (1 + (b.phase - 1 + (b.rage ? 1 : 0)) * 0.18) / (1 + b.cycle * 0.12) * (b.num === 1 ? 1.3 : 1); }
  function timer(b, key, period, first) {
    if (b.pt[key] === undefined) b.pt[key] = first !== undefined ? first : period * U.rand(0.4, 0.9);
    b.pt[key] -= b._dt;
    if (b.pt[key] <= 0) { b.pt[key] += period; return true; }
    return false;
  }
  function ring(x, y, n, spd, type, off) {
    const s = game.bspd(spd);
    for (let i = 0; i < n; i++) { const a = (off || 0) + i / n * U.TAU; game.ebullet(x, y, Math.cos(a) * s, Math.sin(a) * s, type); }
  }
  function fan(x, y, n, spread, spd, type, base) {
    const p = game.player;
    const b0 = base !== undefined ? base : Math.atan2(p.y - y, p.x - x);
    const s = game.bspd(spd);
    for (let i = 0; i < n; i++) { const a = b0 + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread); game.ebullet(x, y, Math.cos(a) * s, Math.sin(a) * s, type); }
  }
  // перья: разлетаются веером, замирают и бросаются в игрока
  function feathers(x, y, n, dir, spd) {
    const s = game.bspd(spd || 150);
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + dir * (0.35 + i * 0.22);
      game.ebullet(x, y, Math.cos(a) * s, Math.sin(a) * s, 'feather', { redir: 0.65 + i * 0.05, redirSpd: game.bspd(280), life: 6 });
    }
  }

  // атаки Хаоса выбираются случайно
  const CHAOS_MOVES = [
    (b) => { // шрапнель с рикошетом
      for (let i = 0; i < 14; i++) { const a = Math.PI / 2 + U.rand(-1.2, 1.2), s = game.bspd(U.rand(140, 230)); game.ebullet(b.x + U.rand(-0.3, 0.3) * b.w, b.y + b.h * 0.2, Math.cos(a) * s, Math.sin(a) * s, 'junk', { bounce: 1 }); }
      A.play('explodeS', { vol: 0.6 });
    },
    (b) => { ring(b.x, b.y, 12, 150, 'junk', Math.random()); A.play('enemyShot'); },
    (b) => { for (const sd of [-1, 0, 1]) { const s = game.bspd(120); game.ebullet(b.x + sd * b.w * 0.3, b.y + b.h * 0.2, sd * s * 0.5, s, 'fire', { homing: 1.1, life: 5 }); } A.play('rocket', { rate: 0.8 }); },
    (b) => {
      game.laser({ owner: b, ox: 0, oy: 0.05, ang: Math.PI / 2 + U.rand(-0.7, 0.7), spin: U.rand(0.35, 0.6) * U.sign(Math.random() - 0.5), warn: 0.7, dur: 1.0, w: 12 * G.S, color: '#ff7a2a' });
      A.play('railCharge', { vol: 0.4, rate: 1.5 });
    },
    (b) => { for (let i = 0; i < 2; i++) E.spawn('scout', { x: U.clamp(b.x + (i ? 1 : -1) * b.w * 0.4, 20 * G.S, G.FW - 20 * G.S), y: b.y, tint: 25, hpMul: 0.7, noElite: true }); },
  ];

  // 3.1: у каждого босса три фазы со своим набором атак, а не «старые плюс новая»:
  // 1-я — визитная карточка, 2-я — другая тактика, 3-я — самые опасные атаки вместе.
  // Как босс двигается в каждой фазе — BOSS_MOVES (updateBoss)
  const BOSS = {
    // Страж: веер → кольца и спаренные пушки → огненный дождь и луч-развёртка
    guardian(b) {
      const intro = b.num === 1, ph = b.phase, S = G.S;
      if (ph === 1 && timer(b, 'fan', bcd(b, 1.7), 1)) { fan(b.x, b.y + b.h * 0.35, intro ? 4 : 6, 0.95, 210, 'bolt'); A.play('enemyShot'); }
      if (ph === 2) {
        if (timer(b, 'ring', bcd(b, 2.4), 0.8)) { b.spin += 0.3; ring(b.x, b.y, intro ? 10 : 14, 150, 'orb', b.spin); }
        if (timer(b, 'twin', bcd(b, 1.3), 1.5)) { for (const sd of [-1, 1]) game.aimAt(b.x + sd * b.w * 0.4, b.y + b.h * 0.2, 240, 'bolt'); A.play('enemyShot'); }
      }
      if (ph >= 3) {
        if (timer(b, 'fan', bcd(b, 2.2), 1)) { fan(b.x, b.y + b.h * 0.35, intro ? 5 : 7, 1.1, 210, 'bolt'); A.play('enemyShot'); }
        if (timer(b, 'rain', bcd(b, intro ? 1.6 : 1.1))) { for (let i = 0; i < (intro ? 2 : 3); i++) game.ebullet(U.rand(0.05, 0.95) * G.FW, -10, 0, game.bspd(170), 'fire'); }
        if (timer(b, 'sweep', bcd(b, intro ? 9 : 7), 3)) {
          const sd = U.pick([-1, 1]);
          game.laser({ owner: b, ox: 0, oy: 0.1, ang: Math.PI / 2 - sd * 1.0, spin: sd * 0.55, warn: 0.9, dur: 2.2, w: 12 * S, color: '#ff3d5a' });
          A.play('railCharge', { vol: 0.45 });
        }
      }
    },
    // Снайпер: спаренные прицельные → засада из игл и веер, телепорты → тройные выстрелы и рельсотрон
    sniper(b) {
      const ph = b.phase, S = G.S;
      if (ph !== 2 && !b.aim && timer(b, 'snipe', bcd(b, ph >= 3 ? 2.1 : 2.4), 1.2)) b.aim = { t: 0.95 };
      if (b.aim) { game.player.lockT = 2.5; if (b.aim.t <= 0.22) game.player.lockHot = 0.35; }
      if (b.aim) {
        b.aim.t -= b._dt;
        if (b.aim.t > 0.22) b.aim.ang = [-1, 1].map((sd) => Math.atan2(game.player.y - (b.y + b.h * 0.2), game.player.x - (b.x + sd * b.w * 0.32)));
        if (b.aim.t <= 0) {
          [-1, 1].forEach((sd, i) => {
            const n = ph >= 3 ? 3 : 1;
            for (let k = 0; k < n; k++) { const a = b.aim.ang[i] + (k - (n - 1) / 2) * 0.1; const s = game.bspd(560); game.ebullet(b.x + sd * b.w * 0.32, b.y + b.h * 0.2, Math.cos(a) * s, Math.sin(a) * s, 'long'); }
          });
          A.play('laser', { rate: 0.5 });
          b.aim = null;
        }
      }
      if (ph === 2) {
        if (timer(b, 'sweep', bcd(b, 2.6), 0.8)) fan(b.x, b.y + b.h * 0.3, 9, 1.7, 170, 'orb', Math.PI / 2);
        // засада: иглы разлетаются веером, замирают и бьют в корабль
        if (timer(b, 'trap', bcd(b, 3.4), 1.8)) {
          const s = game.bspd(160);
          for (let i = 0; i < 6; i++) { const a = Math.PI / 2 + (i - 2.5) * 0.45; game.ebullet(b.x, b.y + b.h * 0.2, Math.cos(a) * s, Math.sin(a) * s, 'long', { redir: 0.75, redirSpd: game.bspd(330), life: 6 }); }
          A.play('enemyShot', { rate: 0.8 });
        }
      }
      // рельсотрон: луч по колонне игрока
      if (ph >= 3 && timer(b, 'rail', bcd(b, 4.2), 2)) { beam(game.player.x, b.y + b.h * 0.4, 16 * S, 0.9, 0.45, '#ff9f3d', b); A.play('railCharge', { vol: 0.45 }); }
    },
    // Кракен: завесы щупалец и чернила → вихри и хватка (рывок к кораблю) → завесы быстрее, вихри и выводок
    kraken(b) {
      const S = G.S, ph = b.phase;
      const active = (b.age % 4.6) < 3;
      if (ph !== 2 && active && timer(b, 'tent', ph >= 3 ? 0.15 : 0.2)) {
        const sw = ph >= 3 ? 1.9 : 1.4;
        for (const sd of [-1, 1]) {
          const a = Math.PI / 2 + sd * (0.2 + 0.6 * (0.5 + 0.5 * Math.sin(b.age * sw + (sd > 0 ? Math.PI : 0))));
          const s = game.bspd(160);
          game.ebullet(b.x + sd * b.w * 0.34, b.y + b.h * 0.36, Math.cos(a) * s, Math.sin(a) * s, 'violet');
        }
      }
      if (ph <= 2 && timer(b, 'ink', bcd(b, 3.2), 1.8)) {
        const n = 1 + ph;
        for (let i = 0; i < n; i++) {
          const a = Math.PI / 2 + (i - (n - 1) / 2) * 0.55, s = game.bspd(115);
          game.ebullet(b.x, b.y + b.h * 0.25, Math.cos(a) * s, Math.sin(a) * s, 'ink', { fuse: 1.25 + i * 0.12, burst: { n: 10, type: 'dot', spd: 145 }, life: 6 });
        }
        A.play('enemyShot', { rate: 0.6 });
      }
      if (ph >= 2 && timer(b, 'whirl', bcd(b, ph >= 3 ? 3.4 : 2.6), 1)) { b.spin += 0.4; ring(b.x, b.y, 16, 135, 'violet', b.spin); }
      if (ph === 2 && !b.dash && timer(b, 'grab', 5.5, 2.5)) {
        b.dash = { t: 0, x0: b.x, y0: b.y, tx: U.clamp(game.player.x, b.w * 0.45, G.FW - b.w * 0.45), dy: 50 * S };
        A.play('bossRoar', { vol: 0.4, rate: 1.3 });
      }
      if (ph >= 3 && timer(b, 'spawn', bcd(b, 7), 2.5)) brood(b.x, b.y + b.h * 0.3, 3, false, 24);
    },
    // Феникс: кольца и перья → пикирует на корабль → огненный дождь и огненные кольца (и возрождение)
    phoenix(b) {
      const S = G.S, p = game.player, ph = b.phase;
      const want = 2 + ph + (b.reborn ? 1 : 0);
      while (b.orbs.length < want) b.orbs.push({ a: Math.random() * U.TAU });
      const R = b.w * 0.5;
      for (const o of b.orbs) {
        o.a += b._dt * (1.4 + ph * 0.25);
        o.x = b.x + Math.cos(o.a) * R; o.y = b.y + Math.sin(o.a) * R * 0.8;
        if (p.alive && Math.hypot(o.x - p.x, o.y - p.y) < 14 * S + p.r) game.hitPlayer(o.x, o.y);
      }
      if (ph !== 2 && timer(b, 'burst', bcd(b, 2.1), 1.2)) { b.spin += 0.4; ring(b.x, b.y, ph >= 3 ? 16 : 10, 150, ph >= 3 ? 'fire' : 'orb', b.spin); }
      // огненные перья с крыльев
      if (ph <= 2 && timer(b, 'feather', bcd(b, ph === 2 ? 2.6 : 3.4), 2.4)) {
        for (const sd of [-1, 1]) feathers(b.x + sd * b.w * 0.38, b.y, 3 + ph, sd, 150);
        A.play('enemyShot', { rate: 1.2 });
      }
      if (ph === 2 && !b.dive && timer(b, 'dive', 4.5, 1.5)) b.dive = { t: 0, x0: b.x, y0: b.y, tx: p.x, ty: Math.min(p.y - 140 * S, G.H * 0.55) };
      if ((ph >= 3 || b.reborn) && timer(b, 'rain', bcd(b, 1.3))) { for (let i = 0; i < 3; i++) game.ebullet(U.rand(0.05, 0.95) * G.FW, -10, 0, game.bspd(170), 'fire'); }
    },
    // Паук-реактор: вращающиеся лапы и дроны → паутина и иглы, преследует → лапы, паутина и дроны
    spider(b) {
      const ph = b.phase;
      b.spinCycle = (b.spinCycle || 0) + b._dt;
      const cyc = b.spinCycle % 4;
      if (ph !== 2 && cyc < 2.6 && timer(b, 'arm', 0.12)) {
        b.spin += 0.23;
        ring(b.x, b.y, ph >= 3 ? 6 : 4, 145, 'violet', b.spin);
      }
      if (ph !== 2 && timer(b, 'spawn', bcd(b, 6.5), 3)) {
        const n = ph >= 3 ? 4 : 3;
        for (let i = 0; i < n; i++) E.spawn('drone', { x: b.x + (i - (n - 1) / 2) * 30 * G.S, y: b.y + b.h * 0.3, idx: i, amp: 30, noElite: true });
      }
      // паутина: медленное кольцо с проходами
      if (ph >= 2 && timer(b, 'web', bcd(b, ph >= 3 ? 5.2 : 3.6), 1)) {
        const n = 24, s = game.bspd(105), gap = U.randi(0, 5), off = Math.random() * 0.3;
        for (let i = 0; i < n; i++) { if ((i + gap) % 6 < 2) continue; const a = off + i / n * U.TAU; game.ebullet(b.x, b.y, Math.cos(a) * s, Math.sin(a) * s, 'dot'); }
      }
      if (ph === 2 && timer(b, 'tent', bcd(b, 2.2), 1.5)) { for (const sd of [-1, 1]) for (let k = 0; k < 4; k++) game.after(k * 0.1, () => { if (b.alive) game.aimAt(b.x + sd * b.w * 0.35, b.y + b.h * 0.25, 230, 'needle'); }); }
    },
    // Дредноут: пушки и луч → ракеты и заградительная стена (щит снова полный) → два луча и ракеты
    dreadnought(b) {
      const S = G.S, ph = b.phase;
      if (ph !== 2 && timer(b, 'beam', bcd(b, 3.4), 1.5)) {
        const xs = [game.player.x];
        if (ph >= 3) xs.push(U.clamp(game.player.x + U.pick([-1, 1]) * U.rand(90, 150) * S, 20 * S, G.FW - 20 * S));
        for (const x of xs) beam(x, b.y + b.h * 0.35, 22 * S, 1.0, 0.6, '#3db8ff', b);
        A.play('railCharge', { vol: 0.5, rate: 1.3 });
      }
      if (ph >= 2 && timer(b, 'missile', bcd(b, ph >= 3 ? 3.4 : 2.6), 1)) {
        for (const sd of [-1, 0, 1]) { const s = game.bspd(120); game.ebullet(b.x + sd * b.w * 0.35, b.y + b.h * 0.3, sd * s * 0.4, s, 'fire', { homing: 1.3, life: 5 }); }
        A.play('rocket', { rate: 0.7 });
      }
      if (ph === 2 && timer(b, 'barrage', bcd(b, 4.2), 2.5)) { NEW_FIRE.wall(b, { bullet: 'blue', spd: 120 }); A.play('enemyShot'); }
      if (timer(b, 'cannon', bcd(b, ph === 2 ? 1.2 : 1.5))) { for (const sd of [-1, 1]) game.aimAt(b.x + sd * b.w * 0.42, b.y + b.h * 0.25, 230, 'bolt'); }
      // восстановление энергощита
      if (b.shieldMax > 0 && b.shield < b.shieldMax) {
        b.shieldRegenWait -= b._dt;
        if (b.shieldRegenWait <= 0) b.shield = Math.min(b.shieldMax, b.shield + b.shieldMax * 0.2 * b._dt);
      }
    },
    // Инквизитор: гатлинги и перекрестье лазеров → столпы света и перья, преследует → всё вместе быстрее
    inquisitor(b) {
      const S = G.S, p = game.player, ph = b.phase;
      if (ph !== 2 && !b.gat && timer(b, 'gat', bcd(b, 2.5), 1.4)) { b.gatSide = -(b.gatSide || 1); b.gat = { n: 0, t: 0 }; }
      if (b.gat) {
        b.gat.t -= b._dt;
        if (b.gat.t <= 0) {
          b.gat.t = 0.075;
          game.aimAt(b.x + b.gatSide * b.w * 0.36, b.y + b.h * 0.36, 300, 'bolt', U.rand(-0.07, 0.07));
          A.play('enemyShot', { vol: 0.35, rate: 1.5 });
          if (++b.gat.n >= (ph >= 3 ? 12 : 9)) b.gat = null;
        }
      }
      // крест правосудия: два луча сходятся от краёв к центру
      if (ph !== 2 && timer(b, 'cross', bcd(b, ph >= 3 ? 5.6 : 6.8), 3.5)) {
        const spin = 0.32 * (ph >= 3 ? 1.3 : 1);
        game.laser({ owner: b, ox: 0, oy: 0.05, ang: Math.PI / 2 - 0.85, spin, warn: 0.9, dur: 1.6, w: 14 * S, color: '#ff3d3d' });
        game.laser({ owner: b, ox: 0, oy: 0.05, ang: Math.PI / 2 + 0.85, spin: -spin, warn: 0.9, dur: 1.6, w: 14 * S, color: '#ff3d3d' });
        A.play('railCharge', { vol: 0.5 });
      }
      if (ph >= 2 && timer(b, 'pillar', bcd(b, ph >= 3 ? 5 : 3.8), 1.2)) {
        const xs = ph >= 3 ? [p.x, U.rand(0.1, 0.9) * G.FW] : [p.x, U.rand(0.1, 0.9) * G.FW, U.rand(0.1, 0.9) * G.FW];
        for (const x of xs) beam(x, b.y + b.h * 0.4, 20 * S, 1.0, 0.5, '#ffd23d', b);
        A.play('railCharge', { vol: 0.4, rate: 1.2 });
      }
      if (ph === 2 && timer(b, 'wings', bcd(b, 3.2), 2)) {
        for (const sd of [-1, 1]) feathers(b.x + sd * b.w * 0.42, b.y - b.h * 0.05, 5, sd, 160);
        A.play('enemyShot', { rate: 1.3 });
      }
    },
    // Королева роя: кислота и выводки → яйца и личинки, что ползут к кораблю → спираль, яйца и кислота
    queen(b) {
      const ph = b.phase;
      if (ph === 1 && timer(b, 'brood', bcd(b, 4.6), 2)) { brood(b.x, b.y + b.h * 0.3, 4, false, 22); A.play('teleport', { rate: 0.6, vol: 0.5 }); }
      if (ph === 2 && timer(b, 'larva', bcd(b, 4.2), 1.5)) { brood(b.x, b.y + b.h * 0.3, 4, true, 22); A.play('teleport', { rate: 0.5, vol: 0.5 }); }
      if (ph !== 2 && timer(b, 'spit', bcd(b, 1.9))) { fan(b.x, b.y + b.h * 0.35, 5, 0.7, 200, 'green'); A.play('enemyShot'); }
      if (ph >= 2 && timer(b, 'eggs', bcd(b, ph >= 3 ? 3.8 : 3.0), 1)) {
        for (let i = 0; i < 3; i++) {
          const a = Math.PI / 2 + (i - 1) * 0.6, s = game.bspd(110);
          game.ebullet(b.x + (i - 1) * b.w * 0.25, b.y + b.h * 0.3, Math.cos(a) * s, Math.sin(a) * s, 'egg', { fuse: 1.2 + i * 0.2, burst: { n: 6, type: 'green', spd: 150 }, life: 6 });
        }
      }
      if (ph >= 3 && (b.age % 5) < 3 && timer(b, 'spiral', 0.17)) { b.spin += 0.29; ring(b.x, b.y, 3, 150, 'green', b.spin); }
    },
    // Некромант: спираль и павшие разведчики → иглы крестом и души, телепорты → спираль, души и павшие
    necro(b) {
      const ph = b.phase;
      if (ph !== 2 && timer(b, 'spiral', bcd(b, 1.5), 1)) { b.spin += 0.35; ring(b.x, b.y, ph >= 3 ? 12 : 7, 150, 'violet', b.spin); }
      if (ph !== 2 && timer(b, 'summon', bcd(b, 5.5), 3)) { for (let i = 0; i < (ph >= 3 ? 3 : 2); i++) E.spawn('scout', { tint: 110, hpMul: 0.6, noElite: true }); A.play('bossRoar', { vol: 0.4, rate: 1.4 }); }
      if (ph === 2 && timer(b, 'cross', bcd(b, 2.0), 0.8)) { b.xc = !b.xc; ring(b.x, b.y, 8, 190, 'needle', b.xc ? Math.PI / 8 : 0); }
      // души: разлетаются и бросаются в игрока
      if (ph >= 2 && timer(b, 'souls', bcd(b, ph >= 3 ? 2.6 : 2.2), 1.5)) {
        const s = game.bspd(140);
        for (let i = 0; i < 6; i++) { const a = Math.PI / 2 + (i - 2.5) * 0.4; game.ebullet(b.x, b.y + b.h * 0.2, Math.cos(a) * s, Math.sin(a) * s, 'green', { redir: 0.8, redirSpd: game.bspd(230), life: 6 }); }
      }
    },
    // Материнский корабль: выводки дронов и пушки → кислотный дождь и стена с проходом → всё, кроме пушек
    mothership(b) {
      const S = G.S, ph = b.phase;
      if (ph !== 2 && timer(b, 'brood', bcd(b, 4.2), 2)) {
        const n = ph >= 3 ? 5 : 3;
        for (let i = 0; i < n; i++) E.spawn('drone', { x: U.clamp(b.x + U.rand(-0.42, 0.42) * b.w, 20 * S, G.FW - 20 * S), y: b.y + b.h * 0.2, idx: i, amp: 40, noElite: true });
        A.play('teleport', { rate: 0.6, vol: 0.5 });
      }
      if (ph >= 2 && timer(b, 'acid', bcd(b, ph >= 3 ? 3 : 2.3), 1)) { for (let i = 0; i < 8; i++) game.ebullet(b.x + (i - 3.5) * b.w * 0.11, b.y + b.h * 0.3, U.rand(-30, 30) * S, game.bspd(U.rand(110, 140)), 'green'); }
      if (ph !== 3 && timer(b, 'guns', bcd(b, 1.9))) { for (const sd of [-1, 1]) game.aimAt(b.x + sd * b.w * 0.38, b.y + b.h * 0.2, 220, 'bolt'); }
      if (ph >= 2 && timer(b, 'wall', ph >= 3 ? 4.6 : 5.5, 2.5)) {
        const n = Math.round(G.FW / (26 * S)), gap = U.randi(2, n - 5);
        for (let i = 0; i < n; i++) if (i < gap || i > gap + 3) game.ebullet((i + 0.5) * G.FW / n, b.y + b.h * 0.45, 0, game.bspd(140), 'green');
        A.play('enemyShot');
      }
    },
    // Хаос: случайные атаки и глитч-телепорты → по две атаки и перегрев → расплав: спираль обломков, телепорты чаще
    chaos(b) {
      const S = G.S, ph = b.phase;
      if (b.vuln > 0) {
        b.vuln -= b._dt;
        if (Math.random() < b._dt * 18) FX.smoke(b.x + U.rand(-0.3, 0.3) * b.w, b.y + U.rand(-0.3, 0.2) * b.h, 1, 16 * S);
        if (b.vuln <= 0) { FX.ring(b.x, b.y, b.r, b.r * 2.4, '#ff7a2a', 0.4, 4); A.play('bossRoar', { vol: 0.5, rate: 1.4 }); }
        return;
      }
      if (ph >= 2 && timer(b, 'heat', ph >= 3 ? 12 : 9.5, 6)) {
        b.vuln = 2.4;
        FX.text(b.x, b.y - b.h * 0.3, 'ПЕРЕГРЕВ! УРОН ×1.5', '#ffb03d', 16, 1.4, -40);
        A.play('explodeM', { vol: 0.6 });
        return;
      }
      if (timer(b, 'act', bcd(b, ph >= 3 ? 1.6 : ph === 2 ? 2.3 : 2.1), 1.2)) {
        const n = ph >= 2 ? 2 : 1;
        for (let i = 0; i < n; i++) CHAOS_MOVES[U.randi(0, CHAOS_MOVES.length - 1)](b);
      }
      if (ph >= 3 && timer(b, 'melt', bcd(b, 6), 3)) NEW_FIRE.spiral(b, { count: 18, bullet: 'junk', spd: 160 });
      if (timer(b, 'glitch', ph >= 3 ? 3.5 : 5.5, 4)) {
        FX.glowPuff(b.x, b.y, '#ff7a2a', b.w * 1.2, 0.35);
        FX.portal(b.x, b.y, b.w * 0.9, '#ff7a2a', false);
        b.mtOff = U.rand(0, U.TAU);
        b.flashTele = 0.25;
        A.play('teleport', { rate: 0.8 });
      }
    },
    // Тяжёлый крейсер: бортовые залпы и рои ракет → таранные проходы и мины → всё вместе, преследует
    cruiser(b) {
      const S = G.S, ph = b.phase;
      if (ph !== 2 && timer(b, 'broad', bcd(b, 1.6), 1)) {
        const n = 4 + ph;
        for (let i = 0; i < n; i++) {
          const x = b.x + (i / (n - 1) - 0.5) * b.w * 0.8;
          game.ebullet(x, b.y + b.h * 0.3, U.rand(-12, 12) * S, game.bspd(185), 'bolt');
        }
        A.play('enemyShot');
      }
      if (ph !== 2 && timer(b, 'missiles', bcd(b, 3.2), 2.2)) {
        for (let i = 0; i < (ph >= 3 ? 5 : 3); i++) game.after(i * 0.18, () => { if (b.alive) { const s = game.bspd(115); game.ebullet(b.x - b.face * b.w * 0.4, b.y, U.rand(-40, 40) * S, s * 0.6, 'fire', { homing: 1.25, life: 5 }); } });
        A.play('rocket', { rate: 0.7 });
      }
      if (ph >= 2 && !b.dash && timer(b, 'dash', ph >= 3 ? 7.5 : 4.8, 1.5)) {
        const dir = b.x < G.FW / 2 ? 1 : -1;
        b.dash = { t: 0, x0: b.x, y0: b.y, tx: dir > 0 ? G.FW - b.w * 0.42 : b.w * 0.42, dy: 70 * S };
        A.play('rail', { vol: 0.4, rate: 1.4 });
      }
      if (b.dash && timer(b, 'dashfire', 0.22)) game.ebullet(b.x, b.y + b.h * 0.3, 0, game.bspd(230), 'needle');
      if (ph >= 2 && timer(b, 'mines', bcd(b, ph >= 3 ? 4.2 : 3.2), 2)) { for (const sd of [-1, 1]) game.ebullet(b.x + sd * b.w * 0.3, b.y + b.h * 0.3, sd * 30 * S, 45 * S, 'mine', { fuse: 2.2, life: 6, sprite: 'fx_mine_spider', w: 36, r: 12 }); A.play('mine'); }
    },
    // Оверлорд: следящий луч и батарея глаз → элитная стража и тёмная нова → два луча, батарея и столпы
    overlord(b) {
      const S = G.S, p = game.player, ph = b.phase;
      if (ph !== 2 && timer(b, 'eye', bcd(b, 6.2), 2.5)) {
        const n = ph >= 3 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const a0 = Math.atan2(p.y - b.y, p.x - b.x) + (n > 1 ? (i ? 0.45 : -0.45) : 0);
          game.laser({ owner: b, ox: 0, oy: 0.02, ang: a0, track: 0.5, warn: 1.0, dur: 2.4, w: 18 * S, color: '#ff3d6b' });
        }
        A.play('railCharge', { vol: 0.6, rate: 0.8 });
      }
      if (ph !== 2 && (b.age % 5) < 2.8 && timer(b, 'array', ph >= 3 ? 0.16 : 0.2)) {
        b.spin += 0.37;
        ring(b.x, b.y, ph >= 3 ? 5 : 3, 130, 'eye', b.spin);
      }
      if (ph === 2 && timer(b, 'guard', bcd(b, 8), 1.5)) {
        for (let i = 0; i < 2; i++) E.spawn(U.pick(['heavyfighter', 'assault', 'interceptor', 'ghost']), { x: U.clamp(b.x + (i ? 1 : -1) * b.w * 0.45, 30 * S, G.FW - 30 * S), elite: true, hpMul: 0.6 });
        A.play('bossRoar', { vol: 0.4, rate: 1.2 });
      }
      if (ph === 2 && timer(b, 'nova', bcd(b, 4.6), 3)) { for (let k = 0; k < 3; k++) game.after(k * 0.18, () => { if (b.alive) ring(b.x, b.y, 18, 115 + k * 30, 'violet', k * 0.17); }); }
      if (ph >= 3 && timer(b, 'pillar', bcd(b, 4.2))) { for (const x of [p.x, U.rand(0.1, 0.9) * G.FW]) beam(x, b.y + b.h * 0.4, 20 * S, 1.0, 0.5, '#c03dff', b); }
    },
  };
  // движение по фазам: sway — качается по ширине, chase — держится над кораблём, low — опускается ниже и качается быстрее,
  // hold — почти на месте в центре, blink — качается и время от времени телепортируется
  const BOSS_MOVES = {
    guardian: ['sway', 'chase', 'low'], sniper: ['sway', 'blink', 'blink'], kraken: ['sway', 'hold', 'low'],
    phoenix: ['sway', 'chase', 'low'], spider: ['hold', 'chase', 'hold'], dreadnought: ['sway', 'chase', 'low'],
    inquisitor: ['sway', 'chase', 'hold'], queen: ['sway', 'hold', 'low'], necro: ['sway', 'blink', 'blink'],
    mothership: ['sway', 'sway', 'low'], chaos: ['sway', 'sway', 'sway'], cruiser: ['sway', 'sway', 'chase'], overlord: ['hold', 'sway', 'low'],
  };

  // ── 3.1: смена фазы ──
  const PHASE_HP = [2 / 3, 1 / 3];   // пороги прочности 2-й и 3-й фаз
  const PHASE_T = 2.2;               // перестройка между фазами, с (босс неуязвим и не стреляет)
  // урон не перескакивает фазу: прочность упирается в порог, остальное сгорает
  E.bossCap = function (b, dmg) {
    const floor = b.phase < 3 ? b.maxHp * PHASE_HP[b.phase - 1] : 0;
    return floor > 0 ? Math.min(dmg, Math.max(0, b.hp - floor)) : dmg;
  };
  function phaseEnd(b, n) {
    b.phase = n;
    b.trans = PHASE_T;
    b.pt = {}; b.aim = null; b.gat = null; b.dive = null; b.dash = null; b.vuln = 0;
    // экран очищается от пуль — передышка и знак, что бой меняется
    game.clearBulletsAround(G.FW / 2, G.H / 2, G.FW + G.H);
    FX.text(G.FW / 2, G.H * 0.42, 'ФАЗА ' + n, b.bdef.color, 26, 1.9, -18);
    FX.flash(b.bdef.color, 0.2);
    A.play('bossRoar', { rate: 0.8 });
    SS.emit('bossPhase', b);
  }
  function phaseFx(b, dt) {
    const S = G.S, k = 1 - b.trans / PHASE_T;
    // дрожит, искрит и наливается светом
    b.x += Math.sin(b.age * 53) * 1.6 * S * k;
    if (Math.random() < dt * 22) FX.sparks(b.x + U.rand(-0.4, 0.4) * b.w, b.y + U.rand(-0.35, 0.35) * b.h, U.pick(['#ffffff', b.bdef.color]), 4, 220);
    if (Math.random() < dt * 3) FX.ring(b.x, b.y, b.r * 0.4, b.r * (1.2 + k), b.bdef.color, 0.35, 3);
  }
  function phaseStart(b) {
    b.trans = 0;
    FX.ring(b.x, b.y, b.r, b.r * 3, b.bdef.color, 0.6, 6);
    FX.flash(b.bdef.color, 0.3);
    FX.shake(0.5);
    A.play('bossRoar');
    ring(b.x, b.y, b.num === 1 ? 10 : 16, 160, 'orb', Math.random());
    // энергощит Дредноута в новой фазе восстанавливается до половины
    if (b.shieldMax > 0) b.shield = Math.max(b.shield, b.shieldMax * 0.5);
  }

  function bossPattern(b) {
    b.xn = (b.xn || 0) + 1;
    const set = b.phase >= 3 ? ['spiral', 'wall', 'split', 'sine'] : b.num % 2 ? ['spiral', 'split'] : ['wall', 'sine'], k = set[b.xn % set.length];
    const f = { spiral: { count: 16, bullet: 'orb', spd: 150 }, wall: { bullet: 'orb', spd: 115 }, split: { bullet: 'egg', spd: 140, count: 8 }, sine: { bullet: 'blue', spd: 200 } }[k];
    NEW_FIRE[k](b, f, b.x, b.y + b.h * 0.3);
    A.play('enemyShot');
  }
  function updateBoss(b, edt, dt) {
    const S = G.S;
    b._dt = edt;
    b.age += dt;
    b.lastX = b.x;
    if (b.entering) {
      b.y = U.damp(b.y, b.baseY, 2.2, dt) + 30 * S * dt;
      if (b.y >= b.baseY - 4 * S) { b.entering = false; b.y = b.baseY; SS.emit('bossReady', b); }
      return;
    }
    // фазы: на 2/3 и 1/3 прочности босс перестраивается (PHASE_T с неуязвим), потом — новый набор атак
    const ratio = b.hp / b.maxHp;
    if (b.trans > 0) {
      b.trans -= dt;
      phaseFx(b, dt);
      if (b.trans <= 0) phaseStart(b);
      return;
    }
    const want = ratio <= PHASE_HP[1] + 1e-6 ? 3 : ratio <= PHASE_HP[0] + 1e-6 ? 2 : 1;
    if (want > b.phase) { phaseEnd(b, want); return; }
    // «Кошмар» и «Бог войны»: ярость на последних 15% прочности — все атаки чаще
    if (b.phase === 3 && !b.rage && ratio <= 0.15 && game.diff.bossRage) {
      b.rage = true;
      SS.emit('toast', { ico: '😡', title: 'ЯРОСТЬ', text: b.bdef.name + ' в ярости — атаки чаще!', info: true, dur: 2200 });
      FX.vignette('#ff2a48', 1.6, 0.6, true);
    }
    // 3.0: во 2-й фазе — дополнительная атака из новых паттернов, в 3-й чаще (свой набор у каждого босса)
    if (b.phase >= 2 && timer(b, 'xpat', bcd(b, b.rage ? 4 : b.phase >= 3 ? 5.5 : 7.5), 3)) bossPattern(b);
    // движение
    if (b.dive) {
      const d = b.dive;
      d.t += edt;
      const k = d.t < 0.6 ? U.easeInOut(d.t / 0.6) : d.t < 1.0 ? 1 : 1 - U.easeInOut(Math.min(1, (d.t - 1.0) / 0.8));
      b.x = U.lerp(d.x0, d.tx, k); b.y = U.lerp(d.y0, d.ty, k);
      if (d.t > 1.8) b.dive = null;
    } else if (b.dash) {
      const d = b.dash;
      d.t += edt;
      const k = U.easeInOut(Math.min(1, d.t / 1.4));
      b.x = U.lerp(d.x0, d.tx, k);
      b.y = d.y0 + Math.sin(Math.min(1, d.t / 1.4) * Math.PI) * d.dy;
      if (d.t >= 1.5) { b.dash = null; b.mt = Math.asin(U.clamp((b.x - G.FW / 2) / Math.max(1, (G.FW / 2 - b.w * 0.5) * 0.85), -1, 1)) / 0.55; }
    } else {
      b.mt += edt;
      const id = b.bdef.id, mode = (BOSS_MOVES[id] || [])[b.phase - 1] || 'sway';
      let speed = id === 'mothership' || id === 'overlord' ? 0.3 : id === 'cruiser' || id === 'queen' ? 0.4 : id === 'chaos' ? 0.7 : 0.55;
      const span = Math.max(0, G.FW / 2 - b.w * 0.5) * 0.85;
      if (mode === 'low') speed *= 1.3;
      let tx = G.FW / 2 + Math.sin(b.mt * speed + (b.mtOff || 0)) * span * (mode === 'hold' ? 0.25 : 1);
      if (mode === 'chase') tx = U.clamp(game.player.x, G.FW / 2 - span, G.FW / 2 + span);
      if (id === 'chaos') tx += Math.sin(b.age * 7.3) * 12 * S;
      // ниже — но не ближе середины экрана к кораблю
      const ty = (mode === 'low' ? Math.min(b.baseY + G.H * 0.08, G.H * 0.5 - b.h * 0.3) : b.baseY) + Math.sin(b.mt * 1.1) * G.H * 0.03;
      // телепорт: исчезает в портале и появляется в другой точке своего маршрута
      if (mode === 'blink' && timer(b, 'blink', 4.5, 3)) {
        FX.glowPuff(b.x, b.y, b.bdef.color, b.w * 1.4, 0.4);
        FX.portal(b.x, b.y, b.w * 0.9, b.bdef.color, false);
        b.mtOff = U.rand(0, U.TAU);
        A.play('teleport');
        b.flashTele = 0.3;
        ring(b.x, b.y, 10, 160, 'dot', U.rand(0, 1));
      }
      b.x = U.damp(b.x, tx, b.flashTele > 0 ? 30 : mode === 'chase' ? 1.4 : 3, dt);
      b.y = U.damp(b.y, ty, 3, dt);
    }
    // горизонтальные корабли смотрят по ходу движения
    const vx = (b.x - b.lastX) / Math.max(dt, 0.001);
    if (Math.abs(vx) > 12 * S) b.face = vx > 0 ? 1 : -1;
    b.fx = U.damp(b.fx, horizFlip(b), 7, dt);
    if (b.flashTele > 0) b.flashTele -= dt;
    if (b.frozen > 0) b.frozen -= dt;
    if (game.player.alive) BOSS[b.bdef.id](b);
    // искры повреждённого босса
    if (b.phase >= 2 && Math.random() < dt * (b.phase >= 3 ? 8 : 3)) {
      const x = b.x + U.rand(-0.35, 0.35) * b.w, y = b.y + U.rand(-0.3, 0.3) * b.h;
      FX.sparks(x, y, '#ffcf6b', 3, 160);
      if (b.phase >= 3) FX.smoke(x, y, 1, 14 * S);
    }
  }

  function bossDeath(b) {
    if (b.bdef.id === 'phoenix' && !b.reborn) {
      b.reborn = true;
      b.hp = b.maxHp * 0.3;
      FX.explode(b.x, b.y, 3, '#ff6a2a');
      FX.flash('#ffb03d', 0.5);
      FX.text(b.x, b.y, 'ВОЗРОЖДЕНИЕ!', '#ffb03d', 20, 1.4);
      A.play('bossRoar');
      SS.emit('toast', { ico: '🔥', title: 'БОСС', text: 'Феникс возрождается из пепла!', info: true });
      return;
    }
    b.alive = false;
    game.boss = null;
    E.corpses.push({ x: b.x, y: b.y, w: b.w, h: b.h, cv: b.cv, sprite: b.sprite, rot: b.fallback ? 0 : b.bdef.rot || 0, flip: b.fx < 0 ? -1 : 1, t: 0, dur: 1.6, color: b.bdef.color });
    FX.shake(0.7);
    SS.tg.haptic('success');
    if (b.bdef.id === 'overlord') SS.meta.unlock('overlord');
    game.onBossDefeated(b);
    SS.emit('intensity');
  }

  // горизонтальные спрайты: «смотрят» влево (босс) или вправо (Рейдер, миноукладчик, био-мех) — отражаем по ходу движения
  function horizFlip(e) {
    if (e.boss) return (e.sprite === 'b_mothership' || e.sprite === 'b_heavycruiser') && e.face > 0 ? -1 : 1;
    if (e.horiz) return e.vx < 0 ? -1 : 1;
    return 1;
  }

  // ════════════════════════════════════════════════════════════
  // ОТРИСОВКА
  // ════════════════════════════════════════════════════════════
  E.drawAll = function (ctx) {
    const S = G.S;
    // останки боссов
    for (const c of E.corpses) {
      const k = c.t / c.dur;
      ctx.save();
      ctx.translate(c.x + U.rand(-3, 3) * S * k, c.y + U.rand(-3, 3) * S * k);
      if (c.rot) ctx.rotate(c.rot);
      if (c.flip < 0) ctx.scale(-1, 1);
      ctx.globalAlpha = 1 - k * 0.6;
      drawFrame(ctx, c.sprite, c.cv, c.w, c.h);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = k * 0.8;
      const wh = G.white(c.sprite);
      if (wh) ctx.drawImage(wh, -c.w / 2, -c.h / 2, c.w, c.h);
      ctx.restore();
    }
    for (const e of game.enemies) {
      if (!e.alive) continue;
      if (e.boss) { drawBoss(ctx, e); continue; }
      const def = e.def;
      if (e.tint && !e.cv) e.cv = G.tinted(e.sprite, e.tint);
      // полоса удара тарана
      if (def.ai === 'ram' && e.st === 2) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.16 + 0.14 * Math.abs(Math.sin(e.age * 20));
        ctx.fillStyle = '#ff3d3d';
        ctx.fillRect(e.lane - e.w * 0.35, e.y, e.w * 0.7, G.H - e.y);
        ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(e.age * 10));
        G.draw(ctx, 'fx_warn', e.lane, G.H * 0.8, 26 * S);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = e.alpha;
      // аура элиты / заморозка
      if (e.elite || e.frozen > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = e.alpha * (0.35 + Math.sin(e.age * 6) * 0.12);
        const gs = e.w * 1.6;
        ctx.drawImage(G.soft(e.frozen > 0 ? '#9be8ff' : '#ffc83d', 64), -gs / 2, -gs / 2, gs, gs);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = e.alpha;
      }
      // предупреждение камикадзе/охотника
      if ((def.ai === 'kamikaze' || def.ai === 'hunter') && e.st === 1) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(e.age * 40);
        const gs = e.w * 1.8;
        ctx.drawImage(G.glow('#ff3d5a', 64), -gs / 2, -gs / 2, gs, gs);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = e.alpha;
      }
      // заряд ионного луча
      if (def.ai === 'ion' && e.st === 2) {
        ctx.globalCompositeOperation = 'lighter';
        const k = 1 - Math.max(0, e.charge) / 0.85, gs = e.w * (0.6 + k * 1.2);
        ctx.globalAlpha = 0.5 + 0.5 * k;
        ctx.drawImage(G.glow('#7ff6ff', 64), -gs / 2, e.h * 0.4 - gs / 2, gs, gs);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = e.alpha;
      }
      if (e.horiz) {
        if (horizFlip(e) < 0) ctx.scale(-1, 1);
      } else if (e.spinAng !== undefined) {
        ctx.rotate(e.spinAng);
      } else {
        let rot = (def.rot !== undefined ? def.rot : Math.PI) + e.bank;
        if ((def.ai === 'kamikaze' || def.ai === 'hunter') && e.st >= 1 && e.dir !== undefined) rot = e.dir - Math.PI / 2;
        if ((e.ai === 'diver' && e.st === 2) || e.ai === 'flank') rot = (def.rot !== undefined ? def.rot : Math.PI) + e.dir - Math.PI / 2;
        if (e.larva) rot = e.dir - Math.PI / 2;
        ctx.rotate(rot);
      }
      drawFrame(ctx, e.sprite, e.cv, e.w, e.h);
      if (e.flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, e.flash * 12) * 0.8;
        const wh = G.white(e.sprite);
        if (wh) ctx.drawImage(wh, -e.w / 2, -e.h / 2, e.w, e.h);
      }
      ctx.restore();
      const bubble = G.frame('fx_sh_bubble');
      // энергобарьер Редута
      if (e.barrier > 0) {
        const r = e.w * 0.62;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.3 + 0.15 * Math.sin(e.age * 14) + (e.shieldHitT > 0 ? 0.35 : 0);
        if (bubble) G.drawCanvas(ctx, G.tinted('fx_sh_bubble', { hue: 275 }), e.x, e.y, r * 2.25, 0);
        else ctx.drawImage(G.soft('#b06bff', 64), e.x - r * 1.2, e.y - r * 1.2, r * 2.4, r * 2.4);
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = e.shieldHitT > 0 ? '#ffffff' : '#d9b8ff'; ctx.lineWidth = 2 * S;
        ctx.beginPath(); ctx.arc(e.x, e.y, r, e.age * 3, e.age * 3 + U.TAU * 0.85); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      // щит
      if (e.shield > 0) {
        const r = e.w * 0.66, k = e.shield / e.shieldMax;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.18 + k * 0.2 + (e.shieldHitT > 0 ? 0.4 : 0);
        if (bubble) G.draw(ctx, 'fx_sh_bubble', e.x, e.y, r * 2.25);
        else ctx.drawImage(G.soft('#4cb8ff', 64), e.x - r * 1.15, e.y - r * 1.15, r * 2.3, r * 2.3);
        ctx.globalAlpha = 0.5 + k * 0.4;
        ctx.strokeStyle = e.shieldHitT > 0 ? '#ffffff' : '#7fd8ff'; ctx.lineWidth = 2 * S;
        ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, U.TAU * k); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      // прицел снайпера
      if ((def.ai === 'kamikaze' || def.ai === 'hunter') && e.st === 1) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(e.age * 12));
        G.draw(ctx, 'fx_warn', e.x, e.y - e.h * 0.7, 24 * S);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      if (def.ai === 'sniper' && (e.st === 1 || e.st === 2) && e.aim !== undefined) {
        const locked = e.st === 2;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = locked ? 0.55 + 0.45 * Math.sin(e.age * 50) : 0.28;
        ctx.strokeStyle = '#ff3d5a'; ctx.lineWidth = locked ? 2 * S : 1 * S;
        ctx.beginPath(); ctx.moveTo(e.x, e.y + e.h * 0.3); ctx.lineTo(e.x + Math.cos(e.aim) * 1400, e.y + Math.sin(e.aim) * 1400); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      // полоса прочности: у мини-боссов и элиты всегда, у остальных — 1,5 с после попадания и гаснет (3.1: меньше мусора на экране)
      const barA = e.mini || e.elite ? 1 : U.clamp((1.5 - (game.t - (e.hitT || -9))) / 0.4, 0, 1);
      if (e.hp < e.maxHp && e.alpha > 0.5 && barA > 0 && (e.mini || e.maxHp > 60 || e.elite)) {
        const bw = e.mini ? Math.min(e.w * 0.8, 120 * S) : Math.max(24 * S, e.w * 0.5), bh = e.mini ? 5 * S : 2.5 * S;
        const bx = e.x - bw / 2, by = Math.max(e.y - e.h * 0.55 - 6 * S, (SS.ui ? SS.ui.topInset() : 120) - 32);
        ctx.globalAlpha = barA;
        ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
        const k = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = e.mini ? '#ff5c4d' : k > 0.5 ? '#3dffa2' : k > 0.25 ? '#ffc83d' : '#ff4d5e';
        ctx.fillRect(bx, by, bw * k, bh);
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  function drawFrame(ctx, sprite, cv, w, h) {
    if (cv) { ctx.drawImage(cv, -w / 2, -h / 2, w, h); return; }
    const f = G.frame(sprite), img = f && G.src(f);
    if (img) ctx.drawImage(img, f[0], f[1], f[2], f[3], -w / 2, -h / 2, w, h);
  }

  function drawBoss(ctx, b) {
    const S = G.S, t = b.age;
    const col = b.bdef.color;
    // орбиты феникса
    if (b.orbs.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const o of b.orbs) {
        if (o.x === undefined) continue;
        const s = 30 * S;
        ctx.drawImage(G.glow('#ff9f3d', 64), o.x - s, o.y - s, s * 2, s * 2);
        if (G.frame('fx_plasma2')) G.draw(ctx, 'fx_plasma2', o.x, o.y, s * 1.7, t * 2);
        else G.draw(ctx, 'eb_fire', o.x, o.y, s * 1.1, t * 3);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.save();
    ctx.translate(b.x, b.y + Math.sin(t * 1.6) * 3 * S);
    // свечение ядра (у перегретого Хаоса — красное и пульсирующее)
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = b.vuln > 0 ? 0.55 + 0.35 * Math.sin(t * 18) : 0.35 + 0.15 * Math.sin(t * 4);
    const gs = Math.max(b.w, b.h) * 1.15;
    ctx.drawImage(G.soft(b.vuln > 0 ? '#ff3d1a' : col, 64), -gs / 2, -gs / 2, gs, gs);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = b.entering ? 0.85 : 1;
    ctx.rotate((b.fallback ? 0 : b.bdef.rot || 0) + Math.sin(t * 0.8) * 0.03);
    if (b.fx !== 1) ctx.scale((b.fx < 0 ? -1 : 1) * Math.max(0.12, Math.abs(b.fx)), 1);
    drawFrame(ctx, b.sprite, b.cv, b.w, b.h);
    if (b.flash > 0 || b.entering || b.flashTele > 0 || b.vuln > 0 || b.trans > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = b.trans > 0 ? 0.25 + 0.45 * (1 - b.trans / PHASE_T) * Math.abs(Math.sin(t * 10)) : b.entering ? 0.25 + 0.15 * Math.sin(t * 12) : b.vuln > 0 ? 0.2 + 0.2 * Math.abs(Math.sin(t * 12)) : Math.min(1, b.flash * 10) * 0.55;
      const wh = G.white(b.sprite);
      if (wh) ctx.drawImage(wh, -b.w / 2, -b.h / 2, b.w, b.h);
    }
    ctx.restore();
    if (b.vuln > 0 && G.frame('fx_crosshair')) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(t * 9));
      G.draw(ctx, 'fx_crosshair', b.x, b.y, Math.min(b.w, b.h) * 0.6 * (1 + Math.sin(t * 9) * 0.06), t * 0.9);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // энергощит
    if (b.shield > 0) {
      const k = b.shield / b.shieldMax, r = Math.max(b.w, b.h) * 0.6;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.12 + k * 0.18 + (b.shieldHitT > 0 ? 0.3 : 0);
      if (G.frame('fx_sh_bubble')) G.draw(ctx, 'fx_sh_bubble', b.x, b.y, r * 2.2);
      else ctx.drawImage(G.soft('#3db8ff', 64), b.x - r * 1.2, b.y - r * 1.2, r * 2.4, r * 2.4);
      ctx.strokeStyle = b.shieldHitT > 0 ? '#ffffff' : '#7fd8ff';
      ctx.lineWidth = 2.5 * S;
      ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.arc(b.x, b.y, r, t * 0.8, t * 0.8 + U.TAU * 0.86); ctx.stroke();
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.arc(b.x, b.y, r * 0.9, -t * 1.1, -t * 1.1 + U.TAU * 0.6); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // прицелы снайпера
    if (b.aim && b.aim.ang) {
      const locked = b.aim.t <= 0.22;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#ff3d5a';
      ctx.lineWidth = (locked ? 2.2 : 1) * S;
      ctx.globalAlpha = locked ? 0.6 + 0.4 * Math.sin(t * 50) : 0.3;
      [-1, 1].forEach((sd, i) => {
        const x = b.x + sd * b.w * 0.32, y = b.y + b.h * 0.2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(b.aim.ang[i]) * 1500, y + Math.sin(b.aim.ang[i]) * 1500); ctx.stroke();
      });
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }
})();
