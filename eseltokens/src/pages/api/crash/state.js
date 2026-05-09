import getDb from '@/lib/db';
import { getServerSession } from 'next-auth';
import authOptions from '@/lib/authOptions';
import crypto from 'crypto';

const MULTIPLIER_SPEED = 0.00006;
const BETTING_DURATION = 7000;
const AFTER_CRASH_DELAY = 4000;

function generateCrashPoint() {
  const r = (crypto.randomInt(1, 2 ** 32) / 2 ** 32);
  // 10% house edge — aggressive
  // ~10% instant crash, ~55% below 2x, ~82% below 5x
  return Math.max(1.00, Math.floor(100 * 0.90 / r) / 100);
}

function getMultiplier(startedAt, now) {
  const elapsed = now - startedAt;
  return Math.floor(100 * Math.exp(MULTIPLIER_SPEED * elapsed)) / 100;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end();
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session || !['member', 'moderator', 'admin'].includes(session.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const db = getDb();
  const now = Date.now();

  let game = db.prepare('SELECT * FROM crash_games ORDER BY id DESC LIMIT 1').get();

  // Create new game if none exists or last game crashed long enough ago
  if (!game || (game.status === 'crashed' && now - game.crashed_at >= AFTER_CRASH_DELAY)) {
    const crashPoint = generateCrashPoint();
    db.prepare('INSERT INTO crash_games (crash_point, status, created_at) VALUES (?, ?, ?)').run(crashPoint, 'betting', now);
    game = db.prepare('SELECT * FROM crash_games ORDER BY id DESC LIMIT 1').get();
  }

  // Transition from betting to running
  if (game.status === 'betting' && now - game.created_at >= BETTING_DURATION) {
    const result = db.prepare('UPDATE crash_games SET status = ?, started_at = ? WHERE id = ? AND status = ?').run('running', now, game.id, 'betting');
    if (result.changes > 0) {
      game.status = 'running';
      game.started_at = now;
    } else {
      game = db.prepare('SELECT * FROM crash_games WHERE id = ?').get(game.id);
    }
  }

  // Check if game should crash
  if (game.status === 'running') {
    const currentMultiplier = getMultiplier(game.started_at, now);
    if (currentMultiplier >= game.crash_point) {
      const result = db.prepare('UPDATE crash_games SET status = ?, crashed_at = ? WHERE id = ? AND status = ?').run('crashed', now, game.id, 'running');
      if (result.changes > 0) {
        // Process losses for all active bets
        const activeBets = db.prepare('SELECT * FROM crash_bets WHERE game_id = ? AND status = ?').all(game.id, 'active');
        const settleLosses = db.transaction(() => {
          db.prepare('UPDATE crash_bets SET status = ? WHERE game_id = ? AND status = ?').run('lost', game.id, 'active');
          for (const bet of activeBets) {
            db.prepare('INSERT INTO transactions (fromUserId, type, amount) VALUES (?, ?, ?)').run(bet.user_id, 'crash_lose', bet.amount);
          }
        });
        settleLosses();
      }
      game.status = 'crashed';
      game.crashed_at = now;
    }
  }

  // Get bets for current game
  const bets = db.prepare(`
    SELECT cb.*, u.username 
    FROM crash_bets cb 
    JOIN users u ON cb.user_id = u.id 
    WHERE cb.game_id = ?
    ORDER BY cb.amount DESC
  `).all(game.id);

  // Get recent crash history
  const history = db.prepare('SELECT crash_point FROM crash_games WHERE status = ? ORDER BY id DESC LIMIT 20').all('crashed');

  const response = {
    gameId: game.id,
    status: game.status,
    createdAt: game.created_at,
    startedAt: game.started_at,
    crashedAt: game.crashed_at,
    crashPoint: game.status === 'crashed' ? game.crash_point : undefined,
    bets: bets.map(b => ({
      username: b.username,
      amount: b.amount,
      cashoutMultiplier: b.cashout_multiplier,
      status: b.status,
      isMe: b.user_id === session.user.id,
    })),
    history: history.map(h => h.crash_point),
    serverTime: now,
  };

  if (game.status === 'betting') {
    response.bettingEndsAt = game.created_at + BETTING_DURATION;
  }

  res.status(200).json(response);
}
