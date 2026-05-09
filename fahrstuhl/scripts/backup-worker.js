#!/usr/bin/env node
/* eslint-disable no-console */

const { runBackup } = require('./backup-all');

const intervalMinutes = Math.max(5, Number(process.env.BACKUP_INTERVAL_MINUTES || 60));
const runOnStart = String(process.env.BACKUP_RUN_ON_START || 'true').toLowerCase() !== 'false';

let running = false;

async function tick(reason) {
    if (running) return;
    running = true;
    try {
        const status = runBackup();
        console.log(`[backup-worker] ${reason}: snapshot=${status.snapshot} ok=${status.ok} copied=${status.copied}`);
    } catch (error) {
        console.error(`[backup-worker] ${reason} failed:`, error.message);
    } finally {
        running = false;
    }
}

if (runOnStart) {
    tick('startup').catch(() => {});
}

setInterval(() => {
    tick('interval').catch(() => {});
}, intervalMinutes * 60 * 1000);

console.log(`[backup-worker] started (interval=${intervalMinutes}m, runOnStart=${runOnStart})`);
