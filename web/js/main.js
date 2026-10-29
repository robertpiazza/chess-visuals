import { Chess } from '../vendor/chess.js';
import { BoardView } from './board.js';
import { createEngine } from './engine/engine.js';
import {
  CLASSES, rateMoves, summarizePieces, destinationsFor, formatScore, winPercent, scoreKey,
} from './analysis.js';

const $ = id => document.getElementById(id);

// ── Settings (remembered per browser) ───────────────────────────────────────
const DEFAULTS = { mode: 'w', strength: 8, depth: 12, showRings: true, showDests: true };
const settings = { ...DEFAULTS, ...loadSettings() };

function loadSettings() {
  try { return JSON.parse(localStorage.getItem('chess-visuals-settings')) || {}; } catch { return {}; }
}
function saveSettings() {
  try { localStorage.setItem('chess-visuals-settings', JSON.stringify(settings)); } catch { /* ignore */ }
}

// ── Game state ──────────────────────────────────────────────────────────────
const params = new URLSearchParams(location.search);
let game = new Chess();
let mode = settings.mode;          // 'w', 'b' or 'both'
let orientation = mode === 'b' ? 'b' : 'w';
let selected = null;
let reselecting = false;           // pointer went down on the already-selected piece
let hoverSq = null;
let pendingPromotion = null;
let plyRatings = [];               // rating of each move played, by ply
let engine = null;
let analysis = null;               // { fen, ratings, summary, depth, done }
const cache = new Map();           // fen → analysis
let searchToken = 0;

const board = new BoardView($('board-wrap'), {
  onSquareDown, onSquareUp,
  onHover: sq => { hoverSq = sq; if (selected) { render(); renderPieceCard(); } },
});

// ── Turn logic ──────────────────────────────────────────────────────────────
function humanToMove() {
  return !game.isGameOver() && (mode === 'both' || game.turn() === mode);
}

function legalFrom(sq) {
  return game.moves({ square: sq, verbose: true });
}

function onSquareDown(sq) {
  if (!humanToMove() || pendingPromotion) return false;
  const piece = game.get(sq);
  if (piece && piece.color === game.turn()) {
    reselecting = selected === sq;
    if (!reselecting) select(sq);
    return true;
  }
  return false;
}

function onSquareUp(sq, { click }) {
  if (!selected) return;
  if (sq !== selected && legalFrom(selected).some(m => m.to === sq)) {
    tryMove(selected, sq);
    return;
  }
  if (!click) return;
  if (sq === selected && reselecting) select(null);
  else if (sq !== selected && !(game.get(sq)?.color === game.turn())) select(null);
  reselecting = false;
}

function select(sq) {
  selected = sq;
  render();
  renderPieceCard();
}

function tryMove(from, to) {
  const options = legalFrom(from).filter(m => m.to === to);
  if (options.length > 1) {
    showPromotion(from, to, options);
    return;
  }
  playMove(options[0].lan);
}

function playMove(uci) {
  const fenBefore = game.fen();
  const rating = cache.get(fenBefore)?.ratings.get(uci) ?? null;
  game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  plyRatings[game.history().length - 1] = rating;
  selected = null;
  hidePromotion();
  onPositionChanged();
}

function onPositionChanged() {
  render();
  renderHistory();
  renderPieceCard();
  $('fen').value = game.fen();
  if (game.isGameOver()) {
    analysis = null;
    showGameOver();
    updateStatus();
    return;
  }
  $('banner').hidden = true;
  analyse();
}

