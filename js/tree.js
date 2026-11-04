// The game as a tree of moves. The first played (non-engine) child of each
// node is the main line, the line actually played; other children are
// variations: moves tried after stepping back, or engine lines inserted to
// show a follow-up. An engine line never becomes the main line.
// Nothing is ever deleted, so stepping back and forward never loses moves.
//
// A node is { id, parent, children, move, fen, engine, lastChild }:
//   move      chess.js verbose move that led here (null for the root)
//   fen       position after the move
//   engine    true for moves inserted from an engine line
//   lastChild the child last visited, so "forward" follows the branch you
//             were on rather than always the main line

export class MoveTree {
  constructor(rootFen) {
    this.root = { id: 0, parent: null, children: [], move: null, fen: rootFen, engine: false, lastChild: null };
    this.cursor = this.root;
    this.byId = new Map([[0, this.root]]);
    this.nextId = 1;
  }

  // Child of `parent` reached by `move`: the existing one if this move was
  // already played there, else a new one (the main line if it's the first
  // move from that position, a variation otherwise).
  add(parent, move, { engine = false } = {}) {
    const existing = parent.children.find(c => c.move.lan === move.lan);
    if (existing) {
      // Playing an engine move yourself makes it a played move.
      if (!engine) existing.engine = false;
      return existing;
    }
    const node = { id: this.nextId++, parent, children: [], move, fen: move.after, engine, lastChild: null };
    parent.children.push(node);
    this.byId.set(node.id, node);
    return node;
  }

  // Nodes from the root (exclusive) down to `node`.
  path(node = this.cursor) {
    const out = [];
    for (let n = node; n.parent; n = n.parent) out.unshift(n);
    return out;
  }

  // Move the cursor, remembering the route so "forward" retraces it.
  goTo(node) {
    for (let n = node; n.parent; n = n.parent) n.parent.lastChild = n;
    if (this.cursor.parent === node) node.lastChild = this.cursor;
    this.cursor = node;
  }

  // The main-line continuation: the first move actually played from here.
  main(node) {
    return node.children.find(c => !c.engine) ?? null;
  }

  next(node = this.cursor) {
    return node.lastChild ?? this.main(node) ?? node.children[0] ?? null;
  }

  // Last node of the line forward from `node`, following remembered routes.
  end(node = this.cursor) {
    let n = node;
    while (this.next(n)) n = this.next(n);
    return n;
  }

  isMainline(node) {
    for (let n = node; n.parent; n = n.parent) if (this.main(n.parent) !== n) return false;
    return true;
  }
}
