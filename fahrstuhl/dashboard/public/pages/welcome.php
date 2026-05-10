<?php
require_once __DIR__ . '/../includes/config.php';
requireLogin();

$page_title = 'Welcome';

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

function publishableDashboardImage($value) {
    $raw = trim((string)$value);
    if (preg_match('/^https?:\/\//i', $raw)) {
        return substr($raw, 0, 500);
    }
    return '';
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $guildId) {
    $action = $_POST['action'] ?? 'save';
    if ($action === 'test') {
        $result = api('/guilds/' . urlencode($guildId) . '/welcome/test', 'POST', [
            'type' => $_POST['type'] ?? 'welcome',
        ], 15);
        if (($result['data']['success'] ?? false) === true) {
            $message = 'Test message sent.';
            $operationSuccess = true;
        } else {
            $messageType = 'error';
            $message = $result['data']['message'] ?? 'Sending test message failed.';
            $operationSuccess = false;
        }
    } elseif ($action === 'publish_verification') {
        $result = api('/guilds/' . urlencode($guildId) . '/welcome/verification/publish', 'POST', [
            'verificationTitle' => $_POST['verificationTitle'] ?? '',
            'verificationMessage' => $_POST['verificationMessage'] ?? '',
            'verificationChannelId' => $_POST['verificationChannelId'] ?? '',
            'verificationRoleId' => $_POST['verificationRoleId'] ?? '',
            'verificationHeader' => $_POST['verificationHeader'] ?? '',
            'verificationAvatar' => publishableDashboardImage($_POST['verificationAvatar'] ?? ''),
            'verificationEmoji' => $_POST['verificationEmoji'] ?? '',
            'verificationThumbnail' => publishableDashboardImage($_POST['verificationThumbnail'] ?? ''),
            'verificationFooterIcon' => publishableDashboardImage($_POST['verificationFooterIcon'] ?? ''),
            'verificationFooter' => $_POST['verificationFooter'] ?? '',
            'verificationFields' => $_POST['verificationFields'] ?? '[]',
            'verificationButtonLabel' => $_POST['verificationButtonLabel'] ?? '',
            'verificationButtonEmoji' => $_POST['verificationButtonEmoji'] ?? '',
            'verificationButtonStyle' => $_POST['verificationButtonStyle'] ?? '',
            'verificationCountButtonEnabled' => ($_POST['verificationCountButtonEnabled'] ?? '0') === '1',
            'verificationCountButtonLabel' => $_POST['verificationCountButtonLabel'] ?? '',
            'verificationCount' => $_POST['verificationCount'] ?? 0,
        ], 30);
        if (($result['data']['success'] ?? false) === true) {
            $message = 'Verification channel, role and button published.';
            $operationSuccess = true;
        } else {
            $messageType = 'error';
            $message = $result['data']['message'] ?? ('Publishing verification failed. HTTP status: ' . ($result['status'] ?? 'unknown'));
            $operationSuccess = false;
        }
    } else {
        $result = api('/guilds/' . urlencode($guildId) . '/welcome', 'POST', [
            'welcomeChannelId' => $_POST['welcomeChannelId'] ?? '',
            'goodbyeChannelId' => $_POST['goodbyeChannelId'] ?? '',
            'welcomeEnabled' => isset($_POST['welcomeEnabled']),
            'welcomeMessage' => $_POST['welcomeMessage'] ?? '',
            'welcomeAsEmbed' => isset($_POST['welcomeAsEmbed']),
            'welcomeEmbedHeader' => $_POST['welcomeEmbedHeader'] ?? '',
            'welcomeEmbedAvatar' => $_POST['welcomeEmbedAvatar'] ?? '',
            'welcomeEmbedEmoji' => $_POST['welcomeEmbedEmoji'] ?? '',
            'welcomeEmbedTitle' => $_POST['welcomeEmbedTitle'] ?? '',
            'welcomeEmbedColor' => $_POST['welcomeEmbedColor'] ?? '',
            'welcomeEmbedFooter' => $_POST['welcomeEmbedFooter'] ?? '',
            'welcomeEmbedThumbnail' => $_POST['welcomeEmbedThumbnail'] ?? '',
            'welcomeEmbedImage' => $_POST['welcomeEmbedImage'] ?? '',
            'welcomeEmbedFooterIcon' => $_POST['welcomeEmbedFooterIcon'] ?? '',
            'welcomeEmbedFields' => $_POST['welcomeEmbedFields'] ?? '[]',
            'goodbyeEnabled' => isset($_POST['goodbyeEnabled']),
            'goodbyeMessage' => $_POST['goodbyeMessage'] ?? '',
            'goodbyeAsEmbed' => isset($_POST['goodbyeAsEmbed']),
            'goodbyeEmbedHeader' => $_POST['goodbyeEmbedHeader'] ?? '',
            'goodbyeEmbedAvatar' => $_POST['goodbyeEmbedAvatar'] ?? '',
            'goodbyeEmbedEmoji' => $_POST['goodbyeEmbedEmoji'] ?? '',
            'goodbyeEmbedTitle' => $_POST['goodbyeEmbedTitle'] ?? '',
            'goodbyeEmbedColor' => $_POST['goodbyeEmbedColor'] ?? '',
            'goodbyeEmbedFooter' => $_POST['goodbyeEmbedFooter'] ?? '',
            'goodbyeEmbedThumbnail' => $_POST['goodbyeEmbedThumbnail'] ?? '',
            'goodbyeEmbedImage' => $_POST['goodbyeEmbedImage'] ?? '',
            'goodbyeEmbedFooterIcon' => $_POST['goodbyeEmbedFooterIcon'] ?? '',
            'goodbyeEmbedFields' => $_POST['goodbyeEmbedFields'] ?? '[]',
            'dmEnabled' => isset($_POST['dmEnabled']),
            'dmMessage' => $_POST['dmMessage'] ?? '',
            'dmAsEmbed' => isset($_POST['dmAsEmbed']),
            'dmEmbedHeader' => $_POST['dmEmbedHeader'] ?? '',
            'dmEmbedAvatar' => $_POST['dmEmbedAvatar'] ?? '',
            'dmEmbedEmoji' => $_POST['dmEmbedEmoji'] ?? '',
            'dmEmbedTitle' => $_POST['dmEmbedTitle'] ?? '',
            'dmEmbedColor' => $_POST['dmEmbedColor'] ?? '',
            'dmEmbedFooter' => $_POST['dmEmbedFooter'] ?? '',
            'dmEmbedThumbnail' => $_POST['dmEmbedThumbnail'] ?? '',
            'dmEmbedImage' => $_POST['dmEmbedImage'] ?? '',
            'dmEmbedFooterIcon' => $_POST['dmEmbedFooterIcon'] ?? '',
            'dmEmbedFields' => $_POST['dmEmbedFields'] ?? '[]',
            'autoroleEnabled' => isset($_POST['autoroleEnabled']),
            'autoroleId' => $_POST['autoroleId'] ?? '',
            'aiWelcomeEnabled' => isset($_POST['aiWelcomeEnabled']),
            'aiCharacter' => $_POST['aiCharacter'] ?? 'friendly',
            'verificationEnabled' => isset($_POST['verificationEnabled']),
            'verificationChannelId' => $_POST['verificationChannelId'] ?? '',
            'verificationRoleId' => $_POST['verificationRoleId'] ?? '',
            'verificationHeader' => $_POST['verificationHeader'] ?? '',
            'verificationAvatar' => $_POST['verificationAvatar'] ?? '',
            'verificationTitle' => $_POST['verificationTitle'] ?? '',
            'verificationMessage' => $_POST['verificationMessage'] ?? '',
            'verificationEmoji' => $_POST['verificationEmoji'] ?? '',
            'verificationThumbnail' => $_POST['verificationThumbnail'] ?? '',
            'verificationFooterIcon' => $_POST['verificationFooterIcon'] ?? '',
            'verificationFooter' => $_POST['verificationFooter'] ?? '',
            'verificationFields' => $_POST['verificationFields'] ?? '[]',
            'verificationButtonLabel' => $_POST['verificationButtonLabel'] ?? '',
            'verificationButtonEmoji' => $_POST['verificationButtonEmoji'] ?? '',
            'verificationButtonStyle' => $_POST['verificationButtonStyle'] ?? '',
            'verificationCountButtonEnabled' => ($_POST['verificationCountButtonEnabled'] ?? '0') === '1',
            'verificationCountButtonLabel' => $_POST['verificationCountButtonLabel'] ?? '',
            'verificationCount' => $_POST['verificationCount'] ?? 0,
            'welcomeCardEnabled' => isset($_POST['welcomeCardEnabled']),
            'welcomeCardFont' => $_POST['welcomeCardFont'] ?? 'Inter',
            'welcomeCardTextColor' => $_POST['welcomeCardTextColor'] ?? '#ffffff',
            'welcomeCardBackgroundColor' => $_POST['welcomeCardBackgroundColor'] ?? '#111827',
            'welcomeCardOverlayOpacity' => $_POST['welcomeCardOverlayOpacity'] ?? 75,
            'welcomeCardBackgroundImage' => $_POST['welcomeCardBackgroundImage'] ?? '',
            'welcomeCardTitle' => $_POST['welcomeCardTitle'] ?? '',
            'welcomeCardSubtitle' => $_POST['welcomeCardSubtitle'] ?? '',
            'dmCardEnabled' => isset($_POST['dmCardEnabled']),
            'dmCardTitle' => $_POST['dmCardTitle'] ?? '',
            'dmCardSubtitle' => $_POST['dmCardSubtitle'] ?? '',
        ], 20);
        if (($result['data']['success'] ?? false) === true) {
            $message = 'Welcome settings saved.';
            $operationSuccess = true;
        } else {
            $messageType = 'error';
            $message = $result['data']['message'] ?? 'Saving welcome settings failed.';
            $operationSuccess = false;
        }
    }

    if ($isAjaxRequest) {
        $sendJson([
            'success' => $operationSuccess === true,
            'message' => $message,
            'messageType' => $messageType,
        ], $operationSuccess === true ? 200 : 400);
    }
}

