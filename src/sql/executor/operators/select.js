import { evalExpr } from '../eval.js';

export function select(database, node) {
  // ---- 1. SOURCE ----
  let rows;
  if (!node.table) {
    rows = [{}];  // one dummy row for constant select
  } else {
    const table = database.getTable(node.table);
    if (!table) throw new Error(`Table '${node.table}' not found`);
    rows = table.scan().map((r) => r.toJSON());
  }

  // ---- 2. WHERE ----
  if (node.where) {
    rows = rows.filter((r) => truthy(evalExpr(node.where, r)));
  }

  // ---- 3. PROJECT ----
  const projected = projectRows(rows, node.columns);

  // ---- 4. DISTINCT ----
  let result = projected;
  if (node.distinct) {
    const seen = new Set();
    result = projected.filter((r) => {
      const k = JSON.stringify(r);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  // ---- 5. ORDER BY ----
  if (node.orderBy) {
    const { key, dir } = node.orderBy;
    const sign = dir === 'DESC' ? -1 : 1;
    result = [...result].sort((a, b) => {
      const av = evalExpr(key, a);
      const bv = evalExpr(key, b);
      if (av == null && bv == null) return 0;
      if (av == null) return -1 * sign;
      if (bv == null) return 1 * sign;
      if (av < bv) return -1 * sign;
      if (av > bv) return 1 * sign;
      return 0;
    });
  }

  // ---- 6. OFFSET / LIMIT ----
  if (node.offset != null && node.offset > 0) result = result.slice(node.offset);
  if (node.limit != null) result = result.slice(0, node.limit);

  return {
    ok: true,
    kind: 'select',
    rowCount: result.length,
    rows: result,
  };
}

function projectRows(rows, columns) {
  return rows.map((row) => {
    // star
    if (columns.length === 1 && columns[0].expr.kind === 'Star') {
      return { ...row };
    }

    const out = {};
    for (const { expr, alias } of columns) {
      const name = alias || defaultColumnName(expr);
      out[name] = evalExpr(expr, row);
    }
    return out;
  });
}

function defaultColumnName(expr) {
  switch (expr.kind) {
    case 'ColumnRef': return expr.name;
    case 'Literal':   return '?column?';
    case 'FuncCall':  return expr.name.toLowerCase();
    case 'BinaryExpr':return '?column?';
    case 'CaseExpr':  return 'case';
    default:          return '?column?';
  }
}

function truthy(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.length > 0;
  return Boolean(v);
}