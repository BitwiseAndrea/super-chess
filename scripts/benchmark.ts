#!/usr/bin/env tsx
// scripts/benchmark.ts — Measure engine speed (nodes/sec)
// Usage: pnpm benchmark

import { initialState } from '../src/engine/board.ts';
import { search } from '../src/engine/search.ts';
import { generateLegal, applyMoveInPlace, undoMove } from '../src/engine/movegen.ts';

function perft(state: ReturnType<typeof initialState>, depth: number): number {
  if (depth === 0) return 1;
  const moves = generateLegal(state);
  if (depth === 1) return moves.length;
  let nodes = 0;
  for (const move of moves) {
    const saved = applyMoveInPlace(state, move);
    nodes += perft(state, depth - 1);
    undoMove(state, move, saved);
  }
  return nodes;
}

console.log('\n  Super Chess Engine Benchmark');
console.log('  ─────────────────────────────\n');

// Perft speed
for (const depth of [1, 2, 3, 4]) {
  const state = initialState();
  const start = performance.now();
  const nodes = perft(state, depth);
  const elapsed = performance.now() - start;
  const nps = (nodes / (elapsed / 1000)).toFixed(0);
  console.log(`  perft(${depth}) = ${nodes.toLocaleString()} nodes in ${elapsed.toFixed(0)}ms  (${Number(nps).toLocaleString()} nodes/sec)`);
}

// Search speed
console.log('\n  Search speed:');
for (const depth of [1, 2, 3]) {
  const state = initialState();
  const start = performance.now();
  const result = search(state, { depth });
  const elapsed = performance.now() - start;
  console.log(`  depth=${depth}: ${result.nodesVisited.toLocaleString()} nodes, ${elapsed.toFixed(0)}ms, best=${result.bestMove ? `${result.bestMove.from}→${result.bestMove.to}` : 'none'}`);
}

console.log('');
