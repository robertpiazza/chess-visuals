import { Chess, DEFAULT_POSITION as DEFAULT_FEN } from '../vendor/chess.js';
import { BoardView } from './board.js';
import { createEngine } from './engine/engine.js';
import {
  CLASSES, rateMoves, summarizePieces, destinationsFor, formatScore, formatWhite, winPercent, scoreKey,
} from './analysis.js';
import { explainMove, forcedTactic, TACTIC_ICONS } from './explain.js';
import { badgeHtml } from './icons.js';
import { motifsOfMove, parseFen, sqName } from './tactics.js';
import { OPENINGS, identifyOpening, bookContinuations } from './openings.js';
import { MoveTree } from './tree.js';
import { resolveAlternatives, isSingleMove } from './voice.js';

const $ = id => document.getElementById(id);

// ── Settings (remembered per browser) ───────────────────────────────────────
const DEFAULTS = { mode: 'w', strength: 8, depth: 12, showRings: true, showDests: true, showExplain: true, showBook: true, mistakePreventer: false };
const settings = { ...DEFAULTS, ...loadSettings() };

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('chess-visuals-settings')) || {};
    // Keep the enabled state from the original blunder-only setting.
    if (saved.mistakePreventer == null) saved.mistakePreventer = saved.blunderPreventer ?? false;
    delete saved.blunderPreventer;
    return saved;
  } catch { return {}; }
}
function saveSettings() {
  try { localStorage.setItem('chess-visuals-settings', JSON.stringify(settings)); } catch { /* ignore */ }
}

// ── Game state ──────────────────────────────────────────────────────────────
const params = new URLSearchParams(location.search);
let game = new Chess();
let tree = new MoveTree(game.fen()); // every move played, with variations
let mode = settings.mode;          // 'w', 'b' or 'both'
let orientation = mode === 'b' ? 'b' : 'w';
let selected = null;
let reselecting = false;           // pointer went down on the already-selected piece
let hoverSq = null;
let pendingPromotion = null;
let engine = null;
let analysis = null;               // { fen, ratings, summary, depth, done }
const cache = new Map();           // fen → analysis
let searchToken = 0;
let focusUci = null;               // move picked in the selected piece's list
let practice = null;               // opening being practiced, or null
let customStart = false;           // game began from a loaded FEN (no book)
const iconCache = new WeakMap();   // analysis → Map uci → forced-tactic icon
const explainCache = new Map();    // fen|uci|depth → explanation

const board = new BoardView($('board-wrap'), {
  onSquareDown, onSquareUp,
  onHover: sq => { hoverSq = sq; if (selected) { render(); renderPieceCard(); } },
});

// ── Turn logic ──────────────────────────────────────────────────────────────
// The board is yours to move on when it's your turn, and also whenever you're
// looking back at an earlier position or stepping through an engine line:
// the computer only replies at the end of a line you're playing.
function humanToMove() {
  if (game.isGameOver()) return false;
  return mode === 'both' || game.turn() === mode || !!tree.main(tree.cursor) || tree.cursor.engine;
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
    // A dragged piece is already on its square: no glide.
    tryMove(selected, sq, { animate: click });
    return;
  }
  if (!click) return;
  if (sq === selected && reselecting) select(null);
  else if (sq !== selected && !(game.get(sq)?.color === game.turn())) select(null);
  reselecting = false;
}

function select(sq) {
  selected = sq;
  focusUci = null;
  render();
  renderPieceCard();
}

function tryMove(from, to, opts) {
  const options = legalFrom(from).filter(m => m.to === to);
  if (options.length > 1) {
    showPromotion(from, to, options);
    return;
  }
  playMove(options[0].lan, opts);
}

// Play a move from the current position. A move already in the tree is
// followed; a new one extends the line, or starts a variation if this
// position already has a continuation.
function playMove(uci, { animate = true } = {}) {
  const move = new Chess(game.fen()).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  goTo(tree.add(tree.cursor, move), { animate });
}

