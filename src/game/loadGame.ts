// src/game/loadGame.ts
//
// Pure parser: takes the textual JSON the user pastes (typically a copy
// of the bug-report payload from buildBugReport, but we accept a few
// shapes) and produces a hydrated SuperChessState + Deck pair the
// PlayController can boot from.
//
// Why this exists: when someone hits a bug or wants to test from a
// specific position, the bug-report modal already exports a complete
// snapshot — FEN + hands by name + super-state with algebraic squares.
// This module reverses that, so a tester can paste-and-replay.
//
// Scope decisions (intentional, not omissions):
//   - We read card names back through the FULL CARD_DEFINITIONS table,
//     not the user's currently-configured pool, so a loaded hand can't
//     mention a card their pool happens to have toggled off. (The
//     bug-report config doesn't carry enabledCategories anyway.)
//   - We don't reconstruct the historical draw/discard piles — the
//     bug report doesn't carry them. The hydrated deck is built fresh
//     from CARD_DEFINITIONS and shuffled; the loaded hand cards are
//     plucked off the top before play resumes. Good enough for
//     reproducing a position; not a perfect replay tool.
//   - history is intentionally empty after load. The recentEvents in
//     the bug report are summaries, not real GameEvents.
//
// Consumers: src/ui/play/loadGameModal.ts (the paste-and-load UI) and
// the tests in tests/game/loadGame.test.ts.

import type { Square, PieceColor } from '../engine/types.ts';
import type { CardInstance } from '../cards/types.ts';
import type { SuperChessState } from './types.ts';
import { parseFEN } from '../engine/fen.ts';
import { createSuperState } from './types.ts';
import { Deck } from '../cards/deck.ts';
import { CARD_DEFINITIONS } from '../cards/definitions.ts';
import { validateState } from './debug.ts';

/** Whatever the modal returns when a paste validates. The PlayController
 * accepts (state, deck) directly; configHints are surfaced so the UI
 * can default the new-game form to whatever the snapshot was captured
 * with (e.g. humanColor, botDepth) without forcing them. */
export interface LoadedGame {
  state: SuperChessState;
  deck: Deck;
  /** Best-effort: prefilled fields parsed out of the snapshot's
   * `config` block. Empty object when the snapshot didn't carry one. */
  configHints: {
    humanColor?: PieceColor;
    botLabel?: string;
    botDepth?: number;
    openOpponentHand?: boolean;
    maxHandSize?: number;
  };
}

export interface LoadResultOk {
  ok: true;
  loaded: LoadedGame;
  /** Non-fatal hints (unknown card names skipped, etc.). The modal
   * shows these so the tester knows what was dropped, but they don't
   * block the load. */
  warnings: string[];
}

export interface LoadResultErr {
  ok: false;
  errors: string[];
  warnings: string[];
}

export type LoadResult = LoadResultOk | LoadResultErr;

// ─── public API ────────────────────────────────────────────────────────────

/** Parse a pasted JSON payload into a runnable game state. Returns a
 * structured result (rather than throwing) so the modal can render
 * specific errors next to the textarea. */
