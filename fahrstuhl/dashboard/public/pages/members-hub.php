<?php
$page_title = 'Members';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();

$usersRaw = getAPI('/users-rich?limit=8', 8);
$users = $usersRaw['data']['users'] ?? [];
$summary = $usersRaw['data']['summary'] ?? [];

$voiceRaw = getAPI('/voice/guilds', 8);
$voiceGuilds = $voiceRaw['data']['guilds'] ?? [];
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<div class="page-header">
    <div class="page-header-row">
        <div>
            <h1>👥 Members</h1>
            <p class="subtitle">User, Voice-Aktivität, Shields und Detailansichten an einem Ort.</p>
        </div>
        <div class="page-meta">Last refresh: <?php echo date('d.m.Y H:i'); ?></div>
    </div>
</div>

<div class="stats-grid" style="margin-bottom:1rem;">
    <div class="stat-card"><div class="stat-icon">👥</div><div class="stat-label">Tracked Users</div><div class="stat-value"><?php echo formatNum(count($users)); ?></div><p style="color:#aaa;">loaded preview</p></div>
    <div class="stat-card"><div class="stat-icon">💎</div><div class="stat-label">Premium</div><div class="stat-value"><?php echo formatNum($summary['premiumCount'] ?? 0); ?></div><p style="color:#aaa;">active users</p></div>
    <div class="stat-card"><div class="stat-icon">🛡️</div><div class="stat-label">Active Shields</div><div class="stat-value"><?php echo formatNum($summary['shieldCount'] ?? 0); ?></div><p style="color:#aaa;">protected now</p></div>
    <div class="stat-card"><div class="stat-icon">⏱️</div><div class="stat-label">Voice Servers</div><div class="stat-value"><?php echo formatNum(count($voiceGuilds)); ?></div><p style="color:#aaa;">analytics enabled</p></div>
</div>

<div class="hub-grid" style="margin-bottom:1rem;">
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/users.php">
        <h3>👤 Member Directory</h3>
        <p>Alle getrackten User mit Commands, Shields, Premium und Schnellaktionen.</p>
    </a>
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/voice-time.php">
        <h3>⏱️ Voice Analytics</h3>
        <p>Voice-Zeit, Live Board, Heatmap und Reward-Audit pro Server.</p>
    </a>
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/analytics.php">
        <h3>📊 Activity Analytics</h3>
        <p>Command-Nutzung, aktive User und allgemeine Bot-Aktivität.</p>
    </a>
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/rewards-hub.php">
        <h3>🎁 Rewards</h3>
        <p>Shields, Votes, Voice Rewards und Premium-Boosts verwalten.</p>
    </a>
</div>

<div class="section">
    <div class="section-header">
        <h2>Recent Members</h2>
        <a class="btn-icon" href="<?php echo BASE_URL; ?>/pages/users.php"><span class="i">→</span> Open full list</a>
    </div>
    <div class="table-scroll">
        <table class="table table-compact">
            <thead><tr><th>User</th><th>Commands</th><th>Servers</th><th>Shields</th><th>Premium</th></tr></thead>
            <tbody>
            <?php foreach ($users as $u): ?>
                <tr>
                    <td><a href="<?php echo BASE_URL; ?>/pages/user-detail.php?id=<?php echo urlencode($u['userId'] ?? ''); ?>"><?php echo esc($u['displayName'] ?? $u['username'] ?? $u['userId']); ?></a></td>
                    <td><?php echo formatNum($u['commandCount'] ?? 0); ?></td>
                    <td><?php echo formatNum($u['activeGuilds'] ?? 0); ?></td>
                    <td><?php echo formatNum($u['shields']['owned'] ?? 0); ?></td>
                    <td><?php echo !empty($u['premium']['active']) ? '<span style="color:#51cf66;">active</span>' : '<span style="color:#777;">none</span>'; ?></td>
                </tr>
            <?php endforeach; ?>
            <?php if (empty($users)): ?><tr><td colspan="5" style="text-align:center;color:#999;">No member data yet.</td></tr><?php endif; ?>
            </tbody>
        </table>
    </div>
</div>

<?php include '../includes/footer.php'; ?>
