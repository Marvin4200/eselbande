<?php
session_start();
require_once __DIR__ . '/includes/config.php';

$discord_client_id = getenv('DISCORD_CLIENT_ID') ?: '1487187616674611321';
$discord_client_secret = getenv('DISCORD_CLIENT_SECRET') ?: '';
$discord_redirect_uri = getenv('DISCORD_REDIRECT_URI') ?: 'http://62.157.1.28';
// Only fall back to auto-detecting host for local development (LAN IPs).
// In production, DISCORD_REDIRECT_URI from .env must always be used.
if (!getenv('DISCORD_REDIRECT_URI') && isset($_SERVER['HTTP_HOST']) && !str_contains($_SERVER['HTTP_HOST'], '192.168')) {
    $discord_redirect_uri = 'http://' . $_SERVER['HTTP_HOST'];
}

if (isset($_SESSION['user']) && isset($_GET['refresh_guilds'])) {
    unset($_SESSION['user'], $_SESSION['user_guilds']);
    $_SESSION['oauth_state'] = bin2hex(random_bytes(32));
    $authUrl = 'https://discord.com/api/oauth2/authorize?' . http_build_query([
        'client_id' => $discord_client_id,
        'redirect_uri' => $discord_redirect_uri,
        'response_type' => 'code',
        'scope' => 'identify guilds',
        'state' => $_SESSION['oauth_state'],
    ]);
    header('Location: ' . $authUrl);
    exit();
}

if (isset($_SESSION['user'])) {
    header('Location: ' . BASE_URL . (isAdmin() ? '/pages/cockpit.php' : '/pages/portal.php'));
    exit();
}

if (empty($_SESSION['oauth_state'])) {
    $_SESSION['oauth_state'] = bin2hex(random_bytes(32));
}

if (isset($_GET['logout'])) {
    session_destroy();
    header('Location: ' . BASE_URL . '/index.php');
    exit();
}

// Handle OAuth Callback
if (isset($_GET['code'])) {
    if (empty($_GET['state']) || !hash_equals($_SESSION['oauth_state'] ?? '', $_GET['state'])) {
        http_response_code(400);
        die('Invalid OAuth state');
    }

    $code = $_GET['code'];
    
    $ch = curl_init('https://discord.com/api/oauth2/token');
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
        'client_id' => $discord_client_id,
        'client_secret' => $discord_client_secret,
        'grant_type' => 'authorization_code',
        'code' => $code,
        'redirect_uri' => $discord_redirect_uri
    ]));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/x-www-form-urlencoded']);
    
    $response = curl_exec($ch);
    curl_close($ch);
    
    $token_data = json_decode($response, true);
    
    if (isset($token_data['access_token'])) {
        $ch = curl_init('https://discord.com/api/users/@me');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $token_data['access_token']]);
        
        $user_response = curl_exec($ch);
        curl_close($ch);
        
        $user_data = json_decode($user_response, true);
        
        if (isset($user_data['id'])) {
            session_regenerate_id(true);
            $_SESSION['oauth_state'] = bin2hex(random_bytes(32));
            $_SESSION['user'] = [
                'id' => $user_data['id'],
                'username' => $user_data['username'],
                'avatar' => $user_data['avatar'],
                'discriminator' => $user_data['discriminator'] ?? '0'
            ];
            $_SESSION['discord_access_token'] = $token_data['access_token'];
            $_SESSION['discord_access_token_expires_at'] = time() + (int)($token_data['expires_in'] ?? 604800);
            $_SESSION['last_activity'] = time();

            // Fetch user's guilds for server admin checks
            $ch2 = curl_init('https://discord.com/api/users/@me/guilds');
            curl_setopt($ch2, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch2, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $token_data['access_token']]);
            $guilds_response = curl_exec($ch2);
            curl_close($ch2);
            $guilds_data = json_decode($guilds_response, true);
            $_SESSION['user_guilds'] = is_array($guilds_data) ? $guilds_data : [];
            $_SESSION['user_guilds_fetched_at'] = time();

            header('Location: ' . BASE_URL . (isAdmin() ? '/pages/cockpit.php' : '/pages/portal.php'));
            exit();
        } else {
            http_response_code(502);
            die('Discord user lookup failed');
        }
    } else {
        http_response_code(502);
        die('Discord token exchange failed');
    }
}

