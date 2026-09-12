import { Protocol } from './protocol.js';

export class Connection {
  constructor(socket, { onClose } = {}) {
    this.socket = socket;
    this.protocol = new Protocol(socket);
    this.onClose = onClose;
    this.closed = false;
  }

  handle() {
    this.socket.setNoDelay(true);      // low-latency SQL responses
    this.socket.setKeepAlive(true);

    this.socket.on('data',  (chunk) => this.protocol.onData(chunk));
    this.socket.on('error', (err)   => console.error('[conn] error:', err.message));
    this.socket.on('close', () => {
      this.closed = true;
      this.onClose?.();
    });
  }

  close() {
    if (!this.closed) this.socket.end();
  }
}