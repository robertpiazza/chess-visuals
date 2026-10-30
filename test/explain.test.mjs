import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../web/vendor/chess.js';
import { parseFen, motifsOfMove, applyUci } from '../web/js/tactics.js';
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

test('forced tactic marker: immediate fork is sound only on a good move', () => {
  const fen = 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1';
  const ratings = rateMoves([{ uci: 'b5c7', score: { cp: 500 }, pv: ['b5c7', 'e8d7', 'c7a8'] }, { uci: 'b5d4', score: { cp: 0 } }]);
  assert.equal(forcedTactic(fen, ratings.get('b5c7')).id, 'fork');
  const bad = rateMoves([{ uci: 'b5c7', score: { cp: -500 } }, { uci: 'b5d4', score: { cp: 200 } }]);
  const unsound = forcedTactic(fen, bad.get('b5c7'));
  assert.equal(unsound.id, 'fork');
  assert.equal(unsound.sound, false);
  assert.match(unsound.reason, /Blunder/);
});

test('forced tactic marker: fork reached through the engine line', () => {
  // 1.Nb5 isn't a tactic itself, but after 1...h6 2.Nc7+ forks king and rook.
  const fen = 'r3k3/7p/8/8/3N4/8/8/4K3 w - - 0 1';
  const ratings = rateMoves([{ uci: 'd4b5', score: { cp: 500 }, pv: ['d4b5', 'h7h6', 'b5c7', 'e8d7', 'c7a8'] }]);
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

test('a fork the engine line does not cash in gets a red (unsound) icon', () => {
  const fen = 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1';
  // Engine line where the rook escapes: no material changes hands.
  const r = rateMoves([{ uci: 'b5c7', score: { cp: 20 }, pv: ['b5c7', 'e8d7', 'c7a8', 'd7c8', 'a8b6', 'c8b7'] }]);
  assert.notEqual(forcedTactic(fen, r.get('b5c7')), null); // knight wins the rook here: still a fork
  const none = rateMoves([{ uci: 'b5c7', score: { cp: 20 }, pv: ['b5c7', 'e8d7'] }]);
  assert.equal(forcedTactic(fen, none.get('b5c7')).sound, false);
  assert.match(forcedTactic(fen, none.get('b5c7')).reason, /doesn't win material/);
});

test('regression: rook on h8 after ...g6 Bb2 is not trapped (Black can block)', () => {
  // 1.e4 c5 2.Nf3 d6 3.b3 Nc6; Stockfish line 4.c4 g6 5.Bb2.
  const fen = 'r1bqkbnr/pp2pppp/2np4/2p5/4P3/1P3N2/P1PP1PPP/RNBQKB1R w KQkq - 1 4';
  const b2 = applyUci(applyUci(parseFen(fen).board, 'c2c4'), 'g7g6');
  assert.ok(!motifsOfMove(b2, 'c1b2').some(m => m.id === 'trap'));
  const r = rateMoves([{ uci: 'c2c4', score: { cp: 40 }, pv: ['c2c4', 'g7g6', 'c1b2', 'f8g7'] }]);
  assert.equal(forcedTactic(fen, r.get('c2c4')), null);
});

test('regression: Nxc2+ fork keeps its icon even when the long engine line gives material back', () => {
  // Black to move; Nxc2+ forks king e1 and rook a1 (c2 is covered by Bf5).
  const fen = 'r2qkbnr/pp2pppp/8/3p1b2/1n1P4/P1N2N2/1PP1QPPP/R1B1KB1R b KQkq - 0 7';
  // Black wins the queen at once, White wins it back seven plies later.
  const r = rateMoves([{ uci: 'b4c2', score: { cp: 40 },
    pv: ['b4c2', 'e2c2', 'f5c2', 'f1b5', 'd8d7', 'b5d7', 'e8d7', 'c3d5', 'g8f6', 'd5f6'] }]);
  assert.equal(forcedTactic(fen, r.get('b4c2'))?.id, 'fork');
});

test('mate threat: Qh5 threatens Qxf7#', () => {
  const ids = motifsOfMove(parseFen('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 2 3').board, 'd1h5');
  assert.ok(ids.some(m => m.id === 'mate-threat' && m.text === 'Threatens mate with Qxf7#'));
});

test('sound sacrifice gets the sacrifice badge and is not called a blunder', () => {
  // Nd6+ puts the knight where the c7 pawn takes it; Rh8+ and Rxa8 win it back with interest.
  const fen = 'r3k3/2p5/8/1N6/8/8/8/4K2R w - - 0 1';
  const r = rateMoves([
    { uci: 'b5d6', score: { cp: 400 }, pv: ['b5d6', 'c7d6', 'h1h8', 'e8e7', 'h8a8'] },
    { uci: 'h1h2', score: { cp: 100 }, pv: ['h1h2'] },
  ]);
  const f = forcedTactic(fen, r.get('b5d6'));
  assert.equal(f.id, 'sacrifice');
  assert.equal(f.sound, true);
  const ex = explainMove(fen, 'b5d6', r);
  assert.match(ex.notes[0].text, /^Sacrifice: gives up the knight and wins the material back/);
  assert.ok(!ex.tactics.some(m => m.id === 'hangs' && m.tone === 'bad'));
  // The same move rated badly is just a hanging piece, no sacrifice.
  const bad = rateMoves([{ uci: 'b5d6', score: { cp: -300 }, pv: ['b5d6', 'c7d6'] }, { uci: 'h1h2', score: { cp: 100 } }]);
  assert.equal(forcedTactic(fen, bad.get('b5d6')), null);
});

test('gain of tempo: 2.Nf3 develops while attacking e5', () => {
  const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
  const r = rateMoves([{ uci: 'g1f3', score: { cp: 30 }, pv: ['g1f3', 'b8c6'] }]);
  const ex = explainMove(fen, 'g1f3', r);
  assert.equal(ex.principles[0].id, 'with-tempo');
  assert.match(ex.principles[0].text, /develops the knight while attacking the undefended pawn on e5/);
});

test('battery: Qc2 behind Bd3 aims at h7', () => {
  const fen = 'r1bq1rk1/ppp2ppp/2n2n2/3p4/3P4/2PB1N2/PP3PPP/RNBQ1RK1 w - - 0 8';
  const ps = principlesOfMove(parseFen(fen).board, 'd1c2', { fen, history: [] });
  assert.ok(ps.some(p => p.id === 'battery' && /queen and bishop lined up on the b1–h7 diagonal toward the king/.test(p.text)));
});

test('battery: doubling rooks on an open file, not when already doubled', () => {
  const fen = '6k1/ppp2ppp/8/8/8/8/R4PPP/4R1K1 w - - 0 1';
  const ps = principlesOfMove(parseFen(fen).board, 'a2e2', { fen, history: [] });
  assert.ok(ps.some(p => p.id === 'battery' && p.text === 'Doubles rooks on the open e-file'));
  // Sliding the front rook up the same file keeps the same battery: not new.
  const doubled = '6k1/ppp2ppp/8/8/8/8/4RPPP/4R1K1 w - - 0 1';
  assert.ok(!principlesOfMove(parseFen(doubled).board, 'e2e4', { fen: doubled, history: [] }).some(p => p.id === 'battery'));
});

test('pawn breaks: Queen\'s Gambit c4 and King\'s Gambit f4, not 1.e4', () => {
  const qg = 'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2';
  assert.ok(principlesOfMove(parseFen(qg).board, 'c2c4', { fen: qg, history: [] })
    .some(p => p.id === 'pawn-break' && p.text === 'Pawn break: challenges the pawn on d5 and strikes at the center'));
  const kg = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
  assert.ok(principlesOfMove(parseFen(kg).board, 'f2f4', { fen: kg, history: [] }).some(p => p.id === 'pawn-break'));
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  assert.ok(!principlesOfMove(parseFen(start).board, 'e2e4', { fen: start, history: [] }).some(p => p.id === 'pawn-break'));
});

test('removing the defender: Bxf6 leaves the d5 rook hanging, unless the recapture guards it again', () => {
  const rd = '4k3/6p1/5n2/3r2B1/8/8/8/3RK3 w - - 0 1';
  assert.ok(motifsOfMove(parseFen(rd).board, 'g5f6').some(m => m.id === 'remove-defender' && /guarding the rook on d5/.test(m.text)));
  // ...Nxf6 retakes and guards d5 again: no removed defender.
  const retake = '4k3/3n4/5n2/3r2B1/8/8/8/3RK3 w - - 0 1';
  assert.ok(!motifsOfMove(parseFen(retake).board, 'g5f6').some(m => m.id === 'remove-defender'));
});

test('overloaded piece: Rb1 leaves the d7 knight guarding both b8 and f6', () => {
  const fen = '1r2k3/3n4/5n2/6B1/8/2N5/8/R3K3 w - - 0 1';
  const m = motifsOfMove(parseFen(fen).board, 'a1b1').find(x => x.id === 'overload');
  assert.equal(m.text, 'Overloads the knight on d7: it alone guards the knight on f6 and rook on b8');
  const r = rateMoves([{ uci: 'a1b1', score: { cp: 300 }, pv: ['a1b1', 'e8e7', 'b1b8', 'd7b8', 'g5f6'] }]);
  assert.equal(forcedTactic(fen, r.get('a1b1')).id, 'overload');
});

test('outpost: Nd5 with no black c- or e-pawn able to chase it; not with a c-pawn that can play ...c6', () => {
  const yes = 'r1bqkb1r/pp3ppp/2np1n2/4p3/4P3/2N5/PPP1NPPP/R1BQKB1R w KQkq - 0 7';
  assert.ok(principlesOfMove(parseFen(yes).board, 'c3d5', { fen: yes, history: [] }).some(p => p.id === 'outpost'));
  const no = 'r1bqkb1r/ppp2ppp/2np1n2/4p3/4P3/2N5/PPP1NPPP/R1BQKB1R w KQkq - 0 7';
  assert.ok(!principlesOfMove(parseFen(no).board, 'c3d5', { fen: no, history: [] }).some(p => p.id === 'outpost'));
});

test('bad bishop: e5 in the French locks d4/e5 on the c1 bishop\'s colour; exd5 and 1.e4 do not', () => {
  const fr = 'rnbqkbnr/ppp2ppp/4p3/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3';
  const bad = principlesOfMove(parseFen(fr).board, 'e4e5', { fen: fr, history: [] }).find(p => p.id === 'bad-bishop');
  assert.match(bad.text, /2 of your pawns are now fixed on the same colour as your bishop on c1/);
  assert.ok(!principlesOfMove(parseFen(fr).board, 'e4d5', { fen: fr, history: [] }).some(p => p.id === 'bad-bishop'));
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  assert.ok(!principlesOfMove(parseFen(start).board, 'e2e4', { fen: start, history: [] }).some(p => p.id === 'bad-bishop'));
});

test('rook and passed pawn: behind your own or the enemy\'s passer is good, in front of your own is bad', () => {
  const ids = (fen, uci) => principlesOfMove(parseFen(fen).board, uci, { fen, history: [] }).filter(p => p.id === 'rook-passer');
  assert.equal(ids('6k1/5ppp/8/3P4/8/8/5PPP/R5K1 w - - 0 1', 'a1d1')[0].tone, 'good');
  assert.equal(ids('6k1/R4ppp/8/3P4/8/8/5PPP/6K1 w - - 0 1', 'a7d7')[0].tone, 'bad');
  assert.match(ids('6k1/5ppp/R7/8/3p4/8/5PPP/6K1 w - - 0 1', 'a6d6')[0].text, /behind the enemy passed pawn on d4/);
  assert.equal(ids('6k1/2p2ppp/8/3P4/8/8/5PPP/R5K1 w - - 0 1', 'a1d1').length, 0); // c7 pawn: d5 isn't passed
});

test('opposition: direct and distant in a pawn ending only', () => {
  const opp = (fen, uci) => principlesOfMove(parseFen(fen).board, uci, { fen, history: [] }).find(p => p.id === 'opposition');
  assert.match(opp('8/8/4k3/8/8/4K3/4P3/8 w - - 0 1', 'e3e4').text, /^Takes the opposition/);
  assert.match(opp('8/8/4k3/8/8/P7/3K4/8 w - - 0 1', 'd2e2').text, /^Takes the distant opposition/);
  assert.equal(opp('8/8/4k3/8/8/4K3/4P3/8 w - - 0 1', 'e3d4'), undefined);
  assert.equal(opp('8/8/4k3/8/8/4K3/4P3/R7 w - - 0 1', 'e3e4'), undefined); // a rook on the board: not a pawn ending
});

test('a rook behind a passed pawn is not called passive', () => {
  const fen = '6k1/5ppp/8/3P4/8/8/5PPP/R5K1 w - - 0 1';
  assert.ok(!principlesOfMove(parseFen(fen).board, 'a1d1', { fen, history: [] }).some(p => p.id === 'passive'));
});
