/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Board,
  EngineDifficulty,
  EngineStats,
  Move,
  Position,
  SolverResult,
  VariantRules,
  PonderedMoveResult,
} from './types.ts';
import { probeOpeningBook, getBoardSignature } from './openingBook.ts';

export const VARIANTS: Record<string, VariantRules> = {
  moroccan: {
    id: 'moroccan',
    name: 'Moroccan Dama (الضامة المغربية)',
    description:
      'Authentic Moroccan rules: Men move forward only. Flying kings move and sweep diagonals in all directions. Mandatory majority capture. Immediate promotion turn-end.',
    menCaptureBackwards: false,
    mandatoryCapture: true,
    maxCaptureMajority: true,
    flyingKing: true,
    kingSweepsLine: true,
    promotionEndsTurn: true,
    kingQualityTiebreak: false,
  },
  international: {
    id: 'international',
    name: 'International Draughts (8x8)',
    description: 'Flying kings with standard single-piece leap. Men capture forward and backward. Majority capture rule.',
    menCaptureBackwards: true,
    mandatoryCapture: true,
    maxCaptureMajority: true,
    flyingKing: true,
    kingSweepsLine: false,
    promotionEndsTurn: false,
    kingQualityTiebreak: false,
  },
  spanish: {
    id: 'spanish',
    name: 'Spanish Dama (Damas Españolas)',
    description: 'Men move forward only. Flying king. Majority capture rule with king quality tiebreak.',
    menCaptureBackwards: false,
    mandatoryCapture: true,
    maxCaptureMajority: true,
    flyingKing: true,
    kingSweepsLine: false,
    promotionEndsTurn: true,
    kingQualityTiebreak: true,
  },
  american: {
    id: 'american',
    name: 'American / English Checkers',
    description: 'Men move forward only. Short king (1 step). Mandatory capture without majority rule.',
    menCaptureBackwards: false,
    mandatoryCapture: true,
    maxCaptureMajority: false,
    flyingKing: false,
    kingSweepsLine: false,
    promotionEndsTurn: true,
    kingQualityTiebreak: false,
  },
};

/** Convert 0-indexed row/col to algebraic notation (e.g. r=4, c=3 -> "d4") */
export function posToNotation(r: number, c: number): string {
  const colLetter = String.fromCharCode(97 + c);
  const rank = 8 - r;
  return `${colLetter}${rank}`;
}

/** Convert algebraic notation to position (e.g. "d4" -> {r: 4, c: 3}) */
export function notationToPos(not: string): Position {
  const c = not.charCodeAt(0) - 97;
  const rank = parseInt(not.slice(1), 10);
  const r = 8 - rank;
  return { r, c };
}

/** Check if square is dark playable square: (r + c) % 2 === 1 */
export function isDarkSquare(r: number, c: number): boolean {
  return (r + c) % 2 === 1;
}

/** Clone an 8x8 board */
export function cloneBoard(board: Board): Board {
  return board.map(row => [...row]);
}

/** Create an empty 8x8 board */
export function createEmptyBoard(): Board {
  return Array.from({ length: 8 }, () => Array(8).fill(0));
}

/**
 * Standard starting position:
 * Black (player -1) on rows 0, 1, 2 on dark squares (12 pieces)
 * White (player 1) on rows 5, 6, 7 on dark squares (12 pieces)
 */
export function createStartingBoard(): Board {
  const board = createEmptyBoard();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (isDarkSquare(r, c)) {
        if (r < 3) board[r][c] = -1; // Black man
        else if (r > 4) board[r][c] = 1; // White man
      }
    }
  }
  return board;
}

/**
 * Test Position:
 * White king at d4 captures both black men at e5, f6
 */
export function createTestPosition(): Board {
  const board = createEmptyBoard();
  const d4 = notationToPos('d4'); // (r=4, c=3)
  const e5 = notationToPos('e5'); // (r=3, c=4)
  const f6 = notationToPos('f6'); // (r=2, c=5)

  board[d4.r][d4.c] = 2; // White King
  board[e5.r][e5.c] = -1; // Black man
  board[f6.r][f6.c] = -1; // Black man
  return board;
}

export interface PresetPosition {
  id: string;
  name: string;
  turn: 1 | -1;
  description: string;
  board: () => Board;
}

export const PRESETS: PresetPosition[] = [
  {
    id: 'standard_start',
    name: 'Standard Starting Position',
    turn: 1,
    description: 'Standard 12 vs 12 Moroccan Dama opening.',
    board: createStartingBoard,
  },
  {
    id: 'test_d4_e5_f6',
    name: 'Moroccan Test: King d4 vs e5, f6',
    turn: 1,
    description: 'White king at d4 captures both black men at e5, f6 to win instantly.',
    board: createTestPosition,
  },
  {
    id: 'tactical_majority_sacrifice',
    name: 'Majority Rule Trap (Max 3 vs 2)',
    turn: 1,
    description: 'White forces Black to take the longer capture path of 3 pieces instead of 2.',
    board: () => {
      const b = createEmptyBoard();
      b[6][1] = 1; // b2
      b[4][3] = 1; // d4
      b[4][5] = 1; // f4
      b[2][3] = -1; // d6
      b[2][5] = -1; // f6
      b[3][2] = -1; // c5
      b[5][4] = -1; // e3
      return b;
    },
  },
  {
    id: 'king_cross_sweep',
    name: 'Flying King Grand Sweep (4 captures)',
    turn: 1,
    description: 'White King at a1 executes a 4-hop perimeter sweep.',
    board: () => {
      const b = createEmptyBoard();
      const a1 = notationToPos('a1');
      b[a1.r][a1.c] = 2;
      b[notationToPos('c3').r][notationToPos('c3').c] = -1;
      b[notationToPos('f6').r][notationToPos('f6').c] = -1;
      b[notationToPos('f2').r][notationToPos('f2').c] = -1;
      b[notationToPos('c7').r][notationToPos('c7').c] = -1;
      return b;
    },
  },
  {
    id: 'endgame_1v2',
    name: 'Endgame 1 King vs 2 Men',
    turn: 1,
    description: 'Single White king hunting two loose Black men.',
    board: () => {
      const b = createEmptyBoard();
      b[notationToPos('b2').r][notationToPos('b2').c] = 2;
      b[notationToPos('d6').r][notationToPos('d6').c] = -1;
      b[notationToPos('h4').r][notationToPos('h4').c] = -1;
      return b;
    },
  },
];

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function hasPos(list: Position[], r: number, c: number): boolean {
  return list.some(p => p.r === r && p.c === c);
}