// ── Engine work ─────────────────────────────────────────────────────────────
async function analyse() {
  if (!engine) return;
  const token = ++searchToken;
  const fen = game.fen();
  const human = humanToMove();
  const cached = cache.get(fen);

  if (cached?.done && cached.depth >= (human ? settings.depth : opponentDepth())) {
    analysis = cached;
    afterAnalysis(token, human);
    return;
  }

  const moveCount = game.moves().length;
  analysis = cached ?? { fen, ratings: new Map(), summary: new Map(), depth: 0, done: false };
  updateStatus();
  render();

  const depth = human ? settings.depth : opponentDepth();
  const result = await engine.analyse(fen, { depth, moveCount }, (lines, d) => {
    if (token !== searchToken || lines.length < moveCount) return;
    setAnalysis(fen, lines, d, false);
    if (human) { render(); renderPieceCard(); }
    updateStatus();
  });
  if (token !== searchToken || result.cancelled) return;
  if (result.lines.length >= moveCount) setAnalysis(fen, result.lines, result.depth, true);
  afterAnalysis(token, human);
}

function setAnalysis(fen, lines, depth, done) {
  const ratings = rateMoves(lines);
  analysis = { fen, ratings, summary: summarizePieces(ratings), depth, done };
  cache.set(fen, analysis);
}

function afterAnalysis(token, human) {
  updateStatus();
  updateEvalBar();
  if (human) {
    render();
    renderPieceCard();
  } else {
    const uci = chooseComputerMove();
    setTimeout(() => {
      if (token === searchToken && !humanToMove()) playMove(uci);
    }, 350);
  }
}

// The computer analyses less deeply when set weaker.
function opponentDepth() {
  return Math.max(4, Math.min(settings.depth, 6 + Math.round(settings.strength / 2)));
}

// Picks a move from the rated list. At full strength always the best; lower
// strength allows moves that lose more, weighted toward the better ones.
function chooseComputerMove() {
  const moves = [...analysis.ratings.values()];
  if (!moves.length) {
    const legal = game.moves({ verbose: true });
    return legal[Math.floor(Math.random() * legal.length)].lan;
  }
  const s = settings.strength;
  if (s >= 20 || moves.length === 1) return moves.find(m => m.rank === 0).uci;
  const allowed = (20 - s) * 1.6;
  const temp = 1 + (20 - s) * 0.5;
  const pool = moves.filter(m => m.loss <= allowed);
  const weights = pool.map(m => Math.exp(-m.loss / temp));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i].uci;
  }
  return pool[0].uci;
}

// ── Rendering ───────────────────────────────────────────────────────────────
function lastMove() {
  const h = game.history({ verbose: true });
  return h.length ? h[h.length - 1] : null;
}

function checkSquare() {
  if (!game.inCheck()) return null;
  for (const row of game.board()) for (const p of row) {
    if (p && p.type === 'k' && p.color === game.turn()) return p.square;
  }
  return null;
}

function render() {
  const human = humanToMove();
  const ready = analysis && analysis.fen === game.fen() && analysis.ratings.size > 0;
  let pieceRings = null, destinations = null, plainTargets = null;

  if (human && ready && settings.showRings) {
    pieceRings = new Map();
    for (const row of game.board()) for (const p of row) {
      if (p && p.color === game.turn()) pieceRings.set(p.square, analysis.summary.get(p.square) ?? null);
    }
  }
  if (selected) {
    const summary = ready ? analysis.summary.get(selected) : null;
    if (summary && settings.showDests) destinations = destinationsFor(summary);
    else plainTargets = [...new Set(legalFrom(selected).map(m => m.to))];
  }

  board.render({
    pieces: game.board(),
    orientation,
    lastMove: lastMove(),
    checkSq: checkSquare(),
    selected,
    pieceRings,
    destinations,
    plainTargets,
    highlight: hoverSq,
  });
}

function sanMap() {
  const map = new Map();
  for (const m of game.moves({ verbose: true })) map.set(m.lan, m.san);
  return map;
}

