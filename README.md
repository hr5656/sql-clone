<div align="center">

# relational database

**A SQL database engine + browser UI, built from scratch in Node.js.**

Hand-written lexer · recursive-descent parser · rule-based planner ·
B-Tree & Hash indexes · transactions with WAL · dark-mode web console

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-success.svg)](#)
[![Tests](https://img.shields.io/badge/tests-90%2F90-brightgreen.svg)](#tests)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](#docker)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Quick Start](#quick-start) · [Docker](#docker) · [Features](#features) ·
[Architecture](#architecture) · [Tests](#tests) · [Contributing](#contributing)

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
You should see:

text
[sql-clone] listening on tcp://0.0.0.0:5433
[web] http://localhost:8080
Open http://localhost:8080 for the browser UI.

Try it in the browser
sql
CREATE TABLE users (id INT PRIMARY KEY, name TEXT, age INT);
INSERT INTO users VALUES (1, 'alice', 30), (2, 'bob', 25), (3, 'carol', 40);
SELECT name, age FROM users WHERE age > 26 ORDER BY age DESC;
Try it from the CLI
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
Docker
Run the whole stack — engine + web UI — in a container.

Production
bash
docker compose up -d --build
Web UI: http://localhost:8080

TCP engine: 127.0.0.1:5433

Data persists in the sql-clone-data volume

Verify:

bash
curl -s http://localhost:8080/api/health
# {"ok":true,"sessions":0}

docker compose ps
# NAME         IMAGE              STATUS                   PORTS
# sql-clone    sql-clone:latest   Up 3 seconds (healthy)   0.0.0.0:5433->5433/tcp, 0.0.0.0:8080->8080/tcp
Development (hot reload)
bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
Source files are bind-mounted, so edits to src/ and public/ reload instantly.

Common commands
bash
docker compose logs -f           # follow logs
docker compose restart           # restart
docker compose down              # stop
docker compose down -v           # stop + wipe data
docker compose exec sql-clone sh # shell inside the container
docker inspect --format='{{.State.Health.Status}}' sql-clone
Files
File	Purpose
Dockerfile	Single-stage build, Alpine base, non-root user, healthcheck
docker-compose.yml	Production: ports, health check, persistent volume
docker-compose.dev.yml	Dev overlay: source mounts, hot reload, separate volume
.dockerignore	Excludes node_modules, data/, .git/
.env.example	Documents environment variables
Image is ~55 MB, runs as non-root, auto-restarts, and passes its own healthcheck.

Features
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
Browser UI with autocomplete, history, CSV/JSON export	✅
Docker + Compose	✅
90/90 test suite passing	✅
Requirements
Node.js ≥ 20 (uses the built-in test runner and modern ESM)

A modern browser (Chrome, Firefox, Edge, Safari)

Optional: Docker + Compose for containerized deployment

No npm packages required.

Use .nvmrc to pin the version:

bash
nvm use    # picks up node 20 from .nvmrc
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
Wire protocol
Every message:

text
[4 bytes big-endian length][UTF-8 payload]
Request: a SQL string. Response: a JSON object.

json
{ "ok": true, "kind": "select", "rowCount": 2, "rows": [...] }
json
{ "ok": false, "code": "PARSE_ERROR", "error": "Expected '(', got ',' at 34" }
Storage format
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
data/<db>.wal — append-only JSONL. One record per line:

json
{"type":"BEGIN","txId":1,"ts":...}
{"type":"MUTATE","txId":1,"table":"users","rows":[...],"ts":...}
{"type":"COMMIT","txId":1,"ts":...}
On startup, if the last record is not COMMIT / ROLLBACK, the server logs a crashed transaction and truncates the WAL.

Project Layout
text
sql-clone/
├── package.json
├── README.md
├── Dockerfile
├── docker-compose.yml
├── docker-compose.dev.yml
├── .dockerignore
├── .env.example
├── .nvmrc
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
    ├── index.js
    ├── server/
    │   ├── tcpServer.js
    │   ├── connection.js
    │   ├── protocol.js
    │   ├── databaseManager.js
    │   └── webServer.js
    ├── storage/
    │   ├── database.js
    │   ├── table.js
    │   ├── column.js
    │   ├── row.js
    │   ├── page.js
    │   ├── diskManager.js
    │   ├── walRecovery.js
    │   ├── constraints/
    │   └── index/
    ├── sql/
    │   ├── lexer/
    │   ├── parser/
    │   ├── ast/
    │   └── executor/
    │       └── operators/
    ├── transaction/
    │   ├── transaction.js
    │   ├── session.js
    │   ├── lockManager.js
    │   └── wal.js
    └── common/
        ├── errors.js
        ├── types.js
        └── utils.js
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
Each browser tab has a stable session ID (in sessionStorage) mapped to one persistent TCP socket on the web server. Transactions are per-tab: BEGIN in one tab doesn't affect another. Use New session to drop the socket and start fresh.

Tests
90/90 passing. Runs on Node 20+ with the built-in test runner. No framework, no dependencies.

bash
npm test
Sample output:

text
# tests 90
# suites 1
# pass 90
# fail 0
# duration_ms 3620.84
Coverage
File	Tests	Coverage
phase1_server.test.js	5	TCP server, framing, concurrency
phase2_parser.test.js	20	Lexer, parser, AST
phase3_crud.test.js	12	CREATE, INSERT, UPDATE, DELETE, persistence
phase4_clauses.test.js	10	WHERE, ORDER BY, LIMIT, DISTINCT, CASE
phase5_aggregates.test.js	8	COUNT/SUM/AVG/MIN/MAX, GROUP BY, HAVING
phase6_joins.test.js	6	INNER, LEFT, RIGHT, CROSS
phase7_constraints.test.js	7	PK, UNIQUE, NOT NULL, DEFAULT
phase8_indexes.test.js	9	B-Tree, Hash, EXPLAIN, persistence
phase9_advanced.test.js	13	CTEs, subqueries, window functions
phase10_transactions.test.js	8	BEGIN, COMMIT, ROLLBACK, WAL
Run a single file:

bash
node --test tests/phase3_crud.test.js
Note on Node version
The test suite uses before() and --test-reporter=spec, both of which require Node 20.6+. If npm test fails with before() did not fire or node: bad option: --test-reporter, upgrade Node:

bash
nvm install 20
nvm use 20
The .nvmrc file in the repo root pins the correct version — just run nvm use to pick it up.

Development
Auto-reload while editing source:

bash
npm run dev
Watch the server terminal for [sql] lines and any [sql error] messages.

Reset all data:

bash
rm -rf data
Configuration
Variable	Default	Purpose
PORT	5433	TCP engine port
WEB_PORT	8080	HTTP UI port
HOST	0.0.0.0	Bind address
Example:

bash
WEB_PORT=9090 npm run dev
Known Limitations
Single-process, single-machine. No replication or clustering.

Isolation is per-connection, not MVCC. Two sessions writing the same table will both see each other's uncommitted changes.

FOREIGN KEY and CHECK parsing is present but enforcement is partial.

Cost-based query planning is not implemented; the optimizer is rule-based.

Index metadata is persisted; actual index structures are rebuilt on startup.

No ALTER TABLE.

No streaming results — every result set is materialized in memory.

Non-Goals
Wire compatibility with PostgreSQL / MySQL

Full SQL-92 conformance

Distributed execution

Complete ACID with two-phase commit

Contributing
See CONTRIBUTING.md. Small, focused PRs are welcome.

Good first issues:

Add ALTER TABLE ... ADD COLUMN

Cost-based join reordering

Persist B-Tree structure to disk

Streaming SELECT for large tables

LIKE operator

DATE / TIMESTAMP types

License
MIT — see LICENSE. Free to use, modify, and ship.

<div align="center">
Harshit Rajput

If this project helped you understand how databases work, a ⭐ goes a long way.

</div> ```