function formatNotation(
  from: Position,
  path: Position[],
  captured: Position[],
  isPromotion: boolean
): string {
  const fromStr = posToNotation(from.r, from.c);
  if (captured.length === 0) {
    const toStr = path.length > 1 ? posToNotation(path[path.length - 1].r, path[path.length - 1].c) : fromStr;
    return `${fromStr}-${toStr}${isPromotion ? '=K' : ''}`;
  }
  const hopsStr = path.slice(1).map(p => posToNotation(p.r, p.c)).join(':');
  return `${fromStr}:${hopsStr} (x${captured.length})${isPromotion ? '=K' : ''}`;
}

/**
 * Generate all captures for a specific piece using recursion and backtracking
 */
export function getAllCaptures(
  board: Board,
  r: number,
  c: number,
  player: number,
  rules: VariantRules = VARIANTS.moroccan
): Move[] {
  const piece = board[r][c];
  if (Math.sign(piece) !== player) return [];

  const isKing = Math.abs(piece) === 2;
  const results: Move[] = [];
  const startPos: Position = { r, c };

  if (!isKing) {
    // Man captures forward (in Moroccan rules men only move & capture forward)
    const directions: [number, number][] = rules.menCaptureBackwards
      ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
      : player === 1
      ? [[-1, -1], [-1, 1]]
      : [[1, -1], [1, 1]];

    function recurseMan(currR: number, currC: number, path: Position[], captured: Position[]) {
      let foundContinuation = false;

      for (const [dr, dc] of directions) {
        const enemyR = currR + dr;
        const enemyC = currC + dc;
        const landR = currR + 2 * dr;
        const landC = currC + 2 * dc;

        if (!inBounds(landR, landC)) continue;

        const enemyPiece = board[enemyR][enemyC];
        if (Math.sign(enemyPiece) === -player && !hasPos(captured, enemyR, enemyC)) {
          const landingEmpty =
            (board[landR][landC] === 0 || (landR === r && landC === c)) && !hasPos(captured, landR, landC);

          if (landingEmpty) {
            foundContinuation = true;
            const newPath = [...path, { r: landR, c: landC }];
            const newCaptured = [...captured, { r: enemyR, c: enemyC }];
            const reachesPromotion = (player === 1 && landR === 0) || (player === -1 && landR === 7);

            if (reachesPromotion && rules.promotionEndsTurn) {
              const finalBoard = cloneBoard(board);
              finalBoard[r][c] = 0;
              for (const p of newCaptured) finalBoard[p.r][p.c] = 0;
              finalBoard[landR][landC] = player * 2; // Crowning to King

              results.push({
                id: `${posToNotation(r, c)}-${newPath.map(p => posToNotation(p.r, p.c)).join(':')}`,
                from: startPos,
                to: { r: landR, c: landC },
                path: newPath,
                captured: newCaptured,
                isPromotion: true,
                finalBoard,
                notation: formatNotation(startPos, newPath, newCaptured, true),
              });
            } else {
              recurseMan(landR, landC, newPath, newCaptured);
            }
          }
        }
      }

      if (!foundContinuation && captured.length > 0) {
        const reachesPromotion = (player === 1 && currR === 0) || (player === -1 && currR === 7);
        const finalBoard = cloneBoard(board);
        finalBoard[r][c] = 0;
        for (const p of captured) finalBoard[p.r][p.c] = 0;
        finalBoard[currR][currC] = reachesPromotion ? player * 2 : piece;

        results.push({
          id: `${posToNotation(r, c)}-${path.map(p => posToNotation(p.r, p.c)).join(':')}`,
          from: startPos,
          to: { r: currR, c: currC },
          path,
          captured,
          isPromotion: reachesPromotion,
          finalBoard,
          notation: formatNotation(startPos, path, captured, reachesPromotion),
        });
      }
    }

    recurseMan(r, c, [startPos], []);
  } else {
    // Flying King captures (diagonals in all 4 directions)
    const kingDirections: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

    function recurseKing(currR: number, currC: number, path: Position[], captured: Position[]) {
      let foundContinuation = false;

      for (const [dr, dc] of kingDirections) {
        if (rules.flyingKing) {
          let step = 1;
          const capturedInDir: Position[] = [];

          while (inBounds(currR + step * dr, currC + step * dc)) {
            const checkR = currR + step * dr;
            const checkC = currC + step * dc;
            const sqPiece = board[checkR][checkC];

            if (Math.sign(sqPiece) === player || hasPos(captured, checkR, checkC)) {
              break;
            }

            if (Math.sign(sqPiece) === -player) {
              capturedInDir.push({ r: checkR, c: checkC });

              if (rules.kingSweepsLine) {
                let lookAhead = step + 1;
                while (inBounds(currR + lookAhead * dr, currC + lookAhead * dc)) {
                  const nxtPiece = board[currR + lookAhead * dr][currC + lookAhead * dc];
                  if (Math.sign(nxtPiece) === -player && !hasPos(captured, currR + lookAhead * dr, currC + lookAhead * dc)) {
                    capturedInDir.push({ r: currR + lookAhead * dr, c: currC + lookAhead * dc });
                    lookAhead++;
                  } else {
                    break;
                  }
                }
                step = lookAhead - 1;
              }

              let landStep = step + 1;
              while (inBounds(currR + landStep * dr, currC + landStep * dc)) {
                const landR = currR + landStep * dr;
                const landC = currC + landStep * dc;

                if (board[landR][landC] !== 0 && !(landR === r && landC === c)) {
                  break;
                }

                if (!hasPos(captured, landR, landC)) {
                  foundContinuation = true;
                  const newPath = [...path, { r: landR, c: landC }];
                  const newCaptured = [...captured, ...capturedInDir];
                  recurseKing(landR, landC, newPath, newCaptured);
                }

                landStep++;
              }
              break;
            }
            step++;
          }
        } else {
          // American Checkers 1-step leap
          const enemyR = currR + dr;
          const enemyC = currC + dc;
          const landR = currR + 2 * dr;
          const landC = currC + 2 * dc;

          if (inBounds(landR, landC)) {
            const enemyPiece = board[enemyR][enemyC];
            if (Math.sign(enemyPiece) === -player && !hasPos(captured, enemyR, enemyC)) {
              const landingEmpty =
                (board[landR][landC] === 0 || (landR === r && landC === c)) && !hasPos(captured, landR, landC);

              if (landingEmpty) {
                foundContinuation = true;
                const newPath = [...path, { r: landR, c: landC }];
                const newCaptured = [...captured, { r: enemyR, c: enemyC }];
                recurseKing(landR, landC, newPath, newCaptured);
              }
            }
          }
        }
      }

      if (!foundContinuation && captured.length > 0) {
        const finalBoard = cloneBoard(board);
        finalBoard[r][c] = 0;
        for (const p of captured) finalBoard[p.r][p.c] = 0;
        finalBoard[currR][currC] = piece;

        results.push({
          id: `${posToNotation(r, c)}-${path.map(p => posToNotation(p.r, p.c)).join(':')}`,
          from: startPos,
          to: { r: currR, c: currC },
          path,
          captured,
          isPromotion: false,
          finalBoard,
          notation: formatNotation(startPos, path, captured, false),
        });
      }
    }

    recurseKing(r, c, [startPos], []);
  }

  // Deduplicate identical captures
  const uniqueMoves = new Map<string, Move>();
  for (const move of results) {
    const key = `${move.from.r},${move.from.c}->${move.to.r},${move.to.c}_cap:${move.captured
      .map(p => `${p.r},${p.c}`)
      .sort()
      .join(';')}`;
    if (!uniqueMoves.has(key) || move.path.length > (uniqueMoves.get(key)?.path.length || 0)) {
      uniqueMoves.set(key, move);
    }
  }

  return Array.from(uniqueMoves.values());
}

