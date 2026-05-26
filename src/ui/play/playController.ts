// src/ui/play/playController.ts
// State machine + game loop for the user-facing play UI.
//
// Owns the SuperChessState and orchestrates:
//   - Human chess move (click own piece → click destination)
//   - Human card play (click card → resolve target flow → apply effect)
//   - Bot turns (delegates chess + card decisions to MinimaxAI + HeuristicCardAI)
//   - Promotion picker, Disrupt piece-type picker
//   - Game-over detection
//
// The controller is rendering-agnostic; it raises an `onChange` callback the
// PlayPanel listens to. All DOM lives in playPanel.ts.

import type { PieceColor, Move, Square, PieceType } from '../../engine/types.ts';
import type { SuperChessState, CardTarget, CardPlayRecord } from '../../game/types.ts';
import type { CardInstance, CardDefinition } from '../../cards/types.ts';
import type { ChessAI, CardAI } from '../../ai/types.ts';
import { parseFEN, STARTING_FEN } from '../../engine/fen.ts';
import { applyMove, toAlgebraic, isInCheck, findKing, pieceColor, pieceType } from '../../engine/index.ts';
import { createSuperState } from '../../game/types.ts';
import { Deck } from '../../cards/deck.ts';
import { buildDeck } from '../../cards/definitions.ts';
import { CARD_EFFECTS } from '../../cards/effects.ts';
import {
  getSuperChessLegalMoves,
  checkGameOver,
  tickSuperState,
  clearMovedPieceShield,
} from '../../game/rules.ts';
import { destinationsFor } from '../board.ts';
import { showPromotionPicker, showPieceTypePicker, showGameOverModal } from './modals.ts';

export interface PlayConfig {
  humanColor: PieceColor;
  chessAI: ChessAI;            // bot
  cardAI: CardAI;              // bot
  maxMoves?: number;           // default 200
  onRequestNewGame?: () => void; // called when user picks "new game" in the game-over modal
}

export type CardTargetingPhase =
  | { kind: 'none' }
  | { kind: 'card-picked'; card: CardInstance; needs: TargetNeed }
  | { kind: 'card-second-target'; card: CardInstance; firstSquare: Square };

export type TargetNeed =
  | { kind: 'ownPiece' }
  | { kind: 'oppPiece' }
  | { kind: 'square' }
  | { kind: 'pawn' }
  | { kind: 'twoOwnPieces' }     // Swap
  | { kind: 'teleport' }         // own piece → empty square
  | { kind: 'retreat' }          // own piece → empty square (backward)
  | { kind: 'pieceType' }
  | { kind: 'none' };

export type WhoseTurn = 'human' | 'bot' | 'game-over';

export interface PlayViewModel {
  state: SuperChessState;
  humanColor: PieceColor;
  whoseTurn: WhoseTurn;
  selectedSquare: Square | null;
  legalDestinations: Square[];
  cardTargets: Square[];
  cardPhase: CardTargetingPhase;
  botThinking: boolean;
  banner: string | null;
  checkSquare: Square | null;
}

export class PlayController {
  private state: SuperChessState;
  private deck: Deck;
  private cfg: PlayConfig;
  private positionCounts = new Map<string, number>();
  private slowGameThreshold = 6;
  private whiteFirstDrawSkipped = false;

  private selectedSquare: Square | null = null;
  private cardPhase: CardTargetingPhase = { kind: 'none' };
  private botThinking = false;
  private banner: string | null = null;

  private listeners: Array<(vm: PlayViewModel) => void> = [];

  constructor(cfg: PlayConfig) {
    this.cfg = { maxMoves: 200, ...cfg };
    const definitions = buildDeck();
    this.deck = new Deck(definitions);
    this.deck.shuffle();
    const chess = parseFEN(STARTING_FEN);
    this.state = {
      chess,
      deck: this.deck.getState(),
      superState: createSuperState(),
      history: [],
      result: null,
      snapshots: [],
    };
    this.recordPosition();
  }

