import getDb from '@/lib/db';
import { methodAllowed, requireSession } from '@/lib/apiGuards';

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ['GET'])) return;
  const session = await requireSession(req, res, ['admin']);
  if (!session) return;

  const db = getDb();

  const users = db.prepare('SELECT id, discordId, username, discriminator, avatar, balance, xp, role, createdAt FROM users').all();
  res.status(200).json(users);
}
