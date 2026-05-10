<?php
$page_title = 'Temp Voice';
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

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $guildId) {
    $result = api('/guilds/' . urlencode($guildId) . '/tempvoice', 'POST', [
        'enabled' => ($_POST['enabled'] ?? '0') === '1',
        'hubChannelId' => $_POST['hubChannelId'] ?? '',
        'categoryId' => $_POST['categoryId'] ?? '',
        'channelNameTemplate' => $_POST['channelNameTemplate'] ?? "{username}'s Channel",
        'userLimit' => $_POST['userLimit'] ?? 0,
        'bitrate' => $_POST['bitrate'] ?? 0,
        'allowRename' => ($_POST['allowRename'] ?? '0') === '1',
        'allowLock' => ($_POST['allowLock'] ?? '0') === '1',
        'allowLimit' => ($_POST['allowLimit'] ?? '0') === '1',
        'deleteWhenEmpty' => ($_POST['deleteWhenEmpty'] ?? '0') === '1',
    ], 15);
    if (($result['data']['success'] ?? false) === true) {
        $message = 'Temp Voice settings saved.';
        $operationSuccess = true;
    } else {
        $messageType = 'error';
        $message = $result['data']['message'] ?? $result['data']['error'] ?? ('Saving Temp Voice failed. HTTP status: ' . ($result['status'] ?? 'unknown'));
        $operationSuccess = false;
    }
    if ($isAjaxRequest) $sendJson(['success' => $operationSuccess, 'message' => $message, 'messageType' => $messageType], $operationSuccess ? 200 : 400);
}

$raw = $guildId ? getAPI('/guilds/' . urlencode($guildId) . '/tempvoice', 12) : null;
$data = $raw['data'] ?? [];
$settings = $data['settings'] ?? [];
$voiceChannels = $data['voiceChannels'] ?? [];
$categories = $data['categories'] ?? [];
$permissions = $data['permissions'] ?? [];
$guildName = $data['guildName'] ?? 'Selected server';

$selectedGuild = null;
foreach ($guilds as $guild) {
    if (($guild['id'] ?? '') === $guildId) {
        $selectedGuild = $guild;
        break;
    }
}
if (empty($voiceChannels) && !empty($selectedGuild['voiceChannels']) && is_array($selectedGuild['voiceChannels'])) {
    $voiceChannels = $selectedGuild['voiceChannels'];
}
if (($guildName === 'Selected server') && !empty($selectedGuild['name'])) {
    $guildName = $selectedGuild['name'];
}

function selectedAttr($a, $b) { return (string)$a === (string)$b ? 'selected' : ''; }
function checkedAttr($value) { return !empty($value) ? 'checked' : ''; }
?>

