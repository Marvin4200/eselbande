<?php
/**
 * Dashboard Configuration & Helper Functions
 */
error_reporting(E_ALL);
ini_set('display_errors', 0);

// Load dashboard-local env first, then repo-root env for shared bot secrets.
foreach ([__DIR__ . '/../../.env', __DIR__ . '/../../../.env'] as $env_file) {
    if (!file_exists($env_file)) continue;
    $lines = file($env_file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) continue;
        list($key, $value) = explode('=', $line, 2);
        $key = trim($key);
        if (getenv($key) !== false) continue;
        putenv($key . '=' . trim($value));
    }
}

define('API_BASE', getenv('FAHRSTUHL_API_BASE') ?: 'http://localhost:3002');
$baseUrl = getenv('DASHBOARD_BASE_URL') ?: '/fahrstuhl';
$baseUrl = '/' . trim($baseUrl, '/');
if ($baseUrl === '//') $baseUrl = '/';
define('BASE_URL', $baseUrl);
define('SESSION_TIMEOUT', 3600);

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Security headers — set before any output
// CSP intentionally omitted (inline scripts in use; separate hardening step).
if (!headers_sent()) {
    header('X-Frame-Options: SAMEORIGIN');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: geolocation=(), microphone=(), camera=()');
}

// Language system
require_once __DIR__ . '/lang.php';
if (!headers_sent() && isset($_GET['setlang'])) {
    dashboardSetLang((string)$_GET['setlang']);
    $ref  = trim($_SERVER['HTTP_REFERER'] ?? '');
    $safe = $ref !== '' ? preg_replace('/([?&])setlang=[^&]*/i', '', $ref) : '';
    $safe = rtrim($safe, '?&') ?: (BASE_URL . '/index.php');
    header('Location: ' . $safe);
    exit;
}

function dashboardCsrfToken() {
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function dashboardCsrfInput() {
    return '<input type="hidden" name="csrf_token" value="' . esc(dashboardCsrfToken()) . '">';
}

function dashboardCsrfProvidedToken() {
    $headerToken = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if ($headerToken !== '') return $headerToken;

    $postToken = $_POST['csrf_token'] ?? '';
    if ($postToken !== '') return $postToken;

    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($contentType, 'application/json') !== false) {
        $body = json_decode(file_get_contents('php://input'), true);
        if (is_array($body) && !empty($body['csrf_token'])) {
            return (string)$body['csrf_token'];
        }
    }

    return '';
}

function verifyDashboardCsrf() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') return;
    if (!isset($_SESSION['user'])) return;
    $expected = $_SESSION['csrf_token'] ?? '';
    $provided = dashboardCsrfProvidedToken();
    if (!$expected || !$provided || !hash_equals($expected, $provided)) {
        http_response_code(419);
        exit('Invalid CSRF token');
    }
}

function dashboardInjectCsrf($html) {
    if (stripos($html, '<form') === false || !preg_match('/<form\b[^>]*\bmethod\s*=\s*["\']?post["\']?/i', $html)) {
        return $html;
    }
    $tokenInput = dashboardCsrfInput();
    return preg_replace_callback('/<form\b([^>]*)>/i', function ($matches) use ($tokenInput) {
        $attrs = $matches[1] ?? '';
        if (!preg_match('/\bmethod\s*=\s*["\']?post["\']?/i', $attrs)) return $matches[0];
        if (preg_match('/\bdata-no-csrf\b/i', $attrs)) return $matches[0];
        return $matches[0] . $tokenInput;
    }, $html);
}

if (!defined('DASHBOARD_CSRF_BUFFER_STARTED')) {
    define('DASHBOARD_CSRF_BUFFER_STARTED', true);
    ob_start('dashboardInjectCsrf');
}

if (isset($_SESSION['last_activity']) && time() - $_SESSION['last_activity'] > SESSION_TIMEOUT) {
    session_destroy();
    header('Location: ' . BASE_URL . '/index.php');
    exit();
}

