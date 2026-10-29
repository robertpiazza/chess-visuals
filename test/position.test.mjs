import test from 'node:test';
import assert from 'node:assert/strict';
import { Position } from '../web/js/engine/position.js';

function perft(pos, depth) {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of pos.legalMoves()) {
    pos.makeMove(m);
    n += perft(pos, depth - 1);
    pos.unmakeMove(m);
  }
  return n;
}

// Reference counts from the Chess Programming Wiki perft results page.
const CASES = [
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902, 197281]],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
];

for (const [fen, counts] of CASES) {
  test(`perft ${fen}`, () => {
    counts.forEach((expected, i) => assert.equal(perft(new Position(fen), i + 1), expected, `depth ${i + 1}`));
  });
}
