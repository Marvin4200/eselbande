const { SlashCommandBuilder } = require('discord.js');
const Genius = require('genius-lyrics');
const { players } = require('../utils/playerManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lyrics')
        .setDescription('Get lyrics for the current or a specific song')
        .addStringOption(opt =>
            opt.setName('song')
                .setDescription('Song name to search (optional, defaults to current song)')
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const state = players.get(interaction.guildId);
        const query = interaction.options.getString('song') || state?.current?.info?.title;

        if (!query) {
            return interaction.editReply({ embeds: [{ color: 0xFEE75C, description: '⚠️ No song specified and nothing is playing!' }] });
        }

        try {
            const genius = new Genius.Client(process.env.GENIUS_API_KEY || undefined);
            const searches = await genius.songs.search(query);

            if (!searches.length) {
                return interaction.editReply({ embeds: [{ color: 0xFEE75C, description: `⚠️ No lyrics found for: **${query}**` }] });
            }

            const song = searches[0];
            const lyrics = await song.lyrics();

            // Embed description limit is 4096 chars
            const trimmed = lyrics.length > 3900
                ? lyrics.substring(0, 3900) + '\n\n*... (lyrics truncated)*'
                : lyrics;

            return interaction.editReply({
                embeds: [{
                    color: 0x5865F2,
                    title: `🎤 ${song.title}`,
                    description: trimmed,
                    url: song.url,
                    ...(song.thumbnail ? { thumbnail: { url: song.thumbnail } } : {}),
                    footer: { text: `${song.artist.name} · via Genius` },
                }],
            });
        } catch (err) {
            console.error('[lyrics]', err);
            return interaction.editReply({ embeds: [{ color: 0xED4245, description: `❌ Couldn't fetch lyrics: ${err.message}` }] });
        }
    },
};
