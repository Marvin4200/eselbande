/**
 * GitHub Webhook Auto-Deploy (hardened)
 * - HMAC signature verification
 * - Delivery replay protection
 * - Deploy lock to prevent race conditions
 * - Dirty-working-tree protection
 * - Health-gated restart with rollback
 */

const fs = require('fs');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const PORT = parseInt(process.env.DEPLOY_WEBHOOK_PORT || '9000', 10);
const SECRET = process.env.DEPLOY_SECRET || '';
const REPO_DIR = path.join(__dirname, '..');
const BRANCH = process.env.DEPLOY_BRANCH || 'main';
const MAX_BODY_BYTES = 1024 * 1024;
const STATUS_FILE = path.join(REPO_DIR, 'data', 'deploy-status.json');
const AUDIT_LOG_FILE = path.join(REPO_DIR, 'data', 'deploy-audit.log');
const DELIVERIES_FILE = path.join(REPO_DIR, 'data', 'deploy-deliveries.json');
const LOCK_FILE = path.join(REPO_DIR, 'data', 'deploy.lock');
const DISCORD_DEPLOY_WEBHOOK = process.env.DISCORD_DEPLOY_WEBHOOK_URL || '';
const COMPOSE_FILE = process.env.COMPOSE_FILE || '/home/marvin/fahrstuhl/docker-compose.yml';
const DEPLOY_SERVICES = (process.env.DEPLOY_SERVICES || 'fahrstuhl-docker dashboard-php').split(/\s+/).filter(Boolean);
const DEPLOY_REPO_DIR = process.env.DEPLOY_REPO_DIR || '/home/marvin';
const HEALTHCHECK_URL = process.env.DEPLOY_HEALTHCHECK_URL || 'http://127.0.0.1:3102/health';
const HEALTHCHECK_RETRIES = parseInt(process.env.DEPLOY_HEALTHCHECK_RETRIES || '10', 10);
const HEALTHCHECK_DELAY_MS = parseInt(process.env.DEPLOY_HEALTHCHECK_DELAY_MS || '3000', 10);

if (!SECRET) throw new Error('DEPLOY_SECRET must be set before starting deploy-webhook.js');
if (!Number.isFinite(PORT) || PORT < 1 || PORT > 65535) throw new Error('DEPLOY_WEBHOOK_PORT must be a valid TCP port');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function ensureDataDir() {
    fs.mkdirSync(path.dirname(STATUS_FILE), { recursive: true });
}

function safeReadJson(file, fallback) {
    try {
        if (!fs.existsSync(file)) return fallback;
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return fallback;
    }
}

function appendAudit(entry) {
    ensureDataDir();
    fs.appendFileSync(AUDIT_LOG_FILE, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
}

function verifySignature(payload, signature) {
    if (!signature) return false;
    const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
    try {
        return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
        return false;
    }
}

function sendDiscordNotification(payload) {
    if (!DISCORD_DEPLOY_WEBHOOK) return;
    try {
        const body = JSON.stringify(payload);
        const url = new URL(DISCORD_DEPLOY_WEBHOOK);
        const req = https.request({
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        });
        req.on('error', err => console.warn('[deploy] Discord notify failed:', err.message));
        req.write(body);
        req.end();
    } catch (err) {
        console.warn('[deploy] Discord notify error:', err.message);
    }
}

function writeDeployStatus(status) {
    ensureDataDir();
    const current = safeReadJson(STATUS_FILE, {});
    current.fahrstuhl = {
        ...current.fahrstuhl,
        ...status,
        updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(STATUS_FILE, JSON.stringify(current, null, 2));
}

function isDuplicateDelivery(deliveryId) {
    if (!deliveryId) return false;
    ensureDataDir();
    const list = safeReadJson(DELIVERIES_FILE, []);
    if (list.includes(deliveryId)) return true;
    const next = [...list, deliveryId].slice(-500);
    fs.writeFileSync(DELIVERIES_FILE, JSON.stringify(next, null, 2));
    return false;
}

function acquireLock() {
    ensureDataDir();
    const fd = fs.openSync(LOCK_FILE, 'wx');
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    return fd;
}

function releaseLock(fd) {
    try { fs.closeSync(fd); } catch (_) { }
    try { fs.unlinkSync(LOCK_FILE); } catch (_) { }
}

function run(command, args, options = {}) {
    return execFileSync(command, args, { encoding: 'utf8', ...options }).trim();
}

function assertCleanGitState() {
    const dirty = run('git', ['-C', DEPLOY_REPO_DIR, 'status', '--porcelain', '-uno']);
    if (dirty) throw new Error('Repository has uncommitted local changes. Aborting deploy for safety.');
}

async function checkHealth() {
    for (let i = 1; i <= HEALTHCHECK_RETRIES; i++) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 5000);
            const res = await fetch(HEALTHCHECK_URL, { signal: controller.signal });
            clearTimeout(timer);
            if (res.ok) return { ok: true, attempt: i, status: res.status };
        } catch (_) { }
        if (i < HEALTHCHECK_RETRIES) await sleep(HEALTHCHECK_DELAY_MS);
    }
    return { ok: false, attempt: HEALTHCHECK_RETRIES, status: null };
}

