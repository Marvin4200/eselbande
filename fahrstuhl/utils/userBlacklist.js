/**
 * User Blacklist/Whitelist System - Manage user restrictions
 */

class UserBlacklist {
    constructor() {
        this.globalBlacklist = new Set(); // Globally blacklisted users
        this.guildBlacklists = new Map(); // guildId -> Set of blacklisted users
        this.globalWhitelist = new Set(); // Globally whitelisted users
        this.guildWhitelists = new Map(); // guildId -> Set of whitelisted users
        this.temporalBans = new Map(); // userId -> { expiry, reason }
        this.timers = new Map(); // userId -> timeout ID
    }

    /**
     * Add user to global blacklist
     * @param {string} userId - User ID
     * @param {string} reason - Reason for blacklist
     */
    addGlobalBlacklist(userId, reason = null) {
        this.globalBlacklist.add(userId);
        if (reason) {
            console.log(`User ${userId} added to global blacklist: ${reason}`);
        }
    }

    /**
     * Add user to guild blacklist
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     * @param {string} reason - Reason for blacklist
     */
    addGuildBlacklist(guildId, userId, reason = null) {
        if (!this.guildBlacklists.has(guildId)) {
            this.guildBlacklists.set(guildId, new Set());
        }
        this.guildBlacklists.get(guildId).add(userId);
    }

    /**
     * Add temporary ban
     * @param {string} userId - User ID
     * @param {number} durationMs - Ban duration in milliseconds
     * @param {string} reason - Ban reason
     */
    addTemporalBan(userId, durationMs, reason = null) {
        const expiry = Date.now() + durationMs;
        this.temporalBans.set(userId, { expiry, reason });

        // Auto-remove when ban expires
        const timerId = setTimeout(() => {
            this.removeTemporalBan(userId);
        }, durationMs);

        this.timers.set(userId, timerId);
    }

    /**
     * Remove temporal ban
     * @param {string} userId - User ID
     */
    removeTemporalBan(userId) {
        const timerId = this.timers.get(userId);
        if (timerId) {
            clearTimeout(timerId);
            this.timers.delete(userId);
        }
        this.temporalBans.delete(userId);
    }

    /**
     * Add user to whitelist
     * @param {string} userId - User ID
     */
    addGlobalWhitelist(userId) {
        this.globalWhitelist.add(userId);
    }

    /**
     * Add user to guild whitelist
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     */
    addGuildWhitelist(guildId, userId) {
        if (!this.guildWhitelists.has(guildId)) {
            this.guildWhitelists.set(guildId, new Set());
        }
        this.guildWhitelists.get(guildId).add(userId);
    }

    /**
     * Check if user is blacklisted
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID (optional)
     * @returns {boolean}
     */
    isBlacklisted(userId, guildId = null) {
        // Check temporal bans first
        if (this.temporalBans.has(userId)) {
            const ban = this.temporalBans.get(userId);
            if (Date.now() < ban.expiry) {
                return true;
            } else {
                this.removeTemporalBan(userId);
            }
        }

        // Check global blacklist
        if (this.globalBlacklist.has(userId)) {
            return true;
        }

        // Check guild blacklist
        if (guildId) {
            const guildList = this.guildBlacklists.get(guildId);
            if (guildList && guildList.has(userId)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check if user is whitelisted
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID (optional)
     * @returns {boolean}
     */
    isWhitelisted(userId, guildId = null) {
        // Check global whitelist
        if (this.globalWhitelist.has(userId)) {
            return true;
        }

        // Check guild whitelist
        if (guildId) {
            const guildList = this.guildWhitelists.get(guildId);
            if (guildList && guildList.has(userId)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Remove from blacklist
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID (optional)
     */
    removeBlacklist(userId, guildId = null) {
        if (!guildId) {
            this.globalBlacklist.delete(userId);
        } else {
            const guildList = this.guildBlacklists.get(guildId);
            if (guildList) {
                guildList.delete(userId);
            }
        }
    }

    /**
     * Remove from whitelist
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID (optional)
     */
    removeWhitelist(userId, guildId = null) {
        if (!guildId) {
            this.globalWhitelist.delete(userId);
        } else {
            const guildList = this.guildWhitelists.get(guildId);
            if (guildList) {
                guildList.delete(userId);
            }
        }
    }

    /**
     * Get blacklist status
     * @param {string} userId - User ID
     * @returns {Object}
     */
    getStatus(userId) {
        const temporal = this.temporalBans.get(userId);
        const globalBlack = this.globalBlacklist.has(userId);
        const globalWhite = this.globalWhitelist.has(userId);

        return {
            userId,
            temporalBan: temporal ? {
                reason: temporal.reason,
                expiresAt: new Date(temporal.expiry),
                remainingMs: Math.max(0, temporal.expiry - Date.now())
            } : null,
            globalBlacklisted: globalBlack,
            globalWhitelisted: globalWhite,
            status: globalBlack ? 'blacklisted' : globalWhite ? 'whitelisted' : 'normal'
        };
    }

    /**
     * Broadcast blacklist to all guilds
     * @param {string} userId - User ID
     * @param {string} reason - Reason
     */
    broadcastBlacklist(userId, reason = null) {
        this.addGlobalBlacklist(userId, reason);
        // TODO: Notify all guild admins
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            globalBlacklist: this.globalBlacklist.size,
            guildBlacklists: Array.from(this.guildBlacklists.entries())
                .reduce((sum, [, list]) => sum + list.size, 0),
            temporalBans: this.temporalBans.size,
            globalWhitelist: this.globalWhitelist.size,
            guildWhitelists: Array.from(this.guildWhitelists.entries())
                .reduce((sum, [, list]) => sum + list.size, 0)
        };
    }
}

module.exports = UserBlacklist;
