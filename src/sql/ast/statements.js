export class CreateTable {
  constructor(name, columns, options = {}) {
    this.kind = 'CreateTable';
    this.name = name;
    this.columns = columns;
    this.options = options;
  }
}

export class Insert {
  constructor(table, columns, values) {
    this.kind = 'Insert';
    this.table = table;
    this.columns = columns; // array or null (positional)
    this.values = values;   // array of rows (each row = array of values)
  }
}

export class Select {
  constructor(columns, table) {
    this.kind = 'Select';
    this.columns = columns; // [{ expr, alias }]
    this.table = table;     // null → constant select
    this.distinct = false;
    this.where = null;
    this.orderBy = null;    // { key: expr, dir: 'ASC'|'DESC' }
    this.limit = null;
    this.offset = null;
  }
}

export class Update {
  constructor(table, assignments, where = null) {
    this.kind = 'Update';
    this.table = table;
    this.assignments = assignments; // [[col, expr], ...]
    this.where = where;
  }
}

export class Delete {
  constructor(table, where = null) {
    this.kind = 'Delete';
    this.table = table;
    this.where = where;
  }
}