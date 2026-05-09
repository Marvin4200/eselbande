/**
 * Premium Manager
 * Simple premium system (yes/no)
 */

const PremiumDatabase = require('./premiumDatabase');

class PremiumManager {
    constructor() {
        this.db = PremiumDatabase;
    }

    async initialize() {
        await this.db.init();
        console.log('✓ Premium Manager initialized');
    }

    // Check if user has premium
    async isPremium(userId) {
        return await this.db.isPremium(userId);
    }

    // Check if user has pro tier
    async isPro(userId) {
        return await this.db.isPro(userId);
    }

    // Check if command is available for user
    async isCommandAvailable(commandName, userId) {
        // Pro-only commands
        if (commandName === 'settrollmessage') {
            return await this.isPro(userId);
        }
        // Basic-premium-only commands
        if (commandName === 'notifysettings') {
            return await this.isPremium(userId);
        }
        // All other commands are free
        return true;
    }

    // Activate premium (basic by default)
    async activatePremium(userId, daysValid = 365, tier = 'basic') {
        await this.db.activate(userId, daysValid, tier);
        const info = await this.db.getUserInfo(userId);
        return info;
    }

    // Activate pro tier
    async activatePro(userId, daysValid = 365) {
        return this.activatePremium(userId, daysValid, 'pro');
    }

    // Deactivate premium
    async deactivatePremium(userId) {
        await this.db.deactivate(userId);
    }

    // Get user info
    async getUserInfo(userId) {
        return await this.db.getUserInfo(userId);
    }

    // Get all premium users
    async getAllPremium() {
        return await this.db.getAllPremium();
    }
}

module.exports = new PremiumManager();
