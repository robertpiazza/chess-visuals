// Positional commentary on a move, based on common chess principles:
// center control, development, king safety, trades relative to the material
// balance, piece activity, open files and pawn structure.
//
// Returns [{ id, tone: 'good' | 'bad' | 'neutral', text }].

import {
  VALUE, NAME, sqIndex, sqName, applyUci, attacksFrom, enPrise, materialBalance,
} from './tactics.js';

const CENTER = ['d4', 'e4', 'd5', 'e5'].map(sqIndex);

const other = c => (c === 'w' ? 'b' : 'w');

function centerControl(board, color) {
  let n = 0;
  for (let i = 0; i < 64; i++) {
    if (board[i]?.color !== color) continue;
    for (const t of attacksFrom(board, i)) if (CENTER.includes(t)) n++;
    if (CENTER.includes(i) && board[i].type === 'p') n += 2;
  }
  return n;
}

function count(board, color, type) {
  return board.filter(p => p?.color === color && p.type === type).length;
}

function nonPawnMaterial(board) {
  return board.reduce((s, p) => s + (p && p.type !== 'p' && p.type !== 'k' ? VALUE[p.type] : 0), 0);
}

function pawnFiles(board, color) {
  const files = new Array(8).fill(0);
  board.forEach((p, i) => { if (p?.type === 'p' && p.color === color) files[i & 7]++; });
  return files;
}

function doubled(files) { return files.reduce((s, n) => s + Math.max(0, n - 1), 0); }
function isolated(files) {
  return files.reduce((s, n, f) => s + (n && !files[f - 1] && !files[f + 1] ? n : 0), 0);
}

function isPassed(board, i) {
  const p = board[i];
  const f = i & 7, r = i >> 3;
  const dir = p.color === 'w' ? 1 : -1;
  for (let rr = r + dir; rr >= 0 && rr < 8; rr += dir) {
    for (const ff of [f - 1, f, f + 1]) {
      if (ff < 0 || ff > 7) continue;
      const q = board[rr * 8 + ff];
      if (q?.type === 'p' && q.color !== p.color) return false;
    }
  }
  return true;
}

