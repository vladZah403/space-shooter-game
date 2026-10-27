"""Нарезка спрайтов из концепт-листов в атлас игры.

Запуск (из корня проекта):
    python tools/extract_sprites.py            # собрать assets/sprites*.png|webp и js/atlas.js
    python tools/extract_sprites.py <папка>    # плюс превью для проверки

Режимы:
  solid — заливка фона от краёв -> непрозрачное тело + мягкий край (корабли, враги, бонусы)
  add   — свечение за вычетом фона, рисуется в режиме 'lighter' (пули, взрывы)
  glow  — непрозрачное тело внутри яркого ореола (ракеты, мины): заливка проходит
          тёмные и насыщенно-светящиеся пиксели и останавливается о металл корпуса
"""
import json
import os
import sys
from collections import deque

from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# листы спрайтов: 0 — основной, 1 — новые корабли игрока, 2 — новые враги, 3 — новые боссы,
# 4 — классические боссы, 5 — боссы 2.1, 6 — враги 2.1, 7 — корабли 2.1, 8 — кастомизация (цветные корабли),
# 9 — эффекты (VFX: взрывы, щиты, порталы, мины, ракеты), 10 — каталог эффектов (экраны, индикаторы, разрушения)
SHEET_FILES = [os.path.join('art', f) for f in (
    'sheet00_main.png',
    'sheet01_player_ships.png',
    'sheet02_enemies.png',
    'sheet03_bosses.png',
    'sheet04_classic_bosses.png',
    'sheet05_bosses_21.png',
    'sheet06_enemies_21.png',
    'sheet07_ships_21.png',
    'sheet08_customization.png',
    'sheet09_vfx.png',
    'sheet10_vfx_catalogue.png',
)]
OUT_PNG = os.path.join(ROOT, 'assets', 'sprites.png')
OUT_JS = os.path.join(ROOT, 'js', 'atlas.js')
PREV = sys.argv[1] if len(sys.argv) > 1 else None

SHEETS = [Image.open(os.path.join(ROOT, f)).convert('RGB').load() for f in SHEET_FILES]
SPX = SHEETS[0]

