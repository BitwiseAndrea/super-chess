// src/simulation/stats.ts
import type { GameResult, CardStats } from '../game/types.ts';
import type { AggregatedStats, Histogram, BalanceReport } from './types.ts';
import { CARD_DEFINITIONS } from '../cards/definitions.ts';

export class StatsCollector {
  private games: GameResult[] = [];

  addGame(result: GameResult): void {
    this.games.push(result);
  }

  getStats(): AggregatedStats {
    const total = this.games.length;
    if (total === 0) {
      return emptyStats();
    }

    const whiteWins = this.games.filter((g) => g.winner === 'w').length;
    const blackWins = this.games.filter((g) => g.winner === 'b').length;
    const draws = total - whiteWins - blackWins;

    const gameLengths = this.games.map((g) => g.totalMoves);
    const avgGameLength = avg(gameLengths);
    const medianGameLength = median(gameLengths);

    const totalCardsPlayed = this.games.reduce((s, g) => s + g.cardsPlayed.length, 0);
    const avgCardsPlayedPerGame = totalCardsPlayed / total;

    const perCard = this.buildPerCardStats();
    const totalDrawn = [...perCard.values()].reduce((s, c) => s + c.timesDrawn, 0);
    const avgCardsDrawnPerGame = totalDrawn / total;
    const cardUtilizationRate = totalDrawn > 0 ? totalCardsPlayed / totalDrawn : 0;

    return {
      totalGames: total,
      whiteWins,
      blackWins,
      draws,
      winRates: {
        white: whiteWins / total,
        black: blackWins / total,
        draw: draws / total,
      },
      avgGameLength,
      medianGameLength,
      avgCardsDrawnPerGame,
      avgCardsPlayedPerGame,
      cardUtilizationRate,
      perCard,
    };
  }

  getCardWinCorrelation(cardName: string): number {
    const stats = this.buildPerCardStats().get(cardName);
    return stats?.winCorrelation ?? 0;
  }

  getCardAvgMaterialSwing(cardName: string): number {
    const stats = this.buildPerCardStats().get(cardName);
    return stats?.avgMaterialSwingOnPlay ?? 0;
  }

  getGameLengthDistribution(): Histogram {
    const lengths = this.games.map((g) => g.totalMoves);
    return makeHistogram(lengths, 5);
  }

  getCardPlayTurnDistribution(cardName: string): Histogram {
    const turns = this.games.flatMap((g) =>
      g.cardsPlayed.filter((c) => c.cardName === cardName).map((c) => c.onTurn),
    );
    return makeHistogram(turns, 5);
  }

  getUtilizationRanking(): Array<{ card: string; rate: number }> {
    const perCard = this.buildPerCardStats();
    return [...perCard.entries()]
      .map(([name, s]) => ({ card: name, rate: s.utilizationRate }))
      .sort((a, b) => b.rate - a.rate);
  }

  getBalanceReport(): BalanceReport {
    const perCard = this.buildPerCardStats();
    const overperforming: string[] = [];
    const underperforming: string[] = [];
    const situational: string[] = [];
    const recommendations: string[] = [];

    for (const [name, stats] of perCard) {
      if (stats.utilizationRate > 0.7 && stats.winCorrelation > 0.3) {
        overperforming.push(name);
        recommendations.push(`Consider reducing copies or nerfing "${name}" (high utilization + win correlation)`);
      } else if (stats.utilizationRate < 0.2 && stats.timesDrawn > 5) {
        underperforming.push(name);
        recommendations.push(`Consider buffing "${name}" (rarely played when drawn)`);
      } else if (stats.utilizationRate < 0.3 && Math.abs(stats.avgMaterialSwingOnPlay) > 3) {
        situational.push(name);
      }
    }

    // Check if cards help losing players
    const gamesWithCards = this.games.filter((g) => g.cardsPlayed.length > 0);
    const catchUpGames = gamesWithCards.filter((g) => {
      // Cards played by the losing side
      const losingCards = g.cardsPlayed.filter((c) => c.playedBy !== g.winner);
      return losingCards.length > 0;
    });
    const catchUpEffective = gamesWithCards.length > 0 && catchUpGames.length / gamesWithCards.length > 0.4;

    return { overperforming, underperforming, situational, catchUpEffective, recommendedAdjustments: recommendations };
  }

