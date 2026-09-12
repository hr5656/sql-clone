export const TokenType = Object.freeze({
  KEYWORD: 'KEYWORD',
  IDENT: 'IDENT',
  NUMBER: 'NUMBER',
  STRING: 'STRING',
  OPERATOR: 'OPERATOR',
  PUNCT: 'PUNCT',
  EOF: 'EOF',
});

export class Token {
  constructor(type, value, pos = 0) {
    this.type = type;
    this.value = value;
    this.pos = pos;
  }
  toString() {
    return `${this.type}(${this.value})`;
  }
}