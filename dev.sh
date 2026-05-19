#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║       Vibes DermaScan — Dev          ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Check for .env in backend
if [ ! -f "$BACKEND/.env" ]; then
  echo "⚠  No backend/.env found. Copying from .env.example..."
  cp "$BACKEND/.env.example" "$BACKEND/.env"
  echo "   Edit backend/.env and add your OPENAI_API_KEY, then re-run."
  echo ""
fi

# Install backend dependencies
echo "▶ Installing backend dependencies..."
cd "$BACKEND"
pip install -r requirements.txt -q

# Install frontend dependencies
echo "▶ Installing frontend dependencies..."
cd "$FRONTEND"
npm install --silent

# Start both concurrently
echo ""
echo "▶ Starting servers..."
echo "   Backend  → http://localhost:8000"
echo "   Frontend → http://localhost:3000"
echo ""

# Trap to kill children on exit
cleanup() {
  echo ""
  echo "Stopping servers..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

cd "$BACKEND"
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

cd "$FRONTEND"
npm run dev &
FRONTEND_PID=$!

wait
