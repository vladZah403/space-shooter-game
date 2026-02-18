const tg = window.Telegram?.WebApp;
if(tg){ tg.expand(); tg.enableClosingConfirmation(); }

// ════════════════════════════════════════════════════
// CANVAS
// ════════════════════════════════════════════════════
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// ════════════════════════════════════════════════════
// AUDIO (Web Audio API)
// ════════════════════════════════════════════════════
const AC = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
function getAC(){ if(!audioCtx) audioCtx = new AC(); return audioCtx; }

function playSound(type){
  try{
    const ac = getAC();
    const sfxVol = (typeof Settings !== 'undefined') ? Settings.sfxVol / 100 : 1;
    if(sfxVol <= 0) return;
    // SFX master gain node for volume control
    const sfxMaster = ac.createGain();
    sfxMaster.gain.value = sfxVol;
    sfxMaster.connect(ac.destination);
    const g = ac.createGain();
    g.connect(sfxMaster);
    const o = ac.createOscillator();
    o.connect(g);
    if(type==='shoot'){
      o.type='square'; o.frequency.setValueAtTime(880,ac.currentTime); o.frequency.exponentialRampToValueAtTime(220,ac.currentTime+.08);
      g.gain.setValueAtTime(.06,ac.currentTime); g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.1);
      o.start(); o.stop(ac.currentTime+.1);
    }else if(type==='explode'){
      const buf = ac.createBuffer(1,ac.sampleRate*.15,ac.sampleRate);
      const d = buf.getChannelData(0);
      for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.exp(-i/d.length*8);
      const src = ac.createBufferSource(); src.buffer=buf; src.connect(g);
      g.gain.setValueAtTime(.18,ac.currentTime); g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.15);
      src.start(); return;
    }else if(type==='hit'){
      o.type='sawtooth'; o.frequency.setValueAtTime(220,ac.currentTime); o.frequency.exponentialRampToValueAtTime(80,ac.currentTime+.08);
      g.gain.setValueAtTime(.1,ac.currentTime); g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.1);
      o.start(); o.stop(ac.currentTime+.1);
    }else if(type==='powerup'){
      o.type='sine'; o.frequency.setValueAtTime(440,ac.currentTime); o.frequency.exponentialRampToValueAtTime(880,ac.currentTime+.12);
      g.gain.setValueAtTime(.12,ac.currentTime); g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.15);
      o.start(); o.stop(ac.currentTime+.15);
    }else if(type==='boss'){
      o.type='sawtooth'; o.frequency.setValueAtTime(110,ac.currentTime); o.frequency.exponentialRampToValueAtTime(55,ac.currentTime+.3);
      g.gain.setValueAtTime(.2,ac.currentTime); g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.35);
      o.start(); o.stop(ac.currentTime+.35);
    }else if(type==='levelup'){
      const freqs=[523,659,784,1047];
      freqs.forEach((f,i)=>{
        const oo=ac.createOscillator(), gg=ac.createGain();
        oo.connect(gg); gg.connect(sfxMaster);
        oo.type='sine'; oo.frequency.value=f;
        gg.gain.setValueAtTime(0,ac.currentTime+i*.08);
        gg.gain.linearRampToValueAtTime(.12*sfxVol,ac.currentTime+i*.08+.04);
        gg.gain.exponentialRampToValueAtTime(.001,ac.currentTime+i*.08+.15);
        oo.start(ac.currentTime+i*.08); oo.stop(ac.currentTime+i*.08+.15);
      });
      return;
    }
  }catch(e){}
}

// ════════════════════════════════════════════════════
// BACKGROUND MUSIC (Web Audio API — procedural)
// ════════════════════════════════════════════════════
// ════════════════════════════════════════════════════
// MUSIC ENGINE — два режима: меню и игра
// ════════════════════════════════════════════════════
const Music = {
  _nodes: [],
  _running: false,
  _mode: null,       // 'menu' | 'game'
  _masterGain: null,

  _cleanup(){
    this._nodes.forEach(n=>{ try{ n.stop?.(); n.disconnect?.(); }catch(e){} });
    this._nodes = [];
    this._masterGain = null;
  },

  _fadeOut(cb){
    if(this._masterGain){
      try{
        const ac = getAC();
        this._masterGain.gain.setTargetAtTime(0, ac.currentTime, 0.25);
        setTimeout(()=>{ this._cleanup(); if(cb) cb(); }, 700);
      }catch(e){ this._cleanup(); if(cb) cb(); }
    } else { if(cb) cb(); }
  },

  play(mode){
    if(this._running && this._mode === mode) return;
    // Плавно выключаем предыдущую и включаем новую
    this._running = false;
    this._fadeOut(()=>{ this._start(mode); });
  },

  stop(){
    this._running = false;
    this._mode = null;
    this._fadeOut();
  },

  pause(){ if(this._masterGain) try{ this._masterGain.gain.setTargetAtTime(0.03, getAC().currentTime, 0.2); }catch(e){} },
  resume(){ if(this._masterGain) try{ const v = (Settings?.musicVol ?? 70) / 100; this._masterGain.gain.setTargetAtTime(this._mode==='game'?0.18*v:0.14*v, getAC().currentTime, 0.2); }catch(e){} },

  _start(mode){
    try{
      const ac = getAC();
      this._running = true;
      this._mode = mode;

      const master = ac.createGain();
      master.gain.setValueAtTime(0, ac.currentTime);
      const _mv = (typeof Settings !== 'undefined' ? Settings.musicVol : 70) / 100;
      master.gain.linearRampToValueAtTime((mode==='game' ? 0.18 : 0.14) * _mv, ac.currentTime + 1.2);
      master.connect(ac.destination);
      this._masterGain = master;
      this._nodes.push(master);

      if(mode === 'menu') this._buildMenu(ac, master);
      else                this._buildGame(ac, master);
    }catch(e){ console.warn('Music:', e); }
  },

  // ── МЕНЮ: спокойный ambient ──────────────────────
  _buildMenu(ac, out){
    // Глубокий дрон
    [55, 82.41, 110].forEach((f, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      const lfo = ac.createOscillator();
      const lg  = ac.createGain();
      o.type = 'sine'; o.frequency.value = f;
      lfo.frequency.value = 0.08 + i * 0.03;
      lg.gain.value = 1.2;
      lfo.connect(lg); lg.connect(o.frequency);
      g.gain.value = 0.04 - i * 0.008;
      o.connect(g); g.connect(out);
      o.start(); lfo.start();
      this._nodes.push(o, g, lfo, lg);
    });

    // Мягкие пэд-аккорды Am → F → C → G
    const chords = [
      [220, 261.63, 329.63],   // Am
      [174.61, 220, 261.63],   // F
      [261.63, 329.63, 392],   // C
      [196, 246.94, 293.66],   // G
    ];
    let chordIdx = 0;
    const BAR = 3.2; // seconds per chord
    const playChord = () => {
      if(!this._running || this._mode !== 'menu') return;
      const chord = chords[chordIdx % chords.length];
      chord.forEach((f, i) => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'sine'; o.frequency.value = f;
        const now = ac.currentTime;
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.018, now + 0.4);
        g.gain.setValueAtTime(0.018, now + BAR - 0.5);
        g.gain.linearRampToValueAtTime(0, now + BAR);
        o.connect(g); g.connect(out);
        o.start(now); o.stop(now + BAR);
        this._nodes.push(o, g);
      });
      chordIdx++;
      setTimeout(playChord, BAR * 1000);
    };
    playChord();

    // Медленное мелодическое арпеджио
    const mel = [440, 392, 349.23, 392, 440, 493.88, 440, 392];
    let mi = 0;
    const MSTEP = 0.55;
    const playMel = () => {
      if(!this._running || this._mode !== 'menu') return;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'triangle'; o.frequency.value = mel[mi % mel.length];
      const now = ac.currentTime;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.022, now + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, now + MSTEP * 0.85);
      o.connect(g); g.connect(out);
      o.start(now); o.stop(now + MSTEP);
      this._nodes.push(o, g);
      mi++;
      setTimeout(playMel, MSTEP * 1000);
    };
    setTimeout(playMel, 800);
  },

  // ── ИГРА: энергичный chiptune ──────────────────────
  _buildGame(ac, out){
    const BPM  = 128;
    const beat = 60 / BPM;

    // Bass drive
    const bassO = ac.createOscillator();
    const bassG = ac.createGain();
    bassO.type = 'sawtooth'; bassO.frequency.value = 55;
    bassG.gain.value = 0.045;
    bassO.connect(bassG); bassG.connect(out);
    bassO.start();
    this._nodes.push(bassO, bassG);

    // Пэд аккорды Am
    [220, 277.18, 329.63, 415.30].forEach((f, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      const lfo = ac.createOscillator();
      const lg  = ac.createGain();
      o.type = 'sine'; o.frequency.value = f;
      lfo.frequency.value = 0.28 + i * 0.06;
      lg.gain.value = 2.5;
      lfo.connect(lg); lg.connect(o.frequency);
      g.gain.value = 0.022;
      o.connect(g); g.connect(out);
      o.start(); lfo.start();
      this._nodes.push(o, g, lfo, lg);
    });

    // Арпеджио (быстрое)
    const arp = [220, 261.63, 329.63, 392, 440, 523.25, 440, 392];
    let ai = 0;
    const playArp = () => {
      if(!this._running || this._mode !== 'game') return;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'square'; o.frequency.value = arp[ai % arp.length];
      const now = ac.currentTime;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.028, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, now + beat * 0.88);
      o.connect(g); g.connect(out);
      o.start(now); o.stop(now + beat);
      this._nodes.push(o, g);
      ai++;
      this._nodes = this._nodes.filter(n=>{ try{ return !!n; }catch(e){ return false; } });
      setTimeout(playArp, beat * 960);
    };
    setTimeout(playArp, 200);

    // Hi-hat
    let hi = 0;
    const playHat = () => {
      if(!this._running || this._mode !== 'game') return;
      if(hi % 2 === 0){
        const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.04), ac.sampleRate);
        const d   = buf.getChannelData(0);
        for(let k=0;k<d.length;k++) d[k] = (Math.random()*2-1)*Math.exp(-k/d.length*22);
        const src = ac.createBufferSource();
        const hg  = ac.createGain();
        const hf  = ac.createBiquadFilter();
        hf.type = 'highpass'; hf.frequency.value = 7000;
        src.buffer = buf;
        src.connect(hf); hf.connect(hg); hg.connect(out);
        hg.gain.value = 0.022;
        src.start(); this._nodes.push(src, hg, hf);
      }
      hi++;
      setTimeout(playHat, beat * 500);
    };
    setTimeout(playHat, 50);

    // Kick drum (low thump)
    const playKick = () => {
      if(!this._running || this._mode !== 'game') return;
      const o  = ac.createOscillator();
      const g  = ac.createGain();
      const now = ac.currentTime;
      o.type = 'sine'; o.frequency.setValueAtTime(120, now);
      o.frequency.exponentialRampToValueAtTime(40, now + 0.12);
      g.gain.setValueAtTime(0.09, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      o.connect(g); g.connect(out);
      o.start(now); o.stop(now + 0.2);
      this._nodes.push(o, g);
      setTimeout(playKick, beat * 2 * 1000);
    };
    playKick();
  }
};


const LS = {
  get:(k,def='')=>{ try{ const v=localStorage.getItem(k); return v===null?def:v; }catch(e){return def;} },
  set:(k,v)=>{ try{ localStorage.setItem(k,String(v)); }catch(e){} },
  getJ:(k,def)=>{ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):def; }catch(e){return def;} },
  setJ:(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
};

// ════════════════════════════════════════════════════
// UPGRADES SYSTEM — ОРУЖИЕ ЗА МОНЕТЫ
// ════════════════════════════════════════════════════
const UPG_CATEGORIES = [
  {
    id:'general', label:'🔫 ОБЩЕЕ', emoji:'🔫',
    items:{
      damage:    {max:8, base:150, mult:1.9, label:'Урон',             desc:'Урон всего оружия +25%',        icon:'💥'},
      firerate:  {max:8, base:200, mult:1.9, label:'Скорострельность', desc:'Кулдаун стрельбы −8%',          icon:'⚡'},
      bulletspd: {max:6, base:140, mult:1.8, label:'Скорость пуль',    desc:'Скорость пуль +15%',            icon:'💨'},
      pierce:    {max:3, base:600, mult:2.5, label:'Пробитие',         desc:'Пули пробивают +1 врага',       icon:'🔩'},
    }
  },
  {
    id:'laser', label:'🔵 ЛАЗЕР', emoji:'🔵',
    items:{
      laserWidth: {max:5, base:200, mult:2.0, label:'Ширина луча',    desc:'Хитбокс лазера шире на 20%',    icon:'📏'},
      laserCrit:  {max:4, base:350, mult:2.2, label:'Крит лазера',    desc:'+10% крит шанс лазера',         icon:'💥'},
      laserPierce:{max:3, base:500, mult:2.5, label:'Пронзание',      desc:'Лазер пронзает всех врагов',    icon:'🔩'},
    }
  },
  {
    id:'rocket', label:'🚀 РАКЕТА', emoji:'🚀',
    items:{
      rocketDmg:  {max:6, base:250, mult:2.1, label:'Урон ракеты',    desc:'Урон ракеты +40%',              icon:'💣'},
      rocketSpd:  {max:4, base:300, mult:2.2, label:'Скорость',       desc:'Скорость ракеты +25%',          icon:'⚡'},
      rocketSplit:{max:2, base:800, mult:3.0, label:'Деление',        desc:'При взрыве → 2 мини-ракеты',    icon:'💫'},
      rocketAoe:  {max:4, base:400, mult:2.3, label:'Взрыв',          desc:'Радиус взрыва +20%',            icon:'🔥'},
    }
  },
  {
    id:'shotgun', label:'💥 ДРОБОВИК', emoji:'💥',
    items:{
      shotPellets:{max:5, base:180, mult:1.9, label:'Дробь',          desc:'+2 дроби за уровень',           icon:'🔫'},
      shotSpread: {max:3, base:280, mult:2.1, label:'Разброс',        desc:'Угол разброса шире',            icon:'↔️'},
      shotPierce: {max:3, base:420, mult:2.4, label:'Пробитие дроби', desc:'Дробь пробивает врагов',        icon:'🔩'},
      shotDmg:    {max:5, base:220, mult:2.0, label:'Урон дроби',     desc:'Урон каждой дроби +20%',        icon:'💥'},
    }
  },
  {
    id:'plasma', label:'🟣 ПЛАЗМА', emoji:'🟣',
    items:{
      plasmaDmg:  {max:6, base:230, mult:2.0, label:'Урон плазмы',    desc:'Урон плазмы +30%',              icon:'☄️'},
      plasmaAoe:  {max:4, base:350, mult:2.2, label:'Взрыв плазмы',   desc:'Радиус AoE +25%',               icon:'🌀'},
      plasmaSpd:  {max:3, base:400, mult:2.3, label:'Скорость',       desc:'Скорость шара +30%',            icon:'💨'},
    }
  },
  {
    id:'lightning', label:'⚡ МОЛНИЯ', emoji:'⚡',
    items:{
      lightDmg:   {max:6, base:220, mult:2.0, label:'Урон молнии',    desc:'Урон цепи +25%',                icon:'⚡'},
      lightChain: {max:4, base:380, mult:2.2, label:'Цепь',           desc:'+1 прыжок цепи',                icon:'🔗'},
      lightRange: {max:3, base:450, mult:2.3, label:'Дальность',      desc:'Радиус цепи +30%',              icon:'📡'},
    }
  },
  {
    id:'rail', label:'🔮 РЕЛЬСА', emoji:'🔮',
    items:{
      railCd:     {max:5, base:300, mult:2.1, label:'Перезарядка',    desc:'−2с кулдауна рельсы',           icon:'⏱️'},
      railWidth:  {max:4, base:400, mult:2.3, label:'Ширина луча',    desc:'Ширина луча рельсы +30%',       icon:'📐'},
      railDur:    {max:4, base:450, mult:2.4, label:'Длительность',   desc:'Время активности +0.5с',        icon:'⌛'},
    }
  },
  {
    id:'support', label:'🛡️ КОРАБЛЬ', emoji:'🛡️',
    items:{
      shield:    {max:3, base:500, mult:2.8, label:'Стартовый щит',   desc:'Начинать игру со щитом',        icon:'🛡️'},
      extraLife: {max:3, base:800, mult:3.2, label:'Доп. жизнь',      desc:'+1 жизнь при старте',           icon:'❤️'},
      magnet:    {max:5, base:300, mult:2.1, label:'Магнит',          desc:'Радиус притяжения монет +55px',  icon:'🧲'},
      coinboost: {max:5, base:250, mult:2.0, label:'Монеты',          desc:'Монет за убийство +20%',        icon:'💰'},
      bombdmg:   {max:5, base:350, mult:2.2, label:'Бомба',           desc:'Урон и радиус бомбы +30%',      icon:'💣'},
    }
  },
];

// Flat map для быстрого доступа
const UPGRADES = {};
UPG_CATEGORIES.forEach(cat => Object.assign(UPGRADES, cat.items));

let upgrades = LS.getJ('upgrades', {});
Object.keys(UPGRADES).forEach(k=>{ if(upgrades[k]===undefined) upgrades[k]=0; });

let coins    = +LS.get('coins', 0);
let shipXP   = +LS.get('shipXP', 0);
let shipLvl  = +LS.get('shipLvl', 1);
let skillPoints = +LS.get('skillPoints', 0);
let skillLevels = LS.getJ('skillLevels', {});
let bombsInStock = 0;
let bombCooldown = 0;

function savePersistent(){
  LS.setJ('upgrades', upgrades);
  LS.set('coins', coins);
  LS.set('shipXP', shipXP);
  LS.set('shipLvl', shipLvl);
  LS.set('skillPoints', skillPoints);
  LS.setJ('skillLevels', skillLevels);
}

function upgCost(k){ return Math.floor(UPGRADES[k].base * Math.pow(UPGRADES[k].mult, upgrades[k])); }

function isReqMet(k){
  const req = UPGRADES[k].req;
  if(!req) return true;
  return Object.entries(req).every(([rk,rv])=>upgrades[rk]>=rv);
}

let cachedBonus = null;
function getBonus(){
  if(!cachedBonus){
    const sk = getSkillBonus();
    const speedPenalty = sk.doubleCoins ? 0.85 : 1;
    const overclock = sk.overclocking ? 0.33 : 1; // x3 fire rate
    const berserkerDmg = sk.berserker ? 1 + Math.max(0, (4-Math.max(lives,1))/4)*0.6 : 1;
    cachedBonus = {
      // Оружие
      bulletSpeedMult:  1 + (upgrades.bulletspd||0) * 0.15,
      damageMult:       (1 + (upgrades.damage||0) * 0.25) * berserkerDmg,
      firerateMult:     (1 - (upgrades.firerate||0) * 0.08) * overclock,
      critChance:       0,
      critMult:         2.5,
      multishot:        0,
      pierceCount:      (upgrades.pierce||0),
      // Лазер
      laserWidthMult:   1 + (upgrades.laserWidth||0) * 0.20,
      laserCritBonus:   (upgrades.laserCrit||0) * 0.10,
      laserPierce:      (upgrades.laserPierce||0) > 0,
      laserBeamLevel:   0,
      // Ракета
      rocketDmgMult:    1 + (upgrades.rocketDmg||0) * 0.40,
      rocketSpdMult:    1 + (upgrades.rocketSpd||0) * 0.25,
      rocketSplit:      upgrades.rocketSplit||0,
      rocketAoeMult:    1 + (upgrades.rocketAoe||0) * 0.20,
      // Дробовик
      shotPellets:      7 + (upgrades.shotPellets||0) * 2,
      shotSpreadMult:   1 + (upgrades.shotSpread||0) * 0.15,
      shotPierce:       (upgrades.shotPierce||0) > 0,
      shotDmgMult:      1 + (upgrades.shotDmg||0) * 0.20,
      // Плазма
      plasmaDmgMult:    1 + (upgrades.plasmaDmg||0) * 0.30,
      plasmaAoeMult:    1 + (upgrades.plasmaAoe||0) * 0.25,
      plasmaSpdMult:    1 + (upgrades.plasmaSpd||0) * 0.30,
      // Молния
      lightDmgMult:     1 + (upgrades.lightDmg||0) * 0.25,
      lightChain:       3 + (upgrades.lightChain||0),
      lightRangeMult:   1 + (upgrades.lightRange||0) * 0.30,
      // Рельса
      railCdReduce:     (upgrades.railCd||0) * 2000,
      railWidthMult:    1 + (upgrades.railWidth||0) * 0.30,
      railDurBonus:     (upgrades.railDur||0) * 500,
      // Корабль
      hasStartShield:   (upgrades.shield||0) > 0,
      extraLife:        (upgrades.extraLife||0),
      magnetRadius:     sk.superMagnet ? 9999 : (upgrades.magnet||0) * 55,
      coinMult:         (1 + (upgrades.coinboost||0) * 0.20) * (sk.doubleCoins ? 2 : 1),
      bombDmgMult:      1 + (upgrades.bombdmg||0) * 0.30,
      bombCooldownMult: 1,
      startBombs:       0,
      xpMult:           1,
      dropLuckMult:     1,
      // Навыки пассивные
      dodgeChance:      sk.dodgeAdd,
      vampirism:        sk.vampirism,
      regenLvl:         sk.regenLvl,
      ricochet:         sk.ricochet,
      detonator:        sk.detonator,
      moveSpeedMult:    speedPenalty,
      invincibleBonus:  0,
    };
  }
  return cachedBonus;
}
function invalidateBonus(){ cachedBonus = null; }

// ════════════════════════════════════════════════════
// НАВЫКИ — УНИКАЛЬНЫЕ ПАССИВНЫЕ + АКТИВНЫЕ
// ════════════════════════════════════════════════════
const SKILL_DEFS = {
  // ── ПАССИВНЫЕ ──
  sk_vamp:       { ico:'🧛', name:'ВАМПИР',      type:'passive', desc:'15% шанс восстановить жизнь при убийстве', max:1, cost:2, req:null },
  sk_regen:      { ico:'💚', name:'РЕГЕНЕРАЦИЯ', type:'passive', desc:'Жизнь восстанавливается раз в 45 секунд',   max:1, cost:2, req:null },
  sk_ghost:      { ico:'👻', name:'ПРИЗРАК',     type:'passive', desc:'25% шанс уклониться от любого урона',       max:1, cost:3, req:null },
  sk_berserker:  { ico:'😤', name:'БЕРСЕРК',     type:'passive', desc:'Чем меньше жизней — тем выше урон (до +60%)', max:1, cost:3, req:'sk_vamp' },
  sk_magnet:     { ico:'🧲', name:'СУПЕРМАГНИТ', type:'passive', desc:'Монеты и бонусы притягиваются со всего экрана', max:1, cost:2, req:null },
  sk_ricochet:   { ico:'🎱', name:'РИКОШЕТ',    type:'passive', desc:'Пули рикошетят от краёв экрана 1 раз',      max:1, cost:3, req:null },
  sk_doublecoins:{ ico:'💎', name:'АЛЧНОСТЬ',   type:'passive', desc:'Все монеты x2, но скорость корабля −15%',   max:1, cost:2, req:null },
  sk_detonator:  { ico:'💥', name:'ДЕТОНАТОР',  type:'passive', desc:'Каждое 5-е убийство — мини-взрыв вокруг',   max:1, cost:3, req:null },
  // ── АКТИВНЫЕ ──
  sk_nova:       { ico:'🌟', name:'НОВА',        type:'active', cdMs:12000, desc:'Ударная волна — сносит всех врагов на экране',  max:1, cost:3, req:null, actionKey:'Q' },
  sk_barrier:    { ico:'🔵', name:'БАРЬЕР',      type:'active', cdMs:18000, desc:'Энергетический щит на 4 секунды',               max:1, cost:3, req:null, actionKey:'E' },
  sk_timewarp:   { ico:'⏳', name:'ЗАМЕДЛЕНИЕ', type:'active', cdMs:25000, desc:'Замедляет врагов и снаряды на 3 секунды',       max:1, cost:4, req:null, actionKey:'R' },
  sk_airstrike:  { ico:'✈️', name:'АВИАУДАР',   type:'active', cdMs:20000, desc:'3 бомбы падают по случайным врагам',            max:1, cost:3, req:null, actionKey:'F' },
  sk_overclock:  { ico:'⚡', name:'РАЗГОН',      type:'active', cdMs:15000, desc:'Скорострельность x3 на 4 секунды',              max:1, cost:3, req:null, actionKey:'W' },
};

// Состояние активных навыков в бою
let activeSkillCooldowns = {};
let activeSkillEffects = {};
let killCounter = 0;

function getSkillBonus(){
  return {
    vampirism:     (skillLevels.sk_vamp||0) * 0.15,
    regenLvl:      (skillLevels.sk_regen||0),
    dodgeAdd:      (skillLevels.sk_ghost||0) * 0.25,
    berserker:     (skillLevels.sk_berserker||0) > 0,
    superMagnet:   (skillLevels.sk_magnet||0) > 0,
    ricochet:      (skillLevels.sk_ricochet||0) > 0,
    doubleCoins:   (skillLevels.sk_doublecoins||0) > 0,
    detonator:     (skillLevels.sk_detonator||0) > 0,
    overclocking:  (activeSkillEffects.sk_overclock||0) > 0,
    barrierActive: (activeSkillEffects.sk_barrier||0) > 0,
  };
}

