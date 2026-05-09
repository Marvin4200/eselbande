<?php
/**
 * Guild Premium API Handler (AJAX endpoint)
 * Grants / revokes / looks up server-level premium by guild ID.
 * Premium is tied to the guild owner's user account.
 */
require_once __DIR__ . '/../includes/config.php';
requireAdmin();

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $action = $_GET['action'] ?? 'lookup';
    $guildId = trim((string)($_GET['guildId'] ?? ''));

    if ($action === 'lookup') {
        if (!$guildId || !preg_match('/^\d{17,20}$/', $guildId)) {
            http_response_code(400);
            echo json_encode(['error' => 'Ungültige Guild-ID']);
            exit;
        }

        $guildsRaw = getAPI('/guilds', 8);
        $guilds    = $guildsRaw['data']['guilds'] ?? [];
        $guild     = null;
        foreach ($guilds as $g) {
            if (($g['id'] ?? '') === $guildId) { $guild = $g; break; }
        }

        if (!$guild) {
            http_response_code(404);
            echo json_encode(['error' => 'Server nicht gefunden (Bot ist möglicherweise nicht auf diesem Server)']);
            exit;
        }

        $ownerId   = $guild['ownerId'] ?? '';
        $premRaw   = $ownerId ? getAPI('/premium/user/' . urlencode($ownerId), 6) : null;
        $premUser  = $premRaw['data']['user'] ?? null;
        $isPremium = $premRaw['data']['isPremium'] ?? false;
        $isPro     = $premRaw['data']['isPro']     ?? false;

        echo json_encode([
            'success'    => true,
            'guild'      => [
                'id'          => $guild['id'],
                'name'        => $guild['name'],
                'memberCount' => $guild['memberCount'] ?? 0,
                'icon'        => $guild['icon'] ?? null,
                'ownerId'     => $ownerId,
            ],
            'ownerPremium' => [
                'isPremium' => $isPremium,
                'isPro'     => $isPro,
                'tier'      => $isPro ? 'pro' : ($isPremium ? 'basic' : 'free'),
                'expiresAt' => $premUser['expires_at'] ?? null,
            ],
        ]);
        exit;
    }

    if ($action === 'list') {
        // Return all bot guilds with their owner's premium status
        $guildsRaw = getAPI('/guilds', 10);
        $guilds    = $guildsRaw['data']['guilds'] ?? [];

        $result = [];
        foreach ($guilds as $g) {
            $ownerId = $g['ownerId'] ?? '';
            $premRaw = $ownerId ? getAPI('/premium/user/' . urlencode($ownerId), 5) : null;
            $isPremium = $premRaw['data']['isPremium'] ?? false;
            $isPro     = $premRaw['data']['isPro']     ?? false;
            $premUser  = $premRaw['data']['user']      ?? null;

            if ($isPremium || $isPro) {
                $result[] = [
                    'guildId'    => $g['id'],
                    'guildName'  => $g['name'],
                    'guildIcon'  => $g['icon'] ?? null,
                    'ownerId'    => $ownerId,
                    'tier'       => $isPro ? 'pro' : 'basic',
                    'expiresAt'  => $premUser['expires_at'] ?? null,
                ];
            }
        }

        echo json_encode(['success' => true, 'grants' => $result]);
        exit;
    }

    http_response_code(400);
    echo json_encode(['error' => 'Unbekannte Aktion']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$action = $_GET['action'] ?? 'activate';
$data   = json_decode(file_get_contents('php://input'), true) ?? [];

$guildId = trim((string)($data['guildId'] ?? ''));
$days    = max(1, min(3650, (int)($data['days'] ?? 30)));
$rawTier = trim((string)($data['tier'] ?? 'pro'));
$tier    = in_array($rawTier, ['basic', 'pro'], true) ? $rawTier : 'pro';

if (!$guildId || !preg_match('/^\d{17,20}$/', $guildId)) {
    http_response_code(400);
    echo json_encode(['error' => 'Ungültige Guild-ID']);
    exit;
}

// Resolve guild → owner ID
$guildsRaw = getAPI('/guilds', 8);
$guilds    = $guildsRaw['data']['guilds'] ?? [];
$guild     = null;
foreach ($guilds as $g) {
    if (($g['id'] ?? '') === $guildId) { $guild = $g; break; }
}

if (!$guild) {
    http_response_code(404);
    echo json_encode(['error' => 'Server nicht gefunden (Bot muss auf dem Server sein)']);
    exit;
}

$ownerId = trim((string)($guild['ownerId'] ?? ''));
if (!$ownerId || !preg_match('/^\d{17,20}$/', $ownerId)) {
    http_response_code(500);
    echo json_encode(['error' => 'Owner-ID konnte nicht ermittelt werden']);
    exit;
}

switch ($action) {
    case 'activate':
        $result    = api('/premium/activate', 'POST', ['userId' => $ownerId, 'daysValid' => $days, 'tier' => $tier]);
        $newExpiry = (new DateTime())->modify("+{$days} days")->format('Y-m-d');
        echo json_encode([
            'success'   => $result['data']['success'] ?? false,
            'guildId'   => $guildId,
            'guildName' => $guild['name'] ?? $guildId,
            'ownerId'   => $ownerId,
            'tier'      => $tier,
            'days'      => $days,
            'expiresAt' => $newExpiry,
            'message'   => ($result['data']['success'] ?? false)
                ? "✅ Premium ({$tier}, {$days} Tage) für «{$guild['name']}» aktiviert."
                : "❌ Aktivierung fehlgeschlagen.",
        ]);
        break;

    case 'extend':
        $info      = getAPI('/premium/user/' . urlencode($ownerId), 6);
        $daysValid = $days;
        if (!empty($info['data']['user']['expires_at'])) {
            $expiresAt = strtotime($info['data']['user']['expires_at']);
            $remaining = max(0, (int)ceil(($expiresAt - time()) / 86400));
            $daysValid = $remaining + $days;
        }
        $result    = api('/premium/activate', 'POST', ['userId' => $ownerId, 'daysValid' => $daysValid, 'tier' => $tier]);
        $newExpiry = (new DateTime())->modify("+{$daysValid} days")->format('Y-m-d');
        echo json_encode([
            'success'   => $result['data']['success'] ?? false,
            'guildId'   => $guildId,
            'guildName' => $guild['name'] ?? $guildId,
            'ownerId'   => $ownerId,
            'tier'      => $tier,
            'days'      => $days,
            'totalDays' => $daysValid,
            'expiresAt' => $newExpiry,
            'message'   => ($result['data']['success'] ?? false)
                ? "✅ Premium um {$days} Tage verlängert (neu bis {$newExpiry})."
                : "❌ Verlängerung fehlgeschlagen.",
        ]);
        break;

    case 'deactivate':
        $result = api('/premium/deactivate', 'POST', ['userId' => $ownerId]);
        echo json_encode([
            'success'   => $result['data']['success'] ?? false,
            'guildId'   => $guildId,
            'guildName' => $guild['name'] ?? $guildId,
            'ownerId'   => $ownerId,
            'message'   => ($result['data']['success'] ?? false)
                ? "✅ Premium für «{$guild['name']}» deaktiviert."
                : "❌ Deaktivierung fehlgeschlagen.",
        ]);
        break;

    default:
        http_response_code(400);
        echo json_encode(['error' => 'Unbekannte Aktion']);
}
