'use strict';

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { execSync } = require('child_process');
require('dotenv').config({ path: '/home/marvin/webhooks/.env' });

const PORT = Number(process.env.PORT || 9011);
const SECRET_ESEL = process.env.SECRET_ESEL || '';
const SECRET_404 = process.env.SECRET_404 || '';
const BRANCH = process.env.DEPLOY_BRANCH || 'master';
const DISCORD_DEPLOY_WEBHOOK_URL = process.env.DISCORD_DEPLOY_WEBHOOK_URL || '';

function verify(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

function run(cmd) {
  return execSync(cmd, { stdio: 'pipe', encoding: 'utf8' });
}

function short(text, max = 1000) {
  if (!text) return '-';
  return text.length > max ? text.slice(0, max - 3) + '...' : text;
}

function sendDiscord(payload) {
  if (!DISCORD_DEPLOY_WEBHOOK_URL) {
    console.log('[discord] webhook url missing, skipping notification');
    return;
  }

  try {
    const data = JSON.stringify(payload);
    const url = new URL(DISCORD_DEPLOY_WEBHOOK_URL);

    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      console.log(`[discord] webhook status ${res.statusCode}`);
    });

    req.on('error', (err) => {
      console.error('[discord] request failed:', err.message);
    });

    req.write(data);
    req.end();
  } catch (err) {
    console.error('[discord] send failed:', err.message);
  }
}

function commitLines(body) {
  const commits = Array.isArray(body.commits) ? body.commits.slice(0, 5) : [];
  if (!commits.length) return 'Keine Commit-Daten';
  return commits
    .map((commit) => {
      const hash = (commit.id || '').slice(0, 7) || 'unknown';
      const message = (commit.message || '').split('\n')[0] || 'no message';
      return `- ${hash} ${message}`;
    })
    .join('\n');
}

function notifyStart(service, body) {
  sendDiscord({
    embeds: [{
      color: 5793266,
      title: `Deploy gestartet: ${service}`,
      description: `Branch: ${BRANCH}`,
      fields: [
        { name: 'Repo', value: short(body.repository?.full_name || 'unbekannt', 200), inline: true },
        { name: 'Pusher', value: short(body.pusher?.name || 'unbekannt', 200), inline: true },
        { name: 'Commits', value: short(commitLines(body), 1000), inline: false },
      ],
      timestamp: new Date().toISOString(),
    }],
  });
}

function notifySuccess(service, output) {
  sendDiscord({
    embeds: [{
      color: 5763719,
      title: `Deploy erfolgreich: ${service}`,
      description: `Branch: ${BRANCH}`,
      fields: [
        { name: 'Output', value: '```' + short(output, 900) + '```', inline: false },
      ],
      timestamp: new Date().toISOString(),
    }],
  });
}

function notifyFailure(service, err) {
  sendDiscord({
    embeds: [{
      color: 15548997,
      title: `Deploy fehlgeschlagen: ${service}`,
      description: `Branch: ${BRANCH}`,
      fields: [
        { name: 'Fehler', value: '```' + short(err?.stack || err?.message || String(err), 900) + '```', inline: false },
      ],
      timestamp: new Date().toISOString(),
    }],
  });
}

function deployEsel() {
  const out = [];
  out.push(run('cd /home/marvin/esel && git pull origin master'));
  out.push(run('cd /home/marvin/esel && npm install --omit=dev'));
  out.push(run('pm2 restart esel'));
  return out.join('\n');
}

function deploy404() {
  const out = [];
  out.push(run('cd /home/marvin/404 && git pull origin master'));
  out.push(run('nginx -t'));
  out.push(run('systemctl reload nginx'));
  return out.join('\n');
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(404);
    return res.end('Not found');
  }

  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);
    const sig = req.headers['x-hub-signature-256'] || '';
    const event = req.headers['x-github-event'] || '';

    console.log(`[webhook] ${req.method} ${req.url} event=${event || '-'} bytes=${raw.length}`);

    if (event !== 'push') {
      res.writeHead(200);
      return res.end('ignored: not push');
    }

    let body;
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch {
      res.writeHead(400);
      return res.end('bad json');
    }

    const ref = body.ref || '';
    if (ref !== `refs/heads/${BRANCH}`) {
      res.writeHead(200);
      return res.end('ignored: wrong branch');
    }

    try {
      if (req.url === '/deploy/esel') {
        if (!verify(raw, sig, SECRET_ESEL)) {
          console.log('[webhook] esel forbidden: bad signature');
          res.writeHead(403);
          return res.end('forbidden');
        }

        console.log('[deploy] esel started');
        notifyStart('esel', body);
        const out = deployEsel();
        console.log('[deploy] esel success');
        notifySuccess('esel', out);

        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end('ok esel\n' + out);
      }

      if (req.url === '/deploy/404') {
        if (!verify(raw, sig, SECRET_404)) {
          console.log('[webhook] 404 forbidden: bad signature');
          res.writeHead(403);
          return res.end('forbidden');
        }

        console.log('[deploy] 404 started');
        notifyStart('404', body);
        const out = deploy404();
        console.log('[deploy] 404 success');
        notifySuccess('404', out);

        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end('ok 404\n' + out);
      }

      res.writeHead(404);
      return res.end('not found');
    } catch (err) {
      const service = req.url === '/deploy/404' ? '404' : 'esel';
      console.error(`[deploy] ${service} failed:`, err.message);
      notifyFailure(service, err);

      res.writeHead(500, { 'Content-Type': 'text/plain' });
      return res.end('deploy failed\n' + err.message);
    }
  });
});

server.listen(PORT, () => {
  console.log(`autodeploy listening on :${PORT}`);
});
