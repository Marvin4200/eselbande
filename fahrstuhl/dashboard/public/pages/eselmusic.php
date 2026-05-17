<?php
$page_title = 'EselMusic';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();

$statusRaw = getAPI('/eselmusic/status');
$guildsRaw = getAPI('/eselmusic/guilds');

$statusData = $statusRaw['data'] ?? null;
$guildsData = $guildsRaw['data'] ?? [];
$offline = empty($statusData) || !($statusRaw['success'] ?? false);

function uptimeSec($seconds) {
    $seconds = max(0, (int)$seconds);
    $days = floor($seconds / 86400);
    $hours = floor(($seconds % 86400) / 3600);
    $mins = floor(($seconds % 3600) / 60);
    return ($days ? $days . 'd ' : '') . $hours . 'h ' . $mins . 'm';
}
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<div class="page-header">
    <h1>🎵 EselMusic</h1>
    <p class="subtitle">Musikbot Status und Guild-Übersicht</p>
</div>

<?php if ($offline): ?>
<div style="background:#2a1215; border:1px solid #ff6b6b; border-radius:8px; padding:1rem 1.5rem; margin-bottom:1.5rem; color:#ff6b6b;">
    ⚠️ EselMusic ist gerade nicht erreichbar. Der Musikbot ist möglicherweise offline oder neu startend.
</div>
<?php endif; ?>

<div class="stats-grid">
    <div class="stat-card">
        <div class="stat-icon">🎵</div>
        <div class="stat-label">Musikbot</div>
        <div class="stat-value" style="color:<?php echo (!$offline && ($statusData['online'] ?? false)) ? '#51cf66' : '#ff6b6b'; ?>">
            <?php echo (!$offline && ($statusData['online'] ?? false)) ? 'Online' : 'Offline'; ?>
        </div>
        <?php if (!$offline && isset($statusData['uptime'])): ?>
        <p style="color:#aaa; margin-top:.4rem;">Uptime <?php echo uptimeSec($statusData['uptime']); ?></p>
        <?php endif; ?>
    </div>
    <div class="stat-card">
        <div class="stat-icon">🔊</div>
        <div class="stat-label">Lavalink</div>
        <div class="stat-value" style="color:<?php echo (!$offline && ($statusData['lavalinkConnected'] ?? false)) ? '#51cf66' : '#ff6b6b'; ?>">
            <?php echo (!$offline && ($statusData['lavalinkConnected'] ?? false)) ? 'Verbunden' : 'Getrennt'; ?>
        </div>
        <p style="color:#aaa; margin-top:.4rem;">Audio-Server</p>
    </div>
    <div class="stat-card">
        <div class="stat-icon">▶️</div>
        <div class="stat-label">Aktive Player</div>
        <div class="stat-value"><?php echo $offline ? '—' : formatNum($statusData['activePlayers'] ?? 0); ?></div>
        <p style="color:#aaa; margin-top:.4rem;">Laufende Wiedergaben</p>
    </div>
    <div class="stat-card">
        <div class="stat-icon">🏰</div>
        <div class="stat-label">Guilds</div>
        <div class="stat-value"><?php echo $offline ? '—' : formatNum($statusData['guildCount'] ?? 0); ?></div>
        <p style="color:#aaa; margin-top:.4rem;">Server mit Musikbot</p>
    </div>
</div>

<div class="section">
    <h2>Guild-Übersicht</h2>
    <?php if ($offline || empty($guildsData)): ?>
    <p style="color:#999; text-align:center; padding:2rem;">
        <?php echo $offline ? 'Keine Daten verfügbar (Musikbot offline).' : 'Keine Guilds vorhanden.'; ?>
    </p>
    <?php else: ?>
    <table class="table">
        <thead>
            <tr>
                <th>Server</th>
                <th>Player</th>
                <th>24/7</th>
                <th>Läuft gerade</th>
                <th>Warteschlange</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($guildsData as $g): ?>
            <tr>
                <td>
                    <strong><?php echo esc($g['guildName'] ?? $g['guildId'] ?? '—'); ?></strong><br>
                    <small style="color:#666;"><?php echo esc($g['guildId'] ?? ''); ?></small>
                </td>
                <td>
                    <?php if ($g['hasPlayer'] ?? false): ?>
                    <span style="color:#51cf66; font-weight:700;">▶ Aktiv</span>
                    <?php else: ?>
                    <span style="color:#666;">Inaktiv</span>
                    <?php endif; ?>
                </td>
                <td>
                    <?php echo ($g['is247'] ?? false)
                        ? '<span style="color:#339af0; font-weight:700;">24/7</span>'
                        : '<span style="color:#555;">—</span>'; ?>
                </td>
                <td><?php echo esc($g['nowPlaying'] ?? '—'); ?></td>
                <td><?php echo ($g['queueLength'] ?? 0) > 0 ? formatNum($g['queueLength']) . ' Titel' : '—'; ?></td>
            </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
    <?php endif; ?>
</div>
