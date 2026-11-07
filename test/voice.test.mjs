import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../web/vendor/chess.js';
import { resolvePhrase, resolveAlternatives, isSingleMove } from '../web/js/voice.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const legal = fen => new Chess(fen).moves({ verbose: true });
const lans = (text, fen = START, opts) => resolvePhrase(text, legal(fen), opts).map(m => m.lan).sort();
const one = (text, fen, opts) => {
  const got = lans(text, fen, opts);
  assert.equal(got.length, 1, `"${text}" gave ${JSON.stringify(got)}`);
  return got[0];
};

test('squares, pawn moves and from-to phrases', () => {
  assert.equal(one('e4'), 'e2e4');
  assert.equal(one('E4.'), 'e2e4');
  assert.equal(one('pawn to e4'), 'e2e4');
  assert.equal(one('e2 to e4'), 'e2e4');
  assert.equal(one('e2e4'), 'e2e4');
  assert.equal(one('e 2 e 4'), 'e2e4');
  assert.equal(one('e2 2 e4'), 'e2e4'); // "to" heard as "2"
  assert.equal(one('echo two echo four'), 'e2e4');
  assert.equal(one('pawn to d four'), 'd2d4');
  assert.equal(one('move the pawn to a4 please'), 'a2a4');
  const black = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
  assert.equal(one('d7 to d5', black), 'd7d5');
  assert.equal(one('pawn to e5', black), 'e7e5');
  assert.equal(one('d72d5', black), 'd7d5');
});

test('pieces and mishearings', () => {
  assert.equal(one('knight to c3'), 'b1c3');
  assert.equal(one('night to see three'), 'b1c3');
  assert.equal(one('knight f3'), 'g1f3');
  assert.equal(one('Knight to F3'), 'g1f3');
  assert.equal(one('g1 to f3'), 'g1f3');
  assert.deepEqual(lans('knight to e4'), []);
  assert.deepEqual(lans('banana'), []);
  assert.deepEqual(lans('knight'), []); // no destination
});

test('captures', () => {
  const fen = 'rnbqkb1r/pppp1ppp/5n2/4p3/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 1 3';
  assert.equal(one('d takes e5', fen), 'd4e5');
  assert.equal(one('pawn takes e5', fen), 'd4e5');
  assert.equal(one('pawn takes pawn', fen), 'd4e5');
  assert.equal(one('d x e5', fen), 'd4e5');
  assert.equal(one('dxe5', fen), 'd4e5');
  const fen2 = 'rnbqkb1r/pppp1ppp/5n2/4p1B1/4P3/8/PPPP1PPP/RN1QKBNR w KQkq - 2 3';
  assert.equal(one('bishop takes knight', fen2), 'g5f6');
  assert.equal(one('bishop takes f6', fen2), 'g5f6');
  assert.equal(one('bishop takes knight on f6', fen2), 'g5f6');
});

test('left/right follow the board orientation; king/queen side does not', () => {
  // Both knights can reach d2 after d3 and e3? Use a position with two
  // knights that can both reach d2.
  const fen = '4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1';
  assert.deepEqual(lans('knight to d2', fen), ['b1d2', 'f1d2']);
  assert.equal(one('right knight to d2', fen), 'f1d2');
  assert.equal(one('left knight to d2', fen), 'b1d2');
  assert.equal(one('right knight to d2', fen, { orientation: 'b' }), 'b1d2');
  assert.equal(one('left knight to d2', fen, { orientation: 'b' }), 'f1d2');
  assert.equal(one("king's knight to d2", fen, { orientation: 'b' }), 'f1d2');
  assert.equal(one('queens knight to d2', fen), 'b1d2');
  assert.equal(one('knight b to d2', fen), 'b1d2');
  assert.equal(one('knight from b1 to d2', fen), 'b1d2');
  // Opening position as Black, board flipped: "right knight to c6" is the b8 knight.
  const black = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
  assert.equal(one('right knight to c6', black, { orientation: 'b' }), 'b8c6');
});

test('castling', () => {
  const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
  assert.equal(one('castle kingside', fen), 'e1g1');
  assert.equal(one('castles king side', fen), 'e1g1');
  assert.equal(one('short castle', fen), 'e1g1');
  assert.equal(one('O-O', fen), 'e1g1');
  assert.equal(one('castle queenside', fen), 'e1c1');
  assert.equal(one('0-0-0', fen), 'e1c1');
  assert.equal(one('long castle', fen), 'e1c1');
  assert.deepEqual(lans('castle', fen), ['e1c1', 'e1g1']);
  const onlyShort = 'r3k2r/8/8/8/8/8/8/4K2R w Kkq - 0 1';
  assert.equal(one('castle', onlyShort), 'e1g1');
  // "Castle to d1" means the rook.
  assert.equal(one('castle to d1', fen), 'a1d1');
  assert.equal(one('kingside rook to f1', fen), 'h1f1');
});

test('promotion', () => {
  const fen = '8/4P3/8/8/8/8/k7/4K3 w - - 0 1';
  const all = resolvePhrase('e8', legal(fen));
  assert.equal(all.length, 4);
  assert.ok(isSingleMove(all), 'differs only in the promotion piece');
  assert.equal(one('e8 queen', fen), 'e7e8q');
  assert.equal(one('e8 equals knight', fen), 'e7e8n');
  assert.equal(one('pawn to e8 promote to rook', fen), 'e7e8r');
  assert.equal(one('e8=Q', fen), 'e7e8q');
});

test('written notation', () => {
  assert.equal(one('Nf3'), 'g1f3');
  assert.equal(one('Nc3'), 'b1c3');
  const fen = '4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1';
  assert.equal(one('Nbd2', fen), 'b1d2');
  assert.equal(one('Nfd2', fen), 'f1d2');
  const fen2 = 'rnbqkb1r/pppp1ppp/5n2/4p1B1/4P3/8/PPPP1PPP/RN1QKBNR w KQkq - 2 3';
  assert.equal(one('Bxf6', fen2), 'g5f6');
  // Lowercase b is still the b-file.
  assert.equal(one('b4'), 'b2b4');
});

test('alternatives: the first transcript naming one move wins', () => {
  const r = resolveAlternatives(['night to sea tree', 'nice to see you', 'knight to c3'], legal(START));
  assert.equal(r.moves.length, 1);
  assert.equal(r.moves[0].lan, 'b1c3');
  const amb = resolveAlternatives(['hello', 'knight to d2'], legal('4k3/8/8/8/8/8/8/1N2KN2 w - - 0 1'));
  assert.equal(amb.moves.length, 2);
  assert.equal(amb.text, 'knight to d2');
  assert.deepEqual(resolveAlternatives(['hello'], legal(START)).moves, []);
});
