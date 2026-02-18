/* 
 * Space Shooter - Telegram Bot Integration
 * Добавьте этот код в вашу HTML игру для интеграции с ботом
 */

// ===== ИНИЦИАЛИЗАЦИЯ TELEGRAM WEB APP =====

// Проверяем, что скрипт Telegram Web App загружен
if (typeof Telegram === 'undefined' || !Telegram.WebApp) {
    console.error('Telegram Web App SDK не загружен!');
    console.log('Добавьте в <head>: <script src="https://telegram.org/js/telegram-web-app.js"></script>');
}

// Инициализируем Web App
const tg = window.Telegram.WebApp;
tg.expand(); // Развернуть приложение на весь экран
tg.enableClosingConfirmation(); // Подтверждение закрытия

// ===== ПОЛУЧЕНИЕ ДАННЫХ ПОЛЬЗОВАТЕЛЯ =====

// Получаем данные пользователя Telegram
const initData = tg.initDataUnsafe;
const user = initData.user || {
    id: 0,
    first_name: 'Guest',
    username: 'guest'
};

console.log('👤 Пользователь:', user.first_name, `(ID: ${user.id})`);

// Применяем тему Telegram
document.body.style.backgroundColor = tg.themeParams.bg_color || '#000000';

// ===== ОТПРАВКА РЕЗУЛЬТАТОВ =====

/**
 * Функция отправки результата игры в бот
 * Вызывайте эту функцию когда игра завершена
 */
function sendGameResult(gameData) {
    // Проверяем наличие всех необходимых полей
    const requiredFields = ['score', 'level', 'difficulty'];
    for (const field of requiredFields) {
        if (!(field in gameData)) {
            console.error(`❌ Отсутствует обязательное поле: ${field}`);
            return false;
        }
    }
    
    // Добавляем метаданные
    const fullData = {
        score: gameData.score,
        level: gameData.level,
        difficulty: gameData.difficulty,
        duration_seconds: gameData.duration_seconds || 0,
        enemies_killed: gameData.enemies_killed || 0,
        accuracy_percent: gameData.accuracy_percent || 0,
        timestamp: Date.now(),
        user_id: user.id
    };
    
    console.log('📤 Отправка результата:', fullData);
    
    try {
        // Отправляем данные боту
        tg.sendData(JSON.stringify(fullData));
        
        // Опционально: закрываем приложение после отправки
        setTimeout(() => {
            tg.close();
        }, 500);
        
        return true;
    } catch (error) {
        console.error('❌ Ошибка отправки данных:', error);
        return false;
    }
}

// ===== ПРИМЕР ИНТЕГРАЦИИ В ВАШУ ИГРУ =====

/*
// В начале игры - выбор сложности
let selectedDifficulty = 'normal'; // easy, normal, hard, nightmare

// Переменные для отслеживания статистики
let gameStartTime = Date.now();
let totalEnemiesKilled = 0;
let totalShots = 0;
let successfulHits = 0;

// Когда игрок стреляет
function onPlayerShoot() {
    totalShots++;
    // ваш код стрельбы
}

// Когда попадание по врагу
function onEnemyHit() {
    successfulHits++;
    totalEnemiesKilled++;
    // ваш код уничтожения врага
}

// Когда игра завершена
function onGameOver(finalScore, finalLevel) {
    const gameDuration = Math.floor((Date.now() - gameStartTime) / 1000);
    const accuracy = totalShots > 0 ? (successfulHits / totalShots) * 100 : 0;
    
    // Отправляем результат
    sendGameResult({
        score: finalScore,
        level: finalLevel,
        difficulty: selectedDifficulty,
        duration_seconds: gameDuration,
        enemies_killed: totalEnemiesKilled,
        accuracy_percent: Math.round(accuracy * 10) / 10
    });
}
*/

// ===== ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ =====

/**
 * Показать кнопку "Главное меню" внизу экрана
 */
function showMainButton(text = 'Завершить игру', onClick) {
    tg.MainButton.setText(text);
    tg.MainButton.show();
    tg.MainButton.onClick(onClick || function() {
        tg.close();
    });
}

