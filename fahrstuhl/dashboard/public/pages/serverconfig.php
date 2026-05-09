<?php
$page_title = 'Server Overview';
require_once __DIR__ . '/../includes/config.php';
requireLogin();

$guildId = $_GET['id'] ?? ($_GET['guildId'] ?? ($_POST['guildId'] ?? ($_SESSION['selected_guild_id'] ?? '')));
if (!$guildId) { header('Location: ' . BASE_URL . '/pages/portal.php'); exit(); }
$_SESSION['selected_guild_id'] = $guildId;

if (!isAdmin() && !isServerAdmin($guildId)) {
    header('Location: ' . BASE_URL . '/pages/portal.php'); exit();
}

$guildRes = getAPI('/guilds/' . $guildId);
$guild = $guildRes['data'] ?? null;
if (!$guild) { header('Location: ' . BASE_URL . '/pages/portal.php'); exit(); }

$msg = '';
$msgType = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    if ($action === 'settrollrole') {
        $r = api('/guilds/' . $guildId . '/config', 'POST', [
            'key' => 'trollRoleId',
            'roleId' => $_POST['role_id'] ?? ''
        ]);
        $msg = $r['data']['message'] ?? 'Troll role updated.';
        $msgType = ($r['data']['success'] ?? false) ? 'success' : 'error';
    } elseif ($action === 'setrole') {
        $r = api('/guilds/' . $guildId . '/config', 'POST', [
            'key' => 'roleId',
            'roleId' => $_POST['role_id'] ?? ''
        ]);
        $msg = $r['data']['message'] ?? 'Auto-move role updated.';
        $msgType = ($r['data']['success'] ?? false) ? 'success' : 'error';
    } elseif ($action === 'setadminrole') {
        $r = api('/guilds/' . $guildId . '/config', 'POST', [
            'key' => 'adminRoleId',
            'roleId' => $_POST['role_id'] ?? ''
        ]);
        $msg = $r['data']['message'] ?? 'Admin role updated.';
        $msgType = ($r['data']['success'] ?? false) ? 'success' : 'error';
    } elseif ($action === 'setdashboardaccess') {
        $moduleRolesRaw = $_POST['module_roles'] ?? [];
        $moduleRoles = [];
        if (is_array($moduleRolesRaw)) {
            foreach ($moduleRolesRaw as $moduleKey => $roleIds) {
                if (!is_array($roleIds)) continue;
                $moduleRoles[$moduleKey] = array_values(array_filter(array_map('strval', $roleIds), fn($id) => trim($id) !== ''));
            }
        }

        $r = api('/guilds/' . $guildId . '/config', 'POST', [
            'key' => 'dashboardModuleRoles',
            'moduleRoles' => $moduleRoles,
        ]);
        $msg = $r['data']['message'] ?? 'Dashboard access updated.';
        $msgType = ($r['data']['success'] ?? false) ? 'success' : 'error';
    }

    $guildRes = getAPI('/guilds/' . $guildId);
    $guild = $guildRes['data'] ?? $guild;
}

