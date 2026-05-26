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

## Deploy (Cloudflare Workers)

The web sim is hosted as a static Worker (Vite SPA in `dist/`, served via `assets`).

One-time setup:

```bash
npx wrangler login
```

Every deploy:

```bash
npx wrangler deploy        # also runs `pnpm exec vite build` first
# or
pnpm cf:deploy
```

Local preview against the Workers runtime (instead of `pnpm dev`):

```bash
pnpm cf:dev
```

After first deploy the app is live at `https://super-chess.<account>.workers.dev`. The custom domain `super-chess.bitwiseandrea.com` is wired by uncommenting the `routes` block in `wrangler.jsonc` (requires the `bitwiseandrea.com` zone on Cloudflare).

## Roblox Port (Super Chess Studio Place)

A Roblox Studio version of Super Chess has been bootstrapped via the Studio MCP. The place lives in the **Super Chess** Studio session and re-implements the engine + card layer in Luau, with a 3D graybox board and SurfaceGui card hands. The TS engine and the Luau engine produce **identical perft results through depth 3 (1 / 20 / 400 / 8902)**, so legal-move generation is at parity.

### Layout in Studio

```
ReplicatedStorage/
  SuperChess/
    Modules/
      Board          ModuleScript -- square <-> rc, piece codes, initial state
      MoveGen        ModuleScript -- pseudo-legal + legal moves, attack detection
      Rules          ModuleScript -- Super Chess overrides (frozen, shield, foul, mustMove,
                                    knightsPath, fortify, game-over)
      Cards          ModuleScript -- all 20 card definitions (data)
      Deck           ModuleScript -- draw/discard/hand mgmt
      CardEffects    ModuleScript -- effect handlers
      PieceVisuals   ModuleScript -- graybox piece factory (cylinders + blocks)
      Bot            ModuleScript -- alpha-beta minimax bot (depth 1-3, capture-first ordering)
    Remotes/
      StateChanged   RemoteEvent     server -> clients
      RequestMove    RemoteEvent     client -> server
      RequestCard    RemoteEvent     client -> server
      RequestRestart RemoteEvent     client -> server
      RequestState   RemoteFunction  client -> server (initial sync)
      SetBotEnabled  RemoteEvent     client -> server (toggle bot / color / depth)

ServerScriptService/
  SuperChessServer/
    WorldBuilder   Script        spawns 64-square board, hand panels, status board, lights
    GameManager    Script        authoritative game loop
    VisualSync     ModuleScript  syncs Workspace.SuperChess.Pieces + hand SurfaceGuis +
                                 StatusBoard text/log to a snapshot

StarterPlayer/StarterPlayerScripts/
  SuperChessClient/
    Controller     LocalScript   square + card click handling, selection, highlights

StarterGui/
  SuperChessHUD    ScreenGui     on-screen controls hint

Workspace/SuperChess/
  Board            Folder of 64 Parts (each 4x4 studs, ClickDetector + SelectionBox)
  Pieces           Folder of piece Models (Parts as graybox primitives)
  WhiteHandPanel   Part with SurfaceGui rendering white's hand (2 cards)
  BlackHandPanel   Part with SurfaceGui rendering black's hand (2 cards)
  StatusBoard      Part with SurfaceGui showing turn + recent move log
  Base             wood-colored slab under the board
```

### How to play

1. Open the **Super Chess** place in Roblox Studio
2. Press **Play**
3. Click one of your pieces; legal destinations highlight green
4. Click a destination to move
5. Click a card on your hand panel to play it
   - Single-target cards: click the target square next
   - Two-target cards (Teleport, Swap, Retreat): click two squares
   - Disrupt: pick a piece type from the bottom-of-screen picker
6. **Solo play**: by default the bot plays black at depth 2 — just move and it will reply
7. Toggle the bot from the HUD (top-left): **ON/OFF**, **Black/White**, **Depth 1/2/3**
8. **Hot-seat** mode: turn the bot OFF and pass control between players each turn
9. Press **R** to restart, **Esc** to clear selection