// ── Typed and spoken moves ─────────────────────────────────────────────────
// `texts` are the recognizer's alternatives, best first (one for typed text).
// Returns true if a move was played or the promotion picker opened.
function playPhrase(texts) {
  const fb = $('voice-feedback');
  if (!humanToMove()) {
    fb.textContent = game.isGameOver() ? 'The game is over.' : "Wait for the computer's move.";
    return false;
  }
  const { text, moves } = resolveAlternatives(texts, game.moves({ verbose: true }), { orientation });
  if (!moves.length) {
    fb.textContent = `No legal move in "${texts[0]}".`;
    return false;
  }
  if (isSingleMove(moves)) {
    const m = moves[0];
    fb.textContent = `"${text}" → ${moves.length > 1 ? `${m.to}, promote to…` : m.san}`;
    if (moves.length > 1) showPromotion(m.from, m.to, moves);
    else playMove(m.lan);
    return true;
  }
  // Ambiguous: offer each reading. The buttons only work in this position.
  const fen = game.fen();
  fb.replaceChildren(`"${text}": which one? `, ...moves.map(m => {
    const btn = document.createElement('button');
    btn.textContent = m.san;
    btn.onclick = () => {
      if (game.fen() !== fen) { fb.textContent = ''; return; }
      fb.textContent = m.san;
      playMove(m.lan);
    };
    return btn;
  }));
  return false;
}

function initVoice() {
  const input = $('say');
  input.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !input.value.trim()) return;
    if (playPhrase([input.value.trim()])) input.value = '';
  });
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return; // Firefox and older browsers: typing only
  const mic = $('mic');
  const fb = $('voice-feedback');
  mic.hidden = false;
  $('voice-hint').hidden = false;
  let rec = null;
  const setListening = on => { mic.classList.toggle('listening', on); mic.setAttribute('aria-pressed', on); };
  mic.onclick = () => {
    if (rec) { rec.stop(); return; }
    rec = new Recognition();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    rec.continuous = false;
    rec.onresult = e => {
      const res = e.results[e.results.length - 1];
      if (!res.isFinal) { fb.textContent = `Hearing "${res[0].transcript.trim()}"…`; return; }
      playPhrase(Array.from(res, alt => alt.transcript.trim()).filter(Boolean));
    };
    rec.onerror = e => {
      fb.textContent = e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Microphone access is blocked for this page.'
        : e.error === 'no-speech' ? "Didn't hear anything. Tap the mic and try again."
        : e.error === 'network' ? 'Speech recognition needs a network connection.'
        : e.error === 'aborted' ? '' : `Speech recognition error: ${e.error}`;
    };
    rec.onend = () => {
      rec = null;
      setListening(false);
      if (fb.textContent === 'Listening…') fb.textContent = '';
    };
    try {
      rec.start();
      setListening(true);
      fb.textContent = 'Listening…';
    } catch (err) {
      rec = null;
      fb.textContent = `Couldn't start speech recognition: ${err.message}`;
    }
  };
}

// Rebuild the game from the root along the cursor's path.
function rebuildGame() {
  game = new Chess(tree.root.fen);
  for (const n of tree.path()) game.move(n.move.lan);
}

// Move to any node. One step forward or back animates; jumps don't.
function goTo(node, { animate = true } = {}) {
  if (!node) return;
  const from = tree.cursor;
  if (animate && node.parent === from) {
    const { moves, captured } = moveAnimation(node.move);
    board.animateMove({ moves, fadeOut: captured });
  } else if (animate && from.parent === node) {
    const { moves, captured } = moveAnimation(from.move);
    board.animateMove({ moves: moves.map(m => ({ from: m.to, to: m.from })), fadeIn: captured?.square });
  }
  searchToken++;
  tree.goTo(node);
  rebuildGame();
  selected = null;
  focusUci = null;
  hidePromotion();
  onPositionChanged();
}

const back = () => goTo(tree.cursor.parent);
const forward = () => goTo(tree.next());