function renderPieceCard() {
  const card = $('piece-card');
  const summary = selected && analysis?.fen === game.fen() ? analysis.summary.get(selected) : null;
  if (!summary || !settings.showDests) { card.hidden = true; return; }
  card.hidden = false;
  const piece = game.get(selected);
  const names = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };
  $('piece-title').textContent = `${names[piece.type]} on ${selected}`;
  const sans = sanMap();
  const list = $('piece-moves');
  list.replaceChildren(...summary.moves.map(m => {
    const li = document.createElement('li');
    if (m.to === hoverSq) li.classList.add('is-hover');
    const cls = CLASSES.find(c => c.id === m.cls);
    li.innerHTML = `<span class="dot cls-${m.cls}"></span><span><span class="san">${sans.get(m.uci) ?? m.uci}</span>${m.cls === 'best' ? ' <span class="star">★</span>' : ''} <span class="muted">${cls.label}</span></span><span class="score">${formatScore(m.score)}</span><span class="win">${Math.round(m.win)}%</span>`;
    li.title = `${cls.label}: winning chance ${Math.round(m.win)}% (${m.loss.toFixed(1)} points below the best move)`;
    li.addEventListener('mouseenter', () => { hoverSq = m.to; render(); });
    li.addEventListener('mouseleave', () => { hoverSq = null; render(); });
    li.addEventListener('click', () => { if (humanToMove()) playMove(m.uci); });
    return li;
  }));
}

