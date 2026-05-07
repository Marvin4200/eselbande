const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(__dirname, '../../data/guildSettings.json');

function loadSettings() {
    if (!fs.existsSync(SETTINGS_PATH)) return {};
    try {
        return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    } catch {
        return {};
    }
}

function saveSettings(data) {
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2));
}

function getGuildSettings(guildId) {
    return loadSettings()[guildId] || {};
}

function setGuildSettings(guildId, update) {
    const settings = loadSettings();
    settings[guildId] = { ...(settings[guildId] || {}), ...update };
    saveSettings(settings);
}

module.exports = { getGuildSettings, setGuildSettings };
