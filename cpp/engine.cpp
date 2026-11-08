/**
 * Dama Master - Moroccan Dama C++ Bitboard Engine
 * Stockfish-style high performance engine with 64-bit Bitboards.
 * 
 * Rules:
 *  - Moroccan Dama on 8x8 board (12 vs 12).
 *  - Men move forward 1 square diagonally; capture forward only.
 *  - Kings are FLYING KINGS: move any distance diagonally; capture from distance;
 *    land on any free square behind captured piece.
 *  - Strict Mandatory Capture & Majority Rule (must take maximum pieces).
 *  - Multi-jump in single turn; promotion to King immediately ends turn.
 *  - Bitboard representation with XOR-only makeMove / undoMove (0 allocations).
 *  - PVS, LMR, Null-Move, Quiescence, Zobrist TT, Killer & History heuristics.
 */

#include "engine.h"
#include <iostream>
#include <random>
#include <chrono>
#include <algorithm>
#include <cassert>

namespace Dama {

// Constant bitmasks
constexpr uint64_t DARK_SQUARES_MASK = 0xAA55AA55AA55AA55ULL;
constexpr uint64_t WHITE_PROMOTION_MASK = 0x00000000000000FFULL; // Row 0: sq 0..7
constexpr uint64_t BLACK_PROMOTION_MASK = 0xFF00000000000000ULL; // Row 7: sq 56..63
constexpr uint64_t BACK_RANK_WHITE_MASK = 0xFF00000000000000ULL; // Row 7
constexpr uint64_t BACK_RANK_BLACK_MASK = 0x00000000000000FFULL; // Row 0
constexpr uint64_t CENTER_SQUARES_MASK  = 0x00003C3C3C3C0000ULL; // Center 4x4

// Diagonals offsets:
// Up-Left:    -9 (dr = -1, dc = -1)
// Up-Right:   -7 (dr = -1, dc = +1)
// Down-Left:  +7 (dr = +1, dc = -1)
// Down-Right: +9 (dr = +1, dc = +1)
const int DIR_OFFSETS[4] = { -9, -7, 7, 9 };
const int DIR_DR[4]      = { -1, -1, 1, 1 };
const int DIR_DC[4]      = { -1,  1, -1, 1 };

inline int getRow(int sq) { return sq >> 3; }
inline int getCol(int sq) { return sq & 7; }
inline int getSq(int r, int c) { return (r << 3) | c; }
inline bool isValidSquare(int r, int c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
inline bool isDarkSquare(int r, int c) { return ((r + c) & 1) == 1; }

// Count set bits
inline int popcount(uint64_t b) {
#if defined(__GNUC__) || defined(__clang__)
    return __builtin_popcountll(b);
#else
    int count = 0;
    while (b) { count++; b &= (b - 1); }
    return count;
#endif
}

// BitScanForward (lowest set bit index)
inline int bitScanForward(uint64_t b) {
#if defined(__GNUC__) || defined(__clang__)
    return __builtin_ctzll(b);
#else
    if (b == 0) return -1;
    int idx = 0;
    while ((b & 1) == 0) { b >>= 1; idx++; }
    return idx;
#endif
}

// -------------------------------------------------------------
// Engine Constructor & Lifecycle
// -------------------------------------------------------------
Engine::Engine()
    : transpositionTable(nullptr),
      nodesEvaluated(0),
      searchTimeLimitMs(800),
      stopSearch(false) {
    transpositionTable = new TTEntry[TT_SIZE];
    initZobrist();
    initPST();
    reset();
}

Engine::~Engine() {
    if (transpositionTable) {
        delete[] transpositionTable;
        transpositionTable = nullptr;
    }
}

void Engine::reset() {
    if (transpositionTable) {
        std::memset(transpositionTable, 0, sizeof(TTEntry) * TT_SIZE);
    }
    std::memset(killerMoves, 0, sizeof(killerMoves));
    std::memset(historyTable, 0, sizeof(historyTable));
    nodesEvaluated = 0;
    stopSearch = false;
}

// -------------------------------------------------------------
// Zobrist Initialization
// -------------------------------------------------------------
void Engine::initZobrist() {
    std::mt19937_64 rng(0xD4A07CAFEULL);
    for (int sq = 0; sq < 64; ++sq) {
        for (int p = 0; p < 5; ++p) {
            zobristTable[sq][p] = rng();
        }
    }
    zobristSide = rng();
}

uint64_t Engine::computeHash(const Bitboards& bb, bool isWhite) const {
    uint64_t hash = 0;
    uint64_t wm = bb.whiteMen;
    while (wm) {
        int sq = bitScanForward(wm);
        hash ^= zobristTable[sq][WHITE_MAN];
        wm &= (wm - 1);
    }
    uint64_t wk = bb.whiteKings;
    while (wk) {
        int sq = bitScanForward(wk);
        hash ^= zobristTable[sq][WHITE_KING];
        wk &= (wk - 1);
    }
    uint64_t bm = bb.blackMen;
    while (bm) {
        int sq = bitScanForward(bm);
        hash ^= zobristTable[sq][BLACK_MAN];
        bm &= (bm - 1);
    }
    uint64_t bk = bb.blackKings;
    while (bk) {
        int sq = bitScanForward(bk);
        hash ^= zobristTable[sq][BLACK_KING];
        bk &= (bk - 1);
    }
    if (!isWhite) {
        hash ^= zobristSide;
    }
    return hash;
}

// -------------------------------------------------------------
// Piece-Square Tables (PST) Initialization
// -------------------------------------------------------------
void Engine::initPST() {
    // Base table for men advancement and central control
    for (int r = 0; r < 8; ++r) {
        for (int c = 0; c < 8; ++c) {
            int sq = getSq(r, c);
            if (!isDarkSquare(r, c)) {
                whiteMenPST[sq] = 0;
                blackMenPST[sq] = 0;
                kingPST[sq] = 0;
                continue;
            }

            // White Men: advancement towards row 0
            int wScore = (7 - r) * 12; // Rank advancement bonus
            if (r == 1) wScore += 25;  // 7th rank near promotion
            if (r == 2) wScore += 15;  // 6th rank near promotion
            if (r == 7) wScore += 20;  // Back-rank defense bonus
            if (c >= 2 && c <= 5 && r >= 2 && r <= 5) wScore += 15; // Center control
            whiteMenPST[sq] = wScore;

            // Black Men: advancement towards row 7
            int bScore = r * 12;
            if (r == 6) bScore += 25;  // 7th rank near promotion
            if (r == 5) bScore += 15;  // 6th rank near promotion
            if (r == 0) bScore += 20;  // Back-rank defense
            if (c >= 2 && c <= 5 && r >= 2 && r <= 5) bScore += 15; // Center control
            blackMenPST[sq] = bScore;

            // Kings: Central presence gives supreme board sweep mobility
            int kScore = 0;
            int distCenter = std::abs(r - 3) + std::abs(c - 3);
            kScore += (7 - distCenter) * 6;
            kingPST[sq] = kScore;
        }
    }
}

// -------------------------------------------------------------
// Board Converters
// -------------------------------------------------------------
Bitboards Engine::toBitboard(const int board[64]) {
    Bitboards bb;
    for (int sq = 0; sq < 64; ++sq) {
        uint64_t mask = (1ULL << sq);
        switch (board[sq]) {
            case WHITE_MAN:  bb.whiteMen   |= mask; break;
            case WHITE_KING: bb.whiteKings |= mask; break;
            case BLACK_MAN:  bb.blackMen   |= mask; break;
            case BLACK_KING: bb.blackKings |= mask; break;
            default: break;
        }
    }
    return bb;
}

void Engine::fromBitboard(const Bitboards& bb, int outBoard[64]) {
    for (int sq = 0; sq < 64; ++sq) {
        uint64_t mask = (1ULL << sq);
        if (bb.whiteMen & mask)        outBoard[sq] = WHITE_MAN;
        else if (bb.whiteKings & mask) outBoard[sq] = WHITE_KING;
        else if (bb.blackMen & mask)   outBoard[sq] = BLACK_MAN;
        else if (bb.blackKings & mask) outBoard[sq] = BLACK_KING;
        else                           outBoard[sq] = EMPTY;
    }
}

void Engine::fromBitboardToMove(const Move& move,
                               int& fromRow, int& fromCol,
                               int& toRow, int& toCol,
                               std::vector<int>& capturedIndices) {
    fromRow = getRow(move.from);
    fromCol = getCol(move.from);
    toRow = getRow(move.to);
    toCol = getCol(move.to);

    capturedIndices.clear();
    uint64_t caps = move.capturedMenMask | move.capturedKingsMask;
    while (caps) {
        int sq = bitScanForward(caps);
        capturedIndices.push_back(sq);
        caps &= (caps - 1);
    }
}

// -------------------------------------------------------------
// Make & Undo Move using Bitwise XOR (Zero Copy)
// -------------------------------------------------------------
void Engine::makeMove(Bitboards& bb, const Move& m, bool isWhite) {
    uint64_t fromMask = (1ULL << m.from);
    uint64_t toMask   = (1ULL << m.to);
    uint64_t moveMask = fromMask | toMask;

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
        // Remove captured enemy pieces
        if (m.capturedMenMask)   bb.blackMen   ^= m.capturedMenMask;
        if (m.capturedKingsMask) bb.blackKings ^= m.capturedKingsMask;
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
        // Remove captured enemy pieces
        if (m.capturedMenMask)   bb.whiteMen   ^= m.capturedMenMask;
        if (m.capturedKingsMask) bb.whiteKings ^= m.capturedKingsMask;
    }
}

void Engine::undoMove(Bitboards& bb, const Move& m, bool isWhite) {
    uint64_t fromMask = (1ULL << m.from);
    uint64_t toMask   = (1ULL << m.to);
    uint64_t moveMask = fromMask | toMask;

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
        // Restore captured enemy pieces
        if (m.capturedMenMask)   bb.blackMen   ^= m.capturedMenMask;
        if (m.capturedKingsMask) bb.blackKings ^= m.capturedKingsMask;
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
        // Restore captured enemy pieces
        if (m.capturedMenMask)   bb.whiteMen   ^= m.capturedMenMask;
        if (m.capturedKingsMask) bb.whiteKings ^= m.capturedKingsMask;
    }
}

