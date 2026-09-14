/**
 * Returns:
 *   { kind: 'full-scan', table, where? }
 *   { kind: 'hash-lookup', table, column, value, predicate }
 *   { kind: 'btree-lookup', table, column, value, predicate }
 *   { kind: 'range-scan', table, column, op, value, predicate }
 */
export function planAccess(tableName, node, indexManager) {
  if (!node.where) return { kind: 'full-scan', table: tableName };

  // Bail out to full-scan when the WHERE contains a subquery — the index
  // path would need ctx to evaluate it, and indices don't help anyway.
  if (containsSubquery(node.where)) {
    return { kind: 'full-scan', table: tableName, where: node.where };
  }

  const pred = extractSimplePredicate(node.where);

  if (pred && pred.kind === 'eq') {
    const idx = indexManager.get(tableName, pred.column);
    if (idx) {
      return {
        kind: idx.constructor.name === 'HashIndex' ? 'hash-lookup' : 'btree-lookup',
        table: tableName,
        column: pred.column,
        value: pred.value,
        predicate: node.where,
      };
    }
  }

  if (pred && pred.kind === 'range') {
    const idx = indexManager.get(tableName, pred.column);
    if (idx && idx.constructor.name === 'BTreeIndex') {
      return {
        kind: 'range-scan',
        table: tableName,
        column: pred.column,
        op: pred.op,
        value: pred.value,
        predicate: node.where,
      };
    }
  }

  return { kind: 'full-scan', table: tableName, where: node.where };
}

/**
 * Detects patterns like:
 *   col = 5
 *   5 = col
 *   col > 5     col >= 5     col < 5     col <= 5
 * Returns { kind: 'eq'|'range', column, op, value } or null.
 */
function extractSimplePredicate(expr) {
  if (!expr || expr.kind !== 'BinaryExpr') return null;
  const { op, left, right } = expr;

  const isCol = (e) => e && e.kind === 'ColumnRef';
  const isLit = (e) => e && e.kind === 'Literal';

  if (op === '=') {
    if (isCol(left) && isLit(right)) return { kind: 'eq', column: left.name, value: right.value };
    if (isLit(left) && isCol(right)) return { kind: 'eq', column: right.name, value: left.value };
    return null;
  }

  if (['<', '<=', '>', '>='].includes(op)) {
    if (isCol(left) && isLit(right)) return { kind: 'range', column: left.name, op, value: right.value };
    // normalize: 5 > col  →  col < 5
    if (isLit(left) && isCol(right)) {
      const flipped = { '<': '>', '<=': '>=', '>': '<', '>=': '<=' }[op];
      return { kind: 'range', column: right.name, op: flipped, value: left.value };
    }
    return null;
  }

  return null;
}

/**
 * True if the expression tree contains any subquery node.
 */
function containsSubquery(expr) {
  if (!expr) return false;

  switch (expr.kind) {
    case 'Subquery':
    case 'InSubquery':
    case 'Exists':
      return true;

    case 'BinaryExpr':
      return containsSubquery(expr.left) || containsSubquery(expr.right);

    case 'UnaryExpr':
      return containsSubquery(expr.expr);

    case 'InList':
      return containsSubquery(expr.expr) || expr.list.some(containsSubquery);

    case 'IsNull':
      return containsSubquery(expr.expr);

    case 'CaseExpr':
      return expr.branches.some((b) => containsSubquery(b.cond) || containsSubquery(b.val))
          || containsSubquery(expr.elseExpr);

    case 'FuncCall':
      return expr.args.some(containsSubquery);

    case 'WindowFunc':
      return expr.args.some(containsSubquery)
          || expr.partitionBy.some(containsSubquery)
          || containsSubquery(expr.orderBy);

    default:
      return false;
  }
}