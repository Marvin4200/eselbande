<?php
$page_title = 'Deploys';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();

$raw = getAPI('/deploy/status');
$projects = $raw['data']['projects'] ?? [];

$botOffline = !isset($raw['data']);

function stateColor($state) {
    if ($state === 'success') return '#51cf66';
    if ($state === 'running') return '#ffd43b';
    if ($state === 'failed') return '#ff6b6b';
    return '#aaa';
}
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<?php if ($botOffline): ?>
<div class="alert alert-warning">⚠️ Bot-API aktuell nicht erreichbar — Deploy-Status kann nicht geladen werden.</div>
<?php endif; ?>

<div class="page-header">
    <h1>🚀 Deploys</h1>
    <p class="subtitle">GitHub webhook status, latest commits and PM2 deploy processes</p>
</div>

<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:1.5rem;">
    <?php foreach ($projects as $name => $project): ?>
    <?php $last = $project['lastDeploy'] ?? []; $state = $last['state'] ?? 'no deploy yet'; ?>
    <div class="section">
        <h2 style="text-transform:capitalize;"><?php echo esc($name); ?></h2>
        <div style="font-size:2rem; font-weight:800; color:<?php echo stateColor($state); ?>; margin-bottom:1rem;">
            <?php echo esc($state); ?>
        </div>
        <table class="table">
            <tbody>
                <tr><td>Repo</td><td style="font-size:.85rem;"><?php echo esc($project['repo'] ?? '—'); ?></td></tr>
                <tr><td>Branch</td><td><?php echo esc($project['branch'] ?? '—'); ?></td></tr>
                <tr><td>Webhook Port</td><td><?php echo esc($project['webhookPort'] ?? '—'); ?></td></tr>
                <tr><td>Secret</td><td><?php echo !empty($project['secretConfigured']) ? '<span style="color:#51cf66;">configured</span>' : '<span style="color:#ff6b6b;">missing</span>'; ?></td></tr>
                <tr><td>Webhook Process</td><td><?php echo esc($project['process']['status'] ?? 'not running'); ?></td></tr>
                <tr><td>App Process</td><td><?php echo esc($project['appProcess']['status'] ?? 'not running'); ?></td></tr>
                <tr><td>Commit</td><td><code><?php echo esc($project['git']['commit'] ?? '—'); ?></code></td></tr>
                <tr><td>Commit Message</td><td><?php echo esc($project['git']['subject'] ?? '—'); ?></td></tr>
                <tr><td>Last Updated</td><td><?php echo esc($last['updatedAt'] ?? '—'); ?></td></tr>
                <?php if (!empty($last['error'])): ?>
                <tr><td>Error</td><td style="color:#ff6b6b;"><?php echo esc($last['error']); ?></td></tr>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
    <?php endforeach; ?>
</div>

<?php include '../includes/footer.php'; ?>
