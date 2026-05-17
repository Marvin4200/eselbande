<?php
/**
 * Router für PHP's built-in Server.
 *
 * Strippt das `/fahrstuhl` Path-Prefix, damit URLs wie
 *   /fahrstuhl/index.php?code=...
 *   /fahrstuhl/pages/analytics.php
 *   /fahrstuhl/assets/css/style.css
 * korrekt auf Dateien unterhalb von dashboard/public/ gemappt werden.
 *
 * Wird via `php -S 0.0.0.0:8081 -t dashboard/public router.php` gestartet.
 */

$docRoot = __DIR__;
$prefix = getenv('DASHBOARD_BASE_URL') ?: '/fahrstuhl';
$prefix = '/' . trim($prefix, '/');
if ($prefix === '//') $prefix = '/';
$legacyPrefix = '/eselcore';

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';

// Lightweight health endpoint for dashboard-php process monitoring.
if ($uri === '/health' || $uri === '/fahrstuhl/health' || $uri === '/eselcore/health') {
    header('Content-Type: application/json');
    echo json_encode([
        'status' => 'ok',
        'service' => 'dashboard-php',
        'pid' => getmypid(),
        'time' => date('c'),
    ]);
    return true;
}

// Legacy rebranding redirect: /eselcore -> configured BASE_URL (default /fahrstuhl)
if ($legacyPrefix !== $prefix && (strpos($uri, $legacyPrefix . '/') === 0 || $uri === $legacyPrefix)) {
    $suffix = substr($uri, strlen($legacyPrefix));
    if ($suffix === false || $suffix === '') $suffix = '/';
    $targetPath = rtrim($prefix, '/') . $suffix;
    if ($targetPath === '') $targetPath = '/';
    $query = $_SERVER['QUERY_STRING'] ?? '';
    header('Location: ' . $targetPath . ($query !== '' ? ('?' . $query) : ''), true, 301);
    return true;
}

// Prefix entfernen, falls vorhanden (Reverse-Proxy oder direkter Aufruf)
if (strpos($uri, $prefix . '/') === 0 || $uri === $prefix) {
    $uri = substr($uri, strlen($prefix));
    if ($uri === '' || $uri === false) {
        $uri = '/';
    }
}

// Default-Dokument
if (substr($uri, -1) === '/') {
    $uri .= 'index.php';
}

// Clean-URL-Aliases → interne PHP-Datei (ohne Präfix-Stripping, da bereits erledigt)
$_clean_aliases = [
    '/eselmusic' => '/pages/eselmusic.php',
];
if (isset($_clean_aliases[$uri])) {
    $uri = $_clean_aliases[$uri];
}
unset($_clean_aliases);

// URL-Decode für Dateisystem-Lookup
$decoded = urldecode($uri);
$path    = $docRoot . $decoded;

// Path-Traversal verhindern
$realPath    = realpath($path);
$realDocRoot = realpath($docRoot);
if ($realPath === false || strpos($realPath, $realDocRoot) !== 0) {
    http_response_code(404);
    echo 'Not Found';
    return true;
}

// Verzeichnis → index.php
if (is_dir($realPath)) {
    $candidate = rtrim($realPath, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'index.php';
    if (!is_file($candidate)) {
        http_response_code(404);
        echo 'Not Found';
        return true;
    }
    $realPath = $candidate;
    if (substr($uri, -1) !== '/') {
        $uri .= '/';
    }
    $uri .= 'index.php';
}

// PHP-Datei → ausführen
if (strtolower(substr($realPath, -4)) === '.php') {
    $_SERVER['SCRIPT_NAME']     = $uri;
    $_SERVER['SCRIPT_FILENAME'] = $realPath;
    $_SERVER['PHP_SELF']        = $uri;
    chdir(dirname($realPath));
    require $realPath;
    return true;
}

// Statische Datei → mit MIME-Type ausliefern
$mimes = [
    'css'   => 'text/css',
    'js'    => 'application/javascript',
    'mjs'   => 'application/javascript',
    'json'  => 'application/json',
    'map'   => 'application/json',
    'html'  => 'text/html; charset=utf-8',
    'htm'   => 'text/html; charset=utf-8',
    'txt'   => 'text/plain; charset=utf-8',
    'xml'   => 'application/xml',
    'svg'   => 'image/svg+xml',
    'png'   => 'image/png',
    'jpg'   => 'image/jpeg',
    'jpeg'  => 'image/jpeg',
    'gif'   => 'image/gif',
    'webp'  => 'image/webp',
    'ico'   => 'image/x-icon',
    'woff'  => 'font/woff',
    'woff2' => 'font/woff2',
    'ttf'   => 'font/ttf',
    'otf'   => 'font/otf',
    'eot'   => 'application/vnd.ms-fontobject',
    'pdf'   => 'application/pdf',
];
$ext = strtolower(pathinfo($realPath, PATHINFO_EXTENSION));
header('Content-Type: ' . ($mimes[$ext] ?? 'application/octet-stream'));
header('Content-Length: ' . filesize($realPath));
readfile($realPath);
return true;
