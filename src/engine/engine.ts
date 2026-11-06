/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Board, EngineStats, Move, Position, SolverResult, VariantRules, PonderedMoveResult } from './types.ts';

export const VARIANTS: Record<string, VariantRules> = {
  moroccan: {
    id: 'moroccan',
    name: 'Moroccan Dama (الضامة المغربية)',
    description: 'Authentic Moroccan rules: Men move and capture forward only (no backward captures). Flying kings move and sweep diagonals in all directions. Mandatory majority capture. Immediate promotion turn-end.',
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
    description: 'Men move and capture forward only. Flying king. Majority capture rule with king quality tiebreak.',
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
    description: 'Men move and capture forward only. Short king (1 step). Mandatory capture without majority rule.',
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
        if (r < 3) {
          board[r][c] = -1; // Black man
        } else if (r > 4) {
          board[r][c] = 1; // White man
        }
      }
    }
  }
  return board;
}

/**
 * Specific Test Position requested:
 * "White has 1 king at d4, Black has 2 men at e5, f6 - white to move should win by capturing both"
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
    id: 'test_d4_e5_f6',
    name: 'Moroccan Test: King d4 vs e5, f6',
    turn: 1,
    description: 'White king at d4 captures both black men at e5, f6 to win instantly.',
    board: createTestPosition,
  },
  {
    id: 'standard_start',
    name: 'Standard Starting Position',
    turn: 1,
    description: 'Standard 12 vs 12 Moroccan Dama opening.',
    board: createStartingBoard,
  },
  {
    id: 'tactical_majority_sacrifice',
    name: 'Majority Rule Trap (Max 3 vs 2)',
    turn: 1,
    description: 'White forces Black to take the longer capture path of 3 pieces instead of 2.',
    board: () => {
      const b = createEmptyBoard();
      // White pieces
      b[6][1] = 1; // b2
      b[4][3] = 1; // d4
      b[4][5] = 1; // f4
      // Black pieces
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
      const a1 = notationToPos('a1'); // 7, 0
      b[a1.r][a1.c] = 2; // White king
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

/** Check if position is inside board boundaries */
function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

/** Check if a position is in a list */
function hasPos(list: Position[], r: number, c: number): boolean {
  return list.some(p => p.r === r && p.c === c);
}

