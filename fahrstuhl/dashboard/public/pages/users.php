<?php
$page_title = 'Users';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();

$limit  = max(1, min(200, (int)($_GET['limit'] ?? 100)));
$offset = max(0, (int)($_GET['offset'] ?? 0));

$raw     = getAPI("/users-rich?limit=$limit&offset=$offset");
$users   = $raw['data']['users']   ?? [];
$total   = $raw['data']['total']   ?? 0;
$summary = $raw['data']['summary'] ?? [];
$offline = ($raw === null || !isset($raw['data']));

function avatarHtml($u) {
    $av = htmlspecialchars($u['avatar'] ?? '');
    $name = htmlspecialchars($u['username'] ?? $u['userId'] ?? '?');
    return "<img src=\"$av\" alt=\"\" style=\"width:36px;height:36px;border-radius:50%;vertical-align:middle;\" onerror=\"this.style.display='none'\">";
}
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<div class="page-header">
    <h1>👥 User Statistics</h1>
    <p class="subtitle"><?php echo number_format($total); ?> tracked users</p>
</div>

<?php if ($offline): ?>
<div class="section" style="color:#ED4245; padding:20px;">⚠️ Bot-API nicht erreichbar.</div>
<?php include '../includes/footer.php'; exit; ?>
<?php endif; ?>

<!-- Summary cards -->
<div style="display:flex; gap:14px; flex-wrap:wrap; margin-bottom:22px;">
    <div class="stat-card" style="flex:1; min-width:110px;">
        <div class="stat-value"><?php echo number_format($total); ?></div>
        <div class="stat-label">Users gesamt</div>
    </div>
    <div class="stat-card" style="flex:1; min-width:110px;">
        <div class="stat-value" style="color:#FFD700;"><?php echo $summary['premiumCount'] ?? 0; ?></div>
        <div class="stat-label">⭐ Premium</div>
    </div>
    <div class="stat-card" style="flex:1; min-width:110px;">
        <div class="stat-value" style="color:#57F287;"><?php echo $summary['shieldCount'] ?? 0; ?></div>
        <div class="stat-label">🛡️ Aktive Shields</div>
    </div>
    <div class="stat-card" style="flex:1; min-width:110px;">
        <div class="stat-value" style="color:#ED4245;"><?php echo $summary['blacklistCount'] ?? 0; ?></div>
        <div class="stat-label">🚫 Blacklisted</div>
    </div>
    <div class="stat-card" style="flex:1; min-width:110px;">
        <div class="stat-value"><?php echo number_format($summary['avgCmds'] ?? 0); ?></div>
        <div class="stat-label">⌀ Cmds/User</div>
    </div>
</div>

<!-- Filters + Search -->
<div class="section" style="padding:14px 18px; margin-bottom:16px; display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
    <input type="text" id="search" placeholder="🔍 Username / User-ID suchen..." oninput="filterTable()"
        style="padding:8px 12px; border-radius:6px; border:1px solid #333; background:#1a1a2e; color:#e0e0e0; width:240px;">
    <select id="filterStatus" onchange="filterTable()"
        style="padding:8px 10px; border-radius:6px; border:1px solid #333; background:#1a1a2e; color:#e0e0e0;">
        <option value="">Alle</option>
        <option value="premium">⭐ Premium</option>
        <option value="shield">🛡️ Aktiver Shield</option>
        <option value="blacklisted">🚫 Blacklisted</option>
        <option value="notify">🔔 Benachrichtigungen</option>
    </select>
    <span id="rowCount" style="color:#aaa; font-size:0.9em;"></span>

    <!-- Pagination -->
    <div style="margin-left:auto; display:flex; gap:8px; align-items:center;">
        <?php if ($offset > 0): ?>
        <a href="?limit=<?php echo $limit; ?>&offset=<?php echo max(0,$offset-$limit); ?>" class="btn-primary" style="padding:6px 14px;">← Zurück</a>
        <?php endif; ?>
        <?php if ($offset + $limit < $total): ?>
        <a href="?limit=<?php echo $limit; ?>&offset=<?php echo $offset+$limit; ?>" class="btn-primary" style="padding:6px 14px;">Weiter →</a>
        <?php endif; ?>
        <span style="color:#666; font-size:0.85em;"><?php echo $offset+1; ?>–<?php echo min($offset+$limit,$total); ?> / <?php echo number_format($total); ?></span>
    </div>
