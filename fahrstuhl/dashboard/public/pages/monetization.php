<?php
$page_title = 'Monetization';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();

$message = '';
$messageType = 'success';

function moneyFmt($amount, $currency = 'EUR') {
    return number_format((float)$amount, 2, ',', '.') . ' ' . esc($currency ?: 'EUR');
}

function pctFmt($value) {
    return number_format((float)$value, 1, ',', '.') . '%';
}

function actionMessage($result, $successText) {
    if ($result['data']['success'] ?? false) {
        return ['success', $successText];
    }
    return ['error', $result['data']['message'] ?? 'Unknown API error'];
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    if ($action === 'send_reminders') {
        $days = max(1, min(90, intval($_POST['days_before'] ?? 3)));
        $result = api('/premium/reminders/send', 'POST', ['daysBefore' => $days], 30);
        [$messageType, $message] = actionMessage($result, 'Reminder run completed');
    }

    if ($action === 'add_revenue') {
        $payload = [
            'userId' => trim($_POST['user_id'] ?? ''),
            'username' => trim($_POST['username'] ?? ''),
            'amount' => (float)($_POST['amount'] ?? 0),
            'currency' => trim($_POST['currency'] ?? 'EUR'),
            'source' => trim($_POST['source'] ?? 'manual'),
            'tier' => trim($_POST['tier'] ?? ''),
            'note' => trim($_POST['note'] ?? ''),
        ];
        $result = api('/monetization/revenue', 'POST', $payload);
        [$messageType, $message] = actionMessage($result, 'Revenue entry saved');
    }

    if ($action === 'delete_revenue') {
        $result = api('/monetization/revenue/delete', 'POST', ['id' => $_POST['id'] ?? '']);
        [$messageType, $message] = actionMessage($result, 'Revenue entry deleted');
    }

    if ($action === 'create_promo') {
        $type = ($_POST['type'] ?? '') === 'shields' ? 'shields' : 'premium';
        $payload = [
            'code' => trim($_POST['code'] ?? ''),
            'type' => $type,
            'tier' => $_POST['tier'] ?? 'basic',
            'days' => intval($_POST['days'] ?? 30),
            'shields' => intval($_POST['shields'] ?? 1),
            'maxUses' => intval($_POST['max_uses'] ?? 1),
            'expiresAt' => trim($_POST['expires_at'] ?? ''),
            'note' => trim($_POST['note'] ?? ''),
        ];
        if ($payload['expiresAt'] === '') $payload['expiresAt'] = null;
        $result = api('/monetization/promos/create', 'POST', $payload);
        [$messageType, $message] = actionMessage($result, 'Promo code created');
    }

    if ($action === 'toggle_promo') {
        $result = api('/monetization/promos/toggle', 'POST', [
            'code' => $_POST['code'] ?? '',
            'active' => ($_POST['active'] ?? '1') === '1',
        ]);
        [$messageType, $message] = actionMessage($result, 'Promo code updated');
    }

    if ($action === 'redeem_promo') {
        $result = api('/monetization/promos/redeem', 'POST', [
            'code' => trim($_POST['code'] ?? ''),
            'userId' => trim($_POST['redeem_user_id'] ?? ''),
        ]);
        [$messageType, $message] = actionMessage($result, 'Promo code redeemed');
    }
}

$calendar = getAPI('/premium/calendar?days=30', 20);
$revenue = getAPI('/monetization/revenue', 10);
$promos = getAPI('/monetization/promos', 10);
$votes = getAPI('/monetization/votes?limit=100', 10);

$calendarData = $calendar['data'] ?? ['users' => [], 'summary' => []];
$revenueData = $revenue['data'] ?? ['entries' => [], 'summary' => []];
$promoCodes = $promos['data']['promoCodes'] ?? [];
$voteData = $votes['data'] ?? ['votes' => [], 'summary' => []];

$premiumUsers = $calendarData['users'] ?? [];
$activePremium = (int)($calendarData['summary']['active'] ?? 0);
$expiringSoon = (int)($calendarData['summary']['expiringSoon'] ?? 0);
$proUsers = count(array_filter($premiumUsers, fn($u) => ($u['tier'] ?? 'basic') === 'pro' && empty($u['expired'])));
$basicUsers = max(0, $activePremium - $proUsers);
$expiredUsers = count(array_filter($premiumUsers, fn($u) => !empty($u['expired'])));
$expiring7 = count(array_filter($premiumUsers, fn($u) => ($u['daysRemaining'] ?? 999) >= 0 && ($u['daysRemaining'] ?? 999) <= 7 && empty($u['expired'])));

