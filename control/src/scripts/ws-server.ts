#!/usr/bin/env tsx
import { WebSocketServer } from 'ws';
import http from 'http';
import { parse } from 'url';
import { ControlWebSocketServer } from '../lib/ws/server';

const PORT = Number(process.env.WS_PORT || 3001);
const PATH = process.env.WS_PATH || '/ws';

const server = http.createServer((req, res) => {
  res.writeHead(404);
  res.end();
});

const wsServer = new ControlWebSocketServer(PORT, server, PATH);

server.listen(PORT, () => {
  console.log(`WebSocket endpoint: ws://localhost:${PORT}${PATH}`);
});

const shutdown = () => {
  wsServer.close();
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
