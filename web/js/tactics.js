// Tactical pattern detection for a single move: forks, pins, skewers,
// discovered attacks, trapped pieces, captures and hanging pieces.
//
// These are static checks on the position after the move, not a search, so
// they describe what a move sets up. The engine rating says whether it works.
//
// Squares are indexes 0..63 (a1 = 0, h1 = 7, a8 = 56). A board is a
// 64-entry array of { type, color } or null.

import { Chess } from '../vendor/chess.js';
import { Position, moveToUci } from './engine/position.js';

export const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
export const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export const sqName = i => 'abcdefgh'[i & 7] + ((i >> 3) + 1);
export const sqIndex = name => (name.charCodeAt(1) - 49) * 8 + (name.charCodeAt(0) - 97);
const other = c => (c === 'w' ? 'b' : 'w');
const onBoard = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;

export function parseFen(fen) {
  const board = new Array(64).fill(null);
  const [placement, turn] = fen.split(' ');
  let r = 7, f = 0;
  for (const ch of placement) {
    if (ch === '/') { r--; f = 0; continue; }
    if (ch >= '1' && ch <= '8') { f += +ch; continue; }
    board[r * 8 + f] = { type: ch.toLowerCase(), color: ch === ch.toLowerCase() ? 'b' : 'w' };
    f++;
  }
  return { board, turn };
}

// Board after a UCI move (castling, en passant and promotion included).
export function applyUci(board, uci) {
  const b = board.slice();
  const from = sqIndex(uci.slice(0, 2)), to = sqIndex(uci.slice(2, 4));
  const piece = b[from];
  b[from] = null;
  if (piece.type === 'p' && (from & 7) !== (to & 7) && !b[to]) {
    b[(from & ~7) | (to & 7)] = null; // en passant
  }
  if (piece.type === 'k' && Math.abs((to & 7) - (from & 7)) === 2) {
    const rank = from & ~7;
    if ((to & 7) === 6) { b[rank + 5] = b[rank + 7]; b[rank + 7] = null; }
    else { b[rank + 3] = b[rank]; b[rank] = null; }
  }
  b[to] = uci[4] ? { type: uci[4], color: piece.color } : piece;
  return b;
}

const isSlider = t => t === 'b' || t === 'r' || t === 'q';
function slideDirs(t) {
  if (t === 'b') return DIAG;
  if (t === 'r') return ORTHO;
  if (t === 'q') return [...DIAG, ...ORTHO];
  return [];
}

// Squares the piece on `i` attacks.
export function attacksFrom(board, i) {
  const p = board[i];
  if (!p) return [];
  const f = i & 7, r = i >> 3;
  const out = [];
  const step = (df, dr) => { if (onBoard(f + df, r + dr)) out.push((r + dr) * 8 + f + df); };
  if (p.type === 'p') {
    const dr = p.color === 'w' ? 1 : -1;
    step(-1, dr); step(1, dr);
  } else if (p.type === 'n') {
    for (const [df, dr] of KNIGHT) step(df, dr);
  } else if (p.type === 'k') {
    for (const [df, dr] of KING) step(df, dr);
  } else {
    for (const [df, dr] of slideDirs(p.type)) {
      for (let nf = f + df, nr = r + dr; onBoard(nf, nr); nf += df, nr += dr) {
        out.push(nr * 8 + nf);
        if (board[nr * 8 + nf]) break;
      }
    }
  }
  return out;
}

export function attackersOf(board, i, color) {
  const out = [];
  for (let j = 0; j < 64; j++) {
    if (board[j]?.color === color && attacksFrom(board, j).includes(i)) out.push(j);
  }
  return out;
}

// Rough "can this piece be won": attacked and either undefended or attacked by
// something cheaper. Kings are never counted.
export function enPrise(board, i) {
  const p = board[i];
  if (!p || p.type === 'k') return false;
  const attackers = attackersOf(board, i, other(p.color));
  if (!attackers.length) return false;
  // A king can only take an undefended piece.
  const usable = attackers.filter(a => board[a].type !== 'k');
  const defenders = attackersOf(withoutPiece(board, i, other(p.color)), i, p.color);
  if (!defenders.length) return true;
  return usable.some(a => VALUE[board[a].type] < VALUE[p.type]);
}

