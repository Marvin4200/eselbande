<?php
$page_title = 'Überwachung';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();

// AJAX proxy
if (isset($_GET['ajax'])) {
    header('Content-Type: application/json');
    echo json_encode(getAPI('/monitor'));
    exit;
}

$data          = getAPI('/monitor');
$guilds        = $data['data']['guilds']            ?? [];
$total         = $data['data']['total']             ?? 0;
$totalTrolls   = $data['data']['totalActiveTrolls'] ?? 0;
$totalMembers  = $data['data']['totalMembers']      ?? 0;
$offline       = empty($guilds);

$verLevels = ['None', 'Low', 'Medium', 'High', 'Very High'];
$boostTiers = ['No Boost', 'Tier 1', 'Tier 2', 'Tier 3'];

function permBadge($ok, $label) {
    $color = $ok ? '#57F287' : '#ED4245';
    $icon  = $ok ? '✅' : '❌';
    return '<span style="display:inline-block;background:' . $color . '22;color:' . $color . ';border:1px solid ' . $color . '44;border-radius:4px;padding:2px 7px;font-size:0.75em;margin:2px;">' . $icon . ' ' . htmlspecialchars($label) . '</span>';
}

function trollBadge($count, $label, $emoji) {
    if ($count === 0) return '';
    return '<span style="display:inline-block;background:#ed424522;color:#ED4245;border:1px solid #ED424544;border-radius:4px;padding:2px 8px;font-size:0.78em;margin:2px;">' . $emoji . ' ' . htmlspecialchars($label) . ': ' . $count . '</span>';
}
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<div class="page-header">
    <h1>🔍 Überwachung</h1>
    <p class="subtitle"><?php echo $total; ?> Server · <?php echo number_format($totalMembers); ?> Mitglieder
        <?php if ($totalTrolls > 0): ?>
        · <span style="color:#ED4245;">⚡ <?php echo $totalTrolls; ?> aktive Trolls</span>
        <?php endif; ?>
    </p>
</div>

<?php if ($offline): ?>
<div class="section" style="color:#ED4245; padding:20px;">⚠️ Bot-API nicht erreichbar.</div>
<?php include '../includes/footer.php'; exit; ?>
<?php endif; ?>

<!-- Summary cards -->
<div style="display:flex; gap:14px; flex-wrap:wrap; margin-bottom:22px;">
    <div class="stat-card" style="flex:1; min-width:120px;">
        <div class="stat-value"><?php echo $total; ?></div>
        <div class="stat-label">Server</div>
    </div>
    <div class="stat-card" style="flex:1; min-width:120px;">
        <div class="stat-value"><?php echo number_format($totalMembers); ?></div>
        <div class="stat-label">Mitglieder</div>
    </div>
    <div class="stat-card" style="flex:1; min-width:120px;">
        <div class="stat-value" style="color:<?php echo $totalTrolls > 0 ? '#ED4245' : 'inherit'; ?>"><?php echo $totalTrolls; ?></div>
        <div class="stat-label">Aktive Trolls</div>
    </div>
    <div class="stat-card" style="flex:1; min-width:120px;">
        <div class="stat-value"><?php echo array_sum(array_column(array_column($guilds, 'channels'), 'voice')); ?></div>
        <div class="stat-label">Voice-Kanäle gesamt</div>
    </div>
</div>