// -------------------------------------------------------------
// Move Generation
// -------------------------------------------------------------
void Engine::generateLegalMoves(const Bitboards& bb, bool isWhite, std::vector<Move>& legalMoves) {
    legalMoves.clear();
    generateCaptures(bb, isWhite, legalMoves);
    if (legalMoves.empty()) {
        generateQuietMoves(bb, isWhite, legalMoves);
    }
}

void Engine::generateCaptures(const Bitboards& bb, bool isWhite, std::vector<Move>& captures) {
    captures.clear();
    int maxCaptureCount = 0;
    std::vector<Move> allCaptures;

    uint64_t friendlyMen   = isWhite ? bb.whiteMen   : bb.blackMen;
    uint64_t friendlyKings = isWhite ? bb.whiteKings : bb.blackKings;
    uint64_t enemyMen      = isWhite ? bb.blackMen   : bb.whiteMen;
    uint64_t enemyKings    = isWhite ? bb.blackKings : bb.whiteKings;

    // 1. Man Captures (Recursive chain finder)
    uint64_t men = friendlyMen;
    while (men) {
        int sq = bitScanForward(men);
        Move m;
        m.from = sq;
        m.isKing = false;
        m.path[0] = sq;
        m.pathLen = 1;
        findManCaptures(sq, friendlyMen, friendlyKings, enemyMen, enemyKings,
                        isWhite, m, allCaptures, maxCaptureCount);
        men &= (men - 1);
    }

    // 2. Flying King Captures
    uint64_t kings = friendlyKings;
    while (kings) {
        int sq = bitScanForward(kings);
        Move m;
        m.from = sq;
        m.isKing = true;
        m.path[0] = sq;
        m.pathLen = 1;
        findKingCaptures(sq, friendlyMen, friendlyKings, enemyMen, enemyKings,
                         isWhite, m, allCaptures, maxCaptureCount);
        kings &= (kings - 1);
    }

    // Moroccan Majority Rule: Retain only captures of maximum length
    if (maxCaptureCount > 0) {
        for (const auto& c : allCaptures) {
            if (c.captureCount == maxCaptureCount) {
                captures.push_back(c);
            }
        }
    }
}