<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.tv-shell { display:grid; grid-template-columns:minmax(0, 1fr) 320px; gap:1rem; align-items:start; }
.tv-panel { background:var(--panel); border:1px solid var(--border-light); border-radius:8px; padding:1rem; }
.tv-head { display:flex; justify-content:space-between; gap:1rem; align-items:center; margin-bottom:1rem; }
.tv-title h1 { margin:0; font-size:1.5rem; }
.tv-title p { margin:.25rem 0 0; color:var(--text-secondary); }
.tv-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:1rem; }
.tv-field { display:grid; gap:.4rem; }
.tv-field label { font-size:.8rem; font-weight:800; color:var(--text-secondary); }
.tv-field input, .tv-field select { width:100%; border:1px solid var(--border-light); border-radius:8px; background:var(--bg-tertiary); color:var(--text-primary); padding:.7rem .8rem; }
.tv-checks { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:.65rem; margin-top:1rem; }
.tv-check { display:flex; align-items:center; gap:.55rem; background:var(--bg-secondary); border:1px solid var(--border-light); border-radius:8px; padding:.75rem; font-weight:800; color:var(--text-primary); }
.tv-check input { width:18px; height:18px; accent-color:#38bdf8; }
.tv-preview { display:grid; gap:.75rem; }
.voice-card { background:#111827; border:1px solid #2d3648; border-radius:8px; padding:.75rem; display:flex; align-items:center; justify-content:space-between; gap:.7rem; }
.voice-name { font-weight:900; color:#fff; }
.voice-meta { font-size:.78rem; color:#96a0b5; }
.alert { padding:10px; border-radius:6px; font-size:.85rem; margin-bottom:.8rem; border-left:4px solid; }
.alert-success { background:rgba(81,207,102,.1); color:#51cf66; border-color:#51cf66; }
.alert-error { background:rgba(255,107,107,.1); color:#ff6b6b; border-color:#ff6b6b; }
.perm-ok { color:#51cf66; }
.perm-bad { color:#ff6b6b; }
.btn-primary { border:0; border-radius:8px; background:#38bdf8; color:#061018; padding:.7rem 1rem; font-weight:900; cursor:pointer; }
@media (max-width: 1000px) { .tv-shell, .tv-grid, .tv-checks { grid-template-columns:1fr; } }
</style>

<div class="tv-head">
    <div class="tv-title">
        <h1>Temp Voice</h1>
        <p>Erstellt automatisch private Voice-Channels fuer <strong><?php echo esc($guildName); ?></strong>, wenn User dem Hub beitreten.</p>
    </div>
    <form method="GET">
        <select name="guildId" onchange="this.form.submit()" style="padding:.6rem;border-radius:8px;background:var(--bg-tertiary);color:#fff;border:1px solid var(--border-light);">
            <?php foreach ($guilds as $g): ?>
                <option value="<?php echo esc($g['id']); ?>" <?php echo selectedAttr($guildId, $g['id'] ?? ''); ?>><?php echo esc($g['name']); ?></option>
            <?php endforeach; ?>
        </select>
    </form>
</div>

<?php if ($message): ?><div class="alert alert-<?php echo esc($messageType); ?>"><?php echo esc($message); ?></div><?php endif; ?>

<?php if (!$guildId): ?>
    <div class="tv-panel">Bitte zuerst einen Server auswaehlen.</div>
<?php else: ?>
<form id="tvForm" method="POST" class="tv-shell">
    <input type="hidden" name="guildId" value="<?php echo esc($guildId); ?>">
    <section class="tv-panel">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
            <div>
                <h2 style="margin:0;">Setup</h2>
                <p style="margin:.25rem 0 0;color:var(--text-secondary);">Hub waehlen, Vorlage setzen, speichern, fertig.</p>
            </div>
            <label class="tv-check" style="padding:.55rem .75rem;">
                <input type="hidden" name="enabled" value="0">
                <input type="checkbox" name="enabled" value="1" <?php echo checkedAttr($settings['enabled'] ?? false); ?>>
                Aktiv
            </label>
        </div>

        <div class="tv-grid">
            <div class="tv-field">
                <label>Join-Hub Voice Channel</label>
                <select name="hubChannelId" required>
                    <option value=""><?php echo empty($voiceChannels) ? 'Keine Voice-Channels gefunden' : 'Voice Channel auswaehlen'; ?></option>
                    <?php foreach ($voiceChannels as $channel): ?>
                        <option value="<?php echo esc($channel['id']); ?>" <?php echo selectedAttr($settings['hubChannelId'] ?? '', $channel['id'] ?? ''); ?>><?php echo esc($channel['name']); ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="tv-field">
                <label>Kategorie fuer neue Channels</label>
                <select name="categoryId">
                    <option value="">Wie Hub / keine Kategorie</option>
                    <?php foreach ($categories as $category): ?>
                        <option value="<?php echo esc($category['id']); ?>" <?php echo selectedAttr($settings['categoryId'] ?? '', $category['id'] ?? ''); ?>><?php echo esc($category['name']); ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="tv-field">
                <label>Name der Temp-Channels</label>
                <input name="channelNameTemplate" maxlength="80" value="<?php echo esc($settings['channelNameTemplate'] ?? "{username}'s Channel"); ?>">
            </div>
            <div class="tv-field">
                <label>User-Limit</label>
                <input type="number" name="userLimit" min="0" max="99" value="<?php echo esc((string)($settings['userLimit'] ?? 0)); ?>">
            </div>
            <div class="tv-field">
                <label>Bitrate in kbps (0 = Discord Standard)</label>
                <input type="number" name="bitrate" min="0" max="384" value="<?php echo esc((string)($settings['bitrate'] ?? 0)); ?>">
            </div>
        </div>

        <div class="tv-checks">
            <label class="tv-check"><input type="hidden" name="allowRename" value="0"><input type="checkbox" name="allowRename" value="1" <?php echo checkedAttr($settings['allowRename'] ?? true); ?>> Rename erlauben</label>
            <label class="tv-check"><input type="hidden" name="allowLock" value="0"><input type="checkbox" name="allowLock" value="1" <?php echo checkedAttr($settings['allowLock'] ?? true); ?>> Lock erlauben</label>
            <label class="tv-check"><input type="hidden" name="allowLimit" value="0"><input type="checkbox" name="allowLimit" value="1" <?php echo checkedAttr($settings['allowLimit'] ?? true); ?>> Limit erlauben</label>
            <label class="tv-check"><input type="hidden" name="deleteWhenEmpty" value="0"><input type="checkbox" name="deleteWhenEmpty" value="1" <?php echo checkedAttr($settings['deleteWhenEmpty'] ?? true); ?>> Leere Channels loeschen</label>
        </div>

        <div style="margin-top:1rem;display:flex;justify-content:flex-end;">
            <button class="btn-primary" type="submit">Speichern</button>
        </div>
    </section>

    <aside class="tv-panel tv-preview">
        <h2 style="margin:0;">Live Preview</h2>
        <div class="voice-card">
            <div>
                <div class="voice-name" id="previewName">Txxle's Channel</div>
                <div class="voice-meta">wird erstellt, wenn jemand dem Hub joined</div>
            </div>
            <span>🔊</span>
        </div>
        <div>
            <div class="<?php echo !empty($permissions['manageChannels']) ? 'perm-ok' : 'perm-bad'; ?>">Manage Channels: <?php echo !empty($permissions['manageChannels']) ? 'OK' : 'Fehlt'; ?></div>
            <div class="<?php echo !empty($permissions['moveMembers']) ? 'perm-ok' : 'perm-bad'; ?>">Move Members: <?php echo !empty($permissions['moveMembers']) ? 'OK' : 'Fehlt'; ?></div>
        </div>
        <p style="color:var(--text-secondary);font-size:.85rem;line-height:1.5;margin:0;">Platzhalter: <code>{username}</code>, <code>{displayName}</code>, <code>{server}</code>. Owner-Control Buttons kommen als naechster Ausbau.</p>
    </aside>
</form>
<?php endif; ?>

<script>
const previewGuildName = <?php echo json_encode($guildName); ?>;
const input = document.querySelector('input[name="channelNameTemplate"]');
const preview = document.getElementById('previewName');
function renderPreview() {
  if (!preview || !input) return;
  preview.textContent = (input.value || "{username}'s Channel")
    .replaceAll('{username}', 'Txxle')
    .replaceAll('{displayName}', 'Txxle')
    .replaceAll('{user}', 'Txxle')
    .replaceAll('{server}', previewGuildName)
    .replaceAll('{server.name}', previewGuildName);
}
input?.addEventListener('input', renderPreview);
renderPreview();

(function () {
    const form = document.getElementById('tvForm');
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
        if (saveBtn) { saveBtn.disabled = true; saveBtn.style.opacity = '0.6'; }

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
            if (saveBtn) { saveBtn.disabled = false; saveBtn.style.opacity = ''; }
        }
    });
})();
</script>

<?php include '../includes/footer.php'; ?>