$config = $guild['config'] ?? [];
$roles = $guild['roles'] ?? [];
$modules = $config['modules'] ?? [];
$permissions = $guild['permissions'] ?? [];
$permissionChecks = $guild['permissionChecks'] ?? [];
$channels = $guild['channels'] ?? [];
$analytics = $guild['analytics'] ?? [];
$activeTrolls = $guild['activeTrolls']['total'] ?? 0;
$enabledModules = array_values(array_filter($modules, fn($module) => !empty($module['enabled'])));
$totalModules = count($modules);
$setupChecks = [
    ['label' => 'Admin role', 'done' => !empty($config['adminRoleId']), 'text' => !empty($config['adminRoleName']) ? $config['adminRoleName'] : 'Set dashboard access'],
    ['label' => 'Troll role', 'done' => !empty($config['trollRoleId']), 'text' => !empty($config['trollRoleName']) ? $config['trollRoleName'] : 'Limit troll commands'],
    ['label' => 'Modules', 'done' => count($enabledModules) > 0, 'text' => count($enabledModules) . ' active'],
    ['label' => 'Manage roles', 'done' => !empty($permissions['manageRoles']) || !empty($permissions['administrator']), 'text' => 'Required for role features'],
    ['label' => 'Move members', 'done' => !empty($permissions['moveMembers']) || !empty($permissions['administrator']), 'text' => 'Required for voice tools'],
    ['label' => 'Send messages', 'done' => !empty($permissions['sendMessages']) || !empty($permissions['administrator']), 'text' => 'Required for responses'],
];
$setupDone = count(array_filter($setupChecks, fn($check) => !empty($check['done'])));
$setupTotal = count($setupChecks);
$setupPercent = $setupTotal > 0 ? round(($setupDone / $setupTotal) * 100) : 0;
$quickActions = [
    ['label' => 'Modules', 'icon' => '▦', 'href' => BASE_URL . '/pages/modules.php?guildId=' . urlencode($guildId), 'tone' => '#5865f2'],
    ['label' => 'Moderation', 'icon' => '!', 'href' => BASE_URL . '/pages/moderation.php?guildId=' . urlencode($guildId), 'tone' => '#f23f43'],
    ['label' => 'AutoMod', 'icon' => 'A', 'href' => BASE_URL . '/pages/automod.php?guildId=' . urlencode($guildId), 'tone' => '#f97316'],
    ['label' => 'Welcome', 'icon' => '+', 'href' => BASE_URL . '/pages/welcome.php?guildId=' . urlencode($guildId), 'tone' => '#23a559'],
    ['label' => 'Reaction Roles', 'icon' => 'R', 'href' => BASE_URL . '/pages/reaction-roles.php?guildId=' . urlencode($guildId), 'tone' => '#a855f7'],
    ['label' => 'Tickets', 'icon' => '#', 'href' => BASE_URL . '/pages/tickets.php?guildId=' . urlencode($guildId), 'tone' => '#f0b232'],
    ['label' => 'Logging', 'icon' => 'L', 'href' => BASE_URL . '/pages/logging.php?guildId=' . urlencode($guildId), 'tone' => '#7c83ff'],
    ['label' => 'Leveling', 'icon' => '^', 'href' => BASE_URL . '/pages/leveling.php?guildId=' . urlencode($guildId), 'tone' => '#3b82f6'],
    ['label' => 'Voice Time', 'icon' => 'T', 'href' => BASE_URL . '/pages/voice-time.php?guildId=' . urlencode($guildId), 'tone' => '#06b6d4'],
];
$dashboardModuleDefs = [
    'welcome' => 'Welcome',
    'moderation' => 'Moderation',
    'logging' => 'Logging',
    'tickets' => 'Tickets',
    'automod' => 'AutoMod',
    'leveling' => 'Leveling',
    'reactionRoles' => 'Reaction Roles',
    'social' => 'Social Alerts',
    'tempVoice' => 'Temp Voice',
    'stats' => 'Stats',
];
$dashboardAccess = $config['dashboardAccess'] ?? ($config['dashboardPermissions'] ?? []);
$dashboardModuleRoles = $dashboardAccess['moduleRoles'] ?? [];
?>
<?php require_once __DIR__ . '/../includes/header.php'; ?>
<?php require_once __DIR__ . '/../includes/sidebar.php'; ?>

