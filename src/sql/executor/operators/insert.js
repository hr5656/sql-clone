import { evalExpr } from '../eval.js';
import { StorageError } from '../../../common/errors.js';

export function insert(database, node, session = null) {
  const table = database.getTable(node.table);
  if (!table) throw new Error(`Table '${node.table}' not found`);

  // Snapshot for undo
  const beforeLen = table.rows.length;

  let inserted = 0;

  // Collect unique columns (PK + UNIQUE + unique indexes)
  const uniqueCols = new Set();
  for (const col of table.columns) {
    if (col.primaryKey || col.unique) uniqueCols.add(col.name);
  }
  for (const [key, idx] of database.indexes.indexes) {
    const [t, c] = key.split('.');
    if (t === node.table && idx.unique) uniqueCols.add(c);
  }

  for (const rowValues of node.values) {
    const data = {};

    if (node.columns) {
      node.columns.forEach((col, i) => { data[col] = evalExpr(rowValues[i], null); });
    } else {
      table.columns.forEach((col, i) => {
        if (i < rowValues.length) data[col.name] = evalExpr(rowValues[i], null);
      });
    }

    // UNIQUE / PRIMARY KEY checks (via index if present)
    for (const colName of uniqueCols) {
      const v = data[colName];
      if (v === undefined || v === null) continue;

      const idx = database.indexes.get(node.table, colName);
      if (idx) {
        if (idx.find(v).length > 0) {
          throw new StorageError(`UNIQUE violation on ${colName} = ${v}`);
        }
      } else {
        for (const existing of table.scan()) {
          if (existing.get(colName) === v) {
            throw new StorageError(`UNIQUE violation on ${colName} = ${v}`);
          }
        }
      }
    }

    const row = table.insert(data);
    const rowId = table.rows.length - 1;
    database.indexes.indexRow(node.table, table, row, rowId);
    inserted++;
  }
  table.save();

  // Record undo when inside a transaction
  if (session && session.inTransaction && session.inTransaction()) {
    session.currentTx.record(() => {
      table.rows.length = beforeLen;
      table.save();
      database.indexes.rebuild(node.table, table);
    }, node.table);
  }

  return { ok: true, kind: 'insert', inserted };
}