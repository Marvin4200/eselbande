<?php
$page_title = 'Server Backup';
require_once __DIR__ . '/../includes/config.php';
requireLogin();
// session_start() removed — config.php starts the session centrally.

// AJAX: job status proxy
$ajaxGuildId = preg_replace('/[^0-9]/', '', $_GET['guildId'] ?? '');
if (isset($_GET['ajax_job']) && $ajaxGuildId !== '') {
    header('Content-Type: application/json');
    $jobId = (int)($_GET['ajax_job']);
    $jobType = ($_GET['type'] ?? 'restore') === 'backup' ? 'backup' : 'restore';
    if ($jobId > 0) {
        $endpoint = $jobType === 'backup'
            ? '/guilds/' . $ajaxGuildId . '/backup-jobs/' . $jobId
            : '/guilds/' . $ajaxGuildId . '/restore-jobs/' . $jobId;
        $raw = getAPI($endpoint, 10);
        echo json_encode($raw);
    } else {
        echo json_encode(['success' => false, 'message' => 'Invalid job ID']);
    }
    exit;
}

// AJAX: restore preview proxy
if (isset($_GET['ajax_preview']) && $ajaxGuildId !== '') {
    header('Content-Type: application/json');
    $backupId = (int)($_GET['backupId'] ?? 0);
    if ($backupId < 1) {
        echo json_encode(['success' => false, 'message' => 'Invalid backup ID']);
        exit;
    }

    $opt = static function($key, $default = false) {
        $v = $_GET[$key] ?? null;
        if ($v === null) return $default;
        return in_array(strtolower((string)$v), ['1', 'true', 'yes', 'on'], true);
    };

    $payload = [
        'backupId' => $backupId,
        'options' => [
            'roles' => $opt('roles', true),
            'channels' => $opt('channels', true),
            'emojis' => $opt('emojis', false),
            'messages' => $opt('messages', true),
            'settings' => $opt('settings', false),
            'wipeExisting' => $opt('wipe', false),
        ],
    ];

    $raw = api('/guilds/' . $ajaxGuildId . '/discord-backups/restore-preview', 'POST', $payload, 15);
    echo json_encode($raw['data'] ?? ['success' => false, 'message' => 'Preview API response missing']);
    exit;
}

$guildsRaw = getAPI('/voice/guilds', 8);
$guilds = $guildsRaw['data']['guilds'] ?? [];
$guildId = dashboardSelectedGuildId($guilds);

// 1. URL-params after PRG redirect (most reliable – set directly in Location header)
$rjobParam   = (int)($_GET['rjob']   ?? 0);
$rguildParam = preg_replace('/[^0-9]/', '', $_GET['rguild'] ?? '');
$bjobParam   = (int)($_GET['bjob']   ?? 0);

if ($rjobParam > 0 && $rguildParam) {
    $activeJob = ['jobId' => $rjobParam, 'guildId' => $rguildParam, 'name' => $rguildParam];
    $_SESSION['restore_job'] = $activeJob;
} else {
    $activeJob = $_SESSION['restore_job'] ?? null;
}

if ($bjobParam > 0 && $guildId) {
    $activeBackupJob = ['jobId' => $bjobParam, 'guildId' => $guildId, 'name' => $guildId];
    $_SESSION['backup_job'] = $activeBackupJob;
} else {
    $activeBackupJob = $_SESSION['backup_job'] ?? null;
}

// 2. Auto-recover via API as fallback (only picks up still-running jobs)
if (!$activeBackupJob && $guildId) {
    $latestBackup = getAPI('/guilds/' . urlencode($guildId) . '/backup-jobs/latest', 8);
    if (($latestBackup['success'] ?? false) && !empty($latestBackup['data']['id'])) {
        $activeBackupJob = [
            'jobId' => (int)$latestBackup['data']['id'],
            'guildId' => $guildId,
            'name' => $guildId,
        ];
        $_SESSION['backup_job'] = $activeBackupJob;
    }
}
if (!$activeJob && $guildId) {
    $latestRestore = getAPI('/guilds/' . urlencode($guildId) . '/restore-jobs/latest', 8);
    if (($latestRestore['success'] ?? false) && !empty($latestRestore['data']['id'])) {
        $activeJob = [
            'jobId' => (int)$latestRestore['data']['id'],
            'guildId' => $guildId,
            'name' => $guildId,
        ];
        $_SESSION['restore_job'] = $activeJob;
    }
}

$showJobPanel = !empty($activeJob);
$showBackupJobPanel = !empty($activeBackupJob);

