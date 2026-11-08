/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Moroccan Dama High-Performance 64-bit Bitboard Engine
 * 
 * Features:
 * - 4x 64-bit Bitboards: whiteMen, whiteKings, blackMen, blackKings
 * - makeMove & undoMove using XOR operations (zero-copy, zero-allocation)
 * - Pre-calculated Piece-Square Tables (PST) with incremental evaluation
 * - Negamax + Alpha-Beta, PVS (Principal Variation Search)
 * - LMR (Late Move Reduction) and Null-Move Pruning (R=2)
 * - Quiescence Search (captures only, eliminates horizon effect)
 * - 1,048,576-entry Transposition Table with 64-bit Zobrist Hashing
 * - Killer Move and History Heuristics for elite move ordering
 * - UI board[64] format support (0=empty, 1=whiteMan, 2=whiteKing, 3=blackMan, 4=blackKing)
 */

import { EngineDifficulty } from './types.ts';

// 64-bit Bitboard representation
export interface Bitboards {
  whiteMen: bigint;
  whiteKings: bigint;
  blackMen: bigint;
  blackKings: bigint;
}

// Move representation
export interface BitboardMove {
  from: number;
  to: number;
  captureCount: number;
  isPromotion: boolean;
  isKing: boolean;
  capturedMenMask: bigint;
  capturedKingsMask: bigint;
  path: number[];
  notation: string;
}

export interface BitboardSearchResult {
  bestMove: BitboardMove | null;
  score: number;
  depthReached: number;
  nodesSearched: number;
  timeMs: number;
  nps: number;
  allLegalMoves: BitboardMove[];
  isBookMove?: boolean;
  isEndgameSolver?: boolean;
}

export interface UIMoveDetails {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  capturedPieces: number[];
  notation: string;
}

// Constants
export const MATE_SCORE = 100000;
export const INF = 300000;
const MAX_PLY = 64;
const TT_SIZE = 1048576; // 1M entries ($2^{20}$)
const TT_MASK = TT_SIZE - 1;

// Mask Constants
export const DARK_SQUARES_MASK = 0xAA55AA55AA55AA55n;
export const WHITE_PROMOTION_MASK = 0x00000000000000FFn; // Row 0
export const BLACK_PROMOTION_MASK = 0xFF00000000000000n; // Row 7
export const BACK_RANK_WHITE_MASK = 0xFF00000000000000n; // Row 7
export const BACK_RANK_BLACK_MASK = 0x00000000000000FFn; // Row 0
export const CENTER_MASK = 0x00003C3C3C3C0000n;          // 4x4 center

// Directions
const DIR_DR = [-1, -1, 1, 1];
const DIR_DC = [-1, 1, -1, 1];

export function getRow(sq: number): number { return sq >> 3; }
export function getCol(sq: number): number { return sq & 7; }
export function getSq(r: number, c: number): number { return (r << 3) | c; }
export function isValidSquare(r: number, c: number): boolean {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}
export function isDarkSquare(r: number, c: number): boolean {
  return ((r + c) & 1) === 1;
}

export function squareToNotation(sq: number): string {
  const col = String.fromCharCode('a'.charCodeAt(0) + getCol(sq));
  const rank = 8 - getRow(sq);
  return `${col}${rank}`;
}

export function popcount(b: bigint): number {
  let count = 0;
  let temp = b;
  while (temp > 0n) {
    count++;
    temp &= temp - 1n;
  }
  return count;
}

// BitScanForward: returns index of lowest set bit (0..63)
export function bitScanForward(b: bigint): number {
  if (b === 0n) return -1;
  const low32 = Number(BigInt.asUintN(32, b));
  if (low32 !== 0) {
    return Math.clz32(low32 & -low32) ^ 31;
  }
  const high32 = Number(BigInt.asUintN(32, b >> 32n));
  return 32 + (Math.clz32(high32 & -high32) ^ 31);
}

// -----------------------------------------------------------------------
// Piece-Square Tables (PST) for Incremental Evaluation
// -----------------------------------------------------------------------
const WHITE_MEN_PST = new Int32Array(64);
const BLACK_MEN_PST = new Int32Array(64);
const KING_PST = new Int32Array(64);

for (let r = 0; r < 8; r++) {
  for (let c = 0; c < 8; c++) {
    const sq = getSq(r, c);
    if (!isDarkSquare(r, c)) continue;

    // White Men PST: Rank advancement towards row 0
    let w = (7 - r) * 12;
    if (r === 1) w += 30; // 7th rank near promotion
    if (r === 2) w += 18; // 6th rank near promotion
    if (r === 7) w += 20; // Back rank protection
    if (c >= 2 && c <= 5 && r >= 2 && r <= 5) w += 15; // Center
    WHITE_MEN_PST[sq] = w;

    // Black Men PST: Rank advancement towards row 7
    let b = r * 12;
    if (r === 6) b += 30;
    if (r === 5) b += 18;
    if (r === 0) b += 20;
    if (c >= 2 && c <= 5 && r >= 2 && r <= 5) b += 15;
    BLACK_MEN_PST[sq] = b;

    // Flying Kings PST: Centralization enables maximum diagonal sweeps
    const distCenter = Math.abs(r - 3.5) + Math.abs(c - 3.5);
    KING_PST[sq] = Math.round((7 - distCenter) * 6);
  }
}

