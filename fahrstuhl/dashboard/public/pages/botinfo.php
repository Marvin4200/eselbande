<?php
$page_title = 'Bot Info';
require_once __DIR__ . '/../includes/config.php';
requireLogin();

$statsRaw = getAPI('/stats');
$s = $statsRaw['stats'] ?? [];

$healthRaw = getAPI('/health');
$health = $healthRaw['data'] ?? [];

$botOffline = !isset($statsRaw['stats']);

$botId     = '1487187616674611321';
$inviteUrl = "https://discord.com/oauth2/authorize?client_id={$botId}&permissions=1654096264208&scope=bot+applications.commands";
$supportUrl = 'https://discord.gg/zfzDHKcWDx';
$topggUrl   = "https://top.gg/bot/{$botId}";
$githubUrl  = 'https://github.com/Marvin4200/Fahrstuhl';
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<?php if ($botOffline): ?>
<div class="alert alert-warning">⚠️ Bot-API aktuell nicht erreichbar — angezeigte Stats sind möglicherweise leer oder veraltet.</div>
<?php endif; ?>

<div class="page-header">
    <h1>🤖 Bot Info</h1>
    <p class="subtitle">Links, status and general information</p>
</div>

<!-- Quick Links -->
<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:14px; margin-bottom:var(--sp-6);">
    <a href="<?php echo esc($inviteUrl); ?>" target="_blank"
       style="display:flex; align-items:center; gap:var(--sp-3); background:#5865F222; border:1px solid #5865F244;
              border-radius:8px; padding:16px 18px; text-decoration:none; color:#7289da; transition:background .15s;"
       onmouseover="this.style.background='#5865F233'" onmouseout="this.style.background='#5865F222'">
        <span style="font-size:1.6em;">➕</span>
        <div>
            <div style="font-weight:700; color:#fff;">Invite Bot</div>
            <div style="font-size:0.8em; color:#aaa;">Add to your server</div>
        </div>
    </a>

    <a href="<?php echo esc($supportUrl); ?>" target="_blank"
       style="display:flex; align-items:center; gap:var(--sp-3); background:#57F28722; border:1px solid #57F28744;
              border-radius:8px; padding:16px 18px; text-decoration:none; color:#57F287; transition:background .15s;"
       onmouseover="this.style.background='#57F28733'" onmouseout="this.style.background='#57F28722'">
        <span style="font-size:1.6em;">💬</span>
        <div>
            <div style="font-weight:700; color:#fff;">Support Server</div>
            <div style="font-size:0.8em; color:#aaa;">discord.gg/zfzDHKcWDx</div>
        </div>
    </a>

    <a href="<?php echo esc($topggUrl); ?>" target="_blank"
       style="display:flex; align-items:center; gap:var(--sp-3); background:#FF373722; border:1px solid #FF373744;
              border-radius:8px; padding:16px 18px; text-decoration:none; color:#FF6B6B; transition:background .15s;"
       onmouseover="this.style.background='#FF373733'" onmouseout="this.style.background='#FF373722'">
        <span style="font-size:1.6em;">🔝</span>
        <div>
            <div style="font-weight:700; color:#fff;">top.gg Listing</div>
            <div style="font-size:0.8em; color:#aaa;">Vote & rate the bot</div>
        </div>
    </a>

    <a href="<?php echo esc($githubUrl); ?>" target="_blank"
       style="display:flex; align-items:center; gap:var(--sp-3); background:#ffffff11; border:1px solid #ffffff22;
              border-radius:8px; padding:16px 18px; text-decoration:none; color:#ccc; transition:background .15s;"
       onmouseover="this.style.background='#ffffff1a'" onmouseout="this.style.background='#ffffff11'">
        <span style="font-size:1.6em;">🐙</span>
        <div>
            <div style="font-weight:700; color:#fff;">GitHub</div>
            <div style="font-size:0.8em; color:#aaa;">Marvin4200/Fahrstuhl</div>
        </div>
    </a>
</div>

