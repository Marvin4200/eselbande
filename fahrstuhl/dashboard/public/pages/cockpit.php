<?php
$page_title = 'Cockpit';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();

$message = '';
$messageType = 'success';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    if ($action === 'run_backup') {
        $result = api('/backup/run', 'POST', [], 60);
        if ($result['data']['success'] ?? false) {
            $message = 'Backup run completed and verified.';
        } else {
            $messageType = 'error';
            $message = $result['data']['message'] ?? 'Backup failed.';
        }
    } elseif ($action === 'verify_backup') {
        $result = api('/backup/verify', 'POST', [], 30);
        if ($result['data']['success'] ?? false) {
            $verification = $result['data']['data']['verification'] ?? [];
            $message = !empty($verification['ok']) ? 'Backup verification passed.' : ('Backup verification failed: ' . ($verification['message'] ?? 'unknown'));
            $messageType = !empty($verification['ok']) ? 'success' : 'error';
        } else {
            $messageType = 'error';
            $message = $result['data']['message'] ?? 'Backup verification failed.';
        }
    }
}

$raw = getAPI('/dashboard/cockpit', 20);
$d = $raw['data'] ?? [];
$bot = $d['bot'] ?? [];
$api = $d['api'] ?? [];
$analytics = $d['analytics'] ?? [];
$health = $d['health'] ?? [];
$backup = $health['backup'] ?? [];
$warnings = $health['warnings'] ?? [];
$warningsTop = array_slice($warnings, 0, 3);
$recent = array_slice(($analytics['recent'] ?? []), 0, 10);

$botOffline = empty($d);

// Chart data
$chartRaw = getAPI('/analytics/chart?timeframe=24h', 5);
$hourlyData = $chartRaw['data']['hourly'] ?? [];
$topCommands = $chartRaw['data']['commands'] ?? [];

// EselMusic status (read-only)
$emRaw  = getAPI('/eselmusic/status');
$emData = ($emRaw['success'] ?? false) ? ($emRaw['data'] ?? null) : null;

function cockpitBytes($bytes) {
    $bytes = (int)$bytes;
    if ($bytes < 1024) return $bytes . ' B';
    if ($bytes < 1048576) return round($bytes / 1024, 1) . ' KB';
    if ($bytes < 1073741824) return round($bytes / 1048576, 1) . ' MB';
    return round($bytes / 1073741824, 1) . ' GB';
}

