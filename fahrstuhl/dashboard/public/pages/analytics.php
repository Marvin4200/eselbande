<?php
$page_title = 'Analytics';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();

$summaryRaw = getAPI('/analytics/summary');
$stats = $summaryRaw['data'] ?? [];

$timelineRaw = getAPI('/analytics/timeline');
$recentActivity = $timelineRaw['data']['timeline'] ?? [];

$tf = in_array($_GET['tf'] ?? '', ['24h','7d','30d','all']) ? $_GET['tf'] : '24h';
$chartRaw = getAPI("/analytics/chart?timeframe=$tf");
$hourly   = $chartRaw['data']['hourly']   ?? [];
$commands = $chartRaw['data']['commands'] ?? [];

$hourlyLabels = json_encode(array_column($hourly, 'hour'));
$hourlyCounts = json_encode(array_column($hourly, 'count'));
$cmdLabels    = json_encode(array_map(fn($c) => '/' . $c['command'], $commands));
$cmdCounts    = json_encode(array_column($commands, 'count'));
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.analytics-chart-row {
    display: grid;
    grid-template-columns: 1fr 340px;
    gap: 1rem;
    margin-bottom: 1.5rem;
}
@media (max-width: 1100px) {
    .analytics-chart-row { grid-template-columns: 1fr; }
}
.btn-tf {
    padding: .3rem .85rem;
    border-radius: var(--radius-sm);
    font-size: .82rem;
    font-weight: 700;
    text-decoration: none;
    border: 1px solid var(--border-light);
    background: var(--bg-tertiary);
    color: var(--text-secondary);
    transition: background .15s, border-color .15s, color .15s;
}
.btn-tf:hover {
    background: var(--bg-light);
    color: var(--text-primary);
}
.btn-tf.is-active {
    background: var(--primary);
    border-color: var(--primary);
    color: #fff;
}
</style>

<div class="page-header">
    <h1>📊 Analytics</h1>
    <p class="subtitle">Real-time bot statistics and performance metrics</p>
</div>

<!-- Summary cards -->
<div class="stats-grid" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:14px; margin-bottom:var(--sp-6);">
    <div class="stat-card">
        <div class="stat-icon">⚡</div>
        <div class="stat-content">
            <p class="stat-label">Total Commands</p>
            <p class="stat-value"><?php echo formatNum($stats['total_commands'] ?? 0); ?></p>
        </div>
    </div>
    <div class="stat-card">
        <div class="stat-icon">👥</div>
        <div class="stat-content">
            <p class="stat-label">Unique Users</p>
            <p class="stat-value"><?php echo formatNum($stats['active_users'] ?? 0); ?></p>
        </div>
    </div>
    <div class="stat-card">
        <div class="stat-icon">🏆</div>
        <div class="stat-content">
            <p class="stat-label">Top Command</p>
            <p class="stat-value" style="font-size:1.1rem;">/<?php echo esc($stats['top_command'] ?? 'N/A'); ?></p>
            <p style="color:#666; font-size:0.78em; margin:0;"><?php echo formatNum($stats['top_command_count'] ?? 0); ?>x used</p>
        </div>
    </div>
    <div class="stat-card">
        <div class="stat-icon">🌐</div>
        <div class="stat-content">
            <p class="stat-label">Servers</p>
            <p class="stat-value"><?php echo formatNum($stats['guilds'] ?? 0); ?></p>
        </div>
    </div>
    <div class="stat-card">
        <div class="stat-icon">⌨️</div>
        <div class="stat-content">
            <p class="stat-label">Unique Commands</p>
            <p class="stat-value"><?php echo formatNum($stats['unique_commands'] ?? 0); ?></p>
        </div>
    </div>
    <div class="stat-card">
        <div class="stat-icon">⏱️</div>
        <div class="stat-content">
            <p class="stat-label">Uptime</p>
            <p class="stat-value" style="font-size:1.1rem;" id="uptime">—</p>
        </div>
    </div>
</div>

