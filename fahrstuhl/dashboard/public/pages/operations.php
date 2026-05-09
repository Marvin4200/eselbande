<?php
$page_title = 'Operations';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<div class="page-header">
    <div class="page-header-row">
        <div>
            <h1>🛠️ Operations</h1>
            <p class="subtitle">Deploys, Webhooks, Security und Logs an einem Ort.</p>
        </div>
        <div class="page-meta">Last refresh: <?php echo date('d.m.Y H:i'); ?></div>
    </div>
</div>

<div class="hub-grid">
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/ops-health.php">
        <h3>📈 Ops Health</h3>
        <p>Zentraler Service-Status inkl. PM2, Memory und Deploy-State.</p>
    </a>
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/deploys.php">
        <h3>🚀 Deploys</h3>
        <p>Letzte Deploys und Webhook Runs.</p>
    </a>
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/webhooks.php">
        <h3>🪝 Webhooks</h3>
        <p>Webhook Endpoints, Secrets, Status.</p>
    </a>
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/security.php">
        <h3>🔐 Security</h3>
        <p>Server Checks, Hinweise und Fixes.</p>
    </a>
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/audit.php">
        <h3>🧾 Audit Log</h3>
        <p>Wichtige Aktionen und Änderungen.</p>
    </a>
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/logs.php">
        <h3>📋 Logs</h3>
        <p>Dashboard Logs und Runtime-Ausgaben.</p>
    </a>
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/backups.php">
        <h3>🗄️ Backups</h3>
        <p>DB- und Files-Backups erstellen, prüfen und wiederherstellen.</p>
    </a>
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/flags.php">
        <h3>🚩 Feature Flags</h3>
        <p>Feature Toggles und Experiment-Settings.</p>
    </a>
</div>

<?php include '../includes/footer.php'; ?>
