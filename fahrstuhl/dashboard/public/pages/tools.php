<?php
$page_title = 'Tools';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<div class="page-header">
    <div class="page-header-row">
        <div>
            <h1>🧰 Tools</h1>
            <p class="subtitle">Direktzugriff auf Live Tools.</p>
        </div>
        <div class="page-meta">Last refresh: <?php echo date('d.m.Y H:i'); ?></div>
    </div>
</div>

<div class="hub-grid">
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/voicetroll.php">
        <h3>🔊 Voice Troll</h3>
        <p>Voice Aktionen testen und steuern.</p>
    </a>
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/voice-time.php">
        <h3>⏱️ Voice Time</h3>
        <p>Zeigt, wie lange User in welchen Voice-Channels waren.</p>
    </a>
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/console.php">
        <h3>🖥️ Live Console</h3>
        <p>Runtime Logs und Debug.</p>
    </a>
</div>

<?php include '../includes/footer.php'; ?>
