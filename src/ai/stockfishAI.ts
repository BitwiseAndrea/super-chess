// src/ai/stockfishAI.ts
// Stockfish.js Web Worker wrapper. Falls back to MinimaxAI if worker unavailable.
import type { PieceColor, Move } from '../engine/types.ts';
import type { SuperChessState } from '../game/types.ts';
import type { ChessAI } from './types.ts';
import { toFEN } from '../engine/fen.ts';
import { generateLegal } from '../engine/movegen.ts';
import { algebraicToSquare } from '../engine/board.ts';
import { MinimaxAI } from './minimaxAI.ts';

export class StockfishAI implements ChessAI {
  name = 'Stockfish';
  private worker: Worker | null = null;
  private skillLevel: number;
  private thinkTimeMs: number;
  private fallback: MinimaxAI;
  private initialized = false;

  constructor(skillLevel = 10, thinkTimeMs = 100) {
    this.skillLevel = skillLevel;
    this.thinkTimeMs = thinkTimeMs;
    this.fallback = new MinimaxAI(2);
  }

  async init(): Promise<void> {
    try {
      // Stockfish.js must be available at /stockfish.js (place in /public)
      this.worker = new Worker('/stockfish.js');
      await this.sendAndWait('uci', 'uciok', 2000);
      this.worker.postMessage(`setoption name Skill Level value ${this.skillLevel}`);
      this.worker.postMessage('isready');
      await this.waitFor('readyok', 2000);
      this.initialized = true;
    } catch {
      console.warn('[StockfishAI] Failed to load Stockfish worker, falling back to Minimax');
      this.worker = null;
    }
  }

  async setSkillLevel(level: number): Promise<void> {
    this.skillLevel = level;
    if (this.worker && this.initialized) {
      this.worker.postMessage(`setoption name Skill Level value ${level}`);
    }
  }

  destroy(): void {
    this.worker?.terminate();
    this.worker = null;
    this.initialized = false;
  }

  async selectMove(state: SuperChessState, color: PieceColor): Promise<Move> {
    if (state.chess.turn !== color) {
      throw new Error(
        `StockfishAI.selectMove: chess.turn is ${state.chess.turn} but caller asked for ${color}. ` +
        'Adjust state.chess.turn before calling.',
      );
    }
    if (!this.worker || !this.initialized) {
      return this.fallback.selectMove(state, color);
    }

    const fen = toFEN(state.chess);
    this.worker.postMessage(`position fen ${fen}`);
    this.worker.postMessage(`go movetime ${this.thinkTimeMs}`);

    const bestmoveStr = await this.waitFor('bestmove', this.thinkTimeMs + 2000);
    const parts = bestmoveStr.split(' ');
    const moveStr = parts[1]; // e.g. "e2e4" or "e7e8q"

    if (!moveStr || moveStr === '(none)') {
      return this.fallback.selectMove(state, color);
    }

    return this.parseBestMove(moveStr, state, color);
  }

  private parseBestMove(moveStr: string, state: SuperChessState, _color: PieceColor): Move {
    const from = algebraicToSquare(moveStr.slice(0, 2));
    const to = algebraicToSquare(moveStr.slice(2, 4));
    const promoChar = moveStr[4];

    const legalMoves = generateLegal(state.chess, new Set(state.superState.frozenSquares.keys()));
    const match = legalMoves.find((m) => {
      if (m.from !== from || m.to !== to) return false;
      if (promoChar && m.promotion) {
        return m.promotion[1].toLowerCase() === promoChar;
      }
      return !promoChar || !m.promotion;
    });

    if (match) return match;

    // Fallback: return first legal move
    if (legalMoves.length > 0) return legalMoves[0];
    throw new Error(`StockfishAI: no legal move for ${moveStr}`);
  }

  private sendAndWait(cmd: string, expectedToken: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Stockfish timeout waiting for ${expectedToken}`)), timeoutMs);
      const handler = (e: MessageEvent) => {
        if (typeof e.data === 'string' && e.data.includes(expectedToken)) {
          clearTimeout(timer);
          this.worker!.removeEventListener('message', handler);
          resolve(e.data as string);
        }
      };
      this.worker!.addEventListener('message', handler);
      this.worker!.postMessage(cmd);
    });
  }

  private waitFor(token: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Stockfish timeout for ${token}`)), timeoutMs);
      const handler = (e: MessageEvent) => {
        if (typeof e.data === 'string' && e.data.startsWith(token)) {
          clearTimeout(timer);
          this.worker!.removeEventListener('message', handler);
          resolve(e.data as string);
        }
      };
      this.worker!.addEventListener('message', handler);
    });
  }
}
