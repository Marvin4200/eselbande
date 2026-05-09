<?php
$page_title = 'Moderation Console';
require_once __DIR__ . '/../includes/config.php';
requireLogin();

function prettyMs($ms) {
    $ms = (int)$ms;
    if ($ms <= 0) return '—';
    $m = (int)floor($ms / 60000);
    $h = (int)floor($m / 60);
    $d = (int)floor($h / 24);
    if ($d > 0) return $d . 'd ' . ($h % 24) . 'h';
    if ($h > 0) return $h . 'h ' . ($m % 60) . 'm';
    return $m . 'm';
}

function moderationStatusLabel($case) {
    $normalized = strtolower((string)($case['normalizedStatus'] ?? ''));
    if ($normalized === 'resolved') return 'resolved';
    $raw = strtolower((string)($case['status'] ?? ''));
    return $raw === 'resolved' ? 'resolved' : 'open';
}

$guildsRaw = getAPI('/voice/guilds', 8);
$guilds = $guildsRaw['data']['guilds'] ?? [];
$guildId = dashboardSelectedGuildId($guilds);

$userIdFilter = trim($_GET['userId'] ?? ($_POST['userIdFilter'] ?? ''));
$moderatorIdFilter = trim($_GET['moderatorId'] ?? ($_POST['moderatorIdFilter'] ?? ''));
$typeFilter = trim($_GET['type'] ?? ($_POST['typeFilter'] ?? ''));
$statusFilter = strtolower(trim($_GET['status'] ?? ($_POST['statusFilter'] ?? '')));
$reasonFilter = trim($_GET['reason'] ?? ($_POST['reasonFilter'] ?? ''));
$page = max(1, (int)($_GET['page'] ?? ($_POST['page'] ?? 1)));
$limit = max(10, min(100, (int)($_GET['limit'] ?? 25)));
$selectedCaseId = max(0, (int)($_GET['caseId'] ?? ($_POST['caseId'] ?? 0)));

$validTypes = ['warn', 'timeout', 'untimeout', 'kick', 'ban', 'unban', 'automod'];
$validStatuses = ['open', 'resolved'];

if ($typeFilter !== '' && !in_array($typeFilter, $validTypes, true)) $typeFilter = '';
if ($statusFilter !== '' && !in_array($statusFilter, $validStatuses, true)) $statusFilter = '';

$message = '';
$messageType = 'success';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    if (in_array($action, ['warn', 'note', 'timeout', 'untimeout', 'kick', 'ban', 'unban'], true)) {
        $payload = [
            'guildId' => $guildId,
            'userId' => trim($_POST['userIdAction'] ?? ''),
        ];
        if ($action === 'warn') {
            $payload['reason'] = trim($_POST['reasonAction'] ?? '');
            $result = api('/moderation/warn', 'POST', $payload, 20);
        } elseif ($action === 'note') {
            $payload['note'] = trim($_POST['reasonAction'] ?? '');
            $result = api('/moderation/note', 'POST', $payload, 20);
        } elseif ($action === 'timeout') {
            $payload['reason'] = trim($_POST['reasonAction'] ?? '');
            $payload['durationMinutes'] = (int)($_POST['durationMinutes'] ?? 10);
            $result = api('/moderation/timeout', 'POST', $payload, 25);
        } elseif ($action === 'untimeout') {
            $payload['reason'] = trim($_POST['reasonAction'] ?? '');
            $result = api('/moderation/untimeout', 'POST', $payload, 25);
        } elseif ($action === 'kick') {
            $payload['reason'] = trim($_POST['reasonAction'] ?? '');
            $result = api('/moderation/kick', 'POST', $payload, 25);
        } elseif ($action === 'ban') {
            $payload['reason'] = trim($_POST['reasonAction'] ?? '');
            $payload['deleteMessageSeconds'] = (int)($_POST['deleteMessageSeconds'] ?? 0);
            $result = api('/moderation/ban', 'POST', $payload, 25);
        } else {
            $payload['reason'] = trim($_POST['reasonAction'] ?? '');
            $result = api('/moderation/unban', 'POST', $payload, 25);
        }
    } elseif ($action === 'update_case_reason') {
        $caseId = max(1, (int)($_POST['caseId'] ?? 0));
        $payload = [
            'guildId' => $guildId,
            'reason' => trim($_POST['caseReason'] ?? ''),
        ];
        $result = api('/moderation/cases/' . $caseId . '/reason', 'POST', $payload, 20);
        $selectedCaseId = $caseId;
    } elseif ($action === 'update_case_status') {
        $caseId = max(1, (int)($_POST['caseId'] ?? 0));
        $payload = [
            'guildId' => $guildId,
            'status' => strtolower(trim($_POST['caseStatus'] ?? 'open')),
        ];
        $result = api('/moderation/cases/' . $caseId . '/status', 'POST', $payload, 20);
        $selectedCaseId = $caseId;
    } else {
        $result = ['status' => 400, 'data' => ['success' => false, 'message' => 'Unknown action']];
    }

    if (($result['data']['success'] ?? false) === true) {
        $message = $result['data']['message'] ?? 'Moderation action saved.';
    } else {
        $messageType = 'error';
        $message = $result['data']['message'] ?? 'Moderation action failed.';
    }
}