/**
 * STEP 2 requirement:
 * function getAllCaptures(board, r, c, player, rules)
 * => returns array of { path: [positions], captured: [positions], finalBoard }
 * Uses recursion + backtracking, explores all branches.
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
    // --- MAN CAPTURES ---
    // In Moroccan Dama, men capture forward OR backward
    const directions: [number, number][] = rules.menCaptureBackwards
      ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
      : player === 1
        ? [[-1, -1], [-1, 1]] // White moves up
        : [[1, -1], [1, 1]];  // Black moves down

    function recurseMan(
      currR: number,
      currC: number,
      path: Position[],
      captured: Position[]
    ) {
      let foundContinuation = false;

      for (const [dr, dc] of directions) {
        const enemyR = currR + dr;
        const enemyC = currC + dc;
        const landR = currR + 2 * dr;
        const landC = currC + 2 * dc;

        if (!inBounds(landR, landC)) continue;

        const enemyPiece = board[enemyR][enemyC];
        // Enemy piece belongs to opponent and hasn't been captured already in this path
        if (
          Math.sign(enemyPiece) === -player &&
          !hasPos(captured, enemyR, enemyC)
        ) {
          // Landing square must be empty (or start square if full loop) and not already occupied/captured
          const landingEmpty = (board[landR][landC] === 0 || (landR === r && landC === c)) &&
            !hasPos(captured, landR, landC);

          if (landingEmpty) {
            foundContinuation = true;
            const newPath = [...path, { r: landR, c: landC }];
            const newCaptured = [...captured, { r: enemyR, c: enemyC }];

            // Moroccan Rule 6: Promotion when reaching last row terminates the turn immediately
            const reachesPromotion = (player === 1 && landR === 0) || (player === -1 && landR === 7);

            if (reachesPromotion && rules.promotionEndsTurn) {
              // Promoted, turn ends immediately
              const finalBoard = cloneBoard(board);
              finalBoard[r][c] = 0;
              for (const p of newCaptured) finalBoard[p.r][p.c] = 0;
              finalBoard[landR][landC] = player * 2; // King

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
              // Continue multi-jump exploration
              recurseMan(landR, landC, newPath, newCaptured);
            }
          }
        }
      }

      // If no further hops from this position and we have made at least one capture:
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
    // --- KING (DAMA) CAPTURES ---
    const kingDirections: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

    function recurseKing(
      currR: number,
      currC: number,
      path: Position[],
      captured: Position[]
    ) {
      let foundContinuation = false;

      for (const [dr, dc] of kingDirections) {
        // In flying king mechanics:
        if (rules.flyingKing) {
          // Slide along diagonal until first obstacle
          let step = 1;
          const capturedInDir: Position[] = [];

          while (inBounds(currR + step * dr, currC + step * dc)) {
            const checkR = currR + step * dr;
            const checkC = currC + step * dc;
            const sqPiece = board[checkR][checkC];

            // If square has friendly piece or already captured piece, stop ray
            if (Math.sign(sqPiece) === player || hasPos(captured, checkR, checkC)) {
              break;
            }

            // If square has opponent piece
            if (Math.sign(sqPiece) === -player) {
              capturedInDir.push({ r: checkR, c: checkC });

              // If kingSweepsLine is enabled (Moroccan rule), we can sweep consecutive enemy pieces
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

              // Now explore all empty landing squares beyond the captured piece(s)
              let landStep = step + 1;
              let anyLandingValid = false;

              while (inBounds(currR + landStep * dr, currC + landStep * dc)) {
                const landR = currR + landStep * dr;
                const landC = currC + landStep * dc;
                const landPiece = board[landR][landC];

                // Must be empty (or start position) and not in captured list
                const isEmpty = (landPiece === 0 || (landR === r && landC === c)) &&
                  !hasPos(captured, landR, landC);

                if (!isEmpty) break; // Obstacle hit

                anyLandingValid = true;
                foundContinuation = true;

                const newPath = [...path, { r: landR, c: landC }];
                const newCaptured = [...captured, ...capturedInDir];

                // Recursively search for subsequent turns / jumps
                recurseKing(landR, landC, newPath, newCaptured);

                landStep++;
              }

              // Finished this diagonal ray after encountering the enemy piece(s)
              break;
            }

            step++;
          }
        } else {
          // Non-flying king (e.g. American Checkers: 1-step leap)
          const enemyR = currR + dr;
          const enemyC = currC + dc;
          const landR = currR + 2 * dr;
          const landC = currC + 2 * dc;

          if (inBounds(landR, landC)) {
            const enemyPiece = board[enemyR][enemyC];
            if (
              Math.sign(enemyPiece) === -player &&
              !hasPos(captured, enemyR, enemyC)
            ) {
              const landingEmpty = (board[landR][landC] === 0 || (landR === r && landC === c)) &&
                !hasPos(captured, landR, landC);

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

      // If no further jumps from here and at least 1 capture was made, record final state
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

  // Deduplicate moves that arrive at the same destination with identical captures
  const uniqueMoves = new Map<string, Move>();
  for (const move of results) {
    const key = `${move.from.r},${move.from.c}->${move.to.r},${move.to.c}_cap:${move.captured.map(p => `${p.r},${p.c}`).sort().join(';')}`;
    if (!uniqueMoves.has(key) || move.path.length > (uniqueMoves.get(key)?.path.length || 0)) {
      uniqueMoves.set(key, move);
    }
  }

  return Array.from(uniqueMoves.values());
}

/**
 * STEP 2 requirement:
 * Implement findMaxCaptureLength(board, player, rules) first
 * Finds the maximum number of pieces any piece of the player can capture
 */
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
          if (cap.captured.length > maxLength) {
            maxLength = cap.captured.length;
          }
        }
      }
    }
  }
  return maxLength;
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
    // Men move 1 step diagonally forward
    const forwardDr = player === 1 ? -1 : 1; // White moves up (-1), Black moves down (+1)
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
    // King moves
    const directions: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

    for (const [dr, dc] of directions) {
      if (rules.flyingKing) {
        let step = 1;
        while (inBounds(r + step * dr, c + step * dc)) {
          const targetR = r + step * dr;
          const targetC = c + step * dc;

          if (board[targetR][targetC] !== 0) break; // Blocked

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
        // American Checkers: 1 step diagonal
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
 * STEP 2 requirement:
 * function getAllMoves(board, player, rules)
 * => If captures exist, return ONLY captures with max length (MAX capture rule)
 * => else normal moves
 */
export function getAllMoves(
  board: Board,
  player: number,
  rules: VariantRules = VARIANTS.moroccan
): Move[] {
  const maxCap = findMaxCaptureLength(board, player, rules);

  if (maxCap > 0 && rules.mandatoryCapture) {
    const allCaps: Move[] = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (Math.sign(board[r][c]) === player) {
          const pieceCaps = getAllCaptures(board, r, c, player, rules);
          for (const cap of pieceCaps) {
            // MAX capture rule: you MUST take the path that captures the MOST pieces
            if (!rules.maxCaptureMajority || cap.captured.length === maxCap) {
              allCaps.push(cap);
            }
          }
        }
      }
    }

    // Spanish rule: if tied for max capture count, prefer capturing most kings
    if (rules.kingQualityTiebreak && allCaps.length > 1) {
      const maxKings = Math.max(
        ...allCaps.map(m => m.captured.filter(p => Math.abs(board[p.r][p.c]) === 2).length)
      );
      return allCaps.filter(
        m => m.captured.filter(p => Math.abs(board[p.r][p.c]) === 2).length === maxKings
      );
    }

    return allCaps;
  }

  // If mandatoryCapture is false OR no captures exist:
  const moves: Move[] = [];

  // When capture is NOT mandatory (optional capture mode), player can choose to capture
  if (maxCap > 0 && !rules.mandatoryCapture) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (Math.sign(board[r][c]) === player) {
          moves.push(...getAllCaptures(board, r, c, player, rules));
        }
      }
    }
  }

  // Add all normal moves
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (Math.sign(board[r][c]) === player) {
        moves.push(...getNormalMoves(board, r, c, player, rules));
      }
    }
  }

  return moves;
}