// -----------------------------------------------------------------------
// Zobrist Hashing Setup
// -----------------------------------------------------------------------
const ZOBRIST_TABLE = new BigUint64Array(64 * 5);
let ZOBRIST_SIDE = 0n;

function initZobrist() {
  let seed = 0xD4A07CAFE1234567n;
  function nextRand(): bigint {
    seed = (seed * 6364136223846793005n + 1442695040888963407n) & 0xFFFFFFFFFFFFFFFFn;
    return seed;
  }
  for (let i = 0; i < 64 * 5; i++) {
    ZOBRIST_TABLE[i] = nextRand();
  }
  ZOBRIST_SIDE = nextRand();
}
initZobrist();

export function computeZobrist(bb: Bitboards, isWhite: boolean): bigint {
  let hash = 0n;
  let wm = bb.whiteMen;
  while (wm > 0n) {
    const sq = bitScanForward(wm);
    hash ^= ZOBRIST_TABLE[sq * 5 + 1];
    wm &= wm - 1n;
  }
  let wk = bb.whiteKings;
  while (wk > 0n) {
    const sq = bitScanForward(wk);
    hash ^= ZOBRIST_TABLE[sq * 5 + 2];
    wk &= wk - 1n;
  }
  let bm = bb.blackMen;
  while (bm > 0n) {
    const sq = bitScanForward(bm);
    hash ^= ZOBRIST_TABLE[sq * 5 + 3];
    bm &= bm - 1n;
  }
  let bk = bb.blackKings;
  while (bk > 0n) {
    const sq = bitScanForward(bk);
    hash ^= ZOBRIST_TABLE[sq * 5 + 4];
    bk &= bk - 1n;
  }
  if (!isWhite) {
    hash ^= ZOBRIST_SIDE;
  }
  return hash;
}

// -----------------------------------------------------------------------
// Transposition Table (Flat Typed Arrays for Zero GC)
// -----------------------------------------------------------------------
const ttKeyHigh = new Uint32Array(TT_SIZE);
const ttKeyLow  = new Uint32Array(TT_SIZE);
const ttScore   = new Int32Array(TT_SIZE);
const ttDepth   = new Int8Array(TT_SIZE);
const ttFlag    = new Uint8Array(TT_SIZE); // 0=EXACT, 1=LOWERBOUND, 2=UPPERBOUND
const ttFrom    = new Int8Array(TT_SIZE);
const ttTo      = new Int8Array(TT_SIZE);

// Search Heuristics
const killerMoves = Array.from({ length: MAX_PLY }, () => [
  { from: -1, to: -1 },
  { from: -1, to: -1 },
]);
const historyTable = new Int32Array(64 * 64);

// -----------------------------------------------------------------------
// Conversion Functions
// -----------------------------------------------------------------------

/** Convert UI board[64] to 4x 64-bit Bitboards */
export function toBitboard(board64: number[]): Bitboards {
  let whiteMen = 0n;
  let whiteKings = 0n;
  let blackMen = 0n;
  let blackKings = 0n;

  for (let sq = 0; sq < 64; sq++) {
    const mask = 1n << BigInt(sq);
    switch (board64[sq]) {
      case 1: whiteMen   |= mask; break;
      case 2: whiteKings |= mask; break;
      case 3: blackMen   |= mask; break;
      case 4: blackKings |= mask; break;
      default: break;
    }
  }
  return { whiteMen, whiteKings, blackMen, blackKings };
}

/** Convert 4x 64-bit Bitboards to UI board[64] */
export function fromBitboard(bb: Bitboards): number[] {
  const board64 = new Array(64).fill(0);
  for (let sq = 0; sq < 64; sq++) {
    const mask = 1n << BigInt(sq);
    if ((bb.whiteMen & mask) !== 0n)        board64[sq] = 1;
    else if ((bb.whiteKings & mask) !== 0n) board64[sq] = 2;
    else if ((bb.blackMen & mask) !== 0n)   board64[sq] = 3;
    else if ((bb.blackKings & mask) !== 0n) board64[sq] = 4;
  }
  return board64;
}

/** Convert internal BitboardMove to UI details */
export function fromBitboardToMove(move: BitboardMove): UIMoveDetails {
  const capturedPieces: number[] = [];
  let caps = move.capturedMenMask | move.capturedKingsMask;
  while (caps > 0n) {
    const sq = bitScanForward(caps);
    capturedPieces.push(sq);
    caps &= caps - 1n;
  }
  return {
    fromRow: getRow(move.from),
    fromCol: getCol(move.from),
    toRow: getRow(move.to),
    toCol: getCol(move.to),
    capturedPieces,
    notation: move.notation,
  };
}

