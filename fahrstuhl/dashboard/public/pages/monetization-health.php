<?php
$page_title = 'Monetization Health';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();

function healthStatusBadge($ok) {
    return $ok ? '<span class="pill pill-ok">OK</span>' : '<span class="pill pill-warn">Nicht verfuegbar</span>';
}

function safeApiGet($endpoint, $timeout = 10) {
    $result = getAPI($endpoint, $timeout);
    $ok = is_array($result) && (($result['success'] ?? false) === true) && is_array($result['data'] ?? null);

    return [
        'ok' => $ok,
        'endpoint' => $endpoint,
        'result' => $result,
        'data' => $ok ? $result['data'] : [],
        'status' => (int)($result['status'] ?? 0),
        'error' => $ok ? '' : (string)($result['error'] ?? $result['message'] ?? 'Nicht verfuegbar'),
    ];
}

$premiumUsersApi = safeApiGet('/premium/users', 12);
$premiumCalendarApi = safeApiGet('/premium/calendar?days=30', 12);
$revenueApi = safeApiGet('/monetization/revenue', 12);
$promosApi = safeApiGet('/monetization/promos', 12);
$votesApi = safeApiGet('/monetization/votes?limit=100', 12);

$apiChecks = [
    $premiumUsersApi,
    $premiumCalendarApi,
    $revenueApi,
    $promosApi,
    $votesApi,
];

$warnings = [];

foreach ($apiChecks as $check) {
    if (!$check['ok']) {
        $warnings[] = 'API nicht erreichbar: ' . $check['endpoint'] . ' (' . ($check['error'] ?: 'Unbekannter Fehler') . ')';
    }
}

$premiumUsers = is_array($premiumUsersApi['data']['users'] ?? null) ? $premiumUsersApi['data']['users'] : [];
$calendarUsers = is_array($premiumCalendarApi['data']['users'] ?? null) ? $premiumCalendarApi['data']['users'] : [];
$calendarSummary = is_array($premiumCalendarApi['data']['summary'] ?? null) ? $premiumCalendarApi['data']['summary'] : [];

$promoCodes = is_array($promosApi['data']['promoCodes'] ?? null) ? $promosApi['data']['promoCodes'] : [];

$voteSummary = is_array($votesApi['data']['summary'] ?? null) ? $votesApi['data']['summary'] : [];
$voteRows = is_array($votesApi['data']['votes'] ?? null) ? $votesApi['data']['votes'] : [];

$revenueSummary = is_array($revenueApi['data']['summary'] ?? null) ? $revenueApi['data']['summary'] : [];

$premiumTotal = count($premiumUsers);
$premiumActive = (int)($calendarSummary['active'] ?? $premiumTotal);

$activePromos = count(array_filter($promoCodes, static fn($promo) => !empty($promo['active'])));

$pendingPromoRedemptions = 0;
$promosWithoutLimits = 0;
foreach ($promoCodes as $promo) {
    $redemptions = is_array($promo['redemptions'] ?? null) ? $promo['redemptions'] : [];
    $pendingPromoRedemptions += count(array_filter($redemptions, static fn($r) => !empty($r['pending'])));

    $hasMaxUses = isset($promo['maxUses']) && (int)$promo['maxUses'] > 0;
    $hasExpiry = !empty($promo['expiresAt']);
    if (!$hasMaxUses || !$hasExpiry) {
        $promosWithoutLimits++;
    }
}

if ($pendingPromoRedemptions > 0) {
    $warnings[] = 'Pending Promo-Redemptions erkannt: ' . $pendingPromoRedemptions;
}

if ($promosWithoutLimits > 0) {
    $warnings[] = 'Promos ohne maxUses und/oder expiresAt: ' . $promosWithoutLimits;
}

$stalePremiumUsers = 0;
$nowTs = time();
foreach ($premiumUsers as $user) {
    $expiresAt = (string)($user['expires_at'] ?? '');
    if ($expiresAt !== '') {
        $expiresTs = strtotime($expiresAt);
        if ($expiresTs !== false && $expiresTs < $nowTs) {
            $stalePremiumUsers++;
        }
    }
}

if ($stalePremiumUsers > 0) {
    $warnings[] = 'Premium-User mit abgelaufenem expires_at aber noch aktiv: ' . $stalePremiumUsers;
}

$hasVoteTotals = array_key_exists('totalVotes', $voteSummary) || array_key_exists('total', $voteSummary);
if ($votesApi['ok'] && !$hasVoteTotals) {
    $warnings[] = 'Vote-Summary ohne erwartete Felder (totalVotes/total).';
}

$votesTotal = (int)($voteSummary['totalVotes'] ?? $voteSummary['total'] ?? 0);
$revenueTotal = (float)($revenueSummary['total'] ?? 0);
$revenueMonthly = (float)($revenueSummary['monthly'] ?? 0);
$revenueCount = (int)($revenueSummary['count'] ?? 0);

