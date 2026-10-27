// ════════════════════════════════════════════════════════════════
// SPACE SHOOTER 2.5 — вступительная заставка при запуске
//  Короткая сцена (≈8 с) на своём холсте поверх меню: прыжок из гиперпространства,
//  флот Оверлорда выходит из порталов, корабль игрока сбивает разведку и уходит в бой.
//  Касание пропускает заставку; отключается в настройках («Заставка при запуске»).
// ════════════════════════════════════════════════════════════════
'use strict';

(function () {
  const U = SS.util;
  const DUR = 8.4;
  // подписи: начало, конец, текст
  const CAPS = [
    [0.5, 2.4, '2387 ГОД · ОРБИТА ЗЕМЛИ'],
    [2.6, 4.5, 'Флот Оверлорда прорвал оборону'],
    [4.7, 6.3, 'Остался только ты, пилот'],
  ];
  const ease = (k) => 1 - Math.pow(1 - U.clamp(k, 0, 1), 3);

  const intro = {
    playing: false,

    // done вызывается, когда заставка закончилась или пропущена
    play(done) {
      const el = document.getElementById('intro');
      if (!el) { done(); return; }
      const G = SS.gfx, A = SS.audio, s = SS.store.s;
      const cv = document.getElementById('introCv'), cap = document.getElementById('introCap');
      const ctx = cv.getContext('2d');
      const W = window.innerWidth, H = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      const k = U.clamp(Math.min(W / 400, H / 720), 0.8, 1.6);
      const FW = Math.min(W, 640), FX0 = (W - FW) / 2;

      // звёзды для прыжка: летят от центра к краям
      const stars = [];
      for (let i = 0; i < 220; i++) stars.push({ x: U.rand(-1, 1), y: U.rand(-1, 1), z: Math.random() });
      // флот: портал, корабль, время появления; центральный — флагман
      const fleet = [
        { x: 0.22, y: 0.26, spr: 'shooter', w: 58, t0: 2.2 },
        { x: 0.78, y: 0.26, spr: 'shooter', w: 58, t0: 2.5 },
        { x: 0.5,  y: 0.2,  spr: 'boss',    w: 170, t0: 2.9, boss: true },
        { x: 0.36, y: 0.36, spr: 'scout',   w: 46, t0: 3.3 },
        { x: 0.64, y: 0.36, spr: 'scout',   w: 46, t0: 3.5 },
      ];
      // кого сбивает игрок и когда
      const shots = [[5.25, 3], [5.55, 4], [5.85, 0], [6.1, 1]];
      const booms = [];
      let t = 0, last = performance.now(), raf = 0, ended = false, capIdx = -1;
      const sfx = (name, o) => { try { if (A.unlocked) A.play(name, o); } catch (e) { /* звук ещё не разрешён */ } };
      const said = {};
      const once = (key, fn) => { if (!said[key]) { said[key] = true; fn(); } };

      const finish = () => {
        if (ended) return;
        ended = true;
        cancelAnimationFrame(raf);
        el.classList.add('out');
        setTimeout(() => { el.hidden = true; el.classList.remove('out', 'logo-on'); this.playing = false; }, 500);
        done();
      };
      const skip = () => { SS.audio.unlock(); finish(); };
      el.onpointerdown = skip;
      el.hidden = false;
      this.playing = true;

      const drawSpr = (name, x, y, w, alpha, add) => {
        const f = G.frame(name), img = f && G.src(f);
        if (!img) return;
        const h = w * f[3] / f[2];
        ctx.globalAlpha = alpha;
        if (add) ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(img, f[0], f[1], f[2], f[3], x - w / 2, y - h / 2, w, h);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      };

      const step = (now) => {
        raf = requestAnimationFrame(step);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        t += dt;
        if (t >= DUR) { finish(); return; }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // фон: глубокий космос и туманность
        const bg = ctx.createRadialGradient(W / 2, H * 0.35, 0, W / 2, H * 0.35, Math.max(W, H) * 0.8);
        bg.addColorStop(0, '#16194a'); bg.addColorStop(0.5, '#080a24'); bg.addColorStop(1, '#02030b');
        ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

        // звёзды: в начале прыжок (длинные штрихи), потом спокойный полёт
        const warp = t < 1.4 ? 1 : Math.max(0.06, 1 - (t - 1.4) * 1.2);
        const cx = W / 2, cy = H * 0.42, R = Math.max(W, H) * 0.7;
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        for (const st of stars) {
          st.z -= dt * (0.12 + warp * 1.4);
          if (st.z <= 0.02) { st.z = 1; st.x = U.rand(-1, 1); st.y = U.rand(-1, 1); }
          const px = cx + st.x / st.z * R * 0.25, py = cy + st.y / st.z * R * 0.25;
          const z2 = st.z + warp * 0.08;
          const qx = cx + st.x / z2 * R * 0.25, qy = cy + st.y / z2 * R * 0.25;
          const a = Math.min(1, (1 - st.z) * 1.6);
          ctx.strokeStyle = 'rgba(' + (warp > 0.3 ? '150,210,255,' : '220,235,255,') + a.toFixed(2) + ')';
          ctx.lineWidth = Math.max(1, (1 - st.z) * 2.6);
          ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(px + 0.01, py); ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
        // вспышка выхода из прыжка
        if (t > 1.3 && t < 2.0) { ctx.fillStyle = 'rgba(190,225,255,' + (0.35 * (1 - (t - 1.3) / 0.7)).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H); }

        // флот выходит из порталов
        for (let i = 0; i < fleet.length; i++) {
          const e = fleet[i];
          // во вспышке финала флот исчезает — за логотипом остаются только звёзды
          if (t < e.t0 || e.dead || t > 6.85) continue;
          const lt = t - e.t0, x = FX0 + e.x * FW, y = e.y * H + lt * 6 * k;
          if (lt < 1.1) {
            const pk = lt < 0.3 ? lt / 0.3 : lt > 0.8 ? 1 - (lt - 0.8) / 0.3 : 1;
            drawSpr('fx_portal_in', x, e.y * H, (e.boss ? 150 : 80) * k * (0.4 + 0.6 * pk), pk, true);
            once('p' + i, () => sfx('teleport', { vol: 0.5 }));
          }
          if (lt > 0.25) {
            const a = ease((lt - 0.25) / 0.5), w = Math.min(e.w * k, e.boss ? FW * 0.46 : 999);
            drawSpr(e.spr, x, y, w * (0.6 + 0.4 * a), a);
          }
          e.cx = x; e.cy = y;
        }
        // красная тревога, пока выходит флот
        if (t > 2.6 && t < 4.6) {
          const a = 0.18 * (0.5 + 0.5 * Math.sin((t - 2.6) * 7));
          const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
          vg.addColorStop(0, 'rgba(255,30,60,0)'); vg.addColorStop(1, 'rgba(255,30,60,' + a.toFixed(3) + ')');
          ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
          once('warn', () => sfx('warning', { vol: 0.45 }));
        }

        // корабль игрока: выходит снизу, стреляет, уходит вверх
        if (t > 4.3) {
          const sw = 72 * k;
          let sy = H + 80 * k;
          if (t < 5.1) sy = U.lerp(H + 80 * k, H * 0.72, ease((t - 4.3) / 0.8));
          else if (t < 6.4) sy = H * 0.72 + Math.sin((t - 5.1) * 3) * 4 * k;
          else sy = U.lerp(H * 0.72, -120 * k, ease((t - 6.4) / 0.7) * ease((t - 6.4) / 0.7));
          const sx = W / 2 + Math.sin(t * 1.3) * 10 * k;
          const boost = t > 6.4 ? 2.2 : t < 5.1 ? 1.6 : 1.1;
          SS.game.drawShip(ctx, s.ship.model, s.ship.skin, s.ship.trail, sx, sy, sw, Math.sin(t * 1.3) * 0.08, t, boost);
          if (t < 5.0) once('eng', () => sfx('skill', { vol: 0.4, rate: 0.7 }));
          // выстрелы по разведке
          for (const [ts, idx] of shots) {
            const e = fleet[idx];
            if (t < ts || e.dead || e.cx === undefined) continue;
            const lt = t - ts;
            if (lt < 0.16) {
              ctx.globalCompositeOperation = 'lighter';
              ctx.strokeStyle = 'rgba(127,231,255,' + (1 - lt / 0.16).toFixed(2) + ')';
              ctx.lineWidth = 4 * k;
              ctx.beginPath(); ctx.moveTo(sx, sy - sw * 0.5); ctx.lineTo(e.cx, e.cy); ctx.stroke();
              ctx.strokeStyle = 'rgba(255,255,255,' + (1 - lt / 0.16).toFixed(2) + ')';
              ctx.lineWidth = 1.5 * k;
              ctx.stroke();
              ctx.globalCompositeOperation = 'source-over';
              once('s' + idx, () => sfx('laser', { vol: 0.6 }));
            } else {
              e.dead = true;
              booms.push({ x: e.cx, y: e.cy, t: 0, w: e.w * k * 1.6 });
              sfx('explodeM', { vol: 0.6 });
            }
          }
        }
        // взрывы
        for (const b of booms) {
          b.t += dt;
          if (b.t > 0.7) continue;
          const q = b.t / 0.7;
          drawSpr(q < 0.5 ? 'fx_ex_l' : 'fx_ex_crit', b.x, b.y, b.w * (0.6 + q * 0.8), 1 - q * q, true);
        }

        // финал: вспышка и логотип
        if (t > 6.75) {
          const q = (t - 6.75) / 0.5;
          if (q < 1) { ctx.fillStyle = 'rgba(255,255,255,' + (0.85 * (1 - q)).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H); }
          once('logo', () => { el.classList.add('logo-on'); sfx('levelup', { vol: 0.5 }); });
        }

        // подписи
        let ci = -1;
        for (let i = 0; i < CAPS.length; i++) if (t >= CAPS[i][0] && t < CAPS[i][1]) ci = i;
        if (ci !== capIdx) {
          capIdx = ci;
          cap.classList.remove('on');
          if (ci >= 0) { cap.textContent = CAPS[ci][2]; void cap.offsetWidth; cap.classList.add('on'); }
        }
      };
      raf = requestAnimationFrame(step);
    },
  };
  SS.intro = intro;
})();
