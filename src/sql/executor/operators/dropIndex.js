import { StorageError } from '../../../common/errors.js';

export function dropIndex(database, node) {
  const removed = database.indexes.dropByName(node.name);
  if (!removed) throw new StorageError(`Index '${node.name}' not found`);

  // Remove metadata from whichever table had it
  for (const tname of database.listTables()) {
    const t = database.getTable(tname);
    const before = t.indexes.length;
    t.indexes = t.indexes.filter((m) => m.name !== node.name);
    if (t.indexes.length !== before) {
      t.save();
      break;
    }
  }

  return { ok: true, kind: 'drop-index', name: node.name };
}