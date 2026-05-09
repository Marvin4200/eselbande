/**
 * Real-Time Statistics Manager
 * Provides live bot statistics via WebSocket
 */

const EventEmitter = require('events');

class RealtimeStats extends EventEmitter {
    constructor() {
        super();
        this.stats = {
            activeTrolls: 0,
            activeTrollsDetails: [],
            onlineUsers: 0,
            commandsExecutedToday: 0,
            topCommand: null,
            botStatus: 'online',
            serverCount: 0,
            userCount: 0,
            uptime: 0,
            lastUpdate: new Date().toISOString()
        };
        this.subscribers = new Set();
        this.updateInterval = null;
    }

    /**
     * Initialize real-time stats collection
     */
    init(client, globalStats) {
        this.client = client;
        this.globalStats = globalStats;
        
        // Update stats every 5 seconds
        this.updateInterval = setInterval(() => {
            this.updateStats();
        }, 5000);
    }

    /**
     * Update internal stats
     */
    updateStats() {
        if (!this.client) return;

        const previousStats = JSON.stringify(this.stats);

        this.stats = {
            activeTrolls: this.getActiveTrollsCount(),
            activeTrollsDetails: this.getActiveTrollsDetails(),
            onlineUsers: this.client.users.cache.filter(u => u.presence?.status === 'online').size,
            commandsExecutedToday: this.getCommandsExecutedToday(),
            topCommand: this.getTopCommand(),
            botStatus: this.client.status === 0 ? 'online' : 'idle',
            serverCount: this.client.guilds.cache.size,
            userCount: this.client.users.cache.size,
            uptime: this.client.uptime,
            lastUpdate: new Date().toISOString()
        };

        // Emit update only if stats changed
        if (previousStats !== JSON.stringify(this.stats)) {
            this.emit('update', this.stats);
            this.broadcastToSubscribers();
        }
    }

    /**
     * Get count of active trolls
     */
    getActiveTrollsCount() {
        if (!this.globalStats || !this.globalStats.activeTrolls) return 0;
        return this.globalStats.activeTrolls.size || 0;
    }

    /**
     * Get details of active trolls
     */
    getActiveTrollsDetails() {
        if (!this.globalStats || !this.globalStats.activeTrolls) return [];
        
        const details = [];
        for (const [key, info] of this.globalStats.activeTrolls.entries()) {
            details.push({
                key,
                trollType: info.type,
                startTime: info.startTime,
                duration: Date.now() - info.startTime
            });
        }
        return details;
    }

    /**
     * Get commands executed today
     */
    getCommandsExecutedToday() {
        if (!this.globalStats) return 0;
        return this.globalStats.commandExecutions?.filter(e => {
            const execTime = new Date(e.timestamp);
            const now = new Date();
            return execTime.toDateString() === now.toDateString();
        }).length || 0;
    }

    /**
     * Get top command
     */
    getTopCommand() {
        if (!this.globalStats || !this.globalStats.commandExecutions) return null;
        
        const counts = {};
        for (const exec of this.globalStats.commandExecutions) {
            counts[exec.command] = (counts[exec.command] || 0) + 1;
        }
        
        const top = Object.entries(counts).sort(([,a], [,b]) => b - a)[0];
        return top ? { name: top[0], count: top[1] } : null;
    }

    /**
     * Get formatted uptime
     */
    getFormattedUptime() {
        if (!this.stats.uptime) return '0s';
        
        const seconds = Math.floor(this.stats.uptime / 1000);
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

        return parts.join(' ');
    }

    /**
     * Subscribe to stat updates (for WebSocket)
     */
    subscribe(callback) {
        this.subscribers.add(callback);
        return () => this.subscribers.delete(callback);
    }

    /**
     * Broadcast stats to all subscribers
     */
    broadcastToSubscribers() {
        for (const callback of this.subscribers) {
            try {
                callback(this.getFormattedStats());
            } catch (error) {
                console.error('Error broadcasting stats:', error);
            }
        }
    }

    /**
     * Get formatted stats object
     */
    getFormattedStats() {
        return {
            ...this.stats,
            formattedUptime: this.getFormattedUptime(),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get summary for dashboard
     */
    getSummary() {
        return {
            online: this.stats.botStatus === 'online',
            servers: this.stats.serverCount,
            users: this.stats.userCount,
            activeTrolls: this.stats.activeTrolls,
            topCommand: this.stats.topCommand,
            uptime: this.getFormattedUptime(),
            commandsToday: this.stats.commandsExecutedToday
        };
    }

    /**
     * Stop collecting stats
     */
    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        this.subscribers.clear();
    }
}

module.exports = RealtimeStats;
