<?php
$page_title = 'Modules';
require_once __DIR__ . '/../includes/config.php';
requireLogin();

function modulesPageAccessCheck($guildId, $moduleKey = 'stats') {
    $guildId = trim((string)$guildId);
    $moduleKey = trim((string)$moduleKey);

    if ($guildId === '' || $moduleKey === '') {
        return ['allowed' => false, 'reason' => 'missing_context'];
    }

    if (isAdmin()) {
        return ['allowed' => true, 'reason' => 'owner_admin_mode'];
    }

    $response = getAPI('/guilds/' . urlencode($guildId) . '/dashboard-access?module=' . urlencode($moduleKey), 8);
    if (($response['success'] ?? false) === true) {
        return [
            'allowed' => !empty($response['data']['allowed']),
            'reason' => $response['data']['reason'] ?? null,
        ];
    }

    if (isServerAdmin($guildId)) {
        return ['allowed' => true, 'reason' => 'fallback_server_admin'];
    }

    return ['allowed' => false, 'reason' => $response['error'] ?? 'access_check_failed'];
}

function modulesPageAccessMessage($reason) {
    if ($reason === 'missing_module_role') return 'Dir fehlt eine freigegebene Dashboard-Rolle fuer dieses Modul.';
    if ($reason === 'admin_role_not_configured') return 'Es ist noch keine Dashboard-Admin-Rolle gesetzt.';
    if ($reason === 'not_guild_admin') return 'Du bist kein Server-Owner/Admin und hast keine freigegebene Dashboard-Rolle.';
    if ($reason === 'missing_actor') return 'Dein Dashboard-Login konnte nicht korrekt verifiziert werden.';
    if ($reason === 'guild_not_found') return 'Der Server wurde nicht gefunden oder der Bot ist dort nicht mehr vorhanden.';
    return 'Du hast aktuell keinen Zugriff auf Stats.';
}

$guildsRaw = getAPI('/voice/guilds', 8);
$guilds = $guildsRaw['data']['guilds'] ?? [];
$guildId = dashboardSelectedGuildId($guilds);