// -----------------------------------------------------------------------
// Fast MakeMove and UndoMove using Bitwise XOR
// -----------------------------------------------------------------------
export function makeMove(bb: Bitboards, m: BitboardMove, isWhite: boolean): void {
  const fromMask = 1n << BigInt(m.from);
  const toMask   = 1n << BigInt(m.to);
  const moveMask = fromMask | toMask;

  if (isWhite) {
    if (m.isKing) {
      bb.whiteKings ^= moveMask;
    } else {
      bb.whiteMen ^= moveMask;
      if (m.isPromotion) {
        bb.whiteMen   ^= toMask;
        bb.whiteKings ^= toMask;
      }
    }
    if (m.capturedMenMask !== 0n)   bb.blackMen   ^= m.capturedMenMask;
    if (m.capturedKingsMask !== 0n) bb.blackKings ^= m.capturedKingsMask;
  } else {
    if (m.isKing) {
      bb.blackKings ^= moveMask;
    } else {
      bb.blackMen ^= moveMask;
      if (m.isPromotion) {
        bb.blackMen   ^= toMask;
        bb.blackKings ^= toMask;
      }
    }
    if (m.capturedMenMask !== 0n)   bb.whiteMen   ^= m.capturedMenMask;
    if (m.capturedKingsMask !== 0n) bb.whiteKings ^= m.capturedKingsMask;
  }
}

export function undoMove(bb: Bitboards, m: BitboardMove, isWhite: boolean): void {
  const fromMask = 1n << BigInt(m.from);
  const toMask   = 1n << BigInt(m.to);
  const moveMask = fromMask | toMask;

  if (isWhite) {
    if (m.isKing) {
      bb.whiteKings ^= moveMask;
    } else {
      if (m.isPromotion) {
        bb.whiteKings ^= toMask;
        bb.whiteMen   ^= toMask;
      }
      bb.whiteMen ^= moveMask;
    }
    if (m.capturedMenMask !== 0n)   bb.blackMen   ^= m.capturedMenMask;
    if (m.capturedKingsMask !== 0n) bb.blackKings ^= m.capturedKingsMask;
  } else {
    if (m.isKing) {
      bb.blackKings ^= moveMask;
    } else {
      if (m.isPromotion) {
        bb.blackKings ^= toMask;
        bb.blackMen   ^= toMask;
      }
      bb.blackMen ^= moveMask;
    }
    if (m.capturedMenMask !== 0n)   bb.whiteMen   ^= m.capturedMenMask;
    if (m.capturedKingsMask !== 0n) bb.whiteKings ^= m.capturedKingsMask;
  }
}

// -----------------------------------------------------------------------
// Moroccan Dama Move Generation (Bitboard + Majority Rule)
// -----------------------------------------------------------------------
export function generateLegalMoves(bb: Bitboards, isWhite: boolean): BitboardMove[] {
  const captures = generateCaptures(bb, isWhite);
  if (captures.length > 0) {
    return captures; // Mandatory capture rule
  }
  return generateQuietMoves(bb, isWhite);
}

export function generateCaptures(bb: Bitboards, isWhite: boolean): BitboardMove[] {
  const friendlyMen   = isWhite ? bb.whiteMen   : bb.blackMen;
  const friendlyKings = isWhite ? bb.whiteKings : bb.blackKings;
  const enemyMen      = isWhite ? bb.blackMen   : bb.whiteMen;
  const enemyKings    = isWhite ? bb.blackKings : bb.whiteKings;

  const allCaptures: BitboardMove[] = [];
  let maxCaptureCount = 0;

  // 1. Man Captures
  let men = friendlyMen;
  while (men > 0n) {
    const sq = bitScanForward(men);
    const m: BitboardMove = {
      from: sq,
      to: sq,
      captureCount: 0,
      isPromotion: false,
      isKing: false,
      capturedMenMask: 0n,
      capturedKingsMask: 0n,
      path: [sq],
      notation: '',
    };
    findManCaptures(sq, friendlyMen, friendlyKings, enemyMen, enemyKings,
                    isWhite, m, allCaptures, max);
    men &= men - 1n;
  }

  function max(cnt: number) {
    if (cnt > maxCaptureCount) maxCaptureCount = cnt;
  }

  // 2. Flying King Captures
  let kings = friendlyKings;
  while (kings > 0n) {
    const sq = bitScanForward(kings);
    const m: BitboardMove = {
      from: sq,
      to: sq,
      captureCount: 0,
      isPromotion: false,
      isKing: true,
      capturedMenMask: 0n,
      capturedKingsMask: 0n,
      path: [sq],
      notation: '',
    };
    findKingCaptures(sq, friendlyMen, friendlyKings, enemyMen, enemyKings,
                     isWhite, m, allCaptures, max);
    kings &= kings - 1n;
  }

  // Moroccan Majority Rule: Retain only captures of maximum length
  if (maxCaptureCount === 0) return [];
  return allCaptures.filter(c => c.captureCount === maxCaptureCount);
}

