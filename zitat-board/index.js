'use strict';
require('dotenv').config();

const express = require('express');
const compression = require('compression');
const session = require('express-session');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const PORT                 = process.env.PORT || 3013;
const DISCORD_CLIENT_ID    = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET= process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'https://quotes.eselbande.com/auth/callback';
const SESSION_SECRET       = process.env.SESSION_SECRET || 'change-me-in-production';
if (SESSION_SECRET === 'change-me-in-production' && process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set in production. Refusing to start.');
}
const MAX_QUOTE_LENGTH     = 500;
const MAX_QUOTES_PER_USER  = 200;

const DB_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, 'quotes.db'));
db.pragma('journal_mode = WAL');
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        discord_id  TEXT UNIQUE NOT NULL,
        username    TEXT NOT NULL,
        avatar      TEXT
    );
    CREATE TABLE IF NOT EXISTS quotes (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        text            TEXT NOT NULL,
        attributed_to   TEXT,
        submitted_by    INTEGER NOT NULL REFERENCES users(id),
        created_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS votes (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        quote_id    INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
        user_id     INTEGER NOT NULL REFERENCES users(id),
        value       INTEGER NOT NULL CHECK(value IN (1, -1)),
        UNIQUE(quote_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_votes_quote ON votes(quote_id);
    CREATE INDEX IF NOT EXISTS idx_quotes_created ON quotes(created_at);
`);

// ── Redis-ready session store ─────────────────────────────────────────────────
// Optional env vars:
//   REDIS_URL=redis://127.0.0.1:6379  — enables Redis-backed sessions
//   REDIS_REQUIRED=true               — crash instead of falling back to memory
// Without REDIS_URL the default in-memory MemoryStore is used.
// MemoryStore is per-process and lost on restart — not safe for PM2 cluster mode.
let _sessionStoreType = 'memory';

function buildSessionStore() {
    const REDIS_URL = process.env.REDIS_URL;
    if (!REDIS_URL) {
        console.log('[session] No REDIS_URL — using in-memory MemoryStore (not cluster-safe)');
        return undefined; // express-session defaults to MemoryStore
    }
    let Redis, RedisStoreFactory;
    try {
        Redis = require('ioredis');
        RedisStoreFactory = require('connect-redis')(session);
    } catch {
        const warn = '[session] REDIS_URL set but ioredis/connect-redis not installed — run: npm install  Falling back to memory store.';
        console.warn(warn);
        if (process.env.REDIS_REQUIRED === 'true') throw new Error(warn);
        return undefined;
    }
    try {
        const client = new Redis(REDIS_URL, {
            lazyConnect: false,
            maxRetriesPerRequest: 3,
            connectTimeout: 5000,
            enableReadyCheck: true,
        });
        client.on('connect', () => {
            _sessionStoreType = 'redis';
            console.log('[session] Redis connected — sessions backed by Redis');
        });
        client.on('error', err => {
            _sessionStoreType = 'redis-degraded';
            console.warn('[session] Redis error:', err.message);
        });
        _sessionStoreType = 'redis-connecting';
        return new RedisStoreFactory({ client, prefix: 'sess:zitatboard:', ttl: 30 * 24 * 60 * 60 });
    } catch (err) {
        const warn = `[session] Redis store init failed: ${err.message} — falling back to memory`;
        console.warn(warn);
        if (process.env.REDIS_REQUIRED === 'true') throw err;
        return undefined;
    }
}

// ── App ───────────────────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1);
app.use(express.json());

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('Content-Security-Policy',
            "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://cdn.discordapp.com; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'");
    next();
});
app.use(compression());

app.use(session({
    store: buildSessionStore(),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 },
}));
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
    next();
}

// ── Rate limiting (in-memory, per-process) ────────────────────────────────────
// NOTE: Resets on restart and is not shared across PM2 cluster workers.
// TODO: Replace with rate-limiter-flexible + ioredis for cluster-safe limiting.
const _rlStore = new Map();
const _rlCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of _rlStore) if (now > v.reset + 60_000) _rlStore.delete(k);
}, 5 * 60_000);
_rlCleanupInterval.unref();

function createRateLimiter(max, windowMs) {
    return (req, res, next) => {
        const key = req.ip;
        const now = Date.now();
        const e = _rlStore.get(key) || { count: 0, reset: now + windowMs };
        if (now > e.reset) { e.count = 0; e.reset = now + windowMs; }
        if (++e.count > max) {
            res.setHeader('Retry-After', Math.ceil((e.reset - now) / 1000));
            return res.status(429).json({ error: 'Zu viele Anfragen. Bitte warte kurz.' });
        }
        _rlStore.set(key, e);
        next();
    };
}
const authLimiter = createRateLimiter(20, 60_000);  // 20 auth attempts / min
const writeLimiter = createRateLimiter(30, 60_000); // 30 write ops / min

// ── Discord OAuth ─────────────────────────────────────────────────────────────
app.get('/auth/login', (req, res) => {
    const url = new URL('https://discord.com/api/oauth2/authorize');
    url.searchParams.set('client_id', DISCORD_CLIENT_ID);
    url.searchParams.set('redirect_uri', DISCORD_REDIRECT_URI);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'identify');
    res.redirect(url.toString());
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
        if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status}`);
        const tokenData = await tokenRes.json();

        const userRes = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        if (!userRes.ok) throw new Error(`Discord user fetch failed: ${userRes.status}`);
        const du = await userRes.json();

        db.prepare(`
            INSERT INTO users (discord_id, username, avatar)
            VALUES (?, ?, ?)
            ON CONFLICT(discord_id) DO UPDATE SET username = excluded.username, avatar = excluded.avatar
        `).run(String(du.id), String(du.username), du.avatar ?? null);

        const user = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(String(du.id));
        req.session.user = { id: user.id, discordId: du.id, username: du.username, avatar: du.avatar };
        res.redirect('/');
    } catch (err) {
        console.error('[AUTH] OAuth error:', err.message);
        res.redirect('/?error=auth_failed');
    }
});

