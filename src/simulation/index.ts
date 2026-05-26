// src/simulation/index.ts
export type { SimulationConfig, SimulationResult, AggregatedStats, Histogram, BalanceReport } from './types.ts';
export { SimulationRunner } from './runner.ts';
export { StatsCollector } from './stats.ts';
export { exportJSON, exportCSV, exportMarkdownReport } from './export.ts';