export function parseLoadGameInput(rawText: string): LoadResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    return { ok: false, errors: ['paste is empty'], warnings };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    return {
      ok: false,
      errors: [`not valid JSON: ${(err as Error).message}`],
      warnings,
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, errors: ['top-level value must be a JSON object'], warnings };
  }
  const obj = parsed as Record<string, unknown>;

  // FEN is mandatory — it tells us where the pieces are.
  const fenRaw = obj.fen;
  if (typeof fenRaw !== 'string' || fenRaw.length === 0) {
    return { ok: false, errors: ['missing required field: "fen" (string)'], warnings };
  }

  let chess;
  try {
    chess = parseFEN(fenRaw);
  } catch (err) {
    return {
      ok: false,
      errors: [`could not parse FEN: ${(err as Error).message}`],
      warnings,
    };
  }

  // Hands — optional, but if present we honor them. Bug-report shape:
  //   hands: { white: string[], black: string[] }
  // where strings are card names.
  const handsResult = parseHands(obj.hands, warnings);
  if (!handsResult.ok) {
    return { ok: false, errors: handsResult.errors, warnings };
  }

  // Super-state — optional. Bug-report shape stores squares as
  // algebraic (e.g. "e4"). Anything we can't translate is dropped with
  // a warning.
  const superState = createSuperState();
  parseSuperStateInPlace(obj.superState, superState, warnings);

  // Hand-size hint from config (or from a top-level maxHandSize).
  const configHints = parseConfigHints(obj.config);
  const explicitMaxHand =
    typeof obj.maxHandSize === 'number' && obj.maxHandSize >= 1 && obj.maxHandSize <= 12
      ? obj.maxHandSize
      : undefined;
  const maxHandSize = explicitMaxHand ?? configHints.maxHandSize;

  // Build the deck. We use the FULL card pool so any card name the
  // hand mentions can be sourced; whatever's left becomes the draw
  // pile after we pluck the loaded hands.
  const deck = new Deck(CARD_DEFINITIONS, { maxHandSize: maxHandSize ?? undefined });
  deck.shuffle();
  const drainResult = drainHandsFromDeck(deck, handsResult.hands, warnings);
  if (!drainResult.ok) {
    return { ok: false, errors: drainResult.errors, warnings };
  }

  // Half-move and full-move clocks: prefer FEN values, but allow
  // explicit overrides from the snapshot if the FEN didn't carry them.
  if (typeof obj.halfMoveClock === 'number' && Number.isFinite(obj.halfMoveClock)) {
    chess.halfMoveClock = obj.halfMoveClock;
  }
  if (typeof obj.fullMoveNumber === 'number' && Number.isFinite(obj.fullMoveNumber)) {
    chess.fullMoveNumber = obj.fullMoveNumber;
  }

  const state: SuperChessState = {
    chess,
    deck: deck.getState(),
    superState,
    history: [],
    result: parseResult(obj.result),
    snapshots: [],
  };

  // Final sanity check — refuse to load a state the engine thinks is
  // structurally broken. The user can rephrase their JSON; it's
  // better than crashing later mid-turn.
  const validation = validateState(state);
  if (!validation.ok) {
    return {
      ok: false,
      errors: [
        'loaded state failed validation:',
        ...validation.errors.map((e) => `\u2022 [${e.tag}] ${e.message}${e.square ? ` @ ${e.square}` : ''}`),
      ],
      warnings: [
        ...warnings,
        ...validation.warnings.map((w) => `[${w.tag}] ${w.message}${w.square ? ` @ ${w.square}` : ''}`),
      ],
    };
  }
  for (const w of validation.warnings) {
    warnings.push(`[${w.tag}] ${w.message}${w.square ? ` @ ${w.square}` : ''}`);
  }

  return {
    ok: true,
    loaded: { state, deck, configHints },
    warnings,
  };
}

// ─── helpers ───────────────────────────────────────────────────────────────

interface ParsedHands {
  white: CardInstance[];
  black: CardInstance[];
}

function parseHands(
  raw: unknown,
  warnings: string[],
): { ok: true; hands: ParsedHands } | { ok: false; errors: string[] } {
  if (raw === undefined || raw === null) {
    // Hands are optional — empty hands is a valid degenerate load.
    return { ok: true, hands: { white: [], black: [] } };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['"hands" must be an object with white/black arrays'] };
  }
  const handsObj = raw as Record<string, unknown>;
  const errors: string[] = [];

  const parseSide = (side: 'white' | 'black'): CardInstance[] => {
    const list = handsObj[side];
    if (list === undefined) return [];
    if (!Array.isArray(list)) {
      errors.push(`"hands.${side}" must be an array of card names`);
      return [];
    }
    const out: CardInstance[] = [];
    for (let i = 0; i < list.length; i++) {
      const name = list[i];
      if (typeof name !== 'string') {
        warnings.push(`hands.${side}[${i}] is not a string — skipped`);
        continue;
      }
      const def = CARD_DEFINITIONS.find((c) => c.name === name);
      if (!def) {
        warnings.push(`hands.${side}[${i}] = "${name}" is not a known card — skipped`);
        continue;
      }
      out.push({
        id: `loaded_${side}_${i}_${name.replace(/\s+/g, '_')}`,
        definition: def,
      });
    }
    return out;
  };

  const hands = { white: parseSide('white'), black: parseSide('black') };
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, hands };
}

