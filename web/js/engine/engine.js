// Two engines behind one interface:
//
//   engine.analyse(fen, { depth, moveCount }, onUpdate) → Promise<{ lines, depth }>
//
// `lines` holds one { uci, score } per legal move, scored from the side to
// move's point of view. onUpdate(lines, depth) fires as deeper results arrive.
// Starting a new analysis cancels the previous one; the cancelled promise
// resolves with `cancelled: true`.

const STOCKFISH_URL = new URL('../../vendor/stockfish/stockfish-18-lite-single.js', import.meta.url);
const BUILTIN_URL = new URL('./builtin-worker.js', import.meta.url);

export class StockfishEngine {
  name = 'Stockfish 18 (lite)';

  constructor() {
    this.worker = new Worker(STOCKFISH_URL);
    this.listeners = new Set();
    this.worker.onmessage = e => {
      const line = typeof e.data === 'string' ? e.data : '';
      for (const fn of this.listeners) fn(line);
    };
    this.job = null;      // analysis currently running in the engine
    this.pending = null;  // next analysis, waiting for the engine to stop
    this.ready = new Promise((resolve, reject) => {
      this.worker.onerror = err => reject(err);
      const timer = setTimeout(() => reject(new Error('Stockfish did not start')), 45000);
      const onLine = line => {
        if (line === 'uciok') this.send('isready');
        if (line === 'readyok') {
          clearTimeout(timer);
          this.listeners.delete(onLine);
          this.listeners.add(l => this.onLine(l));
          resolve();
        }
      };
      this.listeners.add(onLine);
      this.send('uci');
    });
  }

  send(cmd) {
    this.worker.postMessage(cmd);
  }

  analyse(fen, { depth = 14, moveCount = 1 }, onUpdate) {
    return new Promise(resolve => {
      const job = { fen, depth, moveCount, onUpdate, resolve, scores: new Map(), depthDone: 0 };
      if (this.pending) this.pending.resolve({ lines: [], depth: 0, cancelled: true });
      this.pending = job;
      if (this.job) {
        if (!this.job.stopping) {
          this.job.stopping = true;
          this.send('stop');
        }
      } else {
        this.startPending();
      }
    });
  }

  startPending() {
    const job = this.pending;
    this.pending = null;
    if (!job) return;
    this.job = job;
    this.send(`setoption name MultiPV value ${Math.max(1, Math.min(500, job.moveCount))}`);
    this.send(`position fen ${job.fen}`);
    this.send(`go depth ${job.depth}`);
  }

  onLine(line) {
    const job = this.job;
    if (!job) return;
    if (line.startsWith('info ') && line.includes(' pv ') && !line.includes('bound')) {
      const depth = +line.match(/ depth (\d+)/)[1];
      const multipv = +(line.match(/ multipv (\d+)/)?.[1] ?? 1);
      const cp = line.match(/ score cp (-?\d+)/);
      const mate = line.match(/ score mate (-?\d+)/);
      const uci = line.match(/ pv (\S+)/)[1];
      const score = mate ? { mate: +mate[1] } : { cp: +cp[1] };
      // "mate 0" means the side to move is already mated; no moves to rate.
      if (mate && +mate[1] === 0) return;
      job.scores.set(uci, { uci, score, depth });
      if (multipv >= job.moveCount && !job.stopping) {
        job.depthDone = depth;
        job.onUpdate?.(this.lines(job), depth);
      }
    } else if (line.startsWith('bestmove')) {
      this.job = null;
      job.resolve({ lines: this.lines(job), depth: job.depthDone, cancelled: !!job.stopping });
      this.startPending();
    }
  }

  lines(job) {
    return [...job.scores.values()].map(({ uci, score }) => ({ uci, score }));
  }
}

export class BuiltinEngine {
  name = 'Built-in (fallback)';
  ready = Promise.resolve();

  constructor() {
    this.worker = null;
    this.job = null;
  }

  analyse(fen, { depth = 5, timeMs = 2500 }, onUpdate) {
    // The search can't be interrupted mid-run, so cancelling means replacing
    // the worker.
    if (this.job) {
      this.worker.terminate();
      this.worker = null;
      this.job.resolve({ ...this.job.last, cancelled: true });
    }
    if (!this.worker) this.worker = new Worker(BUILTIN_URL, { type: 'module' });
    return new Promise(resolve => {
      const job = { resolve, last: { lines: [], depth: 0 } };
      this.job = job;
      this.worker.onmessage = ({ data }) => {
        if (this.job !== job) return;
        job.last = { lines: data.lines, depth: data.depth };
        if (data.type === 'update') onUpdate?.(data.lines, data.depth);
        else {
          this.job = null;
          resolve(job.last);
        }
      };
      this.worker.postMessage({ fen, maxDepth: Math.min(depth, 6), timeMs });
    });
  }
}

// Prefers Stockfish; falls back to the built-in search if it can't start.
export async function createEngine(preference = 'stockfish') {
  if (preference === 'stockfish' && typeof WebAssembly === 'object') {
    try {
      const sf = new StockfishEngine();
      await sf.ready;
      return sf;
    } catch (err) {
      console.warn('Stockfish unavailable, using built-in engine:', err);
    }
  }
  return new BuiltinEngine();
}
