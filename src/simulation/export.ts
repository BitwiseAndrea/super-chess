// src/simulation/export.ts
import type { SimulationResult } from './types.ts';
import { StatsCollector } from './stats.ts';

export function exportJSON(result: SimulationResult): string {
  return JSON.stringify(
    {
      config: result.config,
      startedAt: result.startedAt.toISOString(),
      completedAt: result.completedAt.toISOString(),
      durationMs: result.durationMs,
      stats: statsToJSON(result.stats),
      games: result.games,
    },
    null,
    2,
  );
}

export function exportCSV(result: SimulationResult): string {
  const collector = new StatsCollector();
  for (const g of result.games) collector.addGame(g);
  return collector.exportCSV();
}

export function exportMarkdownReport(result: SimulationResult): string {
  const { stats } = result;
  const wr = stats.winRates;
  const lines: string[] = [
    `## Super Chess Simulation Report`,
    ``,
    `**Games:** ${stats.totalGames} | **Duration:** ${(result.durationMs / 1000).toFixed(1)}s`,
    ``,
    `### Win Rates`,
    `| White | Black | Draw |`,
    `|-------|-------|------|`,
    `| ${(wr.white * 100).toFixed(1)}% | ${(wr.black * 100).toFixed(1)}% | ${(wr.draw * 100).toFixed(1)}% |`,
    ``,
    `### Game Length`,
    `- Average: ${stats.avgGameLength.toFixed(1)} moves`,
    `- Median: ${stats.medianGameLength} moves`,
    ``,
    `### Card Statistics`,
    `| Card | Played | Utilization | Win Correlation | Material Swing |`,
    `|------|--------|-------------|-----------------|----------------|`,
  ];

  const sorted = [...stats.perCard.values()].sort((a, b) => b.timesPlayed - a.timesPlayed);
  for (const s of sorted) {
    lines.push(
      `| ${s.cardName} | ${s.timesPlayed} | ${(s.utilizationRate * 100).toFixed(0)}% | ${s.winCorrelation.toFixed(2)} | ${s.avgMaterialSwingOnPlay.toFixed(2)} |`,
    );
  }

  const collector = new StatsCollector();
  for (const g of result.games) collector.addGame(g);
  const report = collector.getBalanceReport();

  lines.push('', '### Balance Report');
  if (report.overperforming.length > 0) {
    lines.push(`**Overperforming:** ${report.overperforming.join(', ')}`);
  }
  if (report.underperforming.length > 0) {
    lines.push(`**Underperforming:** ${report.underperforming.join(', ')}`);
  }
  lines.push(`**Catch-up mechanics effective:** ${report.catchUpEffective ? 'Yes' : 'No'}`);
  if (report.recommendedAdjustments.length > 0) {
    lines.push('', '### Recommendations');
    for (const rec of report.recommendedAdjustments) {
      lines.push(`- ${rec}`);
    }
  }

  return lines.join('\n');
}

function statsToJSON(stats: ReturnType<StatsCollector['getStats']>) {
  return {
    ...stats,
    perCard: Object.fromEntries(stats.perCard),
  };
}
