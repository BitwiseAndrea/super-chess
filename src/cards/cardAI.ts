// src/cards/cardAI.ts
// Basic heuristic: scoring function used by heuristicCardAI.ts
import type { PieceColor, Square } from '../engine/types.ts';
import type { SuperChessState, CardTarget } from '../game/types.ts';
import type { CardInstance } from './types.ts';
import { totalMaterial, pieceType, pieceColor, isSquareAttackedBy } from '../engine/index.ts';

export interface CardSuggestion {
  card: CardInstance;
  target: CardTarget;
  score: number;
}

export function scoreCard(
  card: CardInstance,
  state: SuperChessState,
  color: PieceColor,
): { score: number; target: CardTarget } {
  const board = state.chess.board;
  const opp: PieceColor = color === 'w' ? 'b' : 'w';
  const myMaterial = totalMaterial(board, color);
  const oppMaterial = totalMaterial(board, opp);
  const losing = myMaterial < oppMaterial - 200;
  const catchUpBonus = losing ? 20 : 0;
  const noise = (Math.random() - 0.5) * 20;
  const vals: Record<string, number> = { Q: 9, R: 5, B: 3, N: 3, P: 1 };

  let score = 0;
  let target: CardTarget = {};

  switch (card.definition.name) {
    case 'Freeze': {
      let best = -1, bestSq = -1;
      for (let sq = 0; sq < 64; sq++) {
        const p = board[sq];
        if (!p || p[0] !== opp || pieceType(p) === 'K') continue;
        if (state.superState.frozenSquares.has(sq)) continue;
        const v = vals[pieceType(p)] ?? 0;
        if (v > best) { best = v; bestSq = sq; }
      }
      if (bestSq >= 0) { score = 40 + best * 5 + catchUpBonus + noise; target = { oppPieceSquare: bestSq as Square }; }
      break;
    }
    case 'Shield': {
      // Prefer shielding attacked own pieces
      let best = -1, bestSq = -1;
      for (let sq = 0; sq < 64; sq++) {
        const p = board[sq];
        if (!p || p[0] !== color || pieceType(p) === 'K') continue;
        if (state.superState.shieldedSquares.has(sq)) continue;
        const v = (vals[pieceType(p)] ?? 0) + (isSquareAttackedBy(board, sq, opp) ? 4 : 0);
        if (v > best) { best = v; bestSq = sq; }
      }
      if (bestSq >= 0) { score = 35 + best * 3 + noise; target = { ownPieceSquare: bestSq as Square }; }
      break;
    }
    case "Knight's Path": {
      // Use on the most valuable own non-king piece
      let bestSq = -1, bestVal = -1;
      for (let sq = 0; sq < 64; sq++) {
        const p = board[sq];
        if (!p || p[0] !== color || pieceType(p) === 'K') continue;
        const v = vals[pieceType(p)] ?? 0;
        if (v > bestVal) { bestVal = v; bestSq = sq; }
      }
      if (bestSq >= 0) { score = 45 + catchUpBonus + noise; target = { ownPieceSquare: bestSq as Square }; }
      break;
    }
    case 'Extra Move':
      score = 60 + noise + (losing ? 15 : 0);
      break;
    case 'Coup': {
      // Target highest-value opponent piece that is reachable
      let best = -1, bestSq = -1;
      for (let sq = 0; sq < 64; sq++) {
        const p = board[sq];
        if (!p || p[0] !== opp || pieceType(p) === 'K') continue;
        const v = vals[pieceType(p)] ?? 0;
        if (v > best) { best = v; bestSq = sq; }
      }
      if (bestSq >= 0) { score = 55 + best * 8 + catchUpBonus + noise; target = { oppPieceSquare: bestSq as Square }; }
      break;
    }
    case 'Resurrection': {
      const opp2: PieceColor = color === 'w' ? 'b' : 'w';
      // capturedByColor.get(opp) = pieces captured BY opp = our own lost pieces
      const captured = state.superState.capturedByColor.get(opp2) ?? [];
      const hasMinor = captured.some(p => pieceColor(p) === color && ['N', 'B', 'R'].includes(pieceType(p)));
      if (!hasMinor) { score = 0; break; }
      for (let sq = 0; sq < 64; sq++) {
        const row = sq >> 3;
        const valid = color === 'w' ? row >= 6 : row <= 1;
        if (valid && board[sq] === null) { target = { square: sq as Square }; break; }
      }
      if (!target.square) { score = 0; break; }
      score = 60 + catchUpBonus + noise;
      break;
    }
    case 'Pawn Storm':
      score = 55 + noise;
      break;
    case 'Foul Ground': {
      // Block a central square
      const centrals = [27, 28, 35, 36, 18, 21, 42, 45];
      const sq = centrals[Math.floor(Math.random() * centrals.length)];
      score = 52 + noise;
      target = { square: sq as Square };
      break;
    }
    case 'Disrupt': {
      // Force opponent to move their queen (or most valuable piece)
      const types: Array<'Q' | 'R' | 'B' | 'N' | 'P'> = ['Q', 'R', 'B', 'N'];
      const forcedType = types.find(t => board.some(p => p && p[0] === opp && pieceType(p) === t)) ?? 'Q';
      score = 52 + noise;
      target = { pieceType: forcedType };
      break;
    }
    case 'Teleport': {
      // Move own piece from back rank / stuck to a central square
      const goodSquares = [27, 28, 35, 36, 18, 19, 20, 21, 26, 29, 34, 37, 42, 43, 44, 45];
      let fromSq = -1, fromVal = -1;
      for (let sq = 0; sq < 64; sq++) {
        const p = board[sq];
        if (!p || p[0] !== color || pieceType(p) === 'K') continue;
        const row = sq >> 3;
        // Prefer pieces on back rank (stuck)
        const backRankBonus = (color === 'w' ? row >= 6 : row <= 1) ? 5 : 0;
        const v = (vals[pieceType(p)] ?? 0) + backRankBonus;
        if (v > fromVal) { fromVal = v; fromSq = sq; }
      }
      if (fromSq < 0) { score = 0; break; }
      let toSq = -1;
      for (const sq of goodSquares) {
        if (board[sq] === null && sq !== fromSq) { toSq = sq; break; }
      }
      if (toSq < 0) { score = 0; break; }
      score = 48 + catchUpBonus + noise;
      target = { ownPieceSquare: fromSq as Square, square: toSq as Square };
      break;
    }
    case 'Ghost Step': {
      // Give own sliding piece the ability to phase through blockers
      let bestSq = -1;
      for (let sq = 0; sq < 64; sq++) {
        const p = board[sq];
        if (!p || p[0] !== color) continue;
        const t = pieceType(p);
        if (t === 'K' || t === 'N') continue; // knight ignores blocking already
        bestSq = sq;
        break;
      }
      score = bestSq >= 0 ? 46 + catchUpBonus + noise : 0;
      if (bestSq >= 0) target = { ownPieceSquare: bestSq as Square };
      break;
    }
    case 'Swap': {
      // Swap two own pieces — pick first and last own non-king pieces
      const ownPieces: number[] = [];
      for (let sq = 0; sq < 64; sq++) {
        const p = board[sq];
        if (p && p[0] === color && pieceType(p) !== 'K') ownPieces.push(sq);
      }
      if (ownPieces.length >= 2) {
        score = 42 + catchUpBonus + noise;
        target = { ownPieceSquare: ownPieces[0] as Square, secondOwnPieceSquare: ownPieces[ownPieces.length - 1] as Square };
      }
      break;
    }
    case 'Fortify': {
      // Give most-advanced own pawn rook movement
      let bestSq = -1;
      let bestRank = color === 'w' ? 7 : 0;
      for (let sq = 0; sq < 64; sq++) {
        const p = board[sq];
        if (!p || p[0] !== color || pieceType(p) !== 'P') continue;
        const row = sq >> 3;
        if (color === 'w' ? row < bestRank : row > bestRank) { bestRank = row; bestSq = sq; }
      }
      score = bestSq >= 0 ? 48 + catchUpBonus + noise : 0;
      if (bestSq >= 0) target = { ownPieceSquare: bestSq as Square };
      break;
    }
    case 'Double Step': {
      // Advance own pawn two squares — pick most advanced that has a clear path
      let bestSq = -1;
      let bestRank = color === 'w' ? 7 : 0;
      for (let sq = 0; sq < 64; sq++) {
        const p = board[sq];
        if (!p || p[0] !== color || pieceType(p) !== 'P') continue;
        const row = sq >> 3;
        const dir = color === 'w' ? -8 : 8;
        const mid = sq + dir, dest = sq + dir * 2;
        if (dest < 0 || dest >= 64 || board[mid] !== null || board[dest] !== null) continue;
        if (color === 'w' ? row < bestRank : row > bestRank) { bestRank = row; bestSq = sq; }
      }
      score = bestSq >= 0 ? 50 + catchUpBonus + noise : 0;
      if (bestSq >= 0) target = { ownPieceSquare: bestSq as Square };
      break;
    }
    case 'Retreat': {
      // Save own attacked valuable piece
      let bestSq = -1, bestVal = -1, retreatSq = -1;
      for (let sq = 0; sq < 64; sq++) {
        const p = board[sq];
        if (!p || p[0] !== color || pieceType(p) === 'K') continue;
        const v = vals[pieceType(p)] ?? 0;
        if (!isSquareAttackedBy(board, sq, opp) || v <= bestVal) continue;
        // Find a safe empty back-rank square
        const backRows = color === 'w' ? [7, 6] : [0, 1];
        for (const row of backRows) {
          for (let col = 0; col < 8; col++) {
            const dest = row * 8 + col;
            if (board[dest] === null && !isSquareAttackedBy(board, dest, opp)) {
              bestVal = v; bestSq = sq; retreatSq = dest; break;
            }
          }
          if (retreatSq >= 0) break;
        }
      }
      if (bestSq >= 0 && retreatSq >= 0) {
        score = 40 + bestVal * 5 + catchUpBonus + noise;
        target = { ownPieceSquare: bestSq as Square, square: retreatSq as Square };
      } else {
        score = 18 + noise; // nothing useful to retreat
      }
      break;
    }
    case 'Mirror': {
      // Mirror opponent's last move — only useful if there's a last move
      score = state.superState.lastMove ? 48 + catchUpBonus + noise : 0;
      break;
    }
    case 'Trade': {
      // Swap most-advanced own pawn with least-advanced opponent pawn
      // Good when opponent has more advanced pawns
      let oppAdvRow = opp === 'w' ? 7 : 0;
      let myAdvRow = color === 'w' ? 7 : 0;
      let hasBothPawns = false;
      for (let sq = 0; sq < 64; sq++) {
        const p = board[sq];
        if (!p) continue;
        const row = sq >> 3;
        if (pieceColor(p) === opp && pieceType(p) === 'P') {
          if (opp === 'w' ? row < oppAdvRow : row > oppAdvRow) oppAdvRow = row;
          hasBothPawns = true;
        }
        if (pieceColor(p) === color && pieceType(p) === 'P') {
          if (color === 'w' ? row < myAdvRow : row > myAdvRow) myAdvRow = row;
        }
      }
      if (!hasBothPawns) { score = 0; break; }
      const oppAdvance = opp === 'w' ? 7 - oppAdvRow : oppAdvRow;
      const myAdvance = color === 'w' ? 7 - myAdvRow : myAdvRow;
      score = oppAdvance > myAdvance ? 50 + catchUpBonus + noise : 30 + noise;
      break;
    }
    case 'Fog':
      score = 42 + noise;
      break;
    case 'Time Warp':
      // Only worth using when losing; each player can only use once per game
      if (state.superState.timeWarpUsed.get(color)) { score = 0; break; }
      score = losing ? 65 + noise : 22 + noise;
      break;
    case 'Promotion Rush': {
      // Rush most-advanced pawn to 2nd-to-last rank
      let bestSq = -1;
      let bestRank = color === 'w' ? 7 : 0;
      for (let sq = 0; sq < 64; sq++) {
        const p = board[sq];
        if (!p || p[0] !== color || pieceType(p) !== 'P') continue;
        const row = sq >> 3;
        const destRow = color === 'w' ? 1 : 6;
        if (row === destRow) continue;
        const dest = destRow * 8 + (sq & 7);
        if (board[dest] !== null) continue;
        if (color === 'w' ? row < bestRank : row > bestRank) { bestRank = row; bestSq = sq; }
      }
      score = bestSq >= 0 ? 65 + catchUpBonus + noise : 0;
      if (bestSq >= 0) target = { ownPieceSquare: bestSq as Square };
      break;
    }
    default:
      score = 45 + catchUpBonus + noise;
  }

  return { score, target };
}

export const PLAY_THRESHOLD = 45;
