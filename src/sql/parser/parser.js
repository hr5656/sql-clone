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
       case 'BEGIN':    return this.parseBegin();
      case 'COMMIT':   return this.parseCommit();
      case 'ROLLBACK': return this.parseRollback();
      case 'WITH':    return this.parseWith();
      case 'CREATE':  return this.parseCreate();
      case 'DROP':    return this.parseDrop();
      case 'INSERT':  return this.parseInsert();
      case 'SELECT':  return this.parseSelect();
      case 'UPDATE':  return this.parseUpdate();
      case 'DELETE':  return this.parseDelete();
      case 'EXPLAIN': {
        this.next();
        return { kind: 'Explain', inner: this.parse() };
      }
      default: throw new ParseError(`Unsupported statement starting with '${t.value}'`);
    }
  }

  parseBegin() {
    this.expect('BEGIN');
    // optional: BEGIN TRANSACTION
    if (this.is('TRANSACTION')) this.next();
    if (this.is(';')) this.next();
    return new AST.BeginTx();
  }

  parseCommit() {
    this.expect('COMMIT');
    if (this.is(';')) this.next();
    return new AST.CommitTx();
  }

  parseRollback() {
    this.expect('ROLLBACK');
    if (this.is(';')) this.next();
    return new AST.RollbackTx();
  }

  parseWith() {
    this.expect('WITH');
    const ctes = [];
    do {
      const name = this.expectType(TokenType.IDENT).value;
      this.expect('AS');
      this.expect('(');
      const query = this.parse();
      this.expect(')');
      ctes.push({ name, query });
    } while (this.is(',') && this.next());

    const inner = this.parse();
    return new AST.WithQuery(ctes, inner);
  }

  // ---------- CREATE TABLE ----------
   parseCreate() {
    this.expect('CREATE');

    // CREATE UNIQUE INDEX ...
    let unique = false;
    if (this.is('UNIQUE')) { this.next(); unique = true; }

    if (this.is('INDEX')) return this.parseCreateIndex(unique);
    if (this.is('TABLE')) return this.parseCreateTable();

    throw new ParseError(`Expected TABLE or INDEX after CREATE, got '${this.peek().value}'`);
  }

  parseCreateTable() {
    this.expect('TABLE');
    const name = this.expectType(TokenType.IDENT).value;
    this.expect('(');

    const columns = [];
    while (!this.is(')')) {
      const colName = this.expectType(TokenType.IDENT).value;
      const colType = this.next().value;
      const col = { name: colName, type: colType, nullable: true, primaryKey: false, unique: false, defaultValue: null };

      while (this.is('NOT') || this.is('NULL') || this.is('PRIMARY') || this.is('UNIQUE') || this.is('DEFAULT')) {
        if (this.is('NOT'))          { this.next(); this.expect('NULL'); col.nullable = false; }
        else if (this.is('NULL'))    { this.next(); col.nullable = true; }
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

  parseCreateIndex(unique) {
    this.expect('INDEX');
    const name = this.expectType(TokenType.IDENT).value;

    this.expect('ON');
    const table = this.expectType(TokenType.IDENT).value;

    // optional: USING HASH | USING BTREE
    let kind = 'BTREE';
    if (this.is('USING')) {
      this.next();
      const k = this.next().value;
      if (k !== 'HASH' && k !== 'BTREE') throw new ParseError(`Unknown index kind '${k}'`);
      kind = k;
    }

    this.expect('(');
    const column = this.expectType(TokenType.IDENT).value;
    this.expect(')');

    if (this.is(';')) this.next();
    return new AST.CreateIndex({ name, table, column, unique, kind });
  }

  parseDrop() {
    this.expect('DROP');
    if (this.is('INDEX')) {
      this.next();
      const name = this.expectType(TokenType.IDENT).value;
      if (this.is(';')) this.next();
      return new AST.DropIndex({ name });
    }
    throw new ParseError(`Only DROP INDEX is supported, got '${this.peek().value}'`);
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
      const t = this.peek();
      const op = t.value;

      // IN (...)
      if (op === 'IN' && minBP <= 15) {
        this.next();
        this.expect('(');
        if (this.is('SELECT')) {
          const query = this.parse();
          this.expect(')');
          left = Expr.inSubquery(left, query);
        } else {
          const list = [];
          if (!this.is(')')) {
            do { list.push(this.parseExpr()); } while (this.is(',') && this.next());
          }
          this.expect(')');
          left = Expr.inList(left, list);
        }
        continue;
      }

      // IS [NOT] NULL
      if (op === 'IS' && minBP <= 15) {
        this.next();
        const negated = this.is('NOT') ? (this.next(), true) : false;
        this.expect('NULL');
        left = Expr.isNull(left, negated);
        continue;
      }

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

    // EXISTS (subquery)
    if (t.value === 'EXISTS') {
      this.expect('(');
      const query = this.parse();
      this.expect(')');
      return Expr.exists(query, false);
    }
    if (t.value === 'NOT' && this.is('EXISTS')) {
      this.next();
      this.expect('(');
      const query = this.parse();
      this.expect(')');
      return Expr.exists(query, true);
    }

    // Scalar subquery:  ( SELECT ... )
    if (t.value === '(' && this.is('SELECT')) {
      const query = this.parse();
      this.expect(')');
      return Expr.subquery(query);
    }

    // Function call OR window function
    if ((t.type === TokenType.IDENT || t.type === TokenType.KEYWORD) && this.is('(')) {
      const name = t.value.toUpperCase();
      this.next(); // (

      // COUNT(*)
      if (name === 'COUNT' && this.is('*')) {
        this.next();
        this.expect(')');
        if (this.is('OVER')) return this.parseOver('COUNT', [Expr.star()]);
        return Expr.func('COUNT', [Expr.star()]);
      }

      const args = [];
      if (!this.is(')')) {
        do { args.push(this.parseExpr()); } while (this.is(',') && this.next());
      }
      this.expect(')');

      // Window function: OVER (...)
      if (this.is('OVER')) return this.parseOver(name, args);
      return Expr.func(name, args);
    }

    // Identifier / qualified / window without parens (e.g. ROW_NUMBER OVER)
    if (t.type === TokenType.IDENT || t.type === TokenType.KEYWORD) {
      if (['ROW_NUMBER', 'RANK', 'DENSE_RANK'].includes(t.value) && this.is('OVER')) {
        return this.parseOver(t.value, []);
      }
      let name = t.value;
      while (this.is('.')) {
        this.next();
        name = `${name}.${this.expectType(TokenType.IDENT).value}`;
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

  parseOver(name, args) {
    this.expect('OVER');
    this.expect('(');

    let partitionBy = [];
    let orderBy = null;
    let dir = 'ASC';

    if (this.is('PARTITION')) {
      this.next();
      this.expect('BY');
      do { partitionBy.push(this.parseExpr()); } while (this.is(',') && this.next());
    }

    if (this.is('ORDER')) {
      this.next();
      this.expect('BY');
      orderBy = this.parseExpr();
      if (this.is('ASC')) this.next();
      else if (this.is('DESC')) { this.next(); dir = 'DESC'; }
    }

    this.expect(')');
    return Expr.window(name, args, partitionBy, orderBy, dir);
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