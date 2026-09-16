import net from 'node:net';
import { Connection } from './connection.js';

export class TcpServer {
  constructor({ host = '0.0.0.0', port = 5433 }) {
    this.host = host;
    this.port = port;
    this.server = null;
    this.connections = new Set();
  }

  start() {
    this.server = net.createServer((socket) => this._handleConn(socket));
    this.server.on('error', (err) => console.error('[server] error:', err.message));
    this.server.listen(this.port, this.host, () => {
      console.log(`[sql-clone] listening on tcp://${this.host}:${this.port}`);
    });
  }

  async startAsync() {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => this._handleConn(socket));
      this.server.once('error', reject);
      this.server.listen(this.port, this.host, () => {
        this.server.off('error', reject);
        this.server.on('error', (err) => console.error('[server] error:', err.message));
        resolve();
      });
    });
  }

  _handleConn(socket) {
    const conn = new Connection(socket, {
      onClose: () => this.connections.delete(conn),
    });
    this.connections.add(conn);

    const { remoteAddress, remotePort } = socket;
    console.log(`[server] + client ${remoteAddress}:${remotePort} (total=${this.connections.size})`);

    conn.handle();
  }

  stop() {
    for (const conn of this.connections) conn.close();
    this.connections.clear();
    this.server?.close();
  }
}
