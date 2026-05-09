import getDb from '@/lib/db';
import { methodAllowed, parseId, requireSession, sendApiError } from '@/lib/apiGuards';

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ['POST'])) return;
  const session = await requireSession(req, res, ['moderator', 'admin']);
  if (!session) return;

  try {
    const db = getDb();
    const { userId, role } = req.body;
    const id = parseId(userId, 'userId');

    // Moderators can only set pending <-> member
    if (!['pending', 'member'].includes(role)) {
      return res.status(400).json({ error: 'Moderators can only assign pending or member roles' });
    }

    // Don't allow changing admin or moderator users
    const targetUser = db.prepare('SELECT role FROM users WHERE id = ?').get(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (targetUser.role === 'admin' || targetUser.role === 'moderator') {
      return res.status(403).json({ error: 'Cannot change role of admins or moderators' });
    }

    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
    return res.status(200).json({ success: true });
  } catch (error) {
    return sendApiError(res, error);
  }
}
