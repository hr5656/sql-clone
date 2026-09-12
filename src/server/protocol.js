import { Executor } from '../sql/executor/executor.js';
import { Database } from '../storage/database.js';
import { SqlError } from '../common/errors.js';

const MAX_FRAME_BYTES = 1 * 1024 * 1024; // 1 MiB safety cap

export class Protocol {
  constructor(socket, { dbName = 'default' } = {}) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.database = new Database(dbName);
    this.executor = new Executor(this.database);
  }

  /** Incoming bytes → framed messages → onMessage */
  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= 4) {
      const len = this.buffer.readUInt32BE(0);

      if (len > MAX_FRAME_BYTES) {
        this.send({ ok: false, code: 'FRAME_TOO_LARGE', error: `Frame > ${MAX_FRAME_BYTES} bytes` });
        this.buffer = Buffer.alloc(0);
        return;
      }

      if (this.buffer.length < 4 + len) break;

      const payload = this.buffer.subarray(4, 4 + len).toString('utf8');
      this.buffer = this.buffer.subarray(4 + len);

      this.onMessage(payload);
    }
  }

  /** Handle one SQL string. Always replies with one framed JSON message. */
  onMessage(sql) {
    const trimmed = String(sql).trim();
    if (!trimmed) {
      this.send({ ok: true, kind: 'noop' });
      return;
    }

    console.log('[sql]', trimmed);

    try {
      const result = this.executor.execute(trimmed);
      this.send(result);
    } catch (err) {
      const code = err instanceof SqlError ? err.code : 'ERROR';
      console.log('[sql error]', code, err.message);
      this.send({ ok: false, code, error: err.message });
    }
  }

  /** Send one framed JSON message. */
  send(objOrString) {
    const text = typeof objOrString === 'string'
      ? objOrString
      : JSON.stringify(objOrString);

    const payload = Buffer.from(text, 'utf8');
    const header = Buffer.alloc(4);
    header.writeUInt32BE(payload.length, 0);

    this.socket.write(Buffer.concat([header, payload]));
  }
}