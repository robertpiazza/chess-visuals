// Spoken or typed move phrases → legal moves.
//
// Handles "e4", "pawn to e5", "d7 to d5", "e2e4", "knight c3", "knight takes
// f6", "e takes d5", "bishop takes knight", "right knight to c3", "queen's
// rook to d1", "castle kingside", "O-O-O", "e8 queen", "promote to knight",
// NATO letters ("echo four") and common mishearings ("night", "see", "for").
//
// resolvePhrase(text, legalMoves, { orientation }) returns the chess.js
// verbose moves the phrase can mean: one for a clear phrase, several when it
// is ambiguous (or differs only in the promotion piece), none if it names no
// legal move. Left and right are from the viewer's side of the board.

const PIECES = {
  pawn: 'p', pawns: 'p', pond: 'p', pon: 'p', paun: 'p', porn: 'p',
  knight: 'n', knights: 'n', night: 'n', nights: 'n', nite: 'n', horse: 'n', n: 'n',
  bishop: 'b', bishops: 'b',
  rook: 'r', rooks: 'r', rock: 'r', rocks: 'r', ruk: 'r',
  queen: 'q', queens: 'q', quinn: 'q', q: 'q',
  king: 'k', kings: 'k', k: 'k',
};
// Words that always name a file.
const FILES = {
  b: 'b', be: 'b', bee: 'b', c: 'c', see: 'c', sea: 'c', si: 'c', d: 'd', dee: 'd',
  e: 'e', ee: 'e', f: 'f', ef: 'f', eff: 'f', g: 'g', gee: 'g', ji: 'g', jee: 'g',
  h: 'h', aitch: 'h', age: 'h',
  alpha: 'a', alfa: 'a', bravo: 'b', charlie: 'c', delta: 'd', echo: 'e', foxtrot: 'f', golf: 'g', hotel: 'h',
};
// Words that name a file only when a rank follows ("a knight" vs "a4").
const WEAK_FILES = { a: 'a', ay: 'a', hey: 'a', he: 'e', the: 'd' };
const RANKS = {
  1: 1, one: 1, won: 1, 3: 3, three: 3, tree: 3, free: 3, 4: 4, four: 4, for: 4, fore: 4,
  5: 5, five: 5, 6: 6, six: 6, sicks: 6, 7: 7, seven: 7, 8: 8, eight: 8, ate: 8,
};
// "to", "too", "two" and "2" can each be the rank 2 or the word "to".
const TO_OR_TWO = new Set(['to', 'too', 'two', '2']);
const WORDS = {
  takes: 'cap', take: 'cap', captures: 'cap', capture: 'cap', x: 'cap', taking: 'cap', by: 'cap',
  castle: 'castle', castles: 'castle', castling: 'castle',
  kingside: 'kside', short: 'kside', queenside: 'qside', long: 'qside',
  promote: 'promo', promotes: 'promo', promoting: 'promo', promotion: 'promo', equals: 'promo', becomes: 'promo',
  left: 'left', right: 'right', write: 'right', rite: 'right',
};

