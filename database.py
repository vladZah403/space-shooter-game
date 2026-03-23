"""
Database module for Space Shooter Bot v2.0
Управление базой данных с кэшированием, транзакциями и достижениями
"""

import sqlite3
import logging
import json
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Tuple
from contextlib import contextmanager
from functools import lru_cache
import threading

logger = logging.getLogger(__name__)


class DatabaseError(Exception):
    """Базовое исключение для ошибок БД"""
    pass


class Database:
    def __init__(self, db_name: str = "space_shooter.db"):
        """Инициализация базы данных с пулом соединений"""
        self.db_name = db_name
        self._local = threading.local()
        self.init_db()
        self._cache_stats = {}
        self._cache_expiry = {}
        logger.info(f"✅ База данных инициализирована: {db_name}")
    
    @contextmanager
    def get_connection(self):
        """Контекстный менеджер для безопасной работы с БД"""
        if not hasattr(self._local, 'conn'):
            self._local.conn = sqlite3.connect(
                self.db_name,
                check_same_thread=False,
                timeout=10.0
            )
            self._local.conn.row_factory = sqlite3.Row
        
        try:
            yield self._local.conn
        except Exception as e:
            self._local.conn.rollback()
            logger.error(f"❌ Ошибка работы с БД: {e}")
            raise DatabaseError(f"Database error: {e}")
    
    def init_db(self):
        """Создание таблиц в базе данных"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            # Таблица пользователей
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    user_id INTEGER PRIMARY KEY,
                    username TEXT,
                    first_name TEXT,
                    last_name TEXT,
                    language_code TEXT DEFAULT 'ru',
                    is_premium INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Таблица игр
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS games (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    score INTEGER,
                    level INTEGER,
                    difficulty TEXT,
                    duration_seconds INTEGER DEFAULT 0,
                    enemies_killed INTEGER DEFAULT 0,
                    accuracy_percent REAL DEFAULT 0,
                    played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (user_id)
                )
            ''')
            
            # Индексы для быстрого поиска
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_games_user_id 
                ON games(user_id)
            ''')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_games_score 
                ON games(score DESC)
            ''')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_games_played_at 
                ON games(played_at DESC)
            ''')
            
            # Таблица статистики (денормализованная для производительности)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS user_stats (
                    user_id INTEGER PRIMARY KEY,
                    best_score INTEGER DEFAULT 0,
                    max_level INTEGER DEFAULT 0,
                    games_played INTEGER DEFAULT 0,
                    total_score INTEGER DEFAULT 0,
                    total_playtime_seconds INTEGER DEFAULT 0,
                    total_enemies_killed INTEGER DEFAULT 0,
                    avg_accuracy REAL DEFAULT 0,
                    easy_games INTEGER DEFAULT 0,
                    normal_games INTEGER DEFAULT 0,
                    hard_games INTEGER DEFAULT 0,
                    nightmare_games INTEGER DEFAULT 0,
                    win_streak INTEGER DEFAULT 0,
                    best_win_streak INTEGER DEFAULT 0,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (user_id)
                )
            ''')
            
            # Таблица достижений
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS achievements (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    achievement_key TEXT,
                    unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, achievement_key),
                    FOREIGN KEY (user_id) REFERENCES users (user_id)
                )
            ''')
            
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_achievements_user_id 
                ON achievements(user_id)
            ''')
            
            # Таблица ежедневных заданий
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS daily_challenges (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    challenge_type TEXT,
                    target_value INTEGER,
                    current_value INTEGER DEFAULT 0,
                    completed INTEGER DEFAULT 0,
                    reward_claimed INTEGER DEFAULT 0,
                    date DATE DEFAULT (date('now')),
                    UNIQUE(user_id, challenge_type, date),
                    FOREIGN KEY (user_id) REFERENCES users (user_id)
                )
            ''')
            
            # Таблица сессий (для аналитики)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    ended_at TIMESTAMP,
                    games_count INTEGER DEFAULT 0,
                    FOREIGN KEY (user_id) REFERENCES users (user_id)
                )
            ''')
            
            conn.commit()
            logger.info("✅ Все таблицы созданы успешно")

            # Миграции: добавляем колонки если их нет (для старых БД)
            self._run_migrations(conn)

    def _run_migrations(self, conn):
        """Применяет миграции для обновления существующей схемы БД"""
        cursor = conn.cursor()
        migrations = [
            # users
            ("users", "last_name",       "ALTER TABLE users ADD COLUMN last_name TEXT"),
            ("users", "language_code",   "ALTER TABLE users ADD COLUMN language_code TEXT DEFAULT 'ru'"),
            ("users", "is_premium",      "ALTER TABLE users ADD COLUMN is_premium INTEGER DEFAULT 0"),
            ("users", "last_seen",       "ALTER TABLE users ADD COLUMN last_seen TIMESTAMP"),
            # games
            ("games", "duration_seconds","ALTER TABLE games ADD COLUMN duration_seconds INTEGER DEFAULT 0"),
            ("games", "enemies_killed",  "ALTER TABLE games ADD COLUMN enemies_killed INTEGER DEFAULT 0"),
            ("games", "accuracy_percent","ALTER TABLE games ADD COLUMN accuracy_percent REAL DEFAULT 0"),
            # user_stats
            ("user_stats", "total_playtime_seconds", "ALTER TABLE user_stats ADD COLUMN total_playtime_seconds INTEGER DEFAULT 0"),
            ("user_stats", "total_enemies_killed",   "ALTER TABLE user_stats ADD COLUMN total_enemies_killed INTEGER DEFAULT 0"),
            ("user_stats", "avg_accuracy",           "ALTER TABLE user_stats ADD COLUMN avg_accuracy REAL DEFAULT 0"),
            ("user_stats", "easy_games",             "ALTER TABLE user_stats ADD COLUMN easy_games INTEGER DEFAULT 0"),
            ("user_stats", "normal_games",           "ALTER TABLE user_stats ADD COLUMN normal_games INTEGER DEFAULT 0"),
            ("user_stats", "hard_games",             "ALTER TABLE user_stats ADD COLUMN hard_games INTEGER DEFAULT 0"),
            ("user_stats", "nightmare_games",        "ALTER TABLE user_stats ADD COLUMN nightmare_games INTEGER DEFAULT 0"),
            ("user_stats", "win_streak",             "ALTER TABLE user_stats ADD COLUMN win_streak INTEGER DEFAULT 0"),
            ("user_stats", "best_win_streak",        "ALTER TABLE user_stats ADD COLUMN best_win_streak INTEGER DEFAULT 0"),
            ("user_stats", "max_level",              "ALTER TABLE user_stats ADD COLUMN max_level INTEGER DEFAULT 0"),
            ("user_stats", "total_score",            "ALTER TABLE user_stats ADD COLUMN total_score INTEGER DEFAULT 0"),
            ("user_stats", "updated_at",             "ALTER TABLE user_stats ADD COLUMN updated_at TIMESTAMP"),
        ]
        for table, column, sql in migrations:
            try:
                cursor.execute(f"SELECT {column} FROM {table} LIMIT 1")
            except sqlite3.OperationalError:
                try:
                    cursor.execute(sql)
                    conn.commit()
                    logger.info(f"✅ Миграция: добавлена колонка {table}.{column}")
                except Exception as e:
                    logger.warning(f"⚠️ Миграция {table}.{column} не выполнена: {e}")

    def _invalidate_cache(self, user_id: int = None):
        """Инвалидация кэша"""
        if user_id:
            cache_key = f"stats_{user_id}"
            if cache_key in self._cache_stats:
                del self._cache_stats[cache_key]
                del self._cache_expiry[cache_key]
        else:
            self._cache_stats.clear()
            self._cache_expiry.clear()

    def add_user(self, user_id: int, username: str = None,
                 first_name: str = None, last_name: str = None,
                 language_code: str = 'ru', is_premium: bool = False) -> bool:
        """Добавить или обновить пользователя"""
        is_premium_int = int(bool(is_premium)) if is_premium is not None else 0
        language_code = language_code or 'ru'

        with self.get_connection() as conn:
            cursor = conn.cursor()

            try:
                cursor.execute('''
                    INSERT INTO users (user_id, username, first_name, last_name, language_code, is_premium, last_seen)
                    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(user_id) DO UPDATE SET
                        username = excluded.username,
                        first_name = excluded.first_name,
                        last_name = excluded.last_name,
                        language_code = excluded.language_code,
                        is_premium = excluded.is_premium,
                        last_seen = CURRENT_TIMESTAMP
                ''', (user_id, username, first_name, last_name, language_code, is_premium_int))

                # Создать запись статистики если её нет
                cursor.execute('''
                    INSERT OR IGNORE INTO user_stats (user_id)
                    VALUES (?)
                ''', (user_id,))

                conn.commit()
                logger.info(f"✅ Пользователь {user_id} добавлен/обновлен")
                return True
            except Exception as e:
                logger.error(f"❌ Ошибка добавления пользователя: {e}")
                return False

    def save_game(self, user_id: int, score: int, level: int, difficulty: str,
                  duration_seconds: int = 0, enemies_killed: int = 0,
                  accuracy_percent: float = 0.0) -> Tuple[bool, Dict]:
        """Сохранить результат игры с транзакцией"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            try:
                # Получаем текущую статистику
                cursor.execute('''
                    SELECT best_score, games_played, win_streak, best_win_streak 
                    FROM user_stats WHERE user_id = ?
                ''', (user_id,))

                result = cursor.fetchone()
                if not result:
                    # Создаем статистику если её нет
                    cursor.execute('INSERT INTO user_stats (user_id) VALUES (?)', (user_id,))
                    old_best = 0
                    games_played = 0
                    win_streak = 0
                    best_win_streak = 0
                else:
                    old_best, games_played, win_streak, best_win_streak = result

                # Сохраняем игру
                cursor.execute('''
                    INSERT INTO games (user_id, score, level, difficulty, duration_seconds, 
                                      enemies_killed, accuracy_percent)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (user_id, score, level, difficulty, duration_seconds, enemies_killed, accuracy_percent))

                # Вычисляем новые значения
                new_best = max(old_best, score)
                is_new_record = score > old_best

                # Обновляем серию побед (если набрал больше 100 очков - считаем победой)
                if score >= 100:
                    win_streak += 1
                    best_win_streak = max(best_win_streak, win_streak)
                else:
                    win_streak = 0

                # Обновляем статистику
                valid_difficulties = {'easy', 'normal', 'hard', 'nightmare'}
                if difficulty not in valid_difficulties:
                    difficulty = 'normal'
                difficulty_column = f"{difficulty}_games"
                cursor.execute(f'''
                    UPDATE user_stats
                    SET best_score = ?,
                        games_played = games_played + 1,
                        max_level = MAX(max_level, ?),
                        total_score = total_score + ?,
                        total_playtime_seconds = total_playtime_seconds + ?,
                        total_enemies_killed = total_enemies_killed + ?,
                        avg_accuracy = (avg_accuracy * games_played + ?) / (games_played + 1),
                        {difficulty_column} = {difficulty_column} + 1,
                        win_streak = ?,
                        best_win_streak = ?
                    WHERE user_id = ?
                ''', (new_best, level, score, duration_seconds, enemies_killed,
                      accuracy_percent, win_streak, best_win_streak, user_id))

                # Проверяем достижения
                new_achievements = self._check_achievements(cursor, user_id)

                # Обновляем ежедневные задания
                self._update_daily_challenges(cursor, user_id, score, enemies_killed)

                conn.commit()

                # Инвалидируем кэш
                self._invalidate_cache(user_id)

                logger.info(f"✅ Игра сохранена: user={user_id}, score={score}, level={level}")

                return True, {
                    'is_new_record': is_new_record,
                    'old_best': old_best,
                    'score_diff': score - old_best if is_new_record else 0,
                    'new_achievements': new_achievements,
                    'win_streak': win_streak
                }

            except Exception as e:
                conn.rollback()
                logger.error(f"❌ Ошибка сохранения игры: {e}")
                return False, {}

    def _check_achievements(self, cursor, user_id: int) -> List[Dict]:
        """Проверить и разблокировать достижения"""
        from config import ACHIEVEMENTS

        # Получаем статистику
        cursor.execute('''
            SELECT * FROM user_stats WHERE user_id = ?
        ''', (user_id,))
        stats = dict(cursor.fetchone())

        # Получаем ранг
        cursor.execute('''
            SELECT COUNT(*) + 1
            FROM user_stats
            WHERE best_score > (SELECT best_score FROM user_stats WHERE user_id = ?)
        ''', (user_id,))
        stats['rank'] = cursor.fetchone()[0]

        # Получаем уже разблокированные достижения
        cursor.execute('''
            SELECT achievement_key FROM achievements WHERE user_id = ?
        ''', (user_id,))
        unlocked = {row[0] for row in cursor.fetchall()}

        new_achievements = []

        # Проверяем каждое достижение
        for key, achievement in ACHIEVEMENTS.items():
            if key not in unlocked and achievement['condition'](stats):
                cursor.execute('''
                    INSERT INTO achievements (user_id, achievement_key)
                    VALUES (?, ?)
                ''', (user_id, key))
                new_achievements.append({
                    'key': key,
                    'name': achievement['name'],
                    'emoji': achievement['emoji'],
                    'description': achievement['description']
                })
                logger.info(f"🎊 Новое достижение для {user_id}: {achievement['name']}")

        return new_achievements

    def _update_daily_challenges(self, cursor, user_id: int, score: int, enemies_killed: int):
        """Обновить прогресс ежедневных заданий"""
        today = datetime.now().date()

        # Обновляем задание на очки
        cursor.execute('''
            INSERT INTO daily_challenges (user_id, challenge_type, target_value, current_value, date)
            VALUES (?, 'daily_score', 1000, ?, ?)
            ON CONFLICT(user_id, challenge_type, date) DO UPDATE SET
                current_value = current_value + excluded.current_value,
                completed = CASE WHEN current_value >= target_value THEN 1 ELSE 0 END
        ''', (user_id, score, today))

        # Обновляем задание на убийства
        cursor.execute('''
            INSERT INTO daily_challenges (user_id, challenge_type, target_value, current_value, date)
            VALUES (?, 'daily_kills', 50, ?, ?)
            ON CONFLICT(user_id, challenge_type, date) DO UPDATE SET
                current_value = current_value + excluded.current_value,
                completed = CASE WHEN current_value >= target_value THEN 1 ELSE 0 END
        ''', (user_id, enemies_killed, today))

    def get_user_stats(self, user_id: int, use_cache: bool = True) -> Optional[Dict]:
        """Получить статистику пользователя с кэшированием"""
        cache_key = f"stats_{user_id}"

        # Проверяем кэш
        if use_cache and cache_key in self._cache_stats:
            expiry = self._cache_expiry.get(cache_key, datetime.min)
            if datetime.now() < expiry:
                return self._cache_stats[cache_key]

        with self.get_connection() as conn:
            cursor = conn.cursor()

            try:
                cursor.execute('SELECT * FROM user_stats WHERE user_id = ?', (user_id,))
                result = cursor.fetchone()

                if result:
                    stats = dict(result)

                    # Кэшируем на 30 секунд
                    self._cache_stats[cache_key] = stats
                    self._cache_expiry[cache_key] = datetime.now() + timedelta(seconds=30)

                    return stats
                return None
            except Exception as e:
                logger.error(f"❌ Ошибка получения статистики: {e}")
                return None

    def get_top_players(self, limit: int = 10) -> List[Dict]:
        """Получить топ игроков"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            try:
                cursor.execute('''
                    SELECT u.first_name, u.username, s.best_score, s.games_played, 
                           u.is_premium
                    FROM user_stats s
                    JOIN users u ON s.user_id = u.user_id
                    WHERE s.best_score > 0
                    ORDER BY s.best_score DESC, s.games_played ASC
                    LIMIT ?
                ''', (limit,))

                results = cursor.fetchall()
                return [
                    {
                        'name': row[0] or row[1] or 'Аноним',
                        'score': row[2],
                        'games_played': row[3],
                        'is_premium': bool(row[4])
                    }
                    for row in results
                ]
            except Exception as e:
                logger.error(f"❌ Ошибка получения топа: {e}")
                return []

    def get_user_rank(self, user_id: int) -> Optional[int]:
        """Получить место пользователя в рейтинге"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            try:
                cursor.execute('''
                    SELECT COUNT(*) + 1
                    FROM user_stats
                    WHERE best_score > (SELECT best_score FROM user_stats WHERE user_id = ?)
                       OR (best_score = (SELECT best_score FROM user_stats WHERE user_id = ?)
                           AND games_played < (SELECT games_played FROM user_stats WHERE user_id = ?))
                ''', (user_id, user_id, user_id))

                result = cursor.fetchone()
                return result[0] if result else None
            except Exception as e:
                logger.error(f"❌ Ошибка получения ранга: {e}")
                return None

    def get_recent_games(self, user_id: int, limit: int = 5) -> List[Dict]:
        """Получить последние игры пользователя"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            try:
                cursor.execute('''
                    SELECT score, level, difficulty, duration_seconds, 
                           enemies_killed, accuracy_percent, played_at
                    FROM games
                    WHERE user_id = ?
                    ORDER BY played_at DESC
                    LIMIT ?
                ''', (user_id, limit))

                results = cursor.fetchall()
                return [
                    {
                        'score': row[0],
                        'level': row[1],
                        'difficulty': row[2],
                        'duration': row[3],
                        'enemies_killed': row[4],
                        'accuracy': row[5],
                        'played_at': row[6]
                    }
                    for row in results
                ]
            except Exception as e:
                logger.error(f"❌ Ошибка получения истории игр: {e}")
                return []

    def get_user_achievements(self, user_id: int) -> List[str]:
        """Получить разблокированные достижения пользователя"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            try:
                cursor.execute('''
                    SELECT achievement_key, unlocked_at 
                    FROM achievements 
                    WHERE user_id = ?
                    ORDER BY unlocked_at DESC
                ''', (user_id,))

                return [row[0] for row in cursor.fetchall()]
            except Exception as e:
                logger.error(f"❌ Ошибка получения достижений: {e}")
                return []

    def get_daily_challenges(self, user_id: int) -> List[Dict]:
        """Получить ежедневные задания пользователя"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            today = datetime.now().date()

            try:
                cursor.execute('''
                    SELECT challenge_type, target_value, current_value, completed, reward_claimed
                    FROM daily_challenges
                    WHERE user_id = ? AND date = ?
                ''', (user_id, today))

                return [
                    {
                        'type': row[0],
                        'target': row[1],
                        'current': row[2],
                        'completed': bool(row[3]),
                        'claimed': bool(row[4])
                    }
                    for row in cursor.fetchall()
                ]
            except Exception as e:
                logger.error(f"❌ Ошибка получения заданий: {e}")
                return []

    def get_global_stats(self) -> Dict:
        """Получить глобальную статистику"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            try:
                cursor.execute('''
                    SELECT 
                        COUNT(DISTINCT user_id) as total_users,
                        COUNT(*) as total_games,
                        SUM(score) as total_score,
                        MAX(score) as max_score,
                        AVG(score) as avg_score
                    FROM games
                ''')

                row = cursor.fetchone()
                return {
                    'total_users': row[0] or 0,
                    'total_games': row[1] or 0,
                    'total_score': row[2] or 0,
                    'max_score': row[3] or 0,
                    'avg_score': round(row[4], 1) if row[4] else 0
                }
            except Exception as e:
                logger.error(f"❌ Ошибка получения глобальной статистики: {e}")
                return {}

    def cleanup_old_data(self, days: int = 90):
        """Очистка старых данных"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            try:
                cutoff_date = datetime.now() - timedelta(days=days)
                cursor.execute('''
                    DELETE FROM games 
                    WHERE played_at < ? AND user_id NOT IN (
                        SELECT user_id FROM user_stats WHERE best_score > 0
                    )
                ''', (cutoff_date,))

                deleted = cursor.rowcount
                conn.commit()
                logger.info(f"✅ Удалено {deleted} старых записей игр")
                return deleted
            except Exception as e:
                logger.error(f"❌ Ошибка очистки данных: {e}")
                return 0


# Создание экземпляра базы данных
db = Database()