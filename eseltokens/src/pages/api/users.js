import getDb from '@/lib/db';
import { methodAllowed, requireSession } from '@/lib/apiGuards';

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ['GET'])) return;
  const session = await requireSession(req, res);
  if (!session) return;

  const db = getDb();

  const users = db.prepare('SELECT id, username, avatar, balance, xp, role FROM users WHERE role != ?').all('pending');
  res.status(200).json(users);
}
