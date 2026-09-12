import fs from 'node:fs';
import path from 'node:path';
import { Table } from './table.js';
import { Column } from './column.js';
import { Row } from './row.js';
import { StorageError } from '../common/errors.js';

export class Database {
  constructor(name, baseDir = 'data') {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new StorageError(`Invalid database name: ${name}`);
    }

    this.name = name;
    this.baseDir = path.resolve(baseDir, name);
    this.tables = new Map();

    fs.mkdirSync(this.baseDir, { recursive: true });
    this._loadExistingTables();
  }

  /** Scan disk for *.tbl files and hydrate tables into memory. */
  _loadExistingTables() {
    for (const file of fs.readdirSync(this.baseDir)) {
      if (!file.endsWith('.tbl')) continue;

      const filePath = path.join(this.baseDir, file);

      try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        // Bypass Table constructor (which would re-save the file).
        const table = Object.create(Table.prototype);
        table.name = raw.name;
        table.columns = raw.columns.map((c) => new Column(c));
        table.rows = (raw.rows || []).map((r) => Row.fromJSON(r, table.columns));
        table.filePath = filePath;

        this.tables.set(table.name, table);
      } catch (err) {
        console.error(`[db] failed to load '${file}':`, err.message);
      }
    }
  }

  /** Create a new table with the given schema. */
  createTable(schema) {
    if (this.tables.has(schema.name)) {
      throw new StorageError(`Table '${schema.name}' already exists`);
    }
    const table = new Table(schema, this.baseDir);
    this.tables.set(schema.name, table);
    return table;
  }

  /** Get a table by name, or null. */
  getTable(name) {
    return this.tables.get(name) || null;
  }

  /** Drop a table (delete file + remove from memory). */
  dropTable(name) {
    const t = this.tables.get(name);
    if (!t) return false;
    t.drop();
    this.tables.delete(name);
    return true;
  }

  /** List all table names. */
  listTables() {
    return [...this.tables.keys()];
  }

  /** Persist every table to disk. */
  saveAll() {
    for (const t of this.tables.values()) t.save();
  }
}