// Replaces the piece on `i` with an enemy dummy so own pieces "defend" it.
function withoutPiece(board, i, color) {
  const b = board.slice();
  b[i] = { type: 'p', color };
  return b;
}

function kingSquare(board, color) {
  return board.findIndex(p => p?.type === 'k' && p.color === color);
}

const label = (board, i) => `${NAME[board[i].type]} on ${sqName(i)}`;

// Is the enemy piece on `t` worth attacking: the king, anything worth more
// than the attacker, or anything undefended that isn't a pawn.
function worthAttacking(board, t, attackerType) {
  const p = board[t];
  if (p.type === 'k') return true;
  if (VALUE[p.type] > VALUE[attackerType]) return true;
  if (p.type === 'p') return false;
  return attackersOf(withoutPiece(board, t, other(p.color)), t, p.color).length === 0;
}

// All motifs created by `uci` for the side making it.
// Returns [{ id, tone: 'good' | 'bad', text, arrows: [[from, to]], squares }].
export function motifsOfMove(board, uci) {
  const from = sqIndex(uci.slice(0, 2)), to = sqIndex(uci.slice(2, 4));
  const mover = board[from];
  const us = mover.color, them = other(us);
  const after = applyUci(board, uci);
  const moved = after[to];
  const motifs = [];
  const enemyKing = kingSquare(after, them);

  // Captures.
  const captured = board[to] ?? (mover.type === 'p' && (from & 7) !== (to & 7) ? { type: 'p', color: them } : null);
  if (captured) {
    const recapture = enPrise(after, to);
    const gain = VALUE[captured.type] - (recapture ? VALUE[moved.type] : 0);
    if (!recapture) {
      motifs.push({ id: 'win', tone: 'good', text: `Wins the ${NAME[captured.type]} on ${sqName(to)} for free`, arrows: [[from, to]] });
    } else if (gain > 0) {
      motifs.push({ id: 'win', tone: 'good', text: `Wins material: ${NAME[moved.type]} for ${NAME[captured.type]}`, arrows: [[from, to]] });
    } else if (gain === 0) {
      motifs.push({ id: 'trade', tone: 'neutral', text: `Trades ${NAME[moved.type]} for ${NAME[captured.type]}`, arrows: [[from, to]] });
    } else {
      motifs.push({ id: 'loses', tone: 'bad', text: `Gives up the ${NAME[moved.type]} for a ${NAME[captured.type]}`, arrows: [[from, to]] });
    }
  }

  // Check, and whether it comes from another piece (discovered check).
  const checkers = enemyKing >= 0 ? attackersOf(after, enemyKing, us) : [];
  if (checkers.length) {
    const disc = checkers.filter(c => c !== to);
    if (disc.length && checkers.includes(to)) {
      motifs.push({ id: 'double-check', tone: 'good', text: 'Double check: the king must move', arrows: checkers.map(c => [c, enemyKing]) });
    } else if (disc.length) {
      motifs.push({ id: 'disc-check', tone: 'good', text: `Discovered check from the ${label(after, disc[0])}`, arrows: [[disc[0], enemyKing]] });
    } else {
      motifs.push({ id: 'check', tone: 'neutral', text: 'Gives check', arrows: [[to, enemyKing]] });
    }
  } else {
    // Mate threat: if it were our move again, could we mate at once? Only
    // reported when the threat is new, not one we already had.
    const mate = mateInOne(after, us);
    if (mate && !mateInOne(board, us)) {
      motifs.push({ id: 'mate-threat', tone: 'good', text: `Threatens mate with ${mate.san}`, arrows: [[sqIndex(mate.from), sqIndex(mate.to)]] });
    }
  }

  const movedSafe = !enPrise(after, to);

  // Fork: the moved piece attacks two or more worthwhile targets.
  const targets = attacksFrom(after, to).filter(t => after[t]?.color === them && worthAttacking(after, t, moved.type));
  if (targets.length >= 2 && movedSafe) {
    const names = targets.map(t => label(after, t));
    motifs.push({ id: 'fork', tone: 'good', text: `Fork: the ${NAME[moved.type]} attacks the ${listText(names)}`, arrows: targets.map(t => [to, t]) });
  } else if (targets.length === 1 && movedSafe && after[targets[0]].type !== 'k' && enPrise(after, targets[0])) {
    motifs.push({ id: 'threat', tone: 'good', text: `Attacks the ${label(after, targets[0])}`, arrows: [[to, targets[0]]] });
  } else if (!targets.length && movedSafe) {
    // An undefended pawn under attack is a threat too (2.Nf3 hitting e5).
    const pawn = attacksFrom(after, to).find(t => after[t]?.color === them && after[t].type === 'p' && enPrise(after, t));
    if (pawn != null) motifs.push({ id: 'threat', tone: 'good', text: `Attacks the undefended pawn on ${sqName(pawn)}`, arrows: [[to, pawn]] });
  }

  // Pins and skewers along the moved piece's lines.
  if (isSlider(moved.type) && movedSafe) {
    for (const [df, dr] of slideDirs(moved.type)) {
      const line = xray(after, to, df, dr);
      if (!line) continue;
      const [front, back] = line;
      const pf = after[front], pb = after[back];
      if (pf.color !== them || pb.color !== them) continue;
      // Pawn pins only matter when the pinned pawn can be won.
      if (VALUE[pf.type] < VALUE[pb.type] && (pf.type !== 'p' || enPrise(after, front))) {
        const absolute = pb.type === 'k';
        motifs.push({
          id: 'pin', tone: 'good',
          text: `Pins the ${label(after, front)} to the ${absolute ? 'king' : NAME[pb.type]}` + (absolute ? ' (it cannot legally move)' : ''),
          arrows: [[to, front], [front, back]],
        });
      } else if (VALUE[pf.type] > VALUE[pb.type] && pb.type !== 'p' &&
                 (attackersOf(withoutPiece(after, back, us), back, them).length === 0 || VALUE[pb.type] > VALUE[moved.type])) {
        motifs.push({
          id: 'skewer', tone: 'good',
          text: `Skewer: the ${label(after, front)} must move and the ${label(after, back)} falls`,
          arrows: [[to, front], [front, back]],
        });
      }
    }
  }

  // Discovered attack: another of our sliders now hits something worthwhile.
  for (let s = 0; s < 64; s++) {
    if (s === to || after[s]?.color !== us || !isSlider(after[s].type)) continue;
    const before = new Set(attacksFrom(board, s));
    for (const t of attacksFrom(after, s)) {
      if (before.has(t) || after[t]?.color !== them || after[t].type === 'k') continue;
      if (!worthAttacking(after, t, after[s].type)) continue;
      motifs.push({
        id: 'discovered', tone: 'good',
        text: `Discovered attack: moving away opens the ${label(after, s)} onto the ${label(after, t)}`,
        arrows: [[s, t]],
      });
    }
  }

  // Trapped enemy pieces that weren't trapped before.
  for (let t = 0; t < 64; t++) {
    const p = after[t];
    if (!p || p.color !== them || p.type === 'p' || p.type === 'k') continue;
    if (isTrapped(after, t) && !isTrapped(board, t)) {
      motifs.push({ id: 'trap', tone: 'good', text: `Traps the ${label(after, t)}: every square it can reach is covered`, arrows: attackersOf(after, t, us).slice(0, 1).map(a => [a, t]) });
    }
  }

  // Our own pieces left en prise by this move.
  if (!movedSafe && !(captured && VALUE[captured.type] >= VALUE[moved.type])) {
    motifs.push({ id: 'hangs', tone: 'bad', text: `The ${NAME[moved.type]} on ${sqName(to)} can be taken`, arrows: attackersOf(after, to, them).slice(0, 1).map(a => [a, to]) });
  }
  for (let i = 0; i < 64; i++) {
    if (i === to || after[i]?.color !== us || after[i].type === 'k') continue;
    if (enPrise(after, i) && !enPrise(board, i)) {
      motifs.push({ id: 'hangs', tone: 'bad', text: `Leaves the ${label(after, i)} undefended against attack`, arrows: attackersOf(after, i, them).slice(0, 1).map(a => [a, i]) });
    }
  }

  // Rescuing a piece that was under attack.
  if (enPrise(board, from) && movedSafe && !captured) {
    motifs.push({ id: 'escape', tone: 'good', text: `Moves the attacked ${NAME[mover.type]} to safety`, arrows: [] });
  }

  // A plain threat is redundant when a fork, pin or skewer covers the target.
  const covered = new Set(motifs.filter(m => ['fork', 'pin', 'skewer'].includes(m.id)).flatMap(m => m.arrows.map(a => a[1])));
  return motifs.filter(m => m.id !== 'threat' || !covered.has(m.arrows[0][1]));
}

