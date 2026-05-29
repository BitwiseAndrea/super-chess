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

import type { PieceColor, Move, Square } from '../../engine/types.ts';
import type { SuperChessState, CardTarget, CardPlayRecord } from '../../game/types.ts';
import type { CardInstance, CardDefinition } from '../../cards/types.ts';
import type { ChessAI, CardAI } from '../../ai/types.ts';
import { parseFEN, STARTING_FEN } from '../../engine/fen.ts';
import { applyMove, toAlgebraic, isInCheck, findKing, pieceColor, pieceType } from '../../engine/index.ts';
import { createSuperState } from '../../game/types.ts';
import { Deck } from '../../cards/deck.ts';
import { buildDeck, cardPhase as getCardPhase } from '../../cards/definitions.ts';
import { CARD_EFFECTS, isValidRetreat } from '../../cards/effects.ts';
import {
  getSuperChessLegalMoves,
  checkGameOver,
  tickSuperState,
  transferMovedPieceShield,
  consumeTurnBookkeeping,
} from '../../game/rules.ts';
import { destinationsFor } from '../board.ts';
import { showPromotionPicker, showPieceTypePicker, showGameOverModal, showHandFullPicker } from './modals.ts';
import type { DebugLog } from './debugLog.ts';
import { validateState } from '../../game/debug.ts';
import { findOpening, moveToUci, type Opening } from './openings.ts';
import {
  resurrectionLandingSquares,
  hasResurrectableCapturedPiece,
  pawnRetreatDestinations,
  sidestepDestinations,
} from '../../cards/targeting.ts';
import type { DrawRules } from '../../simulation/types.ts';
import { DEFAULT_DRAW_RULES } from '../../simulation/types.ts';

export interface PlayConfig {
  humanColor: PieceColor;
  chessAI: ChessAI;            // bot
  cardAI: CardAI;              // bot
  maxMoves?: number;           // default 200
  /** Min total ms between "bot's turn starts" and "bot's move appears".
   * Lets fast searches (depth 1) still feel deliberate. Default 700. */
  botMinThinkMs?: number;
  /** Pause after the human's move before the bot starts thinking. Default 260. */
  humanMoveSettleMs?: number;
  onRequestNewGame?: () => void; // called when user picks "new game" in the game-over modal
  /** Optional session log used by the bug-report modal. The controller
   * pushes structured events here (bot decisions, card applications,
   * validation warnings) without coupling to any UI. */
  debugLog?: DebugLog;
  /** Which card categories are in the deck for this game. If undefined or
   * empty, falls back to ALL cards (legacy behavior). Set on the new-game
   * setup screen and persisted in localStorage. */
  enabledCategories?: import('../../cards/types.ts').CardCategory[];
  /** Card-draw pacing. Defaults to DEFAULT_DRAW_RULES (variant 6 \u2014 both
   * sides start with one card, no white-first-skip). Mostly here so
   * tests / the simulator can override; the live UI just takes the
   * default. */
  drawRules?: DrawRules;
  /** Override max hand size. Defaults to the JSON default (3). The
   * new-game panel exposes a slider for 2\u20135. */
  maxHandSize?: number;
  /** Per-card copies overrides keyed by card name. Lets the new-game panel
   * tweak deck composition without changing the JSON defaults: a value of 0
   * removes the card from the deck, a positive value replaces the JSON
   * `copies` count. Cards not present in the map keep their defaults. */
  cardOverrides?: Record<string, number>;
  /** Pre-built (state, deck) pair from the load-game flow. When set, the
   * controller bypasses its default initialization \u2014 no deck rebuild,
   * no shuffle, no starting-hand deal \u2014 and resumes from the snapshot.
   * The `enabledCategories` / `cardOverrides` / `maxHandSize` fields are
   * ignored in this mode (the loader has already configured the deck).
   * Used by the "load from saved state" UI for testers reproducing a
   * specific position; not used by the normal play flow. */
  loadedSnapshot?: { state: SuperChessState; deck: Deck };
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
  // Pawn Retreat: own pawn → empty square 1 row toward own home rank
  // (same file). Two-step targeting handled like Retreat but restricted.
  | { kind: 'pawnRetreat' }
  // Sidestep: own pawn → empty diagonally-forward square (1 step).
  | { kind: 'sidestep' }
  // Resurrection: empty square in our back 2 ranks. Effect ALSO requires
  // at least one eligible (R/B/N) captured piece — handleCardClick checks
  // that upfront and refuses to enter targeting mode otherwise.
  | { kind: 'resurrectionSquare' }
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
  /** Active opening pilot, or null if disengaged / never set. */
  pilot: PilotStatus | null;
  /** The pilot's currently-proposed move, awaiting user confirmation.
   * Null when no proposal is queued (between turns, after disengage, etc). */
  pilotProposal: PilotProposal | null;
  /** Whether the UI should offer the "engage a pilot" affordance. True
   * only on the very first move of the human's first turn. */
  pilotPickerAvailable: boolean;
  /** Whose turn-phase the controller is currently rendering, regardless
   * of `state.chess.turn`. In the 'post' phase this is the player who
   * just moved (the engine has already flipped chess.turn). */
  turnOwner: PieceColor;
  /** 'pre'  \u2014 before the move; only pre / instead cards are playable.
   *  'post' \u2014 after the move; only post (defensive) cards are playable. */
  turnPhase: 'pre' | 'post';
  /** True when the human is in their post-card phase AND has at least one
   * post-eligible card in hand. Surfaced so the UI can render an
   * "end turn" button (otherwise the turn auto-ends after a settle pause).
   * Always false outside the human's post-phase. */
  postPhaseAwaitingHuman: boolean;
}

export interface PilotStatus {
  name: string;
  /** 0-based index of the next move the pilot would play. */
  nextIdx: number;
  /** Total number of moves in the opening. */
  total: number;
  /** Pretty label for the next move (e.g. "Nf3"), or null if the line is done. */
  nextLabel: string | null;
}

/** The pilot's suggestion that's currently awaiting user confirmation.
 * Surfaced to the UI so it can render a confirm button, highlight the
 * from/to squares, etc. */
export interface PilotProposal {
  /** Pretty SAN label (e.g. "Nf3") for the button / banner. */
  label: string;
  /** Opening name, for the banner header. */
  openingName: string;
  /** Origin square — highlighted on the board. */
  from: Square;
  /** Destination square — highlighted on the board. */
  to: Square;
}

export class PlayController {
  private state: SuperChessState;
  private deck: Deck;
  private cfg: PlayConfig;
  private positionCounts = new Map<string, number>();
  private drawRules: DrawRules;
  private whiteFirstDrawSkipped = false;

  private selectedSquare: Square | null = null;
  private cardPhase: CardTargetingPhase = { kind: 'none' };
  private botThinking = false;
  private banner: string | null = null;

  /** Where in the turn we are. The owner is the color whose turn-phase this
   * is; this matches `chess.turn` while in 'pre' but is the OPPOSITE color
   * once we're in 'post' (because `applyMove` already flipped the engine's
   * turn marker). When we hand off (end-of-turn), `turnOwner` flips and
   * `turnPhase` resets to 'pre'. The pre/post-card flow gates which cards
   * the human can play and how the bot drives its turn. */
  private turnPhase: 'pre' | 'post' = 'pre';
  private turnOwner: PieceColor = 'w';

