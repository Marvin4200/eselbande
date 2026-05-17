<?php
$p = currentPage();

if (!function_exists('sidebar_item_active')) {
    function sidebar_item_active($item, $current) {
        $pages = array_merge([$item['page']], $item['aliases'] ?? []);
        return in_array($current, $pages, true);
    }

    function sidebar_nav_row($item, $current) {
        $page = $item['page'];
        $icon = $item['icon'];
        $label = $item['label'];
        $description = $item['description'] ?? '';
        $serverScopedPages = [
          'portal', 'guilds', 'guild-detail', 'serverconfig', 'modules', 'command-center', 'setup',
            'welcome', 'reaction-roles', 'tickets', 'logging', 'temp-voice', 'social', 'leveling',
            'moderation', 'moderation-hub', 'automod', 'voice-time', 'server-backup', 'freegames',
        ];
        $href = $item['href'] ?? (in_array($page, $serverScopedPages, true)
            ? dashboardPageUrl($page)
            : BASE_URL . '/pages/' . esc($page) . '.php');
        $isActive = sidebar_item_active($item, $current);
        $active = $isActive ? ' active' : '';
        $activeRow = $isActive ? ' is-active' : '';
        $ariaCurrent = $isActive ? ' aria-current="page"' : '';

        $meta = strtolower(trim($label . ' ' . $description . ' ' . $page . ' ' . implode(' ', $item['aliases'] ?? [])));

        echo '<li class="nav-row' . $activeRow . '" data-page="' . esc($page) . '" data-label="' . esc($label) . '" data-href="' . esc($href) . '" data-meta="' . esc($meta) . '">';
        echo '<a href="' . $href . '" class="link' . $active . '"' . $ariaCurrent . '>';
        echo '<span class="nav-icon">' . esc($icon) . '</span>';
        echo '<span class="nav-copy">';
        echo '<span class="nav-label">' . esc($label) . '</span>';
        echo '</span>';
        echo '</a>';
        echo '</li>';
    }

    function sidebar_nav_list($items, $current) {
        echo '<ul class="menu">';
        foreach ($items as $item) sidebar_nav_row($item, $current);
        echo '</ul>';
    }

    function sidebar_group_has_active($items, $current) {
        foreach ($items as $item) {
            if (sidebar_item_active($item, $current)) {
                return true;
            }
        }

        return false;
    }

    function sidebar_render_groups($groups, $current) {
        foreach ($groups as $group) {
            $title = $group['title'];
            $description = $group['description'] ?? '';
            $items = $group['items'];
            $isActive = sidebar_group_has_active($items, $current);
            $open = !array_key_exists('open', $group) || !empty($group['open']) || $isActive;

            echo '<details class="nav-group nav-workspace' . ($isActive ? ' is-active' : '') . '"' . ($open ? ' open' : '') . '>';
            echo '<summary>';
            echo '<span class="nav-group-copy">';
            echo '<span class="nav-group-title">' . esc($title) . '</span>';
            if ($description !== '') {
                echo '<span class="nav-group-description sr-only">' . esc($description) . '</span>';
            }
            echo '</span>';
            echo '</summary>';
            sidebar_nav_list($items, $current);
            echo '</details>';
        }
    }
}