if (!function_exists('welcomeGuildNameById')) {
    function welcomeGuildNameById($guilds, $guildId) {
        foreach ($guilds as $guild) {
            if (($guild['id'] ?? '') === $guildId) {
                return $guild['name'] ?? 'Server';
            }
        }

        return 'Server';
    }
}

$moduleRaw = $guildId ? getAPI('/guilds/' . urlencode($guildId) . '/modules', 10) : null;
$modules = $moduleRaw['data']['modules'] ?? [];
$welcomeModuleEnabled = false;
foreach ($modules as $module) {
    if (($module['key'] ?? '') === 'welcome') {
        $welcomeModuleEnabled = !empty($module['enabled']);
        break;
    }
}

$welcomeRaw = $guildId ? getAPI('/guilds/' . urlencode($guildId) . '/welcome', 10) : null;
$data = $welcomeRaw['data'] ?? [];
$settings = $data['settings'] ?? [];
$channels = $data['channels'] ?? [];
$roles = $data['roles'] ?? [];
$permissions = $data['permissions'] ?? [];
$guildName = $data['guildName'] ?? welcomeGuildNameById($guilds, $guildId);

$welcomeChannelId = $settings['welcomeChannelId'] ?? ($settings['channelId'] ?? '');
$goodbyeChannelId = $settings['goodbyeChannelId'] ?? ($settings['channelId'] ?? '');
$verificationChannelId = $settings['verificationChannelId'] ?? '';
$verificationRoleId = $settings['verificationRoleId'] ?? '';
$autoroleId = $settings['autoroleId'] ?? '';
$activeCount = 0;
foreach (['aiWelcomeEnabled', 'verificationEnabled', 'welcomeEnabled', 'dmEnabled', 'autoroleEnabled', 'goodbyeEnabled'] as $flag) {
    if (!empty($settings[$flag])) $activeCount++;
}

$fonts = ['Inter', 'Roboto', 'Open Sans', 'Google Sans', 'Montserrat', 'Poppins', 'Lato', 'Noto Sans JP', 'Roboto Condensed'];
$characters = [
    'friendly' => 'Friendly Guide',
    'gaming' => 'Gaming Hype',
    'professional' => 'Professional Staff',
    'funny' => 'Funny Chaos',
    'anime' => 'Anime Host',
    'support' => 'Support Agent',
];

