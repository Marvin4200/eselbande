<?php
$page_title = 'EselMusic';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();

$statusRaw = getAPI('/eselmusic/status');
$guildsRaw = getAPI('/eselmusic/guilds');

$statusData = $statusRaw['data'] ?? null;
$guildsData = $guildsRaw['data'] ?? [];
$offline    = empty($statusData) || !($statusRaw['success'] ?? false);
$botOnline  = !$offline && ($statusData['online'] ?? false);
$lavalinkOk = !$offline && ($statusData['lavalinkConnected'] ?? false);

function em_uptime(int $seconds): string {
    $seconds = max(0, $seconds);
    $d = floor($seconds / 86400);
    $h = floor(($seconds % 86400) / 3600);
    $m = floor(($seconds % 3600) / 60);
    return ($d ? $d . 'd ' : '') . $h . 'h ' . $m . 'm';
}

// Warnings
$warnings = [];
if ($offline) {
    $warnings[] = ['type' => 'error', 'msg' => '⛔ EselMusic nicht erreichbar — Musikbot ist möglicherweise offline oder neustartet.'];
} else {
    if (!$lavalinkOk) {
        $warnings[] = ['type' => 'warning', 'msg' => '⚠️ Lavalink ist nicht verbunden — Musikwiedergabe derzeit nicht möglich.'];
    }
    foreach ($guildsData as $g) {
        if (($g['is247'] ?? false) && !($g['hasPlayer'] ?? false)) {
            $warnings[] = ['type' => 'warning', 'msg' => '⚠️ 24/7 aktiv, aber kein Player auf „' . esc($g['guildName'] ?? $g['guildId'] ?? '?') . '".'];
        }
        if (array_key_exists('logChannelId', $g) && empty($g['logChannelId'])) {
            $warnings[] = ['type' => 'info', 'msg' => 'ℹ️ Log-Channel nicht gesetzt auf „' . esc($g['guildName'] ?? $g['guildId'] ?? '?') . '".'];
        }
    }
}

// Detect optional columns from API data
$hasLogCh   = count(array_filter($guildsData, fn($g) => array_key_exists('logChannelId', $g)))   > 0;
$hasMusicCh = count(array_filter($guildsData, fn($g) => array_key_exists('musicChannelId', $g))) > 0;

