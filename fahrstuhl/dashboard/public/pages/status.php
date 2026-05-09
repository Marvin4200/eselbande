<?php
$page_title = 'Live Status';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();

$raw = getAPI('/system/status');
$d = $raw['data'] ?? [];
$bot = $d['bot'] ?? [];
$api = $d['api'] ?? [];
$trolls = $d['trolls'] ?? ['total' => 0, 'byType' => []];
$pm2 = $d['pm2'] ?? [];
$cache = $d['cache'] ?? [];

function bytesHuman($bytes) {
    $bytes = (int)$bytes;
    if ($bytes < 1024) return $bytes . ' B';
    if ($bytes < 1048576) return round($bytes / 1024, 1) . ' KB';
    if ($bytes < 1073741824) return round($bytes / 1048576, 1) . ' MB';
    return round($bytes / 1073741824, 1) . ' GB';
}

function uptimeHuman($ms) {
    $seconds = max(0, floor(((int)$ms) / 1000));
    $days = floor($seconds / 86400);
    $hours = floor(($seconds % 86400) / 3600);
    $mins = floor(($seconds % 3600) / 60);
    return ($days ? $days . 'd ' : '') . $hours . 'h ' . $mins . 'm';
}
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<div class="page-header">
    <h1>🟢 Live Status</h1>
    <p class="subtitle">Bot, API, PM2 processes and runtime health</p>
</div>

<div class="stats-grid">
    <div class="stat-card">
        <div class="stat-icon">🤖</div>
        <div class="stat-label">Bot</div>
        <div class="stat-value"><?php echo !empty($bot['ready']) ? 'Online' : 'Offline'; ?></div>
        <p style="color:#aaa; margin-top:.4rem;"><?php echo esc($bot['username'] ?? 'unknown'); ?></p>
    </div>
    <div class="stat-card">
        <div class="stat-icon">🌐</div>
        <div class="stat-label">Servers</div>
        <div class="stat-value"><?php echo formatNum($bot['guilds'] ?? 0); ?></div>
        <p style="color:#aaa; margin-top:.4rem;"><?php echo formatNum($bot['totalMembers'] ?? 0); ?> members</p>
    </div>
    <div class="stat-card">
        <div class="stat-icon">📡</div>
        <div class="stat-label">Discord Ping</div>
        <div class="stat-value"><?php echo esc($bot['wsPing'] ?? '—'); ?>ms</div>
        <p style="color:#aaa; margin-top:.4rem;">Uptime <?php echo uptimeHuman($bot['uptime'] ?? 0); ?></p>
    </div>
    <div class="stat-card">
        <div class="stat-icon">🎭</div>
        <div class="stat-label">Active Trolls</div>
        <div class="stat-value"><?php echo formatNum($trolls['total'] ?? 0); ?></div>
        <p style="color:#aaa; margin-top:.4rem;">Live troll actions</p>
    </div>
</div>

<div style="display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; margin-bottom:2rem;">
    <div class="section">
        <h2>Runtime</h2>
        <table class="table">
            <tbody>
                <tr><td>Node</td><td><?php echo esc($api['node'] ?? '—'); ?></td></tr>
                <tr><td>Platform</td><td><?php echo esc($api['platform'] ?? '—'); ?></td></tr>
                <tr><td>API Uptime</td><td><?php echo uptimeHuman($api['uptime'] ?? 0); ?></td></tr>
                <tr><td>PID</td><td><?php echo esc($api['pid'] ?? '—'); ?></td></tr>
                <tr><td>Memory RSS</td><td><?php echo bytesHuman($api['memory']['rss'] ?? 0); ?></td></tr>
                <tr><td>Heap Used</td><td><?php echo bytesHuman($api['memory']['heapUsed'] ?? 0); ?></td></tr>
            </tbody>
        </table>
    </div>

    <div class="section">
        <h2>Troll Types</h2>
        <table class="table">
            <tbody>
                <?php foreach (($trolls['byType'] ?? []) as $type => $count): ?>
                <tr><td><?php echo esc($type); ?></td><td style="font-weight:700;"><?php echo formatNum($count); ?></td></tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</div>

<div class="section">
    <h2>PM2 Processes</h2>
    <table class="table">
        <thead>
            <tr><th>Name</th><th>Status</th><th>CPU</th><th>Memory</th><th>Restarts</th><th>Uptime</th></tr>
        </thead>
        <tbody>
            <?php foreach ($pm2 as $proc): ?>
            <tr>
                <td><code><?php echo esc($proc['name'] ?? ''); ?></code></td>
                <td style="color:<?php echo ($proc['status'] ?? '') === 'online' ? '#51cf66' : '#ff6b6b'; ?>; font-weight:700;"><?php echo esc($proc['status'] ?? 'unknown'); ?></td>
                <td><?php echo esc($proc['cpu'] ?? 0); ?>%</td>
                <td><?php echo bytesHuman($proc['memory'] ?? 0); ?></td>
                <td><?php echo formatNum($proc['restarts'] ?? 0); ?></td>
                <td><?php echo !empty($proc['uptime']) ? uptimeHuman((int)(microtime(true) * 1000) - (int)$proc['uptime']) : '—'; ?></td>
            </tr>
            <?php endforeach; ?>
            <?php if (empty($pm2)): ?><tr><td colspan="6" style="text-align:center;color:#999;">No PM2 data available</td></tr><?php endif; ?>
        </tbody>
    </table>
</div>

<div class="section">
    <h2>Cache / Database Snapshot</h2>
    <table class="table">
        <tbody>
            <tr><td>Guild Configs</td><td><?php echo formatNum($cache['guildCount'] ?? 0); ?></td></tr>
            <tr><td>User Stats</td><td><?php echo formatNum($cache['userCount'] ?? 0); ?></td></tr>
            <tr><td>Total Trolls</td><td><?php echo formatNum($cache['globalStats']['totalTrolls'] ?? 0); ?></td></tr>
            <tr><td>Total Moves</td><td><?php echo formatNum($cache['globalStats']['totalMoves'] ?? 0); ?></td></tr>
            <tr><td>Pending Flush</td><td><?php echo !empty($cache['pendingGlobalFlush']) ? 'yes' : 'no'; ?></td></tr>
        </tbody>
    </table>
</div>

<script>
setTimeout(() => location.reload(), 30000);
</script>

<?php include '../includes/footer.php'; ?>
