/**
 * Database Migration System - Handle schema versioning and migrations
 */

const fs = require('fs');
const path = require('path');

class DatabaseMigration {
    constructor(config = {}) {
        this.migrationsDir = config.migrationsDir || './migrations';
        this.migrations = new Map(); // version -> migration function
        this.appliedMigrations = []; // Applied migration versions
        this.currentVersion = '1.0.0';
        this.ensureDir();
    }

    /**
     * Ensure migrations directory exists
     */
    ensureDir() {
        if (!fs.existsSync(this.migrationsDir)) {
            fs.mkdirSync(this.migrationsDir, { recursive: true });
        }
    }

    /**
     * Register a migration
     * @param {string} version - Version number (e.g., '1.0.1')
     * @param {string} description - Migration description
     * @param {Function} upFn - Upgrade function
     * @param {Function} downFn - Downgrade function
     */
    registerMigration(version, description, upFn, downFn) {
        this.migrations.set(version, {
            version,
            description,
            up: upFn,
            down: downFn,
            appliedAt: null
        });
    }

    /**
     * Run pending migrations
     * @param {Object} db - Database connection
     * @returns {Promise<Array>}
     */
    async runPendingMigrations(db) {
        const pending = this.getPendingMigrations();
        const results = [];

        for (const version of pending) {
            const migration = this.migrations.get(version);
            try {
                await migration.up(db);
                migration.appliedAt = new Date().toISOString();
                this.appliedMigrations.push(version);
                this.saveMigrationLog();

                results.push({
                    version,
                    status: 'success',
                    description: migration.description
                });
            } catch (error) {
                results.push({
                    version,
                    status: 'failed',
                    error: error.message
                });

                // Stop on first failure
                break;
            }
        }

        return results;
    }

    /**
     * Get pending migrations
     * @returns {Array<string>}
     */
    getPendingMigrations() {
        const pending = [];
        for (const version of this.migrations.keys()) {
            if (!this.appliedMigrations.includes(version)) {
                pending.push(version);
            }
        }
        return pending.sort();
    }

    /**
     * Rollback last migration
     * @param {Object} db - Database connection
     * @returns {Promise<Object>}
     */
    async rollbackLast(db) {
        if (this.appliedMigrations.length === 0) {
            return { status: 'error', message: 'No migrations to rollback' };
        }

        const lastVersion = this.appliedMigrations[this.appliedMigrations.length - 1];
        const migration = this.migrations.get(lastVersion);

        try {
            await migration.down(db);
            this.appliedMigrations.pop();
            migration.appliedAt = null;
            this.saveMigrationLog();

            return {
                status: 'success',
                version: lastVersion,
                description: migration.description
            };
        } catch (error) {
            return {
                status: 'error',
                message: `Failed to rollback ${lastVersion}: ${error.message}`
            };
        }
    }

    /**
     * Save migration log
     */
    saveMigrationLog() {
        try {
            const logPath = path.join(this.migrationsDir, 'migrations.json');
            const log = {
                appliedMigrations: this.appliedMigrations,
                currentVersion: this.appliedMigrations[this.appliedMigrations.length - 1] || '0.0.0',
                lastUpdated: new Date().toISOString()
            };

            fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
        } catch (error) {
            console.error('Failed to save migration log:', error.message);
        }
    }

    /**
     * Load migration log
     */
    loadMigrationLog() {
        try {
            const logPath = path.join(this.migrationsDir, 'migrations.json');
            if (fs.existsSync(logPath)) {
                const content = fs.readFileSync(logPath, 'utf8');
                const log = JSON.parse(content);
                this.appliedMigrations = log.appliedMigrations || [];
                this.currentVersion = log.currentVersion || '1.0.0';
            }
        } catch (error) {
            console.error('Failed to load migration log:', error.message);
        }
    }

    /**
     * Get migration status
     * @returns {Object}
     */
    getStatus() {
        return {
            currentVersion: this.currentVersion,
            appliedCount: this.appliedMigrations.length,
            pendingCount: this.getPendingMigrations().length,
            migrations: Array.from(this.migrations.entries()).map(([version, mig]) => ({
                version,
                description: mig.description,
                applied: this.appliedMigrations.includes(version),
                appliedAt: mig.appliedAt
            }))
        };
    }

    /**
     * Generate migration template
     * @param {string} name - Migration name
     * @returns {string} - Template code
     */
    generateTemplate(name) {
        const timestamp = Date.now();
        return `
// Migration: ${name}
// Generated: ${new Date().toISOString()}

async function up(db) {
    // Write your upgrade logic here
    // Example: await db.query('ALTER TABLE users ADD COLUMN ...');
}

async function down(db) {
    // Write your downgrade logic here
    // Example: await db.query('ALTER TABLE users DROP COLUMN ...');
}

module.exports = { up, down };
`;
    }
}

module.exports = DatabaseMigration;
