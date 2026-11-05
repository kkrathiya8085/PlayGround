(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  const GRID = 24;
  const BOARD = 720;
  const CELL = BOARD / GRID;
  const TAU = Math.PI * 2;
  const BASE_TICK = 180;
  const MIN_TICK = 66;
  const FLOW_WINDOW = 4200;
  const CORE_LIFETIME = 9000;
  const BEST_KEY = 'neon-serpent-best-v1';
  const SOUND_KEY = 'neon-serpent-sound-v1';

  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const sameCell = (a, b) => a && b && a.x === b.x && a.y === b.y;
  const padScore = (value) => String(Math.max(0, Math.floor(value))).padStart(6, '0');

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const canvas = $('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  const gameFrame = $('gameFrame');
  const startOverlay = $('startOverlay');
  const pauseOverlay = $('pauseOverlay');
  const gameoverOverlay = $('gameoverOverlay');
  const helpModal = $('helpModal');

  const dom = {
    score: $('scoreDisplay'),
    best: $('bestDisplay'),
    length: $('lengthDisplay'),
    speed: $('speedDisplay'),
    lengthMeter: $('lengthMeter'),
    speedMeter: $('speedMeter'),
    compactScore: $('compactScore'),
    compactBest: $('compactBest'),
    compactStreak: $('compactStreak'),
    streak: $('streakDisplay'),
    flowPips: $('flowPips'),
    flowTimer: $('flowTimer'),
    sideBest: $('sideBest'),
    nodes: $('nodesDisplay'),
    cores: $('coresDisplay'),
    peak: $('peakDisplay'),
    runTag: $('runTag'),
    menuBest: $('menuBest'),
    finalScore: $('finalScore'),
    finalLength: $('finalLength'),
    finalBest: $('finalBest'),
    finalStreak: $('finalStreak'),
    newRecord: $('newRecord'),
    status: $('statusLabel'),
    live: $('liveStatus'),
    toast: $('eventToast'),
    soundToggle: $('soundToggle'),
    soundLabel: $('soundLabel'),
    touchPause: $('touchPauseBtn'),
    touchControls: $('touchControls'),
    stagePause: $('stagePauseBtn')
  };

  // ---------------------------------------------------------------------------
  // Sound (synthesized, no external assets)
  // ---------------------------------------------------------------------------
  const sound = {
    enabled: readPreference(SOUND_KEY, true),
    ctx: null,
    master: null,

    init() {
      if (!this.enabled) return;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.19;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    },

    setEnabled(enabled) {
      this.enabled = enabled;
      writePreference(SOUND_KEY, enabled ? 'on' : 'off');
      if (enabled) {
        this.init();
        this.click();
      } else if (this.master && this.ctx) {
        this.master.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.02);
      }
      if (this.master && this.ctx) {
        this.master.gain.setTargetAtTime(enabled ? 0.19 : 0.0001, this.ctx.currentTime, 0.02);
      }
      dom.soundToggle.classList.toggle('is-muted', !enabled);
      dom.soundToggle.setAttribute('aria-pressed', String(enabled));
      dom.soundLabel.textContent = enabled ? 'SOUND ON' : 'SOUND OFF';
    },

    tone(freq, duration = 0.08, type = 'sine', volume = 0.22, endFreq = null, delay = 0) {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx || !this.master) return;
      const t0 = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + duration);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.009);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + duration + 0.025);
    },

    noise(duration = 0.35, volume = 0.2) {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx || !this.master) return;
      const length = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      }
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1100, this.ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(180, this.ctx.currentTime + duration);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(volume, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      source.start();
    },

    click() { this.tone(620, 0.035, 'sine', 0.11, 720); },

    start() {
      this.tone(220, 0.12, 'triangle', 0.18, 330);
      this.tone(330, 0.12, 'triangle', 0.17, 495, 0.075);
      this.tone(660, 0.18, 'sine', 0.15, 880, 0.16);
    },

    eat(streak, golden) {
      if (golden) {
        this.tone(660, 0.13, 'triangle', 0.19, 990);
        this.tone(990, 0.14, 'sine', 0.16, 1320, 0.06);
        this.tone(1320, 0.18, 'sine', 0.12, 1760, 0.12);
        return;
      }
      const base = 430 + streak * 55;
      this.tone(base, 0.055, 'triangle', 0.16, base * 1.28);
      this.tone(base * 2, 0.045, 'sine', 0.07, base * 2.2, 0.012);
    },

    coreSpawn() {
      this.tone(880, 0.11, 'sine', 0.1, 1180);
      this.tone(1320, 0.18, 'sine', 0.08, 1760, 0.08);
    },

    coreLost() {
      this.tone(300, 0.16, 'triangle', 0.08, 170);
    },

    pause(paused) {
      this.tone(paused ? 440 : 330, 0.06, 'sine', 0.11, paused ? 330 : 440);
      this.tone(paused ? 220 : 440, 0.08, 'triangle', 0.08, paused ? 165 : 550, 0.055);
    },

    crash() {
      this.noise(0.45, 0.3);
      this.tone(190, 0.4, 'sawtooth', 0.17, 42);
      this.tone(95, 0.5, 'triangle', 0.11, 32, 0.04);
    }
  };

  function readPreference(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      if (value === null) return fallback;
      return value === 'on';
    } catch {
      return fallback;
    }
  }

  function writePreference(key, value) {
    try { localStorage.setItem(key, value); } catch { /* storage can be unavailable */ }
  }

  function readBest() {
    try {
      const value = Number(localStorage.getItem(BEST_KEY));
      return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    } catch {
      return 0;
    }
  }

  function saveBest(value) {
    try { localStorage.setItem(BEST_KEY, String(value)); } catch { /* ignore */ }
  }

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------
  const state = {
    mode: 'menu',
    snake: [],
    prev: [],
    dir: DIRS.right,
    queue: [],
    food: { x: 16, y: 12 },
    core: null,
    score: 0,
    best: readBest(),
    pickups: 0,
    foodsEaten: 0,
    stepTimer: 0,
    tickMs: BASE_TICK,
    launchGrace: 0,
    streak: 1,
    peakStreak: 1,
    flowRemaining: 0,
    particles: [],
    popups: [],
    shake: 0,
    flash: 0,
    deathAt: 0,
    newRecord: false,
    lastFrame: performance.now(),
    toastTimer: null,
    attractNodes: [
      { x: 598, y: 168, gold: false, phase: 0.4 },
      { x: 556, y: 506, gold: true, phase: 2.1 },
      { x: 644, y: 366, gold: false, phase: 4.3 }
    ]
  };

  let helpOpen = false;
  let lastHelpTrigger = null;
  let swipeStart = null;
  let lastFlowWidth = -1;

  // ---------------------------------------------------------------------------
  // Canvas setup
  // ---------------------------------------------------------------------------
  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(BOARD * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelWidth) {
      canvas.width = pixelWidth;
      canvas.height = pixelWidth;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // ---------------------------------------------------------------------------
  // UI helpers
  // ---------------------------------------------------------------------------
  function setText(el, value) {
    if (el && el.textContent !== value) el.textContent = value;
  }

  function setStatus(label, tone = '') {
    setText(dom.status, label);
    dom.status.classList.toggle('is-live', tone === 'live');
    dom.status.classList.toggle('is-danger', tone === 'danger');
  }

  function updateHUD(animateScore = false) {
    setText(dom.score, padScore(state.score));
    setText(dom.best, padScore(state.best));
    setText(dom.compactScore, padScore(state.score));
    setText(dom.compactBest, padScore(state.best));
    setText(dom.sideBest, padScore(state.best));
    setText(dom.menuBest, padScore(state.best));
    setText(dom.finalBest, padScore(state.best));
    setText(dom.length, String(state.snake.length || 4).padStart(2, '0'));
    setText(dom.finalLength, String(state.snake.length || 4).padStart(2, '0'));

    const speed = BASE_TICK / state.tickMs;
    setText(dom.speed, `${speed.toFixed(1)}×`);
    setText(dom.compactStreak, `×${state.streak}`);
    setText(dom.streak, `×${state.streak}`);
    setText(dom.peakStreak, `×${state.peakStreak}`);
    setText(dom.nodes, String(state.foodsEaten).padStart(2, '0'));
    setText(dom.cores, String(Math.max(0, state.pickups - state.foodsEaten)).padStart(2, '0'));
    setText(dom.peak, `×${state.peakStreak}`);
    if (dom.runTag) {
      const tag = state.mode === 'playing' ? 'ACTIVE'
        : state.mode === 'paused' ? 'HOLD'
          : state.mode === 'dying' || state.mode === 'gameover' ? 'ENDED'
            : 'STANDBY';
      setText(dom.runTag, tag);
    }

    const lengthPct = clamp(((state.snake.length || 4) / 40) * 100, 4, 100);
    if (dom.lengthMeter) dom.lengthMeter.style.width = `${lengthPct}%`;
    const topSpeed = BASE_TICK / MIN_TICK;
    const speedPct = clamp(5 + ((speed - 1) / (topSpeed - 1)) * 95, 5, 100);
    if (dom.speedMeter) dom.speedMeter.style.width = `${speedPct}%`;

    if (dom.flowPips) {
      Array.from(dom.flowPips.children).forEach((pip, index) => {
        pip.classList.toggle('active', index < state.streak);
      });
    }

    if (animateScore && dom.score) {
      dom.score.classList.remove('pop');
      void dom.score.offsetWidth;
      dom.score.classList.add('pop');
    }
  }

  function updateFlowMeter() {
    const pct = state.flowRemaining > 0 ? clamp(state.flowRemaining / FLOW_WINDOW, 0, 1) : 0;
    const width = Math.round(pct * 1000) / 10;
    if (dom.flowTimer && width !== lastFlowWidth) {
      dom.flowTimer.style.width = `${width}%`;
      lastFlowWidth = width;
    }
  }

  function showToast(message, tone = '') {
    if (!dom.toast) return;
    clearTimeout(state.toastTimer);
    dom.toast.textContent = message;
    dom.toast.classList.toggle('gold', tone === 'gold');
    dom.toast.classList.add('show');
    state.toastTimer = setTimeout(() => {
      dom.toast.classList.remove('show');
    }, 1350);
  }

  function announce(message) {
    if (!dom.live) return;
    dom.live.textContent = message;
  }

  function showOverlay(el) {
    el.classList.remove('hidden');
  }

  function hideOverlay(el) {
    el.classList.add('hidden');
  }

  function resetTransientUI() {
    if (dom.score) dom.score.classList.remove('pop');
    if (dom.toast) dom.toast.classList.remove('show');
    if (dom.newRecord) dom.newRecord.classList.add('hidden');
    updateFlowMeter();
  }

  // ---------------------------------------------------------------------------
  // Game setup and state transitions
  // ---------------------------------------------------------------------------
  function cloneCells(cells) {
    return cells.map((cell) => ({ x: cell.x, y: cell.y }));
  }

  function randomFreeCell() {
    const occupied = new Set(state.snake.map((cell) => `${cell.x},${cell.y}`));
    if (state.food) occupied.add(`${state.food.x},${state.food.y}`);
    if (state.core) occupied.add(`${state.core.x},${state.core.y}`);

    const free = [];
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (!occupied.has(`${x},${y}`)) free.push({ x, y });
      }
    }
    if (!free.length) return null;
    return free[Math.floor(Math.random() * free.length)];
  }

  function spawnFood() {
    const cell = randomFreeCell();
    if (cell) state.food = cell;
  }

  function setMenuPreview() {
    state.snake = [
      { x: 8, y: 12 }, { x: 7, y: 12 }, { x: 6, y: 12 }, { x: 5, y: 12 }
    ];
    state.prev = cloneCells(state.snake);
    state.score = 0;
    state.pickups = 0;
    state.foodsEaten = 0;
    state.tickMs = BASE_TICK;
    state.streak = 1;
    state.peakStreak = 1;
    state.flowRemaining = 0;
    state.core = null;
    state.food = { x: 16, y: 12 };
    state.particles = [];
    state.popups = [];
    state.shake = 0;
    state.flash = 0;
    state.queue = [];
    state.dir = DIRS.right;
    state.stepTimer = 0;
    state.newRecord = false;
    updateHUD();
    updateFlowMeter();
  }

  function resetRun() {
    state.snake = [
      { x: 7, y: 12 }, { x: 6, y: 12 }, { x: 5, y: 12 }, { x: 4, y: 12 }
    ];
    state.prev = cloneCells(state.snake);
    state.dir = DIRS.right;
    state.queue = [];
    state.food = { x: 13, y: 12 };
    state.core = null;
    state.score = 0;
    state.pickups = 0;
    state.foodsEaten = 0;
    state.stepTimer = 0;
    state.tickMs = BASE_TICK;
    state.streak = 1;
    state.peakStreak = 1;
    state.flowRemaining = 0;
    state.particles = [];
    state.popups = [];
    state.shake = 0;
    state.flash = 0;
    state.deathAt = 0;
    state.newRecord = false;
    state.queue = [];
    state.launchGrace = 650;

    updateHUD();
    updateFlowMeter();
    if (dom.newRecord) dom.newRecord.classList.add('hidden');
  }

  function startGame() {
    if (state.mode === 'playing') return;
    sound.init();
    sound.start();
    resetTransientUI();
    resetRun();
    state.mode = 'playing';
    state.lastFrame = performance.now();
    hideOverlay(startOverlay);
    hideOverlay(pauseOverlay);
    hideOverlay(gameoverOverlay);
    setStatus('RUNNING', 'live');
    syncStagePause();
    dom.touchControls.classList.remove('is-idle');
    showToast('RUN INITIALIZED');
    announce('Run started. Steer the serpent with the arrow keys, W A S D, or swipes.');
    dom.touchPause.setAttribute('aria-label', 'Pause game');
  }

  function showMenu() {
    state.mode = 'menu';
    setMenuPreview();
    hideOverlay(pauseOverlay);
    hideOverlay(gameoverOverlay);
    showOverlay(startOverlay);
    setStatus('STANDBY');
    syncStagePause();
    dom.touchControls.classList.add('is-idle');
    sound.click();
    updateHUD();
    announce('Neon Serpent. Press Enter or Start Run to play.');
  }

  function setPaused(paused) {
    if (paused && state.mode === 'playing') {
      state.mode = 'paused';
      showOverlay(pauseOverlay);
      setStatus('SUSPENDED');
      syncStagePause();
      dom.touchPause.setAttribute('aria-label', 'Resume game');
      sound.pause(true);
      announce('Game paused.');
    } else if (!paused && state.mode === 'paused') {
      state.mode = 'playing';
      state.lastFrame = performance.now();
      hideOverlay(pauseOverlay);
      setStatus('RUNNING', 'live');
      syncStagePause();
      dom.touchPause.setAttribute('aria-label', 'Pause game');
      sound.pause(false);
      announce('Game resumed.');
    }
  }

  function togglePause() {
    if (state.mode === 'playing') setPaused(true);
    else if (state.mode === 'paused') setPaused(false);
  }

  function syncStagePause() {
    if (!dom.stagePause) return;
    const active = state.mode === 'playing' || state.mode === 'paused';
    dom.stagePause.classList.toggle('is-active', active);
    dom.stagePause.disabled = !active;
    dom.stagePause.setAttribute('aria-label', state.mode === 'paused' ? 'Resume run' : 'Pause run');
  }

  function endRun() {
    if (state.mode !== 'dying') return;
    state.mode = 'gameover';
    setStatus('OFFLINE', 'danger');
    syncStagePause();
    setText(dom.finalScore, padScore(state.score));
    setText(dom.finalLength, String(state.snake.length).padStart(2, '0'));
    setText(dom.finalBest, padScore(state.best));
    setText(dom.finalStreak, `×${state.peakStreak}`);
    dom.newRecord.classList.toggle('hidden', !state.newRecord);
    showOverlay(gameoverOverlay);
    updateHUD();
    dom.touchControls.classList.add('is-idle');
    dom.touchPause.setAttribute('aria-label', 'Pause game');
    announce(`Run ended. Score ${state.score}. ${state.newRecord ? 'New personal best.' : 'Press R to run it back.'}`);
  }

  function die(collisionCell, outOfBounds) {
    if (state.mode !== 'playing') return;
    state.mode = 'dying';
    state.deathAt = performance.now();
    state.shake = 18;
    state.flash = 0.9;
    state.queue = [];
    setStatus('SIGNAL LOST', 'danger');

    const cx = (clamp(collisionCell.x, 0, GRID - 1) + 0.5) * CELL;
    const cy = (clamp(collisionCell.y, 0, GRID - 1) + 0.5) * CELL;
    spawnBurst(cx, cy, '#ff7055', 56, 1.55);
    spawnBurst(cx, cy, '#ffd166', 22, 1.05);
    addPopup(cx, cy, outOfBounds ? 'WALL' : 'TRAIL', '#ff8067', 23);
    sound.crash();
    if (navigator.vibrate) navigator.vibrate([24, 30, 55]);
    announce(outOfBounds ? 'You crashed into the perimeter.' : 'You crossed your own trail.');
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  function queueDirection(name) {
    if (state.mode !== 'playing') return;
    const next = DIRS[name];
    if (!next) return;
    const base = state.queue.length ? state.queue[state.queue.length - 1] : state.dir;
    if (next.x === -base.x && next.y === -base.y) return;
    if (next.x === base.x && next.y === base.y) return;
    if (state.queue.length < 2) state.queue.push(next);
    sound.tone(215, 0.018, 'sine', 0.025, 240);
  }

  const keyDirections = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right'
  };

  document.addEventListener('keydown', (event) => {
    const code = event.code;

    if (helpOpen) {
      if (code === 'Escape' || code === 'Enter' || code === 'Space') {
        event.preventDefault();
        if (code === 'Escape') closeHelp();
        else startFromHelp();
      }
      return;
    }

    if (keyDirections[code]) {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) event.preventDefault();
      if (state.mode === 'playing') queueDirection(keyDirections[code]);
      return;
    }

    if (code === 'Enter' || code === 'Space') {
      if (state.mode === 'menu' || state.mode === 'gameover') {
        event.preventDefault();
        startGame();
      } else if (state.mode === 'playing' || state.mode === 'paused') {
        event.preventDefault();
        togglePause();
      }
      return;
    }

    if (code === 'Escape' || code === 'KeyP') {
      if (state.mode === 'playing' || state.mode === 'paused') {
        event.preventDefault();
        togglePause();
      }
      return;
    }

    if (code === 'KeyR') {
      if (state.mode === 'gameover' || state.mode === 'paused') {
        event.preventDefault();
        startGame();
      }
      return;
    }

    if (code === 'KeyM') {
      event.preventDefault();
      sound.setEnabled(!sound.enabled);
    }
  });

  // Swipe control on the board.
  canvas.addEventListener('pointerdown', (event) => {
    if (state.mode !== 'playing') return;
    swipeStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    try { canvas.setPointerCapture(event.pointerId); } catch { /* ignore */ }
  });

  canvas.addEventListener('pointerup', (event) => {
    if (!swipeStart || swipeStart.id !== event.pointerId) return;
    const dx = event.clientX - swipeStart.x;
    const dy = event.clientY - swipeStart.y;
    swipeStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
    if (Math.abs(dx) > Math.abs(dy)) queueDirection(dx > 0 ? 'right' : 'left');
    else queueDirection(dy > 0 ? 'down' : 'up');
  });

  canvas.addEventListener('pointercancel', () => { swipeStart = null; });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  document.querySelectorAll('.dpad-btn').forEach((button) => {
    const direction = button.dataset.dir;
    const press = (event) => {
      event.preventDefault();
      queueDirection(direction);
      button.classList.add('is-pressed');
      if (navigator.vibrate) navigator.vibrate(6);
    };
    const release = () => button.classList.remove('is-pressed');
    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointerleave', release);
    button.addEventListener('pointercancel', release);
  });

  // ---------------------------------------------------------------------------
  // Overlay actions
  // ---------------------------------------------------------------------------
  $('startBtn').addEventListener('click', startGame);
  $('restartBtn').addEventListener('click', startGame);
  $('pauseRestartBtn').addEventListener('click', startGame);
  $('resumeBtn').addEventListener('click', () => setPaused(false));
  $('menuBtn').addEventListener('click', showMenu);
  $('touchPauseBtn').addEventListener('click', togglePause);
  $('stagePauseBtn').addEventListener('click', togglePause);
  dom.soundToggle.addEventListener('click', () => sound.setEnabled(!sound.enabled));

  const helpToggle = $('helpToggle');
  const startHelpBtn = $('startHelpBtn');
  const helpClose = $('helpClose');
  const helpStartBtn = $('helpStartBtn');

  function openHelp(trigger) {
    lastHelpTrigger = trigger || null;
    if (state.mode === 'playing') setPaused(true);
    helpOpen = true;
    helpModal.classList.remove('hidden');
    helpModal.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => helpClose.focus(), 40);
  }

  function closeHelp(returnFocus = true) {
    helpOpen = false;
    helpModal.classList.add('hidden');
    helpModal.setAttribute('aria-hidden', 'true');
    if (returnFocus && lastHelpTrigger) lastHelpTrigger.focus();
  }

  function startFromHelp() {
    closeHelp(false);
    startGame();
  }

  helpToggle.addEventListener('click', () => openHelp(helpToggle));
  startHelpBtn.addEventListener('click', () => openHelp(startHelpBtn));
  helpClose.addEventListener('click', () => closeHelp());
  helpStartBtn.addEventListener('click', startFromHelp);
  helpModal.addEventListener('click', (event) => {
    if (event.target === helpModal) closeHelp();
  });

  document.querySelectorAll('[data-home]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      if (state.mode === 'menu' || state.mode === 'gameover') showMenu();
      else if (state.mode === 'playing') setPaused(true);
    });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.mode === 'playing') setPaused(true);
  });

  // ---------------------------------------------------------------------------
  // Timed systems
  // ---------------------------------------------------------------------------
  function updateTimedSystems(dt) {
    if (state.flowRemaining > 0) {
      state.flowRemaining = Math.max(0, state.flowRemaining - dt);
      if (state.flowRemaining === 0 && state.streak > 1) {
        state.streak = 1;
        updateHUD();
      }
    }
    updateFlowMeter();

    if (state.core) {
      state.core.ttl -= dt;
      if (state.core.ttl <= 0) {
        state.core = null;
        showToast('CORE SIGNAL LOST');
        sound.coreLost();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Core gameplay step
  // ---------------------------------------------------------------------------
  function stepGame() {
    if (state.mode !== 'playing') return;

    if (state.queue.length) state.dir = state.queue.shift();

    const head = state.snake[0];
    const next = { x: head.x + state.dir.x, y: head.y + state.dir.y };
    const outOfBounds = next.x < 0 || next.x >= GRID || next.y < 0 || next.y >= GRID;
    const eatsFood = sameCell(next, state.food);
    const eatsCore = sameCell(next, state.core);
    const willEat = eatsFood || eatsCore;

    let hitsSelf = false;
    if (!outOfBounds) {
      const checkLength = willEat ? state.snake.length : state.snake.length - 1;
      for (let i = 0; i < checkLength; i++) {
        if (sameCell(next, state.snake[i])) {
          hitsSelf = true;
          break;
        }
      }
    }

    if (outOfBounds || hitsSelf) {
      die(next, outOfBounds);
      return;
    }

    state.prev = cloneCells(state.snake);
    state.snake.unshift(next);
    if (!willEat) state.snake.pop();

    if (eatsFood || eatsCore) {
      eatPickup(eatsCore ? 'core' : 'food', next);
    }
  }

  function eatPickup(type, cell) {
    const golden = type === 'core';
    const base = golden ? 50 : 10;

    if (state.flowRemaining > 0) state.streak = Math.min(5, state.streak + 1);
    else state.streak = 1;
    state.flowRemaining = FLOW_WINDOW;
    state.peakStreak = Math.max(state.peakStreak, state.streak);

    const gained = base * state.streak;
    state.score += gained;
    state.pickups += 1;
    if (!golden) state.foodsEaten += 1;

    state.tickMs = Math.max(MIN_TICK, BASE_TICK - state.pickups * 4);

    const cx = (cell.x + 0.5) * CELL;
    const cy = (cell.y + 0.5) * CELL;
    spawnBurst(cx, cy, golden ? '#ffd35c' : '#bcff6a', golden ? 32 : 18, golden ? 1.25 : 0.9);
    if (golden) spawnBurst(cx, cy, '#fff3b0', 14, 1.15);
    addPopup(cx, cy, `+${gained}`, golden ? '#ffd35c' : '#d3ff8d', golden ? 23 : 20);

    if (state.score > state.best) {
      state.best = state.score;
      state.newRecord = true;
      saveBest(state.best);
    }

    if (golden) {
      state.core = null;
      showToast(`PULSE CORE +${gained}`, 'gold');
      sound.eat(state.streak, true);
      if (navigator.vibrate) navigator.vibrate([10, 18, 14]);
    } else {
      if (state.streak > 1) showToast(`FLOW ×${state.streak}`);
      sound.eat(state.streak, false);
      if (navigator.vibrate) navigator.vibrate(7);
      state.food = null;
      spawnFood();

      if (state.foodsEaten > 0 && state.foodsEaten % 5 === 0 && !state.core) {
        const coreCell = randomFreeCell();
        if (coreCell) {
          state.core = { x: coreCell.x, y: coreCell.y, ttl: CORE_LIFETIME };
          showToast('PULSE CORE DETECTED', 'gold');
          sound.coreSpawn();
        }
      }
    }

    updateHUD(true);
    updateFlowMeter();
    state.shake = Math.max(state.shake, golden ? 8 : 3.5);
    announce(`${golden ? 'Pulse core' : 'Energy node'} collected. Score ${state.score}. Flow times ${state.streak}.`);
  }

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------
  function spawnBurst(x, y, color, count, power = 1) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const speed = (55 + Math.random() * 220) * power;
      const life = 0.35 + Math.random() * 0.62;
      state.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 1.1 + Math.random() * 2.6,
        color
      });
    }
    if (state.particles.length > 260) state.particles.splice(0, state.particles.length - 260);
  }

  function addPopup(x, y, text, color, size = 20) {
    state.popups.push({ x, y, text, color, size, life: 0.95, maxLife: 0.95 });
  }

  function updateEffects(dt) {
    const seconds = dt / 1000;
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life -= seconds;
      if (p.life <= 0) {
        state.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * seconds;
      p.y += p.vy * seconds;
      p.vx *= Math.pow(0.14, seconds);
      p.vy = p.vy * Math.pow(0.14, seconds) + 78 * seconds;
    }
    for (let i = state.popups.length - 1; i >= 0; i--) {
      const popup = state.popups[i];
      popup.life -= seconds;
      if (popup.life <= 0) state.popups.splice(i, 1);
    }
    state.shake *= Math.pow(0.0008, seconds);
    if (state.shake < 0.08) state.shake = 0;
    state.flash *= Math.pow(0.0005, seconds);
    if (state.flash < 0.005) state.flash = 0;
  }

  // ---------------------------------------------------------------------------
  // Rendering helpers
  // ---------------------------------------------------------------------------
  function roundedRectPath(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  const boardCache = document.createElement('canvas');
  const boardCtx = boardCache.getContext('2d', { alpha: false });
  let boardCacheDpr = 0;

  function buildBoardCache(dpr) {
    boardCacheDpr = dpr;
    boardCache.width = Math.round(BOARD * dpr);
    boardCache.height = Math.round(BOARD * dpr);
    boardCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const c = boardCtx;
    c.fillStyle = '#030a08';
    c.fillRect(0, 0, BOARD, BOARD);

    const bg = c.createRadialGradient(BOARD * 0.5, BOARD * 0.42, 30, BOARD * 0.5, BOARD * 0.52, BOARD * 0.74);
    bg.addColorStop(0, '#0a1b14');
    bg.addColorStop(0.55, '#06110d');
    bg.addColorStop(1, '#030907');
    c.fillStyle = bg;
    c.fillRect(0, 0, BOARD, BOARD);

    // Fine grid.
    c.save();
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(145, 255, 184, 0.062)';
    c.beginPath();
    for (let i = 1; i < GRID; i++) {
      if (i % 6 === 0) continue;
      const p = i * CELL + 0.5;
      c.moveTo(p, 0);
      c.lineTo(p, BOARD);
      c.moveTo(0, p);
      c.lineTo(BOARD, p);
    }
    c.stroke();

    // Major grid.
    c.strokeStyle = 'rgba(151, 255, 190, 0.105)';
    c.beginPath();
    for (let i = 6; i < GRID; i += 6) {
      const p = i * CELL + 0.5;
      c.moveTo(p, 0);
      c.lineTo(p, BOARD);
      c.moveTo(0, p);
      c.lineTo(BOARD, p);
    }
    c.stroke();

    // Intersection markers.
    c.fillStyle = 'rgba(183, 255, 98, 0.22)';
    for (let y = 6; y < GRID; y += 6) {
      for (let x = 6; x < GRID; x += 6) {
        c.fillRect(x * CELL - 1.2, y * CELL - 1.2, 2.4, 2.4);
      }
    }
    c.restore();

    // Perimeter.
    c.save();
    c.strokeStyle = 'rgba(183, 255, 98, 0.16)';
    c.lineWidth = 1.4;
    c.strokeRect(1, 1, BOARD - 2, BOARD - 2);
    c.strokeStyle = 'rgba(183, 255, 98, 0.035)';
    c.lineWidth = 7;
    c.strokeRect(4.5, 4.5, BOARD - 9, BOARD - 9);
    c.restore();

    // Corner brackets.
    const corner = 25;
    const inset = 14;
    c.save();
    c.strokeStyle = 'rgba(183, 255, 98, 0.56)';
    c.lineWidth = 1.3;
    c.beginPath();
    c.moveTo(inset, inset + corner); c.lineTo(inset, inset); c.lineTo(inset + corner, inset);
    c.moveTo(BOARD - inset - corner, inset); c.lineTo(BOARD - inset, inset); c.lineTo(BOARD - inset, inset + corner);
    c.moveTo(inset, BOARD - inset - corner); c.lineTo(inset, BOARD - inset); c.lineTo(inset + corner, BOARD - inset);
    c.moveTo(BOARD - inset - corner, BOARD - inset); c.lineTo(BOARD - inset, BOARD - inset); c.lineTo(BOARD - inset, BOARD - inset - corner);
    c.stroke();
    c.restore();

    // Edge ticks.
    c.save();
    c.strokeStyle = 'rgba(168, 255, 195, 0.16)';
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i < GRID; i += 2) {
      const p = (i + 0.5) * CELL;
      c.moveTo(4, p); c.lineTo(8, p);
      c.moveTo(BOARD - 8, p); c.lineTo(BOARD - 4, p);
      c.moveTo(p, 4); c.lineTo(p, 8);
      c.moveTo(p, BOARD - 8); c.lineTo(p, BOARD - 4);
    }
    c.stroke();
    c.restore();

    // Faint sector decals.
    c.save();
    c.strokeStyle = 'rgba(183, 255, 98, 0.032)';
    c.lineWidth = 1.2;
    c.font = '500 190px "IBM Plex Mono", monospace';
    c.textAlign = 'right';
    c.textBaseline = 'alphabetic';
    c.strokeText('07', 681, 700);
    c.restore();

    c.save();
    c.fillStyle = 'rgba(174, 255, 198, 0.13)';
    c.font = '500 7px "IBM Plex Mono", monospace';
    c.translate(22, 360);
    c.rotate(-Math.PI / 2);
    c.fillText('SERPENT // SECTOR 07', 0, 0);
    c.restore();

    // Vignette.
    const vignette = c.createRadialGradient(BOARD / 2, BOARD / 2, BOARD * 0.38, BOARD / 2, BOARD / 2, BOARD * 0.74);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.33)');
    c.fillStyle = vignette;
    c.fillRect(0, 0, BOARD, BOARD);
  }

  function drawBoard(now) {
    if (boardCacheDpr !== Math.min(window.devicePixelRatio || 1, 2)) {
      buildBoardCache(Math.min(window.devicePixelRatio || 1, 2));
    }
    ctx.drawImage(boardCache, 0, 0, BOARD, BOARD);

    // Soft drifting spotlight.
    const driftX = BOARD * 0.5 + Math.sin(now * 0.00014) * 165;
    const driftY = BOARD * 0.42 + Math.cos(now * 0.00011) * 110;
    const glow = ctx.createRadialGradient(driftX, driftY, 0, driftX, driftY, 330);
    glow.addColorStop(0, 'rgba(91, 255, 137, 0.043)');
    glow.addColorStop(0.6, 'rgba(59, 237, 170, 0.017)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, BOARD, BOARD);

    // A low, slow scan band across the playfield.
    const bandY = ((now * 0.021) % (BOARD + 300)) - 150;
    const band = ctx.createLinearGradient(0, bandY - 80, 0, bandY + 80);
    band.addColorStop(0, 'rgba(172, 255, 191, 0)');
    band.addColorStop(0.5, 'rgba(172, 255, 191, 0.017)');
    band.addColorStop(1, 'rgba(172, 255, 191, 0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, bandY - 80, BOARD, 160);
  }

  function drawNode(x, y, now, gold = false, phase = 0, ttlRatio = 1) {
    const pulse = 1 + Math.sin(now * 0.004 + phase) * 0.09;
    const outer = gold ? 37 : 30;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const aura = ctx.createRadialGradient(x, y, 0, x, y, outer * pulse);
    if (gold) {
      aura.addColorStop(0, 'rgba(255, 235, 165, 0.48)');
      aura.addColorStop(0.26, 'rgba(255, 207, 82, 0.22)');
      aura.addColorStop(0.7, 'rgba(255, 172, 52, 0.055)');
    } else {
      aura.addColorStop(0, 'rgba(227, 255, 186, 0.42)');
      aura.addColorStop(0.3, 'rgba(171, 255, 91, 0.18)');
      aura.addColorStop(1, 'rgba(92, 255, 123, 0.015)');
    }
    aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(x, y, outer * pulse, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = gold ? 'rgba(255, 211, 92, 0.8)' : 'rgba(183, 255, 98, 0.85)';
    ctx.shadowBlur = gold ? 19 : 14;

    if (gold) {
      ctx.rotate(now * 0.0011 + phase);
      ctx.fillStyle = '#ffe589';
      roundedRectPath(-9.4, -9.4, 18.8, 18.8, 3.2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff8d0';
      roundedRectPath(-4.7, -4.7, 9.4, 9.4, 1.6);
      ctx.fill();

      // Orbiting sparks.
      ctx.rotate(-now * 0.0017);
      ctx.strokeStyle = 'rgba(255, 226, 128, 0.54)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 4; i++) {
        ctx.rotate(TAU / 4);
        ctx.beginPath();
        ctx.moveTo(16, 0);
        ctx.lineTo(22, 0);
        ctx.stroke();
      }
    } else {
      const coreGradient = ctx.createRadialGradient(-2, -3, 1, 0, 0, 10);
      coreGradient.addColorStop(0, '#f2ffcc');
      coreGradient.addColorStop(0.42, '#c5ff6d');
      coreGradient.addColorStop(1, '#52e88e');
      ctx.fillStyle = coreGradient;
      ctx.beginPath();
      ctx.arc(0, 0, 8.4 * pulse, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255, 255, 235, 0.9)';
      ctx.beginPath();
      ctx.arc(-2.1, -2.6, 2.1, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // Rotating target ring.
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(now * (gold ? 0.00072 : -0.00042));
    ctx.strokeStyle = gold ? 'rgba(255, 219, 110, 0.32)' : 'rgba(183, 255, 98, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 7]);
    ctx.beginPath();
    ctx.arc(0, 0, gold ? 21 : 17, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Decay arc for pulse cores.
    if (gold && ttlRatio > 0) {
      ctx.save();
      ctx.translate(x, y);
      ctx.strokeStyle = 'rgba(255, 219, 110, 0.66)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, 27, -Math.PI / 2, -Math.PI / 2 + TAU * ttlRatio);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawFood(now) {
    if (state.food) {
      drawNode((state.food.x + 0.5) * CELL, (state.food.y + 0.5) * CELL, now, false, state.food.x * 0.3 + state.food.y * 0.17);
    }
    if (state.core) {
      const ttlRatio = clamp(state.core.ttl / CORE_LIFETIME, 0, 1);
      drawNode((state.core.x + 0.5) * CELL, (state.core.y + 0.5) * CELL, now, true, 1.2, ttlRatio);
    }
  }

  function interpolatedSnake(alpha) {
    const points = [];
    for (let i = 0; i < state.snake.length; i++) {
      const current = state.snake[i];
      const previous = state.prev[i] || state.prev[state.prev.length - 1] || current;
      points.push({
        x: (previous.x + (current.x - previous.x) * alpha + 0.5) * CELL,
        y: (previous.y + (current.y - previous.y) * alpha + 0.5) * CELL
      });
    }
    return points;
  }

  function strokeSnakePath(points) {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  }

  function drawSnake(now, alpha) {
    if (!state.snake.length) return;
    const points = interpolatedSnake(alpha);
    const head = points[0];
    const tail = points[points.length - 1];
    const dying = state.mode === 'dying' || state.mode === 'gameover';

    // Ground shadow.
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 19;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.translate(2, 4);
    strokeSnakePath(points);
    ctx.stroke();
    ctx.restore();

    // Outer aura.
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = dying ? 'rgba(255, 93, 68, 0.11)' : 'rgba(109, 255, 119, 0.12)';
    ctx.lineWidth = 33;
    strokeSnakePath(points);
    ctx.stroke();
    ctx.restore();

    // Dark edge keeps the serpent crisp against the grid.
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = dying ? 'rgba(70, 15, 10, 0.86)' : 'rgba(2, 35, 23, 0.9)';
    ctx.lineWidth = 22;
    strokeSnakePath(points);
    ctx.stroke();
    ctx.restore();

    // Main body.
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = dying ? 'rgba(255, 92, 70, 0.55)' : 'rgba(97, 255, 111, 0.55)';
    ctx.shadowBlur = 20;

    const bodyGradient = ctx.createLinearGradient(head.x, head.y, tail.x, tail.y);
    if (dying) {
      bodyGradient.addColorStop(0, '#ffd1a0');
      bodyGradient.addColorStop(0.35, '#ff8061');
      bodyGradient.addColorStop(1, '#a9352a');
    } else {
      bodyGradient.addColorStop(0, '#e0ff9a');
      bodyGradient.addColorStop(0.28, '#aaff62');
      bodyGradient.addColorStop(0.72, '#5cf493');
      bodyGradient.addColorStop(1, '#21c9a8');
    }
    ctx.strokeStyle = bodyGradient;
    ctx.lineWidth = 19;
    strokeSnakePath(points);
    ctx.stroke();
    ctx.restore();

    // Articulated segment bands.
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 1; i < points.length - 1; i++) {
      const before = points[i - 1];
      const after = points[i + 1];
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      const length = Math.hypot(dx, dy);
      if (length < 0.01) continue;
      const nx = -dy / length;
      const ny = dx / length;
      const p = points[i];
      ctx.strokeStyle = dying ? 'rgba(89, 22, 16, 0.3)' : 'rgba(3, 46, 30, 0.28)';
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(p.x - nx * 8.4, p.y - ny * 8.4);
      ctx.lineTo(p.x + nx * 8.4, p.y + ny * 8.4);
      ctx.stroke();
    }
    ctx.restore();

    // Inner light along the spine.
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = dying ? 'rgba(255, 236, 214, 0.28)' : 'rgba(235, 255, 206, 0.23)';
    ctx.lineWidth = 4.5;
    strokeSnakePath(points.slice(0, Math.max(2, Math.ceil(points.length * 0.8))));
    ctx.stroke();
    ctx.restore();

    // Scale glints.
    ctx.save();
    ctx.fillStyle = dying ? 'rgba(120, 22, 15, 0.22)' : 'rgba(5, 55, 36, 0.22)';
    for (let i = 2; i < points.length - 1; i += 2) {
      ctx.beginPath();
      ctx.arc(points[i].x, points[i].y + 2.4, 1.8, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // Tail node.
    ctx.save();
    ctx.fillStyle = dying ? '#a9352a' : '#21c9a8';
    ctx.shadowColor = dying ? 'rgba(255, 92, 70, 0.4)' : 'rgba(33, 201, 168, 0.45)';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(tail.x, tail.y, 6.3, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Head.
    const angle = Math.atan2(state.dir.y, state.dir.x);
    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(angle);
    ctx.fillStyle = dying ? 'rgba(70, 15, 10, 0.9)' : 'rgba(2, 35, 23, 0.94)';
    ctx.beginPath();
    ctx.ellipse(1.5, 0, 17.2, 14.6, 0, 0, TAU);
    ctx.fill();
    ctx.shadowColor = dying ? 'rgba(255, 92, 70, 0.7)' : 'rgba(156, 255, 104, 0.7)';
    ctx.shadowBlur = 23;
    const headGradient = ctx.createRadialGradient(5, -4, 2, 0, 0, 19);
    if (dying) {
      headGradient.addColorStop(0, '#ffe0bb');
      headGradient.addColorStop(0.43, '#ff8a68');
      headGradient.addColorStop(1, '#b5342a');
    } else {
      headGradient.addColorStop(0, '#f5ffd2');
      headGradient.addColorStop(0.35, '#c8ff72');
      headGradient.addColorStop(1, '#53e493');
    }
    ctx.fillStyle = headGradient;
    ctx.beginPath();
    ctx.ellipse(1.5, 0, 15.5, 12.9, 0, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Head highlight.
    ctx.strokeStyle = 'rgba(255, 255, 220, 0.28)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(1.5, 0, 12.2, 9.6, 0, Math.PI * 0.9, Math.PI * 1.58);
    ctx.stroke();

    // Eyes.
    const eyeX = 6.7;
    const eyeY = 6.3;
    ctx.fillStyle = '#f8fff0';
    ctx.beginPath();
    ctx.arc(eyeX, -eyeY, 3.8, 0, TAU);
    ctx.arc(eyeX, eyeY, 3.8, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#06170e';
    if (dying) {
      ctx.strokeStyle = '#06170e';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(eyeX - 1.4, -eyeY - 1.4); ctx.lineTo(eyeX + 1.4, -eyeY + 1.4);
      ctx.moveTo(eyeX + 1.4, -eyeY - 1.4); ctx.lineTo(eyeX - 1.4, -eyeY + 1.4);
      ctx.moveTo(eyeX - 1.4, eyeY - 1.4); ctx.lineTo(eyeX + 1.4, eyeY + 1.4);
      ctx.moveTo(eyeX + 1.4, eyeY - 1.4); ctx.lineTo(eyeX - 1.4, eyeY + 1.4);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(eyeX + 1.15, -eyeY, 1.9, 0, TAU);
      ctx.arc(eyeX + 1.15, eyeY, 1.9, 0, TAU);
      ctx.fill();
    }

    // Nostrils.
    if (!dying) {
      ctx.fillStyle = 'rgba(6, 34, 20, 0.55)';
      ctx.beginPath();
      ctx.arc(11.8, -3.5, 1.05, 0, TAU);
      ctx.arc(11.8, 3.5, 1.05, 0, TAU);
      ctx.fill();
    }

    // Flicking tongue.
    const tongueCycle = now % 1900;
    if (!dying && tongueCycle < 260) {
      const extension = Math.sin((tongueCycle / 260) * Math.PI);
      ctx.strokeStyle = '#ff8068';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(15, 0);
      ctx.lineTo(15 + 9 * extension, 0);
      ctx.lineTo(15 + 13 * extension, -2.7 * extension);
      ctx.moveTo(15 + 9 * extension, 0);
      ctx.lineTo(15 + 13 * extension, 2.7 * extension);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of state.particles) {
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = alpha * alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.35 + alpha * 0.65), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPopups() {
    for (const popup of state.popups) {
      const progress = 1 - popup.life / popup.maxLife;
      const alpha = popup.life > 0.2 ? 1 : popup.life / 0.2;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `500 ${popup.size}px "IBM Plex Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = popup.color;
      ctx.shadowColor = popup.color;
      ctx.shadowBlur = 11;
      ctx.fillText(popup.text, popup.x, popup.y - 15 - progress * 29);
      ctx.restore();
    }
  }

  function drawAmbient(now) {
    // Nodes on the right of the start screen.
    for (const node of state.attractNodes) {
      drawNode(node.x, node.y, now, node.gold, node.phase, node.gold ? (1 - ((now * 0.00006 + node.phase) % 1)) : 1);
    }

    // A slow, living serpent signature beneath the menu copy.
    const phase = now * 0.00048;
    const points = [];
    for (let i = 0; i <= 54; i++) {
      const u = i / 54;
      const x = 55 + u * 610;
      const y = 424 + Math.sin(u * 6.4 + phase * 2.4) * 104 + Math.sin(u * 14.1 - phase * 1.4) * 17;
      points.push({ x, y });
    }

    ctx.save();
    ctx.globalAlpha = 0.36;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(111, 255, 128, 0.17)';
    ctx.lineWidth = 26;
    strokeSnakePath(points);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.58;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(108, 255, 115, 0.48)';
    ctx.shadowBlur = 19;
    const gradient = ctx.createLinearGradient(points[0].x, points[0].y, points[points.length - 1].x, points[points.length - 1].y);
    gradient.addColorStop(0, 'rgba(41, 207, 150, 0.15)');
    gradient.addColorStop(0.55, 'rgba(103, 247, 117, 0.46)');
    gradient.addColorStop(1, 'rgba(214, 255, 125, 0.87)');
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 15;
    strokeSnakePath(points);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(237, 255, 191, 0.3)';
    ctx.lineWidth = 3.4;
    strokeSnakePath(points);
    ctx.stroke();
    ctx.restore();

    // Head at the leading end.
    const head = points[points.length - 1];
    const nearHead = points[points.length - 4];
    const angle = Math.atan2(head.y - nearHead.y, head.x - nearHead.x);
    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(angle);
    ctx.globalAlpha = 0.64;
    ctx.shadowColor = 'rgba(184, 255, 111, 0.6)';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#cfff83';
    ctx.beginPath();
    ctx.ellipse(1, 0, 13, 10.6, 0, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#f6ffe5';
    ctx.beginPath();
    ctx.arc(5.5, -5.1, 3, 0, TAU);
    ctx.arc(5.5, 5.1, 3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#082012';
    ctx.beginPath();
    ctx.arc(6.4, -5.1, 1.55, 0, TAU);
    ctx.arc(6.4, 5.1, 1.55, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawCrosshairLegend(now) {
    // Minimal "scanning" reticle at the top-right of the grid, decorative.
    const x = BOARD - 55;
    const y = 55;
    const pulse = 0.2 + Math.sin(now * 0.0018) * 0.1;
    ctx.save();
    ctx.strokeStyle = `rgba(183, 255, 98, ${pulse})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, TAU);
    ctx.moveTo(x - 16, y); ctx.lineTo(x - 5, y);
    ctx.moveTo(x + 5, y); ctx.lineTo(x + 16, y);
    ctx.moveTo(x, y - 16); ctx.lineTo(x, y - 5);
    ctx.moveTo(x, y + 5); ctx.lineTo(x, y + 16);
    ctx.stroke();
    ctx.restore();
  }

  function render(now) {
    resizeCanvas();
    ctx.clearRect(0, 0, BOARD, BOARD);

    ctx.save();
    if (state.shake > 0.05) {
      ctx.translate((Math.random() * 2 - 1) * state.shake, (Math.random() * 2 - 1) * state.shake);
    }

    drawBoard(now);

    if (state.mode === 'menu') {
      drawAmbient(now);
      drawCrosshairLegend(now);
    } else {
      drawFood(now);
      const alpha = state.mode === 'playing'
        ? clamp(state.stepTimer / state.tickMs, 0, 1)
        : 1;
      drawSnake(now, alpha);
      drawParticles();
      drawPopups();
      drawCrosshairLegend(now);
    }

    ctx.restore();

    if (state.flash > 0.005) {
      ctx.save();
      ctx.fillStyle = `rgba(255, 92, 65, ${state.flash * 0.18})`;
      ctx.fillRect(0, 0, BOARD, BOARD);
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------
  function loop(now) {
    const rawDt = now - state.lastFrame;
    const dt = clamp(Number.isFinite(rawDt) ? rawDt : 16, 0, 150);
    state.lastFrame = now;

    if (state.mode === 'playing') {
      if (state.launchGrace > 0) {
        state.launchGrace = Math.max(0, state.launchGrace - dt);
      } else {
        updateTimedSystems(dt);
        state.stepTimer += dt;
        let safety = 0;
        while (state.stepTimer >= state.tickMs && state.mode === 'playing' && safety < 10) {
          state.stepTimer -= state.tickMs;
          stepGame(now);
          safety += 1;
        }
        if (state.mode !== 'playing') state.stepTimer = 0;
      }
    }

    if (state.mode === 'dying' && now - state.deathAt > 850) {
      endRun();
    }

    const frozen = state.mode === 'paused' || helpOpen;
    if (!frozen) updateEffects(dt);
    if (!frozen && state.mode !== 'gameover') render(now);
    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------
  function initialize() {
    resizeCanvas();
    setMenuPreview();
    dom.soundToggle.classList.toggle('is-muted', !sound.enabled);
    dom.soundToggle.setAttribute('aria-pressed', String(sound.enabled));
    dom.soundLabel.textContent = sound.enabled ? 'SOUND ON' : 'SOUND OFF';
    hideOverlay(pauseOverlay);
    hideOverlay(gameoverOverlay);
    showOverlay(startOverlay);
    setStatus('STANDBY');
    syncStagePause();
    dom.touchControls.classList.add('is-idle');
    dom.touchPause.setAttribute('aria-label', 'Pause game');
    helpModal.setAttribute('aria-hidden', 'true');
    updateHUD();
    state.lastFrame = performance.now();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { boardCacheDpr = 0; }).catch(() => {});
    }
    requestAnimationFrame(loop);
  }

  initialize();

  // A tiny read-only-ish debug bridge, available only when ?debug=1 is present.
  // It keeps the production page clean while making game states easy to inspect.
  if (new URLSearchParams(window.location.search).has('debug')) {
    window.__serpentDebug = {
      state,
      startGame,
      setPaused,
      showMenu,
      spawnFood,
      spawnBurst
    };
  }
})();