/**
 * Returns positions of all pieces of a player that currently have at least one capture available
 */
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
        if (caps.length > 0) {
          pieces.push({ r, c });
        }
      }
    }
  }
  return pieces;
}

/**
 * Count function requested:
 * totalPossibilities = all moves count + all capture continuations
 */
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
        for (const cap of caps) {
          // Add intermediate hops
          if (cap.path.length > 2) {
            count += cap.path.length - 2;
          }
        }
      }
    }
  }
  return Math.max(count, getAllMoves(board, player, rules).length);
}

/**
 * Format algebraic move notation: e.g. "d4:g7 (x2)"
 */
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
 * Static Board Evaluation function
 * Positive score favors White (1), negative score favors Black (-1)
 * Scale: 100 = 1 normal man, 550 = 1 Moroccan flying king
 */
export function evaluateBoard(board: Board): number {
  let score = 0;
  let whitePieces = 0;
  let blackPieces = 0;
  let whiteKings = 0;
  let blackKings = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece === 0) continue;

      if (piece === 1) {
        // White man
        whitePieces++;
        score += 100;

        // Exponential advancement toward Moroccan King row (r=0)
        // r=7: 0, r=6: 10, r=5: 23, r=4: 42, r=3: 65, r=2: 98, r=1: 140
        const advancement = 7 - r;
        score += Math.round(advancement * advancement * 2.8);

        // Home rank anchor: Guards own crowning row from enemy flying kings
        if (r === 7) score += 25;

        // Center control (d4, e5, d5, e4, etc.)
        if (r >= 3 && r <= 4 && c >= 2 && c <= 5) score += 12;
        else if (r >= 2 && r <= 5 && c >= 1 && c <= 6) score += 5;
      } else if (piece === 2) {
        // White King (Dama / Sultan) - Game-deciding flying piece
        whiteKings++;
        whitePieces++;
        score += 550;

        // King diagonal mobility / center control
        if (r >= 2 && r <= 5 && c >= 2 && c <= 5) score += 30;
        // Long diagonal control
        if (r === c || r + c === 7) score += 15;
      } else if (piece === -1) {
        // Black man
        blackPieces++;
        score -= 100;

        // Exponential advancement toward Moroccan King row (r=7)
        const advancement = r;
        score -= Math.round(advancement * advancement * 2.8);

        // Home rank anchor
        if (r === 0) score -= 25;

        // Center control
        if (r >= 3 && r <= 4 && c >= 2 && c <= 5) score -= 12;
        else if (r >= 2 && r <= 5 && c >= 1 && c <= 6) score -= 5;
      } else if (piece === -2) {
        // Black King (Dama / Sultan)
        blackKings++;
        blackPieces++;
        score -= 550;

        // King diagonal mobility / center control
        if (r >= 2 && r <= 5 && c >= 2 && c <= 5) score -= 30;
        if (r === c || r + c === 7) score -= 15;
      }
    }
  }

  // Endgames: Decisive terminal thresholds
  if (whitePieces > 0 && blackPieces === 0) return 99999;
  if (blackPieces > 0 && whitePieces === 0) return -99999;

  // King superiority in endgame: aggressively hunt loose opponent pieces
  if (whiteKings > 0 && blackKings === 0) score += 80;
  if (blackKings > 0 && whiteKings === 0) score -= 80;

  return score;
}

