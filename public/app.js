/* ============================================================
   SESSION — stable per browser tab
   ============================================================ */
const SESSION_ID = sessionStorage.getItem('sql-clone-session-id')
  || (() => {
    const id = (crypto.randomUUID && crypto.randomUUID())
             || String(Date.now()) + Math.random().toString(36).slice(2);
    sessionStorage.setItem('sql-clone-session-id', id);
    return id;
  })();

function apiHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Session-Id': SESSION_ID,
  };
}

/* ============================================================
   DOM
   ============================================================ */
const editor           = document.getElementById('editor');
const runBtn           = document.getElementById('run');
const clearBtn         = document.getElementById('clear');
const sampleBtn        = document.getElementById('sample');
const resultEl         = document.getElementById('result');
const metaEl           = document.getElementById('meta');
const timingEl         = document.getElementById('timing');
const statusEl         = document.getElementById('status');
const statusTx         = document.getElementById('status-text');
const historyEl        = document.getElementById('history');
const clearHistoryBtn  = document.getElementById('clear-history');
const tablesEl         = document.getElementById('tables');
const refreshTablesBtn = document.getElementById('refresh-tables');
const beginBtn         = document.getElementById('begin');
const commitBtn        = document.getElementById('commit');
const rollbackBtn      = document.getElementById('rollback');
const resetSessionBtn  = document.getElementById('reset-session');
const dbPicker         = document.getElementById('db-picker');
const exportCsvBtn     = document.getElementById('export-csv');
const exportJsonBtn    = document.getElementById('export-json');
const acEl             = document.getElementById('autocomplete');

const history = [];
const MAX_HISTORY = 50;
let lastResult = null;   // { columns, rows } of the last SELECT

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
async function sendSQL(sql) {
  const res = await fetch('/api/query', {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ sql }),
  });
  return res.json();
}

async function runQuery() {
  const sql = editor.value.trim();
  if (!sql) return;

  const t0 = performance.now();
  metaEl.textContent = 'running…';
  timingEl.textContent = '';
  renderMessage('executing…');

  try {
    const data = await sendSQL(sql);
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
    // Remember for export
    lastResult = {
      columns: Object.keys(data.rows[0] || {}),
      rows: data.rows,
    };

    if (data.rows.length === 0) {
      resultEl.innerHTML = `<div class="msg-ok">Empty set (0 rows)</div>`;
      return;
    }
    const cols = lastResult.columns;
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

  lastResult = null;
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
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
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
    const r = await fetch('/api/tables', { headers: apiHeaders() });
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
    const idxByCol = new Map();
    for (const ix of t.indexes || []) {
      if (!idxByCol.has(ix.column)) idxByCol.set(ix.column, []);
      idxByCol.get(ix.column).push(ix);
    }

    const cols = t.columns.map((c) => {
      const pk = c.primaryKey ? ' <span class="pk">PK</span>' : '';
      const ixList = idxByCol.get(c.name) || [];
      const ix = ixList.length
        ? ' ' + ixList.map((i) =>
            `<span class="ix ${i.implicit ? 'ix--implicit' : ''}" title="${esc(i.name)} (${i.kind}${i.unique ? ', unique' : ''})">IDX</span>`
          ).join('')
        : '';
      return `<span class="ti-col"><span>${esc(c.name)}</span> <span class="t">${esc(c.type)}</span>${pk}${ix}</span>`;
    }).join('');

    return `
      <div class="table-item" data-name="${esc(t.name)}" title="Click to query">
        <div class="ti-header">
          <div class="ti-name">${esc(t.name)}</div>
          <button class="ti-drop" data-name="${esc(t.name)}" title="Drop table">×</button>
        </div>
        <div class="ti-meta">${t.columns.length} cols · ${t.rowCount} rows · ${(t.indexes || []).length} idx</div>
        <div class="ti-cols">${cols}</div>
      </div>`;
  }).join('');
}

