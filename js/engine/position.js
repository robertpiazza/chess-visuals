// Fast 0x88 position with make/unmake, used only by the built-in search.
// chess.js handles the game itself; this exists because chess.js is far too
// slow to search with.

export const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
export const WHITE = 0, BLACK = 1;

const TYPE_CHARS = '.pnbrqk';
const KNIGHT_D = [33, 31, 18, 14, -33, -31, -18, -14];
const KING_D = [1, -1, 16, -16, 17, 15, -17, -15];
const BISHOP_D = [17, 15, -17, -15];
const ROOK_D = [1, -1, 16, -16];

// Castling rights bits.
const WK = 1, WQ = 2, BK = 4, BQ = 8;

// Rights lost when a piece moves from or to these squares.
const CASTLE_MASK = new Uint8Array(128).fill(15);
CASTLE_MASK[0x00] = 15 & ~WQ;
CASTLE_MASK[0x07] = 15 & ~WK;
CASTLE_MASK[0x04] = 15 & ~(WK | WQ);
CASTLE_MASK[0x70] = 15 & ~BQ;
CASTLE_MASK[0x77] = 15 & ~BK;
CASTLE_MASK[0x74] = 15 & ~(BK | BQ);

export const pieceColor = p => p >> 3;
export const pieceType = p => p & 7;
const make = (color, type) => (color << 3) | type;

export function sqName(sq) {
  return 'abcdefgh'[sq & 7] + ((sq >> 4) + 1);
}

export function parseSq(name) {
  return (name.charCodeAt(1) - 49) * 16 + (name.charCodeAt(0) - 97);
}

export function moveToUci(m) {
  return sqName(m.from) + sqName(m.to) + (m.promo ? TYPE_CHARS[m.promo] : '');
}

export class Position {
  constructor(fen) {
    this.board = new Uint8Array(128);
    this.kings = [0, 0];
    this.history = [];
    const [placement, side, castling, ep, half] = fen.trim().split(/\s+/);
    let rank = 7, file = 0;
    for (const ch of placement) {
      if (ch === '/') { rank--; file = 0; continue; }
      if (ch >= '1' && ch <= '8') { file += +ch; continue; }
      const color = ch === ch.toUpperCase() ? WHITE : BLACK;
      const type = TYPE_CHARS.indexOf(ch.toLowerCase());
      const sq = rank * 16 + file;
      this.board[sq] = make(color, type);
      if (type === KING) this.kings[color] = sq;
      file++;
    }
    this.side = side === 'b' ? BLACK : WHITE;
    this.castling = 0;
    if (castling && castling !== '-') {
      if (castling.includes('K')) this.castling |= WK;
      if (castling.includes('Q')) this.castling |= WQ;
      if (castling.includes('k')) this.castling |= BK;
      if (castling.includes('q')) this.castling |= BQ;
    }
    this.ep = ep && ep !== '-' ? parseSq(ep) : -1;
    this.halfmove = half ? +half : 0;
  }

  attacked(sq, by) {
    const b = this.board;
    // Pawns: a white pawn attacks sq from sq-15 / sq-17.
    const pdir = by === WHITE ? -16 : 16;
    const pawn = make(by, PAWN);
    for (const d of [pdir - 1, pdir + 1]) {
      const s = sq + d;
      if (!(s & 0x88) && b[s] === pawn) return true;
    }
    const knight = make(by, KNIGHT);
    for (const d of KNIGHT_D) {
      const s = sq + d;
      if (!(s & 0x88) && b[s] === knight) return true;
    }
    const king = make(by, KING);
    for (const d of KING_D) {
      const s = sq + d;
      if (!(s & 0x88) && b[s] === king) return true;
    }
    const bishop = make(by, BISHOP), rook = make(by, ROOK), queen = make(by, QUEEN);
    for (const d of BISHOP_D) {
      for (let s = sq + d; !(s & 0x88); s += d) {
        const p = b[s];
        if (!p) continue;
        if (p === bishop || p === queen) return true;
        break;
      }
    }
    for (const d of ROOK_D) {
      for (let s = sq + d; !(s & 0x88); s += d) {
        const p = b[s];
        if (!p) continue;
        if (p === rook || p === queen) return true;
        break;
      }
    }
    return false;
  }

  inCheck(color = this.side) {
    return this.attacked(this.kings[color], color ^ 1);
  }

