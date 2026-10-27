// ════════════════════════════════════════════════════════════════
// SPACE SHOOTER 2.0 — ядро: пространство имён, утилиты, события
// ════════════════════════════════════════════════════════════════
'use strict';

window.SS = window.SS || {};
SS.VERSION = '3.0.0';

(function () {
  const TAU = Math.PI * 2;

  const U = {
    TAU,
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    invLerp: (a, b, v) => (v - a) / (b - a),
    rand: (a = 0, b = 1) => a + Math.random() * (b - a),
    randi: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    chance: (p) => Math.random() < p,
    pick: (arr) => arr[(Math.random() * arr.length) | 0],
    sign: (v) => (v < 0 ? -1 : 1),
    dist: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
    dist2: (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; },
    angle: (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax),
    approach: (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target)),
    // экспоненциальное сглаживание, не зависящее от частоты кадров
    damp: (v, target, k, dt) => target + (v - target) * Math.exp(-k * dt),
    easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
    easeInCubic: (t) => t * t * t,
    easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    easeOutBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    angleDiff: (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; },

    // взвешенный случайный выбор: items — массив, w(item) -> вес
    pickWeighted(items, w) {
      let total = 0;
      for (const it of items) total += Math.max(0, w(it));
      if (total <= 0) return items[0];
      let r = Math.random() * total;
      for (const it of items) { r -= Math.max(0, w(it)); if (r <= 0) return it; }
      return items[items.length - 1];
    },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [arr[i], arr[j]] = [arr[j], arr[i]]; }
      return arr;
    },

    // расстояние от точки до отрезка (квадрат) — для «стреловидных» столкновений
    segDist2(px, py, ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay;
      const l2 = dx * dx + dy * dy;
      let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = ax + dx * t - px, cy = ay + dy * t - py;
      return cx * cx + cy * cy;
    },

    // 12 345 → «12 345»
    fmt(n) {
      n = Math.floor(n || 0);
      const s = String(Math.abs(n));
      let out = '';
      for (let i = 0; i < s.length; i++) {
        if (i && (s.length - i) % 3 === 0) out += ' ';
        out += s[i];
      }
      return n < 0 ? '−' + out : out;
    },
    // компактно: 12.3К, 4.5М
    fmtShort(n) {
      n = Math.floor(n || 0);
      if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.0', '') + 'М';
      if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace('.0', '') + 'К';
      return U.fmt(n);
    },
    fmtTime(sec) {
      sec = Math.max(0, Math.floor(sec));
      const m = Math.floor(sec / 60), s = sec % 60;
      if (m >= 60) return Math.floor(m / 60) + 'ч ' + (m % 60) + 'м';
      return m + ':' + String(s).padStart(2, '0');
    },
    // склонение: plural(5, 'монета','монеты','монет')
    plural(n, one, few, many) {
      n = Math.abs(n) % 100;
      const n1 = n % 10;
      if (n > 10 && n < 20) return many;
      if (n1 > 1 && n1 < 5) return few;
      if (n1 === 1) return one;
      return many;
    },
    today() {
      const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    },
    // дата по UTC — одна и та же у всех игроков в мире (испытание дня)
    todayUTC() { return new Date().toISOString().slice(0, 10); },
    daysBetween(a, b) {
      const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
      const da = Date.UTC(pa[0], pa[1] - 1, pa[2]), db = Date.UTC(pb[0], pb[1] - 1, pb[2]);
      return Math.round((db - da) / 86400000);
    },
    // детерминированный генератор (для ежедневных заданий одинаковых в течение дня)
    seeded(seed) {
      let s = seed >>> 0 || 1;
      return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
    },
    hashStr(str) {
      let h = 2166136261;
      for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
      return h >>> 0;
    },
    escape(str) {
      return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },
    $(sel, root) { return (root || document).querySelector(sel); },
    $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); },
    icon(name, cls) { return '<svg' + (cls ? ' class="' + cls + '"' : '') + '><use href="#i-' + name + '"/></svg>'; },
    now: () => performance.now(),
  };
  SS.util = U;

  // ── Шина событий: модули общаются без жёстких связей ──
  const listeners = {};
  SS.on = (evt, fn) => { (listeners[evt] = listeners[evt] || []).push(fn); return fn; };
  SS.off = (evt, fn) => { const l = listeners[evt]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } };
  SS.emit = (evt, a, b, c) => {
    const l = listeners[evt];
    if (!l) return;
    for (let i = 0; i < l.length; i++) {
      try { l[i](a, b, c); } catch (e) { console.error('[SS] событие ' + evt + ':', e); }
    }
  };

  // ── Пул объектов: без мусора в горячем цикле ──
  SS.Pool = class Pool {
    constructor(factory) { this.factory = factory; this.free = []; }
    get() { return this.free.length ? this.free.pop() : this.factory(); }
    put(o) { if (this.free.length < 2000) this.free.push(o); }
  };

  // ── Режим разработчика: только по параметру в адресе ──
  try {
    const p = new URLSearchParams(location.search);
    SS.DEV = p.has((window.SS_CONFIG && SS_CONFIG.DEV_PARAM) || 'dev');
  } catch (e) { SS.DEV = false; }
})();