  /** Active opening + next-move pointer. Cleared (null) when the pilot
   * disengages — either because the line ran out, the opponent deviated in
   * a way that breaks book theory, the next move would be illegal, or the
   * user took manual control. */
  private pilot: { opening: Opening; nextIdx: number } | null = null;

  /** The move the pilot is currently suggesting, plus the legal Move
   * object that will be played if the user confirms. Cleared whenever
   * the pilot is disengaged or the suggestion is consumed. */
  private pilotProposal: { proposal: PilotProposal; move: Move } | null = null;

  private listeners: Array<(vm: PlayViewModel) => void> = [];

  constructor(cfg: PlayConfig) {
    this.cfg = {
      maxMoves: 200,
      botMinThinkMs: 700,
      humanMoveSettleMs: 260,
      ...cfg,
    };
    this.drawRules = this.cfg.drawRules ?? DEFAULT_DRAW_RULES;
    if (cfg.loadedSnapshot) {
      // Snapshot path: trust the loader. We deep-clone the deck reference
      // by simply taking it (loadGame.ts produced it for us, and nothing
      // else has a handle), and reuse the pre-built state. Skip the
      // shuffle + dealStartingHand entirely \u2014 the snapshot already
      // contains its own hands.
      this.deck = cfg.loadedSnapshot.deck;
      this.state = cfg.loadedSnapshot.state;
      this.turnOwner = this.state.chess.turn;
      // We don't have history to rebuild positionCounts from, so we
      // record the starting position as the only known one. Three-fold
      // repetition is therefore measured from the load point forward,
      // which is the correct behavior for resumed games.
      this.recordPosition();
      this.cfg.debugLog?.info('session', 'new game (loaded from snapshot)', {
        humanColor: this.cfg.humanColor,
        fen: undefined,
        loadedHands: {
          w: this.deck.getHand('w').length,
          b: this.deck.getHand('b').length,
        },
      });
      return;
    }
    const overridesList = this.cfg.cardOverrides
      ? Object.entries(this.cfg.cardOverrides).map(([name, copies]) => ({ name, copies }))
      : undefined;
    const definitions = buildDeck({
      categories: this.cfg.enabledCategories,
      overrides: overridesList,
    }).filter((c) => c.copies > 0);
    if (definitions.length === 0) {
      // Defensive: an empty deck would make the game unplayable (no card
      // draws ever fire). Log + fall back to the full deck rather than
      // silently dealing nothing.
      this.cfg.debugLog?.warn('session', 'enabledCategories produced empty deck; falling back to full set', {
        enabledCategories: this.cfg.enabledCategories,
        cardOverrides: this.cfg.cardOverrides,
      });
      this.deck = new Deck(buildDeck(), { maxHandSize: cfg.maxHandSize });
    } else {
      this.deck = new Deck(definitions, { maxHandSize: cfg.maxHandSize });
    }
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
    this.turnOwner = chess.turn;
    // Deal starting hands per drawRules. The ticker resolves these as
    // history entries with reason 'startingHand' so the move log /
    // bug-report payload can tell them apart from earned draws.
    this.dealStartingHand('w', this.drawRules.startingHand.white);
    this.dealStartingHand('b', this.drawRules.startingHand.black);
    this.state.deck = this.deck.getState();
    this.recordPosition();
    this.cfg.debugLog?.info('session', 'new game', {
      humanColor: this.cfg.humanColor,
      maxMoves: this.cfg.maxMoves,
      botMinThinkMs: this.cfg.botMinThinkMs,
      drawRules: this.drawRules,
    });
  }

  private dealStartingHand(color: PieceColor, count: number): void {
    const max = this.deck.maxHandSize;
    const n = Math.min(count, max);
    for (let i = 0; i < n; i++) {
      const drawn = this.deck.draw(color);
      if (!drawn) break;
      this.state.history.push({
        type: 'cardDraw',
        data: { color, card: drawn, reason: 'startingHand' },
        turn: 1,
      });
    }
  }

  /** Expose the controller's current state to callers that need a snapshot
   * (e.g. the bug-report modal). Read-only by contract — DO NOT mutate. */
  getState(): SuperChessState {
    return this.state;
  }

  getConfig(): Readonly<PlayConfig> {
    return this.cfg;
  }

  onChange(cb: (vm: PlayViewModel) => void): void {
    this.listeners.push(cb);
  }

  /** Kick off: if bot plays first, queue its turn. After the bot's opener,
   * try the pilot — covers the case where a black-side human engaged it
   * while the bot was thinking, so its first proposal is queued. */
  async start(): Promise<void> {
    this.turnOwner = this.state.chess.turn;
    this.turnPhase = 'pre';
    this.emit();
    if (this.state.chess.turn !== this.cfg.humanColor && !this.state.result) {
      await this.runBotTurn();
    }
    // After the bot's opener (or immediately for white-side human), reset
    // owner to the human's pre-card window so card-gating works.
    if (!this.state.result) {
      this.turnOwner = this.cfg.humanColor;
      this.turnPhase = 'pre';
      this.emit();
    }
    this.proposeNextPilotMove();
  }

  /** Whether the in-game pilot picker should be offered to the user. True
   * iff (a) the human hasn't played their first move yet, (b) no pilot is
   * currently engaged, and (c) the game is still live. Once any of those
   * change, the picker affordance hides for the rest of the game. */
  canOfferPilot(): boolean {
    if (this.pilot) return false;
    if (this.state.result) return false;
    return !this.humanHasMoved();
  }

  private humanHasMoved(): boolean {
    for (const ev of this.state.history) {
      if (ev.type === 'move' && ev.data.color === this.cfg.humanColor) return true;
    }
    return false;
  }

  /** Activate the opening pilot mid-game. Throws on unknown id or color
   * mismatch — callers should pre-filter using `openingsForColor(humanColor)`.
   * If it's already the human's turn, the first canned move fires after a
   * brief beat (handled by maybeAutoPlayPilot). */
  async engagePilot(openingId: string): Promise<void> {
    if (this.pilot) {
      // Already engaged — no-op (handles fast double-clicks gracefully).
      return;
    }
    const opening = findOpening(openingId);
    if (!opening) {
      throw new Error(`engagePilot: no opening with id '${openingId}'`);
    }
    if (opening.color !== this.cfg.humanColor) {
      throw new Error(
        `engagePilot: opening '${opening.name}' is for ${opening.color} but human is ${this.cfg.humanColor}`,
      );
    }
    if (this.humanHasMoved()) {
      // We only support engaging the pilot before the human's first move —
      // openings only make sense from the starting position.
      throw new Error('engagePilot: human has already moved, pilot cannot be engaged');
    }
    this.pilot = { opening, nextIdx: 0 };
    this.cfg.debugLog?.info('pilot', 'engaged', { opening: opening.id });
    this.emit();
    // If it's already our turn (true when human is white, or when human is
    // black and the bot has already replied), queue the first proposal.
    this.proposeNextPilotMove();
  }

