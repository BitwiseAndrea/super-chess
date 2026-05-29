// src/cards/cardAI.ts
//
// Heuristic card AI scoring. Used by HeuristicCardAI to decide whether
// to play a card on its turn and which target to use.
//
// ─── Design ──────────────────────────────────────────────────────────
//
// Older versions used hand-rolled per-card heuristics that picked one
// "best" target via shallow inspection (e.g. "freeze the most valuable
// opponent piece"). That worked for simple cards but left obvious money
// on the table:
//
//   • Freeze always picked the queen even when she wasn't doing
//     anything; meanwhile a knight sitting on f6 was about to capture
//     our hanging rook.
//   • Shield happily covered defended pieces; it didn't notice when a
//     rook was actually hanging.
//   • Foul Ground placed in a random central square instead of blocking
//     where the opponent was going to land.
//   • Coup blew its strongest card on a piece we could just take with a
//     pawn next turn.
//
// The new approach is structurally smarter: for each card in hand we
// generate a small set of plausible (target) candidates, then we
// SIMULATE each candidate (apply the card to a copy of the state) and
// SCORE the resulting position. The score combines:
//
//   1. eval delta  — engine cp eval of the position after the card play
//                   minus the eval before. Positive = the card improved
//                   our material/positional standing.
//   2. saved threat — how much material the opponent could have captured
//                   from the BEFORE state minus how much they can capture
//                   from the AFTER state. This is what makes Freeze /
//                   Shield / Foul Ground actually look smart: if we
//                   freeze the piece that was about to take our queen,
//                   `saved` jumps by ~900cp.
//   3. small bonuses — catch-up when losing, tempo penalty for cards
//                     that consume the whole turn (you skip your chess
//                     move, that has real value), light noise so the
//                     bot isn't perfectly predictable.
//
// Because every card's score is in centipawns, PLAY_THRESHOLD is also
// in centipawns: roughly "don't play a card unless it's worth at least
// half a pawn".
//
// ─── Performance notes ───────────────────────────────────────────────
//
// `evaluate` is a single 64-square loop, so eval calls are trivially
// cheap. The expensive bit is generateLegal for the opponent-threat
// estimator; we cache it once per scoreCard call (the BEFORE value)
// and recompute only the AFTER value per candidate. With at most a
// few dozen candidates per card, total work per turn is well under a
// millisecond on a laptop.

import type { PieceColor, Square, Move } from '../engine/types.ts';
import type { SuperChessState, CardTarget } from '../game/types.ts';
import type { CardInstance } from './types.ts';
import {
  pieceType,
  pieceColor,
  generateLegal,
  totalMaterial,
} from '../engine/index.ts';
import { evaluate } from '../engine/evaluate.ts';
import { getSuperChessLegalMoves } from '../game/rules.ts';
import { CARD_EFFECTS } from './effects.ts';
import {
  resurrectionLandingSquares,
  hasResurrectableCapturedPiece,
  pawnRetreatDestinations,
  sidestepDestinations,
} from './targeting.ts';

// ─── Public API ──────────────────────────────────────────────────────

export interface CardSuggestion {
  card: CardInstance;
  target: CardTarget;
  score: number;
}

/** Score a single card-in-hand with its best target. Score is in
 * centipawns; positive = playing this card looks good for `color`. */
