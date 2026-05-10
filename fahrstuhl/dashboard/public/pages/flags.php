<?php
$page_title = 'Feature Flags';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();

$message = '';
$messageType = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $flagName = trim($_POST['flagName'] ?? '');
    $enabled = ($_POST['enabled'] ?? '1') !== '0';

    if (empty($flagName)) {
        $message = 'Flag name is required';
        $messageType = 'error';
    } else {
        $result = api('/flags/set', 'POST', ['flagName' => $flagName, 'enabled' => $enabled]);
        if ($result['data']['success'] ?? false) {
            $message = "✅ Flag '$flagName' set to " . ($enabled ? 'ON' : 'OFF');
            $messageType = 'success';
        } else {
            $message = "Error: " . ($result['data']['message'] ?? 'Unknown error');
            $messageType = 'error';
        }
    }
}

$flagsRaw = getAPI('/flags/list');
$flags = $flagsRaw['data']['flags'] ?? [];
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<div class="page-header">
    <h1>🚩 Feature Flags</h1>
    <p class="subtitle">Control feature flags and experimental features</p>
</div>

<?php if ($message): ?>
    <div class="alert alert-<?php echo $messageType; ?>" style="margin-bottom:var(--sp-5); padding:12px 15px; border-radius:5px; border-left:4px solid; background:<?php echo $messageType==='success'?'#d4edda':'#f8d7da'; ?>; color:<?php echo $messageType==='success'?'#155724':'#721c24'; ?>;">
        <?php echo esc($message); ?>
    </div>
<?php endif; ?>

<div class="section">
    <h2>Global Flags (<?php echo count($flags); ?>)</h2>
    <?php if (empty($flags)): ?>
        <p style="color:#999; padding:1rem 0;">No flags configured yet.</p>
    <?php else: ?>
    <table class="table">
        <thead>
            <tr>
                <th>Flag Name</th>
                <th>Status</th>
                <th>Action</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($flags as $flag): ?>
                <?php $enabled = $flag['enabled'] !== false; ?>
                <tr>
                    <td><code><?php echo esc($flag['name']); ?></code></td>
                    <td>
                        <?php if ($enabled): ?>
                            <span style="color:#51cf66;">✓ ON</span>
                        <?php else: ?>
                            <span style="color:#ff6b6b;">✗ OFF</span>
                        <?php endif; ?>
                    </td>
                    <td>
                        <form method="POST" style="display:inline;">
                            <input type="hidden" name="flagName" value="<?php echo esc($flag['name']); ?>">
                            <input type="hidden" name="enabled" value="<?php echo $enabled ? '0' : '1'; ?>">
                            <button type="submit" class="btn-primary" style="padding:0.3rem 0.6rem; font-size:0.8rem; background:<?php echo $enabled ? '#ff6b6b' : '#51cf66'; ?>;">
                                <?php echo $enabled ? 'Disable' : 'Enable'; ?>
                            </button>
                        </form>
                    </td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
    <?php endif; ?>

    <h3 style="margin-top:2rem;">Add / Update Flag</h3>
    <form method="POST" class="form">
        <div class="form-group">
            <label>Flag Name</label>
            <input type="text" name="flagName" placeholder="e.g. PREMIUM_ENABLED" required>
        </div>
        <div class="form-group">
            <label>Status</label>
            <select name="enabled">
                <option value="1">Enabled (ON)</option>
                <option value="0">Disabled (OFF)</option>
            </select>
        </div>
        <button type="submit" class="btn-primary">Set Flag</button>
    </form>
</div>

<?php include '../includes/footer.php'; ?>

