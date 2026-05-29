// src/ui/play/openings.ts
// Curated library of common chess openings used by the "opening pilot" —
// when active, the play controller PROPOSES the next move from this
// sequence, and the user explicitly confirms or rejects each one. The
// pilot disengages when:
//   • the line runs out,
//   • the opponent plays a move that isn't in this opening's book (i.e.,
//     not in the next move's `validAfter` list), OR
//   • the next move would be illegal in the current position (sanity check).
//
// Moves are stored in UCI long-algebraic notation (e.g. 'e2e4', 'e7e8q')
// because parsing UCI is a five-line job, whereas SAN disambiguation is
// not. UCI also round-trips cleanly through {from, to, promotion}.

import { algebraicToSquare } from '../../engine/board.ts';
import type { Square, PieceColor } from '../../engine/types.ts';

export type PilotPromotion = 'Q' | 'R' | 'B' | 'N' | null;

export interface PilotMove {
  from: Square;
  to: Square;
  promotion: PilotPromotion;
  /** Pretty label for the chip / log, e.g. "e4" or "Nf3". Pre-computed for
   * display because we don't have toAlgebraic context at definition time. */
  label: string;
  /** UCI moves the opponent must have played MOST RECENTLY for this canned
   * move to still be considered "in the opening". Empty means "no
   * constraint" — e.g. white's move 1 has no prior opponent move, and
   * universal systems like the London accept any reasonable opponent
   * setup. If the opponent plays anything NOT in this list, the pilot
   * disengages cleanly (line broken). */
  validAfter: string[];
}

export interface Opening {
  id: string;
  name: string;
  color: PieceColor;
  /** Short blurb shown under the name in the picker. */
  description: string;
  /** YOUR moves in order, each with the set of opponent replies that keep
   * it "in book". */
  moves: PilotMove[];
}

function parseMove(uci: string, label: string, validAfter: string[]): PilotMove {
  const from = algebraicToSquare(uci.slice(0, 2));
  const to = algebraicToSquare(uci.slice(2, 4));
  const promoChar = uci[4];
  const promotion = promoChar
    ? (promoChar.toUpperCase() as Exclude<PilotPromotion, null>)
    : null;
  return { from, to, promotion, label, validAfter };
}

/** Helper that takes triples of (uci, label, validAfter) and builds the
 * moves array. validAfter defaults to [] when omitted. */
function line(...rows: Array<[string, string] | [string, string, string[]]>): PilotMove[] {
  return rows.map((row) => parseMove(row[0], row[1], row[2] ?? []));
}

