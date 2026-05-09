<?php
$page_title = 'Server Analytics';
require_once __DIR__ . '/../includes/config.php';
requireLogin();

$guildsRaw = getAPI('/voice/guilds', 8);
$guilds = $guildsRaw['data']['guilds'] ?? [];
$guildId = dashboardSelectedGuildId($guilds);

$analyticsRaw = $guildId ? getAPI('/guilds/' . urlencode($guildId) . '/analytics', 12) : null;
$data = $analyticsRaw['data'] ?? [];
$overview = $data['overview'] ?? [];
$tickets = $data['tickets'] ?? [];
$automod = $data['automod'] ?? [];
$moderation = $data['moderation'] ?? [];
$charts = $data['charts'] ?? [];
$topLists = $data['topLists'] ?? [];
$insights = $data['insights'] ?? [];

$premiumRaw = $guildId ? getAPI('/guilds/' . urlencode($guildId) . '/premium', 8) : null;
$premium = $premiumRaw['data'] ?? [];
$tier = (string)($premium['tier'] ?? 'free');
$hasAdvancedInsights = in_array($tier, ['pro'], true) || isAdmin();

$healthRaw = $guildId ? getAPI('/guilds/' . urlencode($guildId) . '/setup-health', 8) : null;
$health = $healthRaw['data'] ?? [];
$healthSummary = $health['summary'] ?? ['errors' => 0, 'warnings' => 0, 'infos' => 0];

function fmtNum($value) {
    return number_format((int)$value, 0, ',', '.');
}

function fmtDurationMinutes($minutes) {
    $total = max(0, (int)$minutes);
    $h = floor($total / 60);
    $m = $total % 60;
    if ($h <= 0) return $m . 'm';
    return $h . 'h ' . $m . 'm';
}

function userLabel($row) {
    $display = trim((string)($row['displayName'] ?? ''));
    $username = trim((string)($row['username'] ?? ''));
    $userId = trim((string)($row['userId'] ?? 'unknown'));
    if ($display !== '') return $display;
    if ($username !== '') return $username;
    return 'User ' . $userId;
}

$automodPoints = $charts['automodHits']['points'] ?? [];
$moderationPoints = $charts['moderationCases']['points'] ?? [];
$maxAutoModPoint = 1;
foreach ($automodPoints as $point) {
    $maxAutoModPoint = max($maxAutoModPoint, (int)($point['count'] ?? 0));
}
$maxModerationPoint = 1;
foreach ($moderationPoints as $point) {
    $maxModerationPoint = max($maxModerationPoint, (int)($point['count'] ?? 0));
}
?>

<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.sa-wrap { display: flex; flex-direction: column; gap: 1rem; }
.sa-hero { background: linear-gradient(130deg, rgba(102,126,234,0.18), rgba(36,42,58,0.92)); border: 1px solid var(--border-light); border-radius: 14px; padding: 1.2rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; }
.sa-hero h1 { margin: 0; font-size: 1.4rem; }
.sa-hero p { margin: 0.25rem 0 0; font-size: 0.88rem; color: var(--text-secondary); }
.sa-guild-select { padding: 0.55rem; border-radius: 8px; background: var(--bg-tertiary); color: #fff; border: 1px solid var(--border-light); min-width: 250px; }
.sa-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 0.7rem; }
.sa-card { background: var(--panel); border: 1px solid var(--border-light); border-radius: 12px; padding: 0.85rem; display: flex; flex-direction: column; gap: 0.35rem; }
.sa-kpi-label { font-size: 0.72rem; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-secondary); font-weight: 800; }
.sa-kpi-value { font-size: 1.35rem; font-weight: 900; color: var(--text-primary); }
.sa-kpi-help { font-size: 0.76rem; color: var(--text-secondary); }
.sa-sections { display: grid; grid-template-columns: 1.2fr 1fr; gap: 0.8rem; }
.sa-panel { background: var(--panel); border: 1px solid var(--border-light); border-radius: 12px; padding: 0.95rem; }
.sa-panel h2 { margin: 0 0 0.75rem; font-size: 1rem; }
.sa-note { font-size: 0.78rem; color: var(--text-secondary); }
.sa-chart { display: flex; align-items: end; gap: 0.3rem; min-height: 160px; padding: 0.6rem 0 0.2rem; }
.sa-bar-wrap { flex: 1; min-width: 0; display: grid; gap: 0.35rem; justify-items: center; }
.sa-bar { width: 100%; border-radius: 7px 7px 3px 3px; background: linear-gradient(180deg, rgba(102,126,234,0.9), rgba(102,126,234,0.35)); min-height: 3px; }
.sa-bar.alt { background: linear-gradient(180deg, rgba(81,207,102,0.9), rgba(81,207,102,0.35)); }
.sa-bar-num { font-size: 0.68rem; color: var(--text-secondary); }
.sa-bar-lbl { font-size: 0.63rem; color: var(--text-secondary); letter-spacing: 0.03em; }
.sa-list { display: grid; gap: 0.45rem; }
.sa-row { display: flex; justify-content: space-between; gap: 0.6rem; border: 1px solid var(--border-light); background: rgba(255,255,255,0.02); border-radius: 9px; padding: 0.55rem 0.65rem; }
.sa-row strong { font-size: 0.82rem; }
.sa-row span { font-size: 0.76rem; color: var(--text-secondary); }
.sa-empty { border: 1px dashed var(--border-light); border-radius: 10px; padding: 1rem; text-align: center; color: var(--text-secondary); font-size: 0.86rem; }
.sa-health { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.6rem; }
.sa-insights { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.65rem; }
.sa-upgrade {
    border: 1px dashed rgba(168,85,247,0.45);
    border-radius: 12px;
    padding: 0.9rem;
    background: rgba(168,85,247,0.1);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    flex-wrap: wrap;
}

