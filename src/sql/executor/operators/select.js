import { evalExpr } from '../eval.js';
import { planAccess } from '../optimizer.js';

export function select(database, node, cteContext = {}, outerRow = null) {
  // ---- 0. WITH (CTEs) ----
  if (node.with_) {
    for (const { name, query } of node.with_) {
      const result = select(database, query, cteContext, outerRow);
      cteContext[name] = result.rows;
    }
  }

  // ---- Context for subqueries ----
  const ctx = {
    runSubquery: (q, row) => {
      const merged = outerRow
        ? { ...cteContext, __outer__: outerRow }
        : { ...cteContext };
      return select(database, q, merged, outerRow);
    },
  };

  // ---- 1. FROM ----
  let rows;
  const hasJoins = (node.joins || []).length > 0;

  if (!node.table) {
    rows = [{}];
  } else if (cteContext[node.table]) {
    rows = cteContext[node.table].map((r) => ({ ...r }));
  } else {
    const table = database.getTable(node.table);
    if (!table) throw new Error(`Table '${node.table}' not found`);

    // When there are joins, defer WHERE to after the join is applied —
    // accessRows would filter out rows whose joined columns don't exist yet.
    if (hasJoins) {
      rows = table.scanJSON().map((r) => prefixRow(r, node.table));
    } else {
      const access = planAccess(node.table, node, database.indexes);
      rows = accessRows(access, table, node.table, database.indexes, ctx);
    }
  }

  if (outerRow) {
    rows = rows.map((r) => ({ ...outerRow, ...r }));
  }

  // ---- 2. JOINs ----
  for (const join of node.joins || []) {
    let right;
    if (cteContext[join.table]) {
      right = cteContext[join.table].map((r) => ({ ...r }));
    } else {
      const rightTable = database.getTable(join.table);
      if (!rightTable) throw new Error(`Table '${join.table}' not found`);
      right = rightTable.scanJSON().map((r) => prefixRow(r, join.table));
    }
    rows = applyJoin(rows, right, join, ctx);
  }

  // ---- 3. WHERE ----
  if (node.where) rows = rows.filter((r) => truthy(evalExpr(node.where, r, null, ctx)));

  // ---- 4. Window functions ----
  const hasWindow = node.columns.some((c) => containsWindow(c.expr));
  if (hasWindow) return runWindowQuery(rows, node, ctx);

  // ---- 5. GROUP BY / aggregates ----
  const hasAgg = node.columns.some((c) => containsAgg(c.expr))
              || (node.having && containsAgg(node.having));
  const isGrouped = !!node.groupBy || hasAgg;

  if (isGrouped) return groupAndProject(rows, node, ctx);

   // ---- 6. sort BEFORE projection so ORDER BY can see any source column ----
  let sortedRows = rows;
  if (node.orderBy) sortedRows = sortSourceRows(sortedRows, node.orderBy, ctx);

  // ---- 7. simple projection ----
  const cleanStar = (node.joins || []).length === 0;
  let result = project(sortedRows, node.columns, ctx, cleanStar);

  if (node.distinct) result = dedup(result);
  if (node.offset)   result = result.slice(node.offset);
  if (node.limit != null) result = result.slice(0, node.limit);


  return { ok: true, kind: 'select', rowCount: result.length, rows: result };
}

/* ============================================================
   JOIN helpers
   ============================================================ */
function prefixRow(row, tableName) {
  const out = { ...row };
  for (const [k, v] of Object.entries(row)) {
    out[`${tableName}.${k}`] = v;
  }
  return out;
}

