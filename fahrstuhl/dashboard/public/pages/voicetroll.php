<?php
$page_title = 'Voice Troll';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();

// Ajax: proxy guild+channel list
if (isset($_GET['ajax']) && $_GET['ajax'] === 'guilds') {
    header('Content-Type: application/json');
    echo json_encode(getAPI('/voice/guilds'));
    exit;
}

// Ajax: proxy TTS say
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'say') {
    header('Content-Type: application/json');
    $text = trim($_POST['text'] ?? '');
    if (strlen($text) === 0) {
        echo json_encode(['success' => false, 'message' => 'Kein Text eingegeben.']);
        exit;
    }
    if (strlen($text) > 300) {
        echo json_encode(['success' => false, 'message' => 'Text zu lang – max. 300 Zeichen (' . strlen($text) . ' eingegeben).']);
        exit;
    }
    // Use longer timeout for TTS (generation + playback can take >10s)
    $result = api('/voice/say', 'POST', [
        'guildId'   => $_POST['guildId']   ?? '',
        'channelId' => $_POST['channelId'] ?? '',
        'text'      => $text,
        'lang'      => $_POST['lang']      ?? 'de',
    ], 60);
    echo json_encode($result['data'] ?? ['success' => false, 'message' => $result['error'] ?? 'Bot-API nicht erreichbar']);
    exit;
}
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<div class="page-header">
    <h1>🔊 Voice Troll</h1>
    <p class="subtitle">Bot spricht Text in einem Voice-Channel — nur für Entwickler</p>
</div>

<div style="max-width:680px;">

<!-- Warning banner -->
<div style="background:#ED424518; border:1px solid #ED424555; border-radius:8px; padding:12px 18px; margin-bottom:22px; color:#ED4245; font-size:0.9em;">
    ⚠️ <strong>Dev-Only.</strong> Dieser Bereich ist nicht für normale User sichtbar.
    Stelle sicher dass <code>ffmpeg</code> und <code>gtts</code> auf dem Server installiert sind.
</div>

<!-- Form card -->
<div class="section" style="padding:24px 28px;">
    <h2 style="margin-top:0; margin-bottom:20px;">🎤 Text sprechen lassen</h2>

    <!-- Guild selector -->
    <div style="margin-bottom:16px;">
        <label style="display:block; color:#aaa; font-size:0.85em; margin-bottom:6px;">Server</label>
        <select id="guildSelect" onchange="loadChannels()"
            style="width:100%; padding:10px 12px; border-radius:7px; border:1px solid #333; background:#1a1a2e; color:#e0e0e0; font-size:0.95em;">
            <option value="">— Server laden...</option>
        </select>
    </div>

    <!-- Channel selector -->
    <div style="margin-bottom:16px;">
        <label style="display:block; color:#aaa; font-size:0.85em; margin-bottom:6px;">Voice-Channel</label>
        <select id="channelSelect"
            style="width:100%; padding:10px 12px; border-radius:7px; border:1px solid #333; background:#1a1a2e; color:#e0e0e0; font-size:0.95em;">
            <option value="">— zuerst Server wählen</option>
        </select>
    </div>

    <!-- Language selector -->
    <div style="margin-bottom:16px;">
        <label style="display:block; color:#aaa; font-size:0.85em; margin-bottom:6px;">Sprache</label>
        <select id="langSelect"
            style="width:100%; padding:10px 12px; border-radius:7px; border:1px solid #333; background:#1a1a2e; color:#e0e0e0; font-size:0.95em;">
            <option value="de" selected>🇩🇪 Deutsch</option>
            <option value="en">🇬🇧 Englisch</option>
            <option value="fr">🇫🇷 Französisch</option>
            <option value="es">🇪🇸 Spanisch</option>
            <option value="it">🇮🇹 Italienisch</option>
            <option value="ru">🇷🇺 Russisch</option>
            <option value="ja">🇯🇵 Japanisch</option>
        </select>
    </div>

    <!-- Text input -->
    <div style="margin-bottom:20px;">
        <label style="display:block; color:#aaa; font-size:0.85em; margin-bottom:6px;">
            Text <span id="charCount" style="float:right; color:#555;">0 / 300</span>
        </label>
        <textarea id="ttsText" maxlength="300" rows="4" oninput="updateCount()"
            placeholder="Was soll der Bot sagen?"
            style="width:100%; padding:10px 12px; border-radius:7px; border:1px solid #333; background:#1a1a2e; color:#e0e0e0;
                   font-size:0.95em; resize:vertical; box-sizing:border-box;"></textarea>
    </div>

    <!-- Quick phrases -->
    <div style="margin-bottom:20px;">
        <div style="color:#aaa; font-size:0.8em; margin-bottom:8px;">Schnellauswahl:</div>
        <div style="display:flex; flex-wrap:wrap; gap:7px;">
            <?php
            $phrases = [
                'Hallo, ich bin euer Fahrstuhl-Bot.',
                'Achtung, Achtung! Alle bitte den Channel verlassen.',
                'Du kommst hier nicht raus.',
                'Ich sehe dich.',
                'Error 404: Entkommen nicht möglich.',
                'Guten Abend, meine Damen und Herren.',
                'Bitte anschnallen, die Fahrt beginnt.',
                'Dieser Channel wird in 10 Sekunden gesperrt.',
            ];
            foreach ($phrases as $p): ?>
            <button onclick="setPhrase(<?php echo htmlspecialchars(json_encode($p), ENT_QUOTES); ?>)"
                style="background:#1a1a2e; border:1px solid #333; border-radius:5px; color:#aaa;
                       padding:5px 10px; font-size:0.78em; cursor:pointer; white-space:nowrap;">
                <?php echo htmlspecialchars($p); ?>
            </button>
            <?php endforeach; ?>
        </div>
    </div>

    <!-- Submit -->
    <button id="sayBtn" onclick="sendTTS()"
        style="width:100%; padding:12px; background:#5865F2; color:#fff; border:none; border-radius:7px;
               font-size:1em; font-weight:600; cursor:pointer; transition:background 0.2s;">
        🔊 Abspielen
    </button>

    <!-- Status -->
    <div id="statusBox" style="display:none; margin-top:16px; padding:12px 16px; border-radius:7px; font-size:0.9em;"></div>