export function scoreCard(
  card: CardInstance,
  state: SuperChessState,
  color: PieceColor,
): { score: number; target: CardTarget } {
  // Cache the "what could opp capture from us right now?" value so we
  // don't recompute it for every candidate of every card.
  const oppMaxCaptureBefore = maxCaptureValueFor(state, opponent(color));
  // Cache "what's our best capture available right now?" — this is
  // the baseline against which "ability cards" (Knight's Path, Ghost
  // Step, Teleport, etc) prove their value. They don't change
  // material directly; they unlock NEW attacking opportunities, which
  // we measure as the delta in our own best capture value.
  const ownMaxCaptureBefore = maxCaptureValueFor(state, color);

  const candidates = generateCandidates(card, state, color);
  if (candidates.length === 0) return { score: 0, target: {} };

  let bestScore = -Infinity;
  let bestTarget: CardTarget = candidates[0];

  for (const candidate of candidates) {
    const after = simulate(state, color, card, candidate);
    if (after === null) continue; // illegal / no-op

    const evalDelta = colorEval(after, color) - colorEval(state, color);
    const oppMaxCaptureAfter = maxCaptureValueFor(after, opponent(color));
    const ownMaxCaptureAfter = maxCaptureValueFor(after, color);
    const savedThreat = oppMaxCaptureBefore - oppMaxCaptureAfter;
    // Half-weight on offensive gain — we haven't actually captured
    // yet, opp may defend, and we still need to spend our chess move
    // to realise it. Half feels right empirically: enough to make
    // Knight's Path / Teleport play themselves when they unlock a
    // queen, but not enough to make us play them speculatively.
    const offensiveGain = (ownMaxCaptureAfter - ownMaxCaptureBefore) * 0.5;

    let score = evalDelta + savedThreat + offensiveGain;

    // Cards that consume the whole turn cost us a chess move. Charge
    // a tempo penalty so they're only played when the gain is real.
    if (card.definition.consumesTurn) score -= 80;

    score += contextBonus(card, state, color);
    score += (Math.random() - 0.5) * 12; // mild variety, no hard ties

    if (score > bestScore) {
      bestScore = score;
      bestTarget = candidate;
    }
  }

  return { score: bestScore, target: bestTarget };
}

/** Minimum centipawn gain required before the bot will play a card.
 * Calibrated for the eval-delta scale (1 pawn = 100). */
export const PLAY_THRESHOLD = 50;

// ─── Helpers ─────────────────────────────────────────────────────────

const PIECE_VAL: Record<string, number> = { Q: 900, R: 500, B: 320, N: 300, P: 100, K: 0 };

function opponent(c: PieceColor): PieceColor {
  return c === 'w' ? 'b' : 'w';
}

function evalCtx(state: SuperChessState) {
  return {
    frozenSquares: new Set(state.superState.frozenSquares.keys()),
    shieldedSquares: new Set(state.superState.shieldedSquares.keys()),
    foulSquares: new Map(state.superState.foulSquares),
  };
}

/** Engine eval, color-positive (so "bigger = better for `color`"). */
function colorEval(state: SuperChessState, color: PieceColor): number {
  const wp = evaluate(state.chess, evalCtx(state));
  return color === 'w' ? wp : -wp;
}

/** Apply a card to a copy of the state and return the resulting state.
 * Returns null if the card was a no-op (illegal target, missing
 * precondition, etc) — those candidates are skipped. */
function simulate(
  state: SuperChessState,
  color: PieceColor,
  card: CardInstance,
  target: CardTarget,
): SuperChessState | null {
  const effect = CARD_EFFECTS[card.definition.name];
  if (!effect) return null;
  let result;
  try {
    result = effect(state, color, target);
  } catch {
    return null;
  }
  if (result.newState === state) return null;
  return result.newState;
}

/** Estimate the maximum material `mover` could grab on their next move
 * starting from `state`. Used both for "what threats are we under?"
 * (when mover = opp) and "what threats can we make?" (mover = us).
 *
 * Uses getSuperChessLegalMoves so Knight's Path / Ghost Step / Fortify
 * extra moves, Disrupt's must-move-type filter, and Foul Ground's
 * destination filter are all reflected in the candidate set. That's
 * what lets the AI "see" the value of cards whose only effect is to
 * change which moves are available next turn.
 *
 * Subtleties handled:
 *   • The state's chess.turn might not be `mover` (we're often called
 *     during our own card phase to ask "what could opp do TO us next?").
 *     We flip turn for the move-gen call only.
 *   • CRITICAL: getSuperChessLegalMoves calls generateLegal which uses
 *     applyMoveInPlace + undoMove for legality testing. We MUST run
 *     it on a defensive board clone — otherwise any residue from a
 *     buggy undoMove (en-passant edge cases, super-chess interactions,
 *     etc) leaks back into the live state and corrupts the actual
 *     game. We saw this in production: a phantom black pawn appeared
 *     on the en-passant target square because the AI's threat
 *     estimator mutated the live board while scoring candidates.
 *   • Captures of shielded pieces are filtered out (rules.ts would
 *     reject them at validation time, so the AI shouldn't count them).
 *   • Frozen pieces are excluded by getSuperChessLegalMoves directly. */
