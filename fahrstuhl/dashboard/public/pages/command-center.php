<?php
$page_title = 'Command Center';
require_once __DIR__ . '/../includes/config.php';
requireLogin();

function commandCenterJson($payload, $statusCode = 200) {
    http_response_code((int)$statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit();
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

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST' && (($_POST['ajax'] ?? '') === '1')) {
    if ($guildId === '') {
        commandCenterJson(['success' => false, 'message' => 'Kein Server ausgewaehlt.'], 400);
    }

    $action = strtolower(trim((string)($_POST['actionType'] ?? '')));
    $result = ['status' => 400, 'data' => ['success' => false, 'error' => 'Unbekannte Aktion']];

    if ($action === 'kick') {
        $result = api('/moderation/kick', 'POST', [
            'guildId' => $guildId,
            'userId' => trim((string)($_POST['userId'] ?? '')),
            'reason' => trim((string)($_POST['reason'] ?? 'Dashboard Command Center')),
        ], 12);
    } elseif ($action === 'ban') {
        $result = api('/moderation/ban', 'POST', [
            'guildId' => $guildId,
            'userId' => trim((string)($_POST['userId'] ?? '')),
            'reason' => trim((string)($_POST['reason'] ?? 'Dashboard Command Center')),
            'deleteMessageSeconds' => 0,
        ], 12);
    } elseif ($action === 'testticket') {
        $result = api('/guilds/' . urlencode($guildId) . '/tickets/test', 'POST', [
            'reason' => trim((string)($_POST['reason'] ?? 'Command Center Test Ticket')),
            'priority' => in_array((string)($_POST['priority'] ?? ''), ['low', 'normal', 'high'], true) ? (string)$_POST['priority'] : 'normal',
            'typeLabel' => 'Command Center',
        ], 12);
    } elseif ($action === 'testautomod') {
        $result = api('/guilds/' . urlencode($guildId) . '/automod/test', 'POST', [
            'content' => trim((string)($_POST['content'] ?? '')),
            'mentionCount' => max(0, (int)($_POST['mentionCount'] ?? 0)),
        ], 12);
    } elseif ($action === 'grantxp') {
        $userId = trim((string)($_POST['userId'] ?? ''));
        $payload = [
            'amount' => max(1, min(1000, (int)($_POST['amount'] ?? 100))),
        ];
        if ($userId !== '') {
            $payload['userId'] = $userId;
        }
        $result = api('/leveling/' . urlencode($guildId) . '/test-xp', 'POST', $payload, 12);
    }

    $body = is_array($result['data'] ?? null) ? $result['data'] : [];
    $status = (int)($result['status'] ?? 500);
    $ok = $status < 400 && (($body['success'] ?? false) === true || !empty($body['data']) || !empty($body['message']));

    $message = (string)($body['message'] ?? $body['error'] ?? 'Aktion abgeschlossen.');
    if ($message === '') $message = $ok ? 'Aktion abgeschlossen.' : 'Aktion fehlgeschlagen.';

    $limitReached = (($body['code'] ?? '') === 'LIMIT_REACHED')
        || (($body['data']['code'] ?? '') === 'LIMIT_REACHED')
        || !empty($body['upgrade'])
        || !empty($body['data']['upgrade']);

    commandCenterJson([
        'success' => $ok,
        'message' => $message,
        'upgrade' => $limitReached,
        'response' => $body,
    ], $ok ? 200 : max(400, $status));
}

$premiumRaw = $guildId !== '' ? getAPI('/guilds/' . urlencode($guildId) . '/premium', 6) : ['data' => []];
$premiumInfo = $premiumRaw['data'] ?? [];
$guildTier = (string)($premiumInfo['tier'] ?? 'free');
$hasLiveActivity = in_array($guildTier, ['basic', 'pro'], true) || isAdmin();

$analytics = [];
$activityItems = [];
if ($guildId !== '') {
    $analyticsRaw = getAPI('/guilds/' . urlencode($guildId) . '/analytics', 8);
    $analytics = $analyticsRaw['data'] ?? [];

    $activityRaw = getAPI('/guilds/' . urlencode($guildId) . '/activity?limit=12&offset=0', 8);
    $activityItems = $activityRaw['data']['items'] ?? [];
}

$overview = $analytics['overview'] ?? [];
$tickets = $analytics['tickets'] ?? [];
$moderation = $analytics['moderation'] ?? [];
$insights = $analytics['insights'] ?? [];

function commandCenterTypeMeta($type) {
    $map = [
        'moderation' => ['icon' => '🛡️', 'tone' => 'danger', 'label' => 'Moderation'],
        'automod' => ['icon' => '🚨', 'tone' => 'warn', 'label' => 'AutoMod'],
        'tickets' => ['icon' => '🎫', 'tone' => 'info', 'label' => 'Tickets'],
        'leveling' => ['icon' => '📈', 'tone' => 'success', 'label' => 'Leveling'],
        'voice' => ['icon' => '🎙️', 'tone' => 'violet', 'label' => 'Voice'],
    ];
    return $map[$type] ?? ['icon' => '✨', 'tone' => 'muted', 'label' => 'Event'];
}

function commandCenterRelativeTime($iso) {
    $timestamp = $iso ? strtotime($iso) : false;
    if (!$timestamp) return 'gerade eben';
    $delta = time() - $timestamp;
    if ($delta < 60) return 'vor ' . max(1, $delta) . 's';
    if ($delta < 3600) return 'vor ' . floor($delta / 60) . 'm';
    if ($delta < 86400) return 'vor ' . floor($delta / 3600) . 'h';
    if ($delta < 604800) return 'vor ' . floor($delta / 86400) . 'd';
    return date('d.m. H:i', $timestamp);
}

$streamAuth = dashboardActivityStreamAuth($guildId, 1800);
$streamAuth['signature'] = $hasLiveActivity ? (string)($streamAuth['signature'] ?? '') : '';
?>

<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.cc-layout { display: grid; gap: 1rem; }
.cc-hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(260px, 0.72fr);
    gap: 0.75rem;
}
.cc-banner,
.cc-share {
    border: 1px solid var(--border-light);
    border-radius: 12px;
    padding: 0.85rem;
    background: rgba(23, 27, 35, 0.92);
}
.cc-eyebrow {
    display: inline-flex;
    gap: 0.45rem;
    align-items: center;
    font-size: 0.74rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #b7bffd;
}
.cc-banner h2,
.cc-share h3 { margin: 0.35rem 0 0.45rem; }
.cc-banner p,
.cc-share p { margin: 0; color: var(--text-secondary); line-height: 1.45; }
.cc-share textarea {
    width: 100%;
    min-height: 84px;
    border-radius: 10px;
    margin-top: 0.6rem;
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.03);
    color: var(--text-primary);
    padding: 0.6rem;
    resize: vertical;
}
.cc-kpis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 0.6rem;
}
.cc-kpi {
    border: 1px solid var(--border-light);
    border-radius: 10px;
    padding: 0.7rem;
    background: rgba(255,255,255,0.02);
}
.cc-kpi span { color: var(--text-secondary); font-size: 0.76rem; }
.cc-kpi strong { display: block; margin-top: 0.28rem; font-size: 1.32rem; }
.cc-main {
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.95fr);
    gap: 0.75rem;
}
.cc-panel {
    border: 1px solid var(--border-light);
    border-radius: 12px;
    padding: 0.8rem;
    background: rgba(255,255,255,0.02);
}
.cc-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    margin-bottom: 0.7rem;
}
.cc-feed {
    display: grid;
    gap: 0.65rem;
    max-height: 620px;
    overflow-y: auto;
}
.cc-card {
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 12px;
    padding: 0.75rem;
    display: grid;
    gap: 0.4rem;
    background: rgba(255,255,255,0.02);
}
.cc-card-top {
    display: flex;
    align-items: center;
    gap: 0.45rem;
}
.cc-card-type {
    display: inline-flex;
    border-radius: 999px;
    padding: 0.2rem 0.45rem;
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    background: rgba(255,255,255,0.08);
}
.cc-card-time {
    margin-left: auto;
    font-size: 0.74rem;
    color: var(--text-secondary);
}
.cc-card p { margin: 0; color: var(--text-secondary); line-height: 1.4; }
.cc-card-meta { display: flex; gap: 0.65rem; flex-wrap: wrap; font-size: 0.74rem; color: var(--text-secondary); }
.cc-tone-danger { border-color: rgba(239,68,68,0.34); }
.cc-tone-warn { border-color: rgba(249,115,22,0.34); }
.cc-tone-info { border-color: rgba(59,130,246,0.34); }
.cc-tone-success { border-color: rgba(34,197,94,0.34); }
.cc-tone-violet { border-color: rgba(139,92,246,0.34); }