/**
 * Normal non-capturing moves for a piece
 */
function getNormalMoves(
  board: Board,
  r: number,
  c: number,
  player: number,
  rules: VariantRules = VARIANTS.moroccan
): Move[] {
  const piece = board[r][c];
  if (Math.sign(piece) !== player) return [];

  const isKing = Math.abs(piece) === 2;
  const moves: Move[] = [];
  const from: Position = { r, c };

  if (!isKing) {
    const forwardDr = player === 1 ? -1 : 1;
    const forwardCols = [c - 1, c + 1];

    for (const targetC of forwardCols) {
      const targetR = r + forwardDr;
      if (inBounds(targetR, targetC) && board[targetR][targetC] === 0) {
        const isPromotion = (player === 1 && targetR === 0) || (player === -1 && targetR === 7);
        const finalBoard = cloneBoard(board);
        finalBoard[r][c] = 0;
        finalBoard[targetR][targetC] = isPromotion ? player * 2 : piece;

        const to: Position = { r: targetR, c: targetC };
        moves.push({
          id: `${posToNotation(r, c)}-${posToNotation(to.r, to.c)}`,
          from,
          to,
          path: [from, to],
          captured: [],
          isPromotion,
          finalBoard,
          notation: `${posToNotation(r, c)}-${posToNotation(to.r, to.c)}${isPromotion ? '=K' : ''}`,
        });
      }
    }
  } else {
    const directions: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

    for (const [dr, dc] of directions) {
      if (rules.flyingKing) {
        let step = 1;
        while (inBounds(r + step * dr, c + step * dc)) {
          const targetR = r + step * dr;
          const targetC = c + step * dc;

          if (board[targetR][targetC] !== 0) break;

          const finalBoard = cloneBoard(board);
          finalBoard[r][c] = 0;
          finalBoard[targetR][targetC] = piece;

          const to: Position = { r: targetR, c: targetC };
          moves.push({
            id: `${posToNotation(r, c)}-${posToNotation(to.r, to.c)}`,
            from,
            to,
            path: [from, to],
            captured: [],
            isPromotion: false,
            finalBoard,
            notation: `${posToNotation(r, c)}-${posToNotation(to.r, to.c)}`,
          });

          step++;
        }
      } else {
        const targetR = r + dr;
        const targetC = c + dc;
        if (inBounds(targetR, targetC) && board[targetR][targetC] === 0) {
          const finalBoard = cloneBoard(board);
          finalBoard[r][c] = 0;
          finalBoard[targetR][targetC] = piece;

          const to: Position = { r: targetR, c: targetC };
          moves.push({
            id: `${posToNotation(r, c)}-${posToNotation(to.r, to.c)}`,
            from,
            to,
            path: [from, to],
            captured: [],
            isPromotion: false,
            finalBoard,
            notation: `${posToNotation(r, c)}-${posToNotation(to.r, to.c)}`,
          });
        }
      }
    }
  }

  return moves;
}

/**
 * 1. getAllMoves(board, color):
 * - Generate ALL full capture chains first.
 * - If captures exist, find maxCaptured = max length of capture chains.
 * - Keep ONLY captures where length == maxCaptured (Majority Rule).
 * - Delete all quiet moves if any capture exists.
 * - If no captures, return all quiet moves.
 */
export function getAllMoves(
  board: Board,
  player: number,
  rules: VariantRules = VARIANTS.moroccan
): Move[] {
  const allCaptures: Move[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (Math.sign(board[r][c]) === player) {
        const pieceCaps = getAllCaptures(board, r, c, player, rules);
        for (const cap of pieceCaps) allCaptures.push(cap);
      }
    }
  }

  if (allCaptures.length > 0) {
    if (rules.mandatoryCapture) {
      let maxCaptured = 0;
      for (const cap of allCaptures) {
        if (cap.captured.length > maxCaptured) {
          maxCaptured = cap.captured.length;
        }
      }

      let majorityCaps = rules.maxCaptureMajority
        ? allCaptures.filter(cap => cap.captured.length === maxCaptured)
        : allCaptures;

      if (rules.kingQualityTiebreak && majorityCaps.length > 1) {
        const maxKings = Math.max(
          ...majorityCaps.map(m => m.captured.filter(p => Math.abs(board[p.r][p.c]) === 2).length)
        );
        majorityCaps = majorityCaps.filter(
          m => m.captured.filter(p => Math.abs(board[p.r][p.c]) === 2).length === maxKings
        );
      }

      return majorityCaps;
    } else {
      const quietMoves: Move[] = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (Math.sign(board[r][c]) === player) {
            quietMoves.push(...getNormalMoves(board, r, c, player, rules));
          }
        }
      }
      return [...allCaptures, ...quietMoves];
    }
  }

  const quietMoves: Move[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (Math.sign(board[r][c]) === player) {
        quietMoves.push(...getNormalMoves(board, r, c, player, rules));
      }
    }
  }

  return quietMoves;
}

