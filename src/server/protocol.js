import { Executor } from '../sql/executor/executor.js';
import { SqlError } from '../common/errors.js';
import { getDatabase } from './databaseInstance.js';
import { Session } from '../transaction/session.js';
import { WriteAheadLog } from '../transaction/wal.js';

const MAX_FRAME_BYTES = 1 * 1024 * 1024;

export class Protocol {
  constructor(socket, { dbName = 'default' } = {}) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.database = getDatabase(dbName);

    // WAL + session FIRST so the executor can receive the session
    this.wal = new WriteAheadLog(`data/${dbName}.wal`);
    this.session = new Session({ wal: this.wal });

    // Pass the session into the executor so mutating operators can record undo
    this.executor = new Executor(this.database, this.session);
  }

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

  onMessage(sql) {
    const trimmed = String(sql).trim();
    if (!trimmed) {
      this.send({ ok: true, kind: 'noop' });
      return;
    }

    // ----- meta -----
    if (trimmed === '__META__ TABLES') { this.sendTables(); return; }

    // ----- transaction control -----
    try {
      const upper = trimmed.toUpperCase().replace(/;+$/, '');

      if (upper === 'BEGIN' || upper === 'BEGIN TRANSACTION') {
        this.session.begin();
        this.send({ ok: true, kind: 'begin', txId: this.session.currentTx.id });
        return;
      }
      if (upper === 'COMMIT') {
        const tx = this.session.commit(this.database);
        this.send({ ok: true, kind: 'commit', txId: tx.id });
        return;
      }
      if (upper === 'ROLLBACK') {
        const tx = this.session.rollback(this.database);
        this.send({ ok: true, kind: 'rollback', txId: tx.id });
        return;
      }

      console.log('[sql]', trimmed);
      const result = this.executor.execute(trimmed);

      // Inside a transaction, snapshot every table for WAL recovery.
      if (this.session.inTransaction() && this._statementMutates(trimmed)) {
        for (const tname of this.database.listTables()) {
          const t = this.database.getTable(tname);
          this.wal.append({
            type: 'MUTATE',
            txId: this.session.currentTx.id,
            table: tname,
            rows: t.rows.map((r) => r.toJSON()),
          });
          this.session.currentTx.touchedTables.add(tname);
        }
      }

      this.send(result);
    } catch (err) {
      const code = err instanceof SqlError ? err.code : 'ERROR';
      console.log('[sql error]', code, err.message);
      this.send({ ok: false, code, error: err.message });
    }
  }

  _statementMutates(sql) {
    const s = sql.trim().toUpperCase();
    return s.startsWith('INSERT') || s.startsWith('UPDATE') || s.startsWith('DELETE')
        || s.startsWith('CREATE') || s.startsWith('DROP');
  }

  sendTables() {
    const tables = this.database.listTables().map((name) => {
      const t = this.database.getTable(name);
      const namedSet = new Set(t.indexes.map((m) => m.name));
      const implicit = [];
      for (const c of t.columns) {
        if (c.primaryKey) implicit.push({ name: `${name}_${c.name}_pk`, column: c.name, kind: 'HASH', unique: true, implicit: true });
        else if (c.unique) implicit.push({ name: `${name}_${c.name}_uk`, column: c.name, kind: 'HASH', unique: true, implicit: true });
      }
      const indexes = [
        ...t.indexes.map((m) => ({ ...m, implicit: false })),
        ...implicit.filter((i) => !namedSet.has(i.name)),
      ];
      return {
        name,
        rowCount: t.rows.length,
        columns: t.columns.map((c) => ({
          name: c.name, type: c.type, nullable: c.nullable,
          primaryKey: c.primaryKey, unique: c.unique,
        })),
        indexes,
      };
    });
    this.send({ ok: true, tables });
  }

  send(objOrString) {
    const text = typeof objOrString === 'string' ? objOrString : JSON.stringify(objOrString);
    const payload = Buffer.from(text, 'utf8');
    const header = Buffer.alloc(4);
    header.writeUInt32BE(payload.length, 0);
    this.socket.write(Buffer.concat([header, payload]));
  }
}