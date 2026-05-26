// tests/simulation/stats.test.ts
import { describe, it, expect } from 'vitest';
import { StatsCollector } from '../../src/simulation/stats.ts';
import type { GameResult } from '../../src/game/types.ts';

function makeResult(winner: 'w' | 'b' | null, cardName?: string): GameResult {
  return {
    winner,
    reason: winner ? 'checkmate' : 'stalemate',
    totalMoves: 40,
    cardsPlayed: cardName
      ? [{
          cardName,
          playedBy: winner ?? 'w',
          onTurn: 20,
          materialBefore: { w: 3900, b: 3900 },
          materialAfter: { w: 4800, b: 3900 },
        }]
      : [],
  };
}

describe('StatsCollector', () => {
  it('correctly counts wins and draws', () => {
    const c = new StatsCollector();
    c.addGame(makeResult('w'));
    c.addGame(makeResult('b'));
    c.addGame(makeResult(null));
    const s = c.getStats();
    expect(s.whiteWins).toBe(1);
    expect(s.blackWins).toBe(1);
    expect(s.draws).toBe(1);
    expect(s.totalGames).toBe(3);
  });

  it('win rates sum to 1', () => {
    const c = new StatsCollector();
    for (let i = 0; i < 10; i++) c.addGame(makeResult(i % 2 === 0 ? 'w' : 'b'));
    const { winRates } = c.getStats();
    expect(Math.abs(winRates.white + winRates.black + winRates.draw - 1)).toBeLessThan(0.001);
  });

  it('tracks cards played per card', () => {
    const c = new StatsCollector();
    c.addGame(makeResult('w', 'Freeze'));
    c.addGame(makeResult('b', 'Coup'));
    const s = c.getStats();
    expect(s.perCard.get('Freeze')?.timesPlayed).toBe(1);
    expect(s.perCard.get('Coup')?.timesPlayed).toBe(1);
  });

  it('exports valid CSV', () => {
    const c = new StatsCollector();
    c.addGame(makeResult('w', 'Shield'));
    const csv = c.exportCSV();
    expect(csv).toContain('cardName');
    expect(csv.split('\n').length).toBeGreaterThan(2);
  });
});
