// src/game/superChess.ts
// Main game orchestrator: runs a single Super Chess game to completion.
import type { PieceColor, Move } from '../engine/types.ts';
import type { SuperChessState, GameResult, CardPlayRecord, TurnResult, GameEvent } from './types.ts';
import { createSuperState } from './types.ts';
import { tickSuperState, clearMovedPieceShield } from './rules.ts';
import type { ChessAI, CardAI } from '../ai/types.ts';
import type { SimulationConfig } from '../simulation/types.ts';
import { Deck } from '../cards/deck.ts';
import { buildDeck } from '../cards/definitions.ts';
import { CARD_EFFECTS } from '../cards/effects.ts';
import { getSuperChessLegalMoves, checkGameOver } from './rules.ts';
import {
  applyMove,
  toAlgebraic,
  totalMaterial,
  parseFEN,
  STARTING_FEN,
  isInCheck,
} from '../engine/index.ts';

// Encode the parts of ChessState that define a position for repetition purposes.
// Excludes move counters (halfMoveClock, fullMoveNumber) — those don't affect identity.
function positionKey(chess: import('../engine/types.ts').ChessState): string {
  const cr = chess.castlingRights;
  const castle =
    (cr.wKingside ? 'K' : '') + (cr.wQueenside ? 'Q' : '') +
    (cr.bKingside ? 'k' : '') + (cr.bQueenside ? 'q' : '');
  return chess.board.join('') + chess.turn + castle + (chess.enPassantSquare ?? '-');
}

export class SuperChessGame {
  private state: SuperChessState;
  private deck: Deck;
  private chessAI: { white: ChessAI; black: ChessAI };
  private cardAI: { white: CardAI; black: CardAI };
  private maxMoves: number;
  private slowGameThreshold = 6; // turns without capture before drawing a card
  private positionCounts = new Map<string, number>(); // position key → occurrence count
  private whiteFirstDrawSkipped = false; // white skips their first capture card draw (balances first-move advantage)

  constructor(config: SimulationConfig) {
    this.chessAI = config.chessAI as { white: ChessAI; black: ChessAI };
    this.cardAI = config.cardAI as { white: CardAI; black: CardAI };
    this.maxMoves = config.maxMovesPerGame;

    const definitions = buildDeck(config.cardConfig ?? []);
    this.deck = new Deck(definitions);
    this.deck.shuffle(config.seed);

    const chess = parseFEN(STARTING_FEN);
    const superState = createSuperState();

    this.state = {
      chess,
      deck: this.deck.getState(),
      superState,
      history: [],
      result: null,
      snapshots: [],
    };
  }

  // Full async generator — yields state after each turn
  async *playGame(): AsyncGenerator<SuperChessState> {
    while (!this.state.result) {
      const over = checkGameOver(this.state, this.maxMoves);
      if (over) {
        this.state.result = this.buildResult(over.winner as PieceColor | null, over.reason as GameResult['reason']);
        this.state.history.push({ type: 'gameOver', data: this.state.result, turn: this.state.chess.fullMoveNumber });
        yield this.state;
        return;
      }

      if (this.isThreefoldRepetition()) {
        this.state.result = this.buildResult(null, 'repetition');
        this.state.history.push({ type: 'gameOver', data: this.state.result, turn: this.state.chess.fullMoveNumber });
        yield this.state;
        return;
      }

      await this.playTurn();
      yield this.state;
    }
  }

  // Run to completion and return result
  async runToCompletion(): Promise<GameResult> {
    for await (const _ of this.playGame()) { /* consume */ }
    return this.state.result!;
  }

  getState(): SuperChessState {
    return this.state;
  }

  private recordPosition(): void {
    const key = positionKey(this.state.chess);
    this.positionCounts.set(key, (this.positionCounts.get(key) ?? 0) + 1);
  }

  private isThreefoldRepetition(): boolean {
    return (this.positionCounts.get(positionKey(this.state.chess)) ?? 0) >= 3;
  }

