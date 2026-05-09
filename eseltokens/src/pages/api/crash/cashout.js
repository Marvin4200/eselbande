import getDb from '@/lib/db';
import { methodAllowed, requireSession, sendApiError } from '@/lib/apiGuards';
import { creditTokens, recordTransaction } from '@/lib/tokenLedger';

const MULTIPLIER_SPEED = 0.00006;

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ['POST'])) return;

  const session = await requireSession(req, res);
  if (!session) return;

  try {
    const db = getDb();
    const now = Date.now();

    // Get current game
    const game = db.prepare('SELECT * FROM crash_games ORDER BY id DESC LIMIT 1').get();
    if (!game || game.status !== 'running') {
      return res.status(400).json({ error: 'Spiel läuft nicht' });
    }

    // Calculate current multiplier
    const currentMultiplier = Math.floor(100 * Math.exp(MULTIPLIER_SPEED * (now - game.started_at))) / 100;

    // Check if game should have crashed already
    if (currentMultiplier >= game.crash_point) {
      return res.status(400).json({ error: 'Zu spät!' });
    }

    // Get user's bet
    const bet = db.prepare('SELECT * FROM crash_bets WHERE game_id = ? AND user_id = ? AND status = ?').get(game.id, session.user.id, 'active');
    if (!bet) {
      return res.status(400).json({ error: 'Keine aktive Wette' });
    }

    let finalMultiplier = currentMultiplier;
    let payout = Math.floor(bet.amount * currentMultiplier);
    let profit = payout - bet.amount;

    const cashout = db.transaction(() => {
      const freshGame = db.prepare('SELECT status, crash_point, started_at FROM crash_games WHERE id = ?').get(game.id);
      if (!freshGame || freshGame.status !== 'running') {
        const err = new Error('Spiel läuft nicht');
        err.statusCode = 400;
        throw err;
      }

      const freshMultiplier = Math.floor(100 * Math.exp(MULTIPLIER_SPEED * (Date.now() - freshGame.started_at))) / 100;
      if (freshMultiplier >= freshGame.crash_point) {
        const err = new Error('Zu spät!');
        err.statusCode = 400;
        throw err;
      }

      finalMultiplier = freshMultiplier;
      payout = Math.floor(bet.amount * finalMultiplier);
      profit = payout - bet.amount;

      const result = db.prepare('UPDATE crash_bets SET cashout_multiplier = ?, status = ? WHERE id = ? AND status = ?')
        .run(freshMultiplier, 'won', bet.id, 'active');
      if (result.changes !== 1) {
        const err = new Error('Keine aktive Wette');
        err.statusCode = 400;
        throw err;
      }

      creditTokens(db, session.user.id, payout);
      if (profit > 0) {
        recordTransaction(db, { fromUserId: session.user.id, type: 'crash_win', amount: profit });
      }
    });
    cashout();

    return res.status(200).json({ success: true, multiplier: finalMultiplier, payout, profit });
  } catch (error) {
    return sendApiError(res, error);
  }
}