$premiumUsersTable = array_slice($premiumUsers, 0, 20);
$activePromosTable = array_values(array_filter($promoCodes, static fn($promo) => !empty($promo['active'])));
$voteTopUsers = is_array($voteSummary['topUsers'] ?? null) ? array_slice($voteSummary['topUsers'], 0, 10) : [];

?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.health-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:1rem; margin-bottom:1rem; }
.api-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:.75rem; margin-bottom:1rem; }
.warn-list { display:grid; gap:.6rem; margin-bottom:1rem; }
.warn-card { border:1px solid rgba(255,212,59,.5); border-left:4px solid #ffd43b; background:rgba(255,212,59,.08); border-radius:10px; padding:.8rem .9rem; color:#f5e8a9; }
.warn-card strong { color:#ffd43b; }
.ok-card { border:1px solid rgba(81,207,102,.35); border-left:4px solid #51cf66; background:rgba(81,207,102,.08); border-radius:10px; padding:.8rem .9rem; color:#c7f5d3; }
.pill { display:inline-flex; align-items:center; padding:.16rem .5rem; border-radius:999px; font-size:.78rem; font-weight:700; }
.pill-ok { background:rgba(81,207,102,.14); color:#51cf66; border:1px solid rgba(81,207,102,.4); }
.pill-warn { background:rgba(255,212,59,.14); color:#ffd43b; border:1px solid rgba(255,212,59,.45); }
.muted { color:var(--text-secondary); }
.section h3 { margin-top:0; }
@media (max-width: 720px) {
    .table { display:block; overflow-x:auto; white-space:nowrap; }
}
</style>

<div class="page-header">
    <div class="page-header-row">
        <div>
            <h1>Monetization Health</h1>
            <p class="subtitle">Read-only Monitoring fuer Premium, Promos, Votes und Revenue.</p>
        </div>
        <div class="page-meta">Last refresh: <?php echo date('d.m.Y H:i'); ?></div>
    </div>
</div>

<div class="api-grid">
    <div class="stat-card">
        <div class="stat-label">/premium/users</div>
        <div class="stat-value"><?php echo healthStatusBadge($premiumUsersApi['ok']); ?></div>
    </div>
    <div class="stat-card">
        <div class="stat-label">/premium/calendar</div>
        <div class="stat-value"><?php echo healthStatusBadge($premiumCalendarApi['ok']); ?></div>
    </div>
    <div class="stat-card">
        <div class="stat-label">/monetization/revenue</div>
        <div class="stat-value"><?php echo healthStatusBadge($revenueApi['ok']); ?></div>
    </div>
    <div class="stat-card">
        <div class="stat-label">/monetization/promos</div>
        <div class="stat-value"><?php echo healthStatusBadge($promosApi['ok']); ?></div>
    </div>
    <div class="stat-card">
        <div class="stat-label">/monetization/votes</div>
        <div class="stat-value"><?php echo healthStatusBadge($votesApi['ok']); ?></div>
    </div>
</div>

<div class="health-grid">
    <div class="stat-card">
        <div class="stat-icon">👥</div>
        <div class="stat-label">Premium-User insgesamt</div>
        <div class="stat-value"><?php echo formatNum($premiumTotal); ?></div>
    </div>
    <div class="stat-card">
        <div class="stat-icon">💎</div>
        <div class="stat-label">Aktive Premium-User</div>
        <div class="stat-value"><?php echo formatNum($premiumActive); ?></div>
    </div>
    <div class="stat-card">
        <div class="stat-icon">🎟️</div>
        <div class="stat-label">Aktive Promos</div>
        <div class="stat-value"><?php echo formatNum($activePromos); ?></div>
    </div>
    <div class="stat-card">
        <div class="stat-icon">⏳</div>
        <div class="stat-label">Promo pending</div>
        <div class="stat-value"><?php echo formatNum($pendingPromoRedemptions); ?></div>
    </div>
    <div class="stat-card">
        <div class="stat-icon">⭐</div>
        <div class="stat-label">Votes gesamt</div>
        <div class="stat-value"><?php echo formatNum($votesTotal); ?></div>
    </div>
    <div class="stat-card">
        <div class="stat-icon">💶</div>
        <div class="stat-label">Revenue Summary</div>
        <div class="stat-value"><?php echo number_format($revenueTotal, 2, ',', '.'); ?> EUR</div>
        <p class="muted">Monat: <?php echo number_format($revenueMonthly, 2, ',', '.'); ?> EUR | Entries: <?php echo formatNum($revenueCount); ?></p>
    </div>
</div>

<div class="section">
    <h2>Warnungen</h2>
    <?php if (!empty($warnings)): ?>
        <div class="warn-list">
            <?php foreach ($warnings as $warning): ?>
                <div class="warn-card"><strong>Warnung:</strong> <?php echo esc($warning); ?></div>
            <?php endforeach; ?>
        </div>
    <?php else: ?>
        <div class="ok-card">Keine Warnungen erkannt. Alle geprueften Read-only Signale wirken plausibel.</div>
    <?php endif; ?>
</div>

<div class="section">
    <h2>Aktive Promos (Read-only)</h2>
    <table class="table">
        <thead>
            <tr>
                <th>Code</th>
                <th>Typ</th>
                <th>Uses</th>
                <th>Pending</th>
                <th>Ablauf</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($activePromosTable as $promo): ?>
                <?php
                    $redemptions = is_array($promo['redemptions'] ?? null) ? $promo['redemptions'] : [];
                    $uses = count($redemptions);
                    $maxUses = (int)($promo['maxUses'] ?? 0);
                    $pending = count(array_filter($redemptions, static fn($r) => !empty($r['pending'])));
                    $hasMaxUses = $maxUses > 0;
                    $hasExpiry = !empty($promo['expiresAt']);
                    $status = (!$hasMaxUses || !$hasExpiry) ? 'Warnung' : 'OK';
                ?>
                <tr>
                    <td><strong><?php echo esc((string)($promo['code'] ?? 'N/A')); ?></strong></td>
                    <td><?php echo esc((string)($promo['type'] ?? 'premium')); ?></td>
                    <td><?php echo esc((string)$uses); ?> / <?php echo $hasMaxUses ? esc((string)$maxUses) : 'N/A'; ?></td>
                    <td><?php echo esc((string)$pending); ?></td>
                    <td><?php echo !empty($promo['expiresAt']) ? esc(formatDate($promo['expiresAt'])) : 'N/A'; ?></td>
                    <td><?php echo esc($status); ?></td>
                </tr>
            <?php endforeach; ?>
            <?php if (empty($activePromosTable)): ?>
                <tr><td colspan="6" class="muted" style="text-align:center;">Nicht verfuegbar oder keine aktiven Promos.</td></tr>
            <?php endif; ?>
        </tbody>
    </table>
</div>

<div class="section">
    <h2>Premium-User (Read-only, max 20)</h2>
    <table class="table">
        <thead>
            <tr>
                <th>User ID</th>
                <th>Tier</th>
                <th>expires_at</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($premiumUsersTable as $user): ?>
                <?php
                    $expiresAt = (string)($user['expires_at'] ?? '');
                    $expired = false;
                    if ($expiresAt !== '') {
                        $expTs = strtotime($expiresAt);
                        $expired = $expTs !== false && $expTs < time();
                    }
                ?>
                <tr>
                    <td><?php echo esc((string)($user['user_id'] ?? 'N/A')); ?></td>
                    <td><?php echo esc((string)($user['tier'] ?? 'basic')); ?></td>
                    <td><?php echo $expiresAt !== '' ? esc(formatDate($expiresAt)) : 'N/A'; ?></td>
                    <td><?php echo $expired ? 'Ablauf ueberschritten' : 'Aktiv'; ?></td>
                </tr>
            <?php endforeach; ?>
            <?php if (empty($premiumUsersTable)): ?>
                <tr><td colspan="4" class="muted" style="text-align:center;">Nicht verfuegbar oder keine Premium-User.</td></tr>
            <?php endif; ?>
        </tbody>
    </table>
</div>

<div class="section">
    <h2>Vote-Stats (Read-only)</h2>
    <div class="health-grid" style="margin-bottom:.9rem;">
        <div class="stat-card">
            <div class="stat-label">Votes 24h</div>
            <div class="stat-value"><?php echo formatNum((int)($voteSummary['votes24h'] ?? 0)); ?></div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Rewards gegeben</div>
            <div class="stat-value"><?php echo formatNum((int)($voteSummary['rewardsGiven'] ?? 0)); ?></div>
        </div>
        <div class="stat-card">
            <div class="stat-label">TopUsers verfuegbar</div>
            <div class="stat-value"><?php echo formatNum(count($voteTopUsers)); ?></div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Vote Eintraege geladen</div>
            <div class="stat-value"><?php echo formatNum(count($voteRows)); ?></div>
        </div>
    </div>

    <h3>Top Vote Users</h3>
    <table class="table">
        <thead>
            <tr>
                <th>User ID</th>
                <th>Votes</th>
                <th>Shields</th>
                <th>Last Vote</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($voteTopUsers as $row): ?>
                <tr>
                    <td><?php echo esc((string)($row['userId'] ?? 'N/A')); ?></td>
                    <td><?php echo formatNum((int)($row['votes'] ?? 0)); ?></td>
                    <td><?php echo formatNum((int)($row['shields'] ?? 0)); ?></td>
                    <td><?php echo !empty($row['lastVoteAt']) ? esc(formatDate($row['lastVoteAt'])) : 'N/A'; ?></td>
                </tr>
            <?php endforeach; ?>
            <?php if (empty($voteTopUsers)): ?>
                <tr><td colspan="4" class="muted" style="text-align:center;">Nicht verfuegbar oder keine Vote-Daten.</td></tr>
            <?php endif; ?>
        </tbody>
    </table>
</div>

<?php include '../includes/footer.php'; ?>
