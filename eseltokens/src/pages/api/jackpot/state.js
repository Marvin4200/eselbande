import getDb from '@/lib/db';
import { getServerSession } from 'next-auth';
import authOptions from '@/lib/authOptions';
import crypto from 'crypto';

const DEPOSIT_DURATION  = 20000;   // 20s betting window
const SPIN_DURATION     = 6000;    // 6s spin animation
const FINISH_DELAY      = 5000;    // 5s result display
const HOUSE_EDGE        = 0.05;    // 5% cut when a player wins
const HOUSE_WIN_CHANCE  = 0.10;    // 10% chance the house takes the whole pot
const MIN_POT           = 2;       // minimum total pot to run a round
const HISTORY_SIZE      = 20;

// Player color palette (10 distinct colours)
const PLAYER_COLORS = [
  '#f59e0b', // amber
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // emerald
  '#8b5cf6', // purple
  '#f97316', // orange
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#84cc16', // lime
  '#6366f1', // indigo
];

function assignWinner(db, game) {
  const deposits = db.prepare('SELECT * FROM jackpot_deposits WHERE game_id = ? ORDER BY id ASC').all(game.id);
  if (deposits.length === 0) return null;

  const totalPot = deposits.reduce((s, d) => s + d.amount, 0);
  if (totalPot < MIN_POT) return null;

  const playerShare = 1 - HOUSE_WIN_CHANCE; // players share [0, 0.9), house gets [0.9, 1.0)

  // Build ticket ranges within [0, playerShare)
  let cursor = 0;
  const ranges = [];
  for (const dep of deposits) {
    const share = (dep.amount / totalPot) * playerShare;
    const start = cursor;
    const end = cursor + share;
    cursor = end;
    ranges.push({ ...dep, ticket_start: start, ticket_end: end });
  }

  // Update ticket ranges in DB
  const updateTicket = db.prepare('UPDATE jackpot_deposits SET ticket_start = ?, ticket_end = ? WHERE id = ?');
  for (const r of ranges) updateTicket.run(r.ticket_start, r.ticket_end, r.id);

  // Single spin decides everything — house wins if ticket lands in [playerShare, 1.0)
  const winningTicket = crypto.randomInt(0, 2 ** 32) / 2 ** 32;

  if (winningTicket >= playerShare) {
    return { houseWins: true, winningTicket, houseCut: totalPot, winnerAmount: 0 };
  }

  // Player wins
  const winner = ranges.find(r => winningTicket >= r.ticket_start && winningTicket < r.ticket_end) || ranges[ranges.length - 1];

  const houseCut = Math.floor(totalPot * HOUSE_EDGE);
  const winnerAmount = totalPot - houseCut;

  return { houseWins: false, winner, winningTicket, houseCut, winnerAmount };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session || !['member', 'moderator', 'admin'].includes(session.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const db = getDb();
  const now = Date.now();

  // Get or create current game
  let game = db.prepare(`SELECT * FROM jackpot_games WHERE status != 'finished' ORDER BY id DESC LIMIT 1`).get();

  if (!game) {
    // Start fresh game
    const info = db.prepare(`INSERT INTO jackpot_games (status, created_at) VALUES ('depositing', ?)`).run(now);
    game = db.prepare('SELECT * FROM jackpot_games WHERE id = ?').get(info.lastInsertRowid);
  }

  // --- State transitions ---

  if (game.status === 'depositing') {
    const elapsed = now - game.created_at;
    if (elapsed >= DEPOSIT_DURATION) {
      // Check if enough players
      const deposits = db.prepare('SELECT * FROM jackpot_deposits WHERE game_id = ?').all(game.id);
      const totalPot = deposits.reduce((s, d) => s + d.amount, 0);
      const uniquePlayers = new Set(deposits.map(d => d.user_id)).size;

      if (uniquePlayers < 1 || totalPot < MIN_POT) {
        // Not enough players — refund all and restart
        const refund = db.transaction(() => {
          for (const dep of deposits) {
            db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(dep.amount, dep.user_id);
          }
          db.prepare(`UPDATE jackpot_games SET status = 'finished', finished_at = ? WHERE id = ? AND status = 'depositing'`).run(now, game.id);
        });
        refund();
        // Immediately create a new game
        const info = db.prepare(`INSERT INTO jackpot_games (status, created_at) VALUES ('depositing', ?)`).run(now);
        game = db.prepare('SELECT * FROM jackpot_games WHERE id = ?').get(info.lastInsertRowid);
      } else {
        // Transition to spinning — pick winner now
        const result = assignWinner(db, game);
        if (result) {
          if (result.houseWins) {
            // House wins: no player winner, house_won = 1
            const updated = db.prepare(`UPDATE jackpot_games SET status = 'spinning', spinning_at = ?, winner_user_id = NULL, house_won = 1, winning_ticket = ?, total_pot = ?, house_cut = ? WHERE id = ? AND status = 'depositing'`)
              .run(now, result.winningTicket, totalPot, result.houseCut, game.id);
            if (updated.changes !== 1) return res.status(409).json({ error: 'Game state changed' });
            // All deposits are losses
            for (const dep of deposits) {
              db.prepare(`INSERT INTO transactions (fromUserId, type, amount) VALUES (?, 'jackpot_lose', ?)`).run(dep.user_id, dep.amount);
            }
          } else {
            const updated = db.prepare(`UPDATE jackpot_games SET status = 'spinning', spinning_at = ?, winner_user_id = ?, house_won = 0, winning_ticket = ?, total_pot = ?, house_cut = ? WHERE id = ? AND status = 'depositing'`)
              .run(now, result.winner.user_id, result.winningTicket, totalPot, result.houseCut, game.id);
            if (updated.changes !== 1) return res.status(409).json({ error: 'Game state changed' });
            // Record jackpot_lose for non-winners
            const nonWinners = deposits.filter(d => d.user_id !== result.winner.user_id);
            for (const dep of nonWinners) {
              db.prepare(`INSERT INTO transactions (fromUserId, type, amount) VALUES (?, 'jackpot_lose', ?)`).run(dep.user_id, dep.amount);
            }
          }

          game = db.prepare('SELECT * FROM jackpot_games WHERE id = ?').get(game.id);
        }
      }
    }
  }

  if (game.status === 'spinning') {
    const spinElapsed = now - game.spinning_at;
    if (spinElapsed >= SPIN_DURATION) {
      const finish = db.transaction(() => {
        const locked = db.prepare(`UPDATE jackpot_games SET status = 'finished', finished_at = ? WHERE id = ? AND status = 'spinning'`).run(now, game.id);
        if (locked.changes !== 1) return;

        if (!game.house_won && game.winner_user_id) {
          // Pay out player winner
          const winnerAmount = game.total_pot - game.house_cut;
          db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(winnerAmount, game.winner_user_id);
          db.prepare(`INSERT INTO transactions (fromUserId, type, amount) VALUES (?, 'jackpot_win', ?)`).run(game.winner_user_id, winnerAmount);
        }
        // If house_won, tokens stay in the house — no payout needed
      });
      finish();
      game = db.prepare('SELECT * FROM jackpot_games WHERE id = ?').get(game.id);
    }
  }

  if (game.status === 'finished') {
    const finishElapsed = now - game.finished_at;
    if (finishElapsed >= FINISH_DELAY) {
      // Start new game
      const info = db.prepare(`INSERT INTO jackpot_games (status, created_at) VALUES ('depositing', ?)`).run(now);
      game = db.prepare('SELECT * FROM jackpot_games WHERE id = ?').get(info.lastInsertRowid);
    }
  }

  // Build deposits with colours and percentages
  const rawDeposits = db.prepare('SELECT * FROM jackpot_deposits WHERE game_id = ? ORDER BY id ASC').all(game.id);
  const totalPot = rawDeposits.reduce((s, d) => s + d.amount, 0);

  // Assign colours per unique player (in order of first deposit)
  const colorMap = {};
  let colorIdx = 0;
  for (const dep of rawDeposits) {
    if (colorMap[dep.user_id] === undefined) {
      colorMap[dep.user_id] = PLAYER_COLORS[colorIdx % PLAYER_COLORS.length];
      colorIdx++;
    }
  }

  // Aggregate by player for display
  const playerMap = {};
  for (const dep of rawDeposits) {
    if (!playerMap[dep.user_id]) {
      playerMap[dep.user_id] = { userId: dep.user_id, username: dep.username, amount: 0, color: colorMap[dep.user_id], isMe: dep.user_id === session.user.id };
    }
    playerMap[dep.user_id].amount += dep.amount;
  }
  const players = Object.values(playerMap).map(p => ({
    ...p,
    percentage: totalPot > 0 ? (p.amount / totalPot) * 100 : 0,
  }));

  // Always append the house as a visual participant (~10% of the wheel)
  // House visual amount = exactly HOUSE_WIN_CHANCE (10%) of the visual wheel
  // Formula: houseAmount / (totalPot + houseAmount) = HOUSE_WIN_CHANCE
  // => houseAmount = totalPot * HOUSE_WIN_CHANCE / (1 - HOUSE_WIN_CHANCE)
  const houseVisualAmount = totalPot > 0 ? totalPot * HOUSE_WIN_CHANCE / (1 - HOUSE_WIN_CHANCE) : 0;
  const visualTotal = totalPot + houseVisualAmount;
  if (houseVisualAmount > 0) {
    // Recalculate real player percentages with house included
    for (const p of players) {
      p.percentage = (p.amount / visualTotal) * 100;
    }
    players.push({
      userId: 0,
      username: '🫏 Das Haus',
      amount: houseVisualAmount,
      color: '#3d0066',
      isMe: false,
      isHouse: true,
      percentage: (houseVisualAmount / visualTotal) * 100,
    });
  }

  // Build winner info if game has one
  let winner = null;
  const houseWon = game.house_won === 1;
  if (houseWon) {
    // Synthetic winner pointing to the house player (for spin animation targeting)
    const housePlayer = players.find(p => p.isHouse);
    if (housePlayer) winner = { ...housePlayer, payout: game.total_pot, isHouse: true };
  } else if (game.winner_user_id) {
    const winnerPlayer = players.find(p => p.userId === game.winner_user_id);
    winner = winnerPlayer ? { ...winnerPlayer, payout: game.total_pot - game.house_cut } : null;
  }

  // History (last N finished games with winners)
  const history = db.prepare(`
    SELECT g.id, g.total_pot, g.house_cut, g.finished_at, g.house_won,
           u.username as winner_username, g.winner_user_id
    FROM jackpot_games g
    LEFT JOIN users u ON g.winner_user_id = u.id
    WHERE g.status = 'finished' AND (g.winner_user_id IS NOT NULL OR g.house_won = 1)
    ORDER BY g.id DESC LIMIT ?
  `).all(HISTORY_SIZE);

  return res.status(200).json({
    gameId: game.id,
    status: game.status,
    createdAt: game.created_at,
    spinningAt: game.spinning_at,
    finishedAt: game.finished_at,
    depositEndsAt: game.created_at + DEPOSIT_DURATION,
    totalPot,
    houseCut: game.house_cut,
    players,
    winner,
    winningTicket: game.status !== 'depositing' ? game.winning_ticket : null,
    houseWon,
    myBalance: db.prepare('SELECT balance FROM users WHERE id = ?').get(session.user.id)?.balance ?? 0,
    history: history.map(h => ({
      id: h.id,
      pot: h.total_pot,
      winner: h.house_won ? '🫏 Haus' : h.winner_username,
      payout: h.house_won ? h.total_pot : h.total_pot - h.house_cut,
      winnerId: h.winner_user_id,
      houseWon: h.house_won === 1,
      isMe: !h.house_won && h.winner_user_id === session.user.id,
    })),
    serverTime: now,
  });
}