  onChange(cb: (vm: PlayViewModel) => void): void {
    this.listeners.push(cb);
  }

  /** Kick off: if bot plays first, queue its turn. */
  async start(): Promise<void> {
    this.emit();
    if (this.state.chess.turn !== this.cfg.humanColor && !this.state.result) {
      await this.runBotTurn();
    }
  }

  // ─── public events from UI ────────────────────────────────────────────────

  async handleSquareClick(sq: Square): Promise<void> {
    if (this.botThinking || this.state.result) return;
    if (this.state.chess.turn !== this.cfg.humanColor) return;

    // Card targeting takes precedence.
    if (this.cardPhase.kind !== 'none') {
      await this.handleCardTargetClick(sq);
      return;
    }

    const piece = this.state.chess.board[sq];

    // Click own piece → select it.
    if (piece && pieceColor(piece) === this.cfg.humanColor) {
      this.selectedSquare = sq;
      this.emit();
      return;
    }

    // Click destination after a selection → try to move.
    if (this.selectedSquare !== null) {
      const moves = this.legalMovesForColor(this.cfg.humanColor);
      const candidates = moves.filter((m) => m.from === this.selectedSquare && m.to === sq);
      if (candidates.length > 0) {
        let chosen: Move;
        if (candidates.length > 1 && candidates[0].promotion !== null) {
          // Promotion: ask for the piece type.
          const type = await showPromotionPicker(this.cfg.humanColor);
          chosen = candidates.find((m) => m.promotion?.[1] === type) ?? candidates[0];
        } else {
          chosen = candidates[0];
        }
        await this.applyHumanMove(chosen);
        return;
      }
      // Click empty square or invalid dest → clear selection.
      this.selectedSquare = null;
      this.emit();
    }
  }

  async handleCardClick(card: CardInstance): Promise<void> {
    if (this.botThinking || this.state.result) return;
    if (this.state.chess.turn !== this.cfg.humanColor) return;

    // Toggle: clicking the same card cancels.
    if (this.cardPhase.kind === 'card-picked' && this.cardPhase.card.id === card.id) {
      this.cardPhase = { kind: 'none' };
      this.selectedSquare = null;
      this.emit();
      return;
    }

    this.selectedSquare = null;
    const need = needForCard(card.definition);

    if (need.kind === 'none') {
      await this.applyCard(card, {});
      return;
    }

    if (need.kind === 'pieceType') {
      const t = await showPieceTypePicker({
        title: 'force opponent to move a…',
        color: this.cfg.humanColor,
        onCancel: () => { this.cardPhase = { kind: 'none' }; this.emit(); },
      });
      if (t) await this.applyCard(card, { pieceType: t });
      return;
    }

    this.cardPhase = { kind: 'card-picked', card, needs: need };
    this.emit();
  }

  cancelCardTargeting(): void {
    if (this.cardPhase.kind !== 'none') {
      this.cardPhase = { kind: 'none' };
      this.emit();
    }
  }

  /** Generic "back out of whatever I was doing" — bound to Escape. */
  escape(): void {
    if (this.cardPhase.kind !== 'none') {
      this.cardPhase = { kind: 'none' };
      this.selectedSquare = null;
      this.emit();
      return;
    }
    if (this.selectedSquare !== null) {
      this.selectedSquare = null;
      this.emit();
    }
  }

  // ─── core game loop pieces ────────────────────────────────────────────────