function cockpitUptime($ms) {
    $seconds = max(0, floor(((int)$ms) / 1000));
    $days = floor($seconds / 86400);
    $hours = floor(($seconds % 86400) / 3600);
    $mins = floor(($seconds % 3600) / 60);
    return ($days ? $days . 'd ' : '') . $hours . 'h ' . $mins . 'm';
}
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.cockpit-grid { display:grid; grid-template-columns:1.35fr .65fr; gap:1.25rem; }
.quick-actions { display:flex; flex-wrap:wrap; gap:.6rem; margin-bottom:1.25rem; }
.quick-actions a, .quick-actions button { width:auto; }
.quick-actions form { margin:0; }
@media (max-width: 1050px) { .cockpit-grid { grid-template-columns:1fr; } }
.cp-runtime-row { display:flex; justify-content:space-between; align-items:center; padding:.6rem 0; border-bottom:1px solid rgba(52,61,77,0.5); font-size:.9rem; }
.cp-runtime-row:last-child { border-bottom:none; }
.cp-runtime-key { color:var(--text-secondary); }
.cp-runtime-val { font-weight:700; color:var(--text-primary); font-variant-numeric:tabular-nums; }
.top-cmd-bar { display:flex; align-items:center; gap:.75rem; margin-bottom:.55rem; }
.top-cmd-name { min-width:100px; font-size:.88rem; color:var(--text-secondary); }
.top-cmd-fill { flex:1; height:6px; border-radius:999px; background:linear-gradient(90deg, #5865f2, #a855f7); }
.top-cmd-count { font-size:.82rem; font-weight:700; color:var(--text-primary); min-width:32px; text-align:right; }
</style>

<div class="page-header">
    <div class="page-header-row">
        <div>
            <h1>🎛️ Cockpit</h1>
            <p class="subtitle">Live-Übersicht: Status, Alerts und Aktivität. Details in den Unterseiten.</p>
        </div>
        <div style="display:flex; align-items:center; gap:.75rem;">
            <span class="refresh-badge" id="refreshBadge">↻ 60s</span>
            <div class="page-meta"><?php echo date('d.m.Y H:i'); ?></div>
        </div>
    </div>
</div>

<?php if ($message): ?>
    <div class="alert alert-<?php echo esc($messageType); ?>"><?php echo esc($message); ?></div>
<?php endif; ?>

<?php if ($botOffline): ?>
    <div class="alert alert-warning">⚠️ Bot-API aktuell nicht erreichbar — Cockpit-Daten werden nicht geladen. Stats und Charts bleiben leer bis die API wieder antwortet.</div>
<?php endif; ?>

<!-- KPI Cards -->
<div class="cockpit-kpi-grid">
    <div class="stat-card stat-accent-<?php echo !empty($bot['ready']) ? 'green' : 'red'; ?>">
        <div class="stat-icon">🤖</div>
        <div class="stat-label">Bot Status</div>
        <div class="stat-value"><?php echo !empty($bot['ready']) ? 'Online' : 'Offline'; ?></div>
        <p style="color:var(--text-secondary); font-size:.82rem; margin-top:.3rem;"><?php echo esc($bot['tag'] ?? $bot['username'] ?? 'unknown'); ?></p>
    </div>
    <div class="stat-card stat-accent-blue">
        <div class="stat-icon">🏰</div>
        <div class="stat-label">Server</div>
        <div class="stat-value" data-countup="<?php echo (int)($bot['guilds'] ?? 0); ?>"><?php echo formatNum($bot['guilds'] ?? 0); ?></div>
        <p style="color:var(--text-secondary); font-size:.82rem; margin-top:.3rem;"><?php echo formatNum($bot['totalMembers'] ?? 0); ?> Members</p>
    </div>
    <div class="stat-card stat-accent-<?php echo (($d['trolls']['total'] ?? 0) > 0) ? 'red' : 'green'; ?>">
        <div class="stat-icon">🎭</div>
        <div class="stat-label">Aktive Trolls</div>
        <div class="stat-value" data-countup="<?php echo (int)($d['trolls']['total'] ?? 0); ?>"><?php echo formatNum($d['trolls']['total'] ?? 0); ?></div>
        <p style="color:var(--text-secondary); font-size:.82rem; margin-top:.3rem;">Live-Aktionen</p>
    </div>
    <div class="stat-card stat-accent-purple">
        <div class="stat-icon">⌨️</div>
        <div class="stat-label">Commands (24h)</div>
        <div class="stat-value" data-countup="<?php echo (int)($analytics['totalCommands'] ?? 0); ?>"><?php echo formatNum($analytics['totalCommands'] ?? 0); ?></div>
        <p style="color:var(--text-secondary); font-size:.82rem; margin-top:.3rem;"><?php echo formatNum($analytics['activeUsers'] ?? 0); ?> User aktiv</p>
    </div>
    <div class="stat-card stat-accent-yellow">
        <div class="stat-icon">⚡</div>
        <div class="stat-label">Ping</div>
        <div class="stat-value"><?php echo esc($bot['wsPing'] ?? '—'); ?>ms</div>
        <p style="color:var(--text-secondary); font-size:.82rem; margin-top:.3rem;">WebSocket</p>
    </div>
    <div class="stat-card stat-accent-blue">
        <div class="stat-icon">🧠</div>
        <div class="stat-label">Memory</div>
        <div class="stat-value"><?php echo cockpitBytes($api['memory']['rss'] ?? 0); ?></div>
        <p style="color:var(--text-secondary); font-size:.82rem; margin-top:.3rem;">RSS</p>
    </div>
</div>

<div class="quick-actions">
    <a class="btn-icon" href="<?= BASE_URL ?>/pages/status.php"><span class="i">🟢</span> Status</a>
    <a class="btn-icon" href="<?= BASE_URL ?>/pages/guilds.php"><span class="i">🏰</span> Servers</a>
    <a class="btn-icon" href="<?= BASE_URL ?>/pages/members-hub.php"><span class="i">👥</span> Members</a>
    <a class="btn-icon" href="<?= BASE_URL ?>/pages/rewards-hub.php"><span class="i">🎁</span> Rewards</a>
    <a class="btn-icon" href="<?= BASE_URL ?>/pages/moderation-hub.php"><span class="i">🛡️</span> Moderation</a>
    <a class="btn-icon" href="<?= BASE_URL ?>/pages/fun-hub.php"><span class="i">🎭</span> Fun</a>
    <a class="btn-icon" href="<?= BASE_URL ?>/pages/operations.php"><span class="i">🛠️</span> Ops</a>
    <form method="POST"><button class="btn-icon" type="submit" name="action" value="run_backup"><span class="i">🗄️</span> Backup</button></form>
    <form method="POST"><button class="btn-icon" type="submit" name="action" value="verify_backup"><span class="i">✅</span> Verify</button></form>
</div>

<div class="cockpit-grid">
    <div>
        <!-- Command Activity Chart -->
        <?php if (!empty($hourlyData)): ?>
        <div class="section" style="margin-bottom:1.25rem;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem;">
                <h2 style="margin:0;">📊 Command-Aktivität (24h)</h2>
                <a href="<?= BASE_URL ?>/pages/analytics.php" style="color:var(--primary-light); font-size:.82rem; text-decoration:none;">Details →</a>
            </div>
            <div class="chart-container">
                <canvas id="activityChart"></canvas>
            </div>
            <?php if (!empty($topCommands)): ?>
            <div class="divider"></div>
            <p style="font-size:.8rem; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:var(--text-secondary); margin-bottom:.75rem;">Top Commands</p>
            <?php $maxCount = max(array_column($topCommands, 'count') ?: [1]); ?>
            <?php foreach (array_slice($topCommands, 0, 5) as $cmd): ?>
            <div class="top-cmd-bar">
                <div class="top-cmd-name">/<?php echo esc($cmd['command'] ?? ''); ?></div>
                <div style="flex:1; height:6px; border-radius:999px; background:rgba(255,255,255,0.06); overflow:hidden;">
                    <div class="top-cmd-fill" style="width:<?php echo min(100, round(($cmd['count']/$maxCount)*100)); ?>%;"></div>
                </div>
                <div class="top-cmd-count"><?php echo formatNum($cmd['count']); ?></div>
            </div>
            <?php endforeach; ?>
            <?php endif; ?>
        </div>
        <?php endif; ?>

        <!-- Health & Warnings -->
        <div class="section" style="margin-bottom:1.25rem;">
            <h2>🛡️ Health & Warnungen</h2>
            <?php $overall = $health['overall']['status'] ?? 'unknown'; ?>
            <p style="margin-bottom:1rem;">Status:
                <span class="status-badge <?php echo $overall === 'critical' ? 'danger' : ($overall === 'warn' ? 'warning' : 'ok'); ?>"><?php echo esc(strtoupper($overall)); ?></span>
                <span style="color:var(--text-secondary); margin-left:.6rem;">Ping <?php echo esc($bot['wsPing'] ?? '—'); ?>ms · Memory <?php echo cockpitBytes($api['memory']['rss'] ?? 0); ?></span>
            </p>
            <?php if (empty($warningsTop)): ?>
                <p style="color:#51cf66;">✅ Keine aktuellen Warnungen.</p>
            <?php else: ?>
                <div class="table-scroll">
                <table class="table table-compact">
                    <thead><tr><th>Level</th><th>Warnung</th><th>Detail</th></tr></thead>
                    <tbody>
                        <?php foreach ($warningsTop as $w): ?>
                        <tr>
                            <td><span class="status-badge <?php echo ($w['severity'] ?? '') === 'critical' ? 'danger' : 'warning'; ?>"><?php echo esc($w['severity'] ?? 'warn'); ?></span></td>
                            <td><?php echo esc($w['title'] ?? ''); ?></td>
                            <td>
                                <?php echo esc($w['detail'] ?? ''); ?>
                                <?php if (!empty($w['fix'])): ?><br><small style="color:#ffd43b;">Fix: <?php echo esc($w['fix']); ?></small><?php endif; ?>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
                </div>
                <p style="margin-top:.8rem;">
                    <a href="<?= BASE_URL ?>/pages/security.php" style="color:var(--primary-light);text-decoration:none;">Security →</a>
                    <span style="color:#666;"> · </span>
                    <a href="<?= BASE_URL ?>/pages/audit.php" style="color:var(--primary-light);text-decoration:none;">Audit →</a>
                </p>
            <?php endif; ?>
        </div>

        <!-- Recent Activity -->
        <div class="section">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:.75rem; margin-bottom:.6rem;">
                <h2 style="margin:0;">🧾 Recent Activity</h2>
                <div style="display:flex; gap:.35rem;">
                    <button type="button" class="btn-icon" style="padding:.35rem .55rem; border-radius:9px;" data-filter="all"><span class="i" style="width:22px;height:22px;">🧾</span> All</button>
                    <button type="button" class="btn-icon" style="padding:.35rem .55rem; border-radius:9px;" data-filter="ok"><span class="i" style="width:22px;height:22px;">✅</span> OK</button>
                    <button type="button" class="btn-icon" style="padding:.35rem .55rem; border-radius:9px;" data-filter="err"><span class="i" style="width:22px;height:22px;">⚠️</span> Err</button>
                </div>
            </div>
            <div class="table-scroll">
            <table class="table table-compact" id="recentTable">
                <thead><tr><th>Zeit</th><th>Command</th><th>User</th><th>Server</th><th>Status</th></tr></thead>
                <tbody>
                    <?php foreach ($recent as $row): ?>
                    <tr data-success="<?php echo !empty($row['success']) ? '1' : '0'; ?>">
                        <td><?php echo formatDate($row['timestamp'] ?? null); ?></td>
                        <td><code>/<?php echo esc($row['command'] ?? ''); ?></code></td>
                        <td><code><?php echo esc($row['user_id'] ?? ''); ?></code></td>
                        <td><code><?php echo esc($row['guild_id'] ?? ''); ?></code></td>
                        <td><span class="status-badge <?php echo !empty($row['success']) ? 'ok' : 'danger'; ?>"><?php echo !empty($row['success']) ? 'ok' : 'error'; ?></span></td>
                    </tr>
                    <?php endforeach; ?>
                    <?php if (empty($recent)): ?><tr><td colspan="5" style="text-align:center;color:#999;">Noch keine Aktivität</td></tr><?php endif; ?>
                </tbody>
            </table>
            </div>
            <p style="margin-top:.8rem;"><a href="<?= BASE_URL ?>/pages/analytics.php" style="color:var(--primary-light);text-decoration:none;">Analytics öffnen →</a></p>
        </div>
    </div>

    <div>
        <!-- Runtime -->
        <div class="section" style="margin-bottom:1.25rem;">
            <h2>⏱️ Runtime</h2>
            <div class="cp-runtime-row">
                <span class="cp-runtime-key">Bot Uptime</span>
                <span class="cp-runtime-val live-uptime" id="botUptimeLive"><?php echo cockpitUptime($bot['uptime'] ?? 0); ?></span>
            </div>
            <div class="cp-runtime-row">
                <span class="cp-runtime-key">API Uptime</span>
                <span class="cp-runtime-val"><?php echo cockpitUptime($api['uptime'] ?? 0); ?></span>
            </div>
            <div class="cp-runtime-row">
                <span class="cp-runtime-key">Git Commit</span>
                <span class="cp-runtime-val"><code><?php echo esc(substr($api['git']['commit'] ?? '—', 0, 7)); ?></code></span>
            </div>
            <div class="cp-runtime-row" style="border-bottom:none;">
                <span class="cp-runtime-key">Branch</span>
                <span class="cp-runtime-val"><code><?php echo esc($api['git']['branch'] ?? 'main'); ?></code></span>
            </div>
            <?php if (!empty($api['git']['subject'])): ?>
            <p style="margin-top:.75rem; font-size:.8rem; color:var(--text-secondary); font-style:italic;">"<?php echo esc($api['git']['subject']); ?>"</p>
            <?php endif; ?>
        </div>

        <!-- Backup -->
        <div class="section" style="margin-bottom:1.25rem;">
            <h2>🗄️ Backup</h2>
            <?php
                $backupOk = !empty($backup['verification']['ok']);
                $backupEnabled = !empty($backup['enabled']);
                $backupAge = $backup['ageHours'] ?? null;
                $backupAgeColor = $backupAge !== null ? ($backupAge < 25 ? '#4ade80' : ($backupAge < 72 ? '#fbbf24' : '#fb7185')) : '#aaa';
            ?>
            <div class="cp-runtime-row">
                <span class="cp-runtime-key">Enabled</span>
                <span class="cp-runtime-val" style="color:<?php echo $backupEnabled ? '#4ade80' : '#fb7185'; ?>;"><?php echo $backupEnabled ? 'Yes' : 'No'; ?></span>
            </div>
            <div class="cp-runtime-row">
                <span class="cp-runtime-key">Letztes Backup</span>
                <span class="cp-runtime-val"><?php echo !empty($backup['lastBackupAt']) ? date('d.m. H:i', (int)($backup['lastBackupAt'] / 1000)) : 'Nie'; ?></span>
            </div>
            <div class="cp-runtime-row">
                <span class="cp-runtime-key">Alter</span>
                <span class="cp-runtime-val" style="color:<?php echo $backupAgeColor; ?>;"><?php echo $backupAge !== null ? $backupAge . 'h' : '—'; ?></span>
            </div>
            <div class="cp-runtime-row">
                <span class="cp-runtime-key">Verifiziert</span>
                <span class="cp-runtime-val" style="color:<?php echo $backupOk ? '#4ade80' : '#fbbf24'; ?>;"><?php echo $backupOk ? 'Ja ✓' : 'Nein'; ?></span>
            </div>
            <div class="cp-runtime-row" style="border-bottom:none;">
                <span class="cp-runtime-key">Größe</span>
                <span class="cp-runtime-val"><?php echo cockpitBytes($backup['verification']['size'] ?? $backup['lastBackupSize'] ?? 0); ?></span>
            </div>
            <p style="margin-top:.75rem;"><a href="<?= BASE_URL ?>/pages/backups.php" style="color:var(--primary-light);text-decoration:none;">Backups öffnen →</a></p>
        </div>

        <!-- Premium -->
        <div class="section">
            <h2>💎 Premium läuft ab</h2>
            <?php $expiring = $d['premiumExpiring'] ?? []; ?>
            <?php foreach (array_slice($expiring, 0, 4) as $u): ?>
                <div style="padding:.5rem 0; border-bottom:1px solid rgba(52,61,77,.5); font-size:.87rem;">
                    <strong><?php echo esc($u['displayName'] ?? $u['userId']); ?></strong>
                    <span style="float:right; color:<?php echo ($u['daysRemaining'] ?? 99) <= 3 ? '#fb7185' : '#fbbf24'; ?>; font-weight:700;"><?php echo esc($u['daysRemaining'] ?? '?'); ?>d</span>
                    <div style="color:var(--text-secondary); margin-top:.15rem;"><?php echo esc($u['tier'] ?? 'basic'); ?></div>
                </div>
            <?php endforeach; ?>
            <?php if (empty($expiring)): ?><p style="color:#999; font-size:.87rem;">Keine Abläufe in 14 Tagen.</p><?php endif; ?>
            <p style="margin-top:.75rem;"><a href="<?= BASE_URL ?>/pages/premium-hub.php" style="color:var(--primary-light);text-decoration:none;">Premium Hub →</a></p>
        </div>

        <!-- EselMusic Status -->
        <div class="section" style="margin-top:1.25rem;">
            <h2>🎵 EselMusic</h2>
            <?php if ($emData === null): ?>
            <p style="color:var(--text-secondary); font-size:.87rem;">⚠️ Nicht erreichbar</p>
            <?php else: ?>
            <?php $emOnline = (bool)($emData['online'] ?? false); ?>
            <?php $emLava   = (bool)($emData['lavalinkConnected'] ?? false); ?>
            <div class="cp-runtime-row">
                <span class="cp-runtime-key">Musikbot</span>
                <span class="cp-runtime-val" style="color:<?php echo $emOnline ? '#4ade80' : '#fb7185'; ?>"><?php echo $emOnline ? 'Online' : 'Offline'; ?></span>
            </div>
            <div class="cp-runtime-row">
                <span class="cp-runtime-key">Lavalink</span>
                <span class="cp-runtime-val" style="color:<?php echo $emLava ? '#4ade80' : '#fb7185'; ?>"><?php echo $emLava ? 'Verbunden' : 'Getrennt'; ?></span>
            </div>
            <div class="cp-runtime-row">
                <span class="cp-runtime-key">Aktive Player</span>
                <span class="cp-runtime-val"><?php echo formatNum($emData['activePlayers'] ?? 0); ?></span>
            </div>
            <div class="cp-runtime-row" style="border-bottom:none;">
                <span class="cp-runtime-key">Guilds</span>
                <span class="cp-runtime-val"><?php echo formatNum($emData['guildCount'] ?? 0); ?></span>
            </div>
            <?php endif; ?>
            <p style="margin-top:.75rem;">
                <a href="<?= BASE_URL ?>/eselmusic" style="color:var(--primary-light);text-decoration:none;">EselMusic öffnen →</a>
            </p>
        </div>
    </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
<script>
(function() {
    // Recent activity filter
    const table = document.getElementById('recentTable');
    if (table) {
        const rows = Array.from(table.querySelectorAll('tbody tr[data-success]'));
        document.querySelectorAll('[data-filter]').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.filter;
                rows.forEach(r => {
                    const ok = r.dataset.success === '1';
                    r.style.display = (mode === 'all' || (mode === 'ok' && ok) || (mode === 'err' && !ok)) ? '' : 'none';
                });
            });
        });
    }

    // Live bot uptime ticker
    const uptimeMs = <?php echo (int)($bot['uptime'] ?? 0); ?>;
    if (uptimeMs > 0) startLiveUptime('botUptimeLive', uptimeMs);

    // Auto-refresh countdown
    startAutoRefresh(60, 'refreshBadge');

    // Chart.js command activity
    <?php if (!empty($hourlyData)): ?>
    const ctx = document.getElementById('activityChart');
    if (ctx) {
        const labels = <?php echo json_encode(array_column($hourlyData, 'hour')); ?>;
        const counts = <?php echo json_encode(array_column($hourlyData, 'count')); ?>;
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels.map(h => h + ':00'),
                datasets: [{
                    label: 'Commands',
                    data: counts,
                    backgroundColor: 'rgba(88,101,242,0.5)',
                    borderColor: 'rgba(88,101,242,0.9)',
                    borderWidth: 1,
                    borderRadius: 4,
                    hoverBackgroundColor: 'rgba(168,85,247,0.6)',
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(14,17,23,0.95)',
                        borderColor: 'rgba(88,101,242,0.4)',
                        borderWidth: 1,
                        titleColor: '#a5b4fc',
                        bodyColor: '#e2e8f0',
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#6b7280', font: { size: 11 } },
                        grid: { color: 'rgba(52,61,77,0.35)' },
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#6b7280', font: { size: 11 }, precision: 0 },
                        grid: { color: 'rgba(52,61,77,0.35)' },
                    }
                }
            }
        });
    }
    <?php endif; ?>
})();
</script>

<?php include '../includes/footer.php'; ?>
