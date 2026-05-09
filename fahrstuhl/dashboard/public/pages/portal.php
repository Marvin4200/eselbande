<?php
$page_title = 'Server Portal';
require_once __DIR__ . '/../includes/config.php';
requireLogin();

$user = getUser();
$userId = $user['id'];

// Fetch overall stats
$statsRes = getAPI('/user/' . $userId, 5);
$stats = $statsRes['data'] ?? null;
$shieldsOwned = $stats['shieldsOwned'] ?? 0;
$shieldActive = $stats['activeShieldExpiry'] ?? 0;
$shieldActiveUntil = $shieldActive > time() * 1000 ? ceil(($shieldActive / 1000 - time()) / 60) : 0;

// Fetch bot's guilds
$botGuildsRes = getAPI('/guilds', 5);
$botGuildIds = [];
foreach (($botGuildsRes['data']['guilds'] ?? []) as $g) {
    $botGuildIds[$g['id']] = [
        'name' => $g['name'], 
        'icon' => $g['icon'] ?? null, 
        'memberCount' => $g['memberCount'] ?? 0
    ];
}

// Fetch user's manageable guilds
$userGuilds = getUserGuilds();
$manageableGuilds = [];
foreach ($userGuilds as $ug) {
    if (isset($botGuildIds[$ug['id']])) {
        $bg = $botGuildIds[$ug['id']];
        // Check if admin or owner
        $isAdmin = (($ug['permissions'] & 0x8) === 0x8 || ($ug['permissions'] & 0x20) === 0x20 || ($ug['owner'] ?? false));
        if ($isAdmin) {
            $manageableGuilds[] = [
                'id' => $ug['id'],
                'name' => $bg['name'],
                'icon' => $bg['icon'],
                'memberCount' => $bg['memberCount']
            ];
        }
    }
}
$selectedGuildId = dashboardSelectedGuildId($manageableGuilds);
$selectedGuild = null;
foreach ($manageableGuilds as $g) {
    if ($g['id'] === $selectedGuildId) {
        $selectedGuild = $g;
        break;
    }
}
if (!$selectedGuild) {
    unset($_SESSION['selected_guild_id']);
    $selectedGuildId = '';
}

$guildModules = [];
if ($selectedGuildId !== '') {
    $modulesRes = getAPI('/guilds/' . urlencode($selectedGuildId) . '/modules', 5);
    $guildModules = $modulesRes['data']['modules'] ?? [];
}
$enabledModuleCount = 0;
foreach ($guildModules as $moduleState) {
    if (!empty($moduleState['enabled'])) {
        $enabledModuleCount++;
    }
}

// Guild premium status
$guildPremiumData = [];
$guildPlanName    = 'Free';
$guildTier        = 'free';
$guildHasPremium  = false;
if ($selectedGuildId !== '') {
    $gpr             = getAPI('/guilds/' . urlencode($selectedGuildId) . '/premium', 5);
    $guildPremiumData = $gpr['data'] ?? [];
    $guildHasPremium  = !empty($guildPremiumData['hasPremium']);
    $guildPlanName    = $guildPremiumData['planName'] ?? 'Free';
    $guildTier        = $guildPremiumData['tier']     ?? 'free';
}

$portalAnalytics = [];
$portalHealthIssues = [];
$portalHealthSummary = ['errors' => 0, 'warnings' => 0, 'infos' => 0];
$portalHealthState = 'ok';
$portalActivity = [];

function portalActivityMeta($type) {
    $map = [
        'moderation' => ['icon' => '🛡️', 'label' => 'Moderation'],
        'automod' => ['icon' => '🚨', 'label' => 'AutoMod'],
        'tickets' => ['icon' => '🎫', 'label' => 'Tickets'],
        'leveling' => ['icon' => '📈', 'label' => 'Leveling'],
        'voice' => ['icon' => '🎙️', 'label' => 'Voice'],
    ];
    return $map[$type] ?? ['icon' => '•', 'label' => 'Event'];
}

function portalRelativeTime($iso) {
    $timestamp = $iso ? strtotime($iso) : false;
    if (!$timestamp) return 'gerade eben';
    $delta = time() - $timestamp;
    if ($delta < 60) return 'vor ' . max(1, $delta) . 's';
    if ($delta < 3600) return 'vor ' . floor($delta / 60) . 'm';
    if ($delta < 86400) return 'vor ' . floor($delta / 3600) . 'h';
    if ($delta < 604800) return 'vor ' . floor($delta / 86400) . 'd';
    return date('d.m. H:i', $timestamp);
}

