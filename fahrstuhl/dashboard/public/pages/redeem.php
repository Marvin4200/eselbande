<?php
$page_title = 'Redeem Code';
require_once __DIR__ . '/../includes/config.php';
requireLogin();

$user = getUser();
$message = '';
$messageType = 'success';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $code = trim($_POST['code'] ?? '');
    if ($code === '') {
        $message = 'Bitte gib einen Code ein.';
        $messageType = 'error';
    } else {
        $result = api('/monetization/promos/redeem', 'POST', [
            'code' => $code,
            'userId' => $user['id'],
        ]);
        if ($result['data']['success'] ?? false) {
            $message = 'Code erfolgreich eingelöst.';
            $messageType = 'success';
        } else {
            $message = $result['data']['message'] ?? 'Code konnte nicht eingelöst werden.';
            $messageType = 'error';
        }
    }
}
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.redeem-box { max-width:560px; background:var(--bg-secondary); border:1px solid var(--border-light); border-radius:12px; padding:1.5rem; }
.alert { padding:12px 15px; border-radius:8px; border-left:4px solid; margin-bottom:20px; }
.alert-success { background:rgba(81,207,102,.12); color:#51cf66; border-color:#51cf66; }
.alert-error { background:rgba(255,107,107,.12); color:#ff6b6b; border-color:#ff6b6b; }
</style>

<div class="page-header">
    <h1>🎟️ Redeem Code</h1>
    <p class="subtitle">Löse Premium- oder Shield-Codes für deinen Account ein.</p>
</div>

<?php if ($message): ?>
    <div class="alert alert-<?php echo esc($messageType); ?>"><?php echo esc($message); ?></div>
<?php endif; ?>

<div class="redeem-box">
    <form method="POST" class="form">
        <div class="form-group">
            <label>Promo-Code</label>
            <input name="code" placeholder="z.B. PREMIUM30" autocomplete="one-time-code" required>
        </div>
        <button class="btn-primary" type="submit">✅ Code einlösen</button>
    </form>
</div>

<?php include '../includes/footer.php'; ?>
