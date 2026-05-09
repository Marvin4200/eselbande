<?php
$page_title = 'Activity';
require_once __DIR__ . '/../includes/config.php';
requireLogin();

$viewer = getUser();
$viewerId = (string)($viewer['id'] ?? '');
$dashboardMode = dashboardViewMode() === 'user' ? 'user' : 'admin';

function activitySendJson($payload, $statusCode = 200) {
    http_response_code((int)$statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit();
}

function activityFilters() {
    return [
        'all' => ['label' => 'Alle', 'icon' => '✨'],
        'moderation' => ['label' => 'Moderation', 'icon' => '🛡️'],
        'automod' => ['label' => 'AutoMod', 'icon' => '🚨'],
        'tickets' => ['label' => 'Tickets', 'icon' => '🎫'],
        'leveling' => ['label' => 'Leveling', 'icon' => '📈'],
        'voice' => ['label' => 'Voice', 'icon' => '🎙️'],
    ];
}

function activityTypeMeta($type) {
    $map = [
        'moderation' => ['icon' => '🛡️', 'label' => 'Moderation', 'class' => 'danger'],
        'automod' => ['icon' => '🚨', 'label' => 'AutoMod', 'class' => 'warn'],
        'tickets' => ['icon' => '🎫', 'label' => 'Tickets', 'class' => 'info'],
        'leveling' => ['icon' => '📈', 'label' => 'Leveling', 'class' => 'success'],
        'voice' => ['icon' => '🎙️', 'label' => 'Voice', 'class' => 'violet'],
    ];
    return $map[$type] ?? ['icon' => '•', 'label' => 'Event', 'class' => 'muted'];
}

function activityActionLabel($action) {
    $labels = [
        'warn' => 'Warn',
        'kick' => 'Kick',
        'ban' => 'Ban',
        'timeout' => 'Timeout',
        'hit' => 'Treffer',
        'open' => 'Open',
        'claim' => 'Claim',
        'close' => 'Close',
        'progress' => 'XP',
        'session' => 'Session',
        'join' => 'Join',
        'leave' => 'Leave',
        'verify' => 'Verify',
        'role_add' => 'Role +',
        'role_remove' => 'Role -',
        'priority' => 'Priority',
        'status' => 'Status',
    ];
    return $labels[$action] ?? ucfirst(str_replace('_', ' ', (string)$action));
}

function activityRelativeTime($iso) {
    $timestamp = $iso ? strtotime($iso) : false;
    if (!$timestamp) return 'gerade eben';
    $delta = time() - $timestamp;
    if ($delta < 60) return 'vor ' . max(1, $delta) . 's';
    if ($delta < 3600) return 'vor ' . floor($delta / 60) . 'm';
    if ($delta < 86400) return 'vor ' . floor($delta / 3600) . 'h';
    if ($delta < 604800) return 'vor ' . floor($delta / 86400) . 'd';
    return date('d.m. H:i', $timestamp);
}

function activityRenderTimeline($items, $emptyTitle = 'Noch keine Aktivitaet', $emptyText = 'Sobald etwas passiert, landet es hier.') {
    ob_start();
    if (empty($items)) {
        ?>
        <div class="empty-state activity-empty-state">
            <strong><?= esc($emptyTitle) ?></strong>
            <p><?= esc($emptyText) ?></p>
        </div>
        <?php
        return (string)ob_get_clean();
    }

    foreach ($items as $item):
        $meta = activityTypeMeta($item['type'] ?? '');
        $badge = activityActionLabel($item['action'] ?? 'event');
        $stamp = $item['createdAt'] ?? null;
        $channel = trim((string)($item['channelName'] ?? ''));
        $actor = trim((string)($item['actorName'] ?? ''));
        $user = trim((string)($item['userName'] ?? ''));
        $activityId = trim((string)($item['id'] ?? ''));
        ?>
        <article class="activity-card activity-tone-<?= esc($meta['class']) ?>"<?= $activityId !== '' ? ' data-activity-id="' . esc($activityId) . '"' : '' ?>>
            <div class="activity-card-icon"><?= esc($meta['icon']) ?></div>
            <div class="activity-card-body">
                <div class="activity-card-topline">
                    <span class="activity-type-pill"><?= esc($meta['label']) ?></span>
                    <span class="activity-action-pill"><?= esc($badge) ?></span>
                    <time datetime="<?= esc((string)$stamp) ?>"><?= esc(activityRelativeTime($stamp)) ?></time>
                </div>
                <div class="activity-card-copy">
                    <strong><?= esc($user !== '' ? $user : 'Unbekannter User') ?></strong>
                    <p><?= esc((string)($item['description'] ?? 'Neues Event')) ?></p>
                </div>
                <div class="activity-card-meta">
                    <?php if ($actor !== ''): ?><span>von <?= esc($actor) ?></span><?php endif; ?>
                    <?php if ($channel !== ''): ?><span><?= esc($channel) ?></span><?php endif; ?>
                    <?php if ($stamp): ?><span><?= esc(date('d.m.Y H:i', strtotime($stamp))) ?></span><?php endif; ?>
                </div>
            </div>
        </article>
        <?php
    endforeach;

    return (string)ob_get_clean();
}

function activityFetch($guildId, $filter, $limit, $offset) {
    $endpoint = '/guilds/' . urlencode($guildId) . '/activity?type=' . urlencode($filter) . '&limit=' . (int)$limit . '&offset=' . (int)$offset;
    return getAPI($endpoint, 8);
}

$guildsRaw = getAPI('/voice/guilds', 8);
$guilds = $guildsRaw['data']['guilds'] ?? [];
$guildId = dashboardSelectedGuildId($guilds);
$selectedGuild = null;
foreach ($guilds as $guildRow) {
    if (($guildRow['id'] ?? '') === $guildId) {
        $selectedGuild = $guildRow;
        break;
    }
}

$premiumRaw = $guildId !== '' ? getAPI('/guilds/' . urlencode($guildId) . '/premium', 6) : ['data' => []];
$premiumInfo = $premiumRaw['data'] ?? [];
$guildTier = (string)($premiumInfo['tier'] ?? 'free');
$hasLiveActivity = in_array($guildTier, ['basic', 'pro'], true) || isAdmin();

$streamAuth = dashboardActivityStreamAuth($guildId, 1800);
$streamAuth['signature'] = $hasLiveActivity ? (string)($streamAuth['signature'] ?? '') : '';

$filters = activityFilters();
$filter = strtolower(trim((string)($_GET['type'] ?? 'all')));
if (!isset($filters[$filter])) $filter = 'all';
$limit = max(5, min(30, (int)($_GET['limit'] ?? 20)));
$offset = max(0, (int)($_GET['offset'] ?? 0));
$isAjaxRequest = strcasecmp($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '', 'XMLHttpRequest') === 0
    || stripos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') !== false
    || (($_GET['ajax'] ?? '') === '1');

$activityItems = [];
$pagination = ['limit' => $limit, 'offset' => $offset, 'hasMore' => false];
$activityError = '';

if ($guildId !== '') {
    $activityResponse = activityFetch($guildId, $filter, $limit, $offset);
    if (($activityResponse['success'] ?? false) === true) {
        $activityItems = $activityResponse['data']['items'] ?? [];
        $pagination = $activityResponse['data']['pagination'] ?? $pagination;
    } else {
        $activityError = $activityResponse['error'] ?? 'Aktivitaet konnte nicht geladen werden.';
    }
}

if ($isAjaxRequest) {
    if ($guildId === '') {
        activitySendJson([
            'success' => false,
            'message' => 'Kein Server ausgewaehlt.',
            'html' => activityRenderTimeline([], 'Kein Server aktiv', 'Waehle zuerst einen Server im Portal aus.'),
            'pagination' => $pagination,
        ], 400);
    }
    if ($activityError !== '') {
        activitySendJson([
            'success' => false,
            'message' => $activityError,
            'html' => activityRenderTimeline([], 'Aktivitaet nicht verfuegbar', $activityError),
            'pagination' => $pagination,
        ], 400);
    }

    activitySendJson([
        'success' => true,
        'html' => activityRenderTimeline($activityItems),
        'pagination' => $pagination,
        'count' => count($activityItems),
        'items' => $activityItems,
    ]);
}
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.activity-page { display: grid; gap: 1rem; }
.activity-hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(250px, 0.75fr);
    gap: 0.75rem;
}
.activity-banner,
.activity-summary {
    border: 1px solid var(--border-light);
    border-radius: 12px;
    padding: 0.85rem;
    background: rgba(23, 27, 35, 0.92);
}
.activity-banner {
    background: rgba(23, 27, 35, 0.94);
}
.activity-banner h1 { margin: 0.3rem 0 0.5rem; font-size: clamp(1.35rem, 2vw, 1.8rem); }
.activity-banner p,
.activity-summary p { margin: 0; color: var(--text-secondary); line-height: 1.5; }
.activity-eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.75rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #ffcf99;
}
.activity-summary-grid {
    margin-top: 1rem;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
}
.activity-summary-kpi {
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    padding: 0.8rem;
    background: rgba(255,255,255,0.03);
}
.activity-summary-kpi strong { display: block; font-size: 1.25rem; }
.activity-summary-kpi span { color: var(--text-secondary); font-size: 0.78rem; }
.activity-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    flex-wrap: wrap;
}
.activity-filter-row { display: flex; gap: 0.55rem; flex-wrap: wrap; }
.activity-chip {
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 999px;
    padding: 0.5rem 0.8rem;
    background: rgba(255,255,255,0.03);
    color: var(--text-secondary);
    font-weight: 700;
    cursor: pointer;
    transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
}
.activity-chip.is-active {
    color: #111827;
    background: linear-gradient(135deg, #ffd8a8, #ff922b);
    border-color: rgba(255, 146, 43, 0.8);
}
.activity-feed {
    display: grid;
    gap: 0.8rem;
}
.activity-card {
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr);
    gap: 0.9rem;
    border-radius: 12px;
    padding: 0.75rem;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.03);
}
.activity-card-icon {
    width: 52px;
    height: 52px;
    border-radius: 14px;
    display: grid;
    place-items: center;
    font-size: 1.35rem;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.05);
}
.activity-card-topline {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    flex-wrap: wrap;
    margin-bottom: 0.45rem;
}
.activity-type-pill,
.activity-action-pill {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 0.22rem 0.5rem;
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}
.activity-type-pill {
    background: rgba(255,255,255,0.08);
    color: var(--text-primary);
}
.activity-action-pill {
    background: rgba(255,255,255,0.05);
    color: var(--text-secondary);
}
.activity-card-topline time {
    margin-left: auto;
    color: var(--text-secondary);
    font-size: 0.76rem;
}
.activity-card-copy strong { display: block; margin-bottom: 0.2rem; }
.activity-card-copy p { margin: 0; color: var(--text-secondary); line-height: 1.45; }
.activity-card-meta {
    margin-top: 0.65rem;
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    color: var(--text-secondary);
    font-size: 0.76rem;
}
.activity-tone-danger { border-color: rgba(239,68,68,0.28); }
.activity-tone-danger .activity-card-icon { background: rgba(239,68,68,0.14); }
.activity-tone-warn { border-color: rgba(249,115,22,0.32); }
.activity-tone-warn .activity-card-icon { background: rgba(249,115,22,0.14); }
.activity-tone-accent { border-color: rgba(245,158,11,0.28); }
.activity-tone-accent .activity-card-icon { background: rgba(245,158,11,0.14); }
.activity-tone-info { border-color: rgba(59,130,246,0.28); }
.activity-tone-info .activity-card-icon { background: rgba(59,130,246,0.14); }
.activity-tone-success { border-color: rgba(34,197,94,0.3); }
.activity-tone-success .activity-card-icon { background: rgba(34,197,94,0.16); }
.activity-tone-violet { border-color: rgba(139,92,246,0.3); }
.activity-tone-violet .activity-card-icon { background: rgba(139,92,246,0.16); }
.activity-tone-muted { border-color: rgba(148,163,184,0.22); }
.activity-tone-muted .activity-card-icon { background: rgba(148,163,184,0.1); }
.activity-empty-state { min-height: 180px; }
.activity-footer-actions { display: flex; justify-content: center; }
.activity-load-more[disabled] { opacity: 0.6; cursor: progress; }