$query = '/moderation/cases?guildId=' . urlencode($guildId) . '&limit=' . $limit . '&page=' . $page;
if ($userIdFilter !== '') $query .= '&userId=' . urlencode($userIdFilter);
if ($moderatorIdFilter !== '') $query .= '&moderatorId=' . urlencode($moderatorIdFilter);
if ($typeFilter !== '') $query .= '&type=' . urlencode($typeFilter);
if ($statusFilter !== '') $query .= '&status=' . urlencode($statusFilter);
if ($reasonFilter !== '') $query .= '&reason=' . urlencode($reasonFilter);

$casesRaw = $guildId ? getAPI($query, 20) : null;
$cases = $casesRaw['data']['cases'] ?? [];
$pagination = $casesRaw['data']['pagination'] ?? [
    'page' => $page,
    'limit' => $limit,
    'total' => count($cases),
    'totalPages' => 1,
];
$currentPage = max(1, (int)($pagination['page'] ?? $page));
$totalPages = max(1, (int)($pagination['totalPages'] ?? 1));
$totalCases = max(0, (int)($pagination['total'] ?? 0));

$selectedGuildName = 'Selected server';
foreach ($guilds as $g) {
    if (($g['id'] ?? '') === $guildId) {
        $selectedGuildName = $g['name'] ?? $selectedGuildName;
        break;
    }
}

$selectedCase = null;
if ($guildId && $selectedCaseId > 0) {
    $caseRaw = getAPI('/moderation/cases/' . urlencode((string)$selectedCaseId) . '?guildId=' . urlencode($guildId), 20);
    $selectedCase = $caseRaw['data']['case'] ?? null;
    if (!$selectedCase && !$message) {
        $messageType = 'error';
        $message = 'Case details could not be loaded. The case may not exist on this server.';
    }
}

$caseCounts = ['warn' => 0, 'timeout' => 0, 'kick' => 0, 'ban' => 0, 'resolved' => 0, 'open' => 0];
foreach ($cases as $case) {
    $type = $case['type'] ?? 'note';
    if (!isset($caseCounts[$type])) $caseCounts[$type] = 0;
    $caseCounts[$type]++;
    $statusKey = moderationStatusLabel($case);
    if (!isset($caseCounts[$statusKey])) $caseCounts[$statusKey] = 0;
    $caseCounts[$statusKey]++;
}

