import { Executor } from '../sql/executor/executor.js';
import { SqlError } from '../common/errors.js';
import { Session } from '../transaction/session.js';
import { WriteAheadLog } from '../transaction/wal.js';
import {
  getDatabase,
  listDatabases,
} from './databaseManager.js';

const MAX_FRAME_BYTES = 1 * 1024 * 1024;

export class Protocol {
  constructor(socket, { dbName = 'default' } = {}) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);

    // Per-session active database
    this._activeDb = dbName;
    getDatabase(dbName);                       // ensure it's loaded

    this.wal = new WriteAheadLog(`data/${dbName}.wal`);
    this.session = new Session({ wal: this.wal });

    // Executor gets a resolver function so it always sees this session's DB
    this.executor = new Executor(() => this.database, this.session);
  }

  /** This connection's database. */
  get database() {
    return getDatabase(this._activeDb);
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
    if (trimmed === '__META__ DBS')    { this.sendDbs();    return; }

    try {
      const upper = trimmed.toUpperCase().replace(/;+$/, '');

      // ----- USE <db> — switch this session's active database -----
      const useMatch = trimmed.match(/^USE\s+([A-Za-z_][A-Za-z0-9_]*)\s*;?$/i);
      if (useMatch) {
        const name = useMatch[1];          // ← preserves original case
        getDatabase(name);
        this._activeDb = name;
        this.wal = new WriteAheadLog(`data/${name}.wal`);
        this.session = new Session({ wal: this.wal });
        this.executor = new Executor(() => this.database, this.session);
        this.send({ ok: true, kind: 'use-database', name });
        return;
      }

      // ----- transaction control -----
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

      // ----- normal SQL -----
      console.log('[sql]', trimmed);
      const result = this.executor.execute(trimmed);

      // WAL: snapshot every table if inside a transaction and the statement mutates
      if (this.session.inTransaction() && this._statementMutates(trimmed)) {
        const db = this.database;
        for (const tname of db.listTables()) {
          const t = db.getTable(tname);
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
    const db = this.database;                 // ensure correct DB
    const tables = db.listTables().map((name) => {
      const t = db.getTable(name);
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
    this.send({ ok: true, tables, database: this._activeDb });
  }

  sendDbs() {
    this.send({
      ok: true,
      databases: listDatabases(),
      active: this._activeDb,
    });
  }

  send(objOrString) {
    const text = typeof objOrString === 'string' ? objOrString : JSON.stringify(objOrString);
    const payload = Buffer.from(text, 'utf8');
    const header = Buffer.alloc(4);
    header.writeUInt32BE(payload.length, 0);
    this.socket.write(Buffer.concat([header, payload]));
  }
}