function applyJoin(left, right, join, ctx) {
  const on = join.on;
  const out = [];

  // Collect all keys present on either side, so unmatched rows can be padded with null
  const rightKeys = new Set();
  for (const r of right) for (const k of Object.keys(r)) rightKeys.add(k);

  if (join.type === 'CROSS') {
    for (const l of left) for (const r of right) out.push({ ...l, ...r });
    return out;
  }

  for (const l of left) {
    let matched = false;
    for (const r of right) {
      const merged = { ...l, ...r };
      if (!on || truthy(evalExpr(on, merged, null, ctx))) {
        out.push(merged);
        matched = true;
      }
    }
    if (!matched && join.type === 'LEFT') {
      const padded = { ...l };
      for (const k of rightKeys) if (!(k in padded)) padded[k] = null;
      out.push(padded);
    }
  }

  if (join.type === 'RIGHT') {
    const rightMatched = new Set();
    for (const l of left) {
      for (const r of right) {
        const merged = { ...l, ...r };
        if (!on || truthy(evalExpr(on, merged, null, ctx))) rightMatched.add(r);
      }
    }
    const leftKeys = new Set();
    for (const l of left) for (const k of Object.keys(l)) leftKeys.add(k);
    for (const r of right) {
      if (!rightMatched.has(r)) {
        const padded = { ...r };
        for (const k of leftKeys) if (!(k in padded)) padded[k] = null;
        out.push(padded);
      }
    }
  }

  return out;
}

/* ============================================================
   GROUP BY
   ============================================================ */
function groupAndProject(rows, node, ctx) {
  const groupKeys = node.groupBy || [];
  const buckets = new Map();

  for (const row of rows) {
    const key = groupKeys.map((k) => JSON.stringify(evalExpr(k, row, null, ctx))).join('\u0001');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }

  if (groupKeys.length === 0 && rows.length === 0) {
    buckets.set('__single__', []);
  }

  const cleanStar = (node.joins || []).length === 0;
  const out = [];
  for (const [, groupRows] of buckets) {
    const sample = groupRows[0] || {};

    if (node.having) {
      const hVal = evalExpr(node.having, sample, groupRows, ctx);
      if (!truthy(hVal)) continue;
    }

    const o = {};
    for (const { expr, alias } of node.columns) {
      if (expr.kind === 'Star') {
        for (const [k, v] of Object.entries(sample)) {
          if (!cleanStar || !k.includes('.')) o[k] = v;
        }
        continue;
      }
      const name = alias || defaultColumnName(expr);
      o[name] = evalExpr(expr, sample, groupRows, ctx);
    }
    out.push(o);
  }

  let result = out;
  if (node.distinct) result = dedup(result);
  if (node.orderBy)  result = sortRows(result, node.orderBy, ctx);
  if (node.offset)   result = result.slice(node.offset);
  if (node.limit != null) result = result.slice(0, node.limit);

  return { ok: true, kind: 'select', rowCount: result.length, rows: result };
}

/* ============================================================
   WINDOW FUNCTIONS
   ============================================================ */
function runWindowQuery(rows, node, ctx) {
  const windowValues = new Map();

  for (let ci = 0; ci < node.columns.length; ci++) {
    const col = node.columns[ci];
    if (!containsWindow(col.expr)) continue;
    windowValues.set(ci, computeWindow(col.expr, rows, ctx));
  }

  const cleanStar = (node.joins || []).length === 0;
  const projected = rows.map((row, rowIdx) => {
    const o = {};
    for (let ci = 0; ci < node.columns.length; ci++) {
      const { expr, alias } = node.columns[ci];
      if (expr.kind === 'Star') {
        for (const [k, v] of Object.entries(row)) {
          if (!cleanStar || !k.includes('.')) o[k] = v;
        }
        continue;
      }

      const name = alias || defaultColumnName(expr);
      if (windowValues.has(ci)) o[name] = windowValues.get(ci)[rowIdx];
      else o[name] = evalExpr(expr, row, null, ctx);
    }
    return o;
  });

  let result = projected;
  if (node.distinct) result = dedup(result);
  if (node.orderBy)  result = sortRows(result, node.orderBy, ctx);
  if (node.offset)   result = result.slice(node.offset);
  if (node.limit != null) result = result.slice(0, node.limit);

  return { ok: true, kind: 'select', rowCount: result.length, rows: result };
}

