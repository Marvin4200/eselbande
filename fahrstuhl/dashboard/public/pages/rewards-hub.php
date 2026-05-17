<?php
$page_title = 'Rewards';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();

$statsRaw = getAPI('/stats', 5);
$stats = $statsRaw['stats'] ?? [];
$votesRaw = getAPI('/monetization/votes?limit=5', 8);
$votes = $votesRaw['data']['votes'] ?? [];
$voteSummary = $votesRaw['data']['summary'] ?? [];
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<div class="page-header">
    <div class="page-header-row">
        <div>
            <h1>🎁 Rewards</h1>
            <p class="subtitle">Shields, Daily Claims, top.gg Votes, Voice Rewards und Promo Codes.</p>
        </div>
        <div class="page-meta">Last refresh: <?php echo date('d.m.Y H:i'); ?></div>
    </div>
</div>

<div class="stats-grid" style="margin-bottom:1rem;">
    <div class="stat-card"><div class="stat-icon">🛡️</div><div class="stat-label">Total Troll Events</div><div class="stat-value"><?php echo formatNum($stats['totalTrolls'] ?? 0); ?></div><p style="color:#aaa;">shield economy driver</p></div>
    <div class="stat-card"><div class="stat-icon">⭐</div><div class="stat-label">Votes</div><div class="stat-value"><?php echo formatNum($voteSummary['totalVotes'] ?? $voteSummary['total'] ?? 0); ?></div><p style="color:#aaa;">top.gg reward log</p></div>
    <div class="stat-card"><div class="stat-icon">⏱️</div><div class="stat-label">Voice Rewards</div><div class="stat-value">Live</div><p style="color:#aaa;">paid through EselTokens bridge</p></div>
    <div class="stat-card"><div class="stat-icon">🎟️</div><div class="stat-label">Promo Codes</div><div class="stat-value">Ready</div><p style="color:#aaa;">manual campaigns</p></div>
</div>

<div class="hub-grid" style="margin-bottom:1rem;">
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/monetization.php">
        <h3>💰 Reward Economy</h3>
        <p>Revenue, vote tracking, promo campaigns and reward overview.</p>
    </a>
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/redeem.php">
        <h3>🎟️ Redeem Codes</h3>
        <p>Create and manage shield or premium promo codes.</p>
    </a>
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/voice-time.php">
        <h3>⏱️ Voice Rewards</h3>
        <p>See who earns tokens through voice activity and audit payouts.</p>
    </a>
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/premium-hub.php">
        <h3>💎 Premium Rewards</h3>
        <p>Premium users, expiry calendar and premium reward hooks.</p>
    </a>
</div>

<div class="section">
    <div class="section-header">
        <h2>Reward Model</h2>
        <a class="btn-icon" href="https://top.gg/bot/1487187616674611321/vote" target="_blank"><span class="i">⭐</span> Vote page</a>
    </div>
    <div class="hub-grid">
        <div class="hub-card"><h3>Daily Shields</h3><p>Users claim shields with <code>/claim</code>. Shields protect them from troll actions.</p></div>
        <div class="hub-card"><h3>Vote Rewards</h3><p>top.gg votes currently add shields through the webhook and can be tracked here.</p></div>
        <div class="hub-card"><h3>Voice Tokens</h3><p>Voice time is sent to EselTokens in batches, including live sessions.</p></div>
        <div class="hub-card"><h3>Premium Boosts</h3><p>Premium can add longer troll durations, monthly bonuses and higher reward caps.</p></div>
    </div>
</div>

<?php include '../includes/footer.php'; ?>