function findManCaptures(
  currentSq: number,
  menBB: bigint,
  kingsBB: bigint,
  enemyMenBB: bigint,
  enemyKingsBB: bigint,
  isWhite: boolean,
  currentMove: BitboardMove,
  allCaptures: BitboardMove[],
  updateMax: (cnt: number) => void
): void {
  const r = getRow(currentSq);
  const c = getCol(currentSq);
  let hasBranch = false;

  const forwardDr = isWhite ? -1 : 1;
  const targetRow = r + 2 * forwardDr;

  if (targetRow >= 0 && targetRow < 8) {
    for (const dc of [-1, 1]) {
      const overR = r + forwardDr;
      const overC = c + dc;
      const landR = targetRow;
      const landC = c + 2 * dc;

      if (isValidSquare(landR, landC) && isDarkSquare(landR, landC)) {
        const overSq = getSq(overR, overC);
        const landSq = getSq(landR, landC);
        const overMask = 1n << BigInt(overSq);
        const landMask = 1n << BigInt(landSq);

        const isEnemyMan  = (enemyMenBB   & overMask) !== 0n;
        const isEnemyKing = (enemyKingsBB & overMask) !== 0n;
        const alreadyCaptured = currentMove.capturedMenMask | currentMove.capturedKingsMask;

        if ((isEnemyMan || isEnemyKing) && (alreadyCaptured & overMask) === 0n) {
          const occupied = (menBB | kingsBB | enemyMenBB | enemyKingsBB) & ~alreadyCaptured;
          const occupiedWithoutFrom = occupied & ~(1n << BigInt(currentMove.from));

          if ((occupiedWithoutFrom & landMask) === 0n) {
            hasBranch = true;
            const nextMove: BitboardMove = {
              from: currentMove.from,
              to: landSq,
              captureCount: currentMove.captureCount + 1,
              isPromotion: currentMove.isPromotion,
              isKing: false,
              capturedMenMask: currentMove.capturedMenMask | (isEnemyMan ? overMask : 0n),
              capturedKingsMask: currentMove.capturedKingsMask | (isEnemyKing ? overMask : 0n),
              path: [...currentMove.path, landSq],
              notation: '',
            };

            const reachesPromotion = (isWhite && landR === 0) || (!isWhite && landR === 7);
            if (reachesPromotion) {
              nextMove.isPromotion = true;
              nextMove.notation = `${squareToNotation(nextMove.from)}x${squareToNotation(landSq)}`;
              updateMax(nextMove.captureCount);
              allCaptures.push(nextMove);
            } else {
              findManCaptures(landSq, menBB, kingsBB, enemyMenBB, enemyKingsBB,
                              isWhite, nextMove, allCaptures, updateMax);
            }
          }
        }
      }
    }
  }

  if (!hasBranch && currentMove.captureCount > 0) {
    currentMove.notation = `${squareToNotation(currentMove.from)}x${squareToNotation(currentMove.to)}`;
    updateMax(currentMove.captureCount);
    allCaptures.push(currentMove);
  }
}

function findKingCaptures(
  currentSq: number,
  menBB: bigint,
  kingsBB: bigint,
  enemyMenBB: bigint,
  enemyKingsBB: bigint,
  isWhite: boolean,
  currentMove: BitboardMove,
  allCaptures: BitboardMove[],
  updateMax: (cnt: number) => void
): void {
  const r = getRow(currentSq);
  const c = getCol(currentSq);
  let hasBranch = false;

  const alreadyCaptured = currentMove.capturedMenMask | currentMove.capturedKingsMask;
  const friendlyPieces = (menBB | kingsBB) & ~(1n << BigInt(currentMove.from));
  const enemyPieces    = (enemyMenBB | enemyKingsBB) & ~alreadyCaptured;

  for (let d = 0; d < 4; d++) {
    const dr = DIR_DR[d];
    const dc = DIR_DC[d];

    let curR = r + dr;
    let curC = c + dc;
    let enemySq = -1;
    let isEnemyMan = false;
    let isEnemyKing = false;

    while (isValidSquare(curR, curC)) {
      const sq = getSq(curR, curC);
      const mask = 1n << BigInt(sq);

      if ((friendlyPieces & mask) !== 0n) break; // Friendly piece block
      if ((enemyPieces & mask) !== 0n) {
        enemySq = sq;
        isEnemyMan  = (enemyMenBB   & mask) !== 0n;
        isEnemyKing = (enemyKingsBB & mask) !== 0n;
        break;
      }
      curR += dr;
      curC += dc;
    }

    if (enemySq !== -1) {
      let landR = getRow(enemySq) + dr;
      let landC = getCol(enemySq) + dc;

      while (isValidSquare(landR, landC)) {
        const landSq = getSq(landR, landC);
        const landMask = 1n << BigInt(landSq);

        if (((friendlyPieces | enemyPieces) & landMask) !== 0n) break;

        hasBranch = true;
        const enemyMask = 1n << BigInt(enemySq);
        const nextMove: BitboardMove = {
          from: currentMove.from,
          to: landSq,
          captureCount: currentMove.captureCount + 1,
          isPromotion: false,
          isKing: true,
          capturedMenMask: currentMove.capturedMenMask | (isEnemyMan ? enemyMask : 0n),
          capturedKingsMask: currentMove.capturedKingsMask | (isEnemyKing ? enemyMask : 0n),
          path: [...currentMove.path, landSq],
          notation: '',
        };

        findKingCaptures(landSq, menBB, kingsBB, enemyMenBB, enemyKingsBB,
                         isWhite, nextMove, allCaptures, updateMax);

        landR += dr;
        landC += dc;
      }
    }
  }

  if (!hasBranch && currentMove.captureCount > 0) {
    currentMove.notation = `${squareToNotation(currentMove.from)}x${squareToNotation(currentMove.to)}`;
    updateMax(currentMove.captureCount);
    allCaptures.push(currentMove);
  }
}