function computeWindow(expr, rows, ctx) {
  const { name, partitionBy, orderBy, dir } = expr;
  const result = new Array(rows.length);

  const partitions = new Map();
  rows.forEach((r, i) => {
    const key = partitionBy.length
      ? partitionBy.map((k) => JSON.stringify(evalExpr(k, r, null, ctx))).join('\u0001')
      : '__single__';
    if (!partitions.has(key)) partitions.set(key, []);
    partitions.get(key).push(i);
  });

  for (const [, indices] of partitions) {
    if (orderBy) {
      indices.sort((a, b) => {
        const av = resolveSortKey(orderBy, rows[a], ctx);
        const bv = resolveSortKey(orderBy, rows[b], ctx);
        if (av == null && bv == null) return 0;
        if (av == null) return -1;
        if (bv == null) return 1;
        if (av < bv) return dir === 'DESC' ? 1 : -1;
        if (av > bv) return dir === 'DESC' ? -1 : 1;
        return 0;
      });
    }

    if (name === 'ROW_NUMBER') {
      indices.forEach((i, pos) => { result[i] = pos + 1; });
    } else if (name === 'RANK') {
      let rank = 0, lastVal = Symbol('none');
      indices.forEach((i, pos) => {
        const v = orderBy ? resolveSortKey(orderBy, rows[i], ctx) : pos;
        if (v !== lastVal) { rank = pos + 1; lastVal = v; }
        result[i] = rank;
      });
    } else if (name === 'DENSE_RANK') {
      let rank = 0, lastVal = Symbol('none');
      indices.forEach((i) => {
        const v = orderBy ? resolveSortKey(orderBy, rows[i], ctx) : 0;
        if (v !== lastVal) { rank++; lastVal = v; }
        result[i] = rank;
      });
    } else if (['SUM','COUNT','AVG','MIN','MAX'].includes(name)) {
      const vals = indices.map((i) => {
        if (name === 'COUNT' && expr.args[0]?.kind === 'Star') return 1;
        return evalExpr(expr.args[0], rows[i], null, ctx);
      }).filter((v) => v != null);

      let v;
      if (name === 'COUNT') v = vals.length;
      else if (name === 'SUM') v = vals.reduce((s, x) => s + Number(x), 0);
      else if (name === 'AVG') v = vals.length ? vals.reduce((s, x) => s + Number(x), 0) / vals.length : null;
      else if (name === 'MIN') v = vals.length ? vals.reduce((m, x) => (x < m ? x : m)) : null;
      else if (name === 'MAX') v = vals.length ? vals.reduce((m, x) => (x > m ? x : m)) : null;

      indices.forEach((i) => { result[i] = v; });
    }
  }

  return result;
}

/** Resolve ORDER BY key names even when rows are prefixed or bare. */
function resolveSortKey(key, row, ctx) {
  if (key.kind === 'ColumnRef') {
    // Try exact, then prefixed variants
    if (key.name in row) return row[key.name];
    for (const k of Object.keys(row)) {
      if (k.endsWith(`.${key.name}`)) return row[k];
    }
    return null;
  }
  return evalExpr(key, row, null, ctx);
}


function containsWindow(expr) {
  if (!expr) return false;
  if (expr.kind === 'WindowFunc') return true;
  if (expr.kind === 'BinaryExpr') return containsWindow(expr.left) || containsWindow(expr.right);
  if (expr.kind === 'UnaryExpr')  return containsWindow(expr.expr);
  if (expr.kind === 'FuncCall')   return expr.args.some(containsWindow);
  return false;
}

/* ============================================================
   PROJECTION  ← THE FIX
   ============================================================ */
