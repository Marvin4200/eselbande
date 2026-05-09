<?php
$stylePath = __DIR__ . '/../assets/css/style.css';
$styleVersion = file_exists($stylePath) ? filemtime($stylePath) : time();
?>
<!DOCTYPE html>
<html lang="<?= esc(dashboardLang()) ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo isset($page_title) ? esc($page_title) : 'Dashboard'; ?> - Fahrstuhl</title>
    <link rel="stylesheet" href="<?= BASE_URL ?>/assets/css/style.css?v=<?= $styleVersion ?>">
</head>
<body class="app">
    <?php
    $selectedGuildIdForBell = trim((string)($_SESSION['selected_guild_id'] ?? ''));
    $activityBellStreamAuth = dashboardActivityStreamAuth($selectedGuildIdForBell, 1800);
    // Sticky upgrade banner — shown when a guild context is active and tier is free
    $_headerGuildId  = isset($guildId)  ? (string)$guildId  : $selectedGuildIdForBell;
    $_headerGuildTier = isset($guildTier) ? (string)$guildTier : 'free';
    $_showUpgradeBanner = $_headerGuildId !== '' && $_headerGuildTier === 'free';
    ?>
    <?php if ($_showUpgradeBanner): ?>
    <div class="sticky-upgrade-bar" id="stickyUpgradeBar">
        <div>
            <strong>🚀 <?= t('upgrade.title') ?></strong>
            <span class="sub-text"> <?= t('upgrade.sub') ?></span>
        </div>
        <div style="display:flex;align-items:center;gap:.6rem;">
            <a href="<?= BASE_URL ?>/pages/server-plans.php" class="sub-cta"><?= t('upgrade.cta') ?></a>
            <button type="button" class="sub-dismiss" id="stickyUpgradeDismiss" title="<?= t('upgrade.close') ?>">✕</button>
        </div>
    </div>
    <script>
    (function(){
        var bar = document.getElementById('stickyUpgradeBar');
        var btn = document.getElementById('stickyUpgradeDismiss');
        try { if (localStorage.getItem('fh:upgradeBannerDismissed') === '1') bar.style.display = 'none'; } catch(e){}
        if (btn) btn.addEventListener('click', function(){
            bar.style.display = 'none';
            try { localStorage.setItem('fh:upgradeBannerDismissed', '1'); } catch(e){}
        });
    })();
    </script>
    <?php endif; ?>
    <a href="#main-content" class="skip-to-content">Zum Hauptinhalt springen</a>
    <nav class="navbar">
        <div class="brand">
            <button type="button" class="sidebar-toggle" id="sidebarToggle" aria-label="Navigation öffnen" aria-expanded="false" aria-controls="dashboardSidebar">&#9776;</button>
            <a href="<?= BASE_URL ?>/index.php" class="brand-link">
                    <span class="brand-mark">E</span>
                    <span class="brand-copy">
                        <strong>Fahrstuhl</strong>
                        <small>Server Dashboard</small>
                    </span>
            </a>
        </div>
        <div class="user-info">
            <span class="nav-status"><span></span> <?= t('nav.online') ?></span>
            <div class="notif-wrap" id="notifWrap" data-guild-id="<?= esc($selectedGuildIdForBell) ?>">
                <button type="button" class="notif-btn" id="notifBtn" aria-haspopup="true" aria-expanded="false" title="<?= t('nav.notifications') ?>">
                    <span class="notif-icon">🔔</span>
                    <span class="notif-badge" id="notifBadge" hidden>0</span>
                </button>
                <div class="notif-dropdown" id="notifDropdown" hidden>
                    <div class="notif-head">
                        <strong><?= t('nav.notifications') ?></strong>
                        <span class="notif-live-hint" id="notifLiveHint" hidden>Live</span>
                        <button type="button" class="notif-mark-read" id="notifMarkRead"><?= t('nav.mark_read') ?></button>
                    </div>
                    <div class="notif-filter-tabs" id="notifFilterTabs" role="tablist" aria-label="Typ-Filter">
                        <button class="notif-tab is-active" data-filter="all" role="tab" aria-selected="true">Alle</button>
                        <button class="notif-tab" data-filter="moderation" role="tab" aria-selected="false">Mod</button>
                        <button class="notif-tab" data-filter="automod" role="tab" aria-selected="false">AutoMod</button>
                        <button class="notif-tab" data-filter="tickets" role="tab" aria-selected="false">Tickets</button>
                        <button class="notif-tab" data-filter="leveling" role="tab" aria-selected="false">XP</button>
                        <button class="notif-tab" data-filter="voice" role="tab" aria-selected="false">Voice</button>
                    </div>
                    <div class="notif-list" id="notifList">
                        <div class="notif-empty">Keine neuen Aktivitäten</div>
                    </div>
                    <div class="notif-foot">
                        <span class="notif-count" id="notifCount"></span>
                        <a href="<?= esc(dashboardPageUrl('activity')) ?>" class="notif-all-link"><?= t('nav.show_all') ?></a>
                    </div>
                </div>
            </div>
            <?php $u = getUser();
            if ($u && $u['avatar']): ?>
                <img src="https://cdn.discordapp.com/avatars/<?= esc($u['id']) ?>/<?= esc($u['avatar']) ?>.png?size=64" class="nav-avatar" alt="Avatar">
            <?php endif; ?>
            <span class="nav-user"><?php echo $u ? esc($u['username']) : 'Guest'; ?></span>
            <?php if (isOwner()): ?>
                <?php if (isAdmin()): ?>
                    <a href="<?= BASE_URL ?>/pages/portal.php?view_mode=user" class="btn-view-mode">Normal View</a>
                <?php else: ?>
                    <a href="<?= BASE_URL ?>/pages/cockpit.php?view_mode=admin" class="btn-view-mode">Admin Mode</a>
                <?php endif; ?>
            <?php endif; ?>
            <a href="?setlang=<?= esc(t('nav.lang_next')) ?>" class="btn-lang" title="<?= esc(t('nav.lang_title')) ?>"><?= t('nav.lang_label') ?></a>
            <a href="<?= BASE_URL ?>/?logout=1" class="btn-logout"><?= t('nav.logout') ?></a>
        </div>
    </nav>
    <script>
    (function () {
        const fhLang = {
            noActivity:  <?= json_encode(t('nav.no_activity')) ?>,
            noFilter:    <?= json_encode(t('nav.no_filter')) ?>,
            justNow:     <?= json_encode(t('time.just_now')) ?>,
            agoPrefix:   <?= json_encode(t('time.ago_prefix')) ?>,
            secSuffix:   <?= json_encode(t('time.sec_suffix')) ?>,
            minSuffix:   <?= json_encode(t('time.min_suffix')) ?>,
            hourSuffix:  <?= json_encode(t('time.hour_suffix')) ?>,
            daySuffix:   <?= json_encode(t('time.day_suffix')) ?>,
            unread:      <?= json_encode(t('notif.unread')) ?>,
            total:       <?= json_encode(t('notif.total')) ?>,
        };
        const wrap = document.getElementById('notifWrap');
        if (!wrap) return;

        const guildId = String(wrap.dataset.guildId || '').trim();
        const bell = document.getElementById('notifBtn');
        const badge = document.getElementById('notifBadge');
        const dropdown = document.getElementById('notifDropdown');
        const list = document.getElementById('notifList');
        const markRead = document.getElementById('notifMarkRead');
        const liveHint = document.getElementById('notifLiveHint');
        const storageKey = guildId ? `fh:lastSeenAt:${guildId}` : 'fh:lastSeenAt:global';
        const baseUrl = <?= json_encode(BASE_URL) ?>;
        const streamAuth = {
            viewerId: <?= json_encode($activityBellStreamAuth['viewerId'] ?? '') ?>,
            dashboardMode: <?= json_encode($activityBellStreamAuth['dashboardMode'] ?? 'admin') ?>,
            expiresAt: <?= (int)($activityBellStreamAuth['expiresAt'] ?? 0) ?>,
            signature: <?= json_encode($activityBellStreamAuth['signature'] ?? '') ?>,
        };

        const TYPE_META = {
            moderation:  { icon: '🛡️', label: 'Moderation', page: 'moderation-hub' },
            automod:     { icon: '🚨', label: 'AutoMod',    page: 'automod'        },
            tickets:     { icon: '🎫', label: 'Tickets',    page: 'tickets'        },
            leveling:    { icon: '📈', label: 'Leveling',   page: 'leveling'       },
            voice:       { icon: '🎙️', label: 'Voice',      page: 'activity'       },
            welcome:     { icon: '👋', label: 'Welcome',    page: 'welcome'        },
            reaction:    { icon: '🎭', label: 'Roles',      page: 'reaction-roles' },
            logging:     { icon: '🧾', label: 'Logging',    page: 'logging'        },
        };

        let activeFilter = 'all';

        let events = [];
        let stream = null;
        let pollTimer = null;
        const streamBaseUrl = '';

        function toSeverity(value) {
            const raw = String(value || '').toLowerCase();
            if (raw === 'critical' || raw === 'danger') return 'critical';
            if (raw === 'warning' || raw === 'warn') return 'warning';
            return 'info';
        }

        function severityFromEvent(item) {
            const explicit = toSeverity(item?.severity);
            if (explicit !== 'info') return explicit;
            const type = String(item?.type || '').toLowerCase();
            const action = String(item?.action || '').toLowerCase();
            if (type === 'moderation' && (action === 'ban' || action === 'kick')) return 'critical';
            if (type === 'automod' || action === 'timeout' || action === 'role_remove') return 'warning';
            return 'info';
        }

        function toggleLiveHint(show) {
            if (!liveHint) return;
            if (!show) {
                liveHint.hidden = true;
                liveHint.classList.remove('is-active');
                return;
            }
            liveHint.hidden = false;
            liveHint.classList.remove('is-active');
            void liveHint.offsetWidth;
            liveHint.classList.add('is-active');
        }

        function getLastSeenAt() {
            try {
                return Number(localStorage.getItem(storageKey) || 0);
            } catch {
                return Number(sessionStorage.getItem(storageKey) || 0);
            }
        }

        function setLastSeenAt(ts) {
            const value = String(Number(ts || Date.now()));
            try {
                localStorage.setItem(storageKey, value);
            } catch {
                try { sessionStorage.setItem(storageKey, value); } catch {}
            }
        }

        function eventTs(item) {
            const parsed = Date.parse(item?.createdAt || '');
            return Number.isFinite(parsed) ? parsed : 0;
        }

        function relativeTime(iso) {
            const ts = Date.parse(iso || '');
            if (!Number.isFinite(ts)) return fhLang.justNow;
            const delta = Math.max(0, Math.floor((Date.now() - ts) / 1000));
            if (delta < 60) return fhLang.agoPrefix + Math.max(1, delta) + fhLang.secSuffix;
            if (delta < 3600) return fhLang.agoPrefix + Math.floor(delta / 60) + fhLang.minSuffix;
            if (delta < 86400) return fhLang.agoPrefix + Math.floor(delta / 3600) + fhLang.hourSuffix;
            return fhLang.agoPrefix + Math.floor(delta / 86400) + fhLang.daySuffix;
        }

        function escapeHtml(input) {
            return String(input || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        function pageUrlFor(type) {
            const meta = TYPE_META[String(type || '').toLowerCase()];
            const page = meta?.page || 'activity';
            return `${baseUrl}/pages/${page}.php${guildId ? '?guildId=' + encodeURIComponent(guildId) : ''}`;
        }

        function render() {
            const lastSeenAt = getLastSeenAt();
            const allUnread = events.filter((item) => eventTs(item) > lastSeenAt);
            const unreadCount = allUnread.length;
            const highestSeverity = allUnread.reduce((highest, item) => {
                const rank = { info: 0, warning: 1, critical: 2 };
                const next = severityFromEvent(item);
                return rank[next] > rank[highest] ? next : highest;
            }, 'info');

            badge.textContent = String(Math.min(unreadCount, 99));
            badge.hidden = unreadCount <= 0;
            badge.classList.remove('is-info', 'is-warning', 'is-critical', 'is-pop');
            if (unreadCount > 0) badge.classList.add(`is-${highestSeverity}`);

            // apply active filter
            const filtered = activeFilter === 'all'
                ? events
                : events.filter((item) => String(item?.type || '').toLowerCase() === activeFilter);

            // update count label
            const countEl = document.getElementById('notifCount');
            if (countEl) {
                const total = filtered.length;
                const unreadFiltered = filtered.filter((item) => eventTs(item) > lastSeenAt).length;
                countEl.textContent = total ? `${unreadFiltered} ${fhLang.unread}${total} ${fhLang.total}` : '';
            }

            // update tab unread dots
            document.querySelectorAll('.notif-tab[data-filter]').forEach((tab) => {
                const f = tab.dataset.filter;
                const tabEvents = f === 'all' ? events : events.filter((item) => String(item?.type || '') === f);
                const tabUnread = tabEvents.filter((item) => eventTs(item) > lastSeenAt).length;
                tab.dataset.unread = tabUnread > 0 ? String(Math.min(tabUnread, 9)) : '';
            });

            if (!filtered.length) {
                list.innerHTML = activeFilter === 'all'
                    ? `<div class="notif-empty">${fhLang.noActivity}</div>`
                    : `<div class="notif-empty">${fhLang.noFilter}</div>`;
                return;
            }

            list.innerHTML = filtered.slice(0, 15).map((item) => {
                const type = String(item?.type || '').toLowerCase();
                const meta = TYPE_META[type] || { icon: '✨', label: type || 'Event', page: 'activity' };
                const desc = String(item?.description || 'Neues Event').slice(0, 110);
                const isUnread = eventTs(item) > lastSeenAt;
                const severity = severityFromEvent(item);
                const href = pageUrlFor(type);
                const actor = item?.actorName || item?.userName || '';
                return `
                    <a href="${escapeHtml(href)}" class="notif-item notif-severity-${severity}${isUnread ? ' is-unread' : ''}" tabindex="0">
                        <span class="notif-item-icon">${meta.icon}</span>
                        <div class="notif-item-copy">
                            <span class="notif-item-type">${escapeHtml(meta.label)}</span>
                            <p>${escapeHtml(desc)}</p>
                            <div class="notif-item-meta">
                                ${actor ? `<span>${escapeHtml(actor)}</span>` : ''}
                                <time datetime="${escapeHtml(item?.createdAt || '')}">${escapeHtml(relativeTime(item?.createdAt || ''))}</time>
                            </div>
                        </div>
                        ${isUnread ? '<span class="notif-unread-dot" aria-label="Ungelesen"></span>' : ''}
                    </a>
                `;
            }).join('');
        }

        function upsertEvent(item) {
            if (!item || !item.type) return;
            const id = String(item.id || '').trim();
            if (id) {
                const exists = events.some((row) => String(row.id || '') === id);
                if (exists) return;
            }
            events.unshift(item);
            if (events.length > 50) events = events.slice(0, 50);
            if (dropdown.hidden) {
                toggleLiveHint(true);
                badge.classList.remove('is-pop');
                void badge.offsetWidth;
                badge.classList.add('is-pop');
            }
            render();
        }

        async function fetchRecent() {
            if (!guildId) return;
            const url = `${baseUrl}/pages/activity.php?ajax=1&guildId=${encodeURIComponent(guildId)}&type=all&limit=10&offset=0`;
            const response = await fetch(url, {
                headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                credentials: 'same-origin'
            });
            const payload = await response.json();
            if (!response.ok || !payload?.success) return;
            const items = Array.isArray(payload?.items) ? payload.items : [];
            events = items.slice(0, 50);
            render();
        }

        function startPollingFallback() {
            if (pollTimer) return;
            pollTimer = setInterval(() => {
                fetchRecent().catch(() => {});
            }, 20000);
        }

        function setupStream() {
            if (!guildId || typeof EventSource === 'undefined') {
                startPollingFallback();
                return;
            }
            if (!streamAuth.viewerId || !streamAuth.signature || !streamAuth.expiresAt) {
                startPollingFallback();
                return;
            }
            if (!streamBaseUrl) {
                startPollingFallback();
                return;
            }

            const streamUrl = `${streamBaseUrl}/guilds/${encodeURIComponent(guildId)}/activity/stream?dashboardUserId=${encodeURIComponent(streamAuth.viewerId)}&dashboardMode=${encodeURIComponent(streamAuth.dashboardMode)}&expiresAt=${encodeURIComponent(String(streamAuth.expiresAt))}&streamSig=${encodeURIComponent(streamAuth.signature)}`;
            const es = new EventSource(streamUrl);
            stream = es;

            es.addEventListener('activity', (event) => {
                try {
                    const payload = JSON.parse(event.data || '{}');
                    if (payload?.type !== 'activity') return;
                    upsertEvent(payload.item || null);
                } catch {}
            });

            es.onerror = function () {
                if (stream) {
                    stream.close();
                    stream = null;
                }
                startPollingFallback();
            };

            window.addEventListener('beforeunload', () => {
                if (stream) stream.close();
                if (pollTimer) clearInterval(pollTimer);
            });
        }

        bell.addEventListener('click', () => {
            const open = !dropdown.hidden;
            dropdown.hidden = open;
            bell.setAttribute('aria-expanded', open ? 'false' : 'true');
            if (!open) {
                const newestTs = Math.max(0, ...events.map((item) => eventTs(item)));
                if (newestTs > 0) setLastSeenAt(newestTs);
                toggleLiveHint(false);
                render();
            }
        });

        markRead.addEventListener('click', () => {
            setLastSeenAt(Date.now());
            toggleLiveHint(false);
            render();
        });

        document.getElementById('notifFilterTabs')?.addEventListener('click', (e) => {
            const tab = e.target.closest('.notif-tab[data-filter]');
            if (!tab) return;
            activeFilter = tab.dataset.filter;
            document.querySelectorAll('.notif-tab').forEach((t) => {
                t.classList.toggle('is-active', t === tab);
                t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
            });
            render();
        });

        document.addEventListener('click', (event) => {
            if (dropdown.hidden) return;
            if (wrap.contains(event.target)) return;
            dropdown.hidden = true;
            bell.setAttribute('aria-expanded', 'false');
            toggleLiveHint(false);
        });

        fetchRecent().catch(() => {});
        setupStream();
    })();
    </script>
    <div class="sidebar-overlay" id="sidebarOverlay"></div>
    <script>
    (function () {
        var toggle = document.getElementById('sidebarToggle');
        var overlay = document.getElementById('sidebarOverlay');
        var sidebar = document.getElementById('dashboardSidebar');
        if (!toggle || !sidebar) return;
        function openSidebar() {
            sidebar.classList.add('is-open');
            if (overlay) overlay.classList.add('active');
            toggle.setAttribute('aria-expanded', 'true');
        }
        function closeSidebar() {
            sidebar.classList.remove('is-open');
            if (overlay) overlay.classList.remove('active');
            toggle.setAttribute('aria-expanded', 'false');
        }
        toggle.addEventListener('click', function () {
            sidebar.classList.contains('is-open') ? closeSidebar() : openSidebar();
        });
        if (overlay) overlay.addEventListener('click', closeSidebar);
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && sidebar.classList.contains('is-open')) closeSidebar();
        });
    })();
    </script>
    <div class="layout">
