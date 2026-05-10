<?php
$page_title = 'Free Games';
require_once __DIR__ . '/../includes/config.php';
requireLogin();

$guildsRaw = getAPI('/voice/guilds', 8);
$guilds = $guildsRaw['data']['guilds'] ?? [];
$guildId = dashboardSelectedGuildId($guilds);

$message = '';
$messageType = 'success';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $guildId) {
    $result = api('/guilds/' . urlencode($guildId) . '/freegames', 'POST', [
        'enabled'       => ($_POST['enabled'] ?? '0') === '1',
        'channelId'     => $_POST['channelId'] ?? '',
        'mentionRoleId' => $_POST['mentionRoleId'] ?? '',
        'filter'        => $_POST['filter'] ?? 'all',
    ], 15);

    if (($result['data']['success'] ?? false) === true) {
        $message = '✅ Free Games Benachrichtigungen gespeichert.';
    } else {
        $messageType = 'error';
        $message = $result['data']['message'] ?? $result['data']['error'] ?? ('Fehler beim Speichern. HTTP: ' . ($result['status'] ?? 'unknown'));
    }
}

$raw      = $guildId ? getAPI('/guilds/' . urlencode($guildId) . '/freegames', 12) : null;
$data     = $raw['data'] ?? [];
$settings = $data['settings'] ?? [];
$channels = $data['channels'] ?? [];
$roles    = $data['roles'] ?? [];
$guildName = $data['guildName'] ?? 'Ausgewählter Server';

function fg_checked($val)     { return !empty($val) ? 'checked' : ''; }
function fg_selected($a, $b)  { return (string)$a === (string)$b ? 'selected' : ''; }
?>

