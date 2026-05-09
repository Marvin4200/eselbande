<?php
$page_title = 'AutoMod';
require_once __DIR__ . '/../includes/config.php';
requireLogin();

function automodPageAccessCheck($guildId, $moduleKey = 'automod') {
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

function automodPageAccessMessage($reason) {
    if ($reason === 'missing_module_role') return 'Dir fehlt eine freigegebene Dashboard-Rolle fuer dieses Modul.';
    if ($reason === 'admin_role_not_configured') return 'Es ist noch keine Dashboard-Admin-Rolle gesetzt.';
    if ($reason === 'not_guild_admin') return 'Du bist kein Server-Owner/Admin und hast keine freigegebene Dashboard-Rolle.';
    return 'Du hast aktuell keinen Zugriff auf AutoMod.';
}

$guildsRaw = getAPI('/voice/guilds', 8);
$guilds = $guildsRaw['data']['guilds'] ?? [];
$guildId = dashboardSelectedGuildId($guilds);

$moduleAccess = $guildId ? automodPageAccessCheck($guildId, 'automod') : ['allowed' => true];
if ($guildId && empty($moduleAccess['allowed'])) {
    $denyLabel = 'AutoMod';
    $denyMessage = automodPageAccessMessage($moduleAccess['reason'] ?? '');
    include '../includes/header.php';
    include '../includes/sidebar.php';
    ?>
    <div class="empty-state" style="max-width:780px; margin:1rem auto; text-align:left;">
        <strong>Kein Zugriff auf <?= esc($denyLabel) ?></strong>
        <p><?= esc($denyMessage) ?></p>
        <p style="color:var(--text-secondary); font-size:.82rem;">Bitte lasse dir in den Server-Einstellungen eine Modul-Rolle fuer AutoMod zuweisen.</p>
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
    if ($action === 'test') {
        $result = api('/guilds/' . urlencode($guildId) . '/automod/test', 'POST', [
            'content' => $_POST['testMessage'] ?? '',
        ], 15);
        $operationSuccess = (($result['data']['success'] ?? false) === true);
        if ($operationSuccess) {
            $violations = $result['data']['data']['violations'] ?? [];
            $message = count($violations)
                ? 'AutoMod hat Treffer fuer diese Nachricht gefunden.'
                : 'Diese Nachricht wuerde aktuell nicht von AutoMod geblockt.';
        } else {
            $messageType = 'error';
            $message = $result['data']['message'] ?? 'AutoMod-Test fehlgeschlagen.';
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
        $ruleActions = isset($_POST['ruleActions']) && is_array($_POST['ruleActions']) ? $_POST['ruleActions'] : [];
        $result = api('/guilds/' . urlencode($guildId) . '/automod', 'POST', [
            'blockInvites' => isset($_POST['blockInvites']),
            'blockLinks' => isset($_POST['blockLinks']),
            'allowedLinks' => $_POST['allowedLinks'] ?? '',
            'blockMassMentions' => isset($_POST['blockMassMentions']),
            'blockCaps' => isset($_POST['blockCaps']),
            'blockSpam' => isset($_POST['blockSpam']),
            'blockRepeatedText' => isset($_POST['blockRepeatedText']),
            'deleteMessage' => isset($_POST['deleteMessage']),
            'warnUser' => isset($_POST['warnUser']),
            'exemptAdmins' => isset($_POST['exemptAdmins']),
            'blockedTerms' => $_POST['blockedTerms'] ?? '',
            'blockedTermsWholeWord' => isset($_POST['blockedTermsWholeWord']),
            'blockedTermsRegex' => isset($_POST['blockedTermsRegex']),
            'ruleActions' => [
                'invite' => $ruleActions['invite'] ?? 'fallback',
                'link' => $ruleActions['link'] ?? 'fallback',
                'blocked_term' => $ruleActions['blocked_term'] ?? 'fallback',
                'mass_mentions' => $ruleActions['mass_mentions'] ?? 'fallback',
                'caps' => $ruleActions['caps'] ?? 'fallback',
                'repeated_text' => $ruleActions['repeated_text'] ?? 'fallback',
                'message_spam' => $ruleActions['message_spam'] ?? 'fallback',
            ],
            'ignoredRoles' => isset($_POST['ignoredRoles']) ? (array)$_POST['ignoredRoles'] : [],
            'ignoredChannels' => isset($_POST['ignoredChannels']) ? (array)$_POST['ignoredChannels'] : [],
            'mentionLimit' => intval($_POST['mentionLimit'] ?? 6),
            'capsMinLength' => intval($_POST['capsMinLength'] ?? 12),
            'capsPercent' => intval($_POST['capsPercent'] ?? 70),
            'duplicateThreshold' => intval($_POST['duplicateThreshold'] ?? 4),
            'duplicateWindowSeconds' => intval($_POST['duplicateWindowSeconds'] ?? 20),
            'autoPunishStrikes' => intval($_POST['autoPunishStrikes'] ?? 0),
            'timeoutMinutes' => intval($_POST['timeoutMinutes'] ?? 10),
            'punishmentAction' => $_POST['punishmentAction'] ?? 'timeout',
            'punishmentMode' => $_POST['punishmentMode'] ?? 'fixed',
            'warnMessage' => $_POST['warnMessage'] ?? '',
        ], 15);
        if (($result['data']['success'] ?? false) === true) {
            $message = 'AutoMod settings saved.';
            $operationSuccess = true;
        } else {
            $messageType = 'error';
            $message = $result['data']['message'] ?? 'Saving AutoMod settings failed.';
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
$automodEnabled = false;
foreach ($modules as $module) {
    if (($module['key'] ?? '') === 'automod') {
        $automodEnabled = !empty($module['enabled']);
        break;
    }
}

$automodRaw = $guildId ? getAPI('/guilds/' . urlencode($guildId) . '/automod', 10) : null;
$data = $automodRaw['data'] ?? [];
$settings = $data['settings'] ?? [];
$permissions = $data['permissions'] ?? [];
$guildName = $data['guildName'] ?? 'Selected server';
$roles = $data['roles'] ?? [];
$channels = $data['channels'] ?? [];
$stats = $data['stats'] ?? [];
$recentCases = $data['recentCases'] ?? [];
$blockedTermsText = implode("\n", $settings['blockedTerms'] ?? []);
$allowedLinksText = implode("\n", $settings['allowedLinks'] ?? []);

$premRaw       = $guildId ? getAPI('/guilds/' . urlencode($guildId) . '/premium', 5) : null;
$maxTerms      = (int)(($premRaw['data']['featureLimits']['automodRules'] ?? 5));
$currentTerms  = count($settings['blockedTerms'] ?? []);
$atTermsLimit  = $maxTerms >= 0 && $currentTerms >= $maxTerms;
?>

<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.am-compact { display: grid; grid-template-columns: 1fr 340px 280px; gap: 1.25rem; align-items: start; }
.am-card { background: var(--panel); border: 1px solid var(--border-light); border-radius: 12px; padding: 1rem; display: flex; flex-direction: column; gap: 0.8rem; }
.am-card h2 { font-size: 1rem; margin: 0; display: flex; align-items: center; gap: 0.5rem; }
.am-section-title { font-size: 0.8rem; font-weight: 800; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin: 0.5rem 0 0.2rem; }
.am-field { display: grid; gap: 0.3rem; }
.am-field label { font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); }
.am-field select, .am-field textarea, .am-field input[type="text"], .am-field input[type="number"] { 
    width: 100%; padding: 0.6rem; border-radius: 6px; border: 1px solid var(--border-light); 
    background: var(--bg-tertiary); color: var(--text-primary); font-size: 0.9rem;
}
.am-toggles { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.am-check { 
    display: flex; align-items: center; gap: 0.4rem; padding: 0.5rem 0.7rem; 
    background: rgba(32,38,49,0.5); border: 1px solid var(--border-light); border-radius: 8px;
    font-size: 0.85rem; font-weight: 600; cursor: pointer;
}
.am-rule-row { display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
.am-rule-info { display: grid; }
.am-rule-info strong { font-size: 0.85rem; }
.am-rule-info small { font-size: 0.75rem; color: var(--text-secondary); }
.am-rule-action { width: 170px; }
.am-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
.am-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
.am-stat { background: var(--bg-tertiary); border: 1px solid var(--border-light); border-radius: 8px; padding: 0.7rem; }
.am-stat strong { display: block; font-size: 1.2rem; color: var(--text-primary); }
.am-stat span { font-size: 0.72rem; color: var(--text-secondary); font-weight: 700; text-transform: uppercase; }
.am-case { display: grid; gap: 0.15rem; padding: 0.55rem 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
.am-case:last-child { border-bottom: none; }
.am-case strong { font-size: 0.8rem; color: var(--text-primary); }
.am-case small { color: var(--text-secondary); font-size: 0.72rem; }
.am-note { background: rgba(88,101,242,0.1); border: 1px solid rgba(88,101,242,0.25); border-radius: 8px; padding: 0.75rem; color: var(--text-secondary); font-size: 0.8rem; line-height: 1.35; }
.am-note a { color: var(--primary); font-weight: 800; text-decoration: none; }
.am-warn { background: rgba(242, 153, 74, 0.14); border-color: rgba(242, 153, 74, 0.45); }
.am-test-result { display:none; padding:0.75rem; border-radius:8px; border:1px solid var(--border-light); background:rgba(0,0,0,0.16); font-size:0.8rem; color:var(--text-secondary); line-height:1.45; }
.am-test-result.success { display:block; border-color:rgba(81,207,102,.35); color:#b2f2bb; }
.am-test-result.error { display:block; border-color:rgba(255,107,107,.45); color:#ffb4b4; }
.am-test-result.info { display:block; border-color:rgba(88,101,242,.4); color:#c7d2fe; }

@media (max-width: 1100px) { .am-compact { grid-template-columns: 1fr 340px; } }
@media (max-width: 800px) { .am-compact { grid-template-columns: 1fr; } }

.alert { padding: 10px; border-radius: 6px; font-size: 0.85rem; margin-bottom: 0.8rem; border-left: 4px solid; }
.alert-success { background: rgba(81,207,102,.1); color: #51cf66; border-color: #51cf66; }
.alert-error { background: rgba(255,107,107,.1); color: #ff6b6b; border-color: #ff6b6b; }
</style>

<div class="module-page">

<section class="dashboard-page-header">
    <div class="dashboard-page-copy">
        <span class="dashboard-page-eyebrow">Moderation Module</span>
        <h1>AutoMod</h1>
        <p>Regeln, Schwellen und Aktionen in einem konsistenten Setup-Flow.</p>
        <div class="dashboard-page-meta">
            <span class="status-badge <?php echo $automodEnabled ? 'active' : 'inactive'; ?>"><?php echo $automodEnabled ? 'Aktiv' : 'Inaktiv'; ?></span>
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

<?php if (!$automodEnabled): ?>
    <div class="empty-state">
        <strong>AutoMod ist deaktiviert</strong>
        <p>Aktiviere das Modul und richte danach Presets, Regelaktionen und Filter ein.</p>
        <a class="btn-icon cta btn-primary-ui" href="modules.php?guildId=<?php echo urlencode($guildId); ?>">Modul aktivieren</a>
    </div>
<?php else: ?>

    <!-- PRESETS BAR -->
    <div class="am-card" style="margin-bottom:1rem; flex-direction:row; align-items:center; gap:1rem; flex-wrap:wrap;">
        <span style="font-size:.8rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:.05em; white-space:nowrap;">⚡ Quick Preset</span>
        <button type="button" class="btn-icon" onclick="applyAutomodPreset('relaxed')" style="background:rgba(81,207,102,.15); border-color:rgba(81,207,102,.4); color:#51cf66;">🟢 Relaxed</button>
        <button type="button" class="btn-icon" onclick="applyAutomodPreset('balanced')" style="background:rgba(255,212,59,.12); border-color:rgba(255,212,59,.4); color:#ffd43b;">🟡 Balanced</button>
        <button type="button" class="btn-icon" onclick="applyAutomodPreset('strict')" style="background:rgba(242,63,67,.12); border-color:rgba(242,63,67,.4); color:#ff9b9d;">🔴 Strict</button>
        <small style="color:var(--text-secondary);">Presets füllen die Felder vor – danach noch Speichern klicken.</small>
    </div>

    <form method="POST" class="am-compact" id="automod-form">
        <input type="hidden" name="guildId" value="<?php echo esc($guildId); ?>">
        
        <!-- COLUMN 1: RULES & PUNISHMENT -->
        <div class="am-card">
            <h2><span class="i">🛡️</span> Security Rules</h2>

            <div class="am-grid-3">
                <div class="am-stat"><strong><?php echo number_format((int)($stats['hits24h'] ?? 0)); ?></strong><span>24h Hits</span></div>
                <div class="am-stat"><strong><?php echo number_format((int)($stats['uniqueUsers24h'] ?? 0)); ?></strong><span>Users</span></div>
                <div class="am-stat"><strong><?php echo number_format((int)($stats['totalHits'] ?? 0)); ?></strong><span>Total</span></div>
            </div>
            
            <div class="am-note" style="margin-bottom:0.4rem;">
                Aktiviere Regeln links und lege rechts pro Regel fest, welche Aktion laufen soll. Mit <strong>Use Global</strong> gelten deine globalen Delete/Warn/Punishment-Einstellungen.
            </div>

            <div class="am-rule-row">
                <div class="am-rule-info"><strong>Invites</strong><small>Blocks Discord invite links and vanity invite URLs.</small></div>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <input type="checkbox" name="blockInvites" <?php echo !empty($settings['blockInvites']) ? 'checked' : ''; ?>>
                    <select class="am-rule-action" name="ruleActions[invite]">
                        <?php $v = $settings['ruleActions']['invite'] ?? 'fallback'; ?>
                        <option value="fallback" <?php echo $v === 'fallback' ? 'selected' : ''; ?>>Use Global</option>
                        <option value="none" <?php echo $v === 'none' ? 'selected' : ''; ?>>None</option>
                        <option value="delete" <?php echo $v === 'delete' ? 'selected' : ''; ?>>Delete</option>
                        <option value="warn" <?php echo $v === 'warn' ? 'selected' : ''; ?>>Warn</option>
                        <option value="timeout" <?php echo $v === 'timeout' ? 'selected' : ''; ?>>Timeout</option>
                        <option value="kick" <?php echo $v === 'kick' ? 'selected' : ''; ?>>Kick</option>
                        <option value="ban" <?php echo $v === 'ban' ? 'selected' : ''; ?>>Ban</option>
                    </select>
                </div>
            </div>
            <div class="am-rule-row">
                <div class="am-rule-info"><strong>Links</strong><small>Blocks non-whitelisted external links.</small></div>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <input type="checkbox" name="blockLinks" <?php echo !empty($settings['blockLinks']) ? 'checked' : ''; ?>>
                    <select class="am-rule-action" name="ruleActions[link]">
                        <?php $v = $settings['ruleActions']['link'] ?? 'fallback'; ?>
                        <option value="fallback" <?php echo $v === 'fallback' ? 'selected' : ''; ?>>Use Global</option>
                        <option value="none" <?php echo $v === 'none' ? 'selected' : ''; ?>>None</option>
                        <option value="delete" <?php echo $v === 'delete' ? 'selected' : ''; ?>>Delete</option>
                        <option value="warn" <?php echo $v === 'warn' ? 'selected' : ''; ?>>Warn</option>
                        <option value="timeout" <?php echo $v === 'timeout' ? 'selected' : ''; ?>>Timeout</option>
                        <option value="kick" <?php echo $v === 'kick' ? 'selected' : ''; ?>>Kick</option>
                        <option value="ban" <?php echo $v === 'ban' ? 'selected' : ''; ?>>Ban</option>
                    </select>
                </div>
            </div>
            <div class="am-rule-row">
                <div class="am-rule-info"><strong>Spam</strong><small>Detects message floods in a short time window.</small></div>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <input type="checkbox" name="blockSpam" <?php echo !empty($settings['blockSpam']) ? 'checked' : ''; ?>>
                    <select class="am-rule-action" name="ruleActions[message_spam]">
                        <?php $v = $settings['ruleActions']['message_spam'] ?? 'fallback'; ?>
                        <option value="fallback" <?php echo $v === 'fallback' ? 'selected' : ''; ?>>Use Global</option>
                        <option value="none" <?php echo $v === 'none' ? 'selected' : ''; ?>>None</option>
                        <option value="delete" <?php echo $v === 'delete' ? 'selected' : ''; ?>>Delete</option>
                        <option value="warn" <?php echo $v === 'warn' ? 'selected' : ''; ?>>Warn</option>
                        <option value="timeout" <?php echo $v === 'timeout' ? 'selected' : ''; ?>>Timeout</option>
                        <option value="kick" <?php echo $v === 'kick' ? 'selected' : ''; ?>>Kick</option>
                        <option value="ban" <?php echo $v === 'ban' ? 'selected' : ''; ?>>Ban</option>
                    </select>
                </div>
            </div>
            <div class="am-rule-row">
                <div class="am-rule-info"><strong>Repeated Text</strong><small>Blocks repeated copy-paste spam chunks.</small></div>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <input type="checkbox" name="blockRepeatedText" <?php echo !empty($settings['blockRepeatedText']) ? 'checked' : ''; ?>>
                    <select class="am-rule-action" name="ruleActions[repeated_text]">
                        <?php $v = $settings['ruleActions']['repeated_text'] ?? 'fallback'; ?>
                        <option value="fallback" <?php echo $v === 'fallback' ? 'selected' : ''; ?>>Use Global</option>
                        <option value="none" <?php echo $v === 'none' ? 'selected' : ''; ?>>None</option>
                        <option value="delete" <?php echo $v === 'delete' ? 'selected' : ''; ?>>Delete</option>
                        <option value="warn" <?php echo $v === 'warn' ? 'selected' : ''; ?>>Warn</option>
                        <option value="timeout" <?php echo $v === 'timeout' ? 'selected' : ''; ?>>Timeout</option>
                        <option value="kick" <?php echo $v === 'kick' ? 'selected' : ''; ?>>Kick</option>
                        <option value="ban" <?php echo $v === 'ban' ? 'selected' : ''; ?>>Ban</option>
                    </select>
                </div>
            </div>
            <div class="am-rule-row">
                <div class="am-rule-info"><strong>Mass Mentions</strong><small>Stops mention raids and mass pings.</small></div>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <input type="checkbox" name="blockMassMentions" <?php echo !empty($settings['blockMassMentions']) ? 'checked' : ''; ?>>
                    <select class="am-rule-action" name="ruleActions[mass_mentions]">
                        <?php $v = $settings['ruleActions']['mass_mentions'] ?? 'fallback'; ?>
                        <option value="fallback" <?php echo $v === 'fallback' ? 'selected' : ''; ?>>Use Global</option>
                        <option value="none" <?php echo $v === 'none' ? 'selected' : ''; ?>>None</option>
                        <option value="delete" <?php echo $v === 'delete' ? 'selected' : ''; ?>>Delete</option>
                        <option value="warn" <?php echo $v === 'warn' ? 'selected' : ''; ?>>Warn</option>
                        <option value="timeout" <?php echo $v === 'timeout' ? 'selected' : ''; ?>>Timeout</option>
                        <option value="kick" <?php echo $v === 'kick' ? 'selected' : ''; ?>>Kick</option>
                        <option value="ban" <?php echo $v === 'ban' ? 'selected' : ''; ?>>Ban</option>
                    </select>
                </div>
            </div>
            <div class="am-rule-row">
                <div class="am-rule-info"><strong>Caps</strong><small>Stops shouting with too many uppercase letters.</small></div>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <input type="checkbox" name="blockCaps" <?php echo !empty($settings['blockCaps']) ? 'checked' : ''; ?>>
                    <select class="am-rule-action" name="ruleActions[caps]">
                        <?php $v = $settings['ruleActions']['caps'] ?? 'fallback'; ?>
                        <option value="fallback" <?php echo $v === 'fallback' ? 'selected' : ''; ?>>Use Global</option>
                        <option value="none" <?php echo $v === 'none' ? 'selected' : ''; ?>>None</option>
                        <option value="delete" <?php echo $v === 'delete' ? 'selected' : ''; ?>>Delete</option>
                        <option value="warn" <?php echo $v === 'warn' ? 'selected' : ''; ?>>Warn</option>
                        <option value="timeout" <?php echo $v === 'timeout' ? 'selected' : ''; ?>>Timeout</option>
                        <option value="kick" <?php echo $v === 'kick' ? 'selected' : ''; ?>>Kick</option>
                        <option value="ban" <?php echo $v === 'ban' ? 'selected' : ''; ?>>Ban</option>
                    </select>
                </div>
            </div>

            <div class="am-section-title">Thresholds</div>
            <div class="am-grid-2">
                <div class="am-field">
                    <label>Mention Limit</label>
                    <input type="number" name="mentionLimit" value="<?php echo esc($settings['mentionLimit'] ?? 6); ?>" min="2" max="25">
                </div>
                <div class="am-field">
                    <label>Spam Window (s)</label>
                    <input type="number" name="duplicateWindowSeconds" value="<?php echo esc($settings['duplicateWindowSeconds'] ?? 20); ?>" min="5" max="300">
                </div>
                <div class="am-field">
                    <label>Duplicate Count</label>
                    <input type="number" name="duplicateThreshold" value="<?php echo esc($settings['duplicateThreshold'] ?? 4); ?>" min="2" max="10">
                </div>
                <div class="am-field">
                    <label>Caps Percent</label>
                    <input type="number" name="capsPercent" value="<?php echo esc($settings['capsPercent'] ?? 70); ?>" min="50" max="100">
                </div>
            </div>

            <div class="am-section-title">Punishment</div>
            <div class="am-field">
                <label>Mode</label>
                <select name="punishmentMode">
                    <option value="fixed" <?php echo ($settings['punishmentMode'] ?? '') === 'fixed' ? 'selected' : ''; ?>>Fixed (Always the same)</option>
                    <option value="escalate" <?php echo ($settings['punishmentMode'] ?? '') === 'escalate' ? 'selected' : ''; ?>>Escalate (Warn -> Timeout -> Kick)</option>
                </select>
            </div>
            <div class="am-grid-2">
                <div class="am-field">
                    <label>Action</label>
                    <select name="punishmentAction">
                        <option value="none" <?php echo ($settings['punishmentAction'] ?? '') === 'none' ? 'selected' : ''; ?>>None</option>
                        <option value="timeout" <?php echo ($settings['punishmentAction'] ?? '') === 'timeout' ? 'selected' : ''; ?>>Timeout</option>
                        <option value="kick" <?php echo ($settings['punishmentAction'] ?? '') === 'kick' ? 'selected' : ''; ?>>Kick</option>
                        <option value="ban" <?php echo ($settings['punishmentAction'] ?? '') === 'ban' ? 'selected' : ''; ?>>Ban</option>
                    </select>
                </div>
                <div class="am-field">
                    <label>At Strikes</label>
                    <input type="number" name="autoPunishStrikes" value="<?php echo esc($settings['autoPunishStrikes'] ?? 3); ?>" min="0">
                </div>
                <div class="am-field">
                    <label>Timeout Minutes</label>
                    <input type="number" name="timeoutMinutes" value="<?php echo esc($settings['timeoutMinutes'] ?? 10); ?>" min="1" max="40320">
                </div>
                <div class="am-field">
                    <label>Caps Min Length</label>
                    <input type="number" name="capsMinLength" value="<?php echo esc($settings['capsMinLength'] ?? 12); ?>" min="8" max="200">
                </div>
            </div>

            <button type="submit" id="automodSaveBtn" class="btn-icon" style="margin-top:0.5rem; justify-content:center; background:var(--primary); color:#fff; border:none; padding:0.7rem;"><span class="i">💾</span> Save AutoMod</button>
        </div>

        <!-- COLUMN 2: FILTERS -->
        <div class="am-card">
            <h2><span class="i">📝</span> Filter Detail</h2>

            <div class="am-rule-row">
                <div class="am-rule-info"><strong>Delete Message</strong><small>Remove blocked messages automatically</small></div>
                <input type="checkbox" name="deleteMessage" <?php echo !array_key_exists('deleteMessage', $settings) || !empty($settings['deleteMessage']) ? 'checked' : ''; ?>>
            </div>
            <div class="am-rule-row">
                <div class="am-rule-info"><strong>Warn User</strong><small>Send a short warning in the channel</small></div>
                <input type="checkbox" name="warnUser" <?php echo !array_key_exists('warnUser', $settings) || !empty($settings['warnUser']) ? 'checked' : ''; ?>>
            </div>
            
            <div class="am-field">
                <label>Blocked Terms (one per line)</label>
                <textarea name="blockedTerms" style="min-height:80px;"><?php echo esc($blockedTermsText); ?></textarea>
                            <div style="font-size:0.73rem; color:var(--text-secondary); display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap; margin-top:0.25rem;">
                                <span><?php echo $currentTerms; ?> / <?php echo $maxTerms < 0 ? '∞' : $maxTerms; ?> Begriffe genutzt</span>
                                <?php if ($atTermsLimit): ?><span class="status-badge warning" style="font-size:0.68rem;">Limit erreicht</span><a href="server-plans.php<?php echo $guildId ? '?guildId=' . urlencode($guildId) : ''; ?>" style="color:#b48af7; font-weight:700; font-size:0.73rem;">💎 Upgrade</a><?php endif; ?>
                            </div>
            </div>

            <div class="am-section-title">Live Test</div>
            <div class="am-field">
                <label>Test Message</label>
                <textarea id="automodTestMessage" style="min-height:90px;" placeholder="Schreibe hier eine Nachricht, um die aktuellen AutoMod-Regeln zu pruefen."></textarea>
            </div>
            <button type="button" id="automodTestBtn" class="btn-icon" style="justify-content:center; background:rgba(88,101,242,.14); border-color:rgba(88,101,242,.4); color:#c7d2fe;"><span class="i">🧪</span> Nachricht testen</button>
            <div id="automodTestResult" class="am-test-result"></div>

            <div class="am-grid-2">
                <label class="am-check" style="justify-content:flex-start;">
                    <input type="checkbox" name="blockedTermsWholeWord" <?php echo !empty($settings['blockedTermsWholeWord']) ? 'checked' : ''; ?>>
                    Match whole words only
                </label>
                <label class="am-check" style="justify-content:flex-start;">
                    <input type="checkbox" name="blockedTermsRegex" <?php echo !empty($settings['blockedTermsRegex']) ? 'checked' : ''; ?>>
                    Treat terms as regex patterns
                </label>
            </div>

            <div class="am-note am-warn">
                Regex mode is for advanced users. Invalid patterns are skipped safely and will never crash the bot.
            </div>

            <div class="am-rule-row" style="padding-top:0.75rem;">
                <div class="am-rule-info"><strong>Blocked Terms Action</strong><small>Action used when blocked terms or regex terms match.</small></div>
                <select class="am-rule-action" name="ruleActions[blocked_term]">
                    <?php $v = $settings['ruleActions']['blocked_term'] ?? 'fallback'; ?>
                    <option value="fallback" <?php echo $v === 'fallback' ? 'selected' : ''; ?>>Use Global</option>
                    <option value="none" <?php echo $v === 'none' ? 'selected' : ''; ?>>None</option>
                    <option value="delete" <?php echo $v === 'delete' ? 'selected' : ''; ?>>Delete</option>
                    <option value="warn" <?php echo $v === 'warn' ? 'selected' : ''; ?>>Warn</option>
                    <option value="timeout" <?php echo $v === 'timeout' ? 'selected' : ''; ?>>Timeout</option>
                    <option value="kick" <?php echo $v === 'kick' ? 'selected' : ''; ?>>Kick</option>
                    <option value="ban" <?php echo $v === 'ban' ? 'selected' : ''; ?>>Ban</option>
                </select>
            </div>

            <div class="am-field">
                <label>Link Whitelist (one per line)</label>
                <textarea name="allowedLinks" style="min-height:80px;"><?php echo esc($allowedLinksText); ?></textarea>
                <small>Links containing these words won't be blocked.</small>
            </div>

            <div class="am-section-title">Logging</div>
            <div class="am-note">
                AutoMod event logs are controlled centrally in <a href="logging.php?guildId=<?php echo urlencode($guildId); ?>">Logging</a>. Enable the AutoMod Hits event there to avoid duplicate module logs.
            </div>

            <div class="am-field">
                <label>Warn Message</label>
                <input type="text" name="warnMessage" value="<?php echo esc($settings['warnMessage'] ?? ''); ?>" placeholder="AutoMod blocked your message: {reason}">
            </div>
        </div>

        <!-- COLUMN 3: BYPASSES -->
        <div class="am-card">
            <h2><span class="i">🏃</span> Advanced · Bypasses</h2>
            
            <div class="am-field">
                <label>Ignored Roles</label>
                <div style="max-height:120px; overflow-y:auto; border:1px solid var(--border-light); padding:0.5rem; border-radius:6px; background:var(--bg-tertiary);">
                    <?php foreach ($roles as $role): ?>
                        <label style="display:flex; align-items:center; gap:0.5rem; font-size:0.8rem; cursor:pointer; margin-bottom:0.2rem;">
                            <input type="checkbox" name="ignoredRoles[]" value="<?php echo esc($role['id']); ?>" <?php echo in_array($role['id'], $settings['ignoredRoles'] ?? []) ? 'checked' : ''; ?>>
                            <?php echo esc($role['name']); ?>
                        </label>
                    <?php endforeach; ?>
                </div>
            </div>

            <div class="am-field">
                <label>Ignored Channels</label>
                <div style="max-height:120px; overflow-y:auto; border:1px solid var(--border-light); padding:0.5rem; border-radius:6px; background:var(--bg-tertiary);">
                    <?php foreach ($channels as $channel): ?>
                        <label style="display:flex; align-items:center; gap:0.5rem; font-size:0.8rem; cursor:pointer; margin-bottom:0.2rem;">
                            <input type="checkbox" name="ignoredChannels[]" value="<?php echo esc($channel['id']); ?>" <?php echo in_array($channel['id'], $settings['ignoredChannels'] ?? []) ? 'checked' : ''; ?>>
                            #<?php echo esc($channel['name']); ?>
                        </label>
                    <?php endforeach; ?>
                </div>
            </div>

            <div class="am-rule-row" style="margin-top:0.5rem; border:none;">
                <div class="am-rule-info"><strong>Exempt Admins</strong><small>Admins bypass AutoMod</small></div>
                <input type="checkbox" name="exemptAdmins" <?php echo !empty($settings['exemptAdmins']) ? 'checked' : ''; ?>>
            </div>

            <div class="am-section-title">Recent Hits</div>
            <div style="border:1px solid var(--border-light); border-radius:8px; background:var(--bg-tertiary); padding:0 0.6rem;">
                <?php if (empty($recentCases)): ?>
                    <p style="font-size:0.8rem; color:var(--text-secondary); margin:0.8rem 0;">No AutoMod hits yet.</p>
                <?php else: ?>
                    <?php foreach ($recentCases as $case): ?>
                        <?php
                            $rawReason = (string)($case['reason'] ?? 'AutoMod hit');
                            $rule = 'unknown';
                            $action = 'unknown';
                            $reason = $rawReason;
                            $channelHint = '';
                            if (preg_match('/Rule:\s*([^|]+)\s*\|\s*Action:\s*([^|]+)\s*\|\s*Reason:\s*([^|]+)\s*\|\s*Channel:\s*([^|]+)\s*\|\s*Message:\s*(.*)$/', $rawReason, $m)) {
                                $rule = trim($m[1]);
                                $action = trim($m[2]);
                                $reason = trim($m[3]);
                                $channelHint = trim($m[4]);
                                $excerpt = trim($m[5]);
                            } else {
                                $excerpt = '';
                            }
                        ?>
                        <div class="am-case">
                            <strong><?php echo esc(strtoupper($rule) . ' · ' . strtoupper($action)); ?></strong>
                            <small><?php echo esc($reason); ?></small>
                            <?php if (!empty($excerpt)): ?><small>"<?php echo esc(strlen($excerpt) > 140 ? substr($excerpt, 0, 137) . '...' : $excerpt); ?>"</small><?php endif; ?>
                            <small>User <?php echo esc($case['userId'] ?? 'unknown'); ?><?php echo $channelHint ? ' · ' . esc($channelHint) : ''; ?> · <?php echo !empty($case['createdAt']) ? date('d.m.Y H:i', (int)($case['createdAt'] / 1000)) : 'unknown time'; ?></small>
                        </div>
                    <?php endforeach; ?>
                <?php endif; ?>
            </div>
        </div>

        <div class="ux-savebar" id="automodSaveBar">
            <div class="ux-save-info">
                <strong>Ungespeicherte Aenderungen</strong>
                <span>Speicher den aktuellen AutoMod-Stand ohne Seiten-Reload.</span>
            </div>
            <div class="ux-save-actions">
                <span class="ux-save-status" id="automodSaveStatus">Bereit</span>
                <button type="submit" id="automodStickySaveBtn" class="btn-icon btn-primary-ui"><span class="i">💾</span> Speichern</button>
            </div>
        </div>
    </form>
<?php endif; ?>

</div>

<script>
const AUTOMOD_PRESETS = {
    relaxed: {
        blockInvites: true, blockLinks: false, blockSpam: false, blockRepeatedText: false,
        blockMassMentions: false, blockCaps: false, deleteMessage: false, warnUser: false,
        mentionLimit: 10, duplicateThreshold: 6, duplicateWindowSeconds: 30, capsPercent: 80, capsMinLength: 16,
        punishmentMode: 'fixed', punishmentAction: 'none', autoPunishStrikes: 0, timeoutMinutes: 5,
    },
    balanced: {
        blockInvites: true, blockLinks: true, blockSpam: true, blockRepeatedText: false,
        blockMassMentions: true, blockCaps: false, deleteMessage: true, warnUser: true,
        mentionLimit: 6, duplicateThreshold: 4, duplicateWindowSeconds: 20, capsPercent: 70, capsMinLength: 12,
        punishmentMode: 'fixed', punishmentAction: 'timeout', autoPunishStrikes: 5, timeoutMinutes: 10,
    },
    strict: {
        blockInvites: true, blockLinks: true, blockSpam: true, blockRepeatedText: true,
        blockMassMentions: true, blockCaps: true, deleteMessage: true, warnUser: true,
        mentionLimit: 3, duplicateThreshold: 3, duplicateWindowSeconds: 15, capsPercent: 60, capsMinLength: 8,
        punishmentMode: 'fixed', punishmentAction: 'timeout', autoPunishStrikes: 3, timeoutMinutes: 30,
    },
};

function applyAutomodPreset(name) {
    const p = AUTOMOD_PRESETS[name];
    if (!p) return;
    const f = document.getElementById('automod-form');
    if (!f) return;

    const setCheck = (n, v) => { const el = f.querySelector(`[name="${n}"]`); if (el) el.checked = !!v; };
    const setVal = (n, v) => { const el = f.querySelector(`[name="${n}"]`); if (el) el.value = v; };

    setCheck('blockInvites', p.blockInvites);
    setCheck('blockLinks', p.blockLinks);
    setCheck('blockSpam', p.blockSpam);
    setCheck('blockRepeatedText', p.blockRepeatedText);
    setCheck('blockMassMentions', p.blockMassMentions);
    setCheck('blockCaps', p.blockCaps);
    setCheck('deleteMessage', p.deleteMessage);
    setCheck('warnUser', p.warnUser);
    setVal('mentionLimit', p.mentionLimit);
    setVal('duplicateThreshold', p.duplicateThreshold);
    setVal('duplicateWindowSeconds', p.duplicateWindowSeconds);
    setVal('capsPercent', p.capsPercent);
    setVal('capsMinLength', p.capsMinLength);
    setVal('punishmentMode', p.punishmentMode);
    setVal('punishmentAction', p.punishmentAction);
    setVal('autoPunishStrikes', p.autoPunishStrikes);
    setVal('timeoutMinutes', p.timeoutMinutes);
}

(function() {
    const form = document.getElementById('automod-form');
    const saveBtn = document.getElementById('automodSaveBtn');
    const stickySaveBtn = document.getElementById('automodStickySaveBtn');
    const saveBar = document.getElementById('automodSaveBar');
    const saveStatus = document.getElementById('automodSaveStatus');
    const testBtn = document.getElementById('automodTestBtn');
    const testMessage = document.getElementById('automodTestMessage');
    const testResult = document.getElementById('automodTestResult');
    if (!form) return;

    let initialState = new URLSearchParams(new FormData(form)).toString();
    let allowUnload = false;

    function currentState() {
        return new URLSearchParams(new FormData(form)).toString();
    }

    function setDirtyUi() {
        const dirty = currentState() !== initialState;
        saveBar?.classList.toggle('is-visible', dirty);
        return dirty;
    }

    function setLoadingState(loading) {
        [saveBtn, stickySaveBtn].forEach((btn) => {
            if (!btn) return;
            btn.disabled = loading;
            btn.innerHTML = loading ? '<span class="i">⏳</span> Speichert...' : '<span class="i">💾</span> Speichern';
        });
    }

    function setStatus(text, type = '') {
        if (!saveStatus) return;
        saveStatus.textContent = text;
        saveStatus.classList.remove('success', 'error');
        if (type) saveStatus.classList.add(type);
    }

    function renderTestResult(payload, fallbackMessage, type = 'info') {
        if (!testResult) return;
        const violations = Array.isArray(payload?.violations) ? payload.violations : [];
        if (!violations.length) {
            testResult.className = `am-test-result ${type}`;
            testResult.innerHTML = `<strong>${fallbackMessage}</strong>`;
            return;
        }
        testResult.className = 'am-test-result success';
        testResult.innerHTML = `<strong>${fallbackMessage}</strong><br>${violations.map((violation) => `• ${violation.reason} → Aktion: ${violation.action || 'none'}`).join('<br>')}`;
    }

    form.addEventListener('input', setDirtyUi);
    form.addEventListener('change', setDirtyUi);

    window.addEventListener('beforeunload', (event) => {
        if (allowUnload || !setDirtyUi()) return;
        event.preventDefault();
        event.returnValue = '';
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        setLoadingState(true);
        setStatus('Speichert...');

        try {
            const response = await fetch(window.location.href, {
                method: 'POST',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json'
                },
                body: new FormData(form),
                credentials: 'same-origin'
            });
            const json = await response.json().catch(() => ({ success: false, message: 'Ungueltige Serverantwort.' }));
            if (!response.ok || !json.success) {
                throw new Error(json.message || 'Speichern fehlgeschlagen.');
            }

            initialState = currentState();
            setStatus('Gespeichert', 'success');
            setDirtyUi();
        } catch (error) {
            setStatus('Fehler', 'error');
            alert(error.message || 'Speichern fehlgeschlagen.');
        } finally {
            setLoadingState(false);
        }
    });

    testBtn?.addEventListener('click', async () => {
        const content = testMessage?.value?.trim() || '';
        if (!content) {
            renderTestResult(null, 'Bitte zuerst eine Test-Nachricht eingeben.', 'error');
            return;
        }

        testBtn.disabled = true;
        testBtn.innerHTML = '<span class="i">⏳</span> Prueft...';
        renderTestResult(null, 'Pruefe aktuelle AutoMod-Regeln...', 'info');

        try {
            const data = new FormData();
            data.set('guildId', '<?php echo esc($guildId); ?>');
            data.set('action', 'test');
            data.set('testMessage', content);
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
                console.error('[Dashboard] Non-JSON response (automod test):', response.status, response.url);
                return { success: false, message: 'Ungueltige Serverantwort.' };
            });
            if (!response.ok || !json.success) {
                throw new Error(json.message || 'AutoMod-Test fehlgeschlagen.');
            }
            renderTestResult(json.data, json.message || 'AutoMod-Test abgeschlossen.', json.data?.blocked ? 'success' : 'info');
        } catch (error) {
            renderTestResult(null, error.message || 'AutoMod-Test fehlgeschlagen.', 'error');
        } finally {
            testBtn.disabled = false;
            testBtn.innerHTML = '<span class="i">🧪</span> Nachricht testen';
        }
    });
})();
</script>

<?php include '../includes/footer.php'; ?>
