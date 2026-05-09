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

/**
 * Returns an error string if the member cannot control playback in the current context.
 * Returns null when access is allowed.
 */
function getPlaybackControlError(interaction, { requireDj = true } = {}) {
    if (requireDj && !hasDJPermission(interaction)) {
        return '❌ You need the DJ role!';
    }

    const memberVoiceId = interaction.member?.voice?.channelId;
    if (!memberVoiceId) {
        return '❌ You need to be in a voice channel!';
    }

    const botVoiceId = interaction.guild?.members?.me?.voice?.channelId;
    if (botVoiceId && botVoiceId !== memberVoiceId) {
        return '❌ You must be in the same voice channel as the bot!';
    }

    return null;
}

module.exports = { hasDJPermission, getPlaybackControlError };
