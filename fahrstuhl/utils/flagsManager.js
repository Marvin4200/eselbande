/**
 * Flags Manager
 * Liest Dashboard-Flags und überprüft ob Commands enabled sind
 */

const fs = require('fs');
const path = require('path');

class FlagsManager {
    constructor() {
        this.flagsFile = path.join(__dirname, '../dashboard/data/flags.json');
        this.flags = [];
        this.loadFlags();
    }

    loadFlags() {
        try {
            if (fs.existsSync(this.flagsFile)) {
                const data = fs.readFileSync(this.flagsFile, 'utf8');
                this.flags = JSON.parse(data) || [];
                console.log(`✓ Loaded ${this.flags.length} feature flags`);
            }
        } catch (error) {
            console.error('Error loading flags:', error.message);
            this.flags = [];
        }
    }

    // Refresh flags from file
    refresh() {
        this.loadFlags();
    }

    /**
     * Check if a command/feature is enabled
    * @param {string} commandName - Command name (e.g., "fahrstuhl")
     * @param {string} guildId - Guild ID (optional, for guild-specific checks)
     * @returns {boolean} - true if enabled (default) or explicitly enabled, false if disabled
     */
    isEnabled(commandName, guildId = null) {
        // Find matching flag
        let flag = null;

        // First check guild-specific flag
        if (guildId) {
            flag = this.flags.find(f =>
                f.name === commandName &&
                f.guildId === guildId
            );
        }

        // Then check global flag
        if (!flag) {
            flag = this.flags.find(f =>
                f.name === commandName &&
                !f.guildId
            );
        }

        // Default to enabled if no flag exists
        if (!flag) return true;

        return flag.enabled !== false;
    }

    /**
     * Get reason for disabled feature
     * @param {string} commandName
     * @param {string} guildId
     * @returns {string|null}
     */
    getDisableReason(commandName, guildId = null) {
        if (this.isEnabled(commandName, guildId)) {
            return null;
        }
        return `The command \`/${commandName}\` is currently disabled.`;
    }

    saveFlags() {
        try {
            fs.writeFileSync(this.flagsFile, JSON.stringify(this.flags, null, 2));
        } catch (error) {
            console.error('Error saving flags:', error.message);
        }
    }

    setFlag(name, enabled, guildId = null) {
        const idx = this.flags.findIndex(f =>
            f.name === name && (f.guildId ?? null) === guildId
        );
        if (idx >= 0) {
            this.flags[idx].enabled = enabled;
        } else {
            this.flags.push({ name, enabled, guildId });
        }
        this.saveFlags();
    }

    /**
     * Get all flags
     */
    getAllFlags() {
        return this.flags;
    }
}

module.exports = new FlagsManager();
