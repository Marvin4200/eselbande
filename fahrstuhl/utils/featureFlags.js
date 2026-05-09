/**
 * Feature Flags System - Enable/disable features per guild
 */

class FeatureFlags {
    constructor(config = {}) {
        this.globalFlags = new Map(); // featureName -> { enabled, version }
        this.guildOverrides = new Map(); // guildId -> Map<featureName, enabled>
        this.featureABTests = new Map(); // featureName -> { variantA, variantB, users }
    }

    /**
     * Register a new feature flag
     * @param {string} name - Feature name
     * @param {boolean} enabled - Is enabled globally
     * @param {string} version - Version of feature
     */
    registerFlag(name, enabled = false, version = '1.0') {
        this.globalFlags.set(name, { enabled, version });
    }

    /**
     * Check if feature is enabled
     * @param {string} name - Feature name
     * @param {string} guildId - Guild ID (optional)
     * @returns {boolean}
     */
    isEnabled(name, guildId = null) {
        // Check guild override first
        if (guildId) {
            const guildFlags = this.guildOverrides.get(guildId);
            if (guildFlags && guildFlags.has(name)) {
                return guildFlags.get(name);
            }
        }

        // Check global flag
        const flag = this.globalFlags.get(name);
        return flag ? flag.enabled : false;
    }

    /**
     * Set guild-specific override
     * @param {string} guildId - Guild ID
     * @param {string} name - Feature name
     * @param {boolean} enabled - Is enabled
     */
    setGuildOverride(guildId, name, enabled) {
        if (!this.guildOverrides.has(guildId)) {
            this.guildOverrides.set(guildId, new Map());
        }
        this.guildOverrides.get(guildId).set(name, enabled);
    }

    /**
     * Setup A/B test for a feature
     * @param {string} name - Feature name
     * @param {string} variantA - Control variant
     * @param {string} variantB - Test variant
     */
    setupABTest(name, variantA, variantB) {
        this.featureABTests.set(name, {
            variantA,
            variantB,
            users: new Map() // userId -> variant
        });
    }

    /**
     * Get A/B test variant for user
     * @param {string} name - Feature name
     * @param {string} userId - User ID
     * @returns {string} - Variant (A or B)
     */
    getABTestVariant(name, userId) {
        const test = this.featureABTests.get(name);
        if (!test) return null;

        if (test.users.has(userId)) {
            return test.users.get(userId);
        }

        // Random 50/50 split
        const variant = Math.random() < 0.5 ? 'A' : 'B';
        test.users.set(userId, variant);
        return variant;
    }

    /**
     * Get all flags for a guild
     * @param {string} guildId - Guild ID
     * @returns {Object}
     */
    getGuildFlags(guildId) {
        const flags = {};
        for (const [name] of this.globalFlags) {
            flags[name] = this.isEnabled(name, guildId);
        }
        return flags;
    }

    /**
     * Get flag status
     */
    getStatus(name) {
        const flag = this.globalFlags.get(name);
        if (!flag) return null;

        const test = this.featureABTests.get(name);
        return {
            name,
            enabled: flag.enabled,
            version: flag.version,
            abTestRunning: !!test,
            abTestUserCount: test ? test.users.size : 0
        };
    }

    /**
     * Get all flags status
     */
    getAllStatus() {
        const statuses = [];
        for (const [name] of this.globalFlags) {
            statuses.push(this.getStatus(name));
        }
        return statuses;
    }
}

module.exports = FeatureFlags;