function project(rows, columns, ctx, cleanStar = true) {
  return rows.map((row) => {
    if (columns.length === 1 && columns[0].expr.kind === 'Star') {
      if (!cleanStar) return { ...row };
      const out = {};
      for (const [k, v] of Object.entries(row)) {
        if (!k.includes('.')) out[k] = v;
      }
      return out;
    }
    const o = {};
    for (const { expr, alias } of columns) {
      if (expr.kind === 'Star') {
        for (const [k, v] of Object.entries(row)) {
          if (!cleanStar || !k.includes('.')) o[k] = v;
        }
        continue;
      }
      const name = alias || defaultColumnName(expr);
      o[name] = evalExpr(expr, row, null, ctx);
    }
    return o;
  });
}

function defaultColumnName(expr) {
  switch (expr.kind) {
    case 'ColumnRef':  return expr.name;
    case 'FuncCall':   return expr.name.toLowerCase();
    case 'WindowFunc': return expr.name.toLowerCase();
    case 'CaseExpr':   return 'case';
    case 'Subquery':   return 'subquery';
    default:           return '?column?';
  }
}

/* ============================================================
   MISC
   ============================================================ */
function dedup(rows) {
  const seen = new Set();
  return rows.filter((r) => {
    const k = JSON.stringify(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function sortRows(rows, { key, dir }, ctx) {
  const sign = dir === 'DESC' ? -1 : 1;
  return [...rows].sort((a, b) => {
    let av, bv;

    if (key.kind === 'ColumnRef' && key.name in a) {
      av = a[key.name];
      bv = b[key.name];
    } else {
      try {
        av = evalExpr(key, a, null, ctx);
        bv = evalExpr(key, b, null, ctx);
      } catch {
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

/* ============================================================
   INDEX-AWARE ACCESS
   ============================================================ */
function accessRows(access, table, tableName, indexManager, ctx = {}) {
  const toRow = (id) => prefixRow(table.rows[id].toJSON(), tableName);

  const applyPredicate = (rows, predicate) => {
    if (!predicate) return rows;
    try {
      return rows.filter((r) => truthy(evalExpr(predicate, r, null, ctx)));
    } catch {
      return null;
    }
  };

  if (access.kind === 'hash-lookup' || access.kind === 'btree-lookup') {
    const idx = indexManager.get(tableName, access.column);
    if (idx) {
      const ids = idx.find(access.value);
      const result = ids.map(toRow);
      const filtered = applyPredicate(result, access.predicate);
      if (filtered === null) return fullScan(table, tableName, access.where, ctx);
      return filtered;
    }
  }

  if (access.kind === 'range-scan') {
    const idx = indexManager.get(tableName, access.column);
    if (idx) {
      const v = access.value;
      let ids;
      switch (access.op) {
        case '<':  ids = idx.lessThan(v, false); break;
        case '<=': ids = idx.lessThan(v, true);  break;
        case '>':  ids = idx.greaterThan(v, false); break;
        case '>=': ids = idx.greaterThan(v, true);  break;
        default:   ids = [];
      }
      const result = ids.map(toRow);
      const filtered = applyPredicate(result, access.predicate);
      if (filtered === null) return fullScan(table, tableName, access.where, ctx);
      return filtered;
    }
  }

  return fullScan(table, tableName, access.where, ctx);
}

function fullScan(table, tableName, predicate, ctx) {
  let result = table.scanJSON().map((r) => prefixRow(r, tableName));
  if (predicate) result = result.filter((r) => truthy(evalExpr(predicate, r, null, ctx)));
  return result;
}
function sortSourceRows(rows, { key, dir }, ctx) {
  const sign = dir === 'DESC' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = evalExpr(key, a, null, ctx);
    const bv = evalExpr(key, b, null, ctx);
    if (av == null && bv == null) return 0;
    if (av == null) return -1 * sign;
    if (bv == null) return 1 * sign;
    if (av < bv) return -1 * sign;
    if (av > bv) return 1 * sign;
    return 0;
  });
}