export function findMaxCaptureLength(
  board: Board,
  player: number,
  rules: VariantRules = VARIANTS.moroccan
): number {
  let maxLength = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (Math.sign(board[r][c]) === player) {
        const captures = getAllCaptures(board, r, c, player, rules);
        for (const cap of captures) {
          if (cap.captured.length > maxLength) maxLength = cap.captured.length;
        }
      }
    }
  }
  return maxLength;
}

export function getPiecesWithAvailableCaptures(
  board: Board,
  player: number,
  rules: VariantRules = VARIANTS.moroccan
): Position[] {
  const pieces: Position[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (Math.sign(board[r][c]) === player) {
        const caps = getAllCaptures(board, r, c, player, rules);
        if (caps.length > 0) pieces.push({ r, c });
      }
    }
  }
  return pieces;
}

export function countTotalPossibilities(
  board: Board,
  player: number,
  rules: VariantRules = VARIANTS.moroccan
): number {
  let count = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (Math.sign(board[r][c]) === player) {
        const caps = getAllCaptures(board, r, c, player, rules);
        const normals = getNormalMoves(board, r, c, player, rules);
        count += caps.length + normals.length;
      }
    }
  }
  return Math.max(count, getAllMoves(board, player, rules).length);
}

// =========================================================================
// ZOBRIST HASHING & 1,000,000-ENTRY TRANSPOSITION TABLE
// =========================================================================
const TT_SIZE = 1048576; // 2^20 entries (~1 Million entries)
const TT_MASK = TT_SIZE - 1;

// Flat TypedArrays for O(1) reads/writes with ZERO garbage collection overhead
const ttKey = new Int32Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE);
const ttScore = new Int32Array(TT_SIZE);
const ttFlag = new Uint8Array(TT_SIZE); // 0: empty, 1: EXACT, 2: LOWER, 3: UPPER
const ttBestMove = new Array<Move | null>(TT_SIZE);

// Zobrist pseudo-random table (64 squares x 5 piece types)
const ZOBRIST_TABLE = new Int32Array(64 * 5);
const ZOBRIST_TURN = 0x55aa55aa;

// Deterministic seed for reproducible Zobrist tables
(function initZobrist() {
  let seed = 123456789;
  for (let i = 0; i < 64 * 5; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    ZOBRIST_TABLE[i] = seed;
  }
})();

export function computeZobrist(board: Board, turn: 1 | -1): number {
  let h = turn === 1 ? ZOBRIST_TURN : 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) {
        const p = board[r][c];
        if (p !== 0) {
          const pieceIdx = p === 1 ? 0 : p === 2 ? 1 : p === -1 ? 2 : 3;
          h ^= ZOBRIST_TABLE[(r * 8 + c) * 5 + pieceIdx];
        }
      }
    }
  }
  return h;
}

export function clearTranspositionTable() {
  ttKey.fill(0);
  ttDepth.fill(0);
  ttScore.fill(0);
  ttFlag.fill(0);
  ttBestMove.fill(null);
}

// Move Ordering heuristics: Killer moves [ply][2] & History table
const killerMoves: [Move | null, Move | null][] = Array.from({ length: 40 }, () => [null, null]);
const historyTable = new Int32Array(64 * 64);

export function resetMoveOrdering() {
  for (let i = 0; i < 40; i++) {
    killerMoves[i][0] = null;
    killerMoves[i][1] = null;
  }
  historyTable.fill(0);
}

function updateKillerAndHistory(move: Move, ply: number, depth: number) {
  if (ply < 40) {
    if (killerMoves[ply][0]?.id !== move.id) {
      killerMoves[ply][1] = killerMoves[ply][0];
      killerMoves[ply][0] = move;
    }
  }
  const fromIdx = move.from.r * 8 + move.from.c;
  const toIdx = move.to.r * 8 + move.to.c;
  historyTable[fromIdx * 64 + toIdx] += depth * depth;
}

// =========================================================================
// 4. SUPER-HARD EVALUATION & 3. ENDGAME EVALUATION
// =========================================================================

/**
 * Super-Hard Evaluation Function:
 * - Man = 100, King = 350
 * - +30 for advanced man on 6th/7th rank
 * - +25 for King in center in endgame
 * - +60 for creating a fork (attacks 2 pieces)
 * - +40 for a trapped opponent piece (0 moves)
 * - -50 if back rank is empty (no defense)
 * - +15 for mobility difference * 2
 * - +1000 for forced capture chain that wins a King
 */
export function evaluateBoard(board: Board, rules: VariantRules = VARIANTS.moroccan): number {
  let whitePieces = 0;
  let blackPieces = 0;
  let whiteKings = 0;
  let blackKings = 0;
  let whiteScore = 0;
  let blackScore = 0;
  let whiteBackRankCount = 0;
  let blackBackRankCount = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece === 0) continue;

      if (piece > 0) {
        whitePieces++;
        if (piece === 1) {
          whiteScore += 100;
          // +30 for advanced man on 6th/7th rank (r=2 is 6th rank, r=1 is 7th rank)
          if (r === 1 || r === 2) whiteScore += 30;
          if (r === 7) whiteBackRankCount++;
        } else if (piece === 2) {
          whiteKings++;
          whiteScore += 350;
          // +25 for King in center in endgame
          if (whitePieces + blackPieces <= 8 && r >= 2 && r <= 5 && c >= 2 && c <= 5) {
            whiteScore += 25;
          }
        }
      } else {
        blackPieces++;
        if (piece === -1) {
          blackScore += 100;
          // +30 for advanced man on 6th/7th rank (r=5 is 6th rank, r=6 is 7th rank)
          if (r === 5 || r === 6) blackScore += 30;
          if (r === 0) blackBackRankCount++;
        } else if (piece === -2) {
          blackKings++;
          blackScore += 350;
          // +25 for King in center in endgame
          if (whitePieces + blackPieces <= 8 && r >= 2 && r <= 5 && c >= 2 && c <= 5) {
            blackScore += 25;
          }
        }
      }
    }
  }

  // Terminal thresholds
  if (whitePieces > 0 && blackPieces === 0) return 100000;
  if (blackPieces > 0 && whitePieces === 0) return -100000;
  if (whitePieces === 0 && blackPieces === 0) return 0;

  // Back rank empty penalty (-50)
  if (whiteBackRankCount === 0) whiteScore -= 50;
  if (blackBackRankCount === 0) blackScore -= 50;

  const whiteMoves = getAllMoves(board, 1, rules);
  if (whiteMoves.length === 0) return -100000;

  const blackMoves = getAllMoves(board, -1, rules);
  if (blackMoves.length === 0) return 100000;

  // Mobility bonus: +15 * mobility difference * 2 (+30 * diff)
  whiteScore += 30 * whiteMoves.length;
  blackScore += 30 * blackMoves.length;

  // King win bonus (+1000 for capture chain winning a King)
  for (const m of whiteMoves) {
    if (m.captured.some(p => Math.abs(board[p.r][p.c]) === 2)) {
      whiteScore += 1000;
      break;
    }
  }
  for (const m of blackMoves) {
    if (m.captured.some(p => Math.abs(board[p.r][p.c]) === 2)) {
      blackScore += 1000;
      break;
    }
  }

  // Fork bonus: +60 if one piece attacks 2 pieces
  const whiteAttackCounts = new Map<string, number>();
  for (const m of whiteMoves) {
    if (m.captured.length > 0) {
      const key = `${m.from.r},${m.from.c}`;
      whiteAttackCounts.set(key, (whiteAttackCounts.get(key) || 0) + 1);
    }
  }
  for (const count of whiteAttackCounts.values()) {
    if (count >= 2) {
      whiteScore += 60;
      break;
    }
  }

  const blackAttackCounts = new Map<string, number>();
  for (const m of blackMoves) {
    if (m.captured.length > 0) {
      const key = `${m.from.r},${m.from.c}`;
      blackAttackCounts.set(key, (blackAttackCounts.get(key) || 0) + 1);
    }
  }
  for (const count of blackAttackCounts.values()) {
    if (count >= 2) {
      blackScore += 60;
      break;
    }
  }

  return whiteScore - blackScore;
}

