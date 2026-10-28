// ════════════════════════════════════════════════════════════════
// SPACE SHOOTER 3.1 — новые враги
//  Защита от оружия (значок над врагом, подсказка при первой встрече):
//  Зеркало — лазер, Ледокол — дробовик, Гравитон — ракеты и т. материя,
//  Связка — серп, Проектор — плазма, Невидимка и Ионный — молния,
//  Мимик привыкает к оружию, которым его бьют.
//  Поддержка: Медик лечит соседей, Вор крадёт добычу, Мортира бьёт навесом.
//  Поведение регистрируется в enemies.js (E.AI, E.INIT, E.NEW_FIRE).
// ════════════════════════════════════════════════════════════════
'use strict';

(function () {
  const U = SS.util, D = SS.data;
  let G, FX, A, M, game, h;

  // источник урона → оружие: для значка и привыкания Мимика
  const SRC_W = { laser: 'laser', shotgun: 'shotgun', rocket: 'rocket', arc: 'arc', plasma: 'plasma', lightning: 'lightning', dark: 'darkmatter' };
  const W_LETTER = { laser: 'Л', shotgun: 'Д', rocket: 'Р', arc: 'С', plasma: 'П', lightning: 'М', darkmatter: 'Т' };
  const ARMOR_TXT = { icebreaker: 'ЛЁД' };
  // Мимик: столько прочности от одного оружия — и он к нему привыкает на ADAPT_T с
  const ADAPT_SHARE = 0.22, ADAPT_T = 5;
  const HEAL_R = 150, HEAL_CD = 2.2;

  const F = {
    shells: [],   // снаряды Мортиры: { x0, y0, tx, ty, t, dur, R }
    heals: [],    // лучи Медика (только картинка): { e, o, t }
    domes: [], gravs: [], links: [],   // Проекторы, Гравитоны и Связки на этом кадре
    init() {
      G = SS.gfx; FX = SS.fx; A = SS.audio; M = SS.meta; game = SS.game;
      const E = SS.enemies;
      h = E.h;
      Object.assign(E.AI, AI);
      Object.assign(E.INIT, INIT);
      E.NEW_FIRE.lob = lob;
    },
    reset() { this.shells.length = 0; this.heals.length = 0; this.domes.length = 0; this.gravs.length = 0; this.links.length = 0; },
  };
  SS.foes = F;

  // подсказка при первой встрече
  F.seen = function (e) {
    const seen = M.s.foeSeen || (M.s.foeSeen = []);
    if (seen.includes(e.type)) return;
    seen.push(e.type);
    SS.store.soon();
    SS.emit('toast', { ico: e.def.ico || '⚠️', title: e.def.name.toUpperCase(), text: e.def.hint, info: true, dur: 3200 });
  };

  // надпись над врагом не чаще раза в полсекунды
  function nope(e, text, color) {
    if (game.t - (e.nopeT || -9) < 0.5) return;
    e.nopeT = game.t;
    FX.text(e.x, e.y - e.r * 0.8, text, color, 12, 0.6, -60);
  }
  function wColor(src) { const w = D.WEAPONS[SRC_W[src]]; return w ? w.color : '#ffffff'; }

  // ════════════════════════════════════════════════════════════
  // ЗАЩИТА ОТ ОРУЖИЯ
  // ════════════════════════════════════════════════════════════
  // множитель урона: 0 — неуязвим, <1 — броня, >1 — уязвимость
  F.resist = function (e, src, dmg) {
    if (e.boss || !src) return 1;
    const d = e.def;
    let k = d.resist && d.resist[src] !== undefined ? d.resist[src] : 1;
    // под куполом Проектора плазма не берёт
    if (src === 'plasma' && k > 0 && F.domes.length && domeOf(e.x, e.y, 0)) { nope(e, 'КУПОЛ', '#7fd8ff'); return 0; }
    if (d.adapt && SRC_W[src]) {
      if (e.adapt === src) k = 0;
      else {
        const acc = e.adaptAcc || (e.adaptAcc = {});
        acc[src] = (acc[src] || 0) + dmg;
        if (acc[src] >= e.maxHp * ADAPT_SHARE) adapt(e, src);
      }
    }
    if (k <= 0) {
      nope(e, 'НЕУЯЗВИМ', wColor(src));
      e.shieldHitT = 0.1;
      if (Math.random() < 0.2) A.play('hitArmor', { vol: 0.4 });
    } else if (k < 1) {
      nope(e, ARMOR_TXT[e.type] || 'БРОНЯ', '#bff4ff');
      if (Math.random() < 0.3) FX.sparks(e.x + U.rand(-0.3, 0.3) * e.w, e.y + e.h * 0.3, '#bff4ff', 3, 160);
    } else if (k > 1 && Math.random() < 0.3) FX.sparks(e.x, e.y, '#e0fbff', 5, 220);
    return k;
  };

  // Мимик перестраивается под оружие: неуязвим к нему ADAPT_T секунд
  function adapt(e, src) {
    const col = wColor(src);
    e.adapt = src; e.adaptT = ADAPT_T; e.adaptAcc = {};
    e.cv = G.tinted(e.sprite, { hue: G.hueOf(col) });
    e.nopeT = game.t;
    FX.text(e.x, e.y - e.r * 0.8, 'ПРИВЫК: ' + D.WEAPONS[SRC_W[src]].name, col, 12, 1.1, -50);
    FX.ring(e.x, e.y, e.r, e.r * 2.2, col, 0.4, 3);
    A.play('shieldHit', { rate: 1.3 });
  }

  // невидимую цель не находят молния, ракеты и дроны
  F.hidden = function (e) { return !!e.def.cloak && e.alpha < 0.6; };

  // Зеркало: лазер отражается в игрока (не чаще ~3 раз в секунду, остальное просто гаснет)
  F.reflect = function (b, e) {
    FX.hit(b.x, b.y, '#ffffff');
    nope(e, 'ОТРАЖЕНИЕ', '#7ff6ff');
    if (game.t - (e.reflT || -9) < 0.3 || !game.player.alive) return;
    e.reflT = game.t;
    game.aimAt(b.x, b.y + e.h * 0.2, 300, 'mirror');
    A.play('hitArmor', { vol: 0.35, rate: 1.6 });
  };

  // Гравитон: ракета, влетевшая в поле, разворачивается в игрока
  F.bendRocket = function (b) {
    for (const g of F.gravs) {
      const R = g.w * 1.25;
      if (U.dist2(b.x, b.y, g.x, g.y) > R * R) continue;
      FX.ring(b.x, b.y, 4 * G.S, 26 * G.S, '#b06bff', 0.3, 2);
      if (game.player.alive) game.aimAt(b.x, b.y, 210, 'rocket', 0, { homing: 1.1, life: 4 });
      nope(g, 'РАЗВОРОТ', '#c89bff');
      A.play('teleport', { vol: 0.35, rate: 1.7 });
      return true;
    }
    return false;
  };

  // Проектор: чей купол накрывает точку
  function domeOf(x, y, r) {
    for (const d of F.domes) if (U.dist2(x, y, d.x, d.y) < (d.domeR + r) * (d.domeR + r)) return d;
    return null;
  }
  F.inDome = function (x, y, r) { return !!(F.domes.length && domeOf(x, y, r * 0.3)); };
  F.domeHit = function (x, y) {
    const d = domeOf(x, y, 20 * G.S);
    if (d) { d.domeHitT = 0.25; nope(d, 'КУПОЛ', '#7fd8ff'); }
    FX.ring(x, y, 4 * G.S, 30 * G.S, '#7fd8ff', 0.3, 3);
    A.play('shieldHit', { vol: 0.5 });
  };

  // Связка: луч гасит волну Серпа — проверяем точки дуги
  F.cutsWave = function (b, w) {
    if (!F.links.length) return false;
    const S = G.S, rr = (b.r + 4 * S) * (b.r + 4 * S);
    for (const a of F.links) {
      // напарника могли сбить в этом же кадре
      const m = a.mate;
      if (!a.alive || !m || !m.alive) continue;
      for (let i = 0; i <= 6; i++) {
        const ang = w.ang + (i / 3 - 1) * w.span, x = w.cx + Math.cos(ang) * w.R, y = w.cy + Math.sin(ang) * w.R;
        if (U.segDist2(x, y, a.x, a.y, m.x, m.y) > rr) continue;
        FX.sparks(x, y, '#ff3d5a', 10, 220);
        nope(a, 'ЛУЧ ГАСИТ СЕРП', '#ff6b7d');
        A.play('shieldHit', { vol: 0.4, rate: 1.4 });
        return true;
      }
    }
    return false;
  };

  F.spawnLink = function () {
    const S = G.S, E = SS.enemies;
    const pair = { cx: U.rand(0.35, 0.65) * G.FW, y: -30 * S, ty: U.rand(0.16, 0.26) * G.H, sep: G.FW * 0.42, vx: U.sign(Math.random() - 0.5) * 35 * S, t: 0, st: 0, stamp: -1 };
    const a = E.spawn('link', { x: pair.cx - pair.sep / 2, y: pair.y, noElite: true, pair, side: -1 });
    const b = E.spawn('link', { x: pair.cx + pair.sep / 2, y: pair.y, noElite: true, pair, side: 1 });
    if (a && b) { a.mate = b; b.mate = a; }
    return 6; // две Связки по 3 в бюджете волны
  };

  // ════════════════════════════════════════════════════════════
  // ГИБЕЛЬ
  // ════════════════════════════════════════════════════════════
  F.onKill = function (e) {
    // Вор возвращает добычу, монеты — вдвойне
    if (e.loot && e.loot.length) {
      let coins = 0;
      for (const l of e.loot) {
        if (l.kind === 'coin') coins += l.val * 2;
        else if (l.kind === 'pu') game.dropPowerup(e.x, e.y, l.pu);
        else if (l.kind === 'en') game.dropEnergy(e.x, e.y, 1);
      }
      if (coins) game.dropCoins(e.x, e.y, coins);
      FX.text(e.x, e.y - e.r, 'ДОБЫЧА ВОЗВРАЩЕНА', '#ffc83d', 13, 1.0, -50);
      e.loot.length = 0;
    }
    // напарник Связки в ярости — стреляет вдвое чаще
    if (e.mate && e.mate.alive) {
      e.mate.rage = true;
      e.mate.mate = null;
      FX.text(e.mate.x, e.mate.y - e.mate.r, 'ЯРОСТЬ', '#ff3d5a', 13, 0.9, -50);
    }
  };

  // ════════════════════════════════════════════════════════════
  // ПОВЕДЕНИЕ
  // ════════════════════════════════════════════════════════════
  const INIT = {
    thief(e) { e.ty = U.rand(0.12, 0.28) * G.H; e.loot = []; e.idle = 0; e.prey = null; e.vy = 0; },
    link(e, o) { e.pair = o.pair || null; e.side = o.side || 1; },
  };

  // Вор: охотится за выпавшими бонусами, энергоблоками и монетами, с добычей уходит вверх
  function findLoot(e) {
    let best = null, bd = Infinity;
    for (const it of game.pickups) {
      if (it.dead || it.pull || it.kind === 'xp' || it.y < 0 || it.y > G.H * 0.62) continue;
      const d = U.dist2(it.x, it.y, e.x, e.y) * (it.kind === 'coin' ? 1.5 : 1);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
  function grab(e, it) {
    it.dead = true;
    e.loot.push({ kind: it.kind, val: it.val, pu: it.pu });
    e.prey = null;
    FX.sparks(it.x, it.y, '#ffc83d', 8, 160);
    nope(e, 'УКРАЛ!', '#ffc83d');
    A.play('coin', { rate: 0.7, vol: 0.6 });
  }

  const AI = {
    thief(e, dt) {
      const S = G.S;
      if (e.st === 0) {
        if (h.arrive(e, dt, 2.6)) e.st = 1;
      } else if (e.st === 1) {
        e.t += dt;
        const it = e.prey && !e.prey.dead && !e.prey.pull ? e.prey : (e.prey = findLoot(e));
        if (it) {
          e.idle = 0;
          const dx = it.x - e.x, dy = it.y - e.y, d = Math.hypot(dx, dy) || 1, sp = e.spd * 1.5;
          e.vx = U.damp(e.vx, dx / d * sp, 4, dt); e.vy = U.damp(e.vy, dy / d * sp, 4, dt);
          if (d < e.r + 12 * S) grab(e, it);
        } else {
          // красть нечего — кружит наверху и ждёт
          e.idle += dt;
          e.vx = U.damp(e.vx, Math.sin(e.age * 1.1 + e.phase) * e.spd * 0.8, 2, dt);
          e.vy = U.damp(e.vy, (e.ty - e.y) * 2, 2, dt);
        }
        e.x = U.clamp(e.x + e.vx * dt, e.w * 0.5, G.FW - e.w * 0.5);
        e.y = U.clamp(e.y + e.vy * dt, h.minY(e), G.H * 0.62);
        if (e.loot.length >= 3 || e.idle > 7 || e.t > 16) { e.st = 2; e.leaving = true; }
      } else {
        // уходит вверх с добычей — ещё можно догнать
        e.vy = Math.max(e.vy - 900 * S * dt, -e.spd * 2.6);
        e.y += e.vy * dt;
        if (e.y < -e.h) e.alive = false;
      }
    },
    // Связка: пара держится на одной высоте, медленно сползает вниз, луч между кораблями обжигает
    link(e, dt) {
      const pr = e.pair, S = G.S;
      if (!pr) { h.leave(e, dt); return; }
      // общий центр пары двигает тот, кто обновляется первым в кадре
      if (pr.stamp !== game.t) {
        pr.stamp = game.t;
        pr.t += dt;
        if (pr.st === 0) { pr.y = U.damp(pr.y, pr.ty, 1.8, dt) + 8 * S * dt; if (pr.y >= pr.ty - 6 * S) pr.st = 1; }
        else if (pr.st === 1) { pr.y += 8 * S * dt; if (pr.t > 17 || pr.y > G.H * 0.5) pr.st = 2; }
        else pr.y += 55 * S * dt;
        pr.sep = G.FW * (0.42 + 0.1 * Math.sin(pr.t * 0.8));
        const half = pr.sep / 2 + e.w * 0.6;
        pr.cx += pr.vx * dt;
        if (pr.cx < half || pr.cx > G.FW - half) { pr.vx = -pr.vx; pr.cx = U.clamp(pr.cx, half, G.FW - half); }
      }
      e.x = pr.cx + e.side * pr.sep / 2;
      e.y = pr.y + e.side * Math.sin(pr.t * 1.3) * 12 * S;
      if (pr.st === 2) e.leaving = true;
      if (pr.st >= 1) h.tickFire(e, e.rage ? dt * 2 : dt);
    },
  };

  // Мортира: снаряд навесом в точку игрока — сначала красный круг, через 1,35 с взрыв
  function lob(e) {
    const S = G.S, p = game.player, n = game.threatWave() >= 18 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const tx = i ? p.x + U.pick([-1, 1]) * U.rand(70, 120) * S : p.x + (p.vxm || 0) * 0.5;
      F.shells.push({ x0: e.x, y0: e.y + e.h * 0.35, tx: U.clamp(tx, 20 * S, G.FW - 20 * S), ty: U.clamp(p.y + U.rand(-16, 16) * S, G.H * 0.3, G.H - 24 * S), t: 0, dur: 1.35, R: 40 * S * (e.elite ? 1.15 : 1) });
    }
    FX.glowPuff(e.x, e.y + e.h * 0.35, '#ff8a3d', 40 * S, 0.25);
  }

  // Медик: раз в HEAL_CD с лечит раненых соседей
  function heal(e) {
    const S = G.S, R = HEAL_R * S, share = e.def.heal * (e.elite ? 1.3 : 1);
    let n = 0;
    for (const o of game.enemies) {
      if (o === e || !o.alive || o.boss || o.def.prop || o.hp >= o.maxHp || U.dist2(o.x, o.y, e.x, e.y) > R * R) continue;
      o.hp = Math.min(o.maxHp, o.hp + o.maxHp * share * (o.mini ? 0.25 : 1));
      F.heals.push({ e, o, t: 0 });
      FX.text(o.x, o.y - o.r * 0.6, '+', '#5cff9d', 16, 0.6, -50);
      n++;
    }
    if (n) { FX.ring(e.x, e.y, e.r, R, '#5cff9d', 0.5, 2); A.play('powerup', { vol: 0.25, rate: 1.9 }); }
  }

  // Невидимка: почти прозрачна; на миг проявляется, даёт очередь и снова исчезает
  function cloak(e, dt) {
    if (e.st !== 1) { e.alpha = Math.max(0.12, e.alpha - dt * 3); return; }
    if (e.shown > 0) {
      e.shown -= dt;
      e.alpha = Math.min(1, e.alpha + dt * 5);
      if (!e.shot && e.alpha >= 0.95) { e.shot = true; if (h.canShoot(e)) h.doFire(e, e.def.fire); }
      if (e.shown <= 0) e.cloakT = U.rand(2.2, 3.2) / Math.pow(h.fireRate(), 0.5);
    } else {
      e.alpha = Math.max(0.12, e.alpha - dt * 3);
      e.cloakT = (e.cloakT === undefined ? U.rand(1, 1.8) : e.cloakT) - dt;
      if (e.cloakT <= 0) { e.shown = 1.1; e.shot = false; A.play('teleport', { vol: 0.25, rate: 1.8 }); }
    }
  }

  // ════════════════════════════════════════════════════════════
  // ОБНОВЛЕНИЕ
  // ════════════════════════════════════════════════════════════
  F.update = function (dt) {
    const S = G.S, p = game.player;
    F.domes.length = 0; F.gravs.length = 0; F.links.length = 0;
    for (const e of game.enemies) {
      if (!e.alive || e.boss) continue;
      const d = e.def;
      if (d.dome) {
        e.domeR = U.damp(e.domeR || 0, e.st === 1 ? d.dome * S * (e.elite ? 1.2 : 1) : 0, 3, dt);
        if (e.domeHitT > 0) e.domeHitT -= dt;
        if (e.domeR > 8 * S) F.domes.push(e);
      }
      if (d.gravity) F.gravs.push(e);
      if (e.side < 0 && e.mate && e.mate.alive) F.links.push(e);
      if (d.heal && e.st === 1) { e.healT = (e.healT === undefined ? 1.5 : e.healT) - dt; if (e.healT <= 0) { e.healT = HEAL_CD; heal(e); } }
      if (d.cloak) cloak(e, dt);
      if (e.adapt) { e.adaptT -= dt; if (e.adaptT <= 0) { e.adapt = null; e.cv = null; } }
    }
    // луч Связки обжигает корабль
    if (p.alive) for (const a of F.links) if (U.segDist2(p.x, p.y, a.x, a.y, a.mate.x, a.mate.y) < (p.r + 3 * S) * (p.r + 3 * S)) game.hitPlayer(p.x, p.y, 'Луч Связки');
    // снаряды Мортиры
    for (let i = F.shells.length - 1; i >= 0; i--) {
      const s = F.shells[i];
      s.t += dt;
      if (s.t < s.dur) continue;
      F.shells.splice(i, 1);
      FX.explode(s.tx, s.ty, 0.9, '#ff8a3d');
      FX.ring(s.tx, s.ty, 6 * S, s.R, '#ffb03d', 0.3, 3);
      FX.shake(0.08);
      A.play('explodeS', { vol: 0.6 });
      if (p.alive && U.dist2(p.x, p.y, s.tx, s.ty) < (s.R + p.r * 0.5) * (s.R + p.r * 0.5)) game.hitPlayer(p.x, p.y, 'Снаряд Мортиры');
      if (game.threatWave() >= 22 && p.alive) {
        const sp = game.bspd(120), off = Math.random() * U.TAU;
        for (let k = 0; k < 6; k++) { const a = off + k / 6 * U.TAU; game.ebullet(s.tx, s.ty, Math.cos(a) * sp, Math.sin(a) * sp, 'orb'); }
      }
    }
    for (let i = F.heals.length - 1; i >= 0; i--) { F.heals[i].t += dt; if (F.heals[i].t > 0.45) F.heals.splice(i, 1); }
  };

  // ════════════════════════════════════════════════════════════
  // ОТРИСОВКА
  // ════════════════════════════════════════════════════════════
  // под врагами: купола, поля Гравитонов, лучи Связок и Медиков, прицелы Мортир
  F.drawBack = function (ctx) {
    const S = G.S, t = game.t;
    ctx.globalCompositeOperation = 'lighter';
    for (const e of F.domes) {
      const r = e.domeR, hit = e.domeHitT > 0;
      ctx.globalAlpha = 0.22 + (hit ? 0.3 : 0);
      if (G.frame('fx_sh_bubble')) G.draw(ctx, 'fx_sh_bubble', e.x, e.y, r * 2.25);
      else ctx.drawImage(G.soft('#4cb8ff', 64), e.x - r * 1.1, e.y - r * 1.1, r * 2.2, r * 2.2);
      ctx.globalAlpha = 0.4 + 0.15 * Math.sin(t * 4) + (hit ? 0.4 : 0);
      ctx.strokeStyle = hit ? '#ffffff' : '#7fd8ff'; ctx.lineWidth = 1.5 * S;
      ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, U.TAU); ctx.stroke();
    }
    for (const g of F.gravs) {
      const R = g.w * 1.25;
      ctx.globalAlpha = 0.16;
      ctx.drawImage(G.soft('#7a3dff', 64), g.x - R, g.y - R, R * 2, R * 2);
      ctx.globalAlpha = 0.35; ctx.strokeStyle = '#c89bff'; ctx.lineWidth = 1.5 * S;
      for (let k = 0; k < 2; k++) { const a = t * (k ? -1.6 : 2.2) + k; ctx.beginPath(); ctx.arc(g.x, g.y, R * (k ? 0.82 : 1), a, a + 2.2); ctx.stroke(); }
    }
    for (const a of F.links) {
      if (!a.alive || !a.mate || !a.mate.alive) continue;
      const m = a.mate, dx = m.x - a.x, dy = m.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
      ctx.globalAlpha = 0.4 + 0.15 * Math.sin(t * 18);
      ctx.strokeStyle = '#ff2d4d'; ctx.lineWidth = 8 * S;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(m.x, m.y); ctx.stroke();
      // ядро луча вьётся синусоидой, как на рисунке
      ctx.globalAlpha = 0.95; ctx.strokeStyle = '#ff8a9a'; ctx.lineWidth = 2.2 * S;
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const k = i / 24, o = Math.sin(k * 22 - t * 14) * 3 * S * Math.sin(k * Math.PI);
        const x = a.x + dx * k + nx * o, y = a.y + dy * k + ny * o;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    for (const hb of F.heals) {
      const k = 1 - hb.t / 0.45;
      ctx.globalAlpha = 0.8 * k; ctx.strokeStyle = '#5cff9d'; ctx.lineWidth = 3 * S * k + 1;
      ctx.beginPath(); ctx.moveTo(hb.e.x, hb.e.y); ctx.lineTo(hb.o.x, hb.o.y); ctx.stroke();
    }
    // прицел Мортиры — обычным смешиванием: в режиме 'lighter' красный на синем небе выходил лиловым
    ctx.globalCompositeOperation = 'source-over';
    for (const s of F.shells) {
      const k = s.t / s.dur;
      ctx.globalAlpha = 0.16 + 0.14 * k;
      ctx.fillStyle = '#ff2d2d';
      ctx.beginPath(); ctx.arc(s.tx, s.ty, s.R * k, 0, U.TAU); ctx.fill();
      ctx.globalAlpha = 0.6 + 0.35 * Math.abs(Math.sin(t * (8 + k * 10)));
      ctx.strokeStyle = '#ff4d3d'; ctx.lineWidth = 2 * S;
      ctx.beginPath(); ctx.arc(s.tx, s.ty, s.R, 0, U.TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  // над врагами: снаряды Мортиры в полёте, следы Невидимок, значки защиты
  F.drawFront = function (ctx) {
    const S = G.S, t = game.t;
    ctx.globalCompositeOperation = 'lighter';
    for (const s of F.shells) {
      const k = s.t / s.dur, arc = Math.sin(k * Math.PI);
      const x = U.lerp(s.x0, s.tx, k), y = U.lerp(s.y0, s.ty, k) - arc * 150 * S;
      G.draw(ctx, 'eb_fire', x, y, (16 + arc * 14) * S, t * 6);
    }
    for (const e of game.enemies) {
      if (!e.alive || !e.def.cloak || e.alpha > 0.5) continue;
      // марево от двигателей — заметно, если присмотреться
      ctx.globalAlpha = 0.18 + 0.1 * Math.sin(t * 7 + e.uid);
      const gs = e.w * 0.9;
      ctx.drawImage(G.soft('#6b7bff', 64), e.x - gs / 2, e.y - e.h * 0.35 - gs / 2, gs, gs);
    }
    ctx.globalCompositeOperation = 'source-over';
    // значок: буква оружия в его цвете, перечёркнутая
    let font = false;
    for (const e of game.enemies) {
      if (!e.alive || e.boss || e.alpha < 0.5) continue;
      const wid = e.adapt ? SRC_W[e.adapt] : e.def.guard;
      if (!wid) continue;
      if (!font) { font = true; ctx.font = '900 ' + Math.round(8 * S) + 'px Orbitron, Rajdhani, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; }
      const col = D.WEAPONS[wid].color, r = 7 * S, x = e.x + e.w * 0.5, y = e.y - e.h * 0.3;
      ctx.globalAlpha = e.alpha * 0.92;
      ctx.fillStyle = 'rgba(4,8,20,.8)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, U.TAU); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 1.5 * S; ctx.stroke();
      ctx.fillStyle = col; ctx.fillText(W_LETTER[wid], x, y + 0.5 * S);
      ctx.strokeStyle = '#ff3d5a'; ctx.lineWidth = 1.5 * S;
      ctx.beginPath(); ctx.moveTo(x - r * 0.7, y + r * 0.7); ctx.lineTo(x + r * 0.7, y - r * 0.7); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };
})();
