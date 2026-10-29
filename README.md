# Chess Visuals

A browser chess trainer for standard chess. On your turn, every one of your pieces shows a ring rating its legal moves, so you can see at a glance which pieces have good options and which have only bad ones. Select a piece and each of its target squares shows how good that move is.

## What the board shows

**Rings on your pieces (nothing selected)**
- Each piece gets a pie ring with one slice per legal move, sorted best to worst clockwise from 12 o'clock.
- Slice colour is the move's quality: green Best, lime Good, yellow Inaccuracy, orange Mistake, red Blunder.
- A ★ marks every piece that has at least one move rated Best (the top move, plus any within 2 win% points of it).
- A faint grey ring means the piece has no legal moves.

**Selected piece**
- Each target square shows a disc tinted by the move's quality and an arc filled to your winning chance after that move.
- Targets rated Best also get a ★, as do their rows in the side panel.
- The label under it is the engine score from your side (+1.0 is a pawn up for you, `#3` is mate in 3).
- The side panel lists the piece's moves with SAN, class, score and win %. Hover a row to highlight the square; click a row to play it.
- Promotion shows a picker with each choice rated.

**Moves played** are annotated with the rating they had when played (`?!`, `?`, `??`), for both you and the computer.

### How moves are rated

The engine scores every legal move (Stockfish MultiPV set to the number of legal moves). Each score is converted to a winning chance with Lichess's curve, `win% = 50 + 50 · (2 / (1 + e^(−0.00368208 · cp)) − 1)`, and a move's class comes from how many win% points it drops compared to the best move:

| Class | Drop vs. best move |
|---|---|
| Best | ≤ 2 (the top move is always Best) |
| Good | ≤ 6 |
| Inaccuracy | ≤ 12 |
| Mistake | ≤ 22 |
| Blunder | > 22 |

Thresholds live in `web/js/analysis.js`.

## Engines

- **Stockfish 18 lite** (single-threaded WASM, about 7 MB) runs in a Web Worker. Ratings refine as each search depth finishes; the "Rating depth" slider sets the final depth.
- **Built-in search** (`web/js/engine/search.js`): a small alpha-beta search with quiescence on its own 0x88 move generator. It is used automatically if Stockfish can't load, and can be forced with `?engine=builtin` in the URL. It is much weaker (depth 2–6) but catches hanging pieces and short tactics.

The computer opponent uses the same ratings. "Computer strength" 20 always plays the best move; lower values let it pick worse moves, weighted toward the better ones, and search less deeply.

## Controls

- **Game**: play White or Black against the computer, or "Both sides" to rate moves for whoever is to move.
- **Undo** steps back to your previous turn. **Flip** turns the board.
- **Load position (FEN)** starts from any position.
- Click or drag pieces to move. `Esc` clears the selection.

## Running locally

ES modules and Web Workers need an HTTP server (not `file://`):

```bash
npm start            # python3 -m http.server 8080 --directory web
```

Then open <http://localhost:8080>.

```bash
npm test             # perft, rating logic, search and UCI parsing tests
```

## File structure

```
web/
├── index.html
├── css/style.css
├── pieces/                  # cburnett piece SVGs
├── vendor/
│   ├── chess.js             # chess.js 1.4.0 (rules, SAN, game state)
│   └── stockfish/           # Stockfish 18 lite single-threaded build
└── js/
    ├── main.js              # game flow, computer opponent, side panel
    ├── board.js             # SVG board, piece rings, move markers, drag/click input
    ├── analysis.js          # win%, move classes, per-piece summaries
    └── engine/
        ├── engine.js        # Stockfish UCI wrapper and built-in engine wrapper
        ├── builtin-worker.js
        ├── search.js        # built-in alpha-beta search
        └── position.js      # 0x88 move generator used by the search
test/                        # node --test suites
```

Pushing to `main` runs the tests and deploys `web/` to the `gh-pages` branch (`.github/workflows/deploy.yml`). Enable GitHub Pages on that branch in the repository settings.

## Third-party code and assets

- [Stockfish.js](https://github.com/nmrugg/stockfish.js) 18.0.8, GPL-3.0 (`web/vendor/stockfish/COPYING.txt`).
- [chess.js](https://github.com/jhlywa/chess.js) 1.4.0, BSD-2-Clause (`web/vendor/chess.js.LICENSE`).
- Piece images: Colin M.L. Burnett's "cburnett" set (GPLv2+ / BSD / GFDL), taken from [chessground](https://github.com/lichess-org/chessground).
- Win% curve and class idea from [Lichess](https://lichess.org).
