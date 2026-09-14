import fs from 'node:fs';
import path from 'node:path';
import { Column } from './column.js';
import { Row } from './row.js';
import { StorageError } from '../common/errors.js';

export class Table {
  constructor(schema, baseDir) {
    if (!schema || !schema.name) throw new StorageError('Table name required');
    if (!Array.isArray(schema.columns) || schema.columns.length === 0) {
      throw new StorageError(`Table '${schema.name}' must have at least one column`);
    }

    this.name = schema.name;
    this.columns = schema.columns.map((c) =>
      c instanceof Column ? c : new Column(c)
    );
    this.rows = [];
     this.indexes = [];
    this.filePath = path.join(baseDir, `${this.name}.tbl`);

    if (fs.existsSync(this.filePath)) this.load();
    else this.save();
  }

  /** Lookup a column descriptor by name. */
  getColumn(name) {
    return this.columns.find((c) => c.name === name) || null;
  }

  /** Insert a plain object row. Enforces NOT NULL + PRIMARY KEY. */
  insert(rowData) {
    const row = new Row(rowData, this.columns);

    // PRIMARY KEY uniqueness
    const pkCols = this.columns.filter((c) => c.primaryKey);
    if (pkCols.length) {
      const key = pkCols.map((c) => row.get(c.name)).join('\u0001');
      for (const existing of this.rows) {
        const k = pkCols.map((c) => existing.get(c.name)).join('\u0001');
        if (k === key) {
          throw new StorageError(
            `PRIMARY KEY violation on (${pkCols.map((c) => c.name).join(', ')}): ${key}`
          );
        }
      }
    }

    this.rows.push(row);
    return row;
  }

  /** Return all rows. */
  scan() {
    return this.rows;
  }

  /** Return all rows as plain JSON objects. */
  scanJSON() {
    return this.rows.map((r) => r.toJSON());
  }

  /** Count of rows. */
  count() {
    return this.rows.length;
  }

  /** Replace a row's data (used by UPDATE). `row` must be one of `this.rows`. */
  replaceRow(row, newData) {
    for (const col of this.columns) {
      if (col.name in newData) row.set(col.name, newData[col.name]);
    }
  }

  /** Remove rows matching predicate (used by DELETE). Returns count removed. */
  deleteWhere(predicate) {
    const kept = [];
    let removed = 0;
    for (const row of this.rows) {
      if (predicate(row)) removed++;
      else kept.push(row);
    }
    this.rows = kept;
    return removed;
  }

  /** Persist to disk (JSON in Phase 1, binary pages later). */
  save() {
    const payload = {
      name: this.name,
      columns: this.columns.map((c) => c.toJSON()),
      rows: this.rows.map((r) => r.toJSON()),
      indexes: this.indexes,     // ← add
    };
    fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2));
  }

  /** Load from disk. */
   load() {
    const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));

    if (Array.isArray(raw.columns) && raw.columns.length) {
      this.columns = raw.columns.map((c) =>
        c instanceof Column ? c : new Column(c)
      );
    }

    this.rows = (raw.rows || []).map((r) => Row.fromJSON(r, this.columns));
    this.indexes = raw.indexes || [];          // ← add
  }

  /** Delete the backing file and clear memory. */
  drop() {
    if (fs.existsSync(this.filePath)) fs.unlinkSync(this.filePath);
    this.rows = [];
  }

  toJSON() {
    return {
      name: this.name,
      columns: this.columns.map((c) => c.toJSON()),
      rowCount: this.rows.length,
    };
  }
}