/**
 * Convert Minimax evaluation score into winning probability percentage (0% to 100% White)
 * Score scale: 0 = 50%, +100 = ~64%, +200 = ~76%, +400 = ~91%, >= 90000 = 100%
 */
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

  // Sigmoid curve tailored for checkers piece values
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

/** Fast compact board key for Transposition Table */
function getBoardKey(board: Board, player: number): string {
  let s = player === 1 ? 'W:' : 'B:';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) {
        const p = board[r][c];
        s += p === 0 ? '.' : p === 1 ? '1' : p === 2 ? '2' : p === -1 ? 'a' : 'b';
      }
    }
  }
  return s;
}

// Global Transposition Table cache (capped at 50,000 entries)
interface TTEntry {
  depth: number;
  score: number;
  flag: 'EXACT' | 'LOWER' | 'UPPER';
  bestMoveId?: string;
}
const transpositionTable = new Map<string, TTEntry>();

export function clearTranspositionTable() {
  transpositionTable.clear();
}

/**
 * Quiescence Search:
 * Extends search until a quiet position is reached (no captures pending).
 * Eliminates the horizon effect where the engine blunders into multi-jump recaptures.
 */
export function quiescence(
  board: Board,
  alpha: number,
  beta: number,
  maximizing: boolean,
  rules: VariantRules,
  stats: { nodes: number; endTime: number },
  qDepth = 0
): number {
  stats.nodes++;
  const standPat = evaluateBoard(board);

  // Maximum capture extension limit to prevent infinite depth loops
  if (qDepth >= 8 || (stats.nodes % 64 === 0 && Date.now() >= stats.endTime)) {
    return standPat;
  }

  if (maximizing) {
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
  } else {
    if (standPat <= alpha) return alpha;
    if (standPat < beta) beta = standPat;
  }

  const player = maximizing ? 1 : -1;
  const allMoves = getAllMoves(board, player, rules);
  const captures = allMoves.filter(m => m.captured.length > 0);

  if (captures.length === 0) {
    return standPat;
  }

  // Sort captures: highest capture count first, then promotions
  captures.sort((a, b) => {
    if (b.captured.length !== a.captured.length) return b.captured.length - a.captured.length;
    if (b.isPromotion !== a.isPromotion) return b.isPromotion ? 1 : -1;
    return 0;
  });

  if (maximizing) {
    for (const move of captures) {
      const score = quiescence(move.finalBoard, alpha, beta, false, rules, stats, qDepth + 1);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
      if (Date.now() >= stats.endTime) break;
    }
    return alpha;
  } else {
    for (const move of captures) {
      const score = quiescence(move.finalBoard, alpha, beta, true, rules, stats, qDepth + 1);
      if (score <= alpha) return alpha;
      if (score < beta) beta = score;
      if (Date.now() >= stats.endTime) break;
    }
    return beta;
  }
}

/**
 * Full Minimax with Alpha-Beta Pruning, Transposition Table, Quiescence Search,
 * and Advanced Move Ordering.
 */
