<?php
$page_title = 'Webhooks';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();

$message = '';
$messageType = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    if ($action === 'add') {
        $url = trim($_POST['url'] ?? '');
        $name = trim($_POST['name'] ?? '');
        $event = trim($_POST['event'] ?? 'command_executed');

        if (empty($url)) {
            $message = 'Webhook URL is required';
            $messageType = 'error';
        } else {
            $result = api('/webhooks/add', 'POST', ['url' => $url, 'name' => $name ?: $url, 'events' => [$event]]);
            if ($result['data']['success'] ?? false) {
                $message = '✅ Webhook added successfully';
                $messageType = 'success';
            } else {
                $message = "Error: " . ($result['data']['message'] ?? 'Unknown error');
                $messageType = 'error';
            }
        }
    } elseif ($action === 'remove') {
        $id = trim($_POST['id'] ?? '');
        if ($id) {
            $result = api('/webhooks/remove', 'POST', ['id' => $id]);
            if ($result['data']['success'] ?? false) {
                $message = '✅ Webhook removed';
                $messageType = 'success';
            } else {
                $message = "Error: " . ($result['data']['message'] ?? 'Unknown error');
                $messageType = 'error';
            }
        }
    }
}

$whRaw = getAPI('/webhooks/list');
$webhooks = $whRaw['data']['webhooks'] ?? [];
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<div class="page-header">
    <h1>🪝 Webhooks</h1>
    <p class="subtitle">Manage webhooks and integrations</p>
</div>

<?php if ($message): ?>
    <div class="alert alert-<?php echo $messageType; ?>" style="margin-bottom:20px; padding:12px 15px; border-radius:5px; border-left:4px solid; background:<?php echo $messageType==='success'?'#d4edda':'#f8d7da'; ?>; color:<?php echo $messageType==='success'?'#155724':'#721c24'; ?>;">
        <?php echo esc($message); ?>
    </div>
<?php endif; ?>

<div class="section">
    <h2>Add Webhook</h2>
    <form method="POST" class="form">
        <input type="hidden" name="action" value="add">
        <div class="form-group">
            <label>Name (optional)</label>
            <input type="text" name="name" placeholder="My Webhook">
        </div>
        <div class="form-group">
            <label>Webhook URL</label>
            <input type="url" name="url" placeholder="https://example.com/webhook" required>
        </div>
        <div class="form-group">
            <label>Event Type</label>
            <select name="event">
                <option value="command_executed">Command Executed</option>
                <option value="error">Error Occurred</option>
                <option value="user_action">User Action</option>
            </select>
        </div>
        <button type="submit" class="btn-primary">Add Webhook</button>
    </form>
</div>

<div class="section">
    <h2>Active Webhooks (<?php echo count($webhooks); ?>)</h2>
    <table class="table">
        <thead>
            <tr>
                <th>Name</th>
                <th>URL</th>
                <th>Events</th>
                <th>Created</th>
                <th>Action</th>
            </tr>
        </thead>
        <tbody>
            <?php if (empty($webhooks)): ?>
                <tr><td colspan="5" style="text-align:center; padding:2rem; color:#999;">No webhooks configured</td></tr>
            <?php else: ?>
                <?php foreach ($webhooks as $wh): ?>
                    <tr>
                        <td><?php echo esc($wh['name'] ?? ''); ?></td>
                        <td><small><?php echo esc($wh['url'] ?? ''); ?></small></td>
                        <td><?php echo esc(implode(', ', $wh['events'] ?? [])); ?></td>
                        <td><?php echo formatDate($wh['createdAt'] ?? null); ?></td>
                        <td>
                            <form method="POST" style="display:inline;">
                                <input type="hidden" name="action" value="remove">
                                <input type="hidden" name="id" value="<?php echo esc($wh['id'] ?? ''); ?>">
                                <button type="submit" class="btn-primary" style="padding:0.3rem 0.6rem; font-size:0.8rem; background:#ff6b6b;">Delete</button>
                            </form>
                        </td>
                    </tr>
                <?php endforeach; ?>
            <?php endif; ?>
        </tbody>
    </table>
</div>

<?php include '../includes/footer.php'; ?>