</div>

<!-- Table -->
<div class="section" style="padding:0; overflow:auto;">
<table class="table" id="userTable" style="min-width:900px;">
    <thead>
        <tr>
            <th style="width:44px;"></th>
            <th onclick="sortTable('name')" style="cursor:pointer;">👤 User <span class="sort-icon"></span></th>
            <th onclick="sortTable('cmds')" style="cursor:pointer;">⌨️ Cmds <span class="sort-icon"></span></th>
            <th onclick="sortTable('errs')" style="cursor:pointer;">❌ Fehler% <span class="sort-icon"></span></th>
            <th>🏆 Top Command</th>
            <th onclick="sortTable('guilds')" style="cursor:pointer;">🏰 Server <span class="sort-icon"></span></th>
            <th>⭐ Premium</th>
            <th>🛡️ Shield</th>
            <th>Status</th>
            <th onclick="sortTable('last')" style="cursor:pointer;">🕐 Zuletzt aktiv <span class="sort-icon"></span></th>
        </tr>
    </thead>
    <tbody id="tbody">
    <?php if (empty($users)): ?>
        <tr><td colspan="10" style="text-align:center; padding:2rem; color:#999;">Keine User-Daten vorhanden.</td></tr>
    <?php else: ?>
    <?php foreach ($users as $u):
        $uid        = esc($u['userId'] ?? '');
        $uname      = $u['username'] ?? null;
        $gname      = $u['globalName'] ?? null;
        $displayName = $uname ? esc($uname) : ('<code style="font-size:0.8em;">' . $uid . '</code>');
        $isPremium  = $u['premium']['active'] ?? false;
        $premExpiry = $u['premium']['expiresAt'] ?? null;
        $shActive   = $u['shields']['active'] ?? false;
        $shOwned    = $u['shields']['owned'] ?? 0;
        $shExpiry   = $u['shields']['expiresAt'] ?? null;
        $isBlack    = $u['blacklisted'] ?? false;
        $notif      = $u['notificationsEnabled'] ?? false;
        $cmds       = (int)($u['commandCount'] ?? 0);
        $errRate    = (int)($u['errorRate'] ?? 0);
        $errColor   = $errRate >= 30 ? '#ED4245' : ($errRate >= 10 ? '#FEE75C' : '#57F287');
        $guilds     = (int)($u['activeGuilds'] ?? 0);
        $lastUsed   = $u['lastUsed'] ?? null;
        $topCmd     = $u['topCommand'] ?? null;
        $lastUsedFmt = $lastUsed ? date('d.m.Y H:i', strtotime($lastUsed)) : 'N/A';

        // data attributes for filter/sort
        $statusFlags = implode(' ', array_filter([
            $isPremium ? 'premium' : '',
            $shActive  ? 'shield'  : '',
            $isBlack   ? 'blacklisted' : '',
            $notif     ? 'notify'  : '',
        ]));
        $searchText = strtolower(($uname ?? '') . ' ' . $uid);
    ?>
    <tr data-status="<?php echo esc($statusFlags); ?>"
        data-search="<?php echo esc($searchText); ?>"
        data-cmds="<?php echo $cmds; ?>"
        data-errs="<?php echo $errRate; ?>"
        data-guilds="<?php echo $guilds; ?>"
        data-last="<?php echo esc($lastUsed ?? ''); ?>"
        data-name="<?php echo esc(strtolower($uname ?? $uid)); ?>">
        <td><?php echo avatarHtml($u); ?></td>
        <td>
            <div style="font-weight:600;"><?php echo $displayName; ?></div>
            <?php if ($gname && $gname !== $uname): ?>
                <div style="color:#aaa; font-size:0.78em;"><?php echo esc($gname); ?></div>
            <?php endif; ?>
            <div style="color:#555; font-size:0.72em; font-family:monospace;"><?php echo $uid; ?></div>
        </td>
        <td style="font-weight:700; font-size:1.05em;"><?php echo number_format($cmds); ?></td>
        <td>
            <?php if ($cmds > 0): ?>
            <span style="color:<?php echo $errColor; ?>; font-weight:600;"><?php echo $errRate; ?>%</span>
            <span style="color:#666; font-size:0.78em;">(<?php echo (int)($u['errorCount'] ?? 0); ?>)</span>
            <?php else: ?>
            <span style="color:#444;">—</span>
            <?php endif; ?>
        </td>
        <td>
            <?php if ($topCmd): ?>
            <code style="background:#1a1a2e; padding:2px 6px; border-radius:4px; font-size:0.82em;">/<?php echo esc($topCmd['command']); ?></code>
            <span style="color:#666; font-size:0.78em;">(<?php echo number_format($topCmd['count']); ?>x)</span>
            <?php else: ?><span style="color:#444;">—</span><?php endif; ?>
        </td>
        <td style="text-align:center;"><?php echo $guilds ?: '<span style="color:#444;">—</span>'; ?></td>
        <td>
            <?php if ($isPremium): ?>
            <span style="color:#FFD700; font-weight:600;">⭐ Aktiv</span>
            <?php if ($premExpiry): ?>
            <div style="color:#888; font-size:0.75em;">bis <?php echo date('d.m.Y', strtotime($premExpiry)); ?></div>
            <?php endif; ?>
            <?php else: ?>
            <span style="color:#444;">—</span>
            <?php endif; ?>
            <div style="margin-top:4px; display:flex; gap:4px;">
                <button onclick="premiumAction('<?php echo $isPremium ? 'extend' : 'activate'; ?>','<?= $uid ?>','<?= esc($uname ?? $uid) ?>')"
                    style="background:#FFD70022; color:#FFD700; border:1px solid #FFD70044; border-radius:4px; padding:2px 7px; font-size:0.75em; cursor:pointer;">
                    <?php echo $isPremium ? '+ Verlängern' : '⭐ Aktivieren'; ?>
                </button>
                <?php if ($isPremium): ?>
                <button onclick="deactivatePremium('<?= $uid ?>')"
                    style="background:#ED424522; color:#ED4245; border:1px solid #ED424544; border-radius:4px; padding:2px 7px; font-size:0.75em; cursor:pointer;">
                    Deaktivieren
                </button>
                <?php endif; ?>
            </div>
        </td>
        <td>
            <?php if ($shActive): ?>
            <span style="color:#57F287; font-weight:600;">🛡️ Aktiv</span>
            <?php if ($shExpiry): ?>
            <div style="color:#888; font-size:0.75em;">bis <?php echo date('d.m.Y H:i', strtotime($shExpiry)); ?></div>
            <?php endif; ?>
            <button onclick="clearShield('<?= $uid ?>')" title="Aktiven Shield entfernen"
                style="margin-top:4px; background:#ED424522; color:#ED4245; border:1px solid #ED424544; border-radius:4px; padding:2px 7px; font-size:0.75em; cursor:pointer;">✕ Clear</button>
            <?php elseif ($shOwned > 0): ?>
            <span style="color:#888;">🛡️ <?php echo $shOwned; ?>x</span>
            <?php else: ?>
            <span style="color:#444;">—</span>
            <?php endif; ?>
            <div style="margin-top:4px; display:flex; gap:4px;">
                <button onclick="shieldAction('give','<?= $uid ?>','<?= esc($uname ?? $uid) ?>')"
                    style="background:#57F28722; color:#57F287; border:1px solid #57F28744; border-radius:4px; padding:2px 7px; font-size:0.75em; cursor:pointer;">+ Geben</button>
                <button onclick="shieldAction('take','<?= $uid ?>','<?= esc($uname ?? $uid) ?>')"
                    style="background:#FEE75C22; color:#FEE75C; border:1px solid #FEE75C44; border-radius:4px; padding:2px 7px; font-size:0.75em; cursor:pointer;">− Nehmen</button>
            </div>
        </td>
        <td>
            <?php if ($isBlack): ?>
            <span style="background:#ED424522; color:#ED4245; border:1px solid #ED424544;
                  border-radius:4px; padding:2px 6px; font-size:0.78em;">🚫 Blacklist</span>
            <?php foreach (($u['blacklistEntries'] ?? []) as $bl): ?>
            <div style="color:#888; font-size:0.72em; margin-top:2px;" title="<?php echo esc($bl['reason'] ?? ''); ?>">
                <?php echo esc($bl['type']); ?><?php echo $bl['guildId'] ? ' (Guild)' : ''; ?>
            </div>
            <?php endforeach; ?>
            <?php endif; ?>
            <?php if ($notif): ?>
            <span style="background:#5865F222; color:#7289da; border:1px solid #5865F244;
                  border-radius:4px; padding:2px 6px; font-size:0.78em; display:inline-block; margin-top:2px;">🔔 Notif</span>
            <?php endif; ?>
            <?php if (!$isBlack && !$notif): ?><span style="color:#444;">—</span><?php endif; ?>
        </td>
        <td style="color:#aaa; font-size:0.82em; white-space:nowrap;"><?php echo $lastUsedFmt; ?></td>
    </tr>
    <?php endforeach; ?>
    <?php endif; ?>
    </tbody>
