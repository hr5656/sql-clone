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
  }

  start() {
    this.server = http.createServer((req, res) => this.handle(req, res));
    this.server.listen(this.port, () => {
      console.log(`[web] http://localhost:${this.port}`);
    });
  }

  stop() {
    this.server?.close();
  }

  async handle(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }

    if (req.method === 'POST' && req.url === '/api/query') {
      return this.handleQuery(req, res);
    }
    if (req.method === 'GET' && req.url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }
    if (req.method === 'GET' && req.url === '/api/tables') {
      return this.handleTables(req, res);
    }
    return this.serveStatic(req, res);
  }

  async handleQuery(req, res) {
    let body = '';
    for await (const chunk of req) body += chunk;

    let sql;
    try { sql = JSON.parse(body).sql; }
    catch { return this.json(res, 400, { ok: false, error: 'Invalid JSON body' }); }

    if (typeof sql !== 'string' || !sql.trim()) {
      return this.json(res, 400, { ok: false, error: 'Empty SQL' });
    }

    try {
      const result = await this.sendToEngine(sql);
      return this.json(res, 200, result);
    } catch (err) {
      return this.json(res, 200, { ok: false, error: err.message });
    }
  }

  async handleTables(_req, res) {
    try {
      const reply = await this.sendToEngine('__META__ TABLES');
      return this.json(res, 200, reply);
    } catch (err) {
      return this.json(res, 200, { ok: false, tables: [], error: err.message });
    }
  }

  sendToEngine(sql) {
    return new Promise((resolve, reject) => {
      const socket = net.connect(this.sqlPort, this.sqlHost);
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error('Engine timeout'));
      }, 5000);

      const payload = Buffer.from(sql, 'utf8');
      const header = Buffer.alloc(4);
      header.writeUInt32BE(payload.length, 0);

      socket.on('connect', () => {
        socket.write(Buffer.concat([header, payload]));
      });

      let buf = Buffer.alloc(0);
      socket.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        while (buf.length >= 4) {
          const len = buf.readUInt32BE(0);
          if (buf.length < 4 + len) break;
          const msg = buf.subarray(4, 4 + len).toString('utf8');
          buf = buf.subarray(4 + len);
          clearTimeout(timeout);
          try { resolve(JSON.parse(msg)); }
          catch { resolve({ ok: true, raw: msg }); }
          socket.end();
          return;
        }
      });

      socket.on('error', (e) => { clearTimeout(timeout); reject(e); });
    });
  }

  json(res, code, obj) {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  }

  serveStatic(req, res) {
    const urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    const filePath = path.join(PUBLIC_DIR, urlPath);

    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404).end('Not found');
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  }
}