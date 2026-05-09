const path = require('path');
const fs = require('fs');

/**
 * Initiiert den gemeinsamen Presence-Manager für Bots.
 * @param {import('discord.js').Client} client
 * @param {Object} options
 * @param {string[]} [options.messages] - Liste von Status-Nachrichten
 * @param {number} [options.interval] - Intervall in ms
 */
module.exports = function initSharedPresence(client, options = {}) {
  const messages = (() => {
    if (Array.isArray(options.messages) && options.messages.length) return options.messages;
    try {
      // presence.json im src-Ordner
      const cfg = require(path.join(__dirname, 'presence.json'));
      if (Array.isArray(cfg.messages) && cfg.messages.length) return cfg.messages;
      if (Array.isArray(cfg.activities) && cfg.activities.length) return cfg.activities.map(a => a.name || String(a));
      if (typeof cfg.status === 'string') return [cfg.status];
    } catch (e) {
      // ignore
    }
    return ['Bot online'];
  })();

  const interval = typeof options.interval === 'number' ? options.interval : 10 * 60 * 1000;

  function update() {
    try {
      const idx = Math.floor(Math.random() * messages.length);
      const text = messages[idx] || 'Bot online';
      client.user.setPresence({ activities: [{ name: text }] });
    } catch (e) {
      // in case client.user is not ready yet
    }
  }

  // sofort ausführen und dann in Intervallen
  update();
  setInterval(update, interval);
};
