"""
Публичный HTTP API для игры Space Shooter.
Запускается в отдельном потоке рядом с ботом (см. run_api_server в bot.py).

  GET  /api/leaderboard?limit=20   — таблица лидеров (публичные данные)
  GET  /api/health                 — проверка, что сервер жив
  POST /api/score                  — результат забега   (нужен initData Telegram)
  POST /api/suggestion             — идея/баг от игрока (нужен initData Telegram)

Почему не sendData: игра открывается инлайн-кнопкой, а Telegram.WebApp.sendData()
работает только для Mini App, запущенных с обычной (reply) клавиатуры. Поэтому
результаты отправляются сюда по HTTPS, а подлинность проверяется подписью initData.

Важно: игра открывается по https (GitHub Pages), поэтому и этот API должен быть
доступен по https — иначе браузер заблокирует запросы. Адрес API указывается
в js/config.js (API_URL).
"""

import asyncio
import hashlib
import hmac
import html
import json
import logging
import time
from urllib.parse import parse_qsl

import aiohttp
from aiohttp import web

from config import ADMIN_CHAT_ID, BOT_TOKEN
from database import db

logger = logging.getLogger(__name__)

MAX_LEADERBOARD_LIMIT = 50
INIT_DATA_MAX_AGE = 24 * 3600          # initData старше суток не принимаем
SCORE_COOLDOWN = 8                     # секунд между результатами одного игрока
SUGGESTION_COOLDOWN = 60               # секунд между предложениями одного игрока
DIFFICULTIES = {'zen', 'easy', 'normal', 'hard', 'nightmare', 'god'}
CATEGORIES = {
    'gameplay': '🎮 Геймплей', 'balance': '⚖️ Баланс', 'graphics': '🎨 Графика',
    'music': '🎵 Музыка', 'bug': '🐛 Баг-репорт', 'general': '💡 Общее',
}

_last_score: dict = {}
_last_suggestion: dict = {}


def _cors(response: web.StreamResponse) -> web.StreamResponse:
    # Данные защищены подписью initData, поэтому открытый CORS безопасен
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    response.headers['Access-Control-Max-Age'] = '86400'
    return response


def _error(status: int, message: str) -> web.Response:
    return _cors(web.json_response({'ok': False, 'error': message}, status=status))


def verify_init_data(init_data: str, bot_token: str = BOT_TOKEN, max_age: int = INIT_DATA_MAX_AGE):
    """Проверка подписи Telegram Mini App (core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
    Возвращает словарь пользователя или None."""
    if not init_data or not bot_token or len(init_data) > 8192:
        return None
    try:
        pairs = dict(parse_qsl(init_data, keep_blank_values=True, strict_parsing=True))
    except ValueError:
        return None
    received = pairs.pop('hash', '')
    if not received:
        return None
    secret = hmac.new(b'WebAppData', bot_token.encode(), hashlib.sha256).digest()

    def calc(fields: dict) -> str:
        check = '\n'.join(f'{k}={fields[k]}' for k in sorted(fields))
        return hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()

    ok = hmac.compare_digest(calc(pairs), received)
    if not ok and 'signature' in pairs:
        # разные клиенты по-разному включают поле signature — проверяем оба варианта
        without_sig = {k: v for k, v in pairs.items() if k != 'signature'}
        ok = hmac.compare_digest(calc(without_sig), received)
    if not ok:
        return None
    try:
        auth_date = int(pairs.get('auth_date', '0'))
    except ValueError:
        return None
    if max_age and time.time() - auth_date > max_age:
        return None
    try:
        user = json.loads(pairs.get('user', '{}'))
    except ValueError:
        return None
    if not isinstance(user, dict) or not isinstance(user.get('id'), int):
        return None
    return user


async def _read_json(request: web.Request) -> dict:
    # игра шлёт text/plain (простой запрос без CORS-preflight), поэтому читаем как текст
    raw = await request.text()
    if len(raw) > 16384:
        raise ValueError('слишком большой запрос')
    data = json.loads(raw or '{}')
    if not isinstance(data, dict):
        raise ValueError('ожидался объект')
    return data


def _int(value, lo: int, hi: int, default: int = 0) -> int:
    try:
        return max(lo, min(hi, int(float(value))))
    except (TypeError, ValueError):
        return default


async def leaderboard_handler(request: web.Request) -> web.Response:
    limit = _int(request.query.get('limit', 20), 1, MAX_LEADERBOARD_LIMIT, 20)
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


async def options_handler(request: web.Request) -> web.Response:
    return _cors(web.Response(status=204))