function renderHistory() {
  const hist = game.history();
  const list = $('history');
  const items = [];
  for (let i = 0; i < hist.length; i += 2) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="num">${i / 2 + 1}.</span>` + plyHtml(hist[i], plyRatings[i]) + (hist[i + 1] ? plyHtml(hist[i + 1], plyRatings[i + 1]) : '<span></span>');
    items.push(li);
  }
  list.replaceChildren(...items);
  list.scrollTop = list.scrollHeight;
}

function plyHtml(san, rating) {
  if (!rating) return `<span class="ply"><span class="dot cls-none"></span>${san}</span>`;
  const cls = CLASSES.find(c => c.id === rating.cls);
  return `<span class="ply" title="${cls.label} (${formatScore(rating.score)})"><span class="dot cls-${rating.cls}"></span>${san}<span class="sym cls-${rating.cls}">${cls.symbol}</span></span>`;
}

function updateStatus() {
  const el = $('status');
  if (!engine) { el.textContent = 'Loading engine…'; return; }
  if (game.isGameOver()) { el.textContent = gameOverText(); return; }
  const depth = analysis?.fen === game.fen() ? analysis.depth : 0;
  if (humanToMove()) {
    const who = mode === 'both' ? (game.turn() === 'w' ? 'White' : 'Black') + ' to move' : 'Your move';
    el.textContent = analysis?.done && analysis.fen === game.fen()
      ? `${who} · rated at depth ${depth}`
      : `${who} · rating moves${depth ? ` (depth ${depth})` : ''}…`;
  } else {
    el.textContent = 'Computer is thinking…';
  }
}

function updateEvalBar() {
  if (!analysis?.ratings.size) return;
  const best = [...analysis.ratings.values()].find(m => m.rank === 0);
  const sign = game.turn() === 'w' ? 1 : -1;
  const white = best.score.mate != null ? { mate: sign * best.score.mate } : { cp: sign * best.score.cp };
  const pct = winPercent(white);
  $('evalbar-fill').style.height = `${pct}%`;
  $('evalbar-label').textContent = formatScore(white).replace('+', '');
  $('evalbar').classList.toggle('black-ahead', scoreKey(white) < 0);
  $('evalbar').classList.toggle('flipped', orientation === 'b');
}

function gameOverText() {
  if (game.isCheckmate()) {
    const winner = game.turn() === 'w' ? 'Black' : 'White';
    if (mode === 'both') return `Checkmate · ${winner} wins`;
    return winner[0].toLowerCase() === mode ? 'Checkmate · you win' : 'Checkmate · computer wins';
  }
  if (game.isStalemate()) return 'Draw by stalemate';
  if (game.isThreefoldRepetition()) return 'Draw by repetition';
  if (game.isInsufficientMaterial()) return 'Draw · insufficient material';
  return 'Draw';
}

function showGameOver() {
  const banner = $('banner');
  banner.innerHTML = `<div>${gameOverText()}</div><button class="primary">New game</button>`;
  banner.querySelector('button').onclick = newGame;
  banner.hidden = false;
}

function showPromotion(from, to, options) {
  const ratings = analysis?.fen === game.fen() ? analysis.ratings : new Map();
  const color = game.turn();
  const box = $('promo');
  box.replaceChildren(...['q', 'r', 'b', 'n'].map(p => {
    const move = options.find(o => o.promotion === p);
    const r = ratings.get(move.lan);
    const btn = document.createElement('button');
    if (r) btn.style.borderColor = `var(--cls-${r.cls})`;
    btn.innerHTML = `<img src="pieces/${color}${p.toUpperCase()}.svg" alt="${p}"><span>${r ? formatScore(r.score) : ''}</span>`;
    btn.onclick = () => playMove(move.lan);
    return btn;
  }));
  pendingPromotion = { from, to };
  box.hidden = false;
}

function hidePromotion() {
  pendingPromotion = null;
  $('promo').hidden = true;
}

// ── Controls ────────────────────────────────────────────────────────────────
function newGame(fen) {
  searchToken++;
  try {
    game = new Chess(typeof fen === 'string' ? fen : undefined);
  } catch (err) {
    $('status').textContent = `Invalid FEN: ${err.message}`;
    return;
  }
  mode = $('mode').value;
  settings.mode = mode;
  saveSettings();
  orientation = mode === 'b' ? 'b' : 'w';
  plyRatings = [];
  selected = null;
  hidePromotion();
  onPositionChanged();
}

function undo() {
  if (!game.history().length) return;
  searchToken++;
  game.undo();
  // Against the computer, step back to the human's turn.
  if (mode !== 'both' && game.turn() !== mode && game.history().length) game.undo();
  plyRatings.length = game.history().length;
  selected = null;
  hidePromotion();
  onPositionChanged();
}

function initControls() {
  $('mode').value = settings.mode;
  for (const [id, key] of [['strength', 'strength'], ['depth', 'depth']]) {
    const input = $(id);
    input.value = settings[key];
    $(`${id}-out`).textContent = settings[key];
    input.addEventListener('input', () => {
      settings[key] = +input.value;
      $(`${id}-out`).textContent = input.value;
      saveSettings();
    });
    if (id === 'depth') input.addEventListener('change', () => { if (humanToMove()) analyse(); });
  }
  for (const [id, key] of [['show-rings', 'showRings'], ['show-dests', 'showDests']]) {
    const input = $(id);
    input.checked = settings[key];
    input.addEventListener('change', () => {
      settings[key] = input.checked;
      saveSettings();
      render();
      renderPieceCard();
    });
  }
  $('new-game').onclick = () => newGame();
  $('undo').onclick = undo;
  $('flip').onclick = () => { orientation = orientation === 'w' ? 'b' : 'w'; render(); updateEvalBar(); };
  $('load-fen').onclick = () => newGame($('fen').value.trim());
  $('mode').addEventListener('change', () => newGame(game.history().length ? undefined : game.fen()));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { hidePromotion(); select(null); }
  });

  $('legend').replaceChildren(...CLASSES.map(c => {
    const span = document.createElement('span');
    span.innerHTML = `<i class="swatch cls-${c.id}"></i>${c.label}`;
    return span;
  }));
}

async function start() {
  initControls();
  onPositionChanged();
  engine = await createEngine(params.get('engine') === 'builtin' ? 'builtin' : 'stockfish');
  $('engine-name').textContent = `Engine: ${engine.name}`;
  if (engine.name.startsWith('Stockfish')) {
    $('depth').max = 20;
  } else {
    // The built-in search tops out at depth 6.
    $('depth').min = 2;
    $('depth').max = 6;
    if (settings.depth > 6) { settings.depth = 5; $('depth').value = 5; $('depth-out').textContent = 5; }
  }
  updateStatus();
  analyse();
}

start();