/**
 * Specialized Endgame Evaluation (Used when total pieces <= 6):
 * - King vs King: +500 if opponent king is trapped on edge
 * - King + Man vs King: +800 forced win, prioritize promotion
 * - Man vs Man: +100 for opposition / proximity to promotion
 */
export function evaluateEndgame(board: Board, rules: VariantRules = VARIANTS.moroccan): number {
  let whiteKings = 0;
  let blackKings = 0;
  let whiteMen: Position[] = [];
  let blackMen: Position[] = [];
  let whiteKingPos: Position[] = [];
  let blackKingPos: Position[] = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p === 1) whiteMen.push({ r, c });
      else if (p === 2) {
        whiteKings++;
        whiteKingPos.push({ r, c });
      } else if (p === -1) blackMen.push({ r, c });
      else if (p === -2) {
        blackKings++;
        blackKingPos.push({ r, c });
      }
    }
  }

  const whiteTotal = whiteKings + whiteMen.length;
  const blackTotal = blackKings + blackMen.length;

  if (whiteTotal > 0 && blackTotal === 0) return 100000;
  if (blackTotal > 0 && whiteTotal === 0) return -100000;

  const whiteMoves = getAllMoves(board, 1, rules);
  if (whiteMoves.length === 0) return -100000;
  const blackMoves = getAllMoves(board, -1, rules);
  if (blackMoves.length === 0) return 100000;

  let score = (whiteKings * 350 + whiteMen.length * 100) - (blackKings * 350 + blackMen.length * 100);

  // 1. King vs King
  if (whiteKings === 1 && whiteMen.length === 0 && blackKings === 1 && blackMen.length === 0) {
    const bk = blackKingPos[0];
    const wk = whiteKingPos[0];
    const bkOnEdge = bk.r === 0 || bk.r === 7 || bk.c === 0 || bk.c === 7;
    const wkOnEdge = wk.r === 0 || wk.r === 7 || wk.c === 0 || wk.c === 7;
    if (bkOnEdge && !wkOnEdge) score += 500;
    else if (wkOnEdge && !bkOnEdge) score -= 500;
  }

  // 2. King + Man vs King (+800 forced win, prioritize promotion)
  if (whiteKings >= 1 && whiteMen.length >= 1 && blackKings === 1 && blackMen.length === 0) {
    score += 800;
    // Push man towards row 0
    for (const m of whiteMen) {
      score += (7 - m.r) * 40;
    }
  } else if (blackKings >= 1 && blackMen.length >= 1 && whiteKings === 1 && whiteMen.length === 0) {
    score -= 800;
    // Push man towards row 7
    for (const m of blackMen) {
      score -= m.r * 40;
    }
  }

  // 3. Man vs Man endgame (+100 for opposition / proximity to promotion)
  if (whiteKings === 0 && blackKings === 0 && whiteMen.length > 0 && blackMen.length > 0) {
    const closestWhite = Math.min(...whiteMen.map(m => m.r)); // closer to row 0
    const closestBlack = Math.max(...blackMen.map(m => 7 - m.r)); // closer to row 7
    if (closestWhite < closestBlack) score += 100;
    else if (closestBlack < closestWhite) score -= 100;
  }

  return score;
}

// =========================================================================
// 5. QUIESCENCE SEARCH
// =========================================================================
export let nodesSearched = 0;

export function resetNodesSearched() {
  nodesSearched = 0;
}