async function deploy(context) {
    const deploymentId = context.deploymentId;
    const previousCommit = run('git', ['-C', DEPLOY_REPO_DIR, 'rev-parse', 'HEAD']);

    writeDeployStatus({
        state: 'running',
        deploymentId,
        startedAt: new Date().toISOString(),
        branch: BRANCH,
        previousCommit,
    });
    appendAudit({ deploymentId, action: 'deploy-start', branch: BRANCH, previousCommit });

    try {
        assertCleanGitState();
        const gitOut = run('git', ['-C', DEPLOY_REPO_DIR, 'pull', '--ff-only', 'origin', BRANCH]);
        const currentCommit = run('git', ['-C', DEPLOY_REPO_DIR, 'rev-parse', 'HEAD']);

        const dockerOut = run('docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d', '--build', '--no-deps', ...DEPLOY_SERVICES]);
        const health = await checkHealth();
        if (!health.ok) throw new Error(`Healthcheck failed after container restart (${HEALTHCHECK_URL})`);

        writeDeployStatus({
            state: 'success',
            deploymentId,
            finishedAt: new Date().toISOString(),
            branch: BRANCH,
            previousCommit,
            commit: currentCommit,
            git: gitOut,
            docker: dockerOut,
            health,
        });

        appendAudit({ deploymentId, action: 'deploy-success', commit: currentCommit, health });

        sendDiscordNotification({
            embeds: [{
                color: 0x57F287,
                title: '✅ Deploy erfolgreich',
                description: `Branch **${BRANCH}** wurde deployed.`,
                fields: [
                    { name: 'Deployment ID', value: deploymentId, inline: false },
                    { name: 'Commit', value: `\`${currentCommit.slice(0, 12)}\``, inline: true },
                    { name: 'Services', value: DEPLOY_SERVICES.join(', '), inline: true },
                    { name: 'Health', value: `${HEALTHCHECK_URL} (attempt ${health.attempt})`, inline: true },
                ],
                timestamp: new Date().toISOString(),
                footer: { text: 'Fahrstuhl Deploy' },
            }],
        });

        return { success: true, deploymentId, commit: currentCommit, health };
    } catch (err) {
        appendAudit({ deploymentId, action: 'deploy-failed', error: err.message });
        console.error('[deploy] ❌ Deploy failed:', err.message);

        try {
            run('git', ['-C', DEPLOY_REPO_DIR, 'reset', '--hard', previousCommit]);
            run('docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d', '--build', '--no-deps', ...DEPLOY_SERVICES]);
            appendAudit({ deploymentId, action: 'rollback-success', rollbackCommit: previousCommit });
        } catch (rollbackErr) {
            appendAudit({ deploymentId, action: 'rollback-failed', error: rollbackErr.message });
            console.error('[deploy] ❌ Rollback failed:', rollbackErr.message);
        }

        writeDeployStatus({
            state: 'failed',
            deploymentId,
            finishedAt: new Date().toISOString(),
            branch: BRANCH,
            error: err.message,
            rollbackTo: previousCommit,
        });

        sendDiscordNotification({
            embeds: [{
                color: 0xED4245,
                title: '❌ Deploy fehlgeschlagen (Rollback ausgelöst)',
                description: `Branch **${BRANCH}** – Deployment ist gescheitert.`,
                fields: [
                    { name: 'Deployment ID', value: deploymentId, inline: false },
                    { name: 'Rollback Commit', value: `\`${previousCommit.slice(0, 12)}\``, inline: true },
                    { name: 'Fehler', value: '```' + err.message.slice(0, 900) + '```', inline: false },
                ],
                timestamp: new Date().toISOString(),
                footer: { text: 'Fahrstuhl Deploy' },
            }],
        });

        return { success: false, deploymentId, error: err.message, rollbackTo: previousCommit };
    }
}