if ($selectedGuildId !== '') {
    $portalAnalyticsRaw = getAPI('/guilds/' . urlencode($selectedGuildId) . '/analytics', 6);
    $portalAnalytics = $portalAnalyticsRaw['data'] ?? [];

    $portalActivityRaw = getAPI('/guilds/' . urlencode($selectedGuildId) . '/activity?limit=5&offset=0', 6);
    $portalActivity = $portalActivityRaw['data']['items'] ?? [];

    $portalHealthRaw = getAPI('/guilds/' . urlencode($selectedGuildId) . '/setup-health', 6);
    $portalHealthIssues = $portalHealthRaw['data']['issues'] ?? [];
    $portalHealthSummary = $portalHealthRaw['data']['summary'] ?? $portalHealthSummary;
    $portalHealthState = $portalHealthRaw['data']['health'] ?? 'ok';
}

$avatarUrl = $user['avatar']
    ? "https://cdn.discordapp.com/avatars/{$userId}/{$user['avatar']}.png?size=128"
    : "https://cdn.discordapp.com/embed/avatars/0.png";

// Module list for the "Quick Access" or if a guild is selected
$modules = [
    ['key' => 'welcome',       'name' => 'Welcome',        'icon' => '👋', 'desc' => 'Join/Leave messages & AutoRole',    'color' => '#51cf66', 'gate' => 'free'],
    ['key' => 'automod',       'name' => 'AutoMod',         'icon' => '🛡️', 'desc' => 'Anti-Spam & Filter system',         'color' => '#f97316', 'gate' => 'free'],
    ['key' => 'leveling',      'name' => 'Leveling',        'icon' => '📈', 'desc' => 'XP, Levels & Role Rewards',         'color' => '#667eea', 'gate' => 'free'],
    ['key' => 'tickets',       'name' => 'Tickets',         'icon' => '🎫', 'desc' => 'Support ticket system',             'color' => '#f59e0b', 'gate' => 'free'],
    ['key' => 'reaction-roles','name' => 'Reaction Roles',  'icon' => '🎭', 'desc' => 'Self-assign roles with buttons',    'color' => '#ec4899', 'gate' => 'free'],
    ['key' => 'logging',       'name' => 'Logging',         'icon' => '📜', 'desc' => 'Server activity logs',             'color' => '#3b82f6', 'gate' => 'free'],
    ['key' => 'moderation',    'name' => 'Moderation',      'icon' => '🔨', 'desc' => 'Ban, Kick & Case history',          'color' => '#ef4444', 'gate' => 'free'],
    ['key' => 'social',        'name' => 'Social Alerts',   'icon' => '📣', 'desc' => 'Twitch / YouTube notifications',   'color' => '#f43f5e', 'gate' => 'premium'],
    ['key' => 'temp-voice',    'name' => 'Temp Voice',      'icon' => '🔊', 'desc' => 'Auto-create voice channels',        'color' => '#38bdf8', 'gate' => 'premium'],
];

$setupSteps = [
    [
        'done' => !empty($manageableGuilds),
        'icon' => '➕',
        'title' => 'Invite Fahrstuhl',
        'text' => 'Bring the bot onto your server with the right permissions.',
        'href' => 'https://discord.com/oauth2/authorize?client_id=1487187616674611321&permissions=1654096264208&scope=bot+applications.commands',
        'external' => true,
        'action' => 'Invite',
    ],
    [
        'done' => $selectedGuildId !== '',
        'icon' => '🏰',
        'title' => 'Select one server',
        'text' => $selectedGuild ? 'Editing ' . $selectedGuild['name'] . ' across the dashboard.' : 'Choose the guild you want to configure.',
        'href' => BASE_URL . '/pages/portal.php',
        'external' => false,
        'action' => 'Select',
    ],
    [
        'done' => $enabledModuleCount > 0,
        'icon' => '🧩',
        'title' => 'Activate core modules',
        'text' => $enabledModuleCount > 0 ? $enabledModuleCount . ' modules are already active.' : 'Turn on tickets, moderation, leveling or reaction roles.',
        'href' => dashboardPageUrl('modules'),
        'external' => false,
        'action' => 'Configure',
    ],
    [
        'done' => false,
        'icon' => '🎫',
        'title' => 'Launch support flow',
        'text' => 'Create ticket panels, forms, routing and staff workflows.',
        'href' => dashboardPageUrl('tickets'),
        'external' => false,
        'action' => 'Build',
    ],
];

$completedSteps = 0;
foreach ($setupSteps as $step) {
    if ($step['done']) {
        $completedSteps++;
    }
}
$setupProgress = count($setupSteps) > 0 ? (int)round(($completedSteps / count($setupSteps)) * 100) : 0;
$isStarterMode = $completedSteps < 3;