void Engine::findManCaptures(uint64_t currentSq, uint64_t menBB, uint64_t kingsBB,
                             uint64_t enemyMenBB, uint64_t enemyKingsBB,
                             bool isWhite, Move currentMove,
                             std::vector<Move>& allCaptures, int& maxCaptureCount) {
    int r = getRow(currentSq);
    int c = getCol(currentSq);
    bool hasBranch = false;

    // Men forward jumps: White jumps towards r-2, Black jumps towards r+2
    int forwardDr = isWhite ? -1 : 1;
    int targetRow = r + 2 * forwardDr;

    if (targetRow >= 0 && targetRow < 8) {
        int colOffsets[2] = { -1, 1 };
        for (int dc : colOffsets) {
            int overR = r + forwardDr;
            int overC = c + dc;
            int landR = targetRow;
            int landC = c + 2 * dc;

            if (isValidSquare(landR, landC) && isDarkSquare(landR, landC)) {
                int overSq = getSq(overR, overC);
                int landSq = getSq(landR, landC);
                uint64_t overMask = (1ULL << overSq);
                uint64_t landMask = (1ULL << landSq);

                // Must jump over an enemy piece not already captured
                bool isEnemyMan  = (enemyMenBB   & overMask) != 0;
                bool isEnemyKing = (enemyKingsBB & overMask) != 0;
                uint64_t alreadyCaptured = currentMove.capturedMenMask | currentMove.capturedKingsMask;

                if ((isEnemyMan || isEnemyKing) && !(alreadyCaptured & overMask)) {
                    // Landing square must be empty
                    uint64_t occupied = (menBB | kingsBB | enemyMenBB | enemyKingsBB) & ~alreadyCaptured;
                    occupied &= ~(1ULL << currentMove.from); // Original square is empty during chain

                    if (!(occupied & landMask)) {
                        hasBranch = true;
                        Move nextMove = currentMove;
                        nextMove.to = landSq;
                        nextMove.captureCount++;
                        if (nextMove.pathLen < 15) {
                            nextMove.path[nextMove.pathLen++] = landSq;
                        }

                        if (isEnemyMan) {
                            nextMove.capturedMenMask |= overMask;
                        } else {
                            nextMove.capturedKingsMask |= overMask;
                        }

                        // Check promotion on landing
                        bool reachesPromotion = (isWhite && landR == 0) || (!isWhite && landR == 7);
                        if (reachesPromotion) {
                            // In Moroccan Dama, promotion ends the turn immediately
                            nextMove.isPromotion = true;
                            if (nextMove.captureCount > maxCaptureCount) {
                                maxCaptureCount = nextMove.captureCount;
                            }
                            allCaptures.push_back(nextMove);
                        } else {
                            // Continue multi-jump search
                            findManCaptures(landSq, menBB, kingsBB, enemyMenBB, enemyKingsBB,
                                            isWhite, nextMove, allCaptures, maxCaptureCount);
                        }
                    }
                }
            }
        }
    }

    // If no further jump and at least one capture was made, record final move
    if (!hasBranch && currentMove.captureCount > 0) {
        if (currentMove.captureCount > maxCaptureCount) {
            maxCaptureCount = currentMove.captureCount;
        }
        allCaptures.push_back(currentMove);
    }
}

