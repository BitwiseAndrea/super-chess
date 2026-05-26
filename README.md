# Super Chess Simulator

A local simulation environment that plays hundreds of Super Chess games autonomously, collecting card performance statistics for balance analysis.

## What is Super Chess?

Super Chess is standard chess with a card layer. Each player holds up to 2 cards drawn from a shared deck of 20 unique cards. Cards are played before a chess move, and can freeze pieces, shield them, teleport them, grant extra moves, and more. The simulator plays games at high speed using a minimax engine and a heuristic card AI, then exports win-rate and per-card statistics.

## Tech Stack

- **TypeScript** + **Vite** (frontend UI, port 5173)
- **Vitest** (unit tests with coverage)
- **pnpm** (package manager)
- **tsx** (CLI scripts)
- **D3** (stats visualisation, table-based fallback)

## Quick Start

```bash
# Requires Node 20+ (nvm users: nvm use 20)
pnpm install
pnpm dev         # open http://localhost:5173
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Vite dev server |
| `pnpm build` | Production build |
| `pnpm test` | Run tests (watch mode) |
| `pnpm test:coverage` | Run tests with V8 coverage |
| `pnpm lint` | ESLint (flat config) |
| `pnpm format` | Prettier |
| `pnpm sim` | CLI simulation (see below) |
| `pnpm export-stats` | Export JSON results to CSV/Markdown |
| `pnpm benchmark` | Engine perft + search speed |

### CLI Simulation

```bash
# 500 games, depth 2, save to file
pnpm sim --games 500 --depth 2 --output sim-results/run.json

# Export saved results
pnpm export-stats --input sim-results/run.json --format csv
pnpm export-stats --input sim-results/run.json --format markdown

# Engine benchmark
pnpm benchmark
```

## Project Structure

```
src/
  engine/       Chess engine (board, move generation, FEN, evaluation, search)
  cards/        Card definitions, deck management, all 20 card effects, card AI
  ai/           MinimaxAI, StockfishAI (stub), HeuristicCardAI, ClaudeCardAI (stub)
  game/         SuperChessGame orchestrator, rules engine
  simulation/   SimulationRunner, StatsCollector, export functions
  ui/           BoardRenderer, CardHandsRenderer, GameLogRenderer, StatsDashboard, ControlsPanel
  config/       Card overrides, simulation defaults, AI config
tests/
  engine/       board, movegen (perft), fen, evaluate
  cards/        deck, effects
  game/         superChess
  simulation/   runner, stats
scripts/
  sim.ts        CLI simulation runner
  export-stats.ts  Export JSON → CSV/Markdown
  benchmark.ts  Engine speed measurement
.github/workflows/
  test.yml      CI: lint + test on push/PR
  sim-report.yml  Nightly: 500-game sim, posts report to issue #1
```

## Cards

20 cards across 3 rarities (common/uncommon/rare):

| Card | Rarity | Effect |
|------|--------|--------|
| Knight's Path | Common | Selected piece moves as a knight this turn |
| Freeze | Common | Freeze an opponent piece for 1 turn |
| Shield | Common | Protect a piece from capture for 2 turns |
| Extra Move | Uncommon | Take an additional chess move this turn |
| Coup | Rare | Remove any opponent piece that your queen can reach |
| Resurrection | Uncommon | Return a captured minor piece to the board |
| Teleport | Uncommon | Move any own piece to any empty square |
| Pawn Storm | Common | Advance all own pawns one square |
| Promotion Rush | Uncommon | Rush a pawn to the pre-promotion rank |
| Ghost Step | Uncommon | Selected piece ignores blocking pieces this turn |
| Swap | Uncommon | Swap two own pieces |
| Fortify | Common | A pawn cannot be captured this turn |
| Double Step | Common | Move a pawn two squares regardless of position |
| Retreat | Common | Move any piece one square backward |
| Foul Ground | Common | Mark a square — opponent cannot land there |
| Disrupt | Uncommon | Force opponent to move only a specific piece type |
| Mirror | Rare | Replay the opponent's last move with your own piece |
| Trade | Common | Swap your most/least advanced pawns |
| Fog | Uncommon | Opponent cannot see your piece positions this turn |
| Time Warp | Rare | Restore the position to 2 plies ago |

## Engine

- **Board**: Square 0 = a8 (top-left), 63 = h1 (bottom-right)
- **Move generation**: Full legal move generation with perft(3) = 8902 ✓
- **Evaluation**: Material + piece-square tables (centipawns, white-positive)
- **Search**: Negamax alpha-beta with quiescence search

## Configuration

Edit `src/config/cards.config.ts` to override card properties for balance testing:

```ts
export const CARD_OVERRIDES: CardDefinitionOverride[] = [
  { name: 'Coup', copies: 2 },        // increase availability
  { name: 'Time Warp', copies: 0 },   // disable entirely
];
```

Edit `src/config/simulation.config.ts` for default simulation parameters.

## CI

- **test.yml**: Runs on every push/PR — lint, test, coverage artifact upload
- **sim-report.yml**: Nightly at 02:00 UTC — 500-game simulation, Markdown report posted as comment on issue #1
