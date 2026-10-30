// Builds the "why" for a rated move: the tactics it creates, the principles
// it follows or breaks, what the opponent's expected reply does, and what the
// engine's preferred move has that this one lacks.

import { Chess } from '../vendor/chess.js';
import { parseFen, applyUci, motifsOfMove as rawMotifs, sqIndex, materialBalance, enPrise, VALUE, NAME } from './tactics.js';
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
  sacrifice: { letter: '!', glyph: 'sacrifice', label: 'Sacrifice' },
};

// Threats that, combined with a developing or improving move, gain a tempo.
const TEMPO_THREATS = {
  check: () => 'giving check',
  'disc-check': () => 'giving check',
  'double-check': () => 'giving check',
  'mate-threat': () => 'threatening mate',
  threat: m => m.text.replace(/^Attacks/, 'attacking'),
  fork: () => 'forking two pieces',
  pin: () => 'pinning a piece',
  skewer: () => 'setting up a skewer',
  discovered: () => 'opening a discovered attack',
};
// In order of preference for naming what the move improves.
const IMPROVEMENTS = ['develop', 'castle', 'active', 'open-file', 'seventh', 'center', 'king-active'];

const SOUND = new Set(['best', 'good']);
const CLASSES_LABEL = { best: 'Best', good: 'Good', inaccuracy: 'an Inaccuracy', mistake: 'a Mistake', blunder: 'a Blunder' };

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

// Tactics for one move depend only on the position, not on engine depth, so
// they're cached; badges and explanations are recomputed on every update.
const motifCache = new Map();
function motifsOfMove(board, uci) {
  const key = board.map(p => (p ? p.color + p.type : '-')).join('') + uci;
  let hit = motifCache.get(key);
  if (!hit) {
    if (motifCache.size > 5000) motifCache.clear();
    hit = rawMotifs(board, uci);
    motifCache.set(key, hit);
  }
  return hit;
}

// Material the engine's line wins for us, in pawns: Infinity for a line
// that mates, -Infinity for one that gets mated. `at` is the index in the
// line of the move that creates the tactic (0 for the move itself, 2 for our
// follow-up). Material is checked after each of the opponent's next four
// replies, so recaptures are counted, and the best of those counts. Looking
// only at the end of a long engine line would let later, unrelated trades
// hide a fork that clearly won something.
export function lineGain(board, rating, at = 0) {
  if (rating.score.mate != null) return rating.score.mate > 0 ? Infinity : -Infinity;
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
    return -Infinity;
  }
  return best - start;
}

// Does the line back the tactic up: a mate, or at least two pawns won.
export function lineWins(board, rating, at = 0) {
  return lineGain(board, rating, at) >= 2;
}

// A sound sacrifice: the move gives up material (the moved piece can be
// taken, or it captures something worth less), yet the engine rates it Best
// or Good. Its line either mates, wins the material back, or the engine
// values the pressure enough without winning it back.
function sacrificeOf(fen, board, rating) {
  if (!SOUND.has(rating.cls)) return null;
  const to = sqIndex(rating.uci.slice(2, 4));
  const given = motifsOfMove(board, rating.uci)
    .find(m => m.id === 'loses' || (m.id === 'hangs' && m.arrows.some(a => a[1] === to)));
  if (!given) return null;
  const piece = NAME[board[sqIndex(rating.uci.slice(0, 2))].type];
  const gain = lineGain(board, rating);
  let text;
  if (gain === Infinity) {
    text = `Sacrifice: gives up the ${piece}, and the engine's line ends in mate`;
  } else if (gain >= 0) {
    text = `Sacrifice: gives up the ${piece} and wins the material back: ${sanLine(fen, rating.pv.slice(0, 6)).join(' ')}`;
  } else {
    text = `Sacrifice: gives up the ${piece} for lasting pressure; the engine still rates it ${CLASSES_LABEL[rating.cls]}`;
  }
  return {
    ...TACTIC_ICONS.sacrifice, id: 'sacrifice', when: 'now', sound: true, given,
    motif: { id: 'sacrifice', tone: 'good', text, arrows: [] },
  };
}