export function generateQuietMoves(bb: Bitboards, isWhite: boolean): BitboardMove[] {
  const quietMoves: BitboardMove[] = [];
  const occupied = bb.whiteMen | bb.whiteKings | bb.blackMen | bb.blackKings;
  const friendlyMen   = isWhite ? bb.whiteMen   : bb.blackMen;
  const friendlyKings = isWhite ? bb.whiteKings : bb.blackKings;

  // 1. Men Quiet Moves
  const forwardDr = isWhite ? -1 : 1;
  let men = friendlyMen;
  while (men > 0n) {
    const sq = bitScanForward(men);
    const r = getRow(sq);
    const c = getCol(sq);
    const targetR = r + forwardDr;

    if (targetR >= 0 && targetR < 8) {
      for (const dc of [-1, 1]) {
        const targetC = c + dc;
        if (isValidSquare(targetR, targetC) && isDarkSquare(targetR, targetC)) {
          const toSq = getSq(targetR, targetC);
          if ((occupied & (1n << BigInt(toSq))) === 0n) {
            const isPromotion = (isWhite && targetR === 0) || (!isWhite && targetR === 7);
            quietMoves.push({
              from: sq,
              to: toSq,
              captureCount: 0,
              isPromotion,
              isKing: false,
              capturedMenMask: 0n,
              capturedKingsMask: 0n,
              path: [sq, toSq],
              notation: `${squareToNotation(sq)}-${squareToNotation(toSq)}`,
            });
          }
        }
      }
    }
    men &= men - 1n;
  }

  // 2. Flying King Quiet Moves
  let kings = friendlyKings;
  while (kings > 0n) {
    const sq = bitScanForward(kings);
    const r = getRow(sq);
    const c = getCol(sq);

    for (let d = 0; d < 4; d++) {
      const dr = DIR_DR[d];
      const dc = DIR_DC[d];
      let curR = r + dr;
      let curC = c + dc;

      while (isValidSquare(curR, curC)) {
        const toSq = getSq(curR, curC);
        if ((occupied & (1n << BigInt(toSq))) !== 0n) break;

        quietMoves.push({
          from: sq,
          to: toSq,
          captureCount: 0,
          isPromotion: false,
          isKing: true,
          capturedMenMask: 0n,
          capturedKingsMask: 0n,
          path: [sq, toSq],
          notation: `${squareToNotation(sq)}-${squareToNotation(toSq)}`,
        });

        curR += dr;
        curC += dc;
      }
    }
    kings &= kings - 1n;
  }

  return quietMoves;
}

// -----------------------------------------------------------------------
// Fast Static Evaluation Function
// -----------------------------------------------------------------------
export function evaluateBitboards(bb: Bitboards, isWhite: boolean): number {
  const allPieces = bb.whiteMen | bb.whiteKings | bb.blackMen | bb.blackKings;
  const totalPieces = popcount(allPieces);

  // Endgame Specialized Evaluator (<= 6 pieces)
  if (totalPieces <= 6) {
    return evaluateEndgame(bb, isWhite);
  }

  const wmCount = popcount(bb.whiteMen);
  const wkCount = popcount(bb.whiteKings);
  const bmCount = popcount(bb.blackMen);
  const bkCount = popcount(bb.blackKings);

  let whiteScore = wmCount * 100 + wkCount * 300;
  let blackScore = bmCount * 100 + bkCount * 300;

  // Incremental PST accumulator
  let wm = bb.whiteMen;
  while (wm > 0n) {
    whiteScore += WHITE_MEN_PST[bitScanForward(wm)];
    wm &= wm - 1n;
  }
  let wk = bb.whiteKings;
  while (wk > 0n) {
    whiteScore += KING_PST[bitScanForward(wk)];
    wk &= wk - 1n;
  }

  let bm = bb.blackMen;
  while (bm > 0n) {
    blackScore += BLACK_MEN_PST[bitScanForward(bm)];
    bm &= bm - 1n;
  }
  let bk = bb.blackKings;
  while (bk > 0n) {
    blackScore += KING_PST[bitScanForward(bk)];
    bk &= bk - 1n;
  }

  // Back Rank Defense
  const whiteBack = popcount(bb.whiteMen & BACK_RANK_WHITE_MASK);
  const blackBack = popcount(bb.blackMen & BACK_RANK_BLACK_MASK);
  whiteScore += whiteBack * 15;
  blackScore += blackBack * 15;

  // Center Control
  const whiteCenter = popcount((bb.whiteMen | bb.whiteKings) & CENTER_MASK);
  const blackCenter = popcount((bb.blackMen | bb.blackKings) & CENTER_MASK);
  whiteScore += whiteCenter * 10;
  blackScore += blackCenter * 10;

  const score = whiteScore - blackScore;
  return isWhite ? score : -score;
}

