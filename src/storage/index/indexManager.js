import { BTreeIndex } from './btree.js';
import { HashIndex } from './hashIndex.js';

export class IndexManager {
  constructor() {
    /** @type {Map<string, BTreeIndex|HashIndex>} key = `${table}.${column}` */
    this.indexes = new Map();
  }

  static key(table, column) {
    return `${table}.${column}`;
  }

  /** Create (or replace) a B-Tree index on a column. */
  createBTree(table, column) {
    const k = IndexManager.key(table, column);
    this.indexes.set(k, new BTreeIndex(column));
    return this.indexes.get(k);
  }

  /** Create (or replace) a Hash index on a column. */
  createHash(table, column) {
    const k = IndexManager.key(table, column);
    this.indexes.set(k, new HashIndex(column));
    return this.indexes.get(k);
  }

  /** Lookup an index. */
  get(table, column) {
    return this.indexes.get(IndexManager.key(table, column)) || null;
  }

  /** Remove an index. */
  drop(table, column) {
    return this.indexes.delete(IndexManager.key(table, column));
  }

  /** List indexes for a table. */
  listFor(table) {
    const out = [];
    for (const [k, idx] of this.indexes) {
      const [t, c] = k.split('.');
      if (t === table) out.push({ column: c, kind: idx.constructor.name });
    }
    return out;
  }

  /** Build all missing indexes for a table (idempotent). */
  ensureIndexesFor(tableName, table) {
    for (const col of table.columns) {
      if (!col.primaryKey && !col.unique) continue;
      const k = IndexManager.key(tableName, col.name);
      if (this.indexes.has(k)) continue;

      // PRIMARY KEY and UNIQUE → Hash index (equality lookups dominate)
      this.createHash(tableName, col.name);
      const idx = this.indexes.get(k);

      // populate
      table.rows.forEach((row, rowId) => {
        idx.insert(row.get(col.name), rowId);
      });
    }
  }

  /** Insert one row into all indexes on the table. */
  indexRow(tableName, table, row, rowId) {
    for (const [k, idx] of this.indexes) {
      const [t, c] = k.split('.');
      if (t !== tableName) continue;
      idx.insert(row.get(c), rowId);
    }
  }

  /** Remove a row from all indexes on the table. */
  unindexRow(tableName, table, row, rowId) {
    for (const [k, idx] of this.indexes) {
      const [t, c] = k.split('.');
      if (t !== tableName) continue;
      idx.remove(row.get(c), rowId);
    }
  }

  /** Rebuild all indexes for a table (used after bulk UPDATE/DELETE). */
  rebuild(tableName, table) {
    const toRebuild = [];
    for (const [k, idx] of this.indexes) {
      const [t, c] = k.split('.');
      if (t === tableName) toRebuild.push([c, idx.constructor]);
    }
    for (const [c] of toRebuild) this.indexes.delete(IndexManager.key(tableName, c));
    for (const [c, Cls] of toRebuild) {
      const idx = Cls === BTreeIndex ? this.createBTree(tableName, c) : this.createHash(tableName, c);
      table.rows.forEach((row, rowId) => idx.insert(row.get(c), rowId));
    }
  }

    /** Register a named index (metadata) and build its data structure. */
  createNamed({ table, column, name, kind = 'BTREE', unique = false }) {
    const idx = kind === 'HASH'
      ? this.createHash(table, column)
      : this.createBTree(table, column);
    idx.indexName = name;
    idx.unique = unique;
    return idx;
  }

  /** Look up an index by its user-facing name (searches all tables). */
  getByName(name) {
    for (const [, idx] of this.indexes) {
      if (idx.indexName === name) return idx;
    }
    return null;
  }

  /** Drop by user-facing name. Returns true if removed. */
  dropByName(name) {
    for (const [k, idx] of this.indexes) {
      if (idx.indexName === name) {
        this.indexes.delete(k);
        return true;
      }
    }
    return false;
  }

}