<!-- Filters & Search -->
<div class="section" style="padding:14px 18px; margin-bottom:16px; display:flex; gap:14px; flex-wrap:wrap; align-items:center;">
    <input type="text" id="search" placeholder="🔍 Server suchen..." oninput="filterCards()"
        style="padding:8px 12px; border-radius:6px; border:1px solid #333; background:#1a1a2e; color:#e0e0e0; width:240px;">
    <select id="filterTrolls" onchange="filterCards()"
        style="padding:8px 10px; border-radius:6px; border:1px solid #333; background:#1a1a2e; color:#e0e0e0;">
        <option value="">Alle Server</option>
        <option value="active">⚡ Aktive Trolls</option>
        <option value="no-troll-role">⚠️ Kein Troll-Role konfiguriert</option>
        <option value="missing-perms">❌ Fehlende Berechtigungen</option>
    </select>
    <select id="sortBy" onchange="sortCards()"
        style="padding:8px 10px; border-radius:6px; border:1px solid #333; background:#1a1a2e; color:#e0e0e0;">
        <option value="trolls">Sortieren: Aktive Trolls</option>
        <option value="members">Sortieren: Mitglieder</option>
        <option value="name">Sortieren: Name</option>
        <option value="joined">Sortieren: Beitritt</option>
    </select>
    <span id="countLabel" style="color:#aaa; font-size:0.9em;"></span>
    <button onclick="refreshData()" style="margin-left:auto; padding:8px 16px; background:#5865F2; color:#fff; border:none; border-radius:6px; cursor:pointer;">🔄 Aktualisieren</button>
</div>

<!-- Server Cards -->
<div id="cardContainer">
<?php foreach ($guilds as $g):
    $trollTotal = $g['trolls']['total'] ?? 0;
    $perms      = $g['permissions'] ?? [];
    $ch         = $g['channels'] ?? [];
    $cfg        = $g['config'] ?? [];
    $roles      = $g['roles'] ?? [];
    $hasMissing = !($perms['moveMembers'] ?? false) || !($perms['manageNicknames'] ?? false) || !($perms['muteMembers'] ?? false);
    $noTrollRole= empty($cfg['trollRoleId']);
    $cardClass  = $trollTotal > 0 ? 'troll-active' : ($hasMissing ? 'perm-warn' : '');
    $boost      = $g['premiumTier'] ?? 0;
    $boostLabel = $boostTiers[$boost] ?? 'Tier '.$boost;
    $verif      = $g['verificationLevel'] ?? 0;
    $verifLabel = $verLevels[$verif] ?? 'Level '.$verif;
    $members    = $g['memberCount'] ?? 0;
    $blacklistedCount = $g['blacklistedInGuild'] ?? 0;
    $createdAt  = $g['createdAt'] ?? '';
    $joinedAt   = $g['joinedAt'] ?? '';
