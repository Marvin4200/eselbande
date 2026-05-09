const { SlashCommandBuilder } = require('discord.js');
const { players, destroyPlayer } = require('../utils/playerManager');
const { hasDJPermission } = require('../utils/djCheck');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop music, clear the queue and leave the voice channel'),

    async execute(interaction, { shoukaku }) {
        if (!hasDJPermission(interaction)) {
            return interaction.reply({ embeds: [{ color: 0xED4245, description: '❌ You need the DJ role!' }], flags: [64] });
        }

        const state = players.get(interaction.guildId);
        if (!state) {
            return interaction.reply({ embeds: [{ color: 0xFEE75C, description: '⚠️ Nothing is playing!' }], flags: [64] });
        }

        // Clear queue before destroying so the 'end' event doesn't play next
        state.queue = [];
        state.current = null;
        state.loop = 'none';

        destroyPlayer(interaction.guildId, shoukaku);

        return interaction.reply({ embeds: [{ color: 0x5865F2, description: '⏹️ Stopped and cleared the queue.' }] });
    },
};
