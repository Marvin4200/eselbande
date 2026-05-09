<?php
$page_title = 'User Search';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();

$query = trim($_GET['q'] ?? '');
$selectedId = trim($_GET['id'] ?? '');
$search = $query !== '' ? (getAPI('/users/search?q=' . urlencode($query), 20)['data']['users'] ?? []) : [];
$detail = $selectedId !== '' ? (getAPI('/users/' . urlencode($selectedId) . '/detail', 20)['data'] ?? null) : null;
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.search-row { display:grid; grid-template-columns:1fr auto; gap:.75rem; margin-bottom:1.5rem; }
.user-card { display:flex; align-items:center; gap:1rem; padding:1rem; background:var(--bg-secondary); border:1px solid var(--border-light); border-radius:10px; margin-bottom:.75rem; text-decoration:none; color:var(--text-primary); }
.user-card:hover { border-color:var(--primary); }
.user-card img { width:42px; height:42px; border-radius:50%; background:var(--bg-tertiary); }
.pill { display:inline-flex; padding:.2rem .55rem; border-radius:999px; font-size:.78rem; font-weight:800; }
.pill-ok { color:#51cf66; background:rgba(81,207,102,.12); border:1px solid rgba(81,207,102,.45); }
.pill-warn { color:#ffd43b; background:rgba(255,212,59,.12); border:1px solid rgba(255,212,59,.45); }
.detail-grid { display:grid;grid-template-columns:1fr 1fr;gap:1.5rem; }
@media (max-width: 950px) { .search-row, .detail-grid { grid-template-columns:1fr; } }
</style>

<div class="page-header">
    <h1>🔎 User Search</h1>
    <p class="subtitle">User finden, Shields/Premium prüfen, Command-Historie sehen</p>
</div>

<div class="section">
    <form method="GET" class="search-row">
        <div class="form-group" style="margin:0;"><input name="q" value="<?php echo esc($query); ?>" placeholder="Discord ID, Username oder Display Name"></div>
        <button class="btn-primary" type="submit">Suchen</button>
    </form>

    <?php foreach ($search as $u): ?>
        <a class="user-card" href="<?= BASE_URL ?>/pages/user-detail.php?q=<?= urlencode($query) ?>&id=<?= urlencode($u['userId']) ?>">
            <?php if (!empty($u['avatar'])): ?><img src="<?php echo esc($u['avatar']); ?>" alt=""><?php endif; ?>
            <div style="flex:1;">
                <strong><?php echo esc($u['globalName'] ?: $u['username'] ?: 'Unknown'); ?></strong>
                <div style="color:#999;font-size:.85rem;"><code><?php echo esc($u['userId']); ?></code> · <?php echo formatNum($u['commandCount'] ?? 0); ?> Commands</div>
            </div>
            <?php if (!empty($u['premium']['active'])): ?><span class="pill pill-warn"><?php echo ($u['premium']['tier'] ?? '') === 'pro' ? 'Pro' : 'Premium'; ?></span><?php endif; ?>
            <?php if (!empty($u['shields']['active'])): ?><span class="pill pill-ok">Shield</span><?php endif; ?>
        </a>
    <?php endforeach; ?>
    <?php if ($query !== '' && empty($search)): ?><p style="color:#999;">Keine User gefunden.</p><?php endif; ?>
</div>

<?php if ($detail): ?>
<div class="stats-grid">
    <div class="stat-card"><div class="stat-label">User</div><div class="stat-value" style="font-size:1.3rem;"><?php echo esc($detail['globalName'] ?: $detail['username'] ?: $detail['userId']); ?></div><p style="color:#aaa;"><code><?php echo esc($detail['userId']); ?></code></p></div>
    <div class="stat-card"><div class="stat-label">Shields</div><div class="stat-value"><?php echo formatNum($detail['shields']['owned'] ?? 0); ?></div><p style="color:#aaa;"><?php echo !empty($detail['shields']['active']) ? 'active' : 'inactive'; ?></p></div>
    <div class="stat-card"><div class="stat-label">Premium</div><div class="stat-value" style="font-size:1.4rem;"><?php echo !empty($detail['premium']['active']) ? esc($detail['premium']['tier'] ?? 'basic') : 'No'; ?></div><p style="color:#aaa;"><?php echo formatDate($detail['premium']['expiresAt'] ?? null); ?></p></div>
    <div class="stat-card"><div class="stat-label">Active Trolls</div><div class="stat-value"><?php echo formatNum(count($detail['activeTrolls'] ?? [])); ?></div><p style="color:#aaa;">currently running</p></div>
</div>

<div class="detail-grid">
    <div class="section">
        <h2>Top Commands</h2>
        <table class="table"><thead><tr><th>Command</th><th>Uses</th><th>Errors</th></tr></thead><tbody>
            <?php foreach (($detail['analytics']['topCommands'] ?? []) as $cmd): ?>
            <tr><td><code>/<?php echo esc($cmd['command']); ?></code></td><td><?php echo formatNum($cmd['count']); ?></td><td><?php echo formatNum($cmd['errors']); ?></td></tr>
            <?php endforeach; ?>
            <?php if (empty($detail['analytics']['topCommands'] ?? [])): ?><tr><td colspan="3" style="text-align:center;color:#999;">No data</td></tr><?php endif; ?>
        </tbody></table>
    </div>
    <div class="section">
        <h2>Servers</h2>
        <table class="table"><thead><tr><th>Server</th><th>Commands</th><th>Last</th></tr></thead><tbody>
            <?php foreach (($detail['analytics']['guilds'] ?? []) as $g): ?>
            <tr><td><?php echo esc($g['guildName']); ?><br><code><?php echo esc($g['guildId']); ?></code></td><td><?php echo formatNum($g['count']); ?></td><td><?php echo formatDate($g['lastUsed']); ?></td></tr>
            <?php endforeach; ?>
            <?php if (empty($detail['analytics']['guilds'] ?? [])): ?><tr><td colspan="3" style="text-align:center;color:#999;">No data</td></tr><?php endif; ?>
        </tbody></table>
    </div>
</div>

<div class="section">
    <h2>Recent Activity</h2>
    <table class="table"><thead><tr><th>Time</th><th>Command</th><th>Server</th><th>Status</th><th>Error</th></tr></thead><tbody>
        <?php foreach (($detail['analytics']['recent'] ?? []) as $row): ?>
        <tr>
            <td><?php echo formatDate($row['timestamp']); ?></td>
            <td><code>/<?php echo esc($row['command']); ?></code></td>
            <td><?php echo esc($row['guildName']); ?></td>
            <td style="color:<?php echo !empty($row['success']) ? '#51cf66' : '#ff6b6b'; ?>;"><?php echo !empty($row['success']) ? 'ok' : 'error'; ?></td>
            <td><?php echo esc($row['error'] ?? ''); ?></td>
        </tr>
        <?php endforeach; ?>
        <?php if (empty($detail['analytics']['recent'] ?? [])): ?><tr><td colspan="5" style="text-align:center;color:#999;">No activity</td></tr><?php endif; ?>
    </tbody></table>
</div>
<?php endif; ?>

<?php include '../includes/footer.php'; ?>
