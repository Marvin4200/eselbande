<?php
$page_title = 'Ops Health';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();

$raw = getAPI('/ops/health', 12);
$data = $raw['data'] ?? [];
$services = $data['services'] ?? [];
$totals = $data['totals'] ?? ['total' => 0, 'online' => 0, 'offline' => 0];

function opsBytes($bytes) {
    if (!is_numeric($bytes) || $bytes <= 0) return '—';
    $bytes = (float)$bytes;
    if ($bytes < 1024) return round($bytes) . ' B';
    if ($bytes < 1024 * 1024) return round($bytes / 1024, 1) . ' KB';
    if ($bytes < 1024 * 1024 * 1024) return round($bytes / (1024 * 1024), 1) . ' MB';
    return round($bytes / (1024 * 1024 * 1024), 2) . ' GB';
}

function opsUptime($value) {
    if (!is_numeric($value) || $value <= 0) return '—';
    $seconds = (float)$value;
    if ($seconds > 1_000_000) $seconds = $seconds / 1000;
    $seconds = (int)floor($seconds);
    $days = intdiv($seconds, 86400);
    $hours = intdiv($seconds % 86400, 3600);
    $mins = intdiv($seconds % 3600, 60);
    return ($days > 0 ? $days . 'd ' : '') . $hours . 'h ' . $mins . 'm';
}

function opsBadgeClass($status) {
    if ($status === 'online') return 'badge-ok';
    if ($status === 'offline') return 'badge-critical';
    return 'badge-warn';
}
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.ops-health-table td code { color: var(--primary-light); }
.ops-service { display: flex; align-items: center; gap: .45rem; font-weight: 700; }
.ops-muted { color: var(--text-secondary); font-size: .82rem; margin-top: .15rem; }
</style>

<div class="page-header">
    <div class="page-header-row">
        <div>
            <h1>📈 Ops Health Dashboard</h1>
            <p class="subtitle">Zentrale Betriebsübersicht für Services, PM2, Deploy und Infrastruktur.</p>
        </div>
        <div style="display:flex; align-items:center; gap:.75rem;">
            <span class="refresh-badge">↻ manual</span>
            <div class="page-meta"><?php echo date('d.m.Y H:i'); ?></div>
        </div>
    </div>
</div>

<div class="dashboard-kpi-grid" style="margin-bottom:1.1rem;">
    <div class="dashboard-kpi">
        <div class="dashboard-kpi-label">Services</div>
        <div class="dashboard-kpi-value"><?php echo (int)($totals['total'] ?? 0); ?></div>
    </div>
    <div class="dashboard-kpi">
        <div class="dashboard-kpi-label">Online</div>
        <div class="dashboard-kpi-value" style="color: var(--color-success, #4ade80);"><?php echo (int)($totals['online'] ?? 0); ?></div>
    </div>
    <div class="dashboard-kpi">
        <div class="dashboard-kpi-label">Offline</div>
        <div class="dashboard-kpi-value" style="color: var(--danger, #fb7185);"><?php echo (int)($totals['offline'] ?? 0); ?></div>
    </div>
    <div class="dashboard-kpi">
        <div class="dashboard-kpi-label">Checked</div>
        <div class="dashboard-kpi-value" style="font-size:1rem;"><?php echo esc(isset($data['checkedAt']) ? date('d.m.Y H:i:s', strtotime($data['checkedAt'])) : '—'); ?></div>
    </div>
</div>

<div class="section">
    <h2>Service Matrix</h2>
    <div class="table-scroll">
    <table class="table table-compact ops-health-table">
        <thead>
            <tr>
                <th>Service</th>
                <th>Status</th>
                <th>Uptime</th>
                <th>Memory</th>
                <th>Redis/Session</th>
                <th>Last Deploy</th>
                <th>PM2</th>
                <th>Probe</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($services as $svc): ?>
            <tr>
                <td>
                    <div class="ops-service">
                        <span><?php echo esc($svc['name'] ?? 'unknown'); ?></span>
                    </div>
                    <div class="ops-muted"><?php echo esc($svc['id'] ?? ''); ?></div>
                </td>
                <td>
                    <span class="status-badge <?php echo ($svc['status'] ?? '') === 'online' ? 'ok' : (($svc['status'] ?? '') === 'offline' ? 'danger' : 'warning'); ?>"><?php echo esc(strtoupper($svc['status'] ?? 'unknown')); ?></span>
                    <?php if (!empty($svc['error'])): ?>
                        <div class="ops-muted"><?php echo esc($svc['error']); ?></div>
                    <?php endif; ?>
                </td>
                <td><?php echo esc(opsUptime($svc['uptime'] ?? null)); ?></td>
                <td><?php echo esc(opsBytes($svc['memoryBytes'] ?? null)); ?></td>
                <td><?php echo esc($svc['redisSessionStatus'] ?? '—'); ?></td>
                <td>
                    <?php if (!empty($svc['lastDeployAt'])): ?>
                        <?php echo esc(date('d.m H:i', strtotime($svc['lastDeployAt']))); ?>
                        <?php if (!empty($svc['deployState'])): ?>
                            <div class="ops-muted"><?php echo esc($svc['deployState']); ?></div>
                        <?php endif; ?>
                    <?php else: ?>
                        —
                    <?php endif; ?>
                </td>
                <td>
                    <?php if (!empty($svc['pm2'])): ?>
                        <span class="status-badge <?php echo ($svc['pm2']['status'] ?? '') === 'online' ? 'ok' : 'warning'; ?>"><?php echo esc($svc['pm2']['status'] ?? 'unknown'); ?></span>
                        <div class="ops-muted">r=<?php echo (int)($svc['pm2']['restarts'] ?? 0); ?></div>
                    <?php else: ?>
                        —
                    <?php endif; ?>
                </td>
                <td>
                    <?php if (!empty($svc['statusCode'])): ?><code>HTTP <?php echo (int)$svc['statusCode']; ?></code><?php endif; ?>
                    <?php if (isset($svc['latencyMs'])): ?><div class="ops-muted"><?php echo (int)$svc['latencyMs']; ?> ms</div><?php endif; ?>
                </td>
            </tr>
            <?php endforeach; ?>
            <?php if (empty($services)): ?>
            <tr><td colspan="8" style="text-align:center; color: var(--text-secondary);">Keine Service-Daten verfügbar.</td></tr>
            <?php endif; ?>
        </tbody>
    </table>
    </div>
</div>

<?php include '../includes/footer.php'; ?>
