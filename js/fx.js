// ════════════════════════════════════════════════════════════════
// SPACE SHOOTER 2.0 — визуальные эффекты
//  искры, дым, обломки, взрывы (кадры из листа), ударные волны,
//  молнии, всплывающие числа, вспышка экрана, тряска
// ════════════════════════════════════════════════════════════════
'use strict';

(function () {
  const U = SS.util;
  const G = () => SS.gfx;

  const P_SPARK = 0, P_GLOW = 1, P_SMOKE = 2, P_DEBRIS = 3, P_EMBER = 4;
  const partPool = new SS.Pool(() => ({}));
  const textPool = new SS.Pool(() => ({}));

  const fx = {
    parts: [], expl: [], rings: [], texts: [], beams: [],
    trauma: 0, shakeX: 0, shakeY: 0,
    flashA: 0, flashColor: '#fff',
    maxParts: 500,
    quality: 2,
    shakeOn: true,
    font: '700 13px Orbitron, Rajdhani, sans-serif',

    setQuality(q) { this.quality = q; this.maxParts = q >= 2 ? 520 : q === 1 ? 280 : 110; },
    clear() {
      for (const p of this.parts) partPool.put(p);
      for (const t of this.texts) textPool.put(t);
      this.parts.length = 0; this.expl.length = 0; this.rings.length = 0; this.texts.length = 0; this.beams.length = 0;
      this.trauma = 0; this.flashA = 0;
    },

    _p(type, x, y, vx, vy, life, size, color) {
      if (this.parts.length >= this.maxParts) return null;
      const p = partPool.get();
      p.t = type; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.size = size; p.color = color;
      p.drag = 0; p.rot = 0; p.vr = 0; p.grow = 0;
      this.parts.push(p);
      return p;
    },

    sparks(x, y, color, n, speed, life) {
      n = this.quality === 0 ? Math.ceil(n * 0.35) : this.quality === 1 ? Math.ceil(n * 0.65) : n;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * U.TAU, s = (speed || 260) * U.rand(0.35, 1.1);
        const p = this._p(P_SPARK, x, y, Math.cos(a) * s, Math.sin(a) * s, (life || 0.45) * U.rand(0.6, 1.2), U.rand(1.2, 2.6), color);
        if (p) p.drag = 3.2;
      }
    },
    embers(x, y, color, n, speed) {
      if (this.quality === 0) return;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * U.TAU, s = (speed || 90) * U.rand(0.3, 1);
        const p = this._p(P_EMBER, x, y, Math.cos(a) * s, Math.sin(a) * s, U.rand(0.5, 1.1), U.rand(1.5, 3), color);
        if (p) p.drag = 1.5;
      }
    },
    glowPuff(x, y, color, size, life, vx, vy) {
      const p = this._p(P_GLOW, x, y, vx || 0, vy || 0, life || 0.3, size, color);
      if (p) p.grow = 0.6;
      return p;
    },
    smoke(x, y, n, size) {
      if (this.quality === 0) return;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * U.TAU, s = U.rand(10, 50);
        const p = this._p(P_SMOKE, x + U.rand(-6, 6), y + U.rand(-6, 6), Math.cos(a) * s, Math.sin(a) * s + 20, U.rand(0.7, 1.3), size * U.rand(0.6, 1.1), '#1a1d2e');
        if (p) { p.drag = 1.2; p.grow = 1.2; }
      }
    },
    debris(x, y, color, n, speed) {
      if (this.quality === 0) return;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * U.TAU, s = (speed || 160) * U.rand(0.4, 1);
        const p = this._p(P_DEBRIS, x, y, Math.cos(a) * s, Math.sin(a) * s, U.rand(0.6, 1.2), U.rand(2, 4.5), color);
        if (p) { p.drag = 1.4; p.rot = Math.random() * U.TAU; p.vr = U.rand(-12, 12); }
      }
    },
    ring(x, y, r0, r1, color, dur, width) {
      if (this.rings.length > 40) this.rings.shift();
      this.rings.push({ x, y, r0, r1, color, life: dur, max: dur, w: width || 3 });
    },
    // взрыв: size ~ 1 (малый) … 4 (босс)
    explode(x, y, size, color) {
      size = size || 1;
      const S = G().S;
      this.expl.push({ x, y, life: 0, dur: 0.42 + size * 0.08, w: (58 + size * 34) * S, rot: Math.random() * U.TAU });
      this.glowPuff(x, y, color || '#ffb03d', (90 + size * 70) * S, 0.25 + size * 0.05);
      this.ring(x, y, 6 * S, (40 + size * 38) * S, color || '#ffd9a0', 0.32 + size * 0.06, 2 + size);
      this.sparks(x, y, color || '#ffcf6b', 8 + Math.round(size * 7), 220 + size * 60, 0.4 + size * 0.06);
      if (size >= 1.4) this.debris(x, y, '#8a93b8', Math.round(size * 4), 140 + size * 30);
      if (size >= 1.2) this.smoke(x, y, Math.round(size * 2.5), (28 + size * 12) * S);
      if (size >= 1.5) this.embers(x, y, color || '#ff9f3d', Math.round(size * 5), 120);
    },
    hit(x, y, color) {
      this.glowPuff(x, y, color, 26 * G().S, 0.12);
      if (this.quality > 0) this.sparks(x, y, color, 3, 180, 0.22);
    },
    // ломаная молния; points: [[x,y],...]
    beam(points, color, width, dur) {
      if (this.beams.length > 30) this.beams.shift();
      this.beams.push({ pts: points, color, w: width || 3, life: dur || 0.14, max: dur || 0.14 });
    },
    lightning(x0, y0, x1, y1, color, width, dur) {
      const d = Math.hypot(x1 - x0, y1 - y0);
      const segs = Math.max(3, Math.round(d / 22));
      const nx = -(y1 - y0) / (d || 1), ny = (x1 - x0) / (d || 1);
      const pts = [[x0, y0]];
      for (let i = 1; i < segs; i++) {
        const t = i / segs, off = U.rand(-1, 1) * Math.min(18, d * 0.12);
        pts.push([U.lerp(x0, x1, t) + nx * off, U.lerp(y0, y1, t) + ny * off]);
      }
      pts.push([x1, y1]);
      this.beam(pts, color, width, dur);
    },
    text(x, y, str, color, size, dur, vy) {
      if (this.texts.length > 60) { textPool.put(this.texts.shift()); }
      const t = textPool.get();
      t.x = x; t.y = y; t.s = str; t.c = color || '#fff'; t.size = size || 13; t.life = dur || 0.7; t.max = t.life; t.vy = vy === undefined ? -55 : vy;
      this.texts.push(t);
    },
    flash(color, a) { this.flashColor = color || '#fff'; this.flashA = Math.max(this.flashA, a || 0.5); },
    shake(amount) { if (this.shakeOn) this.trauma = Math.min(1, this.trauma + amount); },

    update(dt) {
      // тряска: «травма» затухает, смещение ~ травма²
      if (this.trauma > 0) {
        this.trauma = Math.max(0, this.trauma - dt * 1.6);
        const s = this.trauma * this.trauma * 16;
        this.shakeX = U.rand(-1, 1) * s; this.shakeY = U.rand(-1, 1) * s;
      } else { this.shakeX = this.shakeY = 0; }
      if (this.flashA > 0) this.flashA = Math.max(0, this.flashA - dt * 2.2);

      const parts = this.parts;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life -= dt;
        if (p.life <= 0) { partPool.put(p); parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
        if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.vr) p.rot += p.vr * dt;
        if (p.grow) p.size *= 1 + p.grow * dt;
      }
      for (let i = this.expl.length - 1; i >= 0; i--) { const e = this.expl[i]; e.life += dt; if (e.life >= e.dur) this.expl.splice(i, 1); }
      for (let i = this.rings.length - 1; i >= 0; i--) { const r = this.rings[i]; r.life -= dt; if (r.life <= 0) this.rings.splice(i, 1); }
      for (let i = this.beams.length - 1; i >= 0; i--) { const b = this.beams[i]; b.life -= dt; if (b.life <= 0) this.beams.splice(i, 1); }
      for (let i = this.texts.length - 1; i >= 0; i--) {
        const t = this.texts[i]; t.life -= dt; t.y += t.vy * dt; t.vy *= Math.exp(-2.5 * dt);
        if (t.life <= 0) { textPool.put(t); this.texts.splice(i, 1); }
      }
    },

    // слой под врагами: дым и обломки
    drawBack(ctx) {
      const g = G();
      for (const p of this.parts) {
        if (p.t === P_SMOKE) {
          const k = p.life / p.max;
          ctx.globalAlpha = k * 0.55;
          const s = p.size;
          ctx.drawImage(g.soft('#232845', 64), p.x - s, p.y - s, s * 2, s * 2);
        } else if (p.t === P_DEBRIS) {
          ctx.globalAlpha = Math.min(1, p.life / p.max * 2);
          ctx.fillStyle = p.color;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    },

    // аддитивный слой: взрывы, искры, свечения, кольца, молнии
    drawFront(ctx) {
      const g = G();
      ctx.globalCompositeOperation = 'lighter';
      for (const e of this.expl) {
        const k = e.life / e.dur;
        const fi = Math.min(4, Math.floor(k * 5));
        const w = e.w * (0.75 + k * 0.45);
        ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
        g.draw(ctx, 'ex' + (fi + 1), e.x, e.y, w, e.rot);
      }
      ctx.globalAlpha = 1;
      for (const p of this.parts) {
        const k = p.life / p.max;
        if (p.t === P_SPARK) {
          ctx.globalAlpha = k;
          ctx.strokeStyle = p.color; ctx.lineWidth = p.size;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); ctx.stroke();
        } else if (p.t === P_GLOW) {
          ctx.globalAlpha = k;
          const s = p.size;
          ctx.drawImage(g.glow(p.color, 64), p.x - s / 2, p.y - s / 2, s, s);
        } else if (p.t === P_EMBER) {
          ctx.globalAlpha = k;
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
      }
      ctx.lineCap = 'round';
      for (const r of this.rings) {
        const k = 1 - r.life / r.max;
        const rad = U.lerp(r.r0, r.r1, U.easeOutCubic(k));
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.strokeStyle = r.color; ctx.lineWidth = r.w * (1 - k * 0.6);
        ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, U.TAU); ctx.stroke();
      }
      ctx.lineJoin = 'round';
      for (const b of this.beams) {
        const k = b.life / b.max;
        for (let pass = 0; pass < 2; pass++) {
          ctx.globalAlpha = pass ? k : k * 0.45;
          ctx.strokeStyle = pass ? '#ffffff' : b.color;
          ctx.lineWidth = pass ? b.w * 0.45 : b.w * 2.4;
          ctx.beginPath();
          for (let i = 0; i < b.pts.length; i++) { const p = b.pts[i]; i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },

    drawTexts(ctx) {
      if (!this.texts.length) return;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      let lastSize = 0;
      for (const t of this.texts) {
        const k = t.life / t.max;
        const pop = k > 0.85 ? 1 + (k - 0.85) * 2.5 : 1;
        if (t.size !== lastSize) { ctx.font = '900 ' + t.size + 'px Orbitron, Rajdhani, sans-serif'; lastSize = t.size; }
        ctx.globalAlpha = Math.min(1, k * 2.2);
        ctx.save(); ctx.translate(t.x, t.y); if (pop !== 1) ctx.scale(pop, pop);
        ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(0,0,10,.85)'; ctx.strokeText(t.s, 0, 0);
        ctx.fillStyle = t.c; ctx.fillText(t.s, 0, 0);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },

    drawFlash(ctx, W, H) {
      if (this.flashA <= 0.01) return;
      ctx.globalAlpha = this.flashA;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    },
  };

  SS.fx = fx;
})();
