/**
 * Analytics Tracker
 * Tracks command executions and user statistics for analytics
 */

const fs = require('fs');
const path = require('path');

const statsFile = path.join(__dirname, '../globalStats.json');

function loadStats() {
    try {
        if (fs.existsSync(statsFile)) {
            const data = fs.readFileSync(statsFile, 'utf8');
            return JSON.parse(data) || {};
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
    return {};
}

function saveStats(stats) {
    try {
        fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
    } catch (error) {
        console.error('Error saving stats:', error);
    }
}

/**
 * Track command execution
 */
function trackCommandExecution(commandName, userId, guildId, success = true) {
    try {
        const stats = loadStats();
        
        if (!stats.commandExecutions) {
            stats.commandExecutions = [];
        }
        
        // Add execution record
        stats.commandExecutions.push({
            command: commandName,
            userId,
            guildId,
            timestamp: new Date().toISOString(),
            success
        });
        
        // Keep only last 10,000 executions to prevent unbounded growth
        if (stats.commandExecutions.length > 10000) {
            stats.commandExecutions = stats.commandExecutions.slice(-10000);
        }
        
        saveStats(stats);
    } catch (error) {
        console.error('Error tracking command execution:', error);
    }
}

/**
 * Get all-time statistics
 */
function getStats() {
    return loadStats();
}

/**
 * Get unique user count (all-time, all guilds)
 */
function getUniqueUserCount() {
    const stats = loadStats();
    const executions = stats.commandExecutions || [];
    
    const uniqueUsers = new Set();
    executions.forEach(e => {
        if (e.userId) {
            uniqueUsers.add(e.userId);
        }
    });
    
    return uniqueUsers.size;
}

/**
 * Get total command executions count (all-time)
 */
function getTotalExecutions() {
    const stats = loadStats();
    const executions = stats.commandExecutions || [];
    return executions.length;
}

/**
 * Get most used command (all-time)
 */
function getMostUsedCommand() {
    const stats = loadStats();
    const executions = stats.commandExecutions || [];
    
    const commandCounts = {};
    executions.forEach(e => {
        if (e.command) {
            commandCounts[e.command] = (commandCounts[e.command] || 0) + 1;
        }
    });
    
    const topCommand = Object.entries(commandCounts)
        .sort(([, a], [, b]) => b - a)[0];
    
    return topCommand ? { name: topCommand[0], count: topCommand[1] } : null;
}

module.exports = {
    trackCommandExecution,
    getStats,
    getUniqueUserCount,
    getTotalExecutions,
    getMostUsedCommand
};
