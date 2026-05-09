#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const os = require('os');
const path = require('path');

function safeStat(file) {
    try {
        return fs.statSync(file);
    } catch {
        return null;
    }
}

function isDir(file) {
    const stat = safeStat(file);
    return !!stat && stat.isDirectory();
}

function readJson(file, fallback = null) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return fallback;
    }
}

function parseSnapshotStamp(name) {
    const match = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(name);
    if (!match) return null;
    const [, y, m, d, hh, mm, ss] = match;
    const date = new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
    return Number.isNaN(date.getTime()) ? null : date;
}

function listSnapshots(root) {
    if (!isDir(root)) return [];
    return fs.readdirSync(root)
        .map(name => ({ name, dir: path.join(root, name), date: parseSnapshotStamp(name) }))
        .filter(item => item.date && isDir(item.dir))
        .sort((a, b) => b.date - a.date);
}

function parseArgs(argv) {
    const args = { snapshot: null, backupRoot: process.env.BACKUP_ROOT || '/home/marvin/backups', target: null };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--snapshot') args.snapshot = argv[i + 1] || null;
        if (arg === '--backup-root') args.backupRoot = argv[i + 1] || args.backupRoot;
        if (arg === '--target') args.target = argv[i + 1] || null;
    }
    return args;
}

function copySnapshot(snapshotDir, targetDir) {
    fs.cpSync(snapshotDir, targetDir, { recursive: true, force: true, errorOnExist: false });
}

function verifyRestoreTarget(targetDir) {
    const manifest = readJson(path.join(targetDir, 'manifest.json'), null);
    const verification = readJson(path.join(targetDir, 'verification.json'), null);

    const checks = [];
    checks.push({ name: 'manifest.json exists', ok: !!manifest });
    checks.push({ name: 'verification.json exists', ok: !!verification });

    if (manifest && Array.isArray(manifest.items)) {
        for (const item of manifest.items.slice(0, 200)) {
            const file = path.join(targetDir, item.target);
            const required = item.required !== false;
            checks.push({
                name: `restored ${item.target}`,
                required,
                ok: !!safeStat(file) || !required,
            });
        }
    }

    const failed = checks.filter(check => !check.ok);
    return {
        ok: failed.length === 0,
        total: checks.length,
        failed: failed.length,
        failedChecks: failed,
    };
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const snapshots = listSnapshots(args.backupRoot);
    if (!snapshots.length) {
        console.error(`No snapshots found in ${args.backupRoot}`);
        process.exit(1);
    }

    const selected = args.snapshot
        ? snapshots.find(s => s.name === args.snapshot)
        : snapshots[0];

    if (!selected) {
        console.error(`Snapshot not found: ${args.snapshot}`);
        process.exit(1);
    }

    const target = args.target || path.join(os.tmpdir(), `restore-test-${selected.name}`);
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(target, { recursive: true });

    copySnapshot(selected.dir, target);
    const result = verifyRestoreTarget(target);

    console.log(JSON.stringify({
        snapshot: selected.name,
        source: selected.dir,
        restoredTo: target,
        ...result,
    }, null, 2));

    if (!result.ok) {
        process.exit(2);
    }
}

if (require.main === module) {
    main();
}
