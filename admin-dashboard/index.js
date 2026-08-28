'use strict';
require('dotenv').config();

const express = require('express');
const compression = require('compression');
const session = require('express-session');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3021;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'https://admin.eselbande.com/auth/callback';
const SESSION_SECRET = process.env.SESSION_SECRET || 'changeme';
if (SESSION_SECRET === 'changeme' && process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set in production. Refusing to start.');
}
// Nur dieser eine Discord-Account darf rein - kein Nutzerkonzept, keine
// Datenbank, das Dashboard ist bewusst fuer genau eine Person gebaut.
const OWNER_DISCORD_ID = process.env.OWNER_DISCORD_ID;
if (!OWNER_DISCORD_ID) {
    throw new Error('OWNER_DISCORD_ID must be set. Refusing to start.');
}
const STATS_PATH = process.env.STATS_PATH || path.join(__dirname, 'stats', 'admin-stats.json');

// ── Log-Aufnahme (ersetzt die Discord-Log-Kanaele des Fahrstuhl-Bots) ────────
// Shared-Secret statt Discord-Login: die Quelle ist ein Bot-Prozess, kein
// Mensch im Browser. Ohne gesetztes LOG_INGEST_TOKEN bleibt die Aufnahme
// abgeschaltet - lieber kein Log-Empfang als ein offener Schreibzugriff.
const LOG_INGEST_TOKEN = process.env.LOG_INGEST_TOKEN || '';
const LOG_DATA_DIR = process.env.LOG_DATA_DIR || path.join(__dirname, 'data');
const LOG_MAX_ROWS = 20000;
const LOG_MAX_AGE_DAYS = 60;

fs.mkdirSync(LOG_DATA_DIR, { recursive: true });
const logDb = new Database(path.join(LOG_DATA_DIR, 'logs.db'));
logDb.pragma('journal_mode = WAL');
logDb.exec(`
CREATE TABLE IF NOT EXISTS logs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    source       TEXT NOT NULL DEFAULT 'fahrstuhl',
    type         TEXT NOT NULL DEFAULT 'SYSTEM',
    title        TEXT,
    description  TEXT,
    color        INTEGER,
    fields_json  TEXT,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_logs_type_time ON logs(type, created_at);
CREATE INDEX IF NOT EXISTS idx_logs_time      ON logs(created_at);
`);

const insertLogStmt = logDb.prepare(`
    INSERT INTO logs (source, type, title, description, color, fields_json)
    VALUES (@source, @type, @title, @description, @color, @fields_json)
`);
const pruneOldStmt = logDb.prepare(`DELETE FROM logs WHERE created_at < datetime('now', ?)`);
const pruneExcessStmt = logDb.prepare(`
    DELETE FROM logs WHERE id IN (
        SELECT id FROM logs ORDER BY id DESC LIMIT -1 OFFSET ?
    )
`);
let _logInsertCount = 0;

function insertLog(entry) {
    insertLogStmt.run({
        source: String(entry.source || 'fahrstuhl').slice(0, 40),
        type: String(entry.type || 'SYSTEM').toUpperCase().slice(0, 40),
        title: entry.title ? String(entry.title).slice(0, 256) : null,
        description: entry.description ? String(entry.description).slice(0, 4096) : null,
        color: Number.isFinite(entry.color) ? entry.color : null,
        fields_json: Array.isArray(entry.fields) && entry.fields.length
            ? JSON.stringify(entry.fields.slice(0, 25))
            : null,
    });
    // Aufraeumen nicht bei jedem Insert - waere bei Log-Traffic unnoetig teuer.
    if (++_logInsertCount % 200 === 0) {
        pruneOldStmt.run(`-${LOG_MAX_AGE_DAYS} days`);
        pruneExcessStmt.run(LOG_MAX_ROWS);
    }
}

function timingSafeTokenEqual(a, b) {
    const bufA = Buffer.from(String(a || ''));
    const bufB = Buffer.from(String(b || ''));
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

function requireLogToken(req, res, next) {
    if (!LOG_INGEST_TOKEN) return res.status(503).json({ error: 'Log-Aufnahme ist nicht konfiguriert' });
    const sent = req.get('X-Log-Token') || '';
    if (!timingSafeTokenEqual(sent, LOG_INGEST_TOKEN)) return res.status(403).json({ error: 'Forbidden' });
    next();
}

// ── Redis-ready session store (gleiches Muster wie im Filehoster) ────────────
let _sessionStoreType = 'memory';
function buildSessionStore() {
    const REDIS_URL = process.env.REDIS_URL;
    if (!REDIS_URL) {
        console.log('[session] No REDIS_URL — using in-memory MemoryStore');
        return undefined;
    }
    let Redis, RedisStoreFactory;
    try {
        Redis = require('ioredis');
        RedisStoreFactory = require('connect-redis')(session);
    } catch {
        console.warn('[session] ioredis/connect-redis not installed — falling back to memory store.');
        return undefined;
    }
    try {
        const client = new Redis(REDIS_URL, {
            lazyConnect: false, maxRetriesPerRequest: 3,
            connectTimeout: 5000, enableReadyCheck: true,
        });
        client.on('connect', () => { _sessionStoreType = 'redis'; console.log('[session] Redis connected'); });
        client.on('error', err => { _sessionStoreType = 'redis-degraded'; console.warn('[session] Redis error:', err.message); });
        return new RedisStoreFactory({ client, prefix: 'sess:admindash:', ttl: 7 * 24 * 60 * 60 });
    } catch (err) {
        console.warn('[session] Redis store init failed:', err.message);
        return undefined;
    }
}

const app = express();
app.set('trust proxy', 1);

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
});
app.use(compression());
app.use(express.json({ limit: '256kb' }));
app.use(session({
    store: buildSessionStore(),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
    },
}));
app.use(express.static(path.join(__dirname, 'public')));

