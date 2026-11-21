import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFen, sqIndex } from '../web/js/tactics.js';
import { exchangeGain, pieceSafety } from '../web/js/safety.js';

const safety = fen => pieceSafety(parseFen(fen).board);

test('a knight attacked by a pawn loses the difference even when defended', () => {
  const s = safety('4k3/8/3p4/4N3/3P4/8/8/4K3 w - - 0 1');
  assert.deepEqual([s.get('e5').state, s.get('e5').loss], ['loses', 2]);
  assert.equal(s.get('d4').state, 'loose');
});

test('a queen attacked by doubled rooks is lost whole', () => {
  const s = safety('4k3/8/8/3q4/8/8/3R4/3RK3 w - - 0 1');
  assert.deepEqual([s.get('d5').state, s.get('d5').loss], ['loses', 9]);
  assert.equal(s.get('d2').state, 'holds');
});

test('a defended piece attacked by something worth more holds', () => {
  // Black knight attacks e4; the knight on g5 recaptures.
  const s = safety('r1bqk2r/pppp1ppp/2n2n2/2b1p1N1/2B1P3/8/PPPP1PPP/RNBQK2R w KQkq - 6 5');
  assert.equal(s.get('e4').state, 'holds');
  assert.deepEqual([s.get('f7').state, s.get('f7').loss], ['loses', 1]);
});

test('protected and loose pieces that are not attacked', () => {
  const s = safety('4k3/8/8/8/8/8/1P6/2N1K3 w - - 0 1');
  assert.equal(s.get('b2').state, 'loose');
  assert.equal(s.get('c1').state, 'loose');
  const t = safety('4k3/8/8/8/8/1P6/2P5/4K3 w - - 0 1');
  assert.equal(t.get('b3').state, 'protected');
  assert.ok(!t.has('e1'), 'kings are left out');
});

test('a pinned defender does not count', () => {
  // The rook on e8 attacks the knight on e4; the pawn on f3 defends it...
  const free = parseFen('k3r3/8/8/8/4N3/5P2/8/3K4 w - - 0 1').board;
  assert.equal(exchangeGain(free, sqIndex('e4'), 'b'), 0);
  // ...unless the bishop on h5 pins that pawn to the king on d1.
  const pinned = parseFen('k3r3/8/8/7b/4N3/5P2/8/3K4 w - - 0 1').board;
  assert.equal(exchangeGain(pinned, sqIndex('e4'), 'b'), 3);
});
