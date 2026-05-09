const fs = require("fs");
const path = require("path");

function parseBool(value, defaultValue = true) {
    if (value === undefined || value === null || value === "") return defaultValue;
    return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function readJson(file, fallback) {
    try {
        if (!fs.existsSync(file)) return fallback;
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return fallback;
    }
}

function writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function normalizeWarnings(summary) {
    return (summary?.warnings || [])
        .filter(warning => warning && warning.title)
        .map(warning => ({
            severity: warning.severity || "warn",
            title: String(warning.title),
            detail: String(warning.detail || ""),
            fix: String(warning.fix || ""),
        }))
        .sort((a, b) => `${a.severity}:${a.title}`.localeCompare(`${b.severity}:${b.title}`));
}

function signatureFor(warnings) {
    return warnings.map(warning => `${warning.severity}|${warning.title}|${warning.detail}`).join("\n");
}

function formatWarning(warning) {
    const fix = warning.fix ? `\nFix: ${warning.fix}` : "";
    return `**${warning.severity.toUpperCase()}** ${warning.title}\n${warning.detail || "No detail"}${fix}`;
}

function detectTriggerTypes(warnings) {
    const text = warnings.map(w => `${w.title} ${w.detail}`.toLowerCase()).join('\n');
    const out = [];
    if (text.includes('is down')) out.push('service_down');
    if (text.includes('restart loop')) out.push('restart_loop');
    if (text.includes('high memory')) out.push('high_memory');
    if (text.includes('deploy failed')) out.push('failed_deploy');
    if (text.includes('redis')) out.push('redis_down');
    if (text.includes('lavalink')) out.push('lavalink_down');
    return Array.from(new Set(out));
}

async function sendWebhookAlert(webhookUrl, embed) {
    if (!webhookUrl) return;
    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] }),
        });
    } catch (error) {
        console.warn('Ops webhook send failed:', error.message);
    }
}

function createOpsAlertManager({ logToMaster, getSummary }) {
    const enabled = parseBool(process.env.OPS_ALERTS_ENABLED, true);
    const intervalMs = Number(process.env.OPS_ALERT_INTERVAL_MS || 5 * 60 * 1000);
    const cooldownMs = Number(process.env.OPS_ALERT_COOLDOWN_MS || 30 * 60 * 1000);
    const startupDelayMs = Number(process.env.OPS_ALERT_STARTUP_DELAY_MS || 90 * 1000);
    const webhookUrl = String(process.env.OPS_ALERT_WEBHOOK_URL || '').trim();
    const webhookRecovery = parseBool(process.env.OPS_ALERT_WEBHOOK_RECOVERY, true);
    const stateFile = process.env.OPS_ALERT_STATE_FILE || path.join(__dirname, "..", "data", "ops-alert-state.json");
    let timer = null;
    let running = false;

    async function checkNow(reason = "scheduled") {
        if (!enabled || running) return null;
        running = true;
        try {
            const state = readJson(stateFile, {});
            const summary = await getSummary();
            const warnings = normalizeWarnings(summary);
            const signature = signatureFor(warnings);
            const now = Date.now();
            const sameSignature = signature && signature === state.lastSignature;
            const withinCooldown = sameSignature && state.lastSentAt && now - state.lastSentAt < cooldownMs;

            if (warnings.length === 0) {
                if (state.lastSignature) {
                    await logToMaster({
                        title: "✅ Ops wieder sauber",
                        description: "Health, PM2, Backup und Server-Checks melden keine aktiven Warnungen mehr.",
                        color: 0x57F287,
                        fields: [{ name: "Reason", value: reason, inline: true }],
                    }, "SYSTEM");
                    if (webhookUrl && webhookRecovery) {
                        await sendWebhookAlert(webhookUrl, {
                            title: '✅ Ops recovered',
                            description: 'All monitored checks are healthy again.',
                            color: 0x57F287,
                            fields: [{ name: 'Reason', value: reason, inline: true }],
                            timestamp: new Date().toISOString(),
                        });
                    }
                }
                writeJson(stateFile, { lastSignature: "", lastSentAt: 0, recoveredAt: now });
                return { sent: !!state.lastSignature, warnings: 0 };
            }

            if (withinCooldown) return { sent: false, throttled: true, warnings: warnings.length };

            const critical = warnings.filter(warning => warning.severity === "critical").length;
            const description = warnings.slice(0, 8).map(formatWarning).join("\n\n");
            const triggerTypes = detectTriggerTypes(warnings);

            await logToMaster({
                title: critical > 0 ? "🚨 Ops Warnung: kritisch" : "⚠️ Ops Warnung",
                description,
                color: critical > 0 ? 0xED4245 : 0xFEE75C,
                fields: [
                    { name: "Warnings", value: String(warnings.length), inline: true },
                    { name: "Critical", value: String(critical), inline: true },
                    { name: "Reason", value: reason, inline: true },
                    { name: 'Triggers', value: triggerTypes.length ? triggerTypes.join(', ') : 'generic', inline: false },
                ],
                footer: { text: "Wiederholungen werden automatisch gedrosselt." },
            }, critical > 0 ? "ERRORS" : "SYSTEM");

            if (webhookUrl) {
                await sendWebhookAlert(webhookUrl, {
                    title: critical > 0 ? '🚨 Ops Alert (critical)' : '⚠️ Ops Alert',
                    description,
                    color: critical > 0 ? 0xED4245 : 0xFEE75C,
                    fields: [
                        { name: 'Warnings', value: String(warnings.length), inline: true },
                        { name: 'Critical', value: String(critical), inline: true },
                        { name: 'Reason', value: reason, inline: true },
                        { name: 'Triggers', value: triggerTypes.length ? triggerTypes.join(', ') : 'generic', inline: false },
                    ],
                    footer: { text: 'Eselbande Ops Alerts' },
                    timestamp: new Date().toISOString(),
                });
            }

            writeJson(stateFile, { lastSignature: signature, lastSentAt: now, lastWarnings: warnings });
            return { sent: true, warnings: warnings.length, critical };
        } catch (error) {
            console.error("Ops alert check failed:", error);
            return { sent: false, error: error.message };
        } finally {
            running = false;
        }
    }

    function start() {
        if (!enabled || timer) return;
        const safeInterval = Math.max(intervalMs, 60_000);
        timer = setInterval(() => {
            checkNow("scheduled").catch(error => console.error("Ops alert interval failed:", error));
        }, safeInterval);
        setTimeout(() => {
            checkNow("startup").catch(error => console.error("Ops alert startup check failed:", error));
        }, Math.max(startupDelayMs, 10_000));
        console.log(`✅ Ops alerting started (${Math.round(safeInterval / 1000)}s interval)`);
    }

    function stop() {
        if (!timer) return;
        clearInterval(timer);
        timer = null;
        console.log("✅ Ops alerting stopped");
    }

    return { start, stop, checkNow };
}

module.exports = {
    createOpsAlertManager,
};
