"""
Публичный HTTP API для игры Space Shooter.
Отдаёт таблицу лидеров из той же базы данных, что использует бот (database.py).
Запускается в отдельном потоке рядом с ботом (см. run_api_server в bot.py).
"""

import asyncio
import logging
from aiohttp import web

from database import db

logger = logging.getLogger(__name__)

MAX_LEADERBOARD_LIMIT = 50


def _cors(response: web.StreamResponse) -> web.StreamResponse:
    # Публичные данные только для чтения — открытый CORS не создаёт риска
    response.headers['Access-Control-Allow-Origin'] = '*'
    return response


async def leaderboard_handler(request: web.Request) -> web.Response:
    try:
        limit = int(request.query.get('limit', 20))
    except ValueError:
        limit = 20
    limit = max(1, min(limit, MAX_LEADERBOARD_LIMIT))

    players = db.get_top_players(limit=limit)
    data = [
        {
            'id': p['user_id'],
            'name': p['name'],
            'score': p['score'],
            'games_played': p['games_played'],
            'max_level': p['max_level'],
        }
        for p in players
    ]
    return _cors(web.json_response(data))


async def health_handler(request: web.Request) -> web.Response:
    return _cors(web.json_response({'status': 'ok'}))


def create_app() -> web.Application:
    app = web.Application()
    app.router.add_get('/api/leaderboard', leaderboard_handler)
    app.router.add_get('/api/health', health_handler)
    return app


async def _serve(host: str, port: int):
    app = create_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host, port)
    await site.start()
    logger.info(f"🌐 API лидерборда запущен на http://{host}:{port}")
    await asyncio.Event().wait()  # держим сервер живым бесконечно


def run_api_server(host: str, port: int):
    """Блокирующий запуск aiohttp-сервера. Предназначена для вызова в
    отдельном потоке (см. bot.py), поэтому используется AppRunner/TCPSite
    напрямую, а не web.run_app() — она пытается ставить обработчики сигналов,
    что вызывает ValueError вне главного потока."""
    asyncio.run(_serve(host, port))
