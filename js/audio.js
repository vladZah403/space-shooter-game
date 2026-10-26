// ════════════════════════════════════════════════════════════════
// SPACE SHOOTER 2.0 — звук
//  • эффекты синтезируются один раз в OfflineAudioContext → буферы (дёшево играть)
//  • музыка — секвенсор с планированием по часам AudioContext (без «плавающего» ритма)
//  • 5 стилей, интенсивность растёт в бою и на боссах
// ════════════════════════════════════════════════════════════════
'use strict';

(function () {
  const U = SS.util;
  const AC = window.AudioContext || window.webkitAudioContext;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // ── Описание звуковых эффектов: длительность и построитель графа ──
  // b(ctx, out, noise) — планирует узлы в оффлайн-контексте
  function envGain(ctx, out, t0, a, d, peak, curve) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    if (curve === 'lin') g.gain.linearRampToValueAtTime(0.0001, t0 + a + d);
    else g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    g.connect(out);
    return g;
  }
  function tone(ctx, out, type, f0, f1, t0, dur, peak, a) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    o.connect(envGain(ctx, out, t0, a || 0.004, dur, peak));
    o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  }
  function noiseSrc(ctx, noise, out, t0, dur, peak, filter, f0, f1, q, a) {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = filter || 'lowpass';
    f.frequency.setValueAtTime(f0 || 2000, t0);
    if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    f.Q.value = q || 0.8;
    s.connect(f);
    f.connect(envGain(ctx, out, t0, a || 0.003, dur, peak));
    s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05);
  }

  const SFX = {
    laser:      { d: 0.1,  b: (c, o) => { tone(c, o, 'square', 1500, 480, 0, 0.08, 0.16); tone(c, o, 'sine', 2600, 900, 0, 0.05, 0.08); } },
    shotgun:    { d: 0.24, b: (c, o, n) => { noiseSrc(c, n, o, 0, 0.2, 0.55, 'lowpass', 4200, 300); tone(c, o, 'sine', 160, 50, 0, 0.14, 0.5); } },
    rocket:     { d: 0.32, b: (c, o, n) => { noiseSrc(c, n, o, 0, 0.3, 0.32, 'bandpass', 600, 2400, 2); tone(c, o, 'sawtooth', 120, 60, 0, 0.18, 0.12); } },
    plasma:     { d: 0.36, b: (c, o) => { tone(c, o, 'sine', 520, 110, 0, 0.32, 0.4); tone(c, o, 'triangle', 1040, 220, 0, 0.18, 0.12); } },
    zap:        { d: 0.18, b: (c, o, n) => { noiseSrc(c, n, o, 0, 0.14, 0.35, 'highpass', 3000, 6000); for (let i = 0; i < 4; i++) tone(c, o, 'square', 800 + Math.random() * 1600, 300, i * 0.025, 0.04, 0.1); } },
    arc:        { d: 0.22, b: (c, o, n) => { tone(c, o, 'sawtooth', 95, 70, 0, 0.18, 0.22); noiseSrc(c, n, o, 0, 0.16, 0.25, 'bandpass', 2500, 5000, 3); } },
    dark:       { d: 0.42, b: (c, o, n) => { tone(c, o, 'sine', 70, 180, 0, 0.38, 0.45, 0.05); noiseSrc(c, n, o, 0, 0.35, 0.15, 'lowpass', 400, 1600); } },
    hit:        { d: 0.06, b: (c, o) => { tone(c, o, 'triangle', 900, 380, 0, 0.045, 0.22); } },
    hitArmor:   { d: 0.08, b: (c, o) => { tone(c, o, 'square', 2100, 1900, 0, 0.06, 0.08); tone(c, o, 'sine', 3200, 3000, 0, 0.05, 0.06); } },
    explodeS:   { d: 0.34, b: (c, o, n) => { noiseSrc(c, n, o, 0, 0.3, 0.6, 'lowpass', 2600, 160); tone(c, o, 'sine', 140, 40, 0, 0.22, 0.55); } },
    explodeM:   { d: 0.7,  b: (c, o, n) => { noiseSrc(c, n, o, 0, 0.62, 0.75, 'lowpass', 1800, 90); tone(c, o, 'sine', 110, 30, 0, 0.45, 0.75); noiseSrc(c, n, o, 0.05, 0.3, 0.25, 'highpass', 2000, 900); } },
    explodeL:   { d: 1.8,  b: (c, o, n) => { noiseSrc(c, n, o, 0, 1.6, 0.9, 'lowpass', 1400, 50, 1, 0.01); tone(c, o, 'sine', 90, 24, 0, 1.2, 0.9); tone(c, o, 'sawtooth', 60, 25, 0, 0.9, 0.2); noiseSrc(c, n, o, 0.25, 0.8, 0.4, 'lowpass', 900, 80); } },
    playerHit:  { d: 0.45, b: (c, o, n) => { tone(c, o, 'sawtooth', 260, 55, 0, 0.36, 0.45); noiseSrc(c, n, o, 0, 0.3, 0.5, 'lowpass', 3000, 200); } },
    shieldHit:  { d: 0.35, b: (c, o) => { tone(c, o, 'sine', 1300, 520, 0, 0.3, 0.35); tone(c, o, 'sine', 2600, 1100, 0, 0.2, 0.15); } },
    coin:       { d: 0.14, b: (c, o) => { tone(c, o, 'square', 1320, 1320, 0, 0.05, 0.08); tone(c, o, 'square', 1980, 1980, 0.045, 0.08, 0.08); } },
    xp:         { d: 0.08, b: (c, o) => { tone(c, o, 'sine', 880, 1320, 0, 0.06, 0.16); } },
    powerup:    { d: 0.45, b: (c, o) => { [523, 659, 784, 1047].forEach((f, i) => tone(c, o, 'square', f, f, i * 0.07, 0.12, 0.09)); tone(c, o, 'sine', 2093, 2093, 0.28, 0.15, 0.08); } },
    levelup:    { d: 0.9,  b: (c, o) => { [523, 659, 784, 1047, 1319].forEach((f, i) => { tone(c, o, 'triangle', f, f, i * 0.08, 0.35, 0.16); tone(c, o, 'square', f * 2, f * 2, i * 0.08, 0.1, 0.04); }); } },
    perk:       { d: 0.35, b: (c, o) => { tone(c, o, 'triangle', 660, 990, 0, 0.12, 0.2); tone(c, o, 'triangle', 990, 1320, 0.08, 0.2, 0.18); } },
    click:      { d: 0.05, b: (c, o) => { tone(c, o, 'triangle', 1200, 900, 0, 0.03, 0.18); } },
    back:       { d: 0.06, b: (c, o) => { tone(c, o, 'triangle', 800, 500, 0, 0.04, 0.16); } },
    buy:        { d: 0.45, b: (c, o) => { tone(c, o, 'square', 1046, 1046, 0, 0.07, 0.1); tone(c, o, 'square', 1568, 1568, 0.07, 0.1, 0.1); tone(c, o, 'sine', 3136, 2600, 0.14, 0.25, 0.08); } },
    error:      { d: 0.25, b: (c, o) => { tone(c, o, 'square', 180, 150, 0, 0.09, 0.12); tone(c, o, 'square', 150, 120, 0.11, 0.1, 0.12); } },
    warning:    { d: 1.7,  b: (c, o) => { for (let i = 0; i < 4; i++) { tone(c, o, 'sawtooth', 620, 620, i * 0.4, 0.18, 0.13); tone(c, o, 'sawtooth', 460, 460, i * 0.4 + 0.2, 0.18, 0.13); } } },
    bomb:       { d: 1.5,  b: (c, o, n) => { tone(c, o, 'sine', 70, 20, 0, 1.2, 1.0); noiseSrc(c, n, o, 0, 1.3, 0.8, 'lowpass', 3000, 60); noiseSrc(c, n, o, 0, 0.5, 0.35, 'bandpass', 500, 3500, 1.5); } },
    railCharge: { d: 1.2,  b: (c, o) => { tone(c, o, 'sawtooth', 200, 1800, 0, 1.1, 0.12, 0.4); tone(c, o, 'sine', 400, 3600, 0, 1.1, 0.1, 0.4); } },
    rail:       { d: 0.9,  b: (c, o, n) => { tone(c, o, 'sawtooth', 110, 90, 0, 0.8, 0.3); tone(c, o, 'square', 55, 50, 0, 0.8, 0.15); noiseSrc(c, n, o, 0, 0.8, 0.3, 'bandpass', 1500, 900, 2); } },
    skill:      { d: 0.5,  b: (c, o, n) => { noiseSrc(c, n, o, 0, 0.4, 0.3, 'bandpass', 400, 4000, 2); tone(c, o, 'triangle', 300, 1200, 0, 0.35, 0.18); } },
    achievement:{ d: 1.0,  b: (c, o) => { [784, 988, 1175, 1568].forEach((f, i) => tone(c, o, 'triangle', f, f, i * 0.1, 0.45, 0.14)); } },
    enemyShot:  { d: 0.1,  b: (c, o) => { tone(c, o, 'sine', 700, 260, 0, 0.08, 0.1); } },
    mine:       { d: 0.1,  b: (c, o) => { tone(c, o, 'square', 1800, 1800, 0, 0.05, 0.06); } },
    teleport:   { d: 0.28, b: (c, o) => { tone(c, o, 'sine', 300, 1600, 0, 0.12, 0.15); tone(c, o, 'sine', 1600, 300, 0.12, 0.12, 0.12); } },
    bossRoar:   { d: 1.1,  b: (c, o, n) => { tone(c, o, 'sawtooth', 80, 45, 0, 1.0, 0.35, 0.1); tone(c, o, 'square', 120, 60, 0, 0.9, 0.12, 0.1); noiseSrc(c, n, o, 0, 1.0, 0.3, 'lowpass', 600, 150); } },
    revive:     { d: 1.0,  b: (c, o) => { [392, 523, 659, 784, 1047].forEach((f, i) => tone(c, o, 'sine', f, f * 1.01, i * 0.09, 0.5, 0.16)); } },
  };
  // минимальный интервал (с) и громкость по умолчанию — чтобы частые звуки не «долбили»
  const LIMIT = {
    laser: [0.06, 0.32], shotgun: [0.08, 0.55], rocket: [0.08, 0.4], plasma: [0.1, 0.55], zap: [0.07, 0.45], arc: [0.08, 0.45], dark: [0.12, 0.5],
    hit: [0.035, 0.32], hitArmor: [0.05, 0.4], explodeS: [0.04, 0.55], explodeM: [0.08, 0.7], explodeL: [0.3, 1], enemyShot: [0.07, 0.25],
    coin: [0.04, 0.4], xp: [0.03, 0.3], mine: [0.1, 0.35],
  };

  // ── Стили музыки ──
  // аккорды задаются MIDI-номерами; шаблоны — 16 шагов на такт
  const CH = {
    Am: [57, 60, 64], F: [53, 57, 60], C: [48, 52, 55], G: [55, 59, 62], Em: [52, 55, 59], Dm: [50, 53, 57],
    Bb: [46, 50, 53], E: [52, 56, 59], D: [50, 54, 57], Bm: [47, 50, 54], Gm: [55, 58, 62], Cm: [48, 51, 55], Ab: [44, 48, 51], Eb: [51, 55, 58],
  };
  const STYLES = {
    synthwave: { name: 'Синтвейв', bpm: 108, prog: ['Am', 'F', 'C', 'G'],
      bass: { wave: 'sawtooth', cut: 520, q: 7, pat: 'x.xxx.xxx.xxx.xx', dec: 0.16, vol: 0.2 },
      pad: { wave: 'sawtooth', cut: 1400, vol: 0.05 },
      arp: { wave: 'square', pat: [0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 1, 0, 2, 1, 2], oct: 12, dec: 0.11, vol: 0.045, cut: 2600 },
      lead: { wave: 'triangle', notes: [76, null, 74, 72, null, 69, null, 72, 74, null, 72, 69, null, 67, 69, null], vol: 0.07 },
      kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', },
    chiptune: { name: 'Чиптюн', bpm: 140, prog: ['Am', 'F', 'G', 'Em'],
      bass: { wave: 'square', cut: 1800, q: 1, pat: 'x.x.x.x.x.x.x.x.', dec: 0.1, vol: 0.12, octJump: true },
      pad: null,
      arp: { wave: 'square', pat: [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 3], oct: 12, dec: 0.07, vol: 0.05, cut: 6000 },
      lead: { wave: 'square', notes: [81, null, 79, 81, 84, null, 81, 79, 76, null, 79, null, 81, 79, 76, 74], vol: 0.05 },
      kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', noiseDrums: true },
    ambient: { name: 'Эмбиент', bpm: 78, prog: ['Dm', 'Bb', 'F', 'C'],
      bass: { wave: 'sine', cut: 400, q: 1, pat: 'x.......x.......', dec: 0.9, vol: 0.18 },
      pad: { wave: 'triangle', cut: 1100, vol: 0.07, slow: true },
      arp: { wave: 'sine', pat: [0, null, 2, null, 1, null, null, 2, 0, null, 2, null, 3, null, null, null], oct: 24, dec: 0.6, vol: 0.05, cut: 5000 },
      lead: null,
      kick: 'x...............', snare: '........x.......', hat: '....x.......x...', soft: true },
    dnb: { name: 'Драм-н-бейс', bpm: 172, prog: ['Em', 'C', 'G', 'D'],
      bass: { wave: 'sawtooth', cut: 380, q: 5, pat: 'x..x..x...x..x..', dec: 0.3, vol: 0.2, reese: true },
      pad: { wave: 'sawtooth', cut: 900, vol: 0.04 },
      arp: { wave: 'triangle', pat: [0, null, 1, null, 2, null, 1, null, 0, null, 2, null, 3, null, 2, null], oct: 24, dec: 0.12, vol: 0.04, cut: 4000 },
      lead: { wave: 'sawtooth', notes: [71, null, null, 74, null, 76, null, null, 79, null, 78, null, 76, null, 74, null], vol: 0.045 },
      kick: 'x.........x.....', snare: '....x.......x...', hat: 'x.xxx.xxx.xxx.xx', },
    cyber: { name: 'Кибер', bpm: 124, prog: ['Cm', 'Ab', 'Eb', 'Bb'],
      bass: { wave: 'sawtooth', cut: 300, q: 14, pat: 'xx.xx.x.xx.xx.x.', dec: 0.12, vol: 0.17, acid: true },
      pad: { wave: 'sawtooth', cut: 800, vol: 0.04 },
      arp: { wave: 'square', pat: [0, 2, 1, 2, 0, 2, 1, 3, 0, 2, 1, 2, 0, 3, 2, 1], oct: 12, dec: 0.08, vol: 0.04, cut: 3200 },
      lead: { wave: 'square', notes: [72, null, 75, null, 79, null, 77, 75, null, 72, null, 70, 72, null, null, null], vol: 0.045 },
      kick: 'x...x...x...x...', snare: '....x.......x...', hat: '.xx..xx..xx..xx.', },
  };

  const audio = {
    ac: null, comp: null, musicGain: null, sfxGain: null, musicFilter: null,
    buffers: {}, noise: null, unlocked: false, ready: false,
    _last: {}, _voices: 0,
    styles: STYLES,

    init() {
      if (!AC) return;
      try {
        this.ac = new AC({ latencyHint: 'interactive' });
      } catch (e) { try { this.ac = new AC(); } catch (e2) { return; } }
      const ac = this.ac;
      this.comp = ac.createDynamicsCompressor();
      this.comp.threshold.value = -14; this.comp.knee.value = 10; this.comp.ratio.value = 6;
      this.comp.attack.value = 0.003; this.comp.release.value = 0.2;
      this.comp.connect(ac.destination);
      this.musicFilter = ac.createBiquadFilter();
      this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 20000;
      this.musicGain = ac.createGain();
      this.musicGain.connect(this.musicFilter); this.musicFilter.connect(this.comp);
      this.sfxGain = ac.createGain(); this.sfxGain.connect(this.comp);
      // общий буфер шума
      const len = ac.sampleRate;
      this.noise = ac.createBuffer(1, len, ac.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      this.renderSfx();
      // разблокировка звука на iOS/Android — по первому касанию
      const unlock = () => this.unlock();
      ['pointerdown', 'touchend', 'click', 'keydown'].forEach((ev) => document.addEventListener(ev, unlock, { passive: true }));
    },

    unlock() {
      if (!this.ac) return;
      if (this.ac.state === 'suspended' && !document.hidden) this.ac.resume().catch(() => {});
      if (!this.unlocked) {
        this.unlocked = true;
        try { const s = this.ac.createBufferSource(); s.buffer = this.ac.createBuffer(1, 1, 22050); s.connect(this.ac.destination); s.start(0); } catch (e) {}
        SS.emit('audioUnlocked');
      }
    },

    async renderSfx() {
      const rate = 32000;
      // один белый шум на все эффекты: раньше секунда шума заново заполнялась для каждого звука при запуске
      const noise = new Float32Array(rate);
      for (let i = 0; i < rate; i++) noise[i] = Math.random() * 2 - 1;
      const jobs = Object.keys(SFX).map(async (name) => {
        const def = SFX[name];
        try {
          const len = Math.ceil(def.d * rate) + 200;
          const oc = new OAC(1, len, rate);
          const nb = oc.createBuffer(1, rate, rate);
          nb.getChannelData(0).set(noise);
          const out = oc.createGain(); out.gain.value = 0.9; out.connect(oc.destination);
          def.b(oc, out, nb);
          const buf = await new Promise((res, rej) => {
            const p = oc.startRendering();
            if (p && p.then) p.then(res, rej); else oc.oncomplete = (e) => res(e.renderedBuffer);
          });
          this.buffers[name] = buf;
        } catch (e) { /* звук просто не будет проигрываться */ }
      });
      await Promise.all(jobs);
      this.ready = true;
    },

    applyVolumes() {
      if (!this.ac) return;
      const st = SS.store.s.settings;
      const mv = (st.music / 100); const sv = (st.sfx / 100);
      this.musicGain.gain.setTargetAtTime(mv * mv * 0.9, this.ac.currentTime, 0.05);
      this.sfxGain.gain.setTargetAtTime(sv * sv * 0.95, this.ac.currentTime, 0.02);
    },

    // play('explodeM', { vol, rate, pan })
    play(name, o) {
      const ac = this.ac;
      if (!ac || !this.unlocked || ac.state !== 'running') return;
      const buf = this.buffers[name];
      if (!buf) return;
      const lim = LIMIT[name];
      const now = ac.currentTime;
      if (lim && now - (this._last[name] || 0) < lim[0]) return;
      if (this._voices > 24) return;
      this._last[name] = now;
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = (o && o.rate) || (lim ? U.rand(0.94, 1.06) : 1);
      const g = ac.createGain();
      g.gain.value = ((o && o.vol) || 1) * (lim ? lim[1] : 0.8);
      let node = src;
      node.connect(g);
      if (o && o.pan && ac.createStereoPanner) {
        const p = ac.createStereoPanner(); p.pan.value = U.clamp(o.pan, -1, 1);
        g.connect(p); p.connect(this.sfxGain);
      } else g.connect(this.sfxGain);
      this._voices++;
      src.onended = () => { this._voices--; try { g.disconnect(); } catch (e) {} };
      src.start();
    },

    suspend() { if (this.ac && this.ac.state === 'running') this.ac.suspend().catch(() => {}); },
    resume() { if (this.ac && this.unlocked && this.ac.state === 'suspended') this.ac.resume().catch(() => {}); },
    // приглушение музыки на паузе
    muffle(on) {
      if (!this.ac) return;
      this.musicFilter.frequency.setTargetAtTime(on ? 700 : 20000, this.ac.currentTime, 0.15);
    },
  };

  // ════════════════════════════════════════════════════════════
  // МУЗЫКАЛЬНЫЙ СЕКВЕНСОР
  // ════════════════════════════════════════════════════════════
  const music = {
    style: null, intensity: 0, targetIntensity: 0,
    _bus: null, _timer: null, _step: 0, _bar: 0, _next: 0, _playing: false,

    // intensity: 0 — меню, 1 — бой, 2 — босс/фивер
    play(styleId, intensity) {
      const ac = audio.ac;
      if (!ac) return;
      const st = STYLES[styleId] || STYLES.synthwave;
      this.targetIntensity = intensity;
      if (this._playing && this.style === st) { this.intensity = intensity; return; }
      this.stop(true);
      this.style = st;
      this.intensity = intensity;
      this._bus = ac.createGain();
      this._bus.gain.setValueAtTime(0.0001, ac.currentTime);
      this._bus.gain.exponentialRampToValueAtTime(1, ac.currentTime + 1.2);
      this._bus.connect(audio.musicGain);
      this._step = 0; this._bar = 0;
      this._next = ac.currentTime + 0.12;
      this._playing = true;
      clearInterval(this._timer);
      this._timer = setInterval(() => this._tick(), 25);
    },
    setIntensity(v) { this.intensity = v; },
    stop(fast) {
      clearInterval(this._timer); this._timer = null;
      this._playing = false;
      const bus = this._bus; this._bus = null;
      if (bus && audio.ac) {
        const t = audio.ac.currentTime;
        try { bus.gain.cancelScheduledValues(t); bus.gain.setValueAtTime(bus.gain.value, t); bus.gain.exponentialRampToValueAtTime(0.0001, t + (fast ? 0.4 : 1.2)); } catch (e) {}
        setTimeout(() => { try { bus.disconnect(); } catch (e) {} }, 1500);
      }
    },

    _tick() {
      const ac = audio.ac;
      if (!ac || !this._playing || ac.state !== 'running') { if (ac) this._next = Math.max(this._next, ac.currentTime + 0.05); return; }
      const st = this.style;
      const stepDur = 60 / st.bpm / 4;
      // если вкладка «проспала» — не наверстываем пачку нот
      if (this._next < ac.currentTime - 0.2) this._next = ac.currentTime + 0.05;
      while (this._next < ac.currentTime + 0.14) {
        this._schedule(st, this._step, this._bar, this._next, stepDur);
        this._next += stepDur;
        this._step++;
        if (this._step >= 16) { this._step = 0; this._bar++; }
      }
    },

    _schedule(st, step, bar, t, sd) {
      const ac = audio.ac, out = this._bus;
      if (!out) return;
      const lv = this.intensity;
      const chord = CH[st.prog[bar % st.prog.length]];
      const soft = st.soft ? 0.6 : 1;

      // ПЭД — в начале такта
      if (st.pad && step === 0) this._pad(chord, t, sd * 16, st.pad, lv === 0 ? 1.2 : 1);
      // АРПЕДЖИО
      if (st.arp) {
        const idx = st.arp.pat[step];
        if (idx !== null && idx !== undefined && (lv >= 1 || step % 2 === 0)) {
          const note = (idx === 3 ? chord[0] + 12 : chord[idx]) + st.arp.oct;
          this._pluck(mtof(note), t, st.arp.dec, st.arp.wave, st.arp.vol * (lv === 0 ? 0.6 : 1), lv === 0 ? st.arp.cut * 0.45 : st.arp.cut);
        }
      }
      if (lv >= 1) {
        // БАС
        if (st.bass && st.bass.pat[step] === 'x') {
          let n = chord[0] - 24;
          if (st.bass.octJump && step % 4 === 2) n += 12;
          this._bass(mtof(n), t, st.bass, sd);
        }
        if (st.kick[step] === 'x') this._kick(t, 0.55 * soft);
        if (st.hat[step] === 'x') this._hat(t, (st.noiseDrums ? 0.05 : 0.07) * soft, false);
      }
      if (lv >= 2) {
        if (st.snare[step] === 'x') this._snare(t, 0.32 * soft, st.noiseDrums);
        if (step % 4 === 2 && !st.soft) this._hat(t, 0.05, true);
        if (st.lead) {
          const ln = st.lead.notes[step];
          if (ln) this._lead(mtof(ln - (bar % 2 ? 0 : 0)), t, sd * 1.8, st.lead.wave, st.lead.vol);
        }
      } else if (lv === 1 && st.snare[step] === 'x' && bar % 2 === 1) {
        this._snare(t, 0.2 * soft, st.noiseDrums);
      }
    },

    _env(t, a, hold, rel, peak) {
      const g = audio.ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + a);
      g.gain.setValueAtTime(peak, t + a + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
      return g;
    },
    _pad(chord, t, dur, p, mul) {
      const ac = audio.ac;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = p.cut; f.Q.value = 0.5;
      const g = this._env(t, p.slow ? dur * 0.4 : 0.35, dur * 0.4, dur * 0.35, p.vol * mul);
      f.connect(g); g.connect(this._bus);
      chord.forEach((n, i) => {
        for (const det of [-7, 7]) {
          const o = ac.createOscillator(); o.type = p.wave;
          o.frequency.value = mtof(n); o.detune.value = det + i;
          o.connect(f); o.start(t); o.stop(t + dur + 0.1);
        }
      });
    },
    _pluck(freq, t, dec, wave, vol, cut) {
      const ac = audio.ac;
      const o = ac.createOscillator(); o.type = wave; o.frequency.value = freq;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cut;
      const g = this._env(t, 0.004, 0, dec, vol);
      o.connect(f); f.connect(g); g.connect(this._bus);
      o.start(t); o.stop(t + dec + 0.05);
    },
    _bass(freq, t, b, sd) {
      const ac = audio.ac;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = b.q;
      f.frequency.setValueAtTime(b.cut * (b.acid ? 4 : 2.2), t);
      f.frequency.exponentialRampToValueAtTime(b.cut, t + b.dec);
      const g = this._env(t, 0.005, sd * 0.4, b.dec, b.vol);
      f.connect(g); g.connect(this._bus);
      const dets = b.reese ? [-14, 14] : [0];
      for (const det of dets) {
        const o = ac.createOscillator(); o.type = b.wave; o.frequency.value = freq; o.detune.value = det;
        o.connect(f); o.start(t); o.stop(t + sd * 0.4 + b.dec + 0.05);
      }
    },
    _lead(freq, t, dur, wave, vol) {
      const ac = audio.ac;
      const o = ac.createOscillator(); o.type = wave; o.frequency.value = freq;
      const lfo = ac.createOscillator(); lfo.frequency.value = 5.5;
      const lg = ac.createGain(); lg.gain.value = 6; lfo.connect(lg); lg.connect(o.detune);
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3500;
      const g = this._env(t, 0.02, dur * 0.5, dur * 0.6, vol);
      o.connect(f); f.connect(g); g.connect(this._bus);
      o.start(t); lfo.start(t); o.stop(t + dur * 1.2); lfo.stop(t + dur * 1.2);
    },
    _kick(t, vol) {
      const ac = audio.ac;
      const o = ac.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      const g = this._env(t, 0.002, 0.02, 0.18, vol);
      o.connect(g); g.connect(this._bus); o.start(t); o.stop(t + 0.25);
    },
    _snare(t, vol, chip) {
      const ac = audio.ac;
      const s = ac.createBufferSource(); s.buffer = audio.noise;
      const f = ac.createBiquadFilter(); f.type = chip ? 'highpass' : 'bandpass'; f.frequency.value = chip ? 2500 : 1800; f.Q.value = 0.7;
      const g = this._env(t, 0.001, 0.01, 0.16, vol);
      s.connect(f); f.connect(g); g.connect(this._bus);
      s.start(t, Math.random() * 0.5); s.stop(t + 0.2);
      if (!chip) {
        const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
        const g2 = this._env(t, 0.001, 0, 0.09, vol * 0.6);
        o.connect(g2); g2.connect(this._bus); o.start(t); o.stop(t + 0.12);
      }
    },
    _hat(t, vol, open) {
      const ac = audio.ac;
      const s = ac.createBufferSource(); s.buffer = audio.noise;
      const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
      const g = this._env(t, 0.001, 0, open ? 0.18 : 0.04, vol);
      s.connect(f); f.connect(g); g.connect(this._bus);
      s.start(t, Math.random() * 0.5); s.stop(t + (open ? 0.22 : 0.06));
    },
  };

  audio.music = music;
  SS.audio = audio;
})();
