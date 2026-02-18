"""
Utilities for Space Shooter Bot Administration
Утилиты для администрирования и обслуживания бота
"""

import sqlite3
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, List
import json
import shutil
import os

logger = logging.getLogger(__name__)


class AdminUtils:
    """Административные утилиты для бота"""
    
    def __init__(self, db_name: str = "space_shooter.db"):
        self.db_name = db_name
    
    def backup_database(self, backup_dir: str = "backups") -> Optional[str]:
        """Создать резервную копию базы данных"""
        try:
            if not os.path.exists(backup_dir):
                os.makedirs(backup_dir)
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_name = f"{backup_dir}/space_shooter_backup_{timestamp}.db"
            
            shutil.copy2(self.db_name, backup_name)
            logger.info(f"✅ Резервная копия создана: {backup_name}")
            return backup_name
        except Exception as e:
            logger.error(f"❌ Ошибка создания резервной копии: {e}")
            return None
    
    def restore_database(self, backup_path: str) -> bool:
        """Восстановить базу данных из резервной копии"""
        try:
            if not os.path.exists(backup_path):
                logger.error(f"❌ Файл резервной копии не найден: {backup_path}")
                return False
            
            # Создаем резервную копию текущей БД перед восстановлением
            current_backup = self.backup_database()
            
            shutil.copy2(backup_path, self.db_name)
            logger.info(f"✅ База данных восстановлена из: {backup_path}")
            logger.info(f"ℹ️ Предыдущая версия сохранена: {current_backup}")
            return True
        except Exception as e:
            logger.error(f"❌ Ошибка восстановления базы данных: {e}")
            return False
    
    def get_database_stats(self) -> Dict:
        """Получить статистику базы данных"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        
        stats = {}
        
        try:
            # Размер базы данных
            stats['db_size_mb'] = os.path.getsize(self.db_name) / (1024 * 1024)
            
            # Количество записей в таблицах
            tables = ['users', 'games', 'user_stats', 'achievements', 'daily_challenges']
            for table in tables:
                cursor.execute(f'SELECT COUNT(*) FROM {table}')
                stats[f'{table}_count'] = cursor.fetchone()[0]
            
            # Активные пользователи за последние 7 дней
            week_ago = (datetime.now() - timedelta(days=7)).isoformat()
            cursor.execute('SELECT COUNT(*) FROM users WHERE last_seen > ?', (week_ago,))
            stats['active_users_7d'] = cursor.fetchone()[0]
            
            # Игры за последние 24 часа
            day_ago = (datetime.now() - timedelta(days=1)).isoformat()
            cursor.execute('SELECT COUNT(*) FROM games WHERE played_at > ?', (day_ago,))
            stats['games_24h'] = cursor.fetchone()[0]
            
            # Средний счет за последние 7 дней
            cursor.execute('''
                SELECT AVG(score) FROM games 
                WHERE played_at > ?
            ''', (week_ago,))
            result = cursor.fetchone()[0]
            stats['avg_score_7d'] = round(result, 1) if result else 0
            
            return stats
        except Exception as e:
            logger.error(f"❌ Ошибка получения статистики: {e}")
            return {}
        finally:
            conn.close()
    
    def cleanup_inactive_users(self, days: int = 180) -> int:
        """Удалить неактивных пользователей без игр"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        
        try:
            cutoff_date = (datetime.now() - timedelta(days=days)).isoformat()
            
            # Удаляем пользователей, которые не заходили и не играли
            cursor.execute('''
                DELETE FROM users 
                WHERE last_seen < ? 
                AND user_id NOT IN (SELECT DISTINCT user_id FROM games)
            ''', (cutoff_date,))
            
            deleted = cursor.rowcount
            conn.commit()
            logger.info(f"✅ Удалено неактивных пользователей: {deleted}")
            return deleted
        except Exception as e:
            logger.error(f"❌ Ошибка удаления неактивных пользователей: {e}")
            return 0
        finally:
            conn.close()
    
    def export_leaderboard(self, limit: int = 100, format: str = "json") -> Optional[str]:
        """Экспортировать таблицу лидеров"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        
        try:
            cursor.execute('''
                SELECT 
                    u.user_id,
                    u.first_name,
                    u.username,
                    s.best_score,
                    s.games_played,
                    s.max_level
                FROM user_stats s
                JOIN users u ON s.user_id = u.user_id
                WHERE s.best_score > 0
                ORDER BY s.best_score DESC
                LIMIT ?
            ''', (limit,))
            
            results = cursor.fetchall()
            leaderboard = [
                {
                    'rank': i + 1,
                    'user_id': row[0],
                    'name': row[1] or row[2] or 'Anonymous',
                    'best_score': row[3],
                    'games_played': row[4],
                    'max_level': row[5]
                }
                for i, row in enumerate(results)
            ]
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            
            if format == "json":
                filename = f"leaderboard_{timestamp}.json"
                with open(filename, 'w', encoding='utf-8') as f:
                    json.dump(leaderboard, f, indent=2, ensure_ascii=False)
            elif format == "csv":
                import csv
                filename = f"leaderboard_{timestamp}.csv"
                with open(filename, 'w', newline='', encoding='utf-8') as f:
                    writer = csv.DictWriter(f, fieldnames=leaderboard[0].keys())
                    writer.writeheader()
                    writer.writerows(leaderboard)
            else:
                logger.error(f"❌ Неподдерживаемый формат: {format}")
                return None
            
            logger.info(f"✅ Таблица лидеров экспортирована: {filename}")
            return filename
        except Exception as e:
            logger.error(f"❌ Ошибка экспорта таблицы лидеров: {e}")
            return None
        finally:
            conn.close()
    
    def reset_daily_challenges(self):
        """Сбросить все ежедневные задания"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        
        try:
            cursor.execute('DELETE FROM daily_challenges WHERE date < date("now")')
            deleted = cursor.rowcount
            conn.commit()
            logger.info(f"✅ Удалено старых заданий: {deleted}")
            return deleted
        except Exception as e:
            logger.error(f"❌ Ошибка сброса заданий: {e}")
            return 0
        finally:
            conn.close()
    
    def grant_achievement(self, user_id: int, achievement_key: str) -> bool:
        """Вручную выдать достижение пользователю"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        
        try:
            cursor.execute('''
                INSERT OR IGNORE INTO achievements (user_id, achievement_key)
                VALUES (?, ?)
            ''', (user_id, achievement_key))
            
            conn.commit()
            success = cursor.rowcount > 0
            
            if success:
                logger.info(f"✅ Достижение {achievement_key} выдано пользователю {user_id}")
            else:
                logger.info(f"ℹ️ Пользователь {user_id} уже имеет достижение {achievement_key}")
            
            return success
        except Exception as e:
            logger.error(f"❌ Ошибка выдачи достижения: {e}")
            return False
        finally:
            conn.close()
    
    def get_user_report(self, user_id: int) -> Optional[Dict]:
        """Получить подробный отчет по пользователю"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        
        try:
            # Основная информация
            cursor.execute('SELECT * FROM users WHERE user_id = ?', (user_id,))
            user = cursor.fetchone()
            
            if not user:
                return None
            
            # Статистика
            cursor.execute('SELECT * FROM user_stats WHERE user_id = ?', (user_id,))
            stats = cursor.fetchone()
            
            # Достижения
            cursor.execute('''
                SELECT achievement_key, unlocked_at 
                FROM achievements 
                WHERE user_id = ?
            ''', (user_id,))
            achievements = cursor.fetchall()
            
            # Последние игры
            cursor.execute('''
                SELECT score, level, difficulty, played_at 
                FROM games 
                WHERE user_id = ? 
                ORDER BY played_at DESC 
                LIMIT 10
            ''', (user_id,))
            recent_games = cursor.fetchall()
            
            report = {
                'user': {
                    'user_id': user[0],
                    'username': user[1],
                    'first_name': user[2],
                    'last_name': user[3],
                    'created_at': user[5],
                    'last_seen': user[6]
                },
                'stats': {
                    'best_score': stats[1] if stats else 0,
                    'games_played': stats[3] if stats else 0,
                    'max_level': stats[2] if stats else 0
                },
                'achievements': [
                    {'key': ach[0], 'unlocked_at': ach[1]} 
                    for ach in achievements
                ],
                'recent_games': [
                    {
                        'score': game[0],
                        'level': game[1],
                        'difficulty': game[2],
                        'played_at': game[3]
                    }
                    for game in recent_games
                ]
            }
            
            return report
        except Exception as e:
            logger.error(f"❌ Ошибка получения отчета: {e}")
            return None
        finally:
            conn.close()
    
    def optimize_database(self):
        """Оптимизировать базу данных"""
        conn = sqlite3.connect(self.db_name)
        cursor = conn.cursor()
        
        try:
            # VACUUM для уменьшения размера БД
            cursor.execute('VACUUM')
            
            # ANALYZE для оптимизации запросов
            cursor.execute('ANALYZE')
            
            conn.commit()
            logger.info("✅ База данных оптимизирована")
            return True
        except Exception as e:
            logger.error(f"❌ Ошибка оптимизации: {e}")
            return False
        finally:
            conn.close()