function evaluateEndgame(bb: Bitboards, isWhite: boolean): number {
  const wm = popcount(bb.whiteMen);
  const wk = popcount(bb.whiteKings);
  const bm = popcount(bb.blackMen);
  const bk = popcount(bb.blackKings);

  const whiteTotal = wm + wk;
  const blackTotal = bm + bk;

  if (whiteTotal === 0) return isWhite ? -MATE_SCORE : MATE_SCORE;
  if (blackTotal === 0) return isWhite ? MATE_SCORE : -MATE_SCORE;

  let whiteScore = wm * 100 + wk * 350;
  let blackScore = bm * 100 + bk * 350;

  // King vs King trapped on edge bonus (+500)
  if (wk >= 1 && bk >= 1) {
    let bkBits = bb.blackKings;
    while (bkBits > 0n) {
      const sq = bitScanForward(bkBits);
      const r = getRow(sq);
      const c = getCol(sq);
      if (r === 0 || r === 7 || c === 0 || c === 7) {
        whiteScore += 150;
      }
      bkBits &= bkBits - 1n;
    }
    let wkBits = bb.whiteKings;
    while (wkBits > 0n) {
      const sq = bitScanForward(wkBits);
      const r = getRow(sq);
      const c = getCol(sq);
      if (r === 0 || r === 7 || c === 0 || c === 7) {
        blackScore += 150;
      }
      wkBits &= wkBits - 1n;
    }
  }

  // King + Man vs King: Escort bonus (+300)
  if (wk >= 1 && wm >= 1 && bk === 1 && bm === 0) whiteScore += 300;
  if (bk >= 1 && bm >= 1 && wk === 1 && wm === 0) blackScore += 300;

  // Opposition advancement
  let w = bb.whiteMen;
  while (w > 0n) {
    whiteScore += (7 - getRow(bitScanForward(w))) * 20;
    w &= w - 1n;
  }
  let b = bb.blackMen;
  while (b > 0n) {
    blackScore += getRow(bitScanForward(b)) * 20;
    b &= b - 1n;
  }

  const score = whiteScore - blackScore;
  return isWhite ? score : -score;
}

// -----------------------------------------------------------------------
// Stockfish-Style Search: Negamax + PVS + LMR + Null-Move + Quiescence
// -----------------------------------------------------------------------
let nodesCount = 0;
let stopSearchFlag = false;
let startTime = 0;
let timeLimit = 800;

function scoreAndSortMoves(moves: BitboardMove[], ttFromSq: number, ttToSq: number, ply: number): void {
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    let score = 0;

    // 1. TT Best Move
    if (m.from === ttFromSq && m.to === ttToSq) {
      score = 1000000;
    }
    // 2. Captures: Majority Rule (most captures first)
    else if (m.captureCount > 0) {
      score = 100000 + m.captureCount * 10000;
      if (m.capturedKingsMask !== 0n) score += 5000;
      if (m.isPromotion) score += 3000;
    }
    // 3. Promotions
    else if (m.isPromotion) {
      score = 80000;
    }
    // 4. Killer Moves
    else if (ply < MAX_PLY && (
      (killerMoves[ply][0].from === m.from && killerMoves[ply][0].to === m.to) ||
      (killerMoves[ply][1].from === m.from && killerMoves[ply][1].to === m.to)
    )) {
      score = 50000;
    }
    // 5. History Heuristic
    else {
      score = historyTable[m.from * 64 + m.to];
    }
    (m as any)._sortScore = score;
  }

  moves.sort((a, b) => (b as any)._sortScore - (a as any)._sortScore);
}

function quiescence(bb: Bitboards, alpha: number, beta: number, isWhite: boolean, ply: number): number {
  nodesCount++;
  if ((nodesCount & 2047) === 0) {
    if (performance.now() - startTime >= timeLimit) {
      stopSearchFlag = true;
      return alpha;
    }
  }

  if (ply >= MAX_PLY - 1) {
    return evaluateBitboards(bb, isWhite);
  }

  const captures = generateCaptures(bb, isWhite);
  if (captures.length === 0) {
    const standPat = evaluateBitboards(bb, isWhite);
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
    return alpha;
  }

  scoreAndSortMoves(captures, -1, -1, ply);

  for (let i = 0; i < captures.length; i++) {
    const m = captures[i];
    makeMove(bb, m, isWhite);
    const score = -quiescence(bb, -beta, -alpha, !isWhite, ply + 1);
    undoMove(bb, m, isWhite);

    if (stopSearchFlag) return alpha;
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }

  return alpha;
}