?>
<div class="section monitor-card <?php echo $cardClass; ?>"
     data-name="<?php echo esc(strtolower($g['name'])); ?>"
     data-trolls="<?php echo $trollTotal; ?>"
     data-members="<?php echo $members; ?>"
     data-joined="<?php echo $joinedAt; ?>"
     data-missing="<?php echo $hasMissing ? '1' : '0'; ?>"
     data-notrollrole="<?php echo $noTrollRole ? '1' : '0'; ?>"
     style="margin-bottom:18px; padding:0; overflow:hidden;">

    <!-- Card Header -->
    <div style="display:flex; align-items:center; gap:14px; padding:16px 20px;
         background:<?php echo $trollTotal > 0 ? 'rgba(237,66,69,0.08)' : 'rgba(88,101,242,0.06)'; ?>;
         border-bottom:1px solid #2a2a3e;">
        <?php if ($g['icon']): ?>
            <img src="<?php echo esc($g['icon']); ?>" alt="" style="width:52px;height:52px;border-radius:50%;flex-shrink:0;">
        <?php else: ?>
            <div style="width:52px;height:52px;border-radius:50%;background:#333;display:flex;align-items:center;justify-content:center;font-size:1.6em;flex-shrink:0;">🏰</div>
        <?php endif; ?>
        <div style="flex:1; min-width:0;">
            <div style="font-size:1.1em; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                <?php echo esc($g['name']); ?>
                <?php if ($boost > 0): ?><span style="color:#FF73FA; font-size:0.8em; margin-left:6px;">💎 <?php echo esc($boostLabel); ?></span><?php endif; ?>
            </div>
            <div style="color:#aaa; font-size:0.82em; margin-top:2px;">
                👑 <?php echo esc($g['ownerName']); ?>
                &nbsp;·&nbsp; 👥 <?php echo number_format($members); ?>
                <?php if ($blacklistedCount > 0): ?>&nbsp;·&nbsp; 🚫 <?php echo $blacklistedCount; ?> gesperrt<?php endif; ?>
                &nbsp;·&nbsp; ID: <?php echo esc($g['id']); ?>
            </div>
        </div>
        <!-- Troll indicator -->
        <?php if ($trollTotal > 0): ?>
        <div style="text-align:center; background:#ED424522; border:1px solid #ED424544; border-radius:8px; padding:8px 14px;">
            <div style="color:#ED4245; font-size:1.4em; font-weight:800; line-height:1;"><?php echo $trollTotal; ?></div>
            <div style="color:#ED4245; font-size:0.7em; margin-top:2px;">AKTIVE TROLLS</div>
        </div>
        <?php endif; ?>
        <!-- Expand toggle -->
        <button onclick="toggleCard(this)" style="background:transparent;border:1px solid #333;border-radius:6px;color:#aaa;padding:6px 10px;cursor:pointer;flex-shrink:0;">▼</button>
    </div>

    <!-- Active Troll Badges (always visible if any) -->
    <?php if ($trollTotal > 0): ?>
    <div style="padding:10px 20px; border-bottom:1px solid #2a2a3e; background:#1a1a1a;">
        <?php echo trollBadge($g['trolls']['elevator']['count'], 'Fahrstuhl', '🚀'); ?>
        <?php echo trollBadge($g['trolls']['ghost']['count'], 'Geist', '👻'); ?>
        <?php echo trollBadge($g['trolls']['silentPost']['count'], 'Stille Post', '🔇'); ?>
        <?php echo trollBadge($g['trolls']['mirror']['count'], 'Spiegel', '🪞'); ?>
        <?php echo trollBadge($g['trolls']['deafTroll']['count'], 'Tote Leitung', '📞'); ?>
        <?php
        // List trolled user IDs
        $allTrolled = array_merge(
            $g['trolls']['elevator']['users'] ?? [],
            $g['trolls']['ghost']['users'] ?? [],
            $g['trolls']['silentPost']['users'] ?? [],
            $g['trolls']['mirror']['users'] ?? [],
            $g['trolls']['deafTroll']['users'] ?? []
        );
        $uniqueTrolled = array_unique($allTrolled);
        if (!empty($uniqueTrolled)):
        ?>
        <span style="color:#aaa; font-size:0.75em; margin-left:8px;">Ziele: <?php echo implode(', ', array_map(fn($u) => '<code>'.esc($u).'</code>', $uniqueTrolled)); ?></span>
        <?php endif; ?>
    </div>
    <?php endif; ?>

    <!-- Collapsible Detail Panel -->
    <div class="card-details" style="display:none;">
        <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:0; border-bottom:1px solid #2a2a3e;">

            <!-- Overview -->
            <div style="padding:16px 20px; border-right:1px solid #2a2a3e;">
                <div style="color:#aaa; font-size:0.75em; text-transform:uppercase; letter-spacing:.05em; margin-bottom:10px;">📋 Übersicht</div>
                <table style="width:100%; font-size:0.82em; border-collapse:collapse;">
                    <tr><td style="color:#888; padding:3px 0; width:50%;">Erstellt</td><td><?php echo $createdAt ? date('d.m.Y', strtotime($createdAt)) : 'N/A'; ?></td></tr>
                    <tr><td style="color:#888; padding:3px 0;">Beigetreten</td><td><?php echo $joinedAt ? date('d.m.Y', strtotime($joinedAt)) : 'N/A'; ?></td></tr>
                    <tr><td style="color:#888; padding:3px 0;">Verifikation</td><td><?php echo esc($verifLabel); ?></td></tr>
                    <tr><td style="color:#888; padding:3px 0;">Boost-Level</td><td><?php echo esc($boostLabel); ?> (<?php echo (int)($g['premiumSubscriptionCount'] ?? 0); ?> Boosts)</td></tr>
                    <tr><td style="color:#888; padding:3px 0;">Blacklisted</td><td><?php echo $blaclkistedCount > 0 ? '<span style="color:#ED4245;">'.$blaclkistedCount.' User</span>' : '0'; ?></td></tr>
                    <tr><td style="color:#888; padding:3px 0;">Bot-Rang</td><td>#<?php echo (int)($g['permissions']['botRolePosition'] ?? 0); ?></td></tr>
                </table>
            </div>

            <!-- Channels & Roles -->
            <div style="padding:16px 20px; border-right:1px solid #2a2a3e;">
                <div style="color:#aaa; font-size:0.75em; text-transform:uppercase; letter-spacing:.05em; margin-bottom:10px;">📡 Kanäle & Rollen</div>
                <table style="width:100%; font-size:0.82em; border-collapse:collapse;">
                    <tr><td style="color:#888; padding:3px 0; width:50%;">Text</td><td><?php echo $ch['text'] ?? 0; ?></td></tr>
                    <tr><td style="color:#888; padding:3px 0;">Voice</td><td><?php echo $ch['voice'] ?? 0; ?></td></tr>
                    <tr><td style="color:#888; padding:3px 0;">Kategorien</td><td><?php echo $ch['categories'] ?? 0; ?></td></tr>
                    <?php if (($ch['stage'] ?? 0) > 0): ?>
                    <tr><td style="color:#888; padding:3px 0;">Stage</td><td><?php echo $ch['stage']; ?></td></tr>
                    <?php endif; ?>
                    <?php if (($ch['forum'] ?? 0) > 0): ?>
                    <tr><td style="color:#888; padding:3px 0;">Forum</td><td><?php echo $ch['forum']; ?></td></tr>
                    <?php endif; ?>
                    <tr><td style="color:#888; padding:3px 0;">Rollen</td><td><?php echo $roles['count'] ?? 0; ?></td></tr>
                </table>
                <?php if (!empty($roles['topRoles'])): ?>
                <div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:4px;">
                <?php foreach (array_slice($roles['topRoles'], 0, 6) as $role): ?>
                    <?php $hex = $role['color'] !== '#000000' ? $role['color'] : '#555'; ?>
                    <span style="background:<?php echo esc($hex); ?>22; color:<?php echo esc($hex); ?>; border:1px solid <?php echo esc($hex); ?>55;
                          border-radius:4px; padding:2px 7px; font-size:0.72em;"><?php echo esc($role['name']); ?></span>
                <?php endforeach; ?>
                </div>
                <?php endif; ?>
            </div>

            <!-- Config -->
            <div style="padding:16px 20px; border-right:1px solid #2a2a3e;">
                <div style="color:#aaa; font-size:0.75em; text-transform:uppercase; letter-spacing:.05em; margin-bottom:10px;">⚙️ Bot-Konfiguration</div>
                <table style="width:100%; font-size:0.82em; border-collapse:collapse;">
                    <tr>
                        <td style="color:#888; padding:3px 0; width:50%;">Troll-Role</td>
                        <td><?php if ($cfg['trollRoleId']): ?>
                            <span style="color:#57F287;"><?php echo esc($cfg['trollRoleName'] ?? $cfg['trollRoleId']); ?></span>
                        <?php else: ?>
                            <span style="color:#ED4245;">Nicht gesetzt</span>
                        <?php endif; ?></td>
                    </tr>
                    <tr>
                        <td style="color:#888; padding:3px 0;">Admin-Role</td>
                        <td><?php if ($cfg['adminRoleId']): ?>
                            <span style="color:#57F287;"><?php echo esc($cfg['adminRoleName'] ?? $cfg['adminRoleId']); ?></span>
                        <?php else: ?>
                            <span style="color:#FEE75C;">Nicht gesetzt</span>
                        <?php endif; ?></td>
                    </tr>
                </table>
            </div>

            <!-- Permissions -->
            <div style="padding:16px 20px;">
                <div style="color:#aaa; font-size:0.75em; text-transform:uppercase; letter-spacing:.05em; margin-bottom:10px;">🔑 Bot-Berechtigungen</div>
                <div style="display:flex; flex-direction:column; gap:3px;">
                    <?php echo permBadge($perms['administrator'] ?? false, 'Administrator'); ?>
                    <?php echo permBadge($perms['moveMembers'] ?? false, 'Move Members'); ?>
                    <?php echo permBadge($perms['manageNicknames'] ?? false, 'Manage Nicknames'); ?>
                    <?php echo permBadge($perms['muteMembers'] ?? false, 'Mute Members'); ?>
                    <?php echo permBadge($perms['deafenMembers'] ?? false, 'Deafen Members'); ?>
                    <?php echo permBadge($perms['manageRoles'] ?? false, 'Manage Roles'); ?>
                    <?php echo permBadge($perms['sendMessages'] ?? false, 'Send Messages'); ?>
                    <?php echo permBadge($perms['viewChannel'] ?? false, 'View Channels'); ?>
                </div>
            </div>

        </div>

        <!-- Discord Features -->
        <?php if (!empty($g['features'])): ?>
        <div style="padding:10px 20px; border-top:1px solid #2a2a3e; background:#111;">
            <span style="color:#666; font-size:0.72em; text-transform:uppercase; margin-right:8px;">Features:</span>
            <?php foreach ($g['features'] as $feat): ?>
            <span style="display:inline-block; background:#1a1a2e; color:#7289da; border:1px solid #2a2a4e; border-radius:4px;
                  padding:2px 7px; font-size:0.72em; margin:2px;"><?php echo esc(str_replace('_', ' ', $feat)); ?></span>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>
    </div>

