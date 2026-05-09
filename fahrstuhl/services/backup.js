const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function parseBool(value, defaultValue = false) {
    if (value === undefined || value === null || value === "") return defaultValue;
    const normalized = String(value).trim().toLowerCase();
    return ["1", "true", "yes", "on"].includes(normalized);
}

function pad2(num) {
    return String(num).padStart(2, "0");
}

function formatTimestamp(date) {
    return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}-${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;
}

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function safeResolveInside(rootDir, candidatePath) {
    const resolvedRoot = path.resolve(rootDir);
    const resolvedCandidate = path.resolve(candidatePath);
    const normalizedRoot = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
    if (!resolvedCandidate.startsWith(normalizedRoot)) {
        throw new Error("Path is outside of backup directory");
    }
    return resolvedCandidate;
}

function verifyMysqlDumpFile(file, minBytes = 256) {
    try {
        const stat = fs.statSync(file);
        if (!stat.isFile()) return { ok: false, size: 0, message: "Backup target is not a file" };
        if (stat.size < minBytes) return { ok: false, size: stat.size, message: `Backup file is too small (${stat.size} bytes)` };

        const fd = fs.openSync(file, "r");
        const buffer = Buffer.alloc(Math.min(4096, stat.size));
        fs.readSync(fd, buffer, 0, buffer.length, 0);
        fs.closeSync(fd);

        const head = buffer.toString("utf8");
        const looksLikeMysqlDump = /MySQL dump|CREATE DATABASE|CREATE TABLE|-- Host:/i.test(head);
        if (!looksLikeMysqlDump) return { ok: false, size: stat.size, message: "Backup file does not look like a mysqldump" };

        return { ok: true, size: stat.size, message: "Backup file verified" };
    } catch (error) {
        return { ok: false, size: 0, message: error.message };
    }
}

function verifyTarGzFile(file, minBytes = 2048) {
    try {
        const stat = fs.statSync(file);
        if (!stat.isFile()) return { ok: false, size: 0, message: "Backup target is not a file" };
        if (stat.size < minBytes) return { ok: false, size: stat.size, message: `Archive is too small (${stat.size} bytes)` };

        const fd = fs.openSync(file, "r");
        const buf = Buffer.alloc(2);
        fs.readSync(fd, buf, 0, 2, 0);
        fs.closeSync(fd);
        const looksGzip = buf[0] === 0x1f && buf[1] === 0x8b;
        if (!looksGzip) return { ok: false, size: stat.size, message: "Archive does not look like gzip (.tar.gz)" };

        return { ok: true, size: stat.size, message: "Archive verified" };
    } catch (error) {
        return { ok: false, size: 0, message: error.message };
    }
}

function cleanupOldFiles(dir, suffix, maxFiles) {
    try {
        const files = fs.readdirSync(dir)
            .filter((file) => file.endsWith(suffix))
            .map((file) => ({
                file,
                path: path.join(dir, file),
                mtime: fs.statSync(path.join(dir, file)).mtimeMs,
            }))
            .sort((a, b) => b.mtime - a.mtime);

        if (files.length <= maxFiles) return;
        for (const entry of files.slice(maxFiles)) {
            fs.unlinkSync(entry.path);
        }
    } catch (err) {
        console.error("Backup cleanup failed:", err);
    }
}

function spawnForResult(cmd, args, options = {}) {
    return new Promise((resolve) => {
        const proc = spawn(cmd, args, { windowsHide: true, ...options });
        let stdout = "";
        let stderr = "";
        if (proc.stdout) proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
        if (proc.stderr) proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
        proc.on("error", (err) => resolve({ code: -1, stdout, stderr: `${stderr}${err.message || String(err)}` }));
        proc.on("close", (code) => resolve({ code, stdout, stderr }));
    });
}