  private async handleCardTargetClick(sq: Square): Promise<void> {
    if (this.cardPhase.kind === 'card-picked') {
      const need = this.cardPhase.needs;
      const valid = this.validTargetsForNeed(need);
      if (!valid.has(sq)) return;

      // Multi-target cards: stage first square and wait for second.
      if (need.kind === 'twoOwnPieces' || need.kind === 'teleport' || need.kind === 'retreat') {
        this.cardPhase = {
          kind: 'card-second-target',
          card: this.cardPhase.card,
          firstSquare: sq,
        };
        this.emit();
        return;
      }

      const target = this.targetFromSquare(need, sq);
      await this.applyCard(this.cardPhase.card, target);
      return;
    }

    if (this.cardPhase.kind === 'card-second-target') {
      const need = needForCard(this.cardPhase.card.definition);
      const validSecond = this.validSecondTargets(need, this.cardPhase.firstSquare);
      if (!validSecond.has(sq)) {
        // Cancel & re-stage
        this.cardPhase = { kind: 'none' };
        this.emit();
        return;
      }
      const target = this.twoStepTarget(need, this.cardPhase.firstSquare, sq);
      await this.applyCard(this.cardPhase.card, target);
      return;
    }
  }

  private async applyCard(card: CardInstance, target: CardTarget): Promise<void> {
    const effectFn = CARD_EFFECTS[card.definition.name];
    if (!effectFn) {
      this.cardPhase = { kind: 'none' };
      this.emit();
      return;
    }
    const color = this.cfg.humanColor;
    const result = effectFn(this.state, color, target);
    if (result.newState === this.state) {
      // Effect was a no-op (invalid). Keep card in hand, clear targeting.
      this.flashBanner(`${card.definition.name}: nothing to do`);
      this.cardPhase = { kind: 'none' };
      this.emit();
      return;
    }

    this.state = result.newState;

    const playRecord: CardPlayRecord = {
      cardName: card.definition.name,
      playedBy: color,
      onTurn: this.state.chess.fullMoveNumber,
      target: JSON.stringify(target),
      materialBefore: { w: 0, b: 0 },
      materialAfter: { w: 0, b: 0 },
    };
    this.state.history.push({
      type: 'cardPlay',
      data: playRecord,
      turn: this.state.chess.fullMoveNumber,
    });

    // Remove from hand (Time Warp returns itself only if it actually rewound).
    const isTimeWarp = card.definition.name === 'Time Warp';
    if (!isTimeWarp) {
      this.deck.play(color, card);
      this.state.deck = this.deck.getState();
    }

    this.cardPhase = { kind: 'none' };
    this.selectedSquare = null;
    this.emit();

    // Pawn Storm / Time Warp / Mirror / Trade etc. don't skip the move phase
    // in this engine — the user still needs to make a chess move next.
    // (Mirror does mutate the board as if it moved, but the engine doesn't
    // currently end the turn — keep behavior consistent with the sim.)
  }

  private async applyHumanMove(move: Move): Promise<void> {
    this.commitMove(move);
    this.selectedSquare = null;
    this.emit();

    if (this.detectGameOver()) return;

    // Extra-move card lets human play again (non-capture only).
    if (this.state.superState.extraMoveRemaining === this.cfg.humanColor) {
      // Just give them another normal turn (no card phase though).
      // The extra-move flag is cleared after the second move below.
      // For UX, let them pick the next move themselves.
      // Note: engine requires non-capture for the bonus move.
      // We don't enforce non-capture in UI yet — generous to player.
      return;
    }

    await this.runBotTurn();
  }

