// ════════════════════════════════════════════════════════════════
// SPACE SHOOTER 2.0 — графика
//  • атлас спрайтов (пиксель-арт) + перекраска без чтения пикселей (режим смешивания 'hue')
//  • текстуры свечения, процедурные спрайты (монеты, кристаллы, ракеты, мины, иконки)
//  • фон: небо сектора, туманности, планеты, 3 слоя звёзд, гиперпрыжок
// ════════════════════════════════════════════════════════════════
'use strict';

(function () {
  const U = SS.util, D = SS.data;
  const ATLAS = window.SS_ATLAS || { frames: {}, nozzles: {} };

  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  const gfx = {
    img: null, img2: null, lateFailed: false,
    frames: ATLAS.frames,
    nozzles: ATLAS.nozzles,
    W: 360, H: 640, dpr: 1, FX: 0, FW: 360, S: 1,
    _tint: {}, _white: {}, _glow: {}, _glowC: {}, _softC: {}, _proc: {}, _hue: {},

    // картинка атласа. Атлас — самый тяжёлый файл: качаем его потоком, чтобы полоса загрузки показывала
    // реальный прогресс, и распаковываем заранее, чтобы первый кадр не споткнулся. Если что-то
    // не поддерживается — обычная загрузка картинкой (WebP, затем PNG)
    fetchSheet(base, onProgress) {
      const plain = () => new Promise((resolve) => {
        const img = new Image();
        let triedPng = false;
        img.onload = () => resolve(img);
        img.onerror = () => {
          if (!triedPng) { triedPng = true; img.src = base + '.png?v=' + SS.VERSION; }
          else resolve(null);
        };
        img.src = base + '.webp?v=' + SS.VERSION;
      });
      if (!window.fetch || !window.ReadableStream || !window.URL || !URL.createObjectURL) return plain();
      return (async () => {
        const res = await fetch(base + '.webp?v=' + SS.VERSION);
        if (!res.ok || !res.body) throw new Error('http ' + res.status);
        const total = +res.headers.get('Content-Length') || 0, reader = res.body.getReader(), parts = [];
        let got = 0;
        for (;;) {
          const r = await reader.read();
          if (r.done) break;
          parts.push(r.value); got += r.value.length;
          if (total && onProgress) onProgress(Math.min(0.97, got / total));
        }
        const url = URL.createObjectURL(new Blob(parts, { type: 'image/webp' }));
        const img = new Image();
        img.src = url;
        if (img.decode) await img.decode();
        else await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; });
        // ссылку на байты не освобождаем: при нехватке памяти браузер может заново распаковать картинку из неё
        return img;
      })().catch(() => plain());
    },
    // основной атлас — до показа меню; поздний (свои спрайты боссов, большие мини-боссы) — в фоне после него
    load(onProgress) {
      return this.fetchSheet('assets/sprites', onProgress).then((img) => {
        if (!img) { console.error('[gfx] атлас не загрузился'); return false; }
        this.img = img;
        onProgress && onProgress(1);
        this.fetchSheet('assets/sprites2').then((im) => { if (im) this.img2 = im; else this.lateFailed = true; });
        return true;
      });
    },
    // картинка атласа, в которой лежит кадр (null — поздний атлас ещё качается)
    src(f) { return f[5] ? this.img2 : this.img; },

    // габариты кадра
    frame(name) { return this.frames[name]; },
    aspect(name) { const f = this.frames[name]; return f ? f[3] / f[2] : 1; },

    // рисует кадр атласа по центру (x, y) шириной w
    draw(ctx, name, x, y, w, rot, alpha) {
      const f = this.frames[name], img = f && this.src(f);
      if (!img) return;
      const h = w * f[3] / f[2];
      if (alpha !== undefined) ctx.globalAlpha = alpha;
      if (rot) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
        ctx.drawImage(img, f[0], f[1], f[2], f[3], -w / 2, -h / 2, w, h);
        ctx.restore();
      } else {
        ctx.drawImage(img, f[0], f[1], f[2], f[3], x - w / 2, y - h / 2, w, h);
      }
      if (alpha !== undefined) ctx.globalAlpha = 1;
    },
    // аддитивные кадры (пули, взрывы) — режим 'lighter' выставляет вызывающий
    drawCanvas(ctx, c, x, y, w, rot) {
      const h = w * c.height / c.width;
      if (rot) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.drawImage(c, -w / 2, -h / 2, w, h); ctx.restore(); }
      else ctx.drawImage(c, x - w / 2, y - h / 2, w, h);
    },

    // ── Перекраска: hue — тон 0..360, sat/dark/bright — доп. обработка ──
    tinted(name, t) {
      if (!t || (t.hue == null && !t.sat && !t.dark && !t.bright)) return null;
      const key = name + '|' + t.hue + '|' + (t.sat || 0) + '|' + (t.dark || 0) + '|' + (t.bright || 0) + (t.alpha ? '|a' : '');
      if (this._tint[key]) return this._tint[key];
      const f = this.frames[name], img = f && this.src(f);
      if (!img) return null;
      const c = mk(f[2], f[3]), x = c.getContext('2d');
      if (!t.alpha) { x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height); }
      x.drawImage(img, f[0], f[1], f[2], f[3], 0, 0, f[2], f[3]);
      if (t.hue != null) { x.globalCompositeOperation = 'hue'; x.fillStyle = 'hsl(' + t.hue + ',100%,50%)'; x.fillRect(0, 0, c.width, c.height); }
      if (t.sat != null && t.sat !== 0) { x.globalCompositeOperation = 'saturation'; x.fillStyle = 'hsl(0,' + Math.round(t.sat * 100) + '%,50%)'; x.fillRect(0, 0, c.width, c.height); }
      if (t.dark) { x.globalCompositeOperation = 'multiply'; x.fillStyle = 'hsl(' + (t.hue || 0) + ',40%,' + Math.round((1 - t.dark) * 100) + '%)'; x.fillRect(0, 0, c.width, c.height); }
      if (t.bright) { x.globalCompositeOperation = 'screen'; x.fillStyle = 'rgba(255,255,255,' + t.bright + ')'; x.fillRect(0, 0, c.width, c.height); }
      // обычные спрайты и t.alpha (иконки на прозрачном фоне): возвращаем прозрачность;
      // аддитивные остаются на чёрном (рисуются через 'lighter')
      if (!f[4] || t.alpha) {
        x.globalCompositeOperation = 'destination-in';
        x.drawImage(img, f[0], f[1], f[2], f[3], 0, 0, f[2], f[3]);
      }
      this._tint[key] = c;
      return c;
    },
    // тон цвета '#rrggbb' в градусах — для перекраски эффектов под цвет врага или бонуса
    hueOf(hex) {
      if (this._hue[hex] !== undefined) return this._hue[hex];
      let h = 0;
      if (hex && hex[0] === '#') {
        let s = hex.slice(1);
        if (s.length === 3) s = s.split('').map((ch) => ch + ch).join('');
        const n = parseInt(s, 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
        const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
        if (d > 0) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h = Math.round((h * 60 + 360) % 360);
      }
      this._hue[hex] = h;
      return h;
    },
    // белый силуэт — вспышка при попадании (зависит только от прозрачности кадра)
    white(name) {
      if (this._white[name]) return this._white[name];
      const f = this.frames[name], img = f && this.src(f);
      if (!img) return null;
      const c = mk(f[2], f[3]), x = c.getContext('2d');
      x.drawImage(img, f[0], f[1], f[2], f[3], 0, 0, f[2], f[3]);
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      this._white[name] = c;
      return c;
    },
    // мягкое свечение заданного цвета
    glow(color, size) {
      size = size || 64;
      const m = this._glowC[color] || (this._glowC[color] = {});
      if (m[size]) return m[size];
      const c = mk(size, size), x = c.getContext('2d');
      const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.18, color);
      g.addColorStop(0.45, hexA(color, 0.35));
      g.addColorStop(1, hexA(color, 0));
      x.fillStyle = g; x.fillRect(0, 0, size, size);
      m[size] = c;
      return c;
    },
    // мягкий круг без белого ядра (дым, подсветка)
    soft(color, size) {
      size = size || 64;
      const m = this._softC[color] || (this._softC[color] = {});
      if (m[size]) return m[size];
      const c = mk(size, size), x = c.getContext('2d');
      const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, hexA(color, 1));
      g.addColorStop(0.5, hexA(color, 0.45));
      g.addColorStop(1, hexA(color, 0));
      x.fillStyle = g; x.fillRect(0, 0, size, size);
      m[size] = c;
      return c;
    },

    // ── Процедурные спрайты (рисуются один раз) ──
    proc(name) {
      if (this._proc[name]) return this._proc[name];
      const fn = PROC[name];
      const c = fn ? fn() : mk(4, 4);
      this._proc[name] = c;
      return c;
    },

    // иконка оружия для кнопок и арсенала
    weaponIcon(wid, size) {
      const key = 'wi_' + wid + size;
      if (this._proc[key]) return this._proc[key];
      const c = mk(size, size), x = c.getContext('2d');
      const s = size, cx = s / 2, cy = s / 2;
      const w = D.WEAPONS[wid];
      x.globalCompositeOperation = 'lighter';
      const sprite = (n, px, py, ww, rot) => { const f = this.frames[n], im = f && this.src(f); if (!im) return; const hh = ww * f[3] / f[2]; x.save(); x.translate(px, py); x.rotate(rot || 0); x.drawImage(im, f[0], f[1], f[2], f[3], -ww / 2, -hh / 2, ww, hh); x.restore(); };
      if (wid === 'laser') { sprite('pb_bolt_m', cx - s * 0.16, cy, s * 0.26); sprite('pb_bolt_m', cx + s * 0.16, cy, s * 0.26); }
      else if (wid === 'shotgun') { const t = this.tinted('pb_orb', { hue: 45, alpha: true }); if (t) for (let i = -2; i <= 2; i++) { const a = i * 0.32 - Math.PI / 2; x.drawImage(t, cx + Math.cos(a) * s * 0.3 - s * 0.1, cy + s * 0.12 + Math.sin(a) * s * 0.3 - s * 0.1, s * 0.2, s * 0.2); } }
      else if (wid === 'rocket') {
        x.globalCompositeOperation = 'source-over';
        if (this.frames.fx_rocket2) sprite('fx_rocket2', cx, cy, s * 0.34, 0.6);
        else { const r = this.proc('rocket'); x.save(); x.translate(cx, cy); x.rotate(0.6); x.drawImage(r, -s * 0.16, -s * 0.38, s * 0.32, s * 0.76); x.restore(); }
      }
      else if (wid === 'plasma') {
        const t = this.tinted(this.frames.fx_plasma2 ? 'fx_plasma2' : 'eb_fire', { hue: 305, alpha: true });
        if (t) { const tw = s * 0.84, th = tw * t.height / t.width; x.drawImage(t, cx - tw / 2, cy - th / 2, tw, th); }
      }
      else if (wid === 'lightning') { drawBolt(x, cx - s * 0.2, cy - s * 0.38, cx + s * 0.18, cy + s * 0.38, '#fff36b', s * 0.07); }
      else if (wid === 'arc') { x.strokeStyle = '#7ff6ff'; x.lineWidth = s * 0.07; x.shadowColor = '#7ff6ff'; x.shadowBlur = s * 0.15; x.lineCap = 'round'; for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(cx, cy + s * 0.3, s * (0.25 + i * 0.13), -Math.PI * 0.82, -Math.PI * 0.18); x.stroke(); } }
      else if (wid === 'darkmatter') {
        if (this.frames.fx_vortex) {
          sprite('fx_vortex', cx, cy, s * 0.82);
          x.globalCompositeOperation = 'source-over';
          x.drawImage(this.proc('voidcore'), cx - s * 0.14, cy - s * 0.14, s * 0.28, s * 0.28);
        } else { x.globalCompositeOperation = 'source-over'; const v = this.proc('vortex'); x.drawImage(v, cx - s * 0.42, cy - s * 0.42, s * 0.84, s * 0.84); }
      }
      if (!w) return c;
      this._proc[key] = c;
      return c;
    },
  };

  // ── Цвета ──
  function hexA(hex, a) {
    if (hex[0] !== '#') return hex;
    let h = hex.slice(1);
    if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
    const n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  gfx.hexA = hexA;

  // ломаная молния между двумя точками
  function drawBolt(x, x0, y0, x1, y1, color, width) {
    const segs = 7, pts = [[x0, y0]];
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      pts.push([U.lerp(x0, x1, t) + U.rand(-1, 1) * width * 2.2, U.lerp(y0, y1, t) + U.rand(-1, 1) * width]);
    }
    pts.push([x1, y1]);
    x.save();
    x.lineJoin = 'round'; x.lineCap = 'round';
    x.strokeStyle = color; x.lineWidth = width * 2.2; x.globalAlpha = 0.35;
    x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.stroke();
    x.globalAlpha = 1; x.strokeStyle = '#fff'; x.lineWidth = width * 0.8;
    x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.stroke();
    x.restore();
  }
  gfx.drawBolt = drawBolt;

  // ── Процедурные спрайты ──
  const PROC = {
    coin() {
      const s = 48, c = mk(s, s), x = c.getContext('2d');
      const g = x.createRadialGradient(s * 0.38, s * 0.32, 2, s / 2, s / 2, s / 2);
      g.addColorStop(0, '#fff7c2'); g.addColorStop(0.35, '#ffd23d'); g.addColorStop(0.85, '#e09a12'); g.addColorStop(1, '#8a5a06');
      x.fillStyle = g; x.beginPath(); x.arc(s / 2, s / 2, s / 2 - 2, 0, U.TAU); x.fill();
      x.strokeStyle = '#a86d08'; x.lineWidth = 2.5; x.beginPath(); x.arc(s / 2, s / 2, s * 0.34, 0, U.TAU); x.stroke();
      x.fillStyle = '#b97a0a';
      x.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? s * 0.11 : s * 0.24; x.lineTo(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r); }
      x.closePath(); x.fill();
      x.fillStyle = 'rgba(255,255,255,.55)'; x.beginPath(); x.ellipse(s * 0.36, s * 0.3, s * 0.12, s * 0.06, -0.6, 0, U.TAU); x.fill();
      return c;
    },
    // энергоблок молнии: ячейка с разрядом
    energy() {
      const w = 28, h = 36, c = mk(w, h), x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#fffbd0'); g.addColorStop(0.45, '#ffe23d'); g.addColorStop(1, '#c98a06');
      x.fillStyle = '#6b5000'; x.fillRect(9, 0, 10, 5);
      x.beginPath(); x.moveTo(7, 4); x.arcTo(26, 4, 26, 35, 5); x.arcTo(26, 35, 2, 35, 5); x.arcTo(2, 35, 2, 4, 5); x.arcTo(2, 4, 26, 4, 5); x.closePath();
      x.fillStyle = g; x.fill();
      x.strokeStyle = '#7a5600'; x.lineWidth = 2; x.stroke();
      x.fillStyle = '#fff';
      x.beginPath(); x.moveTo(16, 8); x.lineTo(8, 21); x.lineTo(13, 21); x.lineTo(11, 31); x.lineTo(20, 17); x.lineTo(15, 17); x.lineTo(17, 8); x.closePath(); x.fill();
      return c;
    },
    xp() {
      const s = 40, c = mk(s, s), x = c.getContext('2d');
      x.shadowColor = '#3dffa2'; x.shadowBlur = 10;
      const g = x.createLinearGradient(0, 0, s, s);
      g.addColorStop(0, '#d8ffec'); g.addColorStop(0.5, '#3dffa2'); g.addColorStop(1, '#0d9a5c');
      x.fillStyle = g;
      x.beginPath(); x.moveTo(s / 2, 4); x.lineTo(s - 9, s / 2); x.lineTo(s / 2, s - 4); x.lineTo(9, s / 2); x.closePath(); x.fill();
      x.shadowBlur = 0; x.fillStyle = 'rgba(255,255,255,.7)';
      x.beginPath(); x.moveTo(s / 2, 8); x.lineTo(s * 0.62, s / 2); x.lineTo(s / 2, s / 2 - 2); x.closePath(); x.fill();
      return c;
    },
    xpBig() {
      const s = 52, c = mk(s, s), x = c.getContext('2d');
      x.shadowColor = '#5cc8ff'; x.shadowBlur = 14;
      const g = x.createLinearGradient(0, 0, s, s);
      g.addColorStop(0, '#f0fbff'); g.addColorStop(0.5, '#5cc8ff'); g.addColorStop(1, '#6b3dff');
      x.fillStyle = g;
      x.beginPath(); x.moveTo(s / 2, 4); x.lineTo(s - 10, s * 0.38); x.lineTo(s - 14, s - 8); x.lineTo(14, s - 8); x.lineTo(10, s * 0.38); x.closePath(); x.fill();
      x.shadowBlur = 0; x.fillStyle = 'rgba(255,255,255,.65)';
      x.beginPath(); x.moveTo(s / 2, 8); x.lineTo(s * 0.64, s * 0.38); x.lineTo(s / 2, s * 0.5); x.closePath(); x.fill();
      return c;
    },
    rocket() {
      const w = 20, h = 46, c = mk(w, h), x = c.getContext('2d');
      x.fillStyle = '#5a6b8c'; // стабилизаторы
      x.beginPath(); x.moveTo(1, h - 6); x.lineTo(w / 2 - 3, h - 20); x.lineTo(w / 2 - 3, h - 6); x.closePath(); x.fill();
      x.beginPath(); x.moveTo(w - 1, h - 6); x.lineTo(w / 2 + 3, h - 20); x.lineTo(w / 2 + 3, h - 6); x.closePath(); x.fill();
      const g = x.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, '#9aa8c4'); g.addColorStop(0.45, '#f2f6ff'); g.addColorStop(1, '#7d8bab');
      x.fillStyle = g; x.beginPath(); x.roundRect ? x.roundRect(w / 2 - 4, 8, 8, h - 14, 3) : x.rect(w / 2 - 4, 8, 8, h - 14); x.fill();
      x.fillStyle = '#ff4d3d'; x.beginPath(); x.moveTo(w / 2 - 4, 10); x.quadraticCurveTo(w / 2, -2, w / 2 + 4, 10); x.closePath(); x.fill();
      x.fillStyle = '#ff9f3d'; x.fillRect(w / 2 - 4, 20, 8, 3);
      return c;
    },
    mine() {
      const s = 36, c = mk(s, s), x = c.getContext('2d');
      x.strokeStyle = '#ff5c5c'; x.lineWidth = 3; x.lineCap = 'round';
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; x.beginPath(); x.moveTo(s / 2 + Math.cos(a) * 8, s / 2 + Math.sin(a) * 8); x.lineTo(s / 2 + Math.cos(a) * 16, s / 2 + Math.sin(a) * 16); x.stroke(); }
      const g = x.createRadialGradient(s * 0.42, s * 0.4, 1, s / 2, s / 2, 11);
      g.addColorStop(0, '#ffb3b3'); g.addColorStop(0.5, '#d22b3d'); g.addColorStop(1, '#5c0a14');
      x.fillStyle = g; x.beginPath(); x.arc(s / 2, s / 2, 11, 0, U.TAU); x.fill();
      return c;
    },
    vortex() {
      const s = 64, c = mk(s, s), x = c.getContext('2d');
      const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, '#000'); g.addColorStop(0.32, '#1a0533'); g.addColorStop(0.55, 'rgba(176,107,255,.85)'); g.addColorStop(0.75, 'rgba(110,40,220,.35)'); g.addColorStop(1, 'rgba(110,40,220,0)');
      x.fillStyle = g; x.fillRect(0, 0, s, s);
      x.strokeStyle = 'rgba(220,190,255,.7)'; x.lineWidth = 2;
      for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(s / 2, s / 2, s * (0.2 + i * 0.07), i * 2, i * 2 + 2.2); x.stroke(); }
      x.fillStyle = '#000'; x.beginPath(); x.arc(s / 2, s / 2, s * 0.13, 0, U.TAU); x.fill();
      return c;
    },
    // тёмное ядро тёмной материи и чёрной дыры, подложка под корпус мины
    voidcore() {
      const s = 64, c = mk(s, s), x = c.getContext('2d');
      const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(4,0,12,.92)'); g.addColorStop(1, 'rgba(10,0,30,0)');
      x.fillStyle = g; x.fillRect(0, 0, s, s);
      return c;
    },
    // значки бонусов, которых нет в листе (в том же стиле шестиугольных медалей)
    pu_bomb() { return badge('#ff8a3d', (x, s) => { x.fillStyle = '#2b2f3a'; x.beginPath(); x.arc(s * 0.47, s * 0.55, s * 0.19, 0, U.TAU); x.fill(); x.strokeStyle = '#ff8a3d'; x.lineWidth = s * 0.05; x.beginPath(); x.moveTo(s * 0.58, s * 0.4); x.quadraticCurveTo(s * 0.66, s * 0.26, s * 0.74, s * 0.3); x.stroke(); x.fillStyle = '#ffe07a'; x.beginPath(); x.arc(s * 0.75, s * 0.29, s * 0.05, 0, U.TAU); x.fill(); x.fillStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.arc(s * 0.41, s * 0.49, s * 0.05, 0, U.TAU); x.fill(); }); },
    pu_magnet() { return badge('#ff5cb3', (x, s) => { x.lineWidth = s * 0.12; x.strokeStyle = '#ff5cb3'; x.beginPath(); x.arc(s / 2, s * 0.5, s * 0.17, Math.PI, 0, true); x.stroke(); x.strokeStyle = '#e6ecff'; x.beginPath(); x.moveTo(s * 0.33, s * 0.32); x.lineTo(s * 0.33, s * 0.4); x.moveTo(s * 0.67, s * 0.32); x.lineTo(s * 0.67, s * 0.4); x.stroke(); }); },
    pu_freeze() { return badge('#9be8ff', (x, s) => { x.strokeStyle = '#d9f6ff'; x.lineWidth = s * 0.05; x.lineCap = 'round'; for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; x.beginPath(); x.moveTo(s / 2 + Math.cos(a) * s * 0.22, s / 2 + Math.sin(a) * s * 0.22); x.lineTo(s / 2 - Math.cos(a) * s * 0.22, s / 2 - Math.sin(a) * s * 0.22); x.stroke(); } x.fillStyle = '#9be8ff'; x.beginPath(); x.arc(s / 2, s / 2, s * 0.06, 0, U.TAU); x.fill(); }); },
  };

  // ── 4.1: сундуки — космические грузовые контейнеры, пиксель-арт в стиле листов (пока нет нарисованных):
  //    корпус и крышка отдельно, крышка раскрывается двумя створками (тряска, открытие — в сценах).
  //    Рисуется в «больших пикселях» и увеличивается без сглаживания ──
  const CHEST_PAL = {
    bronze: { hull: '#4a3a33', hullL: '#6b5447', hullD: '#2a201d', trim: '#d0894a', trimL: '#ffc58a', trimD: '#7a4a22', neon: '#ff9a4d' },
    silver: { hull: '#34405a', hullL: '#52648c', hullD: '#1e2638', trim: '#b9c6de', trimL: '#ffffff', trimD: '#66749a', neon: '#3de0ff' },
    gold:   { hull: '#2e2244', hullL: '#4a3870', hullD: '#181026', trim: '#ffc83d', trimL: '#fff1a6', trimD: '#a8700c', neon: '#ff4df0' },
  };
  const HAZARD = ['#ffc83d', '#1b1622'];
  const PX = 4;   // экранных пикселей в одном «пикселе» рисунка
  function pixelArt(w, h, paint) {
    const c = mk(w + 2, h + 2), x = c.getContext('2d');
    paint((px, py, pw, ph, col) => { x.fillStyle = col; x.fillRect(px + 1, py + 1, pw, ph); });
    // тёмный контур в 1 пиксель — силуэт, сдвинутый в 4 стороны
    const o = mk(w + 2, h + 2), ox = o.getContext('2d');
    for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ox.drawImage(c, d[0], d[1]);
    ox.globalCompositeOperation = 'source-in'; ox.fillStyle = '#0b0a18'; ox.fillRect(0, 0, o.width, o.height);
    ox.globalCompositeOperation = 'source-over'; ox.drawImage(c, 0, 0);
    const big = mk(o.width * PX, o.height * PX), bx = big.getContext('2d');
    bx.imageSmoothingEnabled = false; bx.drawImage(o, 0, 0, big.width, big.height);
    return big;
  }
  gfx.chest = function (tier) {
    const key = 'chest_' + tier;
    if (this._proc[key]) return this._proc[key];
    const P = CHEST_PAL[tier] || CHEST_PAL.bronze, gold = tier === 'gold', silver = tier === 'silver';
    const body = pixelArt(32, 16, (r) => {
      // проём под створками (виден, когда они раскрыты): изнутри светится цветом сундука
      r(1, 0, 30, 2, P.hullD); r(3, 1, 26, 1, P.neon);
      // корпус и верхний обод
      r(0, 2, 32, 13, P.hull);
      r(0, 2, 32, 1, P.trimL); r(0, 3, 32, 1, P.trim); r(3, 4, 26, 1, P.hullL);
      // вентиляционные щели
      for (const vx of [5, 22]) for (const vy of [5, 7]) r(vx, vy, 5, 1, P.hullD);
      // неоновая полоса и тень под ней
      r(3, 9, 26, 1, P.neon); r(3, 10, 26, 1, P.hullD);
      // жёлто-чёрная разметка груза
      for (let y = 11; y < 13; y++) for (let x = 3; x < 29; x++) r(x, y, 1, 1, HAZARD[((x + y) >> 1) & 1]);
      // замок: тёмный экран со световым индикатором и кнопками
      r(12, 4, 8, 7, P.trimD); r(13, 5, 6, 4, '#0a0d18'); r(14, 6, 4, 1, P.neon); r(14, 7, 1, 1, P.trimL); r(17, 7, 1, 1, P.trimL);
      // рёбра жёсткости по бокам, заклёпки
      for (const bx of [0, 29]) { r(bx, 2, 3, 13, P.trim); r(bx, 2, 1, 13, P.trimL); r(bx + 2, 3, 1, 12, P.trimD); r(bx + 1, 6, 1, 1, P.trimD); r(bx + 1, 11, 1, 1, P.trimD); }
      // основание и опоры
      r(0, 13, 32, 1, P.trim); r(0, 14, 32, 1, P.trimD);
      r(1, 15, 5, 1, P.trimD); r(26, 15, 5, 1, P.trimD);
      if (gold || silver) { r(8, 9, 1, 1, '#fff'); r(23, 9, 1, 1, '#fff'); }
    });
    const lid = pixelArt(32, 11, (r) => {
      // ручка (делится пополам вместе со створками)
      r(11, 0, 10, 1, P.trimL); r(11, 1, 2, 1, P.trimD); r(19, 1, 2, 1, P.trimD);
      // скошенный верх и панель
      r(2, 2, 28, 1, P.trimL); r(1, 3, 30, 1, P.trim); r(0, 4, 32, 5, P.hull);
      r(3, 4, 26, 1, P.hullL); r(3, 6, 9, 1, P.hullD); r(20, 6, 9, 1, P.hullD);
      // огни по краям и эмблема-кристалл посередине
      r(4, 7, 1, 1, P.neon); r(27, 7, 1, 1, P.neon);
      r(15, 4, 2, 1, P.neon); r(14, 5, 4, 2, P.neon); r(15, 7, 2, 1, P.neon); r(15, 5, 1, 1, '#fff');
      // рёбра жёсткости, как на корпусе
      for (const bx of [0, 29]) { r(bx, 3, 3, 8, P.trim); r(bx, 3, 1, 8, P.trimL); r(bx + 2, 4, 1, 7, P.trimD); }
      // нижняя кромка: светящийся шов между крышкой и корпусом
      r(0, 9, 32, 1, P.trim); r(0, 10, 32, 1, P.trimD); r(3, 10, 26, 1, P.neon);
      if (gold) { r(6, 5, 1, 1, '#fff'); r(25, 5, 1, 1, '#fff'); }
    });
    // закрытый сундук целиком — для значков в окнах
    const icon = mk(body.width, body.height + lid.height - PX * 3), ix = icon.getContext('2d');
    ix.drawImage(body, 0, lid.height - PX * 3);
    ix.drawImage(lid, 0, 0);
    return (this._proc[key] = { body, lid, icon, PX, hinge: lid.height - PX * 3 });
  };
  // картинка сундука для HTML (<img>), с кэшем
  gfx.chestURL = function (tier) {
    const key = 'chestURL_' + tier;
    return this._proc[key] || (this._proc[key] = this.chest(tier).icon.toDataURL());
  };
  gfx.chestImg = function (tier, cls) { return '<img class="px-ico' + (cls ? ' ' + cls : '') + '" src="' + this.chestURL(tier) + '" alt="">'; };
  // сундук на холсте: центр (x, y), ширина w; open 0..1 — створки раскрываются, shake — дрожь крышки
  // возвращает { mouth } — y щели между крышкой и корпусом (оттуда бьёт свет)
  gfx.drawChest = function (ctx, tier, x, y, w, open, shake) {
    const c = this.chest(tier), k = w / c.body.width, bh = c.body.height * k, lh = c.lid.height * k;
    const top = y - (bh + c.hinge * k) / 2, by = top + c.hinge * k, pivot = top + lh;
    const sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(c.body, x - w / 2, by, w, bh);
    // крышка делится посередине: створки поворачиваются на петлях по внешним углам и встают «крыльями»
    const o = U.clamp(open || 0, 0, 1), e = 1 - Math.pow(1 - o, 3), lift = (shake || 0) * k * 3 + e * k * 4, hw = c.lid.width / 2;
    for (const sd of [-1, 1]) {
      ctx.save();
      ctx.translate(x + sd * w / 2, pivot - lift);
      ctx.rotate(sd * e * 1.15);
      ctx.drawImage(c.lid, sd < 0 ? 0 : hw, 0, hw, c.lid.height, sd < 0 ? 0 : -w / 2, -lh, w / 2, lh);
      ctx.restore();
    }
    ctx.imageSmoothingEnabled = sm;
    return { mouth: by + c.PX * k, top, bottom: by + bh };
  };

  function badge(color, drawIcon) {
    const s = 80, c = mk(s, s), x = c.getContext('2d');
    const hex = () => { x.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; x.lineTo(s / 2 + Math.cos(a) * s * 0.44, s / 2 + Math.sin(a) * s * 0.44); } x.closePath(); };
    x.shadowColor = color; x.shadowBlur = 8;
    hex();
    const g = x.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#2a3046'); g.addColorStop(1, '#0d1020');
    x.fillStyle = g; x.fill();
    x.shadowBlur = 0; x.lineWidth = s * 0.06; x.strokeStyle = color; x.stroke();
    // внутренний блик-обод
    x.save(); x.translate(s / 2, s / 2); x.scale(0.82, 0.82); x.translate(-s / 2, -s / 2);
    hex(); x.lineWidth = 2; x.strokeStyle = 'rgba(255,255,255,.14)'; x.stroke();
    x.restore();
    drawIcon(x, s);
    return c;
  }

  // ════════════════════════════════════════════════════════════
  // ФОН
  // ════════════════════════════════════════════════════════════
  function shrinkCanvas(c, k) {
    const o = mk(Math.max(2, Math.round(c.width * k)), Math.max(2, Math.round(c.height * k)));
    o.getContext('2d').drawImage(c, 0, 0, o.width, o.height);
    return o;
  }
  const bg = {
    sector: -1, layers: [], stars: [], dust: [], planet: null,
    feats: [], bright: [], comets: [], ships: [], cometT: 4, shipT: 6,
    warp: 0, scroll: 0, fade: 1, prev: null,

    init(sectorIdx) {
      this.setSector(sectorIdx, true);
      this.makeStars();
    },
    makeStars() {
      const W = gfx.W, H = gfx.H;
      const n = Math.round((W * H) / 5200);
      this.stars = [];
      for (let i = 0; i < n; i++) {
        const layer = i % 3;
        this.stars.push({ x: Math.random() * W, y: Math.random() * H, layer,
          s: layer === 0 ? U.rand(0.5, 1.1) : layer === 1 ? U.rand(0.9, 1.6) : U.rand(1.4, 2.4),
          a: layer === 0 ? U.rand(0.25, 0.5) : U.rand(0.45, 0.95), tw: U.rand(0, U.TAU), ts: U.rand(1, 3) });
      }
      this.dust = [];
      for (let i = 0; i < 26; i++) this.dust.push({ x: Math.random() * W, y: Math.random() * H, len: U.rand(10, 40), a: U.rand(0.05, 0.16) });
      // 4.0: несколько ярких звёзд с лучами — мерцают
      this.bright = [];
      for (let i = 0; i < 7; i++) this.bright.push({ x: Math.random() * W, y: Math.random() * H, s: U.rand(9, 18), ph: Math.random() * U.TAU, sp: U.rand(0.6, 1.6) });
    },
    // звезда с четырьмя лучами (рисуется один раз, дальше копируется)
    spike() {
      if (this._spike) return this._spike;
      const s = 64, c = mk(s, s), x = c.getContext('2d'), h = s / 2;
      const g = x.createRadialGradient(h, h, 0, h, h, h * 0.35);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, s, s);
      for (const [w, l] of [[1.6, h], [0.9, h * 0.6]]) {
        const lg = x.createLinearGradient(0, h, s, h);
        lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,.9)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = lg;
        x.fillRect(h - l, h - w / 2, l * 2, w);
        x.save(); x.translate(h, h); x.rotate(Math.PI / 2); x.fillRect(-l, -w / 2, l * 2, w); x.restore();
      }
      return (this._spike = c);
    },
    // 4.0: своя деталь вдали у каждого сектора (по порядку D.SECTORS)
    makeFeats(sec, idx) {
      const kinds = ['sun', 'rocks', 'galaxy', 'moons', 'giant', 'galaxy', 'blackhole', 'core', 'rocks', 'moons', 'rocks', 'sun', 'blackhole'];
      const kind = kinds[idx % kinds.length], W = gfx.W, H = gfx.H, out = [];
      const col = sec.neb[0], col2 = sec.neb[1];
      if (kind === 'sun' || kind === 'giant') {
        const giant = kind === 'giant', R = giant ? W * 0.9 : W * 0.12, s = Math.ceil(R * (giant ? 2.4 : 5)), c = mk(s, s), x = c.getContext('2d'), h = s / 2;
        const g = x.createRadialGradient(h, h, R * 0.2, h, h, h);
        g.addColorStop(0, giant ? 'rgba(255,120,70,.9)' : 'rgba(255,250,230,1)'); g.addColorStop(giant ? 0.4 : 0.12, giant ? 'rgba(255,60,40,.55)' : hexA(sec.star, 0.7));
        g.addColorStop(0.5, hexA(giant ? '#ff2d4d' : col, 0.12)); g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.fillRect(0, 0, s, s);
        if (giant) { x.globalAlpha = 0.18; for (let i = 0; i < 30; i++) { x.fillStyle = Math.random() < 0.5 ? '#ffb03d' : '#7a1020'; x.beginPath(); x.arc(h + U.rand(-R, R) * 0.4, h + U.rand(-R, R) * 0.4, U.rand(4, 20), 0, U.TAU); x.fill(); } }
        out.push({ c, x: giant ? W * 0.5 : W * U.rand(0.1, 0.9), y: giant ? H * 1.15 : H * 0.12, s, speed: 0.6, fixed: true });
      } else if (kind === 'blackhole') {
        const R = W * 0.16, s = Math.ceil(R * 5), c = mk(s, s), x = c.getContext('2d'), h = s / 2;
        const glow = x.createRadialGradient(h, h, R * 0.5, h, h, h);
        glow.addColorStop(0, hexA(col, 0.4)); glow.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = glow; x.fillRect(0, 0, s, s);
        // аккреционный диск — наклонное кольцо, ближняя часть ярче
        x.save(); x.translate(h, h); x.rotate(-0.35); x.scale(1, 0.32);
        for (let i = 0; i < 18; i++) { x.strokeStyle = hexA(i % 2 ? col2 : '#ffb03d', 0.12); x.lineWidth = R * 0.12; x.beginPath(); x.arc(0, 0, R * (1.15 + i * 0.05), 0, U.TAU); x.stroke(); }
        x.restore();
        x.fillStyle = '#000'; x.beginPath(); x.arc(h, h, R * 0.62, 0, U.TAU); x.fill();
        x.strokeStyle = hexA('#ffd9a0', 0.7); x.lineWidth = 2; x.beginPath(); x.arc(h, h, R * 0.66, 0, U.TAU); x.stroke();
        out.push({ c, x: W * U.rand(0.2, 0.8), y: H * 0.3, s, speed: 0.8, fixed: true, spin: 0 });
      } else if (kind === 'galaxy' || kind === 'core') {
        const R = W * (kind === 'core' ? 0.45 : 0.24), s = Math.ceil(R * 2.4), c = mk(s, s), x = c.getContext('2d'), h = s / 2;
        x.globalCompositeOperation = 'lighter';
        const core = x.createRadialGradient(h, h, 0, h, h, R * (kind === 'core' ? 0.7 : 0.35));
        core.addColorStop(0, 'rgba(255,245,220,.8)'); core.addColorStop(0.4, hexA(col, 0.35)); core.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = core; x.fillRect(0, 0, s, s);
        x.save(); x.translate(h, h); x.scale(1, 0.55); x.rotate(0.4);
        for (let arm = 0; arm < 2; arm++) for (let i = 0; i < 260; i++) {
          const t = i / 260, a = arm * Math.PI + t * 7, r = R * (0.08 + t * 0.9);
          x.fillStyle = hexA(i % 3 ? col : col2, 0.5 * (1 - t));
          x.fillRect(Math.cos(a) * r + U.rand(-6, 6), Math.sin(a) * r + U.rand(-6, 6), 2, 2);
        }
        x.restore();
        out.push({ c, x: W * U.rand(0.25, 0.75), y: -s / 2, s, speed: kind === 'core' ? 2 : 3 });
      } else if (kind === 'moons') {
        for (let i = 0; i < 2; i++) { const p = this.makePlanet(Object.assign({}, sec, { planet: sec.planet + 40 + i * 60 })); p.c = shrinkCanvas(p.c, 0.45 - i * 0.12); p.s = p.c.width; p.y = -p.s - H * (0.3 + i * 0.6); p.speed = 6 + i * 3; out.push(p); }
      } else if (kind === 'rocks') {
        // далёкие глыбы: тёмные многоугольники с подсветкой края
        for (let i = 0; i < 9; i++) {
          const r = U.rand(6, 18), s = Math.ceil(r * 2.6), c = mk(s, s), x = c.getContext('2d'), h = s / 2, n = 7;
          x.beginPath();
          for (let k = 0; k <= n; k++) { const a = k / n * U.TAU, rr = r * U.rand(0.7, 1); if (k) x.lineTo(h + Math.cos(a) * rr, h + Math.sin(a) * rr); else x.moveTo(h + Math.cos(a) * rr, h + Math.sin(a) * rr); }
          x.fillStyle = '#0d0f1c'; x.fill(); x.strokeStyle = hexA(col, 0.5); x.lineWidth = 1.2; x.stroke();
          out.push({ c, x: Math.random() * W, y: Math.random() * H, s, speed: U.rand(18, 30), rock: true });
        }
      }
      return out;
    },
    setSector(idx, instant) {
      const sec = D.SECTORS[((idx % D.SECTORS.length) + D.SECTORS.length) % D.SECTORS.length];
      if (this.sector === idx && this.layers.length) return;
      this.prev = instant ? null : { layers: this.layers, sky: this.sky, planet: this.planet };
      this.fade = instant ? 1 : 0;
      this.sector = idx;
      this.sec = sec;
      this.sky = this.makeSky(sec);
      this.layers = [this.makeNebula(sec, 0.5, 1), this.makeNebula(sec, 0.35, 2)];
      this.planet = this.makePlanet(sec);
      this.prevFeats = instant ? null : this.feats;
      this.feats = this.makeFeats(sec, ((idx % D.SECTORS.length) + D.SECTORS.length) % D.SECTORS.length);
    },
    makeSky(sec) {
      const c = mk(4, 256), x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, sec.sky[1]); g.addColorStop(0.55, sec.sky[0]); g.addColorStop(1, sec.sky[0]);
      x.fillStyle = g; x.fillRect(0, 0, 4, 256);
      return c;
    },
    // бесшовная по вертикали текстура туманности (низкое разрешение — она мягкая)
    makeNebula(sec, scale, seed) {
      const W = Math.ceil(gfx.W * scale), H = Math.ceil(gfx.H * scale);
      const c = mk(W, H), x = c.getContext('2d');
      x.globalCompositeOperation = 'lighter';
      const blobs = seed === 1 ? 11 : 7;
      for (let i = 0; i < blobs; i++) {
        const col = sec.neb[i % sec.neb.length];
        const r = U.rand(0.25, 0.6) * Math.max(W, H) * (seed === 1 ? 0.7 : 0.5);
        const bx = Math.random() * W, by = Math.random() * H;
        const a = seed === 1 ? U.rand(0.06, 0.14) : U.rand(0.04, 0.09);
        for (const oy of [-H, 0, H]) {
          const g = x.createRadialGradient(bx, by + oy, 0, bx, by + oy, r);
          g.addColorStop(0, hexA(col, a)); g.addColorStop(0.5, hexA(col, a * 0.45)); g.addColorStop(1, hexA(col, 0));
          x.fillStyle = g; x.fillRect(bx - r, by + oy - r, r * 2, r * 2);
        }
      }
      // тёмные пылевые прожилки
      x.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 6; i++) {
        const r = U.rand(0.1, 0.25) * W, bx = Math.random() * W, by = Math.random() * H;
        for (const oy of [-H, 0, H]) {
          const g = x.createRadialGradient(bx, by + oy, 0, bx, by + oy, r);
          g.addColorStop(0, 'rgba(0,0,0,.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
          x.fillStyle = g; x.fillRect(bx - r, by + oy - r, r * 2, r * 2);
        }
      }
      return { c, speed: seed === 1 ? 7 : 14 };
    },
    makePlanet(sec) {
      const R = Math.round(Math.min(gfx.W, 520) * U.rand(0.16, 0.26));
      const pad = R * 0.7, s = R * 2 + pad * 2;
      const c = mk(s, s), x = c.getContext('2d');
      const cx = s / 2, cy = s / 2, h = sec.planet;
      // атмосфера
      const atm = x.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.35);
      atm.addColorStop(0, 'hsla(' + h + ',90%,65%,.35)'); atm.addColorStop(1, 'hsla(' + h + ',90%,65%,0)');
      x.fillStyle = atm; x.beginPath(); x.arc(cx, cy, R * 1.35, 0, U.TAU); x.fill();
      // тело
      x.save(); x.beginPath(); x.arc(cx, cy, R, 0, U.TAU); x.clip();
      const body = x.createRadialGradient(cx - R * 0.4, cy - R * 0.4, R * 0.1, cx, cy, R * 1.1);
      body.addColorStop(0, 'hsl(' + h + ',55%,62%)'); body.addColorStop(0.5, 'hsl(' + (h + 12) + ',50%,36%)'); body.addColorStop(1, 'hsl(' + (h + 20) + ',45%,10%)');
      x.fillStyle = body; x.fillRect(cx - R, cy - R, R * 2, R * 2);
      x.globalAlpha = 0.16;
      for (let i = 0; i < 9; i++) {
        x.fillStyle = i % 2 ? 'hsl(' + (h - 10) + ',60%,75%)' : 'hsl(' + (h + 30) + ',40%,20%)';
        x.beginPath(); x.ellipse(cx, cy - R + (i + 0.5) * (R * 2 / 9), R * 1.2, R * U.rand(0.04, 0.09), U.rand(-0.08, 0.08), 0, U.TAU); x.fill();
      }
      x.globalAlpha = 1;
      // терминатор (тень)
      const sh = x.createRadialGradient(cx + R * 0.55, cy + R * 0.5, R * 0.2, cx + R * 0.3, cy + R * 0.3, R * 1.5);
      sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(0.4, 'rgba(0,0,0,.25)'); sh.addColorStop(1, 'rgba(0,0,0,.85)');
      x.fillStyle = sh; x.fillRect(cx - R, cy - R, R * 2, R * 2);
      x.restore();
      // кольца
      if (Math.random() < 0.55) {
        x.save(); x.translate(cx, cy); x.rotate(U.rand(-0.5, 0.5)); x.scale(1, 0.26);
        x.strokeStyle = 'hsla(' + (h + 25) + ',60%,70%,.45)'; x.lineWidth = R * 0.14;
        x.beginPath(); x.arc(0, 0, R * 1.5, Math.PI * 1.05, Math.PI * 1.95 + Math.PI); x.stroke();
        x.strokeStyle = 'hsla(' + (h + 40) + ',60%,80%,.25)'; x.lineWidth = R * 0.07;
        x.beginPath(); x.arc(0, 0, R * 1.75, 0, U.TAU); x.stroke();
        x.restore();
      }
      return { c, x: U.rand(0.1, 0.9) * gfx.W, y: -s * 0.6 - Math.random() * gfx.H * 0.5, s, speed: U.rand(9, 16) };
    },

    update(dt, speedMul) {
      const sp = (speedMul || 1) * (1 + this.warp * 14);
      this.scroll += dt * sp;
      if (this.fade < 1) { this.fade = Math.min(1, this.fade + dt * 0.6); if (this.fade >= 1) this.prev = null; }
      if (this.warp > 0) this.warp = Math.max(0, this.warp - dt * 0.55);
      const H = gfx.H, W = gfx.W;
      for (const st of this.stars) {
        st.y += (st.layer === 0 ? 14 : st.layer === 1 ? 34 : 70) * dt * sp;
        if (st.y > H + 4) { st.y -= H + 8; st.x = Math.random() * W; }
      }
      for (const d of this.dust) {
        d.y += 260 * dt * sp;
        if (d.y > H + d.len) { d.y = -d.len; d.x = Math.random() * W; }
      }
      const p = this.planet;
      if (p) {
        p.y += p.speed * dt * sp;
        if (p.y - p.s / 2 > H) { p.y = -p.s / 2 - H * U.rand(1.5, 3); p.x = U.rand(0.1, 0.9) * W; }
      }
      // 4.0: детали сектора, кометы и далёкие корабли
      for (const f of this.feats) {
        f.y += f.speed * dt * sp;
        if (f.y - f.s / 2 > H) { f.y = -f.s / 2 - (f.rock ? Math.random() * H * 0.5 : H * U.rand(1, 2)); if (f.rock) f.x = Math.random() * W; }
      }
      this.cometT -= dt;
      if (this.cometT <= 0) {
        this.cometT = U.rand(6, 13);
        const fromL = Math.random() < 0.5, a = fromL ? U.rand(0.35, 0.7) : Math.PI - U.rand(0.35, 0.7), v = U.rand(260, 420);
        this.comets.push({ x: fromL ? -30 : W + 30, y: U.rand(0.02, 0.4) * H, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 3, len: U.rand(60, 120) });
      }
      for (let i = this.comets.length - 1; i >= 0; i--) { const c = this.comets[i]; c.x += c.vx * dt; c.y += c.vy * dt; c.life -= dt; if (c.life <= 0) this.comets.splice(i, 1); }
      this.shipT -= dt;
      if (this.shipT <= 0 && gfx.img) {
        this.shipT = U.rand(10, 20);
        const spr = U.pick(['e_cruiser', 'e_heavyfighter', 'e_bombardier', 'interceptor', 'gunship']), n = U.randi(1, 3), up = Math.random() < 0.5;
        for (let i = 0; i < n; i++) this.ships.push({ spr, x: U.rand(0.15, 0.85) * W + i * 22, y: up ? H + 40 + i * 26 : -40 - i * 26, vy: (up ? -1 : 1) * U.rand(30, 45), w: U.rand(16, 26) });
      }
      for (let i = this.ships.length - 1; i >= 0; i--) { const s = this.ships[i]; s.y += s.vy * dt * (0.6 + sp * 0.4); if (s.y < -80 || s.y > H + 80) this.ships.splice(i, 1); }
    },

    // небо и туманности одного сектора
    drawLayerSet(ctx, set, alpha, quality) {
      const W = gfx.W, H = gfx.H;
      ctx.globalAlpha = alpha;
      ctx.drawImage(set.sky, 0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      // на слабом качестве — один слой туманности
      const n = quality >= 2 ? set.layers.length : 1;
      for (let li = 0; li < n; li++) {
        const L = set.layers[li];
        // плитка с полями из противоположного края: при сглаживании на стыке двух копий берётся настоящее
        // содержимое, а не прозрачность (иначе через весь экран шла тёмная горизонтальная линия)
        if (!L.cp) {
          const c = L.c, pd = 2, cp = mk(c.width, c.height + pd * 2), x = cp.getContext('2d');
          x.drawImage(c, 0, pd);
          x.drawImage(c, 0, c.height - pd, c.width, pd, 0, 0, c.width, pd);
          x.drawImage(c, 0, 0, c.width, pd, 0, c.height + pd, c.width, pd);
          L.cp = cp; L.pd = pd;
        }
        const off = (this.scroll * L.speed) % H, sw = L.c.width, sh = L.c.height;
        ctx.drawImage(L.cp, 0, L.pd, sw, sh, 0, off - H, W, H);
        ctx.drawImage(L.cp, 0, L.pd, sw, sh, 0, off, W, H);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    },
    // небо и туманности мягкие: их собираем в холст вдвое меньшего разрешения и растягиваем на экран одним
    // непрозрачным вызовом. Раньше это были три полноэкранные заливки с наложением в каждом кадре — самая
    // дорогая часть кадра для видеочипа телефона
    compose(quality) {
      const W = gfx.W, H = gfx.H, cw = Math.max(2, Math.ceil(W / 2)), ch = Math.max(2, Math.ceil(H / 2));
      if (!this.comp || this.comp.width !== cw || this.comp.height !== ch) {
        this.comp = mk(cw, ch);
        this.compX = this.comp.getContext('2d', { alpha: false });
      }
      const x = this.compX, cur = this.cur || (this.cur = {});
      cur.sky = this.sky; cur.layers = this.layers;
      x.setTransform(cw / W, 0, 0, ch / H, 0, 0);
      if (this.prev && this.fade < 1) this.drawLayerSet(x, this.prev, 1, quality);
      this.drawLayerSet(x, cur, this.prev ? this.fade : 1, quality);
      return this.comp;
    },
    // планета — поверх сборки в полном разрешении; за краем экрана не рисуется
    drawPlanet(ctx, p, a) {
      if (!p || a <= 0 || p.y + p.s / 2 < 0 || p.y - p.s / 2 > gfx.H) return;
      ctx.globalAlpha = a;
      ctx.drawImage(p.c, p.x - p.s / 2, p.y - p.s / 2);
      ctx.globalAlpha = 1;
    },

    draw(ctx, quality) {
      const W = gfx.W, H = gfx.H;
      const fading = this.prev && this.fade < 1;
      ctx.drawImage(this.compose(quality), 0, 0, W, H);
      // при смене сектора старая планета гаснет, новая проявляется
      if (fading) this.drawPlanet(ctx, this.prev.planet, 1 - this.fade);
      // 4.0: детали сектора (солнце, гигант, чёрная дыра, галактика, луны, глыбы)
      if (quality > 0) {
        if (fading && this.prevFeats) for (const f of this.prevFeats) this.drawPlanet(ctx, f, (1 - this.fade) * (f.rock ? 0.8 : 1));
        for (const f of this.feats) this.drawPlanet(ctx, f, (fading ? this.fade : 1) * (f.rock ? 0.8 : 1));
      }
      this.drawPlanet(ctx, this.planet, fading ? this.fade : 1);
      // звёзды
      const t = performance.now() / 1000;
      const col = this.sec ? this.sec.star : '#fff';
      ctx.fillStyle = col;
      const stretch = this.warp;
      for (const st of this.stars) {
        if (quality === 0 && st.layer === 0) continue;
        const tw = st.layer === 0 ? 1 : 0.65 + 0.35 * Math.sin(t * st.ts + st.tw);
        ctx.globalAlpha = st.a * tw;
        if (stretch > 0.05) {
          const len = st.s + stretch * (st.layer + 1) * 40;
          ctx.fillRect(st.x, st.y - len, st.s, len);
        } else {
          ctx.fillRect(st.x, st.y, st.s, st.s);
        }
      }
      // яркие звёзды с лучами, кометы и далёкие корабли
      if (quality > 0) {
        const sp = this.spike();
        ctx.globalCompositeOperation = 'lighter';
        for (const b of this.bright) {
          const k = 0.45 + 0.4 * Math.sin(t * b.sp + b.ph), s = b.s * (0.8 + 0.3 * k);
          ctx.globalAlpha = k;
          ctx.drawImage(sp, b.x - s, b.y - s, s * 2, s * 2);
        }
        for (const c of this.comets) {
          const a = Math.min(1, c.life), d = Math.hypot(c.vx, c.vy), tx = c.x - c.vx / d * c.len, ty = c.y - c.vy / d * c.len;
          const g = ctx.createLinearGradient(c.x, c.y, tx, ty);
          g.addColorStop(0, 'rgba(255,255,255,' + (0.9 * a).toFixed(2) + ')'); g.addColorStop(0.2, hexA(col, 0.5 * a)); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = 1; ctx.strokeStyle = g; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(tx, ty); ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
        for (const s of this.ships) {
          ctx.globalAlpha = 0.28;
          gfx.draw(ctx, s.spr, s.x, s.y, s.w, s.vy > 0 ? Math.PI : 0);
        }
        ctx.globalAlpha = 1;
      }
      // пыль скорости
      // только во время гиперпрыжка: в обычном полёте одиночные штрихи выглядели как царапины на экране,
      // а движение и так передают звёзды; у штриха затухающий хвост
      if (quality > 0 && stretch > 0.05) {
        ctx.fillStyle = '#9fc4ff';
        const k = Math.min(1, stretch * 3);
        for (const d of this.dust) {
          const len = d.len * (1 + stretch * 6);
          ctx.globalAlpha = d.a * 2.5 * k;
          ctx.fillRect(d.x, d.y - len * 0.4, 1, len * 0.4);
          ctx.globalAlpha = d.a * 1.1 * k;
          ctx.fillRect(d.x, d.y - len, 1, len * 0.6);
        }
      }
      ctx.globalAlpha = 1;
    },
  };
  gfx.bg = bg;

  SS.gfx = gfx;
})();
