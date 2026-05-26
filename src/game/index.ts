// src/game/index.ts
export type { SuperChessState, SuperState, GameResult, CardPlayRecord, TurnResult, GameEvent, CardTarget, CardStats } from './types.ts';
export { createSuperState } from './types.ts';
export { validateSuperChessMove, getSuperChessLegalMoves, tickSuperState, clearMovedPieceShield, satisfiesDisrupt, checkGameOver } from './rules.ts';
export { SuperChessGame } from './superChess.ts';
