import { Token, TokenType } from './token.js';
import { ParseError } from '../../common/errors.js';

const KEYWORDS = new Set([
  'CREATE','TABLE','INSERT','INTO','VALUES','SELECT','FROM','WHERE','UPDATE','SET',
  'DELETE','ORDER','BY','LIMIT','OFFSET','DISTINCT','CASE','WHEN','THEN','ELSE','END',
  'GROUP','HAVING','COUNT','SUM','AVG','MIN','MAX','INNER','LEFT','RIGHT','CROSS','JOIN',
  'ON','PRIMARY','KEY','FOREIGN','REFERENCES','UNIQUE','NOT','NULL','CHECK','DEFAULT',
  'WITH','OVER','PARTITION','AS','AND','OR','BEGIN','COMMIT','ROLLBACK','TRANSACTION',
  'EXPLAIN','INDEX','HASH','BTREE',
  'IN','EXISTS','ROW_NUMBER','RANK','DENSE_RANK',
  'INT','INTEGER','FLOAT','REAL','TEXT','VARCHAR','STRING','BOOL','BOOLEAN',
  'TRUE','FALSE', 'DATABASE','DATABASES','USE',
]);

const PUNCT = new Set(['(', ')', ',', ';', '*', '.']);

export class Lexer {
  constructor(input) {
    this.input = input;
    this.pos = 0;
  }

  tokenize() {
    const tokens = [];
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos];

      // whitespace
      if (/\s/.test(ch)) { this.pos++; continue; }

      // line comment: -- ... \n
      if (ch === '-' && this.input[this.pos + 1] === '-') {
        while (this.pos < this.input.length && this.input[this.pos] !== '\n') this.pos++;
        continue;
      }

      // block comment: /* ... */
      if (ch === '/' && this.input[this.pos + 1] === '*') {
        this.pos += 2;
        while (this.pos < this.input.length &&
               !(this.input[this.pos] === '*' && this.input[this.pos + 1] === '/')) this.pos++;
        this.pos += 2;
        continue;
      }

      if (/[A-Za-z_]/.test(ch))                     { tokens.push(this.readIdent());    continue; }
      if (/[0-9]/.test(ch))                         { tokens.push(this.readNumber());   continue; }
      if (ch === "'" || ch === '"')                 { tokens.push(this.readString(ch)); continue; }
      if (PUNCT.has(ch))                            { tokens.push(new Token(TokenType.PUNCT, ch, this.pos++)); continue; }
      if ('=<>!+-/%|'.includes(ch))                 { tokens.push(this.readOperator()); continue; }

      throw new ParseError(`Unexpected character '${ch}' at position ${this.pos}`);
    }
    tokens.push(new Token(TokenType.EOF, null, this.pos));
    return tokens;
  }

  readIdent() {
    const start = this.pos;
    while (this.pos < this.input.length && /[A-Za-z0-9_]/.test(this.input[this.pos])) this.pos++;
    const word = this.input.slice(start, this.pos);
    const upper = word.toUpperCase();
    if (KEYWORDS.has(upper)) return new Token(TokenType.KEYWORD, upper, start);
    return new Token(TokenType.IDENT, word, start);
  }

  readNumber() {
    const start = this.pos;
    let dot = false;
    while (this.pos < this.input.length) {
      const c = this.input[this.pos];
      if (c === '.') { if (dot) break; dot = true; this.pos++; continue; }
      if (!/[0-9]/.test(c)) break;
      this.pos++;
    }
    const text = this.input.slice(start, this.pos);
    return new Token(TokenType.NUMBER, dot ? parseFloat(text) : parseInt(text, 10), start);
  }

  readString(quote) {
    this.pos++;
    let out = '';
    while (this.pos < this.input.length && this.input[this.pos] !== quote) {
      if (this.input[this.pos] === '\\' && this.input[this.pos + 1] === quote) {
        out += quote; this.pos += 2; continue;
      }
      out += this.input[this.pos++];
    }
    if (this.pos >= this.input.length) throw new ParseError('Unterminated string literal');
    this.pos++;
    return new Token(TokenType.STRING, out, this.pos);
  }

  readOperator() {
    const start = this.pos;
    const two = this.input.slice(this.pos, this.pos + 2);
    if (['<=', '>=', '<>', '!='].includes(two)) {
      this.pos += 2;
      return new Token(TokenType.OPERATOR, two, start);
    }
    const ch = this.input[this.pos++];
    return new Token(TokenType.OPERATOR, ch, start);
  }
}