function firstPositiveNumber(...$values) {
    foreach ($values as $value) {
        $number = (int)($value ?? 0);
        if ($number > 0) return $number;
    }
    return 0;
}

$statsRaw = getAPI('/stats', 4);
$stats = $statsRaw['data'] ?? $statsRaw['stats'] ?? [];
$systemRaw = getAPI('/system/status', 4);
$system = $systemRaw['data'] ?? [];
$healthRaw = getAPI('/health', 4);
$health = $healthRaw['data'] ?? [];
$servers = firstPositiveNumber(
    $stats['guilds'] ?? null,
    $system['bot']['guilds'] ?? null,
    $health['guilds'] ?? null
);
$users = firstPositiveNumber(
    $stats['totalUsers'] ?? null,
    $stats['users'] ?? null,
    $stats['totalMembers'] ?? null,
    $system['bot']['totalMembers'] ?? null,
    $system['bot']['cachedUsers'] ?? null
);
$commandsUsed = firstPositiveNumber(
    $stats['commands'] ?? null,
    $stats['totalCommands'] ?? null,
    $stats['totalExecutions'] ?? null,
    $system['analytics']['totalExecutions'] ?? null,
    $stats['totalTrolls'] ?? null
);
$topCommand = $stats['topCommand'] ?? $stats['top_command'] ?? $system['analytics']['topCommand'] ?? 'ticket';
$authUrl = 'https://discord.com/api/oauth2/authorize?' . http_build_query([
    'client_id' => $discord_client_id,
    'redirect_uri' => $discord_redirect_uri,
    'response_type' => 'code',
    'scope' => 'identify guilds',
    'state' => $_SESSION['oauth_state'],
]);
$inviteUrl = 'https://discord.com/oauth2/authorize?' . http_build_query([
    'client_id' => $discord_client_id,
    'permissions' => '1654096264208',
    'scope' => 'bot applications.commands',
]);
$supportUrl = 'https://discord.gg/zfzDHKcWDx';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fahrstuhl Bot - Discord Bot Dashboard</title>
    <style>
        :root {
            --bg: #0b0f16;
            --panel: #151b26;
            --panel-2: #1f2837;
            --line: rgba(226, 232, 240, .12);
            --text: #f8fafc;
            --muted: #a7b0bf;
            --brand: #5865f2;
            --green: #57f287;
            --amber: #f0b232;
            --coral: #ff6b6b;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body {
            min-height: 100vh;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background: var(--bg);
            color: var(--text);
            line-height: 1.5;
        }
        a { color: inherit; text-decoration: none; }
        .topbar {
            position: sticky;
            top: 0;
            z-index: 10;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            min-height: 72px;
            padding: 0 5vw;
            background: rgba(11, 15, 22, .82);
            backdrop-filter: blur(18px);
            border-bottom: 1px solid var(--line);
        }
        .brand {
            display: flex;
            align-items: center;
            gap: .7rem;
            font-weight: 900;
            letter-spacing: 0;
        }
        .brand-mark {
            width: 38px;
            height: 38px;
            display: grid;
            place-items: center;
            border-radius: 8px;
            background: #5865f2;
            color: #fff;
            font-weight: 950;
            box-shadow: 0 12px 28px rgba(88, 101, 242, .35);
        }
        .nav {
            display: flex;
            align-items: center;
            gap: 1.2rem;
            color: var(--muted);
            font-weight: 700;
            font-size: .92rem;
        }
        .nav a:hover { color: var(--text); }
        .nav-invite {
            padding: .62rem .9rem;
            border: 1px solid var(--line);
            border-radius: 8px;
            color: #fff;
            background: rgba(255,255,255,.04);
        }
        .nav-cta {
            padding: .62rem .9rem;
            border: 1px solid rgba(88, 101, 242, .48);
            border-radius: 8px;
            color: #fff;
            background: rgba(88, 101, 242, .2);
        }
        .hero {
            min-height: calc(88svh - 72px);
            display: grid;
            grid-template-columns: minmax(0, .92fr) minmax(420px, 1.08fr);
            align-items: center;
            gap: 4vw;
            padding: 58px 5vw 62px;
            position: relative;
            overflow: hidden;
            background-image:
                linear-gradient(90deg, rgba(11,15,22,.96) 0%, rgba(11,15,22,.82) 38%, rgba(11,15,22,.44) 100%),
                url("<?= BASE_URL ?>/assets/img/fahrstuhl-hero.png");
            background-size: cover;
            background-position: center right;
        }
        .hero-copy { max-width: 690px; position: relative; z-index: 1; }
        .eyebrow {
            display: inline-flex;
            align-items: center;
            gap: .55rem;
            color: #dbeafe;
            font-size: .82rem;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: .08em;
            margin-bottom: 1.1rem;
        }
        .pulse {
            width: .62rem;
            height: .62rem;
            border-radius: 99px;
            background: var(--green);
            box-shadow: 0 0 0 6px rgba(87, 242, 135, .14);
        }
        h1 {
            font-size: clamp(3.4rem, 8vw, 7.8rem);
            line-height: .88;
            letter-spacing: 0;
            margin-bottom: 1.1rem;
        }
        .hero-sub {
            max-width: 660px;
            color: #d4dae5;
            font-size: clamp(1.04rem, 1.6vw, 1.38rem);
            margin-bottom: 2rem;
        }
        .hero-proof {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: .55rem;
            margin-bottom: 1.15rem;
        }
        .proof-pill {
            display: inline-flex;
            align-items: center;
            min-height: 30px;
            padding: .28rem .62rem;
            border-radius: 999px;
            border: 1px solid var(--line);
            background: rgba(21, 27, 38, .72);
            color: #dce7f7;
            font-size: .78rem;
            font-weight: 850;
        }
        .hero-actions {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: .8rem;
            margin-bottom: 2rem;
        }
        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 46px;
            padding: .76rem 1.05rem;
            border-radius: 8px;
            font-weight: 900;
            border: 1px solid transparent;
            transition: transform .16s ease, border-color .16s ease, background .16s ease;
        }
        .btn:hover { transform: translateY(-2px); }
        .btn-primary { background: var(--brand); color: #fff; box-shadow: 0 18px 42px rgba(88, 101, 242, .32); }
        .btn-secondary { border-color: var(--line); background: rgba(21, 27, 38, .72); color: #fff; }
        .hero-stats {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 150px));
            gap: .75rem;
        }
        .stat {
            border: 1px solid var(--line);
            background: rgba(21, 27, 38, .74);
            border-radius: 8px;
            padding: .82rem .9rem;
        }
        .stat strong { display: block; font-size: 1.45rem; line-height: 1; }
        .stat span { display: block; color: var(--muted); font-size: .76rem; font-weight: 800; text-transform: uppercase; margin-top: .36rem; }
        .hero-console {
            align-self: end;
            justify-self: end;
            width: min(100%, 520px);
            border: 1px solid var(--line);
            border-radius: 8px;
            background: rgba(15, 20, 30, .82);
            box-shadow: 0 28px 90px rgba(0,0,0,.45);
            backdrop-filter: blur(10px);
            overflow: hidden;
        }
        .console-head { display: flex; gap: .44rem; padding: .75rem; border-bottom: 1px solid var(--line); }
        .dot { width: .65rem; height: .65rem; border-radius: 99px; background: var(--coral); }
        .dot:nth-child(2) { background: var(--amber); }
        .dot:nth-child(3) { background: var(--green); }
        .console-body { padding: 1rem; display: grid; gap: .7rem; }
        .console-line {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            color: #dbeafe;
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            font-size: .86rem;
        }
        .console-line span { color: var(--green); }
        .trust-strip {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 1px;
            background: var(--line);
            border-top: 1px solid var(--line);
            border-bottom: 1px solid var(--line);
        }
        .trust-item {
            min-height: 112px;
            padding: 1.25rem 5vw;
            background: #0f141d;
        }
        .trust-item b { display: block; font-size: 1.02rem; margin-bottom: .35rem; }
        .trust-item span { color: var(--muted); font-size: .88rem; font-weight: 650; }
        .band {
            padding: 64px 5vw;
            border-top: 1px solid var(--line);
            background: #10151f;
        }
        .band.alt { background: #0d1119; }
        .section-head {
            display: flex;
            align-items: end;
            justify-content: space-between;
            gap: 2rem;
            margin-bottom: 1.4rem;
        }
        .section-head h2 { font-size: clamp(2rem, 4vw, 3.4rem); line-height: 1; letter-spacing: 0; }
        .section-head p { color: var(--muted); max-width: 520px; font-weight: 650; }
        .feature-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: .9rem;
        }
        .feature {
            min-height: 210px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            border: 1px solid var(--line);
            border-radius: 8px;
            background: var(--panel);
            padding: 1.05rem;
        }
        .feature b {
            font-size: 1.08rem;
            display: block;
            margin-bottom: .5rem;
        }
        .feature p { color: var(--muted); font-size: .93rem; }
        .feature-tag {
            width: fit-content;
            color: #0b0f16;
            background: var(--green);
            border-radius: 999px;
            padding: .22rem .55rem;
            font-size: .68rem;
            font-weight: 950;
            text-transform: uppercase;
        }
        .feature:nth-child(2) .feature-tag { background: var(--amber); }
        .feature:nth-child(3) .feature-tag { background: #93c5fd; }
        .feature:nth-child(4) .feature-tag { background: #fda4af; }
        .plugin-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: .9rem;
            margin-top: .95rem;
        }
        .plugin-card {
            position: relative;
            min-height: 178px;
            border: 1px solid var(--line);
            border-radius: 8px;
            background: linear-gradient(180deg, rgba(31,40,55,.94), rgba(17,24,39,.96));
            padding: 1rem;
            overflow: hidden;
        }
        .plugin-card::after {
            content: "";
            position: absolute;
            right: -26px;
            top: -26px;
            width: 120px;
            height: 120px;
            border-radius: 999px;
            background: rgba(88, 101, 242, .18);
        }
        .plugin-card:nth-child(2)::after { background: rgba(87, 242, 135, .14); }
        .plugin-card:nth-child(3)::after { background: rgba(240, 178, 50, .16); }
        .plugin-card:nth-child(4)::after { background: rgba(255, 107, 107, .14); }
        .plugin-card:nth-child(5)::after { background: rgba(147, 197, 253, .15); }
        .plugin-card:nth-child(6)::after { background: rgba(253, 164, 175, .14); }
        .plugin-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            margin-bottom: .8rem;
            position: relative;
            z-index: 1;
        }
        .plugin-icon {
            width: 42px;
            height: 42px;
            display: grid;
            place-items: center;
            border-radius: 8px;
            background: rgba(255,255,255,.08);
            color: #fff;
            font-weight: 950;
        }
        .plugin-state {
            color: var(--green);
            border: 1px solid rgba(87, 242, 135, .35);
            border-radius: 999px;
            padding: .16rem .46rem;
            font-size: .68rem;
            font-weight: 950;
            text-transform: uppercase;
        }
        .plugin-card h3 { font-size: 1.12rem; margin-bottom: .44rem; position: relative; z-index: 1; }
        .plugin-card p { color: var(--muted); font-size: .92rem; position: relative; z-index: 1; }
        .workflow {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1rem;
        }
        .workflow-panel {
            border: 1px solid var(--line);
            border-radius: 8px;
            background: var(--panel);
            padding: 1.2rem;
        }
        .workflow-panel h3 { font-size: 1.22rem; margin-bottom: .8rem; }
        .rows { display: grid; gap: .58rem; }
        .row {
            display: grid;
            grid-template-columns: 104px 1fr auto;
            align-items: center;
            gap: .8rem;
            padding: .72rem;
            border-radius: 8px;
            background: rgba(255,255,255,.035);
            color: #dfe5ef;
        }
        .badge {
            width: fit-content;
            border: 1px solid rgba(240, 178, 50, .45);
            color: var(--amber);
            border-radius: 999px;
            padding: .18rem .5rem;
            font-size: .72rem;
            font-weight: 900;
            text-transform: uppercase;
        }
        .steps {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: .9rem;
            margin-top: .95rem;
        }
        .step {
            border: 1px solid var(--line);
            border-radius: 8px;
            background: var(--panel);
            padding: 1rem;
            min-height: 170px;
        }
        .step-number {
            display: grid;
            place-items: center;
            width: 38px;
            height: 38px;
            border-radius: 8px;
            background: var(--brand);
            font-weight: 950;
            margin-bottom: .8rem;
        }
        .step h3 { font-size: 1.12rem; margin-bottom: .42rem; }
        .step p { color: var(--muted); font-size: .93rem; }
        .compare {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1rem;
        }
        .compare-card {
            border: 1px solid var(--line);
            border-radius: 8px;
            background: var(--panel);
            padding: 1.2rem;
        }
        .compare-card h3 { margin-bottom: .75rem; }
        .check-list { display: grid; gap: .55rem; color: #dfe5ef; }
        .check-list div {
            display: flex;
            align-items: center;
            gap: .65rem;
            padding: .55rem .65rem;
            border-radius: 8px;
            background: rgba(255,255,255,.035);
        }
        .check {
            width: 22px;
            height: 22px;
            display: grid;
            place-items: center;
            border-radius: 999px;
            background: rgba(87,242,135,.16);
            color: var(--green);
            font-weight: 950;
            flex: 0 0 auto;
        }
        .final-cta {
            min-height: 360px;
            display: grid;
            place-items: center;
            text-align: center;
            background: #111827;
            border-top: 1px solid var(--line);
            padding: 64px 5vw;
        }
        .final-cta h2 { font-size: clamp(2.3rem, 5vw, 4.8rem); line-height: .96; margin-bottom: 1rem; }
        .final-cta p { color: var(--muted); max-width: 680px; margin: 0 auto 1.5rem; font-size: 1.08rem; }
        footer {
            display: flex;
            justify-content: space-between;
            gap: 1rem;
            flex-wrap: wrap;
            padding: 1.2rem 5vw;
            color: var(--muted);
            background: #0b0f16;
            border-top: 1px solid var(--line);
            font-size: .88rem;
        }
        footer a { color: #dbeafe; margin-left: 1rem; }
        @media (max-width: 980px) {
            .nav a:not(.nav-cta) { display: none; }
            .hero {
                grid-template-columns: 1fr;
                background-position: 62% center;
                padding-top: 44px;
            }
            .hero-console { justify-self: start; }
            .feature-grid, .plugin-grid, .workflow, .compare, .trust-strip, .steps { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 640px) {
            .topbar { padding: 0 1rem; }
            .hero, .band, .final-cta { padding-left: 1rem; padding-right: 1rem; }
            .hero-stats { grid-template-columns: 1fr; }
            .feature-grid, .plugin-grid, .workflow, .compare, .trust-strip, .steps { grid-template-columns: 1fr; }
            .section-head { display: block; }
            .section-head p { margin-top: .8rem; }
            .row { grid-template-columns: 1fr; }
            footer a { margin-left: 0; margin-right: 1rem; }
        }
    </style>
</head>
<body>
    <header class="topbar">
        <a class="brand" href="<?= BASE_URL ?>/index.php" aria-label="Fahrstuhl Bot home">
            <span class="brand-mark">F</span>
            <span>Fahrstuhl Bot</span>
        </a>
        <nav class="nav" aria-label="Primary navigation">
            <a href="#features">Features</a>
            <a href="#plugins">Plugins</a>
            <a href="#dashboard">Dashboard</a>
            <a href="<?= BASE_URL ?>/pages/stats.php">Stats</a>
            <a href="<?= esc($inviteUrl) ?>" class="nav-invite">Add Bot</a>
            <a href="<?= esc($authUrl) ?>" class="nav-cta">Login</a>
        </nav>
    </header>

    <main>
        <section class="hero">
            <div class="hero-copy">
                <div class="eyebrow"><span class="pulse"></span> Discord dashboard for serious servers</div>
                <h1>Fahrstuhl Bot</h1>
                <p class="hero-sub">All-in-one Discord automation with a fast web dashboard: tickets, moderation, leveling, reaction roles, rewards, welcome flows, logging and server tools in one place.</p>
                <div class="hero-proof">
                    <span class="proof-pill">Ticket workflows</span>
                    <span class="proof-pill">Leveling</span>
                    <span class="proof-pill">Reaction roles</span>
                    <span class="proof-pill">Moderation logs</span>
                </div>
                <div class="hero-actions">
                    <a class="btn btn-primary" href="<?= esc($authUrl) ?>">Login with Discord</a>
                    <a class="btn btn-secondary" href="<?= esc($inviteUrl) ?>">Add to Server</a>
                    <a class="btn btn-secondary" href="<?= esc($supportUrl) ?>">Support Server</a>
                </div>
                <div class="hero-stats" aria-label="Live bot stats">
                    <div class="stat"><strong><?= formatNum($servers) ?></strong><span>Servers</span></div>
                    <div class="stat"><strong><?= formatNum($users) ?></strong><span>Users</span></div>
                    <div class="stat"><strong>/<?= esc($topCommand) ?></strong><span>Top Command</span></div>
                </div>
            </div>
            <aside class="hero-console" aria-label="Live operations preview">
                <div class="console-head"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
                <div class="console-body">
                    <div class="console-line">tickets.panel <span>ready</span></div>
                    <div class="console-line">moderation.cases <span>synced</span></div>
                    <div class="console-line">leveling.roles <span>active</span></div>
                    <div class="console-line">commands.used <span><?= formatNum($commandsUsed) ?></span></div>
                </div>
            </aside>
        </section>

        <section class="trust-strip" aria-label="Fahrstuhl strengths">
            <div class="trust-item"><b>Dashboard first</b><span>No messy setup chains. Configure the server visually.</span></div>
            <div class="trust-item"><b>Built for staff</b><span>Tickets, logs and notes are designed for repeated daily use.</span></div>
            <div class="trust-item"><b>Community growth</b><span>Leveling, rewards and role flows keep members active.</span></div>
            <div class="trust-item"><b>Live operations</b><span>Status, analytics and module controls stay one click away.</span></div>
        </section>

        <section class="band" id="features">
            <div class="section-head">
                <h2>Everything your Discord needs.</h2>
                <p>Built around the same dashboard-first idea that made bots like MEE6 popular, but tuned for Fahrstuhl: cleaner control, faster setup, stronger ticket workflows.</p>
            </div>
            <div class="feature-grid">
                <article class="feature">
                    <div><b>Ticket Center</b><p>Panels, type dropdowns, intake forms, staff claiming, priority lanes, transcripts, feedback and SLA tracking.</p></div>
                    <span class="feature-tag">Support</span>
                </article>
                <article class="feature">
                    <div><b>Moderation Suite</b><p>Warnings, timeouts, kicks, bans, case history, automod controls and audit-ready server logs.</p></div>
                    <span class="feature-tag">Safety</span>
                </article>
                <article class="feature">
                    <div><b>Engagement Tools</b><p>Leveling, rewards, ranks, shields, welcome messages and reaction roles for active communities.</p></div>
                    <span class="feature-tag">Growth</span>
                </article>
                <article class="feature">
                    <div><b>Live Dashboard</b><p>Guild selection, module switches, analytics, bot health, logs and server configuration without command spam.</p></div>
                    <span class="feature-tag">Control</span>
                </article>
            </div>
        </section>

        <section class="band alt" id="plugins">
            <div class="section-head">
                <h2>Powerful plugins. One bot.</h2>
                <p>Give server owners the MEE6-style overview they expect, with Fahrstuhl's own ticket, moderation and fun systems underneath.</p>
            </div>
            <div class="plugin-grid">
                <article class="plugin-card">
                    <div class="plugin-top"><span class="plugin-icon">T</span><span class="plugin-state">Advanced</span></div>
                    <h3>Tickets</h3>
                    <p>Panel builder, SLA, staff notes, transcripts, ticket feedback and per-ticket user access.</p>
                </article>
                <article class="plugin-card">
                    <div class="plugin-top"><span class="plugin-icon">M</span><span class="plugin-state">Ready</span></div>
                    <h3>Moderation</h3>
                    <p>Warns, timeouts, bans, kicks, history and audit logs with a dashboard view.</p>
                </article>
                <article class="plugin-card">
                    <div class="plugin-top"><span class="plugin-icon">L</span><span class="plugin-state">Live</span></div>
                    <h3>Leveling</h3>
                    <p>XP, ranks, leaderboards, level roles and server-specific leveling controls.</p>
                </article>
                <article class="plugin-card">
                    <div class="plugin-top"><span class="plugin-icon">R</span><span class="plugin-state">Flexible</span></div>
                    <h3>Reaction Roles</h3>
                    <p>Self-serve roles with buttons, menus and clean role/channel selection.</p>
                </article>
                <article class="plugin-card">
                    <div class="plugin-top"><span class="plugin-icon">W</span><span class="plugin-state">Polished</span></div>
                    <h3>Welcome</h3>
                    <p>Welcome and goodbye flows with channel targeting, templates and test sends.</p>
                </article>
                <article class="plugin-card">
                    <div class="plugin-top"><span class="plugin-icon">F</span><span class="plugin-state">Unique</span></div>
                    <h3>Fun & Rewards</h3>
                    <p>Shields, rewards, troll tools and premium features for the Fahrstuhl identity.</p>
                </article>
            </div>
        </section>

        <section class="band" id="dashboard">
            <div class="section-head">
                <h2>Plugin-style control.</h2>
                <p>Login, pick a server once, tune the modules, send panels, and let the bot handle the Discord-side work.</p>
            </div>
            <div class="workflow">
                <div class="workflow-panel">
                    <h3>Server modules</h3>
                    <div class="rows">
                        <div class="row"><span class="badge">Enabled</span><strong>Tickets</strong><span>Panel live</span></div>
                        <div class="row"><span class="badge">Enabled</span><strong>Leveling</strong><span>Roles synced</span></div>
                        <div class="row"><span class="badge">Ready</span><strong>Reaction Roles</strong><span>Menus + Buttons</span></div>
                        <div class="row"><span class="badge">Live</span><strong>Logging</strong><span>Audit stream</span></div>
                    </div>
                </div>
                <div class="workflow-panel">
                    <h3>Operations</h3>
                    <div class="rows">
                        <div class="row"><span class="badge">SLA</span><strong>Overdue tickets</strong><span>Auto flagged</span></div>
                        <div class="row"><span class="badge">Staff</span><strong>Internal notes</strong><span>Archived</span></div>
                        <div class="row"><span class="badge">Users</span><strong>Feedback rating</strong><span>Tracked</span></div>
                        <div class="row"><span class="badge">Health</span><strong>Bot status</strong><span>Real time</span></div>
                    </div>
                </div>
            </div>
        </section>

        <section class="band alt">
            <div class="section-head">
                <h2>Setup in minutes.</h2>
                <p>The landing page should make the promise simple: invite, login, configure. Fahrstuhl handles the boring Discord work after that.</p>
            </div>
            <div class="steps">
                <article class="step"><span class="step-number">1</span><h3>Add Fahrstuhl</h3><p>Invite the bot with the right permissions and slash commands enabled.</p></article>
                <article class="step"><span class="step-number">2</span><h3>Pick your server</h3><p>Login with Discord and select the guild once in the dashboard portal.</p></article>
                <article class="step"><span class="step-number">3</span><h3>Enable modules</h3><p>Turn on tickets, leveling, logging and role tools without typing setup commands.</p></article>
            </div>
        </section>

        <section class="band">
            <div class="section-head">
                <h2>Why server owners switch.</h2>
                <p>A strong landing page needs contrast. This section makes Fahrstuhl feel like a full bot platform, not a single trick tool.</p>
            </div>
            <div class="compare">
                <div class="compare-card">
                    <h3>For admins</h3>
                    <div class="check-list">
                        <div><span class="check">✓</span><span>One dashboard for modules, logs, analytics and setup.</span></div>
                        <div><span class="check">✓</span><span>Guild selection persists across pages.</span></div>
                        <div><span class="check">✓</span><span>Ticket metrics and staff workflows are visible instantly.</span></div>
                    </div>
                </div>
                <div class="compare-card">
                    <h3>For communities</h3>
                    <div class="check-list">
                        <div><span class="check">✓</span><span>Cleaner support channels and faster staff responses.</span></div>
                        <div><span class="check">✓</span><span>Leveling, rewards and roles make activity feel worthwhile.</span></div>
                        <div><span class="check">✓</span><span>Fun Fahrstuhl features keep the bot memorable.</span></div>
                    </div>
                </div>
            </div>
        </section>

        <section class="final-cta">
            <div>
                <h2>Run your server from one dashboard.</h2>
                <p>Connect Discord, select your guild, and turn Fahrstuhl into the command center for your community.</p>
                <div class="hero-actions" style="justify-content:center;margin-bottom:0;">
                    <a class="btn btn-primary" href="<?= esc($authUrl) ?>">Open Dashboard</a>
                    <a class="btn btn-secondary" href="<?= BASE_URL ?>/pages/botinfo.php">Bot Info</a>
                </div>
            </div>
        </section>
    </main>

    <footer>
        <span>Fahrstuhl Bot © 2026</span>
        <span>
            <a href="<?= BASE_URL ?>/pages/privacy.php">Privacy</a>
            <a href="<?= BASE_URL ?>/pages/terms.php">Terms</a>
            <a href="<?= BASE_URL ?>/pages/stats.php">Public Stats</a>
        </span>
    </footer>
</body>
</html>
