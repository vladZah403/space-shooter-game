"""
Space Shooter Telegram Bot v2.0
Улучшенная версия с достижениями, заданиями и расширенной статистикой
"""

import logging
import json
from datetime import datetime
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo, BotCommand
from telegram.ext import (
    Application, CommandHandler, CallbackQueryHandler, 
    ContextTypes, MessageHandler, filters
)
from telegram.error import TelegramError

from database import db, DatabaseError
from config import (
    BOT_TOKEN, GAME_URL, DIFFICULTIES, ACHIEVEMENTS,
    Messages, BOT_COMMANDS, LEADERBOARD_SIZE
)

# Настройка расширенного логирования
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO,
    handlers=[
        logging.FileHandler('bot.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


# ===== ДЕКОРАТОРЫ =====

def log_command(func):
    """Декоратор для логирования команд"""
    async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE):
        user = update.effective_user
        command = update.message.text if update.message else update.callback_query.data
        logger.info(f"👤 Пользователь {user.id} ({user.first_name}) -> {command}")
        try:
            return await func(update, context)
        except Exception as e:
            logger.error(f"❌ Ошибка в {func.__name__}: {e}", exc_info=True)
            await send_error_message(update, context)
    return wrapper


def register_user(func):
    """Декоратор для автоматической регистрации пользователя"""
    async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE):
        user = update.effective_user
        db.add_user(
            user_id=user.id,
            username=user.username,
            first_name=user.first_name,
            last_name=user.last_name,
            language_code=user.language_code,
            is_premium=bool(user.is_premium) if user.is_premium is not None else False
        )
        return await func(update, context)
    return wrapper


# ===== ОБРАБОТЧИКИ КОМАНД =====

@log_command
@register_user
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик команды /start"""
    user = update.effective_user
    
    stats = db.get_user_stats(user.id) or {'best_score': 0, 'games_played': 0}
    rank = db.get_user_rank(user.id) or '—'
    
    welcome_text = Messages.WELCOME.format(
        name=user.first_name,
        best_score=stats['best_score'],
        games_played=stats['games_played'],
        rank=rank
    )
    
    keyboard = [
        [InlineKeyboardButton("🎮 ИГРАТЬ", web_app=WebAppInfo(url=GAME_URL))],
        [
            InlineKeyboardButton("📊 Статистика", callback_data="stats"),
            InlineKeyboardButton("🏆 Лидеры", callback_data="leaderboard")
        ],
        [
            InlineKeyboardButton("🎯 Достижения", callback_data="achievements"),
            InlineKeyboardButton("📅 Задания", callback_data="daily")
        ],
        [InlineKeyboardButton("ℹ️ Помощь", callback_data="help")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        welcome_text,
        parse_mode='HTML',
        reply_markup=reply_markup
    )


@log_command
@register_user
async def play(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик команды /play - запуск игры"""
    keyboard = [
        [InlineKeyboardButton("🎮 НАЧАТЬ ИГРУ", web_app=WebAppInfo(url=GAME_URL))]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        "🚀 Готовы к космическим приключениям?\n"
        "Нажмите кнопку ниже для запуска игры!\n\n"
        "💡 <i>Совет: Выберите сложность в начале игры</i>",
        parse_mode='HTML',
        reply_markup=reply_markup
    )


