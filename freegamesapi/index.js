/**
 * Free Games Aggregation API
 * Self-hosted alternative to freestuff.gg
 *
 * Sources:
 *   - Epic Games Store (official promotions API)
 *   - GOG (catalog API)
 *   - Steam (via CheapShark — no key needed)
 *   - Humble Bundle (HTML scraping)
 *
 * GET /free-games           → all current free games
 * GET /free-games?platform=epic,steam  → filtered by platform(s)
 * GET /health               → service health
 * GET /cache/clear          → force cache refresh (protected by ADMIN_KEY)
 */

const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3016;
const ADMIN_KEY = process.env.ADMIN_KEY || null;
const REQUEST_TIMEOUT = 15_000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ─── In-memory cache ──────────────────────────────────────────────────────────
let cacheData = null;
let cacheTime = 0;

function isCacheValid() {
    return cacheData !== null && Date.now() - cacheTime < CACHE_TTL_MS;
}

// ─── Sources ──────────────────────────────────────────────────────────────────

/**
 * Epic Games Store — official promotions API
 * Returns games with active 100% off promotions.
 */
async function fetchEpic() {
    const url =
        "https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=de&country=DE&allowCountries=DE";

    const { data } = await axios.get(url, {
        timeout: REQUEST_TIMEOUT,
        headers: { "User-Agent": "FreeGamesAPI/1.0" },
    });

    const elements = data?.data?.Catalog?.searchStore?.elements || [];
    const now = Date.now();

    return elements
        .filter(game => {
            const promos =
                game.promotions?.promotionalOffers?.[0]?.promotionalOffers || [];
            if (!promos.length) return false;
            const promo = promos[0];
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

            const promo =
                game.promotions?.promotionalOffers?.[0]?.promotionalOffers?.[0];

            return {
                id: `epic:${game.id}`,
                title: game.title || "Unknown",
                platform: "epic",
                platformLabel: "Epic Games Store",
                storeUrl,
                originalPrice: game.price?.totalPrice?.fmtPrice?.originalPrice || null,
                banner,
                endDate: promo?.endDate || null,
                fetchedAt: new Date().toISOString(),
            };
        });
}

/**
 * GOG — AJAX filtered endpoint, only real giveaways (100% off paid games)
 */
async function fetchGOG() {
    const url =
        "https://www.gog.com/games/ajax/filtered?mediaType=game&price=free&sort=popularity&page=1";

    const { data } = await axios.get(url, {
        timeout: REQUEST_TIMEOUT,
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
            "Referer": "https://www.gog.com/en/games",
            "X-Requested-With": "XMLHttpRequest",
        },
    });

    const products = data?.products || [];

    return products
        .filter(g => {
            const discountPct = parseInt(g.price?.discountPercentage || "0");
            const base = parseFloat(g.price?.baseAmount || "0");
            const final = parseFloat(g.price?.finalAmount || g.price?.amount || "0");
            // Only real giveaways: 100% off a normally paid game
            return base > 0 && final === 0 && discountPct >= 100;
        })
        .map(g => ({
            id: `gog:${g.id}`,
            title: g.title || "Unknown",
            platform: "gog",
            platformLabel: "GOG",
            storeUrl: `https://www.gog.com/game/${g.slug}`,
            originalPrice: g.price?.baseAmount
                ? `${parseFloat(g.price.baseAmount).toFixed(2)} €`
                : null,
            banner: g.image ? `https:${g.image}` : null,
            endDate: null,
            fetchedAt: new Date().toISOString(),
        }));
}

/**
 * Steam — via Steam's own store search JSON endpoint.
 * Finds games that are currently 100% off (free specials) but normally cost money.
 * Falls back to CheapShark if Steam's endpoint doesn't return useful data.
 */