/** Pull the loaded hand cards out of the freshly-shuffled deck so they
 * end up in the right hands and don't also appear in the draw pile.
 * If the deck doesn't have a copy of a named card (e.g. user disabled
 * it via copies-overrides on a future feature) we synthesize one and
 * push it to the hand directly — load-time is not the place to police
 * deck composition.
 */
function drainHandsFromDeck(
  deck: Deck,
  hands: ParsedHands,
  warnings: string[],
): { ok: true } | { ok: false; errors: string[] } {
  // We need to remove specific card instances by NAME from the draw
  // pile and re-attach them to the hand. The Deck doesn't expose its
  // internals directly, but we can mutate the internal array via a
  // documented escape hatch — this module is the deck's only loader,
  // so we accept the slight coupling rather than widen the public API.
  const internal = deck as unknown as {
    drawPile: CardInstance[];
    hands: { white: CardInstance[]; black: CardInstance[] };
  };

  const takeByName = (name: string): CardInstance | null => {
    const idx = internal.drawPile.findIndex((c) => c.definition.name === name);
    if (idx === -1) return null;
    const [card] = internal.drawPile.splice(idx, 1);
    return card;
  };

  for (const card of hands.white) {
    const taken = takeByName(card.definition.name);
    internal.hands.white.push(taken ?? card);
    if (!taken) {
      warnings.push(`white hand: synthesized "${card.definition.name}" (deck had no copy left)`);
    }
  }
  for (const card of hands.black) {
    const taken = takeByName(card.definition.name);
    internal.hands.black.push(taken ?? card);
    if (!taken) {
      warnings.push(`black hand: synthesized "${card.definition.name}" (deck had no copy left)`);
    }
  }

  // Hand-size violations are reported as errors — load shouldn't
  // produce a state we'd refuse to keep mid-game. Validate against the
  // deck's effective max.
  const errs: string[] = [];
  if (internal.hands.white.length > deck.maxHandSize) {
    errs.push(`white hand has ${internal.hands.white.length} cards but maxHandSize is ${deck.maxHandSize}`);
  }
  if (internal.hands.black.length > deck.maxHandSize) {
    errs.push(`black hand has ${internal.hands.black.length} cards but maxHandSize is ${deck.maxHandSize}`);
  }
  if (errs.length > 0) return { ok: false, errors: errs };
  return { ok: true };
}

/** Mutate `dst` in place from the bug-report's superState shape. We
 * silently skip squares we can't translate rather than fail the whole
 * load — superState is augmenting, not load-bearing. */
