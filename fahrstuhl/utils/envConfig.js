// Environment-specific configuration for development vs production

const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const config = {
    // Environment detection
    env: {
        isDevelopment,
        isProduction,
        isTest,
        NODE_ENV: process.env.NODE_ENV || 'production'
    },

    // Logging configuration
    logging: {
        level: isDevelopment ? 'debug' : 'info',
        // Log to console in development, to file in production
        targets: isDevelopment ? ['console'] : ['console', 'file'],
        // More verbose in development
        verbose: isDevelopment,
        // Mask sensitive data in production
        maskSensitive: !isDevelopment,
        // Include stack traces only in development
        stackTraces: isDevelopment
    },

    // Database configuration
    database: {
        // Retry more aggressively in production
        retries: isProduction ? 5 : 3,
        retryDelay: isProduction ? 5000 : 1000,
        // Longer timeouts in production
        timeout: isProduction ? 30000 : 10000,
        // Pool size depends on environment
        pool: {
            min: isProduction ? 5 : 1,
            max: isProduction ? 20 : 5
        },
        // Validate connections in production
        validateConnection: isProduction
    },

    // Bot configuration
    bot: {
        // Faster updates in development
        presenceUpdateInterval: isDevelopment ? 60000 : parseInt(process.env.BOT_PRESENCE_UPDATE_INTERVAL),
        statsUpdateInterval: isDevelopment ? 60000 : parseInt(process.env.BOT_STATS_UPDATE_INTERVAL),
        // Stricter rate limiting in production
        rateLimitStrict: isProduction,
        // Auto-reload commands in development
        autoReloadCommands: isDevelopment,
        // Detailed error responses in development
        detailedErrors: isDevelopment,
        // Only use one shard in development
        shardCount: isDevelopment ? 1 : 'auto'
    },

    // Cache configuration
    cache: {
        // Shorter TTL in development for faster testing
        defaultTTL: isDevelopment ? 30000 : 300000,
        // Cache all stats in production
        cacheStats: isProduction,
        // Validate cache in development
        validateCache: isDevelopment
    },

    // Feature flags
    features: {
        // Enable all experimental features in development
        experimental: isDevelopment,
        // Use mock data in test mode
        useMocks: isTest,
        // Enhanced security in production
        enhancedSecurity: isProduction,
        // Enable analytics in production
        analytics: isProduction,
        // Enable backup in production
        autoBackup: isProduction
    },

    // Backup configuration
    backup: {
        enabled: process.env.MYSQL_BACKUP_ENABLED === 'true',
        interval: parseInt(process.env.MYSQL_BACKUP_INTERVAL_HOURS) * 60 * 60 * 1000,
        maxFiles: parseInt(process.env.MYSQL_BACKUP_MAX_FILES),
        dir: process.env.MYSQL_BACKUP_DIR || 'backups',
        runOnStart: process.env.MYSQL_BACKUP_RUN_ON_START === 'true',
        mysqldumpPath: process.env.MYSQLDUMP_PATH || '/usr/bin/mysqldump'
    },

    // Guild configuration
    guild: {
        // Dev guild ID for testing (if available)
        devGuildId: process.env.DEV_GUILD_ID || null,
        // Owner ID
        ownerId: process.env.OWNER_ID
    }
};

function getConfig(key) {
    const keys = key.split('.');
    let value = config;
    for (const k of keys) {
        value = value[k];
        if (value === undefined) return null;
    }
    return value;
}

function setConfig(key, value) {
    const keys = key.split('.');
    let obj = config;
    for (let i = 0; i < keys.length - 1; i++) {
        if (!obj[keys[i]]) obj[keys[i]] = {};
        obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
}

module.exports = {
    config,
    getConfig,
    setConfig,
    isDevelopment,
    isProduction,
    isTest
};
