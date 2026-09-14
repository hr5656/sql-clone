import { Parser } from '../parser/parser.js';
import * as Ops from './operators/index.js';
import { planAccess } from './optimizer.js';

export class Executor {
  constructor(database, session = null) {
    this.database = database;
    this.session = session;
  }

  execute(sql) {
    const ast = new Parser(sql).parse();

    if (ast.kind === 'Explain') return this.explain(ast.inner);

    if (ast.kind === 'With') {
      // fold CTEs into the inner Select
      ast.inner.with_ = ast.ctes;
      return this.executeAST(ast.inner);
    }

    return this.executeAST(ast);
  }

  executeAST(ast) {
    const s = this.session;

    switch (ast.kind) {
      // ----- transaction control -----
      case 'Begin': {
        if (!this.session) throw new Error('No session attached to executor');
        const tx = this.session.begin();
        return { ok: true, kind: 'begin', txId: tx.id };
      }
      case 'Commit': {
        if (!this.session) throw new Error('No session attached to executor');
        const tx = this.session.commit(this.database);
        return { ok: true, kind: 'commit', txId: tx.id };
      }
      case 'Rollback': {
        if (!this.session) throw new Error('No session attached to executor');
        const tx = this.session.rollback(this.database);
        return { ok: true, kind: 'rollback', txId: tx.id };
      }

      // ----- DDL -----
      case 'CreateTable': return Ops.create(this.database, ast);
      case 'CreateIndex': return Ops.createIndex(this.database, ast);
      case 'DropIndex':   return Ops.dropIndex(this.database, ast);

      // ----- DML -----
      case 'Insert':      return Ops.insert(this.database, ast, s);
      case 'Select':      return Ops.select(this.database, ast);
      case 'Update':      return Ops.update(this.database, ast, s);
      case 'Delete':      return Ops.delete(this.database, ast, s);

      default: throw new Error(`No executor for ${ast.kind}`);
    }
  }

  explain(node) {
    if (node.kind !== 'Select' || !node.table) {
      return { ok: true, kind: 'explain', plan: [{ step: 'constant' }] };
    }
    const access = planAccess(node.table, node, this.database.indexes);
    return {
      ok: true,
      kind: 'explain',
      plan: [
        { step: 'access', ...access },
        node.where ?   { step: 'filter', on: 'access' } : null,
        node.groupBy ? { step: 'group', keys: node.groupBy.length } : null,
        node.orderBy ? { step: 'sort', dir: node.orderBy.dir } : null,
        node.limit != null ? { step: 'limit', n: node.limit } : null,
      ].filter(Boolean),
    };
  }
}