# имя: ((x0, y0, x1, y1) включительно, режим[, лист[, опции]])
# опции: rot — 180 разворачивает спрайт носом вверх; deg — поворот на произвольный угол (выпрямить наклон);
# max — предел большей стороны в пикселях; split — разрезать на n связных кусков
SPRITES = {
    # корабли игрока (нарисованное пламя отрезано по низу корпуса)
    'ship1': ((44, 95, 153, 217), 'solid'),
    'ship2': ((183, 84, 292, 218), 'solid'),
    'ship3': ((317, 84, 431, 219), 'solid'),
    # враги
    'scout':       ((471, 96, 603, 240), 'solid'),
    'shooter':     ((625, 91, 774, 236), 'solid'),
    'heavy':       ((810, 91, 953, 238), 'solid'),
    'drone':       ((990, 114, 1098, 226), 'solid'),
    'assault':     ((40, 325, 182, 446), 'solid'),
    'armored':     ((228, 310, 371, 442), 'solid'),
    'sniper':      ((413, 310, 553, 445), 'solid'),
    'interceptor': ((595, 311, 753, 444), 'solid'),
    'techno':      ((801, 308, 962, 446), 'solid'),
    'hunter':      ((25, 508, 184, 639), 'solid'),
    'bomber':      ((205, 521, 403, 649), 'solid'),
    'gunship':     ((429, 500, 619, 647), 'solid'),
    'shielder':    ((655, 502, 798, 644), 'solid'),
    'kamikaze':    ((847, 500, 934, 652), 'solid'),
    'boss':        ((1006, 361, 1301, 665), 'solid'),
    # бонусы
    'pu_heal':   ((30, 966, 109, 1055), 'solid'),
    'pu_shield': ((120, 966, 198, 1055), 'solid'),
    'pu_power':  ((211, 966, 288, 1055), 'solid'),
    'pu_spread': ((304, 966, 383, 1054), 'solid'),
    'pu_multi':  ((411, 967, 490, 1055), 'solid'),
    'pu_speed':  ((527, 966, 606, 1054), 'solid'),
    'pu_star':   ((624, 966, 703, 1056), 'solid'),
    # пули (свечение)
    'pb_orb':    ((43, 816, 74, 846), 'add'),
    'pb_bolt_s': ((100, 794, 134, 861), 'add'),
    'pb_bolt_m': ((150, 770, 189, 862), 'add'),
    'pb_laser':  ((214, 751, 249, 871), 'add'),
    'pb_twin':   ((259, 763, 325, 859), 'add'),
    'eb_orb':    ((366, 811, 404, 848), 'add'),
    'eb_bolt_s': ((421, 794, 465, 853), 'add'),
    'eb_bolt_l': ((468, 778, 513, 862), 'add'),
    'eb_needle': ((518, 757, 569, 869), 'add'),
    'eb_dots':   ((579, 751, 615, 868), 'add'),
    'eb_fire':   ((616, 802, 667, 854), 'add'),
    # кадры взрыва
    'ex1': ((711, 781, 781, 847), 'add'),
    'ex2': ((796, 769, 889, 860), 'add'),
    'ex3': ((901, 760, 1012, 869), 'add'),
    'ex4': ((1018, 755, 1125, 872), 'add'),
    'ex5': ((1135, 747, 1271, 872), 'add'),

    # ── лист 1: новые корабли игрока (пламя отрезано) ──
    'ship4': ((208, 181, 448, 452), 'solid', 1),   # Модернизированный
    'ship5': ((469, 165, 754, 434), 'solid', 1),   # Тяжёлый
    'ship6': ((775, 111, 1074, 445), 'solid', 1),  # Абсолютный

    # ── лист 2: новые враги ──
    'e_drone2':       ((67, 149, 187, 267), 'solid', 2),
    'e_interceptor2': ((245, 98, 439, 293), 'solid', 2),
    'e_sniper2':      ((488, 72, 612, 309), 'solid', 2),
    'e_assault2':     ((672, 99, 844, 279), 'solid', 2),
    'e_kamikaze2':    ((897, 87, 1033, 309), 'solid', 2),
    'e_heavyfighter': ((39, 380, 295, 602), 'solid', 2),
    'e_redoubt':      ((314, 389, 577, 594), 'solid', 2),
    'e_bombardier':   ((610, 379, 798, 603), 'solid', 2),
    'e_destroyer':    ((830, 385, 1076, 905), 'solid', 2),
    'e_cruiser_h':    ((59, 685, 526, 908), 'solid', 2),
    'e_cruiser':      ((579, 661, 807, 911), 'solid', 2),

    # ── лист 3: новые боссы ──
    'b_spider':       ((20, 123, 510, 540), 'solid', 3),
    'b_battleship':   ((530, 113, 792, 540), 'solid', 3),
    'b_battleship2':  ((820, 123, 1076, 541), 'solid', 3),
    'b_mothership':   ((20, 605, 579, 908), 'solid', 3),
    'b_heavycruiser': ((610, 609, 1085, 908), 'solid', 3),

    # ── лист 4: классические боссы (свои спрайты вместо перекраски) ──
    'b_sniper':  ((98, 56, 348, 407), 'solid', 4),
    'b_kraken':  ((434, 76, 828, 407), 'solid', 4),
    'b_dread':   ((874, 75, 1219, 407), 'solid', 4),
    'b_phoenix': ((9, 462, 440, 798), 'solid', 4),
    'b_necro':   ((446, 468, 824, 790), 'solid', 4),
    'b_queen':   ((865, 466, 1227, 788), 'solid', 4),

    # ── лист 5: боссы 2.1 ──
    'b_inquisitor': ((14, 106, 533, 535), 'solid', 5, {'max': 440}),
    'b_chaos':      ((558, 116, 1074, 535), 'solid', 5, {'max': 440}),
    'b_overlord':   ((308, 569, 795, 905), 'solid', 5, {'max': 440}),

    # ── лист 6: враги 2.1 ──
    'e_biomech':   ((25, 78, 311, 300), 'solid', 6, {'max': 200}),
    'e_crystal':   ((335, 70, 565, 301), 'solid', 6, {'max': 170}),
    'e_bug':       ((585, 81, 810, 299), 'solid', 6, {'max': 150}),
    'e_platform':  ((837, 78, 1066, 299), 'solid', 6, {'max': 190}),
    'e_minelayer': ((18, 371, 315, 572), 'solid', 6, {'max': 210}),
    'e_ghost':     ((325, 359, 575, 583), 'solid', 6, {'max': 180}),
    'e_orbit':     ((592, 366, 802, 578), 'solid', 6, {'max': 170}),
    'e_ram':       ((828, 350, 1080, 595), 'solid', 6, {'max': 190}),
    'e_swarm':     ((66, 646, 257, 910), 'solid', 6, {'max': 180}),
    'e_parasite':  ((313, 653, 564, 910), 'solid', 6, {'max': 180}),
    'e_ion':       ((573, 650, 822, 912), 'solid', 6, {'max': 180}),
    'e_crab':      ((835, 656, 1073, 911), 'solid', 6, {'max': 190}),

    # ── лист 7: корабли игрока 2.1 (нарисованное пламя отрезано; часть кораблей развёрнута носом вверх) ──
    'ship7':  ((68, 182, 240, 391), 'solid', 7, {'max': 230}),               # Перехватчик
    'ship8':  ((455, 652, 645, 780), 'solid', 7, {'rot': 180, 'max': 230}),  # Манёвренный разведчик
    'ship9':  ((288, 240, 574, 405), 'solid', 7, {'rot': 180, 'max': 260}),  # Тяжёлый бомбардировщик
    'ship10': ((590, 205, 800, 399), 'solid', 7, {'max': 230}),              # Стелс-истребитель
    'ship11': ((826, 245, 1062, 422), 'solid', 7, {'rot': 180, 'max': 240}), # Крылатый штурмовик
    'ship12': ((70, 602, 378, 808), 'solid', 7, {'rot': 180, 'max': 270}),   # Двухфюзеляжный
    'ship13': ((768, 532, 972, 842), 'solid', 7, {'max': 280}),              # Линейный крейсер

    # ── лист 8: базовый корабль в разных цветах (раскраски «Сокола» и дроны-напарники) ──
    'c_blue':   ((45, 141, 149, 249), 'solid', 8),
    'c_red':    ((195, 141, 299, 249), 'solid', 8),
    'c_green':  ((346, 141, 450, 249), 'solid', 8),
    'c_gold':   ((497, 141, 601, 249), 'solid', 8),
    'c_purple': ((651, 141, 755, 249), 'solid', 8),
    'c_white':  ((801, 141, 905, 249), 'solid', 8),
    'c_orange': ((951, 141, 1055, 249), 'solid', 8),

    # ── лист 9: эффекты (рамки с запасом под ореол, без подписей и рамок панелей) ──
    'fx_charge':      ((328, 78, 413, 247), 'add', 9),     # заряд лазера на максимуме
    'fx_super':       ((434, 69, 536, 256), 'add', 9),     # суперзаряд рельсы
    'fx_rocket':      ((576, 156, 624, 246), 'glow', 9),
    'fx_rocket2':     ((645, 139, 698, 252), 'glow', 9),
    'fx_plasma2':     ((946, 94, 1073, 247), 'add', 9),    # плазменный шар (перекрашивается в цвет оружия)
    'fx_storm':       ((1290, 78, 1403, 256), 'add', 9),   # заряд поворотного лазера босса
    'fx_vortex':      ((1405, 66, 1515, 256), 'add', 9),   # тёмная материя, чёрная дыра
    'fx_ex_s':        ((21, 463, 92, 543), 'add', 9),
    'fx_ex_m':        ((97, 437, 194, 558), 'add', 9),
    'fx_ex_l':        ((196, 418, 312, 563), 'add', 9),
    'fx_ex_crit':     ((314, 401, 437, 567), 'add', 9),
    'fx_ex_kill':     ((439, 384, 596, 568), 'add', 9),
    'fx_sh_bubble':   ((768, 423, 888, 559), 'add', 9),
    'fx_sh_break':    ((890, 427, 990, 557), 'add', 9),
    'fx_sh_restore':  ((992, 396, 1092, 556), 'add', 9),
    'fx_speed':       ((1114, 440, 1177, 556), 'add', 9),
    'fx_regen':       ((1189, 434, 1265, 555), 'add', 9),
    'fx_beam':        ((1268, 392, 1355, 566), 'add', 9),
    'fx_crosshair':   ((1357, 437, 1442, 554), 'add', 9),
    'fx_pickup':      ((1444, 422, 1521, 562), 'add', 9),
    'fx_tr_engine':   ((31, 765, 86, 871), 'add', 9),
    'fx_tr_rocket':   ((269, 721, 340, 896), 'add', 9),
    'fx_mine':        ((464, 771, 506, 825), 'glow', 9),
    'fx_mine2':       ((511, 760, 577, 835), 'glow', 9),
    'fx_mine_spider': ((578, 740, 659, 858), 'glow', 9),
    'fx_portal_in':   ((823, 744, 914, 887), 'add', 9),
    'fx_portal_out':  ((917, 735, 1010, 889), 'add', 9),
    'fx_rock':        ((1136, 737, 1231, 885), 'solid', 9, {'split': 6}),  # обломки -> fx_rock1..6
    'fx_warp':        ((1327, 740, 1430, 873), 'add', 9),
    'fx_flare':       ((1431, 704, 1523, 892), 'add', 9),

    # ── лист 10: каталог эффектов ──
    'fx_kd_s':        ((566, 62, 657, 197), 'add', 10),    # разрушение корабля: малое, среднее, большое
    'fx_kd_m':        ((658, 62, 750, 197), 'add', 10),
    'fx_kd_l':        ((751, 55, 849, 197), 'add', 10),
    'fx_hit_plasma':  ((851, 55, 942, 197), 'add', 10),    # удар плазмы (тёмная материя, плазма)
    'fx_superblast':  ((944, 55, 1052, 197), 'add', 10),   # гибель игрока
    'fx_superex':     ((408, 45, 548, 197), 'add', 10),    # финальный взрыв босса
    'fx_bolt':        ((203, 575, 288, 703), 'add', 10),   # удар молнии
    'fx_shock':       ((450, 575, 550, 703), 'add', 10),   # ударная волна (бомба, нова)
    'fx_lock':        ((1140, 345, 1225, 462), 'add', 10), # захват цели снайпером
    'fx_warn':        ((1380, 365, 1445, 450), 'add', 10), # предупреждение
    'fx_dash':        ((757, 812, 833, 928), 'add', 10),   # рывок (уклонение)
    # следы двигателя для ангара (наклонные выпрямлены поворотом deg)
    'fx_tr_double':   ((1158, 72, 1220, 216), 'add', 10),
    'fx_tr_boost':    ((1232, 64, 1303, 218), 'add', 10, {'deg': 6}),
    'fx_tr_plasma':   ((1320, 64, 1412, 218), 'add', 10, {'deg': 27}),
    'fx_tr_spiral':   ((1418, 62, 1513, 214), 'add', 10),
    # события волны: ионная буря, метеоры (-> fx_meteor1..3), солнечная вспышка
    'fx_ion':         ((1048, 824, 1143, 930), 'add', 10),
    'fx_meteor':      ((1142, 820, 1242, 926), 'add', 10, {'split': 3}),
    'fx_solar':       ((1242, 820, 1331, 930), 'add', 10),
    # фиолетовый лазер врага (лист 9)
    'eb_plaser':      ((1108, 100, 1141, 246), 'add', 9),
}

