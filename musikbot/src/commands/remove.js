const { SlashCommandBuilder } = require('discord.js');
const { players } = require('../utils/playerManager');
const { hasDJPermission } = require('../utils/djCheck');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Remove a specific track from the queue')
        .addIntegerOption(opt =>
            opt.setName('position')
                .setDescription('Position in the queue (see /queue for positions)')
                .setRequired(true)
                .setMinValue(1)
        ),

    async execute(interaction) {
        if (!hasDJPermission(interaction)) {
            return interaction.reply({ embeds: [{ color: 0xED4245, description: '❌ You need the DJ role!' }], flags: [64] });
        }

        const state = players.get(interaction.guildId);
        if (!state || state.queue.length === 0) {
            return interaction.reply({ embeds: [{ color: 0xFEE75C, description: '⚠️ The queue is empty!' }], flags: [64] });
        }

        const pos = interaction.options.getInteger('position');
        if (pos > state.queue.length) {
            return interaction.reply({
                embeds: [{ color: 0xFEE75C, description: `⚠️ Position **${pos}** doesn't exist — queue only has **${state.queue.length}** track(s).` }],
                flags: [64],
            });
        }

        const [removed] = state.queue.splice(pos - 1, 1);

        return interaction.reply({
            embeds: [{ color: 0x5865F2, description: `🗑️ Removed **${removed.info.title}** from position #${pos}` }],
        });
    },
};
