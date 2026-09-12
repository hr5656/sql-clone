import { evalExpr } from '../eval.js';

export function update(database, node) {
  const table = database.getTable(node.table);
  if (!table) throw new Error(`Table '${node.table}' not found`);

  let affected = 0;
  for (const row of table.scan()) {
    const snapshot = row.toJSON();
    if (node.where && !truthy(evalExpr(node.where, snapshot))) continue;

    for (const [col, exprAst] of node.assignments) {
      row.set(col, evalExpr(exprAst, snapshot));
    }
    affected++;
  }

  table.save();
  return { ok: true, kind: 'update', affected };
}

function truthy(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.length > 0;
  return Boolean(v);
}