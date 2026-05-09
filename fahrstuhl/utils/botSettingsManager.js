/**
 * Bot Settings Manager
 * Verwaltet globale Bot-Einstellungen (Prefix, Language, etc.)
 */

const fs = require('fs');
const path = require('path');

class BotSettingsManager {
    constructor() {
        this.settingsFile = path.join(__dirname, '../dashboard/data/botSettings.json');
        this.settings = this.loadSettings();
    }

    loadSettings() {
        try {
            if (fs.existsSync(this.settingsFile)) {
                const data = fs.readFileSync(this.settingsFile, 'utf8');
                const loaded = JSON.parse(data);
                console.log(`✓ Bot Settings loaded`);
                return this.mergeDefaults(loaded);
            }
        } catch (error) {
            console.error('Error loading bot settings:', error.message);
        }
        return this.getDefaults();
    }

    getDefaults() {
        return {
            prefix: '!',
            language: 'en',
            logLevel: 'info',
            autoReconnect: true,
            commandPrefix: '/',
            timezone: 'UTC',
            maintenanceMode: false,
            maintenanceMessage: 'Bot is under maintenance',
            maxRetries: 3,
            commandCooldown: 3000,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    mergeDefaults(loaded) {
        const defaults = this.getDefaults();
        return {
            ...defaults,
            ...loaded,
            createdAt: loaded.createdAt || defaults.createdAt,
            updatedAt: new Date().toISOString()
        };
    }

    saveSettings() {
        try {
            // Ensure directory exists
            const dir = path.dirname(this.settingsFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            this.settings.updatedAt = new Date().toISOString();
            fs.writeFileSync(this.settingsFile, JSON.stringify(this.settings, null, 2), 'utf8');
            console.log(`✓ Bot Settings saved`);
            return true;
        } catch (error) {
            console.error('Error saving bot settings:', error.message);
            return false;
        }
    }

    // Get single setting
    get(key) {
        return this.settings[key];
    }

    // Set single setting
    set(key, value) {
        this.settings[key] = value;
        this.settings.updatedAt = new Date().toISOString();
        this.saveSettings();
        return true;
    }

    // Update multiple settings
    update(updates) {
        Object.assign(this.settings, updates);
        this.settings.updatedAt = new Date().toISOString();
        this.saveSettings();
        return this.settings;
    }

    // Get all settings
    getAll() {
        return { ...this.settings };
    }

    // Reset to defaults
    reset() {
        this.settings = this.getDefaults();
        this.saveSettings();
        return this.settings;
    }

    // Refresh from file
    refresh() {
        this.settings = this.loadSettings();
        return this.settings;
    }
}

module.exports = new BotSettingsManager();
