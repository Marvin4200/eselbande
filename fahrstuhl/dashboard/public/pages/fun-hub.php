<?php
$page_title = 'Fun';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();

$commandsRaw = getAPI('/commands', 8);
$commands = $commandsRaw['data']['commands'] ?? [];
$funCommands = array_values(array_filter($commands, fn($cmd) => str_contains((string)($cmd['category'] ?? ''), 'Troll') || in_array($cmd['name'] ?? '', ['help', 'status', 'dashboard'], true)));
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<div class="page-header">
    <div class="page-header-row">
        <div>
            <h1>🎭 Fun</h1>
            <p class="subtitle">Trolls bleiben der Wiedererkennungswert, aber sauber als eigener Bereich.</p>
        </div>
        <div class="page-meta">Last refresh: <?php echo date('d.m.Y H:i'); ?></div>
    </div>
</div>

<div class="hub-grid" style="margin-bottom:1rem;">
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/voicetroll.php">
        <h3>🔊 Voice Troll Control</h3>
        <p>Live Voice-Aktionen testen und steuern.</p>
    </a>
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/commands.php">
        <h3>⌨️ Command Center</h3>
        <p>Alle Slash Commands, Nutzung, Fehler und Kategorien.</p>
    </a>
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/flags.php">
        <h3>🚩 Feature Flags</h3>
        <p>Experimente und neue Fun Features kontrolliert aktivieren.</p>
    </a>
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/premium-hub.php">
        <h3>💎 Premium Fun</h3>
        <p>Längere Effekte, exklusive Presets und Premium-Boosts.</p>
    </a>
</div>

<div class="section">
    <div class="section-header"><h2>Fun Commands</h2></div>
    <div class="table-scroll">
        <table class="table table-compact">
            <thead><tr><th>Command</th><th>Category</th><th>Uses</th><th>Errors</th><th>Premium</th></tr></thead>
            <tbody>
            <?php foreach (array_slice($funCommands, 0, 12) as $cmd): ?>
                <tr>
                    <td><code>/<?php echo esc($cmd['name'] ?? 'unknown'); ?></code><br><span style="color:#999;"><?php echo esc($cmd['description'] ?? ''); ?></span></td>
                    <td><?php echo esc($cmd['category'] ?? 'Other'); ?></td>
                    <td><?php echo formatNum($cmd['uses'] ?? 0); ?></td>
                    <td><?php echo formatNum($cmd['errors'] ?? 0); ?></td>
                    <td><?php echo !empty($cmd['premium']) ? '<span style="color:#ffd43b;">yes</span>' : '<span style="color:#777;">no</span>'; ?></td>
                </tr>
            <?php endforeach; ?>
            <?php if (empty($funCommands)): ?><tr><td colspan="5" style="text-align:center;color:#999;">No command data yet.</td></tr><?php endif; ?>
            </tbody>
        </table>
    </div>
</div>

<?php include '../includes/footer.php'; ?>
