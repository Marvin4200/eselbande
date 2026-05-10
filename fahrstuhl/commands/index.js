const { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionsBitField, AttachmentBuilder } = require("discord.js");
const { COLORS, EMOJIS, FOOTERS, createLoadingEmbed, deferWithLoading } = require("../utils/designSystem");
const { sendServerLog } = require("../utils/serverLogger");
const ticketManager = require("../utils/ticketManager");
const { parseBoolean } = require("../utils/valueParsers");
const { version: BOT_VERSION } = require("../package.json");

function dashboardBaseUrl() {
    const raw = String(process.env.DASHBOARD_PUBLIC_URL || process.env.DASHBOARD_URL || "https://eselbande.com/fahrstuhl").trim();
    const rawBasePath = String(process.env.DASHBOARD_BASE_URL || "/fahrstuhl").trim();
    const normalizedBasePath = (() => {
        const trimmed = rawBasePath.replace(/^\/+|\/+$/g, "");
        return trimmed ? `/${trimmed}` : "/fahrstuhl";
    })();

    try {
        const parsed = new URL(raw);
        let pathname = parsed.pathname.replace(/\/+$/g, "");
        if (!pathname || pathname === "/") {
            pathname = normalizedBasePath;
        }
        return `${parsed.origin}${pathname}`;
    } catch (_error) {
        return raw.replace(/\/+$/g, "");
    }
}

function dashboardPageUrl(page, params = {}) {
    const pageName = String(page || "portal").replace(/[^a-z0-9_-]/gi, "");
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        query.set(key, String(value));
    });
    const queryString = query.toString();
    return `${dashboardBaseUrl()}/pages/${pageName}.php${queryString ? `?${queryString}` : ""}`;
}