function maxCaptureValueFor(state: SuperChessState, mover: PieceColor): number {
  const board = state.chess.board;
  // Always shape a clone-with-fresh-board: the move generator runs
  // applyMoveInPlace/undoMove cycles internally and any leak corrupts
  // the live state. The cost is one Array.from(board) — negligible.
  const flipped: SuperChessState = {
    ...state,
    chess: {
      ...state.chess,
      board: [...state.chess.board],
      castlingRights: { ...state.chess.castlingRights },
      turn: mover,
    },
  };

  let moves: Move[];
  try {
    moves = getSuperChessLegalMoves(flipped, mover);
  } catch {
    // Defensive fallback: raw movegen if super-chess rules choke on
    // the flipped state. Worse signal but avoids exploding.
    try {
      moves = generateLegal(flipped.chess, new Set(state.superState.frozenSquares.keys()));
    } catch {
      return 0;
    }
  }

  const shielded = state.superState.shieldedSquares;
  let maxVal = 0;
  for (const m of moves) {
    if (!m.capture) continue;
    if (shielded.has(m.to)) continue; // would be rejected by validateSuperChessMove
    // Look up the captured piece on the board (m.capture is the piece
    // string but we want its TYPE for the value table).
    const capturedPiece = board[m.to] ?? m.capture;
    if (!capturedPiece) continue;
    const v = PIECE_VAL[pieceType(capturedPiece) as string] ?? 0;
    if (v > maxVal) maxVal = v;
  }
  return maxVal;
}

/** Per-card extras that aren't captured by eval-delta + saved-threat.
 * Kept narrow on purpose — the candidate-and-simulate loop already
 * does most of the work. These are the soft preferences that nudge
 * the bot toward stylish play. */
function contextBonus(card: CardInstance, state: SuperChessState, color: PieceColor): number {
  const myMat = totalMaterial(state.chess.board, color);
  const oppMat = totalMaterial(state.chess.board, opponent(color));
  const losing = myMat < oppMat - 200;
  const catchUp = losing ? 25 : 0;

  switch (card.definition.name) {
    case 'Time Warp':
      // One-shot card. Save it for "I'm clearly losing".
      if (state.superState.timeWarpUsed.get(color)) return -1000; // already used → never play
      return losing ? 60 : -100; // strongly avoid when even/winning
    case 'Resurrection':
      // Hugely useful when material-down; lukewarm otherwise.
      return catchUp + 20;
    case 'Coup':
      // Coup is high-value because it's a free piece removal — give
      // it a flat boost so the AI prefers it when several cards score
      // similarly.
      return 10;
    case 'Extra Move':
      return losing ? 30 : 10;
    case 'Pawn Storm':
      // Pawn Storm without a clear material gain is just spending a
      // chess move on a pawn push wave — usually worse than a normal
      // move. Tempo penalty already applied; no extra bonus here.
      return 0;
    case 'Mirror':
      // Only useful if there's a last move to mirror.
      if (!state.superState.lastMove) return -1000;
      return 0;
    default:
      return catchUp;
  }
}

// ─── Candidate generation ────────────────────────────────────────────
//
// For each card we enumerate a small, plausible set of `CardTarget`
// values. The simulate-and-score loop figures out which one is
// actually best. This keeps per-card logic minimal — we just have to
// enumerate REASONABLE plays, not optimal ones.

