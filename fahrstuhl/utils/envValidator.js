// Validate required environment variables on bot startup
const REQUIRED_VARS = [
    'TOKEN',
    'OWNER_ID',
    'MYSQL_HOST',
    'MYSQL_PORT',
    'MYSQL_DATABASE',
    'MYSQL_USER',
    'MYSQL_PASSWORD'
];

const OPTIONAL_VARS = {
    'NODE_ENV': 'production',
    'TROLL_AUTOMOVE_INTERVAL': '2500',
    'TROLL_FORCED_DURATION': '30000',
    'TROLL_GHOST_VISIT_MIN': '600000',
    'TROLL_GHOST_VISIT_MAX': '1200000',
    'TROLL_SILENT_POST_INTERVAL': '10000',
    'TROLL_SILENT_POST_DURATION': '1000',
    'TROLL_DEAF_INTERVAL': '10000',
    'TROLL_DEAF_DURATION': '1000',
    'BOT_STATS_UPDATE_INTERVAL': '600000',
    'BOT_GLOBAL_STATS_FLUSH': '10000',
    'BOT_COMMAND_COOLDOWN': '500',
    'BOT_PRESENCE_UPDATE_INTERVAL': '300000',
    'MYSQL_BACKUP_ENABLED': 'true',
    'MYSQL_BACKUP_INTERVAL_HOURS': '24',
    'MYSQL_BACKUP_MAX_FILES': '14',
    'MYSQL_BACKUP_DIR': 'backups',
    'MYSQL_BACKUP_RUN_ON_START': 'false',
    'MYSQLDUMP_PATH': '/usr/bin/mysqldump',
    'LOG_DIR': 'logs'
};

function validateEnv() {
    const missing = [];
    const invalid = [];

    // Check required variables
    for (const varName of REQUIRED_VARS) {
        if (!process.env[varName]) {
            missing.push(varName);
        }
    }

    // Check for invalid values
    if (process.env.OWNER_ID && !/^\d+$/.test(process.env.OWNER_ID)) {
        invalid.push('OWNER_ID must be a numeric Discord ID');
    }

    if (process.env.MYSQL_PORT && !/^\d+$/.test(process.env.MYSQL_PORT)) {
        invalid.push('MYSQL_PORT must be a number');
    }

    // Validate numeric environment variables
    const numericVars = [
        'TROLL_AUTOMOVE_INTERVAL',
        'TROLL_FORCED_DURATION',
        'TROLL_GHOST_VISIT_MIN',
        'TROLL_GHOST_VISIT_MAX',
        'TROLL_SILENT_POST_INTERVAL',
        'TROLL_SILENT_POST_DURATION',
        'TROLL_DEAF_INTERVAL',
        'TROLL_DEAF_DURATION',
        'BOT_STATS_UPDATE_INTERVAL',
        'BOT_GLOBAL_STATS_FLUSH',
        'BOT_COMMAND_COOLDOWN',
        'BOT_PRESENCE_UPDATE_INTERVAL',
        'MYSQL_BACKUP_INTERVAL_HOURS'
    ];

    for (const varName of numericVars) {
        const value = process.env[varName] || OPTIONAL_VARS[varName];
        if (!/^\d+$/.test(value)) {
            invalid.push(`${varName} must be numeric, got: ${value}`);
        }
    }

    // Report errors
    if (missing.length > 0) {
        console.error('\n❌ Missing required environment variables:');
        missing.forEach(v => console.error(`   - ${v}`));
    }

    if (invalid.length > 0) {
        console.error('\n❌ Invalid environment variable values:');
        invalid.forEach(msg => console.error(`   - ${msg}`));
    }

    if (missing.length > 0 || invalid.length > 0) {
        console.error('\n📋 Please check your .env file or set the missing variables.\n');
        process.exit(1);
    }

    // Set defaults for optional variables
    for (const [varName, defaultValue] of Object.entries(OPTIONAL_VARS)) {
        if (!process.env[varName]) {
            process.env[varName] = defaultValue;
        }
    }

    console.log('✅ Environment validation passed');
}

module.exports = { validateEnv };
