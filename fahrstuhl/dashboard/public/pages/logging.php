<?php
$page_title = 'Logging';
require_once __DIR__ . '/../includes/config.php';
requireLogin();

$guildsRaw = getAPI('/voice/guilds', 8);
$guilds = $guildsRaw['data']['guilds'] ?? [];
$guildId = dashboardSelectedGuildId($guilds);

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

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $guildId) {
    if (($_POST['action'] ?? '') === 'test_log') {
        $result = api('/guilds/' . urlencode($guildId) . '/logging/test', 'POST', [], 15);
        if (($result['data']['success'] ?? false) === true) {
            $message = 'Test log sent.';
            $operationSuccess = true;
        } else {
            $messageType = 'error';
            $message = $result['data']['message'] ?? $result['data']['error'] ?? 'Failed to send test log.';
            $operationSuccess = false;
        }
        if ($isAjaxRequest) $sendJson(['success' => $operationSuccess, 'message' => $message, 'messageType' => $messageType], $operationSuccess ? 200 : 400);
    } elseif (($_POST['action'] ?? '') === 'test_group') {
        $testGroup = trim($_POST['testGroup'] ?? '');
        $result = api('/guilds/' . urlencode($guildId) . '/logging/test', 'POST', [
            'group' => $testGroup,
        ], 15);
        if (($result['data']['success'] ?? false) === true) {
            $resolvedGroup = $result['data']['group'] ?? $testGroup;
            if ($resolvedGroup === '') $resolvedGroup = 'moderation';
            $message = 'Test log sent for group: ' . $resolvedGroup . '.';
            $operationSuccess = true;
        } else {
            $messageType = 'error';
            $message = $result['data']['message'] ?? $result['data']['error'] ?? 'Failed to send group test log.';
            $operationSuccess = false;
        }
        if ($isAjaxRequest) $sendJson(['success' => $operationSuccess, 'message' => $message, 'messageType' => $messageType], $operationSuccess ? 200 : 400);
    } else {
    $enabled = isset($_POST['enabled']);
    $channelId = $_POST['channelId'] ?? '';
    
    $events = [];
    foreach (['memberJoin', 'memberLeave', 'messageDelete', 'messageUpdate', 'memberBan', 'memberUnban', 'roleCreate', 'roleDelete', 'roleUpdate', 'channelCreate', 'channelDelete', 'channelUpdate', 'inviteCreate', 'inviteDelete', 'voiceState', 'moderation', 'automod', 'tickets'] as $eventKey) {
        if (isset($_POST['events'][$eventKey])) {
            $events[] = $eventKey;
        }
    }

    $eventChannels = [];
    foreach ($_POST['eventChannels'] ?? [] as $evKey => $chId) {
        $chId = trim($chId);
        if ($chId) $eventChannels[$evKey] = $chId;
    }

    $groupChannels = [];
    foreach ($_POST['groupChannels'] ?? [] as $groupKey => $chId) {
        $chId = trim($chId);
        if ($chId) $groupChannels[$groupKey] = $chId;
    }

    $result = api('/guilds/' . urlencode($guildId) . '/logging', 'POST', [
        'enabled' => $enabled,
        'channelId' => $channelId,
        'events' => $events,
        'eventChannels' => $eventChannels,
        'groupChannels' => $groupChannels,
    ], 15);
    if (($result['data']['success'] ?? false) === true) {
        $message = 'Logging settings saved.';
        $operationSuccess = true;
    } else {
        $messageType = 'error';
        $message = $result['data']['message'] ?? 'Failed to save logging settings.';
        $operationSuccess = false;
    }
    if ($isAjaxRequest) $sendJson(['success' => $operationSuccess, 'message' => $message, 'messageType' => $messageType], $operationSuccess ? 200 : 400);
    }
}

$moduleRaw = $guildId ? getAPI('/guilds/' . urlencode($guildId) . '/modules', 10) : null;
$modules = $moduleRaw['data']['modules'] ?? [];
$loggingModuleEnabled = false;
foreach ($modules as $module) {
    if (($module['key'] ?? '') === 'logging') {
        $loggingModuleEnabled = !empty($module['enabled']);
        break;
    }
}

