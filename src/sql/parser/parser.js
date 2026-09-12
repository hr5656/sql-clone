import { Lexer } from '../lexer/lexer.js';
import { TokenType } from '../lexer/token.js';
import { ParseError } from '../../common/errors.js';
import * as AST from '../ast/statements.js';
import { Expr } from '../ast/expressions.js';

// --- operator precedence (higher = binds tighter) ---
const BINOP_BP = {
  'OR': 5,
  'AND': 10,
  '=': 20, '!=': 20, '<>': 20, '<': 20, '<=': 20, '>': 20, '>=': 20,
  '+': 30, '-': 30,
  '*': 40, '/': 40, '%': 40,
};

export class Parser {
  constructor(input) {
    this.tokens = new Lexer(input).tokenize();
    this.pos = 0;
  }

  // ---------- token helpers ----------
  peek(off = 0) { return this.tokens[this.pos + off]; }
  next() { return this.tokens[this.pos++]; }
  is(value) { return this.peek().value === value; }
  isType(type) { return this.peek().type === type; }

  expect(value) {
    const t = this.next();
    if (t.value !== value) throw new ParseError(`Expected '${value}', got '${t.value}' at ${t.pos}`);
    return t;
  }
  expectType(type) {
    const t = this.next();
    if (t.type !== type) throw new ParseError(`Expected ${type}, got ${t.type}('${t.value}') at ${t.pos}`);
    return t;
  }

  // ---------- entry ----------
  parse() {
    const t = this.peek();
    switch (t.value) {
      case 'CREATE': return this.parseCreate();
      case 'INSERT': return this.parseInsert();
      case 'SELECT': return this.parseSelect();
      case 'UPDATE': return this.parseUpdate();
      case 'DELETE': return this.parseDelete();
      default: throw new ParseError(`Unsupported statement starting with '${t.value}'`);
    }
  }

  // ---------- CREATE TABLE ----------
  parseCreate() {
    this.expect('CREATE');
    this.expect('TABLE');
    const name = this.expectType(TokenType.IDENT).value;
    this.expect('(');

    const columns = [];
    while (!this.is(')')) {
      const colName = this.expectType(TokenType.IDENT).value;
      const colType = this.next().value;
      const col = { name: colName, type: colType, nullable: true, primaryKey: false, defaultValue: null };

      while (this.is('NOT') || this.is('NULL') || this.is('PRIMARY') || this.is('UNIQUE') || this.is('DEFAULT')) {
        if (this.is('NOT'))      { this.next(); this.expect('NULL'); col.nullable = false; }
        else if (this.is('NULL')){ this.next(); col.nullable = true; }
        else if (this.is('PRIMARY')) { this.next(); this.expect('KEY'); col.primaryKey = true; col.nullable = false; }
        else if (this.is('UNIQUE'))  { this.next(); col.unique = true; }
        else if (this.is('DEFAULT')) {
          this.next();
          const t = this.next();
          col.defaultValue = t.value;
        }
      }
      columns.push(col);
      if (this.is(',')) this.next();
    }
    this.expect(')');
    if (this.is(';')) this.next();
    return new AST.CreateTable(name, columns);
  }

  // ---------- INSERT ----------
  parseInsert() {
    this.expect('INSERT');
    this.expect('INTO');
    const table = this.expectType(TokenType.IDENT).value;

    let columns = null;
    if (this.is('(')) {
      this.next();
      columns = [];
      while (!this.is(')')) {
        columns.push(this.expectType(TokenType.IDENT).value);
        if (this.is(',')) this.next();
      }
      this.expect(')');
    }

    this.expect('VALUES');

    const rows = [];
    do {
      this.expect('(');
      const values = [];
      while (!this.is(')')) {
        values.push(this.parseExpr()); // full expression support
        if (this.is(',')) this.next();
      }
      this.expect(')');
      rows.push(values);
    } while (this.is(','));

    if (this.is(';')) this.next();
    return new AST.Insert(table, columns, rows);
  }