.activity-live-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    border: 1px solid rgba(34, 197, 94, 0.45);
    background: rgba(34, 197, 94, 0.18);
    color: #86efac;
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.activity-live-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #22c55e;
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7);
    animation: activityLivePulse 1.4s infinite;
}

.activity-connection-badge {
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    padding: 0.2rem 0.55rem;
    font-size: 0.74rem;
    color: var(--text-secondary);
}

.activity-connection-badge.connected {
    border-color: rgba(34, 197, 94, 0.45);
    color: #86efac;
}

.activity-connection-badge.disconnected {
    border-color: rgba(239, 68, 68, 0.45);
    color: #fca5a5;
}

@keyframes activityLivePulse {
    0% {
        box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.65);
    }
    70% {
        box-shadow: 0 0 0 8px rgba(34, 197, 94, 0);
    }
    100% {
        box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
    }
}

@media (max-width: 900px) {
    .activity-hero { grid-template-columns: 1fr; }
}

@media (max-width: 640px) {
    .activity-card { grid-template-columns: 1fr; }
    .activity-card-icon { width: 44px; height: 44px; }
    .activity-card-topline time { margin-left: 0; }
}
</style>

<?php
$initialHtml = '';
if ($guildId === '') {
    $initialHtml = activityRenderTimeline([], 'Kein Server aktiv', 'Waehle zuerst einen Server im Portal aus.');
} elseif ($activityError !== '') {
    $initialHtml = activityRenderTimeline([], 'Aktivitaet nicht verfuegbar', $activityError);
} else {
    $initialHtml = activityRenderTimeline($activityItems);
}
$currentTypeMeta = $filters[$filter] ?? $filters['all'];
?>

