import test from 'node:test';
import assert from 'node:assert/strict';
import { rateMoves, summarizePieces, destinationsFor, winPercent, formatScore } from '../web/js/analysis.js';
import { Searcher } from '../web/js/engine/search.js';

test('win% is 50 at equality and saturates for mates', () => {
  assert.equal(winPercent({ cp: 0 }), 50);
  assert.ok(winPercent({ cp: 300 }) > 75);
  assert.equal(winPercent({ mate: 2 }), 100);
  assert.equal(winPercent({ mate: -1 }), 0);
});

test('moves are ranked and classed by drop in win%', () => {
  const r = rateMoves([
    { uci: 'g1f3', score: { cp: 30 } },
    { uci: 'e2e4', score: { cp: 35 } },
    { uci: 'f2f3', score: { cp: -60 } },
    { uci: 'g2g4', score: { cp: -400 } },
    { uci: 'e1e2', score: { mate: -2 } },
  ]);
  assert.equal(r.get('e2e4').rank, 0);
  assert.equal(r.get('e2e4').cls, 'best');
  assert.equal(r.get('g1f3').cls, 'good'); // 0.05 pawns worse: close, but not Best
  assert.equal(r.get('f2f3').cls, 'inaccuracy');
  assert.equal(r.get('g2g4').cls, 'blunder');
  assert.equal(r.get('e1e2').rank, 4);
});

test('faster mate ranks first', () => {
  const r = rateMoves([{ uci: 'a1a8', score: { mate: 3 } }, { uci: 'h1h8', score: { mate: 1 } }]);
  assert.equal(r.get('h1h8').rank, 0);
});

test('pieces summarise their moves; promotions collapse per square', () => {
  const r = rateMoves([
    { uci: 'a7a8q', score: { cp: 900 } },
    { uci: 'a7a8n', score: { cp: 300 } },
    { uci: 'g2g3', score: { cp: 100 } },
  ]);
  const s = summarizePieces(r);
  assert.equal(s.get('a7').moves.length, 2);
  assert.equal(s.get('a7').best.uci, 'a7a8q');
  const dest = destinationsFor(s.get('a7'));
  assert.equal(dest.size, 1);
  assert.equal(dest.get('a8').uci, 'a7a8q');
  assert.equal(dest.get('a8').options.length, 2);
});

test('formatScore', () => {
  assert.equal(formatScore({ cp: 34 }), '+0.3');
  assert.equal(formatScore({ cp: -250 }), '-2.5');
  assert.equal(formatScore({ mate: 2 }), '#2');
  assert.equal(formatScore({ mate: -1 }), '#-1');
});

test('built-in search finds a mate in one and a free queen', () => {
  const mate = new Searcher('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4').run({ maxDepth: 3 });
  assert.equal(rateMoves(mate).get('h5f7').rank, 0);
  assert.deepEqual(rateMoves(mate).get('h5f7').score, { mate: 1 });
  const queen = new Searcher('rnb1kbnr/pppp1ppp/8/4p3/4P2q/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3').run({ maxDepth: 3 });
  assert.equal(rateMoves(queen).get('f3h4').rank, 0);
});

test('Best is only the top score or a tie with it', () => {
  const r = rateMoves([
    { uci: 'e2e4', score: { cp: 35 } },
    { uci: 'd2d4', score: { cp: 35 } },
    { uci: 'g1f3', score: { cp: 34 } },
  ]);
  assert.equal(r.get('e2e4').cls, 'best');
  assert.equal(r.get('d2d4').cls, 'best');
  assert.equal(r.get('g1f3').cls, 'good');
  const mates = rateMoves([{ uci: 'a1a8', score: { mate: 1 } }, { uci: 'h1h8', score: { mate: 3 } }]);
  assert.equal(mates.get('a1a8').cls, 'best');
  assert.equal(mates.get('h1h8').cls, 'good');
});
