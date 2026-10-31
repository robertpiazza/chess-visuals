// Positional commentary on a move, based on common chess principles:
// center control, development, king safety, trades relative to the material
// balance, piece activity, open files, batteries, pawn breaks and pawn
// structure.
//
// Returns [{ id, tone: 'good' | 'bad' | 'neutral', text, arrows? }], where
// arrows are [from, to] square-index pairs to draw on the board.

import {
  VALUE, NAME, sqIndex, sqName, applyUci, attacksFrom, enPrise, materialBalance,
} from './tactics.js';

const CENTER = ['d4', 'e4', 'd5', 'e5'].map(sqIndex);

const other = c => (c === 'w' ? 'b' : 'w');
const onBoard = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Can this piece slide along (df, dr)?
function slidesAlong(type, df, dr) {
  const diagonal = df !== 0 && dr !== 0;
  return type === 'q' || (diagonal ? type === 'b' : type === 'r');
}

// "the e-file", "the 7th rank" (from `color`'s side), or "the b1–h7 diagonal".
function lineName(sq, df, dr, color) {
  if (df === 0) return `the ${'abcdefgh'[sq & 7]}-file`;
  if (dr === 0) {
    const rank = color === 'w' ? (sq >> 3) + 1 : 8 - (sq >> 3);
    return `the ${rank}${['st', 'nd', 'rd'][rank - 1] ?? 'th'} rank`;
  }
  const ends = [-1, 1].map(k => {
    let f = sq & 7, r = sq >> 3;
    while (onBoard(f + k * df, r + k * dr)) { f += k * df; r += k * dr; }
    return r * 8 + f;
  }).sort((a, b) => a - b);
  return `the ${sqName(ends[0])}–${sqName(ends[1])} diagonal`;
}

// A square in the opponent's half, guarded by our pawn, that no enemy pawn
// can ever attack.
function isOutpost(board, sq, color) {
  const f = sq & 7, r = sq >> 3;
  const rel = color === 'w' ? r : 7 - r; // 0 = our back rank
  if (rel < 3 || rel > 5) return false;
  const back = color === 'w' ? -1 : 1;
  const guarded = [-1, 1].some(df => {
    const t = (r + back) * 8 + f + df;
    return onBoard(f + df, r + back) && board[t]?.type === 'p' && board[t].color === color;
  });
  if (!guarded) return false;
  // Enemy pawns on neighbouring files further up the board (from our side)
  // could one day attack the square.
  for (const df of [-1, 1]) {
    if (!onBoard(f + df, r)) continue;
    for (let rr = 0; rr < 8; rr++) {
      const ahead = color === 'w' ? rr > r : rr < r;
      const p = board[rr * 8 + f + df];
      if (ahead && p?.type === 'p' && p.color !== color) return false;
    }
  }
  return true;
}

function firstPiece(board, sq, df, dr) {
  for (let f = (sq & 7) + df, r = (sq >> 3) + dr; onBoard(f, r); f += df, r += dr) {
    if (board[r * 8 + f]) return r * 8 + f;
  }
  return null;
}

// Batteries the piece on `sq` is part of: a friendly slider directly in
// front of or behind it on a line both can use, aimed at something worth
// aiming at (the enemy king's area, an enemy piece, or an open or half-open
// file).
// Returns [{ key, back, front, dir, aim }].
function batteriesAt(board, sq) {
  const p = board[sq];
  if (!p || !['q', 'r', 'b'].includes(p.type)) return [];
  const king = board.findIndex(x => x?.type === 'k' && x.color !== p.color);
  const kingZone = new Set();
  for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) {
    if (king >= 0 && onBoard((king & 7) + df, (king >> 3) + dr)) kingZone.add(king + dr * 8 + df);
  }
  const out = [];
  for (const [df, dr] of [...DIAG, ...ORTHO]) {
    if (!slidesAlong(p.type, df, dr)) continue;
    const partner = s => s != null && board[s].color === p.color && slidesAlong(board[s].type, df, dr);
    const ahead = firstPiece(board, sq, df, dr);
    const behind = firstPiece(board, sq, -df, -dr);
    for (const [back, front] of [[sq, ahead], [behind, sq]]) {
      if (!partner(back === sq ? front : back)) continue;
      const aim = batteryAim(board, front, df, dr, p.color, kingZone);
      // Same partner on the same line = same battery, wherever the moved
      // piece sits on it.
      const partnerSq = back === sq ? front : back;
      const axis = df * dr > 0 || (dr === 0 && df !== 0) ? `${Math.abs(df)},${Math.abs(dr)}` : `${-Math.abs(df)},${Math.abs(dr)}`;
      if (aim) out.push({ key: `${partnerSq}:${axis}`, back, front, dir: [df, dr], aim });
    }
  }
  return out;
}