$loggingRaw = $guildId ? getAPI('/guilds/' . urlencode($guildId) . '/logging', 10) : null;
$data = $loggingRaw['data'] ?? [];
$settings = $data['settings'] ?? [];
$channels = $data['channels'] ?? [];
$permissions = $data['permissions'] ?? [];
$eventDefinitions = $data['eventDefinitions'] ?? [];
$groupDefinitions = $data['groupDefinitions'] ?? [];
$guildName = $data['guildName'] ?? 'Selected server';
$eventChannels = $settings['eventChannels'] ?? [];
$groupChannels = $settings['groupChannels'] ?? [];
$channelNamesById = [];
foreach ($channels as $channel) {
    if (!empty($channel['id'])) $channelNamesById[$channel['id']] = $channel['name'] ?? $channel['id'];
}
?>

<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.lg-compact { display: grid; grid-template-columns: 320px 1fr 280px; gap: 1.25rem; align-items: start; }
.lg-card { background: var(--panel); border: 1px solid var(--border-light); border-radius: 12px; padding: 1rem; display: flex; flex-direction: column; gap: 0.8rem; }
.lg-card h2 { font-size: 1rem; margin: 0; display: flex; align-items: center; gap: 0.5rem; }
.lg-section-title { font-size: 0.8rem; font-weight: 800; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin: 0.5rem 0 0.2rem; }
.lg-field { display: grid; gap: 0.3rem; }
.lg-field label { font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); }
.lg-field select { 
    width: 100%; padding: 0.6rem; border-radius: 6px; border: 1px solid var(--border-light); 
    background: var(--bg-tertiary); color: var(--text-primary); font-size: 0.9rem;
}

