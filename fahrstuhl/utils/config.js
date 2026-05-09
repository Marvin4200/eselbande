const fs = require("fs");
const path = require("path");
const { initDb, getPool } = require("./db");

const CONFIG_FILE = path.join(__dirname, "..", "guildConfigs.json");
const USER_STATS_FILE = path.join(__dirname, "..", "userStats.json");
const GLOBAL_STATS_FILE = path.join(__dirname, "..", "globalStats.json");

const GLOBAL_STATS_FLUSH_MS = 10000;
let cachedGlobalStats = { totalTrolls: 0, totalMoves: 0 };
let globalStatsDirty = false;
let globalStatsFlushTimer = null;
let lastGlobalFlushAt = 0;
let nextGlobalFlushAt = 0;
let guildConfigCache = {};
let userStatsCache = {};
let initialized = false;
let lastCacheReloadAt = 0;

function normalizeUserStats(stats = {}) {
    return {
        shieldsOwned: Number(stats.shieldsOwned || 0),
        lastDailyClaim: Number(stats.lastDailyClaim || 0),
        activeShieldExpiry: Number(stats.activeShieldExpiry || 0),
        lastMonthlyBonus: Number(stats.lastMonthlyBonus || 0)
    };
}

async function migrateIfNeeded() {
    const pool = getPool();

    const [guildRows] = await pool.query("SELECT COUNT(*) AS cnt FROM guild_configs");
    const [userRows] = await pool.query("SELECT COUNT(*) AS cnt FROM user_stats");
    const [globalStatsRows] = await pool.query("SELECT total_trolls, total_moves FROM global_stats WHERE id = 1");

    const guildCount = Number(guildRows[0]?.cnt || 0);
    const userCount = Number(userRows[0]?.cnt || 0);
    const globalStatsEmpty =
        globalStatsRows.length === 0 ||
        (Number(globalStatsRows[0]?.total_trolls || 0) === 0 && Number(globalStatsRows[0]?.total_moves || 0) === 0);

    if (guildCount === 0 && fs.existsSync(CONFIG_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
            for (const [guildId, config] of Object.entries(data)) {
                guildConfigCache[guildId] = config || {};
                await pool.query(
                    "INSERT INTO guild_configs (guild_id, config_json) VALUES (?, ?) ON DUPLICATE KEY UPDATE config_json = VALUES(config_json)",
                    [guildId, JSON.stringify(config || {})]
                );
            }
        } catch (e) {
            console.error("Guild config migration failed:", e);
        }
    }

    if (userCount === 0 && fs.existsSync(USER_STATS_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(USER_STATS_FILE, "utf8"));
            for (const [userId, stats] of Object.entries(data)) {
                const normalized = normalizeUserStats(stats);
                userStatsCache[userId] = normalized;
                await pool.query(
                    "INSERT INTO user_stats (user_id, shields_owned, last_daily_claim, active_shield_expiry, last_monthly_bonus) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE shields_owned = VALUES(shields_owned), last_daily_claim = VALUES(last_daily_claim), active_shield_expiry = VALUES(active_shield_expiry), last_monthly_bonus = VALUES(last_monthly_bonus)",
                    [
                        userId,
                        normalized.shieldsOwned,
                        normalized.lastDailyClaim,
                        normalized.activeShieldExpiry,
                        normalized.lastMonthlyBonus
                    ]
                );
            }
        } catch (e) {
            console.error("User stats migration failed:", e);
        }
    }

    if (globalStatsEmpty && fs.existsSync(GLOBAL_STATS_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(GLOBAL_STATS_FILE, "utf8"));
            cachedGlobalStats = {
                totalTrolls: Number(data.totalTrolls || 0),
                totalMoves: Number(data.totalMoves || 0)
            };
            await pool.query(
                "INSERT INTO global_stats (id, total_trolls, total_moves) VALUES (1, ?, ?) ON DUPLICATE KEY UPDATE total_trolls = VALUES(total_trolls), total_moves = VALUES(total_moves)",
                [cachedGlobalStats.totalTrolls, cachedGlobalStats.totalMoves]
            );
        } catch (e) {
            console.error("Global stats migration failed:", e);
        }
    }
}

async function loadCachesFromDb() {
    const pool = getPool();

    const [guildRows] = await pool.query("SELECT guild_id, config_json FROM guild_configs");
    guildConfigCache = {};
    for (const row of guildRows) {
        try {
            guildConfigCache[row.guild_id] = JSON.parse(row.config_json || "{}") || {};
        } catch (e) {
            guildConfigCache[row.guild_id] = {};
        }
    }

    const [userRows] = await pool.query(
        "SELECT user_id, shields_owned, last_daily_claim, active_shield_expiry, last_monthly_bonus FROM user_stats"
    );
    userStatsCache = {};
    for (const row of userRows) {
        userStatsCache[row.user_id] = {
            shieldsOwned: row.shields_owned != null ? Number(row.shields_owned) : null,
            lastDailyClaim: row.last_daily_claim != null ? Number(row.last_daily_claim) : null,
            activeShieldExpiry: row.active_shield_expiry != null ? Number(row.active_shield_expiry) : null,
            lastMonthlyBonus: row.last_monthly_bonus != null ? Number(row.last_monthly_bonus) : null
        };
    }

    const [globalRows] = await pool.query("SELECT total_trolls, total_moves FROM global_stats WHERE id = 1");
    if (globalRows.length > 0) {
        cachedGlobalStats = {
            totalTrolls: Number(globalRows[0].total_trolls || 0),
            totalMoves: Number(globalRows[0].total_moves || 0)
        };
    } else {
        cachedGlobalStats = { totalTrolls: 0, totalMoves: 0 };
    }

    lastCacheReloadAt = Date.now();
}