tablesEl.addEventListener('click', async (e) => {
  // DROP TABLE
  const dropBtn = e.target.closest('.ti-drop');
  if (dropBtn) {
    e.stopPropagation();
    const name = dropBtn.dataset.name;
    if (!confirm(`Drop table '${name}'? This cannot be undone.`)) return;
    const r = await sendSQL(`DROP TABLE ${name};`);
    renderResult(r);
    pushHistory(`DROP TABLE ${name};`, r.ok !== false);
    loadTables();
    return;
  }
  // Query on click
  const item = e.target.closest('.table-item');
  if (!item) return;
  editor.value = `SELECT * FROM ${item.dataset.name};`;
  editor.focus();
});

refreshTablesBtn.addEventListener('click', loadTables);

// Auto-refresh every 10s when tab is visible
setInterval(() => {
  if (document.visibilityState === 'visible') loadTables();
}, 10000);

/* ============================================================
   DATABASE PICKER
   ============================================================ */
async function loadDbs() {
  const picker = document.getElementById('db-picker');
  if (!picker) {
    console.warn('[loadDbs] no #db-picker element in the DOM');
    return;
  }
  try {
   fetch('/api/dbs', { headers: apiHeaders() })
  .then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();           // parse and return
  })
  .then(data => {
     const list = data.databases || [];
    if(list.length > 0){
     picker.innerHTML = list.map((name) =>
      `<option value="${esc(name)}"${name === data.active ? ' selected' : ''}>${esc(name)}</option>`
    ).join('');
    picker.value = data.active;
    }   
  })  // actual data here
  .catch(err => console.error(err));
   
    
  } catch (err) {
    console.error('[loadDbs]', err);
  }
}

dbPicker?.addEventListener('change', async (e) => {
  const name = e.target.value;
  const r = await fetch('/api/use-db', {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ name }),
  });
  const data = await r.json();
  if (data.ok) {
    pushHistory(`USE ${name};`, true);
    loadTables();
  } else {
    pushHistory(`USE ${name};`, false);
    alert(data.error || 'Failed to switch database');
  }
});

/* ============================================================
   EXPORT
   ============================================================ */
function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