function getActiveSkills(){
  return Object.keys(SKILL_DEFS).filter(id => SKILL_DEFS[id].type==='active' && (skillLevels[id]||0)>=1);
}

function activateSkill(id){
  if(!gameRunning || gamePaused) return;
  if((skillLevels[id]||0)<1) return;
  if((activeSkillCooldowns[id]||0)>0) return;
  const sk = SKILL_DEFS[id];
  activeSkillCooldowns[id] = sk.cdMs;

  if(id==='sk_nova'){
    triggerShake(16); playSound('explode');
    notify('🌟 НОВА!','gold');
    for(let i=enemies.length-1;i>=0;i--){
      const e=enemies[i];
      if(e.isBoss){ e.hp=Math.max(1,e.hp-Math.floor(e.maxHp*.25)); }
      else if(e.isMiniBoss){ e.hp=Math.max(1,e.hp-Math.floor(e.maxHp*.5)); }
      else{ explode(e.x,e.y,'#ffffff',12); killEnemy(i,DIFF[difficulty]); }
    }
    particles.push({x:canvas.width/2,y:canvas.height*.6,r:0,maxR:Math.max(canvas.width,canvas.height)*0.9,life:1,decay:.02,color:'#aaddff',wave:true,bossShot:false,vx:0,vy:0});
  }
  else if(id==='sk_barrier'){
    activeSkillEffects[id] = 4000;
    activePowerups.shield = Math.max(activePowerups.shield, 4000);
    notify('🔵 БАРЬЕР АКТИВИРОВАН!','gold'); playSound('powerup');
    triggerShake(5);
  }
  else if(id==='sk_timewarp'){
    timeFreezeActive = Math.max(timeFreezeActive, 3000);
    activeSkillEffects[id] = 3000;
    notify('⏳ ЗАМЕДЛЕНИЕ ВРЕМЕНИ!','gold'); playSound('powerup'); triggerShake(6);
  }
  else if(id==='sk_airstrike'){
    notify('✈️ АВИАУДАР!','gold'); playSound('explode');
    const positions = enemies.filter(e=>!e.isBoss).sort(()=>Math.random()-.5).slice(0,3)
      .map(e=>({x:e.x,y:e.y}));
    if(positions.length<3){ for(let i=positions.length;i<3;i++) positions.push({x:50+Math.random()*(canvas.width-100),y:50+Math.random()*(canvas.height*.55)}); }
    positions.forEach((pos,i)=>setTimeout(()=>{
      if(!gameRunning||gamePaused) return;
      explode(pos.x,pos.y,'#ff6b00',50); triggerShake(8); playSound('explode');
      for(let j=enemies.length-1;j>=0;j--){
        if(!enemies[j].isBoss && Math.hypot(enemies[j].x-pos.x,enemies[j].y-pos.y)<100) killEnemy(j,DIFF[difficulty]);
      }
    }, i*300));
  }
  else if(id==='sk_overclock'){
    activeSkillEffects[id] = 4000;
    notify('⚡ РАЗГОН РЕАКТОРОВ!','gold'); playSound('powerup');
  }
  updateSkillBar();
}

function updateSkillBar(){
  const bar = document.getElementById('activeSkillBar');
  if(!bar) return;
  const active = getActiveSkills();
  bar.style.display = active.length ? 'flex' : 'none';
  bar.innerHTML = '';
  active.forEach(id=>{
    const sk = SKILL_DEFS[id];
    const cd = activeSkillCooldowns[id]||0;
    const pct = sk.cdMs > 0 ? cd/sk.cdMs : 0;
    const btn = document.createElement('div');
    btn.className = 'active-skill-btn'+(cd>0?' sk-cd':'');
    btn.innerHTML = `<div class="ask-ico">${sk.ico}</div><div class="ask-key">${sk.actionKey}</div>${cd>0?`<div class="ask-cd-overlay" style="height:${pct*100}%"></div><div class="ask-cd-text">${Math.ceil(cd/1000)}s</div>`:''}`;
    btn.addEventListener('click',()=>activateSkill(id));
    bar.appendChild(btn);
  });
  // Обновляем тач-кнопки
  if(typeof updateTouchSkillBar === 'function') updateTouchSkillBar();
}

function renderSkillTree(){
  document.getElementById('skillPtsVal').textContent = skillPoints;
  const container = document.getElementById('skillTree');
  container.innerHTML = '';

  const passives = Object.entries(SKILL_DEFS).filter(([,sk])=>sk.type==='passive');
  const actives  = Object.entries(SKILL_DEFS).filter(([,sk])=>sk.type==='active');

  const makeSection = (title, entries) => {
    const sec = document.createElement('div');
    sec.className = 'skill-branch';
    sec.innerHTML = `<div class="skill-branch-title">${title}</div>`;
    const row = document.createElement('div');
    row.className = 'skill-row';
    entries.forEach(([id, sk])=>{
      const lvl = skillLevels[id]||0;
      const isMax = lvl >= sk.max;
      let isLocked = false;
      if(sk.req && !(skillLevels[sk.req]>=1)) isLocked=true;
      const canAfford = skillPoints >= sk.cost;
      const node = document.createElement('div');
      node.className = 'skill-node'+(isMax?' maxed':isLocked?' locked':lvl>0?' unlocked':'');
      const typeTag = sk.type==='active'
        ? `<div class="skill-type-tag active-tag">⚡ [${sk.actionKey}]</div>`
        : `<div class="skill-type-tag passive-tag">🔮 ПАССИВ</div>`;
      node.innerHTML = `<span class="skill-node-ico">${sk.ico}</span>
        <div class="skill-node-name">${sk.name}</div>
        ${typeTag}
        <div class="skill-node-desc">${sk.desc}</div>
        <div class="skill-node-lvl">${isMax?'✅ ИЗУЧЕНО':isLocked?'🔒 ЗАПЕРТО':canAfford?`${sk.cost} 🔮 ИЗУЧИТЬ`:`${sk.cost} 🔮 (нет очков)`}</div>`;
      if(!isLocked && !isMax && canAfford){
        node.style.cursor='pointer';
        node.addEventListener('click',()=>{
          skillPoints -= sk.cost;
          skillLevels[id] = 1;
          invalidateBonus();
          savePersistent();
          renderSkillTree();
          updateSkillBar();
          notify(`${sk.ico} ${sk.name} изучено!`,'gold');
        });
      }
      row.appendChild(node);
    });
    sec.appendChild(row);
    container.appendChild(sec);
  };

  makeSection('🔮 ПАССИВНЫЕ НАВЫКИ', passives);
  makeSection('⚡ АКТИВНЫЕ НАВЫКИ (нажми в бою!)', actives);
}

function addShipXP(amt){
  // Уровень корабля растёт только от покупки апгрейдов — вызывай только оттуда
  const bonus = getBonus();
  shipXP += Math.floor(amt * bonus.xpMult);
  const needed = shipLvl * 2800 + shipLvl * shipLvl * 400;
  if(shipXP >= needed){
    shipXP -= needed; shipLvl++;
    skillPoints++;
    const bonusCoins = 60 + shipLvl * 8;
    coins += bonusCoins;
    invalidateBonus();
    savePersistent();
    notify(`🚀 КОРАБЛЬ УР.${shipLvl}! +${bonusCoins}💰 +1🔮 НАВЫК`, 'gold');
    const spEl = document.getElementById('skillPtsDisplay');
    const spVal = document.getElementById('hudSkillPtsVal');
    if(spEl && spVal){ spVal.textContent = skillPoints; spEl.style.display = skillPoints>0?'block':'none'; }
  }
  savePersistent();
  renderXPBar();
}

function renderXPBar(){
  const shipEl = document.getElementById('shipLvlHud');
  if(shipEl) shipEl.textContent = shipLvl;
  const needed = shipLvl * 2800 + shipLvl * shipLvl * 400;
  const pct = Math.min(100, shipXP / needed * 100);
  const fill = document.getElementById('levelFill');
  const valEl = document.getElementById('levelVal');
  if(fill) fill.style.width = pct + '%';
  if(valEl) valEl.textContent = shipLvl;
}
renderXPBar();

let _upgActiveTab = UPG_CATEGORIES[0].id;

function renderUpgradeScreen(){
  document.getElementById('coinsVal').textContent = coins;

  // Ship level display
  const needed = shipLvl * 2800 + shipLvl * shipLvl * 400;
  const pct = Math.min(100, shipXP / needed * 100);
  const el_lvl  = document.getElementById('upgShipLvl');
  const el_fill = document.getElementById('upgShipXpFill');
  const el_cur  = document.getElementById('upgShipXpCur');
  const el_max  = document.getElementById('upgShipXpMax');
  if(el_lvl)  el_lvl.textContent  = shipLvl;
  if(el_fill) el_fill.style.width = pct + '%';
  if(el_cur)  el_cur.textContent  = shipXP;
  if(el_max)  el_max.textContent  = needed;

  // Tabs
  const tabsEl = document.getElementById('upgTabs');
  tabsEl.innerHTML = '';
  UPG_CATEGORIES.forEach(cat => {
    const tb = document.createElement('button');
    tb.className = 'upg-tab' + (cat.id===_upgActiveTab ? ' active' : '');
    tb.innerHTML = `${cat.emoji}<br><span>${cat.label.replace(/^[^ ]+ /,'')}</span>`;
    tb.addEventListener('click',()=>{ _upgActiveTab=cat.id; renderUpgradeScreen(); });
    tabsEl.appendChild(tb);
  });

  const list = document.getElementById('upgList');
  list.innerHTML = '';

  const cat = UPG_CATEGORIES.find(c=>c.id===_upgActiveTab);
  if(!cat) return;

  Object.keys(cat.items).forEach(k => {
    const u = cat.items[k];
    const lvl = upgrades[k]||0, maxed = lvl >= u.max;
    const cost = upgCost(k);
    const canBuy = !maxed && coins >= cost;

    const div = document.createElement('div');
    div.className = 'upg-item' + (maxed?' maxed':'');

    const stars = Array.from({length:u.max},(_,i)=>`<div class="star${i<lvl?' on':''}"></div>`).join('');

    div.innerHTML = `
      <div class="upg-icon">${u.icon}</div>
      <div class="grow">
        <div class="upg-name">${u.label} <span style="color:rgba(255,255,255,.35);font-size:10px">${lvl}/${u.max}</span></div>
        <div class="upg-desc">${u.desc}</div>
        <div class="upg-stars">${stars}</div>
      </div>
      <button class="upg-btn${maxed?' maxed':''}" data-upg="${k}" ${canBuy?'':' disabled'}>
        ${maxed ? '✅' : `⬆️ ${cost}💰`}
      </button>`;
    list.appendChild(div);
  });

  list.querySelectorAll('[data-upg]').forEach(btn => {
    btn.addEventListener('click', ()=>{
      const k = btn.dataset.upg;
      const cost = upgCost(k);
      if(coins < cost || (upgrades[k]||0) >= UPGRADES[k].max) return;
      coins -= cost; upgrades[k] = (upgrades[k]||0)+1;
      invalidateBonus();
      addShipXP(cost * 3); // каждая покупка даёт XP кораблю
      savePersistent();
      renderUpgradeScreen();
    });
  });
}
// ── СБРОС ПРОГРЕССА ──
function resetAllProgress(){
  coins = 0; shipXP = 0; shipLvl = 1;
  skillPoints = 0; skillLevels = {};
  Object.keys(upgrades).forEach(k => upgrades[k] = 0);
  invalidateBonus();
  bestScore = 0;
  unlockedAch = [];
  activeSkin = 'default';
  const keys = ['upgrades','coins','shipXP','shipLvl','bestScore','achievements','activeSkin','totalKills','totalBosses','maxComboEver','leaderboard','skillPoints','skillLevels'];
  keys.forEach(k => { try{ localStorage.removeItem(k); }catch(e){} });
  savePersistent();
  renderXPBar();
  renderUpgradeScreen();
  document.getElementById('resetConfirm').classList.remove('show');
}

document.getElementById('resetProgressBtn').addEventListener('click',()=>{
  document.getElementById('resetConfirm').classList.add('show');
});
document.getElementById('resetCancelBtn').addEventListener('click',()=>{
  document.getElementById('resetConfirm').classList.remove('show');
});
document.getElementById('resetConfirmBtn').addEventListener('click', resetAllProgress);

// ════════════════════════════════════════════════════
// LEADERBOARD
// ════════════════════════════════════════════════════
let bestScore = +LS.get('bestScore', 0);

async function loadLeaderboard(){
  const content = document.getElementById('lbContent');
  content.innerHTML = '<div class="lb-loading">⏳ ЗАГРУЗКА...</div>';
  const myName = tg?.initDataUnsafe?.user?.first_name || 'Игрок';
  const myId   = tg?.initDataUnsafe?.user?.id || 0;
  let entries = LS.getJ('leaderboard', []);
  if(bestScore > 0){
    entries = entries.filter(e => e.id !== myId);
    entries.push({id:myId, name:myName, score:bestScore, lvl:shipLvl});
    entries.sort((a,b)=>b.score-a.score);
    entries = entries.slice(0,20);
    LS.setJ('leaderboard', entries);
  }
  const medals = ['🥇','🥈','🥉'];
  content.innerHTML = entries.length
    ? entries.map((e,i)=>`
      <div class="lb-row ${e.id===myId?'me':''}">
        <div class="lb-rank">${medals[i]||'#'+(i+1)}</div>
        <div class="lb-info">
          <div class="lb-name">${e.name}${e.id===myId?' 👈':''}</div>
          <div class="lb-sub">Корабль ур.${e.lvl||1}</div>
        </div>
        <div class="lb-score">${e.score.toLocaleString()}</div>
      </div>`).join('')
    : '<div class="lb-loading">Пока нет записей. Сыграйте первым! 🚀</div>';
}

// ════════════════════════════════════════════════════
// SKINS
// ════════════════════════════════════════════════════
let unlockedAch = LS.getJ('achievements', []);
const ACHIEVEMENTS = [
  {id:'first_kill', name:'Первая кровь 🔫'},
  {id:'combo5',     name:'Комбо мастер ⚡'},
  {id:'combo10',    name:'Легенда комбо 🌟'},
  {id:'boss1',      name:'Убийца боссов 💀'},
  {id:'score1000',  name:'Тысячник 🎯'},
  {id:'score5000',  name:'Пять тысяч 🏆'},
  {id:'shield',     name:'Неуязвимый 🛡️'},
  {id:'survive5',   name:'Выживший 💪'},
];

const SKINS = [
  {id:'default', name:'СТАНДАРТ',  emoji:'🚀', req:'Начальный',     cond:()=>true},
  {id:'fire',    name:'ОГНЕННЫЙ',  emoji:'🔥', req:'50 убийств',    cond:()=>+LS.get('totalKills',0)>=50},
  {id:'ice',     name:'ЛЕДЯНОЙ',   emoji:'❄️', req:'Корабль ур.10', cond:()=>shipLvl>=10},
  {id:'ghost',   name:'ПРИЗРАК',   emoji:'👻', req:'3 босса',       cond:()=>+LS.get('totalBosses',0)>=3},
  {id:'gold',    name:'ЗОЛОТОЙ',   emoji:'⭐', req:'1000+ монет',   cond:()=>coins>=1000},
  {id:'dragon',  name:'ДРАКОН',    emoji:'🐉', req:'Комбо x15',     cond:()=>+LS.get('maxComboEver',0)>=15},
  {id:'alien',   name:'ПРИШЕЛЕЦ',  emoji:'👾', req:'5 боссов',      cond:()=>+LS.get('totalBosses',0)>=5},
  {id:'rainbow', name:'РАДУГА',    emoji:'🌈', req:'Все достижения', cond:()=>unlockedAch.length>=ACHIEVEMENTS.length},
];
const SKIN_COLORS = {
  default:{a:'#00ff88',b:'#00d4ff',trail:'#00ff8866',glow:'#00ff88'},
  fire:   {a:'#ff6b00',b:'#ff0000',trail:'#ff6b0066',glow:'#ff6b00'},
  ice:    {a:'#00d4ff',b:'#a0f0ff',trail:'#00d4ff66',glow:'#00d4ff'},
  ghost:  {a:'#ccccff',b:'#8888ff',trail:'#ccccff44',glow:'#ccccff'},
  gold:   {a:'#ffd700',b:'#ff9900',trail:'#ffd70066',glow:'#ffd700'},
  dragon: {a:'#a855f7',b:'#ec4899',trail:'#a855f766',glow:'#a855f7'},
  alien:  {a:'#00ff00',b:'#44ff44',trail:'#00ff0066',glow:'#00ff00'},
  rainbow:{a:'#ff0088',b:'#00ffff',trail:'#ff008866',glow:'#ff88ff'},
};
let activeSkin = LS.get('activeSkin','default');

function renderSkinScreen(){
  const grid = document.getElementById('skinGrid');
  grid.innerHTML = '';
  SKINS.forEach(skin => {
    const ok = skin.cond(), isActive = activeSkin === skin.id;
    const div = document.createElement('div');
    div.className = `skin-item ${ok?'ok':''} ${isActive?'active':''} ${!ok?'locked':''}`;
    div.innerHTML = `
      ${isActive ? '<div class="skin-active-badge">✓ АКТИВЕН</div>' : ''}
      <div class="skin-icon">${skin.emoji}</div>
      <div class="skin-name">${skin.name}</div>
      <div class="${ok?'skin-unlocked':'skin-req'}">${ok?'✅ Разблокирован':skin.req}</div>`;
    if(ok) div.addEventListener('click',()=>{ activeSkin=skin.id; LS.set('activeSkin',activeSkin); renderSkinScreen(); });
    grid.appendChild(div);
  });
}

// ════════════════════════════════════════════════════
// CUSTOMIZATION
// ════════════════════════════════════════════════════
const SHIP_COLORS = {
  green:  {a:'#00ff88',b:'#00d4ff'}, blue:   {a:'#00d4ff',b:'#0080ff'}, purple:{a:'#a855f7',b:'#ec4899'},
  orange: {a:'#ff6b00',b:'#ff9900'}, red:    {a:'#ff0066',b:'#ff3366'}, yellow:{a:'#ffd700',b:'#ffed4e'},
  teal:   {a:'#00ffcc',b:'#00b4aa'}, white:  {a:'#e0e8ff',b:'#a0b0ff'}, lime:  {a:'#aaff00',b:'#66ff00'},
  rose:   {a:'#ff4488',b:'#ff88bb'}, indigo: {a:'#6644ff',b:'#44aaff'}, gold:  {a:'#ffd700',b:'#ff8800'},
};
const BULLET_COLORS = {
  yellow:{a:'#ffff00',b:'#ff9900'}, cyan:  {a:'#00ffff',b:'#00d4ff'}, pink:   {a:'#ff69b4',b:'#ff1493'},
  green: {a:'#00ff88',b:'#00ff00'}, white: {a:'#ffffff',b:'#cccccc'}, purple: {a:'#a855f7',b:'#8b5cf6'},
  orange:{a:'#ff8800',b:'#ff4400'}, red:   {a:'#ff2244',b:'#ff0000'}, lime:   {a:'#aaff00',b:'#88ff00'},
  teal:  {a:'#00ffcc',b:'#00aaaa'},
};

// Trail styles
const TRAIL_STYLES = {
  fire:    {name:'🔥 ОГОНЬ',    colors:['#ff6b00','#ff2200','#ffaa00']},
  ice:     {name:'❄️ ЛЁД',     colors:['#00d4ff','#88eeff','#0066ff']},
  plasma:  {name:'⚡ ПЛАЗМА',   colors:['#a855f7','#ec4899','#ff00ff']},
  green:   {name:'☢️ ЯДЕРНЫЙ', colors:['#00ff88','#aaff00','#00ffcc']},
  gold:    {name:'✨ ЗОЛОТО',   colors:['#ffd700','#ffaa00','#ffffaa']},
  red:     {name:'💥 КРОВИ',    colors:['#ff0066','#ff3300','#ff8866']},
};

let custom = {
  shipShape:   LS.get('shipShape',  'fighter'),
  shipColor:   LS.get('shipColor',  'green'),
  bulletColor: LS.get('bulletColor','yellow'),
  trailStyle:  LS.get('trailStyle', 'fire'),
  particles:   LS.get('particles',  'true') !== 'false',
  glow:        LS.get('glow',       'true') !== 'false',
  selectedWeapons: LS.getJ('selectedWeapons', ['laser','rocket','shotgun']),
};

function loadCustomUI(){
  document.querySelectorAll('[data-ship-shape]').forEach(e=>e.classList.toggle('sel',e.dataset.shipShape===custom.shipShape));
  document.querySelectorAll('[data-ship-color]').forEach(e=>e.classList.toggle('sel',e.dataset.shipColor===custom.shipColor));
  document.querySelectorAll('[data-bullet-color]').forEach(e=>e.classList.toggle('sel',e.dataset.bulletColor===custom.bulletColor));
  document.querySelectorAll('[data-trail-style]').forEach(e=>e.classList.toggle('sel',e.dataset.trailStyle===custom.trailStyle));
  document.getElementById('particlesChk').checked = custom.particles;
  document.getElementById('glowChk').checked = custom.glow;
  renderWeaponSelectGrid();
  renderShipPreview();
}

function renderWeaponSelectGrid(){
  const grid = document.getElementById('weaponSelectGrid');
  if(!grid) return;
  grid.innerHTML = '';
  const ALL_WEAPONS_DEF = [
    {id:'laser',     emoji:'🔵', name:'ЛАЗЕР',  desc:'Быстрый луч'},
    {id:'rocket',    emoji:'🚀', name:'РАКЕТА',  desc:'Наводящаяся'},
    {id:'shotgun',   emoji:'💥', name:'ДРОБЬ',   desc:'Широкий залп'},
    {id:'plasma',    emoji:'🟣', name:'ПЛАЗМА',  desc:'Жирный шар'},
    {id:'lightning', emoji:'⚡', name:'МОЛНИЯ',  desc:'Цепная'},
    {id:'rail',      emoji:'🔮', name:'РЕЛЬСА',  desc:'Сквозная'},
  ];
  ALL_WEAPONS_DEF.forEach(w=>{
    const sel = custom.selectedWeapons.includes(w.id);
    const div = document.createElement('div');
    div.className = 'wpn-sel-opt' + (sel?' sel':'');
    div.dataset.weaponId = w.id;
    div.innerHTML = `<span class="wpn-sel-ico">${w.emoji}</span><div class="wpn-sel-name">${w.name}</div><div class="wpn-sel-desc">${w.desc}</div><div class="wpn-sel-badge">${custom.selectedWeapons.indexOf(w.id)+1||''}</div>`;
    div.addEventListener('click',()=>{
      const idx = custom.selectedWeapons.indexOf(w.id);
      if(idx>=0){
        // deselect only if more than 1 selected
        if(custom.selectedWeapons.length>1) custom.selectedWeapons.splice(idx,1);
      } else {
        if(custom.selectedWeapons.length>=3){
          custom.selectedWeapons.shift(); // remove oldest
        }
        custom.selectedWeapons.push(w.id);
      }
      renderWeaponSelectGrid();
    });
    grid.appendChild(div);
  });
}
function saveCustom(){
  custom.particles = document.getElementById('particlesChk').checked;
  custom.glow      = document.getElementById('glowChk').checked;
  LS.set('shipShape',   custom.shipShape);
  LS.set('shipColor',   custom.shipColor);
  LS.set('bulletColor', custom.bulletColor);
  LS.set('trailStyle',  custom.trailStyle);
  LS.set('particles',   custom.particles);
  LS.set('glow',        custom.glow);
  LS.setJ('selectedWeapons', custom.selectedWeapons);
  buildWeaponBar();
  // Stop preview loop and refresh menu ship
  if(previewRAF){ cancelAnimationFrame(previewRAF); previewRAF=null; }
  initMenuShip();
}

[['data-ship-shape','shipShape'],['data-ship-color','shipColor'],['data-bullet-color','bulletColor'],['data-trail-style','trailStyle']].forEach(([attr,key])=>{
  document.querySelectorAll(`[${attr}]`).forEach(el=>{
    el.addEventListener('click',function(){
      document.querySelectorAll(`[${attr}]`).forEach(e=>e.classList.remove('sel'));
      this.classList.add('sel');
      custom[key] = this.getAttribute(attr);
      renderShipPreview(); // live preview update
    });
  });
});

