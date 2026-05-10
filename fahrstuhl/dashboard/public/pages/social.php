<?php
$page_title = 'Social Alerts';
require_once __DIR__ . '/../includes/config.php';
requireLogin();

$guildsRaw = getAPI('/voice/guilds', 8);
$guilds = $guildsRaw['data']['guilds'] ?? [];
$guildId = dashboardSelectedGuildId($guilds);

$message = '';
$messageType = 'success';
$operationSuccess = null;
$isAjaxRequest = strcasecmp($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '', 'XMLHttpRequest') === 0
    || stripos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') !== false;
$sendJson = function ($payload, $statusCode = 200) {
    http_response_code((int)$statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit();
};

function social_checked($value) { return !empty($value) ? 'checked' : ''; }
function social_selected($a, $b) { return (string)$a === (string)$b ? 'selected' : ''; }

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $guildId) {
    $feeds = [];
    $ids = $_POST['feedId'] ?? [];
    $types = $_POST['feedType'] ?? [];
    $labels = $_POST['feedLabel'] ?? [];
    $sources = $_POST['feedSource'] ?? [];
    $templates = $_POST['feedTemplate'] ?? [];
    $enabled = $_POST['feedEnabled'] ?? [];

    for ($i = 0; $i < count($sources); $i++) {
        $source = trim($sources[$i] ?? '');
        if ($source === '') continue;
        $feeds[] = [
            'id' => trim($ids[$i] ?? ''),
            'enabled' => isset($enabled[$i]),
            'type' => $types[$i] ?? 'rss',
            'label' => $labels[$i] ?? '',
            'source' => $source,
            'messageTemplate' => $templates[$i] ?? '',
        ];
    }

    $result = api('/guilds/' . urlencode($guildId) . '/social', 'POST', [
        'enabled' => ($_POST['enabled'] ?? '0') === '1',
        'announcementChannelId' => $_POST['announcementChannelId'] ?? '',
        'mentionText' => $_POST['mentionText'] ?? '',
        'pollMinutes' => $_POST['pollMinutes'] ?? 5,
        'feeds' => $feeds,
    ], 20);

    if (($result['data']['success'] ?? false) === true) {
        $message = 'Social Alerts gespeichert.';
        $operationSuccess = true;
    } else {
        $messageType = 'error';
        $message = $result['data']['message'] ?? $result['data']['error'] ?? ('Saving Social Alerts failed. HTTP status: ' . ($result['status'] ?? 'unknown'));
        $operationSuccess = false;
    }
    if ($isAjaxRequest) $sendJson(['success' => $operationSuccess, 'message' => $message, 'messageType' => $messageType], $operationSuccess ? 200 : 400);
}

$raw = $guildId ? getAPI('/guilds/' . urlencode($guildId) . '/social', 12) : null;
$data = $raw['data'] ?? [];
$settings = $data['settings'] ?? [];
$channels = $data['channels'] ?? [];
$feeds = $settings['feeds'] ?? [];
$guildName = $data['guildName'] ?? 'Selected server';
$twitchConfigured = !empty($data['twitchConfigured']);

while (count($feeds) < 3) {
    $feeds[] = ['id' => '', 'enabled' => true, 'type' => count($feeds) === 0 ? 'youtube' : (count($feeds) === 1 ? 'twitch' : 'rss'), 'label' => '', 'source' => '', 'messageTemplate' => '{mention}{source}: {title}' . "\n" . '{url}'];
}

$premRaw        = $guildId ? getAPI('/guilds/' . urlencode($guildId) . '/premium', 5) : null;
$maxFeeds       = (int)(($premRaw['data']['featureLimits']['socialFeeds'] ?? 0));
$activeFeedCount = count(array_filter($feeds, fn($f) => !empty($f['source'])));
$socialBlocked  = $maxFeeds === 0;
$atFeedLimit    = !$socialBlocked && $maxFeeds >= 0 && $activeFeedCount >= $maxFeeds;
?>

