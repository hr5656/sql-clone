import { Parser } from '../parser/parser.js';
import * as Ops from './operators/index.js';
import { planAccess } from './optimizer.js';
import { createDatabase, dropDatabase } from '../../server/databaseManager.js';

export class Executor {
  /**
   * @param {() => import('../../storage/database.js').Database} dbResolver
   * @param {import('../../transaction/session.js').Session | null} session
   */
  constructor(dbResolver, session = null) {
    this._resolveDb = typeof dbResolver === 'function' ? dbResolver : () => dbResolver;
    this.session = session;
  }

  get database() {
    const db = this._resolveDb();
    if (!db) throw new Error('Executor has no active database');
    return db;
  }

  execute(sql) {
    const ast = new Parser(sql).parse();
    if (ast.kind === 'Explain') return this.explain(ast.inner);
    if (ast.kind === 'With') {
      ast.inner.with_ = ast.ctes;
      return this.executeAST(ast.inner);
    }
    return this.executeAST(ast);
  }

  executeAST(ast) {
    const s = this.session;
    switch (ast.kind) {
      case 'Begin':    return { ok: true, kind: 'begin',    txId: this.session.begin().id };
      case 'Commit':   return { ok: true, kind: 'commit',   txId: this.session.commit(this.database).id };
      case 'Rollback': return { ok: true, kind: 'rollback', txId: this.session.rollback(this.database).id };

      case 'CreateDatabase': createDatabase(ast.name);
        return { ok: true, kind: 'create-database', name: ast.name };
      case 'DropDatabase':   dropDatabase(ast.name);
        return { ok: true, kind: 'drop-database', name: ast.name };
      case 'UseDatabase':
        // Protocol intercepts USE to reset WAL + session. Reaching here means
        // someone ran USE from a context that doesn't route through Protocol.
        return { ok: true, kind: 'use-database', name: ast.name };

      case 'CreateTable': return Ops.create(this.database, ast);
      case 'CreateIndex': return Ops.createIndex(this.database, ast);
      case 'DropIndex':   return Ops.dropIndex(this.database, ast);
      case 'DropTable':   return Ops.dropTable(this.database, ast);

      case 'Insert': return Ops.insert(this.database, ast, s);
      case 'Select': return Ops.select(this.database, ast);
      case 'Update': return Ops.update(this.database, ast, s);
      case 'Delete': return Ops.delete(this.database, ast, s);

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