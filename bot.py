"""
Space Shooter Telegram Bot
Бот для запуска игры Space Shooter с выбором сложности
"""

import logging
import json
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes, MessageHandler, filters
from database import db
from config import BOT_TOKEN, GAME_URL

# Настройка логирования
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик команды /start"""
    user = update.effective_user
    
    # Регистрация пользователя в БД
    db.add_user(
        user_id=user.id,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name
    )
    
    stats = db.get_user_stats(user.id) or {
        'best_score': 0,
        'games_played': 0
    }
    
    welcome_text = f"""
🚀 <b>Добро пожаловать в Space Shooter, {user.first_name}!</b>

Это увлекательная космическая аркада, где вы должны защитить галактику от вражеских кораблей!

<b>🎮 Особенности игры:</b>
• 4 уровня сложности
• Система прогрессии и уровней
• Красивая графика с эффектами
• Адаптивное управление
• Сохранение рекордов

<b>📊 Ваша статистика:</b>
🏆 Лучший счет: <code>{stats['best_score']}</code>
🎯 Игр сыграно: <code>{stats['games_played']}</code>

Нажмите кнопку ниже, чтобы начать играть!
"""
    
    keyboard = [
        [InlineKeyboardButton("🎮 ИГРАТЬ", web_app=WebAppInfo(url=GAME_URL))],
        [InlineKeyboardButton("📊 Статистика", callback_data="stats")],
        [InlineKeyboardButton("🏆 Таблица лидеров", callback_data="leaderboard")],
        [InlineKeyboardButton("ℹ️ Помощь", callback_data="help")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        welcome_text,
        parse_mode='HTML',
        reply_markup=reply_markup
    )


async def play(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик команды /play - запуск игры"""
    keyboard = [
        [InlineKeyboardButton("🎮 НАЧАТЬ ИГРУ", web_app=WebAppInfo(url=GAME_URL))]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        "🚀 Готовы к космическим приключениям?\nНажмите кнопку ниже для запуска игры!",
        reply_markup=reply_markup
    )


