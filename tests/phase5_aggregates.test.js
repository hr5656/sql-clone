import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert';
import { Database } from '../src/storage/database.js';
import { Executor } from '../src/sql/executor/executor.js';
import { freshDataDir, cleanupDataDir } from './helpers.js';

let db, exec, dir;

beforeEach(() => {
  dir = freshDataDir('agg');
  db = new Database('t', dir);
  exec = new Executor(() => db);
  exec.execute('CREATE TABLE e (id INT, dept TEXT, salary INT);');
  exec.execute("INSERT INTO e VALUES (1,'eng',100),(2,'eng',120),(3,'sales',90),(4,'sales',110),(5,'eng',130);");
});

test('COUNT(*)', () => {
  const r = exec.execute('SELECT COUNT(*) AS n FROM e;');
  assert.equal(r.rows[0].n, 5);
});

test('SUM, AVG, MIN, MAX', () => {
  const r = exec.execute('SELECT SUM(salary) AS s, AVG(salary) AS a, MIN(salary) AS mn, MAX(salary) AS mx FROM e;');
  assert.equal(r.rows[0].s, 550);
  assert.equal(r.rows[0].a, 110);
  assert.equal(r.rows[0].mn, 90);
  assert.equal(r.rows[0].mx, 130);
});

test('GROUP BY single key', () => {
  const r = exec.execute('SELECT dept, COUNT(*) AS n, SUM(salary) AS total FROM e GROUP BY dept ORDER BY dept;');
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].dept, 'eng');
  assert.equal(r.rows[0].n, 3);
  assert.equal(r.rows[0].total, 350);
  assert.equal(r.rows[1].dept, 'sales');
  assert.equal(r.rows[1].total, 200);
});

test('HAVING filters groups', () => {
  const r = exec.execute('SELECT dept, SUM(salary) AS total FROM e GROUP BY dept HAVING SUM(salary) > 250;');
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].dept, 'eng');
});

test('COUNT with empty result set returns 0', () => {
  const r = exec.execute('SELECT COUNT(*) AS n FROM e WHERE salary > 9999;');
  assert.equal(r.rows[0].n, 0);
});

test('aggregate in SELECT with WHERE', () => {
  const r = exec.execute('SELECT SUM(salary) AS total FROM e WHERE dept = \'eng\';');
  assert.equal(r.rows[0].total, 350);
});

test('nested aggregates in one query', () => {
  const r = exec.execute(
    'SELECT dept, MIN(salary) AS mn, MAX(salary) AS mx FROM e GROUP BY dept ORDER BY dept;'
  );
  assert.equal(r.rows[0].mn, 100);
  assert.equal(r.rows[0].mx, 130);
  assert.equal(r.rows[1].mn, 90);
  assert.equal(r.rows[1].mx, 110);
});

test.after(() => cleanupDataDir(dir));