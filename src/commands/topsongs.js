const { SlashCommandBuilder } = require('discord.js');
const { getTopSongs } = require('../utils/config');
const { buildBrandPayload } = require('../utils/brandAssets');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('topsongs')
        .setDescription('Zeigt die 10 meistgespielten Songs auf diesem Server'),

    async execute(interaction) {
        await interaction.deferReply();

        const rows = getTopSongs(interaction.guildId);

        if (!rows.length) {
            return interaction.editReply({
                embeds: [{ color: 0xFEE75C, description: '📊 Noch keine Song-Statistiken für diesen Server vorhanden.' }],
            });
        }

        const medals = ['🥇', '🥈', '🥉'];
        const lines = rows.map((row, i) => {
            const medal = medals[i] || `**${i + 1}.**`;
            const author = row.author ? ` — ${row.author}` : '';
            return `${medal} **${row.title}**${author}\n↳ ${row.play_count}× gespielt`;
        });

        const embed = {
            color: 0x5865F2,
            title: '📊 Top Songs auf diesem Server',
            description: lines.join('\n\n'),
            footer: { text: `Statistiken seit Bot-Start · ${interaction.guild.name}` },
        };

        return interaction.editReply(buildBrandPayload(embed, { includeBanner: false }));
    },
};
