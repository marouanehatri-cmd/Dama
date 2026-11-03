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
  Download,
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
  Smartphone,
} from 'lucide-react';
import { Board, Move, Position, SolverResult, VariantRules } from './engine/types.ts';
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
} from './engine/engine.ts';
import { generateSingleHtml } from './engine/exportSingleHtml.ts';

export default function App() {
  // Game & Board State
  const [board, setBoard] = useState<Board>(createTestPosition);
  const [turn, setTurn] = useState<1 | -1>(1); // 1 = White, -1 = Black
  const [variantKey, setVariantKey] = useState<string>('moroccan');
  const [depth, setDepth] = useState<number>(6);
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
  const [showPhoneModal, setShowPhoneModal] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);

  const activeVariant: VariantRules = VARIANTS[variantKey] || VARIANTS.moroccan;

  // Sound effects via Web Audio API (optional, unobtrusive pleasant clicks)
  const playSound = useCallback((type: 'move' | 'capture' | 'win') => {
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

  // Run Solver Analysis whenever the board, turn, variant or depth changes
  const runSolver = useCallback(() => {
    setIsEngineThinking(true);
    // Use requestAnimationFrame / timeout to keep UI snappy
    setTimeout(() => {
      const result = solvePosition(board, turn, depth, activeVariant);
      setSolverResult(result);
      setIsEngineThinking(false);
    }, 10);
  }, [board, turn, depth, activeVariant]);

  useEffect(() => {
    runSolver();
  }, [runSolver]);

  // Handle Play vs Engine responses
  useEffect(() => {
    if (playVsEngine && turn !== humanColor && !isEngineThinking && solverResult?.bestMove) {
      const timer = setTimeout(() => {
        applyMove(solverResult.bestMove!);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [playVsEngine, turn, humanColor, isEngineThinking, solverResult]);

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

  // Apply a move to the board
  const applyMove = useCallback(
    (move: Move) => {
      setHistory(prev => [...prev, { board: cloneBoard(board), turn }]);
      setFuture([]);
      setBoard(move.finalBoard);
      setTurn(turn === 1 ? -1 : 1);
      setSelectedPos(null);
      setHoveredMove(null);
      setLastMoveMade(move);

      if (move.captured.length > 0) {
        playSound('capture');
      } else {
        playSound('move');
      }

      // Check win condition
      const nextMoves = getAllMoves(move.finalBoard, turn === 1 ? -1 : 1, activeVariant);
      if (nextMoves.length === 0) {
        playSound('win');
        showToast(turn === 1 ? '🎉 White wins!' : '🎉 Black wins!');
      }
    },
    [board, turn, activeVariant, playSound, showToast]
  );

  // Undo move
  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setFuture(prev => [{ board: cloneBoard(board), turn }, ...prev]);
    setBoard(last.board);
    setTurn(last.turn);
    setHistory(prev => prev.slice(0, prev.length - 1));
    setSelectedPos(null);
    setHoveredMove(null);
    setLastMoveMade(null);
  }, [history, board, turn]);

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

  // Export Standalone HTML
  const handleExportHtml = () => {
    const htmlContent = generateSingleHtml();
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dama-master.html';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('💾 Downloaded standalone dama-master.html!');
  };

  // Compute best move or active hover move for board arrows
  const activeHighlightedMove = hoveredMove || solverResult?.bestMove || null;

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
                <span className="font-semibold text-amber-300">2. Man Capture (Forward & Backward):</span> Men capture 1 step diagonally forward OR backward by leaping over an adjacent opponent piece into an empty square.
              </div>
              <div className="pt-2">
                <span className="font-semibold text-amber-300">3. Mandatory Capture:</span> If any capture exists on the board, non-capturing normal moves are strictly illegal.
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

      {/* Phone & APK Install Modal */}
      {showPhoneModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161a22] border border-amber-900/60 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative text-sm space-y-4 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowPhoneModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-md"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2.5 text-amber-400 font-serif text-lg font-bold">
              <Smartphone className="w-5 h-5 text-amber-400" />
              <span>Playing & Installing on Phone</span>
            </div>

            <div className="space-y-3.5 text-xs text-slate-300">
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <span>📱 Method 1: Instant Install (No APK Needed)</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Open this app in Chrome / Samsung Internet on your phone, tap the <strong>3 dots (⋮)</strong> menu, and select <strong>&quot;Install app&quot;</strong> or <strong>&quot;Add to Home Screen&quot;</strong>.
                  It installs instantly as a full-screen app with the royal Moroccan Dama icon!
                </p>
              </div>

              <div className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl space-y-1">
                <div className="font-bold text-sky-300 flex items-center gap-1.5">
                  <span>🤖 Method 2: Download Native Android APK</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  The native Android APK was successfully built by GitHub Actions and is ready to install!
                </p>
                <div className="pt-2 flex flex-wrap gap-2">
                  <a
                    href="/dama-master-debug.apk"
                    download="dama-master-debug.apk"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-lg text-xs shadow-md transition-all"
                  >
                    <Download className="w-4 h-4 text-slate-950" />
                    <span>Download Android APK (4.5 MB)</span>
                  </a>
                  <a
                    href="https://github.com/marouanehatri-cmd/Dama/actions/runs/41708387509"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors"
                  >
                    <span>View GitHub Build Run</span>
                  </a>
                </div>
              </div>

              <div className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl space-y-1">
                <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                  <span>💾 Method 3: Offline Single File</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Tap <strong>&quot;Export Single HTML&quot;</strong> to save the complete self-contained game file onto your phone. You can open and play it offline in any mobile browser anytime without internet!
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowPhoneModal(false)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg text-xs"
              >
                Close
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
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-900/40 text-black font-bold">
                <Crown className="w-6 h-6" />
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

          {/* Quick Header Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowPhoneModal(true)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-amber-500/20 to-amber-600/30 hover:from-amber-500/30 hover:to-amber-600/40 text-amber-300 border border-amber-500/40 flex items-center gap-1.5 transition-colors shadow-sm"
              title="Install or play on phone"
            >
              <Smartphone className="w-3.5 h-3.5 text-amber-400" />
              <span>Phone / APK Guide</span>
            </button>
            <button
              onClick={() => setShowRulesModal(true)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>Moroccan Rules</span>
            </button>
            <button
              onClick={handleExportHtml}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-colors"
              title="Download 100% self-contained offline HTML file"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export Single HTML</span>
            </button>
            <button
              onClick={() => setIsFlipped(f => !f)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-colors"
              title="Flip perspective"
            >
              <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
              <span>Flip Board</span>
            </button>
          </div>
        </header>

        {/* Preset Positions & User Test Preset Banner */}
        <div className="flex flex-wrap items-center gap-2 bg-[#13161f] border border-amber-900/30 p-2.5 rounded-xl">
          <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider px-2 flex items-center gap-1.5">
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

        {/* Main Grid: Left Board / Right Solver Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT: Board & Board Controls */}
          <div className="lg:col-span-7 flex flex-col items-center space-y-4">
            {/* Top Board Bar: Player Turn Badge & History Controls */}
            <div className="w-full max-w-[500px] flex items-center justify-between bg-[#151922] px-4 py-2.5 rounded-xl border border-slate-800 text-xs">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-3.5 h-3.5 rounded-full border ${
                    turn === 1
                      ? 'bg-amber-100 border-amber-300 shadow-sm'
                      : 'bg-slate-900 border-slate-600 shadow-sm'
                  }`}
                />
                <span className="font-semibold text-slate-200">
                  {turn === 1 ? 'White to Move' : 'Black to Move'}
                </span>
                {maxCaptureCount > 0 && (
                  <span className="text-[11px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                    Mandatory Capture ({maxCaptureCount})
                  </span>
                )}
              </div>

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

                          {/* Piece Rendering */}
                          {piece !== 0 && (
                            <div
                              draggable={!isEditorOpen && Math.sign(piece) === turn}
                              onDragStart={e => handleDragStart(r, c, e)}
                              className={`w-[78%] h-[78%] rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer relative shadow-xl ${
                                piece > 0
                                  ? 'bg-gradient-to-b from-[#faf6ed] via-[#ede3cc] to-[#c7b99c] border-2 border-[#fff8e7] text-amber-950 shadow-amber-950/60'
                                  : 'bg-gradient-to-b from-[#2b2b2e] via-[#1a1b1d] to-[#0c0d0f] border-2 border-stone-600 text-amber-400 shadow-black/80'
                              } ${
                                isCapturedInActive ? 'opacity-40 line-through' : ''
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

            {/* Quick Action Toolbar Below Board */}
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
          </div>

          {/* RIGHT: Solver Controls & All Candidate Possibilities List */}
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
            <button onClick={handleExportHtml} className="hover:text-slate-300 underline">
              Standalone Offline HTML
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
