<?php
$page_title = 'Setup Assistant';
require_once __DIR__ . '/../includes/config.php';
requireLogin();

$isAjaxRequest = strcasecmp($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '', 'XMLHttpRequest') === 0
    || stripos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') !== false;
$sendJson = function ($payload, $statusCode = 200) {
    http_response_code((int)$statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit();
};

// Fetch manageable guilds and resolve selected guild
$guildsRaw = getAPI('/voice/guilds', 8);
$guilds = $guildsRaw['data']['guilds'] ?? [];
$guildId = dashboardSelectedGuildId($guilds);

// ============ POST: enable-core action ============
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $guildId) {
    $action = trim($_POST['action'] ?? '');

    if ($action === 'enable_core') {
        $coreKeys = ['welcome', 'logging', 'tickets'];
        $enabledCount = 0;
        $errors = [];
        foreach ($coreKeys as $key) {
            $result = api('/guilds/' . urlencode($guildId) . '/modules', 'POST', [
                'module'  => $key,
                'enabled' => true,
            ], 12);
            if ($result['success'] ?? false) {
                $enabledCount++;
            } else {
                $errors[] = $key . ': ' . ($result['message'] ?? 'Fehler');
            }
        }
        $ok = $enabledCount > 0;
        if ($isAjaxRequest) {
            $sendJson([
                'success' => $ok,
                'message' => $ok
                    ? $enabledCount . ' Kernmodule aktiviert.'
                    : ('Fehler: ' . implode(', ', $errors)),
            ]);
        }
    }

    if ($action === 'toggle_module') {
        $module  = trim($_POST['module'] ?? '');
        $enabled = ($_POST['enabled'] ?? '0') === '1';
        $result  = api('/guilds/' . urlencode($guildId) . '/modules', 'POST', [
            'module'  => $module,
            'enabled' => $enabled,
        ], 12);
        $ok = $result['success'] ?? false;
        if ($isAjaxRequest) {
            $sendJson([
                'success' => $ok,
                'message' => $ok ? 'Modul aktualisiert.' : ($result['message'] ?? 'Fehler'),
            ]);
        }
    }
}

// ============ GET data ============
$health       = null;
$issues       = [];
$summary      = ['errors' => 0, 'warnings' => 0, 'infos' => 0];
$healthState  = 'ok';
$modulesData  = [];

if ($guildId) {
    $healthRaw = getAPI('/guilds/' . urlencode($guildId) . '/setup-health', 8);
    if ($healthRaw['success'] ?? false) {
        $health      = $healthRaw['data'] ?? [];
        $issues      = $health['issues']  ?? [];
        $summary     = $health['summary'] ?? $summary;
        $healthState = $health['health']  ?? 'ok';
    }

    $modulesRaw = getAPI('/guilds/' . urlencode($guildId) . '/modules', 8);
    if ($modulesRaw['success'] ?? false) {
        foreach ($modulesRaw['data']['modules'] ?? [] as $mod) {
            $modulesData[$mod['key']] = $mod;
        }
    }
}

// ============ Helpers ============
function moduleEnabled(array $modulesData, string $key): bool {
    return !empty($modulesData[$key]['enabled']);
}

function issuesByKey(array $issues, string $keyPrefix): array {
    return array_values(array_filter($issues, fn($i) => str_starts_with($i['key'] ?? '', $keyPrefix)));
}

function issuesBySeverity(array $issues, string $severity): array {
    return array_values(array_filter($issues, fn($i) => ($i['severity'] ?? '') === $severity));
}

function hasIssueKey(array $issues, string $key): bool {
    foreach ($issues as $i) {
        if (($i['key'] ?? '') === $key) return true;
    }
    return false;
}

$permIssues = issuesByKey($issues, 'perm_');
$hasPermErrors = count(issuesBySeverity($permIssues, 'error')) > 0;

$coreModuleKeys = ['welcome', 'logging', 'tickets'];
$coreAllEnabled = true;
foreach ($coreModuleKeys as $k) {
    if (!moduleEnabled($modulesData, $k)) {
        $coreAllEnabled = false;
        break;
    }
}

