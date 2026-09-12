import { Parser } from '../parser/parser.js';
import * as Ops from './operators/index.js';

export class Executor {
  constructor(database) {
    this.database = database;
  }

  execute(sql) {
    const ast = new Parser(sql).parse();

    switch (ast.kind) {
      case 'CreateTable': return Ops.create(this.database, ast);
      case 'Insert':      return Ops.insert(this.database, ast);
      case 'Select':      return Ops.select(this.database, ast);
      case 'Update':      return Ops.update(this.database, ast);
      case 'Delete':      return Ops.delete(this.database, ast);
      default: throw new Error(`No executor for ${ast.kind}`);
    }
  }
}