# поздний атлас: свои спрайты боссов и большие мини-боссы. Он качается в фоне уже после появления меню
# (первый босс «Страж» нарисован спрайтом 'boss' и лежит в основном атласе)
LATE = {n for n in SPRITES if n.startswith('b_') or n.startswith('fx_scr_')} | {'e_destroyer', 'e_cruiser_h', 'fx_superblast', 'fx_superex'}

# сопла двигателей (координаты листа): x, y, относительный размер пламени
NOZZLES = {
    'ship1': [(99, 216, 1.0), (73, 214, 0.55), (124, 214, 0.55)],
    'ship2': [(237, 217, 1.0), (212, 215, 0.55), (262, 215, 0.55)],
    'ship3': [(372, 218, 1.0), (341, 214, 0.6), (404, 214, 0.6)],
    'ship4': [(301, 450, 0.9), (357, 450, 0.9)],
    'ship5': [(549, 425, 0.55), (582, 432, 0.9), (641, 432, 0.9), (674, 425, 0.55)],
    'ship6': [(849, 444, 0.8), (891, 444, 0.8), (953, 444, 0.8), (999, 444, 0.8)],
    # координаты листа до разворота — для развёрнутых спрайтов пересчитываются автоматически
    'ship7': [(152, 391, 1.0), (107, 390, 0.45), (197, 390, 0.45)],
    'ship8': [(508, 652, 0.7), (590, 652, 0.7)],
    'ship9': [(380, 240, 0.85), (473, 240, 0.85)],
    'ship10': [(660, 399, 0.55), (727, 399, 0.55)],
    'ship11': [(910, 245, 0.8), (977, 245, 0.8)],
    'ship12': [(163, 602, 0.85), (280, 602, 0.85)],
    'ship13': [(868, 822, 0.9), (842, 834, 0.45), (896, 834, 0.45)],
    'c_blue': [(97, 249, 1.0), (74, 247, 0.5), (120, 247, 0.5)],
    'c_red': [(247, 249, 1.0), (224, 247, 0.5), (270, 247, 0.5)],
    'c_green': [(398, 249, 1.0), (375, 247, 0.5), (421, 247, 0.5)],
    'c_gold': [(549, 249, 1.0), (526, 247, 0.5), (572, 247, 0.5)],
    'c_purple': [(703, 249, 1.0), (680, 247, 0.5), (726, 247, 0.5)],
    'c_white': [(853, 249, 1.0), (830, 247, 0.5), (876, 247, 0.5)],
    'c_orange': [(1003, 249, 1.0), (980, 247, 0.5), (1026, 247, 0.5)],
}