// Insert an engine line (UCI moves) as a variation from `from` and step
// into its first move, so → walks through the follow-up.
function showLine(from, pv) {
  const chess = new Chess(from.fen);
  let parent = from;
  let first = null;
  for (const uci of pv.slice(0, 10)) {
    let move;
    try {
      move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      break;
    }
    const node = tree.add(parent, move, { engine: true });
    parent.lastChild = node;
    first ??= node;
    parent = node;
  }
  if (!first) return;
  if (from !== tree.cursor) goTo(from, { animate: false });
  goTo(first);
}

// The rating a move had when played, from the analysis of the position
// before it.
function nodeRating(node) {
  return node.move ? cache.get(node.move.before)?.ratings.get(node.move.lan) ?? null : null;
}

// What moves on the board for a chess.js move: the piece itself, the rook
// when castling, and the captured piece (beside the pawn for en passant).
function moveAnimation(move) {
  const moves = [{ from: move.from, to: move.to }];
  if (move.flags.includes('k') || move.flags.includes('q')) {
    const rank = move.to[1];
    const kingside = move.flags.includes('k');
    moves.push({ from: (kingside ? 'h' : 'a') + rank, to: (kingside ? 'f' : 'd') + rank });
  }
  let captured = null;
  if (move.captured) {
    const square = move.flags.includes('e') ? move.to[0] + move.from[1] : move.to;
    captured = { square, piece: (move.color === 'w' ? 'b' : 'w') + move.captured.toUpperCase() };
  }
  return { moves, captured };
}

// Show each caret only when it can be used: back once a move has been
// played, forward only when there's a move ahead (after stepping back).
function renderNav() {
  $('back').hidden = !tree.cursor.parent;
  $('forward').hidden = !tree.next();
}

function onPositionChanged() {
  render();
  renderNav();
  renderHistory();
  renderPieceCard();
  renderOpening();
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
    const uci = chooseBookMove() ?? chooseComputerMove();
    setTimeout(() => {
      if (token === searchToken && !humanToMove()) playMove(uci);
    }, 350);
  }
}

// The computer analyses less deeply when set weaker.
function opponentDepth() {
  return Math.max(4, Math.min(settings.depth, 6 + Math.round(settings.strength / 2)));
}

// While in the opening library, the computer plays a book move: the practice
// line's move if one is set, otherwise a random book continuation that the
// engine doesn't consider a mistake.
function chooseBookMove() {
  if (customStart) return null;
  const history = game.history();
  const legal = game.moves({ verbose: true });
  const lan = san => legal.find(m => m.san === san)?.lan;
  if (practice && followsPractice() && history.length < practice.sans.length) {
    return lan(practice.sans[history.length]) ?? null;
  }
  const ok = bookContinuations(history)
    .map(c => lan(c.san))
    .filter(u => u && !['mistake', 'blunder'].includes(analysis?.ratings.get(u)?.cls));
  return ok.length ? ok[Math.floor(Math.random() * ok.length)] : null;
}

