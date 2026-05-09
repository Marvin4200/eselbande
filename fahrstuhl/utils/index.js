const { MessageFlags } = require("discord.js");

function normalizeReplyOptions(options) {
    if (!options || typeof options !== "object") return options;
    const normalized = { ...options };

    if (Array.isArray(normalized.flags)) {
        normalized.flags = normalized.flags.reduce((acc, flag) => acc | flag, 0);
    }

    return normalized;
}

async function safeReply(interaction, options) {
    try {
        const normalizedOptions = normalizeReplyOptions(options);
        if (interaction.deferred || interaction.replied) {
            return await interaction.editReply(normalizedOptions);
        } else {
            return await interaction.reply(normalizedOptions);
        }
    } catch (err) {
        if (err.code !== 10062 && err.code !== 40060) {
            console.error("Reply Error:", err);
        }
        return null;
    }
}

async function retryDiscordAPI(func, maxRetries = 3, baseDelay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await func();
        } catch (error) {
            if (attempt === maxRetries) throw error;
            
            const delay = baseDelay * Math.pow(2, attempt - 1);
            console.warn(`API Call failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms:`, error.message);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

function getTrollKey(guildId, userId) {
    return `${guildId}-${userId}`;
}

function getActiveMovesInGuild(guildId, activeMoves) {
    let count = 0;
    for (const key of activeMoves.keys()) {
        if (key.startsWith(`${guildId}-`)) count++;
    }
    return count;
}

function clearStoredTimeout(entry) {
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
}

function cleanupUserOperations(guildId, userId, activeMoves, initialChannels, activeGhosts, activeSilentPost, activeMirror, activeDeafTroll, activeMoveEnds = null) {
    const trollKey = getTrollKey(guildId, userId);
    
    if (activeMoves.has(trollKey)) {
        clearInterval(activeMoves.get(trollKey));
        activeMoves.delete(trollKey);
        initialChannels.delete(trollKey);
    }
    if (activeMoveEnds) {
        activeMoveEnds.delete(trollKey);
    }
    
    if (activeGhosts.has(trollKey)) {
        clearStoredTimeout(activeGhosts.get(trollKey));
        activeGhosts.delete(trollKey);
    }
    
    if (activeSilentPost.has(trollKey)) {
        clearStoredTimeout(activeSilentPost.get(trollKey));
        activeSilentPost.delete(trollKey);
    }
    
    if (activeMirror.has(trollKey)) {
        clearStoredTimeout(activeMirror.get(trollKey));
        activeMirror.delete(trollKey);
    }
    
    if (activeDeafTroll.has(trollKey)) {
        clearStoredTimeout(activeDeafTroll.get(trollKey));
        activeDeafTroll.delete(trollKey);
    }
}

function isUserImmune(member, config = {}, userStats = {}) {
    if (userStats.activeShieldExpiry && userStats.activeShieldExpiry > Date.now()) {
        return { immune: true, reason: "SHIELD", expiry: userStats.activeShieldExpiry };
    }

    return { immune: false };
}

function checkBotManageMember(botMember, targetMember, requiredPermission, checkHierarchy = true, channel = null) {
    const permissions = channel ? botMember.permissionsIn(channel) : botMember.permissions;

    if (requiredPermission && !permissions.has(requiredPermission)) {
        return { ok: false, reason: "MISSING_PERMISSION" };
    }

    if (botMember.id === targetMember.id) return { ok: true };
    if (!checkHierarchy) return { ok: true };

    if (botMember.roles.highest.position <= targetMember.roles.highest.position) {
        return { ok: false, reason: "ROLE_HIERARCHY" };
    }

    return { ok: true };
}

function canBotManageMember(botMember, targetMember, requiredPermission, checkHierarchy = true, channel = null) {
    return checkBotManageMember(botMember, targetMember, requiredPermission, checkHierarchy, channel).ok;
}

module.exports = {
    safeReply,
    retryDiscordAPI,
    getTrollKey,
    getActiveMovesInGuild,
    clearStoredTimeout,
    cleanupUserOperations,
    isUserImmune,
    canBotManageMember,
    checkBotManageMember,
    errorMessageBuilder: require('./errorMessageBuilder')
};