function createBackupManager({ logToMaster }) {
    // MySQL dump backups (existing behavior)
    const enabled = parseBool(process.env.MYSQL_BACKUP_ENABLED, true);
    const intervalHours = Number(process.env.MYSQL_BACKUP_INTERVAL_HOURS || 24);
    const maxFiles = Number(process.env.MYSQL_BACKUP_MAX_FILES || 14);
    const runOnStart = parseBool(process.env.MYSQL_BACKUP_RUN_ON_START, false);

    const host = process.env.MYSQL_HOST || "127.0.0.1";
    const port = Number(process.env.MYSQL_PORT || 3306);
    const user = process.env.MYSQL_USER || "root";
    const password = process.env.MYSQL_PASSWORD || "";
    const database = process.env.MYSQL_DATABASE || "fahrstuhl";

    const backupDir = process.env.MYSQL_BACKUP_DIR || path.join(__dirname, "..", "backups");
    const mysqldumpPath = process.env.MYSQLDUMP_PATH || "mysqldump";
    const mysqlPath = process.env.MYSQL_PATH || "mysql";
    const minBackupBytes = Number(process.env.MYSQL_BACKUP_MIN_BYTES || 256);

    // Files backups (new)
    const filesEnabled = parseBool(process.env.FILES_BACKUP_ENABLED, true);
    const filesIntervalHours = Number(process.env.FILES_BACKUP_INTERVAL_HOURS || intervalHours || 24);
    const filesMaxFiles = Number(process.env.FILES_BACKUP_MAX_FILES || maxFiles || 14);
    const filesBackupDir = process.env.FILES_BACKUP_DIR || path.join(backupDir, "files");
    const tarPath = process.env.TAR_PATH || "tar";
    const filesMinBytes = Number(process.env.FILES_BACKUP_MIN_BYTES || 2048);
    const includeEnvFile = parseBool(process.env.FILES_BACKUP_INCLUDE_ENV, true);
    const includeListRaw = process.env.FILES_BACKUP_INCLUDE || "dashboard,services,utils,scripts,docs,ecosystem.config.js,package.json,package-lock.json,.env,.env.local";
    const excludeListRaw = process.env.FILES_BACKUP_EXCLUDE || "node_modules,backups,logs,.git";

    // When a DB backup succeeds, also create a files backup with the same timestamp.
    const fullBackupOnMysqlRun = parseBool(process.env.FULL_BACKUP_ON_MYSQL_RUN, true);

    const projectRoot = path.join(__dirname, "..");

    let timer = null;
    let filesTimer = null;

    let lastBackupAt = 0;
    let lastBackupFile = null;
    let lastBackupError = null;
    let lastBackupSize = 0;
    let lastVerificationAt = 0;
    let lastVerificationOk = false;
    let lastVerificationError = null;
    let running = false;

    let lastFilesBackupAt = 0;
    let lastFilesBackupFile = null;
    let lastFilesBackupError = null;
    let lastFilesBackupSize = 0;
    let lastFilesVerificationAt = 0;
    let lastFilesVerificationOk = false;
    let lastFilesVerificationError = null;
    let filesRunning = false;

    function getFilesIncludeList() {
        const items = includeListRaw.split(",").map((s) => s.trim()).filter(Boolean);
        const filtered = items.filter((item) => {
            if (!includeEnvFile && (item === ".env" || item === ".env.local")) return false;
            return true;
        });

        const existing = [];
        for (const item of filtered) {
            const p = path.join(projectRoot, item);
            if (fs.existsSync(p)) existing.push(item);
        }
        return existing;
    }

    function getFilesExcludeList() {
        return excludeListRaw.split(",").map((s) => s.trim()).filter(Boolean);
    }

    async function runFilesBackup(forcedTimestamp = null) {
        if (!filesEnabled || filesRunning) return;
        filesRunning = true;
        lastFilesBackupError = null;

        ensureDir(filesBackupDir);
        const timestamp = forcedTimestamp || formatTimestamp(new Date());
        const filename = `files-${timestamp}.tar.gz`;
        const filepath = path.join(filesBackupDir, filename);

        const includeList = getFilesIncludeList();
        if (!includeList.length) {
            lastFilesBackupError = "No include paths exist for files backup";
            lastFilesVerificationAt = Date.now();
            lastFilesVerificationOk = false;
            lastFilesVerificationError = lastFilesBackupError;
            filesRunning = false;
            return;
        }

        const args = ["-czf", filepath];
        for (const ex of getFilesExcludeList()) args.push(`--exclude=${ex}`);
        args.push("-C", projectRoot, ...includeList);

        const result = await spawnForResult(tarPath, args);
        if (result.code === 0) {
            const verification = verifyTarGzFile(filepath, filesMinBytes);
            lastFilesVerificationAt = Date.now();
            lastFilesVerificationOk = verification.ok;
            lastFilesVerificationError = verification.ok ? null : verification.message;
            lastFilesBackupSize = verification.size || 0;

            if (!verification.ok) {
                lastFilesBackupError = verification.message;
                try { if (fs.existsSync(filepath)) fs.unlinkSync(filepath); } catch {}
                filesRunning = false;
                return;
            }

            lastFilesBackupAt = lastFilesVerificationAt;
            lastFilesBackupFile = filepath;
            cleanupOldFiles(filesBackupDir, ".tar.gz", filesMaxFiles);
        } else {
            lastFilesBackupError = (result.stderr || result.stdout || "tar failed").slice(0, 2000);
            lastFilesVerificationAt = Date.now();
            lastFilesVerificationOk = false;
            lastFilesVerificationError = lastFilesBackupError;
            lastFilesBackupSize = 0;
            try { if (fs.existsSync(filepath)) fs.unlinkSync(filepath); } catch {}
        }

        filesRunning = false;
    }

    async function runBackup() {
        if (!enabled || running) return;
        running = true;
        lastBackupError = null;

        ensureDir(backupDir);
        const timestamp = formatTimestamp(new Date());
        const filename = `backup-${database}-${timestamp}.sql`;
        const filepath = path.join(backupDir, filename);

        const args = ["-h", host, "-P", String(port), "-u", user, "--single-transaction", "--quick", "--databases", database];
        if (password) args.splice(6, 0, `--password=${password}`);

        const dumpProcess = spawn(mysqldumpPath, args, { windowsHide: true });
        const output = fs.createWriteStream(filepath);
        let stderr = "";

        const outputFinished = new Promise((resolve) => {
            let settled = false;
            const done = () => {
                if (settled) return;
                settled = true;
                resolve();
            };
            output.on("finish", done);
            output.on("close", done);
            output.on("error", (err) => {
                stderr += `${err.message || String(err)}\n`;
                done();
            });
            setTimeout(done, 5000);
        });

        dumpProcess.stdout.pipe(output);
        dumpProcess.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

        const exitCode = await new Promise((resolve) => {
            dumpProcess.on("error", (err) => {
                const isMissing = err.code === "ENOENT" || err.message?.includes("spawn");
                if (isMissing) stderr += `Executable not found: ${mysqldumpPath}. Update PATH or set MYSQLDUMP_PATH.\n`;
                stderr += err.message || String(err);
                resolve(-1);
            });
            dumpProcess.on("close", (code) => resolve(code));
        });

        if (exitCode === 0) {
            await outputFinished;
            const verification = verifyMysqlDumpFile(filepath, minBackupBytes);
            lastVerificationAt = Date.now();
            lastVerificationOk = verification.ok;
            lastVerificationError = verification.ok ? null : verification.message;
            lastBackupSize = verification.size || 0;

            if (!verification.ok) {
                lastBackupError = verification.message;
                try { if (fs.existsSync(filepath)) fs.unlinkSync(filepath); } catch {}
                if (logToMaster) {
                    logToMaster({
                        title: "⚠️ Backup ungueltig",
                        description: `mysqldump lief durch, aber die Datei wurde nicht akzeptiert:\n\`${verification.message}\``,
                        color: 0xED4245
                    }, "ERRORS");
                }
                running = false;
                return;
            }

            lastBackupAt = lastVerificationAt;
            lastBackupFile = filepath;
            cleanupOldFiles(backupDir, ".sql", maxFiles);

            if (fullBackupOnMysqlRun) {
                try {
                    await runFilesBackup(timestamp);
                } catch (err) {
                    lastFilesBackupError = err?.message || String(err);
                }
            }

            if (logToMaster) {
                logToMaster({
                    title: "🗄️ Backup erstellt",
                    description: `Datenbank-Backup erfolgreich gespeichert und verifiziert.\nDatei: \`${filename}\`\nGroesse: **${Math.round(lastBackupSize / 1024)} KB**`,
                    color: 0x57F287
                }, "SYSTEM");
            }
        } else {
            await outputFinished;
            lastBackupError = stderr || "mysqldump fehlgeschlagen";
            lastVerificationAt = Date.now();
            lastVerificationOk = false;
            lastVerificationError = lastBackupError;
            lastBackupSize = 0;
            try { if (fs.existsSync(filepath)) fs.unlinkSync(filepath); } catch {}
            if (logToMaster) {
                logToMaster({
                    title: "⚠️ Backup fehlgeschlagen",
                    description: `mysqldump Fehler:\n\`\`\`${lastBackupError.slice(0, 1500)}\`\`\``,
                    color: 0xED4245
                }, "ERRORS");
            }
        }

        running = false;
    }

    function start() {
        if (!enabled || timer) return;
        const intervalMs = Math.max(1, intervalHours) * 60 * 60 * 1000;
        timer = setInterval(() => {
            runBackup().catch((err) => {
                lastBackupError = err?.message || String(err);
                running = false;
            });
        }, intervalMs);
        if (runOnStart) runBackup().catch(() => {});

        if (filesEnabled && !filesTimer) {
            const filesIntervalMs = Math.max(1, filesIntervalHours) * 60 * 60 * 1000;
            filesTimer = setInterval(() => {
                runFilesBackup().catch((err) => {
                    lastFilesBackupError = err?.message || String(err);
                    filesRunning = false;
                });
            }, filesIntervalMs);
        }
    }

    function stop() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        if (filesTimer) {
            clearInterval(filesTimer);
            filesTimer = null;
        }
    }

    function getStatus() {
        return {
            enabled,
            running,
            backupDir,
            intervalHours,
            maxFiles,
            lastBackupAt,
            lastBackupFile,
            lastBackupError,
            lastBackupSize,
            lastVerificationAt,
            lastVerificationOk,
            lastVerificationError,
            files: {
                enabled: filesEnabled,
                running: filesRunning,
                backupDir: filesBackupDir,
                intervalHours: filesIntervalHours,
                maxFiles: filesMaxFiles,
                include: getFilesIncludeList(),
                exclude: getFilesExcludeList(),
                lastBackupAt: lastFilesBackupAt || null,
                lastBackupFile: lastFilesBackupFile || null,
                lastBackupError: lastFilesBackupError || null,
                lastBackupSize: lastFilesBackupSize || 0,
                lastVerificationAt: lastFilesVerificationAt || null,
                lastVerificationOk: !!lastFilesVerificationOk,
                lastVerificationError: lastFilesVerificationError || null,
            }
        };
    }

    async function verifyLatestBackup() {
        if (!lastBackupFile) return { ok: false, size: 0, message: "No successful backup recorded" };
        const verification = verifyMysqlDumpFile(lastBackupFile, minBackupBytes);
        lastVerificationAt = Date.now();
        lastVerificationOk = verification.ok;
        lastVerificationError = verification.ok ? null : verification.message;
        lastBackupSize = verification.size || 0;
        if (!verification.ok) lastBackupError = verification.message;
        return verification;
    }

    function listBackups() {
        const mysqlFiles = [];
        const filesArchives = [];

        try {
            if (fs.existsSync(backupDir)) {
                for (const file of fs.readdirSync(backupDir)) {
                    if (!file.endsWith(".sql")) continue;
                    const p = path.join(backupDir, file);
                    const st = fs.statSync(p);
                    if (!st.isFile()) continue;
                    mysqlFiles.push({ file, size: st.size, mtime: st.mtimeMs });
                }
            }
        } catch {}

        try {
            if (fs.existsSync(filesBackupDir)) {
                for (const file of fs.readdirSync(filesBackupDir)) {
                    if (!file.endsWith(".tar.gz")) continue;
                    const p = path.join(filesBackupDir, file);
                    const st = fs.statSync(p);
                    if (!st.isFile()) continue;
                    filesArchives.push({ file, size: st.size, mtime: st.mtimeMs });
                }
            }
        } catch {}

        mysqlFiles.sort((a, b) => b.mtime - a.mtime);
        filesArchives.sort((a, b) => b.mtime - a.mtime);

        return {
            mysql: mysqlFiles,
            files: filesArchives,
        };
    }

    function resolveMysqlBackupFile(fileName) {
        if (!/\.sql$/i.test(fileName)) throw new Error("Invalid SQL file name");
        const candidate = path.join(backupDir, fileName);
        return safeResolveInside(backupDir, candidate);
    }

    function resolveFilesBackupFile(fileName) {
        if (!/\.tar\.gz$/i.test(fileName)) throw new Error("Invalid archive file name");
        const candidate = path.join(filesBackupDir, fileName);
        return safeResolveInside(filesBackupDir, candidate);
    }

    async function restoreMysqlBackup(fileName) {
        const sqlFile = resolveMysqlBackupFile(fileName);
        if (!fs.existsSync(sqlFile)) throw new Error("SQL backup file does not exist");

        const args = ["-h", host, "-P", String(port), "-u", user];
        if (password) args.push(`--password=${password}`);

        const proc = spawn(mysqlPath, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
        let stderr = "";
        proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

        const done = new Promise((resolve) => {
            proc.on("error", (err) => resolve({ code: -1, stderr: `${stderr}${err.message || String(err)}` }));
            proc.on("close", (code) => resolve({ code, stderr }));
        });

        await new Promise((resolve, reject) => {
            const rs = fs.createReadStream(sqlFile);
            rs.on("error", reject);
            rs.on("end", resolve);
            rs.pipe(proc.stdin);
        });

        const result = await done;
        if (result.code !== 0) throw new Error((result.stderr || "mysql restore failed").slice(0, 2000));
        return { ok: true };
    }

    async function restoreFilesBackup(fileName) {
        const archive = resolveFilesBackupFile(fileName);
        if (!fs.existsSync(archive)) throw new Error("Files backup archive does not exist");

        const args = ["-xzf", archive, "--overwrite", "-C", projectRoot];
        const result = await spawnForResult(tarPath, args);
        if (result.code !== 0) throw new Error((result.stderr || result.stdout || "tar restore failed").slice(0, 2000));
        return { ok: true };
    }

    return {
        start,
        stop,
        runBackup,
        runFilesBackup,
        verifyLatestBackup,
        listBackups,
        restoreMysqlBackup,
        restoreFilesBackup,
        getStatus,
    };
}

module.exports = {
    createBackupManager
};

