import getDb from '@/lib/db';
import crypto from 'crypto';
import { methodAllowed, parseTokenAmount, requireSession, sendApiError } from '@/lib/apiGuards';
import { creditTokens, debitTokens, recordTransaction } from '@/lib/tokenLedger';

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ['POST'])) return;
  const session = await requireSession(req, res);
  if (!session) return;

  try {
    const { amount } = req.body;
    const bet = parseTokenAmount(amount);

    const db = getDb();

    // Cryptographically secure random coin flip
    const randomByte = crypto.randomBytes(1)[0];
    const won = randomByte < 128; // 50/50

    const play = db.transaction(() => {
      debitTokens(db, session.user.id, bet);
      if (won) {
        creditTokens(db, session.user.id, bet * 2);
      }
      recordTransaction(db, {
        fromUserId: session.user.id,
        type: won ? 'coinflip_win' : 'coinflip_lose',
        amount: bet,
      });
    });
    play();

    const newBalance = db.prepare('SELECT balance FROM users WHERE id = ?').get(session.user.id).balance;

    return res.status(200).json({
      won,
      amount: bet,
      newBalance,
    });
  } catch (error) {
    return sendApiError(res, error);
  }
}
