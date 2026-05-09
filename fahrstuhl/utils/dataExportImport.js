/**
 * Data Export/Import System - Export and import guild configurations and user data
 */

const fs = require('fs');
const path = require('path');

class DataExportImport {
    constructor(config = {}) {
        this.exportDir = config.exportDir || './exports';
        this.ensureDir();
    }

    /**
     * Ensure export directory exists
     */
    ensureDir() {
        if (!fs.existsSync(this.exportDir)) {
            fs.mkdirSync(this.exportDir, { recursive: true });
        }
    }

    /**
     * Export guild configuration to JSON
     * @param {string} guildId - Guild ID
     * @param {Object} guildData - Guild configuration data
     * @returns {string} - File path
     */
    exportGuildConfig(guildId, guildData) {
        try {
            const timestamp = new Date().toISOString().split('T')[0];
            const filename = `guild-${guildId}-${timestamp}.json`;
            const filepath = path.join(this.exportDir, filename);

            const exportData = {
                guildId,
                exportedAt: new Date().toISOString(),
                data: guildData
            };

            fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2));
            return filepath;
        } catch (error) {
            console.error(`Failed to export guild config:`, error.message);
            return null;
        }
    }

    /**
     * Export user statistics to CSV
     * @param {Array<Object>} userStats - User statistics array
     * @returns {string} - CSV content
     */
    exportUserStatsAsCSV(userStats) {
        if (!Array.isArray(userStats) || userStats.length === 0) {
            return 'userId,username,commandsUsed,lastCommand\n';
        }

        let csv = 'userId,username,commandsUsed,lastCommand\n';
        for (const user of userStats) {
            csv += `${user.id},"${user.name}",${user.commands},${user.lastCommand || 'N/A'}\n`;
        }
        return csv;
    }

    /**
     * Export all guild data to ZIP-like JSON
     * @param {Object} allGuildData - All guilds data
     * @returns {string} - File path
     */
    exportAllGuilds(allGuildData) {
        try {
            const timestamp = new Date().toISOString().split('T')[0];
            const filename = `all-guilds-${timestamp}.json`;
            const filepath = path.join(this.exportDir, filename);

            const exportData = {
                exportedAt: new Date().toISOString(),
                guildCount: Object.keys(allGuildData).length,
                guilds: allGuildData
            };

            fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2));
            return filepath;
        } catch (error) {
            console.error(`Failed to export all guilds:`, error.message);
            return null;
        }
    }

    /**
     * Import guild configuration from JSON
     * @param {string} filepath - File path
     * @returns {Object} - Guild data or null
     */
    importGuildConfig(filepath) {
        try {
            const resolvedPath = path.resolve(filepath);
            const resolvedExportDir = path.resolve(this.exportDir);
            if (!resolvedPath.startsWith(resolvedExportDir + path.sep) && resolvedPath !== resolvedExportDir) {
                console.error(`Import rejected: path outside export directory: ${filepath}`);
                return null;
            }

            if (!fs.existsSync(resolvedPath)) {
                console.error(`File not found: ${filepath}`);
                return null;
            }

            const content = fs.readFileSync(resolvedPath, 'utf8');
            const data = JSON.parse(content);
            return data.data;
        } catch (error) {
            console.error(`Failed to import guild config:`, error.message);
            return null;
        }
    }

    /**
     * List all available exports
     * @returns {Array<Object>} - Export file information
     */
    listExports() {
        try {
            const files = fs.readdirSync(this.exportDir);
            return files
                .filter(f => f.endsWith('.json') || f.endsWith('.csv'))
                .map(f => ({
                    filename: f,
                    filepath: path.join(this.exportDir, f),
                    size: fs.statSync(path.join(this.exportDir, f)).size,
                    modified: fs.statSync(path.join(this.exportDir, f)).mtime
                }));
        } catch (error) {
            console.error(`Failed to list exports:`, error.message);
            return [];
        }
    }

    /**
     * Delete old exports (older than days)
     * @param {number} days - Number of days to keep
     * @returns {number} - Number of files deleted
     */
    cleanupOldExports(days = 30) {
        try {
            const files = fs.readdirSync(this.exportDir);
            const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
            let deleted = 0;

            for (const file of files) {
                const filepath = path.join(this.exportDir, file);
                const stat = fs.statSync(filepath);
                
                if (stat.mtime.getTime() < cutoffTime) {
                    fs.unlinkSync(filepath);
                    deleted++;
                }
            }

            return deleted;
        } catch (error) {
            console.error(`Failed to cleanup old exports:`, error.message);
            return 0;
        }
    }
}

module.exports = DataExportImport;
