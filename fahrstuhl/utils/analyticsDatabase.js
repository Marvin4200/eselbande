/**
 * Analytics Database
 * All-time command execution tracking using sql.js (pure JavaScript SQLite)
 */

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const dataDir = path.join(__dirname, '../data');
const dbPath = path.join(dataDir, 'analytics.db');

// Create data directory if it doesn't exist
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

class AnalyticsDatabase {
    constructor() {
        this.db = null;
        this.SQL = null;
        this.initialized = false;
    }

    /**
     * Initialize database
     */
    async init() {
        try {
            if (this.initialized) return;
            
            // Initialize sql.js
            this.SQL = await initSqlJs();
            
            // Load existing database or create new one
            if (fs.existsSync(dbPath)) {
                const buffer = fs.readFileSync(dbPath);
                this.db = new this.SQL.Database(buffer);
            } else {
                this.db = new this.SQL.Database();
            }
            
            // Create tables
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS command_executions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    command TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    guild_id TEXT NOT NULL,
                    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
                    success INTEGER DEFAULT 1,
                    error_message TEXT
                )
            `);
            
            // Create indices for performance
            try {
                this.db.exec(`CREATE INDEX IF NOT EXISTS idx_command ON command_executions(command)`);
                this.db.exec(`CREATE INDEX IF NOT EXISTS idx_user ON command_executions(user_id)`);
                this.db.exec(`CREATE INDEX IF NOT EXISTS idx_guild ON command_executions(guild_id)`);
                this.db.exec(`CREATE INDEX IF NOT EXISTS idx_timestamp ON command_executions(timestamp)`);
            } catch (e) {
                // Indices might already exist, that's OK
                console.debug('Index creation note:', e.message);
            }
            
            this.save();
            this.initialized = true;
            
            console.log('✓ Analytics database initialized');
        } catch (error) {
            console.error('Error initializing analytics database:', error);
            throw error;
        }
    }

    /**
     * Save database to file
     */
    save() {
        try {
            if (!this.db) return;
            const data = this.db.export();
            const buffer = Buffer.from(data);
            fs.writeFileSync(dbPath, buffer);
        } catch (error) {
            console.error('Error saving analytics database:', error);
        }
    }

    /**
     * Track command execution
     */
    trackExecution(command, userId, guildId, success = true, errorMessage = null) {
        try {
            if (!this.db) {
                console.error('Analytics DB not initialized');
                return;
            }
            
            // Use ISO timestamp
            const timestamp = new Date().toISOString();
            
            // Safe SQL escaping for all string values
            const escapeSql = (str) => {
                if (str === null || str === undefined) return 'NULL';
                return `'${String(str).replace(/'/g, "''")}'`;
            };
            
            // Build safe SQL query
            const sql = `INSERT INTO command_executions (command, user_id, guild_id, timestamp, success, error_message)
                         VALUES (${escapeSql(command)}, ${escapeSql(userId)}, ${escapeSql(guildId)}, ${escapeSql(timestamp)}, ${success ? 1 : 0}, ${escapeSql(errorMessage)})`;
            
            try {
                this.db.exec(sql);
                this.save();
                console.log(`✓ Tracked command: ${command} by ${userId}`);
            } catch (sqlError) {
                console.error(`SQL Error tracking command: ${sqlError.message}`);
                console.error(`SQL: ${sql}`);
                return;
            }
            
            // Cleanup if too many entries
            const countResult = this.db.exec(`SELECT COUNT(*) as count FROM command_executions`);
            if (countResult[0] && countResult[0].values[0][0] > 100000) {
                this.cleanup();
            }
        } catch (error) {
            console.error('Error tracking execution:', error);
        }
    }

    /**
     * Get total command executions (all-time)
     */
    getTotalExecutions() {
        try {
            if (!this.db) return 0;
            const result = this.db.exec(`SELECT COUNT(*) as count FROM command_executions`);
            return result[0]?.values[0][0] || 0;
        } catch (error) {
            console.error('Error getting total executions:', error);
            return 0;
        }
    }

    /**
     * Get unique user count (all-time, all guilds)
     */
    getUniqueUserCount() {
        try {
            if (!this.db) return 0;
            const result = this.db.exec(`SELECT COUNT(DISTINCT user_id) as count FROM command_executions`);
            return result[0]?.values[0][0] || 0;
        } catch (error) {
            console.error('Error getting unique user count:', error);
            return 0;
        }
    }

    /**
     * Get most used command (all-time)
     */
    getMostUsedCommand() {
        try {
            if (!this.db) return null;
            const result = this.db.exec(`
                SELECT command, COUNT(*) as count
                FROM command_executions
                GROUP BY command
                ORDER BY count DESC
                LIMIT 1
            `);
            
            if (result[0]?.values[0]) {
                return { command: result[0].values[0][0], count: result[0].values[0][1] };
            }
            return null;
        } catch (error) {
            console.error('Error getting most used command:', error);
            return null;
        }
    }

    /**
     * Get command executions by timeframe
     */
    getExecutionsByTimeframe(timeframe = '24h') {
        try {
            if (!this.db) return [];
            
            let hoursAgo = 24;
            if (timeframe === '7d') hoursAgo = 7 * 24;
            if (timeframe === '30d') hoursAgo = 30 * 24;
            if (timeframe === 'all') hoursAgo = null;
            
            // Calculate cutoff time in JavaScript (SQL.js doesn't support datetime functions reliably)
            let query = `
                SELECT 
                    strftime('%Y-%m-%d %H:00:00', timestamp) as hour,
                    COUNT(*) as count
                FROM command_executions
            `;
            
            if (hoursAgo !== null) {
                const cutoffDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
                // Use string comparison since timestamps are stored as ISO strings
                query += ` WHERE timestamp >= '${cutoffDate}'`;
            }
            
            query += ` GROUP BY hour ORDER BY hour`;
            
            const result = this.db.exec(query);
            if (result[0]) {
                return result[0].values.map(row => ({
                    hour: row[0],
                    count: row[1]
                }));
            }
            return [];
        } catch (error) {
            console.error('Error getting executions by timeframe:', error);
            return [];
        }
    }

    /**
     * Get top commands
     */
    getTopCommands(limit = 10) {
        try {
            if (!this.db) return [];
            
            const result = this.db.exec(`
                SELECT command, COUNT(*) as count
                FROM command_executions
                GROUP BY command
                ORDER BY count DESC
                LIMIT ${limit}
            `);
            
            if (result[0]) {
                return result[0].values.map(row => ({
                    command: row[0],
                    count: row[1]
                }));
            }
            return [];
        } catch (error) {
            console.error('Error getting top commands:', error);
            return [];
        }
    }

    /**
     * Get top users
     */
    getTopUsers(limit = 10) {
        try {
            if (!this.db) return [];
            
            const result = this.db.exec(`
                SELECT user_id, COUNT(*) as count
                FROM command_executions
                GROUP BY user_id
                ORDER BY count DESC
                LIMIT ${limit}
            `);
            
            if (result[0]) {
                return result[0].values.map(row => ({
                    user_id: row[0],
                    count: row[1]
                }));
            }
            return [];
        } catch (error) {
            console.error('Error getting top users:', error);
            return [];
        }
    }

    /**
     * Get all users (pagination support)
     */
    getAllUsers(limit = 100, offset = 0) {
        try {
            if (!this.db) return { users: [], total: 0 };
            
            // Get total count
            const countResult = this.db.exec(`SELECT COUNT(DISTINCT user_id) as count FROM command_executions`);
            const total = countResult[0]?.values[0][0] || 0;
            
            // Get paginated users with stats (no parameter binding in exec(), use string interpolation)
            const result = this.db.exec(`
                SELECT user_id, COUNT(*) as count, MAX(timestamp) as last_used
                FROM command_executions
                GROUP BY user_id
                ORDER BY count DESC
                LIMIT ${limit} OFFSET ${offset}
            `);
            
            if (result[0]) {
                return {
                    users: result[0].values.map(row => ({
                        user_id: row[0],
                        command_count: row[1],
                        last_used: row[2]
                    })),
                    total
                };
            }
            return { users: [], total };
        } catch (error) {
            console.error('Error getting all users:', error);
            return { users: [], total: 0 };
        }
    }

    /**
     * Get recent executions
     */
    getRecentExecutions(limit = 50) {
        try {
            if (!this.db) return [];
            
            const result = this.db.exec(`
                SELECT command, user_id, guild_id, timestamp, success
                FROM command_executions
                ORDER BY timestamp DESC
                LIMIT ${limit}
            `);
            
            if (result[0]) {
                return result[0].values.map(row => ({
                    command: row[0],
                    user_id: row[1],
                    guild_id: row[2],
                    timestamp: row[3],
                    success: row[4]
                }));
            }
            return [];
        } catch (error) {
            console.error('Error getting recent executions:', error);
            return [];
        }
    }

    /**
     * Get analytics summary
     */
    getSummary() {
        try {
            const totalExecutions = this.getTotalExecutions();
            const uniqueUsers = this.getUniqueUserCount();
            const mostUsedCmd = this.getMostUsedCommand();
            
            let uniqueCommands = 0;
            if (this.db) {
                const result = this.db.exec(`SELECT COUNT(DISTINCT command) as count FROM command_executions`);
                uniqueCommands = result[0]?.values[0][0] || 0;
            }
            
            return {
                totalExecutions,
                uniqueUsers,
                uniqueCommands,
                topCommand: mostUsedCmd ? mostUsedCmd.command : 'N/A',
                topCommandCount: mostUsedCmd ? mostUsedCmd.count : 0
            };
        } catch (error) {
            console.error('Error getting summary:', error);
            return {
                totalExecutions: 0,
                uniqueUsers: 0,
                uniqueCommands: 0,
                topCommand: 'N/A',
                topCommandCount: 0
            };
        }
    }

    /**
     * Cleanup old entries (keep last 100k)
     */
    cleanup() {
        try {
            if (!this.db) return 0;
            
            this.db.exec(`
                DELETE FROM command_executions
                WHERE id NOT IN (
                    SELECT id FROM command_executions
                    ORDER BY timestamp DESC
                    LIMIT 100000
                )
            `);
            
            this.save();
            console.log('✓ Analytics database cleaned up');
            return true;
        } catch (error) {
            console.error('Error cleaning up analytics:', error);
            return false;
        }
    }
}

// Create and export singleton
let instance = null;

async function getInstance() {
    if (!instance) {
        instance = new AnalyticsDatabase();
        await instance.init();
    }
    return instance;
}

module.exports = {
    getInstance,
    // Initialize on require
    init: async () => {
        const db = await getInstance();
        return db;
    }
};
