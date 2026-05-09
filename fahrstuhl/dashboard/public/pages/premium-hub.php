<?php
$page_title = 'Premium';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();

$calendar = getAPI('/premium/calendar?days=30', 10);
$revenue = getAPI('/monetization/revenue', 10);
$promos = getAPI('/monetization/promos', 10);
$votes = getAPI('/monetization/votes?limit=100', 10);

$calendarSummary = $calendar['data']['summary'] ?? [];
$revenueSummary = $revenue['data']['summary'] ?? [];
$promoCodes = $promos['data']['promoCodes'] ?? [];
$voteSummary = $votes['data']['summary'] ?? [];
$activePromos = count(array_filter($promoCodes, fn($promo) => !empty($promo['active'])));
$promoUses = array_reduce($promoCodes, fn($sum, $promo) => $sum + count($promo['redemptions'] ?? []), 0);
$promoCapacity = array_reduce($promoCodes, fn($sum, $promo) => $sum + (int)($promo['maxUses'] ?? 1), 0);

function hubMoney($amount) {
    return number_format((float)$amount, 2, ',', '.') . ' EUR';
}
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.premium-hero { border:1px solid rgba(255,215,0,.35); border-radius:16px; padding:1.35rem; margin-bottom:1.5rem; background:linear-gradient(135deg, rgba(255,215,0,.12), rgba(102,126,234,.1), rgba(15,23,42,.86)); display:flex; justify-content:space-between; gap:1rem; align-items:center; }
.premium-hero h1 { margin:0; }
.premium-hero p { margin:.35rem 0 0; color:var(--text-secondary); }
.premium-actions { display:flex; gap:.7rem; flex-wrap:wrap; }
.premium-kpis { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:1rem; margin-bottom:1.5rem; }
.premium-kpi { background:var(--panel); border:1px solid var(--border-light); border-radius:12px; padding:1rem; }
.premium-kpi span { color:var(--text-secondary); font-size:.75rem; font-weight:800; letter-spacing:.05em; text-transform:uppercase; }
.premium-kpi strong { display:block; font-size:1.55rem; margin-top:.3rem; }
.hub-card strong { display:block; margin-top:.75rem; color:var(--primary-light); }
@media (max-width: 900px) { .premium-hero { flex-direction:column; align-items:flex-start; } .premium-kpis { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width: 560px) { .premium-kpis { grid-template-columns:1fr; } }
</style>

<div class="page-header">
    <div class="page-header-row">
        <div>
            <h1>💎 Premium</h1>
            <p class="subtitle">Premium Users, Monetization und Codes.</p>
        </div>
        <div class="page-meta">Last refresh: <?php echo date('d.m.Y H:i'); ?></div>
    </div>
</div>

<div class="premium-hero">
    <div>
        <h1>Premium Growth Hub</h1>
        <p>Alles rund um Plan-Verkauf, Promo-Kampagnen, Revenue und Retention.</p>
    </div>
    <div class="premium-actions">
        <a class="btn-primary" href="<?php echo BASE_URL; ?>/pages/monetization.php">💰 Monetization öffnen</a>
        <a class="btn-secondary" href="<?php echo BASE_URL; ?>/pages/premium-info.php">📦 Public Plans</a>
    </div>
</div>

<div class="premium-kpis">
    <div class="premium-kpi"><span>Active Premium</span><strong><?php echo formatNum($calendarSummary['active'] ?? 0); ?></strong></div>
    <div class="premium-kpi"><span>Expiring 30d</span><strong><?php echo formatNum($calendarSummary['expiringSoon'] ?? 0); ?></strong></div>
    <div class="premium-kpi"><span>Revenue Month</span><strong><?php echo hubMoney($revenueSummary['monthly'] ?? 0); ?></strong></div>
    <div class="premium-kpi"><span>Promo Uses</span><strong><?php echo formatNum($promoUses); ?> / <?php echo formatNum($promoCapacity); ?></strong></div>
</div>

<div class="hub-grid">
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/premium.php">
        <h3>⭐ Premium Users</h3>
        <p>Aktive Premium/Pro Nutzer und Ablaufdaten.</p>
        <strong><?php echo formatNum($calendarSummary['active'] ?? 0); ?> active</strong>
    </a>
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/monetization.php">
        <h3>💰 Monetization</h3>
        <p>Revenue, Promo Codes und Vote Stuff.</p>
        <strong><?php echo hubMoney($revenueSummary['monthly'] ?? 0); ?> this month</strong>
    </a>
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/redeem.php">
        <h3>🎟️ Redeem Codes</h3>
        <p>Codes erstellen und einlösen.</p>
        <strong><?php echo formatNum($activePromos); ?> active promos</strong>
    </a>
    <a class="hub-card" href="<?php echo BASE_URL; ?>/pages/premium-info.php">
        <h3>📦 Plans & Info</h3>
        <p>Übersicht der Pläne und Features.</p>
        <strong><?php echo formatNum($voteSummary['votes24h'] ?? 0); ?> votes 24h</strong>
    </a>
</div>

<?php include '../includes/footer.php'; ?>
