// In-memory tracker für AutoMod-Verstöße pro User (pro Guild)
const autoModStrikeMap = new Map(); // guildId -> Map(userId -> [timestamps])
const autoModMessageMap = new Map(); // guildId -> Map(userId -> recent messages)
const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    PermissionsBitField,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActivityType,
    MessageFlags,
    Events,
    AuditLogEvent,
} = require("discord.js");
const { getVoiceConnection } = require("@discordjs/voice");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { version: BOT_VERSION } = require("./package.json");

require("dotenv").config();

// In-memory log buffer (last 500 lines) for dashboard /logs endpoint
global._logBuffer = [];
// Note: Console logging will be intercepted by botAPI.js pushLog() when it loads
// This ensures all logs go to both the buffer and SSE clients

// Validate environment variables before starting bot
const { validateEnv } = require("./utils/envValidator");
validateEnv();

const {
    safeReply,
    retryDiscordAPI,
    getTrollKey,
    cleanupUserOperations,
    isUserImmune,
    canBotManageMember,
    checkBotManageMember,
    clearStoredTimeout
} = require("./utils/index");
const {
    initConfig,
    reloadCache,
    getGuildConfig,
    setGuildConfig,
    getUserStats,
    setUserStats,
    getGlobalStats,
    getCacheStatus,
    incrementGlobalStat,
    flushGlobalStats
} = require("./utils/config");
const { getDbStatus } = require("./utils/db");
const { commands, handleInteraction } = require("./commands/index");
const { createLogger } = require("./services/logger");
const { createTrollManager } = require("./services/trolls");
const { createBackupManager } = require("./services/backup");
// Load BotAPIServer BEFORE other initializations to set up log interception
const BotAPIServer = require("./services/botAPI");
const { TIMINGS, COLORS } = require("./utils/constants");
const AuditLogger = require("./utils/auditLogger");
const RateLimiter = require("./utils/rateLimiter");
const VoiceConnectionTracker = require("./utils/voiceConnectionTracker");
const { createVoiceUsageTracker } = require("./utils/voiceUsageTracker");
const { createVoiceRewardBridge } = require("./utils/voiceRewardBridge");
const levelingManager = require("./utils/levelingManager");
const ticketManager = require("./utils/ticketManager");
const socialNotifier = require("./utils/socialNotifier");
const freeGamesNotifier = require("./utils/freeGamesNotifier");
const { sendServerLog } = require("./utils/serverLogger");
const { parseBoolean } = require("./utils/valueParsers");
const { HealthCheckManager, setupDefaultHealthChecks } = require("./utils/healthCheck");
const blacklistManager = require("./utils/blacklistManager");
const GracefulDegradation = require("./utils/gracefulDegradation");
const MetricsCollector = require("./utils/metricsCollector");
const GuildAwareCooldown = require("./utils/guildAwareCooldown");
const notificationManager = require("./utils/notificationManager");
const { createOpsAlertManager } = require("./utils/opsAlertManager");
const token = process.env.TOKEN;
const OWNER_ID = process.env.OWNER_ID || "740958995887685696";
const CLIENT_ID = "1487187616674611321";

const DEV_GUILD_ID = "483321401529597962";
const DEV_CATEGORY_ID = "1489213313006043310";

const LOG_CHANNELS = {
    COMMANDS: "⌨️-commands",
    TROLLS: "👿-trolls",
    GUILDS: "🏰-guilds",
    ERRORS: "⚠️-errors",
    SYSTEM: "🚀-system"
};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const GLOBAL_STOP_FILE = path.join(__dirname, "data", "globalStop.json");
const COMMAND_REGISTRATION_FILE = path.join(__dirname, "data", "command-registration.json");

