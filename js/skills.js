// ════════════════════════════════════════════════════════════════
// SPACE SHOOTER 3.1 — активные навыки
//  Запуск каждого навыка со своей анимацией (cast) и работа тех,
//  которым нужно своё состояние: Орбитальный удар, Турель, ЭМИ,
//  Двойник, отражение пуль Барьером. Рельса, Замедление и Чёрная дыра
//  живут в game.js (ov.rail, ov.hole, enemySlow).
// ════════════════════════════════════════════════════════════════
'use strict';

(function () {
  const U = SS.util;
  let G, FX, A, game;

  const K = {
    orb: null,      // орбитальный удар: { t, marks: [{ e, x, y, at, fired, ft }] }
    turret: null,   // турель: { x, y, cd, flash }
    clone: null,    // двойник: { x, y, t }
    casts: [],      // анимации запуска: { kind, t, dur, x, y, color }
    init() { G = SS.gfx; FX = SS.fx; A = SS.audio; game = SS.game; },
    reset() { this.orb = null; this.turret = null; this.clone = null; this.casts.length = 0; },
  };
  SS.skills = K;

  function cast(kind, dur, x, y, color) { K.casts.push({ kind, t: 0, dur, x, y, color }); }

  // ════════════════════════════════════════════════════════════
  // ЗАПУСК
  // ════════════════════════════════════════════════════════════
  K.cast = function (id, sk) {
    const p = game.player, S = G.S;
    if (id === 'sk_rail') {
      game.ov.rail = { t: 0, dur: sk.dur, tick: 0, charge: 0.35 };
      cast('converge', 0.35, p.x, p.y - p.w * 0.55, '#7ffff0');
      A.play('railCharge');
    } else if (id === 'sk_orbital') {
      // цели — самые крепкие враги на экране, по очереди
      const es = game.enemies.filter((e) => e.alive && e.hittable && e.y > 40 * S && e.y < G.H * 0.85 && !SS.foes.hidden(e)).sort((a, b) => b.hp - a.hp).slice(0, 6);
      K.orb = { t: 0, marks: es.map((e, i) => ({ e, x: e.x, y: e.y, at: 0.85 + i * 0.12, fired: false, ft: 0 })) };
      if (!es.length) K.orb.marks.push({ e: null, x: G.FW / 2, y: G.H * 0.3, at: 0.85, fired: false, ft: 0 });
      cast('satellite', 1.6, 0, 0, '#ff5c4d');
      A.play('railCharge', { rate: 1.3, vol: 0.5 });
    } else if (id === 'sk_barrier') {
      FX.ring(p.x, p.y, p.w * 0.3, p.w * 1.7, '#ffd23d', 0.5, 5);
      FX.sprite('fx_sh_restore', 0, 0, { follow: p, w0: p.w * 2.6, w1: p.w * 1.4, dur: 0.5, hold: 0.4, hue: 46 });
      cast('hex', 0.6, p.x, p.y, '#ffd23d');
      A.play('shieldHit', { rate: 0.7 });
    } else if (id === 'sk_timewarp') {
      FX.flash('#3d6bff', 0.25);
      cast('clock', 1.1, p.x, p.y, '#9fc8ff');
      A.play('teleport', { rate: 0.5 });
    } else if (id === 'sk_turret') {
      K.turret = { x: p.x - p.w, y: p.y - p.w * 0.9, cd: 0.4, flash: 0, ang: -Math.PI / 2 };
      cast('portal', 0.45, K.turret.x, K.turret.y, '#b06bff');
      A.play('teleport', { rate: 1.4 });
    } else if (id === 'sk_blackhole') {
      game.ov.hole = { x: G.FW / 2, y: G.H * 0.32, t: 0, dur: sk.dur, tick: 0 };
      cast('implode', 0.6, G.FW / 2, G.H * 0.32, '#b06bff');
      A.play('dark', { rate: 0.6 });
    } else if (id === 'sk_emp') emp();
    else if (id === 'sk_clone') {
      K.clone = { x: p.x + p.w, y: p.y, t: 0 };
      cast('scan', 0.45, 0, 0, '#3de0ff');
      A.play('teleport', { rate: 1.8, vol: 0.6 });
    }
  };

  // ЭМИ: кольцо через весь экран, разряды к врагам; враги замирают и теряют щиты
  function emp() {
    const p = game.player, S = G.S;
    FX.ring(p.x, p.y, 10 * S, Math.hypot(G.FW, G.H), '#7fe7ff', 0.7, 6);
    FX.ring(p.x, p.y, 10 * S, Math.hypot(G.FW, G.H) * 0.7, '#ffffff', 0.5, 2);
    FX.flash('#7fe7ff', 0.2);
    FX.shake(0.3);
    A.play('zap', { rate: 0.6 });
    let n = 0;
    for (const e of game.enemies) {
      if (!e.alive || e.def.prop) continue;
      e.emp = e.boss ? 1.5 : 3;
      if (e.shield > 0) { e.shield = 0; FX.sparks(e.x, e.y, '#7fd8ff', 10, 260); }
      e.barrier = 0;
      if (n++ < 6) FX.lightning(p.x, p.y - p.w * 0.4, e.x, e.y, '#9fe8ff', 2.2 * S, 0.25);
    }
  }

  // ════════════════════════════════════════════════════════════
  // ОБНОВЛЕНИЕ
  // ════════════════════════════════════════════════════════════
  K.update = function (dt) {
    const p = game.player, run = game.run, S = G.S;
    for (let i = K.casts.length - 1; i >= 0; i--) { K.casts[i].t += dt; if (K.casts[i].t >= K.casts[i].dur) K.casts.splice(i, 1); }
    // орбитальный удар: прицелы держат цель, потом луч с орбиты
    const o = K.orb;
    if (o) {
      o.t += dt;
      let left = 0;
      for (const m of o.marks) {
        if (m.e && m.e.alive) { m.x = m.e.x; m.y = m.e.y; }
        if (!m.fired && o.t >= m.at) {
          m.fired = true;
          FX.explode(m.x, m.y, 1.4, '#ff8a3d');
          FX.ring(m.x, m.y, 6 * S, 70 * S, '#ff5c4d', 0.35, 4);
          FX.shake(0.15);
          A.play('explodeM', { vol: 0.55 });
          for (const e of game.enemies) {
            if (!e.alive || !e.hittable || !game.inBlast(e, m.x, m.y, 60 * S)) continue;
            game.damageEnemy(e, (e.boss ? 110 : 190) * game.dmgMul() * (1 + game.wave.n * 0.06), { src: 'orbital', heavy: true });
          }
        }
        if (m.fired) m.ft += dt;
        if (!m.fired || m.ft < 0.4) left++;
      }
      if (!left) K.orb = null;
    }
    // турель: висит над кораблём и бьёт ближайших
    if (K.turret) {
      const t = K.turret;
      if (!(run.skillFx.sk_turret > 0) || !p.alive) { FX.glowPuff(t.x, t.y, '#b06bff', 50 * S, 0.3); K.turret = null; }
      else {
        t.x = U.damp(t.x, U.clamp(p.x - p.w * 1.05, 20 * S, G.FW - 20 * S), 6, dt);
        t.y = U.damp(t.y, p.y - p.w * 0.85 + Math.sin(game.t * 3) * 4 * S, 6, dt);
        t.cd -= dt; t.flash -= dt;
        let tgt = null, bd = 480 * S;
        for (const e of game.enemies) {
          if (!e.alive || !e.hittable || e.y > t.y || SS.foes.hidden(e)) continue;
          const d = Math.hypot(e.x - t.x, e.y - t.y);
          if (d < bd) { bd = d; tgt = e; }
        }
        if (tgt) t.ang = U.damp(t.ang, Math.atan2(tgt.y - t.y, tgt.x - t.x), 12, dt);
        if (t.cd <= 0 && tgt && game.state === 'play') {
          t.cd = 0.15;
          t.flash = 0.06;
          const sp = 900 * S;
          game.spawnShot({ x: t.x + Math.cos(t.ang) * 14 * S, y: t.y + Math.sin(t.ang) * 14 * S, vx: Math.cos(t.ang) * sp, vy: Math.sin(t.ang) * sp, dmg: 9 * game.dmgMul(), r: 4 * S, kind: 'drone', sprite: 'pb_bolt_s', w: 11 * S, wid: 'turret', life: 1.2 });
          if (Math.random() < 0.4) A.play('laser', { vol: 0.25, rate: 1.6 });
        }
      }
    }
    // двойник летит рядом (у края — с другой стороны)
    if (K.clone) {
      const c = K.clone;
      c.t += dt;
      if (!(run.skillFx.sk_clone > 0) || !p.alive) { FX.glowPuff(c.x, c.y, '#3de0ff', 60 * S, 0.3); K.clone = null; }
      else {
        const side = p.x > G.FW - p.w * 1.6 ? -1 : 1;
        c.x = U.damp(c.x, p.x + side * p.w * 1.05, 10, dt);
        c.y = U.damp(c.y, p.y + p.w * 0.15, 10, dt);
      }
    }
    // заглушённые ЭМИ враги искрят
    if (FX.quality > 0) {
      for (const e of game.enemies) {
        if (e.alive && e.emp > 0 && Math.random() < dt * 6) {
          const a = Math.random() * U.TAU, r = (e.rx || e.r) * 0.9;
          FX.lightning(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, e.x + U.rand(-0.3, 0.3) * e.w, e.y + U.rand(-0.3, 0.3) * e.h, '#9fe8ff', 1.4 * S, 0.12);
        }
      }
    }
  };

  // Барьер: пуля, коснувшаяся барьера, летит обратно — в ближайшего врага
  K.reflect = function (b) {
    const p = game.player, S = G.S;
    if (!(game.run.skillFx.sk_barrier > 0) || Math.hypot(b.x - p.x, b.y - p.y) > p.w * 0.85) return false;
    let tgt = null, bd = Infinity;
    for (const e of game.enemies) { if (!e.alive || !e.hittable) continue; const d = Math.hypot(e.x - b.x, e.y - b.y); if (d < bd) { bd = d; tgt = e; } }
    const a = tgt ? Math.atan2(tgt.y - b.y, tgt.x - b.x) : -Math.PI / 2, sp = 760 * S;
    game.spawnShot({ x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg: 14 * game.dmgMul(), r: 5 * S, kind: 'drone', sprite: 'pb_bolt_s', w: 12 * S, wid: 'barrier', life: 1.2 });
    FX.hit(b.x, b.y, '#ffd23d');
    return true;
  };

  // Двойник повторяет выстрелы: копии новых снарядов этого кадра со сдвигом, урон 60%
  K.echo = function (from) {
    const c = K.clone, p = game.player;
    if (!c) return;
    const dx = c.x - p.x, dy = c.y - p.y, bs = game.bullets, n = bs.length;
    for (let i = from; i < n; i++) {
      const b = bs[i];
      if (b.dead || b.wid === 'turret' || b.wid === 'barrier' || b.wid === 'drone') continue;
      game.spawnShot({ x: b.x + dx, y: b.y + dy, vx: b.vx, vy: b.vy, dmg: b.dmg * 0.6, r: b.r, kind: b.kind, sprite: b.sprite, cv: b.cv, w: b.w, w1: b.w1, ch: b.ch,
        pierce: b.pierce, life: b.life, homing: b.homing, aoe: b.aoe * 0.6, aoeR: b.aoeR, acc: b.acc, maxSpd: b.maxSpd, tickT: b.tickT, pull: b.pull, burst: b.burst * 0.6, burstR: b.burstR, wid: b.wid });
    }
  };

  // ════════════════════════════════════════════════════════════
  // ОТРИСОВКА
  // ════════════════════════════════════════════════════════════
  // под кораблём: прицелы и лучи орбитального удара
  K.drawBack = function (ctx) {
    const o = K.orb, S = G.S;
    if (!o) return;
    ctx.globalCompositeOperation = 'lighter';
    for (const m of o.marks) {
      if (!m.fired) {
        // прицел: четыре уголка сжимаются на цели к моменту удара
        const k = U.clamp(o.t / m.at, 0, 1), r = (60 - 36 * k) * S, rot = (1 - k) * 2;
        ctx.globalAlpha = 0.35 + 0.6 * k * (0.6 + 0.4 * Math.sin(game.t * 30));
        ctx.strokeStyle = '#ff5c4d'; ctx.lineWidth = 2 * S;
        for (let q = 0; q < 4; q++) {
          const a = rot + q * Math.PI / 2;
          ctx.beginPath(); ctx.arc(m.x, m.y, r, a - 0.35, a + 0.35); ctx.stroke();
        }
        ctx.globalAlpha = 0.5 * k;
        ctx.beginPath(); ctx.arc(m.x, m.y, 3 * S, 0, U.TAU); ctx.fillStyle = '#ff9f8a'; ctx.fill();
        // тонкая нить с орбиты перед ударом
        if (k > 0.6) game.drawBeamV(ctx, m.x, 0, m.y, 1.5 * S, '#ff5c4d', (k - 0.6) * 1.2, 1);
      } else if (m.ft < 0.4) {
        const f = 1 - m.ft / 0.4;
        game.drawBeamV(ctx, m.x, 0, m.y, 16 * S * (0.5 + 0.5 * f), '#ff6a3d', f, 1, m.y);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  // над кораблём: турель, двойник, анимации запуска
  K.drawFront = function (ctx) {
    const S = G.S, p = game.player, t = game.t, s = SS.store.s;
    const c = K.clone;
    if (c) {
      // голограмма: полупрозрачный корабль с бегущими полосами развёртки
      const born = U.clamp(c.t / 0.45, 0, 1);
      ctx.save();
      ctx.beginPath(); ctx.rect(c.x - p.w, c.y + p.w * (0.8 - 1.8 * born), p.w * 2, p.w * 2); ctx.clip();
      ctx.globalAlpha = (0.42 + 0.08 * Math.sin(t * 23)) * (Math.random() < 0.04 ? 0.4 : 1);
      game.drawShip(ctx, s.ship.model, s.ship.skin, s.ship.trail, c.x, c.y, p.w, p.tilt, t, 1, game.run.parts);
      ctx.restore();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.25;
      ctx.drawImage(G.soft('#3de0ff', 64), c.x - p.w, c.y - p.w, p.w * 2, p.w * 2);
      ctx.globalAlpha = 0.18; ctx.fillStyle = '#7ff6ff';
      for (let y = c.y - p.w * 0.6 + ((t * 40 * S) % (6 * S)); y < c.y + p.w * 0.6; y += 6 * S) ctx.fillRect(c.x - p.w * 0.5, y, p.w, 1 * S);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    const tu = K.turret;
    if (tu) {
      const w = p.w * 0.75;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 + 0.1 * Math.sin(t * 8);
      ctx.drawImage(G.soft('#b06bff', 64), tu.x - w, tu.y - w, w * 2, w * 2);
      if (tu.flash > 0) { ctx.globalAlpha = 1; const fx = tu.x + Math.cos(tu.ang) * w * 0.55, fy = tu.y + Math.sin(tu.ang) * w * 0.55; ctx.drawImage(G.glow('#e0c8ff', 32), fx - 8 * S, fy - 8 * S, 16 * S, 16 * S); }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      G.draw(ctx, 'sp_radar', tu.x, tu.y, w, tu.ang + Math.PI / 2);
    }
    if (!K.casts.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (const k of K.casts) drawCast(ctx, k, p, S, t);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  function drawCast(ctx, k, p, S, t) {
    const f = k.t / k.dur;
    ctx.strokeStyle = k.color; ctx.fillStyle = k.color;
    if (k.kind === 'converge') {
      // искры стягиваются к носу корабля
      const x = p.x, y = p.y - p.w * 0.55;
      for (let i = 0; i < 14; i++) {
        const a = i / 14 * U.TAU + i * 0.7, r = (80 - 74 * f) * S;
        ctx.globalAlpha = 0.3 + 0.7 * f;
        ctx.drawImage(G.glow(k.color, 32), x + Math.cos(a) * r - 4 * S, y + Math.sin(a) * r - 4 * S, 8 * S, 8 * S);
      }
    } else if (k.kind === 'hex') {
      // соты барьера разбегаются от корабля
      const R = p.w * (0.4 + 0.5 * f);
      ctx.globalAlpha = 1 - f; ctx.lineWidth = 2 * S;
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * U.TAU + f;
        hexagon(ctx, p.x + Math.cos(a) * R, p.y + Math.sin(a) * R, 9 * S);
      }
    } else if (k.kind === 'clock') {
      // циферблат: кольцо с делениями расходится, стрелки крутятся назад
      const R = (40 + 150 * f) * S;
      ctx.globalAlpha = 0.8 * (1 - f); ctx.lineWidth = 2.5 * S;
      ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, U.TAU); ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * U.TAU;
        ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * R * 0.86, p.y + Math.sin(a) * R * 0.86); ctx.lineTo(p.x + Math.cos(a) * R, p.y + Math.sin(a) * R); ctx.stroke();
      }
      ctx.lineWidth = 3 * S;
      for (const [len, sp] of [[0.55, -9], [0.8, -26]]) {
        const a = -Math.PI / 2 + t * sp;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(a) * R * len, p.y + Math.sin(a) * R * len); ctx.stroke();
      }
    } else if (k.kind === 'portal') {
      const r = 26 * S * Math.sin(Math.min(1, f * 1.4) * Math.PI / 2);
      ctx.globalAlpha = 1 - f * 0.6; ctx.lineWidth = 2.5 * S;
      ctx.beginPath(); ctx.ellipse(K.turret ? K.turret.x : k.x, K.turret ? K.turret.y : k.y, r, r * 0.45, 0, 0, U.TAU); ctx.stroke();
    } else if (k.kind === 'implode') {
      // спираль частиц сходится в центр дыры
      for (let i = 0; i < 18; i++) {
        const a = i / 18 * U.TAU + f * 6, r = (180 - 170 * f) * S * (0.6 + 0.4 * ((i * 7) % 5) / 5);
        ctx.globalAlpha = 0.25 + 0.6 * f;
        ctx.drawImage(G.glow(k.color, 32), k.x + Math.cos(a) * r - 5 * S, k.y + Math.sin(a) * r - 5 * S, 10 * S, 10 * S);
      }
    } else if (k.kind === 'scan') {
      // двойник собирается полосой развёртки
      const c = K.clone;
      if (!c) return;
      const y = c.y + p.w * (0.8 - 1.8 * f);
      ctx.globalAlpha = 0.9 * (1 - f * 0.5); ctx.fillRect(c.x - p.w * 0.6, y - 1.5 * S, p.w * 1.2, 3 * S);
      ctx.globalAlpha = 0.4; ctx.drawImage(G.glow(k.color, 32), c.x - p.w * 0.7, y - 10 * S, p.w * 1.4, 20 * S);
    } else if (k.kind === 'satellite') {
      // спутник проходит по верху экрана и раздаёт целеуказание
      const x = U.lerp(-30 * S, G.FW + 30 * S, f), y = (SS.ui ? SS.ui.topInset() : 120) + 8 * S;
      ctx.globalAlpha = 0.5;
      ctx.drawImage(G.glow(k.color, 32), x - 18 * S, y - 18 * S, 36 * S, 36 * S);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      G.draw(ctx, 'sp_radar', x, y, 26 * S, Math.PI);
      ctx.globalCompositeOperation = 'lighter';
    }
  }
  function hexagon(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) { const a = i / 6 * U.TAU + Math.PI / 6; if (i) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    ctx.stroke();
  }
})();