<div class="activity-page">
    <section class="dashboard-page-header">
        <div class="dashboard-page-copy">
            <span class="dashboard-page-eyebrow">Live Feed</span>
            <h1>Activity</h1>
            <div class="dashboard-page-meta">
                <span class="status-badge <?= $guildId !== '' ? 'active' : 'inactive' ?>"><?= $guildId !== '' ? 'Server aktiv' : 'Kein Server' ?></span>
                <span class="status-badge info"><?= esc($currentTypeMeta['label']) ?></span>
                <span class="activity-live-badge" id="activityLiveBadge"><span class="activity-live-dot"></span> LIVE</span>
                <span class="activity-connection-badge disconnected" id="activityConnectionState"><?= $hasLiveActivity ? 'Getrennt' : 'Premium' ?></span>
                <?php if (!$hasLiveActivity): ?>
                    <span class="status-badge premium">Live Activity ist Premium</span>
                <?php endif; ?>
            </div>
        </div>
        <div class="dashboard-page-actions">
            <a href="<?= esc(dashboardPageUrl('portal')) ?>" class="btn-icon btn-secondary-ui"><span class="i">🏠</span> Portal</a>
            <a href="<?= esc(dashboardPageUrl('stats')) ?>" class="btn-icon btn-secondary-ui"><span class="i">📊</span> Stats</a>
        </div>
    </section>

    <section class="activity-hero">
        <div class="activity-banner">
            <span class="activity-eyebrow">⚡ Letzte Aktivitaet</span>
            <h1><?= esc($selectedGuild['name'] ?? 'Server Feed') ?></h1>
            <p>Ein zentraler Blick auf Moderation, AutoMod, Tickets, Leveling und Voice Events. Die Daten kommen direkt aus bestehenden Guild-Tabellen, ohne neue Storage-Schicht.</p>
        </div>
        <div class="activity-summary">
            <p>Filtere die Timeline nach Bereich und lade bei Bedarf weitere Eintraege nach. Die Seite bleibt leichtgewichtig, weil pro Aufruf nur ein kleiner paginierter Ausschnitt geladen wird.</p>
            <?php if (!$hasLiveActivity): ?>
                <div class="ctx-upsell-card">
                    <div class="cu-icon">🔒</div>
                    <div class="cu-body">
                        <div class="cu-title">Live Activity ist Premium</div>
                        <div class="cu-hint">Echtzeit-Events landen sofort im Feed — kein manuelles Nachladen. Verfügbar ab Premium.</div>
                    </div>
                    <a href="<?= esc(dashboardPageUrl('server-plans')) ?>" class="cu-cta">💎 Upgrade ansehen</a>
                </div>
            <?php endif; ?>
            <div class="activity-summary-grid">
                <div class="activity-summary-kpi">
                    <strong id="activity-count"><?= count($activityItems) ?></strong>
                    <span>Eintraege geladen</span>
                </div>
                <div class="activity-summary-kpi">
                    <strong><?= esc($currentTypeMeta['label']) ?></strong>
                    <span>Aktiver Filter</span>
                </div>
            </div>
        </div>
    </section>

    <section class="dashboard-panel">
        <div class="activity-toolbar">
            <div>
                <h2 style="margin:0;">Timeline</h2>
                <p style="margin:.2rem 0 0; color:var(--text-secondary);">Chronologisch zusammengefuehrte Guild Events.</p>
            </div>
            <div class="activity-filter-row" id="activityFilters">
                <?php foreach ($filters as $key => $filterMeta): ?>
                    <button
                        type="button"
                        class="activity-chip <?= $filter === $key ? 'is-active' : '' ?>"
                        data-filter="<?= esc($key) ?>"
                        aria-pressed="<?= $filter === $key ? 'true' : 'false' ?>"
                    ><?= esc($filterMeta['icon']) ?> <?= esc($filterMeta['label']) ?></button>
                <?php endforeach; ?>
            </div>
        </div>
    </section>

    <section class="dashboard-panel">
        <div id="activityFeed" class="activity-feed"><?= $initialHtml ?></div>
        <div class="activity-footer-actions" style="margin-top:1rem;">
            <button
                type="button"
                id="activityLoadMore"
                class="btn-icon btn-secondary-ui activity-load-more"
                <?= !empty($pagination['hasMore']) ? '' : 'hidden' ?>
            ><span class="i">↻</span> Mehr laden</button>
        </div>
    </section>
