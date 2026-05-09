const { getPool } = require("./db");

function parseBool(value, defaultValue = false) {
    if (value === undefined || value === null || value === "") return defaultValue;
    return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function parseIntEnv(name, fallback) {
    const value = Number.parseInt(process.env[name] || "", 10);
    return Number.isFinite(value) ? value : fallback;
}

function createVoiceRewardBridge({ logToMaster }) {
    const enabled = parseBool(process.env.VOICE_REWARD_ENABLED, false);
    const endpoint = (process.env.ESELTOKENS_VOICE_REWARD_URL || "").trim();
    const secret = (process.env.ESELTOKENS_VOICE_REWARD_SECRET || "").trim();
    const minutesPerToken = Math.max(1, parseIntEnv("VOICE_REWARD_MINUTES_PER_TOKEN", 10));
    const minSessionMinutes = Math.max(1, parseIntEnv("VOICE_REWARD_MIN_SESSION_MINUTES", 5));
    const intervalMs = Math.max(60_000, parseIntEnv("VOICE_REWARD_PROCESS_INTERVAL_MS", 300_000));
    const batchSize = Math.max(1, Math.min(500, parseIntEnv("VOICE_REWARD_BATCH_SIZE", 100)));

    let timer = null;
    let running = false;

    async function markSession(id, tokens, error = null, finished = true) {
        const pool = getPool();
        if (finished) {
            await pool.query(
                "UPDATE voice_channel_sessions SET reward_tokens = ?, rewarded_at = ?, reward_error = ? WHERE id = ?",
                [tokens, Date.now(), error, id]
            );
            return;
        }

        await pool.query(
            "UPDATE voice_channel_sessions SET reward_tokens = ?, reward_error = ? WHERE id = ?",
            [tokens, error, id]
        );
    }

    async function sendReward(row, amount, suffix) {
        const body = {
            sessionId: `fahrstuhl-voice-${row.id}-${suffix}`,
            discordId: String(row.user_id),
            guildId: String(row.guild_id),
            channelId: String(row.channel_id),
            durationMs: Number(row.duration_ms || 0),
            endedAt: Number(row.ended_at || Date.now()),
            amount,
        };

        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${secret}`,
            },
            body: JSON.stringify(body),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.success === false) {
            const msg = data?.error || data?.message || `HTTP ${response.status}`;
            const err = new Error(msg);
            err.status = response.status;
            throw err;
        }
        return data;
    }

    async function processRows(rows, { active }) {
        let processed = 0;
        let rewarded = 0;
        let skipped = 0;
        const now = Date.now();

        for (const row of rows) {
            processed += 1;
            const durationMs = active
                ? Math.max(0, now - Number(row.started_at || now))
                : Number(row.duration_ms || 0);
            const minutes = Math.floor(durationMs / 60000);

            if (minutes < minSessionMinutes) {
                skipped += 1;
                if (!active) await markSession(row.id, Number(row.reward_tokens || 0), `below minimum (${minutes}m)`);
                continue;
            }

            const totalEarned = Math.floor(minutes / minutesPerToken);
            const alreadyPaid = Number(row.reward_tokens || 0);
            const amount = Math.max(0, totalEarned - alreadyPaid);
            if (amount <= 0) {
                skipped += 1;
                if (!active) await markSession(row.id, alreadyPaid, "nothing left to pay");
                continue;
            }

            try {
                const rewardRow = { ...row, duration_ms: durationMs, ended_at: active ? now : row.ended_at };
                const suffix = active ? `tick-${totalEarned}` : "final";
                const result = await sendReward(rewardRow, amount, suffix);
                const granted = Number(result?.amountGranted ?? result?.amount ?? amount) || 0;
                rewarded += granted;
                await markSession(row.id, alreadyPaid + granted, null, !active);
            } catch (error) {
                const status = Number(error?.status || 0);
                const permanent = status === 400 || status === 401 || status === 403 || status === 404;
                if (permanent) {
                    skipped += 1;
                    await markSession(row.id, alreadyPaid, error.message || "reward rejected", !active);
                } else {
                    console.error(`${active ? "Active" : "Final"} voice reward delivery failed:`, error.message || error);
                }
            }
        }

        return { processed, rewarded, skipped };
    }

    async function processActiveSessions() {
        if (!enabled || running) return { processed: 0, rewarded: 0, skipped: 0 };
        if (!endpoint || !secret) return { processed: 0, rewarded: 0, skipped: 0, disabledReason: "missing endpoint or secret" };
        running = true;
        try {
            const pool = getPool();
            const [rows] = await pool.query(
                `SELECT id, guild_id, user_id, channel_id, started_at, reward_tokens
                 FROM voice_channel_sessions
                 WHERE ended_at IS NULL
                 ORDER BY started_at ASC
                 LIMIT ?`,
                [batchSize]
            );
            return await processRows(rows, { active: true });
        } finally {
            running = false;
        }
    }

    async function processEndedSessions() {
        if (!enabled || running) return { processed: 0, rewarded: 0, skipped: 0 };
        if (!endpoint || !secret) return { processed: 0, rewarded: 0, skipped: 0, disabledReason: "missing endpoint or secret" };
        running = true;
        try {
            const pool = getPool();
            const [rows] = await pool.query(
                `SELECT id, guild_id, user_id, channel_id, duration_ms, ended_at, reward_tokens
                 FROM voice_channel_sessions
                 WHERE ended_at IS NOT NULL AND rewarded_at IS NULL
                 ORDER BY ended_at ASC
                 LIMIT ?`,
                [batchSize]
            );
            return await processRows(rows, { active: false });
        } finally {
            running = false;
        }
    }

    async function processRewards() {
        if (!enabled || running) return;
        await processActiveSessions();
        await processEndedSessions();
    }

    function start() {
        if (!enabled || timer) return;
        const onError = (err) => {
            running = false;
            console.error("Voice reward processor failed:", err);
            if (logToMaster) {
                logToMaster({
                    title: "Voice reward processor failed",
                    description: `\`\`\`${String(err?.message || err).slice(0, 1500)}\`\`\``,
                    color: 0xED4245,
                }, "ERRORS");
            }
        };

        timer = setInterval(() => {
            processRewards().catch(onError);
        }, intervalMs);
        processRewards().catch(onError);
    }

    function stop() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
    }

    return {
        start,
        stop,
        processRewards,
        processActiveSessions,
        processEndedSessions,
        getStatus: () => ({
            enabled,
            configured: !!endpoint && !!secret,
            running,
            endpoint: endpoint ? endpoint.replace(/\/api\/.*/, "/api/...") : null,
            minutesPerToken,
            minSessionMinutes,
            intervalMs,
        }),
    };
}

module.exports = {
    createVoiceRewardBridge,
};

