import { StorageError } from '../../../common/errors.js';

export function dropTable(database, node) {
  if (!database.getTable(node.name)) {
    throw new StorageError(`Table '${node.name}' not found`);
  }
  database.dropTable(node.name);
  return { ok: true, kind: 'drop-table', table: node.name };
}