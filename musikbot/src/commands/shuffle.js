const { SlashCommandBuilder } = require('discord.js');
const { players } = require('../utils/playerManager');
const { hasDJPermission } = require('../utils/djCheck');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shuffle')
        .setDescription('Shuffle the queue'),

    async execute(interaction) {
        if (!hasDJPermission(interaction)) {
            return interaction.reply({ embeds: [{ color: 0xED4245, description: '❌ You need the DJ role!' }], flags: [64] });
        }

        const state = players.get(interaction.guildId);
        if (!state || state.queue.length < 2) {
            return interaction.reply({ embeds: [{ color: 0xFEE75C, description: '⚠️ Need at least 2 tracks in the queue to shuffle!' }], flags: [64] });
        }

        // Fisher-Yates shuffle
        for (let i = state.queue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [state.queue[i], state.queue[j]] = [state.queue[j], state.queue[i]];
        }

        return interaction.reply({
            embeds: [{ color: 0x5865F2, description: `🔀 Shuffled **${state.queue.length}** tracks!` }],
        });
    },
};
