import getDb from '@/lib/db';
import { creditTokens, recordTransaction } from '@/lib/tokenLedger';

function requireIntegrationSecret(req, res) {
  const expected = (process.env.FAHRSTUHL_INTEGRATION_SECRET || process.env.ESELTOKENS_VOICE_REWARD_SECRET || '').trim();
  if (!expected) {
    res.status(503).json({ error: 'Voice reward integration is not configured' });
    return false;
  }

  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (token !== expected) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  return true;
}

function dateKey(ms = Date.now()) {
  return new Date(ms).toISOString().slice(0, 10);
}

function safeJsonParse(value, fallback = {}) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  if (!requireIntegrationSecret(req, res)) return;

  try {
    const {
      sessionId,
      discordId,
      guildId = null,
      channelId = null,
      durationMs = 0,
      endedAt = Date.now(),
      amount = 0,
    } = req.body || {};

    const cleanSessionId = String(sessionId || '').trim();
    const cleanDiscordId = String(discordId || '').trim();
    const requested = Math.max(0, Math.floor(Number(amount) || 0));

    if (!cleanSessionId || cleanSessionId.length > 120) {
      return res.status(400).json({ error: 'Invalid sessionId' });
    }
    if (!cleanDiscordId || !/^\d{10,32}$/.test(cleanDiscordId)) {
      return res.status(400).json({ error: 'Invalid discordId' });
    }
    if (requested <= 0 || requested > 500) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const db = getDb();
    const user = db.prepare('SELECT id, balance, role FROM users WHERE discordId = ?').get(cleanDiscordId);
    if (!user) return res.status(404).json({ error: 'User not found in EselTokens' });
    if (user.role === 'pending') return res.status(403).json({ error: 'User is pending' });

    const existing = db.prepare('SELECT amountGranted FROM voice_reward_claims WHERE sessionId = ?').get(cleanSessionId);
    if (existing) {
      const balance = db.prepare('SELECT balance FROM users WHERE id = ?').get(user.id)?.balance ?? user.balance;
      return res.status(200).json({
        success: true,
        duplicate: true,
        amountRequested: requested,
        amountGranted: Number(existing.amountGranted || 0),
        newBalance: balance,
      });
    }

    const dailyCap = Math.max(0, parseInt(process.env.VOICE_REWARD_DAILY_CAP_TOKENS || '30', 10) || 0);
    const key = `voice_activity_${dateKey(Number(endedAt) || Date.now())}`;
    const state = db.prepare('SELECT * FROM reward_state WHERE userId = ? AND rewardKey = ?').get(user.id, key);
    const already = Number(safeJsonParse(state?.meta)?.amount || 0);
    const remaining = dailyCap > 0 ? Math.max(0, dailyCap - already) : requested;
    const granted = Math.min(requested, remaining);

    const tx = db.transaction(() => {
      if (granted > 0) {
        creditTokens(db, user.id, granted);
        recordTransaction(db, { fromUserId: user.id, type: 'reward_voice_activity', amount: granted });
      }

      db.prepare(
        `INSERT INTO voice_reward_claims (sessionId, userId, discordId, guildId, channelId, durationMs, amountRequested, amountGranted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(cleanSessionId, user.id, cleanDiscordId, guildId, channelId, Math.max(0, Math.floor(Number(durationMs) || 0)), requested, granted);

      const nextAmount = already + granted;
      db.prepare(
        `INSERT INTO reward_state (userId, rewardKey, lastClaimAt, claimCount, meta, updatedAt)
         VALUES (?, ?, ?, 1, ?, datetime('now'))
         ON CONFLICT(userId, rewardKey) DO UPDATE SET
           lastClaimAt = excluded.lastClaimAt,
           claimCount = reward_state.claimCount + 1,
           meta = excluded.meta,
           updatedAt = datetime('now')`
      ).run(user.id, key, Date.now(), JSON.stringify({ amount: nextAmount, cap: dailyCap }));
    });

    tx();

    const newBalance = db.prepare('SELECT balance FROM users WHERE id = ?').get(user.id)?.balance ?? user.balance;
    return res.status(200).json({
      success: true,
      amountRequested: requested,
      amountGranted: granted,
      dailyCap,
      newBalance,
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
}
