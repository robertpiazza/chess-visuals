// Builds the "why" for a rated move: the tactics it creates, the principles
// it follows or breaks, what the opponent's expected reply does, and what the
// engine's preferred move has that this one lacks.

import { Chess } from '../vendor/chess.js';
import { parseFen, applyUci, motifsOfMove, sqIndex, materialBalance, enPrise, VALUE } from './tactics.js';
import { principlesOfMove } from './principles.js';
import { formatScore } from './analysis.js';

// Tactics that get a marker on the board when a move forces them.
export const TACTIC_ICONS = {
  fork: { letter: 'F', glyph: 'fork', label: 'Fork' },
  pin: { letter: 'P', glyph: 'pin', label: 'Pin' },
  skewer: { letter: 'S', glyph: 'skewer', label: 'Skewer' },
  discovered: { letter: 'D', glyph: 'discovered', label: 'Discovered attack' },
  'disc-check': { letter: 'D', glyph: 'discovered', label: 'Discovered check' },
  'double-check': { letter: 'D', glyph: 'discovered', label: 'Double check' },
  trap: { letter: 'T', glyph: 'trap', label: 'Trapped piece' },
};

const SOUND = new Set(['best', 'good']);

export function sanLine(fen, ucis) {
  const chess = new Chess(fen);
  const out = [];
  for (const u of ucis) {
    try {
      out.push(chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san);
    } catch {
      break;
    }
  }
  return out;
}

const lowerFirst = s => s[0].toLowerCase() + s.slice(1);

// Does the engine's own line back the tactic up: a mate, or at least two
// pawns of material won in the moves right after it. `at` is the index in the
// line of the move that creates the tactic (0 for the move itself, 2 for our
// follow-up). Material is checked after each of the opponent's next four
// replies, so recaptures are counted, and the best of those counts. Looking
// only at the end of a long engine line would let later, unrelated trades
// hide a fork that clearly won something.
export function lineWins(board, rating, at = 0) {
  if (rating.score.mate != null) return rating.score.mate > 0;
  const us = board[sqIndex(rating.uci.slice(0, 2))].color;
  const start = materialBalance(board, us);
  const window = at + 8;
  let b = board;
  let best = -Infinity;
  try {
    rating.pv.slice(0, window).forEach((uci, i) => {
      const to = sqIndex(uci.slice(2, 4));
      const captured = b[to];
      b = applyUci(b, uci);
      if (i <= at) return;
      // Settled after the opponent's reply.
      if (i % 2 === 1) best = Math.max(best, materialBalance(b, us));
      // A line that stops on our capture: count the piece as lost if it can
      // simply be taken back.
      else if (i === Math.min(rating.pv.length, window) - 1) {
        let end = materialBalance(b, us);
        if (captured && enPrise(b, to)) end -= VALUE[b[to].type];
        best = Math.max(best, end);
      }
    });
  } catch {
    return false;
  }
  return best - start >= 2;
}

// The forced tactic a move carries, if any: created by the move itself, or
// by our follow-up in the engine's line after the opponent's best reply.
// Only sound moves (rated Best or Good) qualify, and the engine's line has to
// show the tactic paying off: winning material or mating. An immediate pin
// counts as soon as it exists, since the pin itself is the result.
export function forcedTactic(fen, rating) {
  if (!SOUND.has(rating.cls)) return null;
  const { board } = parseFen(fen);
  const motifs = motifsOfMove(board, rating.uci).filter(m => TACTIC_ICONS[m.id]);
  const pin = motifs.find(m => m.id === 'pin');
  const others = motifs.filter(m => m.id !== 'pin');
  const now = others.length && lineWins(board, rating) ? others[0] : pin;
  if (now) return { ...TACTIC_ICONS[now.id], id: now.id, when: 'now', motif: now };
  const [, reply, follow] = rating.pv;
  if (!reply || !follow) return null;
  try {
    const b2 = applyUci(applyUci(board, rating.uci), reply);
    if (b2[sqIndex(follow.slice(0, 2))]?.color !== board[sqIndex(rating.uci.slice(0, 2))].color) return null;
    const later = motifsOfMove(b2, follow).find(m => TACTIC_ICONS[m.id]);
    if (later && lineWins(board, rating, 2)) return { ...TACTIC_ICONS[later.id], id: later.id, when: 'next', motif: later, line: [rating.uci, reply, follow] };
  } catch {
    return null;
  }
  return null;
}

