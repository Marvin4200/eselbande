const logger = require('./logger')('AntiCrash');

/**
 * Shared Anti-Crash Module
 * Prevents the process from exiting on unhandled errors and logs them properly.
 * @param {import('discord.js').Client} client
 */
module.exports = (client) => {
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection/Catch at:', promise);
    logger.error('Reason:', reason);
  });

  process.on('uncaughtException', (err, origin) => {
    logger.error('Uncaught Exception/Catch at:', origin);
    logger.error('Error:', err);
  });

  process.on('uncaughtExceptionMonitor', (err, origin) => {
    logger.warn('Uncaught Exception Monitor at:', origin);
    logger.warn('Error:', err);
  });

  process.on('warning', (warning) => {
    logger.warn('Process Warning:');
    console.warn(warning);
  });

  // Handle termination signals for clean exit
  const signals = ['SIGINT', 'SIGTERM', 'SIGUSR1', 'SIGUSR2'];
  signals.forEach(sig => {
    process.on(sig, () => {
      logger.info(`Received ${sig}, shutting down bot...`);
      if (client && client.destroy) client.destroy();
      process.exit(0);
    });
  });

  logger.info('Zentrales Anti-Crash System wurde erfolgreich geladen.'.green);
};
