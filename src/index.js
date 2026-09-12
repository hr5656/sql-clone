import { TcpServer } from './server/tcpServer.js';

const PORT = Number(process.env.PORT || 5433);
const HOST = process.env.HOST || '0.0.0.0';

const server = new TcpServer({ host: HOST, port: PORT });

process.on('SIGINT', () => {
  console.log('\n[server] shutting down...');
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  server.stop();
  process.exit(0);
});

server.start();