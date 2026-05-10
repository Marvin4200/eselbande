<?php
$page_title = 'Logs';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();

// AJAX proxy – called by JS on the same origin
if (isset($_GET['ajax'])) {
    header('Content-Type: application/json');
    $level = in_array($_GET['level'] ?? '', ['all','error','info']) ? $_GET['level'] : 'all';
    $limit = min((int)($_GET['limit'] ?? 200), 500);
    $data  = getAPI("/logs?level={$level}&limit={$limit}");
    echo json_encode($data);
    exit;
}
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<div class="page-header">
    <h1>📋 Logs</h1>
    <p class="subtitle">Live bot log output – auto-refreshes every 10s</p>
</div>

<!-- Controls -->
<div class="section" style="padding:14px 18px; margin-bottom:var(--sp-4); display:flex; gap:var(--sp-3); flex-wrap:wrap; align-items:center;">
    <select id="levelFilter" onchange="loadLogs()"
        style="padding:var(--sp-2) var(--sp-3); border-radius:6px; border:1px solid #333; background:#1a1a2e; color:#e0e0e0;">
        <option value="all">All levels</option>
        <option value="error">❌ Errors only</option>
        <option value="info">ℹ️ Info only</option>
    </select>
    <select id="limitFilter" onchange="loadLogs()"
        style="padding:var(--sp-2) var(--sp-3); border-radius:6px; border:1px solid #333; background:#1a1a2e; color:#e0e0e0;">
        <option value="100">Last 100 lines</option>
        <option value="200" selected>Last 200 lines</option>
        <option value="500">Last 500 lines</option>
    </select>
    <input type="text" id="search" placeholder="🔍 Filter..." oninput="applyFilter()"
        style="padding:var(--sp-2) var(--sp-3); border-radius:6px; border:1px solid #333; background:#1a1a2e; color:#e0e0e0; width:220px;">
    <button onclick="loadLogs()" style="padding:8px 14px; border-radius:6px; background:#4f46e5; border:none; color:#fff; cursor:pointer;">↻ Refresh</button>
    <label style="color:#aaa; font-size:0.88em; display:flex; align-items:center; gap:6px; cursor:pointer;">
        <input type="checkbox" id="autoRefresh" checked onchange="toggleAutoRefresh()"> Auto-refresh (10s)
    </label>
    <span id="lastUpdated" style="color:#555; font-size:0.82em; margin-left:auto;"></span>
</div>

<!-- Log Output -->
<div class="section" style="padding:0; overflow:hidden;">
    <div id="logBox" style="font-family:monospace; font-size:0.82em; background:#0d0d1a; padding:var(--sp-4);
         max-height:65vh; overflow-y:auto; border-radius:8px; white-space:pre-wrap; word-break:break-all;">
        <span style="color:#555;">Loading logs...</span>
    </div>
</div>

<style>
.log-error { color: #ff6b6b; }
.log-warn  { color: #ffd43b; }
.log-info  { color: #e0e0e0; }
.log-dim   { color: #555; }
</style>

<script>
let autoRefreshTimer = null;
let allLogs = [];

async function loadLogs() {
    const level = document.getElementById('levelFilter').value;
    const limit = document.getElementById('limitFilter').value;
    try {
        const r = await fetch(`${baseUrl}/pages/logs.php?ajax=1&level=${level}&limit=${limit}`);
        const json = await r.json();
        allLogs = json.data?.logs || [];
        document.getElementById('lastUpdated').textContent = 'Updated ' + new Date().toLocaleTimeString();
        applyFilter();
    } catch (e) {
        document.getElementById('logBox').innerHTML = '<span class="log-error">⚠️ Could not load logs</span>';
    }
}

function applyFilter() {
    const q = document.getElementById('search').value.toLowerCase();
    const filtered = q ? allLogs.filter(l => l.raw.toLowerCase().includes(q)) : allLogs;
    const box = document.getElementById('logBox');

    if (!filtered.length) {
        box.innerHTML = '<span class="log-dim">No log entries found</span>';
        return;
    }

    box.innerHTML = filtered.map(l => {
        const cls = l.isError ? 'log-error' : l.isWarn ? 'log-warn' : 'log-info';
        return `<span class="${cls}">${escHtml(l.raw)}</span>`;
    }).join('\n');
}

function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function toggleAutoRefresh() {
    clearInterval(autoRefreshTimer);
    if (document.getElementById('autoRefresh').checked) {
        autoRefreshTimer = setInterval(loadLogs, 10000);
    }
}

loadLogs();
autoRefreshTimer = setInterval(loadLogs, 10000);
</script>

<?php include '../includes/footer.php'; ?>
