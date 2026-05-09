/**
 * Premium System - SQLite Database
 * Simple premium on/off system
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class PremiumDatabase {
    constructor() {
        this.dbPath = path.join(__dirname, '../data/premium.db');
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('[PremiumDB] Failed to open database:', err);
                    reject(err);
                } else {
                    this.createTable();
                    console.log('✓ Premium database initialized');
                    resolve();
                }
            });
        });
    }

    createTable() {
        this.db.run(`
            CREATE TABLE IF NOT EXISTS premium_users (
                user_id TEXT PRIMARY KEY,
                is_premium INTEGER DEFAULT 0,
                tier TEXT DEFAULT 'basic',
                expires_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        // Migrate existing rows that may not have the tier column
        this.db.run(`ALTER TABLE premium_users ADD COLUMN tier TEXT DEFAULT 'basic'`, () => {});
    }

    // Check if user is premium
    async isPremium(userId) {
        return new Promise((resolve) => {
            this.db.get(
                `SELECT is_premium, expires_at FROM premium_users WHERE user_id = ?`,
                [userId],
                (err, row) => {
                    if (err || !row) {
                        resolve(false);
                        return;
                    }

                    if (row.is_premium === 1) {
                        // Check if not expired
                        if (row.expires_at && new Date(row.expires_at) < new Date()) {
                            this.deactivate(userId);
                            resolve(false);
                        } else {
                            resolve(true);
                        }
                    } else {
                        resolve(false);
                    }
                }
            );
        });
    }

    // Check if user is pro
    async isPro(userId) {
        return new Promise((resolve) => {
            this.db.get(
                `SELECT is_premium, tier, expires_at FROM premium_users WHERE user_id = ?`,
                [userId],
                (err, row) => {
                    if (err || !row) { resolve(false); return; }
                    if (row.is_premium === 1 && row.tier === 'pro') {
                        if (row.expires_at && new Date(row.expires_at) < new Date()) {
                            this.deactivate(userId);
                            resolve(false);
                        } else {
                            resolve(true);
                        }
                    } else {
                        resolve(false);
                    }
                }
            );
        });
    }

    // Activate premium for user
    async activate(userId, daysValid = 365, tier = 'basic') {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + daysValid);

        return new Promise((resolve, reject) => {
            if (!this.db) {
                console.error('[PremiumDB] Database not initialized!');
                return reject(new Error('Database not initialized'));
            }

            console.log(`[PremiumDB] Activating ${userId} (${tier}) for ${daysValid} days, expires: ${expiresAt.toISOString()}`);
            
            this.db.run(
                `INSERT OR REPLACE INTO premium_users (user_id, is_premium, tier, expires_at, updated_at)
                 VALUES (?, 1, ?, ?, CURRENT_TIMESTAMP)`,
                [userId, tier, expiresAt.toISOString()],
                function(err) {
                    if (err) {
                        console.error('[PremiumDB] Failed to activate:', err.message);
                        reject(err);
                    } else {
                        console.log(`[PremiumDB] ✅ Activated (${tier}) for ${userId} - changes: ${this.changes}`);
                        resolve();
                    }
                }
            );
        });
    }

    // Deactivate premium for user
    async deactivate(userId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `UPDATE premium_users SET is_premium = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
                [userId],
                (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        console.log(`[PremiumDB] ❌ Deactivated for ${userId}`);
                        resolve();
                    }
                }
            );
        });
    }

    // Get all premium users
    async getAllPremium() {
        return new Promise((resolve) => {
            this.db.all(
                `SELECT user_id, tier, expires_at, created_at FROM premium_users WHERE is_premium = 1 ORDER BY created_at DESC`,
                (err, rows) => {
                    if (err) {
                        console.error('[PremiumDB] Failed to get all:', err);
                        resolve([]);
                    } else {
                        resolve(rows || []);
                    }
                }
            );
        });
    }

    // Get user premium info
    async getUserInfo(userId) {
        return new Promise((resolve) => {
            this.db.get(
                `SELECT user_id, is_premium, tier, expires_at, created_at FROM premium_users WHERE user_id = ?`,
                [userId],
                (err, row) => {
                    if (err || !row) {
                        resolve(null);
                    } else {
                        resolve(row);
                    }
                }
            );
        });
    }
}

module.exports = new PremiumDatabase();