  /** Stop the opening pilot. Idempotent. Surfaced in the UI as a "stop"
   * button and also fired implicitly when the human takes manual control
   * (clicks a piece, plays a card). Reason is logged. */
  disengagePilot(reason: string): void {
    if (!this.pilot && !this.pilotProposal) return;
    const wasOn = this.pilot?.opening.name ?? this.pilotProposal?.proposal.openingName ?? '?';
    this.pilot = null;
    this.pilotProposal = null;
    this.cfg.debugLog?.info('pilot', 'disengaged', { opening: wasOn, reason });
    this.emit();
  }

  /** Confirm the currently-queued pilot proposal and play that move.
   * Called from the "play [Nf3]" button. No-op if there's no proposal. */
  async confirmPilotMove(): Promise<void> {
    if (!this.pilotProposal || !this.pilot) return;
    if (this.state.chess.turn !== this.cfg.humanColor) return;
    if (this.botThinking || this.state.result) return;
    const move = this.pilotProposal.move;
    const label = this.pilotProposal.proposal.label;
    this.cfg.debugLog?.info('pilot', 'user confirmed proposal', {
      opening: this.pilot.opening.name,
      idx: this.pilot.nextIdx,
      move: label,
    });
    this.pilot.nextIdx++;
    this.pilotProposal = null;
    // Clear any latent selection so the played move animates cleanly.
    this.selectedSquare = null;
    await this.applyHumanMove(move);
  }

  /** "Move for me." Asks the chess AI to pick a move for the human's
   * color and plays it through the normal human-move pipeline. Useful
   * when the player is stuck, wants a hint, or just wants to sail
   * through a position. Cards aren't played automatically \u2014 only the
   * chess move \u2014 so the player keeps control of card decisions.
   *
   * No-op when it's not the human's turn, the bot is already thinking,
   * the game is over, or the player is mid-card-target. */
  async autoPlayHumanMove(): Promise<void> {
    if (this.botThinking || this.state.result) return;
    if (this.state.chess.turn !== this.cfg.humanColor) return;
    if (this.cardPhase.kind !== 'none') return;

    // Disengage the pilot if it was in the middle of proposing \u2014 auto-move
    // and pilot are mutually exclusive ways to delegate this turn.
    if (this.pilotProposal) {
      this.pilotProposal = null;
    }
    this.selectedSquare = null;

    // Reuse the same "thinking" flag the bot uses so the existing turn
    // indicator pulses while we compute. This also locks input out
    // (board / cards) since most click-handlers bail when botThinking.
    this.botThinking = true;
    this.emit();

    // Tiny pause so the spinner paints before potentially-fast AI work.
    await microPause(60);

    const legal = this.legalMovesForColor(this.cfg.humanColor);
    if (legal.length === 0) {
      this.botThinking = false;
      this.detectGameOver();
      this.emit();
      return;
    }

    let move: Move;
    try {
      const start = performance.now();
      const raw = await this.cfg.chessAI.selectMove(this.state, this.cfg.humanColor);
      const found = legal.find(
        (m) => m.from === raw.from && m.to === raw.to && m.promotion === raw.promotion,
      );
      if (!found) {
        this.cfg.debugLog?.warn('session', 'auto-move: AI returned move not in legal set, falling back', {
          ai: { from: raw.from, to: raw.to, promotion: raw.promotion },
        });
      }
      move = found ?? legal[0];
      this.cfg.debugLog?.info('session', 'auto-move chose', {
        tookMs: Math.round(performance.now() - start),
        from: move.from, to: move.to, promotion: move.promotion,
      });
    } catch (err) {
      this.cfg.debugLog?.error('session', 'auto-move chess AI threw, falling back to legal[0]', {
        message: (err as Error).message,
      });
      move = legal[0];
    }

    // Clear thinking flag BEFORE applyHumanMove because that path starts
    // a real bot turn at the end which manages the flag itself.
    this.botThinking = false;
    await this.applyHumanMove(move);
  }

  /** Look at the current board + opening + opponent's last move. If we're
   * still in book and the next pilot move is legal, queue a proposal for
   * the user to confirm. Otherwise disengage cleanly with an explanation. */
  private proposeNextPilotMove(): void {
    this.pilotProposal = null;
    if (!this.pilot) return;
    if (this.state.result) return;
    if (this.botThinking) return;
    if (this.state.chess.turn !== this.cfg.humanColor) return;
    if (this.cardPhase.kind !== 'none') return;
    if (this.pilot.nextIdx >= this.pilot.opening.moves.length) {
      const name = this.pilot.opening.name;
      this.pilot = null;
      this.cfg.debugLog?.info('pilot', 'line complete', { opening: name });
      this.flashBanner(`\u{1F3BC} ${name} \u2014 line complete, you\u2019re on your own`);
      this.emit();
      return;
    }

    const next = this.pilot.opening.moves[this.pilot.nextIdx];

    // (1) Book check — did the opponent play a move we're prepared for?
    // Empty validAfter means "no constraint" (e.g. white's move 1, or a
    // universal system like the London where any reply is fine).
    if (next.validAfter.length > 0) {
      const oppLastUci = this.opponentLastMoveUci();
      if (oppLastUci === null || !next.validAfter.includes(oppLastUci)) {
        const name = this.pilot.opening.name;
        this.cfg.debugLog?.info('pilot', 'out of book — disengaging', {
          opening: name,
          nextIdx: this.pilot.nextIdx,
          opponentPlayed: oppLastUci,
          expected: next.validAfter,
        });
        this.pilot = null;
        const oppLabel = this.opponentLastMoveLabel() ?? oppLastUci ?? '?';
        this.flashBanner(`\u{1F3BC} ${name} disengaged \u2014 opponent\u2019s ${oppLabel} is out of book`);
        this.emit();
        return;
      }
    }

    // (2) Legality check — paranoid sanity, since cards can mutate the
    // board in ways "book" doesn't anticipate.
    const legal = this.legalMovesForColor(this.cfg.humanColor);
    const match = legal.find((m) => {
      if (m.from !== next.from || m.to !== next.to) return false;
      if (next.promotion === null) return m.promotion === null;
      return m.promotion !== null && m.promotion[1] === next.promotion;
    });
    if (!match) {
      const name = this.pilot.opening.name;
      this.cfg.debugLog?.info('pilot', 'next move illegal — disengaging', {
        opening: name,
        nextIdx: this.pilot.nextIdx,
        intended: next,
      });
      this.pilot = null;
      this.flashBanner(`\u{1F3BC} ${name} disengaged \u2014 ${next.label} isn\u2019t playable anymore`);
      this.emit();
      return;
    }

    // (3) Queue the proposal. UI renders a confirm button + board highlight.
    this.pilotProposal = {
      move: match,
      proposal: {
        label: next.label,
        openingName: this.pilot.opening.name,
        from: next.from,
        to: next.to,
      },
    };
    this.cfg.debugLog?.info('pilot', 'proposing move', {
      opening: this.pilot.opening.name,
      idx: this.pilot.nextIdx,
      move: next.label,
    });
    this.emit();
  }

