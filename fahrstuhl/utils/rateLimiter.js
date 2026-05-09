const { TIMINGS } = require("./constants");

class RateLimiter {
    constructor(cooldownMs = TIMINGS.COMMAND_COOLDOWN) {
        this.cooldowns = new Map();
        this.cooldownMs = cooldownMs;
        this.premiumBypass = new Map(); // userId -> true if premium
    }

    /**
     * Check if user is on cooldown
     * @param {string} userId - User ID
     * @param {string} commandName - Command name
     * @param {boolean} isPremium - Is user premium (reduces cooldown)
     * @returns {object} { ok: boolean, retryAfter: number }
     */
    // Cooldowns per tier: normal=10min, premium=3min, pro=1min
    static COOLDOWNS = {
        normal:  10 * 60 * 1000,
        premium:  3 * 60 * 1000,
        pro:      1 * 60 * 1000,
    };

    check(userId, commandName, isPremium = false, isPro = false) {
        const key = `${userId}:${commandName}`;
        const now = Date.now();
        const lastUsed = this.cooldowns.get(key) || 0;
        const timeSinceLastUse = now - lastUsed;

        const effectiveCooldown = isPro
            ? RateLimiter.COOLDOWNS.pro
            : isPremium
                ? RateLimiter.COOLDOWNS.premium
                : RateLimiter.COOLDOWNS.normal;

        if (timeSinceLastUse < effectiveCooldown) {
            return {
                ok: false,
                retryAfter: effectiveCooldown - timeSinceLastUse,
                isPremium,
                isPro
            };
        }

        this.cooldowns.set(key, now);
        return { ok: true, isPremium, isPro };
    }

    getRetryMessage(retryAfter, isPremium = false, isPro = false) {
        const seconds = Math.ceil(retryAfter / 1000);
        const tierNote = isPro ? ' (👑 Pro: 1min cooldown)' : isPremium ? ' (💎 Premium: 3min cooldown)' : '';
        return `⏱️ Slow down! Try again in ${seconds}s${tierNote}`;
    }

    /**
     * Create a cool-down embed with Discord timestamp
     * Shows when user can use the command again
     */
    getCooldownEmbed(retryAfter, commandName = null, isPremium = false, isPro = false) {
        const { EmbedBuilder } = require('discord.js');
        const now = Date.now();
        const retryTime = Math.floor((now + retryAfter) / 1000);

        const color = isPro ? 0xC084FC : isPremium ? 0xFFD700 : 0xFEE75C;
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle('⏱️ Command on Cooldown')
            .setDescription(`You need to wait before using${commandName ? ` \`/${commandName}\`` : ' this command'} again.`)
            .addFields({
                name: 'Available again at',
                value: `<t:${retryTime}:t> (<t:${retryTime}:R>)`,
                inline: false
            });

        if (isPro) {
            embed.addFields({ name: '👑 Pro Benefit', value: 'Cooldown: 1 minute', inline: false });
        } else if (isPremium) {
            embed.addFields({ name: '💎 Premium Benefit', value: 'Cooldown: 3 minutes', inline: false });
        } else {
            embed.addFields({ name: '💡 Tipp', value: 'Mit **💎 Premium** nur 3 Min, mit **👑 Pro** nur 1 Min Cooldown!', inline: false });
        }

        return embed;
    }

    /**
     * Set premium status for user
     * @param {string} userId - User ID
     * @param {boolean} isPremium - Premium status
     */
    setPremium(userId, isPremium) {
        if (isPremium) {
            this.premiumBypass.set(userId, true);
        } else {
            this.premiumBypass.delete(userId);
        }
    }

    /**
     * Check if user is premium
     * @param {string} userId - User ID
     * @returns {boolean}
     */
    isPremium(userId) {
        return this.premiumBypass.has(userId);
    }

    clear() {
        this.cooldowns.clear();
    }

    clearUser(userId) {
        for (const key of this.cooldowns.keys()) {
            if (key.startsWith(`${userId}:`)) {
                this.cooldowns.delete(key);
            }
        }
    }

    clearCommand(commandName) {
        for (const key of this.cooldowns.keys()) {
            if (key.endsWith(`:${commandName}`)) {
                this.cooldowns.delete(key);
            }
        }
    }

    /**
     * Get cooldown stats
     * @returns {object}
     */
    getStats() {
        return {
            activeUsers: new Set([...this.cooldowns.keys()].map(k => k.split(':')[0])).size,
            totalCooldowns: this.cooldowns.size,
            premiumUsers: this.premiumBypass.size
        };
    }

    /**
     * Cleanup expired cooldowns
     * @returns {number} Number of cleaned cooldowns
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, lastUsed] of this.cooldowns.entries()) {
            if (now - lastUsed > this.cooldownMs * 2) {
                this.cooldowns.delete(key);
                cleaned++;
            }
        }

        return cleaned;
    }
}

module.exports = RateLimiter;
