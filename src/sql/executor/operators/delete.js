import { evalExpr } from '../eval.js';

export function remove(database, node) {
  const table = database.getTable(node.table);
  if (!table) throw new Error(`Table '${node.table}' not found`);

  if (!node.where) {
    const deleted = table.rows.length;
    table.rows = [];
    table.save();
    return { ok: true, kind: 'delete', deleted };
  }

  const kept = [];
  let deleted = 0;
  for (const row of table.rows) {
    if (truthy(evalExpr(node.where, row.toJSON()))) deleted++;
    else kept.push(row);
  }
  table.rows = kept;
  table.save();
  return { ok: true, kind: 'delete', deleted };
}

function truthy(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.length > 0;
  return Boolean(v);
}