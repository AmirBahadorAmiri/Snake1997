(function () {
  'use strict';

  var COLS = 16;
  var ROWS = 16;
  var CELL = 16;
  var BAR_H = 16;
  var WIDTH = COLS * CELL;
  var HEIGHT = BAR_H + ROWS * CELL + BAR_H;

  var START_STEP = 150;
  var MIN_STEP = 60;
  var STEP_DECAY = 6;
  var FOOD_POINTS = 10;
  var STORAGE_KEY = 'nokia-snake-high-score';

  var UP = { x: 0, y: -1 };
  var DOWN = { x: 0, y: 1 };
  var LEFT = { x: -1, y: 0 };
  var RIGHT = { x: 1, y: 0 };

  var canvas = document.getElementById('lcd');
  var ctx = canvas.getContext('2d');
  var hiLabel = document.getElementById('hi-label');

  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  var snake = [];
  var dir = RIGHT;
  var turns = [];
  var food = { x: 0, y: 0 };
  var score = 0;
  var highScore = readHighScore();
  var state = 'idle';
  var message = 'PRESS 5';
  var newRecord = false;
  var lastTime = 0;
  var accumulator = 0;

  var GLYPHS = {
    '0': '01110,10001,10001,10001,01110',
    '1': '00100,01100,00100,00100,01110',
    '2': '01110,10001,00001,00010,11111',
    '3': '01110,00001,01110,00001,01110',
    '4': '00010,00110,01010,11111,00010',
    '5': '11111,10000,11110,00001,11110',
    '6': '01110,10000,11110,10001,01110',
    '7': '11111,00001,00010,00100,00100',
    '8': '01110,10001,01110,10001,01110',
    '9': '01110,10001,01111,00001,01110',
    'A': '010,101,111,101,101',
    'B': '110,101,110,101,110',
    'C': '011,100,100,100,011',
    'D': '110,101,101,101,110',
    'E': '111,100,110,100,111',
    'F': '111,100,110,100,100',
    'G': '011,100,101,101,011',
    'H': '101,101,111,101,101',
    'I': '111,010,010,010,111',
    'J': '001,001,001,101,010',
    'K': '101,101,110,101,101',
    'L': '100,100,100,100,111',
    'M': '10001,11011,10101,10001,10001',
    'N': '1001,1101,1011,1001,1001',
    'O': '010,101,101,101,010',
    'P': '110,101,110,100,100',
    'Q': '0110,1001,1001,1011,0111',
    'R': '110,101,110,101,101',
    'S': '011,100,010,001,110',
    'T': '111,010,010,010,010',
    'U': '101,101,101,101,011',
    'V': '101,101,101,101,010',
    'W': '10001,10101,10101,11011,10001',
    'X': '101,101,010,101,101',
    'Y': '101,101,010,010,010',
    'Z': '111,001,010,100,111',
    ' ': '000,000,000,000,000',
    '-': '000,000,111,000,000',
    ':': '000,010,000,010,000',
    '.': '000,000,000,000,010'
  };

  var font = {};

  Object.keys(GLYPHS).forEach(function (char) {
    var rows = GLYPHS[char].split(',');
    var columns = [];
    for (var x = 0; x < rows[0].length; x++) {
      var bits = 0;
      for (var y = 0; y < 5; y++) {
        if (rows[y].charAt(x) === '1') {
          bits |= 1 << (4 - y);
        }
      }
      columns.push(bits);
    }
    font[char] = { width: columns.length, columns: columns };
  });

  function textWidth(text, scale) {
    var total = 0;
    for (var i = 0; i < text.length; i++) {
      var glyph = font[text.charAt(i)] || font[' '];
      total += (glyph.width + 1) * scale;
    }
    return total;
  }

  function drawText(text, x, y, scale, align) {
    var value = String(text).toUpperCase();
    var width = textWidth(value, scale);
    var cursor = x;

    if (align === 'center') {
      cursor -= Math.round(width / 2);
    } else if (align === 'right') {
      cursor -= width;
    }

    ctx.fillStyle = '#25301c';
    for (var i = 0; i < value.length; i++) {
      var glyph = font[value.charAt(i)] || font[' '];
      for (var c = 0; c < glyph.columns.length; c++) {
        var bits = glyph.columns[c];
        for (var r = 0; r < 5; r++) {
          if (bits & (1 << (4 - r))) {
            ctx.fillRect(cursor + c * scale, y + r * scale, scale, scale);
          }
        }
      }
      cursor += (glyph.width + 1) * scale;
    }
  }

  var soundOn = true;
  var audio = null;

  function beep(frequency, duration, type, endFrequency) {
    if (!soundOn) {
      return;
    }
    if (!audio) {
      var AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) {
        return;
      }
      audio = new AudioCtor();
    }
    if (audio.state === 'suspended') {
      audio.resume();
    }
    var start = audio.currentTime;
    var osc = audio.createOscillator();
    var gain = audio.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(frequency, start);
    if (endFrequency) {
      osc.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.09, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  function readHighScore() {
    try {
      return parseInt(window.localStorage.getItem(STORAGE_KEY), 10) || 0;
    } catch (err) {
      return 0;
    }
  }

  function writeHighScore(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch (err) {
      return;
    }
  }

  function stepMs() {
    return Math.max(MIN_STEP, START_STEP - (score / FOOD_POINTS) * STEP_DECAY);
  }

  function freeCell() {
    var taken = {};
    var i;

    for (i = 0; i < snake.length; i++) {
      taken[snake[i].y * COLS + snake[i].x] = true;
    }

    var free = [];
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        if (!taken[y * COLS + x]) {
          free.push({ x: x, y: y });
        }
      }
    }

    return free.length ? free[(Math.random() * free.length) | 0] : null;
  }

  function commitScore() {
    if (score <= highScore) {
      return;
    }
    highScore = score;
    newRecord = true;
    writeHighScore(highScore);
    if (hiLabel) {
      hiLabel.textContent = String(highScore);
    }
  }

  function placeFood() {
    var cell = freeCell();
    if (!cell) {
      food = null;
      state = 'won';
      message = 'YOU WIN';
      commitScore();
      beep(660, 0.09, 'square', 990);
      return;
    }
    food = cell;
  }

  function reset() {
    snake = [
      { x: 7, y: 8 }, { x: 6, y: 8 }, { x: 5, y: 8 }, { x: 4, y: 8 }
    ];
    dir = RIGHT;
    turns = [];
    score = 0;
    newRecord = false;
    accumulator = 0;
    placeFood();
  }

  function beginRun() {
    reset();
    state = 'playing';
    message = '';
    beep(523, 0.06, 'square');
    beep(784, 0.09, 'square', 1046);
  }

  function togglePause() {
    if (state === 'playing') {
      state = 'paused';
      message = 'PAUSED';
      return;
    }
    if (state === 'paused') {
      state = 'playing';
      message = '';
      return;
    }
    beginRun();
  }

  function die() {
    state = 'dead';
    commitScore();
    message = newRecord ? 'NEW HI ' + score : 'GAME OVER';
    beep(320, 0.5, 'sawtooth', 70);
  }

  function turn(next) {
    if (state !== 'playing') {
      return;
    }
    var ref = turns.length ? turns[turns.length - 1] : dir;
    if (next.x === ref.x && next.y === ref.y) {
      return;
    }
    if (next.x === -ref.x && next.y === -ref.y) {
      return;
    }
    if (turns.length < 2) {
      turns.push(next);
    }
  }

  function update() {
    if (turns.length) {
      dir = turns.shift();
    }

    var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS) {
      die();
      return;
    }

    var ate = food !== null && head.x === food.x && head.y === food.y;
    var bodyLength = snake.length - (ate ? 0 : 1);

    for (var i = 0; i < bodyLength; i++) {
      if (snake[i].x === head.x && snake[i].y === head.y) {
        die();
        return;
      }
    }

    snake.unshift(head);

    if (ate) {
      score += FOOD_POINTS;
      beep(880, 0.06, 'square', 1320);
      placeFood();
    } else {
      snake.pop();
    }
  }

  function render(now) {
    ctx.fillStyle = '#b6c79a';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    drawText('SCORE ' + score, 4, 5, 2, 'left');
    drawText('HI ' + highScore, WIDTH - 4, 5, 2, 'right');
    ctx.fillStyle = 'rgba(37, 48, 28, 0.25)';
    ctx.fillRect(0, BAR_H - 1, WIDTH, 1);

    ctx.fillStyle = 'rgba(37, 48, 28, 0.16)';
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        ctx.fillRect(x * CELL + CELL / 2, BAR_H + y * CELL + CELL / 2, 1, 1);
      }
    }

    if (food !== null && Math.floor(now / 200) % 2 === 0) {
      ctx.fillStyle = '#25301c';
      ctx.fillRect(food.x * CELL + 3, BAR_H + food.y * CELL + 3, CELL - 6, CELL - 6);
    }

    for (var s = 0; s < snake.length; s++) {
      var pad = s === 0 ? 1 : 2;
      ctx.fillStyle = s === 0 ? '#1d2712' : '#25301c';
      ctx.fillRect(
        snake[s].x * CELL + pad,
        BAR_H + snake[s].y * CELL + pad,
        CELL - pad * 2,
        CELL - pad * 2
      );
    }

    if (message) {
      ctx.fillStyle = 'rgba(37, 48, 28, 0.18)';
      ctx.fillRect(0, HEIGHT - BAR_H, WIDTH, 1);
      drawText(message, WIDTH / 2, HEIGHT - 12, 2, 'center');
    }

    if (state === 'idle') {
      ctx.fillStyle = 'rgba(182, 199, 154, 0.45)';
      ctx.fillRect(0, BAR_H, WIDTH, ROWS * CELL);
      drawText('SNAKE', WIDTH / 2, BAR_H + ROWS * CELL / 2 - 22, 3, 'center');
      drawText('READY', WIDTH / 2, BAR_H + ROWS * CELL / 2 + 6, 2, 'center');
    }
  }

  function loop(now) {
    if (!lastTime) {
      lastTime = now;
    }
    var delta = now - lastTime;
    lastTime = now;

    if (state === 'playing') {
      accumulator += delta;
      var interval = stepMs();
      var guard = 0;
      while (accumulator >= interval && state === 'playing' && guard < 4) {
        accumulator -= interval;
        update();
        guard++;
      }
    } else {
      accumulator = 0;
    }

    render(now);
    window.requestAnimationFrame(loop);
  }

  var KEY_DIRS = {
    '2': UP,
    '8': DOWN,
    '4': LEFT,
    '6': RIGHT,
    'arrowup': UP,
    'arrowdown': DOWN,
    'arrowleft': LEFT,
    'arrowright': RIGHT,
    'w': UP,
    's': DOWN,
    'a': LEFT,
    'd': RIGHT
  };

  var KEYPAD_OF = {
    arrowup: '2',
    arrowdown: '8',
    arrowleft: '4',
    arrowright: '6',
    w: '2',
    s: '8',
    a: '4',
    d: '6'
  };

  function press(key) {
    var name = String(key).toLowerCase();
    if (KEY_DIRS[name]) {
      turn(KEY_DIRS[name]);
      return;
    }
    if (name === '5' || name === 'enter' || name === ' ') {
      togglePause();
    }
  }

  function flashKey(key) {
    var button = document.querySelector('.key[data-key="' + key + '"]');
    if (!button) {
      return;
    }
    button.classList.add('is-active');
    window.setTimeout(function () {
      button.classList.remove('is-active');
    }, 110);
  }

  document.addEventListener('keydown', function (event) {
    var name = event.key.toLowerCase();
    var isDirection = Boolean(KEY_DIRS[name]);
    var isAction = name === '5' || name === 'enter' || name === ' ';
    if (!isDirection && !isAction) {
      return;
    }
    event.preventDefault();
    flashKey(KEYPAD_OF[name] || '5');
    press(name);
  });

  document.getElementById('keypad').addEventListener('click', function (event) {
    var button = event.target.closest('.key');
    if (!button) {
      return;
    }
    press(button.getAttribute('data-key'));
  });

  document.getElementById('btn-start').addEventListener('click', function () {
    togglePause();
  });

  document.getElementById('btn-reset').addEventListener('click', function () {
    reset();
    state = 'idle';
    message = 'PRESS 5';
    beep(220, 0.08, 'square', 160);
  });

  document.getElementById('btn-sound').addEventListener('click', function () {
    soundOn = !soundOn;
    this.textContent = 'صدا: ' + (soundOn ? 'روشن' : 'خاموش');
    this.setAttribute('aria-pressed', String(soundOn));
    if (soundOn) {
      beep(660, 0.05, 'square');
    }
  });

  var touchEnabled = true;
  var swipe = null;

  canvas.addEventListener('pointerdown', function (event) {
    if (touchEnabled) {
      swipe = { x: event.clientX, y: event.clientY };
    }
  });

  canvas.addEventListener('pointermove', function (event) {
    if (!swipe) {
      return;
    }
    var dx = event.clientX - swipe.x;
    var dy = event.clientY - swipe.y;
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) {
      turn(dx > 0 ? RIGHT : LEFT);
      flashKey(dx > 0 ? '6' : '4');
    } else {
      turn(dy > 0 ? DOWN : UP);
      flashKey(dy > 0 ? '8' : '2');
    }
    swipe = { x: event.clientX, y: event.clientY };
  });

  canvas.addEventListener('pointerup', function () {
    swipe = null;
  });

  canvas.addEventListener('pointercancel', function () {
    swipe = null;
  });

  document.getElementById('btn-touch').addEventListener('click', function () {
    touchEnabled = !touchEnabled;
    this.textContent = 'لمسی: ' + (touchEnabled ? 'روشن' : 'خاموش');
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && state === 'playing') {
      state = 'paused';
      message = 'PAUSED';
    }
  });

  reset();
  if (hiLabel) {
    hiLabel.textContent = String(highScore);
  }
  window.requestAnimationFrame(loop);
})();
