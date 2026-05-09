import getDb from '@/lib/db';
import { drawCard, calculateHand, canSplit, canDouble, advanceGame } from '@/lib/blackjack';
import { methodAllowed, requireSession, sendApiError } from '@/lib/apiGuards';
import { debitTokens } from '@/lib/tokenLedger';

export default async function handler(req, res) {
  if (!methodAllowed(req, res, ['POST'])) return;

  const session = await requireSession(req, res);
  if (!session) return;

  try {
    const { tableId, action } = req.body; // action: hit, stand, double, split
    const db = getDb();

  const table = db.prepare('SELECT * FROM blackjack_tables WHERE id = ?').get(tableId);
  if (!table) return res.status(404).json({ error: 'Tisch nicht gefunden' });
  if (table.status !== 'playing') return res.status(400).json({ error: 'Spiel läuft nicht' });

  const player = db.prepare('SELECT * FROM blackjack_players WHERE tableId = ? AND userId = ?').get(tableId, session.user.id);
  if (!player) return res.status(400).json({ error: 'Du bist nicht an diesem Tisch' });
  if (player.seatIndex !== table.currentSeat) return res.status(400).json({ error: 'Du bist nicht dran' });

  const hands = JSON.parse(player.hands);
  const handIdx = player.currentHandIndex;
  const hand = hands[handIdx];
  if (!hand || hand.status !== 'playing') return res.status(400).json({ error: 'Ungültige Hand' });

  let deck = JSON.parse(table.deck);

  switch (action) {
    case 'hit': {
      const result = drawCard(deck);
      hand.cards.push(result.card);
      deck = result.deck;

      const hv = calculateHand(hand.cards);
      if (hv.bust) {
        hand.status = 'busted';
      } else if (hv.value === 21) {
        hand.status = 'stood';
      }

      db.prepare('UPDATE blackjack_players SET hands = ? WHERE id = ?').run(JSON.stringify(hands), player.id);
      db.prepare('UPDATE blackjack_tables SET deck = ?, updatedAt = datetime(\'now\') WHERE id = ?').run(JSON.stringify(deck), tableId);

      if (hand.status !== 'playing') {
        advanceGame(db, tableId);
      }
      break;
    }

    case 'stand': {
      hand.status = 'stood';
      db.prepare('UPDATE blackjack_players SET hands = ? WHERE id = ?').run(JSON.stringify(hands), player.id);
      db.prepare("UPDATE blackjack_tables SET updatedAt = datetime('now') WHERE id = ?").run(tableId);
      advanceGame(db, tableId);
      break;
    }

    case 'double': {
      if (!canDouble(hand.cards)) {
        return res.status(400).json({ error: 'Kann nicht verdoppeln' });
      }

      // Deduct additional bet
      debitTokens(db, session.user.id, hand.bet);
      hand.bet *= 2;

      // Draw exactly one card
      const result = drawCard(deck);
      hand.cards.push(result.card);
      deck = result.deck;

      const hv = calculateHand(hand.cards);
      hand.status = hv.bust ? 'busted' : 'stood';

      db.prepare('UPDATE blackjack_players SET hands = ? WHERE id = ?').run(JSON.stringify(hands), player.id);
      db.prepare('UPDATE blackjack_tables SET deck = ?, updatedAt = datetime(\'now\') WHERE id = ?').run(JSON.stringify(deck), tableId);
      advanceGame(db, tableId);
      break;
    }

    case 'split': {
      if (!canSplit(hand.cards)) {
        return res.status(400).json({ error: 'Kann nicht splitten' });
      }
      if (hands.length >= 3) {
        return res.status(400).json({ error: 'Maximale Splits erreicht' });
      }

      // Deduct bet for new hand
      debitTokens(db, session.user.id, hand.bet);

      const card1 = hand.cards[0];
      const card2 = hand.cards[1];
      const origBet = hand.bet;

      // Draw one card for each hand
      const r1 = drawCard(deck);
      deck = r1.deck;
      const r2 = drawCard(deck);
      deck = r2.deck;

      // Replace current hand and add new hand
      const isAces = card1.rank === 'A';
      hands[handIdx] = {
        cards: [card1, r1.card],
        bet: origBet,
        status: isAces ? 'stood' : 'playing', // Aces get only one card
      };
      hands.splice(handIdx + 1, 0, {
        cards: [card2, r2.card],
        bet: origBet,
        status: isAces ? 'stood' : 'playing',
      });

      // Check for 21 on split hands
      for (let i = handIdx; i <= handIdx + 1; i++) {
        const hv = calculateHand(hands[i].cards);
        if (hv.value === 21 && hands[i].status === 'playing') {
          hands[i].status = 'stood';
        }
      }

      db.prepare('UPDATE blackjack_players SET hands = ? WHERE id = ?').run(JSON.stringify(hands), player.id);
      db.prepare('UPDATE blackjack_tables SET deck = ?, updatedAt = datetime(\'now\') WHERE id = ?').run(JSON.stringify(deck), tableId);

      // If aces were split, both hands are stood → advance
      if (isAces || hands[handIdx].status !== 'playing') {
        advanceGame(db, tableId);
      }
      break;
    }

    default:
      return res.status(400).json({ error: 'Ungültige Aktion' });
  }

    return res.status(200).json({ success: true });
  } catch (error) {
    return sendApiError(res, error);
  }
}
