import getDb from '@/lib/db';
import { methodAllowed, parseTokenAmount, requireSession, sendApiError } from '@/lib/apiGuards';
import { debitTokens } from '@/lib/tokenLedger';

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ['POST'])) return;

  const session = await requireSession(req, res);
  if (!session) return;

  try {
    const db = getDb();
    const userId = session.user.id;
    const username = session.user.name;
    const amount = parseTokenAmount(req.body.amount);

    const game = db.prepare(`SELECT * FROM jackpot_games WHERE status = 'depositing' ORDER BY id DESC LIMIT 1`).get();
    if (!game) return res.status(400).json({ error: 'Kein aktives Spiel' });

    const now = Date.now();

    // Deduct balance and insert deposit atomically
    const deposit = db.transaction(() => {
      const currentGame = db.prepare(`SELECT id, status FROM jackpot_games WHERE id = ?`).get(game.id);
      if (!currentGame || currentGame.status !== 'depositing') {
        const err = new Error('Kein aktives Spiel');
        err.statusCode = 400;
        throw err;
      }
      debitTokens(db, userId, amount);

      // Recalculate ticket ranges after deposit
      const existingDeposits = db.prepare('SELECT * FROM jackpot_deposits WHERE game_id = ? ORDER BY id ASC').all(game.id);
      const currentTotal = existingDeposits.reduce((s, d) => s + d.amount, 0);
      const newTotal = currentTotal + amount;
      const ticketStart = currentTotal / newTotal;
      const ticketEnd = 1.0;

      // Re-normalise all existing ticket ranges
      for (const dep of existingDeposits) {
        const newStart = (dep.ticket_start * currentTotal) / newTotal;
        const newEnd = (dep.ticket_end * currentTotal) / newTotal;
        db.prepare('UPDATE jackpot_deposits SET ticket_start = ?, ticket_end = ? WHERE id = ?').run(newStart, newEnd, dep.id);
      }

      // Update game total
      db.prepare('UPDATE jackpot_games SET total_pot = total_pot + ? WHERE id = ? AND status = ?').run(amount, game.id, 'depositing');

      // Insert new deposit
      db.prepare(`INSERT INTO jackpot_deposits (game_id, user_id, username, amount, ticket_start, ticket_end, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(game.id, userId, username, amount, ticketStart, ticketEnd, now);
    });

    deposit();

    return res.status(200).json({ success: true });
  } catch (error) {
    return sendApiError(res, error);
  }
}