  // ---------- SELECT ----------
  parseSelect() {
    this.expect('SELECT');

    let distinct = false;
    if (this.is('DISTINCT')) { this.next(); distinct = true; }

    // select list
    const columns = [];
    while (!this.is('FROM') && !this.is(';') && !this.isType(TokenType.EOF)) {
      // star
      if (this.is('*')) { this.next(); columns.push({ expr: Expr.star(), alias: null }); }
      else {
        const expr = this.parseExpr();
        let alias = null;
        if (this.is('AS')) { this.next(); alias = this.expectType(TokenType.IDENT).value; }
        columns.push({ expr, alias });
      }
      if (this.is(',')) this.next(); else break;
    }

    // no FROM → constant select
    if (!this.is('FROM')) {
      if (this.is(';')) this.next();
      const stmt = new AST.Select(columns, null);
      stmt.distinct = distinct;
      return stmt;
    }

    this.expect('FROM');
    const table = this.expectType(TokenType.IDENT).value;
    const stmt = new AST.Select(columns, table);
    stmt.distinct = distinct;

    // WHERE
    if (this.is('WHERE')) {
      this.next();
      stmt.where = this.parseExpr();
    }

    // ORDER BY
    if (this.is('ORDER')) {
      this.next();
      this.expect('BY');
      const key = this.parseExpr();
      let dir = 'ASC';
      if (this.is('ASC')) { this.next(); }
      else if (this.is('DESC')) { this.next(); dir = 'DESC'; }
      stmt.orderBy = { key, dir };
    }

    // LIMIT
    if (this.is('LIMIT')) {
      this.next();
      stmt.limit = this.expectType(TokenType.NUMBER).value;
    }

    // OFFSET
    if (this.is('OFFSET')) {
      this.next();
      stmt.offset = this.expectType(TokenType.NUMBER).value;
    }

    if (this.is(';')) this.next();
    return stmt;
  }

  // ---------- UPDATE ----------
  parseUpdate() {
    this.expect('UPDATE');
    const table = this.expectType(TokenType.IDENT).value;
    this.expect('SET');

    const assignments = [];
    do {
      const col = this.expectType(TokenType.IDENT).value;
      this.expect('=');
      const val = this.parseExpr();
      assignments.push([col, val]);
    } while (this.is(',') && this.next());

    let where = null;
    if (this.is('WHERE')) { this.next(); where = this.parseExpr(); }

    if (this.is(';')) this.next();
    return new AST.Update(table, assignments, where);
  }

  // ---------- DELETE ----------
  parseDelete() {
    this.expect('DELETE');
    this.expect('FROM');
    const table = this.expectType(TokenType.IDENT).value;

    let where = null;
    if (this.is('WHERE')) { this.next(); where = this.parseExpr(); }

    if (this.is(';')) this.next();
    return new AST.Delete(table, where);
  }

  // ---------- Pratt expression parser ----------
  parseExpr(minBP = 0) {
    let left = this.parseUnary();

    while (true) {
      const t = this.peek();
      const op = t.value;
      const bp = BINOP_BP[op];
      if (bp === undefined || bp < minBP) break;

      this.next();
      const right = this.parseExpr(bp + 1);
      left = Expr.binary(op, left, right);
    }
    return left;
  }

  parseUnary() {
    const t = this.peek();
    if (t.value === '-' || t.value === '+' || t.value === 'NOT') {
      this.next();
      return Expr.unary(t.value, this.parseUnary());
    }
    return this.parseAtom();
  }

  parseAtom() {
    const t = this.next();

    if (t.type === TokenType.NUMBER) return Expr.literal(t.value);
    if (t.type === TokenType.STRING) return Expr.literal(t.value);
    if (t.value === 'NULL')  return Expr.literal(null);
    if (t.value === 'TRUE')  return Expr.literal(true);
    if (t.value === 'FALSE') return Expr.literal(false);

    // CASE WHEN
    if (t.value === 'CASE') return this.parseCase();

    // function call (COUNT, SUM, ...)
    if (t.type === TokenType.IDENT || t.type === TokenType.KEYWORD) {
      if (this.is('(') && ['COUNT','SUM','AVG','MIN','MAX'].includes(t.value)) {
        this.next(); // (
        const args = [];
        if (!this.is(')')) {
          do { args.push(this.parseExpr()); } while (this.is(',') && this.next());
        }
        this.expect(')');
        return Expr.func(t.value, args);
      }
      return Expr.column(t.value);
    }

    // parenthesized
    if (t.value === '(') {
      const e = this.parseExpr();
      this.expect(')');
      return e;
    }

    throw new ParseError(`Unexpected token in expression: '${t.value}' at ${t.pos}`);
  }

  parseCase() {
    const branches = [];
    let elseExpr = null;

    while (this.is('WHEN')) {
      this.next();
      const cond = this.parseExpr();
      this.expect('THEN');
      const val = this.parseExpr();
      branches.push({ cond, val });
    }

    if (this.is('ELSE')) {
      this.next();
      elseExpr = this.parseExpr();
    }

    this.expect('END');
    return Expr.case(branches, elseExpr);
  }
}