if (isset($_SESSION['user'])) {
    $_SESSION['last_activity'] = time();
}

verifyDashboardCsrf();

function isLoggedIn() { return isset($_SESSION['user']); }
function requireLogin() { if (!isLoggedIn()) { header('Location: ' . BASE_URL . '/index.php'); exit(); } }
function getUser() { return $_SESSION['user'] ?? null; }
function esc($s) { return htmlspecialchars($s ?? '', ENT_QUOTES, 'UTF-8'); }
function formatNum($n) { return number_format((int)$n, 0, ',', '.'); }
function formatDate($ts) { return $ts ? date('d.m.Y H:i', strtotime($ts)) : 'N/A'; }

function isOwner() {
    $u = getUser();
    $ownerId = getenv('OWNER_ID') ?: '740958995887685696';
    return $u && $u['id'] === $ownerId;
}

function dashboardViewMode() {
    return $_SESSION['dashboard_view_mode'] ?? 'admin';
}

function isAdmin() {
    return isOwner() && dashboardViewMode() === 'admin';
}

function requireAdmin() {
    requireLogin();
    if (!isAdmin()) { header('Location: ' . BASE_URL . '/pages/portal.php'); exit(); }
}

if (isset($_GET['view_mode']) && isOwner()) {
    $mode = $_GET['view_mode'] === 'user' ? 'user' : 'admin';
    $_SESSION['dashboard_view_mode'] = $mode;
    $target = $mode === 'admin' ? BASE_URL . '/pages/cockpit.php' : BASE_URL . '/pages/portal.php';
    header('Location: ' . $target);
    exit();
}

function isServerAdmin($guildId) {
    $guilds = getUserGuilds();
    foreach ($guilds as $g) {
        if ($g['id'] === $guildId) {
            return ($g['permissions'] & 0x8) === 0x8 || ($g['permissions'] & 0x20) === 0x20;
        }
    }
    return false;
}

function refreshUserGuildsIfNeeded() {
    if (!isLoggedIn()) return;
    $token = $_SESSION['discord_access_token'] ?? '';
    if ($token === '') return;
    
    // Wenn Guilds fresh sind (<5 Minuten), nicht neu fetchen
    if (time() - (int)($_SESSION['user_guilds_fetched_at'] ?? 0) < 300) return;

    $ch = curl_init('https://discord.com/api/users/@me/guilds');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 3);  // Nur 3 Sekunden warten
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);  // 2 Sekunden Connection-Timeout
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $token]);
    $response = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    // Nur aktualisieren wenn erfolgreich und schnell
    if ($status >= 200 && $status < 300) {
        $guilds = json_decode($response ?: '[]', true);
        if (is_array($guilds)) {
            $_SESSION['user_guilds'] = $guilds;
            $_SESSION['user_guilds_fetched_at'] = time();
            return;
        }
    }
    // Bei Fehler: Behalte gecachte Guilds und versuche nicht erneut
}

function getUserGuilds() {
    refreshUserGuildsIfNeeded();
    return $_SESSION['user_guilds'] ?? [];
}

function dashboardSelectedGuildId($guilds = []) {
    $requested = trim($_GET['guildId'] ?? ($_POST['guildId'] ?? ''));
    $validIds = [];
    foreach ($guilds as $g) {
        if (!empty($g['id'])) $validIds[$g['id']] = true;
    }

    if ($requested !== '' && (empty($validIds) || isset($validIds[$requested]))) {
        $_SESSION['selected_guild_id'] = $requested;
        return $requested;
    }

    $saved = trim($_SESSION['selected_guild_id'] ?? '');
    if ($saved !== '' && (empty($validIds) || isset($validIds[$saved]))) {
        return $saved;
    }

    if (!empty($guilds[0]['id'])) {
        $_SESSION['selected_guild_id'] = $guilds[0]['id'];
        return $guilds[0]['id'];
    }

    unset($_SESSION['selected_guild_id']);
    return '';
}

