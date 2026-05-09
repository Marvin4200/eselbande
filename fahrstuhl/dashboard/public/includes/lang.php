<?php
/**
 * Dashboard language system — DE (default) / EN
 * Usage: t('key')  →  translated string
 * Switch: ?setlang=en  or  ?setlang=de
 */

function dashboardSetLang(string $lang): void {
    $allowed = ['de', 'en'];
    if (in_array($lang, $allowed, true)) {
        $_SESSION['fh_lang'] = $lang;
    }
}

function dashboardLang(): string {
    return $_SESSION['fh_lang'] ?? 'de';
}

function t(string $key): string {
    static $strings = null;
    if ($strings === null) {
        $strings = [
            'de' => [
                // Navbar
                'nav.online'         => 'Online',
                'nav.notifications'  => 'Benachrichtigungen',
                'nav.mark_read'      => 'Gelesen',
                'nav.show_all'       => 'Alle anzeigen →',
                'nav.no_activity'    => 'Keine neuen Aktivitäten',
                'nav.no_filter'      => 'Keine Ereignisse in diesem Filter',
                'nav.logout'         => 'Abmelden',
                'nav.normal_view'    => 'Normal View',
                'nav.admin_mode'     => 'Admin Mode',
                'nav.lang_label'     => 'EN',
                'nav.lang_next'      => 'en',
                'nav.lang_title'     => 'Switch to English',
                // JS time strings
                'time.just_now'      => 'gerade eben',
                'time.ago_prefix'    => 'vor ',
                'time.sec_suffix'    => 's',
                'time.min_suffix'    => 'm',
                'time.hour_suffix'   => 'h',
                'time.day_suffix'    => 'd',
                'notif.unread'       => 'ungelesen · ',
                'notif.total'        => 'gesamt',
                // Upgrade banner
                'upgrade.title'      => 'Free Plan',
                'upgrade.sub'        => '— Mehr Panels, Live Activity &amp; Insights mit Premium',
                'upgrade.cta'        => '💎 Upgrade ansehen',
                'upgrade.close'      => 'Schließen',
                // Sidebar
                'sidebar.search'     => 'Suche',
                'sidebar.pinned'     => 'Angepinnt',
                'sidebar.nav_admin'  => 'Workspace',
                'sidebar.nav_user'   => 'Navigation',
                'sidebar.legal'      => 'Legal',
                // Footer
                'footer.copyright'   => '© 2026 Fahrstuhl Bot',
                'footer.help'        => 'Hilfe?',
                'footer.help_title'  => 'Brauchst du Hilfe? Komm in den Support-Discord!',
            ],
            'en' => [
                // Navbar
                'nav.online'         => 'Online',
                'nav.notifications'  => 'Notifications',
                'nav.mark_read'      => 'Mark read',
                'nav.show_all'       => 'Show all →',
                'nav.no_activity'    => 'No new activity',
                'nav.no_filter'      => 'No events in this filter',
                'nav.logout'         => 'Logout',
                'nav.normal_view'    => 'Normal View',
                'nav.admin_mode'     => 'Admin Mode',
                'nav.lang_label'     => 'DE',
                'nav.lang_next'      => 'de',
                'nav.lang_title'     => 'Zu Deutsch wechseln',
                // JS time strings
                'time.just_now'      => 'just now',
                'time.ago_prefix'    => '',
                'time.sec_suffix'    => 's ago',
                'time.min_suffix'    => 'm ago',
                'time.hour_suffix'   => 'h ago',
                'time.day_suffix'    => 'd ago',
                'notif.unread'       => 'unread · ',
                'notif.total'        => 'total',
                // Upgrade banner
                'upgrade.title'      => 'Free Plan',
                'upgrade.sub'        => '— More panels, live activity &amp; insights with Premium',
                'upgrade.cta'        => '💎 View upgrade',
                'upgrade.close'      => 'Close',
                // Sidebar
                'sidebar.search'     => 'Search',
                'sidebar.pinned'     => 'Pinned',
                'sidebar.nav_admin'  => 'Workspace',
                'sidebar.nav_user'   => 'Navigation',
                'sidebar.legal'      => 'Legal',
                // Footer
                'footer.copyright'   => '© 2026 Fahrstuhl Bot',
                'footer.help'        => 'Help?',
                'footer.help_title'  => 'Need help? Join our Support Discord!',
            ],
        ];
    }
    $lang = dashboardLang();
    return $strings[$lang][$key] ?? $strings['de'][$key] ?? $key;
}
