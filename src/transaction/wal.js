import fs from 'node:fs';
import path from 'node:path';

export class WriteAheadLog {
  constructor(filePath) {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.fd = fs.openSync(filePath, 'a+');
  }

  /** Append one JSON record. Called before the corresponding change is applied. */
  append(record) {
    const line = JSON.stringify({ ...record, ts: Date.now() }) + '\n';
    fs.writeSync(this.fd, line);
    fs.fsyncSync(this.fd);
  }

  /** Read all records back. */
  replay() {
    if (!fs.existsSync(this.filePath)) return [];
    const raw = fs.readFileSync(this.filePath, 'utf8');
    return raw.split('\n').filter(Boolean).map((l) => {
      try { return JSON.parse(l); }
      catch { return null; }
    }).filter(Boolean);
  }

  /** Truncate the WAL. Called on COMMIT / checkpoint. */
  clear() {
    fs.ftruncateSync(this.fd, 0);
    fs.fsyncSync(this.fd);
  }

  close() {
    fs.closeSync(this.fd);
  }
}