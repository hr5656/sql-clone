import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert';
import { Database } from '../src/storage/database.js';
import { Executor } from '../src/sql/executor/executor.js';
import { freshDataDir, cleanupDataDir } from './helpers.js';

let db, exec, dir;

beforeEach(() => {
  dir = freshDataDir('indexes');
  db = new Database('t', dir);
  exec = new Executor(() => db);
  exec.execute('CREATE TABLE users (id INT PRIMARY KEY, name TEXT, age INT);');
  exec.execute("INSERT INTO users VALUES (1,'a',30),(2,'b',25),(3,'c',40),(4,'d',35),(5,'e',28);");
});

test('PRIMARY KEY builds an auto hash index', () => {
  const idx = db.indexes.get('users', 'id');
  assert.ok(idx);
});

test('EXPLAIN uses hash-lookup on PK equality', () => {
  const r = exec.execute('EXPLAIN SELECT * FROM users WHERE id = 3;');
  assert.equal(r.kind, 'explain');
  const access = r.plan.find((p) => p.step === 'access');
  assert.equal(access.kind, 'hash-lookup');
  assert.equal(access.column, 'id');
});

test('EXPLAIN falls back to full-scan without index', () => {
  const r = exec.execute('EXPLAIN SELECT * FROM users WHERE name = \'a\';');
  const access = r.plan.find((p) => p.step === 'access');
  assert.equal(access.kind, 'full-scan');
});

test('CREATE INDEX adds a B-Tree index', () => {
  const r = exec.execute('CREATE INDEX idx_users_age ON users(age);');
  assert.equal(r.ok, true);
  assert.equal(r.kind, 'create-index');
  assert.ok(db.indexes.get('users', 'age'));
});

test('EXPLAIN uses range-scan after CREATE INDEX', () => {
  exec.execute('CREATE INDEX idx_users_age ON users(age);');
  const r = exec.execute('EXPLAIN SELECT * FROM users WHERE age > 30;');
  const access = r.plan.find((p) => p.step === 'access');
  assert.equal(access.kind, 'range-scan');
  assert.equal(access.column, 'age');
});

test('indexed range query returns correct rows', () => {
  exec.execute('CREATE INDEX idx_users_age ON users(age);');
  const r = exec.execute('SELECT name FROM users WHERE age > 30 ORDER BY age;');
  assert.deepEqual(r.rows.map((x) => x.name), ['d', 'c']);
});

test('DROP INDEX removes the index', () => {
  exec.execute('CREATE INDEX idx_users_age ON users(age);');
  exec.execute('DROP INDEX idx_users_age;');
  const r = exec.execute('EXPLAIN SELECT * FROM users WHERE age > 30;');
  const access = r.plan.find((p) => p.step === 'access');
  assert.equal(access.kind, 'full-scan');
});

test('UNIQUE index rejects duplicates', () => {
  exec.execute('CREATE UNIQUE INDEX idx_users_name ON users(name);');
  assert.throws(
    () => exec.execute("INSERT INTO users VALUES (6, 'a', 20);"),
    /UNIQUE|violation/i
  );
});

test('index survives restart', () => {
  exec.execute('CREATE INDEX idx_users_age ON users(age);');
  const db2 = new Database('t', dir);
  const exec2 = new Executor(() => db2);
  const r = exec2.execute('EXPLAIN SELECT * FROM users WHERE age > 30;');
  const access = r.plan.find((p) => p.step === 'access');
  assert.equal(access.kind, 'range-scan');
});

test.after(() => cleanupDataDir(dir));