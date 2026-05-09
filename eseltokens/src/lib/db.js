import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'eseltokens.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');

    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discordId TEXT UNIQUE NOT NULL,
        username TEXT NOT NULL,
        discriminator TEXT,
        avatar TEXT,
        balance INTEGER DEFAULT 0,
        role TEXT DEFAULT 'pending' CHECK(role IN ('pending', 'member', 'moderator', 'admin')),
        createdAt TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fromUserId INTEGER NOT NULL,
        toUserId INTEGER,
        type TEXT NOT NULL,
        amount INTEGER DEFAULT 1,
        createdAt TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (fromUserId) REFERENCES users(id),
        FOREIGN KEY (toUserId) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS blackjack_tables (
        id TEXT PRIMARY KEY,
        status TEXT DEFAULT 'waiting',
        deck TEXT DEFAULT '[]',
        dealerCards TEXT DEFAULT '[]',
        currentSeat INTEGER DEFAULT -1,
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS blackjack_players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tableId TEXT NOT NULL,
        userId INTEGER NOT NULL,
        username TEXT NOT NULL,
        seatIndex INTEGER NOT NULL,
        hands TEXT DEFAULT '[]',
        currentHandIndex INTEGER DEFAULT 0,
        isReady INTEGER DEFAULT 0,
        createdAt TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (tableId) REFERENCES blackjack_tables(id) ON DELETE CASCADE,
        UNIQUE(tableId, seatIndex),
        UNIQUE(tableId, userId)
      );

      CREATE TABLE IF NOT EXISTS giveaways (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prize TEXT NOT NULL,
        duration INTEGER NOT NULL,
        winners INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        ended_at TEXT
      );
    `);

    // Add xp column if it doesn't exist
    const userCols = db.prepare("PRAGMA table_info(users)").all();
    if (!userCols.find(c => c.name === 'xp')) {
      db.exec('ALTER TABLE users ADD COLUMN xp INTEGER DEFAULT 0');
    }

    // Crash game tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS crash_games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        crash_point REAL NOT NULL,
        status TEXT DEFAULT 'betting',
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        crashed_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS crash_bets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        cashout_multiplier REAL,
        status TEXT DEFAULT 'active',
        FOREIGN KEY (game_id) REFERENCES crash_games(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    // Jackpot tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS jackpot_games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        status TEXT DEFAULT 'depositing',
        winner_user_id INTEGER,
        house_won INTEGER DEFAULT 0,
        total_pot INTEGER DEFAULT 0,
        house_cut INTEGER DEFAULT 0,
        winning_ticket REAL,
        created_at INTEGER NOT NULL,
        spinning_at INTEGER,
        finished_at INTEGER,
        FOREIGN KEY (winner_user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS jackpot_deposits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        username TEXT NOT NULL,
        amount INTEGER NOT NULL,
        ticket_start REAL NOT NULL,
        ticket_end REAL NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (game_id) REFERENCES jackpot_games(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    // Migrations — safe to run on every startup
    try { db.exec(`ALTER TABLE jackpot_games ADD COLUMN house_won INTEGER DEFAULT 0`); } catch { /* column already exists */ }

    // Reward state table (cooldowns/one-time rewards). Integers are epoch-ms.
    db.exec(`
      CREATE TABLE IF NOT EXISTS reward_state (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        rewardKey TEXT NOT NULL,
        lastClaimAt INTEGER NOT NULL,
        claimCount INTEGER DEFAULT 1,
        meta TEXT,
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(userId, rewardKey)
      );
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(createdAt);
      CREATE INDEX IF NOT EXISTS idx_crash_games_status ON crash_games(status);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_crash_bets_game_user ON crash_bets(game_id, user_id);
      CREATE INDEX IF NOT EXISTS idx_jackpot_games_status ON jackpot_games(status);
      CREATE INDEX IF NOT EXISTS idx_jackpot_deposits_game ON jackpot_deposits(game_id);
      CREATE INDEX IF NOT EXISTS idx_blackjack_players_table ON blackjack_players(tableId);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_state_user_key ON reward_state(userId, rewardKey);
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS voice_reward_claims (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sessionId TEXT UNIQUE NOT NULL,
        userId INTEGER NOT NULL,
        discordId TEXT NOT NULL,
        guildId TEXT,
        channelId TEXT,
        durationMs INTEGER NOT NULL DEFAULT 0,
        amountRequested INTEGER NOT NULL DEFAULT 0,
        amountGranted INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_voice_reward_claims_user ON voice_reward_claims(userId);
      CREATE INDEX IF NOT EXISTS idx_voice_reward_claims_created ON voice_reward_claims(createdAt);
    `);
  }
  return db;
}

export default getDb;
