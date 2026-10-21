
const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// Colores neón para cada pieza
const COLORS = {
  I: '#00e5ff',
  O: '#ffb800',
  T: '#b14cff',
  S: '#2bff88',
  Z: '#ff3c6e',
  J: '#3c7bff',
  L: '#ff8a1f',
};

const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
};

// Puntos por líneas eliminadas (multiplicado por el nivel)
const LINE_POINTS = [0, 100, 300, 500, 800];
const LINE_TEXT = ['', '¡LÍNEA!', '¡DOBLE!', '¡TRIPLE!', '¡TETRIS!'];

// ---------- Elementos del DOM ----------
const boardCanvas = document.getElementById('board');
const ctx = boardCanvas.getContext('2d');
const holdCtx = document.getElementById('hold').getContext('2d');
const nextCtx = document.getElementById('next').getContext('2d');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayText = document.getElementById('overlay-text');
const startBtn = document.getElementById('start-btn');
const comboEl = document.getElementById('combo');
const boardWrap = document.querySelector('.board-wrap');
const ui = {
  score: document.getElementById('score'),
  level: document.getElementById('level'),
  lines: document.getElementById('lines'),
  best: document.getElementById('best'),
};

// ---------- Estado del juego ----------
let board, current, holdType, canHold, queue, bag;
let score, lines, level, dropInterval, dropCounter, lastTime;
let running = false, paused = false, gameOver = false;
let particles = [];
let clearingRows = [], clearAnim = 0;
let soundOn = true;
let best = Number(safeGet('tetris-best')) || 0;
ui.best.textContent = best;

function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, val) {
  try { localStorage.setItem(key, val); } catch { /* sin almacenamiento */ }
}

// ---------- Sonido (Web Audio, sin archivos externos) ----------
let audioCtx = null;
function beep(freq, duration = 0.08, type = 'square', volume = 0.05) {
  if (!soundOn) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch { /* audio no disponible */ }
}
const sfx = {
  move: () => beep(220, 0.04),
  rotate: () => beep(440, 0.05, 'triangle'),
  drop: () => beep(110, 0.12, 'sawtooth', 0.07),
  hold: () => beep(660, 0.06, 'triangle'),
  clear: (n) => [523, 659, 784, 1047].slice(0, n).forEach((f, i) => setTimeout(() => beep(f, 0.12, 'square', 0.06), i * 70)),
  over: () => [400, 300, 200, 120].forEach((f, i) => setTimeout(() => beep(f, 0.25, 'sawtooth', 0.06), i * 180)),
};

// ---------- Utilidades ----------
const emptyBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null));

// "Bolsa de 7": cada pieza aparece una vez por ciclo (más justo)
function nextFromBag() {
  if (!bag.length) {
    bag = Object.keys(SHAPES);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  return bag.pop();
}

function createPiece(type) {
  const matrix = SHAPES[type].map(row => [...row]);
  return {
    type,
    matrix,
    x: Math.floor((COLS - matrix[0].length) / 2),
    y: type === 'I' ? -1 : 0,
  };
}

function collides(piece, dx = 0, dy = 0, matrix = piece.matrix) {
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix[y].length; x++) {
      if (!matrix[y][x]) continue;
      const nx = piece.x + x + dx;
      const ny = piece.y + y + dy;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateMatrix(matrix, dir) {
  const n = matrix.length;
  const res = Array.from({ length: n }, () => Array(n).fill(0));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (dir > 0) res[x][n - 1 - y] = matrix[y][x];
      else res[n - 1 - x][y] = matrix[y][x];
    }
  }
  return res;
}

// ---------- Acciones del jugador ----------
function move(dx) {
  if (!collides(current, dx, 0)) {
    current.x += dx;
    sfx.move();
  }
}

function rotate(dir = 1) {
  if (current.type === 'O') return;
  const rotated = rotateMatrix(current.matrix, dir);
  // "Wall kicks": intenta desplazar la pieza si choca con la pared
  for (const kick of [0, -1, 1, -2, 2]) {
    if (!collides(current, kick, 0, rotated)) {
      current.matrix = rotated;
      current.x += kick;
      sfx.rotate();
      return;
    }
  }
}

function softDrop() {
  if (!collides(current, 0, 1)) {
    current.y++;
    score += 1;
    updateUI();
  } else {
    lockPiece();
  }
  dropCounter = 0;
}

function hardDrop() {
  let distance = 0;
  while (!collides(current, 0, 1)) {
    current.y++;
    distance++;
  }
  score += distance * 2;
  updateUI();
  sfx.drop();
  boardWrap.classList.remove('shake');
  void boardWrap.offsetWidth; // reinicia la animación
  boardWrap.classList.add('shake');
  lockPiece();
}

function hold() {
  if (!canHold) return;
  const type = current.type;
  if (holdType) {
    current = createPiece(holdType);
  } else {
    spawn();
  }
  holdType = type;
  canHold = false;
  sfx.hold();
  drawSide();
}

