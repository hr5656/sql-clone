export class Column {
  constructor({ name, type, nullable = true, defaultValue = null, primaryKey = false, unique = false }) {
    if (!name) throw new Error('Column name required');
    if (!type) throw new Error(`Column '${name}' needs a type`);

    this.name = name;
    this.type = String(type).toUpperCase();
    this.nullable = nullable;
    this.defaultValue = defaultValue;
    this.primaryKey = primaryKey;
    this.unique = unique;
  }

  coerce(value) {
    if (value === null || value === undefined) {
      if (!this.nullable && this.defaultValue === null) {
        throw new Error(`Column '${this.name}' cannot be NULL`);
      }
      return this.defaultValue;
    }

    switch (this.type) {
      case 'INT':
      case 'INTEGER': {
        const n = Number(value);
        if (!Number.isInteger(n)) throw new Error(`Column '${this.name}' expects INT`);
        return n;
      }
      case 'FLOAT':
      case 'REAL': {
        const n = Number(value);
        if (Number.isNaN(n)) throw new Error(`Column '${this.name}' expects FLOAT`);
        return n;
      }
      case 'BOOL':
      case 'BOOLEAN':
        return value === true || value === 'true' || value === 1;
      case 'TEXT':
      case 'VARCHAR':
      case 'STRING':
        return String(value);
      default:
        throw new Error(`Unknown type '${this.type}' for column '${this.name}'`);
    }
  }

  toJSON() {
    return {
      name: this.name,
      type: this.type,
      nullable: this.nullable,
      defaultValue: this.defaultValue,
      primaryKey: this.primaryKey,
      unique: this.unique,
    };
  }
}