import getDb from '@/lib/db';
import { getServerSession } from 'next-auth';
import authOptions from '@/lib/authOptions';
import crypto from 'crypto';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });
  if (session.user.role === 'pending') return res.status(403).json({ error: 'Pending' });

  const db = getDb();

  if (req.method === 'GET') {
    // Clean up stale tables (older than 2 hours)
    db.prepare("DELETE FROM blackjack_players WHERE tableId IN (SELECT id FROM blackjack_tables WHERE updatedAt < datetime('now', '-2 hours'))").run();
    db.prepare("DELETE FROM blackjack_tables WHERE updatedAt < datetime('now', '-2 hours')").run();

    const tables = db.prepare(`
      SELECT bt.*, COUNT(bp.id) as playerCount
      FROM blackjack_tables bt
      LEFT JOIN blackjack_players bp ON bt.id = bp.tableId
      WHERE bt.status != 'finished' OR bt.updatedAt > datetime('now', '-5 minutes')
      GROUP BY bt.id
      ORDER BY bt.createdAt DESC
      LIMIT 20
    `).all();

    return res.status(200).json(tables.map(t => ({
      id: t.id,
      status: t.status,
      playerCount: t.playerCount,
      createdAt: t.createdAt,
    })));
  }

  if (req.method === 'POST') {
    // Check if user is already at a table
    const existing = db.prepare(`
      SELECT bp.tableId FROM blackjack_players bp
      JOIN blackjack_tables bt ON bp.tableId = bt.id
      WHERE bp.userId = ? AND bt.status != 'finished'
    `).get(session.user.id);

    if (existing) {
      return res.status(400).json({ error: 'Du bist bereits an einem Tisch', tableId: existing.tableId });
    }

    const tableId = crypto.randomUUID();
    db.prepare('INSERT INTO blackjack_tables (id) VALUES (?)').run(tableId);
    db.prepare('INSERT INTO blackjack_players (tableId, userId, username, seatIndex) VALUES (?, ?, ?, 0)').run(
      tableId, session.user.id, session.user.name
    );

    return res.status(200).json({ tableId });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end();
}
