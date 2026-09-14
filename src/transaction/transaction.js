export class Transaction {
  constructor(id) {
    this.id = id;
    this.state = 'ACTIVE';        // ACTIVE | COMMITTED | ROLLED_BACK
    this.undoLog = [];            // [ () => void ]
    this.touchedTables = new Set();
    this.startTime = Date.now();
  }

  /** Register an undo callback. Called during execution for every mutation. */
  record(undoFn, tableName) {
    if (this.state !== 'ACTIVE') throw new Error('Transaction is not active');
    this.undoLog.push(undoFn);
    if (tableName) this.touchedTables.add(tableName);
  }

  commit() {
    if (this.state !== 'ACTIVE') throw new Error(`Cannot commit from state ${this.state}`);
    this.state = 'COMMITTED';
    this.undoLog = [];
  }

  rollback() {
    if (this.state !== 'ACTIVE') throw new Error(`Cannot rollback from state ${this.state}`);
    // LIFO
    for (let i = this.undoLog.length - 1; i >= 0; i--) {
      try { this.undoLog[i](); }
      catch (e) { console.error('[tx] undo failed:', e.message); }
    }
    this.state = 'ROLLED_BACK';
    this.undoLog = [];
  }
}