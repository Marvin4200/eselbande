import getDb from '@/lib/db';
import { methodAllowed, requireSession } from '@/lib/apiGuards';

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ['POST', 'GET'])) return;
  const session = await requireSession(req, res);
  if (!session) return;

  const db = getDb();

  if (req.method === 'POST') {
    const { prize, duration, winners } = req.body;
    if (!prize || !duration || !winners) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const giveawayId = db
      .prepare('INSERT INTO giveaways (prize, duration, winners, created_at) VALUES (?, ?, ?, ?)')
      .run(prize, duration, winners, new Date().toISOString()).lastInsertRowid;

    return res.status(201).json({ message: 'Giveaway created', giveawayId });
  }

  if (req.method === 'GET') {
    const giveaways = db.prepare('SELECT * FROM giveaways').all();
    return res.status(200).json(giveaways);
  }
}