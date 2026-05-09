import getDb from '@/lib/db';
import { methodAllowed, requireSession } from '@/lib/apiGuards';

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ['GET'])) return;
  const session = await requireSession(req, res);
  if (!session) return;

  const db = getDb();

  const transactions = db.prepare(`
      SELECT t.id, t.type, t.amount, t.createdAt,
        fu.username as fromUsername,
        tu.username as toUsername
      FROM transactions t
      LEFT JOIN users fu ON t.fromUserId = fu.id
      LEFT JOIN users tu ON t.toUserId = tu.id
      ORDER BY t.createdAt DESC
      LIMIT 50
    `).all();
  res.status(200).json(transactions);
}
