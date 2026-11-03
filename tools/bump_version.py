"""Поднять версию игры во всех местах сразу (4.2.2).

Запуск (из корня проекта):
    python tools/bump_version.py 4.2.3

Меняет:
  js/core.js   — SS.VERSION
  sw.js        — VERSION кэша и ?v= у всех файлов в списке
  index.html   — ?v= у скриптов, стилей и картинок, значки «4.2» на логотипах (major.minor)
Без новой версии в sw.js и ?v= телефоны продолжают брать старые файлы из кэша.
Концы строк (CRLF/LF) в файлах сохраняются.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VER_RE = r'\d+\.\d+\.\d+'


def edit(rel, subs):
    path = os.path.join(ROOT, rel)
    with open(path, 'rb') as f:
        text = f.read().decode('utf-8')
    total = 0
    for pattern, repl in subs:
        text, n = re.subn(pattern, repl, text)
        if n == 0:
            sys.exit(f'{rel}: не найдено {pattern!r} — файл изменился, поправьте скрипт')
        total += n
    with open(path, 'wb') as f:
        f.write(text.encode('utf-8'))
    return total


def main():
    # консоль Windows по умолчанию в cp1251 — печатаем в UTF-8
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, 'reconfigure'):
            stream.reconfigure(encoding='utf-8')
    if len(sys.argv) != 2 or not re.fullmatch(VER_RE, sys.argv[1]):
        sys.exit('Использование: python tools/bump_version.py 4.2.3')
    new = sys.argv[1]
    short = '.'.join(new.split('.')[:2])
    with open(os.path.join(ROOT, 'js', 'core.js'), encoding='utf-8') as f:
        old = re.search(r"SS\.VERSION = '(" + VER_RE + ")'", f.read()).group(1)
    if old == new:
        sys.exit(f'Версия уже {new}')

    counts = {
        'js/core.js': edit('js/core.js', [(r"SS\.VERSION = '" + VER_RE + "'", f"SS.VERSION = '{new}'")]),
        'sw.js': edit('sw.js', [
            (r"const VERSION = 'ss-" + VER_RE + "'", f"const VERSION = 'ss-{new}'"),
            (r'\?v=' + VER_RE, f'?v={new}'),
        ]),
        'index.html': edit('index.html', [
            (r'\?v=' + VER_RE, f'?v={new}'),
            (r'(class="(?:ver|l3)">)\d+\.\d+(<)', r'\g<1>' + short + r'\g<2>'),
        ]),
    }
    print(f'{old} -> {new}')
    for rel, n in counts.items():
        print(f'  {rel}: {n} замен')


if __name__ == '__main__':
    main()