// Where a battery whose front piece is on `front` points along (df, dr).
function batteryAim(board, front, df, dr, color, kingZone) {
  {
    let aim = null;
    const path = [];
    for (let f = (front & 7) + df, r = (front >> 3) + dr; onBoard(f, r); f += df, r += dr) {
      const t = r * 8 + f;
      path.push(t);
      if (kingZone.has(t)) { aim = { kind: 'king', sq: t }; break; }
      if (board[t]) {
        // Pawns away from the king aren't worth a battery.
        if (board[t].color !== color && board[t].type !== 'p') aim = { kind: 'piece', sq: t };
        break;
      }
    }
    if (!aim && df === 0 && path.length && !path.some(t => board[t]?.color === color)) {
      const theirPawn = path.some(t => board[t]?.type === 'p');
      aim = { kind: theirPawn ? 'half-open' : 'open', sq: path.at(-1) };
    }
    return aim;
  }
}

function centerControl(board, color) {
  let n = 0;
  for (let i = 0; i < 64; i++) {
    if (board[i]?.color !== color) continue;
    for (const t of attacksFrom(board, i)) if (CENTER.includes(t)) n++;
    if (CENTER.includes(i) && board[i].type === 'p') n += 2;
  }
  return n;
}

function count(board, color, type) {
  return board.filter(p => p?.color === color && p.type === type).length;
}

function nonPawnMaterial(board) {
  return board.reduce((s, p) => s + (p && p.type !== 'p' && p.type !== 'k' ? VALUE[p.type] : 0), 0);
}

function pawnFiles(board, color) {
  const files = new Array(8).fill(0);
  board.forEach((p, i) => { if (p?.type === 'p' && p.color === color) files[i & 7]++; });
  return files;
}

function doubled(files) { return files.reduce((s, n) => s + Math.max(0, n - 1), 0); }
function isolated(files) {
  return files.reduce((s, n, f) => s + (n && !files[f - 1] && !files[f + 1] ? n : 0), 0);
}

function isPassed(board, i) {
  const p = board[i];
  const f = i & 7, r = i >> 3;
  const dir = p.color === 'w' ? 1 : -1;
  for (let rr = r + dir; rr >= 0 && rr < 8; rr += dir) {
    for (const ff of [f - 1, f, f + 1]) {
      if (ff < 0 || ff > 7) continue;
      const q = board[rr * 8 + ff];
      if (q?.type === 'p' && q.color !== p.color) return false;
    }
  }
  return true;
}

