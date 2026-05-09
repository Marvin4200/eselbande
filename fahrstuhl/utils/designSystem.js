/**
 * Design System & Constants for Fahrstuhl Bot
 * Ensures consistent styling across all commands
 */

const COLORS = {
    SUCCESS: 0x57F287,      // Green
    ERROR: 0xED4245,        // Red
    INFO: 0x5865F2,         // Blue
    WARNING: 0xFEE75C,      // Yellow
    ACTIVE: 0x00FFFF,       // Cyan (shields)
    TROLL: 0xED4245,        // Red (danger)
    NEUTRAL: 0x36393F       // Dark gray
};

const EMOJIS = {
    SUCCESS: '✅',
    ERROR: '❌',
    WARNING: '⚠️',
    INFO: 'ℹ️',
    LOADING: '⏳',
    ACTIVE: '🟢',
    INACTIVE: '🔴',
    SHIELD: '🛡️',
    TROLL: '😈',
    ELEVATOR: '🚀',
    GHOST: '👻',
    MIRROR: '🪞',
    MUTE: '🔇',
    DEAFEN: '📞',
    CONFIG: '⚙️'
};

const FOOTERS = {
    TROLL: 'Enjoy the chaos! 😈',
    SHIELD: 'Get shields on Unique Bots!',
    CONFIG: 'Admin-only action',
    HELP: 'Need more info? Join discord.gg/zfzDHKcWDx'
};

/**
 * Helper: Create a loading embed while operation is in progress
 */
function createLoadingEmbed(title = 'Processing...', description = 'Your request is being processed...') {
    const { EmbedBuilder } = require('discord.js');
    return new EmbedBuilder()
        .setColor(COLORS.INFO)
        .setTitle(`${EMOJIS.LOADING} ${title}`)
        .setDescription(description)
        .setFooter({ text: 'This message will update shortly...' });
}

/**
 * Helper: Defer an interaction (show loading) and return update function
 * Usage:
 *   const update = await deferWithLoading(interaction, 'Processing...');
 *   // do async work...
 *   await update({ embeds: [resultEmbed] });
 */
async function deferWithLoading(interaction, title = 'Processing...', description = 'Your request is being processed...') {
    const loadingEmbed = createLoadingEmbed(title, description);
    
    try {
        await interaction.deferReply({ flags: [require('discord.js').MessageFlags.Ephemeral] });
    } catch (e) {
        console.warn('Could not defer reply:', e.message);
    }
    
    return async (finalContent) => {
        try {
            await interaction.editReply(finalContent);
        } catch (e) {
            console.error('Could not update deferred reply:', e);
            throw e;
        }
    };
}

module.exports = { COLORS, EMOJIS, FOOTERS, createLoadingEmbed, deferWithLoading };
