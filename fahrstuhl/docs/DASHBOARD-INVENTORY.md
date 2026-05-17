# Dashboard Inventory (Phase 1, Low Risk)

Status: analysis only, no deletes, no refactors, no deploy, no commit.

## Scope
- dashboard/public/pages/
- dashboard/public/includes/sidebar.php
- dashboard/public/router.php
- dashboard/public/assets/css/
- dashboard/public/styles/
- dashboard/public/assets/js/

## Legend
- category: admin-view | user-view | api-endpoint-page | legal | hub | unclear
- recommendation: behalten | spaeter pruefen | nicht loeschen | Merge-Kandidat

## Router Clean-URL aliases
Source: dashboard/public/router.php

| alias | target | target exists | note |
|---|---|---|---|
| /eselmusic | /pages/eselmusic.php | yes | valid |

Router alias findings:
- Broken aliases: none
- Alias count checked: 1

## Sidebar groups and targets
Source: dashboard/public/includes/sidebar.php

### Admin groups
- Uebersicht: cockpit, status
- Server & User: guilds (alias: guild-detail), members-hub (aliases: users, user-detail, voice-time), blacklist
- Analytik: analytics, activity, logs, audit
- Betrieb: operations (aliases: deploys, webhooks, flags, ueberwachung, ops-health), backups, security, console
- Premium: guild-premium, premium-hub, monetization
- Bot: commands, botinfo, tools, eselmusic (custom href: /eselmusic)

### User groups
- Overview: portal (alias: guild-detail), setup, command-center, serverconfig, modules
- Community: welcome, leveling, reaction-roles, social, freegames, temp-voice
- Moderation: moderation-hub (alias: moderation), automod, logging
- Support: tickets
- Tools: activity, stats
- Premium / Product: server-plans, botinfo, premium-info, redeem
- Legal: privacy, terms

Sidebar findings:
- Sidebar page targets checked: 41 unique page keys, all exist
- Sidebar alias targets checked: 11 alias entries, all exist
- Broken sidebar links (target file missing): none

## Asset usage check

### Files
- assets/css/style.css
- assets/js/main.js
- styles/mobile-responsive.css

### References
- style.css: referenced in includes/header.php
- main.js: referenced in includes/footer.php
- mobile-responsive.css: no runtime reference found in dashboard code; only mentioned in AI_HANDOFF.md

Low-risk cleanup candidate:
- styles/mobile-responsive.css
  - status: currently unreferenced in app runtime
  - action in phase 1: do not delete, keep documented only
  - recommendation: spaeter pruefen

## Full page inventory