// ── Rate limiting für die Auth-Routen ─────────────────────────────────────────
const _rl = new Map();
function authLimiter(req, res, next) {
    const key = req.ip;
    const now = Date.now();
    const e = _rl.get(key) || { count: 0, reset: now + 60_000 };
    if (now > e.reset) { e.count = 0; e.reset = now + 60_000; }
    if (++e.count > 20) return res.status(429).send('Zu viele Versuche. Bitte kurz warten.');
    _rl.set(key, e);
    next();
}

function requireOwner(req, res, next) {
    if (req.session.user && req.session.user.id === OWNER_DISCORD_ID) return next();
    res.status(403).send('Kein Zugriff.');
}

// ── Auth ──────────────────────────────────────────────────────────────────────
app.get('/auth/login', (req, res) => {
    const params = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        redirect_uri: DISCORD_REDIRECT_URI,
        response_type: 'code',
        scope: 'identify',
    });
    res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

app.get('/auth/callback', authLimiter, async (req, res) => {
    const { code } = req.query;
    if (!code || typeof code !== 'string') return res.redirect('/?error=missing_code');
    try {
        const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: DISCORD_CLIENT_ID,
                client_secret: DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
                redirect_uri: DISCORD_REDIRECT_URI,
            }),
        });
        if (!tokenRes.ok) throw new Error(`Token exchange: ${tokenRes.status}`);
        const tokenData = await tokenRes.json();

        const userRes = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        if (!userRes.ok) throw new Error(`Discord user: ${userRes.status}`);
        const du = await userRes.json();

        if (String(du.id) !== OWNER_DISCORD_ID) {
            console.warn(`[AUTH] Zugriff verweigert für Discord-ID ${du.id} (${du.username})`);
            return res.status(403).send('Dieser Account hat keinen Zugriff auf admin.eselbande.com.');
        }

        req.session.user = { id: String(du.id), username: du.username, avatar: du.avatar };
        res.redirect('/');
    } catch (err) {
        console.error('[AUTH]', err.message);
        res.redirect('/?error=auth_failed');
    }
});

app.get('/auth/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

app.get('/api/me', (req, res) => {
    res.json({ loggedIn: !!(req.session.user && req.session.user.id === OWNER_DISCORD_ID), user: req.session.user || null });
});

// ── Stats ─────────────────────────────────────────────────────────────────────
app.get('/api/stats', requireOwner, (req, res) => {
    try {
        const raw = fs.readFileSync(STATS_PATH, 'utf8');
        res.type('application/json').send(raw);
    } catch (err) {
        res.status(503).json({ error: 'Noch keine Daten gesammelt', detail: err.code });
    }
});

// ── Logs ──────────────────────────────────────────────────────────────────────
// Ersetzt die frueheren Discord-Log-Kanaele (#commands, #trolls, #guilds,
// #errors, #system) des Fahrstuhl-Bots. Jede Quelle (der Bot, spaeter
// vielleicht weitere Dienste) schickt Eintraege hierher statt nach Discord.
app.post('/api/logs/ingest', requireLogToken, (req, res) => {
    const body = req.body || {};
    if (!body.title && !body.description) {
        return res.status(400).json({ error: 'title oder description erforderlich' });
    }
    try {
        insertLog(body);
        res.status(201).json({ success: true });
    } catch (err) {
        console.error('[logs] insert failed:', err.message);
        res.status(500).json({ error: 'Insert fehlgeschlagen' });
    }
});

app.get('/api/logs', requireOwner, (req, res) => {
    const type = String(req.query.type || '').toUpperCase().trim();
    const beforeId = Number(req.query.before) || null;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));

    let sql = 'SELECT * FROM logs';
    const where = [];
    const params = {};
    if (type && type !== 'ALL') { where.push('type = @type'); params.type = type; }
    if (beforeId) { where.push('id < @beforeId'); params.beforeId = beforeId; }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY id DESC LIMIT @limit';
    params.limit = limit;

    try {
        const rows = logDb.prepare(sql).all(params).map(r => ({
            ...r,
            fields: r.fields_json ? JSON.parse(r.fields_json) : null,
            fields_json: undefined,
        }));
        res.json({ logs: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/logs/types', requireOwner, (req, res) => {
    const rows = logDb.prepare('SELECT type, COUNT(*) AS count FROM logs GROUP BY type ORDER BY count DESC').all();
    res.json({ types: rows });
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'admin-dashboard', uptime: process.uptime(), session_store: _sessionStoreType }));

app.use((req, res) => res.status(404).send('Nicht gefunden'));

app.listen(PORT, () => console.log(`[admin.eselbande.com] Running on port ${PORT}`));
