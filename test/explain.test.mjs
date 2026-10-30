import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../web/vendor/chess.js';
import { parseFen, motifsOfMove } from '../web/js/tactics.js';
import { principlesOfMove } from '../web/js/principles.js';
import { explainMove, forcedTactic } from '../web/js/explain.js';
import { rateMoves } from '../web/js/analysis.js';
import { OPENINGS, identifyOpening, bookContinuations } from '../web/js/openings.js';

const ids = (fen, uci) => motifsOfMove(parseFen(fen).board, uci).map(m => m.id);
const pids = (fen, uci) => principlesOfMove(parseFen(fen).board, uci, { fen, history: [] }).map(m => m.id);

test('knight fork', () => assert.ok(ids('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'b5c7').includes('fork')));
test('absolute pin', () => assert.ok(ids('r3k3/8/2n5/8/8/8/8/4KB2 w - - 0 1', 'f1b5').includes('pin')));
test('skewer', () => assert.ok(ids('4k2q/8/8/8/8/8/8/R3K3 w - - 0 1', 'a1a8').includes('skewer')));
test('discovered attack', () => assert.ok(ids('k7/8/8/8/3q4/8/3N4/3R2K1 w - - 0 1', 'd2b3').includes('discovered')));
test('trapped bishop', () => assert.ok(ids('5k2/5p1B/6p1/8/8/8/8/4K3 b - - 0 1', 'f8g7').includes('trap')));
test('hanging queen', () => assert.ok(ids('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2', 'd8g5').includes('hangs')));
test('quiet opening move has no tactics', () => assert.deepEqual(ids('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e4'), []));

test('principles: center, development, castling, early queen', () => {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  assert.ok(pids(start, 'e2e4').includes('center'));
  assert.ok(pids(start, 'g1f3').includes('develop'));
  assert.ok(pids(start, 'g1h3').includes('rim'));
  assert.ok(pids('rnbqk2r/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', 'e1g1').includes('castle'));
  assert.ok(pids('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'd1h5').includes('early-queen'));
});

test('principles: trade while ahead vs behind', () => {
  // White is a rook up and offers a knight trade on e5.
  // An undefended knight is a win, not a trade.
  assert.ok(!pids('4k3/8/8/4n3/8/5N2/8/R3K3 w - - 0 1', 'f3e5').includes('trade-ahead'));
  // With the f6 pawn guarding e5 it's an even trade.
  const tradeAhead = '4k3/8/5p2/4n3/8/5N2/8/R3K3 w - - 0 1';
  assert.ok(pids(tradeAhead, 'f3e5').includes('trade-ahead'));
  const tradeBehind = '4k3/r7/5p2/4n3/8/5N2/8/4K3 w - - 0 1';
  assert.ok(pids(tradeBehind, 'f3e5').includes('trade-behind'));
});

test('forced tactic marker: immediate fork on a sound move only', () => {
  const fen = 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1';
  const ratings = rateMoves([{ uci: 'b5c7', score: { cp: 500 } }, { uci: 'b5d4', score: { cp: 0 } }]);
  assert.equal(forcedTactic(fen, ratings.get('b5c7')).id, 'fork');
  const bad = rateMoves([{ uci: 'b5c7', score: { cp: -500 } }, { uci: 'b5d4', score: { cp: 200 } }]);
  assert.equal(forcedTactic(fen, bad.get('b5c7')), null);
});

test('forced tactic marker: fork reached through the engine line', () => {
  // 1.Nb5 isn't a tactic itself, but after 1...h6 2.Nc7+ forks king and rook.
  const fen = 'r3k3/7p/8/8/3N4/8/8/4K3 w - - 0 1';
  const ratings = rateMoves([{ uci: 'd4b5', score: { cp: 500 }, pv: ['d4b5', 'h7h6', 'b5c7'] }]);
  const f = forcedTactic(fen, ratings.get('d4b5'));
  assert.equal(f.id, 'fork');
  assert.equal(f.when, 'next');
  assert.match(explainMove(fen, 'd4b5', ratings).notes[0].text, /Forces a fork: after h6, Nc7\+/);
});

test('explanation names the opponent reply for a blunder and compares with best', () => {
  const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
  const ratings = rateMoves([
    { uci: 'b8c6', score: { cp: -30 }, pv: ['b8c6', 'f1b5'] },
    { uci: 'd8g5', score: { cp: -900 }, pv: ['d8g5', 'f3g5'] },
  ]);
  const ex = explainMove(fen, 'd8g5', ratings);
  assert.equal(ex.san, 'Qg5');
  assert.ok(ex.notes.some(n => n.tone === 'bad' && n.text.startsWith('Allows Nxg5')));
  assert.match(ex.comparison.text, /Engine prefers Nc6/);
});

test('every opening line is legal and has a unique name', () => {
  const names = new Set();
  for (const o of OPENINGS) {
    const chess = new Chess();
    for (const san of o.sans) assert.doesNotThrow(() => chess.move(san), `${o.name}: ${san}`);
    assert.ok(!names.has(o.name), `duplicate ${o.name}`);
    names.add(o.name);
  }
});

test('opening lookup and continuations', () => {
  assert.equal(identifyOpening(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']).name, 'Ruy Lopez');
  assert.equal(identifyOpening(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6']).name, 'Sicilian: Najdorf');
  assert.equal(identifyOpening(['a3']), null);
  const next = bookContinuations(['e4', 'e5', 'Nf3', 'Nc6']).map(c => c.san);
  for (const san of ['Bb5', 'Bc4', 'd4', 'Nc3', 'c3']) assert.ok(next.includes(san), san);
});