.cc-actions {
    display: grid;
    gap: 0.7rem;
}
.cc-action {
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 12px;
    padding: 0.7rem;
    background: rgba(255,255,255,0.02);
    display: grid;
    gap: 0.55rem;
}
.cc-action h4 { margin: 0; font-size: 0.9rem; }
.cc-action p { margin: 0; color: var(--text-secondary); font-size: 0.78rem; }
.cc-action-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
}
.cc-action input,
.cc-action select,
.cc-action textarea {
    width: 100%;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.03);
    color: var(--text-primary);
    padding: 0.52rem 0.6rem;
    font-size: 0.84rem;
}
.cc-action textarea { min-height: 64px; resize: vertical; }
.cc-row-full { grid-column: 1 / -1; }

.cc-result {
    border-radius: 10px;
    padding: 0.58rem 0.68rem;
    font-size: 0.8rem;
    border: 1px solid rgba(148,163,184,0.35);
    color: var(--text-secondary);
    background: rgba(148,163,184,0.09);
}
.cc-result.success {
    border-color: rgba(34,197,94,0.45);
    background: rgba(34,197,94,0.13);
    color: #bbf7d0;
}
.cc-result.error {
    border-color: rgba(239,68,68,0.45);
    background: rgba(239,68,68,0.13);
    color: #fecaca;
}
.cc-result.upgrade {
    border-color: rgba(245,158,11,0.45);
    background: rgba(245,158,11,0.15);
    color: #fde68a;
}

