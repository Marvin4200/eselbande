const { PermissionsBitField } = require("discord.js");
const { createEphemeralError } = require("./helpers");

class Validator {
    static validateRole(role, interaction) {
        if (!role) {
            return {
                ok: false,
                error: createEphemeralError("❌ Invalid Role", "The specified role could not be found.")
            };
        }

        if (role.id === interaction.guild.id) {
            return {
                ok: false,
                error: createEphemeralError("❌ Cannot Use @everyone", "The @everyone role cannot be used for this command.")
            };
        }

        if (!interaction.guild.me) {
            return {
                ok: false,
                error: createEphemeralError("❌ Bot Not In Guild", "The bot is not properly initialized in this guild.")
            };
        }

        const botHighestRole = interaction.guild.me.roles.highest;
        if (botHighestRole.comparePositionTo(role) <= 0) {
            return {
                ok: false,
                error: createEphemeralError(
                    "❌ Role Hierarchy Issue",
                    `The bot cannot manage <@&${role.id}> because it's at or above the bot's highest role.`
                )
            };
        }

        return { ok: true };
    }

    static validateMember(member) {
        if (!member) {
            return {
                ok: false,
                error: createEphemeralError("❌ User Not Found", "The specified user could not be found or fetched.")
            };
        }

        return { ok: true };
    }

    static validateMemberInVoice(member) {
        if (!member.voice || !member.voice.channel) {
            return {
                ok: false,
                error: createEphemeralError("❌ Not In Voice", "The user must be in a voice channel to use this command.")
            };
        }

        return { ok: true };
    }

    static validateBotCanManageUser(botMember, targetMember, requiredPermission, requireVoice = false, channel = null) {
        // Check role hierarchy
        if (botMember.roles.highest.comparePositionTo(targetMember.roles.highest) <= 0) {
            return {
                ok: false,
                error: createEphemeralError(
                    "❌ Insufficient Permissions",
                    "The bot's role is not high enough to manage this user."
                )
            };
        }

        // Check general permission
        if (!botMember.permissions.has(requiredPermission)) {
            return {
                ok: false,
                error: createEphemeralError(
                    "❌ Missing Permission",
                    `The bot lacks the required permission: \`${this._permissionName(requiredPermission)}\``
                )
            };
        }

        // Check channel-specific permission if needed
        if (requireVoice && channel) {
            const channelPermission = botMember.permissionsIn(channel);
            if (!channelPermission.has(requiredPermission)) {
                return {
                    ok: false,
                    error: createEphemeralError(
                        "❌ Missing Channel Permission",
                        `The bot lacks the required permission in #${channel.name}`
                    )
                };
            }
        }

        return { ok: true };
    }

    static validateUser(user) {
        if (!user) {
            return {
                ok: false,
                error: createEphemeralError("❌ User Not Found", "The specified user could not be found.")
            };
        }

        return { ok: true };
    }

    static _permissionName(flag) {
        const permissions = {
            [PermissionsBitField.Flags.MoveMembers]: "Move Members",
            [PermissionsBitField.Flags.MuteMembers]: "Mute Members",
            [PermissionsBitField.Flags.DeafenMembers]: "Deafen Members",
            [PermissionsBitField.Flags.ManageNicknames]: "Manage Nicknames"
        };
        return permissions[flag] || "Unknown Permission";
    }
}

module.exports = Validator;
