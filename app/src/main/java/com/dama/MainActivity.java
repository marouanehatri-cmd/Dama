package com.dama;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.widget.TextView;

/**
 * Example Android Activity demonstrating asynchronous C++ Bitboard Engine calls.
 * Runs engine computation on a background worker thread to guarantee 0 UI lag.
 */
public class MainActivity extends Activity {

    private static final String TAG = "DamaMainActivity";
    private Engine engine;
    private TextView statusTextView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        statusTextView = new TextView(this);
        statusTextView.setText("Dama Master C++ Engine Initializing...\n");
        statusTextView.setTextSize(16);
        statusTextView.setPadding(32, 48, 32, 48);
        setContentView(statusTextView);

        engine = new Engine();

        // Run engine search in background thread to prevent UI frame drops
        new Thread(new Runnable() {
            @Override
            public void run() {
                // Initialize standard Moroccan 8x8 Dama board
                int[] board = createStandardBoard();

                long startTime = System.currentTimeMillis();
                // Query C++ Bitboard engine (target Depth 12 in <800ms)
                Engine.BestMove bestMove = engine.calculateBestMove(board, 1, 800);
                long elapsed = System.currentTimeMillis() - startTime;

                final String resultText = (bestMove != null)
                    ? "Grandmaster Best Move: " + bestMove.toNotation() + "\n"
                      + "From: (" + bestMove.fromRow + ", " + bestMove.fromCol + ")\n"
                      + "To: (" + bestMove.toRow + ", " + bestMove.toCol + ")\n"
                      + "Captures: " + bestMove.captureCount + "\n"
                      + "Time elapsed: " + elapsed + " ms\n"
                      + "Status: Unbeatable C++ Bitboard Engine Active!"
                    : "No legal moves found.";

                Log.i(TAG, resultText);

                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        statusTextView.setText(resultText);
                    }
                });
            }
        }).start();
    }

    /**
     * Create 64-element Moroccan Dama starting board:
     * 12 Black pieces (rows 0, 1, 2 on dark squares: value 3)
     * 12 White pieces (rows 5, 6, 7 on dark squares: value 1)
     */
    private int[] createStandardBoard() {
        int[] board = new int[64];
        for (int r = 0; r < 8; r++) {
            for (int c = 0; c < 8; c++) {
                int sq = r * 8 + c;
                if ((r + c) % 2 == 1) { // Dark playable squares
                    if (r < 3) {
                        board[sq] = Engine.BLACK_MAN; // 3
                    } else if (r > 4) {
                        board[sq] = Engine.WHITE_MAN; // 1
                    } else {
                        board[sq] = Engine.EMPTY;     // 0
                    }
                } else {
                    board[sq] = Engine.EMPTY;
                }
            }
        }
        return board;
    }
}