function followsPractice() {
  const h = game.history();
  return !!practice && h.every((san, i) => i >= practice.sans.length || practice.sans[i] === san);
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

// Filter display data only: engine ratings and opponent strength stay unchanged.
function visibleSummary(square) {
  const summary = analysisReady() ? analysis.summary.get(square) : null;
  if (!summary || !settings.mistakePreventer) return summary;
  const moves = summary.moves.filter(visibleRating);
  return moves.length ? { ...summary, moves, best: moves[0] } : null;
}

function visibleRating(rating) {
  return rating && (!settings.mistakePreventer || ['mistake', 'blunder'].includes(rating.cls));
}

function analysisReady() {
  return !!analysis && analysis.fen === game.fen() && analysis.ratings.size > 0;
}

// Forced-tactic icon for each sound move in the current analysis.
function tacticIcons() {
  if (!analysisReady() || !settings.showExplain) return null;
  let icons = iconCache.get(analysis);
  if (!icons) {
    icons = new Map();
    for (const r of analysis.ratings.values()) {
      const f = forcedTactic(analysis.fen, r);
      if (f) icons.set(r.uci, f);
    }
    iconCache.set(analysis, icons);
  }
  return settings.mistakePreventer
    ? new Map([...icons].filter(([uci]) => visibleRating(analysis.ratings.get(uci))))
    : icons;
}

function explain(fen, uci, history) {
  const a = cache.get(fen);
  const key = `${fen}|${uci}|${a?.depth ?? 0}`;
  if (!explainCache.has(key)) explainCache.set(key, explainMove(fen, uci, a?.ratings ?? new Map(), history));
  return explainCache.get(key);
}

// The move the explanation card and arrows describe while a piece is
// selected: the hovered target, else the row picked in the list, else the
// piece's best visible move (a mistake or blunder when the preventer is enabled).
function focusRating() {
  if (!selected || !analysisReady()) return null;
  const summary = visibleSummary(selected);
  if (!summary) return null;
  const hovered = summary.moves.find(m => m.to === hoverSq);
  return hovered ?? summary.moves.find(m => m.uci === focusUci) ?? summary.best;
}

const named = arrows => arrows.map(a => ({ ...a, from: sqName(a.from), to: sqName(a.to) }));

function bookArrows() {
  if (customStart || !settings.showBook || settings.mistakePreventer) return [];
  const legal = game.moves({ verbose: true });
  const history = game.history();
  let sans = bookContinuations(history).map(c => c.san);
  if (practice && followsPractice() && history.length < practice.sans.length) sans = [practice.sans[history.length]];
  return sans.slice(0, 5).map(san => legal.find(m => m.san === san)).filter(Boolean)
    .map(m => ({ from: m.from, to: m.to, tone: 'book' }));
}

function render() {
  const human = humanToMove();
  const ready = analysisReady();
  const icons = human ? tacticIcons() : null;
  let pieceRings = null, pieceIcons = null, destinations = null, destIcons = null, plainTargets = null;
  let arrows = [];

  if (human && ready && settings.showRings) {
    // With a piece selected, only its ring stays, to cut clutter.
    const show = sq => !selected || sq === selected;
    pieceRings = new Map();
    for (const row of game.board()) for (const p of row) {
      if (p && p.color === game.turn() && show(p.square)) {
        const summary = visibleSummary(p.square);
        if (summary || !settings.mistakePreventer) pieceRings.set(p.square, summary);
      }
    }
    if (icons) {
      pieceIcons = new Map();
      for (const [uci, icon] of icons) {
        const from = uci.slice(0, 2);
        // A piece shows its working tactic over one that doesn't pay off.
        if (show(from) && (!pieceIcons.has(from) || (icon.sound && !pieceIcons.get(from).sound))) pieceIcons.set(from, icon);
      }
    }
  }
  if (selected) {
    const summary = ready ? visibleSummary(selected) : null;
    if (summary && settings.showDests) {
      destinations = destinationsFor(summary);
      if (icons) {
        destIcons = new Map();
        for (const [sq, m] of destinations) {
          const found = m.options.map(o => icons.get(o.uci)).filter(Boolean);
          const icon = found.find(i => i.sound) ?? found[0];
          if (icon) destIcons.set(sq, icon);
        }
      }
    } else {
      plainTargets = [...new Set(legalFrom(selected).map(m => m.to))];
    }
    const focus = focusRating();
    if (focus && settings.showExplain) {
      const ex = explain(game.fen(), focus.uci, game.history({ verbose: true }));
      arrows = [{ from: focus.from, to: focus.to, tone: 'move' }, ...named(ex.arrows)];
    }
  } else if (human) {
    arrows = bookArrows();
    // What the opponent's last move is up to.
    const last = lastMove();
    if (settings.showExplain && !settings.mistakePreventer && last && mode !== 'both') {
      const theirs = motifsOfMove(parseFen(last.before).board, last.lan).filter(m => m.tone === 'good');
      arrows.push(...named(theirs.flatMap(m => m.arrows.map(a => ({ from: a[0], to: a[1], tone: 'bad' })))));
    }
  }

  board.render({
    mover: game.turn(),
    // Fastest mate in the position, so slower mates show a part-filled ring.
    fastestMate: ready ? Math.min(Infinity, ...[...analysis.ratings.values()].filter(r => r.score.mate > 0).map(r => r.score.mate)) : null,
    pieces: game.board(),
    orientation,
    lastMove: lastMove(),
    checkSq: checkSquare(),
    selected,
    pieceRings,
    pieceIcons,
    destinations,
    destIcons,
    plainTargets,
    highlight: hoverSq,
    arrows,
  });
}

function sanMap() {
  const map = new Map();
  for (const m of game.moves({ verbose: true })) map.set(m.lan, m.san);
  return map;
}

function renderPieceCard() {
  renderExplain();
  const card = $('piece-card');
  const summary = selected ? visibleSummary(selected) : null;
  if (!summary || !settings.showDests) { card.hidden = true; return; }
  card.hidden = false;
  const piece = game.get(selected);
  const names = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };
  $('piece-title').textContent = `${names[piece.type]} on ${selected}`;
  const sans = sanMap();
  const icons = tacticIcons();
  const focus = focusRating();
  const list = $('piece-moves');
  list.replaceChildren(...summary.moves.map(m => {
    const li = document.createElement('li');
    if (m.to === hoverSq) li.classList.add('is-hover');
    if (m === focus && settings.showExplain) li.classList.add('is-focus');
    const cls = CLASSES.find(c => c.id === m.cls);
    const icon = icons?.get(m.uci);
    li.innerHTML = `<span class="dot cls-${m.cls}"></span><span><span class="san">${sans.get(m.uci) ?? m.uci}</span>${m.cls === 'best' ? ' <span class="star">★</span>' : ''}${icon ? ` ${badgeHtml(icon)}` : ''} <span class="muted">${cls.label}</span></span><span class="score">${formatWhite(m.score, game.turn())}</span><span class="win">${Math.round(m.win)}%</span>`;
    li.title = `${cls.label}: winning chance ${Math.round(m.win)}% (${m.loss.toFixed(1)} points below the best move). Click to explain, double-click to play.`;
    li.addEventListener('mouseenter', () => { hoverSq = m.to; render(); renderExplain(); });
    li.addEventListener('mouseleave', () => { hoverSq = null; render(); renderExplain(); });
    li.addEventListener('click', () => { focusUci = m.uci; render(); renderPieceCard(); });
    li.addEventListener('dblclick', () => { if (humanToMove()) playMove(m.uci); });
    return li;
  }));
}