</div>

<script>
(function() {
    const guildId = <?php echo json_encode($guildId); ?>;
    const baseUrl = <?php echo json_encode(BASE_URL); ?>;
    const limit = <?php echo (int)$limit; ?>;
    const streamAuth = {
        viewerId: <?php echo json_encode($streamAuth['viewerId'] ?? ''); ?>,
        dashboardMode: <?php echo json_encode($streamAuth['dashboardMode'] ?? 'admin'); ?>,
        expiresAt: <?php echo (int)($streamAuth['expiresAt'] ?? 0); ?>,
        signature: <?php echo json_encode($streamAuth['signature'] ?? ''); ?>,
    };
    const liveAllowed = <?php echo $hasLiveActivity ? 'true' : 'false'; ?>;
    let currentFilter = <?php echo json_encode($filter); ?>;
    let offset = <?php echo (int)($pagination['offset'] ?? 0); ?>;
    let hasMore = <?php echo !empty($pagination['hasMore']) ? 'true' : 'false'; ?>;
    let activityStream = null;
    let pollTimer = null;
    const streamBaseUrl = '';

    const feed = document.getElementById('activityFeed');
    const loadMoreButton = document.getElementById('activityLoadMore');
    const countNode = document.getElementById('activity-count');
    const chips = Array.from(document.querySelectorAll('#activityFilters .activity-chip'));
    const connectionBadge = document.getElementById('activityConnectionState');
    const liveBadge = document.getElementById('activityLiveBadge');

    const typeMeta = {
        moderation: { icon: '🛡️', label: 'Moderation', tone: 'danger' },
        automod: { icon: '🚨', label: 'AutoMod', tone: 'warn' },
        tickets: { icon: '🎫', label: 'Tickets', tone: 'info' },
        leveling: { icon: '📈', label: 'Leveling', tone: 'success' },
        voice: { icon: '🎙️', label: 'Voice', tone: 'violet' },
    };

    const actionLabel = {
        warn: 'Warn',
        kick: 'Kick',
        ban: 'Ban',
        timeout: 'Timeout',
        hit: 'Treffer',
        open: 'Open',
        claim: 'Claim',
        close: 'Close',
        progress: 'XP',
        session: 'Session',
        join: 'Join',
        leave: 'Leave',
        verify: 'Verify',
        role_add: 'Role +',
        role_remove: 'Role -',
        priority: 'Priority',
        status: 'Status',
    };

    function escapeHtml(input) {
        return String(input || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function relativeTime(iso) {
        if (!iso) return 'gerade eben';
        const stamp = new Date(iso).getTime();
        if (!Number.isFinite(stamp)) return 'gerade eben';
        const delta = Math.max(0, Math.floor((Date.now() - stamp) / 1000));
        if (delta < 60) return `vor ${Math.max(1, delta)}s`;
        if (delta < 3600) return `vor ${Math.floor(delta / 60)}m`;
        if (delta < 86400) return `vor ${Math.floor(delta / 3600)}h`;
        if (delta < 604800) return `vor ${Math.floor(delta / 86400)}d`;
        const date = new Date(stamp);
        return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }

    function formatAbsolute(iso) {
        if (!iso) return '';
        const date = new Date(iso);
        if (!Number.isFinite(date.getTime())) return '';
        return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }

    function renderActivityCard(item) {
        const meta = typeMeta[item?.type] || { icon: '•', label: 'Event', tone: 'muted' };
        const badge = actionLabel[item?.action] || String(item?.action || 'Event');
        const cardId = String(item?.id || `${item?.type || 'event'}:${item?.createdAt || Date.now()}`);
        const user = String(item?.userName || item?.userId || 'Unbekannter User');
        const description = String(item?.description || 'Neues Event');
        const actor = String(item?.actorName || '').trim();
        const channel = String(item?.channelName || '').trim();
        const createdAt = String(item?.createdAt || new Date().toISOString());

        return `
            <article class="activity-card activity-tone-${escapeHtml(meta.tone)}" data-activity-id="${escapeHtml(cardId)}">
                <div class="activity-card-icon">${escapeHtml(meta.icon)}</div>
                <div class="activity-card-body">
                    <div class="activity-card-topline">
                        <span class="activity-type-pill">${escapeHtml(meta.label)}</span>
                        <span class="activity-action-pill">${escapeHtml(badge)}</span>
                        <time datetime="${escapeHtml(createdAt)}">${escapeHtml(relativeTime(createdAt))}</time>
                    </div>
                    <div class="activity-card-copy">
                        <strong>${escapeHtml(user)}</strong>
                        <p>${escapeHtml(description)}</p>
                    </div>
                    <div class="activity-card-meta">
                        ${actor ? `<span>von ${escapeHtml(actor)}</span>` : ''}
                        ${channel ? `<span>${escapeHtml(channel)}</span>` : ''}
                        ${createdAt ? `<span>${escapeHtml(formatAbsolute(createdAt))}</span>` : ''}
                    </div>
                </div>
            </article>
        `;
    }

    function setConnectionState(state, label) {
        connectionBadge.textContent = label;
        connectionBadge.classList.remove('connected', 'disconnected');
        connectionBadge.classList.add(state === 'connected' ? 'connected' : 'disconnected');
        if (liveBadge) {
            liveBadge.style.opacity = state === 'connected' ? '1' : '0.65';
        }
    }

    function setLoading(state) {
        loadMoreButton.disabled = state;
        if (state) {
            loadMoreButton.innerHTML = 'Laedt...';
            return;
        }
        loadMoreButton.innerHTML = '<span class="i">↻</span> Mehr laden';
    }

    function updateButton() {
        loadMoreButton.hidden = !guildId || !hasMore;
    }

    function trimFeedToMax(maxCards) {
        const cards = Array.from(feed.querySelectorAll('.activity-card'));
        if (cards.length <= maxCards) return;
        cards.slice(maxCards).forEach((card) => card.remove());
    }

    function prependRealtimeItem(item) {
        if (!item || !item.type) return;
        if (!(currentFilter === 'all' || currentFilter === item.type)) return;

        const itemId = String(item.id || '').trim();
        if (itemId) {
            const hasDuplicate = Array.from(feed.querySelectorAll('.activity-card'))
                .some((card) => card.dataset.activityId === itemId);
            if (hasDuplicate) return;
        }

        const emptyState = feed.querySelector('.empty-state');
        if (emptyState) emptyState.remove();

        feed.insertAdjacentHTML('afterbegin', renderActivityCard(item));
        trimFeedToMax(50);
        countNode.textContent = String(feed.querySelectorAll('.activity-card').length);
    }

    function setupRealtimeStream() {
        if (!liveAllowed) {
            setConnectionState('disconnected', 'Premium');
            startPollingFallback();
            return;
        }
        if (!guildId || typeof EventSource === 'undefined') {
            setConnectionState('disconnected', 'Getrennt');
            startPollingFallback();
            return;
        }
        if (!streamAuth.viewerId || !streamAuth.signature || !streamAuth.expiresAt) {
            setConnectionState('disconnected', 'Getrennt');
            startPollingFallback();
            return;
        }
        if (!streamBaseUrl) {
            setConnectionState('disconnected', 'Polling');
            startPollingFallback();
            return;
        }

        const streamUrl = `${streamBaseUrl}/guilds/${encodeURIComponent(guildId)}/activity/stream?dashboardUserId=${encodeURIComponent(streamAuth.viewerId)}&dashboardMode=${encodeURIComponent(streamAuth.dashboardMode)}&expiresAt=${encodeURIComponent(String(streamAuth.expiresAt))}&streamSig=${encodeURIComponent(streamAuth.signature)}`;
        const es = new EventSource(streamUrl);
        activityStream = es;

        es.onopen = () => {
            setConnectionState('connected', 'Verbunden');
        };

        es.addEventListener('activity', (event) => {
            try {
                const payload = JSON.parse(event.data || '{}');
                if (payload?.type !== 'activity') return;
                prependRealtimeItem(payload.item || null);
            } catch {
                // Ignore malformed events.
            }
        });

        es.addEventListener('disconnect', () => {
            setConnectionState('disconnected', 'Getrennt');
            es.close();
            startPollingFallback();
        });

        es.onerror = () => {
            setConnectionState('disconnected', 'Getrennt');
            if (activityStream) {
                activityStream.close();
                activityStream = null;
            }
            startPollingFallback();
        };

        window.addEventListener('beforeunload', () => {
            if (activityStream) activityStream.close();
            if (pollTimer) clearInterval(pollTimer);
        });
    }

    function startPollingFallback() {
        if (pollTimer || !guildId) return;
        pollTimer = setInterval(() => {
            if (document.hidden) return;
            loadActivity(currentFilter, false);
        }, 20000);
    }

    async function loadActivity(nextFilter, append) {
        if (!guildId) return;
        const nextOffset = append ? offset + limit : 0;
        const url = `${baseUrl}/pages/activity.php?ajax=1&guildId=${encodeURIComponent(guildId)}&type=${encodeURIComponent(nextFilter)}&limit=${limit}&offset=${nextOffset}`;
        setLoading(true);
        try {
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
            const payload = await response.json();
            if (!response.ok || !payload.success) {
                throw new Error(payload.message || 'Aktivitaet konnte nicht geladen werden.');
            }

            if (append) {
                feed.insertAdjacentHTML('beforeend', payload.html);
            } else {
                feed.innerHTML = payload.html;
            }

            currentFilter = nextFilter;
            offset = Number(payload.pagination?.offset || 0);
            hasMore = Boolean(payload.pagination?.hasMore);
            countNode.textContent = String(feed.querySelectorAll('.activity-card').length);
            chips.forEach((chip) => {
                const active = chip.dataset.filter === currentFilter;
                chip.classList.toggle('is-active', active);
                chip.setAttribute('aria-pressed', active ? 'true' : 'false');
            });
            updateButton();
        } catch (error) {
            feed.innerHTML = `<div class="empty-state activity-empty-state"><strong>Fehler</strong><p>${String(error.message || 'Aktivitaet konnte nicht geladen werden.')}</p></div>`;
            hasMore = false;
            updateButton();
        } finally {
            setLoading(false);
        }
    }

    chips.forEach((chip) => {
        chip.addEventListener('click', () => {
            if (chip.dataset.filter === currentFilter) return;
            loadActivity(chip.dataset.filter, false);
        });
    });

    loadMoreButton.addEventListener('click', () => {
        if (!hasMore) return;
        loadActivity(currentFilter, true);
    });

    setConnectionState('disconnected', 'Getrennt');
    setupRealtimeStream();
    updateButton();
})();
</script>

<?php include '../includes/footer.php'; ?>