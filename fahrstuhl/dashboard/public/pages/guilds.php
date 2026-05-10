<?php
$page_title = 'Guilds';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();

$response     = getAPI('/guilds');
$guilds       = $response['data']['guilds']       ?? [];
$total        = $response['data']['total']        ?? 0;
$totalMembers = $response['data']['totalMembers'] ?? 0;

$botOffline = !isset($response['data']);
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<?php if ($botOffline): ?>
<div class="alert alert-warning">⚠️ Bot-API aktuell nicht erreichbar — Guild-Daten können nicht geladen werden.</div>
<?php endif; ?>

<div class="page-header">
    <h1>🏰 Guilds</h1>
    <p class="subtitle"><?php echo $total; ?> servers · <?php echo number_format($totalMembers); ?> total members</p>
</div>

<!-- Stats -->
<div style="display:flex; gap:var(--sp-4); margin-bottom:var(--sp-6); flex-wrap:wrap;">
    <div class="stat-card" style="flex:1; min-width:140px;">
        <div class="stat-value"><?php echo $total; ?></div>
        <div class="stat-label">Servers</div>
    </div>
    <div class="stat-card" style="flex:1; min-width:140px;">
        <div class="stat-value"><?php echo number_format($totalMembers); ?></div>
        <div class="stat-label">Total Members</div>
    </div>
    <div class="stat-card" style="flex:1; min-width:140px;">
        <div class="stat-value"><?php echo $total > 0 ? number_format(round($totalMembers / $total)) : 0; ?></div>
        <div class="stat-label">Avg. Members</div>
    </div>
</div>

<!-- Search -->
<div class="section" style="padding:14px 18px; margin-bottom:16px;">
    <input type="text" id="search" placeholder="🔍 Search server..." oninput="filterGuilds()"
        style="padding:var(--sp-2) var(--sp-3); border-radius:6px; border:1px solid #333; background:#1a1a2e; color:#e0e0e0; width:280px;">
    <span id="rowCount" style="color:#aaa; font-size:0.9em; margin-left:var(--sp-4);"></span>
</div>

<!-- Grid -->
<div id="guildGrid" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:var(--sp-4);">
<?php foreach ($guilds as $g): ?>
    <a class="section guild-card" href="<?= BASE_URL ?>/pages/guild-detail.php?id=<?php echo urlencode($g['id']); ?>"
         data-name="<?php echo esc(strtolower($g['name'])); ?>"
         style="display:flex; align-items:center; gap:14px; padding:16px 18px; text-decoration:none; color:inherit;">
        <?php if ($g['icon']): ?>
            <img src="<?php echo esc($g['icon']); ?>" alt="" style="width:48px;height:48px;border-radius:50%;flex-shrink:0;">
        <?php else: ?>
            <div style="width:48px;height:48px;border-radius:50%;background:#333;display:flex;align-items:center;justify-content:center;font-size:1.4em;flex-shrink:0;">🏰</div>
        <?php endif; ?>
        <div style="overflow:hidden;">
            <div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"><?php echo esc($g['name']); ?></div>
            <div style="color:#aaa; font-size:0.82em;">👥 <?php echo number_format($g['memberCount']); ?> members</div>
            <div style="color:#666; font-size:0.75em; margin-top:2px;">ID: <?php echo esc($g['id']); ?></div>
            <?php if ($g['joinedAt']): ?>
            <div style="color:#666; font-size:0.75em;">Joined <?php echo date('d.m.Y', strtotime($g['joinedAt'])); ?></div>
            <?php endif; ?>
        </div>
    </a>
<?php endforeach; ?>
</div>

<?php if (empty($guilds)): ?>
    <div class="section"><p style="color:#999;">No guild data – is the bot online?</p></div>
<?php endif; ?>

<script>
function filterGuilds() {
    const q = document.getElementById('search').value.toLowerCase();
    const cards = document.querySelectorAll('.guild-card');
    let visible = 0;
    cards.forEach(c => {
        const match = !q || c.dataset.name.includes(q);
        c.style.display = match ? '' : 'none';
        if (match) visible++;
    });
    document.getElementById('rowCount').textContent = `Showing ${visible} of <?php echo count($guilds); ?>`;
}
filterGuilds();
</script>

<?php include '../includes/footer.php'; ?>