// ── Explanations ────────────────────────────────────────────────────────────
function reasonItems(ex) {
  const items = [];
  const push = (tone, text, icon) => items.push({ tone, text, icon });
  // Notes come first: a tactic forced later in the line, or the opponent's reply.
  for (const n of ex.notes) {
    const forcedNote = n.tone === 'good' && ex.forced?.sound && n === ex.notes[0] && (ex.forced.when === 'next' || ex.forced.id === 'sacrifice');
    push(n.tone, n.text, forcedNote ? ex.forced : null);
  }
  for (const t of ex.tactics) {
    const icon = TACTIC_ICONS[t.id] && (ex.forced?.id === t.id ? ex.forced : TACTIC_ICONS[t.id]);
    push(t.tone, t.text, icon ?? null);
  }
  for (const p of ex.principles) push(p.tone, p.text, null);
  return items;
}

function reasonsHtml(ex) {
  const items = reasonItems(ex);
  if (!items.length) return '<ul class="reasons"><li class="empty-row"><span class="empty">No tactics or principle changes stand out; the rating comes from the engine\'s deeper calculation.</span></li></ul>';
  const mark = { good: '+', bad: '−', neutral: '·' };
  return '<ul class="reasons">' + items.map(i =>
    `<li class="tone-${i.tone}${i.icon ? ' tactic' : ''}"><span class="mark">${i.icon ? badgeHtml(i.icon) : mark[i.tone]}</span><span>${i.text}</span></li>`,
  ).join('') + '</ul>';
}

