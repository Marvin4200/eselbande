// Guild-aware rate limiting with per-guild cooldown configuration

class GuildAwareCooldown {
    constructor(config = {}) {
        this.globalCooldowns = new Map(); // userId+commandName -> expiry
        this.guildCooldowns = new Map(); // guildId+userId+commandName -> expiry
        this.commandDefaults = new Map(); // commandName -> defaultCooldownMs
        this.guildOverrides = new Map(); // guildId+commandName -> cooldownMs
        this.defaultCooldownMs = config.defaultCooldownMs || 3000;
    }

    // Set default cooldown for a command
    setCommandDefault(commandName, cooldownMs) {
        this.commandDefaults.set(commandName.toLowerCase(), cooldownMs);
    }

    // Set guild-specific cooldown override
    setGuildOverride(guildId, commandName, cooldownMs) {
        const key = `${guildId}:${commandName.toLowerCase()}`;
        if (cooldownMs <= 0) {
            this.guildOverrides.delete(key);
        } else {
            this.guildOverrides.set(key, cooldownMs);
        }
    }

    // Remove guild override (revert to default)
    removeGuildOverride(guildId, commandName) {
        const key = `${guildId}:${commandName.toLowerCase()}`;
        this.guildOverrides.delete(key);
    }

    // Get effective cooldown for a command in a guild
    getEffectiveCooldown(guildId, commandName) {
        const cmdName = commandName.toLowerCase();

        // Check guild-specific override first
        if (guildId) {
            const overrideKey = `${guildId}:${cmdName}`;
            if (this.guildOverrides.has(overrideKey)) {
                return this.guildOverrides.get(overrideKey);
            }
        }

        // Check command default
        if (this.commandDefaults.has(cmdName)) {
            return this.commandDefaults.get(cmdName);
        }

        // Return global default
        return this.defaultCooldownMs;
    }

    // Check if user has cooldown
    hasCooldown(userId, guildId, commandName) {
        const cmdName = commandName.toLowerCase();
        const cooldownMs = this.getEffectiveCooldown(guildId, cmdName);

        // Check guild-specific cooldown first (stronger)
        if (guildId) {
            const guildKey = `${guildId}:${userId}:${cmdName}`;
            const guildExpiry = this.guildCooldowns.get(guildKey);
            if (guildExpiry && Date.now() < guildExpiry) {
                return {
                    hasCooldown: true,
                    remaining: guildExpiry - Date.now(),
                    type: 'guild'
                };
            }
        }

        // Check global cooldown
        const globalKey = `${userId}:${cmdName}`;
        const globalExpiry = this.globalCooldowns.get(globalKey);
        if (globalExpiry && Date.now() < globalExpiry) {
            return {
                hasCooldown: true,
                remaining: globalExpiry - Date.now(),
                type: 'global'
            };
        }

        return { hasCooldown: false, remaining: 0, type: null };
    }

    // Set cooldown for user
    setCooldown(userId, guildId, commandName) {
        const cmdName = commandName.toLowerCase();
        const cooldownMs = this.getEffectiveCooldown(guildId, cmdName);

        // Set global cooldown
        const globalKey = `${userId}:${cmdName}`;
        this.globalCooldowns.set(globalKey, Date.now() + cooldownMs);

        // Set guild cooldown if in a guild
        if (guildId) {
            const guildKey = `${guildId}:${userId}:${cmdName}`;
            this.guildCooldowns.set(guildKey, Date.now() + cooldownMs);
        }
    }

    // Reset cooldown for user
    resetCooldown(userId, guildId, commandName) {
        const cmdName = commandName.toLowerCase();

        const globalKey = `${userId}:${cmdName}`;
        this.globalCooldowns.delete(globalKey);

        if (guildId) {
            const guildKey = `${guildId}:${userId}:${cmdName}`;
            this.guildCooldowns.delete(guildKey);
        }
    }

    // Reset all cooldowns for a user
    resetAllUserCooldowns(userId) {
        for (const key of this.globalCooldowns.keys()) {
            if (key.startsWith(`${userId}:`)) {
                this.globalCooldowns.delete(key);
            }
        }

        for (const key of this.guildCooldowns.keys()) {
            if (key.includes(`:${userId}:`)) {
                this.guildCooldowns.delete(key);
            }
        }
    }

    // Reset all cooldowns for a command in a guild
    resetGuildCommandCooldowns(guildId, commandName) {
        const cmdName = commandName.toLowerCase();

        for (const key of this.guildCooldowns.keys()) {
            if (key.endsWith(`:${cmdName}`) && key.startsWith(`${guildId}:`)) {
                this.guildCooldowns.delete(key);
            }
        }
    }

    // Clean up expired cooldowns
    cleanup() {
        const now = Date.now();
        let removed = 0;

        for (const [key, expiry] of this.globalCooldowns) {
            if (now >= expiry) {
                this.globalCooldowns.delete(key);
                removed++;
            }
        }

        for (const [key, expiry] of this.guildCooldowns) {
            if (now >= expiry) {
                this.guildCooldowns.delete(key);
                removed++;
            }
        }

        return removed;
    }

    // Get stats
    getStats() {
        return {
            globalCooldowns: this.globalCooldowns.size,
            guildCooldowns: this.guildCooldowns.size,
            commandDefaults: this.commandDefaults.size,
            guildOverrides: this.guildOverrides.size
        };
    }

    // Get config for a guild
    getGuildConfig(guildId) {
        const config = {};
        for (const [key, cooldown] of this.guildOverrides) {
            if (key.startsWith(`${guildId}:`)) {
                const cmd = key.split(':')[1];
                config[cmd] = cooldown;
            }
        }
        return config;
    }

    // Set multiple guild overrides at once
    setGuildConfig(guildId, configMap) {
        for (const [commandName, cooldownMs] of Object.entries(configMap)) {
            this.setGuildOverride(guildId, commandName, cooldownMs);
        }
    }

    // Clear all data
    clear() {
        this.globalCooldowns.clear();
        this.guildCooldowns.clear();
        this.commandDefaults.clear();
        this.guildOverrides.clear();
    }
}

module.exports = GuildAwareCooldown;
