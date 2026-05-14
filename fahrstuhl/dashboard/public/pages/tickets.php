<?php
$page_title = 'Tickets';
require_once __DIR__ . '/../includes/config.php';
requireLogin();

function ticketsPageAccessCheck($guildId, $moduleKey = 'tickets') {
    $guildId = trim((string)$guildId);
    if ($guildId === '') return ['allowed' => false, 'reason' => 'missing_context'];
    if (isAdmin()) return ['allowed' => true, 'reason' => 'owner_admin_mode'];
    $response = getAPI('/guilds/' . urlencode($guildId) . '/dashboard-access?module=' . urlencode($moduleKey), 8);
    if (($response['success'] ?? false) === true) {
        return ['allowed' => !empty($response['data']['allowed']), 'reason' => $response['data']['reason'] ?? null];
    }
    if (isServerAdmin($guildId)) return ['allowed' => true, 'reason' => 'fallback_server_admin'];
    return ['allowed' => false, 'reason' => $response['error'] ?? 'access_check_failed'];
}

function ticketsPageAccessMessage($reason) {
    if ($reason === 'missing_module_role') return 'Dir fehlt eine freigegebene Dashboard-Rolle fuer dieses Modul.';
    if ($reason === 'admin_role_not_configured') return 'Es ist noch keine Dashboard-Admin-Rolle gesetzt.';
    if ($reason === 'not_guild_admin') return 'Du bist kein Server-Owner/Admin und hast keine freigegebene Dashboard-Rolle.';
    return 'Du hast aktuell keinen Zugriff auf Tickets.';
}

$guildsRaw = getAPI('/voice/guilds', 8);
$guilds = $guildsRaw['data']['guilds'] ?? [];
$guildId = dashboardSelectedGuildId($guilds);

$moduleAccess = $guildId ? ticketsPageAccessCheck($guildId, 'tickets') : ['allowed' => true];
if ($guildId && empty($moduleAccess['allowed'])) {
    $denyLabel = 'Tickets';
    $denyMessage = ticketsPageAccessMessage($moduleAccess['reason'] ?? '');
    include '../includes/header.php';
    include '../includes/sidebar.php';
    ?>
    <div class="empty-state" style="max-width:780px; margin:1rem auto; text-align:left;">
        <strong>Kein Zugriff auf <?= esc($denyLabel) ?></strong>
        <p><?= esc($denyMessage) ?></p>
        <p style="color:var(--text-secondary); font-size:.82rem;">Owner, Discord-Administratoren und die Dashboard-Admin-Rolle bleiben weiterhin erlaubt.</p>
        <a class="btn-icon cta btn-primary-ui" href="portal.php">Zurueck zum Portal</a>
    </div>
    <?php
    include '../includes/footer.php';
    return;
}

$message = '';
$messageType = 'success';
$operationSuccess = null;
$isAjaxRequest = strcasecmp($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '', 'XMLHttpRequest') === 0
    || stripos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') !== false;
