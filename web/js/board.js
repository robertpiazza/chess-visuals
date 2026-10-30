// SVG board. Each square is 100×100 user units, so the board is 800×800.
//
// Overlays:
//   pieceRings   — Map square → piece summary. Draws a pie ring around the
//                  piece with one slice per legal move, best → worst
//                  clockwise from the top, coloured by move quality.
//   destinations — Map square → rating, for the selected piece. Draws a disc
//                  tinted by quality, an arc filled to the win% after the
//                  move, and the engine score.

import { formatScore } from './analysis.js';

const NS = 'http://www.w3.org/2000/svg';
const FILES = 'abcdefgh';

const RING_IN = 40, RING_OUT = 48;
const DEST_IN = 22, DEST_OUT = 31;
const STAR_PATH = 'M 0 -9 L 2.6 -3.1 9 -2.8 4 1.3 5.6 7.5 0 4 -5.6 7.5 -4 1.3 -9 -2.8 -2.6 -3.1 Z';

function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  parent?.appendChild(node);
  return node;
}

// Annulus segment between angles a0..a1 (radians, 0 = 12 o'clock, clockwise).
function arcPath(cx, cy, rIn, rOut, a0, a1) {
  if (a1 - a0 >= Math.PI * 2 - 1e-6) {
    // Full ring: two half-arcs on each radius, outer clockwise, inner back.
    return `M ${cx} ${cy - rOut} A ${rOut} ${rOut} 0 1 1 ${cx} ${cy + rOut} A ${rOut} ${rOut} 0 1 1 ${cx} ${cy - rOut} Z ` +
           `M ${cx} ${cy - rIn} A ${rIn} ${rIn} 0 1 0 ${cx} ${cy + rIn} A ${rIn} ${rIn} 0 1 0 ${cx} ${cy - rIn} Z`;
  }
  const pt = (r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = pt(rOut, a0), [x1, y1] = pt(rOut, a1);
  const [x2, y2] = pt(rIn, a1), [x3, y3] = pt(rIn, a0);
  return `M ${x0} ${y0} A ${rOut} ${rOut} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${rIn} ${rIn} 0 ${large} 0 ${x3} ${y3} Z`;
}

export class BoardView {
  constructor(container, { onSquareDown, onSquareUp, onHover }) {
    this.svg = el('svg', { viewBox: '0 0 800 800', class: 'board', role: 'img', 'aria-label': 'Chess board' });
    container.appendChild(this.svg);
    this.layers = {};
    for (const name of ['squares', 'marks', 'rings', 'pieces', 'dests', 'arrows', 'labels', 'drag']) {
      this.layers[name] = el('g', { class: `layer-${name}` }, this.svg);
    }
    this.orientation = 'w';
    this.callbacks = { onSquareDown, onSquareUp, onHover };
    this.drag = null;
    this.hoverSq = null;

    this.svg.addEventListener('pointerdown', e => this.pointerDown(e));
    this.svg.addEventListener('pointermove', e => this.pointerMove(e));
    this.svg.addEventListener('pointerup', e => this.pointerUp(e));
    this.svg.addEventListener('pointerleave', () => this.setHover(null));
    this.svg.addEventListener('pointercancel', () => this.endDrag());
  }

  squareOrigin(sq) {
    const f = sq.charCodeAt(0) - 97, r = +sq[1];
    return this.orientation === 'w' ? [f * 100, (8 - r) * 100] : [(7 - f) * 100, (r - 1) * 100];
  }

  squareAt(x, y) {
    const col = Math.floor(x / 100), row = Math.floor(y / 100);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    return this.orientation === 'w' ? FILES[col] + (8 - row) : FILES[7 - col] + (row + 1);
  }

  svgPoint(e) {
    const rect = this.svg.getBoundingClientRect();
    return [(e.clientX - rect.left) * 800 / rect.width, (e.clientY - rect.top) * 800 / rect.height];
  }

  pointerDown(e) {
    if (e.button !== 0) return;
    const sq = this.squareAt(...this.svgPoint(e));
    if (!sq) return;
    const draggable = this.callbacks.onSquareDown(sq);
    if (draggable) {
      this.svg.setPointerCapture(e.pointerId);
      const pieceNode = this.layers.pieces.querySelector(`[data-sq="${sq}"]`);
      this.drag = { from: sq, pieceNode, ghost: null, moved: false, start: this.svgPoint(e) };
    }
  }

  pointerMove(e) {
    const [x, y] = this.svgPoint(e);
    this.setHover(this.squareAt(x, y));
    const d = this.drag;
    if (!d || !d.pieceNode) return;
    if (!d.moved && Math.hypot(x - d.start[0], y - d.start[1]) < 8) return;
    if (!d.ghost) {
      d.moved = true;
      d.ghost = d.pieceNode.cloneNode();
      d.ghost.setAttribute('class', 'piece ghost');
      d.pieceNode.style.opacity = '0.3';
      this.layers.drag.appendChild(d.ghost);
    }
    d.ghost.setAttribute('x', x - 50);
    d.ghost.setAttribute('y', y - 50);
  }

  pointerUp(e) {
    const sq = this.squareAt(...this.svgPoint(e));
    const d = this.drag;
    this.endDrag();
    if (d && !d.moved && sq === d.from) {
      this.callbacks.onSquareUp(sq, { click: true });
    } else if (sq) {
      this.callbacks.onSquareUp(sq, { click: !d });
    }
  }

  endDrag() {
    const d = this.drag;
    if (!d) return;
    d.ghost?.remove();
    if (d.pieceNode) d.pieceNode.style.opacity = '';
    this.drag = null;
  }

  setHover(sq) {
    if (sq === this.hoverSq) return;
    this.hoverSq = sq;
    this.callbacks.onHover?.(sq);
  }

  // state: { pieces: chess.board(), orientation, lastMove, checkSq, selected,
  //          pieceRings, pieceIcons, destinations, destIcons, plainTargets,
  //          highlight, arrows }
  // pieceIcons / destIcons: Map square → { letter, label } for forced tactics.
  // arrows: [{ from, to, tone: 'good' | 'bad' | 'neutral' | 'book' | 'move', dashed }]
  render(state) {
    this.orientation = state.orientation;
    for (const layer of Object.values(this.layers)) {
      if (layer !== this.layers.drag) layer.replaceChildren();
    }
    this.drawSquares(state);
    this.drawRings(state);
    this.drawPieces(state);
    this.drawDestinations(state);
    this.drawArrows(state);
  }

  // Small lettered badge in a square's top-left corner marking a forced tactic.
  drawIcon(parent, x, y, icon, scale = 1) {
    const g = el('g', { class: 'tactic-badge', transform: `translate(${x + 14} ${y + 14}) scale(${scale})` }, parent);
    el('title', {}, g).textContent = `${icon.label} can be forced`;
    el('circle', { r: 11 }, g);
    el('text', { y: 5, 'text-anchor': 'middle' }, g).textContent = icon.letter;
  }

  drawArrows({ arrows }) {
    if (!arrows) return;
    const seen = new Set();
    for (const a of arrows) {
      const key = `${a.from}${a.to}${a.tone}`;
      if (a.from === a.to || seen.has(key)) continue;
      seen.add(key);
      const [x0, y0] = this.squareOrigin(a.from).map(v => v + 50);
      const [x1, y1] = this.squareOrigin(a.to).map(v => v + 50);
      const len = Math.hypot(x1 - x0, y1 - y0);
      const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
      const head = 22, start = 18, end = 14;
      const sx = x0 + ux * start, sy = y0 + uy * start;
      const hx = x1 - ux * end, hy = y1 - uy * end;
      const bx = hx - ux * head, by = hy - uy * head;
      const g = el('g', { class: `arrow arrow-${a.tone}` + (a.dashed ? ' is-dashed' : '') }, this.layers.arrows);
      el('line', { x1: sx, y1: sy, x2: bx, y2: by }, g);
      el('path', { d: `M ${hx} ${hy} L ${bx - uy * 13} ${by + ux * 13} L ${bx + uy * 13} ${by - ux * 13} Z` }, g);
    }
  }

  drawSquares({ lastMove, checkSq, selected }) {
    for (let r = 1; r <= 8; r++) {
      for (let f = 0; f < 8; f++) {
        const sq = FILES[f] + r;
        const [x, y] = this.squareOrigin(sq);
        const light = (f + r) % 2 === 1;
        el('rect', { x, y, width: 100, height: 100, class: light ? 'sq-light' : 'sq-dark' }, this.layers.squares);
        if (lastMove && (sq === lastMove.from || sq === lastMove.to)) {
          el('rect', { x, y, width: 100, height: 100, class: 'sq-last' }, this.layers.marks);
        }
        if (sq === selected) el('rect', { x, y, width: 100, height: 100, class: 'sq-selected' }, this.layers.marks);
        if (sq === checkSq) el('circle', { cx: x + 50, cy: y + 50, r: 48, class: 'sq-check' }, this.layers.marks);

        // Coordinates along the bottom and left edges.
        const bottom = this.orientation === 'w' ? r === 1 : r === 8;
        const left = this.orientation === 'w' ? f === 0 : f === 7;
        const cls = light ? 'coord coord-on-light' : 'coord coord-on-dark';
        if (bottom) el('text', { x: x + 94, y: y + 95, class: cls, 'text-anchor': 'end' }, this.layers.labels).textContent = FILES[f];
        if (left) el('text', { x: x + 5, y: y + 19, class: cls }, this.layers.labels).textContent = r;
      }
    }
  }

  drawRings({ pieceRings, pieceIcons, selected }) {
    if (!pieceRings) return;
    for (const [sq, summary] of pieceRings) {
      const [x, y] = this.squareOrigin(sq);
      const cx = x + 50, cy = y + 50;
      const g = el('g', { class: 'piece-ring' + (sq === selected ? ' is-selected' : '') }, this.layers.rings);
      if (!summary || !summary.moves.length) {
        el('path', { d: arcPath(cx, cy, RING_IN + 2, RING_OUT - 2, 0, Math.PI * 2), class: 'ring-none' }, g);
        continue;
      }
      el('path', { d: arcPath(cx, cy, RING_IN - 1, RING_OUT + 1, 0, Math.PI * 2), class: 'ring-track' }, g);
      const n = summary.moves.length;
      const gap = n > 1 ? Math.min(0.06, Math.PI / n / 3) : 0;
      const step = (Math.PI * 2) / n;
      summary.moves.forEach((m, i) => {
        el('path', {
          d: arcPath(cx, cy, RING_IN, RING_OUT, i * step + gap / 2, (i + 1) * step - gap / 2),
          class: `seg cls-${m.cls}`,
        }, g);
      });
      // Star every piece that has at least one move rated Best.
      if (summary.best.cls === 'best') {
        el('path', { d: STAR_PATH, transform: `translate(${x + 88} ${y + 12})`, class: 'best-star' }, g);
      }
      const icon = pieceIcons?.get(sq);
      if (icon) this.drawIcon(g, x, y, icon);
    }
  }

  drawPieces({ pieces }) {
    for (const row of pieces) {
      for (const p of row) {
        if (!p) continue;
        const [x, y] = this.squareOrigin(p.square);
        el('image', {
          href: `pieces/${p.color}${p.type.toUpperCase()}.svg`,
          x, y, width: 100, height: 100,
          class: 'piece',
          'data-sq': p.square,
        }, this.layers.pieces);
      }
    }
  }

  drawDestinations({ destinations, destIcons, plainTargets, pieces, highlight }) {
    const occupied = new Set(pieces.flat().filter(Boolean).map(p => p.square));
    if (plainTargets) {
      for (const sq of plainTargets) {
        const [x, y] = this.squareOrigin(sq);
        if (occupied.has(sq)) el('circle', { cx: x + 50, cy: y + 50, r: 44, class: 'target-capture' }, this.layers.dests);
        else el('circle', { cx: x + 50, cy: y + 50, r: 13, class: 'target-dot' }, this.layers.dests);
      }
    }
    if (!destinations) return;
    for (const [sq, m] of destinations) {
      const [x, y] = this.squareOrigin(sq);
      const cx = x + 50, cy = y + 50;
      const g = el('g', { class: `dest cls-${m.cls}` + (sq === highlight ? ' is-hover' : '') }, this.layers.dests);
      if (occupied.has(sq)) {
        // Capture: ring around the target piece, filled to win%.
        el('path', { d: arcPath(cx, cy, RING_IN, RING_OUT, 0, Math.PI * 2), class: 'dest-track' }, g);
        el('path', { d: arcPath(cx, cy, RING_IN, RING_OUT, 0, Math.max(0.05, m.win / 100 * Math.PI * 2)), class: 'dest-arc' }, g);
      } else {
        el('circle', { cx, cy, r: DEST_IN - 1, class: 'dest-disc' }, g);
        el('path', { d: arcPath(cx, cy, DEST_IN, DEST_OUT, 0, Math.PI * 2), class: 'dest-track' }, g);
        el('path', { d: arcPath(cx, cy, DEST_IN, DEST_OUT, 0, Math.max(0.05, m.win / 100 * Math.PI * 2)), class: 'dest-arc' }, g);
      }
      if (m.cls === 'best') {
        el('path', { d: STAR_PATH, transform: `translate(${x + 86} ${y + 14}) scale(1.2)`, class: 'best-star' }, g);
      }
      const icon = destIcons?.get(sq);
      if (icon) this.drawIcon(g, x, y, icon, 1.2);
      const label = formatScore(m.score);
      const w = 10 + label.length * 10;
      el('rect', { x: cx - w / 2, y: y + 76, width: w, height: 22, rx: 11, class: 'dest-pill' }, g);
      el('text', { x: cx, y: y + 92, 'text-anchor': 'middle', class: 'dest-label' }, g).textContent = label;
    }
  }
}
