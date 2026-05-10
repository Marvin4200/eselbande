const axios = require("axios");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { getGuildConfig, setGuildConfig } = require("./config");

const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const EPIC_API_URL =
    "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=de&country=DE&allowCountries=DE";
const REQUEST_TIMEOUT = 15000;
const EPIC_BLUE = 0x0078f2;
const MAX_POSTED_IDS = 200;

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

function buildGameEmbed(game) {
    const title = game.title || "Unbekanntes Spiel";
    const slug = game.productSlug || game.urlSlug || game.catalogNs?.mappings?.[0]?.pageSlug || "";
    const storeUrl = slug ? `https://store.epicgames.com/de/p/${slug}` : "https://store.epicgames.com/de/free-games";
    const launcherUrl = slug
        ? `com.epicgames.launcher://store/p/${slug}`
        : "com.epicgames.launcher://store/free-games";

    // Determine original price
    const originalPrice =
        game.price?.totalPrice?.fmtPrice?.originalPrice ||
        game.price?.totalPrice?.fmtPrice?.discountPrice ||
        null;

    // Find best banner image
    const images = game.keyImages || [];
    const banner =
        images.find(i => i.type === "OfferImageWide")?.url ||
        images.find(i => i.type === "DieselStoreFrontWide")?.url ||
        images.find(i => i.type === "Thumbnail")?.url ||
        null;

    // Expiry date
    const promotions = game.promotions?.promotionalOffers?.[0]?.promotionalOffers?.[0];
    const endDate = promotions?.endDate ? new Date(promotions.endDate) : null;
    const endStr = endDate
        ? endDate.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })
        : "Unbekannt";

    const embed = new EmbedBuilder()
        .setColor(EPIC_BLUE)
        .setAuthor({ name: "Epic Games Store", iconURL: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Epic_Games_logo.svg/512px-Epic_Games_logo.svg.png" })
        .setTitle(`🎮 ${title}`)
        .setURL(storeUrl)
        .addFields(
            {
                name: "Preis",
                value: originalPrice ? `~~${originalPrice}~~ → **Gratis**` : "**Gratis**",
                inline: true,
            },
            {
                name: "Gratis bis",
                value: endStr,
                inline: true,
            }
        )
        .setFooter({ text: "Fahrstuhl Bot • Epic Games Store" })
        .setTimestamp();

    if (banner) embed.setImage(banner);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel("Im Browser öffnen")
            .setStyle(ButtonStyle.Link)
            .setURL(storeUrl)
            .setEmoji("🌐"),
        new ButtonBuilder()
            .setLabel("Mit Launcher öffnen")
            .setStyle(ButtonStyle.Link)
            .setURL(launcherUrl)
            .setEmoji("🚀")
    );

    return { embed, row };
}

async function fetchFreeGames() {
    const response = await axios.get(EPIC_API_URL, {
        timeout: REQUEST_TIMEOUT,
        headers: { "User-Agent": "FahrstuhlBot/1.0" },
    });

    const elements =
        response.data?.data?.Catalog?.searchStore?.elements || [];

    return elements.filter(game => {
        // Must have an active free promotion
        const promos = game.promotions?.promotionalOffers?.[0]?.promotionalOffers || [];
        if (!promos.length) return false;
        const promo = promos[0];
        const now = Date.now();
        const start = promo.startDate ? new Date(promo.startDate).getTime() : 0;
        const end = promo.endDate ? new Date(promo.endDate).getTime() : 0;
        return (
            promo.discountSetting?.discountPercentage === 0 &&
            start <= now &&
            end > now
        );
    });
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
        console.log("✅ Free games notifier started");
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
            let games;
            try {
                games = await fetchFreeGames();
            } catch (err) {
                console.error("[FreeGames] Fetch failed:", err.message);
                return;
            }

            if (!games.length) return;

            for (const guild of this.client.guilds.cache.values()) {
                await this.notifyGuild(guild, games, { force }).catch(err =>
                    console.error(`[FreeGames] Guild ${guild.id} failed:`, err.message)
                );
            }
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

        // On first run after setup, mark existing games as seen without posting
        if (!settings.firstRunDone && !force) {
            const seenIds = games.map(g => g.id).filter(Boolean);
            setGuildConfig(guild.id, {
                freeGames: {
                    ...settings,
                    postedIds: seenIds,
                    firstRunDone: true,
                },
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
            // Merge new IDs, keep list bounded
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

module.exports = freeGamesNotifier;
module.exports.normalizeFreeGamesConfig = normalizeFreeGamesConfig;
module.exports.fetchFreeGames = fetchFreeGames;
