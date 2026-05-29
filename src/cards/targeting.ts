// src/cards/targeting.ts
//
// Pure helpers for computing a card's set of legal target squares (or
// answering precondition questions like "is there anything to revive?").
// Used by:
//
//   - the play controller, to highlight legal targets in the UI and to
//     refuse entering targeting mode when the card can't possibly do
//     anything; and
//   - the card AI, so the bot's heuristic uses the same definition of
//     "valid target" as the runtime effect.
//
// Keeping these here (a) avoids duplicating the rules between AI / UI /
// effect, and (b) makes them trivially testable in isolation.

import type { Square, PieceColor, PieceStr } from '../engine/types.ts';
import type { SuperChessState } from '../game/types.ts';
import { pieceColor, pieceType } from '../engine/board.ts';

type Board = ReadonlyArray<PieceStr | null>;

/** Squares a Pawn Retreat can land on from `fromSq` — one rank toward the
 * pawn's home rank (straight or diagonal), destination empty. Diagonal
 * retreats are non-capturing (matches the card's "retreat = run away,
 * not attack backwards" theme). The effect also rejects moves that
 * leave the king in check. */
export function pawnRetreatDestinations(
  fromSq: Square,
  color: PieceColor,
  board: Board,
): Square[] {
  const fromR = fromSq >> 3;
  const fromC = fromSq & 7;
  const backwardSign = color === 'w' ? 1 : -1;
  const destR = fromR + backwardSign;
  if (destR < 0 || destR > 7) return [];
  const out: Square[] = [];
  // Three candidates per pawn: straight back + two diagonal backs.
  // All require the destination to be empty.
  for (const dc of [-1, 0, 1]) {
    const destC = fromC + dc;
    if (destC < 0 || destC > 7) continue;
    const destSq = destR * 8 + destC;
    if (board[destSq] !== null) continue;
    out.push(destSq as Square);
  }
  return out;
}

/** Squares a Sidestep can land on: 1 diagonal step FORWARD (toward
 * opponent's home rank), destination empty. Up to 2 candidates per pawn. */
export function sidestepDestinations(
  fromSq: Square,
  color: PieceColor,
  board: Board,
): Square[] {
  const fromR = fromSq >> 3;
  const fromC = fromSq & 7;
  const forwardSign = color === 'w' ? -1 : 1;
  const destR = fromR + forwardSign;
  if (destR < 0 || destR > 7) return [];
  const out: Square[] = [];
  for (const dc of [-1, 1]) {
    const destC = fromC + dc;
    if (destC < 0 || destC > 7) continue;
    const destSq = destR * 8 + destC;
    if (board[destSq] !== null) continue;
    out.push(destSq as Square);
  }
  return out;
}

/** Empty squares on the player's back two ranks (white = rows 6-7,
 * black = rows 0-1). The set of squares a Resurrection can land on,
 * not counting the "must have an eligible captured piece" gate. */
export function resurrectionLandingSquares(
  state: SuperChessState,
  color: PieceColor,
): Set<Square> {
  const out = new Set<Square>();
  const back0 = color === 'w' ? 6 : 0;
  const back1 = color === 'w' ? 7 : 1;
  for (let sq = 0; sq < 64; sq++) {
    if (state.chess.board[sq] !== null) continue;
    const row = sq >> 3;
    if (row === back0 || row === back1) out.add(sq);
  }
  return out;
}

/** True iff the player has at least one captured R/B/N (own color) sitting
 * in the opponent's "I captured this from you" pile, i.e. Resurrection has
 * a piece to revive. The pile lives at `capturedByColor.get(opp)`. */
export function hasResurrectableCapturedPiece(
  state: SuperChessState,
  color: PieceColor,
): boolean {
  const opp: PieceColor = color === 'w' ? 'b' : 'w';
  const captured = state.superState.capturedByColor.get(opp) ?? [];
  for (const p of captured) {
    if (pieceColor(p) !== color) continue;
    const t = pieceType(p);
    if (t === 'R' || t === 'B' || t === 'N') return true;
  }
  return false;
}
