"""Схема корабля в разрезе для экрана «Корабль» (3.1).

Запуск (из корня проекта):
    python tools/make_cutaway.py

Берёт корабль с листа art/sheet16_ship_cutaway.jpg (без подписей), убирает фон и тонкие
линии-выноски вокруг корпуса, поворачивает носом вверх и сохраняет assets/ship_cutaway.webp.
Отсеки размечены в js/ui.js (SHIP_ROOMS) в долях уже повёрнутой картинки.
"""
import os
from collections import deque

from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art', 'sheet16_ship_cutaway.jpg')
OUT = os.path.join(ROOT, 'assets', 'ship_cutaway.webp')
BOX = (15, 225, 1090, 600)   # корабль на листе: нос справа


def main():
    im = Image.open(SRC).convert('RGB').crop(BOX)
    w, h = im.size
    px = im.load()
    bg = px[2, h // 2]

    def is_bg(c):
        return sum(abs(c[k] - bg[k]) for k in range(3)) < 60

    # корпус: всё, что не фон; выноски толщиной в 1–3 px срезаем размыканием маски
    m = Image.new('L', (w, h), 0)
    mp = m.load()
    for y in range(h):
        for x in range(w):
            if not is_bg(px[x, y]):
                mp[x, y] = 255
    # размыкание срезает выноски (тонкие линии), замыкание заклеивает тёмные отсеки внутри корпуса
    m = m.filter(ImageFilter.MinFilter(11)).filter(ImageFilter.MaxFilter(11))
    m = m.filter(ImageFilter.MaxFilter(21)).filter(ImageFilter.MinFilter(21))
    # всё, до чего фон дотягивается от краёв, — снаружи; остальное корпус
    mp = m.load()
    outside = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not mp[x, y]:
                outside[y * w + x] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not mp[x, y] and not outside[y * w + x]:
                outside[y * w + x] = 1
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not outside[ny * w + nx] and not mp[nx, ny]:
                outside[ny * w + nx] = 1
                q.append((nx, ny))
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    op = out.load()
    for y in range(h):
        for x in range(w):
            if not outside[y * w + x]:
                c = px[x, y]
                op[x, y] = (c[0], c[1], c[2], 255)
    out = out.rotate(90, expand=True)   # нос вверх
    out.save(OUT, 'WEBP', quality=85, alpha_quality=100, method=6)
    print('%s %dx%d, %d bytes' % (OUT, out.width, out.height, os.path.getsize(OUT)))


if __name__ == '__main__':
    main()
