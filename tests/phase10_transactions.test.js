import { test, before, after } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { TcpServer } from '../src/server/tcpServer.js';
import { openClient } from './helpers.js';

const PORT = 6301;
let server, client;

before(async () => {
  fs.rmSync(path.resolve('data', 'default'), { recursive: true, force: true });
  fs.rmSync(path.resolve('data', 'default.wal'), { force: true });

  server = new TcpServer({ host: '127.0.0.1', port: PORT });
  await server.startAsync();

  client = openClient(PORT);
  await new Promise((r) => setTimeout(r, 150));

  const r1 = await client.send('CREATE TABLE accounts (id INT PRIMARY KEY, name TEXT, balance INT);');
  const r2 = await client.send("INSERT INTO accounts VALUES (1, 'alice', 1000), (2, 'bob', 500);");
  if (r1.ok === false || r2.ok === false) {
    console.error('setup failed', r1, r2);
  }
});

after(() => {
  client?.close();
  server?.stop();
});

test('BEGIN returns a transaction id', async () => {
  const r = await client.send('BEGIN;');
  assert.equal(r.ok, true);
  assert.equal(r.kind, 'begin');
  assert.ok(typeof r.txId === 'number');
  await client.send('ROLLBACK;');
});

test('COMMIT persists changes', async () => {
  await client.send('BEGIN;');
  await client.send('UPDATE accounts SET balance = balance - 200 WHERE id = 1;');
  await client.send('UPDATE accounts SET balance = balance + 200 WHERE id = 2;');
  const c = await client.send('COMMIT;');
  assert.equal(c.kind, 'commit');
  const r = await client.send('SELECT * FROM accounts ORDER BY id;');
  const alice = r.rows.find((x) => x.name === 'alice');
  const bob = r.rows.find((x) => x.name === 'bob');
  assert.equal(alice.balance, 800);
  assert.equal(bob.balance, 700);
});

test('ROLLBACK restores previous state', async () => {
  const before = await client.send('SELECT * FROM accounts WHERE id = 1;');
  const beforeAlice = before.rows[0].balance;
  await client.send('BEGIN;');
  await client.send('UPDATE accounts SET balance = 0 WHERE id = 1;');
  const mid = await client.send('SELECT * FROM accounts WHERE id = 1;');
  assert.equal(mid.rows[0].balance, 0);
  await client.send('ROLLBACK;');
  const after = await client.send('SELECT * FROM accounts WHERE id = 1;');
  assert.equal(after.rows[0].balance, beforeAlice);
});

test('COMMIT without BEGIN errors', async () => {
  const r = await client.send('COMMIT;');
  assert.equal(r.ok, false);
  assert.match(r.error, /transaction/i);
});

test('ROLLBACK without BEGIN errors', async () => {
  const r = await client.send('ROLLBACK;');
  assert.equal(r.ok, false);
  assert.match(r.error, /transaction/i);
});

test('INSERT inside transaction is undone by ROLLBACK', async () => {
  const before = await client.send('SELECT COUNT(*) AS n FROM accounts;');
  const n0 = before.rows[0].n;
  await client.send('BEGIN;');
  await client.send("INSERT INTO accounts VALUES (99, 'temp', 0);");
  const mid = await client.send('SELECT COUNT(*) AS n FROM accounts;');
  assert.equal(mid.rows[0].n, n0 + 1);
  await client.send('ROLLBACK;');
  const after = await client.send('SELECT COUNT(*) AS n FROM accounts;');
  assert.equal(after.rows[0].n, n0);
});

test('DELETE inside transaction is undone by ROLLBACK', async () => {
  const before = await client.send('SELECT COUNT(*) AS n FROM accounts;');
  const n0 = before.rows[0].n;
  await client.send('BEGIN;');
  await client.send('DELETE FROM accounts;');
  const mid = await client.send('SELECT COUNT(*) AS n FROM accounts;');
  assert.equal(mid.rows[0].n, 0);
  await client.send('ROLLBACK;');
  const after = await client.send('SELECT COUNT(*) AS n FROM accounts;');
  assert.equal(after.rows[0].n, n0);
});

test('WAL file is empty after a clean COMMIT', async () => {
  await client.send('BEGIN;');
  await client.send('UPDATE accounts SET balance = balance + 1 WHERE id = 1;');
  await client.send('COMMIT;');
  const walPath = path.resolve('data', 'default.wal');
  if (fs.existsSync(walPath)) {
    const size = fs.statSync(walPath).size;
    assert.equal(size, 0, 'WAL should be truncated after COMMIT');
  }
});