// src/game/types.ts
import type { ChessState, Square, PieceColor, PieceType, PieceStr, AnnotatedMove, Move } from '../engine/types.ts';
import type { DeckState, CardInstance } from '../cards/types.ts';
import type { CardRarity } from '../cards/types.ts';

export interface SuperState {
  // Turns counters are in PLIES (half-moves). Setting a counter to 2 means
  // "survives the setter's tick (counter → 1, effect active during the
  // OPPONENT's turn) and clears after the opponent's tick (counter → 0)".
  // Setting to 1 means "expires at the end of the setter's CURRENT ply" —
  // i.e. it dies before the opponent ever sees it. So 2 is the typical
  // value for cards that say "for the opponent's next turn".
  frozenSquares: Map<Square, number>;        // sq → turns remaining
  shieldedSquares: Map<Square, PieceColor>;  // sq → color who shielded
  shieldTurns: Map<Square, number>;          // sq → turns remaining on shield
  foulSquares: Map<Square, PieceColor>;      // sq → color FORBIDDEN from entering
  foulTurns: Map<Square, number>;            // sq → turns remaining on foul
  mustMoveType: Map<PieceColor, PieceType>;  // color → must move this type next turn
  mustMoveTurns: Map<PieceColor, number>;    // color → turns remaining on must-move constraint
  capturedByColor: Map<PieceColor, PieceStr[]>;
  lastMove: AnnotatedMove | null;
  turnsSinceCapture: number;

  // Card effect flags (expire after one use or one turn)
  knightsPathSquare: Square | null;
  ghostStepSquare: Square | null;
  fortifiedPawnSquare: Square | null;
  extraMoveRemaining: PieceColor | null;
  fogActive: boolean;
  timeWarpUsed: Map<PieceColor, boolean>;
}

export function createSuperState(): SuperState {
  return {
    frozenSquares: new Map(),
    shieldedSquares: new Map(),
    shieldTurns: new Map(),
    foulSquares: new Map(),
    foulTurns: new Map(),
    mustMoveType: new Map(),
    mustMoveTurns: new Map(),
    capturedByColor: new Map([['w', []], ['b', []]]),
    lastMove: null,
    turnsSinceCapture: 0,
    knightsPathSquare: null,
    ghostStepSquare: null,
    fortifiedPawnSquare: null,
    extraMoveRemaining: null,
    fogActive: false,
    timeWarpUsed: new Map([['w', false], ['b', false]]),
  };
}

export interface SuperChessState {
  chess: ChessState;
  deck: DeckState;
  superState: SuperState;
  history: GameEvent[];
  result: GameResult | null;
  snapshots: { chess: ChessState; superState: SuperState; deckState: DeckState }[]; // for Time Warp
}

export interface GameResult {
  winner: PieceColor | null;
  reason: 'checkmate' | 'stalemate' | '50-move' | 'move-limit' | 'resignation' | 'repetition';
  totalMoves: number;
  cardsPlayed: CardPlayRecord[];
}

export interface CardPlayRecord {
  cardName: string;
  playedBy: PieceColor;
  onTurn: number;
  target?: string;
  materialBefore: { w: number; b: number };
  materialAfter: { w: number; b: number };
}

export type GameEvent =
  | { type: 'move'; data: AnnotatedMove; turn: number; boardAfter?: ChessState }
  | { type: 'cardDraw'; data: { color: PieceColor; card: CardInstance; reason: 'capture' | 'startingHand' }; turn: number }
  | { type: 'cardPlay'; data: CardPlayRecord; turn: number }
  | { type: 'cardDiscard'; data: { color: PieceColor; card: CardInstance }; turn: number }
  | { type: 'gameOver'; data: GameResult; turn: number };

export interface CardTarget {
  square?: Square;
  ownPieceSquare?: Square;
  secondOwnPieceSquare?: Square; // for Swap
  oppPieceSquare?: Square;
  pieceType?: PieceType;
}

export interface TurnResult {
  move: AnnotatedMove;
  cardPlayed: CardPlayRecord | null;
  cardDrawn: CardInstance | null;
  stateAfter: SuperChessState;
}

// Aggregated stats types (also used by simulation)
export interface CardStats {
  cardName: string;
  rarity: CardRarity;
  timesDrawn: number;
  timesPlayed: number;
  timesHeld: number;
  utilizationRate: number;
  avgTurnPlayed: number;
  playedInWhiteWins: number;
  playedInBlackWins: number;
  playedInDraws: number;
  winCorrelation: number;
  avgMaterialSwingOnPlay: number;
  playedByWhite: number;
  playedByBlack: number;
}

export type { Move };
