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

    // opt.evo (4.3.2) — показать эволюцию оружия (D.EVOLUTIONS): окно-подсказка при первой эволюции
    start(cv, wid, opt) {
      this.stop();
      if (!cv || !SS.data.WEAPONS[wid]) return;
      const evo = !!(opt && opt.evo);
      const G = SS.gfx, D = SS.data, s = SS.store.s, def = D.WEAPONS[wid];
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = cv.clientWidth || 300, H = cv.clientHeight || 160;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      const ctx = cv.getContext('2d');
      const k = U.clamp(W / 340, 0.8, 1.3);
      const ship = { x: W / 2, y: H - 30 * k, w: 40 * k };
      const stars = Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: Math.random() * H, v: U.rand(8, 30), a: U.rand(0.2, 0.7) }));
      const tg = TARGETS.map((spr, i) => ({ spr, x: W * (0.25 + i * 0.25), y: 34 * k + (i % 2) * 14 * k, w: 30 * k, hp: 100, flash: 0, dead: 0, ph: i * 2, frozen: 0, burn: 0, burnT: 0, cd: 0.6 + i * 0.4 }));
      const shots = [], fx = [], eb = [], trail = [];
      const baseY = ship.y;
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
        if (wid === 'laser') shots.push({ k: 'bolt', x: n.x, y: n.y, vx: 0, vy: -520 * k, w: (evo ? 9 : 12) * k, spr: evo && G.frame('pb_laser') ? 'pb_laser' : 'pb_bolt_m', pierce: evo, hit: [] });
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
            done.push(b); pts.push([b.x, b.y]); hit(b, 22 * Math.pow(0.8, j)); if (evo) b.frozen = 2; cx = b.x; cy = b.y;
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
        if (evo && wid === 'shotgun') ship.y = baseY - Math.max(0, Math.sin(t * 1.3)) * (baseY - 70 * k);
        charge = U.clamp(charge + Math.abs(ship.x - px) / (W * 0.8) - dt * 0.3, 0, 1);
        // мишени
        for (const e of tg) {
          e.ph += dt;
          if (e.dead) { e.dead -= dt; if (e.dead <= 0) { e.dead = 0; e.hp = 100; e.x = U.rand(0.15, 0.85) * W; } continue; }
          e.x += Math.sin(e.ph * 0.9) * 22 * k * dt * (e.frozen > 0 ? 0.15 : 1);
          e.flash = Math.max(0, e.flash - dt);
          e.frozen = Math.max(0, e.frozen - dt);
          if (e.burn > 0) { e.burn -= dt; e.burnT += dt; if (e.burnT >= 0.25) { e.burnT = 0; hit(e, 4); } }
          if (evo && wid === 'darkmatter') { e.cd -= dt; if (e.cd <= 0) { e.cd = U.rand(0.5, 0.9); const a = Math.atan2(ship.y - e.y, ship.x - e.x); eb.push({ x: e.x, y: e.y, vx: Math.cos(a) * 110 * k, vy: Math.sin(a) * 110 * k }); } }
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
          if (evo && b.k === 'plasma') { b.tr = (b.tr || 0) - dt; if (b.tr <= 0) { b.tr = 0.05; trail.push({ x: b.x, y: b.y, t: 0 }); } }
          for (const e of alive()) {
            if (Math.hypot(e.x - b.x, e.y - b.y) > e.w * 0.55) continue;
            if (b.pierce) { if (b.hit.includes(e)) continue; b.hit.push(e); hit(e, 12); continue; }
            if (evo && b.k === 'pellet' && b.age < 0.14 && e.hp < 20) { hit(e, 999); fx.push({ kind: 'ring', x: e.x, y: e.y, t: 0, r: 34 * k, col: '#ffd23d' }); b.dead = true; break; }
            if (b.k === 'plasma') { const g = Math.min(1, b.age / 0.6); for (const o of alive()) if (Math.hypot(o.x - b.x, o.y - b.y) < (30 + 30 * g) * k) hit(o, 30 + 50 * g); fx.push({ kind: 'ring', x: b.x, y: b.y, t: 0, r: (30 + 30 * g) * k, col: '#ff8af5' }); }
            else if (b.k === 'rocket') {
              hit(e, 26); for (const o of alive()) if (o !== e && Math.hypot(o.x - b.x, o.y - b.y) < 34 * k) hit(o, 14); fx.push({ kind: 'ring', x: b.x, y: b.y, t: 0, r: 34 * k, col: '#ffb03d' });
              // кассетные боеголовки: 4 малых заряда вокруг взрыва
              if (evo) for (let q = 0; q < 4; q++) { const a = q / 4 * U.TAU + 0.6, cx = b.x + Math.cos(a) * 30 * k, cy = b.y + Math.sin(a) * 30 * k; fx.push({ kind: 'ring', x: cx, y: cy, t: 0, r: 16 * k, col: '#ffd23d' }); for (const o of alive()) if (Math.hypot(o.x - cx, o.y - cy) < 18 * k) hit(o, 10); }
            }
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
          if (evo) for (const b of eb) if (!b.dead && Math.hypot(b.x - sphere.x, b.y - sphere.y) < 64 * k) { b.dead = true; fx.push({ kind: 'ring', x: b.x, y: b.y, t: 0, r: 8 * k, col: '#d9b8ff' }); }
          if (sphere.age > 1.3) { const R = (evo ? 95 : 60) * k; for (const e of alive()) if (Math.hypot(e.x - sphere.x, e.y - sphere.y) < R) hit(e, evo ? 90 : 45); fx.push({ kind: 'ring', x: sphere.x, y: sphere.y, t: 0, r: R, col: '#d9b8ff' }); sphere = null; }
        }
        // вражеские пули (для сферы-эволюции) и горящий след плазмы
        for (const b of eb) { b.x += b.vx * dt; b.y += b.vy * dt; if (b.y > H + 10 || Math.hypot(b.x - ship.x, b.y - ship.y) < ship.w * 0.35) b.dead = true; }
        for (let i = eb.length - 1; i >= 0; i--) if (eb[i].dead) eb.splice(i, 1);
        for (const p of trail) { p.t += dt; for (const e of alive()) if (Math.hypot(e.x - p.x, e.y - p.y) < 16 * k) e.burn = 3; }
        while (trail.length && trail[0].t > 1.5) trail.shift();
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
          if (e.frozen > 0 || e.burn > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55; ctx.drawImage(G.soft(e.frozen > 0 ? '#9be8ff' : '#ff7a2a', 64), e.x - e.w * 0.7, e.y - e.w * 0.7, e.w * 1.4, e.w * 1.4); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
        }
        ctx.globalCompositeOperation = 'lighter';
        for (const p of trail) { ctx.globalAlpha = Math.max(0, 0.7 * (1 - p.t / 1.5)); ctx.drawImage(G.soft('#ff8a3d', 64), p.x - 10 * k, p.y - 10 * k, 20 * k, 20 * k); }
        ctx.globalAlpha = 1;
        for (const b of eb) G.draw(ctx, 'eb_orb', b.x, b.y, 9 * k);
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

    // ── 4.3.2: демонстрация активного навыка (карточка навыка). Мишени стреляют в корабль, навык
    //    срабатывает по кругу: обычный бой → запуск → действие. Длительности короче, чем в бою ──
    skill(cv, id) {
      this.stop();
      const D = SS.data, sk = D.SKILLS[id];
      if (!cv || !sk || sk.type !== 'active') return;
      const G = SS.gfx, s = SS.store.s, game = SS.game;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = cv.clientWidth || 300, H = cv.clientHeight || 170;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      const ctx = cv.getContext('2d');
      const k = U.clamp(W / 340, 0.8, 1.3);
      const ship = { x: W / 2, y: H - 28 * k, w: 38 * k, hitT: 0 };
      const stars = Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: Math.random() * H, v: U.rand(8, 30), a: U.rand(0.2, 0.7) }));
      const DUR = { sk_rail: 1.6, sk_orbital: 2.2, sk_barrier: 3, sk_timewarp: 3, sk_turret: 3.5, sk_blackhole: 2.8, sk_emp: 3, sk_clone: 3.5 }[id] || 3;
      const IDLE = 1.3;
      // раскладка мишеней: у Рельсы — колонна над кораблём, чтобы луч прошил всех
      const LAY = id === 'sk_rail' ? [[0.5, 26], [0.5, 58], [0.5, 90], [0.17, 40], [0.83, 50]] : [[0.16, 34], [0.38, 60], [0.6, 30], [0.83, 58], [0.5, 90]];
      const SPR = ['scout', 'drone', 'shooter', 'interceptor', 'heavy'];
      const tg = LAY.map(([fx, fy], i) => ({ spr: SPR[i], ox: fx * W, oy: fy * k, hx: fx * W, hy: fy * k, x: fx * W, y: fy * k, w: 28 * k, hp: 120, flash: 0, dead: 0, ph: i * 1.7, cd: 0.5 + i * 0.3, emp: 0, sh: id === 'sk_emp' && i === 2 ? 1 : 0 }));
      const shots = [], eb = [], fx = [];
      let t = 0, last = performance.now(), cyc = 0, on = false, ft = 0, fireCd = 0.2, tick = 0;
      let marks = [], hole = null, turret = null, clone = null;

      const alive = () => tg.filter((e) => !e.dead);
      const hit = (e, dmg) => {
        if (!e || e.dead) return;
        if (e.sh) { fx.push({ kind: 'ring', x: e.x, y: e.y, t: 0, r: e.w * 0.9, col: '#7fd8ff' }); return; }
        e.hp -= dmg; e.flash = 0.08;
        if (e.hp <= 0) { e.dead = 0.8; fx.push({ kind: 'boom', x: e.x, y: e.y, t: 0, r: e.w * 1.4 }); }
      };
      const nearest = (x, y, above) => { let b = null, bd = 1e9; for (const e of alive()) { if (above && e.y > y) continue; const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; b = e; } } return b; };
      const slow = () => (on && id === 'sk_timewarp' ? 0.33 : 1);

      const cast = () => {
        on = true; ft = 0;
        if (id === 'sk_orbital') marks = alive().slice(0, 4).map((e, i) => ({ e, x: e.x, y: e.y, at: 0.85 + i * 0.15, fired: false, ft: 0 }));
        else if (id === 'sk_barrier') fx.push({ kind: 'ring', x: ship.x, y: ship.y, t: 0, r: ship.w * 1.6, col: '#ffd23d' });
        else if (id === 'sk_turret') turret = { x: ship.x - ship.w, y: ship.y - ship.w * 0.9, cd: 0.3, ang: -Math.PI / 2, flash: 0 };
        else if (id === 'sk_blackhole') hole = { x: W / 2, y: 54 * k, t: 0 };
        else if (id === 'sk_emp') {
          fx.push({ kind: 'emp', x: ship.x, y: ship.y, t: 0 });
          for (const e of alive()) { e.emp = 2.4; if (e.sh) { e.sh = 0; fx.push({ kind: 'ring', x: e.x, y: e.y, t: 0, r: e.w * 1.3, col: '#7fd8ff' }); } fx.push({ kind: 'bolt', pts: [[ship.x, ship.y - ship.w * 0.4], [e.x, e.y]], t: 0 }); }
          eb.length = 0;
        } else if (id === 'sk_clone') clone = { x: ship.x + ship.w * 1.05, y: ship.y, t: 0 };
      };
      const end = () => {
        on = false; cyc = 0;
        turret = null; clone = null; marks = [];
        if (hole) {
          for (const e of alive()) if (Math.hypot(e.x - hole.x, e.y - hole.y) < 70 * k) hit(e, 300);
          fx.push({ kind: 'ring', x: hole.x, y: hole.y, t: 0, r: 80 * k, col: '#d9b8ff' }, { kind: 'boom', x: hole.x, y: hole.y, t: 0, r: 60 * k });
          hole = null;
        }
        for (const e of tg) { e.hx = e.ox; e.hy = e.oy; if (id === 'sk_emp' && e.spr === 'shooter') e.sh = 1; }
      };
      const fire = (x, holo) => shots.push({ x, y: ship.y - ship.w * 0.45, vx: 0, vy: -520 * k, w: (holo ? 10 : 12) * k, spr: 'pb_bolt_m', dmg: holo ? 6 : 9, holo });

      const step = (now) => {
        if (!cv.isConnected || !cv.offsetParent) { this.stop(); return; }
        this.raf = requestAnimationFrame(step);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now; t += dt;
        cyc += dt;
        if (!on && cyc >= IDLE) cast();
        if (on) { ft += dt; if (ft >= DUR) end(); }
        const sl = slow(), railOn = on && id === 'sk_rail' && ft > 0.4;
        const px = ship.x;
        ship.x = W / 2 + Math.sin(t * 0.8) * W * (id === 'sk_rail' ? 0.03 : 0.12);
        ship.hitT = Math.max(0, ship.hitT - dt);
        // мишени: качаются и стреляют; ЭМИ глушит, Замедление тормозит, Чёрная дыра тянет к себе
        for (const e of tg) {
          if (e.dead) { e.dead -= dt; if (e.dead <= 0) { e.dead = 0; e.hp = 120; e.hx = e.ox; e.hy = e.oy; } continue; }
          e.flash = Math.max(0, e.flash - dt);
          if (hole) { e.hx += (hole.x - e.hx) * dt * 1.3; e.hy += (hole.y - e.hy) * dt * 1.3; }
          if (e.emp > 0) { e.emp -= dt; continue; }
          e.ph += dt * sl;
          e.x = e.hx + Math.sin(e.ph * 0.9) * 14 * k; e.y = e.hy;
          e.cd -= dt * sl;
          if (e.cd <= 0) {
            e.cd = U.rand(0.9, 1.4);
            const a = Math.atan2(ship.y - e.y, ship.x - e.x), sp = 120 * k;
            eb.push({ x: e.x, y: e.y + e.w * 0.3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp });
          }
        }
        // вражеские пули: Барьер отражает их в ближайшего врага, дыра затягивает
        for (const b of eb) {
          if (hole) { const dx = hole.x - b.x, dy = hole.y - b.y, d = Math.hypot(dx, dy) || 1; if (d < 130 * k) { b.vx += dx / d * 320 * k * dt; b.vy += dy / d * 320 * k * dt; } if (d < 12 * k) { b.dead = true; continue; } }
          b.x += b.vx * dt * sl; b.y += b.vy * dt * sl;
          const d = Math.hypot(b.x - ship.x, b.y - ship.y);
          if (on && id === 'sk_barrier' && d < ship.w * 0.85) {
            b.dead = true;
            const e = nearest(b.x, b.y), a = e ? Math.atan2(e.y - b.y, e.x - b.x) : -Math.PI / 2;
            shots.push({ x: b.x, y: b.y, vx: Math.cos(a) * 520 * k, vy: Math.sin(a) * 520 * k, w: 10 * k, spr: 'pb_bolt_s', dmg: 30, refl: true });
            fx.push({ kind: 'ring', x: b.x, y: b.y, t: 0, r: 10 * k, col: '#ffd23d' });
            continue;
          }
          if (railOn && Math.abs(b.x - ship.x) < 14 * k && b.y < ship.y) { b.dead = true; continue; }
          if (d < ship.w * 0.35) { b.dead = true; ship.hitT = 0.15; fx.push({ kind: 'ring', x: b.x, y: b.y, t: 0, r: 12 * k, col: '#ff5c7a' }); continue; }
          if (b.y > H + 10 || b.y < -10 || b.x < -10 || b.x > W + 10) b.dead = true;
        }
        for (let i = eb.length - 1; i >= 0; i--) if (eb[i].dead) eb.splice(i, 1);
        // обычный огонь корабля (и копия от Двойника)
        fireCd -= dt;
        if (fireCd <= 0) { fireCd = 0.2; fire(ship.x); if (clone) fire(clone.x, true); }
        // турель: висит над кораблём и бьёт ближайших
        if (turret) {
          turret.x = U.damp(turret.x, ship.x - ship.w * 1.05, 6, dt);
          turret.y = U.damp(turret.y, ship.y - ship.w * 0.85 + Math.sin(t * 3) * 3 * k, 6, dt);
          turret.cd -= dt; turret.flash -= dt;
          const e = nearest(turret.x, turret.y, true);
          if (e) turret.ang = U.damp(turret.ang, Math.atan2(e.y - turret.y, e.x - turret.x), 12, dt);
          if (e && turret.cd <= 0) { turret.cd = 0.15; turret.flash = 0.06; shots.push({ x: turret.x + Math.cos(turret.ang) * 12 * k, y: turret.y + Math.sin(turret.ang) * 12 * k, vx: Math.cos(turret.ang) * 700 * k, vy: Math.sin(turret.ang) * 700 * k, w: 9 * k, spr: 'pb_bolt_s', dmg: 9 }); }
        }
        if (clone) { clone.t += dt; clone.x = U.damp(clone.x, ship.x + ship.w * 1.05, 10, dt); clone.y = ship.y + ship.w * 0.15; }
        for (const b of shots) {
          b.x += b.vx * dt; b.y += b.vy * dt;
          if (b.y < -20 || b.y > H + 20 || b.x < -20 || b.x > W + 20) { b.dead = true; continue; }
          for (const e of alive()) { if (Math.hypot(e.x - b.x, e.y - b.y) > e.w * 0.55) continue; hit(e, b.dmg); b.dead = true; break; }
        }
        for (let i = shots.length - 1; i >= 0; i--) if (shots[i].dead) shots.splice(i, 1);
        // рельса (после заряда 0,4 с) и чёрная дыра бьют тиками
        tick -= dt;
        if (tick <= 0) {
          tick = 0.08;
          if (railOn) for (const e of alive()) if (Math.abs(e.x - ship.x) < 18 * k) hit(e, 16);
          if (hole) for (const e of alive()) if (Math.hypot(e.x - hole.x, e.y - hole.y) < 40 * k) hit(e, 4);
        }
        if (hole) hole.t += dt;
        // орбитальный удар: прицелы держат цели, потом луч с орбиты
        for (const m of marks) {
          if (m.e && !m.e.dead) { m.x = m.e.x; m.y = m.e.y; }
          if (!m.fired && ft >= m.at) { m.fired = true; fx.push({ kind: 'boom', x: m.x, y: m.y, t: 0, r: 50 * k }); for (const e of alive()) if (Math.hypot(e.x - m.x, e.y - m.y) < 34 * k) hit(e, 300); }
          if (m.fired) m.ft += dt;
        }
        for (const f of fx) f.t += dt;
        for (let i = fx.length - 1; i >= 0; i--) if (fx[i].t > (fx[i].kind === 'emp' ? 0.7 : 0.5)) fx.splice(i, 1);

        // ── отрисовка ──
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#060a1f'); bg.addColorStop(1, '#0b1238');
        ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#cfe3ff';
        for (const st of stars) { st.y += st.v * dt * sl; if (st.y > H) { st.y = 0; st.x = Math.random() * W; } ctx.globalAlpha = st.a; ctx.fillRect(st.x, st.y, 1.2, 1.2); }
        ctx.globalAlpha = 1;
        // Замедление: синяя дымка и циферблат при запуске
        if (on && id === 'sk_timewarp') {
          ctx.fillStyle = 'rgba(61,107,255,0.14)'; ctx.fillRect(0, 0, W, H);
          if (ft < 1.1) {
            const f = ft / 1.1, R = (30 + 120 * f) * k;
            ctx.globalAlpha = 0.8 * (1 - f); ctx.strokeStyle = '#9fc8ff'; ctx.lineWidth = 2 * k;
            ctx.beginPath(); ctx.arc(ship.x, ship.y, R, 0, U.TAU); ctx.stroke();
            for (const [len, spd] of [[0.55, -9], [0.8, -26]]) { const a = -Math.PI / 2 + t * spd; ctx.beginPath(); ctx.moveTo(ship.x, ship.y); ctx.lineTo(ship.x + Math.cos(a) * R * len, ship.y + Math.sin(a) * R * len); ctx.stroke(); }
            ctx.globalAlpha = 1;
          }
        }
        ctx.globalCompositeOperation = 'lighter';
        // прицелы и лучи орбитального удара
        for (const m of marks) {
          if (!m.fired) {
            const q = U.clamp(ft / m.at, 0, 1), r = (34 - 20 * q) * k;
            ctx.globalAlpha = 0.4 + 0.6 * q; ctx.strokeStyle = '#ff5c4d'; ctx.lineWidth = 2 * k;
            for (let j = 0; j < 4; j++) { const a = (1 - q) * 2 + j * Math.PI / 2; ctx.beginPath(); ctx.arc(m.x, m.y, r, a - 0.35, a + 0.35); ctx.stroke(); }
            if (q > 0.6) game.drawBeamV(ctx, m.x, 0, m.y, 1.5 * k, '#ff5c4d', (q - 0.6) * 1.2, 1);
          } else if (m.ft < 0.4) game.drawBeamV(ctx, m.x, 0, m.y, 12 * k * (1 - m.ft / 0.4 * 0.5), '#ff6a3d', 1 - m.ft / 0.4, 1, m.y);
        }
        if (on && id === 'sk_orbital' && ft < 1.6) {
          const sx = U.lerp(-20 * k, W + 20 * k, ft / 1.6), sy = 10 * k;
          ctx.globalAlpha = 0.5; ctx.drawImage(G.glow('#ff5c4d', 32), sx - 14 * k, sy - 14 * k, 28 * k, 28 * k);
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; G.draw(ctx, 'sp_radar', sx, sy, 20 * k, Math.PI); ctx.globalCompositeOperation = 'lighter';
        }
        // чёрная дыра
        if (hole) {
          const q = Math.min(1, hole.t * 3), R = 90 * k, sz = R * 0.55 * q;
          ctx.globalAlpha = 0.35 * q; ctx.drawImage(G.soft('#7a3dff', 64), hole.x - R, hole.y - R, R * 2, R * 2);
          ctx.globalAlpha = q; G.draw(ctx, G.frame('fx_vortex') ? 'fx_vortex' : 'pb_orb', hole.x, hole.y, sz * 2.6, hole.t * 4);
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(hole.x, hole.y, sz * 0.35, 0, U.TAU); ctx.fill();
          ctx.globalCompositeOperation = 'lighter';
        }
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        // мишени (заглушённые ЭМИ — голубые, со щитом — в пузыре)
        for (const e of tg) {
          if (e.dead) continue;
          ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(Math.PI);
          const f = G.frame(e.spr), img = f && G.src(f);
          if (img) {
            const h = e.w * f[3] / f[2];
            ctx.drawImage(img, f[0], f[1], f[2], f[3], -e.w / 2, -h / 2, e.w, h);
            const wh = (e.flash > 0 || e.emp > 0) && G.white(e.spr);
            if (wh) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = e.flash > 0 ? 0.7 : 0.35; ctx.drawImage(wh, -e.w / 2, -h / 2, e.w, h); }
          }
          ctx.restore();
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
          if (e.emp > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5; ctx.drawImage(G.soft('#7fe7ff', 64), e.x - e.w * 0.7, e.y - e.w * 0.7, e.w * 1.4, e.w * 1.4); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
          if (e.sh) G.draw(ctx, G.frame('fx_sh_bubble') ? 'fx_sh_bubble' : 'pb_orb', e.x, e.y, e.w * 1.5, 0, 0.8);
        }
        ctx.globalCompositeOperation = 'lighter';
        for (const b of eb) G.draw(ctx, 'eb_orb', b.x, b.y, 9 * k);
        for (const b of shots) { ctx.globalAlpha = b.holo ? 0.6 : 1; G.draw(ctx, b.spr, b.x, b.y, b.w, b.vx || b.vy ? Math.atan2(b.vy, b.vx) + Math.PI / 2 : 0); }
        ctx.globalAlpha = 1;
        // рельса: заряд у носа, затем луч на весь экран
        if (on && id === 'sk_rail') {
          if (ft < 0.4) { const q = ft / 0.4; ctx.globalAlpha = 0.4 + 0.5 * q; ctx.drawImage(G.glow('#7ffff0', 64), ship.x - 26 * k * q, ship.y - ship.w * 0.6 - 26 * k * q, 52 * k * q, 52 * k * q); game.drawBeamV(ctx, ship.x, 0, ship.y - ship.w * 0.5, (1.5 + 2 * q) * k, '#7ffff0', 0.25 + 0.35 * q); }
          else { const fade = Math.min(1, (ft - 0.4) * 8, (DUR - ft) * 4); game.drawBeamV(ctx, ship.x, 0, ship.y - ship.w * 0.45, 18 * k * (0.6 + 0.4 * fade), '#3de0ff', fade, -1, ship.y - ship.w * 0.55); }
          ctx.globalAlpha = 1;
        }
        for (const f of fx) {
          const q = f.t / 0.5;
          if (f.kind === 'boom') { ctx.globalCompositeOperation = 'lighter'; G.draw(ctx, 'fx_ex_l', f.x, f.y, f.r * (0.6 + q), 0, Math.max(0, 1 - q)); }
          else if (f.kind === 'ring') { ctx.globalAlpha = Math.max(0, 1 - q); ctx.strokeStyle = f.col; ctx.lineWidth = 2 * k; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.4 + 0.6 * q), 0, U.TAU); ctx.stroke(); ctx.globalAlpha = 1; }
          else if (f.kind === 'emp') { const qe = f.t / 0.7; ctx.globalAlpha = 1 - qe; ctx.strokeStyle = '#7fe7ff'; ctx.lineWidth = 4 * k; ctx.beginPath(); ctx.arc(f.x, f.y, Math.hypot(W, H) * qe, 0, U.TAU); ctx.stroke(); ctx.globalAlpha = 1; }
          else if (f.kind === 'bolt' && f.t < 0.25) {
            ctx.globalAlpha = 1 - f.t / 0.25; ctx.strokeStyle = '#9fe8ff'; ctx.lineWidth = 2 * k; ctx.beginPath();
            const [a, b] = f.pts; ctx.moveTo(a[0], a[1]);
            for (let j = 1; j <= 5; j++) { const q2 = j / 5; ctx.lineTo(U.lerp(a[0], b[0], q2) + (j < 5 ? U.rand(-7, 7) * k : 0), U.lerp(a[1], b[1], q2) + (j < 5 ? U.rand(-7, 7) * k : 0)); }
            ctx.stroke(); ctx.globalAlpha = 1;
          }
        }
        // турель
        if (turret) {
          const w = ship.w * 0.7;
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + 0.1 * Math.sin(t * 8);
          ctx.drawImage(G.soft('#b06bff', 64), turret.x - w, turret.y - w, w * 2, w * 2);
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
          G.draw(ctx, 'sp_radar', turret.x, turret.y, w, turret.ang + Math.PI / 2);
        }
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        const tilt = (ship.x - px) / Math.max(dt, 0.001) * 0.002;
        // двойник: полупрозрачная голограмма с полосами развёртки
        if (clone) {
          ctx.save(); ctx.globalAlpha = (0.42 + 0.08 * Math.sin(t * 23)) * Math.min(1, clone.t / 0.4);
          game.drawShip(ctx, s.ship.model, s.ship.skin, s.ship.trail, clone.x, clone.y, ship.w, tilt, t, 1);
          ctx.restore();
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.18; ctx.fillStyle = '#7ff6ff';
          for (let y = clone.y - ship.w * 0.6 + ((t * 40) % 6); y < clone.y + ship.w * 0.6; y += 6) ctx.fillRect(clone.x - ship.w * 0.5, y, ship.w, 1);
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        }
        game.drawShip(ctx, s.ship.model, s.ship.skin, s.ship.trail, ship.x, ship.y, ship.w, tilt, t, 1);
        if (ship.hitT > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ship.hitT * 3; ctx.drawImage(G.soft('#ff5c7a', 64), ship.x - ship.w * 0.6, ship.y - ship.w * 0.6, ship.w * 1.2, ship.w * 1.2); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
        // барьер: золотой купол с сотами
        if (on && id === 'sk_barrier') {
          const R = ship.w * 0.85, a0 = Math.min(1, ft * 4, (DUR - ft) * 4);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.25 * a0; ctx.drawImage(G.soft('#ffd23d', 64), ship.x - R * 1.3, ship.y - R * 1.3, R * 2.6, R * 2.6);
          ctx.globalAlpha = 0.8 * a0; ctx.strokeStyle = '#ffd23d'; ctx.lineWidth = 2 * k;
          ctx.beginPath(); ctx.arc(ship.x, ship.y, R, 0, U.TAU); ctx.stroke();
          for (let j = 0; j < 6; j++) {
            const a = j / 6 * U.TAU + t * 0.8, hx = ship.x + Math.cos(a) * R * 0.75, hy = ship.y + Math.sin(a) * R * 0.75, r = 5 * k;
            ctx.beginPath();
            for (let q = 0; q <= 6; q++) { const b = q / 6 * U.TAU + Math.PI / 6; if (q) ctx.lineTo(hx + Math.cos(b) * r, hy + Math.sin(b) * r); else ctx.moveTo(hx + Math.cos(b) * r, hy + Math.sin(b) * r); }
            ctx.stroke();
          }
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        }
        // значок навыка в углу: во время действия — сколько осталось, в покое — заряд до запуска
        const ix = 18 * k, iy = 18 * k, ir = 13 * k;
        ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.arc(ix, iy, ir + 2 * k, 0, U.TAU); ctx.fill();
        ctx.globalAlpha = on ? 1 : 0.55;
        if (G.frame(id) && G.src(G.frame(id))) G.draw(ctx, id, ix, iy, ir * 2);
        else { ctx.font = Math.round(ir * 1.3) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(sk.ico, ix, iy + 1); }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = on ? '#3de0ff' : 'rgba(255,255,255,.45)'; ctx.lineWidth = 2.5 * k;
        ctx.beginPath(); ctx.arc(ix, iy, ir + 2 * k, -Math.PI / 2, -Math.PI / 2 + U.TAU * (on ? 1 - ft / DUR : cyc / IDLE)); ctx.stroke();
      };
      this.raf = requestAnimationFrame(step);
    },
    // ── 4.3.2: сцены для окон-подсказок: события волны и аномалии сектора ──
    SCENES: ['storm', 'meteors', 'solar', 'debris', 'convoy', 'ionwind', 'flagship', 'swarm', 'unstable'],
    hasScene(key) { return this.SCENES.includes(key); },
    scene(cv, key) {
      this.stop();
      if (!cv || !this.hasScene(key)) return;
      const G = SS.gfx, s = SS.store.s, game = SS.game;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = cv.clientWidth || 300, H = cv.clientHeight || 150;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      const ctx = cv.getContext('2d');
      const k = U.clamp(W / 340, 0.8, 1.3);
      const ship = { x: W / 2, y: H - 26 * k, w: 36 * k, hitT: 0 };
      const stars = Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: Math.random() * H, v: U.rand(8, 30), a: U.rand(0.2, 0.7) }));
      const MDIR = { x: -0.63, y: 0.77 }, MHEAD = { fx_meteor1: [0.2, 0.81], fx_meteor2: [0.24, 0.82] };
      // аномалии: ветер — враги вдвое быстрее, рой — много мелких, флагман — элита в золотом ореоле
      const fast = key === 'ionwind' ? 2.2 : 1, swarm = key === 'swarm', elite = key === 'flagship';
      const n = swarm ? 9 : key === 'convoy' || key === 'debris' ? 3 : 4;
      const SPR = ['scout', 'drone', 'shooter', 'interceptor', 'heavy'];
      const tg = Array.from({ length: n }, (_, i) => {
        const fx = swarm ? 0.1 + (i % 5) * 0.2 : (i + 0.5) / n, fy = swarm ? 22 + Math.floor(i / 5) * 30 + (i % 2) * 8 : 26 + (i % 2) * 22;
        return { spr: swarm ? 'drone' : SPR[i % 5], ox: fx * W, x: fx * W, y: fy * k, w: (swarm ? 20 : elite && i % 2 === 0 ? 34 : 26) * k, hp: 60, flash: 0, dead: 0, ph: i * 1.3, cd: 0.5 + i * 0.3, elite: elite && i % 2 === 0 };
      });
      const shots = [], eb = [], fx = [], strikes = [], lanes = [], meteors = [], rocks = [], coins = [], wind = [];
      let t = 0, last = performance.now(), fireCd = 0.2, spawn = 0.4, sun = null, truck = null, mode = key, modeT = 0;
      const UNST = ['storm', 'meteors', 'solar'];
      if (key === 'unstable') mode = UNST[0];
      const alive = () => tg.filter((e) => !e.dead);
      const hit = (e, dmg) => {
        if (!e || e.dead) return;
        e.hp -= dmg; e.flash = 0.08;
        if (e.hp <= 0) { e.dead = 0.9; fx.push({ kind: 'boom', x: e.x, y: e.y, t: 0, r: e.w * 1.4 }); }
      };
      const hurtShip = () => { ship.hitT = 0.2; };

      const step = (now) => {
        if (!cv.isConnected || !cv.offsetParent) { this.stop(); return; }
        this.raf = requestAnimationFrame(step);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now; t += dt;
        // «Нестабильная зона»: события сменяют друг друга
        if (key === 'unstable') { modeT += dt; if (modeT > 3.6) { modeT = 0; mode = UNST[(UNST.indexOf(mode) + 1) % UNST.length]; strikes.length = 0; lanes.length = 0; sun = null; } }
        const px = ship.x;
        // корабль ходит под мишенями, у конвоя — под грузовиком
        const want = mode === 'convoy' && truck ? truck.x : W / 2 + Math.sin(t * 0.9) * W * 0.28;
        ship.x = U.damp(ship.x, want, mode === 'convoy' ? 3 : 2, dt);
        ship.hitT = Math.max(0, ship.hitT - dt);
        for (const e of tg) {
          if (e.dead) { e.dead -= dt; if (e.dead <= 0) { e.dead = 0; e.hp = 60; } continue; }
          e.flash = Math.max(0, e.flash - dt);
          e.ph += dt * fast;
          e.x = e.ox + Math.sin(e.ph * 1.1) * (swarm ? 10 : 22) * k * (fast > 1 ? 1.4 : 1);
          e.cd -= dt * fast;
          if (e.cd <= 0) { e.cd = U.rand(1, 1.6); const a = Math.atan2(ship.y - e.y, ship.x - e.x), sp = 110 * k * fast; eb.push({ x: e.x, y: e.y + e.w * 0.3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp }); }
        }
        // ионный ветер: косые голубые струи
        if (key === 'ionwind' && Math.random() < dt * 14) wind.push({ x: U.rand(0, W + 60 * k), y: -10, t: 0 });
        for (const w of wind) { w.t += dt; w.x -= 260 * k * dt; w.y += 340 * k * dt; }
        while (wind.length && wind[0].t > 1.2) wind.shift();
        // обычный огонь корабля
        fireCd -= dt;
        if (fireCd <= 0) { fireCd = 0.18; shots.push({ x: ship.x, y: ship.y - ship.w * 0.45, vy: -520 * k }); }
        // ── события ──
        spawn -= dt;
        if (mode === 'storm' && spawn <= 0) {
          spawn = 0.9;
          const al = alive(), tgt = Math.random() < 0.45 || !al.length ? { x: ship.x + U.rand(-20, 20) * k, y: ship.y } : U.pick(al);
          strikes.push({ x: tgt.x, y: tgt.y, t: 0, warn: 1.1, R: 26 * k });
        }
        for (const st of strikes) {
          st.t += dt;
          if (!st.done && st.t >= st.warn) {
            st.done = true;
            fx.push({ kind: 'zap', x: st.x, y: st.y, t: 0 });
            for (const e of alive()) if (Math.hypot(e.x - st.x, e.y - st.y) < st.R + e.w * 0.4) hit(e, 40);
            if (Math.hypot(ship.x - st.x, ship.y - st.y) < st.R * 0.8 + ship.w * 0.2) hurtShip();
          }
        }
        for (let i = strikes.length - 1; i >= 0; i--) if (strikes[i].done) strikes.splice(i, 1);
        if (mode === 'meteors' && spawn <= 0) {
          spawn = 0.8;
          const tx = Math.random() < 0.35 ? ship.x : U.rand(0.1, 0.95) * W, ty = U.rand(0.2, 0.9) * H, y0 = -30 * k, kk = (ty - y0) / MDIR.y;
          lanes.push({ x0: tx - MDIR.x * kk, y0, t: 0, warn: 0.85, big: Math.random() < 0.45 });
        }
        for (const l of lanes) {
          l.t += dt;
          if (l.t >= l.warn && !l.gone) { l.gone = true; meteors.push({ x: l.x0, y: l.y0, big: l.big, spr: l.big ? 'fx_meteor1' : 'fx_meteor2', w: (l.big ? 40 : 26) * k, hit: [] }); }
        }
        for (let i = lanes.length - 1; i >= 0; i--) if (lanes[i].gone && lanes[i].t > lanes[i].warn + 0.3) lanes.splice(i, 1);
        for (const m of meteors) {
          m.x += MDIR.x * 300 * k * dt; m.y += MDIR.y * 300 * k * dt;
          for (const e of alive()) if (!m.hit.includes(e) && Math.hypot(e.x - m.x, e.y - m.y) < e.w * 0.6) { m.hit.push(e); hit(e, m.big ? 50 : 28); }
          if (!m.hitShip && Math.hypot(ship.x - m.x, ship.y - m.y) < ship.w * 0.35) { m.hitShip = true; hurtShip(); }
          if (m.y > H + 30 || m.x < -40) m.dead = true;
        }
        for (let i = meteors.length - 1; i >= 0; i--) if (meteors[i].dead) meteors.splice(i, 1);
        if (mode === 'solar') {
          if (!sun) sun = { t: 0 };
          sun.t += dt;
          if (sun.t >= 1.6 && !sun.fired) {
            sun.fired = true;
            fx.push({ kind: 'flash', t: 0 });
            eb.length = 0;
            for (const e of alive()) hit(e, 20);
          }
          if (sun.t > 3) sun = null;
        }
        if (mode === 'debris' && spawn <= 0) { spawn = 0.55; rocks.push({ x: U.rand(0.1, 0.9) * W, y: -12 * k, w: U.rand(16, 26) * k, spr: 'fx_rock' + U.randi(1, 6), rot: Math.random() * 6, vr: U.rand(-2, 2), vy: U.rand(45, 70) * k, hp: 18 }); }
        for (const r of rocks) { r.y += r.vy * dt; r.rot += r.vr * dt; if (r.y > H + 20) r.dead = true; }
        if (mode === 'convoy') {
          if (!truck && spawn <= 0) truck = { x: -40 * k, y: 30 * k, hp: 160, flash: 0 };
          if (truck) {
            truck.x += 55 * k * dt; truck.flash = Math.max(0, truck.flash - dt);
            if (truck.x > W + 50 * k) { truck = null; spawn = 0.8; }
          }
        }
        // выстрелы корабля
        for (const b of shots) {
          b.y += b.vy * dt;
          if (b.y < -20) { b.dead = true; continue; }
          if (truck && Math.abs(b.x - truck.x) < 30 * k && Math.abs(b.y - truck.y) < 18 * k) {
            b.dead = true; truck.hp -= 9; truck.flash = 0.08;
            if (truck.hp <= 0) {
              fx.push({ kind: 'boom', x: truck.x, y: truck.y, t: 0, r: 70 * k });
              for (let q = 0; q < 2; q++) coins.push({ x: truck.x + (q ? 12 : -12) * k, y: truck.y, vx: (q ? 40 : -40) * k, vy: -30 * k, t: 0, crate: true });
              truck = null; spawn = 1.2;
            }
            continue;
          }
          for (const r of rocks) if (!r.dead && Math.hypot(r.x - b.x, r.y - b.y) < r.w * 0.6) { b.dead = true; r.hp -= 9; if (r.hp <= 0) { r.dead = true; fx.push({ kind: 'boom', x: r.x, y: r.y, t: 0, r: r.w * 1.2 }); for (let q = 0; q < 3; q++) coins.push({ x: r.x, y: r.y, vx: U.rand(-50, 50) * k, vy: U.rand(-60, -20) * k, t: 0 }); } break; }
          if (b.dead) continue;
          for (const e of alive()) if (Math.hypot(e.x - b.x, e.y - b.y) < e.w * 0.55) { hit(e, e.elite ? 4 : 9); b.dead = true; break; }
        }
        for (let i = shots.length - 1; i >= 0; i--) if (shots[i].dead) shots.splice(i, 1);
        for (let i = rocks.length - 1; i >= 0; i--) if (rocks[i].dead) rocks.splice(i, 1);
        // монеты и ящики: подлетают и летят к кораблю
        for (const c of coins) {
          c.t += dt;
          if (c.t < 0.4) { c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 120 * k * dt; }
          else { const a = Math.atan2(ship.y - c.y, ship.x - c.x); c.x += Math.cos(a) * 320 * k * dt; c.y += Math.sin(a) * 320 * k * dt; if (Math.hypot(ship.x - c.x, ship.y - c.y) < 12 * k) { c.dead = true; fx.push({ kind: 'ring', x: ship.x, y: ship.y - 6 * k, t: 0, r: 16 * k, col: '#ffd23d' }); } }
        }
        for (let i = coins.length - 1; i >= 0; i--) if (coins[i].dead || coins[i].t > 3) coins.splice(i, 1);
        for (const b of eb) { b.x += b.vx * dt; b.y += b.vy * dt; if (Math.hypot(b.x - ship.x, b.y - ship.y) < ship.w * 0.3) { b.dead = true; hurtShip(); } if (b.y > H + 10 || b.x < -10 || b.x > W + 10) b.dead = true; }
        for (let i = eb.length - 1; i >= 0; i--) if (eb[i].dead) eb.splice(i, 1);
        for (const f of fx) f.t += dt;
        for (let i = fx.length - 1; i >= 0; i--) if (fx[i].t > 0.5) fx.splice(i, 1);

        // ── отрисовка ──
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#060a1f'); bg.addColorStop(1, '#0b1238');
        ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#cfe3ff';
        for (const st of stars) { st.y += st.v * dt * fast; if (st.y > H) { st.y = 0; st.x = Math.random() * W; } ctx.globalAlpha = st.a; ctx.fillRect(st.x, st.y, 1.2, 1.2); }
        ctx.globalCompositeOperation = 'lighter';
        // ветер, метки бури, линии метеоров, солнце
        ctx.strokeStyle = '#7fd8ff'; ctx.lineWidth = 1.5 * k;
        for (const w of wind) { ctx.globalAlpha = 0.5 * (1 - w.t / 1.2); ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.lineTo(w.x + 26 * k, w.y - 34 * k); ctx.stroke(); }
        for (const st of strikes) {
          const q = st.t / st.warn;
          if (G.frame('fx_ion')) G.draw(ctx, 'fx_ion', st.x, st.y, st.R * 2 * (0.75 + 0.25 * q), st.t * 2, 0.3 + 0.5 * q);
          ctx.globalAlpha = 0.35 + 0.5 * q; ctx.strokeStyle = '#9fd0ff'; ctx.lineWidth = 2 * k;
          ctx.beginPath(); ctx.arc(st.x, st.y, st.R * (1.7 - 0.7 * q), 0, U.TAU); ctx.stroke();
        }
        ctx.setLineDash([8 * k, 6 * k]); ctx.strokeStyle = '#ff8a3d'; ctx.lineWidth = 1.5 * k;
        for (const l of lanes) { if (l.gone) continue; ctx.globalAlpha = 0.3 + 0.5 * (l.t / l.warn); ctx.beginPath(); ctx.moveTo(l.x0, l.y0); ctx.lineTo(l.x0 + MDIR.x * H * 2, l.y0 + MDIR.y * H * 2); ctx.stroke(); }
        ctx.setLineDash([]);
        if (sun && !sun.fired) { const q = sun.t / 1.6; G.draw(ctx, 'fx_solar', W * 0.85, 20 * k, (40 + 50 * q) * k, sun.t * 0.8, 0.4 + 0.6 * q); }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        // мишени (элита — в золотом ореоле), грузовик, обломки
        for (const e of tg) {
          if (e.dead) continue;
          if (e.elite) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 + 0.15 * Math.sin(t * 6); ctx.drawImage(G.soft('#ffc83d', 64), e.x - e.w, e.y - e.w, e.w * 2, e.w * 2); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
          ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(Math.PI);
          const f = G.frame(e.spr), img = f && G.src(f);
          if (img) {
            const h = e.w * f[3] / f[2];
            ctx.drawImage(img, f[0], f[1], f[2], f[3], -e.w / 2, -h / 2, e.w, h);
            if (e.flash > 0) { const wh = G.white(e.spr); if (wh) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7; ctx.drawImage(wh, -e.w / 2, -h / 2, e.w, h); } }
          }
          ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        }
        if (truck) {
          const spr = G.frame('e_cargo') && G.src(G.frame('e_cargo')) ? 'e_cargo' : 'heavy';
          G.draw(ctx, spr, truck.x, truck.y, 46 * k, Math.PI / 2);
          ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(truck.x - 20 * k, truck.y - 26 * k, 40 * k, 3 * k);
          ctx.fillStyle = truck.flash > 0 ? '#ffffff' : '#ffc83d'; ctx.fillRect(truck.x - 20 * k, truck.y - 26 * k, 40 * k * Math.max(0, truck.hp / 160), 3 * k);
        }
        for (const r of rocks) G.draw(ctx, r.spr, r.x, r.y, r.w, r.rot);
        ctx.globalCompositeOperation = 'lighter';
        for (const m of meteors) { const f = G.frame(m.spr), img = f && G.src(f); if (img) { const h = m.w * f[3] / f[2], a = MHEAD[m.spr]; ctx.drawImage(img, f[0], f[1], f[2], f[3], m.x - m.w * a[0], m.y - h * a[1], m.w, h); } }
        for (const b of eb) G.draw(ctx, 'eb_orb', b.x, b.y, 9 * k);
        for (const b of shots) G.draw(ctx, 'pb_bolt_m', b.x, b.y, 11 * k);
        ctx.globalCompositeOperation = 'source-over';
        for (const c of coins) {
          if (c.crate && G.frame('p_crate') && G.src(G.frame('p_crate'))) G.draw(ctx, 'p_crate', c.x, c.y, 16 * k);
          else { ctx.fillStyle = '#ffc83d'; ctx.beginPath(); ctx.arc(c.x, c.y, 3.5 * k, 0, U.TAU); ctx.fill(); ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(c.x - k, c.y - k, 1.3 * k, 0, U.TAU); ctx.fill(); }
        }
        for (const f of fx) {
          const q = f.t / 0.5;
          if (f.kind === 'boom') { ctx.globalCompositeOperation = 'lighter'; G.draw(ctx, 'fx_ex_l', f.x, f.y, f.r * (0.6 + q), 0, Math.max(0, 1 - q)); }
          else if (f.kind === 'ring') { ctx.globalAlpha = Math.max(0, 1 - q); ctx.strokeStyle = f.col; ctx.lineWidth = 2 * k; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.4 + 0.6 * q), 0, U.TAU); ctx.stroke(); }
          else if (f.kind === 'zap' && f.t < 0.2) {
            ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - f.t / 0.2; ctx.strokeStyle = '#cfe8ff'; ctx.lineWidth = 2.5 * k; ctx.beginPath(); ctx.moveTo(f.x + U.rand(-10, 10) * k, 0);
            for (let j = 1; j <= 6; j++) ctx.lineTo(f.x + (j < 6 ? U.rand(-9, 9) * k : 0), f.y * j / 6);
            ctx.stroke(); ctx.drawImage(G.glow('#9fd0ff', 64), f.x - 26 * k, f.y - 26 * k, 52 * k, 52 * k);
          } else if (f.kind === 'flash') { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6 * (1 - q); ctx.fillStyle = '#ffd98a'; ctx.fillRect(0, 0, W, H); }
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        }
        game.drawShip(ctx, s.ship.model, s.ship.skin, s.ship.trail, ship.x, ship.y, ship.w, (ship.x - px) / Math.max(dt, 0.001) * 0.002, t, 1);
        if (ship.hitT > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ship.hitT * 3; ctx.drawImage(G.soft('#ff5c7a', 64), ship.x - ship.w * 0.6, ship.y - ship.w * 0.6, ship.w * 1.2, ship.w * 1.2); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
      };
      this.raf = requestAnimationFrame(step);
    },
  };
  SS.demo = demo;
})();