.cc-live-locked {
    border: 1px dashed rgba(245,158,11,0.52);
    border-radius: 12px;
    padding: 0.85rem;
    color: #fde68a;
    background: rgba(245,158,11,0.1);
}

@media (max-width: 1080px) {
    .cc-main { grid-template-columns: 1fr; }
    .cc-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 820px) {
    .cc-hero { grid-template-columns: 1fr; }
}

@media (max-width: 560px) {
    .cc-kpis { grid-template-columns: 1fr; }
    .cc-action-grid { grid-template-columns: 1fr; }
}
</style>

<div class="cc-layout">
    <section class="dashboard-page-header">
        <div class="dashboard-page-copy">
            <span class="dashboard-page-eyebrow">Operations Hub</span>
            <h1>Command Center</h1>
            <div class="dashboard-page-meta">
                <span class="status-badge <?= $guildId !== '' ? 'active' : 'inactive' ?>"><?= $guildId !== '' ? 'Server aktiv' : 'Kein Server' ?></span>
                <span class="status-badge info">Plan: <?= esc(strtoupper($guildTier)) ?></span>
                <span class="status-badge <?= $hasLiveActivity ? 'active' : 'premium' ?>"><?= $hasLiveActivity ? 'LIVE aktiv' : 'LIVE Premium' ?></span>
            </div>
        </div>
        <div class="dashboard-page-actions">
            <a href="https://discord.com/oauth2/authorize?client_id=1487187616674611321&permissions=1654096264208&scope=bot+applications.commands" target="_blank" rel="noopener" class="btn-icon btn-primary-ui"><span class="i">➕</span> Bot einladen</a>
            <a href="<?= esc(dashboardPageUrl('server-plans')) ?>" class="btn-icon btn-secondary-ui"><span class="i">💎</span> Upgrade</a>
        </div>
    </section>

    <section class="cc-hero">
        <div class="cc-banner">
            <span class="cc-eyebrow">Realtime Ops</span>
            <h2><?= esc($selectedGuild['name'] ?? 'Kein Server ausgewaehlt') ?></h2>
            <p>Alle kritischen Aktionen in einem Screen: Live Activity links, Sofortaktionen rechts. Ohne neue Architektur, direkt auf bestehende API-Routen.</p>
        </div>

    </section>

    <section class="cc-kpis">
        <article class="cc-kpi"><span>Members</span><strong><?= number_format((int)($overview['memberCount'] ?? 0)) ?></strong></article>
        <article class="cc-kpi"><span>Open Tickets</span><strong><?= number_format((int)($tickets['open'] ?? 0)) ?></strong></article>
        <article class="cc-kpi"><span>Mod Cases 24h</span><strong><?= number_format((int)($moderation['cases24h'] ?? 0)) ?></strong></article>
        <article class="cc-kpi"><span>Activity Score</span><strong><?= number_format((int)($insights['activityScore'] ?? 0)) ?></strong></article>
    </section>

    <section class="cc-main">
        <div class="cc-panel">
            <div class="cc-panel-head">
                <h3>Live Activity Feed</h3>
                <a href="<?= esc(dashboardPageUrl('activity')) ?>" class="btn-icon btn-secondary-ui"><span class="i">⚡</span> Vollansicht</a>
            </div>
            <?php if (!$hasLiveActivity): ?>
                <div class="cc-live-locked">
                    <strong>🔒 Live Feed ist Premium</strong>
                    <p style="margin:.35rem 0 0;">Du siehst weiterhin den letzten Snapshot. Fuer echte Live-Updates bitte auf Basic oder Pro upgraden.</p>
                </div>
            <?php endif; ?>
            <div class="cc-feed" id="ccFeed">
                <?php if (empty($activityItems)): ?>
                    <div class="empty-state"><strong>Noch keine Aktivitaet</strong><p>Sobald Events eintreffen, erscheinen sie hier.</p></div>
                <?php else: ?>
                    <?php foreach ($activityItems as $item): ?>
                        <?php $meta = commandCenterTypeMeta($item['type'] ?? ''); ?>
                        <article class="cc-card cc-tone-<?= esc($meta['tone']) ?>" data-activity-id="<?= esc((string)($item['id'] ?? '')) ?>">
                            <div class="cc-card-top">
                                <span><?= esc($meta['icon']) ?></span>
                                <span class="cc-card-type"><?= esc($meta['label']) ?></span>
                                <span class="cc-card-time"><?= esc(commandCenterRelativeTime($item['createdAt'] ?? null)) ?></span>
                            </div>
                            <strong><?= esc((string)($item['userName'] ?? 'Unbekannter User')) ?></strong>
                            <p><?= esc((string)($item['description'] ?? 'Neues Event')) ?></p>
                            <div class="cc-card-meta">
                                <?php if (!empty($item['actorName'])): ?><span>von <?= esc($item['actorName']) ?></span><?php endif; ?>
                                <?php if (!empty($item['channelName'])): ?><span><?= esc($item['channelName']) ?></span><?php endif; ?>
                            </div>
                        </article>
                    <?php endforeach; ?>
                <?php endif; ?>
            </div>
        </div>

        <div class="cc-panel">
            <div class="cc-panel-head">
                <h3>Quick Actions</h3>
                <span class="status-badge info">Live Testbar</span>
            </div>
            <div id="ccActionResult" class="cc-result" hidden></div>
            <div class="cc-actions">
                <form class="cc-action" data-action="kick">
                    <h4>🛡️ Kick User</h4>
                    <p>Schneller Moderations-Check inkl. Case-Logging.</p>
                    <div class="cc-action-grid">
                        <input name="userId" placeholder="User ID" required>
                        <input name="reason" placeholder="Grund (optional)">
                        <button type="submit" class="btn-icon btn-secondary-ui cc-row-full"><span class="i">🚪</span> Kick ausfuehren</button>
                    </div>
                </form>

                <form class="cc-action" data-action="ban">
                    <h4>⛔ Ban User</h4>
                    <p>Bannt einen User direkt mit Audit-Reason.</p>
                    <div class="cc-action-grid">
                        <input name="userId" placeholder="User ID" required>
                        <input name="reason" placeholder="Grund (optional)">
                        <button type="submit" class="btn-icon btn-secondary-ui cc-row-full"><span class="i">⛔</span> Ban ausfuehren</button>
                    </div>
                </form>

                <form class="cc-action" data-action="testticket">
                    <h4>🎫 Ticket Test</h4>
                    <p>Erzeugt ein Test-Ticket fuer den Dashboard User.</p>
                    <div class="cc-action-grid">
                        <select name="priority">
                            <option value="normal">Normal</option>
                            <option value="high">High</option>
                            <option value="low">Low</option>
                        </select>
                        <input name="reason" placeholder="Test-Grund">
                        <button type="submit" class="btn-icon btn-secondary-ui cc-row-full"><span class="i">🎫</span> Ticket erzeugen</button>
                    </div>
                </form>

                <form class="cc-action" data-action="testautomod">
                    <h4>🚨 AutoMod Test</h4>
                    <p>Testet Regeln ohne echte Moderationsaktion.</p>
                    <div class="cc-action-grid">
                        <textarea class="cc-row-full" name="content" placeholder="Nachricht fuer den Regeltest" required></textarea>
                        <input name="mentionCount" type="number" min="0" max="30" value="0" placeholder="Mentions">
                        <button type="submit" class="btn-icon btn-secondary-ui"><span class="i">🧪</span> AutoMod pruefen</button>
                    </div>
                </form>

                <form class="cc-action" data-action="grantxp">
                    <h4>📈 Test XP vergeben</h4>
                    <p>Vergibt XP an den Dashboard User oder optional an User ID.</p>
                    <div class="cc-action-grid">
                        <input name="amount" type="number" min="1" max="1000" value="100" required>
                        <input name="userId" placeholder="User ID (optional)">
                        <button type="submit" class="btn-icon btn-secondary-ui cc-row-full"><span class="i">⚡</span> XP senden</button>
                    </div>
                </form>
            </div>
        </div>
    </section>
