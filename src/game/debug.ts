// src/game/debug.ts
//
// Bug-report utilities. Two responsibilities:
//
//   1. validateState() — runs invariant checks on a SuperChessState. Catches
//      the *kinds* of bugs that have already bitten us (e.g. the Pawn Storm
//      cascade that put pawns on impossible ranks) plus standard chess
//      invariants. Returns a structured result so the UI can render it.
//
//   2. buildBugReport() — produces a self-contained, JSON-serializable
//      snapshot suitable for pasting into a bug report. Includes FEN, both
//      hands by card name, recent history, super-state with squares
//      rendered as algebraic, and the user's session debug log.
//
// Both functions are PURE — no DOM, no globals, fully unit-testable.

import type { SuperChessState, SuperState, GameEvent } from './types.ts';
import type { Square, PieceColor, PieceStr } from '../engine/types.ts';
import { toFEN } from '../engine/fen.ts';
import { pieceColor, pieceType, findKing } from '../engine/index.ts';

// ─── validation ────────────────────────────────────────────────────────────

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: ValidationSeverity;
  /** Short tag for grouping (e.g. "board", "hand", "superState"). */
  tag: string;
  message: string;
  /** Optional human-readable square reference, e.g. "e4". */
  square?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

const VALID_PIECES = new Set<PieceStr>([
  'wP', 'wN', 'wB', 'wR', 'wQ', 'wK',
  'bP', 'bN', 'bB', 'bR', 'bQ', 'bK',
]);

export function validateState(state: SuperChessState): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const push = (
    severity: ValidationSeverity,
    tag: string,
    message: string,
    sq?: Square,
  ): void => {
    const issue: ValidationIssue = { severity, tag, message };
    if (sq !== undefined) issue.square = sqToAlg(sq);
    (severity === 'error' ? errors : warnings).push(issue);
  };

  // --- board structure ---
  const board = state.chess.board;
  if (board.length !== 64) {
    push('error', 'board', `expected 64 squares, got ${board.length}`);
  }
  let wKings = 0;
  let bKings = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (p === null) continue;
    if (typeof p !== 'string' || !VALID_PIECES.has(p)) {
      push('error', 'board', `invalid piece "${String(p)}"`, sq);
      continue;
    }
    if (pieceType(p) === 'K') {
      if (pieceColor(p) === 'w') wKings++;
      else bKings++;
    }
    // Pawns must never be on the back ranks (they should have promoted).
    if (pieceType(p) === 'P') {
      const row = sq >> 3;
      if (row === 0 || row === 7) {
        push('error', 'board', `${p} on back rank — should have promoted`, sq);
      }
    }
  }
  if (wKings !== 1) push('error', 'board', `white must have exactly 1 king (has ${wKings})`);
  if (bKings !== 1) push('error', 'board', `black must have exactly 1 king (has ${bKings})`);

  // --- turn ---
  if (state.chess.turn !== 'w' && state.chess.turn !== 'b') {
    push('error', 'turn', `turn must be 'w' or 'b', got ${state.chess.turn}`);
  }

  // --- en passant ---
  const ep = state.chess.enPassantSquare;
  if (ep !== null) {
    if (ep < 0 || ep >= 64) {
      push('error', 'enPassant', `en passant square out of bounds: ${ep}`);
    } else {
      const row = ep >> 3;
      if (row !== 2 && row !== 5) {
        push('error', 'enPassant', `en passant square must be on rank 3 or 6`, ep);
      }
      if (board[ep] !== null) {
        push('warning', 'enPassant', `en passant target square is occupied`, ep);
      }
    }
  }

  // --- castling rights ---
  const cr = state.chess.castlingRights;
  if (cr.wKingside || cr.wQueenside) {
    if (board[sqFromAlg('e1')] !== 'wK') {
      push('warning', 'castling', `white has castling rights but king isn't on e1`);
    }
  }
  if (cr.bKingside || cr.bQueenside) {
    if (board[sqFromAlg('e8')] !== 'bK') {
      push('warning', 'castling', `black has castling rights but king isn't on e8`);
    }
  }
  if (cr.wKingside && board[sqFromAlg('h1')] !== 'wR') {
    push('warning', 'castling', `white kingside castling but no rook on h1`);
  }
  if (cr.wQueenside && board[sqFromAlg('a1')] !== 'wR') {
    push('warning', 'castling', `white queenside castling but no rook on a1`);
  }
  if (cr.bKingside && board[sqFromAlg('h8')] !== 'bR') {
    push('warning', 'castling', `black kingside castling but no rook on h8`);
  }
  if (cr.bQueenside && board[sqFromAlg('a8')] !== 'bR') {
    push('warning', 'castling', `black queenside castling but no rook on a8`);
  }

  // --- hands ---
  const max = state.deck.maxHandSize ?? 5;
  const hands: Array<{ color: PieceColor; size: number }> = [
    { color: 'w', size: state.deck.hand.white.length },
    { color: 'b', size: state.deck.hand.black.length },
  ];
  for (const h of hands) {
    if (h.size > max) {
      push('error', 'hand', `${h.color} hand size ${h.size} exceeds max ${max}`);
    }
    if (h.size < 0) {
      push('error', 'hand', `${h.color} hand size is negative: ${h.size}`);
    }
  }
  // Each card in hand must have a real definition.
  for (const color of ['w', 'b'] as const) {
    const hand = color === 'w' ? state.deck.hand.white : state.deck.hand.black;
    for (const c of hand) {
      if (!c.definition || !c.definition.name) {
        push('error', 'hand', `${color} hand contains card without a definition`);
      }
    }
  }

  // --- super-state ---
  validateSuperState(state.superState, board, push);

  // --- history monotonicity ---
  validateHistory(state.history, push);

  return { ok: errors.length === 0, errors, warnings };
}