$sendJson = function ($payload, $statusCode = 200) {
    http_response_code((int)$statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit();
};

function ticketTypePayloadFromPost() {
    $ticketTypes = [];
    $typeLabels = $_POST['typeLabels'] ?? [];
    $typeDescriptions = $_POST['typeDescriptions'] ?? [];
    $typePriorities = $_POST['typePriorities'] ?? [];
    for ($i = 0; $i < count($typeLabels); $i++) {
        $label = trim($typeLabels[$i] ?? '');
        if ($label === '') continue;
        $ticketTypes[] = [
            'label' => $label,
            'description' => trim($typeDescriptions[$i] ?? ''),
            'priority' => $typePriorities[$i] ?? 'normal',
        ];
    }
    return $ticketTypes;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $guildId) {
    $action = $_POST['action'] ?? 'save';
    if ($action === 'send_panel') {
        $result = api('/guilds/' . urlencode($guildId) . '/tickets/panel', 'POST', [
            'channelId' => $_POST['panelChannelId'] ?? '',
            'categoryId' => $_POST['categoryId'] ?? '',
            'staffRoleId' => $_POST['staffRoleId'] ?? '',
            'transcriptChannelId' => $_POST['transcriptChannelId'] ?? '',
            'defaultPriority' => $_POST['defaultPriority'] ?? 'normal',
            'closeDelaySeconds' => intval($_POST['closeDelaySeconds'] ?? 5),
            'slaMinutes' => intval($_POST['slaMinutes'] ?? 240),
            'enableClaiming' => isset($_POST['enableClaiming']),
            'requireCloseReason' => isset($_POST['requireCloseReason']),
            'enableTicketTypes' => isset($_POST['enableTicketTypes']),
            'ticketTypes' => ticketTypePayloadFromPost(),
            'panelTitle' => $_POST['panelTitle'] ?? '',
            'panelDescription' => $_POST['panelDescription'] ?? '',
            'panelButtonLabel' => $_POST['panelButtonLabel'] ?? '',
        ], 20);
        $panelSuccess = ($result['data']['success'] ?? false) === true;
        if ($panelSuccess) {
            $panelMessage = 'Panel gesendet!';
            $panelMessageType = 'success';
            $panelUrl = $result['data']['data']['url'] ?? null;
        } else {
            $panelMessageType = 'error';
            if (($result['data']['code'] ?? '') === 'LIMIT_REACHED') {
                $limit = $result['data']['limit'] ?? '?';
                $current = $result['data']['current'] ?? '?';
                $panelMessage = 'Limit erreicht: ' . $current . ' / ' . $limit . '. Upgrade fuer mehr Ticket-Panels.';
            } else {
                $panelMessage = $result['data']['message'] ?? 'Failed to send ticket panel.';
            }
        }
        if ($isAjaxRequest) {
            $sendJson([
                'success' => $panelSuccess,
                'message' => $panelMessage,
                'messageType' => $panelMessageType,
                'url' => $panelUrl ?? null,
                'data' => $result['data']['data'] ?? null,
            ], $panelSuccess ? 200 : 400);
        }
        // Non-AJAX fallback: set regular $message
        $message = $panelMessage;
        $messageType = $panelMessageType;
    } elseif ($action === 'test_ticket') {
        $result = api('/guilds/' . urlencode($guildId) . '/tickets/test', 'POST', [
            'reason' => $_POST['testTicketReason'] ?? '',
            'priority' => $_POST['defaultPriority'] ?? 'normal',
        ], 20);
        $operationSuccess = (($result['data']['success'] ?? false) === true);
        if ($operationSuccess) {
            $channelName = $result['data']['data']['channelName'] ?? 'ticket';
            $message = 'Test-Ticket erstellt: #' . $channelName;
        } else {
            $messageType = 'error';
            $message = $result['data']['message'] ?? 'Test-Ticket konnte nicht erstellt werden.';
        }

        if ($isAjaxRequest) {
            $sendJson([
                'success' => $operationSuccess === true,
                'message' => $message,
                'messageType' => $messageType,
                'data' => $result['data']['data'] ?? null,
            ], $operationSuccess === true ? 200 : 400);
        }
    } else {
        $payload = [
            'categoryId' => $_POST['categoryId'] ?? '',
            'staffRoleId' => $_POST['staffRoleId'] ?? '',
            'transcriptChannelId' => $_POST['transcriptChannelId'] ?? '',
            'panelTitle' => $_POST['panelTitle'] ?? '',
            'panelDescription' => $_POST['panelDescription'] ?? '',
            'panelButtonLabel' => $_POST['panelButtonLabel'] ?? '',
        ];
        $payload['defaultPriority'] = $_POST['defaultPriority'] ?? 'normal';
        $payload['closeDelaySeconds'] = intval($_POST['closeDelaySeconds'] ?? 5);
        $payload['slaMinutes'] = intval($_POST['slaMinutes'] ?? 240);
        $payload['enableClaiming'] = isset($_POST['enableClaiming']);
        $payload['requireCloseReason'] = isset($_POST['requireCloseReason']);
        $payload['enableTicketTypes'] = isset($_POST['enableTicketTypes']);
        $payload['ticketTypes'] = ticketTypePayloadFromPost();
        $result = api('/guilds/' . urlencode($guildId) . '/tickets', 'POST', $payload, 15);
        if (($result['data']['success'] ?? false) === true) {
            $message = 'Ticket settings saved.';
            $operationSuccess = true;
        } else {
            $messageType = 'error';
            $message = $result['data']['message'] ?? 'Failed to save ticket settings.';
            $operationSuccess = false;
        }

        if ($isAjaxRequest) {
            $sendJson([
                'success' => $operationSuccess === true,
                'message' => $message,
                'messageType' => $messageType,
            ], $operationSuccess === true ? 200 : 400);
        }
    }
}

$moduleRaw = $guildId ? getAPI('/guilds/' . urlencode($guildId) . '/modules', 10) : null;
$modules = $moduleRaw['data']['modules'] ?? [];
$ticketsEnabled = false;
foreach ($modules as $module) {
    if (($module['key'] ?? '') === 'tickets') {
        $ticketsEnabled = !empty($module['enabled']);
        break;
    }
}

$ticketsRaw = $guildId ? getAPI('/guilds/' . urlencode($guildId) . '/tickets', 10) : null;
$data = $ticketsRaw['data'] ?? [];
$settings = $data['settings'] ?? [];
$channels = $data['channels'] ?? [];
$roles = $data['roles'] ?? [];
$categories = $data['categories'] ?? [];
$openTickets = $data['openTickets'] ?? [];
$ticketStats = $data['ticketStats'] ?? [];
$recentTickets = $data['recentTickets'] ?? [];
$permissions = $data['permissions'] ?? [];
$guildName = $data['guildName'] ?? 'Selected server';
$priorityLabels = ['low' => 'Low', 'normal' => 'Normal', 'high' => 'High'];
$feedbackAvg = $ticketStats['feedbackAvg'] ?? null;
$feedbackLabel = $feedbackAvg === null ? '-' : number_format((float)$feedbackAvg, 1) . '/5';
$ticketTypes = $settings['ticketTypes'] ?? [
    ['label' => 'Support', 'description' => 'General help from the team.', 'priority' => 'normal'],
    ['label' => 'Report', 'description' => 'Report a member or incident.', 'priority' => 'high'],
    ['label' => 'Appeal', 'description' => 'Appeal a moderation action.', 'priority' => 'normal'],
];

$premRaw = $guildId ? getAPI('/guilds/' . urlencode($guildId) . '/premium', 5) : null;
$maxTicketPanels = (int)(($premRaw['data']['featureLimits']['ticketPanels'] ?? 1));
$ticketPanelCount = !empty($settings['panelMessageId']) ? 1 : 0;
$atTicketPanelLimit = $maxTicketPanels >= 0 && $ticketPanelCount >= $maxTicketPanels;

function formatTicketAge($minutes) {
    $minutes = (int)$minutes;
    if ($minutes < 60) return $minutes . 'm';
    $h = intdiv($minutes, 60);
    $m = $minutes % 60;
    return $m > 0 ? "{$h}h {$m}m" : "{$h}h";
}
$feedbackStars = $feedbackAvg !== null ? max(0, min(5, (int)round((float)$feedbackAvg))) : 0;
?>

<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
/* === TICKET SYSTEM === */
.tk-compact { display: grid; grid-template-columns: 320px 1fr 320px; gap: 1.25rem; align-items: start; }
.tk-card { background: var(--panel); border: 1px solid var(--border-light); border-radius: 12px; padding: 1rem; display: flex; flex-direction: column; gap: 0.8rem; }
.tk-card h2 { font-size: 1rem; margin: 0; display: flex; align-items: center; gap: 0.5rem; }
.tk-section-title { font-size: 0.8rem; font-weight: 800; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin: 0.5rem 0 0.2rem; }
.tk-field { display: grid; gap: 0.3rem; }
.tk-field label { font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); }
.tk-field select, .tk-field textarea, .tk-field input[type="text"] {
    width: 100%; padding: 0.6rem; border-radius: 6px; border: 1px solid var(--border-light);
    background: var(--bg-tertiary); color: var(--text-primary); font-size: 0.9rem;
}
.discord-preview { background: #2b2d31; border-radius: 8px; border-left: 4px solid #5865f2; padding: 1rem; font-family: 'gg sans', sans-serif; font-size: 0.95rem; }
.discord-title { font-weight: 600; font-size: 1.1rem; margin-bottom: 0.4rem; }
.discord-desc { color: #dbdee1; white-space: pre-line; margin-bottom: 1rem; }
.discord-btn { background: #5865f2; color: #fff; padding: 0.5rem 1rem; border-radius: 4px; font-size: 0.9rem; font-weight: 600; display: inline-flex; align-items: center; gap: 0.5rem; }

/* Stats */
.tk-metric-grid { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:.75rem; }
.tk-metric { background:rgba(32,38,49,.72); border:1px solid var(--border-light); border-radius:10px; padding:.85rem .9rem .7rem; position:relative; overflow:hidden; }
.tk-metric strong { display:block; font-size:1.5rem; font-weight:800; line-height:1.1; margin-bottom:.25rem; }
.tk-metric > span { color:var(--text-secondary); font-size:.72rem; text-transform:uppercase; font-weight:800; letter-spacing:.04em; }
.tk-metric-accent { position:absolute; bottom:0; left:0; right:0; height:3px; }
.tk-metric.accent-blue .tk-metric-accent { background:linear-gradient(90deg,#5865f2,#7289da); }
.tk-metric.accent-red .tk-metric-accent { background:linear-gradient(90deg,#ff6b6b,#ff9f43); }
.tk-metric.accent-orange .tk-metric-accent { background:linear-gradient(90deg,#ff9f43,#ffd43b); }
.tk-metric.accent-green .tk-metric-accent { background:linear-gradient(90deg,#51cf66,#94e07a); }
.tk-metric.accent-yellow .tk-metric-accent { background:linear-gradient(90deg,#ffd43b,#f0b232); }
.tk-metric-stars { display:flex; gap:.05rem; margin-top:.25rem; font-size:.85rem; line-height:1; }
.tk-metric-stars .s-filled { color:#ffd43b; }
.tk-metric-stars .s-empty { color:rgba(255,255,255,.15); }

/* Priority pills */
.tk-priority { font-size:.68rem; font-weight:900; text-transform:uppercase; padding:.14rem .4rem; border-radius:999px; border:1px solid; white-space:nowrap; flex-shrink:0; }
.tk-priority.low { color:#57f287; border-color:rgba(87,242,135,.35); background:rgba(87,242,135,.12); }
.tk-priority.normal { color:#f0b232; border-color:rgba(240,178,50,.35); background:rgba(240,178,50,.12); }
.tk-priority.high { color:#ff6b6b; border-color:rgba(255,107,107,.42); background:rgba(255,107,107,.14); }
.tk-priority.sla { color:#ff9f43; border-color:rgba(255,159,67,.42); background:rgba(255,159,67,.14); }

/* Kanban board */
.tk-board { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:.75rem; align-items:start; }
.tk-lane { border:1px solid var(--border-light); background:rgba(0,0,0,.12); border-radius:10px; padding:.7rem; display:grid; gap:.45rem; min-height:120px; }
.tk-lane-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:.15rem; }
.tk-lane-header h3 { margin:0; font-size:.78rem; font-weight:800; text-transform:uppercase; letter-spacing:.05em; color:var(--text-secondary); }
.tk-lane-count { font-size:.7rem; font-weight:800; padding:.1rem .42rem; border-radius:999px; background:rgba(255,255,255,.07); color:var(--text-secondary); }
.tk-lane[data-lane="open"] { border-color:rgba(88,101,242,.4); }
.tk-lane[data-lane="open"] .tk-lane-header h3 { color:#7289da; }
.tk-lane[data-lane="waiting_user"] { border-color:rgba(240,178,50,.4); }
.tk-lane[data-lane="waiting_user"] .tk-lane-header h3 { color:#f0b232; }
.tk-lane[data-lane="waiting_staff"] { border-color:rgba(255,159,67,.4); }
.tk-lane[data-lane="waiting_staff"] .tk-lane-header h3 { color:#ff9f43; }
.tk-lane[data-lane="resolved"] { border-color:rgba(87,242,135,.35); }
.tk-lane[data-lane="resolved"] .tk-lane-header h3 { color:#57f287; }

/* Kanban cards */
.tk-board-card { background:rgba(255,255,255,.035); border:1px solid var(--border-light); border-radius:8px; padding:.6rem .7rem; display:flex; flex-direction:column; gap:.3rem; transition:border-color .15s,background .15s; }
.tk-board-card:hover { background:rgba(255,255,255,.055); border-color:rgba(88,101,242,.45); }
.tk-board-card.sla-breach { border-color:rgba(255,107,107,.45); }
.tk-board-card.sla-breach:hover { border-color:rgba(255,107,107,.7); }
.tk-card-top { display:flex; align-items:flex-start; justify-content:space-between; gap:.4rem; }
.tk-card-name { font-size:.82rem; font-weight:700; color:var(--text-primary); line-height:1.3; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.tk-card-owner { font-size:.73rem; color:var(--text-secondary); }
.tk-card-meta { display:flex; align-items:center; gap:.35rem; flex-wrap:wrap; }
.tk-card-type { font-size:.67rem; font-weight:700; color:var(--text-secondary); background:rgba(255,255,255,.07); padding:.1rem .38rem; border-radius:4px; }
.tk-claimed-badge { font-size:.67rem; font-weight:700; color:#57f287; background:rgba(87,242,135,.1); border:1px solid rgba(87,242,135,.28); padding:.1rem .38rem; border-radius:999px; }
.tk-card-footer { display:flex; align-items:center; gap:.4rem; flex-wrap:wrap; margin-top:.05rem; }
.tk-card-age { font-size:.7rem; color:var(--text-secondary); display:flex; align-items:center; gap:.3rem; }
.tk-card-age.is-overdue { color:#ff9f43; font-weight:700; }

/* Ticket type cards */
.tk-type-card { background:rgba(255,255,255,.04); border:1px solid var(--border-light); border-radius:8px; padding:.55rem .65rem; display:grid; gap:.38rem; }
.tk-type-card-top { display:grid; grid-template-columns:1fr 88px 26px; gap:.4rem; align-items:center; }
.tk-type-card-top input[type="text"] { font-size:.85rem; padding:.38rem .55rem; border-radius:5px; border:1px solid var(--border-light); background:var(--bg-tertiary); color:var(--text-primary); width:100%; }
.tk-type-card-top select { font-size:.78rem; padding:.38rem .4rem; border-radius:5px; border:1px solid var(--border-light); background:var(--bg-tertiary); color:var(--text-primary); }
.tk-type-card-desc input[type="text"] { font-size:.78rem; padding:.35rem .55rem; border-radius:5px; border:1px solid var(--border-light); background:var(--bg-tertiary); color:var(--text-secondary); width:100%; }
.tk-type-remove { background:rgba(255,107,107,.1); border:1px solid rgba(255,107,107,.28); color:#ff6b6b; border-radius:5px; padding:0; width:26px; height:26px; cursor:pointer; font-size:1rem; line-height:1; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:background .12s; }
.tk-type-remove:hover { background:rgba(255,107,107,.22); }

/* Archive */
.tk-archive-search { margin-bottom:.55rem; }
.tk-archive-search input { width:100%; padding:.55rem .8rem; border-radius:8px; border:1px solid var(--border-light); background:var(--bg-tertiary); color:var(--text-primary); font-size:.85rem; transition:border-color .15s; }
.tk-archive-search input:focus { outline:none; border-color:rgba(88,101,242,.5); }
.tk-archive-list { display:grid; gap:.5rem; max-height:320px; overflow:auto; }
.tk-archive-row { display:flex; align-items:flex-start; justify-content:space-between; gap:.75rem; border:1px solid var(--border-light); background:rgba(0,0,0,.14); border-radius:8px; padding:.65rem .75rem; transition:border-color .12s; }
.tk-archive-row:hover { border-color:rgba(88,101,242,.35); }
.tk-archive-row[hidden] { display:none; }
.tk-archive-left { flex:1; display:grid; gap:.18rem; min-width:0; }
.tk-archive-title { display:flex; align-items:center; gap:.4rem; flex-wrap:wrap; }
.tk-archive-type { font-size:.82rem; font-weight:700; color:var(--text-primary); }
.tk-archive-status { font-size:.67rem; font-weight:800; text-transform:uppercase; padding:.1rem .38rem; border-radius:4px; background:rgba(255,255,255,.07); color:var(--text-secondary); }
.tk-archive-status.closed { background:rgba(87,242,135,.1); color:#57f287; }
.tk-archive-status.open { background:rgba(88,101,242,.1); color:#7289da; }
.tk-archive-owner { font-size:.75rem; color:var(--text-secondary); }
.tk-archive-close-reason { font-size:.73rem; color:var(--text-secondary); font-style:italic; }
.tk-archive-footer { display:flex; gap:.55rem; font-size:.7rem; color:var(--text-secondary); flex-wrap:wrap; margin-top:.1rem; }

/* Legacy */
.tk-ticket-list { display:grid; gap:.55rem; max-height:260px; overflow:auto; }
.tk-ticket-row { display:grid; grid-template-columns:1fr auto; gap:.5rem; border:1px solid var(--border-light); background:rgba(0,0,0,.16); border-radius:8px; padding:.65rem; }

#ticketsForm > .tk-card:nth-of-type(1) { order: 2; }
#ticketsForm > .tk-card:nth-of-type(2) { order: 1; }
#ticketsForm > .tk-card:nth-of-type(3) { order: 3; }

@media (max-width: 1100px) { .tk-compact { grid-template-columns: 1fr 1fr; } }
@media (max-width: 900px) { .tk-metric-grid { grid-template-columns:repeat(3,minmax(0,1fr)); } }
@media (max-width: 800px) { .tk-compact { grid-template-columns: 1fr; } .tk-board { grid-template-columns: 1fr 1fr; } }
@media (max-width: 520px) { .tk-board { grid-template-columns: 1fr; } .tk-metric-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }

.alert { padding: 10px; border-radius: 6px; font-size: 0.85rem; margin-bottom: 0.8rem; border-left: 4px solid; }
.alert-success { background: rgba(81,207,102,.1); color: #51cf66; border-color: #51cf66; }
.alert-error { background: rgba(255,107,107,.1); color: #ff6b6b; border-color: #ff6b6b; }
.tk-note { background: rgba(88,101,242,0.1); border: 1px solid rgba(88,101,242,0.25); border-radius: 8px; padding: 0.75rem; color: var(--text-secondary); font-size: 0.8rem; line-height: 1.35; }
.tk-note a { color: var(--primary); font-weight: 800; text-decoration: none; }
.tk-test-result { display:none; padding:0.75rem; border-radius:8px; border:1px solid var(--border-light); background:rgba(0,0,0,.16); font-size:0.8rem; color:var(--text-secondary); line-height:1.45; }
.tk-test-result.success { display:block; border-color:rgba(81,207,102,.35); color:#b2f2bb; }
.tk-test-result.error { display:block; border-color:rgba(255,107,107,.45); color:#ffb4b4; }
.tk-test-result.info { display:block; border-color:rgba(88,101,242,.4); color:#c7d2fe; }
</style>

<div class="module-page">

<section class="dashboard-page-header">
    <div class="dashboard-page-copy">
        <span class="dashboard-page-eyebrow">Support Module</span>
        <h1>Tickets</h1>
        <p>Panel, Routing und Team-Workflow im einheitlichen Dashboard-Layout.</p>
        <div class="dashboard-page-meta">
            <span class="status-badge <?php echo $ticketsEnabled ? 'active' : 'inactive'; ?>"><?php echo $ticketsEnabled ? 'Aktiv' : 'Inaktiv'; ?></span>
        </div>
    </div>
    <div class="module-header-actions">
        <form method="GET">
            <select class="module-header-select" name="guildId" onchange="this.form.submit()">
                <?php foreach ($guilds as $g): ?>
                    <option value="<?php echo esc($g['id']); ?>" <?php echo $guildId === ($g['id'] ?? '') ? 'selected' : ''; ?>><?php echo esc($g['name']); ?></option>
                <?php endforeach; ?>
            </select>
        </form>
    </div>
</section>

<?php if ($message): ?><div class="alert alert-<?php echo esc($messageType); ?>"><?php echo esc($message); ?></div><?php endif; ?>

<?php if (!$ticketsEnabled): ?>
    <div class="empty-state">
        <strong>Ticket-Modul ist deaktiviert</strong>
        <p>Aktiviere das Modul und starte danach mit Panel, Routing und Staff-Workflow.</p>
        <a class="btn-icon cta btn-primary-ui" href="modules.php?guildId=<?php echo urlencode($guildId); ?>">Modul aktivieren</a>
    </div>
<?php else: ?>
    <form method="POST" class="tk-compact" id="ticketsForm">
        <input type="hidden" name="guildId" value="<?php echo esc($guildId); ?>">
        <input type="hidden" name="action" value="save">
        
        <!-- COLUMN 1: SETUP -->
        <div class="tk-card">
            <h2><span class="i">⚙️</span> Technical Setup</h2>
            <div class="tk-note">
                Ticket activity logs are controlled centrally in <a href="logging.php?guildId=<?php echo urlencode($guildId); ?>">Logging</a>. The transcript channel is only for ticket archive files.
            </div>
            
            <div class="tk-field">
                <label>Ticket Category</label>
                <select name="categoryId">
                    <option value="">- Create new category -</option>
                    <?php foreach ($categories as $cat): ?>
                        <option value="<?php echo esc($cat['id']); ?>" <?php echo ($settings['categoryId'] ?? '') === $cat['id'] ? 'selected' : ''; ?>>
                            <?php echo esc($cat['name']); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </div>

            <div class="tk-field">
                <label>Staff Role</label>
                <select name="staffRoleId">
                    <option value="">- No staff role -</option>
                    <?php foreach ($roles as $role): ?>
                        <option value="<?php echo esc($role['id']); ?>" <?php echo ($settings['staffRoleId'] ?? '') === $role['id'] ? 'selected' : ''; ?>>
                            <?php echo esc($role['name']); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
                <small>Role that can see and manage all tickets.</small>
            </div>

            <div class="tk-field">
                <label>High Team Role <small style="font-weight:400; text-transform:none; font-size:.7rem;">(optional)</small></label>
                <select name="highTeamRoleId">
                    <option value="">- No high team role -</option>
                    <?php foreach ($roles as $role): ?>
                        <option value="<?php echo esc($role['id']); ?>" <?php echo ($settings['highTeamRoleId'] ?? '') === $role['id'] ? 'selected' : ''; ?>>
                            <?php echo esc($role['name']); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
                <small>Senior staff with elevated access &mdash; can override staff actions.</small>
            </div>

            <div class="tk-field">
                <label>Transcript Channel</label>
                <select name="transcriptChannelId">
                    <option value="">- No transcripts -</option>
                    <?php foreach ($channels as $channel): ?>
                        <option value="<?php echo esc($channel['id']); ?>" <?php echo ($settings['transcriptChannelId'] ?? '') === $channel['id'] ? 'selected' : ''; ?>>
                            #<?php echo esc($channel['name']); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
                <small>Transcript archive files will be sent here upon closing.</small>
            </div>

            <div class="tk-field">
                <label>Default Priority</label>
                <select name="defaultPriority">
                    <?php foreach ($priorityLabels as $value => $label): ?>
                        <option value="<?php echo esc($value); ?>" <?php echo ($settings['defaultPriority'] ?? 'normal') === $value ? 'selected' : ''; ?>><?php echo esc($label); ?></option>
                    <?php endforeach; ?>
                </select>
            </div>

            <div class="tk-field">
                <label>Close Delay Seconds</label>
                <input type="text" name="closeDelaySeconds" value="<?php echo esc($settings['closeDelaySeconds'] ?? 5); ?>">
            </div>

            <div class="tk-field">
                <label>SLA Minutes</label>
                <input type="text" name="slaMinutes" value="<?php echo esc($settings['slaMinutes'] ?? 240); ?>">
                <small>Tickets older than this are marked as overdue. Use 0 to disable.</small>
            </div>

            <label style="display:flex; align-items:center; gap:.5rem; font-size:.85rem; color:var(--text-secondary);">
                <input type="checkbox" name="enableClaiming" <?php echo ($settings['enableClaiming'] ?? true) ? 'checked' : ''; ?>>
                Enable staff claim buttons
            </label>
            <label style="display:flex; align-items:center; gap:.5rem; font-size:.85rem; color:var(--text-secondary);">
                <input type="checkbox" name="requireCloseReason" <?php echo !empty($settings['requireCloseReason']) ? 'checked' : ''; ?>>
                Require close reason in staff workflow
            </label>

            <label style="display:flex; align-items:center; gap:.5rem; font-size:.85rem; color:var(--text-secondary);">
                <input type="checkbox" name="enableTicketTypes" <?php echo !empty($settings['enableTicketTypes']) ? 'checked' : ''; ?>>
                Use ticket type dropdown + intake form
            </label>

            <button type="submit" id="ticketsSaveBtn" class="btn-icon" style="margin-top:0.5rem; justify-content:center; background:var(--primary); color:#fff; border:none; padding:0.7rem;"><span class="i">💾</span> Save Settings</button>
        </div>

        <!-- COLUMN 2: PANEL CONFIG -->
        <div class="tk-card">
            <h2><span class="i">🎫</span> Panel Design</h2>
            
            <div class="tk-field">
                <label>Panel Title</label>
                <input type="text" name="panelTitle" id="tkTitle" value="<?php echo esc($settings['panelTitle'] ?? 'Need help?'); ?>">
            </div>

            <div class="tk-field">
                <label>Panel Description</label>
                <textarea name="panelDescription" id="tkDesc" style="min-height:100px;"><?php echo esc($settings['panelDescription'] ?? 'Open a private support ticket and the team will help you.'); ?></textarea>
            </div>

            <div class="tk-field">
                <label>Button Label</label>
                <input type="text" name="panelButtonLabel" id="tkBtn" value="<?php echo esc($settings['panelButtonLabel'] ?? 'Open Ticket'); ?>">
            </div>

            <div class="tk-section-title">Ticket Types</div>
            <div id="tkTypeContainer" style="display:grid; gap:.42rem;">
                <?php foreach ($ticketTypes as $type): ?>
                    <div class="tk-type-card">
                        <div class="tk-type-card-top">
                            <input type="text" name="typeLabels[]" value="<?php echo esc($type['label'] ?? ''); ?>" placeholder="Type label">
                            <select name="typePriorities[]">
                                <?php foreach ($priorityLabels as $value => $label): ?>
                                    <option value="<?php echo esc($value); ?>" <?php echo ($type['priority'] ?? 'normal') === $value ? 'selected' : ''; ?>><?php echo esc($label); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <button type="button" class="tk-type-remove" title="Entfernen">&times;</button>
                        </div>
                        <div class="tk-type-card-desc">
                            <input type="text" name="typeDescriptions[]" value="<?php echo esc($type['description'] ?? ''); ?>" placeholder="Short description (optional)">
                        </div>
                    </div>
                <?php endforeach; ?>
            </div>
            <button type="button" id="tkAddType" class="btn-icon" style="font-size:.8rem; padding:.4rem .75rem; background:rgba(88,101,242,.12); border-color:rgba(88,101,242,.3); color:#c7d2fe; margin-top:.2rem;"><span class="i">+</span> Type hinzufügen</button>
            <small style="color:var(--text-secondary); font-size:.72rem;">Max. 5 Types. Leere Labels werden ignoriert.</small>

            <div class="tk-section-title">Deployment</div>
            <div style="font-size:0.75rem; color:var(--text-secondary); display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.3rem;">
                <span><?php echo $ticketPanelCount; ?> / <?php echo $maxTicketPanels < 0 ? '∞' : $maxTicketPanels; ?> Ticket-Panels genutzt</span>
                <?php if ($atTicketPanelLimit): ?><span class="status-badge warning" style="font-size:0.68rem;">Limit erreicht</span><?php endif; ?>
            </div>
            <div class="tk-field">
                <label>Target Channel</label>
                <select name="panelChannelId">
                    <option value="">- Select channel -</option>
                    <?php foreach ($channels as $channel): ?>
                        <option value="<?php echo esc($channel['id']); ?>" <?php echo ($settings['panelChannelId'] ?? '') === $channel['id'] ? 'selected' : ''; ?>>#<?php echo esc($channel['name']); ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <?php if (!empty($settings['panelMessageId']) && !empty($settings['panelChannelId'])): ?>
            <div class="tk-note" style="background:rgba(87,242,135,.08); border-color:rgba(87,242,135,.25); color:#51cf66;">
                ✅ Panel aktiv in <strong>#<?php echo esc(array_column($channels, 'name', 'id')[$settings['panelChannelId']] ?? $settings['panelChannelId']); ?></strong> &mdash;
                <a href="https://discord.com/channels/<?php echo urlencode($guildId); ?>/<?php echo urlencode($settings['panelChannelId']); ?>/<?php echo urlencode($settings['panelMessageId']); ?>" target="_blank" style="color:#51cf66;">Zur Nachricht →</a>
                <br><small>Erneutes Senden bearbeitet das bestehende Panel.</small>
            </div>
            <?php else: ?>
            <div class="tk-note">
                ⚠️ Noch kein Panel gesendet. Wähle einen Kanal und klicke auf "Send Panel to Discord".
            </div>
            <?php endif; ?>
            <?php if ($atTicketPanelLimit && empty($settings['panelMessageId'])): ?>
            <div class="upgrade-limit-card">
                <div class="ulc-icon">🚫</div>
                <div class="ulc-body">
                    <div class="ulc-title">Ticket-Panel-Limit erreicht</div>
                    <div class="ulc-hint">💎 Premium ermöglicht bis zu 3 Panels, Pro unbegrenzt viele Ticket-Panels.</div>
                </div>
                <a href="server-plans.php<?php echo $guildId ? '?guildId=' . urlencode($guildId) : ''; ?>" class="ulc-cta">Jetzt upgraden</a>
            </div>
            <?php else: ?>
            <button type="button" id="tkSendPanelBtn" class="btn-icon" style="justify-content:center; background:#5865f2; color:#fff; border:none; padding:0.7rem;"><span class="i">🚀</span> Send Panel to Discord</button>
            <div id="tkPanelResult" class="tk-test-result" style="margin-top:0.5rem;"></div>
            <?php endif; ?>
        </div>

        <!-- COLUMN 3: PREVIEW -->
        <div class="tk-card">
            <h2><span class="i">👁️</span> Live Preview</h2>
            <div class="discord-preview">
                <div id="pTitle" class="discord-title"></div>
                <div id="pDesc" class="discord-desc"></div>
                <div class="discord-btn">📩 <span id="pBtn"></span></div>
            </div>

            <div class="tk-section-title">Instructions</div>
            <div style="font-size:0.75rem; color:var(--text-secondary); display:grid; gap:0.4rem;">
                <p>• <strong>Transcripts:</strong> Automatisch als .txt + .html gespeichert wenn ein Ticket geschlossen wird.</p>
                <p>• <strong>Permissions:</strong> Bot verwaltet Channel-Berechtigungen automatisch für den User und Staff.</p>
                <p>• <strong>Claim:</strong> Staff kann Tickets via Button <em>oder</em> <code>/ticket claim</code> beanspruchen.</p>
                <p>• <strong>Controls:</strong> Staff kann claimen, unclaimen, Priorität setzen, Status setzen und schließen.</p>
                <p>• <strong>Staff Ops:</strong> <code>/ticket note</code>, <code>/ticket adduser</code>, <code>/ticket removeuser</code> innerhalb des Ticket-Channels.</p>
            </div>

            <div class="tk-section-title">Live Test</div>
            <div class="tk-field">
                <label>Test Reason</label>
                <input type="text" id="tkTestReason" placeholder="z.B. Dashboard Test: Staff antwortet nicht.">
            </div>
            <button type="button" id="tkTestBtn" class="btn-icon" style="justify-content:center; background:rgba(88,101,242,.14); border-color:rgba(88,101,242,.4); color:#c7d2fe;"><span class="i">🧪</span> Test-Ticket erstellen</button>
            <div id="tkTestResult" class="tk-test-result"></div>
        </div>

        <div class="ux-savebar" id="ticketsSaveBar">
            <div class="ux-save-info">
                <strong>Ungespeicherte Aenderungen</strong>
                <span>Basis-Einstellungen werden ohne Reload gespeichert.</span>
            </div>
            <div class="ux-save-actions">
                <span class="ux-save-status" id="ticketsSaveStatus">Bereit</span>
                <button type="submit" name="action" value="save" id="ticketsStickySaveBtn" class="btn-icon btn-primary-ui"><span class="i">💾</span> Speichern</button>
            </div>
        </div>
    </form>

    <div class="tk-card" style="margin-top:1.25rem;">
        <h2><span class="i">📌</span> Live Ticket Desk</h2>
        <div class="tk-metric-grid">
            <div class="tk-metric accent-blue">
                <strong><?php echo (int)($ticketStats['open'] ?? count($openTickets)); ?></strong>
                <span>Open</span>
                <div class="tk-metric-accent"></div>
            </div>
            <div class="tk-metric accent-red">
                <strong><?php echo (int)($ticketStats['highOpen'] ?? count(array_filter($openTickets, fn($t) => ($t['priority'] ?? '') === 'high'))); ?></strong>
                <span>High Priority</span>
                <div class="tk-metric-accent"></div>
            </div>
            <div class="tk-metric accent-orange">
                <strong><?php echo (int)($ticketStats['overdueOpen'] ?? count(array_filter($openTickets, fn($t) => !empty($t['slaBreached'])))); ?></strong>
                <span>SLA Overdue</span>
                <div class="tk-metric-accent"></div>
            </div>
            <div class="tk-metric accent-green">
                <strong><?php echo (int)($ticketStats['closed'] ?? 0); ?></strong>
                <span>Closed Archive</span>
                <div class="tk-metric-accent"></div>
            </div>
            <div class="tk-metric accent-yellow">
                <strong><?php echo esc($feedbackLabel); ?></strong>
                <span>Feedback</span>
                <?php if ($feedbackStars > 0): ?>
                <div class="tk-metric-stars">
                    <?php for ($i = 1; $i <= 5; $i++): ?>
                        <span class="<?php echo $i <= $feedbackStars ? 's-filled' : 's-empty'; ?>">&#9733;</span>
                    <?php endfor; ?>
                </div>
                <?php endif; ?>
                <div class="tk-metric-accent"></div>
            </div>
        </div>
        <?php $lanes = ['open' => 'Open', 'waiting_user' => 'Waiting User', 'waiting_staff' => 'Waiting Staff', 'resolved' => 'Resolved']; ?>
        <div class="tk-board">
            <?php foreach ($lanes as $laneKey => $laneLabel):
                $laneTickets = array_values(array_filter($openTickets, fn($t) => ($t['status'] ?? 'open') === $laneKey)); ?>
                <div class="tk-lane" data-lane="<?php echo esc($laneKey); ?>">
                    <div class="tk-lane-header">
                        <h3><?php echo esc($laneLabel); ?></h3>
                        <span class="tk-lane-count"><?php echo count($laneTickets); ?></span>
                    </div>
                    <?php foreach ($laneTickets as $ticket): ?>
                        <div class="tk-board-card<?php echo !empty($ticket['slaBreached']) ? ' sla-breach' : ''; ?>">
                            <div class="tk-card-top">
                                <span class="tk-card-name">#<?php echo esc($ticket['name']); ?></span>
                                <span class="tk-priority <?php echo esc($ticket['priority'] ?? 'normal'); ?>"><?php echo esc($priorityLabels[$ticket['priority'] ?? 'normal'] ?? 'Normal'); ?></span>
                            </div>
                            <div class="tk-card-owner"><?php echo esc($ticket['ownerTag'] ?? $ticket['ownerId'] ?? 'Unknown'); ?></div>
                            <div class="tk-card-meta">
                                <span class="tk-card-type"><?php echo esc($ticket['type'] ?? 'Support'); ?></span>
                                <?php if (!empty($ticket['claimedBy'])): ?>
                                    <span class="tk-claimed-badge">claimed: <?php echo esc($ticket['claimedBy']); ?></span>
                                <?php endif; ?>
                            </div>
                            <div class="tk-card-footer">
                                <span class="tk-card-age<?php echo !empty($ticket['slaBreached']) ? ' is-overdue' : ''; ?>">
                                    <?php echo formatTicketAge((int)($ticket['ageMinutes'] ?? 0)); ?>
                                    <?php if (!empty($ticket['slaBreached'])): ?><span class="tk-priority sla">SLA!</span><?php endif; ?>
                                </span>
                            </div>
                        </div>
                    <?php endforeach; ?>
                    <?php if (empty($laneTickets)): ?>
                        <div style="color:var(--text-secondary); font-size:.75rem; text-align:center; padding:.4rem 0;">Leer</div>
                    <?php endif; ?>
                </div>
            <?php endforeach; ?>
        </div>
    </div>

    <div class="tk-card" style="margin-top:1.25rem;">
        <h2><span class="i">🗂️</span> Recent Ticket Archive</h2>
        <div class="tk-archive-search">
            <input type="text" id="tkArchiveSearch" placeholder="Suche nach Owner, Typ, Status, Schließgrund...">
        </div>
        <div class="tk-archive-list">
            <?php foreach ($recentTickets as $ticket):
                $searchData = strtolower(
                    ($ticket['ownerTag'] ?? $ticket['ownerId'] ?? '') . ' ' .
                    ($ticket['type'] ?? '') . ' ' .
                    ($ticket['status'] ?? '') . ' ' .
                    ($ticket['closeReason'] ?? '')
                );
            ?>
                <div class="tk-archive-row" data-search="<?php echo esc($searchData); ?>">
                    <div class="tk-archive-left">
                        <div class="tk-archive-title">
                            <span class="tk-archive-type"><?php echo esc($ticket['type'] ?? 'Support'); ?></span>
                            <span class="tk-archive-status <?php echo esc($ticket['status'] ?? 'open'); ?>"><?php echo esc($ticket['status'] ?? 'open'); ?></span>
                        </div>
                        <div class="tk-archive-owner"><?php echo esc($ticket['ownerTag'] ?? $ticket['ownerId'] ?? 'Unknown'); ?></div>
                        <?php if (!empty($ticket['closeReason'])): ?>
                            <div class="tk-archive-close-reason">&ldquo;<?php echo esc($ticket['closeReason']); ?>&rdquo;</div>
                        <?php endif; ?>
                        <div class="tk-archive-footer">
                            <?php if (!empty($ticket['noteCount'])): ?>
                                <span>&#128221; <?php echo (int)$ticket['noteCount']; ?> Notes</span>
                            <?php endif; ?>
                            <?php if (!empty($ticket['feedbackRating'])): ?>
                                <?php $r = (int)$ticket['feedbackRating']; ?>
                                <span><?php echo str_repeat('&#9733;', $r) . str_repeat('&#9734;', 5 - $r); ?> <?php echo $r; ?>/5</span>
                            <?php endif; ?>
                        </div>
                    </div>
                    <span class="tk-priority <?php echo esc($ticket['priority'] ?? 'normal'); ?>"><?php echo esc($priorityLabels[$ticket['priority'] ?? 'normal'] ?? 'Normal'); ?></span>
                </div>
            <?php endforeach; ?>
            <?php if (empty($recentTickets)): ?>
                <div style="color:var(--text-secondary); font-size:.9rem;">Archiv füllt sich wenn Tickets geöffnet oder geschlossen werden.</div>
            <?php endif; ?>
        </div>
    </div>

    <div class="tk-card">
        <h2>Ticket Analytics</h2>
        <div class="tk-metric-grid">
            <div class="tk-metric">
                <strong><?= $ticketStats['avgResolutionMinutes'] ?? 'N/A' ?></strong>
                <span>Avg Resolution (min)</span>
            </div>
            <div class="tk-metric">
                <strong><?= $ticketStats['resolvedCount'] ?? 0 ?></strong>
                <span>Resolved Tickets</span>
            </div>
            <div class="tk-metric">
                <strong><?= $ticketStats['feedback']['average'] ?? 'N/A' ?></strong>
                <span>Feedback Avg</span>
            </div>
            <div class="tk-metric">
                <strong><?= $ticketStats['feedback']['count'] ?? 0 ?></strong>
                <span>Feedback Count</span>
            </div>
            <div class="tk-metric">
                <strong><?= $ticketStats['claimed']['openClaimed'] ?? 0 ?></strong>
                <span>Open Claimed</span>
            </div>
        </div>
        <div class="tk-section-title">Top Claimers</div>
        <ul>
            <?php foreach ($ticketStats['claimed']['topClaimers'] ?? [] as $claimer): ?>
                <li><?= esc($claimer['claimedBy']) ?>: <?= $claimer['count'] ?></li>
            <?php endforeach; ?>
            <?php if (empty($ticketStats['claimed']['topClaimers'])): ?>
                <li>No claim data available</li>
            <?php endif; ?>
        </ul>
    </div>
<?php endif; ?>

</div>

<script>
function updatePreview() {
    document.getElementById('pTitle').textContent = document.getElementById('tkTitle').value;
    document.getElementById('pDesc').textContent = document.getElementById('tkDesc').value;
    document.getElementById('pBtn').textContent = document.getElementById('tkBtn').value;
}
document.querySelectorAll('input, textarea').forEach(el => {
    el.addEventListener('input', updatePreview);
});
document.addEventListener('DOMContentLoaded', updatePreview);

(function() {
    const form = document.getElementById('ticketsForm');
    const saveBtn = document.getElementById('ticketsSaveBtn');
    const stickySaveBtn = document.getElementById('ticketsStickySaveBtn');
    const saveBar = document.getElementById('ticketsSaveBar');
    const saveStatus = document.getElementById('ticketsSaveStatus');
    const testBtn = document.getElementById('tkTestBtn');
    const testReason = document.getElementById('tkTestReason');
    const testResult = document.getElementById('tkTestResult');
    const sendPanelBtn = document.getElementById('tkSendPanelBtn');
    const panelResult = document.getElementById('tkPanelResult');
    if (!form) return;

    let initialState = new URLSearchParams(new FormData(form)).toString();
    let allowUnload = false;

    function currentState() {
        const data = new FormData(form);
        data.set('action', 'save');
        return new URLSearchParams(data).toString();
    }

    function isDirty() {
        return currentState() !== initialState;
    }

    function syncSaveBar() {
        saveBar?.classList.toggle('is-visible', isDirty());
    }

    function setStatus(text, type = '') {
        if (!saveStatus) return;
        saveStatus.textContent = text;
        saveStatus.classList.remove('success', 'error');
        if (type) saveStatus.classList.add(type);
    }

    function setSaveButtonsLoading(loading) {
        [saveBtn, stickySaveBtn].forEach((btn) => {
            if (!btn) return;
            btn.disabled = loading;
            btn.innerHTML = loading ? '<span class="i">⏳</span> Speichert...' : '<span class="i">💾</span> Speichern';
        });
    }

    function setTestResult(message, type = 'info', data = null) {
        if (!testResult) return;
        const link = data?.channelId
            ? `<br>Erstellt in <strong>#${data.channelName || data.channelId}</strong>.`
            : '';
        testResult.className = `tk-test-result ${type}`;
        testResult.innerHTML = `${message}${link}`;
    }

    form.addEventListener('input', syncSaveBar);
    form.addEventListener('change', syncSaveBar);

    window.addEventListener('beforeunload', (event) => {
        if (allowUnload || !isDirty()) return;
        event.preventDefault();
        event.returnValue = '';
    });

    form.addEventListener('submit', async (event) => {
        const submitter = event.submitter;
        const action = submitter?.value || form.querySelector('input[name="action"]')?.value || 'save';

        if (action !== 'save') {
            // Non-save submit actions (e.g. guild selector change) — allow normal navigation
            allowUnload = true;
            return;
        }

        event.preventDefault();
        setSaveButtonsLoading(true);
        setStatus('Speichert...');

        try {
            const data = new FormData(form);
            data.set('action', 'save');
            const response = await fetch(window.location.href, {
                method: 'POST',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json'
                },
                body: data,
                credentials: 'same-origin'
            });
            const json = await response.json().catch(() => ({ success: false, message: 'Ungueltige Serverantwort.' }));
            if (!response.ok || !json.success) {
                throw new Error(json.message || 'Speichern fehlgeschlagen.');
            }

            initialState = currentState();
            allowUnload = false;
            syncSaveBar();
            setStatus('Gespeichert', 'success');
        } catch (error) {
            setStatus('Fehler', 'error');
            alert(error.message || 'Speichern fehlgeschlagen.');
        } finally {
            setSaveButtonsLoading(false);
        }
    });

    testBtn?.addEventListener('click', async () => {
        testBtn.disabled = true;
        testBtn.innerHTML = '<span class="i">⏳</span> Erstellt...';
        setTestResult('Erstelle Test-Ticket mit der aktuell gespeicherten Konfiguration...', 'info');

        try {
            const data = new FormData();
            data.set('guildId', '<?php echo esc($guildId); ?>');
            data.set('action', 'test_ticket');
            data.set('testTicketReason', testReason?.value?.trim() || 'Dashboard test ticket');
            data.set('defaultPriority', form.querySelector('[name="defaultPriority"]')?.value || 'normal');
            data.set('csrf_token', document.querySelector('input[name="csrf_token"]')?.value || '');
            const response = await fetch(window.location.href, {
                method: 'POST',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json'
                },
                body: data,
                credentials: 'same-origin'
            });
            const json = await response.json().catch(() => {
                console.error('[Dashboard] Non-JSON response (tickets test):', response.status, response.url);
                return { success: false, message: 'Ungueltige Serverantwort.' };
            });
            if (!response.ok || !json.success) {
                throw new Error(json.message || 'Test-Ticket fehlgeschlagen.');
            }
            setTestResult(json.message || 'Test-Ticket erstellt.', 'success', json.data);
        } catch (error) {
            setTestResult(error.message || 'Test-Ticket fehlgeschlagen.', 'error');
        } finally {
            testBtn.disabled = false;
            testBtn.innerHTML = '<span class="i">🧪</span> Test-Ticket erstellen';
        }
    });

    sendPanelBtn?.addEventListener('click', async () => {
        if (!panelResult) return;
        const channelId = form.querySelector('[name="panelChannelId"]')?.value || '';
        if (!channelId) {
            panelResult.className = 'tk-test-result error';
            panelResult.textContent = '⚠️ Bitte erst einen Ziel-Kanal auswählen.';
            return;
        }
        sendPanelBtn.disabled = true;
        sendPanelBtn.innerHTML = '<span class="i">⏳</span> Sendet...';
        panelResult.className = 'tk-test-result info';
        panelResult.textContent = 'Panel wird gesendet...';

        try {
            const data = new FormData(form);
            data.set('action', 'send_panel');
            const response = await fetch(window.location.href, {
                method: 'POST',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json'
                },
                body: data,
                credentials: 'same-origin'
            });
            const json = await response.json().catch(() => {
                console.error('[Dashboard] Non-JSON response (send_panel):', response.status, response.url);
                return { success: false, message: 'Ungültige Serverantwort.' };
            });
            if (!json.success) {
                throw new Error(json.message || 'Panel konnte nicht gesendet werden.');
            }
            panelResult.className = 'tk-test-result success';
            const link = json.url ? ` <a href="${json.url}" target="_blank" style="color:inherit;">→ Zur Nachricht</a>` : '';
            panelResult.innerHTML = `✅ Panel erfolgreich gesendet!${link}`;
        } catch (error) {
            panelResult.className = 'tk-test-result error';
            panelResult.textContent = '❌ ' + (error.message || 'Panel konnte nicht gesendet werden.');
        } finally {
            sendPanelBtn.disabled = false;
            sendPanelBtn.innerHTML = '<span class="i">🚀</span> Send Panel to Discord';
        }
    });
})();

// Dynamic ticket types
(function() {
    const container = document.getElementById('tkTypeContainer');
    const addBtn = document.getElementById('tkAddType');
    if (!container || !addBtn) return;

    function makeRow(label, description, priority) {
        const card = document.createElement('div');
        card.className = 'tk-type-card';

        const top = document.createElement('div');
        top.className = 'tk-type-card-top';

        const i1 = document.createElement('input');
        i1.type = 'text'; i1.name = 'typeLabels[]'; i1.value = label || ''; i1.placeholder = 'Type label';

        const sel = document.createElement('select');
        sel.name = 'typePriorities[]';
        [['low', 'Low'], ['normal', 'Normal'], ['high', 'High']].forEach(([v, l]) => {
            const o = document.createElement('option');
            o.value = v; o.textContent = l;
            if (v === (priority || 'normal')) o.selected = true;
            sel.appendChild(o);
        });

        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'tk-type-remove'; btn.title = 'Entfernen'; btn.textContent = '\u00d7';
        btn.addEventListener('click', () => {
            card.remove();
            document.getElementById('ticketsForm')?.dispatchEvent(new Event('input'));
        });

        top.append(i1, sel, btn);

        const desc = document.createElement('div');
        desc.className = 'tk-type-card-desc';
        const i2 = document.createElement('input');
        i2.type = 'text'; i2.name = 'typeDescriptions[]'; i2.value = description || ''; i2.placeholder = 'Short description (optional)';
        desc.appendChild(i2);

        card.append(top, desc);
        return card;
    }

    container.querySelectorAll('.tk-type-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.tk-type-card').remove();
            document.getElementById('ticketsForm')?.dispatchEvent(new Event('input'));
        });
    });

    addBtn.addEventListener('click', () => {
        if (container.querySelectorAll('.tk-type-card').length >= 5) {
            const orig = addBtn.innerHTML;
            addBtn.textContent = 'Max. 5 Types!';
            setTimeout(() => { addBtn.innerHTML = orig; }, 1500);
            return;
        }
        container.appendChild(makeRow());
        document.getElementById('ticketsForm')?.dispatchEvent(new Event('input'));
    });
})();

// Archive search filter
(function() {
    const input = document.getElementById('tkArchiveSearch');
    if (!input) return;
    input.addEventListener('input', () => {
        const q = input.value.toLowerCase().trim();
        document.querySelectorAll('.tk-archive-row').forEach(row => {
            row.hidden = q !== '' && !(row.dataset.search || '').includes(q);
        });
    });
})();
</script>

<?php include '../includes/footer.php'; ?>