<style>
.server-hero { display:grid; grid-template-columns:minmax(0,1fr) minmax(300px,380px); gap:1rem; align-items:stretch; margin-bottom:1rem; }
.server-hero-main { border:1px solid rgba(52,61,77,.88); border-radius:16px; padding:1rem; background:rgba(23,27,35,.96); display:grid; gap:.85rem; }
.server-identity { display:flex; align-items:center; gap:.9rem; min-width:0; }
.server-icon { width:56px; height:56px; border-radius:16px; background:rgba(255,255,255,.04); border:1px solid rgba(52,61,77,.88); display:flex; align-items:center; justify-content:center; overflow:hidden; font-size:1.35rem; font-weight:900; color:#fff; flex:0 0 auto; }
.server-icon img { width:100%; height:100%; object-fit:cover; }
.server-title h1 { margin:0 0 .25rem; font-size:1.8rem; line-height:1.1; }
.server-title p { margin:0; color:var(--text-secondary); }
.server-stats { display:grid; grid-template-columns:repeat(4,minmax(110px,1fr)); gap:.55rem; }
.server-stat { padding:.72rem; border-radius:12px; background:rgba(15,18,24,.68); border:1px solid rgba(52,61,77,.8); }
.server-stat strong { display:block; font-size:1.25rem; color:var(--text-primary); }
.server-stat span { color:var(--text-secondary); font-size:.78rem; font-weight:850; text-transform:uppercase; letter-spacing:.05em; }
.setup-panel { border:1px solid var(--border-light); border-radius:16px; padding:.9rem; background:var(--panel); display:grid; gap:.75rem; }
.setup-head { display:flex; justify-content:space-between; gap:.8rem; align-items:flex-start; }
.setup-head h2 { margin:0; font-size:1.05rem; }
.setup-score { color:#fff; background:#5865f2; border-radius:999px; padding:.25rem .6rem; font-weight:900; font-size:.78rem; white-space:nowrap; }
.setup-bar { height:8px; border-radius:999px; overflow:hidden; background:rgba(160,174,192,.14); }
.setup-fill { height:100%; width:var(--setup); background:#23a559; border-radius:999px; }
.setup-list { display:grid; gap:.55rem; }
.setup-item { display:flex; align-items:center; gap:.7rem; padding:.62rem; border-radius:12px; background:rgba(32,38,49,.76); border:1px solid rgba(52,61,77,.68); }
.setup-mark { width:24px; height:24px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex:0 0 auto; font-size:.8rem; font-weight:900; }
.setup-item.done .setup-mark { background:rgba(35,165,89,.15); color:#51cf66; border:1px solid rgba(81,207,102,.28); }
.setup-item.todo .setup-mark { background:rgba(240,178,50,.13); color:#f0b232; border:1px solid rgba(240,178,50,.26); }
.setup-copy strong { display:block; font-size:.88rem; }
.setup-copy span { color:var(--text-secondary); font-size:.78rem; }
.overview-grid { display:grid; grid-template-columns:1.25fr .75fr; gap:1rem; align-items:start; }
.overview-section { border:1px solid var(--border-light); border-radius:16px; padding:.9rem; background:var(--panel); margin-bottom:1rem; }
.section-title { display:flex; align-items:center; justify-content:space-between; gap:.75rem; margin-bottom:.9rem; }
.section-title h2 { margin:0; font-size:1.05rem; }
.section-title p { margin:.18rem 0 0; color:var(--text-secondary); font-size:.86rem; }
.quick-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:.6rem; }
.quick-action { display:flex; align-items:center; gap:.65rem; min-height:50px; padding:.65rem; border-radius:12px; border:1px solid rgba(52,61,77,.78); background:rgba(32,38,49,.74); color:var(--text-primary); text-decoration:none; font-weight:900; }
.quick-action:hover { border-color:color-mix(in srgb, var(--tone) 62%, transparent); background:color-mix(in srgb, var(--tone) 12%, rgba(32,38,49,.88)); transform:translateY(-1px); }
.quick-icon { width:34px; height:34px; border-radius:10px; display:flex; align-items:center; justify-content:center; background:color-mix(in srgb, var(--tone) 18%, transparent); border:1px solid color-mix(in srgb, var(--tone) 32%, transparent); color:#fff; flex:0 0 auto; }
.module-mini-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:.7rem; }
.module-mini { border:1px solid rgba(52,61,77,.78); background:rgba(32,38,49,.68); border-radius:12px; padding:.75rem; display:grid; gap:.45rem; min-height:108px; }
.module-mini-top { display:flex; align-items:flex-start; justify-content:space-between; gap:.7rem; }
.module-mini h3 { margin:0; font-size:.96rem; }
.module-mini p { margin:0; color:var(--text-secondary); font-size:.82rem; line-height:1.4; }
.state-pill { display:inline-flex; align-items:center; gap:.35rem; border-radius:999px; padding:.22rem .5rem; font-size:.7rem; font-weight:900; text-transform:uppercase; white-space:nowrap; }
.state-pill.on { color:#51cf66; background:rgba(81,207,102,.12); border:1px solid rgba(81,207,102,.32); }
.state-pill.off { color:#a0aec0; background:rgba(160,174,192,.08); border:1px solid rgba(160,174,192,.2); }
.config-form-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:1rem; }
.role-card { border:1px solid rgba(52,61,77,.78); background:rgba(32,38,49,.68); border-radius:14px; padding:.9rem; display:grid; gap:.7rem; }
.role-card h3 { margin:0; font-size:1rem; }
.role-card p { margin:0; color:var(--text-secondary); font-size:.84rem; line-height:1.45; }
.form-group { display:grid; gap:.4rem; }
.form-group label { font-size:.76rem; color:var(--text-secondary); font-weight:900; text-transform:uppercase; letter-spacing:.05em; }
.form-group select { width:100%; background:var(--bg-tertiary); border:1px solid var(--border-light); color:var(--text-primary); padding:.72rem .8rem; border-radius:12px; font-size:.9rem; }
.dashboard-access-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:.75rem; }
.dashboard-access-item { border:1px solid rgba(52,61,77,.7); border-radius:12px; background:rgba(32,38,49,.62); padding:.7rem; display:grid; gap:.4rem; }
.dashboard-access-item strong { font-size:.86rem; }
.dashboard-access-item small { color:var(--text-secondary); font-size:.76rem; }
.dashboard-access-item select { min-height:110px; }
.btn-save { min-height:40px; background:#5865f2; color:#fff; border:1px solid #5865f2; padding:.65rem 1rem; border-radius:12px; cursor:pointer; font-weight:900; }
.btn-save:hover { background:#4752c4; border-color:#4752c4; }
.alert { padding:.75rem 1rem; border-radius:12px; margin-bottom:1rem; font-weight:800; border:1px solid; }
.alert-success { background:rgba(81,207,102,.12); border-color:rgba(81,207,102,.35); color:#51cf66; }
.alert-error { background:rgba(255,107,107,.12); border-color:rgba(255,107,107,.35); color:#ff6b6b; }
.permission-list { display:grid; gap:.55rem; }
.permission-row { display:flex; align-items:flex-start; gap:.65rem; border:1px solid rgba(52,61,77,.7); border-radius:12px; padding:.7rem; background:rgba(32,38,49,.62); }
.permission-row.ok .setup-mark { background:rgba(81,207,102,.12); color:#51cf66; border:1px solid rgba(81,207,102,.3); }
.permission-row.warn .setup-mark { background:rgba(242,63,67,.13); color:#ff9b9d; border:1px solid rgba(242,63,67,.28); }
.permission-row strong { display:block; font-size:.88rem; }
.permission-row span { color:var(--text-secondary); font-size:.78rem; line-height:1.35; }
.danger-note { border-color:rgba(242,63,67,.28); background:rgba(242,63,67,.08); color:#ffb4b5; }
@media (max-width: 980px) { .server-hero, .overview-grid { grid-template-columns:1fr; } .server-stats { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width: 560px) { .server-identity { align-items:flex-start; } .server-stats, .quick-grid, .module-mini-grid { grid-template-columns:1fr; } }
</style>

<section class="dashboard-page-header">
    <div class="dashboard-page-copy">
        <span class="dashboard-page-eyebrow">Server Tools</span>
        <h1>Server Config · <?= esc($guild['name'] ?? 'Server') ?></h1>
        <p>Zentrale Server-Einstellungen: Rollen, Dashboard-Zugriff, Health-Checks und direkte Spruenge in die wichtigsten Bereiche.</p>
        <div class="dashboard-page-meta">
            <span class="status-badge <?= $setupPercent >= 100 ? 'active' : 'warning' ?>">Setup <?= $setupPercent ?>%</span>
            <span class="status-badge <?= count($enabledModules) > 0 ? 'active' : 'inactive' ?>"><?= count($enabledModules) ?>/<?= $totalModules ?> Module</span>
            <span class="status-badge <?= !empty($config['adminRoleId']) ? 'active' : 'warning' ?>"><?= !empty($config['adminRoleId']) ? 'Admin-Rolle gesetzt' : 'Admin-Rolle fehlt' ?></span>
        </div>
    </div>
    <div class="dashboard-page-actions">
        <a href="<?= BASE_URL ?>/pages/portal.php?guildId=<?= urlencode($guildId) ?>" class="btn-icon btn-secondary-ui"><span class="i">🏠</span> Portal</a>
        <a href="<?= BASE_URL ?>/pages/modules.php?guildId=<?= urlencode($guildId) ?>" class="btn-icon btn-secondary-ui"><span class="i">🧩</span> Modules</a>
        <a href="<?= BASE_URL ?>/pages/tickets.php?guildId=<?= urlencode($guildId) ?>" class="btn-icon btn-primary-ui"><span class="i">🎫</span> Tickets</a>
    </div>
</section>

<?php if ($msg): ?>
<div class="alert alert-<?= esc($msgType) ?>"><?= esc($msg) ?></div>
<?php endif; ?>

<div class="server-hero">
    <div class="server-hero-main">
        <div class="server-identity">
            <div class="server-icon">
                <?php if (!empty($guild['iconUrl'])): ?>
                    <img src="<?= esc($guild['iconUrl']) ?>" alt="">
                <?php elseif (!empty($guild['icon'])): ?>
                    <img src="https://cdn.discordapp.com/icons/<?= esc($guildId) ?>/<?= esc($guild['icon']) ?>.png?size=128" alt="">
                <?php else: ?>
                    <?= esc(strtoupper(substr($guild['name'] ?? 'S', 0, 1))) ?>
                <?php endif; ?>
            </div>
            <div class="server-title">
                <h1><?= esc($guild['name'] ?? 'Server') ?></h1>
                <p>Server setup, modules and bot permissions in one place.</p>
            </div>
        </div>
        <div class="server-stats">
            <div class="server-stat"><strong><?= formatNum($guild['memberCount'] ?? 0) ?></strong><span>Members</span></div>
            <div class="server-stat"><strong><?= formatNum($channels['total'] ?? 0) ?></strong><span>Channels</span></div>
            <div class="server-stat"><strong><?= count($enabledModules) ?>/<?= $totalModules ?></strong><span>Modules</span></div>
            <div class="server-stat"><strong><?= formatNum($activeTrolls) ?></strong><span>Active Trolls</span></div>
        </div>
    </div>

    <div class="setup-panel">
        <div class="setup-head">
            <div>
                <h2>Setup Progress</h2>
                <p style="color:var(--text-secondary);margin:.2rem 0 0;font-size:.86rem;">Core settings needed for a clean server workflow.</p>
            </div>
            <span class="setup-score"><?= $setupPercent ?>%</span>
        </div>
        <div class="setup-bar"><div class="setup-fill" style="--setup:<?= $setupPercent ?>%;"></div></div>
        <div class="setup-list">
            <?php foreach ($setupChecks as $check): ?>
            <div class="setup-item <?= !empty($check['done']) ? 'done' : 'todo' ?>">
                <span class="setup-mark"><?= !empty($check['done']) ? '✓' : '!' ?></span>
                <span class="setup-copy">
                    <strong><?= esc($check['label']) ?></strong>
                    <span><?= esc($check['text']) ?></span>
                </span>
            </div>
            <?php endforeach; ?>
        </div>
    </div>
</div>

<div class="overview-grid">
    <main>
        <section class="overview-section">
            <div class="section-title">
                <div>
                    <h2>Server Roles</h2>
                    <p>Diese Einstellungen kommen zuerst, weil sie Dashboard- und Rollen-Zugriffe direkt steuern.</p>
                </div>
            </div>
            <div class="config-form-grid">
                <div class="role-card">
                    <h3>Admin Role</h3>
                    <p>Members with this role can open this server dashboard. Server owners always have access.</p>
                    <?php if (!empty($roles)): ?>
                    <form method="POST">
                        <input type="hidden" name="action" value="setadminrole">
                        <div class="form-group">
                            <label>Select Role</label>
                            <select name="role_id">
                                <option value="">Not set</option>
                                <?php foreach ($roles as $role): ?>
                                <option value="<?= esc($role['id']) ?>" <?= ($config['adminRoleId'] ?? '') === $role['id'] ? 'selected' : '' ?>><?= esc($role['name']) ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <button type="submit" class="btn-save">Save Role</button>
                    </form>
                    <?php else: ?>
                    <p>Role list is not available from the API right now.</p>
                    <?php endif; ?>
                </div>

                <div class="role-card">
                    <h3>Troll Role</h3>
                    <p>Only members with this role can use troll commands. Leave empty only if that is intentional.</p>
                    <?php if (!empty($roles)): ?>
                    <form method="POST">
                        <input type="hidden" name="action" value="settrollrole">
                        <div class="form-group">
                            <label>Select Role</label>
                            <select name="role_id">
                                <option value="">No restriction</option>
                                <?php foreach ($roles as $role): ?>
                                <option value="<?= esc($role['id']) ?>" <?= ($config['trollRoleId'] ?? '') === $role['id'] ? 'selected' : '' ?>><?= esc($role['name']) ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <button type="submit" class="btn-save">Save Role</button>
                    </form>
                    <?php else: ?>
                    <p>Use <code>/settrollrole</code> in Discord if roles cannot be loaded.</p>
                    <?php endif; ?>
                </div>

                <div class="role-card">
                    <h3>Auto-Move Role</h3>
                    <p>Members with this role are used by the optional automatic voice movement behavior.</p>
                    <?php if (!empty($roles)): ?>
                    <form method="POST">
                        <input type="hidden" name="action" value="setrole">
                        <div class="form-group">
                            <label>Select Role</label>
                            <select name="role_id">
                                <option value="">None</option>
                                <?php foreach ($roles as $role): ?>
                                <option value="<?= esc($role['id']) ?>" <?= ($config['autoMoveRoleId'] ?? '') === $role['id'] ? 'selected' : '' ?>><?= esc($role['name']) ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <button type="submit" class="btn-save">Save Role</button>
                    </form>
                    <?php else: ?>
                    <p>Use <code>/setrole</code> in Discord if roles cannot be loaded.</p>
                    <?php endif; ?>
                </div>
            </div>
        </section>

        <section class="overview-section">
            <div class="section-title">
                <div>
                    <h2>Dashboard Zugriff</h2>
                    <p>Modulbezogene Dashboard-Rollen. Owner, Discord-Admins und die Dashboard-Admin-Rolle bleiben weiterhin erlaubt.</p>
                </div>
            </div>
            <?php if (!empty($roles)): ?>
            <form method="POST">
                <input type="hidden" name="action" value="setdashboardaccess">
                <div class="dashboard-access-grid">
                    <?php foreach ($dashboardModuleDefs as $moduleKey => $moduleLabel): ?>
                    <?php $selectedRoleIds = is_array($dashboardModuleRoles[$moduleKey] ?? null) ? $dashboardModuleRoles[$moduleKey] : []; ?>
                    <div class="dashboard-access-item">
                        <strong><?= esc($moduleLabel) ?></strong>
                        <small>Optional: ausgewaehlte Rollen koennen dieses Modul konfigurieren.</small>
                        <select name="module_roles[<?= esc($moduleKey) ?>][]" multiple>
                            <?php foreach ($roles as $role): ?>
                            <option value="<?= esc($role['id']) ?>" <?= in_array($role['id'], $selectedRoleIds, true) ? 'selected' : '' ?>><?= esc($role['name']) ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <?php endforeach; ?>
                </div>
                <button type="submit" class="btn-save" style="margin-top:.85rem;">Dashboard Zugriff speichern</button>
            </form>
            <?php else: ?>
            <p>Role list is not available from the API right now.</p>
            <?php endif; ?>
        </section>

        <section class="overview-section">
            <div class="section-title">
                <div>
                    <h2>Quick Actions</h2>
                    <p>Direkte Spruenge in die wichtigsten Konfigurationsseiten.</p>
                </div>
            </div>
            <div class="quick-grid">
                <?php foreach ($quickActions as $action): ?>
                <a class="quick-action" href="<?= esc($action['href']) ?>" style="--tone:<?= esc($action['tone']) ?>">
                    <span class="quick-icon"><?= esc($action['icon']) ?></span>
                    <span><?= esc($action['label']) ?></span>
                </a>
                <?php endforeach; ?>
            </div>
        </section>

        <section class="overview-section">
            <div class="section-title">
                <div>
                    <h2>Modules</h2>
                    <p><?= count($enabledModules) ?> enabled out of <?= $totalModules ?> available.</p>
                </div>
                <a class="btn-icon" href="<?= BASE_URL ?>/pages/modules.php?guildId=<?= urlencode($guildId) ?>"><span class="i">▦</span> Manage</a>
            </div>
            <div class="module-mini-grid">
                <?php foreach ($modules as $module): ?>
                    <?php $enabled = !empty($module['enabled']); ?>
                    <div class="module-mini">
                        <div class="module-mini-top">
                            <h3><?= esc($module['label'] ?? $module['key'] ?? 'Module') ?></h3>
                            <span class="state-pill <?= $enabled ? 'on' : 'off' ?>"><?= $enabled ? 'On' : 'Off' ?></span>
                        </div>
                        <p><?= esc($module['description'] ?? 'Configure this server feature from the modules page.') ?></p>
                    </div>
                <?php endforeach; ?>
            </div>
        </section>
    </main>

    <aside>
        <section class="overview-section">
            <div class="section-title">
                <div>
                    <h2>Bot Health</h2>
                    <p>Permission checks for the current server.</p>
                </div>
            </div>
            <div class="permission-list">
                <?php if (!empty($permissionChecks)): ?>
                    <?php foreach ($permissionChecks as $check): ?>
                    <?php
                        $ok = !empty($check['ok']) || !empty($check['passed']) || (($check['status'] ?? '') === 'ok');
                        $title = $check['label'] ?? $check['name'] ?? 'Permission check';
                        $text = $ok
                            ? ($check['message'] ?? $check['description'] ?? 'Configured correctly.')
                            : ($check['fix'] ?? $check['impact'] ?? $check['message'] ?? $check['description'] ?? 'Needs attention.');
                    ?>
                    <div class="permission-row <?= $ok ? 'ok' : 'warn' ?>">
                        <span class="setup-mark"><?= $ok ? '✓' : '!' ?></span>
                        <span>
                            <strong><?= esc($title) ?></strong>
                            <span><?= esc($text) ?></span>
                        </span>
                    </div>
                    <?php endforeach; ?>
                <?php else: ?>
                    <?php foreach ($setupChecks as $check): ?>
                    <div class="permission-row <?= !empty($check['done']) ? 'ok' : 'warn' ?>">
                        <span class="setup-mark"><?= !empty($check['done']) ? '✓' : '!' ?></span>
                        <span>
                            <strong><?= esc($check['label']) ?></strong>
                            <span><?= esc($check['text']) ?></span>
                        </span>
                    </div>
                    <?php endforeach; ?>
                <?php endif; ?>
            </div>
        </section>

        <section class="overview-section <?= $activeTrolls > 0 ? 'danger-note' : '' ?>">
            <div class="section-title">
                <div>
                    <h2>Active Trolls</h2>
                    <p>Current running troll actions on this server.</p>
                </div>
            </div>
            <?php if ($activeTrolls > 0): ?>
                <p style="margin:0 0 .55rem;">There are <strong><?= formatNum($activeTrolls) ?></strong> active troll actions.</p>
                <p style="margin:0;color:var(--text-secondary);font-size:.85rem;">Use <code>/globalstop</code> in Discord to stop them.</p>
            <?php else: ?>
                <p style="margin:0;color:#51cf66;font-weight:900;">No active troll actions right now.</p>
            <?php endif; ?>
        </section>

        <section class="overview-section">
            <div class="section-title">
                <div>
                    <h2>Server Info</h2>
                    <p>Basic Discord metadata.</p>
                </div>
            </div>
            <div class="permission-list">
                <div class="permission-row ok"><span class="setup-mark">#</span><span><strong>Owner</strong><span><?= esc($guild['ownerName'] ?? 'Unknown') ?></span></span></div>
                <div class="permission-row ok"><span class="setup-mark">R</span><span><strong>Roles</strong><span><?= formatNum($guild['roleCount'] ?? count($roles)) ?> roles loaded</span></span></div>
                <div class="permission-row ok"><span class="setup-mark">M</span><span><strong>Messages</strong><span><?= formatNum($analytics['messages'] ?? 0) ?> tracked</span></span></div>
            </div>
        </section>
    </aside>
</div>

<?php require_once __DIR__ . '/../includes/footer.php'; ?>
