/**
 * Notification Manager
 * Manages user opt-in settings for troll notifications
 * Users receive DMs when they're being trolled (optional)
 */

const { EmbedBuilder } = require('discord.js');
const { COLORS, EMOJIS } = require('./designSystem');
const fs = require('fs');
const path = require('path');

class NotificationManager {
    constructor() {
        this.settingsFile = path.join(__dirname, '../data/notifySettings.json');
        this.userNotifySettings = new Map(); // userId -> { dmNotify: boolean }
        this.loadSettings();
    }

    loadSettings() {
        try {
            if (fs.existsSync(this.settingsFile)) {
                const data = JSON.parse(fs.readFileSync(this.settingsFile, 'utf8'));
                for (const [userId, settings] of Object.entries(data)) {
                    this.userNotifySettings.set(userId, settings);
                }
            }
        } catch (e) {
            console.error('NotificationManager: failed to load settings:', e.message);
        }
    }

    saveSettings() {
        try {
            const dir = path.dirname(this.settingsFile);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const obj = Object.fromEntries(this.userNotifySettings);
            fs.writeFileSync(this.settingsFile, JSON.stringify(obj, null, 2), 'utf8');
        } catch (e) {
            console.error('NotificationManager: failed to save settings:', e.message);
        }
    }

    /**
     * Check if user has DM notifications enabled
     */
    hasNotificationsEnabled(userId) {
        const settings = this.userNotifySettings.get(userId);
        return settings?.dmNotify === true;
    }

    /**
     * Toggle notifications for user
     */
    toggleNotifications(userId, enabled = null) {
        if (enabled === null) {
            const current = this.userNotifySettings.get(userId);
            enabled = !current?.dmNotify;
        }

        this.userNotifySettings.set(userId, { dmNotify: enabled });
        this.saveSettings();
        return enabled;
    }

    /**
     * Get user notification settings
     */
    getSettings(userId) {
        return this.userNotifySettings.get(userId) || { dmNotify: false };
    }

    /**
     * Build notification embed for DM
     */
    buildNotificationEmbed(trollName, guildName, description, duration = null) {
        const embed = new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setTitle(`${EMOJIS.TROLL} You're Being Trolled!`)
            .setDescription(`You're being trolled on **${guildName}**`)
            .addFields({
                name: 'Troll Type',
                value: trollName,
                inline: true
            });

        if (duration) {
            embed.addFields({
                name: 'Duration',
                value: duration,
                inline: true
            });
        }

        embed.addFields({
                name: '🛡️ Protection',
                value: 'Use `/claim` to get a shield and protect yourself!',
                inline: false
            },
            {
                name: '🔕 Disable Notifications',
                value: 'Use `/notifysettings` to turn off these DMs',
                inline: false
            })
            .setTimestamp();

        return embed;
    }

    /**
     * Send troll notification DM to user
     * Safe: Returns false if DM fails, doesn't throw
     */
    async sendTrollNotification(user, trollName, guildName, duration = null) {
        try {
            // Check if user has notifications enabled
            if (!this.hasNotificationsEnabled(user.id)) {
                return false;
            }

            // Check if user accepts DMs
            if (user.bot) return false;

            const embed = this.buildNotificationEmbed(trollName, guildName, duration);

            await user.send({ embeds: [embed] }).catch(e => {
                // User probably has DMs closed - fail silently
                console.debug(`Could not send troll notification to ${user.tag}:`, e.message);
                return null;
            });

            return true;
        } catch (err) {
            console.error('Notification sending error:', err.message);
            return false;
        }
    }
}

module.exports = new NotificationManager();