def is_navy(c):
    r, g, b = c
    return max(c) < 62 and b - r >= 8 and b - g >= 4


def bg_estimate(x0, y0, x1, y1):
    vals = []
    for x in range(x0, x1 + 1):
        for y in (y0, y1):
            c = SPX[x, y]
            if is_navy(c):
                vals.append(c)
    for y in range(y0, y1 + 1):
        for x in (x0, x1):
            c = SPX[x, y]
            if is_navy(c):
                vals.append(c)
    if not vals:
        return (2, 10, 24)
    vals.sort(key=lambda c: c[0] + c[1] + c[2])
    return vals[len(vals) // 2]


# радиус морфологического закрытия: не даёт заливке фона «протечь» внутрь
# корпуса через тёмные щели (у босса тёмный металл почти совпадает с фоном)
CLOSE = {'pu_spread': 4, 'boss': 5, 'interceptor': 2, 'assault': 2, 'techno': 2, 'bomber': 2, 'shielder': 2,
         'e_heavyfighter': 3, 'e_redoubt': 3, 'e_bombardier': 3, 'e_destroyer': 4, 'e_cruiser_h': 4, 'e_cruiser': 4,
         'b_spider': 5, 'b_battleship': 5, 'b_battleship2': 5, 'b_mothership': 5, 'b_heavycruiser': 5,
         'ship4': 2, 'ship5': 2, 'ship6': 2,
         'b_sniper': 5, 'b_kraken': 5, 'b_dread': 5, 'b_phoenix': 4, 'b_necro': 5, 'b_queen': 5,
         'b_inquisitor': 5, 'b_chaos': 5, 'b_overlord': 5,
         'e_biomech': 3, 'e_crystal': 2, 'e_bug': 3, 'e_platform': 3, 'e_minelayer': 3, 'e_ghost': 3,
         'e_orbit': 3, 'e_ram': 3, 'e_swarm': 3, 'e_parasite': 3, 'e_ion': 3, 'e_crab': 3,
         'ship7': 2, 'ship8': 2, 'ship9': 2, 'ship10': 2, 'ship11': 2, 'ship12': 2, 'ship13': 2}


def flood_outside(x0, y0, w, h, trav, blocked=None):
    outside = bytearray(w * h)
    q = deque()

    def seed(x, y):
        i = y * w + x
        if not outside[i] and not (blocked and blocked[i]) and trav(SPX[x0 + x, y0 + y]):
            outside[i] = 1
            q.append((x, y))

    for x in range(w):
        seed(x, 0)
        seed(x, h - 1)
    for y in range(h):
        seed(0, y)
        seed(w - 1, y)
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h:
                i = ny * w + nx
                if not outside[i] and not (blocked and blocked[i]) and trav(SPX[x0 + nx, y0 + ny]):
                    outside[i] = 1
                    q.append((nx, ny))
    return outside


def remove_holes(x0, y0, w, h, outside, bg, min_area=250, max_mean=9.0):
    """Крупные замкнутые области чистого фона (например, между лапами паука) делаем прозрачными."""
    def dist(c):
        return ((c[0] - bg[0]) ** 2 + (c[1] - bg[1]) ** 2 + (c[2] - bg[2]) ** 2) ** .5

    seen = bytearray(w * h)
    for sy in range(h):
        for sx in range(w):
            i = sy * w + sx
            if outside[i] or seen[i]:
                continue
            c = SPX[x0 + sx, y0 + sy]
            if not is_navy(c) or dist(c) > 14:
                continue
            comp = []
            q = deque([(sx, sy)])
            seen[i] = 1
            total = 0.0
            while q:
                x, y = q.popleft()
                comp.append(y * w + x)
                total += dist(SPX[x0 + x, y0 + y])
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        j = ny * w + nx
                        if not seen[j] and not outside[j]:
                            cc = SPX[x0 + nx, y0 + ny]
                            if is_navy(cc) and dist(cc) <= 14:
                                seen[j] = 1
                                q.append((nx, ny))
            if len(comp) >= min_area and total / len(comp) <= max_mean:
                for j in comp:
                    outside[j] = 1


def extract_solid(x0, y0, x1, y1, close_r=0, holes=True):
    w, h = x1 - x0 + 1, y1 - y0 + 1
    bg = bg_estimate(x0, y0, x1, y1)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    op = out.load()

    def trav(c):
        if is_navy(c):
            return True
        d = ((c[0] - bg[0]) ** 2 + (c[1] - bg[1]) ** 2 + (c[2] - bg[2]) ** 2) ** .5
        return d < 9

    outside = flood_outside(x0, y0, w, h, trav)
    if not close_r and holes:
        remove_holes(x0, y0, w, h, outside, bg)
    if close_r:
        m = Image.new('L', (w, h), 0)
        mp = m.load()
        for y in range(h):
            for x in range(w):
                if not outside[y * w + x]:
                    mp[x, y] = 255
        k = 2 * close_r + 1
        m = m.filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.MinFilter(k))
        mp = m.load()
        blocked = bytearray(w * h)
        for y in range(h):
            for x in range(w):
                if mp[x, y]:
                    blocked[y * w + x] = 1
        outside = flood_outside(x0, y0, w, h, trav, blocked)
    if holes:
        remove_holes(x0, y0, w, h, outside, bg)
    for y in range(h):
        for x in range(w):
            c = SPX[x0 + x, y0 + y]
            if not outside[y * w + x]:
                op[x, y] = (c[0], c[1], c[2], 255)
                continue
            a = 0.0
            for k in range(3):
                if c[k] > bg[k]:
                    a = max(a, (c[k] - bg[k]) / (255 - bg[k]))
            a = (a - 0.04) / 0.96
            if a <= 0:
                continue
            a = min(1.0, a)
            col = [max(0, min(255, int(round(bg[k] + (c[k] - bg[k]) / a)))) for k in range(3)]
            op[x, y] = (col[0], col[1], col[2], int(round(a * 255)))
    return out


