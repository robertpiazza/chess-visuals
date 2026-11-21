import test from 'node:test';
import assert from 'node:assert/strict';
import { roomCode, parseCode, movesList, otherColor, CODE_CHARS } from '../web/js/online.js';

test('room codes are six unambiguous characters', () => {
  for (let i = 0; i < 50; i++) {
    const code = roomCode();
    assert.equal(code.length, 6);
    assert.ok([...code].every(c => CODE_CHARS.includes(c)));
  }
  assert.ok(!/[IO01]/.test(CODE_CHARS));
});

test('parseCode accepts typed codes and invite links', () => {
  assert.equal(parseCode('abc-def'), 'ABCDEF');
  assert.equal(parseCode(' xyz 234 '), 'XYZ234');
  assert.equal(parseCode('https://robertpiazza.com/chess-visuals/?room=QWE789'), 'QWE789');
  assert.equal(parseCode('ABCDE'), null);
  assert.equal(parseCode('ABCDE0'), null); // 0 is never used
  assert.equal(parseCode(''), null);
});

test('movesList keeps plies in order and stops at a gap', () => {
  const m = ply => ({ uci: `m${ply}`, color: ply % 2 ? 'b' : 'w' });
  assert.deepEqual(movesList(null), []);
  assert.deepEqual(movesList([m(0), m(1)]).map(x => x.uci), ['m0', 'm1']);
  assert.deepEqual(movesList({ 0: m(0), 1: m(1), 3: m(3) }).map(x => x.uci), ['m0', 'm1']);
  assert.deepEqual(movesList({ 1: m(1) }), []);
});

test('otherColor', () => {
  assert.equal(otherColor('w'), 'b');
  assert.equal(otherColor('b'), 'w');
});
