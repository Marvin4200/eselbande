<?php
$page_title = 'Server Home';
require_once __DIR__ . '/../includes/config.php';
requireLogin();

$guildId = trim($_GET['id'] ?? '');
if ($guildId === '') { header('Location: ' . BASE_URL . '/pages/guilds.php'); exit(); }
$_SESSION['selected_guild_id'] = $guildId;

$raw = getAPI('/guilds/' . urlencode($guildId));
$g = $raw['data'] ?? null;
if (!$g) { header('Location: ' . BASE_URL . '/pages/guilds.php'); exit(); }

$analytics = $g['analytics'] ?? [];
$permissions = $g['permissions'] ?? [];
$permissionChecks = $g['permissionChecks'] ?? [];
$activeTrolls = $g['activeTrolls'] ?? ['total' => 0, 'details' => []];
$modules = $g['config']['modules'] ?? [];
$enabledModules = array_values(array_filter($modules, fn($module) => !empty($module['enabled'])));
$problemChecks = array_values(array_filter($permissionChecks, fn($check) => empty($check['ok'])));
$moduleLinks = [
    'moderation' => 'moderation.php',
    'automod' => 'automod.php',
    'leveling' => 'leveling.php',
    'welcome' => 'welcome.php',
    'reactionRoles' => 'reaction-roles.php',
    'tickets' => 'tickets.php',
    'logging' => 'logging.php',
];
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.server-shell { display:grid; gap:1rem; }
.server-back { color:var(--text-secondary); text-decoration:none; font-weight:800; font-size:.9rem; }
.server-hero { display:grid; grid-template-columns:minmax(0,1fr) minmax(280px,360px); gap:1rem; align-items:stretch; }
.server-hero-main { border:1px solid rgba(88,101,242,.28); border-radius:16px; padding:1.1rem; background:linear-gradient(135deg,rgba(88,101,242,.16),rgba(23,27,35,.96)); display:grid; gap:1rem; }
.server-title { display:flex; align-items:center; gap:.9rem; min-width:0; }
.server-icon { width:64px; height:64px; border-radius:18px; object-fit:cover; background:var(--bg-tertiary); display:flex; align-items:center; justify-content:center; font-size:1.6rem; flex-shrink:0; }
.server-title h1 { margin:0; font-size:1.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.server-title p { margin:.2rem 0 0; color:var(--text-secondary); font-size:.9rem; }
.server-hero-side, .server-card { border:1px solid var(--border-light); border-radius:16px; padding:1rem; background:var(--panel); }
.server-hero-side { display:grid; gap:.7rem; }
.server-actions { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.55rem; }
.server-stats { display:grid; grid-template-columns:repeat(4,minmax(120px,1fr)); gap:.7rem; }
.server-stat { border:1px solid rgba(52,61,77,.78); background:rgba(32,38,49,.72); border-radius:12px; padding:.75rem; }
.server-stat strong { display:block; font-size:1.22rem; color:var(--text-primary); }
.server-stat span { color:var(--text-secondary); font-size:.72rem; font-weight:900; text-transform:uppercase; letter-spacing:.05em; }
.server-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(320px,.46fr); gap:1rem; align-items:start; }
.server-card { display:grid; gap:.9rem; }
.server-card h2 { margin:0; font-size:1.05rem; }
.server-card p { margin:0; color:var(--text-secondary); font-size:.9rem; }
.module-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:.7rem; }
.module-card { border:1px solid rgba(64,72,84,.72); background:rgba(32,38,49,.62); border-radius:12px; padding:.8rem; display:grid; gap:.55rem; color:inherit; text-decoration:none; }
.module-card.on { border-color:rgba(81,207,102,.35); }
.module-card.off { opacity:.72; }
.module-top { display:flex; justify-content:space-between; align-items:center; gap:.7rem; }
.module-name { font-weight:900; }
.status-pill { display:inline-flex; align-items:center; border-radius:999px; padding:.2rem .45rem; font-size:.7rem; font-weight:900; text-transform:uppercase; }
.status-pill.on { color:#51cf66; background:rgba(81,207,102,.12); border:1px solid rgba(81,207,102,.28); }
.status-pill.off { color:#aaa; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.1); }
.check-list { display:grid; gap:.55rem; }
.check-row { display:grid; grid-template-columns:1fr auto; gap:.8rem; border:1px solid rgba(64,72,84,.68); border-radius:12px; padding:.75rem; background:rgba(32,38,49,.55); }
.check-row.ok { border-color:rgba(81,207,102,.25); }
.check-row.fix { border-color:rgba(255,107,107,.28); }
.check-row strong { display:block; margin-bottom:.18rem; }
.check-row small { color:var(--text-secondary); line-height:1.4; }
.activity-table { width:100%; border-collapse:collapse; }
.activity-table th, .activity-table td { padding:.7rem .55rem; border-bottom:1px solid rgba(64,72,84,.45); text-align:left; vertical-align:top; }
.activity-table th { color:var(--text-secondary); font-size:.75rem; text-transform:uppercase; letter-spacing:.05em; }
.config-list { display:grid; gap:.55rem; }
.config-row { display:flex; justify-content:space-between; gap:1rem; border-bottom:1px solid rgba(64,72,84,.45); padding-bottom:.5rem; }
.config-row span { color:var(--text-secondary); }
@media (max-width: 1000px) { .server-hero, .server-grid { grid-template-columns:1fr; } .server-stats { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width: 560px) { .server-stats, .server-actions { grid-template-columns:1fr; } .server-title h1 { white-space:normal; } }
</style>

<div class="server-shell">
    <a class="server-back" href="<?php echo BASE_URL; ?>/pages/guilds.php">← Back to servers</a>

    <div class="server-hero">
        <div class="server-hero-main">
            <div class="server-title">
                <?php if (!empty($g['iconUrl'])): ?>
                    <img class="server-icon" src="<?php echo esc($g['iconUrl']); ?>" alt="">
                <?php else: ?>
                    <div class="server-icon">S</div>
                <?php endif; ?>
                <div style="min-width:0;">
                    <h1><?php echo esc($g['name'] ?? 'Guild'); ?></h1>
                    <p>ID <?php echo esc($g['id'] ?? ''); ?> · Owner <?php echo esc($g['ownerName'] ?? 'Unknown'); ?></p>
                </div>
            </div>
            <div class="server-stats">
                <div class="server-stat"><strong><?php echo formatNum($g['memberCount'] ?? 0); ?></strong><span>Members</span></div>
                <div class="server-stat"><strong><?php echo count($enabledModules); ?>/<?php echo count($modules); ?></strong><span>Modules On</span></div>
                <div class="server-stat"><strong><?php echo count($problemChecks); ?></strong><span>Permission Issues</span></div>
                <div class="server-stat"><strong style="color:<?php echo ($activeTrolls['total'] ?? 0) > 0 ? '#ff6b6b' : '#51cf66'; ?>;"><?php echo formatNum($activeTrolls['total'] ?? 0); ?></strong><span>Active Trolls</span></div>
            </div>
        </div>

        <div class="server-hero-side">
            <h2>Quick Actions</h2>
            <div class="server-actions">
                <a class="btn-icon" href="<?php echo BASE_URL; ?>/pages/modules.php?guildId=<?php echo urlencode($guildId); ?>"><span class="i">▦</span> Modules</a>
                <a class="btn-icon" href="<?php echo BASE_URL; ?>/pages/serverconfig.php?id=<?php echo urlencode($guildId); ?>"><span class="i">⚙</span> Setup</a>
                <a class="btn-icon" href="<?php echo BASE_URL; ?>/pages/logging.php?guildId=<?php echo urlencode($guildId); ?>"><span class="i">L</span> Logs</a>
                <a class="btn-icon" href="<?php echo BASE_URL; ?>/pages/moderation.php?guildId=<?php echo urlencode($guildId); ?>"><span class="i">!</span> Moderate</a>
            </div>
            <div class="config-list">
                <div class="config-row"><span>Admin Role</span><strong><?php echo esc($g['config']['adminRoleName'] ?? 'not set'); ?></strong></div>
                <div class="config-row"><span>Troll Role</span><strong><?php echo esc($g['config']['trollRoleName'] ?? 'not set'); ?></strong></div>
                <div class="config-row"><span>Channels</span><strong><?php echo formatNum($g['channels']['total'] ?? 0); ?></strong></div>
                <div class="config-row"><span>Roles</span><strong><?php echo formatNum($g['roleCount'] ?? 0); ?></strong></div>
            </div>
        </div>
    </div>

    <div class="server-grid">
        <div class="server-card">
            <h2>Modules</h2>
            <div class="module-grid">
                <?php foreach ($modules as $module): ?>
                    <?php
                        $key = $module['key'] ?? '';
                        $href = $moduleLinks[$key] ?? 'modules.php';
                    ?>
                    <a class="module-card <?php echo !empty($module['enabled']) ? 'on' : 'off'; ?>" href="<?php echo BASE_URL; ?>/pages/<?php echo esc($href); ?>?guildId=<?php echo urlencode($guildId); ?>">
                        <div class="module-top">
                            <span class="module-name"><?php echo esc(($module['icon'] ?? '') . ' ' . ($module['label'] ?? $key)); ?></span>
                            <span class="status-pill <?php echo !empty($module['enabled']) ? 'on' : 'off'; ?>"><?php echo !empty($module['enabled']) ? 'On' : 'Off'; ?></span>
                        </div>
                        <p><?php echo esc($module['description'] ?? ''); ?></p>
                    </a>
                <?php endforeach; ?>
            </div>
        </div>

        <div class="server-card">
            <h2>Permission Health</h2>
            <div class="check-list">
                <?php foreach (array_slice($permissionChecks, 0, 7) as $check): ?>
                    <div class="check-row <?php echo !empty($check['ok']) ? 'ok' : 'fix'; ?>">
                        <div>
                            <strong><?php echo esc($check['label'] ?? 'Check'); ?></strong>
                            <small><?php echo esc(!empty($check['ok']) ? ($check['detail'] ?? 'Ready') : ($check['impact'] ?? 'Needs attention')); ?></small>
                        </div>
                        <span class="status-pill <?php echo !empty($check['ok']) ? 'on' : 'off'; ?>"><?php echo !empty($check['ok']) ? 'OK' : 'Fix'; ?></span>
                    </div>
                <?php endforeach; ?>
                <?php if (empty($permissionChecks)): ?>
                    <?php foreach ($permissions as $name => $ok): ?>
                        <div class="check-row <?php echo $ok ? 'ok' : 'fix'; ?>"><strong><?php echo esc($name); ?></strong><span class="status-pill <?php echo $ok ? 'on' : 'off'; ?>"><?php echo $ok ? 'OK' : 'Fix'; ?></span></div>
                    <?php endforeach; ?>
                <?php endif; ?>
            </div>
        </div>
    </div>

    <div class="server-grid">
        <div class="server-card">
            <h2>Recent Activity</h2>
            <table class="activity-table">
                <thead><tr><th>Time</th><th>Command</th><th>User</th><th>Status</th></tr></thead>
                <tbody>
                    <?php foreach (array_slice($analytics['recent'] ?? [], 0, 8) as $row): ?>
                    <tr>
                        <td><?php echo esc(isset($row['timestamp']) ? date('d.m H:i', strtotime($row['timestamp'])) : '—'); ?></td>
                        <td><code>/<?php echo esc($row['command']); ?></code></td>
                        <td><code><?php echo esc($row['userId']); ?></code></td>
                        <td style="color:<?php echo !empty($row['success']) ? '#51cf66' : '#ff6b6b'; ?>;"><?php echo !empty($row['success']) ? 'ok' : 'error'; ?></td>
                    </tr>
                    <?php endforeach; ?>
                    <?php if (empty($analytics['recent'])): ?><tr><td colspan="4" style="text-align:center;color:#999;">No activity yet</td></tr><?php endif; ?>
                </tbody>
            </table>
        </div>

        <div class="server-card">
            <h2>Top Commands</h2>
            <table class="activity-table">
                <thead><tr><th>Command</th><th>Uses</th><th>Errors</th></tr></thead>
                <tbody>
                    <?php foreach (array_slice($analytics['topCommands'] ?? [], 0, 8) as $cmd): ?>
                    <tr><td><code>/<?php echo esc($cmd['command']); ?></code></td><td><?php echo formatNum($cmd['count']); ?></td><td><?php echo formatNum($cmd['errors']); ?></td></tr>
                    <?php endforeach; ?>
                    <?php if (empty($analytics['topCommands'])): ?><tr><td colspan="3" style="text-align:center;color:#999;">No data yet</td></tr><?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>

<?php include '../includes/footer.php'; ?>