function negamax(
  bb: Bitboards,
  depth: number,
  alpha: number,
  beta: number,
  isWhite: boolean,
  ply: number,
  allowNull = true
): number {
  if (stopSearchFlag) return alpha;

  nodesCount++;
  if ((nodesCount & 2047) === 0) {
    if (performance.now() - startTime >= timeLimit) {
      stopSearchFlag = true;
      return alpha;
    }
  }

  if (depth <= 0) {
    return quiescence(bb, alpha, beta, isWhite, ply);
  }

  if (ply >= MAX_PLY - 1) {
    return evaluateBitboards(bb, isWhite);
  }

  const hash = computeZobrist(bb, isWhite);
  const hashLow = Number(BigInt.asUintN(32, hash));
  const hashHigh = Number(BigInt.asUintN(32, hash >> 32n));
  const ttIdx = hashLow & TT_MASK;

  let ttFromSq = -1;
  let ttToSq = -1;

  if (ttKeyLow[ttIdx] === hashLow && ttKeyHigh[ttIdx] === hashHigh && ttDepth[ttIdx] >= depth) {
    ttFromSq = ttFrom[ttIdx];
    ttToSq = ttTo[ttIdx];
    const flag = ttFlag[ttIdx];
    const score = ttScore[ttIdx];

    if (flag === 0) return score; // EXACT
    if (flag === 1 && score >= beta) return score; // LOWERBOUND
    if (flag === 2 && score <= alpha) return score; // UPPERBOUND
  }

  const legalMoves = generateLegalMoves(bb, isWhite);
  if (legalMoves.length === 0) {
    return -MATE_SCORE + ply; // Loss: blocked or no pieces
  }

  const inCapture = legalMoves[0].captureCount > 0;

  // 1. Null-Move Pruning (R = 2)
  if (allowNull && !inCapture && depth >= 3 && popcount(bb.whiteMen | bb.whiteKings | bb.blackMen | bb.blackKings) > 6) {
    const nullScore = -negamax(bb, depth - 1 - 2, -beta, -beta + 1, !isWhite, ply + 1, false);
    if (nullScore >= beta) {
      return beta;
    }
  }

  scoreAndSortMoves(legalMoves, ttFromSq, ttToSq, ply);

  let bestScore = -INF;
  let bestMove: BitboardMove = legalMoves[0];
  const origAlpha = alpha;

  for (let i = 0; i < legalMoves.length; i++) {
    const m = legalMoves[i];
    makeMove(bb, m, isWhite);

    let score = 0;
    if (i === 0) {
      // First move: full window search
      score = -negamax(bb, depth - 1, -beta, -alpha, !isWhite, ply + 1, true);
    } else {
      // Late Move Reductions (LMR)
      let reduction = 0;
      if (i >= 4 && depth >= 3 && m.captureCount === 0 && !m.isPromotion) {
        reduction = 1;
        if (i >= 8 && depth >= 5) reduction = 2;
      }

      // Zero-window search
      score = -negamax(bb, depth - 1 - reduction, -alpha - 1, -alpha, !isWhite, ply + 1, true);

      // Re-search at full depth if fail-high
      if (score > alpha && (reduction > 0 || score < beta)) {
        score = -negamax(bb, depth - 1, -beta, -alpha, !isWhite, ply + 1, true);
      }
    }

    undoMove(bb, m, isWhite);

    if (stopSearchFlag) return alpha;

    if (score > bestScore) {
      bestScore = score;
      bestMove = m;
    }

    if (score > alpha) {
      alpha = score;
    }

    if (alpha >= beta) {
      // Beta Cutoff: Update killers and history
      if (m.captureCount === 0 && ply < MAX_PLY) {
        if (killerMoves[ply][0].from !== m.from || killerMoves[ply][0].to !== m.to) {
          killerMoves[ply][1] = killerMoves[ply][0];
          killerMoves[ply][0] = { from: m.from, to: m.to };
        }
        historyTable[m.from * 64 + m.to] += depth * depth;
      }
      break;
    }
  }

  // Update Transposition Table
  ttKeyLow[ttIdx] = hashLow;
  ttKeyHigh[ttIdx] = hashHigh;
  ttScore[ttIdx] = bestScore;
  ttDepth[ttIdx] = depth;
  ttFrom[ttIdx] = bestMove.from;
  ttTo[ttIdx] = bestMove.to;

  if (bestScore <= origAlpha) {
    ttFlag[ttIdx] = 2; // UPPERBOUND
  } else if (bestScore >= beta) {
    ttFlag[ttIdx] = 1; // LOWERBOUND
  } else {
    ttFlag[ttIdx] = 0; // EXACT
  }

  return bestScore;
}

