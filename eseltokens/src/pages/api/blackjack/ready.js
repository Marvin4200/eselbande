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

  const { tableId } = req.body;
  const db = getDb();

  const table = db.prepare('SELECT * FROM blackjack_tables WHERE id = ?').get(tableId);
  if (!table) return res.status(404).json({ error: 'Tisch nicht gefunden' });

  const player = db.prepare('SELECT * FROM blackjack_players WHERE tableId = ? AND userId = ?').get(tableId, session.user.id);
  if (!player) return res.status(400).json({ error: 'Du bist nicht an diesem Tisch' });

  if (table.status === 'waiting') {
    // Toggle ready
    const newReady = player.isReady ? 0 : 1;
    db.prepare('UPDATE blackjack_players SET isReady = ? WHERE id = ?').run(newReady, player.id);

    // Check if all players are ready → start betting
    if (newReady) {
      const players = db.prepare('SELECT * FROM blackjack_players WHERE tableId = ?').all(tableId);
      const allReady = players.every(p => p.id === player.id ? true : !!p.isReady);
      if (allReady && players.length >= 1) {
        db.prepare("UPDATE blackjack_tables SET status = 'betting', updatedAt = datetime('now') WHERE id = ?").run(tableId);
      }
    }

    return res.status(200).json({ success: true });
  }

  if (table.status === 'finished') {
    // Toggle ready for next round
    const newReady = player.isReady ? 0 : 1;
    db.prepare('UPDATE blackjack_players SET isReady = ? WHERE id = ?').run(newReady, player.id);

    // Check if all ready → start new round
    if (newReady) {
      const players = db.prepare('SELECT * FROM blackjack_players WHERE tableId = ?').all(tableId);
      const allReady = players.every(p => p.id === player.id ? true : !!p.isReady);
      if (allReady) {
        // Reset for new round
        for (const p of players) {
          db.prepare('UPDATE blackjack_players SET hands = ?, currentHandIndex = 0, isReady = 0 WHERE id = ?').run('[]', p.id);
        }
        db.prepare("UPDATE blackjack_tables SET status = 'betting', deck = '[]', dealerCards = '[]', currentSeat = -1, updatedAt = datetime('now') WHERE id = ?").run(tableId);
      }
    }

    return res.status(200).json({ success: true });
  }

  return res.status(400).json({ error: 'Kann jetzt nicht bereit melden' });
}
