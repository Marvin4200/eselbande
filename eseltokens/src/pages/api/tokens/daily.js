import getDb from '@/lib/db';
import { methodAllowed, requireSession, sendApiError } from '@/lib/apiGuards';
import { creditTokens, recordTransaction } from '@/lib/tokenLedger';

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ['POST'])) return;
  const session = await requireSession(req, res);
  if (!session) return;

  try {
    const db = getDb();
    const userId = session.user.id;

    const amount = Math.max(0, parseInt(process.env.DAILY_REWARD_TOKENS || '100', 10) || 0);
    if (amount <= 0) {
      return res.status(400).json({ error: 'Daily reward disabled' });
    }

    const now = Date.now();
    const state = db.prepare('SELECT * FROM reward_state WHERE userId = ? AND rewardKey = ?').get(userId, 'daily_reward');
    const last = state?.lastClaimAt ? Number(state.lastClaimAt) : 0;
    const nextAt = last ? last + DAY_MS : 0;

    if (last && now < nextAt) {
      return res.status(429).json({
        error: 'Daily reward cooldown',
        nextClaimAt: nextAt,
        remainingMs: nextAt - now,
      });
    }

    const claim = db.transaction(() => {
      creditTokens(db, userId, amount);
      recordTransaction(db, { fromUserId: userId, type: 'reward_daily', amount });

      // Idempotent under retries/double-clicks.
      db.prepare(
        `INSERT INTO reward_state (userId, rewardKey, lastClaimAt, claimCount, meta, updatedAt)
         VALUES (?, ?, ?, 1, ?, datetime('now'))
         ON CONFLICT(userId, rewardKey) DO UPDATE SET
           lastClaimAt = excluded.lastClaimAt,
           claimCount = reward_state.claimCount + 1,
           meta = excluded.meta,
           updatedAt = datetime('now')`
      ).run(userId, 'daily_reward', now, JSON.stringify({ amount }));
    });
    claim();

    const newBalance = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId).balance;
    return res.status(200).json({
      success: true,
      reward: 'daily_reward',
      amount,
      newBalance,
      nextClaimAt: now + DAY_MS,
    });
  } catch (error) {
    return sendApiError(res, error);
  }
}
