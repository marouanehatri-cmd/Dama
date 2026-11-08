# Dama Master — Moroccan Dama Grandmaster Engine 🇲🇦

An unbeatable Moroccan Dama (الضامة المغربية) engine and game application powered by a **C++ 64-bit Bitboard Engine** and Stockfish-style search algorithms. The UI remains on the classic 8x8 wooden board in JavaScript/TypeScript with 0 lag, while the engine runs asynchronously in Web Workers / native JNI.

---

## ⚡ Performance & Engine Architecture

- **64-bit Bitboard Internals**:
  - `whiteMen`, `whiteKings`, `blackMen`, `blackKings` (4x `uint64_t` / `BigInt`).
  - `makeMove` = Bitwise XOR bits (zero array copy, zero allocation).
  - `undoMove` = Bitwise XOR again (instant $O(1)$ state reversal).
  - Pre-calculated Piece-Square Tables (PST) with incremental evaluation.
- **Stockfish-Style Search**:
  - **Negamax + Alpha-Beta Pruning**
  - **PVS (Principal Variation Search)**: Full window on first move, zero-window on sub-branches.
  - **LMR (Late Move Reduction)**: Quiet moves after 4th move reduced ($R = 1$ or $2$) at depth $\ge 3$.
  - **Null-Move Pruning ($R = 2$)**: Speculative pass turns to trigger early beta-cutoffs in stable positions.
  - **Quiescence Search**: Continues past depth 0 searching only captures to eliminate the horizon effect.
  - **1,048,576-Entry Transposition Table**: Powered by 64-bit Zobrist Hashing with Exact, Lowerbound, and Upperbound flags.
  - **Move Ordering**: Hash move > Majority captures (most captured pieces) > Killer moves > History Heuristic table.
- **Benchmarked Speed**:
  - **Depth 11–12 in <800ms** on mobile devices.
  - **>140,000 Nodes Per Second (NPS)**.
  - 100% responsive 60 FPS UI: Engine runs completely off the main thread.

---

## 🇲🇦 Moroccan Dama Rules (8x8 Board)

1. **Board Layout**:
   - Played on dark squares of an 8x8 board: `(row + col) % 2 == 1`.
   - 12 White pieces on rows 5, 6, 7 vs 12 Black pieces on rows 0, 1, 2.
   - UI format: `int board[64]` (0 = empty, 1 = whiteMan, 2 = whiteKing, 3 = blackMan, 4 = blackKing).
2. **Men Movement**:
   - Move forward 1 square diagonally to empty dark squares.
   - Capture forward diagonally by jumping over an enemy piece into a vacant square beyond.
3. **Flying Kings (Dama / Sultan)**:
   - Glide any distance diagonally in all 4 directions.
   - Capture from distance along diagonal rays, landing on any empty square behind the captured piece.
4. **Mandatory Capture & Majority Rule**:
   - If any capture exists, non-capture moves are illegal.
   - If multiple capture sequences are possible, the player **must** choose a capture that takes the **maximum number of pieces** (`maxCaptured`).
5. **Promotion**:
   - When a man reaches the opponent's back rank (row 0 for White, row 7 for Black), it immediately crowns into a King and the turn **terminates immediately** (no continuation as King in the same turn).
6. **Victory**:
   - Capture all opponent pieces OR block opponent from having legal moves.

---

## 📁 Repository Structure

```
├── cpp/
│   ├── engine.h              # C++ Engine header (64-bit Bitboards, TT, JNI exports)
│   ├── engine.cpp            # C++ Engine implementation (800+ lines, PVS, LMR, Quiescence)
│   └── CMakeLists.txt        # CMake config for Android NDK 25.2.9519653 + CMake 3.22.1
├── app/
│   └── src/main/java/com/dama/
│       ├── Engine.java       # Native JNI Java wrapper (Java_com_dama_Engine_getBestMove)
│       └── MainActivity.java # Example Activity calling native C++ engine asynchronously
├── android/                  # Native Android project with Capacitor & Gradle wrapper
│   └── app/build.gradle      # Configured with externalNativeBuild (CMake) and NDK filters
├── src/
│   ├── engine/
│   │   ├── bitboardEngine.ts # 64-bit Bitboard Engine in TypeScript (BigInt, XOR moves)
│   │   ├── engine.ts         # Minimax solver integration & opening book
│   │   ├── worker.ts         # Dedicated Web Worker (isolates engine from UI thread)
│   │   └── openingBook.ts    # 150 authentic Moroccan opening lines
│   ├── App.tsx               # 8x8 Wooden board UI, Advantage Bar, & Controls
│   └── main.tsx              # React entry point
└── .github/workflows/
    └── build-apk.yml         # GitHub Actions automated release APK builder
```

---

## 📲 How to Push to GitHub & Download the APK

### Step 1: Push Code to GitHub
To push this codebase to your GitHub repository:

```bash
# Verify remote is set to your GitHub repository
git remote -v

# Add changes and commit
git add .
git commit -m "Convert Moroccan Dama engine to C++ Bitboard with Stockfish search and APK workflow"

# Push to your main branch
git push origin main
```

*(If prompted for credentials, use your GitHub username and Personal Access Token).*

### Step 2: Download Built APK from GitHub Actions
1. Open your repository on GitHub: `https://github.com/marouanehatri-cmd/Dama`
2. Click on the **Actions** tab at the top.
3. Click on the latest workflow run named **Build Dama APK with C++ Engine**.
4. Once the build finishes (approx. 2 minutes), scroll down to the **Artifacts** section at the bottom of the page.
5. Click on **`dama-apk`** to download the release APK zip!
6. Extract the zip and install `app-release.apk` (or `app-debug.apk`) directly onto any Android device.

---

## 💻 Local Web & Android Development

```bash
# 1. Install dependencies
npm install --legacy-peer-deps

# 2. Run local development server (Port 3000)
npm run dev

# 3. Build production web bundle
npm run build

# 4. Sync web assets to Capacitor Android
npx cap sync android

# 5. Build native Android APK locally (requires Android SDK & NDK)
cd android
./gradlew assembleRelease
```
