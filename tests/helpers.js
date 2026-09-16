import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function sendSQL(port, sql, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, host);
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('sendSQL timeout')); }, 3000);
    socket.on('connect', () => {
      const b = Buffer.from(sql, 'utf8');
      const h = Buffer.alloc(4); h.writeUInt32BE(b.length, 0);
      socket.write(Buffer.concat([h, b]));
    });
    let buf = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 4) {
        const len = buf.readUInt32BE(0);
        if (buf.length < 4 + len) break;
        const msg = buf.subarray(4, 4 + len).toString('utf8');
        clearTimeout(timer); socket.end();
        try { resolve(JSON.parse(msg)); } catch { resolve({ ok: true, raw: msg }); }
        return;
      }
    });
    socket.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

export function openClient(port, host = '127.0.0.1') {
  const socket = net.connect(port, host);
  let buf = Buffer.alloc(0);
  const queue = [];
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 4) {
      const len = buf.readUInt32BE(0);
      if (buf.length < 4 + len) break;
      const msg = buf.subarray(4, 4 + len).toString('utf8');
      buf = buf.subarray(4 + len);
      const next = queue.shift();
      if (next) {
        try { next.resolve(JSON.parse(msg)); } catch { next.resolve({ ok: true, raw: msg }); }
      }
    }
  });
  return {
    send(sql) {
      return new Promise((resolve, reject) => {
        queue.push({ resolve, reject });
        const b = Buffer.from(sql, 'utf8');
        const h = Buffer.alloc(4); h.writeUInt32BE(b.length, 0);
        socket.write(Buffer.concat([h, b]));
        setTimeout(() => {
          const idx = queue.findIndex((q) => q.resolve === resolve);
          if (idx !== -1) { queue.splice(idx, 1); reject(new Error('openClient timeout')); }
        }, 3000);
      });
    },
    close() { socket.end(); },
    socket,
  };
}

export function freshDataDir(name) {
  const dir = path.resolve(__dirname, '..', 'data', `__test_${name}_${Date.now()}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function cleanupDataDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let _port = 6100;
export function nextPort() { return ++_port; }