</table>
</div>

<style>
.table th[onclick]:hover { background: rgba(255,255,255,0.05); }
.sort-icon::after { content: ' ⇅'; color: #555; font-size: 0.8em; }
</style>

<script>
let sortKey = 'cmds', sortDir = -1;

function filterTable() {
    const q      = document.getElementById('search').value.toLowerCase();
    const status = document.getElementById('filterStatus').value;
    const rows   = document.querySelectorAll('#tbody tr[data-search]');
    let visible  = 0;
    rows.forEach(r => {
        const matchQ = !q || r.dataset.search.includes(q);
        const matchS = !status || r.dataset.status.includes(status);
        r.style.display = (matchQ && matchS) ? '' : 'none';
        if (matchQ && matchS) visible++;
    });
    document.getElementById('rowCount').textContent = `${visible} von <?php echo count($users); ?> angezeigt`;
}

function sortTable(key) {
    if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = -1; }
    const tbody = document.getElementById('tbody');
    const rows  = [...tbody.querySelectorAll('tr[data-search]')];
    rows.sort((a, b) => {
        const va = a.dataset[key] ?? '';
        const vb = b.dataset[key] ?? '';
        const na = parseFloat(va), nb = parseFloat(vb);
        if (!isNaN(na) && !isNaN(nb)) return (na - nb) * sortDir;
        return va.localeCompare(vb) * sortDir;
    });
    rows.forEach(r => tbody.appendChild(r));
}

