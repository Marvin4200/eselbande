<?php
$page_title = 'Premium Management';
require_once __DIR__ . '/../includes/config.php';
requireAdmin();

$message = '';
$messageType = '';
$premiumUsers = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action   = $_POST['action'] ?? '';
    $userId   = trim($_POST['user_id'] ?? '');
    $daysValid = max(1, intval($_POST['days'] ?? 365));
    $tier     = in_array($_POST['tier'] ?? '', ['basic', 'pro']) ? $_POST['tier'] : 'basic';

    if (empty($userId)) {
        $message = 'User ID is required';
        $messageType = 'error';
    } else {
        if ($action === 'activate') {
            $result = api('/premium/activate', 'POST', ['userId' => $userId, 'daysValid' => $daysValid, 'tier' => $tier]);
            if ($result['data']['success'] ?? false) {
                $tierLabel = $tier === 'pro' ? '👑 Pro' : '💎 Premium';
                $message = "✅ $tierLabel activated for $userId ($daysValid days)";
                $messageType = 'success';
            } else {
                $message = "Error: " . ($result['data']['message'] ?? 'Unknown error');
                $messageType = 'error';
            }
        } elseif ($action === 'upgrade_pro') {
            $result = api('/premium/activate', 'POST', ['userId' => $userId, 'daysValid' => $daysValid, 'tier' => 'pro']);
            if ($result['data']['success'] ?? false) {
                $message = "👑 Upgraded $userId to Pro ($daysValid days)";
                $messageType = 'success';
            } else {
                $message = "Error: " . ($result['data']['message'] ?? 'Unknown error');
                $messageType = 'error';
            }
        } elseif ($action === 'downgrade_basic') {
            $result = api('/premium/activate', 'POST', ['userId' => $userId, 'daysValid' => $daysValid, 'tier' => 'basic']);
            if ($result['data']['success'] ?? false) {
                $message = "💎 Downgraded $userId to Basic Premium ($daysValid days)";
                $messageType = 'success';
            } else {
                $message = "Error: " . ($result['data']['message'] ?? 'Unknown error');
                $messageType = 'error';
            }
        } elseif ($action === 'deactivate') {
            $result = api('/premium/deactivate', 'POST', ['userId' => $userId]);
            if ($result['data']['success'] ?? false) {
                $message = "❌ Premium removed for $userId";
                $messageType = 'success';
            } else {
                $message = "Error: " . ($result['data']['message'] ?? 'Unknown error');
                $messageType = 'error';
            }
        }
    }
}

