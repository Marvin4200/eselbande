const { SlashCommandBuilder } = require('discord.js');
const { players, applyPlayerVolume } = require('../utils/playerManager');
const { getPlaybackControlError } = require('../utils/djCheck');
const { setGuildSettings } = require('../utils/config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Set the playback volume')
        .addIntegerOption(opt =>
            opt.setName('level')
                .setDescription('Volume level (0–150)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(150)
        ),

    async execute(interaction) {
        const state = players.get(interaction.guildId);
        if (!state || !state.current) {
            return interaction.reply({ embeds: [{ color: 0xFEE75C, description: '⚠️ Nothing is playing!' }], flags: [64] });
        }

        const accessError = getPlaybackControlError(interaction, { requireDj: true });
        if (accessError) {
            return interaction.reply({ embeds: [{ color: 0xED4245, description: accessError }], flags: [64] });
        }

        const level = interaction.options.getInteger('level');
        await applyPlayerVolume(state.player, level);
        state.volume = level;
        setGuildSettings(interaction.guildId, { volume: level });

        const emoji = level === 0 ? '🔇' : level < 50 ? '🔈' : level < 100 ? '🔉' : '🔊';
        return interaction.reply({ embeds: [{ color: 0x5865F2, description: `${emoji} Volume set to **${level}%**` }] });
    },
};
