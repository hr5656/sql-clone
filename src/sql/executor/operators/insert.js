import { evalExpr } from '../eval.js';

export function insert(database, node) {
  const table = database.getTable(node.table);
  if (!table) throw new Error(`Table '${node.table}' not found`);

  let inserted = 0;
  for (const rowValues of node.values) {
    const data = {};

    if (node.columns) {
      node.columns.forEach((col, i) => {
        data[col] = evalExpr(rowValues[i], null);
      });
    } else {
      table.columns.forEach((col, i) => {
        if (i < rowValues.length) data[col.name] = evalExpr(rowValues[i], null);
      });
    }

    table.insert(data);
    inserted++;
  }
  table.save();
  return { ok: true, kind: 'insert', inserted };
}