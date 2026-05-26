// src/ai/claudeCardAI.ts
// Claude API card AI. Falls back to HeuristicCardAI on error/timeout.
import type { PieceColor } from '../engine/types.ts';
import type { SuperChessState } from '../game/types.ts';
import type { CardInstance } from '../cards/types.ts';
import type { CardAI, CardAIDecision } from './types.ts';
import { toFEN } from '../engine/fen.ts';
import { totalMaterial, algebraicToSquare } from '../engine/index.ts';
import { HeuristicCardAI } from './heuristicCardAI.ts';

interface ClaudeResponse {
  shouldPlay: boolean;
  cardName: string | null;
  targetDescription: string | null;
  targetSquare: string | null;
  targetPieceType: string | null;
  reasoning: string;
}

export class ClaudeCardAI implements CardAI {
  name = 'Claude (claude-sonnet-4-20250514)';
  private apiKey: string;
  private fallback = new HeuristicCardAI();
  private lastCallTime = 0;
  private minIntervalMs = 500; // rate limiting

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private buildPrompt(state: SuperChessState, color: PieceColor, hand: CardInstance[]): string {
    const opp: PieceColor = color === 'w' ? 'b' : 'w';
    const fen = toFEN(state.chess);
    const myMat = totalMaterial(state.chess.board, color);
    const oppMat = totalMaterial(state.chess.board, opp);
    const delta = (myMat - oppMat) / 100;
    const moveNum = state.chess.fullMoveNumber;
    const recentMoves = state.history
      .filter((e) => e.type === 'move')
      .slice(-5)
      .map((e) => {
        const m = (e as { type: 'move'; data: { algebraic: string; color: PieceColor } }).data;
        return `${m.color}: ${m.algebraic}`;
      })
      .join('\n');

    const handText = hand
      .map((c) => `[${c.definition.name}] (${c.definition.rarity})\nRule: ${c.definition.rulesText}`)
      .join('\n\n');

    return `=== CURRENT POSITION ===
FEN: ${fen}
Turn: ${color} (you are ${color})
Full move: ${moveNum}

=== MATERIAL ===
Your material: ${(myMat / 100).toFixed(1)} points
Opponent material: ${(oppMat / 100).toFixed(1)} points
Difference: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} (positive = you're ahead)

=== RECENT MOVES (last 5) ===
${recentMoves || '(none yet)'}

=== YOUR HAND ===
${handText}

=== DECISION ===
Should you play a card? If yes, which one maximizes your long-term winning chances?

Respond with ONLY this JSON:
{
  "shouldPlay": true | false,
  "cardName": "exact card name or null",
  "targetDescription": "description of target or null",
  "targetSquare": "algebraic notation or null",
  "targetPieceType": "P/N/B/R/Q or null",
  "reasoning": "one sentence explaining the decision"
}`;
  }

  async decide(
    state: SuperChessState,
    color: PieceColor,
    hand: CardInstance[],
  ): Promise<CardAIDecision> {
    if (hand.length === 0) return { shouldPlay: false };

    // Rate limiting
    const now = Date.now();
    if (now - this.lastCallTime < this.minIntervalMs) {
      return this.fallback.decide(state, color, hand);
    }
    this.lastCallTime = now;

    try {
      const prompt = this.buildPrompt(state, color, hand);
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 256,
          system:
            'You are a Super Chess card AI. Respond ONLY with a JSON object matching the requested schema. No other text.',
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) throw new Error(`Claude API error: ${response.status}`);

      const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
      const text = data.content?.[0]?.text ?? '{}';
      const parsed: ClaudeResponse = JSON.parse(text);

      if (!parsed.shouldPlay || !parsed.cardName) return { shouldPlay: false };

      const card = hand.find((c) => c.definition.name === parsed.cardName);
      if (!card) return { shouldPlay: false };

      const target: { square?: number; pieceType?: string } = {};
      if (parsed.targetSquare) {
        try { target.square = algebraicToSquare(parsed.targetSquare); } catch { /* ignore */ }
      }
      if (parsed.targetPieceType) target.pieceType = parsed.targetPieceType;

      return {
        shouldPlay: true,
        card,
        target,
        reasoning: parsed.reasoning,
      };
    } catch (err) {
      console.warn('[ClaudeCardAI] Error, falling back to heuristic:', err);
      return this.fallback.decide(state, color, hand);
    }
  }
}