// Text → candidate token lists (one per reading of each to/two).
export function tokenize(text) {
  // Written notation: a capital piece letter starts a move ("Nf3", "Bxf6",
  // "Nbd2"). Lowercased, "b" would read as the b-file.
  const SAN = { N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' };
  let s = ` ${text.replace(/\b([NBRQK])(?=[a-h1-8x]*[1-8]\b)/g, (_, p) => ` ${SAN[p]} `).toLowerCase()} `
    .replace(/[’']/g, '')
    .replace(/\b[o0](-[o0]){2}\b/g, ' castle queenside ')
    .replace(/\b[o0]-[o0]\b/g, ' castle kingside ')
    .replace(/\bking\s*side\b/g, ' kingside ')
    .replace(/\bqueen\s*side\b/g, ' queenside ')
    .replace(/=/g, ' equals ')
    .replace(/[^a-z0-9 ]+/g, ' ');
  // Split letter/digit runs like "e4", "e2e4", "d72d5", "exd5" into single
  // characters.
  s = s.replace(/\b(?=[a-hx1-8]*\d)[a-hx1-8]{2,7}\b/g, m => m.split('').join(' '));
  const words = s.split(/\s+/).filter(Boolean);
  let readings = [[]];
  for (const w of words) {
    let options;
    if (TO_OR_TWO.has(w)) options = [{ t: 'to' }, { t: 'rank', v: 2 }];
    else if (w in PIECES) options = [{ t: 'piece', v: PIECES[w] }];
    else if (w in FILES) options = [{ t: 'file', v: FILES[w] }];
    else if (w in WEAK_FILES) options = [{ t: 'file', v: WEAK_FILES[w], weak: true }];
    else if (w in RANKS) options = [{ t: 'rank', v: RANKS[w] }];
    else if (w in WORDS) options = [{ t: WORDS[w] }];
    else continue; // filler: "move", "my", "please", "check", ...
    readings = readings.flatMap(r => options.map(o => [...r, o]));
    if (readings.length > 64) readings = readings.slice(0, 64);
  }
  return readings;
}

// One token list → a move description, or null if it doesn't read as one.
export function parseTokens(tokens) {
  // Join file + rank into squares; a weak file needs a rank after it.
  const items = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.t === 'file' && tokens[i + 1]?.t === 'rank') {
      items.push({ t: 'square', v: tok.v + tokens[i + 1].v });
      i++;
    } else if (tok.t === 'file' && tok.weak) {
      continue;
    } else if (tok.t === 'rank') {
      return null; // a rank with no file
    } else {
      items.push(tok);
    }
  }
  const spec = {};
  const squares = [];
  let promoNext = false;
  for (let i = 0; i < items.length; i++) {
    const it = items[i], next = items[i + 1];
    switch (it.t) {
      case 'castle': spec.castle = true; break;
      case 'kside': spec.side = 'k'; break;
      case 'qside': spec.side = 'q'; break;
      case 'left': spec.side = 'l'; break;
      case 'right': spec.side = 'r'; break;
      case 'cap': spec.capture = true; break;
      case 'to': break;
      case 'promo': promoNext = true; break;
      case 'square': squares.push(it.v); break;
      case 'file':
        if (squares.length || spec.capture) { if (spec.toFile) return null; spec.toFile = it.v; }
        else { if (spec.fromFile) return null; spec.fromFile = it.v; }
        break;
      case 'piece':
        if (promoNext || (squares.length && !spec.capture) || (squares.length && spec.piece)) {
          if (spec.promotion || it.v === 'p' || it.v === 'k') return null;
          spec.promotion = it.v;
          promoNext = false;
        } else if (!spec.piece && !squares.length && !spec.capture && (it.v === 'k' || it.v === 'q') && next?.t === 'piece' && next.v !== 'p') {
          spec.side = it.v; // "king's knight", "queen's rook"
        } else if (!spec.piece && !squares.length && !spec.capture) {
          spec.piece = it.v;
        } else if (spec.capture && !squares.length && !spec.captured) {
          spec.captured = it.v;
        } else {
          return null;
        }
        break;
    }
  }
  if (squares.length > 2) return null;
  if (squares.length === 2) {
    if (spec.fromFile || spec.toFile) return null;
    [spec.from, spec.to] = squares;
  } else if (squares.length === 1) {
    spec.to = squares[0];
    if (spec.toFile) return null;
  }
  if (spec.castle && (spec.to || spec.piece)) { delete spec.castle; spec.piece ??= 'r'; }
  // Needs something that pins down a destination.
  if (!spec.castle && !spec.to && !spec.toFile && !spec.captured && !(spec.capture && spec.piece)) return null;
  return spec;
}

// Legal moves matching a description.
export function matchMoves(spec, legal, { orientation = 'w' } = {}) {
  if (spec.castle) {
    const castles = legal.filter(m => m.flags.includes('k') || m.flags.includes('q'));
    if (spec.side === 'k' || spec.side === 'q') return castles.filter(m => m.flags.includes(spec.side));
    return castles;
  }
  let out = legal.filter(m =>
    (!spec.piece || m.piece === spec.piece) &&
    (!spec.from || m.from === spec.from) &&
    (!spec.to || m.to === spec.to) &&
    (!spec.fromFile || m.from[0] === spec.fromFile) &&
    (!spec.toFile || m.to[0] === spec.toFile) &&
    (!spec.capture || m.captured) &&
    (!spec.captured || m.captured === spec.captured) &&
    (!spec.promotion || m.promotion === spec.promotion));
  // "e5" with no piece named means the pawn, as in written notation, unless
  // no pawn can go there.
  if (!spec.piece && !spec.from && !spec.fromFile) {
    const pawns = out.filter(m => m.piece === 'p');
    if (pawns.length) out = pawns;
  }
  if (spec.side) out = pickSide(out, spec.side, orientation);
  return out;
}

// Keep the moves of the piece furthest to one side. Kingside is toward the
// h-file; right is toward the h-file from White's side of the board and
// toward the a-file from Black's.
function pickSide(moves, side, orientation) {
  const froms = [...new Set(moves.map(m => m.from))];
  if (froms.length < 2) return moves;
  const file = sq => sq.charCodeAt(0);
  const towardH = side === 'k' || (side === 'r') === (orientation === 'w');
  const best = towardH ? Math.max(...froms.map(file)) : Math.min(...froms.map(file));
  const keep = froms.filter(sq => file(sq) === best);
  if (keep.length === froms.length) return moves; // all on one file: no help
  return moves.filter(m => keep.includes(m.from));
}

// Text → matching legal moves. Of the readings that name at least one move,
// the ones naming the fewest win (so "e2 to e4" reads "to" as a word, not 2).
export function resolvePhrase(text, legal, opts = {}) {
  let best = [];
  for (const tokens of tokenize(text)) {
    const spec = parseTokens(tokens);
    if (!spec) continue;
    const moves = matchMoves(spec, legal, opts);
    if (!moves.length) continue;
    if (!best.length || moves.length < best.length) best = moves;
    else if (moves.length === best.length) best = [...new Map([...best, ...moves].map(m => [m.lan, m])).values()];
  }
  return best;
}

// Several transcripts (the recognizer's alternatives, best first) → the first
// that names exactly one move, else the first ambiguous one. A set that only
// differs in the promotion piece counts as one move (the caller asks which).
export function resolveAlternatives(texts, legal, opts = {}) {
  let fallback = null;
  for (const text of texts) {
    const moves = resolvePhrase(text, legal, opts);
    if (!moves.length) continue;
    if (isSingleMove(moves)) return { text, moves };
    fallback ??= { text, moves };
  }
  return fallback ?? { text: texts[0] ?? '', moves: [] };
}

export function isSingleMove(moves) {
  return moves.length > 0 && moves.every(m => m.from === moves[0].from && m.to === moves[0].to);
}
