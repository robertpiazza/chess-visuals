// A small library of well-known openings. Each line is a SAN move sequence
// from the start position; shorter lines name the families that longer ones
// branch from.

export const OPENINGS = [
  // 1.e4 e5
  { eco: 'C20', name: "King's Pawn Game", moves: 'e4 e5', idea: 'Both sides claim the center with a pawn and open lines for the bishop and queen.' },
  { eco: 'C40', name: "King's Knight Opening", moves: 'e4 e5 Nf3', idea: 'Develops with tempo by attacking the e5 pawn.' },
  { eco: 'C44', name: "King's Knight Opening: Normal", moves: 'e4 e5 Nf3 Nc6', idea: 'Black defends e5 while developing.' },
  { eco: 'C60', name: 'Ruy Lopez', moves: 'e4 e5 Nf3 Nc6 Bb5', idea: 'Pressures the knight that defends e5; White aims for long-term central pressure.' },
  { eco: 'C78', name: 'Ruy Lopez: Morphy Defense', moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O', idea: 'The main line: Black questions the bishop, White castles and keeps the tension.' },
  { eco: 'C88', name: 'Ruy Lopez: Closed', moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O', idea: 'Slow maneuvering; White prepares d4 behind a solid center.' },
  { eco: 'C65', name: 'Ruy Lopez: Berlin Defense', moves: 'e4 e5 Nf3 Nc6 Bb5 Nf6', idea: 'Solid counterattack on e4; often leads to an early queen trade.' },
  { eco: 'C68', name: 'Ruy Lopez: Exchange Variation', moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6', idea: 'White gives the bishop pair to damage Black\'s pawns and aims for a better endgame.' },
  { eco: 'C50', name: 'Italian Game', moves: 'e4 e5 Nf3 Nc6 Bc4', idea: 'Points the bishop at f7, the weakest square near Black\'s king.' },
  { eco: 'C54', name: 'Italian Game: Giuoco Piano', moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3', idea: 'The quiet Italian: c3 and d3 build a sturdy center before expanding.' },
  { eco: 'C51', name: 'Evans Gambit', moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4', idea: 'Gives a pawn to gain time for c3 and d4 and a quick attack.' },
  { eco: 'C55', name: 'Two Knights Defense', moves: 'e4 e5 Nf3 Nc6 Bc4 Nf6', idea: 'Black counterattacks e4 instead of mirroring with ...Bc5.' },
  { eco: 'C57', name: 'Two Knights: Fried Liver setup', moves: 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5', idea: 'White attacks f7; Black must play precisely (5...Na5 is the main line).' },
  { eco: 'C45', name: 'Scotch Game', moves: 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4', idea: 'Opens the center right away for quick piece play.' },
  { eco: 'C44', name: 'Ponziani Opening', moves: 'e4 e5 Nf3 Nc6 c3', idea: 'Prepares d4 to build a big center.' },
  { eco: 'C47', name: 'Four Knights Game', moves: 'e4 e5 Nf3 Nc6 Nc3 Nf6', idea: 'Symmetrical, sound development of all four knights.' },
  { eco: 'C42', name: 'Petrov Defense', moves: 'e4 e5 Nf3 Nf6', idea: 'Black counterattacks e4 instead of defending e5; very solid.' },
  { eco: 'C41', name: 'Philidor Defense', moves: 'e4 e5 Nf3 d6', idea: 'Defends e5 with a pawn; solid but a little passive.' },
  { eco: 'C25', name: 'Vienna Game', moves: 'e4 e5 Nc3', idea: 'Develops the knight first, keeping the f-pawn free for f4.' },
  { eco: 'C30', name: "King's Gambit", moves: 'e4 e5 f4', idea: 'Gives a pawn to deflect e5 and open the f-file for an attack.' },
  { eco: 'C33', name: "King's Gambit Accepted", moves: 'e4 e5 f4 exf4', idea: 'Black takes the pawn; White develops fast and targets f7.' },
  { eco: 'C21', name: 'Danish Gambit', moves: 'e4 e5 d4 exd4 c3', idea: 'Gives up to two pawns for fast development and two bishops aimed at the king.' },
  { eco: 'C22', name: 'Center Game', moves: 'e4 e5 d4 exd4 Qxd4', idea: 'Opens the center at once, though the queen can be chased.' },

  // 1.e4 others
  { eco: 'B20', name: 'Sicilian Defense', moves: 'e4 c5', idea: 'Fights for d4 from the side and creates an unbalanced game.' },
  { eco: 'B56', name: 'Sicilian: Open', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3', idea: 'White trades the d-pawn for active pieces; Black gets the half-open c-file.' },
  { eco: 'B90', name: 'Sicilian: Najdorf', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6', idea: '...a6 keeps knights and bishops off b5 and prepares ...e5 or ...b5.' },
  { eco: 'B70', name: 'Sicilian: Dragon', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6', idea: 'The bishop on g7 bears down the long diagonal; races of opposite-side attacks.' },
  { eco: 'B80', name: 'Sicilian: Scheveningen', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6', idea: 'A compact center with pawns on d6 and e6.' },
  { eco: 'B33', name: 'Sicilian: Sveshnikov', moves: 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5', idea: 'Black takes space with ...e5, accepting a hole on d5 for active play.' },
  { eco: 'B44', name: 'Sicilian: Taimanov', moves: 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6', idea: 'Flexible setup; Black keeps options for the queen and dark-squared bishop.' },
  { eco: 'B22', name: 'Sicilian: Alapin', moves: 'e4 c5 c3', idea: 'Prepares d4 to build a full pawn center and avoid open Sicilian theory.' },
  { eco: 'B21', name: 'Smith-Morra Gambit', moves: 'e4 c5 d4 cxd4 c3', idea: 'A pawn for fast development and open files against Black\'s king.' },
  { eco: 'B23', name: 'Sicilian: Closed', moves: 'e4 c5 Nc3', idea: 'Keeps the center closed and plans a kingside pawn advance.' },
  { eco: 'C00', name: 'French Defense', moves: 'e4 e6', idea: 'Prepares ...d5 to challenge e4; solid, but the c8 bishop can get stuck.' },
  { eco: 'C11', name: 'French: Classical', moves: 'e4 e6 d4 d5 Nc3 Nf6', idea: 'Black adds pressure on e4 with the knight.' },
  { eco: 'C15', name: 'French: Winawer', moves: 'e4 e6 d4 d5 Nc3 Bb4', idea: 'Pins the c3 knight; Black often trades the bishop to damage White\'s pawns.' },
  { eco: 'C02', name: 'French: Advance', moves: 'e4 e6 d4 d5 e5', idea: 'White grabs space; Black attacks the pawn chain with ...c5.' },
  { eco: 'C01', name: 'French: Exchange', moves: 'e4 e6 d4 d5 exd5 exd5', idea: 'Symmetrical structure; frees Black\'s light-squared bishop.' },
  { eco: 'B10', name: 'Caro-Kann Defense', moves: 'e4 c6', idea: 'Prepares ...d5 while keeping the c8 bishop free to develop.' },
  { eco: 'B18', name: 'Caro-Kann: Classical', moves: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5', idea: 'Black develops the bishop outside the pawn chain before ...e6.' },
  { eco: 'B12', name: 'Caro-Kann: Advance', moves: 'e4 c6 d4 d5 e5', idea: 'White takes space; Black develops ...Bf5 and plays ...c5 or ...e6.' },
  { eco: 'B01', name: 'Scandinavian Defense', moves: 'e4 d5 exd5 Qxd5', idea: 'Strikes the center at once; the queen will lose a tempo after Nc3.' },
  { eco: 'B07', name: 'Pirc Defense', moves: 'e4 d6 d4 Nf6 Nc3 g6', idea: 'Lets White build a center, then attacks it with pieces and pawn breaks.' },
  { eco: 'B06', name: 'Modern Defense', moves: 'e4 g6', idea: 'Fianchettoes first and delays committing the central pawns.' },
  { eco: 'B02', name: "Alekhine's Defense", moves: 'e4 Nf6', idea: 'Invites White\'s pawns forward to make them targets.' },

  // 1.d4
  { eco: 'D00', name: "Queen's Pawn Game", moves: 'd4 d5', idea: 'Both sides stake a claim in the center with the d-pawn.' },
  { eco: 'D06', name: "Queen's Gambit", moves: 'd4 d5 c4', idea: 'Offers the c-pawn to pull Black\'s d-pawn away from the center.' },
  { eco: 'D30', name: "Queen's Gambit Declined", moves: 'd4 d5 c4 e6', idea: 'Black holds d5 with a pawn; solid, with the c8 bishop the main problem.' },
  { eco: 'D37', name: 'QGD: Classical', moves: 'd4 d5 c4 e6 Nc3 Nf6 Nf3 Be7', idea: 'Calm development; Black aims for ...O-O and a later ...c5 or ...dxc4.' },
  { eco: 'D32', name: 'QGD: Tarrasch Defense', moves: 'd4 d5 c4 e6 Nc3 c5', idea: 'Black accepts an isolated d-pawn for free piece play.' },
  { eco: 'D20', name: "Queen's Gambit Accepted", moves: 'd4 d5 c4 dxc4', idea: 'Black takes the pawn and gives it back later for quick development.' },
  { eco: 'D10', name: 'Slav Defense', moves: 'd4 d5 c4 c6', idea: 'Holds d5 with the c-pawn so the c8 bishop stays free.' },
  { eco: 'D43', name: 'Semi-Slav Defense', moves: 'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6', idea: 'Combines ...c6 and ...e6: very solid with sharp options.' },
  { eco: 'D02', name: 'London System', moves: 'd4 d5 Nf3 Nf6 Bf4', idea: 'A set-up opening: Bf4, e3, c3, Bd3 and Nbd2 against almost anything.' },
  { eco: 'E70', name: "King's Indian Defense", moves: 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6', idea: 'Black lets White build a big center, then strikes with ...e5 or ...c5.' },
  { eco: 'E20', name: 'Nimzo-Indian Defense', moves: 'd4 Nf6 c4 e6 Nc3 Bb4', idea: 'Pins the knight to stop e4; Black may give the bishop to double White\'s pawns.' },
  { eco: 'E12', name: "Queen's Indian Defense", moves: 'd4 Nf6 c4 e6 Nf3 b6', idea: 'Controls e4 from b7 with a fianchettoed bishop.' },
  { eco: 'E11', name: 'Bogo-Indian Defense', moves: 'd4 Nf6 c4 e6 Nf3 Bb4+', idea: 'A check that trades off pieces and keeps things solid.' },
  { eco: 'D80', name: 'Grünfeld Defense', moves: 'd4 Nf6 c4 g6 Nc3 d5', idea: 'Lets White take the center with pawns, then attacks it with pieces.' },
  { eco: 'E00', name: 'Catalan Opening', moves: 'd4 Nf6 c4 e6 g3', idea: 'The g2 bishop pressures the long diagonal toward Black\'s queenside.' },
  { eco: 'A57', name: 'Benko Gambit', moves: 'd4 Nf6 c4 c5 d5 b5', idea: 'Gives a pawn for open a- and b-files and lasting queenside pressure.' },
  { eco: 'A60', name: 'Modern Benoni', moves: 'd4 Nf6 c4 c5 d5 e6', idea: 'An imbalanced structure: White has more space, Black a queenside majority.' },
  { eco: 'A80', name: 'Dutch Defense', moves: 'd4 f5', idea: 'Controls e4 with a pawn and prepares a kingside attack.' },

  // Flank openings
  { eco: 'A10', name: 'English Opening', moves: 'c4', idea: 'Controls d5 from the side; flexible and positional.' },
  { eco: 'A20', name: 'English: Reversed Sicilian', moves: 'c4 e5', idea: 'A Sicilian with colors reversed and an extra tempo for White.' },
  { eco: 'A04', name: 'Réti Opening', moves: 'Nf3', idea: 'Develops first and keeps pawn moves flexible.' },
  { eco: 'A07', name: "King's Indian Attack", moves: 'Nf3 d5 g3', idea: 'A set-up with Nf3, g3, Bg2, O-O, d3 and e4, often aiming at the kingside.' },
  { eco: 'A02', name: "Bird's Opening", moves: 'f4', idea: 'Controls e5 with a pawn, like a Dutch with colors reversed.' },
  { eco: 'A01', name: 'Larsen Opening', moves: 'b3', idea: 'Fianchettoes the queen\'s bishop toward the long diagonal.' },
];

for (const o of OPENINGS) o.sans = o.moves.split(' ');

const startsWith = (seq, prefix) => prefix.length <= seq.length && prefix.every((m, i) => seq[i] === m);

// The most specific opening whose moves have all been played.
export function identifyOpening(history) {
  let best = null;
  for (const o of OPENINGS) {
    if (startsWith(history, o.sans) && (!best || o.sans.length > best.sans.length)) best = o;
  }
  return best;
}

// Book moves from here: each next move with the openings it leads toward.
export function bookContinuations(history) {
  const byMove = new Map();
  for (const o of OPENINGS) {
    if (o.sans.length > history.length && startsWith(o.sans, history)) {
      const san = o.sans[history.length];
      if (!byMove.has(san)) byMove.set(san, []);
      byMove.get(san).push(o);
    }
  }
  return [...byMove].map(([san, lines]) => ({
    san,
    // Prefer naming the shortest line it leads to, i.e. the next named stop.
    lines: lines.sort((a, b) => a.sans.length - b.sans.length),
  }));
}
