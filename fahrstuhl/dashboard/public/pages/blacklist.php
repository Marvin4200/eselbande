<?php
$page_title = 'Blacklist';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();

$message = '';
$messageType = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    $userId = trim($_POST['userid'] ?? '');

    if (empty($userId)) {
        $message = 'User ID is required';
        $messageType = 'error';
    } elseif ($action === 'add') {
        $reason = trim($_POST['reason'] ?? 'No reason specified');
        $result = api('/blacklist/add', 'POST', ['userId' => $userId, 'reason' => $reason]);
        if ($result['data']['success'] ?? false) {
            $message = "✅ User $userId added to blacklist";
            $messageType = 'success';
        } else {
            $message = "Error: " . ($result['data']['message'] ?? 'Unknown error');
            $messageType = 'error';
        }
    } elseif ($action === 'remove') {
        $result = api('/blacklist/remove', 'POST', ['userId' => $userId]);
        if ($result['data']['success'] ?? false) {
            $message = "✅ User $userId removed from blacklist";
            $messageType = 'success';
        } else {
            $message = "Error: " . ($result['data']['message'] ?? 'Unknown error');
            $messageType = 'error';
        }
    }
}

$listRaw = getAPI('/blacklist/list');
$blacklist = $listRaw['data']['blacklist'] ?? [];
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<div class="page-header">
    <h1>🚫 Blacklist Management</h1>
    <p class="subtitle">Manage blacklisted users</p>
</div>

<?php if ($message): ?>
    <div class="alert alert-<?php echo $messageType; ?>" style="margin-bottom:var(--sp-5); padding:12px 15px; border-radius:5px; border-left:4px solid; background:<?php echo $messageType==='success'?'#d4edda':'#f8d7da'; ?>; color:<?php echo $messageType==='success'?'#155724':'#721c24'; ?>;">
        <?php echo esc($message); ?>
    </div>
<?php endif; ?>

<div class="section">
    <h2>Add User to Blacklist</h2>
    <form method="POST" class="form">
        <input type="hidden" name="action" value="add">
        <div class="form-group">
            <label>User ID</label>
            <input type="text" name="userid" placeholder="Discord User ID" required>
        </div>
        <div class="form-group">
            <label>Reason</label>
            <input type="text" name="reason" placeholder="Blacklist reason">
        </div>
        <button type="submit" class="btn-primary">Add to Blacklist</button>
    </form>
</div>

<div class="section">
    <h2>Blacklisted Users (<?php echo count($blacklist); ?>)</h2>
    <table class="table">
        <thead>
            <tr>
                <th>User ID</th>
                <th>Reason</th>
                <th>Type</th>
                <th>Added</th>
                <th>Action</th>
            </tr>
        </thead>
        <tbody>
            <?php if (empty($blacklist)): ?>
                <tr><td colspan="5" style="text-align:center; padding:1.5rem; color:#999;">No blacklisted users</td></tr>
            <?php else: ?>
                <?php foreach ($blacklist as $entry): ?>
                    <?php $uid = $entry['userId'] ?? $entry['user_id'] ?? ''; ?>
                    <tr>
                        <td><code><?php echo esc($uid); ?></code></td>
                        <td><?php echo esc($entry['reason'] ?? 'N/A'); ?></td>
                        <td><?php echo esc($entry['type'] ?? 'global'); ?></td>
                        <td><?php echo formatDate($entry['createdAt'] ?? $entry['addedAt'] ?? $entry['timestamp'] ?? null); ?></td>
                        <td>
                            <form method="POST" style="display:inline;">
                                <input type="hidden" name="action" value="remove">
                                <input type="hidden" name="userid" value="<?php echo esc($uid); ?>">
                                <button type="submit" class="btn-primary" style="padding:0.3rem 0.6rem; font-size:0.8rem; background:#ff6b6b;">Remove</button>
                            </form>
                        </td>
                    </tr>
                <?php endforeach; ?>
            <?php endif; ?>
        </tbody>
    </table>
</div>

<?php include '../includes/footer.php'; ?>

