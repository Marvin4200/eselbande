import getDb from '@/lib/db';
import { methodAllowed, requireSession, sendApiError } from '@/lib/apiGuards';
import { creditTokens, recordTransaction } from '@/lib/tokenLedger';

const COOLDOWN_MS = 12 * 60 * 60 * 1000;

async function checkTopggVote({ botId, apiToken, userId }) {
  const url = `https://top.gg/api/bots/${encodeURIComponent(botId)}/check?userId=${encodeURIComponent(userId)}`;
  const r = await fetch(url, {
    headers: { Authorization: apiToken },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`top.gg check failed (${r.status}) ${text}`.slice(0, 300));
  }
  const data = await r.json();
  // top.gg returns { voted: 1 } or { voted: 0 }
  return data?.voted === 1 || data?.voted === true || data?.voted === '1';
}

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ['POST'])) return;
  const session = await requireSession(req, res);
  if (!session) return;

  try {
    const db = getDb();
    const userId = session.user.id;
    const discordId = session.user.discordId;

    const amount = Math.max(0, parseInt(process.env.TOPGG_VOTE_REWARD_TOKENS || '150', 10) || 0);
    const botId = process.env.TOPGG_BOT_ID || process.env.FAHRSTUHL_BOT_ID;
    const apiToken = process.env.TOPGG_API_TOKEN;

    if (!amount || amount <= 0) return res.status(400).json({ error: 'Vote reward disabled' });
    if (!botId) return res.status(500).json({ error: 'TOPGG_BOT_ID not set' });
    if (!apiToken) return res.status(500).json({ error: 'TOPGG_API_TOKEN not set' });
    if (!discordId) return res.status(400).json({ error: 'Missing discordId in session' });

    const now = Date.now();
    const state = db.prepare('SELECT * FROM reward_state WHERE userId = ? AND rewardKey = ?').get(userId, 'topgg_vote');
    const last = state?.lastClaimAt ? Number(state.lastClaimAt) : 0;
    const nextAt = last ? last + COOLDOWN_MS : 0;

    if (last && now < nextAt) {
      return res.status(429).json({
        error: 'Vote reward cooldown',
        nextClaimAt: nextAt,
        remainingMs: nextAt - now,
      });
    }

    const voted = await checkTopggVote({ botId, apiToken, userId: discordId });
    if (!voted) {
      const voteUrl = process.env.TOPGG_VOTE_URL || `https://top.gg/bot/${encodeURIComponent(botId)}/vote`;
      return res.status(403).json({ error: 'No recent vote found', voteUrl });
    }

    const claim = db.transaction(() => {
      creditTokens(db, userId, amount);
      recordTransaction(db, { fromUserId: userId, type: 'reward_topgg_vote', amount });

      // Idempotent under retries/double-clicks.
      db.prepare(
        `INSERT INTO reward_state (userId, rewardKey, lastClaimAt, claimCount, meta, updatedAt)
         VALUES (?, ?, ?, 1, ?, datetime('now'))
         ON CONFLICT(userId, rewardKey) DO UPDATE SET
           lastClaimAt = excluded.lastClaimAt,
           claimCount = reward_state.claimCount + 1,
           meta = excluded.meta,
           updatedAt = datetime('now')`
      ).run(userId, 'topgg_vote', now, JSON.stringify({ amount, botId }));
    });
    claim();

    const newBalance = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId).balance;
    const voteUrl = process.env.TOPGG_VOTE_URL || `https://top.gg/bot/${encodeURIComponent(botId)}/vote`;
    return res.status(200).json({
      success: true,
      reward: 'topgg_vote',
      amount,
      newBalance,
      nextClaimAt: now + COOLDOWN_MS,
      voteUrl,
    });
  } catch (error) {
    return sendApiError(res, error);
  }
}
