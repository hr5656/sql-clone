import { Transaction } from './transaction.js';

let TX_COUNTER = 1;

export class Session {
  constructor({ wal }) {
    this.wal = wal;
    this.currentTx = null;
  }

  inTransaction() {
    return this.currentTx !== null && this.currentTx.state === 'ACTIVE';
  }

  begin() {
    if (this.inTransaction()) throw new Error('Transaction already in progress');
    this.currentTx = new Transaction(TX_COUNTER++);
    this.wal.append({ type: 'BEGIN', txId: this.currentTx.id });
    return this.currentTx;
  }

  commit(database) {
    if (!this.inTransaction()) throw new Error('No transaction in progress');
    const tx = this.currentTx;

    // Flush touched tables to disk
    for (const tname of tx.touchedTables) {
      const t = database.getTable(tname);
      if (t) t.save();
    }

    this.wal.append({ type: 'COMMIT', txId: tx.id });
    tx.commit();
    this.wal.clear();         // checkpoint
    this.currentTx = null;
    return tx;
  }

  rollback(database) {
    if (!this.inTransaction()) throw new Error('No transaction in progress');
    const tx = this.currentTx;
    tx.rollback();

    // Rebuild indexes for touched tables (rows reverted)
    for (const tname of tx.touchedTables) {
      const t = database.getTable(tname);
      if (t) {
        t.save();
        database.indexes.rebuild(tname, t);
      }
    }

    this.wal.append({ type: 'ROLLBACK', txId: tx.id });
    this.wal.clear();
    this.currentTx = null;
    return tx;
  }
}