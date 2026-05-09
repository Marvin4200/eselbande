const { SlashCommandBuilder } = require('discord.js');
const { players } = require('../utils/playerManager');
const { hasDJPermission } = require('../utils/djCheck');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pause or resume the current song'),

    async execute(interaction) {
        if (!hasDJPermission(interaction)) {
            return interaction.reply({ embeds: [{ color: 0xED4245, description: '❌ You need the DJ role!' }], flags: [64] });
        }

        const state = players.get(interaction.guildId);
        if (!state || !state.current) {
            return interaction.reply({ embeds: [{ color: 0xFEE75C, description: '⚠️ Nothing is playing!' }], flags: [64] });
        }

        const isPaused = state.player.paused;
        await state.player.setPaused(!isPaused);

        return interaction.reply({
            embeds: [{ color: 0x5865F2, description: isPaused ? '▶️ Resumed!' : '⏸️ Paused!' }],
        });
    },
};
