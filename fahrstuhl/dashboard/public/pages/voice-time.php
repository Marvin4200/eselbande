<?php
$page_title = 'Voice Time';
require_once __DIR__ . '/../includes/config.php';
requireLogin();

function msToPretty($ms) {
    $ms = max(0, (int)$ms);
    $s = (int)floor($ms / 1000);
    $h = (int)floor($s / 3600);
    $m = (int)floor(($s % 3600) / 60);
    if ($h <= 0) return $m . 'm';
    return $h . 'h ' . str_pad((string)$m, 2, '0', STR_PAD_LEFT) . 'm';
}

function compactId($id) {
    $id = (string)$id;
    if (strlen($id) <= 10) return $id;
    return substr($id, 0, 6) . '...' . substr($id, -4);
}

function pct($value, $max) {
    $max = max(1, (int)$max);
    return max(2, min(100, round(((int)$value / $max) * 100)));
}

$guildsRaw = getAPI('/voice/guilds', 20);
$guilds = $guildsRaw['data']['guilds'] ?? [];

$guildId = dashboardSelectedGuildId($guilds);

$days = isset($_GET['days']) ? max(1, min(365, (int)$_GET['days'])) : 30;
$limit = isset($_GET['limit']) ? max(5, min(300, (int)$_GET['limit'])) : 100;
$userId = trim($_GET['userId'] ?? '');

$summary = null;
$detail = null;
$live = null;
$rewardAudit = null;
$heatmap = null;
$selectedGuild = null;
foreach ($guilds as $g) {
    if (($g['id'] ?? '') === $guildId) $selectedGuild = $g;
}

if ($guildId) {
    $summaryRaw = getAPI('/voice/usage/summary?guildId=' . urlencode($guildId) . '&days=' . $days . '&limit=' . $limit, 30);
    $summary = $summaryRaw['data'] ?? null;

    $liveRaw = getAPI('/voice/usage/live?guildId=' . urlencode($guildId), 20);
    $live = $liveRaw['data'] ?? null;

    $rewardRaw = getAPI('/voice/usage/rewards?guildId=' . urlencode($guildId) . '&days=' . $days . '&limit=60', 25);
    $rewardAudit = $rewardRaw['data'] ?? null;

    $heatmapRaw = getAPI('/voice/usage/heatmap?guildId=' . urlencode($guildId) . '&days=' . $days, 25);
    $heatmap = $heatmapRaw['data'] ?? null;

    if ($userId !== '') {
        $detailRaw = getAPI('/voice/usage/user/' . urlencode($userId) . '?guildId=' . urlencode($guildId) . '&days=' . $days, 30);
        $detail = $detailRaw['data'] ?? null;
    }
}

$users = $summary['users'] ?? [];
$topUser = $users[0] ?? null;
$maxMs = 1;
$totalMs = 0;
$activeUsers = 0;
$totalSessions = 0;
foreach ($users as $u) {
    $ms = (int)($u['totalMs'] ?? 0);
    $maxMs = max($maxMs, $ms);
    $totalMs += $ms;
    $activeUsers += !empty($u['activeSessions']) ? 1 : 0;
    $totalSessions += (int)($u['sessions'] ?? 0);
}

