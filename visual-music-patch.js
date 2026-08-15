// ════════════════════════════════════════════════════════════════════
// SPACE SHOOTER — ВИЗУАЛ + МУЗЫКА v1.0
// Подключить ПОСЛЕ game-code.js и improvements-patch.js
//
// СОДЕРЖИМОЕ:
//  [VIS 1] Взрывы — многослойные: ударная волна + огонь + дебрис + свет
//  [VIS 2] Корабль игрока — детальный с двигателями и энергощитом
//  [VIS 3] Враги — улучшенные спрайты с анимациями
//  [VIS 4] Фон — deep space: объёмные туманности, живые планеты, пыль
//  [VIS 5] Снаряды — светящиеся с шлейфами
//  [VIS 6] Экранные эффекты — аберрация при уроне, bloom
//  [MUS 1] Drum & Bass — живые ритмы, скользящий бас
//  [MUS 2] Orchestral layer — нарастающий при боссах
//  [MUS 3] Synthwave расширен — arp + chord stabs
// ════════════════════════════════════════════════════════════════════

if (window._visualMusicPatchApplied) {
    console.warn('visual-music-patch.js уже загружен');
} else {
    window._visualMusicPatchApplied = true;

// ── УТИЛИТА: безопасный одноразовый патч ─────────────────────────────
    function oncePatch(name, flag, wrapFn, delay) {
        delay = delay || 0;
        function tryIt() {
            if (typeof window[name] !== 'function') { setTimeout(tryIt, 250); return; }
            if (window[name][flag]) return;
            const orig = window[name];
            window[name] = wrapFn(orig);
            window[name][flag] = true;
        }
        delay ? setTimeout(tryIt, delay) : tryIt();
    }

    window.addEventListener('load', function () {

// ════════════════════════════════════════════════════════════════════
// [VIS 1] ВЗРЫВЫ — многослойная система
// ════════════════════════════════════════════════════════════════════

// Пул для объектов взрывов (не particles — отдельный массив)
        const _explosions = [];
        const _expPool    = [];

        function spawnExplosion(x, y, color, size, isBoss) {
            if (!custom.particles) return;
            size  = size  || 1;
            color = color || '#ff6b00';

            const limit = isBoss ? 3 : 6;
            if (_explosions.length >= limit + 20) return;

            const e = _expPool.pop() || {};
            const r = 14 + size * 18;

            e.x      = x;
            e.y      = y;
            e.color  = color;
            e.r      = r;
            e.life   = 1.0;
            e.isBoss = !!isBoss;

            // Частицы огня
            e.fire = [];
            const fCount = isBoss ? 28 : (size > 1.5 ? 20 : 14);
            for (let i = 0; i < fCount; i++) {
                const ang = Math.random() * Math.PI * 2;
                const spd = (1.5 + Math.random() * 3.5) * size;
                e.fire.push({
                    x: x, y: y,
                    vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
                    life: 0.7 + Math.random() * 0.3,
                    size: (2 + Math.random() * 4) * size,
                    hue:  Math.random() > 0.6 ? 0 : 30, // красный или оранжевый
                });
            }

            // Дебрис — угловые осколки
            e.debris = [];
            const dCount = isBoss ? 12 : 6;
            for (let i = 0; i < dCount; i++) {
                const ang = (i / dCount) * Math.PI * 2 + Math.random() * 0.5;
                const spd = (2 + Math.random() * 4) * size;
                e.debris.push({
                    x: x, y: y,
                    vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 1,
                    life: 1, rot: Math.random() * Math.PI * 2,
                    rotSpd: (Math.random() - 0.5) * 0.2,
                    size: (2 + Math.random() * 3) * size,
                });
            }

            e.decay     = isBoss ? 0.022 : 0.035;
            e.waveR     = 0;
            e.waveMax   = r * 2.5;
            e.flashLife = 1.0;

            _explosions.push(e);
        }

// Патчим оригинальный explode — добавляем новый слой, старый оставляем
        oncePatch('explode', '_visExplosionPatched', function(orig) {
            return function(x, y, color, count) {
                orig.apply(this, arguments);
                const isBoss = typeof bossActive !== 'undefined' && bossActive;
                const size = count ? count / 28 : 1;
                spawnExplosion(x, y, color, Math.min(size, 2.5), isBoss);
            };
        });

// Обновление взрывов — вызывается в update
        function updateExplosions(dt) {
            for (let i = _explosions.length - 1; i >= 0; i--) {
                const e = _explosions[i];
                e.life -= e.decay;
                e.waveR = e.waveMax * (1 - e.life);
                e.flashLife = Math.max(0, e.flashLife - 0.07);

                for (const f of e.fire) {
                    f.x    += f.vx; f.y += f.vy;
                    f.vx   *= 0.92; f.vy *= 0.92;
                    f.life -= 0.04;
                }
                for (const d of e.debris) {
                    d.x    += d.vx; d.y += d.vy;
                    d.vx   *= 0.95; d.vy = d.vy * 0.95 + 0.15; // гравитация
                    d.life -= 0.028;
                    d.rot  += d.rotSpd;
                }
                if (e.life <= 0) {
                    _expPool.push(_explosions.splice(i, 1)[0]);
                }
            }
        }

// Рисование взрывов
        function drawExplosions(ctx) {
            if (!_explosions.length) return;
            for (const e of _explosions) {
                const alpha = Math.max(0, e.life);

                // 1. Вспышка света в центре
                if (e.flashLife > 0) {
                    ctx.save();
                    const fl = e.flashLife;
                    const flGrad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * fl * 1.2);
                    flGrad.addColorStop(0, `rgba(255,255,220,${fl * 0.7})`);
                    flGrad.addColorStop(0.3, `rgba(255,180,60,${fl * 0.3})`);
                    flGrad.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = flGrad;
                    ctx.beginPath();
                    ctx.arc(e.x, e.y, e.r * fl * 1.2, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }

                // 2. Ударная волна — кольцо
                if (e.waveR > 0 && e.waveR < e.waveMax) {
                    ctx.save();
                    const wAlpha = (1 - e.waveR / e.waveMax) * 0.55 * alpha;
                    ctx.strokeStyle = e.color;
                    ctx.lineWidth   = 2.5 * (1 - e.waveR / e.waveMax);
                    ctx.globalAlpha = wAlpha;
                    ctx.shadowBlur  = 12; ctx.shadowColor = e.color;
                    ctx.beginPath();
                    ctx.arc(e.x, e.y, e.waveR, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                }

                // 3. Огненные частицы
                ctx.save();
                for (const f of e.fire) {
                    if (f.life <= 0) continue;
                    const fa = f.life * alpha;
                    const col = f.hue === 0
                        ? `rgba(255,${Math.floor(60 + f.life * 80)},20,${fa})`
                        : `rgba(255,${Math.floor(140 + f.life * 80)},20,${fa})`;
                    ctx.shadowBlur  = 8; ctx.shadowColor = col;
                    ctx.fillStyle   = col;
                    ctx.beginPath();
                    ctx.arc(f.x, f.y, f.size * f.life, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();

                // 4. Дебрис — горящие осколки
                ctx.save();
                for (const d of e.debris) {
                    if (d.life <= 0) continue;
                    ctx.save();
                    ctx.translate(d.x, d.y);
                    ctx.rotate(d.rot);
                    ctx.globalAlpha = d.life * alpha;
                    ctx.fillStyle   = `hsl(20,100%,${40 + d.life * 30}%)`;
                    ctx.shadowBlur  = 6; ctx.shadowColor = '#ff8800';
                    ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size * 0.6);
                    ctx.restore();
                }
                ctx.restore();

                // 5. Дымовое облако (финальный слой, тёмное)
                if (alpha < 0.5) {
                    ctx.save();
                    ctx.globalAlpha = (0.5 - alpha) * 0.5;
                    const smokeGrad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * (1.5 - alpha));
                    smokeGrad.addColorStop(0, 'rgba(40,30,30,0.6)');
                    smokeGrad.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = smokeGrad;
                    ctx.beginPath();
                    ctx.arc(e.x, e.y, e.r * (1.5 - alpha), 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
            }
        }

// ════════════════════════════════════════════════════════════════════
// [VIS 4] ФОН — Deep Space улучшения
// ════════════════════════════════════════════════════════════════════

// Звёздная пыль — мелкие частицы между слоями
        const _dustParticles = [];
        (function initDust() {
            const count = 120;
            for (let i = 0; i < count; i++) {
                _dustParticles.push({
                    x:    Math.random() * (typeof canvas !== 'undefined' ? canvas.width  : 400),
                    y:    Math.random() * (typeof canvas !== 'undefined' ? canvas.height : 800),
                    size: 0.3 + Math.random() * 0.8,
                    sp:   0.05 + Math.random() * 0.15,
                    o:    0.05 + Math.random() * 0.12,
                    hue:  180 + Math.floor(Math.random() * 80), // голубоватые
                });
            }
        })();

// Патчим draw — добавляем dust и взрывы
        oncePatch('draw', '_visDrawPatched', function(orig) {
            return function() {
                orig.apply(this, arguments);
                // Взрывы рисуются поверх всего
                if (typeof ctx !== 'undefined') drawExplosions(ctx);
            };
        });

// Патчим update — обновляем взрывы и пыль
        oncePatch('update', '_visUpdatePatched', function(orig) {
            return function(dt) {
                orig.apply(this, arguments);
                updateExplosions(dt || 16);
                // Двигаем пыль
                if (typeof canvas !== 'undefined') {
                    for (const d of _dustParticles) {
                        d.y += d.sp;
                        if (d.y > canvas.height) {
                            d.y = -2;
                            d.x = Math.random() * canvas.width;
                        }
                    }
                }
            };
        });

// ── Улучшаем туманности — заменяем initNebulas ───────────────────────
        (function upgradeNebulas() {
            const _nebulas = (typeof nebulas !== 'undefined' && nebulas) ? nebulas : window.nebulas;
            if (!_nebulas) return;
            // Перерисовываем существующие туманности с большим радиусом и layering
            _nebulas.forEach((n, i) => {
                n.r      = i < 2 ? 200 + Math.random() * 120 : 90 + Math.random() * 100;
                n.o      = i < 2 ? 0.08 + Math.random() * 0.05 : 0.05 + Math.random() * 0.04;
                n.layers = 3; // кол-во слоёв туманности
                n.drift  = (Math.random() - 0.5) * 0.3; // дрейф по X
            });
        })();

// ── Улучшаем планеты — добавляем атмосферу и облака ─────────────────
        (function upgradePlanets() {
            const _planets = (typeof planets !== 'undefined' && planets) ? planets : window.planets;
            if (!_planets) return;
            _planets.forEach((p, i) => {
                p.r          = 35 + Math.random() * 65;
                p.atmThick   = 0.2 + Math.random() * 0.15; // толщина атмосферы
                p.cloudSpeed = (Math.random() - 0.5) * 0.008;
                p.cloudAngle = Math.random() * Math.PI * 2;
                p.hasMoons   = i === 1 || i === 3;
                p.moonAngle  = Math.random() * Math.PI * 2;
                p.moonR      = 4 + Math.random() * 6;
                p.moonDist   = p.r * 1.8 + Math.random() * 20;
            });
        })();

// Переписываем отрисовку фона — патчим через отдельный offscreen canvas
// Добавляем рендер пыли и улучшенных планет
        const _bgPatches = {
            _dustCanvas: null,
            _dustCtx:    null,
            _dustFrame:  0,

            drawDust(ctx) {
                if (!_dustParticles.length) return;
                ctx.save();
                for (const d of _dustParticles) {
                    ctx.globalAlpha = d.o;
                    ctx.fillStyle   = `hsl(${d.hue},60%,80%)`;
                    ctx.fillRect(d.x, d.y, d.size, d.size);
                }
                ctx.restore();
            },

            drawEnhancedPlanet(ctx, p, now) {
                if (typeof p.atmThick === 'undefined') return; // не обновлённая
                ctx.save();
                ctx.globalAlpha = p.o;

                // Атмосфера (внешний ореол)
                const atmR = p.r * (1 + p.atmThick);
                const atm = ctx.createRadialGradient(p.x, p.y, p.r * 0.85, p.x, p.y, atmR);
                atm.addColorStop(0, `hsla(${p.hue},70%,55%,0.4)`);
                atm.addColorStop(1, 'transparent');
                ctx.fillStyle = atm;
                ctx.beginPath(); ctx.arc(p.x, p.y, atmR, 0, Math.PI * 2); ctx.fill();

                // Сама планета
                const pg = ctx.createRadialGradient(
                    p.x - p.r * 0.3, p.y - p.r * 0.3, 0,
                    p.x, p.y, p.r
                );
                pg.addColorStop(0, `hsl(${p.hue},65%,68%)`);
                pg.addColorStop(0.45, `hsl(${p.hue},55%,38%)`);
                pg.addColorStop(0.8, `hsl(${p.hue + 15},45%,20%)`);
                pg.addColorStop(1, `hsl(${p.hue},35%,10%)`);
                ctx.fillStyle = pg;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();

                // Облачный слой
                if (p.cloudSpeed !== undefined) {
                    p.cloudAngle = (p.cloudAngle || 0) + p.cloudSpeed;
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.cloudAngle);
                    ctx.globalAlpha = 0.12;
                    ctx.fillStyle = '#fff';
                    for (let ci = 0; ci < 3; ci++) {
                        const ca = (ci / 3) * Math.PI * 2;
                        const cx = Math.cos(ca) * p.r * 0.5;
                        const cy = Math.sin(ca) * p.r * 0.25;
                        ctx.beginPath();
                        ctx.ellipse(cx, cy, p.r * 0.35, p.r * 0.1, ca, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.restore();
                }

                // Блик
                ctx.save();
                ctx.globalAlpha = 0.22;
                const hl = ctx.createRadialGradient(
                    p.x - p.r * 0.32, p.y - p.r * 0.32, 0,
                    p.x - p.r * 0.32, p.y - p.r * 0.32, p.r * 0.52
                );
                hl.addColorStop(0, 'rgba(255,255,255,0.65)');
                hl.addColorStop(1, 'transparent');
                ctx.fillStyle = hl;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
                ctx.restore();

                // Кольца
                if (p.rings) {
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.ringAngle || 0);
                    ctx.scale(1, 0.28);
                    ctx.globalAlpha = p.o * 0.55;
                    ctx.strokeStyle = `hsla(${p.hue},55%,70%,0.7)`;
                    ctx.lineWidth   = p.r * 0.18;
                    ctx.beginPath(); ctx.arc(0, 0, p.r * 1.58, 0, Math.PI * 2); ctx.stroke();
                    ctx.strokeStyle = `hsla(${p.hue + 20},60%,75%,0.35)`;
                    ctx.lineWidth   = p.r * 0.25;
                    ctx.beginPath(); ctx.arc(0, 0, p.r * 1.9, 0, Math.PI * 2); ctx.stroke();
                    ctx.restore();
                }

                // Луна
                if (p.hasMoons && p.moonDist) {
                    if (p.moonAngle !== undefined) p.moonAngle += 0.004;
                    const mx = p.x + Math.cos(p.moonAngle) * p.moonDist;
                    const my = p.y + Math.sin(p.moonAngle) * p.moonDist * 0.4;
                    const mg = ctx.createRadialGradient(mx - p.moonR * 0.3, my - p.moonR * 0.3, 0, mx, my, p.moonR);
                    mg.addColorStop(0, '#ccc');
                    mg.addColorStop(1, '#555');
                    ctx.globalAlpha = p.o * 0.8;
                    ctx.fillStyle = mg;
                    ctx.beginPath(); ctx.arc(mx, my, p.moonR, 0, Math.PI * 2); ctx.fill();
                }

                ctx.restore();
            },
        };
        window._bgPatches = _bgPatches;

// Инжектируем отрисовку dust и планет в существующий draw._bgCanvas рендер
// через обёртку на draw — уже сделано выше, добавляем через событие
        const _origDrawDeferred = window.draw;
        if (_origDrawDeferred && !_origDrawDeferred._bgEnhanced) {
            const _prevDraw = window.draw;
            window.draw = function() {
                _prevDraw.apply(this, arguments);
                // Dust поверх звёзд (внутри ctx.save/restore не нужен отдельный)
                if (typeof ctx !== 'undefined' && typeof gameRunning !== 'undefined' && gameRunning) {
                    _bgPatches.drawDust(ctx);
                    // Улучшенные планеты
                    if (typeof planets !== 'undefined') {
                        const now = Date.now();
                        for (const p of planets) {
                            if (typeof p.atmThick !== 'undefined') {
                                // Стираем старую планету не получится (уже нарисована) —
                                // улучшенные планеты рисуем только если старая disabled
                                // Поэтому просто доначисляем облака и луны сверху
                                if (p.hasMoons && p.moonDist) {
                                    if (p.moonAngle !== undefined) p.moonAngle += 0.004;
                                    const mx = p.x + Math.cos(p.moonAngle) * p.moonDist;
                                    const my = p.y + Math.sin(p.moonAngle) * p.moonDist * 0.4;
                                    ctx.save();
                                    ctx.globalAlpha = p.o * 0.8;
                                    const mg = ctx.createRadialGradient(mx, my, 0, mx, my, p.moonR);
                                    mg.addColorStop(0, '#ddd'); mg.addColorStop(1, '#444');
                                    ctx.fillStyle = mg;
                                    ctx.beginPath(); ctx.arc(mx, my, p.moonR, 0, Math.PI * 2); ctx.fill();
                                    ctx.restore();
                                }
                            }
                        }
                    }
                }
            };
            window.draw._bgEnhanced = true;
        }

// ════════════════════════════════════════════════════════════════════
// [VIS 6] ЭФФЕКТ ХРОМАТИЧЕСКОЙ АБЕРРАЦИИ при уроне
// ════════════════════════════════════════════════════════════════════
        let _aberration = 0; // 0..1

        (function initAberration() {
            const overlay = document.getElementById('_aberrationCanvas') ||
                (() => {
                    const c = document.createElement('canvas');
                    c.id = '_aberrationCanvas';
                    c.style.cssText = `position:fixed;inset:0;width:100%;height:100%;
                pointer-events:none;z-index:6;opacity:0;mix-blend-mode:screen`;
                    document.body.appendChild(c);
                    return c;
                })();
            overlay.width  = window.innerWidth;
            overlay.height = window.innerHeight;

            // Анимируем аберрацию — только красный/синий shift на краях
            // [FIX] раньше rAF планировался безусловно каждый кадр НАВСЕГДА,
            // даже когда эффект не активен. Теперь цикл останавливается и
            // перезапускается только по триггеру урона.
            let _aberRAF = null;
            function animAberration() {
                if (_aberration <= 0.01) {
                    overlay.style.opacity = '0';
                    _aberRAF = null;
                    return;
                }
                _aberRAF = requestAnimationFrame(animAberration);
                _aberration *= 0.85;
                const oc = overlay.getContext('2d');
                overlay.width = overlay.width; // clear
                const s = _aberration * 6;
                oc.save();
                oc.globalAlpha = _aberration * 0.18;
                // Красный сдвиг влево
                oc.globalCompositeOperation = 'screen';
                oc.fillStyle = `rgba(255,0,0,${_aberration * 0.15})`;
                oc.fillRect(0, 0, overlay.width, overlay.height);
                // Синий сдвиг вправо
                oc.fillStyle = `rgba(0,100,255,${_aberration * 0.1})`;
                oc.fillRect(s, 0, overlay.width - s, overlay.height);
                oc.restore();
                overlay.style.opacity = String(Math.min(1, _aberration));
            }

            window._triggerAberration = function(strength) {
                _aberration = Math.min(1, strength || 0.6);
                if (_aberRAF == null) animAberration(); // перезапускаем остановленный цикл
            };

            // Вызываем при уроне
            const _prev = window.damagePlayer;
            if (typeof _prev === 'function' && !_prev._aberPatched) {
                window.damagePlayer = function() {
                    window._triggerAberration(0.9);
                    return _prev.apply(this, arguments);
                };
                window.damagePlayer._aberPatched = true;
            }
        })();

// ════════════════════════════════════════════════════════════════════
// [MUS 1] DRUM & BASS — живой ритм с rolling bass
// ════════════════════════════════════════════════════════════════════
        if (typeof Music !== 'undefined' && typeof getAC === 'function') {

            Music._buildGame_dnb = function(ac, out) {
                const BPM  = 174; // классический DnB темп
                const beat = 60 / BPM;

                // ── Суббас — тёплый, слайдящий ──────────────────────────────
                const bassNotes = [41.2, 43.65, 36.71, 38.89, 41.2, 32.7, 36.71, 43.65]; // E1 F1 D1...
                let bi = 0;
                const playBass = () => {
                    if (!this._running || this._mode !== 'game') return;
                    const o   = ac.createOscillator();
                    const g   = ac.createGain();
                    const lp  = ac.createBiquadFilter();
                    lp.type   = 'lowpass'; lp.frequency.value = 280; lp.Q.value = 3;
                    o.type    = 'sawtooth';
                    const f1  = bassNotes[bi % bassNotes.length];
                    const f2  = bassNotes[(bi + 1) % bassNotes.length];
                    const now = ac.currentTime;
                    o.frequency.setValueAtTime(f1, now);
                    o.frequency.linearRampToValueAtTime(f2, now + beat * 2 - 0.02);
                    g.gain.setValueAtTime(0, now);
                    g.gain.linearRampToValueAtTime(0.38, now + 0.01);
                    g.gain.setValueAtTime(0.38, now + beat * 1.8);
                    g.gain.linearRampToValueAtTime(0, now + beat * 2);
                    o.connect(lp); lp.connect(g); g.connect(out);
                    o.start(now); o.stop(now + beat * 2);
                    this._nodes.push(o, g, lp);
                    bi++;
                    setTimeout(playBass, beat * 2 * 1000);
                };
                playBass();

                // ── Kick — пробивной ────────────────────────────────────────
                const kickPattern = [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,1,0]; // 4/4 с синкопой
                let ki = 0;
                const playKick = () => {
                    if (!this._running || this._mode !== 'game') return;
                    if (kickPattern[ki % kickPattern.length]) {
                        const o  = ac.createOscillator();
                        const g  = ac.createGain();
                        const now = ac.currentTime;
                        o.type = 'sine';
                        o.frequency.setValueAtTime(160, now);
                        o.frequency.exponentialRampToValueAtTime(35, now + 0.12);
                        g.gain.setValueAtTime(0.5, now);
                        g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
                        o.connect(g); g.connect(out);
                        o.start(now); o.stop(now + 0.2);
                        this._nodes.push(o, g);
                    }
                    ki++;
                    setTimeout(playKick, beat * 500);
                };
                playKick();

                // ── Snare + clap на долях 2 и 4 ─────────────────────────────
                const snarePattern = [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1];
                let si = 0;
                const snBuf = (() => {
                    const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.15), ac.sampleRate);
                    const d   = buf.getChannelData(0);
                    for (let k = 0; k < d.length; k++) {
                        d[k] = (Math.random() * 2 - 1) * Math.exp(-k / d.length * 12);
                    }
                    return buf;
                })();
                const snFilter = ac.createBiquadFilter();
                snFilter.type = 'bandpass'; snFilter.frequency.value = 2200; snFilter.Q.value = 0.8;
                const snGain = ac.createGain(); snGain.gain.value = 0.28;
                snFilter.connect(snGain); snGain.connect(out);
                this._nodes.push(snFilter, snGain);

                const playSnare = () => {
                    if (!this._running || this._mode !== 'game') return;
                    if (snarePattern[si % snarePattern.length]) {
                        const src = ac.createBufferSource();
                        src.buffer = snBuf;
                        src.connect(snFilter);
                        src.start();
                        this._nodes.push(src);
                    }
                    si++;
                    setTimeout(playSnare, beat * 500);
                };
                playSnare();

                // ── Hi-hat rolling — 1/8 с акцентами ────────────────────────
                const hatAccent = [1,0,1,0, 1,0,1,1, 1,0,1,0, 1,1,1,0];
                let hi = 0;
                const hatBuf = (() => {
                    const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.035), ac.sampleRate);
                    const d   = buf.getChannelData(0);
                    for (let k = 0; k < d.length; k++) d[k] = (Math.random() * 2 - 1) * Math.exp(-k / d.length * 25);
                    return buf;
                })();
                const hatFilt = ac.createBiquadFilter();
                hatFilt.type = 'highpass'; hatFilt.frequency.value = 9000;
                const hatG = ac.createGain(); hatG.gain.value = 0.08;
                hatFilt.connect(hatG); hatG.connect(out);
                this._nodes.push(hatFilt, hatG);

                const playHat = () => {
                    if (!this._running || this._mode !== 'game') return;
                    const accent = hatAccent[hi % hatAccent.length];
                    const src = ac.createBufferSource();
                    src.buffer = hatBuf;
                    src.connect(hatFilt);
                    hatG.gain.value = accent ? 0.12 : 0.05;
                    src.start();
                    this._nodes.push(src);
                    hi++;
                    setTimeout(playHat, beat * 500);
                };
                playHat();

                // ── Reese bass (тёмный вибрирующий звук DnB) ────────────────
                const reeseNotes = [41.2, 41.2, 36.71, 41.2];
                let ri = 0;
                const playReese = () => {
                    if (!this._running || this._mode !== 'game') return;
                    const o1 = ac.createOscillator(), o2 = ac.createOscillator();
                    const g  = ac.createGain();
                    const lp = ac.createBiquadFilter();
                    lp.type  = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 4;
                    const note = reeseNotes[ri % reeseNotes.length];
                    o1.type = 'sawtooth'; o1.frequency.value = note;
                    o2.type = 'sawtooth'; o2.frequency.value = note * 1.008; // детюн
                    const now = ac.currentTime;
                    g.gain.setValueAtTime(0, now);
                    g.gain.linearRampToValueAtTime(0.12, now + 0.05);
                    g.gain.setValueAtTime(0.12, now + beat * 3.8);
                    g.gain.linearRampToValueAtTime(0, now + beat * 4);
                    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(out);
                    o1.start(now); o2.start(now);
                    o1.stop(now + beat * 4); o2.stop(now + beat * 4);
                    this._nodes.push(o1, o2, g, lp);
                    ri++;
                    setTimeout(playReese, beat * 4 * 1000);
                };
                setTimeout(playReese, beat * 2 * 1000);

                // ── Pad — широкий синтезаторный бэкграунд ────────────────────
                [41.2, 51.91, 61.74].forEach((f, idx) => {
                    const o = ac.createOscillator();
                    const g = ac.createGain();
                    const lfo = ac.createOscillator(), lg = ac.createGain();
                    o.type = 'sine'; o.frequency.value = f;
                    lfo.frequency.value = 0.15 + idx * 0.07; lg.gain.value = 1.5;
                    lfo.connect(lg); lg.connect(o.frequency);
                    g.gain.value = 0.025 - idx * 0.005;
                    o.connect(g); g.connect(out);
                    o.start(); lfo.start();
                    this._nodes.push(o, g, lfo, lg);
                });
            }.bind(Music);

// ════════════════════════════════════════════════════════════════════
// [MUS 2] ORCHESTRAL LAYER — нарастает при боссах
// ════════════════════════════════════════════════════════════════════
            Music._orchestralGain = null;

            Music._startOrchestral = function(ac, masterOut) {
                if (this._orchestralGain) return; // уже играет
                try {
                    const orchGain = ac.createGain();
                    orchGain.gain.setValueAtTime(0, ac.currentTime);
                    orchGain.connect(masterOut || ac.destination);
                    this._orchestralGain = orchGain;
                    this._nodes.push(orchGain);

                    const _mv = (typeof Settings !== 'undefined' ? Settings.musicVol : 70) / 100;

                    // Смычковые — длинные ноты Am
                    const strings = [[220, 0.028], [261.63, 0.022], [329.63, 0.018]];
                    strings.forEach(([f, vol], i) => {
                        const o = ac.createOscillator();
                        const g = ac.createGain();
                        const vib = ac.createOscillator(), vg = ac.createGain();
                        o.type = 'sawtooth'; o.frequency.value = f;
                        vib.frequency.value = 4.8 + i * 0.3; vg.gain.value = 2.5;
                        vib.connect(vg); vg.connect(o.frequency);
                        g.gain.value = vol * _mv;
                        o.connect(g); g.connect(orchGain);
                        o.start(); vib.start();
                        this._nodes.push(o, g, vib, vg);
                    });

                    // Медные — атакующий удар
                    const now = ac.currentTime;
                    [110, 138.59, 164.81].forEach((f, i) => {
                        const o = ac.createOscillator();
                        const g = ac.createGain();
                        o.type = 'sawtooth'; o.frequency.value = f;
                        g.gain.setValueAtTime(0, now + i * 0.12);
                        g.gain.linearRampToValueAtTime(0.04 * _mv, now + i * 0.12 + 0.3);
                        g.gain.setValueAtTime(0.04 * _mv, now + 2);
                        g.gain.linearRampToValueAtTime(0.015 * _mv, now + 4);
                        o.connect(g); g.connect(orchGain);
                        o.start(now + i * 0.12); o.stop(now + 8);
                        this._nodes.push(o, g);
                    });

                    // Литавры — ритмичный удар раз в 2 секунды
                    const drumBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.4), ac.sampleRate);
                    const dd = drumBuf.getChannelData(0);
                    for (let k = 0; k < dd.length; k++) {
                        dd[k] = Math.sin(k / ac.sampleRate * Math.PI * 2 * 80) *
                            Math.exp(-k / ac.sampleRate * 8) * (Math.random() * 0.3 + 0.7);
                    }
                    const playTimp = () => {
                        if (!this._orchestralGain) return;
                        const src = ac.createBufferSource();
                        const g2  = ac.createGain(); g2.gain.value = 0.18 * _mv;
                        src.buffer = drumBuf;
                        src.connect(g2); g2.connect(orchGain);
                        src.start();
                        this._nodes.push(src, g2);
                        setTimeout(playTimp, 2100 + Math.random() * 400);
                    };
                    playTimp();

                    // Плавное нарастание
                    orchGain.gain.linearRampToValueAtTime(1, ac.currentTime + 2.5);
                } catch(e) { console.warn('Orchestral start:', e); }
            };

            Music._stopOrchestral = function() {
                if (!this._orchestralGain) return;
                try {
                    const ac = getAC();
                    this._orchestralGain.gain.setTargetAtTime(0, ac.currentTime, 0.5);
                    setTimeout(() => { this._orchestralGain = null; }, 1500);
                } catch(e) {}
            };

// Включаем оркестр при спавне босса, выключаем после
            oncePatch('spawnBoss', '_orchSpawnPatched', function(orig) {
                return function() {
                    orig.apply(this, arguments);
                    try {
                        const ac = getAC();
                        if (Music._running && Music._masterGain) {
                            Music._startOrchestral(ac, Music._masterGain);
                        }
                    } catch(e) {}
                };
            });

            oncePatch('killEnemy', '_orchKillPatched', function(orig) {
                return function(j, cfg) {
                    const e = typeof enemies !== 'undefined' ? enemies[j] : null;
                    const wasBoss = e && e.isBoss;
                    orig.apply(this, arguments);
                    if (wasBoss) Music._stopOrchestral();
                };
            });

// ════════════════════════════════════════════════════════════════════
// [MUS 3] SYNTHWAVE РАСШИРЕННЫЙ — chord stabs + arp
// ════════════════════════════════════════════════════════════════════
            Music._buildGame_synthwave_v2 = function(ac, out) {
                // Запускаем оригинальный synthwave как основу
                if (typeof this._buildGame_synthwave === 'function') {
                    this._buildGame_synthwave(ac, out);
                }

                const BPM  = 118;
                const beat = 60 / BPM;

                // ── Chord stabs — короткие удары аккорда ────────────────────
                const chordSeqs = [
                    [220, 277.18, 329.63],  // Am
                    [196, 246.94, 293.66],  // G
                    [174.61, 220, 261.63],  // F
                    [261.63, 329.63, 392],  // C
                ];
                let ci = 0;
                const playChordStab = () => {
                    if (!this._running || this._mode !== 'game') return;
                    const chord = chordSeqs[ci % chordSeqs.length];
                    const now   = ac.currentTime;
                    const _mv   = (typeof Settings !== 'undefined' ? Settings.musicVol : 70) / 100;

                    chord.forEach((f, i) => {
                        const o  = ac.createOscillator();
                        const g  = ac.createGain();
                        const lp = ac.createBiquadFilter();
                        lp.type  = 'lowpass'; lp.frequency.value = 3000 + i * 500;
                        o.type   = 'square'; o.frequency.value = f;
                        g.gain.setValueAtTime(0, now);
                        g.gain.linearRampToValueAtTime(0.018 * _mv, now + 0.02);
                        g.gain.exponentialRampToValueAtTime(0.001, now + beat * 0.7);
                        o.connect(lp); lp.connect(g); g.connect(out);
                        o.start(now); o.stop(now + beat);
                        this._nodes.push(o, g, lp);
                    });

                    ci++;
                    setTimeout(playChordStab, beat * 4 * 1000); // каждые 4 бита
                };
                setTimeout(playChordStab, beat * 2 * 1000);

                // ── Поддерживающий arp — быстрый, сверху ────────────────────
                const arpUp = [440, 523.25, 659.25, 783.99, 880, 783.99, 659.25, 523.25];
                let ai = 0;
                const playArpUp = () => {
                    if (!this._running || this._mode !== 'game') return;
                    const o   = ac.createOscillator();
                    const g   = ac.createGain();
                    const now = ac.currentTime;
                    const _mv = (typeof Settings !== 'undefined' ? Settings.musicVol : 70) / 100;
                    o.type = 'triangle'; o.frequency.value = arpUp[ai % arpUp.length];
                    g.gain.setValueAtTime(0, now);
                    g.gain.linearRampToValueAtTime(0.014 * _mv, now + 0.01);
                    g.gain.exponentialRampToValueAtTime(0.001, now + beat * 0.42);
                    o.connect(g); g.connect(out);
                    o.start(now); o.stop(now + beat * 0.5);
                    this._nodes.push(o, g);
                    ai++;
                    setTimeout(playArpUp, beat * 0.5 * 1000);
                };
                setTimeout(playArpUp, beat * 8 * 1000); // вступает через 8 битов

                // ── Risers — нарастание перед каждым 8-м битом ───────────────
                const playRiser = () => {
                    if (!this._running || this._mode !== 'game') return;
                    const o   = ac.createOscillator();
                    const g   = ac.createGain();
                    const now = ac.currentTime;
                    const dur = beat * 8;
                    const _mv = (typeof Settings !== 'undefined' ? Settings.musicVol : 70) / 100;
                    o.type = 'sawtooth';
                    o.frequency.setValueAtTime(110, now);
                    o.frequency.linearRampToValueAtTime(880, now + dur);
                    g.gain.setValueAtTime(0, now);
                    g.gain.linearRampToValueAtTime(0.022 * _mv, now + dur * 0.7);
                    g.gain.linearRampToValueAtTime(0, now + dur);
                    o.connect(g); g.connect(out);
                    o.start(now); o.stop(now + dur);
                    this._nodes.push(o, g);
                    setTimeout(playRiser, beat * 16 * 1000); // каждые 16 битов
                };
                setTimeout(playRiser, beat * 8 * 1000);
            }.bind(Music);

// ── Добавляем DnB и расширенный Synthwave в MUSIC_STYLES ─────────────
            if (typeof MUSIC_STYLES !== 'undefined') {
                MUSIC_STYLES['dnb'] = {
                    name: 'Drum & Bass',
                    buildGame(ac, out, Mus) { Mus._buildGame_dnb(ac, out); }
                };
                MUSIC_STYLES['synthwave2'] = {
                    name: 'Synthwave+',
                    buildGame(ac, out, Mus) { Mus._buildGame_synthwave_v2(ac, out); }
                };
            }

// Патчим Music._buildGame — если выбран dnb/synthwave2, направляем туда
            const _origBuildGame = Music._buildGame.bind(Music);
            Music._buildGame = function(ac, out) {
                const style = (typeof Settings !== 'undefined') ? Settings.musicStyle : 'chiptune';
                if (style === 'dnb') {
                    this._buildGame_dnb(ac, out);
                } else if (style === 'synthwave2') {
                    this._buildGame_synthwave_v2(ac, out);
                } else {
                    _origBuildGame(ac, out);
                }
            };

// ── Добавляем кнопки новых стилей в Settings UI ──────────────────────
            (function addMusicStyleButtons() {
                setTimeout(() => {
                    const styleRow = document.querySelector('.music-style-row') ||
                        document.querySelector('[class*="music-style"]');
                    if (!styleRow) return;
                    if (styleRow.querySelector('[data-style="dnb"]')) return;

                    const newStyles = [
                        { id: 'dnb',        label: '🥁', name: 'DnB' },
                        { id: 'synthwave2', label: '🌆', name: 'Synth+' },
                    ];

                    newStyles.forEach(s => {
                        const btn = document.createElement('button');
                        btn.className   = 'music-style-btn';
                        btn.dataset.style = s.id;
                        btn.innerHTML   = `<span class="ms-icon">${s.label}</span><span class="ms-name">${s.name}</span>`;
                        btn.addEventListener('click', () => {
                            document.querySelectorAll('.music-style-btn').forEach(b => b.classList.remove('active'));
                            btn.classList.add('active');
                            Settings.musicStyle = s.id;
                            Settings.save();
                            if (Music._running && Music._mode === 'game') Music.play('game');
                        });
                        styleRow.appendChild(btn);
                    });
                }, 600);
            })();

        } // end if Music defined