  // Pseudo-legal moves. capturesOnly also keeps promotions.
  pseudoMoves(capturesOnly = false) {
    const b = this.board, us = this.side, them = us ^ 1;
    const moves = [];
    const add = (from, to, piece, captured, promo = 0, flag = 0) =>
      moves.push({ from, to, piece, captured, promo, flag });

    for (let from = 0; from < 128; from++) {
      if (from & 0x88) { from += 7; continue; }
      const p = b[from];
      if (!p || pieceColor(p) !== us) continue;
      const type = pieceType(p);

      if (type === PAWN) {
        const fwd = us === WHITE ? 16 : -16;
        const startRank = us === WHITE ? 1 : 6;
        const promoRank = us === WHITE ? 7 : 0;
        const to = from + fwd;
        const pushPromo = !(to & 0x88) && (to >> 4) === promoRank;
        if (!(to & 0x88) && !b[to] && (!capturesOnly || pushPromo)) {
          if (pushPromo) for (const pr of [QUEEN, ROOK, BISHOP, KNIGHT]) add(from, to, p, 0, pr);
          else {
            add(from, to, p, 0);
            const to2 = to + fwd;
            if ((from >> 4) === startRank && !b[to2]) add(from, to2, p, 0, 0, 'double');
          }
        }
        for (const d of [fwd - 1, fwd + 1]) {
          const t = from + d;
          if (t & 0x88) continue;
          if (b[t] && pieceColor(b[t]) === them) {
            if ((t >> 4) === promoRank) for (const pr of [QUEEN, ROOK, BISHOP, KNIGHT]) add(from, t, p, b[t], pr);
            else add(from, t, p, b[t]);
          } else if (t === this.ep) {
            add(from, t, p, make(them, PAWN), 0, 'ep');
          }
        }
        continue;
      }

      // Queen and king share the 8 directions; only the queen slides.
      const dirs = type === KNIGHT ? KNIGHT_D : type === BISHOP ? BISHOP_D
        : type === ROOK ? ROOK_D : KING_D;
      const slides = type === BISHOP || type === ROOK || type === QUEEN;
      for (const d of dirs) {
        for (let to = from + d; !(to & 0x88); to += d) {
          const q = b[to];
          if (q) {
            if (pieceColor(q) === them) add(from, to, p, q);
            break;
          }
          if (!capturesOnly) add(from, to, p, 0);
          if (!slides) break;
        }
      }

      if (type === KING && !capturesOnly) {
        const rank = us === WHITE ? 0 : 0x70;
        const kSide = us === WHITE ? WK : BK, qSide = us === WHITE ? WQ : BQ;
        if ((this.castling & kSide) && !b[rank + 5] && !b[rank + 6] &&
            !this.attacked(rank + 4, them) && !this.attacked(rank + 5, them) && !this.attacked(rank + 6, them)) {
          add(from, rank + 6, p, 0, 0, 'castle');
        }
        if ((this.castling & qSide) && !b[rank + 3] && !b[rank + 2] && !b[rank + 1] &&
            !this.attacked(rank + 4, them) && !this.attacked(rank + 3, them) && !this.attacked(rank + 2, them)) {
          add(from, rank + 2, p, 0, 0, 'castle');
        }
      }
    }
    return moves;
  }

  makeMove(m) {
    const b = this.board, us = this.side;
    this.history.push({ castling: this.castling, ep: this.ep, halfmove: this.halfmove });
    b[m.to] = m.promo ? make(us, m.promo) : m.piece;
    b[m.from] = 0;
    if (m.flag === 'ep') b[m.to + (us === WHITE ? -16 : 16)] = 0;
    if (m.flag === 'castle') {
      const rank = m.to & 0x70;
      if ((m.to & 7) === 6) { b[rank + 5] = b[rank + 7]; b[rank + 7] = 0; }
      else { b[rank + 3] = b[rank]; b[rank] = 0; }
    }
    if (pieceType(m.piece) === KING) this.kings[us] = m.to;
    this.castling &= CASTLE_MASK[m.from] & CASTLE_MASK[m.to];
    this.ep = m.flag === 'double' ? (m.from + m.to) >> 1 : -1;
    this.halfmove = pieceType(m.piece) === PAWN || m.captured ? 0 : this.halfmove + 1;
    this.side ^= 1;
  }

  unmakeMove(m) {
    const b = this.board;
    this.side ^= 1;
    const us = this.side;
    const prev = this.history.pop();
    this.castling = prev.castling;
    this.ep = prev.ep;
    this.halfmove = prev.halfmove;
    b[m.from] = m.piece;
    if (m.flag === 'ep') {
      b[m.to] = 0;
      b[m.to + (us === WHITE ? -16 : 16)] = m.captured;
    } else {
      b[m.to] = m.captured;
    }
    if (m.flag === 'castle') {
      const rank = m.to & 0x70;
      if ((m.to & 7) === 6) { b[rank + 7] = b[rank + 5]; b[rank + 5] = 0; }
      else { b[rank] = b[rank + 3]; b[rank + 3] = 0; }
    }
    if (pieceType(m.piece) === KING) this.kings[us] = m.from;
  }

  legalMoves(capturesOnly = false) {
    const legal = [];
    for (const m of this.pseudoMoves(capturesOnly)) {
      this.makeMove(m);
      if (!this.inCheck(this.side ^ 1)) legal.push(m);
      this.unmakeMove(m);
    }
    return legal;
  }
}