void Engine::findKingCaptures(uint64_t currentSq, uint64_t menBB, uint64_t kingsBB,
                              uint64_t enemyMenBB, uint64_t enemyKingsBB,
                              bool isWhite, Move currentMove,
                              std::vector<Move>& allCaptures, int& maxCaptureCount) {
    int r = getRow(currentSq);
    int c = getCol(currentSq);
    bool hasBranch = false;

    uint64_t alreadyCaptured = currentMove.capturedMenMask | currentMove.capturedKingsMask;
    uint64_t friendlyPieces = (menBB | kingsBB) & ~(1ULL << currentMove.from);
    uint64_t enemyPieces    = (enemyMenBB | enemyKingsBB) & ~alreadyCaptured;

    // Check all 4 diagonal rays for Flying King captures
    for (int d = 0; d < 4; ++d) {
        int dr = DIR_DR[d];
        int dc = DIR_DC[d];

        int curR = r + dr;
        int curC = c + dc;
        int enemySq = -1;
        bool isEnemyMan = false;
        bool isEnemyKing = false;

        // Slide until first piece encountered
        while (isValidSquare(curR, curC)) {
            int sq = getSq(curR, curC);
            uint64_t mask = (1ULL << sq);

            if (friendlyPieces & mask) {
                // Blocked by friendly piece
                break;
            }
            if (enemyPieces & mask) {
                // Found first enemy piece along ray
                enemySq = sq;
                isEnemyMan  = (enemyMenBB   & mask) != 0;
                isEnemyKing = (enemyKingsBB & mask) != 0;
                break;
            }
            curR += dr;
            curC += dc;
        }

        // If enemy piece found, king can jump and land on any empty square behind it
        if (enemySq != -1) {
            int landR = getRow(enemySq) + dr;
            int landC = getCol(enemySq) + dc;

            while (isValidSquare(landR, landC)) {
                int landSq = getSq(landR, landC);
                uint64_t landMask = (1ULL << landSq);

                // Stop if blocked by any piece behind the captured piece
                if ((friendlyPieces | enemyPieces) & landMask) {
                    break;
                }

                hasBranch = true;
                Move nextMove = currentMove;
                nextMove.to = landSq;
                nextMove.captureCount++;
                if (nextMove.pathLen < 15) {
                    nextMove.path[nextMove.pathLen++] = landSq;
                }

                uint64_t enemyMask = (1ULL << enemySq);
                if (isEnemyMan)  nextMove.capturedMenMask   |= enemyMask;
                if (isEnemyKing) nextMove.capturedKingsMask |= enemyMask;

                // Continue recursive search for multi-jump
                findKingCaptures(landSq, menBB, kingsBB, enemyMenBB, enemyKingsBB,
                                 isWhite, nextMove, allCaptures, maxCaptureCount);

                landR += dr;
                landC += dc;
            }
        }
    }

    if (!hasBranch && currentMove.captureCount > 0) {
        if (currentMove.captureCount > maxCaptureCount) {
            maxCaptureCount = currentMove.captureCount;
        }
        allCaptures.push_back(currentMove);
    }
}

void Engine::generateQuietMoves(const Bitboards& bb, bool isWhite, std::vector<Move>& quietMoves) {
    uint64_t occupied = bb.allPieces();
    uint64_t friendlyMen   = isWhite ? bb.whiteMen   : bb.blackMen;
    uint64_t friendlyKings = isWhite ? bb.whiteKings : bb.blackKings;

    // 1. Men Quiet Moves (1 step diagonally forward)
    int forwardDr = isWhite ? -1 : 1;
    uint64_t men = friendlyMen;
    while (men) {
        int sq = bitScanForward(men);
        int r = getRow(sq);
        int c = getCol(sq);
        int targetR = r + forwardDr;

        if (targetR >= 0 && targetR < 8) {
            int colOffsets[2] = { -1, 1 };
            for (int dc : colOffsets) {
                int targetC = c + dc;
                if (isValidSquare(targetR, targetC) && isDarkSquare(targetR, targetC)) {
                    int toSq = getSq(targetR, targetC);
                    if (!(occupied & (1ULL << toSq))) {
                        Move m;
                        m.from = sq;
                        m.to = toSq;
                        m.isKing = false;
                        m.captureCount = 0;
                        m.path[0] = sq;
                        m.path[1] = toSq;
                        m.pathLen = 2;
                        m.isPromotion = (isWhite && targetR == 0) || (!isWhite && targetR == 7);
                        quietMoves.push_back(m);
                    }
                }
            }
        }
        men &= (men - 1);
    }

    // 2. Flying King Quiet Moves (any distance in 4 diagonals)
    uint64_t kings = friendlyKings;
    while (kings) {
        int sq = bitScanForward(kings);
        int r = getRow(sq);
        int c = getCol(sq);

        for (int d = 0; d < 4; ++d) {
            int dr = DIR_DR[d];
            int dc = DIR_DC[d];
            int curR = r + dr;
            int curC = c + dc;

            while (isValidSquare(curR, curC)) {
                int toSq = getSq(curR, curC);
                if (occupied & (1ULL << toSq)) {
                    break; // Blocked by piece
                }

                Move m;
                m.from = sq;
                m.to = toSq;
                m.isKing = true;
                m.captureCount = 0;
                m.isPromotion = false;
                m.path[0] = sq;
                m.path[1] = toSq;
                m.pathLen = 2;
                quietMoves.push_back(m);

                curR += dr;
                curC += dc;
            }
        }
        kings &= (kings - 1);
    }
}

