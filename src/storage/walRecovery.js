import fs from 'node:fs';
import { Row } from './row.js';

/**
 * Replay a WAL file at startup.
 *
 * WAL record shape (one JSON object per line):
 *   { type: 'BEGIN',    txId }
 *   { type: 'MUTATE',   txId, table, rows }   // full snapshot of that table
 *   { type: 'COMMIT',   txId }
 *   { type: 'ROLLBACK', txId }
 *
 * Behaviour:
 *   - If the last record is COMMIT or ROLLBACK, the transaction ended cleanly.
 *     We truncate the WAL and return 0.
 *   - Otherwise the server crashed mid-transaction. We restore the last
 *     snapshot for every table touched, then truncate the WAL.
 *
 * Returns the number of snapshots applied.
 */
export function recoverFromWAL(walPath, database) {
  if (!fs.existsSync(walPath)) return 0;

  const raw = fs.readFileSync(walPath, 'utf8').trim();
  if (!raw) return 0;

  const records = raw
    .split('\n')
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);

  if (records.length === 0) return 0;

  const last = records[records.length - 1];
  const clean = last.type === 'COMMIT' || last.type === 'ROLLBACK';

  if (clean) {
    fs.writeFileSync(walPath, '');
    return 0;
  }

  // Crash mid-transaction. Apply the LAST snapshot per table.
  const lastSnapshot = new Map(); // table -> rows
  for (const rec of records) {
    if (rec.type === 'MUTATE') lastSnapshot.set(rec.table, rec.rows);
  }

  let applied = 0;
  for (const [tableName, rows] of lastSnapshot) {
    const t = database.getTable(tableName);
    if (!t) continue;
    t.rows = rows.map((r) => Row.fromJSON(r, t.columns));
    t.save();
    database.indexes.rebuild(tableName, t);
    applied++;
  }

  console.log(`[wal] crashed transaction detected — restored ${applied} table(s) from ${records.length} record(s)`);
  fs.writeFileSync(walPath, '');
  return applied;
}