$adminGroups = [
    [
      'title' => 'Übersicht',
      'description' => 'Admin entry points',
      'items' => [
        ['page' => 'cockpit', 'icon' => '🎛️', 'label' => 'Cockpit', 'description' => 'Live-Status und Alerts'],
        ['page' => 'status', 'icon' => '🟢', 'label' => 'Live Status', 'description' => 'Service Health'],
        ['page' => 'analytics', 'icon' => '📊', 'label' => 'Analytics', 'description' => 'Plattform-Metriken'],
        ['page' => 'activity', 'icon' => '⚡', 'label' => 'Activity', 'description' => 'Aktuelle Events'],
      ],
    ],
    [
      'title' => 'Betrieb',
      'description' => 'Infrastructure and operations',
      'items' => [
        ['page' => 'operations', 'icon' => '🛠️', 'label' => 'Operations', 'description' => 'Deployments und Jobs', 'aliases' => ['deploys', 'webhooks', 'flags', 'ueberwachung', 'ops-health']],
        ['page' => 'backups', 'icon' => '🗄️', 'label' => 'Backups', 'description' => 'Datensicherung'],
        ['page' => 'server-backup', 'icon' => '💾', 'label' => 'Server Backup', 'description' => 'Guild Backups und Restore'],
        ['page' => 'security', 'icon' => '🔐', 'label' => 'Security', 'description' => 'Sicherheitschecks'],
      ],
    ],
    [
      'title' => 'Server & Mitglieder',
      'description' => 'Guild and member management',
      'items' => [
        ['page' => 'guilds', 'icon' => '🏰', 'label' => 'Server', 'description' => 'Alle Guilds', 'aliases' => ['guild-detail']],
        ['page' => 'members-hub', 'icon' => '👥', 'label' => 'Mitglieder', 'description' => 'Profile und Stats', 'aliases' => ['users', 'user-detail', 'voice-time']],
      ],
    ],
    [
      'title' => 'Moderation',
      'description' => 'Moderation and policy tools',
      'items' => [
        ['page' => 'moderation-hub', 'icon' => '🛡️', 'label' => 'Moderation', 'description' => 'Cases und Aktionen', 'aliases' => ['moderation']],
        ['page' => 'automod', 'icon' => '🚨', 'label' => 'AutoMod', 'description' => 'Filter und Schutz'],
        ['page' => 'logging', 'icon' => '🧾', 'label' => 'Logging', 'description' => 'Audit Feeds'],
        ['page' => 'blacklist', 'icon' => '🚫', 'label' => 'Blacklist', 'description' => 'Gesperrte User'],
        ['page' => 'audit', 'icon' => '📄', 'label' => 'Audit Log', 'description' => 'Admin-Aktionen'],
      ],
    ],
    [
      'title' => 'Tickets',
      'description' => 'Support workflows',
      'items' => [
        ['page' => 'tickets', 'icon' => '🎫', 'label' => 'Tickets', 'description' => 'Panels und Workflows'],
      ],
    ],
    [
      'title' => 'EselMusic',
      'description' => 'Music bot monitoring',
      'items' => [
        ['page' => 'eselmusic', 'icon' => '🎵', 'label' => 'EselMusic', 'description' => 'Musikbot Status & Guilds', 'href' => BASE_URL . '/eselmusic'],
      ],
    ],
    [
      'title' => 'Monetization / Premium',
      'description' => 'Plans, billing and rewards',
      'items' => [
        ['page' => 'guild-premium', 'icon' => '👑', 'label' => 'Server-Plan vergeben', 'description' => 'Premium aktivieren'],
        ['page' => 'premium-hub', 'icon' => '💎', 'label' => 'Premium Hub', 'description' => 'Übersicht und Billing'],
        ['page' => 'monetization', 'icon' => '💰', 'label' => 'Monetization', 'description' => 'Revenue und Promos'],
        ['page' => 'monetization-health', 'icon' => '🩺', 'label' => 'Monetization Health', 'description' => 'Read-only Health und Warnungen'],
        ['page' => 'rewards-hub', 'icon' => '🎁', 'label' => 'Rewards', 'description' => 'Votes, Shields und Rewards'],
      ],
    ],
    [
      'title' => 'Tools / Fun',
      'description' => 'Utilities and fun controls',
      'items' => [
        ['page' => 'tools', 'icon' => '🧰', 'label' => 'Tools', 'description' => 'Utilities'],
        ['page' => 'fun-hub', 'icon' => '🎭', 'label' => 'Fun Hub', 'description' => 'Fun-Tools und Troll-Befehle', 'aliases' => ['voicetroll']],
        ['page' => 'commands', 'icon' => '⌨️', 'label' => 'Commands', 'description' => 'Slash Commands'],
        ['page' => 'botinfo', 'icon' => '🤖', 'label' => 'Bot Info', 'description' => 'Fähigkeiten'],
      ],
    ],
    [
      'title' => 'System',
      'description' => 'System logs and console',
      'items' => [
        ['page' => 'logs', 'icon' => '📋', 'label' => 'Logs', 'description' => 'App-Logs'],
        ['page' => 'console', 'icon' => '💻', 'label' => 'Console', 'description' => 'Admin-Konsole'],
      ],
    ],
  ];

