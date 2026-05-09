<?php
$page_title = 'Backups';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();

$message = '';
$messageType = 'success';

function bytesPretty($bytes) {
    $bytes = (int)$bytes;
    if ($bytes < 1024) return $bytes . ' B';
    if ($bytes < 1048576) return round($bytes / 1024, 1) . ' KB';
    if ($bytes < 1073741824) return round($bytes / 1048576, 1) . ' MB';
    return round($bytes / 1073741824, 2) . ' GB';
}

function fmtWhen($ms) {
    if (empty($ms)) return '—';
    return date('d.m.Y H:i', (int)($ms / 1000));
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    if ($action === 'run_db_backup') {
        $result = api('/backup/run', 'POST', [], 120);
        if ($result['data']['success'] ?? false) {
            $message = 'DB Backup erstellt.';
        } else {
            $messageType = 'error';
            $message = $result['data']['message'] ?? 'DB Backup fehlgeschlagen.';
        }
    }

    if ($action === 'verify_db_backup') {
        $result = api('/backup/verify', 'POST', [], 60);
        if ($result['data']['success'] ?? false) {
            $verification = $result['data']['data']['verification'] ?? [];
            $ok = !empty($verification['ok']);
            $messageType = $ok ? 'success' : 'error';
            $message = $ok ? 'DB Backup verifiziert.' : ('Verifizierung fehlgeschlagen: ' . ($verification['message'] ?? 'unknown'));
        } else {
            $messageType = 'error';
            $message = $result['data']['message'] ?? 'Verifizierung fehlgeschlagen.';
        }
    }

    if ($action === 'run_files_backup') {
        $result = api('/backup/files/run', 'POST', [], 240);
        if ($result['data']['success'] ?? false) {
            $message = 'Files Backup erstellt.';
        } else {
            $messageType = 'error';
            $message = $result['data']['message'] ?? 'Files Backup fehlgeschlagen.';
        }
    }

    if ($action === 'schedule_restore') {
        $mode = $_POST['mode'] ?? 'full';
        $sql = $_POST['sql'] ?? '';
        $files = $_POST['files'] ?? '';
        $restart = !empty($_POST['restart']) ? true : false;
        $confirm = $_POST['confirm'] ?? '';

        $payload = [
            'mode' => $mode,
            'sql' => $sql,
            'files' => $files,
            'restart' => $restart,
            'confirm' => $confirm,
        ];

        $result = api('/backup/restore', 'POST', $payload, 20);
        if ($result['data']['success'] ?? false) {
            $messageType = 'success';
            $message = 'Restore wurde geplant. Status unten checken (Page refresh).';
        } else {
            $messageType = 'error';
            $message = $result['data']['message'] ?? 'Restore konnte nicht geplant werden.';
        }
    }
}

$backupRaw = getAPI('/backup/status', 20);
$backup = $backupRaw['data'] ?? [];

$listRaw = getAPI('/backup/list', 20);
$list = $listRaw['data'] ?? ['mysql' => [], 'files' => []];

$restoreRaw = getAPI('/backup/restore/status', 20);
$restore = $restoreRaw['data']['state'] ?? null;

