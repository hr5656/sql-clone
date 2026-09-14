export class HashIndex {
  constructor(column) {
    this.column = column;
    this.map = new Map(); // key -> Set(rowId)
  }

  insert(key, rowId) {
    if (key === null || key === undefined) return;
    if (!this.map.has(key)) this.map.set(key, new Set());
    this.map.get(key).add(rowId);
  }

  find(key) {
    const s = this.map.get(key);
    return s ? [...s] : [];
  }

  remove(key, rowId) {
    const s = this.map.get(key);
    if (!s) return false;
    const had = s.delete(rowId);
    if (s.size === 0) this.map.delete(key);
    return had;
  }

  size() {
    return this.map.size;
  }

  toJSON() {
    const entries = [];
    for (const [k, s] of this.map) entries.push([k, [...s]]);
    return { type: 'hash', column: this.column, entries };
  }

  static fromJSON(obj) {
    const idx = new HashIndex(obj.column);
    for (const [k, ids] of obj.entries || []) {
      idx.map.set(k, new Set(ids));
    }
    return idx;
  }
}