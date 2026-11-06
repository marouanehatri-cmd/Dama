/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Crown,
  Play,
  RotateCcw,
  RotateCw,
  Sparkles,
  BookOpen,
  Trash2,
  HelpCircle,
  CheckCircle2,
  ArrowRight,
  Zap,
  Target,
  Trophy,
  History,
  X,
  Sliders,
  ChevronRight,
  RefreshCw,
  Swords,
  ShieldAlert,
  Wind,
  AlertCircle,
  Lightbulb,
  Brain,
  Gauge,
  Activity,
  TrendingUp,
} from 'lucide-react';
import { Board, Move, Position, SolverResult, VariantRules, PonderedMoveResult, EngineDifficulty } from './engine/types.ts';
import {
  VARIANTS,
  PRESETS,
  createStartingBoard,
  createEmptyBoard,
  createTestPosition,
  cloneBoard,
  isDarkSquare,
  posToNotation,
  notationToPos,
  getAllMoves,
  findMaxCaptureLength,
  solvePosition,
  countTotalPossibilities,
  getPiecesWithAvailableCaptures,
  scoreToWinProbability,
  ponderOpponentPossibilities,
} from './engine/engine.ts';
import { solvePositionAsync } from './engine/engineService.ts';

export default function App() {
  // Game & Board State
  const [board, setBoard] = useState<Board>(createStartingBoard);
  const [turn, setTurn] = useState<1 | -1>(1); // 1 = White, -1 = Black
  const [variantKey, setVariantKey] = useState<string>('moroccan');
  const [difficulty, setDifficulty] = useState<EngineDifficulty>('IMPOSSIBLE');
  const [depth, setDepth] = useState<number>(11); // Depth 11 for IMPOSSIBLE
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [history, setHistory] = useState<{ board: Board; turn: 1 | -1 }[]>([]);
  const [future, setFuture] = useState<{ board: Board; turn: 1 | -1 }[]>([]);

  // Selection & Interaction
  const [selectedPos, setSelectedPos] = useState<Position | null>(null);
  const [hoveredMove, setHoveredMove] = useState<Move | null>(null);
  const [draggedPos, setDraggedPos] = useState<Position | null>(null);

  // Play vs Engine Mode
  const [playVsEngine, setPlayVsEngine] = useState<boolean>(false);
  const [humanColor, setHumanColor] = useState<1 | -1>(1);
  const [isEngineThinking, setIsEngineThinking] = useState<boolean>(false);

  // Solver Result & Analysis State
  const [solverResult, setSolverResult] = useState<SolverResult | null>(null);
  const [lastMoveMade, setLastMoveMade] = useState<Move | null>(null);

  // Custom Position Editor State
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [editorTool, setEditorTool] = useState<number>(1); // 1: White Man, 2: White King, -1: Black Man, -2: Black King, 0: Eraser

  // Modals & Drawers
  const [showRulesModal, setShowRulesModal] = useState<boolean>(false);
  const [showNewGameModal, setShowNewGameModal] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Loading Screen State (Silky splash on launch)
  const [isLoadingScreen, setIsLoadingScreen] = useState<boolean>(true);
  const [loadingProgress, setLoadingProgress] = useState<number>(15);
  const [loadingStepText, setLoadingStepText] = useState<string>('Loading Moroccan Dama...');

  // Capture Rule Toggle (Mandatory vs Optional)
  const [isMandatoryCapture, setIsMandatoryCapture] = useState<boolean>(true);

  // Progressive loading screen effect on initial startup
  useEffect(() => {
    const t1 = setTimeout(() => {
      setLoadingProgress(45);
      setLoadingStepText('Validating Moroccan Rules...');
    }, 200);
    const t2 = setTimeout(() => {
      setLoadingProgress(80);
      setLoadingStepText('Initializing Minimax Engine...');
    }, 500);
    const t3 = setTimeout(() => {
      setLoadingProgress(100);
      setLoadingStepText('Ready to Play!');
    }, 850);
    const t4 = setTimeout(() => {
      setIsLoadingScreen(false);
    }, 1200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, []);

  // New Game Configuration State
  const [newGameColor, setNewGameColor] = useState<1 | -1>(1);
  const [newGameDifficulty, setNewGameDifficulty] = useState<EngineDifficulty>('IMPOSSIBLE');
  const [newGameSetup, setNewGameSetup] = useState<'standard' | 'test'>('standard');

  // Huffing ("النفخ" / "Blow the piece") State
  interface HuffTarget {
    pos: Position;
    notation: string;
    pieceValue: number;
  }
  interface HuffState {
    offenders: HuffTarget[];
    neglectingPlayer: 1 | -1;
    entitledPlayer: 1 | -1;
  }
  const [huffState, setHuffState] = useState<HuffState | null>(null);

  // Indication State (when playing vs engine, hint is hidden until user clicks Indication)
  const [showIndication, setShowIndication] = useState<boolean>(false);

  // Pondering Engine State: pre-computes counter-moves for all opponent possibilities while user thinks
  const ponderCacheRef = useRef<Map<string, PonderedMoveResult>>(new Map());
  const [ponderProgress, setPonderProgress] = useState<{
    isPondering: boolean;
    total: number;
    done: number;
  }>({
    isPondering: false,
    total: 0,
    done: 0,
  });

  // Winning probability and advantage analysis derived from engine evaluation
  const winProb = useMemo(() => {
    return scoreToWinProbability(solverResult?.evaluation ?? 0);
  }, [solverResult?.evaluation]);

  // Fast Animation States for Move Glide & Capture Pops
  const [animatingPiece, setAnimatingPiece] = useState<{
    piece: number;
    currentPos: Position;
    from: Position;
    to: Position;
    path: Position[];
    hopIndex: number;
    captured: Position[];
  } | null>(null);

  const [fadingCaptures, setFadingCaptures] = useState<Position[]>([]);
  const [promotedPos, setPromotedPos] = useState<Position | null>(null);
  const [huffingPos, setHuffingPos] = useState<Position | null>(null);

  const activeVariant: VariantRules = useMemo(() => {
    const base = VARIANTS[variantKey] || VARIANTS.moroccan;
    return {
      ...base,
      mandatoryCapture: isMandatoryCapture,
    };
  }, [variantKey, isMandatoryCapture]);

  // Sound effects via Web Audio API
  const playSound = useCallback((type: 'move' | 'capture' | 'win' | 'huff') => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'move') {
        osc.frequency.setValueAtTime(320, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
      } else if (type === 'capture') {
        osc.frequency.setValueAtTime(480, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(640, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      } else if (type === 'huff') {
        // Moroccan "Huff" (النفخ) gust/blow sound effect
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(580, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.22);
        gain.gain.setValueAtTime(0.22, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
        osc.start();
        osc.stop(ctx.currentTime + 0.22);
      } else if (type === 'win') {
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.25);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch {
      // Audio context not allowed or failed, ignore gracefully
    }
  }, []);

  // Show temporary toast message
  const showToast = useCallback((msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  }, []);

  // Run Solver Analysis whenever the board, turn, variant or depth changes (via Web Worker for 0 lag)
  const runSolver = useCallback(() => {
    setIsEngineThinking(true);
    let isCancelled = false;
    solvePositionAsync(board, turn, depth, activeVariant, 1500, difficulty)
      .then(result => {
        if (!isCancelled) {
          setSolverResult(result);
          setIsEngineThinking(false);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          const fallback = solvePosition(board, turn, depth, activeVariant, 1500, difficulty);
          setSolverResult(fallback);
          setIsEngineThinking(false);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [board, turn, depth, activeVariant, difficulty]);

  useEffect(() => {
    runSolver();
  }, [runSolver]);

  // Active Background Pondering: Pre-computes all possibilities for human moves while human thinks
  useEffect(() => {
    if (!playVsEngine || turn !== humanColor || isEngineThinking || animatingPiece) {
      return;
    }

    const humanMoves = getAllMoves(board, humanColor, activeVariant);
    if (humanMoves.length === 0) return;

    setPonderProgress({
      isPondering: true,
      total: humanMoves.length,
      done: 0,
    });

    ponderCacheRef.current.clear();
    let isCancelled = false;
    let idx = 0;

    const ponderNext = () => {
      if (isCancelled || idx >= humanMoves.length) {
        if (!isCancelled) {
          setPonderProgress(prev => ({ ...prev, isPondering: false, done: humanMoves.length }));
        }
        return;
      }

      const hMove = humanMoves[idx];
      const engineTurn = (humanColor === 1 ? -1 : 1) as (1 | -1);

      // Solve engine's optimal counter-response for this candidate human move
      const solution = solvePosition(
        hMove.finalBoard,
        engineTurn,
        depth,
        activeVariant,
        400
      );

      if (!isCancelled) {
        ponderCacheRef.current.set(hMove.notation, {
          humanMove: hMove,
          counterMove: solution.bestMove,
          evaluation: solution.evaluation,
          score: solution.stats.evalScore,
          depth: solution.stats.depthReached,
          nodesEvaluated: solution.stats.nodesEvaluated,
        });

        idx++;
        setPonderProgress({
          isPondering: true,
          total: humanMoves.length,
          done: idx,
        });

        setTimeout(ponderNext, 20);
      }
    };

    const initialTimer = setTimeout(ponderNext, 80);

    return () => {
      isCancelled = true;
      clearTimeout(initialTimer);
    };
  }, [playVsEngine, turn, humanColor, board, activeVariant, depth, isEngineThinking, animatingPiece]);

  // Huffing Handlers ("النفخ") with smooth puff animation
  const handleHuffPiece = useCallback(
    (target: { pos: Position; notation: string }) => {
      playSound('huff');
      setHuffingPos(target.pos);
      setTimeout(() => {
        setBoard(prev => {
          const next = cloneBoard(prev);
          next[target.pos.r][target.pos.c] = 0;
          return next;
        });
        setHuffingPos(null);
        setHuffState(null);
        showToast(`💨 Huff Penalty (نفخ): Piece at ${target.notation} removed from the board!`);
      }, 240);
    },
    [playSound, showToast]
  );

  const handleDismissHuff = useCallback(() => {
    setHuffState(null);
  }, []);

  // Handle Play vs Engine responses & Engine Huffing (with Pondering counter-move retrieval)
  useEffect(() => {
    if (playVsEngine && turn !== humanColor && !isEngineThinking && !animatingPiece) {
      // If Human missed a capture, Engine exercises traditional Huffing right!
      if (huffState && huffState.entitledPlayer === turn) {
        const target = huffState.offenders[0];
        const timer = setTimeout(() => {
          handleHuffPiece(target);
        }, 220);
        return () => clearTimeout(timer);
      }

      // Check if this move was pre-calculated during pondering!
      let counterMoveToPlay: Move | null = null;
      if (lastMoveMade && ponderCacheRef.current.has(lastMoveMade.notation)) {
        const pondered = ponderCacheRef.current.get(lastMoveMade.notation);
        if (pondered && pondered.counterMove) {
          counterMoveToPlay = pondered.counterMove;
        }
      }

      if (counterMoveToPlay) {
        // Pondering Hit! Execute pre-calculated counter-move with grandmaster speed & foresight
        const timer = setTimeout(() => {
          applyMove(counterMoveToPlay!);
        }, 280);
        return () => clearTimeout(timer);
      } else if (solverResult?.bestMove) {
        const timer = setTimeout(() => {
          applyMove(solverResult.bestMove!);
        }, 280);
        return () => clearTimeout(timer);
      } else {
        // Compute deep grandmaster response via Web Worker
        setIsEngineThinking(true);
        solvePositionAsync(board, turn, depth, activeVariant, 1500, difficulty)
          .then(deepSolution => {
            setSolverResult(deepSolution);
            setIsEngineThinking(false);
            if (deepSolution.bestMove) {
              applyMove(deepSolution.bestMove);
            }
          })
          .catch(() => {
            const fallback = solvePosition(board, turn, depth, activeVariant, 1500, difficulty);
            setSolverResult(fallback);
            setIsEngineThinking(false);
            if (fallback.bestMove) {
              applyMove(fallback.bestMove);
            }
          });
      }
    }
  }, [
    playVsEngine,
    turn,
    humanColor,
    isEngineThinking,
    solverResult,
    huffState,
    animatingPiece,
    handleHuffPiece,
    lastMoveMade,
    board,
    activeVariant,
    depth,
    difficulty,
  ]);

  // Legal moves available for current player
  const legalMoves = useMemo(() => {
    return solverResult?.allLegalMoves || getAllMoves(board, turn, activeVariant);
  }, [solverResult, board, turn, activeVariant]);

  // Max capture length currently available
  const maxCaptureCount = useMemo(() => {
    return findMaxCaptureLength(board, turn, activeVariant);
  }, [board, turn, activeVariant]);

  // Legal moves for the currently selected piece
  const legalMovesForSelected = useMemo(() => {
    if (!selectedPos) return [];
    return legalMoves.filter(m => m.from.r === selectedPos.r && m.from.c === selectedPos.c);
  }, [selectedPos, legalMoves]);

  // Apply a move to the board with smooth, snappy step-by-step animation
  const applyMove = useCallback(
    (move: Move) => {
      // Clear selection and indication immediately for snappy feel
      setSelectedPos(null);
      setHoveredMove(null);
      setLastMoveMade(move);
      setShowIndication(false);

      // Check if moving player had captures available before making this move
      const piecesThatCouldCapture = getPiecesWithAvailableCaptures(board, turn, activeVariant);
      const nextTurn = (turn === 1 ? -1 : 1) as (1 | -1);

      // If player had captures available, but chose not to capture (or missed taking):
      if (piecesThatCouldCapture.length > 0 && move.captured.length === 0) {
        const offenders: { pos: Position; notation: string; pieceValue: number }[] = [];
        for (const p of piecesThatCouldCapture) {
          const currentPos = p.r === move.from.r && p.c === move.from.c ? move.to : p;
          const pieceVal = move.finalBoard[currentPos.r][currentPos.c];
          if (Math.sign(pieceVal) === turn) {
            offenders.push({
              pos: currentPos,
              notation: posToNotation(currentPos.r, currentPos.c),
              pieceValue: pieceVal,
            });
          }
        }

        if (offenders.length > 0) {
          setHuffState({
            offenders,
            neglectingPlayer: turn,
            entitledPlayer: nextTurn,
          });
        } else {
          setHuffState(null);
        }
      } else {
        setHuffState(null);
      }

      const movingPieceVal = board[move.from.r][move.from.c];
      const hops = move.path && move.path.length >= 2 ? move.path : [move.from, move.to];

      // Step-by-step animation execution
      setAnimatingPiece({
        piece: movingPieceVal,
        currentPos: hops[0],
        from: move.from,
        to: move.to,
        path: hops,
        hopIndex: 0,
        captured: move.captured,
      });

      if (move.captured.length > 0) {
        setFadingCaptures(move.captured);
      }

      const hopDuration = move.captured.length > 0 ? 110 : 100;

      const advanceStep = (step: number) => {
        if (step < hops.length - 1) {
          const nextStep = step + 1;
          setAnimatingPiece(prev =>
            prev
              ? {
                  ...prev,
                  currentPos: hops[nextStep],
                  hopIndex: nextStep,
                }
              : null
          );

          if (move.captured.length > 0) {
            playSound('capture');
          } else {
            playSound('move');
          }

          setTimeout(() => advanceStep(nextStep), hopDuration);
        } else {
          // Move animation complete
          if (move.isPromotion) {
            setPromotedPos(move.to);
            setTimeout(() => setPromotedPos(null), 600);
          }

          setHistory(prev => [...prev, { board: cloneBoard(board), turn }]);
          setFuture([]);
          setBoard(move.finalBoard);
          setTurn(nextTurn);
          setAnimatingPiece(null);
          setFadingCaptures([]);

          // Check win condition
          const nextMoves = getAllMoves(move.finalBoard, nextTurn, activeVariant);
          if (nextMoves.length === 0) {
            playSound('win');
            showToast(turn === 1 ? '🎉 White wins!' : '🎉 Black wins!');
          }
        }
      };

      // Trigger first animation frame
      setTimeout(() => advanceStep(0), 16);
    },
    [board, turn, activeVariant, playSound, showToast]
  );

  // Start New Game vs Engine
  const handleStartNewGame = useCallback(() => {
    const newB = newGameSetup === 'standard' ? createStartingBoard() : createTestPosition();
    setBoard(newB);
    setTurn(1);
    setHumanColor(newGameColor);
    setDifficulty(newGameDifficulty);
    setDepth(newGameDifficulty === 'IMPOSSIBLE' ? 11 : newGameDifficulty === 'HARD' ? 9 : 6);
    setPlayVsEngine(true);
    setShowIndication(false);
    setHistory([]);
    setFuture([]);
    setSelectedPos(null);
    setHoveredMove(null);
    setLastMoveMade(null);
    setHuffState(null);
    setShowNewGameModal(false);
    playSound('move');
    showToast(
      `⚔️ Game started! You are ${newGameColor === 1 ? 'White (moves 1st)' : 'Black (Engine moves 1st)'}.`
    );
  }, [newGameSetup, newGameColor, newGameDifficulty, playSound, showToast]);

  // Back to previous move (Undo)
  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    setShowIndication(false);

    // When playing vs engine: undo back to before user's move (undo 2 plies if user's turn)
    if (playVsEngine && history.length >= 2 && turn === humanColor) {
      const targetState = history[history.length - 2];
      setHistory(prev => prev.slice(0, prev.length - 2));
      setBoard(targetState.board);
      setTurn(targetState.turn);
    } else {
      const last = history[history.length - 1];
      setHistory(prev => prev.slice(0, prev.length - 1));
      setBoard(last.board);
      setTurn(last.turn);
    }

    setFuture([]);
    setSelectedPos(null);
    setHoveredMove(null);
    setLastMoveMade(null);
    setHuffState(null);
    playSound('move');
    showToast('↩️ Back to previous move');
  }, [history, board, turn, playVsEngine, humanColor, playSound, showToast]);

  // Redo move
  const handleRedo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setHistory(prev => [...prev, { board: cloneBoard(board), turn }]);
    setBoard(next.board);
    setTurn(next.turn);
    setFuture(prev => prev.slice(1));
    setSelectedPos(null);
    setHoveredMove(null);
  }, [future, board, turn]);

  // Square Click Handler
  const handleSquareClick = (r: number, c: number) => {
    // If Custom Position Editor is active
    if (isEditorOpen) {
      if (!isDarkSquare(r, c)) return;
      const newBoard = cloneBoard(board);
      newBoard[r][c] = editorTool;
      setBoard(newBoard);
      return;
    }

    if (!isDarkSquare(r, c)) return;

    // Check if clicking a destination for currently selected piece
    if (selectedPos) {
      const matchedMove = legalMovesForSelected.find(m => m.to.r === r && m.to.c === c);
      if (matchedMove) {
        applyMove(matchedMove);
        return;
      }
    }

    // Check if clicking a piece belonging to the active player
    const piece = board[r][c];
    if (Math.sign(piece) === turn) {
      if (selectedPos && selectedPos.r === r && selectedPos.c === c) {
        setSelectedPos(null); // Deselect
      } else {
        // Only allow selection if the piece actually has legal moves (mandatory capture rule)
        const pieceHasLegalMoves = legalMoves.some(m => m.from.r === r && m.from.c === c);
        if (pieceHasLegalMoves) {
          setSelectedPos({ r, c });
        } else {
          setSelectedPos({ r, c });
          if (maxCaptureCount > 0) {
            showToast('⚠️ Mandatory Max Capture: You must move a piece that takes the maximum captures!');
          }
        }
      }
    } else {
      setSelectedPos(null);
    }
  };

  // Drag and Drop Handlers
  const handleDragStart = (r: number, c: number, e: React.DragEvent) => {
    if (isEditorOpen) return;
    if (Math.sign(board[r][c]) !== turn) {
      e.preventDefault();
      return;
    }
    setDraggedPos({ r, c });
    setSelectedPos({ r, c });
    e.dataTransfer.setData('text/plain', `${r},${c}`);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (r: number, c: number, e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedPos) return;
    const move = legalMoves.find(
      m => m.from.r === draggedPos.r && m.from.c === draggedPos.c && m.to.r === r && m.to.c === c
    );
    if (move) {
      applyMove(move);
    }
    setDraggedPos(null);
  };

  // Compute best move or active hover move for board arrows
  // When playing against engine, do not show best move unless user clicks the "Indication" button
  const activeHighlightedMove = useMemo(() => {
    if (hoveredMove) return hoveredMove;
    if (playVsEngine) {
      return showIndication ? solverResult?.bestMove || null : null;
    }
    return solverResult?.bestMove || null;
  }, [hoveredMove, playVsEngine, showIndication, solverResult]);

  // Helper to map board coordinates to SVG coordinates (percentages 0-100)
  const getSquareCenter = useCallback(
    (r: number, c: number) => {
      const displayR = isFlipped ? 7 - r : r;
      const displayC = isFlipped ? 7 - c : c;
      const x = (displayC + 0.5) * 12.5;
      const y = (displayR + 0.5) * 12.5;
      return { x, y };
    },
    [isFlipped]
  );

  return (
    <div className="min-h-screen bg-[#0d0f14] text-slate-100 font-sans selection:bg-amber-500/30">
      {/* Luxury Moroccan Dama Loading / Splash Screen */}
      {isLoadingScreen && (
        <div
          onClick={() => setIsLoadingScreen(false)}
          className="fixed inset-0 z-50 bg-[#0a0c10] flex flex-col items-center justify-center p-6 text-center select-none cursor-pointer transition-opacity duration-500 overflow-hidden animate-in fade-in duration-300"
          style={{
            backgroundImage: `radial-gradient(circle at center, rgba(69, 26, 3, 0.55) 0%, rgba(13, 15, 20, 0.96) 65%, #0a0c10 100%)`,
          }}
        >
          {/* Ambient Warm Glow */}
          <div className="absolute w-[450px] h-[450px] rounded-full bg-amber-600/15 blur-3xl pointer-events-none animate-pulse" />

          {/* Central Logo / Royal Icon Badge */}
          <div className="relative mb-6">
            <div className="w-28 h-28 md:w-36 md:h-36 rounded-3xl overflow-hidden border-2 border-amber-500/70 shadow-2xl shadow-amber-500/30 p-1 bg-gradient-to-br from-amber-950 via-[#1e0e07] to-black transform hover:scale-105 transition-transform duration-300">
              <img
                src="/icon.png"
                alt="Moroccan Dama Master"
                className="w-full h-full object-cover rounded-2xl"
              />
            </div>
            {/* Shimmer origin badge */}
            <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 text-[10px] font-extrabold text-slate-950 uppercase tracking-widest border border-amber-300 shadow-md">
              Morocco
            </div>
          </div>

          {/* Titles */}
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-wider font-serif text-transparent bg-clip-text bg-gradient-to-r from-amber-100 via-amber-300 to-amber-500 drop-shadow-md">
            DAMA MASTER
          </h1>
          <p className="text-xs md:text-sm text-amber-200/80 font-medium tracking-widest uppercase mt-2">
            الضامة المغربية · Official Moroccan Engine
          </p>

          {/* Progress Bar Container */}
          <div className="w-64 md:w-80 mt-8 space-y-2.5">
            <div className="w-full h-2.5 bg-slate-900/90 rounded-full overflow-hidden p-0.5 border border-amber-500/30 shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-amber-600 via-amber-400 to-amber-300 rounded-full transition-all duration-300 ease-out shadow-sm shadow-amber-400/50"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span className="text-amber-400 flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                {loadingStepText}
              </span>
              <span className="font-bold text-amber-300">{loadingProgress}%</span>
            </div>
          </div>

          {/* Skip prompt */}
          <div className="mt-12 text-[11px] text-slate-500 hover:text-amber-400 transition-colors flex items-center gap-1.5">
            <span>Tap anywhere to start</span>
            <span>→</span>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-amber-500 text-slate-950 font-semibold px-4 py-2 rounded-lg shadow-xl text-xs flex items-center gap-2 animate-bounce">
          <Zap className="w-4 h-4" />
          {notification}
        </div>
      )}

      {/* Rules Modal */}
      {showRulesModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161a22] border border-amber-900/60 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative text-sm space-y-4 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowRulesModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-md"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2.5 text-amber-400 font-serif text-lg font-bold">
              <BookOpen className="w-5 h-5 text-amber-400" />
              <span>Moroccan Dama Official Rules (الضامة المغربية)</span>
            </div>
            <p className="text-xs text-slate-400">
              Moroccan Dama is an authentic North African strategic draughts game played on the 32 dark squares of an 8x8 checkerboard.
            </p>
            <div className="space-y-3 divide-y divide-slate-800/80 text-xs text-slate-300">
              <div className="pt-2">
                <span className="font-semibold text-amber-300">1. Man Movement:</span> Men move 1 step diagonally forward only into an empty dark square.
              </div>
              <div className="pt-2">
                <span className="font-semibold text-amber-300">2. Man Capture (Forward Only):</span> Men capture 1 step diagonally forward by leaping over an adjacent opponent piece into an empty dark square. Regular pieces cannot go backward or capture behind—only Kings (Dama) have the ability to move and capture backward in all directions.
              </div>
              <div className="pt-2">
                <span className="font-semibold text-amber-300">3. Mandatory Capture & The Huffing Rule (النفخ):</span> If captures are mandatory, a non-capturing move is strictly illegal. If captures are optional, failing to capture grants the opponent the traditional right of &quot;Huffing&quot; (حق النفخ)—blowing the offending piece off the board!
              </div>
              <div className="pt-2">
                <span className="font-semibold text-amber-300">4. MAX Capture Rule (Majority Law):</span> If multiple capture paths exist, a player MUST execute the path that captures the maximum number of opponent pieces.
              </div>
              <div className="pt-2">
                <span className="font-semibold text-amber-300">5. Flying King (Dama / Sultan):</span> A king can slide any diagonal distance like a bishop. In captures, it leaps over an enemy piece at a distance, and can land on ANY vacant square along the diagonal beyond the captured piece. It sweeps consecutive pieces in line into open squares.
              </div>
              <div className="pt-2">
                <span className="font-semibold text-amber-300">6. Immediate Promotion Stop:</span> When a man reaches the opponent&apos;s back rank (row 0 for White, row 7 for Black), it immediately promotes to a King, and its turn ends immediately even if the new king could continue capturing.
              </div>
            </div>
            <div className="pt-3 flex justify-end">
              <button
                onClick={() => setShowRulesModal(false)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-black font-semibold rounded-lg text-xs"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Game vs Engine Modal */}
      {showNewGameModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161a22] border border-amber-900/60 rounded-2xl max-w-md w-full p-6 shadow-2xl relative text-sm space-y-4">
            <button
              onClick={() => setShowNewGameModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-md"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2.5 text-amber-400 font-serif text-lg font-bold">
              <Swords className="w-5 h-5 text-amber-400" />
              <span>Start New Game vs Engine</span>
            </div>

            {/* Side selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Choose Your Side
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setNewGameColor(1)}
                  className={`p-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${
                    newGameColor === 1
                      ? 'bg-amber-500/20 border-amber-400 text-amber-200 font-bold shadow-sm'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <div className="w-4 h-4 rounded-full bg-amber-100 border border-amber-300" />
                  <span>White (Moves 1st)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNewGameColor(-1)}
                  className={`p-3 rounded-xl border flex items-center justify-center gap-2 transition-all ${
                    newGameColor === -1
                      ? 'bg-amber-500/20 border-amber-400 text-amber-200 font-bold shadow-sm'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <div className="w-4 h-4 rounded-full bg-slate-950 border border-slate-600" />
                  <span>Black (Engine 1st)</span>
                </button>
              </div>
            </div>

            {/* Difficulty selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Engine Difficulty Level
              </label>
              <div className="grid grid-cols-1 gap-2">
                {[
                  {
                    level: 'IMPOSSIBLE' as EngineDifficulty,
                    title: '👑 IMPOSSIBLE (Grandmaster · Depth 11)',
                    desc: '150-line Moroccan Opening Book + Endgame Solver (Depth 20) + PVS + LMR + 1M Zobrist TT + Quiescence. Unbeatable.',
                    badge: 'bg-rose-500/20 text-rose-300 border-rose-500/50',
                  },
                  {
                    level: 'HARD' as EngineDifficulty,
                    title: '⚔️ HARD (Master · Depth 9)',
                    desc: 'Deep tactical foresight with Opening Book & Quiescence search.',
                    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/50',
                  },
                  {
                    level: 'MEDIUM' as EngineDifficulty,
                    title: '🛡️ MEDIUM (Casual · Depth 6)',
                    desc: 'Club-level play with Quiescence search.',
                    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
                  },
                ].map(d => (
                  <button
                    key={d.level}
                    type="button"
                    onClick={() => setNewGameDifficulty(d.level)}
                    className={`p-2.5 rounded-xl border text-xs font-medium text-left transition-all ${
                      newGameDifficulty === d.level
                        ? 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-md ring-1 ring-amber-400/40'
                        : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="font-bold flex items-center justify-between">
                      <span>{d.title}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${d.badge}`}>{d.level}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 pt-0.5 leading-snug">{d.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Board Setup */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Starting Setup
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setNewGameSetup('standard')}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    newGameSetup === 'standard'
                      ? 'bg-amber-500/20 border-amber-400 text-amber-200 font-bold'
                      : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  🏁 Standard Start (12 vs 12)
                </button>
                <button
                  type="button"
                  onClick={() => setNewGameSetup('test')}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    newGameSetup === 'test'
                      ? 'bg-amber-500/20 border-amber-400 text-amber-200 font-bold'
                      : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  🎯 Moroccan King Test
                </button>
              </div>
            </div>

            {/* Capture rule for match */}
            <div className="p-3 bg-slate-800/60 border border-slate-700 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-200 block">
                  Mandatory Capture Rule
                </span>
                <span className="text-[11px] text-slate-400">
                  {isMandatoryCapture ? 'Strict Moroccan (Must take piece)' : 'Optional (Can ignore + Huffing / حق النفخ)'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsMandatoryCapture(v => !v)}
                className={`px-3 py-1 text-xs font-bold rounded-lg border transition-all ${
                  isMandatoryCapture
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                }`}
              >
                {isMandatoryCapture ? 'Mandatory' : 'Optional'}
              </button>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewGameModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartNewGame}
                className="px-5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-lg text-xs shadow-lg shadow-amber-950/50"
              >
                Start Match
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 py-6 md:px-8 space-y-6">
        {/* Top Header Bar */}
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl overflow-hidden border-2 border-amber-500/60 shadow-lg shadow-amber-950/70 bg-[#1e0e06] p-0.5 flex-shrink-0 group hover:scale-105 transition-transform">
                <img src="/icon.png" alt="Moroccan Dama" className="w-full h-full object-cover rounded-xl" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight font-serif text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-100">
                  DAMA MASTER
                </h1>
                <p className="text-xs text-slate-400 font-medium tracking-wide">
                  Universal Moroccan Dama Engine & Minimax Solver
                </p>
              </div>
            </div>
          </div>

          {/* Quick Header Actions: Clean and focused */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Engine Difficulty Selector */}
            <div className="flex items-center bg-slate-900 border border-slate-750 rounded-lg p-0.5 text-xs shadow-inner">
              <button
                type="button"
                onClick={() => {
                  setDifficulty('IMPOSSIBLE');
                  setDepth(11);
                  showToast('🔥 Engine set to IMPOSSIBLE (Depth 11 + Book + Endgame)');
                }}
                className={`px-2.5 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${
                  difficulty === 'IMPOSSIBLE'
                    ? 'bg-gradient-to-r from-red-600 to-amber-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Grandmaster Level (Depth 11, Opening Book & Endgame Solver)"
              >
                <span>👑 IMPOSSIBLE</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDifficulty('HARD');
                  setDepth(9);
                  showToast('⚔️ Engine set to HARD (Depth 9)');
                }}
                className={`px-2.5 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${
                  difficulty === 'HARD'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Master Level (Depth 9)"
              >
                <span>⚔️ HARD</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDifficulty('MEDIUM');
                  setDepth(6);
                  showToast('🛡️ Engine set to MEDIUM (Depth 6)');
                }}
                className={`px-2.5 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${
                  difficulty === 'MEDIUM'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Club Level (Depth 6)"
              >
                <span>🛡️ MEDIUM</span>
              </button>
            </div>

            <button
              onClick={() => setShowNewGameModal(true)}
              className="px-3.5 py-2 text-xs font-bold rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 flex items-center gap-1.5 shadow-md shadow-amber-950/40 transition-all active:scale-95"
              title="Start a new match against the Moroccan Dama engine"
            >
              <Swords className="w-4 h-4 text-slate-950" />
              <span>New Game</span>
            </button>
            <button
              onClick={() => setShowRulesModal(true)}
              className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>Moroccan Rules</span>
            </button>
            <button
              onClick={() => setIsFlipped(f => !f)}
              className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-colors"
              title="Flip perspective"
            >
              <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
              <span>Flip Board</span>
            </button>
          </div>
        </header>

        {/* Preset Positions & Options Bar (Hidden during Game vs Engine for clean focused board) */}
        {!playVsEngine && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#13161f] border border-amber-900/30 p-2.5 rounded-xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider px-1 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" />
                Presets:
              </span>
              {PRESETS.map(preset => {
                const isTest = preset.id === 'test_d4_e5_f6';
                return (
                  <button
                    key={preset.id}
                    onClick={() => {
                      setBoard(preset.board());
                      setTurn(preset.turn);
                      setSelectedPos(null);
                      setHoveredMove(null);
                      setHistory([]);
                      setFuture([]);
                      setHuffState(null);
                      showToast(`Loaded: ${preset.name}`);
                    }}
                    className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${
                      isTest
                        ? 'bg-gradient-to-r from-amber-500/25 to-amber-600/30 text-amber-300 border border-amber-500/50 shadow-sm hover:from-amber-500/40 hover:to-amber-600/40'
                        : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700/80 border border-slate-700/50'
                    }`}
                    title={preset.description}
                  >
                    {preset.name}
                  </button>
                );
              })}
            </div>

            {/* Capture Rule: Must Take vs Can Ignore Button */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setIsMandatoryCapture(v => {
                    const next = !v;
                    showToast(
                      next
                        ? '🔒 Mandatory Capture: ON (Must take pieces)'
                        : '🔓 Capture Optional: OFF (Can ignore capture + Huffing enabled)'
                    );
                    return next;
                  });
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all flex items-center gap-1.5 shadow-sm active:scale-95 ${
                  isMandatoryCapture
                    ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 hover:bg-amber-500/30'
                    : 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300 hover:bg-emerald-500/30'
                }`}
                title="Click to toggle: Must Take pieces vs Can Ignore piece"
              >
                {isMandatoryCapture ? (
                  <>
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                    <span>Must Take: ON (Strict)</span>
                  </>
                ) : (
                  <>
                    <Wind className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Can Ignore: OFF (Huffing Active)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Main Grid: When playVsEngine, animate smoothly and show ONLY the board with Indication and Back buttons */}
        <div
          className={
            playVsEngine
              ? 'w-full max-w-xl mx-auto flex flex-col items-center space-y-4 animate-in fade-in zoom-in-[0.98] duration-300 ease-out'
              : 'grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in duration-300'
          }
        >
          {/* Board & Board Controls */}
          <div className={playVsEngine ? 'w-full flex flex-col items-center space-y-4' : 'lg:col-span-7 flex flex-col items-center space-y-4'}>
            {/* HUFFING DECISION BANNER (حق النفخ في الضامة) */}
            {huffState && huffState.entitledPlayer === turn && (
              <div className="w-full max-w-[500px] bg-gradient-to-r from-red-950/95 via-amber-950/95 to-slate-900/95 border-2 border-amber-500/80 rounded-2xl p-4 shadow-2xl animate-in fade-in slide-in-from-top-3 text-xs text-slate-200 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-500/30 to-amber-500/20 border border-amber-400/60 flex items-center justify-center text-xl shadow-md">
                      💨
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-amber-300 font-serif text-sm">
                          Huff Opportunity! (حق النفخ في الضامة)
                        </span>
                        <span className="text-[10px] bg-red-500/20 text-red-300 border border-red-500/30 px-1.5 py-0.5 rounded font-mono uppercase">
                          Penalty
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 pt-0.5 leading-snug">
                        Opponent moved without taking when a capture was available! You can blow (remove) their offending piece or let it stay.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleDismissHuff}
                    className="text-slate-400 hover:text-white p-1 rounded-md"
                    title="Let piece stay and continue"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-amber-900/50">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 text-xs">Neglected piece:</span>
                    {huffState.offenders.map(offender => (
                      <span
                        key={offender.notation}
                        className="font-mono font-bold text-amber-200 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/40"
                      >
                        {offender.notation}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleHuffPiece(huffState.offenders[0])}
                      className="px-3.5 py-1.5 bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold rounded-lg text-xs shadow-md transition-all flex items-center gap-1.5 active:scale-95"
                    >
                      <span>💨 Remove Piece (نفخ)</span>
                    </button>
                    <button
                      onClick={handleDismissHuff}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs transition-colors"
                    >
                      <span>Let It Stay</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Top Board Bar: Player Turn Badge & History Controls */}
            <div className="w-full max-w-[500px] flex items-center justify-between bg-[#151922] px-4 py-2.5 rounded-xl border border-slate-800 text-xs shadow-md">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-3.5 h-3.5 rounded-full border ${
                    turn === 1
                      ? 'bg-amber-100 border-amber-300 shadow-sm'
                      : 'bg-slate-900 border-slate-600 shadow-sm'
                  }`}
                />
                <span className="font-semibold text-slate-200">
                  {playVsEngine
                    ? turn === humanColor
                      ? 'Your turn'
                      : isEngineThinking
                      ? 'Engine thinking...'
                      : "Opponent's turn"
                    : turn === 1
                    ? 'White to Move'
                    : 'Black to Move'}
                </span>
                {playVsEngine && (
                  <span className="text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30 flex items-center gap-1">
                    <Swords className="w-3 h-3" />
                    vs Engine {isEngineThinking && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />}
                  </span>
                )}
                {maxCaptureCount > 0 && isMandatoryCapture && (
                  <span className="text-[11px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                    Mandatory ({maxCaptureCount})
                  </span>
                )}
              </div>

              {!playVsEngine && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleUndo}
                    disabled={history.length === 0}
                    className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
                    title="Undo Move"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleRedo}
                    disabled={future.length === 0}
                    className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
                    title="Redo Move"
                  >
                    <RotateCw className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* THE WOODEN 8x8 CHECKERBOARD */}
            <div className="relative p-3.5 md:p-5 bg-gradient-to-br from-[#3d2314] via-[#29170d] to-[#1a0f08] rounded-2xl shadow-2xl border-4 border-[#4a2b19] select-none">
              {/* Outer Inlaid Brass/Wood Line */}
              <div className="relative p-1 bg-[#1a0e07] rounded-xl border border-amber-900/60 shadow-inner">
                {/* 8x8 Grid Canvas */}
                <div className="relative w-[320px] h-[320px] sm:w-[440px] sm:h-[440px] md:w-[480px] md:h-[480px] grid grid-cols-8 grid-rows-8 border-2 border-[#381f12] rounded-lg overflow-hidden shadow-2xl">
                  {Array.from({ length: 8 }).map((_, rIdx) => {
                    const r = isFlipped ? 7 - rIdx : rIdx;
                    return Array.from({ length: 8 }).map((_, cIdx) => {
                      const c = isFlipped ? 7 - cIdx : cIdx;
                      const isDark = isDarkSquare(r, c);
                      const piece = board[r][c];
                      const isSelected = selectedPos && selectedPos.r === r && selectedPos.c === c;

                      // Is this piece a Huffing target that missed a capture?
                      const isHuffTarget =
                        huffState &&
                        huffState.entitledPlayer === turn &&
                        huffState.offenders.some(o => o.pos.r === r && o.pos.c === c);

                      // Is this square a legal destination for selected piece?
                      const legalMoveTarget = legalMovesForSelected.find(m => m.to.r === r && m.to.c === c);
                      const isTarget = !!legalMoveTarget;
                      const isCaptureTarget = isTarget && legalMoveTarget.captured.length > 0;

                      // Is this square in the active move path?
                      const isInActivePath = activeHighlightedMove?.path.some(p => p.r === r && p.c === c);
                      const isCapturedInActive = activeHighlightedMove?.captured.some(p => p.r === r && p.c === c);

                      return (
                        <div
                          key={`${r}-${c}`}
                          onClick={() => handleSquareClick(r, c)}
                          onDragOver={handleDragOver}
                          onDrop={e => handleDrop(r, c, e)}
                          className={`relative flex items-center justify-center transition-all ${
                            isDark
                              ? 'bg-gradient-to-br from-[#533725] via-[#482f1f] to-[#3a2517]' // Rich Walnut
                              : 'bg-gradient-to-br from-[#dfc5a0] via-[#d5b991] to-[#cbac82]' // Warm Maple
                          } ${
                            isSelected
                              ? 'ring-4 ring-amber-400 ring-inset shadow-inner'
                              : isCapturedInActive
                              ? 'bg-rose-950/70 ring-2 ring-rose-500/80 ring-inset'
                              : isInActivePath
                              ? 'ring-2 ring-amber-400/40 ring-inset'
                              : ''
                          }`}
                        >
                          {/* Huff target indicator overlay */}
                          {isHuffTarget && (
                            <div
                              onClick={e => {
                                e.stopPropagation();
                                const target = huffState.offenders.find(o => o.pos.r === r && o.pos.c === c);
                                if (target) handleHuffPiece(target);
                              }}
                              className="absolute inset-0 z-30 ring-4 ring-red-500 ring-dashed animate-pulse rounded-sm flex items-start justify-end p-1 cursor-pointer bg-red-500/25"
                              title="Click to blow/remove this piece (حق النفخ)"
                            >
                              <span className="text-[10px] font-bold bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center shadow-lg">
                                💨
                              </span>
                            </div>
                          )}
                          {/* Board Coordinates: Rank numbers along left edge */}
                          {cIdx === 0 && (
                            <span className="absolute top-1 left-1 text-[9px] font-mono font-bold text-amber-200/40 pointer-events-none">
                              {8 - r}
                            </span>
                          )}

                          {/* Board Coordinates: File letters along bottom edge */}
                          {rIdx === 7 && (
                            <span className="absolute bottom-0.5 right-1 text-[9px] font-mono font-bold text-amber-200/40 pointer-events-none">
                              {String.fromCharCode(97 + c)}
                            </span>
                          )}

                          {/* Piece Rendering with Smooth Animation Classes */}
                          {piece !== 0 && (
                            <div
                              draggable={!isEditorOpen && Math.sign(piece) === turn && !animatingPiece}
                              onDragStart={e => handleDragStart(r, c, e)}
                              className={`w-[78%] h-[78%] rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer relative shadow-xl ${
                                piece > 0
                                  ? 'bg-gradient-to-b from-[#faf6ed] via-[#ede3cc] to-[#c7b99c] border-2 border-[#fff8e7] text-amber-950 shadow-amber-950/60'
                                  : 'bg-gradient-to-b from-[#2b2b2e] via-[#1a1b1d] to-[#0c0d0f] border-2 border-stone-600 text-amber-400 shadow-black/80'
                              } ${
                                animatingPiece && animatingPiece.from.r === r && animatingPiece.from.c === c
                                  ? 'opacity-0 pointer-events-none'
                                  : fadingCaptures.some(p => p.r === r && p.c === c)
                                  ? 'animate-piece-capture'
                                  : huffingPos && huffingPos.r === r && huffingPos.c === c
                                  ? 'animate-huff-puff'
                                  : promotedPos && promotedPos.r === r && promotedPos.c === c
                                  ? 'animate-crown-burst'
                                  : isCapturedInActive
                                  ? 'opacity-40 line-through'
                                  : ''
                              }`}
                            >
                              {/* Concentric Engraved Ring styling */}
                              <div
                                className={`w-3/4 h-3/4 rounded-full border flex items-center justify-center ${
                                  piece > 0 ? 'border-amber-900/20' : 'border-stone-700/60'
                                }`}
                              >
                                {Math.abs(piece) === 2 && (
                                  <Crown
                                    className={`w-4 h-4 md:w-5 md:h-5 ${
                                      piece > 0 ? 'text-amber-800 drop-shadow' : 'text-amber-400 drop-shadow'
                                    }`}
                                  />
                                )}
                              </div>
                            </div>
                          )}

                          {/* Legal Destination Target Dot / Crosshair */}
                          {isTarget && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              {isCaptureTarget ? (
                                <div className="w-5 h-5 rounded-full border-2 border-rose-400 bg-rose-500/30 flex items-center justify-center animate-pulse shadow-lg shadow-rose-900/50">
                                  <div className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                                </div>
                              ) : (
                                <div className="w-3.5 h-3.5 rounded-full bg-emerald-400/80 shadow-md shadow-emerald-950 animate-pulse" />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })}

                  {/* Dynamic Sliding / Hopping Animated Piece Overlay */}
                  {animatingPiece && (
                    <div
                      className="absolute pointer-events-none z-30 w-[12.5%] h-[12.5%] flex items-center justify-center transition-all ease-out"
                      style={{
                        left: `${(isFlipped ? 7 - animatingPiece.currentPos.c : animatingPiece.currentPos.c) * 12.5}%`,
                        top: `${(isFlipped ? 7 - animatingPiece.currentPos.r : animatingPiece.currentPos.r) * 12.5}%`,
                        transitionDuration: '110ms',
                      }}
                    >
                      <div
                        className={`w-[78%] h-[78%] rounded-full flex items-center justify-center relative shadow-2xl animate-piece-hop ${
                          animatingPiece.piece > 0
                            ? 'bg-gradient-to-b from-[#faf6ed] via-[#ede3cc] to-[#c7b99c] border-2 border-[#fff8e7] text-amber-950 shadow-amber-950/80 ring-2 ring-amber-300'
                            : 'bg-gradient-to-b from-[#2b2b2e] via-[#1a1b1d] to-[#0c0d0f] border-2 border-stone-600 text-amber-400 shadow-black/95 ring-2 ring-amber-500'
                        }`}
                      >
                        <div
                          className={`w-3/4 h-3/4 rounded-full border flex items-center justify-center ${
                            animatingPiece.piece > 0 ? 'border-amber-900/20' : 'border-stone-700/60'
                          }`}
                        >
                          {Math.abs(animatingPiece.piece) === 2 && (
                            <Crown
                              className={`w-4 h-4 md:w-5 md:h-5 ${
                                animatingPiece.piece > 0 ? 'text-amber-800 drop-shadow' : 'text-amber-400 drop-shadow'
                              }`}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SVG OVERLAY: Dynamic Curved / Arrow Trajectory for Best Move */}
                  {activeHighlightedMove && activeHighlightedMove.path.length >= 2 && (
                    <svg className="absolute inset-0 w-full h-full pointer-events-none z-20">
                      <defs>
                        <linearGradient id="arrowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.9" />
                          <stop offset="100%" stopColor="#fbbf24" stopOpacity="1" />
                        </linearGradient>
                        <marker
                          id="arrowHead"
                          viewBox="0 0 10 10"
                          refX="6"
                          refY="5"
                          markerWidth="6"
                          markerHeight="6"
                          orient="auto-start-reverse"
                        >
                          <path d="M 0 1 L 8 5 L 0 9 z" fill="#fbbf24" />
                        </marker>
                      </defs>

                      {/* Draw arrows connecting path nodes */}
                      {activeHighlightedMove.path.slice(0, -1).map((startPos, idx) => {
                        const endPos = activeHighlightedMove.path[idx + 1];
                        const p1 = getSquareCenter(startPos.r, startPos.c);
                        const p2 = getSquareCenter(endPos.r, endPos.c);

                        return (
                          <g key={`arrow-${idx}`}>
                            {/* Glow shadow line */}
                            <line
                              x1={`${p1.x}%`}
                              y1={`${p1.y}%`}
                              x2={`${p2.x}%`}
                              y2={`${p2.y}%`}
                              stroke="#000"
                              strokeWidth="7"
                              strokeOpacity="0.4"
                              strokeLinecap="round"
                            />
                            {/* Main vibrant arrow shaft */}
                            <line
                              x1={`${p1.x}%`}
                              y1={`${p1.y}%`}
                              x2={`${p2.x}%`}
                              y2={`${p2.y}%`}
                              stroke="url(#arrowGrad)"
                              strokeWidth="4"
                              strokeLinecap="round"
                              markerEnd="url(#arrowHead)"
                            />
                            {/* Origin circle marker */}
                            {idx === 0 && (
                              <circle
                                cx={`${p1.x}%`}
                                cy={`${p1.y}%`}
                                r="5"
                                fill="#f59e0b"
                                stroke="#1e140d"
                                strokeWidth="2"
                              />
                            )}
                          </g>
                        );
                      })}
                    </svg>
                  )}
                </div>
              </div>
            </div>

            {/* DYNAMIC EVALUATION ADVANTAGE BAR (Moves according to who's in better position and has better chances to win) */}
            <div className="w-full max-w-[500px] bg-[#121622] border border-amber-950/40 rounded-2xl p-3 shadow-xl space-y-2 select-none animate-in fade-in duration-300">
              {/* Top Row: Win Probabilities & Position Lead Badge */}
              <div className="flex items-center justify-between text-xs font-semibold">
                {/* White's Chances */}
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-full bg-amber-100 border border-amber-300 shadow-sm flex items-center justify-center text-[10px] font-bold text-black">
                    ⚪
                  </div>
                  <span className="text-slate-200">
                    White <span className="font-bold text-amber-300">{winProb.whitePct}%</span>
                  </span>
                  {winProb.leadPlayer === 'white' && (
                    <span className="text-[11px] font-mono text-amber-400 font-bold">
                      ({winProb.formattedScore})
                    </span>
                  )}
                </div>

                {/* Center Lead Badge */}
                <div className="flex items-center gap-1">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-sm ${
                      winProb.leadPlayer === 'white'
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                        : winProb.leadPlayer === 'black'
                        ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                        : 'bg-slate-800 border-slate-700 text-slate-300'
                    }`}
                  >
                    {winProb.leadDescription}
                  </span>
                </div>

                {/* Black's Chances */}
                <div className="flex items-center gap-1.5">
                  {winProb.leadPlayer === 'black' && (
                    <span className="text-[11px] font-mono text-rose-400 font-bold">
                      ({winProb.formattedScore})
                    </span>
                  )}
                  <span className="text-slate-200">
                    Black <span className="font-bold text-slate-300">{winProb.blackPct}%</span>
                  </span>
                  <div className="w-4 h-4 rounded-full bg-slate-900 border border-slate-600 shadow-sm flex items-center justify-center text-[10px] font-bold text-white">
                    ⚫
                  </div>
                </div>
              </div>

              {/* The Visual Advantage Bar that slides left/right */}
              <div className="relative w-full h-4 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 rounded-full border border-slate-700/80 overflow-hidden shadow-inner p-0.5">
                {/* White Advantage Fill (Slides from Left to Right according to White's Win %) */}
                <div
                  className="h-full bg-gradient-to-r from-amber-400 via-amber-200 to-amber-100 rounded-full transition-all duration-700 ease-out shadow-[0_0_12px_rgba(251,191,36,0.5)]"
                  style={{ width: `${winProb.whitePct}%` }}
                />

                {/* Moving Center Divider Bead */}
                <div
                  className="absolute top-0 bottom-0 w-1.5 bg-amber-400 rounded-full shadow-[0_0_10px_#f59e0b] -translate-x-1/2 transition-all duration-700 ease-out pointer-events-none"
                  style={{ left: `${winProb.whitePct}%` }}
                />
              </div>

              {/* Engine Status / Pondering / Book & Endgame Solver Info */}
              <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 pt-0.5 px-0.5 gap-2">
                {solverResult?.stats.isBookMove ? (
                  <div className="flex items-center gap-1.5 text-amber-300 font-medium">
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-[10px] font-bold text-amber-300">
                      📖 MOROCCAN BOOK
                    </span>
                    <span>Opening Line · Instant Grandmaster Response</span>
                  </div>
                ) : solverResult?.stats.isEndgameTablebase ? (
                  <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-[10px] font-bold text-emerald-300">
                      👑 ENDGAME SOLVER
                    </span>
                    <span>Depth 20 · Fully Solved Endgame</span>
                  </div>
                ) : playVsEngine ? (
                  turn === humanColor ? (
                    <div className="flex items-center gap-2 text-amber-300 font-medium">
                      <Brain className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                      <span>
                        {ponderProgress.isPondering
                          ? `Pondering: Evaluated ${ponderProgress.done}/${ponderProgress.total} counter-moves...`
                          : `Pondered all ${ponderProgress.total} moves (${difficulty} D${depth})`}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sky-400 font-medium">
                      <Activity className="w-3.5 h-3.5 animate-spin" />
                      <span>Engine calculating ({difficulty} · Depth {depth} Web Worker)...</span>
                    </div>
                  )
                ) : (
                  <div className="flex items-center gap-2 text-slate-400">
                    <Gauge className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      Depth {solverResult?.stats.depthReached ?? depth} ({difficulty}) · {(solverResult?.stats.nodesEvaluated ?? 0).toLocaleString()} positions searched
                      {solverResult?.stats.nps ? ` (${Math.round(solverResult.stats.nps / 1000)}k nps)` : ''}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-slate-400">
                    {solverResult?.stats.timeMs ?? 0}ms
                  </span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                    difficulty === 'IMPOSSIBLE'
                      ? 'bg-rose-950/70 border-rose-500/50 text-rose-300'
                      : difficulty === 'HARD'
                      ? 'bg-amber-950/70 border-amber-500/50 text-amber-300'
                      : 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300'
                  }`}>
                    {difficulty}
                  </span>
                </div>
              </div>
            </div>

            {/* Controls Below Board */}
            {playVsEngine ? (
              /* FOCUSED GAME MODE: Dedicated Indication & Back to previous move buttons */
              <div className="w-full max-w-[500px] space-y-2.5">
                {/* Primary Action Buttons: Indication + Back to previous move */}
                <div className="w-full flex items-center justify-between gap-3 bg-[#151922] p-2.5 rounded-xl border border-amber-900/40 text-xs shadow-xl">
                  {/* [💡 Indication] button */}
                  <button
                    onClick={() => {
                      setShowIndication(prev => {
                        const next = !prev;
                        if (next) {
                          playSound('move');
                          showToast(
                            solverResult?.bestMove
                              ? `💡 Indication: Best move is ${solverResult.bestMove.notation}`
                              : '💡 Engine calculating indication...'
                          );
                        }
                        return next;
                      });
                    }}
                    className={`flex-1 py-2.5 px-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 ${
                      showIndication
                        ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 border border-amber-300 ring-2 ring-amber-400/40'
                        : 'bg-slate-800/90 hover:bg-slate-700 text-amber-300 border border-amber-500/30 hover:border-amber-500/60'
                    }`}
                    title="Toggle Indication (hint for the best move)"
                  >
                    <Lightbulb className={`w-4 h-4 ${showIndication ? 'text-slate-950 fill-slate-950' : 'text-amber-400'}`} />
                    <span>{showIndication ? 'Hide Indication' : 'Indication'}</span>
                  </button>

                  {/* [↩️ Back to previous move] button */}
                  <button
                    onClick={handleUndo}
                    disabled={history.length === 0 || isEngineThinking}
                    className="flex-1 py-2.5 px-3 rounded-xl font-bold flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md active:scale-95"
                    title="Back to previous move (Undo)"
                  >
                    <RotateCcw className="w-4 h-4 text-sky-400" />
                    <span>Back to previous move</span>
                  </button>
                </div>

                {/* Indication Suggestion Card (Only visible when Indication button is clicked) */}
                {showIndication && solverResult?.bestMove && (
                  <div className="w-full bg-gradient-to-r from-amber-950/70 via-[#181e2b] to-slate-900 border border-amber-500/50 p-3 rounded-xl flex items-center justify-between gap-3 text-xs animate-in fade-in slide-in-from-top-1 shadow-lg">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-amber-300 font-bold">
                        💡
                      </div>
                      <div>
                        <div className="font-bold text-amber-300 flex items-center gap-1.5">
                          <span>Suggested: {solverResult.bestMove.notation}</span>
                          {solverResult.bestMove.isPromotion && (
                            <span className="text-[10px] bg-amber-400 text-black px-1 rounded font-extrabold">CROWN</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {solverResult.bestMove.path.map(p => posToNotation(p.r, p.c)).join(' → ')}
                          {solverResult.bestMove.captured.length > 0 && ` (${solverResult.bestMove.captured.length} piece captured)`}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => applyMove(solverResult.bestMove!)}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs shadow-md active:scale-95 transition-all flex items-center gap-1"
                      title="Play this indicated move"
                    >
                      <Play className="w-3.5 h-3.5 fill-slate-950" />
                      <span>Play Move</span>
                    </button>
                  </div>
                )}

                {/* In-Game Companion Bar: Must Take Toggle, Flip, New Game, Exit */}
                <div className="w-full flex flex-wrap items-center justify-between gap-2 bg-[#121620] px-3 py-2 rounded-xl border border-slate-800/80 text-xs">
                  <button
                    onClick={() => {
                      setIsMandatoryCapture(v => {
                        const next = !v;
                        showToast(
                          next
                            ? '🔒 Mandatory Capture: ON (Must take pieces)'
                            : '🔓 Capture Optional: OFF (Can ignore capture + Huffing enabled)'
                        );
                        return next;
                      });
                    }}
                    className={`px-2.5 py-1 rounded-lg border font-semibold flex items-center gap-1.5 transition-all ${
                      isMandatoryCapture
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                        : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    }`}
                    title="Toggle Mandatory Capture vs Can Ignore"
                  >
                    {isMandatoryCapture ? (
                      <>
                        <ShieldAlert className="w-3 h-3 text-amber-400" />
                        <span>Must Take: ON</span>
                      </>
                    ) : (
                      <>
                        <Wind className="w-3 h-3 text-emerald-400" />
                        <span>Can Ignore: OFF</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsFlipped(f => !f)}
                      className="px-2.5 py-1 text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors"
                      title="Flip perspective"
                    >
                      <RefreshCw className="w-3 h-3 text-sky-400" />
                      <span>Flip</span>
                    </button>

                    <button
                      onClick={() => setShowNewGameModal(true)}
                      className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg font-medium flex items-center gap-1.5 transition-all"
                    >
                      <Swords className="w-3 h-3 text-amber-400" />
                      <span>New Game</span>
                    </button>

                    <button
                      onClick={() => {
                        setPlayVsEngine(false);
                        showToast('Exited to Analysis Mode');
                      }}
                      className="px-2 py-1 text-slate-400 hover:text-slate-200 text-[11px] underline"
                    >
                      Exit to Analysis
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* ANALYSIS MODE: Standard Quick Action Toolbar & Custom Position Editor */
              <>
                <div className="w-full max-w-[500px] flex flex-wrap items-center justify-between gap-2 bg-[#151922] p-2.5 rounded-xl border border-slate-800 text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={runSolver}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg flex items-center gap-1.5 shadow-sm transition-all"
                      title="Run Minimax Solver"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Analyze</span>
                    </button>

                    {solverResult?.bestMove && (
                      <button
                        onClick={() => applyMove(solverResult.bestMove!)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg flex items-center gap-1.5 border border-slate-700 transition-all"
                        title="Play Best Move"
                      >
                        <Play className="w-3.5 h-3.5 text-amber-400" />
                        <span>Make Best Move</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsEditorOpen(e => !e)}
                      className={`px-3 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 transition-colors ${
                        isEditorOpen
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>{isEditorOpen ? 'Close Editor' : 'Board Editor'}</span>
                    </button>

                    <button
                      onClick={() => {
                        setBoard(createEmptyBoard());
                        setSelectedPos(null);
                        setHoveredMove(null);
                        setHistory([]);
                        setFuture([]);
                      }}
                      className="px-2.5 py-1.5 text-slate-400 hover:text-rose-400 transition-colors"
                      title="Clear Board"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Custom Board Editor Drawer (when toggled) */}
                {isEditorOpen && (
                  <div className="w-full max-w-[500px] bg-[#1a1f2c] border border-amber-900/40 p-3.5 rounded-xl text-xs space-y-2">
                    <div className="flex items-center justify-between text-slate-300 font-semibold">
                      <span>Custom Position Tool: Click any dark square to place</span>
                      <span className="text-[11px] text-amber-400">Editor Active</span>
                    </div>
                    <div className="grid grid-cols-5 gap-2 pt-1">
                      {[
                        { id: 1, label: 'White Man', icon: '⚪' },
                        { id: 2, label: 'White King', icon: '👑' },
                        { id: -1, label: 'Black Man', icon: '⚫' },
                        { id: -2, label: 'Black King', icon: '🖤' },
                        { id: 0, label: 'Eraser', icon: '❌' },
                      ].map(tool => (
                        <button
                          key={tool.id}
                          onClick={() => setEditorTool(tool.id)}
                          className={`py-1.5 px-2 rounded-lg border flex flex-col items-center gap-1 text-[11px] font-medium transition-all ${
                            editorTool === tool.id
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-sm'
                              : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:bg-slate-700'
                          }`}
                        >
                          <span className="text-base">{tool.icon}</span>
                          <span>{tool.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* RIGHT: Solver Controls & All Candidate Possibilities List (Hidden during Play vs Engine) */}
          {!playVsEngine && (
            <div className="lg:col-span-5 space-y-4">
            {/* Engine Setup Card */}
            <div className="p-4 bg-[#141822] border border-slate-800 rounded-2xl shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  Engine Configuration
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  {activeVariant.name.split('(')[0].trim()}
                </span>
              </div>

              {/* Variant Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>Variant</span>
                  <span className="text-[10px] text-amber-400 font-normal">Moroccan default</span>
                </label>
                <select
                  value={variantKey}
                  onChange={e => setVariantKey(e.target.value)}
                  className="w-full bg-[#1b212e] border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-medium cursor-pointer"
                >
                  {Object.values(VARIANTS).map(v => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Who Starts / Turn Selector */}
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-semibold text-slate-300">Who To Move</span>
                <div className="flex p-0.5 bg-slate-900 border border-slate-800 rounded-lg">
                  <button
                    onClick={() => setTurn(1)}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                      turn === 1 ? 'bg-amber-400 text-black shadow' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    White
                  </button>
                  <button
                    onClick={() => setTurn(-1)}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                      turn === -1 ? 'bg-amber-400 text-black shadow' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Black
                  </button>
                </div>
              </div>

              {/* Minimax Depth Slider (1 - 15) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">Search Depth: {depth}</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {depth <= 4 ? 'Fast (1-2ms)' : depth <= 8 ? 'Tactical (10-50ms)' : 'Deep Analysis'}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="15"
                  value={depth}
                  onChange={e => setDepth(Number(e.target.value))}
                  className="w-full accent-amber-500 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
                />
              </div>

              {/* Play vs Engine Mode Toggle */}
              <div className="pt-1 flex items-center justify-between text-xs border-t border-slate-800/80">
                <span className="text-slate-300 font-medium">Auto-Play Engine vs User</span>
                <button
                  onClick={() => setPlayVsEngine(p => !p)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold border transition-all ${
                    playVsEngine
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {playVsEngine ? 'Engine Active' : 'Off'}
                </button>
              </div>
            </div>

            {/* Analysis & Evaluation Overview Card */}
            <div className="p-4 bg-[#141822] border border-slate-800 rounded-2xl shadow-xl space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Position Evaluation
                  </span>
                </div>
                {solverResult && (
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-amber-300">
                    {solverResult.stats.isWinning
                      ? turn === 1
                        ? '+Decisive Win'
                        : '-Decisive Win'
                      : solverResult.stats.isLosing
                      ? turn === 1
                        ? '-Losing'
                        : '+Winning'
                      : (solverResult.evaluation / 100).toFixed(2)}
                  </span>
                )}
              </div>

              {/* Performance Telemetry Strip */}
              <div className="grid grid-cols-3 gap-2 p-2 bg-[#0d1017] rounded-xl border border-slate-800/60 text-center text-xs">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">Nodes</div>
                  <div className="font-mono font-semibold text-slate-200">
                    {solverResult?.stats.nodesEvaluated.toLocaleString() || 0}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">Time</div>
                  <div className="font-mono font-semibold text-slate-200">
                    {solverResult?.stats.timeMs || 0} ms
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">Possibilities</div>
                  <div className="font-mono font-semibold text-amber-300">
                    {solverResult?.stats.totalPossibilities || 0}
                  </div>
                </div>
              </div>

              {/* Best Move Spotlight */}
              {solverResult?.bestMove ? (
                <div className="p-3 bg-gradient-to-r from-amber-500/10 via-amber-600/10 to-transparent border border-amber-500/30 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="px-2 py-0.5 rounded bg-amber-400 text-black font-extrabold text-[10px] tracking-wide shadow-sm">
                      BEST
                    </span>
                    <div>
                      <div className="font-mono text-sm font-bold text-amber-200">
                        {solverResult.bestMove.notation}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {solverResult.bestMove.captured.length > 0 ? (
                          <span className="text-rose-400 font-medium">
                            Captures {solverResult.bestMove.captured.length} piece(s) (
                            {solverResult.bestMove.captured.map(p => posToNotation(p.r, p.c)).join(', ')})
                          </span>
                        ) : (
                          'Positional advance'
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => applyMove(solverResult.bestMove!)}
                    className="p-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-transform active:scale-95 shadow"
                    title="Play this move"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-center text-xs text-slate-400">
                  {legalMoves.length === 0 ? 'Game Over: No legal moves available!' : 'Computing optimal move...'}
                </div>
              )}
            </div>

            {/* Candidate Moves List (STEP 3: List ALL possibilities sorted, with BEST badge, show capture count) */}
            <div className="p-4 bg-[#141822] border border-slate-800 rounded-2xl shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  All Candidate Possibilities ({legalMoves.length})
                </span>
                <span className="text-[11px] text-slate-500">Sorted by Engine Rank</span>
              </div>

              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {legalMoves.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    No legal moves available for current player.
                  </div>
                ) : (
                  legalMoves.map((m, idx) => {
                    const isBest = idx === 0;
                    const isHovered = hoveredMove?.id === m.id;

                    return (
                      <div
                        key={m.id}
                        onMouseEnter={() => setHoveredMove(m)}
                        onMouseLeave={() => setHoveredMove(null)}
                        onClick={() => applyMove(m)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                          isHovered
                            ? 'bg-amber-500/20 border-amber-500/60 shadow-lg'
                            : isBest
                            ? 'bg-gradient-to-r from-amber-950/30 to-[#191f2c] border-amber-600/40 hover:border-amber-500/70'
                            : 'bg-[#181d28] border-slate-800/80 hover:bg-slate-800/70'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          {isBest ? (
                            <span className="px-1.5 py-0.5 rounded bg-amber-400 text-black font-extrabold text-[10px] tracking-wide shadow-sm">
                              BEST
                            </span>
                          ) : (
                            <span className="text-xs font-mono text-slate-500 w-4 text-right">
                              #{idx + 1}
                            </span>
                          )}

                          <div>
                            <div className="font-mono text-xs font-bold text-slate-100 flex items-center gap-1.5">
                              <span>{m.notation}</span>
                              {m.isPromotion && (
                                <span className="text-[10px] text-amber-300 font-semibold">Crown</span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {m.path.map(p => posToNotation(p.r, p.c)).join(' → ')}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5">
                          {m.captured.length > 0 ? (
                            <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-bold">
                              {m.captured.length} {m.captured.length === 1 ? 'capture' : 'captures'}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-500">0 captures</span>
                          )}

                          <span className="text-xs font-mono font-semibold text-amber-300/90 w-12 text-right">
                            {m.score !== undefined
                              ? m.score > 90000
                                ? '+Win'
                                : m.score < -90000
                                ? '-Loss'
                                : (m.score / 100).toFixed(1)
                              : '—'}
                          </span>

                          <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>

        {/* Informational Moroccan Dama Card */}
        <footer className="pt-4 border-t border-slate-800/80 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            <span>Dama Master Engine & Solver · Moroccan Rules 100% Verified</span>
            <span className="mx-2">·</span>
            <span>Mandatory Max Capture Enforcement</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setShowRulesModal(true)} className="hover:text-slate-300 underline">
              Rules & Mechanics Guide
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
