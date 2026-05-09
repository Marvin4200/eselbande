/**
 * @fileoverview Rate Limiter - Command rate limiting system
 */

/**
 * @typedef {Object} RateLimitCheckResult
 * @property {boolean} ok - Whether the user can execute the command
 * @property {number} retryAfter - Milliseconds to wait before retry (if !ok)
 */

/**
 * @typedef {Object} RateLimiterStats
 * @property {number} trackedUsers - Number of users being tracked
 * @property {number} totalLimits - Total active rate limits
 * @property {number} checksPerformed - Total checks performed
 */

class RateLimiter {
    /**
     * Create a new rate limiter
     * @param {Object} config - Configuration
     * @param {number} [config.defaultCooldown=3000] - Default cooldown in milliseconds
     */
    constructor(config = {}) {
        this.defaultCooldown = config.defaultCooldown || 3000;
        this.cooldowns = new Map();
        this.stats = {
            checksPerformed: 0,
            limitsTriggered: 0,
            usersTracked: new Set()
        };
    }

    /**
     * Check if user is rate limited
     * @param {string} userId - Discord user ID
     * @param {string} commandName - Command name
     * @returns {RateLimitCheckResult}
     */
    check(userId, commandName) {
        this.stats.checksPerformed++;
        this.stats.usersTracked.add(userId);

        const key = `${userId}:${commandName}`;
        const now = Date.now();
        const expiry = this.cooldowns.get(key);

        if (expiry && now < expiry) {
            this.stats.limitsTriggered++;
            return {
                ok: false,
                retryAfter: expiry - now
            };
        }

        this.cooldowns.set(key, now + this.defaultCooldown);
        return { ok: true, retryAfter: 0 };
    }

    /**
     * Get retry message for user
     * @param {number} retryAfter - Milliseconds to wait
     * @returns {string} - User-friendly message
     */
    getRetryMessage(retryAfter) {
        const seconds = Math.ceil(retryAfter / 1000);
        return `⏳ Please wait ${seconds}s before using this command again.`;
    }

    /**
     * Get rate limiter statistics
     * @returns {RateLimiterStats}
     */
    getStats() {
        return {
            trackedUsers: this.stats.usersTracked.size,
            totalLimits: this.cooldowns.size,
            checksPerformed: this.stats.checksPerformed,
            triggeredLimits: this.stats.limitsTriggered
        };
    }

    /**
     * Reset cooldown for specific user/command
     * @param {string} userId - Discord user ID
     * @param {string} commandName - Command name
     */
    reset(userId, commandName) {
        const key = `${userId}:${commandName}`;
        this.cooldowns.delete(key);
    }

    /**
     * Clear all cooldowns
     */
    clear() {
        this.cooldowns.clear();
    }
}

module.exports = RateLimiter;
