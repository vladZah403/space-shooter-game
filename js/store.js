// ════════════════════════════════════════════════════════════════
// SPACE SHOOTER 2.0 — сохранение и мета-прогрессия
//  SS.store — хранение (localStorage + облако Telegram), перенос со старой версии
//  SS.meta  — покупки, опыт корабля, достижения, задания, награды за вход
// ════════════════════════════════════════════════════════════════
'use strict';

(function () {
  const U = SS.util, D = SS.data;
  const KEY = 'ss2_save';

  function defaults() {
    const diff = {};
    D.DIFF_ORDER.forEach((k) => (diff[k] = { best: 0, wave: 0 }));
    return {
      v: 2, created: Date.now(), updated: 0,
      coins: 0,
      shipXP: 0, shipLvl: 1, spBonus: 0, skills: {},
      comp: { owned: ['gunner'], sel: 'gunner', lv: { gunner: 1 } },
      prestige: 0,
      weapons: { owned: ['laser'], loadout: ['laser'], ups: {} },
      general: {},
      ship: { model: 'ship1', models: ['ship1'], skin: 'default', skins: ['default'], trail: 'ice', trails: ['ice', 'fire'] },
      stats: { games: 0, kills: 0, bosses: 0, bossTypes: [], bestScore: 0, bestWave: 0, maxCombo: 0, playTime: 0,
        coinsEarned: 0, perks: 0, deaths: 0, shots: 0, diff, events: 0, challenges: 0, evos: [] },
      achievements: {},
      daily: { date: '', missions: [], bonus: false, loginDate: '', streak: 0, seen: '', ch: { date: '', best: 0, wave: 0, done: false } },
      settings: { music: 70, sfx: 80, musicStyle: 'synthwave', quality: 'auto', vibro: true, sens: 1.25,
        dmgNums: true, shake: true, fps: false, diff: 'normal', intro: true },
      lb: [],
      seenIntro: false,
      pilot: 'kai',
      bossSeen: [],   // боссы, чью полную кат-сцену уже показали
      notes: [],
      patch: 40,
    };
  }

  // аккуратное слияние: новые поля из defaults дополняют старое сохранение
  function merge(base, data) {
    if (!data || typeof data !== 'object') return base;
    for (const k of Object.keys(base)) {
      if (!(k in data)) continue;
      const bv = base[k], dv = data[k];
      if (bv && typeof bv === 'object' && !Array.isArray(bv) && dv && typeof dv === 'object' && !Array.isArray(dv)) {
        base[k] = merge(bv, dv);
      } else if (dv !== undefined && dv !== null) {
        base[k] = dv;
      }
    }
    // словари с произвольными ключами копируем целиком
    for (const k of ['skills', 'achievements', 'general']) if (data[k] && typeof data[k] === 'object') base[k] = Object.assign({}, data[k]);
    if (data.weapons && data.weapons.ups) base.weapons.ups = JSON.parse(JSON.stringify(data.weapons.ups));
    return base;
  }

  const store = {
    s: defaults(),
    _timer: null,
    _cloudTimer: null,

    load() {
      let raw = null;
      try { raw = localStorage.getItem(KEY); } catch (e) { /* приватный режим */ }
      if (raw) {
        try { const data = JSON.parse(raw); this.s = merge(defaults(), data); this.patchNotes(data); }
        catch (e) { console.warn('[store] повреждённое сохранение, начинаем заново', e); this.s = defaults(); }
      } else {
        this.s = defaults();
        this.migrateV1();
      }
      this.sanitize();
      return this.s;
    },

    // исправляет несовместимые значения (удалённые id, выход за пределы)
    sanitize() {
      const s = this.s;
      s.weapons.owned = s.weapons.owned.filter((w) => D.WEAPONS[w]);
      if (!s.weapons.owned.includes('laser')) s.weapons.owned.unshift('laser');
      s.weapons.loadout = s.weapons.loadout.filter((w, i, a) => s.weapons.owned.includes(w) && a.indexOf(w) === i).slice(0, 3);
      if (!s.weapons.loadout.length) s.weapons.loadout = ['laser'];
      for (const id of Object.keys(s.skills)) if (!D.SKILLS[id]) delete s.skills[id];
      this.fixSkillSlots();
      if (!D.SHIPS[s.ship.model] || !s.ship.models.includes(s.ship.model)) s.ship.model = 'ship1';
      if (!s.ship.models.includes('ship1')) s.ship.models.unshift('ship1');
      if (!D.SKINS.find((k) => k.id === s.ship.skin)) s.ship.skin = 'default';
      if (!s.ship.skins.includes('default')) s.ship.skins.unshift('default');
      if (!s.ship.skins.includes(s.ship.skin)) s.ship.skin = 'default';
      if (!D.TRAILS.find((t) => t.id === s.ship.trail)) s.ship.trail = 'ice';
      for (const t of D.TRAILS) if (t.price === 0 && !s.ship.trails.includes(t.id)) s.ship.trails.push(t.id);
      if (!s.ship.trails.includes(s.ship.trail)) s.ship.trail = 'ice';
      if (!D.DIFFS[s.settings.diff]) s.settings.diff = 'normal';
      s.coins = Math.max(0, Math.floor(s.coins || 0));
      s.shipLvl = U.clamp(Math.floor(s.shipLvl || 1), 1, 999);
    },

    save() {
      clearTimeout(this._timer); this._timer = null;
      this.s.updated = Date.now();
      try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch (e) { console.warn('[store] не удалось сохранить', e); }
      this.scheduleCloud();
    },
    // отложенное сохранение — не пишем в хранилище на каждое действие
    soon(ms) {
      if (this._timer) return;
      this._timer = setTimeout(() => this.save(), ms || 600);
    },
    scheduleCloud() {
      if (!SS.tg || !SS.tg.cloudAvailable()) return;
      clearTimeout(this._cloudTimer);
      this._cloudTimer = setTimeout(() => SS.tg.cloudSave(JSON.stringify(this.s), this.s.updated), 2500);
    },
    // игрок версии 2.0 один раз увидит, что нового в обновлении 2.1
    patchNotes(data) {
      if (data && !(data.patch >= 21) && data.stats && data.stats.games > 0) {
        if (!this.s.notes.some((n) => n.type === 'v21' || n.type === 'v2')) this.s.notes.push({ type: 'v21' });
      } else if (data && data.patch >= 21 && !(data.patch >= 24) && data.stats && data.stats.games > 0) {
        if (!this.s.notes.some((n) => n.type === 'v24')) this.s.notes.push({ type: 'v24' });
      } else if (data && data.patch >= 24 && !(data.patch >= 25) && data.stats && data.stats.games > 0) {
        if (!this.s.notes.some((n) => n.type === 'v25')) this.s.notes.push({ type: 'v25' });
      }
      // 3.0: прокачка корабля переехала в забег — монеты за неё возвращаем
      if (data && !(data.patch >= 30)) {
        let refund = 0;
        for (const g of D.GENERAL) { const l = Math.min((this.s.general && this.s.general[g.id]) || 0, g.costs.length); for (let i = 0; i < l; i++) refund += g.costs[i]; }
        this.s.general = {};
        if (refund > 0) this.s.coins += refund;
        if (data.stats && data.stats.games > 0 && !this.s.notes.some((n) => n.type === 'v30')) this.s.notes.push({ type: 'v30', coins: refund });
      }
      // 3.1: новое древо навыков — старые навыки, которых больше нет, сняты, очки вернулись сами
      if (data && data.patch >= 30 && !(data.patch >= 31) && data.stats && data.stats.games > 0 && !this.s.notes.some((n) => n.type === 'v31')) this.s.notes.push({ type: 'v31' });
      // 4.0: карта, реликвии, дроны, режимы
      if (data && data.patch >= 30 && !(data.patch >= 40) && data.stats && data.stats.games > 0 && !this.s.notes.some((n) => n.type === 'v40')) this.s.notes.push({ type: 'v40' });
      this.s.patch = 40;
    },
    // облачное сохранение новее локального — принимаем его
    adoptCloud(json) {
      try {
        const data = JSON.parse(json);
        if (!data || data.v !== 2) return false;
        if ((data.updated || 0) <= (this.s.updated || 0)) return false;
        this.s = merge(defaults(), data);
        this.patchNotes(data);
        this.sanitize();
        try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch (e) {}
        return true;
      } catch (e) { return false; }
    },
    reset() {
      const keepSettings = this.s.settings;
      this.s = defaults();
      this.s.settings = keepSettings;
      this.s.seenIntro = true;
      this.save();
    },

    // ── Перенос прогресса из версии 1.x (v6.x) ─────────────────
    migrateV1() {
      const ls = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
      const lj = (k, d) => { try { const v = ls(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
      const hadOld = ['coins', 'bestScore', 'upgrades', 'shipLvl', 'totalKills'].some((k) => ls(k) !== null);
      if (!hadOld) return;
      const s = this.s;
      // цены старых улучшений — возвращаем всё потраченное, т.к. система прокачки новая
      const OLD = {
        damage: [60, 90, 130, 190, 280, 400, 580, 820, 1150, 1600], firerate: [80, 120, 170, 240, 340, 480, 680, 960],
        bulletspd: [70, 110, 160, 240, 360, 520], pierce: [500, 1000, 1800], laserWidth: [100, 160, 250, 390, 600, 900],
        laserCrit: [150, 240, 380, 590, 900, 1350], laserPierce: [450, 900, 1600], rocketDmg: [120, 190, 290, 440, 660, 980, 1400, 1950],
        rocketSpd: [140, 220, 350, 540, 820], rocketSplit: [700, 1400, 2500], rocketAoe: [160, 260, 400, 620, 940, 1400],
        shotPellets: [90, 160, 270, 440, 680, 1020], shotSpread: [150, 250, 400, 650], shotPierce: [400, 800, 1400],
        shotDmg: [100, 160, 250, 390, 600, 920, 1380], plasmaDmg: [110, 180, 280, 430, 650, 980, 1440, 2000],
        plasmaAoe: [160, 260, 400, 620, 940, 1400], plasmaSpd: [190, 310, 490, 760], lightDmg: [100, 170, 270, 410, 620, 930, 1380, 1950],
        lightChain: [280, 560, 1000, 1600, 2400], lightRange: [190, 330, 530, 840], dmDmg: [130, 210, 330, 510, 780, 1160, 1700],
        dmAoe: [170, 290, 460, 720, 1100], dmGrav: [200, 340, 550, 880], railCd: [180, 320, 510, 800, 1200, 1750],
        railWidth: [170, 290, 460, 710, 1060], railDur: [200, 360, 580, 880, 1300], shield: [600, 1200, 2200],
        extraLife: [900, 1800, 3200, 5500], magnet: [140, 230, 360, 560, 860, 1280], coinboost: [110, 180, 290, 460, 720, 1080, 1600],
        bombdmg: [170, 290, 460, 710, 1060],
      };
      const ups = lj('upgrades', {}) || {};
      let refund = 0;
      for (const k of Object.keys(ups)) {
        const costs = OLD[k], lvl = Math.min(+ups[k] || 0, costs ? costs.length : 0);
        for (let i = 0; i < lvl; i++) refund += costs[i];
      }
      // админ-режим старой версии давал 999 999 монет — не переносим заведомо читерские суммы
      let coins = Math.max(0, +ls('coins') || 0);
      if (coins > 300000) coins = 300000;
      s.coins = Math.floor(coins + refund);
      s.shipLvl = U.clamp(+ls('shipLvl') || 1, 1, 60);
      s.prestige = U.clamp(+ls('prestigeLevel') || 0, 0, 20);

      const oldSkills = lj('skillLevels', {}) || {};
      let spent = 0;
      for (const id of Object.keys(oldSkills)) {
        if ((oldSkills[id] || 0) >= 1 && D.SKILLS[id]) { s.skills[id] = 1; spent += D.SKILLS[id].cost; }
      }
      const oldSP = Math.max(0, +ls('skillPoints') || 0);
      s.spBonus = Math.max(0, Math.min(40, oldSP + spent - (s.shipLvl - 1)));
      this.fixSkillSlots();

      const mapW = (w) => (w === 'whip' ? 'arc' : w);
      const owned = (lj('unlockedWeapons', ['laser']) || ['laser']).map(mapW).filter((w) => D.WEAPONS[w]);
      s.weapons.owned = Array.from(new Set(['laser'].concat(owned)));
      s.weapons.loadout = (lj('selectedWeapons', ['laser']) || ['laser']).map(mapW).filter((w) => s.weapons.owned.includes(w)).slice(0, 3);

      const st = s.stats;
      st.bestScore = Math.max(0, +ls('bestScore') || 0);
      st.kills = Math.max(0, +ls('totalKills') || 0);
      st.bosses = Math.max(0, +ls('totalBosses') || 0);
      st.maxCombo = Math.max(0, +ls('maxComboEver') || 0);

      const ach = lj('achievements', []) || [];
      const valid = new Set(D.ACHIEVEMENTS.map((a) => a.id));
      for (const id of ach) if (valid.has(id)) s.achievements[id] = Date.now();

      const skin = ls('activeSkin');
      if (skin && D.SKINS.find((k) => k.id === skin)) { s.ship.skin = skin; if (!s.ship.skins.includes(skin)) s.ship.skins.push(skin); }
      const trail = ls('trailStyle');
      if (trail && D.TRAILS.find((t) => t.id === trail)) { s.ship.trail = trail; if (!s.ship.trails.includes(trail)) s.ship.trails.push(trail); }

      const mv = ls('musicVol'), sv = ls('sfxVol'), ms = ls('musicStyle');
      if (mv !== null) s.settings.music = U.clamp(+mv, 0, 100);
      if (sv !== null) s.settings.sfx = U.clamp(+sv, 0, 100);
      const styleMap = { chiptune: 'chiptune', synthwave: 'synthwave', ambient: 'ambient', dnb: 'dnb', synthwave2: 'cyber' };
      if (ms && styleMap[ms]) s.settings.musicStyle = styleMap[ms];
      if (ls('particles') === 'false') s.settings.quality = 'low';
      s.seenIntro = !!ls('everPlayed');
      if (refund > 0) s.notes.push({ type: 'refund', coins: refund });
      s.notes.push({ type: 'v2' });
      console.log('[store] прогресс версии 1.x перенесён, возврат за улучшения:', refund);
      this.save();
    },

    // старые сохранения: ранги в пределах, навыки без пути к ним по древу (3.1) и лишние активные снимаются —
    // очки возвращаются сами (считаются от изученного)
    fixSkillSlots() {
      const s = this.s;
      for (const id of Object.keys(s.skills)) s.skills[id] = Math.min(D.SKILLS[id].max || 1, Math.max(1, Math.floor(+s.skills[id]) || 1));
      let changed = true;
      while (changed) {
        changed = false;
        for (const id of Object.keys(s.skills)) {
          const req = D.SKILLS[id].req;
          if (req && !req.some((r) => s.skills[r])) { delete s.skills[id]; changed = true; }
        }
      }
      const byType = { passive: [], active: [] };
      for (const id of Object.keys(s.skills)) byType[D.SKILLS[id].type].push(id);
      const limit = { passive: D.MAX_PASSIVE, active: D.MAX_ACTIVE };
      for (const t of ['passive', 'active']) {
        while (byType[t].length > limit[t]) delete s.skills[byType[t].pop()];
      }
    },
  };
  SS.store = store;

  // ════════════════════════════════════════════════════════════
  // МЕТА-ПРОГРЕССИЯ
  // ════════════════════════════════════════════════════════════
  const meta = {
    get s() { return store.s; },

    // ── монеты ──
    addCoins(n, earned) {
      n = Math.floor(n);
      if (n <= 0) return;
      this.s.coins += n;
      if (earned !== false) this.s.stats.coinsEarned += n;
      SS.emit('coins', this.s.coins);
      store.soon();
    },
    spend(n) {
      if (SS.DEV) return true;
      if (this.s.coins < n) return false;
      this.s.coins -= n;
      SS.emit('coins', this.s.coins);
      store.save();
      return true;
    },

    // ── оружие ──
    weaponLevel(wid, upId) { const u = this.s.weapons.ups[wid]; return (u && u[upId]) || 0; },
    upCost(wid, upId) {
      const up = D.WEAPONS[wid].ups.find((u) => u.id === upId);
      const lvl = this.weaponLevel(wid, upId);
      return lvl >= up.max ? 0 : up.costs[lvl];
    },
    buyWeaponUp(wid, upId) {
      const up = D.WEAPONS[wid].ups.find((u) => u.id === upId);
      const lvl = this.weaponLevel(wid, upId);
      if (!up || lvl >= up.max || !this.s.weapons.owned.includes(wid)) return false;
      if (!this.spend(up.costs[lvl])) return false;
      const u = (this.s.weapons.ups[wid] = this.s.weapons.ups[wid] || {});
      u[upId] = lvl + 1;
      if (u[upId] >= up.max) this.unlock('max_one_upgrade');
      store.save();
      return true;
    },
    buyWeapon(wid) {
      const w = D.WEAPONS[wid];
      if (!w || this.s.weapons.owned.includes(wid)) return false;
      if (!this.spend(w.price)) return false;
      this.s.weapons.owned.push(wid);
      if (this.s.weapons.loadout.length < 3) this.s.weapons.loadout.push(wid);
      store.save();
      this.checkAchievements();
      return true;
    },
    toggleLoadout(wid) {
      const lo = this.s.weapons.loadout;
      const i = lo.indexOf(wid);
      if (i >= 0) { if (lo.length > 1) lo.splice(i, 1); else return false; }
      else { if (!this.s.weapons.owned.includes(wid)) return false; if (lo.length >= 3) lo.shift(); lo.push(wid); }
      store.save();
      return true;
    },

    // ── пилоты (3.0) ──
    pilotUnlocked(id) { const p = D.PILOTS[id]; return !!p && (SS.DEV || this.s.shipLvl >= p.lvl); },
    setPilot(id) {
      if (!this.pilotUnlocked(id)) return false;
      this.s.pilot = id;
      store.save();
      return true;
    },

    // ── корабли и раскраски ──
    buyShip(id) {
      const sh = D.SHIPS[id];
      if (!sh || this.s.ship.models.includes(id)) return false;
      if (this.s.shipLvl < sh.lvl && !SS.DEV) return false;
      if (!this.spend(sh.price)) return false;
      this.s.ship.models.push(id);
      this.s.ship.model = id;
      if (id === 'ship3') this.unlock('ship3');
      if (id === 'ship6') this.unlock('ship6');
      store.save();
      return true;
    },
    buyTrail(id) {
      const t = D.TRAILS.find((x) => x.id === id);
      if (!t || this.s.ship.trails.includes(id)) return false;
      if (!this.spend(t.price)) return false;
      this.s.ship.trails.push(id);
      this.s.ship.trail = id;
      if (t.fx) this.unlock('trail_fx');
      store.save();
      return true;
    },
    // проверяет условия раскрасок, возвращает только что открытые
    refreshUnlocks() {
      const fresh = [];
      for (const sk of D.SKINS) {
        if (this.s.ship.skins.includes(sk.id)) continue;
        let ok = false;
        try { ok = sk.cond(this.s); } catch (e) { ok = false; }
        if (ok) { this.s.ship.skins.push(sk.id); fresh.push(sk); }
      }
      if (fresh.length) { store.soon(); fresh.forEach((sk) => SS.emit('skinUnlocked', sk)); }
      return fresh;
    },

    // ── 4.0: дроны-напарники ──
    compBuy(id) {
      const d = D.COMPANIONS[id], c = this.s.comp;
      if (!d || c.owned.includes(id) || this.s.shipLvl < d.lvl && !SS.DEV || !this.spend(d.price)) return false;
      c.owned.push(id); c.lv[id] = 1; c.sel = id;
      store.save();
      return true;
    },
    compUp(id) {
      const d = D.COMPANIONS[id], c = this.s.comp, lv = c.lv[id] || 1;
      if (!d || !c.owned.includes(id) || lv >= 5 || !this.spend(d.costs[lv - 1])) return false;
      c.lv[id] = lv + 1;
      store.save();
      return true;
    },

    // ── навыки ──
    skillPointsTotal() { return Math.max(0, this.s.shipLvl - 1) + (this.s.spBonus || 0); },
    skillPointsSpent() { let n = 0; for (const id of Object.keys(this.s.skills)) n += (D.SKILLS[id] ? D.SKILLS[id].cost * (+this.s.skills[id] || 0) : 0); return n; },
    skillPoints() { return Math.max(0, this.skillPointsTotal() - this.skillPointsSpent()); },
    skillCount(type) { return Object.keys(this.s.skills).filter((id) => D.SKILLS[id] && D.SKILLS[id].type === type).length; },
    // 3.1: у навыка бывает несколько рангов; req — нужен хотя бы один из списка
    skillState(id) {
      const sk = D.SKILLS[id], rank = +this.s.skills[id] || 0, max = sk.max || 1;
      const learned = rank > 0, maxed = rank >= max;
      const locked = !!(sk.req && !sk.req.some((r) => this.s.skills[r]));
      const slotsFull = !learned && this.skillCount(sk.type) >= (sk.type === 'active' ? D.MAX_ACTIVE : D.MAX_PASSIVE);
      const afford = this.skillPoints() >= sk.cost;
      return { rank, max, learned, maxed, locked, slotsFull, afford, canLearn: !maxed && !locked && !slotsFull && afford };
    },
    learnSkill(id) {
      const st = this.skillState(id);
      if (!st.canLearn && !(SS.DEV && !st.maxed && !st.locked && !st.slotsFull)) return false;
      if (SS.DEV && !st.afford) this.s.spBonus += D.SKILLS[id].cost;
      this.s.skills[id] = st.rank + 1;
      store.save();
      this.checkAchievements();
      return true;
    },
    // снять все навыки — бесплатно: навыки это выбор стиля, а не вложение
    resetSkills() { const n = Object.keys(this.s.skills).length; this.s.skills = {}; store.save(); return n; },
    // снимает навык и все зависящие от него
    forgetSkill(id) {
      if (!this.s.skills[id]) return [];
      const removed = [id];
      delete this.s.skills[id];
      let changed = true;
      while (changed) {
        changed = false;
        for (const k of Object.keys(this.s.skills)) {
          const req = D.SKILLS[k].req;
          if (req && !req.some((r) => this.s.skills[r])) { delete this.s.skills[k]; removed.push(k); changed = true; }
        }
      }
      store.save();
      return removed;
    },

    // ── опыт корабля ──
    addShipXP(n) {
      const res = { levels: 0, coins: 0 };
      this.s.shipXP += Math.max(0, Math.floor(n));
      let need = D.shipXpNeed(this.s.shipLvl);
      while (this.s.shipXP >= need && this.s.shipLvl < 999) {
        this.s.shipXP -= need;
        this.s.shipLvl++;
        res.levels++;
        const bonus = 50 + this.s.shipLvl * 10;
        res.coins += bonus;
        this.addCoins(bonus, false);
        need = D.shipXpNeed(this.s.shipLvl);
      }
      if (res.levels) SS.emit('shipLevel', this.s.shipLvl, res);
      store.soon();
      return res;
    },

    // ── престиж ──
    canPrestige() { return this.s.shipLvl >= D.PRESTIGE_LVL; },
    prestigeBonus() { const p = this.s.prestige || 0; return { coins: 1 + p * 0.08, dmg: 1 + p * 0.04 }; },
    doPrestige() {
      if (!this.canPrestige()) return false;
      const s = this.s;
      s.prestige = (s.prestige || 0) + 1;
      // прокачка оружия и корабля сохраняется — сбрасываются только уровень и навыки
      s.shipLvl = 1; s.shipXP = 0; s.skills = {};
      this.unlock('prestige1');
      store.save();
      return true;
    },

    // ── достижения ──
    statValue(stat) {
      const s = this.s, st = s.stats;
      switch (stat) {
        case 'bossTypes': return st.bossTypes.length;
        case 'weaponsOwned': return s.weapons.owned.length;
        case 'skillsLearned': return Object.keys(s.skills).length;
        case 'shipsOwned': return s.ship.models.filter((m) => D.SHIPS[m]).length;
        case 'shipLvl': return s.shipLvl;
        case 'evoTypes': return (st.evos || []).length;
        default: return st[stat] || 0;
      }
    },
    unlock(id) {
      if (this.s.achievements[id]) return false;
      const a = D.ACHIEVEMENTS.find((x) => x.id === id);
      if (!a) return false;
      this.s.achievements[id] = Date.now();
      this.addCoins(a.reward, false);
      store.soon();
      SS.emit('achievement', a);
      return true;
    },
    checkAchievements() {
      for (const a of D.ACHIEVEMENTS) {
        if (!a.stat || this.s.achievements[a.id]) continue;
        if (this.statValue(a.stat) >= a.goal) this.unlock(a.id);
      }
      this.refreshUnlocks();
    },

    // ── ежедневные задания ──
    missions() {
      const d = this.s.daily, today = U.today();
      if (d.date !== today) {
        const rnd = U.seeded(U.hashStr(today + ':' + (SS.tg && SS.tg.userId ? SS.tg.userId() : 0)));
        const pool = D.MISSIONS.slice();
        const picked = [];
        while (picked.length < 3 && pool.length) picked.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
        d.date = today;
        d.bonus = false;
        const bw = this.s.stats.bestWave;
        const maxTier = bw >= 15 ? 2 : bw >= 8 ? 1 : 0;
        d.missions = picked.map((m) => {
          const tier = Math.floor(rnd() * (maxTier + 1));
          return { id: m.id, goal: m.goals[tier], reward: m.rewards[tier], progress: 0, done: false };
        });
        store.soon();
      }
      return d.missions;
    },
    missionText(m) {
      const def = D.MISSIONS.find((x) => x.id === m.id);
      return def ? def.text.replace('{n}', U.fmt(m.goal)) : m.id;
    },
    // mode: прибавить значение или зафиксировать максимум
    trackMission(id, value) {
      const list = this.missions();
      for (const m of list) {
        if (m.id !== id || m.done) continue;
        const def = D.MISSIONS.find((x) => x.id === id);
        m.progress = def.max ? Math.max(m.progress, value) : m.progress + value;
        if (m.progress >= m.goal) {
          m.progress = m.goal; m.done = true;
          this.addCoins(m.reward, false);
          SS.emit('mission', m);
        }
      }
      const d = this.s.daily;
      if (!d.bonus && list.length && list.every((m) => m.done)) {
        d.bonus = true;
        this.addCoins(D.DAILY_BONUS, false);
        this.unlock('daily3');
        SS.emit('missionBonus', D.DAILY_BONUS);
      }
      store.soon();
    },

    // ── эволюции оружия ──
    onEvolution(wid) {
      const st = this.s.stats;
      if (!st.evos.includes(wid)) st.evos.push(wid);
      this.unlock('evo1');
      this.checkAchievements();
    },

    // ── урон оружия в секунду ПО ОДНОЙ ЦЕЛИ (примерно, сверено со стендом урона) ──
    // full — с бонусами корабля и престижа (для Боевой мощи); иначе — прокачка оружия и «Корабль» в арсенале
    weaponDps(wid, full) {
      const w = D.WEAPONS[wid], b = w.base, lv = (wid2) => this.weaponLevel(wid, wid2);
      const ship = D.SHIPS[this.s.ship.model].stats, pres = this.prestigeBonus();
      const dm = 1 + lv('dmg') * 0.12 + (full ? (ship.dmg || 0) + pres.dmg - 1 : 0);
      const rate = full ? 1 + (ship.rate || 0) : 1;
      const up = 1 + lv('rate') * 0.08, cd = b.cd / up;
      const mag = b.mag ? b.mag + (wid === 'rocket' ? lv('salvo') : 0) : 0;
      const perSec = mag ? mag / ((mag - 1) * cd + b.reload / up) : 1 / cd;
      let dps = 0;
      if (wid === 'laser') dps = b.dmg * dm / cd * (1 + b.focus * b.focusMax * 0.9);
      else if (wid === 'arc') dps = b.dmg * dm / cd * (b.min + b.max) / 2;
      else if (wid === 'shotgun') dps = b.dmg * dm * (b.pellets + lv('pellets')) * 0.65 * perSec;
      else if (wid === 'rocket') dps = b.dmg * dm * perSec;
      else if (wid === 'plasma') dps = (b.dmg + b.aoe) * dm / cd * (b.min + b.max) / 2;
      else if (wid === 'lightning') dps = b.dmg * dm / cd;
      else if (wid === 'darkmatter') dps = (b.dmg * (b.life / b.tick) * 0.6 + b.burst) * dm / Math.max(cd, b.life);
      return dps * rate;
    },
    // ── Боевая мощь (3.0): урон лучшего оружия × живучесть × навыки. Новичок ≈ 120, всё на максимуме ≈ 850 ──
    power() {
      const s = this.s, ship = D.SHIPS[s.ship.model].stats;
      let dps = 0;
      for (const wid of s.weapons.owned) if (D.WEAPONS[wid]) dps = Math.max(dps, this.weaponDps(wid, true));
      const lives = D.BASE_LIVES + (ship.lives || 0);
      const skills = Object.keys(s.skills).filter((k) => s.skills[k]).length;
      return Math.round(dps * Math.sqrt(lives / D.BASE_LIVES) * (1 + skills * 0.03) * 1.4);
    },
    // сложность открыта: первые три сразу; дальше — волна D.DIFF_UNLOCK_WAVE на предыдущей.
    // Где уже есть рекорд (играли до 3.0) — остаётся открытой
    diffUnlocked(id) {
      const d = D.DIFFS[id], st = this.s.stats.diff;
      if (!d) return false;
      if (!d.unlock || SS.DEV || (st[id] && st[id].wave > 0)) return true;
      return ((st[d.unlock] && st[d.unlock].wave) || 0) >= D.DIFF_UNLOCK_WAVE;
    },
    // страховка: если мощь в 3+ раза выше рекомендуемой, монеты плавно снижаются до ×0,5 (к 6 разам)
    overpowerK(id, power) {
      const rec = D.DIFFS[id] && D.DIFFS[id].power;
      if (!rec) return 1;
      const r = (power === undefined ? this.power() : power) / rec;
      return r <= 3 ? 1 : Math.max(0.5, 1 - (r - 3) / 6);
    },

    // ── испытание дня: правила одинаковы у всех в этот день (зерно — только дата) ──
    challenge() {
      const today = U.todayUTC(), rnd = U.seeded(U.hashStr('challenge:' + today));
      const pool = D.CHALLENGE_MODS.map((m) => m.id), mods = [];
      while (mods.length < 2) {
        const id = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
        // стеклянная пушка без бонусов и форы — слишком жёстко для награды раз в день
        if (id === 'nodrops' && mods.includes('glass') || id === 'glass' && mods.includes('nodrops')) continue;
        mods.push(id);
      }
      const ws = D.WEAPON_ORDER.filter((w) => w !== 'laser');
      return { date: today, mods, weapon: ws[Math.floor(rnd() * ws.length)] };
    },
    // tiers — сколько ступеней наград уже получено сегодня (done — старое поле: первая ступень)
    challengeState() {
      const d = this.s.daily, today = U.todayUTC();
      if (!d.ch || d.ch.date !== today) d.ch = { date: today, best: 0, wave: 0, done: false, tiers: 0 };
      if (d.ch.tiers === undefined) d.ch.tiers = d.ch.done ? 1 : 0;
      return d.ch;
    },
    modText(id, ch) {
      const m = D.CHALLENGE_MODS.find((x) => x.id === id);
      return m ? m.desc.replace('{w}', D.WEAPONS[ch.weapon].name) : id;
    },
    // волна испытания: дошли до ступени — её награда (каждая ступень раз в день)
    challengeWave(ch, wave) {
      const c = this.challengeState();
      if (ch.date !== c.date) return false;
      let got = false;
      while (c.tiers < D.CHALLENGE_TIERS.length && wave >= D.CHALLENGE_TIERS[c.tiers].wave) {
        const t = D.CHALLENGE_TIERS[c.tiers++];
        c.done = true;
        if (c.tiers === 1) { this.s.stats.challenges = (this.s.stats.challenges || 0) + 1; this.unlock('challenge1'); }
        this.addCoins(t.coins, false);
        SS.emit('toast', { ico: '🎲', title: 'ИСПЫТАНИЕ: СТУПЕНЬ ' + c.tiers + ' / ' + D.CHALLENGE_TIERS.length, text: 'Волна ' + t.wave + ' — +' + t.coins + ' монет', dur: 3200 });
        got = true;
      }
      if (got) { this.checkAchievements(); store.save(); }
      return got;
    },

    // ── награда за вход ──
    loginStatus() {
      const d = this.s.daily, today = U.today();
      if (d.loginDate === today) return { available: false, day: (d.streak - 1) % 7, streak: d.streak };
      const gap = d.loginDate ? U.daysBetween(d.loginDate, today) : 99;
      const streak = gap === 1 ? d.streak + 1 : 1;
      return { available: true, day: (streak - 1) % 7, streak };
    },
    claimLogin() {
      const st = this.loginStatus();
      if (!st.available) return null;
      const r = D.LOGIN[st.day];
      const d = this.s.daily;
      d.loginDate = U.today();
      d.streak = st.streak;
      this.addCoins(r.coins, false);
      if (r.sp) this.s.spBonus = (this.s.spBonus || 0) + r.sp;
      if (d.streak >= 7) this.unlock('daily_7');
      store.save();
      return r;
    },

    // ── события забега: пишем в статистику сразу, чтобы прогресс не терялся при закрытии ──
    onKill() {
      this.s.stats.kills++;
      this.trackMission('kills', 1);
    },
    onBoss(id) {
      const st = this.s.stats;
      st.bosses++;
      if (!st.bossTypes.includes(id)) st.bossTypes.push(id);
      this.trackMission('bosses', 1);
      this.checkAchievements();
    },
    onCombo(c) {
      if (c > this.s.stats.maxCombo) this.s.stats.maxCombo = c;
      this.trackMission('combo', c);
    },

    // ── итоги забега ──
    // run: { score, wave, kills, bosses, maxCombo, time, diff, perks, shots, hits }
    finishRun(run) {
      const s = this.s, st = s.stats;
      st.games++;
      st.playTime += run.time;
      st.perks += run.perks;
      st.shots += run.shots;
      st.deaths++;
      // 4.0: режимы (босс-раш, выживание) — свои рекорды; в рекорды сложностей и рейтинг не идут, опыт корабля дают
      let isRecord;
      if (run.mode && run.mode !== 'normal') {
        const md = (st.modes || (st.modes = {}))[run.mode] || (st.modes[run.mode] = { best: 0, wave: 0, time: 0 });
        isRecord = run.score > md.best;
        md.best = Math.max(md.best, run.score); md.wave = Math.max(md.wave, run.wave); md.time = Math.max(md.time, run.time);
      } else {
        isRecord = run.score > st.bestScore;
        st.bestScore = Math.max(st.bestScore, run.score);
        st.bestWave = Math.max(st.bestWave, run.wave);
        const dd = st.diff[run.diff] || (st.diff[run.diff] = { best: 0, wave: 0 });
        dd.best = Math.max(dd.best, run.score);
        dd.wave = Math.max(dd.wave, run.wave);
        if (run.diff === 'nightmare' && run.wave >= 10) this.unlock('nightmare10');
        if (run.diff === 'god' && run.wave >= 15) this.unlock('god_mode_clear');
        if (run.challenge) { const c = this.challengeState(); c.best = Math.max(c.best, run.score); c.wave = Math.max(c.wave, run.wave); }
        // 3.0: рекорды по сложностям — по 10 лучших забегов на каждой (очки разных сложностей не сравниваются)
        s.lb.push({ score: run.score, wave: run.wave, diff: run.diff, date: Date.now() });
        s.lb.sort((a, b) => b.score - a.score);
        const per = {};
        s.lb = s.lb.filter((r) => (per[r.diff] = (per[r.diff] || 0) + 1) <= 10);
      }
      if (run.shots >= 150 && run.hits / run.shots >= 0.8) this.unlock('accuracy80');
      if (run.time >= 600) this.unlock('survive_10min');

      // опыт корабля: за врагов, волны и боссов
      // опыт за врагов и очки нормирован на число врагов и множитель очков, затем умножен на опыт сложности
      const dk = D.DIFFS[run.diff] || D.DIFFS.normal;
      const xp = Math.round((run.kills / dk.count + run.wave * 12 + run.bosses * 120 + run.score / (400 * dk.score * dk.count)) * dk.xp * D.ECON.xp);
      const lvlBefore = s.shipLvl, xpBefore = s.shipXP;
      const res = this.addShipXP(xp);

      this.trackMission('games', 1);
      this.trackMission('score', run.score);
      this.trackMission('wave', run.wave);
      this.trackMission('minutes', run.time / 60);
      this.checkAchievements();
      store.save();
      return { xp, isRecord, lvlBefore, xpBefore, levels: res.levels, lvlCoins: res.coins };
    },
  };
  SS.meta = meta;
})();
