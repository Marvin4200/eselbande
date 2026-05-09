const fs = require("fs");
const path = require("path");

class AuditLogger {
    constructor(logDir = "logs/audit") {
        this.logDir = logDir;
        this.ensureDir(logDir);
        this.currentDate = this._getCurrentDate();
        this.buffer = [];
        this.bufferSize = 10;
        this.flushInterval = setInterval(() => this.flush(), 10000);
    }

    logCommand(interaction, details = {}) {
        const entry = {
            timestamp: new Date().toISOString(),
            userId: interaction.user.id,
            userName: interaction.user.tag,
            guildId: interaction.guild.id,
            guildName: interaction.guild.name,
            commandName: interaction.commandName,
            options: this._sanitizeOptions(interaction.options._hoistedOptions),
            ...details
        };

        this.buffer.push(entry);
        if (this.buffer.length >= this.bufferSize) {
            this.flush();
        }

        return entry;
    }

    logTrollAction(guildId, userId, action, targetUserId = null, details = {}) {
        const entry = {
            timestamp: new Date().toISOString(),
            type: 'troll_action',
            guildId,
            userId,
            action,
            targetUserId,
            ...details
        };

        this.buffer.push(entry);
        if (this.buffer.length >= this.bufferSize) {
            this.flush();
        }

        return entry;
    }

    logError(context, error, details = {}) {
        const entry = {
            timestamp: new Date().toISOString(),
            type: 'error',
            context,
            error: {
                message: error.message,
                code: error.code,
                stack: error.stack
            },
            ...details
        };

        this.buffer.push(entry);
        this.flush();

        return entry;
    }

    flush() {
        if (this.buffer.length === 0) return;

        const date = this._getCurrentDate();
        if (date !== this.currentDate) {
            this.currentDate = date;
        }

        const logFile = path.join(this.logDir, `audit-${this.currentDate}.jsonl`);

        try {
            const content = this.buffer.map(entry => JSON.stringify(entry)).join('\n') + '\n';
            fs.appendFileSync(logFile, content);
            this.buffer = [];
        } catch (err) {
            console.error("Failed to flush audit logs:", err);
        }
    }

    stop() {
        clearInterval(this.flushInterval);
        this.flush();
    }

    ensureDir(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    _getCurrentDate() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    _sanitizeOptions(options) {
        if (!Array.isArray(options)) return [];
        return options.map(opt => ({
            name: opt.name,
            type: opt.type,
            value: typeof opt.value === 'object' ? opt.value.id : opt.value
        }));
    }

    queryLogs(filter = {}, limit = 100) {
        const { userId, guildId, commandName, startDate, endDate } = filter;
        const results = [];

        try {
            const files = fs.readdirSync(this.logDir)
                .filter(f => f.startsWith('audit-'))
                .sort()
                .reverse();

            for (const file of files) {
                const filePath = path.join(this.logDir, file);
                const content = fs.readFileSync(filePath, 'utf8');
                const lines = content.trim().split('\n');

                for (const line of lines) {
                    if (!line) continue;

                    try {
                        const entry = JSON.parse(line);

                        if (userId && entry.userId !== userId) continue;
                        if (guildId && entry.guildId !== guildId) continue;
                        if (commandName && entry.commandName !== commandName) continue;

                        results.push(entry);
                        if (results.length >= limit) break;
                    } catch (e) {
                        // Skip malformed lines
                    }
                }

                if (results.length >= limit) break;
            }
        } catch (err) {
            console.error("Failed to query audit logs:", err);
        }

        return results;
    }
}

module.exports = AuditLogger;
