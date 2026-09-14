import { StorageError } from '../../../common/errors.js';

export function createIndex(database, node) {
  const table = database.getTable(node.table);
  if (!table) throw new StorageError(`Table '${node.table}' not found`);

  const col = table.columns.find((c) => c.name === node.column);
  if (!col) throw new StorageError(`Column '${node.column}' not found on table '${node.table}'`);

  // Prevent duplicate index names
  if (database.indexes.getByName(node.name)) {
    throw new StorageError(`Index '${node.name}' already exists`);
  }

  // UNIQUE enforcement at build time
  if (node.unique) {
    const seen = new Set();
    for (const row of table.rows) {
      const v = row.get(node.column);
      if (v === null || v === undefined) continue;
      if (seen.has(v)) {
        throw new StorageError(`UNIQUE index '${node.name}' — duplicate value '${v}' on ${node.column}`);
      }
      seen.add(v);
    }
  }

  // Create in-memory structure
  const idx = database.indexes.createNamed({
    table: node.table,
    column: node.column,
    name: node.name,
    kind: node.indexKind,
    unique: node.unique,
  });

  // Populate
  table.rows.forEach((row, rowId) => idx.insert(row.get(node.column), rowId));

  // Persist metadata on the table
  table.indexes.push({
    name: node.name,
    column: node.column,
    kind: node.indexKind,
    unique: node.unique,
  });
  table.save();

  return {
    ok: true,
    kind: 'create-index',
    name: node.name,
    table: node.table,
    column: node.column,
    indexKind: node.indexKind,
    unique: node.unique,
  };
}