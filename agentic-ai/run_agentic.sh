#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_NAME="${1:-deeplearning}"

if ! command -v conda >/dev/null 2>&1; then
  echo "conda is not installed or not on PATH."
  exit 1
fi

eval "$(conda shell.bash hook)"
conda activate "$ENV_NAME"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${WS_PID:-}" ]] && kill -0 "$WS_PID" >/dev/null 2>&1; then
    kill "$WS_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

echo "Using conda env: $ENV_NAME"
echo "Starting HTTP bridge on http://0.0.0.0:8787"
python "$ROOT_DIR/server.py" &
SERVER_PID=$!

echo "Starting WebSocket bridge on ws://0.0.0.0:8788"
python "$ROOT_DIR/ws_server.py" &
WS_PID=$!

while true; do
  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    wait "$SERVER_PID" || true
    echo "server.py exited."
    exit 1
  fi

  if ! kill -0 "$WS_PID" >/dev/null 2>&1; then
    wait "$WS_PID" || true
    echo "ws_server.py exited."
    exit 1
  fi

  sleep 1
done
