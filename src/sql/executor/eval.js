export function evalExpr(expr, row, group = null, ctx = null) {
  if (expr == null) return null;

  switch (expr.kind) {
    case 'Literal': return expr.value;

    case 'ColumnRef':
      if (!row) throw new Error(`Column '${expr.name}' referenced without FROM`);
      if (!(expr.name in row)) throw new Error(`Unknown column '${expr.name}'`);
      return row[expr.name];

    case 'Star':
      throw new Error('Star is not an evaluable expression');

    case 'UnaryExpr': {
      const v = evalExpr(expr.expr, row, group, ctx);
      switch (expr.op) {
        case '-':   return -v;
        case '+':   return +v;
        case 'NOT': return !v;
        default: throw new Error(`Unknown unary op '${expr.op}'`);
      }
    }

    case 'BinaryExpr':
      return evalBinary(expr, row, group, ctx);

    case 'FuncCall':
      return evalFunc(expr, row, group, ctx);

    case 'CaseExpr': {
      for (const { cond, val } of expr.branches) {
        if (evalExpr(cond, row, group, ctx)) return evalExpr(val, row, group, ctx);
      }
      return expr.elseExpr ? evalExpr(expr.elseExpr, row, group, ctx) : null;
    }

    case 'Subquery': {
      if (!ctx || !ctx.runSubquery) throw new Error('Subqueries need a database context');
      const result = ctx.runSubquery(expr.query, row);
      // scalar: first row, first column
      if (!result || result.rows.length === 0) return null;
      return Object.values(result.rows[0])[0];
    }

    case 'InSubquery': {
      if (!ctx || !ctx.runSubquery) throw new Error('Subqueries need a database context');
      const v = evalExpr(expr.expr, row, group, ctx);
      const result = ctx.runSubquery(expr.query, row);
      const vals = result.rows.map((r) => Object.values(r)[0]);
      return vals.includes(v);
    }

    case 'InList': {
      const v = evalExpr(expr.expr, row, group, ctx);
      return expr.list.some((e) => evalExpr(e, row, group, ctx) === v);
    }

    case 'Exists': {
      if (!ctx || !ctx.runSubquery) throw new Error('EXISTS needs a database context');
      const result = ctx.runSubquery(expr.query, row);
      const has = result.rows.length > 0;
      return expr.negated ? !has : has;
    }

    case 'IsNull': {
      const v = evalExpr(expr.expr, row, group, ctx);
      const isNull = v === null || v === undefined;
      return expr.negated ? !isNull : isNull;
    }
  }
  throw new Error(`Cannot evaluate expression kind '${expr.kind}'`);
}

function evalBinary(expr, row, group, ctx) {
  const op = expr.op;
  if (op === 'AND') return evalExpr(expr.left, row, group, ctx) && evalExpr(expr.right, row, group, ctx);
  if (op === 'OR')  return evalExpr(expr.left, row, group, ctx) || evalExpr(expr.right, row, group, ctx);

  const l = evalExpr(expr.left, row, group, ctx);
  const r = evalExpr(expr.right, row, group, ctx);

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

function evalFunc(expr, row, group, ctx) {
  const name = expr.name.toUpperCase();

  if (['COUNT','SUM','AVG','MIN','MAX'].includes(name)) {
    const rows = group || (row ? [row] : []);

    if (name === 'COUNT') {
      if (expr.args.length === 1 && expr.args[0].kind === 'Star') return rows.length;
      return rows.filter((r) => evalExpr(expr.args[0], r, null, ctx) != null).length;
    }

    const values = rows.map((r) => evalExpr(expr.args[0], r, null, ctx)).filter((v) => v != null);
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