// -------------------------------------------------------------
// Evaluation Function
// -------------------------------------------------------------
int Engine::evaluate(const Bitboards& bb, bool isWhite) {
    if (isEndgame(bb)) {
        return evaluateEndgame(bb, isWhite);
    }

    int whiteScore = 0;
    int blackScore = 0;

    // Material values: Men = 100, Flying Kings = 300
    int wmCount = popcount(bb.whiteMen);
    int wkCount = popcount(bb.whiteKings);
    int bmCount = popcount(bb.blackMen);
    int bkCount = popcount(bb.blackKings);

    whiteScore += wmCount * 100 + wkCount * 300;
    blackScore += bmCount * 100 + bkCount * 300;

    // Piece Square Table (PST) bonus
    uint64_t wm = bb.whiteMen;
    while (wm) {
        int sq = bitScanForward(wm);
        whiteScore += whiteMenPST[sq];
        wm &= (wm - 1);
    }

    uint64_t wk = bb.whiteKings;
    while (wk) {
        int sq = bitScanForward(wk);
        whiteScore += kingPST[sq];
        wk &= (wk - 1);
    }

    uint64_t bm = bb.blackMen;
    while (bm) {
        int sq = bitScanForward(bm);
        blackScore += blackMenPST[sq];
        bm &= (bm - 1);
    }

    uint64_t bk = bb.blackKings;
    while (bk) {
        int sq = bitScanForward(bk);
        blackScore += kingPST[sq];
        bk &= (bk - 1);
    }

    // Back-Rank Defense Bonus (+20 for maintaining pieces on back rank)
    int whiteBackRank = popcount(bb.whiteMen & BACK_RANK_WHITE_MASK);
    int blackBackRank = popcount(bb.blackMen & BACK_RANK_BLACK_MASK);
    whiteScore += whiteBackRank * 15;
    blackScore += blackBackRank * 15;

    // Center Control
    int whiteCenter = popcount((bb.whiteMen | bb.whiteKings) & CENTER_SQUARES_MASK);
    int blackCenter = popcount((bb.blackMen | bb.blackKings) & CENTER_SQUARES_MASK);
    whiteScore += whiteCenter * 10;
    blackScore += blackCenter * 10;

    int evalScore = whiteScore - blackScore;
    return isWhite ? evalScore : -evalScore;
}

bool Engine::isEndgame(const Bitboards& bb) const {
    int totalPieces = popcount(bb.allPieces());
    return totalPieces <= 6;
}

int Engine::evaluateEndgame(const Bitboards& bb, bool isWhite) const {
    int wm = popcount(bb.whiteMen);
    int wk = popcount(bb.whiteKings);
    int bm = popcount(bb.blackMen);
    int bk = popcount(bb.blackKings);

    int whiteTotal = wm + wk;
    int blackTotal = bm + bk;

    if (whiteTotal == 0) return isWhite ? -MATE_SCORE : MATE_SCORE;
    if (blackTotal == 0) return isWhite ? MATE_SCORE : -MATE_SCORE;

    int whiteScore = wm * 100 + wk * 350;
    int blackScore = bm * 100 + bk * 350;

    // King vs King trapped on edge bonus (+500)
    if (wk >= 1 && bk >= 1) {
        uint64_t bkBits = bb.blackKings;
        while (bkBits) {
            int sq = bitScanForward(bkBits);
            int r = getRow(sq);
            int c = getCol(sq);
            if (r == 0 || r == 7 || c == 0 || c == 7) {
                whiteScore += 150; // Trapped on edge
            }
            bkBits &= (bkBits - 1);
        }
        uint64_t wkBits = bb.whiteKings;
        while (wkBits) {
            int sq = bitScanForward(wkBits);
            int r = getRow(sq);
            int c = getCol(sq);
            if (r == 0 || r == 7 || c == 0 || c == 7) {
                blackScore += 150;
            }
            wkBits &= (wkBits - 1);
        }
    }

    // King + Man vs King: Escort to promotion bonus (+300)
    if (wk >= 1 && wm >= 1 && bk == 1 && bm == 0) {
        whiteScore += 300;
    }
    if (bk >= 1 && bm >= 1 && wk == 1 && wm == 0) {
        blackScore += 300;
    }

    // Opposition bonus for advanced men
    if (wm > 0) {
        uint64_t w = bb.whiteMen;
        while (w) {
            int sq = bitScanForward(w);
            whiteScore += (7 - getRow(sq)) * 20;
            w &= (w - 1);
        }
    }
    if (bm > 0) {
        uint64_t b = bb.blackMen;
        while (b) {
            int sq = bitScanForward(b);
            blackScore += getRow(sq) * 20;
            b &= (b - 1);
        }
    }

    int score = whiteScore - blackScore;
    return isWhite ? score : -score;
}

