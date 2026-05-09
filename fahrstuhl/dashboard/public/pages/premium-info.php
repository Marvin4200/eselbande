<?php
$page_title = 'Premium';
require_once __DIR__ . '/../includes/config.php';
requireLogin();

$user = getUser();
$userId = $user['id'];

$premRes = getAPI('/premium/user/' . $userId, 5);
$isPremium = $premRes['data']['isPremium'] ?? false;
$isPro     = $premRes['data']['isPro'] ?? false;
$premUser  = $premRes['data']['user'] ?? null;
$expiresAt = $premUser ? strtotime($premUser['expires_at']) : 0;
$daysLeft  = $isPremium && $expiresAt > time() ? ceil(($expiresAt - time()) / 86400) : 0;
$userTier  = $premUser['tier'] ?? 'basic';
?>
<?php require_once __DIR__ . '/../includes/header.php'; ?>
<?php require_once __DIR__ . '/../includes/sidebar.php'; ?>

<style>
.prem-hero { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); border: 1px solid #ffd700; border-radius: 16px; padding: 2.5rem 2rem; text-align: center; margin-bottom: 2rem; position: relative; overflow: hidden; }
.prem-hero::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 0%, rgba(255,215,0,.08) 0%, transparent 70%); pointer-events: none; }
.prem-hero h1 { font-size: 2rem; font-weight: 800; color: #ffd700; margin-bottom: .5rem; }
.prem-hero p { color: var(--text-secondary); font-size: 1rem; }
.status-badge { display: inline-flex; align-items: center; gap: .5rem; padding: .5rem 1.25rem; border-radius: 999px; font-weight: 700; font-size: .95rem; margin-top: 1rem; }
.status-active { background: rgba(81,207,102,.15); border: 1px solid #51cf66; color: #51cf66; }
.status-inactive { background: rgba(255,107,107,.12); border: 1px solid #ff6b6b; color: #ff6b6b; }

.plans-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
.plan-card { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 14px; padding: 1.75rem; display: flex; flex-direction: column; gap: 1rem; transition: border-color .2s; }
.plan-card:hover { border-color: var(--primary); }
.plan-card.featured { border-color: #ffd700; box-shadow: 0 0 0 1px #ffd700; }
.plan-card .plan-name { font-size: 1.15rem; font-weight: 700; }
.plan-card .plan-price { font-size: 2.2rem; font-weight: 800; color: var(--primary); }
.plan-card .plan-price span { font-size: .9rem; color: var(--text-secondary); font-weight: 400; }
.plan-card .badge-featured { background: #ffd700; color: #000; font-size: .7rem; font-weight: 700; padding: .2rem .6rem; border-radius: 999px; margin-left: .5rem; text-transform: uppercase; }
.feature-list { list-style: none; display: flex; flex-direction: column; gap: .55rem; }
.feature-list li { display: flex; align-items: center; gap: .6rem; font-size: .9rem; color: var(--text-secondary); }
.feature-list li .icon { font-size: 1rem; flex-shrink: 0; }
.feature-list li.included { color: var(--text-primary); }
.btn-buy { display: block; text-align: center; padding: .75rem 1rem; border-radius: 8px; font-weight: 700; font-size: .95rem; text-decoration: none; margin-top: auto; transition: opacity .15s; }
.btn-buy:hover { opacity: .85; }
.btn-gold { background: linear-gradient(135deg, #f6d365, #fda085); color: #000; }
.btn-outline { background: transparent; border: 2px solid var(--primary); color: var(--primary); }

.features-section h2 { font-size: 1.15rem; font-weight: 700; margin-bottom: 1.25rem; }
.features-table { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; margin-bottom: 2rem; }
.features-table table { width: 100%; border-collapse: collapse; }
.features-table th { background: var(--bg-tertiary); padding: .8rem 1.25rem; text-align: left; font-size: .82rem; text-transform: uppercase; letter-spacing: .06em; color: var(--text-secondary); }
.features-table td { padding: .8rem 1.25rem; border-top: 1px solid var(--border); font-size: .9rem; }
.features-table tr:hover td { background: var(--bg-tertiary); }
.check { color: #51cf66; font-weight: 700; }
.cross { color: #ff6b6b; }
.highlight-row td { color: var(--text-primary); font-weight: 500; }

.faq-section { margin-bottom: 2rem; }
.faq-section h2 { font-size: 1.15rem; font-weight: 700; margin-bottom: 1.25rem; }
.faq-item { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 10px; padding: 1.1rem 1.25rem; margin-bottom: .75rem; }
.faq-item .q { font-weight: 600; margin-bottom: .4rem; }
.faq-item .a { color: var(--text-secondary); font-size: .9rem; }
</style>

<div class="prem-hero">
    <div>💎</div>
    <h1>Fahrstuhl Premium</h1>
    <p>Mehr Power, mehr Trolls, mehr Spaß</p>
    <?php if ($isPro): ?>
        <div class="status-badge status-active">👑 Pro aktiv — noch <?= $daysLeft ?> Tage</div>
    <?php elseif ($isPremium): ?>
        <div class="status-badge status-active">✅ Premium aktiv — noch <?= $daysLeft ?> Tage</div>
    <?php else: ?>
        <div class="status-badge status-inactive">🔒 Kein aktives Premium</div>
    <?php endif; ?>
</div>

<!-- Plans -->
<div class="plans-grid">
    <div class="plan-card">
        <div>
            <div class="plan-name">🆓 Free</div>
            <div class="plan-price">0€ <span>/ immer</span></div>
        </div>
        <ul class="feature-list">
            <li class="included"><span class="icon">✅</span> Alle Basis-Troll-Commands</li>
            <li class="included"><span class="icon">✅</span> Ghost, Mute, Mirror, Deafen laufen 1 Minute</li>
            <li class="included"><span class="icon">✅</span> Shield-System</li>
            <li class="included"><span class="icon">✅</span> Daily Claim</li>
            <li class="included"><span class="icon">✅</span> Vote Rewards (top.gg)</li>
            <li><span class="icon">❌</span> /notifysettings</li>
            <li><span class="icon">❌</span> Reduzierte Cooldowns</li>
            <li><span class="icon">❌</span> Prioritäts-Support</li>
        </ul>
        <?php if (!$isPremium): ?>
            <span class="btn-buy btn-outline" style="cursor:default; opacity:.5;">Aktueller Plan</span>
        <?php else: ?>
            <a href="https://discord.gg/zfzDHKcWDx" target="_blank" class="btn-buy btn-outline">💬 Support</a>
        <?php endif; ?>
    </div>

    <div class="plan-card featured">
        <div>
            <div class="plan-name">💎 Premium <span class="badge-featured">Popular</span></div>
            <div class="plan-price">4,99€ <span>/ Monat</span></div>
        </div>
        <ul class="feature-list">
            <li class="included"><span class="icon">✅</span> Alles aus Free</li>
            <li class="included"><span class="icon">✅</span> Ghost, Mute, Mirror, Deafen laufen 5 Minuten</li>
            <li class="included"><span class="icon">✅</span> /notifysettings (DM-Alerts)</li>
            <li class="included"><span class="icon">✅</span> 50% reduzierte Cooldowns</li>
            <li class="included"><span class="icon">✅</span> Prioritäts-Support</li>
            <li class="included"><span class="icon">✅</span> 💎 Premium-Badge im Bot</li>
            <li class="included"><span class="icon">✅</span> Längere Chaos-Phasen ohne Toggle</li>
            <li><span class="icon">❌</span> /settrollmessage</li>
            <li><span class="icon">❌</span> Monatliche Bonus-Shields</li>
        </ul>
        <?php if ($isPro): ?>
            <a href="https://discord.gg/zfzDHKcWDx" target="_blank" class="btn-buy btn-gold">💬 Support</a>
        <?php elseif ($isPremium): ?>
            <span class="btn-buy btn-gold" style="cursor:default;">✅ Aktiv (<?= $daysLeft ?>d)</span>
        <?php else: ?>
            <a href="https://discord.gg/zfzDHKcWDx" target="_blank" class="btn-buy btn-gold">💎 Jetzt kaufen</a>
        <?php endif; ?>
    </div>

    <div class="plan-card">
        <div>
            <div class="plan-name">👑 Pro</div>
            <div class="plan-price">9,99€ <span>/ Monat</span></div>
        </div>
        <ul class="feature-list">
            <li class="included"><span class="icon">✅</span> Alles aus Premium</li>
            <li class="included"><span class="icon">✅</span> Ghost, Mute, Mirror, Deafen laufen 10 Minuten</li>
            <li class="included"><span class="icon">✅</span> 👑 Pro-Badge im Bot</li>
            <li class="included"><span class="icon">✅</span> /settrollmessage (Custom Text)</li>
            <li class="included"><span class="icon">✅</span> Custom Nachricht auf allen Trolls</li>
            <li class="included"><span class="icon">✅</span> Multi-Target Elevator für bis zu 3 User</li>
            <li class="included"><span class="icon">✅</span> +10 Bonus-Shields pro Monat</li>
            <li class="included"><span class="icon">✅</span> Multi-Server Admin-Zugang</li>
            <li class="included"><span class="icon">✅</span> Direkter Admin-Kontakt</li>
        </ul>
        <?php if ($isPro): ?>
            <span class="btn-buy btn-outline" style="cursor:default; border-color:#ffd700; color:#ffd700;">👑 Aktiv (<?= $daysLeft ?>d)</span>
        <?php else: ?>
            <a href="https://discord.gg/zfzDHKcWDx" target="_blank" class="btn-buy btn-outline">👑 Anfragen</a>
        <?php endif; ?>
    </div>
</div>

<!-- Feature Comparison -->
<div class="features-section">
    <h2>📋 Feature-Vergleich</h2>
    <div class="features-table">
        <table>
            <thead>
                <tr>
                    <th>Feature</th>
                    <th>Free</th>
                    <th>Premium</th>
                    <th>Pro</th>
                </tr>
            </thead>
            <tbody>
                <tr class="highlight-row"><td>Troll-Commands (/elevator, /ghost, etc.)</td><td class="check">✅</td><td class="check">✅</td><td class="check">✅</td></tr>
                <tr><td>Ghost / Mute / Mirror / Deafen Dauer</td><td>1 Minute</td><td>5 Minuten</td><td>10 Minuten</td></tr>
                <tr><td>Shield-System & Daily Claim</td><td class="check">✅</td><td class="check">✅</td><td class="check">✅</td></tr>
                <tr><td>top.gg Vote Rewards</td><td class="check">✅</td><td class="check">✅</td><td class="check">✅</td></tr>
                <tr class="highlight-row"><td>/notifysettings (DM wenn du getrollt wirst)</td><td class="cross">❌</td><td class="check">✅</td><td class="check">✅</td></tr>
                <tr><td>50% reduzierte Command-Cooldowns</td><td class="cross">❌</td><td class="check">✅</td><td class="check">✅</td></tr>
                <tr><td>Prioritäts-Support im Discord</td><td class="cross">❌</td><td class="check">✅</td><td class="check">✅</td></tr>
                <tr><td>Premium-Badge (💎 / 👑) in /status</td><td class="cross">❌</td><td class="check">✅</td><td class="check">✅</td></tr>
                <tr><td>Elevator Multi-Target (bis zu 3 User)</td><td class="cross">❌</td><td class="cross">❌</td><td class="check">✅</td></tr>
                <tr class="highlight-row"><td>/settrollmessage (Custom Troll-Nachricht)</td><td class="cross">❌</td><td class="cross">❌</td><td class="check">✅</td></tr>
                <tr><td>Custom Nachricht auf ALLEN Troll-Commands</td><td class="cross">❌</td><td class="cross">❌</td><td class="check">✅</td></tr>
                <tr><td>Monatliche Bonus-Shields (+10)</td><td class="cross">❌</td><td class="cross">❌</td><td class="check">✅</td></tr>
                <tr><td>Multi-Server Admin-Zugang</td><td class="cross">❌</td><td class="cross">❌</td><td class="check">✅</td></tr>
            </tbody>
        </table>
    </div>
</div>

<!-- FAQ -->
<div class="faq-section">
    <h2>❓ Häufige Fragen</h2>
    <div class="faq-item">
        <div class="q">Wie kaufe ich Premium?</div>
        <div class="a">Tritt unserem Support-Server bei und schreib uns. Wir aktivieren Premium manuell nach Bezahlung.</div>
    </div>
    <div class="faq-item">
        <div class="q">Welche Zahlungsmethoden gibt es?</div>
        <div class="a">PayPal, Paysafecard und weitere — frag einfach im Support-Server nach.</div>
    </div>
    <div class="faq-item">
        <div class="q">Kann ich Premium kündigen?</div>
        <div class="a">Ja, Premium läuft nach dem gebuchten Zeitraum automatisch aus. Es gibt kein Abo.</div>
    </div>
    <div class="faq-item">
        <div class="q">Was passiert wenn Premium abläuft?</div>
        <div class="a">Dein Account wechselt zurück zum Free-Plan. Alle gespeicherten Daten (Shields etc.) bleiben erhalten.</div>
    </div>
</div>

<?php require_once __DIR__ . '/../includes/footer.php'; ?>
