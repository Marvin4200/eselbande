const { SlashCommandBuilder } = require('discord.js');
const https = require('https');
const { createGuildPlayer, playNext, players } = require('../utils/playerManager');
const { formatDuration } = require('../utils/formatDuration');
const { buildBrandPayload } = require('../utils/brandAssets');

/** Fetch Spotify track metadata by scraping the page <title> tag.
 *  Format is usually "Track Name - Artist Name | Spotify"
 *  Returns a YouTube search query string, or null on failure. */
function resolveSpotifyUrl(url) {
    // Normalize URL: strip /intl-XX/ prefix and query params
    const match = url.match(/spotify\.com(?:\/intl-[a-z]+)?\/track\/([A-Za-z0-9]+)/);
    if (!match) return Promise.resolve(null);
    const trackId = match[1];
    const trackUrl = `https://open.spotify.com/track/${trackId}`;

    return new Promise((resolve) => {
        const req = https.get(trackUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; EselMusic-Bot/1.0)',
                'Accept-Language': 'en-US,en;q=0.9',
            }
        }, (res) => {
            let data = '';
            res.on('data', c => { data += c; if (data.length > 50_000) req.destroy(); });
            res.on('end', () => {
                // Try <title>Track - Artist | Spotify</title>
                const titleMatch = data.match(/<title>([^<]+)<\/title>/i);
                if (titleMatch) {
                    // Strip " | Spotify" suffix
                    const raw = titleMatch[1].replace(/\s*\|\s*Spotify\s*$/i, '').trim();
                    // Format is "Track Name - Artist Name" — use as-is for YouTube search
                    if (raw) return resolve(raw);
                }
                // Fallback: og:title meta tag
                const ogMatch = data.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
                if (ogMatch) return resolve(ogMatch[1].trim());
                resolve(null);
            });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(8000, () => { req.destroy(); resolve(null); });
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song or add it to the queue')
        .addStringOption(opt =>
            opt.setName('query')
                .setDescription('Song name, YouTube URL, or Spotify URL')
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async autocomplete(interaction, { shoukaku }) {
        const focused = interaction.options.getFocused();
        if (!focused || focused.length < 2) {
            return interaction.respond([]);
        }
        try {
            const node = shoukaku.getIdealNode();
            if (!node) return interaction.respond([]);

            const resolved = await node.rest.resolve(`ytsearch:${focused}`);
            if (!resolved || resolved.loadType !== 'search' || !Array.isArray(resolved.data)) {
                return interaction.respond([]);
            }

            const choices = resolved.data.slice(0, 8).map(t => ({
                name: `${t.info.title} — ${t.info.author || 'Unknown'}`.slice(0, 100),
                value: t.info.uri || `ytsearch:${t.info.title}`,
            }));
            return interaction.respond(choices);
        } catch {
            return interaction.respond([]);
        }
    },

    async execute(interaction, { shoukaku }) {
        await interaction.deferReply();

        const query = interaction.options.getString('query');
        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel) {
            return interaction.editReply({ embeds: [{ color: 0xED4245, description: '❌ You need to be in a voice channel!' }] });
        }

        const perms = voiceChannel.permissionsFor(interaction.guild.members.me);
        if (!perms.has('Connect') || !perms.has('Speak')) {
            return interaction.editReply({ embeds: [{ color: 0xED4245, description: '❌ I need **Connect** and **Speak** permissions in your voice channel!' }] });
        }

        const state = await createGuildPlayer({
            guildId: interaction.guildId,
            voiceChannelId: voiceChannel.id,
            shardId: interaction.guild.shardId,
            textChannel: interaction.channel,
            shoukaku,
        });

        // Resolve query
        let resolved;
        try {
            const node = shoukaku.getIdealNode();
            if (!node) throw new Error('No Lavalink node available. Is Lavalink running?');
            const isUrl = /^https?:\/\//i.test(query);
            const isSpotify = isUrl && /open\.spotify\.com/i.test(query);

            let searchQuery = query;
            if (isSpotify) {
                const spotifyTitle = await resolveSpotifyUrl(query);
                if (spotifyTitle) {
                    searchQuery = spotifyTitle; // e.g. "Bad Guy – Billie Eilish"
                } else {
                    return interaction.editReply({ embeds: [{ color: 0xFEE75C, description: '⚠️ Spotify-Link konnte nicht aufgelöst werden.' }] });
                }
            }

            if (isUrl && !isSpotify) {
                resolved = await node.rest.resolve(query);
            } else {
                // Fallback across search prefixes because different YouTube clients
                // (WEB/WEB_REMIX/IOS/etc.) can behave differently for text search.
                const identifiers = [`ytsearch:${searchQuery}`, `ytmsearch:${searchQuery}`];
                for (const identifier of identifiers) {
                    resolved = await node.rest.resolve(identifier);
                    if (resolved && resolved.loadType !== 'empty' && resolved.loadType !== 'error') {
                        break;
                    }
                }
            }
        } catch (err) {
            console.error('[play] Resolve error:', err);
            return interaction.editReply({ embeds: [{ color: 0xED4245, description: `❌ Failed to fetch: \`${err.message}\`` }] });
        }

        if (!resolved || resolved.loadType === 'empty' || resolved.loadType === 'error') {
            return interaction.editReply({ embeds: [{ color: 0xFEE75C, description: '⚠️ No results found.' }] });
        }

        let embed;

        if (resolved.loadType === 'playlist') {
            const tracks = resolved.data.tracks;
            state.queue.push(...tracks);

            const totalDuration = tracks.reduce((acc, t) => acc + (t.info.length || 0), 0);
            embed = {
                color: 0x5865F2,
                title: '📋 Playlist Added to Queue',
                description: `**${resolved.data.info.name}**`,
                fields: [
                    { name: 'Tracks', value: `${tracks.length}`, inline: true },
                    { name: 'Total Duration', value: formatDuration(totalDuration), inline: true },
                    { name: 'Queue Position', value: `#${state.queue.length - tracks.length + 1}`, inline: true },
                ],
                footer: { text: `Requested by ${interaction.user.username}` },
            };
        } else {
            const track = resolved.loadType === 'search' ? resolved.data[0] : resolved.data;
            if (!track) {
                return interaction.editReply({ embeds: [{ color: 0xFEE75C, description: '⚠️ No results found.' }] });
            }

            state.queue.push(track);
            const position = state.current ? state.queue.length : 1;
            const thumbnail = track.info.artworkUrl
                || (track.info.identifier ? `https://img.youtube.com/vi/${track.info.identifier}/mqdefault.jpg` : null);

            embed = {
                color: 0x5865F2,
                title: state.current ? '➕ Added to Queue' : '🎵 Now Playing',
                description: `**[${track.info.title}](${track.info.uri})**`,
                fields: [
                    { name: 'Artist', value: track.info.author || 'Unknown', inline: true },
                    { name: 'Duration', value: track.info.isStream ? 'LIVE 🔴' : formatDuration(track.info.length), inline: true },
                    ...(state.current ? [{ name: 'Position', value: `#${position} in queue`, inline: true }] : []),
                ],
                ...(thumbnail ? { thumbnail: { url: thumbnail } } : {}),
                footer: { text: `Requested by ${interaction.user.username}` },
            };
        }

        await interaction.editReply(buildBrandPayload(embed, { includeBanner: true }));

        // Start playing if idle
        if (!state.current) {
            await playNext(interaction.guildId, { silent: true });
        }
    },
};