function dashboardSelectedGuildQuery($params = []) {
    $guildId = trim($params['guildId'] ?? ($_SESSION['selected_guild_id'] ?? ''));
    if ($guildId !== '') $params['guildId'] = $guildId;
    return $params ? '?' . http_build_query($params) : '';
}

function dashboardPageUrl($page, $params = [], $withGuild = true) {
    $query = $withGuild ? dashboardSelectedGuildQuery($params) : ($params ? '?' . http_build_query($params) : '');
    return BASE_URL . '/pages/' . $page . '.php' . $query;
}

function dashboardActivityStreamAuth($guildId, $expiresIn = 1800) {
    $guildId = trim((string)$guildId);
    $viewer = getUser();
    $viewerId = trim((string)($viewer['id'] ?? ''));
    $dashboardMode = dashboardViewMode() === 'user' ? 'user' : 'admin';
    $expiresAt = time() + max(60, min(3600, (int)$expiresIn));
    $secret = (string)(getenv('BOT_API_TOKEN') ?: '');

    if ($guildId === '' || $viewerId === '' || $secret === '') {
        return [
            'viewerId' => $viewerId,
            'dashboardMode' => $dashboardMode,
            'expiresAt' => $expiresAt,
            'signature' => '',
        ];
    }

    $payload = $guildId . ':' . $viewerId . ':' . $dashboardMode . ':' . $expiresAt;
    return [
        'viewerId' => $viewerId,
        'dashboardMode' => $dashboardMode,
        'expiresAt' => $expiresAt,
        'signature' => hash_hmac('sha256', $payload, $secret),
    ];
}

function dashboardHeaders($json = false) {
    $headers = $json ? ['Content-Type: application/json'] : [];
    $token = getenv('BOT_API_TOKEN') ?: '';
    if ($token !== '') $headers[] = 'Authorization: Bearer ' . $token;
    $user = getUser();
    if ($user) {
        if (!empty($user['id'])) $headers[] = 'X-Dashboard-User-Id: ' . $user['id'];
        if (!empty($user['username'])) $headers[] = 'X-Dashboard-User: ' . $user['username'];
    }
    $headers[] = 'X-Dashboard-Mode: ' . dashboardViewMode();
    return $headers;
}

function getAPI($endpoint, $timeout = 10) {
    $ch = curl_init(API_BASE . $endpoint);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
    $headers = dashboardHeaders(false);
    if (!empty($headers)) curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    $r = curl_exec($ch);
    $err = curl_error($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($r === false) {
        return ['success' => false, 'error' => $err ?: 'API request failed', 'status' => 0];
    }
    $decoded = json_decode($r, true);
    if (!is_array($decoded)) {
        return ['success' => false, 'error' => 'Invalid API response', 'status' => $status];
    }
    if ($status >= 400 && !isset($decoded['success'])) {
        $decoded['success'] = false;
        $decoded['status'] = $status;
    }
    return $decoded;
}

function api($endpoint, $method = 'GET', $data = null, $timeout = 10) {
    $ch = curl_init(API_BASE . $endpoint);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
    curl_setopt($ch, CURLOPT_HTTPHEADER, dashboardHeaders(true));
    
    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, 1);
        if ($data) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    }
    
    $r = curl_exec($ch);
    $s = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($r === false) {
        return ['status' => 0, 'data' => ['success' => false, 'message' => $err ?: 'API request failed']];
    }
    $decoded = json_decode($r, true);
    if (!is_array($decoded)) {
        $decoded = ['success' => false, 'message' => 'Invalid API response'];
    }
    return ['status' => $s, 'data' => $decoded];
}

function currentPage() {
    $p = basename($_SERVER['PHP_SELF'], '.php');
    return $p === 'index' ? 'analytics' : $p;
}
