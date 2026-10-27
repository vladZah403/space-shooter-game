// ════════════════════════════════════════════════════════════════
// SPACE SHOOTER 2.0 — визуальные эффекты
//  искры, дым, обломки, взрывы (кадры из листа), ударные волны,
//  молнии, всплывающие числа, вспышка экрана, тряска,
//  спрайтовые эффекты листа VFX (щиты, порталы, бонусы, вспышки)
// ════════════════════════════════════════════════════════════════
'use strict';

(function () {
  const U = SS.util;
  const G = () => SS.gfx;

  const P_SPARK = 0, P_GLOW = 1, P_SMOKE = 2, P_DEBRIS = 3, P_EMBER = 4;
  const partPool = new SS.Pool(() => ({}));
  const textPool = new SS.Pool(() => ({}));

  const fx = {
    parts: [], expl: [], rings: [], texts: [], beams: [], sprites: [], scr: [], _vig: {},
    trauma: 0, shakeX: 0, shakeY: 0,
    flashA: 0, flashColor: '#fff',
    maxParts: 500,
    quality: 2,
    shakeOn: true,
    _tc: new Map(), _tcDpr: 0, _mx: null,

    setQuality(q) { this.quality = q; this.maxParts = q >= 2 ? 520 : q === 1 ? 280 : 110; },
    clear() {
      for (const p of this.parts) partPool.put(p);
      for (const t of this.texts) textPool.put(t);
      this.parts.length = 0; this.expl.length = 0; this.rings.length = 0; this.texts.length = 0; this.beams.length = 0; this.sprites.length = 0; this.scr.length = 0;
      this.trauma = 0; this.flashA = 0;
    },

    _p(type, x, y, vx, vy, life, size, color) {
      if (this.parts.length >= this.maxParts) return null;
      const p = partPool.get();
      p.t = type; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.size = size; p.color = color;
      p.drag = 0; p.rot = 0; p.vr = 0; p.grow = 0; p.spr = null;
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
      // часть осколков — камни из листа эффектов, остальные — цветные пластины корпуса
      const rocks = G().frames.fx_rock1 ? 6 : 0;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * U.TAU, s = (speed || 160) * U.rand(0.4, 1);
        const p = this._p(P_DEBRIS, x, y, Math.cos(a) * s, Math.sin(a) * s, U.rand(0.6, 1.2), U.rand(2, 4.5), color);
        if (p) {
          p.drag = 1.4; p.rot = Math.random() * U.TAU; p.vr = U.rand(-12, 12);
          if (rocks && Math.random() < 0.55) p.spr = 'fx_rock' + (1 + Math.floor(Math.random() * rocks));
        }
      }
    },
    ring(x, y, r0, r1, color, dur, width) {
      if (this.rings.length > 40) this.rings.shift();
      this.rings.push({ x, y, r0, r1, color, life: dur, max: dur, w: width || 3 });
    },
    // взрыв: size ~ 1 (малый) … 4 (босс)
    // o: { kind: 'crit' — огненный с кольцами (элита), 'kill' — с электрическими разрядами (мини-боссы),
    //      'ship' — корабль разлетается на обломки, 'plasma' — удар плазмы, 'super' — гибель игрока,
    //      'boss' — финальный взрыв босса; hue — перекраска }
    explode(x, y, size, color, o) {
      size = size || 1;
      const g = G(), S = g.S;
      const kind = o && o.kind;
      const base = kind === 'kill' || size >= 2.5 ? 'fx_ex_kill' : size >= 1.5 ? 'fx_ex_l' : size >= 0.95 ? 'fx_ex_m' : 'fx_ex_s';
      let name = kind === 'crit' ? 'fx_ex_crit' : kind === 'plasma' ? 'fx_hit_plasma' : kind === 'super' ? 'fx_superblast' : kind === 'boss' ? 'fx_superex'
        : kind === 'ship' ? (size >= 1.5 ? 'fx_kd_l' : size >= 0.95 ? 'fx_kd_m' : 'fx_kd_s') : base;
      // кадр из позднего атласа ещё не скачан — обычный взрыв
      if (!g.frames[name] || !g.src(g.frames[name])) name = base;
      if (g.frames[name]) {
        const hue = o && o.hue;
        this.expl.push({ x, y, life: 0, dur: 0.36 + size * 0.07, w: (44 + size * 30) * S * (kind ? 1.15 : 1), rot: Math.random() * U.TAU, name, cv: hue == null ? null : g.tinted(name, { hue }) });
      } else {
        this.expl.push({ x, y, life: 0, dur: 0.42 + size * 0.08, w: (58 + size * 34) * S, rot: Math.random() * U.TAU });
      }
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
      t.cv = null;
      this.texts.push(t);
    },
    // надпись рисуется в маленький холст один раз и дальше копируется: обводка и заливка текста на холсте —
    // одна из самых дорогих операций, а числа урона сильно повторяются
    textCanvas(str, color, size) {
      const dpr = G().dpr;
      if (this._tcDpr !== dpr) { this._tc.clear(); this._tcDpr = dpr; }
      const key = size + '|' + color + '|' + str;
      let c = this._tc.get(key);
      if (c) return c;
      const font = '900 ' + size + 'px Orbitron, Rajdhani, sans-serif';
      const m = this._mx || (this._mx = document.createElement('canvas').getContext('2d'));
      m.font = font;
      const tw = Math.ceil(m.measureText(str).width) + 8, th = Math.ceil(size * 1.5) + 6;
      c = document.createElement('canvas');
      c.width = Math.ceil(tw * dpr); c.height = Math.ceil(th * dpr);
      c.tw = tw; c.th = th;
      const x = c.getContext('2d');
      x.scale(dpr, dpr);
      x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
      x.lineWidth = 3.5; x.strokeStyle = 'rgba(0,0,10,.85)'; x.strokeText(str, tw / 2, th / 2);
      x.fillStyle = color; x.fillText(str, tw / 2, th / 2);
      if (this._tc.size >= 160) this._tc.delete(this._tc.keys().next().value);
      this._tc.set(key, c);
      return c;
    },
    // спрайт листа эффектов: ширина растёт от w0 до w1, после доли hold — затухание
    // o: { w0, w1, dur, hue, rot, vr, alpha, hold, fadeIn, vy, sy — сжатие по вертикали, follow — объект с x/y, ox, oy,
    //      minor — не рисовать на слабом качестве }
    sprite(name, x, y, o) {
      const g = G();
      if (!g.frames[name] || (o.minor && this.quality === 0)) return null;
      if (this.sprites.length > 50) this.sprites.shift();
      const s = { name, x, y, w0: o.w0, w1: o.w1 == null ? o.w0 : o.w1, dur: o.dur || 0.5, life: 0, rot: o.rot || 0, vr: o.vr || 0,
        a: o.alpha == null ? 1 : o.alpha, hold: o.hold == null ? 0.35 : o.hold, fadeIn: o.fadeIn || 0, vy: o.vy || 0, sy: o.sy || 1,
        follow: o.follow || null, ox: o.ox || 0, oy: o.oy || 0, cv: o.hue == null ? null : g.tinted(name, { hue: o.hue }) };
      this.sprites.push(s);
      return s;
    },
    // портал: open — раскрывается (появление), иначе схлопывается (исчезновение)
    portal(x, y, w, color, open) {
      const hue = color ? G().hueOf(color) : null;
      if (open) this.sprite('fx_portal_out', x, y, { w0: w * 0.25, w1: w, dur: 0.5, hold: 0.55, hue });
      else this.sprite('fx_portal_in', x, y, { w0: w, w1: w * 0.15, dur: 0.4, hold: 0.5, hue });
    },
    // мягкая цветная виньетка по краям экрана (урон, тревога босса, заморозка) — плавный градиент,
    // а не растянутый на весь экран спрайт
    vigCanvas(color) {
      const W = G().W, H = G().H, key = color + W + 'x' + H;
      if (this._vig[key]) return this._vig[key];
      const c = document.createElement('canvas');
      c.width = Math.max(2, Math.round(W / 3)); c.height = Math.max(2, Math.round(H / 3));
      const x = c.getContext('2d'), cx = c.width / 2, cy = c.height / 2;
      x.scale(1, c.height / c.width);
      const g = x.createRadialGradient(cx, cx, c.width * 0.42, cx, cx, c.width * 0.5 * Math.hypot(1, c.height / c.width) * 1.02);
      g.addColorStop(0, G().hexA(color, 0)); g.addColorStop(0.55, G().hexA(color, 0.22)); g.addColorStop(1, G().hexA(color, 0.75));
      x.fillStyle = g; x.fillRect(0, 0, c.width, c.width);
      this._vig[key] = c;
      return c;
    },
    vignette(color, dur, alpha, pulse) {
      for (const s of this.scr) if (s.color === color) { s.life = 0; s.dur = dur; s.a = Math.max(s.a, alpha); s.pulse = !!pulse; return; }
      this.scr.push({ color, life: 0, dur, a: alpha, pulse: !!pulse });
    },
    drawScreen(ctx, W, H) {
      if (!this.scr.length) return;
      ctx.globalCompositeOperation = 'lighter';
      for (const s of this.scr) {
        const k = s.life / s.dur;
        ctx.globalAlpha = s.a * (s.pulse ? 0.45 + 0.55 * Math.abs(Math.sin(s.life * 5)) : 1) * (k < 0.12 ? k / 0.12 : 1 - Math.max(0, k - 0.45) / 0.55);
        ctx.drawImage(this.vigCanvas(s.color), 0, 0, W, H);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
    // снежинка инея: медленно падает и гаснет (заморозка)
    frost(x, y) {
      const p = this._p(P_EMBER, x, y, U.rand(-12, 12), U.rand(25, 55), U.rand(1.4, 2.4), U.rand(2.2, 3.6), Math.random() < 0.5 ? '#e6fbff' : '#9be8ff');
      if (p) p.drag = 0.3;
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
      for (let i = this.sprites.length - 1; i >= 0; i--) {
        const s = this.sprites[i];
        s.life += dt;
        if (s.life >= s.dur) { this.sprites.splice(i, 1); continue; }
        s.rot += s.vr * dt; s.oy += s.vy * dt;
      }
      for (let i = this.scr.length - 1; i >= 0; i--) { const s = this.scr[i]; s.life += dt; if (s.life >= s.dur) this.scr.splice(i, 1); }
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
          if (p.spr) { g.draw(ctx, p.spr, p.x, p.y, p.size * 3.4, p.rot); continue; }
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
        if (e.name) {
          // один кадр листа: быстро раздувается, во второй половине гаснет
          ctx.globalAlpha = k < 0.45 ? 1 : (1 - k) / 0.55;
          const w = e.w * (0.45 + 0.75 * U.easeOutCubic(k));
          if (e.cv) g.drawCanvas(ctx, e.cv, e.x, e.y, w, e.rot); else g.draw(ctx, e.name, e.x, e.y, w, e.rot);
          continue;
        }
        const fi = Math.min(4, Math.floor(k * 5));
        const w = e.w * (0.75 + k * 0.45);
        ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
        g.draw(ctx, 'ex' + (fi + 1), e.x, e.y, w, e.rot);
      }
      for (const s of this.sprites) {
        const k = s.life / s.dur;
        const fade = k < s.fadeIn ? k / s.fadeIn : k > s.hold ? 1 - (k - s.hold) / (1 - s.hold) : 1;
        ctx.globalAlpha = s.a * Math.max(0, fade);
        const w = s.w0 + (s.w1 - s.w0) * U.easeOutCubic(k);
        const x = (s.follow ? s.follow.x : s.x) + s.ox, y = (s.follow ? s.follow.y : s.y) + s.oy;
        if (s.sy !== 1) { ctx.save(); ctx.translate(x, y); ctx.scale(1, s.sy); }
        const dx = s.sy !== 1 ? 0 : x, dy = s.sy !== 1 ? 0 : y;
        if (s.cv) g.drawCanvas(ctx, s.cv, dx, dy, w, s.rot); else g.draw(ctx, s.name, dx, dy, w, s.rot);
        if (s.sy !== 1) ctx.restore();
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
      for (const t of this.texts) {
        const k = t.life / t.max;
        const pop = k > 0.85 ? 1 + (k - 0.85) * 2.5 : 1;
        const c = t.cv || (t.cv = this.textCanvas(t.s, t.c, t.size));
        const w = c.tw * pop, h = c.th * pop;
        ctx.globalAlpha = Math.min(1, k * 2.2);
        ctx.drawImage(c, t.x - w / 2, t.y - h / 2, w, h);
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

  // шрифт догрузился — новые надписи рисуются им, а не запасным
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => fx._tc.clear());

  SS.fx = fx;
})();