// fen: position before the move. ratings: Map from analysis.rateMoves.
// history: chess.js verbose history up to this position (may be empty).
export function explainMove(fen, uci, ratings, history = []) {
  const { board } = parseFen(fen);
  const rating = ratings.get(uci);
  const [san] = sanLine(fen, [uci]);
  let tactics = motifsOfMove(board, uci);
  const principles = principlesOfMove(board, uci, { fen, history });
  const notes = [];
  const arrows = tactics.flatMap(m => m.arrows.map(a => ({ from: a[0], to: a[1], tone: m.tone })));

  const forced = rating ? forcedTactic(fen, rating) : null;
  if (forced?.when === 'next') {
    const sans = sanLine(fen, forced.line);
    notes.push({ tone: 'good', text: `Forces a ${forced.label.toLowerCase()}: after ${sans[1]}, ${sans[2]} — ${lowerFirst(forced.motif.text)}` });
    for (const a of forced.motif.arrows) arrows.push({ from: a[0], to: a[1], tone: 'good', dashed: true });
  }

  // What the opponent's expected reply does, when this move is a real error.
  if (rating && rating.loss >= 6 && rating.pv[1]) {
    const reply = rating.pv[1];
    const afterMove = applyUci(board, uci);
    const replySan = sanLine(fen, [uci, reply])[1];
    const theirs = motifsOfMove(afterMove, reply).filter(m => m.tone === 'good');
    // "Can be taken" is redundant when the reply is that capture.
    const replyTo = sqIndex(reply.slice(2, 4));
    tactics = tactics.filter(m => !(m.id === 'hangs' && m.arrows.some(a => a[1] === replyTo)));
    if (theirs.length) {
      for (const m of theirs.slice(0, 2)) {
        notes.push({ tone: 'bad', text: `Allows ${replySan}: ${lowerFirst(m.text)}` });
        for (const a of m.arrows) arrows.push({ from: a[0], to: a[1], tone: 'bad', dashed: true });
      }
    } else {
      notes.push({ tone: 'bad', text: `Expected reply: ${replySan}` });
      arrows.push({ from: sqIndex(reply.slice(0, 2)), to: sqIndex(reply.slice(2, 4)), tone: 'bad', dashed: true });
    }
  }

  // Compare with the engine's choice.
  let comparison = null;
  if (rating && rating.rank > 0) {
    const best = [...ratings.values()].find(r => r.rank === 0);
    const bestSan = sanLine(fen, [best.uci])[0];
    const mine = new Set([...tactics, ...principles].filter(m => m.tone === 'good').map(m => m.id));
    const bestTactics = motifsOfMove(board, best.uci);
    const bestPrinciples = principlesOfMove(board, best.uci, { fen, history });
    const reasons = [...bestTactics, ...bestPrinciples]
      .filter(m => m.tone === 'good' && !mine.has(m.id))
      .map(m => lowerFirst(m.text));
    const bestForced = forcedTactic(fen, best);
    if (bestForced?.when === 'next' && !mine.has(bestForced.id)) reasons.unshift(`forces a ${bestForced.label.toLowerCase()}`);
    const line = sanLine(fen, best.pv.slice(0, 4)).join(' ');
    comparison = {
      san: bestSan,
      uci: best.uci,
      text: rating.cls === 'best'
        ? `Rated Best along with the engine's top choice, ${bestSan} (${formatScore(best.score)}).`
        : `Engine prefers ${bestSan} (${formatScore(best.score)} vs ${formatScore(rating.score)})` +
        (reasons.length
          ? `. What it does that yours doesn't: ${[...new Set(reasons)].slice(0, 3).join('; ')}.`
          : `. The difference shows in the follow-up: ${line}.`),
    };
  }

  return { uci, san, rating, tactics, principles, notes, comparison, forced, arrows };
}
