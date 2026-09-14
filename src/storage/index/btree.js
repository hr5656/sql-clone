export class BTreeIndex {
  constructor(column) {
    this.column = column;
    this.keys = [];        // sorted array of keys
    this.rowIdsByKey = new Map(); // key -> [rowIds]
  }

  insert(key, rowId) {
    if (key === null || key === undefined) return;

    if (!this.rowIdsByKey.has(key)) {
      this.rowIdsByKey.set(key, []);
      // binary insert into sorted keys
      const i = this._lowerBound(key);
      this.keys.splice(i, 0, key);
    }
    this.rowIdsByKey.get(key).push(rowId);
  }

  /** Exact match → array of rowIds */
  find(key) {
    return this.rowIdsByKey.get(key) || [];
  }

  /** Inclusive range [from, to]. Either bound may be null (= open). */
  range(from, to) {
    const out = [];
    for (const k of this.keys) {
      if (from !== null && k < from) continue;
      if (to !== null && k > to) break;
      out.push(...this.rowIdsByKey.get(k));
    }
    return out;
  }

  /** <, <=, >, >= helpers */
  lessThan(key, inclusive = false) {
    const out = [];
    for (const k of this.keys) {
      if (inclusive ? k > key : k >= key) break;
      out.push(...this.rowIdsByKey.get(k));
    }
    return out;
  }
  greaterThan(key, inclusive = false) {
    const out = [];
    for (const k of this.keys) {
      if (inclusive ? k < key : k <= key) continue;
      out.push(...this.rowIdsByKey.get(k));
    }
    return out;
  }

  /** Remove one rowId for a key. */
  remove(key, rowId) {
    const list = this.rowIdsByKey.get(key);
    if (!list) return false;
    const i = list.indexOf(rowId);
    if (i === -1) return false;
    list.splice(i, 1);
    if (list.length === 0) {
      this.rowIdsByKey.delete(key);
      const ki = this.keys.indexOf(key);
      if (ki !== -1) this.keys.splice(ki, 1);
    }
    return true;
  }

  size() {
    return this.keys.length;
  }

  _lowerBound(key) {
    let lo = 0, hi = this.keys.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.keys[mid] < key) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  toJSON() {
    const entries = [];
    for (const k of this.keys) entries.push([k, this.rowIdsByKey.get(k)]);
    return { type: 'btree', column: this.column, entries };
  }

  static fromJSON(obj) {
    const idx = new BTreeIndex(obj.column);
    for (const [k, ids] of obj.entries || []) {
      idx.keys.push(k);
      idx.rowIdsByKey.set(k, ids.slice());
    }
    return idx;
  }
}