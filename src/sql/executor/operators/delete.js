import { evalExpr } from '../eval.js';
import { Row } from '../../../storage/row.js';

export function remove(database, node, session = null) {
  const table = database.getTable(node.table);
  if (!table) throw new Error(`Table '${node.table}' not found`);

  const snapshot = table.rows.map((r) => r.toJSON());
  const before = table.rows.length;

  if (!node.where) {
    table.rows = [];
  } else {
    const kept = [];
    for (const row of table.rows) {
      if (!truthy(evalExpr(node.where, row.toJSON()))) kept.push(row);
    }
    table.rows = kept;
  }

  const deleted = before - table.rows.length;
  table.save();
  database.indexes.rebuild(node.table, table);

  if (session && session.inTransaction && session.inTransaction()) {
    session.currentTx.record(() => {
      table.rows = snapshot.map((r) => Row.fromJSON(r, table.columns));
      table.save();
      database.indexes.rebuild(node.table, table);
    }, node.table);
  }

  return { ok: true, kind: 'delete', deleted };
}

function truthy(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.length > 0;
  return Boolean(v);
}