// Fetch premium users
$response = getAPI('/premium/users');
if (!empty($response['data']['users'])) {
    $premiumUsers = $response['data']['users'];
}
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<style>
.alert { padding: 12px 15px; border-radius: 8px; border-left: 4px solid; margin-bottom: 20px; }
.alert-success { background: rgba(81,207,102,.12); color: #51cf66; border-color: #51cf66; }
.alert-error { background: rgba(255,107,107,.12); color: #ff6b6b; border-color: #ff6b6b; }

.tier-select { display: flex; gap: .5rem; }
.tier-btn { flex: 1; padding: .6rem; border: 2px solid var(--border); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary); cursor: pointer; font-size: .9rem; font-weight: 600; transition: border-color .15s, background .15s; text-align: center; }
.tier-btn:hover { border-color: var(--primary); }
input[name="tier"][value="basic"]:checked ~ .tier-select .tier-btn-basic,
input[name="tier"][value="pro"]:checked ~ .tier-select .tier-btn-pro { display: none; }

.tier-badge { display: inline-flex; align-items: center; gap: .3rem; padding: .2rem .6rem; border-radius: 999px; font-size: .78rem; font-weight: 700; }
.tier-basic { background: rgba(102,126,234,.15); border: 1px solid #667eea; color: #667eea; }
.tier-pro   { background: rgba(255,215,0,.15); border: 1px solid #ffd700; color: #ffd700; }

.btn-sm { padding: .25rem .55rem; font-size: .78rem; border-radius: 6px; border: none; cursor: pointer; font-weight: 600; }
.btn-upgrade { background: rgba(255,215,0,.15); color: #ffd700; border: 1px solid #ffd700; }
.btn-upgrade:hover { background: rgba(255,215,0,.25); }
.btn-downgrade { background: rgba(102,126,234,.15); color: #667eea; border: 1px solid #667eea; }
.btn-downgrade:hover { background: rgba(102,126,234,.25); }
.btn-remove { background: rgba(255,107,107,.15); color: #ff6b6b; border: 1px solid #ff6b6b; }
.btn-remove:hover { background: rgba(255,107,107,.25); }

.actions-cell { display: flex; gap: .35rem; flex-wrap: wrap; }
</style>

<div class="page-header">
    <h1>💎 Premium Management</h1>
    <p class="subtitle">Manage user premium subscriptions and tiers</p>
</div>

<?php if ($message): ?>
    <div class="alert alert-<?php echo $messageType; ?>">
        <?php echo esc($message); ?>
    </div>
<?php endif; ?>

<!-- Activate Form -->
<div class="section">
    <h2>Activate / Upgrade Premium</h2>
    <form method="POST" class="form">
        <div class="form-group">
            <label for="user_id">Discord User ID</label>
            <input type="text" id="user_id" name="user_id" placeholder="z.B. 123456789012345678" required>
        </div>

        <div class="form-group">
            <label>Tier</label>
            <div class="tier-select" id="tierSelect">
                <label class="tier-btn" id="tierBasicBtn" style="cursor:pointer;">
                    <input type="radio" name="tier" value="basic" checked style="display:none;">
                    💎 Basic Premium
                </label>
                <label class="tier-btn" id="tierProBtn" style="cursor:pointer;">
                    <input type="radio" name="tier" value="pro" style="display:none;">
                    👑 Pro
                </label>
            </div>
        </div>

        <div class="form-group">
            <label for="days">Tage gültig</label>
            <input type="number" id="days" name="days" value="30" min="1">
        </div>

        <button type="submit" name="action" value="activate" class="btn-primary">✅ Aktivieren / Upgraden</button>
    </form>
</div>

<!-- Users Table -->
<div class="section">
    <h2>Aktive Premium-User (<?php echo count($premiumUsers); ?>)</h2>

    <?php if (empty($premiumUsers)): ?>
        <p style="color: var(--text-secondary);">Noch keine Premium-User.</p>
    <?php else: ?>
        <table class="table">
            <thead>
                <tr>
                    <th>User ID</th>
                    <th>Tier</th>
                    <th>Status</th>
                    <th>Läuft ab</th>
                    <th>Verbleibend</th>
                    <th>Erstellt</th>
                    <th>Aktionen</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($premiumUsers as $u): ?>
                    <?php
                    $exp     = strtotime($u['expires_at']);
                    $now     = time();
                    $daysRem = max(0, ceil(($exp - $now) / 86400));
                    $expired = $exp < $now;
                    $uTier   = $u['tier'] ?? 'basic';
                    ?>
                    <tr>
                        <td><code style="font-size:.85rem;"><?php echo esc($u['user_id']); ?></code></td>
                        <td>
                            <?php if ($uTier === 'pro'): ?>
                                <span class="tier-badge tier-pro">👑 Pro</span>
                            <?php else: ?>
                                <span class="tier-badge tier-basic">💎 Basic</span>
                            <?php endif; ?>
                        </td>
                        <td>
                            <span style="color: <?php echo $expired ? '#ff6b6b' : '#51cf66'; ?>; font-weight:600;">
                                <?php echo $expired ? '❌ Abgelaufen' : '✅ Aktiv'; ?>
                            </span>
                        </td>
                        <td style="font-size:.85rem;"><?php echo date('d.m.Y H:i', $exp); ?></td>
                        <td><?php echo $daysRem; ?>d</td>
                        <td style="font-size:.82rem; color:var(--text-secondary);"><?php echo date('d.m.Y', strtotime($u['created_at'])); ?></td>
                        <td>
                            <div class="actions-cell">
                                <?php if ($uTier !== 'pro'): ?>
                                    <form method="POST" style="display:inline;">
                                        <input type="hidden" name="user_id" value="<?php echo esc($u['user_id']); ?>">
                                        <input type="hidden" name="days" value="<?php echo $daysRem ?: 30; ?>">
                                        <button type="submit" name="action" value="upgrade_pro" class="btn-sm btn-upgrade" title="Auf Pro upgraden">👑 Pro</button>
                                    </form>
                                <?php else: ?>
                                    <form method="POST" style="display:inline;">
                                        <input type="hidden" name="user_id" value="<?php echo esc($u['user_id']); ?>">
                                        <input type="hidden" name="days" value="<?php echo $daysRem ?: 30; ?>">
                                        <button type="submit" name="action" value="downgrade_basic" class="btn-sm btn-downgrade" title="Auf Basic downgraden">💎 Basic</button>
                                    </form>
                                <?php endif; ?>
                                <form method="POST" style="display:inline;">
                                    <input type="hidden" name="user_id" value="<?php echo esc($u['user_id']); ?>">
                                    <button type="submit" name="action" value="deactivate" class="btn-sm btn-remove"
                                        onclick="return confirm('Premium für <?php echo esc($u['user_id']); ?> entfernen?')">
                                        ❌ Remove
                                    </button>
                                </form>
                            </div>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    <?php endif; ?>
</div>

<script>
// Highlight selected tier button
document.querySelectorAll('input[name="tier"]').forEach(r => {
    r.addEventListener('change', () => updateTierUI());
});
function updateTierUI() {
    const val = document.querySelector('input[name="tier"]:checked')?.value;
    document.getElementById('tierBasicBtn').style.borderColor = val === 'basic' ? '#667eea' : '';
    document.getElementById('tierBasicBtn').style.background  = val === 'basic' ? 'rgba(102,126,234,.15)' : '';
    document.getElementById('tierProBtn').style.borderColor   = val === 'pro'   ? '#ffd700' : '';
    document.getElementById('tierProBtn').style.background    = val === 'pro'   ? 'rgba(255,215,0,.15)'   : '';
}
updateTierUI();
</script>

<?php include '../includes/footer.php'; ?>