// ---- Download handler ----
if (isset($_GET['download']) && $guildId) {
    $backupId = (int)($_GET['download']);
    if ($backupId > 0) {
        $apiUrl = API_BASE . '/guilds/' . urlencode($guildId) . '/discord-backups/' . $backupId;
        $ch = curl_init($apiUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
        curl_setopt($ch, CURLOPT_TIMEOUT, 60);
        curl_setopt($ch, CURLOPT_HTTPHEADER, dashboardHeaders(true));
        $body = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($httpCode === 200 && $body !== false) {
            $filename = 'discord-backup-' . $guildId . '-' . $backupId . '.json';
            header('Content-Type: application/json');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            header('Content-Length: ' . strlen($body));
            echo $body;
            exit;
        }
    }
}

// ---- Delete handler ----
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $guildId) {
    $action = $_POST['action'] ?? '';

    if ($action === 'delete_backup') {
        $backupId = (int)($_POST['backup_id'] ?? 0);
        if ($backupId > 0) {
            $result = api('/guilds/' . urlencode($guildId) . '/discord-backups/' . $backupId, 'DELETE', null, 15);
            $ok = ($result['data']['success'] ?? false);
            $_SESSION['flash'] = [
                'msg'  => $ok ? '🗑️ Backup gelöscht.' : ($result['data']['message'] ?? 'Fehler beim Löschen.'),
                'type' => $ok ? 'success' : 'error',
            ];
        }
        header('Location: ' . strtok($_SERVER['REQUEST_URI'], '?') . '?guildId=' . urlencode($guildId));
        exit;
    }

    if ($action === 'restore_backup') {
        $backupId      = (int)($_POST['backup_id'] ?? 0);
        $targetGuildId = preg_replace('/[^0-9]/', '', $_POST['target_guild_id'] ?? '');
        if ($backupId > 0 && $targetGuildId) {
            $opts = [
                'backupId' => $backupId,
                'options'  => [
                    'roles'    => isset($_POST['opt_roles']),
                    'channels' => isset($_POST['opt_channels']),
                    'emojis'   => isset($_POST['opt_emojis']),
                    'messages' => isset($_POST['opt_messages']),
                    'settings' => isset($_POST['opt_settings']),
                    'autoVerify' => isset($_POST['opt_auto_verify']),
                    'wipeExisting' => isset($_POST['opt_wipe_existing']),
                    'messageMode' => in_array(($_POST['message_mode'] ?? 'embed'), ['embed', 'webhook', 'plain'], true) ? $_POST['message_mode'] : 'embed',
                ],
            ];
            $result = api('/guilds/' . $targetGuildId . '/discord-backups/restore', 'POST', $opts, 15);
            if ($result['data']['success'] ?? false) {
                $tName = $result['data']['data']['targetGuild'] ?? $targetGuildId;
                $jobId = (int)($result['data']['data']['jobId'] ?? 0);
                if ($jobId > 0) {
                    $_SESSION['restore_job'] = ['jobId' => $jobId, 'guildId' => $targetGuildId, 'name' => $tName];
                    unset($_SESSION['backup_job']); // clear stale backup panel
                    $_SESSION['flash'] = ['msg' => '🔄 Restore von Backup #' . $backupId . ' auf "' . htmlspecialchars($tName) . '" gestartet.', 'type' => 'success'];
                    header('Location: ' . strtok($_SERVER['REQUEST_URI'], '?') . '?guildId=' . urlencode($guildId) . '&rjob=' . $jobId . '&rguild=' . urlencode($targetGuildId));
                    exit;
                } else {
                    $_SESSION['flash'] = ['msg' => 'Restore gestartet, aber keine Job-ID erhalten.', 'type' => 'error'];
                }
            } else {
                $_SESSION['flash'] = ['msg' => $result['data']['message'] ?? 'Restore fehlgeschlagen.', 'type' => 'error'];
            }
        }
        header('Location: ' . strtok($_SERVER['REQUEST_URI'], '?') . '?guildId=' . urlencode($guildId));
        exit;
    }

    if ($action === 'create_backup') {
        $result = api('/guilds/' . urlencode($guildId) . '/discord-backups/create', 'POST', [], 15);
        if ($result['data']['success'] ?? false) {
            $jobId = (int)($result['data']['data']['jobId'] ?? 0);
            if ($jobId > 0) {
                $_SESSION['backup_job'] = ['jobId' => $jobId, 'guildId' => $guildId, 'name' => $guildId];
                unset($_SESSION['restore_job']); // clear stale restore panel
                $_SESSION['flash'] = ['msg' => '⏳ Backup wird im Hintergrund erstellt.', 'type' => 'success'];
                header('Location: ' . strtok($_SERVER['REQUEST_URI'], '?') . '?guildId=' . urlencode($guildId) . '&bjob=' . $jobId);
                exit;
            }
            $_SESSION['flash'] = ['msg' => '⏳ Backup gestartet.', 'type' => 'success'];
        } else {
            $_SESSION['flash'] = ['msg' => $result['data']['message'] ?? 'Backup fehlgeschlagen.', 'type' => 'error'];
        }
        header('Location: ' . strtok($_SERVER['REQUEST_URI'], '?') . '?guildId=' . urlencode($guildId));
        exit;
    }

    if ($action === 'save_schedule') {
        $enabled = isset($_POST['schedule_enabled']);
        $intervalHours = max(1, min(720, (int)($_POST['schedule_interval_hours'] ?? 24)));
        $retentionCount = max(1, min(200, (int)($_POST['schedule_retention_count'] ?? 10)));
        $backupMode = (($_POST['schedule_backup_mode'] ?? 'full') === 'incremental') ? 'incremental' : 'full';
        $payload = [
            'enabled' => $enabled,
            'intervalHours' => $intervalHours,
            'retentionCount' => $retentionCount,
            'backupMode' => $backupMode,
        ];
        $result = api('/guilds/' . urlencode($guildId) . '/discord-backups/schedule', 'POST', $payload, 15);
        $_SESSION['flash'] = [
            'msg' => ($result['data']['success'] ?? false)
                ? '🗓️ Backup-Zeitplan gespeichert.'
                : ($result['data']['message'] ?? 'Fehler beim Speichern des Zeitplans.'),
            'type' => ($result['data']['success'] ?? false) ? 'success' : 'error',
        ];
        header('Location: ' . strtok($_SERVER['REQUEST_URI'], '?') . '?guildId=' . urlencode($guildId));
        exit;
    }

    if ($action === 'verify_backup') {
        $backupId = (int)($_POST['backup_id'] ?? 0);
        $targetGuildId = preg_replace('/[^0-9]/', '', $_POST['target_guild_id'] ?? '');
        if ($backupId > 0 && $targetGuildId) {
            $result = api('/guilds/' . $targetGuildId . '/discord-backups/verify', 'POST', ['backupId' => $backupId], 20);
            if ($result['data']['success'] ?? false) {
                $_SESSION['verify_report'] = $result['data']['data'];
                $_SESSION['flash'] = ['msg' => '✅ Verify-Report erstellt.', 'type' => 'success'];
            } else {
                $_SESSION['flash'] = ['msg' => $result['data']['message'] ?? 'Verify fehlgeschlagen.', 'type' => 'error'];
            }
        }
        header('Location: ' . strtok($_SERVER['REQUEST_URI'], '?') . '?guildId=' . urlencode($guildId));
        exit;
    }
}

