const { PermissionsBitField } = require("discord.js");
const { joinVoiceChannel, getVoiceConnection } = require("@discordjs/voice");
const { errorMessageBuilder } = require("../utils/index");
const SafeAccessor = require("../utils/safeAccessor");

function createTrollManager({
    client,
    logToMaster,
    getGuildConfig,
    incrementGlobalStat,
    retryDiscordAPI,
    getTrollKey,
    checkBotManageMember,
    canBotManageMember,
    cleanupUserOperations,
    getGlobalStop = () => false
}) {
    const activeMoves = new Map();
    const activeMoveEnds = new Map();
    const initialChannels = new Map();
    const activeGhosts = new Map();
    const activeSilentPost = new Map();
    const activeMirror = new Map();
    const activeDeafTroll = new Map();

    function init() { /* no-op */ }

    function getActiveMovesInGuild(guildId) {
        let count = 0;
        for (const key of activeMoves.keys()) {
            if (key.startsWith(`${guildId}-`)) count++;
        }
        return count;
    }

    function clearEffectEntry(activeMap, trollKey) {
        const entry = activeMap.get(trollKey);
        if (!entry) return;

        if (entry.loopTimeout) clearTimeout(entry.loopTimeout);
        if (entry.stopTimeout) clearTimeout(entry.stopTimeout);
        if (!entry.loopTimeout && !entry.stopTimeout && typeof entry !== "boolean") {
            clearTimeout(entry);
        }

        activeMap.delete(trollKey);
    }

    function getLoopTimeout(entry) {
        return entry && typeof entry === "object" && entry.loopTimeout ? entry.loopTimeout : entry;
    }

    function buildManageMemberErrorText(reason, permissionLabel, channelName = null) {
        const context = {
            permission: permissionLabel,
            channel: channelName
        };
        
        switch (reason) {
            case "MISSING_PERMISSION":
                return errorMessageBuilder.getMessage('MISSING_PERMISSION', context);
            case "ROLE_HIERARCHY":
                return errorMessageBuilder.getMessage('ROLE_HIERARCHY', { userRole: `${permissionLabel}'s role` });
            case "TARGET_OWNER":
                return errorMessageBuilder.getMessage('TARGET_OWNER', {});
            default:
                return errorMessageBuilder.getMessage('INVALID_INPUT', { message: 'Unknown permission issue' });
        }
    }

    function safeJoinVoice(channel) {
        try {
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false
            });

            if (!connection.__fahrstuhlErrorListenerAttached) {
                connection.on("error", (error) => {
                    console.error(`❌ Voice Connection Error in ${channel.guild.name}:`, error);
                    try { connection.destroy(); } catch (e) { }
                    // Retry once after short delay
                    setTimeout(() => {
                        try {
                            joinVoiceChannel({
                                channelId: channel.id,
                                guildId: channel.guild.id,
                                adapterCreator: channel.guild.voiceAdapterCreator,
                                selfDeaf: false,
                                selfMute: false
                            });
                            console.log(`🔄 Voice reconnected in ${channel.guild.name}`);
                        } catch (retryErr) {
                            console.error(`❌ Voice reconnect failed:`, retryErr.message);
                        }
                    }, 3000);
                });
                connection.__fahrstuhlErrorListenerAttached = true;
            }

            return connection;
        } catch (err) {
            console.error("❌ Fatal Voice Join Error:", err);
            return null;
        }
    }

    async function restoreOriginalAvatarIfNoMirrors() {
        // Avatar copying removed (Discord ToS - impersonation)
    }

    async function stopAllMirrors({ log = true } = {}) {
        if (activeMirror.size === 0) return;

        const guildIds = new Set();
        for (const [key, entry] of activeMirror.entries()) {
            const [guildId] = key.split("-");
            if (guildId) guildIds.add(guildId);
            if (entry && entry.stopTimeout) clearTimeout(entry.stopTimeout);
        }

        activeMirror.clear();

        for (const guildId of guildIds) {
            try {
                const guild = await client.guilds.fetch(guildId);
                const botMember = await guild.members.fetch(client.user.id);
                if (botMember.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
                    await retryDiscordAPI(() => botMember.setNickname(null));
                }
            } catch (e) { }

            try {
                if (getActiveMovesInGuild(guildId) === 0) {
                    const connection = getVoiceConnection(guildId);
                    if (connection) connection.destroy();
                }
            } catch (e) { }
        }

        await restoreOriginalAvatarIfNoMirrors();

        if (log) {
            await logToMaster({
                title: "🪞 Mirror STOP",
                description: "All active mirrors have been stopped.",
                color: 0xED4245
            }, "TROLLS");
        }
    }

    async function startAutoMove(member, forced = false, durationMs = 30000) {
        if (getGlobalStop()) return;

        const trollKey = getTrollKey(member.guild.id, member.id);
        if (activeMoves.has(trollKey)) return;

        const config = getGuildConfig(member.guild.id);
        const roleId = config.roleId;

        if (member.voice.channel) {
            initialChannels.set(trollKey, member.voice.channel.id);
        }

        const durationSecs = Math.round(durationMs / 1000);
        console.log(`▶️ Start AutoMove: ${member.user.tag} (Guild: ${member.guild.name}, Forced: ${forced}, Duration: ${durationSecs}s)`);
        incrementGlobalStat("totalTrolls");
        await logToMaster({
            title: "🚀 Elevator START",
            description: `**User:** ${member.user.tag} (\`${member.id}\`)\n**Server:** ${member.guild.name} (\`${member.guild.id}\`)\n**Duration:** ${durationSecs}s\n**Forced:** ${forced ? "✅ Yes" : "❌ No (Role)"}`,
            color: 0xFEE75C,
            thumbnail: member.user.displayAvatarURL()
        }, "TROLLS");

        if (forced) {
            activeMoveEnds.set(trollKey, Date.now() + durationMs);
            setTimeout(() => {
                console.log(`⏱️ ${durationSecs}s timer expired for: ${member.user.tag}`);
                stopAutoMove(member.id, member.guild.id);
            }, durationMs);
        } else {
            activeMoveEnds.delete(trollKey);
        }

        const interval = setInterval(async () => {
            try {
                if (getGlobalStop()) {
                    stopAutoMove(member.id, member.guild.id);
                    return;
                }

                // Safe member fetches
                const freshMember = await member.guild.members.fetch(member.id).catch(() => null);
                if (!freshMember) {
                    console.debug(`Member not found: ${member.id}`);
                    stopAutoMove(member.id, member.guild.id);
                    return;
                }

                const botMember = await member.guild.members.fetch(client.user.id).catch(() => null);
                if (!botMember) {
                    console.error(`Bot not member of guild: ${member.guild.id}`);
                    stopAutoMove(member.id, member.guild.id);
                    return;
                }

                // Safe property access
                const memberVoiceChannel = SafeAccessor.deepGet(freshMember, 'voice.channel');
                const rolesCache = SafeAccessor.deepGet(freshMember, 'roles.cache');
                const hasRole = roleId ? (rolesCache ? rolesCache.has(roleId) : false) : false;
                
                if (!memberVoiceChannel || (!forced && !hasRole)) {
                    stopAutoMove(member.id, member.guild.id);
                    return;
                }

                const allVoiceChannels = freshMember.guild.channels.cache
                    .filter(c => c && c.isVoiceBased && c.isVoiceBased() && c.id !== memberVoiceChannel.id)
                    .map(c => c.id);

                if (allVoiceChannels.length === 0) return;

                const channelId = allVoiceChannels[Math.floor(Math.random() * allVoiceChannels.length)];
                const channel = freshMember.guild.channels.cache.get(channelId);

                if (channel && channel.isVoiceBased && channel.isVoiceBased()) {
                    const moveCheck = checkBotManageMember(
                        botMember,
                        freshMember,
                        PermissionsBitField.Flags.MoveMembers,
                        false,
                        channel
                    );
                    if (!moveCheck.ok) {
                        const reasonText = buildManageMemberErrorText(moveCheck.reason, "Move Members", channel?.name);
                        console.error(`❌ Bot cannot move member ${freshMember.user.tag} in guild ${freshMember.guild.name}: ${reasonText}`);
                        await logToMaster(`❌ **Error**: ${reasonText} in **${freshMember.guild.name}**`);
                        stopAutoMove(member.id, member.guild.id);
                        return;
                    }

                    try {
                        await retryDiscordAPI(() => freshMember.voice.setChannel(channel));
                        incrementGlobalStat("totalMoves");
                    } catch (moveErr) {
                        console.error(`AutoMove setChannel error for ${freshMember.user.tag}:`, moveErr);
                        stopAutoMove(member.id, member.guild.id);
                        return;
                    }

                    const connection = safeJoinVoice(channel);
                    if (connection) {
                        setTimeout(() => {
                            try {
                                if (getActiveMovesInGuild(member.guild.id) === 0) {
                                    connection.destroy();
                                }
                            } catch (e) { }
                        }, 2000);
                    }
                }

            } catch (err) {
                console.error("AutoMove Error:", err);
                stopAutoMove(member.id, member.guild.id);
            }
        }, 2500);

        activeMoves.set(trollKey, interval);
    }

    async function stopAutoMove(userId, guildId) {
        const trollKey = getTrollKey(guildId, userId);
        const interval = activeMoves.get(trollKey);
        if (!interval) return;

        clearInterval(interval);
        activeMoves.delete(trollKey);
        activeMoveEnds.delete(trollKey);
        console.log(`⏹️ Stop AutoMove: ${userId} (Guild: ${guildId})`);

        try {
            const guild = await client.guilds.fetch(guildId);
            const member = await guild.members.fetch(userId);
            const initialChannelId = initialChannels.get(trollKey);

            await logToMaster({
                title: "⏹️ Elevator STOP",
                description: `**User:** ${member.user.tag}\n**Server:** ${guild.name}`,
                color: 0xED4245,
                thumbnail: member.user.displayAvatarURL()
            }, "TROLLS");

            if (initialChannelId && member.voice.channel) {
                const initialChannel = guild.channels.cache.get(initialChannelId);
                if (initialChannel && initialChannel.isVoiceBased()) {
                    console.log(`↩️ Moving ${member.user.tag} back to ${initialChannel.name}`);
                    if (guild.members.me.permissions.has(PermissionsBitField.Flags.MoveMembers)) {
                        await retryDiscordAPI(() => member.voice.setChannel(initialChannel));
                        await logToMaster({
                            title: "↩️ Elevator RETURN",
                            description: `**User:** ${member.user.tag}\n**Channel:** \`${initialChannel.name}\`\n**Server:** ${guild.name}`,
                            color: 0x5865F2
                        }, "TROLLS");

                        joinVoiceChannel({
                            channelId: initialChannel.id,
                            guildId: guild.id,
                            adapterCreator: guild.voiceAdapterCreator
                        });
                    }
                }
            }
        } catch (err) {
            console.error("Return to initial channel error:", err);
        } finally {
            initialChannels.delete(trollKey);
        }

        if (getActiveMovesInGuild(guildId) === 0) {
            const connection = getVoiceConnection(guildId);
            if (connection) {
                setTimeout(() => {
                    if (getActiveMovesInGuild(guildId) === 0) connection.destroy();
                }, 1000);
            }
        }
    }

    async function startGhostVisit(member, durationMs = 60000) {
        if (getGlobalStop()) return false;
        const trollKey = getTrollKey(member.guild.id, member.id);
        if (activeGhosts.has(trollKey)) {
            clearEffectEntry(activeGhosts, trollKey);
            await logToMaster({
                title: "👻 Ghost STOP",
                description: `**User:** ${member.user.tag}\n**Server:** ${member.guild.name}`,
                color: 0xED4245
            }, "TROLLS");
            return false;
        }

        const expiresAt = Date.now() + durationMs;
        let stopTimeout = null;

        const scheduleNext = () => {
            const delay = Math.floor(Math.random() * 25000) + 20000;

            const loopTimeout = setTimeout(async () => {
                try {
                    if (getGlobalStop()) {
                        clearEffectEntry(activeGhosts, trollKey);
                        return;
                    }

                    const freshMember = await member.guild.members.fetch(member.id);

                    if (freshMember.voice.channel) {
                        console.log(`👻 Ghost visit to ${freshMember.user.tag} (Guild: ${member.guild.name})`);
                        incrementGlobalStat("totalTrolls");
                        const connection = safeJoinVoice(freshMember.voice.channel);

                        setTimeout(() => {
                            if (connection && getActiveMovesInGuild(member.guild.id) === 0) {
                                try { connection.destroy(); } catch (e) { }
                            }
                        }, 5000);
                    }
                } catch (err) {
                    console.error("Ghost Error:", err);
                }
                if (getLoopTimeout(activeGhosts.get(trollKey)) !== loopTimeout) return;
                scheduleNext();
            }, delay);

            activeGhosts.set(trollKey, { loopTimeout, stopTimeout, expiresAt });
        };

        stopTimeout = setTimeout(async () => {
            if (!activeGhosts.has(trollKey)) return;
            clearEffectEntry(activeGhosts, trollKey);
            await logToMaster({
                title: "👻 Ghost STOP",
                description: `**User:** ${member.user.tag}\n**Server:** ${member.guild.name}\n**Reason:** Duration expired`,
                color: 0xED4245
            }, "TROLLS");
        }, durationMs);

        scheduleNext();
        await logToMaster({
            title: "👻 Ghost START",
            description: `**User:** ${member.user.tag}\n**Server:** ${member.guild.name}\n**Duration:** ${Math.round(durationMs / 60000)} min`,
            color: 0x57F287,
            thumbnail: member.user.displayAvatarURL()
        }, "TROLLS");
        return true;
    }

    async function startSilentPost(member, durationMs = 60000) {
        if (getGlobalStop()) return false;
        const trollKey = getTrollKey(member.guild.id, member.id);
        if (activeSilentPost.has(trollKey)) {
            clearEffectEntry(activeSilentPost, trollKey);
            await logToMaster({
                title: "🔇 Silent Post STOP",
                description: `**User:** ${member.user.tag}\n**Server:** ${member.guild.name}`,
                color: 0xED4245
            }, "TROLLS");
            return false;
        }

        const expiresAt = Date.now() + durationMs;
        let stopTimeout = null;

        const scheduleNext = () => {
            const delay = 10 * 1000;

            const loopTimeout = setTimeout(async () => {
                try {
                    if (getGlobalStop()) {
                        clearEffectEntry(activeSilentPost, trollKey);
                        return;
                    }

                    const freshMember = await member.guild.members.fetch(member.id);
                    const botMember = await member.guild.members.fetch(client.user.id);

                    if (freshMember.voice.channel) {
                        const muteCheck = checkBotManageMember(
                            botMember,
                            freshMember,
                            PermissionsBitField.Flags.MuteMembers,
                            true,
                            freshMember.voice.channel
                        );
                        if (!muteCheck.ok) {
                            const reasonText = buildManageMemberErrorText(muteCheck.reason, "Mute Members", freshMember.voice.channel?.name);
                            console.error(`❌ Bot cannot mute member ${freshMember.user.tag} in guild ${freshMember.guild.name}: ${reasonText}`);
                            await logToMaster(`❌ **Error**: ${reasonText} in **${freshMember.guild.name}**`);
                            clearEffectEntry(activeSilentPost, trollKey);
                            return;
                        }

                        console.log(`🔇 Silent Post to ${freshMember.user.tag} (Guild: ${member.guild.name})`);
                        incrementGlobalStat("totalTrolls");
                        await retryDiscordAPI(() => freshMember.voice.setMute(true, "Silent Post Troll"));

                        const muteDuration = (Math.floor(Math.random() * 2) + 1) * 1000;
                        setTimeout(async () => {
                            try {
                                await retryDiscordAPI(() => freshMember.voice.setMute(false));
                            } catch (e) { }
                        }, muteDuration);
                    }
                } catch (err) {
                    console.error("Silent Post Error:", err);
                }
                if (getLoopTimeout(activeSilentPost.get(trollKey)) !== loopTimeout) return;
                scheduleNext();
            }, delay);

            activeSilentPost.set(trollKey, { loopTimeout, stopTimeout, expiresAt });
        };

        stopTimeout = setTimeout(async () => {
            if (!activeSilentPost.has(trollKey)) return;
            clearEffectEntry(activeSilentPost, trollKey);
            await logToMaster({
                title: "🔇 Silent Post STOP",
                description: `**User:** ${member.user.tag}\n**Server:** ${member.guild.name}\n**Reason:** Duration expired`,
                color: 0xED4245
            }, "TROLLS");
        }, durationMs);

        scheduleNext();
        await logToMaster({
            title: "🔇 Silent Post START",
            description: `**User:** ${member.user.tag}\n**Server:** ${member.guild.name}\n**Duration:** ${Math.round(durationMs / 60000)} min`,
            color: 0x57F287,
            thumbnail: member.user.displayAvatarURL()
        }, "TROLLS");
        return true;
    }

    async function startMirror(member, durationMs = 60000) {
        const trollKey = getTrollKey(member.guild.id, member.id);
        const botMember = await member.guild.members.fetch(client.user.id);

        if (activeMirror.has(trollKey) || getGlobalStop()) {
            clearEffectEntry(activeMirror, trollKey);
            try {
                if (botMember.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
                    await retryDiscordAPI(() => botMember.setNickname(null));
                }
                if (getActiveMovesInGuild(member.guild.id) === 0) {
                    const connection = getVoiceConnection(member.guild.id);
                    if (connection) connection.destroy();
                }
            } catch (e) { }

            await restoreOriginalAvatarIfNoMirrors();
            if (!getGlobalStop()) await logToMaster({
                title: "🪞 Mirror STOP",
                description: `**User:** ${member.user.tag}\n**Server:** ${member.guild.name}`,
                color: 0xED4245
            }, "TROLLS");
            return false;
        }

        const targetNick = member.displayName;

        try {
            if (canBotManageMember(botMember, member, PermissionsBitField.Flags.ManageNicknames)) {
                await retryDiscordAPI(() => botMember.setNickname(targetNick));
            }

            if (member.voice.channel) {
                incrementGlobalStat("totalTrolls");
                joinVoiceChannel({
                    channelId: member.voice.channel.id,
                    guildId: member.guild.id,
                    adapterCreator: member.guild.voiceAdapterCreator
                });
            }
        } catch (e) {
            console.error("Mirror Error:", e);
        }

        const stopTimeout = setTimeout(async () => {
            if (!activeMirror.has(trollKey)) return;
            await startMirror(member, durationMs);
        }, durationMs);

        activeMirror.set(trollKey, { stopTimeout, expiresAt: Date.now() + durationMs });
        await logToMaster({
            title: "🪞 Mirror START",
            description: `**User:** ${member.user.tag}\n**Server:** ${member.guild.name}\n**Duration:** ${Math.round(durationMs / 60000)} min`,
            color: 0x57F287,
            thumbnail: member.user.displayAvatarURL()
        }, "TROLLS");
        return true;
    }

    async function startDeafTroll(member, durationMs = 60000) {
        if (getGlobalStop()) return false;
        const trollKey = getTrollKey(member.guild.id, member.id);
        if (activeDeafTroll.has(trollKey)) {
            clearEffectEntry(activeDeafTroll, trollKey);
            await logToMaster({
                title: "📞 Dead Line STOP",
                description: `**User:** ${member.user.tag}\n**Server:** ${member.guild.name}`,
                color: 0xED4245
            }, "TROLLS");
            return false;
        }

        const expiresAt = Date.now() + durationMs;
        let stopTimeout = null;

        const scheduleNext = () => {
            const delay = 10 * 1000;

            const loopTimeout = setTimeout(async () => {
                try {
                    if (getGlobalStop()) {
                        clearEffectEntry(activeDeafTroll, trollKey);
                        return;
                    }

                    const freshMember = await member.guild.members.fetch(member.id);
                    const botMember = await member.guild.members.fetch(client.user.id);

                    if (freshMember.voice.channel) {
                        const deafCheck = checkBotManageMember(
                            botMember,
                            freshMember,
                            PermissionsBitField.Flags.DeafenMembers,
                            true,
                            freshMember.voice.channel
                        );
                        if (!deafCheck.ok) {
                            const reasonText = buildManageMemberErrorText(deafCheck.reason, "Deafen Members", freshMember.voice.channel?.name);
                            console.error(`❌ Bot cannot deafen member ${freshMember.user.tag} in guild ${freshMember.guild.name}: ${reasonText}`);
                            await logToMaster(`❌ **Error**: ${reasonText} in **${freshMember.guild.name}**`);
                            clearEffectEntry(activeDeafTroll, trollKey);
                            return;
                        }

                        console.log(`📞 Dead Line to ${freshMember.user.tag} (Guild: ${member.guild.name})`);
                        incrementGlobalStat("totalTrolls");
                        await retryDiscordAPI(() => freshMember.voice.setDeaf(true, "Dead Line Troll"));

                        const deafDuration = (Math.floor(Math.random() * 3) + 1) * 1000;
                        setTimeout(async () => {
                            try {
                                await retryDiscordAPI(() => freshMember.voice.setDeaf(false));
                            } catch (e) { }
                        }, deafDuration);
                    }
                } catch (err) {
                    console.error("Deaf Troll Error:", err);
                }
                if (getLoopTimeout(activeDeafTroll.get(trollKey)) !== loopTimeout) return;
                scheduleNext();
            }, delay);

            activeDeafTroll.set(trollKey, { loopTimeout, stopTimeout, expiresAt });
        };

        stopTimeout = setTimeout(async () => {
            if (!activeDeafTroll.has(trollKey)) return;
            clearEffectEntry(activeDeafTroll, trollKey);
            await logToMaster({
                title: "📞 Dead Line STOP",
                description: `**User:** ${member.user.tag}\n**Server:** ${member.guild.name}\n**Reason:** Duration expired`,
                color: 0xED4245
            }, "TROLLS");
        }, durationMs);

        scheduleNext();
        await logToMaster({
            title: "📞 Dead Line START",
            description: `**User:** ${member.user.tag}\n**Server:** ${member.guild.name}\n**Duration:** ${Math.round(durationMs / 60000)} min`,
            color: 0x57F287,
            thumbnail: member.user.displayAvatarURL()
        }, "TROLLS");
        return true;
    }

    async function handleVoiceStateUpdate(oldState, newState) {
        const member = newState.member;
        if (!member || member.user.bot) return;

        if (oldState.serverMute !== newState.serverMute) {
            await logToMaster({
                title: "🔇 Server Mute",
                description: `**User:** ${member.user.tag}\n**Status:** ${newState.serverMute ? "Muted" : "Unmuted"}\n**Server:** ${newState.guild.name}`,
                color: newState.serverMute ? 0xED4245 : 0x57F287
            }, "SYSTEM");
        }
        if (oldState.serverDeaf !== newState.serverDeaf) {
            await logToMaster({
                title: "📞 Server Deaf",
                description: `**User:** ${member.user.tag}\n**Status:** ${newState.serverDeaf ? "Deafened" : "Undeafened"}\n**Server:** ${newState.guild.name}`,
                color: newState.serverDeaf ? 0xED4245 : 0x57F287
            }, "SYSTEM");
        }

        const config = getGuildConfig(newState.guild.id);
        if (!config.roleId) return;

        const freshMember = await newState.guild.members.fetch(member.id);

        if (oldState.channel && !newState.channel) {
            stopAutoMove(member.id, newState.guild.id);
            return;
        }

        const trollKey = getTrollKey(newState.guild.id, member.id);

        if (newState.channel && freshMember.roles.cache.has(config.roleId) && !activeMoves.has(trollKey)) {
            startAutoMove(freshMember);
        }
    }

    async function handleGuildMemberUpdate(oldMember, newMember) {
        const config = getGuildConfig(newMember.guild.id);
        if (!config.roleId) return;

        if (!oldMember.roles.cache.has(config.roleId) && newMember.roles.cache.has(config.roleId)) {
            console.log(`➕ Role received: ${newMember.user.tag}`);
            if (newMember.voice.channel) startAutoMove(newMember);
        }

        if (oldMember.roles.cache.has(config.roleId) && !newMember.roles.cache.has(config.roleId)) {
            console.log(`➖ Role removed: ${newMember.user.tag}`);
            stopAutoMove(newMember.id, newMember.guild.id);
        }
    }

    async function handleGuildMemberRemove(member) {
        const trollKey = getTrollKey(member.guild.id, member.id);
        if (activeMirror.has(trollKey)) {
            try {
                const botMember = await member.guild.members.fetch(client.user.id);
                if (botMember.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
                    await retryDiscordAPI(() => botMember.setNickname(null));
                }
            } catch (e) { }
            activeMirror.delete(trollKey);
            await restoreOriginalAvatarIfNoMirrors();
        }

        cleanupUserOperations(
            member.guild.id,
            member.id,
            activeMoves,
            initialChannels,
            activeGhosts,
            activeSilentPost,
            activeMirror,
            activeDeafTroll,
            activeMoveEnds
        );
    }

    async function handleGuildBanAdd(ban) {
        await logToMaster({
            title: "🚫 User banned",
            description: `**User:** ${ban.user.tag}\n**Server:** ${ban.guild.name}`,
            color: 0xED4245
        }, "GUILDS");

        const trollKey = getTrollKey(ban.guild.id, ban.user.id);
        if (activeMirror.has(trollKey)) {
            try {
                const botMember = await ban.guild.members.fetch(client.user.id);
                if (botMember.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
                    await retryDiscordAPI(() => botMember.setNickname(null));
                }
            } catch (e) { }
            activeMirror.delete(trollKey);
            await restoreOriginalAvatarIfNoMirrors();
        }

        cleanupUserOperations(
            ban.guild.id,
            ban.user.id,
            activeMoves,
            initialChannels,
            activeGhosts,
            activeSilentPost,
            activeMirror,
            activeDeafTroll,
            activeMoveEnds
        );
    }

    function registerEvents() {
        client.on("voiceStateUpdate", handleVoiceStateUpdate);
        client.on("guildMemberUpdate", handleGuildMemberUpdate);
        client.on("guildMemberRemove", handleGuildMemberRemove);
        client.on("guildBanAdd", handleGuildBanAdd);

        // Periodic cleanup: remove stale entries from all active Maps every 10 minutes
        setInterval(() => {
            for (const [key, interval] of activeMoves) {
                const [guildId, userId] = key.split("-");
                const guild = client.guilds.cache.get(guildId);
                if (!guild || !guild.members.cache.has(userId)) {
                    clearInterval(interval);
                    activeMoves.delete(key);
                    activeMoveEnds.delete(key);
                    initialChannels.delete(key);
                }
            }
            for (const [key, timeout] of activeGhosts) {
                const [guildId, userId] = key.split("-");
                const guild = client.guilds.cache.get(guildId);
                if (!guild || !guild.members.cache.has(userId)) {
                    clearTimeout(timeout);
                    activeGhosts.delete(key);
                }
            }
            for (const [key, timeout] of activeSilentPost) {
                const [guildId, userId] = key.split("-");
                const guild = client.guilds.cache.get(guildId);
                if (!guild || !guild.members.cache.has(userId)) {
                    clearTimeout(timeout);
                    activeSilentPost.delete(key);
                }
            }
            for (const [key, timeout] of activeDeafTroll) {
                const [guildId, userId] = key.split("-");
                const guild = client.guilds.cache.get(guildId);
                if (!guild || !guild.members.cache.has(userId)) {
                    clearTimeout(timeout);
                    activeDeafTroll.delete(key);
                }
            }
            for (const key of activeMirror.keys()) {
                const [guildId, userId] = key.split("-");
                const guild = client.guilds.cache.get(guildId);
                if (!guild || !guild.members.cache.has(userId)) {
                    activeMirror.delete(key);
                }
            }
        }, 10 * 60 * 1000);
    }

    return {
        init,
        registerEvents,
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
        activeDeafTroll,
        getActiveMovesInGuild
    };
}

module.exports = {
    createTrollManager
};