// ── SHIP PREVIEW IN CUSTOMIZATION ──
// ════════════════════════════════════════════════════
// UNIFIED SHIP DRAWING — used in-game, preview, and menu
// cx/cy = center, hw/hh = half-width/half-height
// ════════════════════════════════════════════════════
function drawShipPath(c, shape, cx, cy, hw, hh){
  c.beginPath();
  const x=cx, y=cy, w=hw, h=hh;
  switch(shape){
    case 'fighter': // Classic fighter
      c.moveTo(x,     y-h);
      c.lineTo(x-w,   y+h);
      c.lineTo(x,     y+h*0.45);
      c.lineTo(x+w,   y+h);
      break;
    case 'arrow':   // Arrow wings
      c.moveTo(x,       y-h);
      c.lineTo(x-w*0.33,y+h*0.33);
      c.lineTo(x-w,     y+h);
      c.lineTo(x,       y+h*0.15);
      c.lineTo(x+w,     y+h);
      c.lineTo(x+w*0.33,y+h*0.33);
      break;
    case 'diamond': // Diamond / Kite
      c.moveTo(x,   y-h);
      c.lineTo(x-w, y);
      c.lineTo(x,   y+h);
      c.lineTo(x+w, y);
      break;
    case 'hawk':    // Swept-back hawk
      c.moveTo(x,     y-h);
      c.lineTo(x-w*0.2, y-h*0.1);
      c.lineTo(x-w,   y+h*0.7);
      c.lineTo(x-w*0.35, y+h*0.1);
      c.lineTo(x,     y+h);
      c.lineTo(x+w*0.35, y+h*0.1);
      c.lineTo(x+w,   y+h*0.7);
      c.lineTo(x+w*0.2, y-h*0.1);
      break;
    case 'delta':   // Delta / stealth bomber
      c.moveTo(x,   y-h);
      c.lineTo(x-w, y+h);
      c.lineTo(x-w*0.15, y+h*0.5);
      c.lineTo(x+w*0.15, y+h*0.5);
      c.lineTo(x+w, y+h);
      break;
    case 'blade':   // Thin blade / razor
      c.moveTo(x,       y-h);
      c.lineTo(x-w*0.12,y+h*0.2);
      c.lineTo(x-w,     y+h);
      c.lineTo(x-w*0.07,y+h*0.55);
      c.lineTo(x,       y+h*0.7);
      c.lineTo(x+w*0.07,y+h*0.55);
      c.lineTo(x+w,     y+h);
      c.lineTo(x+w*0.12,y+h*0.2);
      break;
    case 'hornet':  // Hornet — wide wings low
      c.moveTo(x,     y-h);
      c.lineTo(x-w*0.25, y+h*0.05);
      c.lineTo(x-w,   y+h*0.35);
      c.lineTo(x-w*0.6, y+h);
      c.lineTo(x,     y+h*0.6);
      c.lineTo(x+w*0.6, y+h);
      c.lineTo(x+w,   y+h*0.35);
      c.lineTo(x+w*0.25, y+h*0.05);
      break;
    case 'viper':   // Viper / narrow nose
      c.moveTo(x,     y-h);
      c.lineTo(x-w*0.08, y+h*0.3);
      c.lineTo(x-w,   y+h*0.5);
      c.lineTo(x-w*0.55, y+h);
      c.lineTo(x,     y+h*0.75);
      c.lineTo(x+w*0.55, y+h);
      c.lineTo(x+w,   y+h*0.5);
      c.lineTo(x+w*0.08, y+h*0.3);
      break;
    case 'phoenix': // Phoenix — curved wing tips
      c.moveTo(x,     y-h);
      c.quadraticCurveTo(x-w*0.15, y, x-w*0.3, y+h*0.2);
      c.lineTo(x-w,   y+h*0.1);
      c.lineTo(x-w*0.5, y+h);
      c.lineTo(x,     y+h*0.6);
      c.lineTo(x+w*0.5, y+h);
      c.lineTo(x+w,   y+h*0.1);
      c.quadraticCurveTo(x+w*0.15, y, x+w*0.3, y+h*0.2);
      break;
    default: // fallback = fighter
      c.moveTo(x, y-h); c.lineTo(x-w, y+h); c.lineTo(x, y+h*0.45); c.lineTo(x+w, y+h);
  }
  c.closePath();
}

let previewT = 0, previewRAF = null;
function renderShipPreview(){
  const pc = document.getElementById('shipPreviewCanvas');
  if(!pc) return;
  const pctx = pc.getContext('2d');
  if(previewRAF) cancelAnimationFrame(previewRAF);

  const W = 130, H = 130;
  const cx = W/2, cy = H/2 + 4;
  const hw = 28, hh = 30;

  function draw(){
    previewT += 0.04;
    const colors = SHIP_COLORS[custom.shipColor] || SHIP_COLORS.green;
    const trail = TRAIL_STYLES[custom.trailStyle] || TRAIL_STYLES.fire;
    const shape = custom.shipShape || 'fighter';

    pctx.clearRect(0,0,W,H);
    // BG
    pctx.fillStyle = '#04040f';
    pctx.fillRect(0,0,W,H);
    // Stars
    [[20,15],[100,20],[55,100],[110,80],[15,70],[90,55],[40,40],[115,115]].forEach(([sx,sy])=>{
      const b = 0.4+0.4*Math.sin(previewT*1.8+sx);
      pctx.fillStyle=`rgba(255,255,255,${b*0.7})`;
      pctx.fillRect(sx,sy,1.5,1.5);
    });

    // Engine flame — exactly like in-game: triangle below ship
    const flameH = 14 + Math.random()*10;
    const flame = pctx.createLinearGradient(cx, cy+hh, cx, cy+hh+flameH);
    flame.addColorStop(0, colors.a+'cc'); flame.addColorStop(1, 'transparent');
    pctx.fillStyle = flame;
    pctx.shadowBlur = 0;
    pctx.beginPath();
    pctx.moveTo(cx-9, cy+hh);
    pctx.lineTo(cx+9, cy+hh);
    pctx.lineTo(cx, cy+hh+flameH);
    pctx.closePath(); pctx.fill();

    // Trail particles behind engine
    for(let i=0;i<3;i++){
      const tc = trail.colors[i % trail.colors.length];
      const ty = cy+hh+8+i*10+Math.sin(previewT*4+i)*4;
      const talpha = (0.6-i*0.15);
      pctx.fillStyle = tc + Math.floor(talpha*255).toString(16).padStart(2,'0');
      pctx.beginPath(); pctx.arc(cx+(Math.random()-.5)*6, ty, 3-i*.5, 0, Math.PI*2); pctx.fill();
    }

    // Ship glow
    pctx.save();
    pctx.shadowBlur = 20 + 8*Math.sin(previewT);
    pctx.shadowColor = colors.a;

    // Gradient same as in-game
    const sg = pctx.createLinearGradient(cx-hw, cy-hh, cx+hw, cy+hh);
    sg.addColorStop(0, colors.a); sg.addColorStop(1, colors.b);
    pctx.fillStyle = sg;

    drawShipPath(pctx, shape, cx, cy, hw, hh);
    pctx.fill();

    // Cockpit highlight
    pctx.shadowBlur = 6;
    pctx.shadowColor = '#ffffff';
    pctx.fillStyle = '#ffffff33';
    pctx.beginPath(); pctx.ellipse(cx, cy-hh*0.35, hw*0.18, hh*0.22, 0, 0, Math.PI*2); pctx.fill();

    // Wing accent lines
    pctx.shadowBlur = 0;
    pctx.strokeStyle = colors.a+'66'; pctx.lineWidth = 1;
    pctx.stroke();

    // Engine dot
    pctx.shadowBlur = 14; pctx.shadowColor = colors.b;
    pctx.fillStyle = colors.b;
    pctx.beginPath(); pctx.arc(cx, cy+hh*0.6, 3.5+1.5*Math.sin(previewT*2), 0, Math.PI*2); pctx.fill();
    pctx.restore();

    previewRAF = requestAnimationFrame(draw);
  }
  pc.width = 130; pc.height = 130;
  draw();
}


// ════════════════════════════════════════════════════
// DIFFICULTY CONFIG
// ════════════════════════════════════════════════════
const DIFF = {
  easy:      {lives:6, spd:.55, spawn:.010, scoreMult:1,   bossHpMult:.5,  powerupRate:.012},
  normal:    {lives:4, spd:.80, spawn:.014, scoreMult:1.5, bossHpMult:.8,  powerupRate:.006},
  hard:      {lives:2, spd:1.2, spawn:.020, scoreMult:2,   bossHpMult:1.1, powerupRate:.003},
  nightmare: {lives:1, spd:1.7, spawn:.028, scoreMult:3,   bossHpMult:1.6, powerupRate:0}
};

// ════════════════════════════════════════════════════
// SCREEN MANAGER
// ════════════════════════════════════════════════════
const SCREENS = ['difficultyScreen','gameOverScreen','upgradeScreen','lbScreen','customScreen','skinScreen','skillScreen','settingsScreen','suggestScreen'];
function showScreen(id){
  SCREENS.forEach(s=>{ const el=document.getElementById(s); if(el) el.style.display = s===id ? 'flex' : 'none'; });
  // Disable canvas touch/click when any menu screen is shown
  const inMenu = id !== 'gameRunning';
  const cv = document.getElementById('gameCanvas');
  if(cv) cv.style.pointerEvents = (id === null || id === 'gameRunning') ? 'all' : 'none';
}
function hideAllScreens(){ SCREENS.forEach(s=>{ const el=document.getElementById(s); if(el) el.style.display='none'; }); }
showScreen('difficultyScreen');

// Запускаем меню-музыку при первом касании (AudioContext требует user gesture)
let _menuMusicStarted = false;
function _tryStartMenuMusic(){
  if(_menuMusicStarted) return;
  _menuMusicStarted = true;
  Music.play('menu');
}
document.addEventListener('click',      _tryStartMenuMusic, { once: true });
document.addEventListener('touchstart', _tryStartMenuMusic, { once: true });

// Update best score badge in menu
function updateMenuBadge(){
  const el = document.getElementById('menuBestScore');
  if(el) el.textContent = bestScore.toLocaleString();
}
updateMenuBadge();

// Render animated ship on main menu canvas
let menuShipRAF = null;
function initMenuShip(){
  const mc = document.getElementById('menuShipCanvas');
  if(!mc) return;
  const mctx = mc.getContext('2d');
  let mT = 0;
  function drawMenuShip(){
    const sc = SKIN_COLORS[activeSkin] || SKIN_COLORS.default;
    const shipC = SHIP_COLORS[custom.shipColor] || {a:sc.a, b:sc.b};
    const cx = 30, cy = 28, hw = 13, hh = 14;
    mctx.clearRect(0,0,60,60);
    mT += 0.04;
    // Engine flame
    const flameH = 8 + Math.random()*5;
    const flame = mctx.createLinearGradient(cx, cy+hh, cx, cy+hh+flameH);
    flame.addColorStop(0, shipC.a+'cc'); flame.addColorStop(1, 'transparent');
    mctx.fillStyle = flame; mctx.shadowBlur = 0;
    mctx.beginPath();
    mctx.moveTo(cx-5, cy+hh); mctx.lineTo(cx+5, cy+hh); mctx.lineTo(cx, cy+hh+flameH);
    mctx.closePath(); mctx.fill();
    // Ship
    mctx.save();
    mctx.shadowBlur = 14 + 5*Math.sin(mT);
    mctx.shadowColor = shipC.a;
    const sg = mctx.createLinearGradient(cx-hw, cy-hh, cx+hw, cy+hh);
    sg.addColorStop(0, shipC.a); sg.addColorStop(1, shipC.b);
    mctx.fillStyle = sg;
    drawShipPath(mctx, custom.shipShape||'fighter', cx, cy, hw, hh);
    mctx.fill();
    mctx.restore();
    menuShipRAF = requestAnimationFrame(drawMenuShip);
  }
  if(menuShipRAF) cancelAnimationFrame(menuShipRAF);
  drawMenuShip();
}
initMenuShip();

// ════════════════════════════════════════════════════
// STARFIELD BACKGROUND FOR MAIN MENU
// ════════════════════════════════════════════════════
(function initStarfield(){
  const sc = document.getElementById('starfieldCanvas');
  if(!sc) return;
  const sctx = sc.getContext('2d');
  const NUM_STARS = 180;
  const NUM_METEORS = 4;
  let stars = [], meteors = [], sfRAF;

  function resizeSF(){
    sc.width  = sc.offsetWidth  || window.innerWidth;
    sc.height = sc.offsetHeight || window.innerHeight;
    stars = Array.from({length:NUM_STARS},()=>({
      x:Math.random()*sc.width, y:Math.random()*sc.height,
      r:Math.random()*1.5+0.3,
      alpha:Math.random()*0.7+0.3,
      twinkleSpeed:Math.random()*0.02+0.008,
      twinkleOffset:Math.random()*Math.PI*2,
      speed:Math.random()*0.18+0.04,
    }));
    meteors = Array.from({length:NUM_METEORS},()=>newMeteor(sc));
  }

  function newMeteor(sc){
    return {
      x:Math.random()*sc.width, y:-30,
      len:Math.random()*90+50,
      speed:Math.random()*2.5+1.5,
      alpha:Math.random()*0.6+0.3,
      active:false,
      delay:Math.random()*6000+1000,
      delayLeft:Math.random()*6000+1000,
    };
  }

  let lastSF = performance.now();
  function drawStarfield(now){
    const dt = now - lastSF; lastSF = now;
    const W = sc.width, H = sc.height;
    sctx.clearRect(0,0,W,H);

    // Background gradient
    const bg = sctx.createLinearGradient(0,0,0,H);
    bg.addColorStop(0,'#04040f'); bg.addColorStop(0.5,'#060818'); bg.addColorStop(1,'#04040f');
    sctx.fillStyle = bg; sctx.fillRect(0,0,W,H);

    // Nebula glow blobs
    const nebs=[{x:W*0.2,y:H*0.3,r:180,c:'rgba(0,80,180,0.06)'},{x:W*0.75,y:H*0.65,r:220,c:'rgba(80,0,160,0.05)'},{x:W*0.5,y:H*0.1,r:130,c:'rgba(0,200,120,0.04)'}];
    nebs.forEach(n=>{ const g=sctx.createRadialGradient(n.x,n.y,0,n.x,n.y,n.r); g.addColorStop(0,n.c); g.addColorStop(1,'transparent'); sctx.fillStyle=g; sctx.fillRect(0,0,W,H); });

    // Stars
    const t = now * 0.001;
    stars.forEach(s=>{
      s.y += s.speed * dt * 0.016;
      if(s.y > H+5){ s.y=-5; s.x=Math.random()*W; }
      const twinkle = 0.5 + 0.5*Math.sin(t*s.twinkleSpeed*60 + s.twinkleOffset);
      const a = s.alpha * (0.4 + 0.6*twinkle);
      sctx.beginPath();
      sctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
      sctx.fillStyle = `rgba(${180+75*twinkle|0},${180+75*twinkle|0},255,${a})`;
      sctx.fill();
    });

    // Meteors
    meteors.forEach(m=>{
      if(!m.active){
        m.delayLeft -= dt;
        if(m.delayLeft<=0){ m.active=true; m.x=Math.random()*W; m.y=-30; }
        return;
      }
      m.y += m.speed * dt * 0.16;
      const endX = m.x + m.len*0.35, endY = m.y + m.len;
      const mg = sctx.createLinearGradient(m.x,m.y,endX,endY);
      mg.addColorStop(0,`rgba(255,255,255,${m.alpha})`);
      mg.addColorStop(1,'rgba(255,255,255,0)');
      sctx.save();
      sctx.strokeStyle = mg; sctx.lineWidth = 1.5;
      sctx.shadowBlur = 8; sctx.shadowColor = 'rgba(180,220,255,0.8)';
      sctx.beginPath(); sctx.moveTo(m.x,m.y); sctx.lineTo(endX,endY); sctx.stroke();
      sctx.restore();
      if(m.y > H+m.len){ Object.assign(m, newMeteor(sc)); m.active=false; }
    });

    sfRAF = requestAnimationFrame(drawStarfield);
  }

  // Start/stop with menu visibility
  const diffScreen = document.getElementById('difficultyScreen');
  const observer = new MutationObserver(()=>{
    const visible = diffScreen.style.display !== 'none';
    if(visible && !sfRAF){ resizeSF(); sfRAF = requestAnimationFrame(drawStarfield); }
    else if(!visible && sfRAF){ cancelAnimationFrame(sfRAF); sfRAF=null; }
  });
  observer.observe(diffScreen,{attributes:true,attributeFilter:['style']});

  window.addEventListener('resize',()=>{ if(sfRAF) resizeSF(); });
  resizeSF();
  sfRAF = requestAnimationFrame(drawStarfield);
})();



// NAVIGATION
// ════════════════════════════════════════════════════
let difficulty = null;
let autoShoot  = LS.get('autoShoot','true') !== 'false';

document.querySelectorAll('[data-diff]').forEach(c=>{
  c.addEventListener('click',function(){
    document.querySelectorAll('[data-diff]').forEach(x=>x.classList.remove('selected'));
    this.classList.add('selected');
    difficulty = this.dataset.diff;
    document.getElementById('startBtn').disabled = false;
  });
});

document.getElementById('startBtn').addEventListener('click',()=>{
  if(!difficulty) return;
  // Интро показывается при каждом запуске
  hideAllScreens();
  if(window.IntroAnimation){
    IntroAnimation.show(()=>{ startGame(); });
  } else {
    startGame();
  }
});

document.getElementById('restartBtn').addEventListener('click',()=>{ hideAllScreens(); startGame(); });
// ════════════════════════════════════════════════════
// SETTINGS — громкость и стиль музыки
// ════════════════════════════════════════════════════
const Settings = {
  musicVol: +LS.get('musicVol', 70),
  sfxVol:   +LS.get('sfxVol', 80),
  musicStyle: LS.get('musicStyle', 'chiptune'),

  save(){
    LS.set('musicVol', this.musicVol);
    LS.set('sfxVol', this.sfxVol);
    LS.set('musicStyle', this.musicStyle);
  },

  applyMusicVol(){
    if(Music._masterGain){
      try{
        const targetVol = (this.musicVol / 100) * (Music._mode === 'game' ? 0.22 : 0.18);
        Music._masterGain.gain.setTargetAtTime(targetVol, getAC().currentTime, 0.1);
      }catch(e){}
    }
  },

  getSfxGain(){
    return this.sfxVol / 100;
  }
};

// SFX volume applied via Settings.getSfxGain() inside playSound directly

// Стили музыки для игры
const MUSIC_STYLES = {
  chiptune: {
    name: 'Чипчюн',
    buildGame(ac, out, Music){
      // Оригинальный chiptune — используем _buildGame напрямую
      Music._buildGame_chiptune(ac, out);
    }
  },
  synthwave: {
    name: 'Синтвейв',
    buildGame(ac, out, Music){
      Music._buildGame_synthwave(ac, out);
    }
  },
  ambient: {
    name: 'Эмбиент',
    buildGame(ac, out, Music){
      Music._buildGame_ambient(ac, out);
    }
  }
};

// Сохраняем оригинальный buildGame как chiptune
Music._buildGame_chiptune = Music._buildGame.bind(Music);

// Синтвейв стиль
Music._buildGame_synthwave = function(ac, out){
  const BPM = 110;
  const beat = 60 / BPM;

  // Синтвейв бас — пульсирующий
  const bassSeq = [55, 55, 65.41, 73.42, 55, 55, 61.74, 65.41];
  let bi = 0;
  const playBass = () => {
    if(!this._running || this._mode !== 'game') return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    const filt = ac.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 400;
    o.type = 'sawtooth'; o.frequency.value = bassSeq[bi % bassSeq.length];
    const now = ac.currentTime;
    g.gain.setValueAtTime(0.06, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + beat * 0.9);
    o.connect(filt); filt.connect(g); g.connect(out);
    o.start(now); o.stop(now + beat);
    this._nodes.push(o, g, filt);
    bi++;
    setTimeout(playBass, beat * 1000);
  };
  playBass();

  // Синтвейв пэд
  [110, 138.59, 164.81, 220].forEach((f, i) => {
    const o = ac.createOscillator();
    const g = ac.createGain();
    const lfo = ac.createOscillator();
    const lg = ac.createGain();
    o.type = 'sawtooth'; o.frequency.value = f;
    lfo.frequency.value = 0.15 + i * 0.04;
    lg.gain.value = 3;
    lfo.connect(lg); lg.connect(o.frequency);
    g.gain.value = 0.018;
    o.connect(g); g.connect(out);
    o.start(); lfo.start();
    this._nodes.push(o, g, lfo, lg);
  });

  // Мелодия — синтвейв арпеджио
  const swArp = [440, 493.88, 523.25, 587.33, 659.25, 587.33, 523.25, 493.88];
  let si = 0;
  const playSwArp = () => {
    if(!this._running || this._mode !== 'game') return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'sine'; o.frequency.value = swArp[si % swArp.length];
    const now = ac.currentTime;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.025, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + beat * 0.7);
    o.connect(g); g.connect(out);
    o.start(now); o.stop(now + beat);
    this._nodes.push(o, g);
    si++;
    setTimeout(playSwArp, beat * 500);
  };
  setTimeout(playSwArp, 300);

  // Барабаны — синтвейв
  const playSwKick = () => {
    if(!this._running || this._mode !== 'game') return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    const now = ac.currentTime;
    o.type = 'sine'; o.frequency.setValueAtTime(180, now);
    o.frequency.exponentialRampToValueAtTime(40, now + 0.18);
    g.gain.setValueAtTime(0.12, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    o.connect(g); g.connect(out);
    o.start(now); o.stop(now + 0.25);
    this._nodes.push(o, g);
    setTimeout(playSwKick, beat * 2 * 1000);
  };
  playSwKick();
}.bind(Music);

// Эмбиент стиль
Music._buildGame_ambient = function(ac, out){
  // Глубокий дрон — расширенный
  [40, 60, 80, 120].forEach((f, i) => {
    const o = ac.createOscillator();
    const g = ac.createGain();
    const lfo = ac.createOscillator();
    const lg = ac.createGain();
    o.type = i % 2 === 0 ? 'sine' : 'triangle';
    o.frequency.value = f;
    lfo.frequency.value = 0.05 + i * 0.02;
    lg.gain.value = 2;
    lfo.connect(lg); lg.connect(o.frequency);
    g.gain.value = 0.03 - i * 0.005;
    o.connect(g); g.connect(out);
    o.start(); lfo.start();
    this._nodes.push(o, g, lfo, lg);
  });

  // Медленные аккорды
  const ambChords = [
    [130.81, 164.81, 196],
    [110, 138.59, 174.61],
    [146.83, 184.99, 220],
    [123.47, 155.56, 185],
  ];
  let aci = 0;
  const BAR = 5.0;
  const playAmbChord = () => {
    if(!this._running || this._mode !== 'game') return;
    ambChords[aci % ambChords.length].forEach(f => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const now = ac.currentTime;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.02, now + 1.5);
      g.gain.setValueAtTime(0.02, now + BAR - 1.5);
      g.gain.linearRampToValueAtTime(0, now + BAR);
      o.connect(g); g.connect(out);
      o.start(now); o.stop(now + BAR);
      this._nodes.push(o, g);
    });
    aci++;
    setTimeout(playAmbChord, BAR * 1000);
  };
  playAmbChord();

  // Редкие высокие ноты — как звёзды
  const starNotes = [880, 1046.5, 783.99, 987.77, 1174.66];
  const playStarNote = () => {
    if(!this._running || this._mode !== 'game') return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'sine';
    o.frequency.value = starNotes[Math.floor(Math.random() * starNotes.length)];
    const now = ac.currentTime;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.015, now + 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
    o.connect(g); g.connect(out);
    o.start(now); o.stop(now + 1.5);
    this._nodes.push(o, g);
    setTimeout(playStarNote, 1500 + Math.random() * 3000);
  };
  setTimeout(playStarNote, 2000);
}.bind(Music);

// Переопределяем _buildGame чтобы использовал выбранный стиль
Music._buildGame = function(ac, out){
  const style = Settings.musicStyle || 'chiptune';
  if(style === 'synthwave') this._buildGame_synthwave(ac, out);
  else if(style === 'ambient') this._buildGame_ambient(ac, out);
  else this._buildGame_chiptune(ac, out);
};

function initSettingsUI(){
  const musicSlider = document.getElementById('musicVolSlider');
  const sfxSlider   = document.getElementById('sfxVolSlider');
  const musicVal    = document.getElementById('musicVolVal');
  const sfxVal      = document.getElementById('sfxVolVal');
  if(!musicSlider) return;

  // Always sync displayed values to current settings
  musicSlider.value = Settings.musicVol;
  sfxSlider.value   = Settings.sfxVol;
  musicVal.textContent = Settings.musicVol + '%';
  sfxVal.textContent   = Settings.sfxVol + '%';
  document.querySelectorAll('.music-style-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.style === Settings.musicStyle);
  });

  // Add listeners only once
  if(musicSlider._initDone) return;
  musicSlider._initDone = true;

  musicSlider.addEventListener('input', () => {
    Settings.musicVol = +musicSlider.value;
    musicVal.textContent = Settings.musicVol + '%';
    Settings.save();
    Settings.applyMusicVol();
  });
  sfxSlider.addEventListener('input', () => {
    Settings.sfxVol = +sfxSlider.value;
    sfxVal.textContent = Settings.sfxVol + '%';
    Settings.save();
  });
  document.querySelectorAll('.music-style-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.music-style-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      Settings.musicStyle = btn.dataset.style;
      Settings.save();
      if(Music._running && Music._mode === 'game') Music.play('game');
    });
  });
}


// ╔══════════════════════════════════════════════════════════════════╗
// ║  ADMIN / DEV MODE                                               ║
// ║  Чтобы полностью убрать режим — закомментируй этот блок:        ║
// ║    1. Весь код между /* ADMIN_MODE_START */ и /* ADMIN_MODE_END */║
// ║    2. Блок #adminModeBlock в index.html (помечен комментарием)   ║
// ╚══════════════════════════════════════════════════════════════════╝

/* ADMIN_MODE_START */
let adminModeActive = false;
let adminInterval   = null;