function validateSuperState(
  ss: SuperState,
  board: (PieceStr | null)[],
  push: (s: ValidationSeverity, tag: string, msg: string, sq?: Square) => void,
): void {
  const checkSq = (label: string, sq: Square): boolean => {
    if (sq < 0 || sq >= 64) {
      push('error', 'superState', `${label} references square ${sq} out of bounds`);
      return false;
    }
    return true;
  };

  for (const [sq, turns] of ss.frozenSquares) {
    if (!checkSq('frozen', sq)) continue;
    if (turns <= 0) {
      push('warning', 'superState', `frozen square has non-positive timer ${turns}`, sq);
    }
    if (board[sq] === null) {
      push('warning', 'superState', `frozen square is empty (piece moved off?)`, sq);
    }
  }

  for (const [sq, color] of ss.shieldedSquares) {
    if (!checkSq('shield', sq)) continue;
    if (color !== 'w' && color !== 'b') {
      push('error', 'superState', `shield at square has invalid color "${color}"`, sq);
    }
    const p = board[sq];
    if (p === null) {
      push('warning', 'superState', `shielded square is empty`, sq);
    } else if (pieceColor(p) !== color) {
      push('warning', 'superState', `shield color ${color} doesn't match piece ${p}`, sq);
    }
    const turns = ss.shieldTurns.get(sq);
    if (turns === undefined) {
      push('warning', 'superState', `shielded square has no turn counter`, sq);
    } else if (turns <= 0) {
      push('warning', 'superState', `shielded square has non-positive timer ${turns}`, sq);
    }
  }

  for (const [sq, color] of ss.foulSquares) {
    if (!checkSq('foul', sq)) continue;
    if (color !== 'w' && color !== 'b') {
      push('error', 'superState', `foul square has invalid color "${color}"`, sq);
    }
  }

  for (const [color, type] of ss.mustMoveType) {
    if (color !== 'w' && color !== 'b') {
      push('error', 'superState', `mustMoveType has invalid color "${color}"`);
    }
    if (!['P','N','B','R','Q','K'].includes(type)) {
      push('error', 'superState', `mustMoveType has invalid type "${type}"`);
    }
  }

  if (ss.knightsPathSquare !== null) checkSq('knightsPath', ss.knightsPathSquare);
  if (ss.ghostStepSquare !== null) checkSq('ghostStep', ss.ghostStepSquare);
  if (ss.fortifiedPawnSquare !== null) checkSq('fortifiedPawn', ss.fortifiedPawnSquare);

  if (ss.turnsSinceCapture < 0) {
    push('error', 'superState', `turnsSinceCapture negative: ${ss.turnsSinceCapture}`);
  }

  // capturedByColor[X] should only contain pieces of the OPPOSITE color —
  // you can't capture your own pieces in legal chess. If X has an X-piece in
  // their captured list, the engine attributed a move to the wrong side
  // (a real bug we hit when undoMove failed to restore state.turn after a
  // Trade-induced black pawn promotion search).
  for (const color of ['w', 'b'] as const) {
    const captured = ss.capturedByColor.get(color) ?? [];
    for (const p of captured) {
      if (pieceColor(p) === color) {
        push('error', 'superState',
          `${color} has ${p} in their captured list — friendly-fire capture impossible`);
      }
    }
  }
}

