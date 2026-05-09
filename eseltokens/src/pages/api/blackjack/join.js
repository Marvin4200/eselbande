import getDb from '@/lib/db';
import { getServerSession } from 'next-auth';
import authOptions from '@/lib/authOptions';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end();
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });
  if (session.user.role === 'pending') return res.status(403).json({ error: 'Pending' });

  const { tableId, seatIndex } = req.body;
  const db = getDb();

  const table = db.prepare('SELECT * FROM blackjack_tables WHERE id = ?').get(tableId);
  if (!table) return res.status(404).json({ error: 'Tisch nicht gefunden' });
  if (table.status !== 'waiting') return res.status(400).json({ error: 'Tisch ist nicht im Wartemodus' });

  // Check if already at a table
  const existing = db.prepare(`
    SELECT bp.tableId FROM blackjack_players bp
    JOIN blackjack_tables bt ON bp.tableId = bt.id
    WHERE bp.userId = ? AND bt.status != 'finished'
  `).get(session.user.id);
  if (existing) return res.status(400).json({ error: 'Du bist bereits an einem Tisch' });

  // Count players
  const count = db.prepare('SELECT COUNT(*) as c FROM blackjack_players WHERE tableId = ?').get(tableId).c;
  if (count >= 4) return res.status(400).json({ error: 'Tisch ist voll' });

  // Find available seat
  const taken = db.prepare('SELECT seatIndex FROM blackjack_players WHERE tableId = ?').all(tableId).map(p => p.seatIndex);
  let seat = seatIndex !== undefined ? seatIndex : null;

  if (seat !== null && taken.includes(seat)) {
    return res.status(400).json({ error: 'Platz ist besetzt' });
  }
  if (seat === null) {
    for (let i = 0; i < 4; i++) {
      if (!taken.includes(i)) { seat = i; break; }
    }
  }
  if (seat === null) return res.status(400).json({ error: 'Kein Platz frei' });

  db.prepare('INSERT INTO blackjack_players (tableId, userId, username, seatIndex) VALUES (?, ?, ?, ?)').run(
    tableId, session.user.id, session.user.name, seat
  );
  db.prepare("UPDATE blackjack_tables SET updatedAt = datetime('now') WHERE id = ?").run(tableId);

  return res.status(200).json({ success: true, seatIndex: seat });
}
