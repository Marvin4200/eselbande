#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function now() {
    return new Date();
}

function pad(n) {
    return String(n).padStart(2, '0');
}

function formatSnapshotStamp(date = now()) {
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function parseSnapshotStamp(name) {
    const match = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(name);
    if (!match) return null;
    const [, y, m, d, hh, mm, ss] = match;
    const date = new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
    return Number.isNaN(date.getTime()) ? null : date;
}

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function safeStat(file) {
    try {
        return fs.statSync(file);
    } catch {
        return null;
    }
}

function exists(file) {
    return !!safeStat(file);
}

function isDir(file) {
    const stat = safeStat(file);
    return !!stat && stat.isDirectory();
}

function copyFileOrDir(src, dst) {
    const stat = safeStat(src);
    if (!stat) return { ok: false, reason: 'missing' };

    ensureDir(path.dirname(dst));
    if (stat.isDirectory()) {
        fs.cpSync(src, dst, { recursive: true, force: true, errorOnExist: false });
        return { ok: true, type: 'dir' };
    }
    fs.copyFileSync(src, dst);
    return { ok: true, type: 'file', bytes: stat.size };
}

function readEnvFile(filePath) {
    const result = {};
    if (!exists(filePath)) return result;

    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const idx = trimmed.indexOf('=');
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim();
        result[key] = value;
    }
    return result;
}

function tryMysqlDump({ host, port, user, password, database, outFile }) {
    if (!database || !user) return { ok: false, skipped: true, reason: 'missing mysql config' };

    const cmd = process.env.MYSQLDUMP_PATH || 'mysqldump';
    const args = ['-h', host || '127.0.0.1', '-P', String(port || 3306), '-u', user, '--single-transaction', '--quick', '--databases', database];
    if (password) args.splice(6, 0, `--password=${password}`);

    const proc = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    if (proc.status !== 0) {
        return { ok: false, skipped: true, reason: (proc.stderr || proc.stdout || 'mysqldump failed').trim().slice(0, 500) };
    }

    fs.writeFileSync(outFile, proc.stdout || '', 'utf8');
    const stat = safeStat(outFile);
    if (!stat || stat.size < 128) {
        return { ok: false, skipped: true, reason: 'mysqldump output too small' };
    }
    return { ok: true, bytes: stat.size };
}

function listSnapshots(root) {
    if (!isDir(root)) return [];
    return fs.readdirSync(root)
        .map(name => ({ name, dir: path.join(root, name), date: parseSnapshotStamp(name) }))
        .filter(item => item.date && isDir(item.dir))
        .sort((a, b) => b.date - a.date);
}

