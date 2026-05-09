const fs = require("fs");
const path = require("path");

const DEFAULT_SITES_ENABLED_DIR = "/etc/nginx/sites-enabled";

function readText(file) {
    try {
        return fs.readFileSync(file, "utf8");
    } catch {
        return "";
    }
}

function isBackupLike(filename) {
    return /\.(bak|backup|old|orig|save)(\.|-|_|$)/i.test(filename)
        || /\.bak/i.test(filename)
        || /~$/.test(filename);
}

function parseServerNames(content) {
    const names = [];
    const re = /^\s*server_name\s+([^;]+);/gm;
    let match;
    while ((match = re.exec(content)) !== null) {
        const parts = match[1].split(/\s+/).map(part => part.trim()).filter(Boolean);
        names.push(...parts);
    }
    return names;
}

function auditNginxSitesEnabled(dir = process.env.NGINX_SITES_ENABLED_DIR || DEFAULT_SITES_ENABLED_DIR) {
    const result = {
        available: false,
        dir,
        files: [],
        backupFiles: [],
        duplicateServerNames: [],
        warnings: [],
    };

    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
            .filter(entry => entry.isFile() || entry.isSymbolicLink())
            .map(entry => entry.name)
            .sort();

        result.available = true;
        result.files = entries;
        result.backupFiles = entries.filter(isBackupLike);

        // Track which enabled file(s) declare each server_name.
        // Multiple server blocks in the same file (80 redirect + 443) are normal and should not be flagged.
        const serverNameOwners = new Map(); // serverName -> Set(filename)
        for (const filename of entries) {
            const fullPath = path.join(dir, filename);
            const names = parseServerNames(readText(fullPath));
            for (const name of names) {
                if (!serverNameOwners.has(name)) serverNameOwners.set(name, new Set());
                serverNameOwners.get(name).add(filename);
            }
        }

        result.duplicateServerNames = [...serverNameOwners.entries()]
            .map(([serverName, owners]) => ({ serverName, files: [...owners].sort() }))
            .filter(entry => entry.files.length > 1);

        if (result.backupFiles.length > 0) {
            result.warnings.push({
                severity: "warn",
                title: "Nginx backup files are enabled",
                detail: `${result.backupFiles.length} backup-like file(s) in ${dir}: ${result.backupFiles.slice(0, 5).join(", ")}`,
                fix: "Move *.bak* files out of /etc/nginx/sites-enabled and reload nginx after nginx -t passes.",
            });
        }

        if (result.duplicateServerNames.length > 0) {
            result.warnings.push({
                severity: "warn",
                title: "Nginx duplicate server_name entries",
                detail: result.duplicateServerNames
                    .slice(0, 5)
                    .map(entry => `${entry.serverName}: ${entry.files.join(", ")}`)
                    .join(" | "),
                fix: "Only keep the active site config in sites-enabled; store backups outside that directory.",
            });
        }
    } catch (error) {
        result.error = error.message;
        result.warnings.push({
            severity: "info",
            title: "Nginx config scan unavailable",
            detail: error.message,
            fix: "Run the dashboard process with permission to read /etc/nginx/sites-enabled or set NGINX_SITES_ENABLED_DIR.",
        });
    }

    return result;
}

module.exports = {
    auditNginxSitesEnabled,
};
