// ════════════════════════════════════════════════════════════════
// SPACE SHOOTER 3.0 — живая демонстрация оружия в арсенале
//  Маленькая сцена на своём холсте: корабль внизу стреляет выбранным оружием по трём мишеням.
//  Логика упрощённая (не игровой движок), задача — показать «форму» оружия: залп и перезарядку ракет,
//  дробь в упор, волны серпа, рост плазмы, цепь молнии, сферу тёмной материи.
//  Цикл сам останавливается, когда холст исчезает со страницы или скрыт.
// ════════════════════════════════════════════════════════════════
'use strict';

(function () {
  const U = SS.util;
  const TARGETS = ['scout', 'drone', 'shooter'];

  const demo = {
    raf: 0,

    stop() { cancelAnimationFrame(this.raf); this.raf = 0; },

    start(cv, wid) {
      this.stop();
      if (!cv || !SS.data.WEAPONS[wid]) return;
      const G = SS.gfx, D = SS.data, s = SS.store.s, def = D.WEAPONS[wid];
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = cv.clientWidth || 300, H = cv.clientHeight || 160;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      const ctx = cv.getContext('2d');
      const k = U.clamp(W / 340, 0.8, 1.3);
      const ship = { x: W / 2, y: H - 30 * k, w: 40 * k };
      const stars = Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: Math.random() * H, v: U.rand(8, 30), a: U.rand(0.2, 0.7) }));
      const tg = TARGETS.map((spr, i) => ({ spr, x: W * (0.25 + i * 0.25), y: 34 * k + (i % 2) * 14 * k, w: 30 * k, hp: 100, flash: 0, dead: 0, ph: i * 2 }));
      const shots = [], fx = [];
      let t = 0, last = performance.now(), cd = 0.3, mag = def.base.mag || 0, reload = 0, sphere = null, charge = 0;

      const alive = () => tg.filter((e) => !e.dead);
      const nearest = (x, y) => { let b = null, bd = 1e9; for (const e of alive()) { const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; b = e; } } return b; };
      const hit = (e, dmg) => {
        if (!e || e.dead) return;
        e.hp -= dmg; e.flash = 0.08;
        if (e.hp <= 0) { e.dead = 0.7; fx.push({ kind: 'boom', x: e.x, y: e.y, t: 0, r: e.w * 1.4 }); }
      };
      const nose = () => ({ x: ship.x, y: ship.y - ship.w * 0.45 });

      // один выстрел выбранного оружия
      const fire = () => {
        const n = nose();
        if (wid === 'laser') shots.push({ k: 'bolt', x: n.x, y: n.y, vx: 0, vy: -520 * k, w: 12 * k, spr: 'pb_bolt_m' });
        else if (wid === 'shotgun') for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * 0.8; shots.push({ k: 'pellet', x: n.x, y: n.y, vx: Math.sin(a) * 430 * k, vy: -Math.cos(a) * 430 * k, w: 10 * k, life: 0.42 }); }
        else if (wid === 'rocket') { const side = mag % 2 ? 1 : -1; shots.push({ k: 'rocket', x: n.x + side * 10 * k, y: n.y + 8 * k, vx: side * 120 * k, vy: -80 * k, w: 10 * k, tgt: null }); }
        else if (wid === 'arc') shots.push({ k: 'wave', x: n.x, y: n.y, vy: -300 * k, age: 0, life: 0.6, hit: [], ch: charge });
        else if (wid === 'plasma') shots.push({ k: 'plasma', x: n.x, y: n.y, vx: 0, vy: -230 * k, age: 0 });
        else if (wid === 'lightning') {
          const pts = [[n.x, n.y]], done = [];
          let cx = n.x, cy = n.y;
          for (let j = 0; j < 3; j++) {
            let b = null, bd = 1e9;
            for (const e of alive()) { if (done.includes(e)) continue; const d = Math.hypot(e.x - cx, e.y - cy); if (d < bd) { bd = d; b = e; } }
            if (!b) break;
            done.push(b); pts.push([b.x, b.y]); hit(b, 22 * Math.pow(0.8, j)); cx = b.x; cy = b.y;
          }
          fx.push({ kind: 'bolt', pts, t: 0 });
        } else if (wid === 'darkmatter') { sphere = { x: n.x, y: n.y, vy: -200 * k, age: 0, tick: 0 }; }
      };

      const step = (now) => {
        if (!cv.isConnected || !cv.offsetParent) { this.stop(); return; }
        this.raf = requestAnimationFrame(step);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now; t += dt;
        // корабль покачивается — у серпа так копится заряд
        const px = ship.x;
        ship.x = W / 2 + Math.sin(t * (wid === 'arc' ? 1.6 : 0.7)) * W * (wid === 'arc' ? 0.22 : 0.1);
        charge = U.clamp(charge + Math.abs(ship.x - px) / (W * 0.8) - dt * 0.3, 0, 1);
        // мишени
        for (const e of tg) {
          e.ph += dt;
          if (e.dead) { e.dead -= dt; if (e.dead <= 0) { e.dead = 0; e.hp = 100; e.x = U.rand(0.15, 0.85) * W; } continue; }
          e.x += Math.sin(e.ph * 0.9) * 22 * k * dt;
          e.flash = Math.max(0, e.flash - dt);
        }
        // темп и магазин
        if (wid === 'darkmatter') { if (!sphere) { cd -= dt; if (cd <= 0) { fire(); cd = 0.3; } } }
        else if (mag) {
          if (reload > 0) { reload -= dt; if (reload <= 0) mag = def.base.mag + (wid === 'rocket' ? 1 : 0); }
          else { cd -= dt; if (cd <= 0) { fire(); mag--; cd = def.base.cd; if (mag <= 0) reload = wid === 'rocket' ? 2.5 : def.base.reload; } }
        } else { cd -= dt; if (cd <= 0) { fire(); cd = def.base.cd; } }
        // снаряды
        for (const b of shots) {
          b.age = (b.age || 0) + dt;
          if (b.k === 'rocket') {
            if (!b.tgt || b.tgt.dead) b.tgt = nearest(b.x, b.y);
            if (b.tgt) { const a = Math.atan2(b.tgt.y - b.y, b.tgt.x - b.x), sp = Math.min(380 * k, Math.hypot(b.vx, b.vy) + 600 * k * dt); const ca = Math.atan2(b.vy, b.vx); const na = ca + U.clamp(U.angleDiff(ca, a), -6 * dt, 6 * dt); b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp; }
          }
          if (b.k === 'wave') { b.y += b.vy * dt; } else if (b.k !== 'plasma') { b.x += b.vx * dt; b.y += b.vy * dt; } else { b.y += b.vy * dt; }
          if (b.life && b.age > b.life) b.dead = true;
          if (b.y < -20 || b.x < -20 || b.x > W + 20) b.dead = true;
          if (b.dead) continue;
          if (b.k === 'wave') {
            const half = (40 + 60 * Math.min(1, b.age / b.life)) * k * (0.85 + 0.3 * b.ch);
            for (const e of alive()) if (!b.hit.includes(e) && Math.abs(e.y - b.y) < 10 * k && Math.abs(e.x - b.x) < half) { b.hit.push(e); hit(e, 26 * (0.75 + 0.75 * b.ch)); }
            continue;
          }
          for (const e of alive()) {
            if (Math.hypot(e.x - b.x, e.y - b.y) > e.w * 0.55) continue;
            if (b.k === 'plasma') { const g = Math.min(1, b.age / 0.6); for (const o of alive()) if (Math.hypot(o.x - b.x, o.y - b.y) < (30 + 30 * g) * k) hit(o, 30 + 50 * g); fx.push({ kind: 'ring', x: b.x, y: b.y, t: 0, r: (30 + 30 * g) * k, col: '#ff8af5' }); }
            else if (b.k === 'rocket') { hit(e, 26); for (const o of alive()) if (o !== e && Math.hypot(o.x - b.x, o.y - b.y) < 34 * k) hit(o, 14); fx.push({ kind: 'ring', x: b.x, y: b.y, t: 0, r: 34 * k, col: '#ffb03d' }); }
            else hit(e, b.k === 'pellet' ? (b.age < 0.12 ? 9 : 6) : 9);
            b.dead = true; break;
          }
        }
        for (let i = shots.length - 1; i >= 0; i--) if (shots[i].dead) shots.splice(i, 1);
        // тёмная материя: тормозит, притягивает, схлопывается
        if (sphere) {
          sphere.age += dt; sphere.vy *= Math.exp(-1.6 * dt); sphere.y += sphere.vy * dt;
          sphere.tick -= dt;
          for (const e of alive()) { const d = Math.hypot(e.x - sphere.x, e.y - sphere.y); if (d < 70 * k) { e.x += (sphere.x - e.x) * dt * 1.5; if (sphere.tick <= 0) hit(e, 6); } }
          if (sphere.tick <= 0) sphere.tick = 0.15;
          if (sphere.age > 1.3) { for (const e of alive()) if (Math.hypot(e.x - sphere.x, e.y - sphere.y) < 60 * k) hit(e, 45); fx.push({ kind: 'ring', x: sphere.x, y: sphere.y, t: 0, r: 60 * k, col: '#d9b8ff' }); sphere = null; }
        }
        for (const f of fx) f.t += dt;
        for (let i = fx.length - 1; i >= 0; i--) if (fx[i].t > 0.5) fx.splice(i, 1);

        // ── отрисовка ──
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#060a1f'); bg.addColorStop(1, '#0b1238');
        ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#cfe3ff';
        for (const st of stars) { st.y += st.v * dt; if (st.y > H) { st.y = 0; st.x = Math.random() * W; } ctx.globalAlpha = st.a; ctx.fillRect(st.x, st.y, 1.2, 1.2); }
        ctx.globalAlpha = 1;
        for (const e of tg) {
          if (e.dead) continue;
          ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(Math.PI);
          const f = G.frame(e.spr), img = f && G.src(f);
          if (img) { const h = e.w * f[3] / f[2]; ctx.drawImage(img, f[0], f[1], f[2], f[3], -e.w / 2, -h / 2, e.w, h); if (e.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7; const wh = G.white(e.spr); if (wh) ctx.drawImage(wh, -e.w / 2, -h / 2, e.w, h); } }
          ctx.restore();
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        }
        ctx.globalCompositeOperation = 'lighter';
        for (const b of shots) {
          if (b.k === 'bolt') G.draw(ctx, b.spr, b.x, b.y, b.w);
          else if (b.k === 'pellet') { const c = G.tinted('pb_orb', { hue: 44 }); if (c) G.drawCanvas(ctx, c, b.x, b.y, b.w); }
          else if (b.k === 'rocket') G.draw(ctx, G.frame('fx_rocket2') ? 'fx_rocket2' : 'fx_rocket', b.x, b.y, b.w, Math.atan2(b.vy, b.vx) + Math.PI / 2);
          else if (b.k === 'plasma') { const g = Math.min(1, b.age / 0.6), c = G.tinted(G.frame('fx_plasma2') ? 'fx_plasma2' : 'eb_fire', { hue: 305 }); if (c) G.drawCanvas(ctx, c, b.x, b.y, (18 + 22 * g) * k, b.age * 4); }
          else if (b.k === 'wave') {
            const half = (40 + 60 * Math.min(1, b.age / b.life)) * k * (0.85 + 0.3 * b.ch), R = half * 1.6, span = Math.asin(Math.min(1, half / R));
            const fade = Math.min(1, (b.life - b.age) / 0.15);
            for (const [col, a, lw] of [['#3dc8ff', 0.15, 7], ['#7ff6ff', 0.5, 3], ['#e8ffff', 0.9, 1.2]]) { ctx.globalAlpha = a * fade; ctx.strokeStyle = col; ctx.lineWidth = lw * k; ctx.beginPath(); ctx.arc(b.x, b.y + R, R, -Math.PI / 2 - span, -Math.PI / 2 + span); ctx.stroke(); }
            ctx.globalAlpha = 1;
          }
        }
        if (sphere) { G.draw(ctx, G.frame('fx_vortex') ? 'fx_vortex' : 'pb_orb', sphere.x, sphere.y, 54 * k, sphere.age * 5, 0.9); }
        for (const f of fx) {
          const q = f.t / 0.5;
          if (f.kind === 'boom') G.draw(ctx, 'fx_ex_l', f.x, f.y, f.r * (0.6 + q), 0, 1 - q);
          else if (f.kind === 'ring') { ctx.globalAlpha = 1 - q; ctx.strokeStyle = f.col; ctx.lineWidth = 2 * k; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.4 + 0.6 * q), 0, U.TAU); ctx.stroke(); ctx.globalAlpha = 1; }
          else if (f.kind === 'bolt' && f.t < 0.14) {
            ctx.globalAlpha = 1 - f.t / 0.14; ctx.strokeStyle = '#fff36b'; ctx.lineWidth = 2 * k;
            ctx.beginPath();
            f.pts.forEach((p, i) => { if (!i) { ctx.moveTo(p[0], p[1]); return; } const a = f.pts[i - 1]; for (let j = 1; j <= 4; j++) { const q2 = j / 4; ctx.lineTo(U.lerp(a[0], p[0], q2) + (j < 4 ? U.rand(-6, 6) * k : 0), U.lerp(a[1], p[1], q2) + (j < 4 ? U.rand(-6, 6) * k : 0)); } });
            ctx.stroke(); ctx.globalAlpha = 1;
          }
        }
        ctx.globalCompositeOperation = 'source-over';
        SS.game.drawShip(ctx, s.ship.model, s.ship.skin, s.ship.trail, ship.x, ship.y, ship.w, (ship.x - px) / Math.max(dt, 0.001) * 0.002, t, 1);
        // шкала ресурса: перезарядка / заряд серпа
        let bar = null;
        if (mag !== undefined && def.base.mag) bar = reload > 0 ? { k: 1 - reload / (wid === 'rocket' ? 2.5 : def.base.reload), dim: true } : { k: mag / (def.base.mag + (wid === 'rocket' ? 1 : 0)) };
        if (wid === 'arc') bar = { k: charge };
        if (bar) {
          const bw = 4 * k, bh = ship.w * 0.7, bx = ship.x - ship.w * 0.75, by = ship.y - bh / 2;
          ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
          ctx.globalAlpha = bar.dim ? 0.5 : 1; ctx.fillStyle = def.color; ctx.fillRect(bx, by + bh * (1 - bar.k), bw, bh * bar.k); ctx.globalAlpha = 1;
        }
      };
      this.raf = requestAnimationFrame(step);
    },
  };
  SS.demo = demo;
})();
