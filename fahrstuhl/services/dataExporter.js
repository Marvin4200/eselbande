/**
 * Dashboard Data Exporter
 * Export statistics and data as CSV/JSON
 */

const fs = require('fs');
const path = require('path');

class DataExporter {
    constructor(exportDir = 'exports') {
        this.exportDir = exportDir;
        this.ensureDir(exportDir);
    }

    ensureDir(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    /**
     * Export command statistics as CSV
     */
    exportCommandStats(stats, filename = 'command-stats.csv') {
        try {
            const csv = this.statsToCSV(stats);
            const filePath = path.join(this.exportDir, filename);
            fs.writeFileSync(filePath, csv);
            return { success: true, file: filePath, filename };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Export command statistics as JSON
     */
    exportCommandStatsJSON(stats, filename = 'command-stats.json') {
        try {
            const filePath = path.join(this.exportDir, filename);
            fs.writeFileSync(filePath, JSON.stringify(stats, null, 2));
            return { success: true, file: filePath, filename };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Export user statistics
     */
    exportUserStats(userStats, filename = 'user-stats.csv') {
        try {
            const headers = ['User ID', 'Username', 'Guild ID', 'Commands Used', 'Last Used', 'Trolls Received'];
            const rows = [];

            for (const [userId, userData] of Object.entries(userStats)) {
                rows.push([
                    userId,
                    userData.username || 'Unknown',
                    userData.guildId || '-',
                    userData.commandsUsed || 0,
                    userData.lastUsed || '-',
                    userData.trollsReceived || 0
                ]);
            }

            const csv = [headers, ...rows].map(row => 
                row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
            ).join('\n');

            const filePath = path.join(this.exportDir, filename);
            fs.writeFileSync(filePath, csv);
            return { success: true, file: filePath, filename };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Export audit log
     */
    exportAuditLog(auditLogs, filename = 'audit-log.csv') {
        try {
            const headers = ['Timestamp', 'User', 'Guild', 'Action', 'Details'];
            const rows = auditLogs.map(log => [
                log.timestamp || '-',
                log.userName || log.userId || '-',
                log.guildName || log.guildId || '-',
                log.commandName || log.action || '-',
                log.details ? JSON.stringify(log.details) : ''
            ]);

            const csv = [headers, ...rows].map(row => 
                row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
            ).join('\n');

            const filePath = path.join(this.exportDir, filename);
            fs.writeFileSync(filePath, csv);
            return { success: true, file: filePath, filename };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Export full report
     */
    exportFullReport(data, filename = 'full-report.json') {
        try {
            const report = {
                exportedAt: new Date().toISOString(),
                stats: data.stats,
                commands: data.commands,
                users: data.users,
                auditLogs: data.auditLogs,
                summary: {
                    totalCommands: data.commands ? Object.keys(data.commands).length : 0,
                    totalUsers: data.users ? Object.keys(data.users).length : 0,
                    totalAuditEntries: data.auditLogs ? data.auditLogs.length : 0
                }
            };

            const filePath = path.join(this.exportDir, filename);
            fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
            return { success: true, file: filePath, filename };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Convert stats object to CSV
     */
    statsToCSV(stats) {
        const headers = ['Command', 'Usage Count', 'Last Used', 'Premium', 'Enabled'];
        const rows = [];

        for (const [name, data] of Object.entries(stats)) {
            rows.push([
                name,
                data.usageCount || 0,
                data.lastUsed || '-',
                data.premium ? 'Yes' : 'No',
                data.enabled ? 'Yes' : 'No'
            ]);
        }

        return [headers, ...rows].map(row => 
            row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        ).join('\n');
    }

    /**
     * Get list of available exports
     */
    listExports() {
        try {
            const files = fs.readdirSync(this.exportDir);
            return files.map(file => ({
                name: file,
                path: path.join(this.exportDir, file),
                size: fs.statSync(path.join(this.exportDir, file)).size,
                created: fs.statSync(path.join(this.exportDir, file)).birthtimeMs
            }));
        } catch (error) {
            return [];
        }
    }

    /**
     * Download export file
     */
    getExportFile(filename) {
        try {
            const filePath = path.join(this.exportDir, filename);
            if (!fs.existsSync(filePath)) {
                return { success: false, error: 'File not found' };
            }
            return { success: true, path: filePath, content: fs.readFileSync(filePath, 'utf8') };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Clean old exports (older than X days)
     */
    cleanupOldExports(daysOld = 7) {
        try {
            const files = fs.readdirSync(this.exportDir);
            const now = Date.now();
            const oneDay = 24 * 60 * 60 * 1000;
            let cleaned = 0;

            for (const file of files) {
                const filePath = path.join(this.exportDir, file);
                const stat = fs.statSync(filePath);
                const age = (now - stat.birthtimeMs) / oneDay;

                if (age > daysOld) {
                    fs.unlinkSync(filePath);
                    cleaned++;
                }
            }

            return { success: true, cleaned };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = DataExporter;