<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.social-head { display:flex; justify-content:space-between; align-items:center; gap:1rem; margin-bottom:1rem; }
.social-title h1 { margin:0; font-size:1.5rem; }
.social-title p { margin:.25rem 0 0; color:var(--text-secondary); }
.social-shell { display:grid; grid-template-columns:minmax(0, 1fr) 330px; gap:1rem; align-items:start; }
.social-panel { background:var(--panel); border:1px solid var(--border-light); border-radius:8px; padding:1rem; }
.social-card { background:var(--bg-secondary); border:1px solid var(--border-light); border-radius:8px; padding:1rem; display:grid; gap:.75rem; }
.social-grid { display:grid; grid-template-columns:140px 1fr 1.2fr; gap:.75rem; }
.social-field { display:grid; gap:.35rem; }
.social-field label { color:var(--text-secondary); font-size:.78rem; font-weight:800; }
.social-field input, .social-field select, .social-field textarea { width:100%; border:1px solid var(--border-light); border-radius:8px; background:var(--bg-tertiary); color:var(--text-primary); padding:.7rem .8rem; }
.social-field textarea { min-height:72px; resize:vertical; }
.social-toggle { display:flex; align-items:center; gap:.55rem; font-weight:900; }
.social-toggle input { width:18px; height:18px; accent-color:#38bdf8; }
.social-actions { display:flex; justify-content:flex-end; gap:.7rem; margin-top:1rem; }
.social-save { border:0; border-radius:8px; background:#38bdf8; color:#061018; padding:.75rem 1rem; font-weight:900; cursor:pointer; }
.social-muted { color:var(--text-secondary); font-size:.82rem; line-height:1.45; }
.social-pill { display:inline-flex; align-items:center; gap:.35rem; border:1px solid var(--border-light); background:var(--bg-tertiary); border-radius:999px; padding:.3rem .55rem; font-size:.75rem; font-weight:800; color:var(--text-secondary); }
.social-preview { display:grid; gap:.75rem; }
.social-post { background:#111318; border-left:4px solid #38bdf8; border-radius:8px; padding:1rem; color:#dce3f2; }
.social-post strong { color:#fff; display:block; margin-bottom:.35rem; }
.alert { padding:10px; border-radius:6px; font-size:.85rem; margin-bottom:.8rem; border-left:4px solid; }
.alert-success { background:rgba(81,207,102,.1); color:#51cf66; border-color:#51cf66; }
.alert-error { background:rgba(255,107,107,.1); color:#ff6b6b; border-color:#ff6b6b; }
@media (max-width: 1000px) { .social-shell, .social-grid { grid-template-columns:1fr; } }
</style>

<section class="dashboard-page-header">
    <div class="dashboard-page-copy">
        <span class="dashboard-page-eyebrow">Community Module</span>
        <h1>Social Alerts</h1>
        <p>Postet Updates fuer <?php echo esc($guildName); ?> bei neuen Uploads, Streams oder RSS-Eintraegen.</p>
    </div>
    <div class="module-header-actions">
        <form method="GET">
            <select class="module-header-select" name="guildId" onchange="this.form.submit()">
                <?php foreach ($guilds as $g): ?>
                    <option value="<?php echo esc($g['id']); ?>" <?php echo social_selected($guildId, $g['id'] ?? ''); ?>><?php echo esc($g['name']); ?></option>
                <?php endforeach; ?>
            </select>
        </form>
    </div>
</section>

<?php if ($message): ?><div class="alert alert-<?php echo esc($messageType); ?>"><?php echo esc($message); ?></div><?php endif; ?>

<?php if (!$guildId): ?>
<?php if ($socialBlocked && $guildId): ?>
    <div class="alert alert-error" style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;">
        <span>⛔ Social Alerts sind im <strong>Free Plan</strong> nicht verfügbar.</span>
        <a href="server-plans.php<?php echo $guildId ? '?guildId=' . urlencode($guildId) : ''; ?>" style="color:#b48af7;font-weight:700;white-space:nowrap;">💎 Upgrade ansehen</a>
    </div>
<?php endif; ?>
    <div class="social-panel">Bitte zuerst einen Server auswaehlen.</div>
<?php else: ?>
<form id="socialForm" method="POST" class="social-shell">
    <input type="hidden" name="guildId" value="<?php echo esc($guildId); ?>">
    <section class="social-panel">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-bottom:1rem;">
            <div>
                <h2 style="margin:0;">Setup</h2>
                <p class="social-muted" style="margin:.25rem 0 0;">YouTube, Twitch und beliebige RSS Feeds in einen Discord-Kanal pushen.</p>
            </div>
            <label class="social-toggle">
                <input type="hidden" name="enabled" value="0">
                <input type="checkbox" name="enabled" value="1" <?php echo social_checked($settings['enabled'] ?? false); ?>>
                Aktiv
            </label>
        </div>

        <div class="social-grid" style="margin-bottom:1rem;">
            <div class="social-field">
                <label>Check-Intervall</label>
                <input type="number" name="pollMinutes" min="2" max="60" value="<?php echo esc((string)($settings['pollMinutes'] ?? 5)); ?>">
            </div>
            <div class="social-field">
                <label>Announcement Channel</label>
                <select name="announcementChannelId">
                    <option value="">Channel auswaehlen</option>
                    <?php foreach ($channels as $channel): ?>
                        <option value="<?php echo esc($channel['id']); ?>" <?php echo social_selected($settings['announcementChannelId'] ?? '', $channel['id'] ?? ''); ?>>#<?php echo esc($channel['name']); ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="social-field">
                <label>Mention Text optional</label>
                <input name="mentionText" maxlength="80" placeholder="@everyone oder @Rolle" value="<?php echo esc($settings['mentionText'] ?? ''); ?>">
            </div>
        </div>

        <div style="display:grid;gap:.85rem;">
            <?php foreach ($feeds as $index => $feed): ?>
                 <article class="social-card" <?php echo $socialBlocked ? 'style="opacity:0.45;pointer-events:none;"' : ''; ?>>
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;">
                        <label class="social-toggle">
                            <input type="checkbox" name="feedEnabled[<?php echo $index; ?>]" <?php echo social_checked($feed['enabled'] ?? true); ?>>
                            Feed <?php echo $index + 1; ?>
                        </label>
                        <span class="social-pill"><?php echo !empty($feed['lastPostedAt']) ? 'zuletzt gepostet' : 'bereit'; ?></span>
                    </div>
                    <input type="hidden" name="feedId[<?php echo $index; ?>]" value="<?php echo esc($feed['id'] ?? ''); ?>">
                    <div class="social-grid">
                        <div class="social-field">
                            <label>Typ</label>
                            <select name="feedType[<?php echo $index; ?>]">
                                <option value="youtube" <?php echo social_selected($feed['type'] ?? '', 'youtube'); ?>>YouTube</option>
                                <option value="twitch" <?php echo social_selected($feed['type'] ?? '', 'twitch'); ?>>Twitch Live</option>
                                <option value="rss" <?php echo social_selected($feed['type'] ?? '', 'rss'); ?>>RSS</option>
                            </select>
                        </div>
                        <div class="social-field">
                            <label>Name</label>
                            <input name="feedLabel[<?php echo $index; ?>]" maxlength="80" placeholder="z.B. Fahrstuhl YouTube" value="<?php echo esc($feed['label'] ?? ''); ?>">
                        </div>
                        <div class="social-field">
                            <label>Quelle</label>
                            <input name="feedSource[<?php echo $index; ?>]" maxlength="500" placeholder="YouTube Channel-ID, Twitch Login oder RSS URL" value="<?php echo esc($feed['source'] ?? ''); ?>">
                        </div>
                    </div>
                    <div class="social-field">
                        <label>Nachricht</label>
                        <textarea name="feedTemplate[<?php echo $index; ?>]" maxlength="500"><?php echo esc($feed['messageTemplate'] ?? '{mention}{source}: {title}' . "\n" . '{url}'); ?></textarea>
                        <small class="social-muted">Platzhalter: {mention}, {source}, {title}, {url}, {type}, {channel}, {game}, {viewerCount}, {author}</small>
                    </div>
                </article>
            <?php endforeach; ?>
        </div>

        <div class="social-actions">
            <button type="submit" class="social-save">Speichern</button>
                <?php if (!$socialBlocked && $maxFeeds >= 0): ?>
                <span style="font-size:0.75rem; color:var(--text-secondary); align-self:center;"><?php echo $activeFeedCount; ?> / <?php echo $maxFeeds; ?> Feeds aktiv<?php if ($atFeedLimit): ?> &mdash; <a href="server-plans.php<?php echo $guildId ? '?guildId=' . urlencode($guildId) : ''; ?>" style="color:#b48af7;font-weight:700;">💎 Upgrade</a><?php endif; ?></span>
                <?php endif; ?>
        </div>
    </section>

    <aside class="social-panel social-preview">
        <h2 style="margin:0;">Preview</h2>
        <div class="social-post">
            <strong>Fahrstuhl Bot ist live</strong>
            <div class="social-muted">@everyone Twitch: Neuer Livestream<br>https://twitch.tv/fahrstuhl</div>
        </div>
        <div>
            <div class="social-pill">YouTube ohne API Key</div>
            <div class="social-pill">RSS ohne API Key</div>
            <div class="social-pill">Twitch <?php echo $twitchConfigured ? 'verbunden' : 'braucht Env Keys'; ?></div>
        </div>
        <p class="social-muted">YouTube funktioniert am stabilsten mit einer Channel-ID oder einer /channel/UC... URL. Twitch Live Alerts brauchen <code>TWITCH_CLIENT_ID</code> und <code>TWITCH_CLIENT_SECRET</code> in der Bot-Umgebung.</p>
        <p class="social-muted">Beim ersten Speichern merkt sich der Bot nur den neuesten Stand. Erst neue Uploads, neue RSS Eintraege oder neue Twitch Streams werden gepostet.</p>
    </aside>
</form>
<?php endif; ?>

<script>
(function () {
    const form = document.getElementById('socialForm');
    if (!form) return;

    let alertEl = document.querySelector('.alert');
    const saveBtn = form.querySelector('button[type="submit"]');

    function showAlert(msg, type) {
        if (!alertEl) {
            alertEl = document.createElement('div');
            alertEl.className = 'alert';
            form.before(alertEl);
        }
        alertEl.className = 'alert alert-' + type;
        alertEl.textContent = msg;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Speichert...'; }

        try {
            const response = await fetch(window.location.href, {
                method: 'POST',
                headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' },
                body: new FormData(form),
                credentials: 'same-origin'
            });
            const json = await response.json().catch(() => ({ success: false, message: 'Ungueltige Serverantwort.' }));
            showAlert(json.message || (json.success ? 'Gespeichert.' : 'Fehler.'), json.success ? 'success' : 'error');
        } catch (err) {
            showAlert(err.message || 'Netzwerkfehler.', 'error');
        } finally {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Speichern'; }
        }
    });
})();
</script>

<?php include '../includes/footer.php'; ?>
