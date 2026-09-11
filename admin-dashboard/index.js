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

// ── Zugriffsverwaltung ────────────────────────────────────────────────────────
// Bislang durfte NUR OWNER_DISCORD_ID rein -- jetzt kann der Owner weitere Discord-Accounts mit
// eingeschraenkten Rechten freischalten: "viewer" (nur lesen: Stats/Logs/Nutzer-Suche ansehen,
// keine Aktionen) oder "admin" (alles ausser Zugriffsverwaltung selbst -- Container steuern,
// Limits/Premium setzen). Der Owner selbst bleibt IMMER hart auf OWNER_DISCORD_ID verdrahtet
// (kein DB-Eintrag noetig, kann nicht versehentlich sich selbst aussperren).
logDb.exec(`
CREATE TABLE IF NOT EXISTS dashboard_admins (
    discord_id  TEXT PRIMARY KEY,
    username    TEXT,
    role        TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
    added_by    TEXT NOT NULL,
    added_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`);

const ROLE_LEVEL = { viewer: 1, admin: 2, owner: 3 };

function getRole(discordId) {
    if (discordId === OWNER_DISCORD_ID) return 'owner';
    const row = logDb.prepare('SELECT role FROM dashboard_admins WHERE discord_id = ?').get(discordId);
    return row ? row.role : null;
}

function requireRole(minRole) {
    const minLevel = ROLE_LEVEL[minRole];
    return (req, res, next) => {
        const id = req.session.user && req.session.user.id;
        const role = id ? getRole(id) : null;
        if (role && ROLE_LEVEL[role] >= minLevel) { req.dashboardRole = role; return next(); }
        res.status(403).json({ error: 'Kein Zugriff.' });
    };
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

        const role = getRole(String(du.id));
        if (!role) {
            console.warn(`[AUTH] Zugriff verweigert für Discord-ID ${du.id} (${du.username})`);
            return res.status(403).send('Dieser Account hat keinen Zugriff auf admin.eselbande.com.');
        }
        if (role !== 'owner') {
            logDb.prepare('UPDATE dashboard_admins SET username = ? WHERE discord_id = ?').run(du.username, String(du.id));
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
    const role = req.session.user ? getRole(req.session.user.id) : null;
    res.json({ loggedIn: !!role, user: req.session.user || null, role });
});

// ── Zugriffsverwaltung (nur Owner) ──────────────────────────────────────────────
app.get('/api/admins', requireOwner, (req, res) => {
    const rows = logDb.prepare('SELECT discord_id, username, role, added_by, added_at FROM dashboard_admins ORDER BY added_at DESC').all();
    res.json({ admins: rows });
});

app.post('/api/admins', requireOwner, (req, res) => {
    const discordId = String((req.body || {}).discordId || '').trim();
    const role = (req.body || {}).role === 'admin' ? 'admin' : 'viewer';
    if (!/^\d{5,25}$/.test(discordId)) return res.status(400).json({ error: 'Ungültige Discord-ID.' });
    if (discordId === OWNER_DISCORD_ID) return res.status(400).json({ error: 'Das bist du bereits (Owner).' });

    // Username ist anfangs unbekannt (wir fragen dafuer keine Discord-API ab) -- wird beim
    // ersten Login der Person automatisch nachgetragen, siehe /auth/callback.
    logDb.prepare(
        `INSERT INTO dashboard_admins (discord_id, username, role, added_by) VALUES (?, NULL, ?, ?)
         ON CONFLICT(discord_id) DO UPDATE SET role = excluded.role`
    ).run(discordId, role, req.session.user.id);

    res.json({ success: true });
});

app.delete('/api/admins/:discordId', requireOwner, (req, res) => {
    logDb.prepare('DELETE FROM dashboard_admins WHERE discord_id = ?').run(req.params.discordId);
    res.json({ success: true });
});