// -------------------------------------------------------------
// Move Ordering
// -------------------------------------------------------------
void Engine::scoreAndSortMoves(std::vector<Move>& moves, const Move& ttMove, int ply) {
    std::vector<std::pair<int, Move>> scoredMoves;
    scoredMoves.reserve(moves.size());

    for (const auto& m : moves) {
        int score = 0;

        // 1. Transposition table best move (Highest priority)
        if (ttMove.isValid() && m.from == ttMove.from && m.to == ttMove.to) {
            score = 1000000;
        }
        // 2. Captures: Moroccan majority capture rule, high capture count first
        else if (m.isCapture()) {
            score = 100000 + m.captureCount * 10000;
            if (m.capturedKingsMask) score += 5000; // Capturing king bonus
            if (m.isPromotion) score += 3000;
        }
        // 3. Promotions
        else if (m.isPromotion) {
            score = 80000;
        }
        // 4. Killer moves
        else if (ply < MAX_PLY && (
                 (killerMoves[ply][0].from == m.from && killerMoves[ply][0].to == m.to) ||
                 (killerMoves[ply][1].from == m.from && killerMoves[ply][1].to == m.to))) {
            score = 50000;
        }
        // 5. History heuristic
        else {
            score = historyTable[m.from][m.to];
        }

        scoredMoves.push_back({ score, m });
    }

    std::sort(scoredMoves.begin(), scoredMoves.end(),
              [](const std::pair<int, Move>& a, const std::pair<int, Move>& b) {
                  return a.first > b.first;
              });

    for (size_t i = 0; i < moves.size(); ++i) {
        moves[i] = scoredMoves[i].second;
    }
}

// -------------------------------------------------------------
// Quiescence Search (Captures only to avoid Horizon Effect)
// -------------------------------------------------------------
int Engine::quiescence(Bitboards& bb, int alpha, int beta, bool isWhite, int ply) {
    nodesEvaluated++;

    // Check time limit every 2048 nodes
    if ((nodesEvaluated & 2047) == 0) {
        auto now = std::chrono::steady_clock::now();
        double elapsed = std::chrono::duration<double, std::milli>(now - searchStartTime).count();
        if (elapsed >= searchTimeLimitMs) {
            stopSearch = true;
            return alpha;
        }
    }

    if (ply >= MAX_PLY - 1) {
        return evaluate(bb, isWhite);
    }

    std::vector<Move> captures;
    generateCaptures(bb, isWhite, captures);

    // If position is quiet (no mandatory captures), evaluate static score
    if (captures.empty()) {
        int standPat = evaluate(bb, isWhite);
        if (standPat >= beta) return beta;
        if (standPat > alpha) alpha = standPat;
        return alpha;
    }

    // Search all mandatory capture chains
    scoreAndSortMoves(captures, Move(), ply);

    for (const auto& m : captures) {
        makeMove(bb, m, isWhite);
        int score = -quiescence(bb, -beta, -alpha, !isWhite, ply + 1);
        undoMove(bb, m, isWhite);

        if (stopSearch) return alpha;
        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
    }

    return alpha;
}