function moveHeadHtml(ex, context) {
  const cls = ex.rating ? CLASSES.find(c => c.id === ex.rating.cls) : null;
  return `<div class="explain-head"><span class="san">${ex.san}</span>` +
    (cls ? `<span class="cls" style="color: var(--cls-${cls.id})">${cls.label} · ${formatWhite(ex.rating.score, ex.mover)}</span>` : '') +
    (context ? `<span class="context">${context}</span>` : '') + '</div>';
}

function renderExplain() {
  const card = $('explain-card');
  const body = $('explain-body');
  if (!settings.showExplain || (settings.mistakePreventer && !focusRating())) { card.hidden = true; return; }

  const focus = focusRating();
  if (focus) {
    const ex = explain(game.fen(), focus.uci, game.history({ verbose: true }));
    $('explain-title').textContent = 'Why this move';
    body.innerHTML = moveHeadHtml(ex) + reasonsHtml(ex) +
      (ex.comparison ? `<p class="comparison">${ex.comparison.text}</p>` : '') +
      (humanToMove() ? `<div class="explain-actions"><button class="primary" id="explain-play">Play ${ex.san}</button>` +
        (focus.pv.length > 1 ? '<button id="explain-line">See the line</button>' : '') +
        (ex.comparison ? `<button id="explain-best">Show ${ex.comparison.san}</button><button id="explain-best-line">See ${ex.comparison.san} line</button>` : '') +
        '</div>' : '');
    $('explain-play')?.addEventListener('click', () => playMove(focus.uci));
    $('explain-line')?.addEventListener('click', () => showLine(tree.cursor, focus.pv));
    $('explain-best-line')?.addEventListener('click', () => showLine(tree.cursor, analysis.ratings.get(ex.comparison.uci).pv));
    $('explain-best')?.addEventListener('click', () => {
      const uci = ex.comparison.uci;
      selected = uci.slice(0, 2);
      focusUci = uci;
      hoverSq = null;
      render();
      renderPieceCard();
    });
    card.hidden = false;
    return;
  }

  // Nothing selected: review the last move by each side.
  const hist = game.history({ verbose: true });
  const plies = hist.slice(-2);
  if (!plies.length) { card.hidden = true; return; }
  const path = tree.path();
  const lineButtons = [];
  $('explain-title').textContent = 'Last moves';
  body.innerHTML = plies.map((mv, k) => {
    const idx = hist.length - plies.length + k;
    const ex = explain(mv.before, mv.lan, hist.slice(0, idx));
    const yours = mode === 'both' || mv.color === mode;
    const who = path[idx].engine ? `Engine line (${mv.color === 'w' ? 'White' : 'Black'})`
      : mode === 'both' ? (mv.color === 'w' ? 'White' : 'Black') : yours ? 'Your move' : 'Computer\'s move';
    const shown = { ...ex, rating: ex.rating ?? null };
    if (!yours) {
      // For the opponent's move, keep what it threatens and skip the comparison.
      shown.notes = [];
      shown.comparison = null;
    }
    // A move that wasn't best: offer the engine's line from before it.
    let button = '';
    const best = shown.comparison && shown.rating?.cls !== 'best' ? cache.get(mv.before)?.ratings.get(shown.comparison.uci) : null;
    if (best) {
      lineButtons.push({ from: path[idx].parent, pv: best.pv });
      button = `<div class="explain-actions"><button data-line="${lineButtons.length - 1}">See why ${shown.comparison.san} was better</button></div>`;
    }
    return `<div class="review">${moveHeadHtml(shown, who)}${reasonsHtml(shown)}${shown.comparison ? `<p class="comparison">${shown.comparison.text}</p>` : ''}${button}</div>`;
  }).reverse().join(''); // most recent move first
  for (const b of body.querySelectorAll('[data-line]')) {
    const { from, pv } = lineButtons[+b.dataset.line];
    b.addEventListener('click', () => showLine(from, pv));
  }
  card.hidden = false;
}