// ── Stats ─────────────────────────────────────────────────────────────────────
app.get('/api/stats', requireRole('viewer'), (req, res) => {
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

app.get('/api/logs', requireRole('viewer'), (req, res) => {
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

// Zaehlt die Meldungen des letzten Tages serverseitig. Die Liste unter
// /api/logs ist bewusst auf 200 Eintraege begrenzt - eine Kennzahl daraus
// waere bei mehr Verkehr schlicht falsch und wuerde bei genau 200 haengen.
app.get('/api/logs/summary', requireRole('viewer'), (req, res) => {
    const stunden = Math.min(168, Math.max(1, Number(req.query.hours) || 24));
    const seit = new Date(Date.now() - stunden * 3600 * 1000).toISOString();
    try {
        const rows = logDb
            .prepare('SELECT type, COUNT(*) AS count FROM logs WHERE created_at >= ? GROUP BY type ORDER BY count DESC')
            .all(seit);
        res.json({
            since: seit,
            hours: stunden,
            total: rows.reduce((summe, r) => summe + r.count, 0),
            byType: rows,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/logs/types', requireRole('viewer'), (req, res) => {
    const rows = logDb.prepare('SELECT type, COUNT(*) AS count FROM logs GROUP BY type ORDER BY count DESC').all();
    res.json({ types: rows });
});

// ── Docker-Steuerung ──────────────────────────────────────────────────────────
// admin-dashboard bekommt NIE den Docker-Socket selbst zu sehen -- Container-Steuerung (Start/
// Stop/Restart/Logs) laeuft stattdessen ueber einen winzigen, separaten "docker-control"-Dienst,
// der ausschliesslich diese drei Aktionen kennt (siehe ../docker-control/index.js) und als
// einziger den Socket gemountet hat. So bleibt der Blast-Radius einer Schwachstelle in DIESEM
// (deutlich groesseren, mehr Abhaengigkeiten habenden) Dashboard-Prozess auf seine eigenen Daten
// beschraenkt, statt sofort vollen Host-Zugriff zu bedeuten.
const DOCKER_CONTROL_BASE = process.env.DOCKER_CONTROL_BASE || 'http://docker-control:3031';
const DOCKER_CONTROL_TOKEN = process.env.DOCKER_CONTROL_TOKEN || '';

async function callDockerControl(path, opts = {}) {
    if (!DOCKER_CONTROL_TOKEN) {
        const err = new Error('DOCKER_CONTROL_TOKEN ist nicht konfiguriert.');
        err.status = 503;
        throw err;
    }
    const res = await fetch(`${DOCKER_CONTROL_BASE}${path}`, {
        ...opts,
        headers: { 'Authorization': `Bearer ${DOCKER_CONTROL_TOKEN}`, ...(opts.headers || {}) },
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const err = new Error(body.error || `docker-control antwortete mit ${res.status}`);
        err.status = res.status;
        throw err;
    }
    return res;
}

app.get('/api/docker/containers', requireRole('viewer'), async (req, res) => {
    try {
        const upstream = await callDockerControl('/containers');
        res.json(await upstream.json());
    } catch (err) {
        res.status(err.status || 502).json({ error: err.message });
    }
});

const DOCKER_ACTIONS = new Set(['start', 'stop', 'restart']);
app.post('/api/docker/containers/:name/:action', requireRole('admin'), async (req, res) => {
    if (!DOCKER_ACTIONS.has(req.params.action)) return res.status(400).json({ error: 'Ungültige Aktion.' });
    try {
        const upstream = await callDockerControl(`/containers/${encodeURIComponent(req.params.name)}/${req.params.action}`, { method: 'POST' });
        res.json(await upstream.json());
    } catch (err) {
        res.status(err.status || 502).json({ error: err.message });
    }
});

app.get('/api/docker/containers/:name/logs', requireRole('viewer'), async (req, res) => {
    const tail = Math.min(2000, Math.max(1, Number(req.query.tail) || 300));
    try {
        const upstream = await callDockerControl(`/containers/${encodeURIComponent(req.params.name)}/logs?tail=${tail}`);
        res.type('text/plain').send(await upstream.text());
    } catch (err) {
        res.status(err.status || 502).json({ error: err.message });
    }
});

// ── EselBuilder / EselFreund ─────────────────────────────────────────────────
// Proxy zu eselbuilders internen, Bearer-Token-geschuetzten API-Routen (siehe
// apps/web/src/app/api/internal/eselfriend/voice-limit/route.ts und .../ai-usage/route.ts) --
// dasselbe "ein vertrauenswuerdiger interner Aufrufer" Muster wie shop.eselbande.com es fuer
// Abo-Aktivierung schon nutzt. Laeuft ueber die oeffentliche HTTPS-Domain statt internem
// Docker-DNS, weil eselbuilder-web in einem eigenen Compose-Netzwerk haengt, nicht in
// marvin_internal.
const ESELBUILDER_API_BASE = process.env.ESELBUILDER_API_BASE || 'https://eselbuilder.eselbande.com';
const ESELBUILDER_ADMIN_TOKEN = process.env.ESELBUILDER_ADMIN_TOKEN || '';

async function callEselbuilder(path, opts = {}) {
    if (!ESELBUILDER_ADMIN_TOKEN) {
        const err = new Error('ESELBUILDER_ADMIN_TOKEN ist nicht konfiguriert.');
        err.status = 503;
        throw err;
    }
    const res = await fetch(`${ESELBUILDER_API_BASE}${path}`, {
        ...opts,
        headers: {
            'Authorization': `Bearer ${ESELBUILDER_ADMIN_TOKEN}`,
            'Content-Type': 'application/json',
            ...(opts.headers || {}),
        },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(body.error || `eselbuilder antwortete mit ${res.status}`);
        err.status = res.status;
        throw err;
    }
    return body;
}

app.get('/api/eselbuilder/ai-usage', requireRole('viewer'), async (req, res) => {
    try {
        const data = await callEselbuilder('/api/internal/ai-usage');
        res.json(data);
    } catch (err) {
        res.status(err.status || 502).json({ error: err.message });
    }
});

app.get('/api/eselbuilder/voice-limit', requireRole('viewer'), async (req, res) => {
    const discordId = String(req.query.discordId || '').trim();
    if (!discordId) return res.status(400).json({ error: 'discordId ist erforderlich.' });
    try {
        const data = await callEselbuilder(`/api/internal/eselfriend/voice-limit?discordId=${encodeURIComponent(discordId)}`);
        res.json(data);
    } catch (err) {
        res.status(err.status || 502).json({ error: err.message });
    }
});

app.post('/api/eselbuilder/voice-limit', requireRole('admin'), async (req, res) => {
    const { discordId, minutesLimit } = req.body || {};
    if (!discordId || typeof discordId !== 'string') {
        return res.status(400).json({ error: 'discordId ist erforderlich.' });
    }
    if (minutesLimit !== null && typeof minutesLimit !== 'number') {
        return res.status(400).json({ error: 'minutesLimit muss eine Zahl oder null sein.' });
    }
    try {
        const data = await callEselbuilder('/api/internal/eselfriend/voice-limit', {
            method: 'POST',
            body: JSON.stringify({ discordId, minutesLimit }),
        });
        res.json(data);
    } catch (err) {
        res.status(err.status || 502).json({ error: err.message });
    }
});

// ── Fahrstuhl ─────────────────────────────────────────────────────────────────
// Fahrstuhl hat schon einen fertigen Premium-Lookup in seiner botAPI (GET /premium/user/:id),
// genutzt vom PHP-Dashboard -- wir rufen ihn einfach mit demselben BOT_API_TOKEN mit, statt
// etwas Neues zu bauen. Erreichbar per internem Docker-DNS, da beide Dienste in marvin_internal
// haengen (anders als eselbuilder-web, das in einem eigenen Compose-Netzwerk laeuft).
const FAHRSTUHL_API_BASE = process.env.FAHRSTUHL_API_BASE || 'http://fahrstuhl-docker:3002';
const FAHRSTUHL_BOT_API_TOKEN = process.env.FAHRSTUHL_BOT_API_TOKEN || '';

async function fahrstuhlPremiumUser(discordId) {
    if (!FAHRSTUHL_BOT_API_TOKEN) return null;
    try {
        const res = await fetch(`${FAHRSTUHL_API_BASE}/premium/user/${encodeURIComponent(discordId)}`, {
            headers: { 'Authorization': `Bearer ${FAHRSTUHL_BOT_API_TOKEN}` },
        });
        if (!res.ok) return null;
        const body = await res.json();
        return body.data || null;
    } catch {
        return null; // Fahrstuhl gerade nicht erreichbar -- der Rest der Suche soll trotzdem klappen
    }
}

async function callFahrstuhl(path, opts = {}) {
    if (!FAHRSTUHL_BOT_API_TOKEN) {
        const err = new Error('FAHRSTUHL_BOT_API_TOKEN ist nicht konfiguriert.');
        err.status = 503;
        throw err;
    }
    const res = await fetch(`${FAHRSTUHL_API_BASE}${path}`, {
        ...opts,
        headers: {
            'Authorization': `Bearer ${FAHRSTUHL_BOT_API_TOKEN}`,
            'Content-Type': 'application/json',
            ...(opts.headers || {}),
        },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(body.error || `fahrstuhl antwortete mit ${res.status}`);
        err.status = res.status;
        throw err;
    }
    return body;
}

// ── EselModerator ─────────────────────────────────────────────────────────────
// Gleiches Muster wie Fahrstuhl -- Premium ist dort ebenfalls user- statt guild-gebunden (die
// Guild-Ebene faellt nur auf das Premium des Server-Owners zurueck). GET /premium/user/:id wurde
// eigens fuer diese Nutzer-Suche ergaenzt (existierte vorher nicht, nur POST activate/deactivate).
const ESELMODERATOR_API_BASE = process.env.ESELMODERATOR_API_BASE || 'http://eselmoderator:3003';
const ESELMODERATOR_BOT_API_TOKEN = process.env.ESELMODERATOR_BOT_API_TOKEN || '';

async function callEselmoderator(path, opts = {}) {
    if (!ESELMODERATOR_BOT_API_TOKEN) {
        const err = new Error('ESELMODERATOR_BOT_API_TOKEN ist nicht konfiguriert.');
        err.status = 503;
        throw err;
    }
    const res = await fetch(`${ESELMODERATOR_API_BASE}${path}`, {
        ...opts,
        headers: {
            'Authorization': `Bearer ${ESELMODERATOR_BOT_API_TOKEN}`,
            'Content-Type': 'application/json',
            ...(opts.headers || {}),
        },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(body.error || `eselmoderator antwortete mit ${res.status}`);
        err.status = res.status;
        throw err;
    }
    return body;
}

async function eselmoderatorPremiumUser(discordId) {
    try {
        const body = await callEselmoderator(`/premium/user/${encodeURIComponent(discordId)}`);
        return body.data || null;
    } catch {
        return null; // eselmoderator gerade nicht erreichbar -- der Rest der Suche soll trotzdem klappen
    }
}

app.post('/api/eselmoderator/premium', requireRole('admin'), async (req, res) => {
    const { discordId, action, tier, daysValid } = req.body || {};
    if (!discordId || typeof discordId !== 'string') return res.status(400).json({ error: 'discordId ist erforderlich.' });
    try {
        if (action === 'deactivate') {
            const data = await callEselmoderator('/premium/deactivate', { method: 'POST', body: JSON.stringify({ userId: discordId }) });
            return res.json(data);
        }
        if (action === 'activate') {
            const data = await callEselmoderator('/premium/activate', {
                method: 'POST',
                body: JSON.stringify({ userId: discordId, tier: tier === 'pro' ? 'pro' : 'basic', daysValid: Number(daysValid) || 35, mode: 'set' }),
            });
            return res.json(data);
        }
        res.status(400).json({ error: 'Ungültige Aktion.' });
    } catch (err) {
        res.status(err.status || 502).json({ error: err.message });
    }
});

// ── EselTokens (manuelle Gutschrift nach Zahlungseingang) ───────────────────────
// Gleiches Muster wie Fahrstuhl/EselModerator oben: der Shop-Kauf laeuft aktuell manuell
// (PayPal Friends&Family -> Discord-DM -> Team-Code, siehe shop/src/components/PayPalPurchaseBox.tsx).
// Nachdem ein Zahlungseingang bestaetigt wurde, wird die Gutschrift hier von Hand ausgeloest,
// statt einen weiteren Team-Code fuer eseltokens.com anzulegen -- die Route ruft direkt dieselbe
// Integrations-Endpoint auf, die auch der Shop nach einem Kauf automatisch aufruft
// (eseltokens/src/pages/api/integrations/shop/credit.js), damit beide Wege identisch verbuchen.
const ESELTOKENS_API_BASE = process.env.ESELTOKENS_API_BASE || 'http://eseltokens-docker:3000';
const SHOP_INTEGRATION_SECRET = process.env.SHOP_INTEGRATION_SECRET || '';

async function callEselTokens(path, opts = {}) {
    if (!SHOP_INTEGRATION_SECRET) {
        const err = new Error('SHOP_INTEGRATION_SECRET ist nicht konfiguriert.');
        err.status = 503;
        throw err;
    }
    const fullPath = path.endsWith('/') ? path : `${path}/`;
    const res = await fetch(`${ESELTOKENS_API_BASE}${fullPath}`, {
        ...opts,
        headers: {
            'Authorization': `Bearer ${SHOP_INTEGRATION_SECRET}`,
            'Content-Type': 'application/json',
            ...(opts.headers || {}),
        },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(body.error || `eseltokens antwortete mit ${res.status}`);
        err.status = res.status;
        throw err;
    }
    return body;
}

// -- Volle Nutzerliste (Rolle/Guthaben/XP), uebertragen aus eseltokens.com/admin --
// eseltokens/admin zeigte das bisher direkt (eigene Session), aber getrennt von jeder anderen
// Admin-Aktion. Konsolidiert hierher, damit es nur noch EINEN Ort fuer Admin-Aufgaben gibt.
app.get('/api/eseltokens/users', requireRole('viewer'), async (req, res) => {
    try {
        const data = await callEselTokens('/api/integrations/admin/users');
        res.json(data);
    } catch (err) {
        res.status(err.status || 502).json({ error: err.message });
    }
});

app.post('/api/eseltokens/users/:id', requireRole('admin'), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Ungueltige User-ID.' });
    const { balance, role, xp } = req.body || {};
    if (balance === undefined && role === undefined && xp === undefined) {
        return res.status(400).json({ error: 'Nichts zu aendern.' });
    }
    try {
        const data = await callEselTokens('/api/integrations/admin/update-user', {
            method: 'POST',
            body: JSON.stringify({ userId: id, balance, role, xp }),
        });
        res.json(data);
    } catch (err) {
        res.status(err.status || 502).json({ error: err.message });
    }
});

app.post('/api/eseltokens/credit', requireRole('admin'), async (req, res) => {
    const { discordId, username, amount, reason } = req.body || {};
    if (!discordId || typeof discordId !== 'string') return res.status(400).json({ error: 'discordId ist erforderlich.' });
    const cleanAmount = Number(amount);
    if (!Number.isInteger(cleanAmount) || cleanAmount <= 0 || cleanAmount > 50000) {
        return res.status(400).json({ error: 'amount muss zwischen 1 und 50000 liegen.' });
    }
    try {
        const data = await callEselTokens('/api/integrations/shop/credit', {
            method: 'POST',
            body: JSON.stringify({ discordId, username, amount: cleanAmount, reason: reason || 'Manuelle Admin-Gutschrift' }),
        });
        res.json(data);
    } catch (err) {
        res.status(err.status || 502).json({ error: err.message });
    }
});

// ── Shop-Bestellungen sperren/entsperren ────────────────────────────────────────
// Sichere, lokale Notbremse statt einer echten Kuendigung beim Zahlungsanbieter: der Shop kann
// aktuell selbst gar nicht aktiv bei Paddle/PayPal kuendigen (er reagiert nur auf deren Webhooks,
// siehe shop/src/lib/fulfillment.js) -- eine echte Kuendigungs-API waere ein eigenes, groesseres
// Vorhaben mit echtem Zahlungs-Risiko bei einem Fehler. Stattdessen wird hier direkt der
// jeweilige Bot/App-seitige Premium-Status umgeschaltet (dieselben Aktionen, die sonst durch ein
// echtes Zahlungs-Event ausgeloest wuerden) -- der Zugriff ist sofort weg, ohne die Zahlung
// selbst anzufassen. Kuendigung beim Anbieter bleibt bewusst manuelle Owner-Aufgabe.
app.post('/api/shop/lock-order', requireRole('admin'), async (req, res) => {
    const { discordId, productKey, locked } = req.body || {};
    if (!discordId || typeof discordId !== 'string') return res.status(400).json({ error: 'discordId ist erforderlich.' });
    if (typeof locked !== 'boolean') return res.status(400).json({ error: 'locked muss true oder false sein.' });

    try {
        if (productKey === 'fahrstuhl_basic' || productKey === 'fahrstuhl_pro') {
            if (locked) {
                await callFahrstuhl('/premium/deactivate', { method: 'POST', body: JSON.stringify({ userId: discordId }) });
            } else {
                const tier = productKey === 'fahrstuhl_pro' ? 'pro' : 'basic';
                await callFahrstuhl('/premium/activate', { method: 'POST', body: JSON.stringify({ userId: discordId, tier, daysValid: 35, mode: 'set' }) });
            }
            return res.json({ success: true });
        }
        if (productKey === 'eselbuilder_pro') {
            const data = await callEselbuilder('/api/internal/subscription/lock', { method: 'POST', body: JSON.stringify({ discordId, locked }) });
            return res.json(data);
        }
        if (productKey === 'eselmoderator_basic' || productKey === 'eselmoderator_pro') {
            if (locked) {
                await callEselmoderator('/premium/deactivate', { method: 'POST', body: JSON.stringify({ userId: discordId }) });
            } else {
                const tier = productKey === 'eselmoderator_pro' ? 'pro' : 'basic';
                await callEselmoderator('/premium/activate', { method: 'POST', body: JSON.stringify({ userId: discordId, tier, daysValid: 35, mode: 'set' }) });
            }
            return res.json({ success: true });
        }
        res.status(400).json({ error: 'Unbekanntes Produkt: ' + productKey });
    } catch (err) {
        res.status(err.status || 502).json({ error: err.message });
    }
});

// ── Nutzer-Suche ueber alle Produkte ────────────────────────────────────────────
// shop.eselbande.com ist inzwischen die zentrale Kasse fuer alle Produkte (Fahrstuhl, Eselbuilder
// Pro, EselModerator) -- seine SQLite-Datei read-only reinzumounten ist einfacher und robuster
// als noch eine weitere interne API dafuer zu bauen, es sind eh nur simple SELECTs.
const SHOP_DB_PATH = '/app/shop-readonly/shop.db';
let shopDb = null;
function getShopDb() {
    if (shopDb) return shopDb;
    try {
        shopDb = new Database(SHOP_DB_PATH, { readonly: true, fileMustExist: true });
        return shopDb;
    } catch {
        return null; // Mount fehlt (z.B. lokale Entwicklung ohne Volume) -- Suche laeuft trotzdem
    }
}

// Discords eigene, oeffentliche User-API -- funktioniert mit JEDEM Bot-Token fuer JEDE
// Discord-ID, unabhaengig davon, ob der Bot mit der Person einen Server teilt. Rein zur Anzeige
// (aktueller Anzeigename + Avatar) in der Nutzer-Suche, keine Berechtigungs-Entscheidung haengt
// daran -- deshalb reicht das Wiederverwenden von Fahrstuhls Bot-Token voellig aus.
const DISCORD_LOOKUP_TOKEN = process.env.DISCORD_LOOKUP_TOKEN || '';
async function discordUserLookup(discordId) {
    if (!DISCORD_LOOKUP_TOKEN) return null;
    try {
        const res = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
            headers: { Authorization: `Bot ${DISCORD_LOOKUP_TOKEN}` },
        });
        if (!res.ok) return null;
        const u = await res.json();
        return {
            id: u.id,
            username: u.username,
            globalName: u.global_name || null,
            avatarUrl: u.avatar
                ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${u.avatar.startsWith('a_') ? 'gif' : 'png'}?size=64`
                : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(u.id) >> 22n) % 6n)}.png`,
        };
    } catch {
        return null; // Discord-API gerade nicht erreichbar -- der Rest der Suche soll trotzdem klappen
    }
}

app.get('/api/whois', requireRole('viewer'), async (req, res) => {
    const discordId = String(req.query.discordId || '').trim();
    if (!/^\d{5,25}$/.test(discordId)) return res.status(400).json({ error: 'Ungültige Discord-ID.' });

    const result = { discordId, discord: null, shop: null, fahrstuhl: null, eselbuilder: null, eselmoderator: null };

    const db = getShopDb();
    if (db) {
        try {
            const user = db.prepare('SELECT username, avatar, createdAt FROM users WHERE discordId = ?').get(discordId);
            const orders = db.prepare(
                'SELECT productKey, status, currentPeriodEnd, createdAt FROM orders WHERE discordId = ? ORDER BY createdAt DESC'
            ).all(discordId);
            result.shop = { user: user || null, orders };
        } catch (err) {
            result.shop = { error: err.message };
        }
    }

    const [discord, fahrstuhl, eselbuilder, eselmoderator] = await Promise.all([
        discordUserLookup(discordId),
        fahrstuhlPremiumUser(discordId),
        callEselbuilder(`/api/internal/eselfriend/voice-limit?discordId=${encodeURIComponent(discordId)}`).catch(() => null),
        eselmoderatorPremiumUser(discordId),
    ]);
    result.discord = discord;
    result.fahrstuhl = fahrstuhl;
    result.eselbuilder = eselbuilder;
    result.eselmoderator = eselmoderator;

    res.json(result);
});

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'admin-dashboard', uptime: process.uptime(), session_store: _sessionStoreType }));

app.use((req, res) => res.status(404).send('Nicht gefunden'));

app.listen(PORT, () => console.log(`[admin.eselbande.com] Running on port ${PORT}`));
