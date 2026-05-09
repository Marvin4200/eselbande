<?php
require_once __DIR__ . '/includes/config.php';

$query = $_SERVER['QUERY_STRING'] ?? '';
$target = BASE_URL . '/index.php' . ($query !== '' ? ('?' . $query) : '');
header('Location: ' . $target);
exit();