$lastUpdate = date('H:i:s');
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.em-guild-idle  { color: var(--text-secondary); }
.em-guild-play  { color: #4ade80; font-weight: 700; }
.em-nowplaying  { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: middle; }
.em-tag-247     { display: inline-block; padding: .15rem .5rem; border-radius: 4px; font-size: .75rem; font-weight: 700; background: rgba(88,101,242,.18); color: #818cf8; }
.em-tag-off     { color: var(--text-secondary); }
.em-ch-set      { color: #4ade80; }
.em-ch-unset    { color: var(--text-secondary); }
@media (max-width: 768px) { .em-nowplaying { max-width: 120px; } }
</style>

<div class="page-header">
    <div class="page-header-row">
        <div>
            <h1>🎵 EselMusic</h1>
            <p class="subtitle">Musikbot Monitoring — Read-only</p>
        </div>
        <div style="display:flex; align-items:center; gap:.75rem; flex-wrap:wrap;">
            <span style="font-size:.8rem; color:var(--text-secondary);">Aktualisiert: <strong><?php echo $lastUpdate; ?></strong></span>
            <span class="refresh-badge" id="refreshBadge">↻ 30s</span>
        </div>
    </div>
</div>

<?php foreach ($warnings as $w): ?>
<div class="alert alert-<?php echo esc($w['type']); ?>"><?php echo $w['msg']; ?></div>
<?php endforeach; ?>

<div class="stats-grid">
    <div class="stat-card stat-accent-<?php echo $botOnline ? 'green' : 'red'; ?>">
        <div class="stat-icon">🎵</div>
        <div class="stat-label">Musikbot</div>
        <div class="stat-value"><?php echo $botOnline ? 'Online' : 'Offline'; ?></div>
        <p style="color:var(--text-secondary); font-size:.82rem; margin-top:.3rem;">
            <?php if (!$offline && isset($statusData['uptime'])): ?>
                Uptime <?php echo em_uptime((int)$statusData['uptime']); ?>
            <?php else: ?>
                Nicht erreichbar
            <?php endif; ?>
        </p>
    </div>
    <div class="stat-card stat-accent-<?php echo $lavalinkOk ? 'green' : 'red'; ?>">
        <div class="stat-icon">🔊</div>
        <div class="stat-label">Lavalink</div>
        <div class="stat-value"><?php echo $lavalinkOk ? 'Verbunden' : 'Getrennt'; ?></div>
        <p style="color:var(--text-secondary); font-size:.82rem; margin-top:.3rem;">Audio-Server</p>
    </div>
    <div class="stat-card stat-accent-blue">
        <div class="stat-icon">▶️</div>
        <div class="stat-label">Aktive Player</div>
        <div class="stat-value"><?php echo $offline ? '—' : formatNum($statusData['activePlayers'] ?? 0); ?></div>
        <p style="color:var(--text-secondary); font-size:.82rem; margin-top:.3rem;">Laufende Wiedergaben</p>
    </div>
    <div class="stat-card stat-accent-blue">
        <div class="stat-icon">🏰</div>
        <div class="stat-label">Guilds</div>
        <div class="stat-value"><?php echo $offline ? '—' : formatNum($statusData['guildCount'] ?? 0); ?></div>
        <p style="color:var(--text-secondary); font-size:.82rem; margin-top:.3rem;">Server mit Musikbot</p>
    </div>
    <?php if (!$offline && isset($statusData['uptime'])): ?>
    <div class="stat-card stat-accent-yellow">
        <div class="stat-icon">⏱️</div>
        <div class="stat-label">Uptime</div>
        <div class="stat-value" style="font-size:1.25rem;"><?php echo em_uptime((int)$statusData['uptime']); ?></div>
        <p style="color:var(--text-secondary); font-size:.82rem; margin-top:.3rem;">Seit letztem Start</p>
    </div>
    <?php endif; ?>
</div>

<div class="section">
    <h2>Guild-Übersicht</h2>
    <?php if ($offline || empty($guildsData)): ?>
    <p style="color:var(--text-secondary); text-align:center; padding:2rem 1rem;">
        <?php echo $offline ? 'Keine Daten verfügbar (Musikbot offline).' : 'Keine Guilds vorhanden.'; ?>
    </p>
    <?php else: ?>
    <div class="table-scroll">
    <table class="table table-compact">
        <thead>
            <tr>
                <th>Server</th>
                <th>Status</th>
                <th>24/7</th>
                <th>Läuft gerade</th>
                <th>Queue</th>
                <?php if ($hasLogCh): ?><th>Log-Ch.</th><?php endif; ?>
                <?php if ($hasMusicCh): ?><th>Music-Ch.</th><?php endif; ?>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($guildsData as $g):
                $hasPlayer  = $g['hasPlayer'] ?? false;
                $is247      = $g['is247']     ?? false;
                $nowPlaying = $g['nowPlaying'] ?? null;
                $queueLen   = (int)($g['queueLength'] ?? 0);
            ?>
            <tr>
                <td>
                    <strong><?php echo esc($g['guildName'] ?? '—'); ?></strong><br>
                    <small style="color:var(--text-secondary); font-size:.75rem;"><?php echo esc($g['guildId'] ?? ''); ?></small>
                </td>
                <td>
                    <?php if ($hasPlayer): ?>
                        <span class="em-guild-play">▶ Aktiv</span>
                    <?php else: ?>
                        <span class="em-guild-idle">Idle</span>
                    <?php endif; ?>
                </td>
                <td>
                    <?php echo $is247
                        ? '<span class="em-tag-247">24/7</span>'
                        : '<span class="em-tag-off">—</span>'; ?>
                </td>
                <td>
                    <?php if ($nowPlaying && $nowPlaying !== '—'): ?>
                        <span class="em-nowplaying" title="<?php echo esc($nowPlaying); ?>"><?php echo esc($nowPlaying); ?></span>
                    <?php else: ?>
                        <span style="color:var(--text-secondary);">—</span>
                    <?php endif; ?>
                </td>
                <td>
                    <?php echo $queueLen > 0
                        ? '<strong>' . formatNum($queueLen) . '</strong> <span style="color:var(--text-secondary); font-size:.82rem;">Titel</span>'
                        : '<span style="color:var(--text-secondary);">—</span>'; ?>
                </td>
                <?php if ($hasLogCh): ?>
                <td>
                    <?php if (!array_key_exists('logChannelId', $g)): ?>
                        <span style="color:var(--text-secondary);">—</span>
                    <?php elseif (!empty($g['logChannelId'])): ?>
                        <span class="em-ch-set">✓</span>
                    <?php else: ?>
                        <span class="em-ch-unset">Nicht gesetzt</span>
                    <?php endif; ?>
                </td>
                <?php endif; ?>
                <?php if ($hasMusicCh): ?>
                <td>
                    <?php if (!array_key_exists('musicChannelId', $g)): ?>
                        <span style="color:var(--text-secondary);">—</span>
                    <?php elseif (!empty($g['musicChannelId'])): ?>
                        <span class="em-ch-set">✓</span>
                    <?php else: ?>
                        <span class="em-ch-unset">Nicht gesetzt</span>
                    <?php endif; ?>
                </td>
                <?php endif; ?>
            </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
    </div>
    <?php endif; ?>
</div>

<script>
(function () {
    startAutoRefresh(30, 'refreshBadge');
})();
</script>

<?php include '../includes/footer.php'; ?>
