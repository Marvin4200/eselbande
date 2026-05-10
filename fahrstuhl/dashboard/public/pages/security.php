<?php
$page_title = 'Security';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();

$raw = getAPI('/security/checks');
$data = $raw['data'] ?? [];
$checks = $data['checks'] ?? [];
$summary = $data['summary'] ?? [];
$nginx = $data['nginx'] ?? [];

$botOffline = !isset($raw['data']);
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<?php if ($botOffline): ?>
<div class="alert alert-warning">⚠️ Bot-API aktuell nicht erreichbar — Security-Checks können nicht geladen werden.</div>
<?php endif; ?>

<div class="page-header">
    <h1>🔐 Security</h1>
    <p class="subtitle">Secrets, process and internal API checks</p>
</div>

<div class="stats-grid">
    <div class="stat-card"><div class="stat-label">Checks</div><div class="stat-value"><?php echo formatNum($summary['total'] ?? 0); ?></div></div>
    <div class="stat-card"><div class="stat-label">Passed</div><div class="stat-value" style="color:#51cf66;"><?php echo formatNum($summary['passed'] ?? 0); ?></div></div>
    <div class="stat-card"><div class="stat-label">Failed</div><div class="stat-value" style="color:#ff6b6b;"><?php echo formatNum($summary['failed'] ?? 0); ?></div></div>
    <div class="stat-card"><div class="stat-label">Critical Failed</div><div class="stat-value" style="color:#ff6b6b;"><?php echo formatNum($summary['criticalFailed'] ?? 0); ?></div></div>
</div>

<?php if (!empty($nginx['available'])): ?>
<div class="section">
    <h2>Nginx Config Audit</h2>
    <table class="table">
        <tbody>
            <tr><td>sites-enabled</td><td><code><?php echo esc($nginx['dir'] ?? ''); ?></code></td></tr>
            <tr><td>Enabled files</td><td><?php echo formatNum(count($nginx['files'] ?? [])); ?></td></tr>
            <tr><td>Backup files loaded</td><td style="color:<?php echo empty($nginx['backupFiles']) ? '#51cf66' : '#ffd43b'; ?>;"><?php echo empty($nginx['backupFiles']) ? 'none' : esc(implode(', ', $nginx['backupFiles'])); ?></td></tr>
            <tr><td>Duplicate server_names</td><td style="color:<?php echo empty($nginx['duplicateServerNames']) ? '#51cf66' : '#ffd43b'; ?>;"><?php echo empty($nginx['duplicateServerNames']) ? 'none' : formatNum(count($nginx['duplicateServerNames'])); ?></td></tr>
        </tbody>
    </table>
    <?php if (!empty($nginx['backupFiles'])): ?>
        <p style="margin-top:1rem;color:#ffd43b;">Fix auf dem Server: <code>cd /home/marvin/fahrstuhl && bash scripts/cleanup-nginx-site-backups.sh</code></p>
    <?php endif; ?>
</div>
<?php endif; ?>

<div class="section">
    <h2>Checks</h2>
    <table class="table">
        <thead><tr><th>Status</th><th>Check</th><th>Severity</th><th>Detail</th></tr></thead>
        <tbody>
            <?php foreach ($checks as $check): ?>
            <tr>
                <td style="font-weight:800; color:<?php echo !empty($check['ok']) ? '#51cf66' : '#ff6b6b'; ?>;"><?php echo !empty($check['ok']) ? 'OK' : 'FAIL'; ?></td>
                <td><?php echo esc($check['name'] ?? ''); ?></td>
                <td><?php echo esc($check['severity'] ?? 'info'); ?></td>
                <td style="color:#aaa;"><?php echo esc($check['detail'] ?? ''); ?></td>
            </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
</div>

<?php include '../includes/footer.php'; ?>
