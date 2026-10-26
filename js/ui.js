// ════════════════════════════════════════════════════════════════
// SPACE SHOOTER 2.0 — интерфейс
// ════════════════════════════════════════════════════════════════
'use strict';

(function () {
  const U = SS.util, D = SS.data, $ = U.$, $$ = U.$$, ic = U.icon;
  const NL = String.fromCharCode(10);
  let G, A, M, T, game, store;

  const ui = {
    cur: null,
    runEvents: [],
    hudCache: {},
    _bottom: 100,
    _toastQ: [],
  };
  SS.ui = ui;

  // ════════════════════════════════════════════════════════════
  // ИНИЦИАЛИЗАЦИЯ
  // ════════════════════════════════════════════════════════════
  ui.init = function () {
    G = SS.gfx; A = SS.audio; M = SS.meta; T = SS.tg; game = SS.game; store = SS.store;

    // навигация из меню
    $$('[data-go]').forEach((b) => b.addEventListener('click', () => { A.play('click'); T.haptic('select'); ui.open(b.dataset.go); }));
    $$('[data-back]').forEach((b) => b.addEventListener('click', () => ui.back()));
    $('#btnPlay').addEventListener('click', () => ui.play());

    // выбор сложности перед боем
    $('#btnDiffClose').addEventListener('click', () => ui.back());
    $('#scr-diff').addEventListener('click', (e) => { if (e.target.id === 'scr-diff') ui.back(); });
    $('#diffList').addEventListener('click', (e) => {
      const b = e.target.closest('.diff-row');
      if (!b) return;
      ui._diffSel = b.dataset.diff;
      $$('#diffList .diff-row').forEach((r) => r.classList.toggle('sel', r === b));
      A.play('click'); T.haptic('select');
      syncDiffGo();
    });
    $('#btnDiffGo').addEventListener('click', () => {
      const id = D.DIFFS[ui._diffSel] ? ui._diffSel : 'normal';
      store.s.settings.diff = id; store.soon();
      ui.hide('#scr-diff');
      A.play('click'); T.haptic('medium');
      ui.startRun(id);
    });

    // вкладки
    tabs('#hangarTabs', (t) => ui.renderHangar(t));
    tabs('#arsenalTabs', (t) => ui.renderArsenal(t));
    tabs('#skillTabs', (t) => ui.renderSkills(t));
    tabs('#lbTabs', (t) => ui.renderLeaders(t));

    // HUD
    $('#btnPause').addEventListener('click', () => { game.pause(); });
    bindPress($('#btnBomb'), () => game.useBomb());

    // пауза
    $('#btnResume').addEventListener('click', () => { A.play('click'); game.resume(); });
    $('#btnRestart').addEventListener('click', () => ui.dialog({ ico: 'retry', title: 'НАЧАТЬ ЗАНОВО?', text: 'Прогресс этого забега будет потерян', ok: 'ЗАНОВО', onOk: () => { ui.hide('#scr-pause'); ui.startRun(game.diffId); } }));
    $('#btnQuit').addEventListener('click', () => ui.dialog({ ico: 'home', title: 'ВЫЙТИ В МЕНЮ?', text: 'Забег будет завершён.\nСобранные монеты останутся у вас.', ok: 'ВЫЙТИ', onOk: () => { ui.hide('#scr-pause'); game.gameOver(); } }));
    $('#pauseMusic').addEventListener('click', () => toggleVol('music'));
    $('#pauseSfx').addEventListener('click', () => toggleVol('sfx'));
    $('#pauseVibe').addEventListener('click', () => { store.s.settings.vibro = !store.s.settings.vibro; store.soon(); syncPauseToggles(); T.haptic('medium'); });

    // итоги
    $('#btnRetry').addEventListener('click', () => { A.play('click'); ui.startRun(game.diffId); });
    $('#btnGoMenu').addEventListener('click', () => { A.play('back'); ui.toMenu(); });
    $('#btnShare').addEventListener('click', () => ui.share());

    // воскрешение
    $('#btnRevive').addEventListener('click', () => { clearInterval(ui._reviveTimer); if (game.revive()) ui.hide('#scr-revive'); else { A.play('error'); ui.hide('#scr-revive'); game.gameOver(); } });
    $('#btnNoRevive').addEventListener('click', () => { clearInterval(ui._reviveTimer); ui.hide('#scr-revive'); game.gameOver(); });

    // улучшения
    $('#btnPerkReroll').addEventListener('click', () => { const ch = game.rerollPerks(); if (ch) ui.showPerks(ch, true); });

    // диалог
    $('#dlgCancel').addEventListener('click', () => { A.play('back'); ui.hide('#scr-dialog'); });

    // награда за вход
    $('#btnClaimLogin').addEventListener('click', () => {
      const r = M.claimLogin();
      ui.hide('#scr-login');
      if (r) { A.play('buy'); T.haptic('success'); ui.toast({ ico: '🎁', title: 'НАГРАДА', text: '+' + r.coins + ' монет' + (r.sp ? ' и +1 очко навыка' : ''), }); }
      ui.renderMenu();
    });

    // предложение идеи
    initSuggest();

    // события игры
    SS.on('coins', () => updateWallets());
    // во время боя всплывают только достижения; остальное собирается и показывается в итогах
    const inRun = () => game.state !== 'idle' && game.state !== 'over';
    SS.on('achievement', (a) => { if (inRun()) ui.runEvents.push({ ico: a.ico, text: a.name }); ui.toast({ ico: a.ico, title: 'ДОСТИЖЕНИЕ', text: a.name, rew: '+' + a.reward }); A.play('achievement'); });
    SS.on('mission', (m) => { if (inRun()) { ui.runEvents.push({ ico: '📋', text: M.missionText(m) }); return; } ui.toast({ ico: '📋', title: 'ЗАДАНИЕ ВЫПОЛНЕНО', text: M.missionText(m), rew: '+' + m.reward }); });
    SS.on('missionBonus', (n) => { if (inRun()) { ui.runEvents.push({ ico: '🏅', text: 'Все задания дня +' + n }); return; } ui.toast({ ico: '🏅', title: 'ВСЕ ЗАДАНИЯ ДНЯ', text: 'Бонус за выполнение', rew: '+' + n }); });
    SS.on('skinUnlocked', (sk) => { if (inRun()) { ui.runEvents.push({ ico: '🎨', text: 'Раскраска «' + sk.name + '»' }); return; } ui.toast({ ico: '🎨', title: 'НОВАЯ РАСКРАСКА', text: sk.name, info: true }); });
    SS.on('shipLevel', (lvl, r) => ui.toast({ ico: '🚀', title: 'УРОВЕНЬ КОРАБЛЯ ' + lvl, text: '+1 очко навыка', rew: '+' + r.coins }));
    SS.on('toast', (t) => ui.toast(t));
    SS.on('waveStart', (w) => ui.waveBanner(w));
    SS.on('waveClear', (w) => { if (!game.wave.boss) ui.banner('<div class="b2">ВОЛНА ' + w.n + ' ЗАЧИЩЕНА</div><div class="b3">' + (w.perfect ? '★ БЕЗ УРОНА ×2 ★  ' : '') + '+' + U.fmt(w.bonus) + '</div>', w.perfect ? 'gold small' : 'small', 1800); });
    SS.on('bossWarning', (def) => ui.bossWarn(def));
    SS.on('bossDefeated', (d) => ui.banner('<div class="b1">БОСС ПОВЕРЖЕН</div><div class="b2">' + d.def.name + '</div><div class="b3">+' + U.fmt(d.pts) + '</div>', 'gold', 2600));
    SS.on('perkOffer', (ch) => ui.showPerks(ch));
    SS.on('reviveOffer', (cost) => ui.showRevive(cost));
    SS.on('runEnd', (sum) => { if (sum) ui.showGameOver(sum); });
    SS.on('paused', (on) => { if (on) ui.showPause(); else ui.hide('#scr-pause'); });
    SS.on('playerHit', () => { const f = $('#dmgFlash'); f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 90); ui.hudCache.lives = -1; });
    SS.on('revived', () => { ui.hide('#scr-revive'); });

    $('#verTxt').textContent = 'v' + SS.VERSION + (SS.DEV ? ' • DEV' : '');
    ui.measure();
  };

  function tabs(sel, fn) {
    const root = $(sel);
    root.addEventListener('click', (e) => {
      const b = e.target.closest('.tab');
      if (!b) return;
      $$('.tab', root).forEach((x) => x.classList.toggle('active', x === b));
      A.play('click');
      fn(b.dataset.tab);
    });
  }
  function activeTab(sel) { const b = $(sel + ' .tab.active'); return b ? b.dataset.tab : null; }
  function setTab(sel, id) { $$(sel + ' .tab').forEach((x) => x.classList.toggle('active', x.dataset.tab === id)); }

  // нажатие без задержки на тач-экране (кнопки HUD)
  function bindPress(el, fn) {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); }, { passive: false });
    el.addEventListener('click', (e) => e.preventDefault());
  }

  ui.measure = function () {
    const r2 = $('.hud-row2');
    if (r2 && !$('#hud').hidden) { const r = r2.getBoundingClientRect(); if (r.height > 0) ui._top = r.bottom + 38; }
    else { const sat = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0; ui._top = sat + 122; }
    const hb = $('.hud-bottom');
    if (hb && !$('#hud').hidden) {
      const r = hb.getBoundingClientRect();
      if (r.height > 0) ui._bottom = window.innerHeight - r.top;
    } else {
      const sab = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sab')) || 0;
      ui._bottom = 84 + sab;
    }
  };
  ui.bottomInset = function () { return ui._bottom; };
  // нижний край верхней панели HUD (с местом под полосу босса)
  ui.topInset = function () { return ui._top || 120; };

  // ════════════════════════════════════════════════════════════
  // ЭКРАНЫ
  // ════════════════════════════════════════════════════════════
  const SUBS = { hangar: '#scr-hangar', arsenal: '#scr-arsenal', skills: '#scr-skills', missions: '#scr-missions', leaders: '#scr-leaders', achievements: '#scr-achievements', settings: '#scr-settings', suggest: '#scr-suggest' };

  ui.show = function (sel) { const el = $(sel); if (el) { el.classList.add('show'); } };
  ui.hide = function (sel) { const el = $(sel); if (el) el.classList.remove('show'); };
  ui.isShown = function (sel) { const el = $(sel); return !!(el && el.classList.contains('show')); };

  ui.toMenu = function () {
    document.body.classList.remove('toasts-bottom');
    game.quit();
    ui.hideHud();
    ['#scr-gameover', '#scr-pause', '#scr-perk', '#scr-revive'].forEach(ui.hide);
    Object.values(SUBS).forEach(ui.hide);
    ui.cur = 'menu';
    ui.show('#scr-menu');
    ui.renderMenu();
    T.back(null);
    T.closingConfirm(false);
    SS.main.setMusic('menu');
    ui.checkLogin();
  };

  ui.open = function (name) {
    const sel = SUBS[name];
    if (!sel) return;
    Object.values(SUBS).forEach(ui.hide);
    ui.hide('#scr-menu');
    ui.cur = name;
    ui.show(sel);
    T.back(() => ui.back());
    if (name === 'hangar') ui.renderHangar(activeTab('#hangarTabs') || 'models');
    if (name === 'arsenal') ui.renderArsenal(activeTab('#arsenalTabs') || 'weapons');
    if (name === 'skills') ui.renderSkills(activeTab('#skillTabs') || 'passive');
    if (name === 'leaders') ui.renderLeaders(activeTab('#lbTabs') || 'world');
    if (name === 'achievements') ui.renderAchievements();
    if (name === 'settings') ui.renderSettings();
    if (name === 'suggest') ui.renderSuggest();
    if (name === 'missions') ui.renderMissions();
    updateWallets();
  };

  ui.back = function () {
    if (ui.isShown('#scr-dialog')) { ui.hide('#scr-dialog'); return; }
    if (ui.isShown('#scr-diff')) { A.play('back'); ui.hide('#scr-diff'); if (ui.cur === 'menu') T.back(null); return; }
    if (ui.isShown('#scr-pause')) { game.resume(); return; }
    if (ui.isShown('#scr-gameover')) { ui.toMenu(); return; }
    if (ui.cur && SUBS[ui.cur]) {
      A.play('back');
      ui.hide(SUBS[ui.cur]);
      stopHangarAnim();
      ui.cur = 'menu';
      ui.show('#scr-menu');
      ui.renderMenu();
      T.back(null);
    }
  };

  // ════════════════════════════════════════════════════════════
  // ГЛАВНОЕ МЕНЮ
  // ════════════════════════════════════════════════════════════
  ui.renderMenu = function () {
    const s = store.s;
    const user = T.user();
    $('#menuName').textContent = user.name;
    const av = $('#menuProfile .avatar');
    if (user.photo && !av.querySelector('img')) { const img = new Image(); img.alt = ''; img.onload = () => { av.innerHTML = ''; av.appendChild(img); }; img.src = user.photo; }
    $('#menuShipLvl').textContent = 'Корабль ' + s.shipLvl + (s.prestige ? ' • ✦' + s.prestige : '');
    $('#menuXpFill').style.width = Math.min(100, s.shipXP / D.shipXpNeed(s.shipLvl) * 100) + '%';
    $('#menuBest').textContent = U.fmt(s.stats.bestScore);
    $('#menuBestWave').textContent = s.stats.bestWave;
    updateWallets();
    // текущая сложность под кнопкой «Играть»
    const cd = D.DIFFS[s.settings.diff] || D.DIFFS.normal;
    $('#playSub').innerHTML = 'Сложность: <b style="color:' + cd.color + '">' + cd.name + '</b> • награды ×' + fmtMul(cd.coins);
    // задания дня — на отдельном экране
    const ms = M.missions();
    $('#missionCount').textContent = ms.filter((m) => m.done).length + ' / ' + ms.length;
    $('#badgeMissions').hidden = !(M.loginStatus().available || s.daily.seen !== U.today());
    // счётчики
    $('#achCount').textContent = Object.keys(s.achievements).length + ' / ' + D.ACHIEVEMENTS.length;
    $('#badgeSkills').hidden = M.skillPoints() <= 0;
    $('#badgeArsenal').hidden = !canAffordSomething();
    $('#badgeHangar').hidden = !hasNewHangar();
    requestAnimationFrame(ui.measureMenuSlot);
  };

  // свободное место между логотипом и выбором сложности — там летает корабль
  ui.measureMenuSlot = function () {
    const a = $('.best-row'), b = $('#btnPlay');
    if (!a || !b || !ui.isShown('#scr-menu')) return;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const top = ra.bottom + 8, bottom = rb.top - 8;
    game.attract.slot = { y: (top + bottom) / 2 - 10, h: bottom - top };
  };

  function canAffordSomething() {
    const s = store.s, c = s.coins;
    for (const wid of D.WEAPON_ORDER) {
      const w = D.WEAPONS[wid];
      if (!s.weapons.owned.includes(wid)) { if (c >= w.price) return true; continue; }
      for (const up of w.ups) { const l = M.weaponLevel(wid, up.id); if (l < up.max && c >= up.costs[l]) return true; }
    }
    for (const g of D.GENERAL) { const l = M.generalLevel(g.id); if (l < g.max && c >= g.costs[l]) return true; }
    return false;
  }
  function hasNewHangar() {
    const s = store.s;
    for (const id of D.SHIP_ORDER) { const sh = D.SHIPS[id]; if (!s.ship.models.includes(id) && s.shipLvl >= sh.lvl && s.coins >= sh.price) return true; }
    return false;
  }
  function updateWallets() {
    const c = U.fmt(store.s.coins);
    const m = $('#menuCoins'); if (m) m.textContent = c;
    $$('.js-coins').forEach((el) => (el.textContent = c));
  }

  // ════════════════════════════════════════════════════════════
  // ЗАПУСК ЗАБЕГА
  // ════════════════════════════════════════════════════════════
  ui.play = function () {
    A.unlock();
    A.play('click');
    T.haptic('medium');
    ui.showDiff();
  };

  // ════════════════════════════════════════════════════════════
  // ВЫБОР СЛОЖНОСТИ
  // ════════════════════════════════════════════════════════════
  function fmtMul(v) { return String(Math.round(v * 100) / 100).replace('.', ','); }
  function pct(v) { const d = Math.round((v - 1) * 100); return (d > 0 ? '+' : '−') + Math.abs(d) + '%'; }
  // совет: следующая сложность, когда на текущей пройдено 25 волн
  function recommendedDiff() {
    const st = store.s.stats.diff, order = D.DIFF_ORDER;
    let rec = 'normal';
    for (const id of ['normal', 'hard', 'nightmare']) if (((st[id] && st[id].wave) || 0) >= 25) rec = order[order.indexOf(id) + 1];
    return rec;
  }
  function syncDiffGo() {
    const d = D.DIFFS[ui._diffSel] || D.DIFFS.normal;
    $('#btnDiffGo span').textContent = 'В БОЙ • ' + (d.short || d.name);
    $('#diffDesc2').innerHTML = '<b style="color:' + d.color + '">' + d.name + '</b>: ' + d.desc;
  }
  ui.showDiff = function () {
    const s = store.s;
    ui._diffSel = D.DIFFS[s.settings.diff] ? s.settings.diff : 'normal';
    const rec = recommendedDiff();
    const lives = D.BASE_LIVES + M.generalLevel('hull') + (D.SHIPS[s.ship.model].stats.lives || 0);
    $('#diffLives').innerHTML = ic('heart') + 'Жизней: <b>' + lives + '</b> на любой сложности';
    $('#diffList').innerHTML = D.DIFF_ORDER.map((id) => {
      const d = D.DIFFS[id], best = s.stats.diff[id] || { wave: 0 };
      const meta = [['Враги', d.count], ['Броня', d.hp], ['Огонь', d.fire]]
        .filter((x) => x[1] !== 1).map((x) => '<span class="' + (x[1] > 1 ? 'up' : 'down') + '">' + x[0] + ' <b>' + pct(x[1]) + '</b></span>').join('');
      return '<button class="diff-row' + (id === ui._diffSel ? ' sel' : '') + '" data-diff="' + id + '" style="--dc:' + d.color + '">' +
        '<div class="dr-main"><div class="diff-name">' + d.name + (id === rec ? '<span class="diff-rec">СОВЕТУЕМ</span>' : '') +
        (best.wave ? '<span class="diff-best">рекорд: волна ' + best.wave + '</span>' : '') + '</div>' +
        '<div class="diff-meta">' + (meta || '<span>Обычные враги и награды</span>') + '</div></div>' +
        '<div class="diff-rew">' + ic('coin') + ' ×' + fmtMul(d.coins) + '<small>опыт ×' + fmtMul(d.xp) + '</small></div></button>';
    }).join('');
    syncDiffGo();
    ui.show('#scr-diff');
    T.back(() => ui.back());
    requestAnimationFrame(() => { const el = $('#diffList .diff-row.sel'); if (el && el.scrollIntoView) { try { el.scrollIntoView({ block: 'nearest' }); } catch (e) {} } });
  };

  // ════════════════════════════════════════════════════════════
  // ЗАДАНИЯ
  // ════════════════════════════════════════════════════════════
  function fmtProg(m) {
    const p = Math.floor(Math.min(m.progress, m.goal));
    return U.fmt(p) + ' / ' + U.fmt(m.goal) + (m.id === 'minutes' ? ' мин' : '');
  }
  function tickMsTimer() {
    const el = $('#msTimer');
    if (!el) return;
    const now = new Date(), next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const mins = Math.max(1, Math.round((next - now) / 60000));
    el.textContent = 'Новые через ' + (mins >= 60 ? Math.floor(mins / 60) + ' ч ' : '') + (mins % 60) + ' мин';
  }
  ui.renderMissions = function () {
    const s = store.s, d = s.daily, ms = M.missions();
    if (d.seen !== U.today()) { d.seen = U.today(); store.soon(); }
    let h = '<div class="ms-card"><div class="ms-head"><h3>' + ic('target') + 'ЗАДАНИЯ ДНЯ</h3><div class="ms-timer" id="msTimer"></div></div>';
    h += ms.map((m) => {
      const k = Math.min(1, m.progress / m.goal);
      return '<div class="ms-row' + (m.done ? ' done' : '') + '"><div class="ms-check">' + (m.done ? ic('check') : '<small>' + Math.floor(k * 100) + '%</small>') + '</div>' +
        '<div class="ms-text">' + U.escape(M.missionText(m)) + '</div><div class="ms-rew">' + ic('coin') + m.reward + '</div>' +
        '<div class="ms-prog"><div class="ms-bar"><i style="width:' + (k * 100) + '%"></i></div><div class="ms-num">' + fmtProg(m) + '</div></div></div>';
    }).join('');
    h += '<div class="ms-bonus' + (d.bonus ? ' done' : '') + '"><span>' + ic(d.bonus ? 'check' : 'gift') + (d.bonus ? 'Бонус за все задания получен' : 'Бонус за все три задания') + '</span><span class="ms-rew">' + ic('coin') + D.DAILY_BONUS + '</span></div></div>';
    h += '<div class="ms-hint">Прогресс засчитывается во время игры, награда приходит сразу</div>';
    const st = M.loginStatus();
    h += '<div class="ms-card ms-login"><div class="ms-head"><h3>' + ic('gift') + 'НАГРАДА ЗА ВХОД</h3><div class="ms-timer">' + (st.streak > 1 ? 'Серия: ' + st.streak + ' ' + U.plural(st.streak, 'день', 'дня', 'дней') : '') + '</div></div>';
    h += '<div class="login-days">' + D.LOGIN.map((r, i) => {
      const cls = i < st.day ? 'got' : (i === st.day ? (st.available ? 'today' : 'got') : '');
      return '<div class="lday ' + cls + (i === 6 ? ' big' : '') + '"><small>День ' + (i + 1) + '</small>' + ic(i === 6 ? 'gift' : 'coin') + '<b>' + r.coins + (r.sp ? ' + ✦' : '') + '</b></div>';
    }).join('') + '</div>';
    h += st.available ? '<button class="btn gold wide" id="msClaim">' + ic('gift') + 'ЗАБРАТЬ НАГРАДУ</button>' : '<div class="ms-hint" style="margin:2px 0 0">Следующая награда завтра. Заходите каждый день, чтобы серия не прервалась</div>';
    h += '</div>';
    $('#missionsBody').innerHTML = h;
    const cb = $('#msClaim');
    if (cb) cb.addEventListener('click', () => {
      const r = M.claimLogin();
      if (r) { A.play('buy'); T.haptic('success'); ui.toast({ ico: '🎁', title: 'НАГРАДА', text: '+' + r.coins + ' монет' + (r.sp ? ' и +1 очко навыка' : '') }); }
      updateWallets();
      ui.renderMissions();
    });
    tickMsTimer();
    clearInterval(ui._msTimer);
    ui._msTimer = setInterval(() => { if (ui.cur !== 'missions') { clearInterval(ui._msTimer); return; } tickMsTimer(); }, 30000);
  };

  ui.startRun = function (diffId) {
    ['#scr-menu', '#scr-gameover', '#scr-pause', '#scr-perk', '#scr-revive'].forEach(ui.hide);
    Object.values(SUBS).forEach(ui.hide);
    stopHangarAnim();
    ui.cur = 'game';
    ui.runEvents = [];
    document.body.classList.remove('toasts-bottom');
    game.start(diffId);
    ui.showHud();
    T.back(null);
    T.closingConfirm(true);
    SS.main.setMusic('game');
    if (!store.s.seenIntro) {
      store.s.seenIntro = true; store.soon();
      setTimeout(() => ui.banner('<div class="b2">ВЕДИТЕ ПАЛЬЦЕМ ПО ЭКРАНУ</div><div class="b3">Стрельба автоматическая • двойной тап — бомба</div>', 'small', 3200), 2400);
      setTimeout(() => ui.banner('<div class="b2">СОБИРАЙТЕ ЗЕЛЁНЫЕ КРИСТАЛЛЫ</div><div class="b3">Новый уровень — выбор улучшения</div>', 'green small', 3200), 6200);
    }
  };

  // ════════════════════════════════════════════════════════════
  // HUD
  // ════════════════════════════════════════════════════════════
  ui.showHud = function () {
    $('#hud').hidden = false;
    document.body.classList.add('in-game');
    ui.hudCache = {};
    ui.buildWeapons();
    ui.buildSkills();
    requestAnimationFrame(() => ui.measure());
  };
  ui.hideHud = function () {
    $('#hud').hidden = true;
    document.body.classList.remove('in-game');
    $('#hudBoss').hidden = true;
  };

  ui.buildWeapons = function () {
    const box = $('#hudWeapons');
    box.innerHTML = '';
    const p = game.player;
    if (!p) return;
    p.weapons.forEach((wid, i) => {
      const w = D.WEAPONS[wid];
      const b = document.createElement('button');
      b.className = 'wbtn';
      b.dataset.w = wid;
      b.style.setProperty('--wc', w.color);
      b.setAttribute('aria-label', w.name);
      const c = G.weaponIcon(wid, 68);
      const cv = document.createElement('canvas'); cv.width = 68; cv.height = 68;
      cv.getContext('2d').drawImage(c, 0, 0);
      b.appendChild(cv);
      if (p.weapons.length > 1) { const k = document.createElement('span'); k.className = 'wkey'; k.textContent = i + 1; b.appendChild(k); }
      bindPress(b, () => game.setWeapon(wid));
      box.appendChild(b);
    });
    box.style.display = p.weapons.length > 1 ? '' : 'none';
  };

  ui.buildSkills = function () {
    const box = $('#hudSkills');
    box.innerHTML = '';
    const ids = game.activeSkills();
    ids.forEach((id, i) => {
      const sk = D.SKILLS[id];
      const b = document.createElement('button');
      b.className = 'skbtn ready';
      b.dataset.sk = id;
      b.innerHTML = '<svg class="ring" viewBox="0 0 66 66"><circle class="rbg" cx="33" cy="33" r="30"/><circle class="rfg" cx="33" cy="33" r="30" stroke-dasharray="188.5" stroke-dashoffset="0"/></svg><span class="sk-emoji">' + sk.ico + '</span><span class="sk-cd"></span>';
      bindPress(b, () => game.useSkill(i));
      box.appendChild(b);
    });
  };

  // вызывается каждый кадр — меняет DOM только при изменении значений
  ui.updateHud = function () {
    const g = game, p = g.player, run = g.run, c = ui.hudCache;
    if (!p || !run) return;
    if (c.score !== run.score) { c.score = run.score; $('#hudScore').textContent = U.fmt(run.score); }
    const waveTxt = g.wave ? (g.boss ? 'БОСС • ВОЛНА ' + g.wave.n : 'ВОЛНА ' + g.wave.n) : '';
    if (c.wave !== waveTxt) { c.wave = waveTxt; $('#hudWave').textContent = waveTxt; }
    if (c.coins !== run.coins) {
      const bump = c.coins !== undefined;
      c.coins = run.coins; $('#hudCoins').textContent = U.fmt(run.coins);
      if (bump) { const el = $('.hud-coins'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    }
    const livesKey = p.lives + '/' + p.maxLives + '/' + (p.shield ? 1 : 0) + '/' + (run.skillFx.sk_barrier > 0 ? 1 : 0);
    if (c.lives !== livesKey) {
      const lost = c.livesN !== undefined && p.lives < c.livesN;
      c.lives = livesKey; c.livesN = p.lives;
      const box = $('#hudLives');
      let h = '';
      const shown = Math.min(p.maxLives, 8);
      for (let i = 0; i < shown; i++) h += '<svg class="' + (i < p.lives ? '' : 'empty') + (lost && i === p.lives ? ' lose' : '') + '"><use href="#i-heart"/></svg>';
      if (p.maxLives > 8) h += '<span class="more">' + p.lives + '</span>';
      if (p.shield) h += '<svg class="shield"><use href="#i-shield"/></svg>';
      box.innerHTML = h;
    }
    if (c.plvl !== run.level) { c.plvl = run.level; $('#hudPowerLvl').textContent = run.level; }
    const pp = Math.round(Math.min(1, g.powerProgress()) * 200) / 200;
    if (c.pp !== pp) { c.pp = pp; $('#hudPowerFill').style.width = (pp * 100).toFixed(1) + '%'; }
    // босс
    const boss = g.boss;
    const bossOn = !!(boss && boss.alive);
    if (c.bossOn !== bossOn) { c.bossOn = bossOn; $('#hudBoss').hidden = !bossOn; if (bossOn) $('#hudBossName').textContent = boss.bdef.name; }
    if (bossOn) {
      const k = Math.max(0, boss.hp / boss.maxHp);
      const kk = Math.round(k * 400) / 400;
      if (c.bossK !== kk) { c.bossK = kk; $('#hudBossFill').style.transform = 'scaleX(' + kk + ')'; }
      const sk = boss.shieldMax ? Math.round(boss.shield / boss.shieldMax * 100) / 100 : 0;
      if (c.bossS !== sk) { c.bossS = sk; $('#hudBossShield').style.transform = 'scaleX(' + sk + ')'; }
    }
    // комбо
    const comboOn = run.combo >= 5;
    if (c.comboOn !== comboOn) { c.comboOn = comboOn; $('#hudCombo').classList.toggle('show', comboOn); }
    if (comboOn) {
      const mult = 'x' + g.comboMul().toFixed(1);
      if (c.mult !== mult) { c.mult = mult; const el = $('#hudComboMult'); el.textContent = mult; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
      if (c.combo !== run.combo) { c.combo = run.combo; $('#hudComboLbl').textContent = 'КОМБО ' + run.combo; }
      const ct = Math.round(Math.max(0, run.comboT / 2.6) * 50) / 50;
      if (c.ct !== ct) { c.ct = ct; $('#hudComboTimer').style.transform = 'scaleX(' + ct + ')'; }
      if (c.fever !== run.fever) { c.fever = run.fever; $('#hudCombo').classList.toggle('fever', run.fever); }
    }
    // бонусы
    const buffKey = Object.keys(g.buffs).map((k) => k + Math.ceil(g.buffs[k])).join(',') + (run.skillFx.sk_overclock > 0 ? 'oc' + Math.ceil(run.skillFx.sk_overclock) : '') + (run.overload > 0 ? 'ol' + Math.ceil(run.overload) : '');
    if (c.buffs !== buffKey) {
      c.buffs = buffKey;
      const icons = { power: 'fire', spread: 'bolt', multi: 'plus', rapid: 'bolt', magnet: 'magnet', freeze: 'snow' };
      let h = '';
      for (const k of Object.keys(g.buffs)) { const def = D.POWERUPS[k]; h += '<div class="buff" style="--bc:' + def.color + '">' + ic(icons[k] || 'star') + Math.ceil(g.buffs[k]) + 'с</div>'; }
      if (run.skillFx.sk_overclock > 0) h += '<div class="buff" style="--bc:#3de0ff">' + ic('bolt') + 'РАЗГОН ' + Math.ceil(run.skillFx.sk_overclock) + 'с</div>';
      if (run.overload > 0) h += '<div class="buff" style="--bc:#ffc83d">' + ic('bolt') + 'ПЕРЕГРУЗКА</div>';
      $('#hudBuffs').innerHTML = h;
    }
    // оружие
    if (c.weapon !== p.weapon) {
      c.weapon = p.weapon;
      $$('#hudWeapons .wbtn').forEach((b) => b.classList.toggle('active', b.dataset.w === p.weapon));
    }
    // навыки
    $$('#hudSkills .skbtn').forEach((b) => {
      const id = b.dataset.sk, sk = D.SKILLS[id];
      const cd = run.skillCd[id] || 0, fx = run.skillFx[id] || 0;
      const state = fx > 0 ? 'active' : cd > 0 ? 'cd' : 'ready';
      const key = state + Math.ceil(cd) + '|' + Math.round((fx > 0 ? fx / (sk.dur || 1) : cd / (sk.cd * g.st.cdMul)) * 40);
      if (b._key === key) return;
      b._key = key;
      b.className = 'skbtn ' + state;
      const frac = fx > 0 ? fx / (sk.dur || 1) : cd > 0 ? 1 - cd / (sk.cd * g.st.cdMul) : 1;
      b.querySelector('.rfg').style.strokeDashoffset = (188.5 * (1 - frac)).toFixed(1);
      b.querySelector('.sk-cd').textContent = state === 'cd' ? Math.ceil(cd) : '';
    });
    // бомбы
    const bombKey = p.bombs + (p.bombCd > 0 ? 'c' : '');
    if (c.bomb !== bombKey) {
      c.bomb = bombKey;
      $('#hudBombs').textContent = p.bombs;
      const bb = $('#btnBomb');
      bb.classList.toggle('empty', p.bombs <= 0);
      bb.classList.toggle('cd', p.bombCd > 0);
    }
  };

  // ── баннеры и уведомления ──
  ui.banner = function (html, cls, dur) {
    const el = $('#banner');
    el.className = 'banner';
    el.innerHTML = html;
    void el.offsetWidth;
    el.className = 'banner show ' + (cls || '');
    el.style.animationDuration = (dur || 2400) + 'ms';
    clearTimeout(ui._bannerT);
    ui._bannerT = setTimeout(() => { el.className = 'banner'; }, (dur || 2400) + 50);
  };
  ui.waveBanner = function (w) {
    if (w.boss) return;
    if (w.newSector || w.n === 1) ui.banner('<div class="b2">СЕКТОР ' + (w.sector + 1) + '</div><div class="b1">' + U.escape(w.sectorName) + '</div><div class="b3">Волна ' + w.n + '</div>', '', 2600);
    else ui.banner('<div class="b1">ВОЛНА ' + w.n + '</div>', '', 1800);
  };
  ui.bossWarn = function (def) {
    const el = $('#bossWarn');
    $('#bossWarnName').innerHTML = U.escape(def.name) + '<div style="font-size:12px;letter-spacing:1px;opacity:.75;margin-top:4px;font-family:var(--font);font-weight:600">' + U.escape(def.title) + '</div>';
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(ui._bwT);
    ui._bwT = setTimeout(() => el.classList.remove('show'), 2900);
    T.haptic('warning');
  };
  // уведомления идут очередью — не больше двух на экране одновременно
  ui.toast = function (t) {
    ui._toastQ.push(t);
    if (ui._toastQ.length > 8) ui._toastQ.splice(0, ui._toastQ.length - 8);
    pumpToasts();
  };
  function pumpToasts() {
    const box = $('#toasts');
    while (ui._toastQ.length && box.querySelectorAll('.toast:not(.out)').length < 2) {
      const t = ui._toastQ.shift();
      const el = document.createElement('div');
      el.className = 'toast' + (t.info ? ' info' : '');
      el.innerHTML = '<div class="t-ico">' + (t.ico && t.ico.length > 3 ? ic(t.ico) : U.escape(t.ico || '🏆')) + '</div><div><div class="t-title">' + U.escape(t.title || '') + '</div><div class="t-text">' + U.escape(t.text || '') + '</div></div>' + (t.rew ? '<div class="t-rew">' + U.escape(t.rew) + ' ' + ic('coin') + '</div>' : '');
      box.appendChild(el);
      setTimeout(() => { el.classList.add('out'); setTimeout(() => { el.remove(); pumpToasts(); }, 320); }, t.dur || 2400);
    }
  }

  // ════════════════════════════════════════════════════════════
  // ПАУЗА / УЛУЧШЕНИЯ / ВОСКРЕШЕНИЕ
  // ════════════════════════════════════════════════════════════
  ui.showPause = function () {
    const g = game, run = g.run;
    $('#pauseInfo').innerHTML =
      '<div class="pi-cell"><small>Счёт</small><b>' + U.fmtShort(run.score) + '</b></div>' +
      '<div class="pi-cell"><small>Волна</small><b>' + (g.wave ? g.wave.n : 1) + '</b></div>' +
      '<div class="pi-cell"><small>Монеты</small><b>' + U.fmt(run.coins) + '</b></div>';
    syncPauseToggles();
    ui.show('#scr-pause');
    T.back(() => game.resume());
    A.muffle(true);
  };
  const _origHide = ui.hide;
  ui.hide = function (sel) {
    _origHide(sel);
    if (sel === '#scr-pause') { A.muffle(false); if (ui.cur === 'game') T.back(null); }
  };
  function syncPauseToggles() {
    const st = store.s.settings;
    $('#pauseMusic').classList.toggle('off', st.music <= 0);
    $('#pauseSfx').classList.toggle('off', st.sfx <= 0);
    $('#pauseVibe').classList.toggle('off', !st.vibro);
  }
  function toggleVol(k) {
    const st = store.s.settings;
    if (st[k] > 0) { st['_' + k] = st[k]; st[k] = 0; } else st[k] = st['_' + k] || 70;
    store.soon();
    A.applyVolumes();
    syncPauseToggles();
    A.play('click');
  }

  ui.showPerks = function (choices, reroll) {
    const box = $('#perkCards');
    $('#perkLvl').textContent = game.run.level;
    box.innerHTML = '';
    choices.forEach((pk) => {
      const lv = game.perk(pk.id), rar = D.RARITY[pk.rar];
      const b = document.createElement('button');
      b.className = 'perk-card wait';
      b.style.setProperty('--pc', rar.color);
      let pips = '';
      if (pk.max > 1 && pk.max < 99) { for (let i = 0; i < pk.max; i++) pips += '<i class="' + (i < lv ? 'on' : i === lv ? 'new' : '') + '"></i>'; }
      b.innerHTML = '<div class="perk-ico">' + pk.ico + '</div><div class="perk-info"><div class="perk-name">' + pk.name + (lv ? ' ' + (lv + 1) : '') + '</div><div class="perk-desc">' + pk.desc + '</div>' + (pips ? '<div class="perk-lv">' + pips + '</div>' : '') + '</div><div class="perk-rar">' + rar.name + '</div>';
      b.addEventListener('click', () => {
        if (b.classList.contains('wait')) return;
        ui.hide('#scr-perk');
        game.choosePerk(pk.id);
        T.haptic('success');
      });
      box.appendChild(b);
    });
    const cost = game.rerollCost();
    $('#perkRerollCost').innerHTML = ic('coin', 'coin-ico') + cost;
    $('#btnPerkReroll').disabled = store.s.coins < cost && !SS.DEV;
    ui.show('#scr-perk');
    // защита от случайного нажатия пальцем, который вёл корабль
    setTimeout(() => $$('#perkCards .perk-card').forEach((x) => x.classList.remove('wait')), reroll ? 120 : 480);
  };

  ui.showRevive = function (cost) {
    $('#reviveCost').textContent = U.fmt(cost);
    ui.show('#scr-revive');
    let left = 5.0;
    const ring = $('#reviveRing'), sec = $('#reviveSec');
    ring.style.strokeDashoffset = '0';
    sec.textContent = '5';
    clearInterval(ui._reviveTimer);
    ui._reviveTimer = setInterval(() => {
      left -= 0.05;
      ring.style.strokeDashoffset = (276.5 * (1 - left / 5)).toFixed(1);
      sec.textContent = Math.max(0, Math.ceil(left));
      if (left <= 0) { clearInterval(ui._reviveTimer); if (ui.isShown('#scr-revive')) { ui.hide('#scr-revive'); game.gameOver(); } }
    }, 50);
  };

  // ════════════════════════════════════════════════════════════
  // ИТОГИ
  // ════════════════════════════════════════════════════════════
  ui.showGameOver = function (sum) {
    ui.hideHud();
    ['#scr-pause', '#scr-perk', '#scr-revive'].forEach(ui.hide);
    T.closingConfirm(false);
    ui.cur = 'over';
    T.back(() => ui.toMenu());
    SS.main.setMusic('menu');
    const s = store.s;
    $('#goTitle').textContent = sum.isRecord ? 'НОВЫЙ РЕКОРД' : 'КОРАБЛЬ ПОДБИТ';
    $('#goTitle').classList.toggle('win', !!sum.isRecord);
    $('#goSub').textContent = D.DIFFS[sum.diff].name + ' • награды ×' + fmtMul(D.DIFFS[sum.diff].coins) + ' • Волна ' + sum.wave;
    $('#goRecord').hidden = !sum.isRecord;
    $('#goBest').textContent = U.fmt(s.stats.bestScore);
    $('#goStats').innerHTML = [
      ['skull', 'Враги', U.fmt(sum.kills)], ['crown', 'Боссы', sum.bosses], ['bolt', 'Комбо', '×' + sum.maxCombo],
      ['chart', 'Уровень', sum.level], ['target', 'Точность', sum.accuracy + '%'], ['retry', 'Время', U.fmtTime(sum.time)],
    ].map((x) => '<div class="go-stat">' + ic(x[0]) + '<small>' + x[1] + '</small><b>' + x[2] + '</b></div>').join('');
    $('#goCoins').textContent = '+' + U.fmt(sum.coins + (sum.lvlCoins || 0));
    $('#goXp').textContent = '+' + U.fmt(sum.xp);
    // анимация счёта
    const scoreEl = $('#goScore');
    const target = sum.score, t0 = performance.now(), dur = Math.min(1600, 400 + Math.log10(target + 10) * 250);
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      scoreEl.textContent = U.fmt(target * U.easeOutCubic(k));
      if (k < 1 && ui.cur === 'over') requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    // полоса опыта корабля
    const fill = $('#goXpFill');
    fill.style.transition = 'none';
    fill.style.width = Math.min(100, (sum.levels ? 0 : sum.xpBefore / D.shipXpNeed(sum.lvlBefore)) * 100) + '%';
    $('#goShipLvl').textContent = 'Ур. ' + s.shipLvl;
    setTimeout(() => { fill.style.transition = ''; fill.style.width = Math.min(100, s.shipXP / D.shipXpNeed(s.shipLvl) * 100) + '%'; }, 250);
    // что открылось за забег: достижения, раскраски, задания
    const evs = ui.runEvents.slice(0, 8);
    $('#goAch').innerHTML = evs.map((a) => '<span class="chip">' + a.ico + ' ' + U.escape(a.text) + '</span>').join('');
    document.body.classList.add('toasts-bottom');
    setTimeout(() => ui.show('#scr-gameover'), 350);
  };

  ui.share = function () {
    const s = store.s;
    const text = 'Мой рекорд в Space Shooter 2.0 — ' + U.fmt(s.stats.bestScore) + ' очков, волна ' + s.stats.bestWave + '! Сможешь побить? 🚀';
    const r = T.share(text);
    if (r === 'copied') ui.toast({ ico: '📋', title: 'СКОПИРОВАНО', text: 'Ссылка в буфере обмена', info: true });
    A.play('click');
  };

  // ════════════════════════════════════════════════════════════
  // ДИАЛОГ
  // ════════════════════════════════════════════════════════════
  ui.dialog = function (o) {
    $('#dlgIco').innerHTML = o.ico ? (o.ico.length > 3 ? ic(o.ico) : U.escape(o.ico)) : '';
    $('#dlgTitle').textContent = o.title || '';
    $('#dlgText').textContent = o.text || '';
    const ok = $('#dlgOk');
    ok.textContent = o.ok || 'ОК';
    ok.className = 'btn ' + (o.danger ? 'danger' : 'primary');
    $('#dlgCancel').hidden = !!o.noCancel;
    ok.onclick = () => { ui.hide('#scr-dialog'); A.play('click'); if (o.onOk) o.onOk(); };
    ui.show('#scr-dialog');
  };

  // ════════════════════════════════════════════════════════════
  // НАГРАДА ЗА ВХОД
  // ════════════════════════════════════════════════════════════
  ui.checkLogin = function () {
    const st = M.loginStatus();
    if (!st.available || ui.isShown('#scr-login')) return;
    const box = $('#loginDays');
    box.innerHTML = D.LOGIN.map((r, i) => {
      const cls = i < st.day ? 'got' : i === st.day ? 'today' : '';
      return '<div class="lday ' + cls + (i === 6 ? ' big' : '') + '"><small>День ' + (i + 1) + '</small>' + ic(i === 6 ? 'gift' : 'coin') + '<b>' + r.coins + (r.sp ? ' + ✦' : '') + '</b></div>';
    }).join('');
    $('#loginTxt').textContent = st.streak > 1 ? 'Серия: ' + st.streak + ' ' + U.plural(st.streak, 'день', 'дня', 'дней') + ' подряд!' : 'Заходите каждый день — награда растёт!';
    setTimeout(() => ui.show('#scr-login'), 500);
  };

  // ════════════════════════════════════════════════════════════
  // АНГАР
  // ════════════════════════════════════════════════════════════
  let hangarRAF = null;
  function stopHangarAnim() { if (hangarRAF) cancelAnimationFrame(hangarRAF); hangarRAF = null; }
  function startHangarAnim() {
    stopHangarAnim();
    const cv = $('#hangarCanvas');
    const ctx = cv.getContext('2d');
    const loop = (now) => {
      if (ui.cur !== 'hangar') { hangarRAF = null; return; }
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, r.width, r.height);
      const s = store.s, t = now / 1000;
      const pv = ui._preview || s.ship;
      game.drawShip(ctx, pv.model, pv.skin, pv.trail, r.width / 2, r.height * 0.46 + Math.sin(t * 1.6) * 5, Math.min(r.height * 0.5, 120), Math.sin(t * 0.9) * 0.08, t, 1.15);
      hangarRAF = requestAnimationFrame(loop);
    };
    hangarRAF = requestAnimationFrame(loop);
  }

  function spriteCard(drawFn, size) {
    const c = document.createElement('canvas');
    c.width = size * 2; c.height = size * 2;
    const x = c.getContext('2d');
    x.scale(2, 2);
    drawFn(x, size);
    return c;
  }

  ui.renderHangar = function (tab) {
    const s = store.s, list = $('#hangarList');
    ui._preview = null;
    const sh = D.SHIPS[s.ship.model];
    $('#hangarShipName').textContent = sh.name;
    $('#hangarShipStats').innerHTML = sh.perks.map((p) => '<span class="stat-chip">' + p + '</span>').join('');
    list.innerHTML = '';
    if (tab === 'models') {
      for (const id of D.SHIP_ORDER) {
        const d = D.SHIPS[id], owned = s.ship.models.includes(id), sel = s.ship.model === id;
        const lvlOk = s.shipLvl >= d.lvl;
        const card = document.createElement('button');
        card.className = 'item-card' + (sel ? ' selected' : '') + (!owned ? ' locked' : '');
        card.appendChild(spriteCard((x, sz) => { const v = game.shipLook(id, s.ship.skin), cv = v.cv; const f = G.frame(v.sprite); const w = sz * 0.8, h = w * f[3] / f[2]; if (cv) x.drawImage(cv, (sz - w) / 2, (sz - h) / 2, w, h); else x.drawImage(G.img, f[0], f[1], f[2], f[3], (sz - w) / 2, (sz - h) / 2, w, h); }, 64));
        card.insertAdjacentHTML('beforeend', '<b>' + d.name + '</b><small>' + d.desc + '</small>' +
          (owned ? '' : lvlOk ? '<span class="price">' + ic('coin') + U.fmt(d.price) + '</span>' : '<span class="req">' + ic('lock') + 'Корабль ур. ' + d.lvl + '</span>'));
        card.addEventListener('click', () => {
          if (owned) { s.ship.model = id; store.save(); A.play('click'); ui.renderHangar('models'); return; }
          if (!lvlOk && !SS.DEV) { A.play('error'); ui.toast({ ico: '🔒', title: 'НУЖЕН УРОВЕНЬ', text: 'Откроется на ' + d.lvl + ' уровне корабля', info: true }); return; }
          ui._preview = { model: id, skin: s.ship.skin, trail: s.ship.trail };
          ui.dialog({ ico: 'ship', title: d.name, text: d.desc + '\n' + d.perks.join(' • ') + '\n\nЦена: ' + U.fmt(d.price) + ' монет', ok: 'КУПИТЬ', onOk: () => {
            if (M.buyShip(id)) { A.play('buy'); T.haptic('success'); ui.toast({ ico: '🚀', title: 'НОВЫЙ КОРАБЛЬ', text: d.name, info: true }); }
            else { A.play('error'); ui.toast({ ico: '💸', title: 'НЕ ХВАТАЕТ МОНЕТ', text: 'Нужно ' + U.fmt(d.price), info: true }); }
            ui.renderHangar('models'); updateWallets();
          } });
        });
        list.appendChild(card);
      }
    } else if (tab === 'skins') {
      for (const sk of D.SKINS) {
        const owned = s.ship.skins.includes(sk.id), sel = s.ship.skin === sk.id;
        const card = document.createElement('button');
        card.className = 'item-card rar-' + sk.rar + (sel ? ' selected' : '') + (!owned ? ' locked' : '');
        card.appendChild(spriteCard((x, sz) => { const v = game.shipLook(s.ship.model, sk.id, true), cv = v.cv; const f = G.frame(v.sprite); const w = sz * 0.78, h = w * f[3] / f[2]; if (cv) x.drawImage(cv, (sz - w) / 2, (sz - h) / 2, w, h); else x.drawImage(G.img, f[0], f[1], f[2], f[3], (sz - w) / 2, (sz - h) / 2, w, h); }, 64));
        card.insertAdjacentHTML('beforeend', '<span class="rar">' + D.RARITY_NAMES[sk.rar] + '</span><b>' + sk.name + '</b>' + (owned ? '' : '<span class="req">' + ic('lock') + U.escape(sk.req) + '</span>'));
        card.addEventListener('click', () => {
          if (!owned) { A.play('error'); ui._preview = { model: s.ship.model, skin: sk.id, trail: s.ship.trail }; ui.toast({ ico: '🔒', title: sk.name, text: sk.req, info: true }); return; }
          s.ship.skin = sk.id; store.save(); A.play('click'); T.haptic('select'); ui.renderHangar('skins');
        });
        list.appendChild(card);
      }
    } else {
      for (const tr of D.TRAILS) {
        const owned = s.ship.trails.includes(tr.id), sel = s.ship.trail === tr.id;
        const card = document.createElement('button');
        card.className = 'item-card' + (sel ? ' selected' : '') + (!owned ? ' locked' : '');
        const cols = game.trailColors(tr.id);
        card.appendChild(spriteCard((x, sz) => {
          const g = x.createLinearGradient(0, sz * 0.15, 0, sz * 0.95);
          g.addColorStop(0, cols[0]); g.addColorStop(0.3, cols[1]); g.addColorStop(1, 'rgba(0,0,0,0)');
          x.fillStyle = g;
          x.beginPath(); x.moveTo(sz * 0.32, sz * 0.15); x.quadraticCurveTo(sz * 0.5, sz * 0.08, sz * 0.68, sz * 0.15); x.quadraticCurveTo(sz * 0.58, sz * 0.6, sz * 0.5, sz * 0.95); x.quadraticCurveTo(sz * 0.42, sz * 0.6, sz * 0.32, sz * 0.15); x.fill();
        }, 64));
        card.insertAdjacentHTML('beforeend', '<b>' + tr.name + '</b>' + (owned ? '' : '<span class="price">' + ic('coin') + U.fmt(tr.price) + '</span>'));
        card.addEventListener('click', () => {
          if (owned) { s.ship.trail = tr.id; store.save(); A.play('click'); ui.renderHangar('trails'); return; }
          ui._preview = { model: s.ship.model, skin: s.ship.skin, trail: tr.id };
          ui.dialog({ ico: 'fire', title: 'ДВИГАТЕЛЬ «' + tr.name + '»', text: 'Цена: ' + U.fmt(tr.price) + ' монет', ok: 'КУПИТЬ', onOk: () => {
            if (M.buyTrail(tr.id)) { A.play('buy'); T.haptic('success'); } else { A.play('error'); ui.toast({ ico: '💸', title: 'НЕ ХВАТАЕТ МОНЕТ', text: 'Нужно ' + U.fmt(tr.price), info: true }); }
            ui.renderHangar('trails'); updateWallets();
          } });
        });
        list.appendChild(card);
      }
    }
    // престиж
    const extra = $('#hangarExtra');
    extra.innerHTML = '';
    if (M.canPrestige()) {
      const b = document.createElement('button');
      b.className = 'btn gold wide';
      b.style.marginTop = '14px';
      b.innerHTML = ic('star') + 'ПРЕСТИЖ ' + ((s.prestige || 0) + 1);
      b.addEventListener('click', () => ui.dialog({ ico: 'star', title: 'ПРЕСТИЖ', text: 'Уровень корабля и навыки сбросятся.' + NL + 'Навсегда: +8% монет и +4% урона за каждый престиж.' + NL + 'Прокачка, оружие, корабли, раскраски и монеты останутся.', ok: 'ПРЕСТИЖ', onOk: () => { if (M.doPrestige()) { A.play('levelup'); ui.toast({ ico: '🌠', title: 'ПРЕСТИЖ ' + s.prestige, text: 'Добро пожаловать в новый цикл!' }); ui.renderHangar(tab); } } }));
      extra.appendChild(b);
    } else if (s.shipLvl >= 10) {
      extra.innerHTML = '<div class="hint-txt">Престиж откроется на ' + D.PRESTIGE_LVL + ' уровне корабля: постоянный бонус к монетам и урону</div>';
    }
    startHangarAnim();
  };

  // ════════════════════════════════════════════════════════════
  // АРСЕНАЛ
  // ════════════════════════════════════════════════════════════
  ui.renderArsenal = function (tab) {
    updateWallets();
    const list = $('#arsenalList');
    if (tab === 'weapons') renderWeapons(list); else renderGeneral(list);
  };

  function segs(v, n) { return Array.from({ length: n }, (_, i) => '<i class="' + (i < v ? 'on' : '') + '"></i>').join(''); }
  // эффект улучшения на уровне lvl: «+24% урона», «+2 прыжок» или текст уровня
  function effText(up, lvl) {
    if (up.levelText) return up.levelText[lvl - 1];
    const v = up.abs ? lvl * up.step : Math.round(lvl * up.step * 100);
    return '+' + v + (up.abs && up.units ? U.plural(v, up.units[0], up.units[1], up.units[2]) : up.unit);
  }
  function upRow(up, lvl, attr) {
    const s = store.s, max = lvl >= up.max;
    const cost = max ? 0 : up.costs[lvl], poor = !max && s.coins < cost && !SS.DEV;
    const eff = max ? '<b>' + effText(up, lvl) + '</b> • максимум'
      : (lvl ? effText(up, lvl) : 'Сейчас нет') + '<span class="arr">›</span><b>' + effText(up, lvl + 1) + '</b>';
    return '<div class="up2"><div class="up2-name">' + (up.ico ? '<span class="gen-ico">' + up.ico + '</span>' : '') + up.name + ' <small>' + lvl + '/' + up.max + '</small></div>' +
      '<div class="up2-eff">' + eff + '</div><div class="segs">' + segs(lvl, up.max) + '</div>' +
      (max ? '<button class="btn sm up2-buy max" disabled>' + ic('check') + 'MAX</button>'
        : '<button class="btn sm up2-buy ' + (poor ? 'poor' : 'gold') + '" ' + attr + (poor ? ' disabled' : '') + '><span class="pr">' + ic('coin', 'coin-ico') + U.fmt(cost) + '</span><small>' + (poor ? 'не хватает' : 'улучшить') + '</small></button>') + '</div>';
  }
  function weaponLevels(wid) { const o = {}; for (const up of D.WEAPONS[wid].ups) o[up.id] = M.weaponLevel(wid, up.id); return o; }
  // примерный урон в секунду с учётом прокачки оружия и корабля (без улучшений забега)
  function weaponPower(wid) {
    const w = D.WEAPONS[wid], b = w.base, lv = weaponLevels(wid);
    const gen = (1 + M.generalLevel('power') * 0.07) * (1 + M.generalLevel('rate') * 0.05);
    const dm = 1 + (lv.dmg || 0) * 0.12, cd = b.cd / (1 + (lv.rate || 0) * 0.08);
    let dps = 0;
    if (wid === 'laser' || wid === 'arc') dps = b.dmg * dm / cd;
    else if (wid === 'shotgun') dps = b.dmg * dm * (b.pellets + (lv.pellets || 0)) * 0.65 / cd;
    else if (wid === 'rocket') dps = (b.dmg + b.aoe * 0.5) * dm * (b.salvo + (lv.salvo || 0)) / cd;
    else if (wid === 'plasma') dps = (b.dmg + b.aoe) * dm / cd;
    else if (wid === 'lightning') { let k = 0, f = 1; for (let i = 0; i <= b.chain + (lv.chain || 0); i++) { k += f; f *= b.falloff; } dps = b.dmg * dm * k / cd; }
    else if (wid === 'darkmatter') dps = (b.dmg * (b.life / b.tick) * 0.6 + b.burst) * dm / cd;
    return Math.round(dps * gen);
  }
  function canUpgrade(wid) {
    const c = store.s.coins;
    return D.WEAPONS[wid].ups.some((up) => { const l = M.weaponLevel(wid, up.id); return l < up.max && c >= up.costs[l]; });
  }
  function weaponDetail(wid) {
    const s = store.s, w = D.WEAPONS[wid], r = w.rate || {};
    const owned = s.weapons.owned.includes(wid), slot = s.weapons.loadout.indexOf(wid);
    let h = '<div class="ad-head"><div class="ad-ico"><canvas data-wi="' + wid + '" width="104" height="104"></canvas></div><div>' +
      '<div class="ad-name">' + w.name + (slot >= 0 ? '<span class="tag">В БОЮ • ' + (slot + 1) + '</span>' : '') + '</div>' +
      '<div class="ad-tags">' + (w.tags || []).map((t) => '<span>' + t + '</span>').join('') + '</div></div></div>';
    h += '<div class="ad-desc">' + w.desc + '</div>';
    h += '<div class="ad-stats">' + [['Урон', r.dmg], ['Скорострельность', r.speed], ['Площадь', r.area], ['Дальность', r.range]]
      .map((x) => '<span>' + x[0] + '</span><div class="segs">' + segs(x[1] || 0, 5) + '</div>').join('') + '</div>';
    h += '<div class="ad-power"><span>Урон в секунду<br>с вашей прокачкой</span><b>≈ ' + U.fmt(weaponPower(wid)) + '</b></div>';
    if (owned) {
      const total = w.ups.reduce((a, up) => a + up.max, 0), got = w.ups.reduce((a, up) => a + M.weaponLevel(wid, up.id), 0);
      h += '<div class="ad-sec">ПРОКАЧКА<small>' + got + ' из ' + total + '</small></div>';
      h += w.ups.map((up) => upRow(up, M.weaponLevel(wid, up.id), 'data-up="' + up.id + '"')).join('');
      h += '<div class="ad-actions">' + (slot >= 0
        ? '<button class="btn on-green" data-lo="1">' + ic('check') + 'В БОЮ • УБРАТЬ</button>'
        : '<button class="btn primary" data-lo="1">' + ic('plus') + 'ВЗЯТЬ В БОЙ</button>') + '</div>';
    } else {
      const poor = s.coins < w.price && !SS.DEV;
      h += '<div class="ad-actions"><button class="btn gold" data-buy="1"' + (poor ? ' disabled' : '') + '>' + ic('coin', 'coin-ico') + 'КУПИТЬ ЗА ' + U.fmt(w.price) + '</button></div>';
      if (poor) h += '<div class="locked-note">' + ic('lock') + 'Не хватает ' + U.fmt(w.price - s.coins) + ' монет. Монеты падают с врагов и даются за задания дня.</div>';
    }
    return h;
  }
  function renderWeapons(list) {
    const s = store.s, lo = s.weapons.loadout;
    if (!D.WEAPONS[ui._ars]) ui._ars = lo[0] || 'laser';
    const wid = ui._ars, w = D.WEAPONS[wid];
    let h = '<div class="ars-hint"><b>В бою ' + lo.length + ' из 3.</b> Нажмите на оружие, чтобы прокачать его или взять в бой. В игре оружие переключается кнопками внизу экрана.</div>';
    h += '<div class="ars-grid">' + D.WEAPON_ORDER.map((id) => {
      const d = D.WEAPONS[id], own = s.weapons.owned.includes(id), sl = lo.indexOf(id);
      const poor = !own && s.coins < d.price && !SS.DEV;
      const st = own ? (sl >= 0 ? ic('check') + 'В БОЮ' : 'Куплено') : ic('lock') + U.fmt(d.price);
      return '<button class="ars-tile' + (id === wid ? ' sel' : '') + (own ? '' : ' locked') + (poor ? ' poor' : '') + (sl >= 0 ? ' inlo' : '') + '" data-pick="' + id + '" style="--wc:' + d.color + '">' +
        (sl >= 0 ? '<span class="slot-n">' + (sl + 1) + '</span>' : '') + (own && canUpgrade(id) ? '<i class="upd"></i>' : '') +
        '<canvas data-wi="' + id + '" width="80" height="80"></canvas><b>' + d.name + '</b><span class="st">' + st + '</span></button>';
    }).join('') + '</div>';
    h += '<div class="ad" style="--wc:' + w.color + '">' + weaponDetail(wid) + '</div>';
    list.innerHTML = h;
    $$('canvas[data-wi]', list).forEach((c) => c.getContext('2d').drawImage(G.weaponIcon(c.dataset.wi, c.width), 0, 0));
    list.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.dataset.pick) { ui._ars = b.dataset.pick; A.play('click'); T.haptic('select'); ui.renderArsenal('weapons'); return; }
      const id = ui._ars, def = D.WEAPONS[id];
      if (b.dataset.buy) {
        ui.dialog({ ico: 'swords', title: def.name, text: def.desc + '\n\nЦена: ' + U.fmt(def.price) + ' монет', ok: 'КУПИТЬ', onOk: () => {
          if (M.buyWeapon(id)) {
            A.play('buy'); T.haptic('success');
            ui.toast({ ico: '⚔️', title: 'НОВОЕ ОРУЖИЕ', text: def.name + (store.s.weapons.loadout.includes(id) ? ' • уже в бою' : ''), info: true });
          } else A.play('error');
          ui.renderArsenal('weapons');
        } });
      } else if (b.dataset.lo) {
        const cur = store.s.weapons.loadout, inLo = cur.includes(id);
        if (inLo && cur.length <= 1) { A.play('error'); ui.toast({ ico: '⚠️', title: 'НУЖНО ОРУЖИЕ', text: 'Хотя бы одно оружие должно быть в бою', info: true }); return; }
        const out = !inLo && cur.length >= 3 ? cur[0] : null;
        M.toggleLoadout(id); A.play('click'); T.haptic('select');
        if (out) ui.toast({ ico: '🔁', title: 'ЗАМЕНА', text: D.WEAPONS[out].name + ' убран из боя', info: true, dur: 1600 });
        ui.renderArsenal('weapons');
      } else if (b.dataset.up) {
        if (M.buyWeaponUp(id, b.dataset.up)) { A.play('buy'); T.haptic('light'); } else A.play('error');
        ui.renderArsenal('weapons');
      }
    };
  }
  function renderGeneral(list) {
    let h = '<div class="ars-hint">Прокачка корабля действует на всё оружие и на все корабли.</div><div class="gen-card">';
    h += D.GENERAL.map((g) => upRow(g, M.generalLevel(g.id), 'data-g="' + g.id + '"')).join('');
    h += '</div>';
    list.innerHTML = h;
    list.onclick = (e) => {
      const b = e.target.closest('button[data-g]');
      if (!b || b.disabled) return;
      if (M.buyGeneral(b.dataset.g)) { A.play('buy'); T.haptic('light'); } else A.play('error');
      ui.renderArsenal('general');
    };
  }

  // ════════════════════════════════════════════════════════════
  // НАВЫКИ
  // ════════════════════════════════════════════════════════════
  ui.renderSkills = function (tab) {
    const s = store.s;
    $('#skillPts').textContent = M.skillPoints();
    // слоты
    const act = Object.keys(s.skills).filter((id) => D.SKILLS[id].type === 'active');
    const pas = Object.keys(s.skills).filter((id) => D.SKILLS[id].type === 'passive');
    let h = '';
    for (let i = 0; i < D.MAX_ACTIVE; i++) { const sk = D.SKILLS[act[i]]; h += '<div class="sk-slot act' + (sk ? ' filled' : '') + '">' + (sk ? sk.ico : '⚡') + '<small>АКТИВ</small></div>'; }
    for (let i = 0; i < D.MAX_PASSIVE; i++) { const sk = D.SKILLS[pas[i]]; h += '<div class="sk-slot' + (sk ? ' filled' : '') + '">' + (sk ? sk.ico : '◇') + '<small>ПАССИВ</small></div>'; }
    $('#skillSlots').innerHTML = h;
    const list = $('#skillList');
    list.innerHTML = '';
    const node = (id, color) => {
      const sk = D.SKILLS[id], st = M.skillState(id);
      const b = document.createElement('button');
      b.className = 'sk-node' + (st.learned ? ' learned' : st.locked ? ' locked' : st.canLearn ? ' available' : '');
      b.style.setProperty('--bc', color);
      const meta = [];
      if (sk.cd) meta.push('⏱ ' + sk.cd + ' с');
      if (sk.req) meta.push((st.locked ? '🔒 ' : '✓ ') + D.SKILLS[sk.req].name);
      b.innerHTML = '<div class="sk-ico">' + sk.ico + '</div><div class="sk-info"><div class="sk-name">' + sk.name + '</div><div class="sk-desc">' + sk.desc + '</div>' + (meta.length ? '<div class="sk-meta">' + meta.join('<span>•</span>') + '</div>' : '') + '</div>' +
        '<div class="sk-cost">' + (st.learned ? ic('check') : ic('atom') + sk.cost) + '</div>';
      b.addEventListener('click', () => skillDialog(id));
      return b;
    };
    if (tab === 'passive') {
      for (const br of D.SKILL_BRANCHES) {
        const ids = Object.keys(D.SKILLS).filter((id) => D.SKILLS[id].type === 'passive' && D.SKILLS[id].branch === br.id).sort((a, b) => D.SKILLS[a].tier - D.SKILLS[b].tier);
        const wrap = document.createElement('div');
        wrap.className = 'sk-branch';
        wrap.style.setProperty('--bc', br.color);
        wrap.innerHTML = '<div class="sk-branch-title">' + br.name + '</div>';
        const row = document.createElement('div');
        row.className = 'sk-row';
        ids.forEach((id, i) => {
          if (i > 0 && br.id !== 'special') { const ln = document.createElement('div'); ln.className = 'sk-link' + (s.skills[ids[i - 1]] ? ' on' : ''); row.appendChild(ln); }
          row.appendChild(node(id, br.color));
        });
        wrap.appendChild(row);
        list.appendChild(wrap);
      }
    } else {
      const wrap = document.createElement('div');
      wrap.className = 'sk-branch';
      wrap.style.setProperty('--bc', '#3de0ff');
      wrap.innerHTML = '<div class="sk-branch-title">АКТИВНЫЕ — КНОПКИ В БОЮ</div>';
      const row = document.createElement('div');
      row.className = 'sk-row';
      Object.keys(D.SKILLS).filter((id) => D.SKILLS[id].type === 'active').sort((a, b) => D.SKILLS[a].tier - D.SKILLS[b].tier).forEach((id) => row.appendChild(node(id, '#3de0ff')));
      wrap.appendChild(row);
      list.appendChild(wrap);
    }
  };

  function skillDialog(id) {
    const sk = D.SKILLS[id], st = M.skillState(id);
    const tab = activeTab('#skillTabs');
    if (st.learned) {
      ui.dialog({ ico: sk.ico, title: sk.name, text: sk.desc + '\n\nСнять навык? Вернётся ' + sk.cost + ' ' + U.plural(sk.cost, 'очко', 'очка', 'очков') + '.', ok: 'СНЯТЬ', danger: true, onOk: () => {
        const removed = M.forgetSkill(id);
        A.play('back');
        if (removed.length > 1) ui.toast({ ico: '↩️', title: 'НАВЫКИ СНЯТЫ', text: removed.map((r) => D.SKILLS[r].name).join(', '), info: true });
        ui.renderSkills(tab);
      } });
      return;
    }
    let why = '';
    if (st.locked) why = 'Сначала изучите «' + D.SKILLS[sk.req].name + '»';
    else if (st.slotsFull) why = 'Все слоты заняты — снимите другой ' + (sk.type === 'active' ? 'активный' : 'пассивный') + ' навык';
    else if (!st.afford) why = 'Не хватает очков: нужно ' + sk.cost + ', есть ' + M.skillPoints();
    ui.dialog({ ico: sk.ico, title: sk.name, text: sk.desc + (sk.cd ? '\nПерезарядка: ' + sk.cd + ' с' : '') + '\n\n' + (why || 'Стоимость: ' + sk.cost + ' ' + U.plural(sk.cost, 'очко', 'очка', 'очков')), ok: why ? 'ПОНЯТНО' : 'ИЗУЧИТЬ', noCancel: !!why, onOk: () => {
      if (why) return;
      if (M.learnSkill(id)) { A.play('levelup'); T.haptic('success'); ui.toast({ ico: sk.ico, title: 'НАВЫК ИЗУЧЕН', text: sk.name, info: true }); }
      else A.play('error');
      ui.renderSkills(tab);
    } });
  }

  // ════════════════════════════════════════════════════════════
  // РЕЙТИНГ
  // ════════════════════════════════════════════════════════════
  ui.renderLeaders = async function (tab) {
    const s = store.s, list = $('#lbList'), me = T.user();
    const st = s.stats;
    $('#statsCard').innerHTML = '<div class="stats-title">МОЯ СТАТИСТИКА</div>' + [
      ['Игр сыграно', U.fmt(st.games)], ['Лучшая волна', st.bestWave], ['Врагов уничтожено', U.fmt(st.kills)], ['Боссов побеждено', U.fmt(st.bosses)],
      ['Лучшее комбо', '×' + st.maxCombo], ['Время в бою', U.fmtTime(st.playTime)], ['Монет заработано', U.fmt(st.coinsEarned)], ['Улучшений выбрано', U.fmt(st.perks)],
    ].map((x) => '<div class="stat-cell"><small>' + x[0] + '</small><b>' + x[1] + '</b></div>').join('');
    if (tab === 'local') {
      list.innerHTML = s.lb.length ? s.lb.map((r, i) => '<div class="lb-row"><div class="lb-rank r' + (i + 1) + '">' + (i + 1) + '</div><div><div class="lb-name">' + U.fmt(r.score) + ' очков</div><div class="lb-sub">' + D.DIFFS[r.diff].name + ' • волна ' + r.wave + ' • ' + new Date(r.date).toLocaleDateString('ru-RU') + '</div></div><div class="lb-score">В' + r.wave + '</div></div>').join('')
        : '<div class="lb-empty">Сыграйте первую игру — здесь появятся ваши лучшие забеги</div>';
      return;
    }
    list.innerHTML = '<div class="lb-empty">Загрузка…</div>';
    const remote = await T.fetchLeaderboard();
    if (activeTab('#lbTabs') !== 'world') return;
    if (!remote) {
      list.innerHTML = '<div class="lb-empty">' + (T.apiUrl() ? 'Сервер рейтинга сейчас недоступен.<br>Попробуйте позже.' : 'Мировой рейтинг появится, когда разработчик подключит сервер.<br>Ваш рекорд: <b>' + U.fmt(st.bestScore) + '</b>') + '</div>';
      return;
    }
    list.innerHTML = remote.length ? remote.map((r, i) => '<div class="lb-row' + (r.id === me.id ? ' me' : '') + '"><div class="lb-rank r' + (i + 1) + '">' + (i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1) + '</div><div style="min-width:0"><div class="lb-name">' + U.escape(r.name) + (r.id === me.id ? ' (вы)' : '') + '</div><div class="lb-sub">Волна ' + (r.max_level || 1) + ' • игр: ' + (r.games_played || 0) + '</div></div><div class="lb-score">' + U.fmtShort(r.score) + '</div></div>').join('')
      : '<div class="lb-empty">Пока никого нет — станьте первым!</div>';
  };

  // ════════════════════════════════════════════════════════════
  // НАГРАДЫ
  // ════════════════════════════════════════════════════════════
  ui.renderAchievements = function () {
    const s = store.s;
    const done = (a) => !!s.achievements[a.id];
    const list = D.ACHIEVEMENTS.slice().sort((a, b) => (done(a) === done(b) ? 0 : done(a) ? 1 : -1));
    $('#achTotal').textContent = Object.keys(s.achievements).length + '/' + D.ACHIEVEMENTS.length;
    $('#achList').innerHTML = list.map((a) => {
      const d = done(a);
      let bar = '';
      if (!d && a.stat) { const v = M.statValue(a.stat); bar = '<div class="ach-bar"><i style="width:' + Math.min(100, v / a.goal * 100) + '%"></i></div>'; }
      return '<div class="ach-item' + (d ? ' done' : '') + '"><div class="ach-ico">' + a.ico + '</div><div class="ach-info"><div class="ach-name">' + U.escape(a.name) + '</div><div class="ach-desc">' + U.escape(a.desc) + (a.stat && !d ? ' (' + U.fmt(Math.min(M.statValue(a.stat), a.goal)) + '/' + U.fmt(a.goal) + ')' : '') + '</div>' + bar + '</div><div class="ach-rew">' + (d ? ic('check') : ic('coin') + a.reward) + '</div></div>';
    }).join('');
  };

  // ════════════════════════════════════════════════════════════
  // НАСТРОЙКИ
  // ════════════════════════════════════════════════════════════
  ui.renderSettings = function () {
    const st = store.s.settings;
    const body = $('#settingsBody');
    const styles = SS.audio.styles;
    const seg = (key, opts) => '<div class="seg wrap" data-seg="' + key + '">' + opts.map((o) => '<button data-v="' + o[0] + '" class="' + (String(st[key]) === String(o[0]) ? 'on' : '') + '">' + o[1] + '</button>').join('') + '</div>';
    const sw = (key) => '<button class="switch' + (st[key] ? ' on' : '') + '" data-sw="' + key + '" aria-label="' + key + '"></button>';
    const range = (key, min, max, step, fmt) => '<div class="set-row col"><div class="set-line"><label>' + fmt[0] + '</label><span class="val" data-val="' + key + '">' + fmt[1](st[key]) + '</span></div><input type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + st[key] + '" data-range="' + key + '"></div>';
    const cloud = T.cloudAvailable() ? 'включено' : T.inside ? 'недоступно' : 'только в Telegram';
    body.innerHTML =
      '<div class="set-title">ЗВУК</div><div class="set-group">' +
      range('music', 0, 100, 5, [ic('music') + 'Музыка', (v) => v + '%']) +
      range('sfx', 0, 100, 5, [ic('sound') + 'Эффекты', (v) => v + '%']) +
      '<div class="set-row col"><div class="set-line"><label>' + ic('music') + 'Стиль музыки</label></div>' + seg('musicStyle', Object.keys(styles).map((k) => [k, styles[k].name])) + '</div></div>' +
      '<div class="set-title">ГРАФИКА</div><div class="set-group">' +
      '<div class="set-row col"><div class="set-line"><label>' + ic('star') + 'Качество</label></div>' + seg('quality', [['auto', 'Авто'], ['high', 'Высокое'], ['medium', 'Среднее'], ['low', 'Низкое']]) + '</div>' +
      '<div class="set-row"><label>' + ic('bolt') + 'Тряска экрана</label>' + sw('shake') + '</div>' +
      '<div class="set-row"><label>' + ic('target') + 'Цифры урона</label>' + sw('dmgNums') + '</div>' +
      '<div class="set-row"><label>' + ic('chart') + 'Показывать FPS</label>' + sw('fps') + '</div></div>' +
      '<div class="set-title">УПРАВЛЕНИЕ</div><div class="set-group">' +
      range('sens', 0.6, 2.4, 0.05, [ic('ship') + 'Чувствительность', (v) => '×' + (+v).toFixed(2)]) +
      '<div class="set-row"><label>' + ic('vibe') + 'Вибрация</label>' + sw('vibro') + '</div></div>' +
      '<div class="set-title">ПРОГРЕСС</div><div class="set-group">' +
      '<div class="set-row"><label>' + ic('user') + 'Облачное сохранение</label><span class="val" style="min-width:0">' + cloud + '</span></div>' +
      '<div class="set-row"><label>' + ic('retry') + 'Сбросить прогресс</label><button class="btn sm danger" id="btnReset">СБРОС</button></div></div>' +
      (SS.DEV ? '<div class="set-title">РАЗРАБОТЧИК</div><div class="set-group"><div class="set-row"><label>+10 000 монет</label><button class="btn sm" id="devCoins">ДАТЬ</button></div><div class="set-row"><label>+10 очков навыков</label><button class="btn sm" id="devSp">ДАТЬ</button></div><div class="set-row"><label>Всё оружие и корабли</label><button class="btn sm" id="devAll">ОТКРЫТЬ</button></div></div>' : '') +
      '<div class="hint-txt">Space Shooter ' + SS.VERSION + '</div>';

    $$('[data-range]', body).forEach((inp) => {
      const key = inp.dataset.range;
      const setP = () => inp.style.setProperty('--p', ((inp.value - inp.min) / (inp.max - inp.min) * 100) + '%');
      setP();
      inp.addEventListener('input', () => {
        st[key] = key === 'sens' ? +(+inp.value).toFixed(2) : +inp.value;
        $('[data-val="' + key + '"]', body).textContent = key === 'sens' ? '×' + st[key].toFixed(2) : st[key] + '%';
        setP();
        if (key === 'music' || key === 'sfx') A.applyVolumes();
        store.soon();
      });
      inp.addEventListener('change', () => { if (key === 'sfx') A.play('coin'); });
    });
    $$('[data-seg]', body).forEach((sg) => sg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const key = sg.dataset.seg;
      st[key] = b.dataset.v;
      $$('button', sg).forEach((x) => x.classList.toggle('on', x === b));
      store.soon();
      A.play('click');
      if (key === 'musicStyle') SS.main.setMusic(SS.main.musicMode, true);
      if (key === 'quality') SS.main.applyQuality();
    }));
    $$('[data-sw]', body).forEach((b) => b.addEventListener('click', () => {
      const key = b.dataset.sw;
      st[key] = !st[key];
      b.classList.toggle('on', st[key]);
      store.soon();
      A.play('click');
      if (key === 'vibro' && st.vibro) T.haptic('medium');
      if (key === 'fps') $('#fps').hidden = !st.fps;
      if (key === 'shake') SS.fx.shakeOn = st.shake;
    }));
    $('#btnReset').addEventListener('click', () => ui.dialog({ ico: 'retry', title: 'СБРОС ПРОГРЕССА', text: 'Будут удалены монеты, оружие, прокачка, корабли, навыки, рекорды и достижения.\nЭто нельзя отменить!', ok: 'УДАЛИТЬ ВСЁ', danger: true, onOk: () => {
      ui.dialog({ ico: 'skull', title: 'ТОЧНО?', text: 'Последнее предупреждение.', ok: 'ДА, СБРОСИТЬ', danger: true, onOk: () => { store.reset(); A.play('explodeM'); ui.toast({ ico: '🗑️', title: 'ГОТОВО', text: 'Прогресс сброшен', info: true }); ui.renderSettings(); } });
    } }));
    if (SS.DEV) {
      $('#devCoins').onclick = () => { M.addCoins(10000, false); A.play('buy'); };
      $('#devSp').onclick = () => { store.s.spBonus += 10; store.save(); A.play('buy'); };
      $('#devAll').onclick = () => { store.s.weapons.owned = D.WEAPON_ORDER.slice(); store.s.ship.models = D.SHIP_ORDER.slice(); store.save(); A.play('buy'); };
    }
  };

  // ════════════════════════════════════════════════════════════
  // ПРЕДЛОЖИТЬ ИДЕЮ
  // ════════════════════════════════════════════════════════════
  let sugCat = 'gameplay';
  function initSuggest() {
    $('#suggestCats').addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      sugCat = b.dataset.cat;
      $$('#suggestCats .chip').forEach((x) => x.classList.toggle('active', x === b));
      A.play('click');
    });
    const ta = $('#suggestText');
    ta.addEventListener('input', () => {
      $('#suggestLen').textContent = ta.value.length;
      $('#btnSendSuggest').disabled = ta.value.trim().length < 10;
    });
    $('#btnSendSuggest').addEventListener('click', async () => {
      const text = ta.value.trim();
      if (text.length < 10) return;
      const st = $('#suggestStatus'), btn = $('#btnSendSuggest');
      btn.disabled = true;
      st.hidden = false; st.className = 'status wait'; st.textContent = 'Отправляем…';
      try {
        const r = await T.sendSuggestion(text, sugCat);
        if (r.ok) {
          st.className = 'status ok'; st.textContent = 'Спасибо! Сообщение отправлено разработчику.';
          ta.value = ''; $('#suggestLen').textContent = '0';
          A.play('buy'); T.haptic('success');
        } else {
          st.className = 'status err';
          st.textContent = r.reason === 'outside' ? 'Откройте игру через Telegram, чтобы отправить сообщение.' : 'Отправка пока не подключена разработчиком. Напишите ему в боте.';
          btn.disabled = false;
        }
      } catch (e) {
        st.className = 'status err'; st.textContent = 'Не удалось отправить. Проверьте интернет и попробуйте ещё раз.';
        btn.disabled = false;
      }
    });
  }
  ui.renderSuggest = function () { $('#suggestStatus').hidden = true; };
})();
