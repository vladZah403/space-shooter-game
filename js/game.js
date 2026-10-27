// ════════════════════════════════════════════════════════════════
// SPACE SHOOTER 2.0 — игровая логика
//  Все движения считаются по времени (dt), поэтому скорость игры одинакова
//  на 60, 90 и 120 Гц. Координаты — CSS-пиксели внутри игрового поля.
// ════════════════════════════════════════════════════════════════
'use strict';

(function () {
  const U = SS.util, D = SS.data;
  let G, FX, A, M;

  const bulletPool = new SS.Pool(() => ({ hit: [] }));
  const ebPool = new SS.Pool(() => ({}));
  const pickPool = new SS.Pool(() => ({}));
  let uid = 1;

  const game = {
    state: 'idle',          // idle | play | cutscene | pause | perk | dying | revive | over
    diffId: 'normal', diff: D.DIFFS.normal,
    t: 0, timeScale: 1, slowT: 0,
    player: null,
    bullets: [], ebullets: [], enemies: [], pickups: [], drones: [],
    boss: null, wave: null, run: null, st: null,
    buffs: {}, blasts: [],
    keys: {},
    pointer: { id: null, x: 0, y: 0, downT: 0, downX: 0, downY: 0, moved: 0, lastTap: 0, lastTapX: 0, lastTapY: 0 },
    ov: { rail: null, hole: null, beams: [], lasers: [] },
    attract: { t: 0 },
    hudDirty: true,
    timers: [],
    scene: null,            // кат-сцена (см. bossScene)
  };
  SS.game = game;

  // ════════════════════════════════════════════════════════════
  // ЗАПУСК / ПАУЗА / КОНЕЦ
  // ════════════════════════════════════════════════════════════
  game.init = function () {
    G = SS.gfx; FX = SS.fx; A = SS.audio; M = SS.meta;
    SS.events.init();
  };

  // отложенное действие по игровому времени (на паузе не идёт, при новом забеге сбрасывается)
  game.after = function (sec, fn) { this.timers.push({ t: sec, fn }); };
  // общий сид испытания дня: на время вызова Math.random подменяется детерминированным генератором —
  // у всех игроков в этот день одинаковый состав волн и выбор улучшений (rng = null — обычная случайность)
  function withRng(rng, fn) {
    if (!rng) return fn();
    const mr = Math.random;
    Math.random = rng;
    try { return fn(); } finally { Math.random = mr; }
  }
  game.runTimers = function (dt) {
    if (!this.timers.length) return;
    const due = [];
    for (const tm of this.timers) { tm.t -= dt; if (tm.t <= 0) due.push(tm); }
    if (!due.length) return;
    this.timers = this.timers.filter((tm) => tm.t > 0);
    for (const tm of due) { try { tm.fn(); } catch (e) { console.error(e); } }
  };

  // o.challenge — испытание дня { date, mods, weapon } (см. meta.challenge)
  game.start = function (diffId, o) {
    const s = M.s, ch = o && o.challenge;
    this.diffId = D.DIFFS[diffId] ? diffId : 'normal';
    this.diff = D.DIFFS[this.diffId];
    if (ch) {
      // правила дня меняют копию сложности, сама таблица сложностей не трогается
      const d = this.diff = Object.assign({}, this.diff);
      if (ch.mods.includes('swift')) { d.spd *= 1.25; d.coins *= 1.5; }
      if (ch.mods.includes('elite')) d.elite = Math.max(0.09, d.elite * 3);
    }
    s.settings.diff = this.diffId;
    // страховка от фарма лёгкой сложности (M.overpowerK) — считается один раз на забег
    this.coinK = M.overpowerK(this.diffId);
    this.clearWorld();
    const S = G.S;
    this.run = {
      score: 0, coins: 0, kills: 0, bosses: 0, bossIds: [], combo: 0, comboT: 0, maxCombo: 0,
      level: 1, xp: 0, pendingPerks: 0, perks: {}, perkCount: 0, rerolls: 0,
      time: 0, shots: 0, hits: 0, pickups: 0, reviveUsed: false, phoenixUsed: false,
      waveDamage: 0, bossDamage: 0, oneHpT: 0, killsForVamp: 0, critsForVamp: 0, detCount: 0, evo: {}, lastHit: '',
      skillCd: {}, skillFx: {}, overload: 0, regenT: 0, shieldRegenT: 0, fever: false,
      lastAchCheck: 0, sector: 0, lastEvent: 0, lastEventId: '', energy: 1, arc: 0, focus: { uid: 0, n: 0, t: 0 },
      mods: {}, repairT: 0, emergT: 0,
      challenge: ch || null, noDrops: !!(ch && ch.mods.includes('nodrops')),
    };
    if (ch && ch.mods.includes('glass')) this.run.perks.glass = 1;
    // испытание дня: свои генераторы для состава волн и выбора улучшений — одинаковые у всех в этот день
    if (ch) { this.run.waveRng = U.seeded(U.hashStr('waves:' + ch.date)); this.run.perkRng = U.seeded(U.hashStr('perks:' + ch.date)); }
    this.st = this.computeStats();
    const st = this.st;
    const p = this.player = {
      x: G.FW / 2, y: G.H * 0.8, w: 56 * S * (D.SHIPS[M.s.ship.model].scale || 1), r: 6 * S, pickR: 28 * S,
      lives: 0, maxLives: 0, shield: false, inv: 2.0, bombs: 0, bombCd: 0,
      tilt: 0, vxs: 0, alive: true,
      weapons: s.weapons.loadout.slice(), weapon: s.weapons.loadout[0] || 'laser', wcd: {}, mag: {}, side: 1,
    };
    p.maxLives = D.BASE_LIVES + (D.SHIPS[s.ship.model].stats.lives || 0);
    p.lives = p.maxLives;
    p.shield = false;
    p.bombs = 1 + (D.SHIPS[s.ship.model].stats.bombs || 0);
    p.wingCd = 0.2;
    if (ch && ch.mods.includes('weapon')) { p.weapons = [ch.weapon]; p.weapon = ch.weapon; }
    if (this.run.perks.glass) { p.maxLives = 1; p.lives = 1; }
    if (ch && ch.mods.includes('perks')) for (let i = 0; i < 3; i++) { const pk = withRng(this.run.perkRng, () => this.perkChoices()).find((x) => !x.filler && x.id !== 'glass'); if (pk) this.grantPerk(pk.id, true); }
    this.buffs = {};
    this.wave = null;
    this.t = 0; this.timeScale = 1; this.slowT = 0;
    G.bg.setSector(0, true);
    G.bg.warp = 0.6;
    this.state = 'play';
    this.hudDirty = true;
    this.nextWave();
    SS.emit('runStart');
    // стартовый модуль корабля — первый выбор забега
    this.after(0.7, () => this.offerModules('start'));
  };

  game.clearWorld = function () {
    for (const b of this.bullets) bulletPool.put(b);
    for (const b of this.ebullets) ebPool.put(b);
    for (const p of this.pickups) pickPool.put(p);
    this.bullets.length = 0; this.ebullets.length = 0; this.pickups.length = 0;
    this.enemies.length = 0; this.drones.length = 0; this.blasts.length = 0;
    this.boss = null;
    this.timers = [];
    if (this.scene) { this.scene = null; SS.emit('cinema', false); }
    this.ov = { rail: null, hole: null, beams: [], lasers: [] };
    SS.enemies.corpses.length = 0;
    SS.events.reset();
    FX.clear();
  };

  game.pause = function () {
    if (this.state === 'cutscene') this.skipScene();
    if (this.state !== 'play') return;
    this.state = 'pause';
    this.pointer.id = null;
    SS.emit('paused', true);
  };
  game.resume = function () {
    if (this.state !== 'pause') return;
    this.state = 'play';
    this.player.inv = Math.max(this.player.inv, 0.6);
    SS.emit('paused', false);
  };
  game.quit = function () {
    this.state = 'idle';
    this.clearWorld();
    SS.emit('runEnd', null);
  };

  // ════════════════════════════════════════════════════════════
  // ХАРАКТЕРИСТИКИ ИГРОКА (мета-прокачка + навыки + улучшения забега)
  // ════════════════════════════════════════════════════════════
  game.perk = function (id) { return (this.run && this.run.perks[id]) || 0; };
  game.skill = function (id) { return !!M.s.skills[id]; };

  game.mod = function (id) { return (this.run && this.run.mods[id]) || 0; };
  game.computeStats = function () {
    const s = M.s, md = (id) => this.mod(id), pk = (id) => this.perk(id), sk = (id) => this.skill(id);
    const ship = D.SHIPS[s.ship.model].stats;
    const pres = M.prestigeBonus();
    const S = G.S;
    let shieldRegen = md('shieldcore') ? 20 : 0;
    if (pk('shieldgen')) { const v = [30, 22, 15][pk('shieldgen') - 1]; shieldRegen = shieldRegen ? Math.min(shieldRegen, v) : v; }
    if (ship.shieldRegen) shieldRegen = shieldRegen ? Math.min(shieldRegen, ship.shieldRegen) : ship.shieldRegen;
    return {
      // бонусы урона складываются в один общий процент, а не перемножаются (иначе к концу прокачки
      // урон рос в 6–7 раз). Прокачка «Мощности» самого оружия добавляется к сумме в dmgMul(wid)
      dmg: 1 + md('power') * 0.2 + (ship.dmg || 0) + (pres.dmg - 1) + pk('dmg') * 0.15 + (sk('sk_sniper') ? 0.5 : 0) + (pk('glass') ? 0.5 : 0) - (pk('ricochet') ? 0.2 : 0) + (this.run && this.run.noDrops ? 0.3 : 0),
      rate: (1 + md('cooling') * 0.15) * (1 + (ship.rate || 0)) * (1 + pk('rate') * 0.12) * (sk('sk_sniper') ? 0.8 : 1),
      crit: 0.03 + md('targeting') * 0.12 + pk('crit') * 0.08 + (ship.crit || 0),
      critMul: 2 + (ship.critMul || 0) + pk('critdmg') * 0.5 + md('targeting') * 0.5,
      pierce: pk('pierce'),
      multi: pk('multi') + (ship.multi || 0),
      wings: ship.wings || md('wings'),
      magnet: sk('sk_magnet') ? 9999 : 120 * S * (md('salvage') ? 1.5 : 1) * (1 + pk('magnet') * 0.5) * (1 + (ship.magnet || 0)),
      // монет за врага меньше там, где врагов больше: доход за волну равен множителю сложности
      coins: this.diff.coins / this.diff.count * (1 + md('salvage') * 0.4) * (1 + pk('greed') * 0.3) * pres.coins * (sk('sk_doublecoins') ? 2 : 1) * this.coinK,
      luck: 1 + pk('luck') * 0.4,
      speed: (1 + (ship.speed || 0)) * (1 + md('gyro') * 0.15) * (1 + pk('speed') * 0.15) * (sk('sk_doublecoins') ? 0.85 : 1),
      dodge: Math.min(0.45, (sk('sk_ghost') ? 0.2 : 0) + pk('speed') * 0.05 + (ship.dodge || 0) + md('gyro') * 0.1),
      cdMul: (1 - pk('cooldown') * 0.15) * (md('chrono') ? 0.7 : 1),
      bomb: 1 + md('bombbay') * 0.6 + (ship.bombdmg || 0),
      bossDmg: 1 + pk('titan') * 0.25 + md('hunter') * 0.35,
      eliteDmg: 1 + md('hunter') * 0.35,
      xp: 1 + md('scanner') * 0.35,
      shieldRegen,
      cryo: pk('cryo') * 0.12,
      nova: pk('nova'),
    };
  };
  game.refreshStats = function () { this.st = this.computeStats(); this.syncDrones(); this.hudDirty = true; };

  // уровни прокачки оружия
  function wl(wid, up) { return M.weaponLevel(wid, up); }

  // ════════════════════════════════════════════════════════════
  // ВВОД
  // ════════════════════════════════════════════════════════════
  // забег идёт (бой или кат-сцена): для паузы и клавиш в main.js. В кат-сцене корабль ведёт сцена
  game.inRun = function () { return this.state === 'play' || this.state === 'cutscene'; };
  game.onPointerDown = function (e) {
    const pt = this.pointer;
    // в любой кат-сцене касание запоминаем — короткий тап её пропускает (onPointerUp)
    if (this.state !== 'play' && this.state !== 'cutscene') return;
    if (pt.id !== null && pt.id !== e.pointerId) return;
    pt.id = e.pointerId; pt.x = e.clientX; pt.y = e.clientY;
    pt.downT = performance.now(); pt.downX = e.clientX; pt.downY = e.clientY; pt.moved = 0;
  };
  game.onPointerMove = function (e) {
    const pt = this.pointer;
    if (pt.id !== e.pointerId) return;
    // палец следим и без управления, чтобы после сцены корабль не прыгнул на накопленный сдвиг
    if (this.state !== 'play') { pt.moved += Math.abs(e.clientX - pt.x) + Math.abs(e.clientY - pt.y); pt.x = e.clientX; pt.y = e.clientY; return; }
    const sens = M.s.settings.sens || 1.25;
    const dx = (e.clientX - pt.x) * sens, dy = (e.clientY - pt.y) * sens;
    pt.x = e.clientX; pt.y = e.clientY;
    pt.moved += Math.abs(dx) + Math.abs(dy);
    const p = this.player;
    if (p && p.alive) { p.x += dx; p.y += dy; this.clampPlayer(); p.vxs += dx; }
  };
  game.onPointerUp = function (e) {
    const pt = this.pointer;
    if (pt.id !== e.pointerId) return;
    pt.id = null;
    const now = performance.now();
    const quick = now - pt.downT < 230 && pt.moved < 18;
    // короткое касание пропускает кат-сцену (ведение пальцем — нет)
    if (this.state === 'cutscene') { if (quick) this.skipScene(); return; }
    if (this.state !== 'play') return;
    if (quick) {
      if (now - pt.lastTap < 320 && Math.hypot(e.clientX - pt.lastTapX, e.clientY - pt.lastTapY) < 60) { this.useBomb(); pt.lastTap = 0; }
      else { pt.lastTap = now; pt.lastTapX = e.clientX; pt.lastTapY = e.clientY; }
    }
  };
  game.onKey = function (e, down) {
    this.keys[e.code] = down;
    if (down && this.state === 'cutscene' && (e.code === 'Space' || e.code === 'Enter')) { this.skipScene(); return; }
    if (!down || this.state !== 'play') return;
    if (e.code === 'KeyB' || e.code === 'Space') this.useBomb();
    if (e.code === 'KeyQ') this.useSkill(0);
    if (e.code === 'KeyE') this.useSkill(1);
    if (e.code.startsWith('Digit')) { const i = +e.code.slice(5) - 1; if (this.player.weapons[i]) this.setWeapon(this.player.weapons[i]); }
  };
  game.clampPlayer = function () {
    const p = this.player, m = p.w * 0.42;
    const bottom = G.H - (SS.ui ? SS.ui.bottomInset() : 90) - p.w * 0.45;
    p.x = U.clamp(p.x, m, G.FW - m);
    p.y = U.clamp(p.y, G.H * 0.14, Math.max(G.H * 0.5, bottom));
  };
  game.setWeapon = function (wid) {
    const p = this.player;
    if (!p || !p.weapons.includes(wid) || p.weapon === wid) return;
    p.weapon = wid;
    A.play('click');
    SS.tg.haptic('select');
    this.hudDirty = true;
  };

  // ════════════════════════════════════════════════════════════
  // ГЛАВНЫЙ ЦИКЛ
  // ════════════════════════════════════════════════════════════
  game.frame = function (rdt) {
    if (this.state === 'play' || this.state === 'dying' || this.state === 'cutscene') {
      if (this.slowT > 0) { this.slowT -= rdt; this.timeScale = U.lerp(this.timeScale, 0.3, 0.2); }
      else this.timeScale = U.lerp(this.timeScale, 1, Math.min(1, rdt * 6));
      const dt = Math.min(rdt, 1 / 30) * this.timeScale;
      this.update(dt, rdt);
    } else if (this.state === 'idle') {
      this.attract.t += rdt;
      G.bg.update(rdt, 0.6);
      FX.update(rdt);
    } else {
      // пауза / выбор улучшения / экран итогов — фон слегка живёт
      G.bg.update(rdt, this.state === 'over' ? 0.4 : 0.05);
    }
  };

  game.update = function (dt, rdt) {
    const p = this.player, run = this.run, st = this.st;
    this.t += dt;
    run.time += dt;
    const slow = this.enemySlow();
    const edt = dt * slow;

    // ── управление с клавиатуры ──
    if (p.alive && this.state === 'play') {
      let kx = 0, ky = 0;
      const k = this.keys;
      if (k.ArrowLeft || k.KeyA) kx--; if (k.ArrowRight || k.KeyD) kx++;
      if (k.ArrowUp || k.KeyW) ky--; if (k.ArrowDown || k.KeyS) ky++;
      if (kx || ky) {
        const sp = 400 * G.S * st.speed * dt, n = Math.hypot(kx, ky);
        p.x += kx / n * sp; p.y += ky / n * sp; p.vxs += kx / n * sp;
        this.clampPlayer();
      }
    }
    // крен корабля по горизонтальной скорости
    p.tilt = U.damp(p.tilt, U.clamp(p.vxs * 0.035, -0.32, 0.32), 10, rdt);
    p.vxs = U.damp(p.vxs, 0, 14, rdt);

    this.updateTimers(dt);
    this.runTimers(dt);
    // заряд дуги копится от движения корабля (только в бою), без движения стекает
    if (p.weapons.includes('arc')) {
      const ab = D.WEAPONS.arc.base, mv = this.state === 'play' && p.lx !== undefined ? Math.hypot(p.x - p.lx, p.y - p.ly) : 0;
      run.arc = U.clamp(run.arc + mv / (G.FW * ab.charge) - dt * ab.drain, 0, 1);
    }
    // скорость корабля (сглаженная) — по ней враги берут упреждение (aimAt)
    if (p.lx !== undefined && dt > 0) { p.vxm = U.damp(p.vxm || 0, (p.x - p.lx) / dt, 6, dt); p.vym = U.damp(p.vym || 0, (p.y - p.ly) / dt, 6, dt); }
    p.lx = p.x; p.ly = p.y;
    if (run.focus.t > 0) run.focus.t -= dt;
    if (p.alive && this.state === 'play') this.fireWeapons(dt);
    this.updateDrones(dt);
    this.updateBullets(dt);
    SS.enemies.updateAll(edt, dt);
    this.updateEBullets(edt);
    this.collide();
    this.processBlasts();
    this.updatePickups(dt);
    this.updateWaves(dt);
    if (this.scene) this.updateScene(dt);
    SS.events.update(dt);
    this.updateOverlays(dt);
    this.cleanup();
    FX.update(dt);
    G.bg.update(dt, this.boss ? 1.4 : 1);

    // комбо
    if (run.combo > 0) {
      run.comboT -= dt;
      if (run.comboT <= 0) { run.combo = 0; this.setFever(false); this.hudDirty = true; }
    }
    // уровень забега → выбор улучшения
    if (run.pendingPerks > 0 && this.state === 'play' && p.alive) this.offerPerk();

    // достижения по времени
    if (p.lives === 1 && p.alive) { run.oneHpT += dt; if (run.oneHpT >= 60) M.unlock('survive_1hp'); } else run.oneHpT = 0;
    if (run.time - run.lastAchCheck > 1.5) { run.lastAchCheck = run.time; M.checkAchievements(); }
  };

  game.enemySlow = function () {
    let s = 1;
    if (this.run.skillFx.sk_timewarp > 0) s *= 0.33;
    if (this.buffs.freeze > 0) s *= 0.25;
    return s;
  };

  game.updateTimers = function (dt) {
    const p = this.player, run = this.run, st = this.st;
    if (p.inv > 0) p.inv -= dt;
    if (p.bombCd > 0) p.bombCd -= dt;
    if (p.lockT > 0) p.lockT -= dt;
    if (this.buffs.freeze > 0 && FX.quality > 0 && Math.random() < dt * 45) FX.frost(Math.random() * G.FW, Math.random() * G.H * 0.85);
    if (p.lockHot > 0) p.lockHot -= dt;
    for (const k in this.buffs) { if (this.buffs[k] > 0) { this.buffs[k] -= dt; if (this.buffs[k] <= 0) { delete this.buffs[k]; this.hudDirty = true; } } }
    for (const k in run.skillCd) if (run.skillCd[k] > 0) run.skillCd[k] = Math.max(0, run.skillCd[k] - dt);
    for (const k in run.skillFx) if (run.skillFx[k] > 0) run.skillFx[k] = Math.max(0, run.skillFx[k] - dt);
    if (run.overload > 0) run.overload -= dt;
    // восстановление щита
    if (st.shieldRegen && !p.shield && p.alive) {
      run.shieldRegenT += dt;
      if (run.shieldRegenT >= st.shieldRegen) { run.shieldRegenT = 0; p.shield = true; this.shieldFx(); A.play('powerup', { vol: 0.5 }); this.hudDirty = true; }
    }
    // регенерация (навык)
    if (this.mod('repair') && p.alive && p.lives < p.maxLives) {
      run.repairT += dt;
      if (run.repairT >= 60) { run.repairT = 0; this.heal(1, '🔧 РЕМОНТ'); }
    }
    if (this.mod('emergency') && p.alive && p.lives === 1 && !p.shield) {
      run.emergT += dt;
      if (run.emergT >= 12) { run.emergT = 0; p.shield = true; this.shieldFx(); this.hudDirty = true; }
    } else run.emergT = 0;
    if (this.skill('sk_regen') && p.alive && p.lives < p.maxLives) {
      run.regenT += dt;
      if (run.regenT >= (p.lives === 1 ? 20 : 45)) { run.regenT = 0; this.heal(1, '💚 РЕГЕНЕРАЦИЯ'); }
    }
  };

  // ════════════════════════════════════════════════════════════
  // ОРУЖИЕ
  // ════════════════════════════════════════════════════════════
  game.rateMul = function () {
    let r = this.st.rate;
    if (this.buffs.rapid > 0) r *= 1.6;
    if (this.run.skillFx.sk_overclock > 0) r *= 2.5;
    if (this.run.overload > 0) r *= 2;
    return r;
  };
  // wid — оружие: его прокачка урона входит в общую сумму бонусов. Временные состояния
  // (бонус «Усиление», берсерк) остаются множителями — они ситуативны, как криты
  game.dmgMul = function (wid) {
    let d = this.st.dmg + (wid ? wl(wid, 'dmg') * 0.12 : 0);
    if (this.buffs.power > 0) d *= 1.6;
    if (this.skill('sk_berserker')) {
      const p = this.player;
      const lost = p.maxLives > 1 ? (p.maxLives - p.lives) / (p.maxLives - 1) : 0;
      d *= 1 + 0.6 * U.clamp(p.lives <= 1 ? 1 : lost, 0, 1);
    }
    return d;
  };

  // ── магазин (ракеты, дробовик): серия выстрелов, потом перезарядка. Она идёт для всех оружий
  //    в слотах, даже невыбранных: выпустил залп — переключился — вернулся с полным магазином ──
  function magSize(wid) { return D.WEAPONS[wid].base.mag + (wid === 'rocket' ? wl(wid, 'salvo') : 0); }
  game.mag = function (wid) {
    const def = D.WEAPONS[wid];
    if (!def || !def.base.mag) return null;
    return this.player.mag[wid] || (this.player.mag[wid] = { n: magSize(wid), t: 0 });
  };
  // ресурс оружия для HUD: k 0..1 и вид — магазин, перезарядка, энергия, заряд, фокус (null — ресурса нет)
  game.weaponRes = function (wid) {
    const run = this.run, def = D.WEAPONS[wid];
    if (!def || !run) return null;
    const b = def.base;
    if (b.mag) {
      const m = this.mag(wid), size = magSize(wid);
      return m.n > 0 ? { kind: 'mag', k: m.n / size, n: m.n, max: size } : { kind: 'reload', k: U.clamp(1 - m.t / b.reload, 0, 1) };
    }
    if (wid === 'lightning') return { kind: 'energy', k: run.energy };
    // заряд серпа — бонус к урону, а не патроны: без движения шкалы нет совсем (иначе выглядит «разряжено»)
    if (wid === 'arc') return run.arc > 0.04 ? { kind: 'charge', k: run.arc } : null;
    if (wid === 'laser' && run.focus.t > 0 && run.focus.n > 1) return { kind: 'focus', k: run.focus.n / b.focusMax };
    return null;
  };

  game.updateMags = function (dt) {
    const p = this.player;
    for (const wid of p.weapons) {
      const m = this.mag(wid);
      if (!m || m.n > 0) continue;
      m.t -= dt * this.rateMul() * (1 + wl(wid, 'rate') * 0.08);
      if (m.t <= 0) {
        m.n = magSize(wid);
        if (wid === p.weapon) A.play('click', { rate: 1.6, vol: 0.5 });
        this.hudDirty = true;
      }
    }
  };

  game.fireWeapons = function (dt) {
    const p = this.player;
    const wid = p.weapon;
    const def = D.WEAPONS[wid];
    if (!def) return;
    this.updateMags(dt);
    const m = this.mag(wid);
    let cd = def.base.cd / (1 + (wl(wid, 'rate') * 0.08));
    p.wcd[wid] = (p.wcd[wid] || 0) - dt * this.rateMul();
    let guard = 0;
    // тёмная материя: новая сфера — только когда прошлая схлопнулась
    const sphere = wid === 'darkmatter' && this.bullets.some((b) => !b.dead && b.kind === 'dark');
    while (p.wcd[wid] <= 0 && guard++ < 3) {
      // магазин пуст — ждём перезарядку, первый выстрел после неё сразу
      if ((m && m.n <= 0) || sphere) { p.wcd[wid] = 0; break; }
      this.fire(wid);
      if (m && --m.n <= 0) { m.t = def.base.reload; this.hudDirty = true; }
      p.wcd[wid] += cd;
    }
    if (p.wcd[wid] < -cd) p.wcd[wid] = 0;
    // бортовые пушки стреляют независимо от выбранного оружия
    if (this.st.wings) {
      p.wingCd -= dt * this.rateMul();
      if (p.wingCd <= 0) {
        p.wingCd = 0.26;
        const S = G.S, dmg = 4.5 * this.dmgMul();
        for (const sd of [-1, 1]) shot({ x: p.x + sd * p.w * 0.4, y: p.y - p.w * 0.05, vx: sd * 30 * S, vy: -980 * S, dmg, r: 4 * S, kind: 'laser', sprite: 'pb_bolt_s', w: 10 * S, pierce: this.st.pierce, wid: 'wings', life: 1.4 });
      }
    }
  };

  function shot(o) {
    const b = bulletPool.get();
    b.x = o.x; b.y = o.y; b.px = o.x; b.py = o.y; b.vx = o.vx; b.vy = o.vy;
    b.dmg = o.dmg; b.r = o.r; b.kind = o.kind; b.sprite = o.sprite || null; b.cv = o.cv || null; b.w = o.w;
    b.pierce = o.pierce || 0; b.hit.length = 0; b.life = b.life0 = o.life || 2.4; b.age = 0; b.w1 = o.w1 || 0; b.ch = o.ch || 0;
    b.homing = o.homing || 0; b.aoe = o.aoe || 0; b.aoeR = o.aoeR || 0; b.acc = o.acc || 0; b.maxSpd = o.maxSpd || 0;
    b.bounced = false; b.fade = 0; b.tick = 0; b.tickT = o.tickT || 0; b.pull = o.pull || 0; b.burst = o.burst || 0; b.burstR = o.burstR || 0;
    b.rot = 0; b.wid = o.wid || ''; b.dead = false; b.target = null;
    game.bullets.push(b);
    return b;
  }

  game.fire = function (wid) {
    const p = this.player, S = G.S, st = this.st;
    const def = D.WEAPONS[wid], base = def.base;
    const dmgMul = this.dmgMul(wid);
    const multi = st.multi + (this.buffs.multi > 0 ? 2 : 0);
    // дополнительные снаряды бьют слабее основного: ×1.6 за первый, ×2.8 за три
    const mk = (1 + multi * 0.6) / (1 + multi);
    const spread = this.buffs.spread > 0;
    const nose = p.y - p.w * 0.42;
    this.run.shots++;

    if (wid === 'laser') {
      const lvl = wl(wid, 'dmg');
      const beam = this.evo('laser');
      const sprite = (beam || lvl >= 8) && G.frame('fx_charge') ? 'fx_charge' : lvl >= 6 ? 'pb_laser' : lvl >= 3 ? 'pb_bolt_m' : 'pb_bolt_s';
      const sw = (sprite === 'fx_charge' ? (beam ? 22 : 18) : sprite === 'pb_laser' ? 13 : sprite === 'pb_bolt_m' ? 15 : 13) * S;
      const n = 1 + multi, gap = 10 * S, pierce = beam ? 99 : wl(wid, 'pierce') + st.pierce;
      const dmgMul2 = beam ? dmgMul * 1.25 : dmgMul;
      const spd = base.speed * S;
      for (let i = 0; i < n; i++) {
        const ox = (i - (n - 1) / 2) * gap;
        shot({ x: p.x + ox, y: nose, vx: 0, vy: -spd, dmg: base.dmg * dmgMul2 * mk, r: 5 * S, kind: 'laser', sprite, w: sw, pierce, wid, life: 1.6 });
      }
      if (spread) for (const a of [-0.22, 0.22]) shot({ x: p.x, y: nose, vx: Math.sin(a) * spd, vy: -Math.cos(a) * spd, dmg: base.dmg * dmgMul * 0.8, r: 5 * S, kind: 'laser', sprite, w: sw, pierce, wid, life: 1.6 });
      A.play('laser');
    } else if (wid === 'shotgun') {
      const n = base.pellets + wl(wid, 'pellets') + multi * 2;
      const arc = 0.78 + (spread ? 0.35 : 0) + multi * 0.06;
      const cv = G.tinted('pb_orb', { hue: 44 });
      for (let i = 0; i < n; i++) {
        const a = (n === 1 ? 0 : (i / (n - 1) - 0.5) * arc) + U.rand(-0.03, 0.03);
        const spd = base.speed * S * U.rand(0.9, 1.08);
        shot({ x: p.x, y: nose, vx: Math.sin(a) * spd, vy: -Math.cos(a) * spd, dmg: base.dmg * dmgMul, r: 6 * S, kind: 'pellet', cv, w: 14 * S, pierce: st.pierce, wid, life: base.life });
      }
      FX.glowPuff(p.x, nose, '#ffd23d', 40 * S, 0.1);
      A.play('shotgun');
    } else if (wid === 'rocket') {
      // одна ракета из залпа (+ ракеты от «Мультивыстрела»); размер залпа — магазин (magSize)
      const n = 1 + multi;
      const radius = base.radius * S * (1 + wl(wid, 'aoe') * 0.15);
      const rs = wl(wid, 'dmg') >= 4 ? 'fx_rocket2' : 'fx_rocket', rw = (rs === 'fx_rocket2' ? 14 : 13) * S;
      for (let i = 0; i < n; i++) {
        p.side = -p.side;
        const out = p.side * (0.55 + i * 0.12) + (spread ? p.side * 0.3 : 0);
        shot({ x: p.x + p.side * p.w * 0.3, y: p.y - p.w * 0.05, vx: Math.sin(out) * 260 * S, vy: -Math.cos(out) * 260 * S,
          dmg: base.dmg * dmgMul * mk, aoe: base.aoe * dmgMul * mk, aoeR: radius, r: 7 * S, kind: 'rocket', sprite: rs, w: rw,
          homing: 6.5, acc: 900 * S, maxSpd: base.speed * S, wid, life: 2.4 });
      }
      A.play('rocket');
    } else if (wid === 'plasma') {
      const radius = base.radius * S * (1 + wl(wid, 'aoe') * 0.15);
      const orb = G.frame('fx_plasma2'), cv = G.tinted(orb ? 'fx_plasma2' : 'eb_fire', { hue: 305 }), pw = (orb ? 1.35 : 1) * S;
      const n = 1 + multi;
      for (let i = 0; i < n; i++) {
        const a = (i - (n - 1) / 2) * 0.16 + (spread && i === 0 ? 0 : 0);
        shot({ x: p.x, y: nose, vx: Math.sin(a) * base.speed * S, vy: -Math.cos(a) * base.speed * S, dmg: base.dmg * dmgMul * mk, aoe: base.aoe * dmgMul * mk, aoeR: radius,
          r: 12 * S, kind: 'plasma', cv, w: 40 * pw, wid, life: 2.6 });
      }
      if (spread) for (const a of [-0.35, 0.35]) shot({ x: p.x, y: nose, vx: Math.sin(a) * base.speed * S, vy: -Math.cos(a) * base.speed * S, dmg: base.dmg * dmgMul * 0.6, aoe: base.aoe * dmgMul * 0.6, aoeR: radius * 0.8, r: 10 * S, kind: 'plasma', cv, w: 30 * pw, wid, life: 2.6 });
      A.play('plasma');
    } else if (wid === 'lightning') {
      // полный разряд тратит энергию (только если нашёл цель); без энергии — слабая искра в одну цель
      const run = this.run, full = run.energy > 0;
      const jumps = full ? base.chain + wl(wid, 'chain') + (this.skill('sk_conductor') ? 2 : 0) + multi : 0;
      const range = base.range * S * (1 + wl(wid, 'range') * 0.15);
      const ldmg = base.dmg * dmgMul * (1 + multi * 0.15) * (full ? 1 : base.spark);
      if (this.chainLightning(p.x, nose, ldmg, jumps, range, 360 * S, false, !full) && full) { run.energy = Math.max(0, run.energy - base.cost); this.hudDirty = true; }
      if (spread && full) this.chainLightning(p.x, nose, ldmg * 0.6, Math.ceil(jumps / 2), range, 360 * S, true);
      A.play('zap', full ? undefined : { vol: 0.4, rate: 1.6 });
    } else if (wid === 'arc') {
      // серп: волна-полумесяц летит вперёд, расширяется и прошивает всех на пути; заряд от движения — шире и сильнее
      // «Мультивыстрел» не добавляет волн (экран заливало), а делает волну шире и сильнее
      const ch = this.run.arc, k = base.min + (base.max - base.min) * ch, span = 1 + wl(wid, 'range') * 0.08;
      const wk = span * (0.85 + 0.3 * ch) * (1 + multi * 0.08);
      const wave = (a, dmg, wmul) => shot({ x: p.x, y: nose, vx: Math.sin(a) * base.speed * S, vy: -Math.cos(a) * base.speed * S, dmg, r: base.thick * S,
        kind: 'wave', w: base.w0 * S * wk * wmul, w1: base.w1 * S * wk * wmul, wid, life: base.life * Math.sqrt(span), ch });
      wave(0, base.dmg * dmgMul * k * (1 + multi * 0.12), 1);
      if (spread) for (const a of [-0.4, 0.4]) wave(a, base.dmg * dmgMul * k * 0.5, 0.6);
      A.play('arc');
    } else if (wid === 'darkmatter') {
      const radius = base.radius * S * (1 + wl(wid, 'aoe') * 0.15);
      const pull = base.pull * S * (1 + wl(wid, 'pull') * 0.2);
      const n = 1 + multi + (spread ? 2 : 0);
      for (let i = 0; i < n; i++) {
        const a = (i - (n - 1) / 2) * 0.42;
        shot({ x: p.x, y: nose, vx: Math.sin(a) * base.speed * S, vy: -Math.cos(a) * base.speed * S, dmg: base.dmg * dmgMul * mk, r: radius, kind: 'dark',
          w: radius * 1.1, tickT: base.tick, pull, burst: base.burst * dmgMul * mk, burstR: radius * 1.25, wid, life: base.life });
      }
      A.play('dark');
    }
  };

  // цепная молния: ищет ближайшую цель выше корабля, затем прыгает
  // weak — искра без энергии: тоньше и бледнее
  game.chainLightning = function (x, y, dmg, jumps, range, firstRange, alt, weak) {
    const hit = [];
    let cx = x, cy = y, cur = null;
    const pts = [[x, y]];
    for (let j = 0; j <= jumps; j++) {
      let best = null, bd = Infinity;
      const R = j === 0 ? firstRange : range;
      for (const e of this.enemies) {
        if (!e.alive || !e.hittable || hit.includes(e)) continue;
        let d = Math.hypot(e.x - cx, e.y - cy);
        if (j === 0 && e.y > cy + 20) d *= 2.2; // предпочитаем цели впереди
        if (alt && j === 0 && cur === null && Math.random() < 0.5) d *= 1.4;
        if (d < R + e.r && d < bd) { bd = d; best = e; }
      }
      if (!best) break;
      hit.push(best);
      pts.push([best.x, best.y]);
      const icy = this.evo('lightning');
      FX.lightning(cx, cy, best.x, best.y, icy ? '#9be8ff' : weak ? '#e9e6c0' : '#fff36b', (weak ? 1.2 : 2.6) * G.S, 0.14);
      if (icy && !best.boss) best.frozen = 2;
      if (!weak) FX.sprite('fx_bolt', best.x, best.y, { w0: 22 * G.S, w1: 34 * G.S, dur: 0.18, hold: 0.3, rot: U.rand(-0.6, 0.6), hue: 52, minor: true });
      this.damageEnemy(best, dmg * Math.pow(D.WEAPONS.lightning.base.falloff, j), { crit: true, src: 'lightning' });
      cx = best.x; cy = best.y; cur = best;
    }
    if (!hit.length) {
      // разряд «в пустоту» — просто визуал
      FX.lightning(x, y, x + U.rand(-30, 30) * G.S, y - 120 * G.S, '#fff36b', 2 * G.S, 0.1);
    } else this.run.hits++;
    return hit.length;
  };

  // ── серп: волна — дуга окружности радиуса R, выгнутая по курсу; полуширина растёт за время жизни ──
  function waveGeom(b) {
    const half = (b.w + (b.w1 - b.w) * Math.min(1, b.age / b.life0)) / 2, R = half * 1.6, ang = Math.atan2(b.vy, b.vx);
    return { R, ang, cx: b.x - Math.cos(ang) * R, cy: b.y - Math.sin(ang) * R, span: Math.asin(Math.min(1, half / R)) };
  }
  // враг задет, если его центр у дуги (с учётом размера); каждого — один раз за волну
  game.waveHits = function (b) {
    const w = waveGeom(b);
    for (const e of this.enemies) {
      if (!e.alive || !e.hittable || b.hit.includes(e.uid)) continue;
      const er = e.rx ? Math.max(e.rx, e.ry) * 0.8 : e.r;
      if (Math.abs(Math.hypot(e.x - w.cx, e.y - w.cy) - w.R) > b.r + er) continue;
      if (Math.abs(U.angleDiff(w.ang, Math.atan2(e.y - w.cy, e.x - w.cx))) > w.span + er / w.R) continue;
      b.hit.push(e.uid);
      this.run.hits++;
      this.damageEnemy(e, b.dmg, { crit: true, src: 'arc' });
      FX.hit(e.x, e.y, '#bff9ff');
      // каждый пробитый враг ослабляет волну; совсем слабая — гаснет
      const ab = D.WEAPONS.arc.base;
      b.dmg *= 1 - ab.pierceLoss;
      if (b.hit.length >= Math.log(ab.minLeft) / Math.log(1 - ab.pierceLoss)) { b.dead = true; return; }
    }
  };

  // ── дроны-напарники (улучшение забега) ──
  game.syncDrones = function () {
    const n = this.perk('drone');
    while (this.drones.length < n) this.drones.push({ x: this.player.x, y: this.player.y, cd: 0.3 * this.drones.length, side: this.drones.length ? 1 : -1 });
    this.drones.length = n;
  };
  game.updateDrones = function (dt) {
    const p = this.player, S = G.S;
    for (let i = 0; i < this.drones.length; i++) {
      const d = this.drones[i];
      const tx = p.x + d.side * p.w * 0.95, ty = p.y + p.w * 0.25 + Math.sin(this.t * 3 + i) * 6 * S;
      d.x = U.damp(d.x, tx, 9, dt); d.y = U.damp(d.y, ty, 9, dt);
      d.cd -= dt * this.rateMul();
      // в кат-сценах дроны молчат, как и сам корабль
      if (d.cd <= 0 && p.alive && this.state === 'play') {
        d.cd = 0.38;
        let tgt = null, bd = 420 * S;
        for (const e of this.enemies) { if (!e.alive || !e.hittable || e.y > d.y) continue; const dd = Math.hypot(e.x - d.x, e.y - d.y); if (dd < bd) { bd = dd; tgt = e; } }
        const a = tgt ? Math.atan2(tgt.y - d.y, tgt.x - d.x) : -Math.PI / 2;
        shot({ x: d.x, y: d.y, vx: Math.cos(a) * 900 * S, vy: Math.sin(a) * 900 * S, dmg: 7 * this.dmgMul(), r: 4 * S, kind: 'drone', sprite: 'pb_bolt_s', w: 10 * S, wid: 'drone', life: 1.2 });
      }
    }
  };

  // ════════════════════════════════════════════════════════════
  // СНАРЯДЫ ИГРОКА
  // ════════════════════════════════════════════════════════════
  game.updateBullets = function (dt) {
    const FW = G.FW, H = G.H, S = G.S;
    const ric = this.skill('sk_ricochet') || this.perk('ricochet') > 0;
    for (const b of this.bullets) {
      if (b.dead) continue;
      b.age += dt; b.life -= dt;
      b.px = b.x; b.py = b.y;
      if (b.kind === 'rocket') {
        // самонаведение с ограниченной скоростью поворота
        if (!b.target || !b.target.alive) b.target = this.nearestEnemy(b.x, b.y, true);
        let sp = Math.hypot(b.vx, b.vy);
        sp = Math.min(b.maxSpd, sp + b.acc * dt);
        let ang = Math.atan2(b.vy, b.vx);
        if (b.target && b.age > 0.12) {
          const want = Math.atan2(b.target.y - b.y, b.target.x - b.x);
          ang += U.clamp(U.angleDiff(ang, want), -b.homing * dt, b.homing * dt);
        } else if (b.age > 0.12) ang += U.clamp(U.angleDiff(ang, -Math.PI / 2), -3 * dt, 3 * dt);
        b.vx = Math.cos(ang) * sp; b.vy = Math.sin(ang) * sp;
        if (Math.random() < (G.frame('fx_tr_rocket') ? 0.3 : 0.7)) FX.glowPuff(b.x - b.vx * 0.02, b.y - b.vy * 0.02, '#ff9f3d', 14 * S, 0.18);
        if (FX.quality > 0 && Math.random() < 0.35) FX.smoke(b.x - b.vx * 0.03, b.y - b.vy * 0.03, 1, 7 * S);
      } else if (b.kind === 'dark') {
        b.vx *= Math.exp(-0.85 * dt); b.vy *= Math.exp(-0.85 * dt);
        b.rot += dt * 5;
        b.tick -= dt;
        if (b.tick <= 0) {
          b.tick = b.tickT;
          for (const e of this.enemies) {
            if (!e.alive || !e.hittable) continue;
            const d = Math.hypot(e.x - b.x, e.y - b.y);
            if (e.rx ? SS.enemies.hitTest(e, b.x, b.y, b.r) : d < b.r + e.r) this.damageEnemy(e, b.dmg, { src: 'dark', noText: true });
          }
        }
        // притяжение (боссы не двигаются)
        for (const e of this.enemies) {
          if (!e.alive || e.boss || e.mini) continue;
          const dx = b.x - e.x, dy = b.y - e.y, d = Math.hypot(dx, dy);
          if (d > 1 && d < b.r * 2.2) { const f = b.pull * (1 - d / (b.r * 2.2)) * dt; e.x += dx / d * f; e.y += dy / d * f; }
        }
        if (FX.quality > 0 && Math.random() < 0.5) { const a = Math.random() * U.TAU; FX.embers(b.x + Math.cos(a) * b.r, b.y + Math.sin(a) * b.r, '#b06bff', 1, 40); }
        if (b.life <= 0) { this.darkBurst(b); b.dead = true; continue; }
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (ric && !b.bounced && (b.kind === 'laser' || b.kind === 'pellet' || b.kind === 'drone')) {
        if (b.x < 0 || b.x > FW) { b.vx = -b.vx; b.x = U.clamp(b.x, 0, FW); b.bounced = true; FX.hit(b.x, b.y, '#7fe7ff'); }
        else if (b.y < 0) {
          // от верха — под случайным углом, медленнее и недалеко: обратные снаряды тают в верхней
          // части поля и не долетают до корабля (раньше летели строго вниз через весь экран)
          const sp = Math.hypot(b.vx, b.vy) * 0.7, a = Math.atan2(-b.vy, b.vx) + U.rand(-0.45, 0.45);
          b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.y = 0; b.bounced = true;
          b.life = b.fade = Math.min(b.life, 0.45);
          if (Math.random() < 0.5) FX.hit(b.x, 2, '#7fe7ff');
        }
      }
      if (b.life <= 0 || b.y < -60 || b.y > H + 60 || b.x < -60 || b.x > FW + 60) {
        if (b.kind === 'rocket' && b.life <= 0) this.rocketBlast(b, null);
        if (b.kind === 'plasma' && b.life <= 0) this.plasmaBlast(b, null);
        b.dead = true;
      }
    }
  };

  game.nearestEnemy = function (x, y, preferAhead) {
    let best = null, bd = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || !e.hittable || e.y < -20) continue;
      let d = Math.hypot(e.x - x, e.y - y);
      if (preferAhead && e.y > y) d *= 1.8;
      if (e.boss) d *= 0.8;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  };

  // попадает ли взрыв радиуса R в точке (x, y) по кораблю (у крупных — эллиптический корпус)
  game.inBlast = function (e, x, y, R) {
    return e.rx ? SS.enemies.hitTest(e, x, y, R, 0.6) : Math.hypot(e.x - x, e.y - y) < R + e.r * 0.5;
  };

  game.rocketBlast = function (b, direct) {
    FX.explode(b.x, b.y, 0.8, '#ff9f3d');
    if (this.evo('rocket')) {
      const R = b.aoeR * 1.1;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4, x = b.x + Math.cos(a) * R, y = b.y + Math.sin(a) * R;
        this.after(0.1 + i * 0.05, () => this.blast(x, y, b.aoeR * 0.55, b.aoe * 0.45, '#ffb03d', 'rocket'));
      }
    }
    A.play('explodeS', { vol: 0.7 });
    for (const e of this.enemies) {
      if (!e.alive || !e.hittable || e === direct) continue;
      if (this.inBlast(e, b.x, b.y, b.aoeR)) this.damageEnemy(e, b.aoe, { src: 'rocket', heavy: true });
    }
  };
  // рост плазмы: доля пути до полной силы 0..1 и множитель урона base.min..base.max
  function plasmaGrow(b) { const pb = D.WEAPONS.plasma.base; return U.clamp(b.age * Math.hypot(b.vx, b.vy) / (G.H * pb.grow), 0, 1); }
  function plasmaK(b) { const pb = D.WEAPONS.plasma.base; return b.wid === 'plasma' ? pb.min + (pb.max - pb.min) * plasmaGrow(b) : 1; }
  game.plasmaBlast = function (b, direct) {
    const g = b.wid === 'plasma' ? plasmaGrow(b) : 1, k = plasmaK(b), R = b.aoeR * (0.8 + 0.3 * g);
    FX.explode(b.x, b.y, 0.9 + 0.6 * g, '#ff5cf0', { kind: 'plasma', hue: 315 });
    FX.ring(b.x, b.y, 8, R, '#ff8af5', 0.35, 4);
    FX.shake(0.06 + 0.1 * g);
    A.play('explodeM', { vol: 0.6 });
    for (const e of this.enemies) {
      if (!e.alive || !e.hittable) continue;
      const d = Math.hypot(e.x - b.x, e.y - b.y);
      if (this.inBlast(e, b.x, b.y, R)) this.damageEnemy(e, b.aoe * k * (1 - Math.min(1, d / R) * 0.45), { src: 'plasma', heavy: true });
    }
  };
  game.darkBurst = function (b) {
    FX.explode(b.x, b.y, 1.2, '#b06bff', { kind: 'plasma' });
    FX.ring(b.x, b.y, b.burstR, 4, '#d9b8ff', 0.3, 4);
    A.play('explodeM', { vol: 0.55, rate: 0.7 });
    for (const e of this.enemies) {
      if (!e.alive || !e.hittable) continue;
      if (this.inBlast(e, b.x, b.y, b.burstR)) this.damageEnemy(e, b.burst, { src: 'dark', heavy: true });
    }
  };

  // ════════════════════════════════════════════════════════════
  // СТОЛКНОВЕНИЯ
  // ════════════════════════════════════════════════════════════
  game.collide = function () {
    const enemies = this.enemies;
    for (const b of this.bullets) {
      if (b.dead || b.kind === 'dark') continue;
      if (b.kind === 'wave') { this.waveHits(b); continue; }
      for (const e of enemies) {
        if (!e.alive || !e.hittable) continue;
        if (b.hit.length && b.hit.includes(e.uid)) continue;
        const rr = (e.rx ? Math.max(e.rx, e.ry) : e.r) + b.r;
        if (Math.abs(e.x - b.x) > rr + 40 || Math.abs(e.y - b.y) > rr + 60) continue;
        if (e.rx) { if (!SS.enemies.hitTest(e, b.x, b.y, b.r) && !SS.enemies.hitTest(e, (b.x + b.px) / 2, (b.y + b.py) / 2, b.r)) continue; }
        else if (U.segDist2(e.x, e.y, b.px, b.py, b.x, b.y) > rr * rr) continue;
        this.run.hits++;
        if (b.kind === 'rocket') { this.damageEnemy(e, b.dmg, { crit: true, src: 'rocket', heavy: true }); this.rocketBlast(b, e); b.dead = true; break; }
        if (b.kind === 'plasma') { this.damageEnemy(e, b.dmg * plasmaK(b), { crit: true, src: 'plasma', heavy: true }); this.plasmaBlast(b, e); b.dead = true; break; }
        // дробь в упор бьёт сильнее; лазер — «фокус» по одной цели
        let mul = 1, hitCol = b.kind === 'pellet' ? '#ffd23d' : '#7fe7ff';
        if (b.kind === 'pellet' && b.age < D.WEAPONS.shotgun.base.closeT) mul = D.WEAPONS.shotgun.base.closeMul;
        if (b.wid === 'laser') mul = this.laserFocus(e);
        if (mul >= 1.3) hitCol = '#ffffff';
        this.damageEnemy(e, b.dmg * mul, { crit: true, src: b.wid, cryo: true, conductor: true });
        FX.hit(b.x, b.y, hitCol);
        if (b.pierce > 0) { b.pierce--; b.hit.push(e.uid); }
        else { b.dead = true; break; }
      }
    }
    // таран: враг врезался в корабль (в кат-сценах корабль ведёт сцена — тарана нет)
    const p = this.player;
    if (p.alive && this.state === 'play') {
      for (const e of enemies) {
        if (!e.alive || !e.hittable || e.boss && e.entering) continue;
        const rr = e.r * 0.8 + p.r * 1.6;
        if (e.rx ? SS.enemies.hitTest(e, p.x, p.y, p.r * 1.6, 0.8) : U.dist2(e.x, e.y, p.x, p.y) < rr * rr) {
          if (!e.boss && !e.mini) { this.damageEnemy(e, 999999, { src: 'ram', noText: true }); }
          this.hitPlayer(e.x, e.y, 'Столкновение: ' + (e.boss ? e.bdef.name : e.def.name || 'враг'));
        }
      }
    }
  };

  // фокус лазера: попадания подряд по одной цели (без пауз дольше focusT) усиливают урон
  game.laserFocus = function (e) {
    const lb = D.WEAPONS.laser.base, f = this.run.focus;
    if (f.uid !== e.uid || f.t <= 0) { f.uid = e.uid; f.n = 0; }
    f.t = lb.focusT;
    const mul = 1 + lb.focus * f.n;
    if (f.n < lb.focusMax) f.n++;
    return mul;
  };

  // ════════════════════════════════════════════════════════════
  // УРОН ПО ВРАГАМ
  // ════════════════════════════════════════════════════════════
  // o: { crit, src, heavy, noText, cryo, conductor }
  game.damageEnemy = function (e, dmg, o) {
    if (!e.alive || dmg <= 0) return 0;
    o = o || {};
    if (e.boss && e.entering) return 0;
    // энергобарьер Редута поглощает обычный урон; бомба, нова и рельса его снимают
    if (e.barrier > 0) {
      if (o.src === 'bomb' || o.src === 'nova' || o.src === 'rail') { e.barrier = 0; e.cyc = 2.6; }
      else {
        e.shieldHitT = 0.12;
        if (Math.random() < 0.2) A.play('hitArmor', { vol: 0.5 });
        return 0;
      }
    }
    let crit = false;
    if (o.crit && Math.random() < this.st.crit) {
      dmg *= this.st.critMul; crit = true;
      if (this.perk('vamp') && ++this.run.critsForVamp >= 30) { this.run.critsForVamp = 0; this.heal(1, '🩸 +1 ЖИЗНЬ'); }
      if (Math.abs(this.t - (this.critFxT || -1)) > 0.08) {
        this.critFxT = this.t;
        FX.sprite('fx_flare', e.x + U.rand(-0.25, 0.25) * (e.rx ? e.rx : e.r), e.y + U.rand(-0.2, 0.2) * (e.ry ? e.ry : e.r), { w0: 26 * G.S, w1: 40 * G.S, dur: 0.22, hold: 0.3, hue: 45, rot: U.rand(-0.3, 0.3), minor: true });
      }
    }
    if (e.boss || e.mini) dmg *= this.st.bossDmg;
    else if (e.elite) dmg *= this.st.eliteDmg;
    if (e.vuln > 0) dmg *= 1.5;
    if (this.skill('sk_executioner') && e.hp < e.maxHp * 0.25) dmg *= 2;
    if (e.frozen > 0) dmg *= 1.15;
    // щит щитоносца / дредноута
    if (e.shield > 0) {
      const mul = o.heavy || o.src === 'rail' || o.src === 'bomb' ? 3 : 1;
      if (o.src === 'rail') e.shield = 0;
      const absorbed = Math.min(e.shield, dmg * mul);
      e.shield -= absorbed;
      e.shieldHitT = 0.15;
      e.shieldRegenWait = e.boss ? 12 : 4;
      dmg -= absorbed / mul;
      if (e.shield <= 0) {
        e.shield = 0;
        FX.ring(e.x, e.y, e.r, e.r * 2, '#7fd8ff', 0.4, 4);
        FX.sparks(e.x, e.y, '#7fd8ff', 16, 300);
        A.play('shieldHit');
        if (e.boss) { SS.emit('toast', { ico: '🛡️', title: 'ЩИТ', text: 'Щит дредноута сломан!', info: true }); FX.shake(0.3); }
      } else if (Math.random() < 0.3) A.play('hitArmor');
      if (dmg <= 0.01) return 0;
    }
    e.hp -= dmg;
    e.flash = 0.07;
    if (e.boss) {
      this.run.bossDamage += dmg;
      // с молнией в слотах босс роняет энергоблоки по мере урона — иначе против него молния без энергии
      if (this.player.weapons.includes('lightning')) {
        const step = e.maxHp * D.WEAPONS.lightning.base.bossStep;
        e.enAcc = (e.enAcc || 0) + dmg;
        while (e.enAcc >= step) { e.enAcc -= step; this.dropEnergy(e.x + U.rand(-0.3, 0.3) * e.w, e.y + e.h * 0.3, 1); }
      }
    }
    if (o.cryo && this.st.cryo > 0 && !e.boss && Math.random() < this.st.cryo) e.frozen = 2;
    if (o.conductor && this.skill('sk_conductor') && Math.random() < 0.08) {
      const other = this.nearestOther(e, 140 * G.S);
      if (other) { FX.lightning(e.x, e.y, other.x, other.y, '#fff36b', 2 * G.S, 0.12); this.damageEnemy(other, dmg * 0.5, { src: 'lightning' }); }
    }
    if (M.s.settings.dmgNums && !o.noText && FX.quality > 0) {
      const n = Math.round(dmg);
      if (n > 0) FX.text(e.x + U.rand(-10, 10) * G.S, e.y - e.r * 0.4, crit ? n + '!' : String(n), crit ? '#ffd23d' : '#ffffff', crit ? 16 : 11, crit ? 0.7 : 0.45, -70);
    }
    if (!e.boss && Math.random() < 0.25) A.play('hit');
    if (e.hp <= 0) SS.enemies.kill(e, o.src);
    return dmg;
  };
  game.nearestOther = function (e, range) {
    let best = null, bd = range;
    for (const o of this.enemies) { if (o === e || !o.alive || !o.hittable) continue; const d = Math.hypot(o.x - e.x, o.y - e.y); if (d < bd) { bd = d; best = o; } }
    return best;
  };
  // отложенные взрывы (детонация и т.п.) — без глубокой рекурсии
  game.blast = function (x, y, r, dmg, color, src) { this.blasts.push({ x, y, r, dmg, color, src }); };
  game.processBlasts = function () {
    let guard = 0;
    while (this.blasts.length && guard++ < 40) {
      const b = this.blasts.shift();
      FX.explode(b.x, b.y, 1, b.color || '#ff9f3d');
      FX.ring(b.x, b.y, 6, b.r, b.color || '#ffcf6b', 0.3, 3);
      for (const e of this.enemies) {
        if (!e.alive || !e.hittable) continue;
        if (this.inBlast(e, b.x, b.y, b.r)) this.damageEnemy(e, b.dmg, { src: b.src || 'blast', noText: true });
      }
    }
  };

  // вызывается из enemies.kill — награды за уничтожение
  game.onEnemyKilled = function (e, src) {
    const run = this.run, S = G.S;
    if (e.boss) return;
    run.kills++;
    M.onKill();
    run.combo++;
    run.comboT = 2.6;
    if (run.combo > run.maxCombo) run.maxCombo = run.combo;
    if (run.combo % 10 === 0) M.onCombo(run.combo);
    if (run.combo >= 50 && !run.fever) this.setFever(true);
    if (run.combo === 10 || run.combo === 25) {
      const big = run.combo === 25, col = big ? '#ffc83d' : '#3de0ff';
      FX.text(G.FW / 2, G.H * 0.38, 'КОМБО ' + run.combo + '!', col, big ? 20 : 17, 1.1, -30);
      FX.ring(this.player.x, this.player.y, this.player.w * 0.5, this.player.w * (big ? 2.2 : 1.6), col, 0.45, 4);
      this.addScore(Math.round((big ? 1500 : 500) * this.wave.n * this.diff.score));
      A.play('powerup', { rate: big ? 1.5 : 1.3, vol: 0.6 });
    }
    const comboMul = 1 + Math.min(run.combo, 100) * 0.02;
    const waveMul = 1 + (this.wave.n - 1) * 0.08;
    const pts = Math.round(e.score * waveMul * this.diff.score * comboMul * (e.elite ? 2 : 1));
    this.addScore(pts);
    // монеты и кристаллы
    let coins = e.coins * this.st.coins * (1 + this.wave.n * 0.025) * (run.fever ? 1.5 : 1) * (e.elite ? 3 : 1) * (e.mini ? this.diff.count : 1);
    coins = Math.floor(coins) + (Math.random() < coins % 1 ? 1 : 0);
    this.dropCoins(e.x, e.y, coins);
    this.dropXp(e.x, e.y, e.xp * (e.elite ? 2 : 1));
    // энергоблоки для молнии — только если она в слотах
    if (this.player.weapons.includes('lightning') && !e.def.prop) this.dropEnergy(e.x, e.y, e.mini || Math.random() < D.WEAPONS.lightning.base.drop ? 1 : 0);
    // бонусы
    const luck = this.st.luck * (e.mini ? 100 : 1);
    const chance = (0.028 + (e.def.coins || 1) * 0.006) * luck * (this.diffId === 'zen' ? 1.5 : 1) * (this.diff.drops || 1);
    if (Math.random() < chance || e.mini) this.dropPowerup(e.x, e.y);
    if (e.mini) this.dropPowerup(e.x + 20 * S, e.y);
    // навыки и улучшения
    if (this.skill('sk_vamp')) { run.killsForVamp++; if (run.killsForVamp >= 25) { run.killsForVamp = 0; this.heal(1, '🧛 ВАМПИР'); } }
    if (this.skill('sk_detonator')) { run.detCount++; if (run.detCount % 5 === 0) this.blast(e.x, e.y, 80 * S, 40 * this.dmgMul(), '#ff9f3d', 'det'); }
    if (this.st.nova > 0) this.blast(e.x, e.y, (46 + this.st.nova * 14) * S, 12 * this.st.nova * this.dmgMul(), '#ffb03d', 'nova');
    if (e.def.split && !e.isChild) SS.enemies.split(e);
    if (e.type === 'debris' || e.type === 'asteroid') M.trackMission('debris', 1);
    SS.tg.haptic('light');
    this.hudDirty = true;
  };

  game.setFever = function (on) {
    if (this.run.fever === on) return;
    this.run.fever = on;
    if (on) { FX.text(G.FW / 2, G.H * 0.42, 'ФИВЕР! МОНЕТЫ ×1.5', '#ff6bd6', 18, 1.4, -30); A.play('powerup', { rate: 1.3 }); }
    SS.emit('intensity');
  };

  game.addScore = function (n) {
    this.run.score += Math.max(0, Math.round(n));
    this.hudDirty = true;
  };

  // ════════════════════════════════════════════════════════════
  // УРОН ПО ИГРОКУ
  // ════════════════════════════════════════════════════════════
  game.hitPlayer = function (sx, sy, cause) {
    const p = this.player, run = this.run;
    if (!p.alive || p.inv > 0 || this.state !== 'play') return false;
    if (run.skillFx.sk_barrier > 0) return false;
    if (this.st.dodge > 0 && Math.random() < this.st.dodge) {
      p.inv = 0.35;
      FX.text(p.x, p.y - p.w * 0.6, 'УКЛОНЕНИЕ', '#7fe7ff', 13, 0.7);
      FX.glowPuff(p.x, p.y, '#7fe7ff', 60 * G.S, 0.25);
      FX.sprite('fx_dash', 0, 0, { follow: p, w0: p.w * 0.9, w1: p.w * 1.3, dur: 0.35, hold: 0.3, hue: 190 });
      SS.tg.haptic('light');
      return false;
    }
    if (p.shield) {
      p.shield = false;
      p.inv = 1.0;
      run.shieldRegenT = 0;
      FX.ring(p.x, p.y, p.w * 0.6, p.w * 1.4, '#7fe7ff', 0.4, 4);
      FX.sprite('fx_sh_break', p.x, p.y, { w0: p.w * 1.3, w1: p.w * 2.3, dur: 0.45, hold: 0.3, rot: U.rand(-0.4, 0.4) });
      FX.sparks(p.x, p.y, '#7fe7ff', 18, 320);
      A.play('shieldHit');
      SS.tg.haptic('medium');
      this.clearBulletsAround(p.x, p.y, 90 * G.S);
      this.hudDirty = true;
      return true;
    }
    p.lives--;
    run.lastHit = cause || 'Вражеский огонь';
    run.waveDamage++;
    run.bossDamaged = true;
    p.inv = 1.8;
    this.clearBulletsAround(p.x, p.y, 130 * G.S);
    FX.explode(p.x, p.y, 1.2, '#ff5c7a');
    FX.vignette('#ff2a48', 0.6, 0.85);
    FX.shake(0.55);
    A.play('playerHit');
    SS.tg.haptic('heavy');
    SS.emit('playerHit', p.lives);
    this.hudDirty = true;
    if (p.lives <= 0) this.playerDown();
    return true;
  };

  // чем сбит игрок — показывается на экране итогов
  const SHOT_NAMES = { mine: 'мина', needle: 'прицельный выстрел', long: 'прицельный выстрел', fire: 'огненный шар', ink: 'чернильная бомба',
    egg: 'кладка роя', shard: 'осколок кристалла', feather: 'перо Феникса', junk: 'обломок', eye: 'взгляд Оверлорда', plaser: 'фиолетовый лазер' };
  function hitCause(b, boss) {
    const what = SHOT_NAMES[b.type] || 'вражеский снаряд';
    return boss && boss.alive ? boss.bdef.name + ', ' + what : what[0].toUpperCase() + what.slice(1);
  }

  game.clearBulletsAround = function (x, y, r) {
    for (const b of this.ebullets) {
      if (b.dead) continue;
      if (Math.hypot(b.x - x, b.y - y) < r) { b.dead = true; FX.glowPuff(b.x, b.y, b.color, 18 * G.S, 0.2); }
    }
  };

  game.heal = function (n, label) {
    const p = this.player;
    if (!p.alive) return;
    const before = p.lives;
    p.lives = Math.min(p.maxLives, p.lives + n);
    if (p.lives > before) {
      FX.text(p.x, p.y - p.w * 0.7, label || '+1 ЖИЗНЬ', '#ff6b8a', 13, 0.9);
      FX.glowPuff(p.x, p.y, '#ff6b8a', 70 * G.S, 0.35);
      FX.sprite('fx_regen', p.x, p.y - p.w * 0.35, { w0: p.w * 0.45, w1: p.w * 0.6, dur: 0.9, hold: 0.55, fadeIn: 0.12, vy: -45 * G.S });
      A.play('powerup', { vol: 0.7 });
      this.hudDirty = true;
    }
  };

  // кольца щита сходятся к кораблю — щит появился
  game.shieldFx = function () {
    const p = this.player;
    FX.sprite('fx_sh_restore', 0, 0, { follow: p, w0: p.w * 2.2, w1: p.w * 1.2, dur: 0.5, hold: 0.4 });
  };

  game.playerDown = function () {
    const p = this.player, run = this.run;
    // навык «Феникс»
    if (this.skill('sk_phoenix') && !run.phoenixUsed) {
      run.phoenixUsed = true;
      p.lives = Math.min(2, p.maxLives);
      p.inv = 3.5;
      this.novaWave(false);
      FX.flash('#ffb03d', 0.6);
      FX.explode(p.x, p.y, 2, '#ffb03d', { kind: 'crit' });
      FX.sprite('fx_beam', 0, 0, { follow: p, oy: -p.w * 0.95, w0: p.w * 1.25, w1: p.w * 1.4, dur: 1.1, hold: 0.5, fadeIn: 0.1, hue: 30 });
      FX.text(p.x, p.y - p.w, 'ФЕНИКС!', '#ffb03d', 20, 1.3);
      A.play('revive');
      SS.emit('toast', { ico: '🔥', title: 'НАВЫК', text: 'Феникс возродил корабль!', info: true });
      this.hudDirty = true;
      return;
    }
    p.alive = false;
    this.state = 'dying';
    this.slowT = 1.2;
    FX.explode(p.x, p.y, 2.6, '#7fe7ff', { kind: 'super' });
    FX.flash('#ffffff', 0.5);
    A.play('explodeL');
    SS.tg.haptic('error');
    this.after(1.3 * 0.45, () => this.afterDeath());
  };

  game.afterDeath = function () {
    if (this.state !== 'dying') return;
    const cost = D.reviveCost(this.wave.n);
    if (!this.run.reviveUsed && M.s.coins >= cost) {
      this.state = 'revive';
      SS.emit('reviveOffer', cost);
    } else this.gameOver();
  };

  game.revive = function () {
    const cost = D.reviveCost(this.wave.n);
    if (this.state !== 'revive' || !M.spend(cost)) return false;
    const p = this.player;
    this.run.reviveUsed = true;
    p.alive = true;
    p.lives = Math.min(p.maxLives, Math.max(2, Math.ceil(p.maxLives / 2)));
    p.inv = 3;
    p.x = G.FW / 2; p.y = G.H * 0.8;
    this.state = 'play';
    for (const b of this.ebullets) b.dead = true;
    this.novaWave(false);
    FX.flash('#7fe7ff', 0.5);
    FX.sprite('fx_beam', 0, 0, { follow: p, oy: -p.w * 0.95, w0: p.w * 1.25, w1: p.w * 1.4, dur: 1.1, hold: 0.5, fadeIn: 0.1, hue: 190 });
    A.play('revive');
    this.hudDirty = true;
    SS.emit('revived');
    return true;
  };

  game.gameOver = function () {
    if (this.state === 'over') return;
    this.state = 'over';
    const run = this.run;
    const result = M.finishRun({ score: run.score, wave: this.wave.n, kills: run.kills, bosses: run.bosses, maxCombo: run.maxCombo,
      time: run.time, diff: this.diffId, perks: run.perkCount, shots: run.shots, hits: run.hits, challenge: !!run.challenge });
    const summary = Object.assign({}, result, {
      score: run.score, wave: this.wave.n, sector: run.sector, kills: run.kills, bosses: run.bosses, maxCombo: run.maxCombo,
      time: run.time, coins: run.coins, accuracy: run.shots ? Math.round(Math.min(1, run.hits / run.shots) * 100) : 0,
      diff: this.diffId, level: run.level, cause: run.lastHit,
    });
    SS.tg.submitScore({ score: run.score, wave: this.wave.n, diff: this.diffId, time: run.time, kills: run.kills, bosses: run.bosses, shots: run.shots, hits: Math.min(run.hits, run.shots) });
    SS.emit('runEnd', summary);
  };

  // ════════════════════════════════════════════════════════════
  // БОМБА И АКТИВНЫЕ НАВЫКИ
  // ════════════════════════════════════════════════════════════
  game.useBomb = function () {
    const p = this.player;
    if (this.state !== 'play' || !p.alive) return;
    if (p.bombs <= 0) { A.play('error'); return; }
    if (p.bombCd > 0) return;
    p.bombs--;
    p.bombCd = 1.2 * this.st.cdMul;
    p.inv = Math.max(p.inv, 1.2);
    const S = G.S;
    FX.ring(p.x, p.y, 10, Math.max(G.FW, G.H) * 1.1, '#ffb36b', 0.7, 10);
    FX.ring(p.x, p.y, 10, Math.max(G.FW, G.H) * 0.8, '#ffffff', 0.5, 4);
    FX.sprite('fx_ex_kill', p.x, p.y, { w0: 90 * S, w1: 290 * S, dur: 0.6, hold: 0.25, rot: Math.random() * U.TAU });
    FX.sprite('fx_shock', p.x, p.y, { w0: 60 * S, w1: 250 * S, dur: 0.55, hold: 0.25, hue: 28 });
    FX.flash('#ffd9a0', 0.55);
    FX.shake(0.8);
    A.play('bomb');
    SS.tg.haptic('heavy');
    for (const b of this.ebullets) { if (!b.dead) { b.dead = true; FX.glowPuff(b.x, b.y, b.color, 16 * S, 0.3); } }
    const dmg = 320 * this.st.bomb * (1 + this.wave.n * 0.1) * this.dmgMul();
    let killed = 0;
    for (const e of this.enemies) {
      if (!e.alive || !e.hittable) continue;
      if (e.boss) { this.damageEnemy(e, e.maxHp * 0.06 * this.st.bomb, { src: 'bomb', noText: false }); continue; }
      const before = e.alive;
      this.damageEnemy(e, dmg, { src: 'bomb', noText: true });
      if (before && !e.alive) killed++;
    }
    if (killed >= 10) M.unlock('bomb_chain');
    this.hudDirty = true;
  };

  game.activeSkills = function () {
    return Object.keys(M.s.skills).filter((id) => D.SKILLS[id] && D.SKILLS[id].type === 'active').slice(0, D.MAX_ACTIVE);
  };

  game.useSkill = function (slot) {
    if (this.state !== 'play' || !this.player.alive) return;
    const id = this.activeSkills()[slot];
    if (!id) return;
    const run = this.run, sk = D.SKILLS[id];
    if ((run.skillCd[id] || 0) > 0) { A.play('error'); return; }
    run.skillCd[id] = sk.cd * this.st.cdMul;
    if (sk.dur) run.skillFx[id] = sk.dur;
    if (this.skill('sk_overload')) run.overload = 4;
    const p = this.player, S = G.S;
    A.play('skill');
    SS.tg.haptic('medium');
    if (id === 'sk_nova') this.novaWave(true);
    else if (id === 'sk_barrier') { FX.ring(p.x, p.y, p.w * 0.5, p.w * 1.6, '#ffd23d', 0.5, 5); FX.sprite('fx_sh_restore', 0, 0, { follow: p, w0: p.w * 2.4, w1: p.w * 1.3, dur: 0.5, hold: 0.4, hue: 46 }); }
    else if (id === 'sk_overclock') { FX.glowPuff(p.x, p.y, '#3de0ff', 120 * S, 0.4); this.speedFx(190); }
    else if (id === 'sk_airstrike') this.airstrike();
    else if (id === 'sk_timewarp') {
      FX.flash('#3d6bff', 0.25); FX.ring(G.FW / 2, G.H / 2, 20, G.H, '#7fb8ff', 0.8, 6);
    }
    else if (id === 'sk_rail') { this.ov.rail = { t: 0, dur: sk.dur, tick: 0, charge: 0.35 }; A.play('railCharge'); }
    else if (id === 'sk_blackhole') { this.ov.hole = { x: G.FW / 2, y: G.H * 0.32, t: 0, dur: sk.dur, tick: 0 }; A.play('dark', { rate: 0.6 }); }
    M.trackMission('skills', 1);
    this.hudDirty = true;
  };

  // шевроны «ускорения» поднимаются сквозь корабль
  game.speedFx = function (hue) {
    const p = this.player;
    FX.sprite('fx_speed', 0, 0, { follow: p, oy: p.w * 0.7, vy: -95 * G.S, w0: p.w * 0.6, w1: p.w * 0.74, dur: 0.75, hold: 0.5, fadeIn: 0.15, hue });
  };

  game.novaWave = function (withDamage) {
    const p = this.player, S = G.S;
    FX.ring(p.x, p.y, 10, Math.max(G.FW, G.H), '#bfe6ff', 0.6, 8);
    FX.sprite('fx_shock', p.x, p.y, { w0: 40 * S, w1: 240 * S, dur: 0.5, hold: 0.25, alpha: 0.9 });
    FX.sprite('fx_flare', p.x, p.y, { w0: 60 * S, w1: 150 * S, dur: 0.45, hold: 0.25 });
    FX.flash('#cfeaff', 0.35);
    FX.shake(0.5);
    A.play('explodeM');
    for (const b of this.ebullets) { if (!b.dead) { b.dead = true; FX.glowPuff(b.x, b.y, b.color, 14 * S, 0.25); } }
    if (!withDamage) return;
    for (const e of this.enemies) {
      if (!e.alive || !e.hittable) continue;
      if (e.boss) this.damageEnemy(e, e.maxHp * 0.1, { src: 'nova' });
      else if (e.mini) this.damageEnemy(e, e.maxHp * 0.5, { src: 'nova' });
      else this.damageEnemy(e, 999999, { src: 'nova', noText: true });
    }
  };

  game.airstrike = function () {
    const S = G.S;
    const targets = this.enemies.filter((e) => e.alive && e.hittable).sort((a, b) => b.hp - a.hp).slice(0, 8);
    for (let i = 0; i < 8; i++) {
      const t = targets[i % Math.max(1, targets.length)];
      const tx = t ? t.x : U.rand(0.1, 0.9) * G.FW, ty = t ? t.y : U.rand(0.1, 0.5) * G.H;
      this.after(0.12 + i * 0.11, () => {
        const x = t && t.alive ? t.x : tx, y = t && t.alive ? t.y : ty;
        FX.explode(x, y, 1.6, '#ff8a3d');
        FX.shake(0.15);
        A.play('explodeM', { vol: 0.6 });
        for (const e of this.enemies) {
          if (!e.alive || !e.hittable) continue;
          if (this.inBlast(e, x, y, 75 * S)) this.damageEnemy(e, (e.boss ? 90 : 150) * this.dmgMul() * (1 + this.wave.n * 0.06), { src: 'air', heavy: true });
        }
      });
    }
  };

  game.updateOverlays = function (dt) {
    const p = this.player, S = G.S, ov = this.ov;
    // рельса
    if (ov.rail) {
      const r = ov.rail;
      r.t += dt;
      if (r.t >= r.charge) {
        if (!r.fired) { r.fired = true; A.play('rail'); FX.shake(0.4); FX.flash('#9ff', 0.2); }
        r.tick -= dt;
        if (r.tick <= 0) {
          r.tick = 0.08;
          const half = 20 * S;
          for (const e of this.enemies) {
            if (!e.alive || !e.hittable || e.y > p.y) continue;
            if (Math.abs(e.x - p.x) < half + (e.rx ? e.rx * 0.85 : e.r * 0.8)) {
              this.damageEnemy(e, (e.boss ? 22 : 48) * this.dmgMul() * (1 + this.wave.n * 0.05), { src: 'rail', noText: Math.random() < 0.6 });
              if (Math.random() < 0.4) FX.sparks(e.x, e.y, '#7ffff0', 3, 220);
            }
          }
          for (const b of this.ebullets) if (!b.dead && Math.abs(b.x - p.x) < half && b.y < p.y) b.dead = true;
        }
      }
      if (r.t >= r.charge + r.dur) ov.rail = null;
    }
    // чёрная дыра
    if (ov.hole) {
      const h = ov.hole;
      h.t += dt;
      const R = 210 * S;
      h.tick -= dt;
      for (const e of this.enemies) {
        if (!e.alive || e.boss) continue;
        const dx = h.x - e.x, dy = h.y - e.y, d = Math.hypot(dx, dy);
        if (d < R * 1.8 && d > 4) { const f = (e.mini ? 60 : 260) * S * dt; e.x += dx / d * f; e.y += dy / d * f; }
      }
      for (const b of this.ebullets) {
        if (b.dead) continue;
        const dx = h.x - b.x, dy = h.y - b.y, d = Math.hypot(dx, dy);
        if (d < 24 * S) { b.dead = true; continue; }
        if (d < R * 2) { b.vx += dx / d * 600 * S * dt; b.vy += dy / d * 600 * S * dt; }
      }
      if (h.tick <= 0) {
        h.tick = 0.15;
        for (const e of this.enemies) if (e.alive && e.hittable && Math.hypot(e.x - h.x, e.y - h.y) < R * 0.6) this.damageEnemy(e, 18 * this.dmgMul(), { src: 'hole', noText: true });
      }
      if (FX.quality > 0) { const a = Math.random() * U.TAU; FX.embers(h.x + Math.cos(a) * R * 0.9, h.y + Math.sin(a) * R * 0.9, '#b06bff', 1, 10); }
      if (h.t >= h.dur) {
        FX.explode(h.x, h.y, 3, '#b06bff', { hue: 275 });
        FX.ring(h.x, h.y, 10, R * 1.5, '#e0c8ff', 0.5, 8);
        FX.flash('#d9b8ff', 0.35);
        FX.shake(0.6);
        A.play('explodeL', { vol: 0.8 });
        for (const e of this.enemies) {
          if (!e.alive || !e.hittable) continue;
          if (Math.hypot(e.x - h.x, e.y - h.y) < R + e.r) this.damageEnemy(e, e.boss ? e.maxHp * 0.08 : 500 * this.dmgMul(), { src: 'hole' });
        }
        ov.hole = null;
      }
    }
    for (let i = ov.beams.length - 1; i >= 0; i--) {
      const bm = ov.beams[i];
      bm.t += dt;
      // луч гаснет, если стрелок погиб до выстрела, и после окончания
      if ((bm.owner && !bm.owner.alive && bm.t < bm.warn) || bm.t >= bm.warn + bm.dur) ov.beams.splice(i, 1);
    }
    // вертикальные лучи (дредноут, ионный, инквизитор) ранят один раз
    for (const bm of ov.beams) {
      if (bm.t >= bm.warn && !bm.hitDone && p.alive && Math.abs(p.x - bm.x) < bm.w * 0.75 + p.r && p.y > bm.y0) { bm.hitDone = true; this.hitPlayer(p.x, p.y, this.boss ? this.boss.bdef.name + ', луч' : 'Луч'); }
    }
    // поворотные лазеры: прикреплены к владельцу, могут следить за игроком
    const edt = dt * this.enemySlow();
    for (let i = ov.lasers.length - 1; i >= 0; i--) {
      const L = ov.lasers[i];
      if (L.owner && !L.owner.alive) { ov.lasers.splice(i, 1); continue; }
      L.t += edt;
      if (L.t >= L.warn + L.dur) { ov.lasers.splice(i, 1); continue; }
      const o = this.laserOrigin(L);
      if (L.track && p.alive) {
        const want = Math.atan2(p.y - o.y, p.x - o.x);
        const rate = L.t < L.warn ? L.track * 1.6 : L.track;
        L.ang += U.clamp(U.angleDiff(L.ang, want), -rate * edt, rate * edt);
      }
      if (L.t >= L.warn) L.ang += (L.spin || 0) * edt;
      if (L.t >= L.warn + 0.05 && p.alive && p.inv <= 0) {
        const dx = Math.cos(L.ang), dy = Math.sin(L.ang);
        const tt = U.clamp((p.x - o.x) * dx + (p.y - o.y) * dy, 0, L.len);
        const qx = o.x + dx * tt, qy = o.y + dy * tt;
        if (Math.hypot(p.x - qx, p.y - qy) < L.w * 0.45 + p.r) this.hitPlayer(p.x, p.y, (L.owner && L.owner.bdef ? L.owner.bdef.name + ', ' : '') + 'лазер');
      }
    }
  };
  // L: { owner, ox, oy — доли размера владельца, ang, spin, track, warn, dur, w, len, color }
  game.laser = function (o) {
    const L = Object.assign({ t: 0, ox: 0, oy: 0, spin: 0, track: 0, warn: 0.8, dur: 1.2, w: 16 * G.S, len: 1800 * G.S, color: '#ff3d5a' }, o);
    this.ov.lasers.push(L);
    return L;
  };
  game.laserOrigin = function (L) {
    const w = L.owner;
    return w ? { x: w.x + L.ox * w.w, y: w.y + L.oy * w.h } : { x: L.x, y: L.y };
  };

  // ════════════════════════════════════════════════════════════
  // ВРАЖЕСКИЕ СНАРЯДЫ
  // ════════════════════════════════════════════════════════════
  const EB = {
    orb:    { sprite: 'eb_orb',    w: 15, r: 5.5, color: '#ff6b3d' },
    bolt:   { sprite: 'eb_bolt_s', w: 13, r: 5,   color: '#ff4d3d', rotate: true },
    long:   { sprite: 'eb_bolt_l', w: 13, r: 5,   color: '#ff3d5a', rotate: true },
    needle: { sprite: 'eb_needle', w: 18, r: 6,   color: '#ff6b6b', rotate: true },
    fire:   { sprite: 'eb_fire',   w: 26, r: 10,  color: '#ff9f3d' },
    dot:    { sprite: 'eb_orb',    w: 11, r: 4,   color: '#ff5cf0', tint: 305 },
    green:  { sprite: 'eb_orb',    w: 15, r: 5.5, color: '#7dff6b', tint: 110 },
    violet: { sprite: 'eb_orb',    w: 15, r: 5.5, color: '#b06bff', tint: 275 },
    blue:   { sprite: 'eb_orb',    w: 15, r: 5.5, color: '#4cc9ff', tint: 200 },
    mine:   { sprite: 'fx_mine', proc: 'mine', w: 26, r: 9, color: '#ff3d5a' },
    shard:   { sprite: 'eb_needle', w: 16, r: 5,   color: '#3dffd2', tint: 165, rotate: true },
    feather: { sprite: 'eb_bolt_l', w: 14, r: 5,   color: '#ffd23d', tint: 40, rotate: true },
    ink:     { sprite: 'eb_orb',    w: 30, r: 11,  color: '#8a5cff', tint: 255 },
    egg:     { sprite: 'eb_orb',    w: 26, r: 9,   color: '#a6ff3d', tint: 95 },
    junk:    { sprite: 'eb_fire',   w: 18, r: 7,   color: '#ff8a3d', tint: 20 },
    eye:     { sprite: 'eb_orb',    w: 17, r: 6,   color: '#ff3dd2', tint: 320 },
    plaser:  { sprite: 'eb_plaser', w: 9,  r: 4,   color: '#c86bff', rotate: true },
  };
  game.EB = EB;

  // o: { type, speed?, life?, accel?, homing?, fuse? }
  game.ebullet = function (x, y, vx, vy, type, o) {
    if (this.ebullets.length > 420) return null;
    const def = EB[type] || EB.orb, S = G.S;
    const b = ebPool.get();
    b.x = x; b.y = y; b.px = x; b.py = y; b.vx = vx; b.vy = vy; b.type = type;
    b.sprite = (o && o.sprite) || def.sprite || null; b.cv = def.tint ? G.tinted(def.sprite, { hue: def.tint }) : def.proc ? G.proc(def.proc) : null;
    b.w = ((o && o.w) || def.w) * S; b.r = ((o && o.r) || def.r) * S; b.color = def.color; b.rotate = !!def.rotate;
    b.life = (o && o.life) || 9; b.age = 0; b.dead = false;
    b.accel = (o && o.accel) || 0; b.homing = (o && o.homing) || 0; b.fuse = (o && o.fuse) || 0;
    b.maxSpd = (o && o.maxSpd) || 0;
    b.redirT = (o && o.redir) || 0; b.redirSpd = (o && o.redirSpd) || 0; b.redone = false;
    b.burst = (o && o.burst) || null; b.bounce = (o && o.bounce) || 0; b.ebc = null;
    b.sine = (o && o.sine) || null;
    this.ebullets.push(b);
    return b;
  };
  // скорость вражеских снарядов растёт со сложностью и волной
  game.bspd = function (v) { return v * G.S * this.diff.bspd * (1 + Math.min(this.threatWave(), 40) * 0.012); };
  // «волна угрозы»: номер волны со сдвигом сложности (diff.waveOffset) — по нему состав волн, темп огня,
  // упреждение и новые атаки; прочность врагов и расписание боссов идут по настоящему номеру
  game.threatWave = function () { return (this.wave ? this.wave.n : 1) + (this.diff.waveOffset || 0); };
  // упреждение: часть выстрелов летит туда, где корабль окажется, — постоянное движение в одну сторону
  // больше не спасает. Доля растёт от 3-й к 20-й волне и зависит от сложности (diff.lead)
  game.leadK = function () { return U.clamp((this.threatWave() - 3) / 17, 0, 1) * (this.diff.lead || 0); };
  game.aimAt = function (x, y, spd, type, spreadA, o) {
    const p = this.player, s = this.bspd(spd);
    let tx = p.x, ty = p.y;
    if (Math.random() < this.leadK()) {
      const t = Math.min(1.2, Math.hypot(p.x - x, p.y - y) / Math.max(s, 1));
      tx = U.clamp(p.x + (p.vxm || 0) * t, 0, G.FW); ty = p.y + (p.vym || 0) * t * 0.5;
    }
    const a = Math.atan2(ty - y, tx - x) + (spreadA || 0);
    return this.ebullet(x, y, Math.cos(a) * s, Math.sin(a) * s, type, o);
  };

  const cover = [];
  game.updateEBullets = function (dt) {
    const p = this.player, FW = G.FW, H = G.H, S = G.S;
    const pr = p.r;
    // астероиды сектора закрывают от вражеских снарядов
    cover.length = 0;
    for (const e of this.enemies) if (e.alive && e.def.cover) cover.push(e);
    for (const b of this.ebullets) {
      if (b.dead) continue;
      b.age += dt; b.life -= dt;
      b.px = b.x; b.py = b.y;
      if (b.accel) {
        const sp = Math.hypot(b.vx, b.vy), ns = Math.min(b.maxSpd || 9999, sp + b.accel * dt);
        if (sp > 0) { b.vx *= ns / sp; b.vy *= ns / sp; }
      }
      if (b.homing && p.alive && b.age < 2.2) {
        let ang = Math.atan2(b.vy, b.vx);
        const want = Math.atan2(p.y - b.y, p.x - b.x);
        ang += U.clamp(U.angleDiff(ang, want), -b.homing * dt, b.homing * dt);
        const sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(ang) * sp; b.vy = Math.sin(ang) * sp;
      }
      // «перо»: тормозит, замирает и бросается в игрока
      if (b.redirT > 0 && !b.redone) {
        b.vx *= Math.exp(-4 * dt); b.vy *= Math.exp(-4 * dt);
        if (b.age >= b.redirT) {
          b.redone = true;
          const a = Math.atan2(p.y - b.y, p.x - b.x), sp = b.redirSpd || 220 * S;
          b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
        }
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      // «волна»: снаряд виляет поперёк курса
      if (b.sine) {
        const sp = Math.hypot(b.vx, b.vy) || 1, k = b.sine.amp * b.sine.f * Math.cos(b.age * b.sine.f + b.sine.ph) * dt;
        b.x -= b.vy / sp * k; b.y += b.vx / sp * k;
      }
      if (b.bounce > 0 && (b.x < 4 || b.x > FW - 4)) { b.vx = -b.vx; b.x = U.clamp(b.x, 4, FW - 4); b.bounce--; }
      // кладка/клякса: разрывается кольцом по таймеру
      if (b.burst && b.type !== 'mine') {
        b.fuse -= dt;
        if (b.fuse <= 0) {
          b.dead = true;
          const bu = b.burst, sp = this.bspd(bu.spd), off = Math.random() * U.TAU;
          for (let i = 0; i < bu.n; i++) { const a = off + i / bu.n * U.TAU; this.ebullet(b.x, b.y, Math.cos(a) * sp, Math.sin(a) * sp, bu.type); }
          FX.glowPuff(b.x, b.y, b.color, 40 * S, 0.25);
          continue;
        }
      }
      if (b.type === 'mine') {
        b.vx *= Math.exp(-1.5 * dt); b.vy = U.damp(b.vy, 45 * S, 2, dt);
        b.fuse -= dt;
        if (b.fuse <= 0 || (p.alive && Math.hypot(p.x - b.x, p.y - b.y) < 70 * S)) {
          b.dead = true;
          FX.explode(b.x, b.y, 0.7, '#ff5c5c');
          A.play('explodeS', { vol: 0.5 });
          for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; this.ebullet(b.x, b.y, Math.cos(a) * this.bspd(150), Math.sin(a) * this.bspd(150), 'orb'); }
          continue;
        }
      }
      if (b.life <= 0 || b.y > H + 40 || b.y < -80 || b.x < -50 || b.x > FW + 50) { b.dead = true; continue; }
      if (cover.length && hitsCover(b)) { b.dead = true; FX.hit(b.x, b.y, '#d8c3a5'); continue; }
      // попадание в игрока (стреловидная проверка — снаряд не «проскакивает»)
      if (p.alive && p.inv <= 0) {
        const rr = pr + b.r * 0.75;
        if (Math.abs(b.x - p.x) < rr + 30 && Math.abs(b.y - p.y) < rr + 40 && U.segDist2(p.x, p.y, b.px, b.py, b.x, b.y) < rr * rr) {
          b.dead = true;
          this.hitPlayer(b.x, b.y, hitCause(b, this.boss));
        }
      }
    }
  };
  function hitsCover(b) {
    for (const e of cover) {
      const rr = e.r + b.r * 0.5;
      if (U.dist2(e.x, e.y, b.x, b.y) < rr * rr) return true;
    }
    return false;
  }

  // ════════════════════════════════════════════════════════════
  // ПОДБИРАЕМЫЕ ПРЕДМЕТЫ
  // ════════════════════════════════════════════════════════════
  function pick(kind, x, y, val) {
    const it = pickPool.get();
    const a = Math.random() * U.TAU, s = U.rand(60, 170) * G.S;
    it.kind = kind; it.x = x; it.y = y; it.vx = Math.cos(a) * s; it.vy = Math.sin(a) * s - 40 * G.S; it.val = val;
    it.age = 0; it.dead = false; it.pull = false; it.pu = null; it.spin = Math.random() * 6;
    game.pickups.push(it);
    return it;
  }
  game.dropCoins = function (x, y, n) {
    if (n <= 0) return;
    let left = n, guard = 0;
    while (left > 0 && guard++ < 10) {
      const v = left >= 25 && guard < 9 ? 25 : left >= 5 && guard < 9 ? 5 : left;
      const take = guard >= 9 ? left : v;
      pick('coin', x, y, take);
      left -= take;
    }
  };
  game.dropXp = function (x, y, n) {
    let left = Math.round(n), guard = 0;
    while (left > 0 && guard++ < 6) {
      const v = left >= 5 && guard < 6 ? 5 : guard >= 6 ? left : 1;
      pick('xp', x, y, v);
      left -= v;
    }
  };
  // не больше, чем не хватает до полной энергии с учётом уже лежащих блоков, и не больше maxOnScreen на экране
  game.dropEnergy = function (x, y, n) {
    const lb = D.WEAPONS.lightning.base;
    let lying = 0;
    for (const it of this.pickups) if (!it.dead && it.kind === 'en') lying++;
    const need = Math.ceil((1 - this.run.energy) / lb.block - 0.01) - lying;
    n = Math.min(n, need, lb.maxOnScreen - lying);
    for (let i = 0; i < n; i++) { const it = pick('en', x, y, 1); it.vx *= 0.5; }
  };
  game.dropPowerup = function (x, y, type) {
    if (!type && this.run.noDrops) return null;
    if (!type) {
      const p = this.player;
      const keys = Object.keys(D.POWERUPS).filter((k) => !(k === 'heal' && p.lives >= p.maxLives) && !(k === 'shield' && p.shield));
      type = U.pickWeighted(keys, (k) => D.POWERUPS[k].weight);
    }
    const it = pick('pu', x, y, 0);
    it.pu = type;
    it.vx *= 0.3; it.vy = -60 * G.S;
    return it;
  };

  game.updatePickups = function (dt) {
    const p = this.player, S = G.S, st = this.st;
    const magnetAll = this.buffs.magnet > 0 || st.magnet >= 9999;
    const H = G.H;
    for (const it of this.pickups) {
      if (it.dead) continue;
      it.age += dt; it.spin += dt * 6;
      const dx = p.x - it.x, dy = p.y - it.y, d = Math.hypot(dx, dy);
      const mr = it.kind === 'pu' ? st.magnet * 0.6 : st.magnet;
      // монеты и кристаллы сами летят к кораблю через 2.5 с — на телефоне их легко упустить;
      // энергоблоки молнии нужно собрать самому (или магнитом)
      if (p.alive && (it.pull || (it.age > 0.35 && (magnetAll || d < mr)) || (it.kind !== 'pu' && it.kind !== 'en' && it.age > 2.5))) {
        it.pull = true;
        const sp = (380 + it.age * 120) * S;
        it.vx = U.damp(it.vx, dx / (d || 1) * sp, 9, dt);
        it.vy = U.damp(it.vy, dy / (d || 1) * sp, 9, dt);
      } else {
        it.vx *= Math.exp(-2.6 * dt);
        it.vy = U.damp(it.vy, (it.kind === 'pu' ? 55 : 70) * S, 1.8, dt);
      }
      it.x += it.vx * dt; it.y += it.vy * dt;
      if (p.alive && d < p.pickR + (it.kind === 'pu' ? 10 * S : 0)) { this.collect(it); continue; }
      if (it.y > H + 30 || it.age > (it.kind === 'pu' ? 14 : 10)) it.dead = true;
    }
  };

  game.collect = function (it) {
    it.dead = true;
    const p = this.player, run = this.run;
    if (it.kind === 'coin') {
      run.coins += it.val;
      M.addCoins(it.val);
      M.trackMission('coins', it.val);
      A.play('coin');
      SS.emit('coinPicked');
    } else if (it.kind === 'xp') {
      run.xp += it.val * this.st.xp;
      A.play('xp');
      while (run.xp >= D.perkXpNeed(run.level)) { run.xp -= D.perkXpNeed(run.level); run.level++; run.pendingPerks++; }
    } else if (it.kind === 'en') {
      run.energy = Math.min(1, run.energy + D.WEAPONS.lightning.base.block);
      A.play('zap', { vol: 0.35, rate: 2 });
    } else {
      this.applyPowerup(it.pu);
      run.pickups++;
      M.trackMission('pickups', 1);
    }
    this.hudDirty = true;
  };

  game.applyPowerup = function (type) {
    const p = this.player, def = D.POWERUPS[type], S = G.S;
    A.play('powerup');
    SS.tg.haptic('medium');
    FX.glowPuff(p.x, p.y, def.color, 90 * S, 0.35);
    FX.sprite('fx_pickup', 0, 0, { follow: p, w0: p.w * 0.8, w1: p.w * 1.9, dur: 0.45, hold: 0.35, hue: G.hueOf(def.color) });
    FX.text(p.x, p.y - p.w * 0.7, def.name, def.color, 13, 1.0, -50);
    if (type === 'rapid') this.speedFx(G.hueOf(def.color));
    else if (type === 'star') FX.sprite('fx_flare', 0, 0, { follow: p, w0: p.w * 0.8, w1: p.w * 2.2, dur: 0.5, hold: 0.3, hue: 45 });
    else if (type === 'freeze') {
      FX.ring(p.x, p.y, p.w * 0.5, Math.max(G.FW, G.H) * 0.9, '#bff4ff', 0.8, 5);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * U.TAU;
        FX.sprite('fx_flare', p.x + Math.cos(a) * p.w * 1.1, p.y + Math.sin(a) * p.w * 1.1, { w0: 18 * S, w1: 34 * S, dur: 0.5 + i * 0.04, hold: 0.3, hue: 190, rot: a });
      }
      for (const e of this.enemies) if (e.alive && !e.boss) FX.sprite('fx_flare', e.x, e.y, { w0: 16 * S, w1: 28 * S, dur: 0.45, hold: 0.3, hue: 190, minor: true });
    }
    switch (type) {
      case 'heal': this.heal(1); break;
      case 'shield': p.shield = true; this.run.shieldRegenT = 0; this.shieldFx(); M.unlock('shield'); break;
      case 'bomb': p.bombs = Math.min(p.bombs + 1, 9); break;
      case 'star': {
        const pts = Math.round(1000 * this.wave.n * this.diff.score);
        this.addScore(pts);
        FX.text(p.x, p.y - p.w, '+' + U.fmt(pts), '#ffd23d', 15, 1.1, -60);
        this.dropCoins(p.x, p.y - 40 * S, Math.round(8 * this.st.coins));
        break;
      }
      default:
        if (def.dur) this.buffs[type] = def.dur;
        if (type === 'freeze') FX.flash('#9be8ff', 0.25);
    }
    this.hudDirty = true;
  };

  // ════════════════════════════════════════════════════════════
  // УЛУЧШЕНИЯ ЗАБЕГА (выбор 1 из 3)
  // ════════════════════════════════════════════════════════════
  game.perkChoices = function () {
    const p = this.player;
    const avail = D.PERKS.filter((pk) => {
      const lv = this.perk(pk.id);
      if (lv >= pk.max) return false;
      if (pk.filler) return false;
      if (pk.id === 'shieldgen' && this.st.shieldRegen && this.st.shieldRegen <= 15) return false;
      if ((pk.id === 'maxhp' || pk.id === 'shieldgen') && this.perk('glass')) return false;
      if (pk.id === 'glass' && p.lives < 1) return false;
      if (pk.id === 'ricochet' && this.skill('sk_ricochet')) return false;
      return true;
    });
    const picks = [];
    const pool = avail.slice();
    while (picks.length < 3 && pool.length) {
      const pk = U.pickWeighted(pool, (x) => D.RARITY[x.rar].w * (this.evoStep(x.id) ? 1.8 : 1));
      picks.push(pk);
      pool.splice(pool.indexOf(pk), 1);
    }
    // утешительные карты: когда основное взято; на последней жизни «Ремонт» подменяет одну карту
    const heal = D.PERKS.find((x) => x.id === 'heal'), ammo = D.PERKS.find((x) => x.id === 'bomb');
    const canHeal = p.lives < p.maxLives;
    if (canHeal && p.lives <= 1 && picks.length === 3 && Math.random() < 0.6) picks[2] = heal;
    for (const f of [canHeal ? heal : null, ammo]) if (f && picks.length < 3 && !picks.includes(f)) picks.push(f);
    return picks;
  };
  // эволюции оружия
  game.evo = function (wid) { return !!(this.run && this.run.evo && this.run.evo[wid]); };
  // эволюция, к которой ведёт перк (оружие в бою, эволюция ещё не получена)
  game.evoStep = function (perkId) {
    const p = this.player;
    for (const ev of D.EVOLUTIONS) if (ev.perk === perkId && p.weapons.includes(ev.weapon) && !this.evo(ev.weapon)) return ev;
    return null;
  };
  game.checkEvolutions = function () {
    const p = this.player, run = this.run;
    for (const ev of D.EVOLUTIONS) {
      if (run.evo[ev.weapon] || !p.weapons.includes(ev.weapon) || this.perk(ev.perk) < ev.lvl) continue;
      run.evo[ev.weapon] = true;
      M.onEvolution(ev.weapon);
      FX.text(G.FW / 2, G.H * 0.4, 'ЭВОЛЮЦИЯ: ' + ev.name, '#ff9ff3', 18, 1.8, -25);
      FX.sprite('fx_beam', 0, 0, { follow: p, oy: -p.w * 0.95, w0: p.w * 1.3, w1: p.w * 1.5, dur: 1.2, hold: 0.5, fadeIn: 0.1, hue: 300 });
      FX.flash('#ff9ff3', 0.3);
      A.play('levelup', { rate: 1.2 });
      SS.emit('toast', { ico: '🧬', title: 'ЭВОЛЮЦИЯ ОРУЖИЯ', text: ev.name + ': ' + ev.desc, info: true, dur: 3200 });
      if (p.weapon !== ev.weapon) this.setWeapon(ev.weapon);
    }
  };

  game.offerPerk = function () {
    this.state = 'perk';
    this.pointer.id = null;
    A.play('levelup');
    SS.tg.haptic('success');
    SS.emit('perkOffer', withRng(this.run.perkRng, () => this.perkChoices()));
  };
  // ── модули корабля: старт забега и станция после босса (kind: 'start' | 'station') ──
  game.moduleChoices = function () {
    const pool = D.MODULES.filter((m) => this.mod(m.id) < m.max && !(m.id === 'plating' && this.perk('glass')));
    const n = D.MODULE_CHOICES, picks = [];
    while (picks.length < n && pool.length) {
      const m = U.pickWeighted(pool, (x) => D.RARITY[x.rar].w);
      picks.push(m);
      pool.splice(pool.indexOf(m), 1);
    }
    return picks;
  };
  game.offerModules = function (kind) {
    const choices = withRng(this.run.perkRng, () => this.moduleChoices());
    if (this.state !== 'play' || !this.player.alive || !choices.length) { if (kind === 'station') this.jumpScene(); return; }
    this.state = 'perk';
    this.offerKind = kind;
    this.pointer.id = null;
    A.play('levelup', { rate: 0.8 });
    SS.tg.haptic('success');
    SS.emit('moduleOffer', choices, kind);
  };
  game.chooseModule = function (id) {
    if (this.state !== 'perk') return;
    const p = this.player, run = this.run, kind = this.offerKind;
    run.mods[id] = (run.mods[id] || 0) + 1;
    if (id === 'plating') { p.maxLives += 2; p.lives += 2; }
    if (id === 'shieldcore' && !p.shield) { p.shield = true; this.shieldFx(); }
    if (id === 'bombbay') p.bombs = Math.min(9, p.bombs + 2);
    this.refreshStats();
    A.play('perk');
    FX.glowPuff(p.x, p.y, '#ffc83d', 120 * G.S, 0.5);
    FX.ring(p.x, p.y, p.w * 0.4, p.w * 1.7, '#ffc83d', 0.5, 4);
    p.inv = Math.max(p.inv, 0.8);
    this.offerKind = null;
    this.state = 'play';
    this.hudDirty = true;
    if (kind === 'station') this.after(0.4, () => this.jumpScene());
  };
  game.rerollCost = function () { return 40 + this.run.rerolls * 40; };
  game.rerollPerks = function () {
    if (this.state !== 'perk') return null;
    if (!M.spend(this.rerollCost())) { A.play('error'); return null; }
    this.run.rerolls++;
    A.play('click');
    return withRng(this.run.perkRng, () => this.perkChoices());
  };
  // действие перка; free — подарен правилами (не считается выбором и не идёт в задания)
  game.grantPerk = function (id, free) {
    const run = this.run, p = this.player;
    run.perks[id] = (run.perks[id] || 0) + 1;
    if (!free) {
      run.perkCount++;
      run.pendingPerks = Math.max(0, run.pendingPerks - 1);
      M.trackMission('perks', 1);
      if (run.level >= 15) M.unlock('perk15');
    }
    if (id === 'heal') p.lives = Math.min(p.maxLives, p.lives + 1);
    if (id === 'maxhp') { p.maxLives++; p.lives++; }
    if (id === 'bomb') p.bombs = Math.min(9, p.bombs + 1);
    if (id === 'shieldgen' && !p.shield) { p.shield = true; if (!free) this.shieldFx(); }
    if (id === 'glass') { p.maxLives = 1; p.lives = 1; }
    this.refreshStats();
    this.checkEvolutions();
  };
  game.choosePerk = function (id) {
    if (this.state !== 'perk') return;
    const p = this.player;
    this.grantPerk(id);
    A.play('perk');
    FX.glowPuff(p.x, p.y, '#3dffa2', 110 * G.S, 0.45);
    FX.sprite('fx_beam', 0, 0, { follow: p, oy: -p.w * 0.95, w0: p.w * 1.2, w1: p.w * 1.35, dur: 0.85, hold: 0.45, fadeIn: 0.1 });
    FX.ring(p.x, p.y, p.w * 0.4, p.w * 1.5, '#3dffa2', 0.45, 4);
    p.inv = Math.max(p.inv, 0.8);
    this.state = 'play';
    this.hudDirty = true;
  };

  // ════════════════════════════════════════════════════════════
  // ВОЛНЫ
  // ════════════════════════════════════════════════════════════
  game.nextWave = function () {
    const n = this.wave ? this.wave.n + 1 : 1;
    const isBoss = n % 5 === 0;
    const sector = Math.floor((n - 1) / 5);
    const tn = n + (this.diff.waveOffset || 0);
    const budget = isBoss ? 0 : (9 + tn * 4.4 + Math.pow(tn, 1.28)) * this.diff.count;
    this.wave = { n, boss: isBoss, budget, spent: 0, spawnT: 0.8, intro: n === 1 ? 1.2 : 1.6, done: false, clearT: 0, miniDone: !(n % 5 === 3 && n >= 8), startT: this.t };
    this.run.waveDamage = 0;
    // после прыжка (jumpScene) сектор уже сменён
    if (sector !== this.run.sector) {
      this.run.sector = sector;
      G.bg.setSector(sector);
      G.bg.warp = 1;
    }
    // баннер сектора — только если его карточку не показали в прыжке
    const newSector = n > 1 && (n - 1) % 5 === 0 && this.run.cardSector !== sector;
    SS.emit('waveStart', { n, boss: isBoss, sector, sectorName: D.SECTORS[sector % D.SECTORS.length].name, newSector });
    SS.events.roll(this.wave);
    if (this.run.challenge) M.challengeWave(this.run.challenge, n);
    if (isBoss && this.state === 'play') this.bossScene(n);
    else if (isBoss) {
      // игрок как раз погибает — без кат-сцены, как раньше
      this.wave.intro = 3.2;
      this.after(2.6, () => SS.enemies.spawnBoss(n));
      SS.emit('bossWarning', D.BOSSES[(n / 5 - 1) % D.BOSSES.length]);
      FX.vignette('#ff2a48', 2.4, 0.75, true);
      A.play('warning');
    }
    this.hudDirty = true;
  };

  game.updateWaves = function (dt) {
    const w = this.wave;
    if (!w) return;
    if (w.intro > 0) { w.intro -= dt; return; }
    let alive = 0;
    // астероиды сектора (def.prop) — часть обстановки, зачистку волны не задерживают
    for (const e of this.enemies) if (e.alive && !e.leaving && !e.def.prop) alive++;
    if (w.boss) {
      // волна босса завершается его уничтожением (см. enemies.bossDefeated)
      return;
    }
    if (!w.done) {
      w.spawnT -= dt;
      const tn = this.threatWave();
      const cap = Math.min(26 * Math.max(1, this.diff.count), (7 + tn * 0.7) * this.diff.count);
      if (w.spawnT <= 0 && alive < cap) withRng(this.run.waveRng, () => {
        const cost = SS.enemies.spawnGroup(tn, w.budget - w.spent);
        w.spent += cost;
        w.spawnT = Math.max(0.42, 1.3 - tn * 0.035) * U.rand(0.75, 1.25) / Math.pow(this.diff.count, 0.4);
        if (!w.miniDone && w.spent > w.budget * 0.4) { w.miniDone = true; SS.enemies.spawnMini(w.n); }
        if (w.spent >= w.budget) w.done = true;
      });
    } else if (alive === 0) {
      w.clearT += dt;
      if (w.clearT > 0.9) this.waveCleared();
    }
  };

  game.waveCleared = function () {
    const w = this.wave, run = this.run;
    if (w.cleared) return;
    w.cleared = true;
    const perfect = run.waveDamage === 0;
    const bonus = Math.round(250 * w.n * this.diff.score * (perfect ? 2 : 1));
    this.addScore(bonus);
    if (perfect && w.n >= 5) M.unlock('no_hit_level');
    if (w.n >= 10 && this.perk('glass')) M.unlock('glass10');
    SS.events.finish();
    // собираем оставшиеся монеты и кристаллы
    for (const it of this.pickups) if (it.kind !== 'pu') it.pull = true;
    SS.emit('waveClear', { n: w.n, bonus, perfect });
    // после босса — прыжок в следующий сектор
    if (w.boss) this.after(0.8, () => { if (this.wave === w) this.offerModules('station'); });
    else this.after(1.2, () => { if (this.wave === w) this.nextWave(); });
  };

  // уничтожение босса (из enemies.js)
  game.onBossDefeated = function (boss) {
    const run = this.run, S = G.S;
    run.bosses++;
    run.bossIds.push(boss.bdef.id);
    M.onBoss(boss.bdef.id);
    if (!run.bossDamaged) M.unlock('no_damage_boss');
    const pts = Math.round(6000 * (this.wave.n / 5) * this.diff.score);
    this.addScore(pts);
    this.dropCoins(boss.x, boss.y, Math.round((60 + this.wave.n * 8) * this.st.coins * this.diff.count));
    this.dropXp(boss.x, boss.y, 18 + this.wave.n);
    this.dropPowerup(boss.x - 30 * S, boss.y, 'heal');
    this.dropPowerup(boss.x + 30 * S, boss.y);
    this.slowT = 1.0;
    for (const b of this.ebullets) b.dead = true;
    SS.emit('bossDefeated', { def: boss.bdef, pts });
    this.after(2.2, () => {
      for (const it of this.pickups) it.pull = true;
      this.waveCleared();
    });
  };

  // ════════════════════════════════════════════════════════════
  // КАТ-СЦЕНЫ: выход босса и прыжок в следующий сектор
  //  Затемнение и полосы кино поверх боя, карточка с крупным именем.
  //  Корабль ведёт сцена: игрок им не управляет, он неуязвим и не стреляет; касание — пропуск.
  //  scene.card = { cap, name, sub, at, y } — карточка, появившаяся в момент at
  // ════════════════════════════════════════════════════════════
  const ease3 = (q) => 1 - Math.pow(1 - U.clamp(q, 0, 1), 3);

  // выход босса: полная сцена — при первой встрече, дальше короткая
  game.bossScene = function (n) {
    const def = D.BOSSES[(n / 5 - 1) % D.BOSSES.length];
    const seen = M.s.bossSeen || (M.s.bossSeen = []);
    const full = !seen.includes(def.id);
    if (full) { seen.push(def.id); SS.store.soon(); }
    // когда выходит босс, когда появляется карточка с именем, когда сцена заканчивается
    const sc = full ? { spawnT: 0.9, cardT: 2.4, end: 4.4 } : { spawnT: 0.1, cardT: 0.5, end: 1.8 };
    this.startScene(Object.assign(sc, { kind: 'boss', n, def, full, color: def.color, spawned: false }));
    A.play('warning');
  };

  // прыжок после босса: звёзды из заставки, вспышка, новый фон и карточка сектора
  game.jumpScene = function () {
    if (this.state !== 'play') { this.nextWave(); return; }
    const sector = Math.floor(this.wave.n / 5), sec = D.SECTORS[sector % D.SECTORS.length];
    this.startScene({ kind: 'jump', sector, sec, color: sec.neb[0], flashT: 1.45, cardT: 1.75, end: 3.4, warp: 0, flashed: false, stars: SS.intro.warpStars(150) });
    A.play('skill', { rate: 0.6 });
  };

  // срежиссированный момент: снаряды в полёте гаснут, корабль ведёт сцена (updateScene)
  game.startScene = function (sc) {
    this.scene = Object.assign(sc, { t: 0, out: -1, card: null });
    this.state = 'cutscene';
    for (const b of this.ebullets) b.dead = true;
    for (const b of this.bullets) b.dead = true;
    // астероиды сектора не лезут в кадр: тают за полсекунды (updateScene), без добычи
    for (const e of this.enemies) if (e.alive && e.def.prop) { e.hittable = false; e.fading = true; }
    A.muffle(true);
    SS.emit('cinema', true);
  };

  game.updateScene = function (dt) {
    const sc = this.scene;
    for (const e of this.enemies) if (e.fading && e.alive) { e.alpha -= dt * 2.5; if (e.alpha <= 0) e.alive = false; }
    // сцена закончилась — полосы ещё уезжают
    if (sc.out >= 0) { sc.out += dt; if (sc.out > 0.45) this.scene = null; return; }
    sc.t += dt;
    // корабль выходит в центр; в прыжке на разгоне подаётся вперёд, после вспышки возвращается
    const p = this.player, ox = p.x;
    p.x = U.damp(p.x, G.FW / 2, 2.6, dt);
    p.y = U.damp(p.y, G.H * (sc.kind === 'jump' ? 0.72 - 0.1 * sc.warp : 0.76), 2.6, dt);
    p.vxs += p.x - ox;
    if (sc.kind === 'boss') {
      if (!sc.spawned && sc.t >= sc.spawnT) { sc.spawned = true; SS.enemies.spawnBoss(sc.n); }
      if (!sc.card && sc.t >= sc.cardT) this.bossCard();
    } else {
      // разгон до вспышки, после неё торможение
      sc.warp = sc.t < sc.flashT ? ease3((sc.t - 0.25) / (sc.flashT - 0.25)) : Math.max(0, 1 - (sc.t - sc.flashT) * 0.9);
      SS.intro.warpStep(sc.stars, dt, sc.warp);
      if (!sc.flashed && sc.t >= sc.flashT) this.jumpFlash();
      if (!sc.card && sc.t >= sc.cardT) this.sectorCard();
    }
    if (sc.t >= sc.end) this.endScene();
  };

  game.bossCard = function () {
    const sc = this.scene, def = sc.def;
    sc.card = { cap: sc.full ? 'НОВЫЙ БОСС' : 'БОСС', name: def.name, sub: def.title, at: sc.t, y: 0.6 };
    A.play('bossRoar');
    FX.shake(sc.full ? 0.6 : 0.4);
    SS.tg.haptic('warning');
  };

  // на пике прыжка: под вспышкой меняется сектор, всё от прошлого (астероиды) остаётся позади
  game.jumpFlash = function () {
    const sc = this.scene;
    sc.flashed = true;
    this.run.sector = sc.sector;
    G.bg.setSector(sc.sector, true);
    G.bg.warp = 0.7;
    for (const e of this.enemies) if (!e.boss) e.alive = false;
    FX.flash('#dcecff', 0.7);
    A.play('teleport');
  };

  game.sectorCard = function () {
    const sc = this.scene;
    sc.card = { cap: 'СЕКТОР ' + (sc.sector + 1), name: sc.sec.name, sub: sc.sec.desc || '', at: sc.t, y: 0.42 };
    // карточку видели — баннер сектора на старте волны не нужен (см. nextWave)
    this.run.cardSector = sc.sector;
  };

  game.endScene = function () {
    const sc = this.scene;
    if (!sc || this.state !== 'cutscene') return;
    sc.out = 0;
    this.state = 'play';
    this.player.inv = Math.max(this.player.inv, 0.5);
    A.muffle(false);
    SS.emit('cinema', false);
    this.hudDirty = true;
    if (sc.kind === 'jump') this.nextWave();
  };

  game.skipScene = function () {
    const sc = this.scene;
    if (!sc || this.state !== 'cutscene') return;
    if (sc.kind === 'boss') {
      if (!sc.spawned) { sc.spawned = true; SS.enemies.spawnBoss(sc.n); }
      // имя ещё не показали — покажем обычным предупреждением поверх боя
      if (!sc.card) { A.play('bossRoar'); SS.emit('bossWarning', sc.def); }
      // босс сразу встаёт на место, дальше обычный выход (enemies.updateBoss)
      if (this.boss && this.boss.entering) this.boss.y = this.boss.baseY;
    } else {
      if (!sc.flashed) this.jumpFlash();
      sc.warp = 0;
    }
    this.endScene();
  };

  // 0..1: полосы выезжают за 0,45 с и уезжают за 0,45 с после конца
  function sceneK(sc) {
    return sc.out >= 0 ? 1 - ease3(sc.out / 0.45) : ease3(sc.t / 0.45);
  }

  // затемнение фона под боем; в прыжке гуще, и поверх него летят звёзды
  game.drawSceneDim = function (ctx) {
    const sc = this.scene, k = sceneK(sc);
    if (k <= 0) return;
    const warp = sc.kind === 'jump' ? sc.warp : 0;
    ctx.fillStyle = 'rgba(0,0,0,' + Math.min(0.92, 0.5 * k + 0.42 * warp).toFixed(3) + ')';
    ctx.fillRect(0, 0, G.W, G.H);
    if (warp > 0.01) SS.intro.warpDraw(ctx, sc.stars, warp, G.FX + G.FW / 2, G.H * 0.42, Math.max(G.W, G.H) * 0.7, Math.min(1, warp * 1.6));
  };

  // полосы кино и карточка
  game.drawScene = function (ctx) {
    const sc = this.scene, k = sceneK(sc);
    if (k <= 0) return;
    const W = G.W, H = G.H, S = G.S, bh = Math.round(H * 0.11 * k);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, bh);
    ctx.fillRect(0, H - bh, W, bh);
    ctx.fillStyle = G.hexA(sc.color, 0.55 * k);
    ctx.fillRect(0, bh, W, 1);
    ctx.fillRect(0, H - bh - 1, W, 1);
    const cd = sc.card;
    if (!cd) return;
    const lt = sc.t - cd.at, a = Math.min(1, lt / 0.25) * k;
    if (a <= 0) return;
    const cx = G.FX + G.FW / 2, cy = H * cd.y, name = cd.name;
    const size = Math.round(Math.min(32 * S, G.FW * 0.92 / (name.length * 0.82)));
    const grow = 1 + 0.12 * (1 - Math.min(1, lt / 0.35));
    // линия под именем раскрывается от центра
    const lw = G.FW * 0.36 * Math.min(1, lt / 0.4);
    const maxW = G.FW * 0.92;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = sc.color;
    ctx.font = '700 ' + Math.round(11 * S) + 'px Orbitron, Rajdhani, sans-serif';
    ctx.fillText(cd.cap, cx, cy - size * 0.95, maxW);
    ctx.fillRect(cx - lw, cy + size * 0.62, lw * 2, Math.max(1, 2 * S));
    ctx.shadowColor = sc.color; ctx.shadowBlur = 18 * S;
    ctx.fillStyle = '#fff';
    ctx.font = '900 ' + Math.round(size * grow) + 'px Orbitron, Rajdhani, sans-serif';
    ctx.fillText(name, cx, cy, maxW);
    ctx.shadowBlur = 0;
    if (cd.sub) {
      ctx.fillStyle = 'rgba(255,255,255,.78)';
      ctx.font = '600 ' + Math.round(15 * S) + 'px Rajdhani, sans-serif';
      ctx.fillText(cd.sub, cx, cy + size * 0.62 + 18 * S, maxW);
    }
    ctx.restore();
  };

  // ════════════════════════════════════════════════════════════
  // УБОРКА
  // ════════════════════════════════════════════════════════════
  function sweep(arr, pool) {
    let j = 0;
    for (let i = 0; i < arr.length; i++) {
      const o = arr[i];
      if (o.dead) { if (pool) pool.put(o); } else arr[j++] = o;
    }
    arr.length = j;
  }
  game.cleanup = function () {
    sweep(this.bullets, bulletPool);
    sweep(this.ebullets, ebPool);
    sweep(this.pickups, pickPool);
    let j = 0;
    const en = this.enemies;
    for (let i = 0; i < en.length; i++) if (en[i].alive) en[j++] = en[i];
    en.length = j;
  };

  // ════════════════════════════════════════════════════════════
  // ОТРИСОВКА
  // ════════════════════════════════════════════════════════════
  const flameCache = {};
  function flameSprite(colors) {
    const key = colors.join();
    if (flameCache[key]) return flameCache[key];
    const w = 24, h = 72;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, colors[0]); g.addColorStop(0.18, colors[1]); g.addColorStop(0.55, G.hexA(colors[2], 0.7)); g.addColorStop(1, G.hexA(colors[2], 0));
    x.fillStyle = g;
    x.beginPath(); x.moveTo(w * 0.12, 0); x.quadraticCurveTo(w * 0.5, -4, w * 0.88, 0); x.quadraticCurveTo(w * 0.62, h * 0.55, w * 0.5, h); x.quadraticCurveTo(w * 0.38, h * 0.55, w * 0.12, 0); x.fill();
    flameCache[key] = c;
    return c;
  }
  function trailColors(t) {
    const tr = D.TRAILS.find((x) => x.id === t) || D.TRAILS[0];
    if (tr.colors !== 'rainbow') return tr.colors;
    const h = Math.floor((performance.now() / 120) % 12) * 30;
    return ['#ffffff', 'hsl(' + h + ',100%,70%)', 'hsl(' + ((h + 40) % 360) + ',100%,50%)'];
  }
  function hslHex(h, s, l) {
    // для кэша пламени нужны hex-цвета
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
    return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  game.trailColors = function (id) {
    const c = trailColors(id);
    return c.map((v) => (v[0] === 'h' ? (() => { const m = v.match(/hsl\((\d+),(\d+)%,(\d+)%\)/); return m ? hslHex(+m[1], +m[2], +m[3]) : '#ffffff'; })() : v));
  };

  // спрайт корабля игрока с учётом раскраски
  game.shipCanvas = function (model, skinId) {
    const sk = D.SKINS.find((k) => k.id === skinId) || D.SKINS[0];
    const sprite = D.SHIPS[model].sprite;
    if (sk.hue === 'rainbow') {
      const h = Math.floor((performance.now() / 150) % 12) * 30;
      return G.tinted(sprite, { hue: h });
    }
    return G.tinted(sprite, sk) || null;
  };

  // облик корабля: нарисованный цветной вариант или перекраска; preview — для карточек раскрасок
  game.shipLook = function (model, skinId, preview) {
    const variant = D.SHIP_VARIANTS[model] && D.SHIP_VARIANTS[model][skinId];
    if (variant) return { sprite: variant, cv: null };
    const sprite = D.SHIPS[model].sprite;
    const sk = D.SKINS.find((k) => k.id === skinId) || D.SKINS[0];
    if (preview && sk.hue === 'rainbow') return { sprite, cv: G.tinted(sprite, { hue: 300 }) };
    return { sprite, cv: this.shipCanvas(model, skinId) };
  };

  // облик корабля для отрисовки (спрайт, перекраска, пламя, сопла) — раньше каждый кадр заново искались
  // раскраска и след и собирались строки-ключи; теперь пересчёт только при смене корабля, раскраски,
  // следа или шага радуги
  const NOZ_DEFAULT = [[0.5, 1, 1]];
  const looks = [];
  let skinById = null, trailById = null;
  function drawLook(model, skin, trail) {
    if (!skinById) {
      skinById = {}; for (const k of D.SKINS) skinById[k.id] = k;
      trailById = {}; for (const k of D.TRAILS) trailById[k.id] = k;
    }
    const now = performance.now();
    const sk = skinById[skin], tr = trailById[trail];
    const ss = sk && sk.hue === 'rainbow' ? Math.floor((now / 150) % 12) : 0;
    const ts = tr && tr.colors === 'rainbow' ? Math.floor((now / 120) % 12) : 0;
    for (let i = 0; i < looks.length; i++) {
      const L = looks[i];
      if (L.model === model && L.skin === skin && L.trail === trail && L.ss === ss && L.ts === ts) return L;
    }
    const variant = D.SHIP_VARIANTS[model] && D.SHIP_VARIANTS[model][skin];
    const sprite = variant || D.SHIPS[model].sprite;
    const cols = game.trailColors(trail);
    const L = { model, skin, trail, ss, ts, sprite, f: G.frame(sprite), cv: variant ? null : game.shipCanvas(model, skin),
      flame: flameSprite(cols), glowCol: cols[1], noz: G.nozzles[sprite] || NOZ_DEFAULT,
      tfx: tr && tr.fx ? G.frame(tr.fx) : null, spin: !!(tr && tr.spin) };
    // шлейф рисуем только из главных сопел, чтобы у кораблей с 3–4 соплами не было каши
    if (L.tfx) { const big = Math.max(...L.noz.map((n) => n[2])); L.tnoz = L.noz.filter((n) => n[2] >= big * 0.75); }
    if (!L.f) return L;
    looks.push(L);
    if (looks.length > 8) looks.shift();
    return L;
  }

  // корабль с пламенем: (x, y) — центр, w — ширина
  game.drawShip = function (ctx, model, skin, trail, x, y, w, tilt, t, boost) {
    const L = drawLook(model, skin, trail), f = L.f;
    if (!f) return;
    const h = w * f[3] / f[2];
    const flame = L.flame, noz = L.noz;
    ctx.save();
    ctx.translate(x, y);
    if (tilt) ctx.rotate(tilt);
    // пламя
    ctx.globalCompositeOperation = 'lighter';
    for (const n of noz) {
      const nx = (n[0] - 0.5) * w, ny = (n[1] - 0.5) * h;
      const fl = (0.75 + 0.25 * Math.sin(t * 38 + n[0] * 9) + Math.random() * 0.12) * (boost || 1);
      const fw = w * 0.2 * n[2], fh = w * 0.62 * n[2] * fl;
      ctx.globalAlpha = 0.95;
      ctx.drawImage(flame, nx - fw / 2, ny - fh * 0.06, fw, fh);
      ctx.globalAlpha = 0.5;
      const gs = fw * 2.6;
      ctx.drawImage(G.glow(L.glowCol, 64), nx - gs / 2, ny - gs * 0.35, gs, gs);
    }
    const tf = L.tfx, ti = tf && G.src(tf);
    if (ti) {
      for (const n of L.tnoz) {
        const nx = (n[0] - 0.5) * w, ny = (n[1] - 0.5) * h, k = n[2] * (boost || 1);
        if (L.spin) {
          // спираль крутится прямо за соплом
          const sz = w * 0.5 * k;
          ctx.save(); ctx.translate(nx, ny + sz * 0.42); ctx.rotate(t * 5); ctx.scale(1, 0.72);
          ctx.globalAlpha = 0.85;
          ctx.drawImage(ti, tf[0], tf[1], tf[2], tf[3], -sz / 2, -sz / 2 * tf[3] / tf[2], sz, sz * tf[3] / tf[2]);
          ctx.restore();
        } else {
          const tw = w * 0.36 * k, th = tw * tf[3] / tf[2] * (0.9 + 0.1 * Math.sin(t * 30 + n[0] * 7));
          ctx.globalAlpha = 0.9;
          ctx.drawImage(ti, tf[0], tf[1], tf[2], tf[3], nx - tw / 2, ny - th * 0.04, tw, th);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const cv = L.cv;
    if (cv) ctx.drawImage(cv, -w / 2, -h / 2, w, h);
    else { const im = G.src(f); if (im) ctx.drawImage(im, f[0], f[1], f[2], f[3], -w / 2, -h / 2, w, h); }
    ctx.restore();
  };

  game.draw = function (ctx) {
    const W = G.W, H = G.H, S = G.S;
    const q = SS.main.quality;
    G.bg.draw(ctx, q);
    if (this.state === 'idle') { this.drawAttract(ctx); FX.drawFront(ctx); return; }
    if (!this.player) return;
    if (this.scene) this.drawSceneDim(ctx);
    ctx.save();
    ctx.translate(G.FX + FX.shakeX, FX.shakeY);
    FX.drawBack(ctx);
    this.drawPickups(ctx);
    SS.enemies.drawAll(ctx);
    this.drawBullets(ctx);
    this.drawPlayer(ctx);
    this.drawEBullets(ctx);
    SS.events.draw(ctx);
    this.drawOverlays(ctx);
    FX.drawFront(ctx);
    FX.drawTexts(ctx);
    ctx.restore();
    // эффекты экрана
    if (this.run.skillFx.sk_timewarp > 0 || this.buffs.freeze > 0) {
      const frz = this.buffs.freeze > 0;
      ctx.fillStyle = frz ? 'rgba(120,220,255,.05)' : 'rgba(60,110,255,.06)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (frz ? 0.9 : 0.7) + 0.1 * Math.sin(this.t * 2.5);
      ctx.drawImage(FX.vigCanvas(frz ? '#8fe9ff' : '#3d6bff'), 0, 0, W, H);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.player.alive && this.player.lives === 1) {
      ctx.globalAlpha = 0.55 + 0.35 * Math.sin(this.t * 5);
      ctx.drawImage(SS.main.vignetteRed(), 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    FX.drawScreen(ctx, W, H);
    FX.drawFlash(ctx, W, H);
    // края поля на широких экранах
    if (G.FX > 1) {
      ctx.fillStyle = 'rgba(2,3,10,.55)';
      ctx.fillRect(0, 0, G.FX, H); ctx.fillRect(G.FX + G.FW, 0, W - G.FX - G.FW, H);
      ctx.fillStyle = 'rgba(61,224,255,.18)';
      ctx.fillRect(G.FX - 1, 0, 1, H); ctx.fillRect(G.FX + G.FW, 0, 1, H);
    }
    if (this.scene) this.drawScene(ctx);
  };

  game.drawAttract = function (ctx) {
    const s = M.s, S = G.S, t = this.attract.t;
    const slot = this.attract.slot;
    if (slot && slot.h < 44) return;
    const sh = D.SHIPS[s.ship.model] || D.SHIPS.ship1, fr = G.frame(sh.sprite);
    let size = (slot ? U.clamp(slot.h * 0.66, 38, 92) : 70 * Math.min(1.3, S * 1.1)) * (sh.scale || 1);
    // корабль вместе с пламенем помещается между логотипом и выбором сложности
    if (slot && fr) size = Math.min(size, (slot.h / 2 + 10) / (fr[3] / fr[2] / 2 + 0.5));
    const x = G.W / 2 + Math.sin(t * 0.7) * 26 * S;
    const y = (slot ? slot.y : G.H * 0.36) + Math.sin(t * 1.3) * 6 * S;
    ctx.save();
    ctx.globalAlpha = 0.95;
    this.drawShip(ctx, s.ship.model, s.ship.skin, s.ship.trail, x, y, size, Math.cos(t * 0.7) * 0.12, t, 1.1);
    ctx.restore();
  };

  game.drawPickups = function (ctx) {
    const S = G.S, coin = G.proc('coin'), xp = G.proc('xp'), xpBig = G.proc('xpBig');
    for (const it of this.pickups) {
      if (it.dead) continue;
      if (it.kind === 'coin') {
        const s = (it.val >= 25 ? 22 : it.val >= 5 ? 17 : 13) * S;
        const sx = Math.abs(Math.cos(it.spin)) * 0.8 + 0.2;
        ctx.drawImage(coin, it.x - s * sx / 2, it.y - s / 2, s * sx, s);
      } else if (it.kind === 'xp') {
        const big = it.val >= 5, s = (big ? 18 : 12) * S;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5;
        ctx.drawImage(G.glow(big ? '#5cc8ff' : '#3dffa2', 64), it.x - s, it.y - s, s * 2, s * 2);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(big ? xpBig : xp, it.x - s / 2, it.y - s / 2, s, s);
      } else if (it.kind === 'en') {
        // энергоблок: пульсирует, перед исчезновением мигает
        const s = 20 * S * (1 + Math.sin(it.age * 7) * 0.08), en = G.proc('energy');
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5;
        ctx.drawImage(G.glow('#fff36b', 64), it.x - s * 1.1, it.y - s * 1.1, s * 2.2, s * 2.2);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = it.age > 8 ? 0.5 + 0.5 * Math.sin(it.age * 20) : 1;
        ctx.drawImage(en, it.x - s * 0.39, it.y - s / 2, s * 0.78, s);
      } else {
        const def = D.POWERUPS[it.pu];
        const s = 34 * S * (1 + Math.sin(it.age * 5) * 0.05);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55 + Math.sin(it.age * 6) * 0.2;
        ctx.drawImage(G.glow(def.color, 64), it.x - s, it.y - s, s * 2, s * 2);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        if (def.sprite) G.draw(ctx, def.sprite, it.x, it.y, s);
        else ctx.drawImage(G.proc('pu_' + (def.ico === 'snow' ? 'freeze' : def.ico)), it.x - s / 2, it.y - s / 2, s, s);
        if (it.age > 11) { ctx.globalAlpha = 0.5 + 0.5 * Math.sin(it.age * 20); }
      }
      ctx.globalAlpha = 1;
    }
  };

  game.drawBullets = function (ctx) {
    ctx.globalCompositeOperation = 'lighter';
    const rocket = G.proc('rocket'), trail = G.frame('fx_tr_rocket') && SS.main.quality > 0, vortex = G.frame('fx_vortex');
    for (const b of this.bullets) {
      if (b.dead) continue;
      const ang = Math.atan2(b.vy, b.vx) + Math.PI / 2;
      if (b.kind === 'rocket') {
        const f = b.sprite && G.frame(b.sprite);
        const h = f ? b.w * f[3] / f[2] : b.w * rocket.height / rocket.width;
        if (f && trail) {
          // след: голова у сопла, хвост из искр уходит назад по курсу
          const va = ang - Math.PI / 2, tw = b.w * 0.9, back = h * 0.35 + tw * 1.2;
          ctx.globalAlpha = 0.75;
          G.draw(ctx, 'fx_tr_rocket', b.x - Math.cos(va) * back, b.y - Math.sin(va) * back, tw, va + 1.262);
          ctx.globalAlpha = 1;
        }
        ctx.globalCompositeOperation = 'source-over';
        if (f) G.draw(ctx, b.sprite, b.x, b.y, b.w, ang);
        else { ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(ang); ctx.drawImage(rocket, -b.w / 2, -h / 2, b.w, h); ctx.restore(); }
        ctx.globalCompositeOperation = 'lighter';
        const gs = b.w * (f ? 1.7 : 2.2);
        ctx.globalAlpha = f ? 0.75 : 1;
        ctx.drawImage(G.glow('#ff9f3d', 64), b.x - Math.sin(ang) * h * 0.5 - gs / 2, b.y + Math.cos(ang) * h * 0.5 - gs / 2, gs, gs);
        ctx.globalAlpha = 1;
      } else if (b.kind === 'dark') {
        const s = b.r * 0.42 * (1 + Math.sin(b.age * 12) * 0.06);
        ctx.globalCompositeOperation = 'source-over';
        if (vortex) {
          ctx.globalCompositeOperation = 'lighter';
          G.draw(ctx, 'fx_vortex', b.x, b.y, s * 2.7, b.rot);
          ctx.globalCompositeOperation = 'source-over';
          ctx.drawImage(G.proc('voidcore'), b.x - s * 0.5, b.y - s * 0.5, s, s);
        } else { const v = G.proc('vortex'); ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot); ctx.drawImage(v, -s, -s, s * 2, s * 2); ctx.restore(); }
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.16;
        ctx.drawImage(G.soft('#7a3dff', 64), b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = '#c9a0ff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, b.rot * 0.3, b.rot * 0.3 + U.TAU * 0.75); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (b.kind === 'wave') {
        // серп: широкое свечение + яркая кромка; заряженная волна белее, к концу полёта гаснет
        const w = waveGeom(b), fade = Math.min(1, b.life / 0.15);
        ctx.lineCap = 'round';
        // три слоя: мягкий ореол, неоновое тело, белая кромка
        for (const [col, a, lw] of [['#3dc8ff', 0.1 + 0.06 * b.ch, 2.6], ['#7ff6ff', 0.45, 1.1], [b.ch > 0.66 ? '#ffffff' : '#e8ffff', 0.9, 0.4]]) {
          ctx.globalAlpha = a * fade; ctx.strokeStyle = col; ctx.lineWidth = b.r * lw;
          ctx.beginPath(); ctx.arc(w.cx, w.cy, w.R, w.ang - w.span, w.ang + w.span); ctx.stroke();
        }
        ctx.globalAlpha = 1; ctx.lineCap = 'butt';
      } else if (b.cv || b.sprite) {
        // отскочившие от верха снаряды тают
        if (b.fade) ctx.globalAlpha = U.clamp(b.life / b.fade, 0, 1) * 0.85;
        if (b.cv) G.drawCanvas(ctx, b.cv, b.x, b.y, b.wid === 'plasma' ? b.w * (0.7 + 0.5 * plasmaGrow(b)) : b.w, b.kind === 'plasma' ? b.age * 4 : 0);
        else G.draw(ctx, b.sprite, b.x, b.y, b.w, ang);
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  // шкала ресурса: магазин — деления по числу выстрелов, остальное — заполнение снизу вверх
  game.drawWeaponRes = function (ctx, p, res) {
    const S = G.S, w = 3.5 * S, h = p.w * 0.6, x = p.x - p.w * 0.66 - w / 2, y = p.y - h * 0.4;
    const col = D.WEAPONS[p.weapon].color, empty = res.kind === 'energy' && res.k <= 0;
    if (res.kind === 'charge') {
      // заряд серпа — кольцо вокруг корабля: длина и яркость по заряду
      const R = p.w * 0.66, a0 = -Math.PI / 2;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.25 + 0.55 * res.k;
      ctx.strokeStyle = res.k > 0.66 ? '#e8ffff' : col; ctx.lineWidth = (1.5 + 1.5 * res.k) * S; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(p.x, p.y, R, a0 - Math.PI * res.k, a0 + Math.PI * res.k); ctx.stroke();
      ctx.globalAlpha = 1; ctx.lineCap = 'butt'; ctx.globalCompositeOperation = 'source-over';
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    if (res.kind === 'mag') {
      const gap = 2 * S, sh = (h - gap * (res.max - 1)) / res.max;
      ctx.fillStyle = col;
      for (let i = 0; i < res.n; i++) ctx.fillRect(x, y + h - (i + 1) * sh - i * gap, w, sh);
    } else if (empty) {
      // энергия кончилась — мигающая красная рамка
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(this.t * 12);
      ctx.strokeStyle = '#ff4d5e'; ctx.lineWidth = 1.5 * S;
      ctx.strokeRect(x, y, w, h);
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = res.kind === 'reload' ? 0.5 : 1;
      ctx.fillStyle = res.kind === 'focus' ? '#ffffff' : col;
      ctx.fillRect(x, y + h * (1 - res.k), w, h * res.k);
      ctx.globalAlpha = 1;
    }
  };

  game.drawPlayer = function (ctx) {
    const p = this.player, s = M.s, S = G.S, run = this.run;
    // дроны
    for (let i = 0; i < this.drones.length; i++) {
      const d = this.drones[i], name = i ? 'c_gold' : 'c_white', f = G.frame(name);
      if (!f) continue;
      const w = 24 * S, h = w * f[3] / f[2];
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.7 + Math.random() * 0.3;
      if (G.frame('fx_tr_engine')) {
        // пламя развёрнуто вниз: основание у сопла, язык уходит назад
        const fw = 9 * S, fy = d.y + h * 0.5 + fw * 0.9;
        if (i) G.drawCanvas(ctx, G.tinted('fx_tr_engine', { hue: 45 }), d.x, fy, fw, Math.PI);
        else G.draw(ctx, 'fx_tr_engine', d.x, fy, fw, Math.PI);
      } else ctx.drawImage(G.glow(i ? '#ffc83d' : '#7fe7ff', 32), d.x - 7 * S, d.y + h * 0.38, 14 * S, 18 * S);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(G.src(f), f[0], f[1], f[2], f[3], d.x - w / 2, d.y - h / 2, w, h);
    }
    if (!p.alive) return;
    const blink = p.inv > 0 && this.state === 'play' && Math.floor(p.inv * 14) % 2 === 0;
    ctx.globalAlpha = blink ? 0.35 : 1;
    // в прыжке между секторами двигатели на форсаже
    const boost = (this.buffs.rapid > 0 || run.skillFx.sk_overclock > 0 ? 1.3 : 1) + (this.scene && this.scene.kind === 'jump' ? this.scene.warp * 1.5 : 0);
    this.drawShip(ctx, s.ship.model, s.ship.skin, s.ship.trail, p.x, p.y, p.w, p.tilt, this.t, boost);
    ctx.globalAlpha = 1;
    // ресурс текущего оружия — вертикальная шкала слева от корабля
    const res = this.state === 'play' && p.alive ? this.weaponRes(p.weapon) : null;
    if (res) this.drawWeaponRes(ctx, p, res);
    // щит
    if (p.shield || run.skillFx.sk_barrier > 0) {
      const barrier = run.skillFx.sk_barrier > 0;
      const col = barrier ? '#ffd23d' : '#7fe7ff';
      const r = p.w * 0.78;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.18 + Math.sin(this.t * 6) * 0.05;
      ctx.drawImage(G.soft(col, 64), p.x - r * 1.2, p.y - r * 1.2, r * 2.4, r * 2.4);
      const bubble = G.frame('fx_sh_bubble');
      if (bubble) {
        const bw = r * 2.25 * (1 + Math.sin(this.t * 4) * 0.025);
        ctx.globalAlpha = 0.4 + Math.sin(this.t * 6) * 0.08;
        if (barrier) G.drawCanvas(ctx, G.tinted('fx_sh_bubble', { hue: 46 }), p.x, p.y, bw, 0);
        else G.draw(ctx, 'fx_sh_bubble', p.x, p.y, bw);
      }
      // полное тонкое кольцо и бегущий по нему блик (дуга с разрывом выглядела как обрезанный щит)
      ctx.strokeStyle = col; ctx.lineWidth = 1.5 * S;
      ctx.globalAlpha = 0.45;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, U.TAU); ctx.stroke();
      ctx.globalAlpha = 0.9; ctx.lineWidth = 2.2 * S;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, this.t * 2.5, this.t * 2.5 + U.TAU * 0.22); ctx.stroke();
      if (!bubble) {
        ctx.globalAlpha = 0.4;
        ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.9, -this.t * 3, -this.t * 3 + U.TAU * 0.5); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // прицел снайпера на корабле: держится пару секунд после наводки, перед выстрелом сжимается и мигает
    if (p.lockT > 0) {
      const hot = p.lockHot > 0, fade = Math.min(1, p.lockT / 0.4);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade * (hot ? 0.85 + 0.15 * Math.sin(this.t * 40) : 0.75 + 0.2 * Math.sin(this.t * 6));
      G.draw(ctx, 'fx_lock', p.x, p.y, p.w * (hot ? 1.05 : 1.35 + 0.05 * Math.sin(this.t * 4)), this.t * (hot ? 4 : 1.2));
      if (hot) G.draw(ctx, 'fx_lock', p.x, p.y, p.w * 1.05, this.t * 4);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // точка хитбокса (видна при опасности — помогает уклоняться)
    if (this.ebullets.length > 6 || p.lives === 1 || this.pointer.id !== null) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.85;
      ctx.drawImage(G.glow('#ff5c7a', 32), p.x - 7 * S, p.y - 7 * S, 14 * S, 14 * S);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  };

  game.drawEBullets = function (ctx) {
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.ebullets) {
      if (b.dead) continue;
      if (b.type === 'mine') {
        ctx.globalCompositeOperation = 'source-over';
        const s = b.w;
        if (b.sprite && G.frame(b.sprite)) {
          ctx.drawImage(G.proc('voidcore'), b.x - s * 0.36, b.y - s * 0.36, s * 0.72, s * 0.72);
          G.draw(ctx, b.sprite, b.x, b.y, s, b.age * 1.6);
        } else { ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.age * 3); ctx.drawImage(b.cv, -s / 2, -s / 2, s, s); ctx.restore(); }
        ctx.globalCompositeOperation = 'lighter';
        if (Math.sin(b.age * 18) > 0) ctx.drawImage(G.glow('#ff3d5a', 32), b.x - s * 0.6, b.y - s * 0.6, s * 1.2, s * 1.2);
        continue;
      }
      const c = b.ebc || (b.ebc = ebSprite(b));
      if (b.rotate) G.drawCanvas(ctx, c, b.x, b.y, c.cw, Math.atan2(b.vy, b.vx) + Math.PI / 2);
      else ctx.drawImage(c, b.x - c.cw / 2, b.y - c.ch / 2, c.cw, c.ch);
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  // кадр вражеского снаряда: ореол, спрайт и белое ядро (чтобы пуля читалась на любом фоне).
  // Собирается один раз на тип и размер в разрешении экрана
  const ebCache = {};
  function ebSprite(b) {
    const dpr = G.dpr, key = b.type + '|' + (b.sprite || '') + '|' + Math.round(b.w * 8) + '|' + dpr;
    let c = ebCache[key];
    if (c) return c;
    const src = b.cv, f = src ? null : G.frame(b.sprite);
    const sh = src ? b.w * src.height / src.width : f ? b.w * f[3] / f[2] : b.w;
    const gs = b.w * 2, cw = gs, ch = Math.max(gs, sh);
    c = document.createElement('canvas');
    c.width = Math.ceil(cw * dpr); c.height = Math.ceil(ch * dpr);
    c.cw = cw; c.ch = ch;
    const x = c.getContext('2d');
    x.scale(c.width / cw, c.height / ch);
    x.globalCompositeOperation = 'lighter';
    x.globalAlpha = 0.5;
    x.drawImage(G.glow(b.color, 32), 0, (ch - gs) / 2, gs, gs);
    x.globalAlpha = 1;
    if (src) x.drawImage(src, (cw - b.w) / 2, (ch - sh) / 2, b.w, sh);
    else if (f && G.src(f)) x.drawImage(G.src(f), f[0], f[1], f[2], f[3], (cw - b.w) / 2, (ch - sh) / 2, b.w, sh);
    const r = b.r * 0.45;
    x.fillStyle = '#fff';
    x.fillRect(cw / 2 - r, ch / 2 - r, r * 2, r * 2);
    ebCache[key] = c;
    return c;
  }

  game.drawOverlays = function (ctx) {
    const p = this.player, S = G.S, ov = this.ov;
    ctx.globalCompositeOperation = 'lighter';
    // рельса
    if (ov.rail && p.alive) {
      const r = ov.rail;
      if (r.t < r.charge) {
        const k = r.t / r.charge;
        ctx.globalAlpha = 0.4 + k * 0.5;
        ctx.drawImage(G.glow('#7ffff0', 64), p.x - 40 * S * k, p.y - p.w * 0.6 - 40 * S * k, 80 * S * k, 80 * S * k);
        if (G.frame('fx_super')) {
          const sw = 46 * S * (0.4 + k * 0.6);
          ctx.globalAlpha = 0.5 + k * 0.5;
          G.draw(ctx, 'fx_super', p.x, p.y - p.w * 0.45 - sw * 0.6, sw);
        }
        ctx.globalAlpha = k * 0.35;
        ctx.fillStyle = '#7ffff0';
        ctx.fillRect(p.x - 1.5 * S, 0, 3 * S, p.y);
      } else {
        const fade = Math.min(1, (r.charge + r.dur - r.t) * 4);
        const wv = (20 + Math.sin(this.t * 60) * 3) * S;
        ctx.globalAlpha = 0.35 * fade;
        ctx.fillStyle = '#3de0ff'; ctx.fillRect(p.x - wv * 1.6, 0, wv * 3.2, p.y - p.w * 0.3);
        ctx.globalAlpha = 0.8 * fade;
        ctx.fillStyle = '#7ffff0'; ctx.fillRect(p.x - wv * 0.6, 0, wv * 1.2, p.y - p.w * 0.3);
        ctx.globalAlpha = fade;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(p.x - wv * 0.2, 0, wv * 0.4, p.y - p.w * 0.3);
        ctx.drawImage(G.glow('#7ffff0', 64), p.x - 50 * S, p.y - p.w * 0.6 - 50 * S, 100 * S, 100 * S);
        if (G.frame('fx_charge')) { ctx.globalAlpha = fade * (0.8 + Math.random() * 0.2); G.draw(ctx, 'fx_charge', p.x, p.y - p.w * 0.55 - 26 * S, 34 * S); }
      }
      ctx.globalAlpha = 1;
    }
    // чёрная дыра
    if (ov.hole) {
      const h = ov.hole, k = Math.min(1, h.t * 3), R = 210 * S;
      ctx.globalAlpha = 0.35 * k;
      ctx.drawImage(G.soft('#7a3dff', 64), h.x - R, h.y - R, R * 2, R * 2);
      const s = R * 0.55 * k * (1 + Math.sin(h.t * 10) * 0.05);
      if (G.frame('fx_vortex')) {
        ctx.globalAlpha = k;
        G.draw(ctx, 'fx_vortex', h.x, h.y, s * 2.6, h.t * 4);
        ctx.globalAlpha = 0.55 * k;
        G.draw(ctx, 'fx_vortex', h.x, h.y, s * 1.7, -h.t * 6);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(G.proc('voidcore'), h.x - s * 0.45, h.y - s * 0.45, s * 0.9, s * 0.9);
      } else {
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        const v = G.proc('vortex');
        ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.t * 4); ctx.drawImage(v, -s, -s, s * 2, s * 2); ctx.rotate(-h.t * 7); ctx.globalAlpha = 0.6; ctx.drawImage(v, -s * 0.7, -s * 0.7, s * 1.4, s * 1.4); ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'lighter';
    }
    // предупреждения о лучах дредноута
    for (const bm of ov.beams) {
      if (bm.t < bm.warn) {
        const k = bm.t / bm.warn;
        ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(bm.t * 18));
        ctx.fillStyle = '#ff3d5a';
        ctx.fillRect(bm.x - bm.w * 0.5 * k, bm.y0, bm.w * k, G.H - bm.y0);
      } else {
        const k = 1 - (bm.t - bm.warn) / bm.dur;
        ctx.globalAlpha = 0.5 * k; ctx.fillStyle = bm.color;
        ctx.fillRect(bm.x - bm.w, bm.y0, bm.w * 2, G.H - bm.y0);
        ctx.globalAlpha = k; ctx.fillStyle = '#ffffff';
        ctx.fillRect(bm.x - bm.w * 0.35, bm.y0, bm.w * 0.7, G.H - bm.y0);
      }
    }
    // поворотные лазеры
    ctx.lineCap = 'round';
    for (const L of ov.lasers) {
      const o = this.laserOrigin(L), ex = o.x + Math.cos(L.ang) * L.len, ey = o.y + Math.sin(L.ang) * L.len;
      ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(ex, ey);
      if (L.t < L.warn) {
        ctx.globalAlpha = 0.25 + 0.4 * Math.abs(Math.sin(L.t * 16));
        ctx.strokeStyle = L.color; ctx.lineWidth = 2 * S; ctx.stroke();
        const gs = (14 + 30 * L.t / L.warn) * S;
        ctx.globalAlpha = 0.6;
        ctx.drawImage(G.glow(L.color, 64), o.x - gs, o.y - gs, gs * 2, gs * 2);
        if (G.frame('fx_storm')) { ctx.globalAlpha = 0.85; G.drawCanvas(ctx, G.tinted('fx_storm', { hue: G.hueOf(L.color) }), o.x, o.y, gs * 2.2, L.ang - Math.PI / 2); }
      } else {
        const k = Math.min(1, (L.t - L.warn) * 8, (L.warn + L.dur - L.t) * 5);
        ctx.globalAlpha = 0.3 * k; ctx.strokeStyle = L.color; ctx.lineWidth = L.w * 2.4; ctx.stroke();
        ctx.globalAlpha = 0.8 * k; ctx.lineWidth = L.w; ctx.stroke();
        ctx.globalAlpha = k; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = L.w * 0.32; ctx.stroke();
        const gs = L.w * 2.6;
        ctx.drawImage(G.glow(L.color, 64), o.x - gs, o.y - gs, gs * 2, gs * 2);
      }
    }
    ctx.lineCap = 'butt';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  // ── данные для HUD ──
  game.powerProgress = function () { return this.run ? this.run.xp / D.perkXpNeed(this.run.level) : 0; };
  game.comboMul = function () { return this.run ? 1 + Math.min(this.run.combo, 100) * 0.02 : 1; };
})();