/**
 * Скрыть кнопку "Главное меню"
 */
function hideMainButton() {
    tg.MainButton.hide();
}

/**
 * Показать уведомление
 */
function showAlert(message) {
    tg.showAlert(message);
}

/**
 * Показать подтверждение
 */
function showConfirm(message, callback) {
    tg.showConfirm(message, callback);
}

/**
 * Вибрация (если поддерживается)
 */
function vibrate(style = 'light') {
    // style: 'light', 'medium', 'heavy', 'rigid', 'soft'
    if (tg.HapticFeedback) {
        if (style === 'light' || style === 'medium' || style === 'heavy') {
            tg.HapticFeedback.impactOccurred(style);
        } else if (style === 'success' || style === 'warning' || style === 'error') {
            tg.HapticFeedback.notificationOccurred(style);
        } else {
            tg.HapticFeedback.selectionChanged();
        }
    }
}

// ===== АДАПТАЦИЯ ПОД ТЕМУ TELEGRAM =====

/**
 * Получить цвета темы Telegram
 */
function getTelegramTheme() {
    return {
        bgColor: tg.themeParams.bg_color || '#000000',
        textColor: tg.themeParams.text_color || '#FFFFFF',
        hintColor: tg.themeParams.hint_color || '#AAAAAA',
        linkColor: tg.themeParams.link_color || '#62A8EA',
        buttonColor: tg.themeParams.button_color || '#62A8EA',
        buttonTextColor: tg.themeParams.button_text_color || '#FFFFFF'
    };
}

/**
 * Применить тему Telegram к UI элементам
 */
function applyTelegramTheme() {
    const theme = getTelegramTheme();
    
    // Примените цвета к вашим UI элементам
    // Пример:
    // document.getElementById('menu').style.backgroundColor = theme.bgColor;
    // document.getElementById('title').style.color = theme.textColor;
    // document.querySelectorAll('.button').forEach(btn => {
    //     btn.style.backgroundColor = theme.buttonColor;
    //     btn.style.color = theme.buttonTextColor;
    // });
}

// ===== ГОТОВЫЙ ШАБЛОН ДЛЯ ДОБАВЛЕНИЯ В HTML =====

/*
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Space Shooter</title>
    
    <!-- ВАЖНО: Подключите Telegram Web App SDK -->
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            overflow: hidden; 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        canvas { display: block; }
    </style>
</head>
<body>
    <canvas id="gameCanvas"></canvas>
    
    <script>
        // Ваш игровой код здесь
        
        // В конце игры вызовите:
        // sendGameResult({
        //     score: finalScore,
        //     level: finalLevel,
        //     difficulty: 'normal',
        //     duration_seconds: gameDuration,
        //     enemies_killed: enemiesKilled,
        //     accuracy_percent: accuracy
        // });
    </script>
    
    <!-- Подключите этот файл интеграции -->
    <script src="telegram-integration.js"></script>
</body>
</html>
*/

// ===== DEBUGGING =====

// Включите для отладки
const DEBUG_MODE = true;

if (DEBUG_MODE) {
    console.log('🔧 DEBUG MODE ENABLED');
    console.log('Telegram Web App:', tg);
    console.log('Init Data:', initData);
    console.log('User:', user);
    console.log('Theme:', getTelegramTheme());
    
    // Тестовая функция для отправки результата
    window.testSendResult = function() {
        sendGameResult({
            score: 1234,
            level: 5,
            difficulty: 'normal',
            duration_seconds: 180,
            enemies_killed: 45,
            accuracy_percent: 78.5
        });
    };
    console.log('💡 Используйте testSendResult() для тестирования отправки');
}

// ===== ЭКСПОРТ =====
window.SpaceShooterBot = {
    sendGameResult,
    showMainButton,
    hideMainButton,
    showAlert,
    showConfirm,
    vibrate,
    getTelegramTheme,
    applyTelegramTheme,
    user,
    tg
};

console.log('✅ Telegram Bot Integration загружен');
console.log('📱 Доступно в window.SpaceShooterBot');
