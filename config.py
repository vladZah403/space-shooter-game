"""
Конфигурация бота Space Shooter
Версия 2.0 - Улучшенная с валидацией и дополнительными настройками
"""

import os
from typing import Optional
from dataclasses import dataclass

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv не установлен - используются системные переменные окружения

# ===== ОСНОВНЫЕ НАСТРОЙКИ =====
# Токен и ID администратора берутся из переменных окружения (файл .env, не коммитится в git).
# Получить токен: @BotFather. Узнать свой ID: @userinfobot
BOT_TOKEN = os.getenv("BOT_TOKEN", "")
ADMIN_CHAT_ID = int(os.getenv("ADMIN_CHAT_ID", "0")) or None

# ВАЖНО: Замените на URL вашей игры
GAME_URL = os.getenv("GAME_URL", "https://vladzah403.github.io/space-shooter-game/")

# ===== ПУБЛИЧНЫЙ API ЛИДЕРБОРДА (api.py) =====
# На большинстве PaaS (Render/Railway/Fly.io) порт передаётся через $PORT — обычно достаточно
# оставить эти значения по умолчанию и не задавать их через .env.
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("PORT", os.getenv("API_PORT", "8080")))

# ===== НАСТРОЙКИ БАЗЫ ДАННЫХ =====
DATABASE_NAME = os.getenv("DATABASE_NAME", "space_shooter.db")
DB_BACKUP_ENABLED = True
DB_BACKUP_INTERVAL_HOURS = 24

# ===== НАСТРОЙКИ ЛОГИРОВАНИЯ =====
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
LOG_FILE = "bot.log"
LOG_MAX_BYTES = 10 * 1024 * 1024  # 10MB
LOG_BACKUP_COUNT = 5

# ===== ИГРОВЫЕ НАСТРОЙКИ =====
@dataclass
class DifficultyConfig:
    """Конфигурация уровня сложности"""
    name: str
    emoji: str
    description: str
    lives: int
    enemy_speed_multiplier: float
    score_multiplier: float

# Конфигурация сложностей
DIFFICULTIES = {
    'easy': DifficultyConfig(
        name='Легко',
        emoji='😊',
        description='5 жизней, медленные враги',
        lives=5,
        enemy_speed_multiplier=0.7,
        score_multiplier=1.0
    ),
    'normal': DifficultyConfig(
        name='Нормально',
        emoji='😎',
        description='3 жизни, средняя скорость',
        lives=3,
        enemy_speed_multiplier=1.0,
        score_multiplier=1.5
    ),
    'hard': DifficultyConfig(
        name='Сложно',
        emoji='😤',
        description='2 жизни, быстрые враги',
        lives=2,
        enemy_speed_multiplier=1.3,
        score_multiplier=2.0
    ),
    'nightmare': DifficultyConfig(
        name='Кошмар',
        emoji='💀',
        description='1 жизнь, экстремальная сложность',
        lives=1,
        enemy_speed_multiplier=1.5,
        score_multiplier=3.0
    )
}

# ===== НАСТРОЙКИ ДОСТИЖЕНИЙ =====
ACHIEVEMENTS = {
    'first_blood': {
        'name': 'Первая кровь',
        'emoji': '🎯',
        'description': 'Сыграть первую игру',
        'condition': lambda stats: stats['games_played'] >= 1
    },
    'veteran': {
        'name': 'Ветеран',
        'emoji': '🎖️',
        'description': 'Сыграть 50 игр',
        'condition': lambda stats: stats['games_played'] >= 50
    },
    'centurion': {
        'name': 'Центурион',
        'emoji': '💯',
        'description': 'Сыграть 100 игр',
        'condition': lambda stats: stats['games_played'] >= 100
    },
    'high_scorer': {
        'name': 'Высокий счет',
        'emoji': '⭐',
        'description': 'Набрать 1000 очков',
        'condition': lambda stats: stats['best_score'] >= 1000
    },
    'master': {
        'name': 'Мастер',
        'emoji': '🏆',
        'description': 'Набрать 5000 очков',
        'condition': lambda stats: stats['best_score'] >= 5000
    },
    'legend': {
        'name': 'Легенда',
        'emoji': '👑',
        'description': 'Набрать 10000 очков',
        'condition': lambda stats: stats['best_score'] >= 10000
    },
    'level_10': {
        'name': 'Уровень 10',
        'emoji': '🔟',
        'description': 'Достичь 10 уровня',
        'condition': lambda stats: stats['max_level'] >= 10
    },
    'nightmare_survivor': {
        'name': 'Выживший кошмар',
        'emoji': '💀',
        'description': 'Пройти 10 игр на кошмаре',
        'condition': lambda stats: stats['nightmare_games'] >= 10
    },
    'top_3': {
        'name': 'Топ 3',
        'emoji': '🥉',
        'description': 'Войти в топ 3 игроков',
        'condition': lambda stats: stats.get('rank', 999) <= 3
    },
    'champion': {
        'name': 'Чемпион',
        'emoji': '🥇',
        'description': 'Стать первым в рейтинге',
        'condition': lambda stats: stats.get('rank', 999) == 1
    }
}