$starterActions = [
    [
        'step' => '1',
        'title' => 'Server auswaehlen',
        'copy' => $selectedGuild
            ? 'Aktiv: ' . $selectedGuild['name'] . '. Alle Einstellungen gelten jetzt fuer diesen Server.'
            : 'Waehle zuerst den Server unten aus. Ohne Auswahl fuehlen sich Menues chaotisch an.',
        'href' => BASE_URL . '/pages/portal.php',
        'label' => $selectedGuild ? 'Server wechseln' : 'Server waehlen',
    ],
    [
        'step' => '2',
        'title' => 'Nur 3 Module starten',
        'copy' => 'Aktiviere zuerst Welcome, Tickets und Logging. Der Rest kann spaeter kommen.',
        'href' => dashboardPageUrl('modules'),
        'label' => 'Core Module',
    ],
    [
        'step' => '3',
        'title' => 'Welcome testen',
        'copy' => 'Setze Join-Message + AutoRole und pruefe einmal per Test-Message.',
        'href' => dashboardPageUrl('welcome'),
        'label' => 'Welcome Setup',
    ],
];

$portalQuickActions = [
    ['icon' => '🚀', 'title' => 'Command Center', 'text' => 'Live Feed + Schnellaktionen in einem Screen.', 'href' => dashboardPageUrl('command-center')],
    ['icon' => '👋', 'title' => 'Welcome', 'text' => 'Join, Leave und AutoRole setzen.', 'href' => dashboardPageUrl('welcome')],
    ['icon' => '📜', 'title' => 'Logging', 'text' => 'Zentralen Log-Channel festlegen.', 'href' => dashboardPageUrl('logging')],
    ['icon' => '🎫', 'title' => 'Tickets', 'text' => 'Support-Panel und Routing bauen.', 'href' => dashboardPageUrl('tickets')],
];

$moduleEnabledLookup = [];
foreach ($guildModules as $moduleState) {
    if (!empty($moduleState['key'])) {
        $moduleEnabledLookup[$moduleState['key']] = !empty($moduleState['enabled']);
    }
}

$portalActiveModules = [];
foreach ($modules as $moduleDef) {
    if (!empty($moduleEnabledLookup[$moduleDef['key']])) {
        $portalActiveModules[] = $moduleDef;
    }
}

$portalWarnings = array_slice($portalHealthIssues, 0, 3);
$portalOverview = $portalAnalytics['overview'] ?? [];
$portalTickets = $portalAnalytics['tickets'] ?? [];
$portalAutomod = $portalAnalytics['automod'] ?? [];
$portalModeration = $portalAnalytics['moderation'] ?? [];
$socialProofServers = count($botGuildIds);
$socialProofModeration24h = (int)($portalModeration['cases24h'] ?? 0);

$portalRecentStats = [
    ['label' => 'Members', 'value' => number_format((int)($portalOverview['memberCount'] ?? 0)), 'help' => number_format((int)($portalOverview['botCount'] ?? 0)) . ' Bots'],
    ['label' => 'Messages', 'value' => number_format((int)($portalOverview['messageCount'] ?? 0)), 'help' => !empty($portalOverview['messageCountAvailable']) ? 'Tracking aktiv' : 'Noch keine Daten'],
    ['label' => 'Open Tickets', 'value' => number_format((int)($portalTickets['open'] ?? 0)), 'help' => number_format((int)($portalTickets['closed'] ?? 0)) . ' geschlossen'],
    ['label' => 'AutoMod 24h', 'value' => number_format((int)($portalAutomod['hits24h'] ?? 0)), 'help' => number_format((int)($portalAutomod['hits7d'] ?? 0)) . ' in 7 Tagen'],
];
?>

<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.pt-container { display: flex; flex-direction: column; gap: 1rem; }

.pt-container .dashboard-page-header { padding: 0.72rem 0.9rem; }
.pt-container .dashboard-page-copy h1 { font-size: clamp(1.2rem, 1.8vw, 1.55rem); }

.pt-warning-bar {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    border: 1px solid rgba(52, 61, 77, 0.88);
    border-radius: 10px;
    padding: 0.58rem 0.72rem;
    background: rgba(23, 27, 35, 0.9);
}

.pt-warning-bar strong { font-size: 0.84rem; }
.pt-warning-bar p { margin: 0.12rem 0 0; font-size: 0.78rem; color: var(--text-secondary); }

.pt-quick-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 0.55rem;
}

.pt-quick-card {
    text-decoration: none;
    color: inherit;
    border: 1px solid rgba(52, 61, 77, 0.8);
    background: rgba(32, 38, 49, 0.72);
    border-radius: 10px;
    padding: 0.65rem;
    display: grid;
    gap: 0.25rem;
}

.pt-quick-card:hover {
    border-color: rgba(88, 101, 242, 0.46);
    background: rgba(88, 101, 242, 0.1);
}

.pt-quick-title { font-size: 0.86rem; font-weight: 800; display: flex; align-items: center; gap: 0.4rem; }
.pt-quick-text { font-size: 0.75rem; color: var(--text-secondary); line-height: 1.35; }

.pt-active-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 0.75rem;
}