filterTable();
</script>

<!-- Shield Management Modal -->
<div id="shieldModal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:9999; align-items:center; justify-content:center;">
    <div style="background:#1a1a2e; border:1px solid #333; border-radius:12px; padding:1.75rem; min-width:320px; max-width:400px;">
        <h3 id="shieldModalTitle" style="margin:0 0 1rem; font-size:1.1rem;">🛡️ Shields verwalten</h3>
        <div style="color:#aaa; font-size:.85rem; margin-bottom:1rem;">User: <strong id="shieldModalUser"></strong></div>
        <label style="font-size:.9rem; color:#ccc;">Anzahl</label>
        <input id="shieldAmount" type="number" min="1" max="9999" value="1"
            style="width:100%; padding:.6rem .9rem; margin-top:.4rem; background:#0f0f1a; border:1px solid #444; color:#fff; border-radius:6px; font-size:1rem; box-sizing:border-box;">
        <div style="display:flex; gap:.75rem; margin-top:1.25rem;">
            <button id="shieldConfirmBtn"
                style="flex:1; padding:.65rem; border:none; border-radius:7px; font-weight:700; cursor:pointer; font-size:.95rem;">Bestätigen</button>
            <button onclick="document.getElementById('shieldModal').style.display='none'"
                style="flex:1; padding:.65rem; background:#333; color:#ccc; border:none; border-radius:7px; font-weight:600; cursor:pointer;">Abbrechen</button>
        </div>
        <div id="shieldModalMsg" style="margin-top:.75rem; font-size:.85rem; min-height:1.2em;"></div>
    </div>
