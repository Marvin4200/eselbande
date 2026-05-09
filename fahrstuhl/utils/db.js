const mysql = require("mysql2/promise");

let pool = null;
let lastDbPingAt = 0;
let lastDbPingMs = null;

async function initDb({ host, port, user, password, database }) {
    if (pool) return pool;

    pool = mysql.createPool({
        host,
        port,
        user,
        password,
        database,
        waitForConnections: true,
        connectionLimit: 10,
        charset: "utf8mb4",
        supportBigNumbers: true
    });

    await pool.query(`
        CREATE TABLE IF NOT EXISTS guild_configs (
            guild_id VARCHAR(32) PRIMARY KEY,
            config_json LONGTEXT NOT NULL
        )
    `);
    await pool.query(`ALTER TABLE guild_configs MODIFY config_json LONGTEXT NOT NULL`).catch(() => {});

    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_stats (
            user_id VARCHAR(32) PRIMARY KEY,
            shields_owned INT NOT NULL DEFAULT 0,
            last_daily_claim BIGINT NOT NULL DEFAULT 0,
            active_shield_expiry BIGINT NOT NULL DEFAULT 0,
            last_monthly_bonus BIGINT NOT NULL DEFAULT 0
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS global_stats (
            id TINYINT PRIMARY KEY,
            total_trolls BIGINT NOT NULL DEFAULT 0,
            total_moves BIGINT NOT NULL DEFAULT 0
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS voice_channel_sessions (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            guild_id VARCHAR(32) NOT NULL,
            user_id VARCHAR(32) NOT NULL,
            channel_id VARCHAR(32) NOT NULL,
            started_at BIGINT NOT NULL,
            ended_at BIGINT DEFAULT NULL,
            duration_ms BIGINT NOT NULL DEFAULT 0,
            end_reason VARCHAR(32) DEFAULT NULL,
            reward_tokens INT NOT NULL DEFAULT 0,
            rewarded_at BIGINT DEFAULT NULL,
            reward_error TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_open (guild_id, user_id, ended_at),
            INDEX idx_user_time (user_id, ended_at),
            INDEX idx_guild_time (guild_id, ended_at),
            INDEX idx_channel_time (channel_id, ended_at)
        )
    `);

    const voiceCols = await pool.query("SHOW COLUMNS FROM voice_channel_sessions").then(([rows]) => rows.map(r => r.Field));
    if (!voiceCols.includes("reward_tokens")) {
        await pool.query("ALTER TABLE voice_channel_sessions ADD COLUMN reward_tokens INT NOT NULL DEFAULT 0");
    }
    if (!voiceCols.includes("rewarded_at")) {
        await pool.query("ALTER TABLE voice_channel_sessions ADD COLUMN rewarded_at BIGINT DEFAULT NULL");
    }
    if (!voiceCols.includes("reward_error")) {
        await pool.query("ALTER TABLE voice_channel_sessions ADD COLUMN reward_error TEXT");
    }

    await pool.query(`
        CREATE TABLE IF NOT EXISTS moderation_cases (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            guild_id VARCHAR(32) NOT NULL,
            user_id VARCHAR(32) NOT NULL,
            moderator_id VARCHAR(32) DEFAULT NULL,
            type VARCHAR(32) NOT NULL,
            reason TEXT,
            duration_ms BIGINT DEFAULT NULL,
            expires_at BIGINT DEFAULT NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'active',
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL,
            INDEX idx_mod_guild_time (guild_id, created_at),
            INDEX idx_mod_user_time (guild_id, user_id, created_at),
            INDEX idx_mod_status (guild_id, status)
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS guild_user_levels (
            guild_id VARCHAR(32) NOT NULL,
            user_id VARCHAR(32) NOT NULL,
            xp BIGINT NOT NULL DEFAULT 0,
            level INT NOT NULL DEFAULT 0,
            message_count BIGINT NOT NULL DEFAULT 0,
            voice_xp BIGINT NOT NULL DEFAULT 0,
            last_message_xp_at BIGINT NOT NULL DEFAULT 0,
            updated_at BIGINT NOT NULL,
            PRIMARY KEY (guild_id, user_id),
            INDEX idx_level_leaderboard (guild_id, xp),
            INDEX idx_level_updated (guild_id, updated_at)
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS temp_voice_channels (
            channel_id VARCHAR(32) PRIMARY KEY,
            guild_id VARCHAR(32) NOT NULL,
            owner_id VARCHAR(32) NOT NULL,
            created_at BIGINT NOT NULL,
            INDEX idx_temp_voice_guild (guild_id)
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS ticket_records (
            guild_id VARCHAR(32) NOT NULL,
            owner_id VARCHAR(32) NOT NULL,
            owner_tag VARCHAR(120) DEFAULT NULL,
            type VARCHAR(80) NOT NULL DEFAULT 'Support',
            priority VARCHAR(24) NOT NULL DEFAULT 'normal',
            status VARCHAR(32) NOT NULL DEFAULT 'open',
            claimed_by VARCHAR(32) DEFAULT NULL,
            opened_by VARCHAR(32) DEFAULT NULL,
            closed_by VARCHAR(32) DEFAULT NULL,
            reason TEXT,
            close_reason TEXT,
            internal_notes LONGTEXT,
            feedback_rating INT DEFAULT NULL,
            feedback_user_id VARCHAR(32) DEFAULT NULL,
            feedback_comment TEXT,
            feedback_at BIGINT DEFAULT NULL,
            opened_at BIGINT NOT NULL,
            closed_at BIGINT DEFAULT NULL,
            transcript_channel_id VARCHAR(32) DEFAULT NULL,
            transcript_message_id VARCHAR(32) DEFAULT NULL,
            updated_at BIGINT NOT NULL,
            INDEX idx_ticket_guild_status (guild_id, status),
            INDEX idx_ticket_guild_opened (guild_id, opened_at),
            INDEX idx_ticket_owner (guild_id, owner_id),
            INDEX idx_ticket_claimed (guild_id, claimed_by)
        )
    `);

    const ticketCols = await pool.query("SHOW COLUMNS FROM ticket_records").then(([rows]) => rows.map(r => r.Field));
    const ticketColumnAdds = {
        internal_notes: "ALTER TABLE ticket_records ADD COLUMN internal_notes LONGTEXT",
        feedback_rating: "ALTER TABLE ticket_records ADD COLUMN feedback_rating INT DEFAULT NULL",
        feedback_user_id: "ALTER TABLE ticket_records ADD COLUMN feedback_user_id VARCHAR(32) DEFAULT NULL",
        feedback_comment: "ALTER TABLE ticket_records ADD COLUMN feedback_comment TEXT",
        feedback_at: "ALTER TABLE ticket_records ADD COLUMN feedback_at BIGINT DEFAULT NULL",
    };
    for (const [column, sql] of Object.entries(ticketColumnAdds)) {
        if (!ticketCols.includes(column)) {
            await pool.query(sql);
        }
    }

    await pool.query(
        "INSERT INTO global_stats (id, total_trolls, total_moves) VALUES (1, 0, 0) ON DUPLICATE KEY UPDATE id = id"
    );

    // Discord server backups
    await pool.query(`
        CREATE TABLE IF NOT EXISTS discord_backups (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            guild_id VARCHAR(32) NOT NULL,
            name VARCHAR(255) NOT NULL,
            created_by VARCHAR(32) DEFAULT NULL,
            created_at BIGINT NOT NULL,
            stats JSON,
            backup_mode VARCHAR(16) NOT NULL DEFAULT 'full',
            parent_backup_id BIGINT DEFAULT NULL,
            INDEX idx_backup_guild (guild_id),
            INDEX idx_backup_guild_time (guild_id, created_at)
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS discord_backup_sections (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            backup_id BIGINT NOT NULL,
            section VARCHAR(64) NOT NULL,
            data LONGTEXT NOT NULL,
            data_hash VARCHAR(64) DEFAULT NULL,
            INDEX idx_section_backup (backup_id),
            INDEX idx_section_lookup (backup_id, section)
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS discord_restore_jobs (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            backup_id BIGINT NOT NULL,
            target_guild_id VARCHAR(32) NOT NULL,
            status ENUM('running','done','failed') DEFAULT 'running',
            phase VARCHAR(128) DEFAULT NULL,
            progress_current INT DEFAULT 0,
            progress_total INT DEFAULT 0,
            log TEXT,
            result JSON,
            started_at BIGINT NOT NULL,
            finished_at BIGINT DEFAULT NULL,
            INDEX idx_restore_guild (target_guild_id),
            INDEX idx_restore_backup (backup_id)
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS discord_backup_jobs (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            guild_id VARCHAR(32) NOT NULL,
            status ENUM('running','done','failed') DEFAULT 'running',
            phase VARCHAR(128) DEFAULT NULL,
            progress_current INT DEFAULT 0,
            progress_total INT DEFAULT 0,
            log TEXT,
            result JSON,
            started_at BIGINT NOT NULL,
            finished_at BIGINT DEFAULT NULL,
            INDEX idx_backup_jobs_guild (guild_id),
            INDEX idx_backup_jobs_status (status)
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS discord_backup_schedules (
            guild_id VARCHAR(32) PRIMARY KEY,
            enabled TINYINT(1) NOT NULL DEFAULT 0,
            interval_hours INT NOT NULL DEFAULT 24,
            retention_count INT NOT NULL DEFAULT 10,
            backup_mode VARCHAR(16) NOT NULL DEFAULT 'full',
            next_run_at BIGINT DEFAULT NULL,
            last_run_at BIGINT DEFAULT NULL,
            last_job_id BIGINT DEFAULT NULL,
            created_by VARCHAR(32) DEFAULT NULL,
            updated_at BIGINT NOT NULL,
            INDEX idx_backup_schedules_enabled_next (enabled, next_run_at)
        )
    `);

    // Backfill columns for existing installs
    const [restoreColsRows] = await pool.query('SHOW COLUMNS FROM discord_restore_jobs');
    const restoreCols = restoreColsRows.map(r => r.Field);
    const restoreColumnAdds = {
        phase: "ALTER TABLE discord_restore_jobs ADD COLUMN phase VARCHAR(128) DEFAULT NULL",
        progress_current: "ALTER TABLE discord_restore_jobs ADD COLUMN progress_current INT DEFAULT 0",
        progress_total: "ALTER TABLE discord_restore_jobs ADD COLUMN progress_total INT DEFAULT 0",
    };
    for (const [column, sql] of Object.entries(restoreColumnAdds)) {
        if (!restoreCols.includes(column)) {
            await pool.query(sql);
        }
    }

    const [backupJobColsRows] = await pool.query('SHOW COLUMNS FROM discord_backup_jobs');
    const backupJobCols = backupJobColsRows.map(r => r.Field);
    const backupJobColumnAdds = {
        phase: "ALTER TABLE discord_backup_jobs ADD COLUMN phase VARCHAR(128) DEFAULT NULL",
        progress_current: "ALTER TABLE discord_backup_jobs ADD COLUMN progress_current INT DEFAULT 0",
        progress_total: "ALTER TABLE discord_backup_jobs ADD COLUMN progress_total INT DEFAULT 0",
    };
    for (const [column, sql] of Object.entries(backupJobColumnAdds)) {
        if (!backupJobCols.includes(column)) {
            await pool.query(sql);
        }
    }

    const [backupColsRows] = await pool.query('SHOW COLUMNS FROM discord_backups');
    const backupCols = backupColsRows.map(r => r.Field);
    const backupColumnAdds = {
        backup_mode: "ALTER TABLE discord_backups ADD COLUMN backup_mode VARCHAR(16) NOT NULL DEFAULT 'full'",
        parent_backup_id: "ALTER TABLE discord_backups ADD COLUMN parent_backup_id BIGINT DEFAULT NULL",
    };
    for (const [column, sql] of Object.entries(backupColumnAdds)) {
        if (!backupCols.includes(column)) {
            await pool.query(sql).catch(() => {});
        }
    }

    const [backupSectionColsRows] = await pool.query('SHOW COLUMNS FROM discord_backup_sections');
    const backupSectionCols = backupSectionColsRows.map(r => r.Field);
    if (!backupSectionCols.includes('data_hash')) {
        await pool.query("ALTER TABLE discord_backup_sections ADD COLUMN data_hash VARCHAR(64) DEFAULT NULL").catch(() => {});
    }

    const [scheduleColsRows] = await pool.query('SHOW COLUMNS FROM discord_backup_schedules');
    const scheduleCols = scheduleColsRows.map(r => r.Field);
    const scheduleColumnAdds = {
        interval_hours: "ALTER TABLE discord_backup_schedules ADD COLUMN interval_hours INT NOT NULL DEFAULT 24",
        retention_count: "ALTER TABLE discord_backup_schedules ADD COLUMN retention_count INT NOT NULL DEFAULT 10",
        backup_mode: "ALTER TABLE discord_backup_schedules ADD COLUMN backup_mode VARCHAR(16) NOT NULL DEFAULT 'full'",
        next_run_at: "ALTER TABLE discord_backup_schedules ADD COLUMN next_run_at BIGINT DEFAULT NULL",
        last_run_at: "ALTER TABLE discord_backup_schedules ADD COLUMN last_run_at BIGINT DEFAULT NULL",
        last_job_id: "ALTER TABLE discord_backup_schedules ADD COLUMN last_job_id BIGINT DEFAULT NULL",
        created_by: "ALTER TABLE discord_backup_schedules ADD COLUMN created_by VARCHAR(32) DEFAULT NULL",
        updated_at: "ALTER TABLE discord_backup_schedules ADD COLUMN updated_at BIGINT NOT NULL DEFAULT 0",
    };
    for (const [column, sql] of Object.entries(scheduleColumnAdds)) {
        if (!scheduleCols.includes(column)) {
            await pool.query(sql).catch(() => {});
        }
    }

    return pool;
}

function getPool() {
    if (!pool) throw new Error("DB not initialized");
    return pool;
}

function readPoolStats() {
    if (!pool) return null;
    const inner = pool.pool || pool;
    const all = inner?._allConnections || inner?.allConnections || inner?._all || [];
    const free = inner?._freeConnections || inner?.freeConnections || inner?._free || [];
    const queue = inner?._connectionQueue || inner?.connectionQueue || inner?._queue || [];

    const toCount = (val) => Array.isArray(val) ? val.length : (typeof val === "number" ? val : null);

    return {
        total: toCount(all),
        free: toCount(free),
        queued: toCount(queue)
    };
}

async function getDbStatus() {
    if (!pool) throw new Error("DB not initialized");
    const start = Date.now();
    try {
        await pool.query("SELECT 1");
        lastDbPingMs = Date.now() - start;
        lastDbPingAt = Date.now();
        return {
            ok: true,
            pingMs: lastDbPingMs,
            lastPingAt: lastDbPingAt,
            pool: readPoolStats()
        };
    } catch (error) {
        return {
            ok: false,
            error: error?.message || String(error),
            pingMs: null,
            lastPingAt: lastDbPingAt,
            pool: readPoolStats()
        };
    }
}

module.exports = {
    initDb,
    getPool,
    getDbStatus
};