@log_command
@register_user
async def stats(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик команды /stats - статистика игрока"""
    user = update.effective_user
    
    stats = db.get_user_stats(user.id)
    if not stats:
        stats = {
            'best_score': 0, 'games_played': 0, 'max_level': 0,
            'easy_games': 0, 'normal_games': 0, 'hard_games': 0, 'nightmare_games': 0,
            'total_score': 0, 'total_enemies_killed': 0, 'avg_accuracy': 0,
            'win_streak': 0, 'best_win_streak': 0
        }
    
    rank = db.get_user_rank(user.id) or '—'
    recent_games = db.get_recent_games(user.id, limit=3)
    
    # Вычисляем средние показатели
    avg_score = stats['total_score'] // stats['games_played'] if stats['games_played'] > 0 else 0
    total_dur = stats.get('total_playtime_seconds', 0)
    avg_dur   = total_dur // stats['games_played'] if stats['games_played'] > 0 else 0
    avg_dur_str = f"{avg_dur // 60}м {avg_dur % 60}с" if avg_dur > 0 else "—"

    stats_text = f"""
📊 <b>Статистика игрока {user.first_name}</b>

<b>🏆 Основные показатели:</b>
• Лучший счет: <code>{stats['best_score']}</code>
• Игр сыграно: <code>{stats['games_played']}</code>
• Средний счет: <code>{avg_score}</code>
• Макс. уровень: <code>{stats['max_level']}</code>
• Среднее время забега: <code>{avg_dur_str}</code>
• Место в рейтинге: <code>#{rank}</code>

<b>🎯 Боевая статистика:</b>
• Врагов убито: <code>{stats['total_enemies_killed']}</code>
• Боссов побеждено: <code>{stats.get('total_bosses_killed', 0)}</code>
• Средняя точность: <code>{stats['avg_accuracy']:.1f}%</code>
• Текущая серия побед: <code>{stats['win_streak']}</code>
• Лучшая серия: <code>{stats['best_win_streak']}</code>

<b>😊 По сложностям:</b>
{DIFFICULTIES['easy'].emoji} Легко: {stats['easy_games']} игр
{DIFFICULTIES['normal'].emoji} Нормально: {stats['normal_games']} игр
{DIFFICULTIES['hard'].emoji} Сложно: {stats['hard_games']} игр
{DIFFICULTIES['nightmare'].emoji} Кошмар: {stats['nightmare_games']} игр
"""

    if recent_games:
        stats_text += "\n<b>📝 Последние игры:</b>\n"
        for game in recent_games:
            diff = DIFFICULTIES.get(game['difficulty'])
            emoji = diff.emoji if diff else '🎮'
            stats_text += f"{emoji} {game['score']} очков (ур. {game['level']}) • {game['enemies_killed']} 💀\n"

    keyboard = [
        [InlineKeyboardButton("🎮 Играть снова", web_app=WebAppInfo(url=GAME_URL))],
        [
            InlineKeyboardButton("🎯 Достижения", callback_data="achievements"),
            InlineKeyboardButton("🏆 Лидеры", callback_data="leaderboard")
        ],
        [InlineKeyboardButton("« Назад", callback_data="back_to_menu")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    if update.callback_query:
        await update.callback_query.edit_message_text(
            stats_text,
            parse_mode='HTML',
            reply_markup=reply_markup
        )
    else:
        await update.message.reply_text(
            stats_text,
            parse_mode='HTML',
            reply_markup=reply_markup
        )


@log_command
@register_user
async def leaderboard(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик команды /leaderboard - таблица лидеров"""
    top_players = db.get_top_players(limit=LEADERBOARD_SIZE)
    global_stats = db.get_global_stats()

    leaderboard_text = "🏆 <b>ТАБЛИЦА ЛИДЕРОВ</b>\n\n"

    medals = ["🥇", "🥈", "🥉"]
    for i, player in enumerate(top_players, 1):
        medal = medals[i-1] if i <= 3 else f"{i}."
        premium = "⭐" if player.get('is_premium') else ""
        leaderboard_text += (
            f"{medal} {player['name']} {premium}\n"
            f"   └ <code>{player['score']}</code> очков "
            f"({player['games_played']} игр)\n"
        )

    if not top_players:
        leaderboard_text += "Пока никто не играл. Будьте первым! 🚀\n"

    leaderboard_text += f"""
\n<b>📊 Глобальная статистика:</b>
👥 Всего игроков: {global_stats.get('total_users', 0)}
🎮 Игр сыграно: {global_stats.get('total_games', 0)}
🏆 Рекорд сервера: {global_stats.get('max_score', 0)}
📈 Средний счет: {global_stats.get('avg_score', 0)}
"""

    keyboard = [
        [InlineKeyboardButton("🎮 Играть", web_app=WebAppInfo(url=GAME_URL))],
        [
            InlineKeyboardButton("📊 Моя статистика", callback_data="stats"),
            InlineKeyboardButton("« Назад", callback_data="back_to_menu")
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    if update.callback_query:
        await update.callback_query.edit_message_text(
            leaderboard_text,
            parse_mode='HTML',
            reply_markup=reply_markup
        )
    else:
        await update.message.reply_text(
            leaderboard_text,
            parse_mode='HTML',
            reply_markup=reply_markup
        )


@log_command
@register_user
async def achievements_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик команды /achievements - достижения"""
    user = update.effective_user

    unlocked = db.get_user_achievements(user.id)
    stats = db.get_user_stats(user.id) or {}
    stats['rank'] = db.get_user_rank(user.id) or 999

    achievements_text = f"🎯 <b>Достижения {user.first_name}</b>\n\n"
    achievements_text += f"Разблокировано: {len(unlocked)}/{len(ACHIEVEMENTS)}\n\n"

    for key, achievement in ACHIEVEMENTS.items():
        is_unlocked = key in unlocked
        status = "✅" if is_unlocked else "🔒"
        emoji = achievement['emoji'] if is_unlocked else "⬜"

        achievements_text += f"{status} {emoji} <b>{achievement['name']}</b>\n"
        achievements_text += f"   {achievement['description']}\n"

        # Показываем прогресс для незаконченных достижений
        if not is_unlocked:
            progress = get_achievement_progress(key, stats)
            if progress:
                achievements_text += f"   <i>{progress}</i>\n"

        achievements_text += "\n"

    keyboard = [
        [InlineKeyboardButton("🎮 Играть", web_app=WebAppInfo(url=GAME_URL))],
        [
            InlineKeyboardButton("📊 Статистика", callback_data="stats"),
            InlineKeyboardButton("« Назад", callback_data="back_to_menu")
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    if update.callback_query:
        await update.callback_query.edit_message_text(
            achievements_text,
            parse_mode='HTML',
            reply_markup=reply_markup
        )
    else:
        await update.message.reply_text(
            achievements_text,
            parse_mode='HTML',
            reply_markup=reply_markup
        )


@log_command
@register_user
async def daily_challenges(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик команды /daily - ежедневные задания"""
    user = update.effective_user
    challenges = db.get_daily_challenges(user.id)

    challenges_text = "📅 <b>Ежедневные задания</b>\n\n"

    if not challenges:
        challenges_text += "Сегодня у вас пока нет активных заданий.\n"
        challenges_text += "Начните играть, чтобы получить задания! 🎮"
    else:
        for challenge in challenges:
            if challenge['type'] == 'daily_score':
                name = "🎯 Набрать очки"
                desc = f"Наберите {challenge['target']} очков за день"
            elif challenge['type'] == 'daily_kills':
                name = "💀 Убить врагов"
                desc = f"Уничтожьте {challenge['target']} врагов за день"
            else:
                continue

            progress = min(100, (challenge['current'] / challenge['target']) * 100)
            status = "✅ Выполнено" if challenge['completed'] else f"{progress:.0f}%"

            challenges_text += f"{name}\n"
            challenges_text += f"└ {desc}\n"
            challenges_text += f"└ Прогресс: {challenge['current']}/{challenge['target']} ({status})\n\n"

    keyboard = [
        [InlineKeyboardButton("🎮 Играть", web_app=WebAppInfo(url=GAME_URL))],
        [InlineKeyboardButton("« Назад", callback_data="back_to_menu")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    if update.callback_query:
        await update.callback_query.edit_message_text(
            challenges_text,
            parse_mode='HTML',
            reply_markup=reply_markup
        )
    else:
        await update.message.reply_text(
            challenges_text,
            parse_mode='HTML',
            reply_markup=reply_markup
        )


@log_command
async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик команды /help"""
    help_text = """
ℹ️ <b>ПОМОЩЬ - Space Shooter v2.0</b>

<b>🎮 Как играть:</b>
1. Выберите уровень сложности
2. Управляйте кораблем стрелками или кнопками
3. Стреляйте в врагов центральной кнопкой
4. Уничтожайте врагов и набирайте очки
5. Не дайте врагам пройти мимо вас!

<b>📱 Управление:</b>
◄ - Движение влево
► - Движение вправо  
● - Стрельба
⌨️ Клавиатура: стрелки + пробел

<b>🎯 Уровни сложности:</b>
"""

    for key, diff in DIFFICULTIES.items():
        help_text += f"{diff.emoji} {diff.name} - {diff.description}\n"

    help_text += """
<b>🎊 Система достижений:</b>
• Разблокируйте достижения за игровые успехи
• Отслеживайте прогресс в реальном времени
• Соревнуйтесь с друзьями

<b>📅 Ежедневные задания:</b>
• Выполняйте задания каждый день
• Получайте бонусы за выполнение

<b>💡 Советы:</b>
• Старайтесь не пропускать врагов
• Следите за полосками здоровья врагов
• С каждым уровнем враги становятся сильнее
• Каждые 200 очков - новый уровень
• Высокая точность дает больше очков

<b>🤖 Команды бота:</b>
/start - Главное меню
/play - Запустить игру
/stats - Моя статистика
/leaderboard - Таблица лидеров
/achievements - Мои достижения
/daily - Ежедневные задания
/help - Эта справка
"""

    keyboard = [
        [InlineKeyboardButton("🎮 Играть", web_app=WebAppInfo(url=GAME_URL))],
        [InlineKeyboardButton("« Назад", callback_data="back_to_menu")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    if update.callback_query:
        await update.callback_query.edit_message_text(
            help_text,
            parse_mode='HTML',
            reply_markup=reply_markup
        )
    else:
        await update.message.reply_text(
            help_text,
            parse_mode='HTML',
            reply_markup=reply_markup
        )


# ===== ОБРАБОТЧИКИ КНОПОК =====

async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик нажатий на кнопки"""
    query = update.callback_query
    await query.answer()

    handlers = {
        "stats": stats,
        "leaderboard": leaderboard,
        "achievements": achievements_command,
        "daily": daily_challenges,
        "help": help_command,
        "back_to_menu": back_to_menu
    }

    handler = handlers.get(query.data)
    if handler:
        await handler(update, context)


@register_user
async def back_to_menu(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Возврат в главное меню"""
    user = update.effective_user

    stats = db.get_user_stats(user.id) or {'best_score': 0, 'games_played': 0}
    rank = db.get_user_rank(user.id) or '—'

    welcome_text = f"""
🚀 <b>Space Shooter - Главное меню</b>

Привет, {user.first_name}! Готовы к новым космическим приключениям?

<b>📊 Ваша статистика:</b>
🏆 Лучший счет: <code>{stats['best_score']}</code>
🎯 Игр сыграно: <code>{stats['games_played']}</code>
🏅 Место в рейтинге: <code>#{rank}</code>
"""

    # Проверяем незавершенные задания
    challenges = db.get_daily_challenges(user.id)
    uncompleted = [c for c in challenges if not c['completed']]
    if uncompleted:
        welcome_text += f"\n📅 Активных заданий: {len(uncompleted)}"

    keyboard = [
        [InlineKeyboardButton("🎮 ИГРАТЬ", web_app=WebAppInfo(url=GAME_URL))],
        [
            InlineKeyboardButton("📊 Статистика", callback_data="stats"),
            InlineKeyboardButton("🏆 Лидеры", callback_data="leaderboard")
        ],
        [
            InlineKeyboardButton("🎯 Достижения", callback_data="achievements"),
            InlineKeyboardButton("📅 Задания", callback_data="daily")
        ],
        [InlineKeyboardButton("ℹ️ Помощь", callback_data="help")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    await update.callback_query.edit_message_text(
        welcome_text,
        parse_mode='HTML',
        reply_markup=reply_markup
    )


# ===== ОБРАБОТЧИК РЕЗУЛЬТАТОВ ИГРЫ =====

async def web_app_data_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик данных из Web App (результаты игры)"""
    try:
        # Получаем данные из игры
        data = json.loads(update.effective_message.web_app_data.data)
        user_id = update.effective_user.id
        user = update.effective_user

        score = data.get('score', 0)
        level = data.get('level', 1)
        difficulty = data.get('difficulty', 'normal')
        duration = data.get('duration_seconds', 0)
        enemies_killed = data.get('enemies_killed', 0)
        accuracy = data.get('accuracy_percent', 0.0)
        # Новые поля аналитики
        bosses_killed = data.get('bosses_killed', 0)
        level_deltas  = data.get('level_deltas', [])   # секунды между уровнями

        # Вычисляем агрегаты из дельт уровней
        avg_level_time = round(sum(level_deltas) / len(level_deltas), 1) if level_deltas else 0

        # Расширенное логирование каждой сессии
        logger.info(
            f"📊 СЕССИЯ: user={user_id}({user.first_name}) "
            f"score={score} lvl={level} diff={difficulty} "
            f"dur={duration}s kills={enemies_killed} bosses={bosses_killed} "
            f"acc={accuracy:.1f}% avg_lvl_time={avg_level_time}s "
            f"deltas={level_deltas}"
        )

        # Получаем старый ранг
        old_rank = db.get_user_rank(user_id)

        # Сохраняем результат в БД
        success, result_info = db.save_game(
            user_id, score, level, difficulty,
            duration, enemies_killed, accuracy
        )

        if not success:
            await update.effective_message.reply_text(Messages.ERROR_SAVE_GAME)
            return

        # Получаем обновленную статистику
        stats = db.get_user_stats(user_id, use_cache=False)
        new_rank = db.get_user_rank(user_id)

        # Определяем изменение ранга
        rank_change = ""
        if old_rank and new_rank:
            if new_rank < old_rank:
                rank_change = f"⬆️ (+{old_rank - new_rank})"
            elif new_rank > old_rank:
                rank_change = f"⬇️ (-{new_rank - old_rank})"

        # Формируем текст достижений
        achievements_text = ""
        if result_info.get('new_achievements'):
            achievements_text = "\n🎊 <b>Новые достижения:</b>\n"
            for ach in result_info['new_achievements']:
                achievements_text += f"{ach['emoji']} {ach['name']}\n"

        # Получаем конфигурацию сложности
        diff_config = DIFFICULTIES.get(difficulty, DIFFICULTIES['normal'])

        # Формируем сообщение
        if result_info.get('is_new_record'):
            message = Messages.GAME_OVER_NEW_RECORD.format(
                score=score,
                score_diff=result_info['score_diff'],
                level=level,
                difficulty_emoji=diff_config.emoji,
                difficulty=diff_config.name,
                best_score=stats['best_score'],
                rank=new_rank,
                rank_change=rank_change,
                games_played=stats['games_played'],
                achievements_text=achievements_text
            )
        else:
            message = Messages.GAME_OVER.format(
                score=score,
                level=level,
                difficulty_emoji=diff_config.emoji,
                difficulty=diff_config.name,
                best_score=stats['best_score'],
                rank=new_rank,
                games_played=stats['games_played'],
                achievements_text=achievements_text
            )

        # Добавляем расширенную статистику сессии
        avg_lvl_str = f"{avg_level_time}с" if avg_level_time > 0 else "—"
        bosses_str  = f"{bosses_killed} 👾" if bosses_killed > 0 else "нет"
        message += f"""
\n<b>🎯 Детали игры:</b>
• Время забега: {duration // 60}м {duration % 60}с
• Врагов убито: {enemies_killed} 💀
• Боссов: {bosses_str}
• Точность: {accuracy:.1f}%
• Среднее время на уровень: {avg_lvl_str}
• Серия побед: {result_info.get('win_streak', 0)} 🔥
"""
        
        keyboard = [
            [InlineKeyboardButton("🎮 Играть снова", web_app=WebAppInfo(url=GAME_URL))],
            [
                InlineKeyboardButton("🏆 Лидеры", callback_data="leaderboard"),
                InlineKeyboardButton("📊 Статистика", callback_data="stats")
            ],
            [InlineKeyboardButton("🎯 Достижения", callback_data="achievements")]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await update.effective_message.reply_text(
            message,
            parse_mode='HTML',
            reply_markup=reply_markup
        )
        
        logger.info(
            f"✅ Результат сохранен: user={user_id}, score={score}, "
            f"level={level}, achievements={len(result_info.get('new_achievements', []))}"
        )
        
    except json.JSONDecodeError as e:
        logger.error(f"❌ Ошибка парсинга JSON: {e}")
        await update.effective_message.reply_text(Messages.ERROR_SAVE_GAME)
    except DatabaseError as e:
        logger.error(f"❌ Ошибка БД: {e}")
        await update.effective_message.reply_text(Messages.ERROR_SAVE_GAME)
    except Exception as e:
        logger.error(f"❌ Неожиданная ошибка: {e}", exc_info=True)
        await update.effective_message.reply_text(Messages.ERROR_GENERIC)




# ===== ОБРАБОТЧИК ПРЕДЛОЖЕНИЙ ИЗ ИГРЫ =====

async def suggestion_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик предложений по игре, отправленных через WebApp"""
    try:
        data = json.loads(update.effective_message.web_app_data.data)

        if data.get('type') != 'suggestion':
            # Передаём обычному обработчику результатов
            await web_app_data_handler(update, context)
            return

        user = update.effective_user
        suggestion_text = data.get('text', '').strip()
        category = data.get('category', 'general')

        if not suggestion_text:
            await update.effective_message.reply_text("❌ Пустое предложение не принято.")
            return

        if len(suggestion_text) > 1000:
            await update.effective_message.reply_text("❌ Слишком длинное предложение (макс. 1000 символов).")
            return

        category_labels = {
            'gameplay': '🎮 Геймплей',
            'balance': '⚖️ Баланс',
            'graphics': '🎨 Графика',
            'music': '🎵 Музыка',
            'bug': '🐛 Баг-репорт',
            'general': '💡 Общее'
        }
        cat_label = category_labels.get(category, '💡 Общее')

        # Сохраняем предложение в БД если есть метод
        try:
            db.save_suggestion(user.id, suggestion_text, category)
        except Exception:
            pass  # БД может не иметь этой таблицы

        # Отправляем подтверждение пользователю
        await update.effective_message.reply_text(
            f"✅ <b>Спасибо за предложение!</b>\n\n"
            f"Категория: {cat_label}\n"
            f"Мы рассмотрим его в ближайшее время 🚀",
            parse_mode='HTML'
        )

        # ── Пересылаем предложение администратору ──
        # Укажи свой Telegram ID в ADMIN_CHAT_ID ниже.
        # Узнать свой ID: напиши боту @userinfobot
        ADMIN_CHAT_ID = 307592252  # ← ВСТАВЬ СВОЙ TELEGRAM ID СЮДА, например: 123456789

        if ADMIN_CHAT_ID:
            try:
                admin_msg = (
                    f"📬 <b>Новое предложение по игре!</b>\n\n"
                    f"👤 От: {user.first_name}"
                    + (f" @{user.username}" if user.username else "")
                    + f" (ID: <code>{user.id}</code>)\n"
                    f"📁 Категория: {cat_label}\n\n"
                    f"💬 <b>Текст:</b>\n{suggestion_text}"
                )
                await context.bot.send_message(
                    chat_id=ADMIN_CHAT_ID,
                    text=admin_msg,
                    parse_mode='HTML'
                )
                logger.info(f"📤 Предложение переслано администратору {ADMIN_CHAT_ID}")
            except Exception as e:
                logger.warning(f"Не удалось переслать предложение: {e}")
        else:
            logger.warning("⚠️  ADMIN_CHAT_ID не задан — предложение не переслано. Укажи свой Telegram ID в bot.py")

        logger.info(f"💡 Предложение от {user.id} ({user.first_name}): [{category}] {suggestion_text[:50]}...")

    except json.JSONDecodeError:
        # Не JSON или обычные данные — передаём дальше
        await web_app_data_handler(update, context)
    except Exception as e:
        logger.error(f"❌ Ошибка обработки предложения: {e}", exc_info=True)
        await update.effective_message.reply_text("😔 Не удалось принять предложение. Попробуйте позже.")

# ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

def get_achievement_progress(key: str, stats: dict) -> str:
    """Получить текст прогресса достижения"""
    progress_map = {
        'veteran': f"Сыграно игр: {stats.get('games_played', 0)}/50",
        'centurion': f"Сыграно игр: {stats.get('games_played', 0)}/100",
        'high_scorer': f"Лучший счет: {stats.get('best_score', 0)}/1000",
        'master': f"Лучший счет: {stats.get('best_score', 0)}/5000",
        'legend': f"Лучший счет: {stats.get('best_score', 0)}/10000",
        'level_10': f"Макс уровень: {stats.get('max_level', 0)}/10",
        'nightmare_survivor': f"Игр на кошмаре: {stats.get('nightmare_games', 0)}/10",
        'top_3': f"Текущий ранг: #{stats.get('rank', 999)}",
        'champion': f"Текущий ранг: #{stats.get('rank', 999)}"
    }
    return progress_map.get(key, "")


async def send_error_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Отправить сообщение об ошибке"""
    error_text = (
        "😔 Произошла непредвиденная ошибка.\n"
        "Пожалуйста, попробуйте позже или обратитесь к администратору."
    )

    try:
        if update.callback_query:
            await update.callback_query.answer(error_text, show_alert=True)
        elif update.message:
            await update.message.reply_text(error_text)
    except:
        pass


async def error_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Глобальный обработчик ошибок"""
    logger.error(f"❌ Exception while handling update {update}:", exc_info=context.error)

    if isinstance(context.error, TelegramError):
        logger.error(f"Telegram Error: {context.error}")

    await send_error_message(update, context)


async def post_init(application: Application) -> None:
    """Действия после инициализации бота"""
    # Устанавливаем команды бота
    await application.bot.set_my_commands([
        BotCommand(command, description) for command, description in BOT_COMMANDS
    ])
    logger.info("✅ Команды бота установлены")


# ===== ЗАПУСК БОТА =====

def main() -> None:
    """Запуск бота"""
    try:
        # Создание приложения
        application = (
            Application.builder()
            .token(BOT_TOKEN)
            .post_init(post_init)
            .build()
        )

        # Регистрация обработчиков команд
        application.add_handler(CommandHandler("start", start))
        application.add_handler(CommandHandler("play", play))
        application.add_handler(CommandHandler("stats", stats))
        application.add_handler(CommandHandler("leaderboard", leaderboard))
        application.add_handler(CommandHandler("achievements", achievements_command))
        application.add_handler(CommandHandler("daily", daily_challenges))
        application.add_handler(CommandHandler("help", help_command))

        # Обработчик кнопок
        application.add_handler(CallbackQueryHandler(button_handler))

        # Обработчик данных из Web App (результаты игры + предложения)
        application.add_handler(
            MessageHandler(filters.StatusUpdate.WEB_APP_DATA, suggestion_handler)
        )

        # Обработчик ошибок
        application.add_error_handler(error_handler)

        # Запуск бота
        logger.info("🚀 Space Shooter Bot v2.0 запущен!")
        logger.info(f"📊 База данных: {db.db_name}")
        logger.info(f"🎮 URL игры: {GAME_URL}")

        application.run_polling(
            allowed_updates=Update.ALL_TYPES,
            drop_pending_updates=True
        )

    except Exception as e:
        logger.error(f"❌ Критическая ошибка при запуске: {e}", exc_info=True)
        raise


if __name__ == '__main__':
    main()