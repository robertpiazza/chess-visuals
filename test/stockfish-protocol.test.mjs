// Drives StockfishEngine with a fake worker that replays UCI output, to check
// the parsing and the stop/restart sequencing without running the engine.
import test from 'node:test';
import assert from 'node:assert/strict';

class FakeWorker {
  static last = null;
  constructor() { this.sent = []; FakeWorker.last = this; }
  postMessage(cmd) {
    this.sent.push(cmd);
    if (cmd === 'uci') this.reply('id name Stockfish 18', 'uciok');
    if (cmd === 'isready') this.reply('readyok');
    if (cmd === 'stop') this.reply('bestmove e2e4');
  }
  reply(...lines) {
    queueMicrotask(() => lines.forEach(l => this.onmessage({ data: l })));
  }
  terminate() {}
}
globalThis.Worker = FakeWorker;
const { StockfishEngine } = await import('../web/js/engine/engine.js');

const tick = () => new Promise(r => setTimeout(r, 0));

test('collects one score per root move, reports each finished depth', async () => {
  const sf = new StockfishEngine();
  await sf.ready;
  const w = FakeWorker.last;
  const updates = [];
  const done = sf.analyse('startpos-fen', { depth: 2, moveCount: 2 }, (lines, d) => updates.push([d, lines.length]));
  await tick();
  assert.deepEqual(w.sent.slice(-3), ['setoption name MultiPV value 2', 'position fen startpos-fen', 'go depth 2']);
  w.reply(
    'info depth 1 seldepth 1 multipv 1 score cp 30 nodes 20 pv e2e4',
    'info depth 1 seldepth 1 multipv 2 score cp 10 nodes 20 pv a2a3',
    'info depth 2 seldepth 2 multipv 1 score cp 25 lowerbound nodes 50 pv e2e4',
    'info depth 2 seldepth 3 multipv 1 score cp 28 nodes 80 pv e2e4 e7e5',
    'info depth 2 seldepth 3 multipv 2 score mate -3 nodes 80 pv a2a3 d8h4',
    'bestmove e2e4 ponder e7e5',
  );
  const result = await done;
  assert.equal(result.cancelled, false);
  assert.equal(result.depth, 2);
  assert.deepEqual(updates, [[1, 2], [2, 2]]);
  assert.deepEqual(result.lines, [
    { uci: 'e2e4', score: { cp: 28 } },
    { uci: 'a2a3', score: { mate: -3 } },
  ]);
});

test('a new analysis stops the running one first', async () => {
  const sf = new StockfishEngine();
  await sf.ready;
  const w = FakeWorker.last;
  const first = sf.analyse('fen-1', { depth: 20, moveCount: 1 });
  await tick();
  const second = sf.analyse('fen-2', { depth: 3, moveCount: 1 });
  assert.equal((await first).cancelled, true);
  await tick();
  assert.ok(w.sent.includes('stop'));
  assert.equal(w.sent.at(-2), 'position fen fen-2');
  w.reply('info depth 3 multipv 1 score cp 5 pv g1f3', 'bestmove g1f3');
  assert.deepEqual((await second).lines, [{ uci: 'g1f3', score: { cp: 5 } }]);
});
