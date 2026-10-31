import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../web/vendor/chess.js';
import { MoveTree } from '../web/js/tree.js';

function play(tree, parent, sans) {
  const chess = new Chess(parent.fen);
  let n = parent;
  for (const san of sans) n = tree.add(n, chess.move(san));
  return n;
}

test('first move from a position is the main line; later ones are variations', () => {
  const t = new MoveTree(new Chess().fen());
  const e4 = play(t, t.root, ['e4']);
  const d4 = play(t, t.root, ['d4']);
  assert.equal(t.root.children[0], e4);
  assert.equal(t.root.children[1], d4);
  assert.ok(t.isMainline(e4));
  assert.ok(!t.isMainline(d4));
  // Playing e4 again reuses the node.
  assert.equal(play(t, t.root, ['e4']), e4);
});

test('back and forward retrace the branch you were on', () => {
  const t = new MoveTree(new Chess().fen());
  const main = play(t, t.root, ['e4', 'e5', 'Nf3']);
  const e5 = main.parent;
  const side = play(t, e5, ['Bc4', 'Nc6']); // variation after 1.e4 e5
  t.goTo(side);
  t.goTo(side.parent);          // back
  t.goTo(e5);                   // back again
  assert.equal(t.next(), side.parent, 'forward goes into the variation just left');
  t.goTo(main);                 // jump to the main line
  t.goTo(e5);
  assert.equal(t.next(), main, 'after visiting the main line, forward follows it');
  assert.equal(t.end(t.root), main);
  assert.deepEqual(t.path(side).map(n => n.move.san), ['e4', 'e5', 'Bc4', 'Nc6']);
});

test('an engine line never becomes the main line, until you play its move yourself', () => {
  const t = new MoveTree(new Chess().fen());
  const end = play(t, t.root, ['e4', 'e5']);
  const chess = new Chess(end.fen);
  const eng = t.add(end, chess.move('Nf3'), { engine: true });
  assert.equal(t.main(end), null, 'engine move alone is not the main line');
  assert.equal(t.next(end), eng, 'but forward can still step into it');
  // A real move played later becomes the main line.
  const real = t.add(end, new Chess(end.fen).move('Bc4'));
  assert.equal(t.main(end), real);
  assert.ok(!t.isMainline(eng));
  // Playing the engine move yourself turns it into a played move.
  t.add(end, new Chess(end.fen).move('Nf3'));
  assert.equal(eng.engine, false);
});