// ---------- Ciclo de piezas ----------
function spawn() {
  current = createPiece(queue.shift());
  queue.push(nextFromBag());
  canHold = true;
  if (collides(current)) endGame();
  drawSide();
}

function lockPiece() {
  current.matrix.forEach((row, y) => {
    row.forEach((v, x) => {
      if (v && current.y + y >= 0) board[current.y + y][current.x + x] = current.type;
    });
  });
  // Si la pieza se fijó por encima del tablero, se acabó el juego
  if (current.y < 0 && current.matrix.some((row, y) => row.some(v => v) && current.y + y < 0)) {
    return endGame();
  }
  findLines();
}

function findLines() {
  clearingRows = [];
  for (let y = 0; y < ROWS; y++) {
    if (board[y].every(cell => cell)) clearingRows.push(y);
  }
  if (clearingRows.length) {
    clearAnim = 1; // inicia animación de destello
    clearingRows.forEach(y => board[y].forEach((type, x) => burst(x, y, COLORS[type])));
    sfx.clear(clearingRows.length);
  } else {
    spawn();
  }
}

function removeLines() {
  const n = clearingRows.length;
  clearingRows.forEach(y => {
    board.splice(y, 1);
    board.unshift(Array(COLS).fill(null));
  });
  clearingRows = [];

  lines += n;
  score += LINE_POINTS[n] * level;
  const newLevel = Math.floor(lines / 10) + 1;
  if (newLevel > level) {
    level = newLevel;
    showCombo(`NIVEL ${level}`);
  } else {
    showCombo(LINE_TEXT[n]);
  }
  dropInterval = Math.max(80, 800 - (level - 1) * 70);
  updateUI();
  spawn();
}

// ---------- Partículas ----------
function burst(cx, cy, color) {
  for (let i = 0; i < 6; i++) {
    particles.push({
      x: (cx + 0.5) * BLOCK,
      y: (cy + 0.5) * BLOCK,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 1) * 6,
      life: 1,
      color,
    });
  }
}

function updateParticles(dt) {
  particles.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.3;
    p.life -= dt / 700;
  });
  particles = particles.filter(p => p.life > 0);
}

