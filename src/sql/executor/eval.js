/**
 * Evaluate an expression against a row.
 * - `row` is a plain object.
 * - `group` (optional) is the array of rows for aggregate context.
 * - Aggregates inside `expr` use `group` if provided, else treat row as singleton group.
 */
export function evalExpr(expr, row, group = null) {
  if (expr == null) return null;

  switch (expr.kind) {
    case 'Literal':   return expr.value;
    case 'ColumnRef':
      if (!row) throw new Error(`Column '${expr.name}' referenced without FROM`);
      if (!(expr.name in row)) throw new Error(`Unknown column '${expr.name}'`);
      return row[expr.name];

    case 'Star':
      throw new Error('Star is not an evaluable expression');

    case 'UnaryExpr': {
      const v = evalExpr(expr.expr, row, group);
      switch (expr.op) {
        case '-':   return -v;
        case '+':   return +v;
        case 'NOT': return !v;
        default: throw new Error(`Unknown unary op '${expr.op}'`);
      }
    }

    case 'BinaryExpr':
      return evalBinary(expr, row, group);

    case 'FuncCall':
      return evalFunc(expr, row, group);

    case 'CaseExpr': {
      for (const { cond, val } of expr.branches) {
        if (evalExpr(cond, row, group)) return evalExpr(val, row, group);
      }
      return expr.elseExpr ? evalExpr(expr.elseExpr, row, group) : null;
    }
  }
  throw new Error(`Cannot evaluate expression kind '${expr.kind}'`);
}

function evalBinary(expr, row, group) {
  const op = expr.op;
  if (op === 'AND') return evalExpr(expr.left, row, group) && evalExpr(expr.right, row, group);
  if (op === 'OR')  return evalExpr(expr.left, row, group) || evalExpr(expr.right, row, group);

  const l = evalExpr(expr.left, row, group);
  const r = evalExpr(expr.right, row, group);

  switch (op) {
    case '=':  return looseEq(l, r);
    case '!=':
    case '<>': return !looseEq(l, r);
    case '<':  return l < r;
    case '<=': return l <= r;
    case '>':  return l > r;
    case '>=': return l >= r;
    case '+':  return numericOrConcat(l, r, (a, b) => a + b);
    case '-':  return Number(l) - Number(r);
    case '*':  return Number(l) * Number(r);
    case '/':  return Number(l) / Number(r);
    case '%':  return Number(l) % Number(r);
    default: throw new Error(`Unknown binary op '${op}'`);
  }
}

function looseEq(a, b) {
  if (a === null || b === null) return a === b;
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  return String(a) === String(b) || a === b;
}

function numericOrConcat(a, b, fn) {
  if (typeof a === 'string' || typeof b === 'string') return String(a) + String(b);
  return fn(Number(a), Number(b));
}

function evalFunc(expr, row, group) {
  const name = expr.name.toUpperCase();

  if (['COUNT','SUM','AVG','MIN','MAX'].includes(name)) {
    const rows = group || (row ? [row] : []);

    if (name === 'COUNT') {
      if (expr.args.length === 1 && expr.args[0].kind === 'Star') return rows.length;
      const col = expr.args[0];
      return rows.filter((r) => evalExpr(col, r, null) != null).length;
    }

    const col = expr.args[0];
    const values = rows.map((r) => evalExpr(col, r, null)).filter((v) => v != null);
    if (values.length === 0) return null;

    switch (name) {
      case 'SUM': return values.reduce((s, v) => s + Number(v), 0);
      case 'AVG': return values.reduce((s, v) => s + Number(v), 0) / values.length;
      case 'MIN': return values.reduce((m, v) => (v < m ? v : m));
      case 'MAX': return values.reduce((m, v) => (v > m ? v : m));
    }
  }

  throw new Error(`Unknown function '${expr.name}'`);
}