# ===== НАСТРОЙКИ РЕЙТИНГА =====
LEADERBOARD_SIZE = 10
LEADERBOARD_CACHE_SECONDS = 60

# ===== НАСТРОЙКИ СТАТИСТИКИ =====
RECENT_GAMES_LIMIT = 5
STATS_CACHE_SECONDS = 30

# ===== НАСТРОЙКИ УВЕДОМЛЕНИЙ =====
NOTIFY_NEW_RECORD = True
NOTIFY_ACHIEVEMENT = True
NOTIFY_RANK_CHANGE = True

# ===== КОМАНДЫ БОТА =====
BOT_COMMANDS = [
    ("start", "Главное меню"),
    ("play", "Запустить игру"),
    ("stats", "Моя статистика"),
    ("leaderboard", "Таблица лидеров"),
    ("achievements", "Мои достижения"),
    ("help", "Помощь"),
]

# ===== ТЕКСТЫ =====
class Messages:
    """Текстовые сообщения бота"""
    
    WELCOME = """
🚀 <b>Добро пожаловать в Space Shooter, {name}!</b>

Это увлекательная космическая аркада, где вы должны защитить галактику от вражеских кораблей!

<b>🎮 Особенности игры:</b>
• 4 уровня сложности
• Система прогрессии и уровней
• Достижения и награды
• Красивая графика с эффектами
• Адаптивное управление
• Сохранение рекордов

<b>📊 Ваша статистика:</b>
🏆 Лучший счет: <code>{best_score}</code>
🎯 Игр сыграно: <code>{games_played}</code>
🏅 Место в рейтинге: <code>{rank}</code>

Нажмите кнопку ниже, чтобы начать играть!
"""

    GAME_OVER_NEW_RECORD = """
🎉 <b>ПОЗДРАВЛЯЕМ! НОВЫЙ РЕКОРД!</b> 🎉

📊 Ваш результат:
• Очки: <code>{score}</code> (+{score_diff})
• Уровень: <code>{level}</code>
• Сложность: {difficulty_emoji} {difficulty}

🏆 Обновленная статистика:
• Лучший счет: <code>{best_score}</code>
• Место в рейтинге: <code>{rank}</code> {rank_change}
• Всего игр: <code>{games_played}</code>

{achievements_text}
"""

    GAME_OVER = """
🎮 <b>Игра завершена!</b>

📊 Ваш результат:
• Очки: <code>{score}</code>
• Уровень: <code>{level}</code>
• Сложность: {difficulty_emoji} {difficulty}

🏆 Ваша статистика:
• Лучший счет: <code>{best_score}</code>
• Место в рейтинге: <code>{rank}</code>
• Всего игр: <code>{games_played}</code>

{achievements_text}
"""

    NEW_ACHIEVEMENT = "\n🎊 <b>Новое достижение:</b> {emoji} {name}\n{description}"

    ERROR_SAVE_GAME = "❌ Произошла ошибка при сохранении результата. Попробуйте еще раз."
    ERROR_GENERIC = "❌ Произошла ошибка. Пожалуйста, попробуйте позже."


# ===== ВАЛИДАЦИЯ КОНФИГУРАЦИИ =====
def validate_config() -> tuple[bool, Optional[str]]:
    """Проверка корректности конфигурации"""
    if not BOT_TOKEN or BOT_TOKEN == "YOUR_BOT_TOKEN_HERE":
        return False, "BOT_TOKEN не установлен. Получите токен у @BotFather"
    
    if not GAME_URL or GAME_URL == "YOUR_GAME_URL_HERE":
        return False, "GAME_URL не установлен. Укажите URL вашей игры"
    
    if not GAME_URL.startswith(('http://', 'https://')):
        return False, "GAME_URL должен начинаться с http:// или https://"
    
    return True, None


# Проверка при импорте
is_valid, error_message = validate_config()
if not is_valid:
    print(f"⚠️ ПРЕДУПРЕЖДЕНИЕ: {error_message}")