function validateHistory(
  history: GameEvent[],
  push: (s: ValidationSeverity, tag: string, msg: string) => void,
): void {
  let lastTurn = 0;
  for (let i = 0; i < history.length; i++) {
    const ev = history[i];
    if (typeof ev.turn !== 'number') {
      push('error', 'history', `event ${i} has non-numeric turn`);
      continue;
    }
    if (ev.turn < lastTurn) {
      push('warning', 'history', `event ${i} turn ${ev.turn} < previous ${lastTurn}`);
    }
    lastTurn = ev.turn;
  }
}

// ─── bug report snapshot ───────────────────────────────────────────────────

export interface DebugLogEntry {
  /** Monotonic ms from session start. */
  ms: number;
  /** ISO timestamp at time of log. */
  t: string;
  kind: 'info' | 'warn' | 'error';
  /** Short tag e.g. "bot", "card", "human". */
  tag: string;
  message: string;
  /** Optional structured payload. Will be JSON-stringified. */
  data?: unknown;
}

export interface BugReportContext {
  /** Free-form info about the play config (humanColor, bot difficulty, etc.) */
  config: Record<string, unknown>;
  /** Optional ring-buffer of recent debug events. */
  debugLog?: DebugLogEntry[];
  /** Optional user-typed description of the bug. */
  userNote?: string;
}

export interface BugReport {
  // Top-level metadata so you can identify the report at a glance.
  version: 1;
  capturedAt: string;
  userAgent: string;
  viewport?: { w: number; h: number };
  url?: string;
  userNote: string;

  // Game state — enough to reproduce.
  fen: string;
  turn: PieceColor;
  fullMoveNumber: number;
  halfMoveClock: number;
  hands: {
    white: string[];   // card names in order
    black: string[];
  };
  /** Compact super-state with squares as algebraic notation. */
  superState: {
    frozen: Array<{ sq: string; turnsRemaining: number }>;
    shielded: Array<{ sq: string; color: PieceColor; turnsRemaining: number }>;
    foul: Array<{ sq: string; forbiddenColor: PieceColor }>;
    mustMoveType: Array<{ color: PieceColor; type: string }>;
    knightsPathSquare: string | null;
    ghostStepSquare: string | null;
    fortifiedPawnSquare: string | null;
    extraMoveRemaining: PieceColor | null;
    fogActive: boolean;
    timeWarpUsed: { w: boolean; b: boolean };
    turnsSinceCapture: number;
    capturedByColor: { w: string[]; b: string[] };
    lastMove: string | null;       // algebraic
  };
  // The last N events from history (full event list could get huge).
  recentEvents: Array<{
    turn: number;
    type: GameEvent['type'];
    summary: string;
  }>;
  result: SuperChessState['result'];

  // Sanity checks at capture time.
  validation: ValidationResult;

  // The session debug log (bot decisions, errors, etc.)
  debugLog: DebugLogEntry[];

  config: Record<string, unknown>;
}

