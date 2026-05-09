const colors = require('colors');
const moment = require('moment');

/**
 * Shared Logger Module
 * Provides consistent logging across all bots and infrastructure.
 */
class Logger {
  constructor(moduleName = 'System') {
    this.moduleName = moduleName;
  }

  get timestamp() {
    return moment().format('YYYY-MM-DD HH:mm:ss');
  }

  formatMessage(level, message) {
    const ts = `[${this.timestamp}]`.grey;
    const mod = `[${this.moduleName}]`.cyan;
    return `${ts} ${mod} ${level}: ${message}`;
  }

  info(message) {
    console.log(this.formatMessage('INFO'.green, message));
  }

  warn(message) {
    console.log(this.formatMessage('WARN'.yellow, message));
  }

  error(message, error) {
    let msg = this.formatMessage('ERROR'.red, message);
    if (error) {
      msg += `\n${error.stack || error}`;
    }
    console.error(msg);
  }

  debug(message) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(this.formatMessage('DEBUG'.magenta, message));
    }
  }
}

module.exports = (moduleName) => new Logger(moduleName);
