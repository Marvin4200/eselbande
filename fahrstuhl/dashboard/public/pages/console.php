<?php
$page_title = 'Console';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();

// ── AJAX: execute command ────────────────────────────────────────────────────
if (isset($_GET['ajax']) && $_GET['ajax'] === 'exec') {
    header('Content-Type: application/json');
    verifyDashboardCsrf();

    $raw = file_get_contents('php://input');
    $body = json_decode($raw, true) ?? [];
    $cmd = trim((string)($body['cmd'] ?? ''));

    if ($cmd === '') {
        echo json_encode(['out' => '', 'err' => '', 'exit' => 0]);
        exit;
    }

    // Block obviously destructive commands
    $blocked = ['/\brm\s+-rf\s+\//i', '/\bmkfs\b/i', '/\bdd\s+if=/i', '/>\s*\/dev\/(s|h)d/i'];
    foreach ($blocked as $pattern) {
        if (preg_match($pattern, $cmd)) {
            http_response_code(403);
            echo json_encode(['out' => '', 'err' => '⛔ Blocked: command not allowed.', 'exit' => 1]);
            exit;
        }
    }

    $cwd = realpath(__DIR__ . '/../../../../') ?: '/';

    $descriptors = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];

    $env = array_merge($_ENV, ['TERM' => 'xterm', 'HOME' => '/root']);
    $proc = proc_open("bash -c " . escapeshellarg($cmd), $descriptors, $pipes, $cwd, $env);

    if (!is_resource($proc)) {
        echo json_encode(['out' => '', 'err' => 'Failed to start process.', 'exit' => 1]);
        exit;
    }

    fclose($pipes[0]);

    // Hard timeout: 15s
    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);
    $stdout = '';
    $stderr = '';
    $start = time();
    while (true) {
        $stdout .= fread($pipes[1], 8192);
        $stderr .= fread($pipes[2], 8192);
        $status = proc_get_status($proc);
        if (!$status['running']) break;
        if (time() - $start >= 15) {
            proc_terminate($proc);
            $stderr .= "\n⏱ Timeout after 15s.";
            break;
        }
        usleep(50000);
    }
    // Drain remaining
    $stdout .= stream_get_contents($pipes[1]);
    $stderr .= stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $exit = proc_close($proc);

    // Trim output to 50 KB
    if (strlen($stdout) > 51200) $stdout = substr($stdout, 0, 51200) . "\n… (output truncated)";
    if (strlen($stderr) > 10240) $stderr = substr($stderr, 0, 10240) . "\n… (truncated)";

    echo json_encode(['out' => $stdout, 'err' => $stderr, 'exit' => $exit]);
    exit;
}

// ── AJAX: bot logs ───────────────────────────────────────────────────────────
if (isset($_GET['ajax']) && $_GET['ajax'] === 'logs') {
    header('Content-Type: application/json');
    $raw  = getAPI('/logs/recent?limit=200', 20);
    $logs = $raw['data']['logs'] ?? [];
    echo json_encode(['logs' => $logs]);
    exit;
}
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.con-layout { display: grid; gap: 1rem; }

.con-terminal {
    background: #0b0e14;
    border: 1px solid #1e2533;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    height: 70vh;
    min-height: 400px;
    overflow: hidden;
    font-family: 'Consolas', 'Menlo', 'Monaco', monospace;
    font-size: .82rem;
}

