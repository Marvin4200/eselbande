#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (!a.startsWith("--")) continue;
        const key = a.slice(2);
        const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
        out[key] = val;
    }
    return out;
}

function writeJson(file, data) {
    try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (e) {
        // best effort
    }
}

function spawnForResult(cmd, args, options = {}) {
    return new Promise((resolve) => {
        const proc = spawn(cmd, args, { windowsHide: true, ...options });
        let stdout = "";
        let stderr = "";
        if (proc.stdout) proc.stdout.on("data", (c) => { stdout += c.toString(); });
        if (proc.stderr) proc.stderr.on("data", (c) => { stderr += c.toString(); });
        proc.on("error", (err) => resolve({ code: -1, stdout, stderr: `${stderr}${err.message || String(err)}` }));
        proc.on("close", (code) => resolve({ code, stdout, stderr }));
    });
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const projectRoot = path.join(__dirname, "..");
    const backupDir = process.env.MYSQL_BACKUP_DIR || path.join(projectRoot, "backups");
    const filesBackupDir = process.env.FILES_BACKUP_DIR || path.join(backupDir, "files");
    const stateFile = path.join(backupDir, "restore-state.json");

    const mode = (args.mode || "full").toLowerCase(); // full | db | files
    const sqlFileName = args.sql || args.db || "";
    const filesFileName = args.files || "";
    const restart = String(args.restart || "true").toLowerCase() !== "false";
    const pm2Processes = (args.pm2 || "fahrstuhl dashboard-php").split(/\s+/).filter(Boolean);

    const startState = {
        running: true,
        mode,
        sql: sqlFileName || null,
        files: filesFileName || null,
        restart,
        pm2: pm2Processes,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        ok: null,
        error: null,
        steps: [],
    };
    writeJson(stateFile, startState);

    try {
        // Small delay so the API endpoint can answer before we stop services.
        await sleep(1500);

        if (restart && pm2Processes.length) {
            startState.steps.push({ at: new Date().toISOString(), step: "pm2_stop", detail: pm2Processes.join(" ") });
            writeJson(stateFile, startState);
            await spawnForResult("pm2", ["stop", ...pm2Processes]);
        }

        if (mode === "files" || mode === "full") {
            if (!filesFileName) throw new Error("Missing --files argument");
            const archive = path.resolve(filesBackupDir, filesFileName);
            startState.steps.push({ at: new Date().toISOString(), step: "restore_files", detail: filesFileName });
            writeJson(stateFile, startState);
            const res = await spawnForResult(process.env.TAR_PATH || "tar", ["-xzf", archive, "--overwrite", "-C", projectRoot]);
            if (res.code !== 0) throw new Error((res.stderr || res.stdout || "tar restore failed").slice(0, 2000));
        }

        if (mode === "db" || mode === "full") {
            if (!sqlFileName) throw new Error("Missing --sql argument");
            const sqlPath = path.resolve(backupDir, sqlFileName);
            startState.steps.push({ at: new Date().toISOString(), step: "restore_db", detail: sqlFileName });
            writeJson(stateFile, startState);

            const mysqlPath = process.env.MYSQL_PATH || "mysql";
            const mysqlArgs = ["-h", process.env.MYSQL_HOST || "127.0.0.1", "-P", String(process.env.MYSQL_PORT || 3306), "-u", process.env.MYSQL_USER || "root"];
            if (process.env.MYSQL_PASSWORD) mysqlArgs.push(`--password=${process.env.MYSQL_PASSWORD}`);
            const proc = spawn(mysqlPath, mysqlArgs, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
            let stderr = "";
            proc.stderr.on("data", (c) => { stderr += c.toString(); });

            const done = new Promise((resolve) => {
                proc.on("error", (err) => resolve({ code: -1, stderr: `${stderr}${err.message || String(err)}` }));
                proc.on("close", (code) => resolve({ code, stderr }));
            });

            await new Promise((resolve, reject) => {
                const rs = fs.createReadStream(sqlPath);
                rs.on("error", reject);
                rs.on("end", resolve);
                rs.pipe(proc.stdin);
            });

            const r = await done;
            if (r.code !== 0) throw new Error((r.stderr || "mysql restore failed").slice(0, 2000));
        }

        if (restart && pm2Processes.length) {
            startState.steps.push({ at: new Date().toISOString(), step: "pm2_restart", detail: pm2Processes.join(" ") });
            writeJson(stateFile, startState);
            await spawnForResult("pm2", ["restart", ...pm2Processes, "--update-env"]);
            await spawnForResult("pm2", ["save"]);
        }

        startState.running = false;
        startState.ok = true;
        startState.finishedAt = new Date().toISOString();
        writeJson(stateFile, startState);
    } catch (err) {
        startState.running = false;
        startState.ok = false;
        startState.error = err?.message || String(err);
        startState.finishedAt = new Date().toISOString();
        writeJson(stateFile, startState);
        process.exitCode = 1;
    }
}

main();

