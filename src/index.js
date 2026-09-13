import { TcpServer } from './server/tcpServer.js';
import { WebServer } from './server/webServer.js';

const TCP_PORT = Number(process.env.PORT || 5433);
const WEB_PORT = Number(process.env.WEB_PORT || 8080);
const HOST     = process.env.HOST || '0.0.0.0';

const tcp = new TcpServer({ host: HOST, port: TCP_PORT });
const web = new WebServer({ port: WEB_PORT, sqlHost: '127.0.0.1', sqlPort: TCP_PORT });

process.on('SIGINT', () => {
  console.log('\n[server] shutting down...');
  tcp.stop();
  web.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  tcp.stop();
  web.stop();
  process.exit(0);
});

tcp.start();
web.start();