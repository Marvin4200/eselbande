import getDb from '@/lib/db';
import { methodAllowed, parseId, parseTokenAmount, requireSession, sendApiError } from '@/lib/apiGuards';
import { transferTokens } from '@/lib/tokenLedger';

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ['POST'])) return;
  const session = await requireSession(req, res);
  if (!session) return;

  try {
    const db = getDb();
    const { to, amount: rawAmount = 1 } = req.body;
    const toId = parseId(to, 'recipient');
    const amount = parseTokenAmount(rawAmount);

    if (toId === session.user.id) {
      return res.status(400).json({ error: 'Cannot send tokens to yourself' });
    }

    const toUser = db.prepare('SELECT id, role FROM users WHERE id = ?').get(toId);
    if (!toUser) {
      return res.status(400).json({ error: 'User not found' });
    }
    if (toUser.role === 'pending') {
      return res.status(403).json({ error: 'Cannot send tokens to pending users' });
    }

    transferTokens(db, { fromUserId: session.user.id, toUserId: toUser.id, amount, type: 'give' });

    return res.status(200).json({ success: true });
  } catch (error) {
    return sendApiError(res, error);
  }
}