async function initConfig() {
    if (initialized) return;
    if (initConfig._promise) return initConfig._promise;

    initConfig._promise = (async () => {
        const host = process.env.MYSQL_HOST || "127.0.0.1";
        const port = Number(process.env.MYSQL_PORT || 3306);
        const user = process.env.MYSQL_USER || "root";
        const password = process.env.MYSQL_PASSWORD || "";
        const database = process.env.MYSQL_DATABASE || "fahrstuhl";

        await initDb({ host, port, user, password, database });

        await migrateIfNeeded();
        await loadCachesFromDb();

        initialized = true;
        initConfig._promise = null;
    })();

    return initConfig._promise;
}

async function reloadCache() {
    if (!initialized) {
        await initConfig();
        return;
    }
    await flushGlobalStats(true);
    await loadCachesFromDb();
}

function getGuildConfig(guildId) {
    return guildConfigCache[guildId] || {};
}

function setGuildConfig(guildId, config) {
    const current = guildConfigCache[guildId] || {};
    const merged = { ...current, ...config };
    guildConfigCache[guildId] = merged;

    const pool = getPool();
    pool.query(
        "INSERT INTO guild_configs (guild_id, config_json) VALUES (?, ?) ON DUPLICATE KEY UPDATE config_json = VALUES(config_json)",
        [guildId, JSON.stringify(merged)]
    ).catch((e) => {
        console.error("❌ Database error - setGuildConfig:", {
            guildId,
            operation: "INSERT INTO guild_configs",
            error: e.message,
            code: e.code,
            timestamp: new Date().toISOString()
        });
        guildConfigCache[guildId] = current;
    });
}

function getUserStats(userId) {
    if (!userStatsCache[userId]) {
        userStatsCache[userId] = normalizeUserStats();
    }
    return userStatsCache[userId];
}

function setUserStats(userId, stats) {
    const current = getUserStats(userId);
    // Only overwrite fields that were explicitly passed — others keep current value
    const merged = { ...current };
    if (stats.shieldsOwned !== undefined)      merged.shieldsOwned      = Number(stats.shieldsOwned)      || 0;
    if (stats.lastDailyClaim !== undefined)    merged.lastDailyClaim    = Number(stats.lastDailyClaim)    || 0;
    if (stats.activeShieldExpiry !== undefined) merged.activeShieldExpiry = Number(stats.activeShieldExpiry); // 0 is valid!
    if (stats.lastMonthlyBonus !== undefined)  merged.lastMonthlyBonus  = Number(stats.lastMonthlyBonus)  || 0;
    userStatsCache[userId] = merged;

    const pool = getPool();
    pool.query(
        "INSERT INTO user_stats (user_id, shields_owned, last_daily_claim, active_shield_expiry, last_monthly_bonus) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE shields_owned = VALUES(shields_owned), last_daily_claim = VALUES(last_daily_claim), active_shield_expiry = VALUES(active_shield_expiry), last_monthly_bonus = VALUES(last_monthly_bonus)",
        [userId, merged.shieldsOwned, merged.lastDailyClaim, merged.activeShieldExpiry, merged.lastMonthlyBonus]
    ).catch((e) => {
        console.error("❌ Database error - setUserStats:", {
            userId,
            operation: "INSERT INTO user_stats",
            error: e.message,
            code: e.code,
            timestamp: new Date().toISOString()
        });
        delete userStatsCache[userId];
    });
}

function getGlobalStats() {
    return cachedGlobalStats;
}

function getCacheStatus() {
    return {
        lastReloadAt: lastCacheReloadAt,
        guildCount: Object.keys(guildConfigCache).length,
        userCount: Object.keys(userStatsCache).length,
        globalStats: { ...cachedGlobalStats },
        pendingGlobalFlush: globalStatsDirty,
        lastGlobalFlushAt,
        nextGlobalFlushAt
    };
}

async function flushGlobalStats(force = false) {
    if (!force && !globalStatsDirty) {
        if (globalStatsFlushTimer) {
            clearTimeout(globalStatsFlushTimer);
            globalStatsFlushTimer = null;
        }
        return;
    }
    try {
        const pool = getPool();
        await pool.query(
            "INSERT INTO global_stats (id, total_trolls, total_moves) VALUES (1, ?, ?) ON DUPLICATE KEY UPDATE total_trolls = VALUES(total_trolls), total_moves = VALUES(total_moves)",
            [cachedGlobalStats.totalTrolls || 0, cachedGlobalStats.totalMoves || 0]
        );
        globalStatsDirty = false;
        lastGlobalFlushAt = Date.now();
    } catch (e) {
        console.error("flushGlobalStats error:", e);
    } finally {
        if (globalStatsFlushTimer) {
            clearTimeout(globalStatsFlushTimer);
            globalStatsFlushTimer = null;
        }
        nextGlobalFlushAt = 0;
    }
}

function scheduleGlobalStatsFlush() {
    if (globalStatsFlushTimer) return;
    globalStatsFlushTimer = setTimeout(() => {
        flushGlobalStats().catch(() => {});
    }, GLOBAL_STATS_FLUSH_MS);
    nextGlobalFlushAt = Date.now() + GLOBAL_STATS_FLUSH_MS;
}

function incrementGlobalStat(key, amount = 1) {
    cachedGlobalStats[key] = (cachedGlobalStats[key] || 0) + amount;
    globalStatsDirty = true;
    scheduleGlobalStatsFlush();
    return cachedGlobalStats;
}

module.exports = {
    initConfig,
    reloadCache,
    getGuildConfig,
    setGuildConfig,
    getUserStats,
    setUserStats,
    getGlobalStats,
    getCacheStatus,
    incrementGlobalStat,
    flushGlobalStats
};
