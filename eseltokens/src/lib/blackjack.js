import crypto from 'crypto';

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function createDeck(numDecks = 2) {
  const deck = [];
  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ suit, rank });
      }
    }
  }
  return shuffleDeck(deck);
}

export function shuffleDeck(deck) {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function cardValue(rank) {
  if (rank === 'A') return 11;
  if (['K', 'Q', 'J'].includes(rank)) return 10;
  return parseInt(rank);
}

export function calculateHand(cards) {
  let value = 0;
  let aces = 0;
  for (const card of cards) {
    value += cardValue(card.rank);
    if (card.rank === 'A') aces++;
  }
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  return {
    value,
    soft: aces > 0,
    bust: value > 21,
    blackjack: cards.length === 2 && value === 21,
  };
}

export function canSplit(cards) {
  return cards.length === 2 && cardValue(cards[0].rank) === cardValue(cards[1].rank);
}

export function canDouble(cards) {
  return cards.length === 2;
}

export function dealerShouldHit(cards) {
  return calculateHand(cards).value < 17;
}

export function drawCard(deck) {
  return { card: deck[0], deck: deck.slice(1) };
}

// After a player action, advance to next hand/player or trigger dealer
export function advanceGame(db, tableId) {
  const table = db.prepare('SELECT * FROM blackjack_tables WHERE id = ?').get(tableId);
  const players = db.prepare('SELECT * FROM blackjack_players WHERE tableId = ? ORDER BY seatIndex').all(tableId);
  const currentPlayer = players.find(p => p.seatIndex === table.currentSeat);

  if (currentPlayer) {
    const hands = JSON.parse(currentPlayer.hands);
    const idx = currentPlayer.currentHandIndex;

    // Check if current player has more hands
    for (let i = idx + 1; i < hands.length; i++) {
      if (hands[i].status === 'playing') {
        db.prepare('UPDATE blackjack_players SET currentHandIndex = ? WHERE id = ?').run(i, currentPlayer.id);
        return;
      }
    }
  }

  // Move to next player with an active hand
  for (const p of players) {
    if (p.seatIndex <= table.currentSeat) continue;
    const hands = JSON.parse(p.hands);
    if (hands.some(h => h.status === 'playing')) {
      db.prepare('UPDATE blackjack_tables SET currentSeat = ?, updatedAt = datetime(\'now\') WHERE id = ?').run(p.seatIndex, tableId);
      db.prepare('UPDATE blackjack_players SET currentHandIndex = 0 WHERE id = ?').run(p.id);
      return;
    }
  }

  // No more players → dealer plays
  playDealer(db, tableId);
}

export function playDealer(db, tableId) {
  const table = db.prepare('SELECT * FROM blackjack_tables WHERE id = ?').get(tableId);
  const players = db.prepare('SELECT * FROM blackjack_players WHERE tableId = ? ORDER BY seatIndex').all(tableId);
  let deck = JSON.parse(table.deck);
  let dealerCards = JSON.parse(table.dealerCards);

  // Check if all players busted
  const allBusted = players.every(p => {
    const hands = JSON.parse(p.hands);
    return hands.every(h => h.status === 'busted');
  });

  if (!allBusted) {
    while (dealerShouldHit(dealerCards)) {
      const result = drawCard(deck);
      dealerCards.push(result.card);
      deck = result.deck;
    }
  }

  const dealerHand = calculateHand(dealerCards);

  // Resolve each player
  for (const player of players) {
    const hands = JSON.parse(player.hands);
    let totalPayout = 0;

    for (const hand of hands) {
      if (hand.status === 'busted') {
        hand.status = 'lost';
        // Record loss
        db.prepare('INSERT INTO transactions (fromUserId, type, amount) VALUES (?, ?, ?)').run(player.userId, 'blackjack_lose', hand.bet);
        continue;
      }

      const ph = calculateHand(hand.cards);

      if (ph.blackjack && !dealerHand.blackjack) {
        // Blackjack pays 3:2
        const winnings = Math.floor(hand.bet * 1.5);
        totalPayout += hand.bet + winnings;
        hand.status = 'blackjack';
        if (winnings > 0) {
          db.prepare('INSERT INTO transactions (fromUserId, type, amount) VALUES (?, ?, ?)').run(player.userId, 'blackjack_win', winnings);
        }
      } else if (dealerHand.bust || ph.value > dealerHand.value) {
        totalPayout += hand.bet * 2;
        hand.status = 'won';
        db.prepare('INSERT INTO transactions (fromUserId, type, amount) VALUES (?, ?, ?)').run(player.userId, 'blackjack_win', hand.bet);
      } else if (ph.value === dealerHand.value) {
        totalPayout += hand.bet; // push — return bet
        hand.status = 'push';
      } else {
        hand.status = 'lost';
        db.prepare('INSERT INTO transactions (fromUserId, type, amount) VALUES (?, ?, ?)').run(player.userId, 'blackjack_lose', hand.bet);
      }
    }

    // Return payouts
    if (totalPayout > 0) {
      db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(totalPayout, player.userId);
    }

    db.prepare('UPDATE blackjack_players SET hands = ? WHERE id = ?').run(JSON.stringify(hands), player.id);
  }

  db.prepare('UPDATE blackjack_tables SET status = ?, deck = ?, dealerCards = ?, currentSeat = -1, updatedAt = datetime(\'now\') WHERE id = ?')
    .run('finished', JSON.stringify(deck), JSON.stringify(dealerCards), tableId);
}
