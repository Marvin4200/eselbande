const axios = require("axios");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { getGuildConfig, setGuildConfig } = require("./config");

const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const REQUEST_TIMEOUT = 15000;
const MAX_POSTED_IDS = 500;

// Internal Free Games API URL (same Docker network)
const FREE_GAMES_API_URL = process.env.FREE_GAMES_API_URL || "http://freegamesapi:3016";

function normalizeFreeGamesConfig(config = {}) {
    const fg = config.freeGames && typeof config.freeGames === "object" ? config.freeGames : {};
    return {
        enabled: Boolean(fg.enabled),
        channelId: fg.channelId || null,
        mentionRoleId: fg.mentionRoleId || null,
        postedIds: Array.isArray(fg.postedIds) ? fg.postedIds : [],
        firstRunDone: Boolean(fg.firstRunDone),
    };
}

// ─── Platform display metadata ────────────────────────────────────────────────

const PLATFORM_META = {
    epic:   { color: 0x0078f2, icon: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Epic_Games_logo.svg/512px-Epic_Games_logo.svg.png" },
    gog:    { color: 0x8B1ACD, icon: "https://www.gog.com/favicon.ico" },
    steam:  { color: 0x1b2838, icon: "https://store.steampowered.com/favicon.ico" },
    humble: { color: 0xcc2929, icon: "https://www.humblebundle.com/favicon.ico" },
    itchio: { color: 0xFA5C5C, icon: "https://static.itch.io/images/favicon.ico" },
};

// ─── Fetch from internal aggregation API ─────────────────────────────────────

async function fetchAllFreeGames() {
    const response = await axios.get(`${FREE_GAMES_API_URL}/free-games`, {
        timeout: REQUEST_TIMEOUT,
        headers: { "User-Agent": "FahrstuhlBot/1.0" },
    });

    const games = response.data?.games || [];

    // Attach display metadata (color, icon) based on platform code
    return games.map(game => {
        const meta = PLATFORM_META[game.platform] || { color: 0x5865F2, icon: null };
        return {
            ...game,
            platformColor: meta.color,
            platformIcon: meta.icon,
            // Normalize endDate to Date object if present
            endDate: game.endDate ? new Date(game.endDate) : null,
        };
    });
}

// ─── Embed builder ────────────────────────────────────────────────────────────

function buildGameEmbed(game) {
    const endStr = game.endDate && !isNaN(game.endDate)
        ? game.endDate.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })
        : "Unbekannt";

    const embed = new EmbedBuilder()
        .setColor(game.platformColor)
        .setAuthor({
            name: game.platformLabel || game.platform,
            ...(game.platformIcon ? { iconURL: game.platformIcon } : {}),
        })
        .setTitle(`🎮 ${game.title}`)
        .setURL(game.storeUrl)
        .addFields(
            {
                name: "Preis",
                value: game.originalPrice ? `~~${game.originalPrice}~~ → **Gratis**` : "**Gratis**",
                inline: true,
            },
            {
                name: "Gratis bis",
                value: endStr,
                inline: true,
            }
        )
        .setFooter({ text: "Fahrstuhl Bot • Free Games" })
        .setTimestamp();

    if (game.banner) embed.setImage(game.banner);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel(`Im ${game.platformLabel || game.platform} öffnen`)
            .setStyle(ButtonStyle.Link)
            .setURL(game.storeUrl)
            .setEmoji("🎮")
    );

    return { embed, row };
}

class FreeGamesNotifier {
    constructor() {
        this.client = null;
        this.timer = null;
        this.running = false;
    }

    start(client) {
        if (this.timer) return;
        this.client = client;
        this.timer = setInterval(() => {
            this.runOnce().catch(err =>
                console.error("[FreeGames] Poll failed:", err.message)
            );
        }, POLL_INTERVAL_MS);
        // Initial run after 30s to let the bot settle
        setTimeout(() => {
            this.runOnce().catch(err =>
                console.error("[FreeGames] Initial poll failed:", err.message)
            );
        }, 30000);
        console.log("✅ Free games notifier started (via freegamesapi: Epic, GOG, Steam, Humble, itch.io)");
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        this.client = null;
    }

    async runOnce({ force = false } = {}) {
        if (!this.client || this.running) return;
        this.running = true;
        try {
            const games = await fetchAllFreeGames();
            if (!games.length) return;

            for (const guild of this.client.guilds.cache.values()) {
                await this.notifyGuild(guild, games, { force }).catch(err =>
                    console.error(`[FreeGames] Guild ${guild.id} failed:`, err.message)
                );
            }
        } catch (err) {
            console.error("[FreeGames] runOnce failed:", err.message);
        } finally {
            this.running = false;
        }
    }

    async notifyGuild(guild, games, { force = false } = {}) {
        const config = getGuildConfig(guild.id);
        const settings = normalizeFreeGamesConfig(config);

        if (!settings.enabled || !settings.channelId) return;

        const channel =
            guild.channels.cache.get(settings.channelId) ||
            (await guild.channels.fetch(settings.channelId).catch(() => null));

        if (!channel?.isTextBased?.()) return;

        // On first run after setup, mark existing games as seen without posting (anti-spam)
        if (!settings.firstRunDone && !force) {
            const seenIds = games.map(g => g.id).filter(Boolean);
            setGuildConfig(guild.id, {
                freeGames: { ...settings, postedIds: seenIds, firstRunDone: true },
            });
            return;
        }

        const newGames = games.filter(g => g.id && !settings.postedIds.includes(g.id));
        if (!newGames.length && !force) return;

        const gamesToPost = force ? games : newGames;
        const mention = settings.mentionRoleId ? `<@&${settings.mentionRoleId}> ` : "";

        for (const game of gamesToPost) {
            try {
                const { embed, row } = buildGameEmbed(game);
                await channel.send({
                    content: mention || undefined,
                    embeds: [embed],
                    components: [row],
                });
            } catch (err) {
                console.error(`[FreeGames] Failed to post "${game.title}":`, err.message);
            }
        }

        if (!force) {
            const updatedIds = [...settings.postedIds, ...newGames.map(g => g.id).filter(Boolean)];
            const trimmed = updatedIds.slice(-MAX_POSTED_IDS);
            setGuildConfig(guild.id, {
                freeGames: {
                    ...settings,
                    postedIds: trimmed,
                    firstRunDone: true,
                },
            });
        }
    }
}

const freeGamesNotifier = new FreeGamesNotifier();

freeGamesNotifier.postToChannel = async function (channel) {
    const games = await fetchAllFreeGames();
    if (!games.length) return 0;
    for (const game of games) {
        const { embed, row } = buildGameEmbed(game);
        await channel.send({ embeds: [embed], components: [row] });
    }
    return games.length;
};

module.exports = freeGamesNotifier;
module.exports.normalizeFreeGamesConfig = normalizeFreeGamesConfig;
