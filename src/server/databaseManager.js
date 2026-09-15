import fs from 'node:fs';
import path from 'node:path';
import { Database } from '../storage/database.js';

const BASE_DIR = 'data';
const databases = new Map();
let activeName = 'default';

/** Get or create a database by name. */
export function getDatabase(name) {
  if (!databases.has(name)) {
    databases.set(name, new Database(name, BASE_DIR));
  }
  return databases.get(name);
}

/** Currently active database name. */
export function getActiveDbName() {
  return activeName;
}

/** Currently active database instance. */
export function getActiveDb() {
  return getDatabase(activeName);
}

/** Switch the active database. */
export function useDatabase(name) {
  getDatabase(name);              // ensure loaded
  activeName = name;
  return activeName;
}

/** List all known databases (built-in + on disk). */
export function listDatabases() {
  const names = new Set(['default', ...databases.keys()]);

  if (fs.existsSync(BASE_DIR)) {
    for (const entry of fs.readdirSync(BASE_DIR)) {
      if (entry === 'default.wal') continue;
      const full = path.join(BASE_DIR, entry);
      if (fs.statSync(full).isDirectory()) names.add(entry);
    }
  }
  return [...names].sort();
}

/** Create a new database on disk (empty). */
export function createDatabase(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid database name: ${name}`);
  }
  if (databases.has(name)) throw new Error(`Database '${name}' already exists`);
  const db = new Database(name, BASE_DIR);  // creates the dir
  databases.set(name, db);
  return name;
}

/** Drop a database — deletes its directory. */
export function dropDatabase(name) {
  if (name === 'default') throw new Error("Cannot drop 'default' database");
  const dir = path.resolve(BASE_DIR, name);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  databases.delete(name);
  if (activeName === name) activeName = 'default';
  return true;
}