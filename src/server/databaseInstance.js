import { Database } from '../storage/database.js';

let instance = null;

export function getDatabase(name = 'default') {
  if (!instance) instance = new Database(name);
  return instance;
}