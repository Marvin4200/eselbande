<?php
$page_title = 'Reaction Roles';
require_once __DIR__ . '/../includes/config.php';
requireLogin();

function reactionRolesPageAccessCheck($guildId, $moduleKey = 'reactionRoles') {
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

function reactionRolesPageAccessMessage($reason) {
    if ($reason === 'missing_module_role') return 'Dir fehlt eine freigegebene Dashboard-Rolle fuer dieses Modul.';
    if ($reason === 'admin_role_not_configured') return 'Es ist noch keine Dashboard-Admin-Rolle gesetzt.';
    if ($reason === 'not_guild_admin') return 'Du bist kein Server-Owner/Admin und hast keine freigegebene Dashboard-Rolle.';
    return 'Du hast aktuell keinen Zugriff auf Reaction Roles.';
}

$guildsRaw = getAPI('/voice/guilds', 8);
$guilds = $guildsRaw['data']['guilds'] ?? [];
$guildId = dashboardSelectedGuildId($guilds);
$panelId = trim($_GET['panelId'] ?? ($_POST['panelId'] ?? 'default'));

$moduleAccess = $guildId ? reactionRolesPageAccessCheck($guildId, 'reactionRoles') : ['allowed' => true];
if ($guildId && empty($moduleAccess['allowed'])) {
    $denyLabel = 'Reaction Roles';
    $denyMessage = reactionRolesPageAccessMessage($moduleAccess['reason'] ?? '');
    include '../includes/header.php';
    include '../includes/sidebar.php';
    ?>
    <div class="empty-state" style="max-width:780px; margin:1rem auto; text-align:left;">
        <strong>Kein Zugriff auf <?= esc($denyLabel) ?></strong>
        <p><?= esc($denyMessage) ?></p>
        <p style="color:var(--text-secondary); font-size:.82rem;">Mit passender Modul-Rolle kannst du Panels weiter verwalten, ohne globale Dashboard-Admin-Rechte zu brauchen.</p>
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

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $guildId) {
    $action = $_POST['action'] ?? 'save';
    if ($action === 'send') {
        $result = api('/guilds/' . urlencode($guildId) . '/reaction-roles/send', 'POST', [
            'panelId' => $_POST['panelId'] ?? 'default',
            'channelId' => $_POST['channelId'] ?? '',
        ], 20);
        if (($result['data']['success'] ?? false) === true) {
            $message = 'Reaction role panel sent.';
            $operationSuccess = true;
        } else {
            $messageType = 'error';
            $message = $result['data']['message'] ?? 'Sending reaction role panel failed.';
            $operationSuccess = false;
        }
        if ($isAjaxRequest) {
            $sendJson([
                'success' => $operationSuccess === true,
                'message' => $message,
                'messageType' => $messageType,
                'data' => $result['data']['data'] ?? null,
            ], $operationSuccess === true ? 200 : 400);
        }
    } elseif ($action === 'delete') {
        $result = api('/guilds/' . urlencode($guildId) . '/reaction-roles/delete', 'POST', [
            'panelId' => $_POST['panelId'] ?? 'default',
        ], 20);
        if (($result['data']['success'] ?? false) === true) {
            $message = 'Reaction role panel deleted.';
            $panelId = 'default';
        } else {
            $messageType = 'error';
            $message = $result['data']['message'] ?? 'Deleting reaction role panel failed.';
        }
    } else {
        $rows = [];
        $roleIds = $_POST['roleIds'] ?? [];
        $labels = $_POST['labels'] ?? [];
        $emojis = $_POST['emojis'] ?? [];
        for ($i = 0; $i < 10; $i++) {
            $roleId = trim($roleIds[$i] ?? '');
            if ($roleId === '') continue;
            $rows[] = [
                'roleId' => $roleId,
                'label' => trim($labels[$i] ?? ''),
                'emoji' => trim($emojis[$i] ?? ''),
            ];
        }

        $panelId = preg_replace('/[^a-zA-Z0-9_-]/', '', trim($_POST['panelId'] ?? 'default')) ?: 'default';
        $result = api('/guilds/' . urlencode($guildId) . '/reaction-roles', 'POST', [
            'panelId' => $panelId,
            'mode' => $_POST['mode'] ?? 'buttons',
            'channelId' => $_POST['channelId'] ?? '',
            'title' => $_POST['title'] ?? '',
            'description' => $_POST['description'] ?? '',
            'thumbnailUrl' => $_POST['thumbnailUrl'] ?? '',
            'imageUrl' => $_POST['imageUrl'] ?? '',
            'footerText' => $_POST['footerText'] ?? '',
            'authorText' => $_POST['authorText'] ?? '',
            'roles' => $rows,
        ], 15);
        if (($result['data']['success'] ?? false) === true) {
            $message = 'Reaction role panel saved.';
            $operationSuccess = true;
        } else {
            $messageType = 'error';
            $message = $result['data']['message'] ?? 'Saving reaction role panel failed.';
            $operationSuccess = false;
        }

        if ($isAjaxRequest) {
            $sendJson([
                'success' => $operationSuccess === true,
                'message' => $message,
                'messageType' => $messageType,
                'code' => $result['data']['code'] ?? null,
                'limit' => $result['data']['limit'] ?? null,
                'current' => $result['data']['current'] ?? null,
            ], $operationSuccess === true ? 200 : 400);
        }
    }
}

$moduleRaw = $guildId ? getAPI('/guilds/' . urlencode($guildId) . '/modules', 10) : null;
$modules = $moduleRaw['data']['modules'] ?? [];
$reactionRolesEnabled = false;
foreach ($modules as $module) {
    if (($module['key'] ?? '') === 'reactionRoles') {
        $reactionRolesEnabled = !empty($module['enabled']);
        break;
    }
}

$reactionRaw = $guildId ? getAPI('/guilds/' . urlencode($guildId) . '/reaction-roles?panelId=' . urlencode($panelId), 10) : null;
$data = $reactionRaw['data'] ?? [];
$settings = $data['settings'] ?? [];
$channels = $data['channels'] ?? [];
$rolesList = $data['roles'] ?? [];
$permissions = $data['permissions'] ?? [];
$guildName = $data['guildName'] ?? 'Selected server';
$panels = $settings['panels'] ?? [];
$panelId = $settings['panelId'] ?? $panelId;

$premRaw   = $guildId ? getAPI('/guilds/' . urlencode($guildId) . '/premium', 5) : null;
$maxPanels = (int)(($premRaw['data']['featureLimits']['reactionRolePanels'] ?? 3));
$atPanelLimit = $maxPanels >= 0 && count($panels) >= $maxPanels;

// Improve LIMIT_REACHED error message
if ($messageType === 'error' && isset($_POST['panelId'])) {
    // handled below via response code from API
}
$configuredRows = $settings['roles'] ?? [];
$panelMessageId = $settings['messageId'] ?? ($settings['lastPanelMessageId'] ?? '');
?>

<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.rr-compact { display: grid; grid-template-columns: 240px 1fr 320px; gap: 1.25rem; align-items: start; }
.rr-card { background: var(--panel); border: 1px solid var(--border-light); border-radius: 12px; padding: 1rem; display: flex; flex-direction: column; gap: 0.8rem; }
.rr-card h2 { font-size: 1rem; margin: 0; display: flex; align-items: center; gap: 0.5rem; }
.rr-section-title { font-size: 0.8rem; font-weight: 800; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin: 0.5rem 0 0.2rem; }
.rr-field { display: grid; gap: 0.3rem; }
.rr-field label { font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); }
.rr-field select, .rr-field textarea, .rr-field input[type="text"] { 
    width: 100%; padding: 0.6rem; border-radius: 6px; border: 1px solid var(--border-light); 
    background: var(--bg-tertiary); color: var(--text-primary); font-size: 0.9rem;
}
.rr-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
.rr-panel-link { display: block; padding: 0.6rem; border-radius: 8px; border: 1px solid var(--border-light); background: rgba(32,38,49,0.5); color: #fff; text-decoration: none; margin-bottom: 0.5rem; transition: 0.2s; }
.rr-panel-link:hover { border-color: var(--primary); }
.rr-panel-link.active { background: var(--primary); border-color: var(--primary); }
.rr-role-row { display: grid; grid-template-columns: 1fr 140px 60px; gap: 0.5rem; padding: 0.5rem; background: rgba(0,0,0,0.2); border-radius: 8px; border: 1px solid var(--border-light); }

.discord-preview { background: #2b2d31; border-radius: 8px; border-left: 4px solid #5865f2; padding: 1rem; font-family: 'gg sans', sans-serif; font-size: 0.95rem; }
.discord-author { color: #f2f3f5; font-size: 0.78rem; font-weight: 700; margin-bottom: 0.45rem; }
.discord-title { font-weight: 600; font-size: 1.1rem; margin-bottom: 0.4rem; }
.discord-desc { color: #dbdee1; white-space: pre-line; margin-bottom: 1rem; }
.discord-image { width: 100%; max-height: 180px; object-fit: cover; border-radius: 6px; margin: 0.6rem 0; border: 1px solid rgba(255,255,255,0.08); }
.discord-thumbnail { width: 44px; height: 44px; border-radius: 6px; object-fit: cover; border: 1px solid rgba(255,255,255,0.12); float: right; margin-left: 0.65rem; }
.discord-footer { color: #b5bac1; font-size: 0.72rem; margin-top: 0.7rem; }
.discord-btns { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.discord-btn { background: #4e5058; color: #fff; padding: 0.4rem 0.8rem; border-radius: 4px; font-size: 0.85rem; display: flex; align-items: center; gap: 0.4rem; font-weight: 600; }
.discord-select { background:#1e1f22; border:1px solid #3f4147; border-radius:6px; color:#c8ccd0; font-size:0.82rem; padding:0.55rem 0.65rem; min-width:230px; }
.rr-hint { font-size:0.73rem; color:var(--text-secondary); line-height:1.35; }

@media (max-width: 1200px) { .rr-compact { grid-template-columns: 240px 1fr; } }
@media (max-width: 900px) { .rr-compact { grid-template-columns: 1fr; } .rr-grid-2 { grid-template-columns: 1fr; } }

.alert { padding: 10px; border-radius: 6px; font-size: 0.85rem; margin-bottom: 0.8rem; border-left: 4px solid; }
.alert-success { background: rgba(81,207,102,.1); color: #51cf66; border-color: #51cf66; }
.alert-error { background: rgba(255,107,107,.1); color: #ff6b6b; border-color: #ff6b6b; }
.rr-action-result { display:none; padding:0.75rem; border-radius:8px; border:1px solid var(--border-light); background:rgba(0,0,0,.16); font-size:0.8rem; color:var(--text-secondary); line-height:1.45; }
.rr-action-result.success { display:block; border-color:rgba(81,207,102,.35); color:#b2f2bb; }
.rr-action-result.error { display:block; border-color:rgba(255,107,107,.45); color:#ffb4b4; }
.rr-action-result.info { display:block; border-color:rgba(88,101,242,.4); color:#c7d2fe; }
</style>

<div class="module-page">

<section class="dashboard-page-header">
    <div class="dashboard-page-copy">
        <span class="dashboard-page-eyebrow">Community Module</span>
        <h1>Reaction Roles</h1>
        <p>Panels, Modus und Rollenzuweisungen mit konsistentem Save-Flow.</p>
        <div class="dashboard-page-meta">
            <span class="status-badge <?php echo $reactionRolesEnabled ? 'active' : 'inactive'; ?>"><?php echo $reactionRolesEnabled ? 'Aktiv' : 'Inaktiv'; ?></span>
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
<?php if ($messageType === 'error' && strpos($message, 'Feature limit') !== false): ?>
    <div style="margin-top:-0.5rem; margin-bottom:0.75rem; font-size:0.8rem; color:var(--text-secondary);">
        <a href="server-plans.php<?php echo $guildId ? '?guildId=' . urlencode($guildId) : ''; ?>" style="color:#b48af7; font-weight:700;">💎 Upgrade ansehen</a>, um mehr Panels zu erstellen.
    </div>
<?php endif; ?>

<?php if (!$reactionRolesEnabled): ?>
    <div class="empty-state">
        <strong>Reaction Roles sind deaktiviert</strong>
        <p>Aktiviere das Modul und richte danach Panels, Modus und Rollen-Zuweisungen ein.</p>
        <a class="btn-icon cta btn-primary-ui" href="modules.php?guildId=<?php echo urlencode($guildId); ?>">Modul aktivieren</a>
    </div>
<?php else: ?>
    <div class="rr-compact">
        <!-- COLUMN 1: PANELS -->
        <div class="rr-card">
            <h2><span class="i">📑</span> Panels</h2>
            <?php foreach ($panels as $p): ?>
                <a href="?guildId=<?php echo urlencode($guildId); ?>&panelId=<?php echo urlencode($p['id']); ?>" class="rr-panel-link <?php echo $panelId === $p['id'] ? 'active' : ''; ?>">
                    <strong><?php echo esc($p['title'] ?: $p['id']); ?></strong>
                    <div style="font-size:0.7rem; opacity:0.8;">#<?php echo esc($p['channelName'] ?? 'No channel'); ?> · <?php echo esc(($p['mode'] ?? 'buttons') === 'select' ? 'Select' : 'Buttons'); ?></div>
                    <div style="font-size:0.68rem; opacity:0.75;"><?php echo !empty($p['exclusive']) ? 'Exclusive group' : 'Multi-role group'; ?><?php if (!empty($p['messageId'])): ?> · Message synced<?php endif; ?></div>
                </a>
            <?php endforeach; ?>
            <div style="font-size:0.75rem; color:var(--text-secondary); display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                <span><?php echo count($panels); ?> / <?php echo $maxPanels < 0 ? '∞' : $maxPanels; ?> Panels genutzt</span>
                <?php if ($atPanelLimit): ?><span class="status-badge warning" style="font-size:0.7rem;">Limit erreicht</span><?php endif; ?>
            </div>
            <?php if ($atPanelLimit): ?>
            <div class="upgrade-limit-card">
                <div class="ulc-icon">🚫</div>
                <div class="ulc-body">
                    <div class="ulc-title">Panel-Limit erreicht</div>
                    <div class="ulc-hint">Du nutzt <?= (int)count($panels) ?>/<?= $maxPanels < 0 ? '∞' : (int)$maxPanels ?> Panels. Premium erlaubt bis zu 10, Pro unbegrenzt.</div>
                </div>
                <a href="server-plans.php<?= $guildId ? '?guildId=' . urlencode($guildId) : '' ?>" class="ulc-cta">💎 Jetzt upgraden</a>
            </div>
            <?php else: ?>
            <a href="?guildId=<?php echo urlencode($guildId); ?>&panelId=new" class="btn-icon" style="justify-content:center; padding:0.5rem; font-size:0.8rem; background:rgba(255,255,255,0.1);"><span class="i">➕</span> Create New</a>
            <?php endif; ?>
            
            <div class="rr-section-title">Actions</div>
            <form method="POST" id="rrSendForm" style="margin:0; display:grid; gap:0.5rem;">
                <input type="hidden" name="guildId" value="<?php echo esc($guildId); ?>">
                <input type="hidden" name="panelId" value="<?php echo esc($panelId); ?>">
                <input type="hidden" name="action" value="send">
                <div class="rr-field">
                    <label>Target Channel</label>
                    <select name="channelId">
                        <?php foreach ($channels as $c): ?><option value="<?php echo $c['id']; ?>" <?php echo ($settings['channelId'] ?? '') === $c['id'] ? 'selected' : ''; ?>>#<?php echo esc($c['name']); ?></option><?php endforeach; ?>
                    </select>
                </div>
                <div class="rr-hint"><?php echo $panelMessageId ? 'Bestehende Panel-Message wird bearbeitet, falls vorhanden. Bei gelöschter Message wird automatisch neu gepostet.' : 'Noch keine Message vorhanden. Beim Senden wird eine neue Panel-Message erstellt.'; ?></div>
                <button type="button" id="rrSendBtn" class="btn-icon" style="justify-content:center; background:#5865f2; color:#fff; border:none; padding:0.6rem;"><span class="i">🚀</span> <?php echo $panelMessageId ? 'Update in Discord' : 'Send to Discord'; ?></button>
                <div id="rrActionResult" class="rr-action-result"></div>
            </form>
            <?php if ($panelId !== 'default' && $panelId !== 'new'): ?>
                <form method="POST" style="margin-top:0.5rem;" onsubmit="return confirm('Delete this panel?')">
                    <input type="hidden" name="guildId" value="<?php echo esc($guildId); ?>">
                    <input type="hidden" name="panelId" value="<?php echo esc($panelId); ?>">
                    <input type="hidden" name="action" value="delete">
                    <button type="submit" style="width:100%; padding:0.6rem; border-radius:8px; border:1px solid #ff6b6b; background:transparent; color:#ff6b6b; cursor:pointer;">Delete Panel</button>
                </form>
            <?php endif; ?>
        </div>

        <!-- COLUMN 2: EDIT & ROLES -->
        <form method="POST" class="rr-card" id="rrConfigForm">
            <input type="hidden" name="guildId" value="<?php echo esc($guildId); ?>">
            <input type="hidden" name="action" value="save">
            
            <h2><span class="i">✍️</span> Configuration</h2>
            <div class="rr-grid-2">
                <div class="rr-field"><label>Panel ID</label><input type="text" name="panelId" value="<?php echo esc($panelId === 'new' ? '' : $panelId); ?>" <?php echo ($panelId !== 'new' && $panelId !== 'default') ? 'readonly' : ''; ?> placeholder="e.g. colors"></div>
                <div class="rr-field"><label>Display Mode</label><select name="mode" id="rrMode"><option value="buttons" <?php echo ($settings['mode'] ?? '') === 'buttons' ? 'selected' : ''; ?>>Buttons (Recommended)</option><option value="select" <?php echo ($settings['mode'] ?? '') === 'select' ? 'selected' : ''; ?>>Dropdown Menu</option></select></div>
            </div>
            <label style="display:flex; align-items:center; gap:0.55rem; cursor:pointer;">
                <input type="checkbox" name="exclusive" value="1" <?php echo !empty($settings['exclusive']) ? 'checked' : ''; ?>>
                <span style="font-size:0.85rem; font-weight:700;">Exklusive Gruppe (nur eine Rolle aus diesem Panel erlaubt)</span>
            </label>
            <div class="rr-field">
                <label>Panel Channel</label>
                <select name="channelId">
                    <option value="">- Choose channel -</option>
                    <?php foreach ($channels as $c): ?>
                        <option value="<?php echo esc($c['id']); ?>" <?php echo ($settings['channelId'] ?? '') === $c['id'] ? 'selected' : ''; ?>>
                            #<?php echo esc($c['name']); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="rr-hint">Wenn ein User in einer exklusiven Gruppe eine neue Rolle auswählt, werden andere Rollen aus diesem Panel automatisch entfernt.</div>
            <div class="rr-field"><label>Embed Title</label><input type="text" name="title" id="rrTitle" value="<?php echo esc($settings['title'] ?? ''); ?>"></div>
            <div class="rr-field"><label>Embed Description</label><textarea name="description" id="rrDesc" style="min-height:60px;"><?php echo esc($settings['description'] ?? ''); ?></textarea></div>
            <div class="rr-grid-2">
                <div class="rr-field"><label>Author Text</label><input type="text" name="authorText" id="rrAuthor" value="<?php echo esc($settings['authorText'] ?? ''); ?>" placeholder="Optional small line above title"></div>
                <div class="rr-field"><label>Footer Text</label><input type="text" name="footerText" id="rrFooter" value="<?php echo esc($settings['footerText'] ?? ''); ?>" placeholder="Optional small line below embed"></div>
            </div>
            <div class="rr-grid-2">
                <div class="rr-field"><label>Thumbnail URL</label><input type="text" name="thumbnailUrl" id="rrThumb" value="<?php echo esc($settings['thumbnailUrl'] ?? ''); ?>" placeholder="https://..."></div>
                <div class="rr-field"><label>Image URL</label><input type="text" name="imageUrl" id="rrImage" value="<?php echo esc($settings['imageUrl'] ?? ''); ?>" placeholder="https://..."></div>
            </div>
            <div class="rr-hint">Nutze direkte http/https Bildlinks (z.B. PNG/JPG/WebP). Data-URLs oder ungültige Links werden automatisch ignoriert.</div>

            <div class="rr-section-title">Roles & Reactions (Max 10)</div>
            <div style="display:grid; gap:0.5rem;">
                <?php for ($i = 0; $i < 10; $i++): 
                    $row = $configuredRows[$i] ?? ['roleId' => '', 'label' => '', 'emoji' => ''];
                ?>
                    <div class="rr-role-row">
                        <div class="rr-field">
                            <select name="roleIds[]">
                                <option value="">- No role -</option>
                                <?php foreach ($rolesList as $role): ?>
                                    <option value="<?php echo esc($role['id']); ?>" <?php echo $row['roleId'] === $role['id'] ? 'selected' : ''; ?>>
                                        <?php echo esc($role['name']); ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <div class="rr-field"><input type="text" name="labels[]" class="rrLabel" value="<?php echo esc($row['label']); ?>" placeholder="Label"></div>
                        <div class="rr-field"><input type="text" name="emojis[]" class="rrEmoji" value="<?php echo esc($row['emoji']); ?>" placeholder="Emoji"></div>
                    </div>
                <?php endfor; ?>
            </div>
            <button type="submit" id="rrSaveBtn" class="btn-icon" style="justify-content:center; background:var(--primary); color:#fff; border:none; padding:0.7rem;"><span class="i">💾</span> Save Configuration</button>

            <div class="ux-savebar" id="rrSaveBar">
                <div class="ux-save-info">
                    <strong>Ungespeicherte Aenderungen</strong>
                    <span>Panel-Konfiguration wird ohne Reload gespeichert.</span>
                </div>
                <div class="ux-save-actions">
                    <span class="ux-save-status" id="rrSaveStatus">Bereit</span>
                    <button type="submit" id="rrStickySaveBtn" class="btn-icon btn-primary-ui"><span class="i">💾</span> Speichern</button>
                </div>
            </div>
        </form>

        <!-- COLUMN 3: PREVIEW -->
        <div class="rr-card">
            <h2><span class="i">👁️</span> Live Preview</h2>
            <div class="discord-preview">
                <img id="pThumb" class="discord-thumbnail" alt="Thumbnail" style="display:none;">
                <div id="pAuthor" class="discord-author" style="display:none;"></div>
                <div id="pTitle" class="discord-title"></div>
                <div id="pDesc" class="discord-desc"></div>
                <img id="pImage" class="discord-image" alt="Embed image" style="display:none;">
                <div id="pBtns" class="discord-btns"></div>
                <div id="pSelect" style="display:none;"></div>
                <div id="pFooter" class="discord-footer" style="display:none;"></div>
            </div>
            <div class="rr-section-title">Information</div>
            <div style="font-size:0.75rem; color:var(--text-secondary); display:grid; gap:0.4rem;">
                <p>• <strong>Buttons</strong> are best for up to 5-10 roles.</p>
                <p>• <strong>Dropdown</strong> is better for many roles and mobile UX.</p>
                <p>• <strong>Exklusiv</strong>: nur eine Rolle aus diesem Panel gleichzeitig.</p>
                <p>• Make sure the bot's role is <strong>higher</strong> than the roles it should assign.</p>
            </div>
        </div>
    </div>
<?php endif; ?>

</div>

<script>
function updatePreview() {
    const title = document.getElementById('rrTitle').value || 'Reaction Roles';
    const desc = document.getElementById('rrDesc').value || 'Select a role below.';
    const author = document.getElementById('rrAuthor')?.value?.trim() || '';
    const footer = document.getElementById('rrFooter')?.value?.trim() || '';
    const thumb = document.getElementById('rrThumb')?.value?.trim() || '';
    const image = document.getElementById('rrImage')?.value?.trim() || '';
    const mode = document.getElementById('rrMode')?.value || 'buttons';
    
    document.getElementById('pTitle').textContent = title;
    document.getElementById('pDesc').textContent = desc;

    const authorNode = document.getElementById('pAuthor');
    const footerNode = document.getElementById('pFooter');
    const thumbNode = document.getElementById('pThumb');
    const imageNode = document.getElementById('pImage');
    const isHttpUrl = (value) => /^https?:\/\//i.test(value);

    authorNode.textContent = author;
    authorNode.style.display = author ? '' : 'none';
    footerNode.textContent = footer;
    footerNode.style.display = footer ? '' : 'none';

    if (isHttpUrl(thumb)) {
        thumbNode.src = thumb;
        thumbNode.style.display = '';
    } else {
        thumbNode.style.display = 'none';
        thumbNode.removeAttribute('src');
    }
    if (isHttpUrl(image)) {
        imageNode.src = image;
        imageNode.style.display = '';
    } else {
        imageNode.style.display = 'none';
        imageNode.removeAttribute('src');
    }

    const btns = document.getElementById('pBtns');
    const selectWrap = document.getElementById('pSelect');
    btns.innerHTML = '';
    selectWrap.innerHTML = '';

    const labels = document.querySelectorAll('.rrLabel');
    const emojis = document.querySelectorAll('.rrEmoji');

    const rendered = [];
    labels.forEach((l, i) => {
        const label = l.value.trim();
        const emoji = emojis[i].value.trim();
        if (label || emoji) {
            rendered.push((emoji ? `${emoji} ` : '') + (label || 'Role'));
        }
    });

    if (mode === 'select') {
        btns.style.display = 'none';
        selectWrap.style.display = '';
        const fakeSelect = document.createElement('div');
        fakeSelect.className = 'discord-select';
        fakeSelect.textContent = rendered.length ? `Select roles: ${rendered.slice(0, 3).join(' | ')}${rendered.length > 3 ? ' ...' : ''}` : 'Select roles...';
        selectWrap.appendChild(fakeSelect);
    } else {
        btns.style.display = 'flex';
        selectWrap.style.display = 'none';
        rendered.slice(0, 5).forEach(text => {
            const btn = document.createElement('div');
            btn.className = 'discord-btn';
            btn.textContent = text;
            btns.appendChild(btn);
        });
    }
}

document.querySelectorAll('input, textarea, select').forEach(el => {
    el.addEventListener('input', updatePreview);
    el.addEventListener('change', updatePreview);
});
document.addEventListener('DOMContentLoaded', updatePreview);

(function() {
    const configForm = document.getElementById('rrConfigForm');
    const plansUrl = 'server-plans.php<?= $guildId ? '?guildId=' . urlencode($guildId) : '' ?>';

    function showLimitReachedCard(featureName, limit, current) {
        let container = document.getElementById('rrLimitCard');
        if (!container) {
            container = document.createElement('div');
            container.id = 'rrLimitCard';
            const saveBarEl = document.getElementById('rrSaveBar');
            if (saveBarEl) {
                saveBarEl.parentNode.insertBefore(container, saveBarEl.nextSibling);
            } else {
                configForm?.parentNode?.insertBefore(container, configForm.nextSibling);
            }
        }
        container.innerHTML = `
            <div class="upgrade-limit-card" style="margin-top:1rem;">
                <div class="ulc-icon">🚫</div>
                <div class="ulc-body">
                    <div class="ulc-title">Du hast dein Limit erreicht</div>
                    <div class="ulc-hint">💎 ${featureName}: ${current ?? '?'}/${limit ?? '?'} genutzt. Upgrade auf Premium für mehr Kapazität.</div>
                </div>
                <a href="${plansUrl}" class="ulc-cta">Jetzt upgraden</a>
            </div>`;
        container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    const saveBtn = document.getElementById('rrSaveBtn');
    const stickySaveBtn = document.getElementById('rrStickySaveBtn');
    const saveBar = document.getElementById('rrSaveBar');
    const saveStatus = document.getElementById('rrSaveStatus');
    const sendForm = document.getElementById('rrSendForm');
    const sendBtn = document.getElementById('rrSendBtn');
    const actionResult = document.getElementById('rrActionResult');
    if (!configForm) return;

    let initialState = new URLSearchParams(new FormData(configForm)).toString();
    let allowUnload = false;

    function currentState() {
        return new URLSearchParams(new FormData(configForm)).toString();
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

    function setSaveLoading(loading) {
        [saveBtn, stickySaveBtn].forEach((btn) => {
            if (!btn) return;
            btn.disabled = loading;
            btn.innerHTML = loading ? '<span class="i">⏳</span> Speichert...' : '<span class="i">💾</span> Speichern';
        });
    }

    function setActionResult(message, type = 'info', data = null) {
        if (!actionResult) return;
        const link = data?.messageId && data?.channelId
            ? `<br>Message gespeichert in <strong>#${sendForm?.querySelector('[name="channelId"] option:checked')?.textContent?.replace(/^#/, '') || data.channelId}</strong>.`
            : '';
        actionResult.className = `rr-action-result ${type}`;
        actionResult.innerHTML = `${message}${link}`;
    }

    configForm.addEventListener('input', syncSaveBar);
    configForm.addEventListener('change', syncSaveBar);

    window.addEventListener('beforeunload', (event) => {
        if (allowUnload || !isDirty()) return;
        event.preventDefault();
        event.returnValue = '';
    });

    document.querySelectorAll('form[method="POST"]').forEach((form) => {
        form.addEventListener('submit', async (event) => {
            if (form === configForm) {
                event.preventDefault();
                setSaveLoading(true);
                setStatus('Speichert...');

                try {
                    const response = await fetch(window.location.href, {
                        method: 'POST',
                        headers: {
                            'X-Requested-With': 'XMLHttpRequest',
                            'Accept': 'application/json'
                        },
                        body: new FormData(configForm),
                        credentials: 'same-origin'
                    });
                    const json = await response.json().catch(() => ({ success: false, message: 'Ungueltige Serverantwort.' }));
                    if (!response.ok || !json.success) {
                        if (json.code === 'LIMIT_REACHED') {
                            showLimitReachedCard('Reaction Role Panels', json.limit, json.current);
                        } else {
                            throw new Error(json.message || 'Speichern fehlgeschlagen.');
                        }
                        return;
                    }

                    initialState = currentState();
                    allowUnload = false;
                    syncSaveBar();
                    setStatus('Gespeichert', 'success');
                } catch (error) {
                    setStatus('Fehler', 'error');
                    alert(error.message || 'Speichern fehlgeschlagen.');
                } finally {
                    setSaveLoading(false);
                }
                return;
            }
            const submitter = document.activeElement;
            allowUnload = true;
            if (submitter && submitter.tagName === 'BUTTON' && submitter.type === 'submit') {
                submitter.disabled = true;
                if (submitter !== saveBtn && submitter !== stickySaveBtn) {
                    submitter.textContent = 'Speichert...';
                }
            }
        });
    });

    sendBtn?.addEventListener('click', async () => {
        if (!sendForm) return;
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<span class="i">⏳</span> Sendet...';
        setActionResult('Sende Panel nach Discord...', 'info');

        try {
            const response = await fetch(window.location.href, {
                method: 'POST',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json'
                },
                body: new FormData(sendForm),
                credentials: 'same-origin'
            });
            const json = await response.json().catch(() => {
                console.error('[Dashboard] Non-JSON response (reaction-roles send):', response.status, response.url);
                return { success: false, message: 'Ungueltige Serverantwort.' };
            });
            if (!response.ok || !json.success) {
                throw new Error(json.message || 'Panel konnte nicht gesendet werden.');
            }
            setActionResult(json.message || 'Panel gesendet.', 'success', json.data);
        } catch (error) {
            setActionResult(error.message || 'Panel konnte nicht gesendet werden.', 'error');
        } finally {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<span class="i">🚀</span> <?php echo $panelMessageId ? 'Update in Discord' : 'Send to Discord'; ?>';
        }
    });
})();
</script>

<?php include '../includes/footer.php'; ?>
