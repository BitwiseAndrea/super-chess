// src/cards/definitions.ts
import type { CardDefinition } from './types.ts';

export const CARD_DEFINITIONS: CardDefinition[] = [
  {
    name: "Knight's Path",
    rarity: 'common',
    category: 'movement',
    copies: 3,
    emoji: '♞',
    shortDesc: 'Any piece moves like a knight this turn.',
    rulesText:
      "Before your move, nominate one of your pieces. That piece moves as if it were a knight for this turn only. The piece must still not leave your king in check. This does not count as moving the piece for castling purposes.",
    requiresTarget: true,
    targetType: 'ownPiece',
  },
  {
    name: 'Freeze',
    rarity: 'common',
    category: 'disruption',
    copies: 3,
    emoji: '❄️',
    shortDesc: "Freeze an opponent's piece for 1 turn.",
    rulesText:
      "Choose one of your opponent's pieces (not the king). That piece cannot move on the opponent's next turn. Frozen pieces can still be captured. The freeze expires at the end of their next turn.",
    requiresTarget: true,
    targetType: 'oppPiece',
  },
  {
    name: 'Shield',
    rarity: 'common',
    category: 'defense',
    copies: 3,
    emoji: '🛡️',
    shortDesc: 'One of your pieces cannot be captured this turn.',
    rulesText:
      "Choose one of your pieces. That piece cannot be captured until you next move it. The shield expires when the piece moves or after 2 full turns, whichever comes first.",
    requiresTarget: true,
    targetType: 'ownPiece',
  },
  {
    name: 'Extra Move',
    rarity: 'uncommon',
    category: 'movement',
    copies: 2,
    emoji: '⚡',
    shortDesc: 'Take an additional chess move this turn.',
    rulesText:
      "After making your normal chess move, you may make one additional chess move. The second move cannot be a capture. Cards cannot be played during the second move.",
    requiresTarget: false,
  },
  {
    name: 'Coup',
    rarity: 'rare',
    category: 'power',
    copies: 1,
    emoji: '💥',
    shortDesc: 'Remove any reachable opponent piece from the board.',
    rulesText:
      "Remove any one of your opponent's pieces (not the king) that is currently reachable by at least one of your pieces. The removed piece counts as captured. This uses your card play for this turn.",
    requiresTarget: true,
    targetType: 'oppPiece',
  },
  {
    name: 'Resurrection',
    rarity: 'uncommon',
    category: 'power',
    copies: 2,
    emoji: '✨',
    shortDesc: 'Return your most recently captured minor piece to the board.',
    rulesText:
      "Place your most recently captured non-pawn, non-king piece (N, B, or R) on any empty square in your back two ranks. If you have no eligible captured pieces, this card has no effect and is discarded.",
    requiresTarget: true,
    targetType: 'square',
  },
  {
    name: 'Teleport',
    rarity: 'uncommon',
    category: 'movement',
    copies: 2,
    emoji: '🌀',
    shortDesc: 'Move one of your pieces to any empty square.',
    rulesText:
      "Move any one of your pieces to any empty square on the board. This move cannot leave your king in check. The piece does not capture, and this is not a normal chess move.",
    requiresTarget: true,
    targetType: 'ownPiece',
  },
  {
    name: 'Pawn Storm',
    rarity: 'common',
    category: 'movement',
    copies: 3,
    emoji: '🌊',
    shortDesc: 'Advance all your pawns 1 square.',
    rulesText:
      "This is your entire move for the turn. Advance every one of your pawns forward one square, but only those that can legally move (not blocked). Pawns that would promote do so automatically (promoting to queen). This cannot leave your king in check.",
    requiresTarget: false,
  },
  {
    name: 'Promotion Rush',
    rarity: 'uncommon',
    category: 'movement',
    copies: 2,
    emoji: '🚀',
    shortDesc: 'Rush one pawn to the promotion rank.',
    rulesText:
      "Move one of your pawns to the square immediately before its promotion rank (rank 7 for white, rank 2 for black). If the pawn is already there, this card is wasted. The destination square must be empty.",
    requiresTarget: true,
    targetType: 'pawn',
  },
  {
    name: 'Ghost Step',
    rarity: 'uncommon',
    category: 'movement',
    copies: 2,
    emoji: '👻',
    shortDesc: 'One piece phases through all blocking pieces this turn.',
    rulesText:
      "Choose one of your pieces. On your next chess move, that piece may pass through all blocking pieces as if they weren't there. It cannot land on a friendly piece or leave your king in check.",
    requiresTarget: true,
    targetType: 'ownPiece',
  },
  {
    name: 'Swap',
    rarity: 'uncommon',
    category: 'movement',
    copies: 2,
    emoji: '🔄',
    shortDesc: 'Swap the positions of any two of your own pieces.',
    rulesText:
      "Swap the board positions of any two of your pieces. Neither resulting position may leave your king in check. Shields and frozen states follow the pieces to their new squares.",
    requiresTarget: true,
    targetType: 'ownPiece',
  },
  {
    name: 'Fortify',
    rarity: 'common',
    category: 'movement',
    copies: 3,
    emoji: '🏰',
    shortDesc: 'One pawn moves like a rook this turn.',
    rulesText:
      "Choose one of your pawns. On your next chess move, that pawn may move as if it were a rook. The move must still be legal and not leave your king in check. This expires after your move.",
    requiresTarget: true,
    targetType: 'pawn',
  },
  {
    name: 'Double Step',
    rarity: 'common',
    category: 'movement',
    copies: 3,
    emoji: '👟',
    shortDesc: 'Move any pawn exactly 2 squares forward.',
    rulesText:
      "Move one of your pawns exactly two squares forward, regardless of its current position. The destination square must be empty and both intervening and destination squares clear. Sets the en passant square correctly. Cannot capture with this card.",
    requiresTarget: true,
    targetType: 'pawn',
  },
  {
    name: 'Retreat',
    rarity: 'common',
    category: 'movement',
    copies: 3,
    emoji: '↩️',
    shortDesc: 'Move one of your pieces backward up to 2 squares.',
    rulesText:
      "Move any one of your pieces backward up to 2 squares along its normal movement axes. Pawns may retreat with this card (backward, toward your home rank). Cannot capture. Cannot leave king in check.",
    requiresTarget: true,
    targetType: 'ownPiece',
  },
  {
    name: 'Foul Ground',
    rarity: 'common',
    category: 'disruption',
    copies: 3,
    emoji: '⛔',
    shortDesc: "Your opponent cannot move to the chosen square next turn.",
    rulesText:
      "Choose any empty square. Your opponent cannot move any piece to that square on their next turn. The foul expires at the end of their turn.",
    requiresTarget: true,
    targetType: 'square',
  },
  {
    name: 'Disrupt',
    rarity: 'uncommon',
    category: 'disruption',
    copies: 2,
    emoji: '🎯',
    shortDesc: 'Force your opponent to move a specific piece type.',
    rulesText:
      "Name a piece type (pawn, knight, bishop, rook, or queen). Your opponent must move a piece of that type on their next turn, if they have a legal move with one. If they have no legal move with that piece type, this card has no effect.",
    requiresTarget: true,
    targetType: 'pieceType',
  },
  {
    name: 'Mirror',
    rarity: 'rare',
    category: 'chaos',
    copies: 1,
    emoji: '🪞',
    shortDesc: "Copy your opponent's last move with one of your own pieces.",
    rulesText:
      "Replay your opponent's last chess move using one of your pieces of the same type. If the exact destination is occupied, find the nearest legal alternative. If no mirroring is possible, the card is wasted and discarded.",
    requiresTarget: false,
  },
  {
    name: 'Trade',
    rarity: 'common',
    category: 'chaos',
    copies: 2,
    emoji: '🤝',
    shortDesc: 'Swap your weakest pawn with your opponent\'s weakest pawn.',
    rulesText:
      "Swap the position of your most-advanced pawn with your opponent's least-advanced pawn. If either side has no pawns, this card cannot be played. The swap cannot leave either king in check.",
    requiresTarget: false,
  },
  {
    name: 'Fog',
    rarity: 'uncommon',
    category: 'disruption',
    copies: 2,
    emoji: '🌫️',
    shortDesc: 'Your opponent must pre-declare their move before you move.',
    rulesText:
      "Your opponent must declare their intended next move before you make yours. In simulation mode this is a flavor effect only. The fog expires after their turn.",
    requiresTarget: false,
  },
  {
    name: 'Time Warp',
    rarity: 'rare',
    category: 'chaos',
    copies: 1,
    emoji: '⏪',
    shortDesc: 'Undo the last 2 plies (your last move + opponent\'s response).',
    rulesText:
      "Restore the board to the state before your last chess move and your opponent's response. You must then play a different chess move. This card returns to your hand after use. Can only be used once per game per player.",
    requiresTarget: false,
  },
];

export function buildDeck(overrides: Partial<CardDefinition>[] = []): CardDefinition[] {
  if (overrides.length === 0) return [...CARD_DEFINITIONS];
  return CARD_DEFINITIONS.map((def) => {
    const override = overrides.find((o) => o.name === def.name);
    return override ? { ...def, ...override } : def;
  });
}