export function minimax(
  board: Board,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  rules: VariantRules = VARIANTS.moroccan,
  stats: { nodes: number; endTime: number } = {
    nodes: 0,
    endTime: Date.now() + 500,
  }
): { score: number; bestMove: Move | null } {
  stats.nodes++;

  const player = maximizing ? 1 : -1;
  const boardKey = getBoardKey(board, player);

  // Probe Transposition Table
  const ttEntry = transpositionTable.get(boardKey);
  if (ttEntry && ttEntry.depth >= depth) {
    if (ttEntry.flag === 'EXACT') {
      return { score: ttEntry.score, bestMove: null };
    } else if (ttEntry.flag === 'LOWER' && ttEntry.score >= beta) {
      return { score: ttEntry.score, bestMove: null };
    } else if (ttEntry.flag === 'UPPER' && ttEntry.score <= alpha) {
      return { score: ttEntry.score, bestMove: null };
    }
  }

  const legalMoves = getAllMoves(board, player, rules);

  // Terminal state: No legal moves = player has lost
  if (legalMoves.length === 0) {
    const loseScore = maximizing ? -100000 + (12 - depth) : 100000 - (12 - depth);
    return { score: loseScore, bestMove: null };
  }

  // Leaf node reached or time expired -> Enter Quiescence Search
  if (depth <= 0 || (stats.nodes % 64 === 0 && Date.now() >= stats.endTime)) {
    const qScore = quiescence(board, alpha, beta, maximizing, rules, stats, 0);
    return { score: qScore, bestMove: null };
  }

  // Move ordering:
  // 1. TT recommended move
  // 2. Highest number of captures
  // 3. Promotion moves
  // 4. Center control moves
  legalMoves.sort((a, b) => {
    if (ttEntry?.bestMoveId) {
      if (a.id === ttEntry.bestMoveId) return -1;
      if (b.id === ttEntry.bestMoveId) return 1;
    }
    if (b.captured.length !== a.captured.length) {
      return b.captured.length - a.captured.length;
    }
    if (b.isPromotion !== a.isPromotion) {
      return b.isPromotion ? 1 : -1;
    }
    // Center destination
    const centerA = Math.abs(3.5 - a.to.r) + Math.abs(3.5 - a.to.c);
    const centerB = Math.abs(3.5 - b.to.r) + Math.abs(3.5 - b.to.c);
    return centerA - centerB;
  });

  let bestMove: Move | null = legalMoves[0];
  const originalAlpha = alpha;

  if (maximizing) {
    let maxEval = -Infinity;
    for (const move of legalMoves) {
      const { score } = minimax(
        move.finalBoard,
        depth - 1,
        alpha,
        beta,
        false,
        rules,
        stats
      );

      if (score > maxEval) {
        maxEval = score;
        bestMove = move;
      }
      alpha = Math.max(alpha, score);
      if (beta <= alpha || Date.now() >= stats.endTime) break;
    }

    // Store in Transposition Table
    if (transpositionTable.size < 50000) {
      let flag: 'EXACT' | 'LOWER' | 'UPPER' = 'EXACT';
      if (maxEval <= originalAlpha) flag = 'UPPER';
      else if (maxEval >= beta) flag = 'LOWER';
      transpositionTable.set(boardKey, {
        depth,
        score: maxEval,
        flag,
        bestMoveId: bestMove?.id,
      });
    }

    return { score: maxEval, bestMove };
  } else {
    let minEval = Infinity;
    for (const move of legalMoves) {
      const { score } = minimax(
        move.finalBoard,
        depth - 1,
        alpha,
        beta,
        true,
        rules,
        stats
      );

      if (score < minEval) {
        minEval = score;
        bestMove = move;
      }
      beta = Math.min(beta, score);
      if (beta <= alpha || Date.now() >= stats.endTime) break;
    }

    // Store in Transposition Table
    if (transpositionTable.size < 50000) {
      let flag: 'EXACT' | 'LOWER' | 'UPPER' = 'EXACT';
      if (minEval <= originalAlpha) flag = 'UPPER';
      else if (minEval >= beta) flag = 'LOWER';
      transpositionTable.set(boardKey, {
        depth,
        score: minEval,
        flag,
        bestMoveId: bestMove?.id,
      });
    }

    return { score: minEval, bestMove };
  }
}

/**
 * Solve board position completely using Iterative Deepening.
 * Guarantees zero blunders even if time expires by retaining fully completed depth iterations.
 */
