// ════════════════════════════════════════════════════════════════
// SPACE SHOOTER 3.1 — механики секторов
//  У каждого сектора своё правило на волнах 1–4 (бой с боссом без него).
//  Пояс астероидов, Улей и Красный гигант — в events.js; здесь остальные:
//  спутники, туманность, лёд, яд, гравитация, звёздный ветер, кристаллы,
//  порталы, столпы света и Око. events.updateMech/draw вызывают MECH[id].
//  m: { id, wave, k (0..3 — номер волны в секторе), cd } — сила растёт с k.
// ════════════════════════════════════════════════════════════════
'use strict';

(function () {
  const U = SS.util, D = SS.data;
  let G, FX, A, game, E;

  const SC = {
    init() {
      G = SS.gfx; FX = SS.fx; A = SS.audio; game = SS.game; E = SS.enemies;
      Object.assign(E.AI, AI); Object.assign(E.INIT, INIT);
    },
    has(id) { return !!MECH[id]; },
    update(m, dt) { const mc = MECH[m.id]; if (!m.st) { m.st = {}; if (mc.start) mc.start(m); } mc.update(m, dt); },
    drawBack(ctx, m) { const mc = MECH[m.id]; if (m.st && mc.back) mc.back(ctx, m); },
    drawMid(ctx, m) { const mc = MECH[m.id]; if (m.st && mc.mid) mc.mid(ctx, m); },
  };
  SS.sectors = SC;

  function count(type) { let n = 0; for (const e of game.enemies) if (e.alive && e.type === type) n++; return n; }
  function ready(name) { return SS.foes.ready(name); }

  // ── поведение «обстановки» ──
  const INIT = {
    // спутник пролетает поперёк экрана, медленно вращаясь
    satfly(e) {
      const side = Math.random() < 0.5 ? -1 : 1;
      e.x = side < 0 ? -e.w : G.FW + e.w;
      e.y = U.rand(0.16, 0.45) * G.H;
      e.vx = -side * e.spd; e.spinAng = 0; e.spin = U.rand(0.5, 1) * side;
    },
  };
  const AI = {
    satfly(e, dt) {
      e.x += e.vx * dt;
      e.y += Math.sin(e.age * 1.3) * 8 * G.S * dt;
      e.spinAng += e.spin * dt;
      if ((e.vx > 0 && e.x > G.FW + e.w) || (e.vx < 0 && e.x < -e.w)) { e.alive = false; e.leaving = true; }
    },
  };

  // смерть «обстановки» (из foes.onKill): лёд морозит, яд оставляет облако, спутник роняет бонус
  SC.onKill = function (e) {
    const S = G.S, m = SS.events.mech;
    if (e.type === 'ice_rock') {
      const R = 110 * S * (e.w / (48 * S));
      FX.ring(e.x, e.y, 8 * S, R, '#bff4ff', 0.45, 4);
      FX.sparks(e.x, e.y, '#dff9ff', 14, 240);
      for (const o of game.enemies) if (o.alive && !o.boss && o !== e && U.dist2(o.x, o.y, e.x, e.y) < R * R) { o.frozen = Math.max(o.frozen, 2.5); FX.frost && FX.frost(o.x, o.y); }
      A.play('shieldHit', { rate: 1.6, vol: 0.5 });
    } else if (e.type === 'toxic_rock' && m && m.id === 'toxic' && m.st) {
      m.st.clouds.push({ x: e.x, y: e.y, r: 64 * S * (e.w / (48 * S)), t: 0, dur: 5, tick: 0 });
      A.play('mine', { rate: 0.5, vol: 0.4 });
    } else if (e.type === 'satellite') {
      if (Math.random() < 0.6) game.dropPowerup(e.x, e.y); else game.dropCoins(e.x, e.y, 5);
      FX.text(e.x, e.y - e.r, 'ГРУЗ!', '#7fe7ff', 13, 0.8, -50);
    }
  };

  // ════════════════════════════════════════════════════════════
  // МЕХАНИКИ
  // ════════════════════════════════════════════════════════════
  const MECH = {
    // ОРБИТА ЗЕМЛИ: спутники связи пролетают поперёк — сбитый роняет бонус или монеты
    sats: {
      update(m, dt) {
        m.cd -= dt;
        if (m.cd > 0) return;
        m.cd = [9, 8, 7, 6][m.k] * U.rand(0.8, 1.2);
        if (count('satellite') < 2 && ready('sp_radar')) E.spawn('satellite', { noElite: true });
      },
    },

    // ТУМАННОСТЬ ОРИОНА: облака плывут вниз и прячут врагов (самонаведение их не видит)
    nebula: {
      start(m) { m.st.clouds = []; },
      update(m, dt) {
        const S = G.S, cl = m.st.clouds;
        m.cd -= dt;
        if (m.cd <= 0 && cl.length < [2, 3, 3, 4][m.k]) {
          m.cd = [6, 5, 4.5, 4][m.k] * U.rand(0.8, 1.2);
          cl.push({ x: U.rand(0.15, 0.85) * G.FW, y: -90 * S, r: U.rand(70, 110) * S, vy: U.rand(22, 34) * S, ph: Math.random() * U.TAU });
        }
        for (let i = cl.length - 1; i >= 0; i--) { cl[i].y += cl[i].vy * dt; if (cl[i].y > G.H * 0.75 + cl[i].r) cl.splice(i, 1); }
        for (const e of game.enemies) {
          if (!e.alive || e.boss) continue;
          e.fog = false;
          for (const c of cl) if (U.dist2(e.x, e.y, c.x, c.y) < c.r * c.r * 0.7) { e.fog = true; break; }
        }
      },
      // поверх врагов — облака их и прячут
      mid(ctx, m) {
        const t = game.t;
        for (const c of m.st.clouds) {
          for (let i = 0; i < 4; i++) {
            const a = c.ph + i * 1.7 + t * 0.2, x = c.x + Math.cos(a) * c.r * 0.35, y = c.y + Math.sin(a * 1.3) * c.r * 0.25, r = c.r * (0.75 + 0.15 * Math.sin(t + i));
            ctx.globalAlpha = 0.55;
            ctx.drawImage(G.soft(i % 2 ? '#8a3dff' : '#ff3dd2', 64), x - r, y - r, r * 2, r * 2);
          }
          ctx.globalAlpha = 0.35;
          ctx.drawImage(G.soft('#2a0a3a', 64), c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
        }
        ctx.globalAlpha = 1;
      },
    },

    // ЛЕДЯНЫЕ ЛУНЫ: ледяные глыбы закрывают от пуль; разбитая — замораживает врагов вокруг
    ice: {
      update(m, dt) {
        m.cd -= dt;
        if (m.cd > 0) return;
        m.cd = [3, 2.6, 2.2, 1.8][m.k] * U.rand(0.8, 1.2);
        if (count('ice_rock') >= [2, 3, 4, 5][m.k] || !ready('asti_l')) return;
        const scale = U.rand(0.85, 1.15) + m.k * 0.06;
        E.spawn('ice_rock', { sprite: scale < 1 ? U.pick(['asti_m1', 'asti_m2']) : scale < 1.15 ? 'asti_l' : 'asti_xl', noElite: true, scale, hpMul: scale * scale });
      },
    },

    // ИЗУМРУДНЫЕ ПОЛЯ: ядовитые глыбы; разбитая оставляет облако — оно жжёт врагов, а корабль — если задержаться
    toxic: {
      start(m) { m.st.clouds = []; m.st.inT = 0; },
      update(m, dt) {
        const S = G.S, st = m.st, p = game.player;
        m.cd -= dt;
        if (m.cd <= 0) {
          m.cd = [3.2, 2.8, 2.4, 2][m.k] * U.rand(0.8, 1.2);
          if (count('toxic_rock') < [2, 3, 3, 4][m.k] && ready('astp_l1')) {
            const scale = U.rand(0.85, 1.15) + m.k * 0.06;
            E.spawn('toxic_rock', { sprite: scale < 1 ? 'astp_m' : scale < 1.15 ? U.pick(['astp_l1', 'astp_l2']) : 'astp_xl', noElite: true, scale, hpMul: scale * scale });
          }
        }
        let inside = false;
        for (let i = st.clouds.length - 1; i >= 0; i--) {
          const c = st.clouds[i];
          c.t += dt; c.tick -= dt;
          if (c.t > c.dur) { st.clouds.splice(i, 1); continue; }
          if (c.tick <= 0) {
            c.tick = 0.5;
            for (const e of game.enemies) if (e.alive && e.hittable && !e.def.prop && U.dist2(e.x, e.y, c.x, c.y) < c.r * c.r) game.damageEnemy(e, e.boss || e.mini ? e.maxHp * 0.005 : e.maxHp * 0.08 + 4, { src: 'toxic', noText: true });
          }
          if (p.alive && U.dist2(p.x, p.y, c.x, c.y) < c.r * c.r * 0.8) inside = true;
        }
        // в облаке дольше 1,2 с — урон (рамка экрана зеленеет заранее)
        st.inT = inside ? st.inT + dt : 0;
        if (st.inT > 1.2) { st.inT = 0; game.hitPlayer(p.x, p.y, 'Ядовитое облако'); }
      },
      back(ctx, m) {
        const t = game.t, S = G.S;
        for (const c of m.st.clouds) {
          const k = Math.min(1, c.t * 3, (c.dur - c.t) * 1.5);
          ctx.globalAlpha = 0.5 * k;
          ctx.drawImage(G.soft('#3dff7a', 64), c.x - c.r * 1.2, c.y - c.r * 1.2, c.r * 2.4, c.r * 2.4);
          ctx.globalAlpha = 0.45 * k;
          for (let i = 0; i < 6; i++) {
            const a = i * 1.05 + t * 0.7, rr = c.r * (0.3 + 0.12 * ((i * 3) % 4)), y = c.y + Math.sin(a) * rr - ((t * 20 * S + i * 13) % (c.r * 0.6));
            ctx.drawImage(G.glow('#a6ff3d', 32), c.x + Math.cos(a) * rr - 4 * S, y - 4 * S, 8 * S, 8 * S);
          }
        }
        ctx.globalAlpha = 1;
        if (m.st.inT > 0.2) { ctx.globalAlpha = Math.min(1, m.st.inT) * 0.5; ctx.drawImage(FX.vigCanvas('#3dff7a'), 0, 0, G.FW, G.H); ctx.globalAlpha = 1; }
      },
    },

    // ГОРИЗОНТ СОБЫТИЙ: у края экрана — гравитационный колодец; гнёт все снаряды и тянет корабль
    gravity: {
      start(m) { m.st.side = m.wave.n % 2 ? -1 : 1; m.st.a = 0; },
      update(m, dt) {
        const S = G.S, st = m.st, p = game.player, gx = st.side < 0 ? -10 * S : G.FW + 10 * S, gy = G.H * 0.42;
        st.a = Math.min(1, st.a + dt * 0.5);
        const pow = 260 * S * (1 + m.k * 0.25) * st.a;
        const pull = (b) => {
          const dx = gx - b.x, dy = gy - b.y, d = Math.hypot(dx, dy) || 1, f = pow / (1 + d / (160 * S)) * dt;
          b.vx += dx / d * f; b.vy += dy / d * f;
        };
        for (const b of game.ebullets) if (!b.dead && b.type !== 'mine') pull(b);
        for (const b of game.bullets) if (!b.dead && b.kind !== 'dark' && b.kind !== 'wave') pull(b);
        if (p.alive && game.state === 'play') { p.x += st.side * 16 * S * (1 + m.k * 0.2) * st.a * dt; game.clampPlayer(); }
      },
      back(ctx, m) {
        const S = G.S, st = m.st, t = game.t, gx = st.side < 0 ? 0 : G.FW, gy = G.H * 0.42, R = 150 * S * st.a;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.35 * st.a;
        ctx.drawImage(G.soft('#7a3dff', 64), gx - R * 1.6, gy - R * 1.6, R * 3.2, R * 3.2);
        if (G.frame('fx_vortex')) { ctx.globalAlpha = 0.75 * st.a; G.draw(ctx, 'fx_vortex', gx, gy, R * 1.5, -t * 1.8); }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = st.a;
        ctx.drawImage(G.proc('voidcore'), gx - R * 0.3, gy - R * 0.3, R * 0.6, R * 0.6);
        ctx.globalAlpha = 1;
      },
    },

    // СЕРДЦЕ ГАЛАКТИКИ: порывы звёздного ветра — стрелки предупреждают, потом сносит пули, бонусы и корабль
    wind: {
      start(m) { m.st.gust = null; m.st.streaks = []; },
      update(m, dt) {
        const S = G.S, st = m.st, p = game.player;
        m.cd -= dt;
        if (!st.gust && m.cd <= 0) { st.gust = { t: 0, dir: Math.random() < 0.5 ? -1 : 1, warn: 1.1, dur: [2, 2.3, 2.6, 3][m.k] }; A.play('warning', { vol: 0.25, rate: 1.6 }); }
        const g = st.gust;
        if (g) {
          g.t += dt;
          if (g.t > g.warn) {
            const k = Math.min(1, (g.t - g.warn) * 3, (g.warn + g.dur - g.t) * 3), v = g.dir * 150 * S * (1 + m.k * 0.15) * k;
            for (const b of game.ebullets) if (!b.dead) b.x += v * dt * 0.8;
            for (const it of game.pickups) if (!it.dead && !it.pull) it.x = U.clamp(it.x + v * dt, 10 * S, G.FW - 10 * S);
            for (const e of game.enemies) if (e.alive && !e.boss && !e.mini) e.x = U.clamp(e.x + v * dt * 0.25, e.w * 0.5, G.FW - e.w * 0.5);
            if (p.alive && game.state === 'play') { p.x += v * dt * 0.45; game.clampPlayer(); }
            if (Math.random() < dt * 40) st.streaks.push({ x: g.dir > 0 ? -20 * S : G.FW + 20 * S, y: Math.random() * G.H, l: U.rand(30, 80) * S, v: g.dir * U.rand(500, 800) * S });
          }
          if (g.t > g.warn + g.dur) { st.gust = null; m.cd = [7, 6, 5.5, 5][m.k] * U.rand(0.85, 1.15); }
        }
        for (let i = st.streaks.length - 1; i >= 0; i--) { const s = st.streaks[i]; s.x += s.v * dt; if (s.x < -100 * S || s.x > G.FW + 100 * S) st.streaks.splice(i, 1); }
      },
      back(ctx, m) {
        const S = G.S, st = m.st, g = st.gust, t = game.t;
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = '#ffd9a0'; ctx.lineWidth = 1.5 * S;
        for (const s of st.streaks) { ctx.globalAlpha = 0.45; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - Math.sign(s.v) * s.l, s.y); ctx.stroke(); }
        // стрелки-предупреждения по центру экрана
        if (g && g.t < g.warn) {
          ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(t * 10));
          ctx.fillStyle = '#ffc83d';
          for (let i = 0; i < 3; i++) {
            const x = G.FW / 2 + g.dir * (i - 1) * 34 * S, y = G.H * 0.5, s = 14 * S;
            ctx.beginPath(); ctx.moveTo(x + g.dir * s, y); ctx.lineTo(x - g.dir * s * 0.5, y - s); ctx.lineTo(x - g.dir * s * 0.5, y + s); ctx.closePath(); ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      },
    },

    // КРИСТАЛЬНЫЙ ПОЯС: кристаллы закрывают от пуль и преломляют ваши выстрелы веером из трёх (game.collide)
    prism: {
      update(m, dt) {
        m.cd -= dt;
        if (m.cd > 0) return;
        m.cd = [3, 2.5, 2.1, 1.8][m.k] * U.rand(0.8, 1.2);
        if (count('prism_rock') >= [2, 3, 4, 4][m.k]) return;
        const scale = U.rand(0.85, 1.2) + m.k * 0.05;
        E.spawn('prism_rock', { sprite: scale < 1 ? 'astc_m' : scale < 1.15 ? 'astc_l' : 'astc_xl', noElite: true, scale, hpMul: scale * scale });
      },
    },

    // ПУСТОШЬ ХАОСА: пара порталов перебрасывает любые снаряды из одного в другой; порталы иногда переезжают
    portals: {
      start(m) { m.st.p = null; m.st.t = 0; },
      update(m, dt) {
        const S = G.S, st = m.st;
        st.t -= dt;
        if (st.t <= 0) {
          st.t = [11, 10, 9, 8][m.k];
          const y1 = U.rand(0.22, 0.45) * G.H, y2 = U.rand(0.22, 0.45) * G.H;
          st.p = [{ x: U.rand(0.12, 0.38) * G.FW, y: y1, born: game.t }, { x: U.rand(0.62, 0.88) * G.FW, y: y2, born: game.t }];
          for (const o of st.p) FX.portal(o.x, o.y, 64 * S, '#ff7a2a', true);
          A.play('teleport', { rate: 0.7, vol: 0.5 });
        }
        if (!st.p) return;
        const R = 24 * S;
        const hop = (b) => {
          if (b.dead || (b.tpT && game.t - b.tpT < 0.4)) return;
          for (let i = 0; i < 2; i++) {
            const a = st.p[i], o = st.p[1 - i];
            if (U.dist2(b.x, b.y, a.x, a.y) < R * R) { b.x = o.x; b.y = o.y; b.px = b.x; b.py = b.y; b.tpT = game.t; FX.glowPuff(o.x, o.y, '#ff9f3d', 26 * S, 0.2); return; }
          }
        };
        for (const b of game.ebullets) hop(b);
        for (const b of game.bullets) if (b.kind !== 'wave' && b.kind !== 'dark') hop(b);
      },
      back(ctx, m) {
        const st = m.st, S = G.S, t = game.t;
        if (!st.p) return;
        ctx.globalCompositeOperation = 'lighter';
        for (const o of st.p) {
          const k = Math.min(1, (t - o.born) * 2);
          ctx.globalAlpha = 0.5 * k;
          ctx.drawImage(G.soft('#ff7a2a', 64), o.x - 40 * S, o.y - 40 * S, 80 * S, 80 * S);
          ctx.globalAlpha = 0.9 * k;
          if (G.frame('fx_portal_out')) G.drawCanvas(ctx, G.tinted('fx_portal_out', { hue: 25 }), o.x, o.y, 58 * S * k, t * 1.5);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      },
    },

    // ЦИТАДЕЛЬ ИНКВИЗИЦИИ: столпы света бьют сверху по всем — подставляйте под них врагов
    pillars: {
      update(m, dt) {
        const S = G.S, p = game.player;
        m.cd -= dt;
        if (m.cd > 0) return;
        m.cd = [4.2, 3.6, 3.1, 2.6][m.k] * U.rand(0.85, 1.15);
        const near = Math.random() < 0.4;
        let x = near ? p.x + U.rand(-30, 30) * S : U.rand(0.1, 0.9) * G.FW;
        if (!near) { const es = game.enemies.filter((e) => e.alive && !e.boss && !e.def.prop); if (es.length && Math.random() < 0.6) x = U.pick(es).x; }
        game.ov.beams.push({ x: U.clamp(x, 20 * S, G.FW - 20 * S), y0: 0, w: 20 * S, warn: 1.1, dur: 0.5, t: 0, color: '#ffd23d', hitDone: false, owner: null, foes: true });
        A.play('railCharge', { vol: 0.3, rate: 1.3 });
      },
    },

    // ТРОН ОВЕРЛОРДА: Око открывается и следит — стоите на месте дольше секунды, по вам бьёт луч
    eye: {
      start(m) { m.st.ph = 'closed'; m.st.t = 3; m.st.still = 0; m.st.lx = null; m.st.cool = 0; m.st.open = 0; },
      update(m, dt) {
        const S = G.S, st = m.st, p = game.player;
        st.t -= dt;
        if (st.ph === 'closed' && st.t <= 0) { st.ph = 'open'; st.t = [4, 4.5, 5, 5.5][m.k]; A.play('bossRoar', { vol: 0.25, rate: 1.8 }); }
        else if (st.ph === 'open' && st.t <= 0) { st.ph = 'closed'; st.t = [7, 6.5, 6, 5.5][m.k] * U.rand(0.85, 1.15); }
        st.open = U.damp(st.open, st.ph === 'open' ? 1 : 0, 6, dt);
        st.cool -= dt;
        if (st.ph !== 'open' || !p.alive) { st.still = 0; st.lx = null; return; }
        if (st.lx !== null && Math.hypot(p.x - st.lx, p.y - st.ly) > 24 * S) { st.still = 0; st.lx = p.x; st.ly = p.y; }
        if (st.lx === null) { st.lx = p.x; st.ly = p.y; }
        st.still += dt;
        if (st.still > 1.1 && st.cool <= 0) {
          st.still = 0; st.cool = 1.6; st.lx = null;
          game.ov.beams.push({ x: p.x, y0: 0, w: 18 * S, warn: 0.6, dur: 0.4, t: 0, color: '#ff3d8b', hitDone: false, owner: null });
          A.play('railCharge', { vol: 0.45, rate: 1.5 });
        }
      },
      back(ctx, m) {
        const S = G.S, st = m.st, k = st.open, t = game.t;
        if (k < 0.02) return;
        const x = G.FW / 2, y = (SS.ui ? SS.ui.topInset() : 120) + 34 * S, w = 70 * S, h = 26 * S * k;
        const hot = st.still > 0.5;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.35 * k;
        ctx.drawImage(G.soft(hot ? '#ff3d5a' : '#c03dff', 64), x - w * 1.3, y - w * 0.8, w * 2.6, w * 1.6);
        ctx.globalCompositeOperation = 'source-over';
        // веко и зрачок, который следит за кораблём
        ctx.globalAlpha = 0.85 * k;
        ctx.fillStyle = '#12051c'; ctx.strokeStyle = hot ? '#ff6b7d' : '#d07bff'; ctx.lineWidth = 2.5 * S;
        ctx.beginPath(); ctx.ellipse(x, y, w, Math.max(1, h), 0, 0, U.TAU); ctx.fill(); ctx.stroke();
        const px = x + U.clamp((game.player.x - x) / G.FW, -0.5, 0.5) * w * 1.1;
        ctx.save(); ctx.beginPath(); ctx.ellipse(x, y, w, Math.max(1, h), 0, 0, U.TAU); ctx.clip();
        ctx.fillStyle = hot ? '#ff3d5a' : '#ff3d8b';
        ctx.beginPath(); ctx.arc(px, y, 15 * S, 0, U.TAU); ctx.fill();
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(px, y, 4 * S, 11 * S * (0.7 + 0.3 * Math.sin(t * 3)), 0, 0, U.TAU); ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
      },
    },
  };
})();