const commands = [
    new SlashCommandBuilder()
        .setName("elevator")
        .setDescription("🚀 Move user(s) randomly through voice channels (Pro: 60s duration, Multi-target)")
        .addUserOption(option =>
            option.setName("user")
                .setDescription("The user to troll")
                .setRequired(true)
        )
        .addUserOption(option =>
            option.setName("user2")
                .setDescription("[Premium] Second user (optional)")
                .setRequired(false)
        )
        .addUserOption(option =>
            option.setName("user3")
                .setDescription("[Premium] Third user (optional)")
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName("ghost")
        .setDescription("👻 Haunt a user for 1m, 5m or 10m depending on tier")
        .addUserOption(option =>
            option.setName("user")
                .setDescription("The user to haunt")
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName("mute")
        .setDescription("🔇 Randomly mute a user for a timed duration based on tier")
        .addUserOption(option =>
            option.setName("user")
                .setDescription("The user to mute")
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName("mirror")
        .setDescription("🪞 Mirror a user for 1m, 5m or 10m depending on tier")
        .addUserOption(option =>
            option.setName("user")
                .setDescription("The user to mirror")
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName("deafen")
        .setDescription("📞 Randomly deafen a user for a timed duration based on tier")
        .addUserOption(option =>
            option.setName("user")
                .setDescription("The user to deafen")
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName("setrole")
        .setDescription("⚙️ Set automatic role - members with this role get auto-moved in voice channels")
        .addRoleOption(option =>
            option.setName("role")
                .setDescription("The role")
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName("settrollrole")
        .setDescription("🔐 Set troll role - only users with this role can use troll commands (admin-only)")
        .addRoleOption(option =>
            option.setName("role")
                .setDescription("The role")
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName("help")
        .setDescription("📖 Shows all commands, features, and how to set up the bot"),
    new SlashCommandBuilder()
        .setName("preset")
        .setDescription("💥 Activate multiple trolls at once - Full Attack or Random mode")
        .addStringOption(option =>
            option.setName("type")
                .setDescription("Preset type")
                .setRequired(true)
                .addChoices(
                    { name: "Full Attack", value: "full" },
                    { name: "Random", value: "random" }
                )
        )
        .addUserOption(option =>
            option.setName("user")
                .setDescription("The user")
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName("presetstop")
        .setDescription("🛑 Stop ALL active trolls for a user immediately")
        .addUserOption(option =>
            option.setName("user")
                .setDescription("The user")
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName("globalstop")
        .setDescription("🛑 Emergency stop - disable all troll functions on all servers (dev-only)"),
    new SlashCommandBuilder()
        .setName("claim")
        .setDescription("🛡️ Claim 1 free shield every 2.5 hours (requires Unique Bots membership)"),
    new SlashCommandBuilder()
        .setName("shield")
        .setDescription("🛡️ Activate a shield for 2 hours of immunity from all trolls")
        .addUserOption(option =>
            option.setName("user")
                .setDescription("The user to troll (optional)")
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName("checkshield")
        .setDescription("🛡️ Check your shield status and inventory")
    ,
    new SlashCommandBuilder()
        .setName("status")
        .setDescription("📊 See all active trolls on this server or for a specific user")
        .addUserOption(option =>
            option.setName("user")
                .setDescription("The user (optional)")
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName("addshield")
        .setDescription("Give shields to a user (owner-only)")
        .addUserOption(option =>
            option.setName("user")
                .setDescription("The user")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName("amount")
                .setDescription("Number of shields")
                .setMinValue(1)
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName("removeshield")
        .setDescription("Remove shields from a user (owner-only)")
        .addUserOption(option =>
            option.setName("user")
                .setDescription("The user")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName("amount")
                .setDescription("Number of shields")
                .setMinValue(1)
                .setRequired(false)
        ),
     new SlashCommandBuilder()
        .setName("reloadcache")
        .setDescription("Reload cache from database (owner-only)"),
    new SlashCommandBuilder()
        .setName("synccommands")
        .setDescription("Re-register slash commands on all servers (owner-only)"),
    new SlashCommandBuilder()
        .setName("dbstatus")
        .setDescription("Shows current DB/cache status (owner-only)"),
    new SlashCommandBuilder()
        .setName("testsetupdm")
        .setDescription("Send a test setup reminder DM to yourself (owner-only)"),
    new SlashCommandBuilder()
        .setName("notifysettings")
        .setDescription("📬 Toggle troll notifications - Get DM when you're being trolled")
        .addBooleanOption(option =>
            option.setName("enabled")
                .setDescription("Enable or disable DM notifications")
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName("invite")
        .setDescription("📨 Get the invite link to add Fahrstuhl Bot to your server"),
    new SlashCommandBuilder()
        .setName("dashboard")
        .setDescription("🌐 Get the Fahrstuhl dashboard link and server setup shortcuts"),
    new SlashCommandBuilder()
        .setName("setup")
        .setDescription("✅ Check server setup, modules and missing permissions"),
    new SlashCommandBuilder()
        .setName("serverinfo")
        .setDescription("🏰 Show server stats, modules and bot permissions"),
    new SlashCommandBuilder()
        .setName("rank")
        .setDescription("📈 Show your server level or another user's rank")
        .addUserOption(option =>
            option.setName("user")
                .setDescription("The user")
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("🏆 Show this server's leveling leaderboard")
        .addIntegerOption(option =>
            option.setName("page")
                .setDescription("Leaderboard page number")
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(200)
        ),
    new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("🎫 Open, manage and close private support tickets")
        .addSubcommand(subcommand =>
            subcommand
                .setName("open")
                .setDescription("Open a private support ticket")
                .addStringOption(option =>
                    option.setName("reason")
                        .setDescription("What do you need help with?")
                        .setRequired(false)
                        .setMaxLength(120)
                )
                .addStringOption(option =>
                    option.setName("priority")
                        .setDescription("How urgent is this ticket?")
                        .setRequired(false)
                        .addChoices(
                            { name: "Normal", value: "normal" },
                            { name: "High", value: "high" },
                            { name: "Low", value: "low" }
                        )
                )
                .addStringOption(option =>
                    option.setName("type")
                        .setDescription("What kind of ticket is this?")
                        .setRequired(false)
                        .addChoices(
                            { name: "Support", value: "Support" },
                            { name: "Report", value: "Report" },
                            { name: "Appeal", value: "Appeal" },
                            { name: "Partnership", value: "Partnership" },
                            { name: "Other", value: "Other" }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("close")
                .setDescription("Close this ticket channel")
                .addStringOption(option =>
                    option.setName("reason")
                        .setDescription("Why is this ticket being closed?")
                        .setRequired(false)
                        .setMaxLength(160)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("note")
                .setDescription("Add an internal staff note to this ticket")
                .addStringOption(option =>
                    option.setName("text")
                        .setDescription("Internal note for the ticket archive")
                        .setRequired(true)
                        .setMaxLength(1000)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("adduser")
                .setDescription("Give another member access to this ticket")
                .addUserOption(option =>
                    option.setName("user")
                        .setDescription("Member to add")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("removeuser")
                .setDescription("Remove a directly added member from this ticket")
                .addUserOption(option =>
                    option.setName("user")
                        .setDescription("Member to remove")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("claim")
                .setDescription("Claim this ticket as the handling staff member")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("unclaim")
                .setDescription("Release this ticket back to the team")
        ),
    new SlashCommandBuilder()
        .setName("mod")
        .setDescription("🛡️ Moderate your server and track cases")
        .addSubcommand(subcommand =>
            subcommand
                .setName("warn")
                .setDescription("Warn a member and save the case")
                .addUserOption(option =>
                    option.setName("user")
                        .setDescription("The member to warn")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName("reason")
                        .setDescription("Why are they being warned?")
                        .setRequired(false)
                        .setMaxLength(250)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("timeout")
                .setDescription("Timeout a member and save the case")
                .addUserOption(option =>
                    option.setName("user")
                        .setDescription("The member to timeout")
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName("minutes")
                        .setDescription("Timeout duration in minutes")
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(10080)
                )
                .addStringOption(option =>
                    option.setName("reason")
                        .setDescription("Why are they being timed out?")
                        .setRequired(false)
                        .setMaxLength(250)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("untimeout")
                .setDescription("Remove an active timeout")
                .addUserOption(option =>
                    option.setName("user")
                        .setDescription("The member to untimeout")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName("reason")
                        .setDescription("Why is the timeout removed?")
                        .setRequired(false)
                        .setMaxLength(250)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("ban")
                .setDescription("Ban a member from the server")
                .addUserOption(option =>
                    option.setName("user")
                        .setDescription("The member to ban")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName("reason")
                        .setDescription("Why are they being banned?")
                        .setRequired(false)
                        .setMaxLength(250)
                )
                .addIntegerOption(option =>
                    option.setName("delete_messages")
                        .setDescription("Delete message history from last X hours (default: 0)")
                        .setRequired(false)
                        .setMinValue(0)
                        .setMaxValue(168)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("kick")
                .setDescription("Kick a member from the server")
                .addUserOption(option =>
                    option.setName("user")
                        .setDescription("The member to kick")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName("reason")
                        .setDescription("Why are they being kicked?")
                        .setRequired(false)
                        .setMaxLength(250)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("history")
                .setDescription("Show recent moderation cases for a member")
                .addUserOption(option =>
                    option.setName("user")
                        .setDescription("The member")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("cases")
                .setDescription("Browse all mod cases for this server with optional filters")
                .addStringOption(option =>
                    option.setName("type")
                        .setDescription("Filter by case type")
                        .setRequired(false)
                        .addChoices(
                            { name: "Warn", value: "warn" },
                            { name: "Timeout", value: "timeout" },
                            { name: "Kick", value: "kick" },
                            { name: "Ban", value: "ban" },
                            { name: "Unban", value: "unban" },
                            { name: "AutoMod", value: "automod" },
                        )
                )
                .addIntegerOption(option =>
                    option.setName("page")
                        .setDescription("Page number (default: 1)")
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(100)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("unban")
                .setDescription("Unban a previously banned user by ID")
                .addStringOption(option =>
                    option.setName("userid")
                        .setDescription("The Discord user ID to unban")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName("reason")
                        .setDescription("Why are they being unbanned?")
                        .setRequired(false)
                        .setMaxLength(250)
                )
        ),
    new SlashCommandBuilder()
        .setName("settrollmessage")
        .setDescription("💎 [Premium] Set a custom message shown when you start a troll")
        .addStringOption(option =>
            option.setName("message")
                .setDescription("Your custom troll message (max 100 chars). Leave empty to reset.")
                .setRequired(false)
                .setMaxLength(100)
        ),
    new SlashCommandBuilder()
        .setName("voice")
        .setDescription("🔊 Manage your temporary voice channel")
        .addSubcommand(subcommand =>
            subcommand
                .setName("rename")
                .setDescription("Rename your temp voice channel")
                .addStringOption(option =>
                    option.setName("name")
                        .setDescription("New channel name (max 90 chars)")
                        .setRequired(true)
                        .setMaxLength(90)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("lock")
                .setDescription("Lock your temp voice channel (nobody can join)")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("unlock")
                .setDescription("Unlock your temp voice channel (everyone can join again)")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("limit")
                .setDescription("Set a user limit for your temp voice channel")
                .addIntegerOption(option =>
                    option.setName("slots")
                        .setDescription("Max users (0 = no limit)")
                        .setRequired(true)
                        .setMinValue(0)
                        .setMaxValue(99)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("kick")
                .setDescription("Kick a user from your temp voice channel")
                .addUserOption(option =>
                    option.setName("user")
                        .setDescription("The user to kick from the channel")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("claim")
                .setDescription("Claim ownership of a temp voice channel (if owner left)")
        ),
    new SlashCommandBuilder()
        .setName("serverbackup")
        .setDescription("💾 Backup and view your server structure (roles, channels, emojis, settings)")
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName("create")
                .setDescription("Create a full server backup (roles, channels, emojis, settings)")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("list")
                .setDescription("List existing server backups")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("info")
                .setDescription("Show details of a specific backup")
                .addStringOption(option =>
                    option.setName("filename")
                        .setDescription("Backup ID (from /serverbackup list)")
                        .setRequired(true)
                )
        ),
    new SlashCommandBuilder()
        .setName("leveling")
        .setDescription("📈 Manage leveling data for this server")
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName("resetuser")
                .setDescription("Reset XP and level for a specific member")
                .addUserOption(option =>
                    option.setName("user")
                        .setDescription("The member to reset")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("resetserver")
                .setDescription("Reset ALL leveling data for this server (cannot be undone)")
        ),
    new SlashCommandBuilder()
        .setName("freegames")
        .setDescription("🎮 Free game notifications from Epic Games Store")
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName("setup")
                .setDescription("Enable free game notifications and set the announcement channel")
                .addChannelOption(option =>
                    option.setName("channel")
                        .setDescription("Channel to post free game announcements in")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName("filter")
                        .setDescription("Which games to show (default: all)")
                        .setRequired(false)
                        .addChoices(
                            { name: "Alle Spiele (Epic, GOG, Steam, GamerPower, itch.io)", value: "all" },
                            { name: "Nur seriöse Stores (Epic, GOG, Steam)", value: "serious" },
                        )
                )
                .addRoleOption(option =>
                    option.setName("mention-role")
                        .setDescription("Role to mention with each announcement (optional)")
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("filter")
                .setDescription("Change which games get posted (serious stores only or all)")
                .addStringOption(option =>
                    option.setName("mode")
                        .setDescription("Filter mode")
                        .setRequired(true)
                        .addChoices(
                            { name: "Alle Spiele (Epic, GOG, Steam, GamerPower, itch.io)", value: "all" },
                            { name: "Nur seriöse Stores (Epic, GOG, Steam)", value: "serious" },
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("disable")
                .setDescription("Disable free game notifications for this server")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("status")
                .setDescription("Show current free game notification settings")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("test")
                .setDescription("Post the currently free games right now (owner-only)")
        ),
].map(cmd => cmd.toJSON());

async function handleInteraction(interaction, dependencies) {
    const {
        client,
        logToMaster,
        getGuildConfig,
        setGuildConfig,
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
        globalStop,
        setGlobalStop,
        getUserStats,
        setUserStats,
        reloadCache,
        getCacheStatus,
        getBackupStatus,
        getDbStatus,
        syncSlashCommands,
        DEV_GUILD_ID,
        OWNER_ID,
        rateLimiter,
        auditLogger,
        notificationManager
    } = dependencies;

    try {
        if (!interaction.isChatInputCommand()) return;
        if (!interaction.inGuild()) {
            return safeReply(interaction, { content: "This command only works in servers." });
        }

        // Track command execution for analytics
        const commandStatsManager = require('../utils/commandStatsManager');
        commandStatsManager.trackCommand(interaction.commandName);
        
        // Track to database for dashboard analytics (async, no await)
        const { getInstance } = require('../utils/analyticsDatabase');
        const analyticsTimeout = setTimeout(() => {}, 5000);
        getInstance().then(db => {
            clearTimeout(analyticsTimeout);
            db.trackExecution(interaction.commandName, interaction.user.id, interaction.guild.id);
        }).catch(err => {
            clearTimeout(analyticsTimeout);
            console.error('Analytics tracking error:', err);
        });

        // ===== CHECK BLACKLIST =====
        const blacklistManager = require('../utils/blacklistManager');
        blacklistManager.refresh(); // Reload from file (catches Dashboard changes)
        const blacklistEntry = blacklistManager.isBlacklisted(interaction.user.id, interaction.guildId);
        if (blacklistEntry) {
            const reason = blacklistEntry.reason || 'You are blacklisted';
            return safeReply(interaction, {
                content: `🚫 **You are blacklisted** - ${reason}`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        // Check if command is enabled via Flags
        const flagsManager = require('../utils/flagsManager');
        if (!flagsManager.isEnabled(interaction.commandName, interaction.guildId)) {
            const disableReason = flagsManager.getDisableReason(interaction.commandName, interaction.guildId);
            return safeReply(interaction, {
                content: `⚠️ ${disableReason}`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        // Check premium access for command
        const premiumManager = require('../utils/premiumManager');
        const isPremiumUser = await premiumManager.isPremium(interaction.user.id).catch(() => false);
        const isProUser = isPremiumUser ? await premiumManager.isPro(interaction.user.id).catch(() => false) : false;
        const isCommandAvailable = await premiumManager.isCommandAvailable(
            interaction.commandName,
            interaction.user.id
        );
        if (!isCommandAvailable) {
            const isProCommand = interaction.commandName === 'settrollmessage';
            const upgradeEmbed = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle(isProCommand ? '🔒 Pro Feature Required' : '🔒 Premium Feature Required')
                .setDescription(isProCommand
                    ? `\`/${interaction.commandName}\` requires **👑 Pro** access.\n${isPremiumUser ? "You have 💎 Basic — upgrade to 👑 Pro to unlock this!" : "You need at least 💎 Premium to use this bot's exclusive features."}`
                    : `\`/${interaction.commandName}\` requires **💎 Premium** access.`
                )
                .addFields(
                    { name: '💎 Basic Premium', value: '€4,99/Monat — Cooldowns, Notifications, Badge', inline: true },
                    { name: '👑 Pro', value: '€9,99/Monat — Alles + Custom Messages, Bonus Shields', inline: true }
                )
                .setFooter({ text: 'Tritt unserem Server bei und frag nach Premium!' });

            return safeReply(interaction, {
                embeds: [upgradeEmbed],
                components: [
                    {
                        type: 1,
                        components: [
                            {
                                type: 2,
                                label: '💎 Premium kaufen',
                                style: 5,
                                url: 'https://eselbande.com/fahrstuhl/pages/premium-info.php'
                            },
                            {
                                type: 2,
                                label: '💬 Support Server',
                                style: 5,
                                url: 'https://discord.gg/zfzDHKcWDx'
                            }
                        ]
                    }
                ],
                flags: [MessageFlags.Ephemeral]
            });
        }

    // Log usage to premium system
    // await premiumManager.logUsage(interaction.guildId, interaction.commandName);

        const cooldownCommands = new Set([
            "elevator",
            "ghost",
            "mute",
            "mirror",
            "deafen",
            "preset",
        ]);

        if (cooldownCommands.has(interaction.commandName)) {
            const cooldown = rateLimiter.check(interaction.user.id, interaction.commandName, isPremiumUser, isProUser);
            if (!cooldown.ok) {
                const cooldownEmbed = rateLimiter.getCooldownEmbed(cooldown.retryAfter, interaction.commandName, isPremiumUser, isProUser);
                return safeReply(interaction, {
                    embeds: [cooldownEmbed],
                    flags: [MessageFlags.Ephemeral]
                });
            }
        }

        // Log command usage to audit trail
        auditLogger.logCommand(interaction);

        const buildTrollRoleNotSetEmbed = () => new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle("❌ Troll role missing")
            .setDescription("No troll role is set yet.\nPlease use `/settrollrole` (admin-only) to set a role.");

        const buildMissingRoleEmbed = (roleId) => new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle("❌ Missing role")
            .setDescription(`You need the role <@&${roleId}> to use troll commands!`);

        const buildNotFoundEmbed = () => new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle("❌ Error")
            .setDescription("User not found!");

        const buildNoVoiceEmbed = () => new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle("❌ Error")
            .setDescription("User is not in a voice channel!");

        const buildImmuneEmbed = (member, immunity) => new EmbedBuilder()
            .setColor(0x00FFFF)
            .setTitle("🛡️ Shield active!")
            .setDescription(`${member.user.username} is protected by a shield!\nExpires: <t:${Math.floor(immunity.expiry / 1000)}:R>`)
            .setFooter({ text: "Get your own shield on Unique Bots! /claim" });

        const buildAlreadyActiveEmbed = (title, description) => new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle(title)
            .setDescription(description);

        const clearStoredTimeout = (entry) => {
            if (!entry) return;
            if (typeof entry.hasRef === "function") {
                clearTimeout(entry);
                return;
            }
            if (typeof entry === "object") {
                if (entry.loopTimeout) clearTimeout(entry.loopTimeout);
                if (entry.stopTimeout) clearTimeout(entry.stopTimeout);
                return;
            }
            clearTimeout(entry);
        };

        const getTimedTrollDurationMs = () => {
            if (isProUser) return 10 * 60 * 1000;
            if (isPremiumUser) return 5 * 60 * 1000;
            return 60 * 1000;
        };

        const getTimedTrollDurationLabel = () => {
            if (isProUser) return "10 Minuten 👑";
            if (isPremiumUser) return "5 Minuten 💎";
            return "1 Minute";
        };

        const checkTrollRole = () => {
            const config = getGuildConfig(interaction.guild.id);
            const trollRoleId = config.trollRoleId;

            if (!trollRoleId) {
                return { ok: false, embed: buildTrollRoleNotSetEmbed() };
            }

            if (!interaction.member.roles.cache.has(trollRoleId)) {
                return { ok: false, embed: buildMissingRoleEmbed(trollRoleId) };
            }

            return { ok: true, config };
        };

        const runTrollPrecheck = ({ freshMember, requireVoice = false }) => {
            const roleCheck = checkTrollRole();
            if (!roleCheck.ok) {
                return { ok: false, embed: roleCheck.embed };
            }

            if (!freshMember) {
                return { ok: false, embed: buildNotFoundEmbed() };
            }

            if (requireVoice && !freshMember.voice.channel) {
                return { ok: false, embed: buildNoVoiceEmbed() };
            }

            const config = roleCheck.config;
            const userStats = getUserStats(freshMember.id);
            const immunity = isUserImmune(freshMember, config, userStats);

            if (immunity.immune) {
                return { ok: false, embed: buildImmuneEmbed(freshMember, immunity) };
            }

            return { ok: true };
        };

        void logToMaster({
            title: "⌨️ Command Used",
            description: `> \`/${interaction.commandName}\``,
            color: 0x5865F2,
            author: { name: interaction.user.username, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) },
            fields: [
                { name: "User", value: `<@${interaction.user.id}> (\`${interaction.user.id}\`)`, inline: true },
                { name: "Server", value: `${interaction.guild.name} (\`${interaction.guildId}\`)`, inline: true },
                { name: "Channel", value: `<#${interaction.channelId}>`, inline: true }
            ]
        }, "COMMANDS").catch((err) => {
            console.error("Command logging failed:", err);
        });

        // Trigger webhook for command execution
        const webhooksManager = require('../utils/webhooksManager');
        webhooksManager.triggerCommandExecution({
            commandName: interaction.commandName,
            userId: interaction.user.id,
            guildId: interaction.guildId,
            timestamp: new Date().toISOString()
        }).catch(err => {
            console.error("Webhook trigger failed:", err);
        });

        if (globalStop && !["help", "dashboard", "ticket", "globalstop", "claim", "shield", "checkshield", "status", "addshield", "removeshield", "reloadcache", "synccommands", "dbstatus", "testsetupdm"].includes(interaction.commandName)) {
            const globalStopEmbed = new (require("discord.js").EmbedBuilder)()
                .setColor(0xED4245)
                .setTitle("🛑 Global Stop")
                .setDescription("The bot is currently in **Global Stop Mode**. All troll functions are disabled!");
            return safeReply(interaction, { embeds: [globalStopEmbed], flags: [require("discord.js").MessageFlags.Ephemeral] });
        }

        const needsFreshMember = [
            "elevator",
            "ghost",
            "mute",
            "mirror",
            "deafen",
            "preset",
            "presetstop",
            "status"
        ].includes(interaction.commandName);

        const memberOption = needsFreshMember ? interaction.options.getMember("user") : null;
        let freshMember = null;

        if (memberOption) {
            try {
                freshMember = await interaction.guild.members.fetch(memberOption.id);
            } catch (err) {
                console.error("Fetch Member Error:", err);
            }
        }

        if (interaction.commandName === "help") {
            const config = getGuildConfig(interaction.guild.id);
            const roleDisplay = config.roleId ? `<@&${config.roleId}>` : "❌ Not set";
            const trollRoleDisplay = config.trollRoleId ? `<@&${config.trollRoleId}>` : "❌ Not set";

            // Define all embeds
            const embeds = {
                setup: new (require("discord.js").EmbedBuilder)()
                    .setColor(0x5865F2)
                    .setTitle('⚙️ SETUP (Required First!)')
                    .setDescription('Admins must run these commands first:')
                    .addFields(
                        { name: '1️⃣ /settrollrole @role', value: '🔐 Choose who can use troll commands\n*(Admin-only)*' },
                        { name: '2️⃣ /setrole @role', value: '🚀 Members with this role auto-move in voice\n*(Troll role required)*' },
                        { name: '📋 Current Setup', value: `**Troll Role:** ${trollRoleDisplay}\n**Auto-Move Role:** ${roleDisplay}` }
                    ),
                trolls: new (require("discord.js").EmbedBuilder)()
                    .setColor(0xED4245)
                    .setTitle('😈 TROLL COMMANDS')
                    .setDescription('All the fun stuff! (Requires troll role)')
                    .addFields(
                        { name: '🚀 /elevator @user', value: 'Move user randomly for 30 seconds' },
                        { name: '👻 /ghost @user', value: 'Timed haunting: 1m Free, 5m Premium, 10m Pro' },
                        { name: '🔇 /mute @user', value: 'Timed mute chaos: 1m Free, 5m Premium, 10m Pro' },
                        { name: '🪞 /mirror @user', value: 'Timed mirror: 1m Free, 5m Premium, 10m Pro' },
                        { name: '📞 /deafen @user', value: 'Timed deafen: 1m Free, 5m Premium, 10m Pro' },
                        { name: '💥 /preset full @user', value: 'Activate ALL trolls at once!' },
                        { name: '🎲 /preset random @user', value: 'Activate 2-3 random trolls' },
                        { name: '🛑 /presetstop @user', value: 'Stop ALL trolls immediately' },
                        { name: '👑 /settrollmessage [text]', value: 'Set custom message shown on troll start (Pro)' }
                    ),
                shields: new (require("discord.js").EmbedBuilder)()
                    .setColor(0x00FFFF)
                    .setTitle('🛡️ SHIELD SYSTEM (Free Protection!)')
                    .setDescription('Protect yourself from trolling!')
                    .addFields(
                        { name: '📎 /claim', value: '🎁 Get 1 free shield every 2.5 hours\n*(Requires: Unique Bots member)*\n💎 Boosters: +10 bonus shields/month\n👑 Pro: +10 bonus shields/month' },
                        { name: '🛡️ /shield', value: '⏱️ Activate shield for 2 hours immunity' },
                        { name: '📊 /checkshield', value: '📈 Check your shield status & inventory' },
                        { name: '💡 How Shields Work', value: '✅ Active shield = Can\'t be trolled\n✅ Share with friends\n✅ Recharge for free every 2.5h' }
                    ),
                other: new (require("discord.js").EmbedBuilder)()
                    .setColor(0x57F287)
                    .setTitle('📊 OTHER COMMANDS')
                    .addFields(
                        { name: '📊 /status [user]', value: 'Bot/server health and active trolls, optional user details' },
                        { name: '🌐 /dashboard', value: 'Get dashboard and setup links' },
                        { name: '🔁 /synccommands', value: 'Owner-only slash command refresh' },
                        { name: '🔄 /help', value: 'You\'re reading it right now! 😄' },
                        { name: '🌐 Dashboard', value: '[Fahrstuhl Dashboard öffnen](https://eselbande.com/fahrstuhl/) — Stats, Settings & Premium' },
                        { name: '💎 Premium & Pro', value: '[Pläne & Features ansehen](https://eselbande.com/fahrstuhl/pages/premium-info.php)' },
                        { name: '📎 Support Server', value: 'discord.gg/zfzDHKcWDx' }
                    )
            };

            // Create buttons
            const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
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
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setLabel('🌐 Dashboard')
                        .setStyle(ButtonStyle.Link)
                        .setURL('https://eselbande.com/fahrstuhl/')
                );

            return safeReply(interaction, { 
                embeds: [embeds.setup],
                components: [buttons],
                flags: [require("discord.js").MessageFlags.Ephemeral] 
            });
        }

        if (interaction.commandName === "setrole") {
            const roleCheck = checkTrollRole();
            if (!roleCheck.ok) {
                return safeReply(interaction, { embeds: [roleCheck.embed], flags: [require("discord.js").MessageFlags.Ephemeral] });
            }
            const role = interaction.options.getRole("role");
            setGuildConfig(interaction.guild.id, { roleId: role.id });
            await logToMaster({
                title: "⚙️ Config Update",
                description: `Automatic role in **${interaction.guild.name}** set to \`${role.name}\`.`,
                color: 0x5865F2
            }, "SYSTEM");

            const successEmbed = new EmbedBuilder()
                .setColor(COLORS.SUCCESS)
                .setTitle(`${EMOJIS.SUCCESS} Auto-Move Role Set`)
                .setDescription(`Members with <@&${role.id}> will now automatically be moved to voice channels!`)
                .addFields(
                    { name: 'Role', value: `<@&${role.id}>`, inline: true },
                    { name: 'Status', value: '✅ Active', inline: true }
                )
                .setFooter({ text: FOOTERS.CONFIG })
                .setTimestamp();
            return safeReply(interaction, { embeds: [successEmbed], flags: [MessageFlags.Ephemeral] });
        }

        if (interaction.commandName === "settrollrole") {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                const errorEmbed = new EmbedBuilder()
                    .setColor(COLORS.ERROR)
                    .setTitle(`${EMOJIS.ERROR} Admin Permission Required`)
                    .setDescription("Only **Server Administrators** can set the troll role!");
                return safeReply(interaction, { embeds: [errorEmbed], flags: [MessageFlags.Ephemeral] });
            }

            const role = interaction.options.getRole("role");
            setGuildConfig(interaction.guild.id, { trollRoleId: role.id });
            await logToMaster({
                title: "⚙️ Config Update",
                description: `Troll role in **${interaction.guild.name}** set to \`${role.name}\`.`,
                color: 0x5865F2
            }, "SYSTEM");

            const successEmbed = new EmbedBuilder()
                .setColor(COLORS.SUCCESS)
                .setTitle(`${EMOJIS.SUCCESS} Troll Role Configured`)
                .setDescription(`Only users with <@&${role.id}> can now use troll commands!`)
                .addFields(
                    { name: 'Troll Role', value: `<@&${role.id}>`, inline: true },
                    { name: 'Status', value: '✅ Active', inline: true }
                )
                .setFooter({ text: FOOTERS.CONFIG })
                .setTimestamp();
            return safeReply(interaction, { embeds: [successEmbed], flags: [MessageFlags.Ephemeral] });
        }

        if (interaction.commandName === "elevator") {
                // Get all target users
                const user1 = interaction.options.getUser("user");
                const user2 = interaction.options.getUser("user2");
                const user3 = interaction.options.getUser("user3");
                const targetUsers = [user1, user2, user3].filter(u => u !== null);

                // Premium check: only Pro users can use multi-target
                if (targetUsers.length > 1 && !isProUser) {
                    const proOnlyEmbed = new EmbedBuilder()
                        .setColor(0xFF6B9D)
                        .setTitle("💎 Premium Feature")
                        .setDescription(`Multi-target elevator is **👑 Pro only**!\n\nYou're using **${targetUsers.length}** targets, but only have ${isPremiumUser ? "💎 Basic" : "❌ No Premium"}`)
                        .addFields({ name: "Upgrade", value: "[👑 Get Pro](https://eselbande.com/fahrstuhl/pages/premium-info.php) for multi-target & 60s duration" })
                        .setFooter({ text: FOOTERS.TROLL });
                    return safeReply(interaction, { embeds: [proOnlyEmbed], flags: [MessageFlags.Ephemeral] });
                }

                // Check each target
                let failedTargets = [];
                for (const targetUser of targetUsers) {
                    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
                    if (!targetMember || !targetMember.voice.channel) {
                        failedTargets.push(targetUser.username);
                    }
                }

                if (failedTargets.length === targetUsers.length) {
                    const noVoiceEmbed = buildAlreadyActiveEmbed(
                        "🎙️ Not in voice",
                        `None of the targets are in a voice channel.\n**Failed:** ${failedTargets.join(", ")}`
                    );
                    return safeReply(interaction, { embeds: [noVoiceEmbed], flags: [MessageFlags.Ephemeral] });
                }

                // Duration: 60s for Pro, 30s for Basic
                const durationMs = isProUser ? 60000 : 30000;
                const durationSecs = durationMs / 1000;

                const update = await deferWithLoading(
                    interaction,
                    `${EMOJIS.ELEVATOR} Starting Elevator...`,
                    `Initializing elevator for **${targetUsers.map(u => u.username).join(", ")}**...`
                );

                try {
                    const userPrefs = require("../utils/userPrefs");
                    const customMsg = isProUser ? (userPrefs.getCustomTrollMessage(interaction.user.id) || "Get ready for chaos! 🎢") : "Get ready for chaos! 🎢";

                    // Process all targets
                    let results = [];
                    for (const targetUser of targetUsers) {
                        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
                        if (!targetMember || !targetMember.voice.channel) {
                            results.push(`❌ ${targetUser.username}`);
                            continue;
                        }

                        const trollKey = getTrollKey(interaction.guild.id, targetMember.id);
                        if (activeMoves.has(trollKey)) {
                            results.push(`⚠️ ${targetUser.username} (already running)`);
                            continue;
                        }

                        incrementStat("elevator");
                        startAutoMove(targetMember, true, durationMs);
                        results.push(`✅ ${targetUser.username}`);
                    }

                    const startEmbed = new EmbedBuilder()
                        .setColor(COLORS.TROLL)
                        .setTitle(`${EMOJIS.ELEVATOR} Elevator Activated!`)
                        .setDescription(customMsg)
                        .addFields(
                            { name: 'Targets', value: results.join("\n"), inline: false },
                            { name: 'Duration', value: `⏱️ ${durationSecs} seconds ${isProUser ? "👑 (Pro)" : ""}`, inline: true },
                            { name: 'Count', value: `${targetUsers.length} user(s)`, inline: true }
                        )
                        .setThumbnail(user1.displayAvatarURL())
                        .setFooter({ text: FOOTERS.TROLL })
                        .setTimestamp();

                    await update({ embeds: [startEmbed] });
                } catch (e) {
                    const errEmbed = new EmbedBuilder()
                        .setColor(COLORS.ERROR)
                        .setTitle(`${EMOJIS.ERROR} Failed to start elevator`)
                        .setDescription(e.message || 'Unknown error');
                    await update({ embeds: [errEmbed] });
                }
        }

        if (interaction.commandName === "ghost") {
            const precheck = runTrollPrecheck({ freshMember });
            if (!precheck.ok) {
                return safeReply(interaction, { embeds: [precheck.embed], flags: [MessageFlags.Ephemeral] });
            }

            const trollKey = getTrollKey(interaction.guild.id, freshMember.id);
            if (activeGhosts.has(trollKey)) {
                const alreadyEmbed = buildAlreadyActiveEmbed(
                    "👻 Ghost already active",
                    `Ghost is already haunting **${freshMember.user.username}**.\nUse \`/presetstop\` if you want to stop all active trolls for that user.`
                );
                return safeReply(interaction, { embeds: [alreadyEmbed], flags: [MessageFlags.Ephemeral] });
            }

            const durationMs = getTimedTrollDurationMs();
            const durationLabel = getTimedTrollDurationLabel();

            const update = await deferWithLoading(interaction, `${EMOJIS.GHOST} Summoning Ghost...`, `Summoning ghost for **${freshMember.user.username}**...`);

            try {
                const started = await startGhostVisit(freshMember, durationMs);
                if (!started) throw new Error("Ghost could not be started.");
                const ghostDesc = isProUser
                    ? (require("../utils/userPrefs").getCustomTrollMessage(interaction.user.id) || `The ghost will now haunt **${freshMember.user.username}** for **${durationLabel}**! 👻`)
                    : `The ghost will now haunt **${freshMember.user.username}** for **${durationLabel}**! 👻`;
                const ghostEmbed = new EmbedBuilder()
                    .setColor(COLORS.SUCCESS)
                    .setTitle(`${EMOJIS.GHOST} Ghost Activated!`)
                    .setDescription(ghostDesc)
                    .addFields(
                        { name: 'Target', value: freshMember.user.username, inline: true },
                        { name: 'Duration', value: durationLabel, inline: true },
                        { name: 'Status', value: `${EMOJIS.ACTIVE} Haunting`, inline: true }
                    )
                    .setThumbnail(freshMember.user.displayAvatarURL())
                    .setFooter({ text: FOOTERS.TROLL })
                    .setTimestamp();

                notificationManager.sendTrollNotification(
                    freshMember.user,
                    `👻 Ghost (${durationLabel})`,
                    interaction.guild.name
                ).catch(() => {});

                await update({ embeds: [ghostEmbed] });
            } catch (e) {
                const errEmbed = new EmbedBuilder()
                    .setColor(COLORS.ERROR)
                    .setTitle(`${EMOJIS.ERROR} Failed to summon ghost`)
                    .setDescription(e.message || 'Unknown error');
                await update({ embeds: [errEmbed] });
            }
        }

        if (interaction.commandName === "mute") {
            const precheck = runTrollPrecheck({ freshMember });
            if (!precheck.ok) {
                return safeReply(interaction, { embeds: [precheck.embed], flags: [MessageFlags.Ephemeral] });
            }

            const trollKey = getTrollKey(interaction.guild.id, freshMember.id);
            if (activeSilentPost.has(trollKey)) {
                const alreadyEmbed = buildAlreadyActiveEmbed(
                    "🔇 Silent Post already active",
                    `Silent Post is already active for **${freshMember.user.username}**.\nUse \`/presetstop\` if you want to stop all active trolls for that user.`
                );
                return safeReply(interaction, { embeds: [alreadyEmbed], flags: [MessageFlags.Ephemeral] });
            }

            const durationMs = getTimedTrollDurationMs();
            const durationLabel = getTimedTrollDurationLabel();

            const update = await deferWithLoading(interaction, `${EMOJIS.MUTE} Activating Silent Post...`, `Silencing **${freshMember.user.username}**...`);

            try {
                const started = await startSilentPost(freshMember, durationMs);
                if (!started) throw new Error("Silent Post could not be started.");
                const silentDesc = isProUser
                    ? (require("../utils/userPrefs").getCustomTrollMessage(interaction.user.id) || `**${freshMember.user.username}** will now get randomly muted for **${durationLabel}**! 🔇`)
                    : `**${freshMember.user.username}** will now get randomly muted for **${durationLabel}**! 🔇`;
                const silentEmbed = new EmbedBuilder()
                    .setColor(COLORS.SUCCESS)
                    .setTitle(`${EMOJIS.MUTE} Silent Post Activated!`)
                    .setDescription(silentDesc)
                    .addFields(
                        { name: 'Target', value: freshMember.user.username, inline: true },
                        { name: 'Duration', value: durationLabel, inline: true },
                        { name: 'Status', value: `${EMOJIS.ACTIVE} Silencing`, inline: true }
                    )
                    .setThumbnail(freshMember.user.displayAvatarURL())
                    .setFooter({ text: FOOTERS.TROLL })
                    .setTimestamp();

                notificationManager.sendTrollNotification(
                    freshMember.user,
                    `🔇 Silent Post (${durationLabel})`,
                    interaction.guild.name,
                    `1-3 second bursts`
                ).catch(() => {});

                await update({ embeds: [silentEmbed] });
            } catch (e) {
                const errEmbed = new EmbedBuilder()
                    .setColor(COLORS.ERROR)
                    .setTitle(`${EMOJIS.ERROR} Failed to activate silent post`)
                    .setDescription(e.message || 'Unknown error');
                await update({ embeds: [errEmbed] });
            }
        }

        if (interaction.commandName === "mirror") {
            const precheck = runTrollPrecheck({ freshMember });
            if (!precheck.ok) {
                return safeReply(interaction, { embeds: [precheck.embed], flags: [MessageFlags.Ephemeral] });
            }

            const trollKey = getTrollKey(interaction.guild.id, freshMember.id);
            if (activeMirror.has(trollKey)) {
                const alreadyEmbed = buildAlreadyActiveEmbed(
                    "🪞 Mirror already active",
                    `Mirror is already active for **${freshMember.user.username}**.\nUse \`/presetstop\` if you want to stop all active trolls for that user.`
                );
                return safeReply(interaction, { embeds: [alreadyEmbed], flags: [MessageFlags.Ephemeral] });
            }

            const durationMs = getTimedTrollDurationMs();
            const durationLabel = getTimedTrollDurationLabel();

            const update = await deferWithLoading(interaction, `${EMOJIS.MIRROR} Creating Mirror...`, `Copying **${freshMember.user.username}**'s identity...`);

            try {
                const started = await startMirror(freshMember, durationMs);
                if (!started) throw new Error("Mirror could not be started.");
                const mirrorDesc = isProUser
                    ? (require("../utils/userPrefs").getCustomTrollMessage(interaction.user.id) || `The bot is now copying **${freshMember.user.username}**'s identity for **${durationLabel}**! 🪞`)
                    : `The bot is now copying **${freshMember.user.username}**'s identity for **${durationLabel}**! 🪞`;
                const mirrorEmbed = new EmbedBuilder()
                    .setColor(COLORS.SUCCESS)
                    .setTitle(`${EMOJIS.MIRROR} Mirror Activated!`)
                    .setDescription(mirrorDesc)
                    .addFields(
                        { name: 'Target', value: freshMember.user.username, inline: true },
                        { name: 'Duration', value: durationLabel, inline: true },
                        { name: 'Status', value: `${EMOJIS.ACTIVE} Mirroring`, inline: true }
                    )
                    .setThumbnail(freshMember.user.displayAvatarURL())
                    .setFooter({ text: FOOTERS.TROLL })
                    .setTimestamp();

                notificationManager.sendTrollNotification(
                    freshMember.user,
                    `🪞 Mirror (${durationLabel})`,
                    interaction.guild.name
                ).catch(() => {});

                await update({ embeds: [mirrorEmbed] });
            } catch (e) {
                const errEmbed = new EmbedBuilder()
                    .setColor(COLORS.ERROR)
                    .setTitle(`${EMOJIS.ERROR} Failed to create mirror`)
                    .setDescription(e.message || 'Unknown error');
                await update({ embeds: [errEmbed] });
            }
        }

        if (interaction.commandName === "deafen") {
            const precheck = runTrollPrecheck({ freshMember });
            if (!precheck.ok) {
                return safeReply(interaction, { embeds: [precheck.embed], flags: [MessageFlags.Ephemeral] });
            }

            const trollKey = getTrollKey(interaction.guild.id, freshMember.id);
            if (activeDeafTroll.has(trollKey)) {
                const alreadyEmbed = buildAlreadyActiveEmbed(
                    "📞 Tote Leitung already active",
                    `Tote Leitung is already active for **${freshMember.user.username}**.\nUse \`/presetstop\` if you want to stop all active trolls for that user.`
                );
                return safeReply(interaction, { embeds: [alreadyEmbed], flags: [MessageFlags.Ephemeral] });
            }

            const durationMs = getTimedTrollDurationMs();
            const durationLabel = getTimedTrollDurationLabel();

            const update = await deferWithLoading(interaction, `${EMOJIS.DEAFEN} Activating Tote Leitung...`, `Deafening **${freshMember.user.username}**...`);

            try {
                const started = await startDeafTroll(freshMember, durationMs);
                if (!started) throw new Error("Tote Leitung could not be started.");
                const deafDesc = isProUser
                    ? (require("../utils/userPrefs").getCustomTrollMessage(interaction.user.id) || `**${freshMember.user.username}** will now get randomly deafened for **${durationLabel}**! 📞`)
                    : `**${freshMember.user.username}** will now get randomly deafened for **${durationLabel}**! 📞`;
                const deafEmbed = new EmbedBuilder()
                    .setColor(COLORS.SUCCESS)
                    .setTitle(`${EMOJIS.DEAFEN} Tote Leitung Activated!`)
                    .setDescription(deafDesc)
                    .addFields(
                        { name: 'Target', value: freshMember.user.username, inline: true },
                        { name: 'Duration', value: durationLabel, inline: true },
                        { name: 'Status', value: `${EMOJIS.ACTIVE} Deafening`, inline: true }
                    )
                    .setThumbnail(freshMember.user.displayAvatarURL())
                    .setFooter({ text: FOOTERS.TROLL })
                    .setTimestamp();

                notificationManager.sendTrollNotification(
                    freshMember.user,
                    `📞 Tote Leitung (${durationLabel})`,
                    interaction.guild.name,
                    `2-5 second bursts`
                ).catch(() => {});

                await update({ embeds: [deafEmbed] });
            } catch (e) {
                const errEmbed = new EmbedBuilder()
                    .setColor(COLORS.ERROR)
                    .setTitle(`${EMOJIS.ERROR} Failed to activate tote leitung`)
                    .setDescription(e.message || 'Unknown error');
                await update({ embeds: [errEmbed] });
            }
        }

        if (interaction.commandName === "preset") {
            const precheck = runTrollPrecheck({ freshMember, requireVoice: true });
            if (!precheck.ok) {
                return safeReply(interaction, { embeds: [precheck.embed], flags: [MessageFlags.Ephemeral] });
            }

            const presetType = interaction.options.getString("type");
            const update = await deferWithLoading(interaction, `💥 Launching ${presetType === "full" ? "Full" : "Random"} Attack...`, `Activating all troll functions for **${freshMember.user.username}**...`);

            try {
                const userPrefs = require("../utils/userPrefs");
                const customMsg = isProUser ? (userPrefs.getCustomTrollMessage(interaction.user.id) || null) : null;
                const timedDurationMs = getTimedTrollDurationMs();
                const timedDurationLabel = getTimedTrollDurationLabel();

                const presetTrollKey = getTrollKey(interaction.guild.id, freshMember.id);

                if (presetType === "full") {
                    startAutoMove(freshMember, true);
                    if (!activeGhosts.has(presetTrollKey))     startGhostVisit(freshMember, timedDurationMs);
                    if (!activeSilentPost.has(presetTrollKey)) startSilentPost(freshMember, timedDurationMs);
                    if (!activeMirror.has(presetTrollKey))     startMirror(freshMember, timedDurationMs);
                    if (!activeDeafTroll.has(presetTrollKey))  startDeafTroll(freshMember, timedDurationMs);

                    const fullEmbed = new EmbedBuilder()
                        .setColor(COLORS.TROLL)
                        .setTitle("💥 FULL ATTACK - CHAOS MODE")
                        .setDescription(customMsg || `Buckle up! All troll functions activated for **${freshMember.user.username}**! 😈`)
                        .addFields(
                            { name: 'Target', value: freshMember.user.username, inline: true },
                            { name: 'Intensity', value: '🔴 MAXIMUM', inline: true },
                            { name: 'Timed Effects', value: timedDurationLabel, inline: true },
                            { name: 'Active Effects', value: '🚀 Elevator\n👻 Ghost\n🔇 Silent Post\n🪞 Mirror\n📞 Tote Leitung', inline: false }
                        )
                        .setThumbnail(freshMember.user.displayAvatarURL())
                        .setFooter({ text: FOOTERS.TROLL })
                        .setTimestamp();

                    await update({ embeds: [fullEmbed] });
                    incrementStat("preset_full");
                } else if (presetType === "random") {
                    const trolls = [
                        { name: "🚀 Elevator", func: () => startAutoMove(freshMember, true) },
                        { name: "👻 Ghost", func: () => !activeGhosts.has(presetTrollKey) ? startGhostVisit(freshMember, timedDurationMs) : Promise.resolve(false) },
                        { name: "🔇 Silent Post", func: () => !activeSilentPost.has(presetTrollKey) ? startSilentPost(freshMember, timedDurationMs) : Promise.resolve(false) },
                        { name: "🪞 Mirror", func: () => !activeMirror.has(presetTrollKey) ? startMirror(freshMember, timedDurationMs) : Promise.resolve(false) },
                        { name: "📞 Tote Leitung", func: () => !activeDeafTroll.has(presetTrollKey) ? startDeafTroll(freshMember, timedDurationMs) : Promise.resolve(false) }
                    ];

                    const numToActivate = Math.floor(Math.random() * 2) + 2;
                    
                    // Fisher-Yates shuffle for unbiased random selection
                    const shuffled = [...trolls];
                    for (let i = shuffled.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                    }
                    const selected = shuffled.slice(0, numToActivate);

                    let results = [];
                    for (const troll of selected) {
                        try {
                            await troll.func();
                            results.push(`${EMOJIS.SUCCESS} ${troll.name}`);
                        } catch (trollErr) {
                            console.error(`Preset random troll error (${troll.name}):`, trollErr);
                            results.push(`❌ ${troll.name}`);
                        }
                    }

                    const randomEmbed = new EmbedBuilder()
                        .setColor(COLORS.WARNING)
                        .setTitle("🎲 RANDOM ATTACK - CHAOS MODE")
                        .setDescription(customMsg || `Surprise! **${freshMember.user.username}** has been hit with random trolls! 🎭`)
                        .addFields(
                            { name: 'Target', value: freshMember.user.username, inline: true },
                            { name: 'Number of Effects', value: `${selected.length}/5`, inline: true },
                            { name: 'Timed Effects', value: timedDurationLabel, inline: true },
                            { name: 'Active Effects', value: results.join('\n'), inline: false }
                        )
                        .setThumbnail(freshMember.user.displayAvatarURL())
                        .setFooter({ text: FOOTERS.TROLL })
                        .setTimestamp();

                    await update({ embeds: [randomEmbed] });
                    incrementStat("preset_random");
                }
            } catch (e) {
                const errEmbed = new EmbedBuilder()
                    .setColor(COLORS.ERROR)
                    .setTitle(`${EMOJIS.ERROR} Failed to launch attack`)
                    .setDescription(e.message || 'Unknown error');
                await update({ embeds: [errEmbed] });
            }
        }

        if (interaction.commandName === "presetstop") {
            const roleCheck = checkTrollRole();
            if (!roleCheck.ok) {
                return safeReply(interaction, { embeds: [roleCheck.embed], flags: [require("discord.js").MessageFlags.Ephemeral] });
            }

            if (!freshMember) {
                const errorEmbed = new (require("discord.js").EmbedBuilder)()
                    .setColor(0xED4245)
                    .setTitle("❌ Error")
                    .setDescription("User not found!");
                return safeReply(interaction, { embeds: [errorEmbed], flags: [require("discord.js").MessageFlags.Ephemeral] });
            }

            const update = await deferWithLoading(interaction, `🛑 Stopping Trolls...`, `Stopping all active trolls for **${freshMember.user.username}**...`);

            try {
                const trollKey = getTrollKey(interaction.guild.id, freshMember.id);
                if (activeMoves.has(trollKey)) {
                    await stopAutoMove(freshMember.id, interaction.guild.id);
                }

                await cleanupUserOperations(interaction.guild.id, freshMember.id, activeMoves, initialChannels, activeGhosts, activeSilentPost, activeMirror, activeDeafTroll, activeMoveEnds);

                const stopEmbed = new (require("discord.js").EmbedBuilder)()
                    .setColor(COLORS.SUCCESS)
                    .setTitle("🛑 Trolls Stopped")
                    .setDescription(`All active trolls for **${freshMember.user.username}** have been stopped immediately.`)
                    .setThumbnail(freshMember.user.displayAvatarURL())
                    .setFooter({ text: 'Chaos paused.' });

                await update({ embeds: [stopEmbed] });
                incrementStat("presetstop");
            } catch (e) {
                const errEmbed = new EmbedBuilder()
                    .setColor(COLORS.ERROR)
                    .setTitle(`${EMOJIS.ERROR} Failed to stop trolls`)
                    .setDescription(e.message || 'Unknown error');
                await update({ embeds: [errEmbed] });
            }
        }

        if (interaction.commandName === "globalstop") {
            const application = await interaction.client.application.fetch();
            if (interaction.user.id !== application.owner.id && interaction.user.id !== "740958995887685696") {
                const devOnlyEmbed = new (require("discord.js").EmbedBuilder)()
                    .setColor(0xED4245)
                    .setTitle("❌ Dev-Only")
                    .setDescription("This command is reserved for the bot developer only!");
                return safeReply(interaction, { embeds: [devOnlyEmbed], flags: [require("discord.js").MessageFlags.Ephemeral] });
            }

            const newState = !globalStop;
            setGlobalStop(newState);

            const globalEmbed = new (require("discord.js").EmbedBuilder)().setTimestamp();

            if (newState) {
                activeMoves.forEach((interval) => clearInterval(interval));
                activeGhosts.forEach((entry) => clearStoredTimeout(entry));
                activeSilentPost.forEach((entry) => clearStoredTimeout(entry));
                activeDeafTroll.forEach((entry) => clearStoredTimeout(entry));

                activeMoves.clear();
                activeMoveEnds.clear();
                activeGhosts.clear();
                activeSilentPost.clear();
                initialChannels.clear();
                activeDeafTroll.clear();
                await stopAllMirrors({ log: false });

                await logToMaster({
                    title: "🛑 GLOBAL STOP ACTIVATED",
                    description: `By **${interaction.user.username}**\nAll troll functions on all servers have been stopped.`,
                    color: 0xED4245,
                    thumbnail: interaction.user.displayAvatarURL()
                }, "SYSTEM");

                globalEmbed
                    .setColor(0xED4245)
                    .setTitle("🛑 GLOBAL STOP ACTIVATED")
                    .setDescription("All active trolls on all servers have been stopped. New trolls cannot be started for now.");
            } else {
                await logToMaster({
                    title: "🟢 GLOBAL STOP DEACTIVATED",
                    description: `By **${interaction.user.username}**\nTroll functions are available again.`,
                    color: 0x57F287,
                    thumbnail: interaction.user.displayAvatarURL()
                }, "SYSTEM");

                globalEmbed
                    .setColor(0x57F287)
                    .setTitle("🟢 GLOBAL STOP DEACTIVATED")
                    .setDescription("Troll functions are now globally available again.");
            }
            return safeReply(interaction, { embeds: [globalEmbed], flags: [require("discord.js").MessageFlags.Ephemeral] });
        }

        if (interaction.commandName === "claim") {
            const stats = getUserStats(interaction.user.id);
            const now = Date.now();
            const oneDay = 24 * 60 * 60 * 1000;

            const devGuild = client.guilds.cache.get(DEV_GUILD_ID) || await client.guilds.fetch(DEV_GUILD_ID).catch(() => null);
            const memberOnDev = devGuild ? await devGuild.members.fetch(interaction.user.id).catch(() => null) : null;

            if (!memberOnDev) {
                const joinEmbed = new (require("discord.js").EmbedBuilder)()
                    .setColor(0xFEE75C)
                    .setTitle("🛡️ Shield claim denied")
                    .setDescription("You must be a member of **Unique Bots** to get free shields every 2.5 hours!")
                    .addFields({ name: "🔗 Join Unique Bots", value: "[Click here to join](https://discord.gg/zfzDHKcWDx)" })
                    .setFooter({ text: "Join Unique Bots and use /claim again!" });
                return safeReply(interaction, { embeds: [joinEmbed], flags: [require("discord.js").MessageFlags.Ephemeral] });
            }

            const claimCooldownMs = 2.5 * 60 * 60 * 1000;
            const lastClaim = stats.lastDailyClaim || 0;

            if (now - lastClaim < claimCooldownMs) {
                const waitTime = claimCooldownMs - (now - lastClaim);
                let hours = Math.floor(waitTime / (60 * 60 * 1000));
                let mins = Math.floor((waitTime % (60 * 60 * 1000)) / (60 * 1000));

                if (mins === 60) {
                    hours += 1;
                    mins = 0;
                }

                const waitEmbed = new (require("discord.js").EmbedBuilder)()
                    .setColor(0xED4245)
                    .setTitle("⏱️ Wait!")
                    .setDescription(`You have already claimed your free shield.\nCome back in **${hours}h ${mins}m**!`);
                return safeReply(interaction, { embeds: [waitEmbed], flags: [require("discord.js").MessageFlags.Ephemeral] });
            }

            let amount = 1;
            let isBooster = memberOnDev.premiumSinceTimestamp !== null;

            const lastMonthly = stats.lastMonthlyBonus || 0;
            const oneMonth = 30 * oneDay;
            let bonusApplied = false;

            if (isBooster && (now - lastMonthly > oneMonth)) {
                amount += 10;
                bonusApplied = true;
            }

            // Pro monthly bonus (+10 shields once per 30 days)
            const userPrefs = require("../utils/userPrefs");
            const lastPremiumBonus = userPrefs.getLastPremiumMonthlyBonus(interaction.user.id);
            let premiumBonusApplied = false;
            if (isProUser && (now - lastPremiumBonus > oneMonth)) {
                amount += 10;
                premiumBonusApplied = true;
                userPrefs.setLastPremiumMonthlyBonus(interaction.user.id, now);
            }

            setUserStats(interaction.user.id, {
                shieldsOwned: stats.shieldsOwned + amount,
                lastDailyClaim: now,
                ...(bonusApplied ? { lastMonthlyBonus: now } : {})
            });

            let footerText = "Come back in 2.5 hours for more!";
            if (bonusApplied && premiumBonusApplied) footerText = "💎 Includes 10 booster + 10 Pro bonus shields!";
            else if (bonusApplied) footerText = "💎 Includes 10 bonus shields for your server boost!";
            else if (premiumBonusApplied) footerText = "👑 Includes 10 Pro monthly bonus shields!";

            const claimEmbed = new (require("discord.js").EmbedBuilder)()
                .setColor(0x57F287)
                .setTitle("✅ Shield(s) received!")
                .setDescription(`You have received **${amount} shield(s)**.\nYou now have a total of: **${stats.shieldsOwned + amount}**`)
                .setFooter({ text: footerText });

            return safeReply(interaction, { embeds: [claimEmbed], flags: [require("discord.js").MessageFlags.Ephemeral] });
        }

        if (interaction.commandName === "shield") {
            const stats = getUserStats(interaction.user.id);

            if (stats.shieldsOwned <= 0) {
                const noShieldsEmbed = new (require("discord.js").EmbedBuilder)()
                    .setColor(0xED4245)
                    .setTitle("❌ No shields")
                    .setDescription("You have no shields left in your inventory!\nGet new ones with `/claim` on Unique Bots.");
                return safeReply(interaction, { embeds: [noShieldsEmbed], flags: [require("discord.js").MessageFlags.Ephemeral] });
            }

            const now = Date.now();
            const baseTime = stats.activeShieldExpiry && stats.activeShieldExpiry > now ? stats.activeShieldExpiry : now;
            const expiry = baseTime + (2 * 60 * 60 * 1000);
            setUserStats(interaction.user.id, {
                shieldsOwned: stats.shieldsOwned - 1,
                activeShieldExpiry: expiry
            });

            const activeEmbed = new (require("discord.js").EmbedBuilder)()
                .setColor(0x00FFFF)
                .setTitle("🛡️ SHIELD ACTIVATED")
                .setDescription(`Your shield has been **extended by 2 hours**!\nExpires: <t:${Math.floor(expiry / 1000)}:F>`)
                .setFooter({ text: `Remaining shields in inventory: ${stats.shieldsOwned - 1}` });

            return safeReply(interaction, { embeds: [activeEmbed], flags: [require("discord.js").MessageFlags.Ephemeral] });
        }

        if (interaction.commandName === "checkshield") {
            const stats = getUserStats(interaction.user.id);
            const isActive = (stats?.activeShieldExpiry || 0) > Date.now();

            const checkEmbed = new (require("discord.js").EmbedBuilder)()
                .setColor(isActive ? 0x00FFFF : 0x5865F2)
                .setTitle("🛡️ Your Shield Status")
                .addFields(
                    { name: "Inventory", value: `📦 **${stats.shieldsOwned} Shields** available`, inline: true },
                    { name: "Status", value: isActive ? "✅ **ACTIVE**" : "❌ **INACTIVE**", inline: true }
                );

            if (isActive) {
                checkEmbed.addFields({ name: "Expires", value: `<t:${Math.floor(stats.activeShieldExpiry / 1000)}:R> (<t:${Math.floor(stats.activeShieldExpiry / 1000)}:t>)` });
            } else {
                checkEmbed.setDescription("Use `/shield` to activate one of your shields.");
            }

            return safeReply(interaction, { embeds: [checkEmbed], flags: [require("discord.js").MessageFlags.Ephemeral] });
        }

        if (interaction.commandName === "status") {
            const targetUser = interaction.options.getUser("user");
            const guildId = interaction.guild.id;

            if (targetUser) {
                const roleCheck = checkTrollRole();
                if (!roleCheck.ok) {
                    return safeReply(interaction, { embeds: [roleCheck.embed], flags: [require("discord.js").MessageFlags.Ephemeral] });
                }
            }

            const countActiveInGuild = (map) => {
                let count = 0;
                for (const key of map.keys()) {
                    if (key.startsWith(`${guildId}-`)) count++;
                }
                return count;
            };

            if (!targetUser) {
                const totalMoves = countActiveInGuild(activeMoves);
                const totalGhosts = countActiveInGuild(activeGhosts);
                const totalSilent = countActiveInGuild(activeSilentPost);
                const totalMirror = countActiveInGuild(activeMirror);
                const totalDeaf = countActiveInGuild(activeDeafTroll);

                const globalMoves = activeMoves.size;
                const globalGhosts = activeGhosts.size;
                const globalSilent = activeSilentPost.size;
                const globalMirror = activeMirror.size;
                const globalDeaf = activeDeafTroll.size;

                const uptimeSeconds = Math.floor((client.uptime || 0) / 1000);
                const uptimeText = `${Math.floor(uptimeSeconds / 86400)}d ${Math.floor((uptimeSeconds % 86400) / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m`;
                const dashboardUrl = process.env.DASHBOARD_PUBLIC_URL || "https://eselbande.com/fahrstuhl/";

                const summaryEmbed = new (require("discord.js").EmbedBuilder)()
                    .setColor(0x5865F2)
                    .setTitle("📊 Bot & Server Status")
                    .setDescription(`**${interaction.guild.name}**`)
                    .addFields(
                        { name: "🤖 Bot", value: `Online\nPing: **${Math.round(client.ws.ping)}ms**\nUptime: **${uptimeText}**\nVersion: **v${BOT_VERSION}**`, inline: true },
                        { name: "🌐 Network", value: `Servers: **${client.guilds.cache.size}**\nUsers cached: **${client.users.cache.size}**`, inline: true },
                        { name: "🎛️ Dashboard", value: `[Open Dashboard](${dashboardUrl})`, inline: true },

                        { name: "🚀 Elevator", value: `${totalMoves} / ${globalMoves}`, inline: true },
                        { name: "👻 Ghost", value: `${totalGhosts} / ${globalGhosts}`, inline: true },
                        { name: "🔇 Silent Post", value: `${totalSilent} / ${globalSilent}`, inline: true },
                        { name: "🪞 Mirror", value: `${totalMirror} / ${globalMirror}`, inline: true },
                        { name: "📞 Deafen", value: `${totalDeaf} / ${globalDeaf}`, inline: true }
                    )
                    .setFooter({ text: "Troll counts show server / global. Use /status @user for user details." });

                return safeReply(interaction, { embeds: [summaryEmbed], flags: [require("discord.js").MessageFlags.Ephemeral] });
            }

            let freshMember = null;
            try {
                freshMember = await interaction.guild.members.fetch(targetUser.id);
            } catch (err) { }

            if (!freshMember) {
                return safeReply(interaction, { embeds: [buildNotFoundEmbed()], flags: [MessageFlags.Ephemeral] });
            }

            const trollKey = getTrollKey(guildId, freshMember.id);
            const now = Date.now();
            const moveEnd = activeMoveEnds.get(trollKey);
            const moveRemaining = moveEnd && moveEnd > now ? Math.ceil((moveEnd - now) / 1000) : null;
            const moveRemainingText = moveRemaining ? `${Math.floor(moveRemaining / 60)}m ${moveRemaining % 60}s` : null;

            const statuses = [
                { name: "🚀 Elevator", active: activeMoves.has(trollKey), detail: moveRemainingText },
                { name: "👻 Ghost", active: activeGhosts.has(trollKey) },
                { name: "🔇 Silent Post", active: activeSilentPost.has(trollKey) },
                { name: "🪞 Mirror", active: activeMirror.has(trollKey) },
                { name: "📞 Deafen", active: activeDeafTroll.has(trollKey) }
            ];

            const activeList = statuses
                .filter(s => s.active)
                .map(s => `✅ ${s.name}${s.detail ? ` (${s.detail})` : ""}`);
            const inactiveList = statuses.filter(s => !s.active).map(s => `❌ ${s.name}`);

            const stats = getUserStats(freshMember.id);
            const shieldActive = (stats?.activeShieldExpiry || 0) > Date.now();
            const shieldText = shieldActive
                ? `🛡️ Active until <t:${Math.floor(stats.activeShieldExpiry / 1000)}:R>`
                : "🛡️ Inactive";

            const targetIsPremium = await premiumManager.isPremium(freshMember.id).catch(() => false);
            const targetIsPro = targetIsPremium ? await premiumManager.isPro(freshMember.id).catch(() => false) : false;
            const premiumBadge = targetIsPro ? " 👑" : targetIsPremium ? " 💎" : "";

            const userEmbed = new (require("discord.js").EmbedBuilder)()
                .setColor(0x5865F2)
                .setTitle("📊 Status")
                .setDescription(`**User:** ${freshMember.user.username}${premiumBadge}`)
                .addFields(
                    { name: "Active", value: activeList.length ? activeList.join("\n") : "None", inline: false },
                    { name: "Inactive", value: inactiveList.length ? inactiveList.join("\n") : "None", inline: false },
                    { name: "Shields", value: `Inventory: **${stats.shieldsOwned}**\n${shieldText}`, inline: false }
                )
                .setThumbnail(freshMember.user.displayAvatarURL());

            return safeReply(interaction, { embeds: [userEmbed], flags: [require("discord.js").MessageFlags.Ephemeral] });
        }

        if (interaction.commandName === "dashboard") {
            const dashboardUrl = dashboardBaseUrl();
            const serverUrl = dashboardPageUrl("portal");
            const isAdmin = interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);

            const embed = new EmbedBuilder()
                .setColor(0x667eea)
                .setTitle("🌐 Fahrstuhl Dashboard")
                .setDescription("Dashboard öffnen, Server konfigurieren, Stats prüfen und Premium verwalten.")
                .addFields(
                    { name: "Dashboard", value: `[Öffnen](${dashboardUrl})`, inline: true },
                    { name: "Server Setup", value: `[Portal](${serverUrl})`, inline: true },
                    { name: "Zugriff", value: isAdmin ? "Du bist Server-Admin und kannst Server-Einstellungen verwalten." : "Login zeigt dir deine verfügbaren Server und Infos.", inline: false }
                )
                .setTimestamp();

            return safeReply(interaction, { embeds: [embed], flags: [MessageFlags.Ephemeral] });
        }

        if (interaction.commandName === "setup") {
            const config = getGuildConfig(interaction.guildId);
            const modules = config.modules || {};
            const guildId = interaction.guildId;
            const me = interaction.guild.members.me || await interaction.guild.members.fetchMe().catch(() => null);
            const perms = me?.permissions;

            const moduleLine = (key, label, fallback = false) => {
                const enabled = parseBoolean(modules[key], fallback);
                return `${enabled ? "✅" : "⚪"} ${label}`;
            };

            const permissionChecks = [
                ["View Channels", PermissionsBitField.Flags.ViewChannel],
                ["Send Messages", PermissionsBitField.Flags.SendMessages],
                ["Manage Messages", PermissionsBitField.Flags.ManageMessages],
                ["Manage Roles", PermissionsBitField.Flags.ManageRoles],
                ["Manage Channels", PermissionsBitField.Flags.ManageChannels],
                ["Moderate Members", PermissionsBitField.Flags.ModerateMembers],
                ["Move Members", PermissionsBitField.Flags.MoveMembers],
                ["Mute Members", PermissionsBitField.Flags.MuteMembers],
                ["Deafen Members", PermissionsBitField.Flags.DeafenMembers],
            ];
            const missingPerms = permissionChecks
                .filter(([, flag]) => !(perms?.has(flag) ?? false))
                .map(([label]) => `⚠️ ${label}`)
                .slice(0, 6);

            // Build granular next-step hints based on what is missing
            const nextSteps = [];
            if (!config.adminRoleId) nextSteps.push(`⚠️ **Admin-Rolle fehlt** — [Server Setup öffnen](${dashboardPageUrl("serverconfig", { guildId })})`);
            if (!parseBoolean(modules.welcome)) nextSteps.push(`⚪ **Welcome-Modul deaktiviert** — [Jetzt aktivieren](${dashboardPageUrl("modules", { guildId })})`);
            else if (!config.welcome?.channelId && !config.welcome?.welcomeChannelId) nextSteps.push(`⚠️ **Welcome-Channel nicht gesetzt** — [Welcome konfigurieren](${dashboardPageUrl("welcome", { guildId })})`);
            if (!parseBoolean(modules.logging)) nextSteps.push(`⚪ **Logging-Modul deaktiviert** — [Jetzt aktivieren](${dashboardPageUrl("modules", { guildId })})`);
            else if (!config.logging?.channelId) nextSteps.push(`⚠️ **Log-Channel nicht gesetzt** — [Logging konfigurieren](${dashboardPageUrl("logging", { guildId })})`);
            if (!parseBoolean(modules.tickets)) nextSteps.push(`⚪ **Ticket-Modul deaktiviert** — [Jetzt aktivieren](${dashboardPageUrl("modules", { guildId })})`);
            else if (!config.tickets?.staffRoleId) nextSteps.push(`⚠️ **Ticket-Staff-Rolle fehlt** — [Tickets konfigurieren](${dashboardPageUrl("tickets", { guildId })})`);
            else if (!config.tickets?.panelMessageId) nextSteps.push(`⚪ **Ticket-Panel noch nicht gepostet** — [Panel senden](${dashboardPageUrl("tickets", { guildId })})`);
            if (missingPerms.length) nextSteps.push(`🔒 **Bot fehlen Berechtigungen** — Gib dem Bot Administrator-Rechte oder füge die fehlenden Berechtigungen manuell hinzu.`);

            const setupItems = [
                config.adminRoleId ? "✅ Dashboard Admin-Rolle gesetzt" : "⚠️ Dashboard Admin-Rolle fehlt",
                config.trollRoleId ? "✅ Troll-Rolle gesetzt" : "⚪ Troll-Rolle (optional)",
                config.roleId ? "✅ Auto-Move Rolle gesetzt" : "⚪ Auto-Move Rolle (optional)",
                (config.welcome?.welcomeChannelId || config.welcome?.channelId) ? "✅ Welcome-Channel gesetzt" : "⚪ Welcome-Channel fehlt",
                config.tickets?.staffRoleId ? "✅ Ticket Staff-Rolle gesetzt" : "⚪ Ticket Staff-Rolle fehlt",
                config.tickets?.panelMessageId ? "✅ Ticket-Panel aktiv" : "⚪ Ticket-Panel nicht gepostet",
            ];

            const overallOk = missingPerms.length === 0 && nextSteps.filter(s => s.startsWith("⚠️")).length === 0;

            const embed = new EmbedBuilder()
                .setColor(missingPerms.length ? 0xFF6B6B : overallOk ? 0x51cf66 : 0xFEE75C)
                .setTitle(`${overallOk ? "✅" : "🧙"} Fahrstuhl Setup: ${interaction.guild.name}`)
                .setDescription(overallOk
                    ? "Dein Server ist vollständig eingerichtet! 🎉"
                    : "Hier sind die noch offenen Punkte für deinen Server.")
                .addFields(
                    {
                        name: "Module",
                        value: [
                            moduleLine("moderation", "Moderation", true),
                            moduleLine("automod", "AutoMod"),
                            moduleLine("leveling", "Leveling"),
                            moduleLine("welcome", "Welcome"),
                            moduleLine("reactionRoles", "Reaction Roles"),
                            moduleLine("tickets", "Tickets"),
                            moduleLine("logging", "Logging"),
                            moduleLine("fun", "Fun", true),
                        ].join("\n"),
                        inline: true,
                    },
                    {
                        name: "Konfiguration",
                        value: setupItems.join("\n"),
                        inline: true,
                    },
                    {
                        name: "Fehlende Berechtigungen",
                        value: missingPerms.length ? missingPerms.join("\n") : "✅ Alles OK",
                        inline: false,
                    },
                    ...(nextSteps.length ? [{
                        name: `Nächste Schritte (${nextSteps.length})`,
                        value: nextSteps.slice(0, 6).join("\n"),
                        inline: false,
                    }] : []),
                    {
                        name: "Dashboard",
                        value: [
                            `[📊 Portal](${dashboardPageUrl("portal", { guildId })})`,
                            `[🧩 Module](${dashboardPageUrl("modules", { guildId })})`,
                            `[⚙️ Server Setup](${dashboardPageUrl("serverconfig", { guildId })})`,
                        ].join(" • "),
                        inline: false,
                    }
                )
                .setFooter({ text: "Tipp: /serverinfo zeigt Server-Statistiken. /help zeigt User-Befehle." })
                .setTimestamp();

            return safeReply(interaction, { embeds: [embed], flags: [MessageFlags.Ephemeral] });
        }

        if (interaction.commandName === "serverinfo") {
            const config = getGuildConfig(interaction.guildId);
            const modules = config.modules || {};
            const me = interaction.guild.members.me || await interaction.guild.members.fetchMe().catch(() => null);
            const perms = me?.permissions;
            const moduleLine = (key, label, fallback = false) => {
                const enabled = parseBoolean(modules[key], fallback);
                return `${enabled ? "✅" : "⚪"} ${label}`;
            };
            const counts = {
                text: interaction.guild.channels.cache.filter(channel => channel.type === 0).size,
                voice: interaction.guild.channels.cache.filter(channel => channel.type === 2).size,
                roles: Math.max(0, interaction.guild.roles.cache.size - 1),
            };
            const keyPerms = [
                perms?.has(PermissionsBitField.Flags.ManageMessages) ? "✅ Manage Messages" : "⚠️ Manage Messages",
                perms?.has(PermissionsBitField.Flags.ManageChannels) ? "✅ Manage Channels" : "⚠️ Manage Channels",
                perms?.has(PermissionsBitField.Flags.ModerateMembers) ? "✅ Moderate Members" : "⚠️ Moderate Members",
                perms?.has(PermissionsBitField.Flags.ManageRoles) ? "✅ Manage Roles" : "⚠️ Manage Roles",
            ];
            const embed = new EmbedBuilder()
                .setColor(0x667eea)
                .setTitle(`🏰 ${interaction.guild.name}`)
                .setThumbnail(interaction.guild.iconURL({ size: 128 }))
                .addFields(
                    { name: "Members", value: String(interaction.guild.memberCount || 0), inline: true },
                    { name: "Channels", value: `${counts.text} text\n${counts.voice} voice`, inline: true },
                    { name: "Roles", value: String(counts.roles), inline: true },
                    {
                        name: "Modules",
                        value: [
                            moduleLine("moderation", "Moderation", true),
                            moduleLine("automod", "AutoMod"),
                            moduleLine("leveling", "Leveling"),
                            moduleLine("welcome", "Welcome"),
                            moduleLine("reactionRoles", "Reaction Roles"),
                            moduleLine("tickets", "Tickets"),
                            moduleLine("logging", "Logging"),
                            moduleLine("tempVoice", "Temp Voice"),
                            moduleLine("social", "Social Alerts"),
                        ].join("\n"),
                        inline: true,
                    },
                    { name: "Bot Permissions", value: keyPerms.join("\n"), inline: true },
                    {
                        name: "Dashboard",
                        value: `[Open](${dashboardPageUrl("portal")})`,
                        inline: false,
                    }
                )
                .setFooter({ text: `Server ID: ${interaction.guildId}` })
                .setTimestamp();
            return safeReply(interaction, { embeds: [embed], flags: [MessageFlags.Ephemeral] });
        }

        if (interaction.commandName === "rank") {
            const config = getGuildConfig(interaction.guildId);
            const enabled = parseBoolean(config.modules?.leveling, false);
            if (!enabled) {
                return safeReply(interaction, {
                    content: "📈 Leveling is disabled on this server. Enable it in the Fahrstuhl Dashboard under Modules.",
                    flags: [MessageFlags.Ephemeral]
                });
            }

            const targetUser = interaction.options.getUser("user") || interaction.user;
            const leveling = require("../utils/levelingManager");
            const settings = leveling.getLevelSettings(config);
            const rank = await leveling.getUserLevel(interaction.guildId, targetUser.id);
            const progress = rank.nextLevelXp > 0 ? Math.round((rank.currentXp / rank.nextLevelXp) * 100) : 0;
            const cooldownSeconds = Math.max(0, Math.round(settings.cooldownMs / 1000));
            const embed = new EmbedBuilder()
                .setColor(0x667eea)
                .setTitle(`📈 Rank: ${targetUser.username}`)
                .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
                .addFields(
                    { name: "Level", value: `**${rank.level}**`, inline: true },
                    { name: "XP", value: `**${rank.xp}** total`, inline: true },
                    { name: "Rank", value: rank.rank ? `#${rank.rank}` : "Not ranked yet", inline: true },
                    { name: "Progress", value: `${rank.currentXp}/${rank.nextLevelXp} XP (${progress}%)`, inline: false },
                    { name: "Messages", value: String(rank.messageCount || 0), inline: true }
                )
                .setFooter({ text: cooldownSeconds > 0 ? `XP counts once every ${cooldownSeconds}s per user.` : "Every message earns XP while Leveling is enabled." });
            return safeReply(interaction, { embeds: [embed] });
        }

        if (interaction.commandName === "leaderboard") {
            const config = getGuildConfig(interaction.guildId);
            const enabled = parseBoolean(config.modules?.leveling, false);
            if (!enabled) {
                return safeReply(interaction, {
                    content: "📈 Leveling is disabled on this server. Enable it in the Fahrstuhl Dashboard under Modules.",
                    flags: [MessageFlags.Ephemeral]
                });
            }

            const leveling = require("../utils/levelingManager");
            const page = Math.max(1, interaction.options.getInteger("page") || 1);
            const pageSize = 10;
            const total = await leveling.getLeaderboardTotal(interaction.guildId);
            const totalPages = Math.max(1, Math.ceil(total / pageSize));
            const safePage = Math.min(page, totalPages);
            const offset = (safePage - 1) * pageSize;
            const rows = await leveling.getLeaderboard(interaction.guildId, pageSize, offset);
            const lines = await Promise.all(rows.map(async (row) => {
                const member = await interaction.guild.members.fetch(row.userId).catch(() => null);
                const name = member?.displayName || `<@${row.userId}>`;
                return `**#${row.rank}** ${name} — Level **${row.level}**, ${row.xp} XP`;
            }));
            const embed = new EmbedBuilder()
                .setColor(0x51cf66)
                .setTitle(`🏆 ${interaction.guild.name} Leaderboard`)
                .setDescription(lines.length ? lines.join("\n") : "No XP has been tracked yet.")
                .setFooter({ text: `Page ${safePage}/${totalPages} · ${total} tracked users` });
            return safeReply(interaction, { embeds: [embed] });
        }

        if (interaction.commandName === "leveling") {
            const config = getGuildConfig(interaction.guildId);
            const enabled = parseBoolean(config.modules?.leveling, false);
            if (!enabled) {
                return safeReply(interaction, {
                    content: "📈 Leveling is disabled on this server. Enable it in the Fahrstuhl Dashboard under Modules.",
                    flags: [MessageFlags.Ephemeral]
                });
            }

            const hasManageGuild = interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)
                || interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);
            if (!hasManageGuild) {
                return safeReply(interaction, {
                    content: "📈 You need **Manage Server** permission to manage leveling data.",
                    flags: [MessageFlags.Ephemeral]
                });
            }

            const leveling = require("../utils/levelingManager");
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === "resetuser") {
                const targetUser = interaction.options.getUser("user");
                const affected = await leveling.resetUserXp(interaction.guildId, targetUser.id);
                const embed = new EmbedBuilder()
                    .setColor(0xFEE75C)
                    .setTitle("📈 XP Reset")
                    .setDescription(affected > 0
                        ? `XP and level data for **${targetUser.username}** has been reset.`
                        : `**${targetUser.username}** had no XP data on this server.`)
                    .setTimestamp();
                return safeReply(interaction, { embeds: [embed], flags: [MessageFlags.Ephemeral] });
            }

            if (subcommand === "resetserver") {
                const affected = await leveling.resetGuildXp(interaction.guildId);
                const embed = new EmbedBuilder()
                    .setColor(0xED4245)
                    .setTitle("📈 Server XP Reset")
                    .setDescription(`All leveling data for **${interaction.guild.name}** has been wiped.\n${affected} records deleted.`)
                    .setTimestamp();
                return safeReply(interaction, { embeds: [embed], flags: [MessageFlags.Ephemeral] });
            }
        }

        if (interaction.commandName === "ticket") {
            const config = getGuildConfig(interaction.guildId);
            const enabled = parseBoolean(config.modules?.tickets, false);
            if (!enabled) {
                return safeReply(interaction, {
                    content: "🎫 Tickets are disabled on this server. Enable them in the Fahrstuhl Dashboard under Modules.",
                    flags: [MessageFlags.Ephemeral]
                });
            }

            const settings = config.tickets || {};
            const subcommand = interaction.options.getSubcommand();
            if (subcommand === "open") {
                const reason = interaction.options.getString("reason") || "No reason provided";
                const priority = interaction.options.getString("priority") || settings.defaultPriority || "normal";
                return ticketManager.openTicket(interaction, config, {
                    reason,
                    priority,
                    typeLabel: interaction.options.getString("type") || "Support",
                });
            }

            if (subcommand === "close") {
                const reason = interaction.options.getString("reason") || "";
                return ticketManager.closeTicket(interaction, config, { reason });
            }

            if (subcommand === "note") {
                const note = interaction.options.getString("text");
                return ticketManager.addTicketNote(interaction, config, note);
            }

            if (subcommand === "adduser") {
                const user = interaction.options.getUser("user");
                return ticketManager.addTicketUser(interaction, config, user);
            }

            if (subcommand === "removeuser") {
                const user = interaction.options.getUser("user");
                return ticketManager.removeTicketUser(interaction, config, user);
            }

            if (subcommand === "claim") {
                return ticketManager.claimTicket(interaction, config);
            }

            if (subcommand === "unclaim") {
                return ticketManager.unclaimTicket(interaction, config);
            }
        }

        if (interaction.commandName === "mod") {
            const config = getGuildConfig(interaction.guildId);
            const enabled = parseBoolean(config.modules?.moderation, true);
            if (!enabled) {
                return safeReply(interaction, {
                    content: "🛡️ Moderation is disabled on this server. Enable it in the Fahrstuhl Dashboard under Modules.",
                    flags: [MessageFlags.Ephemeral]
                });
            }

            const hasConfiguredAdminRole = config.adminRoleId && interaction.member.roles.cache.has(config.adminRoleId);
            const hasDiscordModPerms = interaction.memberPermissions?.has(PermissionsBitField.Flags.ModerateMembers)
                || interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages)
                || interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);
            if (!hasConfiguredAdminRole && !hasDiscordModPerms) {
                return safeReply(interaction, {
                    content: "🛡️ You need Discord moderation permissions or the configured Dashboard Admin role.",
                    flags: [MessageFlags.Ephemeral]
                });
            }

            const { getPool } = require("../utils/db");
            const createCase = async ({ userId, type, reason, durationMs = null, expiresAt = null, status = "active" }) => {
                const now = Date.now();
                const pool = getPool();
                const [result] = await pool.query(
                    `
                    INSERT INTO moderation_cases
                        (guild_id, user_id, moderator_id, type, reason, duration_ms, expires_at, status, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `,
                    [interaction.guildId, userId, interaction.user.id, type, reason, durationMs, expiresAt, status, now, now]
                );
                return Number(result.insertId || 0);
            };

            const subcommand = interaction.options.getSubcommand();
            const targetUser = interaction.options.getUser("user");
            const targetMember = targetUser
                ? await interaction.guild.members.fetch(targetUser.id).catch(() => null)
                : null;

            if (subcommand === "history") {
                const pool = getPool();
                const [rows] = await pool.query(
                    `
                    SELECT id, type, reason, status, duration_ms, expires_at, created_at
                    FROM moderation_cases
                    WHERE guild_id = ? AND user_id = ?
                    ORDER BY created_at DESC
                    LIMIT 8
                    `,
                    [interaction.guildId, targetUser.id]
                );
                const lines = rows.map(row => {
                    const created = row.created_at ? `<t:${Math.floor(Number(row.created_at) / 1000)}:R>` : "unknown";
                    const reason = String(row.reason || "No reason").slice(0, 90);
                    return `#${row.id} **${row.type}** (${row.status}) ${created}\n${reason}`;
                });
                const embed = new EmbedBuilder()
                    .setColor(0x667eea)
                    .setTitle(`🛡️ Mod history: ${targetUser.username}`)
                    .setDescription(lines.length ? lines.join("\n\n") : "No moderation cases found.")
                    .setThumbnail(targetUser.displayAvatarURL({ size: 128 }));
                return safeReply(interaction, { embeds: [embed], flags: [MessageFlags.Ephemeral] });
            }

            if (subcommand === "cases") {
                const pool = getPool();
                const typeArg = interaction.options.getString("type") || null;
                const page = Math.max(1, interaction.options.getInteger("page") || 1);
                const pageSize = 8;

                const params = [interaction.guildId];
                let where = "guild_id = ?";
                if (typeArg) { where += " AND type = ?"; params.push(typeArg); }

                const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM moderation_cases WHERE ${where}`, params);
                const totalCount = Number(total) || 0;
                const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
                const safePage = Math.min(page, totalPages);
                const queryParams = [...params, pageSize, (safePage - 1) * pageSize];
                const [rows] = await pool.query(
                    `SELECT id, user_id, moderator_id, type, reason, status, created_at
                     FROM moderation_cases WHERE ${where}
                     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
                    queryParams
                );

                const lines = rows.map(row => {
                    const created = row.created_at ? `<t:${Math.floor(Number(row.created_at) / 1000)}:d>` : "unknown";
                    const reason = String(row.reason || "No reason").slice(0, 70);
                    return `#${row.id} **${row.type}** <@${row.user_id}> ${created}\n└ ${reason}`;
                });

                const embed = new EmbedBuilder()
                    .setColor(0x667eea)
                    .setTitle(`🛡️ Cases – ${interaction.guild.name}${typeArg ? ` (${typeArg})` : ""}`)
                    .setDescription(lines.length ? lines.join("\n\n") : "No cases found.")
                    .setFooter({ text: `Page ${safePage}/${totalPages} · ${totalCount} total · Use /mod cases page:<number>` });
                return safeReply(interaction, { embeds: [embed], flags: [MessageFlags.Ephemeral] });
            }

            if (!targetMember) {
                return safeReply(interaction, {
                    content: "🛡️ I could not find that member on this server.",
                    flags: [MessageFlags.Ephemeral]
                });
            }

            if (targetMember.id === interaction.user.id || targetMember.id === interaction.client.user.id) {
                return safeReply(interaction, {
                    content: "🛡️ That target is not valid for this moderation action.",
                    flags: [MessageFlags.Ephemeral]
                });
            }

            if (subcommand === "warn") {
                const reason = interaction.options.getString("reason") || "No reason provided";
                const caseId = await createCase({
                    userId: targetMember.id,
                    type: "warn",
                    reason,
                });
                const embed = new EmbedBuilder()
                    .setColor(0xFEE75C)
                    .setTitle("🛡️ Warning recorded")
                    .addFields(
                        { name: "Member", value: `<@${targetMember.id}>`, inline: true },
                        { name: "Case", value: `#${caseId}`, inline: true },
                        { name: "Reason", value: reason, inline: false }
                    )
                    .setTimestamp();
                targetMember.send(`You were warned in **${interaction.guild.name}**: ${reason}`).catch(() => {});
                sendServerLog(interaction.guild, config, "moderation", {
                    title: "Warning Recorded",
                    description: `${interaction.user} warned ${targetMember.user}.`,
                    color: 0xFEE75C,
                    fields: [
                        { name: "Member", value: `${targetMember.user.username}\n\`${targetMember.id}\``, inline: true },
                        { name: "Moderator", value: `${interaction.user.username}\n\`${interaction.user.id}\``, inline: true },
                        { name: "Case", value: `#${caseId}`, inline: true },
                        { name: "Reason", value: reason, inline: false },
                    ],
                }).catch(() => {});
                return safeReply(interaction, { embeds: [embed] });
            }

            if (subcommand === "timeout") {
                if (!hasConfiguredAdminRole && !interaction.memberPermissions?.has(PermissionsBitField.Flags.ModerateMembers)) {
                    return safeReply(interaction, {
                        content: "🛡️ You need **Moderate Members** permission for /mod timeout.",
                        flags: [MessageFlags.Ephemeral]
                    });
                }
                const minutes = interaction.options.getInteger("minutes");
                const reason = interaction.options.getString("reason") || "No reason provided";
                const durationMs = minutes * 60 * 1000;
                const expiresAt = Date.now() + durationMs;
                const me = interaction.guild.members.me || await interaction.guild.members.fetchMe().catch(() => null);
                if (!me?.permissions?.has(PermissionsBitField.Flags.ModerateMembers)) {
                    return safeReply(interaction, {
                        content: "🛡️ I need **Moderate Members** to timeout members.",
                        flags: [MessageFlags.Ephemeral]
                    });
                }
                if (!targetMember.moderatable) {
                    return safeReply(interaction, {
                        content: "🛡️ I cannot timeout this member. Check role hierarchy and permissions.",
                        flags: [MessageFlags.Ephemeral]
                    });
                }

                await targetMember.timeout(durationMs, `${reason} | by ${interaction.user.username}`);
                const caseId = await createCase({
                    userId: targetMember.id,
                    type: "timeout",
                    reason,
                    durationMs,
                    expiresAt,
                });
                const embed = new EmbedBuilder()
                    .setColor(0xED4245)
                    .setTitle("🛡️ Member timed out")
                    .addFields(
                        { name: "Member", value: `<@${targetMember.id}>`, inline: true },
                        { name: "Duration", value: `${minutes} minute(s)`, inline: true },
                        { name: "Case", value: `#${caseId}`, inline: true },
                        { name: "Reason", value: reason, inline: false }
                    )
                    .setTimestamp();
                sendServerLog(interaction.guild, config, "moderation", {
                    title: "Member Timed Out",
                    description: `${interaction.user} timed out ${targetMember.user}.`,
                    color: 0xED4245,
                    fields: [
                        { name: "Member", value: `${targetMember.user.username}\n\`${targetMember.id}\``, inline: true },
                        { name: "Moderator", value: `${interaction.user.username}\n\`${interaction.user.id}\``, inline: true },
                        { name: "Duration", value: `${minutes} minute(s)`, inline: true },
                        { name: "Case", value: `#${caseId}`, inline: true },
                        { name: "Reason", value: reason, inline: false },
                    ],
                }).catch(() => {});
                return safeReply(interaction, { embeds: [embed] });
            }

            if (subcommand === "untimeout") {
                if (!hasConfiguredAdminRole && !interaction.memberPermissions?.has(PermissionsBitField.Flags.ModerateMembers)) {
                    return safeReply(interaction, {
                        content: "🛡️ You need **Moderate Members** permission for /mod untimeout.",
                        flags: [MessageFlags.Ephemeral]
                    });
                }
                const reason = interaction.options.getString("reason") || "Timeout cleared";
                const me = interaction.guild.members.me || await interaction.guild.members.fetchMe().catch(() => null);
                if (!me?.permissions?.has(PermissionsBitField.Flags.ModerateMembers)) {
                    return safeReply(interaction, {
                        content: "🛡️ I need **Moderate Members** to remove timeouts.",
                        flags: [MessageFlags.Ephemeral]
                    });
                }
                if (!targetMember.moderatable) {
                    return safeReply(interaction, {
                        content: "🛡️ I cannot edit this member. Check role hierarchy and permissions.",
                        flags: [MessageFlags.Ephemeral]
                    });
                }

                await targetMember.timeout(null, `${reason} | by ${interaction.user.username}`);
                const pool = getPool();
                const now = Date.now();
                await pool.query(
                    `
                    UPDATE moderation_cases
                    SET status = 'resolved', updated_at = ?
                    WHERE guild_id = ? AND user_id = ? AND type = 'timeout' AND status = 'active'
                    `,
                    [now, interaction.guildId, targetMember.id]
                );
                const caseId = await createCase({
                    userId: targetMember.id,
                    type: "untimeout",
                    reason,
                    status: "resolved",
                });
                const embed = new EmbedBuilder()
                    .setColor(0x51cf66)
                    .setTitle("🛡️ Timeout removed")
                    .addFields(
                        { name: "Member", value: `<@${targetMember.id}>`, inline: true },
                        { name: "Case", value: `#${caseId}`, inline: true },
                        { name: "Reason", value: reason, inline: false }
                    )
                    .setTimestamp();
                sendServerLog(interaction.guild, config, "moderation", {
                    title: "Timeout Removed",
                    description: `${interaction.user} removed timeout from ${targetMember.user}.`,
                    color: 0x51cf66,
                    fields: [
                        { name: "Member", value: `${targetMember.user.username}\n\`${targetMember.id}\``, inline: true },
                        { name: "Moderator", value: `${interaction.user.username}\n\`${interaction.user.id}\``, inline: true },
                        { name: "Case", value: `#${caseId}`, inline: true },
                        { name: "Reason", value: reason, inline: false },
                    ],
                }).catch(() => {});
                return safeReply(interaction, { embeds: [embed] });
            }

            if (subcommand === "ban") {
                if (!hasConfiguredAdminRole && !interaction.memberPermissions?.has(PermissionsBitField.Flags.BanMembers)) {
                    return safeReply(interaction, {
                        content: "🛡️ You need **Ban Members** permission for /mod ban.",
                        flags: [MessageFlags.Ephemeral]
                    });
                }
                const reason = interaction.options.getString("reason") || "No reason provided";
                const deleteHours = interaction.options.getInteger("delete_messages") || 0;
                const me = interaction.guild.members.me || await interaction.guild.members.fetchMe().catch(() => null);
                if (!me?.permissions?.has(PermissionsBitField.Flags.BanMembers)) {
                    return safeReply(interaction, {
                        content: "🛡️ I need **Ban Members** permission.",
                        flags: [MessageFlags.Ephemeral]
                    });
                }
                if (!targetMember.bannable) {
                    return safeReply(interaction, {
                        content: "🛡️ I cannot ban this member. Check role hierarchy and permissions.",
                        flags: [MessageFlags.Ephemeral]
                    });
                }

                await targetMember.send(`You were banned from **${interaction.guild.name}**: ${reason}`).catch(() => {});
                await targetMember.ban({ reason: `${reason} | by ${interaction.user.username}`, deleteMessageSeconds: deleteHours * 3600 });
                const caseId = await createCase({
                    userId: targetMember.id,
                    type: "ban",
                    reason,
                });
                const embed = new EmbedBuilder()
                    .setColor(0xED4245)
                    .setTitle("🛡️ Member banned")
                    .addFields(
                        { name: "Member", value: `${targetUser.username}\n\`${targetUser.id}\``, inline: true },
                        { name: "Case", value: `#${caseId}`, inline: true },
                        { name: "Reason", value: reason, inline: false }
                    )
                    .setTimestamp();
                sendServerLog(interaction.guild, config, "moderation", {
                    title: "Member Banned",
                    description: `${interaction.user} banned ${targetUser.username}.`,
                    color: 0xED4245,
                    fields: [
                        { name: "Member", value: `${targetUser.username}\n\`${targetUser.id}\``, inline: true },
                        { name: "Moderator", value: `${interaction.user.username}\n\`${interaction.user.id}\``, inline: true },
                        { name: "Case", value: `#${caseId}`, inline: true },
                        { name: "Reason", value: reason, inline: false },
                    ],
                }).catch(() => {});
                return safeReply(interaction, { embeds: [embed] });
            }

            if (subcommand === "kick") {
                if (!hasConfiguredAdminRole && !interaction.memberPermissions?.has(PermissionsBitField.Flags.KickMembers)) {
                    return safeReply(interaction, {
                        content: "🛡️ You need **Kick Members** permission for /mod kick.",
                        flags: [MessageFlags.Ephemeral]
                    });
                }
                const reason = interaction.options.getString("reason") || "No reason provided";
                const me = interaction.guild.members.me || await interaction.guild.members.fetchMe().catch(() => null);
                if (!me?.permissions?.has(PermissionsBitField.Flags.KickMembers)) {
                    return safeReply(interaction, {
                        content: "🛡️ I need **Kick Members** permission.",
                        flags: [MessageFlags.Ephemeral]
                    });
                }
                if (!targetMember.kickable) {
                    return safeReply(interaction, {
                        content: "🛡️ I cannot kick this member. Check role hierarchy and permissions.",
                        flags: [MessageFlags.Ephemeral]
                    });
                }

                await targetMember.send(`You were kicked from **${interaction.guild.name}**: ${reason}`).catch(() => {});
                await targetMember.kick(`${reason} | by ${interaction.user.username}`);
                const caseId = await createCase({
                    userId: targetMember.id,
                    type: "kick",
                    reason,
                });
                const embed = new EmbedBuilder()
                    .setColor(0xE67E22)
                    .setTitle("🛡️ Member kicked")
                    .addFields(
                        { name: "Member", value: `${targetUser.username}\n\`${targetUser.id}\``, inline: true },
                        { name: "Case", value: `#${caseId}`, inline: true },
                        { name: "Reason", value: reason, inline: false }
                    )
                    .setTimestamp();
                sendServerLog(interaction.guild, config, "moderation", {
                    title: "Member Kicked",
                    description: `${interaction.user} kicked ${targetUser.username}.`,
                    color: 0xE67E22,
                    fields: [
                        { name: "Member", value: `${targetUser.username}\n\`${targetUser.id}\``, inline: true },
                        { name: "Moderator", value: `${interaction.user.username}\n\`${interaction.user.id}\``, inline: true },
                        { name: "Case", value: `#${caseId}`, inline: true },
                        { name: "Reason", value: reason, inline: false },
                    ],
                }).catch(() => {});
                return safeReply(interaction, { embeds: [embed] });
            }

            if (subcommand === "unban") {
                if (!hasConfiguredAdminRole && !interaction.memberPermissions?.has(PermissionsBitField.Flags.BanMembers)) {
                    return safeReply(interaction, {
                        content: "🛡️ You need **Ban Members** permission for /mod unban.",
                        flags: [MessageFlags.Ephemeral]
                    });
                }
                const rawId = interaction.options.getString("userid").trim();
                const reason = interaction.options.getString("reason") || "No reason provided";
                const me = interaction.guild.members.me || await interaction.guild.members.fetchMe().catch(() => null);
                if (!me?.permissions?.has(PermissionsBitField.Flags.BanMembers)) {
                    return safeReply(interaction, {
                        content: "🛡️ I need **Ban Members** permission to unban users.",
                        flags: [MessageFlags.Ephemeral]
                    });
                }
                if (!/^\d{17,20}$/.test(rawId)) {
                    return safeReply(interaction, {
                        content: "🛡️ Please provide a valid Discord user ID (17-20 digits).",
                        flags: [MessageFlags.Ephemeral]
                    });
                }

                const ban = await interaction.guild.bans.fetch(rawId).catch(() => null);
                if (!ban) {
                    return safeReply(interaction, {
                        content: `🛡️ User \`${rawId}\` is not currently banned on this server.`,
                        flags: [MessageFlags.Ephemeral]
                    });
                }

                await interaction.guild.members.unban(rawId, `${reason} | by ${interaction.user.username}`);
                const pool = getPool();
                const now = Date.now();
                await pool.query(
                    `
                    UPDATE moderation_cases
                    SET status = 'resolved', updated_at = ?
                    WHERE guild_id = ? AND user_id = ? AND type = 'ban' AND status = 'active'
                    `,
                    [now, interaction.guildId, rawId]
                );
                const caseId = await createCase({
                    userId: rawId,
                    type: "unban",
                    reason,
                    status: "resolved",
                });
                const embed = new EmbedBuilder()
                    .setColor(0x51cf66)
                    .setTitle("🛡️ User unbanned")
                    .addFields(
                        { name: "User", value: `${ban.user.username}\n\`${rawId}\``, inline: true },
                        { name: "Case", value: `#${caseId}`, inline: true },
                        { name: "Reason", value: reason, inline: false }
                    )
                    .setTimestamp();
                sendServerLog(interaction.guild, config, "moderation", {
                    title: "User Unbanned",
                    description: `${interaction.user} unbanned ${ban.user.username}.`,
                    color: 0x51cf66,
                    fields: [
                        { name: "User", value: `${ban.user.username}\n\`${rawId}\``, inline: true },
                        { name: "Moderator", value: `${interaction.user.username}\n\`${interaction.user.id}\``, inline: true },
                        { name: "Case", value: `#${caseId}`, inline: true },
                        { name: "Reason", value: reason, inline: false },
                    ],
                }).catch(() => {});
                return safeReply(interaction, { embeds: [embed] });
            }
        }

        if (interaction.commandName === "addshield") {
            if (interaction.user.id !== OWNER_ID) {
                const errorEmbed = new (require("discord.js").EmbedBuilder)()
                    .setColor(0xED4245)
                    .setTitle("❌ Dev-Only")
                    .setDescription("Only the bot owner can give shields!");
                return safeReply(interaction, { embeds: [errorEmbed], flags: [require("discord.js").MessageFlags.Ephemeral] });
            }

            const targetUser = interaction.options.getUser("user");
            const amount = interaction.options.getInteger("amount") || 1;
            const stats = getUserStats(targetUser.id);

            setUserStats(targetUser.id, { shieldsOwned: stats.shieldsOwned + amount });

            const addEmbed = new (require("discord.js").EmbedBuilder)()
                .setColor(0x57F287)
                .setTitle("✅ Shields given")
                .setDescription(`**${amount}** shield(s) have been credited to **${targetUser.username}**.\nNew inventory: **${stats.shieldsOwned + amount}**`);
            return safeReply(interaction, { embeds: [addEmbed], flags: [require("discord.js").MessageFlags.Ephemeral] });
        }

        if (interaction.commandName === "removeshield") {
            if (interaction.user.id !== OWNER_ID) {
                const errorEmbed = new (require("discord.js").EmbedBuilder)()
                    .setColor(0xED4245)
                    .setTitle("❌ Dev-Only")
                    .setDescription("Only the bot owner can remove shields!");
                return safeReply(interaction, { embeds: [errorEmbed], flags: [require("discord.js").MessageFlags.Ephemeral] });
            }

            const targetUser = interaction.options.getUser("user");
            const amount = interaction.options.getInteger("amount") || 1;
            const stats = getUserStats(targetUser.id);
            const removeAmount = Math.min(amount, stats.shieldsOwned);
            const newAmount = Math.max(0, stats.shieldsOwned - amount);

            setUserStats(targetUser.id, { shieldsOwned: newAmount });

            const removeEmbed = new (require("discord.js").EmbedBuilder)()
                .setColor(0xFEE75C)
                .setTitle("✅ Shields removed")
                .setDescription(`**${removeAmount}** shield(s) have been deducted from **${targetUser.username}**.\nNew inventory: **${newAmount}**`);
            return safeReply(interaction, { embeds: [removeEmbed], flags: [require("discord.js").MessageFlags.Ephemeral] });
        }

        if (interaction.commandName === "reloadcache") {
            if (interaction.user.id !== OWNER_ID) {
                const errorEmbed = new (require("discord.js").EmbedBuilder)()
                    .setColor(0xED4245)
                    .setTitle("❌ Dev-Only")
                    .setDescription("Only the bot owner can reload the cache!");
                return safeReply(interaction, { embeds: [errorEmbed], flags: [require("discord.js").MessageFlags.Ephemeral] });
            }

            await reloadCache();

            const okEmbed = new (require("discord.js").EmbedBuilder)()
                .setColor(0x57F287)
                .setTitle("✅ Cache reloaded")
                .setDescription("All data has been freshly loaded from the database.");
            return safeReply(interaction, { embeds: [okEmbed], flags: [require("discord.js").MessageFlags.Ephemeral] });
        }

        if (interaction.commandName === "synccommands") {
            if (interaction.user.id !== OWNER_ID) {
                const errorEmbed = new (require("discord.js").EmbedBuilder)()
                    .setColor(0xED4245)
                    .setTitle("Dev-Only")
                    .setDescription("Only the bot owner can sync slash commands!");
                return safeReply(interaction, { embeds: [errorEmbed], flags: [require("discord.js").MessageFlags.Ephemeral] });
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
            const result = syncSlashCommands
                ? await syncSlashCommands({ reason: `slash:${interaction.user.id}`, force: true })
                : { skipped: true, reason: "sync function unavailable", registered: 0, total: 0 };

            const syncEmbed = new (require("discord.js").EmbedBuilder)()
                .setColor(result.failed ? 0xFEE75C : 0x57F287)
                .setTitle("Slash Commands synced")
                .addFields(
                    { name: "Changed Guilds", value: String(result.changed ?? 0), inline: true },
                    { name: "Registered", value: String(result.registered ?? 0), inline: true },
                    { name: "Failed", value: String(result.failed ?? 0), inline: true },
                    { name: "Total Guilds", value: String(result.total ?? 0), inline: true },
                    { name: "Reason", value: result.reason || "manual", inline: true }
                );

            return safeReply(interaction, { embeds: [syncEmbed], flags: [require("discord.js").MessageFlags.Ephemeral] });
        }

        if (interaction.commandName === "dbstatus") {
            if (interaction.user.id !== OWNER_ID) {
                const errorEmbed = new (require("discord.js").EmbedBuilder)()
                    .setColor(0xED4245)
                    .setTitle("Dev-Only")
                    .setDescription("Only the bot owner can see the DB status!");
                return safeReply(interaction, { embeds: [errorEmbed], flags: [require("discord.js").MessageFlags.Ephemeral] });
            }

            const status = getCacheStatus();
            const lastReload = status.lastReloadAt
                ? `<t:${Math.floor(status.lastReloadAt / 1000)}:F> (<t:${Math.floor(status.lastReloadAt / 1000)}:R>)`
                : "Never";
            const lastFlush = status.lastGlobalFlushAt
                ? `<t:${Math.floor(status.lastGlobalFlushAt / 1000)}:F> (<t:${Math.floor(status.lastGlobalFlushAt / 1000)}:R>)`
                : "Never";
            const nextFlush = status.nextGlobalFlushAt
                ? `<t:${Math.floor(status.nextGlobalFlushAt / 1000)}:R>`
                : "No Pending";

            const globalStats = status.globalStats || {};
            let dbStatus = null;
            try {
                dbStatus = await getDbStatus();
            } catch (err) {
                dbStatus = { ok: false, error: err?.message || String(err) };
            }

            const dbPingText = dbStatus.ok
                ? `✅ ${dbStatus.pingMs}ms`
                : `❌ ${dbStatus.error || "Ping failed"}`;
            const pool = dbStatus.pool || {};
            const poolText = `total: ${pool.total ?? "-"} | free: ${pool.free ?? "-"} | queued: ${pool.queued ?? "-"}`;

            const backupStatus = getBackupStatus ? getBackupStatus() : null;
            const lastBackup = backupStatus?.lastBackupAt
                ? `<t:${Math.floor(backupStatus.lastBackupAt / 1000)}:F> (<t:${Math.floor(backupStatus.lastBackupAt / 1000)}:R>)`
                : "Never";
            const lastBackupFile = backupStatus?.lastBackupFile
                ? require("path").basename(backupStatus.lastBackupFile)
                : "-";
            const backupEnabled = backupStatus ? (backupStatus.enabled ? "Yes" : "No") : "Unknown";
            const backupError = backupStatus?.lastBackupError
                ? `\nError: ${backupStatus.lastBackupError.slice(0, 140)}`
                : "";

            const statusEmbed = new (require("discord.js").EmbedBuilder)()
                .setColor(0x5865F2)
                .setTitle("DB/Cache Status")
                .addFields(
                    { name: "Last Reload", value: lastReload, inline: false },
                    { name: "Cache Flush", value: `Pending: **${status.pendingGlobalFlush ? "Yes" : "No"}**\nLast Flush: ${lastFlush}\nNext Flush: ${nextFlush}`, inline: false },
                    { name: "Caches", value: `Guilds: **${status.guildCount}**\nUsers: **${status.userCount}**`, inline: true },
                    { name: "Global Stats", value: `totalTrolls: **${globalStats.totalTrolls || 0}**\ntotalMoves: **${globalStats.totalMoves || 0}**`, inline: true },
                    { name: "DB Ping", value: dbPingText, inline: true },
                    { name: "Pool", value: poolText, inline: true },
                    { name: "WS Ping", value: `${Math.round(client.ws.ping)}ms`, inline: true },
                    { name: "Backups", value: `Active: **${backupEnabled}**\nLast: ${lastBackup}\nFile: ${lastBackupFile}${backupError}`, inline: false }
                );

            return safeReply(interaction, { embeds: [statusEmbed], flags: [require("discord.js").MessageFlags.Ephemeral] });
        }

        if (interaction.commandName === "testsetupdm") {
            if (interaction.user.id !== OWNER_ID) {
                const errorEmbed = new (require("discord.js").EmbedBuilder)()
                    .setColor(0xED4245)
                    .setTitle("Dev-Only")
                    .setDescription("Only the bot owner can send this test DM!");
                return safeReply(interaction, { embeds: [errorEmbed], flags: [require("discord.js").MessageFlags.Ephemeral] });
            }

            const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
            const setupUrl = dashboardPageUrl("serverconfig", { guildId: interaction.guild.id });

            const reminderEmbed = new (require("discord.js").EmbedBuilder)()
                .setColor(0x5865f2)
                .setTitle("👋 You have unfinished setup")
                .setDescription(
                    `It looks like setup isn't complete yet for **${interaction.guild.name}**.\n\n` +
                    "Click below to finish setup in the dashboard (roles, modules, logging and more)."
                )
                .addFields(
                    { name: "Server", value: `${interaction.guild.name}\n\`${interaction.guild.id}\``, inline: true },
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

            try {
                await interaction.user.send({ embeds: [reminderEmbed], components: [row] });
                return safeReply(interaction, {
                    content: "✅ Test-DM wurde dir geschickt.",
                    flags: [require("discord.js").MessageFlags.Ephemeral]
                });
            } catch (error) {
                return safeReply(interaction, {
                    content: "❌ Konnte keine DM senden. Prüfe ob deine DMs fuer den Server aktiviert sind.",
                    flags: [require("discord.js").MessageFlags.Ephemeral]
                });
            }
        }
        if (interaction.commandName === "notifysettings") {
            const userId = interaction.user?.id;
            
            const notificationManager = require("../utils/notificationManager");
            
            const enabledOption = interaction.options.getBoolean("enabled");
            
            let enabled;
            if (enabledOption === null) {
                // Toggle if not specified
                enabled = notificationManager.toggleNotifications(userId);
            } else {
                // Set to specific value
                enabled = enabledOption;
                notificationManager.toggleNotifications(userId, enabled);
            }

            const settingsEmbed = new (require("discord.js").EmbedBuilder)()
                .setColor(enabled ? COLORS.SUCCESS : COLORS.WARNING)
                .setTitle("📬 Notification Settings")
                .setDescription(enabled 
                    ? "You will now receive DMs when you're being trolled! 👻"
                    : "You will NOT receive DMs when you're being trolled.")
                .addFields({
                    name: "Status",
                    value: enabled ? `${EMOJIS.ACTIVE} Notifications ON` : `${EMOJIS.INACTIVE} Notifications OFF`,
                    inline: true
                })
                .setFooter({ text: "Premium Feature • Privacy-first: DM notifications are opt-in only" })
                .setTimestamp();

            return safeReply(interaction, { embeds: [settingsEmbed], flags: [MessageFlags.Ephemeral] });
        }

        if (interaction.commandName === "settrollmessage") {
            const userPrefs = require("../utils/userPrefs");
            const msg = interaction.options.getString("message") || null;
            userPrefs.setCustomTrollMessage(interaction.user.id, msg);

            const msgEmbed = new EmbedBuilder()
                .setColor(msg ? COLORS.SUCCESS : COLORS.WARNING)
                .setTitle("👑 Custom Troll Message")
                .setDescription(msg
                    ? `Your custom message has been set:\n> *${msg}*`
                    : "Your custom troll message has been **reset** to the default.")
                .setFooter({ text: "Pro Feature • Your message appears when you start any troll" })
                .setTimestamp();

            return safeReply(interaction, { embeds: [msgEmbed], flags: [MessageFlags.Ephemeral] });
        }

        if (interaction.commandName === "voice") {
            const sub = interaction.options.getSubcommand();
            const { tempVoiceChannels } = dependencies;
            const member = interaction.member;
            const voiceChannel = member?.voice?.channel;

            if (!voiceChannel) {
                return safeReply(interaction, { content: "❌ Du bist in keinem Voice-Channel.", flags: [MessageFlags.Ephemeral] });
            }

            const tvData = tempVoiceChannels?.get(voiceChannel.id);
            const isOwner = tvData?.ownerId === interaction.user.id;

            if (sub === "claim") {
                if (!tvData) {
                    return safeReply(interaction, { content: "❌ Das ist kein Temp Voice Channel.", flags: [MessageFlags.Ephemeral] });
                }
                const ownerInChannel = voiceChannel.members.has(tvData.ownerId);
                if (ownerInChannel) {
                    return safeReply(interaction, { content: "❌ Der Owner ist noch im Channel. Du kannst ihn nicht claimen.", flags: [MessageFlags.Ephemeral] });
                }
                tempVoiceChannels.set(voiceChannel.id, { ...tvData, ownerId: interaction.user.id });
                return safeReply(interaction, { content: `✅ Du bist jetzt Owner von **${voiceChannel.name}**.`, flags: [MessageFlags.Ephemeral] });
            }

            if (!tvData) {
                return safeReply(interaction, { content: "❌ Das ist kein Temp Voice Channel.", flags: [MessageFlags.Ephemeral] });
            }
            if (!isOwner) {
                return safeReply(interaction, { content: "❌ Du bist nicht der Owner dieses Channels.", flags: [MessageFlags.Ephemeral] });
            }

            const config = getGuildConfig(interaction.guildId);
            const tvSettings = (config.tempVoice && typeof config.tempVoice === "object") ? config.tempVoice : {};

            if (sub === "rename") {
                if (!parseBoolean(tvSettings.allowRename, true)) {
                    return safeReply(interaction, { content: "❌ Rename ist auf diesem Server deaktiviert.", flags: [MessageFlags.Ephemeral] });
                }
                const newName = interaction.options.getString("name").replace(/[\\/#]/g, " ").trim().slice(0, 90);
                if (!newName) return safeReply(interaction, { content: "❌ Ungültiger Name.", flags: [MessageFlags.Ephemeral] });
                await voiceChannel.setName(newName, "Fahrstuhl temp voice rename").catch(() => null);
                return safeReply(interaction, { content: `✅ Channel umbenannt zu **${newName}**.`, flags: [MessageFlags.Ephemeral] });
            }

            if (sub === "lock") {
                if (!parseBoolean(tvSettings.allowLock, true)) {
                    return safeReply(interaction, { content: "❌ Lock ist auf diesem Server deaktiviert.", flags: [MessageFlags.Ephemeral] });
                }
                await voiceChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: false }, { reason: "Fahrstuhl temp voice lock" }).catch(() => null);
                return safeReply(interaction, { content: `🔒 **${voiceChannel.name}** ist jetzt gesperrt.`, flags: [MessageFlags.Ephemeral] });
            }

            if (sub === "unlock") {
                if (!parseBoolean(tvSettings.allowLock, true)) {
                    return safeReply(interaction, { content: "❌ Lock ist auf diesem Server deaktiviert.", flags: [MessageFlags.Ephemeral] });
                }
                await voiceChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, { Connect: null }, { reason: "Fahrstuhl temp voice unlock" }).catch(() => null);
                return safeReply(interaction, { content: `🔓 **${voiceChannel.name}** ist jetzt offen.`, flags: [MessageFlags.Ephemeral] });
            }

            if (sub === "limit") {
                if (!parseBoolean(tvSettings.allowLimit, true)) {
                    return safeReply(interaction, { content: "❌ Limit ist auf diesem Server deaktiviert.", flags: [MessageFlags.Ephemeral] });
                }
                const slots = interaction.options.getInteger("slots");
                await voiceChannel.setUserLimit(slots, "Fahrstuhl temp voice limit").catch(() => null);
                return safeReply(interaction, {
                    content: slots === 0 ? `✅ User-Limit für **${voiceChannel.name}** entfernt.` : `✅ User-Limit auf **${slots}** gesetzt.`,
                    flags: [MessageFlags.Ephemeral]
                });
            }

            if (sub === "kick") {
                const target = interaction.options.getMember("user");
                if (!target) return safeReply(interaction, { content: "❌ User nicht gefunden.", flags: [MessageFlags.Ephemeral] });
                if (target.id === interaction.user.id) return safeReply(interaction, { content: "❌ Du kannst dich nicht selbst kicken.", flags: [MessageFlags.Ephemeral] });
                if (!voiceChannel.members.has(target.id)) return safeReply(interaction, { content: "❌ Der User ist nicht in deinem Channel.", flags: [MessageFlags.Ephemeral] });
                await target.voice.disconnect("Fahrstuhl temp voice kick").catch(() => null);
                return safeReply(interaction, { content: `✅ **${target.user.username}** wurde aus dem Channel geworfen.`, flags: [MessageFlags.Ephemeral] });
            }
        }

        if (interaction.commandName === "invite") {
            const { EmbedBuilder, MessageFlags } = require("discord.js");
            const inviteUrl = "https://discord.com/oauth2/authorize?client_id=1487187616674611321&permissions=1654096264208&scope=bot+applications.commands";
            const topggUrl = "https://top.gg/bot/1487187616674611321";
            const inviteEmbed = new EmbedBuilder()
                .setColor(0x667eea)
                .setTitle("📨 Invite Fahrstuhl Bot")
                .setDescription("Add Fahrstuhl to your server and start using all features! 😈")
                .addFields(
                    { name: "🚀 Invite Link", value: `[Click here to invite the bot](${inviteUrl})`, inline: false },
                    { name: "⭐ Vote on top.gg", value: `[Vote & leave a review](${topggUrl})`, inline: false },
                    { name: "🌐 Dashboard", value: "[Fahrstuhl Dashboard öffnen](https://eselbande.com/fahrstuhl/) — Stats, Settings & Premium", inline: false },
                    { name: "💬 Support Server", value: "[Join for help & updates](https://discord.gg/zfzDHKcWDx)", inline: false }
                )
                .setFooter({ text: "Thanks for supporting Fahrstuhl Bot! 🎉" });
            return safeReply(interaction, { embeds: [inviteEmbed], flags: [MessageFlags.Ephemeral] });
        }

        if (interaction.commandName === "serverbackup") {
            const member = interaction.member;
            const isAdmin = member?.permissions?.has(require("discord.js").PermissionsBitField.Flags.Administrator);
            if (!isAdmin && interaction.user.id !== OWNER_ID) {
                return safeReply(interaction, {
                    content: "❌ Du brauchst Administrator-Rechte für diesen Command.",
                    flags: [MessageFlags.Ephemeral]
                });
            }

            const sub = interaction.options.getSubcommand();
            const { createBackupJob, createServerBackup, listGuildBackups, getBackupById } = require('../utils/serverBackup');
            const { AttachmentBuilder: AB } = require('discord.js');
            const { getGuildConfig } = require('../utils/config');

            if (sub === "create") {
                await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

                const botConfig = getGuildConfig(interaction.guild.id);
                const jobId = await createBackupJob(interaction.guild.id);
                createServerBackup(interaction.guild, botConfig, interaction.user.id, jobId).catch(err => {
                    console.error('[serverbackup] create error:', err);
                });

                const embed = new EmbedBuilder()
                    .setColor(COLORS.INFO ?? 0x5865F2)
                    .setTitle("💾 Server Backup gestartet")
                    .setDescription("Das Backup läuft jetzt im Hintergrund.")
                    .addFields(
                        { name: "Job ID", value: `\`#${jobId}\``, inline: false },
                        { name: "Status", value: "Im Dashboard unter Server Backup live verfolgen.", inline: false },
                    )
                    .setFooter({ text: "Fahrstuhl Server Backup • Async Queue" })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            if (sub === "list") {
                const backups = await listGuildBackups(interaction.guild.id);
                if (!backups.length) {
                    return safeReply(interaction, { content: "📂 Keine Backups gefunden. Nutze `/serverbackup create`.", flags: [MessageFlags.Ephemeral] });
                }
                const list = backups.slice(0, 10).map((b, i) => {
                    const when = `<t:${Math.floor(b.createdAt / 1000)}:f>`;
                    const msgs = b.stats?.messages ?? '?';
                    return `**#${b.id}** · ${when}\n   Rollen: ${b.stats?.roles ?? '?'} · Channels: ${b.stats?.channels ?? '?'} · Nachrichten: ${msgs}`;
                }).join('\n\n');
                const embed = new EmbedBuilder()
                    .setColor(COLORS.INFO ?? 0x5865F2)
                    .setTitle(`💾 Server Backups – ${interaction.guild.name}`)
                    .setDescription(list)
                    .setFooter({ text: `${backups.length} Backup(s) · /serverbackup info <id>` });
                return safeReply(interaction, { embeds: [embed], flags: [MessageFlags.Ephemeral] });
            }

            if (sub === "info") {
                const filename = interaction.options.getString("filename");
                const backupId = parseInt(filename, 10);
                if (!Number.isFinite(backupId) || backupId < 1) {
                    return safeReply(interaction, { content: "❌ Bitte gib eine gültige Backup-ID an (Zahl aus `/serverbackup list`).", flags: [MessageFlags.Ephemeral] });
                }
                const data = await getBackupById(backupId, interaction.guild.id);
                if (!data) {
                    return safeReply(interaction, { content: "❌ Backup nicht gefunden.", flags: [MessageFlags.Ephemeral] });
                }
                const meta = data.meta;
                const embed = new EmbedBuilder()
                    .setColor(COLORS.INFO ?? 0x5865F2)
                    .setTitle(`💾 Backup #${meta.id} Info`)
                    .addFields(
                        { name: "Server", value: `${meta.name} (\`${meta.guildId}\`)`, inline: false },
                        { name: "Erstellt", value: `<t:${Math.floor(meta.createdAt / 1000)}:F>`, inline: false },
                        { name: "Rollen", value: String(meta.stats?.roles ?? '?'), inline: true },
                        { name: "Channels", value: String(meta.stats?.channels ?? '?'), inline: true },
                        { name: "Emojis", value: String(meta.stats?.emojis ?? '?'), inline: true },
                        { name: "Sticker", value: String(meta.stats?.stickers ?? '?'), inline: true },
                        { name: "Bans", value: String(meta.stats?.bans ?? '?'), inline: true },
                        { name: "Nachrichten", value: String(meta.stats?.messages ?? '?'), inline: true },
                    )
                    .setFooter({ text: `Backup ID #${meta.id}` });
                return safeReply(interaction, { embeds: [embed], flags: [MessageFlags.Ephemeral] });
            }
        }

        // ===== /freegames =====
        if (interaction.commandName === "freegames") {
            const sub = interaction.options.getSubcommand();
            const { normalizeFreeGamesConfig } = require("../utils/freeGamesNotifier");
            const freeGamesNotifier = require("../utils/freeGamesNotifier");

            if (sub === "setup") {
                const channel = interaction.options.getChannel("channel");
                const mentionRole = interaction.options.getRole("mention-role");

                if (!channel.isTextBased()) {
                    return safeReply(interaction, {
                        content: "❌ Bitte wähle einen Text-Channel aus.",
                        flags: [MessageFlags.Ephemeral],
                    });
                }

                const config = getGuildConfig(interaction.guildId);
                const existing = normalizeFreeGamesConfig(config);
                const filterOpt = interaction.options.getString("filter") || existing.filter || "all";
                setGuildConfig(interaction.guildId, {
                    freeGames: {
                        ...existing,
                        enabled: true,
                        channelId: channel.id,
                        mentionRoleId: mentionRole ? mentionRole.id : existing.mentionRoleId,
                        filter: filterOpt,
                        firstRunDone: false, // reset so first poll just marks existing games as seen
                    },
                });

                const filterLabel = filterOpt === "serious" ? "Nur seriöse Stores (Epic, GOG, Steam)" : "Alle Spiele";
                const embed = new EmbedBuilder()
                    .setColor(0x00d26a)
                    .setTitle("✅ Free Games Notifications aktiviert")
                    .setDescription(`Neue kostenlose Spiele werden in ${channel} angekündigt.`)
                    .addFields(
                        { name: "Channel", value: `${channel}`, inline: true },
                        { name: "Mention", value: mentionRole ? `${mentionRole}` : "Keine", inline: true },
                        { name: "Filter", value: filterLabel, inline: true },
                    )
                    .setFooter({ text: "Fahrstuhl Bot • Free Games" });
                return safeReply(interaction, { embeds: [embed], flags: [MessageFlags.Ephemeral] });
            }

            if (sub === "filter") {
                const mode = interaction.options.getString("mode");
                const config = getGuildConfig(interaction.guildId);
                const existing = normalizeFreeGamesConfig(config);
                setGuildConfig(interaction.guildId, {
                    freeGames: { ...existing, filter: mode },
                });
                const label = mode === "serious"
                    ? "🏪 Nur seriöse Stores (Epic, GOG, Steam)"
                    : "🌐 Alle Spiele (Epic, GOG, Steam, GamerPower, itch.io)";
                return safeReply(interaction, {
                    content: `✅ Filter aktualisiert: **${label}**`,
                    flags: [MessageFlags.Ephemeral],
                });
            }

            if (sub === "disable") {
                const config = getGuildConfig(interaction.guildId);
                const existing = normalizeFreeGamesConfig(config);
                setGuildConfig(interaction.guildId, {
                    freeGames: { ...existing, enabled: false },
                });
                return safeReply(interaction, {
                    content: "🔕 Free Game Notifications wurden deaktiviert.",
                    flags: [MessageFlags.Ephemeral],
                });
            }

            if (sub === "status") {
                const config = getGuildConfig(interaction.guildId);
                const settings = normalizeFreeGamesConfig(config);
                const embed = new EmbedBuilder()
                    .setColor(settings.enabled ? 0x00d26a : 0x747f8d)
                    .setTitle("🎮 Free Games – Status")
                    .addFields(
                        { name: "Status", value: settings.enabled ? "✅ Aktiv" : "❌ Deaktiviert", inline: true },
                        { name: "Channel", value: settings.channelId ? `<#${settings.channelId}>` : "Nicht gesetzt", inline: true },
                        { name: "Mention", value: settings.mentionRoleId ? `<@&${settings.mentionRoleId}>` : "Keine", inline: true },
                        { name: "Filter", value: settings.filter === "serious" ? "🏪 Nur seriöse Stores" : "🌐 Alle Spiele", inline: true },
                        { name: "Bekannte Spiele", value: String(settings.postedIds.length), inline: true },
                    )
                    .setFooter({ text: "Fahrstuhl Bot • Free Games" });
                return safeReply(interaction, { embeds: [embed], flags: [MessageFlags.Ephemeral] });
            }

            if (sub === "test") {
                if (interaction.user.id !== OWNER_ID) {
                    return safeReply(interaction, {
                        content: "❌ Nur der Bot-Eigentümer kann diesen Befehl nutzen.",
                        flags: [MessageFlags.Ephemeral],
                    });
                }
                await safeReply(interaction, {
                    content: "🔄 Hole aktuelle freie Spiele von Epic...",
                    flags: [MessageFlags.Ephemeral],
                });
                try {
                    const count = await freeGamesNotifier.postToChannel(interaction.channel);
                    if (count === 0) {
                        await interaction.editReply({ content: "ℹ️ Aktuell keine kostenlosen Spiele bei Epic gefunden." });
                    } else {
                        await interaction.editReply({ content: `✅ ${count} Spiel(e) in diesem Channel gepostet.` });
                    }
                } catch (err) {
                    await interaction.editReply({ content: `❌ Fehler beim Abrufen: ${err.message}` });
                }
                return;
            }
        }

    } catch (err) {
        if (err.code === 10062 || err.code === 40060) {
            return;
        }

        // Track error stats
        try {
            const commandStatsManager = require('../utils/commandStatsManager');
            commandStatsManager.trackError(interaction.commandName);
        } catch (_) {}
        
        console.error("Interaction Error:", err);
        try {
            const optionData = interaction.options?.data || [];
            const formatOption = (opt) => {
                if (!opt) return "";
                if (opt.user) return `${opt.name}: user ${opt.user.id}`;
                if (opt.member) return `${opt.name}: member ${opt.member.id || opt.member.user?.id || "unknown"}`;
                if (opt.role) return `${opt.name}: role ${opt.role.id}`;
                if (opt.channel) return `${opt.name}: channel ${opt.channel.id}`;
                if (opt.value !== undefined) return `${opt.name}: ${opt.value}`;
                return opt.name || "option";
            };
            let optionsText = optionData.length ? optionData.map(formatOption).filter(Boolean).join(", ") : "None";
            if (optionsText.length > 1000) {
                optionsText = optionsText.slice(0, 1000) + "...";
            }
            const errorText = err?.stack || err?.message || String(err);
            const errorSnippet = errorText.length > 1500 ? `${errorText.slice(0, 1500)}...` : errorText;

            await dependencies.logToMaster({
                title: "❌ Interaction Error",
                description: `**Command:** / ${interaction.commandName}
**Error:** \`\`\`js
${errorSnippet}
\`\`\``,
                color: 0xED4245,
                fields: [
                    { name: "User", value: `${interaction.user?.username || "Unknown"} (${interaction.user?.id || "-"})`, inline: true },
                    { name: "Guild", value: `${interaction.guild?.name || "DM"} (${interaction.guildId || "-"})`, inline: true },
                    { name: "Channel", value: `${interaction.channelId || "-"}`, inline: true },
                    { name: "Options", value: optionsText, inline: false }
                ]
            }, "ERRORS").catch(() => {});

            const errorEmbed = new (require("discord.js").EmbedBuilder)()
                .setColor(0xED4245)
                .setTitle("❌ Internal Error")
                .setDescription("An unexpected error occurred while executing the command.");

            return dependencies.safeReply(interaction, { embeds: [errorEmbed], flags: [require("discord.js").MessageFlags.Ephemeral] });
        } catch (logErr) {
            console.error("Error while logging interaction error:", logErr);
        }
    }
}

module.exports = {
    commands,
    handleInteraction
};