function generateCandidates(
  card: CardInstance,
  state: SuperChessState,
  color: PieceColor,
): CardTarget[] {
  const board = state.chess.board;
  const opp = opponent(color);
  const out: CardTarget[] = [];

  // Own pieces that the opponent has frozen are an absolute lockdown \u2014
  // the bot must not propose card plays that target them. Engine-level
  // freeze enforcement only covers chess moves; cards bypass that path.
  const isOwnFrozen = (sq: number): boolean => {
    const t = state.superState.frozenSquares.get(sq);
    return t !== undefined && t > 0;
  };

  switch (card.definition.name) {
    case 'Freeze': {
      // Try freezing each opp non-king, non-already-frozen piece.
      for (let sq = 0; sq < 64; sq++) {
        const p = board[sq];
        if (!p || pieceColor(p) !== opp) continue;
        if (pieceType(p) === 'K') continue;
        if (state.superState.frozenSquares.has(sq)) continue;
        out.push({ oppPieceSquare: sq as Square });
      }
      break;
    }

    case 'Shield': {
      // Try shielding each own non-king, non-already-shielded piece.
      for (let sq = 0; sq < 64; sq++) {
        const p = board[sq];
        if (!p || pieceColor(p) !== color) continue;
        if (pieceType(p) === 'K') continue;
        if (state.superState.shieldedSquares.has(sq)) continue;
        if (isOwnFrozen(sq)) continue;
        out.push({ ownPieceSquare: sq as Square });
      }
      break;
    }

    case 'Foul Ground': {
      // Two strategies, both encoded by enumeration:
      //   1. Block the destination of the opponent's best capture.
      //      This is implicit — we enumerate all squares opp can move
      //      to with a capture, plus a handful of central squares as a
      //      fallback. Saved-threat scoring will pick the right one.
      //   2. Cover central squares the opp would want to develop into.
      const candidates = new Set<number>();
      // (1) destination squares of every opp legal move targeting an
      //     own-colour or empty square in the heart of the board. We
      //     don't filter by capture — Foul Ground is also useful for
      //     denying tempo squares.
      try {
        // Defensive board clone — generateLegal applies/undoes moves
        // in-place and we MUST NOT corrupt the live board if undoMove
        // ever leaves residue. (Same hazard as maxCaptureValueFor.)
        const flipped = {
          ...state.chess,
          board: [...state.chess.board],
          castlingRights: { ...state.chess.castlingRights },
          turn: opp,
        };
        const frozen = new Set(state.superState.frozenSquares.keys());
        for (const m of generateLegal(flipped, frozen)) {
          if (board[m.to] === null) candidates.add(m.to); // foul ground requires empty
        }
      } catch { /* fall through to centrals */ }
      // (2) baseline central squares — some games have no legal opp
      //     captures, but we still want a play.
      for (const sq of [27, 28, 35, 36, 18, 21, 42, 45]) {
        if (board[sq] === null) candidates.add(sq);
      }
      for (const sq of candidates) out.push({ square: sq as Square });
      break;
    }

    case 'Coup': {
      for (let sq = 0; sq < 64; sq++) {
        const p = board[sq];
        if (!p || pieceColor(p) !== opp || pieceType(p) === 'K') continue;
        out.push({ oppPieceSquare: sq as Square });
      }
      break;
    }

    case 'Resurrection': {
      if (!hasResurrectableCapturedPiece(state, color)) break;
      const landings = resurrectionLandingSquares(state, color);
      for (const sq of landings) out.push({ square: sq });
      break;
    }

    case 'Teleport': {
      // From: any own non-king piece. To: empty central square OR any
      // empty square the moved piece would attack a more-valuable opp
      // piece from. We keep the candidate set small by limiting "to"
      // to a curated central set + the destination of any cheap
      // capture-looking square.
      const tos: number[] = [];
      for (const sq of [27, 28, 35, 36, 18, 19, 20, 21, 26, 29, 34, 37, 42, 43, 44, 45]) {
        if (board[sq] === null) tos.push(sq);
      }
      for (let from = 0; from < 64; from++) {
        const p = board[from];
        if (!p || pieceColor(p) !== color || pieceType(p) === 'K') continue;
        if (isOwnFrozen(from)) continue;
        for (const to of tos) {
          if (to === from) continue;
          out.push({ ownPieceSquare: from as Square, square: to as Square });
        }
      }
      break;
    }

    case "Knight's Path": {
      // Try giving knight-movement to each of our own non-king pieces.
      // (Actually pointless on a knight, but eval will sort it out.)
      for (let sq = 0; sq < 64; sq++) {
        const p = board[sq];
        if (!p || pieceColor(p) !== color || pieceType(p) === 'K') continue;
        if (isOwnFrozen(sq)) continue;
        out.push({ ownPieceSquare: sq as Square });
      }
      break;
    }

    case 'Ghost Step': {
      // Sliding pieces only (knights ignore blocking already).
      for (let sq = 0; sq < 64; sq++) {
        const p = board[sq];
        if (!p || pieceColor(p) !== color) continue;
        const t = pieceType(p);
        if (t === 'K' || t === 'N') continue;
        if (isOwnFrozen(sq)) continue;
        out.push({ ownPieceSquare: sq as Square });
      }
      break;
    }

    case 'Disrupt': {
      // Force opp's strongest existing piece type to be the one they
      // must move. The simulator scoring sorts out which choice is
      // most disruptive.
      for (const t of ['Q', 'R', 'B', 'N', 'P'] as const) {
        if (board.some((p) => p && pieceColor(p) === opp && pieceType(p) === t)) {
          out.push({ pieceType: t });
        }
      }
      break;
    }

    case 'Fortify': {
      for (let sq = 0; sq < 64; sq++) {
        const p = board[sq];
        if (!p || pieceColor(p) !== color || pieceType(p) !== 'P') continue;
        if (isOwnFrozen(sq)) continue;
        out.push({ ownPieceSquare: sq as Square });
      }
      break;
    }

    case 'Double Step': {
      // Pawn whose two-step destination is clear. Geometric filter
      // here; deeper plausibility (en-passant exposure, etc) handled
      // by the simulator + eval.
      for (let sq = 0; sq < 64; sq++) {
        const p = board[sq];
        if (!p || pieceColor(p) !== color || pieceType(p) !== 'P') continue;
        if (isOwnFrozen(sq)) continue;
        const dir = color === 'w' ? -8 : 8;
        const mid = sq + dir;
        const dest = sq + dir * 2;
        if (dest < 0 || dest >= 64) continue;
        if (board[mid] !== null || board[dest] !== null) continue;
        out.push({ ownPieceSquare: sq as Square });
      }
      break;
    }

    case 'Pawn Retreat': {
      for (let sq = 0; sq < 64; sq++) {
        const p = board[sq];
        if (!p || pieceColor(p) !== color || pieceType(p) !== 'P') continue;
        if (isOwnFrozen(sq)) continue;
        for (const dest of pawnRetreatDestinations(sq as Square, color, board)) {
          out.push({ ownPieceSquare: sq as Square, square: dest });
        }
      }
      break;
    }

    case 'Sidestep': {
      for (let sq = 0; sq < 64; sq++) {
        const p = board[sq];
        if (!p || pieceColor(p) !== color || pieceType(p) !== 'P') continue;
        if (isOwnFrozen(sq)) continue;
        for (const dest of sidestepDestinations(sq as Square, color, board)) {
          out.push({ ownPieceSquare: sq as Square, square: dest });
        }
      }
      break;
    }

    case 'Retreat': {
      // Move any own non-king piece up to 2 ranks back. Enumerate the
      // cross-product (piece × empty back-rank/back-2-rank squares).
      const backRows = color === 'w' ? [7, 6] : [0, 1];
      const tos: number[] = [];
      for (const row of backRows) {
        for (let col = 0; col < 8; col++) {
          const sq = row * 8 + col;
          if (board[sq] === null) tos.push(sq);
        }
      }
      for (let from = 0; from < 64; from++) {
        const p = board[from];
        if (!p || pieceColor(p) !== color || pieceType(p) === 'K') continue;
        if (isOwnFrozen(from)) continue;
        for (const to of tos) {
          if (from === to) continue;
          out.push({ ownPieceSquare: from as Square, square: to as Square });
        }
      }
      break;
    }

    case 'Swap': {
      // Cross-product of own non-king pieces. We cap at the first 6
      // pieces by index to keep the candidate count manageable; in
      // practice the bot rarely benefits from more than a handful.
      const ownPieces: number[] = [];
      for (let sq = 0; sq < 64; sq++) {
        const p = board[sq];
        if (p && pieceColor(p) === color && pieceType(p) !== 'K') {
          if (isOwnFrozen(sq)) continue;
          ownPieces.push(sq);
          if (ownPieces.length >= 8) break;
        }
      }
      for (let i = 0; i < ownPieces.length; i++) {
        for (let j = i + 1; j < ownPieces.length; j++) {
          out.push({
            ownPieceSquare: ownPieces[i] as Square,
            secondOwnPieceSquare: ownPieces[j] as Square,
          });
        }
      }
      break;
    }

    case 'Trade': {
      // Trade's effect ignores the target argument and auto-picks the
      // most-advanced own pawn / least-advanced opp pawn. So a single
      // candidate is enough \u2014 the simulator + scorer decide whether
      // the swap helps or hurts.
      out.push({});
      break;
    }

    case 'Promotion Rush': {
      for (let sq = 0; sq < 64; sq++) {
        const p = board[sq];
        if (!p || pieceColor(p) !== color || pieceType(p) !== 'P') continue;
        if (isOwnFrozen(sq)) continue;
        out.push({ ownPieceSquare: sq as Square });
      }
      break;
    }

    case 'Pawn Storm':
    case 'Mirror':
    case 'Time Warp':
    case 'Fog':
    case 'Extra Move':
      // No target needed.
      out.push({});
      break;

    default:
      // Unknown card: try empty target.
      out.push({});
      break;
  }

  return out;
}