function isoWeekKey(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function applyRetention(root) {
    const snapshots = listSnapshots(root);
    const nowTs = Date.now();
    const keep = new Set();
    const dayBucket = new Set();
    const weekBucket = new Set();

    if (snapshots.length > 0) keep.add(snapshots[0].name);

    for (const snap of snapshots) {
        const ageMs = nowTs - snap.date.getTime();
        const ageHours = ageMs / (60 * 60 * 1000);
        const ageDays = ageMs / (24 * 60 * 60 * 1000);

        if (ageHours <= 24) {
            keep.add(snap.name);
            continue;
        }

        if (ageDays <= 14) {
            const key = `${snap.date.getFullYear()}-${pad(snap.date.getMonth() + 1)}-${pad(snap.date.getDate())}`;
            if (!dayBucket.has(key)) {
                dayBucket.add(key);
                keep.add(snap.name);
            }
            continue;
        }

        if (ageDays <= 56) {
            const key = isoWeekKey(snap.date);
            if (!weekBucket.has(key)) {
                weekBucket.add(key);
                keep.add(snap.name);
            }
        }
    }

    const removed = [];
    for (const snap of snapshots) {
        if (keep.has(snap.name)) continue;
        fs.rmSync(snap.dir, { recursive: true, force: true });
        removed.push(snap.name);
    }

    return { kept: Array.from(keep), removed };
}

function verifySnapshot(snapshotDir, manifest) {
    const result = { ok: true, checks: [] };

    for (const item of manifest.items) {
        const target = path.join(snapshotDir, item.target);
        const stat = safeStat(target);
        const required = item.required !== false;
        const ok = !!stat || !required;
        if (!ok && required) result.ok = false;
        result.checks.push({
            source: item.source,
            target: item.target,
            kind: item.kind,
            required,
            ok,
            size: stat && stat.isFile() ? stat.size : null,
        });
    }

    return result;
}

function writeJson(file, data) {
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getConfig() {
    const marvinHome = process.env.MARVIN_HOME || '/home/marvin';
    const backupRoot = process.env.BACKUP_ROOT || path.join(marvinHome, 'backups');

    return {
        marvinHome,
        backupRoot,
        statusFile: path.join(backupRoot, 'backup-status.json'),
        lockFile: path.join(backupRoot, '.backup.lock'),
        pm2DumpPath: process.env.PM2_DUMP_PATH || path.join(os.homedir(), '.pm2', 'dump.pm2'),
        redisDumpPath: process.env.REDIS_DUMP_PATH || '/var/lib/redis/dump.rdb',
        redisAofPath: process.env.REDIS_AOF_PATH || '/var/lib/redis/appendonly.aof',
    };
}

function getBackupItems(cfg) {
    const h = cfg.marvinHome;
    return [
        { source: path.join(h, 'fahrstuhl', 'data'), target: 'fahrstuhl/data', kind: 'dir', required: true },
        { source: path.join(h, 'fahrstuhl', 'globalStats.json'), target: 'fahrstuhl/globalStats.json', kind: 'file', required: true },
        { source: path.join(h, 'fahrstuhl', 'userStats.json'), target: 'fahrstuhl/userStats.json', kind: 'file', required: true },
        { source: path.join(h, 'fahrstuhl', 'guildConfigs.json'), target: 'fahrstuhl/guildConfigs.json', kind: 'file', required: true },
        { source: path.join(h, 'fahrstuhl', 'userPrefs.json'), target: 'fahrstuhl/userPrefs.json', kind: 'file', required: true },

        { source: path.join(h, 'eseltokens', 'eseltokens.db'), target: 'eseltokens/eseltokens.db', kind: 'file', required: true },
        { source: path.join(h, 'eseltokens', 'eseltokens.db-wal'), target: 'eseltokens/eseltokens.db-wal', kind: 'file', required: false },
        { source: path.join(h, 'eseltokens', 'eseltokens.db-shm'), target: 'eseltokens/eseltokens.db-shm', kind: 'file', required: false },

        { source: path.join(h, 'filehoster', 'uploads'), target: 'filehoster/uploads', kind: 'dir', required: false },
        { source: path.join(h, 'filehoster', 'data', 'files.db'), target: 'filehoster/files.db', kind: 'file', required: false },
        { source: path.join(h, 'linkshortener', 'data', 'links.db'), target: 'linkshortener/links.db', kind: 'file', required: false },
        { source: path.join(h, 'zitat-board', 'data', 'quotes.db'), target: 'zitatboard/quotes.db', kind: 'file', required: false },
        { source: path.join(h, 'statuspage', 'data', 'status.db'), target: 'statuspage/status.db', kind: 'file', required: false },

        { source: cfg.redisDumpPath, target: 'redis/dump.rdb', kind: 'file', required: false },
        { source: cfg.redisAofPath, target: 'redis/appendonly.aof', kind: 'file', required: false },

        { source: cfg.pm2DumpPath, target: 'pm2/dump.pm2', kind: 'file', required: false },
        { source: path.join(h, 'fahrstuhl', 'ecosystem.config.js'), target: 'pm2/fahrstuhl-ecosystem.config.js', kind: 'file', required: true },
        { source: path.join(h, 'musikbot', 'ecosystem.config.js'), target: 'pm2/musikbot-ecosystem.config.js', kind: 'file', required: false },

        { source: path.join(h, 'fahrstuhl', '.env'), target: 'env/fahrstuhl.env', kind: 'secret-file', required: false },
        { source: path.join(h, 'fahrstuhl', 'dashboard', '.env'), target: 'env/fahrstuhl-dashboard.env', kind: 'secret-file', required: false },
        { source: path.join(h, 'eseltokens', '.env.local'), target: 'env/eseltokens.env.local', kind: 'secret-file', required: false },
        { source: path.join(h, 'filehoster', '.env'), target: 'env/filehoster.env', kind: 'secret-file', required: false },
        { source: path.join(h, 'linkshortener', '.env'), target: 'env/linkshortener.env', kind: 'secret-file', required: false },
        { source: path.join(h, 'zitat-board', '.env'), target: 'env/zitat-board.env', kind: 'secret-file', required: false },
        { source: path.join(h, 'statuspage', '.env'), target: 'env/statuspage.env', kind: 'secret-file', required: false },
    ];
}

function runBackup() {
    const cfg = getConfig();
    ensureDir(cfg.backupRoot);

    if (exists(cfg.lockFile)) {
        throw new Error(`Backup lock exists at ${cfg.lockFile}. Another backup may still be running.`);
    }

    fs.writeFileSync(cfg.lockFile, String(process.pid));

    const startedAt = new Date().toISOString();
    const stamp = formatSnapshotStamp();
    const snapshotDir = path.join(cfg.backupRoot, stamp);
    ensureDir(snapshotDir);

    const manifest = {
        snapshot: stamp,
        startedAt,
        marvinHome: cfg.marvinHome,
        backupRoot: cfg.backupRoot,
        items: [],
        mysqlDump: null,
    };

    const envFromFahrstuhl = readEnvFile(path.join(cfg.marvinHome, 'fahrstuhl', '.env'));
    const mysqlConfig = {
        host: process.env.MYSQL_HOST || envFromFahrstuhl.MYSQL_HOST || '127.0.0.1',
        port: Number(process.env.MYSQL_PORT || envFromFahrstuhl.MYSQL_PORT || 3306),
        user: process.env.MYSQL_USER || envFromFahrstuhl.MYSQL_USER || '',
        password: process.env.MYSQL_PASSWORD || envFromFahrstuhl.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || envFromFahrstuhl.MYSQL_DATABASE || 'fahrstuhl',
    };

    const mysqlOut = path.join(snapshotDir, 'fahrstuhl', `fahrstuhl-mysql-${stamp}.sql`);
    ensureDir(path.dirname(mysqlOut));
    const mysqlDump = tryMysqlDump({ ...mysqlConfig, outFile: mysqlOut });
    manifest.mysqlDump = { ...mysqlDump, target: path.relative(snapshotDir, mysqlOut) };
    if (mysqlDump.ok) {
        manifest.items.push({
            source: '[mysqldump]',
            target: manifest.mysqlDump.target,
            kind: 'file',
            required: true,
            copy: { ok: true, type: 'file', bytes: mysqlDump.bytes || 0 },
        });
    }

    for (const item of getBackupItems(cfg)) {
        const copy = copyFileOrDir(item.source, path.join(snapshotDir, item.target));
        manifest.items.push({ ...item, copy });
    }

    const verification = verifySnapshot(snapshotDir, manifest);
    const retention = applyRetention(cfg.backupRoot);
    const missingItems = manifest.items
        .filter(i => !i.copy?.ok)
        .map(i => ({ source: i.source, target: i.target, reason: i.copy?.reason || 'unknown', required: i.required !== false }));

    const status = {
        lastRunAt: new Date().toISOString(),
        startedAt,
        finishedAt: new Date().toISOString(),
        snapshot: stamp,
        snapshotDir,
        ok: verification.ok,
        mysqlDump: manifest.mysqlDump,
        copied: manifest.items.filter(i => i.copy?.ok).length,
        missing: missingItems,
        missingCritical: missingItems.filter(item => item.required),
        missingOptional: missingItems.filter(item => !item.required),
        verification,
        retention,
    };

    writeJson(path.join(snapshotDir, 'manifest.json'), manifest);
    writeJson(path.join(snapshotDir, 'verification.json'), verification);
    writeJson(cfg.statusFile, status);

    try { fs.unlinkSync(cfg.lockFile); } catch (_) { }
    return status;
}

function readStatus() {
    const cfg = getConfig();
    if (!exists(cfg.statusFile)) return null;
    return JSON.parse(fs.readFileSync(cfg.statusFile, 'utf8'));
}

if (require.main === module) {
    const args = new Set(process.argv.slice(2));
    try {
        if (args.has('--status')) {
            const status = readStatus();
            console.log(JSON.stringify(status || { ok: false, message: 'No backup status yet' }, null, 2));
            process.exit(0);
        }

        const status = runBackup();
        console.log(`Backup snapshot created: ${status.snapshot}`);
        console.log(`OK: ${status.ok}; copied=${status.copied}; missing=${status.missing.length}`);
        if (status.missing.length) {
            console.log('Missing items (non-fatal):');
            for (const item of status.missing.slice(0, 20)) {
                console.log(`- ${item.source} -> ${item.target} (${item.reason})`);
            }
        }
    } catch (error) {
        const cfg = getConfig();
        writeJson(cfg.statusFile, {
            lastRunAt: new Date().toISOString(),
            ok: false,
            error: error.message,
        });
        console.error('Backup failed:', error.message);
        process.exit(1);
    }
}

module.exports = {
    runBackup,
    readStatus,
};
