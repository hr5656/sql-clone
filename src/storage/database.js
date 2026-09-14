import fs from 'node:fs';
import path from 'node:path';
import { Table } from './table.js';
import { Column } from './column.js';
import { Row } from './row.js';
import { StorageError } from '../common/errors.js';
import { IndexManager } from './index/indexManager.js';

export class Database {
  constructor(name, baseDir = 'data') {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new StorageError(`Invalid database name: ${name}`);
    }

    this.name = name;
    this.baseDir = path.resolve(baseDir, name);
    this.tables = new Map();
    this.indexes = new IndexManager();

    fs.mkdirSync(this.baseDir, { recursive: true });
    this._loadExistingTables();

    // build indexes for every table (idempotent)
   this._rebuildIndexes();
  }

   _loadExistingTables() {
    for (const file of fs.readdirSync(this.baseDir)) {
      if (!file.endsWith('.tbl')) continue;

      const filePath = path.join(this.baseDir, file);
      try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const table = Object.create(Table.prototype);
        table.name = raw.name;
        table.columns = raw.columns.map((c) => new Column(c));
        table.rows = (raw.rows || []).map((r) => Row.fromJSON(r, table.columns));
        table.indexes = raw.indexes || [];
        table.filePath = filePath;
        this.tables.set(table.name, table);
      } catch (err) {
        console.error(`[db] failed to load '${file}':`, err.message);
      }
    }
  }
   _rebuildIndexes() {
    for (const [tname, t] of this.tables) {
      // 1) auto-indexes for PRIMARY KEY / UNIQUE
      this.indexes.ensureIndexesFor(tname, t);

      // 2) named / user-created indexes
      for (const meta of t.indexes) {
        const idx = this.indexes.createNamed({
          table: tname,
          column: meta.column,
          name: meta.name,
          kind: meta.kind,
          unique: meta.unique,
        });
        t.rows.forEach((row, rowId) => idx.insert(row.get(meta.column), rowId));
      }
    }
  }


  createTable(schema) {
    if (this.tables.has(schema.name)) {
      throw new StorageError(`Table '${schema.name}' already exists`);
    }
    const table = new Table(schema, this.baseDir);
    this.tables.set(schema.name, table);
    this.indexes.ensureIndexesFor(schema.name, table);
    return table;
  }

  getTable(name) {
    return this.tables.get(name) || null;
  }

  dropTable(name) {
    const t = this.tables.get(name);
    if (!t) return false;
    t.drop();
    this.tables.delete(name);
    return true;
  }

  listTables() {
    return [...this.tables.keys()];
  }

  saveAll() {
    for (const t of this.tables.values()) t.save();
  }
}