/**
 * User Activity Tracking - Track member behavior and engagement
 */

class UserActivityTracker {
    constructor(config = {}) {
        this.activities = new Map(); // userId -> { commands, interactions, firstSeen, lastSeen }
        this.hourlyActivityMap = new Map(); // hour -> count
        this.guildUserActivity = new Map(); // guildId -> Map<userId, activity>
    }

    /**
     * Record user activity
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @param {string} activityType - Type of activity (command, interaction, etc.)
     */
    recordActivity(userId, guildId, activityType = 'command') {
        const now = Date.now();

        // Global user activity
        if (!this.activities.has(userId)) {
            this.activities.set(userId, {
                commands: 0,
                interactions: 0,
                firstSeen: now,
                lastSeen: now,
                guilds: new Set()
            });
        }

        const activity = this.activities.get(userId);
        if (activityType === 'command') activity.commands++;
        else activity.interactions++;
        activity.lastSeen = now;
        activity.guilds.add(guildId);

        // Guild-specific user activity
        if (!this.guildUserActivity.has(guildId)) {
            this.guildUserActivity.set(guildId, new Map());
        }

        const guildActivity = this.guildUserActivity.get(guildId);
        if (!guildActivity.has(userId)) {
            guildActivity.set(userId, {
                commands: 0,
                firstSeen: now,
                lastSeen: now
            });
        }

        const userGuildActivity = guildActivity.get(userId);
        userGuildActivity.commands++;
        userGuildActivity.lastSeen = now;

        // Hourly tracking
        const hour = new Date(now).getHours();
        const hourKey = `hour_${hour}`;
        this.hourlyActivityMap.set(hourKey, (this.hourlyActivityMap.get(hourKey) || 0) + 1);
    }

    /**
     * Get user activity summary
     * @param {string} userId - User ID
     * @returns {Object}
     */
    getUserActivity(userId) {
        return this.activities.get(userId) || null;
    }

    /**
     * Get most active users
     * @param {number} limit - Number of users
     * @returns {Array<Object>}
     */
    getMostActiveUsers(limit = 10) {
        return Array.from(this.activities.entries())
            .sort((a, b) => b[1].commands - a[1].commands)
            .slice(0, limit)
            .map(([userId, activity]) => ({
                userId,
                commands: activity.commands,
                interactions: activity.interactions,
                totalActivity: activity.commands + activity.interactions,
                guilds: activity.guilds.size,
                daysSinceFirstSeen: Math.floor((Date.now() - activity.firstSeen) / 86400000),
                lastActive: new Date(activity.lastSeen)
            }));
    }

    /**
     * Get guild's most active users
     * @param {string} guildId - Guild ID
     * @param {number} limit - Number of users
     * @returns {Array<Object>}
     */
    getGuildTopUsers(guildId, limit = 10) {
        const guildActivity = this.guildUserActivity.get(guildId);
        if (!guildActivity) return [];

        return Array.from(guildActivity.entries())
            .sort((a, b) => b[1].commands - a[1].commands)
            .slice(0, limit)
            .map(([userId, activity]) => ({
                userId,
                commands: activity.commands,
                daysSinceFirst: Math.floor((Date.now() - activity.firstSeen) / 86400000),
                lastActive: new Date(activity.lastSeen)
            }));
    }

    /**
     * Get activity heatmap by hour
     * @returns {Array<Object>}
     */
    getHourlyHeatmap() {
        const heatmap = [];
        for (let hour = 0; hour < 24; hour++) {
            const key = `hour_${hour}`;
            heatmap.push({
                hour,
                activity: this.hourlyActivityMap.get(key) || 0
            });
        }
        return heatmap;
    }

    /**
     * Calculate user engagement score
     * @param {string} userId - User ID
     * @returns {number} - Score 0-100
     */
    getEngagementScore(userId) {
        const activity = this.activities.get(userId);
        if (!activity) return 0;

        const daysSinceFirst = (Date.now() - activity.firstSeen) / 86400000;
        const daysSinceLast = (Date.now() - activity.lastSeen) / 86400000;
        const avgCommandsPerDay = daysSinceFirst > 0 ? activity.commands / daysSinceFirst : 0;
        const activityRecency = Math.max(0, 100 - (daysSinceLast * 10));

        const score = (avgCommandsPerDay * 10) + activityRecency;
        return Math.min(100, Math.round(score));
    }

    /**
     * Get users at risk of churn
     * @returns {Array<Object>}
     */
    getChurnRisk() {
        return Array.from(this.activities.entries())
            .filter(([, activity]) => {
                const daysSinceLast = (Date.now() - activity.lastSeen) / 86400000;
                return daysSinceLast > 7; // Not active in 7 days
            })
            .map(([userId, activity]) => ({
                userId,
                engagementScore: this.getEngagementScore(userId),
                daysSinceLastActivity: Math.floor((Date.now() - activity.lastSeen) / 86400000),
                totalActivity: activity.commands + activity.interactions
            }))
            .sort((a, b) => a.daysSinceLastActivity - b.daysSinceLastActivity)
            .slice(0, 10);
    }

    /**
     * Get activity summary
     */
    getSummary() {
        const totalActivity = Array.from(this.activities.values())
            .reduce((sum, a) => sum + a.commands + a.interactions, 0);

        return {
            totalUsers: this.activities.size,
            totalActivity,
            avgActivityPerUser: Math.round(totalActivity / this.activities.size),
            peakActivityHour: this.getPeakHour()
        };
    }

    /**
     * Get peak activity hour
     */
    getPeakHour() {
        let maxHour = 0;
        let maxActivity = 0;

        for (const [key, count] of this.hourlyActivityMap) {
            if (count > maxActivity) {
                maxActivity = count;
                maxHour = parseInt(key.split('_')[1]);
            }
        }

        return maxHour;
    }

    /**
     * Clear old data (older than days)
     * @param {number} days - Number of days to keep
     */
    clearOldData(days = 90) {
        const cutoff = Date.now() - (days * 86400000);
        let removed = 0;

        for (const [userId, activity] of this.activities) {
            if (activity.lastSeen < cutoff) {
                this.activities.delete(userId);
                removed++;
            }
        }

        return removed;
    }
}

module.exports = UserActivityTracker;