const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'ok', service: 'deploy-webhook', pid: process.pid, uptime: process.uptime() }));
    }

    if (req.method !== 'POST' || req.url !== '/deploy') {
        res.writeHead(404);
        return res.end('Not found');
    }

    const chunks = [];
    let totalBytes = 0;
    req.on('data', chunk => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_BODY_BYTES) {
            res.writeHead(413);
            res.end('Payload too large');
            req.destroy();
            return;
        }
        chunks.push(chunk);
    });

    req.on('end', async () => {
        const bodyBuffer = Buffer.concat(chunks);
        const sig = req.headers['x-hub-signature-256'];
        const eventType = String(req.headers['x-github-event'] || '');
        const deliveryId = String(req.headers['x-github-delivery'] || '');

        if (!verifySignature(bodyBuffer, sig)) {
            appendAudit({ action: 'request-rejected', reason: 'invalid-signature', deliveryId });
            res.writeHead(403);
            return res.end('Forbidden');
        }

        if (eventType !== 'push') {
            res.writeHead(200);
            return res.end('Ignored event');
        }

        if (isDuplicateDelivery(deliveryId)) {
            appendAudit({ action: 'request-rejected', reason: 'duplicate-delivery', deliveryId });
            res.writeHead(200);
            return res.end('Duplicate ignored');
        }

        let event;
        try {
            event = JSON.parse(bodyBuffer.toString('utf8'));
        } catch {
            res.writeHead(400);
            return res.end('Bad JSON');
        }

        const ref = event.ref || '';
        if (ref !== `refs/heads/${BRANCH}`) {
            res.writeHead(200);
            return res.end('Ignored');
        }

        const deploymentId = crypto.randomUUID();
        let lockFd;
        try {
            lockFd = acquireLock();
        } catch {
            appendAudit({ deploymentId, action: 'request-rejected', reason: 'deploy-locked', deliveryId });
            res.writeHead(423);
            return res.end('Another deploy is in progress');
        }

        const pusher = event.pusher?.name || 'unknown';
        appendAudit({ deploymentId, action: 'request-accepted', deliveryId, pusher, ref });

        try {
            const result = await deploy({ deploymentId, deliveryId, pusher });
            res.writeHead(result.success ? 200 : 500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        } finally {
            releaseLock(lockFd);
        }
    });
});

server.listen(PORT, () => {
    console.log(`[deploy] Webhook receiver listening on port ${PORT}`);
    console.log(`[deploy] Watching branch: ${BRANCH}`);
    console.log(`[deploy] Repo: ${REPO_DIR}`);
    console.log(`[deploy] Docker services: ${DEPLOY_SERVICES.join(', ')}`);
    console.log(`[deploy] Compose file: ${COMPOSE_FILE}`);
    console.log(`[deploy] Repo dir: ${DEPLOY_REPO_DIR}`);
    console.log(`[deploy] Healthcheck URL: ${HEALTHCHECK_URL}`);
});

function shutdown(signal) {
    console.log(`[deploy] ${signal} received, shutting down webhook server...`);
    server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
