<?php
$page_title = 'Server Plans';
require_once __DIR__ . '/../includes/config.php';
requireLogin();

$user     = getUser();
$userId   = $user['id'];

// Fetch user's premium status (user-level, for troll features)
$premRes   = getAPI('/premium/user/' . $userId, 5);
$isPremium = $premRes['data']['isPremium'] ?? false;
$isPro     = $premRes['data']['isPro']     ?? false;
$premUser  = $premRes['data']['user']      ?? null;
$expiresAt = $premUser ? strtotime($premUser['expires_at'] ?? '') : 0;
$daysLeft  = ($isPremium && $expiresAt > time()) ? ceil(($expiresAt - time()) / 86400) : 0;

// Fetch selected guild premium (server-level)
$guildsRaw     = getAPI('/voice/guilds', 6);
$guilds        = $guildsRaw['data']['guilds'] ?? [];
$guildId       = dashboardSelectedGuildId($guilds);
$guildPremium  = [];
$guildHasPrem  = false;
$guildTier     = 'free';
$guildPlanName = 'Free';
$guildLimits   = [];
if ($guildId) {
    $gpr         = getAPI('/guilds/' . urlencode($guildId) . '/premium', 6);
    $guildPremium  = $gpr['data'] ?? [];
    $guildHasPrem  = !empty($guildPremium['hasPremium']);
    $guildTier     = $guildPremium['tier']     ?? 'free';
    $guildPlanName = $guildPremium['planName'] ?? 'Free';
    $guildLimits   = $guildPremium['featureLimits'] ?? [];
}

$selectedGuild = null;
foreach ($guilds as $g) {
    if (($g['id'] ?? '') === $guildId) { $selectedGuild = $g; break; }
}

function planLimit(int $val): string {
    return $val < 0 ? '∞' : (string)$val;
}
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
/* ── Plans Hero ── */
.sp-hero {
    background: linear-gradient(135deg, rgba(168,85,247,.18), rgba(26,31,46,.96));
    border: 1px solid rgba(168,85,247,.35);
    border-radius: 16px;
    padding: 2rem;
    margin-bottom: 1.75rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1.5rem;
    flex-wrap: wrap;
}
.sp-hero h1 { margin: 0; font-size: 1.6rem; }
.sp-hero p  { margin: .3rem 0 0; color: var(--text-secondary); font-size: .9rem; }

/* ── Guild Status Banner ── */
.sp-guild-status {
    background: var(--panel);
    border: 1px solid var(--border-light);
    border-radius: 12px;
    padding: 1rem 1.25rem;
    margin-bottom: 1.5rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
}
.sp-guild-name { font-weight: 800; flex: 1; }
.sp-guild-plan { font-size: .8rem; color: var(--text-secondary); }

