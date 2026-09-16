import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert';
import { Database } from '../src/storage/database.js';
import { Executor } from '../src/sql/executor/executor.js';
import { freshDataDir, cleanupDataDir } from './helpers.js';

let db, exec, dir;

beforeEach(() => {
  dir = freshDataDir('constraints');
  db = new Database('t', dir);
  exec = new Executor(() => db);
});

test('PRIMARY KEY uniqueness', () => {
  exec.execute('CREATE TABLE t (id INT PRIMARY KEY, name TEXT);');
  exec.execute("INSERT INTO t VALUES (1, 'a');");
  assert.throws(
    () => exec.execute("INSERT INTO t VALUES (1, 'b');"),
    /violation/i
  );
});

test('PRIMARY KEY rejects NULL', () => {
  exec.execute('CREATE TABLE t (id INT PRIMARY KEY, name TEXT);');
  assert.throws(
    () => exec.execute("INSERT INTO t VALUES (NULL, 'a');"),
    /NULL/
  );
});

test('UNIQUE constraint on non-PK column', () => {
  exec.execute('CREATE TABLE t (id INT, email TEXT UNIQUE);');
  exec.execute("INSERT INTO t VALUES (1, 'a@x.com');");
  assert.throws(
    () => exec.execute("INSERT INTO t VALUES (2, 'a@x.com');"),
    /UNIQUE|violation/i
  );
});

test('NOT NULL rejects missing values', () => {
  exec.execute('CREATE TABLE t (id INT, name TEXT NOT NULL);');
  assert.throws(
    () => exec.execute("INSERT INTO t VALUES (1, NULL);"),
    /NULL/
  );
});

test('DEFAULT fills missing value', () => {
  exec.execute('CREATE TABLE t (id INT, active INT DEFAULT 1);');
  exec.execute('INSERT INTO t (id) VALUES (1);');
  const r = exec.execute('SELECT * FROM t;');
  assert.equal(r.rows[0].active, 1);
});

test('DEFAULT overridden by explicit value', () => {
  exec.execute('CREATE TABLE t (id INT, active INT DEFAULT 1);');
  exec.execute('INSERT INTO t VALUES (1, 0);');
  assert.equal(exec.execute('SELECT * FROM t;').rows[0].active, 0);
});

test('composite PRIMARY KEY on two columns', () => {
  exec.execute('CREATE TABLE t (a INT PRIMARY KEY, b INT, name TEXT);');
  exec.execute("INSERT INTO t VALUES (1, 100, 'x');");
  assert.throws(
    () => exec.execute("INSERT INTO t VALUES (1, 200, 'y');"),
    /violation/i
  );
});

test.after(() => cleanupDataDir(dir));