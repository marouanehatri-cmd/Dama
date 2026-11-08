package com.dama;

/**
 * JNI Bridge to high-performance C++ Moroccan Dama Bitboard Engine.
 * Supports board[64] format with 64-bit bitboards, PVS, LMR, Zobrist TT,
 * and sub-second depth 12 calculations on mobile.
 */
public class Engine {

    static {
        try {
            System.loadLibrary("dama_engine");
        } catch (UnsatisfiedLinkError e) {
            System.err.println("Native code library failed to load: " + e);
        }
    }

    public static final int EMPTY = 0;
    public static final int WHITE_MAN = 1;
    public static final int WHITE_KING = 2;
    public static final int BLACK_MAN = 3;
    public static final int BLACK_KING = 4;

    public static class BestMove {
        public int fromRow;
        public int fromCol;
        public int toRow;
        public int toCol;
        public int captureCount;

        public BestMove(int fromRow, int fromCol, int toRow, int toCol, int captureCount) {
            this.fromRow = fromRow;
            this.fromCol = fromCol;
            this.toRow = toRow;
            this.toCol = toCol;
            this.captureCount = captureCount;
        }

        public String toNotation() {
            char fromFile = (char) ('a' + fromCol);
            int fromRank = 8 - fromRow;
            char toFile = (char) ('a' + toCol);
            int toRank = 8 - toRow;
            return "" + fromFile + fromRank + (captureCount > 0 ? "x" : "-") + toFile + toRank;
        }

        @Override
        public String toString() {
            return "BestMove[" + toNotation() + ", captures=" + captureCount + "]";
        }
    }

    public native int[] getBestMove(int[] board);
    public native int[] getBestMoveTimed(int[] board, int turn, int timeLimitMs);

    public BestMove calculateBestMove(int[] board, int turn, int timeLimitMs) {
        if (board == null || board.length != 64) {
            throw new IllegalArgumentException("Board must be an array of exactly 64 integers.");
        }
        int[] raw = getBestMoveTimed(board, turn, timeLimitMs);
        if (raw == null || raw.length < 4 || raw[0] == -1) {
            return null;
        }
        int captures = raw.length > 4 ? raw[4] : 0;
        return new BestMove(raw[0], raw[1], raw[2], raw[3], captures);
    }
}
