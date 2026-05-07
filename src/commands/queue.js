const { SlashCommandBuilder } = require('discord.js');
const { players } = require('../utils/playerManager');
const { formatDuration } = require('../utils/formatDuration');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show the current queue')
        .addIntegerOption(opt =>
            opt.setName('page')
                .setDescription('Page number')
                .setMinValue(1)
        ),

    async execute(interaction) {
        const state = players.get(interaction.guildId);
        if (!state || (!state.current && state.queue.length === 0)) {
            return interaction.reply({ embeds: [{ color: 0xFEE75C, description: '⚠️ The queue is empty!' }], flags: [64] });
        }

        const page = interaction.options.getInteger('page') || 1;
        const pageSize = 10;
        const total = state.queue.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const safePage = Math.min(page, totalPages);
        const start = (safePage - 1) * pageSize;
        const tracks = state.queue.slice(start, start + pageSize);

        const queueLines = tracks.map((t, i) => {
            const pos = start + i + 1;
            const dur = t.info.isStream ? 'LIVE' : formatDuration(t.info.length);
            return `\`${pos}.\` **[${t.info.title}](${t.info.uri})** \`${dur}\``;
        });

        const nowPlaying = state.current
            ? `**▶️ Now:** [${state.current.info.title}](${state.current.info.uri})\n\n`
            : '';

        return interaction.reply({
            embeds: [{
                color: 0x5865F2,
                title: '🎶 Queue',
                description: nowPlaying + (queueLines.join('\n') || '*No more tracks queued*'),
                footer: {
                    text: `Page ${safePage}/${totalPages} · ${total} track(s) · Loop: ${state.loop} · Volume: ${state.volume}%`,
                },
            }],
        });
    },
};
