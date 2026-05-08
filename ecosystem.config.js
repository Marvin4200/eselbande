module.exports = {
    apps: [{
        name: 'musikbot',
        script: 'index.js',
        instances: 1,
        exec_mode: 'fork',
        autorestart: true,
        restart_delay: 5000,
        max_restarts: 10,
        watch: false,
        max_memory_restart: '500M',
        env: {
            NODE_ENV: 'production',
        }
    }]
};
