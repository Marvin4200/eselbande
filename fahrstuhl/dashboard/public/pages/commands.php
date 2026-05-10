<?php
$page_title = 'Commands';
require_once __DIR__ . '/../includes/config.php';
requireLogin();

$response = getAPI('/commands');
$commands   = $response['data']['commands']   ?? [];
$totalUses  = $response['data']['totalUses']  ?? 0;
$totalErrors = $response['data']['totalErrors'] ?? 0;
$total      = $response['data']['total']      ?? 0;

// Collect categories for filter
$categories = array_unique(array_column($commands, 'category'));
sort($categories);
?>
<?php include '../includes/header.php'; ?>
<?php include '../includes/sidebar.php'; ?>

<div class="page-header">
    <h1>⌨️ Commands</h1>
    <p class="subtitle">All <?php echo $total; ?> commands – usage, errors, premium status</p>
</div>

<!-- Stats Bar -->
<div style="display:flex; gap:var(--sp-4); margin-bottom:var(--sp-6); flex-wrap:wrap;">
    <div class="stat-card" style="flex:1; min-width:140px;">
        <div class="stat-value"><?php echo $total; ?></div>
        <div class="stat-label">Total Commands</div>
    </div>
    <div class="stat-card" style="flex:1; min-width:140px;">
        <div class="stat-value"><?php echo number_format($totalUses); ?></div>
        <div class="stat-label">Total Uses</div>
    </div>
    <div class="stat-card" style="flex:1; min-width:140px;">
        <div class="stat-value" style="color:<?php echo $totalErrors > 0 ? '#ff6b6b' : '#51cf66'; ?>"><?php echo number_format($totalErrors); ?></div>
        <div class="stat-label">Total Errors</div>
    </div>
    <div class="stat-card" style="flex:1; min-width:140px;">
        <div class="stat-value"><?php echo $totalUses > 0 ? round(($totalErrors / $totalUses) * 100, 1) : 0; ?>%</div>
        <div class="stat-label">Error Rate</div>
    </div>
</div>

<!-- Chart -->
<?php
$chartCmds = array_filter($commands, fn($c) => $c['uses'] > 0);
$chartCmds = array_slice(array_values($chartCmds), 0, 12);
?>
<?php if (!empty($chartCmds)): ?>
<div class="section" style="margin-bottom:var(--sp-6); padding:var(--sp-5);">
    <h2 style="margin-bottom:var(--sp-4);">📊 Top Commands by Usage</h2>
    <div style="position:relative; height:260px;">
        <canvas id="cmdChart"></canvas>
    </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<script>
(function() {
    const labels = <?php echo json_encode(array_column($chartCmds, 'name')); ?>;
    const uses   = <?php echo json_encode(array_column($chartCmds, 'uses')); ?>;
    const errors = <?php echo json_encode(array_column($chartCmds, 'errors')); ?>;
    const ctx = document.getElementById('cmdChart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Uses',
                    data: uses,
                    backgroundColor: 'rgba(79,70,229,0.75)',
                    borderRadius: 5,
                },
                {
                    label: 'Errors',
                    data: errors,
                    backgroundColor: 'rgba(255,107,107,0.75)',
                    borderRadius: 5,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#ccc' } }
            },
            scales: {
                x: { ticks: { color: '#aaa' }, grid: { color: '#222' } },
                y: { ticks: { color: '#aaa' }, grid: { color: '#222' }, beginAtZero: true }
            }
        }
    });
})();
</script>
<?php endif; ?>

<!-- Filters -->
<div class="section" style="padding:14px 18px; margin-bottom:var(--sp-4);">
    <div style="display:flex; gap:var(--sp-3); flex-wrap:wrap; align-items:center;">
        <input type="text" id="search" placeholder="🔍 Search command..." oninput="filterTable()"
            style="padding:var(--sp-2) var(--sp-3); border-radius:6px; border:1px solid #333; background:#1a1a2e; color:#e0e0e0; min-width:200px;">
        <select id="catFilter" onchange="filterTable()"
            style="padding:var(--sp-2) var(--sp-3); border-radius:6px; border:1px solid #333; background:#1a1a2e; color:#e0e0e0;">
            <option value="">All Categories</option>
            <?php foreach ($categories as $cat): ?>
                <option value="<?php echo esc($cat); ?>"><?php echo esc($cat); ?></option>
            <?php endforeach; ?>
        </select>
        <select id="premFilter" onchange="filterTable()"
            style="padding:var(--sp-2) var(--sp-3); border-radius:6px; border:1px solid #333; background:#1a1a2e; color:#e0e0e0;">
            <option value="">All</option>
            <option value="1">💎 Premium only</option>
            <option value="0">Free only</option>
        </select>
        <span id="rowCount" style="color:#aaa; font-size:0.9em; margin-left:auto;"></span>
    </div>
