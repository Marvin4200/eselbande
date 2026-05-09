import getDb from '@/lib/db';
import { methodAllowed, parseId, parseNonNegativeInt, requireSession, sendApiError } from '@/lib/apiGuards';

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ['POST'])) return;
  const session = await requireSession(req, res, ['admin']);
  if (!session) return;

  try {
    const db = getDb();
    const { userId, xp } = req.body;
    const id = parseId(userId, 'userId');
    const safeXp = parseNonNegativeInt(xp, 'xp');
    const result = db.prepare('UPDATE users SET xp = ? WHERE id = ?').run(safeXp, id);
    if (result.changes !== 1) return res.status(404).json({ error: 'User not found' });
    return res.status(200).json({ success: true });
  } catch (error) {
    return sendApiError(res, error);
  }
}
