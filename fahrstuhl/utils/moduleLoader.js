/**
 * Central Module Loader
 * Consolidate all requires to avoid duplication
 * 
 * Usage in any file:
 * const { discord, logger, config } = require('./utils/moduleLoader');
 */

// Discord.js modules (cached)
const discordModules = {
    Client: null,
    REST: null,
    Routes: null,
    SlashCommandBuilder: null,
    EmbedBuilder: null,
    PermissionsBitField: null,
    ActivityType: null,
    MessageFlags: null,
    VoiceConnection: null
};

// Service modules (cached)
const serviceModules = {
    logger: null,
    config: null,
    backup: null,
    trolls: null
};

// Utility modules (cached)
const utilModules = {
    helpers: null,
    constants: null,
    validator: null,
    rateLimiter: null,
    auditLogger: null,
    sanitizer: null,
    tokenMasking: null,
    envValidator: null,
    envConfig: null,
    voiceTracker: null,
    healthCheck: null,
    gracefulDegradation: null,
    metricsCollector: null,
    guildAwareCooldown: null,
    errorBoundary: null,
    nullCheck: null
};

/**
 * Load Discord.js modules
 * @param {string} name - Module name
 * @returns {*} - Discord.js module
 */
function loadDiscordModule(name) {
    if (!discordModules.hasOwnProperty(name)) {
        throw new Error(`Unknown Discord.js module: ${name}`);
    }

    if (!discordModules[name]) {
        const modules = require('discord.js');
        discordModules[name] = modules[name];
    }

    return discordModules[name];
}

/**
 * Load service module
 * @param {string} name - Module name
 * @returns {*} - Service module
 */
function loadServiceModule(name) {
    if (!serviceModules.hasOwnProperty(name)) {
        throw new Error(`Unknown service module: ${name}`);
    }

    if (!serviceModules[name]) {
        const path = `../services/${name}`;
        try {
            const mod = require(path);
            serviceModules[name] = mod.default || mod;
        } catch (error) {
            console.warn(`Failed to load service module ${name}:`, error.message);
            return null;
        }
    }

    return serviceModules[name];
}

/**
 * Load utility module
 * @param {string} name - Module name
 * @returns {*} - Utility module
 */
function loadUtilModule(name) {
    if (!utilModules.hasOwnProperty(name)) {
        throw new Error(`Unknown util module: ${name}`);
    }

    if (!utilModules[name]) {
        const path = `./${name}`;
        try {
            const mod = require(path);
            utilModules[name] = mod.default || mod;
        } catch (error) {
            console.warn(`Failed to load util module ${name}:`, error.message);
            return null;
        }
    }

    return utilModules[name];
}

/**
 * Get all Discord modules as object
 * @returns {Object} - Discord modules
 */
function getDiscordModules() {
    return {
        Client: loadDiscordModule('Client'),
        REST: loadDiscordModule('REST'),
        Routes: loadDiscordModule('Routes'),
        SlashCommandBuilder: loadDiscordModule('SlashCommandBuilder'),
        EmbedBuilder: loadDiscordModule('EmbedBuilder'),
        PermissionsBitField: loadDiscordModule('PermissionsBitField'),
        ActivityType: loadDiscordModule('ActivityType'),
        MessageFlags: loadDiscordModule('MessageFlags')
    };
}

/**
 * Get all service modules as object
 * @returns {Object} - Service modules
 */
function getServiceModules() {
    return {
        logger: loadServiceModule('logger'),
        config: loadServiceModule('config'),
        backup: loadServiceModule('backup'),
        trolls: loadServiceModule('trolls')
    };
}

/**
 * Get all utility modules as object
 * @returns {Object} - Utility modules
 */
function getUtilModules() {
    return {
        helpers: loadUtilModule('helpers'),
        constants: loadUtilModule('constants'),
        validator: loadUtilModule('validator'),
        rateLimiter: loadUtilModule('rateLimiter'),
        auditLogger: loadUtilModule('auditLogger'),
        sanitizer: loadUtilModule('sanitizer'),
        tokenMasking: loadUtilModule('tokenMasking'),
        envValidator: loadUtilModule('envValidator'),
        envConfig: loadUtilModule('envConfig'),
        voiceTracker: loadUtilModule('voiceConnectionTracker'),
        healthCheck: loadUtilModule('healthCheck'),
        gracefulDegradation: loadUtilModule('gracefulDegradation'),
        metricsCollector: loadUtilModule('metricsCollector'),
        guildAwareCooldown: loadUtilModule('guildAwareCooldown'),
        errorBoundary: loadUtilModule('errorBoundary'),
        nullCheck: loadUtilModule('nullCheck')
    };
}

/**
 * Clear all cached modules
 * Useful for testing
 */
function clearCache() {
    Object.keys(discordModules).forEach(k => discordModules[k] = null);
    Object.keys(serviceModules).forEach(k => serviceModules[k] = null);
    Object.keys(utilModules).forEach(k => utilModules[k] = null);
}

/**
 * Get cache statistics
 * @returns {Object} - Cache info
 */
function getCacheStats() {
    const discordLoaded = Object.values(discordModules).filter(v => v).length;
    const servicesLoaded = Object.values(serviceModules).filter(v => v).length;
    const utilsLoaded = Object.values(utilModules).filter(v => v).length;

    return {
        discordModules: `${discordLoaded}/${Object.keys(discordModules).length}`,
        serviceModules: `${servicesLoaded}/${Object.keys(serviceModules).length}`,
        utilityModules: `${utilsLoaded}/${Object.keys(utilModules).length}`
    };
}

module.exports = {
    loadDiscordModule,
    loadServiceModule,
    loadUtilModule,
    getDiscordModules,
    getServiceModules,
    getUtilModules,
    clearCache,
    getCacheStats
};
