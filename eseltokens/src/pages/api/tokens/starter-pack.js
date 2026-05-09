import getDb from '@/lib/db';
import { methodAllowed, requireSession, sendApiError } from '@/lib/apiGuards';
import { creditTokens, recordTransaction } from '@/lib/tokenLedger';

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ['POST'])) return;
  const session = await requireSession(req, res);
  if (!session) return;

  try {
    const db = getDb();
    const userId = session.user.id;

    const row = db.prepare('SELECT * FROM reward_state WHERE userId = ? AND rewardKey = ?').get(userId, 'starter_pack');
    if (!row) return res.status(404).json({ error: 'No starter pack available' });

    const meta = row.meta ? JSON.parse(row.meta) : {};
    const alreadyClaimed = meta?.claimed === true || Number(row.claimCount || 0) > 0;
    if (alreadyClaimed) return res.status(409).json({ error: 'Starter pack already claimed' });

    const amount = Math.max(0, parseInt(meta?.amount || process.env.STARTER_PACK_TOKENS || '500', 10) || 0);
    if (amount <= 0) return res.status(400).json({ error: 'Starter pack disabled' });

    const claim = db.transaction(() => {
      creditTokens(db, userId, amount);
      recordTransaction(db, { fromUserId: userId, type: 'reward_starter_pack', amount });
      db.prepare(
        "UPDATE reward_state SET lastClaimAt = ?, claimCount = 1, meta = ?, updatedAt = datetime('now') WHERE userId = ? AND rewardKey = ?"
      ).run(Date.now(), JSON.stringify({ ...meta, amount, claimed: true }), userId, 'starter_pack');
    });
    claim();

    const newBalance = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId).balance;
    return res.status(200).json({ success: true, reward: 'starter_pack', amount, newBalance });
  } catch (error) {
    return sendApiError(res, error);
  }
}

