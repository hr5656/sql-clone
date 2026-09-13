import { Lexer } from '../lexer/lexer.js';
import { TokenType } from '../lexer/token.js';
import { ParseError } from '../../common/errors.js';
import * as AST from '../ast/statements.js';
import { Expr } from '../ast/expressions.js';

const BINOP_BP = {
  'OR': 5,
  'AND': 10,
  '=': 20, '!=': 20, '<>': 20, '<': 20, '<=': 20, '>': 20, '>=': 20,
  '+': 30, '-': 30,
  '*': 40, '/': 40, '%': 40,
};

const AGG_FUNCS = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']);

export class Parser {
  constructor(input) {
    this.tokens = new Lexer(input).tokenize();
    this.pos = 0;
  }

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
      const col = { name: colName, type: colType, nullable: true, primaryKey: false, unique: false, defaultValue: null };

      while (this.is('NOT') || this.is('NULL') || this.is('PRIMARY') || this.is('UNIQUE') || this.is('DEFAULT')) {
        if (this.is('NOT'))      { this.next(); this.expect('NULL'); col.nullable = false; }
        else if (this.is('NULL')){ this.next(); col.nullable = true; }
        else if (this.is('PRIMARY')) { this.next(); this.expect('KEY'); col.primaryKey = true; col.nullable = false; }
        else if (this.is('UNIQUE'))  { this.next(); col.unique = true; }
        else if (this.is('DEFAULT')) { this.next(); col.defaultValue = this.next().value; }
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

    // ---- one or more value rows ----
    const rows = [];
    rows.push(this.parseValueRow());
    while (this.is(',')) {
      this.next();                 // comma BETWEEN rows
      rows.push(this.parseValueRow());
    }

    if (this.is(';')) this.next();
    return new AST.Insert(table, columns, rows);
  }


    parseValueRow() {
    this.expect('(');
    const values = [];
    if (!this.is(')')) {
      do {
        values.push(this.parseExpr());
      } while (this.is(',') && this.next());
    }
    this.expect(')');
    return values;
  }

  // ---------- SELECT ----------
  parseSelect() {
    this.expect('SELECT');

    let distinct = false;
    if (this.is('DISTINCT')) { this.next(); distinct = true; }

    const columns = [];
    while (!this.is('FROM') && !this.is(';') && !this.isType(TokenType.EOF)) {
      if (this.is('*')) { this.next(); columns.push({ expr: Expr.star(), alias: null }); }
      else {
        const expr = this.parseExpr();
        let alias = null;
        if (this.is('AS')) { this.next(); alias = this.expectType(TokenType.IDENT).value; }
        columns.push({ expr, alias });
      }
      if (this.is(',')) this.next(); else break;
    }

    if (!this.is('FROM')) {
      if (this.is(';')) this.next();
      const stmt = new AST.Select(columns, null);
      stmt.distinct = distinct;
      return stmt;
    }

    this.expect('FROM');
    const table = this.expectType(TokenType.IDENT).value;

    // ---- JOINs ----
    const joins = [];
    while (this.is('INNER') || this.is('LEFT') || this.is('RIGHT') || this.is('CROSS')) {
      let type = 'INNER';
      if (this.is('INNER'))      { this.next(); type = 'INNER'; }
      else if (this.is('LEFT'))  { this.next(); type = 'LEFT'; }
      else if (this.is('RIGHT')) { this.next(); type = 'RIGHT'; }
      else if (this.is('CROSS')) { this.next(); type = 'CROSS'; }

      this.expect('JOIN');
      const jTable = this.expectType(TokenType.IDENT).value;

      let on = null;
      if (this.is('ON')) {
        this.next();
        on = this.parseExpr();
      }
      joins.push({ type, table: jTable, on });
    }

    const stmt = new AST.Select(columns, table);
    stmt.distinct = distinct;
    stmt.joins = joins;

    if (this.is('WHERE'))   { this.next(); stmt.where = this.parseExpr(); }

    if (this.is('GROUP')) {
      this.next();
      this.expect('BY');
      const keys = [];
      do { keys.push(this.parseExpr()); } while (this.is(',') && this.next());
      stmt.groupBy = keys;
    }

    if (this.is('HAVING')) {
      this.next();
      stmt.having = this.parseExpr();
    }

    if (this.is('ORDER')) {
      this.next();
      this.expect('BY');
      const key = this.parseExpr();
      let dir = 'ASC';
      if (this.is('ASC')) { this.next(); }
      else if (this.is('DESC')) { this.next(); dir = 'DESC'; }
      stmt.orderBy = { key, dir };
    }

    if (this.is('LIMIT'))  { this.next(); stmt.limit = this.expectType(TokenType.NUMBER).value; }
    if (this.is('OFFSET')) { this.next(); stmt.offset = this.expectType(TokenType.NUMBER).value; }

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
      assignments.push([col, this.parseExpr()]);
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

  // ---------- Pratt expressions ----------
  parseExpr(minBP = 0) {
    let left = this.parseUnary();
    while (true) {
      const op = this.peek().value;
      const bp = BINOP_BP[op];
      if (bp === undefined || bp < minBP) break;
      this.next();
      left = Expr.binary(op, left, this.parseExpr(bp + 1));
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

    if (t.value === 'CASE') return this.parseCase();

    // function call (aggregate / scalar)
    if ((t.type === TokenType.IDENT || t.type === TokenType.KEYWORD) && this.is('(')) {
      const name = t.value.toUpperCase();
      this.next(); // (
      if (name === 'COUNT' && this.is('*')) {
        this.next();
        this.expect(')');
        return Expr.func('COUNT', [Expr.star()]);
      }
      const args = [];
      if (!this.is(')')) {
        do { args.push(this.parseExpr()); } while (this.is(',') && this.next());
      }
      this.expect(')');
      return Expr.func(name, args);
    }

    // identifier or qualified identifier: a  OR  a.b
    if (t.type === TokenType.IDENT || t.type === TokenType.KEYWORD) {
      let name = t.value;
      while (this.is('.')) {
        this.next();                                  // consume '.'
        const part = this.expectType(TokenType.IDENT).value;
        name = `${name}.${part}`;
      }
      return Expr.column(name);
    }

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
    if (this.is('ELSE')) { this.next(); elseExpr = this.parseExpr(); }
    this.expect('END');
    return Expr.case(branches, elseExpr);
  }
}