.lg-event-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.6rem; }
.lg-event-item { 
    background: rgba(32,38,49,0.5); border: 1px solid var(--border-light); border-radius: 10px; 
    padding: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; transition: 0.2s;
}
.lg-event-item:hover { border-color: var(--primary); }
.lg-event-header { display: flex; align-items: flex-start; gap: 0.75rem; cursor: pointer; }
.lg-event-header input { margin-top: 0.25rem; flex-shrink: 0; }
.lg-event-info { display: flex; flex-direction: column; gap: 0.1rem; }
.lg-event-info strong { font-size: 0.85rem; color: #fff; }
.lg-event-info small { font-size: 0.75rem; color: var(--text-secondary); line-height: 1.2; }
.lg-event-channel { display: grid; gap: 0.2rem; }
.lg-event-channel label { font-size: 0.68rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; }
.lg-event-channel select { width: 100%; padding: 0.3rem 0.5rem; border-radius: 6px; border: 1px solid var(--border-light); background: var(--bg-tertiary); color: var(--text-primary); font-size: 0.78rem; }

@media (max-width: 1100px) { .lg-compact { grid-template-columns: 1fr 1fr; } }
@media (max-width: 800px) { .lg-compact { grid-template-columns: 1fr; } }

.alert { padding: 10px; border-radius: 6px; font-size: 0.85rem; margin-bottom: 0.8rem; border-left: 4px solid; }
.alert-success { background: rgba(81,207,102,.1); color: #51cf66; border-color: #51cf66; }
.alert-error { background: rgba(255,107,107,.1); color: #ff6b6b; border-color: #ff6b6b; }
</style>

<section class="dashboard-page-header">
    <div class="dashboard-page-copy">
        <span class="dashboard-page-eyebrow">Moderation Module</span>
        <h1>Logging</h1>
        <p>Zentrale, gruppenbasierte und event-spezifische Log-Kanaele in einem konsistenten Setup-Flow.</p>
        <div class="dashboard-page-meta">
            <span class="status-badge <?php echo $loggingModuleEnabled ? 'active' : 'inactive'; ?>"><?php echo $loggingModuleEnabled ? 'Aktiv' : 'Inaktiv'; ?></span>
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

<?php if (!$loggingModuleEnabled): ?>
    <div class="empty-state">
        <strong>Logging-Modul ist deaktiviert</strong>
        <p>Aktiviere das Modul und lege danach zentrale sowie gruppenbasierte Log-Channels fest.</p>
        <a class="btn-icon cta btn-primary-ui" href="modules.php?guildId=<?php echo urlencode($guildId); ?>">Modul aktivieren</a>
    </div>
<?php else: ?>
    <form id="loggingForm" method="POST" class="lg-compact">
        <input type="hidden" name="guildId" value="<?php echo esc($guildId); ?>">
        
        <!-- COLUMN 1: SETUP -->
        <div class="lg-card">
            <h2><span class="i">⚙️</span> Settings</h2>
            
            <label style="display:flex; align-items:center; gap:0.6rem; cursor:pointer; padding:0.5rem; background:rgba(255,255,255,0.05); border-radius:8px; border:1px solid var(--border-light);">
                <input type="checkbox" name="enabled" <?php echo !empty($settings['enabled']) ? 'checked' : ''; ?>>
                <span style="font-weight:700; font-size:0.9rem;">Enable Logging</span>
            </label>

            <div class="lg-field">
                <label>Log Channel</label>
                <select name="channelId">
                    <option value="">- Select channel -</option>
                    <?php foreach ($channels as $channel): ?>
                        <option value="<?php echo esc($channel['id']); ?>" <?php echo ($settings['channelId'] ?? '') === $channel['id'] ? 'selected' : ''; ?>>
                            #<?php echo esc($channel['name']); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
                <small style="font-size:0.75rem; color:var(--text-secondary);">Zentraler Fallback-Channel. Wenn kein Event-/Gruppenchannel gesetzt ist, wird dieser genutzt.</small>
            </div>

            <div class="lg-section-title">Event-Group Channels</div>
            <?php foreach ($groupDefinitions as $group): ?>
                <div class="lg-field">
                    <label><?php echo esc($group['label'] ?? ($group['key'] ?? 'Group')); ?></label>
                    <select name="groupChannels[<?php echo esc($group['key'] ?? ''); ?>]">
                        <option value="">— fallback to global —</option>
                        <?php foreach ($channels as $channel): ?>
                            <option value="<?php echo esc($channel['id']); ?>" <?php echo (($groupChannels[$group['key']] ?? '') === $channel['id']) ? 'selected' : ''; ?>>
                                #<?php echo esc($channel['name']); ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                    <small style="font-size:0.72rem; color:var(--text-secondary);"><?php echo esc($group['description'] ?? ''); ?></small>
                </div>
            <?php endforeach; ?>

            <div class="lg-section-title">Group Tests</div>
            <div style="display:grid; gap:0.45rem;">
                <?php foreach ($groupDefinitions as $group): ?>
                    <button type="submit" name="action" value="test_group" class="btn-icon" style="justify-content:space-between; background:var(--bg-tertiary); color:#fff; border:1px solid var(--border-light); padding:0.6rem 0.7rem;" onclick="document.getElementById('testGroupInput').value='<?php echo esc($group['key']); ?>'">
                        <span><span class="i">🧪</span> Test <?php echo esc($group['label'] ?? $group['key']); ?></span>
                        <span style="font-size:0.72rem; color:var(--text-secondary);">Send</span>
                    </button>
                <?php endforeach; ?>
            </div>

            <button type="submit" class="btn-icon" style="margin-top:0.5rem; justify-content:center; background:var(--primary); color:#fff; border:none; padding:0.7rem;"><span class="i">💾</span> Save Configuration</button>
            <button type="submit" name="action" value="test_log" class="btn-icon" style="justify-content:center; background:var(--bg-tertiary); color:#fff; border:1px solid var(--border-light); padding:0.7rem;"><span class="i">🧪</span> Send Test Log</button>
            <input type="hidden" name="testGroup" id="testGroupInput" value="moderation">
        </div>

        <!-- COLUMN 2: EVENTS -->
        <div class="lg-card">
            <h2><span class="i">🔔</span> Events to Log</h2>
            <div class="lg-event-grid">
                <?php foreach ($eventDefinitions as $event): 
                    $active = !empty(($settings['events'][$event['key']] ?? false));
                    $evChId = $eventChannels[$event['key']] ?? '';
                    $groupKey = $event['group'] ?? '';
                    $groupChId = $groupKey ? ($groupChannels[$groupKey] ?? '') : '';
                    $usesFallback = !$evChId;
                    $fallbackText = $groupChId
                        ? ('Group channel #' . ($channelNamesById[$groupChId] ?? $groupChId))
                        : (($settings['channelId'] ?? '') ? ('Global channel #' . ($channelNamesById[$settings['channelId']] ?? $settings['channelId'])) : 'No fallback configured');
                ?>
                    <div class="lg-event-item">
                        <label class="lg-event-header">
                            <input type="checkbox" name="events[<?php echo esc($event['key']); ?>]" value="1" <?php echo $active ? 'checked' : ''; ?>>
                            <div class="lg-event-info">
                                <strong><?php echo esc($event['label']); ?></strong>
                                <small><?php echo esc($event['description']); ?></small>
                            </div>
                        </label>
                        <div class="lg-event-channel">
                            <label>Override channel</label>
                            <select name="eventChannels[<?php echo esc($event['key']); ?>]">
                                <option value="">— use group/global fallback —</option>
                                <?php foreach ($channels as $channel): ?>
                                    <option value="<?php echo esc($channel['id']); ?>" <?php echo $evChId === $channel['id'] ? 'selected' : ''; ?>>
                                        #<?php echo esc($channel['name']); ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                            <small style="font-size:0.7rem; color:var(--text-secondary);">
                                <?php echo $usesFallback ? 'Fallback aktiv: ' . esc($fallbackText) : 'Event override aktiv'; ?>
                            </small>
                        </div>
                    </div>
                <?php endforeach; ?>
            </div>
        </div>

        <!-- COLUMN 3: PERMISSIONS -->
        <div class="lg-card">
            <h2><span class="i">🛡️</span> Permissions</h2>
            <div style="font-size:0.85rem; display:grid; gap:0.6rem;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span>View Channel</span>
                    <strong><?php echo !empty($permissions['viewChannel']) ? '✅' : '❌'; ?></strong>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span>Send Messages</span>
                    <strong><?php echo !empty($permissions['sendMessages']) ? '✅' : '❌'; ?></strong>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span>Embed Links</span>
                    <strong><?php echo !empty($permissions['embedLinks']) ? '✅' : '❌'; ?></strong>
                </div>
            </div>
            <div class="lg-section-title">Quick Tip</div>
            <p style="font-size:0.75rem; color:var(--text-secondary); line-height:1.4;">
                Ensure the bot has access to the log channel. If a permission is missing (❌), the bot won't be able to send any logs.
            </p>
        </div>
    </form>

    <?php
    // Recent log events from DB
    $eventsRaw = $guildId ? getAPI('/guilds/' . urlencode($guildId) . '/logging/events?limit=50', 10) : null;
    $recentEvents = $eventsRaw['data']['events'] ?? [];
    $groupStyles = [
        'memberJoin' => ['icon' => '👤', 'label' => 'Member Join'],
        'memberLeave' => ['icon' => '👤', 'label' => 'Member Leave'],
        'memberBan' => ['icon' => '🔨', 'label' => 'Ban'],
        'memberUnban' => ['icon' => '✅', 'label' => 'Unban'],
        'messageDelete' => ['icon' => '💬', 'label' => 'Message Delete'],
        'messageUpdate' => ['icon' => '💬', 'label' => 'Message Edit'],
        'moderation' => ['icon' => '🛡️', 'label' => 'Moderation'],
        'automod' => ['icon' => '🚨', 'label' => 'AutoMod'],
        'tickets' => ['icon' => '🎫', 'label' => 'Ticket'],
        'voiceState' => ['icon' => '🔊', 'label' => 'Voice'],
        'roleCreate' => ['icon' => '🧱', 'label' => 'Role Create'],
        'roleDelete' => ['icon' => '🧱', 'label' => 'Role Delete'],
        'roleUpdate' => ['icon' => '🧱', 'label' => 'Role Update'],
        'channelCreate' => ['icon' => '🧱', 'label' => 'Channel Create'],
        'channelDelete' => ['icon' => '🧱', 'label' => 'Channel Delete'],
        'channelUpdate' => ['icon' => '🧱', 'label' => 'Channel Update'],
        'inviteCreate' => ['icon' => '🔗', 'label' => 'Invite Create'],
        'inviteDelete' => ['icon' => '🔗', 'label' => 'Invite Delete'],
    ];
    ?>

    <div style="margin-top: 1.5rem;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
            <h2 style="font-size: 1rem; margin: 0; display: flex; align-items: center; gap: 0.5rem;">
                <span>📋</span> Recent Log Events
            </h2>
            <span style="font-size: 0.75rem; color: var(--text-secondary);">
                <?php echo count($recentEvents); ?> events · last 14 days
            </span>
        </div>

        <?php if (empty($recentEvents)): ?>
            <div class="empty-state" style="padding: 1.5rem;">
                <strong>Keine Events gefunden</strong>
                <p>Events werden hier angezeigt sobald der Bot das erste Log in Discord sendet.</p>
            </div>
        <?php else: ?>
            <div class="dashboard-table-wrap">
                <table class="dashboard-table">
                    <thead>
                        <tr>
                            <th style="width: 140px;">Zeit</th>
                            <th style="width: 140px;">Event</th>
                            <th>Titel</th>
                            <th>Beschreibung</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($recentEvents as $ev):
                            $evKey = $ev['event_key'] ?? '';
                            $icon = $groupStyles[$evKey]['icon'] ?? '📜';
                            $label = $groupStyles[$evKey]['label'] ?? $evKey;
                            $ts = (int)($ev['created_at'] ?? 0);
                            $timeStr = $ts > 0 ? date('d.m. H:i', intdiv($ts, 1000)) : '—';
                        ?>
                            <tr>
                                <td style="color: var(--text-secondary); font-size: 0.8rem; white-space: nowrap;"><?php echo esc($timeStr); ?></td>
                                <td>
                                    <span style="font-size: 0.82rem;"><?php echo $icon; ?> <?php echo esc($label); ?></span>
                                </td>
                                <td style="font-size: 0.85rem; font-weight: 600;"><?php echo esc($ev['title'] ?? '—'); ?></td>
                                <td style="font-size: 0.8rem; color: var(--text-secondary); max-width: 400px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    <?php echo esc($ev['description'] ?? ''); ?>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        <?php endif; ?>
    </div>

<?php endif; ?>

<script>
(function () {
    const form = document.getElementById('loggingForm');
    if (!form) return;

    let alertEl = document.querySelector('.alert');
    function showAlert(msg, type) {
        if (!alertEl) {
            alertEl = document.createElement('div');
            form.before(alertEl);
        }
        alertEl.className = 'alert alert-' + type;
        alertEl.textContent = msg;
        alertEl.style.display = '';
    }

    // Action buttons (test_log, test_group, save) all submit the same form
    // Intercept any submit and use AJAX
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submitBtn = event.submitter;
        if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = '0.6'; }

        try {
            const body = new FormData(form);
            // submitter value is not automatically included in FormData
            if (submitBtn?.name) body.set(submitBtn.name, submitBtn.value || '');

            const response = await fetch(window.location.href, {
                method: 'POST',
                headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' },
                body,
                credentials: 'same-origin'
            });
            const json = await response.json().catch(() => ({ success: false, message: 'Ungueltige Serverantwort.' }));
            showAlert(json.message || (json.success ? 'Gespeichert.' : 'Fehler.'), json.success ? 'success' : 'error');
        } catch (err) {
            showAlert(err.message || 'Netzwerkfehler.', 'error');
        } finally {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = ''; }
        }
    });
})();
</script>

<?php include '../includes/footer.php'; ?>