app.get('/auth/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

app.get('/api/me', (req, res) => {
    res.json(req.session.user || null);
});

// ── Quotes API ────────────────────────────────────────────────────────────────
const SORT_OPTS = { top: 'score DESC, q.created_at DESC', new: 'q.created_at DESC' };

app.get('/api/quotes', (req, res) => {
    const sort = SORT_OPTS[req.query.sort] || SORT_OPTS.top;
    const userId = req.session.user?.id ?? null;

    const quotes = db.prepare(`
        SELECT
            q.id, q.text, q.attributed_to, q.created_at,
            u.username AS author, u.avatar AS author_avatar,
            COALESCE(SUM(CASE WHEN v.value = 1 THEN 1 ELSE 0 END), 0) AS upvotes,
            COALESCE(SUM(CASE WHEN v.value = -1 THEN 1 ELSE 0 END), 0) AS downvotes,
            COALESCE(SUM(v.value), 0) AS score,
            MAX(CASE WHEN v.user_id = ? THEN v.value ELSE NULL END) AS my_vote,
            q.submitted_by
        FROM quotes q
        JOIN users u ON u.id = q.submitted_by
        LEFT JOIN votes v ON v.quote_id = q.id
        GROUP BY q.id
        ORDER BY ${sort}
        LIMIT 200
    `).all(userId);

    res.json(quotes);
});

app.post('/api/quotes', writeLimiter, requireAuth, (req, res) => {
    const text = String(req.body.text || '').trim();
    const attributed_to = req.body.attributed_to ? String(req.body.attributed_to).trim() : null;

    if (!text || text.length < 3) return res.status(400).json({ error: 'Zitat zu kurz (min. 3 Zeichen)' });
    if (text.length > MAX_QUOTE_LENGTH) return res.status(400).json({ error: `Zitat zu lang (max. ${MAX_QUOTE_LENGTH} Zeichen)` });
    if (attributed_to && attributed_to.length > 100) return res.status(400).json({ error: 'Zuschreibung zu lang' });

    const count = db.prepare('SELECT COUNT(*) AS c FROM quotes WHERE submitted_by = ?').get(req.session.user.id).c;
    if (count >= MAX_QUOTES_PER_USER) return res.status(429).json({ error: `Limit erreicht (max. ${MAX_QUOTES_PER_USER} Zitate)` });

    const result = db.prepare('INSERT INTO quotes (text, attributed_to, submitted_by) VALUES (?, ?, ?)').run(text, attributed_to, req.session.user.id);
    res.status(201).json({ id: result.lastInsertRowid });
});

app.post('/api/quotes/:id/vote', writeLimiter, requireAuth, (req, res) => {
    const quoteId = parseInt(req.params.id, 10);
    const value = parseInt(req.body.value, 10);
    if (![1, -1].includes(value)) return res.status(400).json({ error: 'Ungültige Stimme' });

    const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId);
    if (!quote) return res.status(404).json({ error: 'Zitat nicht gefunden' });

    const existing = db.prepare('SELECT * FROM votes WHERE quote_id = ? AND user_id = ?').get(quoteId, req.session.user.id);
    if (existing) {
        if (existing.value === value) {
            db.prepare('DELETE FROM votes WHERE id = ?').run(existing.id);
        } else {
            db.prepare('UPDATE votes SET value = ? WHERE id = ?').run(value, existing.id);
        }
    } else {
        db.prepare('INSERT INTO votes (quote_id, user_id, value) VALUES (?, ?, ?)').run(quoteId, req.session.user.id, value);
    }

    const row = db.prepare(`
        SELECT COALESCE(SUM(CASE WHEN value=1 THEN 1 ELSE 0 END),0) AS upvotes,
               COALESCE(SUM(CASE WHEN value=-1 THEN 1 ELSE 0 END),0) AS downvotes,
               COALESCE(SUM(value),0) AS score,
               MAX(CASE WHEN user_id=? THEN value ELSE NULL END) AS my_vote
        FROM votes WHERE quote_id=?
    `).get(req.session.user.id, quoteId);
    res.json(row);
});

app.delete('/api/quotes/:id', requireAuth, (req, res) => {
    const quoteId = parseInt(req.params.id, 10);
    const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId);
    if (!quote) return res.status(404).json({ error: 'Zitat nicht gefunden' });
    if (quote.submitted_by !== req.session.user.id) return res.status(403).json({ error: 'Keine Berechtigung' });
    db.prepare('DELETE FROM quotes WHERE id = ?').run(quoteId);
    res.json({ ok: true });
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'zitat-board', uptime: process.uptime(), session_store: _sessionStoreType }));
// ── 404 & Error handlers ─────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Nicht gefunden', path: req.path }));
app.use((err, req, res, next) => {
    console.error('[ERROR]', err.message);
    res.status(500).json({ error: 'Interner Serverfehler' });
});

const server = app.listen(PORT, () => console.log(`[quotes.eselbande.com] Running on port ${PORT}`));

function shutdown(signal) {
    console.log(`[SHUTDOWN] ${signal} received`);
    server.close(() => {
        try { db.close(); } catch (_) { }
        process.exit(0);
    });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