</div>
<?php endforeach; ?>
</div>

<?php if (empty($guilds)): ?>
<div class="section"><p style="color:#999;">Keine Server-Daten – ist der Bot online?</p></div>
<?php endif; ?>

<style>
.monitor-card { border-radius: 10px; }
.monitor-card.troll-active { border: 1px solid rgba(237,66,69,0.35) !important; }
.monitor-card.perm-warn    { border: 1px solid rgba(254,231,92,0.25) !important; }
</style>

<script>
function toggleCard(btn) {
    const card = btn.closest('.monitor-card');
    const details = card.querySelector('.card-details');
    const open = details.style.display === 'block';
    details.style.display = open ? 'none' : 'block';
    btn.textContent = open ? '▼' : '▲';
}

function filterCards() {
    const q       = document.getElementById('search').value.toLowerCase();
    const filter  = document.getElementById('filterTrolls').value;
    const cards   = document.querySelectorAll('.monitor-card');
    let visible   = 0;
    cards.forEach(c => {
        const matchName    = !q || c.dataset.name.includes(q);
        const matchFilter  = !filter ||
            (filter === 'active'         && parseInt(c.dataset.trolls) > 0) ||
            (filter === 'no-troll-role'  && c.dataset.notrollrole === '1') ||
            (filter === 'missing-perms'  && c.dataset.missing === '1');
        const show = matchName && matchFilter;
        c.style.display = show ? '' : 'none';
        if (show) visible++;
    });
    document.getElementById('countLabel').textContent = `${visible} von <?php echo count($guilds); ?> Servern`;
}

function sortCards() {
    const by   = document.getElementById('sortBy').value;
    const cont = document.getElementById('cardContainer');
    const cards = [...cont.querySelectorAll('.monitor-card')];
    cards.sort((a, b) => {
        if (by === 'trolls')   return parseInt(b.dataset.trolls) - parseInt(a.dataset.trolls);
        if (by === 'members')  return parseInt(b.dataset.members) - parseInt(a.dataset.members);
        if (by === 'name')     return a.dataset.name.localeCompare(b.dataset.name);
        if (by === 'joined')   return (a.dataset.joined > b.dataset.joined ? -1 : 1);
        return 0;
    });
    cards.forEach(c => cont.appendChild(c));
}

function refreshData() {
    fetch('?ajax=1')
        .then(r => r.json())
        .then(d => {
            if (d?.data?.totalActiveTrolls !== undefined) {
                location.reload();
            }
        });
}

// Initial count
filterCards();

// Auto-refresh every 30s
setInterval(() => location.reload(), 30000);
</script>

<?php include '../includes/footer.php'; ?>