$userGroups = [
    [
      'title' => 'Overview',
      'description' => 'Entry points and setup',
      'items' => [
        ['page' => 'portal', 'icon' => '🏠', 'label' => 'Portal', 'description' => 'Server start page', 'aliases' => ['guild-detail']],
        ['page' => 'setup', 'icon' => '🚀', 'label' => 'Setup Assistant', 'description' => 'Guided first-time setup wizard'],
        ['page' => 'command-center', 'icon' => '⌨️', 'label' => 'Command Center', 'description' => 'Live feed and quick actions'],
        ['page' => 'serverconfig', 'icon' => '⚙️', 'label' => 'Server Config', 'description' => 'Roles, access and health'],
        ['page' => 'modules', 'icon' => '🧩', 'label' => 'Modules', 'description' => 'Enable and open features'],
      ],
    ],
    [
      'title' => 'Community',
      'description' => 'Member experience and engagement',
      'items' => [
        ['page' => 'welcome', 'icon' => '👋', 'label' => 'Welcome', 'description' => 'Greetings and verification'],
        ['page' => 'leveling', 'icon' => '📈', 'label' => 'Leveling', 'description' => 'XP and rewards'],
        ['page' => 'reaction-roles', 'icon' => '🎭', 'label' => 'Reaction Roles', 'description' => 'Self-assign roles'],
        ['page' => 'social', 'icon' => '📣', 'label' => 'Social Alerts', 'description' => 'YouTube, Twitch and RSS'],
        ['page' => 'freegames', 'icon' => '🎮', 'label' => 'Free Games', 'description' => 'Kostenlose Spiele-Benachrichtigungen'],
        ['page' => 'temp-voice', 'icon' => '🔊', 'label' => 'Temp Voice', 'description' => 'Dynamic voice channels'],
      ],
    ],
    [
      'title' => 'Moderation',
      'description' => 'Safety, logs and cases',
      'items' => [
        ['page' => 'moderation-hub', 'icon' => '🛡️', 'label' => 'Moderation', 'description' => 'Cases and actions', 'aliases' => ['moderation']],
        ['page' => 'automod', 'icon' => '🚨', 'label' => 'AutoMod', 'description' => 'Filters and protection'],
        ['page' => 'logging', 'icon' => '🧾', 'label' => 'Logging', 'description' => 'Audit feeds'],
      ],
    ],
    [
      'title' => 'Support',
      'description' => 'Support workflows',
      'items' => [
        ['page' => 'tickets', 'icon' => '🎫', 'label' => 'Tickets', 'description' => 'Panels and workflows'],
      ],
    ],
    [
      'title' => 'Tools',
      'description' => 'Operations and monitoring',
      'items' => [
        ['page' => 'activity', 'icon' => '⚡', 'label' => 'Activity', 'description' => 'Recent server events'],
        ['page' => 'stats', 'icon' => '📊', 'label' => 'Server Stats', 'description' => 'Analytics and health'],
      ],
    ],
    [
      'title' => 'Premium / Product',
      'description' => 'Plans and profile tools',
      'items' => [
        ['page' => 'server-plans', 'icon' => '🗂️', 'label' => 'Server Plans', 'description' => 'Limits and tiers'],
        ['page' => 'botinfo', 'icon' => '🤖', 'label' => 'Bot Info', 'description' => 'Capabilities and support'],
        ['page' => 'premium-info', 'icon' => '💎', 'label' => 'Premium', 'description' => 'User benefits'],
        ['page' => 'redeem', 'icon' => '🎟️', 'label' => 'Redeem Code', 'description' => 'Activate purchases'],
      ],
    ],
  ];

$legalItems = [
    ['page' => 'privacy', 'icon' => '🔒', 'label' => 'Privacy Policy'],
    ['page' => 'terms', 'icon' => '📜', 'label' => 'Terms of Service'],
];
?>
<aside class="sidebar" id="dashboardSidebar" aria-label="Dashboard navigation">
    <nav class="sidebar-nav">
        <div class="sidebar-search">
          <input id="sidebarSearch" type="search" placeholder="<?= t('sidebar.search') ?>" autocomplete="off" />
        </div>

        <section id="sidebarPinned" class="sidebar-section sidebar-pinned" hidden>
            <p class="sidebar-section-title"><?= t('sidebar.pinned') ?></p>
            <ul class="menu" id="pinnedList"></ul>
        </section>

        <section class="sidebar-section">
            <p class="sidebar-section-title"><?php echo isAdmin() ? t('sidebar.nav_admin') : t('sidebar.nav_user'); ?></p>
            <?php sidebar_render_groups(isAdmin() ? $adminGroups : $userGroups, $p); ?>
        </section>

        <details class="nav-group nav-advanced">
            <summary><?= t('sidebar.legal') ?></summary>
            <?php sidebar_nav_list($legalItems, $p); ?>
        </details>
    </nav>
