'use strict';
require('dotenv').config();

const express = require('express');
const compression = require('compression');
const session = require('express-session');
const fs = require('fs');
const path = require('path');

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

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'admin-dashboard', uptime: process.uptime(), session_store: _sessionStoreType }));

app.use((req, res) => res.status(404).send('Nicht gefunden'));

app.listen(PORT, () => console.log(`[admin.eselbande.com] Running on port ${PORT}`));