// ctx: { fen, uci, history } where history is the chess.js verbose history
// before this move.
export function principlesOfMove(board, uci, ctx) {
  const from = sqIndex(uci.slice(0, 2)), to = sqIndex(uci.slice(2, 4));
  const piece = board[from];
  const us = piece.color, them = other(us);
  const after = applyUci(board, uci);
  const fullmove = +ctx.fen.split(' ')[5] || 1;
  const castling = ctx.fen.split(' ')[2] || '-';
  const opening = fullmove <= 12;
  const endgame = nonPawnMaterial(board) <= 26;
  const homeRank = us === 'w' ? 0 : 7;
  const out = [];
  const add = (id, tone, text) => out.push({ id, tone, text });

  // Castling and king safety.
  const isCastle = piece.type === 'k' && Math.abs((to & 7) - (from & 7)) === 2;
  if (isCastle) {
    add('castle', 'good', 'Castles: tucks the king away and connects the rooks');
  } else if (piece.type === 'k' && !endgame) {
    const rights = us === 'w' ? /[KQ]/.test(castling) : /[kq]/.test(castling);
    if (rights) add('king-walk', 'bad', 'Moves the king and gives up the right to castle');
  } else if (piece.type === 'r' && opening && (from >> 3) === homeRank) {
    const side = (from & 7) === 7 ? (us === 'w' ? 'K' : 'k') : (from & 7) === 0 ? (us === 'w' ? 'Q' : 'q') : null;
    if (side && castling.includes(side)) add('rook-castle', 'bad', 'Moving this rook gives up castling on that side');
  }

  // Pawn shield in front of a castled king.
  const king = board.findIndex(p => p?.type === 'k' && p.color === us);
  if (piece.type === 'p' && !endgame && (king >> 3) === homeRank && Math.abs((king & 7) - (from & 7)) <= 1 &&
      ((king & 7) >= 5 || (king & 7) <= 2)) {
    add('shield', 'bad', 'Pushes a pawn in front of your castled king, loosening its cover');
  }

  // Center.
  const centerGain = centerControl(after, us) - centerControl(board, us);
  if (piece.type === 'p' && CENTER.includes(to)) add('center', 'good', 'Occupies the center with a pawn');
  else if (centerGain >= 2) add('center', 'good', 'Adds control of the central squares (d4, e4, d5, e5)');
  else if (centerGain <= -2) add('center-loss', 'bad', 'Gives up control of the center');

  // Development.
  if (opening && (piece.type === 'n' || piece.type === 'b') && (from >> 3) === homeRank) {
    add('develop', 'good', `Develops the ${NAME[piece.type]}`);
  }
  if (piece.type === 'n' && ((to & 7) === 0 || (to & 7) === 7) && !board[to]) {
    add('rim', 'bad', 'A knight on the rim controls fewer squares');
  }
  // Early queen: leaving the back two ranks in the first moves, where it
  // can be chased. Qc2 or Qe2 stays home and doesn't count.
  const queenOut = us === 'w' ? (to >> 3) >= 2 : (to >> 3) <= 5;
  if (opening && piece.type === 'q' && fullmove <= 6 && queenOut) {
    const undeveloped = ['b', 'n'].reduce((s, t) => s + board.filter((p, i) => p?.color === us && p.type === t && (i >> 3) === homeRank).length, 0);
    if (undeveloped >= 2) add('early-queen', 'bad', 'Brings the queen out early; it can be chased while you lose time');
  }
  if (opening && !board[to] && ctx.history?.some(h => h.color === us && h.to === uci.slice(0, 2) && h.piece !== 'p' && h.piece !== 'k')) {
    if (!enPrise(board, from)) add('tempo', 'bad', 'Moves the same piece twice in the opening instead of developing another');
  }

  // Trades relative to the material balance.
  const captured = board[to];
  if (captured && captured.type !== 'p') {
    const recaptured = enPrise(after, to);
    const even = recaptured && Math.abs(VALUE[captured.type] - VALUE[piece.type]) <= 0.5;
    const balance = materialBalance(board, us);
    if (even) {
      if (balance >= 2) add('trade-ahead', 'good', 'Trades pieces while ahead in material: fewer pieces make the extra material count');
      else if (balance <= -2) add('trade-behind', 'bad', 'Trades pieces while behind in material: usually keep pieces on to create chances');
      if (piece.type === 'q' && captured.type === 'q' && balance >= 1) add('trade-queens', 'good', 'Trading queens while ahead removes the opponent\'s best attacking piece');
    }
    // Bishop pair, assuming the recapture happens on an even trade.
    if (piece.type === 'b' && captured.type === 'n' && count(board, us, 'b') === 2 && recaptured) {
      add('bishop-pair', 'bad', 'Gives up the bishop pair for a knight');
    }
    if (captured.type === 'b' && count(board, them, 'b') === 2 && count(board, us, 'b') === 2) {
      add('bishop-pair', 'good', 'Takes away the opponent\'s bishop pair while keeping yours');
    }
  }

  // Rooks on open files and the seventh rank.
  if (piece.type === 'r' && (from & 7) !== (to & 7)) {
    const ours = pawnFiles(after, us)[to & 7], theirs = pawnFiles(after, them)[to & 7];
    if (!ours && !theirs) add('open-file', 'good', `Puts the rook on the open ${'abcdefgh'[to & 7]}-file`);
    else if (!ours) add('open-file', 'good', `Puts the rook on the half-open ${'abcdefgh'[to & 7]}-file`);
  }
  if (piece.type === 'r' && (to >> 3) === (us === 'w' ? 6 : 1) && (from >> 3) !== (to >> 3)) {
    add('seventh', 'good', 'Rook on the seventh rank attacks pawns from behind');
  }

  // Pawn structure.
  if (piece.type === 'p') {
    if (isPassed(after, to)) {
      const rank = us === 'w' ? (to >> 3) + 1 : 8 - (to >> 3);
      add('passed', 'good', rank >= 6 ? 'Pushes a passed pawn close to promotion' : 'Advances a passed pawn');
    }
  }
  const pfBefore = pawnFiles(board, us), pfAfter = pawnFiles(after, us);
  if (doubled(pfAfter) > doubled(pfBefore)) add('doubled', 'bad', 'Creates doubled pawns');
  if (isolated(pfAfter) > isolated(pfBefore)) add('isolated', 'bad', 'Leaves an isolated pawn');
  const theirsBefore = pawnFiles(board, them), theirsAfter = pawnFiles(after, them);
  if (doubled(theirsAfter) > doubled(theirsBefore) || isolated(theirsAfter) > isolated(theirsBefore)) {
    add('weaken', 'good', 'Damages the opponent\'s pawn structure');
  }

  // Piece activity.
  if (piece.type !== 'p' && piece.type !== 'k' && !isCastle) {
    const before = attacksFrom(board, from).filter(t => board[t]?.color !== us).length;
    const now = attacksFrom(after, to).filter(t => after[t]?.color !== us).length;
    if (now - before >= 3) add('active', 'good', `Activates the ${NAME[piece.type]}: ${now} squares instead of ${before}`);
    else if (before - now >= 3 && !captured) add('passive', 'bad', `Makes the ${NAME[piece.type]} more passive: ${now} squares instead of ${before}`);
  }
  if (piece.type === 'k' && endgame) {
    const dist = i => Math.max(Math.abs((i & 7) - 3.5), Math.abs((i >> 3) - 3.5));
    if (dist(to) < dist(from)) add('king-active', 'good', 'Centralizes the king: in the endgame it is a fighting piece');
  }

  // Batteries: a new line-up of the moved piece with another slider.
  if (['q', 'r', 'b'].includes(piece.type)) {
    const before = new Set(batteriesAt(board, from).map(b => b.key));
    for (const bat of batteriesAt(after, to)) {
      if (before.has(bat.key)) continue;
      // Bigger piece named first: "queen and bishop".
      const names = [after[bat.back], after[bat.front]].map(x => x.type).sort((x, y) => VALUE[y] - VALUE[x]).map(t => NAME[t]);
      const rooks = names[0] === 'rook' && names[1] === 'rook';
      const line = lineName(to, bat.dir[0], bat.dir[1], us);
      const where = bat.aim.kind === 'open' || bat.aim.kind === 'half-open' ? `the ${bat.aim.kind} ${line.replace('the ', '')}` : line;
      const lead = rooks ? `Doubles rooks on ${where}` : `Forms a battery: ${names[0]} and ${names[1]} lined up on ${where}`;
      let text = lead;
      if (bat.aim.kind === 'king') text += rooks ? ', aimed at the king' : ' toward the king';
      else if (bat.aim.kind === 'piece') text += `${rooks ? ',' : ''} aimed at the ${NAME[after[bat.aim.sq].type]} on ${sqName(bat.aim.sq)}`;
      add('battery', 'good', text);
      out.at(-1).arrows = [[bat.back, bat.aim.sq]];
    }
  }

  // Rook and passed pawns (Tarrasch's rule): rooks belong behind passed
  // pawns, ours to push them and the opponent's to chase them. In front of
  // our own passer the rook just blocks it.
  if (piece.type === 'r' && (from & 7) !== (to & 7)) {
    const f = to & 7;
    for (let r = 0; r < 8; r++) {
      const sq = r * 8 + f;
      const p = after[sq];
      if (p?.type !== 'p' || !isPassed(after, sq)) continue;
      // Nothing between the rook and the pawn.
      const lo = Math.min(sq, to), hi = Math.max(sq, to);
      let clear = true;
      for (let x = lo + 8; x < hi; x += 8) if (after[x]) clear = false;
      if (!clear) continue;
      // "Behind" is toward the pawn owner's own back rank.
      const behind = p.color === 'w' ? to < sq : to > sq;
      if (p.color === us && behind) {
        add('rook-passer', 'good', `Puts the rook behind your passed pawn on ${sqName(sq)}, where it supports the pawn all the way up the board`);
      } else if (p.color === us) {
        add('rook-passer', 'bad', `Puts the rook in front of your passed pawn on ${sqName(sq)}, where it blocks it; rooks belong behind passed pawns`);
      } else if (behind) {
        add('rook-passer', 'good', `Puts the rook behind the enemy passed pawn on ${sqName(sq)}, attacking it and following it as it advances`);
      }
      if (out.at(-1)?.id === 'rook-passer') out.at(-1).arrows = [[to, sq]];
    }
  }

  // Opposition: in a king and pawn ending, kings facing each other on a file
  // or rank with an odd number of squares between them. After our move it's
  // the opponent's turn, so their king has to give way.
  if (piece.type === 'k' && nonPawnMaterial(after) === 0) {
    const theirKing = after.findIndex(p => p?.type === 'k' && p.color === them);
    const df = Math.abs((theirKing & 7) - (to & 7)), dr = Math.abs((theirKing >> 3) - (to >> 3));
    const gap = df === 0 ? dr : dr === 0 ? df : 0;
    if (gap === 2) {
      add('opposition', 'good', 'Takes the opposition: the kings face each other with one square between, and the opponent\'s king has to give way');
    } else if (gap === 4 || gap === 6) {
      add('opposition', 'good', `Takes the distant opposition: the kings face each other with ${gap - 1} squares between, so you can keep the opposition as they approach`);
    }
  }

  // Outpost: a knight in the opponent's half on a square our pawn guards
  // and no enemy pawn can ever attack (none left on the neighbouring files
  // ahead of it).
  if (piece.type === 'n' && isOutpost(after, to, us) && !enPrise(after, to)) {
    add('outpost', 'good', `Plants the knight on an outpost: ${sqName(to)} is guarded by a pawn and no enemy pawn can chase it away`);
  }

  // Bad bishop: the move locks one of our central pawns (c–f files) on our
  // bishop's square colour, blocked head-on by an enemy pawn, so that at
  // least two such fixed pawns now wall the bishop in. Pawns that can still
  // move aren't the problem; fixed ones are.
  if (piece.type === 'p') {
    const shade = sq => ((sq & 7) + (sq >> 3)) % 2; // 0 = dark, 1 = light
    const step = us === 'w' ? 8 : -8;
    const fixedOn = (bd, colour) => bd.reduce((n, p, i) => n + (
      p?.color === us && p.type === 'p' && (i & 7) >= 2 && (i & 7) <= 5 && shade(i) === colour &&
      bd[i + step]?.type === 'p' && bd[i + step].color === them ? 1 : 0), 0);
    const movedFixed = after[to + step]?.type === 'p' && after[to + step].color === them && (to & 7) >= 2 && (to & 7) <= 5;
    const bishops = after.map((p, i) => (p?.color === us && p.type === 'b' ? i : -1)).filter(i => i >= 0);
    for (const b of bishops) {
      if (!movedFixed || shade(to) !== shade(b)) continue;
      if (bishops.some(o => o !== b && shade(o) === shade(b))) continue; // two same-coloured bishops: skip
      const n = fixedOn(after, shade(b));
      if (n >= 2 && n > fixedOn(board, shade(b))) {
        const colour = shade(b) ? 'light' : 'dark';
        add('bad-bishop', 'bad', `Locks the center on ${colour} squares: ${n} of your pawns are now fixed on the same colour as your bishop on ${sqName(b)}, limiting it (a "bad bishop")`);
      }
    }
  }

  // Pawn break: the pawn now attacks an enemy pawn, offering a trade that
  // opens lines. A capture is the break being carried out, not offered.
  if (piece.type === 'p' && !board[to] && (from & 7) === (to & 7)) {
    const dr = us === 'w' ? 1 : -1;
    const levers = [-1, 1]
      .filter(df => onBoard((to & 7) + df, (to >> 3) + dr))
      .map(df => to + dr * 8 + df)
      .filter(t => after[t]?.type === 'p' && after[t].color === them);
    if (levers.length) {
      const t = levers[0];
      const central = 'de'.includes('abcdefgh'[t & 7]);
      add('pawn-break', 'good', `Pawn break: challenges the pawn on ${sqName(t)}${central ? ' and strikes at the center' : ' to open lines'}`);
      out.at(-1).arrows = [[to, t]];
    }
  }

  // Defending a piece that was hanging.
  for (let i = 0; i < 64; i++) {
    if (i === from || board[i]?.color !== us || board[i].type === 'k') continue;
    if (enPrise(board, i) && !enPrise(after, i) && after[i]) {
      add('defend', 'good', `Protects the ${NAME[board[i].type]} on ${sqName(i)}`);
    }
  }

  // A rook behind a passed pawn may see fewer squares, but it's where it belongs.
  if (out.some(o => o.id === 'rook-passer' && o.tone === 'good')) return out.filter(o => o.id !== 'passive');
  return out;
}
