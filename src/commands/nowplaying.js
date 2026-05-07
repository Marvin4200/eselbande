const { SlashCommandBuilder } = require('discord.js');
const { players } = require('../utils/playerManager');
const { formatDuration } = require('../utils/formatDuration');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Show info about the currently playing song'),

    async execute(interaction) {
        const state = players.get(interaction.guildId);
        if (!state || !state.current) {
            return interaction.reply({ embeds: [{ color: 0xFEE75C, description: '⚠️ Nothing is playing!' }], flags: [64] });
        }

        const t = state.current;
        const pos = state.player.position || 0;
        const len = t.info.length || 0;

        // Progress bar
        const BAR_LENGTH = 20;
        const filled = len > 0 ? Math.round((pos / len) * BAR_LENGTH) : 0;
        const bar = '▓'.repeat(filled) + '░'.repeat(BAR_LENGTH - filled);
        const posLabel = t.info.isStream ? 'LIVE 🔴' : `\`${formatDuration(pos)} / ${formatDuration(len)}\``;
        const thumbnail = t.info.artworkUrl
            || (t.info.identifier ? `https://img.youtube.com/vi/${t.info.identifier}/mqdefault.jpg` : null);

        return interaction.reply({
            embeds: [{
                color: 0x5865F2,
                title: '🎵 Now Playing',
                description: `**[${t.info.title}](${t.info.uri})**\n\n${bar}\n${posLabel}`,
                fields: [
                    { name: 'Artist', value: t.info.author || 'Unknown', inline: true },
                    { name: 'Volume', value: `${state.volume}%`, inline: true },
                    { name: 'Loop', value: state.loop, inline: true },
                    { name: 'Queue', value: `${state.queue.length} track(s)`, inline: true },
                    { name: '24/7', value: state.is247 ? '✅ On' : '❌ Off', inline: true },
                ],
                ...(thumbnail ? { thumbnail: { url: thumbnail } } : {}),
            }],
        });
    },
};
