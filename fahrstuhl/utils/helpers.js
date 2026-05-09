const { EmbedBuilder, MessageFlags } = require("discord.js");
const { COLORS } = require("./constants");

// Create consistent ephemeral reply format
function createEphemeralReply(embeds = [], content = null) {
    const options = { flags: MessageFlags.Ephemeral };
    if (Array.isArray(embeds) && embeds.length > 0) {
        options.embeds = embeds;
    }
    if (content) {
        options.content = content;
    }
    return options;
}

// Create error embed
function createErrorEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(COLORS.ERROR)
        .setTitle(title)
        .setDescription(description);
}

// Create success embed
function createSuccessEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(COLORS.SUCCESS)
        .setTitle(title)
        .setDescription(description);
}

// Create info embed
function createInfoEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(COLORS.INFO)
        .setTitle(title)
        .setDescription(description);
}

// Create warning embed
function createWarningEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setTitle(title)
        .setDescription(description);
}

// Create user not found embed
function createUserNotFoundEmbed() {
    return createErrorEmbed("❌ User Not Found", "The specified user could not be found or fetched.");
}

// Create no voice channel embed
function createNoVoiceEmbed() {
    return createErrorEmbed("❌ No Voice Channel", "The user is not currently in a voice channel.");
}

// Create troll role not set embed
function createTrollRoleNotSetEmbed() {
    return createErrorEmbed("❌ Troll Role Missing", "No troll role is set yet.\nPlease use `/settrollrole` (admin-only) to set a role.");
}

// Create missing troll role embed
function createMissingTrollRoleEmbed(roleId) {
    return createErrorEmbed("❌ Missing Role", `You need the role <@&${roleId}> to use troll commands!`);
}

// Create shield active embed
function createShieldActiveEmbed(member, immunity) {
    return new EmbedBuilder()
        .setColor(0x00FFFF)
        .setTitle("🛡️ Shield Active!")
        .setDescription(`${member.user.tag} is protected by a shield!\nExpires: <t:${Math.floor(immunity.expiry / 1000)}:R>`)
        .setFooter({ text: "Get your own shield on Unique Bots! /claim" });
}

// Create already active embed
function createAlreadyActiveEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setTitle(title)
        .setDescription(description);
}

// Create ephemeral reply with error
function createEphemeralError(title, description) {
    return createEphemeralReply([createErrorEmbed(title, description)]);
}

// Create ephemeral reply with success
function createEphemeralSuccess(title, description) {
    return createEphemeralReply([createSuccessEmbed(title, description)]);
}

// Create ephemeral reply with warning
function createEphemeralWarning(title, description) {
    return createEphemeralReply([createWarningEmbed(title, description)]);
}

// Create troll action embed
function createTrollActionEmbed(title, description, color = COLORS.WARNING, thumbnail = null) {
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description);
    if (thumbnail) {
        embed.setThumbnail(thumbnail);
    }
    return embed;
}

module.exports = {
    createEphemeralReply,
    createErrorEmbed,
    createSuccessEmbed,
    createInfoEmbed,
    createWarningEmbed,
    createUserNotFoundEmbed,
    createNoVoiceEmbed,
    createTrollRoleNotSetEmbed,
    createMissingTrollRoleEmbed,
    createShieldActiveEmbed,
    createAlreadyActiveEmbed,
    createEphemeralError,
    createEphemeralSuccess,
    createEphemeralWarning,
    createTrollActionEmbed
};
