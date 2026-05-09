<?php
$page_title = 'Leveling';
require_once __DIR__ . '/../includes/config.php';
requireLogin();

function levelingPageAccessCheck($guildId, $moduleKey = 'leveling') {
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

function levelingPageAccessMessage($reason) {
    if ($reason === 'missing_module_role') return 'Dir fehlt eine freigegebene Dashboard-Rolle fuer dieses Modul.';
    if ($reason === 'admin_role_not_configured') return 'Es ist noch keine Dashboard-Admin-Rolle gesetzt.';
    if ($reason === 'not_guild_admin') return 'Du bist kein Server-Owner/Admin und hast keine freigegebene Dashboard-Rolle.';
    return 'Du hast aktuell keinen Zugriff auf Leveling.';
}

function levelingPct($current, $next) {
    $next = max(1, (int)$next);
    return max(2, min(100, round(((int)$current / $next) * 100)));
}

function levelingXpForLevel($level) {
    $safeLevel = max(0, (int)$level);
    return 100 + $safeLevel * 55 + (int)floor(pow($safeLevel, 1.6) * 20);
}

$guildsRaw = getAPI('/voice/guilds', 8);
$guilds = $guildsRaw['data']['guilds'] ?? [];
$guildId = dashboardSelectedGuildId($guilds);

$moduleAccess = $guildId ? levelingPageAccessCheck($guildId, 'leveling') : ['allowed' => true];
if ($guildId && empty($moduleAccess['allowed'])) {
    $denyLabel = 'Leveling';
    $denyMessage = levelingPageAccessMessage($moduleAccess['reason'] ?? '');
    include '../includes/header.php';
    include '../includes/sidebar.php';
    ?>
    <div class="empty-state" style="max-width:780px; margin:1rem auto; text-align:left;">
        <strong>Kein Zugriff auf <?= esc($denyLabel) ?></strong>
        <p><?= esc($denyMessage) ?></p>
        <p style="color:var(--text-secondary); font-size:.82rem;">Falls du Zugriff brauchst, bitte den Owner um eine freigegebene Dashboard-Rolle fuer dieses Modul.</p>
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
    if ($action === 'auto-create') {
        $result = api('/leveling/' . urlencode($guildId) . '/roles/auto-create', 'POST', [
            'levels' => $_POST['levels'] ?? '5,10,20,30,50',
            'prefix' => $_POST['prefix'] ?? 'Level',
        ], 20);
        if (($result['data']['success'] ?? false) === true) {
            $message = 'Level roles created and configured.';
            $operationSuccess = true;
        } else {
            $messageType = 'error';
            $message = $result['data']['message'] ?? 'Failed to create level roles.';
            $operationSuccess = false;
        }
    } elseif ($action === 'reset-user') {
        $resetUserId = trim($_POST['resetUserId'] ?? '');
        $result = api('/leveling/' . urlencode($guildId) . '/reset/user', 'POST', [
            'userId' => $resetUserId,
        ], 20);
        if (($result['data']['success'] ?? false) === true) {
            $message = 'User XP was reset successfully.';
            $operationSuccess = true;
        } else {
            $messageType = 'error';
            $message = $result['data']['message'] ?? 'Failed to reset user XP.';
            $operationSuccess = false;
        }
    } elseif ($action === 'reset-all') {
        $result = api('/leveling/' . urlencode($guildId) . '/reset/all', 'POST', [
            'confirm' => trim($_POST['resetConfirm'] ?? ''),
        ], 20);
        if (($result['data']['success'] ?? false) === true) {
            $message = 'All server XP data was reset successfully.';
            $operationSuccess = true;
        } else {
            $messageType = 'error';
            $message = $result['data']['message'] ?? 'Failed to reset server XP.';
            $operationSuccess = false;
        }
    } elseif ($action === 'test-xp') {
        $result = api('/leveling/' . urlencode($guildId) . '/test-xp', 'POST', [
            'amount' => intval($_POST['testXpAmount'] ?? 100),
        ], 20);
        if (($result['data']['success'] ?? false) === true) {
            $after = $result['data']['data']['after'] ?? [];
            $message = 'Test-XP vergeben. Neuer Stand: Level ' . (int)($after['level'] ?? 0) . ' / ' . number_format((int)($after['xp'] ?? 0)) . ' XP';
            $operationSuccess = true;
        } else {
            $messageType = 'error';
            $message = $result['data']['message'] ?? 'Failed to grant test XP.';
            $operationSuccess = false;
        }
    } else {
        $rewardLevels = $_POST['rewardLevels'] ?? [];
        $rewardRoleIds = $_POST['rewardRoleIds'] ?? [];
        $roleMultiplierRoleIds = $_POST['roleMultiplierRoleIds'] ?? [];
        $roleMultiplierValues = $_POST['roleMultiplierValues'] ?? [];
        $channelMultiplierChannelIds = $_POST['channelMultiplierChannelIds'] ?? [];
        $channelMultiplierValues = $_POST['channelMultiplierValues'] ?? [];

        $result = api('/leveling/' . urlencode($guildId) . '/settings', 'POST', [
            'messageXpMin' => intval($_POST['messageXpMin'] ?? 15),
            'messageXpMax' => intval($_POST['messageXpMax'] ?? 25),
            'cooldownSeconds' => intval($_POST['cooldownSeconds'] ?? 60),
            'roleMode' => $_POST['roleMode'] ?? 'stack',
            'removeLowerLevelRoles' => isset($_POST['removeLowerLevelRoles']),
            'announceLevelUp' => isset($_POST['announceLevelUp']),
            'announceChannelId' => $_POST['announceChannelId'] ?? '',
            'announceMessage' => $_POST['announceMessage'] ?? '',
            'ignoredRoles' => isset($_POST['ignoredRoles']) ? (array)$_POST['ignoredRoles'] : [],
            'noXpChannels' => isset($_POST['noXpChannels']) ? (array)$_POST['noXpChannels'] : [],
            'rewardLevels' => $rewardLevels,
            'rewardRoleIds' => $rewardRoleIds,
            'roleMultiplierRoleIds' => $roleMultiplierRoleIds,
            'roleMultiplierValues' => $roleMultiplierValues,
            'channelMultiplierChannelIds' => $channelMultiplierChannelIds,
            'channelMultiplierValues' => $channelMultiplierValues,
            'minMessageLength' => intval($_POST['minMessageLength'] ?? 5),
            'blockDuplicateMessages' => isset($_POST['blockDuplicateMessages']),
            'voiceXpEnabled' => isset($_POST['voiceXpEnabled']),
            'voiceXpPerMinute' => intval($_POST['voiceXpPerMinute'] ?? 2),
        ], 15);
        if (($result['data']['success'] ?? false) === true) {
            $message = 'Leveling settings saved.';
            $operationSuccess = true;
        } else {
            $messageType = 'error';
            $message = $result['data']['message'] ?? 'Failed to save leveling settings.';
            $operationSuccess = false;
        }
    }

    if ($isAjaxRequest) {
        $sendJson([
            'success' => $operationSuccess === true,
            'message' => $message,
            'messageType' => $messageType,
        ], $operationSuccess === true ? 200 : 400);
    }
}

$moduleRaw = $guildId ? getAPI('/guilds/' . urlencode($guildId) . '/modules', 10) : null;
$modules = $moduleRaw['data']['modules'] ?? [];
$levelingEnabled = false;
foreach ($modules as $module) {
    if (($module['key'] ?? '') === 'leveling') {
        $levelingEnabled = !empty($module['enabled']);
        break;
    }
}

$levelingRaw = $guildId ? getAPI('/leveling/' . urlencode($guildId) . '/settings', 10) : null;
$data = $levelingRaw['data'] ?? [];
$settings = $data['settings'] ?? [];
$channels = $data['channels'] ?? [];
$rolesList = $data['roles'] ?? [];
$guildName = $data['guildName'] ?? 'Selected server';
$configuredRewards = $settings['roleRewards'] ?? [];
$configuredRoleMultipliers = $settings['roleMultipliers'] ?? [];

$premRaw       = $guildId ? getAPI('/guilds/' . urlencode($guildId) . '/premium', 5) : null;
$maxRewards    = (int)(($premRaw['data']['featureLimits']['levelRewards'] ?? 5));
$atRewardsLimit = $maxRewards >= 0 && count($configuredRewards) >= $maxRewards;
$configuredChannelMultipliers = $settings['channelMultipliers'] ?? [];
$configuredNoXpChannels = $settings['noXpChannels'] ?? ($settings['ignoredChannels'] ?? []);

$page = intval($_GET['page'] ?? 1);
if ($page < 1) $page = 1;
$leaderboardRaw = $guildId ? getAPI('/leveling/' . urlencode($guildId) . '/leaderboard?page=' . $page . '&limit=15', 10) : null;
$leaderboard = $leaderboardRaw['data']['leaderboard'] ?? [];
$totalMembers = $leaderboardRaw['data']['total'] ?? 0;
$totalPages = max(1, (int)($leaderboardRaw['data']['totalPages'] ?? ceil($totalMembers / 15)));
?>

<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.lvl-compact { display: grid; grid-template-columns: 320px 1fr 280px; gap: 1.25rem; align-items: start; margin-bottom: 1.5rem; }
.lvl-card { background: var(--panel); border: 1px solid var(--border-light); border-radius: 12px; padding: 1rem; display: flex; flex-direction: column; gap: 0.8rem; }
.lvl-card h2 { font-size: 1rem; margin: 0; display: flex; align-items: center; gap: 0.5rem; }
.lvl-section-title { font-size: 0.8rem; font-weight: 800; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin: 0.5rem 0 0.2rem; }
.lvl-field { display: grid; gap: 0.3rem; }
.lvl-field label { font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); }
.lvl-field select, .lvl-field textarea, .lvl-field input[type="text"], .lvl-field input[type="number"] { 
    width: 100%; padding: 0.6rem; border-radius: 6px; border: 1px solid var(--border-light); 
    background: var(--bg-tertiary); color: var(--text-primary); font-size: 0.9rem;
}
.lvl-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
.lvl-reward-row { display: grid; grid-template-columns: 80px 1fr 40px; gap: 0.5rem; align-items: center; padding: 0.4rem; background: rgba(0,0,0,0.2); border-radius: 8px; border: 1px solid var(--border-light); }
.lvl-multiplier-row { display: grid; grid-template-columns: 1fr 100px 40px; gap: 0.5rem; align-items: center; padding: 0.4rem; background: rgba(0,0,0,0.2); border-radius: 8px; border: 1px solid var(--border-light); }