def extract_add(x0, y0, x1, y1):
    w, h = x1 - x0 + 1, y1 - y0 + 1
    bg = bg_estimate(x0, y0, x1, y1)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    op = out.load()
    for y in range(h):
        for x in range(w):
            c = SPX[x0 + x, y0 + y]
            v = [max(0, c[k] - bg[k] - 3) for k in range(3)]
            m = max(v)
            if m <= 2:
                continue
            op[x, y] = (min(255, v[0] * 255 // m), min(255, v[1] * 255 // m), min(255, v[2] * 255 // m), m)
    return out


def extract_glow(x0, y0, x1, y1, dark=44, sat_t=0.5):
    w, h = x1 - x0 + 1, y1 - y0 + 1
    bg = bg_estimate(x0, y0, x1, y1)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    op = out.load()

    def trav(c):
        mx = max(c)
        if mx < dark:
            return True
        return (mx - min(c)) / mx > sat_t

    outside = flood_outside(x0, y0, w, h, trav)
    for y in range(h):
        for x in range(w):
            c = SPX[x0 + x, y0 + y]
            if not outside[y * w + x]:
                op[x, y] = (c[0], c[1], c[2], 255)
                continue
            a = 0.0
            for k in range(3):
                if c[k] > bg[k]:
                    a = max(a, (c[k] - bg[k]) / (255 - bg[k]))
            a = (a - 0.04) / 0.96
            if a <= 0:
                continue
            a = min(1.0, a)
            col = [max(0, min(255, int(round(bg[k] + (c[k] - bg[k]) / a)))) for k in range(3)]
            op[x, y] = (col[0], col[1], col[2], int(round(a * 255)))
    return out


def split_parts(img, n):
    """Делит кадр на n самых крупных связных кусков (обломки летят по отдельности)."""
    w, h = img.size
    ap = img.getchannel('A').load()
    label = [0] * (w * h)
    comps = []
    for sy in range(h):
        for sx in range(w):
            if label[sy * w + sx] or ap[sx, sy] <= 40:
                continue
            lid = len(comps) + 1
            label[sy * w + sx] = lid
            pts = [(sx, sy)]
            k = 0
            while k < len(pts):
                x, y = pts[k]
                k += 1
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1), (x + 1, y + 1), (x - 1, y - 1), (x + 1, y - 1), (x - 1, y + 1)):
                    if 0 <= nx < w and 0 <= ny < h and not label[ny * w + nx] and ap[nx, ny] > 40:
                        label[ny * w + nx] = lid
                        pts.append((nx, ny))
            comps.append((lid, pts))
    comps.sort(key=lambda c: -len(c[1]))
    parts = []
    for lid, pts in comps[:n]:
        xs = [x for x, _ in pts]
        ys = [y for _, y in pts]
        bx0, by0, bx1, by1 = max(0, min(xs) - 1), max(0, min(ys) - 1), min(w - 1, max(xs) + 1), min(h - 1, max(ys) + 1)
        part = img.crop((bx0, by0, bx1 + 1, by1 + 1))
        pp = part.load()
        for y in range(part.height):
            for x in range(part.width):
                lab = label[(by0 + y) * w + bx0 + x]
                if lab and lab != lid:
                    pp[x, y] = (0, 0, 0, 0)
        parts.append(part)
    return parts