// -------------------------------------------------------------
// Negamax Search with PVS, LMR, Null-Move, and TT
// -------------------------------------------------------------
int Engine::negamax(Bitboards& bb, int depth, int alpha, int beta, bool isWhite, int ply, bool allowNull) {
    if (stopSearch) return alpha;

    nodesEvaluated++;
    if ((nodesEvaluated & 2047) == 0) {
        auto now = std::chrono::steady_clock::now();
        double elapsed = std::chrono::duration<double, std::milli>(now - searchStartTime).count();
        if (elapsed >= searchTimeLimitMs) {
            stopSearch = true;
            return alpha;
        }
    }

    // Depth 0: enter Quiescence search
    if (depth <= 0) {
        return quiescence(bb, alpha, beta, isWhite, ply);
    }

    if (ply >= MAX_PLY - 1) {
        return evaluate(bb, isWhite);
    }

    uint64_t hash = computeHash(bb, isWhite);
    TTEntry& ttEntry = transpositionTable[hash & (TT_SIZE - 1)];
    Move ttMove;

    if (ttEntry.key == hash && ttEntry.depth >= depth) {
        ttMove = ttEntry.bestMove;
        if (ttEntry.flag == TT_EXACT) {
            return ttEntry.score;
        } else if (ttEntry.flag == TT_LOWERBOUND && ttEntry.score >= beta) {
            return ttEntry.score;
        } else if (ttEntry.flag == TT_UPPERBOUND && ttEntry.score <= alpha) {
            return ttEntry.score;
        }
    }

    std::vector<Move> legalMoves;
    generateLegalMoves(bb, isWhite, legalMoves);

    // Terminal position: No legal moves -> Loss
    if (legalMoves.empty()) {
        return -MATE_SCORE + ply;
    }

    bool inCapture = legalMoves[0].isCapture();

    // 1. Null Move Pruning (R = 2)
    if (allowNull && !inCapture && depth >= 3 && !isEndgame(bb)) {
        int nullScore = -negamax(bb, depth - 1 - 2, -beta, -beta + 1, !isWhite, ply + 1, false);
        if (nullScore >= beta) {
            return beta;
        }
    }

    scoreAndSortMoves(legalMoves, ttMove, ply);

    Move bestMove;
    int bestScore = -INF;
    int origAlpha = alpha;

    // Principal Variation Search (PVS) loop
    for (size_t i = 0; i < legalMoves.size(); ++i) {
        const auto& m = legalMoves[i];
        makeMove(bb, m, isWhite);

        int score = 0;
        if (i == 0) {
            // First move: Full window search
            score = -negamax(bb, depth - 1, -beta, -alpha, !isWhite, ply + 1, true);
        } else {
            // Late Move Reductions (LMR) for quiet moves after the 4th move
            int reduction = 0;
            if (i >= 4 && depth >= 3 && !m.isCapture() && !m.isPromotion) {
                reduction = 1;
                if (i >= 8 && depth >= 5) reduction = 2;
            }

            // Zero-window search
            score = -negamax(bb, depth - 1 - reduction, -alpha - 1, -alpha, !isWhite, ply + 1, true);

            // Re-search at full depth if LMR fails high
            if (score > alpha && (reduction > 0 || score < beta)) {
                score = -negamax(bb, depth - 1, -beta, -alpha, !isWhite, ply + 1, true);
            }
        }

        undoMove(bb, m, isWhite);

        if (stopSearch) {
            return alpha;
        }

        if (score > bestScore) {
            bestScore = score;
            bestMove = m;
        }

        if (score > alpha) {
            alpha = score;
        }

        // Beta Cutoff
        if (alpha >= beta) {
            // Update Killer Moves and History Heuristic
            if (!m.isCapture() && ply < MAX_PLY) {
                if (killerMoves[ply][0].from != m.from || killerMoves[ply][0].to != m.to) {
                    killerMoves[ply][1] = killerMoves[ply][0];
                    killerMoves[ply][0] = m;
                }
                historyTable[m.from][m.to] += depth * depth;
            }
            break;
        }
    }

    // Store evaluation in Transposition Table
    ttEntry.key = hash;
    ttEntry.score = bestScore;
    ttEntry.depth = depth;
    ttEntry.bestMove = bestMove;

    if (bestScore <= origAlpha) {
        ttEntry.flag = TT_UPPERBOUND;
    } else if (bestScore >= beta) {
        ttEntry.flag = TT_LOWERBOUND;
    } else {
        ttEntry.flag = TT_EXACT;
    }

    return bestScore;
}

// -------------------------------------------------------------
// Iterative Deepening Search Entry Point
// -------------------------------------------------------------
EngineResult Engine::searchPosition(Bitboards bb, bool isWhite, int timeLimitMs, int maxDepth) {
    searchTimeLimitMs = timeLimitMs;
    searchStartTime = std::chrono::steady_clock::now();
    nodesEvaluated = 0;
    stopSearch = false;

    EngineResult result;
    result.score = 0;
    result.depthReached = 0;
    result.nodesSearched = 0;
    result.isBookMove = false;
    result.isEndgameSolver = isEndgame(bb);

    std::vector<Move> rootMoves;
    generateLegalMoves(bb, isWhite, rootMoves);

    if (rootMoves.empty()) {
        result.score = -MATE_SCORE;
        return result;
    }

    // Only 1 legal move (e.g. single mandatory capture)
    if (rootMoves.size() == 1) {
        result.bestMove = rootMoves[0];
        result.depthReached = 1;
        result.nodesSearched = 1;
        result.timeMs = 1.0;
        return result;
    }

    Move globalBestMove = rootMoves[0];
    int globalBestScore = -INF;

    // Iterative Deepening loop from depth 1 to maxDepth (target 12)
    for (int curDepth = 1; curDepth <= maxDepth; ++curDepth) {
        int alpha = -INF;
        int beta = INF;

        // Aspiration Windows for depth >= 5
        if (curDepth >= 5 && std::abs(globalBestScore) < 50000) {
            alpha = globalBestScore - 50;
            beta  = globalBestScore + 50;
        }

        int score = negamax(bb, curDepth, alpha, beta, isWhite, 0, false);

        // Aspiration window fail-low / fail-high fallback to full window
        if (!stopSearch && curDepth >= 5 && (score <= alpha || score >= beta)) {
            score = negamax(bb, curDepth, -INF, INF, isWhite, 0, false);
        }

        if (stopSearch && curDepth > 1) {
            break;
        }

        uint64_t hash = computeHash(bb, isWhite);
        const TTEntry& ttEntry = transpositionTable[hash & (TT_SIZE - 1)];
        if (ttEntry.key == hash && ttEntry.bestMove.isValid()) {
            globalBestMove = ttEntry.bestMove;
            globalBestScore = score;
        }

        result.depthReached = curDepth;
        result.bestMove = globalBestMove;
        result.score = globalBestScore;

        auto now = std::chrono::steady_clock::now();
        double elapsed = std::chrono::duration<double, std::milli>(now - searchStartTime).count();
        if (elapsed >= searchTimeLimitMs) {
            break;
        }
    }

    auto endTime = std::chrono::steady_clock::now();
    result.timeMs = std::chrono::duration<double, std::milli>(endTime - searchStartTime).count();
    result.nodesSearched = nodesEvaluated;

    return result;
}

