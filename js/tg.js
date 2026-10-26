// ════════════════════════════════════════════════════════════════
// SPACE SHOOTER 2.0 — интеграция с Telegram Mini App и сервером бота
// ════════════════════════════════════════════════════════════════
'use strict';

(function () {
  const wa = (window.Telegram && window.Telegram.WebApp) || null;
  const CFG = window.SS_CONFIG || {};
  const CLOUD_CHUNK = 3900;

  const ver = (v) => { try { return !!(wa && wa.isVersionAtLeast && wa.isVersionAtLeast(v)); } catch (e) { return false; } };

  const tg = {
    wa,
    // внутри Telegram (любым способом запуска)
    inside: !!(wa && wa.platform && wa.platform !== 'unknown'),
    // initData есть, когда игра открыта инлайн-кнопкой, меню или ссылкой
    hasInitData: !!(wa && wa.initData),
    _backHandler: null,
    _lastHaptic: 0,

    init() {
      if (!wa) return;
      try { wa.ready(); } catch (e) {}
      try { wa.expand(); } catch (e) {}
      // свайп вниз во время игры больше не сворачивает приложение
      if (ver('7.7')) { try { wa.disableVerticalSwipes(); } catch (e) {} }
      if (ver('6.1')) {
        try { wa.setHeaderColor('#05060f'); } catch (e) {}
        try { wa.setBackgroundColor('#05060f'); } catch (e) {}
      }
      if (ver('7.10')) { try { wa.setBottomBarColor('#05060f'); } catch (e) {} }
      try {
        wa.onEvent('viewportChanged', () => SS.emit('resize'));
        wa.onEvent('backButtonClicked', () => { if (this._backHandler) this._backHandler(); });
        wa.onEvent('activated', () => SS.emit('appActive', true));
        wa.onEvent('deactivated', () => SS.emit('appActive', false));
      } catch (e) {}
    },

    user() {
      const u = wa && wa.initDataUnsafe && wa.initDataUnsafe.user;
      if (!u) return { id: 0, name: 'Пилот', photo: '' };
      const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Пилот';
      return { id: u.id, name, username: u.username || '', photo: u.photo_url || '' };
    },
    userId() { return this.user().id; },

    // ── вибрация ──
    haptic(kind) {
      const st = SS.store && SS.store.s && SS.store.s.settings;
      if (st && !st.vibro) return;
      const now = performance.now();
      if (kind === 'light' && now - this._lastHaptic < 60) return;
      this._lastHaptic = now;
      const hf = wa && wa.HapticFeedback;
      if (hf && ver('6.1')) {
        try {
          if (kind === 'success' || kind === 'warning' || kind === 'error') hf.notificationOccurred(kind);
          else if (kind === 'select') hf.selectionChanged();
          else hf.impactOccurred(kind || 'light');
        } catch (e) {}
        return;
      }
      if (navigator.vibrate) {
        const pat = { light: 8, select: 6, soft: 10, medium: 18, rigid: 22, heavy: 35, success: [12, 40, 12], warning: [20, 60, 20], error: [40, 50, 40] }[kind] || 10;
        try { navigator.vibrate(pat); } catch (e) {}
      }
    },

    // ── системная кнопка «Назад» ──
    back(handler) {
      this._backHandler = handler || null;
      if (!wa || !wa.BackButton || !ver('6.1')) return;
      try { handler ? wa.BackButton.show() : wa.BackButton.hide(); } catch (e) {}
    },
    // подтверждение закрытия только во время боя
    closingConfirm(on) {
      if (!wa || !ver('6.2')) return;
      try { on ? wa.enableClosingConfirmation() : wa.disableClosingConfirmation(); } catch (e) {}
    },

    // ── облачное сохранение Telegram (прогресс не теряется при очистке кэша) ──
    cloudAvailable() { return !!(wa && wa.CloudStorage && ver('6.9') && this.hasInitData); },
    cloudSave(json, ts) {
      if (!this.cloudAvailable()) return;
      const cs = wa.CloudStorage;
      const parts = [];
      for (let i = 0; i < json.length; i += CLOUD_CHUNK) parts.push(json.slice(i, i + CLOUD_CHUNK));
      if (parts.length > 60) return; // защита от переполнения
      let pending = parts.length;
      const done = () => { if (--pending === 0) { try { cs.setItem('ss2_meta', JSON.stringify({ n: parts.length, t: ts }), () => {}); } catch (e) {} } };
      parts.forEach((p, i) => { try { cs.setItem('ss2_c' + i, p, done); } catch (e) { done(); } });
    },
    cloudLoad() {
      return new Promise((resolve) => {
        if (!this.cloudAvailable()) return resolve(null);
        const cs = wa.CloudStorage;
        const timer = setTimeout(() => resolve(null), 4000);
        try {
          cs.getItem('ss2_meta', (err, raw) => {
            if (err || !raw) { clearTimeout(timer); return resolve(null); }
            let meta;
            try { meta = JSON.parse(raw); } catch (e) { clearTimeout(timer); return resolve(null); }
            const keys = [];
            for (let i = 0; i < meta.n; i++) keys.push('ss2_c' + i);
            cs.getItems(keys, (err2, vals) => {
              clearTimeout(timer);
              if (err2 || !vals) return resolve(null);
              resolve({ json: keys.map((k) => vals[k] || '').join(''), t: meta.t });
            });
          });
        } catch (e) { clearTimeout(timer); resolve(null); }
      });
    },

    // ── сервер бота (api.py) ──
    apiUrl() { return (CFG.API_URL || '').replace(/\/+$/, ''); },
    async _post(path, body) {
      const url = this.apiUrl();
      if (!url) throw new Error('no-api');
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 7000);
      try {
        // text/plain — «простой» запрос без CORS-preflight
        const res = await fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(body), signal: ctrl.signal });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
        return data;
      } finally { clearTimeout(t); }
    },
    canSubmit() { return !!(this.apiUrl() && this.hasInitData); },
    async submitScore(run) {
      if (!this.canSubmit()) return null;
      try {
        return await this._post('/api/score', {
          initData: wa.initData, score: run.score, wave: run.wave, difficulty: run.diff,
          duration: Math.round(run.time), kills: run.kills, bosses: run.bosses,
          accuracy: run.shots ? Math.round((run.hits / run.shots) * 1000) / 10 : 0,
        });
      } catch (e) { console.warn('[tg] результат не отправлен:', e.message); return null; }
    },
    async fetchLeaderboard() {
      const url = this.apiUrl();
      if (!url) return null;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      try {
        const res = await fetch(url + '/api/leaderboard?limit=50', { signal: ctrl.signal });
        if (!res.ok) return null;
        const list = await res.json();
        return Array.isArray(list) ? list : null;
      } catch (e) { return null; } finally { clearTimeout(t); }
    },
    // отправка идеи: через API, а если его нет — через sendData (только при запуске с клавиатурной кнопки)
    async sendSuggestion(text, category) {
      if (this.canSubmit()) {
        await this._post('/api/suggestion', { initData: wa.initData, text, category });
        return { ok: true, via: 'api' };
      }
      if (this.inside && !this.hasInitData && wa.sendData) {
        wa.sendData(JSON.stringify({ type: 'suggestion', text, category }));
        return { ok: true, via: 'sendData' };
      }
      return { ok: false, reason: this.inside ? 'no-api' : 'outside' };
    },

    // ── поделиться результатом ──
    share(text) {
      const url = CFG.SHARE_URL || location.href.split('?')[0].split('#')[0];
      if (wa && this.inside && ver('6.1')) {
        try { wa.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text)); return true; } catch (e) {}
      }
      if (navigator.share) { navigator.share({ title: 'Space Shooter 2.0', text, url }).catch(() => {}); return true; }
      try { navigator.clipboard.writeText(text + ' ' + url); return 'copied'; } catch (e) { return false; }
    },
  };

  SS.tg = tg;
})();
