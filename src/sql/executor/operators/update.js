import { evalExpr } from '../eval.js';
import { Row } from '../../../storage/row.js';

export function update(database, node, session = null) {
  const table = database.getTable(node.table);
  if (!table) throw new Error(`Table '${node.table}' not found`);

  const snapshot = table.rows.map((r) => r.toJSON());
  let affected = 0;

  for (const row of table.scan()) {
    const current = row.toJSON();
    if (node.where && !truthy(evalExpr(node.where, current))) continue;
    for (const [col, exprAst] of node.assignments) {
      row.set(col, evalExpr(exprAst, current));
    }
    affected++;
  }

  table.save();
  database.indexes.rebuild(node.table, table);

  if (session && session.inTransaction && session.inTransaction()) {
    session.currentTx.record(() => {
      table.rows = snapshot.map((r) => Row.fromJSON(r, table.columns));
      table.save();
      database.indexes.rebuild(node.table, table);
    }, node.table);
  }

  return { ok: true, kind: 'update', affected };
}

function truthy(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.length > 0;
  return Boolean(v);
}