</div>

<script>
const DASHBOARD_CSRF_TOKEN = '<?php echo esc(dashboardCsrfToken()); ?>';

let _shieldAction = '', _shieldUserId = '';

function shieldAction(action, userId, username) {
    _shieldAction = action;
    _shieldUserId = userId;
    const isGive = action === 'give';
    document.getElementById('shieldModalTitle').textContent = isGive ? '🛡️ Shields geben' : '🛡️ Shields nehmen';
    document.getElementById('shieldModalUser').textContent = username;
    document.getElementById('shieldAmount').value = 1;
    document.getElementById('shieldModalMsg').textContent = '';
    const btn = document.getElementById('shieldConfirmBtn');
    btn.textContent = isGive ? '+ Geben' : '− Nehmen';
    btn.style.background = isGive ? '#57F287' : '#FEE75C';
    btn.style.color = '#000';
    document.getElementById('shieldModal').style.display = 'flex';
}

document.getElementById('shieldConfirmBtn').onclick = async () => {
    const amount = parseInt(document.getElementById('shieldAmount').value);
    const msgEl = document.getElementById('shieldModalMsg');
    if (isNaN(amount) || amount < 1) { msgEl.style.color='#ED4245'; msgEl.textContent='❌ Ungültige Anzahl'; return; }
    msgEl.style.color='#aaa'; msgEl.textContent='⏳ Wird gespeichert...';
    try {
        const r = await fetch(`${BASE_URL}/pages/shield-api.php?action=${_shieldAction}`, {
            method:'POST', headers:{'Content-Type':'application/json', 'X-CSRF-Token': DASHBOARD_CSRF_TOKEN},
            body: JSON.stringify({ userId: _shieldUserId, amount })
        });
        const d = await r.json();
        if (d.success) {
            msgEl.style.color='#57F287';
            msgEl.textContent = `✅ Gespeichert! Neues Inventar: ${d.data?.shieldsOwned ?? '?'} Shields`;
            setTimeout(() => { document.getElementById('shieldModal').style.display='none'; location.reload(); }, 1200);
        } else {
            msgEl.style.color='#ED4245'; msgEl.textContent='❌ Fehler: ' + (d.message ?? 'Unbekannt');
        }
    } catch(e) { msgEl.style.color='#ED4245'; msgEl.textContent='❌ API nicht erreichbar'; }
};

async function clearShield(userId) {
    if (!confirm('Aktiven Shield für diesen User entfernen?')) return;
    try {
        const r = await fetch(`${BASE_URL}/pages/shield-api.php?action=clear-active`, {
            method:'POST', headers:{'Content-Type':'application/json', 'X-CSRF-Token': DASHBOARD_CSRF_TOKEN},
            body: JSON.stringify({ userId })
        });
        const d = await r.json();
        if (d.success) { alert('✅ Aktiver Shield entfernt!'); location.reload(); }
        else alert('❌ Fehler: ' + (d.message ?? 'Unbekannt'));
    } catch(e) { alert('❌ API nicht erreichbar'); }
}
</script>

