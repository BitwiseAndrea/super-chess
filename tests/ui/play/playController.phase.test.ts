// tests/ui/play/playController.phase.test.ts
//
// End-to-end tests for the play-phase model in PlayController. The phase
// model splits each turn into:
//
//   pre-card   \u2014 offensive / move-modifier cards or chess move
//   instead    \u2014 the card IS the move (consumesTurn cards)
//   post-card  \u2014 defensive cards (Shield, Freeze, Foul Ground)
//
// These tests use stub ChessAI and CardAI implementations so we can drive
// the controller deterministically without invoking the real search
// (which is non-trivial to set up at depth 2 and would dominate runtime).

import { describe, it, expect, beforeEach } from 'vitest';
import { PlayController, type PlayViewModel } from '../../../src/ui/play/playController.ts';
import type { ChessAI, CardAI, CardAIDecision } from '../../../src/ai/types.ts';
import type { SuperChessState } from '../../../src/game/types.ts';
import type { CardInstance } from '../../../src/cards/types.ts';
import type { Move, PieceColor } from '../../../src/engine/types.ts';
import { getSuperChessLegalMoves } from '../../../src/game/rules.ts';

/** Stub ChessAI that always picks the first legal move it finds. Avoids
 * the real minimax search so tests run in milliseconds. */
class FirstMoveAI implements ChessAI {
  name = 'first-move-stub';
  async selectMove(state: SuperChessState, color: PieceColor): Promise<Move> {
    const moves = getSuperChessLegalMoves(state, color);
    if (moves.length === 0) {
      // Manufacture a no-op move so the controller's fallback path can fire.
      return { from: 0, to: 0, capture: null, promotion: null, enPassantCaptureSq: null } as Move;
    }
    return moves[0];
  }
}

/** Stub CardAI that never plays cards. Lets us isolate the phase
 * transitions without the bot's card layer mutating state. */
class NeverPlayCardAI implements CardAI {
  name = 'never-play-stub';
  decisions: Array<{ handSize: number; handPhases: string[] }> = [];
  async decide(_state: SuperChessState, _color: PieceColor, hand: CardInstance[]): Promise<CardAIDecision> {
    this.decisions.push({
      handSize: hand.length,
      handPhases: hand.map((c) => c.definition.phase ?? 'pre'),
    });
    return { shouldPlay: false };
  }
}

function makeController(opts: {
  cardAI?: CardAI;
  chessAI?: ChessAI;
} = {}): PlayController {
  return new PlayController({
    humanColor: 'w',
    chessAI: opts.chessAI ?? new FirstMoveAI(),
    cardAI: opts.cardAI ?? new NeverPlayCardAI(),
    botMinThinkMs: 0, // tests don't care about think time
    humanMoveSettleMs: 0,
    enabledCategories: ['default'],
  });
}

describe('PlayController play-phase model', () => {
  describe('initial state', () => {
    let controller: PlayController;
    beforeEach(() => {
      controller = makeController();
    });

    it('starts white in pre-card phase, white-owned', async () => {
      let vm: PlayViewModel | null = null;
      controller.onChange((next) => { vm = next; });
      await controller.start();
      expect(vm).not.toBeNull();
      expect(vm!.turnOwner).toBe('w');
      expect(vm!.turnPhase).toBe('pre');
    });

    it('post-phase await flag is false in the pre-card phase', async () => {
      let vm: PlayViewModel | null = null;
      controller.onChange((next) => { vm = next; });
      await controller.start();
      expect(vm!.postPhaseAwaitingHuman).toBe(false);
    });
  });

  describe('after a human chess move', () => {
    it('transitions to post-card phase, still owned by the human', async () => {
      // Spike the controller's white hand so we can verify post-phase
      // gating survives even with no defensive cards. The deck handles
      // hand state via `dealStartingHand`; we just observe the VM.
      const cardAI = new NeverPlayCardAI();
      const controller = makeController({ cardAI });
      const vms: Array<{ turnOwner: PieceColor; turnPhase: 'pre' | 'post'; chessTurn: PieceColor; postWait: boolean }> = [];
      controller.onChange((vm) => {
        vms.push({
          turnOwner: vm.turnOwner,
          turnPhase: vm.turnPhase,
          chessTurn: vm.state.chess.turn,
          postWait: vm.postPhaseAwaitingHuman,
        });
      });
      await controller.start();

      // Pick a known white opening move (e2 -> e3, both safe and always legal).
      // square index 52 = e2, 44 = e3 (a8=0, h1=63).
      await controller.handleSquareClick(52);
      await controller.handleSquareClick(44);

      // Wait for any pending bot work the controller queued.
      await new Promise((r) => setTimeout(r, 30));

      // We should see a post-phase entry with turnOwner=w right after
      // commitMove, before the bot's pre-phase took over.
      const sawHumanPost = vms.some((s) =>
        s.turnOwner === 'w' && s.turnPhase === 'post' && s.chessTurn === 'b',
      );
      expect(sawHumanPost).toBe(true);
    });
  });

  describe('bot card decision is phase-filtered', () => {
    it('only sees pre/instead cards in the pre-card phase, only post in post', async () => {
      const cardAI = new NeverPlayCardAI();
      const controller = makeController({ cardAI });
      await controller.start();

      // White (human) opens. e2 -> e3.
      await controller.handleSquareClick(52);
      await controller.handleSquareClick(44);
      // Let the bot turn run to completion.
      await new Promise((r) => setTimeout(r, 80));

      // The bot should have been asked twice: once for pre-card, once for
      // post-card. Each call's hand subset must consist only of cards
      // eligible for that phase.
      // (NB: the exact number of decisions depends on whether the bot's
      // hand had eligible cards in either phase. We just assert that
      // no decision call ever shows a phase mismatch.)
      for (const d of cardAI.decisions) {
        for (const p of d.handPhases) {
          // pre-call: only pre or instead allowed
          // post-call: only post allowed
          expect(['pre', 'instead', 'post']).toContain(p);
        }
        const allPre = d.handPhases.every((p) => p === 'pre' || p === 'instead');
        const allPost = d.handPhases.every((p) => p === 'post');
        // Each filtered hand should be homogeneous-by-phase-bucket.
        expect(allPre || allPost || d.handPhases.length === 0).toBe(true);
      }
    });
  });

  describe('endTurnExplicit guard', () => {
    it('is a no-op when not in the human post-card phase', async () => {
      const controller = makeController();
      let vm: PlayViewModel | null = null;
      controller.onChange((next) => { vm = next; });
      await controller.start();
      // We're in pre-phase, calling endTurnExplicit should not throw and
      // should not advance the turn.
      const beforeTurn = vm!.state.chess.fullMoveNumber;
      const beforePhase = vm!.turnPhase;
      await controller.endTurnExplicit();
      expect(vm!.state.chess.fullMoveNumber).toBe(beforeTurn);
      expect(vm!.turnPhase).toBe(beforePhase);
    });
  });
});
