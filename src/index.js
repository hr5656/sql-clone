import { TcpServer } from './server/tcpServer.js';
import { WebServer } from './server/webServer.js';
import { getDatabase } from './server/databaseManager.js';
import { recoverFromWAL } from './storage/walRecovery.js';
import path from 'node:path';

const TCP_PORT = Number(process.env.PORT || 5433);
const WEB_PORT = Number(process.env.WEB_PORT || 8080);
const HOST     = process.env.HOST || '0.0.0.0';
const DB_NAME  = 'default';

// Force the shared DB to initialize (and load from disk) before recovery
const db = getDatabase(DB_NAME);
try {
  recoverFromWAL(path.resolve(`data/${DB_NAME}.wal`), db);
} catch (e) {
  console.error('[wal] recovery failed:', e.message);
}

const tcp = new TcpServer({ host: HOST, port: TCP_PORT });
const web = new WebServer({ port: WEB_PORT, sqlHost: '127.0.0.1', sqlPort: TCP_PORT });

const shutdown = () => { tcp.stop(); web.stop(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

tcp.start();
web.start();