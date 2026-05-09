const { getPool } = require("./db");

async function safeQuery(fn) {
    try {
        return await fn(getPool());
    } catch (error) {
        console.warn(`[Tickets] DB operation skipped: ${error.message}`);
        return null;
    }
}

async function recordOpen({ channel, user, type, priority, status = "open", claimedBy = null, reason = "" }) {
    const now = Date.now();
    await safeQuery(pool => pool.query(
        `
        INSERT INTO ticket_records
            (channel_id, guild_id, owner_id, owner_tag, type, priority, status, claimed_by, opened_by, reason, opened_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            type = VALUES(type),
            priority = VALUES(priority),
            status = VALUES(status),
            claimed_by = VALUES(claimed_by),
            reason = VALUES(reason),
            updated_at = VALUES(updated_at)
        `,
        [
            channel.id,
            channel.guild.id,
            user.id,
            user.tag || user.username || user.id,
            type || "Support",
            priority || "normal",
            status,
            claimedBy,
            user.id,
            reason || "",
            now,
            now,
        ]
    ));
}

async function updateState(channel, updates = {}) {
    const fields = [];
    const values = [];
    for (const [key, column] of Object.entries({
        priority: "priority",
        status: "status",
        claimedBy: "claimed_by",
        type: "type",
        reason: "reason",
    })) {
        if (updates[key] !== undefined) {
            fields.push(`${column} = ?`);
            values.push(updates[key]);
        }
    }
    if (!fields.length) return;
    fields.push("updated_at = ?");
    values.push(Date.now(), channel.id);
    await safeQuery(pool => pool.query(
        `UPDATE ticket_records SET ${fields.join(", ")} WHERE channel_id = ?`,
        values
    ));
}

async function recordClose({ channel, closedBy, closeReason, transcriptChannelId = null, transcriptMessageId = null }) {
    const now = Date.now();
    await safeQuery(pool => pool.query(
        `
        UPDATE ticket_records
        SET status = 'closed',
            closed_by = ?,
            close_reason = ?,
            closed_at = ?,
            transcript_channel_id = ?,
            transcript_message_id = ?,
            updated_at = ?
        WHERE channel_id = ?
        `,
        [
            closedBy?.id || null,
            closeReason || "",
            now,
            transcriptChannelId,
            transcriptMessageId,
            now,
            channel.id,
        ]
    ));
}

function noteLine(actor, note) {
    return JSON.stringify({
        at: Date.now(),
        actorId: actor?.id || null,
        actorTag: actor?.tag || actor?.username || actor?.id || "unknown",
        note: String(note || "").trim().slice(0, 1200),
    });
}

function countNotes(value) {
    return String(value || "")
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean)
        .length;
}

async function appendNote({ channel, actor, note }) {
    const text = String(note || "").trim().slice(0, 1200);
    if (!text) return;
    const now = Date.now();
    await safeQuery(pool => pool.query(
        `
        UPDATE ticket_records
        SET internal_notes = CONCAT(COALESCE(internal_notes, ''), ?),
            updated_at = ?
        WHERE channel_id = ?
        `,
        [`${noteLine(actor, text)}\n`, now, channel.id]
    ));
}

async function recordFeedback({ channelId, rating, user, comment = "" }) {
    const safeRating = Math.max(1, Math.min(5, Number(rating) || 0));
    if (!safeRating) return false;
    const now = Date.now();
    await safeQuery(pool => pool.query(
        `
        UPDATE ticket_records
        SET feedback_rating = ?,
            feedback_user_id = ?,
            feedback_comment = ?,
            feedback_at = ?,
            updated_at = ?
        WHERE channel_id = ?
        `,
        [
            safeRating,
            user?.id || null,
            String(comment || "").trim().slice(0, 1000),
            now,
            now,
            channelId,
        ]
    ));
    return true;
}

async function getTicketStats(guildId, options = {}) {
    const slaMinutes = Math.max(0, Number(options.slaMinutes) || 0);
    const overdueThreshold = slaMinutes > 0 ? Date.now() - (slaMinutes * 60 * 1000) : 0;
    const result = await safeQuery(pool => pool.query(
        `
        SELECT
            COUNT(*) AS total,
            SUM(status = 'closed') AS closed,
            SUM(status != 'closed') AS open,
            SUM(priority = 'high' AND status != 'closed') AS high_open,
            SUM(claimed_by IS NOT NULL AND status != 'closed') AS claimed_open,
            SUM(status != 'closed' AND ? > 0 AND opened_at < ?) AS overdue_open,
            AVG(CASE WHEN feedback_rating BETWEEN 1 AND 5 THEN feedback_rating END) AS feedback_avg,
            SUM(feedback_rating IS NOT NULL) AS feedback_count
        FROM ticket_records
        WHERE guild_id = ?
        `,
        [overdueThreshold, overdueThreshold, guildId]
    ));
    const row = result?.[0]?.[0] || {};
    return {
        total: Number(row.total || 0),
        closed: Number(row.closed || 0),
        open: Number(row.open || 0),
        highOpen: Number(row.high_open || 0),
        claimedOpen: Number(row.claimed_open || 0),
        overdueOpen: Number(row.overdue_open || 0),
        feedbackAvg: row.feedback_avg === null || row.feedback_avg === undefined ? null : Number(row.feedback_avg),
        feedbackCount: Number(row.feedback_count || 0),
    };
}

async function getRecentTickets(guildId, limit = 20) {
    const result = await safeQuery(pool => pool.query(
        `
        SELECT channel_id AS channelId, owner_id AS ownerId, owner_tag AS ownerTag,
               type, priority, status, claimed_by AS claimedBy, opened_by AS openedBy,
               closed_by AS closedBy, reason, close_reason AS closeReason,
               opened_at AS openedAt, closed_at AS closedAt,
               transcript_channel_id AS transcriptChannelId,
               transcript_message_id AS transcriptMessageId,
               internal_notes AS internalNotes,
               feedback_rating AS feedbackRating,
               feedback_user_id AS feedbackUserId,
               feedback_comment AS feedbackComment,
               feedback_at AS feedbackAt,
               updated_at AS updatedAt
        FROM ticket_records
        WHERE guild_id = ?
        ORDER BY updated_at DESC
        LIMIT ?
        `,
        [guildId, Math.max(1, Math.min(100, Number(limit) || 20))]
    ));
    return (result?.[0] || []).map(row => ({
        ...row,
        noteCount: countNotes(row.internalNotes),
        internalNotes: undefined,
    }));
}

module.exports = {
    appendNote,
    getRecentTickets,
    getTicketStats,
    recordFeedback,
    recordClose,
    recordOpen,
    updateState,
};