$liveSessions = $live['sessions'] ?? [];
$rewards = $rewardAudit['rewards'] ?? [];
$heatBuckets = $heatmap['buckets'] ?? [];
$heatByKey = [];
$heatMax = 1;
foreach ($heatBuckets as $bucket) {
    $key = ((int)($bucket['weekday'] ?? 0)) . '-' . ((int)($bucket['hour'] ?? 0));
    $heatByKey[$key] = $bucket;
    $heatMax = max($heatMax, (int)($bucket['totalMs'] ?? 0));
}
$weekdayLabels = [1 => 'Sun', 2 => 'Mon', 3 => 'Tue', 4 => 'Wed', 5 => 'Thu', 6 => 'Fri', 7 => 'Sat'];
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.voice-shell { display:grid; gap:1rem; }
.voice-hero {
    position:relative;
    overflow:hidden;
    border:1px solid rgba(102,126,234,.24);
    border-radius:14px;
    padding:1.15rem;
    background:
        radial-gradient(circle at 10% 20%, rgba(81,207,102,.16), transparent 28%),
        radial-gradient(circle at 95% 0%, rgba(102,126,234,.24), transparent 30%),
        linear-gradient(135deg, rgba(26,31,46,.96), rgba(15,20,25,.98));
    box-shadow:0 18px 45px rgba(0,0,0,.24);
}
.voice-hero-row { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap; }
.voice-title { display:flex; align-items:center; gap:.85rem; }
.voice-guild-icon {
    width:52px; height:52px; border-radius:16px; object-fit:cover;
    display:flex; align-items:center; justify-content:center;
    background:rgba(102,126,234,.16); border:1px solid rgba(102,126,234,.28);
    font-size:1.4rem;
}
.voice-title h1 { margin:0; font-size:1.55rem; }
.voice-title p { margin:.15rem 0 0; color:var(--text-secondary); font-size:.92rem; }
.voice-refresh { color:var(--text-secondary); font-size:.82rem; }
.voice-filters {
    display:grid;
    grid-template-columns:minmax(220px, 1.5fr) repeat(2, minmax(90px, .45fr)) minmax(190px, .85fr) auto;
    gap:.7rem;
    align-items:end;
    margin-top:1rem;
}
.voice-filters label { display:grid; gap:.35rem; color:var(--text-secondary); font-size:.78rem; font-weight:800; text-transform:uppercase; letter-spacing:.06em; }
.voice-filters select, .voice-filters input {
    width:100%;
    padding:.7rem .75rem;
    border-radius:10px;
    border:1px solid rgba(64,72,84,.9);
    background:rgba(15,20,25,.62);
    color:var(--text-primary);
    outline:none;
}
.voice-filters select:focus, .voice-filters input:focus { border-color:rgba(102,126,234,.8); box-shadow:0 0 0 3px rgba(102,126,234,.14); }
.voice-filters.is-loading { opacity:.78; pointer-events:none; }
.voice-submit { position:relative; }
.voice-submit.is-loading::after {
    content:"";
    width:14px; height:14px; margin-left:.55rem;
    display:inline-block; vertical-align:-2px;
    border:2px solid rgba(255,255,255,.35);
    border-top-color:#fff;
    border-radius:50%;
    animation:voice-spin .7s linear infinite;
}
@keyframes voice-spin { to { transform:rotate(360deg); } }
.voice-kpis { display:grid; grid-template-columns:repeat(4,minmax(150px,1fr)); gap:.85rem; }
.voice-kpi {
    border:1px solid rgba(64,72,84,.72);
    border-radius:12px;
    padding:1rem;
    background:linear-gradient(180deg, rgba(37,45,61,.82), rgba(26,31,46,.74));
}
.voice-kpi span { display:block; color:var(--text-secondary); font-size:.78rem; font-weight:800; text-transform:uppercase; letter-spacing:.06em; }
.voice-kpi strong { display:block; margin-top:.35rem; font-size:1.45rem; color:var(--text-primary); line-height:1.1; }
.voice-kpi small { display:block; margin-top:.35rem; color:var(--text-secondary); }
.voice-grid { display:grid; grid-template-columns:minmax(0,1.25fr) minmax(320px,.75fr); gap:1rem; align-items:start; }
.voice-panel {
    border:1px solid rgba(64,72,84,.75);
    border-radius:14px;
    background:rgba(26,31,46,.74);
    overflow:hidden;
}
.voice-panel-head { display:flex; justify-content:space-between; align-items:center; gap:1rem; padding:1rem 1rem .75rem; border-bottom:1px solid rgba(64,72,84,.55); }
.voice-panel-head h2 { margin:0; font-size:1rem; }
.voice-panel-head p { margin:.18rem 0 0; color:var(--text-secondary); font-size:.84rem; }
.voice-list { display:grid; gap:.55rem; padding:.85rem; max-height:640px; overflow:auto; }
.voice-user {
    display:grid;
    grid-template-columns:auto 1fr auto;
    gap:.8rem;
    align-items:center;
    padding:.85rem;
    border:1px solid rgba(64,72,84,.55);
    border-radius:12px;
    background:rgba(15,20,25,.38);
    text-decoration:none;
    color:inherit;
    transition:transform .16s ease, border-color .16s ease, background .16s ease;
}
.voice-user:hover { transform:translateY(-1px); border-color:rgba(102,126,234,.55); background:rgba(37,45,61,.62); }
.voice-user.active { border-color:rgba(81,207,102,.55); }
.voice-rank {
    width:34px; height:34px; border-radius:10px;
    display:flex; align-items:center; justify-content:center;
    background:rgba(102,126,234,.14); color:var(--primary-light); font-weight:900;
}
.voice-user-main { min-width:0; }
.voice-user-name { display:flex; align-items:center; gap:.45rem; font-weight:800; min-width:0; }
.voice-user-name span:first-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.voice-live {
    display:inline-flex; align-items:center; gap:.25rem;
    padding:.1rem .42rem; border-radius:999px;
    background:rgba(81,207,102,.12); color:var(--success);
    border:1px solid rgba(81,207,102,.35);
    font-size:.68rem; font-weight:900; text-transform:uppercase;
}
.voice-user-meta { color:var(--text-secondary); font-size:.8rem; margin-top:.16rem; }
.voice-bar { height:7px; border-radius:999px; background:rgba(64,72,84,.75); overflow:hidden; margin-top:.58rem; }
.voice-bar > i { display:block; height:100%; border-radius:999px; background:linear-gradient(90deg,var(--primary),var(--success)); }
.voice-time-badge {
    min-width:86px; text-align:right;
    font-size:1rem; font-weight:900; color:var(--text-primary);
}
.voice-detail-empty { padding:1.2rem; color:var(--text-secondary); }
.voice-channel-list { display:grid; gap:.55rem; padding:.85rem; }
.voice-channel {
    display:grid; gap:.42rem; padding:.85rem;
    border:1px solid rgba(64,72,84,.55);
    border-radius:12px; background:rgba(15,20,25,.34);
}
.voice-channel-top { display:flex; justify-content:space-between; gap:1rem; align-items:center; }
.voice-channel-name { font-weight:800; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.voice-channel-meta { color:var(--text-secondary); font-size:.78rem; }
.voice-extra-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(320px,.85fr); gap:1rem; align-items:start; }
.voice-mini-list { display:grid; gap:.55rem; padding:.85rem; max-height:420px; overflow:auto; }
.voice-mini-row {
    display:grid;
    grid-template-columns:1fr auto;
    gap:.75rem;
    align-items:center;
    padding:.78rem .85rem;
    border:1px solid rgba(64,72,84,.55);
    border-radius:12px;
    background:rgba(15,20,25,.34);
}
.voice-mini-title { font-weight:800; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.voice-mini-meta { color:var(--text-secondary); font-size:.78rem; margin-top:.1rem; }
.voice-token-badge {
    display:inline-flex;
    align-items:center;
    justify-content:center;
    min-width:54px;
    padding:.28rem .55rem;
    border-radius:999px;
    background:rgba(81,207,102,.12);
    border:1px solid rgba(81,207,102,.35);
    color:var(--success);
    font-weight:900;
}
.voice-status {
    display:inline-flex; align-items:center; justify-content:center;
    padding:.18rem .48rem; border-radius:999px;
    font-size:.68rem; font-weight:900; text-transform:uppercase;
    border:1px solid rgba(160,174,192,.24);
    color:var(--text-secondary);
}
.voice-status.paid, .voice-status.paid_live { color:var(--success); border-color:rgba(81,207,102,.35); background:rgba(81,207,102,.1); }
.voice-status.pending { color:var(--warning); border-color:rgba(255,212,59,.32); background:rgba(255,212,59,.1); }
.voice-status.skipped, .voice-status.partial { color:var(--danger); border-color:rgba(255,107,107,.34); background:rgba(255,107,107,.1); }
.voice-heatmap { padding:.85rem; overflow:auto; }
.voice-heat-legend {
    display: flex;
    align-items: center;
    gap: 5px;
}
.voice-heat-legend-label {
    font-size: .72rem;
    font-weight: 700;
    color: var(--text-secondary);
}
.voice-heat-table { display:grid; grid-template-columns:44px repeat(24, minmax(26px,1fr)); gap:4px; min-width:820px; }
.voice-heat-label, .voice-heat-hour {
    color:var(--text-secondary);
    font-size:.68rem;
    font-weight:800;
    text-align:center;
}
.voice-heat-label { text-align:left; display:flex; align-items:center; }
.voice-heat-cell {
    height:26px;
    border-radius:6px;
    border:1px solid rgba(64,72,84,.42);
    background:rgba(64,72,84,.28);
}
.voice-heat-cell[data-level="1"] { background:rgba(102,126,234,.22); border-color:rgba(102,126,234,.25); }
.voice-heat-cell[data-level="2"] { background:rgba(102,126,234,.38); border-color:rgba(102,126,234,.38); }
.voice-heat-cell[data-level="3"] { background:rgba(81,207,102,.42); border-color:rgba(81,207,102,.4); }
.voice-heat-cell[data-level="4"] { background:rgba(81,207,102,.68); border-color:rgba(81,207,102,.55); }
.voice-empty {
    padding:2rem; text-align:center; color:var(--text-secondary);
    border:1px dashed rgba(64,72,84,.8); border-radius:14px; background:rgba(26,31,46,.45);
}
@media (max-width: 1120px) {
    .voice-grid { grid-template-columns:1fr; }
    .voice-extra-grid { grid-template-columns:1fr; }
    .voice-filters { grid-template-columns:1fr 1fr; }
    .voice-filters .voice-submit { grid-column:1 / -1; }
}
@media (max-width: 760px) {
    .voice-kpis { grid-template-columns:1fr 1fr; }
    .voice-filters { grid-template-columns:1fr; }
    .voice-user { grid-template-columns:auto 1fr; }
    .voice-time-badge { grid-column:2; text-align:left; }
}
</style>

<div class="voice-shell">
    <div class="voice-hero">
        <div class="voice-hero-row">
            <div class="voice-title">
                <?php if (!empty($selectedGuild['icon'])): ?>
                    <img class="voice-guild-icon" src="<?php echo esc($selectedGuild['icon']); ?>" alt="">
                <?php else: ?>
                    <div class="voice-guild-icon">VT</div>
                <?php endif; ?>
                <div>
                    <h1>Voice Time</h1>
                    <p><?php echo esc($selectedGuild['name'] ?? 'Select a server'); ?> · <?php echo esc($days); ?> day window</p>
                    <?php if (!isAdmin()): ?>
                        <p style="font-size:.78rem;">Available for server owners and configured dashboard admin roles.</p>
                    <?php endif; ?>
                </div>
            </div>
            <div class="voice-refresh">Last refresh: <?php echo date('d.m.Y H:i'); ?></div>
        </div>

        <form class="voice-filters" method="GET" id="voiceFilterForm">
            <label>
                Server
                <select name="guildId" data-autosubmit="change">
                    <?php foreach ($guilds as $g): ?>
                        <option value="<?php echo esc($g['id'] ?? ''); ?>" <?php echo ($guildId === ($g['id'] ?? '')) ? 'selected' : ''; ?>>
                            <?php echo esc($g['name'] ?? 'unknown'); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </label>
            <label>
                Days
                <input name="days" type="number" min="1" max="365" value="<?php echo esc($days); ?>" data-autosubmit="debounce">
            </label>
            <label>
                Limit
                <input name="limit" type="number" min="5" max="300" value="<?php echo esc($limit); ?>" data-autosubmit="debounce">
            </label>
            <label>
                User ID
                <input name="userId" placeholder="optional" value="<?php echo esc($userId); ?>" data-autosubmit="debounce">
            </label>
            <button class="btn-primary voice-submit" type="submit">Refresh</button>
        </form>
    </div>

    <?php if (!$guildId): ?>
        <div class="voice-empty">No guild selected.</div>
    <?php else: ?>
        <div class="voice-kpis">
            <div class="voice-kpi">
                <span>Total Voice</span>
                <strong><?php echo esc(msToPretty($totalMs)); ?></strong>
                <small>tracked in selected window</small>
            </div>
            <div class="voice-kpi">
                <span>Tracked Users</span>
                <strong><?php echo esc(count($users)); ?></strong>
                <small><?php echo esc($activeUsers); ?> currently active</small>
            </div>
            <div class="voice-kpi">
                <span>Sessions</span>
                <strong><?php echo esc($totalSessions); ?></strong>
                <small>joins, leaves and channel moves</small>
            </div>
            <div class="voice-kpi">
                <span>Top User</span>
                <strong><?php echo esc($topUser ? msToPretty($topUser['totalMs'] ?? 0) : '0m'); ?></strong>
                <small><?php echo esc($topUser['displayName'] ?? 'no data yet'); ?></small>
            </div>
        </div>

        <div class="voice-grid">
            <section class="voice-panel">
                <div class="voice-panel-head">
                    <div>
                        <h2>User leaderboard</h2>
                        <p>Sorted by total voice time.</p>
                    </div>
                    <span class="voice-refresh"><?php echo esc(count($users)); ?> users</span>
                </div>

                <?php if (empty($users)): ?>
                    <div class="voice-empty" style="margin:.85rem;">No voice data yet.</div>
                <?php else: ?>
                    <div class="voice-list">
                        <?php foreach ($users as $idx => $u): ?>
                            <?php
                                $uid = (string)($u['userId'] ?? '');
                                $active = !empty($u['activeSessions']);
                                $href = BASE_URL . '/pages/voice-time.php?guildId=' . urlencode($guildId) . '&days=' . urlencode((string)$days) . '&limit=' . urlencode((string)$limit) . '&userId=' . urlencode($uid);
                            ?>
                            <a class="voice-user <?php echo $active ? 'active' : ''; ?>" href="<?php echo esc($href); ?>">
                                <div class="voice-rank">#<?php echo esc($idx + 1); ?></div>
                                <div class="voice-user-main">
                                    <div class="voice-user-name">
                                        <span><?php echo esc($u['displayName'] ?? $uid); ?></span>
                                        <?php if ($active): ?><span class="voice-live">live</span><?php endif; ?>
                                    </div>
                                    <div class="voice-user-meta">
                                        <?php echo esc(compactId($uid)); ?> · <?php echo esc((int)($u['sessions'] ?? 0)); ?> sessions
                                    </div>
                                    <div class="voice-bar"><i style="width:<?php echo esc(pct($u['totalMs'] ?? 0, $maxMs)); ?>%"></i></div>
                                </div>
                                <div class="voice-time-badge"><?php echo esc(msToPretty($u['totalMs'] ?? 0)); ?></div>
                            </a>
                        <?php endforeach; ?>
                    </div>
                <?php endif; ?>
            </section>

            <aside class="voice-panel">
                <div class="voice-panel-head">
                    <div>
                        <h2><?php echo $detail ? 'Channel detail' : 'User detail'; ?></h2>
                        <p><?php echo $detail ? esc($detail['displayName'] ?? $detail['userId']) : 'Select a user from the list.'; ?></p>
                    </div>
                </div>

                <?php if (!$detail): ?>
                    <div class="voice-detail-empty">
                        Pick a user to see exactly which channels they spent time in.
                    </div>
                <?php else: ?>
                    <?php
                        $channels = $detail['channels'] ?? [];
                        $maxChannelMs = 1;
                        foreach ($channels as $c) $maxChannelMs = max($maxChannelMs, (int)($c['totalMs'] ?? 0));
                    ?>
                    <div class="voice-channel-list">
                        <?php foreach ($channels as $c): ?>
                            <?php $cActive = !empty($c['activeSessions']); ?>
                            <div class="voice-channel">
                                <div class="voice-channel-top">
                                    <div class="voice-channel-name"><?php echo esc($c['channelName'] ?? $c['channelId']); ?></div>
                                    <strong><?php echo esc(msToPretty($c['totalMs'] ?? 0)); ?></strong>
                                </div>
                                <div class="voice-channel-meta">
                                    <?php echo esc(compactId($c['channelId'] ?? '')); ?> · <?php echo esc((int)($c['sessions'] ?? 0)); ?> sessions
                                    <?php if ($cActive): ?> · live<?php endif; ?>
                                </div>
                                <div class="voice-bar"><i style="width:<?php echo esc(pct($c['totalMs'] ?? 0, $maxChannelMs)); ?>%"></i></div>
                            </div>
                        <?php endforeach; ?>
                        <?php if (empty($channels)): ?>
                            <div class="voice-empty">No channel data for this user.</div>
                        <?php endif; ?>
                    </div>
                <?php endif; ?>
            </aside>
        </div>

        <div class="voice-extra-grid">
            <section class="voice-panel">
                <div class="voice-panel-head">
                    <div>
                        <h2>Live voice board</h2>
                        <p>Who is currently connected and how long the session has been running.</p>
                    </div>
                    <span class="voice-refresh"><?php echo esc(count($liveSessions)); ?> live</span>
                </div>
                <?php if (empty($liveSessions)): ?>
                    <div class="voice-empty" style="margin:.85rem;">No active voice sessions right now.</div>
                <?php else: ?>
                    <div class="voice-mini-list">
                        <?php foreach ($liveSessions as $s): ?>
                            <?php
                                $paid = (int)($s['rewardTokens'] ?? 0);
                                $durationMs = (int)($s['durationMs'] ?? 0);
                            ?>
                            <div class="voice-mini-row">
                                <div>
                                    <div class="voice-mini-title"><?php echo esc($s['displayName'] ?? $s['userId']); ?></div>
                                    <div class="voice-mini-meta">
                                        <?php echo esc($s['channelName'] ?? $s['channelId']); ?> · <?php echo esc(msToPretty($durationMs)); ?> live
                                        <?php if (!empty($s['rewardError'])): ?> · <?php echo esc($s['rewardError']); ?><?php endif; ?>
                                    </div>
                                    <div class="voice-bar"><i style="width:<?php echo esc(pct($durationMs, max(600000, $durationMs))); ?>%"></i></div>
                                </div>
                                <div class="voice-token-badge">+<?php echo esc($paid); ?></div>
                            </div>
                        <?php endforeach; ?>
                    </div>
                <?php endif; ?>
            </section>

            <section class="voice-panel">
                <div class="voice-panel-head">
                    <div>
                        <h2>Reward audit</h2>
                        <p>Latest voice reward decisions for this server.</p>
                    </div>
                    <span class="voice-refresh"><?php echo esc(count($rewards)); ?> rows</span>
                </div>
                <?php if (empty($rewards)): ?>
                    <div class="voice-empty" style="margin:.85rem;">No reward rows yet.</div>
                <?php else: ?>
                    <div class="voice-mini-list">
                        <?php foreach ($rewards as $r): ?>
                            <div class="voice-mini-row">
                                <div>
                                    <div class="voice-mini-title"><?php echo esc($r['displayName'] ?? $r['userId']); ?></div>
                                    <div class="voice-mini-meta">
                                        <?php echo esc($r['channelName'] ?? $r['channelId']); ?> · <?php echo esc(msToPretty($r['durationMs'] ?? 0)); ?>
                                        <?php if (!empty($r['rewardError'])): ?> · <?php echo esc($r['rewardError']); ?><?php endif; ?>
                                    </div>
                                </div>
                                <div style="display:flex;align-items:center;gap:.45rem;justify-content:flex-end;">
                                    <span class="voice-status <?php echo esc($r['status'] ?? 'pending'); ?>"><?php echo esc($r['status'] ?? 'pending'); ?></span>
                                    <span class="voice-token-badge">+<?php echo esc((int)($r['rewardTokens'] ?? 0)); ?></span>
                                </div>
                            </div>
                        <?php endforeach; ?>
                    </div>
                <?php endif; ?>
            </section>
        </div>

        <section class="voice-panel">
            <div class="voice-panel-head">
                <div>
                    <h2>Voice heatmap</h2>
                    <p>Session start hour by weekday. Brighter cells mean more tracked voice time.</p>
                </div>
                <div style="display:flex;align-items:center;gap:12px;">
                    <div class="voice-heat-legend">
                        <span class="voice-heat-legend-label">Wenig</span>
                        <div class="voice-heat-cell" data-level="0" style="width:18px;height:18px;flex-shrink:0;"></div>
                        <div class="voice-heat-cell" data-level="1" style="width:18px;height:18px;flex-shrink:0;"></div>
                        <div class="voice-heat-cell" data-level="2" style="width:18px;height:18px;flex-shrink:0;"></div>
                        <div class="voice-heat-cell" data-level="3" style="width:18px;height:18px;flex-shrink:0;"></div>
                        <div class="voice-heat-cell" data-level="4" style="width:18px;height:18px;flex-shrink:0;"></div>
                        <span class="voice-heat-legend-label">Viel</span>
                    </div>
                    <span class="voice-refresh"><?php echo esc($days); ?> days</span>
                </div>
            </div>
            <div class="voice-heatmap">
                <div class="voice-heat-table">
                    <div></div>
                    <?php for ($h = 0; $h < 24; $h++): ?>
                        <div class="voice-heat-hour"><?php echo esc($h); ?></div>
                    <?php endfor; ?>
                    <?php foreach ($weekdayLabels as $weekday => $label): ?>
                        <div class="voice-heat-label"><?php echo esc($label); ?></div>
                        <?php for ($h = 0; $h < 24; $h++): ?>
                            <?php
                                $bucket = $heatByKey[$weekday . '-' . $h] ?? null;
                                $ms = (int)($bucket['totalMs'] ?? 0);
                                $level = $ms <= 0 ? 0 : max(1, min(4, (int)ceil(($ms / max(1, $heatMax)) * 4)));
                                $title = $label . ' ' . str_pad((string)$h, 2, '0', STR_PAD_LEFT) . ':00 · ' . msToPretty($ms) . ' · ' . (int)($bucket['sessions'] ?? 0) . ' sessions';
                            ?>
                            <div class="voice-heat-cell" data-level="<?php echo esc($level); ?>" title="<?php echo esc($title); ?>"></div>
                        <?php endfor; ?>
                    <?php endforeach; ?>
                </div>
            </div>
        </section>
    <?php endif; ?>
</div>

<script>
(function() {
    const form = document.getElementById('voiceFilterForm');
    if (!form) return;

    const submitBtn = form.querySelector('.voice-submit');
    let timer = null;

    function submitSoon(delay) {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
            form.classList.add('is-loading');
            if (submitBtn) submitBtn.classList.add('is-loading');
            form.requestSubmit ? form.requestSubmit() : form.submit();
        }, delay);
    }

    form.querySelectorAll('[data-autosubmit="change"]').forEach((el) => {
        el.addEventListener('change', () => submitSoon(0));
    });

    form.querySelectorAll('[data-autosubmit="debounce"]').forEach((el) => {
        el.addEventListener('input', () => submitSoon(650));
        el.addEventListener('change', () => submitSoon(120));
    });
})();
</script>

<?php include '../includes/footer.php'; ?>
