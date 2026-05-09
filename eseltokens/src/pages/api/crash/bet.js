import getDb from '@/lib/db';
import { methodAllowed, parseTokenAmount, requireSession, sendApiError } from '@/lib/apiGuards';
import { debitTokens } from '@/lib/tokenLedger';

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ['POST'])) return;

  const session = await requireSession(req, res);
  if (!session) return;

  try {
    const { amount } = req.body;
    const betAmount = parseTokenAmount(amount);

    const db = getDb();

    // Get current game
    const game = db.prepare('SELECT * FROM crash_games ORDER BY id DESC LIMIT 1').get();
    if (!game || game.status !== 'betting') {
      return res.status(400).json({ error: 'Wetten nicht möglich' });
    }

    const placeBet = db.transaction(() => {
      const currentGame = db.prepare('SELECT * FROM crash_games WHERE id = ?').get(game.id);
      if (!currentGame || currentGame.status !== 'betting') {
        const err = new Error('Wetten nicht möglich');
        err.statusCode = 400;
        throw err;
      }

      const existingBet = db.prepare('SELECT id FROM crash_bets WHERE game_id = ? AND user_id = ?').get(game.id, session.user.id);
      if (existingBet) {
        const err = new Error('Du hast bereits gewettet');
        err.statusCode = 400;
        throw err;
      }

      debitTokens(db, session.user.id, betAmount);
      db.prepare('INSERT INTO crash_bets (game_id, user_id, amount) VALUES (?, ?, ?)').run(game.id, session.user.id, betAmount);
    });
    placeBet();

    return res.status(200).json({ success: true });
  } catch (error) {
    return sendApiError(res, error);
  }
}
