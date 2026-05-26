#!/usr/bin/env tsx
// scripts/sim.ts — CLI simulation runner
// Usage: pnpm sim --games 500 --depth 2 --output sim-results/run.json

import { parseArgs } from 'node:util';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SimulationRunner } from '../src/simulation/runner.ts';
import { MinimaxAI } from '../src/ai/minimaxAI.ts';
import { HeuristicCardAI } from '../src/ai/heuristicCardAI.ts';
import { exportJSON, exportMarkdownReport } from '../src/simulation/export.ts';

const { values } = parseArgs({
  options: {
    games:  { type: 'string', default: '100' },
    depth:  { type: 'string', default: '2' },
    output: { type: 'string', default: '' },
    seed:   { type: 'string', default: '' },
  },
});

const games = parseInt(values.games as string, 10);
const depth = parseInt(values.depth as string, 10);
const seed  = values.seed ? parseInt(values.seed as string, 10) : undefined;
const output = values.output as string;

console.log(`\n  Super Chess Simulation`);
console.log(`  Games: ${games}  Depth: ${depth}  Seed: ${seed ?? 'random'}`);
console.log(`  ─────────────────────────────\n`);

const chessAI = new MinimaxAI(depth);
const cardAI  = new HeuristicCardAI();

const runner = new SimulationRunner({
  games,
  chessAI:  { white: chessAI, black: chessAI },
  cardAI:   { white: cardAI,  black: cardAI  },
  searchDepth: depth,
  speedMs: 0,
  maxMovesPerGame: 200,
  seed,
});

const result = await runner.runAll();

const { stats } = result;
const wr = stats.winRates;
console.log(`\n  Results:`);
console.log(`  White: ${(wr.white * 100).toFixed(1)}%  Black: ${(wr.black * 100).toFixed(1)}%  Draw: ${(wr.draw * 100).toFixed(1)}%`);
console.log(`  Avg game length: ${stats.avgGameLength.toFixed(1)} moves`);
console.log(`  Duration: ${(result.durationMs / 1000).toFixed(1)}s`);

const markdown = exportMarkdownReport(result);
console.log('\n' + markdown);

if (output) {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, exportJSON(result), 'utf8');
  console.log(`\n  Saved to ${output}`);
}