function parseSuperStateInPlace(raw: unknown, dst: ReturnType<typeof createSuperState>, warnings: string[]): void {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
  const ss = raw as Record<string, unknown>;

  const algToSq = (alg: unknown): Square | null => {
    if (typeof alg !== 'string' || alg.length !== 2) return null;
    const file = alg.charCodeAt(0) - 97;
    const rank = parseInt(alg[1], 10);
    if (file < 0 || file > 7 || isNaN(rank) || rank < 1 || rank > 8) return null;
    return (8 - rank) * 8 + file;
  };

  const arr = (k: string): unknown[] => (Array.isArray(ss[k]) ? (ss[k] as unknown[]) : []);

  for (const entry of arr('frozen')) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const sq = algToSq(e.sq);
    const t = typeof e.turnsRemaining === 'number' ? e.turnsRemaining : 0;
    if (sq !== null && t > 0) dst.frozenSquares.set(sq, t);
    else if (sq === null) warnings.push(`superState.frozen entry has unrecognizable square "${String(e.sq)}"`);
  }

  for (const entry of arr('shielded')) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const sq = algToSq(e.sq);
    const color = e.color === 'w' || e.color === 'b' ? e.color : null;
    const t = typeof e.turnsRemaining === 'number' ? e.turnsRemaining : 0;
    if (sq !== null && color && t > 0) {
      dst.shieldedSquares.set(sq, color);
      dst.shieldTurns.set(sq, t);
    }
  }

  for (const entry of arr('foul')) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const sq = algToSq(e.sq);
    const color = e.forbiddenColor === 'w' || e.forbiddenColor === 'b' ? e.forbiddenColor : null;
    const t = typeof e.turnsRemaining === 'number' ? e.turnsRemaining : 0;
    if (sq !== null && color && t > 0) {
      dst.foulSquares.set(sq, color);
      dst.foulTurns.set(sq, t);
    }
  }

  for (const entry of arr('mustMoveType')) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const color = e.color === 'w' || e.color === 'b' ? e.color : null;
    const type = e.type as unknown;
    const t = typeof e.turnsRemaining === 'number' ? e.turnsRemaining : 0;
    if (color && typeof type === 'string' && ['P', 'N', 'B', 'R', 'Q', 'K'].includes(type) && t > 0) {
      dst.mustMoveType.set(color, type as 'P' | 'N' | 'B' | 'R' | 'Q' | 'K');
      dst.mustMoveTurns.set(color, t);
    }
  }

  if (typeof ss.knightsPathSquare === 'string') {
    const sq = algToSq(ss.knightsPathSquare);
    if (sq !== null) dst.knightsPathSquare = sq;
  }
  if (typeof ss.ghostStepSquare === 'string') {
    const sq = algToSq(ss.ghostStepSquare);
    if (sq !== null) dst.ghostStepSquare = sq;
  }
  if (typeof ss.fortifiedPawnSquare === 'string') {
    const sq = algToSq(ss.fortifiedPawnSquare);
    if (sq !== null) dst.fortifiedPawnSquare = sq;
  }
  if (ss.extraMoveRemaining === 'w' || ss.extraMoveRemaining === 'b') {
    dst.extraMoveRemaining = ss.extraMoveRemaining;
  }
  if (ss.fogActive === true) dst.fogActive = true;
  if (ss.timeWarpUsed && typeof ss.timeWarpUsed === 'object' && !Array.isArray(ss.timeWarpUsed)) {
    const tw = ss.timeWarpUsed as Record<string, unknown>;
    if (tw.w === true) dst.timeWarpUsed.set('w', true);
    if (tw.b === true) dst.timeWarpUsed.set('b', true);
  }
  if (typeof ss.turnsSinceCapture === 'number' && ss.turnsSinceCapture >= 0) {
    dst.turnsSinceCapture = ss.turnsSinceCapture;
  }

  // capturedByColor is { w: string[], b: string[] } — we trust the
  // bug-report shape but defensively ignore anything that isn't a
  // 2-character piece string.
  const cap = ss.capturedByColor;
  if (cap && typeof cap === 'object' && !Array.isArray(cap)) {
    const capObj = cap as Record<string, unknown>;
    for (const color of ['w', 'b'] as const) {
      const list = capObj[color];
      if (Array.isArray(list)) {
        const valid = list.filter(
          (p): p is string => typeof p === 'string' && p.length === 2,
        ) as `${'w' | 'b'}${'P' | 'N' | 'B' | 'R' | 'Q' | 'K'}`[];
        dst.capturedByColor.set(color, valid);
      }
    }
  }
}

function parseConfigHints(raw: unknown): LoadedGame['configHints'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const c = raw as Record<string, unknown>;
  const out: LoadedGame['configHints'] = {};
  if (c.humanColor === 'w' || c.humanColor === 'b') out.humanColor = c.humanColor;
  if (typeof c.botLabel === 'string') out.botLabel = c.botLabel;
  if (typeof c.botDepth === 'number' && c.botDepth >= 1 && c.botDepth <= 4) out.botDepth = c.botDepth;
  if (typeof c.openOpponentHand === 'boolean') out.openOpponentHand = c.openOpponentHand;
  if (typeof c.maxHandSize === 'number' && c.maxHandSize >= 1 && c.maxHandSize <= 12) {
    out.maxHandSize = c.maxHandSize;
  }
  return out;
}

function parseResult(raw: unknown): SuperChessState['result'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const winner: PieceColor | null = r.winner === 'w' || r.winner === 'b' ? r.winner : null;
  const valid: ReadonlyArray<NonNullable<SuperChessState['result']>['reason']> = [
    'checkmate', 'stalemate', '50-move', 'move-limit', 'resignation', 'repetition',
  ];
  const rawReason = r.reason;
  const reason = valid.find((v) => v === rawReason);
  if (!reason) return null;
  const totalMoves = typeof r.totalMoves === 'number' ? r.totalMoves : 0;
  return { winner, reason, totalMoves, cardsPlayed: [] };
}