<!-- Charts row -->
<div class="analytics-chart-row">
    <!-- Activity Timeline -->
    <div class="section" style="padding:18px 20px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; flex-wrap:wrap; gap:var(--sp-2);">
            <h2 style="margin:0;">📈 Command Activity</h2>
            <div style="display:flex; gap:6px;">
                <?php foreach (['24h'=>'24h','7d'=>'7d','30d'=>'30d','all'=>'All'] as $key=>$label): ?>
                <a href="?tf=<?php echo $key; ?>" class="btn-tf<?php echo $tf===$key?' is-active':''; ?>">
                    <?php echo $label; ?>
                </a>
                <?php endforeach; ?>
            </div>
        </div>
        <canvas id="activityChart" height="100"></canvas>
        <?php if (empty($hourly)): ?>
        <p style="text-align:center; color:#555; margin-top:var(--sp-5);">No data yet for this timeframe</p>
        <?php endif; ?>
    </div>

    <!-- Command Breakdown Donut -->
    <div class="section" style="padding:18px 20px;">
        <h2 style="margin:0 0 14px;">🎮 Commands Breakdown</h2>
        <canvas id="cmdChart" height="200"></canvas>
        <?php if (empty($commands)): ?>
        <p style="text-align:center; color:#555; margin-top:var(--sp-5);">No command data yet</p>
        <?php endif; ?>
    </div>
</div>

<!-- Recent Activity Table -->
<div class="section">
    <h2>🕐 Recent Activity</h2>
    <div class="dashboard-table-wrap">
    <table class="table">
        <thead>
            <tr>
                <th>Time</th>
                <th>Command</th>
                <th>User ID</th>
                <th>Guild ID</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>
            <?php if (empty($recentActivity)): ?>
                <tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--text-secondary);">No recent activity recorded yet</td></tr>
            <?php else: ?>
                <?php foreach (array_slice($recentActivity, 0, 25) as $row): ?>
                    <tr>
                        <td style="color:var(--text-secondary); font-size:.82em; white-space:nowrap;"><?php
                            $ts = $row['timestamp'] ?? '';
                            echo $ts ? date('d.m H:i', strtotime($ts)) : '—';
                        ?></td>
                        <td><code>/<?php echo esc($row['command'] ?? ''); ?></code></td>
                        <td style="color:var(--text-secondary); font-size:.82em; font-family:monospace;"><?php echo esc($row['user_id'] ?? ''); ?></td>
                        <td style="color:var(--text-secondary); font-size:.82em; font-family:monospace;"><?php echo esc($row['guild_id'] ?? ''); ?></td>
                        <td><?php echo ($row['success'] ?? 1) ? '<span class="status-badge ok">✓ ok</span>' : '<span class="status-badge danger">✕ fail</span>'; ?></td>
                    </tr>
                <?php endforeach; ?>
            <?php endif; ?>
        </tbody>
    </table>
    </div>
</div>npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script>
Chart.defaults.color = '#aaa';
Chart.defaults.borderColor = '#2a2a3e';

// Uptime display
const uptimeMs = <?php echo (int)($stats['uptime'] ?? 0); ?>;
if (uptimeMs > 0) {
    const h = Math.floor(uptimeMs / 3600000);
    const m = Math.floor((uptimeMs % 3600000) / 60000);
    document.getElementById('uptime').textContent = h + 'h ' + m + 'm';
}

// Activity Line Chart
const actLabels = <?php echo $hourlyLabels ?: '[]'; ?>;
const actData   = <?php echo $hourlyCounts ?: '[]'; ?>;

if (actLabels.length > 0) {
    new Chart(document.getElementById('activityChart'), {
        type: 'line',
        data: {
            labels: actLabels.map(l => l ? l.substring(5,16).replace('T',' ') : ''),
            datasets: [{
                label: 'Commands',
                data: actData,
                borderColor: '#5865F2',
                backgroundColor: 'rgba(88,101,242,0.12)',
                tension: 0.4,
                fill: true,
                pointRadius: actLabels.length > 50 ? 0 : 3,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { maxTicksLimit: 12, maxRotation: 0 } },
                y: { beginAtZero: true, ticks: { precision: 0 } }
            }
        }
    });
}

// Command Donut Chart
const cmdLabels = <?php echo $cmdLabels ?: '[]'; ?>;
const cmdData   = <?php echo $cmdCounts ?: '[]'; ?>;
const palette   = ['#5865F2','#57F287','#FEE75C','#ED4245','#EB459E','#3BA55D','#FAA61A','#00AFF4'];

if (cmdLabels.length > 0) {
    new Chart(document.getElementById('cmdChart'), {
        type: 'doughnut',
        data: {
            labels: cmdLabels,
            datasets: [{
                data: cmdData,
                backgroundColor: palette.slice(0, cmdLabels.length),
                borderColor: '#12122a',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 10 } }
            }
        }
    });
}
</script>

<?php include '../includes/footer.php'; ?>

