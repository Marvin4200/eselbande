const { getPool } = require("./db");

function makeKey(guildId, userId) {
    return `${guildId}:${userId}`;
}

function isNonBotMember(state) {
    const user = state?.member?.user;
    return !!user && !user.bot;
}

function nowMs() {
    return Date.now();
}

function createVoiceUsageTracker() {
    const open = new Map(); // key -> { id, guildId, userId, channelId, startedAt }
    let started = false;
    let client = null;
    let closing = false;

    async function closeAllOpenSessions(reason = "restart") {
        const pool = getPool();
        const t = nowMs();
        await pool.query(
            "UPDATE voice_channel_sessions SET ended_at = ?, duration_ms = GREATEST(0, ? - started_at), end_reason = ? WHERE ended_at IS NULL",
            [t, t, reason]
        );
        open.clear();
    }

    async function startSession(guildId, userId, channelId, startedAt = null) {
        const pool = getPool();
        const t = startedAt || nowMs();
        const [result] = await pool.query(
            "INSERT INTO voice_channel_sessions (guild_id, user_id, channel_id, started_at, ended_at, duration_ms, end_reason) VALUES (?, ?, ?, ?, NULL, 0, NULL)",
            [guildId, userId, channelId, t]
        );
        const id = result?.insertId;
        open.set(makeKey(guildId, userId), { id, guildId, userId, channelId, startedAt: t });
        return id;
    }

    async function endSession(guildId, userId, reason = "leave") {
        const pool = getPool();
        const key = makeKey(guildId, userId);
        const t = nowMs();

        const existing = open.get(key);
        if (existing?.id) {
            const duration = Math.max(0, t - (existing.startedAt || t));
            await pool.query(
                "UPDATE voice_channel_sessions SET ended_at = ?, duration_ms = ?, end_reason = ? WHERE id = ?",
                [t, duration, reason, existing.id]
            );
            open.delete(key);
            return;
        }

        // Fallback: close latest open session from DB (if map was lost due to restart).
        const [rows] = await pool.query(
            "SELECT id, started_at FROM voice_channel_sessions WHERE guild_id = ? AND user_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1",
            [guildId, userId]
        );
        const row = rows?.[0];
        if (!row?.id) return;

        const duration = Math.max(0, t - Number(row.started_at || t));
        await pool.query(
            "UPDATE voice_channel_sessions SET ended_at = ?, duration_ms = ?, end_reason = ? WHERE id = ?",
            [t, duration, reason, row.id]
        );
    }

    async function hydrateFromCurrentVoiceStates() {
        if (!client) return;
        for (const guild of client.guilds.cache.values()) {
            try {
                // Populate voice states cache.
                if (guild.voiceStates?.fetch) {
                    await guild.voiceStates.fetch().catch(() => {});
                }

                const states = guild.voiceStates?.cache?.values ? Array.from(guild.voiceStates.cache.values()) : [];
                for (const state of states) {
                    if (!state?.channelId) continue;
                    if (!isNonBotMember(state)) continue;
                    const guildId = guild.id;
                    const userId = state.member.user.id;
                    const key = makeKey(guildId, userId);
                    if (open.has(key)) continue;
                    await startSession(guildId, userId, state.channelId);
                }
            } catch (e) {
                // best effort, avoid breaking startup
            }
        }
    }

    async function handleVoiceStateUpdate(oldState, newState) {
        if (closing) return;
        try {
            // Only track real users.
            const state = newState?.member?.user ? newState : oldState;
            if (!isNonBotMember(state)) return;

            const guildId = (newState?.guild || oldState?.guild)?.id;
            const userId = (newState?.member || oldState?.member)?.user?.id;
            if (!guildId || !userId) return;

            const oldChan = oldState?.channelId || null;
            const newChan = newState?.channelId || null;
            if (oldChan === newChan) return; // mute/deaf/etc

            if (!oldChan && newChan) {
                await startSession(guildId, userId, newChan);
                return;
            }

            if (oldChan && !newChan) {
                await endSession(guildId, userId, "leave");
                return;
            }

            if (oldChan && newChan && oldChan !== newChan) {
                await endSession(guildId, userId, "move");
                await startSession(guildId, userId, newChan);
            }
        } catch {
            // ignore individual tracking errors
        }
    }

    async function start(_client) {
        if (started) return;
        started = true;
        client = _client;

        // Close any previously-open sessions (from unclean shutdown) then re-hydrate.
        await closeAllOpenSessions("restart").catch(() => {});
        await hydrateFromCurrentVoiceStates().catch(() => {});

        client.on("voiceStateUpdate", handleVoiceStateUpdate);
    }

    async function stop() {
        if (!started) return;
        closing = true;
        if (client) {
            try { client.off("voiceStateUpdate", handleVoiceStateUpdate); } catch {}
        }
        await closeAllOpenSessions("shutdown").catch(() => {});
        closing = false;
        started = false;
        client = null;
    }

    return {
        start,
        stop,
    };
}

module.exports = {
    createVoiceUsageTracker,
};