  private async runBotTurn(): Promise<void> {
    this.botThinking = true;
    this.emit();

    const color: PieceColor = this.cfg.humanColor === 'w' ? 'b' : 'w';

    // Small delay so UI updates before the AI blocks the main thread.
    await microPause(40);

    // Card phase.
    const hand = this.deck.getHand(color);
    if (hand.length > 0) {
      try {
        const decision = await this.cfg.cardAI.decide(this.state, color, hand);
        if (decision.shouldPlay && decision.card && decision.target !== undefined) {
          const effectFn = CARD_EFFECTS[decision.card.definition.name];
          if (effectFn) {
            const result = effectFn(this.state, color, decision.target);
            if (result.newState !== this.state) {
              this.state = result.newState;
              this.state.history.push({
                type: 'cardPlay',
                data: {
                  cardName: decision.card.definition.name,
                  playedBy: color,
                  onTurn: this.state.chess.fullMoveNumber,
                  target: JSON.stringify(decision.target),
                  materialBefore: { w: 0, b: 0 },
                  materialAfter: { w: 0, b: 0 },
                },
                turn: this.state.chess.fullMoveNumber,
              });
              if (decision.card.definition.name !== 'Time Warp') {
                this.deck.play(color, decision.card);
                this.state.deck = this.deck.getState();
              }
              this.flashBanner(`opponent played ${decision.card.definition.emoji} ${decision.card.definition.name}`);
              this.emit();
              await microPause(380);
            }
          }
        }
      } catch (err) {
        console.warn('[bot card decision]', err);
      }
    }

    // Chess move phase.
    const legal = this.legalMovesForColor(color);
    if (legal.length === 0) {
      this.botThinking = false;
      this.detectGameOver();
      this.emit();
      return;
    }

    let move: Move;
    try {
      const raw = await this.cfg.chessAI.selectMove(this.state, color);
      move = legal.find((m) => m.from === raw.from && m.to === raw.to && m.promotion === raw.promotion) ?? legal[0];
    } catch (err) {
      console.warn('[bot chess move]', err);
      move = legal[0];
    }

    this.commitMove(move);

    this.botThinking = false;

    if (this.detectGameOver()) return;
    this.emit();
  }

  // ─── shared move commit (mutates this.state) ──────────────────────────────

  private commitMove(move: Move): void {
    const color = this.state.chess.turn;
    const algebraic = toAlgebraic(this.state.chess, move);
    const annotated = { ...move, algebraic, turnNumber: this.state.chess.fullMoveNumber, color };
    const captureHappened = move.capture !== null || move.enPassantCaptureSq !== null;
    const newChess = applyMove(this.state.chess, move);

    if (captureHappened && move.capture) {
      this.state.superState.capturedByColor.get(color)!.push(move.capture);
    }

    let nextSuper = clearMovedPieceShield(this.state.superState, move.from);
    nextSuper = {
      ...nextSuper,
      lastMove: annotated,
      turnsSinceCapture: captureHappened ? 0 : nextSuper.turnsSinceCapture + 1,
    };
    nextSuper = tickSuperState(nextSuper);

    this.state = { ...this.state, chess: newChess, superState: nextSuper };
    this.state.history.push({
      type: 'move',
      data: annotated,
      turn: newChess.fullMoveNumber,
      boardAfter: { ...newChess, board: [...newChess.board] },
    });

    // Card draw triggers — same logic as the sim.
    const skipThisDraw = color === 'w' && !this.whiteFirstDrawSkipped && captureHappened;
    if (skipThisDraw) {
      this.whiteFirstDrawSkipped = true;
    } else if (captureHappened && this.deck.handSize(color) < this.deck.maxHandSize) {
      const drawn = this.deck.draw(color);
      if (drawn) {
        this.state.history.push({
          type: 'cardDraw',
          data: { color, card: drawn, reason: 'capture' },
          turn: this.state.chess.fullMoveNumber,
        });
        if (color !== this.cfg.humanColor) {
          this.flashBanner(`opponent drew a card (capture)`);
        } else {
          this.flashBanner(`you drew ${drawn.definition.emoji} ${drawn.definition.name}`);
        }
      }
    } else if (
      nextSuper.turnsSinceCapture > 0 &&
      nextSuper.turnsSinceCapture % this.slowGameThreshold === 0
    ) {
      if (this.deck.handSize(color) < this.deck.maxHandSize) {
        const drawn = this.deck.draw(color);
        if (drawn) {
          this.state.history.push({
            type: 'cardDraw',
            data: { color, card: drawn, reason: 'slowGame' },
            turn: this.state.chess.fullMoveNumber,
          });
          if (color === this.cfg.humanColor) {
            this.flashBanner(`slow-game draw: ${drawn.definition.emoji} ${drawn.definition.name}`);
          }
        }
      } else {
        const hand = this.deck.getHand(color);
        if (hand.length > 0) {
          this.deck.discard(color, hand[0]);
          const drawn = this.deck.draw(color);
          if (drawn) {
            this.state.history.push({
              type: 'cardDraw',
              data: { color, card: drawn, reason: 'slowGame' },
              turn: this.state.chess.fullMoveNumber,
            });
          }
        }
      }
    }
    this.state.deck = this.deck.getState();

    this.recordPosition();
  }

