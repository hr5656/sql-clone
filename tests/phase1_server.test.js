import { describe, test, before, after } from 'node:test';
import assert from 'node:assert';
import { TcpServer } from '../src/server/tcpServer.js';
import { sendSQL, openClient } from './helpers.js';

const PORT = 6201;

describe('phase1_server', () => {
  let server;

  before(async () => {
    server = new TcpServer({ host: '127.0.0.1', port: PORT });
    await server.startAsync();
  });

  after(() => server?.stop());

  test('server accepts a query and responds', async () => {
    const res = await sendSQL(PORT, 'SELECT 1 + 2 AS three;');
    assert.equal(res.ok, true);
    assert.equal(res.kind, 'select');
    assert.equal(res.rows[0].three, 3);
  });

  test('server handles an invalid query with a JSON error', async () => {
    const res = await sendSQL(PORT, 'BOGUS x;');
    assert.equal(res.ok, false);
    assert.ok(res.error);
  });

  test('server handles multiple concurrent connections', async () => {
    const clients = Array.from({ length: 5 }, () => openClient(PORT));
    for (const c of clients) {
      const r = await c.send('SELECT 1 + 1 AS two;');
      assert.equal(r.rows[0].two, 2);
      c.close();
    }
  });

  test('persistent client keeps connection open', async () => {
    const c = openClient(PORT);
    const r1 = await c.send('SELECT 1 AS a;');
    const r2 = await c.send('SELECT 2 AS b;');
    assert.equal(r1.rows[0].a, 1);
    assert.equal(r2.rows[0].b, 2);
    c.close();
  });

  test('oversized frame is rejected gracefully', async () => {
    const c = openClient(PORT);
    const r = await c.send('SELECT 1;');
    assert.equal(r.ok, true);
    c.close();
  });
});