def edge_fade(img, n):
    """Мягкое затухание свечения к краям рамки: на плотном листе соседние эффекты почти касаются,
    и без него край ореола обрывался прямой линией."""
    w, h = img.size
    px = img.load()
    for y in range(h):
        for x in range(w):
            d = min(x, y, w - 1 - x, h - 1 - y)
            if d < n:
                r, g, b, a = px[x, y]
                if a:
                    px[x, y] = (r, g, b, int(a * (d + 1) / (n + 1)))
    return img


def despeckle(img, min_area=30):
    """Убирает мелкие оторванные пятна (звёзды фона), чтобы они не раздували рамку кадра."""
    w, h = img.size
    ap = img.getchannel('A').load()
    seen = bytearray(w * h)
    px = img.load()
    for sy in range(h):
        for sx in range(w):
            i = sy * w + sx
            if seen[i] or ap[sx, sy] <= 24:
                continue
            comp = [(sx, sy)]
            seen[i] = 1
            k = 0
            while k < len(comp):
                x, y = comp[k]
                k += 1
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1), (x + 1, y + 1), (x - 1, y - 1), (x + 1, y - 1), (x - 1, y + 1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        j = ny * w + nx
                        if not seen[j] and ap[nx, ny] > 24:
                            seen[j] = 1
                            comp.append((nx, ny))
            if len(comp) < min_area:
                for x, y in comp:
                    px[x, y] = (0, 0, 0, 0)
    return img


def trim(img):
    bb = img.getchannel('A').point(lambda a: 255 if a > 6 else 0).getbbox()
    return (img.crop(bb), bb) if bb else (img, (0, 0, img.width, img.height))


def centroid(img):
    ap = img.getchannel('A').load()
    sx = sy = s = 0
    for y in range(img.height):
        for x in range(img.width):
            v = ap[x, y]
            if v > 40:
                sx += x * v
                sy += y * v
                s += v
    return (sx / s, sy / s) if s else (img.width / 2, img.height / 2)


def shrink(img, limit):
    """Уменьшает спрайт до предела большей стороны (через premultiplied alpha — без тёмной каймы)."""
    k = limit / max(img.width, img.height)
    if k >= 1:
        return img
    size = (max(1, round(img.width * k)), max(1, round(img.height * k)))
    return img.convert('RGBa').resize(size, Image.LANCZOS).convert('RGBA')


def main():
    global SPX
    images, offsets, opts, sizes0 = {}, {}, {}, {}
    for name, spec in SPRITES.items():
        box, mode = spec[0], spec[1]
        SPX = SHEETS[spec[2] if len(spec) > 2 else 0]
        opt = spec[3] if len(spec) > 3 else {}
        if mode == 'solid':
            img = despeckle(extract_solid(*box, close_r=CLOSE.get(name, 0), holes=not name.startswith('pu_')))
        elif mode == 'glow':
            img = despeckle(extract_glow(*box), 12)
        else:
            img = extract_add(*box)
            # каталог эффектов (лист 10) свёрстан плотно — края ореолов гасим, кроме экранных рамок
            if len(spec) > 2 and spec[2] == 10 and not name.startswith('fx_scr_'):
                img = edge_fade(img, 8)
        img, bb = trim(img)
        if opt.get('deg'):
            img, _ = trim(img.rotate(opt['deg'], resample=Image.BICUBIC, expand=True))
        if opt.get('split'):
            for i, part in enumerate(split_parts(img, opt['split'])):
                images[name + str(i + 1)] = (part, mode)
            continue
        offsets[name] = (box[0] + bb[0], box[1] + bb[1])
        sizes0[name] = (img.width, img.height)
        if opt.get('rot') == 180:
            img = img.rotate(180)
        if opt.get('max'):
            img = shrink(img, opt['max'])
        images[name] = (img, mode)
        opts[name] = opt

    # кадры взрыва выравниваем по центру яркости в общей клетке
    cell_size = 136
    for i in range(1, 6):
        n = 'ex%d' % i
        img, mode = images[n]
        cx, cy = centroid(img)
        cell = Image.new('RGBA', (cell_size, cell_size), (0, 0, 0, 0))
        cell.paste(img, (int(round(cell_size / 2 - cx)), int(round(cell_size / 2 - cy))), img)
        images[n] = (cell, mode)

    # упаковка полками
    def pack(names):
        order = sorted(names, key=lambda n: -images[n][0].height)
        aw, pad = 2048, 2
        x = y = pad
        shelf_h = 0
        rects = {}
        for n in order:
            img = images[n][0]
            if x + img.width + pad > aw:
                x = pad
                y += shelf_h + pad
                shelf_h = 0
            rects[n] = (x, y, img.width, img.height)
            x += img.width + pad
            shelf_h = max(shelf_h, img.height)
        sheet = Image.new('RGBA', (aw, y + shelf_h + pad), (0, 0, 0, 0))
        for n, (rx, ry, rw, rh) in rects.items():
            sheet.paste(images[n][0], (rx, ry))
        return sheet, rects

    atlas, rects = pack([n for n in images if n not in LATE])
    atlas2, rects2 = pack([n for n in images if n in LATE])
    atlas_w, atlas_h = atlas.size
    os.makedirs(os.path.dirname(OUT_PNG), exist_ok=True)
    # WebP: в ~5 раз меньше PNG, прозрачность без потерь; PNG остаётся запасным вариантом.
    # Качество 80 на глаз не отличается от 90 даже при увеличении, а файлы на четверть меньше —
    # атлас качается почти всё время загрузки
    for sheet, base in ((atlas, OUT_PNG[:-4]), (atlas2, OUT_PNG[:-4] + '2')):
        sheet.save(base + '.png', optimize=True)
        sheet.save(base + '.webp', 'WEBP', quality=80, alpha_quality=100, method=6)

    # кадр: [x, y, w, h, аддитивный, 1 — лежит в позднем атласе]
    frames = {n: [r[0], r[1], r[2], r[3], 1 if images[n][1] == 'add' else 0] for n, r in rects.items()}
    frames.update({n: [r[0], r[1], r[2], r[3], 1 if images[n][1] == 'add' else 0, 1] for n, r in rects2.items()})
    nozzles = {}
    for n, lst in NOZZLES.items():
        ox, oy = offsets[n]
        w, h = sizes0[n]
        rot = opts.get(n, {}).get('rot') == 180
        out = []
        for px, py, sz in lst:
            u, v = (px - ox) / w, (py - oy) / h
            if rot:
                u, v = 1 - u, 1 - v
            out.append([round(u, 3), round(v, 3), sz])
        nozzles[n] = out
    with open(OUT_JS, 'w', encoding='utf-8') as f:
        f.write('// Автогенерация: python tools/extract_sprites.py — не редактировать вручную.\n')
        f.write('// frames: имя -> [x, y, w, h, additive, 1 = поздний атлас sprites2]; nozzles: сопла (доли ширины/высоты спрайта)\n')
        f.write('window.SS_ATLAS = ' + json.dumps(
            {'size': [atlas_w, atlas_h], 'size2': list(atlas2.size), 'frames': frames, 'nozzles': nozzles},
            separators=(',', ':'), ensure_ascii=False) + ';\n')
    for base, sheet in ((OUT_PNG[:-4], atlas), (OUT_PNG[:-4] + '2', atlas2)):
        print('%s %dx%d, png %d bytes, webp %d bytes' % (os.path.basename(base), sheet.width, sheet.height, os.path.getsize(base + '.png'), os.path.getsize(base + '.webp')))

    if PREV:
        for fname, kind in (('prev_checker.png', 'checker'), ('prev_bright.png', 'bright')):
            bgimg = Image.new('RGB', atlas.size)
            bp = bgimg.load()
            for yy in range(atlas.height):
                for xx in range(atlas.width):
                    if kind == 'checker':
                        v = 90 if ((xx // 8 + yy // 8) % 2) else 160
                        bp[xx, yy] = (v, v, v)
                    else:
                        bp[xx, yy] = (40 + xx * 150 // atlas.width, 20 + yy * 100 // atlas.height, 120)
            bgimg = bgimg.convert('RGBA')
            bgimg.alpha_composite(atlas)
            bgimg.convert('RGB').save(os.path.join(PREV, fname))


if __name__ == '__main__':
    main()