/* ── Plan Cards ── */
.sp-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(270px, 1fr));
    gap: 1.25rem;
    margin-bottom: 2rem;
}
.sp-card {
    background: var(--panel);
    border: 1px solid var(--border-light);
    border-radius: 14px;
    padding: 1.75rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    transition: border-color .2s, transform .15s;
    position: relative;
    overflow: hidden;
}
.sp-card:hover { border-color: var(--primary); transform: translateY(-2px); }
.sp-card.active-plan { border-color: #a855f7; box-shadow: 0 0 0 1px rgba(168,85,247,.3); }
.sp-card.featured  { border-color: #ffd700; box-shadow: 0 0 0 1px rgba(255,215,0,.2); }

.sp-card-label {
    position: absolute;
    top: 1rem;
    right: 1rem;
    font-size: .68rem;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: .06em;
    padding: .2rem .55rem;
    border-radius: 999px;
}
.sp-card-label.current { background: rgba(168,85,247,.18); color: #c4b5fd; border: 1px solid rgba(168,85,247,.4); }
.sp-card-label.popular { background: #ffd700; color: #000; }
.sp-card-label.coming  { background: rgba(116,192,252,.12); color: #9ecbff; border: 1px solid rgba(116,192,252,.35); }

.sp-plan-icon { font-size: 2rem; }
.sp-plan-name { font-size: 1.1rem; font-weight: 900; margin-top: .25rem; }
.sp-plan-price { font-size: 2rem; font-weight: 900; color: var(--primary-light); line-height: 1; }
.sp-plan-price span { font-size: .88rem; color: var(--text-secondary); font-weight: 400; }

.sp-feat-list { list-style: none; display: flex; flex-direction: column; gap: .55rem; }
.sp-feat-list li { display: flex; align-items: flex-start; gap: .55rem; font-size: .88rem; color: var(--text-secondary); }
.sp-feat-list li.inc { color: var(--text-primary); }
.sp-feat-list li .icon { flex-shrink: 0; font-size: .95rem; margin-top: .05rem; }

.sp-cta {
    display: block;
    text-align: center;
    padding: .7rem 1rem;
    border-radius: 9px;
    font-weight: 800;
    font-size: .9rem;
    text-decoration: none;
    margin-top: auto;
    transition: opacity .15s, transform .1s;
}
.sp-cta:hover { opacity: .85; transform: translateY(-1px); }
.sp-cta.primary-gold { background: linear-gradient(135deg, #c084fc, #a855f7); color: #fff; }
.sp-cta.outline-gold { border: 2px solid #ffd700; color: #ffd700; background: transparent; }
.sp-cta.outline     { border: 2px solid var(--primary); color: var(--primary-light); background: transparent; }
.sp-cta.disabled    { background: rgba(255,255,255,.06); color: var(--text-secondary); border: 1px solid var(--border-light); cursor: default; }

/* ── Limit Table ── */
.sp-table-wrap {
    background: var(--panel);
    border: 1px solid var(--border-light);
    border-radius: 12px;
    overflow: auto;
    margin-bottom: 2rem;
}
.sp-table { width: 100%; border-collapse: collapse; min-width: 600px; }
.sp-table th {
    background: var(--bg-tertiary);
    padding: .75rem 1.25rem;
    text-align: left;
    font-size: .78rem;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: var(--text-secondary);
}
.sp-table td { padding: .8rem 1.25rem; border-top: 1px solid var(--border-light); font-size: .88rem; }
.sp-table tr:hover td { background: var(--bg-tertiary); }
.sp-table td.val { text-align: center; font-weight: 700; }
.sp-table td.val.free-val { color: var(--text-secondary); }
.sp-table td.val.prem-val { color: #c4b5fd; }
.sp-table td.val.pro-val  { color: #ffd700; }
.sp-table td.feature-name { font-weight: 600; }
.sp-table .hl td { color: var(--text-primary); font-weight: 700; }

/* ── FAQ ── */
.sp-faq { margin-bottom: 2rem; }
.sp-faq h2 { font-size: 1.1rem; font-weight: 800; margin-bottom: 1rem; }
.sp-faq-item { background: var(--panel); border: 1px solid var(--border-light); border-radius: 10px; padding: 1rem 1.25rem; margin-bottom: .65rem; }
.sp-faq-item .q { font-weight: 700; margin-bottom: .35rem; }
.sp-faq-item .a { color: var(--text-secondary); font-size: .88rem; line-height: 1.5; }

@media (max-width: 700px) {
    .sp-hero { flex-direction: column; }
    .sp-guild-status { flex-direction: column; align-items: flex-start; }
}
</style>

<section class="dashboard-page-header">
    <div class="dashboard-page-copy">
        <span class="dashboard-page-eyebrow">Premium / Product</span>
        <h1>Server Plans</h1>
        <p>Alle Feature-Tiers fuer Fahrstuhl-Server: Free fuer Einstieg, Premium fuer Kapazitaet, Pro fuer Advanced Insights.</p>
        <div class="dashboard-page-meta">
            <?php if ($isPro): ?>
                <span class="status-badge premium">Pro User · <?= $daysLeft ?>d</span>
            <?php elseif ($isPremium): ?>
                <span class="status-badge premium">Premium User · <?= $daysLeft ?>d</span>
            <?php else: ?>
                <span class="status-badge inactive">Kein aktives Premium</span>
            <?php endif; ?>
            <?php if ($guildId): ?>
                <span class="status-badge <?= $guildHasPrem ? 'premium' : 'inactive' ?>">Server: <?= esc($guildPlanName) ?></span>
            <?php endif; ?>
        </div>
    </div>
    <div class="dashboard-page-actions">
        <a href="<?= BASE_URL ?>/pages/premium-info.php" class="btn-icon btn-secondary-ui">User Plans</a>
        <a href="https://discord.gg/zfzDHKcWDx" target="_blank" rel="noopener" class="btn-icon btn-primary-ui">Support kontaktieren</a>
    </div>
</section>

<?php if ($guildId && $selectedGuild): ?>
<div class="sp-guild-status">
    <div>
        <div class="sp-guild-name"><?= esc($selectedGuild['name'] ?? 'Unbekannter Server') ?></div>
        <div class="sp-guild-plan">
            Aktueller Server-Plan: <strong><?= esc($guildPlanName) ?></strong>
            <?php if ($guildLimits): ?>
                · Reaction Role Panels: <strong><?= planLimit((int)($guildLimits['reactionRolePanels'] ?? 3)) ?></strong>
                · Ticket Panels: <strong><?= planLimit((int)($guildLimits['ticketPanels'] ?? 1)) ?></strong>
                · Social Feeds: <strong><?= planLimit((int)($guildLimits['socialFeeds'] ?? 0)) ?></strong>
            <?php endif; ?>
        </div>
    </div>
    <span class="status-badge <?= $guildHasPrem ? 'premium' : 'inactive' ?>"><?= esc($guildPlanName) ?></span>
</div>
<?php endif; ?>

<!-- ─── Plan Cards ─── -->
<div class="sp-grid">

    <!-- FREE -->
    <div class="sp-card <?= $guildTier === 'free' ? 'active-plan' : '' ?>">
        <?php if ($guildTier === 'free'): ?>
            <span class="sp-card-label current">Aktiver Plan</span>
        <?php endif; ?>
        <div>
            <div class="sp-plan-icon">🆓</div>
            <div class="sp-plan-name">Free</div>
        </div>
        <div class="sp-plan-price">0€ <span>/ immer</span></div>
        <ul class="sp-feat-list">
            <li class="inc"><span class="icon">✅</span> Alle Basis-Module (Moderation, Logging, Welcome)</li>
            <li class="inc"><span class="icon">✅</span> Leveling, AutoMod, Tickets (1 Panel)</li>
            <li class="inc"><span class="icon">✅</span> Reaction Roles (3 Panels)</li>
            <li class="inc"><span class="icon">✅</span> 5 AutoMod-Regeln</li>
            <li class="inc"><span class="icon">✅</span> 5 Level-Rewards</li>
            <li><span class="icon">❌</span> Social Alerts (Twitch / YouTube)</li>
            <li><span class="icon">❌</span> Erweiterte Limits</li>
            <li><span class="icon">❌</span> Temp Voice</li>
        </ul>
        <?php if ($guildTier === 'free'): ?>
            <span class="sp-cta disabled" style="font-size:1rem;">✓ Dein aktueller Plan</span>
        <?php else: ?>
            <a href="https://discord.gg/zfzDHKcWDx" target="_blank" rel="noopener" class="sp-cta outline">💬 Support kontaktieren</a>
        <?php endif; ?>
    </div>

    <!-- PREMIUM -->
    <div class="sp-card featured <?= $guildTier === 'basic' ? 'active-plan' : '' ?>">
        <?php if ($guildTier === 'basic'): ?>
            <span class="sp-card-label current">Aktiver Plan</span>
        <?php else: ?>
            <span class="sp-card-label popular">Popular</span>
        <?php endif; ?>
        <div>
            <div class="sp-plan-icon">💎</div>
            <div class="sp-plan-name">Premium</div>
        </div>
        <div class="sp-plan-price">4,99€ <span>/ Monat</span></div>
        <ul class="sp-feat-list">
            <li class="inc"><span class="icon">✅</span> Alles aus Free</li>
            <li class="inc"><span class="icon">✅</span> Social Alerts (3 Feeds)</li>
            <li class="inc"><span class="icon">✅</span> Reaction Roles (10 Panels)</li>
            <li class="inc"><span class="icon">✅</span> Ticket Panels (3)</li>
            <li class="inc"><span class="icon">✅</span> 20 AutoMod-Regeln</li>
            <li class="inc"><span class="icon">✅</span> 20 Level-Rewards</li>
            <li class="inc"><span class="icon">✅</span> Temp Voice Channels</li>
            <li class="inc"><span class="icon">✅</span> Prioritäts-Support</li>
            <li><span class="icon">❌</span> Unbegrenzte Limits</li>
        </ul>
        <?php if ($guildTier === 'basic'): ?>
            <span class="sp-cta disabled" style="font-size:1rem;">✓ Dein aktueller Plan</span>
        <?php else: ?>
            <a href="https://discord.gg/zfzDHKcWDx" target="_blank" rel="noopener" class="sp-cta primary-gold" style="font-size:1rem; padding:.85rem 1rem;">💎 Premium anfragen</a>
        <?php endif; ?>
    </div>

    <!-- PRO -->
    <div class="sp-card <?= $guildTier === 'pro' ? 'active-plan' : '' ?>">
        <?php if ($guildTier === 'pro'): ?>
            <span class="sp-card-label current">Aktiver Plan</span>
        <?php endif; ?>
        <div>
            <div class="sp-plan-icon">👑</div>
            <div class="sp-plan-name">Pro</div>
        </div>
        <div class="sp-plan-price">9,99€ <span>/ Monat</span></div>
        <ul class="sp-feat-list">
            <li class="inc"><span class="icon">✅</span> Alles aus Premium</li>
            <li class="inc"><span class="icon">✅</span> Social Alerts (10 Feeds)</li>
            <li class="inc"><span class="icon">✅</span> Unbegrenzte Reaction Role Panels</li>
            <li class="inc"><span class="icon">✅</span> Unbegrenzte Ticket Panels</li>
            <li class="inc"><span class="icon">✅</span> Unbegrenzte AutoMod-Regeln</li>
            <li class="inc"><span class="icon">✅</span> Unbegrenzte Level-Rewards</li>
            <li class="inc"><span class="icon">✅</span> Unbegrenzte Log-Gruppen</li>
            <li class="inc"><span class="icon">✅</span> Direkter Admin-Kontakt</li>
        </ul>
        <?php if ($guildTier === 'pro'): ?>
            <span class="sp-cta disabled" style="font-size:1rem;">✓ Dein aktueller Plan</span>
        <?php else: ?>
            <a href="https://discord.gg/zfzDHKcWDx" target="_blank" rel="noopener" class="sp-cta outline-gold" style="font-size:1rem; padding:.85rem 1rem;">👑 Pro anfragen</a>
        <?php endif; ?>
    </div>

    <!-- COMING SOON: Enterprise -->
    <div class="sp-card">
        <span class="sp-card-label coming">Coming Soon</span>
        <div>
            <div class="sp-plan-icon">🏢</div>
            <div class="sp-plan-name">Enterprise</div>
        </div>
        <div class="sp-plan-price" style="color:var(--text-secondary);">Auf Anfrage</div>
        <ul class="sp-feat-list">
            <li class="inc"><span class="icon">✅</span> Alles aus Pro</li>
            <li class="inc"><span class="icon">✅</span> Dedizierter Bot-Slot</li>
            <li class="inc"><span class="icon">✅</span> Custom Branding & Befehle</li>
            <li class="inc"><span class="icon">✅</span> SLA & garantierte Uptime</li>
            <li class="inc"><span class="icon">✅</span> API-Zugang für eigene Integrationen</li>
        </ul>
        <span class="sp-cta disabled">🔜 Bald verfügbar</span>
    </div>
</div>

<!-- ─── Feature Comparison Table ─── -->
<h2 style="font-size:1.1rem; font-weight:800; margin-bottom:1rem;">📋 Feature-Limits im Vergleich</h2>
<div class="sp-table-wrap dashboard-table-wrap">
    <table class="sp-table">
        <?php
            $freeColClass = $guildTier === 'free'   ? 'sp-active-col' : '';
            $premColClass = $guildTier === 'basic'  ? 'sp-active-col' : '';
            $proColClass  = $guildTier === 'pro'    ? 'sp-active-col' : '';
        ?>
        <thead>
            <tr>
                <th>Feature</th>
                <th style="text-align:center;" class="<?= $freeColClass ?>">🆓 Free<?= $guildTier==='free' ? ' ✓' : '' ?></th>
                <th style="text-align:center;" class="<?= $premColClass ?>">💎 Premium<?= $guildTier==='basic' ? ' ✓' : '' ?></th>
                <th style="text-align:center;" class="<?= $proColClass ?>">👑 Pro<?= $guildTier==='pro' ? ' ✓' : '' ?></th>
            </tr>
        </thead>
        <tbody>
            <tr class="hl"><td class="feature-name">Moderation, Logging, Welcome</td><td class="val free-val <?= $freeColClass ?>">✅</td><td class="val prem-val <?= $premColClass ?>">✅</td><td class="val pro-val <?= $proColClass ?>">✅</td></tr>
            <tr><td class="feature-name">Leveling (XP, Leaderboard)</td><td class="val free-val <?= $freeColClass ?>">✅</td><td class="val prem-val <?= $premColClass ?>">✅</td><td class="val pro-val <?= $proColClass ?>">✅</td></tr>
            <tr><td class="feature-name">Tickets · Max Panels</td><td class="val free-val <?= $freeColClass ?>">1</td><td class="val prem-val <?= $premColClass ?>">3</td><td class="val pro-val <?= $proColClass ?>">∞</td></tr>
            <tr class="hl"><td class="feature-name">Reaction Roles · Max Panels</td><td class="val free-val <?= $freeColClass ?>">3</td><td class="val prem-val <?= $premColClass ?>">10</td><td class="val pro-val <?= $proColClass ?>">∞</td></tr>
            <tr><td class="feature-name">AutoMod · Max Regeln</td><td class="val free-val <?= $freeColClass ?>">5</td><td class="val prem-val <?= $premColClass ?>">20</td><td class="val pro-val <?= $proColClass ?>">∞</td></tr>
            <tr><td class="feature-name">Leveling · Max Rewards</td><td class="val free-val <?= $freeColClass ?>">5</td><td class="val prem-val <?= $premColClass ?>">20</td><td class="val pro-val <?= $proColClass ?>">∞</td></tr>
            <tr class="hl"><td class="feature-name">🔴 Live Activity Feed (Echtzeit)</td><td class="val free-val <?= $freeColClass ?>">❌</td><td class="val prem-val <?= $premColClass ?>">✅</td><td class="val pro-val <?= $proColClass ?>">✅</td></tr>
            <tr><td class="feature-name">📊 Advanced Insights</td><td class="val free-val <?= $freeColClass ?>">❌</td><td class="val prem-val <?= $premColClass ?>">❌</td><td class="val pro-val <?= $proColClass ?>">✅</td></tr>
            <tr class="hl"><td class="feature-name">Social Alerts (Twitch, YouTube)</td><td class="val free-val <?= $freeColClass ?>">❌</td><td class="val prem-val <?= $premColClass ?>">3 Feeds</td><td class="val pro-val <?= $proColClass ?>">10 Feeds</td></tr>
            <tr><td class="feature-name">Temp Voice Channels</td><td class="val free-val <?= $freeColClass ?>">❌</td><td class="val prem-val <?= $premColClass ?>">✅</td><td class="val pro-val <?= $proColClass ?>">✅</td></tr>
            <tr><td class="feature-name">Logging · Max Gruppen</td><td class="val free-val <?= $freeColClass ?>">3</td><td class="val prem-val <?= $premColClass ?>">10</td><td class="val pro-val <?= $proColClass ?>">∞</td></tr>
            <tr class="hl"><td class="feature-name">Welcome · Multi-Message</td><td class="val free-val <?= $freeColClass ?>">1</td><td class="val prem-val <?= $premColClass ?>">3</td><td class="val pro-val <?= $proColClass ?>">∞</td></tr>
            <tr><td class="feature-name">Prioritäts-Support</td><td class="val free-val <?= $freeColClass ?>">❌</td><td class="val prem-val <?= $premColClass ?>">✅</td><td class="val pro-val <?= $proColClass ?>">✅</td></tr>
            <tr><td class="feature-name">Direkter Admin-Kontakt</td><td class="val free-val <?= $freeColClass ?>">❌</td><td class="val prem-val <?= $premColClass ?>">❌</td><td class="val pro-val <?= $proColClass ?>">✅</td></tr>
        </tbody>
    </table>
</div>

<!-- ─── FAQ ─── -->
<div class="sp-faq">
    <h2>❓ Häufige Fragen</h2>
    <div class="sp-faq-item">
        <div class="q">Wie aktiviere ich Premium für meinen Server?</div>
        <div class="a">Premium ist derzeit manuell erhältlich. Schreib uns im Support Server — wir aktivieren es direkt für den Server-Owner. Kein automatisches Payment-System nötig.</div>
    </div>
    <div class="sp-faq-item">
        <div class="q">Was passiert wenn Premium abläuft?</div>
        <div class="a">Der Server fällt auf Free zurück. Bestehende Konfigurationen bleiben erhalten — lediglich neue Panels/Regeln über dem Free-Limit können nicht mehr erstellt werden.</div>
    </div>
    <div class="sp-faq-item">
        <div class="q">Sind die Limits bereits aktiv durchgesetzt?</div>
        <div class="a">Noch nicht vollständig. Aktuell dienen die Limits als Richtwert und werden im Dashboard angezeigt. Harte Durchsetzung folgt in einem zukünftigen Update.</div>
    </div>
    <div class="sp-faq-item">
        <div class="q">Unterschied zwischen User Premium und Server Premium?</div>
        <div class="a">User Premium (aus den <a href="<?= BASE_URL ?>/pages/premium-info.php">User Plans</a>) gilt für Troll-Bot-Features wie längere Commands und Custom-Messages. Server Premium gilt für Dashboard-Features wie mehr Panels und Social Alerts.</div>
    </div>
</div>

<!-- ─── CTA Strip ─── -->
<div class="dashboard-card" style="text-align:center; padding:1.5rem; display:flex; flex-direction:column; gap:.75rem; align-items:center;">
    <div style="font-size:1.05rem; font-weight:900;">Bereit für mehr?</div>
    <div style="color:var(--text-secondary); font-size:.9rem;">Kein Checkout, kein Abo-Formular — kontaktiere uns einfach direkt im Support.</div>
    <div style="display:flex; gap:.75rem; flex-wrap:wrap; justify-content:center;">
        <a href="https://discord.gg/zfzDHKcWDx" target="_blank" rel="noopener" class="btn-icon btn-primary-ui" style="padding:.75rem 1.5rem; font-weight:800;">💬 Support kontaktieren</a>
        <a href="<?= BASE_URL ?>/pages/modules.php" class="btn-icon btn-secondary-ui" style="padding:.75rem 1.5rem;">🧩 Module verwalten</a>
    </div>
</div>

<?php include '../includes/footer.php'; ?>
