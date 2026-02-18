// ════════════════════════════════════════════════════════════════
// SPACE SHOOTER - УЛУЧШЕНИЯ v2.0 (ДЛЯ ОТДЕЛЬНОГО JS ФАЙЛА)
// Добавьте в КОНЕЦ вашего game-improvements.js файла
// ════════════════════════════════════════════════════════════════

// ЖДЁМ ЗАГРУЗКИ DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initImprovements);
} else {
    initImprovements();
}

function initImprovements() {
    console.log('🔧 Инициализация улучшений v2.0...');

    // ════════════════════════════════════════════════════════════════
    // 1. ВСТУПИТЕЛЬНАЯ АНИМАЦИЯ
    // ════════════════════════════════════════════════════════════════

    window.IntroAnimation = {
        active: false,
        texts: [
            "Год 2157...",
            "Враждебные силы угрожают галактике",
            "Вы — последняя надежда человечества",
            "НАЧАЛО МИССИИ"
        ],

        show(callback) {
            this.active = true;

            const overlay = document.createElement('div');
            overlay.id = 'introOverlay';
            overlay.style.cssText = `
                position: fixed;
                inset: 0;
                background: linear-gradient(180deg, #000814 0%, #001d3d 50%, #000814 100%);
                z-index: 1000;
                display: flex;
                align-items: center;
                justify-content: center;
            `;

            const textEl = document.createElement('div');
            textEl.style.cssText = `
                font-family: 'Orbitron', monospace;
                font-size: 24px;
                color: #00ff88;
                text-shadow: 0 0 20px #00ff88;
                text-align: center;
                padding: 20px;
                max-width: 90%;
            `;

            overlay.appendChild(textEl);
            document.body.appendChild(overlay);

            // Стили
            if(!document.getElementById('introStyles')) {
                const style = document.createElement('style');
                style.id = 'introStyles';
                style.textContent = `
                    @keyframes introFade {
                        0%, 100% { opacity: 0; transform: translateY(20px); }
                        50% { opacity: 1; transform: translateY(0); }
                    }
                `;
                document.head.appendChild(style);
            }

            let currentIndex = 0;

            const showNext = () => {
                if(!this.active || currentIndex >= this.texts.length) {
                    overlay.style.transition = 'opacity 1s';
                    overlay.style.opacity = '0';
                    setTimeout(() => {
                        overlay.remove();
                        this.active = false;
                        if(callback) callback();
                    }, 1000);
                    return;
                }

                textEl.textContent = this.texts[currentIndex];
                textEl.style.animation = 'introFade 1.5s ease-in-out';

                // Вибрация если доступна
                if(window.Telegram?.WebApp?.HapticFeedback) {
                    window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                }

                currentIndex++;
                setTimeout(showNext, 1750);
            };

            showNext();

            // Пропуск по клику
            overlay.addEventListener('click', () => {
                this.active = false;
                overlay.remove();
                if(callback) callback();
            });
        }
    };

    // ════════════════════════════════════════════════════════════════
    // 2. АНИМАЦИЯ БОССА
    // ════════════════════════════════════════════════════════════════

    window.BossAnimation = {
        show(bossName) {
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.95);
                z-index: 999;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
            `;

            const warning = document.createElement('div');
            warning.style.cssText = `
                font-family: 'Orbitron', monospace;
                font-size: 48px;
                color: #ff0066;
                text-shadow: 0 0 30px #ff0066;
                margin-bottom: 30px;
                animation: bossWarning 0.5s infinite;
            `;
            warning.textContent = '⚠️ WARNING ⚠️';

            const nameEl = document.createElement('div');
            nameEl.style.cssText = `
                font-family: 'Orbitron', monospace;
                font-size: 32px;
                color: #ff0066;
                text-shadow: 0 0 40px #ff0066;
                text-align: center;
                padding: 0 20px;
                animation: bossAppear 1s ease-out;
            `;
            nameEl.textContent = bossName || 'BOSS DETECTED';

            overlay.appendChild(warning);
            overlay.appendChild(nameEl);
            document.body.appendChild(overlay);

            // Стили
            if(!document.getElementById('bossStyles')) {
                const style = document.createElement('style');
                style.id = 'bossStyles';
                style.textContent = `
                    @keyframes bossWarning {
                        0%, 100% { transform: scale(1); }
                        50% { transform: scale(1.1); }
                    }
                    @keyframes bossAppear {
                        0% { transform: scale(0); opacity: 0; }
                        70% { transform: scale(1.2); }
                        100% { transform: scale(1); opacity: 1; }
                    }
                `;
                document.head.appendChild(style);
            }

            // Звук
            if(typeof playSound === 'function') {
                playSound('boss');
            }

            // Вибрация
            if(window.Telegram?.WebApp?.HapticFeedback) {
                window.Telegram.WebApp.HapticFeedback.impactOccurred('heavy');
            }

            setTimeout(() => {
                overlay.style.transition = 'opacity 0.5s';
                overlay.style.opacity = '0';
                setTimeout(() => overlay.remove(), 500);
            }, 2500);
        }
    };

    // ════════════════════════════════════════════════════════════════
    // 3. ОБЁРТКИ ДЛЯ ИГРОВЫХ ФУНКЦИЙ
    // ════════════════════════════════════════════════════════════════

    // Флаг первого запуска
    let isFirstRun = true;

    // Находим все кнопки "Играть"
    const playButtons = document.querySelectorAll('[onclick*="showScreen"], [onclick*="startGame"]');

    console.log('🎮 Найдено кнопок:', playButtons.length);

    // Перехватываем клики на кнопки выбора сложности
    document.addEventListener('click', (e) => {
        const target = e.target;

        // Проверяем является ли это кнопка запуска игры
        const isDifficultyBtn = target.id && ['easyBtn', 'normalBtn', 'hardBtn', 'nightmareBtn'].includes(target.id);

        if(isDifficultyBtn && isFirstRun) {
            console.log('🎬 Первый запуск - показываем интро');
            isFirstRun = false;

            // Останавливаем стандартное поведение
            e.preventDefault();
            e.stopPropagation();

            // Получаем сложность из id кнопки
            const diffMap = {
                'easyBtn': 'easy',
                'normalBtn': 'normal',
                'hardBtn': 'hard',
                'nightmareBtn': 'nightmare'
            };

            const selectedDiff = diffMap[target.id];

            // Показываем интро
            IntroAnimation.show(() => {
                console.log('✅ Интро завершено, запускаем игру');
                // После интро устанавливаем сложность и запускаем
                if(typeof window.difficulty !== 'undefined') {
                    window.difficulty = selectedDiff;
                }
                if(typeof showScreen === 'function') {
                    showScreen('gameScreen');
                }
                if(typeof startGame === 'function') {
                    startGame();
                }
            });

            return false;
        }
    }, true); // true = capture phase

    // Отслеживаем появление боссов
    let lastLevel = 1;
    let bossCheckInterval = setInterval(() => {
        if(typeof window.level !== 'undefined' && typeof window.bossActive !== 'undefined') {
            const currentLevel = window.level;

            // Проверяем повышение уровня
            if(currentLevel > lastLevel) {
                console.log('📈 Уровень повысился:', currentLevel);

                // Каждый 5 уровень - босс
                if(currentLevel % 5 === 0 && window.bossActive) {
                    console.log('👹 Появление босса!');
                    const bossNames = ['OCTOPUS OVERLORD', 'SPACE DRAGON', 'ENERGY CORE'];
                    const randomBoss = bossNames[Math.floor(Math.random() * bossNames.length)];
                    BossAnimation.show('🔥 ' + randomBoss);
                }

                // Звук повышения уровня
                if(typeof playSound === 'function') {
                    playSound('levelup');
                }

                // Вибрация
                if(window.Telegram?.WebApp?.HapticFeedback) {
                    window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
                }
            }

            lastLevel = currentLevel;
        }
    }, 1000);

    // Пропуск интро на ESC/Пробел
    document.addEventListener('keydown', (e) => {
        if((e.key === 'Escape' || e.key === ' ') && IntroAnimation.active) {
            e.preventDefault();
            IntroAnimation.active = false;
            const overlay = document.getElementById('introOverlay');
            if(overlay) overlay.remove();
        }
    });

    console.log('✅ Улучшения v2.0 загружены:');
    console.log('  🎬 Вступительная анимация');
    console.log('  💥 Анимация боссов');
    console.log('  📳 Вибрации Telegram');
}