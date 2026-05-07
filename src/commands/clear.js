const { SlashCommandBuilder } = require('discord.js');
const { players } = require('../utils/playerManager');
const { hasDJPermission } = require('../utils/djCheck');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Clear all tracks from the queue (keeps current song playing)'),

    async execute(interaction) {
        if (!hasDJPermission(interaction)) {
            return interaction.reply({ embeds: [{ color: 0xED4245, description: '❌ You need the DJ role!' }], flags: [64] });
        }

        const state = players.get(interaction.guildId);
        if (!state || state.queue.length === 0) {
            return interaction.reply({ embeds: [{ color: 0xFEE75C, description: '⚠️ The queue is already empty!' }], flags: [64] });
        }

        const count = state.queue.length;
        state.queue = [];

        return interaction.reply({
            embeds: [{ color: 0x5865F2, description: `🗑️ Cleared **${count}** track(s) from the queue.` }],
        });
    },
};