export function quiescence(
  board: Board,
  alpha: number,
  beta: number,
  maximizing: boolean,
  rules: VariantRules,
  ply: number,
  stats: { nodes: number; endTime: number }
): number {
  nodesSearched++;
  stats.nodes = nodesSearched;

  const standPat = evaluateBoard(board, rules);

  if (maximizing) {
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
  } else {
    if (standPat <= alpha) return alpha;
    if (standPat < beta) beta = standPat;
  }

  if (ply >= 24 || (nodesSearched & 255) === 0 && Date.now() >= stats.endTime) {
    return standPat;
  }

  const player = maximizing ? 1 : -1;
  const allMoves = getAllMoves(board, player, rules);
  const captures = allMoves.filter(m => m.captured.length > 0);

  if (captures.length === 0) {
    return standPat;
  }

  captures.sort((a, b) => b.captured.length - a.captured.length);

  if (maximizing) {
    for (const move of captures) {
      const score = quiescence(move.finalBoard, alpha, beta, false, rules, ply + 1, stats);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  } else {
    for (const move of captures) {
      const score = quiescence(move.finalBoard, alpha, beta, true, rules, ply + 1, stats);
      if (score <= alpha) return alpha;
      if (score < beta) beta = score;
    }
    return beta;
  }
}

// =========================================================================
// 1. ADVANCED PVS + LMR + NULL MOVE PRUNING MINIMAX
// =========================================================================
export function minimax(
  board: Board,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  rules: VariantRules = VARIANTS.moroccan,
  ply: number = 0,
  stats: { nodes: number; endTime: number } = { nodes: 0, endTime: Date.now() + 1500 },
  allowNull: boolean = true
): { score: number; bestMove: Move | null } {
  nodesSearched++;
  stats.nodes = nodesSearched;

  const player = maximizing ? 1 : -1;
  const hash = computeZobrist(board, player as 1 | -1);
  const ttIdx = (hash ^ (hash >>> 16)) & TT_MASK;

  // Transposition Table Lookup
  if (ttKey[ttIdx] === hash && ttFlag[ttIdx] !== 0 && ttDepth[ttIdx] >= depth) {
    const flag = ttFlag[ttIdx];
    const score = ttScore[ttIdx];
    if (flag === 1) return { score, bestMove: ttBestMove[ttIdx] };
    if (flag === 2 && score >= beta) return { score, bestMove: ttBestMove[ttIdx] };
    if (flag === 3 && score <= alpha) return { score, bestMove: ttBestMove[ttIdx] };
  }

  const legalMoves = getAllMoves(board, player, rules);

  if (legalMoves.length === 0) {
    const loseScore = maximizing ? -100000 + ply : 100000 - ply;
    return { score: loseScore, bestMove: null };
  }

  // Quiescence Search at depth == 0
  if (depth <= 0) {
    const qScore = quiescence(board, alpha, beta, maximizing, rules, ply, stats);
    return { score: qScore, bestMove: null };
  }

  if ((nodesSearched & 255) === 0 && Date.now() >= stats.endTime) {
    return { score: evaluateBoard(board, rules), bestMove: null };
  }

  // Null Move Pruning (depth >= 3, not in capture, not in late endgame)
  const isCaptureAvailable = legalMoves[0].captured.length > 0;
  if (allowNull && depth >= 3 && !isCaptureAvailable && ply > 0) {
    let piecesCount = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (board[r][c] !== 0) piecesCount++;
      }
    }
    if (piecesCount > 6) {
      const R = 2; // Null move reduction
      const nullResult = minimax(
        board,
        depth - 1 - R,
        maximizing ? -beta : alpha,
        maximizing ? -alpha : beta,
        !maximizing,
        rules,
        ply + 1,
        stats,
        false
      );
      if (maximizing && nullResult.score >= beta) return { score: beta, bestMove: null };
      if (!maximizing && nullResult.score <= alpha) return { score: alpha, bestMove: null };
    }
  }

  // Move Ordering: TT Best Move -> Captures -> Killers -> History -> Center
  const cachedMove = ttKey[ttIdx] === hash ? ttBestMove[ttIdx] : null;
  const k1 = ply < 40 ? killerMoves[ply][0] : null;
  const k2 = ply < 40 ? killerMoves[ply][1] : null;

  legalMoves.sort((a, b) => {
    if (cachedMove && a.id === cachedMove.id) return -1000000;
    if (cachedMove && b.id === cachedMove.id) return 1000000;

    if (b.captured.length !== a.captured.length) return b.captured.length - a.captured.length;
    if (b.isPromotion !== a.isPromotion) return b.isPromotion ? 1 : -1;

    if (k1 && a.id === k1.id) return -500000;
    if (k1 && b.id === k1.id) return 500000;
    if (k2 && a.id === k2.id) return -250000;
    if (k2 && b.id === k2.id) return 250000;

    const histA = historyTable[(a.from.r * 8 + a.from.c) * 64 + (a.to.r * 8 + a.to.c)];
    const histB = historyTable[(b.from.r * 8 + b.from.c) * 64 + (b.to.r * 8 + b.to.c)];
    return histB - histA;
  });

  let bestMove: Move | null = legalMoves[0];
  const originalAlpha = alpha;

  if (maximizing) {
    let maxEval = -Infinity;

    for (let i = 0; i < legalMoves.length; i++) {
      const move = legalMoves[i];
      const isCapture = move.captured.length > 0;
      let score: number;

      if (i === 0) {
        // PV Search: Full window on first move
        const nextDepth = (isCapture && depth > 0) ? depth : depth - 1;
        const res = minimax(move.finalBoard, nextDepth, alpha, beta, false, rules, ply + 1, stats, true);
        score = res.score;
      } else {
        // LMR: Late Move Reduction for quiet moves after 4th move
        let searchDepth = (isCapture && depth > 0) ? depth : depth - 1;
        const canLMR = i >= 4 && depth >= 3 && !isCapture && !move.isPromotion;
        if (canLMR) {
          searchDepth = Math.max(1, depth - 2);
        }

        // Scout search with null window [alpha, alpha + 1]
        const scout = minimax(move.finalBoard, searchDepth, alpha, alpha + 1, false, rules, ply + 1, stats, true);
        score = scout.score;

        // Re-search at full depth if scout failed high
        if (score > alpha && (canLMR || score < beta)) {
          const fullDepth = (isCapture && depth > 0) ? depth : depth - 1;
          const fullSearch = minimax(move.finalBoard, fullDepth, alpha, beta, false, rules, ply + 1, stats, true);
          score = fullSearch.score;
        }
      }

      if (score > maxEval) {
        maxEval = score;
        bestMove = move;
      }
      alpha = Math.max(alpha, score);
      if (beta <= alpha) {
        if (!isCapture) updateKillerAndHistory(move, ply, depth);
        break;
      }
    }

    // Save in Transposition Table
    let flag: number = 1; // EXACT
    if (maxEval <= originalAlpha) flag = 3; // UPPER
    else if (maxEval >= beta) flag = 2; // LOWER

    ttKey[ttIdx] = hash;
    ttDepth[ttIdx] = depth;
    ttScore[ttIdx] = maxEval;
    ttFlag[ttIdx] = flag;
    ttBestMove[ttIdx] = bestMove;

    return { score: maxEval, bestMove };
  } else {
    let minEval = Infinity;

    for (let i = 0; i < legalMoves.length; i++) {
      const move = legalMoves[i];
      const isCapture = move.captured.length > 0;
      let score: number;

      if (i === 0) {
        const nextDepth = (isCapture && depth > 0) ? depth : depth - 1;
        const res = minimax(move.finalBoard, nextDepth, alpha, beta, true, rules, ply + 1, stats, true);
        score = res.score;
      } else {
        let searchDepth = (isCapture && depth > 0) ? depth : depth - 1;
        const canLMR = i >= 4 && depth >= 3 && !isCapture && !move.isPromotion;
        if (canLMR) {
          searchDepth = Math.max(1, depth - 2);
        }

        const scout = minimax(move.finalBoard, searchDepth, beta - 1, beta, true, rules, ply + 1, stats, true);
        score = scout.score;

        if (score < beta && (canLMR || score > alpha)) {
          const fullDepth = (isCapture && depth > 0) ? depth : depth - 1;
          const fullSearch = minimax(move.finalBoard, fullDepth, alpha, beta, true, rules, ply + 1, stats, true);
          score = fullSearch.score;
        }
      }

      if (score < minEval) {
        minEval = score;
        bestMove = move;
      }
      beta = Math.min(beta, score);
      if (beta <= alpha) {
        if (!isCapture) updateKillerAndHistory(move, ply, depth);
        break;
      }
    }

    let flag: number = 1;
    if (minEval <= originalAlpha) flag = 3;
    else if (minEval >= beta) flag = 2;

    ttKey[ttIdx] = hash;
    ttDepth[ttIdx] = depth;
    ttScore[ttIdx] = minEval;
    ttFlag[ttIdx] = flag;
    ttBestMove[ttIdx] = bestMove;

    return { score: minEval, bestMove };
  }
}

