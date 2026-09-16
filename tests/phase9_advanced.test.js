import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert';
import { Database } from '../src/storage/database.js';
import { Executor } from '../src/sql/executor/executor.js';
import { freshDataDir, cleanupDataDir } from './helpers.js';

let db, exec, dir;

beforeEach(() => {
  dir = freshDataDir('advanced');
  db = new Database('t', dir);
  exec = new Executor(() => db);
  exec.execute('CREATE TABLE emp (id INT, name TEXT, dept TEXT, salary INT);');
  exec.execute("INSERT INTO emp VALUES (1,'alice','eng',100),(2,'bob','eng',120),(3,'carol','sales',90),(4,'dave','sales',110),(5,'eve','eng',130);");
});

/* ---------- CTEs ---------- */
test('CTE simple', () => {
  const r = exec.execute('WITH top AS (SELECT * FROM emp WHERE salary > 100) SELECT name FROM top ORDER BY name;');
  assert.deepEqual(r.rows.map((x) => x.name), ['bob', 'dave', 'eve']);
});

test('CTE with aggregate inside', () => {
  const r = exec.execute(
    'WITH totals AS (SELECT dept, SUM(salary) AS total FROM emp GROUP BY dept) ' +
    'SELECT dept, total FROM totals WHERE total > 250;'
  );
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].dept, 'eng');
});

/* ---------- Subqueries ---------- */
test('IN with literal list', () => {
  const r = exec.execute("SELECT name FROM emp WHERE dept IN ('eng', 'sales');");
  assert.equal(r.rowCount, 5);
});

test('IN with subquery', () => {
  const r = exec.execute(
    'SELECT name FROM emp WHERE dept IN (SELECT dept FROM emp WHERE salary > 120);'
  );
  assert.deepEqual(r.rows.map((x) => x.name).sort(), ['alice', 'bob', 'eve']);
});

test('scalar subquery', () => {
  const r = exec.execute('SELECT name FROM emp WHERE salary = (SELECT MAX(salary) FROM emp);');
  assert.equal(r.rows[0].name, 'eve');
});

test('EXISTS subquery', () => {
  const r = exec.execute(
    'SELECT name FROM emp WHERE EXISTS (SELECT 1 FROM emp WHERE salary > 200);'
  );
  assert.equal(r.rowCount, 0); // nobody earns > 200
});

test('IS NULL / IS NOT NULL', () => {
  exec.execute("INSERT INTO emp VALUES (6, 'frank', NULL, 100);");
  const nulls = exec.execute('SELECT name FROM emp WHERE dept IS NULL;');
  assert.equal(nulls.rows[0].name, 'frank');
  const notNulls = exec.execute('SELECT name FROM emp WHERE dept IS NOT NULL;');
  assert.equal(notNulls.rowCount, 5);
});

/* ---------- Window functions ---------- */
test('ROW_NUMBER partitioned', () => {
  const r = exec.execute(
    'SELECT name, dept, salary, ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC) AS rn FROM emp ORDER BY dept, rn;'
  );
    const eng = r.rows.filter((x) => x.dept === 'eng').sort((a, b) => a.rn - b.rn);
  assert.deepEqual(eng.map((x) => x.rn), [1, 2, 3]);
  assert.equal(eng[0].name, 'eve');
});

test('RANK with ties', () => {
  exec.execute("INSERT INTO emp VALUES (6, 'frank', 'eng', 120);");
  const r = exec.execute(
    'SELECT name, salary, RANK() OVER (ORDER BY salary DESC) AS rnk FROM emp ORDER BY rnk, name;'
  );
  // eve 130 → rank 1, bob & frank 120 → rank 2
  assert.equal(r.rows[0].rnk, 1);
  assert.equal(r.rows[1].rnk, 2);
  assert.equal(r.rows[2].rnk, 2);
});

test('SUM OVER partition', () => {
  const r = exec.execute(
    'SELECT name, dept, SUM(salary) OVER (PARTITION BY dept) AS total FROM emp ORDER BY dept, name;'
  );
  const eng = r.rows.filter((x) => x.dept === 'eng');
  assert.ok(eng.every((x) => x.total === 350));
});

test.after(() => cleanupDataDir(dir));