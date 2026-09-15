import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../../public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

export class WebServer {
  constructor({ port = 8080, sqlHost = '127.0.0.1', sqlPort = 5433 }) {
    this.port = port;
    this.sqlHost = sqlHost;
    this.sqlPort = sqlPort;
    this.server = null;
    /** sessionId → { socket, buffer, waiting, ready, id } */
    this.sessions = new Map();
  }

  start() {
    this.server = http.createServer((req, res) => this.handle(req, res));
    this.server.listen(this.port, () => {
      console.log(`[web] http://localhost:${this.port}`);
    });
  }

  stop() {
    for (const { socket } of this.sessions.values()) socket.end();
    this.server?.close();
  }

  async handle(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Id');
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }

    if (req.method === 'POST' && req.url === '/api/query')         return this.handleQuery(req, res);
    if (req.method === 'POST' && req.url === '/api/reset-session') return this.handleResetSession(req, res);
    if (req.method === 'GET'  && req.url === '/api/health')        return this.handleHealth(req, res);
    if (req.method === 'GET'  && req.url === '/api/tables')        return this.handleTables(req, res);
    if (req.method === 'GET'  && req.url === '/api/dbs')    return this.handleDbs(req, res);
    if (req.method === 'POST' && req.url === '/api/use-db') return this.handleUseDb(req, res);

    return this.serveStatic(req, res);
  }

  /* ============================================================
     Session management (one TCP socket per browser tab)
     ============================================================ */
  getOrCreateSession(sessionId) {
    let entry = this.sessions.get(sessionId);
    if (entry && !entry.socket.destroyed) return entry;

    const socket = net.connect(this.sqlPort, this.sqlHost);
    entry = { socket, buffer: Buffer.alloc(0), waiting: null, ready: false };
    this.sessions.set(sessionId, entry);

    socket.on('connect', () => { entry.ready = true; });
    socket.on('data', (chunk) => {
      entry.buffer = Buffer.concat([entry.buffer, chunk]);
      this._drainBuffer(entry);
    });
    socket.on('error', (e) => {
      console.error('[web] socket error:', e.message);
      this.sessions.delete(sessionId);
    });
    socket.on('close', () => {
      this.sessions.delete(sessionId);
    });

    return entry;
  }

  _drainBuffer(entry) {
    while (entry.buffer.length >= 4) {
      const len = entry.buffer.readUInt32BE(0);
      if (entry.buffer.length < 4 + len) break;
      const payload = entry.buffer.subarray(4, 4 + len).toString('utf8');
      entry.buffer = entry.buffer.subarray(4 + len);

      if (entry.waiting) {
        const { resolve } = entry.waiting;
        entry.waiting = null;
        try { resolve(JSON.parse(payload)); }
        catch { resolve({ ok: true, raw: payload }); }
      }
    }
  }

  /** Send SQL over the persistent socket and resolve with the JSON reply. */
  sendSQL(entry, sql) {
    return new Promise((resolve, reject) => {
      const doWrite = () => {
        entry.waiting = { resolve, reject };

        const payload = Buffer.from(sql, 'utf8');
        const header = Buffer.alloc(4);
        header.writeUInt32BE(payload.length, 0);
        entry.socket.write(Buffer.concat([header, payload]));

        const timer = setTimeout(() => {
          if (entry.waiting) {
            entry.waiting = null;
            reject(new Error('Engine timeout'));
          }
        }, 8000);
        timer.unref?.();
      };

      if (entry.ready) doWrite();
      else entry.socket.once('connect', doWrite);
    });
  }

  readSessionId(req) {
    const id = req.headers['x-session-id'];
    return (typeof id === 'string' && id.length > 0) ? id : 'default';
  }

  /* ============================================================
     Routes
     ============================================================ */
  async handleQuery(req, res) {
    let body = '';
    for await (const chunk of req) body += chunk;

    let sql;
    try { sql = JSON.parse(body).sql; }
    catch { return this.json(res, 400, { ok: false, error: 'Invalid JSON body' }); }

    if (typeof sql !== 'string' || !sql.trim()) {
      return this.json(res, 400, { ok: false, error: 'Empty SQL' });
    }

    const sessionId = this.readSessionId(req);
    const entry = this.getOrCreateSession(sessionId);

    try {
      const reply = await this.sendSQL(entry, sql);
      return this.json(res, 200, reply);
    } catch (err) {
      return this.json(res, 200, { ok: false, error: err.message });
    }
  }

  async handleResetSession(req, res) {
    const sessionId = this.readSessionId(req);
    const entry = this.sessions.get(sessionId);
    if (entry) {
      entry.socket.end();
      this.sessions.delete(sessionId);
    }
    return this.json(res, 200, { ok: true, reset: true });
  }

  async handleHealth(_req, res) {
    return this.json(res, 200, {
      ok: true,
      sessions: this.sessions.size,
    });
  }

  async handleTables(req, res) {
    const sessionId = this.readSessionId(req);
    const entry = this.getOrCreateSession(sessionId);
    try {
      const reply = await this.sendSQL(entry, '__META__ TABLES');
      return this.json(res, 200, reply);
    } catch (err) {
      return this.json(res, 200, { ok: false, tables: [], error: err.message });
    }
  }
    async handleDbs(req, res) {
    const sid = this.readSessionId(req);
    const entry = this.getOrCreateSession(sid);
    try {
      const reply = await this.sendSQL(entry, '__META__ DBS');
      return this.json(res, 200, reply);
    } catch (err) {
      return this.json(res, 200, { ok: false, databases: [], error: err.message });
    }
  }

  async handleUseDb(req, res) {
    let body = '';
    for await (const chunk of req) body += chunk;
    let name;
    try { name = JSON.parse(body).name; }
    catch { return this.json(res, 400, { ok: false, error: 'Invalid JSON' }); }

    const sid = this.readSessionId(req);
    const entry = this.getOrCreateSession(sid);
    try {
      const reply = await this.sendSQL(entry, `USE ${name}`);
      return this.json(res, 200, reply);
    } catch (err) {
      return this.json(res, 200, { ok: false, error: err.message });
    }
  }

  json(res, code, obj) {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  }

  serveStatic(req, res) {
    const urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    const filePath = path.join(PUBLIC_DIR, urlPath);

    if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403).end('Forbidden'); return; }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404).end('Not found'); return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  }
}