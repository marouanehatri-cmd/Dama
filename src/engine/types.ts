/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Position {
  r: number; // 0 to 7 (row 0 = rank 8, row 7 = rank 1)
  c: number; // 0 to 7 (col 0 = 'a', col 7 = 'h')
}

export type Board = number[][];

export interface Move {
  id: string;
  from: Position;
  to: Position;
  path: Position[]; // Full sequence of landing squares: [from, hop1, hop2, ..., to]
  captured: Position[]; // All opponent pieces captured during this move
  isPromotion: boolean;
  finalBoard: Board;
  notation: string; // e.g. "d4:g7 (x2)" or "c3-d4"
  score?: number; // Minimax evaluation score from player's perspective
}

export interface VariantRules {
  id: 'moroccan' | 'international' | 'spanish' | 'american';
  name: string;
  description: string;
  menCaptureBackwards: boolean;
  mandatoryCapture: boolean;
  maxCaptureMajority: boolean; // Must choose path with maximum number of captured pieces
  flyingKing: boolean;
  kingSweepsLine: boolean; // King can capture contiguous pieces along diagonal if empty square exists behind
  promotionEndsTurn: boolean; // Man reaching king row ends turn immediately even if capture can continue
  kingQualityTiebreak: boolean; // Spanish rule: prefer capturing kings over men if quantity is tied
}

export interface EngineStats {
  nodesEvaluated: number;
  timeMs: number;
  depthReached: number;
  totalPossibilities: number;
  evalScore: number;
  isWinning: boolean;
  isLosing: boolean;
  mateIn?: number;
}

export interface SolverResult {
  bestMove: Move | null;
  evaluation: number;
  stats: EngineStats;
  allLegalMoves: Move[];
}