  private async playTurn(): Promise<TurnResult> {
    const color = this.state.chess.turn;
    const ai = color === 'w' ? this.cardAI.white : this.cardAI.black;
    const chessAI = color === 'w' ? this.chessAI.white : this.chessAI.black;

    // Save snapshot for Time Warp
    this.saveSnapshot();

    // --- Card play phase ---
    const hand = this.deck.getHand(color);
    let cardPlayRecord: CardPlayRecord | null = null;

    if (hand.length > 0) {
      const decision = await ai.decide(this.state, color, hand);
      if (decision.shouldPlay && decision.card && decision.target !== undefined) {
        const effectFn = CARD_EFFECTS[decision.card.definition.name];
        if (effectFn) {
          const matBefore = {
            w: totalMaterial(this.state.chess.board, 'w'),
            b: totalMaterial(this.state.chess.board, 'b'),
          };
          const result = effectFn(this.state, color, decision.target);
          this.state = result.newState;

          const matAfter = {
            w: totalMaterial(this.state.chess.board, 'w'),
            b: totalMaterial(this.state.chess.board, 'b'),
          };

          cardPlayRecord = {
            cardName: decision.card.definition.name,
            playedBy: color,
            onTurn: this.state.chess.fullMoveNumber,
            target: JSON.stringify(decision.target),
            materialBefore: matBefore,
            materialAfter: matAfter,
          };

          // Remove from hand.
          // Time Warp: stays in hand only after a SUCCESSFUL revert (state changed).
          // If Time Warp was a no-op (already used, state unchanged), remove it so it doesn't loop.
          const isTimeWarp = decision.card.definition.name === 'Time Warp';
          const stateChanged = result.newState !== this.state;
          if (!isTimeWarp || !stateChanged) {
            this.deck.play(color, decision.card);
          }

          this.state.history.push({
            type: 'cardPlay',
            data: cardPlayRecord,
            turn: this.state.chess.fullMoveNumber,
          });
        }
      }
    }

    // --- Chess move phase ---
    const legalMoves = getSuperChessLegalMoves(this.state, color);
    if (legalMoves.length === 0) {
      // Game over — will be caught on next iteration
      return { move: null as unknown as ReturnType<typeof this.annotate>, cardPlayed: cardPlayRecord, cardDrawn: null, stateAfter: this.state };
    }

    const move = await chessAI.selectMove(this.state, color);
    const validMove = legalMoves.find(
      (m) => m.from === move.from && m.to === move.to && m.promotion === move.promotion,
    ) ?? legalMoves[0]; // fallback if AI returned an illegal move

    const algebraic = toAlgebraic(this.state.chess, validMove);
    const annotated = this.annotate(validMove, algebraic, color);

    // Apply move
    const captureHappened = validMove.capture !== null || validMove.enPassantCaptureSq !== null;
    const newChess = applyMove(this.state.chess, validMove);

    // Track captured pieces
    if (captureHappened && validMove.capture) {
      this.state.superState.capturedByColor.get(color)!.push(validMove.capture);
    }

    // Clear shield from moved piece
    let newSuperState = clearMovedPieceShield(this.state.superState, validMove.from);

    // Update turn count
    newSuperState = {
      ...newSuperState,
      lastMove: annotated,
      turnsSinceCapture: captureHappened ? 0 : newSuperState.turnsSinceCapture + 1,
    };

    // Tick super state flags
    newSuperState = tickSuperState(newSuperState);

    this.state = {
      ...this.state,
      chess: newChess,
      superState: newSuperState,
    };
    this.state.deck = this.deck.getState();

    this.state.history.push({ type: 'move', data: annotated, turn: newChess.fullMoveNumber, boardAfter: { ...newChess, board: [...newChess.board] } });
    this.recordPosition();
    if (newSuperState.extraMoveRemaining === color) {
      const extraMoves = getSuperChessLegalMoves(this.state, color);
      const nonCaptures = extraMoves.filter((m) => m.capture === null);
      if (nonCaptures.length > 0) {
        const extraMove = await chessAI.selectMove(this.state, color);
        const validExtra = nonCaptures.find(
          (m) => m.from === extraMove.from && m.to === extraMove.to,
        ) ?? nonCaptures[0];
        const extraAlgebraic = toAlgebraic(this.state.chess, validExtra);
        const extraAnnotated = this.annotate(validExtra, extraAlgebraic, color);
        const extraChess = applyMove(this.state.chess, validExtra);
        this.state = {
          ...this.state,
          chess: extraChess,
          superState: { ...this.state.superState, extraMoveRemaining: null },
        };
        this.state.history.push({ type: 'move', data: extraAnnotated, turn: extraChess.fullMoveNumber, boardAfter: { ...extraChess, board: [...extraChess.board] } });
        this.recordPosition();
      }
    }

    // --- Card draw triggers ---
    let cardDrawn: ReturnType<typeof this.deck.draw> = null;
    // White skips their very first capture-triggered card draw to offset first-move advantage
    const skipThisDraw = color === 'w' && !this.whiteFirstDrawSkipped && captureHappened;
    if (skipThisDraw) {
      this.whiteFirstDrawSkipped = true;
    } else if (captureHappened && this.deck.handSize(color) < this.deck.maxHandSize) {
      cardDrawn = this.deck.draw(color);
      if (cardDrawn) {
        this.state.history.push({ type: 'cardDraw', data: { color, card: cardDrawn, reason: 'capture' }, turn: this.state.chess.fullMoveNumber });
      }
    } else if (newSuperState.turnsSinceCapture > 0 &&
               newSuperState.turnsSinceCapture % this.slowGameThreshold === 0) {
      if (this.deck.handSize(color) < this.deck.maxHandSize) {
        // Hand has room — just draw
        cardDrawn = this.deck.draw(color);
        if (cardDrawn) {
          this.state.history.push({ type: 'cardDraw', data: { color, card: cardDrawn, reason: 'slowGame' }, turn: this.state.chess.fullMoveNumber });
        }
      } else {
        // Hand is full — discard oldest card and draw a fresh one
        const hand = this.deck.getHand(color);
        if (hand.length > 0) {
          const discarded = hand[0];
          this.deck.discard(color, discarded);
          this.state.history.push({ type: 'cardDiscard', data: { color, card: discarded }, turn: this.state.chess.fullMoveNumber });
          cardDrawn = this.deck.draw(color);
          if (cardDrawn) {
            this.state.history.push({ type: 'cardDraw', data: { color, card: cardDrawn, reason: 'slowGame' }, turn: this.state.chess.fullMoveNumber });
          }
        }
      }
    }
    this.state.deck = this.deck.getState();

    return { move: annotated, cardPlayed: cardPlayRecord, cardDrawn, stateAfter: this.state };
  }

  private annotate(move: Move, algebraic: string, color: PieceColor) {
    return {
      ...move,
      algebraic,
      turnNumber: this.state.chess.fullMoveNumber,
      color,
    };
  }

  private saveSnapshot(): void {
    this.state.snapshots.push({
      chess: { ...this.state.chess, board: [...this.state.chess.board], castlingRights: { ...this.state.chess.castlingRights } },
      superState: this.state.superState,
      deckState: this.deck.getState(),
    });
    // Keep only last 4 snapshots (2 full turns)
    if (this.state.snapshots.length > 4) {
      this.state.snapshots.shift();
    }
  }

  private buildResult(winner: PieceColor | null, reason: GameResult['reason']): GameResult {
    const cardsPlayed = this.state.history
      .filter((e) => e.type === 'cardPlay')
      .map((e) => (e as { type: 'cardPlay'; data: CardPlayRecord }).data);

    return {
      winner,
      reason,
      totalMoves: this.state.history.filter((e) => e.type === 'move').length,
      cardsPlayed,
    };
  }
}
