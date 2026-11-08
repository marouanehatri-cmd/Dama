/**
 * Dama Master - Moroccan Dama C++ Bitboard Engine
 * Stockfish-style high performance engine with 64-bit Bitboards,
 * PVS, LMR, Null-Move Pruning, Quiescence Search, Zobrist TT,
 * and JNI / WASM / C++ bridges.
 */

#ifndef DAMA_ENGINE_H
#define DAMA_ENGINE_H

#include <cstdint>
#include <vector>
#include <chrono>
#include <cstring>
#include <string>
#include <algorithm>

#ifdef __ANDROID__
#include <jni.h>
#endif

namespace Dama {

// Square indices 0..63: row * 8 + col, where row 0 is top
constexpr int BOARD_SIZE = 64;
constexpr int MAX_PLY = 64;
constexpr int TT_SIZE = 1048576; // 1M entries (~32MB)
constexpr int INF = 300000;
constexpr int MATE_SCORE = 100000;

// Piece definitions
enum PieceType : int {
    EMPTY = 0,
    WHITE_MAN = 1,
    WHITE_KING = 2,
    BLACK_MAN = 3,
    BLACK_KING = 4
};

// Transposition table entry flags
enum TTFlag : uint8_t {
    TT_EXACT = 0,
    TT_LOWERBOUND = 1,
    TT_UPPERBOUND = 2
};

// 64-bit Bitboard structure
struct Bitboards {
    uint64_t whiteMen;
    uint64_t whiteKings;
    uint64_t blackMen;
    uint64_t blackKings;

    Bitboards() : whiteMen(0), whiteKings(0), blackMen(0), blackKings(0) {}
    Bitboards(uint64_t wm, uint64_t wk, uint64_t bm, uint64_t bk)
        : whiteMen(wm), whiteKings(wk), blackMen(bm), blackKings(bk) {}

    inline uint64_t whitePieces() const { return whiteMen | whiteKings; }
    inline uint64_t blackPieces() const { return blackMen | blackKings; }
    inline uint64_t allPieces() const { return whiteMen | whiteKings | blackMen | blackKings; }
    inline uint64_t emptySquares() const { return ~allPieces(); }
};

// Move representation
struct Move {
    int8_t from;
    int8_t to;
    int8_t captureCount;
    bool isPromotion;
    bool isKing;
    uint64_t capturedMenMask;
    uint64_t capturedKingsMask;
    int8_t path[16];
    int8_t pathLen;

    Move() : from(-1), to(-1), captureCount(0), isPromotion(false), isKing(false),
             capturedMenMask(0), capturedKingsMask(0), pathLen(0) {
        std::memset(path, -1, sizeof(path));
    }

    inline bool isValid() const { return from >= 0 && to >= 0; }
    inline bool isCapture() const { return captureCount > 0; }
};

// Transposition Table Entry
struct TTEntry {
    uint64_t key;
    int32_t score;
    int8_t depth;
    uint8_t flag;
    Move bestMove;
};

// Public Engine Output Details
struct EngineResult {
    Move bestMove;
    int score;
    int depthReached;
    uint64_t nodesSearched;
    double timeMs;
    bool isBookMove;
    bool isEndgameSolver;

    int fromRow() const { return bestMove.from / 8; }
    int fromCol() const { return bestMove.from % 8; }
    int toRow() const { return bestMove.to / 8; }
    int toCol() const { return bestMove.to % 8; }
};

// Core Engine Class
class Engine {
public:
    Engine();
    ~Engine();

    // Reset transposition table and search heuristics
    void reset();

    // Convert UI board[64] to internal Bitboards
    static Bitboards toBitboard(const int board[64]);

    // Convert Bitboards to UI board[64]
    static void fromBitboard(const Bitboards& bb, int outBoard[64]);

    // Parse best move to UI coordinate and captured pieces list
    static void fromBitboardToMove(const Move& move,
                                  int& fromRow, int& fromCol,
                                  int& toRow, int& toCol,
                                  std::vector<int>& capturedIndices);

    // Primary entry point: calculate best move from board[64]
    EngineResult getBestMove(const int board[64], int turn = 1, int timeLimitMs = 800, int maxDepth = 12);

    // Direct bitboard search entry point
    EngineResult searchPosition(Bitboards bb, bool isWhite, int timeLimitMs = 800, int maxDepth = 12);

    // Move generation
    void generateLegalMoves(const Bitboards& bb, bool isWhite, std::vector<Move>& legalMoves);

    // Make and Undo move using XOR operations only
    void makeMove(Bitboards& bb, const Move& m, bool isWhite);
    void undoMove(Bitboards& bb, const Move& m, bool isWhite);

    // Fast static evaluation
    int evaluate(const Bitboards& bb, bool isWhite);

private:
    // Zobrist Hashing tables
    uint64_t zobristTable[64][5];
    uint64_t zobristSide;

    // Transposition Table
    TTEntry* transpositionTable;

    // Search heuristics
    Move killerMoves[MAX_PLY][2];
    int historyTable[64][64];

    // Search state
    uint64_t nodesEvaluated;
    std::chrono::time_point<std::chrono::steady_clock> searchStartTime;
    int searchTimeLimitMs;
    bool stopSearch;

    // Piece-Square Tables (PST)
    int whiteMenPST[64];
    int blackMenPST[64];
    int kingPST[64];

    // Initialization helpers
    void initZobrist();
    void initPST();

    // Zobrist key computation
    uint64_t computeHash(const Bitboards& bb, bool isWhite) const;

    // Search methods
    int negamax(Bitboards& bb, int depth, int alpha, int beta, bool isWhite, int ply, bool allowNull = true);
    int quiescence(Bitboards& bb, int alpha, int beta, bool isWhite, int ply);

    // Move ordering
    void scoreAndSortMoves(std::vector<Move>& moves, const Move& ttMove, int ply);

    // Move generation helpers
    void generateCaptures(const Bitboards& bb, bool isWhite, std::vector<Move>& captures);
    void generateQuietMoves(const Bitboards& bb, bool isWhite, std::vector<Move>& quietMoves);

    // Man capture recursion
    void findManCaptures(uint64_t currentSq, uint64_t menBB, uint64_t kingsBB,
                         uint64_t enemyMenBB, uint64_t enemyKingsBB,
                         bool isWhite, Move currentMove,
                         std::vector<Move>& allCaptures, int& maxCaptureCount);

    // Flying King capture recursion
    void findKingCaptures(uint64_t currentSq, uint64_t menBB, uint64_t kingsBB,
                          uint64_t enemyMenBB, uint64_t enemyKingsBB,
                          bool isWhite, Move currentMove,
                          std::vector<Move>& allCaptures, int& maxCaptureCount);

    // Endgame specialized evaluation
    bool isEndgame(const Bitboards& bb) const;
    int evaluateEndgame(const Bitboards& bb, bool isWhite) const;
};

} // namespace Dama

// C API bindings
extern "C" {
    void dama_init();
    void dama_reset();
    int dama_get_best_move(const int board[64], int turn, int timeLimitMs, int maxDepth, int outMove[5]);
}

#endif // DAMA_ENGINE_H