</div>

<!-- History -->
<div class="section" style="padding:20px 28px; margin-top:18px;">
    <h2 style="margin-top:0; font-size:1em; color:#aaa;">📜 Verlauf dieser Sitzung</h2>
    <div id="history" style="font-size:0.82em; color:#666;">Noch nichts abgespielt.</div>
</div>

</div>

<script>
const DASHBOARD_CSRF_TOKEN = '<?php echo esc(dashboardCsrfToken()); ?>';

let guildsData = [];
const history = [];

// Load guilds on page load
fetch('?ajax=guilds')
    .then(r => r.json())
    .then(data => {
        guildsData = data?.data?.guilds ?? [];
        const sel = document.getElementById('guildSelect');
        sel.innerHTML = '<option value="">— Server wählen</option>';
        guildsData.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.id;
            opt.textContent = g.name;
            sel.appendChild(opt);
        });
        if (guildsData.length === 1) {
            sel.value = guildsData[0].id;
            loadChannels();
        }
    })
    .catch(() => {
        document.getElementById('guildSelect').innerHTML = '<option value="">⚠️ API nicht erreichbar</option>';
    });

function loadChannels() {
    const guildId = document.getElementById('guildSelect').value;
    const guild   = guildsData.find(g => g.id === guildId);
    const cSel    = document.getElementById('channelSelect');
    cSel.innerHTML = '';

    if (!guild || !guild.voiceChannels.length) {
        cSel.innerHTML = '<option value="">Keine Voice-Channels</option>';
        return;
    }

    guild.voiceChannels.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `🔊 ${c.name}${c.members > 0 ? ` (${c.members} online)` : ''}`;
        cSel.appendChild(opt);
    });
}

function updateCount() {
    const len = document.getElementById('ttsText').value.length;
    document.getElementById('charCount').textContent = `${len} / 300`;
    document.getElementById('charCount').style.color = len > 250 ? '#ED4245' : '#555';
}

function setPhrase(text) {
    document.getElementById('ttsText').value = text;
    updateCount();
}

async function sendTTS() {
    const guildId   = document.getElementById('guildSelect').value;
    const channelId = document.getElementById('channelSelect').value;
    const text      = document.getElementById('ttsText').value.trim();
    const lang      = document.getElementById('langSelect').value;
    const btn       = document.getElementById('sayBtn');
    const statusBox = document.getElementById('statusBox');

    if (!guildId || !channelId || !text) {
        showStatus('error', '⚠️ Bitte Server, Channel und Text ausfüllen.');
        return;
    }

    btn.disabled = true;
    btn.textContent = '⏳ Wird abgespielt...';
    showStatus('info', '⏳ Bot tritt Channel bei und spricht...');

    const form = new FormData();
    form.append('action',    'say');
    form.append('guildId',   guildId);
    form.append('channelId', channelId);
    form.append('text',      text);
    form.append('lang',      lang);
    form.append('csrf_token', DASHBOARD_CSRF_TOKEN);

    try {
        const r = await fetch('', { method: 'POST', body: form });
        const d = await r.json();

        if (d?.success) {
            showStatus('success', `✅ Erfolgreich abgespielt in <strong>${d.data?.channel ?? channelId}</strong>!`);
            addHistory(text, d.data?.guild, d.data?.channel, lang, true);
        } else {
            const msg = d?.message ?? 'Unbekannter Fehler';
            showStatus('error', `❌ Fehler: ${msg}`);
            addHistory(text, '?', '?', lang, false, msg);
        }
    } catch (e) {
        showStatus('error', '❌ Netzwerkfehler – ist die API erreichbar?');
    }

    btn.disabled = false;
    btn.textContent = '🔊 Abspielen';
}

function showStatus(type, msg) {
    const box = document.getElementById('statusBox');
    const colors = { success: ['#57F28722', '#57F287'], error: ['#ED424522', '#ED4245'], info: ['#5865F222', '#7289da'] };
    const [bg, color] = colors[type] || colors.info;
    box.style.display = 'block';
    box.style.background = bg;
    box.style.border = `1px solid ${color}44`;
    box.style.color = color;
    box.innerHTML = msg;
}

function addHistory(text, guild, channel, lang, ok, err = '') {
    const time = new Date().toLocaleTimeString('de-DE');
    history.unshift({ text, guild, channel, lang, ok, err, time });
    const el = document.getElementById('history');
    el.innerHTML = history.slice(0, 20).map(h => `
        <div style="padding:7px 0; border-bottom:1px solid #1a1a2e; display:flex; gap:10px; align-items:flex-start;">
            <span style="flex-shrink:0; color:${h.ok ? '#57F287' : '#ED4245'};">${h.ok ? '✅' : '❌'}</span>
            <div style="flex:1; min-width:0;">
                <span style="color:#e0e0e0;">"${h.text}"</span>
                <span style="color:#555; margin-left:8px;">${h.guild} / #${h.channel} [${h.lang}]</span>
                ${h.err ? `<span style="color:#ED4245; margin-left:6px; font-size:0.9em;">${h.err}</span>` : ''}
            </div>
            <span style="flex-shrink:0; color:#444;">${h.time}</span>
        </div>
    `).join('');
}
</script>

<?php include '../includes/footer.php'; ?>
