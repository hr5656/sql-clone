import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert';
import { Database } from '../src/storage/database.js';
import { Executor } from '../src/sql/executor/executor.js';
import { freshDataDir, cleanupDataDir } from './helpers.js';

let db, exec, dir;

beforeEach(() => {
  dir = freshDataDir('clauses');
  db = new Database('t', dir);
  exec = new Executor(() => db);
  exec.execute('CREATE TABLE t (id INT, name TEXT, age INT);');
  exec.execute("INSERT INTO t VALUES (1,'a',30),(2,'b',25),(3,'c',40),(4,'d',35),(5,'e',28);");
});

test('WHERE equality', () => {
  const r = exec.execute('SELECT name FROM t WHERE id = 3;');
  assert.equal(r.rows[0].name, 'c');
});

test('WHERE range comparison', () => {
  const r = exec.execute('SELECT name FROM t WHERE age > 30 ORDER BY age;');
  assert.deepEqual(r.rows.map((r) => r.name), ['d', 'c']);
});

test('WHERE with AND / OR', () => {
  const r = exec.execute('SELECT name FROM t WHERE age > 26 AND age < 36 ORDER BY age;');
  assert.deepEqual(r.rows.map((r) => r.name), ['e', 'a', 'd']);
});

test('ORDER BY ASC / DESC', () => {
  const asc = exec.execute('SELECT id FROM t ORDER BY age ASC;');
  const desc = exec.execute('SELECT id FROM t ORDER BY age DESC;');
  assert.deepEqual(asc.rows.map((r) => r.id), [2, 5, 1, 4, 3]);
  assert.deepEqual(desc.rows.map((r) => r.id), [3, 4, 1, 5, 2]);
});

test('LIMIT and OFFSET', () => {
  const r = exec.execute('SELECT id FROM t ORDER BY id LIMIT 2 OFFSET 1;');
  assert.deepEqual(r.rows.map((r) => r.id), [2, 3]);
});

test('DISTINCT removes duplicates', () => {
  exec.execute("INSERT INTO t VALUES (6,'f',30);");
  const r = exec.execute('SELECT DISTINCT age FROM t ORDER BY age;');
  assert.deepEqual(r.rows.map((r) => r.age), [25, 28, 30, 35, 40]);
});

test('CASE WHEN', () => {
  const r = exec.execute(
    "SELECT name, CASE WHEN age >= 30 THEN 'senior' ELSE 'junior' END AS bucket FROM t ORDER BY id;"
  );
  assert.equal(r.rows[0].bucket, 'senior');   // a
  assert.equal(r.rows[1].bucket, 'junior');   // b
  assert.equal(r.rows[2].bucket, 'senior');   // c
});

test('constant SELECT without FROM', () => {
  const r = exec.execute('SELECT 1 + 2 * 3 AS result;');
  assert.equal(r.rows[0].result, 7);
});

test('string concatenation with +', () => {
  const r = exec.execute("SELECT 'a' + 'b' AS x;");
  assert.equal(r.rows[0].x, 'ab');
});

test.after(() => cleanupDataDir(dir));