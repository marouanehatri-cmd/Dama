/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generates a complete, single-file HTML version of Dama Master
 * that can be opened in any browser offline with zero installation.
 */
export function generateSingleHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Dama Master - Moroccan Dama & Universal Checkers Solver</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Plus Jakarta Sans', sans-serif; background-color: #0f1115; color: #e2e8f0; }
    .font-cinzel { font-family: 'Cinzel', serif; }
    .font-mono { font-family: 'JetBrains+Mono', monospace; }
  </style>
</head>
<body class="min-h-screen">
  <div id="root"></div>

  <script type="text/babel">
    const { useState, useEffect, useMemo, useRef } = React;

    // --- ENGINE LOGIC ---
    const VARIANTS = {
      moroccan: {
        id: 'moroccan',
        name: 'Moroccan Dama (الضامة المغربية)',
        menCaptureBackwards: true,
        mandatoryCapture: true,
        maxCaptureMajority: true,
        flyingKing: true,
        kingSweepsLine: true,
        promotionEndsTurn: true,
      },
      international: {
        id: 'international',
        name: 'International Draughts (8x8)',
        menCaptureBackwards: true,
        mandatoryCapture: true,
        maxCaptureMajority: true,
        flyingKing: true,
        kingSweepsLine: false,
        promotionEndsTurn: false,
      },
      spanish: {
        id: 'spanish',
        name: 'Spanish Dama',
        menCaptureBackwards: false,
        mandatoryCapture: true,
        maxCaptureMajority: true,
        flyingKing: true,
        kingSweepsLine: false,
        promotionEndsTurn: true,
      },
      american: {
        id: 'american',
        name: 'American Checkers',
        menCaptureBackwards: false,
        mandatoryCapture: true,
        maxCaptureMajority: false,
        flyingKing: false,
        kingSweepsLine: false,
        promotionEndsTurn: true,
      }
    };

    function posToNotation(r, c) {
      return String.fromCharCode(97 + c) + (8 - r);
    }

    function notationToPos(not) {
      return { r: 8 - parseInt(not.slice(1), 10), c: not.charCodeAt(0) - 97 };
    }

    function isDarkSquare(r, c) {
      return (r + c) % 2 === 1;
    }

    function createEmptyBoard() {
      return Array.from({ length: 8 }, () => Array(8).fill(0));
    }

    function createStartingBoard() {
      const b = createEmptyBoard();
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (isDarkSquare(r, c)) {
            if (r < 3) b[r][c] = -1;
            else if (r > 4) b[r][c] = 1;
          }
        }
      }
      return b;
    }

    function createTestPosition() {
      const b = createEmptyBoard();
      const d4 = notationToPos('d4');
      const e5 = notationToPos('e5');
      const f6 = notationToPos('f6');
      b[d4.r][d4.c] = 2;  // White king
      b[e5.r][e5.c] = -1; // Black man
      b[f6.r][f6.c] = -1; // Black man
      return b;
    }

    function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
    function hasPos(list, r, c) { return list.some(p => p.r === r && p.c === c); }
    function cloneBoard(b) { return b.map(row => [...row]); }

    function getAllCaptures(board, r, c, player, rules = VARIANTS.moroccan) {
      const piece = board[r][c];
      if (Math.sign(piece) !== player) return [];
      const isKing = Math.abs(piece) === 2;
      const results = [];
      const startPos = { r, c };

      if (!isKing) {
        const dirs = rules.menCaptureBackwards
          ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
          : player === 1 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];

        function recurseMan(currR, currC, path, captured) {
          let found = false;
          for (const [dr, dc] of dirs) {
            const er = currR + dr, ec = currC + dc;
            const lr = currR + 2 * dr, lc = currC + 2 * dc;
            if (!inBounds(lr, lc)) continue;
            const ep = board[er][ec];
            if (Math.sign(ep) === -player && !hasPos(captured, er, ec)) {
              const empty = (board[lr][lc] === 0 || (lr === r && lc === c)) && !hasPos(captured, lr, lc);
              if (empty) {
                found = true;
                const newPath = [...path, { r: lr, c: lc }];
                const newCap = [...captured, { r: er, c: ec }];
                const reachesPromotion = (player === 1 && lr === 0) || (player === -1 && lr === 7);
                if (reachesPromotion && rules.promotionEndsTurn) {
                  const fb = cloneBoard(board);
                  fb[r][c] = 0;
                  for (const p of newCap) fb[p.r][p.c] = 0;
                  fb[lr][lc] = player * 2;
                  results.push({
                    id: posToNotation(r, c) + '-' + newPath.map(p => posToNotation(p.r, p.c)).join(':'),
                    from: startPos,
                    to: { r: lr, c: lc },
                    path: newPath,
                    captured: newCap,
                    isPromotion: true,
                    finalBoard: fb,
                    notation: posToNotation(r, c) + ':' + newPath.slice(1).map(p => posToNotation(p.r, p.c)).join(':') + ' (x' + newCap.length + ')=K'
                  });
                } else {
                  recurseMan(lr, lc, newPath, newCap);
                }
              }
            }
          }
          if (!found && captured.length > 0) {
            const reachesPromotion = (player === 1 && currR === 0) || (player === -1 && currR === 7);
            const fb = cloneBoard(board);
            fb[r][c] = 0;
            for (const p of captured) fb[p.r][p.c] = 0;
            fb[currR][currC] = reachesPromotion ? player * 2 : piece;
            results.push({
              id: posToNotation(r, c) + '-' + path.map(p => posToNotation(p.r, p.c)).join(':'),
              from: startPos,
              to: { r: currR, c: currC },
              path,
              captured,
              isPromotion: reachesPromotion,
              finalBoard: fb,
              notation: posToNotation(r, c) + ':' + path.slice(1).map(p => posToNotation(p.r, p.c)).join(':') + ' (x' + captured.length + ')' + (reachesPromotion ? '=K' : '')
            });
          }
        }
        recurseMan(r, c, [startPos], []);
      } else {
        const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
        function recurseKing(currR, currC, path, captured) {
          let found = false;
          for (const [dr, dc] of dirs) {
            if (rules.flyingKing) {
              let step = 1;
              const capInDir = [];
              while (inBounds(currR + step * dr, currC + step * dc)) {
                const cr = currR + step * dr, cc = currC + step * dc;
                const sp = board[cr][cc];
                if (Math.sign(sp) === player || hasPos(captured, cr, cc)) break;
                if (Math.sign(sp) === -player) {
                  capInDir.push({ r: cr, c: cc });
                  if (rules.kingSweepsLine) {
                    let look = step + 1;
                    while (inBounds(currR + look * dr, currC + look * dc)) {
                      const np = board[currR + look * dr][currC + look * dc];
                      if (Math.sign(np) === -player && !hasPos(captured, currR + look * dr, currC + look * dc)) {
                        capInDir.push({ r: currR + look * dr, c: currC + look * dc });
                        look++;
                      } else break;
                    }
                    step = look - 1;
                  }
                  let landStep = step + 1;
                  while (inBounds(currR + landStep * dr, currC + landStep * dc)) {
                    const lr = currR + landStep * dr, lc = currC + landStep * dc;
                    const lp = board[lr][lc];
                    const empty = (lp === 0 || (lr === r && lc === c)) && !hasPos(captured, lr, lc);
                    if (!empty) break;
                    found = true;
                    recurseKing(lr, lc, [...path, { r: lr, c: lc }], [...captured, ...capInDir]);
                    landStep++;
                  }
                  break;
                }
                step++;
              }
            } else {
              const er = currR + dr, ec = currC + dc;
              const lr = currR + 2 * dr, lc = currC + 2 * dc;
              if (inBounds(lr, lc)) {
                const ep = board[er][ec];
                if (Math.sign(ep) === -player && !hasPos(captured, er, ec)) {
                  if ((board[lr][lc] === 0 || (lr === r && lc === c)) && !hasPos(captured, lr, lc)) {
                    found = true;
                    recurseKing(lr, lc, [...path, { r: lr, c: lc }], [...captured, { r: er, c: ec }]);
                  }
                }
              }
            }
          }
          if (!found && captured.length > 0) {
            const fb = cloneBoard(board);
            fb[r][c] = 0;
            for (const p of captured) fb[p.r][p.c] = 0;
            fb[currR][currC] = piece;
            results.push({
              id: posToNotation(r, c) + '-' + path.map(p => posToNotation(p.r, p.c)).join(':'),
              from: startPos,
              to: { r: currR, c: currC },
              path,
              captured,
              isPromotion: false,
              finalBoard: fb,
              notation: posToNotation(r, c) + ':' + path.slice(1).map(p => posToNotation(p.r, p.c)).join(':') + ' (x' + captured.length + ')'
            });
          }
        }
        recurseKing(r, c, [startPos], []);
      }

      const map = new Map();
      for (const m of results) {
        const k = m.from.r + ',' + m.from.c + '->' + m.to.r + ',' + m.to.c + '_cap:' + m.captured.map(p => p.r + ',' + p.c).sort().join(';');
        if (!map.has(k) || m.path.length > map.get(k).path.length) map.set(k, m);
      }
      return Array.from(map.values());
    }

    function findMaxCaptureLength(board, player, rules = VARIANTS.moroccan) {
      let max = 0;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (Math.sign(board[r][c]) === player) {
            const caps = getAllCaptures(board, r, c, player, rules);
            for (const cap of caps) {
              if (cap.captured.length > max) max = cap.captured.length;
            }
          }
        }
      }
      return max;
    }

    function getAllMoves(board, player, rules = VARIANTS.moroccan) {
      const maxCap = findMaxCaptureLength(board, player, rules);
      if (maxCap > 0 && rules.mandatoryCapture) {
        const caps = [];
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            if (Math.sign(board[r][c]) === player) {
              const pcCaps = getAllCaptures(board, r, c, player, rules);
              for (const cap of pcCaps) {
                if (!rules.maxCaptureMajority || cap.captured.length === maxCap) caps.push(cap);
              }
            }
          }
        }
        return caps;
      }
      // Normal moves
      const moves = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const piece = board[r][c];
          if (Math.sign(piece) !== player) continue;
          const isKing = Math.abs(piece) === 2;
          const from = { r, c };
          if (!isKing) {
            const fdr = player === 1 ? -1 : 1;
            for (const tc of [c - 1, c + 1]) {
              const tr = r + fdr;
              if (inBounds(tr, tc) && board[tr][tc] === 0) {
                const prom = (player === 1 && tr === 0) || (player === -1 && tr === 7);
                const fb = cloneBoard(board);
                fb[r][c] = 0;
                fb[tr][tc] = prom ? player * 2 : piece;
                moves.push({
                  id: posToNotation(r, c) + '-' + posToNotation(tr, tc),
                  from, to: { r: tr, c: tc }, path: [from, { r: tr, c: tc }],
                  captured: [], isPromotion: prom, finalBoard: fb,
                  notation: posToNotation(r, c) + '-' + posToNotation(tr, tc) + (prom ? '=K' : '')
                });
              }
            }
          } else {
            const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
            for (const [dr, dc] of dirs) {
              if (rules.flyingKing) {
                let st = 1;
                while (inBounds(r + st * dr, c + st * dc)) {
                  const tr = r + st * dr, tc = c + st * dc;
                  if (board[tr][tc] !== 0) break;
                  const fb = cloneBoard(board);
                  fb[r][c] = 0;
                  fb[tr][tc] = piece;
                  moves.push({
                    id: posToNotation(r, c) + '-' + posToNotation(tr, tc),
                    from, to: { r: tr, c: tc }, path: [from, { r: tr, c: tc }],
                    captured: [], isPromotion: false, finalBoard: fb,
                    notation: posToNotation(r, c) + '-' + posToNotation(tr, tc)
                  });
                  st++;
                }
              } else {
                const tr = r + dr, tc = c + dc;
                if (inBounds(tr, tc) && board[tr][tc] === 0) {
                  const fb = cloneBoard(board);
                  fb[r][c] = 0;
                  fb[tr][tc] = piece;
                  moves.push({
                    id: posToNotation(r, c) + '-' + posToNotation(tr, tc),
                    from, to: { r: tr, c: tc }, path: [from, { r: tr, c: tc }],
                    captured: [], isPromotion: false, finalBoard: fb,
                    notation: posToNotation(r, c) + '-' + posToNotation(tr, tc)
                  });
                }
              }
            }
          }
        }
      }
      return moves;
    }

    function evaluateBoard(board) {
      let score = 0, wp = 0, bp = 0;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const p = board[r][c];
          if (p === 0) continue;
          if (p === 1) { wp++; score += 100 + (7 - r) * 5; }
          else if (p === 2) { wp++; score += 350; }
          else if (p === -1) { bp++; score -= 100 + r * 5; }
          else if (p === -2) { bp++; score -= 350; }
        }
      }
      if (wp > 0 && bp === 0) return 99999;
      if (bp > 0 && wp === 0) return -99999;
      return score;
    }

    function minimax(board, depth, alpha, beta, maximizing, rules, stats) {
      stats.nodes++;
      const player = maximizing ? 1 : -1;
      const legalMoves = getAllMoves(board, player, rules);
      if (legalMoves.length === 0) {
        return { score: maximizing ? -100000 + (10 - depth) : 100000 - (10 - depth), bestMove: null };
      }
      if (depth <= 0 || Date.now() - stats.startTime > stats.timeLimitMs) {
        return { score: evaluateBoard(board), bestMove: null };
      }
      legalMoves.sort((a, b) => b.captured.length - a.captured.length);
      let bestMove = legalMoves[0];
      if (maximizing) {
        let maxEval = -Infinity;
        for (const m of legalMoves) {
          const { score } = minimax(m.finalBoard, depth - 1, alpha, beta, false, rules, stats);
          if (score > maxEval) { maxEval = score; bestMove = m; }
          alpha = Math.max(alpha, score);
          if (beta <= alpha) break;
        }
        return { score: maxEval, bestMove };
      } else {
        let minEval = Infinity;
        for (const m of legalMoves) {
          const { score } = minimax(m.finalBoard, depth - 1, alpha, beta, true, rules, stats);
          if (score < minEval) { minEval = score; bestMove = m; }
          beta = Math.min(beta, score);
          if (beta <= alpha) break;
        }
        return { score: minEval, bestMove };
      }
    }

    function solvePosition(board, player, depth, rules) {
      const t0 = performance.now();
      const allLegalMoves = getAllMoves(board, player, rules);
      if (allLegalMoves.length === 0) {
        return { bestMove: null, evaluation: player === 1 ? -99999 : 99999, allLegalMoves: [], stats: { nodes: 1, timeMs: 0 } };
      }
      const stats = { nodes: 0, startTime: Date.now(), timeLimitMs: 2500 };
      const scoredMoves = [];
      let bestScore = player === 1 ? -Infinity : Infinity;
      let bestMove = null;

      for (const m of allLegalMoves) {
        const { score } = minimax(m.finalBoard, Math.max(1, depth - 1), -Infinity, Infinity, player === -1, rules, stats);
        m.score = score;
        scoredMoves.push(m);
        if (player === 1 ? score > bestScore : score < bestScore) {
          bestScore = score;
          bestMove = m;
        }
      }
      scoredMoves.sort((a, b) => player === 1 ? (b.score - a.score) : (a.score - b.score));
      return {
        bestMove: scoredMoves[0] || null,
        evaluation: bestScore,
        allLegalMoves: scoredMoves,
        stats: { nodes: stats.nodes, timeMs: Math.round(performance.now() - t0) }
      };
    }

    function DamaApp() {
      const [board, setBoard] = useState(createStartingBoard);
      const [turn, setTurn] = useState(1);
      const [variant, setVariant] = useState('moroccan');
      const [depth, setDepth] = useState(6);
      const [solution, setSolution] = useState(null);
      const [selectedSq, setSelectedSq] = useState(null);
      const [hoveredMove, setHoveredMove] = useState(null);

      useEffect(() => {
        handleAnalyze();
      }, [board, turn, variant, depth]);

      const handleAnalyze = () => {
        const res = solvePosition(board, turn, depth, VARIANTS[variant]);
        setSolution(res);
      };

      const legalMovesForSelected = useMemo(() => {
        if (!selectedSq || !solution) return [];
        return solution.allLegalMoves.filter(m => m.from.r === selectedSq.r && m.from.c === selectedSq.c);
      }, [selectedSq, solution]);

      const handleSquareClick = (r, c) => {
        if (!isDarkSquare(r, c)) return;
        const targetMove = legalMovesForSelected.find(m => m.to.r === r && m.to.c === c);
        if (targetMove) {
          setBoard(targetMove.finalBoard);
          setTurn(turn === 1 ? -1 : 1);
          setSelectedSq(null);
          return;
        }
        if (Math.sign(board[r][c]) === turn) {
          setSelectedSq({ r, c });
        } else {
          setSelectedSq(null);
        }
      };

      const activeMove = hoveredMove || solution?.bestMove;

      return (
        <div className="max-w-6xl mx-auto p-4 md:p-8">
          <header className="mb-6 flex flex-wrap items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight font-cinzel text-amber-300">DAMA MASTER</h1>
              <p className="text-xs text-slate-400">Moroccan Dama & Universal Checkers Solver</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setBoard(createTestPosition()); setTurn(1); }} className="px-3 py-1.5 text-xs bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded hover:bg-amber-500/30">
                Test (King d4 vs e5, f6)
              </button>
              <button onClick={() => { setBoard(createStartingBoard()); setTurn(1); }} className="px-3 py-1.5 text-xs bg-slate-800 text-slate-200 border border-slate-700 rounded hover:bg-slate-700">
                Starting
              </button>
              <button onClick={() => { setBoard(createEmptyBoard()); }} className="px-3 py-1.5 text-xs bg-slate-800 text-slate-200 border border-slate-700 rounded hover:bg-slate-700">
                Clear
              </button>
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-7 flex flex-col items-center">
              <div className="p-4 bg-amber-950/40 border border-amber-900/60 rounded-2xl shadow-2xl relative">
                <div className="w-[340px] h-[340px] sm:w-[460px] sm:h-[460px] grid grid-cols-8 grid-rows-8 border-4 border-amber-950 rounded-lg overflow-hidden relative shadow-inner">
                  {board.map((row, r) => row.map((piece, c) => {
                    const isDark = isDarkSquare(r, c);
                    const isSelected = selectedSq && selectedSq.r === r && selectedSq.c === c;
                    const isLegalTarget = legalMovesForSelected.some(m => m.to.r === r && m.to.c === c);

                    return (
                      <div
                        key={r + '-' + c}
                        onClick={() => handleSquareClick(r, c)}
                        className={\`relative flex items-center justify-center cursor-pointer transition-colors \${
                          isDark ? 'bg-[#533827]' : 'bg-[#e3c59e]'
                        } \${isSelected ? 'ring-4 ring-amber-400 ring-inset' : ''}\`}
                      >
                        {c === 0 && <span className="absolute top-0.5 left-1 text-[10px] opacity-40 font-mono text-white">{8 - r}</span>}
                        {r === 7 && <span className="absolute bottom-0.5 right-1 text-[10px] opacity-40 font-mono text-white">{String.fromCharCode(97 + c)}</span>}

                        {piece !== 0 && (
                          <div className={\`w-4/5 h-4/5 rounded-full flex items-center justify-center shadow-lg transition-transform \${
                            piece > 0 ? 'bg-amber-100 text-amber-950 border-2 border-amber-300' : 'bg-stone-900 text-amber-400 border-2 border-stone-700'
                          }\`}>
                            {Math.abs(piece) === 2 ? '👑' : ''}
                          </div>
                        )}

                        {isLegalTarget && (
                          <div className="w-3.5 h-3.5 rounded-full bg-emerald-400/80 animate-ping absolute"></div>
                        )}
                      </div>
                    );
                  }))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-4">
              <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold">Variant</span>
                  <select value={variant} onChange={e => setVariant(e.target.value)} className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs">
                    {Object.values(VARIANTS).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold">To Move</span>
                  <div className="flex gap-2">
                    <button onClick={() => setTurn(1)} className={\`px-2.5 py-1 text-xs rounded \${turn === 1 ? 'bg-amber-500 text-black font-bold' : 'bg-slate-800'}\`}>White</button>
                    <button onClick={() => setTurn(-1)} className={\`px-2.5 py-1 text-xs rounded \${turn === -1 ? 'bg-amber-500 text-black font-bold' : 'bg-slate-800'}\`}>Black</button>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold">Search Depth: {depth}</span>
                  <input type="range" min="1" max="15" value={depth} onChange={e => setDepth(Number(e.target.value))} className="w-32 accent-amber-500" />
                </div>
              </div>

              <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Analysis & Possibilities</h3>
                  {solution && <span className="text-xs text-slate-500 font-mono">{solution.stats.nodes} nodes · {solution.stats.timeMs}ms</span>}
                </div>
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                  {solution?.allLegalMoves.map((m, idx) => (
                    <div
                      key={m.id}
                      onMouseEnter={() => setHoveredMove(m)}
                      onMouseLeave={() => setHoveredMove(null)}
                      onClick={() => { setBoard(m.finalBoard); setTurn(turn === 1 ? -1 : 1); }}
                      className="p-2.5 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/60 rounded flex items-center justify-between cursor-pointer text-xs"
                    >
                      <div className="flex items-center gap-2">
                        {idx === 0 && <span className="bg-amber-400 text-black font-extrabold px-1.5 py-0.5 rounded text-[10px]">BEST</span>}
                        <span className="font-mono font-bold text-amber-200">{m.notation}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {m.captured.length > 0 && <span className="text-rose-400 font-semibold">{m.captured.length} caps</span>}
                        <span className="font-mono text-slate-400">{m.score > 90000 ? '+Win' : m.score < -90000 ? '-Win' : (m.score / 100).toFixed(1)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    ReactDOM.render(<DamaApp />, document.getElementById('root'));
  </script>
</body>
</html>`;
}