</div>

<!-- Table -->
<div class="section" style="overflow-x:auto;">
    <?php if (empty($commands)): ?>
        <p style="color:#999; padding:var(--sp-5);">No command data available yet – use some commands first!</p>
    <?php else: ?>
    <table class="table" id="cmdTable">
        <thead>
            <tr>
                <th>Command</th>
                <th>Category</th>
                <th>Description</th>
                <th onclick="sortTable(3)" style="cursor:pointer;" title="Sort by uses">Uses ↕</th>
                <th onclick="sortTable(4)" style="cursor:pointer;" title="Sort by errors">Errors ↕</th>
                <th>Error Rate</th>
                <th>Premium</th>
            </tr>
        </thead>
        <tbody id="cmdBody">
            <?php foreach ($commands as $cmd): ?>
                <?php
                $uses   = (int)($cmd['uses'] ?? 0);
                $errors = (int)($cmd['errors'] ?? 0);
                $rate   = $uses > 0 ? round(($errors / $uses) * 100, 1) : 0;
                $rateColor = $rate === 0 ? '#51cf66' : ($rate < 5 ? '#ffd43b' : '#ff6b6b');
                ?>
                <tr data-cat="<?php echo esc($cmd['category']); ?>" data-prem="<?php echo $cmd['premium'] ? '1' : '0'; ?>">
                    <td><code style="font-size:0.95em;">/<?php echo esc($cmd['name']); ?></code></td>
                    <td><span style="white-space:nowrap;"><?php echo esc($cmd['category']); ?></span></td>
                    <td style="color:#bbb; font-size:0.88em; max-width:320px;"><?php echo esc($cmd['description']); ?></td>
                    <td style="text-align:center; font-weight:600;"><?php echo number_format($uses); ?></td>
                    <td style="text-align:center; color:<?php echo $errors > 0 ? '#ff6b6b' : '#51cf66'; ?>; font-weight:600;"><?php echo $errors; ?></td>
                    <td style="text-align:center; color:<?php echo $rateColor; ?>;"><?php echo $rate; ?>%</td>
                    <td style="text-align:center;"><?php echo $cmd['premium'] ? '<span title="Premium required">💎</span>' : '<span style="color:#555;">—</span>'; ?></td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
    <?php endif; ?>
</div>

<script>
function filterTable() {
    const search = document.getElementById('search').value.toLowerCase();
    const cat    = document.getElementById('catFilter').value;
    const prem   = document.getElementById('premFilter').value;
    const rows   = document.querySelectorAll('#cmdBody tr');
    let visible  = 0;
    rows.forEach(row => {
        const text    = row.textContent.toLowerCase();
        const rowCat  = row.dataset.cat;
        const rowPrem = row.dataset.prem;
        const ok = (!search || text.includes(search))
                && (!cat    || rowCat === cat)
                && (!prem   || rowPrem === prem);
        row.style.display = ok ? '' : 'none';
        if (ok) visible++;
    });
    document.getElementById('rowCount').textContent = `Showing ${visible} of <?php echo count($commands); ?>`;
}

let sortDir = {};
function sortTable(col) {
    const tbody = document.getElementById('cmdBody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    sortDir[col] = !sortDir[col];
    rows.sort((a, b) => {
        const aVal = parseFloat(a.cells[col].textContent.replace(/[^0-9.]/g,'')) || 0;
        const bVal = parseFloat(b.cells[col].textContent.replace(/[^0-9.]/g,'')) || 0;
        return sortDir[col] ? bVal - aVal : aVal - bVal;
    });
    rows.forEach(r => tbody.appendChild(r));
}

// Init count
filterTable();
</script>

<?php include '../includes/footer.php'; ?>