</div>

<script>
(function() {
    const guildId = <?php echo json_encode($guildId); ?>;
    const liveAllowed = <?php echo $hasLiveActivity ? 'true' : 'false'; ?>;
    const baseUrl = <?php echo json_encode(BASE_URL); ?>;
    const streamAuth = {
        viewerId: <?php echo json_encode($streamAuth['viewerId'] ?? ''); ?>,
        dashboardMode: <?php echo json_encode($streamAuth['dashboardMode'] ?? 'admin'); ?>,
        expiresAt: <?php echo (int)($streamAuth['expiresAt'] ?? 0); ?>,
        signature: <?php echo json_encode($streamAuth['signature'] ?? ''); ?>,
    };

    const forms = Array.from(document.querySelectorAll('.cc-action[data-action]'));
    const result = document.getElementById('ccActionResult');
    const feed = document.getElementById('ccFeed');
    const typeMeta = {
        moderation: { icon: '🛡️', tone: 'danger', label: 'Moderation' },
        automod: { icon: '🚨', tone: 'warn', label: 'AutoMod' },
        tickets: { icon: '🎫', tone: 'info', label: 'Tickets' },
        leveling: { icon: '📈', tone: 'success', label: 'Leveling' },
        voice: { icon: '🎙️', tone: 'violet', label: 'Voice' },
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
        const ts = new Date(iso).getTime();
        if (!Number.isFinite(ts)) return 'gerade eben';
        const d = Math.max(0, Math.floor((Date.now() - ts) / 1000));
        if (d < 60) return `vor ${Math.max(1, d)}s`;
        if (d < 3600) return `vor ${Math.floor(d / 60)}m`;
        if (d < 86400) return `vor ${Math.floor(d / 3600)}h`;
        return `vor ${Math.floor(d / 86400)}d`;
    }

    function renderCard(item) {
        const meta = typeMeta[item?.type] || { icon: '✨', tone: 'muted', label: 'Event' };
        const id = String(item?.id || `${item?.type || 'event'}:${item?.createdAt || Date.now()}`);
        return `
            <article class="cc-card cc-tone-${escapeHtml(meta.tone)}" data-activity-id="${escapeHtml(id)}">
                <div class="cc-card-top">
                    <span>${escapeHtml(meta.icon)}</span>
                    <span class="cc-card-type">${escapeHtml(meta.label)}</span>
                    <span class="cc-card-time">${escapeHtml(relativeTime(item?.createdAt))}</span>
                </div>
                <strong>${escapeHtml(item?.userName || 'Unbekannter User')}</strong>
                <p>${escapeHtml(item?.description || 'Neues Event')}</p>
                <div class="cc-card-meta">
                    ${item?.actorName ? `<span>von ${escapeHtml(item.actorName)}</span>` : ''}
                    ${item?.channelName ? `<span>${escapeHtml(item.channelName)}</span>` : ''}
                </div>
            </article>
        `;
    }

    function prependItem(item) {
        if (!item || !item.type) return;
        const id = String(item.id || '').trim();
        if (id) {
            const exists = Array.from(feed.querySelectorAll('.cc-card')).some((card) => card.dataset.activityId === id);
            if (exists) return;
        }
        const empty = feed.querySelector('.empty-state');
        if (empty) empty.remove();
        feed.insertAdjacentHTML('afterbegin', renderCard(item));
        const cards = Array.from(feed.querySelectorAll('.cc-card'));
        if (cards.length > 50) {
            cards.slice(50).forEach((node) => node.remove());
        }
    }

    function showResult(ok, message, upgrade) {
        result.hidden = false;
        result.className = 'cc-result ' + (upgrade ? 'upgrade' : (ok ? 'success' : 'error'));
        result.textContent = message || (ok ? 'Aktion erfolgreich.' : 'Aktion fehlgeschlagen.');
    }

    async function submitAction(form) {
        const formData = new FormData(form);
        formData.set('ajax', '1');
        formData.set('actionType', String(form.dataset.action || '').toLowerCase());

        const submit = form.querySelector('button[type="submit"]');
        const original = submit ? submit.innerHTML : '';
        if (submit) {
            submit.disabled = true;
            submit.innerHTML = '<span class="i">⏳</span> Laeuft...';
        }

        try {
            const response = await fetch(window.location.href, {
                method: 'POST',
                body: formData,
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                credentials: 'same-origin',
            });
            const payload = await response.json();
            showResult(Boolean(payload?.success), String(payload?.message || ''), Boolean(payload?.upgrade));
        } catch (error) {
            showResult(false, String(error?.message || 'Aktion fehlgeschlagen.'), false);
        } finally {
            if (submit) {
                submit.disabled = false;
                submit.innerHTML = original;
            }
        }
    }

    forms.forEach((form) => {
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            submitAction(form);
        });
    });

    function setupLiveStream() {
        if (!liveAllowed || !guildId || typeof EventSource === 'undefined') return;
        if (!streamAuth.viewerId || !streamAuth.signature || !streamAuth.expiresAt) return;

        const streamUrl = `/guilds/${encodeURIComponent(guildId)}/activity/stream?dashboardUserId=${encodeURIComponent(streamAuth.viewerId)}&dashboardMode=${encodeURIComponent(streamAuth.dashboardMode)}&expiresAt=${encodeURIComponent(String(streamAuth.expiresAt))}&streamSig=${encodeURIComponent(streamAuth.signature)}`;
        const es = new EventSource(streamUrl);

        es.addEventListener('activity', (event) => {
            try {
                const payload = JSON.parse(event.data || '{}');
                if (payload?.type !== 'activity') return;
                prependItem(payload.item || null);
            } catch {}
        });

        window.addEventListener('beforeunload', () => {
            es.close();
        });
    }

    if (!liveAllowed && guildId) {
        fetch(`${baseUrl}/pages/activity.php?ajax=1&guildId=${encodeURIComponent(guildId)}&type=all&limit=12&offset=0`, {
            headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            credentials: 'same-origin',
        }).then((res) => res.json()).then((payload) => {
            const items = Array.isArray(payload?.items) ? payload.items : [];
            if (!items.length) return;
            feed.innerHTML = '';
            items.forEach((item) => prependItem(item));
        }).catch(() => {});
    }

    setupLiveStream();
})();
</script>

<?php include '../includes/footer.php'; ?>