.pt-active-card {
    display: flex;
    align-items: flex-start;
    gap: 0.7rem;
    padding: 0.9rem;
    border-radius: 12px;
    border: 1px solid rgba(88, 101, 242, 0.28);
    background: linear-gradient(140deg, rgba(88, 101, 242, 0.16), rgba(32, 38, 49, 0.9));
    color: var(--text-primary);
    text-decoration: none;
    transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}

.pt-active-card:hover {
    transform: translateY(-2px);
    border-color: rgba(124, 131, 255, 0.56);
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.26);
}

.pt-active-icon {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 38px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
}

.pt-active-copy { display: grid; gap: 0.12rem; min-width: 0; }
.pt-active-copy strong { font-size: 0.96rem; }
.pt-active-copy span { color: var(--text-secondary); font-size: 0.79rem; line-height: 1.35; }

.pt-setup-done {
    border: 1px solid rgba(81, 207, 102, 0.32);
    border-radius: 10px;
    background: rgba(81, 207, 102, 0.1);
    padding: 0.68rem 0.78rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.7rem;
}

.pt-setup-done strong { font-size: 0.86rem; }
.pt-setup-done span { color: #8ce99a; font-size: 0.76rem; font-weight: 800; }

.pt-activity-list {
    display: grid;
    gap: 0.7rem;
}

.pt-activity-item {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    gap: 0.7rem;
    align-items: flex-start;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 10px;
    padding: 0.75rem;
    background: rgba(255,255,255,0.03);
}

.pt-activity-icon {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    background: rgba(255,255,255,0.06);
}

.pt-activity-copy {
    display: grid;
    gap: 0.18rem;
}

.pt-activity-copy strong {
    font-size: 0.84rem;
}

.pt-activity-copy p {
    margin: 0;
    font-size: 0.78rem;
    color: var(--text-secondary);
    line-height: 1.4;
}

.pt-activity-meta {
    display: flex;
    gap: 0.55rem;
    flex-wrap: wrap;
    color: var(--text-secondary);
    font-size: 0.74rem;
}

/* Hero Section */
.pt-hero { 
    background: linear-gradient(135deg, rgba(102,126,234,0.15), rgba(26,31,46,0.95)); 
    border: 1px solid var(--border-light); border-radius: 16px; padding: 2rem;
    display: flex; justify-content: space-between; align-items: center; gap: 2rem;
}
.pt-hero-user { display: flex; align-items: center; gap: 1.5rem; }
.pt-avatar { width: 80px; height: 80px; border-radius: 50%; border: 3px solid var(--primary); box-shadow: 0 0 20px rgba(102,126,234,0.3); }
.pt-hero h1 { margin: 0; font-size: 1.8rem; }
.pt-hero p { margin: 0.2rem 0 0; color: var(--text-secondary); font-size: 1rem; }

/* Quick Stats */
.pt-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
.pt-stat-card { 
    background: var(--panel); border: 1px solid var(--border-light); border-radius: 12px; padding: 1.25rem;
    text-align: center; display: flex; flex-direction: column; gap: 0.2rem;
}
.pt-stat-val { font-size: 1.8rem; font-weight: 800; color: var(--primary-light); }
.pt-stat-lbl { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); font-weight: 700; }

/* Starter Mode */
.pt-starter {
    background: linear-gradient(135deg, rgba(81,207,102,0.12), rgba(26,31,46,0.92));
    border: 1px solid rgba(81,207,102,0.32);
    border-radius: 12px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
}
.pt-starter-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.8rem;
}
.pt-starter-title { font-weight: 900; font-size: 1.05rem; display: flex; align-items: center; gap: 0.45rem; }
.pt-starter-copy { color: var(--text-secondary); font-size: 0.86rem; }
.pt-starter-badge {
    font-size: 0.7rem;
    font-weight: 900;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #8ce99a;
    background: rgba(81,207,102,0.14);
    border: 1px solid rgba(81,207,102,0.34);
    padding: 0.25rem 0.5rem;
    border-radius: 999px;
}
.pt-starter-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 0.7rem; }
.pt-starter-card {
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border-light);
    border-radius: 10px;
    padding: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    text-decoration: none;
    color: inherit;
    min-height: 140px;
}
.pt-starter-card:hover { border-color: var(--primary); background: rgba(102,126,234,0.08); }
.pt-starter-step {
    width: 24px;
    height: 24px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    font-size: 0.72rem;
    font-weight: 900;
    background: rgba(102,126,234,0.2);
    color: var(--primary-light);
}
.pt-starter-name { font-weight: 800; }
.pt-starter-text { color: var(--text-secondary); font-size: 0.82rem; line-height: 1.35; flex: 1; }
.pt-starter-cta { color: var(--primary-light); font-size: 0.8rem; font-weight: 800; }