export const OPENINGS: Opening[] = [
  // ─── WHITE ─────────────────────────────────────────────────────────────
  {
    id: 'italian',
    name: 'Italian Game',
    color: 'w',
    description: 'Classic open game. Knights + bishop into the center fast.',
    moves: line(
      ['e2e4', 'e4'],                                  // move 1 — no prior
      ['g1f3', 'Nf3', ['e7e5']],                       // only after 1…e5
      ['f1c4', 'Bc4', ['b8c6', 'g8f6']],               // 2…Nc6 (italian) or Nf6 (two knights)
      ['c2c3', 'c3', ['f8c5', 'g8f6']],                // 3…Bc5 (italian classical) or Nf6
      ['d2d4', 'd4', ['f8c5', 'g8f6', 'd7d6', 'b8d4']],
    ),
  },
  {
    id: 'ruy-lopez',
    name: 'Ruy Lopez',
    color: 'w',
    description: 'Pin the knight defending Black\u2019s e-pawn. Old, deep, sound.',
    moves: line(
      ['e2e4', 'e4'],
      ['g1f3', 'Nf3', ['e7e5']],                       // open game
      ['f1b5', 'Bb5', ['b8c6']],                       // requires Nc6 to pin
      ['b1c3', 'Nc3', ['a7a6', 'g8f6', 'f8c5', 'd7d6', 'g7g6']],
    ),
  },
  {
    id: 'queens-gambit',
    name: "Queen's Gambit",
    color: 'w',
    description: 'Offer the c-pawn for fast central control.',
    moves: line(
      ['d2d4', 'd4'],
      ['c2c4', 'c4', ['d7d5']],                        // only a true QG if black plays d5
      ['b1c3', 'Nc3', ['e7e6', 'c7c6', 'd5c4', 'g8f6']],
      ['g1f3', 'Nf3', ['g8f6', 'e7e6', 'c7c6', 'd5c4']],
    ),
  },
  {
    id: 'london',
    name: 'London System',
    color: 'w',
    description: 'Solid, low-theory setup. Bishop on f4 every game.',
    moves: line(
      ['d2d4', 'd4'],
      ['g1f3', 'Nf3'],                                 // universal — no constraint
      ['c1f4', 'Bf4'],
      ['e2e3', 'e3'],
      ['f1d3', 'Bd3'],
      ['b1d2', 'Nbd2'],
    ),
  },
  {
    id: 'english',
    name: 'English Opening',
    color: 'w',
    description: 'Flank opening. Fight for d5 from the wing.',
    moves: line(
      ['c2c4', 'c4'],
      ['g1f3', 'Nf3'],
      ['g2g3', 'g3'],
      ['f1g2', 'Bg2'],
    ),
  },
  {
    id: 'kia',
    name: "King's Indian Attack",
    color: 'w',
    description: 'Universal system. Fianchetto + Nf3 + e4 against most setups.',
    moves: line(
      ['g1f3', 'Nf3'],
      ['g2g3', 'g3'],
      ['f1g2', 'Bg2'],
      ['e1g1', 'O-O'],
      ['d2d3', 'd3'],
      ['e2e4', 'e4'],
    ),
  },

  // ─── BLACK ─────────────────────────────────────────────────────────────
  {
    id: 'sicilian',
    name: 'Sicilian Defense',
    color: 'b',
    description: 'Sharp answer to 1.e4. Imbalanced positions, lots of play.',
    moves: line(
      ['c7c5', 'c5', ['e2e4']],                        // sicilian needs 1.e4
      ['d7d6', 'd6', ['g1f3', 'b1c3', 'd2d4']],        // standard 2nd-move tries
      ['g8f6', 'Nf6', ['d2d4', 'c2c4', 'b1c3', 'g1f3']],
      ['b8c6', 'Nc6'],
    ),
  },
  {
    id: 'french',
    name: 'French Defense',
    color: 'b',
    description: 'Solid pawn chain vs 1.e4. Closed positions.',
    moves: line(
      ['e7e6', 'e6', ['e2e4']],                        // french needs 1.e4
      ['d7d5', 'd5', ['d2d4', 'd2d3', 'b1c3', 'g1f3', 'b1d2']],
      ['g8f6', 'Nf6', ['b1c3', 'e4e5', 'b1d2', 'g1f3']],
      ['f8e7', 'Be7'],
    ),
  },
  {
    id: 'caro-kann',
    name: 'Caro-Kann',
    color: 'b',
    description: 'Solid + flexible defense. Fewer weaknesses than the French.',
    moves: line(
      ['c7c6', 'c6', ['e2e4']],                        // caro-kann needs 1.e4
      ['d7d5', 'd5', ['d2d4', 'd2d3', 'b1c3', 'g1f3', 'b1d2']],
      ['b8c6', 'Nc6'],
      ['g8f6', 'Nf6'],
    ),
  },
  {
    id: 'kings-indian-def',
    name: "King's Indian Defense",
    color: 'b',
    description: 'Fianchetto vs 1.d4. Let white have the center, then strike.',
    moves: line(
      ['g8f6', 'Nf6', ['d2d4', 'c2c4', 'g1f3']],       // versus most non-1.e4
      ['g7g6', 'g6', ['c2c4', 'b1c3', 'g1f3', 'g2g3']],
      ['f8g7', 'Bg7'],
      ['d7d6', 'd6'],
      ['e8g8', 'O-O'],
    ),
  },
  {
    id: 'modern',
    name: 'Modern Defense',
    color: 'b',
    description: 'Hyper-modern. Let the opponent build a big center, then attack it.',
    moves: line(
      ['g7g6', 'g6', ['e2e4', 'd2d4', 'c2c4', 'g1f3']],
      ['f8g7', 'Bg7'],
      ['d7d6', 'd6'],
      ['b8c6', 'Nc6'],
    ),
  },
  {
    id: 'slav',
    name: 'Slav Defense',
    color: 'b',
    description: 'Defend d5 with c6 vs the Queen\u2019s Gambit. Solid + flexible.',
    moves: line(
      ['d7d5', 'd5', ['d2d4']],                        // slav vs Queen's pawn
      ['c7c6', 'c6', ['c2c4']],                        // committed slav after 2.c4
      ['g8f6', 'Nf6', ['b1c3', 'g1f3', 'c4d5']],
      ['c8f5', 'Bf5'],
    ),
  },
];

export function findOpening(id: string | null | undefined): Opening | null {
  if (!id) return null;
  return OPENINGS.find((o) => o.id === id) ?? null;
}

export function openingsForColor(color: PieceColor): Opening[] {
  return OPENINGS.filter((o) => o.color === color);
}

/** Convert a Move's {from, to, promotion} into the same UCI form we use
 * in `validAfter`. Used by the controller to check whether the opponent's
 * last move is in our book. */
export function moveToUci(from: Square, to: Square, promotion: PilotPromotion | string | null): string {
  const fromAlg = squareToUciCoord(from);
  const toAlg = squareToUciCoord(to);
  if (!promotion) return fromAlg + toAlg;
  // promotion may be a single letter ('Q') or a piece string ('wQ').
  const c = promotion.length === 1 ? promotion : promotion[1];
  return fromAlg + toAlg + c.toLowerCase();
}

function squareToUciCoord(sq: Square): string {
  // Same encoding as squareToAlgebraic but inline to avoid a circular import
  // (squareToAlgebraic lives in board.ts which doesn't import from us, but
  // openings.ts is leaf-y and we'd like to keep it that way).
  const file = sq % 8;
  const rank = Math.floor(sq / 8);
  return 'abcdefgh'[file] + (8 - rank);
}
