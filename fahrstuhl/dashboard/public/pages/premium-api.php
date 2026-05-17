<?php
/**
 * Premium API Handler (AJAX endpoint)
 * Proxies premium operations to the bot API at port 3002
 */

require_once __DIR__ . '/../includes/config.php';
requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

header('Content-Type: application/json');

$action = $_GET['action'] ?? null;
$data = json_decode(file_get_contents('php://input'), true) ?? [];
$userId = trim((string)($data['userId'] ?? ''));
$days = max(1, (int)($data['days'] ?? 30));
$tier = trim((string)($data['tier'] ?? 'pro'));
$allowedTiers = ['basic', 'pro'];
if (!in_array($tier, $allowedTiers, true)) $tier = 'pro';

if (!$userId) {
    http_response_code(400);
    echo json_encode(['error' => 'User ID required']);
    exit;
}
if (!preg_match('/^\d{17,20}$/', $userId)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid user ID format']);
    exit;
}

switch ($action) {
    case 'extend':
        // Get current expiry, add days on top
        $info = getAPI("/premium/user/$userId");
        $daysValid = $days;
        if (!empty($info['data']['user']['expires_at'])) {
            $expiresAt = strtotime($info['data']['user']['expires_at']);
            $remaining = max(0, (int)ceil(($expiresAt - time()) / 86400));
            $daysValid = $remaining + $days;
        }
        $result = api('/premium/activate', 'POST', ['userId' => $userId, 'daysValid' => $daysValid, 'tier' => $tier]);
        $newExpiry = (new DateTime())->modify("+$daysValid days")->format('Y-m-d');
        echo json_encode([
            'success' => $result['data']['success'] ?? false,
            'message' => "Premium extended by $days days",
            'userId' => $userId,
            'newExpiresAt' => $newExpiry,
            'tier' => $tier,
        ]);
        break;

    case 'renew':
        $result = api('/premium/activate', 'POST', ['userId' => $userId, 'daysValid' => $days, 'tier' => $tier]);
        $newExpiry = (new DateTime())->modify("+$days days")->format('Y-m-d');
        echo json_encode([
            'success' => $result['data']['success'] ?? false,
            'message' => "Premium renewed for $days days",
            'userId' => $userId,
            'newExpiresAt' => $newExpiry,
            'tier' => $tier,
        ]);
        break;

    case 'activate':
        $result = api('/premium/activate', 'POST', ['userId' => $userId, 'daysValid' => $days, 'tier' => $tier]);
        $newExpiry = (new DateTime())->modify("+$days days")->format('Y-m-d');
        echo json_encode([
            'success' => $result['data']['success'] ?? false,
            'message' => "Premium activated for $days days",
            'userId' => $userId,
            'expiresAt' => $newExpiry,
            'daysValid' => $days,
            'tier' => $tier,
        ]);
        break;
    case 'deactivate':
        $result = api('/premium/deactivate', 'POST', ['userId' => $userId]);
        echo json_encode([
            'success' => $result['data']['success'] ?? false,
            'message' => 'Premium deactivated',
            'userId' => $userId,
        ]);
        break;
    case 'status':
        $result = getAPI('/premium/user/' . urlencode($userId));
        $user = $result['data']['user'] ?? null;
        echo json_encode([
            'success' => $user !== null,
            'userId' => $userId,
            'premium' => $user,
        ]);
        break;

    default:
        http_response_code(400);
        echo json_encode(['error' => 'Unknown action']);
        break;
}