def main():
    """Интерактивная утилита администратора"""
    admin = AdminUtils()
    
    print("🔧 Space Shooter Bot - Административная утилита")
    print("=" * 50)
    
    while True:
        print("\n📋 Доступные операции:")
        print("1. Статистика базы данных")
        print("2. Создать резервную копию")
        print("3. Экспортировать таблицу лидеров")
        print("4. Очистить старые данные")
        print("5. Оптимизировать базу данных")
        print("6. Отчет по пользователю")
        print("0. Выход")
        
        choice = input("\nВыберите операцию: ")
        
        if choice == "1":
            stats = admin.get_database_stats()
            print("\n📊 Статистика базы данных:")
            for key, value in stats.items():
                print(f"  {key}: {value}")
        
        elif choice == "2":
            backup_file = admin.backup_database()
            if backup_file:
                print(f"✅ Резервная копия создана: {backup_file}")
        
        elif choice == "3":
            format_choice = input("Формат (json/csv): ").lower()
            filename = admin.export_leaderboard(format=format_choice)
            if filename:
                print(f"✅ Экспортировано в: {filename}")
        
        elif choice == "4":
            days = int(input("Удалить данные старше (дней): "))
            deleted = admin.cleanup_inactive_users(days)
            print(f"✅ Удалено пользователей: {deleted}")
        
        elif choice == "5":
            admin.optimize_database()
            print("✅ База данных оптимизирована")
        
        elif choice == "6":
            user_id = int(input("ID пользователя: "))
            report = admin.get_user_report(user_id)
            if report:
                print(json.dumps(report, indent=2, ensure_ascii=False))
            else:
                print("❌ Пользователь не найден")
        
        elif choice == "0":
            print("👋 До свидания!")
            break
        
        else:
            print("❌ Неверный выбор")


if __name__ == '__main__':
    main()