function parseEnvBool(value, defaultValue = false) {
    if (value === undefined || value === null || value === "") return defaultValue;
    return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function buildDashboardSetupUrl(guildId) {
    const baseUrl = String(process.env.DASHBOARD_PUBLIC_URL || process.env.DASHBOARD_URL || "https://eselbande.com/fahrstuhl")
        .trim()
        .replace(/\/+$/, "");
    return `${baseUrl}/pages/serverconfig.php?guildId=${encodeURIComponent(String(guildId || ""))}`;
}

function hasInitialGuildSetup(config = {}) {
    const modules = config?.modules && typeof config.modules === "object" ? config.modules : {};
    const welcome = config?.welcome && typeof config.welcome === "object" ? config.welcome : {};
    const logging = config?.logging && typeof config.logging === "object" ? config.logging : {};
    const automod = config?.automod && typeof config.automod === "object" ? config.automod : {};

    const hasRolesConfigured = !!(config.roleId || config.trollRoleId || welcome.autoroleId);
    const hasCoreModuleEnabled = ["welcome", "logging", "automod", "moderation", "tickets", "leveling", "social"]
        .some(moduleKey => parseBoolean(modules[moduleKey]));
    const hasWelcomeConfigured = !!(
        welcome.welcomeChannelId ||
        welcome.goodbyeChannelId ||
        welcome.channelId ||
        parseBoolean(welcome.welcomeEnabled) ||
        parseBoolean(welcome.goodbyeEnabled) ||
        parseBoolean(welcome.dmEnabled) ||
        parseBoolean(welcome.autoroleEnabled)
    );
    const hasLoggingConfigured = !!(logging.channelId || parseBoolean(logging.enabled));
    const hasAutoModConfigured = !!(
        parseBoolean(automod.enabled) ||
        parseBoolean(automod.blockInvites) ||
        parseBoolean(automod.blockSpam) ||
        parseBoolean(automod.blockMassMentions)
    );

    return hasRolesConfigured || hasCoreModuleEnabled || hasWelcomeConfigured || hasLoggingConfigured || hasAutoModConfigured;
}

function loadGlobalStop() {
    try {
        if (fs.existsSync(GLOBAL_STOP_FILE)) {
            const data = JSON.parse(fs.readFileSync(GLOBAL_STOP_FILE, "utf8"));
            return data.stop === true;
        }
    } catch (e) { /* ignore */ }
    return false;
}

function saveGlobalStop(val) {
    try {
        const dir = path.dirname(GLOBAL_STOP_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(GLOBAL_STOP_FILE, JSON.stringify({ stop: val }), "utf8");
    } catch (e) { console.error("Failed to persist globalStop:", e.message); }
}

const globalState = { stop: loadGlobalStop() };
const usageStats = new Map();
const activeIntervals = [];
const rateLimiter = new RateLimiter();
const auditLogger = new AuditLogger();
const voiceTracker = new VoiceConnectionTracker();
const voiceUsageTracker = createVoiceUsageTracker();
let voiceRewardBridge = null;
const healthManager = new HealthCheckManager();
const gracefulDegradation = new GracefulDegradation({ fallbackDataDir: './fallback-data' });
const metricsCollector = new MetricsCollector();
const guildAwareCooldown = new GuildAwareCooldown();
let apiServer = null;
let startupHandled = false;
let opsAlertManager = null;

function incrementStat(command) {
    usageStats.set(command, (usageStats.get(command) || 0) + 1);
}

function readJsonFile(file, fallback = {}) {
    try {
        if (!fs.existsSync(file)) return fallback;
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return fallback;
    }
}

function writeJsonFile(file, data) {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function moduleEnabled(config, key, fallback = false) {
    const modules = config.modules || {};
    return parseBoolean(modules[key], fallback);
}

function emitActivityEvent(guildId, data = {}) {
    if (!apiServer || typeof apiServer.emitActivityEvent !== "function") return;
    const safeGuildId = String(guildId || "").trim();
    if (!safeGuildId) return;
    try {
        apiServer.emitActivityEvent(safeGuildId, {
            ...data,
            createdAt: data.createdAt || new Date().toISOString(),
        });
    } catch (error) {
        console.warn(`⚠️ Activity event emit failed for guild ${safeGuildId}: ${error.message}`);
    }
}

function findTicketChannelsByOwner(guild, ownerId) {
    if (!guild || !ownerId) return [];
    return guild.channels.cache
        .filter((channel) => {
            if (!channel?.topic || !channel.isTextBased?.()) return false;
            const ticketInfo = ticketManager.parseTicketTopic(channel.topic);
            return ticketInfo.isTicket && ticketInfo.ownerId === ownerId;
        })
        .sort((left, right) => Number(right.createdTimestamp || 0) - Number(left.createdTimestamp || 0))
        .map((channel) => channel);
}

function ticketChannelLabel(channel) {
    if (!channel) return null;
    const name = String(channel.name || "").trim();
    return name ? `#${name}` : `#${channel.id}`;
}

function welcomeModuleEnabled(config) {
    if (moduleEnabled(config, "welcome", false)) return true;
    const welcome = config.welcome && typeof config.welcome === "object" ? config.welcome : {};
    return !!(
        parseBoolean(welcome.welcomeEnabled) ||
        parseBoolean(welcome.goodbyeEnabled) ||
        parseBoolean(welcome.dmEnabled) ||
        parseBoolean(welcome.autoroleEnabled) ||
        parseBoolean(welcome.aiWelcomeEnabled) ||
        parseBoolean(welcome.verificationEnabled) ||
        welcome.welcomeChannelId ||
        welcome.goodbyeChannelId ||
        welcome.channelId
    );
}

function verificationButtonStyle(value) {
    const style = String(value || "success").toLowerCase();
    return ["primary", "secondary", "success", "danger"].includes(style) ? style : "success";
}

function discordButtonStyle(value) {
    return {
        primary: ButtonStyle.Primary,
        secondary: ButtonStyle.Secondary,
        success: ButtonStyle.Success,
        danger: ButtonStyle.Danger,
    }[verificationButtonStyle(value)] || ButtonStyle.Success;
}

function verificationCountValue(value) {
    return Math.max(0, Math.min(999999999, Math.floor(Number(value) || 0)));
}

function renderVerificationCountLabel(template, count) {
    const safeCount = verificationCountValue(count);
    const label = String(template || "Verifiziert: {count}").replaceAll("{count}", String(safeCount)).trim();
    return (label || `Verifiziert: ${safeCount}`).slice(0, 80);
}

function buildVerificationComponents(guildId, welcome) {
    const button = new ButtonBuilder()
        .setCustomId(`welcome:verify:${guildId}`)
        .setLabel(String(welcome.verificationButtonLabel || "Verifizieren").slice(0, 80))
        .setStyle(discordButtonStyle(welcome.verificationButtonStyle));
    const emoji = String(welcome.verificationButtonEmoji || "").slice(0, 32);
    if (emoji) button.setEmoji(emoji);

    const components = [button];
    if (welcome.verificationCountButtonEnabled) {
        components.push(
            new ButtonBuilder()
                .setCustomId(`welcome:verify-count:${guildId}`)
                .setLabel(renderVerificationCountLabel(welcome.verificationCountButtonLabel, welcome.verificationCount))
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        );
    }
    return [new ActionRowBuilder().addComponents(...components)];
}

const tempVoiceChannels = new Map();

function tempVoiceModuleEnabled(config) {
    if (moduleEnabled(config, "tempVoice", false)) return true;
    const tempVoice = config.tempVoice && typeof config.tempVoice === "object" ? config.tempVoice : {};
    return parseBoolean(tempVoice.enabled);
}

function renderTempVoiceName(template, member) {
    const base = String(template || "{username}'s Channel")
        .replaceAll("{user}", member.user?.username || member.displayName || "User")
        .replaceAll("{username}", member.user?.username || member.displayName || "User")
        .replaceAll("{displayName}", member.displayName || member.user?.username || "User")
        .replaceAll("{server}", member.guild.name)
        .replaceAll("{server.name}", member.guild.name);
    return base.replace(/[\\/#]/g, " ").trim().slice(0, 90) || `${member.displayName || "User"}'s Channel`;
}

async function cleanupTempVoiceChannel(channel) {
    if (!channel || !tempVoiceChannels.has(channel.id)) return;
    if ((channel.members?.size ?? 0) > 0) return;
    tempVoiceChannels.delete(channel.id);
    try {
        const { getPool } = require("./utils/db");
        await getPool().query("DELETE FROM temp_voice_channels WHERE channel_id = ?", [channel.id]);
    } catch {}
    await channel.delete("Fahrstuhl temp voice cleanup").catch(error => {
        console.warn(`⚠️ Temp voice cleanup failed in ${channel.guild?.name || "unknown guild"}: ${error.message}`);
    });
}

async function handleTempVoiceUpdate(oldState, newState) {
    const guild = newState.guild || oldState.guild;
    const member = newState.member || oldState.member;
    if (!guild || !member || member.user?.bot) return;

    const oldChannel = oldState.channel;
    const newChannel = newState.channel;
    if (oldChannel?.id && oldChannel.id !== newChannel?.id) {
        const oldConfig = getGuildConfig(guild.id);
        const tempVoice = oldConfig.tempVoice && typeof oldConfig.tempVoice === "object" ? oldConfig.tempVoice : {};
        if (parseBoolean(tempVoice.deleteWhenEmpty, true)) {
            await cleanupTempVoiceChannel(oldChannel);
        }
    }

    const config = getGuildConfig(guild.id);
    if (!tempVoiceModuleEnabled(config)) return;
    const tempVoice = config.tempVoice && typeof config.tempVoice === "object" ? config.tempVoice : {};
    if (!tempVoice.hubChannelId || newChannel?.id !== String(tempVoice.hubChannelId)) return;

    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    const canManage = me?.permissions?.has(PermissionsBitField.Flags.ManageChannels) ?? false;
    const canMove = me?.permissions?.has(PermissionsBitField.Flags.MoveMembers) ?? false;
    if (!canManage || !canMove) {
        console.warn(`⚠️ Temp voice missing permissions in ${guild.name}: ManageChannels=${canManage}, MoveMembers=${canMove}`);
        return;
    }

    const parent = tempVoice.categoryId || newChannel.parentId || null;
    const channelOptions = {
        name: renderTempVoiceName(tempVoice.channelNameTemplate, member),
        type: 2,
        reason: "Fahrstuhl temp voice channel",
    };
    if (parent) channelOptions.parent = parent;
    if (parseBoolean(tempVoice.allowRename, true) || parseBoolean(tempVoice.allowLock, true) || parseBoolean(tempVoice.allowLimit, true)) {
        channelOptions.permissionOverwrites = [
            {
                id: member.id,
                allow: [PermissionsBitField.Flags.ManageChannels],
            },
        ];
    }
    const userLimit = Math.max(0, Math.min(99, Number(tempVoice.userLimit) || 0));
    if (userLimit > 0) channelOptions.userLimit = userLimit;
    const bitrate = Math.max(0, Math.min(384, Number(tempVoice.bitrate) || 0));
    if (bitrate > 0) channelOptions.bitrate = bitrate * 1000;

    const created = await guild.channels.create(channelOptions).catch(error => {
        console.warn(`⚠️ Temp voice create failed in ${guild.name}: ${error.message}`);
        return null;
    });
    if (!created) return;

    tempVoiceChannels.set(created.id, {
        guildId: guild.id,
        ownerId: member.id,
        createdAt: Date.now(),
    });

    try {
        const { getPool } = require("./utils/db");
        await getPool().query(
            "INSERT INTO temp_voice_channels (channel_id, guild_id, owner_id, created_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE owner_id = VALUES(owner_id), created_at = VALUES(created_at)",
            [created.id, guild.id, member.id, Date.now()]
        );
    } catch {}

    await member.voice.setChannel(created, "Fahrstuhl temp voice join").catch(error => {
        console.warn(`⚠️ Temp voice move failed in ${guild.name}: ${error.message}`);
    });
}

function renderWelcomeTemplate(template, member) {
    const text = String(template || "");
    return text
        .replaceAll("{user}", `<@${member.id}>`)
        .replaceAll("{username}", member.user?.username || member.displayName || "Someone")
        .replaceAll("{tag}", member.user?.username || "Someone")
        .replaceAll("{user.idname}", member.user?.username || "Someone")
        .replaceAll("{server}", member.guild.name)
        .replaceAll("{server.name}", member.guild.name)
        .replaceAll("{memberCount}", String(member.guild.memberCount || 0))
        .replaceAll("{server.member_count}", String(member.guild.memberCount || 0))
        .replaceAll("{userAvatar}", member.user?.displayAvatarURL({ extension: "png", size: 512 }) || "")
        .replaceAll("{serverIcon}", member.guild.iconURL({ extension: "png", size: 512 }) || "");
}

function discordImageUrl(value) {
    const url = String(value || "").trim();
    return /^https?:\/\//i.test(url) ? url : "";
}

function normalizeEmbedFields(value) {
    try {
        const parsed = Array.isArray(value) ? value : JSON.parse(String(value || "[]"));
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map(field => ({
                name: String(field?.name || "").slice(0, 256),
                value: String(field?.value || "").slice(0, 1024),
                inline: !!field?.inline,
            }))
            .filter(field => field.name && field.value)
            .slice(0, 10);
    } catch {
        return [];
    }
}

function discordText(value, limit, fallback = "") {
    const text = String(value ?? "").trim();
    const safe = text || fallback;
    return safe.length > limit ? safe.slice(0, limit) : safe;
}

function addWelcomeFields(embed, fields, member) {
    normalizeEmbedFields(fields).forEach(field => {
        const name = discordText(renderWelcomeTemplate(field.name, member), 256);
        const value = discordText(renderWelcomeTemplate(field.value, member), 1024);
        if (!name || !value) return;
        embed.addFields({ name, value, inline: field.inline });
    });
}

function buildAiWelcomeMessage(welcome, member) {
    if (!welcome.aiWelcomeEnabled) return null;
    const character = String(welcome.aiCharacter || "friendly").toLowerCase();
    const templates = {
        friendly: [
            "Hey {user}, schön dass du auf **{server}** gelandet bist. Mach es dir gemütlich, du bist Member #{memberCount}.",
            "Willkommen {user}! **{server}** freut sich auf dich. Schau dich in Ruhe um und hab eine gute Zeit hier.",
        ],
        gaming: [
            "{user} ist dem Squad beigetreten. Willkommen auf **{server}**, Member #{memberCount}. Bereit für die nächste Runde?",
            "GG, {user} ist da. **{server}** hat gerade Verstärkung bekommen.",
        ],
        professional: [
            "Willkommen {user} auf **{server}**. Du bist Member #{memberCount}. Bitte lies dir kurz die wichtigsten Infos durch.",
            "Hallo {user}, willkommen auf **{server}**. Wir freuen uns, dich hier zu haben.",
        ],
        funny: [
            "{user} ist reingestolpert und **{server}** ist offiziell ein kleines bisschen lauter. Willkommen, Member #{memberCount}.",
            "Achtung, {user} ist da. Bitte alle Konfetti-Kanonen innerlich auslösen. Willkommen auf **{server}**!",
        ],
        anime: [
            "Willkommen {user}! Dein Abenteuer auf **{server}** beginnt jetzt. Member #{memberCount}, zeig uns deinen besten Arc.",
            "{user} betritt die Szene. **{server}** hat gerade einen neuen Hauptcharakter bekommen.",
        ],
        support: [
            "Willkommen {user} auf **{server}**. Wenn du Hilfe brauchst, ist das Team für dich da.",
            "Hey {user}, willkommen. Lies dir die Infos durch und melde dich jederzeit, wenn du Support brauchst.",
        ],
    };
    const pool = templates[character] || templates.friendly;
    const index = Number(BigInt(member.id || "0") % BigInt(pool.length));
    return renderWelcomeTemplate(pool[index], member);
}

async function sendConfiguredWelcome(member, type) {
    const config = getGuildConfig(member.guild.id);
    if (!welcomeModuleEnabled(config)) return;

    const welcome = config.welcome && typeof config.welcome === "object" ? config.welcome : {};
    const isJoin = type === "join";

    if (isJoin && welcome.autoroleEnabled && welcome.autoroleId && !welcome.verificationEnabled) {
        const role = member.guild.roles.cache.get(String(welcome.autoroleId));
        const me = member.guild.members.me || await member.guild.members.fetchMe().catch(() => null);
        const canAssignRole =
            role &&
            me &&
            !role.managed &&
            role.position < me.roles.highest.position &&
            me.permissions.has(PermissionsBitField.Flags.ManageRoles);

        if (canAssignRole) {
            await member.roles.add(role, "Fahrstuhl welcome autorole").catch(error => {
                console.warn(`⚠️ Autorole assign failed in ${member.guild.name}: ${error.message}`);
            });
        } else {
            console.warn(`⚠️ Autorole skipped in ${member.guild.name}: role missing or not assignable`);
        }
    }

    const enabled = isJoin
        ? (parseBoolean(welcome.aiWelcomeEnabled) || parseBoolean(welcome.welcomeEnabled, true))
        : parseBoolean(welcome.goodbyeEnabled);

    const channelId = String(isJoin
        ? (welcome.welcomeChannelId || welcome.channelId || "")
        : (welcome.goodbyeChannelId || welcome.channelId || "")
    ).trim();


    if (enabled && !channelId) {
        console.warn(`⚠️ ${isJoin ? "Welcome" : "Goodbye"} skipped in ${member.guild.name}: no channel configured`);
    }

    if (enabled && channelId) {
        const channel = member.guild.channels.cache.get(channelId)
            || await member.guild.channels.fetch(channelId).catch(() => null);

        if (channel?.isTextBased?.()) {
            const aiWelcomeText = isJoin ? buildAiWelcomeMessage(welcome, member) : null;
            const template = aiWelcomeText || (isJoin
                ? (welcome.welcomeMessage || "Welcome {user} to {server}! You are member #{memberCount}.")
                : (welcome.goodbyeMessage || "{username} left {server}. We are now {memberCount} members."));

            const cardEnabled = isJoin && parseBoolean(welcome.welcomeCardEnabled);
            const asEmbed = isJoin ? (parseBoolean(welcome.welcomeAsEmbed) || cardEnabled) : parseBoolean(welcome.goodbyeAsEmbed);
            if (asEmbed) {
                const embed = new EmbedBuilder();
                // Felder für Welcome/Goodbye unterscheiden
                if (isJoin) {
                    if (cardEnabled) {
                        embed.setTitle(discordText(renderWelcomeTemplate(welcome.welcomeCardTitle || "{username} just joined the server", member), 256, "Welcome"));
                        embed.setDescription(discordText(aiWelcomeText || renderWelcomeTemplate(welcome.welcomeCardSubtitle || "Member #{memberCount}", member), 4096, `Welcome ${member.user?.username || "there"}!`));
                        const avatarUrl = member.user?.displayAvatarURL({ extension: "png", size: 256 });
                        if (avatarUrl) embed.setThumbnail(avatarUrl);
                        const cardImage = discordImageUrl(renderWelcomeTemplate(welcome.welcomeCardBackgroundImage, member));
                        if (cardImage) embed.setImage(cardImage);
                    } else {
                        if (welcome.welcomeEmbedTitle) embed.setTitle(discordText(renderWelcomeTemplate(welcome.welcomeEmbedTitle, member), 256));
                        embed.setDescription(discordText(aiWelcomeText || renderWelcomeTemplate(template, member), 4096, `Welcome ${member.user?.username || "there"}!`));
                    }
                    if (welcome.welcomeEmbedColor) embed.setColor(welcome.welcomeEmbedColor);
                    const welcomeAvatar = discordImageUrl(renderWelcomeTemplate(welcome.welcomeEmbedAvatar, member));
                    const welcomeHeader = renderWelcomeTemplate(welcome.welcomeEmbedHeader || "", member).slice(0, 256);
                    if (welcomeHeader || welcomeAvatar) embed.setAuthor(welcomeAvatar ? { name: welcomeHeader || member.guild.name, iconURL: welcomeAvatar } : { name: welcomeHeader || member.guild.name });
                    const welcomeFooterIcon = discordImageUrl(renderWelcomeTemplate(welcome.welcomeEmbedFooterIcon, member));
                    if (welcome.welcomeEmbedFooter) embed.setFooter(welcomeFooterIcon ? { text: renderWelcomeTemplate(welcome.welcomeEmbedFooter, member), iconURL: welcomeFooterIcon } : { text: renderWelcomeTemplate(welcome.welcomeEmbedFooter, member) });
                    const welcomeThumbnail = discordImageUrl(renderWelcomeTemplate(welcome.welcomeEmbedThumbnail, member));
                    const welcomeImage = discordImageUrl(renderWelcomeTemplate(welcome.welcomeEmbedImage, member));
                    if (welcomeThumbnail) embed.setThumbnail(welcomeThumbnail);
                    if (welcomeImage) embed.setImage(welcomeImage);
                    addWelcomeFields(embed, welcome.welcomeEmbedFields, member);
                } else {
                    if (welcome.goodbyeEmbedTitle) embed.setTitle(discordText(renderWelcomeTemplate(welcome.goodbyeEmbedTitle, member), 256));
                    embed.setDescription(discordText(renderWelcomeTemplate(template, member), 4096, `${member.user?.username || "Someone"} left ${member.guild.name}.`));
                    if (welcome.goodbyeEmbedColor) embed.setColor(welcome.goodbyeEmbedColor);
                    const goodbyeAvatar = discordImageUrl(renderWelcomeTemplate(welcome.goodbyeEmbedAvatar, member));
                    const goodbyeHeader = renderWelcomeTemplate(welcome.goodbyeEmbedHeader || "", member).slice(0, 256);
                    if (goodbyeHeader || goodbyeAvatar) embed.setAuthor(goodbyeAvatar ? { name: goodbyeHeader || member.guild.name, iconURL: goodbyeAvatar } : { name: goodbyeHeader || member.guild.name });
                    const goodbyeFooterIcon = discordImageUrl(renderWelcomeTemplate(welcome.goodbyeEmbedFooterIcon, member));
                    if (welcome.goodbyeEmbedFooter) embed.setFooter(goodbyeFooterIcon ? { text: renderWelcomeTemplate(welcome.goodbyeEmbedFooter, member), iconURL: goodbyeFooterIcon } : { text: renderWelcomeTemplate(welcome.goodbyeEmbedFooter, member) });
                    const goodbyeThumbnail = discordImageUrl(renderWelcomeTemplate(welcome.goodbyeEmbedThumbnail, member));
                    const goodbyeImage = discordImageUrl(renderWelcomeTemplate(welcome.goodbyeEmbedImage, member));
                    if (goodbyeThumbnail) embed.setThumbnail(goodbyeThumbnail);
                    if (goodbyeImage) embed.setImage(goodbyeImage);
                    addWelcomeFields(embed, welcome.goodbyeEmbedFields, member);
                }
                embed.setTimestamp();
                await channel.send({
                    embeds: [embed],
                    allowedMentions: isJoin ? { users: [member.id] } : { parse: [] },
                });
            } else {
                await channel.send({
                    content: aiWelcomeText || renderWelcomeTemplate(template, member),
                    allowedMentions: isJoin ? { users: [member.id] } : { parse: [] },
                });
            }
        } else {
            console.warn(`⚠️ ${isJoin ? "Welcome" : "Goodbye"} skipped in ${member.guild.name}: channel ${channelId} not found or not text based`);
        }
    }

    if (isJoin && welcome.dmEnabled) {
        const dmMessage = String(welcome.dmMessage || "").trim();
        if (dmMessage) {
            if (welcome.dmAsEmbed || welcome.dmCardEnabled) {
                const embed = new EmbedBuilder();
                if (welcome.dmCardEnabled) {
                    embed.setTitle(discordText(renderWelcomeTemplate(welcome.dmCardTitle || "Welcome to {server}", member), 256, "Welcome"));
                    embed.setDescription(discordText(renderWelcomeTemplate(welcome.dmCardSubtitle || "You're member #{memberCount}", member), 4096, `Welcome to ${member.guild.name}!`));
                    const avatarUrl = member.user?.displayAvatarURL({ extension: "png", size: 256 });
                    if (avatarUrl) embed.setThumbnail(avatarUrl);
                    const dmCardImage = discordImageUrl(renderWelcomeTemplate(welcome.welcomeCardBackgroundImage, member));
                    if (dmCardImage) embed.setImage(dmCardImage);
                } else {
                    if (welcome.dmEmbedTitle) embed.setTitle(discordText(renderWelcomeTemplate(welcome.dmEmbedTitle, member), 256));
                    embed.setDescription(discordText(renderWelcomeTemplate(dmMessage, member), 4096, `Welcome to ${member.guild.name}!`));
                }
                if (welcome.dmEmbedColor) embed.setColor(welcome.dmEmbedColor);
                const dmAvatar = discordImageUrl(renderWelcomeTemplate(welcome.dmEmbedAvatar, member));
                const dmHeader = renderWelcomeTemplate(welcome.dmEmbedHeader || "", member).slice(0, 256);
                if (dmHeader || dmAvatar) embed.setAuthor(dmAvatar ? { name: dmHeader || member.guild.name, iconURL: dmAvatar } : { name: dmHeader || member.guild.name });
                const dmFooterIcon = discordImageUrl(renderWelcomeTemplate(welcome.dmEmbedFooterIcon, member));
                if (welcome.dmEmbedFooter) embed.setFooter(dmFooterIcon ? { text: renderWelcomeTemplate(welcome.dmEmbedFooter, member), iconURL: dmFooterIcon } : { text: renderWelcomeTemplate(welcome.dmEmbedFooter, member) });
                const dmThumbnail = discordImageUrl(renderWelcomeTemplate(welcome.dmEmbedThumbnail, member));
                const dmImage = discordImageUrl(renderWelcomeTemplate(welcome.dmEmbedImage, member));
                if (dmThumbnail) embed.setThumbnail(dmThumbnail);
                if (dmImage) embed.setImage(dmImage);
                addWelcomeFields(embed, welcome.dmEmbedFields, member);
                embed.setTimestamp();
                await member.send({
                    embeds: [embed],
                    allowedMentions: { parse: [] },
                }).catch(error => {
                    console.warn(`⚠️ Welcome DM failed in ${member.guild.name}: ${error.message}`);
                });
            } else {
                await member.send({
                    content: renderWelcomeTemplate(dmMessage, member),
                    allowedMentions: { parse: [] },
                }).catch(error => {
                    console.warn(`⚠️ Welcome DM failed in ${member.guild.name}: ${error.message}`);
                });
            }
        }
    }
}

function clampNumber(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

function normalizeAutoModSettings(automod = {}) {
    const rawRuleActions = automod.ruleActions && typeof automod.ruleActions === "object" ? automod.ruleActions : {};
    const normalizeRuleAction = (value) => {
        const allowed = ["fallback", "none", "delete", "warn", "timeout", "kick", "ban"];
        const action = String(value || "fallback").trim().toLowerCase();
        return allowed.includes(action) ? action : "fallback";
    };
    return {
        blockInvites: parseBoolean(automod.blockInvites, true),
        blockLinks: parseBoolean(automod.blockLinks),
        allowedLinks: Array.isArray(automod.allowedLinks) ? automod.allowedLinks : [],
        blockMassMentions: parseBoolean(automod.blockMassMentions, true),
        blockCaps: parseBoolean(automod.blockCaps),
        blockSpam: parseBoolean(automod.blockSpam, true),
        blockRepeatedText: parseBoolean(automod.blockRepeatedText, true),
        deleteMessage: parseBoolean(automod.deleteMessage, true),
        warnUser: parseBoolean(automod.warnUser, true),
        exemptAdmins: parseBoolean(automod.exemptAdmins, true),
        mentionLimit: clampNumber(automod.mentionLimit, 2, 25, 6),
        capsMinLength: clampNumber(automod.capsMinLength, 8, 200, 12),
        capsPercent: clampNumber(automod.capsPercent, 50, 100, 70),
        duplicateThreshold: clampNumber(automod.duplicateThreshold, 2, 10, 4),
        duplicateWindowSeconds: clampNumber(automod.duplicateWindowSeconds, 5, 300, 20),
        autoPunishStrikes: clampNumber(automod.autoPunishStrikes ?? automod.autoTimeoutStrikes, 0, 20, 0),
        timeoutMinutes: clampNumber(automod.timeoutMinutes ?? automod.autoTimeoutMinutes, 1, 40320, 10),
        punishmentAction: ["none", "timeout", "kick", "ban"].includes(automod.punishmentAction) ? automod.punishmentAction : "timeout",
        punishmentMode: ["fixed", "escalate"].includes(automod.punishmentMode) ? automod.punishmentMode : "fixed",
        warnMessage: String(automod.warnMessage || "AutoMod blocked your message: {reason}").slice(0, 180),
        blockedTermsWholeWord: parseBoolean(automod.blockedTermsWholeWord, false),
        blockedTermsRegex: parseBoolean(automod.blockedTermsRegex, false),
        blockedTerms: Array.isArray(automod.blockedTerms) ? automod.blockedTerms : [],
        ruleActions: {
            invite: normalizeRuleAction(rawRuleActions.invite),
            link: normalizeRuleAction(rawRuleActions.link),
            blocked_term: normalizeRuleAction(rawRuleActions.blocked_term),
            mass_mentions: normalizeRuleAction(rawRuleActions.mass_mentions),
            caps: normalizeRuleAction(rawRuleActions.caps),
            repeated_text: normalizeRuleAction(rawRuleActions.repeated_text),
            message_spam: normalizeRuleAction(rawRuleActions.message_spam),
        },
        ignoredRoles: Array.isArray(automod.ignoredRoles) ? automod.ignoredRoles : [],
        ignoredChannels: Array.isArray(automod.ignoredChannels) ? automod.ignoredChannels : [],
    };
}

function escapeRegex(text) {
    return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveAutoModRuleAction(automod, ruleType) {
    const action = String(automod?.ruleActions?.[ruleType] || "fallback").toLowerCase();
    return ["fallback", "none", "delete", "warn", "timeout", "kick", "ban"].includes(action) ? action : "fallback";
}

function shouldBypassAutoMod(message, automod) {
    if (automod.ignoredChannels.includes(message.channel.id)) return true;
    if (automod.exemptAdmins && message.member?.permissions?.has(PermissionsBitField.Flags.ManageGuild)) return true;

    const userRoleIds = message.member?.roles?.cache ? Array.from(message.member.roles.cache.keys()) : [];
    return userRoleIds.some(id => automod.ignoredRoles.includes(id));
}

function getRecentAutoModMessages(message, automod) {
    const guildId = message.guild.id;
    const userId = message.author.id;
    const now = Date.now();
    const windowMs = automod.duplicateWindowSeconds * 1000;
    if (!autoModMessageMap.has(guildId)) autoModMessageMap.set(guildId, new Map());
    const guildMap = autoModMessageMap.get(guildId);
    const recent = (guildMap.get(userId) || []).filter(item => item.createdAt > now - windowMs);
    const normalized = String(message.content || "").trim().toLowerCase().replace(/\s+/g, " ");
    recent.push({ content: normalized, channelId: message.channel.id, createdAt: now });
    guildMap.set(userId, recent.slice(-20));
    return recent;
}

function findAutoModViolations(message, automod = {}) {
    const text = String(message.content || "");
    const lower = text.toLowerCase();
    const violations = [];

    if (automod.blockInvites && /(discord\.gg\/|discord\.com\/invite\/|discordapp\.com\/invite\/)/i.test(text)) {
        violations.push({ type: "invite", reason: "Discord invite link", points: 1, action: resolveAutoModRuleAction(automod, "invite") });
    }

    if (automod.blockLinks && /https?:\/\/|www\./i.test(text)) {
        // Check Whitelist
        const allowedLinks = Array.isArray(automod.allowedLinks) ? automod.allowedLinks : [];
        const isWhitelisted = allowedLinks.some(link => {
            const cleaned = String(link || "").trim().toLowerCase();
            return cleaned.length > 0 && lower.includes(cleaned);
        });

        if (!isWhitelisted) {
            violations.push({ type: "link", reason: "External link", points: 1, action: resolveAutoModRuleAction(automod, "link") });
        }
    }

    const blockedTerms = Array.isArray(automod.blockedTerms) ? automod.blockedTerms : [];
    let matchedTerm = null;
    for (const rawTerm of blockedTerms) {
        const cleaned = String(rawTerm || "").trim();
        if (cleaned.length < 2) continue;
        if (automod.blockedTermsRegex) {
            try {
                const regex = new RegExp(cleaned, "i");
                if (regex.test(text)) {
                    matchedTerm = cleaned;
                    break;
                }
            } catch (error) {
                console.warn(`⚠️ Invalid AutoMod regex in guild ${message.guild.id}: ${cleaned} (${error.message})`);
            }
            continue;
        }
        if (automod.blockedTermsWholeWord) {
            try {
                const regex = new RegExp(`(^|\\W)${escapeRegex(cleaned)}(\\W|$)`, "i");
                if (regex.test(text)) {
                    matchedTerm = cleaned;
                    break;
                }
            } catch {
                continue;
            }
        } else if (lower.includes(cleaned.toLowerCase())) {
            matchedTerm = cleaned;
            break;
        }
    }
    if (matchedTerm) violations.push({ type: "blocked_term", reason: `Blocked term: ${matchedTerm}`, points: 2, action: resolveAutoModRuleAction(automod, "blocked_term") });

    const mentionCount = (message.mentions?.users?.size || 0) + (message.mentions?.roles?.size || 0);
    if (automod.blockMassMentions && mentionCount >= automod.mentionLimit) {
        violations.push({ type: "mass_mentions", reason: `${mentionCount} mentions in one message`, points: 2, action: resolveAutoModRuleAction(automod, "mass_mentions") });
    }

    const letters = text.replace(/[^a-zA-ZÄÖÜäöüß]/g, "");
    const uppercase = letters.replace(/[^A-ZÄÖÜ]/g, "");
    const capsPercent = letters.length > 0 ? Math.round((uppercase.length / letters.length) * 100) : 0;
    if (automod.blockCaps && letters.length >= automod.capsMinLength && capsPercent >= automod.capsPercent) {
        violations.push({ type: "caps", reason: `${capsPercent}% uppercase text`, points: 1, action: resolveAutoModRuleAction(automod, "caps") });
    }

    const recent = getRecentAutoModMessages(message, automod);
    const normalized = String(message.content || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (automod.blockRepeatedText && normalized.length >= 4) {
        const repeats = recent.filter(item => item.content === normalized).length;
        if (repeats >= automod.duplicateThreshold) {
            violations.push({ type: "repeated_text", reason: `${repeats} repeated messages`, points: 2, action: resolveAutoModRuleAction(automod, "repeated_text") });
        }
    }
    if (automod.blockSpam && recent.length >= automod.duplicateThreshold) {
        violations.push({ type: "message_spam", reason: `${recent.length} messages in ${automod.duplicateWindowSeconds}s`, points: 1, action: resolveAutoModRuleAction(automod, "message_spam") });
    }

    return violations;
}

async function recordAutoModCase(message, violation) {
    try {
        const { getPool } = require("./utils/db");
        const now = Date.now();
        const pool = getPool();
        const [result] = await pool.query(
            `
            INSERT INTO moderation_cases
                (guild_id, user_id, moderator_id, type, reason, duration_ms, expires_at, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                message.guild.id,
                message.author.id,
                client.user?.id || null,
                "automod",
                violation.reason,
                null,
                null,
                "active",
                now,
                now
            ]
        );

        emitActivityEvent(message.guild.id, {
            id: `automod:${result?.insertId || now}`,
            type: "automod",
            action: "hit",
            source: "moderation_cases",
            userId: message.author.id,
            userName: message.member?.displayName || message.author.globalName || message.author.username || message.author.id,
            actorId: client.user?.id || null,
            actorName: "AutoMod",
            channelId: message.channel?.id || null,
            channelName: message.channel?.name ? `#${message.channel.name}` : null,
            reason: String(violation.reason || "AutoMod blocked a message").slice(0, 500),
            description: `AutoMod hat eine Nachricht von ${message.member?.displayName || message.author.globalName || message.author.username || message.author.id} blockiert (Grund: ${String(violation.reason || "Regelverstoss").slice(0, 180)})`,
            severity: "warning",
            createdAt: new Date(now).toISOString(),
        });
    } catch (error) {
        console.warn(`⚠️ AutoMod case logging failed in ${message.guild.name}: ${error.message}`);
    }
}

async function applyAutoModPunishment(message, automod, strikes) {
    if (automod.autoPunishStrikes <= 0 || strikes < automod.autoPunishStrikes || automod.punishmentAction === "none") {
        return false;
    }

    const reason = `AutoMod: ${strikes} strikes`;
    try {
        let action = automod.punishmentAction;
        let timeoutMinutes = automod.timeoutMinutes;

        // Escalate Mode Logic
        if (automod.punishmentMode === "escalate") {
            if (strikes <= 1) return false; // Handled by normal warn logic
            if (strikes === 2) { action = "timeout"; timeoutMinutes = 10; }
            else if (strikes === 3) { action = "timeout"; timeoutMinutes = 120; }
            else if (strikes === 4) { action = "timeout"; timeoutMinutes = 720; }
            else { action = "kick"; }
        }

        if (action === "timeout") {
            if (message.member && message.guild.members.me.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                await message.member.timeout(timeoutMinutes * 60 * 1000, reason);
                await message.channel.send({
                    content: `🚨 ${message.author} was automatically timed out for ${timeoutMinutes} minutes (Reason: ${reason}).`,
                    allowedMentions: { users: [message.author.id] },
                }).catch(() => {});
                return true;
            }
        } else if (action === "kick") {
            if (message.member?.kickable) {
                await message.author.send(`You were kicked from **${message.guild.name}** for repeated AutoMod violations.`).catch(() => {});
                await message.member.kick(reason);
                return true;
            }
        } else if (action === "ban") {
            if (message.member?.bannable) {
                await message.author.send(`You were banned from **${message.guild.name}** for repeated AutoMod violations.`).catch(() => {});
                await message.member.ban({ reason, deleteMessageSeconds: 60 * 60 });
                return true;
            }
        }
    } catch (err) {
        console.warn(`⚠️ AutoMod punishment failed: ${err.message}`);
    }
    return false;
}

async function applyAutoModRuleAction(message, automod, violation, strikes) {
    const action = violation.action || "fallback";
    if (action === "fallback") return false;
    const reason = `AutoMod ${violation.type}: ${violation.reason}`;

    try {
        if (action === "none") return false;
        if (action === "delete") {
            if (message.deletable) await message.delete().catch(() => {});
            return true;
        }
        if (action === "warn") {
            const content = automod.warnMessage
                .replaceAll("{user}", `${message.author}`)
                .replaceAll("{reason}", violation.reason)
                .replaceAll("{strikes}", String(strikes));
            await message.channel.send({ content, allowedMentions: { users: [message.author.id] } }).catch(() => null);
            return true;
        }
        if (action === "timeout") {
            if (message.member && message.guild.members.me.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                if (message.deletable) await message.delete().catch(() => {});
                await message.member.timeout(automod.timeoutMinutes * 60 * 1000, reason);
                return true;
            }
            return false;
        }
        if (action === "kick") {
            if (message.member?.kickable) {
                if (message.deletable) await message.delete().catch(() => {});
                await message.member.kick(reason);
                return true;
            }
            return false;
        }
        if (action === "ban") {
            if (message.member?.bannable) {
                if (message.deletable) await message.delete().catch(() => {});
                await message.member.ban({ reason, deleteMessageSeconds: 3600 });
                return true;
            }
            return false;
        }
    } catch (err) {
        console.warn(`⚠️ AutoMod rule action failed: ${err.message}`);
    }
    return false;
}

function renderLevelTemplate(template, message, result) {
    return String(template || "{user} reached Level {level}!")
        .replaceAll("{user}", `${message.author}`)
        .replaceAll("{username}", message.member?.displayName || message.author.username)
        .replaceAll("{level}", String(result.level))
        .replaceAll("{xp}", String(result.xp))
        .replaceAll("{server}", message.guild.name);
}

async function syncLevelRolesForMember(guild, member, level, config) {
    const settings = levelingManager.getLevelSettings(config);
    if (!member || !Array.isArray(settings.roleRewards) || settings.roleRewards.length === 0) return;

    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return;

    const earned = settings.roleRewards.filter(reward => {
        if (level < reward.level) return false;
        const role = guild.roles.cache.get(reward.roleId);
        return !!role && !role.managed && role.position < me.roles.highest.position;
    });
    if (earned.length === 0) return;

    const targetRewards = settings.roleMode === "highest" || settings.removeLowerLevelRoles
        ? [earned[earned.length - 1]]
        : earned;
    const targetRoleIds = new Set(targetRewards.map(reward => reward.roleId));
    const configuredRoleIds = new Set(settings.roleRewards.map(reward => reward.roleId));

    for (const roleId of targetRoleIds) {
        if (!member.roles.cache.has(roleId)) {
            await member.roles.add(roleId, `Level reward: Level ${level}`).catch(error => {
                console.warn(`⚠️ Level role add failed in ${guild.name}: ${error.message}`);
            });
        }
    }

    if (settings.roleMode === "highest" || settings.removeLowerLevelRoles) {
        const removeIds = Array.from(configuredRoleIds).filter(roleId => !targetRoleIds.has(roleId) && member.roles.cache.has(roleId));
        if (removeIds.length > 0) {
            await member.roles.remove(removeIds, "Level reward cleanup").catch(error => {
                console.warn(`⚠️ Level role cleanup failed in ${guild.name}: ${error.message}`);
            });
        }
    }
}

async function syncLevelRoles(message, result, config) {
    return syncLevelRolesForMember(message.guild, message.member, result.level, config);
}

async function openTicketForInteraction(interaction, reason = "Opened from ticket panel") {
    const config = getGuildConfig(interaction.guildId);
    const ownerId = interaction.user?.id || null;
    const beforeTicketIds = new Set(findTicketChannelsByOwner(interaction.guild, ownerId).map((channel) => channel.id));

    const result = await ticketManager.openTicket(interaction, config, {
        reason: typeof reason === "object" ? reason.reason : reason,
        priority: typeof reason === "object" ? reason.priority : (config.tickets?.defaultPriority || "normal"),
        typeLabel: typeof reason === "object" ? reason.typeLabel : "Support",
    });

    const createdChannel = findTicketChannelsByOwner(interaction.guild, ownerId)
        .find((channel) => !beforeTicketIds.has(channel.id));

    if (createdChannel) {
        emitActivityEvent(interaction.guildId, {
            id: `ticket:open:${createdChannel.id}:${Date.now()}`,
            type: "tickets",
            action: "open",
            userId: interaction.user?.id || null,
            userName: interaction.member?.displayName || interaction.user?.globalName || interaction.user?.username || interaction.user?.id || "Unknown",
            actorId: interaction.user?.id || null,
            actorName: interaction.member?.displayName || interaction.user?.globalName || interaction.user?.username || interaction.user?.id || "Unknown",
            channelId: createdChannel.id,
            channelName: ticketChannelLabel(createdChannel),
            description: "Ticket wurde erstellt",
            severity: "info",
        });
    }

    return result;
}

function getCommandHash() {
    return crypto.createHash("sha256").update(JSON.stringify(commands)).digest("hex");
}

async function getTargetGuilds(guildIds = null) {
    if (!guildIds) return client.guilds.fetch();

    const guilds = new Map();
    for (const guildId of guildIds) {
        const cached = client.guilds.cache.get(guildId);
        if (cached) {
            guilds.set(guildId, cached);
            continue;
        }

        const fetched = await client.guilds.fetch(guildId).catch(() => null);
        if (fetched) guilds.set(guildId, fetched);
    }
    return guilds;
}

async function syncSlashCommands({ reason = "manual", guildIds = null, force = false } = {}) {
    if (!client.user) {
        return { skipped: true, reason: "client-not-ready", registered: 0, total: 0 };
    }

    const rest = new REST({ version: "10" }).setToken(token);
    const state = readJsonFile(COMMAND_REGISTRATION_FILE, { guilds: {} });
    state.guilds = state.guilds || {};

    const commandHash = getCommandHash();
    const shouldForce = force || parseEnvBool(process.env.COMMAND_REGISTRATION_FORCE, false);
    const clearGlobal = parseEnvBool(process.env.COMMAND_REGISTRATION_CLEAR_GLOBAL, false);
    const guilds = await getTargetGuilds(guildIds);
    const hashChanged = state.commandHash !== commandHash;
    const targets = [];

    if (clearGlobal && (shouldForce || state.globalClearedHash !== commandHash)) {
        await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
        state.globalClearedHash = commandHash;
        console.log("🧹 Global commands cleared.");
    }

    for (const [guildId, oauthGuild] of guilds) {
        if (shouldForce || hashChanged || state.guilds[guildId] !== commandHash) {
            targets.push([guildId, oauthGuild]);
        }
    }

    if (targets.length === 0) {
        console.log(`✅ Slash commands already up to date for ${guilds.size} guilds (${reason}).`);
        return { skipped: true, reason: "up-to-date", registered: 0, total: guilds.size, commandHash };
    }

    let successCount = 0;
    const failures = [];
    for (const [guildId, oauthGuild] of targets) {
        try {
            await rest.put(
                Routes.applicationGuildCommands(client.user.id, guildId),
                { body: commands }
            );
            state.guilds[guildId] = commandHash;
            successCount++;
            console.log(`✅ Commands registered for guild: ${oauthGuild.name || guildId} (${guildId})`);
        } catch (err) {
            failures.push({ guildId, name: oauthGuild.name || guildId, error: err.message });
            console.warn(`⚠️ Failed to register commands for guild ${guildId}: ${err.message}`);
        }
    }

    state.commandHash = commandHash;
    state.lastReason = reason;
    state.lastSyncedAt = new Date().toISOString();
    state.lastTargetCount = targets.length;
    state.lastSuccessCount = successCount;
    state.lastFailureCount = failures.length;
    writeJsonFile(COMMAND_REGISTRATION_FILE, state);

    console.log(`✅ Guild commands synced on ${successCount}/${targets.length} changed guilds (${guilds.size} total, ${reason}).`);
    return {
        skipped: false,
        registered: successCount,
        failed: failures.length,
        total: guilds.size,
        changed: targets.length,
        failures,
        commandHash,
    };
}

const { logToMaster, setupLogChannels, getLogCategoryId } = createLogger({
    client,
    DEV_GUILD_ID,
    DEV_CATEGORY_ID,
    LOG_CHANNELS
});

const backupManager = createBackupManager({ logToMaster });

const trollManager = createTrollManager({
    client,
    logToMaster,
    getGuildConfig,
    incrementGlobalStat,
    retryDiscordAPI,
    getTrollKey,
    checkBotManageMember,
    canBotManageMember,
    cleanupUserOperations,
    getGlobalStop: () => globalState.stop
});

trollManager.registerEvents();

const {
    startAutoMove,
    stopAutoMove,
    startGhostVisit,
    startSilentPost,
    startMirror,
    startDeafTroll,
    stopAllMirrors,
    activeMoves,
    activeMoveEnds,
    initialChannels,
    activeGhosts,
    activeSilentPost,
    activeMirror,
    activeDeafTroll
} = trollManager;

client.once(Events.ClientReady, async () => {
    if (startupHandled) return;
    startupHandled = true;

    console.log(`✅ Logged in as ${client.user.username}`);
    trollManager.init();
    
    // Initialize Premium Database (singleton)
    const premiumManager = require('./utils/premiumManager');
    await premiumManager.initialize();
    
    // Initialize Analytics Database
    const { init: initAnalytics } = require('./utils/analyticsDatabase');
    await initAnalytics();

    // Start Bot API Server (für Dashboard)
    // BotAPIServer constructor initializes console.log interception via pushLog
    apiServer = new BotAPIServer(client, commands, trollManager, {
        healthManager,
        backupManager
    });
    apiServer.start(3002);

    // Restore temp voice channels from DB after restart
    try {
        const { getPool } = require("./utils/db");
        const [tvRows] = await getPool().query("SELECT channel_id, guild_id, owner_id, created_at FROM temp_voice_channels");
        let restored = 0;
        for (const row of tvRows) {
            const guild = client.guilds.cache.get(row.guild_id);
            const channel = guild?.channels.cache.get(row.channel_id);
            if (channel && channel.type === 2) {
                tempVoiceChannels.set(row.channel_id, { guildId: row.guild_id, ownerId: row.owner_id, createdAt: Number(row.created_at) });
                restored++;
            } else {
                // Channel gone, clean up DB row
                await getPool().query("DELETE FROM temp_voice_channels WHERE channel_id = ?", [row.channel_id]).catch(() => {});
            }
        }
        if (tvRows.length > 0) console.log(`✅ Restored ${restored}/${tvRows.length} temp voice channels from DB`);
    } catch (err) {
        console.warn("⚠️ Could not restore temp voice channels:", err.message);
    }

    // Setup health checks with dependencies
    setupDefaultHealthChecks(healthManager, {
        getDbStatus,
        getCacheStatus,
        voiceTracker,
        rateLimiter,
        client
    });
    healthManager.startPeriodicChecks();

    // Start periodic metrics collection
    const metricsInterval = setInterval(() => {
        const summary = metricsCollector.getSummary();
        // Optional: log or send metrics to monitoring service
    }, 60000); // Every minute
    activeIntervals.push(metricsInterval);

    // Cleanup stale cooldowns periodically
    const cooldownCleanup = setInterval(() => {
        const removed = guildAwareCooldown.cleanup();
        if (removed > 0) {
            console.log(`🧹 Cleaned up ${removed} expired cooldowns`);
        }
    }, 300000); // Every 5 minutes
    activeIntervals.push(cooldownCleanup);

    // Cleanup stale fallback data
    const gracefulDegradationCleanup = setInterval(() => {
        gracefulDegradation.cleanupStale();
    }, 3600000); // Every hour
    activeIntervals.push(gracefulDegradationCleanup);

    const scheduledDiscordBackups = setInterval(async () => {
        try {
            const { processScheduledBackups } = require('./utils/serverBackup');
            const result = await processScheduledBackups(client, getGuildConfig, console);
            if (result?.processed > 0) {
                console.log(`🗂️ Scheduled discord backups checked: processed=${result.processed}, started=${result.started}, failed=${result.failed}`);
            }
        } catch (err) {
            console.error('❌ Scheduled discord backup runner failed:', err.message);
        }
    }, 60000); // every minute
    activeIntervals.push(scheduledDiscordBackups);

    // Voice XP: award XP to eligible voice channel members every 60 seconds
    const voiceXpInterval = setInterval(async () => {
        for (const [guildId, guild] of client.guilds.cache) {
            try {
                const config = getGuildConfig(guildId);
                if (!moduleEnabled(config, 'leveling', false)) continue;
                const settings = levelingManager.getLevelSettings(config);
                if (!settings.voiceXpEnabled) continue;

                for (const [, channel] of guild.channels.cache) {
                    if (channel.type !== 2) continue; // voice channels only
                    const eligible = channel.members.filter(m =>
                        !m.user.bot &&
                        !m.voice.selfMute && !m.voice.selfDeaf &&
                        !m.voice.serverMute && !m.voice.serverDeaf
                    );
                    if (eligible.size < 2) continue; // must not be alone

                    for (const [, member] of eligible) {
                        const voiceResult = await levelingManager.addVoiceXp({
                            guildId,
                            userId: member.id,
                            config,
                        }).catch(() => null);
                        if (!voiceResult || voiceResult.skipped) continue;

                        if (voiceResult.leveledUp) {
                            await syncLevelRolesForMember(guild, member, voiceResult.level, config).catch(() => {});
                            if (voiceResult.announceLevelUp) {
                                const announceChannelId = settings.announceChannelId;
                                const announceChannel = announceChannelId
                                    ? guild.channels.cache.get(announceChannelId)
                                    : null;
                                if (announceChannel?.isTextBased?.()) {
                                    const voiceEmbed = new EmbedBuilder()
                                        .setColor(0x4dabf7)
                                        .setTitle('🎙️ Voice Level Up!')
                                        .setDescription(`${member} reached level **${voiceResult.level}**!`)
                                        .addFields(
                                            { name: 'Level', value: `**${voiceResult.level}**`, inline: true },
                                            { name: 'Total XP', value: `**${voiceResult.xp.toLocaleString()}**`, inline: true },
                                        )
                                        .setThumbnail(member.user.displayAvatarURL({ size: 64 }))
                                        .setTimestamp();
                                    await announceChannel.send({ embeds: [voiceEmbed], allowedMentions: { users: [member.id] } }).catch(() => {});
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                console.error(`❌ Voice XP interval error in guild ${guildId}:`, err.message);
            }
        }
    }, 60_000);
    activeIntervals.push(voiceXpInterval);

    const updatePresence = () => {
        try {
            const statuses = [
                { name: `on ${client.guilds.cache.size} servers 👿`, type: ActivityType.Watching },
                { name: `/elevator 🚀 Move users!`, type: ActivityType.Playing },
                { name: `/ghost 👻 Haunt!`, type: ActivityType.Playing },
                { name: `/claim 🛡️ Get shields!`, type: ActivityType.Playing },
                { name: `${client.users.cache.size} users trolled!`, type: ActivityType.Watching },
                { name: `v${BOT_VERSION}`, type: ActivityType.Playing }
            ];
            
            const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
            
            client.user.setPresence({
                activities: [randomStatus],
                status: "online"
            });
        } catch (err) {
            console.error("❌ Error updating presence:", err);
        }
    };
    updatePresence();
    activeIntervals.push(setInterval(updatePresence, TIMINGS.PRESENCE_UPDATE_INTERVAL));

    try {
        const setupResult = await setupLogChannels();
        const devGuild = setupResult?.devGuild || null;
        if (devGuild) {
            const updateGlobalStatsChannel = async () => {
                const stats = getGlobalStats();
                const channelName = `📉-stats-trolls-${stats.totalTrolls || 0}`;
                const logCategoryId = getLogCategoryId();
                const statsChannel = devGuild.channels.cache.find(c => c.parentId === logCategoryId && c.name.startsWith("📉-stats-trolls-"));

                if (!statsChannel) {
                    await devGuild.channels.create({
                        name: channelName,
                        type: 0,
                        ...(logCategoryId ? { parent: logCategoryId } : {}),
                        permissionOverwrites: [
                            {
                                id: devGuild.roles.everyone.id,
                                deny: [PermissionsBitField.Flags.SendMessages]
                            }
                        ]
                    });
                } else if (statsChannel.name !== channelName) {
                    await statsChannel.setName(channelName);
                }
            };
            await updateGlobalStatsChannel();
            activeIntervals.push(setInterval(updateGlobalStatsChannel, TIMINGS.STATS_UPDATE_INTERVAL));

            console.log("✅ Log system ready!");
        } else {
            console.error("❌ Unique Bots server not found!");
        }
    } catch (err) {
        console.error("❌ Error setting up log channels:", err);
    }

    backupManager.start();
    await voiceUsageTracker.start(client);
    voiceRewardBridge = createVoiceRewardBridge({ client, logToMaster });
    voiceRewardBridge.start();
    socialNotifier.start(client);
    freeGamesNotifier.start(client);

    await logToMaster({
        title: "🚀 Bot Status",
        description: `**Bot started** as ${client.user.username}. Online on **${client.guilds.cache.size}** servers. Version: **v${BOT_VERSION}**`,
        color: 0x57F287
    }, "SYSTEM");

    opsAlertManager = createOpsAlertManager({
        logToMaster,
        getSummary: () => apiServer ? apiServer.buildHealthSummary() : null,
    });
    opsAlertManager.start();

    try {
        if (parseEnvBool(process.env.COMMAND_REGISTRATION_ON_START, true)) {
            await syncSlashCommands({ reason: "startup" });
        } else {
            console.log("ℹ️ Slash command sync on startup disabled by COMMAND_REGISTRATION_ON_START=false.");
        }
    } catch (error) {
        console.error("❌ Error syncing slash commands:", error);
    }

    client.guilds.cache.forEach(async (guild) => {
        try {
            const config = getGuildConfig(guild.id);
            if (config.roleId) {
                const fullGuild = await guild.fetch();
                fullGuild.members.cache.forEach(member => {
                    if (member.voice.channel && member.roles.cache.has(config.roleId)) {
                        startAutoMove(member);
                    }
                });
            }
        } catch (e) {
            console.error(`Error loading guild ${guild.id}:`, e);
        }
    });
});

client.on("guildCreate", async (guild) => {
    await logToMaster({
        title: "🏰 Bot Added to Server",
        description: `**${guild.name}** added the bot`,
        color: 0x57F287,
        thumbnail: guild.iconURL({ dynamic: true }),
        fields: [
            { name: "Server", value: `${guild.name} (\`${guild.id}\`)`, inline: true },
            { name: "Members", value: `${guild.memberCount}`, inline: true },
            { name: "Total Servers", value: `${client.guilds.cache.size}`, inline: true },
            { name: "Owner ID", value: `\`${guild.ownerId}\``, inline: true },
            { name: "Created", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true }
        ]
    }, "GUILDS");
    postTopGGStats();
    apiServer?.pushGuildEvent({ type: 'guildJoin', name: guild.name, id: guild.id, memberCount: guild.memberCount, icon: guild.iconURL() });

    syncSlashCommands({ reason: `guildCreate:${guild.id}`, guildIds: [guild.id], force: true })
        .catch(error => console.warn(`⚠️ Failed to sync commands for new guild ${guild.id}: ${error.message}`));

    // Send a setup reminder DM only when the guild has no meaningful setup yet.
    try {
        const config = getGuildConfig(guild.id);
        const setupDone = hasInitialGuildSetup(config);
        const reminderSentAt = Number(config?.setupReminderSentAt || 0);

        if (!setupDone && !reminderSentAt) {
            const ownerMember = await guild.fetchOwner().catch(() => null);
            if (ownerMember?.user) {
                const setupUrl = buildDashboardSetupUrl(guild.id);
                const reminderEmbed = new EmbedBuilder()
                    .setColor(0x5865f2)
                    .setTitle("👋 You have unfinished setup")
                    .setDescription(
                        `It looks like setup isn't complete yet for **${guild.name}**.\n\n` +
                        "Click below to finish setup in the dashboard (roles, modules, logging and more)."
                    )
                    .addFields(
                        { name: "Server", value: `${guild.name}\n\`${guild.id}\``, inline: true },
                        { name: "Status", value: "Setup not detected", inline: true }
                    )
                    .setFooter({ text: "Fahrstuhl Setup Reminder" })
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel("Complete Setup")
                        .setStyle(ButtonStyle.Link)
                        .setURL(setupUrl)
                );

                await ownerMember.user.send({ embeds: [reminderEmbed], components: [row] });
                setGuildConfig(guild.id, { setupReminderSentAt: Date.now() });
                console.log(`✅ Setup reminder DM sent to owner for ${guild.name}`);
            } else {
                console.log(`ℹ️ Could not resolve owner for setup reminder in ${guild.name}`);
            }
        }
    } catch (error) {
        console.warn(`⚠️ Setup reminder DM failed for ${guild.name}: ${error.message}`);
    }

    // Send welcome message to first available text channel
    try {
        let me = guild.members.me;
        if (!me) {
            try { me = await guild.members.fetchMe(); } catch (_) {}
        }

        const channels = guild.channels.cache
            .filter(c => c.isTextBased() && !c.isThread())
            .sort((a, b) => a.position - b.position);

        const welcomeEmbed = new EmbedBuilder()
            .setColor(0x667eea)
            .setTitle("🚀 Fahrstuhl Bot - Welcome!")
            .setDescription("Thanks for adding me to your server! 🎉 I'm here to make your Discord voice channels more fun and chaotic!")
            .addFields(
                {
                    name: "⚡ QUICK START (30 seconds)",
                    value: "1️⃣ Run `/settrollrole @RoleName` (admin only) - Choose who can use troll commands\n" +
                        "2️⃣ Run `/setrole @RoleName` - Members with this role get auto-moved\n" +
                        "3️⃣ Run `/help` for all available commands\n" +
                        "4️⃣ Use troll commands like `/elevator @user` to start the fun!",
                    inline: false
                },
                {
                    name: "🎮 What I Can Do",
                    value: "**Voice Effects:**\n" +
                        "• 🚀 **Elevator** - Randomly move users through voice channels for 30 seconds\n" +
                        "• 👻 **Ghost** - Timed haunting: 1m Free, 5m Premium, 10m Pro\n" +
                        "• 🔇 **Mute** - Timed random mute bursts by tier\n" +
                        "• 🪞 **Mirror** - Mirror a user's name for a timed duration\n" +
                        "• 📞 **Deafen** - Timed random deafen bursts by tier\n" +
                        "• 💥 **Presets** - Combine multiple effects at once\n" +
                        "• 🛡️ **Shields** - Protect yourself from being trolled!",
                    inline: false
                },
                {
                    name: "🛡️ SHIELD SYSTEM (Free Protection!)",
                    value: "Join **Unique Bots** (`/claim`) to get **free shields every 2.5 hours**!\n" +
                        "→ Use `/shield` to activate 2-hour immunity\n" +
                        "→ Use `/checkshield` to see your status\n" +
                        "→ **Server boosters get 10 bonus shields/month!**",
                    inline: false
                },
                {
                    name: "💬 Support & Community",
                    value: "📎 **Support Server:** discord.gg/zfzDHKcWDx\n" +
                        "Need help? Have ideas? Found a bug? Come hang out with us!",
                    inline: false
                }
            )
            .setFooter({ text: "Run /help for detailed command list • Have fun! 😈" })
            .setTimestamp();

        let sent = false;
        for (const [, channel] of channels) {
            // Skip if we know we lack permissions
            if (me) {
                const perms = me.permissionsIn?.(channel) ?? channel.permissionsFor?.(me);
                if (!perms?.has(['ViewChannel', 'SendMessages'])) continue;
            }
            try {
                await channel.send({ embeds: [welcomeEmbed] });
                console.log(`✅ Welcome message sent to ${guild.name} (#${channel.name})`);
                sent = true;
                break;
            } catch (_) {
                // No permission in this channel, try next
            }
        }
        if (!sent) console.log(`ℹ️ No writable channel found for welcome message in ${guild.name}`);
    } catch (error) {
        console.warn(`⚠️ Welcome message failed for ${guild.name}: ${error.message}`);
    }
});

client.on("guildDelete", async (guild) => {
    await logToMaster({
        title: "🏚️ Bot Removed from Server",
        description: `**${guild.name}** kicked the bot`,
        color: 0xED4245,
        thumbnail: guild.iconURL({ dynamic: true }),
        fields: [
            { name: "Server", value: `${guild.name} (\`${guild.id}\`)`, inline: true },
            { name: "Members", value: `${guild.memberCount ?? "?"}`, inline: true },
            { name: "Total Servers", value: `${client.guilds.cache.size - 1}`, inline: true }
        ]
    }, "GUILDS");
    postTopGGStats();
});

async function postTopGGStats() {
    const token = process.env.TOPGG_TOKEN;
    if (!token) return;
    try {
        const count = client.guilds.cache.size;
        await require('axios').post(
            `https://top.gg/api/bots/${client.user.id}/stats`,
            { server_count: count },
            { headers: { Authorization: token } }
        );
        console.log(`📊 top.gg stats updated: ${count} servers`);
    } catch (e) {
        console.warn(`⚠️ top.gg stats update failed: ${e.message}`);
    }
}


function clipLogValue(value, max = 900) {
    const text = String(value ?? "");
    return text.length > max ? `${text.slice(0, max - 3)}...` : text || "None";
}

function channelLogName(channel) {
    if (!channel) return "Unknown channel";
    return channel.name ? `#${channel.name}` : String(channel.id || "Unknown channel");
}

function channelLogType(channel) {
    const types = {
        0: "Text",
        2: "Voice",
        4: "Category",
        5: "Announcement",
        13: "Stage",
        15: "Forum",
    };
    return types[channel?.type] || `Type ${channel?.type ?? "unknown"}`;
}

function logConfig(guild) {
    return getGuildConfig(guild.id);
}

// Fetch who executed an audit-log action. Returns a short string like "User#1234 (`id`)" or null.
async function fetchAuditEntry(guild, auditLogType, options = {}) {
    const {
        targetId = null,
        channelId = null,
        maxAgeMs = 12000,
    } = options;
    try {
        if (!guild.members.me?.permissions?.has(PermissionsBitField.Flags.ViewAuditLog)) return null;
        const logs = await guild.fetchAuditLogs({ limit: 6, type: auditLogType });
        const now = Date.now();
        for (const entry of logs.entries.values()) {
            if (!entry || !entry.executor) continue;
            if (now - entry.createdTimestamp > maxAgeMs) continue;
            if (targetId && String(entry.target?.id || "") !== String(targetId)) continue;
            if (channelId) {
                const auditChannelId = String(entry.extra?.channel?.id || "");
                if (auditChannelId && auditChannelId !== String(channelId)) continue;
            }
            return entry;
        }
        return null;
    } catch {
        return null;
    }
}

function auditExecutorValue(entry) {
    const ex = entry?.executor;
    if (!ex) return null;
    return `${ex.username || ex.username}\n\`${ex.id}\``;
}

async function fetchAuditExecutor(guild, auditLogType, options = {}) {
    const entry = await fetchAuditEntry(guild, auditLogType, options);
    return auditExecutorValue(entry);
}

function idsFieldValue(parts = []) {
    return parts.filter(Boolean).join("\n");
}


client.on("guildMemberAdd", async (member) => {
    sendConfiguredWelcome(member, "join").catch(error => {
        console.warn(`⚠️ Welcome message failed in ${member.guild.name}: ${error.message}`);
    });

    const config = getGuildConfig(member.guild.id);
    sendServerLog(member.guild, config, "memberJoin", {
        title: "Member Joined",
        description: `${member.user} joined the server.`,
        color: 0x51cf66,
        thumbnail: member.user.displayAvatarURL({ size: 128 }),
        fields: [
            { name: "User", value: `${member.user.username}\n\`${member.id}\``, inline: true },
            { name: "Account Created", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
            { name: "Members", value: String(member.guild.memberCount || "unknown"), inline: true },
        ],
    }).catch(() => {});

    await logToMaster({
        title: "➕ Member Joined",
        description: `<@${member.id}> joined **${member.guild.name}**`,
        color: 0x57F287,
        thumbnail: member.user.displayAvatarURL({ dynamic: true }),
        fields: [
            { name: "User", value: `${member.user.username} (\`${member.id}\`)`, inline: true },
            { name: "Members", value: `${member.guild.memberCount}`, inline: true },
            { name: "Account", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true }
        ]
    }, "GUILDS");

    emitActivityEvent(member.guild.id, {
        id: `member:join:${member.id}:${Date.now()}`,
        type: "moderation",
        action: "join",
        userId: member.id,
        userName: member.displayName || member.user?.globalName || member.user?.username || member.id,
        actorId: null,
        actorName: "Discord",
        channelId: null,
        channelName: null,
        description: `${member.user?.username || member.id} ist dem Server beigetreten`,
        severity: "info",
    });
});

client.on("guildMemberRemove", async (member) => {
    sendConfiguredWelcome(member, "leave").catch(error => {
        console.warn(`⚠️ Goodbye message failed in ${member.guild.name}: ${error.message}`);
    });

    const config = getGuildConfig(member.guild.id);
    const kickEntry = await fetchAuditEntry(member.guild, AuditLogEvent.MemberKick, {
        targetId: member.id,
        maxAgeMs: 15000,
    });
    const kickExecutor = auditExecutorValue(kickEntry);
    const isKick = !!kickExecutor;
    const kickReason = clipLogValue(kickEntry?.reason || "No reason provided", 512);
    sendServerLog(member.guild, config, "memberLeave", {
        title: isKick ? "Member Kicked" : "Member Left",
        description: isKick ? `${member.user} was removed from the server.` : `${member.user} left the server.`,
        color: isKick ? 0xED4245 : 0xff6b6b,
        thumbnail: member.user.displayAvatarURL({ size: 128 }),
        fields: [
            { name: "User", value: `${member.user.username}\n\`${member.id}\``, inline: true },
            ...(kickExecutor ? [{ name: "Executor", value: kickExecutor, inline: true }] : []),
            { name: "Reason", value: kickExecutor ? kickReason : "Unknown (left or kick without audit access)", inline: false },
            { name: "Zeit", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
            { name: "IDs", value: idsFieldValue([`User: \`${member.id}\``, `Guild: \`${member.guild.id}\``]), inline: false },
        ],
    }).catch(() => {});

    await logToMaster({
        title: "➖ Member Left",
        description: `**${member.user.username}** left **${member.guild.name}**`,
        color: 0xED4245,
        thumbnail: member.user.displayAvatarURL({ dynamic: true }),
        fields: [
            { name: "User", value: `${member.user.username} (\`${member.id}\`)`, inline: true },
            { name: "Members", value: `${member.guild.memberCount}`, inline: true }
        ]
    }, "GUILDS");

    emitActivityEvent(member.guild.id, {
        id: `member:leave:${member.id}:${Date.now()}`,
        type: "moderation",
        action: "leave",
        userId: member.id,
        userName: member.displayName || member.user?.globalName || member.user?.username || member.id,
        actorId: null,
        actorName: "Discord",
        channelId: null,
        channelName: null,
        description: `${member.user?.username || member.id} hat den Server verlassen`,
        severity: "info",
    });
});

client.on("guildMemberUpdate", async (oldMember, newMember) => {
    if (!oldMember?.guild || !newMember?.guild) return;
    if (newMember.user?.bot) return;

    const before = new Set(Array.from(oldMember.roles.cache.keys()));
    const after = new Set(Array.from(newMember.roles.cache.keys()));
    const added = Array.from(after).filter((roleId) => !before.has(roleId));
    const removed = Array.from(before).filter((roleId) => !after.has(roleId));

    if (added.length > 0) {
        const role = newMember.guild.roles.cache.get(added[0]);
        emitActivityEvent(newMember.guild.id, {
            id: `member:role_add:${newMember.id}:${added[0]}:${Date.now()}`,
            type: "moderation",
            action: "role_add",
            userId: newMember.id,
            userName: newMember.displayName || newMember.user?.globalName || newMember.user?.username || newMember.id,
            actorId: null,
            actorName: "Discord",
            roleName: role ? role.name : added[0],
            description: `${newMember.displayName || newMember.user?.username || newMember.id} hat die Rolle ${role ? role.name : added[0]} erhalten`,
            severity: "info",
        });
        return;
    }

    if (removed.length > 0) {
        const role = oldMember.guild.roles.cache.get(removed[0]);
        emitActivityEvent(newMember.guild.id, {
            id: `member:role_remove:${newMember.id}:${removed[0]}:${Date.now()}`,
            type: "moderation",
            action: "role_remove",
            userId: newMember.id,
            userName: newMember.displayName || newMember.user?.globalName || newMember.user?.username || newMember.id,
            actorId: null,
            actorName: "Discord",
            roleName: role ? role.name : removed[0],
            description: `${newMember.displayName || newMember.user?.username || newMember.id} hat die Rolle ${role ? role.name : removed[0]} verloren`,
            severity: "warning",
        });
    }
});

client.on("voiceStateUpdate", async (oldState, newState) => {
    handleTempVoiceUpdate(oldState, newState).catch(error => {
        const guildName = newState.guild?.name || oldState.guild?.name || "unknown guild";
        console.warn(`⚠️ Temp voice update failed in ${guildName}: ${error.message}`);
    });

    const guild = newState.guild || oldState.guild;
    const member = newState.member || oldState.member;
    if (!guild || !member || oldState.channelId === newState.channelId) return;

    const config = logConfig(guild);
    const action = !oldState.channelId ? "joined voice" : (!newState.channelId ? "left voice" : "moved voice");
    sendServerLog(guild, config, "voiceState", {
        title: "Voice Activity",
        description: `${member.user || member} ${action}.`,
        color: !oldState.channelId ? 0x51cf66 : (!newState.channelId ? 0xff6b6b : 0x4dabf7),
        fields: [
            { name: "Member", value: `${member.user?.username || member.displayName}\n\`${member.id}\``, inline: true },
            { name: "From", value: oldState.channel ? `${oldState.channel}` : "None", inline: true },
            { name: "To", value: newState.channel ? `${newState.channel}` : "None", inline: true },
        ],
    }).catch(() => {});
});

client.on("guildBanAdd", async (ban) => {
    const config = logConfig(ban.guild);
    const banEntry = await fetchAuditEntry(ban.guild, AuditLogEvent.MemberBanAdd, {
        targetId: ban.user.id,
        maxAgeMs: 15000,
    });
    const executor = auditExecutorValue(banEntry);
    const reason = clipLogValue(ban.reason || banEntry?.reason || "No reason provided", 512);
    const fields = [
        { name: "User", value: `${ban.user.username}\n\`${ban.user.id}\``, inline: true },
        { name: "Reason", value: reason, inline: false },
        { name: "Zeit", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
        { name: "IDs", value: idsFieldValue([`User: \`${ban.user.id}\``, `Guild: \`${ban.guild.id}\``]), inline: false },
    ];
    if (executor) fields.splice(1, 0, { name: "Executor", value: executor, inline: true });
    sendServerLog(ban.guild, config, "memberBan", {
        title: "Member Banned",
        description: `${ban.user} was banned.`,
        color: 0xED4245,
        thumbnail: ban.user.displayAvatarURL({ size: 128 }),
        fields,
    }).catch(() => {});

    emitActivityEvent(ban.guild.id, {
        id: `moderation:ban:${ban.user.id}:${Date.now()}`,
        type: "moderation",
        action: "ban",
        userId: ban.user.id,
        userName: ban.user?.username || ban.user.id,
        actorId: null,
        actorName: "Moderation",
        reason: reason ? String(reason).slice(0, 500) : null,
        description: `${executor || 'Ein Moderator'} hat ${ban.user?.username || ban.user.id} gebannt${reason ? ` (Grund: ${reason.slice(0, 140)})` : ''}`,
        severity: "critical",
    });
});

client.on("guildBanRemove", async (ban) => {
    const config = logConfig(ban.guild);
    const executor = await fetchAuditExecutor(ban.guild, AuditLogEvent.MemberBanRemove);
    const fields = [{ name: "User", value: `${ban.user.username}\n\`${ban.user.id}\``, inline: true }];
    if (executor) fields.push({ name: "Unbanned By", value: executor, inline: true });
    sendServerLog(ban.guild, config, "memberUnban", {
        title: "Member Unbanned",
        description: `${ban.user} was unbanned.`,
        color: 0x51cf66,
        thumbnail: ban.user.displayAvatarURL({ size: 128 }),
        fields,
    }).catch(() => {});

    await logToMaster({
        title: "😇 User Unbanned",
        description: `**${ban.user.username}** was unbanned on **${ban.guild.name}**`,
        color: 0x57F287,
        thumbnail: ban.user.displayAvatarURL({ dynamic: true }),
        fields: [
            { name: "User", value: `${ban.user.username} (\`${ban.user.id}\`)`, inline: true },
            { name: "Server", value: ban.guild.name, inline: true }
        ]
    }, "GUILDS");

    emitActivityEvent(ban.guild.id, {
        id: `moderation:unban:${ban.user.id}:${Date.now()}`,
        type: "moderation",
        action: "unban",
        userId: ban.user.id,
        userName: ban.user?.username || ban.user.id,
        actorId: null,
        actorName: "Moderation",
        description: `${executor || 'Ein Moderator'} hat ${ban.user?.username || ban.user.id} entbannt`,
        severity: "info",
    });
});


client.on("guildUpdate", async (oldGuild, newGuild) => {
    if (oldGuild.name !== newGuild.name) {
        await logToMaster({
            title: "🏰 Server Renamed",
            description: `**${oldGuild.name}** → **${newGuild.name}**`,
            color: 0xFEE75C,
            fields: [
                { name: "Server ID", value: `\`${newGuild.id}\``, inline: true },
                { name: "Members", value: `${newGuild.memberCount}`, inline: true }
            ]
        }, "GUILDS");
    }

    if (newGuild.id === DEV_GUILD_ID) {
        if (oldGuild.premiumSubscriptionCount < newGuild.premiumSubscriptionCount) {
            const boostEmbed = new EmbedBuilder()
                .setColor(0xFF73FA)
                .setTitle("💎 SERVER BOOST!")
                .setDescription(`A huge thank you! We received a new boost!\n\n` +
                    `🚀 We are now at **${newGuild.premiumSubscriptionCount} Boosts**.\n` +
                    `🎁 The booster gets **10 Extra Shields** on the next \`/claim\`!`)
                .setImage("https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3Z0NXN4Y3R4Y3R4Y3R4Y3R4Y3R4Y3R4Y3R4Y3R4Y3R4JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/3o7TKVUn7iM8FMEU24/giphy.gif")
                .setTimestamp();

            await logToMaster({ embeds: [boostEmbed] }, "SYSTEM");
        }
    }
});

client.on("emojiCreate", async (emoji) => {
    await logToMaster({
        title: "😃 Emoji Added",
        description: `${emoji} **\`${emoji.name}\`** was added to **${emoji.guild.name}**`,
        color: 0x57F287,
        fields: [{ name: "Server", value: emoji.guild.name, inline: true }]
    }, "SYSTEM");
});

client.on("emojiDelete", async (emoji) => {
    await logToMaster({
        title: "🗑️ Emoji Removed",
        description: `**\`${emoji.name}\`** was deleted from **${emoji.guild.name}**`,
        color: 0xED4245,
        fields: [{ name: "Server", value: emoji.guild.name, inline: true }]
    }, "SYSTEM");
});

client.on("roleCreate", async (role) => {
    const config = logConfig(role.guild);
    const executor = await fetchAuditExecutor(role.guild, AuditLogEvent.RoleCreate);
    const fields = [
        { name: "Role", value: `${role.name}\n\`${role.id}\``, inline: true },
        { name: "Color", value: role.hexColor || "None", inline: true },
    ];
    if (executor) fields.push({ name: "Created By", value: executor, inline: true });
    sendServerLog(role.guild, config, "roleCreate", {
        title: "Role Created",
        description: `Role ${role} was created.`,
        color: 0x51cf66,
        fields,
    }).catch(() => {});
});

client.on("roleDelete", async (role) => {
    const config = logConfig(role.guild);
    const roleDeleteEntry = await fetchAuditEntry(role.guild, AuditLogEvent.RoleDelete, {
        targetId: role.id,
        maxAgeMs: 15000,
    });
    const executor = auditExecutorValue(roleDeleteEntry);
    const fields = [
        { name: "User", value: "n/a", inline: true },
        { name: "Channel", value: "n/a", inline: true },
        { name: "Reason", value: clipLogValue(roleDeleteEntry?.reason || "No reason provided", 512), inline: false },
        { name: "Zeit", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
        { name: "IDs", value: idsFieldValue([`Role: \`${role.id}\``, `Guild: \`${role.guild.id}\``]), inline: false },
    ];
    if (executor) fields.splice(1, 0, { name: "Executor", value: executor, inline: true });
    sendServerLog(role.guild, config, "roleDelete", {
        title: "Role Deleted",
        description: `Role **${role.name}** was deleted.`,
        color: 0xED4245,
        fields,
    }).catch(() => {});
});

client.on("roleUpdate", async (oldRole, newRole) => {
    const changes = [];
    if (oldRole.name !== newRole.name) changes.push(`Name: **${oldRole.name}** -> **${newRole.name}**`);
    if (oldRole.hexColor !== newRole.hexColor) changes.push(`Color: \`${oldRole.hexColor}\` -> \`${newRole.hexColor}\``);
    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) changes.push("Permissions changed");
    if (!changes.length) return;

    const config = logConfig(newRole.guild);
    const executor = await fetchAuditExecutor(newRole.guild, AuditLogEvent.RoleUpdate);
    const fields = [
        { name: "Role", value: `${newRole.name}\n\`${newRole.id}\``, inline: true },
        { name: "Changes", value: clipLogValue(changes.join("\n"), 1024), inline: false },
    ];
    if (executor) fields.push({ name: "Updated By", value: executor, inline: true });
    sendServerLog(newRole.guild, config, "roleUpdate", {
        title: "Role Updated",
        description: `Role ${newRole} was updated.`,
        color: 0xFEE75C,
        fields,
    }).catch(() => {});
});

client.on("channelCreate", async (channel) => {
    if (!channel.guild) return;
    const config = logConfig(channel.guild);
    const executor = await fetchAuditExecutor(channel.guild, AuditLogEvent.ChannelCreate);
    const fields = [
        { name: "Channel", value: `${channelLogName(channel)}\n\`${channel.id}\``, inline: true },
        { name: "Type", value: channelLogType(channel), inline: true },
    ];
    if (executor) fields.push({ name: "Created By", value: executor, inline: true });
    sendServerLog(channel.guild, config, "channelCreate", {
        title: "Channel Created",
        description: `${channel} was created.`,
        color: 0x51cf66,
        fields,
    }).catch(() => {});
});

client.on("channelDelete", async (channel) => {
    if (!channel.guild) return;
    const config = logConfig(channel.guild);
    const channelDeleteEntry = await fetchAuditEntry(channel.guild, AuditLogEvent.ChannelDelete, {
        targetId: channel.id,
        maxAgeMs: 15000,
    });
    const executor = auditExecutorValue(channelDeleteEntry);
    const fields = [
        { name: "User", value: "n/a", inline: true },
        { name: "Channel", value: `${channelLogName(channel)}\n\`${channel.id}\``, inline: true },
        { name: "Reason", value: clipLogValue(channelDeleteEntry?.reason || "No reason provided", 512), inline: false },
        { name: "Zeit", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
        { name: "IDs", value: idsFieldValue([`Channel: \`${channel.id}\``, `Guild: \`${channel.guild.id}\``]), inline: false },
    ];
    if (executor) fields.splice(1, 0, { name: "Executor", value: executor, inline: true });
    sendServerLog(channel.guild, config, "channelDelete", {
        title: "Channel Deleted",
        description: `Channel **${channelLogName(channel)}** was deleted.`,
        color: 0xED4245,
        fields,
    }).catch(() => {});
});

client.on("channelUpdate", async (oldChannel, newChannel) => {
    if (!newChannel.guild) return;
    const changes = [];
    if (oldChannel.name !== newChannel.name) changes.push(`Name: **${oldChannel.name}** -> **${newChannel.name}**`);
    if ((oldChannel.topic || "") !== (newChannel.topic || "")) changes.push(`Topic: ${clipLogValue(oldChannel.topic || "None", 180)} -> ${clipLogValue(newChannel.topic || "None", 180)}`);
    if (oldChannel.parentId !== newChannel.parentId) changes.push(`Category: \`${oldChannel.parentId || "none"}\` -> \`${newChannel.parentId || "none"}\``);
    if (oldChannel.permissionOverwrites?.cache?.size !== newChannel.permissionOverwrites?.cache?.size) changes.push("Permission overwrites changed");
    if (!changes.length) return;

    const config = logConfig(newChannel.guild);
    const executor = await fetchAuditExecutor(newChannel.guild, AuditLogEvent.ChannelUpdate);
    const fields = [
        { name: "Channel", value: `${channelLogName(newChannel)}\n\`${newChannel.id}\``, inline: true },
        { name: "Type", value: channelLogType(newChannel), inline: true },
        { name: "Changes", value: clipLogValue(changes.join("\n"), 1024), inline: false },
    ];
    if (executor) fields.push({ name: "Updated By", value: executor, inline: true });
    sendServerLog(newChannel.guild, config, "channelUpdate", {
        title: "Channel Updated",
        description: `${newChannel} was updated.`,
        color: 0xFEE75C,
        fields,
    }).catch(() => {});
});

client.on("inviteCreate", async (invite) => {
    if (invite.guild) {
        const config = logConfig(invite.guild);
        sendServerLog(invite.guild, config, "inviteCreate", {
            title: "Invite Created",
            description: `Invite \`${invite.code}\` was created${invite.channel ? ` for ${invite.channel}` : ""}.`,
            color: 0x5865F2,
            fields: [
                { name: "Code", value: `\`${invite.code}\``, inline: true },
                { name: "Created By", value: invite.inviter ? `${invite.inviter.username}\n\`${invite.inviter.id}\`` : "Unknown", inline: true },
                { name: "Max Uses", value: invite.maxUses ? String(invite.maxUses) : "Unlimited", inline: true },
                { name: "Expires", value: invite.expiresTimestamp ? `<t:${Math.floor(invite.expiresTimestamp / 1000)}:R>` : "Never", inline: true },
            ],
        }).catch(() => {});
    }

    await logToMaster({
        title: "✉️ Invite Created",
        description: `New invite for **${invite.guild?.name || "Unknown"}**`,
        color: 0x5865F2,
        fields: [
            { name: "Code", value: `\`${invite.code}\``, inline: true },
            { name: "Created by", value: invite.inviter?.username || "Unknown", inline: true },
            { name: "Max Uses", value: invite.maxUses ? `${invite.maxUses}` : "Unlimited", inline: true }
        ]
    }, "SYSTEM");
});

client.on("inviteDelete", async (invite) => {
    if (invite.guild) {
        const config = logConfig(invite.guild);
        sendServerLog(invite.guild, config, "inviteDelete", {
            title: "Invite Deleted",
            description: `Invite \`${invite.code}\` was deleted${invite.channel ? ` from ${invite.channel}` : ""}.`,
            color: 0xED4245,
            fields: [
                { name: "Code", value: `\`${invite.code}\``, inline: true },
                { name: "Channel", value: invite.channel ? `${invite.channel}` : "Unknown", inline: true },
            ],
        }).catch(() => {});
    }

    await logToMaster({
        title: "🗑️ Invite Deleted",
        description: `Invite \`${invite.code}\` for **${invite.guild?.name || "Unknown"}** was deleted`,
        color: 0xED4245,
        fields: [{ name: "Server", value: invite.guild?.name || "Unknown", inline: true }]
    }, "SYSTEM");
});

client.on("error", async (error) => {
    await logToMaster({
        title: "⚠️ Bot Error",
        description: `\`\`\`js\n${error.stack || error.message}\n\`\`\``,
        color: 0xED4245
    }, "ERRORS");
});

client.on("messageDelete", async (message) => {
    if (message.partial || !message.guild) return;
    if (message.author?.bot) return;

    const config = getGuildConfig(message.guild.id);
    const messageDeleteEntry = await fetchAuditEntry(message.guild, AuditLogEvent.MessageDelete, {
        targetId: message.author?.id,
        channelId: message.channelId,
        maxAgeMs: 12000,
    });
    const executor = auditExecutorValue(messageDeleteEntry);
    sendServerLog(message.guild, config, "messageDelete", {
        title: "Message Deleted",
        description: `Message sent by ${message.author} deleted in ${message.channel}.`,
        color: 0xff6b6b,
        fields: [
            { name: "User", value: `${message.author.username}\n\`${message.author.id}\``, inline: true },
            ...(executor ? [{ name: "Executor", value: executor, inline: true }] : []),
            { name: "Channel", value: `${message.channel}`, inline: true },
            { name: "Reason", value: clipLogValue(messageDeleteEntry?.reason || "Unknown", 512), inline: false },
            { name: "Content", value: clipLogValue(message.content || "*No text content (likely image/embed)*", 900), inline: false },
            { name: "Zeit", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
            { name: "IDs", value: idsFieldValue([`Message: \`${message.id}\``, `Author: \`${message.author.id}\``, `Channel: \`${message.channelId}\``]), inline: false },
        ],
        timestamp: new Date()
    }).catch(() => {});
});

client.on("messageUpdate", async (oldMessage, newMessage) => {
    if (oldMessage.partial || newMessage.partial || !oldMessage.guild) return;
    if (oldMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;

    const config = getGuildConfig(oldMessage.guild.id);
    sendServerLog(oldMessage.guild, config, "messageUpdate", {
        title: "Message Edited",
        description: `Message edited in ${oldMessage.channel}. [Jump to message](${newMessage.url})`,
        color: 0x4dabf7,
        fields: [
            { name: "Before", value: oldMessage.content?.slice(0, 1024) || "*No text content*" },
            { name: "After", value: newMessage.content?.slice(0, 1024) || "*No text content*" },
            { name: "Channel", value: `${oldMessage.channel}`, inline: true },
            { name: "Author", value: `${oldMessage.author.username} (\`${oldMessage.author.id}\`)`, inline: true },
        ],
        footer: { text: `Message ID: ${oldMessage.id}` },
        timestamp: new Date()
    }).catch(() => {});
});

client.on("messageCreate", async (message) => {
    try {
        if (!message.guild || message.author?.bot) return;
        const config = getGuildConfig(message.guild.id);

        const automodEnabled = moduleEnabled(config, "automod", false);
        if (automodEnabled) {
            const automod = normalizeAutoModSettings(config.automod && typeof config.automod === "object" ? config.automod : {});
            const bypassAutoMod = shouldBypassAutoMod(message, automod);
            if (!bypassAutoMod) {
                const violations = findAutoModViolations(message, automod);
                if (violations.length > 0) {
                    const violation = violations[0];
                    const reasonText = violations.map(item => item.reason).join(", ");
                    const now = Date.now();
                    const guildId = message.guild.id;
                    const userId = message.author.id;
                    if (!autoModStrikeMap.has(guildId)) autoModStrikeMap.set(guildId, new Map());
                    const userMap = autoModStrikeMap.get(guildId);
                    const since = now - 24 * 60 * 60 * 1000;
                    const strikes = (userMap.get(userId) || []).filter(ts => ts > since);
                    strikes.push(now);
                    userMap.set(userId, strikes);

                    const ruleAction = violation.action || "fallback";
                    let effectiveAction = ruleAction;
                    let handledByRuleAction = await applyAutoModRuleAction(message, automod, { ...violation, reason: reasonText }, strikes.length);

                    if (!handledByRuleAction) {
                        if (automod.deleteMessage !== false && message.deletable) {
                            await message.delete().catch(error => {
                                console.warn(`⚠️ AutoMod delete failed in ${message.guild.name}: ${error.message}`);
                            });
                        }

                        const punished = await applyAutoModPunishment(message, automod, strikes.length);
                        if (punished) {
                            userMap.set(userId, []);
                            effectiveAction = automod.punishmentAction;
                        } else if (automod.warnUser !== false) {
                            effectiveAction = "warn";
                        } else if (automod.deleteMessage !== false) {
                            effectiveAction = "delete";
                        } else {
                            effectiveAction = "none";
                        }

                        if (automod.warnUser !== false) {
                            const content = automod.warnMessage
                                .replaceAll("{user}", `${message.author}`)
                                .replaceAll("{reason}", reasonText)
                                .replaceAll("{strikes}", String(strikes.length));
                            const warning = await message.channel.send({
                                content,
                                allowedMentions: { users: [message.author.id] },
                            }).catch(() => null);
                            if (warning) setTimeout(() => warning.delete().catch(() => {}), 8000);
                        }
                    } else {
                        effectiveAction = ruleAction;
                    }

                    const excerpt = (message.content || "").slice(0, 300) || "*empty*";
                    const caseReason = `Rule: ${violation.type} | Action: ${effectiveAction} | Reason: ${reasonText} | Channel: #${message.channel.id} | Message: ${excerpt}`;
                    await recordAutoModCase(message, { ...violation, reason: caseReason });

                    sendServerLog(message.guild, config, "automod", {
                        title: "AutoMod Triggered",
                        description: `Message from ${message.author} matched **${violations.map(item => item.type).join(", ")}**.`,
                        color: 0xED4245,
                        fields: [
                            { name: "Rule", value: violation.type, inline: true },
                            { name: "Action", value: effectiveAction, inline: true },
                            { name: "User", value: `${message.author.username}\n\`${message.author.id}\``, inline: true },
                            { name: "Channel", value: `<#${message.channel.id}>`, inline: true },
                            { name: "Reason", value: reasonText, inline: false },
                            { name: "Message Excerpt", value: excerpt, inline: false },
                        ],
                    }).catch(() => {});
                    return;
                }
            }
        }

        const levelingEnabled = moduleEnabled(config, "leveling", false);
        if (!levelingEnabled) return;

        const levelSettings = levelingManager.getLevelSettings(config);
        const isAdmin = message.member?.permissions.has(PermissionsBitField.Flags.Administrator);

        // No-XP channels always skip XP collection.
        if (levelSettings.noXpChannels.includes(message.channel.id)) return;

        // Ignored roles skip XP for non-admin members.
        if (!isAdmin) {
            if (message.member?.roles.cache.some(r => levelSettings.ignoredRoles.includes(r.id))) return;
        }

        const result = await levelingManager.addMessageXp({
            guildId: message.guild.id,
            userId: message.author.id,
            channelId: message.channel.id,
            roleIds: message.member?.roles?.cache ? Array.from(message.member.roles.cache.keys()) : [],
            config,
            content: message.content,
        });

        if (result?.skipped) return;

        if (result.leveledUp && result.announceLevelUp) {
            await syncLevelRoles(message, result, config);
            const settings = levelingManager.getLevelSettings(config);
            const announceChannel = settings.announceChannelId
                ? message.guild.channels.cache.get(settings.announceChannelId)
                : message.channel;
            const targetChannel = announceChannel?.isTextBased?.() ? announceChannel : message.channel;
            const earnedReward = Array.isArray(settings.roleRewards)
                ? settings.roleRewards.find(r => r.level === result.level)
                : null;
            const levelEmbed = new EmbedBuilder()
                .setColor(0x51cf66)
                .setTitle('🎉 Level Up!')
                .setDescription(renderLevelTemplate(settings.announceMessage, message, result))
                .addFields(
                    { name: 'Level', value: `**${result.level}**`, inline: true },
                    { name: 'Total XP', value: `**${result.xp.toLocaleString()}**`, inline: true },
                )
                .setThumbnail(message.author.displayAvatarURL({ size: 64 }))
                .setTimestamp();
            if (earnedReward) {
                const earnedRole = message.guild.roles.cache.get(earnedReward.roleId);
                if (earnedRole) levelEmbed.addFields({ name: '🏆 New Role', value: `<@&${earnedRole.id}>`, inline: true });
            }
            await targetChannel.send({
                embeds: [levelEmbed],
                allowedMentions: { users: [message.author.id] },
            }).catch(() => {});
        } else if (result.leveledUp) {
            await syncLevelRoles(message, result, config);
        }

        if (result.leveledUp) {
            sendServerLog(message.guild, config, "leveling", {
                title: "Level Up",
                description: `${message.author} reached level **${result.level}**.`,
                color: 0x51cf66,
                fields: [
                    { name: "User", value: `${message.author.username}\n\`${message.author.id}\``, inline: true },
                    { name: "Level", value: String(result.level), inline: true },
                    { name: "XP", value: String(result.xp), inline: true },
                    { name: "Multiplier", value: `x${Number(result.multiplier || 1).toFixed(2)}`, inline: true },
                ],
            }).catch(() => {});

            emitActivityEvent(message.guild.id, {
                id: `leveling:${message.author.id}:${Date.now()}`,
                type: "leveling",
                action: "progress",
                userId: message.author.id,
                userName: message.member?.displayName || message.author.globalName || message.author.username || message.author.id,
                actorId: null,
                actorName: null,
                channelId: message.channel?.id || null,
                channelName: message.channel?.name ? `#${message.channel.name}` : null,
                description: `${message.member?.displayName || message.author.globalName || message.author.username || message.author.id} hat Level ${Number(result.level || 0)} erreicht`,
                severity: "info",
            });
        }
    } catch (error) {
        console.error("Leveling message tracking error:", error.message);
    }
});

client.on("interactionCreate", async (interaction) => {
    try {
        // Blacklist check for all interactions
        if (interaction.user) {
            const blockEntry = blacklistManager.isBlacklisted(
                interaction.user.id,
                interaction.guildId
            );
            if (blockEntry) {
                const reason = blockEntry.reason || 'You are blacklisted from using this bot';
                if (interaction.isCommand() || interaction.isButton() || interaction.isStringSelectMenu?.() || interaction.isModalSubmit?.()) {
                    await safeReply(interaction, {
                        content: `🚫 **Blocked**: ${reason}`,
                        flags: [MessageFlags.Ephemeral]
                    });
                }
                return; // Abort interaction processing
            }
        }

        if (interaction.isModalSubmit?.() && interaction.customId === "ticket:close_reason") {
            if (!interaction.guild) return;
            const config = getGuildConfig(interaction.guild.id);
            if (!moduleEnabled(config, "tickets", false)) {
                await safeReply(interaction, {
                    content: "Tickets are disabled on this server.",
                    flags: [MessageFlags.Ephemeral]
                });
                return;
            }
            const reason = interaction.fields.getTextInputValue("reason");
            const channel = interaction.channel;
            const ticketInfo = ticketManager.parseTicketTopic(channel?.topic || "");
            await ticketManager.closeTicket(interaction, config, { reason });
            if (ticketInfo.isTicket) {
                emitActivityEvent(interaction.guild.id, {
                    id: `ticket:close:${channel?.id || "unknown"}:${Date.now()}`,
                    type: "tickets",
                    action: "close",
                    userId: ticketInfo.ownerId || null,
                    userName: ticketInfo.ownerTag || ticketInfo.ownerId || "Unknown",
                    actorId: interaction.user?.id || null,
                    actorName: interaction.member?.displayName || interaction.user?.globalName || interaction.user?.username || interaction.user?.id || "Unknown",
                    channelId: channel?.id || null,
                    channelName: ticketChannelLabel(channel),
                    reason: String(reason || "No close reason provided").slice(0, 500),
                    description: `Ticket wurde geschlossen${reason ? ` (Grund: ${String(reason).slice(0, 180)})` : ''}`,
                    severity: "info",
                });
            }
            return;
        }

        if (interaction.isModalSubmit?.() && interaction.customId.startsWith("ticket:intake:")) {
            if (!interaction.guild) return;
            const config = getGuildConfig(interaction.guild.id);
            if (!moduleEnabled(config, "tickets", false)) {
                await safeReply(interaction, {
                    content: "Tickets are disabled on this server.",
                    flags: [MessageFlags.Ephemeral]
                });
                return;
            }
            const typeKey = interaction.customId.split(":")[2] || "support";
            const types = Array.isArray(config.tickets?.ticketTypes) ? config.tickets.ticketTypes : [];
            const selectedType = types.find(type => type.key === typeKey) || {
                label: "Support",
                priority: config.tickets?.defaultPriority || "normal",
                description: "General support request",
            };
            const reason = interaction.fields.getTextInputValue("reason");
            const extra = interaction.fields.getTextInputValue("extra") || "";
            await openTicketForInteraction(interaction, {
                reason: extra ? `${reason}\n\nExtra: ${extra}` : reason,
                priority: selectedType.priority || config.tickets?.defaultPriority || "normal",
                typeLabel: selectedType.label || "Support",
            });
            return;
        }

        // Handle help command buttons and dashboard-created role menus.
        if (interaction.isButton() || interaction.isStringSelectMenu?.()) {
            if (interaction.isButton() && interaction.customId.startsWith("welcome:verify:")) {
                if (!interaction.guild || !interaction.member) return;
                const config = getGuildConfig(interaction.guild.id);
                const welcome = config.welcome && typeof config.welcome === "object" ? config.welcome : {};
                if (!welcomeModuleEnabled(config) || !welcome.verificationEnabled) {
                    await safeReply(interaction, {
                        content: "Verification is currently disabled on this server.",
                        flags: [MessageFlags.Ephemeral]
                    });
                    return;
                }

                const roleIds = [
                    welcome.verificationRoleId,
                    welcome.autoroleEnabled ? welcome.autoroleId : null,
                ].filter(Boolean);
                const hadVerificationRole = roleIds.some(roleId => interaction.member.roles.cache.has(String(roleId)));
                const me = interaction.guild.members.me || await interaction.guild.members.fetchMe().catch(() => null);
                const added = [];
                for (const roleId of roleIds) {
                    const role = interaction.guild.roles.cache.get(String(roleId));
                    const canAssign = role && me && !role.managed && role.position < me.roles.highest.position && me.permissions.has(PermissionsBitField.Flags.ManageRoles);
                    if (canAssign) {
                        await interaction.member.roles.add(role, "Fahrstuhl welcome verification").catch(error => {
                            console.warn(`⚠️ Verification role assign failed in ${interaction.guild.name}: ${error.message}`);
                        });
                        added.push(role.name);
                    }
                }

                await safeReply(interaction, {
                    content: added.length > 0
                        ? `✅ Du bist verifiziert. Rollen: ${added.join(", ")}`
                        : "✅ Du bist verifiziert, aber ich konnte keine Rolle vergeben. Bitte Staff informieren.",
                    flags: [MessageFlags.Ephemeral]
                });
                if (welcome.verificationCountButtonEnabled && !hadVerificationRole) {
                    const nextWelcome = {
                        ...welcome,
                        verificationCount: verificationCountValue(welcome.verificationCount) + 1,
                    };
                    setGuildConfig(interaction.guild.id, {
                        ...config,
                        welcome: nextWelcome,
                    });
                    if (typeof reloadCache === "function") {
                        await reloadCache().catch(error => {
                            console.warn(`⚠️ Welcome verification count cache reload failed: ${error.message}`);
                        });
                    }
                    await interaction.message.edit({
                        components: buildVerificationComponents(interaction.guild.id, nextWelcome),
                    }).catch(error => {
                        console.warn(`⚠️ Verification count button update failed in ${interaction.guild.name}: ${error.message}`);
                    });
                }

                emitActivityEvent(interaction.guild.id, {
                    id: `verification:success:${interaction.user?.id || "unknown"}:${Date.now()}`,
                    type: "moderation",
                    action: "verify",
                    userId: interaction.user?.id || null,
                    userName: interaction.member?.displayName || interaction.user?.globalName || interaction.user?.username || interaction.user?.id || "Unknown",
                    actorId: interaction.user?.id || null,
                    actorName: interaction.member?.displayName || interaction.user?.globalName || interaction.user?.username || interaction.user?.id || "Unknown",
                    description: "Verifikation erfolgreich",
                    severity: "info",
                });
                return;
            }

            if (interaction.customId.startsWith("ticket:feedback:")) {
                const parts = interaction.customId.split(":");
                await ticketManager.recordTicketFeedback(interaction, parts[2], parts[3]);
                return;
            }

            if (interaction.customId.startsWith("ticket:") && interaction.customId !== "ticket:type") {
                if (!interaction.guild) {
                    await safeReply(interaction, {
                        content: "Tickets only work inside a server.",
                        flags: [MessageFlags.Ephemeral]
                    });
                    return;
                }
                const config = getGuildConfig(interaction.guild.id);
                if (!moduleEnabled(config, "tickets", false)) {
                    await safeReply(interaction, {
                        content: "Tickets are disabled on this server.",
                        flags: [MessageFlags.Ephemeral]
                    });
                    return;
                }

                if (interaction.customId === "ticket:open") {
                    await openTicketForInteraction(interaction);
                    return;
                }
                if (interaction.customId === "ticket:claim") {
                    await ticketManager.claimTicket(interaction, config);
                    const ticketInfo = ticketManager.parseTicketTopic(interaction.channel?.topic || "");
                    if (ticketInfo.isTicket) {
                        emitActivityEvent(interaction.guild.id, {
                            id: `ticket:claim:${interaction.channel?.id || "unknown"}:${Date.now()}`,
                            type: "tickets",
                            action: "claim",
                            userId: ticketInfo.ownerId || null,
                            userName: ticketInfo.ownerTag || ticketInfo.ownerId || "Unknown",
                            actorId: interaction.user?.id || null,
                            actorName: interaction.member?.displayName || interaction.user?.globalName || interaction.user?.username || interaction.user?.id || "Unknown",
                            channelId: interaction.channel?.id || null,
                            channelName: ticketChannelLabel(interaction.channel),
                            description: `${interaction.member?.displayName || interaction.user?.username || interaction.user?.id || "Ein Teammitglied"} hat das Ticket uebernommen`,
                            severity: "info",
                        });
                    }
                    return;
                }
                if (interaction.customId === "ticket:unclaim") {
                    await ticketManager.unclaimTicket(interaction, config);
                    const ticketInfo = ticketManager.parseTicketTopic(interaction.channel?.topic || "");
                    if (ticketInfo.isTicket) {
                        emitActivityEvent(interaction.guild.id, {
                            id: `ticket:unclaim:${interaction.channel?.id || "unknown"}:${Date.now()}`,
                            type: "tickets",
                            action: "unclaim",
                            userId: ticketInfo.ownerId || null,
                            userName: ticketInfo.ownerTag || ticketInfo.ownerId || "Unknown",
                            actorId: interaction.user?.id || null,
                            actorName: interaction.member?.displayName || interaction.user?.globalName || interaction.user?.username || interaction.user?.id || "Unknown",
                            channelId: interaction.channel?.id || null,
                            channelName: ticketChannelLabel(interaction.channel),
                            description: `${interaction.member?.displayName || interaction.user?.username || interaction.user?.id || "Ein Teammitglied"} hat das Ticket freigegeben`,
                            severity: "info",
                        });
                    }
                    return;
                }
                if (interaction.customId === "ticket:close") {
                    if (config.tickets?.requireCloseReason) {
                        const modal = new ModalBuilder()
                            .setCustomId("ticket:close_reason")
                            .setTitle("Close Ticket");
                        const reasonInput = new TextInputBuilder()
                            .setCustomId("reason")
                            .setLabel("Close reason")
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true)
                            .setMaxLength(500)
                            .setPlaceholder("What was resolved, escalated, or rejected?");
                        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
                        await interaction.showModal(modal);
                        return;
                    }
                    const channel = interaction.channel;
                    const ticketInfo = ticketManager.parseTicketTopic(channel?.topic || "");
                    await ticketManager.closeTicket(interaction, config, { reason: "Closed with dashboard button" });
                    if (ticketInfo.isTicket) {
                        emitActivityEvent(interaction.guild.id, {
                            id: `ticket:close:${channel?.id || "unknown"}:${Date.now()}`,
                            type: "tickets",
                            action: "close",
                            userId: ticketInfo.ownerId || null,
                            userName: ticketInfo.ownerTag || ticketInfo.ownerId || "Unknown",
                            actorId: interaction.user?.id || null,
                            actorName: interaction.member?.displayName || interaction.user?.globalName || interaction.user?.username || interaction.user?.id || "Unknown",
                            channelId: channel?.id || null,
                            channelName: ticketChannelLabel(channel),
                            description: `${interaction.member?.displayName || interaction.user?.username || interaction.user?.id || "Ein Teammitglied"} hat das Ticket geschlossen`,
                            severity: "info",
                        });
                    }
                    return;
                }
                if (interaction.customId.startsWith("ticket:priority:")) {
                    const priority = interaction.customId.split(":")[2] || "normal";
                    console.log(
                        `[PriorityDebug] received customId=${interaction.customId} user=${interaction.user?.id || "unknown"} channel=${interaction.channel?.id || "unknown"} selected=${priority}`
                    );
                    try {
                        await ticketManager.setTicketPriority(interaction, config, priority);
                        console.log(
                            `[PriorityDebug] completed customId=${interaction.customId} user=${interaction.user?.id || "unknown"} channel=${interaction.channel?.id || "unknown"} selected=${priority}`
                        );
                    } catch (error) {
                        console.error(
                            `[PriorityDebug] failed customId=${interaction.customId} user=${interaction.user?.id || "unknown"} channel=${interaction.channel?.id || "unknown"} selected=${priority}:`,
                            error
                        );
                        throw error;
                    }
                    const ticketInfo = ticketManager.parseTicketTopic(interaction.channel?.topic || "");
                    if (ticketInfo.isTicket) {
                        emitActivityEvent(interaction.guild.id, {
                            id: `ticket:priority:${interaction.channel?.id || "unknown"}:${Date.now()}`,
                            type: "tickets",
                            action: "priority",
                            userId: ticketInfo.ownerId || null,
                            userName: ticketInfo.ownerTag || ticketInfo.ownerId || "Unknown",
                            actorId: interaction.user?.id || null,
                            actorName: interaction.member?.displayName || interaction.user?.globalName || interaction.user?.username || interaction.user?.id || "Unknown",
                            channelId: interaction.channel?.id || null,
                            channelName: ticketChannelLabel(interaction.channel),
                            description: `${interaction.member?.displayName || interaction.user?.username || interaction.user?.id || "Ein Teammitglied"} hat die Ticket-Prioritaet auf ${priority} gesetzt`,
                            severity: "info",
                        });
                    }
                    return;
                }
                if (interaction.customId.startsWith("ticket:status:")) {
                    const status = interaction.customId.split(":")[2] || "open";
                    await ticketManager.setTicketStatus(interaction, config, status);
                    const ticketInfo = ticketManager.parseTicketTopic(interaction.channel?.topic || "");
                    if (ticketInfo.isTicket) {
                        emitActivityEvent(interaction.guild.id, {
                            id: `ticket:status:${interaction.channel?.id || "unknown"}:${Date.now()}`,
                            type: "tickets",
                            action: "status",
                            userId: ticketInfo.ownerId || null,
                            userName: ticketInfo.ownerTag || ticketInfo.ownerId || "Unknown",
                            actorId: interaction.user?.id || null,
                            actorName: interaction.member?.displayName || interaction.user?.globalName || interaction.user?.username || interaction.user?.id || "Unknown",
                            channelId: interaction.channel?.id || null,
                            channelName: ticketChannelLabel(interaction.channel),
                            description: `${interaction.member?.displayName || interaction.user?.username || interaction.user?.id || "Ein Teammitglied"} hat den Ticket-Status auf ${status} gesetzt`,
                            severity: "info",
                        });
                    }
                    return;
                }
                return;
            }

            if (interaction.isStringSelectMenu?.() && interaction.customId === "ticket:type") {
                if (!interaction.guild) {
                    await safeReply(interaction, {
                        content: "Tickets only work inside a server.",
                        flags: [MessageFlags.Ephemeral]
                    });
                    return;
                }
                const config = getGuildConfig(interaction.guild.id);
                if (!moduleEnabled(config, "tickets", false)) {
                    await safeReply(interaction, {
                        content: "Tickets are disabled on this server.",
                        flags: [MessageFlags.Ephemeral]
                    });
                    return;
                }
                const typeKey = interaction.values?.[0] || "support";
                const types = Array.isArray(config.tickets?.ticketTypes) ? config.tickets.ticketTypes : [];
                const selectedType = types.find(type => type.key === typeKey) || {
                    key: "support",
                    label: "Support",
                    priority: config.tickets?.defaultPriority || "normal",
                    description: "General support request",
                };
                const modal = new ModalBuilder()
                    .setCustomId(`ticket:intake:${selectedType.key}`)
                    .setTitle(`${selectedType.label.slice(0, 32)} Ticket`);
                const reasonInput = new TextInputBuilder()
                    .setCustomId("reason")
                    .setLabel("Describe your request")
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(800)
                    .setPlaceholder("Explain what happened, what you need, or paste relevant IDs/links.");
                const extraInput = new TextInputBuilder()
                    .setCustomId("extra")
                    .setLabel("Extra context")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setMaxLength(160)
                    .setPlaceholder("Order ID, user ID, appeal case, proof link...");
                modal.addComponents(
                    new ActionRowBuilder().addComponents(reasonInput),
                    new ActionRowBuilder().addComponents(extraInput)
                );
                await interaction.showModal(modal);
                return;
            }

            if (interaction.customId.startsWith('rr:')) {
                if (!interaction.guild) {
                    await safeReply(interaction, {
                        content: 'Reaction roles only work inside a server.',
                        flags: [MessageFlags.Ephemeral]
                    });
                    return;
                }

                const parts = interaction.customId.split(':');
                const panelId = parts.length >= 3 ? parts[1] : 'default';
                const roleId = parts.length >= 3 ? parts.slice(2).join(':') : interaction.customId.slice(3);
                const config = getGuildConfig(interaction.guild.id);
                if (!moduleEnabled(config, 'reactionRoles', false)) {
                    await safeReply(interaction, {
                        content: 'Reaction Roles are disabled on this server.',
                        flags: [MessageFlags.Ephemeral]
                    });
                    return;
                }

                const panels = Array.isArray(config.reactionRoles?.panels) ? config.reactionRoles.panels : [];
                const activePanel = panels.find(panel => String(panel.id) === panelId)
                    || (panels.length ? panels[0] : { id: 'default', roles: Array.isArray(config.reactionRoles?.roles) ? config.reactionRoles.roles : [], exclusive: !!config.reactionRoles?.exclusive });
                const configuredRoles = Array.isArray(activePanel?.roles) ? activePanel.roles : [];
                const configured = configuredRoles.find(item => String(item.roleId) === roleId);
                if (!configured) {
                    await safeReply(interaction, {
                        content: 'This role button is no longer configured.',
                        flags: [MessageFlags.Ephemeral]
                    });
                    return;
                }

                const role = interaction.guild.roles.cache.get(roleId);
                const botMember = interaction.guild.members.me;
                const canManage = botMember?.permissions?.has(PermissionsBitField.Flags.ManageRoles) ?? false;
                if (!role || !canManage || role.managed || role.position >= (botMember?.roles?.highest?.position ?? 0)) {
                    await safeReply(interaction, {
                        content: 'Fahrstuhl cannot assign this role. Check Manage Roles and role order.',
                        flags: [MessageFlags.Ephemeral]
                    });
                    return;
                }

                const member = await interaction.guild.members.fetch(interaction.user.id);
                const hadRole = member.roles.cache.has(role.id);
                const exclusive = !!activePanel?.exclusive;
                if (hadRole) {
                    await member.roles.remove(role, 'Reaction role button toggle');
                } else {
                    if (exclusive) {
                        const otherRoleIds = configuredRoles
                            .map(item => String(item.roleId))
                            .filter(id => id !== String(role.id));
                        for (const otherRoleId of otherRoleIds) {
                            const otherRole = interaction.guild.roles.cache.get(otherRoleId);
                            if (!otherRole || !member.roles.cache.has(otherRoleId)) continue;
                            if (otherRole.managed || otherRole.position >= (botMember?.roles?.highest?.position ?? 0)) continue;
                            await member.roles.remove(otherRole, 'Reaction role exclusive panel switch').catch(() => {});
                        }
                    }
                    await member.roles.add(role, 'Reaction role button toggle');
                }

                await safeReply(interaction, {
                    content: hadRole ? `Removed ${role}.` : `Added ${role}.`,
                    flags: [MessageFlags.Ephemeral],
                    allowedMentions: { roles: [] }
                });
                return;
            }

            if (interaction.customId.startsWith('rrs:') && interaction.isStringSelectMenu?.()) {
                if (!interaction.guild) {
                    await safeReply(interaction, {
                        content: 'Reaction roles only work inside a server.',
                        flags: [MessageFlags.Ephemeral]
                    });
                    return;
                }

                const panelId = interaction.customId.slice(4);
                const config = getGuildConfig(interaction.guild.id);
                if (!moduleEnabled(config, 'reactionRoles', false)) {
                    await safeReply(interaction, {
                        content: 'Reaction Roles are disabled on this server.',
                        flags: [MessageFlags.Ephemeral]
                    });
                    return;
                }

                const panels = Array.isArray(config.reactionRoles?.panels) ? config.reactionRoles.panels : [];
                const panel = panels.find(item => String(item.id) === panelId);
                const configuredRoles = Array.isArray(panel?.roles) ? panel.roles : [];
                if (!configuredRoles.length) {
                    await safeReply(interaction, {
                        content: 'This role menu is no longer configured.',
                        flags: [MessageFlags.Ephemeral]
                    });
                    return;
                }

                const allowedRoleIds = new Set(configuredRoles.map(item => String(item.roleId)));
                const exclusive = !!panel?.exclusive;
                const rawSelected = (interaction.values || []).filter(roleId => allowedRoleIds.has(roleId));
                const selectedRoleIds = new Set(exclusive && rawSelected.length > 1 ? [rawSelected[0]] : rawSelected);
                const botMember = interaction.guild.members.me;
                const canManage = botMember?.permissions?.has(PermissionsBitField.Flags.ManageRoles) ?? false;
                if (!canManage) {
                    await safeReply(interaction, {
                        content: 'Fahrstuhl cannot assign roles. Check Manage Roles permission.',
                        flags: [MessageFlags.Ephemeral]
                    });
                    return;
                }

                const member = await interaction.guild.members.fetch(interaction.user.id);
                const added = [];
                const removed = [];

                for (const roleId of allowedRoleIds) {
                    const role = interaction.guild.roles.cache.get(roleId);
                    if (!role || role.managed || role.position >= (botMember?.roles?.highest?.position ?? 0)) continue;

                    const hasRole = member.roles.cache.has(role.id);
                    if (selectedRoleIds.has(role.id) && !hasRole) {
                        await member.roles.add(role, 'Reaction role menu select');
                        added.push(role.name);
                    } else if (!selectedRoleIds.has(role.id) && hasRole) {
                        await member.roles.remove(role, 'Reaction role menu select');
                        removed.push(role.name);
                    }
                }

                const parts = [];
                if (added.length) parts.push(`Added: ${added.join(', ')}`);
                if (removed.length) parts.push(`Removed: ${removed.join(', ')}`);
                await safeReply(interaction, {
                    content: parts.length ? parts.join('\n') : 'No role changes.',
                    flags: [MessageFlags.Ephemeral],
                    allowedMentions: { roles: [] }
                });
                return;
            }

            if (interaction.customId.startsWith('help_')) {
                const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
                const config = getGuildConfig(interaction.guild.id);
                const roleDisplay = config.roleId ? `<@&${config.roleId}>` : "❌ Not set";
                const trollRoleDisplay = config.trollRoleId ? `<@&${config.trollRoleId}>` : "❌ Not set";

                const embeds = {
                    setup: new EmbedBuilder()
                        .setColor(0x5865F2)
                        .setTitle('⚙️ SETUP (Required First!)')
                        .setDescription('Admins must run these commands first:')
                        .addFields(
                            { name: '1️⃣ /settrollrole @role', value: '🔐 Choose who can use troll commands\n*(Admin-only)*' },
                            { name: '2️⃣ /setrole @role', value: '🚀 Members with this role auto-move in voice\n*(Troll role required)*' },
                            { name: '📋 Current Setup', value: `**Troll Role:** ${trollRoleDisplay}\n**Auto-Move Role:** ${roleDisplay}` }
                        ),
                    trolls: new EmbedBuilder()
                        .setColor(0xED4245)
                        .setTitle('😈 TROLL COMMANDS')
                        .setDescription('All the fun stuff! (Requires troll role)')
                        .addFields(
                            { name: '🚀 /elevator @user', value: 'Move user randomly for 30 seconds' },
                            { name: '👻 /ghost @user', value: 'Haunt user - 1m Free, 5m Premium, 10m Pro' },
                            { name: '🔇 /mute @user', value: 'Randomly mute user - 1m Free, 5m Premium, 10m Pro' },
                            { name: '🪞 /mirror @user', value: 'Mirror user identity - 1m Free, 5m Premium, 10m Pro' },
                            { name: '📞 /deafen @user', value: 'Randomly deafen user - 1m Free, 5m Premium, 10m Pro' },
                            { name: '💥 /preset full @user', value: 'Activate ALL trolls at once!' },
                            { name: '🎲 /preset random @user', value: 'Activate 2-3 random trolls' },
                            { name: '🛑 /presetstop @user', value: 'Stop ALL trolls immediately' }
                        ),
                    shields: new EmbedBuilder()
                        .setColor(0x00FFFF)
                        .setTitle('🛡️ SHIELD SYSTEM (Free Protection!)')
                        .setDescription('Protect yourself from trolling!')
                        .addFields(
                            { name: '📎 /claim', value: '🎁 Get 1 free shield every 2.5 hours\n*(Requires: Unique Bots member)*\n💎 Boosters: +10 bonus shields/month' },
                            { name: '🛡️ /shield', value: '⏱️ Activate shield for 2 hours immunity' },
                            { name: '📊 /checkshield', value: '📈 Check your shield status & inventory' },
                            { name: '💡 How Shields Work', value: '✅ Active shield = Can\'t be trolled\n✅ Share with friends\n✅ Recharge for free every 2.5h' }
                        ),
                    other: new EmbedBuilder()
                        .setColor(0x57F287)
                        .setTitle('📊 OTHER COMMANDS')
                        .addFields(
                            { name: '📊 /status [user]', value: 'Bot/server health and active trolls, optional user details' },
                            { name: '🌐 /dashboard', value: 'Get dashboard and setup links' },
                            { name: '🔄 /help', value: 'You\'re reading it right now! 😄' },
                            { name: '📎 Support Server', value: 'discord.gg/zfzDHKcWDx' }
                        )
                };

                const buttons = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('help_setup')
                            .setLabel('⚙️ Setup')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('help_trolls')
                            .setLabel('😈 Trolls')
                            .setStyle(ButtonStyle.Danger),
                        new ButtonBuilder()
                            .setCustomId('help_shields')
                            .setLabel('🛡️ Shields')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId('help_other')
                            .setLabel('📊 Other')
                            .setStyle(ButtonStyle.Secondary)
                    );

                const page = interaction.customId.replace('help_', '');
                await interaction.update({
                    embeds: [embeds[page]],
                    components: [buttons]
                }).catch(() => {});
                return;
            }
        }

        await handleInteraction(interaction, {
            client,
            logToMaster,
            getGuildConfig,
            setGuildConfig,
            getUserStats,
            setUserStats,
            reloadCache,
            getCacheStatus,
            getBackupStatus: backupManager.getStatus,
            getDbStatus,
            DEV_GUILD_ID,
            OWNER_ID,
            safeReply,
            incrementStat,
            startAutoMove,
            stopAutoMove,
            startGhostVisit,
            startSilentPost,
            startMirror,
            startDeafTroll,
            getTrollKey,
            isUserImmune,
            cleanupUserOperations,
            stopAllMirrors,
            activeMoves,
            activeMoveEnds,
            initialChannels,
            activeGhosts,
            activeSilentPost,
            activeMirror,
            activeDeafTroll,
            globalStop: globalState.stop,
            setGlobalStop: (val) => { globalState.stop = val; saveGlobalStop(val); },
            rateLimiter,
            auditLogger,
            voiceTracker,
            healthManager,
            gracefulDegradation,
            metricsCollector,
            guildAwareCooldown,
            notificationManager,
            syncSlashCommands,
            tempVoiceChannels
        });
    } catch (err) {
        if (err.code !== 10062 && err.code !== 40060) {
            console.error("Top-level interaction error:", err);
        }
    }
});

async function main() {
    if (!token) {
        console.error("❌ TOKEN missing in .env file.");
        process.exit(1);
    }
    await initConfig();
    await client.login(token);
}

main().catch((err) => {
    console.error("❌ Startup failed:", err);
    process.exit(1);
});

async function shutdown() {
    console.log("\n🛑 Shutdown signal received...");
    await logToMaster({
        title: "🛑 Bot shutting down",
        description: "All active troll operations will be terminated properly.",
        color: COLORS.ERROR
    }, "SYSTEM");

    // Stop Bot API Server
    if (apiServer) {
        apiServer.stop();
    }

    activeIntervals.forEach((interval) => clearInterval(interval));
    activeMoves.forEach((interval) => clearInterval(interval));
    activeMoveEnds.clear();
    activeGhosts.forEach((entry) => clearStoredTimeout(entry));
    activeSilentPost.forEach((entry) => clearStoredTimeout(entry));
    activeDeafTroll.forEach((entry) => clearStoredTimeout(entry));
    await stopAllMirrors({ log: false });

    // Stop ops alerts
    if (opsAlertManager) {
        opsAlertManager.stop();
    }

    // Stop health checks
    healthManager.stopPeriodicChecks();

    // Cleanup voice connections
    await voiceTracker.cleanup();
    await voiceUsageTracker.stop();
    if (voiceRewardBridge) voiceRewardBridge.stop();
    socialNotifier.stop();
    freeGamesNotifier.stop();

    // Cleanup graceful degradation
    // (keep fallback data for next startup)

    await flushGlobalStats(true);
    backupManager.stop();
    auditLogger.stop();

    client.guilds.cache.forEach(guild => {
        const connection = getVoiceConnection(guild.id);
        if (connection) connection.destroy();
    });

    console.log("✅ All done. Goodbye!");
    client.destroy();
    process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("unhandledRejection", async (reason, promise) => {
    console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
    await logToMaster({
        title: "❌ Unhandled Rejection",
        description: `\`\`\`js\n${reason.stack || reason}\n\`\`\``,
        color: 0xED4245
    }, "ERRORS").catch(err => console.error("Error logging rejection:", err));
});
