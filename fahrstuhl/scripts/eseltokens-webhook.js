/**
 * EselTokens GitHub Webhook Auto-Deploy (hardened)
 * - HMAC signature verification
 * - Delivery replay protection
 * - Deploy lock to prevent race conditions
 * - Dirty-working-tree protection
 * - Health-gated restart with rollback
 */

const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const PORT = parseInt(process.env.ESELTOKENS_WEBHOOK_PORT || '9001', 10);
const SECRET = process.env.ESELTOKENS_DEPLOY_SECRET || '';
const REPO_DIR = process.env.ESELTOKENS_REPO_DIR || '/home/marvin';
const BRANCH = process.env.ESELTOKENS_DEPLOY_BRANCH || 'main';
const COMPOSE_FILE = process.env.COMPOSE_FILE || '/home/marvin/fahrstuhl/docker-compose.yml';
const ESELTOKENS_SERVICE = process.env.ESELTOKENS_SERVICE || 'eseltokens-docker';
const MAX_BODY_BYTES = 1024 * 1024;
const STATUS_FILE = path.join(__dirname, '..', 'data', 'deploy-status.json');
const AUDIT_LOG_FILE = path.join(__dirname, '..', 'data', 'deploy-audit.log');
const DELIVERIES_FILE = path.join(__dirname, '..', 'data', 'eseltokens-deliveries.json');
const LOCK_FILE = path.join(__dirname, '..', 'data', 'eseltokens-deploy.lock');
const HEALTHCHECK_URL = process.env.ESELTOKENS_HEALTHCHECK_URL || 'http://127.0.0.1:3100/eseltokens/api/health';
const HEALTHCHECK_RETRIES = parseInt(process.env.ESELTOKENS_HEALTHCHECK_RETRIES || '15', 10);
const HEALTHCHECK_DELAY_MS = parseInt(process.env.ESELTOKENS_HEALTHCHECK_DELAY_MS || '5000', 10);

if (!SECRET) throw new Error('ESELTOKENS_DEPLOY_SECRET must be set before starting eseltokens-webhook.js');
if (!Number.isFinite(PORT) || PORT < 1 || PORT > 65535) throw new Error('ESELTOKENS_WEBHOOK_PORT must be a valid TCP port');

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
    fs.appendFileSync(AUDIT_LOG_FILE, JSON.stringify({ at: new Date().toISOString(), service: 'eseltokens', ...entry }) + '\n');
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

function writeDeployStatus(status) {
    ensureDataDir();
    const current = safeReadJson(STATUS_FILE, {});
    current.eseltokens = {
        ...current.eseltokens,
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
    fs.writeFileSync(DELIVERIES_FILE, JSON.stringify([...list, deliveryId].slice(-500), null, 2));
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
    const dirty = run('git', ['-C', REPO_DIR, 'status', '--porcelain', '-uno']);
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
    const previousCommit = run('git', ['-C', REPO_DIR, 'rev-parse', 'HEAD']);

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

        const gitOut = run('git', ['-C', REPO_DIR, 'pull', '--ff-only', 'origin', BRANCH]);
        const currentCommit = run('git', ['-C', REPO_DIR, 'rev-parse', 'HEAD']);

        // Build new image from updated code, then restart the container
        const buildOut = run('docker', ['compose', '-f', COMPOSE_FILE, 'build', '--no-cache', ESELTOKENS_SERVICE]);
        const upOut = run('docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d', '--no-deps', ESELTOKENS_SERVICE]);

        const health = await checkHealth();
        if (!health.ok) throw new Error(`Healthcheck failed after container rebuild (${HEALTHCHECK_URL})`);

        writeDeployStatus({
            state: 'success',
            deploymentId,
            finishedAt: new Date().toISOString(),
            branch: BRANCH,
            previousCommit,
            commit: currentCommit,
            git: gitOut,
            docker: { build: buildOut, up: upOut },
            health,
        });

        appendAudit({ deploymentId, action: 'deploy-success', commit: currentCommit, health });
        return { success: true, deploymentId, commit: currentCommit, health };
    } catch (err) {
        console.error('[eseltokens-deploy] ❌ Deploy failed:', err.message);
        appendAudit({ deploymentId, action: 'deploy-failed', error: err.message });

        try {
            run('git', ['-C', REPO_DIR, 'reset', '--hard', previousCommit]);
            // Rebuild with the reverted code and restart
            run('docker', ['compose', '-f', COMPOSE_FILE, 'build', '--no-cache', ESELTOKENS_SERVICE]);
            run('docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d', '--no-deps', ESELTOKENS_SERVICE]);
            appendAudit({ deploymentId, action: 'rollback-success', rollbackCommit: previousCommit });
        } catch (rollbackErr) {
            appendAudit({ deploymentId, action: 'rollback-failed', error: rollbackErr.message });
        }

        writeDeployStatus({
            state: 'failed',
            deploymentId,
            finishedAt: new Date().toISOString(),
            branch: BRANCH,
            error: err.message,
            rollbackTo: previousCommit,
        });
        return { success: false, deploymentId, error: err.message, rollbackTo: previousCommit };
    }
}

const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'ok', service: 'eseltokens-webhook', pid: process.pid, uptime: process.uptime() }));
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

    req.on('end', () => {
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
            res.writeHead(423);
            return res.end('Another deploy is in progress');
        }

        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ accepted: true, deploymentId }));

        setImmediate(async () => {
            try {
                await deploy({ deploymentId, deliveryId });
            } finally {
                releaseLock(lockFd);
            }
        });
    });
});

server.listen(PORT, () => {
    console.log(`[eseltokens-deploy] Webhook receiver listening on port ${PORT}`);
    console.log(`[eseltokens-deploy] Watching branch: ${BRANCH}`);
    console.log(`[eseltokens-deploy] Repo: ${REPO_DIR}`);
    console.log(`[eseltokens-deploy] Docker service: ${ESELTOKENS_SERVICE}`);
    console.log(`[eseltokens-deploy] Compose file: ${COMPOSE_FILE}`);
    console.log(`[eseltokens-deploy] Healthcheck URL: ${HEALTHCHECK_URL}`);
    console.log(`[eseltokens-deploy] Healthcheck retries: ${HEALTHCHECK_RETRIES} x ${HEALTHCHECK_DELAY_MS}ms`);
});

function shutdown(signal) {
    console.log(`[eseltokens-deploy] ${signal} received, shutting down webhook server...`);
    server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
