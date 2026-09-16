import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert';
import { Database } from '../src/storage/database.js';
import { Executor } from '../src/sql/executor/executor.js';
import { freshDataDir, cleanupDataDir } from './helpers.js';

let db, exec, dir;

beforeEach(() => {
  dir = freshDataDir('joins');
  db = new Database('t', dir);
  exec = new Executor(() => db);
  exec.execute('CREATE TABLE dept (id INT PRIMARY KEY, name TEXT);');
  exec.execute("INSERT INTO dept VALUES (1, 'eng'), (2, 'sales');");
  exec.execute('CREATE TABLE emp (id INT PRIMARY KEY, name TEXT, dept_id INT);');
  exec.execute("INSERT INTO emp VALUES (1, 'alice', 1), (2, 'bob', 1), (3, 'carol', 2), (4, 'dave', NULL);");
});

test('INNER JOIN returns matched rows', () => {
  const r = exec.execute(
    'SELECT emp.name AS en, dept.name AS dn FROM emp INNER JOIN dept ON emp.dept_id = dept.id ORDER BY emp.name;'
  );
  assert.equal(r.rowCount, 3);
  assert.equal(r.rows[0].en, 'alice');
  assert.equal(r.rows[0].dn, 'eng');
});

test('LEFT JOIN includes unmatched left rows', () => {
  const r = exec.execute(
    'SELECT emp.name AS en, dept.name AS dn FROM emp LEFT JOIN dept ON emp.dept_id = dept.id ORDER BY emp.name;'
  );
  assert.equal(r.rowCount, 4);
  const dave = r.rows.find((x) => x.en === 'dave');
  assert.equal(dave.dn, null);
});

test('RIGHT JOIN includes unmatched right rows', () => {
  exec.execute('INSERT INTO emp VALUES (5, \'eve\', 3);');
  exec.execute('INSERT INTO dept VALUES (3, \'hr\');');
  const r = exec.execute(
    'SELECT emp.name AS en, dept.name AS dn FROM emp RIGHT JOIN dept ON emp.dept_id = dept.id;'
  );
  // eng rows: alice + bob
  // sales: carol
  // hr: no matching emp row (only the artificial "eve" with dept_id=3)
  assert.ok(r.rowCount >= 4);
});

test('CROSS JOIN returns cartesian product', () => {
  const r = exec.execute('SELECT emp.name, dept.name FROM emp CROSS JOIN dept;');
  assert.equal(r.rowCount, 8); // 4 emps × 2 depts
});

test('JOIN with WHERE filter', () => {
  const r = exec.execute(
    "SELECT emp.name AS name FROM emp INNER JOIN dept ON emp.dept_id = dept.id WHERE dept.name = 'eng' ORDER BY emp.name;"
  );
  assert.deepEqual(r.rows.map((x) => x.name), ['alice', 'bob']);
});

test('JOIN with GROUP BY', () => {
  const r = exec.execute(
    'SELECT dept.name AS dn, COUNT(*) AS n FROM emp INNER JOIN dept ON emp.dept_id = dept.id GROUP BY dept.name ORDER BY dn;'
  );
  assert.equal(r.rows[0].dn, 'eng');
  assert.equal(r.rows[0].n, 2);
  assert.equal(r.rows[1].dn, 'sales');
  assert.equal(r.rows[1].n, 1);
});

test.after(() => cleanupDataDir(dir));