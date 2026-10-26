// ════════════════════════════════════════════════════════════════
// SPACE SHOOTER 2.0 — игровой контент
// Здесь всё, что можно настраивать без изменения логики:
// сложности, оружие, враги, боссы, бонусы, улучшения, навыки,
// корабли, раскраски, достижения, ежедневные задания, секторы.
// ════════════════════════════════════════════════════════════════
'use strict';

(function () {
  const D = {};

  // ── Сложности ────────────────────────────────────────────────
  // hp/spd/fire/bspd — множители прочности, скорости врагов, частоты и скорости их стрельбы
  D.DIFFS = {
    zen:       { name: 'ЗЕН',       color: '#3dffd0', lives: 6, hp: 0.55, spd: 0.78, fire: 0.45, bspd: 0.75, score: 0.5, coins: 0.6, elite: 0,    desc: 'Спокойный полёт и мало пуль' },
    easy:      { name: 'ЛЕГКО',     color: '#3dffa2', lives: 5, hp: 0.75, spd: 0.88, fire: 0.7,  bspd: 0.85, score: 0.8, coins: 0.85, elite: 0,   desc: 'Для разминки' },
    normal:    { name: 'НОРМА',     color: '#3de0ff', lives: 4, hp: 1,    spd: 1,    fire: 1,    bspd: 1,    score: 1,   coins: 1,   elite: 0.03, desc: 'Задуманный баланс' },
    hard:      { name: 'СЛОЖНО',    color: '#ffc83d', lives: 3, hp: 1.35, spd: 1.1,  fire: 1.35, bspd: 1.12, score: 1.6, coins: 1.3, elite: 0.08, desc: 'Элитные враги и больше пуль' },
    nightmare: { name: 'КОШМАР',    color: '#ff8a3d', lives: 2, hp: 1.8,  spd: 1.2,  fire: 1.7,  bspd: 1.25, score: 2.4, coins: 1.7, elite: 0.15, desc: 'Для ветеранов' },
    god:       { name: 'БОГ ВОЙНЫ', short: 'БОГ', color: '#ff3d5a', lives: 1, hp: 2.4, spd: 1.32, fire: 2.1, bspd: 1.38, score: 3.5, coins: 2.2, elite: 0.25, desc: 'Одна жизнь. Пощады не будет' },
  };
  D.DIFF_ORDER = ['zen', 'easy', 'normal', 'hard', 'nightmare', 'god'];

  // ── Оружие ───────────────────────────────────────────────────
  // base: базовые параметры; ups: ветки прокачки за монеты (уровень → эффект в game.js)
  const C = (a) => a; // для читаемости массивов цен
  D.WEAPONS = {
    laser: {
      name: 'ЛАЗЕР', color: '#3de0ff', price: 0,
      desc: 'Скорострельные импульсы. Надёжен против всего.',
      base: { dmg: 10, cd: 0.14, speed: 1050, pierce: 0 },
      ups: [
        { id: 'dmg', name: 'Мощность', max: 8, step: 0.12, unit: '% урона', costs: C([60, 100, 160, 250, 380, 560, 800, 1150]) },
        { id: 'rate', name: 'Темп стрельбы', max: 6, step: 0.08, unit: '% темпа', costs: C([80, 140, 230, 360, 540, 800]) },
        { id: 'pierce', name: 'Пробитие', max: 3, step: 1, unit: ' врага насквозь', abs: true, costs: C([400, 900, 1800]) },
      ],
    },
    shotgun: {
      name: 'ДРОБОВИК', color: '#ffc83d', price: 600,
      desc: 'Веер дроби в упор. Идеален против роя.',
      base: { dmg: 8, cd: 0.5, speed: 820, pellets: 5, life: 0.5 },
      ups: [
        { id: 'dmg', name: 'Мощность', max: 8, step: 0.12, unit: '% урона', costs: C([70, 120, 190, 290, 430, 630, 900, 1300]) },
        { id: 'pellets', name: 'Дробинки', max: 4, step: 1, unit: ' дробинки', abs: true, costs: C([250, 550, 1000, 1700]) },
        { id: 'rate', name: 'Перезарядка', max: 6, step: 0.08, unit: '% темпа', costs: C([90, 160, 260, 400, 600, 880]) },
      ],
    },
    rocket: {
      name: 'РАКЕТЫ', color: '#ff8a3d', price: 900,
      desc: 'Самонаводящиеся ракеты со взрывом. Не промахиваются.',
      base: { dmg: 22, aoe: 16, radius: 52, cd: 0.46, speed: 520, salvo: 1 },
      ups: [
        { id: 'dmg', name: 'Боеголовка', max: 8, step: 0.12, unit: '% урона', costs: C([80, 130, 210, 320, 480, 700, 1000, 1450]) },
        { id: 'aoe', name: 'Радиус взрыва', max: 5, step: 0.15, unit: '% радиуса', costs: C([150, 260, 420, 640, 950]) },
        { id: 'salvo', name: 'Залп', max: 2, step: 1, unit: ' ракета в залпе', abs: true, costs: C([900, 2200]) },
      ],
    },
    arc: {
      name: 'ДУГА', color: '#7ff6ff', price: 1200,
      desc: 'Электрическая дуга бьёт всех врагов впереди корабля.',
      base: { dmg: 24, cd: 0.42, range: 190, angle: 0.9 },
      ups: [
        { id: 'dmg', name: 'Напряжение', max: 8, step: 0.12, unit: '% урона', costs: C([90, 150, 240, 360, 540, 780, 1100, 1600]) },
        { id: 'range', name: 'Дальность', max: 5, step: 0.12, unit: '% дальности', costs: C([160, 280, 450, 680, 1000]) },
        { id: 'rate', name: 'Частота', max: 6, step: 0.08, unit: '% темпа', costs: C([110, 190, 300, 460, 680, 980]) },
      ],
    },
    plasma: {
      name: 'ПЛАЗМА', color: '#ff5cf0', price: 1500,
      desc: 'Медленный шар с огромным взрывом. Лучший урон по площади.',
      base: { dmg: 38, aoe: 30, radius: 72, cd: 0.72, speed: 380 },
      ups: [
        { id: 'dmg', name: 'Заряд', max: 8, step: 0.12, unit: '% урона', costs: C([100, 160, 260, 390, 580, 840, 1200, 1700]) },
        { id: 'aoe', name: 'Радиус взрыва', max: 5, step: 0.15, unit: '% радиуса', costs: C([170, 290, 460, 700, 1050]) },
        { id: 'rate', name: 'Синтез', max: 6, step: 0.08, unit: '% темпа', costs: C([130, 220, 350, 530, 780, 1120]) },
      ],
    },
    lightning: {
      name: 'МОЛНИЯ', color: '#fff36b', price: 2500,
      desc: 'Цепная молния сама находит цели и прыгает между врагами.',
      base: { dmg: 15, cd: 0.32, chain: 3, range: 150, falloff: 0.85 },
      ups: [
        { id: 'dmg', name: 'Разряд', max: 8, step: 0.12, unit: '% урона', costs: C([110, 180, 290, 440, 650, 940, 1350, 1900]) },
        { id: 'chain', name: 'Прыжки', max: 4, step: 1, unit: ' прыжок', abs: true, costs: C([300, 650, 1200, 2000]) },
        { id: 'range', name: 'Радиус цепи', max: 4, step: 0.15, unit: '% радиуса', costs: C([200, 350, 560, 860]) },
      ],
    },
    darkmatter: {
      name: 'Т. МАТЕРИЯ', color: '#b06bff', price: 3500,
      desc: 'Сфера притягивает врагов, жжёт их и схлопывается взрывом.',
      base: { dmg: 10, tick: 0.15, burst: 60, radius: 62, cd: 0.95, speed: 360, life: 1.3, pull: 160 },
      ups: [
        { id: 'dmg', name: 'Масса', max: 8, step: 0.12, unit: '% урона', costs: C([130, 210, 330, 500, 740, 1060, 1500, 2100]) },
        { id: 'aoe', name: 'Горизонт', max: 5, step: 0.15, unit: '% радиуса', costs: C([190, 320, 510, 780, 1150]) },
        { id: 'pull', name: 'Гравитация', max: 4, step: 0.2, unit: '% притяжения', costs: C([200, 340, 550, 880]) },
      ],
    },
  };
  D.WEAPON_ORDER = ['laser', 'shotgun', 'rocket', 'arc', 'plasma', 'lightning', 'darkmatter'];

  // ── Общие улучшения корабля (вкладка «Корабль» в арсенале) ──
  D.GENERAL = [
    { id: 'power',   name: 'Мощь орудий',      ico: '💥', max: 10, step: 0.07, unit: '% урона',       costs: [100, 160, 240, 350, 500, 700, 950, 1300, 1750, 2300] },
    { id: 'rate',    name: 'Охлаждение',       ico: '⚡', max: 8,  step: 0.05, unit: '% темпа',       costs: [120, 200, 300, 450, 650, 900, 1250, 1700] },
    { id: 'crit',    name: 'Прицел',           ico: '🎯', max: 6,  step: 0.04, unit: '% шанс крита',  costs: [150, 250, 400, 600, 900, 1300] },
    { id: 'hull',    name: 'Броня корпуса',    ico: '❤️', max: 3,  step: 1,    unit: ' жизнь',        abs: true, costs: [900, 2200, 4500] },
    { id: 'shield',  name: 'Генератор щита',   ico: '🛡️', max: 3,  step: 1,    unit: '',              abs: true, costs: [600, 1400, 2800],
      levelText: ['Щит на старте', 'Щит восстанавливается каждые 40 с', 'Восстановление каждые 25 с'] },
    { id: 'magnet',  name: 'Магнит',           ico: '🧲', max: 6,  step: 0.2,  unit: '% радиус сбора', costs: [100, 170, 260, 380, 550, 800] },
    { id: 'greed',   name: 'Сборщик',          ico: '💰', max: 8,  step: 0.06, unit: '% монет',        costs: [150, 240, 360, 520, 750, 1050, 1450, 2000] },
    { id: 'bombs',   name: 'Бомбовый отсек',   ico: '💣', max: 3,  step: 1,    unit: ' бомба на старте', abs: true, costs: [300, 800, 1800] },
    { id: 'bombdmg', name: 'Мощность бомбы',   ico: '☢️', max: 5,  step: 0.25, unit: '% урона бомбы',  costs: [200, 350, 550, 800, 1150] },
    { id: 'luck',    name: 'Удача',            ico: '🍀', max: 5,  step: 0.12, unit: '% шанс бонусов', costs: [200, 340, 520, 760, 1100] },
  ];

  // ── Враги ────────────────────────────────────────────────────
  // w — ширина в CSS-пикселях; hp — прочность на волне 1; ai — поведение (game.js)
  // fire — схема стрельбы; wave — с какой волны появляется; weight — частота
  D.ENEMIES = {
    scout:       { name: 'Разведчик',      sprite: 'scout',       w: 46, hp: 22,  spd: 125, score: 100, coins: 1, xp: 1, ai: 'dive',      wave: 1,  weight: 30,
      fire: { kind: 'aimed', cd: 2.8, bullet: 'orb', spd: 190, from: 3 } },
    drone:       { name: 'Дрон',           sprite: 'drone', alt: 'e_drone2', w: 34, hp: 12, spd: 150, score: 60, coins: 1, xp: 1, ai: 'formation', wave: 2, weight: 16 },
    shooter:     { name: 'Стрелок',        sprite: 'shooter',     w: 50, hp: 42,  spd: 95,  score: 220, coins: 2, xp: 2, ai: 'hover',     wave: 2,  weight: 15,
      fire: { kind: 'aimed3', cd: 2.3, bullet: 'bolt', spd: 220 } },
    assault:     { name: 'Штурмовик',      sprite: 'assault', alt: 'e_assault2', w: 48, hp: 46, spd: 95, score: 240, coins: 2, xp: 2, ai: 'zigzag', wave: 4, weight: 14,
      fire: { kind: 'burst', cd: 2.4, count: 3, bullet: 'bolt', spd: 260 } },
    kamikaze:    { name: 'Камикадзе',      sprite: 'kamikaze', alt: 'e_kamikaze2', w: 32, hp: 18, spd: 110, score: 160, coins: 1, xp: 1, ai: 'kamikaze', wave: 5, weight: 11 },
    interceptor: { name: 'Перехватчик',    sprite: 'interceptor', alt: 'e_interceptor2', w: 52, hp: 55, spd: 110, score: 280, coins: 2, xp: 2, ai: 'dasher', wave: 6, weight: 10,
      fire: { kind: 'aimed', cd: 1.9, bullet: 'orb', spd: 230 } },
    heavy:       { name: 'Тяжёлый',        sprite: 'heavy',       w: 62, hp: 150, spd: 48,  score: 520, coins: 5, xp: 4, ai: 'tank',      wave: 7,  weight: 8,
      fire: { kind: 'fan', cd: 2.7, count: 5, spread: 0.9, bullet: 'orb', spd: 170 } },
    splitter:    { name: 'Делитель',       sprite: 'scout', tint: 120, w: 50, hp: 40, spd: 95, score: 260, coins: 2, xp: 2, ai: 'dive', wave: 8, weight: 6, split: true },
    bomber:      { name: 'Бомбардировщик', sprite: 'bomber',      w: 74, hp: 120, spd: 70,  score: 480, coins: 4, xp: 3, ai: 'bomber',    wave: 8,  weight: 7,
      fire: { kind: 'mine', cd: 1.5 } },
    sniper:      { name: 'Снайпер',        sprite: 'sniper', alt: 'e_sniper2', w: 46, hp: 60, spd: 75, score: 380, coins: 3, xp: 3, ai: 'sniper', wave: 9, weight: 7,
      fire: { kind: 'snipe', cd: 3.4, bullet: 'long', spd: 520 } },
    shielder:    { name: 'Щитоносец',      sprite: 'shielder',    w: 58, hp: 90, shield: 80, spd: 55, score: 480, coins: 4, xp: 3, ai: 'hover', wave: 10, weight: 6,
      fire: { kind: 'ring', cd: 3.6, count: 8, bullet: 'orb', spd: 140 } },
    techno:      { name: 'Технодрон',      sprite: 'techno',      w: 58, hp: 75,  spd: 60,  score: 420, coins: 3, xp: 3, ai: 'teleport',  wave: 11, weight: 6,
      fire: { kind: 'ring', cd: 0, count: 10, bullet: 'dot', spd: 160 } },
    hunter:      { name: 'Охотник',        sprite: 'hunter',      w: 54, hp: 80,  spd: 85,  score: 420, coins: 3, xp: 3, ai: 'hunter',    wave: 12, weight: 6 },
    armored:     { name: 'Броненосец',     sprite: 'armored',     w: 64, hp: 280, spd: 36,  score: 750, coins: 7, xp: 5, ai: 'tank',      wave: 13, weight: 5,
      fire: { kind: 'twin', cd: 1.7, bullet: 'bolt', spd: 250 } },
    heavyfighter:{ name: 'Тяжёлый истребитель', sprite: 'e_heavyfighter', w: 62, hp: 120, spd: 62, score: 560, coins: 5, xp: 4, ai: 'tank', wave: 11, weight: 7,
      fire: { kind: 'aimed3', cd: 2.0, bullet: 'bolt', spd: 240 } },
    bombardier:  { name: 'Бомбардир',      sprite: 'e_bombardier', w: 62, hp: 170, spd: 45, score: 640, coins: 6, xp: 4, ai: 'tank', wave: 12, weight: 5,
      fire: { kind: 'mine', cd: 2.4 }, fire2: { kind: 'fan', cd: 3.2, count: 6, spread: 1.1, bullet: 'orb', spd: 160 } },
    redoubt:     { name: 'Редут',          sprite: 'e_redoubt', w: 66, hp: 160, spd: 50, score: 700, coins: 6, xp: 5, ai: 'redoubt', wave: 14, weight: 5,
      fire: { kind: 'ring', cd: 0, count: 12, bullet: 'violet', spd: 140 } },
    cruiser:     { name: 'Крейсер',        sprite: 'e_cruiser', w: 78, hp: 380, spd: 32, score: 1100, coins: 10, xp: 7, ai: 'tank', wave: 16, weight: 3,
      fire: { kind: 'twin', cd: 1.5, bullet: 'bolt', spd: 250 }, fire2: { kind: 'ring', cd: 3.6, count: 10, bullet: 'orb', spd: 140 } },
    // мини-боссы — появляются по очереди на волнах 8, 13, 18, 23…
    gunship:     { name: 'Ганшип',         sprite: 'gunship',     w: 104, hp: 850, spd: 45, score: 3000, coins: 30, xp: 14, ai: 'gunship', wave: 8, weight: 0, mini: true },
    destroyer:   { name: 'Эсминец',        sprite: 'e_destroyer', w: 88, hp: 1200, spd: 40, score: 4000, coins: 40, xp: 18, ai: 'destroyer', wave: 13, weight: 0, mini: true },
    cruiser_h:   { name: 'Рейдер',         sprite: 'e_cruiser_h', w: 210, hp: 1000, spd: 75, score: 3600, coins: 36, xp: 16, ai: 'flyby', wave: 18, weight: 0, mini: true, horizontal: true },
  };

  // ── Боссы ────────────────────────────────────────────────────
  // hue — перекраска спрайта (null = оригинальные цвета)
  // sprite — кадр атласа; rot — поворот (PI = носом вниз); wf/wmax — ширина: доля поля и предел в px
  D.BOSSES = [
    { id: 'guardian',    name: 'СТРАЖ',               sprite: 'boss',           hue: null, color: '#ff3d5a', wf: 0.46, wmax: 176, hp: 1.0,  title: 'Хранитель первого рубежа' },
    { id: 'sniper',      name: 'СНАЙПЕР',             sprite: 'b_battleship2',  rot: Math.PI, color: '#ff9f3d', wf: 0.36, wmax: 146, hp: 1.0, title: 'Видит каждый ваш манёвр' },
    { id: 'spider',      name: 'ПАУК-РЕАКТОР',        sprite: 'b_spider',       rot: Math.PI, color: '#c06bff', wf: 0.74, wmax: 300, hp: 1.1, title: 'Реактор в сердце стальной паутины' },
    { id: 'dreadnought', name: 'ДРЕДНОУТ',            sprite: 'b_battleship',   rot: Math.PI, color: '#3db8ff', wf: 0.4,  wmax: 156, hp: 1.15, title: 'Энергощит — ракеты и рельса бьют сильнее', shield: 0.6 },
    { id: 'phoenix',     name: 'ФЕНИКС',              sprite: 'boss',           hue: 18,   color: '#ff6a2a', wf: 0.46, wmax: 176, hp: 1.1,  title: 'Возрождается из пепла' },
    { id: 'mothership',  name: 'МАТЕРИНСКИЙ КОРАБЛЬ', sprite: 'b_mothership',   color: '#3dff7a', wf: 0.94, wmax: 520, hp: 1.2,  title: 'Её дети повсюду' },
    { id: 'necro',       name: 'НЕКРОМАНТ',           sprite: 'boss',           hue: 268,  color: '#9d4dff', wf: 0.48, wmax: 184, hp: 1.25, title: 'Повелитель павших' },
    { id: 'cruiser',     name: 'ТЯЖЁЛЫЙ КРЕЙСЕР',     sprite: 'b_heavycruiser', color: '#ff9f3d', wf: 0.72, wmax: 340, hp: 1.3,  title: 'Бортовые залпы и рой ракет' },
  ];

  // ── Бонусы (выпадают из врагов) ─────────────────────────────
  D.POWERUPS = {
    heal:   { name: '+1 ЖИЗНЬ',          sprite: 'pu_heal',   color: '#ff4d6d', weight: 9 },
    shield: { name: 'ЩИТ',               sprite: 'pu_shield', color: '#3de0ff', weight: 13 },
    power:  { name: 'УСИЛЕНИЕ ×1.6',     sprite: 'pu_power',  color: '#ffc83d', weight: 12, dur: 10 },
    spread: { name: 'ШИРОКИЙ ВЫСТРЕЛ',   sprite: 'pu_spread', color: '#4c9dff', weight: 12, dur: 12 },
    multi:  { name: 'МУЛЬТИВЫСТРЕЛ',     sprite: 'pu_multi',  color: '#3dffa2', weight: 11, dur: 12 },
    rapid:  { name: 'СКОРОСТРЕЛЬНОСТЬ',  sprite: 'pu_speed',  color: '#b06bff', weight: 11, dur: 10 },
    star:   { name: 'ЗВЕЗДА',            sprite: 'pu_star',   color: '#ffc83d', weight: 8 },
    bomb:   { name: '+1 БОМБА',          sprite: null, ico: 'bomb',   color: '#ff8a3d', weight: 8 },
    magnet: { name: 'МАГНИТ',            sprite: null, ico: 'magnet', color: '#ff5cb3', weight: 7, dur: 10 },
    freeze: { name: 'ЗАМОРОЗКА',         sprite: null, ico: 'snow',   color: '#9be8ff', weight: 5, dur: 5 },
  };

  // ── Улучшения в забеге (выбор 1 из 3 при новом уровне) ─────
  D.RARITY = {
    common: { name: 'ОБЫЧНОЕ', color: '#9fb4ff', w: 10 },
    rare:   { name: 'РЕДКОЕ',  color: '#3dd2ff', w: 5.5 },
    epic:   { name: 'ЭПИЧЕСКОЕ', color: '#c48bff', w: 2.4 },
  };
  D.PERKS = [
    { id: 'dmg',       ico: '🔥', name: 'МОЩЬ',            rar: 'common', max: 6,  desc: '+15% урона всем оружием' },
    { id: 'rate',      ico: '⚡', name: 'СКОРОСТРЕЛЬНОСТЬ', rar: 'common', max: 5,  desc: '+12% темп стрельбы' },
    { id: 'multi',     ico: '🔱', name: 'МУЛЬТИВЫСТРЕЛ',   rar: 'rare',   max: 3,  desc: '+1 снаряд в каждом залпе' },
    { id: 'crit',      ico: '🎯', name: 'КРИТ',            rar: 'common', max: 4,  desc: '+8% шанс критического удара (×2 урон)' },
    { id: 'pierce',    ico: '🔩', name: 'БРОНЕБОЙ',        rar: 'rare',   max: 3,  desc: 'Снаряды пробивают ещё одного врага' },
    { id: 'magnet',    ico: '🧲', name: 'ГРАВИЗАХВАТ',     rar: 'common', max: 3,  desc: '+50% радиус сбора монет и кристаллов' },
    { id: 'heal',      ico: '💚', name: 'РЕМОНТ',          rar: 'common', max: 99, desc: 'Восстановить 1 жизнь сейчас' },
    { id: 'maxhp',     ico: '❤️', name: 'БРОНЯ',           rar: 'epic',   max: 2,  desc: '+1 к максимуму жизней и +1 жизнь' },
    { id: 'shieldgen', ico: '🛡️', name: 'ЩИТ-ГЕНЕРАТОР',   rar: 'rare',   max: 3,  desc: 'Щит восстанавливается сам (30 → 22 → 15 с)' },
    { id: 'drone',     ico: '🛰️', name: 'ДРОН-НАПАРНИК',   rar: 'epic',   max: 2,  desc: 'Дрон летит рядом и стреляет по врагам' },
    { id: 'nova',      ico: '💥', name: 'ДЕТОНАЦИЯ',       rar: 'rare',   max: 3,  desc: 'Враги взрываются при гибели и ранят соседей' },
    { id: 'cryo',      ico: '❄️', name: 'КРИО-СНАРЯДЫ',    rar: 'rare',   max: 2,  desc: 'Шанс 12% заморозить врага на 2 с' },
    { id: 'greed',     ico: '💰', name: 'ЖАДНОСТЬ',        rar: 'common', max: 3,  desc: '+30% монет до конца забега' },
    { id: 'bomb',      ico: '💣', name: 'БОЕЗАПАС',        rar: 'common', max: 99, desc: '+1 бомба' },
    { id: 'cooldown',  ico: '⏱️', name: 'ПЕРЕЗАРЯДКА',     rar: 'rare',   max: 3,  desc: '−15% перезарядка навыков и бомб' },
    { id: 'speed',     ico: '🚀', name: 'ФОРСАЖ',          rar: 'common', max: 2,  desc: '+15% скорость корабля и +5% уклонение' },
    { id: 'vamp',      ico: '🧛', name: 'ВАМПИРИЗМ',       rar: 'epic',   max: 1,  desc: 'Каждые 40 уничтоженных врагов — +1 жизнь' },
    { id: 'luck',      ico: '🍀', name: 'УДАЧА',           rar: 'common', max: 2,  desc: '+40% шанс выпадения бонусов' },
  ];

  // ── Навыки (дерево за очки навыков) ─────────────────────────
  D.SKILL_BRANCHES = [
    { id: 'combat',   name: 'БОЕЦ',      color: '#ff4d6d' },
    { id: 'survival', name: 'ВЫЖИВАНИЕ', color: '#3dffa2' },
    { id: 'tech',     name: 'ТЕХНИК',    color: '#b06bff' },
    { id: 'special',  name: 'ОСОБЫЕ',    color: '#ffc83d' },
  ];
  D.SKILLS = {
    sk_vamp:        { type: 'passive', branch: 'combat',   tier: 1, ico: '🧛', name: 'ВАМПИР',       cost: 2, desc: 'Каждые 25 уничтоженных врагов — +1 жизнь' },
    sk_berserker:   { type: 'passive', branch: 'combat',   tier: 2, ico: '😤', name: 'БЕРСЕРК',      cost: 3, req: 'sk_vamp',      desc: 'Урон растёт с потерей жизней: до +60% на последней' },
    sk_executioner: { type: 'passive', branch: 'combat',   tier: 3, ico: '⚔️', name: 'ПАЛАЧ',        cost: 3, req: 'sk_berserker', desc: 'Двойной урон по врагам с прочностью ниже 25%' },
    sk_regen:       { type: 'passive', branch: 'survival', tier: 1, ico: '💚', name: 'РЕГЕНЕРАЦИЯ',  cost: 2, desc: '+1 жизнь каждые 45 с (на последней жизни — каждые 20 с)' },
    sk_ghost:       { type: 'passive', branch: 'survival', tier: 2, ico: '👻', name: 'ПРИЗРАК',      cost: 3, req: 'sk_regen',     desc: '20% шанс уклониться от попадания' },
    sk_phoenix:     { type: 'passive', branch: 'survival', tier: 3, ico: '🔥', name: 'ФЕНИКС',       cost: 4, req: 'sk_ghost',     desc: 'Один раз за игру воскрешает с 2 жизнями' },
    sk_detonator:   { type: 'passive', branch: 'tech',     tier: 1, ico: '💥', name: 'ДЕТОНАТОР',    cost: 2, desc: 'Каждое 5-е уничтожение вызывает взрыв' },
    sk_ricochet:    { type: 'passive', branch: 'tech',     tier: 2, ico: '🎱', name: 'РИКОШЕТ',      cost: 3, req: 'sk_detonator', desc: 'Снаряды один раз отскакивают от краёв экрана' },
    sk_conductor:   { type: 'passive', branch: 'tech',     tier: 3, ico: '🌩️', name: 'ПРОВОДНИК',    cost: 3, req: 'sk_ricochet',  desc: 'Молния +2 прыжка; любое попадание с шансом 8% бьёт разрядом' },
    sk_magnet:      { type: 'passive', branch: 'special',  tier: 1, ico: '🧲', name: 'СУПЕРМАГНИТ',  cost: 2, desc: 'Монеты и кристаллы летят к вам со всего экрана' },
    sk_doublecoins: { type: 'passive', branch: 'special',  tier: 1, ico: '💎', name: 'АЛЧНОСТЬ',     cost: 2, desc: 'Монеты ×2, но скорость корабля −15%' },
    sk_sniper:      { type: 'passive', branch: 'special',  tier: 2, ico: '🎯', name: 'СНАЙПЕР',      cost: 3, req: 'sk_ghost',     desc: '+50% урона, −20% темп стрельбы' },
    sk_overload:    { type: 'passive', branch: 'special',  tier: 2, ico: '💡', name: 'ПЕРЕГРУЗКА',   cost: 3, req: 'sk_detonator', desc: 'После активного навыка — темп стрельбы ×2 на 4 с' },

    sk_nova:      { type: 'active', tier: 1, ico: '🌟', name: 'НОВА',        cost: 3, cd: 20, desc: 'Ударная волна уничтожает обычных врагов и пули, боссам −10% прочности' },
    sk_barrier:   { type: 'active', tier: 1, ico: '🔵', name: 'БАРЬЕР',      cost: 3, cd: 24, dur: 5, desc: 'Полная неуязвимость на 5 секунд' },
    sk_overclock: { type: 'active', tier: 1, ico: '⚡', name: 'РАЗГОН',      cost: 3, cd: 22, dur: 6, desc: 'Темп стрельбы ×2.5 на 6 секунд' },
    sk_airstrike: { type: 'active', tier: 2, ico: '✈️', name: 'АВИАУДАР',    cost: 3, cd: 26, req: 'sk_nova', desc: '8 ракет накрывают самых опасных врагов' },
    sk_timewarp:  { type: 'active', tier: 2, ico: '⏳', name: 'ЗАМЕДЛЕНИЕ',  cost: 4, cd: 30, dur: 5, req: 'sk_barrier', desc: 'Враги и их снаряды замедляются втрое на 5 секунд' },
    sk_rail:      { type: 'active', tier: 2, ico: '🔮', name: 'РЕЛЬСА',      cost: 3, cd: 32, dur: 2.5, req: 'sk_overclock', desc: 'Сквозной луч: огромный урон, мгновенно ломает щиты' },
    sk_blackhole: { type: 'active', tier: 3, ico: '🌀', name: 'ЧЁРНАЯ ДЫРА', cost: 5, cd: 40, dur: 3, req: 'sk_timewarp', desc: 'Затягивает врагов и пули, затем взрывается' },
  };
  D.MAX_PASSIVE = 3;
  D.MAX_ACTIVE = 2;

  // ── Корабли ──────────────────────────────────────────────────
  D.SHIPS = {
    ship1: { name: 'СОКОЛ',  sprite: 'ship1', price: 0,    lvl: 1,  desc: 'Надёжный перехватчик',               stats: {},                             perks: ['Базовые характеристики'] },
    ship2: { name: 'ЯСТРЕБ', sprite: 'ship2', price: 2500, lvl: 5,  desc: 'Форсированные двигатели и орудия',   stats: { rate: 0.10, speed: 0.08 },    perks: ['+10% темп стрельбы', '+8% скорость'] },
    ship3: { name: 'ФЕНИКС', sprite: 'ship3', price: 7000, lvl: 12, desc: 'Флагман с усиленной бронёй',          stats: { dmg: 0.12, rate: 0.05, lives: 1 }, perks: ['+12% урон', '+5% темп', '+1 жизнь'] },
    ship4: { name: 'КОНДОР', sprite: 'ship4', price: 12000, lvl: 16, scale: 1.08, desc: 'Модернизированный перехватчик', stats: { dmg: 0.1, rate: 0.15, speed: 0.05 }, perks: ['+10% урон', '+15% темп', '+5% скорость'] },
    ship5: { name: 'ГРИФОН', sprite: 'ship5', price: 18000, lvl: 22, scale: 1.1, desc: 'Тяжёлый штурмовик с бронёй', stats: { dmg: 0.15, rate: 0.05, lives: 2, speed: -0.05 }, perks: ['+15% урон', '+5% темп', '+2 жизни', '-5% скорость'] },
    ship6: { name: 'АБСОЛЮТ', sprite: 'ship6', price: 30000, lvl: 28, scale: 1.22, desc: 'Абсолютный флагман галактики', stats: { dmg: 0.25, rate: 0.15, lives: 1, speed: 0.1 }, perks: ['+25% урон', '+15% темп', '+1 жизнь', '+10% скорость'] },
  };
  D.SHIP_ORDER = ['ship1', 'ship2', 'ship3', 'ship4', 'ship5', 'ship6'];

  // ── Раскраски (перекраска спрайта корабля по тону) ──────────
  // cond(s) — проверка по сохранению; раскраска открывается навсегда
  D.SKINS = [
    { id: 'default',    name: 'СТАНДАРТ',       rar: 'common',    hue: null, req: 'Доступна сразу',             cond: () => true },
    { id: 'fire',       name: 'ОГНЕННЫЙ',       rar: 'common',    hue: 12,   req: '50 уничтоженных врагов',      cond: (s) => s.stats.kills >= 50 },
    { id: 'ice',        name: 'ЛЕДЯНОЙ',        rar: 'common',    hue: 186,  req: 'Корабль 5 уровня',            cond: (s) => s.shipLvl >= 5 },
    { id: 'ghost',      name: 'ПРИЗРАК',        rar: 'uncommon',  hue: 225, sat: 0.12, bright: 0.18, req: 'Победить 3 боссов', cond: (s) => s.stats.bosses >= 3 },
    { id: 'alien',      name: 'ПРИШЕЛЕЦ',       rar: 'uncommon',  hue: 118,  req: 'Победить 5 боссов',           cond: (s) => s.stats.bosses >= 5 },
    { id: 'gold',       name: 'ЗОЛОТОЙ',        rar: 'uncommon',  hue: 44,   req: 'Заработать 5 000 монет',      cond: (s) => s.stats.coinsEarned >= 5000 },
    { id: 'dragon',     name: 'ДРАКОН',         rar: 'rare',      hue: 285,  req: 'Комбо ×40',                   cond: (s) => s.stats.maxCombo >= 40 },
    { id: 'neon',       name: 'НЕОН',           rar: 'rare',      hue: 318,  req: 'Рекорд 50 000 очков',         cond: (s) => s.stats.bestScore >= 50000 },
    { id: 'toxic',      name: 'ТОКСИН',         rar: 'rare',      hue: 88,   req: '1 000 уничтоженных врагов',   cond: (s) => s.stats.kills >= 1000 },
    { id: 'void',       name: 'ПУСТОТА',        rar: 'rare',      hue: 262, dark: 0.45, req: 'Волна 10 на «Кошмаре»', cond: (s) => (s.stats.diff.nightmare.wave || 0) >= 10 || (s.stats.diff.god.wave || 0) >= 10 },
    { id: 'storm',      name: 'ШТОРМ',          rar: 'epic',      hue: 200, bright: 0.22, req: 'Дойти до волны 30', cond: (s) => s.stats.bestWave >= 30 },
    { id: 'phoenix2',   name: 'ФЕНИКС',         rar: 'epic',      hue: 26,   req: 'Победить 25 боссов',          cond: (s) => s.stats.bosses >= 25 },
    { id: 'crystal',    name: 'КРИСТАЛЛ',       rar: 'epic',      hue: 176, sat: 0.55, bright: 0.25, req: 'Корабль 20 уровня', cond: (s) => s.shipLvl >= 20 },
    { id: 'rainbow',    name: 'РАДУГА',         rar: 'legendary', hue: 'rainbow', req: '25 достижений',     cond: (s) => Object.keys(s.achievements).length >= 25 },
    { id: 'darkmatter', name: 'ТЁМНАЯ МАТЕРИЯ', rar: 'legendary', hue: 272, dark: 0.62, req: 'Рекорд 250 000 очков', cond: (s) => s.stats.bestScore >= 250000 },
  ];
  D.RARITY_NAMES = { common: 'ОБЫЧНАЯ', uncommon: 'НЕОБЫЧНАЯ', rare: 'РЕДКАЯ', epic: 'ЭПИЧЕСКАЯ', legendary: 'ЛЕГЕНДАРНАЯ' };

  // ── Пламя двигателя ─────────────────────────────────────────
  D.TRAILS = [
    { id: 'ice',        name: 'ЛЁД',       price: 0,    colors: ['#ffffff', '#7fe7ff', '#2a7bff'] },
    { id: 'fire',       name: 'ОГОНЬ',     price: 0,    colors: ['#fff3b0', '#ffb03d', '#ff4d1a'] },
    { id: 'plasma',     name: 'ПЛАЗМА',    price: 300,  colors: ['#ffe1ff', '#ff6bf0', '#8a3dff'] },
    { id: 'green',      name: 'ЯДЕРНЫЙ',   price: 300,  colors: ['#f0fff0', '#7dff6b', '#16b34a'] },
    { id: 'gold',       name: 'ЗОЛОТО',    price: 500,  colors: ['#fffbe0', '#ffd23d', '#ff8f1a'] },
    { id: 'red',        name: 'КРОВЬ',     price: 500,  colors: ['#ffe0e0', '#ff3d5a', '#990022'] },
    { id: 'acid',       name: 'КИСЛОТА',   price: 700,  colors: ['#faffd0', '#c8ff3d', '#3dbb6b'] },
    { id: 'dark',       name: 'ТЬМА',      price: 900,  colors: ['#e6d9ff', '#8a4dff', '#2a0d66'] },
    { id: 'lightsaber', name: 'ЛАЙТСАБЕР', price: 1200, colors: ['#ffffff', '#d2f8ff', '#3de0ff'] },
    { id: 'rainbow',    name: 'РАДУГА',    price: 2000, colors: 'rainbow' },
  ];

  // ── Достижения ───────────────────────────────────────────────
  // stat — счётчик из сохранения (прогресс виден в списке); run — событие в забеге
  D.ACHIEVEMENTS = [
    { id: 'first_kill',      ico: '🔫', name: 'Первая кровь',        desc: 'Уничтожьте первого врага',          reward: 20,  stat: 'kills', goal: 1 },
    { id: 'kill200_total',   ico: '💀', name: 'Охотник',             desc: 'Уничтожьте 200 врагов',             reward: 100, stat: 'kills', goal: 200 },
    { id: 'kill1000_total',  ico: '🗡️', name: 'Жнец',                desc: 'Уничтожьте 1 000 врагов',           reward: 300, stat: 'kills', goal: 1000 },
    { id: 'kill5000',        ico: '☄️', name: 'Гроза галактики',     desc: 'Уничтожьте 5 000 врагов',           reward: 800, stat: 'kills', goal: 5000 },
    { id: 'boss1',           ico: '👾', name: 'Убийца боссов',       desc: 'Победите босса',                    reward: 100, stat: 'bosses', goal: 1 },
    { id: 'boss10',          ico: '🏹', name: 'Охотник на титанов',  desc: 'Победите 10 боссов',                reward: 400, stat: 'bosses', goal: 10 },
    { id: 'boss_all',        ico: '🏆', name: 'Коллекция трофеев',   desc: 'Победите всех 8 разных боссов',     reward: 800, stat: 'bossTypes', goal: 8 },
    { id: 'no_damage_boss',  ico: '🛡️', name: 'Неуязвимый охотник',  desc: 'Победите босса, не получив урона',  reward: 250 },
    { id: 'combo5',          ico: '⚡', name: 'Комбо-мастер',        desc: 'Наберите комбо ×20',                reward: 50,  stat: 'maxCombo', goal: 20 },
    { id: 'combo10',         ico: '🌟', name: 'Легенда комбо',       desc: 'Наберите комбо ×50',                reward: 150, stat: 'maxCombo', goal: 50 },
    { id: 'combo30',         ico: '🌪️', name: 'Бог скорости',        desc: 'Наберите комбо ×100',               reward: 300, stat: 'maxCombo', goal: 100 },
    { id: 'score1000',       ico: '🎯', name: 'Первые тысячи',       desc: '10 000 очков за одну игру',         reward: 50,  stat: 'bestScore', goal: 10000 },
    { id: 'score5000',       ico: '🏅', name: 'Ас',                  desc: '50 000 очков за одну игру',         reward: 150, stat: 'bestScore', goal: 50000 },
    { id: 'score250k',       ico: '👑', name: 'Легенда',             desc: '250 000 очков за одну игру',        reward: 400, stat: 'bestScore', goal: 250000 },
    { id: 'score1m',         ico: '💎', name: 'Миллионер',           desc: '1 000 000 очков за одну игру',      reward: 1000, stat: 'bestScore', goal: 1000000 },
    { id: 'survive5',        ico: '💪', name: 'Выживший',            desc: 'Дойдите до волны 10',               reward: 80,  stat: 'bestWave', goal: 10 },
    { id: 'wave20',          ico: '🚀', name: 'Ветеран',             desc: 'Дойдите до волны 20',               reward: 200, stat: 'bestWave', goal: 20 },
    { id: 'wave40',          ico: '🌌', name: 'Покоритель галактики', desc: 'Дойдите до волны 40',              reward: 500, stat: 'bestWave', goal: 40 },
    { id: 'nightmare10',     ico: '😱', name: 'Кошмарный сон',       desc: 'Волна 10 на сложности «Кошмар»',    reward: 300 },
    { id: 'god_mode_clear',  ico: '☠️', name: 'Бессмертный',         desc: 'Волна 15 на сложности «Бог войны»', reward: 500 },
    { id: 'shield',          ico: '🔰', name: 'Под защитой',         desc: 'Подберите щит',                     reward: 20 },
    { id: 'no_hit_level',    ico: '👻', name: 'Призрак',             desc: 'Пройдите волну 5+ без урона',       reward: 100 },
    { id: 'survive_1hp',     ico: '❤️', name: 'Последний рубеж',     desc: 'Продержитесь 60 с на последней жизни', reward: 180 },
    { id: 'survive_10min',   ico: '⏱️', name: 'Долгожитель',         desc: '10 минут в одной игре',             reward: 200 },
    { id: 'bomb_chain',      ico: '💣', name: 'Подрывник',           desc: '10 врагов одной бомбой',            reward: 100 },
    { id: 'accuracy80',      ico: '🎯', name: 'Снайпер точности',    desc: 'Точность 80%+ (от 150 выстрелов)',  reward: 120 },
    { id: 'perk15',          ico: '🧬', name: 'Эволюция',            desc: 'Уровень 15 в одном забеге',         reward: 200 },
    { id: 'weapon_all',      ico: '⚔️', name: 'Коллекционер',        desc: 'Откройте всё оружие',               reward: 400, stat: 'weaponsOwned', goal: 7 },
    { id: 'max_one_upgrade', ico: '🔬', name: 'Специалист',          desc: 'Прокачайте любую ветку до максимума', reward: 80 },
    { id: 'skill_tree_full', ico: '🧠', name: 'Мастер навыков',      desc: 'Изучите 5 навыков',                 reward: 300, stat: 'skillsLearned', goal: 5 },
    { id: 'ship_lvl20',      ico: '🛸', name: 'Ветеран космоса',     desc: 'Корабль 20 уровня',                 reward: 350, stat: 'shipLvl', goal: 20 },
    { id: 'ship3',           ico: '🦅', name: 'Флагман',             desc: 'Получите корабль «Феникс»',          reward: 300 },
    { id: 'ship6',           ico: '👑', name: 'Абсолютная власть',   desc: 'Получите корабль «Абсолют»',         reward: 1500 },
    { id: 'coins10k',        ico: '💰', name: 'Магнат',              desc: 'Заработайте 10 000 монет',          reward: 200, stat: 'coinsEarned', goal: 10000 },
    { id: 'games50',         ico: '🎮', name: 'Завсегдатай',         desc: 'Сыграйте 50 игр',                   reward: 150, stat: 'games', goal: 50 },
    { id: 'daily3',          ico: '📅', name: 'Дисциплина',          desc: 'Выполните все 3 задания дня',       reward: 100 },
    { id: 'daily_7',         ico: '🔥', name: 'Легенда дисциплины',  desc: 'Заходите 7 дней подряд',            reward: 400 },
    { id: 'prestige1',       ico: '🌠', name: 'Легенда галактики',   desc: 'Совершите престиж',                 reward: 500 },
  ];

  // ── Ежедневные задания ──────────────────────────────────────
  // goals/rewards — три уровня сложности; прогресс копится за весь день
  D.MISSIONS = [
    { id: 'kills',   text: 'Уничтожьте {n} врагов',          goals: [60, 120, 200],         rewards: [60, 100, 160] },
    { id: 'score',   text: 'Наберите {n} очков за день',     goals: [20000, 50000, 100000], rewards: [60, 100, 160] },
    { id: 'bosses',  text: 'Победите боссов: {n}',           goals: [1, 2, 3],              rewards: [80, 140, 220] },
    { id: 'wave',    text: 'Дойдите до волны {n}',           goals: [7, 11, 16],            rewards: [60, 110, 170], max: true },
    { id: 'combo',   text: 'Наберите комбо ×{n}',            goals: [20, 35, 50],           rewards: [50, 90, 140], max: true },
    { id: 'coins',   text: 'Соберите {n} монет',             goals: [150, 300, 500],        rewards: [50, 90, 140] },
    { id: 'games',   text: 'Сыграйте игр: {n}',              goals: [2, 3, 5],              rewards: [40, 60, 100] },
    { id: 'perks',   text: 'Получите улучшений: {n}',        goals: [8, 15, 25],            rewards: [50, 90, 140] },
    { id: 'pickups', text: 'Подберите бонусов: {n}',         goals: [6, 12, 20],            rewards: [50, 80, 120] },
    { id: 'minutes', text: 'Проведите в бою {n} мин',        goals: [5, 10, 15],            rewards: [50, 90, 140] },
  ];
  D.DAILY_BONUS = 150; // за все три задания

  // ── Награда за вход (по дням серии) ─────────────────────────
  D.LOGIN = [
    { coins: 50 }, { coins: 80 }, { coins: 120 }, { coins: 160 },
    { coins: 220 }, { coins: 300 }, { coins: 500, sp: 1 },
  ];

  // ── Секторы галактики (меняются после каждого босса) ────────
  D.SECTORS = [
    { name: 'ОРБИТА ЗЕМЛИ',       sky: ['#02040d', '#06103a'], neb: ['#1f4dff', '#3de0ff', '#7a3dff'], star: '#cfe3ff', planet: 210 },
    { name: 'ПОЯС АСТЕРОИДОВ',    sky: ['#070305', '#21100a'], neb: ['#ff6a2a', '#ffb35c', '#b0302a'], star: '#ffe6cc', planet: 25 },
    { name: 'ТУМАННОСТЬ ОРИОНА',  sky: ['#06020c', '#260a33'], neb: ['#ff3dd2', '#8a3dff', '#3d5cff'], star: '#ffd9fb', planet: 300 },
    { name: 'ЛЕДЯНЫЕ ЛУНЫ',       sky: ['#010810', '#06283a'], neb: ['#3dfff0', '#7fb8ff', '#2a6bff'], star: '#e0fdff', planet: 190 },
    { name: 'КРАСНЫЙ ГИГАНТ',     sky: ['#0a0204', '#2e070d'], neb: ['#ff2d4d', '#ff8a3d', '#8a1a3d'], star: '#ffd6d6', planet: 5 },
    { name: 'ИЗУМРУДНЫЕ ПОЛЯ',    sky: ['#010805', '#06301f'], neb: ['#2dff8a', '#3dd2ff', '#1a8a5c'], star: '#dcffe9', planet: 145 },
    { name: 'ГОРИЗОНТ СОБЫТИЙ',   sky: ['#030108', '#16082e'], neb: ['#7a3dff', '#ff3d8b', '#2a1a8a'], star: '#e8dcff', planet: 265 },
    { name: 'СЕРДЦЕ ГАЛАКТИКИ',   sky: ['#080501', '#2e1a05'], neb: ['#ffc83d', '#ff6b3d', '#ff3d8b'], star: '#fff3d6', planet: 45 },
  ];

  // Цена воскрешения за монеты (один раз за забег)
  D.reviveCost = (wave) => 120 + wave * 35;
  // Опыт корабля: сколько нужно до следующего уровня
  D.shipXpNeed = (lvl) => Math.round(150 * Math.pow(lvl, 1.35));
  // Порог опыта забега для нового уровня (выбор улучшения)
  D.perkXpNeed = (lvl) => Math.round(6 + lvl * 5 + lvl * lvl * 0.9);
  // Престиж доступен с этого уровня корабля
  D.PRESTIGE_LVL = 25;

  SS.data = D;
})();
