import { test, beforeEach } from 'node:test';
import assert from 'node:assert';
import { Database } from '../src/storage/database.js';
import { Executor } from '../src/sql/executor/executor.js';
import { freshDataDir, cleanupDataDir } from './helpers.js';

let db, exec, dir;

beforeEach(() => {
  dir = freshDataDir('crud');
  db = new Database('t', dir);
  exec = new Executor(() => db);
});

test('CREATE TABLE returns ok', () => {
  const r = exec.execute('CREATE TABLE t (id INT, name TEXT);');
  assert.equal(r.ok, true);
  assert.equal(r.table, 't');
});

test('CREATE TABLE twice fails', () => {
  exec.execute('CREATE TABLE t (id INT);');
  assert.throws(() => exec.execute('CREATE TABLE t (id INT);'), /already exists/);
});

test('INSERT single row', () => {
  exec.execute('CREATE TABLE t (id INT, name TEXT);');
  const r = exec.execute("INSERT INTO t VALUES (1, 'alice');");
  assert.equal(r.inserted, 1);
  assert.equal(exec.execute('SELECT * FROM t;').rowCount, 1);
});

test('INSERT multi-row', () => {
  exec.execute('CREATE TABLE t (id INT, name TEXT);');
  exec.execute("INSERT INTO t VALUES (1, 'a'), (2, 'b'), (3, 'c');");
  assert.equal(exec.execute('SELECT * FROM t;').rowCount, 3);
});

test('INSERT with column list', () => {
  exec.execute('CREATE TABLE t (id INT, name TEXT, age INT);');
  exec.execute("INSERT INTO t (id, name) VALUES (1, 'x');");
  const r = exec.execute('SELECT * FROM t;');
  assert.equal(r.rows[0].id, 1);
  assert.equal(r.rows[0].name, 'x');
});

test('PRIMARY KEY rejects duplicates', () => {
  exec.execute('CREATE TABLE t (id INT PRIMARY KEY, name TEXT);');
  exec.execute("INSERT INTO t VALUES (1, 'a');");
  assert.throws(
    () => exec.execute("INSERT INTO t VALUES (1, 'b');"),
    /UNIQUE|PRIMARY KEY|violation/i
  );
});

test('UPDATE affects matching rows only', () => {
  exec.execute('CREATE TABLE t (id INT, name TEXT);');
  exec.execute("INSERT INTO t VALUES (1, 'a'), (2, 'b'), (3, 'c');");
  const r = exec.execute("UPDATE t SET name = 'z' WHERE id > 1;");
  assert.equal(r.affected, 2);
  const s = exec.execute('SELECT * FROM t ORDER BY id;');
  assert.equal(s.rows[0].name, 'a');
  assert.equal(s.rows[1].name, 'z');
  assert.equal(s.rows[2].name, 'z');
});

test('DELETE removes matching rows', () => {
  exec.execute('CREATE TABLE t (id INT, name TEXT);');
  exec.execute("INSERT INTO t VALUES (1, 'a'), (2, 'b'), (3, 'c');");
  const r = exec.execute('DELETE FROM t WHERE id = 2;');
  assert.equal(r.deleted, 1);
  assert.equal(exec.execute('SELECT * FROM t;').rowCount, 2);
});

test('DELETE without WHERE clears table', () => {
  exec.execute('CREATE TABLE t (id INT);');
  exec.execute('INSERT INTO t VALUES (1), (2), (3);');
  exec.execute('DELETE FROM t;');
  assert.equal(exec.execute('SELECT * FROM t;').rowCount, 0);
});

test('persistence across Database re-instantiation', () => {
  exec.execute('CREATE TABLE t (id INT, name TEXT);');
  exec.execute("INSERT INTO t VALUES (1, 'persist');");

  const db2 = new Database('t', dir);
  const exec2 = new Executor(() => db2);
  const r = exec2.execute('SELECT * FROM t;');
  assert.equal(r.rows[0].name, 'persist');
});

test.after(() => cleanupDataDir(dir));