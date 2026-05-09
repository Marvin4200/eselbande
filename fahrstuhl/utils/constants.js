// Troll Command Timings (in milliseconds)
const TIMINGS = {
    AUTOMOVE_INTERVAL: Number(process.env.TROLL_AUTOMOVE_INTERVAL || 2500),
    FORCED_DURATION: Number(process.env.TROLL_FORCED_DURATION || 30000),
    GHOST_VISIT_MIN: Number(process.env.TROLL_GHOST_VISIT_MIN || 600000),
    GHOST_VISIT_MAX: Number(process.env.TROLL_GHOST_VISIT_MAX || 1200000),
    SILENT_POST_INTERVAL: Number(process.env.TROLL_SILENT_POST_INTERVAL || 10000),
    SILENT_POST_DURATION: Number(process.env.TROLL_SILENT_POST_DURATION || 1000),
    DEAF_INTERVAL: Number(process.env.TROLL_DEAF_INTERVAL || 10000),
    DEAF_DURATION: Number(process.env.TROLL_DEAF_DURATION || 1000),
    STATS_UPDATE_INTERVAL: Number(process.env.BOT_STATS_UPDATE_INTERVAL || 600000),
    GLOBAL_STATS_FLUSH: Number(process.env.BOT_GLOBAL_STATS_FLUSH || 10000),
    COMMAND_COOLDOWN: Number(process.env.BOT_COMMAND_COOLDOWN || 500),
    PRESENCE_UPDATE_INTERVAL: Number(process.env.BOT_PRESENCE_UPDATE_INTERVAL || 300000)
};

// Discord-specific values
const DISCORD = {
    VOICE_CHANNEL_VISIT_DURATION: 5000,
    VOICE_CONNECTION_CLEANUP_DELAY: 2000,
    CHANNEL_CREATION_DELAY: 1000,
    API_RETRY_MAX_ATTEMPTS: 3,
    API_RETRY_BASE_DELAY: 1000
};

// Numeric constraints
const LIMITS = {
    GUILD_ID_MAX_LENGTH: 32,
    USER_ID_MAX_LENGTH: 32,
    RANDOM_TROLLS_MIN: 2,
    RANDOM_TROLLS_MAX: 3
};

// Color codes for embeds
const COLORS = {
    SUCCESS: 0x57F287,
    ERROR: 0xED4245,
    INFO: 0x5865F2,
    WARNING: 0xFEE75C,
    PRIMARY: 0x0099FF,
    SECONDARY: 0x2B2D31,
    SPECIAL: 0xFF73FA
};

// Status strings
const STATUS = {
    OK: 'ok',
    ERROR: 'error',
    BLOCKED: 'blocked',
    PENDING: 'pending'
};

module.exports = {
    TIMINGS,
    DISCORD,
    LIMITS,
    COLORS,
    STATUS
};