// Compute overall step progress (5 steps)
$steps = [
    'invite'  => !empty($guilds),
    'modules' => $coreAllEnabled,
    'welcome' => !hasIssueKey($issues, 'welcome_no_channel') && !hasIssueKey($issues, 'welcome_disabled'),
    'logging' => !hasIssueKey($issues, 'logging_no_channel') && !hasIssueKey($issues, 'logging_disabled'),
    'tickets' => !hasIssueKey($issues, 'tickets_no_staff')   && !hasIssueKey($issues, 'tickets_disabled'),
];
$stepsComplete = count(array_filter($steps));
$stepsTotal    = count($steps);
$progressPct   = $stepsTotal > 0 ? (int)round($stepsComplete / $stepsTotal * 100) : 0;
$setupComplete = $progressPct === 100 && !$hasPermErrors;

include '../includes/header.php';
include '../includes/sidebar.php';
?>

<style>
/* ============ Setup Wizard ============ */
.setup-wrap {
    max-width: 820px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
}

.setup-hero {
    display: flex;
    align-items: flex-start;
    gap: 1.25rem;
    margin-bottom: 2rem;
}
.setup-hero-icon {
    font-size: 2.4rem;
    line-height: 1;
    flex-shrink: 0;
}
.setup-hero h1 {
    font-size: 1.35rem;
    font-weight: 700;
    margin: 0 0 .25rem;
    color: var(--text-primary);
}
.setup-hero p {
    font-size: .88rem;
    color: var(--text-secondary);
    margin: 0;
    max-width: 560px;
}

