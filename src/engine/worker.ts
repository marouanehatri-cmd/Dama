/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { solvePosition } from './engine.ts';
import { Board, EngineDifficulty, VariantRules } from './types.ts';

export interface WorkerSolveRequest {
  id: string;
  board: Board;
  player: 1 | -1;
  depth: number;
  rules: VariantRules;
  timeLimitMs: number;
  difficulty: EngineDifficulty;
}

export interface WorkerSolveResponse {
  id: string;
  type: 'RESULT' | 'ERROR';
  result?: ReturnType<typeof solvePosition>;
  error?: string;
}

self.onmessage = (e: MessageEvent<WorkerSolveRequest>) => {
  const { id, board, player, depth, rules, timeLimitMs, difficulty } = e.data;
  try {
    const result = solvePosition(board, player, depth, rules, timeLimitMs, difficulty);
    self.postMessage({ id, type: 'RESULT', result });
  } catch (err) {
    self.postMessage({ id, type: 'ERROR', error: String(err) });
  }
};