.lb-table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
.lb-table th { text-align: left; padding: 0.8rem; font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; }
.lb-table td { padding: 0.8rem; border-top: 1px solid var(--border-light); font-size: 0.9rem; }
.lb-rank { font-weight: 800; color: var(--primary-light); width: 40px; }
.lb-user { display: flex; align-items: center; gap: 0.8rem; }
.lb-avatar { width: 32px; height: 32px; border-radius: 50%; }
.lb-xp-bar { height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden; margin-top: 4px; }
.lb-xp-fill { height: 100%; background: var(--primary); }

@media (max-width: 1200px) { .lvl-compact { grid-template-columns: 1fr 1fr; } }
@media (max-width: 900px) { .lvl-compact { grid-template-columns: 1fr; } }

.alert { padding: 10px; border-radius: 6px; font-size: 0.85rem; margin-bottom: 0.8rem; border-left: 4px solid; }
.alert-success { background: rgba(81,207,102,.1); color: #51cf66; border-color: #51cf66; }
.alert-error { background: rgba(255,107,107,.1); color: #ff6b6b; border-color: #ff6b6b; }
.lvl-toast-wrap { position: fixed; right: 1rem; bottom: 1rem; z-index: 60; display: grid; gap: 0.5rem; }
.lvl-toast { min-width: 260px; max-width: 360px; padding: 0.7rem 0.85rem; border-radius: 8px; border: 1px solid var(--border-light); background: #1f222c; color: #fff; box-shadow: 0 12px 30px rgba(0,0,0,0.28); font-size: 0.84rem; }
.lvl-toast.success { border-color: rgba(81,207,102,.5); color: #8ce99a; }
.lvl-toast.error { border-color: rgba(255,107,107,.5); color: #ff9b9d; }
.lvl-toast.info { border-color: rgba(88,101,242,.45); color: #c7d2fe; }
</style>

<div class="module-page">

<section class="dashboard-page-header">
    <div class="dashboard-page-copy">
        <span class="dashboard-page-eyebrow">Engagement Module</span>
        <h1>Leveling</h1>
        <p>XP, Rewards und Anti-Farm Regeln im konsistenten Save-Workflow.</p>
        <div class="dashboard-page-meta">
            <span class="status-badge <?php echo $levelingEnabled ? 'active' : 'inactive'; ?>"><?php echo $levelingEnabled ? 'Aktiv' : 'Inaktiv'; ?></span>
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

<div id="levelingFeedback" class="alert alert-<?php echo esc($messageType); ?>" style="display:<?php echo $message ? 'block' : 'none'; ?>;"><?php echo esc($message ?: ''); ?></div>

<?php if (!$levelingEnabled): ?>
    <div class="empty-state">
        <strong>Leveling ist deaktiviert</strong>
        <p>Aktiviere zuerst das Modul und starte danach direkt mit XP, Voice XP und Anti-Farm Regeln.</p>
        <a class="btn-icon cta btn-primary-ui" href="modules.php?guildId=<?php echo urlencode($guildId); ?>">Modul aktivieren</a>
    </div>
<?php else: ?>
    <form method="POST" class="lvl-compact" id="levelingSettingsForm">
        <input type="hidden" name="guildId" value="<?php echo esc($guildId); ?>">
        <input type="hidden" name="action" value="save">
        
        <!-- COLUMN 1: XP SETTINGS -->
        <div class="lvl-card">
            <h2><span class="i">⚡</span> XP Settings</h2>
            <div class="lvl-grid-2">
                <div class="lvl-field"><label>Min XP</label><input type="number" name="messageXpMin" value="<?php echo esc($settings['messageXpMin'] ?? 15); ?>"></div>
                <div class="lvl-field"><label>Max XP</label><input type="number" name="messageXpMax" value="<?php echo esc($settings['messageXpMax'] ?? 25); ?>"></div>
            </div>
            <div class="lvl-field">
                <label>Cooldown (Seconds)</label>
                <input type="number" name="cooldownSeconds" value="<?php echo esc($settings['cooldownSeconds'] ?? 60); ?>">
            </div>
            <div class="lvl-section-title">Announcement</div>
            <label style="display:flex; gap:0.5rem; align-items:center; font-size:0.85rem; color:var(--text-secondary);">
                <input type="checkbox" name="announceLevelUp" <?php echo !empty($settings['announceLevelUp']) ? 'checked' : ''; ?>>
                Send level-up messages
            </label>
            <div class="lvl-field">
                <label>Announcement Channel</label>
                <select name="announceChannelId">
                    <option value="">Use message channel</option>
                    <?php foreach ($channels as $channel): ?>
                        <option value="<?php echo esc($channel['id']); ?>" <?php echo ($settings['announceChannelId'] ?? '') === $channel['id'] ? 'selected' : ''; ?>>
                            #<?php echo esc($channel['name']); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="lvl-field">
                <label>Level-Up Message</label>
                <textarea name="announceMessage" style="min-height:60px;"><?php echo esc($settings['announceMessage'] ?? 'GG {user}, you reached level **{level}**!'); ?></textarea>
                <small style="font-size:0.7rem;">Leave empty for default. Use {user}, {level}.</small>
            </div>
            <div class="lvl-section-title">Anti-Farm</div>
            <div class="lvl-field">
                <label>Min Message Length</label>
                <input type="number" name="minMessageLength" value="<?php echo esc($settings['minMessageLength'] ?? 5); ?>" min="1" max="100">
                <small style="font-size:0.7rem;">Messages shorter than this gain no XP.</small>
            </div>
            <label style="display:flex; gap:0.5rem; align-items:center; font-size:0.85rem; color:var(--text-secondary);">
                <input type="checkbox" name="blockDuplicateMessages" <?php echo ($settings['blockDuplicateMessages'] ?? true) ? 'checked' : ''; ?>>
                Block duplicate messages (3+ same in 60s &rarr; no XP)
            </label>
            <div class="lvl-section-title">Voice XP</div>
            <label style="display:flex; gap:0.5rem; align-items:center; font-size:0.85rem; color:var(--text-secondary);">
                <input type="checkbox" name="voiceXpEnabled" <?php echo !empty($settings['voiceXpEnabled']) ? 'checked' : ''; ?>>
                Enable Voice XP
            </label>
            <div class="lvl-field">
                <label>Voice XP per Minute</label>
                <input type="number" name="voiceXpPerMinute" value="<?php echo esc($settings['voiceXpPerMinute'] ?? 2); ?>" min="1" max="100">
                <small style="font-size:0.7rem;">XP per minute in voice (&ge;2 members, not muted).</small>
            </div>
            <div class="lvl-section-title">Live Test</div>
            <div class="lvl-field">
                <label>Test XP Amount</label>
                <input type="number" id="levelingTestAmount" min="1" max="1000" value="100">
                <small style="font-size:0.7rem;">Vergibt Test-XP an deinen eigenen Dashboard-Account.</small>
            </div>
            <button type="button" id="levelingTestBtn" class="btn-icon" style="justify-content:center; background:rgba(88,101,242,.14); border:1px solid rgba(88,101,242,.4); color:#c7d2fe;"><span class="i">🧪</span> +XP testen</button>
            <button type="submit" id="levelingSaveBtn" class="btn-icon" style="margin-top:0.5rem; justify-content:center; background:var(--primary); color:#fff; border:none; padding:0.7rem;"><span class="i">💾</span> Save Settings</button>
        </div>

        <!-- COLUMN 2: ROLE REWARDS -->
        <div class="lvl-card">
            <h2><span class="i">🏆</span> Role Rewards</h2>
            <div class="lvl-field">
                <label>Reward Mode</label>
                <select name="roleMode">
                    <option value="stack" <?php echo ($settings['roleMode'] ?? '') === 'stack' ? 'selected' : ''; ?>>Stack Roles (Keep all)</option>
                    <option value="highest" <?php echo ($settings['roleMode'] ?? '') === 'highest' ? 'selected' : ''; ?>>Highest Only (Remove old)</option>
                </select>
            </div>
            
            <div id="rewardList" style="display:grid; gap:0.5rem; margin-top:0.5rem;">
                <?php 
                $rewards = count($configuredRewards) > 0 ? $configuredRewards : [['level' => '', 'roleId' => '']];
                foreach ($rewards as $index => $reward): 
                ?>
                    <div class="lvl-reward-row">
                        <input type="number" name="rewardLevels[]" value="<?php echo esc($reward['level']); ?>" placeholder="Lvl">
                        <select name="rewardRoleIds[]">
                            <option value="">- Role -</option>
                            <?php foreach ($rolesList as $role): ?>
                                <option value="<?php echo esc($role['id']); ?>" <?php echo $reward['roleId'] === $role['id'] ? 'selected' : ''; ?>>
                                    <?php echo esc($role['name']); ?>
                                </option>
                            <?php endforeach; ?>
                        </select>
                        <button type="button" onclick="this.parentElement.remove()" style="background:transparent; border:none; color:#ff6b6b; cursor:pointer;">✕</button>
                    </div>
                <?php endforeach; ?>
            </div>
            <div style="font-size:0.73rem; color:var(--text-secondary); display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                <span><?php echo count($configuredRewards); ?> / <?php echo $maxRewards < 0 ? '∞' : $maxRewards; ?> Rewards genutzt</span>
                <?php if ($atRewardsLimit): ?><span class="status-badge warning" style="font-size:0.68rem;">Limit erreicht</span><a href="server-plans.php<?php echo $guildId ? '?guildId=' . urlencode($guildId) : ''; ?>" style="color:#b48af7; font-weight:700; font-size:0.73rem;">💎 Upgrade</a><?php endif; ?>
            </div>
            <?php if ($atRewardsLimit): ?>
            <button type="button" class="btn-icon" disabled style="font-size:0.8rem; background:rgba(255,255,255,0.02); border:1px dashed var(--border-light); opacity:0.45; cursor:not-allowed;"><span class="i">➕</span> Add Reward</button>
            <?php else: ?>
            <button type="button" onclick="addRewardRow()" class="btn-icon" style="font-size:0.8rem; background:rgba(255,255,255,0.05); border:1px dashed var(--border-light);"><span class="i">➕</span> Add Reward</button>
            <?php endif; ?>
        </div>

        <!-- COLUMN 3: BYPASSES -->
        <div class="lvl-card">
            <h2><span class="i">🏃</span> Advanced · Bypasses</h2>
            <div class="lvl-field">
                <label>Ignored Roles</label>
                <div style="max-height:120px; overflow-y:auto; border:1px solid var(--border-light); padding:0.5rem; border-radius:6px; background:var(--bg-tertiary);">
                    <?php foreach ($rolesList as $role): ?>
                        <label style="display:flex; align-items:center; gap:0.5rem; font-size:0.8rem; cursor:pointer; margin-bottom:0.2rem;">
                            <input type="checkbox" name="ignoredRoles[]" value="<?php echo esc($role['id']); ?>" <?php echo in_array($role['id'], $settings['ignoredRoles'] ?? []) ? 'checked' : ''; ?>>
                            <?php echo esc($role['name']); ?>
                        </label>
                    <?php endforeach; ?>
                </div>
            </div>
            <div class="lvl-field">
                <label>Ignored Channels</label>
                <div style="max-height:120px; overflow-y:auto; border:1px solid var(--border-light); padding:0.5rem; border-radius:6px; background:var(--bg-tertiary);">
                    <?php foreach ($channels as $channel): ?>
                        <label style="display:flex; align-items:center; gap:0.5rem; font-size:0.8rem; cursor:pointer; margin-bottom:0.2rem;">
                            <input type="checkbox" name="noXpChannels[]" value="<?php echo esc($channel['id']); ?>" <?php echo in_array($channel['id'], $configuredNoXpChannels ?? []) ? 'checked' : ''; ?>>
                            #<?php echo esc($channel['name']); ?>
                        </label>
                    <?php endforeach; ?>
                </div>
                <small style="font-size:0.7rem; color:var(--text-secondary);">No-XP channels never grant XP.</small>
            </div>
            <div class="lvl-section-title">XP Multipliers</div>
            <div class="lvl-field">
                <label>Role Multipliers</label>
                <div id="roleMultiplierList" style="display:grid; gap:0.5rem;">
                    <?php $roleMultiplierRows = count($configuredRoleMultipliers) ? $configuredRoleMultipliers : [['roleId' => '', 'multiplier' => '1.00']]; ?>
                    <?php foreach ($roleMultiplierRows as $row): ?>
                        <div class="lvl-multiplier-row">
                            <select name="roleMultiplierRoleIds[]">
                                <option value="">- Role -</option>
                                <?php foreach ($rolesList as $role): ?>
                                    <option value="<?php echo esc($role['id']); ?>" <?php echo ($row['roleId'] ?? '') === $role['id'] ? 'selected' : ''; ?>>
                                        <?php echo esc($role['name']); ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                            <input type="number" step="0.1" min="0" max="5" name="roleMultiplierValues[]" value="<?php echo esc($row['multiplier'] ?? '1.00'); ?>">
                            <button type="button" onclick="this.parentElement.remove()" style="background:transparent; border:none; color:#ff6b6b; cursor:pointer;">✕</button>
                        </div>
                    <?php endforeach; ?>
                </div>
                <button type="button" onclick="addRoleMultiplierRow()" class="btn-icon" style="font-size:0.8rem; background:rgba(255,255,255,0.05); border:1px dashed var(--border-light);"><span class="i">➕</span> Add Role Multiplier</button>
            </div>
            <div class="lvl-field">
                <label>Channel Multipliers (Optional)</label>
                <div id="channelMultiplierList" style="display:grid; gap:0.5rem;">
                    <?php $channelMultiplierRows = count($configuredChannelMultipliers) ? $configuredChannelMultipliers : [['channelId' => '', 'multiplier' => '1.00']]; ?>
                    <?php foreach ($channelMultiplierRows as $row): ?>
                        <div class="lvl-multiplier-row">
                            <select name="channelMultiplierChannelIds[]">
                                <option value="">- Channel -</option>
                                <?php foreach ($channels as $channel): ?>
                                    <option value="<?php echo esc($channel['id']); ?>" <?php echo ($row['channelId'] ?? '') === $channel['id'] ? 'selected' : ''; ?>>
                                        #<?php echo esc($channel['name']); ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                            <input type="number" step="0.1" min="0" max="5" name="channelMultiplierValues[]" value="<?php echo esc($row['multiplier'] ?? '1.00'); ?>">
                            <button type="button" onclick="this.parentElement.remove()" style="background:transparent; border:none; color:#ff6b6b; cursor:pointer;">✕</button>
                        </div>
                    <?php endforeach; ?>
                </div>
                <button type="button" onclick="addChannelMultiplierRow()" class="btn-icon" style="font-size:0.8rem; background:rgba(255,255,255,0.05); border:1px dashed var(--border-light);"><span class="i">➕</span> Add Channel Multiplier</button>
            </div>
            <div class="lvl-section-title">Bulk Actions</div>
            <button type="button" onclick="document.getElementById('autoCreateModal').style.display='flex'" class="btn-icon" style="font-size:0.8rem; background:rgba(88,101,242,0.1); border:1px solid #5865f2; color:#5865f2;"><span class="i">🪄</span> Auto-Create Roles</button>
            <div class="lvl-section-title">XP Reset</div>
            <div style="display:grid; gap:0.5rem;">
                <input type="text" id="resetUserIdInput" name="resetUserId" placeholder="User ID for XP reset">
                <button type="submit" name="action" value="reset-user" class="btn-icon" onclick="if(!document.getElementById('resetUserIdInput').value.trim()){alert('Please enter a User ID.');return false;}" style="font-size:0.8rem; background:rgba(255,165,0,.15); border:1px solid rgba(255,165,0,.4); color:#ffc36b;">Reset User XP</button>
            </div>
            <div style="display:grid; gap:0.5rem; margin-top:0.4rem;">
                <input type="text" name="resetConfirm" placeholder="Type: RESET <?php echo esc($guildId); ?>">
                <button type="submit" name="action" value="reset-all" class="btn-icon" onclick="return confirm('Reset all XP data for this server? This cannot be undone.');" style="font-size:0.8rem; background:rgba(242,63,67,.15); border:1px solid rgba(242,63,67,.45); color:#ff9b9d;">Reset All Server XP</button>
            </div>
        </div>

        <div class="ux-savebar" id="levelingSaveBar">
            <div class="ux-save-info">
                <strong>Ungespeicherte Aenderungen</strong>
                <span>Leveling-Konfiguration wird per AJAX gespeichert.</span>
            </div>
            <div class="ux-save-actions">
                <span class="ux-save-status" id="levelingSaveStatus">Bereit</span>
                <button type="submit" id="levelingStickySaveBtn" class="btn-icon btn-primary-ui"><span class="i">💾</span> Speichern</button>
            </div>
        </div>
    </form>

    <!-- LEADERBOARD -->
    <div class="lvl-card">
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <h2><span class="i">📊</span> Global Leaderboard</h2>
            <div style="font-size:0.8rem; color:var(--text-secondary);"><?php echo number_format($totalMembers); ?> total members tracked</div>
        </div>
        <div class="dashboard-table-wrap">
        <table class="lb-table">
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>User</th>
                    <th>Level</th>
                    <th style="width:200px;">Progress</th>
                    <th style="text-align:right;">XP</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($leaderboard as $index => $user): 
                    $rank = $user['rank'] ?? ((($page - 1) * 15) + $index + 1);
                    $currentXp = (int)($user['currentXp'] ?? 0);
                    $xpNext = (int)($user['nextLevelXp'] ?? levelingXpForLevel($user['level'] ?? 0));
                    $totalXp = (int)($user['xp'] ?? 0);
                    $pct = levelingPct($currentXp, $xpNext);
                ?>
                    <tr>
                        <td class="lb-rank">#<?php echo $rank; ?></td>
                        <td>
                            <div class="lb-user">
                                <img src="<?php echo $user['avatar'] ?: 'https://cdn.discordapp.com/embed/avatars/0.png'; ?>" class="lb-avatar">
                                <div>
                                    <strong style="display:block;"><?php echo esc($user['displayName'] ?? $user['username']); ?></strong>
                                    <small style="color:var(--text-secondary); font-size:0.7rem;">ID: <?php echo esc($user['userId']); ?></small>
                                </div>
                            </div>
                        </td>
                        <td style="font-weight:700;">Lvl <?php echo esc($user['level']); ?></td>
                        <td>
                            <div style="font-size:0.7rem; display:flex; justify-content:space-between; margin-bottom:2px;">
                                <span><?php echo $pct; ?>%</span>
                                <span><?php echo number_format($currentXp); ?> / <?php echo number_format($xpNext); ?></span>
                            </div>
                            <div class="lb-xp-bar"><div class="lb-xp-fill" style="width:<?php echo $pct; ?>%;"></div></div>
                        </td>
                        <td style="text-align:right; color:var(--text-secondary);"><?php echo number_format($totalXp); ?></td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
        </div>
        
        <?php if ($totalPages > 1): ?>
            <div style="display:flex; justify-content:center; gap:0.5rem; margin-top:1rem;">
                <?php if ($page > 1): ?><a href="?guildId=<?php echo $guildId; ?>&page=<?php echo $page-1; ?>" class="btn-icon" style="padding:0.4rem 0.8rem;">« Prev</a><?php endif; ?>
                <span style="padding:0.4rem 1rem; background:rgba(0,0,0,0.2); border-radius:8px; font-size:0.9rem;">Page <?php echo $page; ?> of <?php echo $totalPages; ?></span>
                <?php if ($page < $totalPages): ?><a href="?guildId=<?php echo $guildId; ?>&page=<?php echo $page+1; ?>" class="btn-icon" style="padding:0.4rem 0.8rem;">Next »</a><?php endif; ?>
            </div>
        <?php endif; ?>
    </div>
<?php endif; ?>

</div>

<!-- MODAL: AUTO-CREATE -->
<div id="autoCreateModal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:1000; align-items:center; justify-content:center; padding:1rem;">
    <div class="lvl-card" style="max-width:400px; width:100%;">
        <h2>🪄 Auto-Create Roles</h2>
        <p style="font-size:0.9rem; color:var(--text-secondary);">This will create new roles for the specified levels (if they don't exist) and link them.</p>
        <form method="POST">
            <input type="hidden" name="guildId" value="<?php echo esc($guildId); ?>">
            <input type="hidden" name="action" value="auto-create">
            <div class="lvl-field">
                <label>Comma separated levels</label>
                <input type="text" name="levels" value="5,10,20,30,50,100">
            </div>
            <div class="lvl-field" style="margin-top:0.75rem;">
                <label>Role prefix</label>
                <input type="text" name="prefix" value="<?php echo esc($settings['autoRolePrefix'] ?? 'Level'); ?>">
            </div>
            <div style="display:flex; gap:0.5rem; margin-top:1rem;">
                <button type="submit" class="btn-icon" style="flex:1; background:#5865f2; color:#fff; border:none; padding:0.6rem;">Create Roles</button>
                <button type="button" onclick="document.getElementById('autoCreateModal').style.display='none'" class="btn-icon" style="flex:1; background:transparent; border:1px solid var(--border-light); padding:0.6rem;">Cancel</button>
            </div>
        </form>
    </div>
</div>

<script>
function addRewardRow() {
    const list = document.getElementById('rewardList');
    const div = document.createElement('div');
    div.className = 'lvl-reward-row';
    div.innerHTML = `
        <input type="number" name="rewardLevels[]" placeholder="Lvl">
        <select name="rewardRoleIds[]">
            <option value="">- Role -</option>
            <?php foreach ($rolesList as $role): ?>
                <option value="<?php echo esc($role['id']); ?>"><?php echo esc($role['name']); ?></option>
            <?php endforeach; ?>
        </select>
        <button type="button" onclick="this.parentElement.remove()" style="background:transparent; border:none; color:#ff6b6b; cursor:pointer;">✕</button>
    `;
    list.appendChild(div);
}

function addRoleMultiplierRow() {
    const list = document.getElementById('roleMultiplierList');
    const div = document.createElement('div');
    div.className = 'lvl-multiplier-row';
    div.innerHTML = `
        <select name="roleMultiplierRoleIds[]">
            <option value="">- Role -</option>
            <?php foreach ($rolesList as $role): ?>
                <option value="<?php echo esc($role['id']); ?>"><?php echo esc($role['name']); ?></option>
            <?php endforeach; ?>
        </select>
        <input type="number" step="0.1" min="0" max="5" name="roleMultiplierValues[]" value="1.0">
        <button type="button" onclick="this.parentElement.remove()" style="background:transparent; border:none; color:#ff6b6b; cursor:pointer;">✕</button>
    `;
    list.appendChild(div);
}

function addChannelMultiplierRow() {
    const list = document.getElementById('channelMultiplierList');
    const div = document.createElement('div');
    div.className = 'lvl-multiplier-row';
    div.innerHTML = `
        <select name="channelMultiplierChannelIds[]">
            <option value="">- Channel -</option>
            <?php foreach ($channels as $channel): ?>
                <option value="<?php echo esc($channel['id']); ?>">#<?php echo esc($channel['name']); ?></option>
            <?php endforeach; ?>
        </select>
        <input type="number" step="0.1" min="0" max="5" name="channelMultiplierValues[]" value="1.0">
        <button type="button" onclick="this.parentElement.remove()" style="background:transparent; border:none; color:#ff6b6b; cursor:pointer;">✕</button>
    `;
    list.appendChild(div);
}

(function() {
    const form = document.getElementById('levelingSettingsForm');
    const feedback = document.getElementById('levelingFeedback');
    const saveBtn = document.getElementById('levelingSaveBtn');
    const stickySaveBtn = document.getElementById('levelingStickySaveBtn');
    const saveBar = document.getElementById('levelingSaveBar');
    const saveStatus = document.getElementById('levelingSaveStatus');
    const testBtn = document.getElementById('levelingTestBtn');
    const testAmount = document.getElementById('levelingTestAmount');
    if (!form) return;

    let isDirty = false;
    let initialState = new URLSearchParams(new FormData(form)).toString();
    let allowUnload = false;

    function showFeedback(type, message) {
        if (feedback) {
            feedback.className = `alert alert-${type === 'success' ? 'success' : 'error'}`;
            feedback.textContent = message;
            feedback.style.display = 'block';
        }

        let wrap = document.querySelector('.lvl-toast-wrap');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.className = 'lvl-toast-wrap';
            document.body.appendChild(wrap);
        }
        const toast = document.createElement('div');
        toast.className = `lvl-toast ${type}`;
        toast.textContent = message;
        wrap.appendChild(toast);
        setTimeout(() => toast.remove(), 3200);
    }

    function markDirty() {
        isDirty = true;
        saveBar?.classList.add('is-visible');
    }

    function currentState() {
        const data = new FormData(form);
        data.set('action', 'save');
        return new URLSearchParams(data).toString();
    }

    function syncSaveBar() {
        const dirty = currentState() !== initialState;
        isDirty = dirty;
        saveBar?.classList.toggle('is-visible', dirty);
    }

    function setSaveStatus(text, type = '') {
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

    form.addEventListener('input', markDirty);
    form.addEventListener('change', markDirty);

    window.addEventListener('beforeunload', (event) => {
        if (allowUnload || !isDirty) return;
        event.preventDefault();
        event.returnValue = '';
    });

    form.addEventListener('submit', async (event) => {
        const submitter = event.submitter;
        const action = submitter?.value || form.querySelector('input[name="action"]')?.value || 'save';
        if (submitter?.name === 'action' && action !== 'save') {
            isDirty = false;
            allowUnload = true;
            return;
        }

        event.preventDefault();
        setSaveLoading(true);
        setSaveStatus('Speichert...');

        try {
            const fd = new FormData(form);
            fd.set('action', 'save');
            const response = await fetch(window.location.href, {
                method: 'POST',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json'
                },
                body: fd,
                credentials: 'same-origin'
            });

            const json = await response.json().catch(() => ({ success: false, message: 'Ungueltige Serverantwort.' }));
            if (!response.ok || !json.success) {
                throw new Error(json.message || 'Speichern fehlgeschlagen.');
            }

            initialState = currentState();
            isDirty = false;
            allowUnload = false;
            syncSaveBar();
            showFeedback('success', json.message || 'Leveling-Einstellungen gespeichert.');
            setSaveStatus('Gespeichert', 'success');
        } catch (error) {
            showFeedback('error', error.message || 'Speichern fehlgeschlagen.');
            setSaveStatus('Fehler', 'error');
        } finally {
            setSaveLoading(false);
        }
    });

    testBtn?.addEventListener('click', async () => {
        const amount = Math.max(1, Math.min(1000, Number(testAmount?.value) || 100));
        testBtn.disabled = true;
        testBtn.innerHTML = '<span class="i">⏳</span> Vergibt...';
        showFeedback('info', `Vergibt +${amount} Test-XP...`);

        try {
            const data = new FormData();
            data.set('guildId', '<?php echo esc($guildId); ?>');
            data.set('action', 'test-xp');
            data.set('testXpAmount', String(amount));
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
                console.error('[Dashboard] Non-JSON response (leveling test):', response.status, response.url);
                return { success: false, message: 'Ungueltige Serverantwort.' };
            });
            if (!response.ok || !json.success) {
                throw new Error(json.message || 'Test-XP fehlgeschlagen.');
            }

            showFeedback('success', json.message || `+${amount} XP vergeben.`);
        } catch (error) {
            showFeedback('error', error.message || 'Test-XP fehlgeschlagen.');
        } finally {
            testBtn.disabled = false;
            testBtn.innerHTML = '<span class="i">🧪</span> +XP testen';
        }
    });

    syncSaveBar();
})();
</script>

<?php include '../includes/footer.php'; ?>