// -----------------------------------------------------------------------
// Primary Entry Point: Search from Bitboards
// -----------------------------------------------------------------------
export function searchBitboardPosition(
  bb: Bitboards,
  isWhite: boolean,
  timeLimitMs = 800,
  maxDepth = 12
): BitboardSearchResult {
  startTime = performance.now();
  timeLimit = timeLimitMs;
  nodesCount = 0;
  stopSearchFlag = false;

  const legalMoves = generateLegalMoves(bb, isWhite);
  if (legalMoves.length === 0) {
    return {
      bestMove: null,
      score: -MATE_SCORE,
      depthReached: 0,
      nodesSearched: 0,
      timeMs: 0,
      nps: 0,
      allLegalMoves: [],
    };
  }

  if (legalMoves.length === 1) {
    return {
      bestMove: legalMoves[0],
      score: 0,
      depthReached: 1,
      nodesSearched: 1,
      timeMs: 1,
      nps: 1000,
      allLegalMoves: legalMoves,
    };
  }

  let globalBestMove = legalMoves[0];
  let globalBestScore = -INF;
  let depthReached = 1;

  for (let d = 1; d <= maxDepth; d++) {
    let alpha = -INF;
    let beta = INF;

    // Aspiration windows for depth >= 5
    if (d >= 5 && Math.abs(globalBestScore) < 50000) {
      alpha = globalBestScore - 50;
      beta  = globalBestScore + 50;
    }

    let score = negamax(bb, d, alpha, beta, isWhite, 0, false);

    if (!stopSearchFlag && d >= 5 && (score <= alpha || score >= beta)) {
      score = negamax(bb, d, -INF, INF, isWhite, 0, false);
    }

    if (stopSearchFlag && d > 1) break;

    const hash = computeZobrist(bb, isWhite);
    const hashLow = Number(BigInt.asUintN(32, hash));
    const ttIdx = hashLow & TT_MASK;

    if (ttFrom[ttIdx] >= 0) {
      const match = legalMoves.find(m => m.from === ttFrom[ttIdx] && m.to === ttTo[ttIdx]);
      if (match) {
        globalBestMove = match;
        globalBestScore = score;
      }
    }

    depthReached = d;

    if (performance.now() - startTime >= timeLimit) break;
  }

  const elapsed = Math.max(1, performance.now() - startTime);
  const nps = Math.round((nodesCount / elapsed) * 1000);

  return {
    bestMove: globalBestMove,
    score: globalBestScore,
    depthReached,
    nodesSearched: nodesCount,
    timeMs: Math.round(elapsed),
    nps,
    allLegalMoves: legalMoves,
  };
}

/** Primary API: Get best move from board[64] */
export function getBestMove(
  board64: number[],
  turn = 1,
  timeLimitMs = 800,
  maxDepth = 12
): BitboardSearchResult {
  const bb = toBitboard(board64);
  const isWhite = turn === 1;
  return searchBitboardPosition(bb, isWhite, timeLimitMs, maxDepth);
}

/** Convert 8x8 2D board to board[64] format */
export function board2DToBoard64(board: number[][]): number[] {
  const board64 = new Array(64).fill(0);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const val = board[r][c];
      const sq = (r << 3) | c;
      if (val === 1) board64[sq] = 1;       // White Man
      else if (val === 2) board64[sq] = 2;  // White King
      else if (val === -1) board64[sq] = 3; // Black Man
      else if (val === -2) board64[sq] = 4; // Black King
      else board64[sq] = 0;
    }
  }
  return board64;
}

/** Convert board[64] format to 8x8 2D board */
export function board64ToBoard2D(board64: number[]): number[][] {
  const board: number[][] = Array.from({ length: 8 }, () => Array(8).fill(0));
  for (let sq = 0; sq < 64; sq++) {
    const r = sq >> 3;
    const c = sq & 7;
    const val = board64[sq];
    if (val === 1) board[r][c] = 1;
    else if (val === 2) board[r][c] = 2;
    else if (val === 3) board[r][c] = -1;
    else if (val === 4) board[r][c] = -2;
  }
  return board;
}

/** Convert internal BitboardMove to UI Move format */
export function bitboardMoveToMove(
  m: BitboardMove,
  currentBoard2D: number[][],
  isWhite: boolean
): import('./types.ts').Move {
  const fromPos = { r: getRow(m.from), c: getCol(m.from) };
  const toPos = { r: getRow(m.to), c: getCol(m.to) };
  const path = m.path.map(sq => ({ r: getRow(sq), c: getCol(sq) }));

  const captured: { r: number; c: number }[] = [];
  let caps = m.capturedMenMask | m.capturedKingsMask;
  while (caps > 0n) {
    const sq = bitScanForward(caps);
    captured.push({ r: getRow(sq), c: getCol(sq) });
    caps &= caps - 1n;
  }

  const nextBoard = currentBoard2D.map(row => [...row]);
  const movingPiece = nextBoard[fromPos.r][fromPos.c] || (isWhite ? 1 : -1);
  nextBoard[fromPos.r][fromPos.c] = 0;

  for (const c of captured) {
    nextBoard[c.r][c.c] = 0;
  }

  if (m.isPromotion) {
    nextBoard[toPos.r][toPos.c] = isWhite ? 2 : -2;
  } else {
    nextBoard[toPos.r][toPos.c] = movingPiece;
  }

  const notation = m.captureCount > 0
    ? `${squareToNotation(m.from)}x${squareToNotation(m.to)}${m.captureCount > 1 ? ` (x${m.captureCount})` : ''}`
    : `${squareToNotation(m.from)}-${squareToNotation(m.to)}`;

  return {
    id: `${squareToNotation(m.from)}_${squareToNotation(m.to)}_${m.captureCount}`,
    from: fromPos,
    to: toPos,
    path,
    captured,
    isPromotion: m.isPromotion,
    finalBoard: nextBoard,
    notation,
  };
}