/* Direct Dev Contact */
.pt-dev {
    background: linear-gradient(135deg, rgba(88,101,242,0.14), rgba(26,31,46,0.96));
    border: 1px solid rgba(88,101,242,0.38);
    border-radius: 12px;
    padding: 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
}
.pt-dev-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.8rem; }
.pt-dev-title { font-size: 1.05rem; font-weight: 900; display: flex; gap: 0.45rem; align-items: center; }
.pt-dev-copy { color: var(--text-secondary); font-size: 0.86rem; margin-top: 0.2rem; }
.pt-dev-badge {
    font-size: 0.7rem;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #b3bcff;
    border: 1px solid rgba(88,101,242,0.4);
    background: rgba(88,101,242,0.15);
    padding: 0.22rem 0.48rem;
    border-radius: 999px;
}
.pt-dev-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; }
.pt-dev-card {
    text-decoration: none;
    color: inherit;
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border-light);
    border-radius: 10px;
    padding: 0.9rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    min-height: 138px;
}
.pt-dev-card:hover { border-color: #5865f2; background: rgba(88,101,242,0.1); }
.pt-dev-card-title { font-weight: 800; }
.pt-dev-card-copy { color: var(--text-secondary); font-size: 0.82rem; line-height: 1.35; flex: 1; }
.pt-dev-card-cta { color: #a5b4fc; font-size: 0.8rem; font-weight: 800; }

/* Setup */
.pt-setup { background: var(--panel); border: 1px solid var(--border-light); border-radius: 12px; padding: 1.25rem; }
.pt-setup-head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; margin-bottom: 1rem; }
.pt-setup-title { font-size: 1.2rem; font-weight: 800; display: flex; align-items: center; gap: 0.55rem; }
.pt-setup-copy { color: var(--text-secondary); margin-top: 0.25rem; font-size: 0.9rem; }
.pt-progress { min-width: 170px; }
.pt-progress-label { display: flex; justify-content: space-between; color: var(--text-secondary); font-size: 0.78rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.4rem; }
.pt-progress-track { height: 8px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden; }
.pt-progress-fill { height: 100%; border-radius: inherit; background: linear-gradient(90deg, #51cf66, var(--primary-light)); }
.pt-step-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.85rem; }
.pt-step-card { color: inherit; text-decoration: none; border: 1px solid var(--border-light); border-radius: 10px; padding: 0.75rem; background: rgba(255,255,255,0.025); display: flex; flex-direction: column; gap: 0.48rem; min-height: 126px; transition: 0.2s; }
.pt-step-card:hover { border-color: var(--primary); transform: translateY(-2px); background: rgba(102,126,234,0.07); }
.pt-step-top { display: flex; justify-content: space-between; align-items: center; gap: 0.6rem; }
.pt-step-icon { width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; background: rgba(102,126,234,0.13); }
.pt-step-status { font-size: 0.68rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.18rem 0.45rem; border-radius: 999px; color: var(--text-secondary); background: rgba(255,255,255,0.07); }
.pt-step-card.done .pt-step-status { color: #51cf66; background: rgba(81,207,102,0.12); }
.pt-step-name { font-weight: 800; font-size: 0.88rem; }
.pt-step-text { color: var(--text-secondary); font-size: 0.76rem; line-height: 1.35; flex: 1; }
.pt-step-action { color: var(--primary-light); font-size: 0.76rem; font-weight: 800; }

/* Guild Selector */
.pt-guild-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
.pt-guild-card { 
    background: var(--panel); border: 1px solid var(--border-light); border-radius: 12px; padding: 1.25rem;
    display: flex; align-items: center; gap: 1rem; cursor: pointer; transition: 0.2s; text-decoration: none; color: inherit;
}
.pt-guild-card:hover { border-color: var(--primary); transform: translateY(-2px); background: rgba(102,126,234,0.05); }
.pt-guild-card.active { border-color: var(--primary); background: rgba(102,126,234,0.12); box-shadow: 0 0 0 1px rgba(102,126,234,0.28) inset; }
.pt-guild-icon { width: 50px; height: 50px; border-radius: 12px; object-fit: cover; background: var(--bg-tertiary); }
.pt-guild-info { flex: 1; min-width: 0; }
.pt-guild-name { font-weight: 700; font-size: 1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pt-guild-meta { font-size: 0.8rem; color: var(--text-secondary); }
.pt-selected-pill { font-size: 0.72rem; font-weight: 800; color: var(--primary-light); border: 1px solid rgba(102,126,234,.35); background: rgba(102,126,234,.12); padding: .16rem .42rem; border-radius: 6px; }

/* Module Tiles */
.pt-module-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }
.pt-module-card { 
    background: var(--panel); border: 1px solid var(--border-light); border-radius: 12px; padding: 1.25rem;
    display: flex; flex-direction: column; gap: 0.6rem; transition: 0.2s; text-decoration: none; color: inherit;
}
.pt-module-card:hover { border-color: var(--primary); transform: translateY(-2px); }
.pt-module-icon { font-size: 1.5rem; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 10px; margin-bottom: 0.2rem; }
.pt-module-name { font-weight: 700; font-size: 1.1rem; }
.pt-module-desc { font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4; }

.pt-section-title { font-size: 1.2rem; font-weight: 800; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.6rem; }

.pt-social-proof {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 0.65rem;
}

.pt-proof-card {
    border: 1px solid rgba(52, 61, 77, 0.8);
    border-radius: 10px;
    padding: 0.75rem;
    background: rgba(32, 38, 49, 0.7);
}

.pt-proof-card strong {
    display: block;
    font-size: 1.2rem;
    margin-top: 0.2rem;
}

.pt-proof-card span {
    color: var(--text-secondary);
    font-size: 0.78rem;
}

.pt-next-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 0.6rem;
}

.pt-next-card {
    border: 1px solid rgba(88, 101, 242, 0.28);
    border-radius: 10px;
    padding: 0.75rem;
    background: rgba(88, 101, 242, 0.08);
    display: grid;
    gap: 0.28rem;
}

.pt-next-card strong { font-size: 0.9rem; }
.pt-next-card p { margin: 0; color: var(--text-secondary); font-size: 0.78rem; line-height: 1.4; }

@media (max-width: 800px) {
    .pt-hero { flex-direction: column; text-align: center; padding: 1.5rem; }
    .pt-hero-user { flex-direction: column; gap: 1rem; }
    .pt-starter-grid { grid-template-columns: 1fr; }
    .pt-dev-grid { grid-template-columns: 1fr; }
    .pt-setup-head { flex-direction: column; }
    .pt-progress { width: 100%; }
    .pt-step-grid { grid-template-columns: 1fr; }
}

@media (min-width: 801px) and (max-width: 1100px) {
    .pt-step-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>

<div class="pt-container">
    <?php
    $healthIssues = $portalHealthIssues;
    $healthSummary = $portalHealthSummary;
    $healthState = $portalHealthState;
    $wizardSteps = [
        !empty($manageableGuilds),
        $selectedGuildId !== '',
        $enabledModuleCount >= 3,
        $selectedGuildId !== '' && $healthState === 'ok',
    ];
    $wizardDone = count(array_filter($wizardSteps));
    $wizardTotal = count($wizardSteps);
    $wizardPct = (int)round(($wizardDone / $wizardTotal) * 100);
    ?>

    <section class="dashboard-page-header">
        <div class="dashboard-page-copy">
            <span class="dashboard-page-eyebrow">Dashboard Overview</span>
            <h1><?= $selectedGuild ? esc($selectedGuild['name']) : 'Portal' ?></h1>
            <div class="dashboard-page-meta">
                <span class="status-badge <?php echo $selectedGuildId !== '' ? 'active' : 'inactive'; ?>"><?php echo $selectedGuildId !== '' ? 'Server aktiv' : 'Kein Server' ; ?></span>
                <span class="status-badge <?php echo ($portalHealthState ?? 'ok') === 'ok' ? 'active' : 'warning'; ?>">Setup <?= $wizardPct ?>%</span>
            </div>
        </div>
        <div class="dashboard-page-actions">
            <a href="https://discord.com/oauth2/authorize?client_id=1487187616674611321&permissions=1654096264208&scope=bot+applications.commands" target="_blank" rel="noopener" class="btn-icon btn-primary-ui"><span class="i">➕</span> Bot einladen</a>
            <a href="<?= esc(dashboardPageUrl('command-center')) ?>" class="btn-icon btn-success-ui"><span class="i">🚀</span> Command Center</a>
            <a href="<?= esc(dashboardPageUrl('modules')) ?>" class="btn-icon btn-secondary-ui"><span class="i">🧩</span> Module</a>
        </div>
    </section>

    <section class="dashboard-panel">
        <div class="dashboard-panel-header">
            <div>
                <h2>Next Steps</h2>
            </div>
            <span class="status-badge warning">Onboarding</span>
        </div>
        <div class="pt-next-grid">
            <?php foreach ($starterActions as $starter): ?>
                <article class="pt-next-card">
                    <strong>Schritt <?= esc($starter['step']) ?>: <?= esc($starter['title']) ?></strong>
                    <p><?= esc($starter['copy']) ?></p>
                    <a href="<?= esc($starter['href']) ?>" class="btn-icon btn-secondary-ui"><?= esc($starter['label']) ?></a>
                </article>
            <?php endforeach; ?>
        </div>
    </section>

    <div class="pt-warning-bar" id="health-check">
        <?php if ($selectedGuildId === ''): ?>
            <div>
                <strong>Info: Kein Server gewaehlt</strong>
                <p>Waehle unten einen Server, damit Health-Hinweise geladen werden.</p>
            </div>
            <span class="status-badge inactive">Ohne Kontext</span>
        <?php elseif (empty($portalWarnings)): ?>
            <div>
                <strong>Alles sauber eingerichtet</strong>
                <p>Der aktuelle Server hat keine offenen Warnungen.</p>
            </div>
            <span class="status-badge active">0 Warnungen</span>
        <?php else: ?>
            <?php $firstWarning = $portalWarnings[0] ?? []; ?>
            <div>
                <strong><?= count($portalWarnings) ?> Warnung(en)</strong>
                <p><?= esc($firstWarning['label'] ?? 'Hinweis') ?><?= !empty($firstWarning['hint']) ? ': ' . esc($firstWarning['hint']) : '' ?></p>
            </div>
            <div class="dashboard-inline-actions">
                <span class="status-badge warning">Handlungsbedarf</span>
                <?php if (!empty($firstWarning['fixUrl'])): ?>
                    <a href="<?= esc($firstWarning['fixUrl']) ?>" class="btn-icon btn-secondary-ui">Fixen</a>
                <?php endif; ?>
            </div>
        <?php endif; ?>
    </div>

    <section class="dashboard-panel">
        <div class="dashboard-panel-header">
            <div>
                <h2>Quick Actions</h2>
            </div>
        </div>
        <div class="pt-quick-grid">
            <?php foreach ($portalQuickActions as $action): ?>
                <a href="<?= esc($action['href']) ?>" class="pt-quick-card">
                    <span class="pt-quick-title"><span><?= esc($action['icon']) ?></span> <?= esc($action['title']) ?></span>
                    <span class="pt-quick-text"><?= esc($action['text']) ?></span>
                </a>
            <?php endforeach; ?>
        </div>
    </section>

    <section class="dashboard-panel">
        <div class="dashboard-panel-header">
            <div>
                <h2>Active Modules</h2>
            </div>
            <a href="<?= dashboardPageUrl('modules') ?>" class="btn-icon btn-secondary-ui"><span class="i">🧩</span> Verwalten</a>
        </div>
        <div class="pt-active-grid">
            <?php if (empty($portalActiveModules)): ?>
                <div class="dashboard-list-item">
                    <div>
                        <strong>Noch keine Module aktiv</strong>
                        <p>Starte mit Welcome, Logging oder Tickets fuer einen sauberen Grundaufbau.</p>
                    </div>
                </div>
            <?php else: ?>
                <?php foreach ($portalActiveModules as $moduleDef): ?>
                    <a href="<?= esc(dashboardPageUrl($moduleDef['key'])) ?>" class="pt-active-card">
                        <span class="pt-active-icon"><?= esc($moduleDef['icon']) ?></span>
                        <span class="pt-active-copy">
                            <strong><?= esc($moduleDef['name']) ?></strong>
                            <span><?= esc($moduleDef['desc']) ?></span>
                        </span>
                    </a>
                <?php endforeach; ?>
            <?php endif; ?>
        </div>
    </section>

    <section class="dashboard-panel">
        <div class="dashboard-panel-header">
            <div>
                <h2>Recent Stats</h2>
            </div>
            <a href="<?= dashboardPageUrl('stats') ?>" class="btn-icon btn-secondary-ui"><span class="i">📊</span> Analytics</a>
        </div>
        <div class="dashboard-kpi-grid">
            <?php foreach ($portalRecentStats as $item): ?>
                <div class="dashboard-kpi">
                    <div class="dashboard-kpi-label"><?= esc($item['label']) ?></div>
                    <div class="dashboard-kpi-value"><?= esc($item['value']) ?></div>
                    <div class="dashboard-kpi-help"><?= esc($item['help']) ?></div>
                </div>
            <?php endforeach; ?>
        </div>
    </section>

    <section class="dashboard-panel">
        <div class="dashboard-panel-header">
            <div>
                <h2>Letzte Aktivitaet</h2>
            </div>
            <a href="<?= dashboardPageUrl('activity') ?>" class="btn-icon btn-secondary-ui"><span class="i">⚡</span> Alle anzeigen</a>
        </div>
        <div class="pt-activity-list">
            <?php if (empty($portalActivity)): ?>
                <div class="dashboard-list-item">
                    <div>
                        <strong>Noch keine Aktivitaet</strong>
                        <p>Sobald Moderation, Tickets, Voice oder Leveling Daten anfallen, tauchen sie hier auf.</p>
                    </div>
                </div>
            <?php else: ?>
                <?php foreach ($portalActivity as $activityItem): ?>
                    <?php $activityMeta = portalActivityMeta($activityItem['type'] ?? ''); ?>
                    <article class="pt-activity-item">
                        <div class="pt-activity-icon"><?= esc($activityMeta['icon']) ?></div>
                        <div class="pt-activity-copy">
                            <strong><?= esc(($activityItem['userName'] ?? 'User') . ' · ' . ($activityMeta['label'] ?? 'Event')) ?></strong>
                            <p><?= esc($activityItem['description'] ?? 'Neues Event') ?></p>
                            <div class="pt-activity-meta">
                                <?php if (!empty($activityItem['actorName'])): ?><span>von <?= esc($activityItem['actorName']) ?></span><?php endif; ?>
                                <?php if (!empty($activityItem['channelName'])): ?><span><?= esc($activityItem['channelName']) ?></span><?php endif; ?>
                                <span><?= esc(portalRelativeTime($activityItem['createdAt'] ?? null)) ?></span>
                            </div>
                        </div>
                    </article>
                <?php endforeach; ?>
            <?php endif; ?>
        </div>
    </section>

    <section class="dashboard-panel" id="setup-wizard">
        <?php if ($wizardDone >= 4): ?>
            <div class="pt-setup-done">
                <div>
                    <strong>Setup abgeschlossen</strong>
                </div>
                <span><?= $wizardDone ?>/<?= $wizardTotal ?> erledigt</span>
            </div>
        <?php else: ?>
            <div class="dashboard-panel-header">
                <div>
                    <h2>Setup Status</h2>
                </div>
                <span class="status-badge <?php echo $wizardPct === 100 ? 'active' : 'warning'; ?>"><?= $wizardDone ?>/<?= $wizardTotal ?></span>
            </div>
            <div class="pt-step-grid">
                <?php foreach ($setupSteps as $step): ?>
                    <a href="<?= esc($step['href']) ?>" class="pt-step-card <?= $step['done'] ? 'done' : '' ?>" <?= $step['external'] ? 'target="_blank" rel="noopener"' : '' ?>>
                        <div class="pt-step-top">
                            <div class="pt-step-icon"><?= $step['icon'] ?></div>
                            <div class="pt-step-status"><?= $step['done'] ? 'Done' : 'Next' ?></div>
                        </div>
                        <div class="pt-step-name"><?= esc($step['title']) ?></div>
                        <div class="pt-step-text"><?= esc($step['text']) ?></div>
                        <div class="pt-step-action"><?= esc($step['action']) ?> →</div>
                    </a>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>
    </section>

    <!-- GUILD SELECTOR -->
    <div class="pt-section">
        <div class="pt-section-title">
            <span>🏰</span> Your Servers
            <?php if ($selectedGuild): ?>
                <span class="pt-selected-pill">Selected: <?= esc($selectedGuild['name']) ?></span>
            <?php endif; ?>
        </div>
        <div class="pt-guild-grid">
            <?php foreach ($manageableGuilds as $g): 
                $icon = $g['icon'] ? (strpos($g['icon'], 'http') === 0 ? $g['icon'] : "https://cdn.discordapp.com/icons/{$g['id']}/{$g['icon']}.png") : null;
            ?>
                <a href="portal.php?guildId=<?= urlencode($g['id']) ?>" class="pt-guild-card <?= $selectedGuildId === $g['id'] ? 'active' : '' ?>">
                    <?php if ($icon): ?>
                        <img src="<?= esc($icon) ?>" class="pt-guild-icon" alt="">
                    <?php else: ?>
                        <div class="pt-guild-icon" style="display:flex; align-items:center; justify-content:center; font-size:1.5rem;">🏰</div>
                    <?php endif; ?>
                    <div class="pt-guild-info">
                        <div class="pt-guild-name"><?= esc($g['name']) ?></div>
                        <div class="pt-guild-meta"><?= number_format($g['memberCount']) ?> Members<?= $selectedGuildId === $g['id'] ? ' · Active' : '' ?></div>
                    </div>
                    <span class="i" style="color:var(--text-secondary);"><?= $selectedGuildId === $g['id'] ? '✓' : '➔' ?></span>
                </a>
            <?php endforeach; ?>
            <?php if (empty($manageableGuilds)): ?>
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <strong>Keine verwaltbaren Server gefunden</strong>
                    <p>Lade den Bot auf einen Server ein oder pruefe deine Berechtigungen.</p>
                    <a href="https://discord.com/oauth2/authorize?client_id=1487187616674611321&permissions=1654096264208&scope=bot+applications.commands" target="_blank" class="btn-icon cta btn-primary-ui">Bot einladen</a>
                </div>
            <?php endif; ?>
        </div>
    </div>

    <div class="dashboard-inline-actions" style="justify-content:center; padding-top:0.25rem;">
        <a href="https://top.gg/bot/1487187616674611321/vote" target="_blank" class="btn-icon btn-secondary-ui">⭐ Vote</a>
        <a href="redeem.php" class="btn-icon btn-secondary-ui">🎟️ Redeem</a>
        <a href="https://discord.gg/zfzDHKcWDx" target="_blank" class="btn-icon btn-secondary-ui">💬 Support</a>
    </div>
</div>

<?php include '../includes/footer.php'; ?>
