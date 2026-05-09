import getDb from '@/lib/db';
import { getServerSession } from 'next-auth';
import authOptions from '@/lib/authOptions';
import { advanceGame } from '@/lib/blackjack';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end();
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });

  const { tableId } = req.body;
  const db = getDb();

  const player = db.prepare('SELECT * FROM blackjack_players WHERE tableId = ? AND userId = ?').get(tableId, session.user.id);
  if (!player) return res.status(400).json({ error: 'Du bist nicht an diesem Tisch' });

  const table = db.prepare('SELECT * FROM blackjack_tables WHERE id = ?').get(tableId);

  // If game is in progress and player has active bets, they lose their bets
  if (table && (table.status === 'playing' || table.status === 'betting')) {
    const hands = JSON.parse(player.hands);
    // Bets are already deducted, so just mark as lost
    for (const hand of hands) {
      if (hand.bet > 0 && hand.status !== 'lost' && hand.status !== 'won' && hand.status !== 'push' && hand.status !== 'blackjack') {
        db.prepare('INSERT INTO transactions (fromUserId, type, amount) VALUES (?, ?, ?)').run(session.user.id, 'blackjack_lose', hand.bet);
      }
    }
  }

  db.prepare('DELETE FROM blackjack_players WHERE tableId = ? AND userId = ?').run(tableId, session.user.id);

  // If no players left, delete the table
  const remaining = db.prepare('SELECT COUNT(*) as c FROM blackjack_players WHERE tableId = ?').get(tableId).c;
  if (remaining === 0) {
    db.prepare('DELETE FROM blackjack_tables WHERE id = ?').run(tableId);
  } else {
    db.prepare("UPDATE blackjack_tables SET updatedAt = datetime('now') WHERE id = ?").run(tableId);

    // If it was this player's turn during playing, advance the game
    if (table && table.status === 'playing' && table.currentSeat === player.seatIndex) {
      advanceGame(db, tableId);
    }
  }

  return res.status(200).json({ success: true });
}
