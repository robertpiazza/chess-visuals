// How safe each piece is: what its owner would lose if the opponent started
// capturing on its square and both sides kept trading while it paid off
// (a static exchange evaluation). Static, like the rest of tactics.js: it
// ignores checks and threats elsewhere, so it's a quick guide, not a search.

import { VALUE, capturers, sqName } from './tactics.js';

const other = c => (c === 'w' ? 'b' : 'w');

// Material `side` wins by capturing first on `sq` and trading off from there,
// with each side free to stop when continuing would cost it. Each capture
// uses the cheapest piece that can legally take, so pins, and pieces lined up
// behind one another (x-rays), are handled. 0 if `side` can't capture there.
export function exchangeGain(board, sq, side) {
  let b = board;
  let turn = side;
  let onSquare = VALUE[b[sq].type];
  const gain = [];
  for (;;) {
    const takers = capturers(b, sq, turn);
    if (!takers.length) break;
    const from = takers.reduce((a, c) => (VALUE[b[a].type] <= VALUE[b[c].type] ? a : c));
    gain.push(onSquare - (gain.length ? gain[gain.length - 1] : 0));
    onSquare = VALUE[b[from].type];
    b = b.slice();
    b[sq] = b[from];
    b[from] = null;
    turn = other(turn);
    // Taking the king isn't a capture; it only means the last move was illegal.
    if (onSquare >= VALUE.k) break;
  }
  if (!gain.length) return 0;
  // Back up from the last capture: each side stops if going on loses.
  for (let d = gain.length - 1; d > 0; d--) gain[d - 1] = -Math.max(-gain[d - 1], gain[d]);
  return Math.max(0, gain[0]);
}

// Safety of every piece on the board, keyed by square name:
//   { color, attacked, defended, loss, state }
//   loss   material its owner loses if the opponent starts the exchange
//   state  'loses'      the opponent wins material by capturing it
//          'holds'      attacked, but the trades come out even or better
//          'protected'  not attacked, and a capture on it can be answered
//          'loose'      not attacked, but nothing defends it
// Kings are left out.
export function pieceSafety(board) {
  const out = new Map();
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || p.type === 'k') continue;
    const them = other(p.color);
    const attacked = capturers(board, i, them).length > 0;
    // Swap in an enemy pawn so our own pieces count as able to recapture.
    const asEnemy = board.slice();
    asEnemy[i] = { type: 'p', color: them };
    const defended = capturers(asEnemy, i, p.color).length > 0;
    const loss = attacked ? exchangeGain(board, i, them) : 0;
    const state = loss > 0 ? 'loses' : attacked ? 'holds' : defended ? 'protected' : 'loose';
    out.set(sqName(i), { color: p.color, attacked, defended, loss, state });
  }
  return out;
}