<!-- Premium Management Modal -->
<div id="premiumModal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:9999; align-items:center; justify-content:center;">
    <div style="background:#1a1a2e; border:1px solid #333; border-radius:12px; padding:1.75rem; min-width:320px; max-width:420px;">
        <h3 id="premiumModalTitle" style="margin:0 0 1rem; font-size:1.1rem;">⭐ Premium verwalten</h3>
        <div style="color:#aaa; font-size:.85rem; margin-bottom:1rem;">User: <strong id="premiumModalUser"></strong></div>
        <label style="font-size:.9rem; color:#ccc;">Tage</label>
        <input id="premiumDays" type="number" min="1" max="3650" value="30"
            style="width:100%; padding:.6rem .9rem; margin-top:.4rem; background:#0f0f1a; border:1px solid #444; color:#fff; border-radius:6px; font-size:1rem; box-sizing:border-box;">
        <label style="font-size:.9rem; color:#ccc; margin-top:.8rem; display:block;">Tier</label>
        <select id="premiumTier"
            style="width:100%; padding:.6rem .9rem; margin-top:.4rem; background:#0f0f1a; border:1px solid #444; color:#fff; border-radius:6px; font-size:1rem; box-sizing:border-box;">
            <option value="basic">basic</option>
            <option value="pro" selected>pro</option>
            <option value="enterprise">enterprise</option>
        </select>
        <div style="display:flex; gap:.75rem; margin-top:1.25rem;">
            <button id="premiumConfirmBtn"
                style="flex:1; padding:.65rem; border:none; border-radius:7px; font-weight:700; cursor:pointer; font-size:.95rem;">Bestätigen</button>
            <button onclick="document.getElementById('premiumModal').style.display='none'"
                style="flex:1; padding:.65rem; background:#333; color:#ccc; border:none; border-radius:7px; font-weight:600; cursor:pointer;">Abbrechen</button>
        </div>
        <div id="premiumModalMsg" style="margin-top:.75rem; font-size:.85rem; min-height:1.2em;"></div>
    </div>
</div>

<script>
let _premiumAction = '', _premiumUserId = '';

function premiumAction(action, userId, username) {
    _premiumAction = action;
    _premiumUserId = userId;
    const title = action === 'extend' ? '⭐ Premium verlängern' : '⭐ Premium aktivieren';
    const btnText = action === 'extend' ? '+ Verlängern' : 'Aktivieren';
    document.getElementById('premiumModalTitle').textContent = title;
    document.getElementById('premiumModalUser').textContent = username;
    document.getElementById('premiumDays').value = 30;
    document.getElementById('premiumModalMsg').textContent = '';
    const btn = document.getElementById('premiumConfirmBtn');
    btn.textContent = btnText;
    btn.style.background = '#FFD700';
    btn.style.color = '#000';
    document.getElementById('premiumModal').style.display = 'flex';
}

document.getElementById('premiumConfirmBtn').onclick = async () => {
    const days = parseInt(document.getElementById('premiumDays').value, 10);
    const tier = document.getElementById('premiumTier').value;
    const msgEl = document.getElementById('premiumModalMsg');
    if (isNaN(days) || days < 1) { msgEl.style.color='#ED4245'; msgEl.textContent='❌ Ungültige Tage'; return; }
    msgEl.style.color='#aaa'; msgEl.textContent='⏳ Wird gespeichert...';
    try {
        const r = await fetch(`${BASE_URL}/pages/premium-api.php?action=${_premiumAction}`, {
            method:'POST',
            headers:{'Content-Type':'application/json', 'X-CSRF-Token': DASHBOARD_CSRF_TOKEN},
            body: JSON.stringify({ userId: _premiumUserId, days, tier })
        });
        const d = await r.json();
        if (d.success) {
            msgEl.style.color='#57F287';
            msgEl.textContent = '✅ Premium aktualisiert';
            setTimeout(() => { document.getElementById('premiumModal').style.display='none'; location.reload(); }, 1000);
        } else {
            msgEl.style.color='#ED4245';
            msgEl.textContent = '❌ Fehler: ' + (d.message ?? d.error ?? 'Unbekannt');
        }
    } catch(e) {
        msgEl.style.color='#ED4245';
        msgEl.textContent='❌ API nicht erreichbar';
    }
};

async function deactivatePremium(userId) {
    if (!confirm('Premium für diesen User deaktivieren?')) return;
    try {
        const r = await fetch(`${BASE_URL}/pages/premium-api.php?action=deactivate`, {
            method:'POST',
            headers:{'Content-Type':'application/json', 'X-CSRF-Token': DASHBOARD_CSRF_TOKEN},
            body: JSON.stringify({ userId })
        });
        const d = await r.json();
        if (d.success) { alert('✅ Premium deaktiviert!'); location.reload(); }
        else alert('❌ Fehler: ' + (d.message ?? d.error ?? 'Unbekannt'));
    } catch(e) {
        alert('❌ API nicht erreichbar');
    }
}
</script>

<?php include '../includes/footer.php'; ?>