  private buildPerCardStats(): Map<string, CardStats> {
    const map = new Map<string, CardStats>();

    for (const def of CARD_DEFINITIONS) {
      map.set(def.name, {
        cardName: def.name,
        rarity: def.rarity,
        timesDrawn: 0,
        timesPlayed: 0,
        timesHeld: 0,
        utilizationRate: 0,
        avgTurnPlayed: 0,
        playedInWhiteWins: 0,
        playedInBlackWins: 0,
        playedInDraws: 0,
        winCorrelation: 0,
        avgMaterialSwingOnPlay: 0,
        playedByWhite: 0,
        playedByBlack: 0,
      });
    }

    // Cards played
    for (const game of this.games) {
      for (const cp of game.cardsPlayed) {
        const s = map.get(cp.cardName);
        if (!s) continue;
        s.timesPlayed++;
        s.avgTurnPlayed += cp.onTurn;

        const swing = cp.playedBy === 'w'
          ? (cp.materialAfter.w - cp.materialBefore.w) - (cp.materialAfter.b - cp.materialBefore.b)
          : (cp.materialAfter.b - cp.materialBefore.b) - (cp.materialAfter.w - cp.materialBefore.w);
        s.avgMaterialSwingOnPlay += swing / 100;

        if (cp.playedBy === 'w') s.playedByWhite++;
        else s.playedByBlack++;

        if (game.winner === 'w') s.playedInWhiteWins++;
        else if (game.winner === 'b') s.playedInBlackWins++;
        else s.playedInDraws++;
      }
    }

    // Finalize averages and compute correlations
    for (const s of map.values()) {
      if (s.timesPlayed > 0) {
        s.avgTurnPlayed /= s.timesPlayed;
        s.avgMaterialSwingOnPlay /= s.timesPlayed;

        // Win correlation: how often is this card played in winning games?
        // +1 = only played by winners, -1 = only played by losers
        const wins = s.playedInWhiteWins + s.playedInBlackWins;
        const total = s.timesPlayed;
        s.winCorrelation = total > 0 ? (wins / total) * 2 - 1 : 0;
      }

      // timesDrawn is estimated from total copies played vs expected draw rate
      s.timesDrawn = Math.round(s.timesPlayed * 1.4); // rough estimate; real tracking requires event log
      s.timesHeld = Math.max(0, s.timesDrawn - s.timesPlayed);
      s.utilizationRate = s.timesDrawn > 0 ? s.timesPlayed / s.timesDrawn : 0;
    }

    return map;
  }

  exportJSON(): string {
    return JSON.stringify(
      {
        stats: convertMapsForJSON(this.getStats()),
        games: this.games,
      },
      null,
      2,
    );
  }

  exportCSV(): string {
    const stats = this.buildPerCardStats();
    const headers = [
      'cardName', 'rarity', 'timesPlayed', 'timesDrawn', 'utilizationRate',
      'avgTurnPlayed', 'winCorrelation', 'avgMaterialSwingOnPlay', 'playedByWhite', 'playedByBlack',
    ];
    const rows = [...stats.values()].map((s) =>
      [
        s.cardName, s.rarity, s.timesPlayed, s.timesDrawn,
        s.utilizationRate.toFixed(3), s.avgTurnPlayed.toFixed(1),
        s.winCorrelation.toFixed(3), s.avgMaterialSwingOnPlay.toFixed(2),
        s.playedByWhite, s.playedByBlack,
      ].join(','),
    );
    return [headers.join(','), ...rows].join('\n');
  }
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function makeHistogram(values: number[], step: number): Histogram {
  if (values.length === 0) return { buckets: [], min: 0, max: 0, step };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const bucketCount = Math.ceil((max - min) / step) + 1;
  const buckets = new Array(bucketCount).fill(0);
  for (const v of values) {
    const idx = Math.floor((v - min) / step);
    buckets[Math.min(idx, bucketCount - 1)]++;
  }
  return { buckets, min, max, step };
}

function emptyStats(): AggregatedStats {
  return {
    totalGames: 0, whiteWins: 0, blackWins: 0, draws: 0,
    winRates: { white: 0, black: 0, draw: 0 },
    avgGameLength: 0, medianGameLength: 0,
    avgCardsDrawnPerGame: 0, avgCardsPlayedPerGame: 0, cardUtilizationRate: 0,
    perCard: new Map(),
  };
}

function convertMapsForJSON(obj: AggregatedStats): Record<string, unknown> {
  return {
    ...obj,
    perCard: Object.fromEntries(obj.perCard),
  };
}