function moderationFilterQuery($guildId, $page, $typeFilter, $userIdFilter, $moderatorIdFilter, $statusFilter, $reasonFilter, $selectedCaseId = 0, $limit = 25) {
    $params = ['guildId' => $guildId, 'page' => $page, 'limit' => $limit];
    if ($typeFilter !== '') $params['type'] = $typeFilter;
    if ($userIdFilter !== '') $params['userId'] = $userIdFilter;
    if ($moderatorIdFilter !== '') $params['moderatorId'] = $moderatorIdFilter;
    if ($statusFilter !== '') $params['status'] = $statusFilter;
    if ($reasonFilter !== '') $params['reason'] = $reasonFilter;
    if ($selectedCaseId > 0) $params['caseId'] = $selectedCaseId;
    return '?' . http_build_query($params);
}
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.mod-hero { display:grid; grid-template-columns:minmax(0,1fr) minmax(280px,360px); gap:1rem; align-items:stretch; margin-bottom:1rem; }
.mod-hero-main { border:1px solid rgba(242,63,67,.28); border-radius:18px; padding:1.25rem; background:linear-gradient(135deg,rgba(242,63,67,.12),rgba(23,27,35,.96)); display:grid; gap:1rem; }
.mod-hero-main h1 { margin:0 0 .25rem; font-size:1.8rem; }
.mod-hero-main p { margin:0; color:var(--text-secondary); max-width:680px; }
.mod-hero-side { border:1px solid var(--border-light); border-radius:18px; padding:1rem; background:var(--panel); display:grid; gap:.75rem; }
.mod-select { display:grid; gap:.35rem; color:var(--text-secondary); font-size:.76rem; font-weight:900; text-transform:uppercase; letter-spacing:.05em; }
.mod-select select { width:100%; padding:.75rem .85rem; border-radius:12px; border:1px solid var(--border-light); background:var(--bg-tertiary); color:var(--text-primary); }
.mod-stats { display:grid; grid-template-columns:repeat(4,minmax(110px,1fr)); gap:.7rem; }
.mod-stat { border:1px solid rgba(52,61,77,.78); background:rgba(32,38,49,.72); border-radius:14px; padding:.8rem; }
.mod-stat strong { display:block; font-size:1.25rem; }
.mod-stat span { color:var(--text-secondary); font-size:.74rem; font-weight:900; text-transform:uppercase; letter-spacing:.05em; }
.mod-grid { display:grid; grid-template-columns:minmax(320px,.8fr) minmax(0,1.2fr); gap:1rem; align-items:start; }
.mod-panel { border:1px solid var(--border-light); border-radius:18px; background:var(--panel); padding:1rem; }
.mod-panel h2 { margin:0 0 .25rem; font-size:1.05rem; }
.mod-panel > p { color:var(--text-secondary); margin:0 0 1rem; font-size:.9rem; }
.mod-form { display:grid; gap:.85rem; }
.mod-form label { display:grid; gap:.35rem; color:var(--text-secondary); font-size:.78rem; font-weight:800; text-transform:uppercase; letter-spacing:.06em; }
.mod-form input, .mod-form select, .mod-form textarea {
    width:100%; padding:.72rem .78rem; border-radius:9px; border:1px solid var(--border-light);
    background:var(--bg-tertiary); color:var(--text-primary); outline:none;
}
.mod-actions { display:grid; grid-template-columns:1fr 1fr; gap:.55rem; }
.mod-actions .danger { border-color:rgba(242,63,67,.35); color:#ff9b9d; }
.mod-actions .success { border-color:rgba(81,207,102,.35); color:#51cf66; }
.mod-case-type { display:inline-flex; padding:.2rem .5rem; border-radius:999px; font-size:.72rem; font-weight:900; text-transform:uppercase; }
.mod-case-type.warn { color:#ffd43b; background:rgba(255,212,59,.12); border:1px solid rgba(255,212,59,.35); }
.mod-case-type.note { color:#7c8ff5; background:rgba(102,126,234,.12); border:1px solid rgba(102,126,234,.35); }
.mod-case-type.timeout { color:#ff6b6b; background:rgba(255,107,107,.12); border:1px solid rgba(255,107,107,.35); }
.mod-case-type.untimeout { color:#51cf66; background:rgba(81,207,102,.12); border:1px solid rgba(81,207,102,.35); }
.mod-case-type.kick { color:#ff9b9d; background:rgba(255,107,107,.12); border:1px solid rgba(255,107,107,.35); }
.mod-case-type.ban { color:#ff9b9d; background:rgba(242,63,67,.16); border:1px solid rgba(242,63,67,.42); }
.mod-case-type.unban { color:#51cf66; background:rgba(81,207,102,.12); border:1px solid rgba(81,207,102,.35); }
.mod-case-type.automod { color:#7c83ff; background:rgba(124,131,255,.12); border:1px solid rgba(124,131,255,.35); }
.mod-case-status { display:inline-flex; padding:.2rem .5rem; border-radius:999px; font-size:.72rem; font-weight:900; text-transform:uppercase; }
.mod-case-status.open { color:#ffd43b; background:rgba(255,212,59,.12); border:1px solid rgba(255,212,59,.35); }
.mod-case-status.resolved { color:#51cf66; background:rgba(81,207,102,.12); border:1px solid rgba(81,207,102,.35); }
.alert { padding:12px 15px; border-radius:8px; border-left:4px solid; margin-bottom:1rem; }
.alert-success { background:rgba(81,207,102,.12); color:#51cf66; border-color:#51cf66; }
.alert-error { background:rgba(255,107,107,.12); color:#ff6b6b; border-color:#ff6b6b; }
.mod-history-top { display:flex; justify-content:space-between; align-items:end; gap:1rem; margin-bottom:.9rem; flex-wrap:wrap; }
.mod-filter { display:flex; gap:.5rem; flex-wrap:wrap; }
.mod-filter input { padding:.62rem .7rem; border-radius:10px; border:1px solid var(--border-light); background:var(--bg-tertiary); color:var(--text-primary); }
.mod-danger-zone { border:1px solid rgba(242,63,67,.28); border-radius:14px; padding:.85rem; background:rgba(242,63,67,.07); display:grid; gap:.75rem; }
.mod-note { background: rgba(88,101,242,0.1); border: 1px solid rgba(88,101,242,0.25); border-radius: 12px; padding: .85rem; color: var(--text-secondary); font-size: .86rem; line-height: 1.4; margin-bottom: 1rem; }
.mod-note a { color: var(--primary); font-weight: 800; text-decoration: none; }
.mod-pagination { display:flex; justify-content:space-between; align-items:center; gap:.5rem; margin-top:.85rem; flex-wrap:wrap; }
.mod-pager-actions { display:flex; gap:.45rem; flex-wrap:wrap; }
.mod-details { margin-top:1rem; }
.mod-kv { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.75rem; }
.mod-kv .mod-stat { background:rgba(32,38,49,.72); }
.mod-detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:1rem; }
.mod-detail-card { border:1px solid var(--border-light); border-radius:14px; padding:.9rem; background:rgba(20,24,31,.65); }
.mod-detail-card h3 { margin:.1rem 0 .65rem; font-size:.96rem; }
@media (max-width: 980px) { .mod-hero, .mod-grid { grid-template-columns:1fr; } .mod-stats { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width: 760px) { .mod-detail-grid, .mod-kv { grid-template-columns:1fr; } }
@media (max-width: 560px) { .mod-stats, .mod-actions { grid-template-columns:1fr; } }
</style>

<div class="mod-hero">
    <div class="mod-hero-main">
        <div>
            <h1>Moderation</h1>
            <p>Run staff actions, filter cases quickly and keep moderation history transparent for <?php echo esc($selectedGuildName); ?>.</p>
        </div>
        <div class="mod-stats">
            <div class="mod-stat"><strong><?php echo $totalCases; ?></strong><span>Total cases</span></div>
            <div class="mod-stat"><strong><?php echo (int)($caseCounts['warn'] ?? 0); ?></strong><span>Warns</span></div>
            <div class="mod-stat"><strong><?php echo (int)($caseCounts['timeout'] ?? 0); ?></strong><span>Timeouts</span></div>
            <div class="mod-stat"><strong><?php echo (int)($caseCounts['resolved'] ?? 0); ?></strong><span>Resolved on page</span></div>
        </div>
    </div>
    <div class="mod-hero-side">
        <form method="GET" class="mod-select">
            <label>Server</label>
            <select name="guildId" onchange="this.form.submit()">
                <?php foreach ($guilds as $g): ?>
                    <option value="<?php echo esc($g['id']); ?>" <?php echo $guildId === ($g['id'] ?? '') ? 'selected' : ''; ?>><?php echo esc($g['name']); ?></option>
                <?php endforeach; ?>
            </select>
        </form>
        <a class="btn-icon" href="<?php echo BASE_URL; ?>/pages/modules.php?guildId=<?php echo urlencode($guildId); ?>"><span class="i">▦</span> Modules</a>
        <a class="btn-icon" href="<?php echo BASE_URL; ?>/pages/logging.php?guildId=<?php echo urlencode($guildId); ?>"><span class="i">L</span> Logging</a>
    </div>
</div>

<?php if ($message): ?><div class="alert alert-<?php echo esc($messageType); ?>"><?php echo esc($message); ?></div><?php endif; ?>

<div class="mod-note">
    Moderation action logs are controlled centrally in <a href="<?php echo BASE_URL; ?>/pages/logging.php?guildId=<?php echo urlencode($guildId); ?>">Logging</a>. Enable the Moderation Actions event there.
</div>

<div class="mod-grid">
    <div class="mod-panel">
        <h2>Action</h2>
        <p>Apply a case to one Discord user ID. Keep reasons short and factual.</p>
        <form method="POST" class="mod-form">
            <input type="hidden" name="userIdFilter" value="<?php echo esc($userIdFilter); ?>">
            <input type="hidden" name="moderatorIdFilter" value="<?php echo esc($moderatorIdFilter); ?>">
            <input type="hidden" name="typeFilter" value="<?php echo esc($typeFilter); ?>">
            <input type="hidden" name="statusFilter" value="<?php echo esc($statusFilter); ?>">
            <input type="hidden" name="reasonFilter" value="<?php echo esc($reasonFilter); ?>">
            <input type="hidden" name="page" value="<?php echo (int)$currentPage; ?>">
            <label>User ID
                <input name="userIdAction" value="<?php echo esc($userIdFilter); ?>" placeholder="Discord User ID" required>
            </label>
            <label>Duration for timeout
                <select name="durationMinutes">
                    <option value="10">10 minutes</option>
                    <option value="60">1 hour</option>
                    <option value="360">6 hours</option>
                    <option value="1440">1 day</option>
                    <option value="10080">7 days</option>
                    <option value="40320">28 days</option>
                </select>
            </label>
            <label>Ban message cleanup
                <select name="deleteMessageSeconds">
                    <option value="0">Do not delete messages</option>
                    <option value="3600">Delete last hour</option>
                    <option value="86400">Delete last day</option>
                    <option value="604800">Delete last 7 days</option>
                </select>
            </label>
            <label>Reason / Note
                <textarea name="reasonAction" rows="4" placeholder="Short, factual reason."></textarea>
            </label>
            <div class="mod-actions">
                <button class="btn-icon" type="submit" name="action" value="warn"><span class="i">!</span> Warn</button>
                <button class="btn-icon" type="submit" name="action" value="note"><span class="i">N</span> Note</button>
                <button class="btn-icon danger" type="submit" name="action" value="timeout"><span class="i">T</span> Timeout</button>
                <button class="btn-icon success" type="submit" name="action" value="untimeout"><span class="i">✓</span> Clear</button>
            </div>
            <div class="mod-danger-zone">
                <p style="margin:0;color:var(--text-secondary);font-size:.88rem;">Kick and ban require Discord permissions and correct bot role order. Use Unban to lift an existing ban by user ID.</p>
                <div class="mod-actions">
                    <button class="btn-icon danger" type="submit" name="action" value="kick" onclick="return confirm('Kick this member?');"><span class="i">K</span> Kick</button>
                    <button class="btn-icon danger" type="submit" name="action" value="ban" onclick="return confirm('Ban this member?');"><span class="i">B</span> Ban</button>
                    <button class="btn-icon success" type="submit" name="action" value="unban" onclick="return confirm('Unban this user ID?');"><span class="i">✓</span> Unban</button>
                </div>
            </div>
        </form>
    </div>

    <div class="mod-panel">
        <div class="mod-history-top">
            <div>
                <h2>Case History</h2>
                <p>Use filters to quickly find the right case and open details for edits.</p>
            </div>
            <form method="GET" class="mod-filter">
                <input type="hidden" name="guildId" value="<?php echo esc($guildId); ?>">
                <input name="userId" value="<?php echo esc($userIdFilter); ?>" placeholder="User ID" style="width:140px;">
                <input name="moderatorId" value="<?php echo esc($moderatorIdFilter); ?>" placeholder="Moderator ID" style="width:140px;">
                <select name="type" style="padding:.62rem .7rem;border-radius:10px;border:1px solid var(--border-light);background:var(--bg-tertiary);color:var(--text-primary);">
                    <option value="">All types</option>
                    <?php foreach ($validTypes as $t): ?>
                    <option value="<?php echo $t; ?>" <?php echo $typeFilter === $t ? 'selected' : ''; ?>><?php echo ucfirst($t); ?></option>
                    <?php endforeach; ?>
                </select>
                <select name="status" style="padding:.62rem .7rem;border-radius:10px;border:1px solid var(--border-light);background:var(--bg-tertiary);color:var(--text-primary);">
                    <option value="">All status</option>
                    <option value="open" <?php echo $statusFilter === 'open' ? 'selected' : ''; ?>>Open</option>
                    <option value="resolved" <?php echo $statusFilter === 'resolved' ? 'selected' : ''; ?>>Resolved</option>
                </select>
                <input name="reason" value="<?php echo esc($reasonFilter); ?>" placeholder="Search reason" style="width:180px;">
                <button class="btn-icon" type="submit"><span class="i">⌕</span> Filter</button>
                <?php if ($userIdFilter || $moderatorIdFilter || $typeFilter || $statusFilter || $reasonFilter): ?><a class="btn-icon" href="?guildId=<?php echo urlencode($guildId); ?>">✕ Clear</a><?php endif; ?>
            </form>
        </div>
        <div class="table-scroll">
            <table class="table table-compact">
                <thead><tr><th>Case</th><th>Type</th><th>User</th><th>Moderator</th><th>Reason</th><th>Status</th><th>Time</th><th>Details</th></tr></thead>
                <tbody>
                <?php foreach ($cases as $case): ?>
                    <?php
                        $statusLabel = moderationStatusLabel($case);
                        $previewReason = trim((string)($case['reason'] ?? ''));
                        if (strlen($previewReason) > 80) $previewReason = substr($previewReason, 0, 77) . '...';
                    ?>
                    <tr>
                        <td>#<?php echo (int)($case['id'] ?? 0); ?></td>
                        <td><span class="mod-case-type <?php echo esc($case['type'] ?? 'note'); ?>"><?php echo esc($case['type'] ?? 'case'); ?></span></td>
                        <td><?php echo esc($case['displayName'] ?? $case['userId']); ?><br><code><?php echo esc($case['userId']); ?></code></td>
                        <td><?php echo esc($case['moderatorName'] ?? 'dashboard'); ?><br><code><?php echo esc($case['moderatorId'] ?? 'dashboard'); ?></code></td>
                        <td>
                            <?php echo esc($previewReason !== '' ? $previewReason : 'No reason provided'); ?>
                            <?php if (!empty($case['durationMs'])): ?><br><small style="color:#777;">Duration: <?php echo esc(prettyMs($case['durationMs'])); ?></small><?php endif; ?>
                        </td>
                        <td><span class="mod-case-status <?php echo esc($statusLabel); ?>"><?php echo esc($statusLabel); ?></span></td>
                        <td><?php echo !empty($case['createdAt']) ? date('d.m H:i', (int)floor($case['createdAt'] / 1000)) : '—'; ?></td>
                        <td>
                            <a class="btn-icon" href="<?php echo moderationFilterQuery($guildId, $currentPage, $typeFilter, $userIdFilter, $moderatorIdFilter, $statusFilter, $reasonFilter, (int)($case['id'] ?? 0), $limit); ?>">Open</a>
                        </td>
                    </tr>
                <?php endforeach; ?>
                <?php if (empty($cases)): ?><tr><td colspan="8" style="text-align:center;color:#999;">No moderation cases found for the current filters.</td></tr><?php endif; ?>
                </tbody>
            </table>
        </div>
        <div class="mod-pagination">
            <small style="color:var(--text-secondary);">Page <?php echo (int)$currentPage; ?> of <?php echo (int)$totalPages; ?> · <?php echo (int)$totalCases; ?> total</small>
            <div class="mod-pager-actions">
                <?php if ($currentPage > 1): ?>
                    <a class="btn-icon" href="<?php echo moderationFilterQuery($guildId, $currentPage - 1, $typeFilter, $userIdFilter, $moderatorIdFilter, $statusFilter, $reasonFilter, $selectedCaseId, $limit); ?>">← Previous</a>
                <?php endif; ?>
                <?php if ($currentPage < $totalPages): ?>
                    <a class="btn-icon" href="<?php echo moderationFilterQuery($guildId, $currentPage + 1, $typeFilter, $userIdFilter, $moderatorIdFilter, $statusFilter, $reasonFilter, $selectedCaseId, $limit); ?>">Next →</a>
                <?php endif; ?>
            </div>
        </div>
    </div>
</div>

<div class="mod-panel mod-details">
    <h2>Case Details</h2>
    <p>Open a case from the table to inspect details, update reason text, or mark it as resolved.</p>

    <?php if (!$selectedCase): ?>
        <p style="color:var(--text-secondary);margin:.25rem 0 0;">No case selected yet. Use the Open button in the case table.</p>
    <?php else: ?>
        <?php $selectedStatus = moderationStatusLabel($selectedCase); ?>
        <div class="mod-kv" style="margin-bottom:.9rem;">
            <div class="mod-stat"><span>Case ID</span><strong>#<?php echo (int)($selectedCase['id'] ?? 0); ?></strong></div>
            <div class="mod-stat"><span>Type</span><strong><?php echo esc($selectedCase['type'] ?? 'unknown'); ?></strong></div>
            <div class="mod-stat"><span>Status</span><strong><?php echo esc($selectedStatus); ?></strong></div>
            <div class="mod-stat"><span>User</span><strong><?php echo esc($selectedCase['displayName'] ?? $selectedCase['userId']); ?></strong><small><code><?php echo esc($selectedCase['userId'] ?? ''); ?></code></small></div>
            <div class="mod-stat"><span>Moderator</span><strong><?php echo esc($selectedCase['moderatorName'] ?? 'dashboard'); ?></strong><small><code><?php echo esc($selectedCase['moderatorId'] ?? 'dashboard'); ?></code></small></div>
            <div class="mod-stat"><span>Guild</span><strong><?php echo esc($selectedCase['guildName'] ?? $selectedCase['guildId']); ?></strong><small><code><?php echo esc($selectedCase['guildId'] ?? ''); ?></code></small></div>
            <div class="mod-stat"><span>Created</span><strong><?php echo !empty($selectedCase['createdAt']) ? date('d.m.Y H:i:s', (int)floor($selectedCase['createdAt'] / 1000)) : '—'; ?></strong></div>
            <div class="mod-stat"><span>Updated</span><strong><?php echo !empty($selectedCase['updatedAt']) ? date('d.m.Y H:i:s', (int)floor($selectedCase['updatedAt'] / 1000)) : '—'; ?></strong></div>
            <div class="mod-stat"><span>Duration</span><strong><?php echo !empty($selectedCase['durationMs']) ? esc(prettyMs($selectedCase['durationMs'])) : '—'; ?></strong></div>
        </div>

        <div class="mod-detail-grid">
            <div class="mod-detail-card">
                <h3>Edit Reason</h3>
                <form method="POST" class="mod-form">
                    <input type="hidden" name="action" value="update_case_reason">
                    <input type="hidden" name="caseId" value="<?php echo (int)($selectedCase['id'] ?? 0); ?>">
                    <input type="hidden" name="userIdFilter" value="<?php echo esc($userIdFilter); ?>">
                    <input type="hidden" name="moderatorIdFilter" value="<?php echo esc($moderatorIdFilter); ?>">
                    <input type="hidden" name="typeFilter" value="<?php echo esc($typeFilter); ?>">
                    <input type="hidden" name="statusFilter" value="<?php echo esc($statusFilter); ?>">
                    <input type="hidden" name="reasonFilter" value="<?php echo esc($reasonFilter); ?>">
                    <input type="hidden" name="page" value="<?php echo (int)$currentPage; ?>">
                    <label>Reason
                        <textarea name="caseReason" rows="6" maxlength="1000" required><?php echo esc($selectedCase['reason'] ?? ''); ?></textarea>
                    </label>
                    <button class="btn-icon" type="submit"><span class="i">✎</span> Save reason</button>
                </form>
            </div>

            <div class="mod-detail-card">
                <h3>Resolve / Reopen</h3>
                <form method="POST" class="mod-form">
                    <input type="hidden" name="action" value="update_case_status">
                    <input type="hidden" name="caseId" value="<?php echo (int)($selectedCase['id'] ?? 0); ?>">
                    <input type="hidden" name="userIdFilter" value="<?php echo esc($userIdFilter); ?>">
                    <input type="hidden" name="moderatorIdFilter" value="<?php echo esc($moderatorIdFilter); ?>">
                    <input type="hidden" name="typeFilter" value="<?php echo esc($typeFilter); ?>">
                    <input type="hidden" name="statusFilter" value="<?php echo esc($statusFilter); ?>">
                    <input type="hidden" name="reasonFilter" value="<?php echo esc($reasonFilter); ?>">
                    <input type="hidden" name="page" value="<?php echo (int)$currentPage; ?>">
                    <label>Case status
                        <select name="caseStatus" required>
                            <option value="open" <?php echo $selectedStatus === 'open' ? 'selected' : ''; ?>>Open</option>
                            <option value="resolved" <?php echo $selectedStatus === 'resolved' ? 'selected' : ''; ?>>Resolved</option>
                        </select>
                    </label>
                    <button class="btn-icon success" type="submit"><span class="i">✓</span> Update status</button>
                    <p style="margin:0;color:var(--text-secondary);font-size:.82rem;">Use resolved for closed or completed cases. Use open if the case needs active follow-up.</p>
                </form>
            </div>
        </div>
    <?php endif; ?>
</div>

<?php include '../includes/footer.php'; ?>