| file | category | sidebar-linked | router-alias | short description | recommendation |
|---|---|---|---|---|---|
| activity.php | user-view | yes | no | Event/activity view for server/admin context | behalten |
| analytics.php | admin-view | yes | no | Admin analytics metrics page | behalten |
| audit.php | admin-view | yes | no | Admin audit log view | behalten |
| automod.php | user-view | yes | no | Auto moderation configuration | behalten |
| backups.php | admin-view | yes | no | Backup operations/status view | behalten |
| blacklist.php | admin-view | yes | no | Blacklist management | behalten |
| botinfo.php | user-view | yes | no | Bot capability/info page | behalten |
| cockpit.php | admin-view | yes | no | Main admin cockpit dashboard | behalten |
| command-center.php | user-view | yes | no | Quick command/control center | behalten |
| commands.php | user-view | yes | no | Command catalog and command status | behalten |
| console.php | admin-view | yes | no | Admin command/ops console | behalten |
| deploys.php | admin-view | yes (via operations alias) | no | Deployment status/details page | spaeter pruefen |
| eselmusic.php | admin-view | yes | yes (target) | Read-only EselMusic monitoring page | behalten |
| flags.php | admin-view | yes (via operations alias) | no | Feature flags admin page | spaeter pruefen |
| freegames.php | user-view | yes | no | Free games notification settings | behalten |
| fun-hub.php | hub | no | no | Hub page for fun/troll-related tools | Merge-Kandidat |
| guild-detail.php | user-view | yes (alias target) | no | Per-guild detail/home | behalten |
| guild-premium-api.php | api-endpoint-page | no | no | AJAX endpoint for guild premium actions | nicht loeschen |
| guild-premium.php | admin-view | yes | no | Assign/manage server plans | behalten |
| guilds.php | admin-view | yes | no | Guild/server list and entry page | behalten |
| leveling.php | user-view | yes | no | Leveling settings and status | behalten |
| logging.php | user-view | yes | no | Guild logging configuration | behalten |
| logs.php | admin-view | yes | no | Admin application logs view | behalten |
| members-hub.php | hub | yes | no | Hub for member/user overviews | Merge-Kandidat |
| moderation-hub.php | hub | yes | no | Hub for moderation workflows | Merge-Kandidat |
| moderation.php | user-view | yes (alias target) | no | Moderation console/actions | Merge-Kandidat |
| modules.php | user-view | yes | no | Module toggles/config view | behalten |
| monetization.php | admin-view | yes | no | Revenue/promotions management | behalten |
| operations.php | admin-view | yes | no | Ops entry page and links | behalten |
| ops-health.php | admin-view | yes (via operations alias) | no | Ops health status view | spaeter pruefen |
| portal.php | user-view | yes | no | User server portal landing | behalten |
| premium-api.php | api-endpoint-page | no | no | AJAX endpoint for premium operations | nicht loeschen |
| premium-hub.php | hub | yes | no | Premium admin hub and KPIs | Merge-Kandidat |
| premium-info.php | user-view | yes | no | User premium info/benefits | behalten |
| premium.php | admin-view | no | no | Legacy premium management page | Merge-Kandidat |
| privacy.php | legal | yes | no | Privacy policy page | nicht loeschen |
| reaction-roles.php | user-view | yes | no | Reaction role setup and management | behalten |
| redeem.php | user-view | yes | no | Code redeem page | behalten |
| rewards-hub.php | hub | no | no | Rewards/votes/shields overview hub | spaeter pruefen |
| security.php | admin-view | yes | no | Security checks/overview page | behalten |
| server-backup.php | user-view | no | no | Guild-level backup/restore workflows | spaeter pruefen |
| server-plans.php | user-view | yes | no | User-facing server plan/tier page | behalten |
| serverconfig.php | user-view | yes | no | Server configuration overview | behalten |
| setup.php | user-view | yes | no | Setup assistant wizard | behalten |
| shield-api.php | api-endpoint-page | no | no | AJAX endpoint for shield operations | nicht loeschen |
| social.php | user-view | yes | no | Social alerts configuration | behalten |
| stats.php | user-view | yes | no | Server analytics and trends | behalten |
| status.php | admin-view | yes | no | Live service status page | behalten |
| temp-voice.php | user-view | yes | no | Temporary voice channel settings | behalten |
| terms.php | legal | yes | no | Terms of service page | nicht loeschen |
| tickets.php | user-view | yes | no | Ticketing setup/workflows | behalten |
| tools.php | admin-view | yes | no | Admin utilities/tools page | behalten |
| ueberwachung.php | admin-view | yes (via operations alias) | no | Monitoring page (legacy naming) | spaeter pruefen |
| user-detail.php | admin-view | yes (alias target) | no | Admin user detail/search page | behalten |
| users.php | admin-view | yes (alias target) | no | Admin user list page | Merge-Kandidat |
| voice-time.php | user-view | yes (alias target) | no | Voice usage/time page | behalten |
| voicetroll.php | admin-view | no | no | Voice troll control page | spaeter pruefen |
| webhooks.php | admin-view | yes (via operations alias) | no | Webhook management page | spaeter pruefen |
| welcome.php | user-view | yes | no | Welcome/verification settings | behalten |

## Explicit non-delete list (API endpoint pages)
Do not delete these files:
- premium-api.php
- guild-premium-api.php
- shield-api.php

Reason: These are endpoint pages used by frontend AJAX flows, not normal navigational views.

## Low-risk cleanup candidates (phase 1 documentation only)
- styles/mobile-responsive.css (unreferenced runtime stylesheet)
- premium.php (likely overlap with premium-hub.php)
- members-hub.php and users.php (possible overlap)
- moderation-hub.php and moderation.php (possible overlap)
- ueberwachung.php and ops-health.php (possible overlap)
- rewards-hub.php, fun-hub.php, voicetroll.php, server-backup.php (niche/indirect entry pages; verify external links before any action)

## Counts
- Total PHP pages inventoried: 59
- Sidebar links checked:
  - direct page keys: 41 unique
  - alias entries: 11
- Router aliases checked: 1
- Broken links/aliases found: 0