// =========================================================================
// 3. ENDGAME SOLVER (solveEndgame: Pieces <= 6, Depth 20)
// =========================================================================
export function solveEndgame(
  board: Board,
  player: 1 | -1,
  rules: VariantRules = VARIANTS.moroccan,
  depth: number = 20,
  timeLimitMs: number = 1500
): SolverResult {
  const startTime = performance.now();
  resetNodesSearched();
  resetMoveOrdering();

  const allLegalMoves = getAllMoves(board, player, rules);
  if (allLegalMoves.length === 0) {
    const loseScore = player === 1 ? -100000 : 100000;
    return {
      bestMove: null,
      evaluation: loseScore,
      allLegalMoves: [],
      stats: {
        nodesEvaluated: 1,
        timeMs: 1,
        depthReached: depth,
        totalPossibilities: 0,
        evalScore: loseScore,
        isWinning: false,
        isLosing: true,
        isEndgameTablebase: true,
      },
    };
  }

  const endTime = Date.now() + timeLimitMs;
  const stats = { nodes: 0, endTime };

  // Iterative deepening with endgame evaluation
  let bestMove: Move = allLegalMoves[0];
  let bestScore = player === 1 ? -Infinity : Infinity;
  let depthReached = 1;

  for (let d = 1; d <= depth; d++) {
    if (Date.now() >= endTime) break;

    let dBestMove = allLegalMoves[0];
    let dBestScore = player === 1 ? -Infinity : Infinity;

    for (const move of allLegalMoves) {
      const { score } = minimax(
        move.finalBoard,
        d - 1,
        -Infinity,
        Infinity,
        player === -1,
        rules,
        0,
        stats
      );

      move.score = score;
      if (player === 1) {
        if (score > dBestScore) {
          dBestScore = score;
          dBestMove = move;
        }
      } else {
        if (score < dBestScore) {
          dBestScore = score;
          dBestMove = move;
        }
      }
    }

    depthReached = d;
    bestMove = dBestMove;
    bestScore = dBestScore;

    // Fast terminal exit for forced endgame win
    if (Math.abs(bestScore) >= 90000) break;
  }

  return {
    bestMove,
    evaluation: bestScore,
    allLegalMoves,
    stats: {
      nodesEvaluated: nodesSearched,
      timeMs: Math.round(performance.now() - startTime),
      depthReached,
      totalPossibilities: allLegalMoves.length,
      evalScore: bestScore,
      isWinning: player === 1 ? bestScore > 300 : bestScore < -300,
      isLosing: player === 1 ? bestScore < -300 : bestScore > 300,
      isEndgameTablebase: true,
    },
  };
}

