const { SlashCommandBuilder } = require('discord.js');
const { players } = require('../utils/playerManager');
const { hasDJPermission } = require('../utils/djCheck');

const LOOP_ICONS = { none: '➡️', track: '🔂', queue: '🔁' };
const LOOP_LABELS = { none: 'Off', track: 'Track', queue: 'Queue' };

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Set the loop mode')
        .addStringOption(opt =>
            opt.setName('mode')
                .setDescription('Loop mode')
                .setRequired(true)
                .addChoices(
                    { name: 'Off', value: 'none' },
                    { name: 'Track (repeat current song)', value: 'track' },
                    { name: 'Queue (repeat entire queue)', value: 'queue' },
                )
        ),

    async execute(interaction) {
        if (!hasDJPermission(interaction)) {
            return interaction.reply({ embeds: [{ color: 0xED4245, description: '❌ You need the DJ role!' }], flags: [64] });
        }

        const state = players.get(interaction.guildId);
        if (!state) {
            return interaction.reply({ embeds: [{ color: 0xFEE75C, description: '⚠️ Nothing is playing!' }], flags: [64] });
        }

        const mode = interaction.options.getString('mode');
        state.loop = mode;

        return interaction.reply({
            embeds: [{ color: 0x5865F2, description: `${LOOP_ICONS[mode]} Loop set to **${LOOP_LABELS[mode]}**` }],
        });
    },
};
