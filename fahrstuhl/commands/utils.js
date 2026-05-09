// Command-specific utilities and helpers
const { EmbedBuilder, MessageFlags } = require("discord.js");
const {
    createEphemeralError,
    createEphemeralSuccess,
    createEphemeralWarning,
    createAlreadyActiveEmbed,
    createTrollActionEmbed,
    createMissingTrollRoleEmbed,
    createTrollRoleNotSetEmbed,
    createShieldActiveEmbed,
    createEphemeralReply
} = require("../utils/helpers");
const { COLORS, TIMINGS } = require("../utils/constants");
const Validator = require("../utils/validator");

function buildCommandChecks(getGuildConfig, getTrollKey, activeMoves, activeGhosts, activeSilentPost, activeMirror, activeDeafTroll) {
    const checkTrollRole = (interaction) => {
        const config = getGuildConfig(interaction.guild.id);
        const trollRoleId = config.trollRoleId;

        if (!trollRoleId) {
            return { ok: false, embed: createTrollRoleNotSetEmbed() };
        }

        if (!interaction.member.roles.cache.has(trollRoleId)) {
            return { ok: false, embed: createMissingTrollRoleEmbed(trollRoleId) };
        }

        return { ok: true, config };
    };

    const runTrollPrecheck = (interaction, freshMember, { requireVoice = false } = {}) => {
        const roleCheck = checkTrollRole(interaction);
        if (!roleCheck.ok) {
            return { ok: false, embed: roleCheck.embed };
        }

        const memberCheck = Validator.validateMember(freshMember);
        if (!memberCheck.ok) {
            return { ok: false, error: memberCheck.error };
        }

        if (requireVoice) {
            const voiceCheck = Validator.validateMemberInVoice(freshMember);
            if (!voiceCheck.ok) {
                return { ok: false, error: voiceCheck.error };
            }
        }

        const config = roleCheck.config;
        const { getUserStats, isUserImmune } = require("../utils/index");
        const userStats = getUserStats(freshMember.id);
        const immunity = isUserImmune(freshMember, config, userStats);

        if (immunity.immune) {
            return { ok: false, embed: createShieldActiveEmbed(freshMember, immunity) };
        }

        return { ok: true };
    };

    return {
        checkTrollRole,
        runTrollPrecheck
    };
}

function createTrollEmbed(action, started, member, description = null) {
    const colors = {
        'Ghost': { on: COLORS.SUCCESS, off: COLORS.ERROR },
        'Silent Post': { on: COLORS.SUCCESS, off: COLORS.ERROR },
        'Mirror': { on: COLORS.SUCCESS, off: COLORS.ERROR },
        'Dead Line': { on: COLORS.SUCCESS, off: COLORS.ERROR }
    };

    const colorMap = colors[action] || { on: COLORS.SUCCESS, off: COLORS.ERROR };
    const emoji = {
        'Ghost': '👻',
        'Silent Post': '🔇',
        'Mirror': '🪞',
        'Dead Line': '📞'
    };

    const title = `${emoji[action] || '❓'} ${action} ${started ? 'activated' : 'deactivated'}`;
    const desc = description || (started 
        ? `The ${action} has been activated for **${member.user.tag}**.` 
        : `The ${action} for **${member.user.tag}** has ended.`);

    return createTrollActionEmbed(title, desc, started ? colorMap.on : colorMap.off, member.user.displayAvatarURL());
}

function isAlreadyActive(trollKey, activeMap) {
    return activeMap && activeMap.has(trollKey);
}

module.exports = {
    buildCommandChecks,
    createTrollEmbed,
    isAlreadyActive
};