// ── Openings ────────────────────────────────────────────────────────────────
function renderOpening() {
  const body = $('opening-body');
  if (customStart) {
    body.innerHTML = '<p class="opening-idea">Started from a loaded position, so the opening library is off.</p>';
    return;
  }
  const history = game.history();
  const opening = identifyOpening(history);
  const next = bookContinuations(history);
  let html = '';
  if (opening) {
    html += `<div><span class="opening-name">${opening.name}</span><span class="opening-eco">${opening.eco}</span></div><p class="opening-idea">${opening.idea}</p>`;
  } else if (!history.length) {
    html += '<p class="opening-idea">Starting position. Book moves are listed below; pick one to see where it leads.</p>';
  }
  if (practice) {
    const h = history.length;
    if (!followsPractice()) {
      const at = history.findIndex((san, i) => i < practice.sans.length && practice.sans[i] !== san);
      html += `<p class="practice-note">You left the ${practice.name} line at move ${Math.floor(at / 2) + 1}: the book move was <b>${practice.sans[at]}</b>. Step back (←) to try again.</p>`;
    } else if (h >= practice.sans.length) {
      html += `<p class="practice-note">${practice.name} line complete. Keep playing from here.</p>`;
    } else {
      const yourTurn = mode === 'both' || game.turn() === mode;
      html += `<p class="practice-note">Practicing ${practice.name}: ${yourTurn ? 'your book move is' : 'the computer will play'} <b>${practice.sans[h]}</b>.</p>`;
    }
  }
  if (next.length) {
    html += '<ul class="book-moves">' + next.map(c => {
      const isPractice = practice && followsPractice() && practice.sans[history.length] === c.san;
      const names = c.lines.slice(0, 3).map(l => l.name).join(', ') + (c.lines.length > 3 ? ', …' : '');
      return `<li data-san="${c.san}" class="${isPractice ? 'is-practice' : ''}"><span class="san">${c.san}</span><span class="names">${names}</span></li>`;
    }).join('') + '</ul>';
  } else if (history.length) {
    html += `<p class="opening-idea">${opening ? 'No more book moves in the library from here.' : 'Out of the opening library.'}</p>`;
  }
  body.innerHTML = html;
  for (const li of body.querySelectorAll('.book-moves li')) {
    li.addEventListener('click', () => {
      if (!humanToMove()) return;
      const move = game.moves({ verbose: true }).find(m => m.san === li.dataset.san);
      if (move) playMove(move.lan);
    });
  }
}

// The move tree as a book-style move list: the main line, with variations
// in parentheses beneath the move they branch from. Click a move to go there.
function renderHistory() {
  const list = $('history');
  const html = lineHtml(tree.root, true);
  list.innerHTML = html || '<span class="muted">No moves yet.</span>';
  const current = list.querySelector('.ply.is-current');
  if (current) list.scrollTop = current.offsetTop - list.clientHeight / 2;
}

function lineHtml(parent, numbered) {
  let out = '';
  let force = numbered;
  for (let p = parent; p;) {
    // A played position continues with its main-line move, and engine lines
    // branch off it. Inside an engine line, the line simply continues.
    const main = p.engine ? p.children[0] ?? null : tree.main(p);
    if (main) {
      out += plyHtml(main, force);
      force = false;
    }
    for (const v of p.children.filter(c => c !== main)) {
      out += `<span class="variation${v.engine ? ' is-engine' : ''}">(${plyHtml(v, true)}${lineHtml(v, false)})</span>`;
      force = true;
    }
    p = main;
  }
  return out;
}

function plyHtml(node, forceNumber) {
  const { san, color, before } = node.move;
  const num = before.split(' ')[5];
  const prefix = color === 'w' ? `<span class="num">${num}.</span>` : forceNumber ? `<span class="num">${num}…</span>` : '';
  const rating = nodeRating(node);
  const cls = rating ? CLASSES.find(c => c.id === rating.cls) : null;
  const classes = ['ply', node === tree.cursor ? 'is-current' : '', node.engine ? 'is-engine' : ''].filter(Boolean).join(' ');
  const title = cls ? ` title="${cls.label} (${formatWhite(rating.score, color)})"` : '';
  return `${prefix}<span class="${classes}" data-id="${node.id}"${title}><span class="dot cls-${rating?.cls ?? 'none'}"></span>${san}${cls?.symbol ? `<span class="sym cls-${rating.cls}">${cls.symbol}</span>` : ''}</span> `;
}