// First two pieces along a ray from `i`, if both exist.
function xray(board, i, df, dr) {
  const found = [];
  for (let f = (i & 7) + df, r = (i >> 3) + dr; onBoard(f, r); f += df, r += dr) {
    if (board[r * 8 + f]) {
      found.push(r * 8 + f);
      if (found.length === 2) return found;
    }
  }
  return null;
}

// A piece is trapped when it can be won where it stands and every move it has
// either walks into a losing square or captures less than it's worth.
function isTrapped(board, i) {
  const p = board[i];
  if (!enPrise(board, i)) return false;
  for (const d of attacksFrom(board, i)) {
    const target = board[d];
    if (target?.color === p.color) continue;
    if (target && VALUE[target.type] >= VALUE[p.type]) return false;
    const b = board.slice();
    b[d] = p;
    b[i] = null;
    if (!enPrise(b, d)) return false;
  }
  // No safe square to run to; it's only trapped if no other reply saves it
  // either: blocking the attack, defending it, or taking the attacker.
  for (const reply of repliesFor(board, p.color)) {
    const after = applyUci(board, reply);
    const from = sqIndex(reply.slice(0, 2));
    if (from === i) continue; // moving the piece itself was covered above
    if (after[i] && !enPrise(after, i)) return false;
  }
  return true;
}

