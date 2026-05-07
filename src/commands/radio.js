const { SlashCommandBuilder } = require('discord.js');
const { createGuildPlayer, playNext, players } = require('../utils/playerManager');
const { buildBrandPayload } = require('../utils/brandAssets');
const { getPlaybackControlError } = require('../utils/djCheck');

// SomaFM public streams — no API key needed
const STATIONS = [
    { name: 'Groove Salad — Ambient/Electronic', value: 'groovesalad', url: 'https://ice1.somafm.com/groovesalad-256-mp3', emoji: '🌿' },
    { name: 'Drone Zone — Atmospheric/Ambient', value: 'dronezone', url: 'https://ice1.somafm.com/dronezone-256-mp3', emoji: '🌌' },
    { name: 'Lush — Indie/Dream Pop', value: 'lush', url: 'https://ice1.somafm.com/lush-128-mp3', emoji: '🌸' },
    { name: 'Beat Blender — Hip-Hop/Electronic', value: 'beatblender', url: 'https://ice1.somafm.com/beatblender-128-mp3', emoji: '🎧' },
    { name: 'Indie Pop Rocks — Indie Rock', value: 'indiepop', url: 'https://ice1.somafm.com/indiepop-128-mp3', emoji: '🎸' },
    { name: 'Underground 80s — New Wave/Synth', value: 'u80s', url: 'https://ice1.somafm.com/u80s-256-mp3', emoji: '📼' },
    { name: 'Deep Space One — Ambient/Space', value: 'deepspaceone', url: 'https://ice1.somafm.com/deepspaceone-128-mp3', emoji: '🚀' },
    { name: 'Secret Agent — Spy/Lounge Jazz', value: 'secretagent', url: 'https://ice1.somafm.com/secretagent-128-mp3', emoji: '🕵️' },
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('radio')
        .setDescription('Startet einen endlosen Radio-Stream (SomaFM)')
        .addStringOption(opt =>
            opt.setName('station')
                .setDescription('Radio-Station auswählen')
                .setRequired(true)
                .addChoices(...STATIONS.map(s => ({ name: s.name, value: s.value })))
        ),

    async execute(interaction, { shoukaku }) {
        await interaction.deferReply();

        const err = getPlaybackControlError(interaction, { requireDj: false });
        if (err) return interaction.editReply({ embeds: [{ color: 0xED4245, description: err }] });

        const stationKey = interaction.options.getString('station');
        const station = STATIONS.find(s => s.value === stationKey);

        const node = shoukaku.getIdealNode();
        if (!node) {
            return interaction.editReply({ embeds: [{ color: 0xED4245, description: '❌ Kein Lavalink-Node verfügbar.' }] });
        }

        let resolved;
        try {
            resolved = await node.rest.resolve(station.url);
        } catch (e) {
            return interaction.editReply({ embeds: [{ color: 0xED4245, description: `❌ Stream konnte nicht geladen werden: \`${e.message}\`` }] });
        }

        if (!resolved || resolved.loadType === 'empty' || resolved.loadType === 'error') {
            return interaction.editReply({ embeds: [{ color: 0xFEE75C, description: '⚠️ Stream nicht erreichbar. Bitte später erneut versuchen.' }] });
        }

        const track = resolved.loadType === 'track' ? resolved.data
            : resolved.loadType === 'search' ? resolved.data[0]
            : resolved.data?.tracks?.[0];

        if (!track) {
            return interaction.editReply({ embeds: [{ color: 0xFEE75C, description: '⚠️ Kein Track im Stream gefunden.' }] });
        }

        // Override title/author with station info for display
        if (track.info) {
            track.info.title = `${station.emoji} ${station.name.split(' — ')[0]} Radio`;
            track.info.author = 'SomaFM';
            track.info.isStream = true;
        }

        const state = await createGuildPlayer({
            guildId: interaction.guildId,
            voiceChannelId: interaction.member.voice.channel.id,
            shardId: interaction.guild.shardId,
            textChannel: interaction.channel,
            shoukaku,
        });

        // Clear existing queue and push radio stream
        state.queue.length = 0;
        state.queue.push(track);

        const embed = {
            color: 0x1DB954,
            title: `${station.emoji} Radio gestartet`,
            description: `**${station.name.split(' — ')[0]}**\n${station.name.split(' — ')[1] || ''}`,
            fields: [{ name: 'Stream', value: 'LIVE 🔴 · SomaFM', inline: true }],
            footer: { text: `Gestartet von ${interaction.user.username}` },
        };

        await interaction.editReply(buildBrandPayload(embed, { includeBanner: false }));

        if (state.current) {
            // Stop current track, playNext will pick up the radio from queue
            await state.player.stopTrack();
        } else {
            await playNext(interaction.guildId, { silent: true });
        }
    },
};
