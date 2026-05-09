/**
 * Command Statistics Manager
 * Trackt Command-Execution und aktualisiert globalStats.json
 */

const fs = require('fs');
const path = require('path');

class CommandStatsManager {
    constructor() {
        this.statsFile = path.join(__dirname, '../globalStats.json');
        this.stats = {
            commands: {},
            totalExecutions: 0,
            lastUpdated: new Date().toISOString()
        };
        this.loadStats();
    }

    loadStats() {
        try {
            if (fs.existsSync(this.statsFile)) {
                const data = JSON.parse(fs.readFileSync(this.statsFile, 'utf8'));
                // Merge with existing data
                this.stats = {
                    ...data,
                    commands: data.commands || {},
                    totalExecutions: data.totalExecutions || 0
                };
            }
        } catch (error) {
            console.error('Error loading command stats:', error.message);
        }
    }

    /**
     * Track a command execution
    * @param {string} commandName - Command name (e.g., "fahrstuhl")
     */
    trackCommand(commandName) {
        if (!commandName) return;
        
        // Initialize counter if not exists
        if (!this.stats.commands[commandName]) {
            this.stats.commands[commandName] = 0;
        }
        
        // Increment counter
        this.stats.commands[commandName]++;
        this.stats.totalExecutions++;
        this.stats.lastUpdated = new Date().toISOString();
        
        // Save to file
        this.saveStats();
    }

    /**
     * Track a command error
     * @param {string} commandName
     */
    trackError(commandName) {
        if (!commandName) return;
        if (!this.stats.errors) this.stats.errors = {};
        if (!this.stats.errors[commandName]) this.stats.errors[commandName] = 0;
        this.stats.errors[commandName]++;
        this.stats.totalErrors = (this.stats.totalErrors || 0) + 1;
        this.stats.lastUpdated = new Date().toISOString();
        this.saveStats();
    }

    saveStats() {
        try {
            const existingData = fs.existsSync(this.statsFile) 
                ? JSON.parse(fs.readFileSync(this.statsFile, 'utf8')) 
                : {};
            
            // Merge: keep existing fields, update commands
            const merged = {
                ...existingData,
                ...this.stats,
                commands: {
                    ...existingData.commands,
                    ...this.stats.commands
                }
            };
            
            fs.writeFileSync(this.statsFile, JSON.stringify(merged, null, 2), 'utf8');
        } catch (error) {
            console.error('Error saving command stats:', error.message);
        }
    }

    /**
     * Get total command count
     */
    getTotalCommands() {
        return this.stats.totalExecutions;
    }

    /**
     * Get top command
     */
    getTopCommand() {
        if (!this.stats.commands || Object.keys(this.stats.commands).length === 0) {
            return null;
        }
        
        const entries = Object.entries(this.stats.commands);
        const [topCmd] = entries.sort(([, a], [, b]) => b - a);
        return topCmd ? topCmd[0] : null;
    }

    /**
     * Get all stats
     */
    getAllStats() {
        return this.stats;
    }
}

module.exports = new CommandStatsManager();
