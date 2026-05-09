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
.welcome-page { display:flex; flex-direction:column; gap:1rem; padding:0 0 5rem; min-height:calc(100vh - 72px); background:transparent; }
.welcome-top { display:flex; justify-content:space-between; gap:1rem; align-items:flex-start; margin-bottom:.65rem; }
.welcome-title h1 { margin:0; font-size:1.45rem; letter-spacing:0; color:#f7f8ff; }
.welcome-title p { margin:.9rem 0 0; color:#a7acc1; font-size:.98rem; }
.guild-switch { display:flex; gap:.6rem; align-items:center; flex-wrap:wrap; }
.guild-switch form { display:block; }
.guild-switch select { padding:.55rem .7rem; border-radius:8px; background:#1f222c; color:#f7f8ff; border:1px solid #3b4154; min-width:220px; }
.master-pill { display:inline-flex; align-items:center; gap:.55rem; font-weight:800; color:#f7f8ff; margin-top:.25rem; }
.master-pill span { display:inline-flex; align-items:center; border-radius:999px; background:#2f8cff; color:#fff; padding:.38rem .72rem; font-size:.78rem; line-height:1; }
.master-pill span:after { content:''; width:20px; height:20px; border-radius:50%; background:#eef2ff; margin-left:.46rem; box-shadow:inset 0 0 0 5px #2f8cff; }
.toggle { position:relative; width:56px; height:30px; display:inline-block; flex:0 0 auto; }
.toggle input { opacity:0; width:0; height:0; }
.slider { position:absolute; cursor:pointer; inset:0; background:#68708a; border-radius:999px; transition:.2s; }
.slider:before { content:''; position:absolute; width:22px; height:22px; left:4px; top:4px; border-radius:50%; background:#eef2ff; transition:.2s; }
.toggle input:checked + .slider { background:#2f8cff; }
.toggle input:checked + .slider:before { transform:translateX(26px); }
.alert { padding:12px 14px; border-radius:8px; border-left:4px solid; }
.alert-success { background:rgba(81,207,102,.12); color:#51cf66; border-color:#51cf66; }
.alert-error { background:rgba(255,107,107,.12); color:#ff6b6b; border-color:#ff6b6b; }
.w-quickstart { display:grid; grid-template-columns:1fr auto; gap:1rem; align-items:center; background:linear-gradient(120deg, rgba(88,101,242,.18), rgba(47,140,255,.14)); border:1px solid rgba(88,101,242,.35); border-radius:10px; padding:.9rem 1rem; }
.w-quickstart h3 { margin:0; font-size:.96rem; }
.w-quickstart p { margin:.35rem 0 0; font-size:.84rem; color:#b7bdd0; }
.w-quick-actions { display:flex; gap:.55rem; flex-wrap:wrap; justify-content:flex-end; }
.welcome-shell { display:grid; grid-template-columns:minmax(0,1fr); gap:1rem; align-items:start; }
.welcome-main { display:flex; flex-direction:column; gap:.95rem; max-width:none; }
.w-accordion { background:#1f222c; border:0; border-radius:8px; overflow:hidden; box-shadow:0 1px 0 rgba(255,255,255,.015), 0 12px 28px rgba(0,0,0,.08); }
.w-accordion.featured { border:2px solid transparent; background:linear-gradient(#1f222c,#1f222c) padding-box, linear-gradient(100deg,#a868ff,#ffd0bd) border-box; box-shadow:none; }
.w-head { width:100%; min-height:76px; border:0; background:transparent; color:#f7f8ff; display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:0 1.45rem; cursor:pointer; text-align:left; }
.w-head-title { display:flex; gap:.7rem; align-items:center; font-weight:900; font-size:1.04rem; line-height:1.25; }
.w-head-sub { display:none; margin-top:.25rem; color:#a7acc1; font-size:.82rem; font-weight:500; }
.w-accordion.open .w-head-sub { display:block; }
.badge-new { display:inline-flex; align-items:center; border-radius:999px; padding:.18rem .5rem; background:rgba(81,207,102,.16); color:#51cf66; font-size:.72rem; font-weight:900; }
.w-body { display:none; border-top:1px solid var(--border-light); padding:1.1rem 1.25rem 1.25rem; }
.w-accordion.open .w-body { display:block; }
.w-grid { display:grid; grid-template-columns:1fr 1fr; gap:1rem; }
.w-field { display:grid; gap:.38rem; margin-bottom:.8rem; }
.w-field label { color:var(--text-secondary); font-size:.78rem; font-weight:800; }
.w-field select, .w-field input[type="text"], .w-field input[type="url"], .w-field textarea { width:100%; border:1px solid var(--border-light); border-radius:8px; background:var(--bg-tertiary); color:var(--text-primary); padding:.72rem .8rem; }
.w-field textarea { min-height:96px; resize:vertical; }
.w-field input[type="color"] { width:48px; height:38px; padding:2px; border-radius:8px; border:1px solid var(--border-light); background:var(--bg-tertiary); }
.field-row { display:flex; gap:.7rem; align-items:center; flex-wrap:wrap; }
.subtle { color:var(--text-secondary); font-size:.84rem; line-height:1.45; }
.step-list { display:grid; gap:.8rem; max-width:640px; }
.step-list strong { display:block; margin-bottom:.25rem; }
.verification-stage { padding-top:.7rem; }
.verify-label { font-weight:900; margin:0 0 1rem; }
.verify-preview { max-width:560px; display:flex; gap:.75rem; align-items:flex-start; margin:0 0 1.25rem; }
.bot-avatar { width:36px; height:36px; border-radius:50%; display:grid; place-items:center; background:#5bd5ff; color:#111827; font-weight:900; flex:0 0 auto; }
.bot-meta { display:flex; align-items:center; gap:.35rem; color:var(--text-secondary); font-size:.78rem; font-weight:800; margin-bottom:.35rem; }
.bot-tag { background:#5865f2; color:#fff; border-radius:3px; padding:.05rem .28rem; font-size:.68rem; }
.discord-embed-wrap { position:relative; display:inline-block; }
.discord-embed { background:#15171d; border-left:4px solid #3b82f6; border-radius:6px; padding:1rem; min-width:280px; max-width:460px; position:relative; transition:.16s; }
.discord-embed-wrap:hover:not(.is-editing) .discord-embed { filter:blur(1.2px); }
.embed-edit-overlay { position:absolute; inset:0; display:grid; place-items:center; opacity:0; pointer-events:none; color:#fff; font-size:3rem; transition:.16s; }
.discord-embed-wrap:hover:not(.is-editing) .embed-edit-overlay { opacity:1; }
.discord-embed h3 { margin:0 0 .55rem; font-size:1rem; }
.discord-embed p { white-space:pre-line; color:#d6d9e1; margin:0; line-height:1.45; }
.discord-embed [contenteditable="true"] { outline:0; border-radius:4px; }
.discord-embed.editing [contenteditable="true"]:focus { background:rgba(47,140,255,.28); box-shadow:0 0 0 2px rgba(47,140,255,.38); }
.discord-embed-wrap:not(.is-editing) .embed-tool,
.discord-embed-wrap:not(.is-editing) .embed-top-actions,
.discord-embed-wrap:not(.is-editing) .embed-drop,
.discord-embed-wrap:not(.is-editing) .btn-secondary,
.discord-embed-wrap:not(.is-editing) .embed-thumbnail:not(.filled) { display:none !important; }
.discord-embed-wrap:not(.is-editing) .embed-tools { margin:0; min-height:0; }
.discord-embed-wrap:not(.is-editing) .embed-header-text:empty,
.discord-embed-wrap:not(.is-editing) .embed-footer-text:empty { display:none; }
.embed-tools { display:flex; gap:.5rem; margin:.55rem 0 .75rem; color:#9aa3b5; align-items:center; }
.embed-tool { width:34px; height:34px; border-radius:8px; border:1px dashed #596177; display:grid; place-items:center; background:#15171d; cursor:pointer; }
.embed-tool.filled { border-style:solid; background-size:cover; background-position:center; color:transparent; }
.embed-header-text, .embed-footer-text { min-width:90px; padding:.25rem .35rem; border-radius:4px; }
.embed-header-text:empty:before, .embed-footer-text:empty:before { content:attr(data-placeholder); color:#8b94a7; }
.embed-top-actions { margin-left:auto; display:flex; gap:.4rem; position:relative; }
.embed-emoji-menu { position:absolute; top:42px; right:44px; display:none; grid-template-columns:repeat(6, 32px); gap:.35rem; padding:.55rem; border-radius:8px; border:1px solid var(--border-light); background:#101219; box-shadow:0 16px 34px rgba(0,0,0,.35); z-index:4; }
.embed-emoji-menu.open { display:grid; }
.embed-emoji-menu button { width:32px; height:32px; border:0; border-radius:6px; background:#1f2230; cursor:pointer; font-size:1rem; }
.embed-thumbnail { width:80px; height:80px; border:1px dashed #596177; border-radius:8px; display:grid; place-items:center; color:#8b94a7; background:#171922; background-size:cover; background-position:center; cursor:pointer; flex:0 0 auto; }
.embed-content-row { display:flex; gap:1rem; align-items:flex-start; }
.embed-copy { min-width:0; flex:1; }
.embed-fields { display:grid; gap:.5rem; margin:.6rem 0; }
.embed-field { border:1px dashed #4c5368; border-radius:8px; padding:.55rem; display:grid; gap:.4rem; }
.embed-field-head { display:flex; justify-content:space-between; gap:.5rem; align-items:center; }
.embed-field-name { font-weight:900; }
.embed-field-value { color:#d6d9e1; white-space:pre-line; }
.embed-field-name:empty:before { content:'Name des Fields'; color:#8b94a7; }
.embed-field-value:empty:before { content:'Feldwert'; color:#8b94a7; }
.embed-field-remove { border:0; background:#2a2d39; color:#d6d9e1; border-radius:6px; padding:.25rem .45rem; cursor:pointer; }
.embed-drop { margin-top:.9rem; border:1px dashed #596177; min-height:118px; border-radius:8px; display:grid; place-items:center; color:#8b94a7; }
.advanced-settings { margin:.8rem 0 1.25rem; }
.advanced-settings summary { cursor:pointer; color:var(--text-primary); font-weight:900; display:inline-flex; align-items:center; gap:.55rem; }
.advanced-settings summary:after { content:'⌄'; color:#9aa3b5; font-size:.95rem; }
.advanced-settings[open] summary:after { content:'⌃'; }
.advanced-inner { margin-top:1rem; border-top:1px solid var(--border-light); padding-top:1rem; }
.verify-button-row { display:flex; align-items:center; gap:.5rem; flex-wrap:wrap; margin-top:.6rem; }
.verify-button { display:inline-flex; align-items:center; gap:.35rem; padding:.65rem 1rem; border-radius:8px; background:var(--verify-button-bg,#3ecf8e); color:#fff; font-weight:900; cursor:pointer; border:0; position:relative; }
.verify-button.is-success { color:#07140f; }
.verify-button:hover:after { content:'✎'; position:absolute; inset:0; display:grid; place-items:center; border-radius:8px; background:rgba(47,140,255,.86); color:#fff; font-size:1.1rem; }
.verify-count-button { cursor:default; background:#2a2f3d; color:#d7dbea; }
.verify-count-button[hidden] { display:none; }
.verify-count-button:hover:after { content:none; }
.verify-button-editor { display:none; margin:.45rem 0 1.1rem; padding-left:1rem; border-left:2px solid #4b5368; gap:.55rem; align-items:end; flex-wrap:wrap; }
.verify-button-editor.open { display:flex; }
.button-edit-field { display:grid; gap:.35rem; position:relative; }
.button-edit-field label { color:#8f96aa; font-size:.78rem; font-weight:800; }
.button-edit-field input { border:0; border-radius:8px; background:#151821; color:#f7f8ff; padding:.72rem .85rem; min-width:210px; font-weight:800; }
.button-emoji-trigger { width:48px; height:48px; border:0; border-radius:8px; background:#151821; color:#f7f8ff; font-size:1.05rem; cursor:pointer; }
.button-color-row { display:flex; gap:.7rem; align-items:center; height:48px; background:#151821; border-radius:8px; padding:0 .9rem; }
.button-style-dot { width:18px; height:18px; border-radius:50%; border:0; cursor:pointer; box-shadow:0 0 0 0 rgba(255,255,255,.35); }
.button-style-dot.active { box-shadow:0 0 0 3px rgba(255,255,255,.24); }
.button-style-dot[data-style="primary"] { background:#5865f2; }
.button-style-dot[data-style="secondary"] { background:#6b7280; }
.button-style-dot[data-style="success"] { background:#3ecf8e; }
.button-style-dot[data-style="danger"] { background:#ff4d4f; }
.count-button-toggle { display:flex; align-items:center; gap:.45rem; min-height:42px; color:#d7dbea; font-size:.85rem; font-weight:800; }
.count-button-toggle input { width:18px; height:18px; accent-color:#2f8cff; }
.button-emoji-picker { position:absolute; left:0; top:calc(100% + .5rem); display:none; grid-template-columns:52px 1fr; width:444px; max-width:calc(100vw - 2rem); height:378px; border-radius:8px; background:#242734; box-shadow:0 20px 50px rgba(0,0,0,.42); overflow:hidden; z-index:30; }
.button-emoji-picker.open { display:grid; }
.emoji-rail { background:#171a23; padding:.7rem .45rem; display:grid; align-content:start; gap:.45rem; }
.emoji-rail button { width:38px; height:38px; border:0; border-radius:8px; background:transparent; color:#b9bfd0; font-size:1.15rem; cursor:pointer; }
.emoji-rail button.active, .emoji-rail button:hover { background:#2f3342; color:#fff; }
.emoji-main { min-width:0; padding:.9rem; display:grid; grid-template-rows:auto auto 1fr; gap:.7rem; }
.emoji-search-row { display:grid; grid-template-columns:1fr auto; gap:.65rem; align-items:center; }
.emoji-search-row input { width:100%; border:0; border-radius:6px; background:#151821; color:#f7f8ff; padding:.72rem .85rem; }
.emoji-clear { border:0; border-radius:6px; background:#151821; color:#f7f8ff; width:40px; height:40px; cursor:pointer; }
.emoji-section-title { color:#a7acc1; font-size:.78rem; font-weight:900; text-transform:uppercase; display:flex; align-items:center; gap:.35rem; }
.emoji-grid-large { overflow:auto; display:grid; grid-template-columns:repeat(9, 1fr); align-content:start; gap:.18rem; padding-right:.25rem; }
.emoji-grid-large button { border:0; border-radius:6px; background:transparent; height:38px; font-size:1.55rem; cursor:pointer; }
.emoji-grid-large button:hover { background:#343849; }
.card-studio { display:grid; grid-template-columns:300px 1fr; gap:1rem; align-items:start; }
.welcome-card-preview { aspect-ratio:2.55/1; border-radius:6px; overflow:hidden; position:relative; background:var(--card-bg,#111827); min-height:118px; display:grid; place-items:center; color:var(--card-text,#fff); }
.welcome-card-preview:before { content:''; position:absolute; inset:0; background-image:var(--card-image); background-size:cover; background-position:center; opacity:.55; }
.welcome-card-preview:after { content:''; position:absolute; inset:0; background:rgba(0,0,0,var(--card-overlay,.75)); }
.card-inner { position:relative; z-index:1; display:grid; place-items:center; text-align:center; gap:.25rem; font-family:var(--card-font,Inter), sans-serif; padding:1rem; }
.card-avatar { width:62px; height:62px; border-radius:50%; border:3px solid rgba(255,255,255,.8); background:url('https://cdn.discordapp.com/embed/avatars/0.png') center/cover; }
.card-title { font-weight:900; }
.card-subtitle { font-size:.84rem; opacity:.9; }
.swatches { display:flex; gap:.45rem; flex-wrap:wrap; }
.swatch { width:20px; height:20px; border-radius:50%; border:2px solid rgba(255,255,255,.25); cursor:pointer; }
.role-row { display:grid; grid-template-columns:1fr auto; gap:.7rem; align-items:end; }
.role-hint { border:1px solid var(--border-light); border-radius:8px; padding:.75rem; color:var(--text-secondary); }
.monet-banner { background:linear-gradient(110deg,#c874ff,#ff7bd5,#ffd56a); color:#111827; border-radius:8px; padding:1.25rem; display:flex; justify-content:space-between; gap:1rem; align-items:center; margin-top:.8rem; overflow:hidden; }
.monet-banner strong { display:block; font-size:1.05rem; max-width:430px; }
.preview-side { display:flex; flex-direction:column; gap:.9rem; position:sticky; top:96px; }
.preview-panel { background:var(--panel); border:1px solid var(--border-light); border-radius:8px; padding:1rem; box-shadow:0 10px 30px rgba(0,0,0,.22); }
.preview-tabs { display:flex; background:var(--bg-tertiary); border-radius:8px; padding:.25rem; margin-bottom:.8rem; }
.preview-tabs button { flex:1; border:0; background:transparent; color:var(--text-secondary); padding:.55rem; border-radius:6px; cursor:pointer; font-weight:800; }
.preview-tabs button.active { background:var(--panel); color:var(--text-primary); }
.message-preview { background:#15171d; border-radius:8px; padding:1rem; color:#d6d9e1; min-height:96px; white-space:pre-line; }
.placeholder-grid { display:grid; gap:.35rem; font-size:.82rem; }
.placeholder-grid code { color:var(--primary-light); }
.save-bar { position:sticky; left:auto; right:auto; bottom:0.75rem; background:#11131a; border:1px solid var(--border-light); border-radius:8px; padding:.9rem 1rem; display:none; justify-content:space-between; align-items:center; gap:1rem; z-index:20; box-shadow:0 20px 50px rgba(0,0,0,.35); }
.save-bar.dirty { display:flex; }
.save-actions { display:flex; gap:.7rem; }
.btn-secondary { background:var(--bg-tertiary); color:var(--text-primary); border:1px solid var(--border-light); padding:.65rem 1rem; border-radius:8px; text-decoration:none; cursor:pointer; font-weight:800; }
.btn-primary { padding:.65rem 1rem; border-radius:8px; border:0; cursor:pointer; font-weight:900; }
@media (min-width:1150px) { .welcome-shell { grid-template-columns:minmax(0,1fr) 320px; } }
@media (max-width:1149px) { .welcome-shell { grid-template-columns:1fr; } .preview-side { position:static; } .card-studio { grid-template-columns:1fr; } .save-bar { left:1rem; } }
@media (max-width:720px) { .welcome-top, .save-bar, .monet-banner, .w-quickstart { flex-direction:column; align-items:stretch; } .w-grid, .role-row { grid-template-columns:1fr; } .w-quick-actions { justify-content:flex-start; } }
</style>

<div class="welcome-page module-page">
    <section class="dashboard-page-header">
        <div class="dashboard-page-copy">
            <span class="dashboard-page-eyebrow">Community Module</span>
            <h1>Welcome</h1>
            <p>Begruessung, Verification und DM-Flow in einer zentralen Konfiguration.</p>
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
            <span class="master-pill">Aktiv <span><?php echo $welcomeModuleEnabled ? 'ON' : 'OFF'; ?></span></span>
        </div>
    </section>

    <div id="welcomeFeedback" class="alert alert-<?php echo esc($messageType); ?>" style="display:<?php echo $message ? 'block' : 'none'; ?>;"><?php echo esc($message ?: ''); ?></div>

    <section class="w-quickstart">
        <div>
            <h3>⚡ MEE6 Quick Setup</h3>
            <p>1) Welcome aktivieren, 2) Kanal waehlen, 3) Preset laden, 4) Test schicken. In unter 1 Minute startklar.</p>
        </div>
        <div class="w-quick-actions">
            <button type="button" class="btn-secondary" data-welcome-preset="friendly">Preset Friendly</button>
            <button type="button" class="btn-secondary" data-welcome-preset="clean">Preset Clean</button>
            <button type="button" class="btn-secondary" onclick="testWelcome('welcome')">Test Join</button>
        </div>
    </section>

    <?php if (!$welcomeModuleEnabled): ?>
        <div class="empty-state">
            <strong>Welcome-Modul ist deaktiviert</strong>
            <p>Aktiviere zuerst das Modul, dann kannst du Begruessung, Verification, DM und Goodbye zentral steuern.</p>
            <a class="btn-icon cta btn-primary-ui" href="modules.php?guildId=<?php echo urlencode($guildId); ?>">Modul aktivieren</a>
        </div>
    <?php else: ?>
    <form method="POST" id="welcomeForm">
        <input type="hidden" name="guildId" value="<?php echo esc($guildId); ?>">
        <input type="hidden" name="action" value="save" id="formAction">

        <div class="welcome-shell">
            <div class="welcome-main">
                <section class="w-accordion featured open">
                    <button class="w-head" type="button">
                        <span class="w-head-title">Begrüße Mitglieder mit Nachrichten von KI-Charakteren <span class="badge-new">Neu!</span><span class="w-head-sub">Wähle Tonfall und Charakter, damit jede Begrüßung lebendiger wirkt.</span></span>
                        <label class="toggle" onclick="event.stopPropagation()"><input type="checkbox" name="aiWelcomeEnabled" <?php echo checkedAttr($settings['aiWelcomeEnabled'] ?? false); ?>><span class="slider"></span></label>
                    </button>
                    <div class="w-body">
                        <div class="step-list">
                            <div><strong>1. Finde oder erstelle einen KI-Charakter</strong><span class="subtle">Wähle einen Stil, der zu deinem Server passt.</span></div>
                            <div><strong>2. Füge den KI-Charakter zu deinem Server hinzu</strong><span class="subtle">Fahrstuhl nutzt ihn als Tonfall für neue Welcome-Texte.</span></div>
                            <div><strong>3. Aktiviere "Neue Mitglieder begrüßen"</strong><span class="subtle">Danach kann der Charakter in Join-Nachrichten eingesetzt werden.</span></div>
                        </div>
                        <div class="w-field" style="max-width:360px;margin-top:1rem;">
                            <label>AI Character</label>
                            <select name="aiCharacter">
                                <?php foreach ($characters as $key => $label): ?>
                                    <option value="<?php echo esc($key); ?>" <?php echo selectedAttr($settings['aiCharacter'] ?? 'friendly', $key); ?>><?php echo esc($label); ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                    </div>
                </section>

                <section class="w-accordion <?php echo !empty($settings['verificationEnabled']) ? 'open' : ''; ?>">
                    <button class="w-head" type="button">
                        <span class="w-head-title">Verwende ein Captcha, um zu überprüfen, dass neue Mitglieder Menschen sind<span class="w-head-sub">Erstellt Kanal, Rolle, Embed und Button für neue Mitglieder.</span></span>
                        <label class="toggle" onclick="event.stopPropagation()"><input type="checkbox" name="verificationEnabled" <?php echo checkedAttr($settings['verificationEnabled'] ?? false); ?>><span class="slider"></span></label>
                    </button>
                    <div class="w-body">
                        <input type="hidden" name="verificationTitle" id="verificationTitle" value="<?php echo esc($settings['verificationTitle'] ?? 'Verifizierung'); ?>">
                        <textarea name="verificationMessage" id="verificationMessage" style="display:none;"><?php echo esc($settings['verificationMessage'] ?? "Um diesen Server zu betreten und alle Kanäle zu sehen, musst du zuerst beweisen, dass du ein Mensch bist.\n\nKlicke auf den Button unten, um zu starten."); ?></textarea>
                        <input type="hidden" name="verificationHeader" id="verificationHeader" value="<?php echo esc($settings['verificationHeader'] ?? 'Header'); ?>">
                        <input type="hidden" name="verificationAvatar" id="verificationAvatar" value="<?php echo esc($settings['verificationAvatar'] ?? ''); ?>">
                        <input type="hidden" name="verificationEmoji" id="verificationEmoji" value="<?php echo esc($settings['verificationEmoji'] ?? ''); ?>">
                        <input type="hidden" name="verificationThumbnail" id="verificationThumbnail" value="<?php echo esc($settings['verificationThumbnail'] ?? ''); ?>">
                        <input type="hidden" name="verificationFooterIcon" id="verificationFooterIcon" value="<?php echo esc($settings['verificationFooterIcon'] ?? ''); ?>">
                        <input type="hidden" name="verificationFooter" id="verificationFooter" value="<?php echo esc($settings['verificationFooter'] ?? 'Footer'); ?>">
                        <input type="hidden" name="verificationFields" id="verificationFields" value="<?php echo esc($settings['verificationFields'] ?? '[]'); ?>">
                        <input type="hidden" name="verificationButtonEmoji" id="verificationButtonEmoji" value="<?php echo esc($settings['verificationButtonEmoji'] ?? ''); ?>">
                        <input type="hidden" name="verificationButtonStyle" id="verificationButtonStyle" value="<?php echo esc($settings['verificationButtonStyle'] ?? 'success'); ?>">
                        <input type="hidden" name="verificationCountButtonEnabled" value="0">
                        <input type="hidden" name="verificationCount" id="verificationCount" value="<?php echo esc((string)($settings['verificationCount'] ?? 0)); ?>">
                        <input type="file" id="verificationAvatarFile" accept="image/*" hidden>
                        <input type="file" id="verificationThumbnailFile" accept="image/*" hidden>
                        <input type="file" id="verificationFooterIconFile" accept="image/*" hidden>

                        <div class="verification-stage">
                            <div class="verify-label">Verifizierungsnachricht</div>
                            <div class="verify-preview">
                                <div class="bot-avatar">F</div>
                                <div>
                                    <div class="bot-meta"><strong>MEE6</strong><span class="bot-tag">BOT</span><span>Today at 09:40</span></div>
                                    <div class="discord-embed-wrap" id="verifyEditWrap" title="Zum Bearbeiten klicken">
                                        <div class="discord-embed" id="verifyEmbedCard">
                                            <div class="embed-tools">
                                                <button type="button" class="embed-tool" id="avatarUploadButton" title="Avatarbild hochladen">◉</button>
                                                <span class="embed-header-text" id="verifyPreviewHeader" contenteditable="true" spellcheck="false" data-placeholder="Header"></span>
                                                <div class="embed-top-actions">
                                                    <button type="button" class="embed-tool" id="emojiButton" title="Emoji hinzufügen">☻</button>
                                                    <button type="button" class="embed-tool" title="Link">⌁</button>
                                                    <div class="embed-emoji-menu" id="emojiMenu" aria-label="Emoji auswählen">
                                                        <?php foreach (['😀','👋','✅','🔒','🚀','⭐','🎉','💎','🔥','🛡️','🤖','❤️'] as $emoji): ?>
                                                            <button type="button" data-emoji="<?php echo esc($emoji); ?>"><?php echo esc($emoji); ?></button>
                                                        <?php endforeach; ?>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="embed-content-row">
                                                <div class="embed-copy">
                                                    <h3 id="verifyPreviewTitle" contenteditable="true" spellcheck="false"></h3>
                                                    <p id="verifyPreviewText" contenteditable="true" spellcheck="false"></p>
                                                    <div class="embed-fields" id="verificationFieldsList"></div>
                                                </div>
                                                <button type="button" class="embed-thumbnail" id="thumbnailUploadButton" title="Thumbnail Bild hochladen">◌</button>
                                            </div>
                                            <button type="button" id="addVerificationField" class="btn-secondary" style="background:transparent;border:0;color:#2f8cff;padding:.5rem 0;">+ Add new field</button>
                                            <div class="embed-drop" title="Einbettungs-Bild hochladen">◌</div>
                                            <div class="embed-tools">
                                                <button type="button" class="embed-tool" id="footerIconUploadButton" title="Footer Icon hochladen">◉</button>
                                                <span class="embed-footer-text" id="verifyPreviewFooter" contenteditable="true" spellcheck="false" data-placeholder="Footer"></span>
                                            </div>
                                        </div>
                                        <div class="embed-edit-overlay">✎</div>
                                    </div>
                                    <div class="verify-button-row">
                                        <button type="button" class="verify-button" id="verificationButtonPreview"></button>
                                        <button type="button" class="verify-button verify-count-button" id="verificationCountButtonPreview" disabled hidden></button>
                                    </div>
                                    <div class="verify-button-editor">
                                        <label class="count-button-toggle">
                                            <input type="checkbox" name="verificationCountButtonEnabled" id="verificationCountButtonEnabled" value="1" <?php echo checkedAttr($settings['verificationCountButtonEnabled'] ?? false); ?>>
                                            Zähler-Button anzeigen
                                        </label>
                                        <div class="button-edit-field">
                                            <label>Emoji</label>
                                            <button type="button" class="button-emoji-trigger" id="verificationButtonEmojiButton">⊕</button>
                                            <div class="button-emoji-picker" id="verificationButtonEmojiMenu" aria-label="Button Emoji auswählen">
                                                <div class="emoji-rail">
                                                    <button type="button" class="active" data-emoji-category="people">☺</button>
                                                    <button type="button" data-emoji-category="nature">☄</button>
                                                    <button type="button" data-emoji-category="objects">▯</button>
                                                    <button type="button" data-emoji-category="symbols">❤</button>
                                                </div>
                                                <div class="emoji-main">
                                                    <div class="emoji-search-row">
                                                        <input id="verificationButtonEmojiSearch" type="text" placeholder="happy, heart, monkey...">
                                                        <button type="button" class="emoji-clear" data-emoji="">×</button>
                                                    </div>
                                                    <div class="emoji-section-title" id="verificationButtonEmojiTitle">☺ PEOPLE</div>
                                                    <div class="emoji-grid-large" id="verificationButtonEmojiGrid"></div>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="button-edit-field">
                                            <label>Buttonname</label>
                                            <input name="verificationButtonLabel" id="verificationButtonLabel" maxlength="80" value="<?php echo esc($settings['verificationButtonLabel'] ?? 'Verifizieren'); ?>">
                                        </div>
                                        <div class="button-edit-field">
                                            <label>Zählertext</label>
                                            <input name="verificationCountButtonLabel" id="verificationCountButtonLabel" maxlength="80" value="<?php echo esc($settings['verificationCountButtonLabel'] ?? 'Verifiziert: {count}'); ?>">
                                        </div>
                                        <div class="button-edit-field">
                                            <label>Startzahl</label>
                                            <input type="number" min="0" max="999999999" step="1" id="verificationCountInput" value="<?php echo esc((string)($settings['verificationCount'] ?? 0)); ?>">
                                        </div>
                                        <div class="button-edit-field">
                                            <label>Color</label>
                                            <div class="button-color-row">
                                                <?php foreach (['primary','secondary','success','danger'] as $style): ?>
                                                    <button type="button" class="button-style-dot" data-style="<?php echo esc($style); ?>" title="<?php echo esc($style); ?>"></button>
                                                <?php endforeach; ?>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <details class="advanced-settings">
                            <summary>Erweiterte Einstellungen</summary>
                            <div class="advanced-inner">
                                <div class="w-grid">
                                    <div class="w-field">
                                        <label>Verifizierungsnachricht Kanal</label>
                                        <select name="verificationChannelId">
                                            <option value="">Erstelle einen für mich</option>
                                            <?php foreach ($channels as $channel): ?>
                                                <option value="<?php echo esc($channel['id']); ?>" <?php echo selectedAttr($verificationChannelId, $channel['id'] ?? ''); ?>>#<?php echo esc($channel['name']); ?></option>
                                            <?php endforeach; ?>
                                        </select>
                                    </div>
                                    <div class="w-field">
                                        <label>Verifizierungsrolle</label>
                                        <select name="verificationRoleId">
                                            <option value="">Erstelle eine für mich</option>
                                            <?php foreach ($roles as $role): ?>
                                                <option value="<?php echo esc($role['id']); ?>" <?php echo selectedAttr($verificationRoleId, $role['id'] ?? ''); ?>><?php echo esc($role['name']); ?><?php echo empty($role['assignable']) ? ' (nicht zuweisbar)' : ''; ?></option>
                                            <?php endforeach; ?>
                                        </select>
                                    </div>
                                    <div class="w-field">
                                        <label>Bot Permissions</label>
                                        <div class="role-hint"><?php echo !empty($permissions['manageRoles']) ? 'Manage Roles OK' : 'Manage Roles fehlt'; ?> · <?php echo !empty($permissions['sendMessages']) ? 'Send Messages OK' : 'Send Messages fehlt'; ?></div>
                                    </div>
                                </div>
                            </div>
                        </details>

                        <div class="field-row">
                            <button class="btn-primary" type="submit" onclick="document.getElementById('formAction').value='publish_verification'">Veröffentlichen</button>
                            <span class="subtle">Was passiert jetzt? Fahrstuhl erstellt bei Bedarf Kanal und Rolle und postet die Verifizierungsnachricht mit Button.</span>
                        </div>
                    </div>
                </section>

                <section class="w-accordion <?php echo !empty($settings['welcomeEnabled']) ? 'open' : ''; ?>">
                    <button class="w-head" type="button">
                        <span class="w-head-title">Eine Nachricht senden, wenn ein Benutzer dem Server beitritt<span class="w-head-sub">Channel-Message, Embed und Willkommenskarte mit Live-Preview.</span></span>
                        <label class="toggle" onclick="event.stopPropagation()"><input type="checkbox" name="welcomeEnabled" <?php echo checkedAttr($settings['welcomeEnabled'] ?? false); ?>><span class="slider"></span></label>
                    </button>
                    <div class="w-body">
                        <div class="w-field">
                            <label>Kanal für Willkommensnachrichten *</label>
                            <select name="welcomeChannelId">
                                <option value="">Wähle einen Kanal</option>
                                <?php foreach ($channels as $channel): ?>
                                    <option value="<?php echo esc($channel['id']); ?>" <?php echo selectedAttr($welcomeChannelId, $channel['id'] ?? ''); ?>>#<?php echo esc($channel['name']); ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <div class="w-field">
                            <label>Willkommensnachricht</label>
                            <textarea name="welcomeMessage" id="welcomeMessage" maxlength="2000"><?php echo esc($settings['welcomeMessage'] ?? 'Hey {user}, welcome to **{server}**!'); ?></textarea>
                        </div>
                        <label class="field-row subtle"><input type="checkbox" name="welcomeAsEmbed" value="1" <?php echo checkedAttr($settings['welcomeAsEmbed'] ?? false); ?>> Nachricht einbetten</label>
                        <input type="hidden" name="welcomeEmbedHeader" id="welcomeEmbedHeader" value="<?php echo esc($settings['welcomeEmbedHeader'] ?? 'Header'); ?>">
                        <input type="hidden" name="welcomeEmbedAvatar" id="welcomeEmbedAvatar" value="<?php echo esc($settings['welcomeEmbedAvatar'] ?? ''); ?>">
                        <input type="hidden" name="welcomeEmbedEmoji" id="welcomeEmbedEmoji" value="<?php echo esc($settings['welcomeEmbedEmoji'] ?? ''); ?>">
                        <input type="hidden" name="welcomeEmbedTitle" id="welcomeEmbedTitle" value="<?php echo esc($settings['welcomeEmbedTitle'] ?? '{username} just joined the server'); ?>">
                        <input type="hidden" name="welcomeEmbedThumbnail" id="welcomeEmbedThumbnail" value="<?php echo esc($settings['welcomeEmbedThumbnail'] ?? ''); ?>">
                        <input type="hidden" name="welcomeEmbedImage" id="welcomeEmbedImage" value="<?php echo esc($settings['welcomeEmbedImage'] ?? ''); ?>">
                        <input type="hidden" name="welcomeEmbedFooterIcon" id="welcomeEmbedFooterIcon" value="<?php echo esc($settings['welcomeEmbedFooterIcon'] ?? ''); ?>">
                        <input type="hidden" name="welcomeEmbedFooter" id="welcomeEmbedFooter" value="<?php echo esc($settings['welcomeEmbedFooter'] ?? ''); ?>">
                        <input type="hidden" name="welcomeEmbedFields" id="welcomeEmbedFields" value="<?php echo esc($settings['welcomeEmbedFields'] ?? '[]'); ?>">
                        <input type="file" id="welcomeEmbedAvatarFile" accept="image/*" hidden>
                        <input type="file" id="welcomeEmbedThumbnailFile" accept="image/*" hidden>
                        <input type="file" id="welcomeEmbedImageFile" accept="image/*" hidden>
                        <input type="file" id="welcomeEmbedFooterIconFile" accept="image/*" hidden>
                        <div class="verification-stage">
                            <div class="verify-label">Willkommens-Embed</div>
                            <div class="verify-preview">
                                <div class="bot-avatar">F</div>
                                <div>
                                    <div class="bot-meta"><strong>Fahrstuhl</strong><span class="bot-tag">BOT</span><span>Today at 09:40</span></div>
                                    <div class="discord-embed-wrap" id="joinEditWrap" title="Zum Bearbeiten klicken">
                                        <div class="discord-embed" id="joinEmbedCard">
                                            <div class="embed-tools">
                                                <button type="button" class="embed-tool" id="welcomeAvatarUploadButton" title="Avatarbild hochladen">◉</button>
                                                <span class="embed-header-text" id="welcomePreviewHeader" contenteditable="true" spellcheck="false" data-placeholder="Header"></span>
                                                <div class="embed-top-actions">
                                                    <button type="button" class="embed-tool" id="welcomeEmojiButton" title="Emoji hinzufügen">☻</button>
                                                    <div class="embed-emoji-menu" id="welcomeEmojiMenu" aria-label="Emoji auswählen">
                                                        <?php foreach (['😀','👋','✅','🔒','🚀','⭐','🎉','💎','🔥','🛡️','🤖','❤️'] as $emoji): ?>
                                                            <button type="button" data-emoji="<?php echo esc($emoji); ?>"><?php echo esc($emoji); ?></button>
                                                        <?php endforeach; ?>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="embed-content-row">
                                                <div class="embed-copy">
                                                    <h3 id="welcomePreviewTitle" contenteditable="true" spellcheck="false"></h3>
                                                    <p id="welcomePreviewText" contenteditable="true" spellcheck="false"></p>
                                                    <div class="embed-fields" id="welcomeFieldsList"></div>
                                                </div>
                                                <button type="button" class="embed-thumbnail" id="welcomeThumbnailUploadButton" title="Thumbnail Bild hochladen">◌</button>
                                            </div>
                                            <button type="button" id="addWelcomeField" class="btn-secondary" style="background:transparent;border:0;color:#2f8cff;padding:.5rem 0;">+ Add new field</button>
                                            <button type="button" class="embed-drop" id="welcomeImageUploadButton" title="Einbettungs-Bild hochladen">◌</button>
                                            <div class="embed-tools">
                                                <button type="button" class="embed-tool" id="welcomeFooterIconUploadButton" title="Footer Icon hochladen">◉</button>
                                                <span class="embed-footer-text" id="welcomePreviewFooter" contenteditable="true" spellcheck="false" data-placeholder="Footer"></span>
                                            </div>
                                        </div>
                                        <div class="embed-edit-overlay">✎</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="w-field" style="max-width:220px;"><label>Embed Farbe</label><input type="color" name="welcomeEmbedColor" value="<?php echo esc($settings['welcomeEmbedColor'] ?? '#51cf66'); ?>"></div>
                        <label class="field-row subtle"><input type="checkbox" name="welcomeCardEnabled" <?php echo checkedAttr($settings['welcomeCardEnabled'] ?? false); ?>> Sende eine Willkommenskarte, wenn ein Nutzer den Server betritt</label>
                        <h3 style="margin:.9rem 0 .2rem;">Personalisiere deine Willkommenskarte</h3>
                        <div class="card-studio">
                            <div class="welcome-card-preview" id="joinCardPreview"><div class="card-inner"><div class="card-avatar"></div><div class="card-title" id="joinCardTitle"></div><div class="card-subtitle" id="joinCardSubtitle"></div></div></div>
                            <div>
                                <div class="w-grid">
                                    <div class="w-field"><label>Schriftart</label><select name="welcomeCardFont" id="welcomeCardFont"><?php foreach ($fonts as $font): ?><option value="<?php echo esc($font); ?>" <?php echo selectedAttr($settings['welcomeCardFont'] ?? 'Inter', $font); ?>><?php echo esc($font); ?></option><?php endforeach; ?></select></div>
                                    <div class="w-field"><label>Deckkraft der Überlagerung</label><input type="range" name="welcomeCardOverlayOpacity" id="welcomeCardOverlayOpacity" min="0" max="100" value="<?php echo esc($settings['welcomeCardOverlayOpacity'] ?? 75); ?>"></div>
                                    <div class="w-field"><label>Textfarbe</label><input type="color" name="welcomeCardTextColor" id="welcomeCardTextColor" value="<?php echo esc($settings['welcomeCardTextColor'] ?? '#ffffff'); ?>"></div>
                                    <div class="w-field"><label>Hintergrundfarbe</label><input type="color" name="welcomeCardBackgroundColor" id="welcomeCardBackgroundColor" value="<?php echo esc($settings['welcomeCardBackgroundColor'] ?? '#111827'); ?>"></div>
                                </div>
                                <div class="w-field"><label>Hintergrundbild URL</label><input name="welcomeCardBackgroundImage" id="welcomeCardBackgroundImage" value="<?php echo esc($settings['welcomeCardBackgroundImage'] ?? ''); ?>"></div>
                                <div class="w-grid">
                                    <div class="w-field"><label>Titel</label><input name="welcomeCardTitle" id="welcomeCardTitle" value="<?php echo esc($settings['welcomeCardTitle'] ?? '{username} just joined the server'); ?>"></div>
                                    <div class="w-field"><label>Untertitel</label><input name="welcomeCardSubtitle" id="welcomeCardSubtitle" value="<?php echo esc($settings['welcomeCardSubtitle'] ?? 'Member #{memberCount}'); ?>"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section class="w-accordion <?php echo !empty($settings['dmEnabled']) ? 'open' : ''; ?>">
                    <button class="w-head" type="button">
                        <span class="w-head-title">Eine private Nachricht an neue Nutzer senden<span class="w-head-sub">DM-Text, optional Embed und eigene DM-Welcome-Card.</span></span>
                        <label class="toggle" onclick="event.stopPropagation()"><input type="checkbox" name="dmEnabled" <?php echo checkedAttr($settings['dmEnabled'] ?? false); ?>><span class="slider"></span></label>
                    </button>
                    <div class="w-body">
                        <div class="w-field"><label>DM Nachricht</label><textarea name="dmMessage" id="dmMessage" maxlength="2000"><?php echo esc($settings['dmMessage'] ?? 'Have a great time here in **{server}**'); ?></textarea></div>
                        <label class="field-row subtle"><input type="checkbox" name="dmAsEmbed" <?php echo checkedAttr($settings['dmAsEmbed'] ?? false); ?>> DM einbetten</label>
                        <input type="hidden" name="dmEmbedHeader" id="dmEmbedHeader" value="<?php echo esc($settings['dmEmbedHeader'] ?? 'Header'); ?>">
                        <input type="hidden" name="dmEmbedAvatar" id="dmEmbedAvatar" value="<?php echo esc($settings['dmEmbedAvatar'] ?? ''); ?>">
                        <input type="hidden" name="dmEmbedEmoji" id="dmEmbedEmoji" value="<?php echo esc($settings['dmEmbedEmoji'] ?? ''); ?>">
                        <input type="hidden" name="dmEmbedTitle" id="dmEmbedTitle" value="<?php echo esc($settings['dmEmbedTitle'] ?? 'Welcome to {server}'); ?>">
                        <input type="hidden" name="dmEmbedThumbnail" id="dmEmbedThumbnail" value="<?php echo esc($settings['dmEmbedThumbnail'] ?? ''); ?>">
                        <input type="hidden" name="dmEmbedImage" id="dmEmbedImage" value="<?php echo esc($settings['dmEmbedImage'] ?? ''); ?>">
                        <input type="hidden" name="dmEmbedFooterIcon" id="dmEmbedFooterIcon" value="<?php echo esc($settings['dmEmbedFooterIcon'] ?? ''); ?>">
                        <input type="hidden" name="dmEmbedFooter" id="dmEmbedFooter" value="<?php echo esc($settings['dmEmbedFooter'] ?? ''); ?>">
                        <input type="hidden" name="dmEmbedFields" id="dmEmbedFields" value="<?php echo esc($settings['dmEmbedFields'] ?? '[]'); ?>">
                        <input type="file" id="dmEmbedAvatarFile" accept="image/*" hidden>
                        <input type="file" id="dmEmbedThumbnailFile" accept="image/*" hidden>
                        <input type="file" id="dmEmbedImageFile" accept="image/*" hidden>
                        <input type="file" id="dmEmbedFooterIconFile" accept="image/*" hidden>
                        <div class="verification-stage">
                            <div class="verify-label">DM-Embed</div>
                            <div class="verify-preview">
                                <div class="bot-avatar">F</div>
                                <div>
                                    <div class="bot-meta"><strong>Fahrstuhl</strong><span class="bot-tag">BOT</span><span>Today at 09:40</span></div>
                                    <div class="discord-embed-wrap" id="dmEditWrap" title="Zum Bearbeiten klicken">
                                        <div class="discord-embed" id="dmEmbedCard">
                                            <div class="embed-tools">
                                                <button type="button" class="embed-tool" id="dmAvatarUploadButton" title="Avatarbild hochladen">◉</button>
                                                <span class="embed-header-text" id="dmPreviewHeader" contenteditable="true" spellcheck="false" data-placeholder="Header"></span>
                                                <div class="embed-top-actions">
                                                    <button type="button" class="embed-tool" id="dmEmojiButton" title="Emoji hinzufügen">☻</button>
                                                    <div class="embed-emoji-menu" id="dmEmojiMenu" aria-label="Emoji auswählen">
                                                        <?php foreach (['😀','👋','✅','🔒','🚀','⭐','🎉','💎','🔥','🛡️','🤖','❤️'] as $emoji): ?>
                                                            <button type="button" data-emoji="<?php echo esc($emoji); ?>"><?php echo esc($emoji); ?></button>
                                                        <?php endforeach; ?>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="embed-content-row">
                                                <div class="embed-copy">
                                                    <h3 id="dmPreviewTitle" contenteditable="true" spellcheck="false"></h3>
                                                    <p id="dmPreviewText" contenteditable="true" spellcheck="false"></p>
                                                    <div class="embed-fields" id="dmFieldsList"></div>
                                                </div>
                                                <button type="button" class="embed-thumbnail" id="dmThumbnailUploadButton" title="Thumbnail Bild hochladen">◌</button>
                                            </div>
                                            <button type="button" id="addDmField" class="btn-secondary" style="background:transparent;border:0;color:#2f8cff;padding:.5rem 0;">+ Add new field</button>
                                            <button type="button" class="embed-drop" id="dmImageUploadButton" title="Einbettungs-Bild hochladen">◌</button>
                                            <div class="embed-tools">
                                                <button type="button" class="embed-tool" id="dmFooterIconUploadButton" title="Footer Icon hochladen">◉</button>
                                                <span class="embed-footer-text" id="dmPreviewFooter" contenteditable="true" spellcheck="false" data-placeholder="Footer"></span>
                                            </div>
                                        </div>
                                        <div class="embed-edit-overlay">✎</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="w-field" style="max-width:220px;"><label>DM Embed Farbe</label><input type="color" name="dmEmbedColor" value="<?php echo esc($settings['dmEmbedColor'] ?? '#51cf66'); ?>"></div>
                        <label class="field-row subtle"><input type="checkbox" name="dmCardEnabled" <?php echo checkedAttr($settings['dmCardEnabled'] ?? false); ?>> Sende eine Willkommenskarte in der DM</label>
                        <h3 style="margin:.9rem 0 .2rem;">Personalisiere deine Willkommenskarte</h3>
                        <div class="w-grid">
                            <div class="w-field"><label>DM Card Titel</label><input name="dmCardTitle" id="dmCardTitle" value="<?php echo esc($settings['dmCardTitle'] ?? 'Welcome to {server}'); ?>"></div>
                            <div class="w-field"><label>DM Card Untertitel</label><input name="dmCardSubtitle" id="dmCardSubtitle" value="<?php echo esc($settings['dmCardSubtitle'] ?? "You're member #{memberCount}"); ?>"></div>
                        </div>
                    </div>
                </section>

                <section class="w-accordion <?php echo !empty($settings['autoroleEnabled']) ? 'open' : ''; ?>">
                    <button class="w-head" type="button">
                        <span class="w-head-title">Neuen Nutzern eine Rolle geben<span class="w-head-sub">Rollen direkt beim Join oder nach Verification zuweisen.</span></span>
                        <label class="toggle" onclick="event.stopPropagation()"><input type="checkbox" name="autoroleEnabled" <?php echo checkedAttr($settings['autoroleEnabled'] ?? false); ?>><span class="slider"></span></label>
                    </button>
                    <div class="w-body">
                        <div class="role-row">
                            <div class="w-field">
                                <label>Rollen zu vergeben</label>
                                <select name="autoroleId">
                                    <option value="">Wähle eine Rolle</option>
                                    <?php foreach ($roles as $role): ?>
                                        <option value="<?php echo esc($role['id']); ?>" <?php echo selectedAttr($autoroleId, $role['id'] ?? ''); ?>><?php echo esc($role['name']); ?><?php echo empty($role['assignable']) ? ' (nicht zuweisbar)' : ''; ?></option>
                                    <?php endforeach; ?>
                                </select>
                            </div>
                            <a class="btn-secondary" href="serverconfig.php?guildId=<?php echo urlencode($guildId); ?>">Rollen prüfen</a>
                        </div>
                        <div class="role-hint">Wenn Verification aktiv ist, vergibt Fahrstuhl die Auto-Role nach Klick auf den Verifizieren-Button. Ohne Verification wird sie beim Beitritt vergeben.</div>
                        <div class="monet-banner"><strong>Verdiene Geld mit exklusiven Rollen und anderen Vorteilen auf deinem Discord-Server.</strong><a class="btn-secondary" href="premium-hub.php">Monetization öffnen</a></div>
                    </div>
                </section>

                <section class="w-accordion <?php echo !empty($settings['goodbyeEnabled']) ? 'open' : ''; ?>">
                    <button class="w-head" type="button">
                        <span class="w-head-title">Eine Nachricht senden, wenn ein Benutzer den Server verlässt<span class="w-head-sub">Goodbye-Channel, Text und optionales Embed.</span></span>
                        <label class="toggle" onclick="event.stopPropagation()"><input type="checkbox" name="goodbyeEnabled" <?php echo checkedAttr($settings['goodbyeEnabled'] ?? false); ?>><span class="slider"></span></label>
                    </button>
                    <div class="w-body">
                        <div class="w-field">
                            <label>Auf Wiedersehen Nachrichtenkanal *</label>
                            <select name="goodbyeChannelId">
                                <option value="">Wähle einen Kanal</option>
                                <?php foreach ($channels as $channel): ?>
                                    <option value="<?php echo esc($channel['id']); ?>" <?php echo selectedAttr($goodbyeChannelId, $channel['id'] ?? ''); ?>>#<?php echo esc($channel['name']); ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <div class="w-field"><label>Auf Wiedersehen Nachricht</label><textarea name="goodbyeMessage" id="goodbyeMessage" maxlength="2000"><?php echo esc($settings['goodbyeMessage'] ?? '**{username}** just left the server'); ?></textarea></div>
                        <label class="field-row subtle"><input type="checkbox" name="goodbyeAsEmbed" <?php echo checkedAttr($settings['goodbyeAsEmbed'] ?? false); ?>> Goodbye einbetten</label>
                        <input type="hidden" name="goodbyeEmbedHeader" id="goodbyeEmbedHeader" value="<?php echo esc($settings['goodbyeEmbedHeader'] ?? 'Header'); ?>">
                        <input type="hidden" name="goodbyeEmbedAvatar" id="goodbyeEmbedAvatar" value="<?php echo esc($settings['goodbyeEmbedAvatar'] ?? ''); ?>">
                        <input type="hidden" name="goodbyeEmbedEmoji" id="goodbyeEmbedEmoji" value="<?php echo esc($settings['goodbyeEmbedEmoji'] ?? ''); ?>">
                        <input type="hidden" name="goodbyeEmbedTitle" id="goodbyeEmbedTitle" value="<?php echo esc($settings['goodbyeEmbedTitle'] ?? '{username} left {server}'); ?>">
                        <input type="hidden" name="goodbyeEmbedThumbnail" id="goodbyeEmbedThumbnail" value="<?php echo esc($settings['goodbyeEmbedThumbnail'] ?? ''); ?>">
                        <input type="hidden" name="goodbyeEmbedImage" id="goodbyeEmbedImage" value="<?php echo esc($settings['goodbyeEmbedImage'] ?? ''); ?>">
                        <input type="hidden" name="goodbyeEmbedFooterIcon" id="goodbyeEmbedFooterIcon" value="<?php echo esc($settings['goodbyeEmbedFooterIcon'] ?? ''); ?>">
                        <input type="hidden" name="goodbyeEmbedFooter" id="goodbyeEmbedFooter" value="<?php echo esc($settings['goodbyeEmbedFooter'] ?? ''); ?>">
                        <input type="hidden" name="goodbyeEmbedFields" id="goodbyeEmbedFields" value="<?php echo esc($settings['goodbyeEmbedFields'] ?? '[]'); ?>">
                        <input type="file" id="goodbyeEmbedAvatarFile" accept="image/*" hidden>
                        <input type="file" id="goodbyeEmbedThumbnailFile" accept="image/*" hidden>
                        <input type="file" id="goodbyeEmbedImageFile" accept="image/*" hidden>
                        <input type="file" id="goodbyeEmbedFooterIconFile" accept="image/*" hidden>
                        <div class="verification-stage">
                            <div class="verify-label">Goodbye-Embed</div>
                            <div class="verify-preview">
                                <div class="bot-avatar">F</div>
                                <div>
                                    <div class="bot-meta"><strong>Fahrstuhl</strong><span class="bot-tag">BOT</span><span>Today at 09:40</span></div>
                                    <div class="discord-embed-wrap" id="goodbyeEditWrap" title="Zum Bearbeiten klicken">
                                        <div class="discord-embed" id="goodbyeEmbedCard">
                                            <div class="embed-tools">
                                                <button type="button" class="embed-tool" id="goodbyeAvatarUploadButton" title="Avatarbild hochladen">◉</button>
                                                <span class="embed-header-text" id="goodbyePreviewHeader" contenteditable="true" spellcheck="false" data-placeholder="Header"></span>
                                                <div class="embed-top-actions">
                                                    <button type="button" class="embed-tool" id="goodbyeEmojiButton" title="Emoji hinzufügen">☻</button>
                                                    <div class="embed-emoji-menu" id="goodbyeEmojiMenu" aria-label="Emoji auswählen">
                                                        <?php foreach (['😀','👋','✅','🔒','🚀','⭐','🎉','💎','🔥','🛡️','🤖','❤️'] as $emoji): ?>
                                                            <button type="button" data-emoji="<?php echo esc($emoji); ?>"><?php echo esc($emoji); ?></button>
                                                        <?php endforeach; ?>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="embed-content-row">
                                                <div class="embed-copy">
                                                    <h3 id="goodbyePreviewTitle" contenteditable="true" spellcheck="false"></h3>
                                                    <p id="goodbyePreviewText" contenteditable="true" spellcheck="false"></p>
                                                    <div class="embed-fields" id="goodbyeFieldsList"></div>
                                                </div>
                                                <button type="button" class="embed-thumbnail" id="goodbyeThumbnailUploadButton" title="Thumbnail Bild hochladen">◌</button>
                                            </div>
                                            <button type="button" id="addGoodbyeField" class="btn-secondary" style="background:transparent;border:0;color:#2f8cff;padding:.5rem 0;">+ Add new field</button>
                                            <button type="button" class="embed-drop" id="goodbyeImageUploadButton" title="Einbettungs-Bild hochladen">◌</button>
                                            <div class="embed-tools">
                                                <button type="button" class="embed-tool" id="goodbyeFooterIconUploadButton" title="Footer Icon hochladen">◉</button>
                                                <span class="embed-footer-text" id="goodbyePreviewFooter" contenteditable="true" spellcheck="false" data-placeholder="Footer"></span>
                                            </div>
                                        </div>
                                        <div class="embed-edit-overlay">✎</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="w-field" style="max-width:220px;"><label>Goodbye Embed Farbe</label><input type="color" name="goodbyeEmbedColor" value="<?php echo esc($settings['goodbyeEmbedColor'] ?? '#ff6b6b'); ?>"></div>
                    </div>
                </section>
            </div>

            <aside class="preview-side">
                <div class="preview-panel">
                    <div class="preview-tabs">
                        <button type="button" class="active" data-preview-tab="join">Join</button>
                        <button type="button" data-preview-tab="dm">DM</button>
                        <button type="button" data-preview-tab="leave">Leave</button>
                    </div>
                    <div class="message-preview" id="messagePreview"></div>
                    <div style="display:flex; gap:.6rem; margin-top:.8rem;">
                        <button type="button" class="btn-secondary" onclick="testWelcome('welcome')">Test Join</button>
                        <button type="button" class="btn-secondary" onclick="testWelcome('goodbye')">Test Leave</button>
                    </div>
                </div>
                <div class="preview-panel">
                    <strong>Placeholders</strong>
                    <div class="placeholder-grid" style="margin-top:.7rem;">
                        <span><code>{user}</code> Mention</span>
                        <span><code>{username}</code> Name</span>
                        <span><code>{user.idname}</code> Name#0</span>
                        <span><code>{server}</code> Server</span>
                        <span><code>{server.name}</code> Server</span>
                        <span><code>{memberCount}</code> Member count</span>
                        <span><code>{server.member_count}</code> Member count</span>
                    </div>
                </div>
                <div class="preview-panel">
                    <strong>Status</strong>
                    <p class="subtle"><?php echo $activeCount; ?>/6 Bereiche aktiv. <?php echo !empty($settings['verificationPublishedAt']) ? 'Verification wurde bereits veröffentlicht.' : 'Verification noch nicht veröffentlicht.'; ?></p>
                </div>
            </aside>
        </div>

        <div class="save-bar" id="saveBar">
            <strong>Aenderungen entdeckt! Bitte speichern oder abbrechen.</strong>
            <div class="save-actions">
                <a class="btn-secondary" href="welcome.php?guildId=<?php echo urlencode($guildId); ?>">Abbrechen</a>
                <button class="btn-primary" type="submit" onclick="document.getElementById('formAction').value='save'">Speichern</button>
                <span class="ux-save-status" id="welcomeSaveStatus">Bereit</span>
            </div>
        </div>
    </form>
    <?php endif; ?>
</div>

<script>
const guildName = <?php echo json_encode($guildName); ?>;
let previewTab = 'join';
let initialFormState = '';
let formReady = false;
let allowUnload = false;

function getFormState() {
    const form = document.getElementById('welcomeForm');
    if (!form) return '';
    const data = new FormData(form);
    data.delete('action');
    return new URLSearchParams(data).toString();
}

function syncSaveBar() {
    const bar = document.getElementById('saveBar');
    if (!bar || !formReady) return;
    const dirty = getFormState() !== initialFormState;
    bar.classList.toggle('dirty', dirty);
    bar.classList.toggle('is-visible', dirty);
}

function markDirty() {
    syncSaveBar();
}

function parseTemplate(text) {
    return String(text || '')
        .replaceAll('{user}', '@txxle')
        .replaceAll('{username}', 'txxle')
        .replaceAll('{tag}', 'txxle#0')
        .replaceAll('{user.idname}', 'txxle#0')
        .replaceAll('{server}', guildName)
        .replaceAll('{server.name}', guildName)
        .replaceAll('{memberCount}', '2')
        .replaceAll('{server.member_count}', '2');
}

function fieldValue(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}

function discordImageValue(id, previewElementId = '') {
    const previewElement = previewElementId ? document.getElementById(previewElementId) : null;
    const localPreview = previewElement?.dataset.localPreview || '';
    return localPreview || fieldValue(id);
}

function safeJsonFields(inputId = 'verificationFields') {
    try {
        const parsed = JSON.parse(fieldValue(inputId) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function persistEmbedFields(listId, inputId) {
    const fields = [...document.querySelectorAll(`#${listId} .embed-field`)].map(field => ({
        name: field.querySelector('.embed-field-name')?.innerText.trim() || '',
        value: field.querySelector('.embed-field-value')?.innerText.trim() || '',
    })).filter(field => field.name || field.value).slice(0, 10);
    const input = document.getElementById(inputId);
    if (input) input.value = JSON.stringify(fields);
    markDirty();
}

function renderEmbedFields(listId, inputId) {
    const list = document.getElementById(listId);
    if (!list) return;
    list.innerHTML = '';
    safeJsonFields(inputId).forEach(field => addEmbedField(listId, inputId, field.name || '', field.value || '', false));
}

function addEmbedField(listId, inputId, name = '', value = '', shouldDirty = true) {
    const list = document.getElementById(listId);
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'embed-field';
    row.innerHTML = `
        <div class="embed-field-head">
            <div class="embed-field-name" contenteditable="true" spellcheck="false"></div>
            <button type="button" class="embed-field-remove" title="Field entfernen">×</button>
        </div>
        <div class="embed-field-value" contenteditable="true" spellcheck="false"></div>
    `;
    row.querySelector('.embed-field-name').innerText = name;
    row.querySelector('.embed-field-value').innerText = value;
    row.querySelectorAll('[contenteditable="true"]').forEach(el => {
        el.addEventListener('input', () => persistEmbedFields(listId, inputId));
    });
    row.querySelector('.embed-field-remove').addEventListener('click', () => {
        row.remove();
        persistEmbedFields(listId, inputId);
    });
    list.appendChild(row);
    if (shouldDirty) persistEmbedFields(listId, inputId);
}

function updatePreview() {
    const source = previewTab === 'dm' ? 'dmMessage' : (previewTab === 'leave' ? 'goodbyeMessage' : 'welcomeMessage');
    const preview = document.getElementById('messagePreview');
    if (preview) preview.textContent = parseTemplate(fieldValue(source));

    const vh = document.getElementById('verifyPreviewHeader');
    const vt = document.getElementById('verifyPreviewTitle');
    const vm = document.getElementById('verifyPreviewText');
    const vf = document.getElementById('verifyPreviewFooter');
    if (vh && document.activeElement !== vh) vh.textContent = parseTemplate(fieldValue('verificationHeader'));
    if (vt && document.activeElement !== vt) vt.textContent = parseTemplate(fieldValue('verificationTitle'));
    if (vm && document.activeElement !== vm) vm.textContent = parseTemplate(fieldValue('verificationMessage'));
    if (vf && document.activeElement !== vf) vf.textContent = parseTemplate(fieldValue('verificationFooter'));

    const thumbnail = document.getElementById('thumbnailUploadButton');
    if (thumbnail) {
        const image = discordImageValue('verificationThumbnail', 'thumbnailUploadButton');
        thumbnail.style.backgroundImage = image ? `url("${image.replaceAll('"', '')}")` : '';
        thumbnail.classList.toggle('filled', !!image);
    }
    const footerIcon = document.getElementById('footerIconUploadButton');
    if (footerIcon) {
        const image = discordImageValue('verificationFooterIcon', 'footerIconUploadButton');
        footerIcon.style.backgroundImage = image ? `url("${image.replaceAll('"', '')}")` : '';
        footerIcon.classList.toggle('filled', !!image);
    }
    const avatar = document.getElementById('avatarUploadButton');
    if (avatar) {
        const image = discordImageValue('verificationAvatar', 'avatarUploadButton');
        avatar.style.backgroundImage = image ? `url("${image.replaceAll('"', '')}")` : '';
        avatar.classList.toggle('filled', !!image);
    }

    const wh = document.getElementById('welcomePreviewHeader');
    const wt = document.getElementById('welcomePreviewTitle');
    const wm = document.getElementById('welcomePreviewText');
    const wf = document.getElementById('welcomePreviewFooter');
    if (wh && document.activeElement !== wh) wh.textContent = parseTemplate(fieldValue('welcomeEmbedHeader'));
    if (wt && document.activeElement !== wt) wt.textContent = parseTemplate(fieldValue('welcomeEmbedTitle'));
    if (wm && document.activeElement !== wm) wm.textContent = parseTemplate(fieldValue('welcomeMessage'));
    if (wf && document.activeElement !== wf) wf.textContent = parseTemplate(fieldValue('welcomeEmbedFooter'));
    [
        ['welcomeThumbnailUploadButton', 'welcomeEmbedThumbnail'],
        ['welcomeImageUploadButton', 'welcomeEmbedImage'],
        ['welcomeFooterIconUploadButton', 'welcomeEmbedFooterIcon'],
        ['welcomeAvatarUploadButton', 'welcomeEmbedAvatar'],
    ].forEach(([buttonId, inputId]) => {
        const button = document.getElementById(buttonId);
        if (!button) return;
        const image = discordImageValue(inputId, buttonId);
        button.style.backgroundImage = image ? `url("${image.replaceAll('"', '')}")` : '';
        button.classList.toggle('filled', !!image);
    });
    [
        { prefix: 'dm', title: 'dmEmbedTitle', text: 'dmMessage', header: 'dmEmbedHeader', footer: 'dmEmbedFooter', avatar: 'dmEmbedAvatar', thumb: 'dmEmbedThumbnail', image: 'dmEmbedImage', footerIcon: 'dmEmbedFooterIcon' },
        { prefix: 'goodbye', title: 'goodbyeEmbedTitle', text: 'goodbyeMessage', header: 'goodbyeEmbedHeader', footer: 'goodbyeEmbedFooter', avatar: 'goodbyeEmbedAvatar', thumb: 'goodbyeEmbedThumbnail', image: 'goodbyeEmbedImage', footerIcon: 'goodbyeEmbedFooterIcon' },
    ].forEach(config => {
        const header = document.getElementById(`${config.prefix}PreviewHeader`);
        const title = document.getElementById(`${config.prefix}PreviewTitle`);
        const text = document.getElementById(`${config.prefix}PreviewText`);
        const footer = document.getElementById(`${config.prefix}PreviewFooter`);
        if (header && document.activeElement !== header) header.textContent = parseTemplate(fieldValue(config.header));
        if (title && document.activeElement !== title) title.textContent = parseTemplate(fieldValue(config.title));
        if (text && document.activeElement !== text) text.textContent = parseTemplate(fieldValue(config.text));
        if (footer && document.activeElement !== footer) footer.textContent = parseTemplate(fieldValue(config.footer));
        [
            [`${config.prefix}ThumbnailUploadButton`, config.thumb],
            [`${config.prefix}ImageUploadButton`, config.image],
            [`${config.prefix}FooterIconUploadButton`, config.footerIcon],
            [`${config.prefix}AvatarUploadButton`, config.avatar],
        ].forEach(([buttonId, inputId]) => {
            const button = document.getElementById(buttonId);
            if (!button) return;
            const image = discordImageValue(inputId, buttonId);
            button.style.backgroundImage = image ? `url("${image.replaceAll('"', '')}")` : '';
            button.classList.toggle('filled', !!image);
        });
    });

    const buttonStyle = fieldValue('verificationButtonStyle') || 'success';
    const buttonPreview = document.getElementById('verificationButtonPreview');
    const buttonEmoji = fieldValue('verificationButtonEmoji');
    const buttonLabel = fieldValue('verificationButtonLabel') || 'Verifizieren';
    const buttonColors = {
        primary: '#5865f2',
        secondary: '#6b7280',
        success: '#3ecf8e',
        danger: '#ff4d4f',
    };
    if (buttonPreview) {
        buttonPreview.textContent = `${buttonEmoji ? `${buttonEmoji} ` : ''}${buttonLabel}`;
        buttonPreview.style.setProperty('--verify-button-bg', buttonColors[buttonStyle] || buttonColors.success);
        buttonPreview.classList.toggle('is-success', buttonStyle === 'success');
    }
    const countInput = document.getElementById('verificationCount');
    const countEditorInput = document.getElementById('verificationCountInput');
    const countPreview = document.getElementById('verificationCountButtonPreview');
    const countEnabled = document.getElementById('verificationCountButtonEnabled')?.checked || false;
    const count = Math.max(0, Number(countEditorInput?.value || countInput?.value || 0) || 0);
    const countLabel = fieldValue('verificationCountButtonLabel') || 'Verifiziert: {count}';
    if (countInput) countInput.value = String(count);
    if (countPreview) {
        countPreview.textContent = countLabel.replaceAll('{count}', String(count));
        countPreview.hidden = !countEnabled;
    }
    document.querySelectorAll('.button-style-dot').forEach(dot => {
        dot.classList.toggle('active', dot.dataset.style === buttonStyle);
    });

    const card = document.getElementById('joinCardPreview');
    if (card) {
        const image = fieldValue('welcomeCardBackgroundImage');
        card.style.setProperty('--card-bg', fieldValue('welcomeCardBackgroundColor') || '#111827');
        card.style.setProperty('--card-text', fieldValue('welcomeCardTextColor') || '#ffffff');
        card.style.setProperty('--card-overlay', (Number(fieldValue('welcomeCardOverlayOpacity') || 75) / 100).toString());
        card.style.setProperty('--card-font', fieldValue('welcomeCardFont') || 'Inter');
        card.style.setProperty('--card-image', image ? `url("${image.replaceAll('"', '')}")` : 'none');
        document.getElementById('joinCardTitle').textContent = parseTemplate(fieldValue('welcomeCardTitle'));
        document.getElementById('joinCardSubtitle').textContent = parseTemplate(fieldValue('welcomeCardSubtitle'));
    }
}

document.querySelectorAll('.w-head .toggle input').forEach(input => {
    const syncPanel = () => {
        input.closest('.w-accordion')?.classList.toggle('open', input.checked);
    };
    input.addEventListener('change', () => {
        syncPanel();
        updatePreview();
        markDirty();
    });
    syncPanel();
});

document.querySelectorAll('.w-head').forEach(head => {
    head.addEventListener('click', (event) => {
        if (event.target.closest('.toggle')) return;
        const panel = head.closest('.w-accordion');
        const toggleInput = head.querySelector('.toggle input');
        if (!panel || !toggleInput) return;
        const nextState = !panel.classList.contains('open');
        panel.classList.toggle('open', nextState);
        toggleInput.checked = nextState;
        updatePreview();
        markDirty();
    });
});

function applyWelcomePreset(type) {
    const presetMap = {
        friendly: {
            message: 'Hey {user} 👋 willkommen auf **{server}**! Lies dir kurz die Regeln durch und hab viel Spass.',
            title: '👋 {username} ist beigetreten',
            color: '#51cf66'
        },
        clean: {
            message: 'Willkommen {user} auf **{server}**. Du bist Mitglied Nr. {memberCount}.',
            title: '✅ Willkommen auf {server}',
            color: '#5865f2'
        }
    };
    const preset = presetMap[type] || presetMap.friendly;
    const msg = document.getElementById('welcomeMessage');
    const title = document.getElementById('welcomeEmbedTitle');
    const color = document.querySelector('input[name="welcomeEmbedColor"]');
    const enabled = document.querySelector('input[name="welcomeEnabled"]');
    const asEmbed = document.querySelector('input[name="welcomeAsEmbed"]');
    if (msg) msg.value = preset.message;
    if (title) title.value = preset.title;
    if (color) color.value = preset.color;
    if (enabled) enabled.checked = true;
    if (asEmbed) asEmbed.checked = true;
    const welcomePanel = document.querySelector('input[name="welcomeEnabled"]')?.closest('.w-accordion');
    if (welcomePanel) welcomePanel.classList.add('open');
    updatePreview();
    markDirty();
}

document.querySelectorAll('[data-welcome-preset]').forEach(button => {
    button.addEventListener('click', () => {
        applyWelcomePreset(button.getAttribute('data-welcome-preset') || 'friendly');
    });
});

function bindEmbedEditMode(wrapId, cardId, fallbackFocusId) {
    const wrap = document.getElementById(wrapId);
    const card = document.getElementById(cardId);
    if (!wrap || !card) return;
    wrap.addEventListener('click', (event) => {
        wrap.classList.add('is-editing');
        card.classList.add('editing');
        const clickedEditable = event.target.closest('[contenteditable="true"]');
        const clickedControl = event.target.closest('button, input, select, textarea, .embed-emoji-menu');
        if (!clickedEditable && !clickedControl) {
            document.getElementById(fallbackFocusId)?.focus();
        }
    });
}

bindEmbedEditMode('verifyEditWrap', 'verifyEmbedCard', 'verifyPreviewText');
bindEmbedEditMode('joinEditWrap', 'joinEmbedCard', 'welcomePreviewText');
bindEmbedEditMode('dmEditWrap', 'dmEmbedCard', 'dmPreviewText');
bindEmbedEditMode('goodbyeEditWrap', 'goodbyeEmbedCard', 'goodbyePreviewText');

document.addEventListener('click', (event) => {
    [
        ['verifyEditWrap', 'verifyEmbedCard'],
        ['joinEditWrap', 'joinEmbedCard'],
    ].forEach(([wrapId, cardId]) => {
        const wrap = document.getElementById(wrapId);
        const card = document.getElementById(cardId);
        if (!wrap || !card || wrap.contains(event.target)) return;
        wrap.classList.remove('is-editing');
        card.classList.remove('editing');
    });
});

document.getElementById('verifyPreviewTitle')?.addEventListener('input', (event) => {
    document.getElementById('verificationTitle').value = event.target.innerText.trim();
    markDirty();
});

document.getElementById('verifyPreviewText')?.addEventListener('input', (event) => {
    document.getElementById('verificationMessage').value = event.target.innerText.trim();
    markDirty();
});

document.getElementById('verifyPreviewHeader')?.addEventListener('input', (event) => {
    document.getElementById('verificationHeader').value = event.target.innerText.trim();
    markDirty();
});

document.getElementById('verifyPreviewFooter')?.addEventListener('input', (event) => {
    document.getElementById('verificationFooter').value = event.target.innerText.trim();
    markDirty();
});

document.getElementById('welcomePreviewTitle')?.addEventListener('input', (event) => {
    document.getElementById('welcomeEmbedTitle').value = event.target.innerText.trim();
    markDirty();
});

document.getElementById('welcomePreviewText')?.addEventListener('input', (event) => {
    document.getElementById('welcomeMessage').value = event.target.innerText.trim();
    markDirty();
});

document.getElementById('welcomePreviewHeader')?.addEventListener('input', (event) => {
    document.getElementById('welcomeEmbedHeader').value = event.target.innerText.trim();
    markDirty();
});

document.getElementById('welcomePreviewFooter')?.addEventListener('input', (event) => {
    document.getElementById('welcomeEmbedFooter').value = event.target.innerText.trim();
    markDirty();
});

function bindEditableToHidden(previewId, inputId) {
    document.getElementById(previewId)?.addEventListener('input', (event) => {
        document.getElementById(inputId).value = event.target.innerText.trim();
        markDirty();
    });
}

[
    ['dmPreviewHeader', 'dmEmbedHeader'],
    ['dmPreviewTitle', 'dmEmbedTitle'],
    ['dmPreviewText', 'dmMessage'],
    ['dmPreviewFooter', 'dmEmbedFooter'],
    ['goodbyePreviewHeader', 'goodbyeEmbedHeader'],
    ['goodbyePreviewTitle', 'goodbyeEmbedTitle'],
    ['goodbyePreviewText', 'goodbyeMessage'],
    ['goodbyePreviewFooter', 'goodbyeEmbedFooter'],
].forEach(([previewId, inputId]) => bindEditableToHidden(previewId, inputId));

document.getElementById('addVerificationField')?.addEventListener('click', () => {
    addEmbedField('verificationFieldsList', 'verificationFields');
});

document.getElementById('addWelcomeField')?.addEventListener('click', () => {
    addEmbedField('welcomeFieldsList', 'welcomeEmbedFields');
});

document.getElementById('addDmField')?.addEventListener('click', () => {
    addEmbedField('dmFieldsList', 'dmEmbedFields');
});

document.getElementById('addGoodbyeField')?.addEventListener('click', () => {
    addEmbedField('goodbyeFieldsList', 'goodbyeEmbedFields');
});

document.getElementById('emojiButton')?.addEventListener('click', (event) => {
    event.stopPropagation();
    document.getElementById('emojiMenu')?.classList.toggle('open');
});

document.getElementById('emojiMenu')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-emoji]');
    if (!button) return;
    const emoji = button.dataset.emoji || '';
    const title = document.getElementById('verifyPreviewTitle');
    const hidden = document.getElementById('verificationEmoji');
    if (hidden) hidden.value = emoji;
    if (title) {
        title.innerText = `${emoji} ${title.innerText.replace(/^(\p{Extended_Pictographic}|\p{Emoji_Presentation})\s*/u, '')}`.trim();
        document.getElementById('verificationTitle').value = title.innerText.trim();
    }
    document.getElementById('emojiMenu')?.classList.remove('open');
    markDirty();
});

document.getElementById('welcomeEmojiButton')?.addEventListener('click', (event) => {
    event.stopPropagation();
    document.getElementById('welcomeEmojiMenu')?.classList.toggle('open');
});

document.getElementById('welcomeEmojiMenu')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-emoji]');
    if (!button) return;
    const emoji = button.dataset.emoji || '';
    const title = document.getElementById('welcomePreviewTitle');
    const hidden = document.getElementById('welcomeEmbedEmoji');
    if (hidden) hidden.value = emoji;
    if (title) {
        title.innerText = `${emoji} ${title.innerText.replace(/^(\p{Extended_Pictographic}|\p{Emoji_Presentation})\s*/u, '')}`.trim();
        document.getElementById('welcomeEmbedTitle').value = title.innerText.trim();
    }
    document.getElementById('welcomeEmojiMenu')?.classList.remove('open');
    markDirty();
});

function bindEmojiMenu(buttonId, menuId, hiddenId, titleId) {
    document.getElementById(buttonId)?.addEventListener('click', (event) => {
        event.stopPropagation();
        document.getElementById(menuId)?.classList.toggle('open');
    });
    document.getElementById(menuId)?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-emoji]');
        if (!button) return;
        const emoji = button.dataset.emoji || '';
        const title = document.getElementById(titleId);
        const hidden = document.getElementById(hiddenId);
        if (hidden) hidden.value = emoji;
        if (title) {
            title.innerText = `${emoji} ${title.innerText.replace(/^(\p{Extended_Pictographic}|\p{Emoji_Presentation})\s*/u, '')}`.trim();
            document.getElementById(titleId.replace('PreviewTitle', 'EmbedTitle')).value = title.innerText.trim();
        }
        document.getElementById(menuId)?.classList.remove('open');
        markDirty();
    });
}

bindEmojiMenu('dmEmojiButton', 'dmEmojiMenu', 'dmEmbedEmoji', 'dmPreviewTitle');
bindEmojiMenu('goodbyeEmojiButton', 'goodbyeEmojiMenu', 'goodbyeEmbedEmoji', 'goodbyePreviewTitle');

document.getElementById('verificationButtonPreview')?.addEventListener('click', (event) => {
    event.stopPropagation();
    document.querySelector('.verify-button-editor')?.classList.toggle('open');
    updatePreview();
});

const buttonEmojiCategories = {
    people: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😙','😚','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','👏','🙌','🫶','👍','👎','👊','✊','🤝','🙏'],
    nature: ['🐵','🐶','🐱','🦊','🐻','🐼','🐨','🐯','🦁','🐸','🐙','🦋','🌻','🌹','🌙','⭐','✨','🔥','🌈','☄️','❄️','🌊','🍀','🌲','🌴','🌵','🍄'],
    objects: ['🎉','🎁','🎈','🎮','🎧','🎤','🎵','🏆','🥇','💎','🔒','🔑','🛡️','⚔️','🚀','💡','📌','📢','🔔','✅','❌','⚠️','🧩','🎫','📜'],
    symbols: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','💕','💞','💯','💢','💥','💫','💦','💨','👑','🔰','♻️','☑️','✔️','➕','➖','🔵','🟢','🔴'],
};
let buttonEmojiCategory = 'people';

function renderButtonEmojiPicker() {
    const grid = document.getElementById('verificationButtonEmojiGrid');
    const title = document.getElementById('verificationButtonEmojiTitle');
    const search = String(document.getElementById('verificationButtonEmojiSearch')?.value || '').toLowerCase().trim();
    if (!grid || !title) return;
    const all = Object.values(buttonEmojiCategories).flat();
    const emojis = search ? all : (buttonEmojiCategories[buttonEmojiCategory] || buttonEmojiCategories.people);
    grid.innerHTML = '';
    title.textContent = `${document.querySelector(`[data-emoji-category="${buttonEmojiCategory}"]`)?.textContent || '☺'} ${buttonEmojiCategory.toUpperCase()}`;
    emojis.forEach(emoji => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = emoji;
        button.dataset.emoji = emoji;
        grid.appendChild(button);
    });
}

document.querySelectorAll('[data-emoji-category]').forEach(button => {
    button.addEventListener('click', () => {
        buttonEmojiCategory = button.dataset.emojiCategory || 'people';
        document.querySelectorAll('[data-emoji-category]').forEach(item => item.classList.toggle('active', item === button));
        renderButtonEmojiPicker();
    });
});

document.getElementById('verificationButtonEmojiSearch')?.addEventListener('input', renderButtonEmojiPicker);

document.getElementById('verificationButtonEmojiButton')?.addEventListener('click', (event) => {
    event.stopPropagation();
    document.getElementById('verificationButtonEmojiMenu')?.classList.toggle('open');
    renderButtonEmojiPicker();
});

document.getElementById('verificationButtonEmojiMenu')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-emoji]');
    if (!button) return;
    document.getElementById('verificationButtonEmoji').value = button.dataset.emoji || '';
    document.getElementById('verificationButtonEmojiMenu')?.classList.remove('open');
    updatePreview();
    markDirty();
});

document.querySelectorAll('.button-style-dot').forEach(dot => {
    dot.addEventListener('click', () => {
        document.getElementById('verificationButtonStyle').value = dot.dataset.style || 'success';
        updatePreview();
        markDirty();
    });
});

document.addEventListener('click', (event) => {
    [
        ['emojiMenu', 'emojiButton'],
        ['welcomeEmojiMenu', 'welcomeEmojiButton'],
        ['dmEmojiMenu', 'dmEmojiButton'],
        ['goodbyeEmojiMenu', 'goodbyeEmojiButton'],
        ['verificationButtonEmojiMenu', 'verificationButtonEmojiButton'],
    ].forEach(([menuId, buttonId]) => {
        const menu = document.getElementById(menuId);
        if (!menu || event.target.closest(`#${menuId}`) || event.target.closest(`#${buttonId}`)) return;
        menu.classList.remove('open');
    });
});

function fileToDashboardImage(file) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.addEventListener('load', () => {
            const img = new Image();
            img.addEventListener('load', () => {
                const max = 900;
                const ratio = Math.min(1, max / Math.max(img.width, img.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(img.width * ratio));
                canvas.height = Math.max(1, Math.round(img.height * ratio));
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.86));
            });
            img.addEventListener('error', () => resolve(String(reader.result || '')));
            img.src = String(reader.result || '');
        });
        reader.addEventListener('error', () => resolve(''));
        reader.readAsDataURL(file);
    });
}

function bindImagePicker(buttonId, inputId, targetId) {
    const button = document.getElementById(buttonId);
    const input = document.getElementById(inputId);
    const target = document.getElementById(targetId);
    if (!button || !input || !target) return;
    button.addEventListener('click', (event) => {
        event.stopPropagation();
        input.click();
    });
    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        const dataUrl = await fileToDashboardImage(file);
        button.dataset.localPreview = dataUrl;
        target.value = dataUrl;
        updatePreview();
        markDirty();
    });
}

bindImagePicker('avatarUploadButton', 'verificationAvatarFile', 'verificationAvatar');
bindImagePicker('thumbnailUploadButton', 'verificationThumbnailFile', 'verificationThumbnail');
bindImagePicker('footerIconUploadButton', 'verificationFooterIconFile', 'verificationFooterIcon');
bindImagePicker('welcomeAvatarUploadButton', 'welcomeEmbedAvatarFile', 'welcomeEmbedAvatar');
bindImagePicker('welcomeThumbnailUploadButton', 'welcomeEmbedThumbnailFile', 'welcomeEmbedThumbnail');
bindImagePicker('welcomeImageUploadButton', 'welcomeEmbedImageFile', 'welcomeEmbedImage');
bindImagePicker('welcomeFooterIconUploadButton', 'welcomeEmbedFooterIconFile', 'welcomeEmbedFooterIcon');
bindImagePicker('dmAvatarUploadButton', 'dmEmbedAvatarFile', 'dmEmbedAvatar');
bindImagePicker('dmThumbnailUploadButton', 'dmEmbedThumbnailFile', 'dmEmbedThumbnail');
bindImagePicker('dmImageUploadButton', 'dmEmbedImageFile', 'dmEmbedImage');
bindImagePicker('dmFooterIconUploadButton', 'dmEmbedFooterIconFile', 'dmEmbedFooterIcon');
bindImagePicker('goodbyeAvatarUploadButton', 'goodbyeEmbedAvatarFile', 'goodbyeEmbedAvatar');
bindImagePicker('goodbyeThumbnailUploadButton', 'goodbyeEmbedThumbnailFile', 'goodbyeEmbedThumbnail');
bindImagePicker('goodbyeImageUploadButton', 'goodbyeEmbedImageFile', 'goodbyeEmbedImage');
bindImagePicker('goodbyeFooterIconUploadButton', 'goodbyeEmbedFooterIconFile', 'goodbyeEmbedFooterIcon');

document.querySelectorAll('[data-preview-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
        previewTab = btn.dataset.previewTab;
        document.querySelectorAll('[data-preview-tab]').forEach(item => item.classList.toggle('active', item === btn));
        updatePreview();
    });
});

document.querySelectorAll('#welcomeForm input, #welcomeForm textarea, #welcomeForm select').forEach(el => {
    el.addEventListener('input', () => {
        updatePreview();
        markDirty();
    });
    el.addEventListener('change', () => {
        updatePreview();
        markDirty();
    });
});

document.getElementById('welcomeForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    updatePreview();
    const status = document.getElementById('welcomeSaveStatus');
    const feedback = document.getElementById('welcomeFeedback');

    const form = event.currentTarget;
    const actionInput = document.getElementById('formAction');
    const action = actionInput ? actionInput.value : 'save';
    const submitter = event.submitter;
    const originalText = submitter?.textContent || '';
    if (submitter && submitter.tagName === 'BUTTON' && submitter.type === 'submit') {
        submitter.disabled = true;
        submitter.textContent = 'Speichert...';
    }

    if (status) {
        status.textContent = 'Speichert...';
        status.classList.remove('success', 'error');
    }

    try {
        const data = new FormData(form);
        data.set('action', action || 'save');
        const response = await fetch(window.location.href, {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json'
            },
            body: data,
            credentials: 'same-origin'
        });

        const json = await response.json().catch(() => ({ success: false, message: 'Ungueltige Serverantwort.' }));
        if (!response.ok || !json.success) {
            throw new Error(json.message || 'Speichern fehlgeschlagen.');
        }

        if (feedback) {
            feedback.className = 'alert alert-success';
            feedback.textContent = json.message || 'Gespeichert.';
            feedback.style.display = 'block';
        }

        if (status) {
            status.textContent = 'Gespeichert';
            status.classList.add('success');
        }

        initialFormState = getFormState();
        syncSaveBar();
    } catch (error) {
        if (feedback) {
            feedback.className = 'alert alert-error';
            feedback.textContent = error.message || 'Speichern fehlgeschlagen.';
            feedback.style.display = 'block';
        }

        if (status) {
            status.textContent = 'Fehler';
            status.classList.add('error');
        }
    } finally {
        if (submitter && submitter.tagName === 'BUTTON' && submitter.type === 'submit') {
            submitter.disabled = false;
            submitter.textContent = originalText || 'Speichern';
        }
    }
});

window.addEventListener('beforeunload', (event) => {
    if (!formReady) return;
    if (allowUnload) return;
    if (!isDirty()) return;
    event.preventDefault();
    event.returnValue = '';
});

function testWelcome(type) {
    const form = document.getElementById('welcomeForm');
    const data = new FormData(form);
    data.set('action', 'test');
    data.set('type', type);
    allowUnload = true;
    fetch(window.location.href, { method: 'POST', body: data })
        .then(() => { window.location.reload(); })
        .catch(() => { window.location.reload(); });
}

document.addEventListener('DOMContentLoaded', () => {
    renderEmbedFields('verificationFieldsList', 'verificationFields');
    renderEmbedFields('welcomeFieldsList', 'welcomeEmbedFields');
    renderEmbedFields('dmFieldsList', 'dmEmbedFields');
    renderEmbedFields('goodbyeFieldsList', 'goodbyeEmbedFields');
    updatePreview();
    initialFormState = getFormState();
    formReady = true;
    syncSaveBar();
});
</script>

<?php include '../includes/footer.php'; ?>
