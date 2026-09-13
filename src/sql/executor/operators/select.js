import { evalExpr } from '../eval.js';

export function select(database, node) {
  // ---- 1. FROM ----
  let rows;
  if (!node.table) {
    rows = [{}];
  } else {
    const table = database.getTable(node.table);
    if (!table) throw new Error(`Table '${node.table}' not found`);
    // prefix columns with table name AND keep raw names
    rows = table.scanJSON().map((r) => prefixRow(r, node.table));
  }

  // ---- 2. JOINs ----
  for (const join of node.joins || []) {
    const rightTable = database.getTable(join.table);
    if (!rightTable) throw new Error(`Table '${join.table}' not found`);
    const right = rightTable.scanJSON().map((r) => prefixRow(r, join.table));
    rows = applyJoin(rows, right, join);
  }

  // ---- 3. WHERE ----
  if (node.where) rows = rows.filter((r) => truthy(evalExpr(node.where, r)));

  // ---- 4. GROUP BY / aggregates ----
  const hasAgg = node.columns.some((c) => containsAgg(c.expr))
              || (node.having && containsAgg(node.having));
  const isGrouped = !!node.groupBy || hasAgg;

  if (isGrouped) {
    return groupAndProject(rows, node);
  }

  // ---- 5. simple projection ----
  let result = project(rows, node.columns);

  if (node.distinct) result = dedup(result);
  if (node.orderBy)  result = sortRows(result, node.orderBy);
  if (node.offset)   result = result.slice(node.offset);
  if (node.limit != null) result = result.slice(0, node.limit);

  return { ok: true, kind: 'select', rowCount: result.length, rows: result };
}

// ---------- join helpers ----------
function prefixRow(row, tableName) {
  const out = { ...row };
  for (const [k, v] of Object.entries(row)) {
    out[`${tableName}.${k}`] = v;
  }
  return out;
}

function applyJoin(left, right, join) {
  const on = join.on;
  const out = [];

  if (join.type === 'CROSS') {
    for (const l of left) for (const r of right) out.push({ ...l, ...r });
    return out;
  }

  for (const l of left) {
    let matched = false;
    for (const r of right) {
      const merged = { ...l, ...r };
      if (!on || truthy(evalExpr(on, merged))) {
        out.push(merged);
        matched = true;
      }
    }
    if (!matched && join.type === 'LEFT') out.push({ ...l });
  }

  if (join.type === 'RIGHT') {
    // mirror: for rows on the right with no match, emit them
    const rightMatched = new Set();
    for (const l of left) {
      for (const r of right) {
        const merged = { ...l, ...r };
        if (!on || truthy(evalExpr(on, merged))) rightMatched.add(r);
      }
    }
    for (const r of right) {
      if (!rightMatched.has(r)) out.push({ ...r });
    }
  }

  return out;
}

// ---------- grouping ----------
function groupAndProject(rows, node) {
  const groupKeys = node.groupBy || [];
  const buckets = new Map();

  for (const row of rows) {
    const key = groupKeys.map((k) => JSON.stringify(evalExpr(k, row))).join('\u0001');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }

  if (groupKeys.length === 0 && rows.length === 0) {
    buckets.set('__single__', []);
  }

  const out = [];
  for (const [, groupRows] of buckets) {
    const sample = groupRows[0] || {};

    if (node.having) {
      const hVal = evalExpr(node.having, sample, groupRows);
      if (!truthy(hVal)) continue;
    }

    const o = {};
    for (const { expr, alias } of node.columns) {
      if (expr.kind === 'Star') {
        Object.assign(o, sample);
        continue;
      }
      const name = alias || defaultColumnName(expr);
      o[name] = evalExpr(expr, sample, groupRows);
    }
    out.push(o);
  }

  let result = out;
  if (node.distinct) result = dedup(result);
  if (node.orderBy)  result = sortRows(result, node.orderBy, groupContext(buckets, node));
  if (node.offset)   result = result.slice(node.offset);
  if (node.limit != null) result = result.slice(0, node.limit);

  return { ok: true, kind: 'select', rowCount: result.length, rows: result };
}

// For ORDER BY on grouped rows, we re-evaluate the sort key against the
// projected object — that's fine because aggregates have already been folded.
function groupContext() { return null; }

// ---------- projection ----------
function project(rows, columns) {
  return rows.map((row) => {
    if (columns.length === 1 && columns[0].expr.kind === 'Star') return { ...row };
    const o = {};
    for (const { expr, alias } of columns) {
      if (expr.kind === 'Star') { Object.assign(o, row); continue; }
      const name = alias || defaultColumnName(expr);
      o[name] = evalExpr(expr, row);
    }
    return o;
  });
}

function defaultColumnName(expr) {
  switch (expr.kind) {
    case 'ColumnRef': return expr.name;
    case 'FuncCall':  return expr.name.toLowerCase();
    case 'CaseExpr':  return 'case';
    default:          return '?column?';
  }
}

function dedup(rows) {
  const seen = new Set();
  return rows.filter((r) => {
    const k = JSON.stringify(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function sortRows(rows, { key, dir }) {
  const sign = dir === 'DESC' ? -1 : 1;
  return [...rows].sort((a, b) => {
    let av, bv;

    // Prefer projected keys when they exist on the object; otherwise eval.
    if (key.kind === 'ColumnRef' && key.name in a) {
      av = a[key.name];
      bv = b[key.name];
    } else {
      try {
        av = evalExpr(key, a);
        bv = evalExpr(key, b);
      } catch {
        // fallback: sort by projected name
        const k = key.kind === 'ColumnRef' ? key.name : null;
        av = k ? a[k] : null;
        bv = k ? b[k] : null;
      }
    }

    if (av == null && bv == null) return 0;
    if (av == null) return -1 * sign;
    if (bv == null) return 1 * sign;
    if (av < bv) return -1 * sign;
    if (av > bv) return 1 * sign;
    return 0;
  });
}

// ---------- misc ----------
function containsAgg(expr) {
  if (!expr) return false;
  if (expr.kind === 'FuncCall' && ['COUNT','SUM','AVG','MIN','MAX'].includes(expr.name.toUpperCase())) return true;
  if (expr.kind === 'BinaryExpr') return containsAgg(expr.left) || containsAgg(expr.right);
  if (expr.kind === 'UnaryExpr')  return containsAgg(expr.expr);
  if (expr.kind === 'CaseExpr')   return expr.branches.some((b) => containsAgg(b.cond) || containsAgg(b.val))
                                      || containsAgg(expr.elseExpr);
  return false;
}

function truthy(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.length > 0;
  return Boolean(v);
}