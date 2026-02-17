"""
Database module for Space Shooter Bot
Управление базой данных для хранения статистики игроков
"""

import sqlite3
import logging
from datetime import datetime
from typing import Optional, List, Dict

logger = logging.getLogger(__name__)


class Database:
    def __init__(self, db_name: str = "space_shooter.db"):
        """Инициализация базы данных"""
        self.db_name = db_name
        self.init_db()
    
    def get_connection(self):
        """Получить подключение к БД"""
        return sqlite3.connect(self.db_name)
    
    def init_db(self):
        """Создание таблиц в базе данных"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        # Таблица пользователей
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                username TEXT,
                first_name TEXT,
                last_name TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
                played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
        ''')
        
        # Таблица рекордов
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS high_scores (
                user_id INTEGER PRIMARY KEY,
                best_score INTEGER DEFAULT 0,
                max_level INTEGER DEFAULT 0,
                games_played INTEGER DEFAULT 0,
                easy_games INTEGER DEFAULT 0,
                normal_games INTEGER DEFAULT 0,
                hard_games INTEGER DEFAULT 0,
                nightmare_games INTEGER DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
        ''')
        
        conn.commit()
        conn.close()
        logger.info("✅ База данных инициализирована")
    
    def add_user(self, user_id: int, username: str = None, 
                 first_name: str = None, last_name: str = None):
        """Добавить нового пользователя"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute('''
                INSERT OR IGNORE INTO users (user_id, username, first_name, last_name)
                VALUES (?, ?, ?, ?)
            ''', (user_id, username, first_name, last_name))
            
            # Создать запись в таблице рекордов
            cursor.execute('''
                INSERT OR IGNORE INTO high_scores (user_id)
                VALUES (?)
            ''', (user_id,))
            
            conn.commit()
            logger.info(f"✅ Пользователь {user_id} добавлен")
        except Exception as e:
            logger.error(f"❌ Ошибка добавления пользователя: {e}")
        finally:
            conn.close()
    
    def save_game(self, user_id: int, score: int, level: int, difficulty: str):
        """Сохранить результат игры"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            # Сохранить игру
            cursor.execute('''
                INSERT INTO games (user_id, score, level, difficulty)
                VALUES (?, ?, ?, ?)
            ''', (user_id, score, level, difficulty))
            
            # Обновить статистику
            cursor.execute('''
                SELECT best_score, games_played FROM high_scores
                WHERE user_id = ?
            ''', (user_id,))
            
            result = cursor.fetchone()
            if result:
                current_best, games_played = result
                new_best = max(current_best, score)
                
                # Обновить счетчики по сложности
                difficulty_column = f"{difficulty}_games"
                
                cursor.execute(f'''
                    UPDATE high_scores
                    SET best_score = ?,
                        games_played = games_played + 1,
                        max_level = MAX(max_level, ?),
                        {difficulty_column} = {difficulty_column} + 1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = ?
                ''', (new_best, level, user_id))
            
            conn.commit()
            logger.info(f"✅ Игра сохранена: user={user_id}, score={score}, level={level}")
            return True
        except Exception as e:
            logger.error(f"❌ Ошибка сохранения игры: {e}")
            return False
        finally:
            conn.close()
    
    def get_user_stats(self, user_id: int) -> Optional[Dict]:
        """Получить статистику пользователя"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute('''
                SELECT best_score, max_level, games_played,
                       easy_games, normal_games, hard_games, nightmare_games
                FROM high_scores
                WHERE user_id = ?
            ''', (user_id,))
            
            result = cursor.fetchone()
            if result:
                return {
                    'best_score': result[0],
                    'max_level': result[1],
                    'games_played': result[2],
                    'easy_games': result[3],
                    'normal_games': result[4],
                    'hard_games': result[5],
                    'nightmare_games': result[6]
                }
            return None
        except Exception as e:
            logger.error(f"❌ Ошибка получения статистики: {e}")
            return None
        finally:
            conn.close()
    
    def get_top_players(self, limit: int = 10) -> List[Dict]:
        """Получить топ игроков"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute('''
                SELECT u.first_name, u.username, h.best_score
                FROM high_scores h
                JOIN users u ON h.user_id = u.user_id
                WHERE h.best_score > 0
                ORDER BY h.best_score DESC
                LIMIT ?
            ''', (limit,))
            
            results = cursor.fetchall()
            return [
                {
                    'name': row[0] or row[1] or 'Аноним',
                    'score': row[2]
                }
                for row in results
            ]
        except Exception as e:
            logger.error(f"❌ Ошибка получения топа: {e}")
            return []
        finally:
            conn.close()
    
    def get_user_rank(self, user_id: int) -> Optional[int]:
        """Получить место пользователя в рейтинге"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute('''
                SELECT COUNT(*) + 1
                FROM high_scores
                WHERE best_score > (
                    SELECT best_score FROM high_scores WHERE user_id = ?
                )
            ''', (user_id,))
            
            result = cursor.fetchone()
            return result[0] if result else None
        except Exception as e:
            logger.error(f"❌ Ошибка получения ранга: {e}")
            return None
        finally:
            conn.close()
    
    def get_recent_games(self, user_id: int, limit: int = 5) -> List[Dict]:
        """Получить последние игры пользователя"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute('''
                SELECT score, level, difficulty, played_at
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
                    'played_at': row[3]
                }
                for row in results
            ]
        except Exception as e:
            logger.error(f"❌ Ошибка получения истории игр: {e}")
            return []
        finally:
            conn.close()


# Создание экземпляра базы данных
db = Database()
