<?php
$page_title = 'Terms of Service';
require_once __DIR__ . '/../includes/config.php';
// Public page — no login required
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Terms of Service – Fahrstuhl Bot</title>
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
  .warning { background: #2a1a1a; border-left: 4px solid #ED4245; padding: 12px 16px;
             border-radius: 0 6px 6px 0; margin: 16px 0; }
</style>
</head>
<body>
<div class="container">
  <a href="<?= BASE_URL ?>/" class="back">← Back</a>
  <h1>Terms of Service</h1>
  <p class="meta">Last updated: May 8, 2026</p>

  <p>By adding Fahrstuhl Bot to your Discord server or using its commands, you agree to these Terms of Service. Please read them carefully.</p>

  <h2>1. Intended Use</h2>
  <p>Fahrstuhl Bot is a <strong>fun, opt-in troll bot</strong> for Discord voice channels. It is designed to be used in a friendly, consensual environment among people who enjoy pranks and jokes.</p>
  <div class="warning">
    ⚠️ Fahrstuhl Bot must <strong>not</strong> be used to harass, bully, or harm other users. Any misuse may result in a permanent ban from the bot.
  </div>

  <h2>2. User Responsibilities</h2>
  <ul>
    <li>You must comply with <a href="https://discord.com/terms" target="_blank">Discord's Terms of Service</a> and <a href="https://discord.com/guidelines" target="_blank">Community Guidelines</a></li>
    <li>Server administrators are responsible for ensuring the bot is used appropriately within their server</li>
    <li>Troll commands should only be used in servers where all participants have consented to the bot's activity</li>
    <li>You must not attempt to abuse, exploit, or spam bot commands</li>
    <li>You must not attempt to circumvent blacklists or other safety mechanisms</li>
  </ul>

  <h2>3. Bot Features & Availability</h2>
  <ul>
    <li>Fahrstuhl Bot is provided <strong>"as is"</strong> without guarantees of uptime or feature availability</li>
    <li>Features may be added, changed, or removed at any time</li>
    <li>Premium features require active premium status, which may be revoked for ToS violations</li>
    <li>The dashboard may show operational and analytics data (including voice presence metadata and command logs) to admins</li>
  </ul>

  <h2>4. Prohibited Actions</h2>
  <p>The following actions will result in a permanent bot ban:</p>
  <ul>
    <li>Using bot commands to harass or target users without their consent</li>
    <li>Attempting to abuse or exploit bot features</li>
    <li>Using the bot to violate Discord's Terms of Service</li>
    <li>Attempting to interfere with the bot's operation</li>
  </ul>

  <h2>5. Premium Services</h2>
  <p>Premium features are provided as a bonus for supporters. We reserve the right to modify, suspend, or discontinue premium features at any time. No refunds are provided for premium access that is revoked due to ToS violations.</p>

  <h2>6. Shield System</h2>
  <p>Shields are obtained through joining partner communities or server boosting. Shields are non-transferable and cannot be sold or traded.</p>

  <h2>8. Leveling System</h2>
  <p>The leveling system tracks XP earned through voice channel activity. XP and level data are stored per-server and are not shared across servers. Server administrators may reset leveling data for individual users or the entire server at any time via <code>/leveling resetuser</code> or <code>/leveling resetserver</code>.</p>
  <p>Fahrstuhl Bot and its developers are not liable for any damages, losses, or disputes arising from use of the bot. Users interact with the bot at their own risk.</p>

  <h2>9. Contact & Appeals</h2>
  <p>If you believe you have been wrongly banned or have questions about these terms, contact us:</p>
  <ul>
    <li>Support Server: <a href="https://discord.gg/zfzDHKcWDx" target="_blank">discord.gg/zfzDHKcWDx</a></li>
    <li>GitHub: <a href="https://github.com/Marvin4200/Fahrstuhl" target="_blank">github.com/Marvin4200/Fahrstuhl</a></li>
  </ul>

  <p style="margin-top:40px; color:#555; font-size:0.85em;">
    See also: <a href="<?= BASE_URL ?>/pages/privacy.php">Privacy Policy</a>
  </p>
</div>
</body>
</html>
