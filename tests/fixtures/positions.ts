// tests/fixtures/positions.ts
// Known FEN positions for testing

export const POSITIONS = {
  STARTING: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',

  // After 1. e4
  AFTER_E4: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',

  // Scholar's mate position (checkmate)
  SCHOLARS_MATE: 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4',

  // Stalemate position (black to move, stalemate) — black king h8, white queen g6 + king f7
  STALEMATE: '7k/5K2/6Q1/8/8/8/8/8 b - - 0 1',

  // En passant possible
  EN_PASSANT: 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3',

  // Castling available
  CASTLING_AVAILABLE: 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1',

  // Pinned knight
  PIN: 'rnb1kbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKB1R w KQkq - 0 3',

  // Promotion position
  PROMOTION: '8/P7/8/8/8/8/8/4K1k1 w - - 0 1',

  // Mid-game position
  MIDGAME: 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 4 8',
} as const;