EngineResult Engine::getBestMove(const int board[64], int turn, int timeLimitMs, int maxDepth) {
    Bitboards bb = toBitboard(board);
    bool isWhite = (turn == 1);
    return searchPosition(bb, isWhite, timeLimitMs, maxDepth);
}

} // namespace Dama

// -------------------------------------------------------------
// Global Instance & C-API Export
// -------------------------------------------------------------
static Dama::Engine* g_engine = nullptr;

extern "C" {

void dama_init() {
    if (!g_engine) {
        g_engine = new Dama::Engine();
    }
}

void dama_reset() {
    if (g_engine) {
        g_engine->reset();
    }
}

int dama_get_best_move(const int board[64], int turn, int timeLimitMs, int maxDepth, int outMove[5]) {
    dama_init();
    Dama::EngineResult res = g_engine->getBestMove(board, turn, timeLimitMs, maxDepth);
    outMove[0] = res.fromRow();
    outMove[1] = res.fromCol();
    outMove[2] = res.toRow();
    outMove[3] = res.toCol();
    outMove[4] = res.bestMove.captureCount;
    return res.score;
}

#ifdef __ANDROID__

// JNI Bridge for package com.dama.Engine
JNIEXPORT jintArray JNICALL
Java_com_dama_Engine_getBestMove(JNIEnv *env, jobject thiz, jintArray boardArray) {
    dama_init();

    jsize len = env->GetArrayLength(boardArray);
    if (len < 64) return nullptr;

    jint* rawBoard = env->GetIntArrayElements(boardArray, nullptr);
    int board[64];
    for (int i = 0; i < 64; ++i) {
        board[i] = rawBoard[i];
    }
    env->ReleaseIntArrayElements(boardArray, rawBoard, JNI_ABORT);

    // Default to turn = 1 (White) or calculate based on piece count
    int outMove[5] = { -1, -1, -1, -1, 0 };
    dama_get_best_move(board, 1, 800, 12, outMove);

    jintArray result = env->NewIntArray(5);
    env->SetIntArrayRegion(result, 0, 5, outMove);
    return result;
}

// JNI Bridge with turn and timeLimitMs parameters
JNIEXPORT jintArray JNICALL
Java_com_dama_Engine_getBestMoveTimed(JNIEnv *env, jobject thiz, jintArray boardArray, jint turn, jint timeLimitMs) {
    dama_init();

    jsize len = env->GetArrayLength(boardArray);
    if (len < 64) return nullptr;

    jint* rawBoard = env->GetIntArrayElements(boardArray, nullptr);
    int board[64];
    for (int i = 0; i < 64; ++i) {
        board[i] = rawBoard[i];
    }
    env->ReleaseIntArrayElements(boardArray, rawBoard, JNI_ABORT);

    int outMove[5] = { -1, -1, -1, -1, 0 };
    dama_get_best_move(board, turn, timeLimitMs, 12, outMove);

    jintArray result = env->NewIntArray(5);
    env->SetIntArrayRegion(result, 0, 5, outMove);
    return result;
}

// JNI Bridge for capacitor package com.damamaster.app.Engine
JNIEXPORT jintArray JNICALL
Java_com_damamaster_app_Engine_getBestMove(JNIEnv *env, jobject thiz, jintArray boardArray) {
    return Java_com_dama_Engine_getBestMove(env, thiz, boardArray);
}

JNIEXPORT jintArray JNICALL
Java_com_damamaster_app_Engine_getBestMoveTimed(JNIEnv *env, jobject thiz, jintArray boardArray, jint turn, jint timeLimitMs) {
    return Java_com_dama_Engine_getBestMoveTimed(env, thiz, boardArray, turn, timeLimitMs);
}

#endif // __ANDROID__

} // extern "C"
