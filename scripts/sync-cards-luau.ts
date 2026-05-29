// scripts/sync-cards-luau.ts
//
// Regenerates the Luau snapshot file `roblox/SuperChessData.luau` from the
// canonical JSON at `src/data/super-chess.json`. Run with:
//
//   pnpm cards:sync
//
// The generated file is a ModuleScript-shaped Luau source. After regenerating,
// push the file's contents to Roblox Studio (Game.ReplicatedStorage.SuperChess
// .Modules.SuperChessData) — either by hand-pasting in Studio, or by asking
// the Cursor / Claude session to push it via the Studio MCP `multi_edit` tool.
//
// The Luau side keeps the JSON encoded as a string and decodes it at module
// load. At server boot the SharedData module also attempts an HttpService
// fetch from the live website to pick up any deltas; if that fails, the
// embedded snapshot below is used.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');
const jsonPath = resolve(repoRoot, 'src/data/super-chess.json');
const outPath = resolve(repoRoot, 'roblox/SuperChessData.luau');

const raw = readFileSync(jsonPath, 'utf-8');
// Validate JSON (throws if malformed).
const parsed = JSON.parse(raw);
const cardCount = (parsed.cards ?? []).length;
const version = parsed.version ?? '0.0.0';

// Lua bracket strings ([[...]]) cannot contain `]]` literally, but they can
// contain `]==]` etc. with matched levels. We pick a level long enough that
// it can never appear inside our JSON.
function chooseBracketLevel(text: string): string {
  let level = 0;
  while (text.includes(`]${'='.repeat(level)}]`)) {
    level++;
  }
  return '='.repeat(level);
}
const lvl = chooseBracketLevel(raw);

const banner = `-- SuperChessData.luau
-- GENERATED FILE — do not edit by hand.
-- Source: src/data/super-chess.json
-- Regenerate with: pnpm cards:sync
--
-- Generated at: ${new Date().toISOString()}
-- Cards: ${cardCount}
-- Version: ${version}
`;

const luau = `${banner}
local SuperChessData = {}

SuperChessData.embeddedJson = [${lvl}[
${raw}
]${lvl}]

SuperChessData.embeddedVersion = ${JSON.stringify(version)}

return SuperChessData
`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, luau, 'utf-8');

console.log(`Wrote ${outPath}`);
console.log(`  ${cardCount} cards, version ${version}, ${raw.length} bytes of JSON`);
console.log('');
console.log('Next: push this file into Roblox Studio at');
console.log('  Game.ReplicatedStorage.SuperChess.Modules.SuperChessData');
console.log('(or ask the Cursor session to do it via the Studio MCP).');