$revenueEntries = $revenueData['entries'] ?? [];
$revenueTotal = (float)($revenueData['summary']['total'] ?? 0);
$revenueMonth = (float)($revenueData['summary']['monthly'] ?? 0);
$orderCount = (int)($revenueData['summary']['count'] ?? count($revenueEntries));
$avgOrder = $orderCount > 0 ? $revenueTotal / $orderCount : 0;
$projectedMonth = $revenueMonth > 0 ? ($revenueMonth / max(1, (int)date('j'))) * (int)date('t') : 0;

$activePromos = count(array_filter($promoCodes, fn($promo) => !empty($promo['active'])));
$promoUses = array_reduce($promoCodes, fn($sum, $promo) => $sum + count($promo['redemptions'] ?? []), 0);
$promoCapacity = array_reduce($promoCodes, fn($sum, $promo) => $sum + (int)($promo['maxUses'] ?? 1), 0);
$promoUsageRate = $promoCapacity > 0 ? ($promoUses / $promoCapacity) * 100 : 0;
$voteRewards = (int)($voteData['summary']['rewardsGiven'] ?? 0);
$votes24h = (int)($voteData['summary']['votes24h'] ?? 0);

$redemptions = [];
foreach ($promoCodes as $promo) {
    foreach (($promo['redemptions'] ?? []) as $redemption) {
        $redemptions[] = [
            'code' => $promo['code'] ?? '',
            'type' => $promo['type'] ?? 'premium',
            'tier' => $promo['tier'] ?? 'basic',
            'userId' => $redemption['userId'] ?? '',
            'redeemedAt' => $redemption['completedAt'] ?? $redemption['redeemedAt'] ?? null,
            'pending' => !empty($redemption['pending']),
        ];
    }
}
usort($redemptions, fn($a, $b) => strtotime($b['redeemedAt'] ?? '1970-01-01') <=> strtotime($a['redeemedAt'] ?? '1970-01-01'));
$redemptions = array_slice($redemptions, 0, 12);

$growthActions = [
    ['label' => '7d winback', 'hint' => $expiring7 . ' users laufen diese Woche ab', 'value' => $expiring7 > 0 ? 'High priority' : 'Clean', 'tone' => $expiring7 > 0 ? 'warn' : 'ok'],
    ['label' => 'Pro upsell', 'hint' => $basicUsers . ' Premium users ohne Pro', 'value' => $basicUsers > 0 ? 'Pitch Pro' : 'No pool', 'tone' => $basicUsers > 0 ? 'gold' : 'muted'],
    ['label' => 'Promo pressure', 'hint' => $activePromos . ' aktive Codes', 'value' => pctFmt($promoUsageRate) . ' used', 'tone' => $promoUsageRate >= 80 ? 'warn' : 'ok'],
    ['label' => 'Vote flywheel', 'hint' => $voteRewards . ' Shields durch Votes', 'value' => $votes24h . ' votes 24h', 'tone' => $votes24h > 0 ? 'ok' : 'muted'],
];