async def score_handler(request: web.Request) -> web.Response:
    try:
        data = await _read_json(request)
    except (ValueError, json.JSONDecodeError):
        return _error(400, 'bad json')
    user = verify_init_data(data.get('initData', ''))
    if not user:
        return _error(403, 'bad initData')
    uid = user['id']
    now = time.time()
    if now - _last_score.get(uid, 0) < SCORE_COOLDOWN:
        return _error(429, 'too often')
    _last_score[uid] = now

    score = _int(data.get('score'), 0, 500_000_000)
    wave = _int(data.get('wave'), 1, 9999, 1)
    duration = _int(data.get('duration'), 0, 24 * 3600)
    kills = _int(data.get('kills'), 0, 10_000_000)
    try:
        accuracy = max(0.0, min(100.0, float(data.get('accuracy', 0))))
    except (TypeError, ValueError):
        accuracy = 0.0
    difficulty = data.get('difficulty') if data.get('difficulty') in DIFFICULTIES else 'normal'
    # грубая защита от явно подделанных результатов
    if score > duration * 150_000 + 50_000:
        logger.warning(f'⚠️ Подозрительный результат: user={uid} score={score} dur={duration}')
        return _error(422, 'implausible score')

    db.add_user(uid, user.get('username'), user.get('first_name'), user.get('last_name'),
                user.get('language_code') or 'ru', bool(user.get('is_premium')))
    old_rank = db.get_user_rank(uid)
    success, info = db.save_game(uid, score, wave, difficulty, duration, kills, accuracy)
    if not success:
        return _error(500, 'db error')
    rank = db.get_user_rank(uid)
    logger.info(f'📊 API: результат user={uid} score={score} wave={wave} diff={difficulty} rank={rank}')
    return _cors(web.json_response({
        'ok': True, 'rank': rank, 'old_rank': old_rank,
        'new_record': bool(info.get('is_new_record')),
        'achievements': [a.get('name') for a in info.get('new_achievements', [])],
    }))


async def _notify_admin(text: str):
    if not ADMIN_CHAT_ID or not BOT_TOKEN:
        return
    url = f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage'
    try:
        timeout = aiohttp.ClientTimeout(total=10)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(url, json={'chat_id': ADMIN_CHAT_ID, 'text': text, 'parse_mode': 'HTML'}) as resp:
                if resp.status != 200:
                    logger.warning(f'Не удалось переслать предложение администратору: HTTP {resp.status}')
    except Exception as e:  # сеть недоступна и т.п. — предложение уже сохранено в БД
        # текст ошибки может содержать адрес запроса с токеном, поэтому маскируем его
        logger.warning('Не удалось переслать предложение администратору: %s', str(e).replace(BOT_TOKEN, '<BOT_TOKEN>'))


async def suggestion_handler(request: web.Request) -> web.Response:
    try:
        data = await _read_json(request)
    except (ValueError, json.JSONDecodeError):
        return _error(400, 'bad json')
    user = verify_init_data(data.get('initData', ''))
    if not user:
        return _error(403, 'bad initData')
    uid = user['id']
    now = time.time()
    if now - _last_suggestion.get(uid, 0) < SUGGESTION_COOLDOWN:
        return _error(429, 'too often')
    text = str(data.get('text', '')).strip()
    if not 10 <= len(text) <= 1000:
        return _error(400, 'bad text length')
    category = data.get('category') if data.get('category') in CATEGORIES else 'general'
    _last_suggestion[uid] = now

    db.add_user(uid, user.get('username'), user.get('first_name'), user.get('last_name'),
                user.get('language_code') or 'ru', bool(user.get('is_premium')))
    db.save_suggestion(uid, text, category)
    name = html.escape(user.get('first_name') or 'Игрок')
    username = f" @{html.escape(user['username'])}" if user.get('username') else ''
    await _notify_admin(
        f'📬 <b>Новое предложение по игре!</b>\n\n'
        f'👤 От: {name}{username} (ID: <code>{uid}</code>)\n'
        f'📁 Категория: {CATEGORIES[category]}\n\n'
        f'💬 <b>Текст:</b>\n{html.escape(text)}'
    )
    logger.info(f'💡 API: предложение от {uid}: [{category}] {text[:50]}')
    return _cors(web.json_response({'ok': True}))


def create_app() -> web.Application:
    app = web.Application(client_max_size=64 * 1024)
    app.router.add_get('/api/leaderboard', leaderboard_handler)
    app.router.add_get('/api/health', health_handler)
    app.router.add_post('/api/score', score_handler)
    app.router.add_post('/api/suggestion', suggestion_handler)
    app.router.add_route('OPTIONS', '/api/{tail:.*}', options_handler)
    return app


async def _serve(host: str, port: int):
    app = create_app()
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host, port)
    await site.start()
    logger.info(f"🌐 API игры запущен на http://{host}:{port}")
    await asyncio.Event().wait()  # держим сервер живым бесконечно


def run_api_server(host: str, port: int):
    """Блокирующий запуск aiohttp-сервера. Предназначена для вызова в
    отдельном потоке (см. bot.py), поэтому используется AppRunner/TCPSite
    напрямую, а не web.run_app() — она пытается ставить обработчики сигналов,
    что вызывает ValueError вне главного потока."""
    asyncio.run(_serve(host, port))
