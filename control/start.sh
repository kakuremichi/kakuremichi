#!/bin/sh
set -e

echo "Starting kakuremichi Control Server (HTTP + WS)..."

# Single-process start: Next.js + WebSocket on the same port/path.
PORT=${PORT:-3000}
WS_PATH=${WS_PATH:-/ws}

echo "HTTP: http://localhost:${PORT}"
echo "WebSocket: ws://localhost:${PORT}${WS_PATH}"

# Use tsx to run the custom server (expects `npm run build` done beforehand)
exec npx tsx src/server.ts