// ctx: { fen, uci, history } where history is the chess.js verbose history
// before this move.
export function principlesOfMove(board, uci, ctx) {
  const from = sqIndex(uci.slice(0, 2)), to = sqIndex(uci.slice(2, 4));
  const piece = board[from];
  const us = piece.color, them = other(us);
  const after = applyUci(board, uci);
  const fullmove = +ctx.fen.split(' ')[5] || 1;
  const castling = ctx.fen.split(' ')[2] || '-';
  const opening = fullmove <= 12;
  const endgame = nonPawnMaterial(board) <= 26;
  const homeRank = us === 'w' ? 0 : 7;
  const out = [];
  const add = (id, tone, text) => out.push({ id, tone, text });

  // Castling and king safety.
  const isCastle = piece.type === 'k' && Math.abs((to & 7) - (from & 7)) === 2;
  if (isCastle) {
    add('castle', 'good', 'Castles: tucks the king away and connects the rooks');
  } else if (piece.type === 'k' && !endgame) {
    const rights = us === 'w' ? /[KQ]/.test(castling) : /[kq]/.test(castling);
    if (rights) add('king-walk', 'bad', 'Moves the king and gives up the right to castle');
  } else if (piece.type === 'r' && opening && (from >> 3) === homeRank) {
    const side = (from & 7) === 7 ? (us === 'w' ? 'K' : 'k') : (from & 7) === 0 ? (us === 'w' ? 'Q' : 'q') : null;
    if (side && castling.includes(side)) add('rook-castle', 'bad', 'Moving this rook gives up castling on that side');
  }

  // Pawn shield in front of a castled king.
  const king = board.findIndex(p => p?.type === 'k' && p.color === us);
  if (piece.type === 'p' && !endgame && (king >> 3) === homeRank && Math.abs((king & 7) - (from & 7)) <= 1 &&
      ((king & 7) >= 5 || (king & 7) <= 2)) {
    add('shield', 'bad', 'Pushes a pawn in front of your castled king, loosening its cover');
  }

  // Center.
  const centerGain = centerControl(after, us) - centerControl(board, us);
  if (piece.type === 'p' && CENTER.includes(to)) add('center', 'good', 'Occupies the center with a pawn');
  else if (centerGain >= 2) add('center', 'good', 'Adds control of the central squares (d4, e4, d5, e5)');
  else if (centerGain <= -2) add('center-loss', 'bad', 'Gives up control of the center');

  // Development.
  if (opening && (piece.type === 'n' || piece.type === 'b') && (from >> 3) === homeRank) {
    add('develop', 'good', `Develops the ${NAME[piece.type]}`);
  }
  if (piece.type === 'n' && ((to & 7) === 0 || (to & 7) === 7) && !board[to]) {
    add('rim', 'bad', 'A knight on the rim controls fewer squares');
  }
  if (opening && piece.type === 'q' && fullmove <= 8) {
    const undeveloped = ['b', 'n'].reduce((s, t) => s + board.filter((p, i) => p?.color === us && p.type === t && (i >> 3) === homeRank).length, 0);
    if (undeveloped >= 2) add('early-queen', 'bad', 'Brings the queen out early; it can be chased while you lose time');
  }
  if (opening && !board[to] && ctx.history?.some(h => h.color === us && h.to === uci.slice(0, 2) && h.piece !== 'p' && h.piece !== 'k')) {
    if (!enPrise(board, from)) add('tempo', 'bad', 'Moves the same piece twice in the opening instead of developing another');
  }

  // Trades relative to the material balance.
  const captured = board[to];
  if (captured && captured.type !== 'p') {
    const recaptured = enPrise(after, to);
    const even = recaptured && Math.abs(VALUE[captured.type] - VALUE[piece.type]) <= 0.5;
    const balance = materialBalance(board, us);
    if (even) {
      if (balance >= 2) add('trade-ahead', 'good', 'Trades pieces while ahead in material: fewer pieces make the extra material count');
      else if (balance <= -2) add('trade-behind', 'bad', 'Trades pieces while behind in material: usually keep pieces on to create chances');
      if (piece.type === 'q' && captured.type === 'q' && balance >= 1) add('trade-queens', 'good', 'Trading queens while ahead removes the opponent\'s best attacking piece');
    }
    // Bishop pair, assuming the recapture happens on an even trade.
    if (piece.type === 'b' && captured.type === 'n' && count(board, us, 'b') === 2 && recaptured) {
      add('bishop-pair', 'bad', 'Gives up the bishop pair for a knight');
    }
    if (captured.type === 'b' && count(board, them, 'b') === 2 && count(board, us, 'b') === 2) {
      add('bishop-pair', 'good', 'Takes away the opponent\'s bishop pair while keeping yours');
    }
  }

  // Rooks on open files and the seventh rank.
  if (piece.type === 'r' && (from & 7) !== (to & 7)) {
    const ours = pawnFiles(after, us)[to & 7], theirs = pawnFiles(after, them)[to & 7];
    if (!ours && !theirs) add('open-file', 'good', `Puts the rook on the open ${'abcdefgh'[to & 7]}-file`);
    else if (!ours) add('open-file', 'good', `Puts the rook on the half-open ${'abcdefgh'[to & 7]}-file`);
  }
  if (piece.type === 'r' && (to >> 3) === (us === 'w' ? 6 : 1) && (from >> 3) !== (to >> 3)) {
    add('seventh', 'good', 'Rook on the seventh rank attacks pawns from behind');
  }

  // Pawn structure.
  if (piece.type === 'p') {
    if (isPassed(after, to)) {
      const rank = us === 'w' ? (to >> 3) + 1 : 8 - (to >> 3);
      add('passed', 'good', rank >= 6 ? 'Pushes a passed pawn close to promotion' : 'Advances a passed pawn');
    }
  }
  const pfBefore = pawnFiles(board, us), pfAfter = pawnFiles(after, us);
  if (doubled(pfAfter) > doubled(pfBefore)) add('doubled', 'bad', 'Creates doubled pawns');
  if (isolated(pfAfter) > isolated(pfBefore)) add('isolated', 'bad', 'Leaves an isolated pawn');
  const theirsBefore = pawnFiles(board, them), theirsAfter = pawnFiles(after, them);
  if (doubled(theirsAfter) > doubled(theirsBefore) || isolated(theirsAfter) > isolated(theirsBefore)) {
    add('weaken', 'good', 'Damages the opponent\'s pawn structure');
  }

  // Piece activity.
  if (piece.type !== 'p' && piece.type !== 'k' && !isCastle) {
    const before = attacksFrom(board, from).filter(t => board[t]?.color !== us).length;
    const now = attacksFrom(after, to).filter(t => after[t]?.color !== us).length;
    if (now - before >= 3) add('active', 'good', `Activates the ${NAME[piece.type]}: ${now} squares instead of ${before}`);
    else if (before - now >= 3 && !captured) add('passive', 'bad', `Makes the ${NAME[piece.type]} more passive: ${now} squares instead of ${before}`);
  }
  if (piece.type === 'k' && endgame) {
    const dist = i => Math.max(Math.abs((i & 7) - 3.5), Math.abs((i >> 3) - 3.5));
    if (dist(to) < dist(from)) add('king-active', 'good', 'Centralizes the king: in the endgame it is a fighting piece');
  }

  // Defending a piece that was hanging.
  for (let i = 0; i < 64; i++) {
    if (i === from || board[i]?.color !== us || board[i].type === 'k') continue;
    if (enPrise(board, i) && !enPrise(after, i) && after[i]) {
      add('defend', 'good', `Protects the ${NAME[board[i].type]} on ${sqName(i)}`);
    }
  }

  return out;
}
