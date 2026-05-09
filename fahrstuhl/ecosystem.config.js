const fs = require('fs');

function readEnvValue(filePath, key) {
    try {
        const env = fs.readFileSync(filePath, 'utf8');
        return env.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim() || '';
    } catch {
        return '';
    }
}

module.exports = {
    apps: [
        {
            name: 'fahrstuhl',
            script: 'index.js',
            cwd: '/home/marvin/fahrstuhl',
            restart_delay: 5000,
            max_restarts: 10,
            min_uptime: '10s',
            kill_timeout: 5000,
            exp_backoff_restart_delay: 100,
            watch: false,
            env: {
                NODE_ENV: 'production'
            },
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            error_file: '/home/marvin/fahrstuhl/logs/pm2-bot-error.log',
            out_file: '/home/marvin/fahrstuhl/logs/pm2-bot-out.log'
        },
        {
            name: 'dashboard-php',
            script: 'php',
            args: '-S 0.0.0.0:8081 -t /home/marvin/fahrstuhl/dashboard/public /home/marvin/fahrstuhl/dashboard/public/router.php',
            interpreter: 'none',
            restart_delay: 3000,
            max_restarts: 10,
            min_uptime: '10s',
            kill_timeout: 5000,
            exp_backoff_restart_delay: 100,
            watch: false,
            env: {
                BOT_API_TOKEN: process.env.BOT_API_TOKEN || readEnvValue('/home/marvin/fahrstuhl/.env', 'BOT_API_TOKEN')
            },
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            error_file: '/home/marvin/fahrstuhl/logs/pm2-php-error.log',
            out_file: '/home/marvin/fahrstuhl/logs/pm2-php-out.log'
        },
        {
            name: 'deploy-webhook',
            script: 'scripts/deploy-webhook.js',
            cwd: '/home/marvin/fahrstuhl',
            restart_delay: 3000,
            max_restarts: 10,
            min_uptime: '10s',
            kill_timeout: 5000,
            exp_backoff_restart_delay: 100,
            watch: false,
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            error_file: '/home/marvin/fahrstuhl/logs/pm2-deploy-error.log',
            out_file: '/home/marvin/fahrstuhl/logs/pm2-deploy-out.log'
        },
        {
            name: 'eseltokens-webhook',
            script: 'scripts/eseltokens-webhook.js',
            cwd: '/home/marvin/fahrstuhl',
            restart_delay: 3000,
            max_restarts: 10,
            min_uptime: '10s',
            kill_timeout: 5000,
            exp_backoff_restart_delay: 100,
            watch: false,
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            error_file: '/home/marvin/fahrstuhl/logs/pm2-eseltokens-webhook-error.log',
            out_file: '/home/marvin/fahrstuhl/logs/pm2-eseltokens-webhook-out.log'
        },
        {
            name: 'backup-worker',
            script: 'scripts/backup-worker.js',
            cwd: '/home/marvin/fahrstuhl',
            restart_delay: 3000,
            max_restarts: 10,
            min_uptime: '10s',
            kill_timeout: 5000,
            exp_backoff_restart_delay: 100,
            watch: false,
            env: {
                BACKUP_RUN_ON_START: "false",
                BACKUP_INTERVAL_MINUTES: '60',
                MARVIN_HOME: '/home/marvin',
                BACKUP_ROOT: '/home/marvin/backups'
            },
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            error_file: '/home/marvin/fahrstuhl/logs/pm2-backup-worker-error.log',
            out_file: '/home/marvin/fahrstuhl/logs/pm2-backup-worker-out.log'
        }
    ]
};