  /** UCI string of the opponent's most-recent move, or null if they
   * haven't moved yet. Used by the book check. */
  private opponentLastMoveUci(): string | null {
    const oppColor: PieceColor = this.cfg.humanColor === 'w' ? 'b' : 'w';
    // Walk history backwards looking for the most recent move BY the
    // opponent (skipping card draws / plays).
    for (let i = this.state.history.length - 1; i >= 0; i--) {
      const ev = this.state.history[i];
      if (ev.type === 'move' && ev.data.color === oppColor) {
        return moveToUci(ev.data.from, ev.data.to, ev.data.promotion);
      }
    }
    return null;
  }

  /** Pretty SAN label of the opponent's most recent move, or null. */
  private opponentLastMoveLabel(): string | null {
    const oppColor: PieceColor = this.cfg.humanColor === 'w' ? 'b' : 'w';
    for (let i = this.state.history.length - 1; i >= 0; i--) {
      const ev = this.state.history[i];
      if (ev.type === 'move' && ev.data.color === oppColor) {
        return ev.data.algebraic;
      }
    }
    return null;
  }

  // ─── public events from UI ────────────────────────────────────────────────

  async handleSquareClick(sq: Square): Promise<void> {
    if (this.botThinking || this.state.result) return;

    // Card targeting takes precedence. The targeting flow uses `turnOwner`,
    // NOT `chess.turn` \u2014 in post-phase the engine has already flipped
    // chess.turn to the bot but the human still owns the turn-phase and
    // is mid-card-flow. Without this branch, e.g. playing Freeze after
    // your move would silently drop the target click.
    if (this.cardPhase.kind !== 'none') {
      if (this.turnOwner !== this.cfg.humanColor) return;
      await this.handleCardTargetClick(sq);
      return;
    }

    // Move flow: must actually be the human's chess turn (not just the
    // post-phase, where the move already happened).
    if (this.state.chess.turn !== this.cfg.humanColor) return;

    const piece = this.state.chess.board[sq];

    // Click the already-selected piece → deselect it. Cheap escape hatch
    // when the user changes their mind without having to click an empty
    // square. Pilot state is unaffected (it was already disengaged on
    // the initial selection click).
    if (piece && pieceColor(piece) === this.cfg.humanColor && this.selectedSquare === sq) {
      this.selectedSquare = null;
      this.emit();
      return;
    }

    // Click own piece → select it. This counts as "taking the wheel" from
    // the pilot — the user wants to play their own move now. Even an
    // unconsumed proposal counts as engaged (so we clear both).
    if (piece && pieceColor(piece) === this.cfg.humanColor) {
      if (this.pilot || this.pilotProposal) {
        this.disengagePilot('user selected a piece manually');
        this.flashBanner('\u{1F3BC} opening pilot off \u2014 you\u2019ve got the wheel');
      }
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
    // Card play is now phase-gated. The card's phase must match the
    // current turnPhase, AND the human must own this turn-phase. We use
    // turnOwner instead of chess.turn because in the post phase the
    // engine has already flipped chess.turn to the bot.
    if (this.turnOwner !== this.cfg.humanColor) return;
    const phaseOfCard = getCardPhase(card.definition);
    if (this.turnPhase === 'pre' && phaseOfCard === 'post') {
      this.flashBanner(`\u{1F6E1}\uFE0F ${card.definition.name} is a defensive card \u2014 play it AFTER your move`);
      return;
    }
    if (this.turnPhase === 'post' && phaseOfCard !== 'post') {
      this.flashBanner(`\u2694\uFE0F ${card.definition.name} is an offensive card \u2014 you already moved`);
      return;
    }

    // Playing a card is incompatible with pilot mode (the pilot only plays
    // chess moves; it doesn't know how to react to a card). Disengage.
    if (this.pilot || this.pilotProposal) {
      this.disengagePilot('user picked a card');
      this.flashBanner('\u{1F3BC} opening pilot off \u2014 cards aren\u2019t scripted');
    }

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
      if (phaseOfCard === 'post') {
        await this.applyPostCard(card, {});
      } else {
        await this.applyCard(card, {});
      }
      return;
    }

    // Resurrection has a precondition (an eligible captured piece must
    // exist) that the targeting UI can't show. Refuse to enter targeting
    // mode rather than silently highlighting squares that all return no-op.
    if (need.kind === 'resurrectionSquare'
        && !hasResurrectableCapturedPiece(this.state, this.cfg.humanColor)) {
      this.flashBanner(`\u2728 Resurrection: nothing to revive \u2014 you haven\u2019t lost any minor pieces`);
      this.cfg.debugLog?.warn('card', 'Resurrection refused (no eligible captured piece)');
      return;
    }

    if (need.kind === 'pieceType') {
      const t = await showPieceTypePicker({
        title: 'force opponent to move a…',
        color: this.cfg.humanColor,
        onCancel: () => { this.cardPhase = { kind: 'none' }; this.emit(); },
      });
      if (t) {
        if (phaseOfCard === 'post') {
          await this.applyPostCard(card, { pieceType: t });
        } else {
          await this.applyCard(card, { pieceType: t });
        }
      }
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
    if (this.pilotProposal) {
      // Treat Escape on an open pilot proposal as "I'll take it" — disengage.
      this.disengagePilot('user pressed Escape on a pilot proposal');
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
      if (
        need.kind === 'twoOwnPieces' ||
        need.kind === 'teleport' ||
        need.kind === 'retreat' ||
        need.kind === 'pawnRetreat' ||
        need.kind === 'sidestep'
      ) {
        this.cardPhase = {
          kind: 'card-second-target',
          card: this.cardPhase.card,
          firstSquare: sq,
        };
        this.emit();
        return;
      }

      const target = this.targetFromSquare(need, sq);
      const card = this.cardPhase.card;
      if (getCardPhase(card.definition) === 'post') {
        await this.applyPostCard(card, target);
      } else {
        await this.applyCard(card, target);
      }
      return;
    }

    if (this.cardPhase.kind === 'card-second-target') {
      const card = this.cardPhase.card;
      const need = needForCard(card.definition);
      const validSecond = this.validSecondTargets(need, this.cardPhase.firstSquare);
      if (!validSecond.has(sq)) {
        // Cancel & re-stage
        this.cardPhase = { kind: 'none' };
        this.emit();
        return;
      }
      const target = this.twoStepTarget(need, this.cardPhase.firstSquare, sq);
      if (getCardPhase(card.definition) === 'post') {
        await this.applyPostCard(card, target);
      } else {
        await this.applyCard(card, target);
      }
      return;
    }
  }

  private async applyCard(card: CardInstance, target: CardTarget): Promise<void> {
    const effectFn = CARD_EFFECTS[card.definition.name];
    if (!effectFn) {
      this.cfg.debugLog?.error('card', `no effect handler for "${card.definition.name}"`);
      this.cardPhase = { kind: 'none' };
      this.emit();
      return;
    }
    const color = this.cfg.humanColor;
    const result = effectFn(this.state, color, target);
    if (result.newState === this.state) {
      // Effect was a no-op (invalid). Keep card in hand, clear targeting.
      this.cfg.debugLog?.warn('card', `${card.definition.name}: no-op`, { target });
      this.flashBanner(`${card.definition.name}: nothing to do`);
      this.cardPhase = { kind: 'none' };
      this.emit();
      return;
    }

    this.cfg.debugLog?.info('card', `human played ${card.definition.name}`, {
      target, logEntry: result.logEntry, materialDelta: result.materialDelta,
    });

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

    // Cards marked consumesTurn (Pawn Storm, Mirror) ARE the player's whole
    // turn — skip the chess-move phase, advance the turn, and hand off to
    // the bot.
    if (card.definition.consumesTurn) {
      this.state = consumeTurnBookkeeping(this.state, color, {
        pawnMovedOrCaptured: true,
      });
      this.recordPosition();
      this.runSelfCheck();
      // Instead-cards skip the move phase entirely. They DO advance the
      // turn (consumeTurnBookkeeping flipped chess.turn). The owning side
      // doesn't get a post-card window after an instead-card \u2014 the card
      // already was their whole turn. Reset for the next side's pre-phase.
      this.turnOwner = this.state.chess.turn;
      this.turnPhase = 'pre';
      this.emit();

      if (this.detectGameOver()) return;
      // Hand off to the bot — same settle pause as a normal move.
      await microPause(this.cfg.humanMoveSettleMs ?? 260);
      await this.runBotTurn();
      return;
    }

    // Pre-card path: just refresh and stay in pre-phase, awaiting the
    // chess move. (Some pre-cards set per-turn flags consumed by the
    // imminent move; others are Time Warp / Disrupt etc.)
    this.runSelfCheck();
    this.emit();
  }

  /** Apply a post-move (defensive) card the human picked from the dim-aware
   * UI. Identical to applyCard except (a) it asserts the card is post-eligible
   * and (b) it ends the turn after applying instead of staying open. */
  private async applyPostCard(card: CardInstance, target: CardTarget): Promise<void> {
    if (getCardPhase(card.definition) !== 'post') {
      this.cfg.debugLog?.error('card', `applyPostCard called with non-post card: ${card.definition.name}`);
      this.cardPhase = { kind: 'none' };
      this.emit();
      return;
    }
    const effectFn = CARD_EFFECTS[card.definition.name];
    if (!effectFn) {
      this.cfg.debugLog?.error('card', `no effect handler for "${card.definition.name}"`);
      this.cardPhase = { kind: 'none' };
      this.emit();
      return;
    }
    const color = this.turnOwner;
    const result = effectFn(this.state, color, target);
    if (result.newState === this.state) {
      this.cfg.debugLog?.warn('card', `${card.definition.name}: no-op`, { target });
      this.flashBanner(`${card.definition.name}: nothing to do`);
      this.cardPhase = { kind: 'none' };
      this.emit();
      return;
    }
    this.cfg.debugLog?.info('card', `human played ${card.definition.name} (post)`, {
      target, logEntry: result.logEntry, materialDelta: result.materialDelta,
    });
    this.state = result.newState;
    this.state.history.push({
      type: 'cardPlay',
      data: {
        cardName: card.definition.name,
        playedBy: color,
        onTurn: this.state.chess.fullMoveNumber,
        target: JSON.stringify(target),
        materialBefore: { w: 0, b: 0 },
        materialAfter: { w: 0, b: 0 },
      },
      turn: this.state.chess.fullMoveNumber,
    });
    this.deck.play(color, card);
    this.state.deck = this.deck.getState();
    this.cardPhase = { kind: 'none' };
    this.selectedSquare = null;
    this.runSelfCheck();
    this.emit();
    // Post-card was the closing beat of the turn; hand off to the bot.
    await this.endHumanTurn();
  }

  private async applyHumanMove(move: Move): Promise<void> {
    await this.commitMove(move);
    this.selectedSquare = null;
    this.emit();

    if (this.detectGameOver()) return;

    // Extra Move card: human gets a second non-capture move. commitMove
    // already flipped turn → bot. We un-flip it so the human can play
    // again. The next applyHumanMove (their second click sequence) will
    // re-flip naturally. Extra-move bonuses bypass the post-card phase
    // entirely \u2014 the extra move IS still part of the pre-move flow.
    if (this.consumeExtraMoveBonus()) {
      this.flashBanner(`\u26A1 extra move \u2014 pick a non-capture`);
      this.emit();
      return;
    }

    // Move was committed, chess.turn flipped. We're now in the moving
    // player's POST-card window. The owner is still the human; turnPhase
    // becomes 'post'. If they have no post-eligible cards, auto-hand-off
    // after a settle pause so the user doesn't notice the new phase.
    this.turnOwner = this.cfg.humanColor;
    this.turnPhase = 'post';
    this.emit();

    const hand = this.deck.getHand(this.cfg.humanColor);
    const hasPost = hand.some((c) => getCardPhase(c.definition) === 'post');

    if (!hasPost) {
      // Standard "no defensive cards" path \u2014 mirrors the old behavior:
      // settle, then bot.
      await microPause(this.cfg.humanMoveSettleMs ?? 260);
      await this.endHumanTurn();
      return;
    }

    // Has post cards \u2014 wait for explicit play or end-turn click. The UI
    // surfaces the end-turn button via vm.postPhaseAwaitingHuman.
  }

  /** Hand off from human to bot at the end of the human's full turn (post
   * phase complete). Resets phase state for the bot's pre-card window and
   * runs the bot turn. Called from:
   *   - applyHumanMove when the human has no post-eligible cards
   *   - applyPostCard when the human plays a post card
   *   - endHumanTurnExplicit() when the human clicks the "end turn" button
   * Idempotent enough to handle accidental double-fires (game-over check). */
  private async endHumanTurn(): Promise<void> {
    if (this.state.result) return;
    // Reset for the bot's pre-card window. chess.turn is already the bot
    // (commitMove flipped it). runBotTurn will flip turnOwner / turnPhase
    // again as it walks through pre \u2192 move \u2192 post.
    this.turnOwner = this.state.chess.turn;
    this.turnPhase = 'pre';
    this.emit();

    if (this.detectGameOver()) return;
    await this.runBotTurn();
    // Bot finished its full turn; we're now back to the human's pre-card
    // window. runBotTurn leaves turnOwner=bot/turnPhase='post', so we
    // explicitly reset here for the next human action.
    if (!this.state.result) {
      this.turnOwner = this.cfg.humanColor;
      this.turnPhase = 'pre';
      this.emit();
    }
    this.proposeNextPilotMove();
  }

  /** Public hook for the "end turn" button surfaced in the UI when the
   * human is in their post-card phase but doesn't want to play one. No-op
   * outside that exact state so spurious clicks don't break flow. */
  async endTurnExplicit(): Promise<void> {
    if (this.botThinking || this.state.result) return;
    if (this.turnOwner !== this.cfg.humanColor) return;
    if (this.turnPhase !== 'post') return;
    if (this.cardPhase.kind !== 'none') return;
    await this.endHumanTurn();
  }

  /** If the player who just moved is owed an Extra Move bonus, un-flip the
   * turn so they can play again and clear the flag. Returns true if a bonus
   * was consumed. */
  private consumeExtraMoveBonus(): boolean {
    const justMovedColor: PieceColor = this.state.chess.turn === 'w' ? 'b' : 'w';
    if (this.state.superState.extraMoveRemaining !== justMovedColor) return false;
    this.state = {
      ...this.state,
      chess: {
        ...this.state.chess,
        turn: justMovedColor,
        fullMoveNumber: justMovedColor === 'b'
          ? this.state.chess.fullMoveNumber - 1
          : this.state.chess.fullMoveNumber,
      },
      superState: { ...this.state.superState, extraMoveRemaining: null },
    };
    return true;
  }

  private async runBotTurn(): Promise<void> {
    const startTime = performance.now();
    this.botThinking = true;
    const color: PieceColor = this.cfg.humanColor === 'w' ? 'b' : 'w';
    this.turnOwner = color;
    this.turnPhase = 'pre';
    this.emit();

    this.cfg.debugLog?.info('bot', `turn start (${color})`, {
      turn: this.state.chess.fullMoveNumber,
      handSize: this.deck.getHand(color).length,
    });

    // Small delay so the "thinking" indicator paints before the AI starts.
    await microPause(60);

    // Pre-card phase. The AI sees only pre / instead cards in its hand.
    const preResult = await this.botPlayCard(color, 'pre');

    if (preResult.consumedTurn) {
      // Instead-card was the bot's whole turn. consumeTurnBookkeeping
      // already flipped chess.turn. We respect the min-think floor and
      // hand back. NB: instead-cards skip both the move AND post phase.
      const elapsed = performance.now() - startTime;
      const min = this.cfg.botMinThinkMs ?? 700;
      if (elapsed < min) await microPause(min - elapsed);
      this.botThinking = false;
      if (this.detectGameOver()) return;
      this.emit();
      return;
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
      const moveStart = performance.now();
      const raw = await this.cfg.chessAI.selectMove(this.state, color);
      const found = legal.find((m) => m.from === raw.from && m.to === raw.to && m.promotion === raw.promotion);
      if (!found) {
        this.cfg.debugLog?.warn('bot', 'AI returned a move not in legal set; falling back to legal[0]', {
          ai: { from: raw.from, to: raw.to, promotion: raw.promotion },
          fallback: { from: legal[0].from, to: legal[0].to },
        });
      }
      move = found ?? legal[0];
      this.cfg.debugLog?.info('bot', 'chess move selected', {
        tookMs: Math.round(performance.now() - moveStart),
        from: move.from, to: move.to, promotion: move.promotion,
        legalCount: legal.length,
      });
    } catch (err) {
      this.cfg.debugLog?.error('bot', 'chess AI threw', {
        message: (err as Error).message,
        stack: (err as Error).stack,
      });
      move = legal[0];
    }

    // Enforce a minimum total think time so the bot never snap-responds —
    // depth-1 minimax often returns in under 10ms which feels disrespectful.
    const elapsed = performance.now() - startTime;
    const min = this.cfg.botMinThinkMs ?? 700;
    if (elapsed < min) {
      await microPause(min - elapsed);
    }

    await this.commitMove(move);

    // Bot might be owed an Extra Move bonus — apply it inline so we don't
    // have to thread "still bot's turn" state through the whole controller.
    if (this.consumeExtraMoveBonus()) {
      const bonusLegal = getSuperChessLegalMoves(this.state, color)
        .filter((m) => m.capture === null);
      if (bonusLegal.length > 0) {
        await microPause(400); // brief pause so it reads as two moves, not one
        let bonus: Move;
        try {
          const raw = await this.cfg.chessAI.selectMove(this.state, color);
          bonus = bonusLegal.find(
            (m) => m.from === raw.from && m.to === raw.to && m.promotion === raw.promotion,
          ) ?? bonusLegal[0];
        } catch {
          bonus = bonusLegal[0];
        }
        this.cfg.debugLog?.info('bot', 'extra-move bonus selected', {
          from: bonus.from, to: bonus.to,
        });
        await this.commitMove(bonus);
      } else {
        // Forfeit — restore turn to opponent so play continues.
        this.state = {
          ...this.state,
          chess: {
            ...this.state.chess,
            turn: color === 'w' ? 'b' : 'w',
            fullMoveNumber: color === 'b'
              ? this.state.chess.fullMoveNumber + 1
              : this.state.chess.fullMoveNumber,
          },
        };
      }
    }

    if (this.detectGameOver()) {
      this.botThinking = false;
      this.emit();
      return;
    }

    // Post-card phase. chess.turn is already the human (commitMove flipped
    // it), but the bot still owns this turn-phase. We pause briefly so the
    // move animates before the post-card swing.
    this.turnPhase = 'post';
    this.emit();
    await microPause(180);
    await this.botPlayCard(color, 'post');

    this.botThinking = false;
    if (this.detectGameOver()) return;
    this.emit();
  }

  /** Bot card-play helper. Filters the bot's hand to cards eligible for
   * `phase`, asks `cardAI.decide`, applies the choice, and returns whether
   * a card was played and whether that play consumed the whole turn (only
   * possible in 'pre' phase via instead-cards).
   *
   * Side-effects: mutates `this.state`, deck, history, may flash a banner
   * and pause for a "big moment" beat. Bails silently on AI exceptions \u2014
   * the surrounding turn flow keeps going. */
  private async botPlayCard(
    color: PieceColor,
    phase: 'pre' | 'post',
  ): Promise<{ played: boolean; consumedTurn: boolean }> {
    const fullHand = this.deck.getHand(color);
    const eligible = fullHand.filter((c) => {
      const p = getCardPhase(c.definition);
      return phase === 'pre' ? (p === 'pre' || p === 'instead') : p === 'post';
    });
    if (eligible.length === 0) return { played: false, consumedTurn: false };

    let consumedTurn = false;
    try {
      const decideStart = performance.now();
      const decision = await this.cfg.cardAI.decide(this.state, color, eligible);
      this.cfg.debugLog?.info('bot', `card decision (${phase})`, {
        tookMs: Math.round(performance.now() - decideStart),
        play: decision.shouldPlay,
        card: decision.card?.definition.name ?? null,
        target: decision.target,
        eligibleCount: eligible.length,
      });
      if (decision.shouldPlay && decision.card && decision.target !== undefined) {
        const effectFn = CARD_EFFECTS[decision.card.definition.name];
        if (effectFn) {
          const result = effectFn(this.state, color, decision.target);
          if (result.newState !== this.state) {
            this.cfg.debugLog?.info('card', `bot played ${decision.card.definition.name} (${phase})`, {
              target: decision.target,
              logEntry: result.logEntry,
              materialDelta: result.materialDelta,
            });
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
            const detail = result.logEntry
              ? `: ${stripCardPrefix(result.logEntry, decision.card.definition.name)}`
              : '';
            this.flashBanner(`opponent played ${decision.card.definition.emoji} ${decision.card.definition.name}${detail}`);
            this.emit();
            await microPause(620);

            if (decision.card.definition.consumesTurn) {
              consumedTurn = true;
              this.state = consumeTurnBookkeeping(this.state, color, {
                pawnMovedOrCaptured: true,
              });
              this.recordPosition();
              this.runSelfCheck();
            } else {
              this.runSelfCheck();
            }
            return { played: true, consumedTurn };
          }
        }
      }
    } catch (err) {
      this.cfg.debugLog?.error('bot', `card decision threw (${phase})`, {
        message: (err as Error).message,
        stack: (err as Error).stack,
      });
    }
    return { played: false, consumedTurn };
  }

  // ─── shared move commit (mutates this.state) ──────────────────────────────

  private async commitMove(move: Move): Promise<void> {
    const color = this.state.chess.turn;
    const algebraic = toAlgebraic(this.state.chess, move);
    const annotated = { ...move, algebraic, turnNumber: this.state.chess.fullMoveNumber, color };
    const captureHappened = move.capture !== null || move.enPassantCaptureSq !== null;
    const newChess = applyMove(this.state.chess, move);

    if (captureHappened && move.capture) {
      this.state.superState.capturedByColor.get(color)!.push(move.capture);
    }

    let nextSuper = transferMovedPieceShield(this.state.superState, move);
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

    // Card-draw triggers — only captures earn cards. The skip-first
    // rule is configurable via drawRules.whiteFirstDrawSkip; default
    // (variant 6) leaves it OFF so white gets a card on capture too.
    const skipThisDraw =
      this.drawRules.whiteFirstDrawSkip &&
      color === 'w' &&
      !this.whiteFirstDrawSkipped &&
      captureHappened;
    if (skipThisDraw) {
      this.whiteFirstDrawSkipped = true;
    } else if (captureHappened) {
      await this.drawOrSwap(color);
    }
    this.state.deck = this.deck.getState();

    this.recordPosition();
    this.runSelfCheck();
  }

  /**
   * Try to draw a card for `color`. Three paths:
   *
   *   1. Hand has room → draw normally and announce.
   *   2. Hand is full and `color` is the human → peek the next card and
   *      open a modal letting them pick which of three cards to discard.
   *   3. Hand is full and `color` is the bot → run a rarity heuristic:
   *      swap iff the new card outranks the bot's weakest card.
   *
   * Always logs to the history (either cardDraw + cardDiscard for a swap,
   * or cardDiscard alone for a reject). Banners explain the outcome.
   */
  private async drawOrSwap(color: PieceColor): Promise<void> {
    // Capture reward is the only card-draw trigger now; the old slow-game
    // rule has been retired.
    const reason = 'capture' as const;

    // Path 1: easy case — hand has room.
    if (this.deck.handSize(color) < this.deck.maxHandSize) {
      const drawn = this.deck.draw(color);
      if (!drawn) return; // deck + discard both empty
      this.state.history.push({
        type: 'cardDraw',
        data: { color, card: drawn, reason },
        turn: this.state.chess.fullMoveNumber,
      });
      this.announceDraw(color, drawn.definition.emoji, drawn.definition.name);
      return;
    }

    // Hand is full — peek the next card so we can offer a draft.
    const peeked = this.deck.forceDraw();
    if (!peeked) return;

    const existing = [...this.deck.getHand(color)];
    let toDiscard: CardInstance;

    if (color === this.cfg.humanColor) {
      // Path 2: human picks via modal.
      // Re-emit first so the board is settled before the modal pops.
      this.state.deck = this.deck.getState();
      this.emit();
      toDiscard = await showHandFullPicker({ existing, incoming: peeked });
    } else {
      // Path 3: bot heuristic — swap iff new card has higher rarity than
      // weakest in hand. Ties favour KEEPING (skip the new card).
      const rank = { common: 1, uncommon: 2, rare: 3 } as const;
      const peekedRank = rank[peeked.definition.rarity];
      const weakest = existing.reduce(
        (min, c) => (rank[c.definition.rarity] < rank[min.definition.rarity] ? c : min),
        existing[0],
      );
      const weakestRank = rank[weakest.definition.rarity];
      toDiscard = peekedRank > weakestRank ? weakest : peeked;
    }

    // Apply the decision.
    const kept = toDiscard.id === peeked.id;
    if (kept) {
      // Player/bot rejected the new card — it goes straight to discard.
      this.deck.sendToDiscard(peeked);
      this.state.history.push({
        type: 'cardDiscard',
        data: { color, card: peeked },
        turn: this.state.chess.fullMoveNumber,
      });
      this.announceSkippedDraw(color, peeked.definition.name);
      this.cfg.debugLog?.info('card', `${color} skipped draw (hand full)`, {
        peeked: peeked.definition.name,
      });
    } else {
      // Swap: discard the chosen existing card, add the new one.
      this.deck.discard(color, toDiscard);
      this.deck.addToHand(color, peeked);
      this.state.history.push({
        type: 'cardDiscard',
        data: { color, card: toDiscard },
        turn: this.state.chess.fullMoveNumber,
      });
      this.state.history.push({
        type: 'cardDraw',
        data: { color, card: peeked, reason },
        turn: this.state.chess.fullMoveNumber,
      });
      this.announceSwappedDraw(color, toDiscard, peeked);
      this.cfg.debugLog?.info('card', `${color} swapped on full-hand draw`, {
        discarded: toDiscard.definition.name,
        kept: peeked.definition.name,
      });
    }
    this.state.deck = this.deck.getState();
  }

  /** Run lightweight invariant checks after each commit. Any errors are
   * logged to the debug buffer with full state context; warnings are
   * logged but not flashed in the UI to avoid spam. The bug-report modal
   * surfaces both. */
  private runSelfCheck(): void {
    if (!this.cfg.debugLog) return;
    const result = validateState(this.state);
    for (const issue of result.errors) {
      this.cfg.debugLog.error('validate', issue.message, {
        tag: issue.tag, square: issue.square,
      });
    }
    for (const issue of result.warnings) {
      this.cfg.debugLog.warn('validate', issue.message, {
        tag: issue.tag, square: issue.square,
      });
    }
  }

  /** Friendly banner for any card draw — opponent or you. Captures are the
   * only trigger now, so the reason is always "capture reward". */
  private announceDraw(color: PieceColor, emoji: string, name: string): void {
    if (color === this.cfg.humanColor) {
      this.flashBanner(`\u{1F0CF} you drew ${emoji} ${name} (capture reward)`);
    } else {
      this.flashBanner(`\u{1F0CF} opponent drew a card (capture reward)`);
    }
  }

  /** Banner when a peeked draw is rejected (hand-full draft, user kept their
   * hand and discarded the new card). */
  private announceSkippedDraw(color: PieceColor, peekedName: string): void {
    if (color === this.cfg.humanColor) {
      this.flashBanner(`\u{1F0CF} you skipped ${peekedName} \u2014 hand full (capture reward)`);
    } else {
      this.flashBanner(`\u{1F0CF} opponent kept its hand (capture reward)`);
    }
  }

  /** Banner when a peeked draw replaces a held card. */
  private announceSwappedDraw(
    color: PieceColor,
    discarded: CardInstance,
    kept: CardInstance,
  ): void {
    if (color === this.cfg.humanColor) {
      this.flashBanner(
        `\u{1F0CF} you swapped ${discarded.definition.name} \u2192 ${kept.definition.emoji} ${kept.definition.name} (capture reward)`,
      );
    } else {
      // Don't reveal which card the bot dropped — that would leak hand info.
      this.flashBanner(`\u{1F0CF} opponent swapped a card (capture reward)`);
    }
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
    // A frozen own piece is locked down absolutely \u2014 it can't be the
    // source/target of any of OUR cards. (Opponent's frozen pieces are
    // OUR pieces in this expression \u2014 frozenSquares may include them
    // if THEY froze us, but ownPiece needs only consider our pieces.)
    const frozen = this.state.superState.frozenSquares;
    const isOwnFrozen = (sq: Square): boolean => {
      const p = board[sq];
      if (!p || pieceColor(p) !== color) return false;
      const t = frozen.get(sq);
      return t !== undefined && t > 0;
    };
    // Card-specific exclusions on top of the generic targetType.
    // Right now: Shield refuses to target the king (same as Freeze
    // refusing to target the opp king \u2014 makes the king
    // un-takeable, which removes most of chess from chess).
    const pickedName =
      this.cardPhase.kind === 'card-picked' ? this.cardPhase.card.definition.name :
      this.cardPhase.kind === 'card-second-target' ? this.cardPhase.card.definition.name :
      null;
    const excludeOwnKing = pickedName === 'Shield';
    switch (need.kind) {
      case 'ownPiece':
      case 'twoOwnPieces':
      case 'teleport':
      case 'retreat':
        for (let i = 0; i < 64; i++) {
          const p = board[i];
          if (p && pieceColor(p) === color) {
            if (excludeOwnKing && pieceType(p) === 'K') continue;
            if (isOwnFrozen(i)) continue;
            set.add(i);
          }
        }
        break;
      case 'pawnRetreat':
      case 'sidestep':
        // First step of two-step targeting: only OWN PAWNS that have at
        // least one legal destination per the card's rules. We compute
        // destinations up-front so a pawn with no legal move isn't shown
        // as a clickable target.
        for (let i = 0; i < 64; i++) {
          const p = board[i];
          if (!p || pieceColor(p) !== color || pieceType(p) !== 'P') continue;
          if (isOwnFrozen(i)) continue;
          const dests = need.kind === 'pawnRetreat'
            ? pawnRetreatDestinations(i, color, board)
            : sidestepDestinations(i, color, board);
          if (dests.length > 0) set.add(i);
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
          if (p && pieceColor(p) === color && pieceType(p) === 'P') {
            if (isOwnFrozen(i)) continue;
            set.add(i);
          }
        }
        break;
      case 'square':
        for (let i = 0; i < 64; i++) {
          if (board[i] === null) set.add(i);
        }
        break;
      case 'resurrectionSquare': {
        // Empty squares in OUR back 2 ranks. The effect ALSO needs an
        // eligible captured R/B/N to revive; that's gated separately in
        // handleCardClick so we don't enter targeting if there's nothing
        // to revive.
        for (const i of resurrectionLandingSquares(this.state, color)) set.add(i);
        break;
      }
      default:
        break;
    }
    return set;
  }

  private validSecondTargets(need: TargetNeed, firstSq: Square): Set<Square> {
    const board = this.state.chess.board;
    const set = new Set<Square>();
    const color = this.cfg.humanColor;
    const frozen = this.state.superState.frozenSquares;
    const isOwnFrozen = (sq: Square): boolean => {
      const p = board[sq];
      if (!p || pieceColor(p) !== color) return false;
      const t = frozen.get(sq);
      return t !== undefined && t > 0;
    };
    switch (need.kind) {
      case 'twoOwnPieces':
        for (let i = 0; i < 64; i++) {
          if (i === firstSq) continue;
          const p = board[i];
          if (p && pieceColor(p) === color) {
            if (isOwnFrozen(i)) continue;
            set.add(i);
          }
        }
        break;
      case 'teleport':
        for (let i = 0; i < 64; i++) {
          if (board[i] === null) set.add(i);
        }
        break;
      case 'retreat': {
        const p = board[firstSq];
        if (!p) break;
        for (let i = 0; i < 64; i++) {
          if (board[i] !== null) continue;
          if (isValidRetreat(p, firstSq, i, color, board)) set.add(i);
        }
        break;
      }
      case 'pawnRetreat': {
        for (const sq of pawnRetreatDestinations(firstSq, color, board)) set.add(sq);
        break;
      }
      case 'sidestep': {
        for (const sq of sidestepDestinations(firstSq, color, board)) set.add(sq);
        break;
      }
      default:
        break;
    }
    return set;
  }

  private targetFromSquare(need: TargetNeed, sq: Square): CardTarget {
    switch (need.kind) {
      case 'ownPiece':           return { ownPieceSquare: sq };
      case 'oppPiece':           return { oppPieceSquare: sq };
      case 'square':             return { square: sq };
      case 'resurrectionSquare': return { square: sq };
      case 'pawn':               return { ownPieceSquare: sq };
      default:                   return {};
    }
  }

  private twoStepTarget(need: TargetNeed, first: Square, second: Square): CardTarget {
    switch (need.kind) {
      case 'twoOwnPieces': return { ownPieceSquare: first, secondOwnPieceSquare: second };
      case 'teleport':     return { ownPieceSquare: first, square: second };
      case 'retreat':      return { ownPieceSquare: first, square: second };
      case 'pawnRetreat':  return { ownPieceSquare: first, square: second };
      case 'sidestep':     return { ownPieceSquare: first, square: second };
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

    // Post-phase await flag: true only when the HUMAN just moved (turnOwner
    // is the human) AND we're in 'post' AND they have at least one
    // post-eligible card in hand. The UI uses this to decide whether to
    // render the "end turn" button.
    const humanHand = this.deck.getHand(this.cfg.humanColor);
    const humanHasPostCard = humanHand.some((c) => getCardPhase(c.definition) === 'post');
    const postPhaseAwaitingHuman =
      !this.state.result &&
      this.turnPhase === 'post' &&
      this.turnOwner === this.cfg.humanColor &&
      humanHasPostCard;

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
      pilot: this.pilot
        ? {
            name: this.pilot.opening.name,
            nextIdx: this.pilot.nextIdx,
            total: this.pilot.opening.moves.length,
            nextLabel: this.pilot.nextIdx < this.pilot.opening.moves.length
              ? this.pilot.opening.moves[this.pilot.nextIdx].label
              : null,
          }
        : null,
      pilotProposal: this.pilotProposal?.proposal ?? null,
      pilotPickerAvailable: this.canOfferPilot(),
      turnOwner: this.turnOwner,
      turnPhase: this.turnPhase,
      postPhaseAwaitingHuman,
    };
  }

  /** Force-emit the current view-model (use after external state, e.g. UI
   * preferences, changes — does not mutate game state). */
  requestRender(): void {
    this.emit();
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
  if (def.name === 'Pawn Retreat') return { kind: 'pawnRetreat' };
  if (def.name === 'Sidestep') return { kind: 'sidestep' };
  // Resurrection's targetType is "square" in the card data, but the effect
  // also requires the square to be in our back 2 ranks. Use a specialized
  // need so the targeting UI doesn't highlight illegal squares.
  if (def.name === 'Resurrection') return { kind: 'resurrectionSquare' };

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

/**
 * The CardEffectResult.logEntry strings start with "<CardName>: ..." for
 * readability in the move log. For banners we already show the card name in
 * the prefix, so strip the redundant "<CardName>: " from the detail.
 */
function stripCardPrefix(logEntry: string, cardName: string): string {
  const prefix = `${cardName}: `;
  return logEntry.startsWith(prefix) ? logEntry.slice(prefix.length) : logEntry;
}

function microPause(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
