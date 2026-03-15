#!/usr/bin/env bash
set -euo pipefail

# Build a static demo of the nasOS frontend for GitHub Pages.
# The output goes to dist-demo/ in the project root, ready for deployment.
#
# Usage:
#   ./build-demo.sh
#
# Deploy to GitHub Pages (from project root):
#   gh-pages -d dist-demo
#   — or push the contents of dist-demo/ to the gh-pages branch.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
OUTPUT_DIR="$SCRIPT_DIR/dist-demo"

echo "╔══════════════════════════════════════╗"
echo "║     nasOS — Demo Build for GH Pages  ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. Check prerequisites ───────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "❌ Node.js is required but not installed." >&2
  exit 1
fi

# ── 2. Install dependencies if needed ────────────────────────────────
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "📦 Installing frontend dependencies…"
  (cd "$FRONTEND_DIR" && npm ci)
fi

# ── 3. Build with demo mode ─────────────────────────────────────────
echo "🔨 Building demo (VITE_DEMO=1, mode=demo)…"
(cd "$FRONTEND_DIR" && VITE_DEMO=1 npx vite build --mode demo --outDir "$OUTPUT_DIR" --emptyOutDir)

# ── 4. Create 404.html for SPA routing on GitHub Pages ───────────────
# GitHub Pages serves 404.html for unknown paths; this redirects back to
# index.html so client-side routing still works if ever added.
cp "$OUTPUT_DIR/index.html" "$OUTPUT_DIR/404.html"

# ── 5. Create .nojekyll so GitHub Pages serves _ prefixed files ──────
touch "$OUTPUT_DIR/.nojekyll"

echo ""
echo "✅ Demo built successfully → $OUTPUT_DIR"
echo ""
echo "To preview locally:"
echo "  npx serve $OUTPUT_DIR"
echo ""
echo "To deploy to GitHub Pages:"
echo "  npx gh-pages -d dist-demo"
echo "  — or push dist-demo/ contents to the gh-pages branch"
