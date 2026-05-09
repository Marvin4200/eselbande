<?php
// Simple image upload handler for dashboard embed images
require_once __DIR__ . '/../includes/config.php';

header('Content-Type: application/json');

if (!isLoggedIn()) {
    http_response_code(401);
    echo json_encode(['error' => 'Login required.']);
    exit;
}

$user = getUser();
$userId = preg_replace('/[^0-9]/', '', $user['id'] ?? '');
if ($userId === '') {
    http_response_code(401);
    echo json_encode(['error' => 'Login required.']);
    exit;
}

$targetDir = __DIR__ . '/../uploads/' . $userId . '/';
if (!is_dir($targetDir) && !mkdir($targetDir, 0755, true)) {
    http_response_code(500);
    echo json_encode(['error' => 'Upload directory unavailable.']);
    exit;
}

if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['error' => 'No file uploaded or upload error.']);
    exit;
}

$maxBytes = 5 * 1024 * 1024;
if (($_FILES['file']['size'] ?? 0) <= 0 || $_FILES['file']['size'] > $maxBytes) {
    http_response_code(413);
    echo json_encode(['error' => 'File too large. Maximum is 5 MB.']);
    exit;
}

$existingBytes = 0;
$existingFiles = glob($targetDir . '*') ?: [];
foreach ($existingFiles as $existingFile) {
    if (is_file($existingFile)) $existingBytes += filesize($existingFile);
}
if (count($existingFiles) >= 100 || $existingBytes + (int)$_FILES['file']['size'] > 50 * 1024 * 1024) {
    http_response_code(413);
    echo json_encode(['error' => 'Upload quota reached. Delete old images or use smaller files.']);
    exit;
}

$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = $finfo ? finfo_file($finfo, $_FILES['file']['tmp_name']) : '';
if ($finfo) finfo_close($finfo);

$extensions = [
    'image/png' => 'png',
    'image/jpeg' => 'jpg',
    'image/gif' => 'gif',
    'image/webp' => 'webp',
];
if (!isset($extensions[$mime])) {
    http_response_code(415);
    echo json_encode(['error' => 'Invalid file type.']);
    exit;
}

$filename = bin2hex(random_bytes(16)) . '.' . $extensions[$mime];
$targetFile = $targetDir . $filename;

if (!move_uploaded_file($_FILES['file']['tmp_name'], $targetFile)) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to move uploaded file.']);
    exit;
}

$url = BASE_URL . '/uploads/' . $userId . '/' . $filename;
echo json_encode(['url' => $url]);