$backupsRaw = $guildId ? getAPI('/guilds/' . urlencode($guildId) . '/discord-backups', 15) : null;
$backups = $backupsRaw['data']['backups'] ?? [];
$backupsError = (!($backupsRaw['success'] ?? false)) ? ($backupsRaw['message'] ?? $backupsRaw['error'] ?? 'API-Fehler') : null;

$scheduleRaw = $guildId ? getAPI('/guilds/' . urlencode($guildId) . '/discord-backups/schedule', 10) : null;
$schedule = $scheduleRaw['data'] ?? [
    'enabled' => false,
    'intervalHours' => 24,
    'retentionCount' => 10,
    'backupMode' => 'full',
    'nextRunAt' => null,
    'lastRunAt' => null,
];

$verifyReport = $_SESSION['verify_report'] ?? null;
unset($_SESSION['verify_report']);

// Read flash message stored before PRG redirect
if (!empty($_SESSION['flash'])) {
    $message     = $_SESSION['flash']['msg'];
    $messageType = $_SESSION['flash']['type'];
    unset($_SESSION['flash']);
}
if (!isset($message)) $message = '';
if (!isset($messageType)) $messageType = 'success';
if (!isset($autoRefresh)) $autoRefresh = 0;

function fmtTs($ms) {
    if (!$ms) return '—';
    return date('d.m.Y H:i', (int)($ms / 1000));
}
?>
<?php include '../includes/header.php'; ?>
<?php if ($autoRefresh > 0): ?>
<meta http-equiv="refresh" content="<?php echo (int)$autoRefresh; ?>">
<?php endif; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.alert { padding:12px 15px; border-radius:8px; border-left:4px solid; margin-bottom:20px; }
.alert-success { background:rgba(81,207,102,.12); color:#51cf66; border-color:#51cf66; }
.alert-error { background:rgba(255,107,107,.12); color:#ff6b6b; border-color:#ff6b6b; }
.backup-table { width:100%; border-collapse:collapse; }
.backup-table th { text-align:left; padding:.5rem .75rem; font-size:.8rem; text-transform:uppercase; color:#888; border-bottom:1px solid rgba(255,255,255,.08); }
.backup-table td { padding:.6rem .75rem; font-size:.88rem; border-bottom:1px solid rgba(255,255,255,.05); vertical-align:middle; }
.backup-table tr:last-child td { border-bottom:none; }
.backup-table tr:hover td { background:rgba(255,255,255,.03); }
.badge { display:inline-block; padding:.15rem .5rem; border-radius:4px; font-size:.78rem; background:rgba(88,101,242,.18); color:#8b9cf7; }
.btn-sm { padding:.25rem .65rem; border-radius:5px; font-size:.8rem; cursor:pointer; border:none; }
.btn-dl { background:rgba(81,207,102,.15); color:#51cf66; }
.btn-dl:hover { background:rgba(81,207,102,.3); }
.btn-del { background:rgba(255,107,107,.12); color:#ff6b6b; }
.btn-del:hover { background:rgba(255,107,107,.3); }
.stat-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(120px,1fr)); gap:.5rem; margin-top:.5rem; }
.stat-box { background:rgba(255,255,255,.05); border-radius:7px; padding:.5rem .75rem; text-align:center; }
.stat-box strong { display:block; font-size:1.15rem; color:#fff; }
.stat-box span { font-size:.75rem; color:#888; }
.btn-restore { background:rgba(88,101,242,.15); color:#8b9cf7; }
.btn-restore:hover { background:rgba(88,101,242,.35); }
/* Modal */
.modal-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,.65); z-index:9999; align-items:center; justify-content:center; }
.modal-overlay.active { display:flex; }
.modal-box { background:#1e1f2e; border:1px solid rgba(255,255,255,.1); border-radius:12px; padding:1.5rem; width:min(480px,95vw); }
.modal-box h3 { margin:0 0 1rem; font-size:1.05rem; }
.modal-field { margin-bottom:.85rem; }
.modal-field label { display:block; font-size:.82rem; color:#aaa; margin-bottom:.3rem; }
.modal-field select, .modal-field input[type=text] { width:100%; padding:.45rem .65rem; background:#13141f; border:1px solid rgba(255,255,255,.12); border-radius:6px; color:#fff; font-size:.88rem; }
.modal-checks { display:grid; grid-template-columns:1fr 1fr; gap:.4rem; }
.modal-checks label { display:flex; align-items:center; gap:.45rem; font-size:.85rem; color:#ccc; cursor:pointer; }
.modal-warn { background:rgba(255,193,7,.08); border:1px solid rgba(255,193,7,.25); border-radius:7px; padding:.6rem .85rem; font-size:.8rem; color:#ffc107; margin-bottom:1rem; }
.preview-box { background:#121425; border:1px solid rgba(255,255,255,.12); border-radius:8px; padding:.75rem .9rem; margin:.75rem 0; font-size:.82rem; color:#c8d0e8; display:none; }
.preview-box.active { display:block; }
.preview-box .title { color:#8b9cf7; font-weight:600; margin-bottom:.35rem; }
.modal-footer { display:flex; gap:.65rem; justify-content:flex-end; margin-top:1.1rem; }
.job-progress { height:9px; background:rgba(255,255,255,.08); border-radius:999px; overflow:hidden; margin-bottom:.65rem; }
.job-progress > span { display:block; height:100%; width:0%; background:linear-gradient(90deg,#4f8cff,#51cf66); transition:width .25s ease; }
.job-meta { font-size:.8rem; color:#a5b4d6; margin-bottom:.5rem; }
.job-log { background:#0e0f1a; border:1px solid rgba(255,255,255,.07); border-radius:8px; padding:.85rem; font-size:.78rem; color:#ccc; max-height:320px; overflow-y:auto; white-space:pre-wrap; word-break:break-word; }
.log-line { display:block; margin-bottom:.12rem; }
.log-ok { color:#51cf66; }
.log-err { color:#ff6b6b; }
.log-warn { color:#ffc107; }
.log-skip { color:#9aa3b2; }
.log-info { color:#8b9cf7; }
</style>

<div class="page-header">
    <div class="page-header-row">
        <div>
            <h1>💾 Server Backup</h1>
            <p class="subtitle">Kompletter Snapshot: Rollen, Channels, Emojis, Bans, Nachrichten, AutoMod &amp; mehr — gespeichert in der Datenbank.</p>
        </div>
        <?php if ($guildId): ?>
        <div class="page-meta">
            <form method="POST" onsubmit="return confirm('Backup erstellen? Das kann bei vielen Nachrichten einige Minuten dauern.');">
                <input type="hidden" name="action" value="create_backup" />
                <button class="btn-primary" type="submit">💾 Backup erstellen</button>
            </form>
        </div>
        <?php endif; ?>
    </div>
</div>

<?php if (!$guildId): ?>
    <div class="section"><p style="color:#aaa;">Bitte wähle zuerst einen Server aus.</p></div>
<?php else: ?>

<?php if ($message): ?>
    <div class="alert alert-<?php echo esc($messageType); ?>"><?php echo esc($message); ?></div>
<?php endif; ?>

<?php if ($showBackupJobPanel && $activeBackupJob): ?>
<div class="section" id="backupJobPanel" style="margin-bottom:1rem;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem;">
        <h2 style="margin:0;">💾 Backup läuft</h2>
        <span style="font-size:.8rem;color:#666;">Live</span>
    </div>
    <div id="backupJobStatus" style="font-size:.82rem;color:#aaa;margin-bottom:.35rem;">Status: wird geladen...</div>
    <div id="backupJobMeta" class="job-meta">Phase: -</div>
    <div class="job-progress"><span id="backupJobProgressBar"></span></div>
    <div id="backupJobLog" class="job-log">Warte auf Logs...</div>
</div>
<?php endif; ?>

<?php if ($showJobPanel && $activeJob): ?>
<div class="section" id="restoreJobPanel" style="margin-bottom:1.5rem;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem;">
        <h2 style="margin:0;">🔄 Restore läuft: <span style="color:#8b9cf7;"><?php echo esc($activeJob['name']); ?></span></h2>
        <span style="font-size:.8rem;color:#666;">Live</span>
    </div>
    <div id="jobStatus" style="font-size:.82rem;color:#aaa;margin-bottom:.5rem;">Status: wird geladen...</div>
    <div id="jobMeta" class="job-meta">Phase: -</div>
    <div class="job-progress"><span id="restoreJobProgressBar"></span></div>
    <div id="jobLog" class="job-log">Warte auf Logs...</div>
</div>
<?php endif; ?>

<div class="hub-grid" style="grid-template-columns:1fr 2fr;">

    <div class="section">
        <h2>Was wird gesichert?</h2>
        <ul style="list-style:none;padding:0;margin:0;display:grid;gap:.45rem;color:#bbb;font-size:.88rem;">
            <li>⚙️ Server-Einstellungen</li>
            <li>🎨 Rollen (Farben, Permissions, Position)</li>
            <li>📁 Channels (Kategorien, Overwrites)</li>
            <li>😀 Emojis &amp; Sticker</li>
            <li>🔨 Bans-Liste</li>
            <li>💌 Invites</li>
            <li>🔗 Webhooks</li>
            <li>🚨 Native AutoMod Regeln</li>
            <li>📅 Scheduled Events</li>
            <li>🧵 Aktive Threads</li>
            <li>📋 Audit-Log (letzte 100)</li>
            <li>💬 Nachrichten (bis 1000/Channel)</li>
            <li>🤖 Bot-Konfiguration</li>
        </ul>
        <hr style="border-color:rgba(255,255,255,.07);margin:1rem 0;"/>
        <p style="color:#777;font-size:.8rem;">Max. 10 Backups pro Server. Älteste werden automatisch gelöscht.</p>
        <p style="color:#777;font-size:.8rem;margin-top:.4rem;">Auch per <code>/serverbackup create</code> im Discord erstellbar.</p>
    </div>

    <div class="section">
        <h2>Vorhandene Backups <span style="color:#888;font-weight:400;font-size:.85rem;">(<?php echo count($backups); ?>)</span></h2>

        <div style="margin:.8rem 0 1rem;padding:.75rem;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:rgba(255,255,255,.02);">
            <h3 style="margin:.1rem 0 .6rem;font-size:.9rem;color:#cdd6f4;">🗓️ Geplante Backups</h3>
            <form method="POST" style="display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:.55rem;align-items:end;">
                <input type="hidden" name="action" value="save_schedule" />
                <label style="display:flex;align-items:center;gap:.4rem;color:#bbb;font-size:.82rem;">
                    <input type="checkbox" name="schedule_enabled" <?php echo !empty($schedule['enabled']) ? 'checked' : ''; ?> /> Aktiv
                </label>
                <label style="display:block;color:#bbb;font-size:.78rem;">Intervall (Stunden)
                    <input type="number" min="1" max="720" name="schedule_interval_hours" value="<?php echo (int)($schedule['intervalHours'] ?? 24); ?>" style="width:100%;margin-top:.25rem;padding:.45rem .55rem;background:#111427;border:1px solid rgba(255,255,255,.13);border-radius:6px;color:#fff;" />
                </label>
                <label style="display:block;color:#bbb;font-size:.78rem;">Retention (Backups behalten)
                    <input type="number" min="1" max="200" name="schedule_retention_count" value="<?php echo (int)($schedule['retentionCount'] ?? 10); ?>" style="width:100%;margin-top:.25rem;padding:.45rem .55rem;background:#111427;border:1px solid rgba(255,255,255,.13);border-radius:6px;color:#fff;" />
                </label>
                <label style="display:block;color:#bbb;font-size:.78rem;">Backup-Modus
                    <select name="schedule_backup_mode" style="width:100%;margin-top:.25rem;padding:.45rem .55rem;background:#111427;border:1px solid rgba(255,255,255,.13);border-radius:6px;color:#fff;">
                        <option value="full" <?php echo (($schedule['backupMode'] ?? 'full') === 'full') ? 'selected' : ''; ?>>Full</option>
                        <option value="incremental" <?php echo (($schedule['backupMode'] ?? 'full') === 'incremental') ? 'selected' : ''; ?>>Incremental (Diff)</option>
                    </select>
                </label>
                <div style="grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;">
                    <small style="color:#7e8aa8;">Nächster Lauf: <?php echo esc(fmtTs($schedule['nextRunAt'] ?? 0)); ?> · Letzter Lauf: <?php echo esc(fmtTs($schedule['lastRunAt'] ?? 0)); ?></small>
                    <button class="btn-sm btn-restore" type="submit">Speichern</button>
                </div>
            </form>
        </div>

        <?php if ($verifyReport): ?>
        <div style="margin:.2rem 0 1rem;padding:.75rem;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:rgba(79,140,255,.08);">
            <h3 style="margin:.1rem 0 .4rem;font-size:.9rem;color:#d9e5ff;">✅ Verify-Report</h3>
            <p style="margin:.2rem 0;color:#c3d2ff;font-size:.82rem;">
                Overall: <strong><?php echo (int)($verifyReport['coverage']['overall'] ?? 0); ?>%</strong>
                (Rollen <?php echo (int)($verifyReport['coverage']['roles'] ?? 0); ?>% · Channels <?php echo (int)($verifyReport['coverage']['channels'] ?? 0); ?>% · Emojis <?php echo (int)($verifyReport['coverage']['emojis'] ?? 0); ?>%)
            </p>
            <p style="margin:.2rem 0;color:#9db0df;font-size:.8rem;">
                Backup: Rollen <?php echo (int)($verifyReport['counts']['backup']['roles'] ?? 0); ?>, Channels <?php echo (int)($verifyReport['counts']['backup']['channels'] ?? 0); ?>, Emojis <?php echo (int)($verifyReport['counts']['backup']['emojis'] ?? 0); ?>
                · Ziel: Rollen <?php echo (int)($verifyReport['counts']['target']['roles'] ?? 0); ?>, Channels <?php echo (int)($verifyReport['counts']['target']['channels'] ?? 0); ?>, Emojis <?php echo (int)($verifyReport['counts']['target']['emojis'] ?? 0); ?>
            </p>
        </div>
        <?php endif; ?>

        <?php if ($backupsError): ?>
            <p style="color:#ff6b6b;">Fehler: <?php echo esc($backupsError); ?></p>
        <?php elseif (empty($backups)): ?>
            <p style="color:#aaa;">Noch keine Backups vorhanden.</p>
        <?php else: ?>
        <table class="backup-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Erstellt</th>
                    <th>Statistiken</th>
                    <th>Aktionen</th>
                </tr>
            </thead>
            <tbody>
            <?php foreach ($backups as $b): ?>
                <?php $s = $b['stats'] ?? []; ?>
                <tr>
                    <td><span class="badge">#<?php echo (int)($b['id'] ?? 0); ?></span></td>
                    <td style="white-space:nowrap;"><?php echo esc(fmtTs($b['createdAt'] ?? 0)); ?></td>
                    <td>
                        <div class="stat-grid">
                            <div class="stat-box"><strong><?php echo (int)($s['roles'] ?? 0); ?></strong><span>Rollen</span></div>
                            <div class="stat-box"><strong><?php echo (int)($s['channels'] ?? 0); ?></strong><span>Channels</span></div>
                            <div class="stat-box"><strong><?php echo (int)($s['messages'] ?? 0); ?></strong><span>Msgs</span></div>
                            <div class="stat-box"><strong><?php echo (int)($s['bans'] ?? 0); ?></strong><span>Bans</span></div>
                            <div class="stat-box"><strong><?php echo (int)($s['emojis'] ?? 0); ?></strong><span>Emojis</span></div>
                        </div>
                    </td>
                    <td style="white-space:nowrap;">
                        <a class="btn-sm btn-dl" href="?download=<?php echo (int)($b['id'] ?? 0); ?>">⬇ JSON</a>
                        <button class="btn-sm btn-restore" type="button" onclick="openRestoreModal(<?php echo (int)($b['id'] ?? 0); ?>)">🔄 Restore</button>
                        <form method="POST" style="display:inline;">
                            <input type="hidden" name="action" value="verify_backup" />
                            <input type="hidden" name="backup_id" value="<?php echo (int)($b['id'] ?? 0); ?>" />
                            <input type="hidden" name="target_guild_id" value="<?php echo esc($guildId); ?>" />
                            <button class="btn-sm btn-restore" type="submit">✅ Verify</button>
                        </form>
                        <form method="POST" style="display:inline;" onsubmit="return confirm('Backup #<?php echo (int)($b['id'] ?? 0); ?> wirklich löschen?');">
                            <input type="hidden" name="action" value="delete_backup" />
                            <input type="hidden" name="backup_id" value="<?php echo (int)($b['id'] ?? 0); ?>" />
                            <button class="btn-sm btn-del" type="submit">🗑</button>
                        </form>
                    </td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
        <?php endif; ?>
    </div>

</div>
<?php endif; ?>

<!-- Restore Modal -->
<div class="modal-overlay" id="restoreModal">
  <div class="modal-box">
    <h3>🔄 Backup wiederherstellen</h3>
    <form method="POST" onsubmit="return confirmRestore();">
      <input type="hidden" name="action" value="restore_backup" />
      <input type="hidden" name="backup_id" id="modal_backup_id" value="" />

      <div class="modal-field">
        <label>Ziel-Server (Bot muss dort Mitglied sein)</label>
        <select name="target_guild_id" required>
          <option value="">— Server auswählen —</option>
          <?php foreach ($guilds as $g): ?>
          <option value="<?php echo esc($g['id']); ?>"><?php echo esc($g['name']); ?></option>
          <?php endforeach; ?>
        </select>
      </div>

      <div class="modal-field">
        <label>Was wiederherstellen?</label>
        <div class="modal-checks">
          <label><input type="checkbox" name="opt_roles" checked /> 🎨 Rollen</label>
          <label><input type="checkbox" name="opt_channels" checked /> 📁 Channels</label>
                    <label><input type="checkbox" name="opt_messages" checked /> 💬 Nachrichten</label>
          <label><input type="checkbox" name="opt_emojis" /> 😀 Emojis</label>
          <label><input type="checkbox" name="opt_settings" /> ⚙️ Server-Settings</label>
        </div>
      </div>

            <div class="modal-field">
                <label>Nachrichten-Stil</label>
                <select name="message_mode">
                    <option value="embed" selected>Embed (schon)</option>
                    <option value="webhook">Webhook (wie Nutzer)</option>
                    <option value="plain">Plain Text</option>
                </select>
            </div>

            <div class="modal-field">
                <label style="display:flex;align-items:center;gap:.5rem;color:#ffb0b0;">
                    <input type="checkbox" name="opt_wipe_existing" />
                    🧨 Vor Restore alles Alte löschen (Channels/Rollen/Emojis)
                </label>
            </div>

            <div class="modal-field">
                <label style="display:flex;align-items:center;gap:.5rem;color:#9fd3ff;">
                    <input type="checkbox" name="opt_auto_verify" checked />
                    ✅ Nach Restore automatisch Verify-Report erstellen
                </label>
            </div>

            <div class="modal-warn">⚠️ Ohne Cleanup werden Rollen/Channels zusätzlich erstellt. Mit Cleanup wird der Ziel-Server vor Restore geleert.</div>

            <div id="restorePreviewBox" class="preview-box" aria-live="polite"></div>

      <div class="modal-footer">
                <button type="button" class="btn-secondary" onclick="previewRestore()">Preview</button>
        <button type="button" class="btn-secondary" onclick="closeRestoreModal()">Abbrechen</button>
        <button type="submit" class="btn-primary">🔄 Restore starten</button>
      </div>
    </form>
  </div>
</div>

<script>
function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderColorLog(el, text) {
    const lines = String(text || '').split('\n');
    const html = lines.map(line => {
        let cls = 'log-info';
        if (/\b(OK|ERSTELLT|GELÖSCHT|FERTIG)\b/i.test(line)) cls = 'log-ok';
        if (/\b(FEHLER|KRITISCH)\b/i.test(line)) cls = 'log-err';
        if (/\bWARN\b/i.test(line)) cls = 'log-warn';
        if (/\bSKIP\b/i.test(line)) cls = 'log-skip';
        return '<span class="log-line ' + cls + '">' + escapeHtml(line) + '</span>';
    }).join('');
    el.innerHTML = html;
}

function startJobPolling(cfg) {
    if (!cfg.jobId || !cfg.guildId || !cfg.statusEl) return;
    let done = false;
    function applyProgress(job) {
        const current = Number(job.progressCurrent || 0);
        const total = Number(job.progressTotal || 0);
        const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((current / total) * 100))) : 0;
        if (cfg.metaEl) cfg.metaEl.textContent = 'Phase: ' + (job.phase || '-') + ' (' + current + '/' + total + ', ' + pct + '%)';
        if (cfg.progressEl) cfg.progressEl.style.transform = 'scaleX(' + (pct / 100) + ')';
    }
    function poll() {
        fetch('?ajax_job=' + cfg.jobId + '&type=' + cfg.type + '&guildId=' + encodeURIComponent(cfg.guildId))
            .then(r => r.json())
            .then(res => {
                const job = res?.data?.data ?? res?.data;
                if (!res?.success) {
                    cfg.statusEl.textContent = 'Status: ❌ ' + (res?.message || 'API-Fehler beim Laden');
                    cfg.statusEl.style.color = '#ff6b6b';
                    return;
                }
                if (!job) {
                    cfg.statusEl.textContent = 'Status: ❌ Jobdaten fehlen';
                    cfg.statusEl.style.color = '#ff6b6b';
                    return;
                }
                const s = job.status;
                cfg.statusEl.textContent = 'Status: ' + (s === 'running' ? '⏳ Läuft...' : s === 'done' ? '✅ Fertig' : '❌ Fehler');
                cfg.statusEl.style.color = s === 'done' ? '#51cf66' : (s === 'failed' ? '#ff6b6b' : '#aaa');
                applyProgress(job);
                if (cfg.logEl && job.log) {
                    renderColorLog(cfg.logEl, job.log);
                    cfg.logEl.scrollTop = cfg.logEl.scrollHeight;
                }
                if (s !== 'running') done = true;
            })
            .catch(() => {
                cfg.statusEl.textContent = 'Status: ❌ Netzwerkfehler beim Polling';
                cfg.statusEl.style.color = '#ff6b6b';
            });
        if (!done) setTimeout(poll, 3000);
    }
    poll();
}

<?php if ($showJobPanel && $activeJob): ?>
startJobPolling({
    type: 'restore',
    jobId: <?php echo (int)($activeJob['jobId'] ?? 0); ?>,
    guildId: <?php echo json_encode($activeJob['guildId'] ?? ''); ?>,
    statusEl: document.getElementById('jobStatus'),
    metaEl: document.getElementById('jobMeta'),
    progressEl: document.getElementById('restoreJobProgressBar'),
    logEl: document.getElementById('jobLog')
});
<?php endif; ?>

<?php if ($showBackupJobPanel && $activeBackupJob): ?>
startJobPolling({
    type: 'backup',
    jobId: <?php echo (int)($activeBackupJob['jobId'] ?? 0); ?>,
    guildId: <?php echo json_encode($activeBackupJob['guildId'] ?? ''); ?>,
    statusEl: document.getElementById('backupJobStatus'),
    metaEl: document.getElementById('backupJobMeta'),
    progressEl: document.getElementById('backupJobProgressBar'),
    logEl: document.getElementById('backupJobLog')
});
<?php endif; ?>

function openRestoreModal(backupId) {
  document.getElementById('modal_backup_id').value = backupId;
  document.getElementById('restoreModal').classList.add('active');
}
function closeRestoreModal() {
  document.getElementById('restoreModal').classList.remove('active');
}
function confirmRestore() {
  const target = document.querySelector('[name=target_guild_id]').value;
    const wipe = document.querySelector('[name=opt_wipe_existing]').checked;
  if (!target) { alert('Bitte einen Ziel-Server auswählen.'); return false; }
    if (wipe) {
        return confirm('ACHTUNG: Alte Channels/Rollen/Emojis werden gelöscht. Wirklich fortfahren?');
    }
    return confirm('Backup auf dem gewählten Server wiederherstellen? Bestehende Daten bleiben erhalten.');
}

function boolParam(selector) {
    const el = document.querySelector(selector);
    return !!(el && el.checked);
}

function renderRestorePreview(data) {
    const box = document.getElementById('restorePreviewBox');
    if (!box) return;
    const p = data?.plan || {};
    const w = Array.isArray(data?.warnings) ? data.warnings : [];
    const wipe = p.wipe
        ? 'Wipe: Channels ' + (p.wipe.channels || 0) + ', Emojis ' + (p.wipe.emojis || 0) + ', Rollen ' + (p.wipe.roles || 0)
        : 'Wipe: nein';
    const warns = w.length ? ('Warnungen: ' + w.join(' | ')) : 'Warnungen: keine';
    box.innerHTML =
        '<div class="title">Dry-Run Vorschau</div>' +
        '<div>Rollen: ' + (p.rolesCreatable || 0) + '/' + (p.rolesTotal || 0) + ' erstellbar</div>' +
        '<div>Channels: ' + (p.channelsTotal || 0) + ', Emojis: ' + (p.emojisTotal || 0) + ', Messages: ' + (p.messagesTotal || 0) + '</div>' +
        '<div>' + wipe + '</div>' +
        '<div>' + warns + '</div>';
    box.classList.add('active');
}

function previewRestore() {
    const backupId = Number(document.getElementById('modal_backup_id').value || 0);
    const targetGuildId = String(document.querySelector('[name=target_guild_id]')?.value || '').trim();
    if (!backupId) return alert('Ungültige Backup-ID.');
    if (!targetGuildId) return alert('Bitte zuerst Ziel-Server auswählen.');

    const q = new URLSearchParams({
        ajax_preview: '1',
        guildId: targetGuildId,
        backupId: String(backupId),
        roles: String(boolParam('[name=opt_roles]')),
        channels: String(boolParam('[name=opt_channels]')),
        emojis: String(boolParam('[name=opt_emojis]')),
        messages: String(boolParam('[name=opt_messages]')),
        settings: String(boolParam('[name=opt_settings]')),
        wipe: String(boolParam('[name=opt_wipe_existing]')),
    });

    fetch('?' + q.toString())
        .then(r => r.json())
        .then(res => {
            const payload = res?.data;
            if (!res?.success || !payload) {
                alert((res?.message || res?.error || 'Preview fehlgeschlagen.'));
                return;
            }
            renderRestorePreview(payload);
        })
        .catch(() => alert('Preview fehlgeschlagen (Netzwerkfehler).'));
}
document.getElementById('restoreModal').addEventListener('click', function(e) {
  if (e.target === this) closeRestoreModal();
});
</script>

<?php include '../includes/footer.php'; ?>
