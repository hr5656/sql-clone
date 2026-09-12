/**
 * Evaluate an AST expression against a row (plain JS object).
 * If `row` is null, only literals and pure arithmetic are allowed.
 */
export function evalExpr(expr, row) {
  if (expr == null) return null;

  switch (expr.kind) {
    case 'Literal':
      return expr.value;

    case 'ColumnRef':
      if (!row) throw new Error(`Column '${expr.name}' referenced without FROM`);
      if (!(expr.name in row)) throw new Error(`Unknown column '${expr.name}'`);
      return row[expr.name];

    case 'Star':
      // Star is handled by the projector, not the evaluator.
      throw new Error('Star is not an evaluable expression');

    case 'UnaryExpr': {
      const v = evalExpr(expr.expr, row);
      switch (expr.op) {
        case '-':   return -v;
        case '+':   return +v;
        case 'NOT': return !v;
        default: throw new Error(`Unknown unary op '${expr.op}'`);
      }
    }

    case 'BinaryExpr':
      return evalBinary(expr, row);

    case 'FuncCall':
      return evalFunction(expr, row);

    case 'CaseExpr': {
      for (const { cond, val } of expr.branches) {
        if (evalExpr(cond, row)) return evalExpr(val, row);
      }
      return expr.elseExpr ? evalExpr(expr.elseExpr, row) : null;
    }
  }

  throw new Error(`Cannot evaluate expression kind '${expr.kind}'`);
}

function evalBinary(expr, row) {
  const op = expr.op;

  // short-circuit AND / OR
  if (op === 'AND') return evalExpr(expr.left, row) && evalExpr(expr.right, row);
  if (op === 'OR')  return evalExpr(expr.left, row) || evalExpr(expr.right, row);

  const l = evalExpr(expr.left, row);
  const r = evalExpr(expr.right, row);

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
  // If either side is a string, concatenate.
  if (typeof a === 'string' || typeof b === 'string') return String(a) + String(b);
  return fn(Number(a), Number(b));
}

function evalFunction(expr, row) {
  const name = expr.name.toUpperCase();
  // Aggregates are handled in the executor (Phase 5). If we get here, they
  // were used in a scalar context — evaluate over a single value.
  if (['COUNT','SUM','AVG','MIN','MAX'].includes(name)) {
    const args = expr.args.map((a) => evalExpr(a, row));
    switch (name) {
      case 'COUNT': return args.filter((v) => v != null).length;
      case 'SUM':   return args.reduce((s, v) => s + Number(v || 0), 0);
      case 'AVG':   return args.length ? args.reduce((s, v) => s + Number(v || 0), 0) / args.length : 0;
      case 'MIN':   return args.length ? Math.min(...args.map(Number)) : null;
      case 'MAX':   return args.length ? Math.max(...args.map(Number)) : null;
    }
  }
  throw new Error(`Unknown function '${expr.name}'`);
}

