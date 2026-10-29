// ════════════════════════════════════════════════════════════════
// SPACE SHOOTER 4.0 — дрон-напарник
//  Один дрон в бою (выбор и прокачка — вкладка «Дроны» в Ангаре):
//  Стрелок, Санитар, Сборщик, Страж, Подрывник. Уровень 1–5 усиливает
//  его умение. Данные — D.COMPANIONS, сохранение — store.s.comp.
// ════════════════════════════════════════════════════════════════
'use strict';

(function () {
  const U = SS.util, D = SS.data;
  let G, FX, A, M, game;

  const C = {
    d: null,   // { id, lv, x, y, cd, a, flash }
    init() { G = SS.gfx; FX = SS.fx; A = SS.audio; M = SS.meta; game = SS.game; },
  };
  SS.comp = C;

  // на старте забега — выбранный в Ангаре дрон
  C.start = function () {
    const s = M.s.comp, id = s && s.sel, p = game.player;
    C.d = id && D.COMPANIONS[id] && s.owned.includes(id) ? { id, lv: Math.max(1, s.lv[id] || 1), x: p.x, y: p.y + p.w, cd: 2, a: 0, flash: 0 } : null;
  };
  C.has = function (id) { return !!(C.d && C.d.id === id); };
  C.lv = function () { return C.d ? C.d.lv : 0; };

  C.update = function (dt) {
    const d = C.d, p = game.player, S = G.S;
    if (!d || !p) return;
    const def = D.COMPANIONS[d.id], k = d.lv - 1;
    d.a += dt * (d.id === 'guard' ? 3 : 1.4);
    // Страж кружит вокруг корабля, остальные держатся слева-сзади
    const tx = d.id === 'guard' ? p.x + Math.cos(d.a) * p.w * 0.95 : p.x - p.w * 0.95, ty = d.id === 'guard' ? p.y + Math.sin(d.a) * p.w * 0.75 : p.y + p.w * 0.35 + Math.sin(d.a * 2) * 5 * S;
    d.x = U.damp(d.x, tx, d.id === 'guard' ? 20 : 7, dt);
    d.y = U.damp(d.y, ty, d.id === 'guard' ? 20 : 7, dt);
    d.flash -= dt;
    if (!p.alive || game.state !== 'play') return;
    d.cd -= dt;
    if (d.id === 'gunner' && d.cd <= 0) {
      let tgt = null, bd = 460 * S;
      for (const e of game.enemies) { if (!e.alive || !e.hittable || e.y > d.y || SS.foes.hidden(e)) continue; const dd = Math.hypot(e.x - d.x, e.y - d.y); if (dd < bd) { bd = dd; tgt = e; } }
      if (tgt) {
        d.cd = def.cd[k] / game.rateMul();
        const a = Math.atan2(tgt.y - d.y, tgt.x - d.x), sp = 900 * S;
        game.spawnShot({ x: d.x, y: d.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg: def.dmg[k] * game.dmgMul(), r: 4 * S, kind: 'drone', sprite: 'pb_bolt_s', w: 11 * S, wid: 'comp', life: 1.2 });
        d.flash = 0.06;
      }
    } else if (d.id === 'medic' && d.cd <= 0) {
      d.cd = def.cd[k];
      if (p.lives < p.maxLives) game.heal(1, '💚 САНИТАР');
      else if (!p.shield) { p.shield = true; game.shieldFx(); }
      FX.lightning(d.x, d.y, p.x, p.y, '#5cff9d', 2 * S, 0.3);
    } else if (d.id === 'bomber' && d.cd <= 0) {
      let tgt = null, bh = -1;
      for (const e of game.enemies) if (e.alive && e.hittable && e.y > 30 * S && !e.def.prop && e.hp > bh) { bh = e.hp; tgt = e; }
      if (tgt) {
        d.cd = def.cd[k];
        game.spawnShot({ x: d.x, y: d.y, vx: 0, vy: -200 * S, dmg: def.dmg[k] * game.dmgMul() * (1 + game.wave.n * 0.05), aoe: def.dmg[k] * game.dmgMul() * (1 + game.wave.n * 0.05), aoeR: 70 * S,
          r: 8 * S, kind: 'rocket', sprite: 'fx_rocket2', w: 15 * S, homing: 5, acc: 700 * S, maxSpd: 520 * S, wid: 'comp', life: 3 });
        A.play('rocket', { rate: 1.3, vol: 0.5 });
      }
    }
  };

  // Страж ловит вражеские пули (из game.updateEBullets); перезарядка между блоками
  C.block = function (b) {
    const d = C.d;
    if (!d || d.id !== 'guard' || d.cd > 0 || Math.hypot(b.x - d.x, b.y - d.y) > 16 * G.S + b.r) return false;
    d.cd = D.COMPANIONS.guard.cd[d.lv - 1];
    d.flash = 0.15;
    FX.ring(d.x, d.y, 4 * G.S, 22 * G.S, '#7fd8ff', 0.25, 3);
    A.play('shieldHit', { vol: 0.35, rate: 1.6 });
    return true;
  };
  // Сборщик тянет к кораблю всё с экрана (монеты, кристаллы, энергию; с 3-го уровня — и бонусы)
  C.pulls = function (it) { return C.has('collector') && (it.kind !== 'pu' && it.kind !== 'crate' || C.d.lv >= 3); };
  C.coinMul = function () { return C.has('collector') ? 1 + C.d.lv * 0.05 : 1; };

  C.draw = function (ctx) {
    const d = C.d, S = G.S;
    if (!d || !game.player || !game.player.alive) return;
    const def = D.COMPANIONS[d.id], w = 24 * S;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45 + (d.flash > 0 ? 0.4 : 0);
    ctx.drawImage(G.soft(def.color, 64), d.x - w, d.y - w, w * 2, w * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (def.hue !== undefined) G.drawCanvas(ctx, G.tinted(def.sprite, { hue: def.hue }), d.x, d.y, w, def.rot || 0);
    else G.draw(ctx, def.sprite, d.x, d.y, w, def.rot || 0);
    // готовность умения — тонкая дуга
    if (def.cd && d.id !== 'gunner') {
      const k = 1 - U.clamp(d.cd / def.cd[d.lv - 1], 0, 1);
      ctx.globalAlpha = 0.7; ctx.strokeStyle = def.color; ctx.lineWidth = 1.5 * S;
      ctx.beginPath(); ctx.arc(d.x, d.y, w * 0.7, -Math.PI / 2, -Math.PI / 2 + U.TAU * k); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  };
})();
