import { evalExpr } from '../eval.js';
import { StorageError } from '../../../common/errors.js';

export function insert(database, node) {
  const table = database.getTable(node.table);
  if (!table) throw new Error(`Table '${node.table}' not found`);

  let inserted = 0;
  for (const rowValues of node.values) {
    const data = {};

    if (node.columns) {
      node.columns.forEach((col, i) => { data[col] = evalExpr(rowValues[i], null); });
    } else {
      table.columns.forEach((col, i) => {
        if (i < rowValues.length) data[col.name] = evalExpr(rowValues[i], null);
      });
    }

    // UNIQUE checks against existing rows
    for (const col of table.columns) {
      if (!col.unique && !col.primaryKey) continue;
      const v = data[col.name];
      if (v === undefined) continue;
      for (const existing of table.scan()) {
        if (existing.get(col.name) === v) {
          throw new StorageError(`UNIQUE violation on ${col.name} = ${v}`);
        }
      }
    }

    table.insert(data);
    inserted++;
  }
  table.save();
  return { ok: true, kind: 'insert', inserted };
}