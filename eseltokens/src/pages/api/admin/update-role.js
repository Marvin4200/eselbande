import getDb from '@/lib/db';
import { methodAllowed, parseId, requireSession, sendApiError } from '@/lib/apiGuards';

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ['POST'])) return;
  const session = await requireSession(req, res, ['admin']);
  if (!session) return;

  try {
    const db = getDb();
    const { userId, role } = req.body;
    const id = parseId(userId, 'userId');
    if (!['pending', 'member', 'moderator', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    if (id === session.user.id && role !== 'admin') {
      return res.status(400).json({ error: 'You cannot remove your own admin role' });
    }

    const result = db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
    if (result.changes !== 1) return res.status(404).json({ error: 'User not found' });
    return res.status(200).json({ success: true });
  } catch (error) {
    return sendApiError(res, error);
  }
}
