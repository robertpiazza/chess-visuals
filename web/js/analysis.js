// Turns raw engine output (one score per legal move) into ratings the board
// can draw: a win-probability for each move, how much worse it is than the
// best move, and a quality class.

// Lichess's centipawn → win% curve.
export function winPercent(score) {
  if (score.mate != null) return score.mate > 0 ? 100 : 0;
  const cp = Math.max(-1500, Math.min(1500, score.cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

// Classes ordered best → worst. `maxLoss` is the largest drop in win% (versus
// the best move) a move can have and still fall in the class. Best is only
// for moves with exactly the engine's top score (see rateMoves).
export const CLASSES = [
  { id: 'best',       label: 'Best',       symbol: '',   maxLoss: 0 },
  { id: 'good',       label: 'Good',       symbol: '',   maxLoss: 6 },
  { id: 'inaccuracy', label: 'Inaccuracy', symbol: '?!', maxLoss: 12 },
  { id: 'mistake',    label: 'Mistake',    symbol: '?',  maxLoss: 22 },
  { id: 'blunder',    label: 'Blunder',    symbol: '??', maxLoss: Infinity },
];

export const CLASS_INDEX = Object.fromEntries(CLASSES.map((c, i) => [c.id, i]));

// Class for a move that isn't tied with the top move.
export function classify(loss) {
  return CLASSES.slice(1).find(c => loss <= c.maxLoss).id;
}

// Comparable number for sorting scores, higher = better for the mover.
// Faster mates rank above slower ones; being mated later ranks above sooner.
export function scoreKey(score) {
  if (score.mate != null) {
    return score.mate > 0 ? 100000 - score.mate : -100000 - score.mate;
  }
  return score.cp;
}

export function formatScore(score) {
  if (score.mate != null) return (score.mate > 0 ? '#' : '#-') + Math.abs(score.mate);
  const pawns = score.cp / 100;
  return (pawns > 0 ? '+' : '') + pawns.toFixed(1);
}

// lines: [{ uci, score: { cp } | { mate }, pv? }] from the side to move's view.
// pv, when present, is the expected line starting with this move.
// Returns Map uci → rating.
export function rateMoves(lines) {
  if (!lines.length) return new Map();
  const sorted = [...lines].sort((a, b) => scoreKey(b.score) - scoreKey(a.score));
  const bestWin = winPercent(sorted[0].score);
  const map = new Map();
  sorted.forEach((line, rank) => {
    const win = winPercent(line.score);
    const loss = Math.max(0, bestWin - win);
    map.set(line.uci, {
      uci: line.uci,
      from: line.uci.slice(0, 2),
      to: line.uci.slice(2, 4),
      promotion: line.uci[4] || null,
      score: line.score,
      pv: line.pv ?? [line.uci],
      win,
      loss,
      rank,
      // Best means the engine's top score or tied with it, nothing broader.
      cls: scoreKey(line.score) === scoreKey(sorted[0].score) ? 'best' : classify(loss),
    });
  });
  return map;
}

// Groups ratings by origin square. For each piece: its moves sorted best →
// worst, its best move, and how many moves fall in each class.
export function summarizePieces(ratings) {
  const byFrom = new Map();
  for (const r of ratings.values()) {
    if (!byFrom.has(r.from)) byFrom.set(r.from, []);
    byFrom.get(r.from).push(r);
  }
  const summary = new Map();
  for (const [from, moves] of byFrom) {
    moves.sort((a, b) => a.rank - b.rank);
    const counts = Object.fromEntries(CLASSES.map(c => [c.id, 0]));
    for (const m of moves) counts[m.cls]++;
    summary.set(from, { from, moves, best: moves[0], counts });
  }
  return summary;
}

// For a selected piece: one entry per destination square. Promotions collapse
// to the best promotion choice, with the others kept in `options`.
export function destinationsFor(pieceSummary) {
  const dest = new Map();
  for (const m of pieceSummary.moves) {
    const cur = dest.get(m.to);
    if (!cur) dest.set(m.to, { ...m, options: [m] });
    else cur.options.push(m);
  }
  return dest;
}