  private detectGameOver(): boolean {
    const over = checkGameOver(this.state, this.cfg.maxMoves ?? 200);
    if (over) {
      this.state.result = {
        winner: over.winner as PieceColor | null,
        reason: over.reason as any,
        totalMoves: this.state.history.filter((e) => e.type === 'move').length,
        cardsPlayed: this.state.history
          .filter((e) => e.type === 'cardPlay')
          .map((e) => (e as any).data),
      };
      this.botThinking = false;
      this.emit();
      // Defer modal so the final move renders first.
      setTimeout(() => {
        showGameOverModal({
          winner: this.state.result!.winner,
          reason: this.state.result!.reason,
          humanColor: this.cfg.humanColor,
          totalMoves: this.state.result!.totalMoves,
          onNewGame: () => this.cfg.onRequestNewGame?.(),
        });
      }, 600);
      return true;
    }

    // Threefold repetition.
    const key = positionKey(this.state);
    if ((this.positionCounts.get(key) ?? 0) >= 3) {
      this.state.result = {
        winner: null,
        reason: 'repetition',
        totalMoves: this.state.history.filter((e) => e.type === 'move').length,
        cardsPlayed: this.state.history
          .filter((e) => e.type === 'cardPlay')
          .map((e) => (e as any).data),
      };
      this.botThinking = false;
      this.emit();
      setTimeout(() => {
        showGameOverModal({
          winner: null,
          reason: 'repetition',
          humanColor: this.cfg.humanColor,
          totalMoves: this.state.result!.totalMoves,
          onNewGame: () => this.cfg.onRequestNewGame?.(),
        });
      }, 600);
      return true;
    }
    return false;
  }

  private recordPosition(): void {
    const key = positionKey(this.state);
    this.positionCounts.set(key, (this.positionCounts.get(key) ?? 0) + 1);
  }

  // ─── targeting helpers ────────────────────────────────────────────────────

  private legalMovesForColor(color: PieceColor): Move[] {
    if (this.state.chess.turn !== color) return [];
    return getSuperChessLegalMoves(this.state, color);
  }

  private validTargetsForNeed(need: TargetNeed): Set<Square> {
    const board = this.state.chess.board;
    const set = new Set<Square>();
    const color = this.cfg.humanColor;
    const opp: PieceColor = color === 'w' ? 'b' : 'w';
    switch (need.kind) {
      case 'ownPiece':
      case 'twoOwnPieces':
      case 'teleport':
      case 'retreat':
        for (let i = 0; i < 64; i++) {
          const p = board[i];
          if (p && pieceColor(p) === color) set.add(i);
        }
        break;
      case 'oppPiece':
        for (let i = 0; i < 64; i++) {
          const p = board[i];
          if (p && pieceColor(p) === opp && pieceType(p) !== 'K') set.add(i);
        }
        break;
      case 'pawn':
        for (let i = 0; i < 64; i++) {
          const p = board[i];
          if (p && pieceColor(p) === color && pieceType(p) === 'P') set.add(i);
        }
        break;
      case 'square':
        for (let i = 0; i < 64; i++) {
          if (board[i] === null) set.add(i);
        }
        break;
      default:
        break;
    }
    return set;
  }

  private validSecondTargets(need: TargetNeed, firstSq: Square): Set<Square> {
    const board = this.state.chess.board;
    const set = new Set<Square>();
    const color = this.cfg.humanColor;
    switch (need.kind) {
      case 'twoOwnPieces':
        for (let i = 0; i < 64; i++) {
          if (i === firstSq) continue;
          const p = board[i];
          if (p && pieceColor(p) === color) set.add(i);
        }
        break;
      case 'teleport':
      case 'retreat':
        for (let i = 0; i < 64; i++) {
          if (board[i] === null) set.add(i);
        }
        break;
      default:
        break;
    }
    return set;
  }