<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.fg-shell { display:grid; grid-template-columns:minmax(0,1fr) 300px; gap:1rem; align-items:start; }
.fg-panel { background:var(--card-bg,#1e1f2e); border:1px solid var(--border,#2a2b3d); border-radius:.75rem; padding:1.5rem; }
.fg-field { display:flex; flex-direction:column; gap:.35rem; }
.fg-field label { font-size:.8rem; font-weight:600; color:var(--text-secondary,#aaa); text-transform:uppercase; letter-spacing:.04em; }
.fg-field select,
.fg-field input[type=text] { background:var(--input-bg,#13141f); border:1px solid var(--border,#2a2b3d); border-radius:.45rem; color:var(--text,#e0e0e0); padding:.5rem .75rem; font-size:.9rem; width:100%; }
.fg-grid { display:grid; grid-template-columns:1fr 1fr; gap:.85rem; margin-bottom:1rem; }
.fg-toggle { display:flex; align-items:center; gap:.5rem; cursor:pointer; font-weight:600; }
.fg-toggle input[type=checkbox] { width:1.1rem; height:1.1rem; }
.fg-save { background:var(--accent,#5865F2); color:#fff; border:none; border-radius:.5rem; padding:.6rem 1.4rem; font-size:.95rem; font-weight:700; cursor:pointer; }
.fg-save:hover { opacity:.85; }
.fg-pill { display:inline-block; background:var(--badge-bg,#2a2b3d); border-radius:1rem; padding:.2rem .65rem; font-size:.75rem; margin:.15rem .1rem; }
.fg-pill.green { background:#0d3b2e; color:#34d399; }
.fg-pill.purple { background:#2d1b6e; color:#c4b5fd; }
.fg-info { font-size:.82rem; color:var(--text-secondary,#aaa); line-height:1.5; }
.fg-actions { display:flex; align-items:center; gap:1rem; margin-top:1.25rem; }
.fg-platform-list { display:flex; flex-wrap:wrap; gap:.4rem; margin-top:.5rem; }
@media(max-width:900px){ .fg-shell,.fg-grid{ grid-template-columns:1fr; } }

.fg-filter-cards { display:grid; grid-template-columns:1fr 1fr; gap:.75rem; margin-top:.25rem; }
.fg-filter-card { border:2px solid var(--border,#2a2b3d); border-radius:.6rem; padding:.85rem 1rem; cursor:pointer; transition:border-color .15s; }
.fg-filter-card input[type=radio] { display:none; }
.fg-filter-card.selected { border-color:var(--accent,#5865F2); background:rgba(88,101,242,.08); }
.fg-filter-card .fc-title { font-weight:700; font-size:.9rem; margin-bottom:.25rem; }
.fg-filter-card .fc-desc { font-size:.78rem; color:var(--text-secondary,#aaa); }
@media(max-width:600px){ .fg-filter-cards{ grid-template-columns:1fr; } }
</style>

<section class="dashboard-page-header">
    <div class="dashboard-page-copy">
        <span class="dashboard-page-eyebrow">Community Modul</span>
        <h1>🎮 Free Games</h1>
        <p>Postet automatisch kostenlose Spiele in einen Channel für <?php echo esc($guildName); ?>.</p>
    </div>
    <div class="module-header-actions">
        <form method="GET">
            <select class="module-header-select" name="guildId" onchange="this.form.submit()">
                <?php foreach ($guilds as $g): ?>
                    <option value="<?php echo esc($g['id']); ?>" <?php echo fg_selected($guildId, $g['id'] ?? ''); ?>><?php echo esc($g['name']); ?></option>
                <?php endforeach; ?>
            </select>
        </form>
    </div>
</section>

<?php if ($message): ?>
    <div class="alert alert-<?php echo esc($messageType); ?>"><?php echo esc($message); ?></div>
<?php endif; ?>

<?php if (!$guildId): ?>
    <div class="fg-panel">Bitte zuerst einen Server auswählen.</div>
<?php else: ?>

<form method="POST" class="fg-shell">
    <input type="hidden" name="guildId" value="<?php echo esc($guildId); ?>">

    <section class="fg-panel">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-bottom:1.25rem;">
            <div>
                <h2 style="margin:0;">Einstellungen</h2>
                <p class="fg-info" style="margin:.25rem 0 0;">Kostenlose Spiele von Epic Games, GOG, Steam und mehr automatisch posten.</p>
            </div>
            <label class="fg-toggle">
                <input type="hidden" name="enabled" value="0">
                <input type="checkbox" name="enabled" value="1" <?php echo fg_checked($settings['enabled'] ?? false); ?>>
                Aktiv
            </label>
        </div>

        <div class="fg-grid">
            <div class="fg-field">
                <label>Channel</label>
                <select name="channelId">
                    <option value="">— Channel wählen —</option>
                    <?php foreach ($channels as $ch): ?>
                        <option value="<?php echo esc($ch['id']); ?>" <?php echo fg_selected($settings['channelId'] ?? '', $ch['id']); ?>>#<?php echo esc($ch['name']); ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="fg-field">
                <label>Mention-Rolle <span style="font-weight:400;text-transform:none">(optional)</span></label>
                <select name="mentionRoleId">
                    <option value="">— Keine —</option>
                    <?php foreach ($roles as $r): ?>
                        <option value="<?php echo esc($r['id']); ?>" <?php echo fg_selected($settings['mentionRoleId'] ?? '', $r['id']); ?>><?php echo esc($r['name']); ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
        </div>

        <div class="fg-field" style="margin-bottom:1.25rem;">
            <label>Quellen-Filter</label>
            <div class="fg-filter-cards" id="filterCards">
                <?php $currentFilter = $settings['filter'] ?? 'all'; ?>
                <label class="fg-filter-card <?php echo $currentFilter === 'all' ? 'selected' : ''; ?>" onclick="selectFilter(this,'all')">
                    <input type="radio" name="filter" value="all" <?php echo fg_checked($currentFilter === 'all'); ?>>
                    <div class="fc-title">🌐 Alle Spiele</div>
                    <div class="fc-desc">Epic, GOG, Steam, GamerPower, itch.io und weitere</div>
                </label>
                <label class="fg-filter-card <?php echo $currentFilter === 'serious' ? 'selected' : ''; ?>" onclick="selectFilter(this,'serious')">
                    <input type="radio" name="filter" value="serious" <?php echo fg_checked($currentFilter === 'serious'); ?>>
                    <div class="fc-title">🏪 Nur seriöse Stores</div>
                    <div class="fc-desc">Ausschließlich Epic Games, GOG und Steam</div>
                </label>
            </div>
        </div>

        <div class="fg-actions">
            <button type="submit" class="fg-save">Speichern</button>
        </div>
    </section>

    <aside class="fg-panel">
        <h3 style="margin:0 0 .75rem;">📡 Quellen</h3>
        <div class="fg-platform-list">
            <span class="fg-pill green">✅ Epic Games</span>
            <span class="fg-pill green">✅ GOG</span>
            <span class="fg-pill green">✅ Steam</span>
            <span class="fg-pill purple">🔗 GamerPower</span>
            <span class="fg-pill">itch.io</span>
        </div>
        <p class="fg-info" style="margin-top:.85rem;">Der Bot prüft stündlich alle Quellen. Sobald ein neues kostenloses Spiel erscheint, wird es automatisch in den gewählten Channel gepostet.</p>
        <hr style="border-color:var(--border,#2a2b3d);margin:1rem 0;">
        <h3 style="margin:0 0 .5rem;">ℹ️ Hinweise</h3>
        <ul class="fg-info" style="padding-left:1.2rem;margin:0;display:flex;flex-direction:column;gap:.4rem;">
            <li>Beim ersten Aktivieren werden bestehende Angebote <strong>nicht</strong> gepostet — nur neue.</li>
            <li>Der Bot postet ein Live-Status-Embed im Channel, das sich minütlich aktualisiert.</li>
            <li>Doppelte Spiele werden automatisch herausgefiltert.</li>
        </ul>
        <?php if (!empty($settings['enabled'])): ?>
        <hr style="border-color:var(--border,#2a2b3d);margin:1rem 0;">
        <div class="fg-info">
            <strong>Status:</strong> <span style="color:#34d399;">● Aktiv</span><br>
            <?php if (!empty($settings['channelId'])): ?>
            <strong>Channel-ID:</strong> <?php echo esc($settings['channelId']); ?><br>
            <?php endif; ?>
            <strong>Filter:</strong> <?php echo $settings['filter'] === 'serious' ? '🏪 Nur seriöse Stores' : '🌐 Alle Spiele'; ?>
        </div>
        <?php endif; ?>
    </aside>
</form>

<script>
function selectFilter(el, value) {
    document.querySelectorAll('.fg-filter-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    el.querySelector('input[type=radio]').checked = true;
}
</script>

<?php endif; ?>

<?php include '../includes/footer.php'; ?>
