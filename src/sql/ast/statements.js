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
    this.columns = columns;
    this.values = values;
  }
}

export class Select {
  constructor(columns, table) {
    this.kind = 'Select';
    this.columns = columns;
    this.table = table;
    this.joins = [];
    this.distinct = false;
    this.where = null;
    this.groupBy = null;
    this.having = null;
    this.orderBy = null;
    this.limit = null;
    this.offset = null;
    this.with_ = null;   // ← new: WITH ctes
  }
}

export class Update {
  constructor(table, assignments, where = null) {
    this.kind = 'Update';
    this.table = table;
    this.assignments = assignments;
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

export class CreateIndex {
  constructor({ name, table, column, unique = false, kind = 'BTREE' }) {
    this.kind = 'CreateIndex';
    this.name = name;
    this.table = table;
    this.column = column;
    this.unique = unique;
    this.indexKind = kind; // 'BTREE' | 'HASH'
  }
}

export class DropIndex {
  constructor({ name }) {
    this.kind = 'DropIndex';
    this.name = name;
  }
}
export class WithQuery {
  constructor(ctes, inner) {
    this.kind = 'With';
    this.ctes = ctes;   // [{ name, query }]
    this.inner = inner; // a Select AST
  }
}

export class SubqueryExpr {
  constructor(query) {
    this.kind = 'Subquery';
    this.query = query; // a Select AST
  }
}

export class BeginTx {
  constructor() { this.kind = 'Begin'; }
}

export class CommitTx {
  constructor() { this.kind = 'Commit'; }
}

export class RollbackTx {
  constructor() { this.kind = 'Rollback'; }
}
export class CreateDatabase {
  constructor(name) {
    this.kind = 'CreateDatabase';
    this.name = name;
  }
}

export class DropDatabase {
  constructor(name) {
    this.kind = 'DropDatabase';
    this.name = name;
  }
}

export class UseDatabase {
  constructor(name) {
    this.kind = 'UseDatabase';
    this.name = name;
  }
}

export class DropTable {
  constructor(name) {
    this.kind = 'DropTable';
    this.name = name;
  }
}