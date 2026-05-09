/**
 * Blacklist Manager
 * Liest die Dashboard-Blacklist und überprüft User
 */

const fs = require('fs');
const path = require('path');

class BlacklistManager {
    constructor() {
        this.blacklistFile = path.join(__dirname, '../dashboard/data/blacklist.json');
        this.blacklist = [];
        this.loadBlacklist();
    }

    loadBlacklist() {
        try {
            if (fs.existsSync(this.blacklistFile)) {
                const data = fs.readFileSync(this.blacklistFile, 'utf8');
                this.blacklist = JSON.parse(data) || [];
                console.log(`✓ Loaded ${this.blacklist.length} blacklist entries`);
            }
        } catch (error) {
            console.error('Error loading blacklist:', error.message);
            this.blacklist = [];
        }
    }

    // Refresh blacklist from file
    refresh() {
        this.loadBlacklist();
    }

    /**
     * Check if user is blacklisted
     * @param {string} userId - Discord User ID
     * @param {string} guildId - Discord Guild ID (optional, for guild-specific checks)
     * @returns {object|null} - Blacklist entry if blocked, null otherwise
     */
    isBlacklisted(userId, guildId = null) {
        // Check global blacklist (type: 'user' or 'global')
        const globalBlock = this.blacklist.find(entry => 
            entry.userId === userId && 
            (entry.type === 'user' || entry.type === 'global')
        );
        if (globalBlock) return globalBlock;

        // Check guild-specific blacklist
        if (guildId) {
            const guildBlock = this.blacklist.find(entry =>
                entry.userId === userId &&
                entry.type === 'guild' &&
                entry.guildId === guildId
            );
            if (guildBlock) return guildBlock;
        }

        return null;
    }

    /**
     * Add a user to the blacklist
     * @param {string} userId - Discord User ID
     * @param {string|null} guildId - Guild ID (null for global)
     * @param {string} reason - Reason for blacklisting
     * @param {string} type - 'user' for global, 'guild' for guild-specific
     */
    add(userId, guildId = null, reason = 'No reason specified', type = 'user') {
        const existing = this.blacklist.find(e => e.userId === userId && e.type === type && e.guildId === (guildId || null));
        if (existing) {
            existing.reason = reason;
        } else {
            this.blacklist.push({
                id: Date.now().toString(),
                userId,
                type,
                guildId: guildId || null,
                reason,
                createdAt: new Date().toISOString()
            });
        }
        this.saveBlacklist();
    }

    /**
     * Remove a user from the blacklist
     * @param {string} userId
     * @param {string|null} guildId
     */
    remove(userId, guildId = null) {
        const before = this.blacklist.length;
        this.blacklist = this.blacklist.filter(e => !(e.userId === userId && e.guildId === (guildId || null)));
        if (this.blacklist.length < before) {
            this.saveBlacklist();
        }
    }

    /**
     * Get all blacklist entries
     * @returns {Array}
     */
    getAll() {
        return [...this.blacklist];
    }

    saveBlacklist() {
        try {
            const dir = path.dirname(this.blacklistFile);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(this.blacklistFile, JSON.stringify(this.blacklist, null, 2), 'utf8');
        } catch (error) {
            console.error('Error saving blacklist:', error.message);
        }
    }
}

module.exports = new BlacklistManager();