.con-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: .4rem .85rem;
    background: #111722;
    border-bottom: 1px solid #1e2533;
    gap: .6rem;
    flex-wrap: wrap;
}
.con-dots { display: flex; gap: .38rem; }
.con-dot  { width: 11px; height: 11px; border-radius: 50%; }
.con-dot-r { background: #ff5f57; }
.con-dot-y { background: #febc2e; }
.con-dot-g { background: #28c840; }
.con-topbar-title { font-size: .78rem; color: #5a6580; letter-spacing: .04em; }

.con-output {
    flex: 1;
    overflow-y: auto;
    padding: .75rem 1rem;
    white-space: pre-wrap;
    word-break: break-all;
    line-height: 1.55;
    color: #c8d0e0;
}

.con-line-cmd  { color: #7dd3fc; }
.con-line-out  { color: #c8d0e0; }
.con-line-err  { color: #f87171; }
.con-line-info { color: #6b7280; font-style: italic; }
.con-line-ok   { color: #4ade80; }

.con-input-row {
    display: flex;
    align-items: center;
    border-top: 1px solid #1e2533;
    background: #0d111a;
    padding: .45rem .85rem;
    gap: .5rem;
}
.con-prompt { color: #4ade80; font-weight: 700; white-space: nowrap; user-select: none; }
.con-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: #e2e8f0;
    font-family: inherit;
    font-size: .82rem;
    caret-color: #4ade80;
}
.con-run-btn {
    background: rgba(74,222,128,.12);
    border: 1px solid rgba(74,222,128,.25);
    border-radius: 6px;
    color: #4ade80;
    padding: .25rem .6rem;
    font-size: .75rem;
    font-weight: 700;
    cursor: pointer;
    transition: background .12s;
}
.con-run-btn:hover { background: rgba(74,222,128,.22); }
.con-run-btn:disabled { opacity: .4; cursor: not-allowed; }

.con-toolbar {
    display: flex;
    align-items: center;
    gap: .5rem;
    flex-wrap: wrap;
}
.con-tb-btn {
    background: rgba(255,255,255,.04);
    border: 1px solid #1e2533;
    border-radius: 6px;
    color: #6b7280;
    padding: .22rem .55rem;
    font-size: .72rem;
    cursor: pointer;
    transition: color .12s, border-color .12s;
}
.con-tb-btn:hover { color: #c8d0e0; border-color: #343d4d; }
.con-status { font-size: .72rem; color: #6b7280; margin-left: auto; }
.con-status.running { color: #fbbf24; }
.con-status.ok  { color: #4ade80; }
.con-status.err { color: #f87171; }
</style>

<div class="con-layout">
    <div class="page-header">
        <div class="page-header-row">
            <div>
                <h1>💻 Console</h1>
                <p class="subtitle">Befehle direkt auf dem Server ausführen. Läuft als www-data / PHP-User.</p>
            </div>
        </div>
    </div>

    <div class="con-terminal" id="conTerminal">
        <div class="con-topbar">
            <div class="con-dots">
                <span class="con-dot con-dot-r"></span>
                <span class="con-dot con-dot-y"></span>
                <span class="con-dot con-dot-g"></span>
            </div>
            <span class="con-topbar-title">bash — fahrstuhl server</span>
            <div class="con-toolbar">
                <button class="con-tb-btn" id="conClearBtn">🗑 Clear</button>
                <button class="con-tb-btn" id="conCopyBtn">📋 Copy last</button>
                <span class="con-status" id="conStatus"></span>
            </div>
        </div>

        <div class="con-output" id="conOutput">
            <span class="con-line-info">Verbunden. Tippe einen Befehl und drücke Enter. ↑/↓ für History.</span>
        </div>

        <div class="con-input-row">
            <span class="con-prompt">$&nbsp;</span>
            <input class="con-input" id="conInput" type="text" autocomplete="off"
                   spellcheck="false" autocorrect="off" autocapitalize="off"
                   placeholder="Befehl eingeben…" autofocus>
            <button class="con-run-btn" id="conRunBtn">▶ Run</button>
        </div>
    </div>
</div>

<script>
(function () {
    const CSRF   = '<?= esc(dashboardCsrfToken()) ?>';
    const API    = '<?= BASE_URL ?>/pages/console.php?ajax=exec';

    const output = document.getElementById('conOutput');
    const input  = document.getElementById('conInput');
    const runBtn = document.getElementById('conRunBtn');
    const status = document.getElementById('conStatus');

    let history  = JSON.parse(localStorage.getItem('conHistory') || '[]');
    let histIdx  = -1;
    let lastOut  = '';
    let running  = false;

    function escHtml(s) {
        return String(s)
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function appendLine(text, cls) {
        const span = document.createElement('span');
        span.className = cls;
        span.textContent = text;
        output.appendChild(span);
        output.appendChild(document.createElement('br'));
        output.scrollTop = output.scrollHeight;
    }

    function appendRaw(text, cls) {
        if (!text) return;
        text.split('\n').forEach(line => appendLine(line, cls));
    }

    function setStatus(msg, cls) {
        status.textContent = msg;
        status.className = 'con-status ' + (cls || '');
    }

    async function runCmd(cmd) {
        if (!cmd.trim() || running) return;
        running = true;
        runBtn.disabled = true;
        input.disabled  = true;

        history = history.filter(h => h !== cmd);
        history.unshift(cmd);
        if (history.length > 100) history.pop();
        localStorage.setItem('conHistory', JSON.stringify(history));
        histIdx = -1;

        appendLine('$ ' + cmd, 'con-line-cmd');
        setStatus('⏳ Running…', 'running');

        try {
            const res = await fetch(API, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF },
                body: JSON.stringify({ cmd }),
            });

            if (!res.ok) {
                const text = await res.text();
                appendRaw('Error ' + res.status + ': ' + text, 'con-line-err');
                setStatus('✗ HTTP ' + res.status, 'err');
                return;
            }

            const json = await res.json();
            lastOut = (json.out || '') + (json.err || '');

            if (json.out) appendRaw(json.out.replace(/\n$/, ''), 'con-line-out');
            if (json.err) appendRaw(json.err.replace(/\n$/, ''), 'con-line-err');

            setStatus(json.exit === 0 ? '✓ Exit 0' : '✗ Exit ' + json.exit, json.exit === 0 ? 'ok' : 'err');
        } catch (e) {
            appendRaw('Network error: ' + e.message, 'con-line-err');
            setStatus('✗ Network error', 'err');
        } finally {
            running = false;
            runBtn.disabled = false;
            input.disabled  = false;
            input.focus();
        }
    }

    runBtn.addEventListener('click', () => {
        const cmd = input.value.trim();
        input.value = '';
        runCmd(cmd);
    });

    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            const cmd = input.value.trim();
            input.value = '';
            runCmd(cmd);
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (histIdx < history.length - 1) histIdx++;
            input.value = history[histIdx] || '';
            setTimeout(() => input.setSelectionRange(input.value.length, input.value.length), 0);
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (histIdx > 0) { histIdx--; input.value = history[histIdx] || ''; }
            else { histIdx = -1; input.value = ''; }
            return;
        }
        if (e.key === 'l' && e.ctrlKey) {
            e.preventDefault();
            output.innerHTML = '';
        }
    });

    document.getElementById('conClearBtn').addEventListener('click', () => {
        output.innerHTML = '';
        lastOut = '';
        setStatus('');
    });

    document.getElementById('conCopyBtn').addEventListener('click', async () => {
        if (!lastOut) return;
        try {
            await navigator.clipboard.writeText(lastOut);
            setStatus('Kopiert!', 'ok');
            setTimeout(() => setStatus(''), 1500);
        } catch {
            setStatus('Kopieren fehlgeschlagen', 'err');
        }
    });
})();
</script>

<?php include '../includes/footer.php'; ?>