<!-- Live Stats -->
<div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--sp-4); margin-bottom:var(--sp-6);">
    <div class="section" style="padding:18px 20px;">
        <h2 style="margin-top:0;">📈 Live Stats</h2>
        <table style="width:100%; border-collapse:collapse;">
            <?php
            $uptimeMs = (int)($s['uptime'] ?? 0);
            $h = floor($uptimeMs / 3600000);
            $m = floor(($uptimeMs % 3600000) / 60000);
            $uptimeStr = $uptimeMs > 0 ? "{$h}h {$m}m" : '—';
            $rows = [
                ['🌐 Servers',        number_format((int)($s['guilds'] ?? 0))],
                ['⚡ Commands Used',   number_format((int)($s['commands'] ?? 0))],
                ['👥 Users Tracked',   number_format((int)($s['users'] ?? 0))],
                ['🏆 Top Command',     '/' . ($s['topCommand'] ?? 'N/A')],
                ['⏱️ Uptime',          $uptimeStr],
                ['📡 WS Ping',        isset($health['wsPing']) ? $health['wsPing'] . 'ms' : '—'],
            ];
            foreach ($rows as [$label, $val]):
            ?>
            <tr style="border-bottom:1px solid #1e1e30;">
                <td style="padding:9px 4px; color:#aaa; font-size:0.9em;"><?php echo $label; ?></td>
                <td style="padding:9px 4px; font-weight:600; color:#e0e0e0;"><?php echo esc($val); ?></td>
            </tr>
            <?php endforeach; ?>
        </table>
    </div>

    <div class="section" style="padding:18px 20px;">
        <h2 style="margin-top:0;">🔗 Useful Links</h2>
        <div style="display:flex; flex-direction:column; gap:10px;">
            <div>
                <div style="color:#aaa; font-size:0.8em; margin-bottom:var(--sp-1);">🔒 Privacy Policy</div>
                <a href="<?= BASE_URL ?>/pages/privacy.php" style="color:#5865F2; font-size:0.9em;"><?php echo $_SERVER['HTTP_HOST'] ?? 'your-domain.com'; ?>/pages/privacy.php</a>
            </div>
            <div>
                <div style="color:#aaa; font-size:0.8em; margin-bottom:var(--sp-1);">📜 Terms of Service</div>
                <a href="<?= BASE_URL ?>/pages/terms.php" style="color:#5865F2; font-size:0.9em;"><?php echo $_SERVER['HTTP_HOST'] ?? 'your-domain.com'; ?>/pages/terms.php</a>
            </div>
            <div>
                <div style="color:#aaa; font-size:0.8em; margin-bottom:var(--sp-1);">➕ Invite Link</div>
                <input type="text" value="<?php echo esc($inviteUrl); ?>" readonly onclick="this.select()"
                       style="width:100%; background:#1a1a2e; border:1px solid #333; border-radius:5px; color:#ccc;
                              padding:6px 10px; font-size:0.75em; cursor:pointer;">
            </div>
            <div>
                <div style="color:#aaa; font-size:0.8em; margin-bottom:var(--sp-1);">🤖 Bot ID</div>
                <code style="background:#1a1a2e; padding:var(--sp-1) var(--sp-2); border-radius:4px; font-size:0.85em; color:#aaa;"><?php echo esc($botId); ?></code>
            </div>
        </div>
    </div>
</div>

<!-- Commands List -->
<div class="section" style="padding:18px 20px;">
    <h2 style="margin-top:0;">📋 Available Commands</h2>
    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:10px;">
        <?php
        $cmds = [
            ['🚀', 'elevator', '@user', 'Randomly move user through voice channels for 30s', '🎭 Troll'],
            ['👻', 'ghost', '@user', 'Timed haunting: 1m Free, 5m Premium, 10m Pro', '🎭 Troll'],
            ['🔇', 'mute', '@user', 'Timed mute bursts: 1m Free, 5m Premium, 10m Pro', '🎭 Troll'],
            ['🪞', 'mirror', '@user', 'Timed mirror: 1m Free, 5m Premium, 10m Pro', '🎭 Troll'],
            ['📞', 'deafen', '@user', 'Timed deafen bursts: 1m Free, 5m Premium, 10m Pro', '🎭 Troll'],
            ['💥', 'preset', '@user', 'Activate random combination of troll effects', '🎭 Troll'],
            ['🛑', 'presetstop', '@user', 'Stop ALL active trolls on a user immediately', '🎭 Troll'],
            ['🛡️', 'shield', '', 'Activate 2-hour troll immunity', '🛡️ Shield'],
            ['🎁', 'claim', '', 'Claim free shields (every 2.5h)', '🛡️ Shield'],
            ['🔍', 'checkshield', '@user?', 'Check shield status', '🛡️ Shield'],
            ['⚙️', 'settrollrole', '@role', 'Set which role can use troll commands (admin)', '⚙️ Admin'],
            ['⚙️', 'setrole', '@role', 'Set auto-move role (admin)', '⚙️ Admin'],
            ['🛑', 'globalstop', '', 'Emergency stop all trolls (admin)', '⚙️ Admin'],
            ['📊', 'status', '@user?', 'Show active trolls and shield status', '📊 Info'],
            ['❓', 'help', '', 'Show command list', '📊 Info'],
            ['🔔', 'notifysettings', '', 'Toggle DM notifications (premium)', '💎 Premium'],
        ];
        $catColors = ['🎭 Troll'=>'#5865F2','🛡️ Shield'=>'#57F287','⚙️ Admin'=>'#FEE75C','📊 Info'=>'#00AFF4','💎 Premium'=>'#FFD700'];
        foreach ($cmds as [$emoji, $name, $args, $desc, $cat]):
            $col = $catColors[$cat] ?? '#aaa';
        ?>
        <div style="background:#1a1a2e; border:1px solid #2a2a3e; border-radius:6px; padding:10px 12px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:var(--sp-1);">
                <code style="color:#7289da; font-size:0.9em;">/<?php echo $name; ?><?php echo $args ? ' <i style="color:#555;">'.$args.'</i>' : ''; ?></code>
                <span style="color:<?php echo $col; ?>; font-size:0.72em; white-space:nowrap;"><?php echo $cat; ?></span>
            </div>
            <p style="color:#999; font-size:0.8em; margin:0;"><?php echo esc($desc); ?></p>
        </div>
        <?php endforeach; ?>
    </div>
</div>

<?php include '../includes/footer.php'; ?>
