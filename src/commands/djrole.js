const { SlashCommandBuilder } = require('discord.js');
const { getGuildSettings, setGuildSettings } = require('../utils/config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('djrole')
        .setDescription('Manage the DJ role')
        .addSubcommand(sub =>
            sub.setName('set')
                .setDescription('Set the DJ role — only this role can control music playback')
                .addRoleOption(opt =>
                    opt.setName('role').setDescription('The role to assign as DJ').setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove the DJ role — everyone can control music')
        )
        .addSubcommand(sub =>
            sub.setName('info')
                .setDescription('Show the current DJ role')
        ),

    async execute(interaction) {
        if (!interaction.memberPermissions?.has('Administrator')) {
            return interaction.reply({ embeds: [{ color: 0xED4245, description: '❌ Only admins can manage the DJ role!' }], flags: [64] });
        }

        const sub = interaction.options.getSubcommand();
        const settings = getGuildSettings(interaction.guildId);

        if (sub === 'set') {
            const role = interaction.options.getRole('role');
            setGuildSettings(interaction.guildId, { djRoleId: role.id });
            return interaction.reply({
                embeds: [{ color: 0x5865F2, description: `✅ DJ role set to <@&${role.id}>\n\nOnly members with this role (and Admins) can use skip, stop, volume, loop and shuffle.` }],
            });
        }

        if (sub === 'remove') {
            setGuildSettings(interaction.guildId, { djRoleId: null });
            return interaction.reply({
                embeds: [{ color: 0x5865F2, description: '✅ DJ role removed — everyone can control music now.' }],
            });
        }

        if (sub === 'info') {
            return interaction.reply({
                embeds: [{
                    color: 0x5865F2,
                    description: settings.djRoleId
                        ? `🎧 DJ Role: <@&${settings.djRoleId}>`
                        : '🎧 No DJ role set — everyone can control music.',
                }],
                flags: [64],
            });
        }
    },
};
