/**
 * Voice Channel Cleanup - Auto-cleanup abandoned voice channels
 */

class VoiceChannelCleanup {
    constructor(config = {}) {
        this.inactivityTimeout = config.inactivityTimeout || 900000; // 15 minutes
        this.activeChannels = new Map(); // channelId -> { lastActivity, memberCount }
        this.cleanupInterval = null;
    }

    /**
     * Track voice channel activity
     * @param {string} channelId - Voice channel ID
     * @param {number} memberCount - Current member count
     */
    recordActivity(channelId, memberCount) {
        this.activeChannels.set(channelId, {
            lastActivity: Date.now(),
            memberCount
        });
    }

    /**
     * Find abandoned channels
     * @returns {Array<string>} - IDs of abandoned channels
     */
    findAbandoned() {
        const now = Date.now();
        const abandoned = [];

        for (const [channelId, data] of this.activeChannels) {
            const inactiveTime = now - data.lastActivity;
            
            // Channel is abandoned if:
            // - Inactive for longer than timeout
            // - OR has 0 members
            if (inactiveTime > this.inactivityTimeout || data.memberCount === 0) {
                abandoned.push(channelId);
            }
        }

        return abandoned;
    }

    /**
     * Mark channel for cleanup
     * @param {string} channelId - Voice channel ID
     */
    markForCleanup(channelId) {
        this.activeChannels.delete(channelId);
    }

    /**
     * Cleanup multiple channels
     * @param {Array<string>} channelIds - Channel IDs to cleanup
     */
    cleanupChannels(channelIds) {
        for (const channelId of channelIds) {
            this.activeChannels.delete(channelId);
        }
    }

    /**
     * Start automatic cleanup
     * @param {Function} cleanupFn - Async function to cleanup (receives channelId)
     */
    startAutoCleanup(cleanupFn) {
        this.cleanupInterval = setInterval(async () => {
            const abandoned = this.findAbandoned();
            for (const channelId of abandoned) {
                try {
                    await cleanupFn(channelId);
                    this.markForCleanup(channelId);
                } catch (error) {
                    console.error(`Failed to cleanup channel ${channelId}:`, error.message);
                }
            }
        }, 300000); // Check every 5 minutes
    }

    /**
     * Stop automatic cleanup
     */
    stopAutoCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            trackedChannels: this.activeChannels.size,
            totalMembers: Array.from(this.activeChannels.values())
                .reduce((sum, data) => sum + data.memberCount, 0)
        };
    }
}

module.exports = VoiceChannelCleanup;
