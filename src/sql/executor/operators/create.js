export function create(database, node) {
  database.createTable({ name: node.name, columns: node.columns });
  return { ok: true, kind: 'create', table: node.name };
}