async def stats(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик команды /stats - статистика игрока"""
    user = update.effective_user
    
    stats = db.get_user_stats(user.id)
    if not stats:
        stats = {
            'best_score': 0,
            'games_played': 0,
            'max_level': 0,
            'easy_games': 0,
            'normal_games': 0,
            'hard_games': 0,
            'nightmare_games': 0
        }
    
    rank = db.get_user_rank(user.id) or '—'
    recent_games = db.get_recent_games(user.id, limit=3)
    
    stats_text = f"""
📊 <b>Статистика игрока {user.first_name}</b>

🏆 Лучший счет: <code>{stats['best_score']}</code>
🎯 Игр сыграно: <code>{stats['games_played']}</code>
⭐ Максимальный уровень: <code>{stats['max_level']}</code>
🏅 Место в рейтинге: <code>{rank}</code>

<b>По сложностям:</b>
😊 Легко: {stats['easy_games']} игр
😎 Нормально: {stats['normal_games']} игр
😤 Сложно: {stats['hard_games']} игр
💀 Кошмар: {stats['nightmare_games']} игр
"""
    
    if recent_games:
        stats_text += "\n<b>📝 Последние игры:</b>\n"
        difficulty_emoji = {
            'easy': '😊',
            'normal': '😎',
            'hard': '😤',
            'nightmare': '💀'
        }
        for game in recent_games:
            emoji = difficulty_emoji.get(game['difficulty'], '🎮')
            stats_text += f"{emoji} {game['score']} очков (ур. {game['level']})\n"
    
    keyboard = [
        [InlineKeyboardButton("🎮 Играть снова", web_app=WebAppInfo(url=GAME_URL))],
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


async def leaderboard(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик команды /leaderboard - таблица лидеров"""
    top_players = db.get_top_players(limit=10)
    
    leaderboard_text = "🏆 <b>ТАБЛИЦА ЛИДЕРОВ</b>\n\n"
    
    medals = ["🥇", "🥈", "🥉"]
    for i, player in enumerate(top_players, 1):
        medal = medals[i-1] if i <= 3 else f"{i}."
        leaderboard_text += f"{medal} {player['name']}: <code>{player['score']}</code>\n"
    
    if not top_players:
        leaderboard_text += "Пока никто не играл. Будьте первым! 🚀"
    
    keyboard = [
        [InlineKeyboardButton("🎮 Играть", web_app=WebAppInfo(url=GAME_URL))],
        [InlineKeyboardButton("« Назад", callback_data="back_to_menu")]
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


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик команды /help"""
    help_text = """
ℹ️ <b>ПОМОЩЬ - Space Shooter</b>

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
Клавиатура: стрелки + пробел

<b>🎯 Уровни сложности:</b>
😊 Легко - 5 жизней, медленные враги
😎 Нормально - 3 жизни, средняя скорость
😤 Сложно - 2 жизни, быстрые враги
💀 Кошмар - 1 жизнь, экстремальная сложность

<b>💡 Советы:</b>
• Старайтесь не пропускать врагов
• Следите за полосками здоровья врагов
• С каждым уровнем враги становятся сильнее
• Каждые 200 очков - новый уровень

<b>🤖 Команды бота:</b>
/start - Главное меню
/play - Запустить игру
/stats - Моя статистика
/leaderboard - Таблица лидеров
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


async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик нажатий на кнопки"""
    query = update.callback_query
    await query.answer()
    
    if query.data == "stats":
        await stats(update, context)
    elif query.data == "leaderboard":
        await leaderboard(update, context)
    elif query.data == "help":
        await help_command(update, context)
    elif query.data == "back_to_menu":
        await back_to_menu(update, context)


async def back_to_menu(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Возврат в главное меню"""
    user = update.effective_user
    
    stats = db.get_user_stats(user.id) or {
        'best_score': 0,
        'games_played': 0
    }
    
    welcome_text = f"""
🚀 <b>Space Shooter - Главное меню</b>

Привет, {user.first_name}! Готовы к новым космическим приключениям?

<b>📊 Ваша статистика:</b>
🏆 Лучший счет: <code>{stats['best_score']}</code>
🎯 Игр сыграно: <code>{stats['games_played']}</code>
"""
    
    keyboard = [
        [InlineKeyboardButton("🎮 ИГРАТЬ", web_app=WebAppInfo(url=GAME_URL))],
        [InlineKeyboardButton("📊 Статистика", callback_data="stats")],
        [InlineKeyboardButton("🏆 Таблица лидеров", callback_data="leaderboard")],
        [InlineKeyboardButton("ℹ️ Помощь", callback_data="help")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.callback_query.edit_message_text(
        welcome_text,
        parse_mode='HTML',
        reply_markup=reply_markup
    )


async def web_app_data_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик данных из Web App (результаты игры)"""
    try:
        # Получаем данные из игры
        data = json.loads(update.effective_message.web_app_data.data)
        user_id = update.effective_user.id
        
        score = data.get('score', 0)
        level = data.get('level', 1)
        difficulty = data.get('difficulty', 'normal')
        
        # Сохраняем результат в БД
        db.save_game(user_id, score, level, difficulty)
        
        # Получаем обновленную статистику
        stats = db.get_user_stats(user_id)
        rank = db.get_user_rank(user_id)
        
        # Поздравляем игрока
        is_new_record = score == stats['best_score']
        
        message = f"""
🎮 <b>Игра завершена!</b>

{"🎉 НОВЫЙ РЕКОРД! 🎉" if is_new_record else ""}

📊 Ваш результат:
• Очки: <code>{score}</code>
• Уровень: <code>{level}</code>
• Сложность: <code>{difficulty}</code>

🏆 Ваша статистика:
• Лучший счет: <code>{stats['best_score']}</code>
• Место в рейтинге: <code>{rank}</code>
• Всего игр: <code>{stats['games_played']}</code>
"""
        
        keyboard = [
            [InlineKeyboardButton("🎮 Играть снова", web_app=WebAppInfo(url=GAME_URL))],
            [InlineKeyboardButton("🏆 Таблица лидеров", callback_data="leaderboard")],
            [InlineKeyboardButton("📊 Статистика", callback_data="stats")]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await update.effective_message.reply_text(
            message,
            parse_mode='HTML',
            reply_markup=reply_markup
        )
        
        logger.info(f"✅ Результат сохранен: user={user_id}, score={score}, level={level}")
        
    except Exception as e:
        logger.error(f"❌ Ошибка обработки данных Web App: {e}")
        await update.effective_message.reply_text(
            "❌ Произошла ошибка при сохранении результата. Попробуйте еще раз."
        )


async def error_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик ошибок"""
    logger.error(f"Update {update} caused error {context.error}")


def main() -> None:
    """Запуск бота"""
    # Создание приложения
    application = Application.builder().token(BOT_TOKEN).build()
    
    # Регистрация обработчиков команд
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("play", play))
    application.add_handler(CommandHandler("stats", stats))
    application.add_handler(CommandHandler("leaderboard", leaderboard))
    application.add_handler(CommandHandler("help", help_command))
    
    # Обработчик кнопок
    application.add_handler(CallbackQueryHandler(button_handler))
    
    # Обработчик данных из Web App
    application.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, web_app_data_handler))
    
    # Обработчик ошибок
    application.add_error_handler(error_handler)
    
    # Запуск бота
    logger.info("🚀 Бот Space Shooter запущен!")
    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == '__main__':
    main()