/* Progress bar */
.setup-progress-wrap {
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 10px;
    padding: 1rem 1.25rem;
    margin-bottom: 1.75rem;
    display: flex;
    align-items: center;
    gap: 1rem;
}
.setup-progress-bar {
    flex: 1;
    height: 8px;
    background: var(--bg-main);
    border-radius: 99px;
    overflow: hidden;
}
.setup-progress-fill {
    height: 100%;
    border-radius: 99px;
    transition: width .5s ease;
    background: linear-gradient(90deg, var(--primary), #7c3aed);
}
.setup-progress-label {
    font-size: .8rem;
    font-weight: 600;
    color: var(--text-secondary);
    white-space: nowrap;
}

/* No guild selected banner */
.setup-no-guild {
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 10px;
    padding: 2rem;
    text-align: center;
    color: var(--text-secondary);
}
.setup-no-guild a {
    color: var(--primary);
    text-decoration: none;
    font-weight: 600;
}

/* Steps */
.setup-steps {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.setup-step {
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 10px;
    overflow: hidden;
    transition: border-color .15s;
}
.setup-step.is-done {
    border-color: #2ecc71;
}
.setup-step.is-error {
    border-color: #e74c3c;
}
.setup-step.is-warn {
    border-color: #f39c12;
}

.setup-step-header {
    display: flex;
    align-items: center;
    gap: .9rem;
    padding: .9rem 1.1rem;
    cursor: pointer;
    user-select: none;
}
.setup-step-header:hover { background: var(--bg-hover, rgba(255,255,255,.04)); }

.setup-step-number {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: .78rem;
    font-weight: 700;
    flex-shrink: 0;
    background: var(--bg-main);
    color: var(--text-secondary);
    border: 2px solid var(--border-light);
}
.is-done .setup-step-number {
    background: #2ecc71;
    border-color: #2ecc71;
    color: #fff;
}
.is-error .setup-step-number {
    background: #e74c3c;
    border-color: #e74c3c;
    color: #fff;
}
.is-warn .setup-step-number {
    background: #f39c12;
    border-color: #f39c12;
    color: #fff;
}

.setup-step-meta {
    flex: 1;
    min-width: 0;
}
.setup-step-title {
    font-size: .92rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 .15rem;
}
.setup-step-subtitle {
    font-size: .78rem;
    color: var(--text-secondary);
    margin: 0;
}

.setup-step-badge {
    font-size: .72rem;
    font-weight: 700;
    padding: .15rem .55rem;
    border-radius: 99px;
    white-space: nowrap;
}
.badge-done    { background: rgba(46,204,113,.15); color: #2ecc71; }
.badge-error   { background: rgba(231,76,60,.12);  color: #e74c3c; }
.badge-warn    { background: rgba(243,156,18,.12); color: #f39c12; }
.badge-pending { background: rgba(255,255,255,.07); color: var(--text-secondary); }

.setup-step-chevron {
    color: var(--text-secondary);
    font-size: .9rem;
    transition: transform .2s;
}
.setup-step.is-open .setup-step-chevron { transform: rotate(90deg); }

.setup-step-body {
    display: none;
    padding: 0 1.1rem 1.1rem;
    border-top: 1px solid var(--border-light);
}
.setup-step.is-open .setup-step-body { display: block; }

.setup-step-body p {
    font-size: .85rem;
    color: var(--text-secondary);
    margin: .75rem 0 .9rem;
    line-height: 1.55;
}

/* Module grid inside a step */
.module-toggle-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: .6rem;
    margin-bottom: .9rem;
}
.module-toggle-row {
    display: flex;
    align-items: center;
    gap: .6rem;
    background: var(--bg-main);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    padding: .5rem .75rem;
}
.module-toggle-icon { font-size: 1.1rem; }
.module-toggle-name { font-size: .83rem; font-weight: 600; color: var(--text-primary); flex: 1; }
.module-toggle-status { font-size: .72rem; font-weight: 700; }
.status-on  { color: #2ecc71; }
.status-off { color: var(--text-secondary); }

/* Issue list inside step body */
.setup-issue-list {
    display: flex;
    flex-direction: column;
    gap: .4rem;
    margin-bottom: .9rem;
}
.setup-issue {
    display: flex;
    align-items: flex-start;
    gap: .6rem;
    font-size: .82rem;
    padding: .5rem .75rem;
    border-radius: 7px;
    background: var(--bg-main);
    border: 1px solid var(--border-light);
}
.setup-issue-icon { font-size: 1rem; flex-shrink: 0; margin-top: .05rem; }
.setup-issue-body { flex: 1; }
.setup-issue-label { font-weight: 600; color: var(--text-primary); margin-bottom: .15rem; }
.setup-issue-hint { color: var(--text-secondary); line-height: 1.4; }
.setup-issue.sev-error { border-color: rgba(231,76,60,.35); background: rgba(231,76,60,.06); }
.setup-issue.sev-warn  { border-color: rgba(243,156,18,.3);  background: rgba(243,156,18,.06); }
.setup-issue.sev-info  { border-color: rgba(59,130,246,.25); background: rgba(59,130,246,.05); }

.setup-issue-fix {
    font-size: .75rem;
    font-weight: 600;
    color: var(--primary);
    text-decoration: none;
    white-space: nowrap;
    flex-shrink: 0;
    margin-top: .1rem;
}
.setup-issue-fix:hover { text-decoration: underline; }

/* CTA buttons in step body */
.setup-actions {
    display: flex;
    gap: .6rem;
    flex-wrap: wrap;
    align-items: center;
}
.btn-setup {
    display: inline-flex;
    align-items: center;
    gap: .4rem;
    padding: .5rem 1rem;
    border-radius: 7px;
    font-size: .82rem;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: opacity .15s;
    text-decoration: none;
}
.btn-setup:hover { opacity: .85; }
.btn-setup-primary { background: var(--primary); color: #fff; }
.btn-setup-ghost   { background: var(--bg-main); color: var(--text-primary); border: 1px solid var(--border-light); }
.btn-setup[disabled] { opacity: .4; cursor: not-allowed; }

/* Completion banner */
.setup-complete-banner {
    background: linear-gradient(135deg, rgba(46,204,113,.12), rgba(52,152,219,.1));
    border: 1px solid rgba(46,204,113,.4);
    border-radius: 12px;
    padding: 1.75rem;
    text-align: center;
    margin-top: 1.5rem;
}
.setup-complete-banner h2 {
    font-size: 1.25rem;
    font-weight: 700;
    margin: .5rem 0 .6rem;
    color: var(--text-primary);
}
.setup-complete-banner p {
    font-size: .88rem;
    color: var(--text-secondary);
    margin: 0 0 1.2rem;
}
.setup-complete-links {
    display: flex;
    gap: .6rem;
    justify-content: center;
    flex-wrap: wrap;
}
.btn-complete {
    display: inline-flex;
    align-items: center;
    gap: .4rem;
    padding: .55rem 1.1rem;
    border-radius: 8px;
    font-size: .83rem;
    font-weight: 600;
    text-decoration: none;
    transition: opacity .15s;
}
.btn-complete:hover { opacity: .85; }
.btn-complete-primary { background: var(--primary); color: #fff; }
.btn-complete-ghost   { background: var(--bg-secondary); border: 1px solid var(--border-light); color: var(--text-primary); }

/* Toast notification (inline, reuses existing toast via main.js) */
</style>

<div class="setup-wrap">

    <?php if (!$guildId): ?>
    <!-- No guild selected -->
    <div class="setup-hero">
        <div class="setup-hero-icon">🚀</div>
        <div>
            <h1>Setup Assistant</h1>
            <p>Richtet deinen Server Schritt für Schritt ein — von Modulen über Welcome bis zu Logging und Tickets.</p>
        </div>
    </div>
    <div class="setup-no-guild">
        <p style="margin:0 0 .75rem; font-size:.9rem;">Wähle zuerst einen Server aus, um mit dem Setup zu starten.</p>
        <a href="<?= esc(BASE_URL) ?>/pages/portal.php">→ Zum Server-Auswahl-Portal</a>
    </div>

    <?php else: ?>

    <!-- Hero -->
    <div class="setup-hero">
        <div class="setup-hero-icon">🚀</div>
        <div>
            <h1>Setup Assistant</h1>
            <p>Richte alle wichtigen Features in wenigen Schritten ein.
               <?php if ($healthState === 'critical'): ?>
                 <strong style="color:#e74c3c;">⚠ Kritische Probleme gefunden.</strong>
               <?php elseif ($healthState === 'warn'): ?>
                 <strong style="color:#f39c12;">Einige Einstellungen fehlen noch.</strong>
               <?php else: ?>
                 <strong style="color:#2ecc71;">Alles gut konfiguriert!</strong>
               <?php endif; ?>
            </p>
        </div>
    </div>

    <!-- Progress bar -->
    <div class="setup-progress-wrap">
        <div class="setup-progress-bar">
            <div class="setup-progress-fill" id="progressFill" style="width:<?= $progressPct ?>%"></div>
        </div>
        <div class="setup-progress-label" id="progressLabel"><?= $stepsComplete ?>/<?= $stepsTotal ?> Schritte</div>
    </div>

    <?php if ($hasPermErrors): ?>
    <div style="background:rgba(231,76,60,.08);border:1px solid rgba(231,76,60,.4);border-radius:9px;padding:.9rem 1.1rem;margin-bottom:1.25rem;font-size:.84rem;">
        <strong>⚠ Fehlende Bot-Berechtigungen:</strong>
        <ul style="margin:.5rem 0 0;padding-left:1.2rem;color:var(--text-secondary);">
        <?php foreach ($permIssues as $pi): ?>
            <li><?= esc($pi['label']) ?> — <?= esc($pi['hint'] ?? '') ?></li>
        <?php endforeach; ?>
        </ul>
        <p style="margin:.6rem 0 0;color:var(--text-secondary);">Öffne die <strong>Server-Einstellungen → Integrationen → Fahrstuhl</strong> und erteile die fehlenden Rechte.</p>
    </div>
    <?php endif; ?>

    <div class="setup-steps" id="setupSteps">

        <!-- ── STEP 1: Invite & Select ── -->
        <?php
        $s1Done = !empty($guilds);
        $s1Class = $s1Done ? 'is-done' : 'is-warn';
        ?>
        <div class="setup-step <?= $s1Class ?> is-open" data-step="1">
            <div class="setup-step-header" onclick="toggleStep(this)">
                <div class="setup-step-number"><?= $s1Done ? '✓' : '1' ?></div>
                <div class="setup-step-meta">
                    <div class="setup-step-title">Bot einladen & Server wählen</div>
                    <div class="setup-step-subtitle">Fahrstuhl ist auf deinem Server aktiv</div>
                </div>
                <span class="setup-step-badge <?= $s1Done ? 'badge-done' : 'badge-warn' ?>">
                    <?= $s1Done ? 'Erledigt' : 'Prüfen' ?>
                </span>
                <span class="setup-step-chevron">›</span>
            </div>
            <div class="setup-step-body">
                <p>Der Bot muss auf dem Server vorhanden sein und du musst einen Server ausgewählt haben.</p>
                <div class="setup-actions">
                    <?php if (!$s1Done): ?>
                    <a href="https://discord.com/oauth2/authorize?client_id=1487187616674611321&permissions=1654096264208&scope=bot+applications.commands"
                       target="_blank" rel="noopener" class="btn-setup btn-setup-primary">➕ Bot einladen</a>
                    <?php endif; ?>
                    <a href="<?= esc(BASE_URL) ?>/pages/portal.php" class="btn-setup btn-setup-ghost">🏰 Server wechseln</a>
                </div>
            </div>
        </div>

        <!-- ── STEP 2: Core Modules ── -->
        <?php
        $s2Done  = $coreAllEnabled;
        $s2Class = $s2Done ? 'is-done' : 'is-warn';
        $coreModuleMeta = [
            'welcome'  => ['icon' => '👋', 'label' => 'Welcome'],
            'logging'  => ['icon' => '📜', 'label' => 'Logging'],
            'tickets'  => ['icon' => '🎫', 'label' => 'Tickets'],
            'automod'  => ['icon' => '🛡️', 'label' => 'AutoMod'],
            'leveling' => ['icon' => '📈', 'label' => 'Leveling'],
        ];
        ?>
        <div class="setup-step <?= $s2Class ?>" data-step="2">
            <div class="setup-step-header" onclick="toggleStep(this)">
                <div class="setup-step-number"><?= $s2Done ? '✓' : '2' ?></div>
                <div class="setup-step-meta">
                    <div class="setup-step-title">Kernmodule aktivieren</div>
                    <div class="setup-step-subtitle">Welcome, Logging und Tickets einschalten</div>
                </div>
                <span class="setup-step-badge <?= $s2Done ? 'badge-done' : 'badge-warn' ?>">
                    <?= $s2Done ? 'Alle aktiv' : (array_sum(array_map(fn($k) => moduleEnabled($modulesData, $k) ? 1 : 0, $coreModuleKeys)) . '/' . count($coreModuleKeys) . ' aktiv') ?>
                </span>
                <span class="setup-step-chevron">›</span>
            </div>
            <div class="setup-step-body">
                <p>Aktiviere die Kernmodule. Du kannst einzelne Module hier direkt umschalten oder alle auf einmal starten.</p>
                <div class="module-toggle-grid">
                    <?php foreach ($coreModuleMeta as $mKey => $mMeta):
                        $isOn = moduleEnabled($modulesData, $mKey);
                    ?>
                    <div class="module-toggle-row">
                        <span class="module-toggle-icon"><?= esc($mMeta['icon']) ?></span>
                        <span class="module-toggle-name"><?= esc($mMeta['label']) ?></span>
                        <span class="module-toggle-status <?= $isOn ? 'status-on' : 'status-off' ?>" id="ms-<?= esc($mKey) ?>">
                            <?= $isOn ? 'AN' : 'AUS' ?>
                        </span>
                        <button
                            class="btn-setup <?= $isOn ? 'btn-setup-ghost' : 'btn-setup-primary' ?>"
                            style="padding:.25rem .6rem;font-size:.73rem;"
                            onclick="toggleModule('<?= esc($guildId) ?>', '<?= esc($mKey) ?>', <?= $isOn ? 'false' : 'true' ?>, this)">
                            <?= $isOn ? 'Aus' : 'An' ?>
                        </button>
                    </div>
                    <?php endforeach; ?>
                </div>
                <?php if (!$s2Done): ?>
                <div class="setup-actions">
                    <button class="btn-setup btn-setup-primary" id="btnEnableCore" onclick="enableCore('<?= esc($guildId) ?>')">
                        ⚡ Alle 3 Kernmodule aktivieren
                    </button>
                </div>
                <?php else: ?>
                <div class="setup-actions">
                    <a href="<?= esc(dashboardPageUrl('modules')) ?>" class="btn-setup btn-setup-ghost">🧩 Alle Module verwalten</a>
                </div>
                <?php endif; ?>
            </div>
        </div>

        <!-- ── STEP 3: Welcome ── -->
        <?php
        $s3WarnChannel  = hasIssueKey($issues, 'welcome_no_channel');
        $s3WarnDisabled = hasIssueKey($issues, 'welcome_disabled');
        $s3Done  = !$s3WarnChannel && !$s3WarnDisabled;
        $s3Class = $s3Done ? 'is-done' : ($s3WarnDisabled ? 'is-warn' : 'is-warn');
        $s3Issues = issuesByKey($issues, 'welcome_');
        ?>
        <div class="setup-step <?= $s3Class ?>" data-step="3">
            <div class="setup-step-header" onclick="toggleStep(this)">
                <div class="setup-step-number"><?= $s3Done ? '✓' : '3' ?></div>
                <div class="setup-step-meta">
                    <div class="setup-step-title">Welcome-Modul konfigurieren</div>
                    <div class="setup-step-subtitle">Kanal setzen, Texte anpassen, Autorole optional</div>
                </div>
                <span class="setup-step-badge <?= $s3Done ? 'badge-done' : 'badge-warn' ?>">
                    <?= $s3Done ? 'Konfiguriert' : ($s3WarnDisabled ? 'Deaktiviert' : 'Kanal fehlt') ?>
                </span>
                <span class="setup-step-chevron">›</span>
            </div>
            <div class="setup-step-body">
                <p>Das Welcome-Modul sendet Begrüßungs- und Abschiedsnachrichten. Konfiguriere mindestens einen Kanal.</p>
                <?php if (!empty($s3Issues)): ?>
                <div class="setup-issue-list">
                    <?php foreach ($s3Issues as $issue): ?>
                    <div class="setup-issue sev-<?= esc($issue['severity']) ?>">
                        <span class="setup-issue-icon"><?= esc($issue['icon'] ?? '•') ?></span>
                        <div class="setup-issue-body">
                            <div class="setup-issue-label"><?= esc($issue['label']) ?></div>
                            <?php if (!empty($issue['hint'])): ?>
                            <div class="setup-issue-hint"><?= esc($issue['hint']) ?></div>
                            <?php endif; ?>
                        </div>
                        <?php if (!empty($issue['fixUrl'])): ?>
                        <a href="<?= esc($issue['fixUrl']) ?>" class="setup-issue-fix">→ Öffnen</a>
                        <?php endif; ?>
                    </div>
                    <?php endforeach; ?>
                </div>
                <?php endif; ?>
                <div class="setup-actions">
                    <a href="<?= esc(dashboardPageUrl('welcome')) ?>" class="btn-setup btn-setup-primary">👋 Welcome einrichten</a>
                </div>
            </div>
        </div>

        <!-- ── STEP 4: Logging ── -->
        <?php
        $s4WarnChannel  = hasIssueKey($issues, 'logging_no_channel');
        $s4WarnDisabled = hasIssueKey($issues, 'logging_disabled');
        $s4Done  = !$s4WarnChannel && !$s4WarnDisabled;
        $s4Class = $s4Done ? 'is-done' : 'is-warn';
        $s4Issues = issuesByKey($issues, 'logging_');
        ?>
        <div class="setup-step <?= $s4Class ?>" data-step="4">
            <div class="setup-step-header" onclick="toggleStep(this)">
                <div class="setup-step-number"><?= $s4Done ? '✓' : '4' ?></div>
                <div class="setup-step-meta">
                    <div class="setup-step-title">Logging konfigurieren</div>
                    <div class="setup-step-subtitle">Server-Events, Moderationsaktionen und AutoMod-Treffer loggen</div>
                </div>
                <span class="setup-step-badge <?= $s4Done ? 'badge-done' : 'badge-warn' ?>">
                    <?= $s4Done ? 'Konfiguriert' : ($s4WarnDisabled ? 'Deaktiviert' : 'Kanal fehlt') ?>
                </span>
                <span class="setup-step-chevron">›</span>
            </div>
            <div class="setup-step-body">
                <p>Logging zeichnet Bans, gelöschte Nachrichten, Voice-Aktivität und Moderationsaktionen auf. Wähle einen Log-Kanal.</p>
                <?php if (!empty($s4Issues)): ?>
                <div class="setup-issue-list">
                    <?php foreach ($s4Issues as $issue): ?>
                    <div class="setup-issue sev-<?= esc($issue['severity']) ?>">
                        <span class="setup-issue-icon"><?= esc($issue['icon'] ?? '•') ?></span>
                        <div class="setup-issue-body">
                            <div class="setup-issue-label"><?= esc($issue['label']) ?></div>
                            <?php if (!empty($issue['hint'])): ?>
                            <div class="setup-issue-hint"><?= esc($issue['hint']) ?></div>
                            <?php endif; ?>
                        </div>
                        <?php if (!empty($issue['fixUrl'])): ?>
                        <a href="<?= esc($issue['fixUrl']) ?>" class="setup-issue-fix">→ Öffnen</a>
                        <?php endif; ?>
                    </div>
                    <?php endforeach; ?>
                </div>
                <?php endif; ?>
                <div class="setup-actions">
                    <a href="<?= esc(dashboardPageUrl('logging')) ?>" class="btn-setup btn-setup-primary">📜 Logging einrichten</a>
                </div>
            </div>
        </div>

        <!-- ── STEP 5: Tickets ── -->
        <?php
        $s5WarnDisabled = hasIssueKey($issues, 'tickets_disabled');
        $s5WarnStaff    = hasIssueKey($issues, 'tickets_no_staff');
        $s5InfoPanel    = hasIssueKey($issues, 'tickets_no_panel');
        $s5Done  = !$s5WarnDisabled && !$s5WarnStaff;
        $s5Class = $s5Done ? 'is-done' : ($s5WarnDisabled || $s5WarnStaff ? 'is-warn' : 'is-done');
        $s5Issues = issuesByKey($issues, 'tickets_');
        ?>
        <div class="setup-step <?= $s5Class ?>" data-step="5">
            <div class="setup-step-header" onclick="toggleStep(this)">
                <div class="setup-step-number"><?= $s5Done ? '✓' : '5' ?></div>
                <div class="setup-step-meta">
                    <div class="setup-step-title">Ticket-System einrichten</div>
                    <div class="setup-step-subtitle">Staff-Rolle setzen und Panel veröffentlichen</div>
                </div>
                <span class="setup-step-badge <?= $s5Done ? 'badge-done' : ($s5WarnDisabled ? 'badge-warn' : ($s5WarnStaff ? 'badge-warn' : 'badge-pending')) ?>">
                    <?= $s5Done ? ($s5InfoPanel ? 'Fast fertig' : 'Konfiguriert') : ($s5WarnDisabled ? 'Deaktiviert' : 'Staff fehlt') ?>
                </span>
                <span class="setup-step-chevron">›</span>
            </div>
            <div class="setup-step-body">
                <p>Das Ticket-System lässt Mitglieder Support-Anfragen erstellen. Lege die Staff-Rolle fest und veröffentliche ein Panel.</p>
                <?php if (!empty($s5Issues)): ?>
                <div class="setup-issue-list">
                    <?php foreach ($s5Issues as $issue): ?>
                    <div class="setup-issue sev-<?= esc($issue['severity']) ?>">
                        <span class="setup-issue-icon"><?= esc($issue['icon'] ?? '•') ?></span>
                        <div class="setup-issue-body">
                            <div class="setup-issue-label"><?= esc($issue['label']) ?></div>
                            <?php if (!empty($issue['hint'])): ?>
                            <div class="setup-issue-hint"><?= esc($issue['hint']) ?></div>
                            <?php endif; ?>
                        </div>
                        <?php if (!empty($issue['fixUrl'])): ?>
                        <a href="<?= esc($issue['fixUrl']) ?>" class="setup-issue-fix">→ Öffnen</a>
                        <?php endif; ?>
                    </div>
                    <?php endforeach; ?>
                </div>
                <?php endif; ?>
                <div class="setup-actions">
                    <a href="<?= esc(dashboardPageUrl('tickets')) ?>" class="btn-setup btn-setup-primary">🎫 Tickets einrichten</a>
                </div>
            </div>
        </div>

    </div><!-- /setup-steps -->

    <!-- Completion banner -->
    <?php if ($setupComplete): ?>
    <div class="setup-complete-banner">
        <div style="font-size:2.5rem;">🎉</div>
        <h2>Setup abgeschlossen!</h2>
        <p>Alle Kernmodule sind aktiv und konfiguriert. Dein Server ist bereit.</p>
        <div class="setup-complete-links">
            <a href="<?= esc(dashboardPageUrl('portal')) ?>" class="btn-complete btn-complete-primary">🏠 Zum Portal</a>
            <a href="<?= esc(dashboardPageUrl('modules')) ?>" class="btn-complete btn-complete-ghost">🧩 Alle Module</a>
            <a href="<?= esc(dashboardPageUrl('analytics')) ?>" class="btn-complete btn-complete-ghost">📊 Analytics</a>
        </div>
    </div>
    <?php elseif ($progressPct >= 60): ?>
    <div style="background:var(--bg-secondary);border:1px solid var(--border-light);border-radius:9px;padding:1rem 1.25rem;margin-top:1.5rem;font-size:.84rem;color:var(--text-secondary);">
        <strong style="color:var(--text-primary);">Fast fertig!</strong>
        Erledige die verbleibenden Schritte oben, um das Setup abzuschließen.
        <a href="<?= esc(dashboardPageUrl('portal')) ?>" style="color:var(--primary);margin-left:.5rem;text-decoration:none;">→ Portal öffnen</a>
    </div>
    <?php endif; ?>

    <?php endif; ?><!-- /guildId -->
</div><!-- /setup-wrap -->

<script>
/* ── Setup Wizard JS ── */

function toggleStep(header) {
    const step = header.closest('.setup-step');
    step.classList.toggle('is-open');
}

// Auto-open first non-done step
document.addEventListener('DOMContentLoaded', () => {
    const steps = document.querySelectorAll('.setup-step');
    let openedOne = false;
    steps.forEach(step => {
        step.classList.remove('is-open');
        if (!openedOne && !step.classList.contains('is-done')) {
            step.classList.add('is-open');
            openedOne = true;
        }
    });
    if (!openedOne && steps.length > 0) {
        // All done — open last
        steps[steps.length - 1].classList.add('is-open');
    }
});

function _csrfToken() {
    // Injected by dashboardInjectCsrf — read from a hidden input if needed
    const inp = document.querySelector('input[name="csrf_token"]');
    return inp ? inp.value : '';
}

async function enableCore(guildId) {
    const btn = document.getElementById('btnEnableCore');
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = '⏳ Wird aktiviert…';

    const form = new FormData();
    form.set('action', 'enable_core');
    form.set('csrf_token', _csrfToken());

    try {
        const res = await fetch(location.href, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: form,
        });
        const data = await res.json();
        if (typeof showToast === 'function') {
            showToast(data.message || (data.success ? 'Aktiviert!' : 'Fehler'), data.success ? 'success' : 'error');
        }
        if (data.success) {
            setTimeout(() => location.reload(), 900);
        } else {
            btn.disabled = false;
            btn.textContent = '⚡ Alle 3 Kernmodule aktivieren';
        }
    } catch (_) {
        btn.disabled = false;
        btn.textContent = '⚡ Alle 3 Kernmodule aktivieren';
        if (typeof showToast === 'function') showToast('Netzwerkfehler.', 'error');
    }
}

async function toggleModule(guildId, moduleKey, enable, btn) {
    const origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '…';

    const form = new FormData();
    form.set('action', 'toggle_module');
    form.set('module', moduleKey);
    form.set('enabled', enable ? '1' : '0');
    form.set('csrf_token', _csrfToken());

    try {
        const res = await fetch(location.href, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: form,
        });
        const data = await res.json();
        if (typeof showToast === 'function') {
            showToast(data.message || (data.success ? 'Aktualisiert!' : 'Fehler'), data.success ? 'success' : 'error');
        }
        if (data.success) {
            // Update UI without full reload
            const statusEl = document.getElementById('ms-' + moduleKey);
            if (statusEl) {
                statusEl.textContent = enable ? 'AN' : 'AUS';
                statusEl.className = 'module-toggle-status ' + (enable ? 'status-on' : 'status-off');
            }
            btn.textContent = enable ? 'Aus' : 'An';
            btn.className = 'btn-setup ' + (enable ? 'btn-setup-ghost' : 'btn-setup-primary');
            btn.setAttribute('onclick', `toggleModule('${guildId}', '${moduleKey}', ${enable ? 'false' : 'true'}, this)`);
            btn.disabled = false;
            // Update progress after short delay
            setTimeout(() => updateProgress(), 300);
        } else {
            btn.disabled = false;
            btn.textContent = origText;
        }
    } catch (_) {
        btn.disabled = false;
        btn.textContent = origText;
        if (typeof showToast === 'function') showToast('Netzwerkfehler.', 'error');
    }
}

function updateProgress() {
    // Simple re-count of done steps
    const steps = document.querySelectorAll('.setup-step');
    let done = 0;
    steps.forEach(s => { if (s.classList.contains('is-done')) done++; });
    const total = steps.length;
    const pct = total > 0 ? Math.round(done / total * 100) : 0;
    const fill = document.getElementById('progressFill');
    const label = document.getElementById('progressLabel');
    if (fill) fill.style.transform = 'scaleX(' + (pct / 100) + ')';
    if (label) label.textContent = done + '/' + total + ' Schritte';
}
</script>

<?php include '../includes/footer.php'; ?>