function activateAdminMode() {
  adminModeActive = !adminModeActive;

  const btn   = document.getElementById('adminModeBtn');
  const label = document.getElementById('adminStatusLabel');

  if (adminModeActive) {
    // ── Включаем ──
    btn.textContent   = '🟢 ВЫКЛЮЧИТЬ РЕЖИМ РАЗРАБОТЧИКА';
    btn.style.background    = 'rgba(0,255,136,.12)';
    btn.style.borderColor   = 'rgba(0,255,136,.4)';
    btn.style.color         = 'rgba(0,255,136,.9)';
    label.textContent       = 'ВКЛ';
    label.style.color       = 'var(--green)';

    // Сразу выдаём стартовый буст
    coins       += 999999;
    skillPoints += 99;
    // Прокачиваем корабль до высокого уровня
    if (shipLvl < 20) {
      shipXP  = 0;
      shipLvl = 20;
      savePersistent();
      renderXPBar();
    }
    savePersistent();
    notify('🔴 ADMIN MODE ON — ∞ монеты и навыки!', 'gold');

    // Каждые 5 сек подкидываем монеты чтобы не кончались
    adminInterval = setInterval(() => {
      if (!adminModeActive) { clearInterval(adminInterval); return; }
      if (coins < 10000) coins += 50000;
      if (skillPoints < 10) skillPoints += 10;
      savePersistent();
      // Обновляем экран прокачки если открыт
      const upg = document.getElementById('upgradeScreen');
      if (upg && upg.style.display !== 'none') renderUpgradeScreen();
    }, 5000);

  } else {
    // ── Выключаем ──
    clearInterval(adminInterval);
    adminInterval = null;
    btn.textContent         = '🔴 ВКЛЮЧИТЬ РЕЖИМ РАЗРАБОТЧИКА';
    btn.style.background    = 'rgba(255,0,102,.12)';
    btn.style.borderColor   = 'rgba(255,0,102,.35)';
    btn.style.color         = 'rgba(255,0,102,.8)';
    label.textContent       = 'ВЫКЛ';
    label.style.color       = 'rgba(255,0,102,.6)';
    notify('🔴 ADMIN MODE OFF', 'gold');
  }
}
/* ADMIN_MODE_END */

// ════════════════════════════════════════════════════
// SUGGEST — отправка предложений через Telegram WebApp
// ════════════════════════════════════════════════════
function initSuggestUI(){
  const textarea  = document.getElementById('suggestText');
  const counter   = document.getElementById('suggestLen');
  const sendBtn   = document.getElementById('sendSuggestBtn');
  const statusEl  = document.getElementById('suggestStatus');

  if(!textarea) return;

  // Add listeners only once
  if(textarea._initDone) return;
  textarea._initDone = true;

  let selectedCat = 'gameplay';

  // Category buttons
  document.querySelectorAll('.suggest-cat').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.suggest-cat').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedCat = btn.dataset.cat;
    });
  });

  // Textarea counter + validation
  textarea.addEventListener('input', () => {
    const len = textarea.value.length;
    counter.textContent = len;
    sendBtn.disabled = len < 10;
  });

  // Send
  sendBtn.addEventListener('click', async () => {
    const text = textarea.value.trim();
    if(text.length < 10) return;

    sendBtn.disabled = true;
    sendBtn.textContent = '⏳ ОТПРАВКА...';
    statusEl.style.display = 'block';
    statusEl.className = 'suggest-status loading';
    statusEl.textContent = '📡 Отправляем предложение...';

    try {
      const tg = window.Telegram?.WebApp;
      const payload = JSON.stringify({
        type: 'suggestion',
        text: text,
        category: selectedCat
      });

      if(tg && tg.sendData){
        tg.sendData(payload);
        // После sendData WebApp закрывается у Telegram — показываем сразу успех
        statusEl.className = 'suggest-status success';
        statusEl.textContent = '✅ Предложение отправлено! Спасибо 🚀';
        textarea.value = '';
        counter.textContent = '0';
        sendBtn.textContent = '✅ ОТПРАВЛЕНО';
        setTimeout(() => {
          showScreen('difficultyScreen');
          sendBtn.textContent = '📤 ОТПРАВИТЬ';
          statusEl.style.display = 'none';
        }, 2000);
      } else {
        // Fallback: отправляем через API (для браузерной отладки)
        statusEl.className = 'suggest-status error';
        statusEl.textContent = '⚠️ Открой игру через Telegram для отправки!';
        sendBtn.disabled = false;
        sendBtn.textContent = '📤 ОТПРАВИТЬ';
      }
    } catch(e) {
      statusEl.className = 'suggest-status error';
      statusEl.textContent = '❌ Ошибка отправки. Попробуй ещё раз.';
      sendBtn.disabled = false;
      sendBtn.textContent = '📤 ОТПРАВИТЬ';
    }
  });
}

document.getElementById('menuBtn').addEventListener('click',()=>{ Music.play('menu'); showScreen('difficultyScreen'); });

document.getElementById('upgradeBtn').addEventListener('click',()=>{ renderUpgradeScreen(); showScreen('upgradeScreen'); });
document.getElementById('backFromUpgrade').addEventListener('click',()=>{ showScreen('difficultyScreen'); });

document.getElementById('lbBtn').addEventListener('click',()=>{ showScreen('lbScreen'); loadLeaderboard(); });
document.getElementById('backFromLb').addEventListener('click',()=>{ showScreen('difficultyScreen'); });

document.getElementById('customBtn').addEventListener('click',()=>{ loadCustomUI(); showScreen('customScreen'); });
document.getElementById('saveCustomBtn').addEventListener('click',()=>{ saveCustom(); showScreen('difficultyScreen'); });
document.getElementById('backFromCustom').addEventListener('click',()=>{ showScreen('difficultyScreen'); });

document.getElementById('skinBtn').addEventListener('click',()=>{ renderSkinScreen(); showScreen('skinScreen'); });
document.getElementById('backFromSkin').addEventListener('click',()=>{ showScreen('difficultyScreen'); });
document.getElementById('skillBtn').addEventListener('click',()=>{ renderSkillTree(); showScreen('skillScreen'); });
document.getElementById('backFromSkill').addEventListener('click',()=>{ showScreen('difficultyScreen'); });

// Settings & Suggest — attach all button listeners safely
(function(){
  function bindBtn(id, fn){
    const el = document.getElementById(id);
    if(el) el.addEventListener('click', fn);
    else console.warn('Button not found:', id);
  }
  bindBtn('settingsBtn',      ()=>{ initSettingsUI(); showScreen('settingsScreen'); });
  bindBtn('backFromSettings', ()=>{ showScreen('difficultyScreen'); });
  /* ADMIN_MODE_START */ bindBtn('adminModeBtn', activateAdminMode); /* ADMIN_MODE_END */
  bindBtn('suggestBtn',       ()=>{ initSuggestUI();  showScreen('suggestScreen'); });
  bindBtn('backFromSuggest',  ()=>{ showScreen('difficultyScreen'); });
})();

function syncAutoUI(){
  document.getElementById('autoBtn').classList.toggle('active', autoShoot);
  document.getElementById('autoBtn').textContent = autoShoot ? '⚡ АВТО' : '✋ РУЧН.';
  document.getElementById('autoChk').checked = autoShoot;
}
syncAutoUI();
document.getElementById('autoBtn').addEventListener('click',()=>{ autoShoot=!autoShoot; LS.set('autoShoot',autoShoot); syncAutoUI(); });
document.getElementById('autoChk').addEventListener('change',function(){ autoShoot=this.checked; LS.set('autoShoot',autoShoot); syncAutoUI(); });

let currentWeapon = custom.selectedWeapons[0] || 'laser';

// ════════════════════════════════════════════════════
// WEAPONS
// ════════════════════════════════════════════════════
const WEAPONS = {
  laser:     {baseCd:160, label:'ЛАЗЕР',   color:'#00d4ff', emoji:'🔵', desc:'Быстрый луч'},
  rocket:    {baseCd:600, label:'РАКЕТА',  color:'#ff6b00', emoji:'🚀', desc:'Наводящаяся'},
  shotgun:   {baseCd:800, label:'ДРОБЬ',   color:'#ffd700', emoji:'💥', desc:'Широкий залп'},
  plasma:    {baseCd:450, label:'ПЛАЗМА',  color:'#a855f7', emoji:'🟣', desc:'Медленный шар'},
  lightning: {baseCd:350, label:'МОЛНИЯ',  color:'#ffff00', emoji:'⚡', desc:'Цепная молния'},
  rail:      {baseCd:900, label:'РЕЛЬСА',  color:'#00ffcc', emoji:'🔮', desc:'Сквозной удар'},
};

function buildWeaponBar(){
  const group = document.getElementById('weaponsGroup');
  if(!group) return;
  group.innerHTML = '';
  const weapons = custom.selectedWeapons.length ? custom.selectedWeapons : ['laser','rocket','shotgun'];
  weapons.forEach((wid,i)=>{
    const wdef = WEAPONS[wid] || {emoji:'🔵',label:wid.toUpperCase()};
    const btn = document.createElement('div');
    btn.className = 'weapon-btn' + (i===0?' active':'');
    btn.dataset.weapon = wid;
    btn.innerHTML = `<div class="weapon-emoji">${wdef.emoji||'🔵'}</div><div class="weapon-lbl">${wdef.label}</div>`;
    btn.addEventListener('click',()=>{
      currentWeapon = wid;
      document.querySelectorAll('[data-weapon]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      // Рельса стреляет сразу при нажатии на кнопку
      if(wid === 'rail' && gameRunning && !gamePaused) fireRailgun();
    });
    group.appendChild(btn);
  });
  // Set currentWeapon to first in list if current is not available
  if(!weapons.includes(currentWeapon)) currentWeapon = weapons[0];
  // Update active state
  const first = group.querySelector('[data-weapon="'+currentWeapon+'"]');
  if(first){ document.querySelectorAll('[data-weapon]').forEach(b=>b.classList.remove('active')); first.classList.add('active'); }
}

buildWeaponBar();
let gamePaused = false;
document.getElementById('pauseBtn').addEventListener('click',()=>{
  if(!gameRunning) return;
  gamePaused = true;
  Music.pause();
  document.getElementById('pauseOverlay').style.display = 'flex';
});
document.getElementById('resumeBtn').addEventListener('click',()=>{
  gamePaused = false;
  Music.resume();
  document.getElementById('pauseOverlay').style.display = 'none';
  lastTime = performance.now();
  requestAnimationFrame(loop);
});
document.getElementById('pauseRestartBtn').addEventListener('click',()=>{
  gamePaused = false;
  document.getElementById('pauseOverlay').style.display = 'none';
  hideAllScreens(); startGame();
});
document.getElementById('pauseMenuBtn').addEventListener('click',()=>{
  gamePaused = false; gameRunning = false;
  Music.play('menu');
  document.getElementById('pauseOverlay').style.display = 'none';
  showScreen('difficultyScreen');
});

// ════════════════════════════════════════════════════
// BACKGROUND
// ════════════════════════════════════════════════════
const stars=[], nebulas=[], planets=[], asteroids=[];

for(let i=0;i<130;i++) stars.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height,s:Math.random()*2+.5,sp:Math.random()*1.8+.3,o:Math.random()*.55+.35});
for(let i=0;i<5;i++) nebulas.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height,r:60+Math.random()*120,hue:Math.random()*360,o:.04+Math.random()*.06,sp:.15+Math.random()*.2});
for(let i=0;i<3;i++) planets.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height,r:30+Math.random()*60,hue:Math.random()*360,sp:.05+Math.random()*.1,o:.12+Math.random()*.1,rings:Math.random()>.5,ringAngle:Math.random()*Math.PI});
for(let i=0;i<8;i++) asteroids.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height,r:5+Math.random()*15,sp:.2+Math.random()*.6,angle:Math.random()*Math.PI*2,rot:(Math.random()-.5)*.02,pts:Array.from({length:7},(_,j)=>({a:j/7*Math.PI*2,r:.7+Math.random()*.6}))});

// ════════════════════════════════════════════════════
// GAME STATE
// ════════════════════════════════════════════════════
let gameRunning=false;
let score=0, lives=0, level=1, levelProgress=0;
let combo=1, maxCombo=1, comboTimer=0;
let bossActive=false, bossEnemy=null;
let killedEnemies=0, bossesKilled=0;
let sessionAch=[];
let activePowerups={shield:0, speed:0};
let shakeAmount=0, shakeX=0, shakeY=0;
let lastTime=0;

// Кулдаун неуязвимости после получения урона (мс)
let invincibleTimer = 0;
const INVINCIBLE_DURATION = 1200; // 1.2 секунды

const player = {x:canvas.width/2, y:canvas.height-110, targetX:canvas.width/2, w:44, h:44};
const playerTrail = [];

const bullets=[], enemies=[], particles=[], powerups=[];
const MAX_PARTICLES = 300;

let lastShot = 0;

// ════════════════════════════════════════════════════
// NOTIFICATIONS
// ════════════════════════════════════════════════════
let notifQueue = [], notifBusy = false;
function notify(text, cls=''){
  notifQueue.push({text,cls});
  if(!notifBusy) flushNotif();
}
function flushNotif(){
  if(!notifQueue.length){ notifBusy=false; return; }
  notifBusy = true;
  const {text,cls} = notifQueue.shift();
  const container = document.getElementById('notifications');
  while(container.childElementCount > 4) container.removeChild(container.firstChild);
  const el = document.createElement('div');
  el.className = 'notif ' + cls;
  el.textContent = text;
  container.appendChild(el);
  setTimeout(()=>{ el.remove(); flushNotif(); }, 750);
}

// ════════════════════════════════════════════════════
// ACHIEVEMENTS
// ════════════════════════════════════════════════════
function checkAch(id){
  if(unlockedAch.includes(id) || sessionAch.includes(id)) return;
  const a = ACHIEVEMENTS.find(x=>x.id===id);
  if(!a) return;
  sessionAch.push(id); unlockedAch.push(id);
  LS.setJ('achievements', unlockedAch);
  const toast = document.getElementById('achieveToast');
  document.getElementById('achieveName').textContent = a.name;
  toast.style.display = 'block';
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>toast.style.display='none', 2500);
}

function triggerShake(s=8){ shakeAmount=s; }

function explode(x,y,color,count=28){
  if(!custom.particles) return;
  const cap = Math.min(count, MAX_PARTICLES - particles.length);
  for(let i=0;i<cap;i++) particles.push({x,y,vx:(Math.random()-.5)*11,vy:(Math.random()-.5)*11,life:1,decay:.014+Math.random()*.01,color,size:2+Math.random()*3,wave:false,bossShot:false});
  if(particles.length < MAX_PARTICLES)
    particles.push({x,y,vx:0,vy:0,life:1,decay:.04,color,wave:true,r:0,maxR:60+count,bossShot:false});
}

// ════════════════════════════════════════════════════
// POWERUPS
// ════════════════════════════════════════════════════
const POWERUP_DEFS = {
  shield:    {icon:'🛡️', color:'#00d4ff', label:'ЩИТ',        rare:false},
  speed:     {icon:'⚡',  color:'#ffd700', label:'УСКОРЕНИЕ',   rare:false},
  bomb:      {icon:'💣',  color:'#ff6b00', label:'БОМБА',       rare:false},
  doublecoin:{icon:'💰',  color:'#ffd700', label:'x2 МОНЕТЫ',   rare:false},
  laser2:    {icon:'🔷',  color:'#00ffff', label:'ДВОЙНОЙ ЛАЗ', rare:false},
  timefreeze:{icon:'❄️',  color:'#88eeff', label:'ЗАМОРОЗКА',   rare:true},
  lifesteal: {icon:'❤️',  color:'#ff4488', label:'+1 ЖИЗНЬ',    rare:true},
  nuke:      {icon:'☢️',  color:'#aaff00', label:'ЯДЕРКА',      rare:true},
};

const PU_POOL = ['shield','speed','bomb','doublecoin','laser2','timefreeze','lifesteal','nuke'];
const PU_WEIGHTS = [22,20,15,18,15,4,4,2];

function pickPowerupType(forced){
  if(forced && forced !== true) return forced;
  if(forced === true){
    // Гарантированный бонус от мини-босса — случайный из пула
    return PU_POOL[Math.floor(Math.random()*PU_POOL.length)];
  }
  const total=PU_WEIGHTS.reduce((a,b)=>a+b,0);
  let r=Math.random()*total;
  for(let i=0;i<PU_POOL.length;i++){ r-=PU_WEIGHTS[i]; if(r<=0) return PU_POOL[i]; }
  return 'shield';
}

function spawnPowerup(x,y,forced){
  const type=pickPowerupType(forced);
  const def=POWERUP_DEFS[type];
  // Нет life/decay — бонус живёт пока не уйдёт за нижний край экрана
  powerups.push({x,y,type,icon:def.icon,color:def.color,r:15,sp:.65,angle:0,rare:def.rare});
}

let doubleCoinActive=0;
let laserDoubleActive=0;
let timeFreezeActive=0;

// ── РЕЛЬСА — активный луч на 3.5 сек ──
const RAIL_COOLDOWN = 20000;
const RAIL_DURATION = 3500;
let railCooldown = 0;
let railBeam = null; // { timer, maxTimer } пока активен — луч идёт от позиции корабля

function applyPowerup(type){
  playSound('powerup');
  switch(type){
    case 'shield':
      activePowerups.shield=9000;
      notify('🛡️ ЩИТ АКТИВИРОВАН!');
      checkAch('shield');
      break;
    case 'speed':
      activePowerups.speed=6000;
      notify('⚡ УСКОРЕНИЕ!');
      break;
    case 'bomb':{
      const n=enemies.filter(e=>!e.isBoss).length;
      enemies.forEach(e=>{ if(!e.isBoss){explode(e.x,e.y,'#ff6b00',20);} });
      enemies.splice(0, enemies.length, ...enemies.filter(e=>e.isBoss));
      score+=n*25; updateHUD();
      notify('💣 БОМБА! +'+n*25,'gold');
      triggerShake(16); playSound('explode');
      break;
    }
    case 'doublecoin':
      doubleCoinActive=10000;
      notify('💰 ДВОЙНЫЕ МОНЕТЫ x10с!','gold');
      break;
    case 'laser2':
      laserDoubleActive=8000;
      notify('🔷 ДВОЙНОЙ ЛАЗЕР!');
      break;
    case 'timefreeze':
      timeFreezeActive=5000;
      notify('❄️ ЗАМОРОЗКА!','levelup');
      triggerShake(8);
      { const fo=document.getElementById('freezeOverlay'); fo.style.display='block'; setTimeout(()=>fo.style.display='none',300); }
      break;
    case 'lifesteal':{
      const maxLives=DIFF[difficulty].lives+2;
      if(lives<maxLives){ lives++; updateHUD(); }
      notify('❤️ +1 ЖИЗНЬ!','boss');
      break;
    }
    case 'nuke':{
      let killed=0;
      for(let i=enemies.length-1;i>=0;i--){
        if(enemies[i].isBoss){ enemies[i].hp=Math.floor(enemies[i].hp*.3); }
        else{ explode(enemies[i].x,enemies[i].y,'#aaff00',25); killed++; enemies.splice(i,1); }
      }
      score+=killed*50; updateHUD();
      triggerShake(22); playSound('explode');
      notify('☢️ ЯДЕРКА! +'+killed*50,'boss');
      particles.push({x:canvas.width/2,y:canvas.height/2,vx:0,vy:0,life:1,decay:.06,color:'#aaff00',wave:true,r:0,maxR:Math.max(canvas.width,canvas.height),bossShot:false});
      break;
    }
  }
  updatePowerupBar();
}

function updatePowerupBar(){
  const bar=document.getElementById('powerupBar');
  bar.innerHTML='';
  const add=(cls,icon,secs)=>{ const d=document.createElement('div'); d.className='pu-chip '+cls; d.innerHTML=icon+' <span>'+secs+'s</span>'; bar.appendChild(d); };
  if(activePowerups.shield>0) add('shield','🛡️',Math.ceil(activePowerups.shield/1000));
  if(activePowerups.speed>0)  add('speed','⚡',Math.ceil(activePowerups.speed/1000));
  if(doubleCoinActive>0)      add('coin','💰',Math.ceil(doubleCoinActive/1000));
  if(laserDoubleActive>0)     add('laser','🔷',Math.ceil(laserDoubleActive/1000));
  if(timeFreezeActive>0)      add('freeze','❄️',Math.ceil(timeFreezeActive/1000));
}

// ════════════════════════════════════════════════════
// РЕЛЬСОТРОН — мгновенный луч
// ════════════════════════════════════════════════════
function fireRailgun(){
  if(railCooldown > 0) return;
  if(railBeam) return; // уже активна
  railBeam = { timer: RAIL_DURATION, maxTimer: RAIL_DURATION };
  railCooldown = RAIL_COOLDOWN;
  updateRailUI();
  playSound('shoot');
  shakeAmount = 10;
  notify('🔮 РЕЛЬСА АКТИВНА!', 'gold');
}

function updateRailUI(){
  const btn = document.querySelector('[data-weapon="rail"]');
  if(!btn) return;
  if(railBeam){
    btn.classList.add('rail-cd');
    btn.querySelector('.weapon-emoji').textContent = '🔮';
    btn.querySelector('.weapon-lbl').textContent = 'АКТИВ';
    btn.style.borderColor = '#00ffcc';
    btn.style.boxShadow = '0 0 18px rgba(0,255,204,0.6)';
  } else if(railCooldown > 0){
    btn.classList.add('rail-cd');
    btn.style.borderColor = '';
    btn.style.boxShadow = '';
    btn.querySelector('.weapon-emoji').textContent = '⏳';
    const sec = Math.ceil(railCooldown/1000);
    btn.querySelector('.weapon-lbl').textContent = sec+'s';
  } else {
    btn.classList.remove('rail-cd');
    btn.style.borderColor = '';
    btn.style.boxShadow = '';
    btn.querySelector('.weapon-emoji').textContent = '🔮';
    btn.querySelector('.weapon-lbl').textContent = 'РЕЛЬСА';
  }
}

function shoot(){
  const bonus = getBonus();
  const now = Date.now();
  const wpn = WEAPONS[currentWeapon];
  // Рельса стреляет только вручную (через кнопку или пробел), не авто
  if(currentWeapon === 'rail') return;
  const cd = (activePowerups.speed>0 ? wpn.baseCd*.6 : wpn.baseCd) * bonus.firerateMult;
  if(now - lastShot < cd) return;
  lastShot = now;
  playSound('shoot');

  const spd = 13 * bonus.bulletSpeedMult * (activePowerups.speed>0?1.3:1);

  // Crit calc
  const isCrit = Math.random() < bonus.critChance;
  const dmg = bonus.damageMult * (isCrit ? bonus.critMult : 1);
  if(isCrit) notify('💥 КРИТ!','gold');

  if(currentWeapon==='laser'){
    const bw = Math.round(5 * bonus.laserWidthMult);
    const base={y:player.y, w:bw, h:22, sp:spd, dmg, type:'laser',
      pierce: bonus.pierceCount > 0, pierced: new Set(), maxPierce: bonus.pierceCount};
    let ms = bonus.multishot + (laserDoubleActive>0 ? 1 : 0);
    const offsets = [0, [-11,11], [-16,0,16], [-24,-8,8,24]][Math.min(ms,3)];
    (Array.isArray(offsets) ? offsets : [0]).forEach(ox=>{
      bullets.push({...base, x:player.x+ox, pierced:new Set()});
    });
  }else if(currentWeapon==='rocket'){
    const rspd = 7 * bonus.bulletSpeedMult * bonus.rocketSpdMult;
    const rdmg = dmg * 3 * bonus.rocketDmgMult;
    bullets.push({x:player.x,y:player.y,w:10,h:18,sp:rspd,dmg:rdmg,
      type:'rocket',angle:0,homing:true,split:bonus.rocketSplit});
  }else if(currentWeapon==='shotgun'){
    const s = 10 * bonus.bulletSpeedMult;
    const pellets = bonus.shotPellets;
    const spread  = bonus.shotSpreadMult;
    const half = Math.floor(pellets/2);
    for(let a=-half; a<=half; a++){
      bullets.push({x:player.x, y:player.y, w:6, h:14, sp:s, dmg,
        type:'shotgun', vx:a*1.8*spread,
        pierce:bonus.shotPierce, pierced:new Set()});
    }
  }else if(currentWeapon==='plasma'){
    // New: plasma — slow fat orb, area damage on impact
    bullets.push({x:player.x,y:player.y,w:16,h:16,sp:6*bonus.bulletSpeedMult,
      dmg:dmg*2,type:'plasma',vx:0});
  }else if(currentWeapon==='lightning'){
    // New: lightning — instant chain between nearby enemies
    const chainCount = 3 + bonus.pierceCount;
    bullets.push({x:player.x,y:player.y,w:4,h:30,sp:22*bonus.bulletSpeedMult,
      dmg:dmg*0.8,type:'lightning',chain:chainCount,pierced:new Set(),pierce:true});
  }else if(currentWeapon==='rail'){
    // Рельса — мгновенный луч, обрабатывается отдельно в fireRailgun()
    fireRailgun();
    return; // не через систему пуль
  }
}

