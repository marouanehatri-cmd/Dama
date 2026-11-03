# Dama Master — Moroccan Dama & Universal Checkers Solver 🇲🇦

An authentic Moroccan Dama (الضامة المغربية) engine, game solver, and interactive web/Android app built with React, TypeScript, Tailwind CSS, and Capacitor.

## ✨ Features

- **100% Authentic Moroccan Dama Rules**:
  - Men move 1 step diagonally forward to empty dark squares.
  - Men capture diagonally **forward OR backward** by jumping over opponent pieces.
  - **Mandatory Capture**: If any capture is available, normal moves are illegal.
  - **MAX Capture (Majority Rule)**: A player **must** choose the path that captures the most opponent pieces (`findMaxCaptureLength`).
  - **Flying King (Dama / Sultan)**: Moves any distance diagonally like a bishop, sweeps through contiguous opponent pieces along diagonals into any vacant landing square beyond them.
  - **Immediate Promotion Stop**: When a man reaches the opponent's back rank (row 0 for White, row 7 for Black), it immediately crowns into a King and the turn terminates immediately.
- **Minimax Solver with Alpha-Beta Pruning**:
  - Depths 1–15 with performance stats (nodes evaluated, time elapsed, candidate possibilities).
  - Terminal win/loss evaluation.
  - Visual animated best-move trajectory arrows directly on the board.
- **Tactile Wooden Board UI**:
  - Rich mahogany/walnut & maple squares with algebraic coordinates (a–h, 1–8).
  - Drag-and-drop & click-to-move piece interaction.
  - Presets including the test position: **White King at `d4` vs Black men at `e5`, `f6`** (evaluates to immediate win by capturing both pieces).
  - Custom board editor, flip board, undo/redo, auto-play vs engine.
- **Android APK Ready**:
  - Powered by Capacitor 8.
  - Native Android project included (`/android`).
  - Automated GitHub Actions workflow to build and export `.apk` with every push or manual trigger.

---

## 📱 Building the Android APK via GitHub Actions

This repository is pre-configured with a GitHub Actions workflow (`.github/workflows/build-apk.yml`) that compiles an Android APK automatically:

1. **Push this repository to GitHub** into a repository named `dama`.
2. Navigate to the **Actions** tab in your GitHub repository.
3. You will see the **Build Android APK** workflow automatically run.
   - You can also run it manually anytime by clicking **Run workflow** -> select `debug` or `release`.
4. When the build completes (~2 minutes), click on the workflow run.
5. Under **Artifacts**, download **`dama-android-apk`** to get `dama-master-debug.apk` directly!
6. Install the `.apk` on any Android device.

---

## 🚀 Local Development

```bash
# 1. Install dependencies
npm install --legacy-peer-deps

# 2. Start dev server
npm run dev

# 3. Build web production bundle
npm run build

# 4. Sync web bundle to Android project
npm run cap:sync

# 5. Open Android project in Android Studio (optional)
npx cap open android
```

---

## 🛠️ Pushing to GitHub

To push this codebase into your GitHub account:

```bash
# 1. Create a new repository named 'dama' on github.com (https://github.com/new)

# 2. Add your GitHub remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/dama.git

# 3. Push code to main branch
git branch -M main
git push -u origin main
```
