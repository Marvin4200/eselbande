import getDb from '@/lib/db';
import { createDeck, drawCard, calculateHand, playDealer } from '@/lib/blackjack';
import { methodAllowed, parseTokenAmount, requireSession, sendApiError } from '@/lib/apiGuards';
import { debitTokens } from '@/lib/tokenLedger';

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ['POST'])) return;

  const session = await requireSession(req, res);
  if (!session) return;

  try {
    const { tableId, amount } = req.body;
    const bet = parseTokenAmount(amount);

    const db = getDb();

    const table = db.prepare('SELECT * FROM blackjack_tables WHERE id = ?').get(tableId);
    if (!table) return res.status(404).json({ error: 'Tisch nicht gefunden' });
    if (table.status !== 'betting') return res.status(400).json({ error: 'Nicht in der Setzphase' });

    const player = db.prepare('SELECT * FROM blackjack_players WHERE tableId = ? AND userId = ?').get(tableId, session.user.id);
    if (!player) return res.status(400).json({ error: 'Du bist nicht an diesem Tisch' });

    const hands = JSON.parse(player.hands);
    if (hands.length > 0) return res.status(400).json({ error: 'Du hast bereits gesetzt' });

    const placeBet = db.transaction(() => {
      const currentTable = db.prepare('SELECT status FROM blackjack_tables WHERE id = ?').get(tableId);
      if (!currentTable || currentTable.status !== 'betting') {
        const err = new Error('Nicht in der Setzphase');
        err.statusCode = 400;
        throw err;
      }

      const currentPlayer = db.prepare('SELECT * FROM blackjack_players WHERE tableId = ? AND userId = ?').get(tableId, session.user.id);
      if (!currentPlayer) {
        const err = new Error('Du bist nicht an diesem Tisch');
        err.statusCode = 400;
        throw err;
      }

      const currentHands = JSON.parse(currentPlayer.hands);
      if (currentHands.length > 0) {
        const err = new Error('Du hast bereits gesetzt');
        err.statusCode = 400;
        throw err;
      }

      debitTokens(db, session.user.id, bet);
      const newHands = [{ cards: [], bet, status: 'waiting' }];
      db.prepare('UPDATE blackjack_players SET hands = ? WHERE id = ?').run(JSON.stringify(newHands), currentPlayer.id);
    });
    placeBet();

    // Check if all players have bet after the atomic write.
    const players = db.prepare('SELECT * FROM blackjack_players WHERE tableId = ?').all(tableId);
    const allBet = players.every(p => {
      const h = JSON.parse(p.hands);
      return h.length > 0 && h[0].bet > 0;
    });

    if (allBet) {
      const locked = db.prepare("UPDATE blackjack_tables SET status = 'dealing', updatedAt = datetime('now') WHERE id = ? AND status = 'betting'").run(tableId);
      if (locked.changes === 1) {
        dealCards(db, tableId);
      }
    }

    db.prepare("UPDATE blackjack_tables SET updatedAt = datetime('now') WHERE id = ?").run(tableId);
    return res.status(200).json({ success: true });
  } catch (error) {
    return sendApiError(res, error);
  }
}

function dealCards(db, tableId) {
  let deck = createDeck(2);
  const players = db.prepare('SELECT * FROM blackjack_players WHERE tableId = ? ORDER BY seatIndex').all(tableId);

  const dealerCards = [];

  // Deal 2 cards to each player, then 2 to dealer
  for (let round = 0; round < 2; round++) {
    for (const player of players) {
      const result = drawCard(deck);
      deck = result.deck;
      // Re-read from DB to get the latest hands (important for round 2)
      const freshPlayer = db.prepare('SELECT hands FROM blackjack_players WHERE id = ?').get(player.id);
      const hands = JSON.parse(freshPlayer.hands);
      hands[0].cards.push(result.card);
      db.prepare('UPDATE blackjack_players SET hands = ? WHERE id = ?').run(JSON.stringify(hands), player.id);
    }
    const result = drawCard(deck);
    deck = result.deck;
    dealerCards.push(result.card);
  }

  // Find first player to play
  let firstSeat = -1;
  for (const player of players) {
    const freshPlayer = db.prepare('SELECT hands FROM blackjack_players WHERE id = ?').get(player.id);
    const hands = JSON.parse(freshPlayer.hands);
    const hand = calculateHand(hands[0].cards);
    if (hand.blackjack) {
      hands[0].status = 'blackjack';
      db.prepare('UPDATE blackjack_players SET hands = ? WHERE id = ?').run(JSON.stringify(hands), player.id);
    } else {
      hands[0].status = 'playing';
      db.prepare('UPDATE blackjack_players SET hands = ? WHERE id = ?').run(JSON.stringify(hands), player.id);
      if (firstSeat === -1) firstSeat = player.seatIndex;
    }
  }

  db.prepare('UPDATE blackjack_tables SET status = ?, deck = ?, dealerCards = ?, currentSeat = ?, updatedAt = datetime(\'now\') WHERE id = ?')
    .run('playing', JSON.stringify(deck), JSON.stringify(dealerCards), firstSeat, tableId);

  // If no active players (all blackjack), go to dealer
  if (firstSeat === -1) {
    // Set a dummy currentSeat beyond all players so playDealer triggers
    db.prepare('UPDATE blackjack_tables SET currentSeat = 99 WHERE id = ?').run(tableId);
    playDealer(db, tableId);
  }
}