// ════════════════════════════════════════════════════
// BOSS DEFINITIONS
// ════════════════════════════════════════════════════
const BOSS_TYPES = [
  {
    id:'guardian', name:'⚔️ СТРАЖ', color:'#ff0066',
    hw:55, hh:45,
    init(b){ b.dir=1; b.shootTimer=0; b.phase=0; },
    update(b,dt){
      b.x+=b.sp*b.dir;
      if(b.x>canvas.width-b.hw||b.x<b.hw) b.dir*=-1;
      if(b.y<120) b.y+=1.8;
      b.shootTimer-=dt;
      if(b.shootTimer<=0){
        b.shootTimer = Math.max(900, 2000-level*55);
        for(let a=-1;a<=1;a++){
          spawnBossShot(b.x+a*20, b.y+b.hh, a*.6, 2.5+level*.04, '#ff0066', 8);
        }
      }
    },
    draw(b,ctx,animT){
      const col='#ff0066';
      const eg=ctx.createRadialGradient(0,0,0,0,0,b.hw);
      eg.addColorStop(0,col+'ff'); eg.addColorStop(.6,col+'aa'); eg.addColorStop(1,col+'22');
      ctx.fillStyle=eg; ctx.beginPath();
      ctx.moveTo(0,-b.hh); ctx.lineTo(-b.hw*.7,-b.hh*.3); ctx.lineTo(-b.hw,b.hh);
      ctx.lineTo(-b.hw*.3,b.hh*.4); ctx.lineTo(0,b.hh*.7);
      ctx.lineTo(b.hw*.3,b.hh*.4); ctx.lineTo(b.hw,b.hh); ctx.lineTo(b.hw*.7,-b.hh*.3);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(-b.hw*.3,-b.hh*.1,4,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(b.hw*.3,-b.hh*.1,4,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#f00'; ctx.beginPath(); ctx.arc(-b.hw*.3,-b.hh*.1,2,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(b.hw*.3,-b.hh*.1,2,0,Math.PI*2); ctx.fill();
    }
  },
  {
    id:'sniper', name:'🎯 СНАЙПЕР', color:'#ff9900',
    hw:45, hh:55,
    init(b){ b.dir=1; b.shootTimer=0; b.chargeTimer=0; b.charging=false; b.aimX=0; b.aimY=0; },
    update(b,dt){
      b.x += Math.sin(Date.now()/1200)*1.2;
      b.x = Math.max(b.hw, Math.min(canvas.width-b.hw, b.x));
      if(b.y<100) b.y+=1.2;
      b.shootTimer-=dt;
      if(b.shootTimer<=0 && !b.charging){
        b.charging=true; b.chargeTimer=1100;
        b.aimX=player.x; b.aimY=player.y;
      }
      if(b.charging){
        b.chargeTimer-=dt;
        if(b.chargeTimer<=0){
          b.charging=false;
          b.shootTimer = Math.max(1400, 2800-level*75);
          const dx=b.aimX-b.x, dy=b.aimY-b.y, dist=Math.max(Math.hypot(dx,dy),1);
          const spd=5+level*.13;
          spawnBossShot(b.x, b.y+b.hh, dx/dist*spd, dy/dist*spd, '#ff9900', 12);
          spawnBossShot(b.x-10, b.y+b.hh, dx/dist*(spd*.85), dy/dist*(spd*.85), '#ff9900', 7);
          spawnBossShot(b.x+10, b.y+b.hh, dx/dist*(spd*.85), dy/dist*(spd*.85), '#ff9900', 7);
        }
      }
    },
    draw(b,ctx,animT){
      const col='#ff9900';
      const eg=ctx.createRadialGradient(0,0,0,0,0,b.hw);
      eg.addColorStop(0,col+'ff'); eg.addColorStop(.5,col+'99'); eg.addColorStop(1,col+'11');
      ctx.fillStyle=eg;
      ctx.beginPath();
      ctx.moveTo(0,-b.hh); ctx.lineTo(-b.hw*.4,-b.hh*.2);
      ctx.lineTo(-b.hw,0); ctx.lineTo(-b.hw*.4,b.hh*.3);
      ctx.lineTo(0,b.hh); ctx.lineTo(b.hw*.4,b.hh*.3);
      ctx.lineTo(b.hw,0); ctx.lineTo(b.hw*.4,-b.hh*.2);
      ctx.closePath(); ctx.fill();
      const eyeR = b.charging ? 10+5*Math.sin(animT*8) : 7;
      ctx.fillStyle = b.charging ? '#ffffff' : col+'99';
      ctx.beginPath(); ctx.arc(0,0,eyeR,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle=col; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(0,0,eyeR+4,0,Math.PI*2); ctx.stroke();
      if(b.charging){
        ctx.save(); ctx.globalAlpha=.5;
        ctx.strokeStyle='#ff9900'; ctx.lineWidth=1;
        ctx.setLineDash([4,6]);
        ctx.beginPath(); ctx.moveTo(0,b.hh); ctx.lineTo(b.aimX-b.x, b.aimY-b.y); ctx.stroke();
        ctx.setLineDash([]); ctx.restore();
      }
      [-b.hw*.8,b.hw*.8].forEach(ox=>{
        ctx.fillStyle=col+'88';
        ctx.beginPath(); ctx.roundRect(ox-5,-6,10,20,3); ctx.fill();
      });
    }
  },
  {
    id:'octopus', name:'🐙 ОСЬМИНОГ', color:'#a855f7',
    hw:60, hh:50,
    init(b){ b.spawnTimer=0; b.shootTimer=0; b.tentacleAngle=0; b.phase=0; },
    update(b,dt){
      b.x = canvas.width/2 + Math.sin(Date.now()/900)*(canvas.width*.35);
      if(b.y<110) b.y+=1.5;
      b.tentacleAngle += dt*.003;
      b.spawnTimer-=dt;
      if(b.spawnTimer<=0){
        b.spawnTimer = Math.max(2000, 4500-level*80);
        if(enemies.filter(e=>!e.isBoss).length < 8){
          enemies.push({x:b.x+(Math.random()-.5)*80,y:b.y+20,hw:10,hh:10,sp:1.5,hp:1,maxHp:1,type:'fast',zigAngle:0,isBoss:false,shootTimer:0,stealthTimer:0,stealthAlpha:1,splitDone:false,swarmOffset:0});
        }
      }
      b.shootTimer-=dt;
      if(b.shootTimer<=0){
        b.shootTimer = Math.max(700, 1600-level*45);
        for(let i=0;i<8;i++){
          const ang = (i/8)*Math.PI*2 + b.tentacleAngle;
          spawnBossShot(b.x, b.y, Math.cos(ang)*2, Math.sin(ang)*2, '#a855f7', 7);
        }
      }
    },
    draw(b,ctx,animT){
      const col='#a855f7';
      const eg=ctx.createRadialGradient(0,0,0,0,0,b.hw);
      eg.addColorStop(0,col+'ff'); eg.addColorStop(.6,col+'bb'); eg.addColorStop(1,col+'11');
      ctx.fillStyle=eg;
      ctx.beginPath(); ctx.arc(0,0,b.hw*.7,0,Math.PI*2); ctx.fill();
      for(let i=0;i<8;i++){
        const ang = (i/8)*Math.PI*2 + b.tentacleAngle;
        const len = b.hw*.9 + 10*Math.sin(animT*3+i);
        ctx.save();
        ctx.strokeStyle=col+'99'; ctx.lineWidth=4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang)*b.hw*.5, Math.sin(ang)*b.hw*.5);
        ctx.quadraticCurveTo(
          Math.cos(ang+.4)*len*.6, Math.sin(ang+.4)*len*.6,
          Math.cos(ang)*len, Math.sin(ang)*len
        );
        ctx.stroke(); ctx.restore();
      }
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(-12,-8,6,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(12,-8,6,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#6600ff'; ctx.beginPath(); ctx.arc(-12,-8,3,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(12,-8,3,0,Math.PI*2); ctx.fill();
    }
  },
  {
    id:'dreadnought', name:'🛸 ДРЕДНОУТ', color:'#00d4ff',
    hw:75, hh:55,
    init(b){ b.dir=.5; b.shootTimer=0; b.laserChargeTimer=0; b.laserFiring=false; b.laserDuration=0; b.laserX=0; },
    update(b,dt){
      b.x+=b.sp*.5*b.dir;
      if(b.x>canvas.width-b.hw||b.x<b.hw) b.dir*=-1;
      if(b.y<90) b.y+=1;
      b.shootTimer-=dt;
      if(b.shootTimer<=0 && !b.laserFiring){
        b.shootTimer = Math.max(1400, 3800-level*70);
        b.laserChargeTimer=900;
        b.laserX=player.x;
      }
      if(b.laserChargeTimer>0){
        b.laserChargeTimer-=dt;
        if(b.laserChargeTimer<=0){
          b.laserFiring=true;
          b.laserDuration=280+level*8;
          triggerShake(8);
        }
      }
      if(b.laserFiring){
        b.laserDuration-=dt;
        if(Math.abs(player.x - b.laserX)<16){
          if(activePowerups.shield>0){ activePowerups.shield=0; notify('🛡️ ЩИТ СЛОМАН'); updatePowerupBar(); }
          else if(invincibleTimer<=0){ lives--; updateHUD(); invincibleTimer=INVINCIBLE_DURATION; if(lives<=0) endGame(); }
          b.laserX = player.x + (Math.random()-.5)*80;
        }
        if(b.laserDuration<=0) b.laserFiring=false;
        if(Math.random()<.015) spawnBossShot(b.x+(Math.random()-.5)*b.hw*1.5, b.y+b.hh, (Math.random()-.5)*1.8, 2+level*.03, '#00d4ff', 8);
      }
    },
    draw(b,ctx,animT){
      const col='#00d4ff';
      ctx.fillStyle='#001122';
      ctx.beginPath(); ctx.roundRect(-b.hw,-b.hh,b.hw*2,b.hh*2,10); ctx.fill();
      const eg=ctx.createLinearGradient(-b.hw,-b.hh,b.hw,b.hh);
      eg.addColorStop(0,col+'66'); eg.addColorStop(.5,col+'33'); eg.addColorStop(1,col+'66');
      ctx.fillStyle=eg;
      ctx.beginPath(); ctx.roundRect(-b.hw,-b.hh,b.hw*2,b.hh*2,10); ctx.fill();
      ctx.strokeStyle=col+'55'; ctx.lineWidth=1.5;
      for(let i=-2;i<=2;i++){
        ctx.beginPath(); ctx.moveTo(i*b.hw*.35,-b.hh); ctx.lineTo(i*b.hw*.35,b.hh); ctx.stroke();
      }
      [-b.hw*.6,-b.hw*.2,b.hw*.2,b.hw*.6].forEach(ox=>{
        const glow=ctx.createRadialGradient(ox,b.hh,0,ox,b.hh,10);
        glow.addColorStop(0,col+'ff'); glow.addColorStop(1,'transparent');
        ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(ox,b.hh,10+3*Math.sin(animT*5+ox),0,Math.PI*2); ctx.fill();
      });
      ctx.fillStyle=b.laserChargeTimer>0||b.laserFiring?'#ffffff':col+'88';
      ctx.beginPath(); ctx.arc(0,b.hh*.4,8,0,Math.PI*2); ctx.fill();
      if(b.laserFiring){
        const lx=b.laserX-b.x;
        ctx.save(); ctx.globalAlpha=.7+.3*Math.sin(animT*20);
        const lg=ctx.createLinearGradient(lx,b.hh*.4,lx,canvas.height);
        lg.addColorStop(0,'#ffffff'); lg.addColorStop(.1,col); lg.addColorStop(1,col+'00');
        ctx.fillStyle=lg; ctx.fillRect(lx-6, b.hh*.4, 12, canvas.height);
        ctx.restore();
      }
      if(b.laserChargeTimer>0){
        const lx=b.laserX-b.x;
        ctx.save(); ctx.globalAlpha=.4*(1-b.laserChargeTimer/600)*2;
        ctx.strokeStyle='#ffffff'; ctx.lineWidth=2; ctx.setLineDash([5,5]);
        ctx.beginPath(); ctx.moveTo(lx,b.hh*.4); ctx.lineTo(lx,canvas.height); ctx.stroke();
        ctx.setLineDash([]); ctx.restore();
      }
    }
  },
  {
    id:'phoenix', name:'🔥 ФЕНИКС', color:'#ff4400',
    hw:58, hh:52,
    init(b){ b.dir=1; b.shootTimer=0; b.orbAngle=0; b.orbits=[]; b.reborn=false; b.phase=1;
      b.orbits=[0,1,2].map(i=>({angle:i/3*Math.PI*2, dist:90+i*15}));
    },
    update(b,dt){
      const t=Date.now()/1500;
      b.x = canvas.width/2 + Math.sin(t)*(canvas.width*.3);
      if(b.y<100) b.y+=1.5; else b.y=100 + Math.sin(t*1.3)*20;
      b.orbAngle += dt*.0018;
      b.orbits.forEach(o=>{
        o.angle += dt*.0013;
        const ox=b.x+Math.cos(o.angle)*o.dist;
        const oy=b.y+Math.sin(o.angle)*o.dist;
        if(Math.hypot(ox-player.x,oy-player.y)<14){
          if(activePowerups.shield>0){ activePowerups.shield=0; notify('🛡️ ЩИТ СЛОМАН'); updatePowerupBar(); }
          else if(invincibleTimer<=0){ lives--; updateHUD(); invincibleTimer=INVINCIBLE_DURATION; if(lives<=0) endGame(); }
          o.angle+=Math.PI;
        }
      });
      b.shootTimer-=dt;
      if(b.shootTimer<=0){
        b.shootTimer = Math.max(800, 1800-level*50);
        if(b.phase===1){
          for(let i=0;i<5;i++){
            const ang=b.orbAngle+i/5*Math.PI*2;
            spawnBossShot(b.x, b.y, Math.cos(ang)*2.2, Math.sin(ang)*2.2, '#ff4400', 9);
          }
        } else {
          for(let i=0;i<8;i++){
            const ang=b.orbAngle+i/8*Math.PI*2;
            spawnBossShot(b.x, b.y, Math.cos(ang)*2.8, Math.sin(ang)*2.8, '#ffaa00', 8);
          }
        }
      }
    },
    draw(b,ctx,animT){
      const col = b.phase===2 ? '#ffaa00' : '#ff4400';
      for(let side of [-1,1]){
        ctx.save();
        ctx.fillStyle=col+(b.phase===2?'cc':'88');
        ctx.beginPath();
        ctx.moveTo(0,-b.hh*.2);
        ctx.quadraticCurveTo(side*b.hw*.8,-b.hh*.8, side*b.hw*1.1,-b.hh*.1);
        ctx.quadraticCurveTo(side*b.hw*.7, b.hh*.5, 0,b.hh*.3);
        ctx.closePath(); ctx.fill(); ctx.restore();
      }
      const eg=ctx.createRadialGradient(0,0,0,0,0,b.hw*.55);
      eg.addColorStop(0,col+'ff'); eg.addColorStop(.5,col+'cc'); eg.addColorStop(1,col+'22');
      ctx.fillStyle=eg;
      ctx.beginPath(); ctx.arc(0,0,b.hw*.55,0,Math.PI*2); ctx.fill();
      for(let i=-2;i<=2;i++){
        ctx.save(); ctx.translate(i*10, b.hh*.4);
        const fl=ctx.createLinearGradient(0,0,0,25+10*Math.sin(animT*4+i));
        fl.addColorStop(0,col+'cc'); fl.addColorStop(1,'transparent');
        ctx.fillStyle=fl;
        ctx.beginPath(); ctx.moveTo(-4,0); ctx.lineTo(4,0); ctx.lineTo(0,25+10*Math.sin(animT*4+i)); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      b.orbits.forEach(o=>{
        const ox=Math.cos(o.angle)*o.dist, oy=Math.sin(o.angle)*o.dist;
        ctx.save();
        ctx.shadowBlur=15; ctx.shadowColor=col;
        ctx.fillStyle=col; ctx.beginPath(); ctx.arc(ox,oy,7,0,Math.PI*2); ctx.fill();
        ctx.restore();
      });
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(0,-8,7,0,Math.PI*2); ctx.fill();
      ctx.fillStyle=b.phase===2?'#ff8800':'#cc2200';
      ctx.beginPath(); ctx.arc(0,-8,4,0,Math.PI*2); ctx.fill();
    }
  },
  // ── КОРОЛЕВА РОЯ ──
  {
    id:'swarm_queen', name:'👑 КОРОЛЕВА РОЯ', color:'#44ff88',
    hw:50, hh:45,
    init(b){ b.dir=1; b.shootTimer=0; b.orbAngle=0; b.spawnTimer=1500; },
    update(b,dt){
      b.x += b.sp*b.dir*0.9; if(b.x>canvas.width-b.hw||b.x<b.hw) b.dir*=-1;
      if(b.y<100) b.y+=1.6;
      b.orbAngle += dt*.002;
      // Стрельба по кругу
      b.shootTimer-=dt;
      if(b.shootTimer<=0){
        b.shootTimer = Math.max(600,1500-level*40);
        const cnt = b.phase3entered?10:b.phase2entered?7:5;
        for(let i=0;i<cnt;i++){
          const ang=b.orbAngle+i/cnt*Math.PI*2;
          spawnBossShot(b.x,b.y,Math.cos(ang)*2.2,Math.sin(ang)*2.2,'#44ff88',6);
        }
      }
      // Призыв роя
      b.spawnTimer-=dt;
      if(b.spawnTimer<=0){
        b.spawnTimer=b.phase2entered?1800:2800;
        for(let s=0;s<3;s++){
          enemies.push({x:b.x+(Math.random()-.5)*80,y:b.y+30,
            hw:8,hh:7,sp:2+level*.06,hp:1,maxHp:1,type:'swarm',
            isBoss:false,isMiniBoss:false,zigAngle:0,shootTimer:0,stealthTimer:0,stealthAlpha:1,
            splitDone:false,swarmOffset:Math.random()*Math.PI*2,score:3,coin:0,
            dashTimer:0,dashVx:0,dashing:false,dashDuration:0,shieldHp:0,teleportTimer:0,bomberArmed:false});
        }
      }
    },
    draw(b,ctx,animT){
      const col='#44ff88';
      // Тело — большой шестиугольник
      const eg=ctx.createRadialGradient(0,0,0,0,0,b.hw);
      eg.addColorStop(0,col+'ff'); eg.addColorStop(.6,col+'cc'); eg.addColorStop(1,col+'11');
      ctx.fillStyle=eg; ctx.beginPath();
      for(let i=0;i<6;i++){ const a=i/6*Math.PI*2-Math.PI/6; ctx.lineTo(Math.cos(a)*b.hw,Math.sin(a)*b.hh); }
      ctx.closePath(); ctx.fill();
      // Крылья
      for(let side of [-1,1]){
        ctx.save(); ctx.fillStyle=col+'55';
        ctx.beginPath();
        ctx.moveTo(side*b.hw*.5, -b.hh*.3);
        ctx.quadraticCurveTo(side*b.hw*1.4, -b.hh*.8, side*b.hw*1.5, 0);
        ctx.quadraticCurveTo(side*b.hw*1.2, b.hh*.5, side*b.hw*.5, b.hh*.2);
        ctx.closePath(); ctx.fill(); ctx.restore();
      }
      // Корона
      ctx.fillStyle='#ffd700';
      [-20,-8,0,8,20].forEach((ox,i)=>{
        const h=i%2===0?14:8;
        ctx.beginPath(); ctx.moveTo(ox-5,-b.hh); ctx.lineTo(ox,-b.hh-h); ctx.lineTo(ox+5,-b.hh); ctx.closePath(); ctx.fill();
      });
      // Глаза
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(-14,-10,6,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(14,-10,6,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#003300'; ctx.beginPath(); ctx.arc(-14,-10,3,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(14,-10,3,0,Math.PI*2); ctx.fill();
    }
  },
  // ── НЕКРОМАНТ ──
  {
    id:'necromancer', name:'💀 НЕКРОМАНТ', color:'#8800ff',
    hw:52, hh:60,
    init(b){ b.dir=1; b.shootTimer=0; b.summonTimer=3000; b.phase=1; b.orbiting=[]; },
    update(b,dt){
      b.x = canvas.width/2 + Math.sin(Date.now()/1400)*(canvas.width*.28);
      if(b.y<120) b.y+=1.4; else b.y=120+Math.sin(Date.now()/2000)*18;
      // Снаряды-черепа в спираль
      b.shootTimer-=dt;
      if(b.shootTimer<=0){
        b.shootTimer=Math.max(700,1800-level*45);
        const cnt=b.phase3entered?12:b.phase2entered?8:5;
        for(let i=0;i<cnt;i++){
          const ang=Date.now()*.002+i/cnt*Math.PI*2;
          spawnBossShot(b.x,b.y,Math.cos(ang)*2.5,Math.sin(ang)*2.5,'#8800ff',8);
        }
      }
      // Воскрешает мёртвых врагов (спавн зомби)
      b.summonTimer-=dt;
      if(b.summonTimer<=0){
        b.summonTimer=b.phase2entered?2000:3500;
        const zombieCount=b.phase3entered?4:2;
        for(let z=0;z<zombieCount;z++){
          enemies.push({x:Math.random()*canvas.width,y:-20,
            hw:14,hh:12,sp:1.2+level*.04,hp:2,maxHp:2,type:'zigzag',
            isBoss:false,isMiniBoss:false,zigAngle:Math.random()*Math.PI*2,
            shootTimer:0,stealthTimer:0,stealthAlpha:0.7,
            splitDone:true,swarmOffset:0,score:3,coin:0,
            dashTimer:0,dashVx:0,dashing:false,dashDuration:0,shieldHp:0,teleportTimer:0,bomberArmed:false});
        }
        notify('💀 Некромант воскрешает!','boss');
      }
    },
    draw(b,ctx,animT){
      const col='#8800ff';
      // Мантия
      ctx.fillStyle=col+'88';
      ctx.beginPath();
      ctx.moveTo(0,-b.hh); ctx.lineTo(-b.hw,b.hh*.6); ctx.lineTo(-b.hw*.4,b.hh*.4);
      ctx.lineTo(-b.hw*.6,b.hh); ctx.lineTo(0,b.hh*.7);
      ctx.lineTo(b.hw*.6,b.hh); ctx.lineTo(b.hw*.4,b.hh*.4);
      ctx.lineTo(b.hw,b.hh*.6); ctx.closePath(); ctx.fill();
      // Тело
      const eg=ctx.createRadialGradient(0,0,0,0,0,b.hw*.55);
      eg.addColorStop(0,col+'ff'); eg.addColorStop(.6,col+'bb'); eg.addColorStop(1,col+'22');
      ctx.fillStyle=eg; ctx.beginPath(); ctx.arc(0,-b.hh*.1,b.hw*.55,0,Math.PI*2); ctx.fill();
      // Череп
      ctx.fillStyle='#fff9'; ctx.beginPath(); ctx.arc(0,-b.hh*.15,b.hw*.35,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(-10,-b.hh*.2,6,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(10,-b.hh*.2,6,0,Math.PI*2); ctx.fill();
      // Скипетр
      ctx.strokeStyle='#ffdd44'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.moveTo(b.hw*.6,0); ctx.lineTo(b.hw*.6,-b.hh*.9); ctx.stroke();
      ctx.fillStyle='#ffdd44';
      const orb=8+4*Math.sin(animT*4);
      ctx.beginPath(); ctx.arc(b.hw*.6,-b.hh*.9,orb,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=20; ctx.shadowColor='#ffdd44';
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(b.hw*.6,-b.hh*.9,orb*.4,0,Math.PI*2); ctx.fill();
    }
  },
];

function spawnBossShot(x, y, vx, vy, color, size){
  if(particles.length >= MAX_PARTICLES) return;
  particles.push({x,y,vx,vy,life:1,decay:.005,color,bossShot:true,wave:false,size});
}

function getBossType(){
  // На высоких уровнях — случайный выбор из доступных
  const available = [];
  if(level>=1)  available.push(BOSS_TYPES[0]); // Страж
  if(level>=10) available.push(BOSS_TYPES[1]); // Снайпер
  if(level>=15) available.push(BOSS_TYPES[2]); // Осьминог
  if(level>=20) available.push(BOSS_TYPES[3]); // Дредноут
  if(level>=25) available.push(BOSS_TYPES[4]); // Феникс
  if(level>=18) available.push(BOSS_TYPES[5]); // Рой
  if(level>=30) available.push(BOSS_TYPES[6]); // Некромант
  return available[Math.floor(Math.random()*available.length)];
}

function spawnBoss(){
  bossActive=true;
  const cfg=DIFF[difficulty];
  const btype=getBossType();
  const hp = Math.floor((20 + level*5 + Math.sqrt(level)*8) * cfg.bossHpMult);

  // Убираем всех обычных врагов — поле очищается для босса
  for(let i=enemies.length-1;i>=0;i--){
    const e=enemies[i];
    if(!e.isBoss){
      explode(e.x, e.y, '#ff6b00', 8);
      enemies.splice(i,1);
    }
  }

  const bonus = getBonus();
  const railCD = Math.max(5000, RAIL_COOLDOWN - (bonus.railCdReduce||0));

  bossEnemy={
    x:canvas.width/2, y:-80,
    hw:btype.hw, hh:btype.hh,
    sp: 0.8 + level*.05,
    hp, maxHp:hp,
    isBoss:true, isMiniBoss:false,
    bossType:btype,
    bossId:btype.id,
    phase2entered:false, phase3entered:false,
    minionTimer: 4000, // первый призыв прислужников через 4 сек
  };
  btype.init(bossEnemy);
  enemies.push(bossEnemy);
  document.getElementById('bossBar').style.display='block';
  document.getElementById('bossName').textContent=btype.name;
  notify(btype.name+' ПОЯВИЛСЯ!','boss');
  playSound('boss');
  triggerShake(14);
  if(window.BossAnimation) window.BossAnimation.show('🔥 ' + btype.name);
}

// ════════════════════════════════════════════════════
// ENEMY SPAWNING
// ════════════════════════════════════════════════════
function spawnEnemy(){
  const cfg=DIFF[difficulty];

  // Мини-босс: шанс появления от уровня 7+
  if(level>=7 && !bossActive && Math.random() < 0.012 + level*0.0008){
    spawnMiniBoss(); return;
  }

  let pool=['normal'];
  if(level>=2) pool.push('fast');
  if(level>=3) pool.push('zigzag');
  if(level>=4) pool.push('tank');
  if(level>=5) pool.push('swarm');
  if(level>=6) pool.push('shooter');
  if(level>=7) pool.push('bomber');
  if(level>=8) pool.push('splitter');
  if(level>=9) pool.push('dasher');
  if(level>=10) pool.push('stealth');
  if(level>=12) pool.push('shielder');
  if(level>=14) pool.push('teleporter');

  const weights={normal:30,fast:20,zigzag:15,tank:12,swarm:10,shooter:8,bomber:7,splitter:5,dasher:8,stealth:4,shielder:4,teleporter:3};
  const totalW=pool.reduce((s,t)=>s+weights[t],0);
  let r=Math.random()*totalW;
  let type='normal';
  for(const t of pool){ r-=weights[t]; if(r<=0){type=t;break;} }

  const configs={
    normal:      {hw:16,hh:14,hpF:1,   spdF:1,   xp:10, coin:1},
    fast:        {hw:12,hh:10,hpF:.5,  spdF:2.2,  xp:12, coin:1},
    zigzag:      {hw:14,hh:12,hpF:.8,  spdF:1.1,  xp:14, coin:1},
    tank:        {hw:24,hh:20,hpF:4,   spdF:.5,   xp:20, coin:3},
    swarm:       {hw:8, hh:7, hpF:.4,  spdF:1.6,  xp:7,  coin:1},
    shooter:     {hw:18,hh:16,hpF:1.5, spdF:.8,   xp:18, coin:2},
    bomber:      {hw:20,hh:18,hpF:1.2, spdF:1.0,  xp:22, coin:2},
    splitter:    {hw:20,hh:18,hpF:2,   spdF:.9,   xp:22, coin:2},
    dasher:      {hw:13,hh:11,hpF:.7,  spdF:1.4,  xp:16, coin:2},
    stealth:     {hw:15,hh:13,hpF:1.2, spdF:1.3,  xp:25, coin:2},
    shielder:    {hw:19,hh:17,hpF:2.5, spdF:.7,   xp:28, coin:3},
    teleporter:  {hw:15,hh:13,hpF:1.0, spdF:.9,   xp:30, coin:3},
  };
  const c=configs[type];
  const hw=c.hw+Math.random()*4, hh=c.hh+Math.random()*4;
  const baseHp=Math.ceil(c.hpF*(1+Math.floor(level/4)));
  const spd=(c.spdF + level*.08 + Math.random()*.5)*cfg.spd;

  const e={
    x:hw+Math.random()*(canvas.width-hw*2),
    y:-hh*2,
    hw,hh,sp:spd,hp:baseHp,maxHp:baseHp,
    type,isBoss:false,isMiniBoss:false,
    zigAngle:0,
    shootTimer:['shooter','bomber'].includes(type)?1200:0,
    stealthTimer:0,stealthAlpha:1,
    splitDone:false,
    swarmOffset:Math.random()*Math.PI*2,
    score:c.xp,coin:c.coin||1,
    // Новые поля
    dashTimer:type==='dasher'?800+Math.random()*600:0,
    dashVx:0, dashing:false, dashDuration:0,
    shieldHp:type==='shielder'?3:0,
    teleportTimer:type==='teleporter'?2000+Math.random()*1000:0,
    bomberArmed:type==='bomber',
  };
  enemies.push(e);

  if(type==='swarm'){
    const count=3+Math.floor(Math.random()*3);
    for(let i=1;i<count;i++){
      enemies.push({...e, x:e.x+(i*(Math.random()>.5?1:-1)*22), zigAngle:0, shootTimer:0, stealthTimer:0, stealthAlpha:1, splitDone:false, swarmOffset:Math.random()*Math.PI*2});
    }
  }
}

// ════════════════════════════════════════════════════
// МИНИ-БОСС
// ════════════════════════════════════════════════════
const MINI_BOSS_TYPES = [
  { id:'bruiser', name:'💪 ГРОМИЛА', color:'#ff4400', hw:32,hh:28,
    hpMult:12, emoji:'👹',
    init(e){ e.dir=1; e.shootTimer=1500; e.chargeTimer=0; e.charging=false; },
    update(e,dt){
      if(timeFreezeActive>0) return;
      e.x+=e.sp*e.dir*1.2;
      if(e.x>canvas.width-e.hw||e.x<e.hw) e.dir*=-1;
      e.shootTimer-=dt;
      if(e.shootTimer<=0){
        e.shootTimer=1200;
        for(let a=-1;a<=1;a++) spawnBossShot(e.x+a*12,e.y+e.hh,a*.8,2.8,'#ff4400',8);
      }
    }
  },
  { id:'speeder', name:'⚡ МОЛНИЕВИК', color:'#ffdd00', hw:22,hh:18,
    hpMult:7, emoji:'💛',
    init(e){ e.phase=0; e.shootTimer=800; e.zigAngle=0; },
    update(e,dt){
      if(timeFreezeActive>0) return;
      e.zigAngle+=dt*.006; e.x+=Math.sin(e.zigAngle)*5;
      e.shootTimer-=dt;
      if(e.shootTimer<=0){
        e.shootTimer=700;
        const dx=player.x-e.x,dy=player.y-e.y,d=Math.max(Math.hypot(dx,dy),1);
        spawnBossShot(e.x,e.y+e.hh,dx/d*4,dy/d*4,'#ffdd00',7);
      }
    }
  },
  { id:'guardian', name:'🛡️ СТРАЖ+', color:'#00aaff', hw:35,hh:30,
    hpMult:15, emoji:'🔵',
    init(e){ e.dir=1; e.shootTimer=2000; e.shieldHp=5; e.shieldActive=true; },
    update(e,dt){
      if(timeFreezeActive>0) return;
      e.x+=e.sp*e.dir*.8; if(e.x>canvas.width-e.hw||e.x<e.hw) e.dir*=-1;
      e.shootTimer-=dt;
      if(e.shootTimer<=0){
        e.shootTimer=1800;
        for(let i=0;i<4;i++){
          const ang=i/4*Math.PI*2;
          spawnBossShot(e.x,e.y,Math.cos(ang)*2.5,Math.sin(ang)*2.5,'#00aaff',7);
        }
      }
    }
  },
];

function spawnMiniBoss(){
  const cfg=DIFF[difficulty];
  const mtype=MINI_BOSS_TYPES[Math.floor(Math.random()*MINI_BOSS_TYPES.length)];
  const hp=Math.ceil(mtype.hpMult*(1+level*.3)*cfg.bossHpMult*.4);
  const e={
    x:mtype.hw+Math.random()*(canvas.width-mtype.hw*2), y:-mtype.hh*2,
    hw:mtype.hw, hh:mtype.hh,
    sp:(0.6+level*.04)*cfg.spd,
    hp, maxHp:hp,
    type:'miniboss', isBoss:false, isMiniBoss:true,
    miniType:mtype, miniId:mtype.id,
    score:80+level*5, coin:8+level,
    zigAngle:0,shootTimer:0,stealthTimer:0,stealthAlpha:1,
    splitDone:false,swarmOffset:0,
    dashTimer:0,dashVx:0,dashing:false,dashDuration:0,
    shieldHp:0,teleportTimer:0,bomberArmed:false,
  };
  mtype.init(e);
  enemies.push(e);
  notify('⚠️ '+mtype.name+'!','boss');
}

// ════════════════════════════════════════════════════
// COMBO
// ════════════════════════════════════════════════════
function addCombo(){
  combo = Math.min(combo+1,20);
  if(combo>maxCombo) maxCombo=combo;
  comboTimer = 2500;
  const el = document.getElementById('comboDisplay');
  document.getElementById('comboVal').textContent = 'x'+combo;
  el.classList.toggle('combo-hidden', combo<2);
  if(combo>=5) checkAch('combo5');
  if(combo>=10) checkAch('combo10');
  const prev = +LS.get('maxComboEver',0);
  if(combo > prev) LS.set('maxComboEver', combo);
}

// ════════════════════════════════════════════════════
// UPDATE
// ════════════════════════════════════════════════════

// ════════════════════════════════════════════════════
let touching=false;
let touchStartX=0, touchStartY=0, touchStartTime=0;
let lastTapTime=0, tapCount=0;
const SWIPE_THRESHOLD = 60; // px вверх для навыка
const DOUBLE_TAP_MS = 300;

canvas.addEventListener('touchstart',e=>{
  e.preventDefault();
  if(!gameRunning) return;
  touching=true;
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  touchStartTime = Date.now();
  player.targetX = e.touches[0].clientX;
},{passive:false});

canvas.addEventListener('touchmove',e=>{
  e.preventDefault();
  if(!gameRunning) return;
  player.targetX = e.touches[0].clientX;
},{passive:false});

canvas.addEventListener('touchend',e=>{
  e.preventDefault();
  touching=false;
  if(!gameRunning || gamePaused) return;

  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  const dt = Date.now() - touchStartTime;

  // Свайп вверх — активируем первый готовый навык
  if(dy < -SWIPE_THRESHOLD && Math.abs(dx) < Math.abs(dy) * 0.8 && dt < 400){
    const actives = getActiveSkills();
    const ready = actives.find(id => (activeSkillCooldowns[id]||0) <= 0);
    if(ready){ activateSkill(ready); triggerShake(3); }
    return;
  }

  // Двойной тап — бомба
  const now = Date.now();
  if(now - lastTapTime < DOUBLE_TAP_MS && Math.abs(dx)<20 && Math.abs(dy)<20){
    tapCount++;
    if(tapCount >= 2){ useBomb(); tapCount=0; }
  } else {
    tapCount = 1;
  }
  lastTapTime = now;
},{passive:false});

// ════════════════════════════════════════════════════
// TOUCH SKILL BAR — кнопки навыков над нижней панелью
// ════════════════════════════════════════════════════
function updateTouchSkillBar(){
  const bar = document.getElementById('touchSkillBar');
  if(!bar) return;
  const actives = getActiveSkills();
  if(!actives.length){ bar.style.display='none'; return; }
  bar.style.display='flex';
  bar.innerHTML='';
  actives.forEach(id=>{
    const sk = SKILL_DEFS[id];
    const cd = activeSkillCooldowns[id]||0;
    const cdMs = sk.cdMs||10000;
    const pct = cd>0 ? Math.min(100, cd/cdMs*100) : 0;
    const ready = cd<=0;

    const btn = document.createElement('div');
    btn.className='touch-skill-btn'+(ready?' ready':' on-cd');
    btn.innerHTML=`
      <div class="touch-skill-ico">${sk.ico}</div>
      <div class="touch-skill-name">${sk.name.slice(0,6)}</div>
      ${cd>0?`<div class="touch-skill-cd">${Math.ceil(cd/1000)}с</div>`:''}
      ${cd>0?`<div class="cd-sweep" style="transform:scaleY(${pct/100})"></div>`:''}
    `;
    btn.addEventListener('touchstart', ev=>{ev.preventDefault(); ev.stopPropagation();},{passive:false});
    btn.addEventListener('touchend', ev=>{
      ev.preventDefault(); ev.stopPropagation();
      activateSkill(id);
    },{passive:false});
    // fallback для десктопа
    btn.addEventListener('click', ()=>activateSkill(id));
    bar.appendChild(btn);
  });
}



const keys={};
document.addEventListener('keydown',e=>{
  keys[e.key]=true;
  if(e.key===' ') e.preventDefault();
  if(e.key==='b'||e.key==='B') useBomb();
  // Активные навыки по клавишам Q/E/R/F/W
  if(gameRunning && !gamePaused){
    const keyMap={'q':'sk_nova','e':'sk_barrier','r':'sk_timewarp','f':'sk_airstrike','w':'sk_overclock'};
    const skId = keyMap[e.key.toLowerCase()];
    if(skId) activateSkill(skId);
  }
  if(e.key==='Escape'&&gameRunning){ if(!gamePaused){gamePaused=true;document.getElementById('pauseOverlay').style.display='flex';}else{document.getElementById('resumeBtn').click();} }
});
document.addEventListener('keyup',  e=>keys[e.key]=false);

// ── BOMB UI ──
function updateBombUI(){
  let bombChip = document.getElementById('bombChip');
  if(!bombChip){
    bombChip = document.createElement('div');
    bombChip.id = 'bombChip';
    bombChip.style.cssText = 'position:absolute;bottom:72px;right:10px;z-index:10;background:rgba(8,18,35,.88);border:1.5px solid #ff6b00;border-radius:20px;padding:4px 12px;font-size:11px;font-weight:700;font-family:Orbitron,monospace;color:#ff6b00;display:flex;align-items:center;gap:5px;cursor:pointer;box-shadow:0 0 12px rgba(255,107,0,.3)';
    bombChip.addEventListener('click', useBomb);
    document.body.appendChild(bombChip);
  }
  if(bombsInStock <= 0 && getBonus().startBombs <= 0 && upgrades.bombcount === 0){
    bombChip.style.display='none'; return;
  }
  bombChip.style.display = 'flex';
  if(bombCooldown > 0){
    bombChip.style.opacity='0.5';
    bombChip.innerHTML = `💣 КД ${Math.ceil(bombCooldown/1000)}с`;
  } else {
    bombChip.style.opacity = bombsInStock > 0 ? '1' : '0.4';
    bombChip.innerHTML = `💣 x${bombsInStock}`;
  }
}

function useBomb(){
  if(!gameRunning || gamePaused) return;
  const bonus = getBonus();
  if(bombsInStock <= 0 || bombCooldown > 0) return;
  bombsInStock--;
  const baseCool = 8000;
  bombCooldown = baseCool * bonus.bombCooldownMult;
  const radius = (180 + upgrades.bombdmg * 60) * bonus.bombDmgMult;
  const dmgBonus = bonus.bombDmgMult;
  let killed = 0;
  for(let i=enemies.length-1;i>=0;i--){
    const e = enemies[i];
    if(e.isBoss){
      e.hp = Math.max(1, Math.floor(e.hp * (0.6 / dmgBonus)));
    } else {
      explode(e.x, e.y, '#ff6b00', 22);
      killed++;
      enemies.splice(i,1);
    }
  }
  // Волна взрыва
  particles.push({x:player.x,y:player.y,vx:0,vy:0,life:1,decay:.03,color:'#ff6b00',wave:true,r:0,maxR:radius,bossShot:false});
  score += killed * 30; updateHUD();
  triggerShake(18); playSound('explode');
  notify('💣 БОМБА! +'+(killed*30),'gold');
  updateBombUI();
}

// Функция нанесения урона игроку — с учётом уклонения
function damagePlayer(sourceX, sourceY){
  if(invincibleTimer > 0) return;
  // Шанс уклонения (из прокачки)
  const bonus = getBonus();
  if(bonus.dodgeChance > 0 && Math.random() < bonus.dodgeChance){
    notify('💨 УКЛОНЕНИЕ!');
    explode(player.x, player.y, '#88eeff', 8);
    return;
  }
  if(activePowerups.shield > 0){
    activePowerups.shield = 0;
    notify('🛡️ ЩИТ СЛОМАН');
    updatePowerupBar();
    explode(player.x, player.y, '#00d4ff', 15);
    invincibleTimer = (INVINCIBLE_DURATION + bonus.invincibleBonus) * 0.5;
    return;
  }
  lives--;
  updateHUD();
  playSound('hit');
  triggerShake(12);
  explode(player.x, player.y, (SKIN_COLORS[activeSkin]||SKIN_COLORS.default).a, 20);
  invincibleTimer = INVINCIBLE_DURATION + bonus.invincibleBonus;
  if(lives <= 0) endGame();
}

function update(dt){
  const cfg = DIFF[difficulty];
  const bonus = getBonus();
  const moveSpd = (activePowerups.speed>0 ? 9 : 6) * bonus.moveSpeedMult;

  // Таймер неуязвимости
  if(invincibleTimer > 0) invincibleTimer -= dt;

  // Player movement
  if(touching){ const dx=player.targetX-player.x; player.x+=dx*.2; }
  if(keys['ArrowLeft']||keys['a']||keys['A']) player.x -= moveSpd;
  if(keys['ArrowRight']||keys['d']||keys['D']) player.x += moveSpd;
  if(keys[' ']&&!autoShoot) { if(currentWeapon==='rail') fireRailgun(); else shoot(); }
  player.x = Math.max(player.w/2, Math.min(canvas.width-player.w/2, player.x));
  if(autoShoot) shoot();

  // Player trail
  playerTrail.push({x:player.x, y:player.y+player.h/2, life:1});
  if(playerTrail.length>18) playerTrail.shift();
  playerTrail.forEach(t=>t.life-=.06);

  // Screen shake decay
  if(shakeAmount>0){
    shakeAmount*=.72; shakeX=(Math.random()-.5)*shakeAmount; shakeY=(Math.random()-.5)*shakeAmount;
    if(shakeAmount<.5){shakeAmount=0;shakeX=0;shakeY=0;}
  }

  // Powerup timers
  if(activePowerups.shield>0){ activePowerups.shield-=dt; if(activePowerups.shield<0)activePowerups.shield=0; updatePowerupBar(); }
  if(activePowerups.speed>0){  activePowerups.speed-=dt;  if(activePowerups.speed<0) activePowerups.speed=0;  updatePowerupBar(); }
  if(doubleCoinActive>0){  doubleCoinActive-=dt;  if(doubleCoinActive<0)doubleCoinActive=0;   updatePowerupBar(); }
  if(laserDoubleActive>0){ laserDoubleActive-=dt; if(laserDoubleActive<0)laserDoubleActive=0; updatePowerupBar(); }
  if(timeFreezeActive>0){  timeFreezeActive-=dt;  if(timeFreezeActive<0)timeFreezeActive=0;   updatePowerupBar(); }
  if(bombCooldown>0){ bombCooldown-=dt; if(bombCooldown<0)bombCooldown=0; updateBombUI(); }
  // Тик кулдаунов активных навыков
  let skillBarNeedsUpdate = false;
  Object.keys(activeSkillCooldowns).forEach(id=>{
    if(activeSkillCooldowns[id]>0){ activeSkillCooldowns[id]-=dt; if(activeSkillCooldowns[id]<0)activeSkillCooldowns[id]=0; skillBarNeedsUpdate=true; }
  });
  Object.keys(activeSkillEffects).forEach(id=>{
    if(activeSkillEffects[id]>0){ activeSkillEffects[id]-=dt; if(activeSkillEffects[id]<0){ activeSkillEffects[id]=0; invalidateBonus(); } skillBarNeedsUpdate=true; }
  });
  if(skillBarNeedsUpdate) updateSkillBar();
  // Регенерация от навыка
  if(!window._regenTimer) window._regenTimer=0;
  window._regenTimer-=dt;
  if(window._regenTimer<=0){
    const regenLvl=getBonus().regenLvl||0;
    window._regenTimer = regenLvl>0 ? 60000/regenLvl : 99999;
    if(regenLvl>0 && lives < 9){ lives++; updateHUD(); notify('💚 РЕГЕНЕРАЦИЯ','gold'); }
  }
  // Рельса: тик кулдауна и активный луч
  if(railCooldown>0){ railCooldown-=dt; if(railCooldown<0)railCooldown=0; updateRailUI(); }
  if(railBeam){
    railBeam.timer-=dt;
    updateRailUI();
    // Каждые 120мс выжигаем врагов под лучом
    if(!railBeam.burnTimer) railBeam.burnTimer=0;
    railBeam.burnTimer-=dt;
    if(railBeam.burnTimer<=0){
      railBeam.burnTimer=120;
      const bx = player.x;
      const bonus = getBonus();
      for(let i=enemies.length-1;i>=0;i--){
        const e=enemies[i];
        if(e.isBoss || e.isMiniBoss) continue; // боссов и мини-боссов не убиваем лучом
        if(Math.abs(e.x - bx) < e.hw + 14){
          for(let p=0;p<8;p++) particles.push({x:e.x+(Math.random()-.5)*20,y:e.y+(Math.random()-.5)*20,vx:(Math.random()-.5)*4,vy:(Math.random()-.5)*4,life:1,decay:.06,color:`hsl(${160+Math.random()*40},100%,70%)`,size:3+Math.random()*3,wave:false,bossShot:false});
          const pts = Math.floor((e.score||10)*level*DIFF[difficulty].scoreMult*combo);
          score+=pts; levelProgress+=pts;
          coins += e.coin||1;
          killedEnemies++;
          addCombo();
          LS.set('totalKills',(+LS.get('totalKills',0))+1);
          enemies.splice(i,1);
        }
      }
      shakeAmount = Math.max(shakeAmount, 3);
    }
    if(railBeam.timer<=0) railBeam=null;
  }

  // Combo timer
  if(comboTimer>0) comboTimer-=dt;
  else if(combo>1){ combo=1; document.getElementById('comboDisplay').classList.add('combo-hidden'); }

  // Background scroll
  stars.forEach(s=>{s.y+=s.sp;if(s.y>canvas.height){s.y=0;s.x=Math.random()*canvas.width;}});
  nebulas.forEach(n=>{n.y+=n.sp;if(n.y>canvas.height+n.r){n.y=-n.r;n.x=Math.random()*canvas.width;}});
  planets.forEach(p=>{p.y+=p.sp;if(p.y>canvas.height+p.r+50){p.y=-p.r-50;p.x=Math.random()*canvas.width;}});
  asteroids.forEach(a=>{a.y+=a.sp;a.angle+=a.rot;if(a.y>canvas.height+30){a.y=-30;a.x=Math.random()*canvas.width;}});

  // Bullets
  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i];
    b.y-=b.sp;
    if(b.vx) b.x+=b.vx;
    if(b.type==='rocket'&&b.homing&&enemies.length>0){
      let nearest=null, nearDist=Infinity;
      enemies.forEach(e=>{ const d=Math.hypot(e.x-b.x,e.y-b.y); if(d<nearDist){nearDist=d;nearest=e;} });
      if(nearest){
        const dx=nearest.x-b.x, dy=nearest.y-b.y, dist=Math.max(nearDist,.1);
        b.x+=dx/dist*2.5; b.y+=dy/dist*2.5-b.sp;
        b.angle=Math.atan2(dx,-(dy-b.sp*dist))*0.5;
      }
    }
    // Рикошет от краёв (навык sk_ricochet)
    if(getBonus().ricochet && !b.ricocheted){
      if(b.x<0||b.x>canvas.width){ b.vx = b.vx ? -b.vx : (b.x<0?2:-2); b.x=Math.max(1,Math.min(canvas.width-1,b.x)); b.ricocheted=true; }
    }
    if(b.y<-50||b.x<-30||b.x>canvas.width+30||b.y>canvas.height+30) bullets.splice(i,1);
  }

  // Powerup objects
  for(let i=powerups.length-1;i>=0;i--){
    const p=powerups[i];
    if(bonus.magnetRadius>0){
      const dx=player.x-p.x, dy=player.y-p.y, dist=Math.hypot(dx,dy);
      if(dist<bonus.magnetRadius){ p.x+=dx/dist*4.5; p.y+=dy/dist*4.5; }
    }
    p.y+=p.sp; p.angle+=.04;
    // Бонус не исчезает сам — только когда уходит за нижний край экрана (ниже игрока)
    if(p.y > canvas.height + p.r + 10){ powerups.splice(i,1); continue; }
    if(Math.abs(p.x-player.x)<(p.r+player.w/2)&&Math.abs(p.y-player.y)<(p.r+player.h/2)){
      applyPowerup(p.type); powerups.splice(i,1);
    }
  }

  // Enemies update
  for(let i=enemies.length-1;i>=0;i--){
    const e=enemies[i];
    if(e.isBoss){
      e.bossType.update(e, dt);
      const hpRatio = e.hp / e.maxHp;

      // ── Призыв прислужников ──
      if(e.minionTimer !== undefined){
        e.minionTimer -= dt;
        if(e.minionTimer <= 0){
          const minionCount = enemies.filter(en=>!en.isBoss).length;
          if(minionCount < 4 + Math.floor(level/3)){
            const spawnCount = 1 + Math.floor(level/8);
            for(let m=0;m<spawnCount;m++){
              const side = Math.random()<.5 ? -1 : 1;
              enemies.push({
                x: e.x + side*(e.hw + 30 + Math.random()*60),
                y: e.y + e.hh + 10,
                hw:10,hh:10,sp:1.4+level*.06,hp:1,maxHp:1,
                type:'fast',isBoss:false,isMiniBoss:false,
                zigAngle:0,shootTimer:0,stealthTimer:0,stealthAlpha:1,
                splitDone:false,swarmOffset:Math.random()*Math.PI*2,
                score:5,coin:0,
                dashTimer:0,dashVx:0,dashing:false,dashDuration:0,
                shieldHp:0,teleportTimer:0,bomberArmed:false,
              });
            }
          }
          // Интервал призыва: фаза 3 быстрее
          e.minionTimer = e.phase3entered ? 2500 : e.phase2entered ? 3500 : 5000;
        }
      }

      // ── Фазовые переходы ──
      if(!e.phase2entered && hpRatio<=0.6){
        e.phase2entered=true;
        e.sp*=1.35;
        explode(e.x,e.y,e.bossType.color,30); triggerShake(10);
        notify('⚠️ ФАЗА 2!','boss'); playSound('explode');
      }
      if(!e.phase3entered && hpRatio<=0.25){
        e.phase3entered=true;
        e.sp*=1.5;
        explode(e.x,e.y,e.bossType.color,50); triggerShake(16);
        notify('💀 ФАЗА 3 — ЯРОСТЬ!','boss'); playSound('explode');
        // Рассыпает снаряды по кругу
        for(let i=0;i<12;i++){
          const ang=i/12*Math.PI*2;
          spawnBossShot(e.x,e.y,Math.cos(ang)*3,Math.sin(ang)*3,e.bossType.color,9);
        }
      }
      document.getElementById('bossFill').style.width=(e.hp/e.maxHp*100)+'%';
    }else{
      const frozen = timeFreezeActive>0;
      if(!frozen){
        // Мини-босс — своя логика
        if(e.isMiniBoss && e.miniType){
          e.y += e.sp * 0.4;
          if(e.y < 80) e.y += 1.5;
          e.miniType.update(e, dt);
          e.x=Math.max(e.hw, Math.min(canvas.width-e.hw, e.x));
        } else {
        e.y += e.sp;
        switch(e.type){
          case 'zigzag':
            e.zigAngle+=.09; e.x+=Math.sin(e.zigAngle)*3.5;
            break;
          case 'swarm':
            e.zigAngle+=.1; e.swarmOffset+=dt*.001;
            e.x+=Math.sin(e.swarmOffset)*2.5;
            break;
          case 'shooter':
            e.shootTimer-=dt;
            if(e.shootTimer<=0){
              e.shootTimer=1400-level*50;
              const dx=player.x-e.x, dy=player.y-e.y;
              const dist=Math.max(Math.hypot(dx,dy),1);
              spawnBossShot(e.x, e.y+e.hh, dx/dist*2.5, dy/dist*2.5, '#ff8800', 7);
            }
            break;
          case 'bomber':
            // Летит к игроку, при близком расстоянии взрывается
            { const dx=player.x-e.x, dy=player.y-e.y, d=Math.hypot(dx,dy);
              e.x+=dx/d*e.sp*0.6;
              if(e.bomberArmed && d<60){
                explode(e.x,e.y,'#ff8800',50); triggerShake(10);
                enemies.forEach(en=>{if(Math.hypot(en.x-e.x,en.y-e.y)<70 && en!==e) en.hp-=2;});
                damagePlayer(e.x,e.y);
                enemies.splice(enemies.indexOf(e),1);
              }
            }
            break;
          case 'dasher':
            // Рывок к игроку каждые ~1 сек
            e.dashTimer-=dt;
            if(e.dashing){
              e.x+=e.dashVx; e.dashDuration-=dt;
              if(e.dashDuration<=0) e.dashing=false;
            } else if(e.dashTimer<=0){
              e.dashTimer=900+Math.random()*600;
              e.dashing=true; e.dashDuration=220;
              const dx=player.x-e.x; e.dashVx=dx/Math.abs(dx||1)*9;
            }
            break;
          case 'stealth':
            e.stealthTimer+=dt;
            const phase=(e.stealthTimer%3000)/3000;
            e.stealthAlpha = phase<.5 ? 1 : .08+.12*Math.sin(phase*Math.PI*6);
            break;
          case 'shielder':
            // Щит поглощает первые 3 попадания
            break;
          case 'teleporter':
            // Телепортируется случайно каждые 2-3 сек
            e.teleportTimer-=dt;
            if(e.teleportTimer<=0){
              e.teleportTimer=2000+Math.random()*1000;
              e.x=e.hw+Math.random()*(canvas.width-e.hw*2);
              e.y=Math.max(-e.hh, Math.min(canvas.height*0.6, e.y+(Math.random()-.5)*100));
              for(let p=0;p<8;p++) particles.push({x:e.x,y:e.y,vx:(Math.random()-.5)*5,vy:(Math.random()-.5)*5,life:1,decay:.07,color:'#cc88ff',size:3,wave:false,bossShot:false});
            }
            break;
        }
        e.x=Math.max(e.hw, Math.min(canvas.width-e.hw, e.x));
        } // end non-miniboss
      }
    }

    // ════════════════════════════════════════════════════
    // ИЗМЕНЕНИЕ: враги больше НЕ наносят урон при уходе
    // за нижний край экрана — они просто исчезают!
    // ════════════════════════════════════════════════════
    if(e.y > canvas.height + 80){
      if(e.isBoss){
        bossActive=false; bossEnemy=null;
        document.getElementById('bossBar').style.display='none';
      }
      // Враг ушёл — просто удаляем без урона
      enemies.splice(i,1);
    }
  }

  // ── Bullet ↔ Enemy collisions ──
  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i];
    if(!b) continue;
    let hit=false;
    for(let j=enemies.length-1;j>=0;j--){
      const e=enemies[j];
      if(!e) continue;
      if(b.pierce && b.pierced && b.pierced.has(j)) continue;
      const hitW=b.type==='rocket'||b.type==='plasma'?e.hw+12:e.hw;
      const hitH=b.type==='rocket'||b.type==='plasma'?e.hh+12:e.hh;
      if(b.x>e.x-hitW&&b.x<e.x+hitW&&b.y>e.y-hitH&&b.y<e.y+hitH){
        // Shielder: щит поглощает урон
        if(e.type==='shielder' && e.shieldHp>0){
          e.shieldHp--;
          playSound('hit');
          for(let p=0;p<5;p++) particles.push({x:e.x,y:e.y,vx:(Math.random()-.5)*5,vy:(Math.random()-.5)*5,life:1,decay:.08,color:'#00aaff',size:3,wave:false,bossShot:false});
          if(b.type!=='plasma'&&b.type!=='rocket'&&!b.pierce){ bullets.splice(i,1); }
          hit=true;
          if(hit) break;
        }
        if(b.type==='rocket'){
          explode(b.x,b.y,'#ff6b00',45); triggerShake(12); playSound('explode');
          enemies.forEach((en)=>{ if(Math.hypot(en.x-b.x,en.y-b.y)<80) en.hp-=Math.ceil((b.dmg||1)*1.5); });
          // Rocket split upgrade
          if(b.split>0){
            for(let s=0;s<2;s++){
              const ang = (s===0?-0.5:0.5);
              bullets.push({x:b.x,y:b.y,w:8,h:14,sp:b.sp*0.7,
                dmg:Math.ceil(b.dmg*0.6),type:'rocket',angle:ang,homing:true,split:0});
            }
          }
          bullets.splice(i,1); hit=true;
        }else if(b.type==='plasma'){
          // Plasma: AoE damage in radius
          explode(b.x,b.y,'#a855f7',35); triggerShake(8); playSound('explode');
          enemies.forEach(en=>{ if(Math.hypot(en.x-b.x,en.y-b.y)<60){ en.hp-=Math.ceil(b.dmg*0.6); } });
          bullets.splice(i,1); hit=true;
        }else if(b.pierce){
          b.pierced.add(j);
          e.hp-=Math.ceil(b.dmg||1);
          playSound('hit');
          // Check pierce limit for laser upgrade
          if(b.maxPierce !== undefined && b.pierced.size > b.maxPierce){
            bullets.splice(i,1); hit=true;
          }
        }else{
          bullets.splice(i,1); hit=true;
          e.hp-=Math.ceil(b.dmg||1);
          playSound('hit');
        }
        if(e.hp<=0) killEnemy(j, cfg);
        if(hit) break;
      }
    }
  }
  for(let i=bullets.length-1;i>=0;i--){ if(bullets[i]&&bullets[i].pierce&&bullets[i].y<-50) bullets.splice(i,1); }

  // ── Boss shots ↔ player ──
  // ИЗМЕНЕНИЕ: урон от снарядов босса через centralized damagePlayer()
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];
    if(!p.bossShot) continue;
    if(Math.abs(p.x-player.x)<player.w/2&&Math.abs(p.y-player.y)<player.h/2){
      particles.splice(i,1);
      damagePlayer(p.x, p.y);
    }
  }

  // ── Enemy ↔ player ФИЗИЧЕСКОЕ столкновение ──
  // ИЗМЕНЕНИЕ: урон только при реальном пересечении хитбоксов
  for(let i=enemies.length-1;i>=0;i--){
    const e=enemies[i];
    if(Math.abs(e.x-player.x)<(e.hw+player.w*.45)&&Math.abs(e.y-player.y)<(e.hh+player.h*.45)){
      // Враг физически врезался в корабль
      if(!e.isBoss){
        explode(e.x, e.y, '#ff2080', 20);
        enemies.splice(i,1);
      }
      damagePlayer(e.x, e.y);
    }
  }

  // Particles update
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];
    p.x+=p.vx||0; p.y+=p.vy||0;
    p.life-=p.decay;
    if(p.wave&&p.r!==undefined) p.r=p.maxR*(1-p.life);
    if(p.life<=0) particles.splice(i,1);
  }

  // Spawn enemies
  if(!bossActive && Math.random()<cfg.spawn+level*.0015) spawnEnemy();
}

function killEnemy(j, cfg){
  const e=enemies[j];
  if(!e) return;
  if(e.isBoss){
    // ── Проверяем фазы ──
    const hpRatio = e.hp / e.maxHp;

    // Феникс — фаза 2 при смерти (уже было)
    if(e.bossId==='phoenix' && !e.reborn){
      e.reborn=true; e.phase=2;
      e.hp=Math.floor(e.maxHp*.6);
      explode(e.x,e.y,'#ff4400',40); triggerShake(14); playSound('explode');
      notify('🔥 ФЕНИКС ВОЗРОЖДАЕТСЯ!','boss');
      return;
    }

    // Страж — фаза 2 при 50% HP (ускорение + двойная стрельба)
    if(e.bossId==='guardian' && !e.phase2entered && hpRatio<=0 && e.phase!==2){
      // Уже при 0 — убиваем
    }

    const col=e.bossType.color;
    explode(e.x,e.y,col,60); triggerShake(20); playSound('explode');
    bossActive=false; bossEnemy=null; document.getElementById('bossBar').style.display='none';
    bossesKilled++;
    const pts = 500*level;
    score+=pts; levelProgress+=pts;
    LS.set('totalBosses',(+LS.get('totalBosses',0))+1);
    notify(e.bossType.name+' УНИЧТОЖЕН! +'+pts,'boss');
    checkAch('boss1');
  }else if(e.isMiniBoss){
    explode(e.x,e.y,e.miniType.color,45); triggerShake(12); playSound('explode');
    notify('💀 '+e.miniType.name+' УНИЧТОЖЕН!','gold');
    // Мини-босс выбрасывает гарантированный бонус
    spawnPowerup(e.x, e.y, true);
  }else{
    const col=e.type==='fast'?'#00d4ff':e.type==='tank'?'#a855f7':
               e.type==='bomber'?'#ff8800':e.type==='dasher'?'#ff44aa':
               e.type==='shielder'?'#00aaff':e.type==='teleporter'?'#cc88ff':'#ff6b00';
    explode(e.x,e.y,col); triggerShake(e.type==='tank'?6:4);
  }
  enemies.splice(j,1);
  killedEnemies++;
  LS.set('totalKills',(+LS.get('totalKills',0))+1);
  if(killedEnemies===1) checkAch('first_kill');

  if(e.type==='splitter' && !e.splitDone){
    for(let s=0;s<2;s++){
      enemies.push({
        x:e.x+(s?1:-1)*18, y:e.y,
        hw:e.hw*.55, hh:e.hh*.55,
        sp:e.sp*1.3, hp:1, maxHp:1,
        type:'fast', isBoss:false, isMiniBoss:false,
        zigAngle:0, shootTimer:0, stealthTimer:0, stealthAlpha:1,
        splitDone:true, swarmOffset:0,
        dashTimer:0,dashVx:0,dashing:false,dashDuration:0,shieldHp:0,teleportTimer:0,bomberArmed:false,
        score:5,coin:1,
      });
    }
  }

  addCombo();

  // Детонатор: каждое 5-е убийство — взрыв
  if(getBonus().detonator && !e.isBoss){
    killCounter = (killCounter||0) + 1;
    if(killCounter % 5 === 0){
      explode(e.x, e.y, '#ff8800', 30); triggerShake(8);
      for(let j=enemies.length-1;j>=0;j--){
        if(!enemies[j].isBoss && Math.hypot(enemies[j].x-e.x,enemies[j].y-e.y)<80 && j!==j) enemies[j].hp -= 5;
      }
    }
  }

  const basePts = Math.floor((e.isBoss?500:e.isMiniBoss?80:10)*level*DIFF[difficulty].scoreMult*combo);
  score+=basePts; levelProgress+=basePts;

  const bns = getBonus();
  let earnedCoins = Math.floor((e.isBoss?8:e.isMiniBoss?5:0.5)*level*(combo>5?2:1)*bns.coinMult);
  if(doubleCoinActive>0) earnedCoins*=2;
  coins+=earnedCoins;

  // Вампиризм — восстановление HP при убийстве
  const vamp = getBonus().vampirism||0;
  if(vamp>0 && Math.random()<vamp){ lives=Math.min(lives+1,9); updateHUD(); notify('🧛 +1 ЖИЗНЬ','gold'); }

  // Ship XP only via upgrade purchases — not during combat
  savePersistent();

  const dropChance = DIFF[difficulty].powerupRate * (
    e.type==='tank'?3 : e.type==='splitter'?2.5 : e.type==='shooter'?2 :
    e.isBoss?5 : 1
  ) * (getBonus().dropLuckMult || 1);
  if(Math.random()<dropChance) spawnPowerup(e.x,e.y);

  if(combo>1) notify('+'+basePts+' x'+combo,'gold');
  else notify('+'+basePts,'gold');

  if(score>=1000) checkAch('score1000');
  if(score>=5000) checkAch('score5000');
  if(level>=5) checkAch('survive5');

  updateHUD();

  // Уровень миссии — независимый от корабля, растёт медленно от убийств
  const diffMult = {easy:.7, normal:1, hard:1.3, nightmare:1.6}[difficulty]||1;
  const threshold = Math.floor((800 + level*350 + level*level*40) * diffMult);
  if(levelProgress >= threshold){
    level++;
    levelProgress = 0;
    notify('⚔️ УРОВЕНЬ МИССИИ ' + level, 'levelup');
    playSound('levelup');
    updateHUD();
    if(level % 5 === 0 && !bossActive) spawnBoss();
  }
}

// ════════════════════════════════════════════════════
// DRAW
// ════════════════════════════════════════════════════
function draw(){
  const skinC = SKIN_COLORS[activeSkin] || SKIN_COLORS.default;
  ctx.save();
  if(shakeAmount>0) ctx.translate(shakeX, shakeY);

  // Background
  const bg=ctx.createLinearGradient(0,0,0,canvas.height);
  bg.addColorStop(0,'#040410'); bg.addColorStop(.5,'#0e0420'); bg.addColorStop(1,'#040410');
  ctx.fillStyle=bg; ctx.fillRect(0,0,canvas.width,canvas.height);

  nebulas.forEach(n=>{
    const g=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,n.r);
    g.addColorStop(0,`hsla(${n.hue},80%,60%,${n.o})`); g.addColorStop(1,'transparent');
    ctx.fillStyle=g; ctx.fillRect(n.x-n.r,n.y-n.r,n.r*2,n.r*2);
  });

  planets.forEach(p=>{
    ctx.save(); ctx.globalAlpha=p.o;
    const pg=ctx.createRadialGradient(p.x-p.r*.3,p.y-p.r*.3,0,p.x,p.y,p.r);
    pg.addColorStop(0,`hsl(${p.hue},60%,55%)`); pg.addColorStop(.6,`hsl(${p.hue},50%,30%)`); pg.addColorStop(1,`hsl(${p.hue},40%,10%)`);
    ctx.fillStyle=pg; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
    if(p.rings){
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.ringAngle); ctx.scale(1,.3);
      ctx.strokeStyle=`hsla(${p.hue},60%,70%,.5)`; ctx.lineWidth=4;
      ctx.beginPath(); ctx.arc(0,0,p.r*1.5,0,Math.PI*2); ctx.stroke();
      ctx.strokeStyle=`hsla(${p.hue},60%,70%,.3)`; ctx.lineWidth=8;
      ctx.beginPath(); ctx.arc(0,0,p.r*1.8,0,Math.PI*2); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  });

  asteroids.forEach(a=>{
    ctx.save(); ctx.globalAlpha=.5; ctx.translate(a.x,a.y); ctx.rotate(a.angle);
    ctx.fillStyle='#554433'; ctx.strokeStyle='#776655'; ctx.lineWidth=1.5;
    ctx.beginPath();
    a.pts.forEach((p,i)=>{ const px=Math.cos(p.a)*a.r*p.r, py=Math.sin(p.a)*a.r*p.r; i===0?ctx.moveTo(px,py):ctx.lineTo(px,py); });
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  });

  const t=Date.now()/1000;
  stars.forEach(s=>{
    const f=.7+.3*Math.sin(t*s.sp*3+s.x);
    ctx.fillStyle=`rgba(255,255,255,${s.o*f})`; ctx.fillRect(s.x,s.y,s.s,s.s);
  });

  playerTrail.forEach(pt=>{
    if(pt.life<=0) return;
    ctx.save(); ctx.globalAlpha=pt.life*.45;
    const trailColor = (TRAIL_STYLES[custom.trailStyle]||TRAIL_STYLES.fire).colors[0]+'66';
    ctx.fillStyle=trailColor; ctx.shadowBlur=8; ctx.shadowColor=skinC.glow;
    const sz=6*pt.life; ctx.beginPath(); ctx.arc(pt.x,pt.y,sz,0,Math.PI*2); ctx.fill();
    ctx.restore();
  });

  powerups.forEach(p=>{
    ctx.save();
    const def=POWERUP_DEFS[p.type]||{color:'#ffffff'};
    const col=def.color;
    const pulse = 0.75 + 0.25*Math.sin(Date.now()*.005 + p.x);
    ctx.globalAlpha = pulse;
    ctx.translate(p.x,p.y);
    ctx.rotate(p.angle);
    if(p.rare){
      ctx.shadowBlur=20+10*Math.sin(Date.now()*.006);
      ctx.shadowColor=col;
    } else {
      ctx.shadowBlur=14; ctx.shadowColor=col;
    }
    ctx.strokeStyle=col; ctx.lineWidth=2;
    ctx.fillStyle=col+'22';
    ctx.beginPath(); ctx.arc(0,0,p.r,0,Math.PI*2);
    ctx.fill(); ctx.stroke();
    if(p.rare){
      ctx.save(); ctx.rotate(Date.now()*.003);
      ctx.strokeStyle=col+'66'; ctx.lineWidth=1; ctx.setLineDash([4,5]);
      ctx.beginPath(); ctx.arc(0,0,p.r+5,0,Math.PI*2); ctx.stroke();
      ctx.setLineDash([]); ctx.restore();
    }
    ctx.shadowBlur=0;
    ctx.font=`${p.r}px serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='white'; ctx.fillText(p.icon,0,2);
    ctx.restore();
  });

  // ── Player ship (мигает при неуязвимости) ──
  ctx.save();
  if(invincibleTimer > 0){
    // Мигание: видим каждые 100мс
    ctx.globalAlpha = Math.floor(invincibleTimer / 100) % 2 === 0 ? 0.3 : 1.0;
  }
  if(custom.glow){ ctx.shadowBlur=24; ctx.shadowColor=skinC.glow; }
  const sg=ctx.createLinearGradient(player.x-player.w/2,player.y-player.h/2,player.x+player.w/2,player.y+player.h/2);
  sg.addColorStop(0,skinC.a); sg.addColorStop(1,skinC.b);
  ctx.fillStyle=sg;
  drawShipPath(ctx, custom.shipShape, player.x, player.y, player.w/2, player.h/2);
  ctx.fill();
  if(activePowerups.shield>0){
    ctx.strokeStyle='#00d4ff88'; ctx.lineWidth=3; ctx.shadowBlur=16; ctx.shadowColor='#00d4ff';
    ctx.beginPath(); ctx.arc(player.x,player.y,player.w*.9,0,Math.PI*2); ctx.stroke();
  }
  const trailCol = (TRAIL_STYLES[custom.trailStyle] || TRAIL_STYLES.fire).colors[0];
  const flame=ctx.createLinearGradient(player.x,player.y+player.h/2,player.x,player.y+player.h/2+22);
  flame.addColorStop(0,trailCol+'cc'); flame.addColorStop(1,'transparent');
  ctx.fillStyle=flame; ctx.shadowBlur=0;
  ctx.beginPath();
  ctx.moveTo(player.x-9,player.y+player.h/2);
  ctx.lineTo(player.x+9,player.y+player.h/2);
  ctx.lineTo(player.x,player.y+player.h/2+14+Math.random()*10);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  // ── РЕЛЬСА — активный луч ──
  if(railBeam){
    const progress = railBeam.timer / railBeam.maxTimer;
    const fadeIn = Math.min((1-progress)*8, 1);  // быстро появляется
    const alpha = Math.min(fadeIn, progress < 0.15 ? progress*6 : 1); // гаснет в конце
    const bx = player.x; // луч всегда следует за кораблём
    ctx.save();
    // Широкое внешнее свечение
    ctx.globalAlpha = alpha * 0.25;
    const rg1 = ctx.createLinearGradient(bx-55,0,bx+55,0);
    rg1.addColorStop(0,'transparent'); rg1.addColorStop(0.5,'#00ffcc'); rg1.addColorStop(1,'transparent');
    ctx.fillStyle = rg1; ctx.fillRect(bx-55, 0, 110, canvas.height);
    // Средний луч
    ctx.globalAlpha = alpha * 0.6;
    const rg2 = ctx.createLinearGradient(bx-16,0,bx+16,0);
    rg2.addColorStop(0,'transparent'); rg2.addColorStop(0.5,'#00ffee'); rg2.addColorStop(1,'transparent');
    ctx.fillStyle = rg2; ctx.fillRect(bx-16, 0, 32, canvas.height);
    // Яркий сердечник
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = 25; ctx.shadowColor = '#00ffcc';
    const rg3 = ctx.createLinearGradient(bx-4,0,bx+4,0);
    rg3.addColorStop(0,'transparent'); rg3.addColorStop(0.5,'#ffffff'); rg3.addColorStop(1,'transparent');
    ctx.fillStyle = rg3; ctx.fillRect(bx-4, 0, 8, canvas.height);
    // Энергетические кольца скользят вниз
    ctx.globalAlpha = alpha * 0.55;
    ctx.strokeStyle = '#00ffcc'; ctx.shadowBlur = 12;
    for(let ri=0; ri<7; ri++){
      const ry = ((Date.now()*0.45 + ri*(canvas.height/7)) % canvas.height);
      const rw = 20 + 8*Math.sin(Date.now()*0.006+ri);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(bx, ry, rw, 5, 0, 0, Math.PI*2); ctx.stroke();
    }
    // Таймер — полоска над кораблём
    ctx.globalAlpha = alpha * 0.9;
    ctx.shadowBlur = 0;
    const barW = 60, barH = 4;
    const barX = bx - barW/2, barY = player.y - player.h - 12;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 2); ctx.fill();
    ctx.fillStyle = `hsl(${170 + progress*30},100%,60%)`;
    ctx.beginPath(); ctx.roundRect(barX, barY, barW*progress, barH, 2); ctx.fill();
    ctx.restore();
  }

  // Bullets
  const _now = Date.now();
  bullets.forEach(b=>{
    ctx.save();
    if(b.type==='plasma'){
      // Plasma orb — pulsing purple circle
      const pulse = 1 + 0.15*Math.sin(_now*0.01 + b.x);
      ctx.shadowBlur = 20; ctx.shadowColor = '#a855f7';
      const pg = ctx.createRadialGradient(b.x,b.y,0,b.x,b.y,b.w*pulse);
      pg.addColorStop(0,'#ff88ff'); pg.addColorStop(0.5,'#a855f7'); pg.addColorStop(1,'#a855f700');
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.w*pulse, 0, Math.PI*2); ctx.fill();
    } else if(b.type==='lightning'){
      // Lightning bolt — jagged line upward
      ctx.strokeStyle = '#ffff44'; ctx.lineWidth = 3;
      ctx.shadowBlur = 14; ctx.shadowColor = '#ffff00';
      ctx.beginPath();
      ctx.moveTo(b.x, b.y+b.h);
      ctx.lineTo(b.x + (Math.random()-.5)*6, b.y + b.h*0.5);
      ctx.lineTo(b.x + (Math.random()-.5)*6, b.y);
      ctx.stroke();
      // Core white
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.moveTo(b.x, b.y+b.h); ctx.lineTo(b.x, b.y); ctx.stroke();
    } else {
      const wc = b.type==='rocket'?{a:'#ff6b00',b:'#ffaa00'}
               : b.type==='shotgun'?{a:'#ffd700',b:'#ff9900'}
               : BULLET_COLORS[custom.bulletColor];
      if(custom.glow){ ctx.shadowBlur=b.type==='rocket'?18:12; ctx.shadowColor=wc.a; }
      if(b.type==='rocket'){
        ctx.translate(b.x,b.y); ctx.rotate(b.angle||0);
        const rg=ctx.createLinearGradient(0,-b.h/2,0,b.h/2);
        rg.addColorStop(0,wc.a); rg.addColorStop(1,wc.b);
        ctx.fillStyle=rg; ctx.beginPath(); ctx.roundRect(-b.w/2,-b.h/2,b.w,b.h,4); ctx.fill();
        ctx.fillStyle=wc.a+'55'; ctx.beginPath();
        ctx.moveTo(-b.w/2,b.h/2); ctx.lineTo(b.w/2,b.h/2); ctx.lineTo(0,b.h/2+9+Math.random()*6); ctx.closePath(); ctx.fill();
      }else{
        const bg2=ctx.createLinearGradient(b.x,b.y,b.x,b.y+b.h);
        bg2.addColorStop(0,wc.a); bg2.addColorStop(1,wc.b);
        ctx.fillStyle=bg2; ctx.beginPath(); ctx.roundRect(b.x-b.w/2,b.y,b.w,b.h,3); ctx.fill();
      }
    }
    ctx.restore();
  });

  // Enemies
  const animT=Date.now()/400;
  enemies.forEach(e=>{
    ctx.save();
    if(e.isBoss){
      const col=e.bossType.color;
      const pulse=1+.05*Math.sin(animT*2);
      ctx.translate(e.x,e.y); ctx.scale(pulse,pulse);
      if(custom.glow){ ctx.shadowBlur=30; ctx.shadowColor=col; }
      e.bossType.draw(e,ctx,animT);
      if(e.hp<e.maxHp){
        const bw=e.hw*2,bh=5,by=-e.hh-18;
        ctx.fillStyle='rgba(0,0,0,.6)'; ctx.fillRect(-e.hw,by,bw,bh);
        const pct=e.hp/e.maxHp;
        ctx.fillStyle=pct>.5?'#00ff88':pct>.25?'#ff9900':'#ff0066';
        ctx.fillRect(-e.hw,by,bw*pct,bh);
      }
    }else{
      const alpha = e.stealthAlpha !== undefined ? e.stealthAlpha : 1;
      ctx.globalAlpha = alpha;
      const ECOLS={
        normal:'#ff2080', fast:'#00d4ff', zigzag:'#ffaa00',
        tank:'#a855f7', swarm:'#44ff88', shooter:'#ff8800',
        splitter:'#ff4466', stealth:'#aaaaff',
        bomber:'#ff6600', dasher:'#ff44aa',
        shielder:'#00aaff', teleporter:'#cc88ff',
        miniboss: e.miniType ? e.miniType.color : '#ffdd00',
      };
      const col = e.isMiniBoss ? e.miniType.color : (ECOLS[e.type]||'#ff2080');
      const pulse=1+.03*Math.sin(animT+e.x*.01);
      ctx.translate(e.x,e.y); ctx.scale(pulse,pulse);
      if(custom.glow&&alpha>0.3){ ctx.shadowBlur=e.isMiniBoss?22:14; ctx.shadowColor=col; }

      const eg=ctx.createRadialGradient(0,0,0,0,0,e.hw);
      eg.addColorStop(0,col+'ff'); eg.addColorStop(.6,col+'aa'); eg.addColorStop(1,col+'22');
      ctx.fillStyle=eg; ctx.beginPath();

      switch(e.type){
        case 'normal':
          for(let a=0;a<6;a++){ const ang=(a/6)*Math.PI*2-Math.PI/6; ctx.lineTo(Math.cos(ang)*e.hw,Math.sin(ang)*e.hh); }
          ctx.closePath(); ctx.fill();
          ctx.fillStyle=col+'44'; ctx.beginPath(); ctx.arc(0,0,e.hw*.4,0,Math.PI*2); ctx.fill();
          break;
        case 'fast':
          ctx.moveTo(0,-e.hh); ctx.lineTo(e.hw,0); ctx.lineTo(0,e.hh); ctx.lineTo(-e.hw,0);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle=col+'88'; ctx.lineWidth=1.5;
          [-e.hw*.5, e.hw*.5].forEach(ox=>{ ctx.beginPath(); ctx.moveTo(ox,-e.hh*.3); ctx.lineTo(ox,e.hh*.3); ctx.stroke(); });
          break;
        case 'zigzag':
          ctx.moveTo(0,-e.hh); ctx.lineTo(-e.hw*.6,-e.hh*.2);
          ctx.lineTo(-e.hw,e.hh*.4); ctx.lineTo(0,e.hh*.1);
          ctx.lineTo(e.hw,e.hh*.4); ctx.lineTo(e.hw*.6,-e.hh*.2);
          ctx.closePath(); ctx.fill();
          break;
        case 'tank':
          ctx.roundRect(-e.hw,-e.hh,e.hw*2,e.hh*2,6); ctx.fill();
          ctx.strokeStyle=col+'77'; ctx.lineWidth=3;
          ctx.beginPath(); ctx.roundRect(-e.hw*.72,-e.hh*.72,e.hw*1.44,e.hh*1.44,4); ctx.stroke();
          ctx.fillStyle=col+'bb';
          ctx.beginPath(); ctx.roundRect(-5,e.hh*.3,10,e.hh*.8,3); ctx.fill();
          break;
        case 'swarm':
          ctx.moveTo(0,-e.hh); ctx.lineTo(e.hw,e.hh); ctx.lineTo(-e.hw,e.hh);
          ctx.closePath(); ctx.fill();
          break;
        case 'shooter':
          for(let a=0;a<5;a++){ const ang=(a/5)*Math.PI*2; ctx.lineTo(Math.cos(ang)*e.hw,Math.sin(ang)*e.hh); }
          ctx.closePath(); ctx.fill();
          [-e.hw*.8, e.hw*.8].forEach(ox=>{
            ctx.fillStyle=col+'cc';
            ctx.beginPath(); ctx.roundRect(ox-4,e.hh*.2,8,e.hh*.9,3); ctx.fill();
          });
          if(e.shootTimer<300&&e.shootTimer>0){
            ctx.save(); ctx.globalAlpha=.3; ctx.strokeStyle=col; ctx.lineWidth=1; ctx.setLineDash([3,5]);
            ctx.beginPath(); ctx.moveTo(0,e.hh); ctx.lineTo(player.x-e.x, player.y-e.y); ctx.stroke();
            ctx.setLineDash([]); ctx.restore();
          }
          break;
        case 'splitter':
          ctx.arc(0,0,e.hw*.7,0,Math.PI*2); ctx.fill();
          ctx.strokeStyle=col+'cc'; ctx.lineWidth=2;
          ctx.beginPath(); ctx.moveTo(-e.hw,.0); ctx.lineTo(e.hw,0); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0,-e.hh); ctx.lineTo(0,e.hh); ctx.stroke();
          [[0,-1],[0,1],[-1,0],[1,0]].forEach(([dx,dy])=>{
            ctx.fillStyle=col+'88';
            ctx.beginPath();
            ctx.moveTo(dx*e.hw*.55,dy*e.hh*.55);
            ctx.lineTo(dx*e.hw*.55-dy*5,dy*e.hh*.55+dx*5);
            ctx.lineTo(dx*e.hw*.9,dy*e.hh*.9);
            ctx.lineTo(dx*e.hw*.55+dy*5,dy*e.hh*.55-dx*5);
            ctx.closePath(); ctx.fill();
          });
          break;
        case 'stealth':
          ctx.moveTo(0,-e.hh*1.1); ctx.lineTo(e.hw,0); ctx.lineTo(0,e.hh); ctx.lineTo(-e.hw,0);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle=col; ctx.lineWidth=1+Math.sin(animT*3)*.5;
          ctx.beginPath(); ctx.arc(0,0,e.hw*.9+3*Math.sin(animT*2),0,Math.PI*2); ctx.stroke();
          break;
        case 'bomber':
          // Круглый с крестом-детонатором
          ctx.arc(0,0,e.hw*.75,0,Math.PI*2); ctx.fill();
          ctx.strokeStyle=col+'ee'; ctx.lineWidth=2;
          ctx.beginPath(); ctx.moveTo(-e.hw*.5,0); ctx.lineTo(e.hw*.5,0); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0,-e.hh*.5); ctx.lineTo(0,e.hh*.5); ctx.stroke();
          // Мигающий огонёк
          if(Math.sin(animT*8)>0){ ctx.fillStyle='#ff4400'; ctx.beginPath(); ctx.arc(0,0,5,0,Math.PI*2); ctx.fill(); }
          break;
        case 'dasher':
          // Острый ромб с хвостом
          ctx.moveTo(0,-e.hh); ctx.lineTo(e.hw*.6,0); ctx.lineTo(0,e.hh); ctx.lineTo(-e.hw*.6,0);
          ctx.closePath(); ctx.fill();
          // Хвост следа
          ctx.fillStyle=col+'44';
          ctx.beginPath(); ctx.moveTo(-e.hw*.3,e.hh*.3); ctx.lineTo(e.hw*.3,e.hh*.3); ctx.lineTo(0,e.hh*1.8); ctx.closePath(); ctx.fill();
          if(e.dashing){ ctx.strokeStyle=col; ctx.lineWidth=2; ctx.shadowBlur=18; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-e.dashVx*3,0); ctx.stroke(); }
          break;
        case 'shielder':
          // Восьмиугольник с щитом
          for(let a=0;a<8;a++){ const ang=(a/8)*Math.PI*2-Math.PI/8; ctx.lineTo(Math.cos(ang)*e.hw,Math.sin(ang)*e.hh); }
          ctx.closePath(); ctx.fill();
          if(e.shieldHp>0){
            ctx.save();
            ctx.globalAlpha=0.4+0.3*Math.sin(animT*3);
            ctx.strokeStyle='#00aaff'; ctx.lineWidth=4; ctx.shadowBlur=20; ctx.shadowColor='#00aaff';
            ctx.beginPath(); ctx.arc(0,0,e.hw*1.3,0,Math.PI*2); ctx.stroke();
            ctx.restore();
          }
          break;
        case 'teleporter':
          // Звезда
          for(let a=0;a<5;a++){
            const o=a/5*Math.PI*2-Math.PI/2;
            const i=o+Math.PI/5;
            ctx.lineTo(Math.cos(o)*e.hw,Math.sin(o)*e.hh);
            ctx.lineTo(Math.cos(i)*e.hw*.45,Math.sin(i)*e.hh*.45);
          }
          ctx.closePath(); ctx.fill();
          // Ореол телепорта
          ctx.save(); ctx.globalAlpha=0.25+0.25*Math.sin(animT*2);
          ctx.strokeStyle=col; ctx.lineWidth=2;
          ctx.beginPath(); ctx.arc(0,0,e.hw*1.5+5*Math.sin(animT*4),0,Math.PI*2); ctx.stroke();
          ctx.restore();
          break;
        case 'miniboss':
          // Мини-босс: большой, с рамкой и именем
          { const mc=e.miniType.color;
            const mPulse=1+.06*Math.sin(animT*3);
            ctx.scale(mPulse,mPulse);
            const mg=ctx.createRadialGradient(0,0,0,0,0,e.hw);
            mg.addColorStop(0,mc+'ff'); mg.addColorStop(.6,mc+'cc'); mg.addColorStop(1,mc+'22');
            ctx.fillStyle=mg;
            // Форма: шестиугольник
            for(let a=0;a<6;a++){ const ang=(a/6)*Math.PI*2-Math.PI/6; ctx.lineTo(Math.cos(ang)*e.hw,Math.sin(ang)*e.hh); }
            ctx.closePath(); ctx.fill();
            // Рамка
            ctx.strokeStyle=mc; ctx.lineWidth=2.5; ctx.shadowBlur=20; ctx.shadowColor=mc;
            ctx.beginPath();
            for(let a=0;a<6;a++){ const ang=(a/6)*Math.PI*2-Math.PI/6; ctx.lineTo(Math.cos(ang)*e.hw,Math.sin(ang)*e.hh); }
            ctx.closePath(); ctx.stroke();
            // Глаза
            ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(-e.hw*.28,-e.hh*.2,4,0,Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(e.hw*.28,-e.hh*.2,4,0,Math.PI*2); ctx.fill();
            ctx.fillStyle='#111'; ctx.beginPath(); ctx.arc(-e.hw*.28,-e.hh*.2,2,0,Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(e.hw*.28,-e.hh*.2,2,0,Math.PI*2); ctx.fill();
          }
          break;
      }

      // HP бар
      if(e.hp<e.maxHp&&alpha>0.1){
        const bw=e.hw*2,bh=e.isMiniBoss?6:4,by=-e.hh-(e.isMiniBoss?12:8);
        ctx.fillStyle='rgba(0,0,0,.55)'; ctx.fillRect(-e.hw,by,bw,bh);
        const pct=e.hp/e.maxHp;
        ctx.fillStyle=e.isMiniBoss?(pct>.5?'#ffaa00':'#ff4400'):(pct>.5?'#00ff88':'#ff6b00');
        ctx.fillRect(-e.hw,by,bw*pct,bh);
        if(e.isMiniBoss){
          ctx.fillStyle='rgba(255,255,255,0.15)'; ctx.fillRect(-e.hw+bw*pct,by,bw*(1-pct),bh);
        }
      }
    }
    ctx.restore();
  });

  // Particles & waves
  particles.forEach(p=>{
    if(p.bossShot){
      ctx.save();
      ctx.fillStyle=p.color+'aa';
      ctx.shadowBlur=12; ctx.shadowColor=p.color;
      ctx.beginPath(); ctx.arc(p.x,p.y,(p.size||8)/2,0,Math.PI*2); ctx.fill();
      ctx.fillStyle=p.color+'ff';
      ctx.beginPath(); ctx.arc(p.x,p.y,(p.size||8)/4,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }else if(p.wave){
      ctx.save(); ctx.globalAlpha=p.life*.5;
      ctx.strokeStyle=p.color; ctx.lineWidth=3; ctx.shadowBlur=15; ctx.shadowColor=p.color;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r||0,0,Math.PI*2); ctx.stroke(); ctx.restore();
    }else{
      const a=Math.floor(p.life*255).toString(16).padStart(2,'0');
      ctx.fillStyle=p.color+a; ctx.fillRect(p.x,p.y,p.size||4,p.size||4);
    }
  });

  ctx.restore();
}

// ════════════════════════════════════════════════════
// HUD
// ════════════════════════════════════════════════════
function updateHUD(){
  document.getElementById('scoreVal').textContent = score;
  document.getElementById('livesVal').textContent = lives;

  // Уровень миссии (сессионный) в HUD
  document.getElementById('levelVal').textContent = level;

  // Шкала — прогресс миссии до следующего уровня
  const diffMult2 = {easy:.7, normal:1, hard:1.3, nightmare:1.6}[difficulty]||1;
  const threshold2 = Math.floor((800 + level*350 + level*level*40) * diffMult2);
  document.getElementById('levelFill').style.width = Math.min(100, levelProgress/threshold2*100) + '%';

  // Уровень корабля — отдельный элемент
  const shipEl = document.getElementById('shipLvlHud');
  if(shipEl) shipEl.textContent = shipLvl;

  // Очки навыков
  const spEl = document.getElementById('skillPtsDisplay');
  const spVal = document.getElementById('hudSkillPtsVal');
  if(spEl && spVal){ spVal.textContent = skillPoints; spEl.style.display = skillPoints>0?'block':'none'; }
}

// ════════════════════════════════════════════════════
// GAME LOOP
// ════════════════════════════════════════════════════
function loop(ts){
  if(!gameRunning || gamePaused) return;
  const dt = Math.min(ts - lastTime, 50);
  lastTime = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

// ════════════════════════════════════════════════════
// START / END
// ════════════════════════════════════════════════════
function startGame(){
  // Reset weapon to first selected weapon
  buildWeaponBar();
  currentWeapon = custom.selectedWeapons[0] || 'laser';
  const firstWBtn = document.querySelector('[data-weapon]');
  if(firstWBtn){ document.querySelectorAll('[data-weapon]').forEach(b=>b.classList.remove('active')); firstWBtn.classList.add('active'); }

  const cfg = DIFF[difficulty];
  const bonus = getBonus();
  score=0; lives=cfg.lives + bonus.extraLife; level=1; levelProgress=0;
  combo=1; maxCombo=1; comboTimer=0;
  killedEnemies=0; bossesKilled=0;
  bossActive=false; bossEnemy=null;
  sessionAch=[];
  activePowerups = {shield: bonus.hasStartShield?9999:0, speed:0};
  doubleCoinActive=0; laserDoubleActive=0; timeFreezeActive=0;
  railCooldown=0; railBeam=null;
  invincibleTimer = 0;
  bombsInStock = bonus.startBombs;
  bombCooldown = 0;
  updateBombUI();
  bullets.length=0; enemies.length=0; particles.length=0; powerups.length=0;
  playerTrail.length=0;
  player.x=player.targetX=canvas.width/2;
  gamePaused=false;
  gameRunning=true;
  updateHUD(); renderXPBar();
  document.getElementById('bossBar').style.display='none';
  if(activePowerups.shield>0) updatePowerupBar();

  const old=document.querySelector('.touch-hint');if(old)old.remove();
  const hint=document.createElement('div');
  const hasSkills = getActiveSkills().length > 0;
  hint.className='touch-hint';
  hint.textContent = hasSkills
    ? '☝️ Ведите пальцем • ↑ свайп = навык • 2x тап = бомба'
    : '☝️ Ведите пальцем • 2x тап = бомба';
  document.body.appendChild(hint); setTimeout(()=>hint.remove(),5000);

  // Показываем кнопки навыков для тача
  updateTouchSkillBar();

  // Включаем касания canvas при старте игры
  canvas.style.pointerEvents = 'all';
  lastTime=performance.now();
  Music.play('game');
  requestAnimationFrame(loop);
}

function endGame(){
  gameRunning=false;
  canvas.style.pointerEvents = 'none';
  Music.play('menu');
  if(score>bestScore){ bestScore=score; LS.set('bestScore',bestScore); updateMenuBadge(); }

  const myName=tg?.initDataUnsafe?.user?.first_name||'Игрок';
  const myId=tg?.initDataUnsafe?.user?.id||0;
  let lb=LS.getJ('leaderboard',[]);
  lb=lb.filter(e=>e.id!==myId);
  lb.push({id:myId,name:myName,score:bestScore,lvl:shipLvl});
  lb.sort((a,b)=>b.score-a.score); lb=lb.slice(0,20);
  LS.setJ('leaderboard',lb);

  document.getElementById('goScore').innerHTML = score + (score===bestScore&&score>0?'<span class="new-record">NEW!</span>':'');
  document.getElementById('goLevel').textContent = level;
  document.getElementById('goCombo').textContent = 'x'+maxCombo;
  document.getElementById('goBest').textContent = bestScore;
  document.getElementById('goCoins').textContent = '💰 Монет в кошельке: '+coins;

  const achEl=document.getElementById('goAch'); achEl.innerHTML='';
  ACHIEVEMENTS.forEach(a=>{
    const b=document.createElement('div');
    b.className='ach-badge '+(unlockedAch.includes(a.id)?'unlocked':'locked');
    b.textContent=a.name; achEl.appendChild(b);
  });

  // Убираем bomb chip из DOM
  const bc = document.getElementById('bombChip');
  if(bc) bc.style.display='none';
  showScreen('gameOverScreen');
  if(tg?.initDataUnsafe?.user) tg.sendData(JSON.stringify({score,level,difficulty,maxCombo,coins,shipLvl,userId:tg.initDataUnsafe.user.id}));
}

// ════════════════════════════════════════════════════
// RESIZE
// ════════════════════════════════════════════════════
window.addEventListener('resize',()=>{
  canvas.width=window.innerWidth; canvas.height=window.innerHeight;
  player.x=player.targetX=canvas.width/2;
});


// ════════════════════════════════════════════════════════════════
// SPACE SHOOTER — УЛУЧШЕНИЯ v3.0 (MERGED)
// ════════════════════════════════════════════════════════════════

// ── ВСТУПИТЕЛЬНАЯ АНИМАЦИЯ (каждый запуск) ──
window.IntroAnimation = {
  active: false,
  _timers: [],
  texts: [
    "Год 2157...",
    "Враждебные силы угрожают галактике",
    "Вы — последняя надежда человечества",
    "НАЧАЛО МИССИИ"
  ],
  _clearTimers(){
    this._timers.forEach(t => clearTimeout(t));
    this._timers = [];
  },
  show(callback) {
    // Убираем старый оверлей если вдруг остался
    const old = document.getElementById('introOverlay');
    if(old) old.remove();
    this._clearTimers();
    this.active = true;

    const overlay = document.createElement('div');
    overlay.id = 'introOverlay';
    overlay.style.cssText = `
      position:fixed;inset:0;
      background:linear-gradient(180deg,#000814 0%,#001d3d 50%,#000814 100%);
      z-index:1000;display:flex;align-items:center;justify-content:center;
      opacity:1;
    `;

    const textEl = document.createElement('div');
    textEl.style.cssText = `
      font-family:'Orbitron',monospace;font-size:22px;color:#00ff88;
      text-shadow:0 0 20px #00ff88;text-align:center;padding:20px;max-width:90%;
      opacity:0;transition:opacity 0.5s ease, transform 0.5s ease;
      transform:translateY(16px);
    `;

    const skipHint = document.createElement('div');
    skipHint.style.cssText = `
      position:absolute;bottom:30px;font-family:'Orbitron',monospace;
      font-size:11px;color:rgba(0,255,136,0.35);text-align:center;width:100%;
    `;
    skipHint.textContent = '[ нажмите чтобы пропустить ]';

    overlay.appendChild(textEl);
    overlay.appendChild(skipHint);
    document.body.appendChild(overlay);

    const SHOW_MS  = 600;  // время появления текста
    const HOLD_MS  = 1100; // время показа текста
    const HIDE_MS  = 500;  // время исчезновения
    const STEP_MS  = SHOW_MS + HOLD_MS + HIDE_MS; // ~2200ms на фразу

    const finish = () => {
      if(!this.active) return;
      this._clearTimers();
      this.active = false;
      overlay.style.transition = 'opacity 0.7s';
      overlay.style.opacity = '0';
      const t = setTimeout(() => { overlay.remove(); if(callback) callback(); }, 700);
      this._timers.push(t);
    };

    const showPhrase = (idx) => {
      if(!this.active) return;
      if(idx >= this.texts.length){ finish(); return; }

      // Fade in
      textEl.textContent = this.texts[idx];
      textEl.style.opacity = '0';
      textEl.style.transform = 'translateY(16px)';

      const t1 = setTimeout(() => {
        if(!this.active) return;
        textEl.style.opacity = '1';
        textEl.style.transform = 'translateY(0)';
        if(window.Telegram?.WebApp?.HapticFeedback)
          window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
      }, 30);

      // Fade out
      const t2 = setTimeout(() => {
        if(!this.active) return;
        textEl.style.opacity = '0';
        textEl.style.transform = 'translateY(-12px)';
      }, SHOW_MS + HOLD_MS);

      // Next phrase
      const t3 = setTimeout(() => {
        showPhrase(idx + 1);
      }, STEP_MS);

      this._timers.push(t1, t2, t3);
    };

    showPhrase(0);

    overlay.addEventListener('click', () => {
      this._clearTimers();
      this.active = false;
      overlay.remove();
      if(callback) callback();
    });
  }
};

// ── АНИМАЦИЯ БОССА ──
window.BossAnimation = {
  show(bossName) {
    // Убираем старый оверлей если есть
    const old = document.getElementById('bossAnimOverlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'bossAnimOverlay';
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.92);
      z-index:999;display:flex;flex-direction:column;align-items:center;justify-content:center;
      pointer-events:none;
    `;

    if (!document.getElementById('bossAnimStyles')) {
      const style = document.createElement('style');
      style.id = 'bossAnimStyles';
      style.textContent = `
        @keyframes bossWarningPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.15);opacity:.7}}
        @keyframes bossNameAppear{0%{transform:scale(0) rotate(-10deg);opacity:0}60%{transform:scale(1.25) rotate(3deg)}100%{transform:scale(1) rotate(0deg);opacity:1}}
        @keyframes bossOverlayFadeOut{0%{opacity:1}100%{opacity:0}}
      `;
      document.head.appendChild(style);
    }

    const warning = document.createElement('div');
    warning.style.cssText = `
      font-family:'Orbitron',monospace;font-size:42px;color:#ff0066;
      text-shadow:0 0 30px #ff0066,0 0 60px #ff0066;margin-bottom:20px;
      animation:bossWarningPulse 0.4s infinite;
    `;
    warning.textContent = '⚠ WARNING ⚠';

    const nameEl = document.createElement('div');
    nameEl.style.cssText = `
      font-family:'Orbitron',monospace;font-size:28px;color:#ff0066;
      text-shadow:0 0 40px #ff0066;text-align:center;padding:0 20px;
      animation:bossNameAppear 0.8s cubic-bezier(.17,.67,.5,1.5) both;
    `;
    nameEl.textContent = bossName || 'BOSS DETECTED';

    const lineTop = document.createElement('div');
    lineTop.style.cssText = `width:200px;height:2px;background:linear-gradient(90deg,transparent,#ff0066,transparent);margin-bottom:16px;box-shadow:0 0 10px #ff0066;`;
    const lineBot = document.createElement('div');
    lineBot.style.cssText = `width:200px;height:2px;background:linear-gradient(90deg,transparent,#ff0066,transparent);margin-top:16px;box-shadow:0 0 10px #ff0066;`;

    overlay.appendChild(warning);
    overlay.appendChild(lineTop);
    overlay.appendChild(nameEl);
    overlay.appendChild(lineBot);
    document.body.appendChild(overlay);

    if (window.Telegram?.WebApp?.HapticFeedback) window.Telegram.WebApp.HapticFeedback.impactOccurred('heavy');

    setTimeout(() => {
      overlay.style.animation = 'bossOverlayFadeOut 0.5s ease forwards';
      setTimeout(() => overlay.remove(), 500);
    }, 2200);
  }
};

// ── ESC/Space пропускает интро ──
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Escape' || e.key === ' ') && window.IntroAnimation?.active) {
    e.preventDefault();
    window.IntroAnimation.active = false;
    const ol = document.getElementById('introOverlay');
    if (ol) ol.remove();
  }
});

console.log('✅ Space Shooter улучшения v3.0 загружены');