async function fetchSteam() {
    // Steam search: maxprice=free, specials=1, sorted by reviews
    // The `infinite=1` flag makes it return JSON instead of HTML
    const steamUrl =
        "https://store.steampowered.com/search/results/?query=&start=0&count=50&sort_by=Reviews_DESC&maxprice=free&specials=1&infinite=1&cc=DE&l=german";

    const { data: steamData } = await axios.get(steamUrl, {
        timeout: REQUEST_TIMEOUT,
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json, text/javascript, */*",
        },
    }).catch(() => ({ data: null }));

    // Steam returns results_html (HTML string) + total_count
    // We parse the app IDs and titles out of the embedded HTML
    const games = [];
    if (steamData?.results_html) {
        const html = steamData.results_html;
        // Match all app entries: data-ds-appid and the title span
        const appIdRegex = /data-ds-appid="(\d+)"/g;
        const titleRegex = /<span class="title">([^<]+)<\/span>/g;
        const priceRegex = /data-price-final="(\d+)"/g;
        const priceInitialRegex = /data-price-initial="(\d+)"/g;

        const appIds = [...html.matchAll(appIdRegex)].map(m => m[1]);
        const titles = [...html.matchAll(titleRegex)].map(m => m[1]);
        const finalPrices = [...html.matchAll(priceRegex)].map(m => parseInt(m[1]));
        const initialPrices = [...html.matchAll(priceInitialRegex)].map(m => parseInt(m[1]));

        for (let i = 0; i < appIds.length; i++) {
            const appId = appIds[i];
            const title = titles[i];
            const finalPrice = finalPrices[i] ?? 0;
            const initialPrice = initialPrices[i] ?? 0;

            // Only include games that cost money normally but are now free
            if (!appId || !title || finalPrice !== 0 || initialPrice === 0) continue;

            games.push({
                id: `steam:${appId}`,
                title,
                platform: "steam",
                platformLabel: "Steam",
                storeUrl: `https://store.steampowered.com/app/${appId}`,
                originalPrice: initialPrice > 0 ? `${(initialPrice / 100).toFixed(2)} €` : null,
                banner: `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
                endDate: null,
                fetchedAt: new Date().toISOString(),
            });
        }
    }

    // Fallback: CheapShark covers US Steam deals if the above returned nothing
    if (games.length === 0) {
        const csUrl =
            "https://www.cheapshark.com/api/1.0/deals?storeID=1&upperPrice=0&pageSize=30&sortBy=Recent&onSale=1";

        const { data: csData } = await axios.get(csUrl, {
            timeout: REQUEST_TIMEOUT,
            headers: { "User-Agent": "FreeGamesAPI/1.0" },
        }).catch(() => ({ data: [] }));

        if (Array.isArray(csData)) {
            for (const deal of csData) {
                const normal = parseFloat(deal.normalPrice || "0");
                const savings = parseFloat(deal.savings || "0");
                if (normal > 0 && savings >= 99.9 && deal.steamAppID) {
                    games.push({
                        id: `steam:${deal.steamAppID}`,
                        title: deal.title || "Unknown",
                        platform: "steam",
                        platformLabel: "Steam",
                        storeUrl: `https://store.steampowered.com/app/${deal.steamAppID}`,
                        originalPrice: `$${deal.normalPrice}`,
                        banner: `https://cdn.akamai.steamstatic.com/steam/apps/${deal.steamAppID}/header.jpg`,
                        endDate: null,
                        fetchedAt: new Date().toISOString(),
                    });
                }
            }
        }
    }

    return games;
}

/**
 * GamerPower — aggregates free game giveaways from Steam, itch.io, Humble, GOG, Epic, etc.
 * Covers stores that block direct server-side requests.
 * API docs: https://www.gamerpower.com/api-read
 */
async function fetchGamerPower() {
    const url = "https://www.gamerpower.com/api/giveaways?platform=pc&type=game&sort-by=value";

    const { data } = await axios.get(url, {
        timeout: REQUEST_TIMEOUT,
        headers: { "User-Agent": "FreeGamesAPI/1.0" },
    });

    if (!Array.isArray(data)) return [];

    const PLATFORM_MAP = {
        "Epic Games Store": "epic",
        "GOG": "gog",
        "Steam": "steam",
        "Itch.io": "itchio",
        "Humble Store": "humble",
    };

    return data
        .filter(g => {
            if (g.status !== "Active") return false;
            // Exclude permanently free or unknown-value items
            const worth = parseFloat((g.worth || "").replace(/[^0-9.]/g, ""));
            return !isNaN(worth) && worth > 0;
        })
        .map(g => {
            const platforms = (g.platforms || "").split(",").map(p => p.trim());
            const primaryName = platforms.find(p => PLATFORM_MAP[p]) || platforms[0] || "PC";
            const platformKey = PLATFORM_MAP[primaryName] || "pc";
            return {
                id: `gamerpower:${g.id}`,
                title: g.title || "Unknown",
                platform: platformKey,
                platformLabel: primaryName,
                storeUrl: g.open_giveaway_url || g.giveaway_url || "https://www.gamerpower.com",
                originalPrice: g.worth !== "N/A" ? g.worth : null,
                banner: g.thumbnail || g.image || null,
                endDate: g.end_date && g.end_date !== "N/A" ? new Date(g.end_date).toISOString() : null,
                fetchedAt: new Date().toISOString(),
            };
        });
}

/**
 * itch.io — sale feed for 100%-off games (real giveaways only)
 */
async function fetchItchio() {
    const url = "https://itch.io/games/on-sale.json?min_price=0&max_price=0&classification=game";

    const { data } = await axios.get(url, {
        timeout: REQUEST_TIMEOUT,
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://itch.io/games/on-sale",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
        },
    });

    const games = data?.games || [];

    return games
        .filter(g => {
            // Only giveaways: min_price is 0 but the game has a non-zero original price
            return g.min_price === 0 && g.sale && g.sale.rate === 100;
        })
        .map(g => ({
            id: `itchio:${g.id}`,
            title: g.title || "Unknown",
            platform: "itchio",
            platformLabel: "itch.io",
            storeUrl: g.url || `https://itch.io/games`,
            originalPrice: g.sale?.original_price
                ? `$${(g.sale.original_price / 100).toFixed(2)}`
                : null,
            banner: g.cover_url || null,
            endDate: g.sale?.end_date || null,
            fetchedAt: new Date().toISOString(),
        }));
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

const SOURCES = [
    { name: "Epic",       fn: fetchEpic       },
    { name: "GOG",        fn: fetchGOG        },
    { name: "Steam",      fn: fetchSteam      },
    { name: "GamerPower", fn: fetchGamerPower },
    { name: "itch.io",    fn: fetchItchio     },
];

async function fetchAll() {
    const results = await Promise.allSettled(SOURCES.map(s => s.fn()));
    const all = results.flatMap((r, i) => {
        if (r.status === "fulfilled") return r.value;
        console.error(`[FreeGamesAPI] ${SOURCES[i].name} fetch failed:`, r.reason?.message);
        return [];
    });
    // Deduplicate by normalized title (Epic appears in both fetchEpic and GamerPower)
    const seen = new Set();
    return all.filter(game => {
        const key = (game.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
    res.json({
        status: "ok",
        cacheAge: cacheData ? Math.round((Date.now() - cacheTime) / 1000) + "s" : null,
        cachedCount: cacheData?.length ?? null,
        uptime: Math.round(process.uptime()) + "s",
    });
});

app.get("/free-games", async (req, res) => {
    try {
        if (!isCacheValid()) {
            cacheData = await fetchAll();
            cacheTime = Date.now();
            console.log(`[FreeGamesAPI] Cache refreshed — ${cacheData.length} games found`);
        }

        let games = cacheData;

        // Optional ?platform=epic,steam filter
        const platformFilter = req.query.platform;
        if (platformFilter) {
            const allowed = platformFilter.toLowerCase().split(",").map(p => p.trim());
            games = games.filter(g => allowed.includes(g.platform));
        }

        res.json({
            games,
            total: games.length,
            cachedAt: new Date(cacheTime).toISOString(),
            nextRefresh: new Date(cacheTime + CACHE_TTL_MS).toISOString(),
        });
    } catch (err) {
        console.error("[FreeGamesAPI] Fatal error:", err.message);
        res.status(500).json({ error: "Internal server error", message: err.message });
    }
});

// Force cache clear (requires ADMIN_KEY if set)
app.post("/cache/clear", (req, res) => {
    if (ADMIN_KEY) {
        const provided = req.headers["x-admin-key"];
        if (provided !== ADMIN_KEY) {
            return res.status(401).json({ error: "Unauthorized" });
        }
    }
    cacheData = null;
    cacheTime = 0;
    res.json({ ok: true, message: "Cache cleared — next request will re-fetch" });
});

app.listen(PORT, () => {
    console.log(`✅ Free Games API running on port ${PORT}`);
    console.log(`   Endpoints: GET /free-games  GET /health  POST /cache/clear`);

    // Warm up cache on start
    fetchAll().then(games => {
        cacheData = games;
        cacheTime = Date.now();
        console.log(`[FreeGamesAPI] Warm-up complete — ${games.length} free games cached`);
    }).catch(err => {
        console.error("[FreeGamesAPI] Warm-up failed:", err.message);
    });
});
