/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { solvePosition } from './engine.ts';
import { Board, EngineDifficulty, SolverResult, VariantRules } from './types.ts';
import { WorkerSolveRequest, WorkerSolveResponse } from './worker.ts';

let workerInstance: Worker | null = null;
let currentRequestId = 0;
const pendingRequests = new Map<string, (result: SolverResult) => void>();

function getWorker(): Worker | null {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    return null;
  }
  if (!workerInstance) {
    try {
      workerInstance = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      workerInstance.onmessage = (e: MessageEvent<WorkerSolveResponse>) => {
        const { id, type, result } = e.data;
        const resolver = pendingRequests.get(id);
        if (resolver) {
          pendingRequests.delete(id);
          if (type === 'RESULT' && result) {
            resolver(result);
          }
        }
      };
      workerInstance.onerror = () => {
        // Fallback on worker crash
        workerInstance?.terminate();
        workerInstance = null;
      };
    } catch {
      workerInstance = null;
    }
  }
  return workerInstance;
}

/**
 * Solve board position asynchronously using Web Worker (with 0 UI lag)
 * Falls back to direct synchronous solvePosition if Workers are unsupported
 */
export async function solvePositionAsync(
  board: Board,
  player: 1 | -1,
  depth: number = 11,
  rules: VariantRules,
  timeLimitMs: number = 1500,
  difficulty: EngineDifficulty = 'IMPOSSIBLE'
): Promise<SolverResult> {
  const worker = getWorker();
  if (!worker) {
    // Synchronous execution fallback
    return solvePosition(board, player, depth, rules, timeLimitMs, difficulty);
  }

  const id = `req_${++currentRequestId}_${Date.now()}`;
  return new Promise(resolve => {
    pendingRequests.set(id, resolve);
    const msg: WorkerSolveRequest = {
      id,
      board,
      player,
      depth,
      rules,
      timeLimitMs,
      difficulty,
    };
    worker.postMessage(msg);
  });
}