</aside>
<main class="content" id="main-content">

<script>
(function() {
  const storageKey = 'fh_dashboard_pins_v1';
  const maxPins = 4;
  const search = document.getElementById('sidebarSearch');
  const pinnedSection = document.getElementById('sidebarPinned');
  const pinnedList = document.getElementById('pinnedList');
  const rows = Array.from(document.querySelectorAll('.sidebar .nav-row'));

  function loadPins() {
    try {
      const raw = localStorage.getItem(storageKey);
      const pins = raw ? JSON.parse(raw) : [];
      return Array.isArray(pins) ? pins.slice(0, maxPins) : [];
    } catch {
      return [];
    }
  }

  function savePins(pins) {
    try { localStorage.setItem(storageKey, JSON.stringify(pins.slice(0, maxPins))); } catch {}
  }

  function setRowPinnedState(page, pinned) {
    for (const r of rows) {
      if (r.dataset.page === page) {
        const btn = r.querySelector('.pin-btn');
        if (btn) btn.textContent = pinned ? '★' : '☆';
        r.dataset.pinned = pinned ? '1' : '0';
      }
    }
  }

  function renderPinned() {
    const pins = loadPins();
    pinnedList.innerHTML = '';

    if (!pins.length) {
      pinnedSection.hidden = true;
    } else {
      pinnedSection.hidden = false;
    }

    const byPage = new Map();
    for (const r of rows) byPage.set(r.dataset.page, r);

    for (const page of pins) {
      const r = byPage.get(page);
      if (!r) continue;
      const li = document.createElement('li');
      li.className = 'nav-row pinned-row';
      li.dataset.page = page;
      li.dataset.label = r.dataset.label || '';
      li.dataset.href = r.dataset.href || '';
      li.dataset.meta = r.dataset.meta || '';

      const a = document.createElement('a');
      a.className = 'link';
      a.href = r.dataset.href || '#';
      a.innerHTML = r.querySelector('a.link') ? r.querySelector('a.link').innerHTML : (r.dataset.label || page);

      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pin-btn';
      b.title = 'Unpin';
      b.setAttribute('aria-label', 'Unpin');
      b.textContent = '★';
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        togglePin(page);
      });

      li.appendChild(a);
      li.appendChild(b);
      pinnedList.appendChild(li);
    }

    for (const r of rows) setRowPinnedState(r.dataset.page, pins.includes(r.dataset.page));
    applyFilter();
  }

  function togglePin(page) {
    const pins = loadPins();
    const idx = pins.indexOf(page);
    if (idx >= 0) pins.splice(idx, 1);
    else {
      if (pins.length >= maxPins) pins.pop();
      pins.unshift(page);
    }
    savePins(pins);
    renderPinned();
  }

  function applyFilter() {
    const q = (search?.value || '').trim().toLowerCase();
    const allRows = Array.from(document.querySelectorAll('.sidebar .nav-row'));
    for (const r of allRows) {
      const hay = (r.dataset.meta || (r.dataset.label || '')).toLowerCase();
      const show = !q || hay.includes(q);
      r.style.display = show ? '' : 'none';
    }
    if (pinnedSection) {
      const anyPinnedShown = Array.from(pinnedList?.children || []).some(el => el.style.display !== 'none');
      pinnedSection.hidden = !anyPinnedShown;
    }
  }

  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('.pin-btn') : null;
    if (!btn) return;
    const page = btn.getAttribute('data-pin');
    if (!page) return;
    e.preventDefault();
    e.stopPropagation();
    togglePin(page);
  });

  if (search) search.addEventListener('input', applyFilter);
  renderPinned();
})();
</script>
