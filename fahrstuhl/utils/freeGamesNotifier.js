const axios = require("axios");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { getGuildConfig, setGuildConfig } = require("./config");

const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const REQUEST_TIMEOUT = 15000;
const MAX_POSTED_IDS = 500;

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

// ─── Platform fetchers ────────────────────────────────────────────────────────
// Each returns normalized objects: { id, title, platform, platformColor, platformIcon, storeUrl, originalPrice, banner, endDate }

async function fetchEpicFreeGames() {
    const EPIC_API_URL =
        "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=de&country=DE&allowCountries=DE";

    const response = await axios.get(EPIC_API_URL, {
        timeout: REQUEST_TIMEOUT,
        headers: { "User-Agent": "FahrstuhlBot/1.0" },
    });

    const elements = response.data?.data?.Catalog?.searchStore?.elements || [];

    return elements
        .filter(game => {
            const promos = game.promotions?.promotionalOffers?.[0]?.promotionalOffers || [];
            if (!promos.length) return false;
            const promo = promos[0];
            const now = Date.now();
            const start = promo.startDate ? new Date(promo.startDate).getTime() : 0;
            const end = promo.endDate ? new Date(promo.endDate).getTime() : 0;
            return promo.discountSetting?.discountPercentage === 0 && start <= now && end > now;
        })
        .map(game => {
            const rawSlug =
                game.catalogNs?.mappings?.[0]?.pageSlug ||
                game.offerMappings?.[0]?.pageSlug ||
                (game.productSlug ? game.productSlug.split("/")[0] : null) ||
                game.urlSlug || "";
            const slug = rawSlug.trim();
            const storeUrl = slug
                ? `https://store.epicgames.com/de/p/${slug}`
                : "https://store.epicgames.com/de/free-games";
            const images = game.keyImages || [];
            const banner =
                images.find(i => i.type === "OfferImageWide")?.url ||
                images.find(i => i.type === "DieselStoreFrontWide")?.url ||
                images.find(i => i.type === "Thumbnail")?.url || null;
            const promo = game.promotions?.promotionalOffers?.[0]?.promotionalOffers?.[0];
            return {
                id: `epic:${game.id}`,
                title: game.title || "Unbekanntes Spiel",
                platform: "Epic Games Store",
                platformColor: 0x0078f2,
                platformIcon: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Epic_Games_logo.svg/512px-Epic_Games_logo.svg.png",
                storeUrl,
                originalPrice: game.price?.totalPrice?.fmtPrice?.originalPrice || null,
                banner,
                endDate: promo?.endDate ? new Date(promo.endDate) : null,
            };
        });
}

async function fetchGOGFreeGames() {
    const GOG_API_URL =
        "https://catalog.gog.com/v1/catalog?limit=48&filters[price]=free&order=desc:trending&productType=in:game,pack";

    const response = await axios.get(GOG_API_URL, {
        timeout: REQUEST_TIMEOUT,
        headers: { "User-Agent": "FahrstuhlBot/1.0" },
    });

    const products = response.data?.products || [];

    // Only include games with non-zero base price that are currently free (real giveaways, not permanently F2P)
    return products
        .filter(g => {
            const base = parseFloat(g.price?.baseMoney?.amount || "0");
            const final = parseFloat(g.price?.finalMoney?.amount || "0");
            return base > 0 && final === 0;
        })
        .map(g => ({
            id: `gog:${g.id}`,
            title: g.title || "Unbekanntes Spiel",
            platform: "GOG",
            platformColor: 0x8B1ACD,
            platformIcon: "https://www.gog.com/favicon.ico",
            storeUrl: `https://www.gog.com/game/${g.slug}`,
            originalPrice: g.price?.baseMoney?.amount
                ? `${parseFloat(g.price.baseMoney.amount).toFixed(2)} ${g.price.baseMoney.currency || "EUR"}`
                : null,
            banner: g.coverHorizontal || null,
            endDate: null, // GOG catalog API doesn't expose giveaway end dates
        }));
}

// To add Steam/Ubisoft/etc: register a free API key at freestuff.gg and add a fetcher here.

async function fetchAllFreeGames() {
    const results = await Promise.allSettled([
        fetchEpicFreeGames(),
        fetchGOGFreeGames(),
    ]);
    const platformNames = ["Epic", "GOG"];
    return results.flatMap((r, i) => {
        if (r.status === "fulfilled") return r.value;
        console.error(`[FreeGames] ${platformNames[i]} fetch failed:`, r.reason?.message);
        return [];
    });
}

// ─── Embed builder ────────────────────────────────────────────────────────────

function buildGameEmbed(game) {
    const endStr = game.endDate
        ? game.endDate.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })
        : "Unbekannt";

    const embed = new EmbedBuilder()
        .setColor(game.platformColor)
        .setAuthor({ name: game.platform, iconURL: game.platformIcon })
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
            .setLabel(`Im ${game.platform} öffnen`)
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
        console.log("✅ Free games notifier started (Epic + GOG)");
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
