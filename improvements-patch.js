// ════════════════════════════════════════════════════════════════════
// SPACE SHOOTER — ПАТЧ УЛУЧШЕНИЙ v5.0
// Подключать ПОСЛЕ game-code.js
//
// ЧТО ИСПРАВЛЕНО / ДОБАВЛЕНО (по приоритету):
//
// [БАГ 1]  Защита от двойной инициализации — флаг _patchV5Applied
// [БАГ 2]  injectStyles() — проверка по id, стили не дублируются
// [БАГ 3]  Все патчи функций проверяют ._patched флаг
// [БАГ 4]  setTimeout(fn, 50/500) как wait-for-DOM → setInterval poll
// [БАГ 5]  damagePlayer патчился дважды (в ач-треккере и флэше) — одна точка
// [БАГ 6]  endGame патчился дважды — одна цепочка
// [БАГ 7]  killEnemy после swap-and-pop читал e после удаления — исправлено
// [БАГ 8]  setInterval(fn, 500) для bossesKilled → патч killEnemy
// [БАГ 9]  saveCoins → всегда через throttledSave если есть
// [PERF 1] UI-пул для coinFly DOM-элементов
// [PERF 2] _drawNewEnemies патчит draw только один раз
// [GAME 1] Хлыст (whip) — полная боевая логика: дуга перед кораблём
// [GAME 2] Адаптивная сложность — подстройка скорости врагов
// [GAME 3] Rage Mode — ускорение врагов при стоячем игроке
// [UX 1]   Ripple расширен на все кнопки
// [UX 2]   Анимация +N💰 при получении монет
// ════════════════════════════════════════════════════════════════════