function selectedAttr($a, $b) { return (string)$a === (string)$b ? 'selected' : ''; }
function checkedAttr($value) { return !empty($value) ? 'checked' : ''; }
?>

<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.wlc-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(420px, 1fr)); gap:1rem; align-items:start; }
.wlc-card { background:var(--panel); border:1px solid var(--border-light); border-radius:10px; padding:1.25rem; }
.wlc-card-header { display:flex; justify-content:space-between; align-items:center; gap:1rem; margin-bottom:1rem; }
.wlc-card-header h2 { margin:0; font-size:1rem; font-weight:900; display:flex; align-items:center; gap:.5rem; }
.wlc-card-header h2 small { color:var(--text-secondary); font-size:.78rem; font-weight:500; }
.wlc-toggle-row { display:flex; align-items:center; gap:.6rem; }
.wlc-toggle { position:relative; width:46px; height:26px; display:inline-block; flex:0 0 auto; }
.wlc-toggle input { opacity:0; width:0; height:0; }
.wlc-toggle .wlc-slider { position:absolute; cursor:pointer; inset:0; background:#44475a; border-radius:999px; transition:.18s; }
.wlc-toggle .wlc-slider:before { content:''; position:absolute; width:18px; height:18px; left:4px; top:4px; border-radius:50%; background:#c8cce0; transition:.18s; }
.wlc-toggle input:checked + .wlc-slider { background:var(--primary); }
.wlc-toggle input:checked + .wlc-slider:before { transform:translateX(20px); background:#fff; }
.wlc-sep { height:1px; background:var(--border-light); margin:.85rem 0; }
.wlc-field { display:grid; gap:.38rem; margin-bottom:.75rem; }
.wlc-field:last-child { margin-bottom:0; }
.wlc-field label { color:var(--text-secondary); font-size:.78rem; font-weight:800; text-transform:uppercase; letter-spacing:.03em; }
.wlc-field select, .wlc-field input[type="text"], .wlc-field input[type="url"], .wlc-field textarea { width:100%; border:1px solid var(--border-light); border-radius:8px; background:var(--bg-tertiary); color:var(--text-primary); padding:.7rem .8rem; font-size:.9rem; }
.wlc-field textarea { min-height:80px; resize:vertical; }
.wlc-field input[type="color"] { width:44px; height:36px; padding:2px 3px; border-radius:8px; border:1px solid var(--border-light); background:var(--bg-tertiary); cursor:pointer; }
.wlc-field select[name="verificationButtonStyle"] { max-width:180px; }
.wlc-row2 { display:grid; grid-template-columns:1fr 1fr; gap:.75rem; }
.wlc-check-row { display:flex; align-items:center; gap:.55rem; color:var(--text-secondary); font-size:.86rem; margin-bottom:.65rem; }
.wlc-check-row input[type="checkbox"] { width:16px; height:16px; accent-color:var(--primary); }
.wlc-perms { background:var(--bg-tertiary); border:1px solid var(--border-light); border-radius:8px; padding:.65rem .8rem; color:var(--text-secondary); font-size:.82rem; display:flex; gap:1rem; flex-wrap:wrap; }
.wlc-perm-ok { color:#51cf66; }
.wlc-perm-fail { color:#ff6b6b; }
.wlc-action-row { display:flex; gap:.65rem; align-items:center; flex-wrap:wrap; margin-top:.9rem; }
.wlc-action-result { font-size:.84rem; padding:.45rem .7rem; border-radius:6px; display:none; }
.wlc-action-result.success { display:block; background:rgba(81,207,102,.12); color:#51cf66; border:1px solid rgba(81,207,102,.3); }
.wlc-action-result.error { display:block; background:rgba(255,107,107,.12); color:#ff6b6b; border:1px solid rgba(255,107,107,.3); }
.wlc-action-result.info { display:block; background:rgba(88,101,242,.1); color:#b0b8f5; border:1px solid rgba(88,101,242,.25); }
.placeholder-hint { background:var(--bg-tertiary); border:1px solid var(--border-light); border-radius:8px; padding:.75rem; font-size:.8rem; color:var(--text-secondary); display:grid; gap:.3rem; }
.placeholder-hint code { color:var(--primary-light); background:rgba(47,140,255,.12); padding:.1rem .3rem; border-radius:4px; }
@media (max-width:860px) { .wlc-grid { grid-template-columns:1fr; } .wlc-row2 { grid-template-columns:1fr; } }
</style>

<div class="module-page">
    <section class="dashboard-page-header">
        <div class="dashboard-page-copy">
            <span class="dashboard-page-eyebrow">Community Module</span>
            <h1>Welcome</h1>
            <p>Begrüßung, Verification, DM und AutoRole — zentral konfiguriert.</p>
            <div class="dashboard-page-meta">
                <span class="status-badge <?php echo $welcomeModuleEnabled ? 'active' : 'inactive'; ?>"><?php echo $welcomeModuleEnabled ? 'Aktiv' : 'Inaktiv'; ?></span>
                <span class="status-badge <?php echo $activeCount > 0 ? 'success' : 'inactive'; ?>"><?php echo (int)$activeCount; ?> Features aktiv</span>
            </div>
        </div>
        <div class="module-header-actions">
            <form method="GET">
                <select class="module-header-select" name="guildId" onchange="this.form.submit()">
                    <?php foreach ($guilds as $g): ?>
                        <option value="<?php echo esc($g['id']); ?>" <?php echo selectedAttr($guildId, $g['id'] ?? ''); ?>><?php echo esc($g['name']); ?></option>
                    <?php endforeach; ?>
                </select>
            </form>
        </div>
    </section>

    <div id="welcomeFeedback" class="alert alert-<?php echo esc($messageType); ?>" style="display:<?php echo $message ? 'block' : 'none'; ?>; margin-bottom:1rem;"><?php echo esc($message ?: ''); ?></div>

    <?php if (!$welcomeModuleEnabled): ?>
        <div class="empty-state">
            <strong>Welcome-Modul ist deaktiviert</strong>
            <p>Aktiviere zuerst das Modul, dann kannst du alle Features konfigurieren.</p>
            <a class="btn-icon cta btn-primary-ui" href="modules.php?guildId=<?php echo urlencode($guildId); ?>">Modul aktivieren</a>
        </div>
    <?php else: ?>

    <form method="POST" id="welcomeForm">
        <input type="hidden" name="guildId" value="<?php echo esc($guildId); ?>">
        <input type="hidden" name="action" value="save">

        <div class="wlc-grid">

            <!-- AI WELCOME -->
            <div class="wlc-card">
                <div class="wlc-card-header">
                    <h2>🤖 KI-Begrüßung <span class="status-badge success" style="font-size:.68rem;">Neu</span></h2>
                    <label class="wlc-toggle" title="KI-Begrüßung aktivieren">
                        <input type="checkbox" id="aiWelcomeEnabled" name="aiWelcomeEnabled" <?php echo checkedAttr($settings['aiWelcomeEnabled'] ?? false); ?>>
                        <span class="wlc-slider"></span>
                    </label>
                </div>
                <div id="aiWelcomeBody" <?php if (empty($settings['aiWelcomeEnabled'])) echo 'style="display:none"'; ?>>
                <p style="color:var(--text-secondary); font-size:.84rem; margin:0 0 .9rem;">Der Bot wählt automatisch KI-generierte Begrüßungstexte im gewählten Stil.</p>
                <div class="wlc-field">
                    <label>Charakter-Stil</label>
                    <select name="aiCharacter">
                        <?php foreach ($characters as $key => $label): ?>
                            <option value="<?php echo esc($key); ?>" <?php echo selectedAttr($settings['aiCharacter'] ?? 'friendly', $key); ?>><?php echo esc($label); ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="wlc-action-row">
                    <button type="button" class="btn-icon" id="wlcTestJoinBtn"><span class="i">🧪</span> Test Join</button>
                    <div id="wlcTestJoinResult" class="wlc-action-result"></div>
                </div>
                </div><!-- /aiWelcomeBody -->
            </div>

            <!-- WELCOME NACHRICHT -->
            <div class="wlc-card">
                <div class="wlc-card-header">
                    <h2>👋 Willkommensnachricht</h2>
                    <label class="wlc-toggle" title="Willkommensnachricht aktivieren">
                        <input type="checkbox" id="welcomeEnabled" name="welcomeEnabled" <?php echo checkedAttr($settings['welcomeEnabled'] ?? false); ?>>
                        <span class="wlc-slider"></span>
                    </label>
                </div>
                <div id="welcomeBody" <?php if (empty($settings['welcomeEnabled'])) echo 'style="display:none"'; ?>>
                <div class="wlc-field">
                    <label>Kanal</label>
                    <select name="welcomeChannelId">
                        <option value="">— Kanal wählen —</option>
                        <?php foreach ($channels as $channel): ?>
                            <option value="<?php echo esc($channel['id']); ?>" <?php echo selectedAttr($welcomeChannelId, $channel['id'] ?? ''); ?>>#<?php echo esc($channel['name']); ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="wlc-field">
                    <label>Nachrichtentext</label>
                    <textarea name="welcomeMessage" maxlength="2000"><?php echo esc($settings['welcomeMessage'] ?? 'Hey {user}, welcome to **{server}**!'); ?></textarea>
                </div>
                <div class="wlc-sep"></div>
                <div class="wlc-check-row"><input type="checkbox" id="welcomeAsEmbed" name="welcomeAsEmbed" value="1" <?php echo checkedAttr($settings['welcomeAsEmbed'] ?? false); ?>><span>Als Embed senden</span></div>
                <div id="welcomeEmbedFields" class="wlc-embed-fields" <?php if (empty($settings['welcomeAsEmbed'])) echo 'style="display:none"'; ?>>
                <div class="wlc-row2">
                    <div class="wlc-field">
                        <label>Embed Titel</label>
                        <input type="text" name="welcomeEmbedTitle" maxlength="256" value="<?php echo esc($settings['welcomeEmbedTitle'] ?? '{username} just joined'); ?>">
                    </div>
                    <div class="wlc-field">
                        <label>Embed Farbe</label>
                        <input type="color" name="welcomeEmbedColor" value="<?php echo esc($settings['welcomeEmbedColor'] ?? '#51cf66'); ?>">
                    </div>
                </div>
                <div class="wlc-field">
                    <label>Embed Footer</label>
                    <input type="text" name="welcomeEmbedFooter" maxlength="2048" value="<?php echo esc($settings['welcomeEmbedFooter'] ?? ''); ?>">
                </div>
                <div class="wlc-field">
                    <label>Embed Thumbnail URL <small style="font-weight:400;">(optional)</small></label>
                    <input type="url" name="welcomeEmbedThumbnail" maxlength="500" value="<?php echo esc($settings['welcomeEmbedThumbnail'] ?? ''); ?>" placeholder="https://...">
                </div>
                </div>
                <!-- Preserved advanced embed fields (not shown in UI) -->
                <input type="hidden" name="welcomeEmbedHeader" value="<?php echo esc($settings['welcomeEmbedHeader'] ?? ''); ?>">
                <input type="hidden" name="welcomeEmbedAvatar" value="<?php echo esc($settings['welcomeEmbedAvatar'] ?? ''); ?>">
                <input type="hidden" name="welcomeEmbedEmoji" value="<?php echo esc($settings['welcomeEmbedEmoji'] ?? ''); ?>">
                <input type="hidden" name="welcomeEmbedImage" value="<?php echo esc($settings['welcomeEmbedImage'] ?? ''); ?>">
                <input type="hidden" name="welcomeEmbedFooterIcon" value="<?php echo esc($settings['welcomeEmbedFooterIcon'] ?? ''); ?>">
                <input type="hidden" name="welcomeEmbedFields" value="<?php echo esc($settings['welcomeEmbedFields'] ?? '[]'); ?>">
                <div class="wlc-sep"></div>
                <div class="wlc-check-row"><input type="checkbox" name="welcomeCardEnabled" <?php echo checkedAttr($settings['welcomeCardEnabled'] ?? false); ?>><span>Willkommenskarte senden</span></div>
                <div class="wlc-row2">
                    <div class="wlc-field">
                        <label>Card Titel</label>
                        <input type="text" name="welcomeCardTitle" maxlength="128" value="<?php echo esc($settings['welcomeCardTitle'] ?? '{username} just joined'); ?>">
                    </div>
                    <div class="wlc-field">
                        <label>Card Untertitel</label>
                        <input type="text" name="welcomeCardSubtitle" maxlength="128" value="<?php echo esc($settings['welcomeCardSubtitle'] ?? 'Member #{memberCount}'); ?>">
                    </div>
                </div>
                <div class="wlc-field">
                    <label>Card Hintergrundbild URL</label>
                    <input type="url" name="welcomeCardBackgroundImage" maxlength="500" value="<?php echo esc($settings['welcomeCardBackgroundImage'] ?? ''); ?>" placeholder="https://...">
                </div>
                <input type="hidden" name="welcomeCardFont" value="<?php echo esc($settings['welcomeCardFont'] ?? 'Inter'); ?>">
                <input type="hidden" name="welcomeCardTextColor" value="<?php echo esc($settings['welcomeCardTextColor'] ?? '#ffffff'); ?>">
                <input type="hidden" name="welcomeCardBackgroundColor" value="<?php echo esc($settings['welcomeCardBackgroundColor'] ?? '#111827'); ?>">
                <input type="hidden" name="welcomeCardOverlayOpacity" value="<?php echo esc($settings['welcomeCardOverlayOpacity'] ?? 75); ?>">
                </div><!-- /welcomeBody -->
            </div>

            <!-- DM -->
            <div class="wlc-card">
                <div class="wlc-card-header">
                    <h2>💬 Direkt-Nachricht (DM)</h2>
                    <label class="wlc-toggle" title="DM aktivieren">
                        <input type="checkbox" id="dmEnabled" name="dmEnabled" <?php echo checkedAttr($settings['dmEnabled'] ?? false); ?>>
                        <span class="wlc-slider"></span>
                    </label>
                </div>
                <div id="dmBody" <?php if (empty($settings['dmEnabled'])) echo 'style="display:none"'; ?>>
                <div class="wlc-field">
                    <label>DM Nachrichtentext</label>
                    <textarea name="dmMessage" maxlength="2000"><?php echo esc($settings['dmMessage'] ?? 'Have a great time here in **{server}**'); ?></textarea>
                </div>
                <div class="wlc-sep"></div>
                <div class="wlc-check-row"><input type="checkbox" id="dmAsEmbed" name="dmAsEmbed" <?php echo checkedAttr($settings['dmAsEmbed'] ?? false); ?>><span>Als Embed senden</span></div>
                <div id="dmEmbedFields" class="wlc-embed-fields" <?php if (empty($settings['dmAsEmbed'])) echo 'style="display:none"'; ?>>
                <div class="wlc-row2">
                    <div class="wlc-field">
                        <label>Embed Titel</label>
                        <input type="text" name="dmEmbedTitle" maxlength="256" value="<?php echo esc($settings['dmEmbedTitle'] ?? 'Welcome to {server}'); ?>">
                    </div>
                    <div class="wlc-field">
                        <label>Embed Farbe</label>
                        <input type="color" name="dmEmbedColor" value="<?php echo esc($settings['dmEmbedColor'] ?? '#51cf66'); ?>">
                    </div>
                </div>
                <div class="wlc-field">
                    <label>Embed Footer</label>
                    <input type="text" name="dmEmbedFooter" maxlength="2048" value="<?php echo esc($settings['dmEmbedFooter'] ?? ''); ?>">
                </div>
                </div>
                <input type="hidden" name="dmEmbedHeader" value="<?php echo esc($settings['dmEmbedHeader'] ?? ''); ?>">
                <input type="hidden" name="dmEmbedAvatar" value="<?php echo esc($settings['dmEmbedAvatar'] ?? ''); ?>">
                <input type="hidden" name="dmEmbedEmoji" value="<?php echo esc($settings['dmEmbedEmoji'] ?? ''); ?>">
                <input type="hidden" name="dmEmbedThumbnail" value="<?php echo esc($settings['dmEmbedThumbnail'] ?? ''); ?>">
                <input type="hidden" name="dmEmbedImage" value="<?php echo esc($settings['dmEmbedImage'] ?? ''); ?>">
                <input type="hidden" name="dmEmbedFooterIcon" value="<?php echo esc($settings['dmEmbedFooterIcon'] ?? ''); ?>">
                <input type="hidden" name="dmEmbedFields" value="<?php echo esc($settings['dmEmbedFields'] ?? '[]'); ?>">
                <div class="wlc-sep"></div>
                <div class="wlc-check-row"><input type="checkbox" name="dmCardEnabled" <?php echo checkedAttr($settings['dmCardEnabled'] ?? false); ?>><span>DM-Willkommenskarte senden</span></div>
                <div class="wlc-row2">
                    <div class="wlc-field">
                        <label>Card Titel</label>
                        <input type="text" name="dmCardTitle" maxlength="128" value="<?php echo esc($settings['dmCardTitle'] ?? 'Welcome to {server}'); ?>">
                    </div>
                    <div class="wlc-field">
                        <label>Card Untertitel</label>
                        <input type="text" name="dmCardSubtitle" maxlength="128" value="<?php echo esc($settings['dmCardSubtitle'] ?? "You're member #{memberCount}"); ?>">
                    </div>
                </div>
                </div><!-- /dmBody -->
            </div>

            <!-- GOODBYE -->
            <div class="wlc-card">
                <div class="wlc-card-header">
                    <h2>👋 Goodbye-Nachricht</h2>
                    <label class="wlc-toggle" title="Goodbye aktivieren">
                        <input type="checkbox" id="goodbyeEnabled" name="goodbyeEnabled" <?php echo checkedAttr($settings['goodbyeEnabled'] ?? false); ?>>
                        <span class="wlc-slider"></span>
                    </label>
                </div>
                <div id="goodbyeBody" <?php if (empty($settings['goodbyeEnabled'])) echo 'style="display:none"'; ?>>
                <div class="wlc-field">
                    <label>Kanal</label>
                    <select name="goodbyeChannelId">
                        <option value="">— Kanal wählen —</option>
                        <?php foreach ($channels as $channel): ?>
                            <option value="<?php echo esc($channel['id']); ?>" <?php echo selectedAttr($goodbyeChannelId, $channel['id'] ?? ''); ?>>#<?php echo esc($channel['name']); ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="wlc-field">
                    <label>Nachrichtentext</label>
                    <textarea name="goodbyeMessage" maxlength="2000"><?php echo esc($settings['goodbyeMessage'] ?? '**{username}** just left the server'); ?></textarea>
                </div>
                <div class="wlc-sep"></div>
                <div class="wlc-check-row"><input type="checkbox" id="goodbyeAsEmbed" name="goodbyeAsEmbed" <?php echo checkedAttr($settings['goodbyeAsEmbed'] ?? false); ?>><span>Als Embed senden</span></div>
                <div id="goodbyeEmbedFields" class="wlc-embed-fields" <?php if (empty($settings['goodbyeAsEmbed'])) echo 'style="display:none"'; ?>>
                <div class="wlc-row2">
                    <div class="wlc-field">
                        <label>Embed Titel</label>
                        <input type="text" name="goodbyeEmbedTitle" maxlength="256" value="<?php echo esc($settings['goodbyeEmbedTitle'] ?? '{username} left {server}'); ?>">
                    </div>
                    <div class="wlc-field">
                        <label>Embed Farbe</label>
                        <input type="color" name="goodbyeEmbedColor" value="<?php echo esc($settings['goodbyeEmbedColor'] ?? '#ff6b6b'); ?>">
                    </div>
                </div>
                <div class="wlc-field">
                    <label>Embed Footer</label>
                    <input type="text" name="goodbyeEmbedFooter" maxlength="2048" value="<?php echo esc($settings['goodbyeEmbedFooter'] ?? ''); ?>">
                </div>
                </div>
                <input type="hidden" name="goodbyeEmbedHeader" value="<?php echo esc($settings['goodbyeEmbedHeader'] ?? ''); ?>">
                <input type="hidden" name="goodbyeEmbedAvatar" value="<?php echo esc($settings['goodbyeEmbedAvatar'] ?? ''); ?>">
                <input type="hidden" name="goodbyeEmbedEmoji" value="<?php echo esc($settings['goodbyeEmbedEmoji'] ?? ''); ?>">
                <input type="hidden" name="goodbyeEmbedThumbnail" value="<?php echo esc($settings['goodbyeEmbedThumbnail'] ?? ''); ?>">
                <input type="hidden" name="goodbyeEmbedImage" value="<?php echo esc($settings['goodbyeEmbedImage'] ?? ''); ?>">
                <input type="hidden" name="goodbyeEmbedFooterIcon" value="<?php echo esc($settings['goodbyeEmbedFooterIcon'] ?? ''); ?>">
                <input type="hidden" name="goodbyeEmbedFields" value="<?php echo esc($settings['goodbyeEmbedFields'] ?? '[]'); ?>">
                <div class="wlc-action-row">
                    <button type="button" class="btn-icon" id="wlcTestLeaveBtn"><span class="i">🧪</span> Test Leave</button>
                    <div id="wlcTestLeaveResult" class="wlc-action-result"></div>
                </div>
                </div><!-- /goodbyeBody -->
            </div>

            <!-- AUTOROLE -->
            <div class="wlc-card">
                <div class="wlc-card-header">
                    <h2>🏷️ Auto-Role</h2>
                    <label class="wlc-toggle" title="Auto-Role aktivieren">
                        <input type="checkbox" id="autoroleEnabled" name="autoroleEnabled" <?php echo checkedAttr($settings['autoroleEnabled'] ?? false); ?>>
                        <span class="wlc-slider"></span>
                    </label>
                </div>
                <div id="autoroleBody" <?php if (empty($settings['autoroleEnabled'])) echo 'style="display:none"'; ?>>
                <p style="color:var(--text-secondary); font-size:.84rem; margin:0 0 .9rem;">Wenn Verification aktiv ist, wird die Rolle nach dem Verifizieren vergeben — sonst direkt beim Beitritt.</p>
                <div class="wlc-field">
                    <label>Rolle vergeben</label>
                    <select name="autoroleId">
                        <option value="">— Rolle wählen —</option>
                        <?php foreach ($roles as $role): ?>
                            <option value="<?php echo esc($role['id']); ?>" <?php echo selectedAttr($autoroleId, $role['id'] ?? ''); ?>><?php echo esc($role['name']); ?><?php echo empty($role['assignable']) ? ' ⚠️' : ''; ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="wlc-perms">
                    <span class="<?php echo !empty($permissions['manageRoles']) ? 'wlc-perm-ok' : 'wlc-perm-fail'; ?>">
                        <?php echo !empty($permissions['manageRoles']) ? '✅' : '❌'; ?> Manage Roles
                    </span>
                    <span class="<?php echo !empty($permissions['sendMessages']) ? 'wlc-perm-ok' : 'wlc-perm-fail'; ?>">
                        <?php echo !empty($permissions['sendMessages']) ? '✅' : '❌'; ?> Send Messages
                    </span>
                </div>
                </div><!-- /autoroleBody -->
            </div>

            <!-- VERIFICATION -->
            <div class="wlc-card" style="grid-column: 1 / -1;">
                <div class="wlc-card-header">
                    <h2>🔒 Verification <small>— Kanal, Rolle und Embed für neue Mitglieder</small></h2>
                    <label class="wlc-toggle" title="Verification aktivieren">
                        <input type="checkbox" id="verificationEnabled" name="verificationEnabled" <?php echo checkedAttr($settings['verificationEnabled'] ?? false); ?>>
                        <span class="wlc-slider"></span>
                    </label>
                </div>
                <div id="verificationBody" <?php if (empty($settings['verificationEnabled'])) echo 'style="display:none"'; ?>>
                <?php if (!empty($settings['verificationPublishedAt'])): ?>
                <div class="alert alert-success" style="margin-bottom:.9rem; font-size:.84rem;">✅ Verification wurde bereits veröffentlicht.</div>
                <?php endif; ?>
                <div class="wlc-grid" style="gap:.75rem;">
                    <div>
                        <div class="wlc-row2">
                            <div class="wlc-field">
                                <label>Kanal <small style="font-weight:400;">(leer = auto-erstellen)</small></label>
                                <select name="verificationChannelId">
                                    <option value="">Erstelle einen für mich</option>
                                    <?php foreach ($channels as $channel): ?>
                                        <option value="<?php echo esc($channel['id']); ?>" <?php echo selectedAttr($verificationChannelId, $channel['id'] ?? ''); ?>>#<?php echo esc($channel['name']); ?></option>
                                    <?php endforeach; ?>
                                </select>
                            </div>
                            <div class="wlc-field">
                                <label>Rolle <small style="font-weight:400;">(leer = auto-erstellen)</small></label>
                                <select name="verificationRoleId">
                                    <option value="">Erstelle eine für mich</option>
                                    <?php foreach ($roles as $role): ?>
                                        <option value="<?php echo esc($role['id']); ?>" <?php echo selectedAttr($verificationRoleId, $role['id'] ?? ''); ?>><?php echo esc($role['name']); ?><?php echo empty($role['assignable']) ? ' ⚠️' : ''; ?></option>
                                    <?php endforeach; ?>
                                </select>
                            </div>
                        </div>
                        <div class="wlc-field">
                            <label>Embed Titel</label>
                            <input type="text" name="verificationTitle" maxlength="256" value="<?php echo esc($settings['verificationTitle'] ?? 'Verifizierung'); ?>">
                        </div>
                        <div class="wlc-field">
                            <label>Embed Nachricht</label>
                            <textarea name="verificationMessage" maxlength="2000"><?php echo esc($settings['verificationMessage'] ?? "Um diesen Server zu betreten und alle Kanäle zu sehen, musst du zuerst beweisen, dass du ein Mensch bist.\n\nKlicke auf den Button unten, um zu starten."); ?></textarea>
                        </div>
                        <div class="wlc-row2">
                            <div class="wlc-field">
                                <label>Embed Footer</label>
                                <input type="text" name="verificationFooter" maxlength="2048" value="<?php echo esc($settings['verificationFooter'] ?? ''); ?>">
                            </div>
                            <div class="wlc-field">
                                <label>Embed Farbe</label>
                                <input type="color" name="verificationEmbedColor" value="<?php echo esc($settings['verificationEmbedColor'] ?? '#3b82f6'); ?>">
                            </div>
                        </div>
                    </div>
                    <div>
                        <div class="wlc-row2">
                            <div class="wlc-field">
                                <label>Button-Text</label>
                                <input type="text" name="verificationButtonLabel" maxlength="80" value="<?php echo esc($settings['verificationButtonLabel'] ?? 'Verifizieren'); ?>">
                            </div>
                            <div class="wlc-field">
                                <label>Button-Stil</label>
                                <select name="verificationButtonStyle">
                                    <?php foreach (['success' => 'Grün (success)', 'primary' => 'Blau (primary)', 'secondary' => 'Grau (secondary)', 'danger' => 'Rot (danger)'] as $val => $lbl): ?>
                                        <option value="<?php echo esc($val); ?>" <?php echo selectedAttr($settings['verificationButtonStyle'] ?? 'success', $val); ?>><?php echo esc($lbl); ?></option>
                                    <?php endforeach; ?>
                                </select>
                            </div>
                        </div>
                        <div class="wlc-field">
                            <label>Zähler-Button-Label <small style="font-weight:400;">({count} = Zahl)</small></label>
                            <input type="text" name="verificationCountButtonLabel" maxlength="80" value="<?php echo esc($settings['verificationCountButtonLabel'] ?? 'Verifiziert: {count}'); ?>">
                        </div>
                        <div class="wlc-check-row">
                            <input type="hidden" name="verificationCountButtonEnabled" value="0">
                            <input type="checkbox" name="verificationCountButtonEnabled" id="verificationCountButtonEnabled" value="1" <?php echo checkedAttr($settings['verificationCountButtonEnabled'] ?? false); ?>>
                            <label for="verificationCountButtonEnabled">Zähler-Button anzeigen</label>
                        </div>
                        <div class="placeholder-hint">
                            <strong style="color:var(--text-primary);">Embed Platzhalter</strong>
                            <span><code>{user}</code> Mention · <code>{username}</code> Name · <code>{server}</code> Server · <code>{memberCount}</code> Anzahl</span>
                        </div>
                        <!-- Preserved advanced fields -->
                        <input type="hidden" name="verificationHeader" value="<?php echo esc($settings['verificationHeader'] ?? ''); ?>">
                        <input type="hidden" name="verificationAvatar" value="<?php echo esc($settings['verificationAvatar'] ?? ''); ?>">
                        <input type="hidden" name="verificationEmoji" value="<?php echo esc($settings['verificationEmoji'] ?? ''); ?>">
                        <input type="hidden" name="verificationThumbnail" value="<?php echo esc($settings['verificationThumbnail'] ?? ''); ?>">
                        <input type="hidden" name="verificationFooterIcon" value="<?php echo esc($settings['verificationFooterIcon'] ?? ''); ?>">
                        <input type="hidden" name="verificationFields" value="<?php echo esc($settings['verificationFields'] ?? '[]'); ?>">
                        <input type="hidden" name="verificationCount" value="<?php echo esc((string)($settings['verificationCount'] ?? 0)); ?>">
                    </div>
                </div>
                <div class="wlc-action-row" style="margin-top:1rem;">
                    <button type="button" class="btn-icon btn-primary-ui" id="wlcPublishVerifyBtn"><span class="i">🚀</span> Veröffentlichen</button>
                    <span style="color:var(--text-secondary); font-size:.82rem;">Erstellt Kanal + Rolle falls nötig und postet das Embed mit Button.</span>
                    <div id="wlcPublishResult" class="wlc-action-result"></div>
                </div>
                </div><!-- /verificationBody -->
            </div>

        </div><!-- .wlc-grid -->

        <div class="ux-savebar" id="wlcSaveBar">
            <div class="ux-save-info">
                <strong>Ungespeicherte Änderungen</strong>
                <span>Alle Felder werden per AJAX gespeichert.</span>
            </div>
            <div class="ux-save-actions">
                <span class="ux-save-status" id="wlcSaveStatus">Bereit</span>
                <button type="submit" class="btn-icon btn-primary-ui"><span class="i">💾</span> Speichern</button>
            </div>
        </div>
    </form>

    <div class="wlc-card" style="margin-top:1rem;">
        <h2 style="font-size:1rem; font-weight:900; margin:0 0 .85rem; display:flex; align-items:center; gap:.5rem;">📋 Platzhalter</h2>
        <div class="placeholder-hint">
            <span><code>{user}</code> Mention · <code>{username}</code> Nur Name · <code>{user.idname}</code> Name#0</span>
            <span><code>{server}</code> / <code>{server.name}</code> Servername · <code>{memberCount}</code> / <code>{server.member_count}</code> Mitgliederzahl</span>
        </div>
    </div>

    <?php endif; ?>
</div>

<script>
(function () {
    const form = document.getElementById('welcomeForm');
    const saveBar = document.getElementById('wlcSaveBar');
    const saveStatus = document.getElementById('wlcSaveStatus');
    if (!form) return;

    let initialState = new URLSearchParams(new FormData(form)).toString();
    let allowUnload = false;

    function currentState() {
        return new URLSearchParams(new FormData(form)).toString();
    }

    function isDirty() {
        return currentState() !== initialState;
    }

    function syncSaveBar() {
        saveBar?.classList.toggle('is-visible', isDirty());
    }

    function setStatus(text, type = '') {
        if (!saveStatus) return;
        saveStatus.textContent = text;
        saveStatus.className = 'ux-save-status' + (type ? ' ' + type : '');
    }

    form.addEventListener('input', syncSaveBar);
    form.addEventListener('change', syncSaveBar);

    window.addEventListener('beforeunload', (event) => {
        if (allowUnload || !isDirty()) return;
        event.preventDefault();
        event.returnValue = '';
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        setStatus('Speichert...');

        try {
            const data = new FormData(form);
            data.set('action', 'save');
            const response = await fetch(window.location.href, {
                method: 'POST',
                headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' },
                body: data,
                credentials: 'same-origin',
            });
            const json = await response.json().catch(() => ({ success: false, message: 'Ungültige Serverantwort.' }));
            if (!response.ok || !json.success) throw new Error(json.message || 'Speichern fehlgeschlagen.');

            initialState = currentState();
            allowUnload = false;
            syncSaveBar();
            setStatus('Gespeichert ✓', 'success');
            showFeedback(json.message || 'Gespeichert.', 'success');
        } catch (err) {
            setStatus('Fehler', 'error');
            showFeedback(err.message || 'Speichern fehlgeschlagen.', 'error');
        }
    });

    function showFeedback(msg, type) {
        const el = document.getElementById('welcomeFeedback');
        if (!el) return;
        el.className = 'alert alert-' + (type === 'error' ? 'error' : 'success');
        el.textContent = msg;
        el.style.display = 'block';
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        setTimeout(() => { el.style.display = 'none'; }, 6000);
    }

    function setActionResult(id, msg, type) {
        const el = document.getElementById(id);
        if (!el) return;
        el.className = 'wlc-action-result ' + type;
        el.textContent = msg;
    }

    async function doAction(action, payload, resultId, btnId, loadingText) {
        const btn = document.getElementById(btnId);
        const origHtml = btn?.innerHTML;
        if (btn) { btn.disabled = true; btn.innerHTML = `<span class="i">⏳</span> ${loadingText}`; }
        setActionResult(resultId, loadingText + '...', 'info');

        try {
            const data = new FormData(form);
            data.set('action', action);
            if (payload) Object.entries(payload).forEach(([k, v]) => data.set(k, v));

            const response = await fetch(window.location.href, {
                method: 'POST',
                headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' },
                body: data,
                credentials: 'same-origin',
            });
            const json = await response.json().catch(() => ({ success: false, message: 'Ungültige Serverantwort.' }));
            if (!json.success) throw new Error(json.message || 'Fehlgeschlagen.');
            setActionResult(resultId, '✅ ' + (json.message || 'Erfolgreich!'), 'success');
        } catch (err) {
            setActionResult(resultId, '❌ ' + (err.message || 'Fehler.'), 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = origHtml || ''; }
        }
    }

    document.getElementById('wlcTestJoinBtn')?.addEventListener('click', () => {
        doAction('test', { type: 'welcome' }, 'wlcTestJoinResult', 'wlcTestJoinBtn', 'Sende Test');
    });

    document.getElementById('wlcTestLeaveBtn')?.addEventListener('click', () => {
        doAction('test', { type: 'goodbye' }, 'wlcTestLeaveResult', 'wlcTestLeaveBtn', 'Sende Test');
    });

    document.getElementById('wlcPublishVerifyBtn')?.addEventListener('click', () => {
        doAction('publish_verification', {}, 'wlcPublishResult', 'wlcPublishVerifyBtn', 'Veröffentliche');
    });

    // Module body toggle (main enable/disable)
    [['aiWelcomeEnabled', 'aiWelcomeBody'], ['welcomeEnabled', 'welcomeBody'], ['dmEnabled', 'dmBody'], ['goodbyeEnabled', 'goodbyeBody'], ['autoroleEnabled', 'autoroleBody'], ['verificationEnabled', 'verificationBody']].forEach(([cbId, divId]) => {
        const cb = document.getElementById(cbId);
        const div = document.getElementById(divId);
        if (!cb || !div) return;
        cb.addEventListener('change', () => { div.style.display = cb.checked ? '' : 'none'; });
    });

    // Embed fields toggle
    [['welcomeAsEmbed', 'welcomeEmbedFields'], ['dmAsEmbed', 'dmEmbedFields'], ['goodbyeAsEmbed', 'goodbyeEmbedFields']].forEach(([cbId, divId]) => {
        const cb = document.getElementById(cbId);
        const div = document.getElementById(divId);
        if (!cb || !div) return;
        cb.addEventListener('change', () => { div.style.display = cb.checked ? '' : 'none'; });
    });
})();
</script>

<?php include '../includes/footer.php'; ?>