@media (max-width: 1200px) {
    .sa-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .sa-sections { grid-template-columns: 1fr; }
}
@media (max-width: 800px) {
    .sa-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .sa-health { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .sa-insights { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>

<div class="sa-wrap">
    <section class="dashboard-page-header">
        <div class="dashboard-page-copy">
            <span class="dashboard-page-eyebrow">Overview</span>
            <h1>Server Analytics</h1>
            <p>Kompakter Status fuer Mitglieder, Moderation, AutoMod, Tickets und Aktivitaet.</p>
            <div class="dashboard-page-meta">
                <span class="status-badge <?php echo !empty($data) ? 'active' : 'inactive'; ?>"><?php echo !empty($data) ? 'Analytics aktiv' : 'Keine Daten'; ?></span>
            </div>
        </div>
        <div class="module-header-actions">
            <form method="GET">
                <select class="module-header-select" name="guildId" onchange="this.form.submit()">
                    <?php foreach ($guilds as $g): ?>
                        <option value="<?php echo esc($g['id']); ?>" <?php echo $guildId === ($g['id'] ?? '') ? 'selected' : ''; ?>><?php echo esc($g['name']); ?></option>
                    <?php endforeach; ?>
                </select>
            </form>
        </div>
    </section>

    <?php if (empty($guildId) || empty($data)): ?>
        <div class="sa-empty empty-state">
            <strong>Noch keine Analytics-Daten</strong>
            <p>Waehle einen Server aus oder aktiviere zuerst zentrale Module wie Leveling, Tickets und Moderation.</p>
            <a class="btn-icon cta btn-secondary-ui" href="modules.php?guildId=<?php echo urlencode($guildId); ?>">Module oeffnen</a>
        </div>
    <?php else: ?>
        <div class="sa-insights">
            <div class="sa-card">
                <div class="sa-kpi-label">Activity Score</div>
                <div class="sa-kpi-value"><?php echo fmtNum($insights['activityScore'] ?? 0); ?>/100</div>
                <div class="sa-kpi-help">Kompaktwert aus Tickets, AutoMod, Moderation und Engagement.</div>
            </div>
            <div class="sa-card">
                <div class="sa-kpi-label">Ticket Summary</div>
                <div class="sa-kpi-value"><?php echo fmtNum($insights['ticketSummary']['total'] ?? 0); ?></div>
                <div class="sa-kpi-help">Open: <?php echo fmtNum($insights['ticketSummary']['open'] ?? 0); ?> · Closed: <?php echo fmtNum($insights['ticketSummary']['closed'] ?? 0); ?></div>
            </div>
            <div class="sa-card">
                <div class="sa-kpi-label">AutoMod Summary</div>
                <div class="sa-kpi-value"><?php echo fmtNum($insights['automodSummary']['hits7d'] ?? 0); ?></div>
                <div class="sa-kpi-help">7 Tage · 24h: <?php echo fmtNum($insights['automodSummary']['hits24h'] ?? 0); ?></div>
            </div>
            <div class="sa-card">
                <div class="sa-kpi-label">Moderation Summary</div>
                <div class="sa-kpi-value"><?php echo fmtNum($insights['moderationSummary']['cases7d'] ?? 0); ?></div>
                <div class="sa-kpi-help">7 Tage · 24h: <?php echo fmtNum($insights['moderationSummary']['cases24h'] ?? 0); ?></div>
            </div>
        </div>

        <?php if (!$hasAdvancedInsights): ?>
            <div class="sa-upgrade">
                <div>
                    <strong>🔒 Advanced Insights sind Pro</strong>
                    <p class="sa-note">Du hast dein Limit erreicht. Upgrade fuer tiefere Segmentierung und bessere Entscheidungs-Signale.</p>
                </div>
                <a href="<?php echo esc(dashboardPageUrl('server-plans')); ?>" class="btn-icon btn-secondary-ui">Pro ansehen</a>
            </div>
        <?php endif; ?>

        <div class="sa-grid">
            <div class="sa-card">
                <div class="sa-kpi-label">Members</div>
                <div class="sa-kpi-value"><?php echo fmtNum($overview['memberCount'] ?? 0); ?></div>
                <div class="sa-kpi-help">inkl. <?php echo fmtNum($overview['botCount'] ?? 0); ?> Bots</div>
            </div>
            <div class="sa-card">
                <div class="sa-kpi-label">Messages</div>
                <div class="sa-kpi-value"><?php echo fmtNum($overview['messageCount'] ?? 0); ?></div>
                <div class="sa-kpi-help"><?php echo !empty($overview['messageCountAvailable']) ? 'aus Leveling-Tracking' : 'noch keine Daten'; ?></div>
            </div>
            <div class="sa-card">
                <div class="sa-kpi-label">Tickets</div>
                <div class="sa-kpi-value"><?php echo fmtNum($tickets['open'] ?? 0); ?></div>
                <div class="sa-kpi-help">open / <?php echo fmtNum($tickets['closed'] ?? 0); ?> closed</div>
            </div>
            <div class="sa-card">
                <div class="sa-kpi-label">AutoMod Hits (7d)</div>
                <div class="sa-kpi-value"><?php echo fmtNum($automod['hits7d'] ?? 0); ?></div>
                <div class="sa-kpi-help">24h: <?php echo fmtNum($automod['hits24h'] ?? 0); ?></div>
            </div>
            <div class="sa-card">
                <div class="sa-kpi-label">Moderation Cases (7d)</div>
                <div class="sa-kpi-value"><?php echo fmtNum($moderation['cases7d'] ?? 0); ?></div>
                <div class="sa-kpi-help">24h: <?php echo fmtNum($moderation['cases24h'] ?? 0); ?></div>
            </div>
            <div class="sa-card">
                <div class="sa-kpi-label">Active Modules</div>
                <div class="sa-kpi-value"><?php echo fmtNum($overview['activeModulesCount'] ?? 0); ?></div>
                <div class="sa-kpi-help"><?php echo fmtNum($overview['channelCount'] ?? 0); ?> Channels / <?php echo fmtNum($overview['roleCount'] ?? 0); ?> Roles</div>
            </div>
        </div>

        <div class="sa-panel">
            <h2>Server Health Snapshot</h2>
            <div class="sa-health">
                <div class="sa-card"><div class="sa-kpi-label">Warnings</div><div class="sa-kpi-value"><?php echo fmtNum($healthSummary['warnings'] ?? 0); ?></div></div>
                <div class="sa-card"><div class="sa-kpi-label">Errors</div><div class="sa-kpi-value"><?php echo fmtNum($healthSummary['errors'] ?? 0); ?></div></div>
                <div class="sa-card"><div class="sa-kpi-label">Infos</div><div class="sa-kpi-value"><?php echo fmtNum($healthSummary['infos'] ?? 0); ?></div></div>
                <div class="sa-card">
                    <div class="sa-kpi-label">Core Modules</div>
                    <div class="sa-kpi-value"><?php echo fmtNum($overview['activeModulesCount'] ?? 0); ?></div>
                    <div class="sa-kpi-help"><a href="<?php echo esc(dashboardPageUrl('modules')); ?>" style="color:var(--primary-light); text-decoration:none;">Module verwalten</a></div>
                </div>
            </div>
        </div>

        <?php if ($hasAdvancedInsights): ?>
            <div class="sa-panel">
                <h2>Advanced Insights (Pro)</h2>
                <div class="sa-list">
                    <div class="sa-row">
                        <strong>Top Moderation Types</strong>
                        <span>
                            Warn: <?php echo fmtNum($insights['moderationSummary']['byType']['warn'] ?? 0); ?> ·
                            Timeout: <?php echo fmtNum($insights['moderationSummary']['byType']['timeout'] ?? 0); ?> ·
                            Kick: <?php echo fmtNum($insights['moderationSummary']['byType']['kick'] ?? 0); ?> ·
                            Ban: <?php echo fmtNum($insights['moderationSummary']['byType']['ban'] ?? 0); ?>
                        </span>
                    </div>
                    <div class="sa-row">
                        <strong>Server Health Summary</strong>
                        <span>
                            Members: <?php echo fmtNum($insights['serverHealthSummary']['memberCount'] ?? 0); ?> ·
                            Channels: <?php echo fmtNum($insights['serverHealthSummary']['channelCount'] ?? 0); ?> ·
                            Roles: <?php echo fmtNum($insights['serverHealthSummary']['roleCount'] ?? 0); ?> ·
                            Core: <?php echo fmtNum($insights['serverHealthSummary']['activeModulesCount'] ?? 0); ?>
                        </span>
                    </div>
                </div>
            </div>
        <?php endif; ?>

        <div class="sa-sections">
            <div class="sa-panel">
                <h2>Activity Charts</h2>

                <div style="margin-bottom:1rem;">
                    <div class="sa-kpi-label" style="margin-bottom:0.35rem;">AutoMod Hits (last 14 days)</div>
                    <?php if (empty($automodPoints)): ?>
                        <div class="sa-empty">Keine AutoMod-Timeline vorhanden.</div>
                    <?php else: ?>
                        <div class="sa-chart">
                            <?php foreach ($automodPoints as $point):
                                $count = (int)($point['count'] ?? 0);
                                $h = (int)round(($count / $maxAutoModPoint) * 130);
                            ?>
                                <div class="sa-bar-wrap" title="<?php echo esc(($point['day'] ?? '') . ': ' . $count); ?>">
                                    <div class="sa-bar-num"><?php echo $count; ?></div>
                                    <div class="sa-bar" style="height:<?php echo max(3, $h); ?>px;"></div>
                                    <div class="sa-bar-lbl"><?php echo esc($point['label'] ?? ''); ?></div>
                                </div>
                            <?php endforeach; ?>
                        </div>
                    <?php endif; ?>
                </div>

                <div style="margin-bottom:1rem;">
                    <div class="sa-kpi-label" style="margin-bottom:0.35rem;">Moderation Cases (last 14 days)</div>
                    <?php if (empty($moderationPoints)): ?>
                        <div class="sa-empty">Keine Moderation-Timeline vorhanden.</div>
                    <?php else: ?>
                        <div class="sa-chart">
                            <?php foreach ($moderationPoints as $point):
                                $count = (int)($point['count'] ?? 0);
                                $h = (int)round(($count / $maxModerationPoint) * 130);
                            ?>
                                <div class="sa-bar-wrap" title="<?php echo esc(($point['day'] ?? '') . ': ' . $count); ?>">
                                    <div class="sa-bar-num"><?php echo $count; ?></div>
                                    <div class="sa-bar alt" style="height:<?php echo max(3, $h); ?>px;"></div>
                                    <div class="sa-bar-lbl"><?php echo esc($point['label'] ?? ''); ?></div>
                                </div>
                            <?php endforeach; ?>
                        </div>
                    <?php endif; ?>
                </div>

                <div>
                    <div class="sa-kpi-label" style="margin-bottom:0.35rem;">Messages & Joins/Leaves</div>
                    <div class="sa-empty">Aktuell werden dafuer noch keine historischen Zeitreihen gespeichert. Die Seite zeigt deshalb bewusst einen leeren Zustand statt fehlerhafter Fake-Daten.</div>
                </div>
            </div>

            <div class="sa-panel">
                <h2>Top Lists</h2>

                <div style="margin-bottom:0.9rem;">
                    <div class="sa-kpi-label" style="margin-bottom:0.35rem;">Top XP Users</div>
                    <div class="sa-list">
                        <?php $topXp = $topLists['topXpUsers'] ?? []; ?>
                        <?php if (empty($topXp)): ?>
                            <div class="sa-empty">Noch keine XP-Daten vorhanden.</div>
                        <?php else: ?>
                            <?php foreach (array_slice($topXp, 0, 7) as $row): ?>
                                <div class="sa-row">
                                    <strong><?php echo esc(userLabel($row)); ?></strong>
                                    <span>Lvl <?php echo fmtNum($row['level'] ?? 0); ?> · <?php echo fmtNum($row['xp'] ?? 0); ?> XP</span>
                                </div>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </div>
                </div>

                <div style="margin-bottom:0.9rem;">
                    <div class="sa-kpi-label" style="margin-bottom:0.35rem;">Top Voice Users</div>
                    <div class="sa-list">
                        <?php $topVoice = $topLists['topVoiceUsers'] ?? []; ?>
                        <?php if (empty($topVoice)): ?>
                            <div class="sa-empty">Noch keine Voice-Stats vorhanden.</div>
                        <?php else: ?>
                            <?php foreach (array_slice($topVoice, 0, 7) as $row): ?>
                                <div class="sa-row">
                                    <strong><?php echo esc(userLabel($row)); ?></strong>
                                    <span><?php echo esc(fmtDurationMinutes($row['durationMinutes'] ?? 0)); ?> · <?php echo fmtNum($row['sessions'] ?? 0); ?> Sessions</span>
                                </div>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </div>
                </div>

                <div style="margin-bottom:0.9rem;">
                    <div class="sa-kpi-label" style="margin-bottom:0.35rem;">Most Active Channels</div>
                    <div class="sa-list">
                        <?php $activeChannels = $topLists['mostActiveChannels'] ?? []; ?>
                        <?php if (empty($activeChannels)): ?>
                            <div class="sa-empty">Noch keine Channel-Aktivitaet vorhanden.</div>
                        <?php else: ?>
                            <?php foreach (array_slice($activeChannels, 0, 6) as $row): ?>
                                <div class="sa-row">
                                    <strong><?php echo esc($row['channelName'] ?? '#unknown'); ?></strong>
                                    <span><?php echo esc(fmtDurationMinutes($row['durationMinutes'] ?? 0)); ?> · <?php echo fmtNum($row['sessions'] ?? 0); ?> Sessions</span>
                                </div>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </div>
                </div>

                <div>
                    <div class="sa-kpi-label" style="margin-bottom:0.35rem;">Recent Moderation / AutoMod</div>
                    <div class="sa-list">
                        <?php $recent = $topLists['recentActivity'] ?? []; ?>
                        <?php if (empty($recent)): ?>
                            <div class="sa-empty">Noch keine Moderation-Aktivitaet vorhanden.</div>
                        <?php else: ?>
                            <?php foreach (array_slice($recent, 0, 8) as $row): ?>
                                <div class="sa-row">
                                    <strong><?php echo esc(strtoupper((string)($row['type'] ?? 'case'))); ?></strong>
                                    <span><?php echo esc(userLabel($row)); ?> · <?php echo !empty($row['createdAt']) ? date('d.m H:i', (int)($row['createdAt'] / 1000)) : 'unknown'; ?></span>
                                </div>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </div>
                </div>
            </div>
        </div>

        <div class="sa-panel">
            <h2>Beginner Quick Read</h2>
            <p class="sa-note">Wenn Members hoch sind, aber Messages und Tickets niedrig bleiben, fehlt oft noch ein klarer Welcome/Onboarding Flow.</p>
            <p class="sa-note">Viele AutoMod Hits bei niedrigen Moderation Cases bedeuten: Regeln triggern oft, aber Staff muss wenig manuell eingreifen.</p>
            <p class="sa-note">Viele offene Tickets ueber laengere Zeit deuten auf fehlende Staff-Rotation oder fehlende Ticket-Workflows hin.</p>
        </div>
    <?php endif; ?>
</div>

<?php include '../includes/footer.php'; ?>
