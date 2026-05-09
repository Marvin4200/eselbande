<?php
$page_title = 'Server-Pläne vergeben';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.gp-layout { display: grid; gap: 1rem; }
.gp-form-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 14px;
    padding: 1.25rem 1.4rem;
}
.gp-form-card h2 {
    font-size: 1rem;
    font-weight: 800;
    margin: 0 0 1rem;
    display: flex;
    align-items: center;
    gap: .45rem;
}
.gp-field { display: flex; flex-direction: column; gap: .3rem; margin-bottom: .8rem; }
.gp-field label { font-size: .78rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: .04em; }
.gp-input {
    background: rgba(255,255,255,.04);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    color: var(--text-primary);
    padding: .5rem .7rem;
    font-size: .9rem;
    width: 100%;
    outline: none;
    transition: border-color .14s;
}
.gp-input:focus { border-color: var(--primary); }

.gp-tier-row { display: flex; gap: .5rem; }
.gp-tier-btn {
    flex: 1;
    padding: .5rem;
    border-radius: 8px;
    border: 1px solid var(--border-light);
    background: rgba(255,255,255,.03);
    color: var(--text-secondary);
    font-size: .82rem;
    font-weight: 700;
    cursor: pointer;
    text-align: center;
    transition: all .14s;
}
.gp-tier-btn:hover { border-color: var(--primary); color: var(--text-primary); }
.gp-tier-btn.active { border-color: var(--primary); background: rgba(88,101,242,.15); color: var(--text-primary); }
.gp-tier-btn.active-pro { border-color: #a855f7; background: rgba(168,85,247,.15); color: #d8b4fe; }

.gp-day-presets { display: flex; gap: .4rem; flex-wrap: wrap; margin-top: .35rem; }
.gp-day-btn {
    padding: .28rem .65rem;
    border-radius: 6px;
    border: 1px solid var(--border-light);
    background: rgba(255,255,255,.03);
    color: var(--text-secondary);
    font-size: .78rem;
    font-weight: 700;
    cursor: pointer;
    transition: all .12s;
}
.gp-day-btn:hover { border-color: var(--primary); color: var(--text-primary); }

.gp-preview {
    display: none;
    background: rgba(32,38,49,.7);
    border: 1px solid var(--border-light);
    border-radius: 10px;
    padding: .75rem .9rem;
    margin-bottom: .8rem;
    gap: .65rem;
    align-items: center;
}
.gp-preview.visible { display: flex; }
.gp-preview img { width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0; }
.gp-preview-fallback { width: 40px; height: 40px; border-radius: 50%; background: rgba(88,101,242,.3); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; flex-shrink: 0; }
.gp-preview-info { display: flex; flex-direction: column; gap: .12rem; flex: 1; min-width: 0; }
.gp-preview-name { font-size: .9rem; font-weight: 800; }
.gp-preview-meta { font-size: .75rem; color: var(--text-secondary); }
.gp-preview-badge { font-size: .72rem; font-weight: 700; padding: .2rem .55rem; border-radius: 999px; white-space: nowrap; }
.gp-badge-free { background: rgba(52,61,77,.8); color: var(--text-secondary); }
.gp-badge-basic { background: rgba(255,212,59,.15); color: #ffd43b; border: 1px solid rgba(255,212,59,.3); }
.gp-badge-pro { background: rgba(168,85,247,.15); color: #d8b4fe; border: 1px solid rgba(168,85,247,.3); }

.gp-action-row { display: flex; gap: .55rem; flex-wrap: wrap; }
.gp-btn {
    padding: .48rem .9rem;
    border-radius: 8px;
    font-size: .85rem;
    font-weight: 700;
    cursor: pointer;
    border: none;
    transition: opacity .14s;
    display: inline-flex;
    align-items: center;
    gap: .35rem;
}
.gp-btn:disabled { opacity: .5; cursor: not-allowed; }
.gp-btn-primary { background: var(--primary); color: #fff; }
.gp-btn-primary:hover:not(:disabled) { opacity: .85; }
.gp-btn-extend { background: rgba(51,209,122,.15); color: #51cf66; border: 1px solid rgba(51,209,122,.3); }
.gp-btn-extend:hover:not(:disabled) { background: rgba(51,209,122,.25); }
.gp-btn-danger { background: rgba(237,66,69,.12); color: #ed4245; border: 1px solid rgba(237,66,69,.25); }
.gp-btn-danger:hover:not(:disabled) { background: rgba(237,66,69,.22); }

.gp-result {
    display: none;
    padding: .6rem .85rem;
    border-radius: 8px;
    font-size: .85rem;
    font-weight: 600;
    margin-top: .6rem;
}
.gp-result.visible { display: block; }
.gp-result.success { background: rgba(51,209,122,.12); color: #51cf66; border: 1px solid rgba(51,209,122,.25); }
.gp-result.error { background: rgba(237,66,69,.12); color: #ed4245; border: 1px solid rgba(237,66,69,.25); }

/* Active grants table */
.gp-grants-table { width: 100%; border-collapse: collapse; font-size: .85rem; }
.gp-grants-table th { color: var(--text-secondary); font-size: .72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; padding: .4rem .6rem; text-align: left; border-bottom: 1px solid var(--border-light); }
.gp-grants-table td { padding: .55rem .6rem; border-bottom: 1px solid rgba(52,61,77,.45); vertical-align: middle; }
.gp-grants-table tr:last-child td { border-bottom: none; }
.gp-grants-icon { width: 28px; height: 28px; border-radius: 50%; vertical-align: middle; margin-right: .4rem; }
.gp-grants-empty { padding: 1.5rem; text-align: center; color: var(--text-secondary); font-size: .85rem; }
.gp-loading { color: var(--text-secondary); font-size: .82rem; animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 0%,100%{opacity:.6} 50%{opacity:1} }
</style>

<div class="gp-layout">

    <!-- Header -->
    <div class="page-header">
        <div class="page-header-row">
            <div>
                <h1>👑 Server-Pläne vergeben</h1>
                <p class="subtitle">Premium für einen Server aktivieren, verlängern oder entfernen.</p>
            </div>
        </div>
    </div>

    <!-- Grant Form -->
    <div class="gp-form-card">
        <h2>🏰 Premium vergeben</h2>

        <!-- Guild ID lookup -->
        <div class="gp-field">
            <label>Server-ID</label>
            <div style="display:flex; gap:.5rem;">
                <input type="text" id="gpGuildId" class="gp-input" placeholder="z.B. 483321401529597962" maxlength="20" pattern="\d{17,20}"
                    style="flex:1;" autocomplete="off" spellcheck="false">
                <button class="gp-btn gp-btn-primary" id="gpLookupBtn" type="button">🔍 Suchen</button>
            </div>
            <span style="font-size:.73rem; color:var(--text-secondary);">Rechtsklick auf Server in Discord → "Server-ID kopieren" (Entwicklermodus muss aktiv sein)</span>
        </div>

        <!-- Guild Preview -->
        <div class="gp-preview" id="gpPreview">
            <div class="gp-preview-fallback" id="gpPreviewFallback">🏰</div>
            <img id="gpPreviewIcon" src="" alt="" style="display:none;" onerror="this.style.display='none'; document.getElementById('gpPreviewFallback').style.display='flex';">
            <div class="gp-preview-info">
                <span class="gp-preview-name" id="gpPreviewName">—</span>
                <span class="gp-preview-meta" id="gpPreviewMeta">—</span>
            </div>
            <span class="gp-preview-badge gp-badge-free" id="gpPreviewBadge">Free</span>
        </div>

        <!-- Tier -->
        <div class="gp-field">
            <label>Plan</label>
            <div class="gp-tier-row">
                <button type="button" class="gp-tier-btn" data-tier="basic" id="gpTierBasic">💎 Basic</button>
                <button type="button" class="gp-tier-btn active-pro active" data-tier="pro" id="gpTierPro">👑 Pro</button>
            </div>
        </div>

        <!-- Days -->
        <div class="gp-field">
            <label>Laufzeit (Tage)</label>
            <input type="number" id="gpDays" class="gp-input" value="30" min="1" max="3650" style="width:140px;">
            <div class="gp-day-presets">
                <button type="button" class="gp-day-btn" data-days="30">30 T</button>
                <button type="button" class="gp-day-btn" data-days="90">90 T</button>
                <button type="button" class="gp-day-btn" data-days="180">180 T</button>
                <button type="button" class="gp-day-btn" data-days="365">1 Jahr</button>
                <button type="button" class="gp-day-btn" data-days="730">2 Jahre</button>
            </div>
        </div>

        <!-- Actions -->
        <div class="gp-action-row">
            <button class="gp-btn gp-btn-primary" id="gpActivateBtn" type="button" disabled>✅ Aktivieren</button>
            <button class="gp-btn gp-btn-extend" id="gpExtendBtn" type="button" disabled>➕ Verlängern</button>
            <button class="gp-btn gp-btn-danger" id="gpRevokeBtn" type="button" disabled>🗑️ Entfernen</button>
        </div>

        <div class="gp-result" id="gpResult"></div>
    </div>

    <!-- Active Grants -->
    <div class="gp-form-card">
        <h2>📋 Aktive Server-Pläne</h2>
        <div id="gpGrantsList"><p class="gp-loading">⏳ Wird geladen…</p></div>
    </div>

</div>

<script>
(function () {
    const API = '<?= BASE_URL ?>/pages/guild-premium-api.php';
    const CSRF = '<?= esc(dashboardCsrfToken()) ?>';
    let selectedGuildId = null;
    let selectedTier = 'pro';

    const guildIdInput = document.getElementById('gpGuildId');
    const lookupBtn    = document.getElementById('gpLookupBtn');
    const preview      = document.getElementById('gpPreview');
    const previewName  = document.getElementById('gpPreviewName');
    const previewMeta  = document.getElementById('gpPreviewMeta');
    const previewBadge = document.getElementById('gpPreviewBadge');
    const previewIcon  = document.getElementById('gpPreviewIcon');
    const previewFallback = document.getElementById('gpPreviewFallback');
    const daysInput    = document.getElementById('gpDays');
    const activateBtn  = document.getElementById('gpActivateBtn');
    const extendBtn    = document.getElementById('gpExtendBtn');
    const revokeBtn    = document.getElementById('gpRevokeBtn');
    const result       = document.getElementById('gpResult');
    const grantsList   = document.getElementById('gpGrantsList');

    // Tier buttons
    document.querySelectorAll('.gp-tier-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedTier = btn.dataset.tier;
            document.querySelectorAll('.gp-tier-btn').forEach(b => {
                b.classList.remove('active', 'active-pro');
            });
            btn.classList.add('active');
            if (selectedTier === 'pro') btn.classList.add('active-pro');
        });
    });

    // Day presets
    document.querySelectorAll('.gp-day-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            daysInput.value = btn.dataset.days;
        });
    });

    // Allow Enter to trigger lookup
    guildIdInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') lookupBtn.click();
    });

    function setButtons(enabled) {
        activateBtn.disabled = !enabled;
        extendBtn.disabled   = !enabled;
        revokeBtn.disabled   = !enabled;
    }

    function showResult(ok, msg) {
        result.className = 'gp-result visible ' + (ok ? 'success' : 'error');
        result.textContent = msg;
    }

    function hideResult() {
        result.className = 'gp-result';
    }

    function escHtml(str) {
        return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // Lookup guild
    lookupBtn.addEventListener('click', async () => {
        const id = guildIdInput.value.trim();
        if (!/^\d{17,20}$/.test(id)) {
            showResult(false, '❌ Ungültige Guild-ID (17–20 Ziffern)');
            return;
        }

        lookupBtn.disabled = true;
        lookupBtn.textContent = '⏳';
        hideResult();
        preview.classList.remove('visible');
        setButtons(false);
        selectedGuildId = null;

        try {
            const res = await fetch(`${API}?action=lookup&guildId=${encodeURIComponent(id)}`, { credentials: 'same-origin', headers: { 'X-CSRF-Token': CSRF } });
            const json = await res.json();

            if (!json.success) {
                showResult(false, json.error || 'Fehler beim Suchen');
                return;
            }

            const g = json.guild;
            const pm = json.ownerPremium;
            selectedGuildId = g.id;

            // Show preview
            previewName.textContent = g.name;
            previewMeta.textContent = `${g.memberCount.toLocaleString('de-DE')} Members · Owner: ${g.ownerId}`;

            if (g.icon) {
                previewIcon.src = g.icon;
                previewIcon.style.display = '';
                previewFallback.style.display = 'none';
            } else {
                previewIcon.style.display = 'none';
                previewFallback.style.display = 'flex';
            }

            const tierLabels = { free: 'Free', basic: '💎 Basic', pro: '👑 Pro' };
            previewBadge.textContent = tierLabels[pm.tier] || pm.tier;
            previewBadge.className = 'gp-preview-badge gp-badge-' + pm.tier;
            if (pm.expiresAt) {
                const exp = new Date(pm.expiresAt);
                previewMeta.textContent += ` · Premium bis ${exp.toLocaleDateString('de-DE')}`;
            }

            preview.classList.add('visible');
            setButtons(true);
        } catch (e) {
            showResult(false, '❌ Netzwerkfehler: ' + e.message);
        } finally {
            lookupBtn.disabled = false;
            lookupBtn.textContent = '🔍 Suchen';
        }
    });

    async function postAction(action) {
        if (!selectedGuildId) return;
        const days = parseInt(daysInput.value, 10);
        if (isNaN(days) || days < 1) {
            showResult(false, '❌ Ungültige Tageszahl');
            return;
        }

        const allBtns = [activateBtn, extendBtn, revokeBtn, lookupBtn];
        allBtns.forEach(b => b.disabled = true);
        hideResult();

        try {
            const res = await fetch(`${API}?action=${encodeURIComponent(action)}`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF },
                body: JSON.stringify({ guildId: selectedGuildId, days, tier: selectedTier }),
            });
            const json = await res.json();
            showResult(json.success, json.message || (json.success ? 'Erfolgreich' : json.error || 'Fehler'));
            if (json.success) loadGrants(); // refresh list
        } catch (e) {
            showResult(false, '❌ Netzwerkfehler: ' + e.message);
        } finally {
            allBtns.forEach(b => b.disabled = false);
            setButtons(!!selectedGuildId);
        }
    }

    activateBtn.addEventListener('click', () => postAction('activate'));
    extendBtn.addEventListener('click',   () => postAction('extend'));
    revokeBtn.addEventListener('click',   async () => {
        if (!confirm('Premium wirklich entfernen?')) return;
        postAction('deactivate');
    });

    // Load active grants
    async function loadGrants() {
        grantsList.innerHTML = '<p class="gp-loading">⏳ Wird geladen…</p>';
        try {
            const res = await fetch(`${API}?action=list`, { credentials: 'same-origin', headers: { 'X-CSRF-Token': CSRF } });
            const json = await res.json();
            const grants = json.grants || [];

            if (!grants.length) {
                grantsList.innerHTML = '<p class="gp-grants-empty">Keine aktiven Server-Pläne.</p>';
                return;
            }

            let html = '<div class="table-scroll"><table class="gp-grants-table"><thead><tr>'
                + '<th>Server</th><th>Plan</th><th>Owner-ID</th><th>Läuft ab</th></tr></thead><tbody>';

            for (const g of grants) {
                const tierLabel = g.tier === 'pro' ? '👑 Pro' : '💎 Basic';
                const tierCls   = g.tier === 'pro' ? 'gp-badge-pro' : 'gp-badge-basic';
                const expDate   = g.expiresAt ? new Date(g.expiresAt).toLocaleDateString('de-DE') : '—';
                const expired   = g.expiresAt && new Date(g.expiresAt) < new Date();
                const icon      = g.guildIcon
                    ? `<img src="${escHtml(g.guildIcon)}" alt="" class="gp-grants-icon" onerror="this.style.display='none'">`
                    : '';

                html += `<tr>
                    <td>${icon}<strong>${escHtml(g.guildName)}</strong><br>
                        <small style="color:var(--text-secondary);">${escHtml(g.guildId)}</small></td>
                    <td><span class="gp-preview-badge ${escHtml(tierCls)}">${tierLabel}</span></td>
                    <td><code style="font-size:.78rem;">${escHtml(g.ownerId)}</code></td>
                    <td style="${expired ? 'color:#ed4245;' : ''}">${escHtml(expDate)}${expired ? ' ⚠️' : ''}</td>
                </tr>`;
            }

            html += '</tbody></table></div>';
            grantsList.innerHTML = html;
        } catch (e) {
            grantsList.innerHTML = '<p class="gp-grants-empty" style="color:#ed4245;">Fehler beim Laden: ' + escHtml(e.message) + '</p>';
        }
    }

    loadGrants();
})();
</script>

<?php include '../includes/footer.php'; ?>