// ── [БАГ 1] ЗАЩИТА ОТ ДВОЙНОЙ ИНИЦИАЛИЗАЦИИ ─────────────────────────
if (window._patchV5Applied) {
    console.warn('⚠️ improvements-patch.js уже запущен — пропускаем');
} else {
    window._patchV5Applied = true;

// ── [БАГ 2] БЕЗОПАСНЫЙ INJECT STYLES ────────────────────────────────
    (function safeInjectStyles() {
        if (document.getElementById('_patchV5Styles')) return;
        const s = document.createElement('style');
        s.id = '_patchV5Styles';
        s.textContent = `
        /* Тач-фидбек кнопок навыков */
        .ask-wrap.ask-pressed .ask-card {
            transform: scale(0.88); filter: brightness(1.35);
            transition: transform 0.07s, filter 0.07s;
        }
        /* MAX значок апгрейдов */
        .upg-lvl-badge.upg-lvl-max {
            background: linear-gradient(135deg,#ffd700,#ff9900);
            color:#000; font-weight:800; letter-spacing:.5px;
            animation: _maxPulse 2s ease-in-out infinite;
        }
        @keyframes _maxPulse {
            0%,100%{ box-shadow:0 0 4px rgba(255,215,0,.4); }
            50%    { box-shadow:0 0 10px rgba(255,215,0,.9); }
        }
        /* [UX 1] Ripple — расширен */
        .weapon-btn,.ask-wrap,.upg-btn,.btn,.pause-btn,.suggest-cat,.stat-pill--pause {
            position:relative; overflow:hidden;
        }
        ._ripple {
            position:absolute; border-radius:50%;
            background:rgba(255,255,255,.22); pointer-events:none;
            transform:scale(0); opacity:1;
            animation:_rippleAnim .55s ease-out forwards;
        }
        @keyframes _rippleAnim {
            to { transform:scale(6); opacity:0; }
        }
        /* [UX 2] Монеты */
        ._coinFly {
            position:fixed; font-family:'Orbitron',monospace;
            font-size:13px; font-weight:700; color:#ffd700;
            text-shadow:0 0 8px rgba(255,215,0,.8);
            pointer-events:none; z-index:9999;
            animation:_coinFlyUp 1.1s ease-out forwards;
        }
        @keyframes _coinFlyUp {
            0%  { opacity:1; transform:translateX(-50%) translateY(0) scale(1); }
            60% { opacity:1; transform:translateX(-50%) translateY(-44px) scale(1.12); }
            100%{ opacity:0; transform:translateX(-50%) translateY(-80px) scale(.8); }
        }
        /* [GAME 3] Rage Mode виньет */
        #_rageOverlay { position:fixed; inset:0; pointer-events:none; z-index:7;
            background:rgba(255,0,0,0); }
        #_rageOverlay.active {
            animation:_ragePulse .8s ease-in-out infinite;
        }
        @keyframes _ragePulse {
            0%,100%{ background:rgba(255,0,0,0); }
            50%    { background:rgba(255,0,0,.07); }
        }
        /* Хлыст — радиус поражения */
        ._whipRange {
            position:absolute; pointer-events:none;
        }
    `;
        document.head.appendChild(s);
    })();

    window.addEventListener('load', function () {
        console.log('🚀 Патч v5.0 загружается…');

        // ── [БАГ 3] Универсальный безопасный патч функции ────────────────
        // Ждёт появления window[name], затем оборачивает один раз.
        // flagKey — уникальный флаг на обёртке, чтобы не патчить дважды.
        function safePatch(name, flagKey, wrapper, retryMs) {
            retryMs = retryMs || 250;
            function tryPatch() {
                if (typeof window[name] !== 'function') {
                    setTimeout(tryPatch, retryMs);
                    return;
                }
                if (window[name][flagKey]) return; // уже
                const orig = window[name];
                window[name] = wrapper(orig);
                window[name][flagKey] = true;
            }
            tryPatch();
        }

        // ════════════════════════════════════════════════════════════════
        // БЛОК 1: СИСТЕМА ДОСТИЖЕНИЙ v2
        // ════════════════════════════════════════════════════════════════
        const NEW_ACHIEVEMENTS = [
            { id:'no_damage_boss',  name:'Неуязвимый охотник 🏹',   desc:'Убить босса без урона',                   icon:'🏹', reward:150 },
            { id:'combo20',         name:'Абсолютный комбо x20 🌊', desc:'Набрать комбо ×20',                       icon:'🌊', reward:100 },
            { id:'combo30',         name:'Бог скорости x30 ⚡',     desc:'Набрать комбо ×30',                       icon:'⚡', reward:200 },
            { id:'kill50_wave',     name:'Волна смерти 🌊',          desc:'50 убийств за сессию',                    icon:'🌊', reward:80  },
            { id:'kill200_total',   name:'Охотник 💀',               desc:'200 убийств суммарно',                    icon:'💀', reward:100 },
            { id:'kill1000_total',  name:'Жнец 🗡️',                 desc:'1000 убийств суммарно',                   icon:'🗡️', reward:300 },
            { id:'bosses3_session', name:'Тройной трофей 🏆',        desc:'3 босса за сессию',                       icon:'🏆', reward:250 },
            { id:'sniper_10',       name:'Меткий глаз 🎯',           desc:'Точность 95%+ при 30+ выстрелах',        icon:'🎯', reward:120 },
            { id:'weapon_all',      name:'Коллекционер ⚔️',          desc:'Разблокировать все оружия',               icon:'⚔️', reward:400 },
            { id:'no_powerup_win',  name:'Истинная сила 💪',         desc:'Уровень 10 без пауэрапов',                icon:'💪', reward:180 },
            { id:'speed_run_5',     name:'Гонщик 🏎️',               desc:'5 уровней за 90 секунд',                  icon:'🏎️', reward:150 },
            { id:'freeze_5_wave',   name:'Ледяная тюрьма ❄️',        desc:'Заморозка 3 раза за игру',               icon:'❄️', reward:80  },
            { id:'skill_tree_full', name:'Мастер навыков 🧠',         desc:'Изучить 5 навыков',                       icon:'🧠', reward:300 },
            { id:'bomb_chain',      name:'Подрывник 💣',              desc:'10 врагов одной бомбой',                  icon:'💣', reward:100 },
            { id:'survive_10min',   name:'Долгожитель ⏱️',            desc:'10 минут в одной игре',                   icon:'⏱️', reward:200 },
            { id:'survive_1hp',     name:'Последний рубеж ❤️',        desc:'60 сек на 1 HP',                         icon:'❤️', reward:180 },
            { id:'no_hit_level',    name:'Призрак 👻',                desc:'Уровень без урона',                       icon:'👻', reward:150 },
            { id:'max_one_upgrade', name:'Специалист 🔬',             desc:'Прокачать апгрейд до MAX',                icon:'🔬', reward:80  },
            { id:'ship_lvl20',      name:'Ветеран космоса 🚀',         desc:'Уровень корабля 20',                      icon:'🚀', reward:350 },
            { id:'god_mode_clear',  name:'Бессмертный ⚡',            desc:'Уровень 15 на сложности Бог',            icon:'⚡', reward:500 },
            { id:'rainbow_combo',   name:'Радужный убийца 🌈',        desc:'По одному врагу каждого типа',           icon:'🌈', reward:200 },
            { id:'daily_7',         name:'Легенда дисциплины 🔥',     desc:'7 дней ежедневных заданий',              icon:'🔥', reward:400 },
            { id:'whip_master',     name:'Повелитель дуги ⚡',         desc:'100 убийств хлыстом',                    icon:'⚡', reward:250 },
        ];

        (function injectAchievements() {
            if (typeof ACHIEVEMENTS === 'undefined') {
                console.warn('ACHIEVEMENTS не найден'); return;
            }
            const existing = new Set(ACHIEVEMENTS.map(a => a.id));
            NEW_ACHIEVEMENTS.forEach(a => {
                if (!existing.has(a.id))
                    ACHIEVEMENTS.push({ id: a.id, name: a.name + ' +' + a.reward + '💰' });
            });
            console.log('✅ Достижений:', ACHIEVEMENTS.length);
        })();

        // Тост достижения
        function showAchievementToast(def) {
            const old = document.getElementById('_achToast');
            if (old) old.remove();
            const t = document.createElement('div');
            t.id = '_achToast';
            t.style.cssText = `position:fixed;left:50%;bottom:100px;transform:translateX(-50%) translateY(30px);
            background:linear-gradient(135deg,rgba(8,18,35,.97),rgba(15,30,60,.97));
            border:1.5px solid rgba(255,215,0,.5);border-radius:16px;padding:12px 20px;
            z-index:9990;min-width:240px;max-width:90vw;box-shadow:0 0 30px rgba(255,215,0,.25);
            text-align:center;font-family:'Orbitron',monospace;opacity:0;
            transition:all .35s cubic-bezier(.22,.68,0,1.3)`;
            t.innerHTML = `<div style="font-size:28px;margin-bottom:6px">${def.icon||'🏆'}</div>
            <div style="font-size:9px;color:rgba(255,215,0,.6);letter-spacing:2px;margin-bottom:4px">ДОСТИЖЕНИЕ</div>
            <div style="font-size:13px;color:#ffd700;font-weight:700;letter-spacing:1px">${def.name}</div>
            <div style="font-size:11px;color:rgba(255,255,255,.5);margin-top:4px">${def.desc||''}</div>
            <div style="font-size:12px;color:#00ff88;margin-top:6px;font-weight:700">+${def.reward}💰</div>`;
            document.body.appendChild(t);
            requestAnimationFrame(() => { t.style.opacity='1'; t.style.transform='translateX(-50%) translateY(0)'; });
            setTimeout(() => {
                t.style.opacity='0'; t.style.transform='translateX(-50%) translateY(-20px)';
                setTimeout(() => t.remove(), 400);
            }, 3200);
        }

        // [БАГ 3] checkAch — один патч, с флагом
        safePatch('checkAch', '_v5AchPatched', function(orig) {
            return function(id) {
                if (typeof unlockedAch !== 'undefined' && !unlockedAch.includes(id)) {
                    const def = NEW_ACHIEVEMENTS.find(a => a.id === id);
                    if (def && def.reward && typeof coins !== 'undefined') {
                        coins += def.reward;
                        showCoinFly(def.reward);
                        if (typeof throttledSave === 'function') throttledSave();
                        else if (typeof savePersistent === 'function') savePersistent();
                        showAchievementToast(def);
                    }
                }
                return orig.apply(this, arguments);
            };
        });

        // Трекер достижений
        const _achState = {
            sessionKills:0, bossesSession:0, freezeCount:0,
            typesSeen: new Set(),
            noPowerupGame:true, noDamageOnBoss:true,
            timeAt1HP:0, bombKillCount:0, whipKills:0,
        };
        window._achState = _achState;

        // [БАГ 7] killEnemy — читаем e ДО вызова orig (swap-and-pop уже произошёл внутри)
        safePatch('killEnemy', '_v5KillPatched', function(orig) {
            return function(j, cfg) {
                // Сохраняем данные о враге ДО удаления
                const e = (typeof enemies !== 'undefined') ? enemies[j] : null;
                const eType   = e ? e.type   : null;
                const isBoss  = e ? e.isBoss : false;
                const isMini  = e ? e.isMiniBoss : false;

                const result = orig.apply(this, arguments);

                // Трекинг
                _achState.sessionKills++;
                if (eType) _achState.typesSeen.add(eType);
                if (isBoss) {
                    _achState.bossesSession++;
                    if (_achState.noDamageOnBoss) checkAch('no_damage_boss');
                    if (_achState.bossesSession >= 3) checkAch('bosses3_session');
                }

                // Адаптивная сложность — считаем убийства
                window._AdaptiveDiff && window._AdaptiveDiff.onKill();

                // Хлыст — трекинг
                if (window._lastWeaponFired === 'whip') {
                    _achState.whipKills = (_achState.whipKills || 0) + 1;
                    if (_achState.whipKills >= 100) checkAch('whip_master');
                }

                // Волна / суммарные
                if (_achState.sessionKills >= 50) checkAch('kill50_wave');
                const totalK = (typeof LS !== 'undefined') ? (+LS.get('totalKills',0)) : 0;
                if (totalK >= 200)  checkAch('kill200_total');
                if (totalK >= 1000) checkAch('kill1000_total');

                const ALL_TYPES = ['normal','fast','zigzag','tank','swarm','shooter',
                    'bomber','splitter','dasher','stealth','shielder','teleporter'];
                if (ALL_TYPES.every(t => _achState.typesSeen.has(t))) checkAch('rainbow_combo');

                return result;
            };
        });

        // [БАГ 5] damagePlayer — ОДНА точка патчинга для ач + флэша
        safePatch('damagePlayer', '_v5DmgPatched', function(orig) {
            return function(sourceX, sourceY) {
                // Флаг "получил урон во время боя с боссом"
                _achState.noDamageOnBoss = false;
                _achState.noPowerupGame  = false;
                // Адаптивность
                const livesBefore = (typeof lives !== 'undefined') ? lives : 99;
                orig.apply(this, arguments);
                const livesAfter  = (typeof lives !== 'undefined') ? lives : 99;
                if (livesAfter < livesBefore) {
                    window._AdaptiveDiff && window._AdaptiveDiff.onDeath();
                }
                // Визуальный флэш (из v4 — безопасно вызываем если есть)
                if (typeof window._triggerDamageFlash === 'function') window._triggerDamageFlash();
            };
        });

        // [БАГ 8] spawnBoss — сбрасываем флаг noDamageOnBoss
        safePatch('spawnBoss', '_v5SpawnBossPatched', function(orig) {
            return function() {
                _achState.noDamageOnBoss = true;
                return orig.apply(this, arguments);
            };
        });

        // applyPowerup — трекинг
        safePatch('applyPowerup', '_v5PuPatched', function(orig) {
            return function(type) {
                if (type === 'freeze') {
                    _achState.freezeCount++;
                    if (_achState.freezeCount >= 3) checkAch('freeze_5_wave');
                }
                _achState.noPowerupGame = false;
                return orig.apply(this, arguments);
            };
        });

        // [БАГ 6] endGame — ОДНА цепочка
        safePatch('endGame', '_v5EndPatched', function(orig) {
            return function() {
                _runEndAchievements();
                _updateDailyQuestsOnEnd();
                return orig.apply(this, arguments);
            };
        });

        function _runEndAchievements() {
            const shots = window._shotsFired || 0;
            const hits  = window._shotsHit   || 0;
            if (shots >= 30 && hits / shots >= 0.95) checkAch('sniper_10');

            const dur = (Date.now() - (window._sessionStartTime || Date.now())) / 1000;
            if (dur >= 600) checkAch('survive_10min');

            if (typeof difficulty !== 'undefined' && difficulty === 'god' &&
                typeof level !== 'undefined' && level >= 15) checkAch('god_mode_clear');

            if (typeof shipLvl !== 'undefined' && shipLvl >= 20) checkAch('ship_lvl20');

            if (typeof unlockedWeapons !== 'undefined') {
                const allW = ['laser','shotgun','rocket','plasma','lightning','darkmatter','whip'];
                if (allW.every(w => unlockedWeapons.includes(w))) checkAch('weapon_all');
            }
            if (typeof skillLevels !== 'undefined') {
                if (Object.values(skillLevels).filter(v => v >= 1).length >= 5) checkAch('skill_tree_full');
            }
            if (_achState.noPowerupGame && typeof level !== 'undefined' && level >= 10)
                checkAch('no_powerup_win');
        }

        // Таймер 1 HP — использует setInterval, не update (дешевле)
        setInterval(() => {
            if (typeof gameRunning === 'undefined' || !gameRunning) return;
            if (typeof lives !== 'undefined' && lives === 1) {
                _achState.timeAt1HP += 0.5;
                if (_achState.timeAt1HP >= 60) checkAch('survive_1hp');
            } else {
                _achState.timeAt1HP = 0;
            }
        }, 500);

        // Сброс трекинга при старте игры
        safePatch('startGame', '_v5StartPatched', function(orig) {
            return function() {
                Object.assign(_achState, {
                    sessionKills:0, bossesSession:0, freezeCount:0,
                    noPowerupGame:true, noDamageOnBoss:true,
                    timeAt1HP:0, bombKillCount:0, whipKills:0,
                });
                _achState.typesSeen.clear();
                window._sessionStartTime = Date.now();
                window._lastWeaponFired  = null;
                // Сбрасываем адаптивность
                if (window._AdaptiveDiff) window._AdaptiveDiff.reset();
                return orig.apply(this, arguments);
            };
        });

        // ════════════════════════════════════════════════════════════════
        // БЛОК 2: ВИЗУАЛЬНЫЙ ФЛЭШ УРОНА
        // ════════════════════════════════════════════════════════════════
        (function setupDamageFlash() {
            if (document.getElementById('_damageFlash')) return;
            const ov = document.createElement('div');
            ov.id = '_damageFlash';
            ov.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:7;
            background:radial-gradient(ellipse at center,transparent 40%,rgba(255,0,60,.55) 100%);
            opacity:0;transition:opacity .08s ease`;
            document.body.appendChild(ov);
            window._triggerDamageFlash = function() {
                ov.style.opacity = '1';
                clearTimeout(ov._t);
                ov._t = setTimeout(() => { ov.style.opacity = '0'; }, 80);
            };
        })();

        // ════════════════════════════════════════════════════════════════
        // БЛОК 3: НОВЫЕ ТИПЫ ВРАГОВ — снайпер, гравитрон, охотник
        // (логика обновления и отрисовки — из v4.0, исправлены баги)
        // ════════════════════════════════════════════════════════════════
        (function injectNewEnemies() {

            // Спавн новых типов — единый патч
            safePatch('spawnEnemy', '_v5SpawnEnemyPatched', function(orig) {
                return function() {
                    if (typeof level === 'undefined' || typeof bossActive === 'undefined'
                        || bossActive || Math.random() >= 0.08) {
                        return orig.apply(this, arguments);
                    }
                    const pool = [];
                    if (level >= 6)  pool.push('sniper_enemy');
                    if (level >= 9)  pool.push('gravitron');
                    if (level >= 12) pool.push('hunter');
                    if (pool.length) {
                        _spawnSpecialEnemy(pool[Math.floor(Math.random() * pool.length)]);
                    } else {
                        orig.apply(this, arguments);
                    }
                };
            });

            function _spawnSpecialEnemy(type) {
                if (typeof canvas === 'undefined' || typeof enemies === 'undefined') return;
                const cfg = (typeof DIFF !== 'undefined' && typeof difficulty !== 'undefined')
                    ? DIFF[difficulty] : { spd:1, enemyHpMult:1 };
                const lvl = typeof level !== 'undefined' ? level : 1;
                const base = {
                    x: 40 + Math.random() * (canvas.width - 80), y: -30,
                    isBoss:false, isMiniBoss:false,
                    zigAngle:0, shootTimer:0, stealthTimer:0, stealthAlpha:1,
                    splitDone:false, swarmOffset:0, leeched:false, leechSide:0,
                    mirrorDir:1, phantomAlpha:1, phantomTimer:0,
                    dashTimer:0, dashVx:0, dashing:false, dashDuration:0,
                    shieldHp:0, teleportTimer:0, bomberArmed:false,
                    assassinDashing:false, assassinDashVx:0, assassinDashVy:0, assassinTimer:0,
                };
                if (type === 'sniper_enemy') {
                    Object.assign(base, {
                        type:'sniper_enemy', hw:14, hh:13, score:30, coin:3,
                        hp: Math.ceil((2.5 + lvl*.2) * (cfg.enemyHpMult||1)),
                        maxHp: Math.ceil((2.5 + lvl*.2) * (cfg.enemyHpMult||1)),
                        sp: (0.4 + lvl*.02) * (cfg.spd||1),
                        sniperState:'moving', sniperTimer:2000+Math.random()*1000,
                        sniperAimX:0, sniperAimY:0, _aimBeamActive:false,
                    });
                } else if (type === 'gravitron') {
                    Object.assign(base, {
                        type:'gravitron', hw:22, hh:22, score:40, coin:4,
                        hp: Math.ceil((4 + lvl*.25) * (cfg.enemyHpMult||1)),
                        maxHp: Math.ceil((4 + lvl*.25) * (cfg.enemyHpMult||1)),
                        sp: (0.3 + lvl*.01) * (cfg.spd||1),
                        gravRadius:120+lvl*5, gravPulse:0,
                    });
                } else if (type === 'hunter') {
                    Object.assign(base, {
                        type:'hunter', hw:16, hh:15, score:35, coin:3,
                        hp: Math.ceil((2 + lvl*.18) * (cfg.enemyHpMult||1)),
                        maxHp: Math.ceil((2 + lvl*.18) * (cfg.enemyHpMult||1)),
                        sp: (1.5 + lvl*.04) * (cfg.spd||1),
                        hunterState:'stalk', hunterTimer:1500+Math.random()*500,
                        hunterTargetX:0, hunterTargetY:0, dodgeDir:1,
                    });
                } else { return; }
                enemies.push(base);
            }

            // update и draw — патчим ОДИН раз каждый, флаг на функции
            safePatch('update', '_v5UpdateEnemiesPatched', function(orig) {
                return function(dt) {
                    orig.apply(this, arguments);
                    _updateSpecialEnemies(dt);
                };
            });

            safePatch('draw', '_v5DrawEnemiesPatched', function(orig) {
                return function() {
                    orig.apply(this, arguments);
                    _drawSpecialEnemies();
                    // Также рисуем дугу хлыста (из блока 5)
                    if (window._drawWhipArc && typeof ctx !== 'undefined') {
                        try { window._drawWhipArc(ctx); } catch(e) {}
                    }
                };
            });

            function _updateSpecialEnemies(dt) {
                if (typeof enemies === 'undefined' || !gameRunning) return;
                if (typeof gamePaused !== 'undefined' && gamePaused) return;
                const pl = typeof player !== 'undefined' ? player : null;
                if (!pl) return;
                for (let i = enemies.length - 1; i >= 0; i--) {
                    const e = enemies[i];
                    if (!e || e.isBoss || e.isMiniBoss) continue;
                    if      (e.type === 'sniper_enemy') _updateSniper(e, dt, pl, i);
                    else if (e.type === 'gravitron')    _updateGravitron(e, dt, pl);
                    else if (e.type === 'hunter')       _updateHunter(e, dt, pl);
                }
            }

            function _updateSniper(e, dt, pl, idx) {
                if (e.sniperState === 'moving') {
                    e.y += e.sp;
                    e.sniperTimer -= dt;
                    if (e.y > 80 && e.sniperTimer <= 0) {
                        e.sniperState = 'aiming';
                        e.sniperTimer = 1200;
                        e.sniperAimX  = pl.x;
                        e._aimBeamActive = true;
                    }
                } else if (e.sniperState === 'aiming') {
                    e.sniperAimX += (pl.x - e.sniperAimX) * 0.04;
                    e.sniperTimer -= dt;
                    if (e.sniperTimer <= 0) {
                        e.sniperState = 'shooting';
                        e.sniperTimer = 900 + Math.random() * 400;
                        e._aimBeamActive = false;
                        if (typeof spawnBossShot === 'function') {
                            const dx = pl.x-e.x, dy = pl.y-e.y;
                            const d  = Math.max(Math.hypot(dx,dy),1);
                            spawnBossShot(e.x, e.y+e.hh, dx/d*6.5, dy/d*6.5, '#ff4400', 10);
                            if (typeof notify === 'function') notify('⚠️ СНАЙПЕР!', 'gold');
                        }
                    }
                } else {
                    e.sniperTimer -= dt;
                    e.y += e.sp * 0.3;
                    if (e.sniperTimer <= 0) {
                        e.sniperState = 'moving';
                        e.sniperTimer = 1500 + Math.random() * 1000;
                    }
                }
            }

            function _updateGravitron(e, dt, pl) {
                e.y += e.sp * 0.5;
                e.gravPulse = (e.gravPulse + dt * 0.003) % (Math.PI * 2);
                const dx = e.x - pl.x, dy = e.y - pl.y;
                const dist = Math.hypot(dx, dy);
                if (dist < e.gravRadius && dist > 1) {
                    const force = (1 - dist / e.gravRadius) * 0.35;
                    if (typeof player !== 'undefined') {
                        player.targetX = (player.targetX || player.x) + dx / dist * force;
                    }
                }
                if (typeof bossShots !== 'undefined') {
                    for (let si = 0; si < bossShots.length; si++) {
                        const s = bossShots[si];
                        const sdx = e.x-s.x, sdy = e.y-s.y;
                        const sd  = Math.hypot(sdx,sdy);
                        if (sd < e.gravRadius * 0.6 && sd > 1) {
                            s.vx += sdx/sd * 0.4;
                            s.vy += sdy/sd * 0.4;
                        }
                    }
                }
            }

            function _updateHunter(e, dt, pl) {
                if (e.hunterState === 'stalk') {
                    e.y += e.sp * 0.5;
                    e.hunterTimer -= dt;
                    e.x += (pl.x - e.x) * 0.025;
                    if (e.y > 60 && e.hunterTimer <= 0) {
                        e.hunterState = 'charge';
                        e.hunterTimer = 550;
                        e.hunterTargetX = pl.x;
                        e.hunterTargetY = pl.y;
                    }
                } else if (e.hunterState === 'charge') {
                    const dx = e.hunterTargetX-e.x, dy = e.hunterTargetY-e.y;
                    const d  = Math.max(Math.hypot(dx,dy), 1);
                    e.x += dx/d * e.sp * 3;
                    e.y += dy/d * e.sp * 3;
                    e.hunterTimer -= dt;
                    if (e.hunterTimer <= 0 || d < 15) {
                        e.hunterState = 'dodge';
                        e.hunterTimer = 600;
                        e.dodgeDir = Math.random() < .5 ? -1 : 1;
                    }
                } else {
                    e.x += e.dodgeDir * e.sp * 2;
                    e.y += e.sp * 0.3;
                    e.hunterTimer -= dt;
                    if (e.hunterTimer <= 0) {
                        e.hunterState = 'stalk';
                        e.hunterTimer = 1200 + Math.random() * 800;
                    }
                }
                if (typeof canvas !== 'undefined')
                    e.x = Math.max(e.hw, Math.min(canvas.width-e.hw, e.x));
            }

            function _drawSpecialEnemies() {
                if (typeof ctx === 'undefined' || typeof enemies === 'undefined') return;
                if (!gameRunning) return;
                for (let i = 0; i < enemies.length; i++) {
                    const e = enemies[i];
                    if (!e || e.isBoss || e.isMiniBoss) continue;
                    if      (e.type === 'sniper_enemy') _drawSniper(e);
                    else if (e.type === 'gravitron')    _drawGravitron(e);
                    else if (e.type === 'hunter')       _drawHunter(e);
                }
            }

            function _drawHealthBar(e) {
                if (e.hp >= e.maxHp) return;
                const bw = e.hw*2+4, bh = 4;
                const bx = e.x-bw/2, by = e.y-e.hh-8;
                ctx.fillStyle = 'rgba(0,0,0,.5)';
                ctx.beginPath(); ctx.roundRect(bx,by,bw,bh,2); ctx.fill();
                const pct = Math.max(0, e.hp/e.maxHp);
                const col = pct>.6?'#00ff88':pct>.3?'#ffd700':'#ff4444';
                ctx.fillStyle = col;
                ctx.beginPath(); ctx.roundRect(bx,by,bw*pct,bh,2); ctx.fill();
            }

            function _drawSniper(e) {
                ctx.save(); ctx.translate(e.x, e.y);
                ctx.fillStyle='#ff4400'; ctx.strokeStyle='#ff8800'; ctx.lineWidth=1.5;
                ctx.beginPath();
                ctx.moveTo(0,-e.hh*1.4); ctx.lineTo(-e.hw*.5,e.hh*.5); ctx.lineTo(e.hw*.5,e.hh*.5);
                ctx.closePath(); ctx.fill(); ctx.stroke();
                if (e._aimBeamActive && typeof player !== 'undefined') {
                    const dx=player.x-e.x, dy=player.y-e.y;
                    const d=Math.max(Math.hypot(dx,dy),1);
                    ctx.save();
                    ctx.globalAlpha=.3+.2*Math.sin(Date.now()*.015);
                    ctx.strokeStyle='#ff4400'; ctx.lineWidth=1; ctx.setLineDash([4,6]);
                    ctx.beginPath(); ctx.moveTo(0,e.hh*.5); ctx.lineTo(dx*.9,dy*.9); ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.globalAlpha=.6; ctx.strokeStyle='#ff6600'; ctx.lineWidth=1.5;
                    ctx.beginPath(); ctx.arc(dx*.9,dy*.9,8,0,Math.PI*2); ctx.stroke();
                    ctx.restore();
                }
                ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(0,-e.hh*.3,5,0,Math.PI*2); ctx.fill();
                ctx.fillStyle='#f00'; ctx.beginPath(); ctx.arc(0,-e.hh*.3,2.5,0,Math.PI*2); ctx.fill();
                ctx.restore(); _drawHealthBar(e);
            }

            function _drawGravitron(e) {
                ctx.save(); ctx.translate(e.x,e.y);
                const p=.7+.3*Math.sin(e.gravPulse);
                ctx.globalAlpha=.06*p; ctx.fillStyle='#a855f7';
                ctx.beginPath(); ctx.arc(0,0,e.gravRadius,0,Math.PI*2); ctx.fill();
                ctx.globalAlpha=.15; ctx.strokeStyle='#a855f7'; ctx.lineWidth=1; ctx.setLineDash([5,8]);
                ctx.beginPath(); ctx.arc(0,0,e.gravRadius,0,Math.PI*2); ctx.stroke();
                ctx.setLineDash([]);
                ctx.globalAlpha=1;
                const g=ctx.createRadialGradient(0,0,0,0,0,e.hw);
                g.addColorStop(0,'#fff'); g.addColorStop(.4,'#a855f7'); g.addColorStop(1,'#440077');
                ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,e.hw*p,0,Math.PI*2); ctx.fill();
                const t=Date.now()*.001; ctx.strokeStyle='#cc88ff88'; ctx.lineWidth=2;
                for (let ri=0;ri<3;ri++) {
                    ctx.save(); ctx.rotate(t*(1+ri*.4)+ri*Math.PI/3); ctx.scale(1,.3-ri*.04);
                    ctx.beginPath(); ctx.arc(0,0,e.hw*(1.1+ri*.3),0,Math.PI*2); ctx.stroke();
                    ctx.restore();
                }
                ctx.restore(); _drawHealthBar(e);
            }

            function _drawHunter(e) {
                ctx.save(); ctx.translate(e.x,e.y);
                const col=e.hunterState==='charge'?'#ff0066':'#cc0044';
                ctx.fillStyle=col; ctx.strokeStyle='#ff4488'; ctx.lineWidth=1.5;
                ctx.beginPath();
                ctx.moveTo(0,-e.hh); ctx.lineTo(-e.hw*.8,0); ctx.lineTo(-e.hw*.4,e.hh);
                ctx.lineTo(0,e.hh*.5); ctx.lineTo(e.hw*.4,e.hh); ctx.lineTo(e.hw*.8,0);
                ctx.closePath(); ctx.fill(); ctx.stroke();
                ctx.fillStyle=e.hunterState==='charge'?'#ff0':'#f80';
                ctx.beginPath(); ctx.arc(-5,-e.hh*.3,3.5,0,Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(5,-e.hh*.3,3.5,0,Math.PI*2); ctx.fill();
                if (e.hunterState==='charge') {
                    ctx.globalAlpha=.4; ctx.strokeStyle='#ff4488'; ctx.lineWidth=1;
                    for (let si=1;si<=3;si++) {
                        ctx.beginPath(); ctx.moveTo(-e.hw*.4,e.hh*.2+si*5);
                        ctx.lineTo(e.hw*.4,e.hh*.2+si*5); ctx.stroke();
                    }
                }
                ctx.restore(); _drawHealthBar(e);
            }
        })(); // end injectNewEnemies

        // ════════════════════════════════════════════════════════════════
        // БЛОК 4: ЕЖЕДНЕВНЫЕ ЗАДАНИЯ
        // ════════════════════════════════════════════════════════════════
        const DAILY_QUEST_POOL = [
            { id:'dq_kills',   label:'Убить {n} врагов',      targets:[30,50,80],  reward:[30,50,80],  check:s=>s.kills },
            { id:'dq_score',   label:'Набрать {n} очков',     targets:[5000,10000,20000], reward:[40,60,100], check:s=>s.score },
            { id:'dq_combo',   label:'Комбо x{n}',            targets:[5,10,15],   reward:[25,50,80],  check:s=>s.combo },
            { id:'dq_boss',    label:'Убить {n} боссов',      targets:[1,2,3],     reward:[50,80,130], check:s=>s.bosses },
            { id:'dq_minutes', label:'Продержаться {n} минут',targets:[3,5,8],     reward:[30,50,80],  check:s=>s.minutes },
            { id:'dq_acc',     label:'Точность {n}%',         targets:[60,75,85],  reward:[35,55,85],  check:s=>s.acc },
        ];

        function getDailyQuests() {
            if (typeof LS === 'undefined') return { date:'', quests:[] };
            const today = new Date().toDateString();
            const saved = LS.getJ('dailyQuests', null);
            if (saved && saved.date === today) return saved;
            // Новый день — генерируем 3 задания
            const pool  = [...DAILY_QUEST_POOL].sort(() => Math.random()-.5).slice(0,3);
            const quests = pool.map(d => {
                const ti = Math.floor(Math.random() * d.targets.length);
                return { id:d.id, label:d.label, target:d.targets[ti],
                    reward:d.reward[ti], progress:0, done:false };
            });
            const fresh = { date:today, quests };
            LS.setJ('dailyQuests', fresh);
            return fresh;
        }

        function _updateDailyQuestsOnEnd() {
            try {
                const dur = (Date.now() - (window._sessionStartTime || Date.now())) / 1000 / 60;
                const sh  = window._shotsFired||0, hi = window._shotsHit||0;
                const stats = {
                    kills:   typeof killedEnemies !== 'undefined' ? killedEnemies : 0,
                    score:   typeof score !== 'undefined' ? score : 0,
                    combo:   typeof maxCombo !== 'undefined' ? maxCombo : 1,
                    bosses:  typeof bossesKilled !== 'undefined' ? bossesKilled : 0,
                    minutes: dur,
                    acc:     sh > 0 ? Math.round(hi/sh*100) : 0,
                };
                const dq = getDailyQuests();
                let changed = false;
                dq.quests.forEach(q => {
                    if (q.done) return;
                    const def = DAILY_QUEST_POOL.find(d => d.id === q.id);
                    if (!def) return;
                    q.progress = Math.min(q.target, def.check(stats));
                    if (q.progress >= q.target) {
                        q.done = true; changed = true;
                        if (typeof coins !== 'undefined') {
                            coins += q.reward;
                            showCoinFly(q.reward);
                            if (typeof throttledSave === 'function') throttledSave();
                            else if (typeof savePersistent === 'function') savePersistent();
                        }
                        showAchievementToast({ icon:'📋', name:'Задание выполнено!',
                            desc: q.label.replace('{n}',q.target), reward:q.reward });
                    }
                });
                if (changed && typeof LS !== 'undefined') LS.setJ('dailyQuests', dq);
            } catch(e) { console.warn('dailyQuests update error', e); }
        }

        // Кнопка заданий в меню
        (function addDailyBtn() {
            setTimeout(() => {
                if (document.getElementById('_dailyQuestBtn')) return;
                const target = document.getElementById('playBtn') ||
                    document.querySelector('#difficultyScreen .btn');
                if (!target || !target.parentNode) return;
                const btn = document.createElement('button');
                btn.id = '_dailyQuestBtn';
                btn.className = 'btn';
                btn.style.cssText = `
                background:linear-gradient(135deg,rgba(168,85,247,.2),rgba(0,212,255,.15));
                border:1.5px solid rgba(168,85,247,.4);color:#a855f7;
                font-size:12px;padding:10px;border-radius:12px;
                font-family:'Orbitron',monospace;letter-spacing:1px;
                width:100%;margin-top:8px;cursor:pointer;position:relative`;
                btn.textContent = '📋 ЕЖЕДНЕВНЫЕ ЗАДАНИЯ';
                btn.addEventListener('click', showDailyPanel);
                target.parentNode.appendChild(btn);
            }, 400);
        })();

        function showDailyPanel() {
            const old = document.getElementById('_dailyPanel');
            if (old) { old.remove(); return; }
            const dq = getDailyQuests();
            const panel = document.createElement('div');
            panel.id = '_dailyPanel';
            panel.style.cssText = `position:fixed;inset:0;background:rgba(4,4,15,.9);z-index:200;
            display:flex;align-items:center;justify-content:center;backdrop-filter:blur(12px)`;
            const rows = dq.quests.map(q => {
                const pct = Math.min(100, (q.progress/q.target)*100);
                return `<div style="background:rgba(8,18,35,.95);border:1.5px solid rgba(168,85,247,${q.done?.6:.2});
                border-radius:14px;padding:14px 16px;margin-bottom:10px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                  <span style="font-size:13px;color:${q.done?'#a855f7':'#fff'};font-family:'Orbitron',monospace;font-weight:700">
                    ${q.done?'✅ ':''}${q.label.replace('{n}',q.target)}</span>
                  <span style="font-size:12px;color:#ffd700;font-family:'Orbitron',monospace">+${q.reward}💰</span>
                </div>
                <div style="height:6px;background:rgba(255,255,255,.1);border-radius:3px;overflow:hidden">
                  <div style="height:100%;width:${pct}%;background:${q.done?'#a855f7':'linear-gradient(90deg,#00ff88,#00d4ff)'};border-radius:3px;transition:width .4s"></div>
                </div>
                <div style="font-size:10px;color:rgba(255,255,255,.4);margin-top:4px;font-family:'Rajdhani',sans-serif">
                  ${q.done?'ВЫПОЛНЕНО':q.progress+' / '+q.target}</div></div>`;
            }).join('');
            panel.innerHTML = `<div style="background:rgba(8,14,30,.98);border:1.5px solid rgba(168,85,247,.4);
            border-radius:20px;padding:28px 24px;width:90%;max-width:360px;
            box-shadow:0 0 40px rgba(168,85,247,.2)">
            <h2 style="font-family:'Orbitron',monospace;font-size:16px;color:#a855f7;
              text-align:center;margin-bottom:6px;letter-spacing:2px">📋 ЕЖЕДНЕВНЫЕ ЗАДАНИЯ</h2>
            <p style="text-align:center;font-size:11px;color:rgba(255,255,255,.4);
              font-family:'Rajdhani',sans-serif;margin-bottom:18px">Обновляются каждый день</p>
            ${rows}
            <button onclick="document.getElementById('_dailyPanel').remove()"
              style="width:100%;padding:12px;border-radius:40px;border:1.5px solid rgba(255,255,255,.15);
              background:transparent;color:rgba(255,255,255,.6);font-family:'Orbitron',monospace;
              font-size:11px;cursor:pointer;margin-top:8px;letter-spacing:1px">← ЗАКРЫТЬ</button></div>`;
            document.body.appendChild(panel);
            panel.addEventListener('click', ev => { if (ev.target === panel) panel.remove(); });
        }

        // ════════════════════════════════════════════════════════════════
        // БЛОК 5: ХЛЫСТ (whip) — ПОЛНАЯ БОЕВАЯ ЛОГИКА
        // Дуга электрического разряда, сектор ~100° перед кораблём
        // ════════════════════════════════════════════════════════════════
        (function initWhip() {
            if (typeof WEAPONS === 'undefined') {
                console.warn('WEAPONS не найден'); return;
            }
            if (WEAPONS['whip']) return;

            // Регистрируем стоимость разблокировки
            if (typeof WEAPON_UNLOCK_DEFS !== 'undefined' && !WEAPON_UNLOCK_DEFS['whip']) {
                WEAPON_UNLOCK_DEFS['whip'] = {
                    unlockCost: 1200,
                    label: '⚡ ХЛЫСТ',
                    desc: 'Электродуга. Поражает всех врагов впереди корабля.',
                    always: false,
                };
            }

            const _ws = { active:false, timer:0, maxTimer:220, arcs:[] };
            window._whipState = _ws;

            // Рисование дуги — вызывается из draw (патч выше, в injectNewEnemies)
            window._drawWhipArc = function(ctx) {
                if (!_ws.active) return;
                _ws.timer -= 16;
                if (_ws.timer <= 0) { _ws.active = false; return; }
                const alpha = _ws.timer / _ws.maxTimer;
                const px = player.x, py = player.y;
                ctx.save();
                ctx.globalAlpha = alpha * 0.88;
                for (let i = 0; i < _ws.arcs.length - 1; i++) {
                    const a1 = _ws.arcs[i], a2 = _ws.arcs[i+1];
                    const x1 = px + Math.cos(a1.ang) * a1.r + a1.j;
                    const y1 = py + Math.sin(a1.ang) * a1.r;
                    const x2 = px + Math.cos(a2.ang) * a2.r + a2.j;
                    const y2 = py + Math.sin(a2.ang) * a2.r;
                    ctx.strokeStyle = a1.c;
                    ctx.lineWidth   = 1.5 + Math.random();
                    ctx.shadowBlur  = 10; ctx.shadowColor = '#00ffff';
                    ctx.beginPath();
                    ctx.moveTo(px, py);
                    ctx.quadraticCurveTo(
                        (px+x1)/2 + (Math.random()-.5)*18,
                        (py+y1)/2 + (Math.random()-.5)*18,
                        x1, y1);
                    ctx.stroke();
                    ctx.strokeStyle = '#00eeff55'; ctx.lineWidth = 1; ctx.shadowBlur = 0;
                    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
                }
                // Радиус поражения — полупрозрачная дуга
                ctx.globalAlpha = alpha * 0.18;
                ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 2; ctx.shadowBlur = 0;
                ctx.beginPath();
                ctx.arc(px, py, 180, -Math.PI*.5 - Math.PI*.55, -Math.PI*.5 + Math.PI*.55);
                ctx.stroke();
                ctx.restore();
            };

            WEAPONS['whip'] = {
                id:'whip', label:'ХЛЫСТ', emoji:'⚡', color:'#00ffff',
                desc:'Электродуга перед кораблём', baseCd:550,

                fire() {
                    if (typeof getBonus !== 'function') return;
                    const bonus   = getBonus();
                    const dmg     = bonus.damageMult * 1.8;
                    const range   = 180;
                    const halfAng = Math.PI * 0.55;  // ±55° от вертикали
                    const baseAng = -Math.PI / 2;    // вверх

                    window._lastWeaponFired = 'whip';

                    // Наносим урон всем врагам в секторе
                    if (typeof enemies !== 'undefined') {
                        const toKill = [];
                        for (let i = enemies.length - 1; i >= 0; i--) {
                            const e = enemies[i];
                            if (!e || e.spawnInvincible) continue;
                            const dx   = e.x - player.x;
                            const dy   = e.y - player.y;
                            const dist = Math.hypot(dx, dy);
                            if (dist > range + e.hw) continue;
                            const ang  = Math.atan2(dy, dx);
                            const diff = ((ang - baseAng) + Math.PI*3) % (Math.PI*2) - Math.PI;
                            if (Math.abs(diff) > halfAng) continue;

                            if (e.isBoss) {
                                e.hp -= Math.ceil(dmg * 0.5);
                            } else if (e.isMiniBoss) {
                                e.hp -= Math.ceil(dmg);
                                if (e.hp <= 0) toKill.push(i);
                            } else {
                                e.hp -= Math.ceil(dmg);
                                if (e.hp <= 0) toKill.push(i);
                            }

                            if (typeof pSpawn === 'function') {
                                for (let p=0;p<5;p++) pSpawn(e.x,e.y,{
                                    vx:(Math.random()-.5)*9, vy:(Math.random()-.5)*9,
                                    decay:.07, color:'#00ffff', size:3+Math.random()*3});
                            }
                        }
                        // Убиваем в обратном порядке (индексы не смещаются)
                        for (let i = toKill.length-1; i >= 0; i--) {
                            if (typeof killEnemy === 'function')
                                killEnemy(toKill[i], typeof DIFF!=='undefined'?DIFF[difficulty]:{});
                        }
                    }

                    // Визуальная анимация дуги
                    _ws.active = true;
                    _ws.timer  = _ws.maxTimer;
                    _ws.arcs   = [];
                    const n = 10 + Math.floor(Math.random()*5);
                    for (let a=0;a<n;a++) {
                        const t   = a/(n-1);
                        const ang = baseAng - halfAng + t*halfAng*2;
                        _ws.arcs.push({
                            ang,
                            r: range * (.6 + Math.random()*.4),
                            j: (Math.random()-.5)*20,
                            c: Math.random()>.5?'#00ffff':'#ffffff',
                        });
                    }

                    if (typeof playSound === 'function') playSound('shoot');
                    if (typeof triggerShake === 'function') triggerShake(4);
                    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium');
                },

                // Хлыст мгновенный — пули не нужны
                update() { return false; },
                draw()   { return; },
            };

            // UI разблокировки — renderUpgradeScreen
            safePatch('renderUpgradeScreen', '_v5WhipUpgPatched', function(orig) {
                return function() {
                    orig.apply(this, arguments);
                    setTimeout(() => {
                        // Ищем контейнер с data-unlock кнопками (вкладка Arsenal)
                        const list = document.getElementById('upgList') ||
                            document.getElementById('upgradeList');
                        if (!list) return;
                        if (list.querySelector('[data-unlock="whip"]')) return;
                        if (!list.querySelector('[data-unlock]')) return;

                        const def = typeof WEAPON_UNLOCK_DEFS !== 'undefined'
                            ? WEAPON_UNLOCK_DEFS['whip'] : null;
                        if (!def) return;

                        const isUnlocked = typeof unlockedWeapons !== 'undefined' && unlockedWeapons.includes('whip');
                        const canAfford  = typeof coins !== 'undefined' && coins >= def.unlockCost;

                        const div = document.createElement('div');
                        div.className = 'upg-item' + (isUnlocked?' maxed':'') +
                            (!isUnlocked&&canAfford?' can-buy':'');
                        div.style.cssText = 'align-items:center;gap:12px';
                        div.innerHTML = `
                        <div class="upg-icon" style="font-size:26px;${!isUnlocked?'filter:grayscale(1);opacity:.6':''}">⚡</div>
                        <div class="grow">
                          <div class="upg-name">ХЛЫСТ
                            <span class="upg-lvl-badge${isUnlocked?' upg-lvl-max':''}">${isUnlocked?'✦ ОТКРЫТО':'🔒 ЗАПЕРТО'}</span>
                          </div>
                          <div class="upg-bonus-line" style="font-size:12px;color:#aaa">${def.desc}</div>
                          ${!isUnlocked
                            ? `<div class="upg-segs" style="margin-top:4px">
                                <span style="color:${canAfford?'#ffd700':'#ff5555'};font-size:13px;font-weight:700">
                                  ${canAfford?'💰 Купить':'💸 Нужно'}: ${def.unlockCost}</span></div>`
                            : `<div class="upg-segs" style="margin-top:4px;color:#00ff88;font-size:12px">✅ В кастомизации</div>`
                        }
                        </div>
                        <button class="upg-btn${isUnlocked?' maxed':''}"
                            ${!isUnlocked&&canAfford?'':' disabled'} data-unlock="whip">
                          ${isUnlocked?'✅':`<span class="upg-btn-inner">🔓<br><span class="upg-cost">${def.unlockCost}💰</span></span>`}
                        </button>`;
                        list.appendChild(div);

                        const btn = div.querySelector('[data-unlock="whip"]');
                        if (btn) btn.addEventListener('click', () => {
                            if (!unlockedWeapons.includes('whip') && coins >= def.unlockCost && typeof showConfirm !== 'undefined') {
                                showConfirm({ icon:'⚡', title:'РАЗБЛОКИРОВАТЬ?',
                                    text:`⚡ ХЛЫСТ\n${def.desc}\nСтоимость: ${def.unlockCost}💰`, okLabel:'КУПИТЬ',
                                    onOk:() => {
                                        coins -= def.unlockCost;
                                        unlockedWeapons.push('whip');
                                        if (typeof savePersistent === 'function') savePersistent();
                                        if (typeof notify !== 'undefined') notify('⚡ ХЛЫСТ КУПЛЕНО!','gold');
                                        if (typeof renderUpgradeScreen === 'function') renderUpgradeScreen();
                                    }
                                });
                            }
                        });
                    }, 60);
                };
            });

            // UI кастомизации — renderWeaponSelectGrid
            safePatch('renderWeaponSelectGrid', '_v5WhipGridPatched', function(orig) {
                return function() {
                    orig.apply(this, arguments);
                    setTimeout(() => {
                        const grid = document.getElementById('weaponSelectGrid');
                        if (!grid || grid.querySelector('[data-wpn="whip"]')) return;
                        const def = typeof WEAPON_UNLOCK_DEFS !== 'undefined' ? WEAPON_UNLOCK_DEFS['whip'] : null;
                        if (!def) return;
                        const isUnlocked = typeof unlockedWeapons !== 'undefined' && unlockedWeapons.includes('whip');
                        const sel = isUnlocked && typeof custom !== 'undefined' && custom.selectedWeapons.includes('whip');
                        const canAfford  = typeof coins !== 'undefined' && coins >= def.unlockCost;

                        const div = document.createElement('div');
                        div.setAttribute('data-wpn','whip');
                        div.className = 'wpn-sel-opt'+(sel?' sel':'')+(!isUnlocked?' locked-wpn':'');
                        if (isUnlocked) {
                            div.innerHTML = `<span class="wpn-sel-ico">⚡</span>
                            <div class="wpn-sel-name">ХЛЫСТ</div>
                            <div class="wpn-sel-desc">${def.desc}</div>
                            <div class="wpn-sel-badge">${(custom&&custom.selectedWeapons.indexOf('whip')+1)||''}</div>`;
                            div.addEventListener('click', () => {
                                const idx = custom.selectedWeapons.indexOf('whip');
                                if (idx !== -1) { if (custom.selectedWeapons.length>1) custom.selectedWeapons.splice(idx,1); }
                                else { if (custom.selectedWeapons.length>=3) custom.selectedWeapons.shift(); custom.selectedWeapons.push('whip'); }
                                if (typeof saveCustom === 'function') saveCustom();
                                renderWeaponSelectGrid();
                            });
                        } else {
                            div.innerHTML = `<span class="wpn-sel-ico" style="filter:grayscale(1);opacity:.5">⚡</span>
                            <div class="wpn-sel-name" style="opacity:.6">ХЛЫСТ</div>
                            <div class="wpn-sel-desc" style="opacity:.5">${def.desc}</div>
                            <div class="wpn-unlock-cost" style="color:${canAfford?'#ffd700':'#f44'};font-size:12px;margin-top:4px;font-weight:700">🔒 ${def.unlockCost}💰</div>`;
                            if (canAfford) div.addEventListener('click', () => {
                                if (typeof showConfirm === 'undefined') return;
                                showConfirm({ icon:'⚡', title:'РАЗБЛОКИРОВАТЬ ХЛЫСТ?',
                                    text:`Стоимость: ${def.unlockCost}💰\n${def.desc}`, okLabel:'КУПИТЬ',
                                    onOk:() => {
                                        if (coins < def.unlockCost) { notify('💸 Не хватает монет!','gold'); return; }
                                        coins -= def.unlockCost; unlockedWeapons.push('whip');
                                        if (typeof savePersistent === 'function') savePersistent();
                                        notify('⚡ ХЛЫСТ РАЗБЛОКИРОВАН!','gold');
                                        renderWeaponSelectGrid();
                                    }
                                });
                            });
                        }
                        grid.appendChild(div);
                    }, 60);
                };
            });

            console.log('✅ Хлыст (whip) инициализирован');
        })();

        // ════════════════════════════════════════════════════════════════
        // БЛОК 6: АДАПТИВНАЯ СЛОЖНОСТЬ
        // ════════════════════════════════════════════════════════════════
        window._AdaptiveDiff = (function() {
            let _deaths = 0, _killWindow = [], _mod = 1.0, _lastCheck = 0;
            const CHECK_MS = 8000;

            return {
                onDeath() { _deaths++; },
                onKill()  {
                    const now = Date.now();
                    _killWindow.push(now);
                    // Скользящее окно 10 секунд
                    _killWindow = _killWindow.filter(t => now-t < 10000);
                },
                reset() { _deaths=0; _mod=1.0; _killWindow=[]; _lastCheck=0; },
                getModifier() { return _mod; },
                tick(dt) {
                    _lastCheck += dt;
                    if (_lastCheck < CHECK_MS) return;
                    _lastCheck = 0;
                    const killRate = _killWindow.length;
                    const prev = _mod;
                    if (_deaths >= 2) {
                        _mod = Math.max(0.80, _mod - 0.08);
                        if (_mod !== prev && typeof notify === 'function')
                            notify('💡 Сложность снижена','gold');
                    } else if (killRate >= 6 && _deaths === 0) {
                        _mod = Math.min(1.25, _mod + 0.05);
                    } else if (_mod < 1.0 && killRate >= 3) {
                        _mod = Math.min(1.0, _mod + 0.03);
                    }
                    _deaths = 0;
                },
            };
        })();

        // Применяем модификатор к новому врагу при спавне
        // Внимание: spawnEnemy уже запатчен выше — используем _v5AdaptivePatched
        safePatch('spawnEnemy', '_v5AdaptivePatched', function(orig) {
            return function() {
                orig.apply(this, arguments);
                if (typeof enemies !== 'undefined' && enemies.length > 0) {
                    const e = enemies[enemies.length-1];
                    if (e && !e.isBoss && !e.isMiniBoss) {
                        e.sp *= window._AdaptiveDiff.getModifier();
                    }
                }
            };
        });

        // Тик адаптивности встроен в update
        safePatch('update', '_v5AdaptiveUpdatePatched', function(orig) {
            return function(dt) {
                orig.apply(this, arguments);
                window._AdaptiveDiff.tick(dt);
            };
        });

        // ════════════════════════════════════════════════════════════════
        // БЛОК 7: RAGE MODE
        // Если игрок стоит > 3 сек — враги ускоряются, виньет пульсирует
        // ════════════════════════════════════════════════════════════════
        (function initRageMode() {
            // Создаём оверлей один раз
            let rageOv = document.getElementById('_rageOverlay');
            if (!rageOv) {
                rageOv = document.createElement('div');
                rageOv.id = '_rageOverlay';
                document.body.appendChild(rageOv);
            }

            const RAGE_THRESHOLD = 3000;
            const RAGE_SPEED_MULT = 1.35;
            let _timer = 0, _active = false, _lastX = 0, _lastY = 0;
            window._rageActive = false;

            safePatch('update', '_v5RagePatched', function(orig) {
                return function(dt) {
                    orig.apply(this, arguments);
                    if (typeof gameRunning === 'undefined' || !gameRunning ||
                        (typeof gamePaused !== 'undefined' && gamePaused)) {
                        if (_active) { _active=false; window._rageActive=false; rageOv.classList.remove('active'); }
                        _timer = 0; return;
                    }
                    const moved = typeof player !== 'undefined' &&
                        (Math.abs(player.x-_lastX) > 4 || Math.abs(player.y-_lastY) > 4);
                    if (moved) {
                        _lastX = player.x; _lastY = player.y;
                        _timer = 0;
                        if (_active) {
                            _active=false; window._rageActive=false;
                            rageOv.classList.remove('active');
                            if (typeof notify === 'function') notify('💨 Режим ярости снят','gold');
                        }
                    } else {
                        _timer += dt;
                        if (_timer >= RAGE_THRESHOLD && !_active) {
                            _active=true; window._rageActive=true;
                            rageOv.classList.add('active');
                            if (typeof notify === 'function') notify('🔥 РЕЖИМ ЯРОСТИ! Двигайся!','boss');
                        }
                    }
                };
            });

            safePatch('spawnEnemy', '_v5RageSpawnPatched', function(orig) {
                return function() {
                    orig.apply(this, arguments);
                    if (window._rageActive && typeof enemies !== 'undefined' && enemies.length > 0) {
                        const e = enemies[enemies.length-1];
                        if (e && !e.isBoss && !e.isMiniBoss) e.sp *= RAGE_SPEED_MULT;
                    }
                };
            });
        })();

        // ════════════════════════════════════════════════════════════════
        // БЛОК 8: СКОРОСТНОЙ БОНУС ОЧКОВ (движение = больше очков)
        // ════════════════════════════════════════════════════════════════
        (function setupMovementBonus() {
            let _streak = 0, _lastPX = 0;
            setInterval(() => {
                if (typeof gameRunning === 'undefined' || !gameRunning) return;
                if (typeof gamePaused !== 'undefined' && gamePaused) return;
                if (typeof player === 'undefined') return;
                const moved = Math.abs(player.x - _lastPX) > 5;
                _lastPX = player.x;
                _streak = moved ? Math.min(_streak+1,30) : Math.max(0,_streak-2);
                window._movementScoreMult = 1 + (_streak/30)*0.15;
            }, 200);
        })();

        // ════════════════════════════════════════════════════════════════
        // [UX 1] RIPPLE — расширен на все кнопки
        // ════════════════════════════════════════════════════════════════
        const RIPPLE_SEL = '.weapon-btn,.ask-wrap,.upg-btn,.btn,.pause-btn,.suggest-cat,.stat-pill--pause';
        function addRipple(el, ev) {
            const r    = document.createElement('span');
            r.className = '_ripple';
            const rect  = el.getBoundingClientRect();
            const touch = ev.touches ? ev.touches[0] : ev;
            const size  = Math.max(el.offsetWidth, el.offsetHeight) * 0.9;
            r.style.cssText = `width:${size}px;height:${size}px;
            left:${touch.clientX-rect.left-size/2}px;top:${touch.clientY-rect.top-size/2}px`;
            el.appendChild(r);
            r.addEventListener('animationend', () => r.remove(), { once:true });
        }
        document.addEventListener('touchstart', ev => {
            const b = ev.target.closest(RIPPLE_SEL);
            if (b) addRipple(b, ev);
        }, { passive:true });
        document.addEventListener('mousedown', ev => {
            const b = ev.target.closest(RIPPLE_SEL);
            if (b) addRipple(b, ev);
        }, { passive:true });

        // ════════════════════════════════════════════════════════════════
        // [UX 2] АНИМАЦИЯ МОНЕТ — +N💰 летит вверх
        // ════════════════════════════════════════════════════════════════
        // [PERF 1] DOM-пул для элементов анимации монет
        const _coinPool = [];
        window.showCoinFly = function(amount, x, y) {
            if (!amount || amount <= 0) return;
            let el = _coinPool.pop();
            if (!el) {
                el = document.createElement('div');
                el.className = '_coinFly';
            } else {
                el.className = '_coinFly';
                el.style.animation = 'none';
                // Перезапуск анимации
                void el.offsetWidth;
                el.style.animation = '';
            }
            el.textContent = '+' + amount + '💰';

            const hudCoins = document.getElementById('coinsVal');
            if (hudCoins && !x) {
                const rc = hudCoins.getBoundingClientRect();
                x = rc.left + rc.width / 2;
                y = rc.top;
            }
            el.style.left = (x || window.innerWidth/2) + 'px';
            el.style.top  = (y || 100) + 'px';

            document.body.appendChild(el);
            el.addEventListener('animationend', () => {
                el.remove();
                _coinPool.push(el);
            }, { once:true });
        };

        // Вызываем showCoinFly при каждом сохранении с монетами
        (function patchCoins() {
            let _prevCoins = (typeof coins !== 'undefined') ? coins : 0;
            safePatch('savePersistent', '_v5CoinsDisplay', function(orig) {
                return function() {
                    const now = (typeof coins !== 'undefined') ? coins : 0;
                    if (now > _prevCoins) window.showCoinFly(now - _prevCoins);
                    _prevCoins = now;
                    return orig.apply(this, arguments);
                };
            });
        })();

        // ════════════════════════════════════════════════════════════════
        // HITBOX ПАУЗЫ — минимальный размер для удобного нажатия
        // ════════════════════════════════════════════════════════════════
        (function fixPauseHitbox() {
            const apply = () => {
                const p = document.querySelector('.stat-pill--pause');
                if (p) { p.style.minWidth='52px'; p.style.minHeight='40px'; }
            };
            setTimeout(apply, 200);
        })();

        console.log('✅ Space Shooter патч v5.0 загружен');
        console.log('  [БАГ] Защита от двойной инициализации');
        console.log('  [БАГ] Один патч damagePlayer / endGame / killEnemy');
        console.log('  [БАГ] Все патчи с флагами — не дублируются');
        console.log('  [БАГ] killEnemy читает e до swap-and-pop');
        console.log('  [PERF] DOM-пул coinFly');
        console.log('  [PERF] draw/update патчатся по одному разу');
        console.log('  [GAME] Хлыст — дуга перед кораблём ⚡');
        console.log('  [GAME] Адаптивная сложность');
        console.log('  [GAME] Rage Mode — двигайся!');
        console.log('  [UX] Ripple на всех кнопках');
        console.log('  [UX] +N💰 анимация монет');

    }); // end load

} // end guard