export function buildBugReport(
  state: SuperChessState,
  ctx: BugReportContext,
): BugReport {
  const validation = validateState(state);
  const ss = state.superState;

  const fen = toFEN(state.chess);

  const hands = {
    white: state.deck.hand.white.map((c) => c.definition.name),
    black: state.deck.hand.black.map((c) => c.definition.name),
  };

  const superState: BugReport['superState'] = {
    frozen: [...ss.frozenSquares].map(([sq, turnsRemaining]) => ({
      sq: sqToAlg(sq), turnsRemaining,
    })),
    shielded: [...ss.shieldedSquares].map(([sq, color]) => ({
      sq: sqToAlg(sq), color, turnsRemaining: ss.shieldTurns.get(sq) ?? 0,
    })),
    foul: [...ss.foulSquares].map(([sq, forbiddenColor]) => ({
      sq: sqToAlg(sq), forbiddenColor,
    })),
    mustMoveType: [...ss.mustMoveType].map(([color, type]) => ({ color, type })),
    knightsPathSquare: ss.knightsPathSquare !== null ? sqToAlg(ss.knightsPathSquare) : null,
    ghostStepSquare: ss.ghostStepSquare !== null ? sqToAlg(ss.ghostStepSquare) : null,
    fortifiedPawnSquare: ss.fortifiedPawnSquare !== null ? sqToAlg(ss.fortifiedPawnSquare) : null,
    extraMoveRemaining: ss.extraMoveRemaining,
    fogActive: ss.fogActive,
    timeWarpUsed: {
      w: ss.timeWarpUsed.get('w') ?? false,
      b: ss.timeWarpUsed.get('b') ?? false,
    },
    turnsSinceCapture: ss.turnsSinceCapture,
    capturedByColor: {
      w: ss.capturedByColor.get('w') ?? [],
      b: ss.capturedByColor.get('b') ?? [],
    },
    lastMove: ss.lastMove?.algebraic ?? null,
  };

  const recentEvents = state.history.slice(-40).map((ev) => ({
    turn: ev.turn,
    type: ev.type,
    summary: summarizeEvent(ev),
  }));

  // Self-validation: if the king is somewhere unexpected, mention that.
  // findKing throws if there's no king, so guard:
  try {
    const wK = findKing(state.chess.board, 'w');
    const bK = findKing(state.chess.board, 'b');
    if (wK < 0 || wK >= 64) {
      validation.errors.push({ severity: 'error', tag: 'board', message: 'white king index out of range' });
    }
    if (bK < 0 || bK >= 64) {
      validation.errors.push({ severity: 'error', tag: 'board', message: 'black king index out of range' });
    }
  } catch (err) {
    validation.errors.push({
      severity: 'error', tag: 'board',
      message: `findKing threw: ${(err as Error).message}`,
    });
    validation.ok = false;
  }

  const report: BugReport = {
    version: 1,
    capturedAt: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    viewport:
      typeof window !== 'undefined'
        ? { w: window.innerWidth, h: window.innerHeight }
        : undefined,
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    userNote: ctx.userNote ?? '',
    fen,
    turn: state.chess.turn,
    fullMoveNumber: state.chess.fullMoveNumber,
    halfMoveClock: state.chess.halfMoveClock,
    hands,
    superState,
    recentEvents,
    result: state.result,
    validation,
    debugLog: ctx.debugLog ?? [],
    config: ctx.config,
  };

  return report;
}

function summarizeEvent(ev: GameEvent): string {
  switch (ev.type) {
    case 'move':
      return `${ev.data.color} ${ev.data.algebraic}`;
    case 'cardDraw':
      return `${ev.data.color} drew ${ev.data.card.definition.name} (${ev.data.reason})`;
    case 'cardPlay':
      return `${ev.data.playedBy} played ${ev.data.cardName}` +
        (ev.data.target ? ` target=${ev.data.target}` : '');
    case 'cardDiscard':
      return `${ev.data.color} discarded ${ev.data.card.definition.name}`;
    case 'gameOver':
      return `game over: ${ev.data.reason}` +
        (ev.data.winner ? ` (${ev.data.winner} wins)` : ' (draw)');
  }
}

// ─── square helpers ────────────────────────────────────────────────────────

function sqToAlg(sq: Square): string {
  const file = sq & 7;
  const rank = 8 - (sq >> 3);
  return String.fromCharCode(97 + file) + String(rank);
}

function sqFromAlg(alg: string): Square {
  const file = alg.charCodeAt(0) - 97;
  const rank = parseInt(alg[1], 10);
  return (8 - rank) * 8 + file;
}