$files = $backup['files'] ?? [];
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.alert { padding:12px 15px; border-radius:8px; border-left:4px solid; margin-bottom:20px; }
.alert-success { background:rgba(81,207,102,.12); color:#51cf66; border-color:#51cf66; }
.alert-error { background:rgba(255,107,107,.12); color:#ff6b6b; border-color:#ff6b6b; }
</style>

<div class="page-header">
    <div class="page-header-row">
        <div>
            <h1>🗄️ Backups</h1>
            <p class="subtitle">DB (mysqldump) und Files (tar.gz). Restore läuft als Job und kann die Services neu starten.</p>
        </div>
        <div class="page-meta">Last refresh: <?php echo date('d.m.Y H:i'); ?></div>
    </div>
</div>

<?php if ($message): ?>
    <div class="alert alert-<?php echo esc($messageType); ?>"><?php echo esc($message); ?></div>
<?php endif; ?>

<div class="hub-grid" style="grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));">
    <div class="section">
        <h2>DB Backup</h2>
        <table class="table"><tbody>
            <tr><td>Enabled</td><td><?php echo !empty($backup['enabled']) ? 'yes' : 'no'; ?></td></tr>
            <tr><td>Last</td><td><?php echo fmtWhen($backup['lastBackupAt'] ?? null); ?></td></tr>
            <tr><td>File</td><td><code><?php echo esc($backup['lastBackupFileName'] ?? '—'); ?></code></td></tr>
            <tr><td>Verified</td><td style="color:<?php echo !empty($backup['verification']['ok']) ? '#51cf66' : '#ffd43b'; ?>;"><?php echo !empty($backup['verification']['ok']) ? 'yes' : 'no'; ?></td></tr>
            <tr><td>Size</td><td><?php echo bytesPretty($backup['verification']['size'] ?? 0); ?></td></tr>
            <?php if (!empty($backup['lastBackupError'])): ?><tr><td>Error</td><td style="color:#ff6b6b;"><?php echo esc($backup['lastBackupError']); ?></td></tr><?php endif; ?>
        </tbody></table>
        <div class="quick-actions" style="margin-top:.8rem;">
            <form method="POST"><button class="btn-icon" type="submit" name="action" value="run_db_backup"><span class="i">🗄️</span> Run</button></form>
            <form method="POST"><button class="btn-icon" type="submit" name="action" value="verify_db_backup"><span class="i">✅</span> Verify</button></form>
        </div>
    </div>

    <div class="section">
        <h2>Files Backup</h2>
        <table class="table"><tbody>
            <tr><td>Enabled</td><td><?php echo !empty($files['enabled']) ? 'yes' : 'no'; ?></td></tr>
            <tr><td>Last</td><td><?php echo fmtWhen($files['lastBackupAt'] ?? null); ?></td></tr>
            <tr><td>File</td><td><code><?php echo esc($files['lastBackupFileName'] ?? '—'); ?></code></td></tr>
            <tr><td>Verified</td><td style="color:<?php echo !empty($files['verification']['ok']) ? '#51cf66' : '#ffd43b'; ?>;"><?php echo !empty($files['verification']['ok']) ? 'yes' : 'no'; ?></td></tr>
            <tr><td>Size</td><td><?php echo bytesPretty($files['verification']['size'] ?? 0); ?></td></tr>
            <?php if (!empty($files['lastBackupError'])): ?><tr><td>Error</td><td style="color:#ff6b6b;"><?php echo esc($files['lastBackupError']); ?></td></tr><?php endif; ?>
        </tbody></table>
        <div class="quick-actions" style="margin-top:.8rem;">
            <form method="POST"><button class="btn-icon" type="submit" name="action" value="run_files_backup"><span class="i">📦</span> Run</button></form>
        </div>
        <p style="margin-top:.7rem;color:#aaa;font-size:.9rem;">
            Includes: <code><?php echo esc(implode(', ', $files['include'] ?? [])); ?></code>
        </p>
    </div>

    <div class="section">
        <h2>Restore</h2>
        <p style="color:#aaa;margin-bottom:.8rem;">Achtung: Restore kann DB/Files überschreiben und optional Services neu starten.</p>

        <form method="POST" class="form" style="display:grid;gap:.75rem;">
            <input type="hidden" name="action" value="schedule_restore" />

            <label>
                Mode
                <select name="mode">
                    <option value="full">Full (DB + Files)</option>
                    <option value="db">DB only</option>
                    <option value="files">Files only</option>
                </select>
            </label>

            <label>
                SQL Backup
                <select name="sql">
                    <option value="">—</option>
                    <?php foreach (($list['mysql'] ?? []) as $b): ?>
                        <option value="<?php echo esc($b['file'] ?? ''); ?>"><?php echo esc(($b['file'] ?? '') . ' (' . bytesPretty($b['size'] ?? 0) . ')'); ?></option>
                    <?php endforeach; ?>
                </select>
            </label>

            <label>
                Files Archive
                <select name="files">
                    <option value="">—</option>
                    <?php foreach (($list['files'] ?? []) as $b): ?>
                        <option value="<?php echo esc($b['file'] ?? ''); ?>"><?php echo esc(($b['file'] ?? '') . ' (' . bytesPretty($b['size'] ?? 0) . ')'); ?></option>
                    <?php endforeach; ?>
                </select>
            </label>

            <label style="display:flex;align-items:center;gap:.5rem;">
                <input type="checkbox" name="restart" value="1" checked />
                Restart services after restore
            </label>

            <label>
                Confirm (type <code>RESTORE</code>)
                <input name="confirm" placeholder="RESTORE" />
            </label>

            <button class="btn-primary" type="submit">Schedule Restore</button>
        </form>

        <div style="margin-top:1rem;">
            <h3 style="margin-bottom:.5rem;">Restore Status</h3>
            <?php if (!$restore): ?>
                <p style="color:#999;">Kein Restore-Job gefunden.</p>
            <?php else: ?>
                <table class="table"><tbody>
                    <tr><td>Running</td><td><?php echo !empty($restore['running']) ? 'yes' : 'no'; ?></td></tr>
                    <tr><td>Mode</td><td><code><?php echo esc($restore['mode'] ?? ''); ?></code></td></tr>
                    <tr><td>Started</td><td><?php echo esc($restore['startedAt'] ?? ''); ?></td></tr>
                    <tr><td>Finished</td><td><?php echo esc($restore['finishedAt'] ?? '—'); ?></td></tr>
                    <tr><td>OK</td><td style="color:<?php echo ($restore['ok'] === true) ? '#51cf66' : (($restore['ok'] === false) ? '#ff6b6b' : '#ffd43b'); ?>;"><?php echo ($restore['ok'] === true) ? 'yes' : (($restore['ok'] === false) ? 'no' : '—'); ?></td></tr>
                    <?php if (!empty($restore['error'])): ?><tr><td>Error</td><td style="color:#ff6b6b;"><?php echo esc($restore['error']); ?></td></tr><?php endif; ?>
                </tbody></table>
            <?php endif; ?>
        </div>
    </div>
</div>

<?php include '../includes/footer.php'; ?>