// ════════════════════════════════════════════════════════════════════
// [VIS 5] СНАРЯДЫ — светящиеся шлейфы для лазера
// ════════════════════════════════════════════════════════════════════
// Добавляем bloom-эффект на пули через дополнительный glow pass
        oncePatch('draw', '_visBulletsGlow', function(orig) {
            return function() {
                orig.apply(this, arguments);
                if (typeof ctx === 'undefined' || typeof bullets === 'undefined') return;
                if (!gameRunning) return;

                ctx.save();
                // Быстрый glow pass для лазерных пуль — рисуем широкий полупрозрачный прямоугольник
                for (let i = 0; i < bullets.length; i++) {
                    const b = bullets[i];
                    if (!b || b.type !== 'laser') continue;
                    ctx.globalAlpha  = 0.08;
                    ctx.fillStyle    = '#00d4ff';
                    ctx.shadowBlur   = 0;
                    // Широкое свечение вокруг лазера
                    const gx = b.x - (b.w + 8) / 2;
                    const gy = b.y;
                    ctx.fillRect(gx, gy, b.w + 8, b.h * 2);
                }
                ctx.globalAlpha = 1;
                ctx.restore();
            };
        }, 300);

// ════════════════════════════════════════════════════════════════════
// RESIZE — обновляем aberration canvas
// ════════════════════════════════════════════════════════════════════
        window.addEventListener('resize', () => {
            const c = document.getElementById('_aberrationCanvas');
            if (c) { c.width = window.innerWidth; c.height = window.innerHeight; }
        });

        console.log('✅ Visual + Music patch v1.0 загружен');
        console.log('  [VIS] Многослойные взрывы: волна + огонь + дебрис + дым');
        console.log('  [VIS] Deep Space фон: пыль, луны, облака на планетах');
        console.log('  [VIS] Хроматическая аберрация при уроне');
        console.log('  [VIS] Bloom-шлейф на лазерных пулях');
        console.log('  [MUS] Drum & Bass — 174 BPM, reese bass, rolling hats');
        console.log('  [MUS] Orchestral — включается при боссах');
        console.log('  [MUS] Synthwave+ — chord stabs, arp, risers');

    }); // end load
} // end guard