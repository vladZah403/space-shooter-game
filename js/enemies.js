// ════════════════════════════════════════════════════════════════
// SPACE SHOOTER 2.0 — враги и боссы
//  поведение (ИИ), схемы стрельбы, группы и строи,
//  3 мини-босса и 8 боссов с тремя фазами атак
// ════════════════════════════════════════════════════════════════
'use strict';

(function () {
  const U = SS.util, D = SS.data;
  let G, FX, A, game;
  let uid = 100000;

  const COLORS = {
    scout: '#ff5c4d', drone: '#5cff7a', shooter: '#c06bff', assault: '#3dffd0', kamikaze: '#ff9f3d', interceptor: '#cfd8ff',
    heavy: '#ffd23d', splitter: '#7dff6b', bomber: '#aab4d8', sniper: '#5cb8ff', shielder: '#7fd8ff', techno: '#ff5c7a',
    hunter: '#b06bff', armored: '#ff9f3d', heavyfighter: '#ff4d5e', bombardier: '#ffb03d', redoubt: '#c48bff', cruiser: '#ff5c7a',
    gunship: '#ff4d4d', destroyer: '#ff8a3d', cruiser_h: '#ff4d6d',
  };

  // стоимость врага в «бюджете» волны
  const COST = { scout: 1, drone: 0.55, shooter: 2, assault: 2, kamikaze: 1.2, interceptor: 2.5, heavy: 5, splitter: 2.2,
    bomber: 4, sniper: 3, shielder: 4.5, techno: 3.5, hunter: 3.5, armored: 8, heavyfighter: 4.5, bombardier: 5, redoubt: 5.5,
    cruiser: 9, gunship: 0, destroyer: 0, cruiser_h: 0 };

  // эллиптические хитбоксы для крупных вытянутых кораблей (доли ширины/высоты спрайта)
  const HITBOX = {
    boss: [0.4, 0.38], b_spider: [0.3, 0.34], b_battleship: [0.4, 0.43], b_battleship2: [0.4, 0.43],
    b_mothership: [0.45, 0.32], b_heavycruiser: [0.45, 0.32], e_destroyer: [0.38, 0.44], e_cruiser_h: [0.45, 0.3],
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
    return game.diff.hp * (1 + (w - 1) * 0.14) * (1 + Math.max(0, w - 20) * 0.05);
  };

  E.spawn = function (type, o) {
    o = o || {};
    const def = D.ENEMIES[type];
    if (!def) return null;
    const S = G.S, wn = game.wave ? game.wave.n : 1, diff = game.diff;
    const elite = !def.mini && !o.noElite && !o.child && Math.random() < diff.elite + Math.max(0, wn - 15) * 0.004;
    // в дальних секторах флот противника обновляется — новые облики кораблей
    const sprite = def.alt && wn > 10 && Math.random() < 0.6 ? def.alt : def.sprite;
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
      elite, isChild: !!o.child,
      tint: elite ? { hue: 44, bright: 0.08 } : (o.tint !== undefined ? { hue: o.tint } : def.tint !== undefined ? { hue: def.tint } : null),
      cv: null, age: 0, phase: Math.random() * U.TAU, st: 0, t: 0, n: 0,
      fireT: U.rand(0.9, 1.8), fireT2: U.rand(1.6, 2.8), flash: 0, frozen: 0, alpha: 1, bank: 0, lastX: 0, leaving: false, barrier: 0,
      shield: def.shield ? def.shield * E.hpScale() : 0, shieldMax: def.shield ? def.shield * E.hpScale() : 0, shieldHitT: 0, shieldRegenWait: 0,
      spd: def.spd * S * diff.spd * (1 + Math.min(wn, 30) * 0.01) * (elite ? 1.08 : 1),
      ty: 0, baseX: 0, amp: 0, dir: 0, face: 1,
    };
    if (def.mini) setHitbox(e, sprite);
    e.lastX = e.x;
    e.baseX = e.x;
    const init = INIT[def.ai];
    if (init) init(e, o);
    if (e.ty) e.ty = Math.max(e.ty, minY(e));
    game.enemies.push(e);
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
    gunship(e) { e.ty = 0.17 * G.H; e.x = G.FW / 2; e.vx = e.spd * 0.6; e.pat = 0; e.patT = 2; },
    destroyer(e) { e.ty = 0.16 * G.H; e.x = G.FW / 2; e.vx = e.spd * 0.5; e.pat = 0; e.patT = 2.2; },
    flyby(e) {
      e.face = Math.random() < 0.5 ? 1 : -1;
      e.x = e.face > 0 ? -e.w * 0.55 : G.FW + e.w * 0.55;
      e.ty = Math.max(minY(e), G.H * 0.16);
      e.y = e.ty;
      e.vx = e.face * e.spd;
      e.passes = 0; e.broadT = 0.6; e.misT = 1.5;
    },
  };

  // группы и строи
  E.spawnGroup = function (wn, budgetLeft) {
    const pool = Object.keys(D.ENEMIES).filter((k) => {
      const d = D.ENEMIES[k];
      return d.weight > 0 && d.wave <= wn && COST[k] <= Math.max(budgetLeft, 1.2);
    });
    if (!pool.length) return 1;
    const type = U.pickWeighted(pool, (k) => D.ENEMIES[k].weight * (k === 'scout' ? Math.max(0.35, 1 - wn * 0.04) : 1));
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
    } else {
      E.spawn(type);
      cost = COST[type];
    }
    return Math.max(cost, 0.5);
  };

  // мини-боссы по очереди: Ганшип → Эсминец → Рейдер
  E.spawnMini = function (wn) {
    const order = ['gunship', 'destroyer', 'cruiser_h'];
    const k = Math.max(0, Math.floor((wn - 8) / 5)) % order.length;
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

  // ════════════════════════════════════════════════════════════
  // СТРЕЛЬБА
  // ════════════════════════════════════════════════════════════
  function fireRate() {
    const wn = game.wave ? game.wave.n : 1;
    return game.diff.fire * (1 + Math.min(wn, 40) * 0.015);
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
      const p = game.player, base = Math.atan2(p.y - my, p.x - mx);
      for (let i = 0; i < f.count; i++) { const a = base + (i / (f.count - 1) - 0.5) * f.spread; const s = game.bspd(f.spd); game.ebullet(mx, my, Math.cos(a) * s, Math.sin(a) * s, f.bullet); }
    } else if (k === 'ring') {
      const s = game.bspd(f.spd);
      for (let i = 0; i < f.count; i++) { const a = i / f.count * U.TAU + e.age; game.ebullet(e.x, e.y, Math.cos(a) * s, Math.sin(a) * s, f.bullet); }
    } else if (k === 'twin') { for (const sd of [-1, 1]) game.aimAt(e.x + sd * e.w * 0.28, my, f.spd, f.bullet); }
    else if (k === 'mine') { game.ebullet(e.x, e.y + e.h * 0.1, e.vx * 0.2, 50 * S, 'mine', { fuse: 1.9, life: 6 }); A.play('mine'); return; }
    A.play('enemyShot');
  }
  function tickFire(e, dt) {
    const f = e.def.fire;
    if (f && f.cd && !(f.from && game.wave.n < f.from)) {
      e.fireT -= dt;
      if (e.fireT <= 0) {
        e.fireT = f.cd / fireRate() * U.rand(0.8, 1.2) * (e.elite ? 0.75 : 1);
        if (canShoot(e)) doFire(e, f);
      }
    }
    // второе орудие у тяжёлых кораблей
    const f2 = e.def.fire2;
    if (f2) {
      e.fireT2 -= dt;
      if (e.fireT2 <= 0) {
        e.fireT2 = f2.cd / fireRate() * U.rand(0.85, 1.15);
        if (canShoot(e)) doFire(e, f2);
      }
    }
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
        e.y = U.damp(e.y, e.ty, 2.2, dt) + 12 * G.S * dt;
        if (e.y >= e.ty - 6 * G.S) { e.st = 1; e.vx = U.sign(Math.random() - 0.5) * e.spd * 0.55; }
      } else if (e.st === 1) {
        e.t += dt;
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
        e.y = U.damp(e.y, e.ty, 2.4, dt) + 10 * S * dt;
        if (e.y >= e.ty - 6 * S) { e.st = 1; e.t = 0.5; }
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
        e.y = U.damp(e.y, e.ty, 1.2, dt) + 8 * G.S * dt;
        if (e.y >= e.ty - 6 * G.S) { e.st = 1; e.vx = U.sign(Math.random() - 0.5) * e.spd * 0.6; }
      } else if (e.st === 1) {
        e.t += dt;
        strafe(e, dt);
        e.y = e.ty + Math.sin(e.age + e.phase) * 5 * G.S;
        if (e.t > e.stay) e.st = 2;
      } else leave(e, dt);
      tickFire(e, dt);
    },
    bomber(e, dt) {
      e.x += e.vx * dt;
      e.y = e.baseY + Math.sin(e.age * 1.8) * 10 * G.S;
      tickFire(e, dt);
      if ((e.vx > 0 && e.x > G.FW + e.w) || (e.vx < 0 && e.x < -e.w)) { e.leaving = true; e.alive = false; }
    },
    sniper(e, dt) {
      const p = game.player, S = G.S, f = e.def.fire;
      if (e.st === 0) {
        e.y = U.damp(e.y, e.ty, 2, dt) + 10 * S * dt;
        if (e.y >= e.ty - 5 * S) { e.st = 1; e.t = 1.2; }
      } else if (e.st === 1) {
        e.t -= dt;
        e.aim = Math.atan2(p.y - e.y, p.x - e.x);
        if (e.t <= 0) { e.st = 2; e.t = 0.3; }
      } else if (e.st === 2) {
        e.t -= dt;
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
          e.x = U.rand(e.w, G.FW - e.w); e.y = U.rand(minY(e), Math.max(minY(e) + 20, G.H * 0.45));
          FX.glowPuff(e.x, e.y, '#ff5c7a', 60 * S, 0.35);
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
        e.y = U.damp(e.y, e.ty, 1.6, dt) + 8 * G.S * dt;
        if (e.y >= e.ty - 6 * G.S) { e.st = 1; e.vx = U.sign(Math.random() - 0.5) * e.spd * 0.5; e.barrier = 1.6; }
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

  // ════════════════════════════════════════════════════════════
  // ОБНОВЛЕНИЕ
  // ════════════════════════════════════════════════════════════
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
      const ai = AI[e.def.ai];
      if (ai) ai(e, edt2);
      if (!e.horiz) e.bank = U.damp(e.bank, U.clamp((e.x - e.lastX) / Math.max(edt2, 0.001) * 0.0012, -0.35, 0.35), 8, dt);
      if (e.y > H + e.h + 20 || e.y < -H) { e.alive = false; e.leaving = true; }
    }
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
        FX.explode(c.x, c.y, 4, c.color);
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
    FX.explode(e.x, e.y, size, size > 1.4 ? '#ffb03d' : col);
    if (e.mini) { FX.explode(e.x - e.w * 0.25, e.y, 1.4, col); FX.explode(e.x + e.w * 0.25, e.y, 1.4, '#ffb03d'); }
    if (FX.quality > 0) FX.debris(e.x, e.y, col, Math.round(size * 3), 140);
    A.play(size > 1.5 ? 'explodeM' : 'explodeS', { vol: size > 1.5 ? 0.8 : 0.6 });
    if (size > 1.5) FX.shake(e.mini ? 0.45 : 0.18);
    if (e.mini) { FX.flash('#ffd9a0', 0.25); SS.tg.haptic('heavy'); }
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
  E.spawnBoss = function (n) {
    const num = Math.max(1, Math.round(n / 5));
    const bdef = D.BOSSES[(num - 1) % D.BOSSES.length];
    const cycle = Math.floor((num - 1) / D.BOSSES.length);
    const S = G.S, diff = game.diff;
    // первый босс мягче — это первое серьёзное испытание для новичка
    const hp = 2400 * bdef.hp * diff.hp * (1 + (num - 1) * 0.6) * (1 + cycle * 0.5) * (num === 1 ? 0.75 : 1);
    const w = Math.min(G.FW * bdef.wf, bdef.wmax * S);
    const asp = G.aspect(bdef.sprite);
    const h = w * asp;
    const b = {
      uid: uid++, type: 'boss', def: { coins: 0, xp: 0, score: 0 }, bdef, sprite: bdef.sprite, boss: true, mini: false,
      alive: true, hittable: true, entering: true,
      x: G.FW / 2, y: -h * 0.6, w, h, r: w * 0.37, rx: 0, ry: 0,
      hp, maxHp: hp, phase: 1, age: 0, mt: 0, flash: 0, frozen: 0, alpha: 1, bank: 0, face: -1, lastX: G.FW / 2,
      shield: bdef.shield ? hp * bdef.shield * 0.4 : 0, shieldMax: bdef.shield ? hp * bdef.shield * 0.4 : 0, shieldHitT: 0, shieldRegenWait: 0, fx: 1,
      cv: bdef.hue !== undefined && bdef.hue !== null ? G.tinted(bdef.sprite, { hue: bdef.hue }) : null,
      // корпус целиком ниже полосы босса, но не ниже середины экрана
      baseY: Math.max(G.H * 0.2, Math.min((SS.ui ? SS.ui.topInset() : 120) + h * 0.5 + 4 * S, G.H * 0.52 - h * 0.5)), reborn: false, cycle, num,
      pt: {}, orbs: [], spin: 0, aim: null, dive: null, dash: null,
    };
    setHitbox(b, bdef.sprite);
    if (bdef.id === 'phoenix') for (let i = 0; i < 3; i++) b.orbs.push({ a: i / 3 * U.TAU });
    game.boss = b;
    game.enemies.push(b);
    game.run.bossDamaged = false;
    A.play('bossRoar');
    FX.shake(0.4);
    SS.emit('bossSpawn', b);
    SS.emit('intensity');
  };

  function bcd(b, base) { return base / Math.pow(game.diff.fire, 0.55) / (1 + (b.phase - 1) * 0.18) / (1 + b.cycle * 0.12) * (b.num === 1 ? 1.3 : 1); }
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

  const BOSS = {
    guardian(b) {
      if (timer(b, 'fan', bcd(b, 1.7), 1)) { fan(b.x, b.y + b.h * 0.35, [5, 7, 9][b.phase - 1], 0.95, 210, 'bolt'); A.play('enemyShot'); }
      if (b.phase >= 2 && timer(b, 'ring', bcd(b, 2.6))) { b.spin += 0.3; ring(b.x, b.y, 14, 150, 'orb', b.spin); }
      if (b.phase >= 3 && timer(b, 'rain', bcd(b, 1.0))) { for (let i = 0; i < 3; i++) game.ebullet(U.rand(0.05, 0.95) * G.FW, -10, 0, game.bspd(170), 'fire'); }
    },
    sniper(b) {
      if (!b.aim && timer(b, 'snipe', bcd(b, 2.4), 1.2)) b.aim = { t: 0.95 };
      if (b.aim) {
        b.aim.t -= b._dt;
        if (b.aim.t > 0.22) b.aim.ang = [-1, 1].map((sd) => Math.atan2(game.player.y - (b.y + b.h * 0.2), game.player.x - (b.x + sd * b.w * 0.32)));
        if (b.aim.t <= 0) {
          [-1, 1].forEach((sd, i) => {
            const n = b.phase >= 3 ? 3 : 1;
            for (let k = 0; k < n; k++) { const a = b.aim.ang[i] + (k - (n - 1) / 2) * 0.1; const s = game.bspd(560); game.ebullet(b.x + sd * b.w * 0.32, b.y + b.h * 0.2, Math.cos(a) * s, Math.sin(a) * s, 'long'); }
          });
          A.play('laser', { rate: 0.5 });
          b.aim = null;
        }
      }
      if (b.phase >= 2 && timer(b, 'sweep', bcd(b, 3.2))) fan(b.x, b.y + b.h * 0.3, 9, 1.7, 170, 'orb', Math.PI / 2);
      if (b.phase >= 3 && timer(b, 'tele', 4.5)) {
        FX.glowPuff(b.x, b.y, b.bdef.color, b.w * 1.4, 0.4);
        b.mtOff = U.rand(0, U.TAU);
        A.play('teleport');
        b.flashTele = 0.3;
        ring(b.x, b.y, 10, 160, 'dot', U.rand(0, 1));
      }
    },
    // Паук-реактор: вращающиеся спирали из «лап» и выводок дронов
    spider(b) {
      b.spinCycle = (b.spinCycle || 0) + b._dt;
      const cyc = b.spinCycle % 4;
      if (cyc < 2.6 && timer(b, 'arm', 0.12)) {
        const arms = 3 + b.phase;
        b.spin += 0.23;
        ring(b.x, b.y, arms, 145, 'violet', b.spin);
      }
      if (timer(b, 'spawn', bcd(b, 6.5), 3)) {
        for (let i = 0; i < 2 + b.phase; i++) E.spawn('drone', { x: b.x + (i - (1 + b.phase) / 2) * 30 * G.S, y: b.y + b.h * 0.3, idx: i, amp: 30, noElite: true });
      }
      if (b.phase >= 3 && timer(b, 'tent', bcd(b, 2.8))) { for (const sd of [-1, 1]) for (let k = 0; k < 4; k++) game.after(k * 0.1, () => { if (b.alive) game.aimAt(b.x + sd * b.w * 0.35, b.y + b.h * 0.25, 230, 'needle'); }); }
    },
    dreadnought(b) {
      const S = G.S;
      if (timer(b, 'beam', bcd(b, 3.4), 1.5)) {
        const xs = [game.player.x];
        if (b.phase >= 3) xs.push(U.clamp(game.player.x + U.pick([-1, 1]) * U.rand(90, 150) * S, 20 * S, G.FW - 20 * S));
        for (const x of xs) game.ov.beams.push({ x, y0: b.y + b.h * 0.35, w: 22 * S, warn: 1.0, dur: 0.6, t: 0, color: '#3db8ff', hitDone: false });
        A.play('railCharge', { vol: 0.5, rate: 1.3 });
      }
      if (b.phase >= 2 && timer(b, 'missile', bcd(b, 3.0))) {
        for (const sd of [-1, 0, 1]) { const s = game.bspd(120); game.ebullet(b.x + sd * b.w * 0.35, b.y + b.h * 0.3, sd * s * 0.4, s, 'fire', { homing: 1.3, life: 5 }); }
        A.play('rocket', { rate: 0.7 });
      }
      if (timer(b, 'cannon', bcd(b, 1.5))) { for (const sd of [-1, 1]) game.aimAt(b.x + sd * b.w * 0.42, b.y + b.h * 0.25, 230, 'bolt'); }
      // восстановление энергощита
      if (b.shieldMax > 0 && b.shield < b.shieldMax) {
        b.shieldRegenWait -= b._dt;
        if (b.shieldRegenWait <= 0) b.shield = Math.min(b.shieldMax, b.shield + b.shieldMax * 0.2 * b._dt);
      }
    },
    phoenix(b) {
      const S = G.S, p = game.player;
      const want = 2 + b.phase + (b.reborn ? 1 : 0);
      while (b.orbs.length < want) b.orbs.push({ a: Math.random() * U.TAU });
      const R = b.w * 0.64;
      for (const o of b.orbs) {
        o.a += b._dt * (1.4 + b.phase * 0.25);
        o.x = b.x + Math.cos(o.a) * R; o.y = b.y + Math.sin(o.a) * R * 0.8;
        if (p.alive && Math.hypot(o.x - p.x, o.y - p.y) < 14 * S + p.r) game.hitPlayer(o.x, o.y);
      }
      if (timer(b, 'burst', bcd(b, 1.9), 1.2)) { b.spin += 0.4; ring(b.x, b.y, [10, 14, 18][b.phase - 1], 150, b.phase >= 3 ? 'fire' : 'orb', b.spin); }
      if (b.phase >= 2 && !b.dive && timer(b, 'dive', 5.5)) b.dive = { t: 0, x0: b.x, y0: b.y, tx: p.x, ty: Math.min(p.y - 140 * S, G.H * 0.55) };
    },
    // Материнский корабль: выводки дронов, кислотный дождь, стена с проходом
    mothership(b) {
      const S = G.S;
      if (timer(b, 'brood', bcd(b, 4.2), 2)) {
        for (let i = 0; i < 2 + b.phase; i++) E.spawn('drone', { x: U.clamp(b.x + U.rand(-0.42, 0.42) * b.w, 20 * S, G.FW - 20 * S), y: b.y + b.h * 0.2, idx: i, amp: 40, noElite: true });
        A.play('teleport', { rate: 0.6, vol: 0.5 });
      }
      if (timer(b, 'acid', bcd(b, 2.6))) { for (let i = 0; i < 8; i++) game.ebullet(b.x + (i - 3.5) * b.w * 0.11, b.y + b.h * 0.3, U.rand(-30, 30) * S, game.bspd(U.rand(110, 140)), 'green'); }
      if (timer(b, 'guns', bcd(b, 1.9))) { for (const sd of [-1, 1]) game.aimAt(b.x + sd * b.w * 0.38, b.y + b.h * 0.2, 220, 'bolt'); }
      if (b.phase >= 3 && timer(b, 'wall', 4.6)) {
        const n = Math.round(G.FW / (26 * S)), gap = U.randi(2, n - 5);
        for (let i = 0; i < n; i++) if (i < gap || i > gap + 3) game.ebullet((i + 0.5) * G.FW / n, b.y + b.h * 0.45, 0, game.bspd(140), 'green');
        A.play('enemyShot');
      }
    },
    necro(b) {
      if (timer(b, 'spiral', bcd(b, 1.5), 1)) { b.spin += 0.35; ring(b.x, b.y, [5, 8, 12][b.phase - 1], 150, 'violet', b.spin); }
      if (timer(b, 'summon', bcd(b, 5.5), 3)) { for (let i = 0; i < 1 + b.phase; i++) E.spawn('scout', { tint: 275, hpMul: 0.6, noElite: true }); A.play('bossRoar', { vol: 0.4, rate: 1.4 }); }
      if (b.phase >= 2 && timer(b, 'cross', bcd(b, 2.3))) ring(b.x, b.y, 8, 190, 'needle', b.phase >= 3 ? Math.PI / 8 : 0);
      if (b.phase >= 3 && timer(b, 'souls', bcd(b, 1.3))) { for (const a of [-0.25, 0, 0.25]) game.aimAt(b.x, b.y + b.h * 0.3, 150, 'dot', a, { homing: 0.7, life: 5 }); }
    },
    // Тяжёлый крейсер: бортовые залпы, рои ракет, таранные проходы и мины
    cruiser(b) {
      const S = G.S;
      if (timer(b, 'broad', bcd(b, 1.6), 1)) {
        const n = 4 + b.phase;
        for (let i = 0; i < n; i++) {
          const x = b.x + (i / (n - 1) - 0.5) * b.w * 0.8;
          game.ebullet(x, b.y + b.h * 0.3, U.rand(-12, 12) * S, game.bspd(185), 'bolt');
        }
        A.play('enemyShot');
      }
      if (timer(b, 'missiles', bcd(b, 3.2), 2.2)) {
        for (let i = 0; i < 2 + b.phase; i++) game.after(i * 0.18, () => { if (b.alive) { const s = game.bspd(115); game.ebullet(b.x - b.face * b.w * 0.4, b.y, U.rand(-40, 40) * S, s * 0.6, 'fire', { homing: 1.25, life: 5 }); } });
        A.play('rocket', { rate: 0.7 });
      }
      if (b.phase >= 2 && !b.dash && timer(b, 'dash', 6.5)) {
        const dir = b.x < G.FW / 2 ? 1 : -1;
        b.dash = { t: 0, x0: b.x, y0: b.y, tx: dir > 0 ? G.FW - b.w * 0.42 : b.w * 0.42, dy: 70 * S };
        A.play('rail', { vol: 0.4, rate: 1.4 });
      }
      if (b.dash && timer(b, 'dashfire', 0.22)) game.ebullet(b.x, b.y + b.h * 0.3, 0, game.bspd(230), 'needle');
      if (b.phase >= 3 && timer(b, 'mines', bcd(b, 3.6))) { for (const sd of [-1, 1]) game.ebullet(b.x + sd * b.w * 0.3, b.y + b.h * 0.3, sd * 30 * S, 45 * S, 'mine', { fuse: 2.2, life: 6 }); A.play('mine'); }
    },
  };

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
    // фазы
    const ratio = b.hp / b.maxHp;
    const newPhase = ratio <= 0.33 ? 3 : ratio <= 0.66 ? 2 : 1;
    if (newPhase > b.phase) {
      b.phase = newPhase;
      FX.ring(b.x, b.y, b.r, b.r * 3, b.bdef.color, 0.6, 6);
      FX.flash(b.bdef.color, 0.25);
      FX.shake(0.45);
      A.play('bossRoar');
      ring(b.x, b.y, 16, 160, 'orb', Math.random());
      SS.emit('bossPhase', b);
    }
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
      const speed = b.bdef.id === 'mothership' ? 0.3 : b.bdef.id === 'cruiser' ? 0.4 : 0.55;
      const tx = G.FW / 2 + Math.sin(b.mt * speed + (b.mtOff || 0)) * Math.max(0, G.FW / 2 - b.w * 0.5) * 0.85;
      const ty = b.baseY + Math.sin(b.mt * 1.1) * G.H * 0.03;
      b.x = U.damp(b.x, tx, b.flashTele > 0 ? 30 : 3, dt);
      b.y = U.damp(b.y, ty, 3, dt);
    }
    // горизонтальные корабли смотрят по ходу движения
    const vx = (b.x - b.lastX) / Math.max(dt, 0.001);
    if (Math.abs(vx) > 12 * S) b.face = vx > 0 ? 1 : -1;
    b.fx = U.damp(b.fx, horizFlip(b), 7, dt);
    if (b.flashTele > 0) b.flashTele -= dt;
    if (b.frozen > 0) b.frozen -= dt;
    if (game.player.alive) BOSS[b.bdef.id](b);
    // лучи дредноута наносят урон
    const p = game.player;
    for (const bm of game.ov.beams) {
      if (bm.t >= bm.warn && !bm.hitDone && p.alive && Math.abs(p.x - bm.x) < bm.w * 0.75 + p.r && p.y > bm.y0) { bm.hitDone = true; game.hitPlayer(p.x, p.y); }
    }
    // искры повреждённого босса
    if (b.phase >= 2 && Math.random() < dt * (b.phase === 3 ? 8 : 3)) {
      const x = b.x + U.rand(-0.35, 0.35) * b.w, y = b.y + U.rand(-0.3, 0.3) * b.h;
      FX.sparks(x, y, '#ffcf6b', 3, 160);
      if (b.phase === 3) FX.smoke(x, y, 1, 14 * S);
    }
  }

  function bossDeath(b) {
    if (b.bdef.id === 'phoenix' && !b.reborn) {
      b.reborn = true;
      b.hp = b.maxHp * 0.45;
      FX.explode(b.x, b.y, 3, '#ff6a2a');
      FX.flash('#ffb03d', 0.5);
      FX.text(b.x, b.y, 'ВОЗРОЖДЕНИЕ!', '#ffb03d', 20, 1.4);
      A.play('bossRoar');
      SS.emit('toast', { ico: '🔥', title: 'БОСС', text: 'Феникс возрождается из пепла!', info: true });
      return;
    }
    b.alive = false;
    game.boss = null;
    E.corpses.push({ x: b.x, y: b.y, w: b.w, h: b.h, cv: b.cv, sprite: b.sprite, rot: b.bdef.rot || 0, flip: b.fx < 0 ? -1 : 1, t: 0, dur: 1.6, color: b.bdef.color });
    FX.shake(0.7);
    SS.tg.haptic('success');
    game.onBossDefeated(b);
    SS.emit('intensity');
  }

  // горизонтальные спрайты: «смотрят» влево (босс) или вправо (Рейдер) — отражаем по ходу движения
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
      if (e.horiz) {
        if (horizFlip(e) < 0) ctx.scale(-1, 1);
      } else {
        let rot = Math.PI + e.bank;
        if ((def.ai === 'kamikaze' || def.ai === 'hunter') && e.st >= 1 && e.dir !== undefined) rot = e.dir - Math.PI / 2;
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
      // энергобарьер Редута
      if (e.barrier > 0) {
        const r = e.w * 0.62;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.3 + 0.15 * Math.sin(e.age * 14) + (e.shieldHitT > 0 ? 0.35 : 0);
        ctx.drawImage(G.soft('#b06bff', 64), e.x - r * 1.2, e.y - r * 1.2, r * 2.4, r * 2.4);
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
        ctx.drawImage(G.soft('#4cb8ff', 64), e.x - r * 1.15, e.y - r * 1.15, r * 2.3, r * 2.3);
        ctx.globalAlpha = 0.5 + k * 0.4;
        ctx.strokeStyle = e.shieldHitT > 0 ? '#ffffff' : '#7fd8ff'; ctx.lineWidth = 2 * S;
        ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, U.TAU * k); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      // прицел снайпера
      if (def.ai === 'sniper' && (e.st === 1 || e.st === 2) && e.aim !== undefined) {
        const locked = e.st === 2;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = locked ? 0.55 + 0.45 * Math.sin(e.age * 50) : 0.28;
        ctx.strokeStyle = '#ff3d5a'; ctx.lineWidth = locked ? 2 * S : 1 * S;
        ctx.beginPath(); ctx.moveTo(e.x, e.y + e.h * 0.3); ctx.lineTo(e.x + Math.cos(e.aim) * 1400, e.y + Math.sin(e.aim) * 1400); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      // полоса прочности
      if (e.hp < e.maxHp && e.alpha > 0.5 && (e.mini || e.maxHp > 60 || e.elite)) {
        const bw = e.mini ? Math.min(e.w * 0.8, 120 * S) : Math.max(26 * S, e.w * 0.6), bh = e.mini ? 5 * S : 3 * S;
        const bx = e.x - bw / 2, by = Math.max(e.y - e.h * 0.55 - 6 * S, (SS.ui ? SS.ui.topInset() : 120) - 32);
        ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
        const k = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = e.mini ? '#ff5c4d' : k > 0.5 ? '#3dffa2' : k > 0.25 ? '#ffc83d' : '#ff4d5e';
        ctx.fillRect(bx, by, bw * k, bh);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  function drawFrame(ctx, sprite, cv, w, h) {
    if (cv) { ctx.drawImage(cv, -w / 2, -h / 2, w, h); return; }
    const f = G.frame(sprite);
    if (f) ctx.drawImage(G.img, f[0], f[1], f[2], f[3], -w / 2, -h / 2, w, h);
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
        G.draw(ctx, 'eb_fire', o.x, o.y, s * 1.1, t * 3);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.save();
    ctx.translate(b.x, b.y + Math.sin(t * 1.6) * 3 * S);
    // свечение ядра
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 4);
    const gs = Math.max(b.w, b.h) * 1.15;
    ctx.drawImage(G.soft(col, 64), -gs / 2, -gs / 2, gs, gs);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = b.entering ? 0.85 : 1;
    ctx.rotate((b.bdef.rot || 0) + Math.sin(t * 0.8) * 0.03);
    if (b.fx !== 1) ctx.scale((b.fx < 0 ? -1 : 1) * Math.max(0.12, Math.abs(b.fx)), 1);
    drawFrame(ctx, b.sprite, b.cv, b.w, b.h);
    if (b.flash > 0 || b.entering || b.flashTele > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = b.entering ? 0.25 + 0.15 * Math.sin(t * 12) : Math.min(1, b.flash * 10) * 0.55;
      const wh = G.white(b.sprite);
      if (wh) ctx.drawImage(wh, -b.w / 2, -b.h / 2, b.w, b.h);
    }
    ctx.restore();
    // энергощит
    if (b.shield > 0) {
      const k = b.shield / b.shieldMax, r = Math.max(b.w, b.h) * 0.6;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.12 + k * 0.18 + (b.shieldHitT > 0 ? 0.3 : 0);
      ctx.drawImage(G.soft('#3db8ff', 64), b.x - r * 1.2, b.y - r * 1.2, r * 2.4, r * 2.4);
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
