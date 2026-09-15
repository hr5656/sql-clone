# Relation database system

#Open-source


**A SQL database engine + browser UI, built from scratch in Node.js.**

<div style="text-align:center">
<img src="images/logo.png" alt="Hsql Logo" width="600" height="600"/>


[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-success.svg)](#)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

Hand-written lexer, parser, planner, executor · B-Tree & Hash indexes · Transactions with WAL · Dark-mode web console

[Quick Start](#quick-start) · [Features](#features) · [Architecture](#architecture) · [Contributing](#contributing)

</div>

---

## What Is This?

A complete relational database, written from zero in plain JavaScript.
No ORMs. No query libraries. No npm dependencies.

Every layer is a few hundred lines of code you can open, read, and modify:

- **Engine** — TCP server, wire protocol, connection state
- **SQL frontend** — lexer, recursive-descent parser, AST
- **Planner** — rule-based optimizer with index selection
- **Executor** — operators for filter, sort, group, join, aggregate, window
- **Storage** — databases, tables, typed columns, persisted rows
- **Indexes** — B-Tree for ranges, Hash for equality
- **Transactions** — session, undo log, write-ahead log, crash recovery
- **UI** — dark-mode browser console with editor, results, schema sidebar

It's the whole stack, wired end to end.

---



## Quick Start

```bash
git clone https://github.com/hr5656/sql-clone
cd sql-clone
npm run dev




A SQL database engine and browser UI, written from scratch in Node.js.

No dependencies, no ORMs, no query libraries. Just TCP sockets, JSON files, and a hand-written parser, planner, and executor.





---

## What's Inside

- **TCP server** — length-prefixed message protocol on port `5433`
- **SQL engine** — lexer, parser, AST, executor, query optimizer
- **Storage** — databases, tables, columns, rows persisted to JSON
- **Indexes** — B-Tree and Hash indexes for `WHERE` acceleration
- **Transactions** — `BEGIN` / `COMMIT` / `ROLLBACK` with undo log and WAL recovery
- **Web UI** — dark-mode browser console with query editor, results table, history, schema sidebar, autocomplete, CSV/JSON export

---

## Requirements

- Node.js **≥ 20**
- A modern browser (Chrome, Firefox, Edge, Safari)

No npm packages required.

---

## Install & Run

```bash
git clone <this-repo> sql-clone
cd sql-clone
npm run dev
You should see:

text
[sql-clone] listening on tcp://0.0.0.0:5433
[web] http://localhost:8080
Open http://localhost:8080 for the browser UI.

Quick Start
Browser
Open http://localhost:8080 and run:

sql
CREATE TABLE users (id INT PRIMARY KEY, name TEXT, age INT);
INSERT INTO users VALUES (1, 'alice', 30), (2, 'bob', 25), (3, 'carol', 40);
SELECT name, age FROM users WHERE age > 26 ORDER BY age DESC;
CLI
bash
node client.js
Then paste:

text
CREATE TABLE users (id INT PRIMARY KEY, name TEXT, age INT);
INSERT INTO users VALUES (1, 'alice', 30), (2, 'bob', 25), (3, 'carol', 40);
SELECT * FROM users;
Raw socket
bash
printf '\x00\x00\x00\x12SELECT 1 + 2 AS three;' | nc -q 1 127.0.0.1 5433
Feature Coverage
Feature	Status
CREATE TABLE with types	✅
PRIMARY KEY, UNIQUE, NOT NULL, DEFAULT	✅
INSERT (single + multi-row)	✅
SELECT with projections + aliases	✅
WHERE, ORDER BY, LIMIT, OFFSET, DISTINCT	✅
CASE WHEN ... THEN ... ELSE ... END	✅
Arithmetic + comparison operators	✅
GROUP BY, HAVING	✅
COUNT, SUM, AVG, MIN, MAX	✅
INNER JOIN, LEFT JOIN, RIGHT JOIN, CROSS JOIN	✅
UPDATE ... WHERE, DELETE ... WHERE	✅
B-Tree + Hash indexes	✅
CREATE INDEX, CREATE UNIQUE INDEX, DROP INDEX	✅
EXPLAIN (query plan)	✅
Common Table Expressions (WITH)	✅
Subqueries (IN, EXISTS, scalar)	✅
Window functions (ROW_NUMBER, RANK, DENSE_RANK, SUM() OVER)	✅
Transactions (BEGIN / COMMIT / ROLLBACK)	✅
Write-Ahead Log with crash recovery	✅
Multi-database (CREATE DATABASE, USE)	✅
DROP TABLE, DROP DATABASE	✅
Project Layout
text
sql-clone/
├── package.json
├── README.md
├── client.js                   ← interactive CLI client
├── data/                       ← runtime databases (gitignored)
├── public/                     ← browser UI
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── media/logo.png
├── docs/
│   ├── architecture.md
│   ├── sql_grammar.ebnf
│   └── phase_notes.md
├── tests/
│   ├── helpers.js
│   └── phase*.test.js
└── src/
    ├── index.js                ← server entry point
    ├── server/
    │   ├── tcpServer.js        ← TCP listener
    │   ├── connection.js       ← per-connection state
    │   ├── protocol.js         ← framing + SQL dispatch
    │   ├── databaseManager.js  ← multi-DB registry
    │   └── webServer.js        ← HTTP + static + API
    ├── storage/
    │   ├── database.js         ← catalog of tables
    │   ├── table.js            ← rows + persistence
    │   ├── column.js           ← types + coercion
    │   ├── row.js              ← row wrapper
    │   ├── page.js
    │   ├── diskManager.js
    │   ├── walRecovery.js
    │   ├── constraints/
    │   │   ├── primaryKey.js
    │   │   ├── foreignKey.js
    │   │   ├── unique.js
    │   │   ├── notNull.js
    │   │   ├── check.js
    │   │   └── default.js
    │   └── index/
    │       ├── btree.js
    │       ├── hashIndex.js
    │       └── indexManager.js
    ├── sql/
    │   ├── lexer/
    │   │   ├── token.js
    │   │   └── lexer.js
    │   ├── parser/
    │   │   ├── parser.js
    │   │   └── grammar.js
    │   ├── ast/
    │   │   ├── statements.js
    │   │   ├── expressions.js
    │   │   └── clauses.js
    │   └── executor/
    │       ├── executor.js
    │       ├── planner.js
    │       ├── optimizer.js
    │       ├── eval.js
    │       └── operators/
    │           ├── create.js
    │           ├── createIndex.js
    │           ├── dropIndex.js
    │           ├── dropTable.js
    │           ├── insert.js
    │           ├── select.js
    │           ├── update.js
    │           ├── delete.js
    │           ├── filter.js
    │           ├── sort.js
    │           ├── limit.js
    │           ├── distinct.js
    │           ├── case.js
    │           ├── aggregate.js
    │           ├── groupBy.js
    │           ├── having.js
    │           ├── join.js
    │           ├── cte.js
    │           ├── subquery.js
    │           └── window.js
    ├── transaction/
    │   ├── transaction.js
    │   ├── session.js
    │   ├── lockManager.js
    │   └── wal.js
    └── common/
        ├── errors.js
        ├── types.js
        └── utils.js
Architecture
text
┌────────────────────────────────────────────────────────┐
│  Browser / CLI                                         │
└───────────────────┬────────────────────────────────────┘
                    │ TCP :5433 (length-prefixed JSON)
┌───────────────────▼────────────────────────────────────┐
│  TcpServer → Connection → Protocol                     │
│     • frames messages                                  │
│     • dispatches BEGIN/COMMIT/ROLLBACK                 │
│     • forwards SQL to Executor                         │
└───────────────────┬────────────────────────────────────┘
                    │
┌───────────────────▼────────────────────────────────────┐
│  SQL Frontend                                          │
│    Lexer → Parser → AST                                │
└───────────────────┬────────────────────────────────────┘
                    │
┌───────────────────▼────────────────────────────────────┐
│  Executor                                              │
│    Planner → Optimizer → Operators                     │
│    (select, insert, update, delete, joins, groups)     │
└───────────────────┬────────────────────────────────────┘
                    │
┌───────────────────▼────────────────────────────────────┐
│  Storage Engine                                        │
│    Database → Table → Column / Row                     │
│    IndexManager (B-Tree, Hash)                         │
└───────────────────┬────────────────────────────────────┘
                    │
┌───────────────────▼────────────────────────────────────┐
│  Disk                                                  │
│    data/<db>/<table>.tbl (JSON)                        │
│    data/<db>.wal (append-only)                         │
└────────────────────────────────────────────────────────┘
Wire Protocol
Every message is:

text
[4 bytes big-endian length][UTF-8 payload]
Request payload: a SQL string.

Response payload: a JSON object.

Success:

json
{ "ok": true, "kind": "select", "rowCount": 2, "rows": [...] }
Error:

json
{ "ok": false, "code": "PARSE_ERROR", "error": "Expected '(', got ',' at 34" }
SQL Reference
DDL
sql
CREATE TABLE users (
  id INT PRIMARY KEY,
  name TEXT NOT NULL,
  age INT DEFAULT 0,
  email TEXT UNIQUE
);

CREATE INDEX idx_users_age ON users(age);
CREATE UNIQUE INDEX idx_users_email ON users(email);
DROP INDEX idx_users_age;
DROP TABLE users;

CREATE DATABASE analytics;
USE analytics;
DROP DATABASE analytics;
DML
sql
INSERT INTO users VALUES (1, 'alice', 30, 'a@x.com');
INSERT INTO users (id, name, age) VALUES (2, 'bob', 25), (3, 'carol', 40);

UPDATE users SET age = age + 1 WHERE name = 'bob';
DELETE FROM users WHERE age < 18;
Queries
sql
SELECT * FROM users;
SELECT DISTINCT age FROM users ORDER BY age DESC LIMIT 5 OFFSET 10;

SELECT name,
       CASE WHEN age >= 30 THEN 'senior' ELSE 'junior' END AS bucket
FROM users;

SELECT dept, COUNT(*) AS n, SUM(salary) AS total
FROM emp
GROUP BY dept
HAVING SUM(salary) > 100
ORDER BY total DESC;

SELECT emp.name, dept.name AS dept
FROM emp INNER JOIN dept ON emp.dept_id = dept.id
WHERE emp.salary > 100
ORDER BY emp.name;

WITH top AS (SELECT * FROM emp WHERE salary > 100)
SELECT name FROM top ORDER BY name;

SELECT name FROM emp WHERE dept IN (SELECT dept FROM emp WHERE salary > 120);

SELECT name, dept, salary,
       ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC) AS rn
FROM emp;
Transactions
sql
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;
sql
BEGIN;
DELETE FROM users WHERE age > 100;
ROLLBACK;
Introspection
sql
EXPLAIN SELECT * FROM users WHERE age > 30;
Storage Format
data/<db>/<table>.tbl
json
{
  "name": "users",
  "columns": [
    { "name": "id", "type": "INT", "nullable": false, "primaryKey": true },
    { "name": "name", "type": "TEXT", "nullable": false }
  ],
  "rows": [
    { "id": 1, "name": "alice" },
    { "id": 2, "name": "bob" }
  ],
  "indexes": [
    { "name": "idx_users_name", "column": "name", "kind": "BTREE", "unique": false }
  ]
}
data/<db>.wal
Append-only JSONL. One record per line:

json
{"type":"BEGIN","txId":1,"ts":...}
{"type":"MUTATE","txId":1,"table":"users","rows":[...],"ts":...}
{"type":"COMMIT","txId":1,"ts":...}
On startup, if the last record is not COMMIT / ROLLBACK, the server logs a crashed transaction and truncates the WAL.

Web UI
Region	Purpose
Topbar	Logo, database picker, connection status, "New session"
Left rail	Query history (click to reload), table list with schema
Query pane	Editor, run with Ctrl+Enter, autocomplete with Ctrl+Space
Result pane	Table or message; CSV / JSON export buttons
Footer	Project credit
Keyboard shortcuts
Ctrl / ⌘ + Enter — run query

Ctrl / ⌘ + Space — autocomplete

Tab — insert two spaces

Esc — close autocomplete

Session model
Each browser tab has a stable session ID (in sessionStorage) mapped to one persistent TCP socket on the web server. This keeps transactions per-tab: BEGIN in one tab doesn't affect another.

Use New session to drop the socket and start fresh.

Tests
bash
npm test
Runs the Node.js built-in test runner against tests/*.test.js.

To run a single file:

bash
node --test tests/phase3_crud.test.js
Development
Run with auto-reload:

bash
npm run dev
Watch the server terminal for [sql] lines and any [sql error] messages.

To reset all data:

bash
rm -rf data
Configuration
Environment variables:

Variable	Default	Purpose
PORT	5433	TCP engine port
WEB_PORT	8080	HTTP UI port
HOST	0.0.0.0	Bind address
Example:

bash
WEB_PORT=9090 npm run dev
Known Limitations
Single-process, single-machine. No replication or clustering.

Isolation is per-connection, not MVCC. Two sessions writing the same table will both see the other's uncommitted changes.

FOREIGN KEY and CHECK parsing is present but enforcement is partial.

Cost-based query planning is not implemented; the optimizer is rule-based.

Index metadata is persisted; actual index structures are rebuilt on startup.

No ALTER TABLE.

No streaming results — every result set is materialized in memory.

Non-Goals
Wire compatibility with PostgreSQL / MySQL

SQL-92 conformance

Distributed execution

Full ACID with two-phase commit

License
MIT. See LICENSE if provided.

Author
Harshit Rajput

text

---

## To Use This

```bash
cat > README.md <<'ENDOFFILE'
# SQL Clone

A SQL database engine and browser UI, written from scratch in Node.js.
... (paste the full text above)
ENDOFFILE
Or just create the file in your editor and paste the content.

Optional Additions
If you want a lighter README (just the essentials), here's a minimal version:

markdown
# SQL Clone

A SQL database engine + browser UI in Node.js. No dependencies.

## Run

```bash
npm run dev
Web UI: http://localhost:8080

TCP engine: 127.0.0.1:5433

Quick test
sql
CREATE TABLE users (id INT PRIMARY KEY, name TEXT);
INSERT INTO users VALUES (1, 'alice'), (2, 'bob');
SELECT * FROM users;
Features
CREATE/INSERT/SELECT/UPDATE/DELETE · WHERE · ORDER BY · GROUP BY · HAVING · JOINs · CASE · Subqueries · CTEs · Window functions · Indexes · Transactions · WAL recovery · Multi-database · CSV/JSON export.

Structure
src/server/ — TCP + HTTP

src/sql/ — lexer, parser, executor

src/storage/ — tables, indexes

src/transaction/ — sessions, WAL

public/ — web UI

License
MIT · Harshit Rajput

text

Pick whichever fits your audience. The full one is good for a portfolio project; the short one is good if the code is self-explanatory.
