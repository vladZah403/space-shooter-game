// ════════════════════════════════════════════════════════════════
// SPACE SHOOTER 4.1 — сцены узлов карты: анимации
//  Торговец (прилёт с торможением, огни, неоновая вывеска, грузы на орбите,
//  луч стыковки, реплика, отлёт), ремонт (сварка, наноботы), тайник
//  (падает, трясётся, лопается — монеты летят в кошелёк), элита (строй,
//  мигалки), события (обломки с искрами, маяк SOS, чёрный рынок, аномалия,
//  заброшенная станция, игральный автомат), сундук.
//  Плюс живой портрет торговца в окне лавки и актёры после сцены (отлёт).
//  Координаты — поля боя (game.draw переводит в них холст).
// ════════════════════════════════════════════════════════════════
'use strict';

(function () {
  const U = SS.util, D = SS.data, $ = U.$;
  let G, FX, A, game;

  const SC = { actors: [] };
  SS.scenes = SC;
  SC.init = function () { G = SS.gfx; FX = SS.fx; A = SS.audio; game = SS.game; };

  // реплики торговца
  const HELLO = ['Заходи, пилот!', 'Свежий товар!', 'Лучшие цены в секторе!', 'Для тебя — скидок нет', 'Только сегодня!', 'Всё с гарантией. Почти'];
  const BYE_BUY = ['Спасибо за покупку!', 'Отличный выбор!', 'Приходи ещё!'];
  const BYE = ['Не надумал? Бывает', 'Удачи в бою!', 'Ещё увидимся'];

  // ── мелкие помощники ──
  const flameC = {};
  // пламя двигателя: сопло сверху холста, язык вниз
  function flameSprite(c1, c2) {
    const key = c1 + c2;
    if (flameC[key]) return flameC[key];
    const w = 24, h = 72, c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.18, c1); g.addColorStop(0.55, G.hexA(c2, 0.7)); g.addColorStop(1, G.hexA(c2, 0));
    x.fillStyle = g;
    x.beginPath(); x.moveTo(w * 0.12, 0); x.quadraticCurveTo(w * 0.5, -4, w * 0.88, 0); x.quadraticCurveTo(w * 0.62, h * 0.55, w * 0.5, h); x.quadraticCurveTo(w * 0.38, h * 0.55, w * 0.12, 0); x.fill();
    return (flameC[key] = c);
  }
  // язык пламени из точки (x, y) по направлению ang (0 — вниз), длина len
  function flame(ctx, x, y, w, len, ang, c1, c2, t) {
    const fl = 0.8 + 0.2 * Math.sin(t * 40 + x) + Math.random() * 0.12;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang || 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.95;
    ctx.drawImage(flameSprite(c1 || '#9be8ff', c2 || '#3d7dff'), -w / 2, -len * 0.05, w, len * fl);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(G.glow(c1 || '#9be8ff', 64), -w * 1.3, -w * 0.9, w * 2.6, w * 2.6);
    ctx.restore();
  }
  function lamp(ctx, x, y, col, s, a) {
    if (a <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
    ctx.drawImage(G.glow(col, 32), x - s / 2, y - s / 2, s, s);
    ctx.restore();
  }
  function glow(ctx, x, y, r, col, a) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
    ctx.drawImage(G.soft(col, 64), x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }
  // реплика в облачке; a — прозрачность, side — хвостик слева (-1) или справа (1)
  function bubble(ctx, x, y, text, a, side) {
    if (a <= 0 || !text) return;
    const S = G.S;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = '700 ' + Math.round(13 * S) + 'px Rajdhani, sans-serif';
    const tw = ctx.measureText(text).width, pw = tw + 18 * S, ph = 26 * S, bx = Math.max(6 * S, Math.min(G.FW - pw - 6 * S, x - pw / 2)), by = y - ph;
    ctx.fillStyle = 'rgba(255,250,235,.96)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, pw, ph, 9 * S); else ctx.rect(bx, by, pw, ph);
    ctx.fill();
    const tx = U.clamp(x + (side || 0) * 14 * S, bx + 12 * S, bx + pw - 12 * S);
    ctx.beginPath(); ctx.moveTo(tx - 6 * S, by + ph - 1); ctx.lineTo(tx + 6 * S, by + ph - 1); ctx.lineTo(tx - (side || 0) * 4 * S, by + ph + 8 * S); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1b1430'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + pw / 2, by + ph / 2 + 1);
    ctx.restore();
  }
  // неоновая вывеска: включается с миганием (on — когда начать)
  function neon(ctx, x, y, text, col, t, on) {
    const lt = t - on;
    if (lt < 0) return;
    // первые 0,4 с — неуверенное мигание, потом ровный свет с лёгким гулом
    const vis = lt > 0.4 ? 0.9 + 0.1 * Math.sin(t * 50) : [0.05, 0.12, 0.2, 0.28, 0.36].some((q) => lt > q && lt < q + 0.05) ? 1 : 0.15;
    const S = G.S;
    ctx.save();
    ctx.font = '900 ' + Math.round(14 * S) + 'px Orbitron, Rajdhani, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;
    ctx.globalAlpha = 0.75; ctx.fillStyle = 'rgba(20,8,30,.85)'; ctx.strokeStyle = G.hexA(col, 0.5 * vis); ctx.lineWidth = 1.5 * S;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x - tw / 2 - 9 * S, y - 12 * S, tw + 18 * S, 24 * S, 6 * S); else ctx.rect(x - tw / 2 - 9 * S, y - 12 * S, tw + 18 * S, 24 * S);
    ctx.fill(); ctx.stroke();
    ctx.globalAlpha = vis; ctx.shadowColor = col; ctx.shadowBlur = 14 * S * vis; ctx.fillStyle = vis > 0.5 ? '#fff6d8' : G.hexA(col, 0.5);
    ctx.fillText(text, x, y + 1);
    ctx.restore();
  }
  const ease3 = (k) => 1 - Math.pow(1 - U.clamp(k, 0, 1), 3);
  function bounceOut(k) {
    const n = 7.5625, d = 2.75;
    k = U.clamp(k, 0, 1);
    if (k < 1 / d) return n * k * k;
    if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75;
    if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375;
    return n * (k -= 2.625 / d) * k + 0.984375;
  }

  // ── торговец целиком: свечение, огни, пламя, грузы на орбите; (x, y) — центр, w — ширина ──
  function merchant(ctx, x, y, w, t, o) {
    const S = G.S, h = w * G.aspect('p_merchant'), thrust = o.thrust || 0;
    glow(ctx, x, y, w * 0.95, '#ffc83d', 0.32 + 0.06 * Math.sin(t * 3));
    // грузы на орбите: дальняя половина — за корпусом
    const items = o.cargo ? 7 : 0, orb = (front) => {
      for (let i = 0; i < items; i++) {
        const a = t * 0.9 + i * U.TAU / items, z = Math.sin(a);
        if ((z > 0) !== front) continue;
        const ox = x + Math.cos(a) * w * 0.78, oy = y + h * 0.05 + z * h * 0.18, sc = 0.75 + 0.25 * z;
        ctx.globalAlpha = (0.55 + 0.45 * (z + 1) / 2) * o.cargo;
        if (i % 3 === 0) G.draw(ctx, 'p_crate', ox, oy, 20 * S * sc, a);
        else ctx.drawImage(G.proc('coin'), ox - 8 * S * sc, oy - 8 * S * sc, 16 * S * sc, 16 * S * sc);
        ctx.globalAlpha = 1;
      }
    };
    orb(false);
    // двигатель: при торможении — длинный язык
    flame(ctx, x, y + h * 0.44, w * 0.16, w * (0.25 + thrust * 0.75), 0, '#9be8ff', '#3d7dff', t);
    if (o.tilt) { ctx.save(); ctx.translate(x, y); ctx.rotate(o.tilt); G.draw(ctx, 'p_merchant', 0, 0, w); ctx.restore(); }
    else G.draw(ctx, 'p_merchant', x, y, w);
    // антенны мигают по очереди, боковые фонари — медленно
    lamp(ctx, x - w * 0.22, y - h * 0.49, '#ff4d3d', 14 * S, Math.sin(t * 6) > 0 ? 1 : 0.15);
    lamp(ctx, x + w * 0.26, y - h * 0.49, '#ff4d3d', 14 * S, Math.sin(t * 6) > 0 ? 0.15 : 1);
    lamp(ctx, x - w * 0.47, y - h * 0.04, '#ffc83d', 18 * S, 0.45 + 0.4 * Math.sin(t * 2.2));
    lamp(ctx, x + w * 0.47, y - h * 0.04, '#ffc83d', 18 * S, 0.45 + 0.4 * Math.sin(t * 2.2 + 1.5));
    // огоньки витрины
    for (let i = 0; i < 5; i++) lamp(ctx, x + (i - 2) * w * 0.14, y - h * 0.02, ['#ff5c7a', '#3de0ff', '#ffc83d', '#3dffa2', '#b06bff'][i], 8 * S, Math.sin(t * 5 + i * 1.3) > 0.2 ? 0.9 : 0.2);
    orb(true);
    if (o.sign) neon(ctx, x, y - h * 0.62, 'ЛАВКА', '#ffc83d', t, o.sign);
  }

  // 4.2: эскорт рисует того же Торговца прямо в бою (map.js)
  SC.merchant = merchant;

  // ════════════════════════════════════════════════════════════
  // СЦЕНЫ УЗЛОВ
  // ════════════════════════════════════════════════════════════
  SC.update = function (sc) {
    const p = game.player, S = G.S, t = sc.t, cx = G.FW / 2;
    // в эскорте Торговец встаёт посередине — подпись выше него
    if (!sc.card && t >= sc.cardT) sc.card = { cap: sc.v.cap, name: sc.v.name, sub: sc.v.sub, at: t, y: sc.node === 'escort' ? 0.4 : 0.58 };
    if (sc.node === 'shop') {
      if (!sc.hello) sc.hello = U.pick(HELLO);
      if (!sc.braked && t > 0.5) { sc.braked = true; A.play('teleport', { rate: 0.6, vol: 0.35 }); FX.shake(0.08); }
      if (!sc.docked && t > 1.15) { sc.docked = true; A.play('coin', { rate: 0.9, vol: 0.5 }); }
    } else if (sc.node === 'repair') {
      // сварка: искры по корпусу, «+» поднимаются
      if (t > 0.9 && t < 2.0 && Math.random() < 0.35) FX.sparks(p.x + U.rand(-0.35, 0.35) * p.w, p.y + U.rand(-0.3, 0.3) * p.w, Math.random() < 0.5 ? '#ffe9a0' : '#3dffa2', 3, 160, 0.3);
      if (t > 1.0 && t < 2.0 && Math.random() < 0.06) FX.text(p.x + U.rand(-0.4, 0.4) * p.w, p.y - p.w * 0.4, '+', '#3dffa2', 18, 0.7, -70);
      if (!sc.done && t >= 1.5) { sc.done = true; FX.ring(p.x, p.y, p.w * 0.3, p.w * 1.6, '#3dffa2', 0.5, 4); FX.sparks(p.x, p.y, '#3dffa2', 14, 200); A.play('powerup', { vol: 0.6 }); }
    } else if (sc.node === 'cache') {
      const y = G.H * 0.42;
      if (!sc.landed && t >= 0.7) { sc.landed = true; FX.ring(cx, y + 26 * S, 8 * S, 80 * S, '#b06bff', 0.4, 3); FX.smoke(cx, y + 26 * S, 5, 26 * S); A.play('mine', { rate: 0.7, vol: 0.4 }); FX.shake(0.1); }
      if (!sc.done && t >= 1.5) {
        sc.done = true;
        FX.explode(cx, y, 1, '#ffc83d'); FX.ring(cx, y, 10 * S, 90 * S, '#ffc83d', 0.4, 4);
        FX.debris(cx, y, '#8a6a3a', 8, 260);
        // монеты летят в кошелёк (вверх вправо)
        sc.coins = [];
        for (let i = 0; i < 14; i++) sc.coins.push({ a: U.rand(-Math.PI, 0), v: U.rand(80, 200) * S, d: U.rand(0, 0.25) });
        A.play('coin', { rate: 0.8 });
      }
    } else if (sc.node === 'elite') {
      if (!sc.done && t >= 1.5) { sc.done = true; FX.vignette('#ff2a48', 1.2, 0.6, true); }
      if (Math.random() < 0.1) FX.shake(0.05);
    } else if (sc.node === 'event') {
      const id = sc.ev.id, y = G.H * 0.36;
      if ((id === 'wreck' || id === 'distress') && Math.random() < 0.12) FX.sparks(cx + U.rand(-40, 40) * S, y + U.rand(-25, 25) * S, '#ffd27a', 4, 140, 0.35);
      if ((id === 'wreck' || id === 'station') && Math.random() < 0.05) FX.smoke(cx + U.rand(-30, 30) * S, y + U.rand(-20, 20) * S, 1, 18 * S);
      if (id === 'slot' && !sc.spun && t > 0.9) { sc.spun = true; A.play('coin', { rate: 1.4, vol: 0.4 }); }
      if (id === 'anomaly' && Math.random() < 0.5) {
        // частицы затягивает в воронку
        const a = Math.random() * U.TAU, r = U.rand(90, 150) * S;
        (sc.suck || (sc.suck = [])).push({ a, r, r0: r, t: 0 });
      }
    } else if (sc.node === 'chest') {
      const col = D.CHESTS[sc.tier].color, cy = G.H * 0.36;
      if (!sc.landed && t >= 0.6) {
        sc.landed = true;
        FX.ring(cx, cy + 20 * S, 10 * S, 110 * S, col, 0.45, 4);
        FX.sparks(cx, cy + 24 * S, col, 16, 260);
        FX.shake(0.18);
        A.play('mine', { rate: 0.6, vol: 0.45 });
      }
      if (sc.landed && t < 1.6 && Math.random() < 0.25) FX.sparks(cx + U.rand(-40, 40) * S, cy + U.rand(-30, 20) * S, col, 1, 60);
      if (!sc.gone && t >= 1.6) { sc.gone = true; A.play('coin', { rate: 0.7, vol: 0.7 }); }
    }
  };

  SC.draw = function (ctx, sc) {
    const S = G.S, t = sc.t, p = game.player, cx = G.FW / 2;
    ctx.save();
    if (sc.node === 'shop') {
      // прилёт сверху с торможением: длинное пламя, потом зависание
      const k = U.clamp(t / 1.0, 0, 1), y = U.lerp(-140 * S, G.H * 0.33, ease3(k)) + (k >= 1 ? Math.sin(t * 2) * 4 * S : 0);
      const w = 130 * S, thrust = t < 1.0 ? 1 - ease3(k) * 0.6 : 0.15;
      // луч стыковки к кораблю
      if (t > 1.15) {
        const a = Math.min(1, (t - 1.15) / 0.3) * (0.28 + 0.06 * Math.sin(t * 9)), top = y + w * 0.62, pw = p.w * 0.7;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
        const g = ctx.createLinearGradient(0, top, 0, p.y);
        g.addColorStop(0, 'rgba(255,200,61,.9)'); g.addColorStop(1, 'rgba(255,200,61,.1)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cx - w * 0.1, top); ctx.lineTo(cx + w * 0.1, top); ctx.lineTo(p.x + pw, p.y - p.w * 0.2); ctx.lineTo(p.x - pw, p.y - p.w * 0.2); ctx.closePath(); ctx.fill();
        // искорки бегут по лучу
        for (let i = 0; i < 6; i++) { const q = (t * 0.8 + i / 6) % 1; lamp(ctx, U.lerp(cx, p.x, q) + Math.sin(q * 20 + i) * pw * 0.4 * q, U.lerp(top, p.y - p.w * 0.2, q), '#fff1a6', 9 * S, a * 2.2); }
        ctx.restore();
      }
      merchant(ctx, cx, y, w, t, { thrust, cargo: U.clamp((t - 1.0) / 0.4, 0, 1), sign: 0.95 });
      bubble(ctx, cx + w * 0.42, y - w * G.aspect('p_merchant') * 0.76, sc.hello, U.clamp((t - 1.2) / 0.2, 0, 1), -1);
    } else if (sc.node === 'repair') {
      const k = U.clamp(t / 0.9, 0, 1), leave = U.clamp((t - 1.95) / 0.45, 0, 1);
      const y = U.lerp(-100 * S, p.y - p.w * 1.6, ease3(k)) + Math.sin(t * 3) * 3 * S - leave * leave * 260 * S, w = 64 * S;
      // медкорабль смотрит вниз: двигатели сверху
      flame(ctx, cx, y - w * 0.55, w * 0.22, w * (0.35 + (1 - k) * 0.8 + leave * 1.2), Math.PI, '#9be8ff', '#3d7dff', t);
      glow(ctx, cx, y, w * 0.9, '#3dffa2', 0.25);
      G.draw(ctx, 'p_medship', cx, y, w, Math.PI);
      lamp(ctx, cx, y + w * 0.1, '#ff3d5a', 12 * S, Math.sin(t * 8) > 0 ? 1 : 0.2);
      if (t > 0.9 && leave < 1) {
        // ремонтный луч и наноботы по спирали вокруг корабля
        const a = (1 - leave) * (0.45 + 0.25 * Math.sin(t * 18));
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
        const g = ctx.createLinearGradient(0, y + w * 0.5, 0, p.y);
        g.addColorStop(0, 'rgba(61,255,162,.85)'); g.addColorStop(1, 'rgba(61,255,162,.15)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cx - 5 * S, y + w * 0.5); ctx.lineTo(cx + 5 * S, y + w * 0.5); ctx.lineTo(p.x + p.w * 0.5, p.y); ctx.lineTo(p.x - p.w * 0.5, p.y); ctx.closePath(); ctx.fill();
        ctx.restore();
        for (let i = 0; i < 10; i++) { const q = t * 3 + i * U.TAU / 10, r = p.w * (0.55 + 0.15 * Math.sin(t * 4 + i)); lamp(ctx, p.x + Math.cos(q) * r, p.y + Math.sin(q) * r * 0.6, '#3dffa2', 8 * S, (1 - leave) * 0.9); }
      }
    } else if (sc.node === 'cache') {
      const y0 = G.H * 0.42, y = U.lerp(-70 * S, y0, bounceOut(t / 0.7));
      // перед вскрытием — трясётся всё сильнее, из щелей свет
      const rattle = t > 0.8 && t < 1.5 ? (t - 0.8) / 0.7 : 0, sx = rattle ? Math.sin(t * 60) * 4 * S * rattle : 0;
      glow(ctx, cx, y, 70 * S, '#ffc83d', 0.3 + rattle * 0.5 + 0.1 * Math.sin(t * 8));
      if (!sc.done) {
        ctx.globalAlpha = 1;
        G.draw(ctx, 'p_crate', cx + sx, y, 66 * S, t < 0.7 ? t * 4 : Math.sin(t * 50) * 0.06 * rattle);
        if (rattle > 0.3) lamp(ctx, cx + sx, y - 6 * S, '#fff1a6', 60 * S * rattle, rattle);
      }
      // монеты дугой в кошелёк
      if (sc.coins) {
        const lt = t - 1.5, hx = G.FW - 40 * S, hy = 20 * S;
        for (const c of sc.coins) {
          const q = U.clamp((lt - c.d) / 0.75, 0, 1);
          if (q <= 0 || q >= 1) continue;
          const bx = cx + Math.cos(c.a) * c.v * 0.6, by = y0 + Math.sin(c.a) * c.v * 0.6;
          const x = U.lerp(U.lerp(cx, bx, Math.min(1, q * 3)), hx, q * q), yy = U.lerp(U.lerp(y0, by, Math.min(1, q * 3)), hy, q * q);
          ctx.globalAlpha = 1 - q * 0.3;
          ctx.drawImage(G.proc('coin'), x - 8 * S, yy - 8 * S, 16 * S, 16 * S);
        }
        ctx.globalAlpha = 1;
      }
    } else if (sc.node === 'escort') {
      // 4.2: Торговец поднимается снизу на позицию, откуда пойдёт под охраной (map.js — ESCORT)
      const k = U.clamp(t / 1.3, 0, 1);
      merchant(ctx, cx, U.lerp(G.H + 90 * S, G.H * 0.66, ease3(k)), 84 * S, t, { thrust: 1 - ease3(k) * 0.65 });
    } else if (sc.node === 'elite') {
      // мигалки тревоги из верхних углов
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const s of [-1, 1]) {
        const a0 = Math.PI / 2 + s * (0.5 + 0.45 * Math.sin(t * 5 + (s > 0 ? Math.PI : 0)));
        const ox = s < 0 ? 0 : G.FW, L = G.H * 0.7;
        const g = ctx.createRadialGradient(ox, 0, 0, ox, 0, L);
        g.addColorStop(0, 'rgba(255,40,70,.35)'); g.addColorStop(1, 'rgba(255,40,70,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(ox, 0); ctx.arc(ox, 0, L, a0 - 0.18, a0 + 0.18); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      const k = ease3(t / 0.9);
      for (let i = 0; i < 3; i++) {
        const x = cx + (i - 1) * 80 * S, y = U.lerp(-80 * S, G.H * 0.22, k) - Math.abs(i - 1) * 30 * S + Math.sin(t * 2.4 + i) * 3 * S, w = 58 * S;
        flame(ctx, x - w * 0.18, y - w * 0.42, w * 0.16, w * (0.35 + (1 - k) * 0.6), Math.PI, '#ffb36b', '#ff3d5a', t);
        flame(ctx, x + w * 0.18, y - w * 0.42, w * 0.16, w * (0.35 + (1 - k) * 0.6), Math.PI, '#ffb36b', '#ff3d5a', t);
        glow(ctx, x, y, 40 * S, '#ff3d5a', 0.45);
        G.draw(ctx, 'e_heavyfighter', x, y, w, Math.PI);
        lamp(ctx, x, y + w * 0.2, '#ff2a48', 10 * S, Math.sin(t * 10 + i * 2) > 0 ? 1 : 0.2);
      }
    } else if (sc.node === 'chest') {
      drawChestScene(ctx, sc);
    } else if (sc.node === 'event') {
      drawEvent(ctx, sc);
    }
    ctx.restore();
  };

  function drawChestScene(ctx, sc) {
    const S = G.S, t = sc.t, cx = G.FW / 2, col = D.CHESTS[sc.tier].color;
    let x = cx, y = U.lerp(-90 * S, G.H * 0.36, bounceOut(t / 0.6)), w = 96 * S, a = 1;
    // улетает в трюм — к счётчику сундуков вверху справа
    if (t > 1.6) { const q = U.clamp((t - 1.6) / 0.55, 0, 1), e = q * q; x = U.lerp(cx, G.FW - 34 * S, e); y = U.lerp(G.H * 0.36, 34 * S, e); w *= 1 - 0.75 * e; a = 1 - q * 0.7; }
    ctx.globalCompositeOperation = 'lighter';
    SS.map.rays(ctx, x, y, w * 1.7, col, t, 0.3 * a * Math.min(1, t * 2));
    ctx.globalAlpha = 0.5 * a; ctx.drawImage(G.soft(col, 64), x - w, y - w, w * 2, w * 2);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
    // крышка подпрыгивает рывками — сундук «просится» открыться
    const jolt = t > 0.75 && t < 1.55 && Math.sin(t * 9) > 0.2 ? Math.abs(Math.sin(t * 40)) : 0;
    const m = G.drawChest(ctx, sc.tier, x + (jolt ? (Math.random() - 0.5) * 3 * S : 0), y, w, 0, jolt);
    if (jolt > 0.1) lamp(ctx, x, m.mouth, col, w * 1.1, jolt * 0.9 * a);
    ctx.globalAlpha = 1;
  }

  function drawEvent(ctx, sc) {
    const S = G.S, t = sc.t, cx = G.FW / 2, id = sc.ev.id, y = G.H * 0.36 + Math.sin(t * 1.5) * 4 * S, a = Math.min(1, t * 2);
    ctx.globalAlpha = a;
    if (id === 'anomaly') {
      // воронка, сжимающиеся кольца и затягиваемые частицы
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) { const q = 1 - ((t * 0.6 + i / 4) % 1); ctx.globalAlpha = a * (1 - q) * 0.6; ctx.strokeStyle = '#b06bff'; ctx.lineWidth = 2 * S; ctx.beginPath(); ctx.ellipse(cx, y, 150 * S * q, 90 * S * q, t * 0.3, 0, U.TAU); ctx.stroke(); }
      ctx.globalAlpha = a; G.draw(ctx, 'fx_vortex', cx, y, 180 * S, t * 2);
      for (const p of sc.suck || []) {
        p.t += 1 / 60; p.r = p.r0 * (1 - p.t / 1.1); p.a += 0.08;
        if (p.r > 4) lamp(ctx, cx + Math.cos(p.a) * p.r, y + Math.sin(p.a) * p.r * 0.6, '#d0a8ff', 8 * S, a * 0.9);
      }
      if (sc.suck) sc.suck = sc.suck.filter((p) => p.t < 1.1);
      ctx.restore();
    } else if (id === 'wreck' || id === 'distress') {
      const x = cx + Math.sin(t * 0.7) * 10 * S, rot = 2.4 + t * 0.15, w = 110 * S;
      G.draw(ctx, 'e_cargo', x, y, w, rot);
      // повреждённые огни мигают вразнобой
      for (let i = 0; i < 4; i++) { const q = rot + i * 1.7, r = w * 0.28; lamp(ctx, x + Math.cos(q) * r, y + Math.sin(q) * r, i % 2 ? '#ffd27a' : '#7fe7ff', 12 * S, Math.random() < 0.4 ? 0.9 : 0.1); }
      if (id === 'distress') {
        // маяк SOS: вспышка и расходящиеся кольца сигнала
        const on = (t % 1) < 0.18 || ((t % 1) > 0.3 && (t % 1) < 0.48);
        lamp(ctx, x, y - w * 0.15, '#ff3d5a', 70 * S, on ? 1 : 0.15);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) { const q = (t * 0.7 + i / 3) % 1; ctx.globalAlpha = a * (1 - q) * 0.7; ctx.strokeStyle = '#ff5c7a'; ctx.lineWidth = 2.5 * S; ctx.beginPath(); ctx.arc(x, y - w * 0.15, 20 * S + q * 120 * S, 0, U.TAU); ctx.stroke(); }
        ctx.restore();
        ctx.save(); ctx.globalAlpha = a * (on ? 1 : 0.4); ctx.font = '900 ' + Math.round(16 * S) + 'px Orbitron, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#ff5c7a'; ctx.shadowColor = '#ff3d5a'; ctx.shadowBlur = 12 * S; ctx.fillText('SOS', x, y - w * 0.62); ctx.restore();
      }
    } else if (id === 'black') {
      // тёмная аура, красные огни, голограмма знака вопроса
      glow(ctx, cx, y, 120 * S, '#6a1030', 0.5 + 0.15 * Math.sin(t * 3));
      flame(ctx, cx, y + 48 * S, 12 * S, 30 * S, 0, '#ff9fb0', '#b0204a', t);
      G.draw(ctx, 'p_merchant_s', cx, y, 100 * S);
      lamp(ctx, cx - 34 * S, y - 40 * S, '#ff2a48', 14 * S, Math.sin(t * 7) > 0.3 ? 1 : 0.15);
      lamp(ctx, cx + 34 * S, y - 40 * S, '#b06bff', 14 * S, Math.sin(t * 7 + 2) > 0.3 ? 1 : 0.15);
      ctx.save(); ctx.globalAlpha = a * (0.55 + 0.35 * Math.sin(t * 20) * (Math.random() < 0.9 ? 1 : 0)); ctx.font = '900 ' + Math.round(26 * S) + 'px Orbitron, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ff7ab0'; ctx.shadowColor = '#ff2a7a'; ctx.shadowBlur = 16 * S; ctx.fillText('$?', cx - 66 * S, y - 50 * S); ctx.restore();
      bubble(ctx, cx + 62 * S, y - 66 * S, 'Тсс… есть товар', U.clamp((t - 0.8) / 0.2, 0, 1), -1);
    } else if (id === 'station') {
      // заброшенная станция: тёмная, огни еле живы, вокруг плавают обломки
      const dark = G.tinted('p_merchant', { sat: -0.9, dark: 0.45 });
      ctx.save(); ctx.translate(cx, y); ctx.rotate(0.3 + Math.sin(t * 0.4) * 0.05);
      if (dark) G.drawCanvas(ctx, dark, 0, 0, 140 * S); else G.draw(ctx, 'p_merchant', 0, 0, 140 * S);
      ctx.restore();
      lamp(ctx, cx - 30 * S, y - 30 * S, '#3dffa2', 12 * S, Math.random() < 0.08 ? 1 : 0.15);
      lamp(ctx, cx + 40 * S, y + 10 * S, '#ffc83d', 10 * S, Math.random() < 0.05 ? 1 : 0.1);
      for (let i = 0; i < 5; i++) { const q = t * 0.3 + i * 1.3, r = (90 + i * 8) * S; G.draw(ctx, i % 2 ? 'ast_m1' : 'ast_m2', cx + Math.cos(q) * r, y + Math.sin(q) * r * 0.45, (14 + i * 2) * S, q * 2); }
    } else if (id === 'slot') {
      drawSlot(ctx, cx, y, t, a);
    } else {
      ctx.font = Math.round(80 * S) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(sc.ev.ico, cx, y);
    }
    ctx.globalAlpha = 1;
  }

  // игральный автомат: корпус, бегущие огни, три барабана крутятся и встают
  function drawSlot(ctx, x, y, t, a) {
    const S = G.S, w = 130 * S, h = 150 * S, L = x - w / 2, T = y - h / 2;
    ctx.save();
    ctx.globalAlpha = a;
    glow(ctx, x, y, w, '#ff5cf0', 0.3);
    const rr = (px, py, pw, ph, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(px, py, pw, ph, r); else ctx.rect(px, py, pw, ph); };
    let g = ctx.createLinearGradient(0, T, 0, T + h);
    g.addColorStop(0, '#5a1f7a'); g.addColorStop(1, '#2a0c3d');
    ctx.fillStyle = g; rr(L, T + 18 * S, w, h - 18 * S, 14 * S); ctx.fill();
    ctx.lineWidth = 4 * S; ctx.strokeStyle = '#ffc83d'; ctx.stroke();
    // купол с надписью
    ctx.fillStyle = '#ff3d8b'; rr(L + 14 * S, T, w - 28 * S, 30 * S, 12 * S); ctx.fill();
    ctx.font = '900 ' + Math.round(12 * S) + 'px Orbitron, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.shadowColor = '#ffc83d'; ctx.shadowBlur = 8 * S; ctx.fillText('ДЖЕКПОТ', x, T + 15 * S); ctx.shadowBlur = 0;
    // бегущие огни по периметру
    for (let i = 0; i < 14; i++) {
      const q = i / 14, px = q < 0.5 ? L + 6 * S + q * 2 * (w - 12 * S) : L + w - 6 * S - (q - 0.5) * 2 * (w - 12 * S), py = q < 0.5 ? T + 26 * S : T + h - 6 * S;
      lamp(ctx, px, py, i % 2 ? '#ffc83d' : '#3de0ff', 10 * S, Math.floor(t * 10 + i) % 3 === 0 ? 1 : 0.2);
    }
    // окно барабанов
    const wx = L + 14 * S, wy = T + 46 * S, ww = w - 28 * S, wh = 54 * S, cw = ww / 3;
    ctx.fillStyle = '#f4f0ff'; rr(wx, wy, ww, wh, 8 * S); ctx.fill();
    const SYM = ['7', '★', '$', '♦', '7'], COL = ['#ff3d5a', '#ffc83d', '#3dffa2', '#3de0ff', '#ff3d5a'];
    ctx.save(); rr(wx, wy, ww, wh, 8 * S); ctx.clip();
    for (let i = 0; i < 3; i++) {
      // барабан i встаёт в момент 1,0 + 0,25·i
      const stopT = 1.0 + i * 0.25, spin = t < stopT, off = spin ? (t * 9 + i * 0.37) % 1 : 0, base = spin ? Math.floor(t * 9 + i) : 0;
      for (let j = -1; j <= 1; j++) {
        const k = (base + j + 10) % SYM.length, sy = wy + wh / 2 + (j + off) * wh * 0.62, kk = spin ? k : (j === 0 ? [0, 0, 1][i] : (i + j + 5) % 4);
        ctx.font = '900 ' + Math.round(26 * S) + 'px Orbitron, sans-serif'; ctx.fillStyle = COL[kk];
        ctx.globalAlpha = a * (spin ? 0.75 : 1);
        // встают «почти джекпотом»: 7, 7 и звезда — дразнит сыграть
        ctx.fillText(SYM[spin ? k : (j === 0 ? [0, 0, 1][i] : (i + j + 5) % 4)], wx + cw * (i + 0.5), sy);
      }
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2 * S;
    for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(wx + cw * i, wy); ctx.lineTo(wx + cw * i, wy + wh); ctx.stroke(); }
    // рычаг
    const pull = t > 0.6 && t < 1.0 ? Math.sin((t - 0.6) / 0.4 * Math.PI) : 0;
    ctx.strokeStyle = '#c9d4ea'; ctx.lineWidth = 5 * S; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(L + w, T + 60 * S); ctx.lineTo(L + w + 16 * S, T + 60 * S - (30 - pull * 50) * S); ctx.stroke();
    ctx.fillStyle = '#ff3d5a'; ctx.beginPath(); ctx.arc(L + w + 16 * S, T + 60 * S - (30 - pull * 50) * S, 7 * S, 0, U.TAU); ctx.fill();
    // лоток с монетами
    ctx.fillStyle = '#1a0828'; rr(L + 24 * S, T + h - 34 * S, w - 48 * S, 18 * S, 6 * S); ctx.fill();
    ctx.restore();
  }

  // ════════════════════════════════════════════════════════════
  // АКТЁРЫ ПОСЛЕ СЦЕНЫ: торговец улетает, пока начинается волна
  // ════════════════════════════════════════════════════════════
  SC.leave = function (kind, bought) {
    if (kind !== 'merchant') return;
    SC.actors.push({ kind, t: 0, y0: G.H * 0.33, say: U.pick(bought ? BYE_BUY : BYE) });
  };
  // время актёров идёт вместе с игрой (game.update): на паузе и в окнах выбора они замирают
  SC.tick = function (dt) { for (const a of SC.actors) a.t += dt; };
  SC.drawActors = function (ctx) {
    if (!SC.actors.length) return;
    if (!game.run || game.state === 'idle' || game.state === 'over') { SC.actors.length = 0; return; }
    const S = G.S;
    for (const a of SC.actors) {
      if (a.kind === 'merchant') {
        // пауза-реплика, кивок, потом форсаж вверх
        const go = U.clamp((a.t - 0.55) / 0.9, 0, 1), y = a.y0 - go * go * (G.H * 0.33 + 220 * S), tilt = a.t < 0.55 ? Math.sin(a.t * 14) * 0.04 : 0;
        ctx.save();
        ctx.globalAlpha = Math.min(1, 1.6 - a.t);
        merchant(ctx, G.FW / 2, y, 130 * S * (1 - go * 0.25), a.t + 3, { thrust: go > 0 ? 1.2 : 0.2, cargo: 0, tilt });
        ctx.restore();
        bubble(ctx, G.FW / 2 + 55 * S, y - 95 * S, a.say, U.clamp(1 - (a.t - 0.9) / 0.25, 0, 1), -1);
        if (go > 0 && !a.boom) { a.boom = true; A.play('teleport', { rate: 1.4, vol: 0.4 }); }
      }
    }
    SC.actors = SC.actors.filter((a) => a.t < 1.6);
  };

  // ════════════════════════════════════════════════════════════
  // ЖИВОЙ ПОРТРЕТ ТОРГОВЦА В ОКНЕ ЛАВКИ
  // ════════════════════════════════════════════════════════════
  let pRaf = 0;
  SC.portrait = function (cv, on) {
    cancelAnimationFrame(pRaf); pRaf = 0;
    const say = $('#perkSay');
    if (say) { say.hidden = !on; }
    if (!on) return;
    const H = 110, W = 200, dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    cv.hidden = false;
    const x = cv.getContext('2d'), t0 = performance.now();
    // реплика печатается по буквам
    const phrase = U.pick(HELLO);
    if (say) { say.textContent = ''; say.classList.remove('pop'); void say.offsetWidth; say.classList.add('pop'); }
    const loop = () => {
      const scr = $('#scr-perk');
      // окно показывают чуть позже первого кадра — даём ему полсекунды
      if (cv.hidden || (!scr.classList.contains('show') && performance.now() - t0 > 500)) { pRaf = 0; return; }
      pRaf = requestAnimationFrame(loop);
      const t = (performance.now() - t0) / 1000;
      if (say) { const n = Math.min(phrase.length, Math.floor(t * 28)); if (say.textContent.length !== n) say.textContent = phrase.slice(0, n); }
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.clearRect(0, 0, W, H);
      const S0 = G.S;
      G.S = 0.62;   // портрет мельче поля: помощники берут масштаб из G.S
      merchant(x, W / 2, H * 0.5 + Math.sin(t * 2) * 3, 74, t, { thrust: 0.15, cargo: 1 });
      G.S = S0;
    };
    loop();
  };
})();
