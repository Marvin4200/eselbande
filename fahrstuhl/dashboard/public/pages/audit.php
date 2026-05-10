<?php
$page_title = 'Audit';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();

$q = trim($_GET['q'] ?? '');
$limit = min(max((int)($_GET['limit'] ?? 100), 1), 1000);
$raw = getAPI('/audit/list?limit=' . $limit . '&q=' . urlencode($q));
$entries = $raw['data']['entries'] ?? [];
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<div class="page-header">
    <h1>🧾 Audit</h1>
    <p class="subtitle">Admin mutations coming from the dashboard</p>
</div>

<div class="section" style="padding:14px 18px;">
    <form method="GET" style="display:flex; gap:var(--sp-3); flex-wrap:wrap;">
        <input name="q" value="<?php echo esc($q); ?>" placeholder="Search actor, path, user id..." style="padding:var(--sp-2) var(--sp-3); border-radius:6px; border:1px solid #333; background:#1a1a2e; color:#e0e0e0; min-width:260px;">
        <select name="limit" style="padding:var(--sp-2) var(--sp-3); border-radius:6px; border:1px solid #333; background:#1a1a2e; color:#e0e0e0;">
            <?php foreach ([50,100,250,500,1000] as $n): ?>
                <option value="<?php echo $n; ?>" <?php echo $limit === $n ? 'selected' : ''; ?>>Last <?php echo $n; ?></option>
            <?php endforeach; ?>
        </select>
        <button class="btn-primary" style="padding:8px 14px;">Filter</button>
    </form>
</div>

<div class="section">
    <h2>Entries</h2>
    <table class="table">
        <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Status</th><th>Body</th></tr></thead>
        <tbody>
            <?php foreach ($entries as $entry): ?>
            <tr>
                <td style="white-space:nowrap;"><?php echo esc(isset($entry['timestamp']) ? date('d.m H:i:s', strtotime($entry['timestamp'])) : '—'); ?></td>
                <td><?php echo esc($entry['actor'] ?? 'dashboard'); ?><br><small style="color:#666;"><?php echo esc($entry['actorId'] ?? ''); ?></small></td>
                <td><code><?php echo esc(($entry['method'] ?? '') . ' ' . ($entry['path'] ?? '')); ?></code></td>
                <td style="color:<?php echo ((int)($entry['status'] ?? 0) < 400) ? '#51cf66' : '#ff6b6b'; ?>; font-weight:700;"><?php echo esc($entry['status'] ?? ''); ?></td>
                <td><pre style="white-space:pre-wrap; font-size:.78rem; color:#aaa; max-width:420px;"><?php echo esc(json_encode($entry['body'] ?? [], JSON_PRETTY_PRINT)); ?></pre></td>
            </tr>
            <?php endforeach; ?>
            <?php if (empty($entries)): ?><tr><td colspan="5" style="text-align:center;color:#999;">No audit entries yet</td></tr><?php endif; ?>
        </tbody>
    </table>
</div>

<?php include '../includes/footer.php'; ?>
