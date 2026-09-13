const editor     = document.getElementById('editor');
const runBtn     = document.getElementById('run');
const clearBtn   = document.getElementById('clear');
const sampleBtn  = document.getElementById('sample');
const resultEl   = document.getElementById('result');
const metaEl     = document.getElementById('meta');
const timingEl   = document.getElementById('timing');
const statusEl   = document.getElementById('status');
const statusTx   = document.getElementById('status-text');
const historyEl  = document.getElementById('history');
const clearHistoryBtn = document.getElementById('clear-history');
const tablesEl   = document.getElementById('tables');
const refreshTablesBtn = document.getElementById('refresh-tables');

const history = [];
const MAX_HISTORY = 50;

/* ============================================================
   HEALTH
   ============================================================ */
async function checkHealth() {
  try {
    const r = await fetch('/api/health');
    if (r.ok) {
      statusEl.className = 'status status--up';
      statusTx.textContent = 'connected';
      return;
    }
  } catch {}
  statusEl.className = 'status status--down';
  statusTx.textContent = 'offline';
}
checkHealth();
setInterval(checkHealth, 5000);

/* ============================================================
   QUERY
   ============================================================ */
async function runQuery() {
  const sql = editor.value.trim();
  if (!sql) return;

  const t0 = performance.now();
  metaEl.textContent = 'running…';
  timingEl.textContent = '';
  renderMessage('executing…');

  try {
    const res = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql }),
    });
    const data = await res.json();
    const ms = (performance.now() - t0).toFixed(1);
    timingEl.textContent = `${ms} ms`;

    if (data.ok === false) {
      renderError(data.error || 'Unknown error', data.code);
      metaEl.textContent = 'error';
      pushHistory(sql, false);
      loadTables();
      return;
    }

    renderResult(data);
    metaEl.textContent = '';
    pushHistory(sql, true);
    loadTables();
  } catch (err) {
    renderError(err.message);
    metaEl.textContent = 'error';
    pushHistory(sql, false);
  }
}

/* ============================================================
   RENDER — RESULT
   ============================================================ */
function renderResult(data) {
  if (data.kind === 'select' && Array.isArray(data.rows)) {
    if (data.rows.length === 0) {
      resultEl.innerHTML = `<div class="msg-ok">Empty set (0 rows)</div>`;
      return;
    }
    const cols = Object.keys(data.rows[0]);
    const thead = cols.map((c) => `<th>${esc(c)}</th>`).join('');
    const tbody = data.rows.map((row) => {
      const tds = cols.map((c) => {
        const v = row[c];
        if (v === null || v === undefined) return `<td class="null">NULL</td>`;
        return `<td>${esc(String(v))}</td>`;
      }).join('');
      return `<tr>${tds}</tr>`;
    }).join('');
    resultEl.innerHTML = `<table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`;
    return;
  }

  const pretty = JSON.stringify(data, null, 2);
  resultEl.innerHTML = `<div class="msg-ok">OK<code>${esc(pretty)}</code></div>`;
}

function renderMessage(msg) {
  resultEl.innerHTML = `<div class="placeholder">${esc(msg)}</div>`;
}
function renderError(msg, code) {
  const tag = code ? `<code>${esc(code)}</code> ` : '';
  resultEl.innerHTML = `<div class="msg-err">${tag}${esc(msg)}</div>`;
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ============================================================
   HISTORY
   ============================================================ */
function pushHistory(sql, ok) {
  history.unshift({ sql, ok, ts: new Date() });
  if (history.length > MAX_HISTORY) history.pop();
  renderHistory();
}

function renderHistory() {
  if (history.length === 0) {
    historyEl.innerHTML = `<div class="history-empty">No queries yet</div>`;
    return;
  }
  historyEl.innerHTML = history.map((h, i) =>
    `<div class="history-item ${h.ok ? 'ok' : 'err'}" data-idx="${i}" title="${esc(h.sql)}">${esc(h.sql)}</div>`
  ).join('');
}

historyEl.addEventListener('click', (e) => {
  const item = e.target.closest('.history-item');
  if (!item) return;
  editor.value = history[Number(item.dataset.idx)].sql;
  editor.focus();
});

clearHistoryBtn.addEventListener('click', () => {
  history.length = 0;
  renderHistory();
});

/* ============================================================
   TABLES
   ============================================================ */
async function loadTables() {
  try {
    const r = await fetch('/api/tables');
    const data = await r.json();
    renderTables(data.tables || []);
  } catch (err) {
    tablesEl.innerHTML = `<div class="tables-empty">Error: ${esc(err.message)}</div>`;
  }
}

function renderTables(tables) {
  if (!tables.length) {
    tablesEl.innerHTML = `<div class="tables-empty">No tables</div>`;
    return;
  }
  tablesEl.innerHTML = tables.map((t) => {
    const cols = t.columns.map((c) => {
      const pk = c.primaryKey ? ' <span class="pk">PK</span>' : '';
      return `<span class="ti-col"><span>${esc(c.name)}</span> <span class="t">${esc(c.type)}</span>${pk}</span>`;
    }).join('');
    return `
      <div class="table-item" data-name="${esc(t.name)}" title="Click to query">
        <div class="ti-name">${esc(t.name)}</div>
        <div class="ti-meta">${t.columns.length} cols · ${t.rowCount} rows</div>
        <div class="ti-cols">${cols}</div>
      </div>`;
  }).join('');
}

tablesEl.addEventListener('click', (e) => {
  const item = e.target.closest('.table-item');
  if (!item) return;
  const name = item.dataset.name;
  editor.value = `SELECT * FROM ${name};`;
  editor.focus();
});

refreshTablesBtn.addEventListener('click', loadTables);

/* ============================================================
   ACTION BUTTONS
   ============================================================ */
runBtn.addEventListener('click', runQuery);

clearBtn.addEventListener('click', () => {
  editor.value = '';
  editor.focus();
  resultEl.innerHTML = `<div class="placeholder">Run a query to see results.</div>`;
  metaEl.textContent = '';
  timingEl.textContent = '';
});

sampleBtn.addEventListener('click', () => {
  editor.value = `-- create + seed + query
CREATE TABLE users (id INT PRIMARY KEY, name TEXT, age INT);
INSERT INTO users VALUES (1, 'alice', 30), (2, 'bob', 25), (3, 'carol', 40);
SELECT name, age FROM users WHERE age > 26 ORDER BY age DESC;`;
  editor.focus();
});

/* ============================================================
   EDITOR KEYBOARD
   ============================================================ */
editor.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    runQuery();
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.value = editor.value.slice(0, start) + '  ' + editor.value.slice(end);
    editor.selectionStart = editor.selectionEnd = start + 2;
  }
});

/* ============================================================
   INIT
   ============================================================ */
editor.focus();
renderHistory();
loadTables();