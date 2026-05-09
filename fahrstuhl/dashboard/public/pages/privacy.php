<?php
$page_title = 'Privacy Policy';
require_once __DIR__ . '/../includes/config.php';
// Public page — no login required
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Privacy Policy – Fahrstuhl Bot</title>
<style>
  body { font-family: 'Segoe UI', sans-serif; background:#0d0d1a; color:#e0e0e0; margin:0; padding:0; }
  .container { max-width: 800px; margin: 0 auto; padding: 40px 20px 80px; }
  h1 { color: #fff; border-bottom: 2px solid #5865F2; padding-bottom: 12px; }
  h2 { color: #a0a8ff; margin-top: 32px; }
  p, li { line-height: 1.7; color: #bbb; }
  ul { padding-left: 20px; }
  a { color: #5865F2; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .meta { color: #555; font-size: 0.85em; margin-top: -8px; margin-bottom: 32px; }
  .back { display: inline-block; margin-bottom: 24px; background: #1a1a2e; border: 1px solid #333;
          border-radius: 6px; padding: 6px 14px; color: #aaa; font-size: 0.85em; }
</style>
</head>
<body>
<div class="container">
  <a href="<?= BASE_URL ?>/" class="back">← Back</a>
  <h1>Privacy Policy</h1>
  <p class="meta">Last updated: May 8, 2026</p>

  <h2>1. What Data We Collect</h2>
  <p>Fahrstuhl Bot collects and stores the following data necessary for bot operation and the dashboard:</p>
  <ul>
    <li><strong>Discord User ID</strong> – to track shield usage, command statistics, and premium status</li>
    <li><strong>Discord Server (Guild) ID</strong> – to store per-server configuration (roles, settings)</li>
    <li><strong>Command usage</strong> – which commands are used, when, and whether they succeeded (for analytics & debugging)</li>
    <li><strong>Voice presence metadata</strong> – join/leave/move timestamps and accumulated time per voice channel (no audio)</li>
    <li><strong>Shield/premium status and expiry timestamps</strong></li>
    <li><strong>Notification preferences</strong> – only if you explicitly enable them via <code>/notifysettings</code></li>
    <li><strong>Leveling data</strong> – XP points, level, and server rank earned through voice activity (per server, not cross-server)</li>
  </ul>
  <p>We do <strong>not</strong> collect message content, voice audio, private messages, or any personal information beyond Discord IDs and the metadata listed above.</p>

  <h2>2. How We Use Your Data</h2>
  <ul>
    <li>To provide bot features (troll commands, shields, auto-move roles, leveling system)</li>
    <li>To enforce fairness (cooldowns, blacklists for abuse)</li>
    <li>To display anonymous usage statistics in the bot dashboard</li>
  </ul>
  <p>We do <strong>not</strong> sell, share, or monetize your data with third parties.</p>

  <h2>3. Data Storage</h2>
  <p>Data is stored on a private server in a database (MySQL) and bot runtime storage. We take reasonable precautions to prevent unauthorized access. No data is stored in public repositories.</p>

  <h2>4. Data Retention</h2>
  <p>User data is retained as long as you interact with the bot and/or use the dashboard features. You may request deletion of your data at any time by contacting us on our support server.</p>

  <h2>5. Your Rights</h2>
  <ul>
    <li><strong>Access:</strong> You can request what data we hold about you</li>
    <li><strong>Deletion:</strong> You can request deletion of your data</li>
    <li><strong>Opt-out:</strong> You can disable notifications via <code>/notifysettings</code></li>
  </ul>

  <h2>6. Contact</h2>
  <p>For privacy concerns, join our support server: <a href="https://discord.gg/zfzDHKcWDx" target="_blank">discord.gg/zfzDHKcWDx</a></p>
  <p>Or contact us on GitHub: <a href="https://github.com/Marvin4200/Fahrstuhl" target="_blank">github.com/Marvin4200/Fahrstuhl</a></p>

  <h2>7. Changes</h2>
  <p>We may update this policy as the bot evolves. Significant changes will be announced in our support server.</p>
</div>
</body>
</html>
