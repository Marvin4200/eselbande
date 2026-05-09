<?php
$page_title = 'Moderation';
require_once __DIR__ . '/../includes/config.php';
requireLogin();

$voiceGuildsRaw = getAPI('/voice/guilds', 8);
$manageableGuilds = $voiceGuildsRaw['data']['guilds'] ?? [];
$health = [];
$warnings = [];
if (isAdmin()) {
    $healthRaw = getAPI('/health/summary', 8);
    $health = $healthRaw['data'] ?? [];
    $warnings = $health['warnings'] ?? [];
}
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<div class="page-header">
    <div class="page-header-row">
        <div>
            <h1>🛡️ Moderation</h1>
            <p class="subtitle">Moderation-Tools für Server, die du besitzt oder administrierst.</p>
        </div>
        <div class="page-meta">Last refresh: <?php echo date('d.m.Y H:i'); ?></div>
    </div>
</div>

<div class="stats-grid" style="margin-bottom:1rem;">
    <div class="stat-card"><div class="stat-icon">🏰</div><div class="stat-label">Your Servers</div><div class="stat-value"><?php echo formatNum(count($manageableGuilds)); ?></div><p style="color:#aaa;">moderation access</p></div>
    <div class="stat-card"><div class="stat-icon">⚠️</div><div class="stat-label">Warnings</div><div class="stat-value"><?php echo isAdmin() ? formatNum($health['overall']['warnings'] ?? count($warnings)) : 'Scoped'; ?></div><p style="color:#aaa;">per server history</p></div>
    <div class="stat-card"><div class="stat-icon">⏳</div><div class="stat-label">Timeouts</div><div class="stat-value">Ready</div><p style="color:#aaa;">needs bot permission</p></div>
    <div class="stat-card"><div class="stat-icon">📝</div><div class="stat-label">Mod Notes</div><div class="stat-value">Ready</div><p style="color:#aaa;">internal history</p></div>
</div>

<div class="hub-grid" style="margin-bottom:1rem;">
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/moderation.php">
        <h3>🛡️ Moderation Console</h3>
        <p>Warns, Mod Notes, Timeouts und User-History verwalten.</p>
    </a>
    <?php if (isAdmin()): ?>
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/security.php">
        <h3>🔐 Permission Check</h3>
        <p>Find missing bot permissions and concrete fixes per server.</p>
    </a>
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/blacklist.php">
        <h3>🚫 Blacklist</h3>
        <p>Block abusive users or servers from bot features.</p>
    </a>
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/audit.php">
        <h3>🧾 Audit Log</h3>
        <p>Review dashboard actions, deploys and admin changes.</p>
    </a>
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/logs.php">
        <h3>📋 Runtime Logs</h3>
        <p>Live bot logs for debugging moderation and permission issues.</p>
    </a>
    <?php endif; ?>
</div>

<?php if (!isAdmin() && empty($manageableGuilds)): ?>
    <div class="section">
        <h2>No moderation access yet</h2>
        <p style="color:var(--text-secondary);">You need to be the server owner, have Discord Administrator/Manage Server permission, or have the configured Fahrstuhl Dashboard Admin Role.</p>
    </div>
<?php endif; ?>

<div class="section">
    <div class="section-header"><h2>Next Moderation Features</h2></div>
    <div class="hub-grid">
        <div class="hub-card"><h3>Escalation Rules</h3><p>Next step: auto-escalate repeated warnings into timed actions.</p></div>
        <div class="hub-card"><h3>Member Case Page</h3><p>Next step: compact case history directly on each user detail page.</p></div>
        <div class="hub-card"><h3>Mod Commands</h3><p>Next step: slash commands for warn/note/timeout from Discord.</p></div>
    </div>
</div>

<?php include '../includes/footer.php'; ?>
