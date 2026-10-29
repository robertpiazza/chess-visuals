// Small alpha-beta search used when Stockfish can't load. It scores every
// legal move (like Stockfish's MultiPV) so the board can rate them all.
// Weak compared to Stockfish, but enough to catch hanging pieces and short
// tactics.

import { Position, WHITE, pieceColor, pieceType, moveToUci } from './position.js';

// Indexed by piece type (1 = pawn … 6 = king).
const VALUE = [0, 100, 320, 330, 500, 900, 0];
const MATE = 100000;

// Piece-square tables from White's point of view, written a8 first.
// Values from Tomasz Michniewski's "simplified evaluation function".
const PST_BY_LETTER = {
  p: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0],
  n: [
   -50,-40,-30,-30,-30,-30,-40,-50,
   -40,-20,  0,  0,  0,  0,-20,-40,
   -30,  0, 10, 15, 15, 10,  0,-30,
   -30,  5, 15, 20, 20, 15,  5,-30,
   -30,  0, 15, 20, 20, 15,  0,-30,
   -30,  5, 10, 15, 15, 10,  5,-30,
   -40,-20,  0,  5,  5,  0,-20,-40,
   -50,-40,-30,-30,-30,-30,-40,-50],
  b: [
   -20,-10,-10,-10,-10,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  5, 10, 10,  5,  0,-10,
   -10,  5,  5, 10, 10,  5,  5,-10,
   -10,  0, 10, 10, 10, 10,  0,-10,
   -10, 10, 10, 10, 10, 10, 10,-10,
   -10,  5,  0,  0,  0,  0,  5,-10,
   -20,-10,-10,-10,-10,-10,-10,-20],
  r: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0],
  q: [
   -20,-10,-10, -5, -5,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  5,  5,  5,  5,  0,-10,
    -5,  0,  5,  5,  5,  5,  0, -5,
     0,  0,  5,  5,  5,  5,  0, -5,
   -10,  5,  5,  5,  5,  5,  0,-10,
   -10,  0,  5,  0,  0,  0,  0,-10,
   -20,-10,-10, -5, -5,-10,-10,-20],
  k: [
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -20,-30,-30,-40,-40,-30,-30,-20,
   -10,-20,-20,-20,-20,-20,-20,-10,
    20, 20,  0,  0,  0,  0, 20, 20,
    20, 30, 10,  0,  0, 10, 30, 20],
};

// PST[type][sq] for a White piece on 0x88 square sq.
const PST = [null];
for (const t of 'pnbrqk') {
  const table = new Int16Array(128);
  PST_BY_LETTER[t].forEach((v, i) => { table[(7 - (i >> 3)) * 16 + (i & 7)] = v; });
  PST.push(table);
}

class Timeout extends Error {}

// Static evaluation from the side to move's point of view.
function evaluate(pos) {
  const b = pos.board;
  let score = 0;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    const p = b[sq];
    if (!p) continue;
    const t = pieceType(p);
    if (pieceColor(p) === WHITE) score += VALUE[t] + PST[t][sq];
    else score -= VALUE[t] + PST[t][sq ^ 0x70];
  }
  return pos.side === WHITE ? score : -score;
}

function orderKey(m) {
  let k = 0;
  if (m.captured) k += 10 * VALUE[pieceType(m.captured)] - VALUE[pieceType(m.piece)] + 10000;
  if (m.promo) k += VALUE[m.promo] + 9000;
  return k;
}

function ordered(moves) {
  for (const m of moves) m.key = orderKey(m);
  return moves.sort((a, b) => b.key - a.key);
}

export class Searcher {
  constructor(fen) {
    this.pos = new Position(fen);
    this.nodes = 0;
    this.deadline = Infinity;
  }

  tick() {
    if ((++this.nodes & 2047) === 0 && Date.now() > this.deadline) throw new Timeout();
  }

  quiesce(alpha, beta) {
    this.tick();
    const stand = evaluate(this.pos);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    for (const m of ordered(this.pos.pseudoMoves(true))) {
      this.pos.makeMove(m);
      if (this.pos.inCheck(this.pos.side ^ 1)) { this.pos.unmakeMove(m); continue; }
      const s = -this.quiesce(-beta, -alpha);
      this.pos.unmakeMove(m);
      if (s >= beta) return s;
      if (s > alpha) alpha = s;
    }
    return alpha;
  }

  negamax(depth, alpha, beta, ply) {
    this.tick();
    const pos = this.pos;
    if (pos.halfmove >= 100) return 0;
    const inCheck = pos.inCheck();
    // Search one ply deeper when in check so mates aren't cut off by the horizon.
    if (inCheck) depth++;
    if (depth <= 0) return this.quiesce(alpha, beta);
    let best = -Infinity;
    let legal = 0;
    for (const m of ordered(pos.pseudoMoves())) {
      pos.makeMove(m);
      if (pos.inCheck(pos.side ^ 1)) { pos.unmakeMove(m); continue; }
      legal++;
      const s = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
      pos.unmakeMove(m);
      if (s > best) best = s;
      if (s > alpha) alpha = s;
      if (alpha >= beta) break;
    }
    if (!legal) return inCheck ? -MATE + ply : 0;
    return best;
  }

  // Exact score for every root move at `depth` plies.
  scoreRootMoves(depth) {
    const lines = [];
    for (const m of ordered(this.pos.legalMoves())) {
      this.pos.makeMove(m);
      const s = -this.negamax(depth - 1, -Infinity, Infinity, 1);
      this.pos.unmakeMove(m);
      lines.push({ uci: moveToUci(m), score: toUciScore(s) });
    }
    return lines;
  }

  // Iterative deepening; onDepth(depth, lines) fires after each finished depth.
  run({ maxDepth = 5, timeMs = 2000, onDepth }) {
    this.deadline = Date.now() + timeMs;
    let last = [];
    for (let d = 1; d <= maxDepth; d++) {
      try {
        last = this.scoreRootMoves(d);
      } catch (e) {
        if (e instanceof Timeout) break;
        throw e;
      }
      onDepth?.(d, last);
    }
    return last;
  }
}

function toUciScore(s) {
  if (s > MATE - 1000) return { mate: Math.ceil((MATE - s) / 2) };
  if (s < -MATE + 1000) return { mate: -Math.ceil((MATE + s) / 2) };
  return { cp: Math.round(s) };
}
