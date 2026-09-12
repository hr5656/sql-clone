import net from 'node:net';
import readline from 'node:readline';

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 5433);

const socket = net.connect(PORT, HOST, () => {
  console.log(`connected to sql-clone @ ${HOST}:${PORT}`);
  console.log('type SQL and press Enter. Ctrl+C to quit.\n');
});

let buf = Buffer.alloc(0);
socket.on('data', (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  while (buf.length >= 4) {
    const len = buf.readUInt32BE(0);
    if (buf.length < 4 + len) break;
    const msg = buf.subarray(4, 4 + len).toString('utf8');
    buf = buf.subarray(4 + len);
    try {
      const parsed = JSON.parse(msg);
      if (parsed.ok === false) console.log('x', parsed.error);
      else console.log('ok', JSON.stringify(parsed, null, 2));
    } catch {
      console.log('<-', msg);
    }
  }
});

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on('line', (line) => {
  const sql = line.trim();
  if (!sql) return;
  const payload = Buffer.from(sql, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  socket.write(Buffer.concat([header, payload]));
});

socket.on('error', (e) => console.error('client error:', e.message));