$sourceRows = [];
foreach (($revenueData['summary']['bySource'] ?? []) as $source => $amount) {
    $sourceRows[] = ['source' => $source ?: 'manual', 'amount' => (float)$amount];
}
usort($sourceRows, fn($a, $b) => $b['amount'] <=> $a['amount']);
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.alert { padding:12px 15px; border-radius:8px; border-left:4px solid; margin-bottom:20px; }
.alert-success { background:rgba(81,207,102,.12); color:#51cf66; border-color:#51cf66; }
.alert-error { background:rgba(255,107,107,.12); color:#ff6b6b; border-color:#ff6b6b; }
.money-hero { position:relative; overflow:hidden; border:1px solid rgba(255,215,0,.35); border-radius:16px; padding:1.5rem; margin-bottom:1.5rem; background:linear-gradient(135deg, rgba(255,215,0,.13), rgba(102,126,234,.12) 45%, rgba(15,23,42,.86)); display:grid; grid-template-columns:1.3fr .7fr; gap:1.25rem; align-items:stretch; }
.money-hero h1 { margin:0; font-size:2rem; }
.money-hero p { margin:.35rem 0 0; color:var(--text-secondary); max-width:760px; }
.hero-actions { display:flex; gap:.7rem; flex-wrap:wrap; margin-top:1rem; }
.hero-panel { background:rgba(0,0,0,.22); border:1px solid rgba(255,255,255,.1); border-radius:12px; padding:1rem; display:grid; gap:.75rem; }
.hero-panel-row { display:flex; justify-content:space-between; gap:1rem; color:var(--text-secondary); }
.hero-panel-row strong { color:var(--text-primary); }
.ops-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:1rem; margin-bottom:1.5rem; }
.ops-card { background:var(--panel); border:1px solid var(--border-light); border-radius:12px; padding:1rem; min-height:132px; display:flex; flex-direction:column; gap:.55rem; }
.ops-card .ops-label { color:var(--text-secondary); font-size:.78rem; font-weight:800; text-transform:uppercase; letter-spacing:.05em; }
.ops-card .ops-value { font-size:1.45rem; font-weight:900; }
.ops-card .ops-hint { color:var(--text-secondary); font-size:.84rem; line-height:1.35; margin-top:auto; }
.ops-card.ok { border-color:rgba(81,207,102,.28); }
.ops-card.warn { border-color:rgba(255,212,59,.4); }
.ops-card.gold { border-color:rgba(255,215,0,.42); }
.ops-card.muted { opacity:.78; }
.grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; margin-bottom:2rem; }
.grid-3 { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:1rem; margin-bottom:2rem; }
.grid-4 { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:1rem; margin-bottom:1.5rem; }
.pill { display:inline-flex; align-items:center; gap:.35rem; padding:.2rem .55rem; border-radius:999px; font-size:.78rem; font-weight:700; }
.pill-ok { background:rgba(81,207,102,.12); color:#51cf66; border:1px solid rgba(81,207,102,.5); }
.pill-warn { background:rgba(255,212,59,.12); color:#ffd43b; border:1px solid rgba(255,212,59,.5); }
.pill-danger { background:rgba(255,107,107,.12); color:#ff6b6b; border:1px solid rgba(255,107,107,.5); }
.pill-muted { background:rgba(160,174,192,.12); color:#a0aec0; border:1px solid rgba(160,174,192,.3); }
.pill-gold { background:rgba(255,215,0,.14); color:#ffd700; border:1px solid rgba(255,215,0,.42); }
.form-inline { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:1rem; align-items:end; }
.btn-danger { background:rgba(255,107,107,.18); color:#ff6b6b; border:1px solid #ff6b6b; padding:.45rem .8rem; border-radius:6px; cursor:pointer; }
.btn-secondary { background:var(--bg-tertiary); color:var(--text-primary); border:1px solid var(--border-light); padding:.55rem .9rem; border-radius:6px; cursor:pointer; }
.plan-lab { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:1rem; margin-bottom:2rem; }
.plan-box { background:var(--panel); border:1px solid var(--border-light); border-radius:12px; padding:1.1rem; display:flex; flex-direction:column; gap:.7rem; }
.plan-box.featured { border-color:rgba(255,215,0,.55); box-shadow:0 0 0 1px rgba(255,215,0,.25) inset; }
.plan-box h3 { margin:0; }
.plan-price { font-size:1.65rem; font-weight:900; color:var(--primary-light); }
.plan-price span { color:var(--text-secondary); font-size:.85rem; font-weight:600; }
.mini-list { list-style:none; display:grid; gap:.42rem; color:var(--text-secondary); font-size:.88rem; padding:0; margin:0; }
.mini-list li { display:flex; gap:.45rem; align-items:flex-start; }
.revenue-bars { display:grid; gap:.65rem; }
.bar-row { display:grid; grid-template-columns:110px 1fr 90px; gap:.7rem; align-items:center; color:var(--text-secondary); font-size:.86rem; }
.bar-track { height:8px; background:rgba(255,255,255,.08); border-radius:999px; overflow:hidden; }
.bar-fill { height:100%; background:linear-gradient(90deg,#51cf66,var(--primary-light)); border-radius:inherit; }
.table code { color:var(--primary-light); }
@media (max-width: 1100px) { .ops-grid, .plan-lab { grid-template-columns:repeat(2,minmax(0,1fr)); } .money-hero { grid-template-columns:1fr; } }
@media (max-width: 920px) { .grid-2 { grid-template-columns:1fr; } }
@media (max-width: 700px) { .ops-grid, .plan-lab { grid-template-columns:1fr; } .bar-row { grid-template-columns:1fr; gap:.35rem; } }
</style>

<div class="money-hero">
    <div>
        <h1>💰 Monetization Command Center</h1>
        <p>Premium-Verkäufe, Ablauf-Risiken, Promo-Kampagnen und Vote-Rewards an einem Ort. Ziel: schneller sehen, wo Geld liegen bleibt und welche Aktion heute Umsatz bringt.</p>
        <div class="hero-actions">
            <a class="btn-primary" href="<?php echo BASE_URL; ?>/pages/premium-info.php">📦 Plans ansehen</a>
            <a class="btn-secondary" href="https://discord.gg/zfzDHKcWDx" target="_blank">💬 Sales Support</a>
        </div>
    </div>
    <div class="hero-panel">
        <div class="hero-panel-row"><span>Projected month</span><strong><?php echo moneyFmt($projectedMonth); ?></strong></div>
        <div class="hero-panel-row"><span>Average order</span><strong><?php echo moneyFmt($avgOrder); ?></strong></div>
        <div class="hero-panel-row"><span>Promo usage</span><strong><?php echo pctFmt($promoUsageRate); ?></strong></div>
        <div class="hero-panel-row"><span>Premium mix</span><strong><?php echo formatNum($proUsers); ?> Pro / <?php echo formatNum($basicUsers); ?> Basic</strong></div>
    </div>
</div>

<?php if ($message): ?>
    <div class="alert alert-<?php echo esc($messageType); ?>"><?php echo esc($message); ?></div>
<?php endif; ?>

<div class="ops-grid">
    <?php foreach ($growthActions as $action): ?>
        <div class="ops-card <?php echo esc($action['tone']); ?>">
            <div class="ops-label"><?php echo esc($action['label']); ?></div>
            <div class="ops-value"><?php echo esc($action['value']); ?></div>
            <div class="ops-hint"><?php echo esc($action['hint']); ?></div>
        </div>
    <?php endforeach; ?>
</div>

<div class="grid-4">
    <div class="stat-card">
        <div class="stat-icon">💎</div>
        <div class="stat-label">Active Premium</div>
        <div class="stat-value"><?php echo formatNum($activePremium); ?></div>
    </div>
    <div class="stat-card">
        <div class="stat-icon">⏳</div>
        <div class="stat-label">Expiring 30d</div>
        <div class="stat-value"><?php echo formatNum($expiringSoon); ?></div>
    </div>
    <div class="stat-card">
        <div class="stat-icon">💶</div>
        <div class="stat-label">Revenue Month</div>
        <div class="stat-value"><?php echo moneyFmt($revenueMonth); ?></div>
    </div>
    <div class="stat-card">
        <div class="stat-icon">⭐</div>
        <div class="stat-label">Votes 24h</div>
        <div class="stat-value"><?php echo formatNum($votes24h); ?></div>
    </div>
    <div class="stat-card">
        <div class="stat-icon">🎟️</div>
        <div class="stat-label">Promo Uses</div>
        <div class="stat-value"><?php echo formatNum($promoUses); ?> / <?php echo formatNum($promoCapacity); ?></div>
    </div>
    <div class="stat-card">
        <div class="stat-icon">📈</div>
        <div class="stat-label">Total Revenue</div>
        <div class="stat-value"><?php echo moneyFmt($revenueTotal); ?></div>
    </div>
    <div class="stat-card">
        <div class="stat-icon">👑</div>
        <div class="stat-label">Pro Users</div>
        <div class="stat-value"><?php echo formatNum($proUsers); ?></div>
    </div>
    <div class="stat-card">
        <div class="stat-icon">🧲</div>
        <div class="stat-label">Expired</div>
        <div class="stat-value"><?php echo formatNum($expiredUsers); ?></div>
    </div>
</div>

<div class="plan-lab">
    <div class="plan-box">
        <h3>Free → Premium</h3>
        <div class="plan-price">4,99€ <span>/ month</span></div>
        <ul class="mini-list">
            <li><span>✅</span><span>5 minute troll effects as first obvious upgrade</span></li>
            <li><span>✅</span><span>DM alerts via /notifysettings</span></li>
            <li><span>✅</span><span>Premium badge and priority support</span></li>
        </ul>
    </div>
    <div class="plan-box featured">
        <h3>Premium → Pro</h3>
        <div class="plan-price">9,99€ <span>/ month</span></div>
        <ul class="mini-list">
            <li><span>👑</span><span>Custom troll messages as Pro anchor</span></li>
            <li><span>👑</span><span>10 minute effects and multi-target elevator</span></li>
            <li><span>👑</span><span>+10 monthly shields for retention</span></li>
        </ul>
    </div>
    <div class="plan-box">
        <h3>Campaign Ideas</h3>
        <ul class="mini-list">
            <li><span>🎟️</span><span>Weekend code: 3 days Pro, max 25 uses</span></li>
            <li><span>⭐</span><span>Vote streak: shields now, Premium upsell later</span></li>
            <li><span>⏳</span><span>7-day winback DM before expiry</span></li>
            <li><span>💬</span><span>Manual Discord checkout keeps it flexible</span></li>
        </ul>
    </div>
</div>

<?php if (!empty($sourceRows)): ?>
<div class="section">
    <h2>Revenue Sources</h2>
    <div class="revenue-bars">
        <?php foreach ($sourceRows as $row): ?>
            <?php $share = $revenueTotal > 0 ? min(100, ($row['amount'] / $revenueTotal) * 100) : 0; ?>
            <div class="bar-row">
                <strong><?php echo esc($row['source']); ?></strong>
                <div class="bar-track"><div class="bar-fill" style="width: <?php echo $share; ?>%;"></div></div>
                <span><?php echo moneyFmt($row['amount']); ?></span>
            </div>
        <?php endforeach; ?>
    </div>
</div>
<?php endif; ?>

<div class="section">
    <h2>Premium Ablauf-Kalender</h2>
    <form method="POST" class="form-inline" style="margin-bottom:1rem;">
        <div class="form-group">
            <label>Reminder bei Ablauf in X Tagen</label>
            <input type="number" name="days_before" value="3" min="1" max="90">
        </div>
        <button class="btn-primary" type="submit" name="action" value="send_reminders">📨 Reminder senden</button>
    </form>

    <table class="table">
        <thead>
            <tr><th>User</th><th>Tier</th><th>Läuft ab</th><th>Rest</th><th>Status</th></tr>
        </thead>
        <tbody>
            <?php foreach (($calendarData['users'] ?? []) as $u): ?>
            <tr>
                <td>
                    <strong><?php echo esc($u['displayName'] ?? $u['username'] ?? 'Unknown'); ?></strong><br>
                    <code><?php echo esc($u['userId'] ?? ''); ?></code>
                </td>
                <td><?php echo ($u['tier'] ?? 'basic') === 'pro' ? '👑 Pro' : '💎 Basic'; ?></td>
                <td><?php echo formatDate($u['expiresAt'] ?? null); ?></td>
                <td><?php echo isset($u['daysRemaining']) ? esc($u['daysRemaining']) . 'd' : '—'; ?></td>
                <td>
                    <?php if (!empty($u['expired'])): ?>
                        <span class="pill pill-danger">Expired</span>
                    <?php elseif (!empty($u['expiringSoon'])): ?>
                        <span class="pill pill-warn">Soon</span>
                    <?php else: ?>
                        <span class="pill pill-ok">Active</span>
                    <?php endif; ?>
                </td>
            </tr>
            <?php endforeach; ?>
            <?php if (empty($calendarData['users'])): ?><tr><td colspan="5" style="text-align:center;color:#999;">No premium users found</td></tr><?php endif; ?>
        </tbody>
    </table>
</div>

<div class="grid-2">
    <div class="section">
        <h2>Revenue Tracker</h2>
        <form method="POST" class="form">
            <div class="form-group"><label>User ID</label><input name="user_id" placeholder="Discord User ID"></div>
            <div class="form-group"><label>Username</label><input name="username" placeholder="optional"></div>
            <div class="form-group"><label>Amount</label><input type="number" step="0.01" min="0.01" name="amount" required></div>
            <div class="form-group"><label>Source</label><input name="source" value="manual"></div>
            <div class="form-group"><label>Tier / Note</label><input name="tier" placeholder="basic, pro, shields"><textarea name="note" rows="2" placeholder="optional note"></textarea></div>
            <input type="hidden" name="currency" value="EUR">
            <button class="btn-primary" type="submit" name="action" value="add_revenue">💾 Revenue speichern</button>
        </form>
    </div>

    <div class="section">
        <h2>Promo-Code erstellen</h2>
        <form method="POST" class="form">
            <div class="form-group"><label>Code</label><input name="code" placeholder="leer = automatisch"></div>
            <div class="form-group">
                <label>Typ</label>
                <select name="type">
                    <option value="premium">Premium</option>
                    <option value="shields">Shields</option>
                </select>
            </div>
            <div class="form-group"><label>Tier / Tage</label><select name="tier"><option value="basic">Basic</option><option value="pro">Pro</option></select><input type="number" name="days" value="30" min="1"></div>
            <div class="form-group"><label>Shields / Max Uses</label><input type="number" name="shields" value="2" min="1"><input type="number" name="max_uses" value="1" min="1"></div>
            <div class="form-group"><label>Ablaufdatum</label><input type="datetime-local" name="expires_at"></div>
            <div class="form-group"><label>Note</label><textarea name="note" rows="2"></textarea></div>
            <button class="btn-primary" type="submit" name="action" value="create_promo">🎟️ Code erstellen</button>
        </form>
    </div>
</div>

<div class="section">
    <h2>Promo-Codes</h2>
    <form method="POST" class="form-inline" style="margin-bottom:1rem;">
        <div class="form-group"><label>Code einlösen</label><input name="code" required></div>
        <div class="form-group"><label>User ID</label><input name="redeem_user_id" required></div>
        <button class="btn-primary" type="submit" name="action" value="redeem_promo">✅ Einlösen</button>
    </form>

    <table class="table">
        <thead><tr><th>Code</th><th>Reward</th><th>Uses</th><th>Expires</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>
            <?php foreach ($promoCodes as $promo): ?>
            <?php $used = count($promo['redemptions'] ?? []); $max = $promo['maxUses'] ?? 1; ?>
            <tr>
                <td><code><?php echo esc($promo['code'] ?? ''); ?></code><br><small style="color:#999;"><?php echo esc($promo['note'] ?? ''); ?></small></td>
                <td>
                    <?php if (($promo['type'] ?? '') === 'shields'): ?>
                        🛡️ <?php echo formatNum($promo['shields'] ?? 0); ?> Shields
                    <?php else: ?>
                        <?php echo ($promo['tier'] ?? 'basic') === 'pro' ? '👑 Pro' : '💎 Basic'; ?> · <?php echo formatNum($promo['days'] ?? 0); ?>d
                    <?php endif; ?>
                </td>
                <td><?php echo formatNum($used); ?> / <?php echo formatNum($max); ?></td>
                <td><?php echo formatDate($promo['expiresAt'] ?? null); ?></td>
                <td><?php echo !empty($promo['active']) ? '<span class="pill pill-ok">Active</span>' : '<span class="pill pill-muted">Inactive</span>'; ?></td>
                <td>
                    <form method="POST">
                        <input type="hidden" name="code" value="<?php echo esc($promo['code'] ?? ''); ?>">
                        <input type="hidden" name="active" value="<?php echo !empty($promo['active']) ? '0' : '1'; ?>">
                        <button class="btn-secondary" type="submit" name="action" value="toggle_promo"><?php echo !empty($promo['active']) ? 'Disable' : 'Enable'; ?></button>
                    </form>
                </td>
            </tr>
            <?php endforeach; ?>
            <?php if (empty($promoCodes)): ?><tr><td colspan="6" style="text-align:center;color:#999;">No promo codes yet</td></tr><?php endif; ?>
        </tbody>
    </table>
</div>

<div class="grid-2">
    <div class="section">
        <h2>Campaign Presets</h2>
        <div class="grid-3" style="margin-bottom:0;">
            <div class="plan-box">
                <h3>Trial Drop</h3>
                <p style="color:var(--text-secondary);">3 Tage Pro, 25 Uses, ideal für neue Server nach Setup.</p>
                <span class="pill pill-gold">PRO3D</span>
            </div>
            <div class="plan-box">
                <h3>Winback</h3>
                <p style="color:var(--text-secondary);">7 Tage Premium für User, die abgelaufen sind oder bald ablaufen.</p>
                <span class="pill pill-warn">COMEBACK7</span>
            </div>
            <div class="plan-box">
                <h3>Vote Boost</h3>
                <p style="color:var(--text-secondary);">5 Shields als Give-away, danach Premium im Support pitchen.</p>
                <span class="pill pill-ok">VOTESHIELD</span>
            </div>
        </div>
    </div>

    <div class="section">
        <h2>Latest Redemptions</h2>
        <table class="table">
            <thead><tr><th>Code</th><th>User</th><th>Reward</th><th>When</th></tr></thead>
            <tbody>
                <?php foreach ($redemptions as $redemption): ?>
                <tr>
                    <td><code><?php echo esc($redemption['code']); ?></code><?php echo $redemption['pending'] ? ' <span class="pill pill-warn">Pending</span>' : ''; ?></td>
                    <td><code><?php echo esc($redemption['userId']); ?></code></td>
                    <td><?php echo $redemption['type'] === 'shields' ? '🛡️ Shields' : (($redemption['tier'] === 'pro') ? '👑 Pro' : '💎 Premium'); ?></td>
                    <td><?php echo formatDate($redemption['redeemedAt']); ?></td>
                </tr>
                <?php endforeach; ?>
                <?php if (empty($redemptions)): ?><tr><td colspan="4" style="text-align:center;color:#999;">No redemptions yet</td></tr><?php endif; ?>
            </tbody>
        </table>
    </div>
</div>

<div class="grid-2">
    <div class="section">
        <h2>Revenue Entries</h2>
        <table class="table">
            <thead><tr><th>Date</th><th>User</th><th>Amount</th><th>Source</th><th></th></tr></thead>
            <tbody>
                <?php foreach (($revenueData['entries'] ?? []) as $row): ?>
                <tr>
                    <td><?php echo formatDate($row['createdAt'] ?? null); ?></td>
                    <td><?php echo esc($row['username'] ?: $row['userId'] ?: '—'); ?><br><small style="color:#999;"><?php echo esc($row['note'] ?? ''); ?></small></td>
                    <td><?php echo moneyFmt($row['amount'] ?? 0, $row['currency'] ?? 'EUR'); ?></td>
                    <td><?php echo esc($row['source'] ?? 'manual'); ?></td>
                    <td>
                        <form method="POST" onsubmit="return confirm('Revenue entry löschen?')">
                            <input type="hidden" name="id" value="<?php echo esc($row['id'] ?? ''); ?>">
                            <button class="btn-danger" type="submit" name="action" value="delete_revenue">Delete</button>
                        </form>
                    </td>
                </tr>
                <?php endforeach; ?>
                <?php if (empty($revenueData['entries'])): ?><tr><td colspan="5" style="text-align:center;color:#999;">No revenue entries yet</td></tr><?php endif; ?>
            </tbody>
        </table>
    </div>

    <div class="section">
        <h2>Top.gg Votes</h2>
        <table class="table">
            <thead><tr><th>User</th><th>Votes</th><th>Shields</th><th>Last Vote</th></tr></thead>
            <tbody>
                <?php foreach (($voteData['summary']['topUsers'] ?? []) as $row): ?>
                <tr>
                    <td><code><?php echo esc($row['userId'] ?? ''); ?></code></td>
                    <td><?php echo formatNum($row['votes'] ?? 0); ?></td>
                    <td><?php echo formatNum($row['shields'] ?? 0); ?></td>
                    <td><?php echo formatDate($row['lastVoteAt'] ?? null); ?></td>
                </tr>
                <?php endforeach; ?>
                <?php if (empty($voteData['summary']['topUsers'] ?? [])): ?><tr><td colspan="4" style="text-align:center;color:#999;">No tracked votes yet</td></tr><?php endif; ?>
            </tbody>
        </table>
    </div>
</div>

<?php include '../includes/footer.php'; ?>