function updateStatus() {
  const el = $('status');
  if (!engine) { el.textContent = 'Loading engine…'; return; }
  if (game.isGameOver()) { el.textContent = gameOverText(); return; }
  const depth = analysis?.fen === game.fen() ? analysis.depth : 0;
  if (humanToMove()) {
    const who = tree.cursor.engine ? 'Engine line (→ next move, ← back)'
      : mode === 'both' ? (game.turn() === 'w' ? 'White' : 'Black') + ' to move' : 'Your move';
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
    const rating = ratings.get(move.lan);
    const r = visibleRating(rating) ? rating : null;
    const btn = document.createElement('button');
    if (r) btn.style.borderColor = `var(--cls-${r.cls})`;
    btn.innerHTML = `<img src="pieces/${color}${p.toUpperCase()}.svg" alt="${p}"><span>${r ? formatWhite(r.score, color) : ''}</span>`;
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
    tree = new MoveTree(game.fen());
    customStart = typeof fen === 'string' && fen !== DEFAULT_FEN;
  } catch (err) {
    $('status').textContent = `Invalid FEN: ${err.message}`;
    return;
  }
  mode = $('mode').value;
  settings.mode = mode;
  saveSettings();
  orientation = mode === 'b' ? 'b' : 'w';
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
  for (const [id, key] of [['show-rings', 'showRings'], ['show-dests', 'showDests'], ['show-explain', 'showExplain'], ['show-book', 'showBook']]) {
    const input = $(id);
    input.checked = settings[key];
    input.addEventListener('change', () => {
      settings[key] = input.checked;
      saveSettings();
      render();
      renderPieceCard();
      $('opening-card').hidden = settings.mistakePreventer;
    });
  }
  $('opening-card').hidden = settings.mistakePreventer;
  const practiceSelect = $('practice');
  [...OPENINGS].sort((a, b) => a.name.localeCompare(b.name)).forEach(o => {
    const opt = document.createElement('option');
    opt.value = o.name;
    opt.textContent = `${o.name} (${o.eco})`;
    practiceSelect.append(opt);
  });
  practiceSelect.addEventListener('change', () => {
    practice = OPENINGS.find(o => o.name === practiceSelect.value) ?? null;
    newGame();
  });
  $('new-game').onclick = () => newGame();
  $('back').onclick = back;
  $('forward').onclick = forward;
  $('history').addEventListener('click', e => {
    const id = e.target.closest('[data-id]')?.dataset.id;
    if (id != null) goTo(tree.byId.get(+id), { animate: false });
  });
  $('flip').onclick = () => { orientation = orientation === 'w' ? 'b' : 'w'; render(); updateEvalBar(); };
  $('load-fen').onclick = () => newGame($('fen').value.trim());
  $('mode').addEventListener('change', () => newGame(game.history().length ? undefined : game.fen()));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { hidePromotion(); select(null); return; }
    // Arrow keys step through the moves, unless typing in a field.
    if (e.target.closest('input, select, textarea') || e.altKey || e.ctrlKey || e.metaKey) return;
    const actions = { ArrowLeft: back, ArrowRight: forward, Home: () => goTo(tree.root, { animate: false }), End: () => goTo(tree.end(), { animate: false }) };
    if (actions[e.key]) { e.preventDefault(); actions[e.key](); }
  });

  $('tactic-legend').innerHTML = ['fork', 'pin', 'skewer', 'discovered', 'trap', 'remove-defender', 'overload', 'sacrifice']
    .map(id => badgeHtml(TACTIC_ICONS[id])).join(' ');
  $('legend').replaceChildren(...CLASSES.map(c => {
    const span = document.createElement('span');
    span.innerHTML = `<i class="swatch cls-${c.id}"></i>${c.label}`;
    return span;
  }));
}

async function start() {
  initControls();
  initVoice();
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