exportCsvBtn?.addEventListener('click', () => {
  if (!lastResult) return alert('No result to export');
  const { columns, rows } = lastResult;
  const cell = (v) =>
    v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`;
  const csv = [
    columns.map(cell).join(','),
    ...rows.map((r) => columns.map((c) => cell(r[c])).join(',')),
  ].join('\n');
  download('result.csv', csv, 'text/csv');
});

exportJsonBtn?.addEventListener('click', () => {
  if (!lastResult) return alert('No result to export');
  download('result.json', JSON.stringify(lastResult.rows, null, 2), 'application/json');
});

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
   TRANSACTION BUTTONS
   ============================================================ */
beginBtn?.addEventListener('click', async () => {
  const r = await sendSQL('BEGIN');
  renderResult(r);
  pushHistory('BEGIN', r.ok !== false);
  loadTables();
});

commitBtn?.addEventListener('click', async () => {
  const r = await sendSQL('COMMIT');
  renderResult(r);
  pushHistory('COMMIT', r.ok !== false);
  loadTables();
});

rollbackBtn?.addEventListener('click', async () => {
  const r = await sendSQL('ROLLBACK');
  renderResult(r);
  pushHistory('ROLLBACK', r.ok !== false);
  loadTables();
});

resetSessionBtn?.addEventListener('click', async () => {
  try {
    await fetch('/api/reset-session', { method: 'POST', headers: apiHeaders() });
  } catch {}
  sessionStorage.removeItem('sql-clone-session-id');
  location.reload();
});

/* ============================================================
   AUTOCOMPLETE
   ============================================================ */
const KEYWORDS = [
  'SELECT','FROM','WHERE','ORDER BY','GROUP BY','HAVING','LIMIT','OFFSET',
  'DISTINCT','CASE','WHEN','THEN','ELSE','END',
  'CREATE TABLE','CREATE INDEX','CREATE DATABASE','CREATE UNIQUE INDEX',
  'DROP TABLE','DROP INDEX','DROP DATABASE',
  'INSERT INTO','VALUES','UPDATE','SET','DELETE FROM','USE',
  'PRIMARY KEY','FOREIGN KEY','REFERENCES','UNIQUE','NOT NULL','DEFAULT','CHECK',
  'INNER JOIN','LEFT JOIN','RIGHT JOIN','CROSS JOIN','ON',
  'COUNT','SUM','AVG','MIN','MAX','ROW_NUMBER','RANK','DENSE_RANK',
  'WITH','AS','BEGIN','COMMIT','ROLLBACK','EXPLAIN','IN','EXISTS','IS NULL','IS NOT NULL',
];

let acItems = [];
let acIndex = 0;

async function buildSuggestions() {
  const extras = [];
  try {
    const r = await fetch('/api/tables', { headers: apiHeaders() });
    const data = await r.json();
    for (const t of data.tables || []) {
      extras.push(t.name);
      for (const c of t.columns) extras.push(c.name);
    }
  } catch {}
  return [...new Set([...KEYWORDS, ...extras])];
}

function currentWord() {
  const pos = editor.selectionStart;
  let start = pos;
  while (start > 0 && /[A-Za-z_]/.test(editor.value[start - 1])) start--;
  return editor.value.slice(start, pos);
}

function showAutocomplete(items) {
  acItems = items;
  acIndex = 0;
  acEl.innerHTML = items.slice(0, 8).map((it, i) =>
    `<div class="ac-item ${i === 0 ? 'active' : ''}" data-idx="${i}">${esc(it)}</div>`
  ).join('');
  acEl.hidden = false;
}

function hideAutocomplete() {
  acEl.hidden = true;
  acItems = [];
}

function updateAcHighlight() {
  [...acEl.children].forEach((el, i) => {
    el.classList.toggle('active', i === acIndex);
  });
}

function applyAutocomplete(value) {
  const pos = editor.selectionStart;
  const text = editor.value;
  let start = pos;
  while (start > 0 && /[A-Za-z_]/.test(text[start - 1])) start--;
  editor.value = text.slice(0, start) + value + text.slice(pos);
  const newPos = start + value.length;
  editor.selectionStart = editor.selectionEnd = newPos;
  hideAutocomplete();
  editor.focus();
}

acEl?.addEventListener('click', (e) => {
  const item = e.target.closest('.ac-item');
  if (item) applyAutocomplete(acItems[Number(item.dataset.idx)]);
});

/* ============================================================
   EDITOR KEYBOARD
   ============================================================ */
editor.addEventListener('keydown', async (e) => {
  if (e.key === 'Escape') { hideAutocomplete(); return; }

  if ((e.ctrlKey || e.metaKey) && e.key === ' ') {
    e.preventDefault();
    const items = await buildSuggestions();
    const partial = currentWord().toUpperCase();
    const filtered = partial
      ? items.filter((it) => it.toUpperCase().startsWith(partial))
      : items;
    if (filtered.length) showAutocomplete(filtered);
    return;
  }

  if (!acEl.hidden) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      acIndex = Math.min(acIndex + 1, acItems.length - 1);
      updateAcHighlight();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      acIndex = Math.max(acIndex - 1, 0);
      updateAcHighlight();
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      applyAutocomplete(acItems[acIndex]);
      return;
    }
  }

  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    runQuery();
    return;
  }

  if (e.key === 'Tab') {
    e.preventDefault();
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.value = editor.value.slice(0, start) + '  ' + editor.value.slice(end);
    editor.selectionStart = editor.selectionEnd = start + 2;
  }
});

editor.addEventListener('blur', () => setTimeout(hideAutocomplete, 100));

/* ============================================================
   INIT
   ============================================================ */
editor.focus();
renderHistory();
loadTables();
loadDbs();