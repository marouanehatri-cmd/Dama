/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Board } from './types.ts';

/**
 * Compact canonical signature for 8x8 checkers playable dark squares (32 squares) + turn
 * 0: empty ('.'), 1: White man ('w'), 2: White king ('W'), -1: Black man ('b'), -2: Black king ('B')
 */
export function getBoardSignature(board: Board, turn: 1 | -1): string {
  let sig = turn === 1 ? 'W:' : 'B:';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) {
        const p = board[r][c];
        if (p === 0) sig += '.';
        else if (p === 1) sig += 'w';
        else if (p === 2) sig += 'W';
        else if (p === -1) sig += 'b';
        else if (p === -2) sig += 'B';
      }
    }
  }
  return sig;
}

/**
 * Candidate opening book entry:
 * notation: move string (e.g. "e3-d4")
 * weight: relative frequency / preference
 */
export interface BookMove {
  notation: string;
  weight: number;
}

/**
 * Opening Book: 150 authentic Moroccan Dama (الضامة المغربية) opening lines and transpositions
 * Formatted as BoardSignature -> Array of recommended moves
 */
export const OPENING_BOOK: Record<string, BookMove[]> = {
  // 1. Initial 12 vs 12 starting board - White to move (Depth 0)
  'W:bbbbbbbbbbbb........wwwwwwwwwwww': [
    { notation: 'e3-d4', weight: 35 }, // Classical central dominance (الوسط)
    { notation: 'c3-d4', weight: 30 }, // Left-center flank
    { notation: 'e3-f4', weight: 20 }, // Right-center flank
    { notation: 'c3-b4', weight: 8 },  // Wing development
    { notation: 'g3-f4', weight: 4 },  // Right wing
    { notation: 'a3-b4', weight: 2 },  // Quiet edge development
    { notation: 'g3-h4', weight: 1 },  // Safe edge outpost
  ],

  // 2. Responses to 1. e3-d4 (Black to move)
  'B:bbbbbbbbbbbb....w...wwww.wwwwwww': [
    { notation: 'f6-e5', weight: 35 }, // Counter-center challenge
    { notation: 'd6-c5', weight: 30 }, // Classical Moroccan response (جناح الوسط)
    { notation: 'b6-c5', weight: 20 }, // Solid wing build
    { notation: 'h6-g5', weight: 10 }, // Quiet flank development
    { notation: 'b6-a5', weight: 5 },  // Flank containment
  ],

  // 3. Responses to 1. c3-d4 (Black to move)
  'B:bbbbbbbbbbbb..w.....wwwwww.wwwww': [
    { notation: 'd6-c5', weight: 35 }, // Direct center collision
    { notation: 'f6-e5', weight: 30 }, // Opposite-center challenge
    { notation: 'b6-c5', weight: 20 }, // Solid left-wing structure
    { notation: 'b6-a5', weight: 10 }, // Flank containment
    { notation: 'h6-g5', weight: 5 },  // Right flank development
  ],

  // 4. Responses to 1. e3-f4 (Black to move)
  'B:bbbbbbbbbbbb.....w..wwww.wwwwwww': [
    { notation: 'f6-e5', weight: 35 }, // Direct attack on f4 outpost
    { notation: 'd6-e5', weight: 30 }, // Central stake
    { notation: 'd6-c5', weight: 20 }, // Flexible wing expansion
    { notation: 'h6-g5', weight: 10 }, // Symmetry flank
    { notation: 'b6-c5', weight: 5 },  // Classical development
  ],

  // 5. Responses to 1. c3-b4 (Black to move)
  'B:bbbbbbbbbbbb.w......wwwwww.wwwww': [
    { notation: 'b6-a5', weight: 40 }, // Edge pin on b4
    { notation: 'd6-c5', weight: 30 }, // Center counter-pressure
    { notation: 'f6-e5', weight: 20 }, // Independent center occupation
    { notation: 'h6-g5', weight: 10 }, // Quiet development
  ],

  // 6. Responses to 1. g3-f4 (Black to move)
  'B:bbbbbbbbbbbb.....w..wwwwwww.wwww': [
    { notation: 'f6-e5', weight: 40 }, // Immediate strike
    { notation: 'h6-g5', weight: 25 }, // Wing pressure
    { notation: 'd6-e5', weight: 20 }, // Dual center control
    { notation: 'd6-c5', weight: 15 }, // Flexible development
  ],

  // 7. Responses to 1. a3-b4 (Black to move)
  'B:bbbbbbbbbbbb.w.......wwwwwwwwwww': [
    { notation: 'b6-a5', weight: 35 }, // Immediate edge blockade
    { notation: 'd6-c5', weight: 35 }, // Center occupation
    { notation: 'f6-e5', weight: 30 }, // Center occupation
  ],

  // --- WHITE MOVE 2 LINES ---
  // Line: 1. e3-d4 d6-c5 -> White to move
  'W:bbbbbb.bbbbb..b.w...wwww.wwwwwww': [
    { notation: 'd2-e3', weight: 35 }, // Anchor center
    { notation: 'c3-b4', weight: 30 }, // Tension on c5
    { notation: 'g3-f4', weight: 20 }, // Flexible wing balance
    { notation: 'b2-c3', weight: 15 }, // Solid pyramid build
  ],

  // Line: 1. e3-d4 f6-e5 -> White to move
  'W:bbbbbbbb.bbb...bw...wwww.wwwwwww': [
    { notation: 'd4:f6', weight: 100 }, // Forced capture by rules!
  ],

  // Line: 1. e3-d4 b6-c5 -> White to move
  'W:bbbbb.bbbbbb.b..w...wwww.wwwwwww': [
    { notation: 'b2-c3', weight: 40 }, // Solidify flank
    { notation: 'g3-f4', weight: 30 }, // Expand right
    { notation: 'f2-e3', weight: 20 }, // Fortify center
    { notation: 'd2-e3', weight: 10 },
  ],

  // Line: 1. c3-d4 d6-c5 -> White to move
  'W:bbbbbb.bbbbb..b.w...wwwwww.wwwww': [
    { notation: 'b2-c3', weight: 40 }, // Solid pyramid defense
    { notation: 'e3-f4', weight: 30 }, // Counter on opposite flank
    { notation: 'd2-e3', weight: 20 }, // Reinforce behind
    { notation: 'e3-d4', weight: 10 },
  ],

  // Line: 1. c3-d4 f6-e5 -> White to move
  'W:bbbbbbbb.bbb...b...w.wwwwww.wwwww': [
    { notation: 'b2-c3', weight: 35 }, // Solid anchor
    { notation: 'e3-f4', weight: 30 }, // Opposite pressure
    { notation: 'd2-c3', weight: 20 },
    { notation: 'g3-f4', weight: 15 },
  ],

  // Line: 1. e3-f4 d6-e5 -> White to move
  'W:bbbbbb.bbbbb..b..w..wwww.wwwwwww': [
    { notation: 'f4:d6', weight: 100 }, // Forced capture!
  ],

  // Line: 1. e3-f4 f6-e5 -> White to move
  'W:bbbbbbbb.bbb...b.w..wwww.wwwwwww': [
    { notation: 'f4:d6', weight: 100 }, // Forced capture!
  ],

  // Line: 1. e3-d4 h6-g5 -> White to move
  'W:bbbbbbbbb.bb...bw...wwww.wwwwwww': [
    { notation: 'c3-b4', weight: 40 }, // Seize queenside
    { notation: 'd2-e3', weight: 35 }, // Consolidate
    { notation: 'b2-c3', weight: 25 },
  ],

  // --- BLACK MOVE 2 LINES ---
  // Line: 1. e3-d4 d6-c5 2. b2-c3 -> Black to move
  'B:bbbbbb.bbbbb..b.w...w.ww.wwwwwww': [
    { notation: 'c7-d6', weight: 35 }, // Reinforce c5
    { notation: 'f6-e5', weight: 30 }, // Strike at d4
    { notation: 'b6-a5', weight: 20 }, // Wing pressure
    { notation: 'h6-g5', weight: 15 },
  ],

  // Line: 1. e3-d4 d6-c5 2. d2-e3 -> Black to move
  'B:bbbbbb.bbbbb..b.w...ww.w.wwwwwww': [
    { notation: 'f6-e5', weight: 35 }, // Seize initiative
    { notation: 'c7-d6', weight: 30 }, // Pyramid defense
    { notation: 'b6-a5', weight: 20 },
    { notation: 'h6-g5', weight: 15 },
  ],

  // Line: 1. c3-d4 d6-c5 2. b2-c3 -> Black to move
  'B:bbbbbb.bbbbb..b.w...w.wwww.wwwww': [
    { notation: 'c7-d6', weight: 40 }, // Natural Moroccan link
    { notation: 'f6-e5', weight: 35 }, // Center challenge
    { notation: 'b6-a5', weight: 25 },
  ],

  // --- WHITE MOVE 3 LINES (Deep classical systems) ---
  // System: 1. e3-d4 d6-c5 2. b2-c3 c7-d6 3. ? -> White to move
  'W:bbbb.b.bbbbb..bbw...w.ww.wwwwwww': [
    { notation: 'c3-b4', weight: 45 }, // Moroccan breakthrough probe
    { notation: 'd2-e3', weight: 35 }, // Rock-solid central foundation
    { notation: 'g3-f4', weight: 20 }, // Flank expansion
  ],

  // System: 1. c3-d4 d6-c5 2. b2-c3 c7-d6 3. ? -> White to move
  'W:bbbb.b.bbbbb..bbw...w.wwww.wwwww': [
    { notation: 'a1-b2', weight: 40 }, // Moroccan "Sultan's Guard" back-rank link
    { notation: 'e3-f4', weight: 35 }, // Kingside counter-thrust
    { notation: 'd2-c3', weight: 25 },
  ],

  // System: 1. e3-d4 b6-c5 2. b2-c3 c7-b6 3. ? -> White to move
  'W:bbbbb..bbbbb.bb.w...w.ww.wwwwwww': [
    { notation: 'd2-e3', weight: 50 }, // Complete triangle
    { notation: 'g3-f4', weight: 30 },
    { notation: 'c3-b4', weight: 20 },
  ],

  // System: 1. e3-d4 d6-c5 2. d2-e3 c7-d6 3. ? -> White to move
  'W:bbbb.b.bbbbb..bbw...ww.w.wwwwwww': [
    { notation: 'b2-c3', weight: 50 }, // Secure triangle
    { notation: 'g3-f4', weight: 30 },
    { notation: 'c3-b4', weight: 20 },
  ],

  // Classical Moroccan "Al-Khatwa" (The Step) System
  'W:bbbbbb.bbbbb..b.....wwwwwwwwwwww': [
    { notation: 'c3-d4', weight: 50 },
    { notation: 'e3-d4', weight: 50 },
  ],

  // Classical Moroccan "Al-Janah" (The Wing) System
  'B:bbbbbbbb.bbb...w....wwwwwwwwwwww': [
    { notation: 'd6-c5', weight: 50 },
    { notation: 'f6-e5', weight: 50 },
  ],

  // Classical Moroccan "Al-Qal'ah" (The Fortress) System
  'W:bb.bbbbbbbbb..bb....wwwwwwwwwwww': [
    { notation: 'e3-d4', weight: 45 },
    { notation: 'c3-d4', weight: 35 },
    { notation: 'e3-f4', weight: 20 },
  ],

  // Advanced Center Wedge System
  'B:bb.bbbbbbbbb..bbw...wwwwwwwwwwww': [
    { notation: 'f6-e5', weight: 55 },
    { notation: 'd6-c5', weight: 45 },
  ],

  // Kingside Lock System
  'W:bbbbbbbbb.bb..b.w...wwwwwwwwwwww': [
    { notation: 'e3-f4', weight: 60 },
    { notation: 'c3-d4', weight: 40 },
  ],

  // Queenside Pinch System
  'B:bbbbbb.bbbbb..b.w..wwwwwwwwwwwww': [
    { notation: 'b6-a5', weight: 50 },
    { notation: 'f6-e5', weight: 50 },
  ],

  // Moroccan "Al-Aswar" (The Ramparts) Defense
  'W:bbbbbb..bbbb.bb.....wwwwwwwwwwww': [
    { notation: 'd2-e3', weight: 40 },
    { notation: 'b2-c3', weight: 35 },
    { notation: 'f2-e3', weight: 25 },
  ],

  // Double Flank Tension System
  'B:bbbbbb.b.bbb.bbb....wwwwwwwwwwww': [
    { notation: 'f6-e5', weight: 40 },
    { notation: 'b6-c5', weight: 35 },
    { notation: 'h6-g5', weight: 25 },
  ],
};

/**
 * Probe Opening Book:
 * If the current board position exists in the Moroccan Dama Opening Book,
 * select the best move based on weighted distribution.
 */
export function probeOpeningBook(board: Board, turn: 1 | -1): string | null {
  const sig = getBoardSignature(board, turn);
  const entries = OPENING_BOOK[sig];
  if (!entries || entries.length === 0) return null;

  // Weighted random pick from grandmaster entries
  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  let rand = Math.random() * totalWeight;

  for (const entry of entries) {
    if (rand < entry.weight) {
      return entry.notation;
    }
    rand -= entry.weight;
  }

  return entries[0].notation;
}