// A mating move for `color` if it were `color`'s turn, else null. Searched
// with the engine's fast move generator; chess.js only names the move.
export function mateInOne(board, color) {
  try {
    const fen = boardToFen(board, color);
    const pos = new Position(fen);
    for (const m of pos.legalMoves()) {
      pos.makeMove(m);
      const mate = pos.inCheck() && pos.legalMoves().length === 0;
      pos.unmakeMove(m);
      if (mate) {
        const uci = moveToUci(m);
        const san = new Chess(fen, { skipValidation: true }).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
        return { san, from: uci.slice(0, 2), to: uci.slice(2, 4) };
      }
    }
  } catch {
    return null;
  }
  return null;
}

// Legal moves for `color` on this board (castling and en passant ignored).
function repliesFor(board, color) {
  try {
    return new Chess(boardToFen(board, color), { skipValidation: true }).moves({ verbose: true }).map(m => m.lan);
  } catch {
    return [];
  }
}

export function boardToFen(board, turn) {
  const rows = [];
  for (let r = 7; r >= 0; r--) {
    let row = '', empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = board[r * 8 + f];
      if (!p) { empty++; continue; }
      if (empty) { row += empty; empty = 0; }
      row += p.color === 'w' ? p.type.toUpperCase() : p.type;
    }
    rows.push(row + (empty || ''));
  }
  return `${rows.join('/')} ${turn} - - 0 1`;
}

function listText(items) {
  if (items.length <= 2) return items.join(' and ');
  return items.slice(0, -1).join(', ') + ' and ' + items.at(-1);
}

// Material balance in pawns from `color`'s side.
export function materialBalance(board, color) {
  let sum = 0;
  for (const p of board) {
    if (!p || p.type === 'k') continue;
    sum += p.color === color ? VALUE[p.type] : -VALUE[p.type];
  }
  return sum;
}
