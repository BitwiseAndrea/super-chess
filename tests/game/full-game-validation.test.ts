// tests/game/full-game-validation.test.ts
//
// Full-game integration: play a small batch of bot-vs-bot games and
// assert validateState returns ok=true after every single turn (move
// + card draw + card play, ticked super-state, all of it). If the
// game loop ever produces an invalid state \u2014 phantom pieces, double
// kings, out-of-bounds en-passant, frozen pieces with no shield
// counter, etc. \u2014 this catches it without needing a user to file a
// bug report.
//
// We snapshot the game generator's per-turn yield and validate each.
// At the seeds chosen below the games hit captures (so cards get
// drawn), card plays (so effects fire), super-state effects, etc.

import { describe, it, expect } from 'vitest';
import { SuperChessGame } from '../../src/game/superChess.ts';
import { MinimaxAI } from '../../src/ai/minimaxAI.ts';
import { HeuristicCardAI } from '../../src/ai/heuristicCardAI.ts';
import { validateState } from '../../src/game/debug.ts';
import type { SimulationConfig } from '../../src/simulation/types.ts';

function makeConfig(seed: number): SimulationConfig {
  const chessAI = new MinimaxAI(2);
  const cardAI = new HeuristicCardAI();
  return {
    games: 1,
    chessAI: { white: chessAI, black: chessAI },
    cardAI: { white: cardAI, black: cardAI },
    searchDepth: 2,
    speedMs: 0,
    maxMovesPerGame: 80,
    seed,
  };
}

describe('full-game validation: every turn produces a valid state', () => {
  // A handful of seeds. If any of them hits a state-corruption bug
  // we want to catch it here, BEFORE the user does. Each seed spans
  // a different opening / mid-game pattern so we get coverage breadth
  // without paying for a 100-game smoke run.
  const SEEDS = [1, 7, 13, 42, 99];

  for (const seed of SEEDS) {
    it(`seed=${seed} \u00b7 every turn snapshot validates clean`, async () => {
      const game = new SuperChessGame(makeConfig(seed));
      let turn = 0;
      for await (const state of game.playGame()) {
        turn++;
        const result = validateState(state);
        if (result.errors.length > 0) {
          // Pull together a focused error message that includes the
          // turn number and FEN so failures point straight at the
          // breaking position.
          throw new Error(
            `seed=${seed} turn=${turn}: ${result.errors.length} validation error(s):\n` +
              result.errors.map((e) => `  - [${e.tag}] ${e.message}`).join('\n') +
              `\nfen=${stateFEN(state)}`,
          );
        }
        // Sanity: turn count shouldn't exceed maxMovesPerGame * 2.
        if (turn > 200) throw new Error(`seed=${seed}: runaway turn count ${turn}`);
      }
      // The final state should also have a result.
      const final = game.getState();
      expect(final.result).not.toBeNull();
    }, 30000);
  }
});

// Helper: state \u2192 FEN-ish string for failure messages.
function stateFEN(state: import('../../src/game/types.ts').SuperChessState): string {
  // Inline minimal FEN-board so we don't drag the engine FEN serializer
  // (which only takes ChessState) and so failure messages stay terse.
  let fen = '';
  for (let row = 0; row < 8; row++) {
    let empty = 0;
    let rankStr = '';
    for (let col = 0; col < 8; col++) {
      const p = state.chess.board[row * 8 + col];
      if (p === null) {
        empty++;
      } else {
        if (empty > 0) {
          rankStr += empty;
          empty = 0;
        }
        const c = p[1];
        rankStr += pieceColor(p) === 'w' ? c.toUpperCase() : c.toLowerCase();
      }
    }
    if (empty > 0) rankStr += empty;
    fen += rankStr + (row < 7 ? '/' : '');
  }
  return `${fen} ${state.chess.turn}`;
}

function pieceColor(p: string): 'w' | 'b' {
  return p[0] as 'w' | 'b';
}