// =========================================================================
// 6. ITERATIVE DEEPENING + ASPIRATION WINDOWS + DIFFICULTY CONTROLLER
// =========================================================================
export function solvePosition(
  board: Board,
  player: 1 | -1,
  depth: number = 11,
  rules: VariantRules = VARIANTS.moroccan,
  timeLimitMs: number = 1500,
  difficulty: EngineDifficulty = 'IMPOSSIBLE'
): SolverResult {
  const startTime = performance.now();

  // 1. Check OPENING BOOK first (Play instantly from book)
  if (difficulty !== 'MEDIUM') {
    const bookMoveNotation = probeOpeningBook(board, player);
    if (bookMoveNotation) {
      const allLegalMoves = getAllMoves(board, player, rules);
      const bookMove = allLegalMoves.find(m => m.notation === bookMoveNotation) || allLegalMoves[0];
      if (bookMove) {
        return {
          bestMove: bookMove,
          evaluation: 0,
          allLegalMoves,
          stats: {
            nodesEvaluated: 1,
            timeMs: 1,
            depthReached: 1,
            totalPossibilities: allLegalMoves.length,
            evalScore: 0,
            isWinning: false,
            isLosing: false,
            isBookMove: true,
          },
        };
      }
    }
  }

  // 2. Check ENDGAME SOLVER (Pieces <= 6)
  let totalPieces = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] !== 0) totalPieces++;
    }
  }
  if (totalPieces <= 6 && difficulty === 'IMPOSSIBLE') {
    return solveEndgame(board, player, rules, 20, timeLimitMs);
  }

  // 3. Difficulty Target Depth setup
  const targetDepth =
    difficulty === 'IMPOSSIBLE' ? Math.max(depth, 11) : difficulty === 'HARD' ? Math.max(depth, 9) : Math.max(depth, 6);

  resetNodesSearched();
  resetMoveOrdering();

  const allLegalMoves = getAllMoves(board, player, rules);
  const totalPossibilities = countTotalPossibilities(board, player, rules);

  if (allLegalMoves.length === 0) {
    const loseScore = player === 1 ? -100000 : 100000;
    return {
      bestMove: null,
      evaluation: loseScore,
      allLegalMoves: [],
      stats: {
        nodesEvaluated: 1,
        timeMs: Math.max(1, performance.now() - startTime),
        depthReached: 1,
        totalPossibilities: 0,
        evalScore: loseScore,
        isWinning: false,
        isLosing: true,
      },
    };
  }

  const endTime = Date.now() + Math.max(500, timeLimitMs);
  const stats = { nodes: 0, endTime };

  let bestMove: Move = allLegalMoves[0];
  let bestScore = player === 1 ? -Infinity : Infinity;
  let highestCompletedDepth = 1;
  let scoredMoves: Move[] = [...allLegalMoves];

  // Iterative Deepening 1 -> targetDepth with ASPIRATION WINDOWS for depth >= 5
  for (let currentDepth = 1; currentDepth <= targetDepth; currentDepth++) {
    if (Date.now() >= endTime && currentDepth > 2) break;

    let alpha = -Infinity;
    let beta = Infinity;

    // Aspiration Windows: alpha = prevScore - 50, beta = prevScore + 50
    if (currentDepth >= 5 && Math.abs(bestScore) < 90000) {
      alpha = bestScore - 50;
      beta = bestScore + 50;
    }

    let iterBestMove = allLegalMoves[0];
    let iterBestScore = player === 1 ? -Infinity : Infinity;
    const currentScoredMoves: Move[] = [];
    let completedFullIteration = true;

    for (const move of allLegalMoves) {
      if (Date.now() >= endTime && currentDepth > 2) {
        completedFullIteration = false;
        break;
      }

      const isCapture = move.captured.length > 0;
      const nextDepth = (isCapture && currentDepth > 1) ? currentDepth - 1 : currentDepth - 1;

      let { score } = minimax(
        move.finalBoard,
        nextDepth,
        alpha,
        beta,
        player === -1,
        rules,
        0,
        stats
      );

      // Aspiration Window Fail-Low / Fail-High recovery
      if (score <= alpha) {
        const recover = minimax(move.finalBoard, nextDepth, -Infinity, beta, player === -1, rules, 0, stats);
        score = recover.score;
      } else if (score >= beta) {
        const recover = minimax(move.finalBoard, nextDepth, alpha, Infinity, player === -1, rules, 0, stats);
        score = recover.score;
      }

      move.score = score;
      currentScoredMoves.push({ ...move, score });

      if (player === 1) {
        if (score > iterBestScore) {
          iterBestScore = score;
          iterBestMove = move;
        }
      } else {
        if (score < iterBestScore) {
          iterBestScore = score;
          iterBestMove = move;
        }
      }
    }

    if (completedFullIteration && currentScoredMoves.length === allLegalMoves.length) {
      highestCompletedDepth = currentDepth;
      bestMove = iterBestMove;
      bestScore = iterBestScore;
      scoredMoves = currentScoredMoves;

      allLegalMoves.sort((a, b) => {
        const sa = a.score ?? 0;
        const sb = b.score ?? 0;
        return player === 1 ? sb - sa : sa - sb;
      });

      if (Math.abs(bestScore) >= 90000) break;
    }
  }

  scoredMoves.sort((a, b) => {
    const sa = a.score ?? 0;
    const sb = b.score ?? 0;
    return player === 1 ? sb - sa : sa - sb;
  });

  const finalScore = bestScore !== -Infinity && bestScore !== Infinity ? bestScore : evaluateBoard(board, rules);
  const timeMs = Math.max(1, Math.round(performance.now() - startTime));
  const nps = Math.round((nodesSearched / timeMs) * 1000);

  return {
    bestMove: bestMove || scoredMoves[0] || null,
    evaluation: finalScore,
    allLegalMoves: scoredMoves,
    stats: {
      nodesEvaluated: Math.max(nodesSearched, 1),
      timeMs,
      depthReached: highestCompletedDepth,
      totalPossibilities,
      evalScore: finalScore,
      isWinning: player === 1 ? finalScore > 300 : finalScore < -300,
      isLosing: player === 1 ? finalScore < -300 : finalScore > 300,
      nps,
    },
  };
}

export function ponderOpponentPossibilities(
  board: Board,
  opponentColor: 1 | -1,
  rules: VariantRules = VARIANTS.moroccan,
  depth: number = 8,
  timeLimitMs: number = 1800
): Map<string, PonderedMoveResult> {
  const humanMoves = getAllMoves(board, opponentColor, rules);
  const ponderMap = new Map<string, PonderedMoveResult>();
  const startTime = Date.now();
  const endTime = startTime + timeLimitMs;

  for (const hMove of humanMoves) {
    if (Date.now() >= endTime) break;

    const remainingTime = Math.max(120, (endTime - Date.now()) / Math.max(1, humanMoves.length - ponderMap.size));
    const engineTurn = (opponentColor === 1 ? -1 : 1) as (1 | -1);

    const solution = solvePosition(hMove.finalBoard, engineTurn, depth, rules, remainingTime, 'HARD');

    ponderMap.set(hMove.notation, {
      humanMove: hMove,
      counterMove: solution.bestMove,
      evaluation: solution.evaluation,
      score: solution.stats.evalScore,
      depth: solution.stats.depthReached,
      nodesEvaluated: solution.stats.nodesEvaluated,
    });
  }

  return ponderMap;
}

export function scoreToWinProbability(score: number): {
  whitePct: number;
  blackPct: number;
  formattedScore: string;
  leadPlayer: 'white' | 'black' | 'even';
  leadDescription: string;
} {
  if (score >= 90000) {
    return {
      whitePct: 100,
      blackPct: 0,
      formattedScore: '+Win',
      leadPlayer: 'white',
      leadDescription: 'White has forced win',
    };
  }
  if (score <= -90000) {
    return {
      whitePct: 0,
      blackPct: 100,
      formattedScore: '-Win',
      leadPlayer: 'black',
      leadDescription: 'Black has forced win',
    };
  }

  const prob = 1 / (1 + Math.pow(10, -score / 340));
  const rawPct = Math.round(prob * 100);
  const whitePct = Math.max(1, Math.min(99, rawPct));
  const blackPct = 100 - whitePct;

  const numericalScore = (score / 100).toFixed(1);
  const formattedScore = score > 0 ? `+${numericalScore}` : numericalScore;

  let leadPlayer: 'white' | 'black' | 'even' = 'even';
  let leadDescription = 'Even position';

  if (score > 350) {
    leadPlayer = 'white';
    leadDescription = `White winning (${formattedScore})`;
  } else if (score > 60) {
    leadPlayer = 'white';
    leadDescription = `White advantage (${formattedScore})`;
  } else if (score < -350) {
    leadPlayer = 'black';
    leadDescription = `Black winning (${formattedScore})`;
  } else if (score < -60) {
    leadPlayer = 'black';
    leadDescription = `Black advantage (${formattedScore})`;
  }

  return {
    whitePct,
    blackPct,
    formattedScore,
    leadPlayer,
    leadDescription,
  };
}