// ---------- Dibujo ----------
function drawBlock(c, x, y, color, size = BLOCK, alpha = 1) {
  const px = x * size, py = y * size;
  c.globalAlpha = alpha;
  c.shadowColor = color;
  c.shadowBlur = 12;
  const grad = c.createLinearGradient(px, py, px + size, py + size);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.15, color);
  grad.addColorStop(1, shade(color, -40));
  c.fillStyle = grad;
  c.fillRect(px + 1, py + 1, size - 2, size - 2);
  c.shadowBlur = 0;
  // Brillo interior
  c.fillStyle = 'rgba(255,255,255,0.25)';
  c.fillRect(px + 3, py + 3, size - 6, size / 5);
  c.globalAlpha = 1;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amt));
  const b = Math.min(255, Math.max(0, (n & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}

function drawGrid() {
  ctx.strokeStyle = 'rgba(123, 97, 255, 0.12)';
  ctx.lineWidth = 1;
  for (let x = 1; x < COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * BLOCK + 0.5, 0);
    ctx.lineTo(x * BLOCK + 0.5, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let y = 1; y < ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * BLOCK + 0.5);
    ctx.lineTo(COLS * BLOCK, y * BLOCK + 0.5);
    ctx.stroke();
  }
}

function ghostY() {
  let dy = 0;
  while (!collides(current, 0, dy + 1)) dy++;
  return current.y + dy;
}

function draw() {
  ctx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);
  drawGrid();

  // Bloques fijos
  board.forEach((row, y) => row.forEach((type, x) => {
    if (type) drawBlock(ctx, x, y, COLORS[type]);
  }));

  // Destello de líneas completas
  if (clearingRows.length) {
    ctx.fillStyle = `rgba(255,255,255,${clearAnim})`;
    clearingRows.forEach(y => ctx.fillRect(0, y * BLOCK, COLS * BLOCK, BLOCK));
  } else if (current) {
    // Pieza fantasma (muestra dónde caerá)
    const gy = ghostY();
    const color = COLORS[current.type];
    current.matrix.forEach((row, y) => row.forEach((v, x) => {
      if (!v || gy + y < 0) return;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      ctx.strokeRect((current.x + x) * BLOCK + 3, (gy + y) * BLOCK + 3, BLOCK - 6, BLOCK - 6);
      ctx.globalAlpha = 1;
    }));
    // Pieza actual
    current.matrix.forEach((row, y) => row.forEach((v, x) => {
      if (v && current.y + y >= 0) drawBlock(ctx, current.x + x, current.y + y, color);
    }));
  }

  // Partículas
  particles.forEach(p => {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
  });
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

// Dibuja una pieza centrada en una caja (para "Guardada" y "Siguientes")
function drawPreview(c, type, offsetY, boxH, alpha = 1) {
  const size = 24;
  const m = SHAPES[type];
  const rows = m.filter(r => r.some(v => v));
  const cols = m[0].map((_, i) => m.some(r => r[i])).filter(Boolean).length;
  const ox = (c.canvas.width - cols * size) / 2 / size;
  const oy = (offsetY + (boxH - rows.length * size) / 2) / size;
  const firstCol = m[0].findIndex((_, i) => m.some(r => r[i]));
  rows.forEach((row, y) => row.forEach((v, x) => {
    if (v) drawBlock(c, ox + x - firstCol, oy + y, COLORS[type], size, alpha);
  }));
}

function drawSide() {
  holdCtx.clearRect(0, 0, 120, 120);
  if (holdType) drawPreview(holdCtx, holdType, 0, 120, canHold ? 1 : 0.35);

  nextCtx.clearRect(0, 0, 120, 300);
  queue.slice(0, 3).forEach((type, i) => drawPreview(nextCtx, type, i * 100, 100));
}

// ---------- Interfaz ----------
function updateUI() {
  for (const key of ['score', 'level', 'lines']) {
    const value = String({ score, level, lines }[key]);
    if (ui[key].textContent !== value) {
      ui[key].textContent = value;
      ui[key].classList.add('pop');
      setTimeout(() => ui[key].classList.remove('pop'), 150);
    }
  }
  if (score > best) {
    best = score;
    ui.best.textContent = best;
    safeSet('tetris-best', best);
  }
}

function showCombo(text) {
  comboEl.textContent = text;
  comboEl.classList.remove('show');
  void comboEl.offsetWidth;
  comboEl.classList.add('show');
}

function showOverlay(title, text, button) {
  overlayTitle.textContent = title;
  overlayText.innerHTML = text;
  startBtn.textContent = button;
  overlay.classList.remove('hidden');
}

// ---------- Control del juego ----------
function startGame() {
  board = emptyBoard();
  bag = [];
  queue = [nextFromBag(), nextFromBag(), nextFromBag()];
  holdType = null;
  score = 0; lines = 0; level = 1;
  dropInterval = 800; dropCounter = 0;
  particles = []; clearingRows = [];
  running = true; paused = false; gameOver = false;
  overlay.classList.add('hidden');
  updateUI();
  spawn();
  lastTime = performance.now();
}

function togglePause() {
  if (!running || gameOver) return;
  paused = !paused;
  if (paused) {
    showOverlay('PAUSA', 'Presiona <kbd>P</kbd> para continuar', 'CONTINUAR');
  } else {
    overlay.classList.add('hidden');
    lastTime = performance.now();
  }
}

function endGame() {
  gameOver = true;
  running = false;
  sfx.over();
  const record = score >= best && score > 0 ? '<br>🏆 ¡NUEVO RÉCORD!' : '';
  showOverlay('GAME OVER', `Puntos: <strong>${score}</strong> · Líneas: <strong>${lines}</strong>${record}`, 'REINTENTAR');
}

function loop(time = 0) {
  const dt = time - (lastTime || time);
  lastTime = time;

  if (running && !paused) {
    if (clearingRows.length) {
      clearAnim -= dt / 250;
      if (clearAnim <= 0) removeLines();
    } else {
      dropCounter += dt;
      if (dropCounter > dropInterval) {
        dropCounter = 0;
        if (!collides(current, 0, 1)) current.y++;
        else lockPiece();
      }
    }
  }
  updateParticles(dt);
  if (board) draw();
  requestAnimationFrame(loop);
}

// Acciones disponibles (teclado y botones táctiles)
const actions = {
  left: () => move(-1),
  right: () => move(1),
  down: () => softDrop(),
  rotate: () => rotate(1),
  rotateBack: () => rotate(-1),
  drop: () => hardDrop(),
  hold: () => hold(),
};

function act(name) {
  if (!running || paused || gameOver || clearingRows.length) return;
  actions[name]();
}

const KEYMAP = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down',
  ArrowUp: 'rotate', KeyX: 'rotate', KeyZ: 'rotateBack',
  Space: 'drop', KeyC: 'hold', ShiftLeft: 'hold',
};

document.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && (!running || gameOver)) return startGame();
  if (e.code === 'KeyP' || e.code === 'Escape') return togglePause();
  if (e.code === 'KeyM') { soundOn = !soundOn; showCombo(soundOn ? '🔊 ON' : '🔇 OFF'); return; }
  const action = KEYMAP[e.code];
  if (action) {
    e.preventDefault();
    act(action);
  }
});

document.querySelectorAll('.touch button').forEach(btn => {
  btn.addEventListener('click', () => act(btn.dataset.action));
});

startBtn.addEventListener('click', () => {
  if (paused) togglePause();
  else startGame();
});

// Tablero vacío inicial de fondo
board = emptyBoard();
queue = [];
requestAnimationFrame(loop);
