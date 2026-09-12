export class SqlError extends Error {
  constructor(message, code = 'SQL_ERROR') {
    super(message);
    this.name = 'SqlError';
    this.code = code;
  }
}

export class ParseError extends SqlError {
  constructor(message) {
    super(message, 'PARSE_ERROR');
    this.name = 'ParseError';
  }
}

export class ExecutionError extends SqlError {
  constructor(message) {
    super(message, 'EXECUTION_ERROR');
    this.name = 'ExecutionError';
  }
}

export class StorageError extends SqlError {
  constructor(message) {
    super(message, 'STORAGE_ERROR');
    this.name = 'StorageError';
  }
}