export function solvePosition(
  board: Board,
  player: 1 | -1,
  depth: number,
  rules: VariantRules = VARIANTS.moroccan,
  timeLimitMs: number = 700
): SolverResult {
  const startTime = performance.now();
  const allLegalMoves = getAllMoves(board, player, rules);
  const totalPossibilities = countTotalPossibilities(board, player, rules);

  if (allLegalMoves.length === 0) {
    const isLosing = true;
    return {
      bestMove: null,
      evaluation: player === 1 ? -99999 : 99999,
      allLegalMoves: [],
      stats: {
        nodesEvaluated: 1,
        timeMs: performance.now() - startTime,
        depthReached: depth,
        totalPossibilities: 0,
        evalScore: player === 1 ? -99999 : 99999,
        isWinning: false,
        isLosing,
      },
    };
  }

  // Fast-path: Only 1 legal move (forced capture by Moroccan rules)
  if (allLegalMoves.length === 1) {
    const forcedMove = allLegalMoves[0];
    const statsObj = { nodes: 1, endTime: Date.now() + 150 };
    const qScore = quiescence(forcedMove.finalBoard, -Infinity, Infinity, player === -1, rules, statsObj, 0);
    forcedMove.score = qScore;
    return {
      bestMove: forcedMove,
      evaluation: qScore,
      allLegalMoves: [forcedMove],
      stats: {
        nodesEvaluated: statsObj.nodes,
        timeMs: Math.max(1, performance.now() - startTime),
        depthReached: depth,
        totalPossibilities,
        evalScore: qScore,
        isWinning: qScore > 300,
        isLosing: qScore < -300,
      },
    };
  }

  const effectiveTimeCap = Math.max(250, timeLimitMs);
  const endTime = Date.now() + effectiveTimeCap;
  const statsObj = { nodes: 0, endTime };

  // Iterative Deepening
  let bestCompletedMove: Move = allLegalMoves[0];
  let bestCompletedScore = player === 1 ? -Infinity : Infinity;
  let highestCompletedDepth = 1;
  let scoredMoves: Move[] = [...allLegalMoves];

  const maxTargetDepth = Math.max(depth, 8);

  for (let currentDepth = 1; currentDepth <= maxTargetDepth; currentDepth++) {
    if (Date.now() >= endTime) break;

    let iterBestMove: Move = allLegalMoves[0];
    let iterBestScore = player === 1 ? -Infinity : Infinity;
    const currentScoredMoves: Move[] = [];
    let completedFullIteration = true;

    for (const move of allLegalMoves) {
      if (Date.now() >= endTime) {
        completedFullIteration = false;
        break;
      }

      const { score } = minimax(
        move.finalBoard,
        currentDepth - 1,
        -Infinity,
        Infinity,
        player === -1,
        rules,
        statsObj
      );

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
      bestCompletedMove = iterBestMove;
      bestCompletedScore = iterBestScore;
      scoredMoves = currentScoredMoves;

      // Re-sort moves for the next iteration: best move first
      allLegalMoves.sort((a, b) => {
        const scoreA = a.score ?? 0;
        const scoreB = b.score ?? 0;
        return player === 1 ? scoreB - scoreA : scoreA - scoreB;
      });

      // If decisive mate/win found, stop searching early
      if (Math.abs(bestCompletedScore) >= 90000) break;
    }
  }

  // Sort final moves
  scoredMoves.sort((a, b) => {
    const scoreA = a.score ?? 0;
    const scoreB = b.score ?? 0;
    return player === 1 ? scoreB - scoreA : scoreA - scoreB;
  });

  const finalScore = bestCompletedScore === -Infinity || bestCompletedScore === Infinity
    ? evaluateBoard(board)
    : bestCompletedScore;

  const timeMs = Math.round(performance.now() - startTime);

  return {
    bestMove: bestCompletedMove || scoredMoves[0] || null,
    evaluation: finalScore,
    allLegalMoves: scoredMoves,
    stats: {
      nodesEvaluated: statsObj.nodes,
      timeMs,
      depthReached: highestCompletedDepth,
      totalPossibilities,
      evalScore: finalScore,
      isWinning: player === 1 ? finalScore > 400 : finalScore < -400,
      isLosing: player === 1 ? finalScore < -400 : finalScore > 400,
    },
  };
}

/**
 * Pondering Engine:
 * Analyzes all candidate possibilities for opponent (human) while human is thinking!
 * For each human candidate move, it calculates what the position looks like and
 * pre-computes the engine's optimal response and tactical score.
 */
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

    const solution = solvePosition(
      hMove.finalBoard,
      engineTurn,
      depth,
      rules,
      remainingTime
    );

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
