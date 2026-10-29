// ════════════════════════════════════════════════════════════════
// SPACE SHOOTER 2.0 — запуск, игровой цикл, экран, качество графики
// ════════════════════════════════════════════════════════════════
'use strict';

(function () {
  const U = SS.util;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

  const main = {
    quality: 2,          // 0 — низкое, 1 — среднее, 2 — высокое
    autoQ: true,
    musicMode: 'menu',
    _last: 0, _fpsAcc: 0, _fpsN: 0, _fpsShow: 0, _slowFrames: 0, _fastFrames: 0, _qTimer: 0,
    _vig: null,
  };
  SS.main = main;

  // ── размеры: холст в физических пикселях (с ограничением DPR ради скорости) ──
  main.resize = function () {
    const G = SS.gfx;
    const W = Math.max(280, window.innerWidth), H = Math.max(400, window.innerHeight);
    const sizeChanged = W !== G.W || H !== G.H || !G.bg.layers.length;
    const maxDpr = main.quality >= 2 ? 2 : main.quality === 1 ? 1.5 : 1;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    G.W = W; G.H = H; G.dpr = dpr;
    G.FW = Math.min(W, Math.max(360, H * 0.62), 640);
    if (W < 700) G.FW = W;
    G.FX = Math.round((W - G.FW) / 2);
    G.S = U.clamp(G.FW / 400, 0.82, 1.22);
    document.documentElement.style.setProperty('--fw', G.FW + 'px');
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    // фон пересоздаём только при смене размера (смена качества меняет лишь плотность пикселей)
    if (sizeChanged) {
      main._vig = null;
      G.bg.layers.length = 0;
      G.bg.setSector(Math.max(0, G.bg.sector), true);
      G.bg.makeStars();
    }
    if (SS.game.player) SS.game.clampPlayer();
    main._dirty = true; // смена размера очищает холст — нужен хотя бы один кадр
    if (SS.ui && SS.ui.measure) setTimeout(() => { SS.ui.measure(); if (SS.ui.measureMenuSlot) SS.ui.measureMenuSlot(); }, 60);
  };

  // красная виньетка «последняя жизнь» (рисуется один раз)
  main.vignetteRed = function () {
    const G = SS.gfx;
    if (main._vig && main._vig.width === Math.round(G.W / 2)) return main._vig;
    const c = document.createElement('canvas');
    c.width = Math.round(G.W / 2); c.height = Math.round(G.H / 2);
    const x = c.getContext('2d');
    const g = x.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.35, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.72);
    g.addColorStop(0, 'rgba(255,0,40,0)'); g.addColorStop(1, 'rgba(255,0,40,.32)');
    x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
    main._vig = c;
    return c;
  };

  main.applyQuality = function () {
    const q = SS.store.s.settings.quality;
    main.autoQ = q === 'auto';
    if (q === 'high') main.quality = 2;
    else if (q === 'medium') main.quality = 1;
    else if (q === 'low') main.quality = 0;
    else main.quality = (navigator.hardwareConcurrency || 4) <= 2 ? 1 : 2;
    SS.fx.setQuality(main.quality);
    main.resize();
  };

  // ── музыка по режиму ──
  main.setMusic = function (mode, force) {
    main.musicMode = mode;
    const A = SS.audio;
    if (!A.ac) return;
    const style = SS.store.s.settings.musicStyle;
    const g = SS.game;
    const intensity = mode === 'menu' ? 0 : (g.boss || (g.run && g.run.fever)) ? 2 : 1;
    if (force) A.music.stop(true);
    A.music.play(style, intensity);
  };
  SS.on('intensity', () => { if (main.musicMode === 'game') main.setMusic('game'); });

  // ── ввод ──
  function bindInput() {
    const g = SS.game;
    canvas.addEventListener('pointerdown', (e) => { SS.audio.unlock(); g.onPointerDown(e); try { canvas.setPointerCapture(e.pointerId); } catch (er) {} }, { passive: true });
    canvas.addEventListener('pointermove', (e) => g.onPointerMove(e), { passive: true });
    const up = (e) => g.onPointerUp(e);
    canvas.addEventListener('pointerup', up, { passive: true });
    canvas.addEventListener('pointercancel', up, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if ((e.code === 'Escape' || e.code === 'KeyP') && (g.inRun() || g.state === 'pause')) { g.state === 'pause' ? g.resume() : g.pause(); return; }
      if (e.code === 'Escape' && SS.ui) { SS.ui.back(); return; }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && g.inRun()) e.preventDefault();
      g.onKey(e, true);
    });
    window.addEventListener('keyup', (e) => g.onKey(e, false));
    // запрет масштабирования жестами (iOS)
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  }

  // ── пауза при сворачивании и возобновление звука ──
  function onHidden(hidden) {
    const g = SS.game;
    if (hidden) {
      if (g.inRun()) g.pause();
      SS.audio.suspend();
      SS.store.save();
    } else {
      SS.audio.resume();
      main._last = performance.now();
    }
  }
  document.addEventListener('visibilitychange', () => onHidden(document.hidden));
  window.addEventListener('pagehide', () => SS.store.save());
  window.addEventListener('blur', () => { if (SS.game.inRun() && !document.hasFocus()) SS.game.pause(); });
  SS.on('appActive', (on) => onHidden(!on));

  // ── игровой цикл ──
  function frame(now) {
    requestAnimationFrame(frame);
    let rdt = (now - main._last) / 1000;
    main._last = now;
    if (!(rdt > 0)) return;
    if (rdt > 0.25) rdt = 0.016; // после сворачивания — без скачка
    const G = SS.gfx, g = SS.game;
    g.frame(rdt);
    // экран меню или окно закрывает холст, а игра стоит (меню, пауза, выбор улучшения, итоги) — кадр не
    // перерисовываем: меньше расход батареи, и браузеру не нужно каждый кадр заново размывать фон под окном
    if (g.state === 'play' || g.state === 'dying' || !SS.ui.covered || main._dirty) {
      main._dirty = false;
      ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      g.draw(ctx);
    }
    if (g.state === 'play' || g.state === 'perk' || g.state === 'pause' || g.state === 'dying' || g.state === 'revive') SS.ui.updateHud();
    measure(rdt);
  }

  // счётчик FPS и автоподбор качества
  function measure(dt) {
    main._fpsAcc += dt; main._fpsN++;
    if (main._fpsAcc >= 0.5) {
      const fps = main._fpsN / main._fpsAcc;
      main._fpsAcc = 0; main._fpsN = 0;
      if (SS.store.s.settings.fps) document.getElementById('fps').textContent = Math.round(fps) + ' FPS • Q' + main.quality;
      if (main.autoQ && SS.game.state === 'play') {
        if (fps < 45) { main._slowFrames++; main._fastFrames = 0; } else if (fps > 57) { main._fastFrames++; main._slowFrames = 0; } else { main._slowFrames = 0; main._fastFrames = 0; }
        // понижаем быстро, повышаем осторожно и не больше одного раза — без «качелей»
        if (main._slowFrames >= 4 && main.quality > 0) { main.quality--; main._slowFrames = 0; main._downs = (main._downs || 0) + 1; SS.fx.setQuality(main.quality); main.resize(); }
        if (main._fastFrames >= 60 && main.quality < 2 && (main._downs || 0) < 2 && !main._upgraded) { main.quality++; main._fastFrames = 0; main._upgraded = true; SS.fx.setQuality(main.quality); main.resize(); }
      }
    }
  }

  // ── загрузка ──
  async function boot() {
    const bootFill = document.getElementById('bootFill');
    const bootTxt = document.getElementById('bootTxt');
    const prog = (k, txt) => { bootFill.style.width = Math.round(k * 100) + '%'; if (txt) bootTxt.textContent = txt; };
    try {
      prog(0.1, 'Загрузка сохранения…');
      SS.tg.init();
      SS.store.load();
      SS.game.init();
      SS.enemies.init();
      SS.foes.init();
      SS.skills.init();
      SS.sectors.init();
      SS.map.init();
      SS.comp.init();
      SS.fx.shakeOn = SS.store.s.settings.shake;
      main.applyQuality();
      prog(0.25, 'Синтез звука…');
      SS.audio.init();
      prog(0.4, 'Загрузка спрайтов…');
      await SS.gfx.load((k) => prog(0.4 + k * 0.4));
      // прогрев перекрашенных спрайтов
      const s = SS.store.s;
      SS.game.shipCanvas(s.ship.model, s.ship.skin);
      SS.gfx.bg.init(0);
      prog(0.85, 'Подготовка интерфейса…');
      SS.ui.init();
      bindInput();
      window.addEventListener('resize', () => { clearTimeout(main._rt); main._rt = setTimeout(main.resize, 120); });
      SS.on('resize', () => { clearTimeout(main._rt); main._rt = setTimeout(main.resize, 120); });
      document.getElementById('fps').hidden = !s.settings.fps;
      SS.on('audioUnlocked', () => main.setMusic(main.musicMode));
      // облачное сохранение Telegram — если там прогресс новее, берём его
      SS.tg.cloudLoad().then((res) => {
        if (res && res.json && SS.store.adoptCloud(res.json)) {
          SS.ui.toast({ ico: '☁️', title: 'ОБЛАКО', text: 'Прогресс загружен из Telegram', info: true });
          if (SS.game.state === 'idle') SS.ui.renderMenu();
        } else if (SS.tg.cloudAvailable()) SS.store.scheduleCloud();
      });
      prog(1, 'Готово');
      main._last = performance.now();
      requestAnimationFrame(frame);
      SS.ui.toMenu();
      // заставка при запуске (в режиме разработчика — только с ?intro=1, чтобы не мешать тестам),
      // сообщения после обновления — когда она закончится
      const introOn = s.settings.intro && (!SS.DEV || /[?&]intro=1/.test(location.search));
      if (introOn) SS.intro.play(() => setTimeout(showNotes, 500));
      else setTimeout(showNotes, 900);
      SS.meta.checkAchievements();
      const boot = document.getElementById('boot');
      boot.classList.add('out');
      setTimeout(() => boot.remove(), 600);
    } catch (e) {
      console.error(e);
      bootTxt.textContent = 'Ошибка запуска: ' + (e && e.message ? e.message : e);
    }
  }

  function showNotes() {
    const s = SS.store.s;
    if (!s.notes || !s.notes.length) return;
    const notes = s.notes.splice(0);
    SS.store.save();
    const refund = notes.find((n) => n.type === 'refund'), v30 = notes.find((n) => n.type === 'v30');
    if (notes.find((n) => n.type === 'v40')) {
      SS.ui.dialog({
        ico: 'star', title: 'ОБНОВЛЕНИЕ 4.0',
        text: 'Карта сектора: перед волной выбирайте путь — элита, торговец, ремонт, тайник или событие. 30 реликвий меняют правила забега.' +
          '\n\nДроны-напарники в Ангаре, режимы «Босс-раш» и «Выживание», сложность «Ад», новое древо навыков и три фазы у боссов.',
        ok: 'В БОЙ!', noCancel: true,
      });
    } else if (notes.find((n) => n.type === 'v31')) {
      SS.ui.dialog({
        ico: 'star', title: 'ОБНОВЛЕНИЕ 3.1',
        text: 'Новое древо навыков: 4 ветки, ранги и 8 активных навыков — Орбитальный удар, Турель, ЭМИ, Двойник и другие. Навыки, которых больше нет, сняты — очки вернулись, загляните в «Навыки».' +
          '\n\n10 новых врагов с защитой от оружия, у боссов по три фазы, у каждого сектора своя механика, модули видны на корабле.',
        ok: 'В БОЙ!', noCancel: true,
      });
    } else if (v30) {
      SS.ui.dialog({
        ico: 'star', title: 'ОБНОВЛЕНИЕ 3.0',
        text: 'Забег стал рогаликом: прокачка корабля теперь внутри забега — выбирайте модули корабля на старте и на станции после каждого босса.' +
          (v30.coins ? '\n\nМонеты за прежнюю прокачку корабля возвращены: +' + U.fmt(v30.coins) : '') +
          '\n\nСекторы со своими механиками, кат-сцены боссов, новое оружие «Серп», умные враги, «Боевая мощь» и честные сложности.',
        ok: 'В БОЙ!', noCancel: true,
      });
    } else if (notes.find((n) => n.type === 'v2')) {
      SS.ui.dialog({
        ico: 'star', title: 'SPACE SHOOTER 2.0',
        text: 'Новая графика, 13 боссов со своими атаками, 13 кораблей, 30 видов врагов и 5 мини-боссов, улучшения в каждом забеге, ежедневные задания и многое другое!' +
          (refund ? '\n\nПрокачка стала другой — все монеты за старые улучшения возвращены: +' + U.fmt(refund.coins) : '') +
          '\n\nРекорды, оружие, навыки и достижения сохранены.',
        ok: 'В БОЙ!', noCancel: true,
      });
    } else if (notes.find((n) => n.type === 'v25')) {
      SS.ui.dialog({
        ico: 'star', title: 'ОБНОВЛЕНИЕ 2.5',
        text: 'События волны: ионная буря, метеоритный дождь, солнечные вспышки и космический мусор иногда меняют правила на одну волну.' +
          '\n\nИспытание дня — особые правила для всех в выборе сложности и награда за 10-ю волну.' +
          '\n\nНовый враг Лансер с фиолетовыми лазерами, 4 шлейфа двигателя в ангаре, новые достижения и задания.',
        ok: 'В БОЙ!', noCancel: true,
      });
    } else if (notes.find((n) => n.type === 'v24')) {
      SS.ui.dialog({
        ico: 'star', title: 'ОБНОВЛЕНИЕ 2.4',
        text: 'Эволюции оружия: лазер с «Бронебоем 3» становится Лучом, ракеты с «Детонацией 3» — кассетными, молния с «Крио 2» — Ледяной цепью.' +
          '\n\nНовые перки «Стеклянная пушка» и «Рикошет», «Вампиризм» стал «Кровопийцей». Первый выбор улучшения — уже через несколько убийств.' +
          '\n\nНовые взрывы и эффекты, игра быстрее грузится и меньше греет телефон.',
        ok: 'В БОЙ!', noCancel: true,
      });
    } else if (notes.find((n) => n.type === 'v21')) {
      SS.ui.dialog({
        ico: 'star', title: 'ОБНОВЛЕНИЕ 2.1',
        text: '5 новых боссов: Кракен, Королева роя, Инквизитор, Хаос и Оверлорд. У Снайпера, Феникса, Дредноута и Некроманта свои корабли.' +
          '\n\n12 новых врагов, 2 новых мини-босса и 7 новых кораблей.' +
          '\n\nЖизней теперь одинаково на любой сложности. Сложность меняет врагов и награды: на «Кошмаре» монеты ×2,1, на «Боге войны» ×3.' +
          '\n\nАрсенал стал нагляднее, задания дня переехали на отдельный экран, а опыт корабля копится быстрее.',
        ok: 'В БОЙ!', noCancel: true,
      });
    }
  }

  // ── сервис-воркер (офлайн-режим и быстрая загрузка) ──
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
