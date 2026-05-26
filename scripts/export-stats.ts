#!/usr/bin/env tsx
// scripts/export-stats.ts — Export simulation results to CSV or Markdown
// Usage: pnpm export-stats --input sim-results/run.json --format csv

import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';
import { SimulationResult } from '../src/simulation/types.ts';
import { exportCSV, exportMarkdownReport } from '../src/simulation/export.ts';

const { values } = parseArgs({
  options: {
    input:  { type: 'string' },
    format: { type: 'string', default: 'markdown' },
    output: { type: 'string', default: '' },
  },
});

if (!values.input) {
  console.error('Usage: pnpm export-stats --input <file.json> [--format csv|markdown] [--output <out>]');
  process.exit(1);
}

const raw = readFileSync(values.input as string, 'utf8');
const result: SimulationResult = JSON.parse(raw);

// Restore Date objects
result.startedAt = new Date(result.startedAt);
result.completedAt = new Date(result.completedAt);

const format = values.format as string;
let out: string;

if (format === 'csv') {
  out = exportCSV(result);
} else {
  out = exportMarkdownReport(result);
}

if (values.output) {
  writeFileSync(values.output as string, out, 'utf8');
  console.log(`Exported to ${values.output}`);
} else {
  process.stdout.write(out + '\n');
}
