import { test } from 'node:test';
import assert from 'node:assert';
import { Lexer } from '../src/sql/lexer/lexer.js';
import { Parser } from '../src/sql/parser/parser.js';

/* ---------- Lexer ---------- */
test('lexer tokenizes SELECT *', () => {
  const toks = new Lexer('SELECT * FROM users;').tokenize().map((t) => t.value);
  assert.deepEqual(toks.slice(0, 5), ['SELECT', '*', 'FROM', 'users', ';']);
});

test('lexer handles numbers, strings, operators', () => {
  const toks = new Lexer("WHERE age >= 30 AND name = 'alice'")
    .tokenize()
    .filter((t) => t.type !== 'EOF')
    .map((t) => t.value);
  assert.deepEqual(toks, ['WHERE', 'age', '>=', 30, 'AND', 'name', '=', 'alice']);
});

test('lexer skips line comments', () => {
  const toks = new Lexer('SELECT 1; -- comment\nSELECT 2;')
    .tokenize()
    .filter((t) => t.type !== 'EOF')
    .map((t) => t.value);
  assert.deepEqual(toks, ['SELECT', 1, ';', 'SELECT', 2, ';']);
});

test('lexer rejects unknown characters', () => {
  assert.throws(() => new Lexer('SELECT @;').tokenize(), /Unexpected/);
});

/* ---------- Parser: DDL ---------- */
test('parser: CREATE TABLE with PRIMARY KEY', () => {
  const ast = new Parser('CREATE TABLE users (id INT PRIMARY KEY, name TEXT NOT NULL);').parse();
  assert.equal(ast.kind, 'CreateTable');
  assert.equal(ast.name, 'users');
  assert.equal(ast.columns.length, 2);
  assert.equal(ast.columns[0].primaryKey, true);
  assert.equal(ast.columns[1].nullable, false);
});

test('parser: CREATE DATABASE', () => {
  const ast = new Parser('CREATE DATABASE analytics;').parse();
  assert.equal(ast.kind, 'CreateDatabase');
  assert.equal(ast.name, 'analytics');
});

test('parser: USE', () => {
  const ast = new Parser('USE analytics;').parse();
  assert.equal(ast.kind, 'UseDatabase');
  assert.equal(ast.name, 'analytics');
});

test('parser: DROP TABLE', () => {
  const ast = new Parser('DROP TABLE users;').parse();
  assert.equal(ast.kind, 'DropTable');
  assert.equal(ast.name, 'users');
});

/* ---------- Parser: DML ---------- */
test('parser: INSERT single row', () => {
  const ast = new Parser("INSERT INTO users VALUES (1, 'alice');").parse();
  assert.equal(ast.kind, 'Insert');
  assert.equal(ast.values.length, 1);
  assert.equal(ast.values[0].length, 2);
});

test('parser: INSERT multi-row with column list', () => {
  const ast = new Parser("INSERT INTO users (id, name) VALUES (1, 'a'), (2, 'b');").parse();
  assert.deepEqual(ast.columns, ['id', 'name']);
  assert.equal(ast.values.length, 2);
});

test('parser: SELECT with every clause', () => {
  const sql = "SELECT DISTINCT name, age FROM users WHERE age > 20 ORDER BY age DESC LIMIT 5 OFFSET 2;";
  const ast = new Parser(sql).parse();
  assert.equal(ast.kind, 'Select');
  assert.equal(ast.distinct, true);
  assert.equal(ast.columns.length, 2);
  assert.equal(ast.where.kind, 'BinaryExpr');
  assert.equal(ast.orderBy.dir, 'DESC');
  assert.equal(ast.limit, 5);
  assert.equal(ast.offset, 2);
});

test('parser: constant SELECT with no FROM', () => {
  const ast = new Parser('SELECT 1 + 2 AS three;').parse();
  assert.equal(ast.table, null);
  assert.equal(ast.columns[0].alias, 'three');
});

test('parser: JOIN with ON', () => {
  const ast = new Parser(
    'SELECT a.x, b.y FROM a INNER JOIN b ON a.id = b.aid;'
  ).parse();
  assert.equal(ast.joins.length, 1);
  assert.equal(ast.joins[0].type, 'INNER');
  assert.ok(ast.joins[0].on);
});

test('parser: UPDATE with WHERE', () => {
  const ast = new Parser("UPDATE users SET age = age + 1 WHERE id = 1;").parse();
  assert.equal(ast.kind, 'Update');
  assert.equal(ast.assignments.length, 1);
  assert.ok(ast.where);
});

test('parser: DELETE with WHERE', () => {
  const ast = new Parser('DELETE FROM users WHERE age < 18;').parse();
  assert.equal(ast.kind, 'Delete');
  assert.ok(ast.where);
});

test('parser: CASE WHEN', () => {
  const ast = new Parser(
    "SELECT CASE WHEN age > 30 THEN 'old' ELSE 'young' END AS b FROM users;"
  ).parse();
  assert.equal(ast.columns[0].expr.kind, 'CaseExpr');
});

test('parser: WITH (CTE)', () => {
  const ast = new Parser('WITH top AS (SELECT * FROM users) SELECT * FROM top;').parse();
  assert.equal(ast.kind, 'With');
  assert.equal(ast.ctes.length, 1);
  assert.equal(ast.ctes[0].name, 'top');
});

test('parser: EXPLAIN', () => {
  const ast = new Parser('EXPLAIN SELECT * FROM users;').parse();
  assert.equal(ast.kind, 'Explain');
  assert.equal(ast.inner.kind, 'Select');
});

test('parser: BEGIN / COMMIT / ROLLBACK', () => {
  assert.equal(new Parser('BEGIN;').parse().kind, 'Begin');
  assert.equal(new Parser('COMMIT;').parse().kind, 'Commit');
  assert.equal(new Parser('ROLLBACK;').parse().kind, 'Rollback');
});