const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../data');
const auditFile = path.join(dataDir, 'dashboard-audit.jsonl');
const MAX_ENTRY_BODY_LENGTH = 1200;

function ensureDataDir() {
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
}

function redact(value) {
    if (!value || typeof value !== 'object') return value;
    const clone = Array.isArray(value) ? [] : {};
    for (const [key, item] of Object.entries(value)) {
        if (/token|secret|password|auth|key/i.test(key)) {
            clone[key] = '[redacted]';
        } else if (item && typeof item === 'object') {
            clone[key] = redact(item);
        } else {
            clone[key] = item;
        }
    }
    return clone;
}

function record(entry) {
    ensureDataDir();
    const safeEntry = {
        timestamp: new Date().toISOString(),
        ...entry,
    };

    if (safeEntry.body) {
        const body = JSON.stringify(redact(safeEntry.body));
        safeEntry.body = body.length > MAX_ENTRY_BODY_LENGTH
            ? `${body.slice(0, MAX_ENTRY_BODY_LENGTH)}...`
            : JSON.parse(body);
    }

    fs.appendFileSync(auditFile, JSON.stringify(safeEntry) + '\n', 'utf8');
}

function list({ limit = 100, query = '' } = {}) {
    ensureDataDir();
    if (!fs.existsSync(auditFile)) return [];

    const normalizedLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 1000);
    const needle = String(query || '').trim().toLowerCase();
    const lines = fs.readFileSync(auditFile, 'utf8').trim().split('\n').filter(Boolean);
    const entries = [];

    for (let i = lines.length - 1; i >= 0 && entries.length < normalizedLimit; i--) {
        try {
            const entry = JSON.parse(lines[i]);
            if (needle && !JSON.stringify(entry).toLowerCase().includes(needle)) continue;
            entries.push(entry);
        } catch (_) {
            // Skip corrupt partial lines instead of breaking the dashboard.
        }
    }

    return entries;
}

module.exports = {
    record,
    list,
};
