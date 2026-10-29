// ════════════════════════════════════════════════════════════════
// SPACE SHOOTER 2.5 — события волны
//  С 6-й волны иногда одна волна идёт по особым правилам: ионная буря,
//  метеоритный дождь, солнечные вспышки, космический мусор.
//  Событие объявляется после баннера волны и длится до её зачистки.
//  3.0: механики секторов — то же, но постоянно на волнах 1–4 сектора (бой с боссом без них)
//  и мягче; сила растёт от первой волны сектора к четвёртой.
//  3.1: событие «Конвой», механики «Улья» (яйца) и «Красного гиганта» (лавовые астероиды).
// ════════════════════════════════════════════════════════════════
'use strict';

(function () {
  const U = SS.util, D = SS.data;
  let G, FX, A, M, game;

  // метеор летит вниз-влево, как нарисован на листе; голова — в левом нижнем углу кадра
  const MDIR = { x: -0.63, y: 0.77 };
  const MHEAD = { fx_meteor1: [0.2, 0.81], fx_meteor2: [0.24, 0.82] };

  const ev = {
    cur: null,
    mech: null,             // механика текущего сектора { id, wave, k, cd }
    init() { G = SS.gfx; FX = SS.fx; A = SS.audio; M = SS.meta; game = SS.game; },
    reset() { this.cur = null; this.mech = null; },
    active() { return this.cur && this.cur.announced ? this.cur.def : null; },

    // на старте волны решаем, будет ли событие
    roll(w) {
      this.cur = null;
      const run = game.run, ch = run.challenge;
      const sec = game.sectorDef(run.sector);
      // k: 0..3 — номер волны в секторе; бой с боссом проходит без механики
      this.mech = sec.mech && !w.boss ? { id: sec.mech, wave: w, k: (w.n - 1) % 5, cd: 0.6 } : null;
      if (w.boss) return;
      const always = !!(ch && ch.mods.includes('events'));
      if (w.n < (always ? 3 : D.EVENT_WAVE)) return;
      if (!always && (run.lastEvent >= w.n - 1 || Math.random() > D.EVENT_CHANCE)) return;
      const pool = D.EVENTS.filter((d) => d.id !== run.lastEventId && !(sec.noEvents && sec.noEvents.includes(d.id)));
      const def = pool[Math.floor(Math.random() * pool.length)];
      run.lastEvent = w.n; run.lastEventId = def.id;
      this.cur = { def, wave: w, t: 0, start: w.intro + 1.3, cd: 0, announced: false, strikes: [], lanes: [], meteors: [], solar: null };
    },

    // волна зачищена — событие пережито
    finish() {
      const c = this.cur;
      this.cur = null;
      if (!c || !c.announced) return;
      const st = M.s.stats;
      st.events = (st.events || 0) + 1;
      M.trackMission('events', 1);
      M.checkAchievements();
      const pts = Math.round(400 * c.wave.n * game.diff.score);
      game.addScore(pts);
      FX.text(G.FW / 2, G.H * 0.46, c.def.name + ' ПОЗАДИ  +' + U.fmt(pts), c.def.color, 14, 1.6, -22);
    },

    update(dt) {
      if (this.mech) this.updateMech(dt);
      const c = this.cur;
      if (!c) return;
      if (c.wave !== game.wave) { this.cur = null; return; }
      const edt = dt * game.enemySlow();
      c.t += dt;
      this.updateStrikes(edt);
      this.updateMeteors(edt);
      if (c.solar) this.updateSolar(edt);
      if (c.t < c.start) return;
      if (!c.announced) {
        c.announced = true;
        SS.emit('waveEvent', c.def);
        A.play('skill', { rate: 0.8 });
        game.hudDirty = true;
        c.cd = 1.4;
      }
      // пока в волне ещё есть враги; обломки — только пока волна не выпустила всех
      let alive = 0;
      for (const e of game.enemies) if (e.alive && !e.leaving && e.type !== 'debris' && !e.def.prop) alive++;
      if (c.wave.done && !alive) return;
      c.cd -= edt;
      if (c.cd > 0 || !game.player.alive) return;
      this['spawn_' + c.def.id](c);
    },

    // ── ИОННАЯ БУРЯ: метка на месте удара, через секунду молния ──
    spawn_storm(c) {
      const S = G.S, p = game.player, r = Math.random();
      c.cd = U.rand(1.05, 1.55);
      let x, y;
      if (r < 0.45) { x = p.x + U.rand(-30, 30) * S; y = p.y + U.rand(-30, 30) * S; }
      else {
        const es = game.enemies.filter((e) => e.alive && !e.boss && e.hittable && e.y > 60 * S && e.y < G.H * 0.8);
        if (es.length && r < 0.85) { const e = es[Math.floor(Math.random() * es.length)]; x = e.x; y = e.y; }
        else { x = U.rand(0.1, 0.9) * G.FW; y = U.rand(0.25, 0.85) * G.H; }
      }
      c.strikes.push({ x: U.clamp(x, 20 * S, G.FW - 20 * S), y: U.clamp(y, 60 * S, G.H - 30 * S), t: 0, warn: 1.1, R: 46 * S, done: false });
    },
    updateStrikes(dt) {
      const c = this.cur, S = G.S, p = game.player;
      for (const s of c.strikes) {
        s.t += dt;
        if (s.done || s.t < s.warn) continue;
        s.done = true;
        FX.lightning(s.x + U.rand(-40, 40) * S, -10, s.x, s.y, '#cfe6ff', 3.6 * S, 0.24);
        FX.lightning(s.x + U.rand(-60, 60) * S, -10, s.x, s.y, '#7fb8ff', 1.8 * S, 0.2);
        FX.sprite('fx_bolt', s.x, s.y, { w0: 44 * S, w1: 74 * S, dur: 0.32, hold: 0.3, hue: 215, rot: U.rand(-0.5, 0.5) });
        FX.ring(s.x, s.y, 6, s.R * 1.3, '#9fd0ff', 0.35, 3);
        FX.shake(0.12);
        A.play('zap', { vol: 0.8, rate: 0.7 });
        for (const e of game.enemies) {
          if (!e.alive || !e.hittable || !SS.enemies.hitTest(e, s.x, s.y, s.R)) continue;
          game.damageEnemy(e, e.boss || e.mini ? e.maxHp * 0.015 : e.maxHp * 0.6 + 20, { src: 'storm' });
        }
        if (p.alive && Math.hypot(p.x - s.x, p.y - s.y) < s.R * 0.8 + p.r) game.hitPlayer(p.x, p.y, 'Ионная буря');
      }
      if (c.strikes.length && c.strikes[0].t > c.strikes[0].warn + 0.4) c.strikes = c.strikes.filter((s) => s.t <= s.warn + 0.4);
    },

    // ── МЕТЕОРИТНЫЙ ДОЖДЬ: сначала линия пути, потом метеор по ней ──
    spawn_meteors(c) {
      const S = G.S, p = game.player;
      c.cd = U.rand(0.7, 1.15);
      const tx = Math.random() < 0.35 ? p.x : U.rand(0.05, 0.95) * G.FW, ty = U.rand(0.4, 0.95) * G.H;
      const y0 = -60 * S, k = (ty - y0) / MDIR.y;
      const big = Math.random() < 0.45;
      c.lanes.push({ x0: tx - MDIR.x * k, y0, t: 0, warn: 0.85, big, spd: U.rand(330, 420) * S * game.diff.bspd });
    },
    updateMeteors(dt) {
      const c = this.cur, S = G.S, p = game.player;
      for (const l of c.lanes) {
        l.t += dt;
        if (l.t >= l.warn && !l.gone) {
          l.gone = true;
          c.meteors.push({ x: l.x0, y: l.y0, vx: MDIR.x * l.spd, vy: MDIR.y * l.spd, big: l.big,
            spr: l.big ? 'fx_meteor1' : 'fx_meteor2', w: (l.big ? 56 : 34) * S, r: (l.big ? 13 : 8) * S, hit: [], dead: false });
        }
      }
      if (c.lanes.length && c.lanes[0].gone) c.lanes = c.lanes.filter((l) => !l.gone);
      for (const m of c.meteors) {
        m.x += m.vx * dt; m.y += m.vy * dt;
        if (FX.quality > 0 && Math.random() < dt * 30) FX.glowPuff(m.x - MDIR.x * m.r, m.y - MDIR.y * m.r, '#ff8a3d', m.r * 2.4, 0.25);
        for (const e of game.enemies) {
          if (!e.alive || !e.hittable || m.hit.includes(e.uid) || !SS.enemies.hitTest(e, m.x, m.y, m.r)) continue;
          m.hit.push(e.uid);
          game.damageEnemy(e, e.boss || e.mini ? e.maxHp * 0.01 : e.maxHp * (m.big ? 0.8 : 0.45) + 10, { src: 'meteor' });
          FX.hit(m.x, m.y, '#ffb03d');
        }
        if (p.alive && Math.hypot(p.x - m.x, p.y - m.y) < m.r + p.r) {
          if (game.hitPlayer(p.x, p.y, 'Метеорит')) { m.dead = true; FX.explode(m.x, m.y, m.big ? 1 : 0.7, '#ff8a3d'); }
        }
        if (m.y > G.H + 80 * S || m.x < -120 * S) m.dead = true;
      }
      if (c.meteors.length) c.meteors = c.meteors.filter((m) => !m.dead);
    },

    // ── СОЛНЕЧНАЯ ВСПЫШКА: солнце разгорается над полем и выжигает вражеские снаряды ──
    spawn_solar(c) {
      c.cd = 6.5;
      c.solar = { t: 0, charge: 1.5, fired: false };
      FX.vignette('#ffb03d', 1.8, 0.4);
      A.play('railCharge', { vol: 0.5, rate: 0.7 });
    },
    sunPos() { return { x: G.FW / 2, y: (SS.ui ? SS.ui.topInset() : 120) + 34 * G.S }; },
    updateSolar(dt) {
      const c = this.cur, s = c.solar, S = G.S;
      s.t += dt;
      if (!s.fired && s.t >= s.charge) {
        s.fired = true;
        const o = this.sunPos();
        FX.flash('#fff1c4', 0.35);
        FX.sprite('fx_solar', o.x, o.y, { w0: 110 * S, w1: 200 * S, dur: 0.6, hold: 0.25 });
        FX.ring(o.x, o.y, 30 * S, Math.max(G.FW, G.H) * 1.1, '#ffd88a', 0.7, 6);
        A.play('rail', { vol: 0.6, rate: 1.3 });
        game.clearBulletsAround(o.x, o.y, 99999);
        for (const e of game.enemies) {
          if (!e.alive || !e.hittable || e.y < 0) continue;
          game.damageEnemy(e, e.boss || e.mini ? e.maxHp * 0.01 : e.maxHp * 0.25 + 8, { src: 'solar', noText: true });
        }
      }
      if (s.t > s.charge + 0.6) c.solar = null;
    },

    // ── КОСМИЧЕСКИЙ МУСОР: медленные обломки, в каждом монеты ──
    spawn_debris(c) {
      c.cd = U.rand(0.55, 0.9);
      if (c.wave.done) return;
      let n = 0;
      for (const e of game.enemies) if (e.alive && e.type === 'debris') n++;
      if (n >= 10) return;
      SS.enemies.spawn('debris', { sprite: 'fx_rock' + U.randi(1, 6), noElite: true, scale: U.rand(0.8, 1.35) });
    },

    // ── КОНВОЙ (3.1): грузовики с ящиками, два-три за волну ──
    spawn_convoy(c) {
      c.cd = U.rand(6, 8);
      c.convoys = c.convoys || 0;
      if (c.wave.done || c.convoys >= (c.wave.n >= 20 ? 3 : 2) || !SS.foes.ready('e_cargo')) return;
      c.convoys++;
      SS.enemies.spawn('cargo', { noElite: true });
    },

    // ── МЕХАНИКИ СЕКТОРОВ ──
    // в кат-сценах новое не появляется, уже летящее продолжает движение
    updateMech(dt) {
      const m = this.mech;
      if (m.wave !== game.wave) { this.mech = null; return; }
      if (game.state !== 'play' || !game.player.alive) return;
      // 3.1: механики остальных секторов — в sectors.js
      if (SS.sectors.has(m.id)) { SS.sectors.update(m, dt); return; }
      m.cd -= dt;
      if (m.cd <= 0) this['mech_' + m.id](m);
    },

    // ПОЯС АСТЕРОИДОВ: медленные астероиды закрывают от вражеских пуль и мешают стрелять;
    // в части из них монеты или кристаллы. Чем дальше в сектор, тем их больше и они крупнее
    mech_asteroids(m) {
      const k = m.k;
      m.cd = [3, 2.5, 2, 1.6][k] * U.rand(0.8, 1.2);
      let n = 0;
      for (const e of game.enemies) if (e.alive && e.type === 'asteroid') n++;
      if (n >= [2, 3, 4, 5][k]) return;
      const scale = U.rand(0.85, 1.15) + k * 0.08;
      // добычу видно заранее: камни с самоцветами — монеты, с кристаллами — опыт (лист art/sheet11_asteroids.png)
      const r = Math.random(), loot = r < 0.4 ? 'coin' : r < 0.6 ? 'xp' : '';
      const size = scale < 1 ? 'm' : scale < 1.2 ? 'l' : 'xl';
      const SPR = {
        '': { m: ['ast_m1', 'ast_m2'], l: ['ast_l1', 'ast_l2'], xl: ['ast_xl'] },
        coin: { m: ['astr_m1', 'astr_m2'], l: ['astr_l'], xl: ['astr_xl1', 'astr_xl2'] },
        xp: { m: ['astc_m'], l: ['astc_l'], xl: ['astc_xl'] },
      };
      const e = SS.enemies.spawn('asteroid', { sprite: U.pick(SPR[loot][size]), noElite: true, scale, hpMul: scale * scale });
      if (!e) return;
      if (loot === 'coin') e.coins = 4; else if (loot === 'xp') e.xp = 2;
    },

    // УЛЕЙ (3.1): на стенах у краёв экрана зреют яйца, не разбитые — выпускают личинок
    mech_hive(m) {
      const k = m.k;
      m.cd = [5, 4.2, 3.6, 3][k] * U.rand(0.8, 1.2);
      let n = 0;
      for (const e of game.enemies) if (e.alive && e.type === 'hive_egg') n++;
      if (n >= [2, 3, 3, 4][k] || !SS.foes.ready('hive_egg1')) return;
      SS.foes.spawnEgg();
    },

    // КРАСНЫЙ ГИГАНТ (3.1): раскалённые астероиды, разбитые, брызжут огнём во все стороны
    mech_lava(m) {
      const k = m.k;
      m.cd = [2.8, 2.3, 1.9, 1.6][k] * U.rand(0.8, 1.2);
      let n = 0;
      for (const e of game.enemies) if (e.alive && e.type === 'lava_rock') n++;
      if (n >= [2, 3, 4, 5][k] || !SS.foes.ready('astl_1')) return;
      const scale = U.rand(0.8, 1.2) + k * 0.06;
      SS.enemies.spawn('lava_rock', { sprite: 'astl_' + U.randi(1, 5), noElite: true, scale, hpMul: scale * scale });
    },

    // механика сектора: под врагами и поверх них (облака туманности)
    drawBack(ctx) { if (this.mech && SS.sectors.has(this.mech.id)) SS.sectors.drawBack(ctx, this.mech); },
    drawMid(ctx) { if (this.mech && SS.sectors.has(this.mech.id)) SS.sectors.drawMid(ctx, this.mech); },

    // ── отрисовка (координаты поля) ──
    draw(ctx) {
      const c = this.cur;
      if (!c) return;
      const S = G.S;
      ctx.globalCompositeOperation = 'lighter';
      // линии метеоров
      if (c.lanes.length) {
        ctx.lineWidth = 2 * S;
        ctx.setLineDash([10 * S, 8 * S]);
        for (const l of c.lanes) {
          const k = l.t / l.warn;
          ctx.strokeStyle = 'rgba(255,138,61,' + (0.18 + 0.32 * k * (0.6 + 0.4 * Math.sin(l.t * 30))).toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(l.x0, l.y0); ctx.lineTo(l.x0 + MDIR.x * G.H * 2, l.y0 + MDIR.y * G.H * 2); ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      // метки ионной бури: кольцо сжимается к моменту удара
      for (const s of c.strikes) {
        if (s.done) continue;
        const k = s.t / s.warn;
        G.draw(ctx, 'fx_ion', s.x, s.y, s.R * 2 * (0.75 + 0.25 * k), s.t * 2, 0.3 + 0.5 * k);
        ctx.globalAlpha = 0.35 + 0.5 * k;
        ctx.strokeStyle = '#9fd0ff';
        ctx.lineWidth = 2 * S;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.R * (1.7 - 0.7 * k), 0, U.TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // метеоры
      for (const m of c.meteors) {
        const f = G.frame(m.spr), img = f && G.src(f);
        if (!img) continue;
        const h = m.w * f[3] / f[2], a = MHEAD[m.spr];
        ctx.drawImage(img, f[0], f[1], f[2], f[3], m.x - m.w * a[0], m.y - h * a[1], m.w, h);
      }
      // солнце разгорается перед вспышкой
      const s = c.solar;
      if (s && !s.fired) {
        const o = this.sunPos(), k = s.t / s.charge;
        G.draw(ctx, 'fx_solar', o.x, o.y, (60 + 70 * k) * S, s.t * 0.8, 0.4 + 0.6 * k);
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  };
  SS.events = ev;
})();
