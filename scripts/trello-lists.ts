#!/usr/bin/env tsx
// scripts/trello-lists.ts
//
// Print the lists (and their IDs) on the Super Chess Trello board so
// you can copy the right one into `TRELLO_LIST_ID` for the bug-report
// Worker. The board ID is taken from the URL you shared
// (https://trello.com/b/4oHJjs1D/super-chess) but can be overridden
// via --board.
//
// Usage:
//   TRELLO_API_KEY=… TRELLO_API_TOKEN=… pnpm trello:lists
//   TRELLO_API_KEY=… TRELLO_API_TOKEN=… pnpm trello:lists --board 4oHJjs1D
//
// The credentials come from env vars deliberately — we never want them
// on argv (and therefore in shell history). Grab them from
// https://trello.com/app-key.

import { parseArgs } from 'node:util';

const DEFAULT_BOARD = '4oHJjs1D';

const { values } = parseArgs({
  options: {
    board: { type: 'string', default: DEFAULT_BOARD },
  },
});

const key = process.env.TRELLO_API_KEY;
const token = process.env.TRELLO_API_TOKEN;

if (!key || !token) {
  console.error(
    'Missing TRELLO_API_KEY or TRELLO_API_TOKEN in env.\n' +
      '  Get them at https://trello.com/app-key, then run:\n' +
      '    TRELLO_API_KEY=… TRELLO_API_TOKEN=… pnpm trello:lists',
  );
  process.exit(1);
}

const boardId = values.board ?? DEFAULT_BOARD;
const url = new URL(`https://api.trello.com/1/boards/${boardId}/lists`);
url.searchParams.set('key', key);
url.searchParams.set('token', token);
url.searchParams.set('fields', 'name,closed,pos');

const res = await fetch(url.toString());
if (!res.ok) {
  console.error(
    `Trello API error ${res.status} ${res.statusText}: ${await res.text()}`,
  );
  process.exit(1);
}

const lists = (await res.json()) as Array<{
  id: string;
  name: string;
  closed: boolean;
  pos: number;
}>;

const open = lists
  .filter((l) => !l.closed)
  .sort((a, b) => a.pos - b.pos);

if (open.length === 0) {
  console.log(`No open lists on board ${boardId}.`);
  process.exit(0);
}

const longest = Math.max(...open.map((l) => l.name.length), 4);

console.log(`Lists on board ${boardId}:\n`);
console.log(`  ${'NAME'.padEnd(longest)}  ID`);
console.log(`  ${'----'.padEnd(longest)}  ${'-'.repeat(24)}`);
for (const l of open) {
  console.log(`  ${l.name.padEnd(longest)}  ${l.id}`);
}
console.log(
  `\nTo wire one up as the bug-report destination, run:\n` +
    `  npx wrangler secret put TRELLO_LIST_ID\n` +
    `and paste the ID when prompted.`,
);
