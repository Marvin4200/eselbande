import getDb from '@/lib/db';
import { getServerSession } from 'next-auth';
import authOptions from '@/lib/authOptions';
import { calculateHand, canDouble, canSplit } from '@/lib/blackjack';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end();
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });

  const { tableId } = req.query;
  if (!tableId) return res.status(400).json({ error: 'Missing tableId' });

  const db = getDb();
  const table = db.prepare('SELECT * FROM blackjack_tables WHERE id = ?').get(tableId);
  if (!table) return res.status(404).json({ error: 'Table not found' });

  const players = db.prepare('SELECT * FROM blackjack_players WHERE tableId = ? ORDER BY seatIndex').all(tableId);
  const me = players.find(p => p.userId === session.user.id);
  const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(session.user.id);

  // Hide dealer's hole card unless finished
  let dealerCards = JSON.parse(table.dealerCards);
  let dealerValue = null;
  if (table.status === 'finished') {
    dealerValue = calculateHand(dealerCards).value;
  } else if (dealerCards.length >= 2) {
    dealerCards = [dealerCards[0], null]; // hide second card
  }

  const playerData = players.map(p => {
    const hands = JSON.parse(p.hands);
    return {
      seatIndex: p.seatIndex,
      username: p.username,
      userId: p.userId,
      isMe: p.userId === session.user.id,
      isReady: !!p.isReady,
      currentHandIndex: p.currentHandIndex,
      hands: hands.map(h => ({
        cards: h.cards,
        bet: h.bet,
        status: h.status,
        value: calculateHand(h.cards).value,
        bust: calculateHand(h.cards).bust,
        blackjack: calculateHand(h.cards).blackjack,
        canSplit: h.status === 'playing' && canSplit(h.cards),
        canDouble: h.status === 'playing' && canDouble(h.cards),
      })),
    };
  });

  return res.status(200).json({
    table: {
      id: table.id,
      status: table.status,
      dealerCards,
      dealerValue,
      currentSeat: table.currentSeat,
    },
    players: playerData,
    myPlayer: me ? {
      seatIndex: me.seatIndex,
      isReady: !!me.isReady,
    } : null,
    myBalance: user?.balance ?? 0,
  });
}
