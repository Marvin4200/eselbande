<?php
/**
 * Shield API Handler (AJAX endpoint for admin)
 * Proxies shield operations to the bot API at port 3002
 */
require_once __DIR__ . '/../includes/config.php';
requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

header('Content-Type: application/json');

$action = $_GET['action'] ?? null;
$data   = json_decode(file_get_contents('php://input'), true) ?? [];
$userId = trim($data['userId'] ?? '');
$amount = max(1, (int)($data['amount'] ?? 1));

if (!$userId) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'userId required']);
    exit;
}

switch ($action) {
    case 'give':
        $result = api('/shields/give', 'POST', ['userId' => $userId, 'amount' => $amount]);
        echo json_encode([
            'success'      => $result['data']['success'] ?? isset($result['data']['shieldsOwned']),
            'message'      => "+$amount shields given",
            'data'         => $result['data'] ?? [],
        ]);
        break;

    case 'take':
        $result = api('/shields/take', 'POST', ['userId' => $userId, 'amount' => $amount]);
        echo json_encode([
            'success'      => $result['data']['success'] ?? isset($result['data']['shieldsOwned']),
            'message'      => "-$amount shields taken",
            'data'         => $result['data'] ?? [],
        ]);
        break;

    case 'clear-active':
        $result = api('/shields/clear-active', 'POST', ['userId' => $userId]);
        echo json_encode([
            'success' => $result['data']['success'] ?? false,
            'message' => 'Active shield cleared',
            'data'    => $result['data'] ?? [],
        ]);
        break;

    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Unknown action']);
        break;
}