  private targetFromSquare(need: TargetNeed, sq: Square): CardTarget {
    switch (need.kind) {
      case 'ownPiece': return { ownPieceSquare: sq };
      case 'oppPiece': return { oppPieceSquare: sq };
      case 'square':   return { square: sq };
      case 'pawn':     return { ownPieceSquare: sq };
      default:         return {};
    }
  }

  private twoStepTarget(need: TargetNeed, first: Square, second: Square): CardTarget {
    switch (need.kind) {
      case 'twoOwnPieces': return { ownPieceSquare: first, secondOwnPieceSquare: second };
      case 'teleport':     return { ownPieceSquare: first, square: second };
      case 'retreat':      return { ownPieceSquare: first, square: second };
      default:             return {};
    }
  }

  // ─── viewmodel ────────────────────────────────────────────────────────────

  private buildViewModel(): PlayViewModel {
    const moves =
      this.state.chess.turn === this.cfg.humanColor && !this.state.result
        ? this.legalMovesForColor(this.cfg.humanColor)
        : [];

    let cardTargets: Square[] = [];
    if (this.cardPhase.kind === 'card-picked') {
      cardTargets = [...this.validTargetsForNeed(this.cardPhase.needs)];
    } else if (this.cardPhase.kind === 'card-second-target') {
      const need = needForCard(this.cardPhase.card.definition);
      cardTargets = [...this.validSecondTargets(need, this.cardPhase.firstSquare)];
    }

    const checkSq =
      isInCheck(this.state.chess) ? findKing(this.state.chess.board, this.state.chess.turn) : null;

    const whoseTurn: WhoseTurn = this.state.result
      ? 'game-over'
      : this.state.chess.turn === this.cfg.humanColor
        ? 'human'
        : 'bot';

    return {
      state: this.state,
      humanColor: this.cfg.humanColor,
      whoseTurn,
      selectedSquare: this.selectedSquare,
      legalDestinations:
        this.selectedSquare !== null ? destinationsFor(moves, this.selectedSquare) : [],
      cardTargets,
      cardPhase: this.cardPhase,
      botThinking: this.botThinking,
      banner: this.banner,
      checkSquare: checkSq,
    };
  }

  private emit(): void {
    const vm = this.buildViewModel();
    for (const cb of this.listeners) cb(vm);
  }

  private flashBanner(text: string): void {
    this.banner = text;
    this.emit();
    setTimeout(() => {
      if (this.banner === text) {
        this.banner = null;
        this.emit();
      }
    }, 2600);
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function needForCard(def: CardDefinition): TargetNeed {
  // Cards with custom multi-square flows.
  if (def.name === 'Swap') return { kind: 'twoOwnPieces' };
  if (def.name === 'Teleport') return { kind: 'teleport' };
  if (def.name === 'Retreat') return { kind: 'retreat' };

  if (!def.requiresTarget) return { kind: 'none' };

  switch (def.targetType) {
    case 'ownPiece': return { kind: 'ownPiece' };
    case 'oppPiece': return { kind: 'oppPiece' };
    case 'square':   return { kind: 'square' };
    case 'pawn':     return { kind: 'pawn' };
    case 'pieceType':return { kind: 'pieceType' };
    default:         return { kind: 'none' };
  }
}

function positionKey(state: SuperChessState): string {
  const chess = state.chess;
  const cr = chess.castlingRights;
  const castle =
    (cr.wKingside ? 'K' : '') + (cr.wQueenside ? 'Q' : '') +
    (cr.bKingside ? 'k' : '') + (cr.bQueenside ? 'q' : '');
  return chess.board.join('') + chess.turn + castle + (chess.enPassantSquare ?? '-');
}

function microPause(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
