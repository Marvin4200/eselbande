/**
 * Permission Audit Logger - Log all permission changes and admin actions
 */

const fs = require('fs');
const path = require('path');

class PermissionAuditLogger {
    constructor(config = {}) {
        this.logDir = config.logDir || './logs/audit';
        this.auditLog = [];
        this.maxLogSize = config.maxLogSize || 10000;
        this.ensureDir();
    }

    /**
     * Ensure log directory exists
     */
    ensureDir() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    /**
     * Log permission change
     * @param {Object} change - Change details
     */
    logPermissionChange(change) {
        const entry = {
            timestamp: new Date().toISOString(),
            type: 'permission_change',
            executor: change.executor,
            targetUser: change.targetUser,
            permission: change.permission,
            oldValue: change.oldValue,
            newValue: change.newValue,
            reason: change.reason || null,
            guildId: change.guildId
        };

        this.auditLog.push(entry);
        this.writeToFile(entry);

        if (this.auditLog.length > this.maxLogSize) {
            this.auditLog.shift();
        }
    }

    /**
     * Log admin action
     * @param {Object} action - Action details
     */
    logAdminAction(action) {
        const entry = {
            timestamp: new Date().toISOString(),
            type: 'admin_action',
            admin: action.admin,
            action: action.action,
            target: action.target || null,
            details: action.details || null,
            guildId: action.guildId,
            successful: action.successful !== false
        };

        this.auditLog.push(entry);
        this.writeToFile(entry);

        if (this.auditLog.length > this.maxLogSize) {
            this.auditLog.shift();
        }
    }

    /**
     * Log role change
     * @param {Object} change - Role change details
     */
    logRoleChange(change) {
        const entry = {
            timestamp: new Date().toISOString(),
            type: 'role_change',
            executor: change.executor,
            targetUser: change.targetUser,
            role: change.role,
            action: change.action, // 'add' or 'remove'
            guildId: change.guildId
        };

        this.auditLog.push(entry);
        this.writeToFile(entry);
    }

    /**
     * Write entry to file
     * @param {Object} entry - Log entry
     */
    writeToFile(entry) {
        try {
            const date = new Date().toISOString().split('T')[0];
            const filename = `audit-${date}.jsonl`;
            const filepath = path.join(this.logDir, filename);

            fs.appendFileSync(filepath, JSON.stringify(entry) + '\n');
        } catch (error) {
            console.error('Failed to write audit log:', error.message);
        }
    }

    /**
     * Get audit log for user
     * @param {string} userId - User ID
     * @param {number} limit - Limit results
     * @returns {Array<Object>}
     */
    getUserAuditLog(userId, limit = 50) {
        return this.auditLog
            .filter(e => e.targetUser === userId || e.executor === userId)
            .reverse()
            .slice(0, limit);
    }

    /**
     * Get audit log for guild
     * @param {string} guildId - Guild ID
     * @param {number} limit - Limit results
     * @returns {Array<Object>}
     */
    getGuildAuditLog(guildId, limit = 100) {
        return this.auditLog
            .filter(e => e.guildId === guildId)
            .reverse()
            .slice(0, limit);
    }

    /**
     * Get audit log for time range
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @returns {Array<Object>}
     */
    getAuditLogByDateRange(startDate, endDate) {
        const start = new Date(startDate).getTime();
        const end = new Date(endDate).getTime();

        return this.auditLog.filter(e => {
            const time = new Date(e.timestamp).getTime();
            return time >= start && time <= end;
        });
    }

    /**
     * Search audit log
     * @param {string} query - Search term
     * @returns {Array<Object>}
     */
    search(query) {
        const lowerQuery = query.toLowerCase();
        return this.auditLog.filter(e => 
            JSON.stringify(e).toLowerCase().includes(lowerQuery)
        );
    }

    /**
     * Generate compliance report
     * @param {string} guildId - Guild ID
     * @returns {Object}
     */
    generateComplianceReport(guildId) {
        const guildLog = this.getGuildAuditLog(guildId, 1000);
        
        const stats = {
            totalEntries: guildLog.length,
            permissionChanges: guildLog.filter(e => e.type === 'permission_change').length,
            adminActions: guildLog.filter(e => e.type === 'admin_action').length,
            roleChanges: guildLog.filter(e => e.type === 'role_change').length,
            adminsInvolved: new Set(guildLog.map(e => e.executor)).size,
            dateRange: {
                start: guildLog[guildLog.length - 1]?.timestamp,
                end: guildLog[0]?.timestamp
            }
        };

        return {
            guildId,
            generatedAt: new Date().toISOString(),
            stats
        };
    }

    /**
     * Rollback permission change
     * @param {string} entryId - Entry to rollback
     * @returns {Object} - Rollback info
     */
    rollbackPermissionChange(entryId) {
        const entry = this.auditLog.find(e => e.timestamp === entryId);
        if (!entry) return null;

        const rollback = {
            timestamp: new Date().toISOString(),
            type: 'rollback',
            originalEntry: entry,
            rollbackAction: {
                targetUser: entry.targetUser,
                permission: entry.permission,
                newValue: entry.oldValue,
                reason: 'Rolled back'
            }
        };

        this.auditLog.push(rollback);
        this.writeToFile(rollback);
        return rollback;
    }

    /**
     * Export audit log
     * @param {string} guildId - Guild ID
     * @returns {string} - JSON export
     */
    exportAuditLog(guildId) {
        const guildLog = this.getGuildAuditLog(guildId, 10000);
        return JSON.stringify(guildLog, null, 2);
    }

    /**
     * Clear old logs
     * @param {number} days - Keep logs older than days
     */
    clearOldLogs(days = 90) {
        const cutoff = Date.now() - (days * 86400000);
        const initialSize = this.auditLog.length;

        this.auditLog = this.auditLog.filter(e => {
            return new Date(e.timestamp).getTime() > cutoff;
        });

        return initialSize - this.auditLog.length;
    }
}

module.exports = PermissionAuditLogger;