### Feature parity vs the web project

| Feature | Web (TS) | Roblox (Luau) | Notes |
|---|---|---|---|
| 8x8 board, FEN parsing | yes | board only (no FEN) | parser not needed in MVP |
| Legal move gen (perft(3) = 8902) | yes | yes | bit-identical results |
| Check / checkmate / stalemate | yes | yes | |
| Castling, en passant, promotion | yes | yes | promotion defaults to queen |
| 50-move draw, move-limit, repetition | 50 + limit + repetition | 50 + limit | repetition omitted |
| Card definitions (20 cards) | yes | yes | all 20 ported as data |
| Card effects implemented | 20/20 | 16/20 | Mirror, Trade, Fog, Time Warp left as placeholders that show "NOT IMPLEMENTED" on the card |
| Deck draw/discard/reshuffle | yes | yes | Fisher-Yates with Roblox `Random` |
| Capture-triggered card draw | yes | yes | white still skips first draw to offset first-move advantage |
| Slow-game card draw (every 6 turns) | yes | yes | |
| Frozen squares, Shield, Foul Ground | yes | yes | |
| Knight's Path, Fortify, Ghost Step | yes | yes (Ghost Step uses simple "any-direction" pass) | |
| Extra Move, Pawn Storm | yes | yes | |
| Disrupt (must-move type) | yes | yes | type picker UI |
| 3D world | n/a | yes | graybox parts: cylinders for round pieces, blocks for square pieces |
| Card UI | HTML/CSS | SurfaceGui on 3D part | one panel per player on the long side of the board |
| AI (Minimax chess) | yes (TS, depth 2-3) | yes (Luau, depth 1-3 selectable) | alpha-beta with capture-first ordering, ~6ms/move at depth 2 |
| Heuristic CardAI | yes | no | bot plays only chess moves, not cards |
| Solo play vs bot | yes | yes | toggle from HUD (default: bot plays black, depth 2) |
| Simulation runner (CLI) | yes | no | not applicable in-engine |
| Stats dashboard | yes | no | StatusBoard shows turn + move log instead |

### Known graybox compromises (called out per the brief)

- Pieces are primitive shapes, not mesh imports — kings/queens are tall blocks/cylinders with accent toppers
- No piece-move animations (pieces teleport on state change)
- No SFX or VFX
- Hand panels are simple SurfaceGuis; no draw/discard animations
- StatusBoard is a flat 2D label on a Part — no minimap, captured-piece tray, etc.

### Validation done in edit mode through the Studio MCP

- Loaded every ModuleScript via `require` — no syntax errors
- `perft(1..3)` from the initial position matches the TS engine (20 / 400 / 8902)
- Played a manual mini-game (e2-e4 / d7-d5 / exd5 / Qxd5 / Nc3 / Qa5) and confirmed:
  - VisualSync updated piece positions correctly
  - Capture-triggered card draw fired for black (and was skipped for white as designed)
- Verified `Knight's Path` on the white queen at d1 yields knight moves c3 / e3 (b2 / f2 blocked by friendly pawns)
- Verified `Freeze` on b8 prevents the black knight from moving for one black turn and expires afterward
- Verified `Shield` on e2 makes a capture of e2 return "Target piece is shielded"
- Verified `Pawn Storm` advances all 8 white pawns one rank
- Verified `Double Step` moves e2 to e4 in one card play
- Verified `Foul Ground` on e4 removes black's option to move to e4
- Verified `Disrupt` with `N` reduces black's legal-move set to only knight moves
- Verified bot at depth 2: 6.5 ms average per move over a 10-move test game (sensible openings: develops knights, castles, captures hanging pieces)
- Verified bot at depth 3: ~60 ms per move from the initial position (still real-time)

