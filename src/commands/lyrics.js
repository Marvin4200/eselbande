const { SlashCommandBuilder } = require('discord.js');
const https = require('https');
const { players } = require('../utils/playerManager');

/** Fetch from lyrics.ovh — no API key required. */
function fetchLyrics(artist, title) {
    return new Promise((resolve, reject) => {
        const path = `/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
        const req = https.get({ hostname: 'api.lyrics.ovh', path, headers: { 'User-Agent': 'EselMusic-Bot/1.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.lyrics) resolve(json.lyrics.trim());
                    else reject(new Error(json.error || 'No lyrics found'));
                } catch {
                    reject(new Error('Invalid response from lyrics API'));
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(8000, () => { req.destroy(); reject(new Error('Request timed out')); });
    });
}

/** Strip common YouTube suffix noise like "(Official Video)", "[Lyrics]", "ft. …" etc. */
function cleanTitle(raw) {
    return raw
        .replace(/\s*[\[(].*?[\])]/g, '')   // remove (…) and […]
        .replace(/\s*ft\..*$/i, '')          // remove ft. …
        .replace(/\s*feat\..*$/i, '')        // remove feat. …
        .trim();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lyrics')
        .setDescription('Zeigt den Songtext des aktuellen oder eines bestimmten Songs')
        .addStringOption(opt =>
            opt.setName('song')
                .setDescription('Songname (optional, Standard: aktueller Song)')
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const state = players.get(interaction.guildId);
        const manualQuery = interaction.options.getString('song');

        let artist, title;

        if (manualQuery) {
            // User provided "Artist - Title" or just "Title"
            const dash = manualQuery.indexOf(' - ');
            if (dash !== -1) {
                artist = manualQuery.slice(0, dash).trim();
                title = manualQuery.slice(dash + 3).trim();
            } else {
                artist = '';
                title = manualQuery.trim();
            }
        } else if (state?.current?.info) {
            artist = cleanTitle(state.current.info.author || '');
            title  = cleanTitle(state.current.info.title  || '');
        } else {
            return interaction.editReply({
                embeds: [{ color: 0xFEE75C, description: '⚠️ Kein Song angegeben und nichts spielt gerade.' }],
            });
        }

        // lyrics.ovh needs both fields; if artist is empty use title only with a placeholder
        const effectiveArtist = artist || title;
        const effectiveTitle  = artist ? title : title;

        try {
            const lyrics = await fetchLyrics(effectiveArtist, effectiveTitle);

            // Discord embed description cap: 4096 chars
            const pages = [];
            let remaining = lyrics;
            while (remaining.length > 0) {
                pages.push(remaining.slice(0, 3900));
                remaining = remaining.slice(3900);
            }

            const displayTitle = artist ? `${artist} — ${title}` : title;
            const description  = pages[0] + (pages.length > 1 ? '\n\n*... (Text zu lang, gekürzt)*' : '');

            return interaction.editReply({
                embeds: [{
                    color: 0x5865F2,
                    title: `🎤 ${displayTitle}`,
                    description,
                    footer: { text: 'via lyrics.ovh' },
                }],
            });
        } catch (err) {
            const displayQuery = artist ? `${artist} — ${title}` : title;
            return interaction.editReply({
                embeds: [{ color: 0xFEE75C, description: `⚠️ Keine Lyrics gefunden für: **${displayQuery}**\n\nTipp: Versuche \`/lyrics song:Artist - Titel\`` }],
            });
        }
    },
};