$moduleAccess = $guildId ? modulesPageAccessCheck($guildId, 'stats') : ['allowed' => true];
if ($guildId && empty($moduleAccess['allowed'])) {
    $denyLabel = 'Stats';
    $denyMessage = modulesPageAccessMessage($moduleAccess['reason'] ?? '');
    include '../includes/header.php';
    include '../includes/sidebar.php';
    ?>
    <div class="empty-state" style="max-width:780px; margin:1rem auto; text-align:left;">
        <strong>Kein Zugriff auf <?= esc($denyLabel) ?></strong>
        <p><?= esc($denyMessage) ?></p>
        <p style="color:var(--text-secondary); font-size:.82rem;">Bitte wende dich an den Server-Owner oder einen Discord-Administrator, um eine passende Dashboard-Rolle zu erhalten.</p>
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
    if (($_POST['action'] ?? '') === 'enable_core') {
        $coreKeys = ['welcome', 'logging', 'tickets'];
        $enabledNow = 0;
        foreach ($coreKeys as $coreKey) {
            $result = api('/guilds/' . urlencode($guildId) . '/modules', 'POST', [
                'module' => $coreKey,
                'enabled' => true,
            ], 15);
            if (($result['data']['success'] ?? false) === true) {
                $enabledNow++;
            }
        }

        if ($enabledNow > 0) {
            $message = 'Core setup applied: ' . $enabledNow . ' modules enabled.';
            $operationSuccess = true;
        } else {
            $messageType = 'error';
            $message = 'Core setup could not be applied right now.';
            $operationSuccess = false;
        }
    } else {
        $module = trim($_POST['module'] ?? '');
        $enabled = ($_POST['enabled'] ?? '') === '1';
        $result = api('/guilds/' . urlencode($guildId) . '/modules', 'POST', [
            'module' => $module,
            'enabled' => $enabled,
        ], 15);

        if (($result['data']['success'] ?? false) === true) {
            $message = 'Module updated.';
            $operationSuccess = true;
        } else {
            $messageType = 'error';
            $message = $result['data']['message'] ?? 'Module update failed.';
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

$moduleRaw = $guildId ? getAPI('/guilds/' . urlencode($guildId) . '/modules', 12) : null;
$moduleData = $moduleRaw['data'] ?? [];
$modules = $moduleData['modules'] ?? [];
$guildName = $moduleData['guildName'] ?? 'Selected server';

$moduleMeta = [
    'moderation'    => ['category' => 'Moderation', 'path' => 'moderation.php',     'accent' => '#f23f43', 'gate' => 'free'],
    'automod'       => ['category' => 'Moderation', 'path' => 'automod.php',         'accent' => '#f97316', 'gate' => 'free'],
    'logging'       => ['category' => 'Moderation', 'path' => 'logging.php',         'accent' => '#7c83ff', 'gate' => 'free'],
    'welcome'       => ['category' => 'Community',  'path' => 'welcome.php',         'accent' => '#23a559', 'gate' => 'free'],
    'reactionRoles' => ['category' => 'Community',  'path' => 'reaction-roles.php',  'accent' => '#a855f7', 'gate' => 'free'],
    'tempVoice'     => ['category' => 'Community',  'path' => 'temp-voice.php',      'accent' => '#38bdf8', 'gate' => 'premium'],
    'social'        => ['category' => 'Community',  'path' => 'social.php',          'accent' => '#f43f5e', 'gate' => 'premium'],
    'leveling'      => ['category' => 'Engagement', 'path' => 'leveling.php',        'accent' => '#5865f2', 'gate' => 'free'],
    'tickets'       => ['category' => 'Support',    'path' => 'tickets.php',         'accent' => '#f0b232', 'gate' => 'free'],
    'rewards'       => ['category' => 'Rewards',    'path' => 'rewards-hub.php',     'accent' => '#23a559', 'gate' => 'coming'],
    'fun'           => ['category' => 'Fun',        'path' => 'fun-hub.php',         'accent' => '#ec4899', 'gate' => 'free'],
];

$coreKeys = ['welcome', 'logging', 'tickets'];
$coreLookup = array_fill_keys($coreKeys, true);
$activeCount = count(array_filter($modules, fn($m) => !empty($m['enabled'])));
$coreActiveCount = 0;
$categoryCounts = [];

foreach ($modules as $module) {
    $key = $module['key'] ?? '';
    if (!empty($module['enabled']) && isset($coreLookup[$key])) {
        $coreActiveCount++;
    }
    $cat = $moduleMeta[$key]['category'] ?? 'Other';
    $categoryCounts[$cat] = ($categoryCounts[$cat] ?? 0) + 1;
}

ksort($categoryCounts);
$isStarterServer = $activeCount < 4;

// Health check: detect enabled-but-unconfigured modules
$healthIssueKeys = [];
if ($guildId) {
    $healthRaw = getAPI('/guilds/' . urlencode($guildId) . '/setup-health', 6);
    foreach ($healthRaw['data']['issues'] ?? [] as $issue) {
        $k = $issue['key'] ?? '';
        // Map issue keys to module keys
        if (str_contains($k, 'welcome')) $healthIssueKeys['welcome'] = $issue['hint'] ?? 'Nicht vollständig konfiguriert.';
        elseif (str_contains($k, 'logging')) $healthIssueKeys['logging'] = $issue['hint'] ?? 'Nicht vollständig konfiguriert.';
        elseif (str_contains($k, 'ticket')) $healthIssueKeys['tickets'] = $issue['hint'] ?? 'Nicht vollständig konfiguriert.';
    }
}

// Guild premium status (soft-gate labels)
$guildPremium = [];
$guildTier    = 'free';
if ($guildId) {
    $premRaw      = getAPI('/guilds/' . urlencode($guildId) . '/premium', 5);
    $guildPremium = $premRaw['data'] ?? [];
    $guildTier    = $guildPremium['tier'] ?? 'free';
}
$tierOrder = ['free' => 0, 'basic' => 1, 'pro' => 2];
$currentTierLevel = $tierOrder[$guildTier] ?? 0;

// Gate labels for the UI
$gateLabels = [
    'free'    => ['label' => '🆓 Free',    'class' => 'md-gate-free'],
    'premium' => ['label' => '💎 Premium', 'class' => 'md-gate-premium'],
    'coming'  => ['label' => '🔜 Bald',    'class' => 'md-gate-coming'],
];
// Map gate tier to minimum tier level required
$gateTierLevel = ['free' => 0, 'premium' => 1, 'coming' => 99];
?>

<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.md-shell { display: flex; flex-direction: column; gap: 1rem; }

.md-hero {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    background: linear-gradient(135deg, rgba(102,126,234,0.18), rgba(26,31,46,0.94));
    border: 1px solid var(--border-light);
    border-radius: 14px;
    padding: 1.1rem;
}
.md-hero h1 { margin: 0; font-size: 1.35rem; }
.md-hero p { margin: 0.25rem 0 0; color: var(--text-secondary); font-size: 0.88rem; }
.md-hero-controls { display: flex; gap: 0.55rem; align-items: center; }
.md-select {
    padding: 0.55rem 0.7rem;
    border-radius: 8px;
    background: var(--bg-tertiary);
    color: #fff;
    border: 1px solid var(--border-light);
}

.md-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.65rem; }
.md-stat {
    background: var(--panel);
    border: 1px solid var(--border-light);
    border-radius: 12px;
    padding: 0.75rem;
}
.md-stat-k {
    font-size: 0.73rem;
    font-weight: 800;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
}
.md-stat-v { font-size: 1.15rem; font-weight: 900; margin-top: 0.2rem; }

.md-onboard {
    background: rgba(24, 32, 40, 0.92);
    border: 1px solid rgba(81,207,102,0.22);
    border-radius: 12px;
    padding: 0.8rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
}
.md-onboard-title { font-size: 0.95rem; font-weight: 900; }
.md-onboard-copy { color: var(--text-secondary); font-size: 0.82rem; margin-top: 0.2rem; }

.md-filters {
    background: var(--panel);
    border: 1px solid var(--border-light);
    border-radius: 12px;
    padding: 0.8rem;
    display: grid;
    gap: 0.6rem;
}
.md-filter-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
}
.md-chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
}
.md-chip {
    border: 1px solid var(--border-light);
    background: rgba(255,255,255,0.03);
    color: var(--text-secondary);
    border-radius: 999px;
    padding: 0.32rem 0.58rem;
    font-size: 0.72rem;
    font-weight: 800;
    cursor: pointer;
}
.md-chip.active { color: #fff; border-color: var(--primary); background: rgba(102,126,234,0.16); }
.md-search {
    min-width: 260px;
    padding: 0.45rem 0.65rem;
    border-radius: 8px;
    border: 1px solid var(--border-light);
    background: var(--bg-tertiary);
    color: #fff;
}

.md-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 0.75rem; }
.md-tile {
    background: var(--panel);
    border: 1px solid var(--border-light);
    border-radius: 12px;
    padding: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    position: relative;
    overflow: hidden;
}
.md-tile::after {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    background: var(--accent);
    opacity: 0.85;
}
.md-tile.disabled { opacity: 0.75; }
.md-tile-top { display: flex; justify-content: space-between; align-items: flex-start; }
.md-tile-title { display: flex; gap: 0.7rem; align-items: center; min-width: 0; }
.md-tile-icon {
    width: 36px;
    height: 36px;
    border-radius: 9px;
    background: var(--bg-tertiary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    border: 1px solid var(--border-light);
}
.md-tile-name { font-weight: 900; font-size: 0.98rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.md-tile-cat {
    font-size: 0.68rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 800;
}
.md-badges { display: flex; gap: 0.35rem; flex-wrap: wrap; }
.md-badge {
    font-size: 0.64rem;
    padding: 0.16rem 0.38rem;
    border-radius: 999px;
    font-weight: 800;
    border: 1px solid transparent;
}
.md-badge.core { color: #dbe7ff; border-color: rgba(88,101,242,0.32); background: rgba(88,101,242,0.1); }
.md-badge.on { color: #dbe7ff; border-color: rgba(88,101,242,0.4); background: rgba(88,101,242,0.14); }
.md-badge.off { color: #adb5bd; border-color: rgba(173,181,189,0.35); background: rgba(173,181,189,0.1); }
.md-tile-desc { font-size: 0.8rem; color: var(--text-secondary); line-height: 1.34; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 2.2rem; }
.md-tile-footer { display: flex; gap: 0.5rem; margin-top: auto; }

.switch { position: relative; display: inline-block; width: 44px; height: 24px; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #4e5058; transition: .4s; border-radius: 34px; }
.slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
input:checked + .slider { background-color: #23a559; }
input:checked + .slider:before { transform: translateX(20px); }

.alert { padding: 10px; border-radius: 6px; font-size: 0.85rem; margin-bottom: 0.8rem; border-left: 4px solid; }
.alert-success { background: rgba(81,207,102,.1); color: #51cf66; border-color: #51cf66; }
.alert-error { background: rgba(255,107,107,.1); color: #ff6b6b; border-color: #ff6b6b; }
.md-toast-wrap { position: fixed; right: 1rem; bottom: 1rem; z-index: 60; display: grid; gap: 0.5rem; }
.md-toast { min-width: 260px; max-width: 360px; padding: 0.7rem 0.85rem; border-radius: 8px; border: 1px solid var(--border-light); background: #1f222c; color: #fff; box-shadow: 0 12px 30px rgba(0,0,0,0.28); font-size: 0.84rem; }
.md-toast.success { border-color: rgba(81,207,102,.5); color: #8ce99a; }
.md-toast.error { border-color: rgba(255,107,107,.5); color: #ff9b9d; }
.is-loading { opacity: 0.65; pointer-events: none; }

/* Gate badges */
.md-gate-free    { color: #8ce99a; border-color: rgba(81,207,102,.35); background: rgba(81,207,102,.1); }
.md-gate-premium { color: #d7d2f4; border-color: rgba(122,112,176,.35); background: rgba(122,112,176,.12); }
.md-gate-coming  { color: #c8d0dc; border-color: rgba(92,104,120,.35); background: rgba(92,104,120,.1); }
/* Upgrade nudge shown on premium/coming tiles when server is free */
.md-upgrade-hint {
    font-size: .72rem;
    color: var(--text-secondary);
    margin-top: .25rem;
    display: flex;
    align-items: center;
    gap: .35rem;
}

.md-value-strip {
    border: 1px dashed rgba(168, 85, 247, 0.42);
    border-radius: 12px;
    background: rgba(168, 85, 247, 0.1);
    padding: 0.75rem 0.85rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
}

.md-value-strip p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.8rem;
}

@media (max-width: 900px) {
    .md-hero { flex-direction: column; }
    .md-hero-controls { width: 100%; }
    .md-select { width: 100%; }
    .md-stats { grid-template-columns: 1fr; }
    .md-onboard { flex-direction: column; align-items: flex-start; }
    .md-filter-top { flex-direction: column; align-items: stretch; }
    .md-search { min-width: 100%; width: 100%; }
}
</style>

<div class="md-shell">
    <section class="dashboard-page-header">
        <div class="dashboard-page-copy">
            <span class="dashboard-page-eyebrow">Server Tools</span>
            <h1>Modules</h1>
            <p>Aktiviere zuerst Core-Bausteine und oeffne danach nur die Bereiche, die dein Server wirklich nutzt.</p>
            <div class="dashboard-page-meta">
                <span class="status-badge <?php echo $activeCount > 0 ? 'active' : 'inactive'; ?>"><?php echo $activeCount > 0 ? $activeCount . ' aktiv' : 'Noch nichts aktiv'; ?></span>
                <span class="status-badge <?php echo $coreActiveCount === count($coreKeys) ? 'active' : 'warning'; ?>">Core <?php echo $coreActiveCount; ?>/<?php echo count($coreKeys); ?></span>
                <span class="status-badge <?php echo $guildTier !== 'free' ? 'premium' : 'inactive'; ?>"><?php echo strtoupper($guildTier); ?></span>
            </div>
        </div>
        <div class="dashboard-page-actions">
            <form method="GET" class="md-hero-controls action-row">
                <select class="md-select" name="guildId" onchange="this.form.submit()">
                    <?php foreach ($guilds as $g): ?>
                        <option value="<?php echo esc($g['id']); ?>" <?php echo $guildId === ($g['id'] ?? '') ? 'selected' : ''; ?>><?php echo esc($g['name']); ?></option>
                    <?php endforeach; ?>
                </select>
            </form>
            <a href="<?php echo esc(dashboardPageUrl('serverconfig')); ?>" class="btn-icon btn-secondary-ui"><span class="i">⚙️</span> Server Config</a>
        </div>
    </section>

    <div id="modulesFeedback" class="alert alert-<?php echo esc($messageType); ?>" style="display:<?php echo $message ? 'block' : 'none'; ?>;"><?php echo esc($message ?: ''); ?></div>

    <?php if (!$guildId): ?>
        <div class="empty-state">
            <strong>Kein Server ausgewaehlt</strong>
            <p>Waehle oben einen Server aus, um Module zu aktivieren und zu konfigurieren.</p>
            <a href="portal.php" class="btn-icon cta btn-secondary-ui">Zum Portal</a>
        </div>
    <?php else: ?>
        <div class="md-stats">
            <div class="md-stat dashboard-kpi">
                <div class="md-stat-k">Active Modules</div>
                <div class="md-stat-v" style="color:#51cf66;"><?php echo $activeCount; ?>/<?php echo count($modules); ?></div>
            </div>
            <div class="md-stat dashboard-kpi">
                <div class="md-stat-k">Core Progress</div>
                <div class="md-stat-v" style="color:#8ce99a;"><?php echo $coreActiveCount; ?>/<?php echo count($coreKeys); ?></div>
            </div>
            <div class="md-stat dashboard-kpi">
                <div class="md-stat-k">Stage</div>
                <div class="md-stat-v"><?php echo $isStarterServer ? 'Starter' : 'Advanced'; ?></div>
            </div>
        </div>

        <?php if ($guildTier === 'free'): ?>
            <div class="md-value-strip">
                <div>
                    <strong>Mehr aus deinem Setup holen</strong>
                    <p>Premium schaltet mehr Ticket-/Reaction-Role-Panels und Live Activity frei. Pro erweitert Insights fuer tiefere Entscheidungen.</p>
                </div>
                <a href="<?php echo esc(dashboardPageUrl('server-plans')); ?>" class="btn-icon btn-secondary-ui">Upgrade ansehen</a>
            </div>
        <?php endif; ?>

        <?php if ($coreActiveCount < count($coreKeys)): ?>
            <div class="md-onboard">
                <div>
                    <div class="md-onboard-title">🧭 Core Setup zuerst</div>
                    <div class="md-onboard-copy">Ein Klick aktiviert Welcome, Logging und Tickets. Danach ist die Basis fuer Start, Nachvollziehbarkeit und Support gesetzt.</div>
                </div>
                <form method="POST" id="coreSetupForm">
                    <input type="hidden" name="action" value="enable_core">
                    <button type="submit" id="coreSetupBtn" class="btn-icon primary" style="padding:0.6rem 0.9rem; font-weight:800;">Core Setup aktivieren</button>
                </form>
            </div>
        <?php endif; ?>

        <div class="md-filters">
            <div class="md-filter-top">
                <strong style="font-size:0.84rem;">Filter</strong>
                <input id="moduleSearch" class="md-search" type="text" placeholder="Suche nach Modulnamen...">
            </div>
            <div class="md-chip-row">
                <button type="button" class="md-chip active" data-type="all">Alle</button>
                <button type="button" class="md-chip" data-type="core">Core</button>
                <button type="button" class="md-chip" data-type="active">Aktiv</button>
                <button type="button" class="md-chip" data-type="inactive">Inaktiv</button>
                <?php foreach ($categoryCounts as $cat => $count): ?>
                    <button type="button" class="md-chip" data-category="<?php echo esc($cat); ?>"><?php echo esc($cat); ?> (<?php echo (int)$count; ?>)</button>
                <?php endforeach; ?>
            </div>
        </div>

        <div class="md-grid">
            <?php foreach ($modules as $module): ?>
                <?php
                    $enabled = !empty($module['enabled']);
                    $key = $module['key'] ?? '';
                    $meta = $moduleMeta[$key] ?? ['category' => 'Other', 'path' => null, 'accent' => '#5865f2'];
                    $openPath = $meta['path'] ?? null;
                    $openHref = $openPath ? BASE_URL . '/pages/' . $openPath . (strpos($openPath, '?') === false ? '?guildId=' . urlencode($guildId) : '') : null;
                    $isCore = isset($coreLookup[$key]);
                    $rawDescription = trim((string)($module['description'] ?? ''));
                    $shortDescription = strlen($rawDescription) > 72 ? (substr($rawDescription, 0, 69) . '...') : $rawDescription;
                ?>
                <div id="module-<?php echo esc($key); ?>" class="md-tile <?php echo $enabled ? '' : 'disabled'; ?>" style="--accent:<?php echo esc($meta['accent']); ?>" data-category="<?php echo esc($meta['category']); ?>" data-name="<?php echo esc(strtolower(($module['label'] ?? $key))); ?>" data-enabled="<?php echo $enabled ? '1' : '0'; ?>" data-core="<?php echo $isCore ? '1' : '0'; ?>">
                    <?php $healthHint = $enabled && isset($healthIssueKeys[$key]) ? $healthIssueKeys[$key] : null; ?>
                    <?php
                        $gate = $meta['gate'] ?? 'free';
                        $gateInfo = $gateLabels[$gate] ?? $gateLabels['free'];
                        $gateLevel = $gateTierLevel[$gate] ?? 0;
                        $lockedByPlan = $gate !== 'free' && $currentTierLevel < $gateLevel;
                        $actionLabel = $lockedByPlan ? 'Plan' : ($healthHint ? 'Setup' : ($enabled ? 'Oeffnen' : 'Aktivieren'));
                    ?>
                    <?php if ($healthHint): ?>
                    <div class="status-badge setup" title="<?php echo esc($healthHint); ?>" style="position:absolute;top:0.6rem;right:0.6rem;cursor:help;">Setup noetig</div>
                    <?php endif; ?>
                    <div class="md-tile-top">
                        <div class="md-tile-title">
                            <div class="md-tile-icon"><?php echo esc($module['icon'] ?? '🧩'); ?></div>
                            <div>
                                <div class="md-tile-name"><?php echo esc($module['label'] ?? $module['key']); ?></div>
                                <div class="md-tile-cat"><?php echo esc($isCore ? 'Core' : $meta['category']); ?></div>
                            </div>
                        </div>
                        <form method="POST" id="form_<?php echo esc($key); ?>">
                            <input type="hidden" name="guildId" value="<?php echo esc($guildId); ?>">
                            <input type="hidden" name="module" value="<?php echo esc($key); ?>">
                            <input type="hidden" name="enabled" value="<?php echo $enabled ? '0' : '1'; ?>">
                            <label class="switch">
                                <input type="checkbox" <?php echo $enabled ? 'checked' : ''; ?> data-module-toggle="<?php echo esc($key); ?>">
                                <span class="slider"></span>
                            </label>
                        </form>
                    </div>
                <div class="md-badges">
                        <span class="md-badge <?php echo $enabled ? 'on' : 'off'; ?>"><?php echo $enabled ? 'Active' : 'Inactive'; ?></span>
                        <span class="md-badge <?php echo esc($gateInfo['class']); ?>"><?php echo $gateInfo['label']; ?></span>
                    </div>
                    <div class="md-tile-desc"><?php echo esc($shortDescription); ?></div>
                    <?php if ($lockedByPlan): ?>
                    <div class="md-upgrade-hint">
                        <?php if ($gate === 'coming'): ?>
                            <span>🔜</span> Dieses Feature ist noch in Entwicklung.
                        <?php else: ?>
                            <span>💎</span> Premium-Feature — <a href="<?= BASE_URL ?>/pages/server-plans.php" style="color:#c4b5fd; font-weight:700;">Upgrade ansehen</a>
                        <?php endif; ?>
                    </div>
                    <?php endif; ?>
                    <div class="md-tile-footer">
                        <?php if ($openHref): ?>
                            <a href="<?php echo esc($lockedByPlan ? (BASE_URL . '/pages/server-plans.php') : $openHref); ?>" class="btn-icon btn-primary-ui" style="padding:0.42rem 0.72rem; font-size:0.78rem; flex:1; justify-content:center; text-decoration:none; font-weight:800;"><?php echo esc($actionLabel); ?></a>
                        <?php endif; ?>
                    </div>
                </div>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>
</div>

<script>
(function() {
  const tiles = Array.from(document.querySelectorAll('.md-tile'));
  const typeChips = Array.from(document.querySelectorAll('.md-chip[data-type]'));
  const categoryChips = Array.from(document.querySelectorAll('.md-chip[data-category]'));
  const search = document.getElementById('moduleSearch');
    const feedback = document.getElementById('modulesFeedback');
    const coreForm = document.getElementById('coreSetupForm');
    const coreBtn = document.getElementById('coreSetupBtn');
  let activeType = 'all';
  let activeCategory = 'all';

    function csrfToken() {
        return document.querySelector('input[name="csrf_token"]')?.value || '';
    }

    function normalizeLimitMessage(message) {
        const text = String(message || '');
        const lower = text.toLowerCase();
        if (lower.includes('limit reached') || lower.includes('feature limit')) {
            return 'Du hast dein Limit erreicht. Upgrade fuer mehr.';
        }
        return text;
    }

    function showLimitReachedCard(hint) {
        let card = document.getElementById('mdLimitCard');
        if (!card) {
            card = document.createElement('div');
            card.id = 'mdLimitCard';
            const grid = document.querySelector('.md-grid');
            if (grid) grid.parentNode.insertBefore(card, grid);
        }
        const plansUrl = '<?= esc(dashboardPageUrl('server-plans')) ?>';
        card.innerHTML = `
            <div class="upgrade-limit-card" style="margin-bottom:.75rem;">
                <div class="ulc-icon">🚫</div>
                <div class="ulc-body">
                    <div class="ulc-title">Du hast dein Limit erreicht</div>
                    <div class="ulc-hint">${hint || '💎 Upgrade auf Premium für mehr Kapazität.'}</div>
                </div>
                <a href="${plansUrl}" class="ulc-cta">Jetzt upgraden</a>
            </div>`;
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function showFeedback(type, message, code) {
        const finalMessage = normalizeLimitMessage(message);
        if (code === 'LIMIT_REACHED') {
            showLimitReachedCard('💎 ' + finalMessage);
            return;
        }
        if (feedback) {
            feedback.className = `alert alert-${type === 'success' ? 'success' : 'error'}`;
            feedback.textContent = finalMessage;
            feedback.style.display = 'block';
        }

        let wrap = document.querySelector('.md-toast-wrap');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.className = 'md-toast-wrap';
            document.body.appendChild(wrap);
        }
        const toast = document.createElement('div');
        toast.className = `md-toast ${type}`;
        toast.textContent = finalMessage;
        wrap.appendChild(toast);
        setTimeout(() => toast.remove(), 3200);
    }

    async function postFormData(formData) {
        const response = await fetch(window.location.href, {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json'
            },
            body: formData,
            credentials: 'same-origin'
        });

        const json = await response.json().catch(() => ({ success: false, message: 'Ungueltige Serverantwort.' }));
        if (!response.ok || !json.success) {
            const err = new Error(json.message || 'Speichern fehlgeschlagen.');
            err.code = json.code ?? null;
            throw err;
        }
        return json;
    }

    function updateTileState(moduleKey, enabled) {
        const tile = document.getElementById(`module-${moduleKey}`);
        if (!tile) return;
        tile.dataset.enabled = enabled ? '1' : '0';
        tile.classList.toggle('disabled', !enabled);

        const badge = tile.querySelector('.md-badge.on, .md-badge.off');
        if (badge) {
            badge.className = `md-badge ${enabled ? 'on' : 'off'}`;
            badge.textContent = enabled ? 'Active' : 'Inactive';
        }
    }

  function apply() {
    const q = (search?.value || '').trim().toLowerCase();
    for (const tile of tiles) {
      const isCore = tile.dataset.core === '1';
      const isEnabled = tile.dataset.enabled === '1';
      const typeOk =
        activeType === 'all' ||
        (activeType === 'core' && isCore) ||
        (activeType === 'active' && isEnabled) ||
        (activeType === 'inactive' && !isEnabled);
      const categoryOk = activeCategory === 'all' || tile.dataset.category === activeCategory;
      const searchOk = !q || (tile.dataset.name || '').includes(q);
      tile.style.display = typeOk && categoryOk && searchOk ? '' : 'none';
    }
  }

  for (const chip of typeChips) {
    chip.addEventListener('click', () => {
      activeType = chip.dataset.type || 'all';
      typeChips.forEach(c => c.classList.toggle('active', c === chip));
      apply();
    });
  }

  for (const chip of categoryChips) {
    chip.addEventListener('click', () => {
      const clicked = chip.dataset.category || 'all';
      if (activeCategory === clicked) {
        activeCategory = 'all';
        chip.classList.remove('active');
      } else {
        activeCategory = clicked;
        categoryChips.forEach(c => c.classList.toggle('active', c === chip));
      }
      apply();
    });
  }

  if (search) search.addEventListener('input', apply);

    document.querySelectorAll('input[data-module-toggle]').forEach((checkbox) => {
        checkbox.addEventListener('change', async () => {
            const moduleKey = checkbox.getAttribute('data-module-toggle');
            const form = document.getElementById(`form_${moduleKey}`);
            if (!form) return;

            const nextEnabled = checkbox.checked;
            form.classList.add('is-loading');
            checkbox.disabled = true;

            try {
                const fd = new FormData();
                fd.set('guildId', form.querySelector('input[name="guildId"]').value || '');
                fd.set('module', moduleKey || '');
                fd.set('enabled', nextEnabled ? '1' : '0');
                fd.set('csrf_token', csrfToken());

                const result = await postFormData(fd);
                updateTileState(moduleKey, nextEnabled);

                const hiddenEnabled = form.querySelector('input[name="enabled"]');
                if (hiddenEnabled) hiddenEnabled.value = nextEnabled ? '0' : '1';

                showFeedback('success', result.message || 'Module aktualisiert.');
            } catch (error) {
                checkbox.checked = !nextEnabled;
                showFeedback('error', error.message || 'Modul konnte nicht gespeichert werden.', error.code);
            } finally {
                checkbox.disabled = false;
                form.classList.remove('is-loading');
                apply();
            }
        });
    });

    if (coreForm && coreBtn) {
        coreForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const originalText = coreBtn.textContent;
            coreBtn.disabled = true;
            coreBtn.textContent = 'Speichert...';

            try {
                const fd = new FormData();
                fd.set('guildId', '<?php echo esc($guildId); ?>');
                fd.set('action', 'enable_core');
                fd.set('csrf_token', csrfToken());
                const result = await postFormData(fd);
                showFeedback('success', result.message || 'Core Setup angewendet.');
                setTimeout(() => window.location.reload(), 550);
            } catch (error) {
                showFeedback('error', error.message || 'Core Setup fehlgeschlagen.', error.code);
            } finally {
                coreBtn.disabled = false;
                coreBtn.textContent = originalText;
            }
        });
    }
})();
</script>

<?php include '../includes/footer.php'; ?>
