import getDb from '@/lib/db';
import { methodAllowed, parseId, parseNonNegativeInt, requireSession, sendApiError } from '@/lib/apiGuards';
import { recordTransaction } from '@/lib/tokenLedger';

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ['POST'])) return;
  const session = await requireSession(req, res, ['admin']);
  if (!session) return;

  try {
    const db = getDb();
    const { userId, balance } = req.body;
    const id = parseId(userId, 'userId');
    const safeBalance = parseNonNegativeInt(balance, 'balance');

    const adjust = db.transaction(() => {
      const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(id);
      if (!user) {
        const err = new Error('User not found');
        err.statusCode = 404;
        throw err;
      }

      db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(safeBalance, id);
      const delta = safeBalance - Number(user.balance || 0);
      if (delta !== 0) {
        recordTransaction(db, {
          fromUserId: session.user.id,
          toUserId: id,
          type: delta > 0 ? 'admin_grant' : 'admin_remove',
          amount: Math.abs(delta),
        });
      }
    });
    adjust();

    return res.status(200).json({ success: true });
  } catch (error) {
    return sendApiError(res, error);
  }
}
