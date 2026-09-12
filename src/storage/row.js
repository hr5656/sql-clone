export class Row {
  constructor(data, columns) {
    this.data = {};
    for (const col of columns) {
      const raw = data[col.name];
      this.data[col.name] = col.coerce(raw);
    }
  }

  get(col) {
    return this.data[col];
  }

  set(col, value) {
    this.data[col] = value;
  }

  toJSON() {
    return { ...this.data };
  }

  static fromJSON(obj, columns) {
    return new Row(obj, columns);
  }
}
