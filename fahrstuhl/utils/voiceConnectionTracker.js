// Voice connection tracking and management

const { getVoiceConnection } = require("@discordjs/voice");

class VoiceConnectionTracker {
    constructor() {
        this.connections = new Map(); // guildId -> { channel, connection, timestamp, state }
        this.stats = {
            created: 0,
            disconnected: 0,
            errors: 0
        };
    }

    // Register a new voice connection
    trackConnection(guildId, connection, channel) {
        if (!guildId || !connection) return null;

        this.connections.set(guildId, {
            connection,
            channel,
            timestamp: Date.now(),
            state: 'connected',
            lastActivity: Date.now()
        });

        this.stats.created++;
        return this.connections.get(guildId);
    }

    // Update connection state
    updateState(guildId, state) {
        const conn = this.connections.get(guildId);
        if (conn) {
            conn.state = state;
            conn.lastActivity = Date.now();
        }
    }

    // Get connection info
    getConnection(guildId) {
        return this.connections.get(guildId);
    }

    // Check if guild has active connection
    hasConnection(guildId) {
        const conn = this.connections.get(guildId);
        if (!conn) return false;

        // Check if connection is still valid
        try {
            const voiceConn = getVoiceConnection(guildId);
            return voiceConn && conn.state === 'connected';
        } catch {
            return false;
        }
    }

    // Get all active connections
    getAllConnections() {
        return Array.from(this.connections.entries())
            .filter(([guildId]) => this.hasConnection(guildId))
            .map(([guildId, conn]) => ({ guildId, ...conn }));
    }

    // Remove connection
    removeConnection(guildId) {
        const conn = this.connections.get(guildId);
        if (conn) {
            try {
                conn.connection?.destroy?.();
            } catch (e) {
                // Already destroyed
            }
            this.connections.delete(guildId);
            this.stats.disconnected++;
        }
    }

    // Clean up stale connections (older than maxAge ms)
    cleanupStale(maxAge = 3600000) { // 1 hour default
        const now = Date.now();
        const toRemove = [];

        for (const [guildId, conn] of this.connections) {
            if (now - conn.timestamp > maxAge) {
                toRemove.push(guildId);
            }
        }

        for (const guildId of toRemove) {
            this.removeConnection(guildId);
        }

        return toRemove.length;
    }

    // Cleanup all connections
    async cleanup() {
        for (const [guildId] of this.connections) {
            this.removeConnection(guildId);
        }
        console.log('✅ Voice connections cleaned up');
    }

    // Get stats
    getStats() {
        const activeConnections = Array.from(this.connections.values())
            .filter(c => c.state === 'connected').length;

        return {
            ...this.stats,
            activeConnections,
            totalTracked: this.connections.size
        };
    }

    // Get connection health
    getHealth() {
        const connections = this.getAllConnections();
        const total = connections.length;

        if (total === 0) return { healthy: true, connections: 0 };

        const healthy = connections.filter(c => 
            Date.now() - c.lastActivity < 600000 // Active within last 10 min
        ).length;

        return {
            healthy: healthy >= total * 0.8, // At least 80% healthy
            connections: total,
            healthyCount: healthy,
            healthPercentage: (healthy / total * 100).toFixed(2)
        };
    }
}

module.exports = VoiceConnectionTracker;