// The forced tactic a move carries, if any: created by the move itself, or
// by our follow-up in the engine's line after the opponent's best reply.
// A sound tactic (`sound: true`) needs a move rated Best or Good and an
// engine line that shows it paying off: winning material or mating. An
// immediate pin counts as soon as it exists, since the pin itself is the
// result. A tactic the move creates right away that fails either test is
// still returned with `sound: false` and a `reason`, so the board can mark it
// as a tempting idea that doesn't work.
export function forcedTactic(fen, rating) {
  const { board } = parseFen(fen);
  const motifs = motifsOfMove(board, rating.uci).filter(m => TACTIC_ICONS[m.id]);
  const pin = motifs.find(m => m.id === 'pin');
  const others = motifs.filter(m => m.id !== 'pin');
  const sound = SOUND.has(rating.cls);
  const wins = others.length > 0 && lineWins(board, rating);
  const icon = (m, extra) => ({ ...TACTIC_ICONS[m.id], id: m.id, when: 'now', motif: m, sound: true, ...extra });

  if (sound) {
    const now = wins ? others[0] : pin;
    if (now) return icon(now);
    const sac = sacrificeOf(fen, board, rating);
    if (sac) return sac;
    const later = followUpTactic(board, rating);
    if (later) return later;
  }
  const shown = others[0] ?? pin;
  if (!shown) return null;
  const label = CLASSES_LABEL[rating.cls] ?? rating.cls;
  return icon(shown, {
    sound: false,
    reason: sound ? 'the engine\'s line doesn\'t win material from it' : `the engine rates the move ${label}`,
  });
}

// A tactic on our next move in the engine line, after the opponent's reply.
function followUpTactic(board, rating) {
  const [, reply, follow] = rating.pv;
  if (!reply || !follow) return null;
  try {
    const b2 = applyUci(applyUci(board, rating.uci), reply);
    if (b2[sqIndex(follow.slice(0, 2))]?.color !== board[sqIndex(rating.uci.slice(0, 2))].color) return null;
    const later = motifsOfMove(b2, follow).find(m => TACTIC_ICONS[m.id]);
    if (later && lineWins(board, rating, 2)) {
      return { ...TACTIC_ICONS[later.id], id: later.id, when: 'next', motif: later, sound: true, line: [rating.uci, reply, follow] };
    }
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
  let principles = principlesOfMove(board, uci, { fen, history });
  const notes = [];
  const arrows = tactics.flatMap(m => m.arrows.map(a => ({ from: a[0], to: a[1], tone: m.tone })));

  const forced = rating ? forcedTactic(fen, rating) : null;
  if (forced && !forced.sound) {
    // Draw the tactic that doesn't work in red, matching its badge.
    for (const a of arrows) if (forced.motif.arrows.some(m => m[0] === a.from && m[1] === a.to)) a.tone = 'bad';
    notes.push({ tone: 'bad', text: `The ${forced.label.toLowerCase()} is there, but it doesn't pay off: ${forced.reason}` });
  }
  if (forced?.id === 'sacrifice') {
    notes.push({ tone: 'good', text: forced.motif.text });
    // The material it gives up is the point, not a mistake.
    const given = forced.given.arrows.map(a => `${a[0]}-${a[1]}`);
    tactics = tactics.map(m => (m.id === forced.given.id && m.text === forced.given.text ? { ...m, tone: 'neutral' } : m));
    for (const a of arrows) if (given.includes(`${a.from}-${a.to}`)) a.tone = 'neutral';
  }
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

  // Positional drawbacks don't matter in a line that forces mate.
  if (rating?.score.mate > 0) principles = principles.filter(p => p.tone !== 'bad');

  // Gain of tempo: the move improves a piece and makes a threat the opponent
  // has to answer, as long as it doesn't just give material away.
  const threat = tactics.find(m => TEMPO_THREATS[m.id] && m.tone !== 'bad');
  const improves = IMPROVEMENTS.map(id => principles.find(p => p.id === id)).find(Boolean);
  const givesAway = tactics.some(m => (m.id === 'hangs' || m.id === 'loses') && m.tone === 'bad');
  if (threat && improves && !givesAway && forced?.sound !== false) {
    principles = [
      { id: 'with-tempo', tone: 'good', text: `Gains a tempo: ${lowerFirst(improves.text)} while ${TEMPO_THREATS[threat.id](threat)}, so the opponent has to respond` },
      // Moving a piece twice isn't a waste when it comes with a threat.
      ...principles.filter(p => p.id !== 'tempo'),
    ];
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
    if (bestForced?.sound && bestForced.when === 'next' && !mine.has(bestForced.id)) reasons.unshift(`forces a ${bestForced.label.toLowerCase()}`);
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
