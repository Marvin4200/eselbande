/**
 * Command Usage Analytics - Track and analyze command usage patterns
 */

class CommandAnalytics {
    constructor() {
        this.commandStats = new Map(); // commandName -> { count, lastUsed, users, avgResponseTime }
        this.guildStats = new Map(); // guildId -> { commands: Map, totalCommands, lastActive }
        this.userStats = new Map(); // userId -> { commands: Map, totalCommands, favoriteCommand }
        this.timeSeries = []; // Time-series data for trends
    }

    /**
     * Record a command execution
     * @param {string} commandName - Command name
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     * @param {number} responseTime - Response time in ms
     */
    recordCommand(commandName, guildId, userId, responseTime = 0) {
        const now = Date.now();

        // Update command stats
        if (!this.commandStats.has(commandName)) {
            this.commandStats.set(commandName, {
                count: 0,
                lastUsed: now,
                users: new Set(),
                totalResponseTime: 0,
                minResponseTime: Infinity,
                maxResponseTime: 0
            });
        }

        const cmdStats = this.commandStats.get(commandName);
        cmdStats.count++;
        cmdStats.lastUsed = now;
        cmdStats.users.add(userId);
        cmdStats.totalResponseTime += responseTime;
        cmdStats.minResponseTime = Math.min(cmdStats.minResponseTime, responseTime);
        cmdStats.maxResponseTime = Math.max(cmdStats.maxResponseTime, responseTime);

        // Update guild stats
        if (!this.guildStats.has(guildId)) {
            this.guildStats.set(guildId, {
                commands: new Map(),
                totalCommands: 0,
                lastActive: now
            });
        }

        const guildStats = this.guildStats.get(guildId);
        guildStats.commands.set(commandName, (guildStats.commands.get(commandName) || 0) + 1);
        guildStats.totalCommands++;
        guildStats.lastActive = now;

        // Update user stats
        if (!this.userStats.has(userId)) {
            this.userStats.set(userId, {
                commands: new Map(),
                totalCommands: 0
            });
        }

        const userStats = this.userStats.get(userId);
        userStats.commands.set(commandName, (userStats.commands.get(commandName) || 0) + 1);
        userStats.totalCommands++;

        // Add to time series
        this.timeSeries.push({
            timestamp: now,
            command: commandName,
            guild: guildId,
            user: userId,
            responseTime
        });

        // Keep only last 10000 entries to limit memory
        if (this.timeSeries.length > 10000) {
            this.timeSeries.shift();
        }
    }

    /**
     * Get top commands
     * @param {number} limit - Number of results
     * @returns {Array<Object>}
     */
    getTopCommands(limit = 10) {
        return Array.from(this.commandStats.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, limit)
            .map(([name, stats]) => ({
                name,
                count: stats.count,
                userCount: stats.users.size,
                avgResponseTime: Math.round(stats.totalResponseTime / stats.count),
                minResponseTime: stats.minResponseTime,
                maxResponseTime: stats.maxResponseTime,
                lastUsed: new Date(stats.lastUsed)
            }));
    }

    /**
     * Get guild statistics
     * @param {string} guildId - Guild ID
     * @returns {Object}
     */
    getGuildStats(guildId) {
        const guildStats = this.guildStats.get(guildId);
        if (!guildStats) return null;

        const topCommands = Array.from(guildStats.commands.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => ({ name, count }));

        return {
            guildId,
            totalCommands: guildStats.totalCommands,
            uniqueCommands: guildStats.commands.size,
            lastActive: new Date(guildStats.lastActive),
            topCommands
        };
    }

    /**
     * Get user statistics
     * @param {string} userId - User ID
     * @returns {Object}
     */
    getUserStats(userId) {
        const userStats = this.userStats.get(userId);
        if (!userStats) return null;

        const topCommands = Array.from(userStats.commands.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => ({ name, count }));

        return {
            userId,
            totalCommands: userStats.totalCommands,
            uniqueCommands: userStats.commands.size,
            favoriteCommand: topCommands[0]?.name,
            topCommands
        };
    }

    /**
     * Get command trends
     * @param {number} hours - Number of hours to analyze
     * @returns {Array<Object>}
     */
    getTrends(hours = 24) {
        const cutoff = Date.now() - (hours * 60 * 60 * 1000);
        const recentData = this.timeSeries.filter(d => d.timestamp > cutoff);

        const trends = new Map();
        for (const data of recentData) {
            const hour = Math.floor((data.timestamp - cutoff) / (60 * 60 * 1000));
            const key = `hour_${hour}`;
            trends.set(key, (trends.get(key) || 0) + 1);
        }

        return Array.from(trends.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([hour, count]) => ({ hour, count }));
    }

    /**
     * Get statistics summary
     */
    getSummary() {
        return {
            totalCommands: Array.from(this.commandStats.values()).reduce((s, c) => s + c.count, 0),
            uniqueCommands: this.commandStats.size,
            totalGuilds: this.guildStats.size,
            totalUsers: this.userStats.size,
            topCommand: this.getTopCommands(1)[0] || null
        };
    }

    /**
     * Export analytics as JSON
     */
    export() {
        return {
            timestamp: new Date().toISOString(),
            summary: this.getSummary(),
            topCommands: this.getTopCommands(20),
            timeSeries: this.timeSeries
        };
    }

    /**
     * Clear all analytics
     */
    clear() {
        this.commandStats.clear();
        this.guildStats.clear();
        this.userStats.clear();
        this.timeSeries = [];
    }
}

module.exports = CommandAnalytics;
