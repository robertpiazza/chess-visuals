# Chess Visuals

A browser chess trainer for standard chess. On your turn, every one of your pieces shows a ring rating its legal moves, so you can see at a glance which pieces have good options and which have only bad ones. Select a piece and each of its target squares shows how good that move is.

## What the board shows

**Rings on your pieces (nothing selected)**
- Each piece gets a pie ring with one slice per legal move, sorted best to worst clockwise from 12 o'clock.
- Slice colour is the move's quality: green Best, lime Good, yellow Inaccuracy, orange Mistake, red Blunder.
- A ★ marks every piece that has at least one move rated Best (the engine's top move, or a move tied with it on score).
- A faint grey ring means the piece has no legal moves.

**Selected piece**
- Each target square shows a disc tinted by the move's quality and an arc filled to your winning chance after that move.
- Targets rated Best also get a ★, as do their rows in the side panel.
- The label under it is the engine score in the standard convention, from White's side: +1.0 means White is about a pawn better, −1.0 Black, `#3` White mates in 3, `#-3` Black mates in 3. The win% arc and the percentages in the move list stay from the mover's side.
- The side panel lists the piece's moves with SAN, class, score and win %. Hover a row to highlight the square; click a row to play it.
- Promotion shows a picker with each choice rated.

**Moves played** are annotated with the rating they had when played (`?!`, `?`, `??`), for both you and the computer.

## Tactics and explanations

**Forced-tactic icons.** A purple badge marks moves that force a tactic: a dinner fork for a fork, a push pin for a pin, a kebab skewer for a skewer, a magnifying glass for a discovered attack or check, a cage for a trapped piece, a cracked shield for removing the defender (a capture that leaves another enemy piece hanging, even after the recapture), a weight for an overloaded piece (one enemy piece left as the only guard of two pieces you attack), and a flame for a sound sacrifice (pictograms in `web/js/icons.js`). A sacrifice is a move that gives up material (the piece can be taken, or it captures something worth less) that the engine still rates Best or Good; the card says whether its line mates, wins the material back, or plays for lasting pressure. A move qualifies when it creates the pattern right away, or when the pattern arrives on your next move in the engine's line after the opponent's best reply (for example, a check that drives the king onto a forking square). The badge is purple when the tactic works: the move is rated Best or Good and the engine's line wins at least two pawns of material (counted over the opponent's next few replies) or mates; a pin counts as soon as it exists. It is red when the move sets the tactic up right away but it doesn't pay off, because the engine rates the move lower or its line wins nothing; the "Why this move" card says which. The badge appears on the target square of the selected piece, in its move list, and on the ring of any piece that has such a move.

**Why this move.** Hover a target square, or click a row in the move list, to see:
- tactics the move creates: forks, pins, skewers, discovered attacks and checks, trapped pieces, mate threats, captures and threats (including attacks on undefended pawns), plus pieces it leaves hanging;
- for a move that loses ground, the opponent's expected reply and what it wins ("Allows Nxg5: wins the queen on g5 for free");
- gain of tempo: a developing or improving move that also makes a threat the opponent must answer ("Gains a tempo: develops the knight while attacking the undefended pawn on e5");
- principles it follows or breaks: center control, development, castling and king safety, early queen moves, moving a piece twice, trades when ahead or behind in material, the bishop pair, open files and the seventh rank, batteries (queen and bishop on a diagonal, or queen/rook pairs and doubled rooks on a file, aimed at the king's area, an enemy piece, or an open or half-open file), pawn breaks (a pawn move that challenges an enemy pawn, like c4 against ...d5), knight outposts (a square in the opponent's half guarded by your pawn that no enemy pawn can ever attack), bad bishops (a push that locks your central pawns on your bishop's colour, like e5 in the French), rooks and passed pawns (behind your own passer to support it or the opponent's to chase it, and not in front of your own where it blocks), the opposition in king and pawn endings (kings facing each other with one square between, or three or five for distant opposition), passed pawns, doubled or isolated pawns, piece activity, king activity in the endgame;
- a comparison with the engine's preferred move: what that move does that yours doesn't, or the line where the difference shows.

Arrows on the board show the same thing: teal for the move, purple for your tactic, red (dashed) for the opponent's answer. With nothing selected, the card reviews the last move by each side, and red arrows show what the opponent's last move threatens.

These are static pattern checks on the position (`web/js/tactics.js`, `web/js/principles.js`, combined in `web/js/explain.js`). They describe what a move sets up; the engine rating says whether it works.

## Openings library

`web/js/openings.js` holds about 70 named lines (Ruy Lopez, Italian, Sicilian Najdorf/Dragon, French, Caro-Kann, Queen's Gambit, King's Indian, Nimzo-Indian, London, English and others), each with its ECO code and a one-line idea.

- The **Opening** card names the current opening and lists the book moves from here, with the openings each one leads to. Click one to play it. Book moves also show as blue arrows.
- **Practice an opening** starts a game where the computer follows the chosen line and the card shows your next book move. If you leave the line it tells you where and what the book move was.
- Outside practice, the computer picks a random book move while one is available (skipping any the engine rates a mistake), so games start from varied, sound openings.

### How moves are rated

The engine scores every legal move (Stockfish MultiPV set to the number of legal moves). Each score is converted to a winning chance with Lichess's curve, `win% = 50 + 50 · (2 / (1 + e^(−0.00368208 · cp)) − 1)`, and a move's class comes from how many win% points it drops compared to the best move:

| Class | Drop vs. best move |
|---|---|
| Best | the engine's top score, or tied with it |
| Good | ≤ 6 (but not tied with the top) |
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
- Click or drag pieces to move. Clicked moves, the computer's moves and moves played from the side panel glide to their square in about 0.2 s (captured pieces fade, the rook slides when castling); dragged moves and systems with reduced motion turned on skip the animation. In the selected piece's move list, click a row to explain it and double-click to play it. `Esc` clears the selection.

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
    ├── tactics.js           # fork/pin/skewer/discovery/trap/hanging detection
    ├── principles.js        # positional commentary
    ├── explain.js           # combines both with the engine line; forced-tactic icons
    ├── openings.js          # opening library and lookup
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

## Link previews

`web/index.html` carries Open Graph and Twitter card tags, so a shared link shows a title, description and `web/og-image.png` (1200×630: a board with rated rings next to the title and main features). The tags point at `https://robertpiazza.com/chess-visuals/`; change `og:url`, `og:image`, `twitter:image` and the canonical link if the site moves.
