const { getGuildSettings } = require('./config');

/**
 * Returns true if the interaction user has DJ permissions.
 * Admins always pass. If no DJ role is configured, everyone passes.
 */
function hasDJPermission(interaction) {
    if (interaction.memberPermissions?.has('Administrator')) return true;

    const settings = getGuildSettings(interaction.guildId);
    if (!settings.djRoleId) return true;

    return interaction.member.roles.cache.has(settings.djRoleId);
}

module.exports = { hasDJPermission };
