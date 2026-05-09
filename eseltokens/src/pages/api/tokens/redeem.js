import getDb from '@/lib/db';
import { XP_PER_TOKEN, getLevelInfo } from '@/lib/leveling';
import { methodAllowed, parseTokenAmount, requireSession, sendApiError } from '@/lib/apiGuards';
import { debitTokens, recordTransaction } from '@/lib/tokenLedger';

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ['POST'])) return;
  const session = await requireSession(req, res);
  if (!session) return;

  try {
    const { amount = 1 } = req.body || {};
    const redeemAmount = parseTokenAmount(amount);

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user.id);

    if (!user) return res.status(404).json({ error: 'User not found' });

    const xpGained = redeemAmount * XP_PER_TOKEN;
    const oldLevel = getLevelInfo(user.xp || 0).level;

    const redeem = db.transaction(() => {
      debitTokens(db, user.id, redeemAmount);
      db.prepare('UPDATE users SET xp = xp + ? WHERE id = ?').run(xpGained, user.id);
      recordTransaction(db, { fromUserId: user.id, type: 'redeem', amount: redeemAmount });
    });
    redeem();

    const newLevel = getLevelInfo((user.xp || 0) + xpGained).level;

    return res.status(200).json({
      success: true,
      xpGained,
      leveledUp: newLevel > oldLevel,
      newLevel,
      oldLevel,
    });
  } catch (error) {
    return sendApiError(res, error);
  }
}
