import { defineConfig, type Plugin } from 'vite';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataFile = resolve(__dirname, 'src/data/super-chess.json');

// Serves the canonical card/engine data JSON at `/super-chess.json` in dev,
// and copies it into the bundle at `dist/super-chess.json` on build, so the
// Roblox port can fetch it at runtime via HttpService.
function superChessDataPlugin(): Plugin {
  return {
    name: 'super-chess-data',
    configureServer(server) {
      server.middlewares.use('/super-chess.json', (_req, res) => {
        try {
          const body = readFileSync(dataFile);
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.statusCode = 200;
          res.end(body);
        } catch (err) {
          res.statusCode = 500;
          res.end(`failed to read ${dataFile}: ${(err as Error).message}`);
        }
      });
    },
    closeBundle() {
      const outDir = resolve(__dirname, 'dist');
      mkdirSync(outDir, { recursive: true });
      writeFileSync(resolve(outDir, 'super-chess.json'), readFileSync(dataFile));
    },
  };
}

export default defineConfig({
  root: '.',
  plugins: [superChessDataPlugin()],
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
  server: {
    port: 5173,
  },
});
