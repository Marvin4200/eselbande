/**
 * Fahrstuhl Bot - HTTP API Server
 * Erlaubt dem Dashboard, Bot-Commands auszuführen
 * 
 * Läuft auf Port 3002
 * Kommuniziert mit Discord Bot auf Port 3001
 */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField, StringSelectMenuBuilder } = require('discord.js');
const blacklistManager = require('../utils/blacklistManager');
const flagsManager = require('../utils/flagsManager');
const webhooksManager = require('../utils/webhooksManager');
const analyticsDatabase = require('../utils/analyticsDatabase');
const APIResponse = require('./apiResponse');
const InputValidator = require('../utils/inputValidator');
const { getUserStats, setUserStats } = require('../utils/config');
const { sendServerLog } = require('../utils/serverLogger');
const dashboardAudit = require('../utils/dashboardAudit');
const monetizationStore = require('../utils/monetizationStore');
const { auditNginxSitesEnabled } = require('../utils/serverConfigAudit');
const { getPool } = require('../utils/db');
const ticketManager = require('../utils/ticketManager');
const ticketStore = require('../utils/ticketStore');
const { parseBoolean } = require('../utils/valueParsers');

const SERVER_MODULES = [
    { key: 'moderation', label: 'Moderation', icon: '🛡️', description: 'Warns, timeouts, kicks, bans, unbans and case history.', defaultEnabled: true },
    { key: 'automod', label: 'AutoMod', icon: '🚨', description: 'Block invites, suspicious links and custom blocked words.', defaultEnabled: false },
    { key: 'leveling', label: 'Leveling', icon: '📈', description: 'XP, ranks, leaderboards and level roles.', defaultEnabled: false },
    { key: 'welcome', label: 'Welcome', icon: '👋', description: 'Welcome messages, goodbye messages and autoroles.', defaultEnabled: false },
    { key: 'reactionRoles', label: 'Reaction Roles', icon: '🎭', description: 'Self-assign roles with buttons, menus or reactions.', defaultEnabled: false },
    { key: 'tickets', label: 'Tickets', icon: '🎫', description: 'Support ticket panels, staff roles and transcripts.', defaultEnabled: false },
    { key: 'rewards', label: 'Rewards', icon: '🎁', description: 'Daily, vote, voice and promo rewards.', defaultEnabled: true },
    { key: 'fun', label: 'Fun', icon: '🚀', description: 'Troll commands, shields and fun interactions.', defaultEnabled: true },
    { key: 'logging', label: 'Logging', icon: '🧾', description: 'Moderation and server event logs.', defaultEnabled: false },
    { key: 'tempVoice', label: 'Temp Voice', icon: '🔊', description: 'Auto-create temporary voice channels when users join a hub channel.', defaultEnabled: false },
    { key: 'social', label: 'Social Alerts', icon: '📣', description: 'Post updates when creators go live or publish new content.', defaultEnabled: false },
];

const DASHBOARD_PERMISSION_MODULES = [
    { key: 'welcome', label: 'Welcome' },
    { key: 'moderation', label: 'Moderation' },
    { key: 'logging', label: 'Logging' },
    { key: 'tickets', label: 'Tickets' },
    { key: 'automod', label: 'AutoMod' },
    { key: 'leveling', label: 'Leveling' },
    { key: 'reactionRoles', label: 'Reaction Roles' },
    { key: 'social', label: 'Social Alerts' },
    { key: 'tempVoice', label: 'Temp Voice' },
    { key: 'stats', label: 'Stats' },
];

const DASHBOARD_PERMISSION_MODULE_KEYS = new Set(DASHBOARD_PERMISSION_MODULES.map((module) => module.key));

/**
 * Feature limits per plan tier (soft gates — enforced gradually).
 * These are the canonical limits referenced by the dashboard UI and API.
 */
const FEATURE_LIMITS = {
    free: {
        planName: 'Free',
        reactionRolePanels: 3,
        ticketPanels: 1,
        socialFeeds: 0,
        automodRules: 5,
        levelRewards: 5,
        logGroups: 3,
        welcomeMessages: 1,
    },
    basic: {
        planName: 'Premium',
        reactionRolePanels: 10,
        ticketPanels: 3,
        socialFeeds: 3,
        automodRules: 20,
        levelRewards: 20,
        logGroups: 10,
        welcomeMessages: 3,
    },
    pro: {
        planName: 'Pro',
        reactionRolePanels: -1,   // unlimited
        ticketPanels: -1,
        socialFeeds: 10,
        automodRules: -1,
        levelRewards: -1,
        logGroups: -1,
        welcomeMessages: -1,
    },
};

function normalizeTicketTypes(rawTypes = []) {
    const source = Array.isArray(rawTypes) ? rawTypes : [];
    const fallback = [
        { key: 'support', label: 'Support', description: 'General help from the team.', priority: 'normal' },
        { key: 'report', label: 'Report', description: 'Report a member or incident.', priority: 'high' },
        { key: 'appeal', label: 'Appeal', description: 'Appeal a moderation action.', priority: 'normal' },
    ];
    const rows = (source.length ? source : fallback)
        .map((type, index) => {
            const label = String(type?.label || '').trim().slice(0, 80);
            const key = String(type?.key || label || `type-${index + 1}`).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
            return {
                key: key || `type-${index + 1}`,
                label: label || `Type ${index + 1}`,
                description: String(type?.description || '').trim().slice(0, 100),
                priority: ['low', 'normal', 'high'].includes(type?.priority) ? type.priority : 'normal',
            };
        })
        .filter(type => type.label)
        .slice(0, 5);
    return rows.length ? rows : fallback;
}

function normalizeTicketSlaMinutes(value, fallback = 240) {
    const minutes = Number(value);
    if (!Number.isFinite(minutes)) return fallback;
    return Math.max(0, Math.min(10080, Math.round(minutes)));
}

function discordImageUrl(value) {
    const url = String(value || '').trim();
    return /^https?:\/\//i.test(url) ? url.slice(0, 500) : '';
}

function dashboardImageValue(value, maxLength = 750000) {
    const raw = String(value || '').trim();
    if (/^https?:\/\//i.test(raw)) return raw.slice(0, 500);
    if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(raw)) return raw.slice(0, maxLength);
    return '';
}

function verificationButtonStyle(value) {
    const style = String(value || 'success').toLowerCase();
    return ['primary', 'secondary', 'success', 'danger'].includes(style) ? style : 'success';
}

function dashboardBoolean(value) {
    return parseBoolean(value, false);
}

function booleanWithDefault(value, fallback = false) {
    return parseBoolean(value, fallback);
}

function normalizeDashboardModuleRoleMap(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const normalized = {};
    for (const module of DASHBOARD_PERMISSION_MODULES) {
        const roleIds = Array.isArray(source[module.key]) ? source[module.key] : [];
        normalized[module.key] = [...new Set(roleIds
            .map((roleId) => String(roleId || '').trim())
            .filter(Boolean))];
    }
    return normalized;
}

function normalizeDashboardAccessConfig(config = {}) {
    const dashboardAccess = config?.dashboardAccess && typeof config.dashboardAccess === 'object'
        ? config.dashboardAccess
        : {};
    const dashboardPermissions = config?.dashboardPermissions && typeof config.dashboardPermissions === 'object'
        ? config.dashboardPermissions
        : {};
    const moduleRolesSource = dashboardAccess.moduleRoles && typeof dashboardAccess.moduleRoles === 'object'
        ? dashboardAccess.moduleRoles
        : (dashboardPermissions.moduleRoles && typeof dashboardPermissions.moduleRoles === 'object'
            ? dashboardPermissions.moduleRoles
            : {});
    return {
        moduleRoles: normalizeDashboardModuleRoleMap(moduleRolesSource),
    };
}

function resolveDashboardModuleKeyFromRequest(req, explicitModuleKey = null) {
    const direct = String(explicitModuleKey || '').trim();
    if (DASHBOARD_PERMISSION_MODULE_KEYS.has(direct)) return direct;

    const pathname = String(req?.route?.path || req?.path || req?.originalUrl || '').toLowerCase();
    if (!pathname) return null;

    if (pathname.includes('/modules')) return 'stats';
    if (pathname.includes('/welcome')) return 'welcome';
    if (pathname.includes('/moderation') || pathname.includes('/mod-cases')) return 'moderation';
    if (pathname.includes('/logging')) return 'logging';
    if (pathname.includes('/tickets')) return 'tickets';
    if (pathname.includes('/automod')) return 'automod';
    if (pathname.includes('/leveling')) return 'leveling';
    if (pathname.includes('/reaction-roles')) return 'reactionRoles';
    if (pathname.includes('/social')) return 'social';
    if (pathname.includes('/temp-voice')) return 'tempVoice';
    return null;
}

function normalizeDashboardBasePath() {
    const raw = String(process.env.DASHBOARD_BASE_URL || '/fahrstuhl').trim();
    const trimmed = raw.replace(/^\/+|\/+$/g, '');
    return trimmed ? `/${trimmed}` : '';
}

function buildDashboardPublicBaseUrl() {
    const raw = String(process.env.DASHBOARD_PUBLIC_URL || process.env.DASHBOARD_URL || 'https://eselbande.com/fahrstuhl').trim();
    const basePath = normalizeDashboardBasePath();
    try {
        const parsed = new URL(raw);
        let pathname = parsed.pathname.replace(/\/+$/g, '');
        if (!pathname || pathname === '/') {
            pathname = basePath || '/fahrstuhl';
        }
        return `${parsed.origin}${pathname}`;
    } catch (_error) {
        const sanitized = raw.replace(/\/+$/g, '');
        if (/^https?:\/\//i.test(sanitized)) return sanitized;
        const localPath = sanitized.startsWith('/') ? sanitized : `/${sanitized}`;
        if (localPath === '/' || localPath === '') {
            return basePath || '/fahrstuhl';
        }
        return localPath;
    }
}

function buildDashboardPageLink(page, params = {}) {
    const pageName = String(page || 'portal').replace(/[^a-z0-9_-]/gi, '');
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        query.set(key, String(value));
    });
    const queryString = query.toString();
    return `${buildDashboardPublicBaseUrl()}/pages/${pageName}.php${queryString ? `?${queryString}` : ''}`;
}

async function fetchGuildChannel(guild, channelId) {
    const id = String(channelId || '').trim();
    if (!guild || !id) return null;
    return guild.channels.cache.get(id) || await guild.channels.fetch(id).catch(() => null);
}

async function fetchGuildRole(guild, roleId) {
    const id = String(roleId || '').trim();
    if (!guild || !id) return null;
    return guild.roles.cache.get(id) || await guild.roles.fetch(id).catch(() => null);
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
    const label = String(template || 'Verifiziert: {count}').replaceAll('{count}', String(safeCount)).trim();
    return (label || `Verifiziert: ${safeCount}`).slice(0, 80);
}

function normalizeEmbedFields(value) {
    try {
        const parsed = Array.isArray(value) ? value : JSON.parse(String(value || '[]'));
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map(field => ({
                name: String(field?.name || '').trim().slice(0, 256),
                value: String(field?.value || '').trim().slice(0, 1024),
            }))
            .filter(field => field.name && field.value)
            .slice(0, 10);
    } catch (error) {
        return [];
    }
}

function buildModuleConfig(config = {}) {
    const saved = config.modules && typeof config.modules === 'object' ? config.modules : {};
    return SERVER_MODULES.map((module) => ({
        ...module,
        enabled: booleanWithDefault(saved[module.key], !!module.defaultEnabled),
    }));
}

function normalizeReactionRoleRows(rows = []) {
    if (!Array.isArray(rows)) return [];
    const seen = new Set();
    return rows
        .map(row => ({
            roleId: String(row?.roleId || '').trim(),
            label: String(row?.label || '').trim().slice(0, 80),
            emoji: String(row?.emoji || '').trim().slice(0, 32),
        }))
        .filter(row => {
            if (!row.roleId || seen.has(row.roleId)) return false;
            seen.add(row.roleId);
            return true;
        })
        .slice(0, 25);
}

function normalizeReactionRolePanel(panel = {}, fallback = {}) {
    const id = String(panel?.id || fallback.id || `panel-${Date.now().toString(36)}`).trim().slice(0, 40);
    const rawMode = panel?.mode || fallback.mode;
    const mode = rawMode === 'select' || rawMode === 'menu' ? 'select' : 'buttons';
    const messageId = panel?.messageId || panel?.lastPanelMessageId || fallback.messageId || fallback.lastPanelMessageId || null;
    const channelId = panel?.channelId || fallback.channelId || null;
    return {
        id,
        panelId: id,
        channelId,
        title: String(panel?.title || fallback.title || 'Choose your roles').slice(0, 120),
        description: String(panel?.description || fallback.description || 'Use the controls below to add or remove roles.').slice(0, 1000),
        mode,
        exclusive: booleanWithDefault(panel?.exclusive, booleanWithDefault(fallback.exclusive, false)),
        thumbnailUrl: discordImageUrl(panel?.thumbnailUrl || fallback.thumbnailUrl || ''),
        imageUrl: discordImageUrl(panel?.imageUrl || fallback.imageUrl || ''),
        footerText: String(panel?.footerText || fallback.footerText || '').trim().slice(0, 2048),
        authorText: String(panel?.authorText || fallback.authorText || '').trim().slice(0, 256),
        roles: normalizeReactionRoleRows(panel?.roles || fallback.roles || []),
        messageId,
        lastPanelMessageId: messageId,
        lastPanelChannelId: panel?.lastPanelChannelId || fallback.lastPanelChannelId || channelId,
    };
}

function normalizeReactionRolePanels(reactionRoles = {}) {
    const source = reactionRoles && typeof reactionRoles === 'object' ? reactionRoles : {};
    const rawPanels = Array.isArray(source.panels) ? source.panels : [];
    const panels = rawPanels
        .map(panel => normalizeReactionRolePanel(panel))
        .filter(panel => panel.id);

    if (!panels.length && (source.roles || source.channelId || source.title || source.description)) {
        panels.push(normalizeReactionRolePanel({
            id: source.panelId || 'default',
            channelId: source.channelId || null,
            title: source.title,
            description: source.description,
            mode: source.mode,
            roles: source.roles || [],
            lastPanelMessageId: source.lastPanelMessageId || null,
            lastPanelChannelId: source.lastPanelChannelId || null,
        }));
    }

    if (!panels.length) {
        panels.push(normalizeReactionRolePanel({ id: 'default' }));
    }

    const seen = new Set();
    return panels.filter(panel => {
        if (seen.has(panel.id)) return false;
        seen.add(panel.id);
        return true;
    }).slice(0, 25);
}

const LOGGING_EVENTS = [
    { key: 'memberJoin', label: 'Member Joins', description: 'Log when members join the server.' },
    { key: 'memberLeave', label: 'Member Leaves', description: 'Log when members leave the server.' },
    { key: 'messageDelete', label: 'Message Deletes', description: 'Log when messages are deleted.' },
    { key: 'messageUpdate', label: 'Message Edits', description: 'Log when messages are edited.' },
    { key: 'memberBan', label: 'Member Bans', description: 'Log when members are banned.' },
    { key: 'memberUnban', label: 'Member Unbans', description: 'Log when members are unbanned.' },
    { key: 'roleCreate', label: 'Role Creates', description: 'Log when roles are created.' },
    { key: 'roleDelete', label: 'Role Deletes', description: 'Log when roles are deleted.' },
    { key: 'roleUpdate', label: 'Role Updates', description: 'Log role name, color and permission changes.' },
    { key: 'channelCreate', label: 'Channel Creates', description: 'Log when channels are created.' },
    { key: 'channelDelete', label: 'Channel Deletes', description: 'Log when channels are deleted.' },
    { key: 'channelUpdate', label: 'Channel Updates', description: 'Log channel name, topic and permission changes.' },
    { key: 'inviteCreate', label: 'Invite Creates', description: 'Log when invite links are created.' },
    { key: 'inviteDelete', label: 'Invite Deletes', description: 'Log when invite links are deleted.' },
    { key: 'voiceState', label: 'Voice Activity', description: 'Log voice joins, leaves and moves.' },
    { key: 'moderation', label: 'Moderation Actions', description: 'Log warns, timeouts, timeout clears, kicks, bans and unbans.' },
    { key: 'automod', label: 'AutoMod Hits', description: 'Log blocked messages and AutoMod cases.' },
    { key: 'tickets', label: 'Tickets', description: 'Log ticket open and close actions.' },
];

const LOGGING_GROUP_DEFINITIONS = [
    { key: 'member', label: 'Member Logs', description: 'Join, leave, bans and unbans.' },
    { key: 'message', label: 'Message Logs', description: 'Deleted and edited messages.' },
    { key: 'moderation', label: 'Moderation Logs', description: 'Commands like warn, timeout, kick and ban.' },
    { key: 'automod', label: 'AutoMod Logs', description: 'AutoMod triggers and rule hits.' },
    { key: 'tickets', label: 'Ticket Logs', description: 'Ticket lifecycle events.' },
    { key: 'voice', label: 'Voice Logs', description: 'Voice join, leave and move activity.' },
    { key: 'structure', label: 'Role/Channel Logs', description: 'Role, channel and invite changes.' },
];

const LOGGING_EVENT_GROUP_MAP = {
    memberJoin: 'member',
    memberLeave: 'member',
    memberBan: 'member',
    memberUnban: 'member',
    messageDelete: 'message',
    messageUpdate: 'message',
    moderation: 'moderation',
    automod: 'automod',
    tickets: 'tickets',
    voiceState: 'voice',
    roleCreate: 'structure',
    roleDelete: 'structure',
    roleUpdate: 'structure',
    channelCreate: 'structure',
    channelDelete: 'structure',
    channelUpdate: 'structure',
    inviteCreate: 'structure',
    inviteDelete: 'structure',
};

function loggingGroupKey(groupKey) {
    return `group:${String(groupKey || '').trim().toLowerCase()}`;
}

function normalizeLoggingEventChannels(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const allowedEventKeys = new Set(LOGGING_EVENTS.map(event => event.key));
    const allowedGroupKeys = new Set(LOGGING_GROUP_DEFINITIONS.map(group => group.key));
    const normalized = {};
    for (const [rawKey, rawChannelId] of Object.entries(source)) {
        const key = String(rawKey || '').trim();
        const channelId = String(rawChannelId || '').trim();
        if (!key || !channelId) continue;
        if (allowedEventKeys.has(key)) {
            normalized[key] = channelId;
            continue;
        }
        if (key.startsWith('group:')) {
            const groupName = key.slice(6).trim().toLowerCase();
            if (allowedGroupKeys.has(groupName)) {
                normalized[loggingGroupKey(groupName)] = channelId;
            }
        }
    }
    return normalized;
}

function loggingGroupChannels(eventChannels = {}) {
    const source = eventChannels && typeof eventChannels === 'object' ? eventChannels : {};
    const groups = {};
    for (const group of LOGGING_GROUP_DEFINITIONS) {
        groups[group.key] = source[loggingGroupKey(group.key)] || null;
    }
    return groups;
}

function normalizeLoggingEvents(events = {}) {
    const source = events && typeof events === 'object' ? events : {};
    const asSet = Array.isArray(source) ? new Set(source.map(key => String(key || '').trim())) : null;
    return LOGGING_EVENTS.reduce((acc, event) => {
        if (asSet) {
            acc[event.key] = asSet.has(event.key);
        } else {
            acc[event.key] = booleanWithDefault(source[event.key], true);
        }
        return acc;
    }, {});
}

function clampNumber(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

function normalizeAutoModSettings(automod = {}) {
    const rawRuleActions = automod.ruleActions && typeof automod.ruleActions === 'object' ? automod.ruleActions : {};
    const normalizeRuleAction = (value) => {
        const allowed = ['fallback', 'none', 'delete', 'warn', 'timeout', 'kick', 'ban'];
        const action = String(value || 'fallback').trim().toLowerCase();
        return allowed.includes(action) ? action : 'fallback';
    };
    return {
        blockInvites: booleanWithDefault(automod.blockInvites, true),
        blockLinks: dashboardBoolean(automod.blockLinks),
        allowedLinks: Array.isArray(automod.allowedLinks) ? automod.allowedLinks : [],
        blockMassMentions: booleanWithDefault(automod.blockMassMentions, true),
        blockCaps: dashboardBoolean(automod.blockCaps),
        blockSpam: booleanWithDefault(automod.blockSpam, true),
        blockRepeatedText: booleanWithDefault(automod.blockRepeatedText, true),
        deleteMessage: booleanWithDefault(automod.deleteMessage, true),
        warnUser: booleanWithDefault(automod.warnUser, true),
        exemptAdmins: booleanWithDefault(automod.exemptAdmins, true),
        mentionLimit: clampNumber(automod.mentionLimit, 2, 25, 6),
        capsMinLength: clampNumber(automod.capsMinLength, 8, 200, 12),
        capsPercent: clampNumber(automod.capsPercent, 50, 100, 70),
        duplicateThreshold: clampNumber(automod.duplicateThreshold, 2, 10, 4),
        duplicateWindowSeconds: clampNumber(automod.duplicateWindowSeconds, 5, 300, 20),
        autoPunishStrikes: clampNumber(automod.autoPunishStrikes ?? automod.autoTimeoutStrikes, 0, 20, 0),
        timeoutMinutes: clampNumber(automod.timeoutMinutes ?? automod.autoTimeoutMinutes, 1, 40320, 10),
        punishmentAction: ['none', 'timeout', 'kick', 'ban'].includes(automod.punishmentAction) ? automod.punishmentAction : 'timeout',
        punishmentMode: ['fixed', 'escalate'].includes(automod.punishmentMode) ? automod.punishmentMode : 'fixed',
        warnMessage: String(automod.warnMessage ?? 'AutoMod blocked your message: {reason}').slice(0, 180),
        blockedTermsWholeWord: booleanWithDefault(automod.blockedTermsWholeWord, false),
        blockedTermsRegex: booleanWithDefault(automod.blockedTermsRegex, false),
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
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveAutoModRuleActionPreview(automod, ruleType) {
    const action = automod?.ruleActions?.[ruleType];
    if (action && action !== 'fallback') return action;
    if (automod.deleteMessage) return 'delete';
    if (automod.warnUser) return 'warn';
    if ((automod.autoPunishStrikes || 0) > 0 && automod.punishmentAction !== 'none') {
        return automod.punishmentAction || 'timeout';
    }
    return 'none';
}

function extractDashboardMentionCount(content) {
    const text = String(content || '');
    const userMentions = text.match(/<@!?\d+>/g) || [];
    const roleMentions = text.match(/<@&\d+>/g) || [];
    return userMentions.length + roleMentions.length;
}

function findAutoModViolationsPreview(content, automod = {}, options = {}) {
    const text = String(content || '');
    const lower = text.toLowerCase();
    const mentionCount = Number.isFinite(Number(options.mentionCount))
        ? Math.max(0, Number(options.mentionCount))
        : extractDashboardMentionCount(text);
    const violations = [];

    if (automod.blockInvites && /(discord\.gg\/|discord\.com\/invite\/|discordapp\.com\/invite\/)/i.test(text)) {
        violations.push({ type: 'invite', reason: 'Discord invite link', action: resolveAutoModRuleActionPreview(automod, 'invite') });
    }

    if (automod.blockLinks && /https?:\/\/|www\./i.test(text)) {
        const allowedLinks = Array.isArray(automod.allowedLinks) ? automod.allowedLinks : [];
        const isWhitelisted = allowedLinks.some((link) => {
            const cleaned = String(link || '').trim().toLowerCase();
            return cleaned.length > 0 && lower.includes(cleaned);
        });
        if (!isWhitelisted) {
            violations.push({ type: 'link', reason: 'External link', action: resolveAutoModRuleActionPreview(automod, 'link') });
        }
    }

    const blockedTerms = Array.isArray(automod.blockedTerms) ? automod.blockedTerms : [];
    let matchedTerm = null;
    for (const rawTerm of blockedTerms) {
        const cleaned = String(rawTerm || '').trim();
        if (cleaned.length < 2) continue;
        if (automod.blockedTermsRegex) {
            try {
                const regex = new RegExp(cleaned, 'i');
                if (regex.test(text)) {
                    matchedTerm = cleaned;
                    break;
                }
            } catch {
                continue;
            }
            continue;
        }
        if (automod.blockedTermsWholeWord) {
            try {
                const regex = new RegExp(`(^|\\W)${escapeRegex(cleaned)}(\\W|$)`, 'i');
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
    if (matchedTerm) {
        violations.push({ type: 'blocked_term', reason: `Blocked term: ${matchedTerm}`, action: resolveAutoModRuleActionPreview(automod, 'blocked_term') });
    }

    if (automod.blockMassMentions && mentionCount >= automod.mentionLimit) {
        violations.push({ type: 'mass_mentions', reason: `${mentionCount} mentions in one message`, action: resolveAutoModRuleActionPreview(automod, 'mass_mentions') });
    }

    const letters = text.replace(/[^a-zA-ZÄÖÜäöüß]/g, '');
    const uppercase = letters.replace(/[^A-ZÄÖÜ]/g, '');
    const capsPercent = letters.length > 0 ? Math.round((uppercase.length / letters.length) * 100) : 0;
    if (automod.blockCaps && letters.length >= automod.capsMinLength && capsPercent >= automod.capsPercent) {
        violations.push({ type: 'caps', reason: `${capsPercent}% uppercase text`, action: resolveAutoModRuleActionPreview(automod, 'caps') });
    }

    return {
        mentionCount,
        capsPercent,
        violations,
    };
}

async function resolveDashboardMember(guild, req, fallbackUserId = '') {
    const userId = String(fallbackUserId || req.get('x-dashboard-user-id') || '').trim();
    if (!userId) return null;
    return guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
}

function createDashboardTicketInteraction(guild, member) {
    const interaction = {
        guild,
        guildId: guild.id,
        user: member.user,
        member,
        __replyPayload: null,
        isButton: () => false,
        reply: async (payload) => {
            interaction.__replyPayload = payload;
            return payload;
        },
    };
    return interaction;
}

const AUTOMOD_PRESETS = {
    relaxed: {
        blockInvites: true,
        blockLinks: false,
        blockSpam: false,
        blockRepeatedText: false,
        blockMassMentions: false,
        blockCaps: false,
        mentionLimit: 10,
        duplicateThreshold: 6,
        duplicateWindowSeconds: 30,
        capsPercent: 80,
        capsMinLength: 16,
        punishmentMode: 'fixed',
        punishmentAction: 'none',
        autoPunishStrikes: 0,
        timeoutMinutes: 5,
    },
    balanced: {
        blockInvites: true,
        blockLinks: true,
        blockSpam: true,
        blockRepeatedText: false,
        blockMassMentions: true,
        blockCaps: false,
        mentionLimit: 6,
        duplicateThreshold: 4,
        duplicateWindowSeconds: 20,
        capsPercent: 70,
        capsMinLength: 12,
        punishmentMode: 'fixed',
        punishmentAction: 'timeout',
        autoPunishStrikes: 5,
        timeoutMinutes: 10,
    },
    strict: {
        blockInvites: true,
        blockLinks: true,
        blockSpam: true,
        blockRepeatedText: true,
        blockMassMentions: true,
        blockCaps: true,
        mentionLimit: 3,
        duplicateThreshold: 3,
        duplicateWindowSeconds: 15,
        capsPercent: 60,
        capsMinLength: 8,
        punishmentMode: 'fixed',
        punishmentAction: 'timeout',
        autoPunishStrikes: 3,
        timeoutMinutes: 30,
    },
};

// ============ LIVE LOG BUFFER ============
const LOG_BUFFER_SIZE = 300;
const logBuffer = [];
const sseClients = new Set();

// ============ GUILD EVENT SSE ============
const guildEventSseClients = new Set();

// ============ ACTIVITY EVENT SSE (per guild) ============
const activitySseClientsByGuild = new Map();

function parseActivityStreamRequest(req) {
    const match = /^\/guilds\/([^/]+)\/activity\/stream$/.exec(String(req.path || ''));
    if (!match) return null;
    const guildId = decodeURIComponent(match[1] || '').trim();
    const userId = String(req.query.dashboardUserId || '').trim();
    const dashboardModeRaw = String(req.query.dashboardMode || 'admin').trim().toLowerCase();
    const dashboardMode = dashboardModeRaw === 'user' ? 'user' : 'admin';
    const expiresAt = Number(req.query.expiresAt || 0);
    const signature = String(req.query.streamSig || '').trim();
    return { guildId, userId, dashboardMode, expiresAt, signature };
}

function verifyActivityStreamSignature({ guildId, userId, dashboardMode, expiresAt, signature, secret }) {
    if (!secret || !guildId || !userId || !signature) return false;
    if (!Number.isFinite(expiresAt)) return false;
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (expiresAt <= nowSeconds) return false;
    if (expiresAt > nowSeconds + 3600) return false;

    const payload = `${guildId}:${userId}:${dashboardMode}:${expiresAt}`;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (expected.length !== signature.length) return false;

    try {
        return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
        return false;
    }
}
const dataDir = path.join(__dirname, '../data');
const deployStatusFile = path.join(dataDir, 'deploy-status.json');
const systemBackupStatusFile = process.env.BACKUP_STATUS_FILE || '/home/marvin/backups/backup-status.json';
const runningInDocker = fs.existsSync('/.dockerenv');

const OPS_HTTP_DEFAULTS = {
    fahrstuhl: 'http://fahrstuhl-docker:3002/health',
    'dashboard-php': 'http://dashboard-php:8081/health',
    'deploy-webhook': 'http://deploy-webhook:9000/health',
    eseltokens: 'http://eseltokens-docker:3000/eseltokens/api/health',
    'eseltokens-webhook': 'http://eseltokens-webhook-docker:9001/health',
    filehoster: 'http://filehoster:3011/health',
    linkshortener: 'http://linkshortener:3010/health',
    zitatboard: 'http://zitatboard:3013/health',
    statuspage: 'http://statuspage:3012/health',
    team: 'http://team:3014/health',
    esel: 'http://esel:3015/health',
    musikbot: 'http://musikbot-docker:3020/health',
};

function isLoopbackHttpTarget(urlValue) {
    try {
        const parsed = new URL(String(urlValue || ''));
        return ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
    } catch {
        return false;
    }
}

function normalizeOpsHttpTarget(serviceId, urlValue) {
    const value = String(urlValue || '').trim();
    const dockerDefault = OPS_HTTP_DEFAULTS[serviceId] || value;
    if (!value) return dockerDefault;

    if (runningInDocker && isLoopbackHttpTarget(value) && dockerDefault) {
        return dockerDefault;
    }

    if (serviceId === 'eseltokens') {
        try {
            const parsed = new URL(value);
            if (parsed.pathname === '/' || parsed.pathname === '') {
                parsed.pathname = '/eseltokens/api/health';
                parsed.search = '';
                parsed.hash = '';
                return parsed.toString();
            }
        } catch {
            return value;
        }
    }

    return value;
}

function parseHostPort(value, fallbackHost, fallbackPort) {
    const raw = String(value || '').trim();
    if (!raw) return { host: fallbackHost, port: fallbackPort };
    const normalized = raw.includes('://') ? raw : `dummy://${raw}`;
    try {
        const parsed = new URL(normalized);
        return {
            host: parsed.hostname || fallbackHost,
            port: Number(parsed.port || fallbackPort) || fallbackPort,
        };
    } catch {
        const [hostPart, portPart] = raw.split(':');
        const port = Number(portPart || fallbackPort) || fallbackPort;
        return { host: hostPart || fallbackHost, port };
    }
}

async function probeHttpHealth(url, timeoutMs = 5000) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        const latency = Date.now() - startedAt;
        let payload = null;
        try {
            payload = await response.json();
        } catch {
            payload = null;
        }
        return {
            ok: response.ok,
            latency,
            statusCode: response.status,
            payload,
            error: null,
        };
    } catch (error) {
        return {
            ok: false,
            latency: Date.now() - startedAt,
            statusCode: null,
            payload: null,
            error: error.message,
        };
    } finally {
        clearTimeout(timer);
    }
}

function probeTcpPort(host, port, timeoutMs = 3000) {
    return new Promise(resolve => {
        const startedAt = Date.now();
        const socket = new net.Socket();
        let settled = false;

        const finish = (ok, error = null) => {
            if (settled) return;
            settled = true;
            try { socket.destroy(); } catch (_) { }
            resolve({ ok, latency: Date.now() - startedAt, error });
        };

        socket.setTimeout(timeoutMs);
        socket.once('connect', () => finish(true));
        socket.once('timeout', () => finish(false, 'timeout'));
        socket.once('error', err => finish(false, err.message));

        try {
            socket.connect(port, host);
        } catch (err) {
            finish(false, err.message);
        }
    });
}

function extractHealthData(payload) {
    if (!payload || typeof payload !== 'object') return null;
    if (payload.success && payload.data && typeof payload.data === 'object') return payload.data;
    return payload;
}

function splitTtsText(text, maxLen = 180) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return [];

    const chunks = [];
    let remaining = normalized;
    while (remaining.length > maxLen) {
        let cut = remaining.lastIndexOf(' ', maxLen);
        if (cut <= 0) cut = maxLen;
        chunks.push(remaining.slice(0, cut).trim());
        remaining = remaining.slice(cut).trim();
    }
    if (remaining) chunks.push(remaining);
    return chunks.filter(Boolean);
}

async function fetchGoogleTtsMp3Buffer(text, lang = 'de') {
    const chunks = splitTtsText(text, 180);
    if (!chunks.length) throw new Error('No TTS text to synthesize');

    const buffers = [];
    for (const chunk of chunks) {
        const params = new URLSearchParams({
            ie: 'UTF-8',
            q: chunk,
            tl: String(lang || 'de'),
            client: 'tw-ob',
        });
        const url = `https://translate.google.com/translate_tts?${params.toString()}`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; FahrstuhlTTS/1.0)',
                'Accept': 'audio/mpeg,*/*;q=0.9',
            },
        });

        if (!response.ok) {
            throw new Error(`TTS upstream HTTP ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        buffers.push(Buffer.from(arrayBuffer));
    }

    return Buffer.concat(buffers);
}

function readJsonFile(file, fallback = {}) {
    try {
        if (!fs.existsSync(file)) return fallback;
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return fallback;
    }
}

function getPm2Processes() {
    try {
        const raw = execFileSync('pm2', ['jlist'], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
        return JSON.parse(raw).map(proc => ({
            name: proc.name,
            pid: proc.pid,
            status: proc.pm2_env?.status,
            restarts: proc.pm2_env?.restart_time ?? 0,
            uptime: proc.pm2_env?.pm_uptime ?? null,
            memory: proc.monit?.memory ?? 0,
            cpu: proc.monit?.cpu ?? 0,
        }));
    } catch {
        return [];
    }
}

function getGitInfo(repoDir) {
    try {
        const commit = execFileSync('git', ['-C', repoDir, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
        const branch = execFileSync('git', ['-C', repoDir, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
        const subject = execFileSync('git', ['-C', repoDir, 'log', '-1', '--pretty=%s'], { encoding: 'utf8' }).trim();
        return { commit, branch, subject };
    } catch {
        return { commit: null, branch: null, subject: null };
    }
}

function envStatus(name, severity = 'warn') {
    return {
        name,
        ok: !!process.env[name],
        severity,
    };
}

function fileModeStatus(file, label) {
    try {
        const stat = fs.statSync(file);
        const mode = stat.mode & 0o777;
        return {
            name: label,
            ok: mode <= 0o600,
            severity: mode <= 0o600 ? 'info' : 'warn',
            detail: `mode ${mode.toString(8)}`,
        };
    } catch {
        return { name: label, ok: false, severity: 'warn', detail: 'missing' };
    }
}

function escapeSqlLiteral(value) {
    return String(value || '').replace(/'/g, "''");
}

function dashboardActor(req) {
    return req.get('x-dashboard-user') || req.get('x-dashboard-user-id') || 'dashboard';
}

function pushLog(level, args) {
    const line = {
        t: new Date().toISOString(),
        l: level,
        m: args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
    };
    logBuffer.push(line);
    if (logBuffer.length > LOG_BUFFER_SIZE) logBuffer.shift();
    // Also push to global buffer for file fallback
    if (global._logBuffer) {
        const formatted = `[${line.t}] ${line.l.toUpperCase().padEnd(5)} ${line.m}`;
        global._logBuffer.push(formatted);
        if (global._logBuffer.length > 500) global._logBuffer.shift();
    }
    const data = `data: ${JSON.stringify(line)}\n\n`;
    for (const client of sseClients) {
        try { client.write(data); } catch (e) { sseClients.delete(client); }
    }
}

// Export pushLog for use in index.js
global.pushLog = pushLog;

// Intercept console methods ONLY if not already intercepted
if (!global._logIntercepted) {
    ['log', 'info', 'warn', 'error', 'debug'].forEach(lvl => {
        const orig = console[lvl].bind(console);
        console[lvl] = (...args) => { orig(...args); pushLog(lvl, args); };
    });
    global._logIntercepted = true;
}

class BotAPIServer {
    constructor(client, commands, trollManager, options = {}) {
        this.client = client;
        this.commands = commands;
        this.trollManager = trollManager;
        this.healthManager = options.healthManager || null;
        this.backupManager = options.backupManager || null;
        this.app = express();
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(express.json({ limit: '6mb' }));
        
        // CORS für Dashboard
        const corsOrigin = process.env.CORS_ORIGIN || process.env.DASHBOARD_URL || 'http://localhost:3001';
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', corsOrigin);
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Credentials', 'true');
            if (req.method === 'OPTIONS') return res.sendStatus(204);
            next();
        });

        // Auth Middleware for dashboard/internal API access.
        this.app.use((req, res, next) => {
            if (req.path === '/health' || req.path === '/topgg/webhook' || req.path === '/guild/team') return next();

            const expectedToken = process.env.BOT_API_TOKEN;
            const remote = req.ip || req.socket?.remoteAddress || '';
            const isLoopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';

            const streamAuth = parseActivityStreamRequest(req);
            if (streamAuth) {
                if (!expectedToken) {
                    return res.status(503).json(APIResponse.error('BOT_API_TOKEN is not configured', 'BOT_API_TOKEN_MISSING'));
                }
                const validSignature = verifyActivityStreamSignature({
                    guildId: streamAuth.guildId,
                    userId: streamAuth.userId,
                    dashboardMode: streamAuth.dashboardMode,
                    expiresAt: streamAuth.expiresAt,
                    signature: streamAuth.signature,
                    secret: expectedToken,
                });
                if (!validSignature) {
                    return res.status(401).json(APIResponse.unauthorized('Invalid activity stream signature'));
                }
                req.headers['x-dashboard-user-id'] = streamAuth.userId;
                req.headers['x-dashboard-mode'] = streamAuth.dashboardMode;
                return next();
            }

            if (!expectedToken) {
                if (isLoopback && process.env.ALLOW_LOCAL_API_WITHOUT_TOKEN === '1') return next();
                return res.status(503).json(APIResponse.error('BOT_API_TOKEN is not configured', 'BOT_API_TOKEN_MISSING'));
            }

            const auth = req.headers.authorization || '';
            if (auth !== `Bearer ${expectedToken}`) {
                return res.status(401).json(APIResponse.unauthorized('Invalid API token'));
            }

            return next();
        });

        this.app.use((req, res, next) => {
            const shouldAudit = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)
                && req.path !== '/topgg/webhook';

            if (!shouldAudit) return next();

            const startedAt = Date.now();
            res.on('finish', () => {
                dashboardAudit.record({
                    actor: req.get('x-dashboard-user') || 'dashboard',
                    actorId: req.get('x-dashboard-user-id') || null,
                    method: req.method,
                    path: req.path,
                    status: res.statusCode,
                    durationMs: Date.now() - startedAt,
                    ip: req.ip,
                    body: req.body,
                });
            });

            return next();
        });
    }

    setupRoutes() {
        // ============ HEALTH CHECK ============
        this.app.get('/health', (req, res) => {
            res.json(APIResponse.success({
                bot: this.client.user ? this.client.user.username : 'offline',
                uptime: this.client.uptime,
                guilds: this.client.guilds.cache.size
            }, 'Bot is healthy', 'HEALTH_OK'));
        });

        // ============ TEAM PAGE SYNC ============
        this.app.get('/guild/team', async (req, res) => {
            const GUILD_ID = '483321401529597962';

            // Role IDs to always exclude (bots, integrations, @everyone etc.)
            const EXCLUDE_ROLE_NAMES = new Set(['@everyone', 'Mee6', 'Server Booster', 'EselMusic', 'Marvin', 'Carl-bot', '**', 'Mitglied', 'Friend', 'TzatzikiSalat', 'Elendiges Pack']);

            try {
                const guild = this.client.guilds.cache.get(GUILD_ID);
                if (!guild) {
                    return res.status(404).json(APIResponse.error('Guild not found', 'GUILD_NOT_FOUND'));
                }

                await guild.members.fetch();

                // Build a map of roleId → role (exclude managed/bot roles and @everyone)
                const eligibleRoles = new Map();
                for (const [id, role] of guild.roles.cache) {
                    if (role.managed) continue;           // bot-managed roles
                    if (role.name === '@everyone') continue;
                    if (EXCLUDE_ROLE_NAMES.has(role.name)) continue;
                    eligibleRoles.set(id, role);
                }

                const members = [];
                for (const [, member] of guild.members.cache) {
                    if (member.user.bot) continue;

                    // Find the highest-position eligible role the member has
                    let topRole = null;
                    for (const [roleId, role] of eligibleRoles) {
                        if (!member.roles.cache.has(roleId)) continue;
                        if (!topRole || role.position > topRole.position) {
                            topRole = role;
                        }
                    }

                    if (!topRole) continue; // no relevant role → skip
                    if (topRole.position < 38) continue; // below minimum team rank → skip

                    members.push({
                        id: member.user.id,
                        username: member.displayName || member.user.username,
                        avatar: member.user.displayAvatarURL({ size: 128, extension: 'png' }),
                        role: topRole.name,
                        roleColor: topRole.hexColor !== '#000000' ? topRole.hexColor : null,
                        rolePosition: topRole.position,
                        joinedAt: member.joinedAt?.toISOString() || null,
                    });
                }

                // Sort: highest role position first, then by join date
                members.sort((a, b) => {
                    if (b.rolePosition !== a.rolePosition) return b.rolePosition - a.rolePosition;
                    if (a.joinedAt && b.joinedAt) return new Date(a.joinedAt) - new Date(b.joinedAt);
                    return 0;
                });

                res.json(APIResponse.success({ members, guildName: guild.name, memberCount: members.length }, 'Team fetched', 'TEAM_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'TEAM_FETCH_FAILED'));
            }
        });

        this.app.get('/system/status', (req, res) => {
            try {
                const { getCacheStatus } = require('../utils/config');
                const mem = process.memoryUsage();
                const guilds = this.client.guilds.cache;
                const trolls = this.getActiveTrollSummary();

                res.json(APIResponse.success({
                    bot: {
                        username: this.client.user?.username ?? 'offline',
                        id: this.client.user?.id ?? null,
                        ready: !!this.client.user,
                        uptime: this.client.uptime ?? 0,
                        wsPing: this.client.ws?.ping ?? null,
                        guilds: guilds.size,
                        cachedUsers: this.client.users.cache.size,
                        totalMembers: guilds.reduce((sum, guild) => sum + (guild.memberCount || 0), 0),
                    },
                    api: {
                        pid: process.pid,
                        node: process.version,
                        platform: `${os.platform()} ${os.release()}`,
                        uptime: Math.round(process.uptime() * 1000),
                        memory: {
                            rss: mem.rss,
                            heapUsed: mem.heapUsed,
                            heapTotal: mem.heapTotal,
                        },
                    },
                    trolls,
                    cache: getCacheStatus(),
                    pm2: [], // legacy field — PM2 not running in Docker mode
                }, 'System status fetched', 'SYSTEM_STATUS'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'SYSTEM_STATUS_FAILED'));
            }
        });

        this.app.get('/dashboard/cockpit', async (req, res) => {
            try {
                res.json(APIResponse.success(await this.buildCockpitSnapshot(), 'Cockpit fetched', 'COCKPIT_OK'));
            } catch (error) {
                console.error('Cockpit endpoint error:', error);
                res.status(500).json(APIResponse.error(error.message, 'COCKPIT_FAILED'));
            }
        });

        this.app.get('/health/summary', async (req, res) => {
            try {
                const summary = await this.buildHealthSummary();
                res.json(APIResponse.success(summary, 'Health summary fetched', 'HEALTH_SUMMARY'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'HEALTH_SUMMARY_FAILED'));
            }
        });

        this.app.get('/ops/health', async (req, res) => {
            try {
                const snapshot = await this.buildOpsHealthSnapshot();
                res.json(APIResponse.success(snapshot, 'Ops health snapshot fetched', 'OPS_HEALTH_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'OPS_HEALTH_FAILED'));
            }
        });

        this.app.get('/backup/status', (req, res) => {
            try {
                res.json(APIResponse.success(this.getBackupSnapshot(), 'Backup status fetched', 'BACKUP_STATUS'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'BACKUP_STATUS_FAILED'));
            }
        });

        this.app.get('/backup/system/status', (req, res) => {
            try {
                res.json(APIResponse.success(this.getSystemBackupSnapshot(), 'System backup status fetched', 'SYSTEM_BACKUP_STATUS'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'SYSTEM_BACKUP_STATUS_FAILED'));
            }
        });

        this.app.post('/backup/run', async (req, res) => {
            try {
                if (!this.backupManager?.runBackup) {
                    return res.status(503).json(APIResponse.error('Backup manager unavailable', 'BACKUP_UNAVAILABLE', 503));
                }

                await this.backupManager.runBackup();
                res.json(APIResponse.success(this.getBackupSnapshot(), 'Backup run completed', 'BACKUP_RUN'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'BACKUP_RUN_FAILED'));
            }
        });

        this.app.post('/backup/verify', async (req, res) => {
            try {
                if (!this.backupManager?.verifyLatestBackup) {
                    return res.status(503).json(APIResponse.error('Backup verification unavailable', 'BACKUP_VERIFY_UNAVAILABLE', 503));
                }

                const verification = await this.backupManager.verifyLatestBackup();
                res.json(APIResponse.success({
                    verification,
                    backup: this.getBackupSnapshot(),
                }, 'Backup verification completed', 'BACKUP_VERIFY'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'BACKUP_VERIFY_FAILED'));
            }
        });

        this.app.get('/backup/list', (req, res) => {
            try {
                if (!this.backupManager?.listBackups) {
                    return res.status(503).json(APIResponse.error('Backup listing unavailable', 'BACKUP_LIST_UNAVAILABLE', 503));
                }
                res.json(APIResponse.success(this.backupManager.listBackups(), 'Backups listed', 'BACKUP_LIST'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'BACKUP_LIST_FAILED'));
            }
        });

        this.app.post('/backup/files/run', async (req, res) => {
            try {
                if (!this.backupManager?.runFilesBackup) {
                    return res.status(503).json(APIResponse.error('Files backup unavailable', 'FILES_BACKUP_UNAVAILABLE', 503));
                }
                await this.backupManager.runFilesBackup();
                res.json(APIResponse.success(this.getBackupSnapshot(), 'Files backup run completed', 'FILES_BACKUP_RUN'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'FILES_BACKUP_RUN_FAILED'));
            }
        });

        this.app.get('/backup/restore/status', (req, res) => {
            try {
                const status = this.backupManager?.getStatus ? this.backupManager.getStatus() : null;
                const root = status?.backupDir || path.join(__dirname, '..', 'backups');
                const file = path.join(root, 'restore-state.json');
                const data = readJsonFile(file, null);
                res.json(APIResponse.success({ available: !!data, state: data }, 'Restore state fetched', 'BACKUP_RESTORE_STATUS'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'BACKUP_RESTORE_STATUS_FAILED'));
            }
        });

        this.app.post('/backup/restore', async (req, res) => {
            try {
                const confirm = String(req.body?.confirm || '').trim();
                if (confirm !== 'RESTORE') {
                    return res.status(400).json(APIResponse.error('Confirmation missing. Set confirm=RESTORE', 'BACKUP_RESTORE_CONFIRM_REQUIRED', 400));
                }

                const mode = String(req.body?.mode || 'full').toLowerCase(); // full | db | files
                const sql = String(req.body?.sql || '').trim();
                const files = String(req.body?.files || '').trim();
                const restart = req.body?.restart === undefined ? true : dashboardBoolean(req.body.restart);

                if (!['full', 'db', 'files'].includes(mode)) {
                    return res.status(400).json(APIResponse.error('Invalid restore mode', 'BACKUP_RESTORE_MODE_INVALID', 400));
                }

                if ((mode === 'full' || mode === 'db') && !sql) {
                    return res.status(400).json(APIResponse.error('Missing sql file', 'BACKUP_RESTORE_SQL_REQUIRED', 400));
                }

                if ((mode === 'full' || mode === 'files') && !files) {
                    return res.status(400).json(APIResponse.error('Missing files archive', 'BACKUP_RESTORE_FILES_REQUIRED', 400));
                }

                // Best-effort validation against known backup list.
                if (this.backupManager?.listBackups) {
                    const list = this.backupManager.listBackups();
                    const mysqlOk = !sql || (list.mysql || []).some((e) => e.file === sql);
                    const filesOk = !files || (list.files || []).some((e) => e.file === files);
                    if (!mysqlOk) return res.status(400).json(APIResponse.error('Unknown sql backup file', 'BACKUP_RESTORE_SQL_UNKNOWN', 400));
                    if (!filesOk) return res.status(400).json(APIResponse.error('Unknown files backup archive', 'BACKUP_RESTORE_FILES_UNKNOWN', 400));
                }

                const scriptPath = path.join(__dirname, '..', 'scripts', 'restore-backup.js');
                const args = [scriptPath, '--mode', mode, '--restart', restart ? 'true' : 'false'];
                if (sql) args.push('--sql', sql);
                if (files) args.push('--files', files);

                const child = spawn(process.execPath, args, {
                    detached: true,
                    stdio: 'ignore',
                    env: process.env,
                    windowsHide: true,
                });
                child.unref();

                res.json(APIResponse.success({ scheduled: true, mode, sql: sql || null, files: files || null }, 'Restore scheduled', 'BACKUP_RESTORE_SCHEDULED'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'BACKUP_RESTORE_FAILED'));
            }
        });

        this.app.get('/security/checks', async (req, res) => {
            try {
                const nginx = auditNginxSitesEnabled();
                const envChecks = [
                    envStatus('TOKEN', 'critical'),
                    envStatus('BOT_API_TOKEN', 'critical'),
                    envStatus('OWNER_ID', 'critical'),
                    envStatus('DISCORD_CLIENT_ID', 'critical'),
                    envStatus('DISCORD_CLIENT_SECRET', 'critical'),
                    envStatus('DISCORD_REDIRECT_URI', 'critical'),
                    envStatus('MYSQL_HOST', 'warn'),
                    envStatus('MYSQL_USER', 'warn'),
                    envStatus('MYSQL_DATABASE', 'warn'),
                    envStatus('TOPGG_WEBHOOK_AUTH', 'warn'),
                    envStatus('DEPLOY_SECRET', 'warn'),
                    envStatus('ESELTOKENS_DEPLOY_SECRET', 'warn'),
                ];

                // Docker HTTP health probes — replaces legacy PM2 process checks
                const [dashboardHealth, eseltokensHealth, eseltokensWebhookHealth] = await Promise.all([
                    probeHttpHealth(process.env.DASHBOARD_HEALTH_URL || 'http://dashboard-php:8081/', 3000),
                    probeHttpHealth(process.env.ESELTOKENS_HEALTH_URL || 'http://eseltokens-docker:3000/', 3000),
                    probeHttpHealth(process.env.ESELTOKENS_WEBHOOK_HEALTH_URL || 'http://eseltokens-webhook-docker:9001/health', 3000),
                ]);

                const checks = [
                    ...envChecks,
                    fileModeStatus(path.join(__dirname, '../.env'), 'Root .env permissions'),
                    {
                        name: 'Bot API listens on loopback',
                        ok: true,
                        severity: 'critical',
                        detail: '127.0.0.1:3002',
                    },
                    {
                        name: 'Dashboard PHP container',
                        ok: dashboardHealth.statusCode !== null && dashboardHealth.statusCode < 500,
                        severity: 'warn',
                        detail: dashboardHealth.error || `HTTP ${dashboardHealth.statusCode ?? 'timeout'}`,
                    },
                    {
                        name: 'Fahrstuhl bot (this process)',
                        ok: true,
                        severity: 'critical',
                        detail: 'running — processing this request',
                    },
                    {
                        name: 'EselTokens container',
                        ok: eseltokensHealth.statusCode !== null && eseltokensHealth.statusCode < 500,
                        severity: 'warn',
                        detail: eseltokensHealth.error || `HTTP ${eseltokensHealth.statusCode ?? 'timeout'}`,
                    },
                    {
                        name: 'EselTokens webhook container',
                        ok: eseltokensWebhookHealth.ok,
                        severity: 'warn',
                        detail: eseltokensWebhookHealth.error || `HTTP ${eseltokensWebhookHealth.statusCode ?? 'timeout'}`,
                    },
                    {
                        name: 'Nginx sites-enabled has no backup configs',
                        ok: !nginx.available || nginx.backupFiles.length === 0,
                        severity: 'warn',
                        detail: nginx.available
                            ? (nginx.backupFiles.length ? nginx.backupFiles.join(', ') : 'clean')
                            : (nginx.error || 'unavailable'),
                    },
                    {
                        name: 'Nginx has no duplicate server_name entries',
                        ok: !nginx.available || nginx.duplicateServerNames.length === 0,
                        severity: 'warn',
                        detail: nginx.available
                            ? (nginx.duplicateServerNames.length
                                ? nginx.duplicateServerNames.map(entry => `${entry.serverName}: ${entry.files.join(', ')}`).join(' | ')
                                : 'clean')
                            : (nginx.error || 'unavailable'),
                    },
                ];

                const failed = checks.filter(check => !check.ok);
                res.json(APIResponse.success({
                    checks,
                    nginx,
                    summary: {
                        total: checks.length,
                        passed: checks.length - failed.length,
                        failed: failed.length,
                        criticalFailed: failed.filter(check => check.severity === 'critical').length,
                    },
                }, 'Security checks fetched', 'SECURITY_CHECKS'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'SECURITY_CHECKS_FAILED'));
            }
        });

        this.app.get('/deploy/status', (req, res) => {
            try {
                const status = readJsonFile(deployStatusFile, {});
                const fahrstuhlRepo = path.join(__dirname, '..');
                const eseltokensRepo = process.env.ESELTOKENS_REPO_DIR || '/home/marvin/eseltokens';

                res.json(APIResponse.success({
                    projects: {
                        fahrstuhl: {
                            repo: fahrstuhlRepo,
                            branch: process.env.DEPLOY_BRANCH || 'main',
                            webhookPort: Number(process.env.DEPLOY_WEBHOOK_PORT || 9000),
                            secretConfigured: !!process.env.DEPLOY_SECRET,
                            git: getGitInfo(fahrstuhlRepo),
                            lastDeploy: status.fahrstuhl || null,
                        },
                        eseltokens: {
                            repo: eseltokensRepo,
                            branch: process.env.ESELTOKENS_DEPLOY_BRANCH || 'main',
                            webhookPort: Number(process.env.ESELTOKENS_WEBHOOK_PORT || 9001),
                            secretConfigured: !!process.env.ESELTOKENS_DEPLOY_SECRET,
                            git: getGitInfo(eseltokensRepo),
                            lastDeploy: status.eseltokens || null,
                        },
                    },
                }, 'Deploy status fetched', 'DEPLOY_STATUS'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'DEPLOY_STATUS_FAILED'));
            }
        });

        this.app.get('/audit/list', (req, res) => {
            try {
                const limit = Math.min(parseInt(req.query.limit, 10) || 100, 1000);
                const query = req.query.q || '';
                res.json(APIResponse.success({
                    entries: dashboardAudit.list({ limit, query }),
                }, 'Audit entries fetched', 'AUDIT_LIST'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'AUDIT_LIST_FAILED'));
            }
        });

        // ============ LIVE CONSOLE ============
        this.app.get('/logs/recent', (req, res) => {
            const limit = Math.min(parseInt(req.query.limit) || 100, LOG_BUFFER_SIZE);
            // Return real-time logs from logBuffer (SSE-backed)
            const logs = logBuffer.slice(-limit);
            res.json(APIResponse.success({ logs: logs }, 'Logs fetched', 'LOGS_OK'));
        });

        this.app.get('/logs/stream', (req, res) => {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();
            // Send last 50 lines immediately
            logBuffer.slice(-50).forEach(line => res.write(`data: ${JSON.stringify(line)}\n\n`));
            sseClients.add(res);
            req.on('close', () => sseClients.delete(res));
        });

        // ============ GUILD EVENTS SSE ============
        this.app.get('/events/guilds', (req, res) => {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();
            guildEventSseClients.add(res);
            req.on('close', () => guildEventSseClients.delete(res));
        });

        // ============ TOP.GG VOTE WEBHOOK ============
        this.app.post('/topgg/webhook', async (req, res) => {
            const auth = req.headers['authorization'];
            const expected = process.env.TOPGG_WEBHOOK_AUTH;
            if (!expected || auth !== expected) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            try {
                const { user: userId, type } = req.body || {};
                if (!userId || type !== 'upvote') return res.sendStatus(200);

                const stats = getUserStats(userId);
                setUserStats(userId, { shieldsOwned: stats.shieldsOwned + 2 });
                monetizationStore.recordVote({ userId, type, rewardedShields: 2, source: 'top.gg' });
                console.log(`[INFO] ⭐ Vote reward: +2 shields for user ${userId} (new total: ${stats.shieldsOwned + 2})`);

                try {
                    const discordUser = await this.client.users.fetch(userId);
                    await discordUser.send({
                        embeds: [{
                            color: 0xFFD700,
                            title: "⭐ Thanks for voting on top.gg!",
                            description: "You received **+2 shields** as a reward! 🛡️\nUse `/shield` to activate 2-hour immunity from all trolls.",
                            fields: [{ name: "New Shield Inventory", value: `📦 **${stats.shieldsOwned + 2} Shields**`, inline: true }],
                            footer: { text: "You can vote every 12 hours for more shields!" },
                            timestamp: new Date().toISOString()
                        }]
                    });
                } catch (_) { /* DMs disabled - no problem */ }

                res.sendStatus(200);
            } catch (err) {
                console.error('[ERROR] top.gg webhook error:', err.message);
                res.sendStatus(500);
            }
        });
        this.app.get('/user/:userId', async (req, res) => {
            try {
                const { userId } = req.params;
                
                // Validate input
                if (!InputValidator.isValidUserId(userId)) {
                    return res.status(400).json(APIResponse.badRequest('Invalid user ID format'));
                }

                const user = await this.client.users.fetch(userId).catch(() => null);
                const stats = getUserStats(userId);
                const shieldActive = !!(stats.activeShieldExpiry && stats.activeShieldExpiry > Date.now());
                
                if (!user) {
                    return res.json(APIResponse.success({
                        userId,
                        username: 'Unknown',
                        avatar: null,
                        shieldsOwned: stats.shieldsOwned ?? 0,
                        activeShieldExpiry: stats.activeShieldExpiry ?? 0,
                        shieldActive,
                    }, 'User not found', 'USER_NOT_FOUND'));
                }
                
                res.json(APIResponse.success({
                    userId,
                    username: user.username,
                    avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null,
                    shieldsOwned: stats.shieldsOwned ?? 0,
                    activeShieldExpiry: stats.activeShieldExpiry ?? 0,
                    shieldActive,
                }, 'User fetched successfully', 'USER_FOUND'));
            } catch (error) {
                console.error('Error fetching user:', error);
                res.status(500).json(APIResponse.error(error.message, 'FETCH_ERROR'));
            }
        });

        this.app.get('/users/search', async (req, res) => {
            try {
                const q = String(req.query.q || '').trim();
                if (q.length < 2) {
                    return res.json(APIResponse.success({ query: q, users: [] }, 'Search query too short', 'USERS_SEARCH'));
                }

                const users = await this.searchUsers(q);
                res.json(APIResponse.success({ query: q, users }, 'Users searched', 'USERS_SEARCH'));
            } catch (error) {
                console.error('User search error:', error);
                res.status(500).json(APIResponse.error(error.message, 'USERS_SEARCH_FAILED'));
            }
        });

        this.app.get('/users/:userId/detail', async (req, res) => {
            try {
                const { userId } = req.params;
                if (!InputValidator.isValidUserId(userId)) {
                    return res.status(400).json(APIResponse.badRequest('Invalid user ID format'));
                }

                res.json(APIResponse.success(await this.buildUserDetail(userId), 'User detail fetched', 'USER_DETAIL'));
            } catch (error) {
                console.error('User detail error:', error);
                res.status(500).json(APIResponse.error(error.message, 'USER_DETAIL_FAILED'));
            }
        });

        // ============ EXECUTE COMMAND ============
        this.app.post('/execute', async (req, res) => {
            try {
                const { command, guildId, userId, targetId, args } = req.body;

                // Validate inputs
                const validation = InputValidator.validateBatch(
                    { command, guildId, userId, targetId },
                    {
                        command: { required: true, type: 'string' },
                        guildId: { required: true, type: 'guildId' },
                        userId: { required: true, type: 'userId' },
                        targetId: { required: false, type: 'userId' }
                    }
                );

                if (!validation.valid) {
                    return res.status(400).json(APIResponse.validationError('Invalid input', validation.errors));
                }

                console.log(`🔵 /execute called: ${command} in guild ${guildId}`);

                // Check blacklist
                const blockEntry = blacklistManager.isBlacklisted(userId, guildId);
                if (blockEntry) {
                    const reason = blockEntry.reason || 'You are blacklisted from using this bot';
                    console.log(`🚫 User ${userId} is blacklisted: ${reason}`);
                    return res.status(403).json(APIResponse.forbidden(`🚫 Blocked: ${reason}`));
                }

                const guild = this.client.guilds.cache.get(guildId);
                if (!guild) {
                    console.error(`❌ Guild not found: ${guildId}`);
                    return res.status(400).json(APIResponse.badRequest('Guild not found'));
                }

                console.log(`✓ Guild found: ${guild.name}`);

                const user = await this.client.users.fetch(userId);
                const target = targetId ? await this.client.users.fetch(targetId) : null;

                console.log(`🎯 Executing: ${command} for target ${target?.username || 'unknown'}`);

                // Simuliere Command Execution
                const result = await this.executeCommand(command, {
                    guild,
                    user,
                    target,
                    args: args || {}
                });

                console.log(`✅ Command result:`, result);

                res.json(APIResponse.success({
                    command,
                    result
                }, 'Command executed successfully'));
            } catch (error) {
                console.error('❌ Command execution error:', error.message);
                console.error(error.stack);
                res.status(500).json(APIResponse.error(error.message, 'EXECUTE_FAILED'));
            }
        });

        // ============ BLACKLIST MANAGEMENT ============
        this.app.post('/blacklist/add', async (req, res) => {
            try {
                const { userId, guildId, reason, type } = req.body;

                if (!userId) {
                    return res.status(400).json(APIResponse.badRequest('Missing userId'));
                }

                blacklistManager.add(userId, guildId || null, reason || 'No reason specified', type || 'global');

                res.json(APIResponse.success({
                    userId,
                    guildId,
                    reason,
                    type: type || 'global',
                    timestamp: new Date().toISOString()
                }, `User ${userId} added to ${type || 'global'} blacklist`, 'BLACKLIST_ADDED'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'BLACKLIST_ADD_FAILED'));
            }
        });

        this.app.post('/blacklist/remove', async (req, res) => {
            try {
                const { userId, guildId } = req.body;

                if (!userId) {
                    return res.status(400).json(APIResponse.badRequest('Missing userId'));
                }

                blacklistManager.remove(userId, guildId || null);

                res.json(APIResponse.success({
                    userId,
                    timestamp: new Date().toISOString()
                }, `User ${userId} removed from blacklist`, 'BLACKLIST_REMOVED'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'BLACKLIST_REMOVE_FAILED'));
            }
        });

        this.app.get('/blacklist/list', async (req, res) => {
            try {
                const list = blacklistManager.getAll ? blacklistManager.getAll() : [];
                res.json(APIResponse.success({ blacklist: list }, 'Blacklist fetched', 'BLACKLIST_LIST'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'BLACKLIST_LIST_FAILED'));
            }
        });

        // ============ FEATURE FLAGS ============
        this.app.post('/flags/set', async (req, res) => {
            try {
                const { flagName, enabled, guildId } = req.body;

                if (!flagName) {
                    return res.status(400).json(APIResponse.badRequest('Missing flagName'));
                }

                flagsManager.setFlag(flagName, enabled !== false, guildId || null);

                res.json(APIResponse.success({
                    flagName,
                    enabled: enabled !== false,
                    guildId: guildId || null,
                    timestamp: new Date().toISOString()
                }, `Flag ${flagName} set to ${enabled}`, 'FLAG_SET'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'FLAG_SET_FAILED'));
            }
        });

        this.app.get('/flags/list', async (req, res) => {
            try {
                flagsManager.refresh();
                const flags = flagsManager.getAllFlags();
                res.json(APIResponse.success({ flags }, 'Flags fetched', 'FLAGS_LIST'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'FLAGS_LIST_FAILED'));
            }
        });

        // ============ WEBHOOKS ============
        this.app.get('/webhooks/list', async (req, res) => {
            try {
                webhooksManager.refresh();
                const webhooks = webhooksManager.getAllWebhooks();
                res.json(APIResponse.success({ webhooks }, 'Webhooks fetched', 'WEBHOOKS_LIST'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'WEBHOOKS_LIST_FAILED'));
            }
        });

        this.app.post('/webhooks/add', async (req, res) => {
            try {
                const { name, url, events } = req.body;
                if (!url) {
                    return res.status(400).json(APIResponse.badRequest('Missing url'));
                }
                const webhook = webhooksManager.add(name || url, url, events || []);
                res.json(APIResponse.success({ webhook }, 'Webhook added', 'WEBHOOK_ADDED'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'WEBHOOK_ADD_FAILED'));
            }
        });

        this.app.post('/webhooks/remove', async (req, res) => {
            try {
                const { id } = req.body;
                if (!id) {
                    return res.status(400).json(APIResponse.badRequest('Missing id'));
                }
                const removed = webhooksManager.remove(id);
                if (!removed) {
                    return res.status(404).json(APIResponse.error('Webhook not found', 'WEBHOOK_NOT_FOUND'));
                }
                res.json(APIResponse.success({ id }, 'Webhook removed', 'WEBHOOK_REMOVED'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'WEBHOOK_REMOVE_FAILED'));
            }
        });

        // ============ ANALYTICS ============
        this.app.get('/analytics/summary', async (req, res) => {
            try {
                const db = await analyticsDatabase.getInstance();
                const summary = db.getSummary();
                res.json(APIResponse.success({
                    total_commands: summary.totalExecutions,
                    active_users: summary.uniqueUsers,
                    top_command: summary.topCommand,
                    top_command_count: summary.topCommandCount,
                    unique_commands: summary.uniqueCommands,
                    guilds: this.client.guilds.cache.size,
                    uptime: this.client.uptime
                }, 'Analytics summary', 'ANALYTICS_SUMMARY'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'ANALYTICS_SUMMARY_FAILED'));
            }
        });

        this.app.get('/analytics/timeline', async (req, res) => {
            try {
                const db = await analyticsDatabase.getInstance();
                const timeline = db.getRecentExecutions(50);
                res.json(APIResponse.success({ timeline }, 'Timeline fetched', 'ANALYTICS_TIMELINE'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'ANALYTICS_TIMELINE_FAILED'));
            }
        });

        this.app.get('/analytics/chart', async (req, res) => {
            try {
                const timeframe = req.query.timeframe || '24h';
                const db = await analyticsDatabase.getInstance();
                const hourly = db.getExecutionsByTimeframe(timeframe);
                const commands = db.getTopCommands(8);
                res.json(APIResponse.success({ hourly, commands }, 'Chart data fetched', 'ANALYTICS_CHART'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'ANALYTICS_CHART_FAILED'));
            }
        });

        this.app.get('/analytics/users', async (req, res) => {
            try {
                const limit = Math.min(parseInt(req.query.limit) || 50, 200);
                const offset = Math.max(0, parseInt(req.query.offset) || 0);
                const db = await analyticsDatabase.getInstance();
                const { users, total } = db.getAllUsers(limit, offset);
                res.json(APIResponse.success({ users, total, limit, offset }, 'Users fetched', 'ANALYTICS_USERS'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'ANALYTICS_USERS_FAILED'));
            }
        });

        // ============ STATS ============
        this.app.get('/stats', (req, res) => {
            try {
                const commandStatsManager = require('../utils/commandStatsManager');
                const { getCacheStatus } = require('../utils/config');
                const allStats = commandStatsManager.getAllStats();
                
                let totalCommands = 0;
                let topCommand = 'elevator';

                // Get command execution stats
                if (allStats.commands) {
                    totalCommands = Object.values(allStats.commands).reduce((a, b) => a + b, 0);
                    const entries = Object.entries(allStats.commands);
                    if (entries.length > 0) {
                        const [top] = entries.sort(([, a], [, b]) => b - a);
                        if (top) topCommand = top[0];
                    }
                }

                const cacheStatus = getCacheStatus();
                const totalMembers = this.client.guilds.cache.reduce((sum, guild) => sum + (guild.memberCount || 0), 0);
                const cachedUsers = this.client.users.cache.size;
                const totalUsers = totalMembers || cachedUsers || cacheStatus.userCount || 0;
                const totalTrolls = cacheStatus.globalStats?.totalTrolls ?? 0;

                res.json({
                    stats: {
                        commands: totalCommands,
                        users: totalUsers,
                        totalUsers,
                        totalMembers,
                        cachedUsers,
                        totalTrolls: totalTrolls,
                        topCommand: topCommand,
                        guilds: this.client.guilds.cache.size,
                        uptime: this.client.uptime
                    }
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // ============ GET GUILD INFO ============
        this.app.get('/guilds/:guildId', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                
                if (!guild) {
                    return res.status(404).json(APIResponse.notFound('Guild not found'));
                }
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to this guild'));

                res.json(APIResponse.success(
                    await this.buildGuildDetails(guild),
                    'Guild details fetched',
                    'GUILD_DETAILS'
                ));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'GUILD_DETAILS_FAILED'));
            }
        });

        this.app.get('/guilds/:guildId/analytics', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to this guild analytics'));

                const { getGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guild.id);
                const modules = buildModuleConfig(config);
                const activeModules = modules.filter(module => module.enabled).map(module => ({
                    key: module.key,
                    label: module.label,
                    icon: module.icon,
                }));

                const pool = getPool();
                const now = Date.now();
                const since24h = now - 24 * 60 * 60 * 1000;
                const since7d = now - 7 * 24 * 60 * 60 * 1000;
                const since14d = now - 14 * 24 * 60 * 60 * 1000;
                const dayMs = 24 * 60 * 60 * 1000;

                const safeRows = async (query, params = []) => {
                    try {
                        const [rows] = await pool.query(query, params);
                        return Array.isArray(rows) ? rows : [];
                    } catch (_error) {
                        return [];
                    }
                };

                const safeFirst = async (query, params = []) => {
                    const rows = await safeRows(query, params);
                    return rows[0] || {};
                };

                const [
                    ticketTotals,
                    automodTotals,
                    moderationTotals,
                    levelingTopRows,
                    levelingMessageTotals,
                    voiceTopRows,
                    voiceChannelRows,
                    recentCasesRows,
                    automodByDayRows,
                    moderationByDayRows,
                ] = await Promise.all([
                    safeFirst(
                        `
                        SELECT
                            COUNT(*) AS total,
                            SUM(status = 'closed') AS closed,
                            SUM(status != 'closed') AS open
                        FROM ticket_records
                        WHERE guild_id = ?
                        `,
                        [guild.id]
                    ),
                    safeFirst(
                        `
                        SELECT
                            SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS hits24h,
                            SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS hits7d,
                            COUNT(*) AS total
                        FROM moderation_cases
                        WHERE guild_id = ? AND type = 'automod'
                        `,
                        [since24h, since7d, guild.id]
                    ),
                    safeFirst(
                        `
                        SELECT
                            SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS cases24h,
                            SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS cases7d,
                            COUNT(*) AS total
                        FROM moderation_cases
                        WHERE guild_id = ? AND type != 'automod'
                        `,
                        [since24h, since7d, guild.id]
                    ),
                    safeRows(
                        `
                        SELECT user_id, xp, level, message_count, voice_xp, updated_at
                        FROM guild_user_levels
                        WHERE guild_id = ?
                        ORDER BY xp DESC
                        LIMIT 10
                        `,
                        [guild.id]
                    ),
                    safeFirst(
                        `
                        SELECT COALESCE(SUM(message_count), 0) AS messageCount
                        FROM guild_user_levels
                        WHERE guild_id = ?
                        `,
                        [guild.id]
                    ),
                    safeRows(
                        `
                        SELECT user_id,
                               COUNT(*) AS sessions,
                               COALESCE(SUM(duration_ms), 0) AS durationMs,
                               MAX(ended_at) AS lastAt
                        FROM voice_channel_sessions
                        WHERE guild_id = ? AND ended_at IS NOT NULL
                        GROUP BY user_id
                        ORDER BY durationMs DESC
                        LIMIT 10
                        `,
                        [guild.id]
                    ),
                    safeRows(
                        `
                        SELECT channel_id,
                               COUNT(*) AS sessions,
                               COALESCE(SUM(duration_ms), 0) AS durationMs,
                               MAX(ended_at) AS lastAt
                        FROM voice_channel_sessions
                        WHERE guild_id = ? AND ended_at IS NOT NULL
                        GROUP BY channel_id
                        ORDER BY durationMs DESC
                        LIMIT 8
                        `,
                        [guild.id]
                    ),
                    safeRows(
                        `
                        SELECT id, type, user_id, moderator_id, reason, status, created_at
                        FROM moderation_cases
                        WHERE guild_id = ?
                        ORDER BY created_at DESC
                        LIMIT 15
                        `,
                        [guild.id]
                    ),
                    safeRows(
                        `
                        SELECT DATE(FROM_UNIXTIME(created_at / 1000)) AS day,
                               COUNT(*) AS count
                        FROM moderation_cases
                        WHERE guild_id = ? AND type = 'automod' AND created_at >= ?
                        GROUP BY DATE(FROM_UNIXTIME(created_at / 1000))
                        ORDER BY day ASC
                        `,
                        [guild.id, since14d]
                    ),
                    safeRows(
                        `
                        SELECT DATE(FROM_UNIXTIME(created_at / 1000)) AS day,
                               COUNT(*) AS count
                        FROM moderation_cases
                        WHERE guild_id = ? AND type != 'automod' AND created_at >= ?
                        GROUP BY DATE(FROM_UNIXTIME(created_at / 1000))
                        ORDER BY day ASC
                        `,
                        [guild.id, since14d]
                    ),
                ]);

                const dayKey = (value) => {
                    if (!value) return '';
                    const date = new Date(value);
                    if (Number.isNaN(date.getTime())) return '';
                    return date.toISOString().slice(0, 10);
                };

                const buildDailySeries = (rows) => {
                    const map = new Map();
                    for (const row of rows) {
                        const key = dayKey(row.day);
                        if (!key) continue;
                        map.set(key, Number(row.count || 0));
                    }
                    const output = [];
                    for (let i = 13; i >= 0; i--) {
                        const ts = now - i * dayMs;
                        const key = new Date(ts).toISOString().slice(0, 10);
                        output.push({
                            day: key,
                            label: key.slice(5),
                            count: Number(map.get(key) || 0),
                        });
                    }
                    return output;
                };

                const channelNameFor = (channelId) => {
                    const channel = guild.channels.cache.get(String(channelId || ''));
                    if (!channel) return `#${String(channelId || 'unknown')}`;
                    return `#${channel.name}`;
                };

                const userMetaFor = (userId) => {
                    const member = guild.members.cache.get(String(userId || ''));
                    return {
                        username: member?.user?.username || null,
                        displayName: member?.displayName || null,
                    };
                };

                const topLevelingUsers = levelingTopRows.map((row) => ({
                    ...userMetaFor(row.user_id),
                    userId: String(row.user_id),
                    xp: Number(row.xp || 0),
                    level: Number(row.level || 0),
                    messageCount: Number(row.message_count || 0),
                    voiceXp: Number(row.voice_xp || 0),
                    updatedAt: Number(row.updated_at || 0),
                }));

                const topVoiceUsers = voiceTopRows.map((row) => ({
                    ...userMetaFor(row.user_id),
                    userId: String(row.user_id),
                    sessions: Number(row.sessions || 0),
                    durationMs: Number(row.durationMs || 0),
                    durationMinutes: Math.round(Number(row.durationMs || 0) / 60000),
                    lastAt: Number(row.lastAt || 0),
                }));

                const mostActiveChannels = voiceChannelRows.map((row) => ({
                    channelId: String(row.channel_id),
                    channelName: channelNameFor(row.channel_id),
                    source: 'voice',
                    sessions: Number(row.sessions || 0),
                    durationMs: Number(row.durationMs || 0),
                    durationMinutes: Math.round(Number(row.durationMs || 0) / 60000),
                    lastAt: Number(row.lastAt || 0),
                }));

                const recentActivity = recentCasesRows.map((row) => ({
                    id: Number(row.id || 0),
                    type: String(row.type || 'unknown'),
                    userId: String(row.user_id || ''),
                    ...userMetaFor(row.user_id),
                    moderatorId: row.moderator_id ? String(row.moderator_id) : null,
                    status: String(row.status || 'active'),
                    reason: String(row.reason || '').slice(0, 500),
                    createdAt: Number(row.created_at || 0),
                }));

                const automodDaily = buildDailySeries(automodByDayRows);
                const moderationDaily = buildDailySeries(moderationByDayRows);

                const memberCount = Math.max(1, Number(guild.memberCount || 0));
                const weightedActivity =
                    (Number(ticketTotals.open || 0) * 2) +
                    (Number(ticketTotals.closed || 0) * 3) +
                    (Number(automodTotals.hits7d || 0) * 2) +
                    (Number(moderationTotals.cases7d || 0) * 3) +
                    Math.round(Number(levelingMessageTotals.messageCount || 0) / 120);
                const activityScore = Math.max(0, Math.min(100, Math.round((weightedActivity / memberCount) * 9)));

                const moderationByType = moderationRows => {
                    const output = { warn: 0, timeout: 0, kick: 0, ban: 0, other: 0 };
                    for (const row of moderationRows) {
                        const key = String(row.type || '').toLowerCase();
                        if (Object.prototype.hasOwnProperty.call(output, key)) output[key] += 1;
                        else output.other += 1;
                    }
                    return output;
                };
                const moderationTypeSummary = moderationByType(recentCasesRows.filter(row => String(row.type || '').toLowerCase() !== 'automod'));

                const analyticsPayload = {
                    guildId: guild.id,
                    guildName: guild.name,
                    overview: {
                        memberCount: Number(guild.memberCount || 0),
                        botCount: guild.members.cache.filter(member => member.user?.bot).size,
                        channelCount: guild.channels.cache.size,
                        roleCount: guild.roles.cache.filter(role => role.name !== '@everyone').size,
                        activeModulesCount: activeModules.length,
                        activeModules,
                        messageCount: Number(levelingMessageTotals.messageCount || 0),
                        messageCountAvailable: Number(levelingMessageTotals.messageCount || 0) > 0,
                    },
                    tickets: {
                        open: Number(ticketTotals.open || 0),
                        closed: Number(ticketTotals.closed || 0),
                        total: Number(ticketTotals.total || 0),
                    },
                    automod: {
                        hits24h: Number(automodTotals.hits24h || 0),
                        hits7d: Number(automodTotals.hits7d || 0),
                        total: Number(automodTotals.total || 0),
                    },
                    moderation: {
                        cases24h: Number(moderationTotals.cases24h || 0),
                        cases7d: Number(moderationTotals.cases7d || 0),
                        total: Number(moderationTotals.total || 0),
                    },
                    charts: {
                        messages: {
                            available: false,
                            reason: 'No persistent message timeline available yet.',
                            points: [],
                        },
                        joinsLeaves: {
                            available: false,
                            reason: 'No persistent join/leave timeline available yet.',
                            joins: [],
                            leaves: [],
                        },
                        automodHits: {
                            available: automodDaily.some(point => point.count > 0),
                            points: automodDaily,
                        },
                        moderationCases: {
                            available: moderationDaily.some(point => point.count > 0),
                            points: moderationDaily,
                        },
                    },
                    topLists: {
                        topXpUsers: topLevelingUsers,
                        topVoiceUsers,
                        mostActiveChannels,
                        recentActivity,
                    },
                    insights: {
                        activityScore,
                        ticketSummary: {
                            open: Number(ticketTotals.open || 0),
                            closed: Number(ticketTotals.closed || 0),
                            total: Number(ticketTotals.total || 0),
                        },
                        automodSummary: {
                            hits24h: Number(automodTotals.hits24h || 0),
                            hits7d: Number(automodTotals.hits7d || 0),
                            total: Number(automodTotals.total || 0),
                        },
                        moderationSummary: {
                            cases24h: Number(moderationTotals.cases24h || 0),
                            cases7d: Number(moderationTotals.cases7d || 0),
                            byType: moderationTypeSummary,
                        },
                        serverHealthSummary: {
                            activeModulesCount: activeModules.length,
                            channelCount: guild.channels.cache.size,
                            roleCount: guild.roles.cache.filter(role => role.name !== '@everyone').size,
                            memberCount: Number(guild.memberCount || 0),
                        },
                    },
                };

                res.json(APIResponse.success(analyticsPayload, 'Guild analytics fetched', 'GUILD_ANALYTICS_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'GUILD_ANALYTICS_FAILED'));
            }
        });

        this.app.get('/guilds/:guildId/activity', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to this guild activity'));

                const pool = getPool();
                const filter = String(req.query.type || 'all').trim().toLowerCase();
                const allowedFilters = new Set(['all', 'moderation', 'automod', 'tickets', 'leveling', 'voice']);
                const normalizedFilter = allowedFilters.has(filter) ? filter : 'all';
                const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 50));
                const offset = Math.max(0, Math.min(200, Number(req.query.offset) || 0));
                const fetchLimit = Math.min(240, Math.max(limit + offset + 10, 60));

                const safeRows = async (query, params = []) => {
                    try {
                        const [rows] = await pool.query(query, params);
                        return Array.isArray(rows) ? rows : [];
                    } catch (_error) {
                        return [];
                    }
                };

                const timestampMs = (value) => {
                    const number = Number(value || 0);
                    return Number.isFinite(number) ? number : 0;
                };

                const timestampIso = (value) => {
                    const ms = timestampMs(value);
                    return ms > 0 ? new Date(ms).toISOString() : null;
                };

                const channelLabel = (channelId) => {
                    const id = String(channelId || '').trim();
                    if (!id) return null;
                    const channel = guild.channels.cache.get(id);
                    return channel ? `#${channel.name}` : `#${id}`;
                };

                const memberMeta = (userId) => {
                    const id = String(userId || '').trim();
                    if (!id) return { userId: id || null, username: null, displayName: null };
                    const member = guild.members.cache.get(id);
                    const user = member?.user || this.client.users.cache.get(id) || null;
                    return {
                        userId: id,
                        username: user?.username || null,
                        displayName: member?.displayName || user?.globalName || user?.username || null,
                    };
                };

                const severityForModeration = (row) => {
                    if (String(row.type || '').toLowerCase() === 'ban') return 'critical';
                    if (String(row.type || '').toLowerCase() === 'kick') return 'critical';
                    if (String(row.type || '').toLowerCase() === 'timeout') return 'warning';
                    if (String(row.status || '').toLowerCase() === 'active') return 'warning';
                    return 'info';
                };

                const moderationText = (action, actorName, userName, reason) => {
                    const actor = actorName || 'Ein Moderator';
                    const user = userName || 'ein Nutzer';
                    const safeReason = String(reason || '').trim();
                    const reasonSuffix = safeReason ? ` (Grund: ${safeReason.slice(0, 180)})` : '';
                    if (action === 'ban') return `${actor} hat ${user} gebannt${reasonSuffix}`;
                    if (action === 'kick') return `${actor} hat ${user} gekickt${reasonSuffix}`;
                    if (action === 'timeout') return `${actor} hat ${user} in Timeout gesetzt${reasonSuffix}`;
                    if (action === 'untimeout') return `${actor} hat den Timeout fuer ${user} entfernt${reasonSuffix}`;
                    if (action === 'warn') return `${actor} hat ${user} verwarnt${reasonSuffix}`;
                    if (action === 'note') return `${actor} hat eine Notiz fuer ${user} hinterlegt${reasonSuffix}`;
                    return `${actor} hat eine Moderationsaktion gegen ${user} ausgefuehrt${reasonSuffix}`;
                };

                const queries = [];
                if (normalizedFilter === 'all' || normalizedFilter === 'moderation') {
                    queries.push(safeRows(
                        `
                        SELECT id, type, user_id, moderator_id, reason, status, created_at
                        FROM moderation_cases
                        WHERE guild_id = ? AND type != 'automod'
                        ORDER BY created_at DESC
                        LIMIT ?
                        `,
                        [guild.id, fetchLimit]
                    ));
                } else {
                    queries.push(Promise.resolve([]));
                }

                if (normalizedFilter === 'all' || normalizedFilter === 'automod') {
                    queries.push(safeRows(
                        `
                        SELECT id, type, user_id, moderator_id, reason, status, created_at
                        FROM moderation_cases
                        WHERE guild_id = ? AND type = 'automod'
                        ORDER BY created_at DESC
                        LIMIT ?
                        `,
                        [guild.id, fetchLimit]
                    ));
                } else {
                    queries.push(Promise.resolve([]));
                }

                if (normalizedFilter === 'all' || normalizedFilter === 'tickets') {
                    queries.push(safeRows(
                        `
                        SELECT owner_id, owner_tag, type, priority, status, claimed_by, opened_by,
                               closed_by, reason, close_reason, opened_at, closed_at, updated_at
                        FROM ticket_records
                        WHERE guild_id = ?
                        ORDER BY updated_at DESC
                        LIMIT ?
                        `,
                        [guild.id, fetchLimit]
                    ));
                } else {
                    queries.push(Promise.resolve([]));
                }

                if (normalizedFilter === 'all' || normalizedFilter === 'leveling') {
                    queries.push(safeRows(
                        `
                        SELECT user_id, xp, level, message_count, voice_xp, last_message_xp_at, updated_at
                        FROM guild_user_levels
                        WHERE guild_id = ? AND updated_at > 0 AND level > 0
                        ORDER BY updated_at DESC
                        LIMIT ?
                        `,
                        [guild.id, fetchLimit]
                    ));
                } else {
                    queries.push(Promise.resolve([]));
                }

                if (normalizedFilter === 'all' || normalizedFilter === 'voice') {
                    queries.push(safeRows(
                        `
                        SELECT id, user_id, channel_id, started_at, ended_at, duration_ms, end_reason, reward_tokens, rewarded_at
                        FROM voice_channel_sessions
                        WHERE guild_id = ? AND ended_at IS NOT NULL
                        ORDER BY ended_at DESC
                        LIMIT ?
                        `,
                        [guild.id, fetchLimit]
                    ));
                } else {
                    queries.push(Promise.resolve([]));
                }

                const [moderationRows, automodRows, ticketRows, levelingRows, voiceRows] = await Promise.all(queries);
                const items = [];

                for (const row of moderationRows) {
                    const target = memberMeta(row.user_id);
                    const actor = memberMeta(row.moderator_id);
                    const action = String(row.type || 'case').toLowerCase();
                    const reason = String(row.reason || '').slice(0, 500);
                    items.push({
                        id: `moderation:${row.id}`,
                        type: 'moderation',
                        action,
                        userId: target.userId,
                        userName: target.displayName || target.username || target.userId,
                        actorId: actor.userId,
                        actorName: actor.displayName || actor.username || actor.userId,
                        channelId: null,
                        reason,
                        roleName: null,
                        description: moderationText(action, actor.displayName || actor.username || actor.userId, target.displayName || target.username || target.userId, reason),
                        createdAt: timestampIso(row.created_at),
                        createdAtMs: timestampMs(row.created_at),
                        severity: severityForModeration(row),
                    });
                }

                for (const row of automodRows) {
                    const target = memberMeta(row.user_id);
                    const reason = String(row.reason || 'AutoMod blocked a message').slice(0, 500);
                    items.push({
                        id: `automod:${row.id}`,
                        type: 'automod',
                        action: 'hit',
                        userId: target.userId,
                        userName: target.displayName || target.username || target.userId,
                        actorId: null,
                        actorName: 'AutoMod',
                        channelId: null,
                        reason,
                        roleName: null,
                        description: `AutoMod hat eine Nachricht von ${target.displayName || target.username || target.userId} blockiert${reason ? ` (Grund: ${reason.slice(0, 180)})` : ''}`,
                        createdAt: timestampIso(row.created_at),
                        createdAtMs: timestampMs(row.created_at),
                        severity: 'warning',
                    });
                }

                for (const row of ticketRows) {
                    const owner = memberMeta(row.owner_id);
                    const openedAt = timestampMs(row.opened_at);
                    const closedAt = timestampMs(row.closed_at);
                    const updatedAt = timestampMs(row.updated_at);
                    const openedBy = memberMeta(row.opened_by);
                    const closedBy = memberMeta(row.closed_by);
                    const claimedBy = memberMeta(row.claimed_by);
                    const channelId = null;
                    const baseLabel = row.type ? `${row.type} Ticket` : 'Ticket';

                    if (openedAt > 0) {
                        const ownerName = owner.displayName || owner.username || row.owner_tag || owner.userId;
                        items.push({
                            id: `ticket:open:${channelId}:${openedAt}`,
                            type: 'tickets',
                            action: 'open',
                            userId: owner.userId,
                            userName: ownerName,
                            actorId: openedBy.userId || owner.userId,
                            actorName: openedBy.displayName || openedBy.username || row.owner_tag || owner.userId,
                            channelId,
                            channelName: channelLabel(channelId),
                            reason: String(row.reason || '').slice(0, 500),
                            roleName: null,
                            description: `${ownerName || 'Ein Nutzer'} hat ein Ticket erstellt${row.reason ? ` (Grund: ${String(row.reason).slice(0, 180)})` : ''}`,
                            createdAt: timestampIso(openedAt),
                            createdAtMs: openedAt,
                            severity: row.priority === 'high' ? 'warning' : 'info',
                        });
                    }

                    if (row.claimed_by && updatedAt > openedAt && (!closedAt || updatedAt !== closedAt)) {
                        items.push({
                            id: `ticket:claim:${channelId}:${updatedAt}`,
                            type: 'tickets',
                            action: 'claim',
                            userId: owner.userId,
                            userName: owner.displayName || owner.username || row.owner_tag || owner.userId,
                            actorId: claimedBy.userId,
                            actorName: claimedBy.displayName || claimedBy.username || claimedBy.userId,
                            channelId,
                            channelName: channelLabel(channelId),
                            reason: String(row.reason || '').slice(0, 500),
                            roleName: null,
                            description: `${baseLabel} wurde uebernommen`,
                            createdAt: timestampIso(updatedAt),
                            createdAtMs: updatedAt,
                            severity: 'info',
                        });
                    }

                    if (closedAt > 0) {
                        items.push({
                            id: `ticket:close:${channelId}:${closedAt}`,
                            type: 'tickets',
                            action: 'close',
                            userId: owner.userId,
                            userName: owner.displayName || owner.username || row.owner_tag || owner.userId,
                            actorId: closedBy.userId,
                            actorName: closedBy.displayName || closedBy.username || closedBy.userId,
                            channelId,
                            channelName: channelLabel(channelId),
                            reason: String(row.close_reason || '').slice(0, 500),
                            roleName: null,
                            description: `${baseLabel} wurde geschlossen${row.close_reason ? ` (Grund: ${String(row.close_reason).slice(0, 180)})` : ''}`,
                            createdAt: timestampIso(closedAt),
                            createdAtMs: closedAt,
                            severity: 'info',
                        });
                    }
                }

                for (const row of levelingRows) {
                    const member = memberMeta(row.user_id);
                    const updatedAt = timestampMs(row.updated_at || row.last_message_xp_at);
                    items.push({
                        id: `leveling:${member.userId}:${updatedAt}`,
                        type: 'leveling',
                        action: 'progress',
                        userId: member.userId,
                        userName: member.displayName || member.username || member.userId,
                        actorId: null,
                        actorName: null,
                        channelId: null,
                        reason: null,
                        roleName: null,
                        description: `${member.displayName || member.username || member.userId} hat Level ${Number(row.level || 0)} erreicht`,
                        createdAt: timestampIso(updatedAt),
                        createdAtMs: updatedAt,
                        severity: 'info',
                    });
                }

                for (const row of voiceRows) {
                    const member = memberMeta(row.user_id);
                    const endedAt = timestampMs(row.ended_at);
                    const durationMinutes = Math.max(1, Math.round(Number(row.duration_ms || 0) / 60000));
                    const channelId = String(row.channel_id || '').trim() || null;
                    items.push({
                        id: `voice:${row.id}`,
                        type: 'voice',
                        action: 'session',
                        userId: member.userId,
                        userName: member.displayName || member.username || member.userId,
                        actorId: null,
                        actorName: null,
                        channelId,
                        channelName: channelLabel(channelId),
                        reason: String(row.end_reason || '').slice(0, 500),
                        roleName: null,
                        description: `${durationMinutes} Min. Voice Session${row.end_reason ? ` · ${String(row.end_reason)}` : ''}`,
                        createdAt: timestampIso(endedAt),
                        createdAtMs: endedAt,
                        severity: 'info',
                    });
                }

                items.sort((left, right) => Number(right.createdAtMs || 0) - Number(left.createdAtMs || 0));
                const pagedItems = items.slice(offset, offset + limit).map(({ createdAtMs, ...item }) => item);

                res.json(APIResponse.success({
                    items: pagedItems,
                    pagination: {
                        limit,
                        offset,
                        hasMore: items.length > offset + limit,
                    },
                }, 'Guild activity fetched', 'GUILD_ACTIVITY_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'GUILD_ACTIVITY_FAILED'));
            }
        });

        this.app.get('/guilds/:guildId/activity/stream', async (req, res) => {
            try {
                const guildId = String(req.params.guildId || '').trim();
                if (!guildId) return res.status(400).json(APIResponse.badRequest('Guild ID is required'));

                const guild = this.client.guilds.cache.get(guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));

                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to this guild activity'));

                const streamAuth = parseActivityStreamRequest(req);
                const expiresAt = Number(streamAuth?.expiresAt || 0);

                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache, no-transform');
                res.setHeader('Connection', 'keep-alive');
                res.setHeader('X-Accel-Buffering', 'no');
                res.flushHeaders();

                const userId = String(req.get('x-dashboard-user-id') || '').trim() || null;
                const client = {
                    res,
                    guildId: guild.id,
                    userId,
                    connectedAt: Date.now(),
                };

                const clients = activitySseClientsByGuild.get(guild.id) || new Set();
                clients.add(client);
                activitySseClientsByGuild.set(guild.id, clients);

                res.write(`event: ready\ndata: ${JSON.stringify({ type: 'ready', guildId: guild.id, connectedAt: new Date().toISOString() })}\n\n`);

                const heartbeat = setInterval(() => {
                    try {
                        res.write(`event: heartbeat\ndata: ${JSON.stringify({ type: 'heartbeat', ts: new Date().toISOString() })}\n\n`);
                    } catch {
                        // Cleanup happens in close handler.
                    }
                }, 25000);

                let expirationTimer = null;
                if (Number.isFinite(expiresAt) && expiresAt > 0) {
                    const msUntilExpiry = Math.max(0, (expiresAt * 1000) - Date.now());
                    expirationTimer = setTimeout(() => {
                        try {
                            res.write(`event: disconnect\ndata: ${JSON.stringify({ type: 'disconnect', reason: 'token_expired' })}\n\n`);
                        } catch {
                            // noop
                        }
                        res.end();
                    }, msUntilExpiry + 1000);
                }

                const cleanup = () => {
                    clearInterval(heartbeat);
                    if (expirationTimer) clearTimeout(expirationTimer);
                    const activeClients = activitySseClientsByGuild.get(guild.id);
                    if (!activeClients) return;
                    activeClients.delete(client);
                    if (activeClients.size === 0) activitySseClientsByGuild.delete(guild.id);
                };

                req.on('close', cleanup);
                res.on('close', cleanup);
            } catch (error) {
                if (!res.headersSent) {
                    res.status(500).json(APIResponse.error(error.message, 'GUILD_ACTIVITY_STREAM_FAILED'));
                    return;
                }
                try { res.end(); } catch (_) {}
            }
        });

        this.app.post('/guilds/:guildId/config', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to configure this guild'));

                const { key, roleId } = req.body;
                const allowedKeys = {
                    trollRoleId: 'trollRoleId',
                    adminRoleId: 'adminRoleId',
                    roleId: 'roleId',
                    autoMoveRoleId: 'roleId',
                    dashboardModuleRoles: 'dashboardModuleRoles',
                };
                const configKey = allowedKeys[key];
                if (!configKey) {
                    return res.status(400).json(APIResponse.badRequest('Invalid config key'));
                }

                if (configKey === 'dashboardModuleRoles') {
                    const roleMap = normalizeDashboardModuleRoleMap(req.body?.moduleRoles);
                    for (const roleIds of Object.values(roleMap)) {
                        for (const mappedRoleId of roleIds) {
                            if (!guild.roles.cache.has(mappedRoleId)) {
                                return res.status(400).json(APIResponse.badRequest('One or more selected roles do not exist in this guild'));
                            }
                        }
                    }

                    const { getGuildConfig, setGuildConfig } = require('../utils/config');
                    const current = getGuildConfig(guild.id);
                    const currentDashboardAccess = normalizeDashboardAccessConfig(current);
                    const dashboardAccess = {
                        ...currentDashboardAccess,
                        moduleRoles: roleMap,
                    };

                    setGuildConfig(guild.id, {
                        dashboardAccess,
                        dashboardPermissions: dashboardAccess,
                    });

                    return res.json(APIResponse.success({
                        guildId: guild.id,
                        key: configKey,
                        moduleRoles: dashboardAccess.moduleRoles,
                    }, 'Dashboard access updated', 'GUILD_DASHBOARD_ACCESS_UPDATED'));
                }

                if (roleId && !guild.roles.cache.has(roleId)) {
                    return res.status(400).json(APIResponse.badRequest('Role not found in guild'));
                }

                const { setGuildConfig } = require('../utils/config');
                setGuildConfig(guild.id, { [configKey]: roleId || null });

                res.json(APIResponse.success({
                    guildId: guild.id,
                    key: configKey,
                    roleId: roleId || null,
                }, 'Guild config updated', 'GUILD_CONFIG_UPDATED'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'GUILD_CONFIG_UPDATE_FAILED'));
            }
        });

        this.app.get('/guilds/:guildId/dashboard-access', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));

                const requestedModule = String(req.query?.module || '').trim();
                const moduleKey = requestedModule && DASHBOARD_PERMISSION_MODULE_KEYS.has(requestedModule)
                    ? requestedModule
                    : null;
                const access = await this.getDashboardGuildAccess(req, guild.id, { moduleKey });
                const { getGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guild.id);
                const dashboardAccess = normalizeDashboardAccessConfig(config);

                res.json(APIResponse.success({
                    guildId: guild.id,
                    moduleKey,
                    allowed: !!access.allowed,
                    reason: access.reason || null,
                    moduleRoles: dashboardAccess.moduleRoles,
                    modules: DASHBOARD_PERMISSION_MODULES,
                }, 'Dashboard access fetched', 'DASHBOARD_ACCESS_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'DASHBOARD_ACCESS_FAILED'));
            }
        });

        this.app.post('/guilds/:guildId/dashboard-access', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id, { moduleKey: null });
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to configure dashboard roles'));

                const roleMap = normalizeDashboardModuleRoleMap(req.body?.moduleRoles);
                for (const roleIds of Object.values(roleMap)) {
                    for (const roleId of roleIds) {
                        if (!guild.roles.cache.has(roleId)) {
                            return res.status(400).json(APIResponse.badRequest('One or more selected roles do not exist in this guild'));
                        }
                    }
                }

                const { getGuildConfig, setGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guild.id);
                const existingAccess = normalizeDashboardAccessConfig(config);
                const dashboardAccess = {
                    ...existingAccess,
                    moduleRoles: roleMap,
                };

                setGuildConfig(guild.id, {
                    dashboardAccess,
                    dashboardPermissions: dashboardAccess,
                });

                res.json(APIResponse.success({
                    guildId: guild.id,
                    moduleRoles: dashboardAccess.moduleRoles,
                    modules: DASHBOARD_PERMISSION_MODULES,
                }, 'Dashboard access updated', 'DASHBOARD_ACCESS_UPDATED'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'DASHBOARD_ACCESS_UPDATE_FAILED'));
            }
        });

        this.app.get('/guilds/:guildId/modules', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to this guild modules'));

                const { getGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guild.id);
                res.json(APIResponse.success({
                    guildId: guild.id,
                    guildName: guild.name,
                    modules: buildModuleConfig(config),
                }, 'Guild modules fetched', 'GUILD_MODULES_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'GUILD_MODULES_FAILED'));
            }
        });

        this.app.post('/guilds/:guildId/modules', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to configure this guild modules'));

                const moduleKey = String(req.body?.module || '').trim();
                const enabled = dashboardBoolean(req.body?.enabled);
                if (!SERVER_MODULES.some(module => module.key === moduleKey)) {
                    return res.status(400).json(APIResponse.badRequest('Invalid module'));
                }

                const { getGuildConfig, setGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guild.id);
                const modules = { ...(config.modules || {}), [moduleKey]: enabled };
                setGuildConfig(guild.id, { modules });

                res.json(APIResponse.success({
                    guildId: guild.id,
                    module: moduleKey,
                    enabled,
                    modules: buildModuleConfig({ ...config, modules }),
                }, 'Guild module updated', 'GUILD_MODULE_UPDATED'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'GUILD_MODULE_UPDATE_FAILED'));
            }
        });

        this.app.get('/guilds/:guildId/logging', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to this guild logging settings'));

                const { getGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guild.id);
                const logging = config.logging && typeof config.logging === 'object' ? config.logging : {};
                const channels = guild.channels.cache
                    .filter(channel => channel.type === 0 && !channel.isThread?.())
                    .map(channel => ({
                        id: channel.id,
                        name: channel.name,
                        position: channel.position,
                        canSend: guild.members.me?.permissionsIn(channel)?.has(PermissionsBitField.Flags.SendMessages) ?? false,
                    }))
                    .sort((a, b) => a.position - b.position);

                res.json(APIResponse.success({
                    guildId: guild.id,
                    guildName: guild.name,
                    channels,
                    eventDefinitions: LOGGING_EVENTS.map(event => ({
                        ...event,
                        group: LOGGING_EVENT_GROUP_MAP[event.key] || null,
                    })),
                    groupDefinitions: LOGGING_GROUP_DEFINITIONS,
                    permissions: {
                        viewChannel: guild.members.me?.permissions?.has(PermissionsBitField.Flags.ViewChannel) ?? false,
                        sendMessages: guild.members.me?.permissions?.has(PermissionsBitField.Flags.SendMessages) ?? false,
                        embedLinks: guild.members.me?.permissions?.has(PermissionsBitField.Flags.EmbedLinks) ?? false,
                    },
                    settings: {
                        enabled: booleanWithDefault(logging.enabled, true),
                        channelId: logging.channelId || null,
                        events: normalizeLoggingEvents(logging.events),
                        eventChannels: normalizeLoggingEventChannels(logging.eventChannels),
                        groupChannels: loggingGroupChannels(logging.eventChannels),
                    },
                }, 'Logging settings fetched', 'LOGGING_SETTINGS_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'LOGGING_SETTINGS_FAILED'));
            }
        });

        this.app.post('/guilds/:guildId/logging', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to configure this guild logging settings'));

                const channelId = String(req.body?.channelId || '').trim();
                if (channelId) {
                    const channel = guild.channels.cache.get(channelId)
                        || await guild.channels.fetch(channelId).catch(() => null);
                    if (!channel || channel.type !== 0 || channel.isThread?.()) {
                        return res.status(400).json(APIResponse.badRequest('Please choose a text channel'));
                    }
                    if (!(guild.members.me?.permissionsIn(channel)?.has(PermissionsBitField.Flags.SendMessages) ?? false)) {
                        return res.status(400).json(APIResponse.badRequest('Fahrstuhl cannot send messages in this channel'));
                    }
                }

                const { getGuildConfig, setGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guild.id);

                // Build per-event/group channel map from body.eventChannels + body.groupChannels
                const rawEventChannels = req.body?.eventChannels;
                const rawGroupChannels = req.body?.groupChannels;
                const eventChannels = {};
                const allowedEventKeys = new Set(LOGGING_EVENTS.map(event => event.key));
                const allowedGroupKeys = new Set(LOGGING_GROUP_DEFINITIONS.map(group => group.key));
                if (rawEventChannels && typeof rawEventChannels === 'object') {
                    for (const [evKey, chId] of Object.entries(rawEventChannels)) {
                        if (!allowedEventKeys.has(evKey)) continue;
                        const trimmed = String(chId || '').trim();
                        if (!trimmed) continue;

                        const channel = guild.channels.cache.get(trimmed)
                            || await guild.channels.fetch(trimmed).catch(() => null);
                        if (!channel || channel.type !== 0 || channel.isThread?.()) {
                            return res.status(400).json(APIResponse.badRequest(`Invalid override channel for event: ${evKey}`));
                        }
                        if (!(guild.members.me?.permissionsIn(channel)?.has(PermissionsBitField.Flags.SendMessages) ?? false)) {
                            return res.status(400).json(APIResponse.badRequest(`Fahrstuhl cannot send messages for event ${evKey} in selected channel`));
                        }

                        eventChannels[evKey] = trimmed;
                    }
                }

                if (rawGroupChannels && typeof rawGroupChannels === 'object') {
                    for (const [groupKey, chId] of Object.entries(rawGroupChannels)) {
                        const normalizedGroupKey = String(groupKey || '').trim().toLowerCase();
                        if (!allowedGroupKeys.has(normalizedGroupKey)) continue;
                        const trimmed = String(chId || '').trim();
                        if (!trimmed) continue;

                        const channel = guild.channels.cache.get(trimmed)
                            || await guild.channels.fetch(trimmed).catch(() => null);
                        if (!channel || channel.type !== 0 || channel.isThread?.()) {
                            return res.status(400).json(APIResponse.badRequest(`Invalid group channel for: ${normalizedGroupKey}`));
                        }
                        if (!(guild.members.me?.permissionsIn(channel)?.has(PermissionsBitField.Flags.SendMessages) ?? false)) {
                            return res.status(400).json(APIResponse.badRequest(`Fahrstuhl cannot send messages in group channel: ${normalizedGroupKey}`));
                        }

                        eventChannels[loggingGroupKey(normalizedGroupKey)] = trimmed;
                    }
                }

                const logging = {
                    ...(config.logging || {}),
                    enabled: booleanWithDefault(req.body?.enabled, false),
                    channelId: channelId || null,
                    events: normalizeLoggingEvents(req.body?.events),
                    eventChannels,
                };
                setGuildConfig(guild.id, { logging });

                res.json(APIResponse.success({ guildId: guild.id, logging }, 'Logging settings updated', 'LOGGING_SETTINGS_UPDATED'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'LOGGING_SETTINGS_UPDATE_FAILED'));
            }
        });

        this.app.post('/guilds/:guildId/logging/test', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to test this guild logging settings'));

                const { getGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guild.id);
                const requestedGroup = String(req.body?.group || '').trim().toLowerCase();
                const groupToEventMap = {
                    member: 'memberJoin',
                    message: 'messageDelete',
                    moderation: 'moderation',
                    automod: 'automod',
                    tickets: 'tickets',
                    voice: 'voiceState',
                    structure: 'channelUpdate',
                };
                const eventKey = groupToEventMap[requestedGroup] || 'moderation';
                const sent = await sendServerLog(guild, config, eventKey, {
                    force: true,
                    title: 'Logging Test',
                    description: `Test log for **${requestedGroup || 'moderation'}** sent from dashboard in **${guild.name}**.`,
                    color: 0x3498db,
                    fields: [
                        { name: 'Server', value: `${guild.name}\n\`${guild.id}\``, inline: true },
                        { name: 'Group', value: requestedGroup || 'moderation', inline: true },
                        { name: 'Triggered By', value: access.user?.username ? `${access.user.username}` : 'Dashboard', inline: true },
                        { name: 'Fallback', value: 'If no group/event channel is set, global channel is used.', inline: false },
                    ],
                });
                if (!sent) {
                    return res.status(400).json(APIResponse.badRequest('Test log could not be sent. Check module, channel and permissions.'));
                }
                res.json(APIResponse.success({ guildId: guild.id, eventKey, group: requestedGroup || 'moderation' }, 'Test log sent', 'LOGGING_TEST_SENT'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'LOGGING_TEST_FAILED'));
            }
        });

        const renderWelcomePreview = (template, member, guild) => String(template || '')
            .replaceAll('{user}', `<@${member?.id || this.client.user?.id || '0'}>`)
            .replaceAll('{username}', member?.user?.username || member?.displayName || this.client.user?.username || 'Fahrstuhl')
            .replaceAll('{tag}', member?.user?.tag || member?.user?.username || this.client.user?.tag || 'Fahrstuhl')
            .replaceAll('{user.idname}', member?.user?.tag || member?.user?.username || this.client.user?.tag || 'Fahrstuhl')
            .replaceAll('{server}', guild.name)
            .replaceAll('{server.name}', guild.name)
            .replaceAll('{memberCount}', String(guild.memberCount || 0))
            .replaceAll('{server.member_count}', String(guild.memberCount || 0));

        const buildAiWelcomePreview = (welcome, member, guild) => {
            if (!welcome.aiWelcomeEnabled) return null;
            const character = String(welcome.aiCharacter || 'friendly').toLowerCase();
            const templates = {
                friendly: 'Hey {user}, schön dass du auf **{server}** gelandet bist. Mach es dir gemütlich, du bist Member #{memberCount}.',
                gaming: '{user} ist dem Squad beigetreten. Willkommen auf **{server}**, Member #{memberCount}. Bereit für die nächste Runde?',
                professional: 'Willkommen {user} auf **{server}**. Du bist Member #{memberCount}. Bitte lies dir kurz die wichtigsten Infos durch.',
                funny: '{user} ist reingestolpert und **{server}** ist offiziell ein kleines bisschen lauter. Willkommen, Member #{memberCount}.',
                anime: 'Willkommen {user}! Dein Abenteuer auf **{server}** beginnt jetzt. Member #{memberCount}, zeig uns deinen besten Arc.',
                support: 'Willkommen {user} auf **{server}**. Wenn du Hilfe brauchst, ist das Team für dich da.',
            };
            return renderWelcomePreview(templates[character] || templates.friendly, member, guild);
        };

        const findTextChannel = async (guild, channelId) => {
            const id = String(channelId || '').trim();
            if (!id) return null;
            const channel = await fetchGuildChannel(guild, id);
            if (!channel || channel.type !== 0 || channel.isThread?.()) return null;
            return channel;
        };

        this.app.get('/guilds/:guildId/welcome', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to this guild welcome settings'));

                const { getGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guild.id);
                const welcome = config.welcome && typeof config.welcome === 'object' ? config.welcome : {};
                const channels = guild.channels.cache
                    .filter(channel => channel.type === 0 && !channel.isThread?.())
                    .map(channel => ({
                        id: channel.id,
                        name: channel.name,
                        position: channel.position,
                        canSend: channel.permissionsFor(guild.members.me)?.has(PermissionsBitField.Flags.SendMessages) ?? false,
                    }))
                    .sort((a, b) => a.position - b.position);
                const botCanManageRoles = guild.members.me?.permissions?.has(PermissionsBitField.Flags.ManageRoles) ?? false;
                const botRolePosition = guild.members.me?.roles?.highest?.position ?? 0;
                const legacyChannelId = welcome.channelId || null;
                const roles = guild.roles.cache
                    .filter(role => role.name !== '@everyone')
                    .map(role => ({
                        id: role.id,
                        name: role.name,
                        color: role.hexColor,
                        position: role.position,
                        managed: role.managed,
                        assignable: botCanManageRoles && !role.managed && role.position < botRolePosition,
                    }))
                    .sort((a, b) => b.position - a.position);

                res.json(APIResponse.success({
                    guildId: guild.id,
                    guildName: guild.name,
                    channels,
                    roles,
                    permissions: {
                        manageRoles: botCanManageRoles,
                        sendMessages: guild.members.me?.permissions?.has(PermissionsBitField.Flags.SendMessages) ?? false,
                        botRolePosition,
                    },
                    settings: {
                        channelId: legacyChannelId,
                        welcomeChannelId: welcome.welcomeChannelId || legacyChannelId,
                        goodbyeChannelId: welcome.goodbyeChannelId || legacyChannelId,
                        welcomeEnabled: booleanWithDefault(welcome.welcomeEnabled, true),
                        welcomeMessage: welcome.welcomeMessage ?? 'Welcome {user} to {server}! You are member #{memberCount}.',
                        welcomeAsEmbed: booleanWithDefault(welcome.welcomeAsEmbed, false),
                        welcomeEmbedTitle: welcome.welcomeEmbedTitle || '',
                        welcomeEmbedColor: welcome.welcomeEmbedColor || '#51cf66',
                        welcomeEmbedFooter: welcome.welcomeEmbedFooter || '',
                        welcomeEmbedHeader: welcome.welcomeEmbedHeader || 'Header',
                        welcomeEmbedAvatar: dashboardImageValue(welcome.welcomeEmbedAvatar),
                        welcomeEmbedEmoji: welcome.welcomeEmbedEmoji || '',
                        welcomeEmbedThumbnail: dashboardImageValue(welcome.welcomeEmbedThumbnail),
                        welcomeEmbedImage: dashboardImageValue(welcome.welcomeEmbedImage),
                        welcomeEmbedFooterIcon: dashboardImageValue(welcome.welcomeEmbedFooterIcon),
                        welcomeEmbedFields: JSON.stringify(normalizeEmbedFields(welcome.welcomeEmbedFields)),
                        goodbyeEnabled: booleanWithDefault(welcome.goodbyeEnabled, false),
                        goodbyeMessage: welcome.goodbyeMessage ?? '{username} left {server}. We are now {memberCount} members.',
                        goodbyeAsEmbed: booleanWithDefault(welcome.goodbyeAsEmbed, false),
                        goodbyeEmbedHeader: welcome.goodbyeEmbedHeader || 'Header',
                        goodbyeEmbedAvatar: dashboardImageValue(welcome.goodbyeEmbedAvatar),
                        goodbyeEmbedEmoji: welcome.goodbyeEmbedEmoji || '',
                        goodbyeEmbedTitle: welcome.goodbyeEmbedTitle || '',
                        goodbyeEmbedColor: welcome.goodbyeEmbedColor || '#ff6b6b',
                        goodbyeEmbedFooter: welcome.goodbyeEmbedFooter || '',
                        goodbyeEmbedThumbnail: dashboardImageValue(welcome.goodbyeEmbedThumbnail),
                        goodbyeEmbedImage: dashboardImageValue(welcome.goodbyeEmbedImage),
                        goodbyeEmbedFooterIcon: dashboardImageValue(welcome.goodbyeEmbedFooterIcon),
                        goodbyeEmbedFields: JSON.stringify(normalizeEmbedFields(welcome.goodbyeEmbedFields)),
                        dmEnabled: booleanWithDefault(welcome.dmEnabled, false),
                        dmMessage: welcome.dmMessage ?? 'Welcome to {server}, {username}. Please read the rules and have fun.',
                        dmAsEmbed: booleanWithDefault(welcome.dmAsEmbed, false),
                        dmEmbedHeader: welcome.dmEmbedHeader || 'Header',
                        dmEmbedAvatar: dashboardImageValue(welcome.dmEmbedAvatar),
                        dmEmbedEmoji: welcome.dmEmbedEmoji || '',
                        dmEmbedTitle: welcome.dmEmbedTitle || '',
                        dmEmbedColor: welcome.dmEmbedColor || '#51cf66',
                        dmEmbedFooter: welcome.dmEmbedFooter || '',
                        dmEmbedThumbnail: dashboardImageValue(welcome.dmEmbedThumbnail),
                        dmEmbedImage: dashboardImageValue(welcome.dmEmbedImage),
                        dmEmbedFooterIcon: dashboardImageValue(welcome.dmEmbedFooterIcon),
                        dmEmbedFields: JSON.stringify(normalizeEmbedFields(welcome.dmEmbedFields)),
                        autoroleEnabled: booleanWithDefault(welcome.autoroleEnabled, false),
                        autoroleId: welcome.autoroleId || null,
                        aiWelcomeEnabled: dashboardBoolean(welcome.aiWelcomeEnabled),
                        aiCharacter: welcome.aiCharacter || 'friendly',
                        verificationEnabled: dashboardBoolean(welcome.verificationEnabled),
                        verificationChannelId: welcome.verificationChannelId || null,
                        verificationRoleId: welcome.verificationRoleId || null,
                        verificationHeader: welcome.verificationHeader || 'Header',
                        verificationAvatar: dashboardImageValue(welcome.verificationAvatar),
                        verificationTitle: welcome.verificationTitle ?? 'Verifizierung',
                        verificationMessage: welcome.verificationMessage ?? 'Um diesen Server zu betreten und alle Kanäle zu sehen, musst du zuerst beweisen, dass du ein Mensch bist.\n\nKlicke auf den Button unten, um zu starten.',
                        verificationEmoji: welcome.verificationEmoji || '',
                        verificationThumbnail: dashboardImageValue(welcome.verificationThumbnail),
                        verificationFooterIcon: dashboardImageValue(welcome.verificationFooterIcon),
                        verificationFooter: welcome.verificationFooter || 'Footer',
                        verificationFields: JSON.stringify(normalizeEmbedFields(welcome.verificationFields)),
                        verificationButtonLabel: welcome.verificationButtonLabel ?? 'Verifizieren',
                        verificationButtonEmoji: welcome.verificationButtonEmoji || '',
                        verificationButtonStyle: verificationButtonStyle(welcome.verificationButtonStyle),
                        verificationCountButtonEnabled: dashboardBoolean(welcome.verificationCountButtonEnabled),
                        verificationCountButtonLabel: welcome.verificationCountButtonLabel ?? 'Verifiziert: {count}',
                        verificationCount: verificationCountValue(welcome.verificationCount),
                        welcomeCardEnabled: dashboardBoolean(welcome.welcomeCardEnabled),
                        welcomeCardFont: welcome.welcomeCardFont || 'Inter',
                        welcomeCardTextColor: welcome.welcomeCardTextColor || '#ffffff',
                        welcomeCardBackgroundColor: welcome.welcomeCardBackgroundColor || '#111827',
                        welcomeCardOverlayOpacity: welcome.welcomeCardOverlayOpacity ?? 75,
                        welcomeCardBackgroundImage: welcome.welcomeCardBackgroundImage || '',
                        welcomeCardTitle: welcome.welcomeCardTitle || '{username} just joined the server',
                        welcomeCardSubtitle: welcome.welcomeCardSubtitle || 'Member #{memberCount}',
                        dmCardEnabled: dashboardBoolean(welcome.dmCardEnabled),
                        dmCardTitle: welcome.dmCardTitle || 'Welcome to {server}',
                        dmCardSubtitle: welcome.dmCardSubtitle || "You're member #{memberCount}",
                    },
                }, 'Welcome settings fetched', 'WELCOME_SETTINGS_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'WELCOME_SETTINGS_FAILED'));
            }
        });

        this.app.post('/guilds/:guildId/welcome', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to configure this guild welcome settings'));

                const welcomeChannelId = String(req.body?.welcomeChannelId || req.body?.channelId || '').trim();
                const goodbyeChannelId = String(req.body?.goodbyeChannelId || req.body?.channelId || '').trim();
                const autoroleId = String(req.body?.autoroleId || '').trim();
                const verificationChannelId = String(req.body?.verificationChannelId || '').trim();
                const verificationRoleId = String(req.body?.verificationRoleId || '').trim();
                const autoroleEnabled = dashboardBoolean(req.body?.autoroleEnabled);
                const welcomeMessage = String(req.body?.welcomeMessage || '').trim();
                const goodbyeMessage = String(req.body?.goodbyeMessage || '').trim();
                const dmMessage = String(req.body?.dmMessage || '').trim();
                if (welcomeChannelId && !(await findTextChannel(guild, welcomeChannelId))) {
                    return res.status(400).json(APIResponse.badRequest('Welcome channel not found or not a text channel'));
                }
                if (goodbyeChannelId && !(await findTextChannel(guild, goodbyeChannelId))) {
                    return res.status(400).json(APIResponse.badRequest('Goodbye channel not found or not a text channel'));
                }
                if (verificationChannelId && !(await findTextChannel(guild, verificationChannelId))) {
                    return res.status(400).json(APIResponse.badRequest('Verification channel not found or not a text channel'));
                }
                if (welcomeMessage.length > 2000 || goodbyeMessage.length > 2000 || dmMessage.length > 2000) {
                    return res.status(400).json(APIResponse.badRequest('Messages must be 2000 characters or less'));
                }
                if (autoroleEnabled && !autoroleId) {
                    return res.status(400).json(APIResponse.badRequest('Choose an autorole or disable autorole'));
                }
                if (autoroleId) {
                    const role = await fetchGuildRole(guild, autoroleId);
                    if (!role) return res.status(400).json(APIResponse.badRequest('Autorole not found in guild'));
                    const botRolePosition = guild.members.me?.roles?.highest?.position ?? 0;
                    const canManage = guild.members.me?.permissions?.has(PermissionsBitField.Flags.ManageRoles) ?? false;
                    if (!canManage || role.managed || role.position >= botRolePosition) {
                        return res.status(400).json(APIResponse.badRequest('Fahrstuhl cannot assign this role. Move the bot role above it and allow Manage Roles.'));
                    }
                }
                if (verificationRoleId) {
                    const role = await fetchGuildRole(guild, verificationRoleId);
                    if (!role) return res.status(400).json(APIResponse.badRequest('Verification role not found in guild'));
                    const botRolePosition = guild.members.me?.roles?.highest?.position ?? 0;
                    const canManage = guild.members.me?.permissions?.has(PermissionsBitField.Flags.ManageRoles) ?? false;
                    if (!canManage || role.managed || role.position >= botRolePosition) {
                        return res.status(400).json(APIResponse.badRequest('Fahrstuhl cannot assign this verification role. Move the bot role above it and allow Manage Roles.'));
                    }
                }

                const { getGuildConfig, setGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guild.id);
                const modules = { ...(config.modules || {}), welcome: true };
                const welcome = {
                    ...(config.welcome || {}),
                    channelId: welcomeChannelId || goodbyeChannelId || null,
                    welcomeChannelId: welcomeChannelId || null,
                    goodbyeChannelId: goodbyeChannelId || null,
                    welcomeEnabled: dashboardBoolean(req.body?.welcomeEnabled),
                    welcomeMessage: welcomeMessage || 'Welcome {user} to {server}! You are member #{memberCount}.',
                    welcomeAsEmbed: dashboardBoolean(req.body?.welcomeAsEmbed),
                    welcomeEmbedTitle: String(req.body?.welcomeEmbedTitle || '').slice(0, 256),
                    welcomeEmbedColor: String(req.body?.welcomeEmbedColor || '#51cf66'),
                    welcomeEmbedFooter: String(req.body?.welcomeEmbedFooter || '').slice(0, 128),
                    welcomeEmbedHeader: String(req.body?.welcomeEmbedHeader || 'Header').slice(0, 80),
                    welcomeEmbedAvatar: dashboardImageValue(req.body?.welcomeEmbedAvatar),
                    welcomeEmbedEmoji: String(req.body?.welcomeEmbedEmoji || '').slice(0, 32),
                    welcomeEmbedThumbnail: dashboardImageValue(req.body?.welcomeEmbedThumbnail),
                    welcomeEmbedImage: dashboardImageValue(req.body?.welcomeEmbedImage),
                    welcomeEmbedFooterIcon: dashboardImageValue(req.body?.welcomeEmbedFooterIcon),
                    welcomeEmbedFields: JSON.stringify(normalizeEmbedFields(req.body?.welcomeEmbedFields)),
                    goodbyeEnabled: dashboardBoolean(req.body?.goodbyeEnabled),
                    goodbyeMessage: goodbyeMessage || '{username} left {server}. We are now {memberCount} members.',
                    goodbyeAsEmbed: dashboardBoolean(req.body?.goodbyeAsEmbed),
                    goodbyeEmbedHeader: String(req.body?.goodbyeEmbedHeader || 'Header').slice(0, 80),
                    goodbyeEmbedAvatar: dashboardImageValue(req.body?.goodbyeEmbedAvatar),
                    goodbyeEmbedEmoji: String(req.body?.goodbyeEmbedEmoji || '').slice(0, 32),
                    goodbyeEmbedTitle: String(req.body?.goodbyeEmbedTitle || '').slice(0, 256),
                    goodbyeEmbedColor: String(req.body?.goodbyeEmbedColor || '#ff6b6b'),
                    goodbyeEmbedFooter: String(req.body?.goodbyeEmbedFooter || '').slice(0, 128),
                    goodbyeEmbedThumbnail: dashboardImageValue(req.body?.goodbyeEmbedThumbnail),
                    goodbyeEmbedImage: dashboardImageValue(req.body?.goodbyeEmbedImage),
                    goodbyeEmbedFooterIcon: dashboardImageValue(req.body?.goodbyeEmbedFooterIcon),
                    goodbyeEmbedFields: JSON.stringify(normalizeEmbedFields(req.body?.goodbyeEmbedFields)),
                    dmEnabled: dashboardBoolean(req.body?.dmEnabled),
                    dmMessage: dmMessage || 'Welcome to {server}, {username}. Please read the rules and have fun.',
                    dmAsEmbed: dashboardBoolean(req.body?.dmAsEmbed),
                    dmEmbedHeader: String(req.body?.dmEmbedHeader || 'Header').slice(0, 80),
                    dmEmbedAvatar: dashboardImageValue(req.body?.dmEmbedAvatar),
                    dmEmbedEmoji: String(req.body?.dmEmbedEmoji || '').slice(0, 32),
                    dmEmbedTitle: String(req.body?.dmEmbedTitle || '').slice(0, 256),
                    dmEmbedColor: String(req.body?.dmEmbedColor || '#51cf66'),
                    dmEmbedFooter: String(req.body?.dmEmbedFooter || '').slice(0, 128),
                    dmEmbedThumbnail: dashboardImageValue(req.body?.dmEmbedThumbnail),
                    dmEmbedImage: dashboardImageValue(req.body?.dmEmbedImage),
                    dmEmbedFooterIcon: dashboardImageValue(req.body?.dmEmbedFooterIcon),
                    dmEmbedFields: JSON.stringify(normalizeEmbedFields(req.body?.dmEmbedFields)),
                    autoroleEnabled,
                    autoroleId: autoroleId || null,
                    aiWelcomeEnabled: dashboardBoolean(req.body?.aiWelcomeEnabled),
                    aiCharacter: String(req.body?.aiCharacter || 'friendly').slice(0, 48),
                    verificationEnabled: dashboardBoolean(req.body?.verificationEnabled),
                    verificationChannelId: verificationChannelId || null,
                    verificationRoleId: verificationRoleId || null,
                    verificationHeader: String(req.body?.verificationHeader || 'Header').slice(0, 80),
                    verificationAvatar: dashboardImageValue(req.body?.verificationAvatar),
                    verificationTitle: String(req.body?.verificationTitle || 'Verifizierung').slice(0, 120),
                    verificationMessage: String(req.body?.verificationMessage || 'Um diesen Server zu betreten und alle Kanäle zu sehen, musst du zuerst beweisen, dass du ein Mensch bist.\n\nKlicke auf den Button unten, um zu starten.').slice(0, 1000),
                    verificationEmoji: String(req.body?.verificationEmoji || '').slice(0, 32),
                    verificationThumbnail: dashboardImageValue(req.body?.verificationThumbnail),
                    verificationFooterIcon: dashboardImageValue(req.body?.verificationFooterIcon),
                    verificationFooter: String(req.body?.verificationFooter || 'Footer').slice(0, 128),
                    verificationFields: JSON.stringify(normalizeEmbedFields(req.body?.verificationFields)),
                    verificationButtonLabel: String(req.body?.verificationButtonLabel || 'Verifizieren').slice(0, 80),
                    verificationButtonEmoji: String(req.body?.verificationButtonEmoji || '').slice(0, 32),
                    verificationButtonStyle: verificationButtonStyle(req.body?.verificationButtonStyle),
                    verificationCountButtonEnabled: dashboardBoolean(req.body?.verificationCountButtonEnabled),
                    verificationCountButtonLabel: String(req.body?.verificationCountButtonLabel || 'Verifiziert: {count}').slice(0, 80),
                    verificationCount: verificationCountValue(req.body?.verificationCount),
                    welcomeCardEnabled: dashboardBoolean(req.body?.welcomeCardEnabled),
                    welcomeCardFont: String(req.body?.welcomeCardFont || 'Inter').slice(0, 40),
                    welcomeCardTextColor: String(req.body?.welcomeCardTextColor || '#ffffff').slice(0, 16),
                    welcomeCardBackgroundColor: String(req.body?.welcomeCardBackgroundColor || '#111827').slice(0, 16),
                    welcomeCardOverlayOpacity: Math.max(0, Math.min(100, Number(req.body?.welcomeCardOverlayOpacity ?? 75))),
                    welcomeCardBackgroundImage: String(req.body?.welcomeCardBackgroundImage || '').slice(0, 500),
                    welcomeCardTitle: String(req.body?.welcomeCardTitle || '{username} just joined the server').slice(0, 160),
                    welcomeCardSubtitle: String(req.body?.welcomeCardSubtitle || 'Member #{memberCount}').slice(0, 160),
                    dmCardEnabled: dashboardBoolean(req.body?.dmCardEnabled),
                    dmCardTitle: String(req.body?.dmCardTitle || 'Welcome to {server}').slice(0, 160),
                    dmCardSubtitle: String(req.body?.dmCardSubtitle || "You're member #{memberCount}").slice(0, 160),
                };
                setGuildConfig(guild.id, { modules, welcome });

                // Nach Änderung: Bot-Cache neu laden, damit Änderungen sofort übernommen werden
                const { reloadCache } = require("../utils/config");
                if (typeof reloadCache === "function") {
                    reloadCache().catch(e => console.error("Config reload failed:", e));
                }

                res.json(APIResponse.success({ guildId: guild.id, welcome }, 'Welcome settings updated', 'WELCOME_SETTINGS_UPDATED'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'WELCOME_SETTINGS_UPDATE_FAILED'));
            }
        });

        this.app.post('/guilds/:guildId/welcome/verification/publish', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to publish verification setup'));

                const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
                const canManageRoles = me?.permissions?.has(PermissionsBitField.Flags.ManageRoles) ?? false;
                const canManageChannels = me?.permissions?.has(PermissionsBitField.Flags.ManageChannels) ?? false;
                if (!canManageRoles || !canManageChannels) {
                    return res.status(400).json(APIResponse.badRequest('Fahrstuhl needs Manage Roles and Manage Channels to publish verification setup'));
                }

                const { getGuildConfig, setGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guild.id);
                const current = config.welcome && typeof config.welcome === 'object' ? config.welcome : {};
                const title = String(req.body?.verificationTitle || current.verificationTitle || 'Verifizierung').slice(0, 120);
                const description = String(req.body?.verificationMessage || current.verificationMessage || 'Um diesen Server zu betreten und alle Kanäle zu sehen, musst du zuerst beweisen, dass du ein Mensch bist.\n\nKlicke auf den Button unten, um zu starten.').slice(0, 1000);
                const header = String(req.body?.verificationHeader || current.verificationHeader || 'Header').slice(0, 80);
                const rawAvatar = dashboardImageValue(req.body?.verificationAvatar || current.verificationAvatar);
                const avatar = discordImageUrl(rawAvatar);
                const emoji = String(req.body?.verificationEmoji || current.verificationEmoji || '').slice(0, 32);
                const rawThumbnail = dashboardImageValue(req.body?.verificationThumbnail || current.verificationThumbnail);
                const rawFooterIcon = dashboardImageValue(req.body?.verificationFooterIcon || current.verificationFooterIcon);
                const thumbnail = discordImageUrl(rawThumbnail);
                const footerIcon = discordImageUrl(rawFooterIcon);
                const footer = String(req.body?.verificationFooter || current.verificationFooter || 'Footer').slice(0, 128);
                const fields = normalizeEmbedFields(req.body?.verificationFields || current.verificationFields);
                const buttonLabel = String(req.body?.verificationButtonLabel || current.verificationButtonLabel || 'Verifizieren').slice(0, 80);
                const buttonEmoji = String(req.body?.verificationButtonEmoji || current.verificationButtonEmoji || '').slice(0, 32);
                const buttonStyle = verificationButtonStyle(req.body?.verificationButtonStyle || current.verificationButtonStyle);
                const countButtonEnabled = req.body?.verificationCountButtonEnabled !== undefined
                    ? dashboardBoolean(req.body.verificationCountButtonEnabled)
                    : dashboardBoolean(current.verificationCountButtonEnabled);
                const countButtonLabel = String(req.body?.verificationCountButtonLabel || current.verificationCountButtonLabel || 'Verifiziert: {count}').slice(0, 80);
                const verificationCount = verificationCountValue(req.body?.verificationCount ?? current.verificationCount);
                const requestedRoleId = String(req.body?.verificationRoleId || '').trim();
                const requestedChannelId = String(req.body?.verificationChannelId || '').trim();

                let role = requestedRoleId ? await fetchGuildRole(guild, requestedRoleId) : (current.verificationRoleId ? await fetchGuildRole(guild, current.verificationRoleId) : null);
                if (requestedRoleId && !role) return res.status(400).json(APIResponse.badRequest('Selected verification role was not found'));
                if (!role) {
                    role = await guild.roles.create({
                        name: 'Verifiziert',
                        permissions: [],
                        reason: 'Fahrstuhl welcome verification setup',
                    });
                }
                if (role.managed || role.position >= (me?.roles?.highest?.position ?? 0)) {
                    return res.status(400).json(APIResponse.badRequest('Fahrstuhl cannot assign this verification role. Move the bot role above it or choose another role.'));
                }

                let channel = requestedChannelId ? await fetchGuildChannel(guild, requestedChannelId) : (current.verificationChannelId ? await fetchGuildChannel(guild, current.verificationChannelId) : null);
                if (requestedChannelId && (!channel || channel.type !== 0)) {
                    return res.status(400).json(APIResponse.badRequest('Selected verification channel was not found or is not a text channel'));
                }
                if (!channel || channel.type !== 0) {
                    channel = await guild.channels.create({
                        name: 'verifizierung',
                        type: 0,
                        reason: 'Fahrstuhl welcome verification setup',
                        permissionOverwrites: [
                            {
                                id: guild.roles.everyone.id,
                                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory],
                                deny: [PermissionsBitField.Flags.SendMessages],
                            },
                            {
                                id: role.id,
                                deny: [PermissionsBitField.Flags.ViewChannel],
                            },
                        ],
                    });
                }
                if (!(channel.permissionsFor(me)?.has(PermissionsBitField.Flags.SendMessages) ?? false)) {
                    return res.status(400).json(APIResponse.badRequest('Fahrstuhl cannot send messages in the verification channel'));
                }

                const embed = new EmbedBuilder()
                    .setTitle(`${emoji ? `${emoji} ` : ''}${title || 'Verifizierung'}`.slice(0, 256))
                    .setDescription(description || 'Klicke auf den Button unten, um zu starten.')
                    .setColor(0x3b82f6);
                if (header || avatar) embed.setAuthor(avatar ? { name: header || guild.name, iconURL: avatar } : { name: header || guild.name });
                if (footer || footerIcon) embed.setFooter(footerIcon ? { text: footer || 'Fahrstuhl Verification', iconURL: footerIcon } : { text: footer || 'Fahrstuhl Verification' });
                if (thumbnail) embed.setThumbnail(thumbnail);
                fields.forEach(field => embed.addFields(field));
                const verifyButton = (() => {
                    const button = new ButtonBuilder()
                        .setCustomId(`welcome:verify:${guild.id}`)
                        .setLabel(buttonLabel || 'Verifizieren')
                        .setStyle(discordButtonStyle(buttonStyle));
                    if (buttonEmoji) button.setEmoji(buttonEmoji);
                    return button;
                })();
                const rowComponents = [verifyButton];
                if (countButtonEnabled) {
                    rowComponents.push(
                        new ButtonBuilder()
                            .setCustomId(`welcome:verify-count:${guild.id}`)
                            .setLabel(renderVerificationCountLabel(countButtonLabel, verificationCount))
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true)
                    );
                }
                const row = new ActionRowBuilder().addComponents(...rowComponents);
                const sent = await channel.send({ embeds: [embed], components: [row] });

                const welcome = {
                    ...current,
                    verificationEnabled: true,
                    verificationChannelId: channel.id,
                    verificationRoleId: role.id,
                    verificationHeader: header,
                    verificationAvatar: rawAvatar,
                    verificationTitle: title,
                    verificationMessage: description,
                    verificationEmoji: emoji,
                    verificationThumbnail: rawThumbnail,
                    verificationFooterIcon: rawFooterIcon,
                    verificationFooter: footer,
                    verificationFields: JSON.stringify(fields.slice(0, 10)),
                    verificationButtonLabel: buttonLabel || 'Verifizieren',
                    verificationButtonEmoji: buttonEmoji,
                    verificationButtonStyle: buttonStyle,
                    verificationCountButtonEnabled: countButtonEnabled,
                    verificationCountButtonLabel: countButtonLabel || 'Verifiziert: {count}',
                    verificationCount,
                    verificationPublishedAt: new Date().toISOString(),
                    verificationMessageId: sent.id,
                };
                setGuildConfig(guild.id, {
                    modules: { ...(config.modules || {}), welcome: true },
                    welcome,
                });

                const { reloadCache } = require("../utils/config");
                if (typeof reloadCache === "function") {
                    reloadCache().catch(e => console.error("Config reload failed:", e));
                }

                res.json(APIResponse.success({
                    guildId: guild.id,
                    channelId: channel.id,
                    roleId: role.id,
                    messageId: sent.id,
                }, 'Verification setup published', 'WELCOME_VERIFICATION_PUBLISHED'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'WELCOME_VERIFICATION_PUBLISH_FAILED'));
            }
        });

        this.app.post('/guilds/:guildId/welcome/test', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to test this guild welcome settings'));

                const { getGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guild.id);
                const welcome = config.welcome && typeof config.welcome === 'object' ? config.welcome : {};
                const type = String(req.body?.type || 'welcome').toLowerCase();
                const isGoodbye = type === 'goodbye';
                const channelId = isGoodbye
                    ? (welcome.goodbyeChannelId || welcome.channelId)
                    : (welcome.welcomeChannelId || welcome.channelId);
                const channel = findTextChannel(guild, channelId);
                if (!channel) {
                    return res.status(400).json(APIResponse.badRequest(isGoodbye ? 'Goodbye channel is not configured' : 'Welcome channel is not configured'));
                }
                if (!(channel.permissionsFor(guild.members.me)?.has(PermissionsBitField.Flags.SendMessages) ?? false)) {
                    return res.status(400).json(APIResponse.badRequest('Fahrstuhl cannot send messages in that channel'));
                }

                const member = guild.members.me || await guild.members.fetchMe().catch(() => null);

                const aiWelcomeText = !isGoodbye ? buildAiWelcomePreview(welcome, member, guild) : null;
                const template = isGoodbye
                    ? (welcome.goodbyeMessage || '{username} left {server}. We are now {memberCount} members.')
                    : (welcome.welcomeMessage || 'Welcome {user} to {server}! You are member #{memberCount}.');
                const asEmbed = isGoodbye ? dashboardBoolean(welcome.goodbyeAsEmbed) : dashboardBoolean(welcome.welcomeAsEmbed);
                const previewText = `[Test] ${aiWelcomeText || renderWelcomePreview(template, member, guild)}`;
                if (asEmbed) {
                    const embed = new EmbedBuilder()
                        .setDescription(previewText)
                        .setColor(isGoodbye ? 0xff6b6b : 0x51cf66)
                        .setTimestamp();
                    const testImage = !isGoodbye ? discordImageUrl(welcome.welcomeEmbedImage) : '';
                    if (testImage) {
                        embed.setImage(testImage);
                    }
                    await channel.send({
                        embeds: [embed],
                        allowedMentions: { parse: [] },
                    });
                } else {
                    await channel.send({
                        content: previewText,
                        allowedMentions: { parse: [] },
                    });
                }

                res.json(APIResponse.success({ guildId: guild.id, channelId: channel.id, type }, 'Welcome test sent', 'WELCOME_TEST_SENT'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'WELCOME_TEST_FAILED'));
            }
        });

        // Setup health check — returns structured issue list for portal.php wizard
        this.app.get('/guilds/:guildId/setup-health', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access'));

                const { getGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guild.id);
                const modules = config.modules || {};
                const welcome = config.welcome || {};
                const logging = config.logging || {};
                const tickets = config.tickets || {};
                const me = guild.members.me;
                const perms = me?.permissions;
                const gid = guild.id;

                const issues = [];

                // Permission checks
                const permChecks = [
                    { flag: PermissionsBitField.Flags.ManageChannels, label: 'Manage Channels', hint: 'Needed for tickets and temp voice.' },
                    { flag: PermissionsBitField.Flags.ManageRoles, label: 'Manage Roles', hint: 'Needed for level rewards and reaction roles.' },
                    { flag: PermissionsBitField.Flags.SendMessages, label: 'Send Messages', hint: 'Needed to send announcements and tickets.' },
                    { flag: PermissionsBitField.Flags.EmbedLinks, label: 'Embed Links', hint: 'Needed to send rich embeds.' },
                    { flag: PermissionsBitField.Flags.ModerateMembers, label: 'Moderate Members', hint: 'Needed for timeouts via /mod.' },
                ];
                for (const { flag, label, hint } of permChecks) {
                    if (!perms?.has(flag)) {
                        issues.push({ key: `perm_${label.replace(/ /g, '_').toLowerCase()}`, severity: 'error', icon: '🔒', label: `Missing permission: ${label}`, hint, fixUrl: null });
                    }
                }

                // Welcome
                const welcomeEnabled = booleanWithDefault(modules.welcome, false);
                const welcomeChannel = welcome.welcomeChannelId || welcome.channelId || null;
                if (!welcomeEnabled) {
                    issues.push({ key: 'welcome_disabled', severity: 'warn', icon: '👋', label: 'Welcome module is disabled', hint: 'Activate Welcome to greet new members automatically.', fixUrl: buildDashboardPageLink('modules', { guildId: gid }) });
                } else if (!welcomeChannel) {
                    issues.push({ key: 'welcome_no_channel', severity: 'warn', icon: '👋', label: 'Welcome channel not set', hint: 'Members join but no greeting is sent.', fixUrl: buildDashboardPageLink('welcome', { guildId: gid }) });
                }

                // Logging
                const loggingEnabled = booleanWithDefault(modules.logging, false);
                const logChannelId = logging.channelId || null;
                if (!loggingEnabled) {
                    issues.push({ key: 'logging_disabled', severity: 'warn', icon: '📜', label: 'Logging module is disabled', hint: 'Without logging you cannot track bans, edits or joins.', fixUrl: buildDashboardPageLink('modules', { guildId: gid }) });
                } else if (!logChannelId) {
                    issues.push({ key: 'logging_no_channel', severity: 'warn', icon: '📜', label: 'Log channel not configured', hint: 'Enable logging and set a channel to receive audit logs.', fixUrl: buildDashboardPageLink('logging', { guildId: gid }) });
                }

                // Tickets
                const ticketsEnabled = booleanWithDefault(modules.tickets, false);
                const ticketPanelSet = !!(tickets.panelMessageId && tickets.panelChannelId);
                if (!ticketsEnabled) {
                    issues.push({ key: 'tickets_disabled', severity: 'info', icon: '🎫', label: 'Ticket module is disabled', hint: 'Activate Tickets to let members open support requests.', fixUrl: buildDashboardPageLink('modules', { guildId: gid }) });
                } else if (!tickets.staffRoleId) {
                    issues.push({ key: 'tickets_no_staff', severity: 'warn', icon: '🎫', label: 'Ticket staff role not set', hint: 'Without a staff role, no one is pinged when tickets are opened.', fixUrl: buildDashboardPageLink('tickets', { guildId: gid }) });
                } else if (!ticketPanelSet) {
                    issues.push({ key: 'tickets_no_panel', severity: 'info', icon: '🎫', label: 'Ticket panel not deployed', hint: 'Send the ticket panel to a channel so members can open tickets.', fixUrl: buildDashboardPageLink('tickets', { guildId: gid }) });
                }

                const errCount = issues.filter(i => i.severity === 'error').length;
                const warnCount = issues.filter(i => i.severity === 'warn').length;
                const health = errCount > 0 ? 'critical' : warnCount > 0 ? 'warn' : 'ok';

                res.json(APIResponse.success({
                    guildId: gid,
                    health,
                    issues,
                    summary: { errors: errCount, warnings: warnCount, infos: issues.filter(i => i.severity === 'info').length },
                }, 'Setup health checked', 'SETUP_HEALTH_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'SETUP_HEALTH_FAILED'));
            }
        });

        this.app.get('/guilds/:guildId/tickets', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to this guild ticket settings'));

                const { getGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guild.id);
                const tickets = config.tickets && typeof config.tickets === 'object' ? config.tickets : {};
                const slaMinutes = normalizeTicketSlaMinutes(tickets.slaMinutes, 240);
                const categories = guild.channels.cache
                    .filter(channel => channel.type === 4)
                    .map(channel => ({
                        id: channel.id,
                        name: channel.name,
                        position: channel.position,
                    }))
                    .sort((a, b) => a.position - b.position);
                const channels = guild.channels.cache
                    .filter(channel => channel.type === 0 && !channel.isThread?.())
                    .map(channel => ({
                        id: channel.id,
                        name: channel.name,
                        position: channel.position,
                    }))
                    .sort((a, b) => a.position - b.position);
                const roles = guild.roles.cache
                    .filter(role => role.name !== '@everyone')
                    .map(role => ({
                        id: role.id,
                        name: role.name,
                        color: role.hexColor,
                        position: role.position,
                        managed: role.managed,
                    }))
                    .sort((a, b) => b.position - a.position);

                const openTickets = guild.channels.cache
                    .filter(channel => channel.type === 0 && channel.topic?.includes('fahrstuhl-ticket:'))
                    .map(channel => {
                        const info = ticketManager.parseTicketTopic(channel.topic);
                        const createdMs = channel.createdTimestamp || Date.now();
                        const ageMinutes = Math.max(0, Math.floor((Date.now() - createdMs) / 60000));
                        return {
                            id: channel.id,
                            name: channel.name,
                            topic: channel.topic,
                            ownerId: info.ownerId,
                            ownerTag: info.ownerTag,
                            priority: info.priority,
                            type: info.type,
                            status: info.status,
                            claimedBy: info.claimedBy,
                            reason: info.reason,
                            ageMinutes,
                            slaBreached: slaMinutes > 0 && ageMinutes >= slaMinutes,
                            createdAt: channel.createdAt?.toISOString?.() || null,
                        };
                    })
                    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
                const [ticketStats, recentTickets] = await Promise.all([
                    ticketStore.getTicketStats(guild.id, { slaMinutes }),
                    ticketStore.getRecentTickets(guild.id, 20),
                ]);

                res.json(APIResponse.success({
                    guildId: guild.id,
                    guildName: guild.name,
                    categories,
                    channels,
                    roles,
                    openTickets,
                    ticketStats,
                    recentTickets,
                    permissions: {
                        manageChannels: guild.members.me?.permissions?.has(PermissionsBitField.Flags.ManageChannels) ?? false,
                        sendMessages: guild.members.me?.permissions?.has(PermissionsBitField.Flags.SendMessages) ?? false,
                    },
                    settings: {
                        categoryId: tickets.categoryId || null,
                        staffRoleId: tickets.staffRoleId || null,
                        transcriptChannelId: tickets.transcriptChannelId || null,
                        defaultPriority: tickets.defaultPriority || 'normal',
                        closeDelaySeconds: tickets.closeDelaySeconds ?? 5,
                        slaMinutes,
                        requireCloseReason: !!tickets.requireCloseReason,
                        enableClaiming: booleanWithDefault(tickets.enableClaiming, true),
                        enableTicketTypes: booleanWithDefault(tickets.enableTicketTypes, false),
                        ticketTypes: normalizeTicketTypes(tickets.ticketTypes),
                        panelTitle: tickets.panelTitle ?? 'Need help?',
                        panelDescription: tickets.panelDescription ?? 'Open a private support ticket and the team will help you.',
                        panelButtonLabel: tickets.panelButtonLabel ?? 'Open Ticket',
                        panelChannelId: tickets.panelChannelId || null,
                        panelMessageId: tickets.panelMessageId || null,
                    },
                }, 'Ticket settings fetched', 'TICKET_SETTINGS_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'TICKET_SETTINGS_FAILED'));
            }
        });

        this.app.post('/guilds/:guildId/tickets', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to configure this guild tickets'));

                const categoryId = String(req.body?.categoryId || '').trim();
                const staffRoleId = String(req.body?.staffRoleId || '').trim();
                const transcriptChannelId = String(req.body?.transcriptChannelId || '').trim();
                if (categoryId) {
                    const category = await fetchGuildChannel(guild, categoryId);
                    if (!category || category.type !== 4) {
                        return res.status(400).json(APIResponse.badRequest('Ticket category not found'));
                    }
                }
                if (transcriptChannelId) {
                    const transcriptChannel = await fetchGuildChannel(guild, transcriptChannelId);
                    if (!transcriptChannel || transcriptChannel.type !== 0) {
                        return res.status(400).json(APIResponse.badRequest('Transcript channel not found'));
                    }
                }
                if (staffRoleId && !(await fetchGuildRole(guild, staffRoleId))) {
                    return res.status(400).json(APIResponse.badRequest('Staff role not found'));
                }

                const { getGuildConfig, setGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guild.id);
                const tickets = {
                    ...(config.tickets || {}),
                    categoryId: categoryId || null,
                    staffRoleId: staffRoleId || null,
                    transcriptChannelId: transcriptChannelId || null,
                    defaultPriority: ['low', 'normal', 'high'].includes(req.body?.defaultPriority) ? req.body.defaultPriority : 'normal',
                    closeDelaySeconds: Math.max(1, Math.min(30, Number(req.body?.closeDelaySeconds) || 5)),
                    slaMinutes: normalizeTicketSlaMinutes(req.body?.slaMinutes, 240),
                    requireCloseReason: dashboardBoolean(req.body?.requireCloseReason),
                    enableClaiming: booleanWithDefault(req.body?.enableClaiming, true),
                    enableTicketTypes: dashboardBoolean(req.body?.enableTicketTypes),
                    ticketTypes: normalizeTicketTypes(req.body?.ticketTypes),
                    panelTitle: String(req.body?.panelTitle || config.tickets?.panelTitle || 'Need help?').slice(0, 120),
                    panelDescription: String(req.body?.panelDescription || config.tickets?.panelDescription || 'Open a private support ticket and the team will help you.').slice(0, 1200),
                    panelButtonLabel: String(req.body?.panelButtonLabel || config.tickets?.panelButtonLabel || 'Open Ticket').slice(0, 80),
                };
                setGuildConfig(guild.id, { tickets });

                res.json(APIResponse.success({ guildId: guild.id, tickets }, 'Ticket settings updated', 'TICKET_SETTINGS_UPDATED'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'TICKET_SETTINGS_UPDATE_FAILED'));
            }
        });

        this.app.post('/guilds/:guildId/tickets/panel', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to send ticket panels'));

                const { getGuildConfig, setGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guild.id);
                const limits = await this.getGuildPremiumLimits(guild.id);

                const channelId = String(req.body?.channelId || '').trim();
                const channel = guild.channels.cache.get(channelId)
                    || await guild.channels.fetch(channelId).catch(() => null);
                if (!channel || channel.type !== 0 || !channel.isTextBased?.()) {
                    return res.status(400).json(APIResponse.badRequest('Panel channel not found'));
                }

                const title = String(req.body?.panelTitle || 'Need help?').trim().slice(0, 120);
                const description = String(req.body?.panelDescription || 'Open a private support ticket and the team will help you.').trim().slice(0, 1200);
                const buttonLabel = String(req.body?.panelButtonLabel || 'Open Ticket').trim().slice(0, 80);
                const incomingTicketSettings = {
                    categoryId: String(req.body?.categoryId || '').trim() || null,
                    staffRoleId: String(req.body?.staffRoleId || '').trim() || null,
                    transcriptChannelId: String(req.body?.transcriptChannelId || '').trim() || null,
                    defaultPriority: ['low', 'normal', 'high'].includes(req.body?.defaultPriority) ? req.body.defaultPriority : 'normal',
                    closeDelaySeconds: Math.max(1, Math.min(30, Number(req.body?.closeDelaySeconds) || 5)),
                    slaMinutes: normalizeTicketSlaMinutes(req.body?.slaMinutes, 240),
                    requireCloseReason: dashboardBoolean(req.body?.requireCloseReason),
                    enableClaiming: booleanWithDefault(req.body?.enableClaiming, true),
                    enableTicketTypes: dashboardBoolean(req.body?.enableTicketTypes),
                    ticketTypes: normalizeTicketTypes(req.body?.ticketTypes),
                };

                const embed = new EmbedBuilder()
                    .setColor(0xF0B232)
                    .setTitle(title)
                    .setDescription(description)
                    .setFooter({ text: 'Fahrstuhl Tickets' })
                    .setTimestamp();
                const settings = {
                    ...(config.tickets && typeof config.tickets === 'object' ? config.tickets : {}),
                    ...incomingTicketSettings,
                    panelTitle: title,
                    panelDescription: description,
                    panelButtonLabel: buttonLabel,
                };

                const existingPanelMessageId = config.tickets?.panelMessageId;
                const existingPanelChannelId = config.tickets?.panelChannelId;
                const panelCount = existingPanelMessageId ? 1 : 0;
                const isNewPanelDeployment = !existingPanelMessageId || existingPanelChannelId !== channel.id;
                if (limits.ticketPanels >= 0 && isNewPanelDeployment && panelCount >= limits.ticketPanels) {
                    return res.status(403).json({ success: false, error: 'Feature limit reached', code: 'LIMIT_REACHED', limitKey: 'ticketPanels', limit: limits.ticketPanels, current: panelCount, upgrade: true });
                }

                const components = [];
                if (settings.enableTicketTypes) {
                    const typeMenu = new StringSelectMenuBuilder()
                        .setCustomId('ticket:type')
                        .setPlaceholder('Choose a ticket type')
                        .addOptions(normalizeTicketTypes(settings.ticketTypes).map(type => ({
                            label: type.label,
                            value: type.key,
                            description: type.description || `${type.priority} priority`,
                        })));
                    components.push(new ActionRowBuilder().addComponents(typeMenu));
                } else {
                    components.push(new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('ticket:open')
                            .setLabel(buttonLabel)
                            .setStyle(ButtonStyle.Primary)
                    ));
                }

                // Try to edit existing panel message instead of always posting a new one
                let message = null;
                if (existingPanelMessageId && existingPanelChannelId === channel.id) {
                    const existingMsg = await channel.messages.fetch(existingPanelMessageId).catch(() => null);
                    if (existingMsg) {
                        message = await existingMsg.edit({ embeds: [embed], components }).catch(() => null);
                    }
                }
                if (!message) {
                    message = await channel.send({ embeds: [embed], components });
                }

                setGuildConfig(guild.id, {
                    tickets: {
                        ...settings,
                        panelTitle: title,
                        panelDescription: description,
                        panelButtonLabel: buttonLabel,
                        panelChannelId: channel.id,
                        panelMessageId: message.id,
                    },
                });

                res.json(APIResponse.success({
                    guildId: guild.id,
                    channelId: channel.id,
                    messageId: message.id,
                    url: message.url,
                }, 'Ticket panel sent', 'TICKET_PANEL_SENT'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'TICKET_PANEL_SEND_FAILED'));
            }
        });

        this.app.post('/guilds/:guildId/tickets/test', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to create test tickets'));

                const member = await resolveDashboardMember(guild, req, req.body?.userId);
                if (!member) {
                    return res.status(400).json(APIResponse.badRequest('Dashboard user is not a member of this guild'));
                }

                const { getGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guild.id);
                const modules = config.modules && typeof config.modules === 'object' ? config.modules : {};
                if (!booleanWithDefault(modules.tickets, false)) {
                    return res.status(400).json(APIResponse.badRequest('Enable the Tickets module first'));
                }

                const reason = String(req.body?.reason || 'Dashboard test ticket').trim().slice(0, 300) || 'Dashboard test ticket';
                const priority = ['low', 'normal', 'high'].includes(req.body?.priority) ? req.body.priority : (config.tickets?.defaultPriority || 'normal');
                const interaction = createDashboardTicketInteraction(guild, member);

                await ticketManager.openTicket(interaction, config, {
                    reason,
                    priority,
                    typeLabel: String(req.body?.typeLabel || 'Dashboard Test').trim().slice(0, 40) || 'Dashboard Test',
                });

                const channel = guild.channels.cache.find((item) => item.topic?.includes(`fahrstuhl-ticket:${member.id}`))
                    || await guild.channels.fetch().then((collection) => collection.find((item) => item.topic?.includes(`fahrstuhl-ticket:${member.id}`))).catch(() => null);
                if (!channel) {
                    const replyContent = interaction.__replyPayload?.content || 'Ticket could not be created';
                    return res.status(400).json(APIResponse.badRequest(replyContent));
                }

                res.json(APIResponse.success({
                    guildId: guild.id,
                    channelId: channel.id,
                    channelName: channel.name,
                    userId: member.id,
                    message: interaction.__replyPayload?.content || null,
                }, 'Test ticket created', 'TICKET_TEST_CREATED'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'TICKET_TEST_FAILED'));
            }
        });

        this.app.get('/guilds/:guildId/reaction-roles', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to this guild reaction role settings'));

                const { getGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guild.id);
                const reactionRoles = config.reactionRoles && typeof config.reactionRoles === 'object' ? config.reactionRoles : {};
                const panels = normalizeReactionRolePanels(reactionRoles);
                const selectedPanelId = String(req.query.panelId || panels[0]?.id || 'default');
                const activePanel = panels.find(panel => panel.id === selectedPanelId)
                    || (req.query.panelId ? normalizeReactionRolePanel({ id: selectedPanelId }) : panels[0])
                    || normalizeReactionRolePanel({ id: selectedPanelId });
                const botCanManageRoles = guild.members.me?.permissions?.has(PermissionsBitField.Flags.ManageRoles) ?? false;
                const botRolePosition = guild.members.me?.roles?.highest?.position ?? 0;
                const channels = guild.channels.cache
                    .filter(channel => channel.type === 0 && !channel.isThread?.())
                    .map(channel => ({
                        id: channel.id,
                        name: channel.name,
                        position: channel.position,
                    }))
                    .sort((a, b) => a.position - b.position);
                const roles = guild.roles.cache
                    .filter(role => role.name !== '@everyone')
                    .map(role => ({
                        id: role.id,
                        name: role.name,
                        color: role.hexColor,
                        position: role.position,
                        managed: role.managed,
                        assignable: botCanManageRoles && !role.managed && role.position < botRolePosition,
                    }))
                    .sort((a, b) => b.position - a.position);

                const channelNameById = channels.reduce((acc, channel) => {
                    acc[channel.id] = channel.name;
                    return acc;
                }, {});

                const decoratedPanels = panels.map(panel => ({
                    ...panel,
                    channelName: panel.channelId ? (channelNameById[panel.channelId] || null) : null,
                    messageId: panel.messageId || panel.lastPanelMessageId || null,
                }));

                res.json(APIResponse.success({
                    guildId: guild.id,
                    guildName: guild.name,
                    channels,
                    roles,
                    permissions: {
                        manageRoles: botCanManageRoles,
                        sendMessages: guild.members.me?.permissions?.has(PermissionsBitField.Flags.SendMessages) ?? false,
                        botRolePosition,
                    },
                    settings: {
                        panelId: activePanel.id,
                        channelId: activePanel.channelId,
                        title: activePanel.title,
                        description: activePanel.description,
                        mode: activePanel.mode,
                        exclusive: booleanWithDefault(activePanel.exclusive, false),
                        thumbnailUrl: activePanel.thumbnailUrl || '',
                        imageUrl: activePanel.imageUrl || '',
                        footerText: activePanel.footerText || '',
                        authorText: activePanel.authorText || '',
                        roles: activePanel.roles,
                        panels: decoratedPanels,
                        panelCount: decoratedPanels.length,
                        messageId: activePanel.messageId || activePanel.lastPanelMessageId || null,
                        lastPanelMessageId: activePanel.lastPanelMessageId,
                        lastPanelChannelId: activePanel.lastPanelChannelId,
                    },
                }, 'Reaction role settings fetched', 'REACTION_ROLE_SETTINGS_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'REACTION_ROLE_SETTINGS_FAILED'));
            }
        });

        this.app.post('/guilds/:guildId/reaction-roles', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to configure this guild reaction roles'));

                const panelId = String(req.body?.panelId || `panel-${Date.now().toString(36)}`).trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || `panel-${Date.now().toString(36)}`;
                const channelId = String(req.body?.channelId || '').trim();
                const title = String(req.body?.title || '').trim().slice(0, 120);
                const description = String(req.body?.description || '').trim().slice(0, 1000);
                const mode = req.body?.mode === 'select' || req.body?.mode === 'menu' ? 'select' : 'buttons';
                const exclusive = booleanWithDefault(req.body?.exclusive, false);
                const thumbnailUrl = discordImageUrl(req.body?.thumbnailUrl);
                const imageUrl = discordImageUrl(req.body?.imageUrl);
                const footerText = String(req.body?.footerText || '').trim().slice(0, 2048);
                const authorText = String(req.body?.authorText || '').trim().slice(0, 256);
                const roles = normalizeReactionRoleRows(req.body?.roles);

                if (channelId) {
                    const channel = guild.channels.cache.get(channelId)
                        || await guild.channels.fetch(channelId).catch(() => null);
                    if (!channel || channel.type !== 0 || channel.isThread?.()) {
                        return res.status(400).json(APIResponse.badRequest('Please choose a text channel'));
                    }
                }
                if (!roles.length) {
                    return res.status(400).json(APIResponse.badRequest('Add at least one role button'));
                }

                const botCanManageRoles = guild.members.me?.permissions?.has(PermissionsBitField.Flags.ManageRoles) ?? false;
                const botRolePosition = guild.members.me?.roles?.highest?.position ?? 0;
                for (const row of roles) {
                    const role = await fetchGuildRole(guild, row.roleId);
                    if (!role) return res.status(400).json(APIResponse.badRequest(`Role not found: ${row.roleId}`));
                    if (!botCanManageRoles || role.managed || role.position >= botRolePosition) {
                        return res.status(400).json(APIResponse.badRequest(`Fahrstuhl cannot assign ${role.name}. Move the bot role above it and allow Manage Roles.`));
                    }
                }

                const { getGuildConfig, setGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guild.id);
                const current = config.reactionRoles && typeof config.reactionRoles === 'object' ? config.reactionRoles : {};
                const panels = normalizeReactionRolePanels(current);

                    const limits = await this.getGuildPremiumLimits(guild.id);
                    const isNewPanel = !panels.find(p => p.id === panelId);
                    if (isNewPanel && limits.reactionRolePanels >= 0 && panels.length >= limits.reactionRolePanels) {
                        return res.status(403).json({ success: false, error: 'Feature limit reached', code: 'LIMIT_REACHED', limitKey: 'reactionRolePanels', limit: limits.reactionRolePanels, current: panels.length, upgrade: true });
                    }

                const nextPanel = normalizeReactionRolePanel({
                    id: panelId,
                    mode,
                    exclusive,
                    thumbnailUrl,
                    imageUrl,
                    footerText,
                    authorText,
                    channelId: channelId || null,
                    title: title || 'Choose your roles',
                    description: description || 'Use the controls below to add or remove roles.',
                    roles,
                }, panels.find(panel => panel.id === panelId) || {});
                const nextPanels = panels.filter(panel => panel.id !== panelId);
                nextPanels.unshift(nextPanel);
                const reactionRoles = {
                    ...current,
                    panels: nextPanels.slice(0, 10),
                    channelId: nextPanel.channelId,
                    title: nextPanel.title,
                    description: nextPanel.description,
                    mode: nextPanel.mode,
                    exclusive: nextPanel.exclusive,
                    thumbnailUrl: nextPanel.thumbnailUrl || '',
                    imageUrl: nextPanel.imageUrl || '',
                    footerText: nextPanel.footerText || '',
                    authorText: nextPanel.authorText || '',
                    roles: nextPanel.roles,
                };
                setGuildConfig(guild.id, { reactionRoles });

                res.json(APIResponse.success({ guildId: guild.id, reactionRoles }, 'Reaction role settings updated', 'REACTION_ROLE_SETTINGS_UPDATED'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'REACTION_ROLE_SETTINGS_UPDATE_FAILED'));
            }
        });

        this.app.post('/guilds/:guildId/reaction-roles/send', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to send this guild reaction role panel'));

                const { getGuildConfig, setGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guild.id);
                const reactionRoles = config.reactionRoles && typeof config.reactionRoles === 'object' ? config.reactionRoles : {};
                const modules = config.modules && typeof config.modules === 'object' ? config.modules : {};
                if (!modules.reactionRoles) {
                    return res.status(400).json(APIResponse.badRequest('Enable the Reaction Roles module first'));
                }

                const panels = normalizeReactionRolePanels(reactionRoles);
                const panelId = String(req.body?.panelId || reactionRoles.panelId || panels[0]?.id || 'default');
                const panel = panels.find(item => item.id === panelId) || panels[0];
                if (!panel) {
                    return res.status(400).json(APIResponse.badRequest('Configure at least one reaction role panel first'));
                }
                const channelId = String(req.body?.channelId || panel.channelId || reactionRoles.channelId || '').trim();
                const channel = channelId ? await fetchGuildChannel(guild, channelId) : null;
                if (!channel || channel.type !== 0 || channel.isThread?.()) {
                    return res.status(400).json(APIResponse.badRequest('Please choose a text channel'));
                }
                const roles = normalizeReactionRoleRows(panel.roles);
                if (!roles.length) {
                    return res.status(400).json(APIResponse.badRequest('Configure at least one role first'));
                }
                if (!(guild.members.me?.permissionsIn(channel)?.has(PermissionsBitField.Flags.SendMessages) ?? false)) {
                    return res.status(400).json(APIResponse.badRequest('Fahrstuhl cannot send messages in this channel'));
                }

                const embed = new EmbedBuilder()
                    .setColor(0x667EEA)
                    .setTitle(panel.title || 'Choose your roles')
                    .setDescription(panel.description || 'Use the controls below to add or remove roles.');
                if (panel.thumbnailUrl) embed.setThumbnail(panel.thumbnailUrl);
                if (panel.imageUrl) embed.setImage(panel.imageUrl);
                if (panel.footerText) embed.setFooter({ text: panel.footerText });
                if (panel.authorText) embed.setAuthor({ name: panel.authorText });

                const row = new ActionRowBuilder();
                if (panel.mode === 'select') {
                    const selectRoles = roles.slice(0, 25);
                    const maxValues = panel.exclusive ? 1 : Math.min(selectRoles.length, 25);
                    row.addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId(`rrs:${panel.id}`)
                            .setPlaceholder(panel.exclusive ? 'Choose one role' : 'Choose roles')
                            .setMinValues(0)
                            .setMaxValues(maxValues)
                            .addOptions(selectRoles.map(item => {
                                const role = guild.roles.cache.get(item.roleId);
                                const option = {
                                    label: item.label || role?.name || 'Role',
                                    value: item.roleId,
                                };
                                if (item.emoji) option.emoji = item.emoji;
                                return option;
                            }))
                    );
                } else {
                    row.addComponents(roles.slice(0, 5).map(item => {
                        const role = guild.roles.cache.get(item.roleId);
                        const button = new ButtonBuilder()
                            .setCustomId(`rr:${panel.id}:${item.roleId}`)
                            .setLabel(item.label || role?.name || 'Role')
                            .setStyle(ButtonStyle.Secondary);
                        if (item.emoji) button.setEmoji(item.emoji);
                        return button;
                    }));
                }

                let message = null;
                if (panel.lastPanelChannelId && panel.lastPanelMessageId) {
                    const existingChannel = await fetchGuildChannel(guild, panel.lastPanelChannelId);
                    if (existingChannel?.messages) {
                        const existingMessage = await existingChannel.messages.fetch(panel.lastPanelMessageId).catch(() => null);
                        if (existingMessage) {
                            message = await existingMessage.edit({ embeds: [embed], components: [row] }).catch(() => null);
                        }
                    }
                }
                if (!message) {
                    message = await channel.send({ embeds: [embed], components: [row] });
                }

                const updatedPanel = {
                    ...panel,
                    channelId,
                    lastPanelChannelId: channel.id,
                    messageId: message.id,
                    lastPanelMessageId: message.id,
                };
                const updatedPanels = panels.map(item => item.id === panel.id ? updatedPanel : item);
                const updated = {
                    ...reactionRoles,
                    panels: updatedPanels,
                    channelId,
                    title: updatedPanel.title,
                    description: updatedPanel.description,
                    mode: updatedPanel.mode,
                    exclusive: updatedPanel.exclusive,
                    thumbnailUrl: updatedPanel.thumbnailUrl || '',
                    imageUrl: updatedPanel.imageUrl || '',
                    footerText: updatedPanel.footerText || '',
                    authorText: updatedPanel.authorText || '',
                    roles: updatedPanel.roles,
                    lastPanelChannelId: channel.id,
                    messageId: message.id,
                    lastPanelMessageId: message.id,
                };
                setGuildConfig(guild.id, { reactionRoles: updated });

                res.json(APIResponse.success({
                    guildId: guild.id,
                    channelId: channel.id,
                    panelId: panel.id,
                    messageId: message.id,
                    url: message.url,
                }, 'Reaction role panel sent', 'REACTION_ROLE_PANEL_SENT'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'REACTION_ROLE_PANEL_SEND_FAILED'));
            }
        });

        this.app.post('/guilds/:guildId/reaction-roles/delete', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to delete this guild reaction role panel'));

                const panelId = String(req.body?.panelId || '').trim();
                if (!panelId) return res.status(400).json(APIResponse.badRequest('panelId required'));

                const { getGuildConfig, setGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guild.id);
                const reactionRoles = config.reactionRoles && typeof config.reactionRoles === 'object' ? config.reactionRoles : {};
                const panels = normalizeReactionRolePanels(reactionRoles);
                const panel = panels.find(item => item.id === panelId);
                if (!panel) return res.status(404).json(APIResponse.notFound('Reaction role panel not found'));

                let deletedMessage = false;
                if (panel.lastPanelChannelId && panel.lastPanelMessageId) {
                    const channel = guild.channels.cache.get(panel.lastPanelChannelId)
                        || await guild.channels.fetch(panel.lastPanelChannelId).catch(() => null);
                    const message = channel?.messages
                        ? await channel.messages.fetch(panel.lastPanelMessageId).catch(() => null)
                        : null;
                    if (message?.deletable) {
                        await message.delete().catch(() => {});
                        deletedMessage = true;
                    }
                }

                const nextPanels = panels.filter(item => item.id !== panelId);
                const fallback = nextPanels[0] || null;
                const updated = {
                    ...reactionRoles,
                    panels: nextPanels,
                    channelId: fallback?.channelId || null,
                    title: fallback?.title || 'Choose your roles',
                    description: fallback?.description || 'Use the controls below to add or remove roles.',
                    mode: fallback?.mode || 'buttons',
                    exclusive: booleanWithDefault(fallback?.exclusive, false),
                    roles: fallback?.roles || [],
                    lastPanelChannelId: fallback?.lastPanelChannelId || null,
                    messageId: fallback?.messageId || fallback?.lastPanelMessageId || null,
                    lastPanelMessageId: fallback?.lastPanelMessageId || null,
                };
                setGuildConfig(guild.id, { reactionRoles: updated });

                res.json(APIResponse.success({
                    guildId: guild.id,
                    panelId,
                    deletedMessage,
                    panels: nextPanels,
                }, 'Reaction role panel deleted', 'REACTION_ROLE_PANEL_DELETED'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'REACTION_ROLE_PANEL_DELETE_FAILED'));
            }
        });

        this.app.get('/guilds/:guildId/automod', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to this guild automod settings'));

                const { getGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guild.id);
                const automod = normalizeAutoModSettings(config.automod && typeof config.automod === 'object' ? config.automod : {});

                // Rollen und Channels für Auswahl im Dashboard
                const roles = guild.roles.cache
                    .filter(role => role.name !== '@everyone')
                    .map(role => ({
                        id: role.id,
                        name: role.name,
                        color: role.hexColor,
                        position: role.position,
                        managed: role.managed,
                    }))
                    .sort((a, b) => b.position - a.position);

                const channels = guild.channels.cache
                    .filter(channel => channel.type === 0 && !channel.isThread?.())
                    .map(channel => ({
                        id: channel.id,
                        name: channel.name,
                        position: channel.position,
                    }))
                    .sort((a, b) => a.position - b.position);

                let stats = { totalHits: 0, hits24h: 0, uniqueUsers24h: 0 };
                let recentCases = [];
                try {
                    const pool = getPool();
                    const since24h = Date.now() - 24 * 60 * 60 * 1000;
                    const [[totals]] = await pool.query(
                        `
                        SELECT
                            COUNT(*) AS totalHits,
                            SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS hits24h,
                            COUNT(DISTINCT CASE WHEN created_at >= ? THEN user_id ELSE NULL END) AS uniqueUsers24h
                        FROM moderation_cases
                        WHERE guild_id = ? AND type = 'automod'
                        `,
                        [since24h, since24h, guild.id]
                    );
                    const [caseRows] = await pool.query(
                        `
                        SELECT id, user_id, reason, created_at
                        FROM moderation_cases
                        WHERE guild_id = ? AND type = 'automod'
                        ORDER BY created_at DESC
                        LIMIT 6
                        `,
                        [guild.id]
                    );
                    stats = {
                        totalHits: Number(totals?.totalHits || 0),
                        hits24h: Number(totals?.hits24h || 0),
                        uniqueUsers24h: Number(totals?.uniqueUsers24h || 0),
                    };
                    recentCases = caseRows.map(row => ({
                        id: row.id,
                        userId: row.user_id,
                        reason: row.reason || 'AutoMod hit',
                        createdAt: Number(row.created_at || 0),
                    }));
                } catch (error) {
                    console.warn(`AutoMod stats unavailable for ${guild.id}: ${error.message}`);
                }

                res.json(APIResponse.success({
                    guildId: guild.id,
                    guildName: guild.name,
                    permissions: {
                        manageMessages: guild.members.me?.permissions?.has(PermissionsBitField.Flags.ManageMessages) ?? false,
                        moderateMembers: guild.members.me?.permissions?.has(PermissionsBitField.Flags.ModerateMembers) ?? false,
                        kickMembers: guild.members.me?.permissions?.has(PermissionsBitField.Flags.KickMembers) ?? false,
                        banMembers: guild.members.me?.permissions?.has(PermissionsBitField.Flags.BanMembers) ?? false,
                    },
                    roles,
                    channels,
                    settings: automod,
                    presets: AUTOMOD_PRESETS,
                    stats,
                    recentCases,
                }, 'AutoMod settings fetched', 'AUTOMOD_SETTINGS_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'AUTOMOD_SETTINGS_FAILED'));
            }
        });

        this.app.post('/guilds/:guildId/automod', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to configure this guild automod'));

                const rawTerms = Array.isArray(req.body?.blockedTerms)
                    ? req.body.blockedTerms
                    : String(req.body?.blockedTerms || '').split(/\r?\n|,/);
                const blockedTerms = [...new Set(rawTerms
                    .map(term => String(term || '').trim().toLowerCase())
                    .filter(term => term.length >= 2)
                    .slice(0, 50))]
                    .map(term => term.slice(0, 60));

                const { getGuildConfig, setGuildConfig } = require('../utils/config');

                    const limits = await this.getGuildPremiumLimits(guild.id);
                    if (limits.automodRules >= 0 && blockedTerms.length > limits.automodRules) {
                        return res.status(403).json({ success: false, error: 'Feature limit reached', code: 'LIMIT_REACHED', limitKey: 'automodRules', limit: limits.automodRules, current: blockedTerms.length, upgrade: true });
                    }

                const config = getGuildConfig(guild.id);
                // Ignorierte Rollen/Channels aus Request übernehmen
                const ignoredRoles = Array.isArray(req.body?.ignoredRoles)
                    ? req.body.ignoredRoles.filter(id => typeof id === 'string' && id.length > 0)
                    : [];
                const ignoredChannels = Array.isArray(req.body?.ignoredChannels)
                    ? req.body.ignoredChannels.filter(id => typeof id === 'string' && id.length > 0)
                    : [];

                const rawLinks = Array.isArray(req.body?.allowedLinks)
                    ? req.body.allowedLinks
                    : String(req.body?.allowedLinks || '').split(/\r?\n|,/);
                const allowedLinks = [...new Set(rawLinks
                    .map(link => String(link || '').trim().toLowerCase())
                    .filter(link => link.length >= 3)
                    .slice(0, 50))];

                const automod = normalizeAutoModSettings({
                    ...(config.automod || {}),
                    blockInvites: dashboardBoolean(req.body?.blockInvites),
                    blockLinks: dashboardBoolean(req.body?.blockLinks),
                    allowedLinks,
                    blockMassMentions: dashboardBoolean(req.body?.blockMassMentions),
                    blockCaps: dashboardBoolean(req.body?.blockCaps),
                    blockSpam: dashboardBoolean(req.body?.blockSpam),
                    blockRepeatedText: dashboardBoolean(req.body?.blockRepeatedText),
                    deleteMessage: dashboardBoolean(req.body?.deleteMessage),
                    warnUser: dashboardBoolean(req.body?.warnUser),
                    exemptAdmins: dashboardBoolean(req.body?.exemptAdmins),
                    blockedTerms,
                    ignoredRoles,
                    ignoredChannels,
                    mentionLimit: req.body?.mentionLimit,
                    capsMinLength: req.body?.capsMinLength,
                    capsPercent: req.body?.capsPercent,
                    duplicateThreshold: req.body?.duplicateThreshold,
                    duplicateWindowSeconds: req.body?.duplicateWindowSeconds,
                    autoPunishStrikes: req.body?.autoPunishStrikes,
                    timeoutMinutes: req.body?.timeoutMinutes,
                    punishmentAction: req.body?.punishmentAction,
                    punishmentMode: req.body?.punishmentMode,
                    warnMessage: req.body?.warnMessage,
                    blockedTermsWholeWord: req.body?.blockedTermsWholeWord,
                    blockedTermsRegex: req.body?.blockedTermsRegex,
                    ruleActions: req.body?.ruleActions,
                });

                const presetName = String(req.body?.preset || '').trim().toLowerCase();
                if (presetName && AUTOMOD_PRESETS[presetName]) {
                    Object.assign(automod, normalizeAutoModSettings({
                        ...automod,
                        ...AUTOMOD_PRESETS[presetName],
                    }));
                }
                setGuildConfig(guild.id, { automod });

                res.json(APIResponse.success({ guildId: guild.id, automod }, 'AutoMod settings updated', 'AUTOMOD_SETTINGS_UPDATED'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'AUTOMOD_SETTINGS_UPDATE_FAILED'));
            }
        });

        this.app.post('/guilds/:guildId/automod/test', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to test automod'));

                const { getGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guild.id);
                const modules = config.modules && typeof config.modules === 'object' ? config.modules : {};
                if (!booleanWithDefault(modules.automod, false)) {
                    return res.status(400).json(APIResponse.badRequest('Enable the AutoMod module first'));
                }

                const content = String(req.body?.content || '').trim();
                if (!content) {
                    return res.status(400).json(APIResponse.badRequest('Provide a test message first'));
                }

                const automod = normalizeAutoModSettings(config.automod && typeof config.automod === 'object' ? config.automod : {});
                const preview = findAutoModViolationsPreview(content, automod, {
                    mentionCount: req.body?.mentionCount,
                });

                res.json(APIResponse.success({
                    guildId: guild.id,
                    content,
                    mentionCount: preview.mentionCount,
                    capsPercent: preview.capsPercent,
                    blocked: preview.violations.length > 0,
                    violations: preview.violations,
                }, preview.violations.length ? 'AutoMod violations detected' : 'No AutoMod violation detected', 'AUTOMOD_TEST_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'AUTOMOD_TEST_FAILED'));
            }
        });

        // ============ DISCORD SERVER BACKUPS ============

        // GET /guilds/:guildId/discord-backups — list backups
        this.app.get('/guilds/:guildId/discord-backups', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access'));
                const { listGuildBackups } = require('../utils/serverBackup');
                const backups = await listGuildBackups(guild.id);
                res.json(APIResponse.success({ backups, total: backups.length }, 'Backups listed', 'DISCORD_BACKUPS_LIST'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'DISCORD_BACKUPS_LIST_FAILED'));
            }
        });

        // GET /guilds/:guildId/discord-backups/schedule — current schedule config
        this.app.get('/guilds/:guildId/discord-backups/schedule', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access'));
                const { getBackupSchedule } = require('../utils/serverBackup');
                const schedule = await getBackupSchedule(guild.id);
                res.json(APIResponse.success(schedule, 'Backup schedule fetched', 'DISCORD_BACKUP_SCHEDULE_GET'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'DISCORD_BACKUP_SCHEDULE_GET_FAILED'));
            }
        });

        // POST /guilds/:guildId/discord-backups/schedule — upsert schedule config
        this.app.post('/guilds/:guildId/discord-backups/schedule', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access'));
                const { upsertBackupSchedule } = require('../utils/serverBackup');
                const updatedBy = String(req.get('x-dashboard-user-id') || '').trim() || null;
                const schedule = await upsertBackupSchedule(guild.id, {
                    enabled: req.body?.enabled === true,
                    intervalHours: Number(req.body?.intervalHours || 24),
                    retentionCount: Number(req.body?.retentionCount || 10),
                    backupMode: String(req.body?.backupMode || 'full').toLowerCase(),
                }, updatedBy);
                res.json(APIResponse.success(schedule, 'Backup schedule updated', 'DISCORD_BACKUP_SCHEDULE_SET'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'DISCORD_BACKUP_SCHEDULE_SET_FAILED'));
            }
        });

        // POST /guilds/:guildId/discord-backups/create — create backup (async, fire-and-forget)
        this.app.post('/guilds/:guildId/discord-backups/create', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access'));
                const { createBackupJob, createServerBackup } = require('../utils/serverBackup');
                const { getGuildConfig } = require('../utils/config');
                const botConfig = getGuildConfig(guild.id);
                const createdBy = String(req.get('x-dashboard-user-id') || '').trim() || null;
                const jobId = await createBackupJob(guild.id);
                // Respond immediately — backup runs in background to avoid CF 504
                res.json(APIResponse.success({ status: 'queued', jobId }, 'Backup wird im Hintergrund erstellt', 'DISCORD_BACKUP_QUEUED'));
                createServerBackup(guild, botConfig, createdBy, jobId).catch(err => {
                    this.logger?.error('[ServerBackup] Background backup failed:', err);
                });
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'DISCORD_BACKUP_CREATE_FAILED'));
            }
        });

        // GET /guilds/:guildId/backup-jobs/:jobId — live backup status
        this.app.get('/guilds/:guildId/backup-jobs/:jobId', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access'));
                const jobId = parseInt(req.params.jobId, 10);
                if (!Number.isFinite(jobId) || jobId < 1) return res.status(400).json(APIResponse.badRequest('Invalid job ID'));
                const { getBackupJob } = require('../utils/serverBackup');
                const job = await getBackupJob(jobId);
                if (!job || job.guildId !== guild.id) return res.status(404).json(APIResponse.notFound('Job not found'));
                res.json(APIResponse.success(job, 'Job status', 'BACKUP_JOB_STATUS'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'BACKUP_JOB_STATUS_FAILED'));
            }
        });

        // GET /guilds/:guildId/backup-jobs/latest — latest running backup job
        this.app.get('/guilds/:guildId/backup-jobs/latest', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access'));
                const { getLatestRunningBackupJob } = require('../utils/serverBackup');
                const job = await getLatestRunningBackupJob(guild.id);
                if (!job) return res.status(404).json(APIResponse.notFound('No running job'));
                res.json(APIResponse.success(job, 'Latest running backup job', 'BACKUP_JOB_LATEST'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'BACKUP_JOB_LATEST_FAILED'));
            }
        });

        // GET /guilds/:guildId/discord-backups/:backupId — download full backup as JSON
        this.app.get('/guilds/:guildId/discord-backups/:backupId', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access'));
                const backupId = parseInt(req.params.backupId, 10);
                if (!Number.isFinite(backupId) || backupId < 1) return res.status(400).json(APIResponse.badRequest('Invalid backup ID'));
                const { getBackupById } = require('../utils/serverBackup');
                const backup = await getBackupById(backupId, guild.id);
                if (!backup) return res.status(404).json(APIResponse.notFound('Backup not found'));
                const filename = `discord-backup-${guild.id}-${backup.meta.createdAt}.json`;
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                res.send(JSON.stringify(backup, null, 2));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'DISCORD_BACKUP_DOWNLOAD_FAILED'));
            }
        });

        // DELETE /guilds/:guildId/discord-backups/:backupId — delete a backup
        this.app.delete('/guilds/:guildId/discord-backups/:backupId', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access'));
                const backupId = parseInt(req.params.backupId, 10);
                if (!Number.isFinite(backupId) || backupId < 1) return res.status(400).json(APIResponse.badRequest('Invalid backup ID'));
                const { deleteBackup } = require('../utils/serverBackup');
                const deleted = await deleteBackup(backupId, guild.id);
                if (!deleted) return res.status(404).json(APIResponse.notFound('Backup not found'));
                res.json(APIResponse.success({ backupId }, 'Backup deleted', 'DISCORD_BACKUP_DELETED'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'DISCORD_BACKUP_DELETE_FAILED'));
            }
        });

        // POST /guilds/:targetGuildId/discord-backups/restore — restore a backup onto target guild (async)
        this.app.post('/guilds/:guildId/discord-backups/restore', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Target guild not found or bot is not in it'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to target guild'));
                const backupId = parseInt(req.body?.backupId, 10);
                if (!Number.isFinite(backupId) || backupId < 1) return res.status(400).json(APIResponse.badRequest('Invalid backup ID'));
                const { getBackupMetaById } = require('../utils/serverBackup');
                const backupMeta = await getBackupMetaById(backupId);
                if (!backupMeta) return res.status(404).json(APIResponse.notFound('Backup not found'));
                const sourceAccess = await this.getDashboardGuildAccess(req, backupMeta.guildId);
                if (!sourceAccess.allowed) {
                    return res.status(403).json(APIResponse.forbidden('No access to source backup guild'));
                }
                const options = {
                    settings: req.body?.options?.settings === true,
                    roles: req.body?.options?.roles !== false,
                    channels: req.body?.options?.channels !== false,
                    emojis: req.body?.options?.emojis === true,
                    messages: req.body?.options?.messages !== false,
                    autoVerify: req.body?.options?.autoVerify !== false,
                    wipeExisting: req.body?.options?.wipeExisting === true,
                    messageMode: String(req.body?.options?.messageMode || 'embed').toLowerCase(),
                    sourceGuildId: backupMeta.guildId,
                };
                const { createRestoreJob, restoreServerBackup } = require('../utils/serverBackup');
                const jobId = await createRestoreJob(backupId, guild.id);
                res.json(APIResponse.success({ status: 'queued', jobId, targetGuild: guild.name, sourceGuildId: backupMeta.guildId }, 'Restore wird im Hintergrund ausgeführt', 'DISCORD_BACKUP_RESTORE_QUEUED'));
                restoreServerBackup(guild, backupId, options, jobId).catch(err => {
                    this.logger?.error('[ServerBackup] Background restore failed:', err);
                });
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'DISCORD_BACKUP_RESTORE_FAILED'));
            }
        });

        // POST /guilds/:guildId/discord-backups/restore-preview — dry-run preview before restore
        this.app.post('/guilds/:guildId/discord-backups/restore-preview', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Target guild not found or bot is not in it'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to target guild'));

                const backupId = parseInt(req.body?.backupId, 10);
                if (!Number.isFinite(backupId) || backupId < 1) return res.status(400).json(APIResponse.badRequest('Invalid backup ID'));

                const { getBackupMetaById, getRestorePreview } = require('../utils/serverBackup');
                const backupMeta = await getBackupMetaById(backupId);
                if (!backupMeta) return res.status(404).json(APIResponse.notFound('Backup not found'));

                const sourceAccess = await this.getDashboardGuildAccess(req, backupMeta.guildId);
                if (!sourceAccess.allowed) return res.status(403).json(APIResponse.forbidden('No access to source backup guild'));

                const options = {
                    settings: req.body?.options?.settings === true,
                    roles: req.body?.options?.roles !== false,
                    channels: req.body?.options?.channels !== false,
                    emojis: req.body?.options?.emojis === true,
                    messages: req.body?.options?.messages !== false,
                    autoVerify: req.body?.options?.autoVerify !== false,
                    wipeExisting: req.body?.options?.wipeExisting === true,
                    sourceGuildId: backupMeta.guildId,
                };

                const preview = await getRestorePreview(guild, backupId, options);
                res.json(APIResponse.success(preview, 'Restore preview generated', 'DISCORD_BACKUP_RESTORE_PREVIEW'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'DISCORD_BACKUP_RESTORE_PREVIEW_FAILED'));
            }
        });

        // POST /guilds/:guildId/discord-backups/verify — post-restore verification report
        this.app.post('/guilds/:guildId/discord-backups/verify', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Target guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to target guild'));

                const backupId = parseInt(req.body?.backupId, 10);
                if (!Number.isFinite(backupId) || backupId < 1) return res.status(400).json(APIResponse.badRequest('Invalid backup ID'));

                const { getBackupMetaById, verifyRestoreOutcome } = require('../utils/serverBackup');
                const backupMeta = await getBackupMetaById(backupId);
                if (!backupMeta) return res.status(404).json(APIResponse.notFound('Backup not found'));

                const sourceAccess = await this.getDashboardGuildAccess(req, backupMeta.guildId);
                if (!sourceAccess.allowed) return res.status(403).json(APIResponse.forbidden('No access to source backup guild'));

                const report = await verifyRestoreOutcome(guild, backupId, { sourceGuildId: backupMeta.guildId });
                res.json(APIResponse.success(report, 'Restore verification generated', 'DISCORD_BACKUP_VERIFY_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'DISCORD_BACKUP_VERIFY_FAILED'));
            }
        });

        // GET /guilds/:guildId/restore-jobs/:jobId — live restore status
        this.app.get('/guilds/:guildId/restore-jobs/:jobId', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access'));
                const jobId = parseInt(req.params.jobId, 10);
                if (!Number.isFinite(jobId) || jobId < 1) return res.status(400).json(APIResponse.badRequest('Invalid job ID'));
                const { getRestoreJob } = require('../utils/serverBackup');
                const job = await getRestoreJob(jobId);
                if (!job || job.targetGuildId !== guild.id) return res.status(404).json(APIResponse.notFound('Job not found'));
                res.json(APIResponse.success(job, 'Job status', 'RESTORE_JOB_STATUS'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'RESTORE_JOB_STATUS_FAILED'));
            }
        });

        // GET /guilds/:guildId/restore-jobs/latest — latest running restore job
        this.app.get('/guilds/:guildId/restore-jobs/latest', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access'));
                const { getLatestRunningRestoreJob } = require('../utils/serverBackup');
                const job = await getLatestRunningRestoreJob(guild.id);
                if (!job) return res.status(404).json(APIResponse.notFound('No running job'));
                res.json(APIResponse.success(job, 'Latest running restore job', 'RESTORE_JOB_LATEST'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'RESTORE_JOB_LATEST_FAILED'));
            }
        });

        this.app.get('/leveling/:guildId/settings', async (req, res) => {
            try {
                const guildId = String(req.params.guildId || '').trim();
                const guild = this.client.guilds.cache.get(guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guildId);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to this guild leveling settings'));

                const { getGuildConfig } = require('../utils/config');
                const leveling = require('../utils/levelingManager');
                const config = getGuildConfig(guildId);
                const settings = leveling.getLevelSettings(config);

                const roles = guild.roles.cache
                    .filter(role => role.name !== '@everyone')
                    .map(role => ({
                        id: role.id,
                        name: role.name,
                        color: role.hexColor,
                        position: role.position,
                        managed: role.managed,
                        assignable: !role.managed && guild.members.me && role.position < guild.members.me.roles.highest.position,
                    }))
                    .sort((a, b) => b.position - a.position);
                const channels = guild.channels.cache
                    .filter(channel => channel.type === 0 && !channel.isThread?.())
                    .map(channel => ({ id: channel.id, name: channel.name, position: channel.position }))
                    .sort((a, b) => a.position - b.position);

                res.json(APIResponse.success({
                    guildId,
                    guildName: guild.name,
                    settings,
                    roles,
                    channels,
                    permissions: {
                        manageRoles: guild.members.me?.permissions?.has(PermissionsBitField.Flags.ManageRoles) ?? false,
                        botRolePosition: guild.members.me?.roles?.highest?.position ?? 0,
                    },
                }, 'Leveling settings fetched', 'LEVELING_SETTINGS_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'LEVELING_SETTINGS_FAILED'));
            }
        });

        this.app.post('/leveling/:guildId/settings', async (req, res) => {
            try {
                const guildId = String(req.params.guildId || '').trim();
                const guild = this.client.guilds.cache.get(guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guildId);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to configure this guild leveling'));

                const { getGuildConfig, setGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guildId);
                const existing = config.leveling && typeof config.leveling === 'object' ? config.leveling : {};
                const rawLevels = Array.isArray(req.body?.rewardLevels) ? req.body.rewardLevels : [];
                const rawRoleIds = Array.isArray(req.body?.rewardRoleIds) ? req.body.rewardRoleIds : [];
                const roleRewards = [];
                const seenLevels = new Set();
                const rawRoleMultiplierRoleIds = Array.isArray(req.body?.roleMultiplierRoleIds) ? req.body.roleMultiplierRoleIds : [];
                const rawRoleMultiplierValues = Array.isArray(req.body?.roleMultiplierValues) ? req.body.roleMultiplierValues : [];
                const roleMultipliers = [];
                const seenRoleMultiplierIds = new Set();
                const rawChannelMultiplierChannelIds = Array.isArray(req.body?.channelMultiplierChannelIds) ? req.body.channelMultiplierChannelIds : [];
                const rawChannelMultiplierValues = Array.isArray(req.body?.channelMultiplierValues) ? req.body.channelMultiplierValues : [];
                const channelMultipliers = [];
                const seenChannelMultiplierIds = new Set();

                for (let i = 0; i < Math.min(rawLevels.length, rawRoleIds.length, 25); i++) {
                    const level = Math.max(1, Math.min(1000, Number(rawLevels[i]) || 0));
                    const roleId = String(rawRoleIds[i] || '').trim();
                    const role = roleId ? guild.roles.cache.get(roleId) : null;
                    if (!level || !role || seenLevels.has(level)) continue;
                    seenLevels.add(level);
                    roleRewards.push({ level, roleId, roleName: role.name });
                }

                for (let i = 0; i < Math.min(rawRoleMultiplierRoleIds.length, rawRoleMultiplierValues.length, 100); i++) {

                    const limits = await this.getGuildPremiumLimits(guildId);
                    if (limits.levelRewards >= 0 && roleRewards.length > limits.levelRewards) {
                        return res.status(403).json({ success: false, error: 'Feature limit reached', code: 'LIMIT_REACHED', limitKey: 'levelRewards', limit: limits.levelRewards, current: roleRewards.length, upgrade: true });
                    }

                    const roleId = String(rawRoleMultiplierRoleIds[i] || '').trim();
                    const role = roleId ? guild.roles.cache.get(roleId) : null;
                    const multiplier = Math.max(0, Math.min(5, Number(rawRoleMultiplierValues[i]) || 1));
                    if (!role || seenRoleMultiplierIds.has(roleId)) continue;
                    seenRoleMultiplierIds.add(roleId);
                    roleMultipliers.push({ roleId, roleName: role.name, multiplier });
                }

                for (let i = 0; i < Math.min(rawChannelMultiplierChannelIds.length, rawChannelMultiplierValues.length, 100); i++) {
                    const channelId = String(rawChannelMultiplierChannelIds[i] || '').trim();
                    const channel = channelId ? guild.channels.cache.get(channelId) : null;
                    const multiplier = Math.max(0, Math.min(5, Number(rawChannelMultiplierValues[i]) || 1));
                    if (!channel || channel.type !== 0 || seenChannelMultiplierIds.has(channelId)) continue;
                    seenChannelMultiplierIds.add(channelId);
                    channelMultipliers.push({ channelId, channelName: channel.name, multiplier });
                }

                const noXpChannels = Array.isArray(req.body?.noXpChannels)
                    ? req.body.noXpChannels.filter(id => typeof id === 'string' && id.length > 0)
                    : (Array.isArray(req.body?.ignoredChannels)
                        ? req.body.ignoredChannels.filter(id => typeof id === 'string' && id.length > 0)
                        : []);

                const leveling = {
                    ...existing,
                    messageXpMin: Math.max(1, Math.min(500, Number(req.body?.messageXpMin) || 8)),
                    messageXpMax: Math.max(1, Math.min(500, Number(req.body?.messageXpMax) || 15)),
                    cooldownSeconds: Math.max(0, Math.min(3600, Number(req.body?.cooldownSeconds) || 0)),
                    announceLevelUp: dashboardBoolean(req.body?.announceLevelUp),
                    announceChannelId: typeof req.body?.announceChannelId === 'string' && req.body.announceChannelId ? req.body.announceChannelId : null,
                    announceMessage: String(req.body?.announceMessage ?? '{user} reached Level {level}!').slice(0, 180),
                    roleMode: ['stack', 'highest'].includes(req.body?.roleMode) ? req.body.roleMode : 'stack',
                    removeLowerLevelRoles: dashboardBoolean(req.body?.removeLowerLevelRoles),
                    autoCreateRoles: dashboardBoolean(req.body?.autoCreateRoles),
                    autoRolePrefix: String(req.body?.autoRolePrefix || 'Level').slice(0, 32),
                    roleRewards: roleRewards.sort((a, b) => a.level - b.level),
                    roleMultipliers,
                    channelMultipliers,
                    ignoredRoles: Array.isArray(req.body?.ignoredRoles) ? req.body.ignoredRoles.filter(id => typeof id === 'string' && id.length > 0) : [],
                    ignoredChannels: noXpChannels,
                    noXpChannels,
                    minMessageLength: Math.max(1, Math.min(100, Number(req.body?.minMessageLength) || 5)),
                    blockDuplicateMessages: req.body?.blockDuplicateMessages !== undefined ? dashboardBoolean(req.body.blockDuplicateMessages) : true,
                    voiceXpEnabled: dashboardBoolean(req.body?.voiceXpEnabled),
                    voiceXpPerMinute: Math.max(1, Math.min(100, Number(req.body?.voiceXpPerMinute) || 2)),
                };
                if (leveling.messageXpMax < leveling.messageXpMin) leveling.messageXpMax = leveling.messageXpMin;

                setGuildConfig(guildId, { leveling });
                res.json(APIResponse.success({ guildId, leveling }, 'Leveling settings updated', 'LEVELING_SETTINGS_UPDATED'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'LEVELING_SETTINGS_UPDATE_FAILED'));
            }
        });

        this.app.post('/leveling/:guildId/test-xp', async (req, res) => {
            try {
                const guildId = String(req.params.guildId || '').trim();
                const guild = this.client.guilds.cache.get(guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guildId);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to test leveling'));

                const member = await resolveDashboardMember(guild, req, req.body?.userId);
                if (!member) {
                    return res.status(400).json(APIResponse.badRequest('Dashboard user is not a member of this guild'));
                }

                const { getGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guildId);
                const modules = config.modules && typeof config.modules === 'object' ? config.modules : {};
                if (!booleanWithDefault(modules.leveling, false)) {
                    return res.status(400).json(APIResponse.badRequest('Enable the Leveling module first'));
                }

                const leveling = require('../utils/levelingManager');
                const amount = Math.max(1, Math.min(1000, Number(req.body?.amount) || 100));
                const before = await leveling.getUserLevel(guildId, member.id);
                const now = Date.now();
                const newXp = before.xp + amount;
                const progress = leveling.levelFromXp(newXp);
                const pool = getPool();

                await pool.query(
                    `
                    INSERT INTO guild_user_levels (guild_id, user_id, xp, level, message_count, voice_xp, last_message_xp_at, updated_at)
                    VALUES (?, ?, ?, ?, 0, 0, 0, ?)
                    ON DUPLICATE KEY UPDATE
                        xp = VALUES(xp),
                        level = VALUES(level),
                        updated_at = VALUES(updated_at)
                    `,
                    [guildId, member.id, newXp, progress.level, now]
                );

                const after = await leveling.getUserLevel(guildId, member.id);

                await sendServerLog(guild, config, 'leveling', {
                    title: 'Leveling Test XP',
                    description: `${dashboardActor(req)} granted +${amount} XP to <@${member.id}> from the dashboard.`,
                    color: 0x5865F2,
                    fields: [
                        { name: 'User', value: `${member.user.tag}\n\`${member.id}\``, inline: true },
                        { name: 'XP Gain', value: `+${amount}`, inline: true },
                        { name: 'Level', value: `${before.level} -> ${after.level}`, inline: true },
                    ],
                }).catch(() => {});

                res.json(APIResponse.success({
                    guildId,
                    userId: member.id,
                    amount,
                    before,
                    after,
                    leveledUp: after.level > before.level,
                }, 'Test XP granted', 'LEVELING_TEST_XP_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'LEVELING_TEST_XP_FAILED'));
            }
        });

        this.app.post('/leveling/:guildId/roles/auto-create', async (req, res) => {
            try {
                const guildId = String(req.params.guildId || '').trim();
                const guild = this.client.guilds.cache.get(guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guildId);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to configure this guild leveling'));
                if (!guild.members.me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
                    return res.status(400).json(APIResponse.badRequest('Bot needs Manage Roles to create level roles'));
                }

                const levels = String(req.body?.levels || '5,10,20,30,50')
                    .split(/[\s,;]+/)
                    .map(value => Math.max(1, Math.min(1000, Number(value) || 0)))
                    .filter(Boolean)
                    .slice(0, 25);
                const uniqueLevels = [...new Set(levels)].sort((a, b) => a - b);
                const prefix = String(req.body?.prefix || 'Level').trim().slice(0, 32) || 'Level';
                const created = [];
                const rewards = [];

                for (const level of uniqueLevels) {
                    const name = `${prefix} ${level}`;
                    let role = guild.roles.cache.find(item => item.name === name);
                    if (!role) {
                        role = await guild.roles.create({
                            name,
                            reason: `Dashboard AutoCreate level role ${level}`,
                            mentionable: false,
                        });
                        created.push({ level, roleId: role.id, roleName: role.name });
                    }
                    rewards.push({ level, roleId: role.id, roleName: role.name });
                }

                const { getGuildConfig, setGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guildId);
                const existing = config.leveling && typeof config.leveling === 'object' ? config.leveling : {};
                setGuildConfig(guildId, {
                    leveling: {
                        ...existing,
                        autoCreateRoles: true,
                        autoRolePrefix: prefix,
                        roleRewards: rewards,
                    },
                });

                res.json(APIResponse.success({ guildId, created, roleRewards: rewards }, 'Level roles created', 'LEVELING_ROLES_CREATED'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'LEVELING_ROLES_CREATE_FAILED'));
            }
        });

        this.app.get('/leveling/:guildId/leaderboard', async (req, res) => {
            try {
                const guildId = String(req.params.guildId || '').trim();
                const guild = this.client.guilds.cache.get(guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guildId);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to this guild leveling data'));

                const limit = Math.max(5, Math.min(100, Number(req.query.limit || 50)));
                const page = Math.max(1, Number(req.query.page || 1));
                const offset = (page - 1) * limit;
                const leveling = require('../utils/levelingManager');
                const [rows, total] = await Promise.all([
                    leveling.getLeaderboard(guildId, limit, offset),
                    leveling.getLeaderboardTotal(guildId),
                ]);
                const users = await Promise.all(rows.map(async (row) => {
                    const member = guild.members.cache.get(row.userId)
                        || await guild.members.fetch(row.userId).catch(() => null);
                    const user = member?.user || this.client.users.cache.get(row.userId)
                        || await this.client.users.fetch(row.userId).catch(() => null);
                    return {
                        ...row,
                        displayName: member?.displayName || user?.globalName || user?.username || row.userId,
                        username: user?.username || row.userId,
                        avatar: user?.displayAvatarURL?.({ size: 64 }) || null,
                    };
                }));

                res.json(APIResponse.success({
                    guildId,
                    guildName: guild.name,
                    page,
                    limit,
                    total,
                    totalPages: Math.max(1, Math.ceil(total / limit)),
                    leaderboard: users,
                    users,
                }, 'Leveling leaderboard fetched', 'LEVELING_LEADERBOARD_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'LEVELING_LEADERBOARD_FAILED'));
            }
        });

        this.app.post('/leveling/:guildId/reset/user', async (req, res) => {
            try {
                const guildId = String(req.params.guildId || '').trim();
                const userId = String(req.body?.userId || '').trim();
                if (!guildId) return res.status(400).json(APIResponse.badRequest('guildId required'));
                if (!userId) return res.status(400).json(APIResponse.badRequest('userId required'));

                const guild = this.client.guilds.cache.get(guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guildId);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to reset leveling data'));

                const leveling = require('../utils/levelingManager');
                const affected = await leveling.resetUserXp(guildId, userId);
                const { getGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guildId);
                await sendServerLog(guild, config, 'leveling', {
                    title: 'Leveling Reset (User)',
                    description: `${dashboardActor(req)} reset XP for <@${userId}>.`,
                    color: 0xFEE75C,
                    fields: [
                        { name: 'User ID', value: `\`${userId}\``, inline: true },
                        { name: 'Rows Removed', value: String(affected), inline: true },
                    ],
                }).catch(() => {});

                res.json(APIResponse.success({ guildId, userId, affected }, 'User XP reset', 'LEVELING_RESET_USER_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'LEVELING_RESET_USER_FAILED'));
            }
        });

        this.app.post('/leveling/:guildId/reset/all', async (req, res) => {
            try {
                const guildId = String(req.params.guildId || '').trim();
                const confirmText = String(req.body?.confirm || '').trim();
                const expectedConfirm = `RESET ${guildId}`;
                if (!guildId) return res.status(400).json(APIResponse.badRequest('guildId required'));
                if (confirmText !== expectedConfirm) {
                    return res.status(400).json(APIResponse.badRequest(`Confirmation text must be exactly \"${expectedConfirm}\"`));
                }

                const guild = this.client.guilds.cache.get(guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guildId);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to reset leveling data'));

                const leveling = require('../utils/levelingManager');
                const affected = await leveling.resetGuildXp(guildId);
                const { getGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guildId);
                await sendServerLog(guild, config, 'leveling', {
                    title: 'Leveling Reset (Server)',
                    description: `${dashboardActor(req)} reset all XP rows for ${guild.name}.`,
                    color: 0xED4245,
                    fields: [
                        { name: 'Guild', value: `${guild.name}\n\`${guildId}\``, inline: true },
                        { name: 'Rows Removed', value: String(affected), inline: true },
                    ],
                }).catch(() => {});

                res.json(APIResponse.success({ guildId, affected }, 'Server XP reset', 'LEVELING_RESET_ALL_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'LEVELING_RESET_ALL_FAILED'));
            }
        });

        this.app.get('/leveling/:guildId/user/:userId', async (req, res) => {
            try {
                const guildId = String(req.params.guildId || '').trim();
                const userId = String(req.params.userId || '').trim();
                const guild = this.client.guilds.cache.get(guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guildId);
                if (!access.allowed && req.get('x-dashboard-user-id') !== userId) {
                    return res.status(403).json(APIResponse.forbidden('No access to this guild leveling data'));
                }

                const leveling = require('../utils/levelingManager');
                const row = await leveling.getUserLevel(guildId, userId);
                const member = guild.members.cache.get(userId)
                    || await guild.members.fetch(userId).catch(() => null);
                const user = member?.user || this.client.users.cache.get(userId)
                    || await this.client.users.fetch(userId).catch(() => null);

                res.json(APIResponse.success({
                    ...row,
                    displayName: member?.displayName || user?.globalName || user?.username || userId,
                    username: user?.username || userId,
                    avatar: user?.displayAvatarURL?.({ size: 64 }) || null,
                }, 'User level fetched', 'LEVELING_USER_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'LEVELING_USER_FAILED'));
            }
        });

        // ============ MODERATION ============
        this.app.get('/moderation/cases', async (req, res) => {
            try {
                const guildId = String(req.query.guildId || '').trim();
                if (!guildId) return res.status(400).json(APIResponse.badRequest('guildId required'));

                const guild = this.client.guilds.cache.get(guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guildId);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to this guild moderation data'));

                const limit = Math.max(10, Math.min(300, Number(req.query.limit || 25)));
                const page = Math.max(1, Number(req.query.page || 1));
                const offset = Math.max(0, Number(req.query.offset || ((page - 1) * limit)));
                const userId = String(req.query.userId || '').trim();
                const moderatorId = String(req.query.moderatorId || '').trim();
                const typeFilter = String(req.query.type || '').trim();
                const statusFilter = String(req.query.status || '').trim().toLowerCase();
                const reasonQuery = String(req.query.reason || req.query.q || '').trim().toLowerCase();
                const validTypes = ['warn', 'note', 'timeout', 'untimeout', 'kick', 'ban', 'unban', 'automod'];
                const pool = getPool();
                const params = [guildId];
                let where = 'guild_id = ?';
                if (userId) {
                    where += ' AND user_id = ?';
                    params.push(userId);
                }
                if (moderatorId) {
                    where += ' AND moderator_id = ?';
                    params.push(moderatorId);
                }
                if (typeFilter && validTypes.includes(typeFilter)) {
                    where += ' AND type = ?';
                    params.push(typeFilter);
                }
                if (statusFilter === 'resolved') {
                    where += " AND LOWER(COALESCE(status, '')) = 'resolved'";
                } else if (statusFilter === 'open') {
                    where += " AND LOWER(COALESCE(status, '')) <> 'resolved'";
                }
                if (reasonQuery) {
                    where += ' AND LOWER(COALESCE(reason, \"\")) LIKE ?';
                    params.push(`%${reasonQuery.slice(0, 120)}%`);
                }

                const [[{ total }]] = await pool.query(
                    `SELECT COUNT(*) AS total FROM moderation_cases WHERE ${where}`,
                    params
                );
                const totalCount = Number(total) || 0;
                const totalPages = Math.max(1, Math.ceil(totalCount / limit));
                const safePage = Math.min(page, totalPages);
                const safeOffset = Math.max(0, Math.min(offset, (totalPages - 1) * limit));

                const queryParams = [...params, limit, safeOffset];

                const [rows] = await pool.query(
                    `
                    SELECT id, guild_id, user_id, moderator_id, type, reason, duration_ms,
                           expires_at, status, created_at, updated_at
                    FROM moderation_cases
                    WHERE ${where}
                    ORDER BY created_at DESC
                    LIMIT ? OFFSET ?
                    `,
                    queryParams
                );

                const cases = await Promise.all(rows.map(row => this.hydrateModerationCase(guild, row)));
                res.json(APIResponse.success({
                    guildId,
                    userId: userId || null,
                    moderatorId: moderatorId || null,
                    type: typeFilter || null,
                    status: statusFilter || null,
                    reason: reasonQuery || null,
                    pagination: {
                        page: safePage,
                        limit,
                        offset: safeOffset,
                        total: totalCount,
                        totalPages,
                    },
                    cases,
                }, 'Moderation cases fetched', 'MODERATION_CASES_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'MODERATION_CASES_FAILED'));
            }
        });

        this.app.get('/moderation/cases/:caseId', async (req, res) => {
            try {
                const guildId = String(req.query.guildId || '').trim();
                const caseId = Number(req.params.caseId || 0);
                if (!guildId) return res.status(400).json(APIResponse.badRequest('guildId required'));
                if (!Number.isInteger(caseId) || caseId <= 0) return res.status(400).json(APIResponse.badRequest('Invalid case ID'));

                const guild = this.client.guilds.cache.get(guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guildId);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to this guild moderation data'));

                const pool = getPool();
                const [rows] = await pool.query(
                    `
                    SELECT id, guild_id, user_id, moderator_id, type, reason, duration_ms,
                           expires_at, status, created_at, updated_at
                    FROM moderation_cases
                    WHERE id = ? AND guild_id = ?
                    LIMIT 1
                    `,
                    [caseId, guildId]
                );

                if (!rows.length) return res.status(404).json(APIResponse.notFound('Moderation case not found'));
                const moderationCase = await this.hydrateModerationCase(guild, rows[0]);
                res.json(APIResponse.success({ case: moderationCase }, 'Moderation case fetched', 'MODERATION_CASE_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'MODERATION_CASE_FAILED'));
            }
        });

        this.app.post('/moderation/cases/:caseId/reason', async (req, res) => {
            try {
                const guildId = String(req.body?.guildId || req.query.guildId || '').trim();
                const caseId = Number(req.params.caseId || 0);
                const reason = String(req.body?.reason || '').trim();
                if (!guildId) return res.status(400).json(APIResponse.badRequest('guildId required'));
                if (!Number.isInteger(caseId) || caseId <= 0) return res.status(400).json(APIResponse.badRequest('Invalid case ID'));
                if (!reason || reason.length > 1000) return res.status(400).json(APIResponse.badRequest('Reason must be 1-1000 characters'));

                const guild = this.client.guilds.cache.get(guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guildId);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to this guild moderation data'));

                const pool = getPool();
                const [existing] = await pool.query('SELECT * FROM moderation_cases WHERE id = ? AND guild_id = ? LIMIT 1', [caseId, guildId]);
                if (!existing.length) return res.status(404).json(APIResponse.notFound('Moderation case not found'));

                const now = Date.now();
                await pool.query(
                    `
                    UPDATE moderation_cases
                    SET reason = ?, updated_at = ?
                    WHERE id = ? AND guild_id = ?
                    `,
                    [reason, now, caseId, guildId]
                );

                const [updatedRows] = await pool.query('SELECT * FROM moderation_cases WHERE id = ? LIMIT 1', [caseId]);
                const moderationCase = await this.hydrateModerationCase(guild, updatedRows[0]);
                const { getGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guildId);
                sendServerLog(guild, config, 'moderation', {
                    title: 'Moderation Case Updated',
                    description: `${dashboardActor(req)} updated reason for case #${caseId}.`,
                    color: 0x667eea,
                    fields: [
                        { name: 'Case', value: `#${moderationCase.id}`, inline: true },
                        { name: 'Type', value: moderationCase.type, inline: true },
                        { name: 'Status', value: moderationCase.normalizedStatus, inline: true },
                        { name: 'Reason', value: moderationCase.reason || 'No reason provided', inline: false },
                    ],
                }).catch(() => {});

                res.json(APIResponse.success({ case: moderationCase }, 'Moderation case reason updated', 'MODERATION_CASE_REASON_UPDATED'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'MODERATION_CASE_REASON_UPDATE_FAILED'));
            }
        });

        this.app.post('/moderation/cases/:caseId/status', async (req, res) => {
            try {
                const guildId = String(req.body?.guildId || req.query.guildId || '').trim();
                const caseId = Number(req.params.caseId || 0);
                const incomingStatus = String(req.body?.status || '').trim().toLowerCase();
                if (!guildId) return res.status(400).json(APIResponse.badRequest('guildId required'));
                if (!Number.isInteger(caseId) || caseId <= 0) return res.status(400).json(APIResponse.badRequest('Invalid case ID'));
                if (!['open', 'resolved', 'active'].includes(incomingStatus)) {
                    return res.status(400).json(APIResponse.badRequest('Status must be open or resolved'));
                }

                const targetStatus = incomingStatus === 'resolved' ? 'resolved' : 'active';
                const guild = this.client.guilds.cache.get(guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guildId);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to this guild moderation data'));

                const pool = getPool();
                const [existing] = await pool.query('SELECT * FROM moderation_cases WHERE id = ? AND guild_id = ? LIMIT 1', [caseId, guildId]);
                if (!existing.length) return res.status(404).json(APIResponse.notFound('Moderation case not found'));

                const now = Date.now();
                const [columns] = await pool.query('SHOW COLUMNS FROM moderation_cases');
                const hasResolvedAt = Array.isArray(columns)
                    && columns.some(column => String(column.Field || '').toLowerCase() === 'resolved_at');

                if (hasResolvedAt) {
                    await pool.query(
                        `
                        UPDATE moderation_cases
                        SET status = ?, updated_at = ?, resolved_at = ?
                        WHERE id = ? AND guild_id = ?
                        `,
                        [targetStatus, now, targetStatus === 'resolved' ? now : null, caseId, guildId]
                    );
                } else {
                    await pool.query(
                        `
                        UPDATE moderation_cases
                        SET status = ?, updated_at = ?
                        WHERE id = ? AND guild_id = ?
                        `,
                        [targetStatus, now, caseId, guildId]
                    );
                }

                const [updatedRows] = await pool.query('SELECT * FROM moderation_cases WHERE id = ? LIMIT 1', [caseId]);
                const moderationCase = await this.hydrateModerationCase(guild, updatedRows[0]);
                const { getGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guildId);
                sendServerLog(guild, config, 'moderation', {
                    title: 'Moderation Case Status Updated',
                    description: `${dashboardActor(req)} marked case #${caseId} as ${moderationCase.normalizedStatus}.`,
                    color: moderationCase.normalizedStatus === 'resolved' ? 0x51cf66 : 0xFEE75C,
                    fields: [
                        { name: 'Case', value: `#${moderationCase.id}`, inline: true },
                        { name: 'Type', value: moderationCase.type, inline: true },
                        { name: 'Status', value: moderationCase.normalizedStatus, inline: true },
                        { name: 'Reason', value: moderationCase.reason || 'No reason provided', inline: false },
                    ],
                }).catch(() => {});

                res.json(APIResponse.success({ case: moderationCase }, 'Moderation case status updated', 'MODERATION_CASE_STATUS_UPDATED'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'MODERATION_CASE_STATUS_UPDATE_FAILED'));
            }
        });

        this.app.post('/moderation/warn', async (req, res) => {
            try {
                const { guildId, userId, reason } = req.body || {};
                if (!guildId || !userId) return res.status(400).json(APIResponse.badRequest('guildId and userId required'));
                const guild = this.client.guilds.cache.get(String(guildId));
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, String(guildId));
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to moderate this guild'));

                const row = await this.createModerationCase({
                    guild,
                    userId: String(userId),
                    moderatorId: req.get('x-dashboard-user-id') || null,
                    type: 'warn',
                    reason: reason || 'No reason provided',
                    status: 'active',
                });

                res.json(APIResponse.success(row, 'Warning recorded', 'MODERATION_WARN_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'MODERATION_WARN_FAILED'));
            }
        });

        this.app.post('/moderation/note', async (req, res) => {
            try {
                const { guildId, userId, note } = req.body || {};
                if (!guildId || !userId) return res.status(400).json(APIResponse.badRequest('guildId and userId required'));
                const guild = this.client.guilds.cache.get(String(guildId));
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, String(guildId));
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to moderate this guild'));

                const row = await this.createModerationCase({
                    guild,
                    userId: String(userId),
                    moderatorId: req.get('x-dashboard-user-id') || null,
                    type: 'note',
                    reason: note || 'No note provided',
                    status: 'active',
                });

                res.json(APIResponse.success(row, 'Mod note recorded', 'MODERATION_NOTE_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'MODERATION_NOTE_FAILED'));
            }
        });

        this.app.post('/moderation/timeout', async (req, res) => {
            try {
                const { guildId, userId, reason } = req.body || {};
                const durationMinutes = Math.max(1, Math.min(40320, Number(req.body?.durationMinutes || 10)));
                if (!guildId || !userId) return res.status(400).json(APIResponse.badRequest('guildId and userId required'));

                const guild = this.client.guilds.cache.get(String(guildId));
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, String(guildId));
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to moderate this guild'));

                const member = await guild.members.fetch(String(userId)).catch(() => null);
                if (!member) return res.status(404).json(APIResponse.notFound('Member not found'));

                const durationMs = durationMinutes * 60 * 1000;
                const expiresAt = Date.now() + durationMs;
                const auditReason = `${reason || 'Dashboard timeout'} | by ${dashboardActor(req)}`;
                await member.timeout(durationMs, auditReason);

                const row = await this.createModerationCase({
                    guild,
                    userId: String(userId),
                    moderatorId: req.get('x-dashboard-user-id') || null,
                    type: 'timeout',
                    reason: reason || 'No reason provided',
                    durationMs,
                    expiresAt,
                    status: 'active',
                });

                res.json(APIResponse.success(row, 'Member timed out', 'MODERATION_TIMEOUT_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'MODERATION_TIMEOUT_FAILED'));
            }
        });

        this.app.post('/moderation/untimeout', async (req, res) => {
            try {
                const { guildId, userId, reason } = req.body || {};
                if (!guildId || !userId) return res.status(400).json(APIResponse.badRequest('guildId and userId required'));

                const guild = this.client.guilds.cache.get(String(guildId));
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, String(guildId));
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to moderate this guild'));

                const member = await guild.members.fetch(String(userId)).catch(() => null);
                if (!member) return res.status(404).json(APIResponse.notFound('Member not found'));

                await member.timeout(null, `${reason || 'Dashboard timeout cleared'} | by ${dashboardActor(req)}`);
                const pool = getPool();
                const now = Date.now();
                await pool.query(
                    `
                    UPDATE moderation_cases
                    SET status = 'resolved', updated_at = ?
                    WHERE guild_id = ? AND user_id = ? AND type = 'timeout' AND status = 'active'
                    `,
                    [now, guild.id, String(userId)]
                );

                const row = await this.createModerationCase({
                    guild,
                    userId: String(userId),
                    moderatorId: req.get('x-dashboard-user-id') || null,
                    type: 'untimeout',
                    reason: reason || 'Timeout cleared',
                    status: 'active',
                });

                res.json(APIResponse.success(row, 'Timeout cleared', 'MODERATION_UNTIMEOUT_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'MODERATION_UNTIMEOUT_FAILED'));
            }
        });

        this.app.post('/moderation/kick', async (req, res) => {
            try {
                const { guildId, userId, reason } = req.body || {};
                if (!guildId || !userId) return res.status(400).json(APIResponse.badRequest('guildId and userId required'));

                const guild = this.client.guilds.cache.get(String(guildId));
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, String(guildId));
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to moderate this guild'));
                if (!(guild.members.me?.permissions?.has(PermissionsBitField.Flags.KickMembers) ?? false)) {
                    return res.status(403).json(APIResponse.forbidden('Fahrstuhl needs Kick Members permission'));
                }

                const member = await guild.members.fetch(String(userId)).catch(() => null);
                if (!member) return res.status(404).json(APIResponse.notFound('Member not found'));
                if (!member.kickable) {
                    return res.status(400).json(APIResponse.badRequest('Fahrstuhl cannot kick this member. Check role order and permissions.'));
                }

                const auditReason = `${reason || 'Dashboard kick'} | by ${dashboardActor(req)}`;
                await member.kick(auditReason);
                const row = await this.createModerationCase({
                    guild,
                    userId: String(userId),
                    moderatorId: req.get('x-dashboard-user-id') || null,
                    type: 'kick',
                    reason: reason || 'No reason provided',
                    status: 'active',
                });

                res.json(APIResponse.success(row, 'Member kicked', 'MODERATION_KICK_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'MODERATION_KICK_FAILED'));
            }
        });

        this.app.post('/moderation/ban', async (req, res) => {
            try {
                const { guildId, userId, reason } = req.body || {};
                const deleteMessageSeconds = Math.max(0, Math.min(604800, Number(req.body?.deleteMessageSeconds || 0)));
                if (!guildId || !userId) return res.status(400).json(APIResponse.badRequest('guildId and userId required'));

                const guild = this.client.guilds.cache.get(String(guildId));
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, String(guildId));
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to moderate this guild'));
                if (!(guild.members.me?.permissions?.has(PermissionsBitField.Flags.BanMembers) ?? false)) {
                    return res.status(403).json(APIResponse.forbidden('Fahrstuhl needs Ban Members permission'));
                }

                const member = await guild.members.fetch(String(userId)).catch(() => null);
                if (member && !member.bannable) {
                    return res.status(400).json(APIResponse.badRequest('Fahrstuhl cannot ban this member. Check role order and permissions.'));
                }

                const auditReason = `${reason || 'Dashboard ban'} | by ${dashboardActor(req)}`;
                await guild.members.ban(String(userId), { reason: auditReason, deleteMessageSeconds });
                const row = await this.createModerationCase({
                    guild,
                    userId: String(userId),
                    moderatorId: req.get('x-dashboard-user-id') || null,
                    type: 'ban',
                    reason: reason || 'No reason provided',
                    durationMs: deleteMessageSeconds * 1000,
                    status: 'active',
                });

                res.json(APIResponse.success(row, 'Member banned', 'MODERATION_BAN_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'MODERATION_BAN_FAILED'));
            }
        });

        this.app.post('/moderation/unban', async (req, res) => {
            try {
                const { guildId, userId, reason } = req.body || {};
                if (!guildId || !userId) return res.status(400).json(APIResponse.badRequest('guildId and userId required'));
                if (!/^\d{17,20}$/.test(String(userId))) return res.status(400).json(APIResponse.badRequest('Invalid user ID format'));

                const guild = this.client.guilds.cache.get(String(guildId));
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, String(guildId));
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to moderate this guild'));
                if (!(guild.members.me?.permissions?.has(PermissionsBitField.Flags.BanMembers) ?? false)) {
                    return res.status(403).json(APIResponse.forbidden('Fahrstuhl needs Ban Members permission'));
                }

                const ban = await guild.bans.fetch(String(userId)).catch(() => null);
                if (!ban) return res.status(400).json(APIResponse.badRequest('User is not currently banned on this server'));

                const auditReason = `${reason || 'Dashboard unban'} | by ${dashboardActor(req)}`;
                await guild.members.unban(String(userId), auditReason);
                const row = await this.createModerationCase({
                    guild,
                    userId: String(userId),
                    moderatorId: req.get('x-dashboard-user-id') || null,
                    type: 'unban',
                    reason: reason || 'No reason provided',
                    status: 'resolved',
                });

                res.json(APIResponse.success(row, `${ban.user.tag} has been unbanned`, 'MODERATION_UNBAN_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'MODERATION_UNBAN_FAILED'));
            }
        });

        // ============ PREMIUM MANAGEMENT ============
        this.app.post('/premium/activate', async (req, res) => {
            try {
                const { userId, daysValid = 365, tier = 'basic' } = req.body;
                if (!userId) return res.status(400).json({ error: 'userId required' });
                if (!['basic', 'pro'].includes(tier)) return res.status(400).json({ error: 'tier must be basic or pro' });

                const premiumManager = require('../utils/premiumManager');
                await premiumManager.activatePremium(userId, daysValid, tier);
                const info = await premiumManager.getUserInfo(userId);

                // Log to Discord
                try {
                    const user = await this.client.users.fetch(userId).catch(() => null);
                    const username = user ? user.username : 'Unknown';
                    const expiresAt = new Date(info.expires_at);
                    const tierLabel = tier === 'pro' ? '👑 Pro' : '💎 Premium';
                    
                    // Send DM to user
                    if (user) {
                        const dmEmbed = require('discord.js').EmbedBuilder;
                        const embed = new dmEmbed()
                            .setColor(tier === 'pro' ? 0xFFD700 : 0x4CAF50)
                            .setTitle(`✅ ${tierLabel} Activated`)
                            .setDescription(`You now have **${tierLabel}** access!`)
                            .addFields(
                                { name: 'Tier', value: tierLabel },
                                { name: 'Days', value: String(daysValid) },
                                { name: 'Expires', value: expiresAt.toLocaleString() }
                            )
                            .setTimestamp();
                        
                        user.send({ embeds: [embed] }).catch(() => {});
                    }

                    console.log(`[Premium] ✅ ${username} (${userId}) activated as ${tier} for ${daysValid} days, expires: ${expiresAt.toISOString()}`);
                } catch (dmError) {
                    console.error('Error sending DM or logging:', dmError.message);
                }

                res.json(APIResponse.success({
                    userId,
                    tier: info.tier,
                    isPremium: info.is_premium,
                    expiresAt: info.expires_at
                }, `${tier} activated for ${daysValid} days`, 'PREMIUM_ACTIVATED'));
            } catch (error) {
                console.error('Premium activation error:', error);
                res.status(500).json(APIResponse.error(error.message, 'PREMIUM_ACTIVATION_FAILED'));
            }
        });

        this.app.post('/premium/deactivate', async (req, res) => {
            try {
                const { userId } = req.body;
                if (!userId) return res.status(400).json(APIResponse.badRequest('userId required'));

                const premiumManager = require('../utils/premiumManager');
                await premiumManager.deactivatePremium(userId);

                // Log to Discord
                try {
                    const user = await this.client.users.fetch(userId).catch(() => null);
                    const username = user ? user.username : 'Unknown';
                    
                    // Send DM to user
                    if (user) {
                        const dmEmbed = require('discord.js').EmbedBuilder;
                        const embed = new dmEmbed()
                            .setColor(0xff6b6b)
                            .setTitle('❌ Premium Removed')
                            .setDescription(`Your Premium access has been removed.`)
                            .setTimestamp();
                        
                        user.send({ embeds: [embed] }).catch(() => {});
                    }

                    console.log(`[Premium] ❌ ${username} (${userId}) premium removed`);
                } catch (dmError) {
                    console.error('Error sending DM or logging:', dmError.message);
                }

                res.json(APIResponse.success({ userId }, 'Premium deactivated', 'PREMIUM_DEACTIVATED'));
            } catch (error) {
                console.error('Premium deactivation error:', error);
                res.status(500).json(APIResponse.error(error.message, 'PREMIUM_DEACTIVATION_FAILED'));
            }
        });

        this.app.get('/premium/users', async (req, res) => {
            try {
                const premiumManager = require('../utils/premiumManager');
                const users = await premiumManager.getAllPremium();

                res.json(APIResponse.success({ users }, 'Premium users fetched', 'PREMIUM_USERS'));
            } catch (error) {
                console.error('Failed to get premium users:', error);
                res.status(500).json(APIResponse.error(error.message, 'PREMIUM_USERS_FAILED'));
            }
        });

        this.app.get('/premium/user/:userId', async (req, res) => {
            try {
                const { userId } = req.params;
                const premiumManager = require('../utils/premiumManager');
                const isPremium = await premiumManager.isPremium(userId);
                const isPro = isPremium ? await premiumManager.isPro(userId) : false;
                const info = await premiumManager.getUserInfo(userId);

                res.json(APIResponse.success({ isPremium, isPro, user: info }, 'User info fetched', 'PREMIUM_USER'));
            } catch (error) {
                console.error('Failed to get premium user info:', error);
                res.status(500).json(APIResponse.error(error.message, 'PREMIUM_USER_FAILED'));
            }
        });

        // Guild-level premium status — checks owner's premium tier and returns feature limits
        this.app.get('/guilds/:guildId/premium', async (req, res) => {
            try {
                const { guildId } = req.params;
                const guild = this.client.guilds.cache.get(guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));

                const premiumManager = require('../utils/premiumManager');
                // Check guild owner's premium — owners carry the premium for their server
                const ownerId = guild.ownerId;
                const isPremium = await premiumManager.isPremium(ownerId);
                const isPro = isPremium ? await premiumManager.isPro(ownerId) : false;
                const info = isPremium ? await premiumManager.getUserInfo(ownerId) : null;

                const tier = isPro ? 'pro' : (isPremium ? 'basic' : 'free');
                const limits = FEATURE_LIMITS[tier] || FEATURE_LIMITS.free;

                res.json(APIResponse.success({
                    hasPremium: isPremium,
                    isPro,
                    tier,
                    planName: limits.planName,
                    premiumUntil: info ? info.expires_at : null,
                    featureLimits: limits,
                }, 'Guild premium status fetched', 'GUILD_PREMIUM'));
            } catch (error) {
                console.error('Failed to get guild premium status:', error);
                res.status(500).json(APIResponse.error(error.message, 'GUILD_PREMIUM_FAILED'));
            }
        });

        this.app.get('/premium/calendar', async (req, res) => {
            try {
                const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
                const calendar = await this.buildPremiumCalendar(days);

                res.json(APIResponse.success(calendar, 'Premium calendar fetched', 'PREMIUM_CALENDAR'));
            } catch (error) {
                console.error('Failed to build premium calendar:', error);
                res.status(500).json(APIResponse.error(error.message, 'PREMIUM_CALENDAR_FAILED'));
            }
        });

        this.app.post('/premium/reminders/send', async (req, res) => {
            try {
                const daysBefore = Math.min(Math.max(parseInt(req.body.daysBefore, 10) || 3, 1), 90);
                const requestedUserIds = Array.isArray(req.body.userIds)
                    ? new Set(req.body.userIds.map(id => String(id).trim()).filter(Boolean))
                    : new Set();
                const calendar = await this.buildPremiumCalendar(daysBefore);
                const candidates = calendar.users.filter(user => {
                    if (requestedUserIds.size && !requestedUserIds.has(user.userId)) return false;
                    return !user.expired && Number.isFinite(user.daysRemaining) && user.daysRemaining <= daysBefore;
                });

                const results = [];
                for (const premiumUser of candidates) {
                    try {
                        const discordUser = await this.client.users.fetch(premiumUser.userId);
                        await discordUser.send({
                            embeds: [{
                                color: 0xFFD43B,
                                title: '⏳ Premium läuft bald ab',
                                description: `Dein **${premiumUser.tier === 'pro' ? 'Pro' : 'Premium'}** Zugang läuft in **${premiumUser.daysRemaining} Tag(en)** ab.`,
                                fields: [
                                    { name: 'Ablaufdatum', value: new Date(premiumUser.expiresAt).toLocaleString('de-DE'), inline: true },
                                    { name: 'Hinweis', value: 'Melde dich beim Team, wenn du verlängern möchtest.', inline: false },
                                ],
                                timestamp: new Date().toISOString(),
                            }],
                        });
                        monetizationStore.recordReminder({
                            userId: premiumUser.userId,
                            tier: premiumUser.tier,
                            expiresAt: premiumUser.expiresAt,
                            daysBefore,
                            success: true,
                            sentBy: dashboardActor(req),
                        });
                        results.push({ userId: premiumUser.userId, success: true });
                    } catch (sendError) {
                        monetizationStore.recordReminder({
                            userId: premiumUser.userId,
                            tier: premiumUser.tier,
                            expiresAt: premiumUser.expiresAt,
                            daysBefore,
                            success: false,
                            error: sendError.message,
                            sentBy: dashboardActor(req),
                        });
                        results.push({ userId: premiumUser.userId, success: false, error: sendError.message });
                    }
                }

                res.json(APIResponse.success({
                    daysBefore,
                    sent: results.filter(row => row.success).length,
                    failed: results.filter(row => !row.success).length,
                    skipped: Math.max(0, calendar.users.length - candidates.length),
                    results,
                    reminders: monetizationStore.listReminders({ limit: 100 }),
                }, 'Premium reminders processed', 'PREMIUM_REMINDERS_SENT'));
            } catch (error) {
                console.error('Failed to send premium reminders:', error);
                res.status(500).json(APIResponse.error(error.message, 'PREMIUM_REMINDERS_FAILED'));
            }
        });

        // ============ MONETIZATION ============
        this.app.get('/monetization/revenue', (req, res) => {
            try {
                const limit = Math.min(parseInt(req.query.limit, 10) || 500, 2000);
                res.json(APIResponse.success({
                    entries: monetizationStore.listRevenue({ limit }),
                    summary: monetizationStore.revenueSummary(),
                }, 'Revenue fetched', 'REVENUE_LIST'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'REVENUE_LIST_FAILED'));
            }
        });

        this.app.post('/monetization/revenue', (req, res) => {
            try {
                const amount = Number(req.body.amount || 0);
                if (!Number.isFinite(amount) || amount <= 0) {
                    return res.status(400).json(APIResponse.badRequest('amount must be greater than 0'));
                }

                const entry = monetizationStore.addRevenue({
                    userId: req.body.userId,
                    username: req.body.username,
                    amount,
                    currency: req.body.currency || 'EUR',
                    source: req.body.source || 'manual',
                    tier: req.body.tier,
                    note: req.body.note,
                    createdBy: dashboardActor(req),
                });

                res.json(APIResponse.success({ entry }, 'Revenue entry added', 'REVENUE_ADDED'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'REVENUE_ADD_FAILED'));
            }
        });

        this.app.post('/monetization/revenue/delete', (req, res) => {
            try {
                if (!req.body.id) return res.status(400).json(APIResponse.badRequest('id required'));
                const removed = monetizationStore.removeRevenue(req.body.id);
                if (!removed) return res.status(404).json(APIResponse.notFound('Revenue entry not found'));
                res.json(APIResponse.success({ id: req.body.id }, 'Revenue entry deleted', 'REVENUE_DELETED'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'REVENUE_DELETE_FAILED'));
            }
        });

        this.app.get('/monetization/promos', (req, res) => {
            try {
                res.json(APIResponse.success({ promoCodes: monetizationStore.listPromoCodes() }, 'Promo codes fetched', 'PROMO_LIST'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'PROMO_LIST_FAILED'));
            }
        });

        this.app.post('/monetization/promos/create', (req, res) => {
            try {
                const type = req.body.type === 'shields' ? 'shields' : 'premium';
                const promo = monetizationStore.createPromoCode({
                    code: req.body.code,
                    type,
                    tier: req.body.tier,
                    days: req.body.days,
                    shields: req.body.shields,
                    maxUses: req.body.maxUses,
                    expiresAt: req.body.expiresAt || null,
                    note: req.body.note,
                    createdBy: dashboardActor(req),
                });

                res.json(APIResponse.success({ promo }, 'Promo code created', 'PROMO_CREATED'));
            } catch (error) {
                res.status(400).json(APIResponse.error(error.message, 'PROMO_CREATE_FAILED', 400));
            }
        });

        this.app.post('/monetization/promos/toggle', (req, res) => {
            try {
                if (!req.body.code) return res.status(400).json(APIResponse.badRequest('code required'));
                const active = !(req.body.active === false || req.body.active === 0 || req.body.active === '0');
                const promo = monetizationStore.setPromoActive(req.body.code, active);
                res.json(APIResponse.success({ promo }, 'Promo code updated', 'PROMO_UPDATED'));
            } catch (error) {
                res.status(404).json(APIResponse.error(error.message, 'PROMO_UPDATE_FAILED', 404));
            }
        });

        this.app.post('/monetization/promos/redeem', async (req, res) => {
            try {
                const { code, userId } = req.body;
                if (!code) return res.status(400).json(APIResponse.badRequest('code required'));
                if (!InputValidator.isValidUserId(userId)) {
                    return res.status(400).json(APIResponse.badRequest('valid userId required'));
                }

                const { promo, redemption } = monetizationStore.reservePromoRedemption(code, {
                    userId,
                    redeemedBy: dashboardActor(req),
                });

                let result;
                let updatedPromo;
                try {
                    if (promo.type === 'premium') {
                        const premiumManager = require('../utils/premiumManager');
                        await premiumManager.activatePremium(userId, promo.days, promo.tier);
                        result = await premiumManager.getUserInfo(userId);
                    } else {
                        const stats = getUserStats(userId);
                        const shields = Number(promo.shields || 0);
                        setUserStats(userId, { shieldsOwned: (stats.shieldsOwned || 0) + shields });
                        result = { userId, shieldsAdded: shields, shieldsOwned: (stats.shieldsOwned || 0) + shields };
                    }
                    updatedPromo = monetizationStore.completePromoRedemption(code, redemption.id);
                } catch (applyError) {
                    monetizationStore.cancelPromoRedemption(code, redemption.id);
                    throw applyError;
                }

                this.client.users.fetch(userId)
                    .then(user => user.send(`🎟️ Promo-Code **${updatedPromo.code}** wurde eingelöst.`))
                    .catch(() => {});

                res.json(APIResponse.success({
                    promo: updatedPromo,
                    result,
                }, 'Promo code redeemed', 'PROMO_REDEEMED'));
            } catch (error) {
                res.status(400).json(APIResponse.error(error.message, 'PROMO_REDEEM_FAILED', 400));
            }
        });

        this.app.get('/monetization/votes', (req, res) => {
            try {
                const limit = Math.min(parseInt(req.query.limit, 10) || 500, 2000);
                res.json(APIResponse.success({
                    votes: monetizationStore.listVotes({ limit }),
                    summary: monetizationStore.voteSummary(),
                }, 'Votes fetched', 'VOTE_LIST'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'VOTE_LIST_FAILED'));
            }
        });

        // ============ GUILDS LIST ============
        this.app.get('/guilds', (req, res) => {
            try {
                const guilds = this.client.guilds.cache.map(g => ({
                    id: g.id,
                    name: g.name,
                    memberCount: g.memberCount,
                    icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64` : null,
                    joinedAt: g.joinedAt?.toISOString() ?? null,
                    ownerId: g.ownerId,
                })).sort((a, b) => b.memberCount - a.memberCount);

                res.json(APIResponse.success({
                    guilds,
                    total: guilds.length,
                    totalMembers: guilds.reduce((s, g) => s + g.memberCount, 0),
                }, 'Guilds fetched', 'GUILDS_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'GUILDS_FAILED'));
            }
        });

        // ============ SHIELD MANAGEMENT ============
        // POST /shields/give  { userId, amount }
        this.app.post('/shields/give', (req, res) => {
            try {
                const { userId, amount } = req.body;
                if (!userId) return res.status(400).json(APIResponse.badRequest('userId required'));
                const n = parseInt(amount);
                if (isNaN(n) || n < 1 || n > 9999) return res.status(400).json(APIResponse.badRequest('amount must be 1–9999'));
                const stats = getUserStats(userId);
                const newTotal = (stats.shieldsOwned ?? 0) + n;
                setUserStats(userId, { shieldsOwned: newTotal });
                console.log(`[Admin] 🛡️ +${n} shields given to ${userId} (total: ${newTotal})`);
                res.json(APIResponse.success({ userId, shieldsOwned: newTotal }, `+${n} shields given`, 'SHIELDS_GIVEN'));
            } catch (e) {
                res.status(500).json(APIResponse.error(e.message, 'SHIELDS_GIVE_FAILED'));
            }
        });

        // POST /shields/take  { userId, amount }
        this.app.post('/shields/take', (req, res) => {
            try {
                const { userId, amount } = req.body;
                if (!userId) return res.status(400).json(APIResponse.badRequest('userId required'));
                const n = parseInt(amount);
                if (isNaN(n) || n < 1) return res.status(400).json(APIResponse.badRequest('amount must be >= 1'));
                const stats = getUserStats(userId);
                const newTotal = Math.max(0, (stats.shieldsOwned ?? 0) - n);
                setUserStats(userId, { shieldsOwned: newTotal });
                console.log(`[Admin] 🛡️ -${n} shields taken from ${userId} (total: ${newTotal})`);
                res.json(APIResponse.success({ userId, shieldsOwned: newTotal }, `-${n} shields taken`, 'SHIELDS_TAKEN'));
            } catch (e) {
                res.status(500).json(APIResponse.error(e.message, 'SHIELDS_TAKE_FAILED'));
            }
        });

        // POST /shields/clear-active  { userId }
        this.app.post('/shields/clear-active', (req, res) => {
            try {
                const { userId } = req.body;
                if (!userId) return res.status(400).json(APIResponse.badRequest('userId required'));
                setUserStats(userId, { activeShieldExpiry: 0 });
                console.log(`[Admin] 🛡️ Active shield cleared for ${userId}`);
                res.json(APIResponse.success({ userId }, 'Active shield cleared', 'SHIELD_CLEARED'));
            } catch (e) {
                res.status(500).json(APIResponse.error(e.message, 'SHIELD_CLEAR_FAILED'));
            }
        });

        // ============ LOGS ============
        this.app.get('/logs', (req, res) => {
            try {
                const fs = require('fs');
                const path = require('path');
                const limit = Math.min(parseInt(req.query.limit) || 200, 500);
                const level = req.query.level || 'all'; // all | error | info

                const logFile = path.join(__dirname, '../logs/app.log');
                let lines = [];

                if (fs.existsSync(logFile)) {
                    const raw = fs.readFileSync(logFile, 'utf8');
                    lines = raw.trim().split('\n').filter(Boolean);
                } else {
                    // Fallback: in-memory log buffer (combined from both sources)
                    lines = logBuffer.map(l => `[${l.t}] ${l.l.toUpperCase().padEnd(5)} ${l.m}`).concat(global._logBuffer || []);
                }

                // Filter
                let filtered = lines;
                if (level === 'error') filtered = lines.filter(l => /error|❌|warn/i.test(l));
                else if (level === 'info') filtered = lines.filter(l => !/error|❌|warn/i.test(l));

                // Last N lines, newest first
                const result = filtered.slice(-limit).reverse().map((line, i) => ({
                    id: i,
                    raw: line,
                    isError: /error|❌/i.test(line),
                    isWarn: /warn|⚠️/i.test(line),
                }));

                res.json(APIResponse.success({
                    logs: result,
                    total: result.length,
                    source: fs.existsSync(logFile) ? 'file' : 'buffer',
                }, 'Logs fetched', 'LOGS_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'LOGS_FAILED'));
            }
        });

        // ============ COMMANDS LIST ============
        this.app.get('/commands', (req, res) => {
            try {
                const commandStatsManager = require('../utils/commandStatsManager');
                const allStats = commandStatsManager.getAllStats();

                const premiumCommands = ['notifysettings'];
                const categories = {
                    elevator: '🎭 Troll', ghost: '🎭 Troll', mute: '🎭 Troll',
                    mirror: '🎭 Troll', deafen: '🎭 Troll',
                    preset: '🎭 Troll', presetstop: '🎭 Troll',
                    shield: '🛡️ Shield', claim: '🛡️ Shield', checkshield: '🛡️ Shield',
                    addshield: '⚙️ Admin', removeshield: '⚙️ Admin',
                    setrole: '⚙️ Admin', settrollrole: '⚙️ Admin',
                    globalstop: '⚙️ Admin', reloadcache: '⚙️ Admin', synccommands: '⚙️ Admin', dbstatus: '⚙️ Admin',
                    help: '📊 Info', status: '📊 Info', dashboard: '📊 Info', invite: '📊 Info',
                    notifysettings: '💎 Premium',
                };

                const commandList = this.commands.map(cmd => ({
                    name: cmd.name,
                    description: cmd.description,
                    uses: allStats.commands?.[cmd.name] || 0,
                    errors: allStats.errors?.[cmd.name] || 0,
                    premium: premiumCommands.includes(cmd.name),
                    category: categories[cmd.name] || '❓ Other',
                })).sort((a, b) => b.uses - a.uses);

                res.json(APIResponse.success({
                    commands: commandList,
                    total: commandList.length,
                    totalUses: allStats.totalExecutions || 0,
                    totalErrors: allStats.totalErrors || 0,
                }, 'Commands fetched', 'COMMANDS_OK'));
            } catch (error) {
                console.error('Failed to get commands:', error);
                res.status(500).json(APIResponse.error(error.message, 'COMMANDS_FAILED'));
            }
        });

        // ============ VOICE TTS (DEV ONLY) ============
        this.app.get('/voice/guilds', async (req, res) => {
            try {
                const guilds = [];
                for (const guild of this.client.guilds.cache.values()) {
                    const access = await this.getDashboardGuildAccess(req, guild.id);
                    if (!access.allowed) continue;

                    guilds.push({
                        id: guild.id,
                        name: guild.name,
                        icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64` : null,
                        accessReason: access.reason,
                        voiceChannels: guild.channels.cache
                            .filter(c => c.type === 2) // GUILD_VOICE
                            .map(c => ({ id: c.id, name: c.name, members: c.members.size }))
                            .sort((a, b) => a.name.localeCompare(b.name))
                    });
                }
                guilds.sort((a, b) => a.name.localeCompare(b.name));
                res.json(APIResponse.success({ guilds }, 'Voice guilds fetched', 'VOICE_GUILDS_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'VOICE_GUILDS_FAILED'));
            }
        });

        // ============ VOICE USAGE TRACKING (ADMIN) ============
        this.app.get('/voice/usage/summary', async (req, res) => {
            try {
                const guildId = String(req.query.guildId || '').trim();
                if (!guildId) return res.status(400).json(APIResponse.badRequest('guildId required'));
                const access = await this.getDashboardGuildAccess(req, guildId);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to this guild voice data'));

                const days = Math.max(1, Math.min(365, Number(req.query.days || 30)));
                const limit = Math.max(5, Math.min(300, Number(req.query.limit || 100)));
                const since = Date.now() - (days * 24 * 60 * 60 * 1000);

                const pool = getPool();
                const [rows] = await pool.query(
                    `
                    SELECT user_id,
                           SUM(CASE WHEN ended_at IS NULL THEN (? - started_at) ELSE duration_ms END) AS total_ms,
                           SUM(CASE WHEN ended_at IS NULL THEN 1 ELSE 0 END) AS active_sessions,
                           COUNT(*) AS sessions
                    FROM voice_channel_sessions
                    WHERE guild_id = ? AND (ended_at IS NULL OR ended_at >= ?)
                    GROUP BY user_id
                    ORDER BY total_ms DESC
                    LIMIT ?
                    `,
                    [Date.now(), guildId, since, limit]
                );

                const guild = this.client.guilds.cache.get(guildId);
                const result = [];
                for (const r of rows) {
                    const userId = String(r.user_id);
                    const cached = this.client.users.cache.get(userId);
                    const memberName = guild?.members?.cache?.get(userId)?.displayName;
                    result.push({
                        userId,
                        displayName: memberName || (cached ? (cached.globalName || cached.username) : userId),
                        totalMs: Number(r.total_ms || 0),
                        sessions: Number(r.sessions || 0),
                        activeSessions: Number(r.active_sessions || 0),
                    });
                }

                res.json(APIResponse.success({
                    guildId,
                    days,
                    since,
                    users: result,
                }, 'Voice usage summary fetched', 'VOICE_USAGE_SUMMARY_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'VOICE_USAGE_SUMMARY_FAILED'));
            }
        });

        this.app.get('/voice/usage/user/:userId', async (req, res) => {
            try {
                const guildId = String(req.query.guildId || '').trim();
                const userId = String(req.params.userId || '').trim();
                if (!guildId) return res.status(400).json(APIResponse.badRequest('guildId required'));
                if (!userId) return res.status(400).json(APIResponse.badRequest('userId required'));
                const access = await this.getDashboardGuildAccess(req, guildId);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to this guild voice data'));

                const days = Math.max(1, Math.min(365, Number(req.query.days || 30)));
                const since = Date.now() - (days * 24 * 60 * 60 * 1000);

                const pool = getPool();
                const [rows] = await pool.query(
                    `
                    SELECT channel_id,
                           SUM(CASE WHEN ended_at IS NULL THEN (? - started_at) ELSE duration_ms END) AS total_ms,
                           SUM(CASE WHEN ended_at IS NULL THEN 1 ELSE 0 END) AS active_sessions,
                           COUNT(*) AS sessions
                    FROM voice_channel_sessions
                    WHERE guild_id = ? AND user_id = ? AND (ended_at IS NULL OR ended_at >= ?)
                    GROUP BY channel_id
                    ORDER BY total_ms DESC
                    LIMIT 100
                    `,
                    [Date.now(), guildId, userId, since]
                );

                const guild = this.client.guilds.cache.get(guildId);
                const channels = [];
                for (const r of rows) {
                    const channelId = String(r.channel_id);
                    const chan = guild?.channels?.cache?.get(channelId);
                    channels.push({
                        channelId,
                        channelName: chan ? chan.name : channelId,
                        totalMs: Number(r.total_ms || 0),
                        sessions: Number(r.sessions || 0),
                        activeSessions: Number(r.active_sessions || 0),
                    });
                }

                const cached = this.client.users.cache.get(userId);
                const memberName = guild?.members?.cache?.get(userId)?.displayName;

                res.json(APIResponse.success({
                    guildId,
                    userId,
                    displayName: memberName || (cached ? (cached.globalName || cached.username) : userId),
                    days,
                    since,
                    channels,
                }, 'Voice usage user fetched', 'VOICE_USAGE_USER_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'VOICE_USAGE_USER_FAILED'));
            }
        });

        this.app.get('/voice/usage/live', async (req, res) => {
            try {
                const guildId = String(req.query.guildId || '').trim();
                if (!guildId) return res.status(400).json(APIResponse.badRequest('guildId required'));
                const access = await this.getDashboardGuildAccess(req, guildId);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to this guild voice data'));

                const pool = getPool();
                const now = Date.now();
                const [rows] = await pool.query(
                    `
                    SELECT id, guild_id, user_id, channel_id, started_at, reward_tokens, reward_error
                    FROM voice_channel_sessions
                    WHERE guild_id = ? AND ended_at IS NULL
                    ORDER BY started_at ASC
                    LIMIT 200
                    `,
                    [guildId]
                );

                const guild = this.client.guilds.cache.get(guildId);
                const sessions = rows.map((row) => {
                    const userId = String(row.user_id);
                    const channelId = String(row.channel_id);
                    const user = this.client.users.cache.get(userId);
                    const member = guild?.members?.cache?.get(userId);
                    const channel = guild?.channels?.cache?.get(channelId);
                    return {
                        sessionId: Number(row.id),
                        userId,
                        displayName: member?.displayName || user?.globalName || user?.username || userId,
                        channelId,
                        channelName: channel?.name || channelId,
                        startedAt: Number(row.started_at || 0),
                        durationMs: Math.max(0, now - Number(row.started_at || now)),
                        rewardTokens: Number(row.reward_tokens || 0),
                        rewardError: row.reward_error || null,
                    };
                });

                res.json(APIResponse.success({ guildId, now, sessions }, 'Live voice sessions fetched', 'VOICE_USAGE_LIVE_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'VOICE_USAGE_LIVE_FAILED'));
            }
        });

        this.app.get('/voice/usage/rewards', async (req, res) => {
            try {
                const guildId = String(req.query.guildId || '').trim();
                if (!guildId) return res.status(400).json(APIResponse.badRequest('guildId required'));
                const access = await this.getDashboardGuildAccess(req, guildId);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to this guild voice data'));

                const days = Math.max(1, Math.min(365, Number(req.query.days || 30)));
                const limit = Math.max(10, Math.min(300, Number(req.query.limit || 80)));
                const since = Date.now() - (days * 24 * 60 * 60 * 1000);

                const pool = getPool();
                const [rows] = await pool.query(
                    `
                    SELECT id, guild_id, user_id, channel_id, started_at, ended_at, duration_ms,
                           reward_tokens, rewarded_at, reward_error
                    FROM voice_channel_sessions
                    WHERE guild_id = ?
                      AND (started_at >= ? OR ended_at >= ? OR rewarded_at >= ? OR ended_at IS NULL)
                    ORDER BY COALESCE(rewarded_at, ended_at, started_at) DESC
                    LIMIT ?
                    `,
                    [guildId, since, since, since, limit]
                );

                const guild = this.client.guilds.cache.get(guildId);
                const rewards = rows.map((row) => {
                    const userId = String(row.user_id);
                    const channelId = String(row.channel_id);
                    const user = this.client.users.cache.get(userId);
                    const member = guild?.members?.cache?.get(userId);
                    const channel = guild?.channels?.cache?.get(channelId);
                    const active = !row.ended_at;
                    const tokens = Number(row.reward_tokens || 0);
                    const error = row.reward_error || null;
                    let status = 'pending';
                    if (tokens > 0) status = active ? 'paid_live' : 'paid';
                    if (error) status = tokens > 0 ? 'partial' : 'skipped';

                    return {
                        sessionId: Number(row.id),
                        userId,
                        displayName: member?.displayName || user?.globalName || user?.username || userId,
                        channelId,
                        channelName: channel?.name || channelId,
                        startedAt: Number(row.started_at || 0),
                        endedAt: row.ended_at ? Number(row.ended_at) : null,
                        durationMs: active ? Math.max(0, Date.now() - Number(row.started_at || Date.now())) : Number(row.duration_ms || 0),
                        rewardTokens: tokens,
                        rewardedAt: row.rewarded_at ? Number(row.rewarded_at) : null,
                        rewardError: error,
                        active,
                        status,
                    };
                });

                res.json(APIResponse.success({ guildId, days, since, rewards }, 'Voice reward audit fetched', 'VOICE_USAGE_REWARDS_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'VOICE_USAGE_REWARDS_FAILED'));
            }
        });

        this.app.get('/voice/usage/heatmap', async (req, res) => {
            try {
                const guildId = String(req.query.guildId || '').trim();
                if (!guildId) return res.status(400).json(APIResponse.badRequest('guildId required'));
                const access = await this.getDashboardGuildAccess(req, guildId);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to this guild voice data'));

                const days = Math.max(1, Math.min(365, Number(req.query.days || 30)));
                const since = Date.now() - (days * 24 * 60 * 60 * 1000);
                const now = Date.now();

                const pool = getPool();
                const [rows] = await pool.query(
                    `
                    SELECT DAYOFWEEK(FROM_UNIXTIME(started_at / 1000)) AS weekday,
                           HOUR(FROM_UNIXTIME(started_at / 1000)) AS hour,
                           SUM(CASE WHEN ended_at IS NULL THEN (? - started_at) ELSE duration_ms END) AS total_ms,
                           COUNT(*) AS sessions
                    FROM voice_channel_sessions
                    WHERE guild_id = ? AND started_at >= ?
                    GROUP BY weekday, hour
                    ORDER BY weekday ASC, hour ASC
                    `,
                    [now, guildId, since]
                );

                const buckets = rows.map((row) => ({
                    weekday: Number(row.weekday || 0),
                    hour: Number(row.hour || 0),
                    totalMs: Number(row.total_ms || 0),
                    sessions: Number(row.sessions || 0),
                }));

                res.json(APIResponse.success({ guildId, days, since, buckets }, 'Voice heatmap fetched', 'VOICE_USAGE_HEATMAP_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'VOICE_USAGE_HEATMAP_FAILED'));
            }
        });

        this.app.post('/voice/say', async (req, res) => {
            try {
                const { guildId, channelId, text, lang = 'de' } = req.body;
                if (!guildId || !channelId || !text) {
                    return res.status(400).json(APIResponse.badRequest('guildId, channelId and text required'));
                }
                if (text.length > 300) {
                    return res.status(400).json(APIResponse.badRequest('Text too long (max 300 chars)'));
                }

                const guild = this.client.guilds.cache.get(guildId);
                if (!guild) return res.status(404).json(APIResponse.error('Guild not found', 'GUILD_NOT_FOUND'));

                const channel = guild.channels.cache.get(channelId)
                    || await guild.channels.fetch(channelId).catch(() => null);
                if (!channel || channel.type !== 2) {
                    return res.status(404).json(APIResponse.error('Voice channel not found', 'CHANNEL_NOT_FOUND'));
                }

                // Lazy-require voice/runtime modules
                let voiceModule, fs, os, path;
                try {
                    voiceModule = require('@discordjs/voice');
                    fs          = require('fs');
                    os          = require('os');
                    path        = require('path');
                } catch (e) {
                    return res.status(500).json(APIResponse.error(
                        'Voice runtime dependency missing. Ensure @discordjs/voice is installed.', 'VOICE_RUNTIME_MISSING'
                    ));
                }

                const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection } = voiceModule;

                // Generate TTS mp3 to temp file using Google TTS HTTP endpoint
                const tmpFile = path.join(os.tmpdir(), `tts_${Date.now()}.mp3`);
                try {
                    const audioBuffer = await fetchGoogleTtsMp3Buffer(text, lang);
                    fs.writeFileSync(tmpFile, audioBuffer);
                } catch (ttsError) {
                    return res.status(502).json(APIResponse.error(
                        `TTS generation failed: ${ttsError.message}`,
                        'VOICE_TTS_GENERATION_FAILED'
                    ));
                }

                // Join channel
                let connection = null;
                let player = null;
                try {
                    connection = joinVoiceChannel({
                        channelId: channel.id,
                        guildId: guild.id,
                        adapterCreator: guild.voiceAdapterCreator,
                        selfDeaf: false,
                    });

                    player = createAudioPlayer();
                    const resource = createAudioResource(tmpFile);
                    connection.subscribe(player);
                    player.play(resource);

                    await new Promise((resolve, reject) => {
                        player.once(AudioPlayerStatus.Idle, resolve);
                        player.once('error', reject);
                        setTimeout(resolve, 30000); // safety timeout 30s
                    });
                } finally {
                    try { player?.stop(); } catch (_) { }
                    try { connection?.destroy(); } catch (_) { }
                    try { fs.unlinkSync(tmpFile); } catch (_) { }
                }

                console.log(`[VoiceTTS] Played "${text}" in ${guild.name} / #${channel.name}`);
                res.json(APIResponse.success({ guild: guild.name, channel: channel.name, text }, 'TTS played', 'VOICE_TTS_OK'));
            } catch (error) {
                console.error('Voice TTS error:', error);
                res.status(500).json(APIResponse.error(error.message, 'VOICE_TTS_FAILED'));
            }
        });

        // ============ RICH USER LIST ============
        this.app.get('/users-rich', async (req, res) => {
            try {
                const db = require('../utils/analyticsDatabase');
                const dbInstance = await db.getInstance();
                const premiumManager = require('../utils/premiumManager');
                const { getUserStats } = require('../utils/config');
                const notificationManager = require('../utils/notificationManager');

                const limit  = Math.min(parseInt(req.query.limit) || 100, 500);
                const offset = Math.max(0, parseInt(req.query.offset) || 0);

                const { users: rawUsers, total } = dbInstance.getAllUsers(limit, offset);
                const allBlacklisted = blacklistManager.getAll ? blacklistManager.getAll() : [];
                const blacklistMap = {};
                for (const b of allBlacklisted) {
                    if (!blacklistMap[b.userId]) blacklistMap[b.userId] = [];
                    blacklistMap[b.userId].push(b);
                }

                let allPremium = [];
                try { allPremium = await premiumManager.getAllPremium(); } catch (_) {}
                const premiumMap = {};
                for (const p of allPremium) premiumMap[p.user_id] = p;

                // Per-user: top command + active guilds
                const topCmdResult = dbInstance.db ? dbInstance.db.exec(`
                    SELECT user_id, command, cnt FROM (
                        SELECT user_id, command, COUNT(*) AS cnt,
                               ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY COUNT(*) DESC) AS rn
                        FROM command_executions GROUP BY user_id, command
                    ) WHERE rn = 1
                `) : [];
                const topCmdMap = {};
                if (topCmdResult[0]) {
                    for (const [uid, cmd, cnt] of topCmdResult[0].values) {
                        topCmdMap[uid] = { command: cmd, count: cnt };
                    }
                }

                // Per-user: error rate
                const errResult = dbInstance.db ? dbInstance.db.exec(`
                    SELECT user_id, SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) as errors, COUNT(*) as total
                    FROM command_executions GROUP BY user_id
                `) : [];
                const errMap = {};
                if (errResult[0]) {
                    for (const [uid, errs, tot] of errResult[0].values) {
                        errMap[uid] = { errors: errs, total: tot };
                    }
                }

                // Per-user: distinct guilds active in
                const guildResult = dbInstance.db ? dbInstance.db.exec(`
                    SELECT user_id, COUNT(DISTINCT guild_id) as guilds
                    FROM command_executions GROUP BY user_id
                `) : [];
                const guildMap = {};
                if (guildResult[0]) {
                    for (const [uid, gc] of guildResult[0].values) {
                        guildMap[uid] = gc;
                    }
                }

                const users = await Promise.all(rawUsers.map(async (u) => {
                    const uid = u.user_id;
                    const discordUser = await this.client.users.fetch(uid).catch(() => null);
                    const stats = getUserStats(uid);
                    const pm = premiumMap[uid] || null;
                    const bl = blacklistMap[uid] || [];
                    const notifEnabled = notificationManager.hasNotificationsEnabled(uid);
                    const errInfo = errMap[uid] || { errors: 0, total: u.command_count || 1 };
                    const errorRate = errInfo.total > 0 ? Math.round((errInfo.errors / errInfo.total) * 100) : 0;
                    const shieldActive = stats.activeShieldExpiry && stats.activeShieldExpiry > Date.now();

                    return {
                        userId: uid,
                        username: discordUser?.username ?? null,
                        globalName: discordUser?.globalName ?? null,
                        avatar: discordUser?.avatar
                            ? `https://cdn.discordapp.com/avatars/${uid}/${discordUser.avatar}.png?size=64`
                            : `https://cdn.discordapp.com/embed/avatars/${(BigInt(uid) >> 22n) % 6n}.png`,
                        commandCount: u.command_count || 0,
                        lastUsed: u.last_used || null,
                        topCommand: topCmdMap[uid] ?? null,
                        activeGuilds: guildMap[uid] ?? 0,
                        errorRate,
                        errorCount: errInfo.errors,
                        premium: pm ? {
                            active: !!pm.is_premium,
                            expiresAt: pm.expires_at ?? null,
                            tier: pm.tier ?? 'basic',
                        } : { active: false, expiresAt: null, tier: null },
                        shields: {
                            owned: stats.shieldsOwned ?? 0,
                            active: shieldActive,
                            expiresAt: shieldActive ? new Date(stats.activeShieldExpiry).toISOString() : null,
                            lastClaim: stats.lastDailyClaim ? new Date(stats.lastDailyClaim).toISOString() : null,
                        },
                        blacklisted: bl.length > 0,
                        blacklistEntries: bl.map(b => ({ type: b.type, reason: b.reason, guildId: b.guildId ?? null })),
                        notificationsEnabled: notifEnabled,
                    };
                }));

                // Summary stats
                const premiumCount    = users.filter(u => u.premium.active).length;
                const blacklistCount  = users.filter(u => u.blacklisted).length;
                const shieldCount     = users.filter(u => u.shields.active).length;
                const avgCmds         = users.length ? Math.round(users.reduce((s, u) => s + u.commandCount, 0) / users.length) : 0;

                res.json(APIResponse.success({
                    users,
                    total,
                    limit,
                    offset,
                    summary: { premiumCount, blacklistCount, shieldCount, avgCmds },
                }, 'Rich user list fetched', 'USERS_RICH_OK'));
            } catch (error) {
                console.error('users-rich error:', error);
                res.status(500).json(APIResponse.error(error.message, 'USERS_RICH_FAILED'));
            }
        });

        // ============ GUILD MONITOR ============
        this.app.get('/monitor', async (req, res) => {
            try {
                const { getGuildConfig } = require('../utils/config');

                const guilds = await Promise.all(
                    this.client.guilds.cache.map(async (g) => {
                        const owner = await this.client.users.fetch(g.ownerId).catch(() => null);
                        const config = getGuildConfig(g.id);
                        const prefix = g.id + '-';

                        const getTrolledUsers = (map) =>
                            [...map.keys()].filter(k => k.startsWith(prefix)).map(k => k.replace(prefix, ''));

                        const activeMoveUsers    = getTrolledUsers(this.trollManager.activeMoves);
                        const activeGhostUsers   = getTrolledUsers(this.trollManager.activeGhosts);
                        const activeSilentUsers  = getTrolledUsers(this.trollManager.activeSilentPost);
                        const activeMirrorUsers  = getTrolledUsers(this.trollManager.activeMirror);
                        const activeDeafUsers    = getTrolledUsers(this.trollManager.activeDeafTroll);
                        const totalActiveTrolls  = activeMoveUsers.length + activeGhostUsers.length + activeSilentUsers.length + activeMirrorUsers.length + activeDeafUsers.length;

                        const allBlacklisted = blacklistManager.getAll ? blacklistManager.getAll() : [];
                        const guildBlacklisted = allBlacklisted.filter(b => b.guildId === g.id).length;

                        const textChannels  = g.channels.cache.filter(c => c.type === 0).size;
                        const voiceChannels = g.channels.cache.filter(c => c.type === 2).size;
                        const categories    = g.channels.cache.filter(c => c.type === 4).size;
                        const stageChannels = g.channels.cache.filter(c => c.type === 13).size;
                        const forumChannels = g.channels.cache.filter(c => c.type === 15).size;

                        const topRoles = g.roles.cache
                            .filter(r => r.name !== '@everyone')
                            .map(r => ({ name: r.name, color: r.hexColor, id: r.id, position: r.position, managed: r.managed }))
                            .sort((a, b) => b.position - a.position)
                            .slice(0, 15);

                        const botMember = g.members.me;
                        const botPerms  = botMember?.permissions;
                        const botRolePos = botMember?.roles?.highest?.position ?? 0;

                        // Resolve role names from config IDs
                        const trollRole = config.trollRoleId ? g.roles.cache.get(config.trollRoleId) : null;
                        const adminRole = config.adminRoleId ? g.roles.cache.get(config.adminRoleId) : null;

                        return {
                            id: g.id,
                            name: g.name,
                            icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128` : null,
                            memberCount: g.memberCount,
                            joinedAt: g.joinedAt?.toISOString() ?? null,
                            createdAt: g.createdAt?.toISOString() ?? null,
                            ownerId: g.ownerId,
                            ownerName: owner?.username ?? 'Unknown',
                            verificationLevel: g.verificationLevel,
                            premiumTier: g.premiumTier,
                            premiumSubscriptionCount: g.premiumSubscriptionCount ?? 0,
                            features: (g.features ?? []).slice(0, 10),
                            channels: { text: textChannels, voice: voiceChannels, categories, stage: stageChannels, forum: forumChannels, total: g.channels.cache.size },
                            roles: { count: g.roles.cache.size - 1, topRoles },
                            config: {
                                trollRoleId: config.trollRoleId ?? null,
                                trollRoleName: trollRole?.name ?? null,
                                adminRoleId: config.adminRoleId ?? null,
                                adminRoleName: adminRole?.name ?? null,
                            },
                            trolls: {
                                total: totalActiveTrolls,
                                elevator: { count: activeMoveUsers.length, users: activeMoveUsers },
                                ghost: { count: activeGhostUsers.length, users: activeGhostUsers },
                                silentPost: { count: activeSilentUsers.length, users: activeSilentUsers },
                                mirror: { count: activeMirrorUsers.length, users: activeMirrorUsers },
                                deafTroll: { count: activeDeafUsers.length, users: activeDeafUsers },
                            },
                            permissions: {
                                administrator: botPerms?.has(PermissionsBitField.Flags.Administrator) ?? false,
                                manageNicknames: botPerms?.has(PermissionsBitField.Flags.ManageNicknames) ?? false,
                                moveMembers: botPerms?.has(PermissionsBitField.Flags.MoveMembers) ?? false,
                                muteMembers: botPerms?.has(PermissionsBitField.Flags.MuteMembers) ?? false,
                                manageRoles: botPerms?.has(PermissionsBitField.Flags.ManageRoles) ?? false,
                                deafenMembers: botPerms?.has(PermissionsBitField.Flags.DeafenMembers) ?? false,
                                sendMessages: botPerms?.has(PermissionsBitField.Flags.SendMessages) ?? false,
                                viewChannel: botPerms?.has(PermissionsBitField.Flags.ViewChannel) ?? false,
                                botRolePosition: botRolePos,
                            },
                            blacklistedInGuild: guildBlacklisted,
                        };
                    })
                );

                guilds.sort((a, b) => b.trolls.total - a.trolls.total || b.memberCount - a.memberCount);

                res.json(APIResponse.success({
                    guilds,
                    total: guilds.length,
                    totalActiveTrolls: guilds.reduce((s, g) => s + g.trolls.total, 0),
                    totalMembers: guilds.reduce((s, g) => s + g.memberCount, 0),
                }, 'Monitor data fetched', 'MONITOR_OK'));
            } catch (error) {
                console.error('Monitor endpoint error:', error);
                res.status(500).json(APIResponse.error(error.message, 'MONITOR_FAILED'));
            }
        });

        this.registerTempVoiceRoutes();
        this.registerSocialRoutes();

        // ============ ERROR HANDLING ============
        this.app.use((req, res) => {
            res.status(404).json({ error: 'Endpoint not found' });
        });
    }

    async getDashboardGuildAccess(req, guildId, options = {}) {
        const actorId = String(req.get('x-dashboard-user-id') || '').trim();
        if (!actorId) return { allowed: false, reason: 'missing_actor' };

        const ownerId = String(process.env.OWNER_ID || '').trim();
        const dashboardMode = String(req.get('x-dashboard-mode') || 'admin').toLowerCase();
        if (ownerId && actorId === ownerId && dashboardMode !== 'user') {
            return { allowed: true, reason: 'bot_owner' };
        }

        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) return { allowed: false, reason: 'guild_not_found' };
        if (String(guild.ownerId) === actorId) return { allowed: true, reason: 'guild_owner' };

        const { getGuildConfig } = require('../utils/config');
        const config = getGuildConfig(guildId);
        const adminRoleId = String(config.adminRoleId || '').trim();
        const moduleKey = resolveDashboardModuleKeyFromRequest(req, options.moduleKey);
        const dashboardAccess = normalizeDashboardAccessConfig(config);

        const member = guild.members.cache.get(actorId)
            || await guild.members.fetch(actorId).catch(() => null);

        if (member?.permissions?.has(PermissionsBitField.Flags.Administrator)) {
            return { allowed: true, reason: 'discord_administrator' };
        }

        if (member?.permissions?.has(PermissionsBitField.Flags.ManageGuild)) {
            return { allowed: true, reason: 'discord_manage_guild' };
        }

        if (moduleKey) {
            const moduleRoleIds = dashboardAccess.moduleRoles[moduleKey] || [];
            if (moduleRoleIds.length > 0) {
                const hasModuleRole = moduleRoleIds.some((roleId) => member?.roles?.cache?.has(roleId));
                if (hasModuleRole) {
                    return { allowed: true, reason: 'module_role', moduleKey };
                }
                return { allowed: false, reason: 'missing_module_role', moduleKey };
            }
        }

        if (!adminRoleId) return { allowed: false, reason: 'admin_role_not_configured' };

        if (member?.roles?.cache?.has(adminRoleId)) {
            return { allowed: true, reason: 'admin_role' };
        }

        return { allowed: false, reason: 'not_guild_admin' };
    }

    async getGuildPremiumLimits(guildId) {
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) return FEATURE_LIMITS.free;
        const premiumManager = require('../utils/premiumManager');
        const isPremium = await premiumManager.isPremium(guild.ownerId).catch(() => false);
        const isPro = isPremium ? await premiumManager.isPro(guild.ownerId).catch(() => false) : false;
        const tier = isPro ? 'pro' : (isPremium ? 'basic' : 'free');
        return FEATURE_LIMITS[tier] || FEATURE_LIMITS.free;
    }

    async createModerationCase({ guild, userId, moderatorId = null, type, reason = '', durationMs = null, expiresAt = null, status = 'active' }) {
        const pool = getPool();
        const now = Date.now();
        const [result] = await pool.query(
            `
            INSERT INTO moderation_cases
                (guild_id, user_id, moderator_id, type, reason, duration_ms, expires_at, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [guild.id, userId, moderatorId, type, reason, durationMs, expiresAt, status, now, now]
        );
        const [rows] = await pool.query('SELECT * FROM moderation_cases WHERE id = ?', [result.insertId]);
        const moderationCase = await this.hydrateModerationCase(guild, rows[0]);
        const { getGuildConfig } = require('../utils/config');
        const config = getGuildConfig(guild.id);
        sendServerLog(guild, config, 'moderation', {
            title: `Moderation: ${moderationCase.type}`,
            description: `${moderatorId ? `<@${moderatorId}>` : 'Dashboard'} recorded a moderation case for <@${userId}>.`,
            color: ['timeout', 'kick', 'ban'].includes(moderationCase.type) ? 0xED4245 : (moderationCase.type === 'untimeout' ? 0x51cf66 : 0xFEE75C),
            fields: [
                { name: 'Member', value: `${moderationCase.displayName}\n\`${moderationCase.userId}\``, inline: true },
                { name: 'Moderator', value: `${moderationCase.moderatorName || 'dashboard'}\n\`${moderationCase.moderatorId || 'dashboard'}\``, inline: true },
                { name: 'Case', value: `#${moderationCase.id}`, inline: true },
                { name: 'Reason', value: moderationCase.reason || 'No reason provided', inline: false },
            ],
        }).catch(() => {});

        this.emitActivityEvent(guild.id, {
            id: `moderation:${moderationCase.id}`,
            type: 'moderation',
            action: String(moderationCase.type || 'case').toLowerCase(),
            userId: moderationCase.userId,
            userName: moderationCase.displayName || moderationCase.username || moderationCase.userId,
            actorId: moderationCase.moderatorId,
            actorName: moderationCase.moderatorName || 'dashboard',
            description: String(moderationCase.reason || 'Moderation action').slice(0, 500),
            severity: ['ban', 'kick'].includes(String(moderationCase.type || '').toLowerCase()) ? 'danger' : 'warn',
            createdAt: new Date(moderationCase.createdAt || Date.now()).toISOString(),
        });

        return moderationCase;
    }

    async hydrateModerationCase(guild, row) {
        const userId = String(row.user_id);
        const moderatorId = row.moderator_id ? String(row.moderator_id) : null;
        const member = guild?.members?.cache?.get(userId)
            || await guild?.members?.fetch(userId).catch(() => null);
        const user = member?.user || this.client.users.cache.get(userId)
            || await this.client.users.fetch(userId).catch(() => null);
        const moderator = moderatorId
            ? (this.client.users.cache.get(moderatorId) || await this.client.users.fetch(moderatorId).catch(() => null))
            : null;

        return {
            id: Number(row.id),
            guildId: String(row.guild_id),
            guildName: guild?.name ?? String(row.guild_id),
            userId,
            username: user?.username ?? userId,
            displayName: member?.displayName || user?.globalName || user?.username || userId,
            moderatorId,
            moderatorName: moderator?.globalName || moderator?.username || moderatorId,
            type: row.type,
            reason: row.reason || '',
            durationMs: row.duration_ms != null ? Number(row.duration_ms) : null,
            expiresAt: row.expires_at != null ? Number(row.expires_at) : null,
            status: row.status || 'active',
            normalizedStatus: String(row.status || '').toLowerCase() === 'resolved' ? 'resolved' : 'open',
            createdAt: Number(row.created_at || 0),
            updatedAt: Number(row.updated_at || 0),
        };
    }

    async executeCommand(commandName, context) {
        const { guild, user, target, args } = context;

        console.log(`🔵 executeCommand called: ${commandName}`);
        console.log(`📍 trollManager exists:`, !!this.trollManager);
        console.log(`👤 target:`, target?.username);
        console.log(`🏰 guild:`, guild?.name);

        switch (commandName) {
            case 'elevator':
                return await this.executeFahrstuhl(guild, target, args);
            case 'ghost':
                return await this.executeGeist(guild, target, args);
            case 'mute':
                return await this.executeStille(guild, target, args);
            case 'deafen':
                return await this.executeTaubheit(guild, target, args);
            default:
                throw new Error(`Unknown command: ${commandName}`);
        }
    }

    async executeFahrstuhl(guild, target, args) {
        try {
            console.log(`🟡 executeFahrstuhl started`);
            
            if (!this.trollManager) {
                console.error(`❌ trollManager is null/undefined!`);
                return { action: 'elevator', status: 'error', message: 'trollManager not available' };
            }
            if (!guild) {
                console.error(`❌ guild is null`);
                return { action: 'elevator', status: 'error', message: 'Guild missing' };
            }
            if (!target) {
                console.error(`❌ target is null`);
                return { action: 'elevator', status: 'error', message: 'Target missing' };
            }
            
            console.log(`🟡 Fetching member ${target.id} from guild`);
            const member = await guild.members.fetch(target.id);
            console.log(`✅ Member fetched: ${member.user.username}`);
            
            if (!member) throw new Error('Member not found in guild');
            
            console.log(`🟡 Calling trollManager.startAutoMove`);
            console.log(`📋 trollManager methods:`, Object.keys(this.trollManager).slice(0, 10));
            
            await this.trollManager.startAutoMove(member, false);
            
            console.log(`✅ Elevator executed successfully`);
            return {
                action: 'elevator',
                target: target.username,
                status: 'executing',
                message: 'Elevator started'
            };
        } catch (error) {
            console.error(`❌ Elevator error:`, error.message);
            console.error(`📋 Stack:`, error.stack);
            return {
                action: 'elevator',
                status: 'error',
                message: error.message
            };
        }
    }

    async executeGeist(guild, target, args) {
        try {
            if (!this.trollManager || !guild || !target) {
                return { action: 'ghost', status: 'error', message: 'Missing parameters' };
            }
            
            const member = await guild.members.fetch(target.id);
            if (!member) throw new Error('Member not found in guild');
            
            await this.trollManager.startGhostVisit(member);
            
            return {
                action: 'ghost',
                target: target.username,
                status: 'executing',
                message: 'Ghost started'
            };
        } catch (error) {
            console.error(`❌ Ghost error:`, error.message);
            return {
                action: 'ghost',
                status: 'error',
                message: error.message
            };
        }
    }

    async executeStille(guild, target, args) {
        try {
            if (!this.trollManager || !guild || !target) {
                return { action: 'mute', status: 'error', message: 'Missing parameters' };
            }
            
            const member = await guild.members.fetch(target.id);
            if (!member) throw new Error('Member not found in guild');
            
            await this.trollManager.startSilentPost(member);
            
            return {
                action: 'mute',
                target: target.username,
                status: 'executing',
                message: 'Mute started'
            };
        } catch (error) {
            console.error(`❌ Mute error:`, error.message);
            return {
                action: 'mute',
                status: 'error',
                message: error.message
            };
        }
    }

    async executeTaubheit(guild, target, args) {
        try {
            if (!this.trollManager || !guild || !target) {
                return { action: 'deafen', status: 'error', message: 'Missing parameters' };
            }
            
            const member = await guild.members.fetch(target.id);
            if (!member) throw new Error('Member not found in guild');
            
            await this.trollManager.startDeafTroll(member);
            
            return {
                action: 'deafen',
                target: target.username,
                status: 'executing',
                message: 'Deafen started'
            };
        } catch (error) {
            console.error(`❌ Deafen error:`, error.message);
            return {
                action: 'deafen',
                status: 'error',
                message: error.message
            };
        }
    }

    getActiveTrollSummary() {
        const manager = this.trollManager || {};
        const maps = {
            elevator: manager.activeMoves,
            ghost: manager.activeGhosts,
            silentPost: manager.activeSilentPost,
            mirror: manager.activeMirror,
            deafTroll: manager.activeDeafTroll,
        };
        const byType = {};
        for (const [name, map] of Object.entries(maps)) {
            byType[name] = map?.size || 0;
        }
        return {
            total: Object.values(byType).reduce((sum, count) => sum + count, 0),
            byType,
        };
    }

    getGuildTrollDetails(guildId) {
        const manager = this.trollManager || {};
        const prefix = `${guildId}-`;
        const collect = (map) => {
            if (!map?.keys) return [];
            return [...map.keys()]
                .filter(key => String(key).startsWith(prefix))
                .map(key => String(key).slice(prefix.length));
        };
        const details = {
            elevator: collect(manager.activeMoves),
            ghost: collect(manager.activeGhosts),
            silentPost: collect(manager.activeSilentPost),
            mirror: collect(manager.activeMirror),
            deafTroll: collect(manager.activeDeafTroll),
        };
        return {
            total: Object.values(details).reduce((sum, users) => sum + users.length, 0),
            details,
        };
    }

    async getGuildAnalytics(guildId) {
        try {
            const db = await analyticsDatabase.getInstance();
            if (!db.db) return { topCommands: [], recent: [], totals: { commands: 0, users: 0, errors: 0 } };
            const safeGuildId = escapeSqlLiteral(guildId);
            const topResult = db.db.exec(`
                SELECT command, COUNT(*) AS count,
                       SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) AS errors
                FROM command_executions
                WHERE guild_id='${safeGuildId}'
                GROUP BY command
                    return { allowed: false, reason: 'not_guild_admin' };
                }

                async getGuildPremiumLimits(guildId) {
                    const guild = this.client.guilds.cache.get(guildId);
                    if (!guild) return FEATURE_LIMITS.free;
                    const premiumManager = require('../utils/premiumManager');
                    const isPremium = await premiumManager.isPremium(guild.ownerId).catch(() => false);
                    const isPro = isPremium ? await premiumManager.isPro(guild.ownerId).catch(() => false) : false;
                    const tier = isPro ? 'pro' : (isPremium ? 'basic' : 'free');
                    return FEATURE_LIMITS[tier] || FEATURE_LIMITS.free;
                }

                async createModerationCase({ guild, userId, moderatorId = null, type, reason = '', durationMs = null, expiresAt = null, status = 'active' }) {
                    const pool = getPool();
                    const now = Date.now();
            `);

            return {
                topCommands: topResult[0]?.values.map(row => ({
                    command: row[0],
                    count: row[1],
                    errors: row[2] || 0,
                })) || [],
                recent: recentResult[0]?.values.map(row => ({
                    command: row[0],
                    userId: row[1],
                    timestamp: row[2],
                    success: !!row[3],
                })) || [],
                totals: {
                    commands: totalsResult[0]?.values[0]?.[0] || 0,
                    users: totalsResult[0]?.values[0]?.[1] || 0,
                    errors: totalsResult[0]?.values[0]?.[2] || 0,
                },
            };
        } catch (error) {
            return { topCommands: [], recent: [], totals: { commands: 0, users: 0, errors: 0 }, error: error.message };
        }
    }

    getSystemBackupSnapshot() {
        const status = readJsonFile(systemBackupStatusFile, null);
        if (!status || typeof status !== 'object') {
            return {
                available: false,
                ok: false,
                stale: true,
                statusFile: systemBackupStatusFile,
                detail: 'No whole-server backup status file found',
            };
        }

        const finishedAt = status.finishedAt || status.lastRunAt || null;
        const ageHours = finishedAt
            ? Math.round(((Date.now() - new Date(finishedAt).getTime()) / 36_000) / 100) / 100
            : null;
        const staleAfterHours = Math.max(Number(process.env.SYSTEM_BACKUP_STALE_HOURS || 30), 2);
        const missingCritical = Array.isArray(status.missingCritical) ? status.missingCritical : [];
        const missingCount = missingCritical.length;

        return {
            available: true,
            statusFile: systemBackupStatusFile,
            ok: !!status.ok,
            stale: !finishedAt || (ageHours !== null && ageHours > staleAfterHours),
            ageHours,
            staleAfterHours,
            snapshot: status.snapshot || null,
            snapshotDir: status.snapshotDir || null,
            finishedAt,
            copied: Number(status.copied || 0),
            missingCount,
            missing: missingCritical.slice(0, 50),
            mysqlDump: status.mysqlDump || null,
            retention: status.retention || null,
            verification: status.verification || null,
        };
    }

    getBackupSnapshot() {
        const status = this.backupManager?.getStatus ? this.backupManager.getStatus() : null;
        const system = this.getSystemBackupSnapshot();
        if (!status) {
            return {
                available: false,
                enabled: false,
                running: false,
                lastBackupAt: null,
                lastBackupFile: null,
                lastBackupError: 'Backup manager unavailable',
                lastBackupSize: 0,
                lastVerificationAt: null,
                lastVerificationOk: false,
                lastVerificationError: 'Backup manager unavailable',
                stale: true,
                ageHours: null,
                files: {
                    enabled: false,
                    running: false,
                    lastBackupAt: null,
                    lastBackupFile: null,
                    lastBackupError: 'Backup manager unavailable',
                    lastBackupSize: 0,
                    stale: true,
                    ageHours: null,
                },
                system,
            };
        }

        const ageHours = status.lastBackupAt
            ? Math.round(((Date.now() - status.lastBackupAt) / 36_000) / 100) / 100
            : null;
        const staleAfterHours = Math.max(Number(status.intervalHours || 24) * 1.5, 24);

        const filesStatus = status.files || {};
        const filesAgeHours = filesStatus.lastBackupAt
            ? Math.round(((Date.now() - filesStatus.lastBackupAt) / 36_000) / 100) / 100
            : null;
        const filesStaleAfterHours = Math.max(Number(filesStatus.intervalHours || status.intervalHours || 24) * 1.5, 24);

        return {
            available: true,
            ...status,
            lastBackupFileName: status.lastBackupFile ? path.basename(status.lastBackupFile) : null,
            ageHours,
            stale: status.enabled && (!status.lastBackupAt || ageHours > staleAfterHours),
            verification: {
                ok: !!status.lastVerificationOk,
                at: status.lastVerificationAt || null,
                error: status.lastVerificationError || null,
                size: status.lastBackupSize || 0,
            },
            files: {
                available: !!filesStatus.enabled,
                enabled: !!filesStatus.enabled,
                running: !!filesStatus.running,
                backupDir: filesStatus.backupDir || null,
                include: filesStatus.include || [],
                exclude: filesStatus.exclude || [],
                lastBackupAt: filesStatus.lastBackupAt || null,
                lastBackupFile: filesStatus.lastBackupFile || null,
                lastBackupFileName: filesStatus.lastBackupFile ? path.basename(filesStatus.lastBackupFile) : null,
                lastBackupError: filesStatus.lastBackupError || null,
                lastBackupSize: filesStatus.lastBackupSize || 0,
                ageHours: filesAgeHours,
                stale: !!filesStatus.enabled && (!filesStatus.lastBackupAt || (filesAgeHours !== null && filesAgeHours > filesStaleAfterHours)),
                verification: {
                    ok: !!filesStatus.lastVerificationOk,
                    at: filesStatus.lastVerificationAt || null,
                    error: filesStatus.lastVerificationError || null,
                    size: filesStatus.lastBackupSize || 0,
                },
            },
            system,
        };
    }

    getOpsServiceTargets() {
        const lavalinkDefaultHost = runningInDocker ? 'lavalink-docker' : '127.0.0.1';
        const redisDefaultHost = runningInDocker ? 'redis' : '127.0.0.1';

        const lavalink = parseHostPort(process.env.LAVALINK_HOST || `${lavalinkDefaultHost}:2333`, lavalinkDefaultHost, 2333);
        const redisFromEnv = process.env.REDIS_URL ? parseHostPort(process.env.REDIS_URL, redisDefaultHost, 6379) : null;
        const redisHost = process.env.OPS_REDIS_HOST || redisFromEnv?.host || redisDefaultHost;
        const redisPort = Number(process.env.OPS_REDIS_PORT || redisFromEnv?.port || 6379) || 6379;

        return [
            { id: 'fahrstuhl', name: 'fahrstuhl', type: 'http', url: normalizeOpsHttpTarget('fahrstuhl', process.env.FAHRSTUHL_HEALTH_URL || OPS_HTTP_DEFAULTS.fahrstuhl), pm2Names: ['fahrstuhl'], deployKey: 'fahrstuhl' },
            { id: 'dashboard-php', name: 'dashboard-php', type: 'http', url: normalizeOpsHttpTarget('dashboard-php', process.env.DASHBOARD_PHP_HEALTH_URL || OPS_HTTP_DEFAULTS['dashboard-php']), pm2Names: ['dashboard-php'] },
            { id: 'deploy-webhook', name: 'deploy-webhook', type: 'http', url: normalizeOpsHttpTarget('deploy-webhook', process.env.DEPLOY_WEBHOOK_HEALTH_URL || OPS_HTTP_DEFAULTS['deploy-webhook']), pm2Names: ['deploy-webhook'], deployKey: 'fahrstuhl' },
            { id: 'eseltokens', name: 'eseltokens', type: 'http', url: normalizeOpsHttpTarget('eseltokens', process.env.ESELTOKENS_HEALTH_URL || OPS_HTTP_DEFAULTS.eseltokens), pm2Names: ['eseltokens'], deployKey: 'eseltokens' },
            { id: 'eseltokens-webhook', name: 'eseltokens-webhook', type: 'http', url: normalizeOpsHttpTarget('eseltokens-webhook', process.env.ESELTOKENS_WEBHOOK_HEALTH_URL || OPS_HTTP_DEFAULTS['eseltokens-webhook']), pm2Names: ['eseltokens-webhook'], deployKey: 'eseltokens' },
            { id: 'filehoster', name: 'filehoster', type: 'http', url: normalizeOpsHttpTarget('filehoster', process.env.FILEHOSTER_HEALTH_URL || OPS_HTTP_DEFAULTS.filehoster), pm2Names: ['filehoster'] },
            { id: 'linkshortener', name: 'linkshortener', type: 'http', url: normalizeOpsHttpTarget('linkshortener', process.env.LINKSHORTENER_HEALTH_URL || OPS_HTTP_DEFAULTS.linkshortener), pm2Names: ['linkshortener'] },
            { id: 'zitatboard', name: 'zitatboard', type: 'http', url: normalizeOpsHttpTarget('zitatboard', process.env.ZITATBOARD_HEALTH_URL || OPS_HTTP_DEFAULTS.zitatboard), pm2Names: ['zitatboard', 'zitat-board'] },
            { id: 'statuspage', name: 'statuspage', type: 'http', url: normalizeOpsHttpTarget('statuspage', process.env.STATUSPAGE_HEALTH_URL || OPS_HTTP_DEFAULTS.statuspage), pm2Names: ['statuspage'] },
            { id: 'team', name: 'team', type: 'http', url: normalizeOpsHttpTarget('team', process.env.TEAM_HEALTH_URL || OPS_HTTP_DEFAULTS.team), pm2Names: ['team'] },
            { id: 'esel', name: 'esel', type: 'http', url: normalizeOpsHttpTarget('esel', process.env.ESEL_HEALTH_URL || OPS_HTTP_DEFAULTS.esel), pm2Names: ['esel'] },
            { id: 'musikbot', name: 'musikbot', type: 'http', url: normalizeOpsHttpTarget('musikbot', process.env.ESELMUSIC_HEALTH_URL || OPS_HTTP_DEFAULTS.musikbot), pm2Names: ['musikbot'] },
            { id: 'lavalink', name: 'lavalink', type: 'tcp', host: lavalink.host, port: lavalink.port, pm2Names: ['lavalink'] },
            { id: 'redis', name: 'redis', type: 'tcp', host: redisHost, port: redisPort, pm2Names: ['redis'] },
        ];
    }

    async buildOpsHealthSnapshot() {
        const pm2 = getPm2Processes();
        const deployStatus = readJsonFile(deployStatusFile, {});
        const timeoutMs = Math.max(1000, Number(process.env.OPS_HEALTH_TIMEOUT_MS || 5000));
        const services = this.getOpsServiceTargets();
        const byName = new Map(pm2.map(proc => [proc.name, proc]));

        const rows = await Promise.all(services.map(async service => {
            let probe = { ok: false, latency: null, statusCode: null, payload: null, error: 'unknown' };
            if (service.type === 'http') {
                probe = await probeHttpHealth(service.url, timeoutMs);
            } else {
                const tcp = await probeTcpPort(service.host, service.port, timeoutMs);
                probe = {
                    ok: tcp.ok,
                    latency: tcp.latency,
                    statusCode: null,
                    payload: null,
                    error: tcp.error,
                };
            }

            const pm2Process = (service.pm2Names || []).map(name => byName.get(name)).find(Boolean) || null;
            const healthData = extractHealthData(probe.payload);
            const deploy = service.deployKey ? (deployStatus[service.deployKey] || null) : null;
            const lastDeployAt = deploy?.finishedAt || deploy?.updatedAt || null;

            return {
                id: service.id,
                name: service.name,
                type: service.type,
                status: probe.ok ? 'online' : 'offline',
                latencyMs: probe.latency,
                statusCode: probe.statusCode,
                uptime: healthData?.uptime ?? healthData?.bot?.uptime ?? null,
                memoryBytes: pm2Process?.memory ?? null,
                cpu: pm2Process?.cpu ?? null,
                redisSessionStatus: healthData?.session_store || healthData?.redis || null,
                lastDeployAt,
                deployState: deploy?.state || null,
                pm2: pm2Process ? {
                    name: pm2Process.name,
                    status: pm2Process.status,
                    restarts: pm2Process.restarts,
                    uptime: pm2Process.uptime,
                } : null,
                endpoint: service.type === 'http' ? service.url : `${service.host}:${service.port}`,
                error: probe.error,
            };
        }));

        const onlineCount = rows.filter(row => row.status === 'online').length;
        return {
            checkedAt: new Date().toISOString(),
            totals: {
                total: rows.length,
                online: onlineCount,
                offline: rows.length - onlineCount,
            },
            services: rows,
            pm2,
        };
    }

    async buildHealthSummary() {
        const pm2 = getPm2Processes();
        const backup = this.getBackupSnapshot();
        const health = this.healthManager?.getSummary ? this.healthManager.getSummary() : null;
        const nginx = auditNginxSitesEnabled();
        const opsSnapshot = await this.buildOpsHealthSnapshot();
        const warnings = [];

        const restartWarnCount = Math.max(3, Number(process.env.OPS_DASHBOARD_RESTART_WARN_COUNT || 8));
        const highMemoryBytes = Math.max(128 * 1024 * 1024, Number(process.env.OPS_DASHBOARD_MEMORY_WARN_MB || 700) * 1024 * 1024);

        for (const service of opsSnapshot.services) {
            if (service.status !== 'online') {
                const criticalServices = new Set(['fahrstuhl', 'dashboard-php', 'deploy-webhook', 'eseltokens-webhook', 'redis', 'lavalink']);
                warnings.push({
                    severity: criticalServices.has(service.id) ? 'critical' : 'warn',
                    title: `${service.name} is down`,
                    detail: service.error || `Health probe failed for ${service.endpoint}`,
                    fix: service.type === 'http' ? `Check endpoint ${service.endpoint}` : `Check ${service.name} listener on ${service.endpoint}`,
                });
            }

            if (service.pm2?.status && service.pm2.status !== 'online') {
                warnings.push({
                    severity: (service.id === 'fahrstuhl' || service.id === 'dashboard-php') ? 'critical' : 'warn',
                    title: `${service.name} PM2 status ${service.pm2.status}`,
                    detail: `PM2 reports ${service.pm2.status} with ${service.pm2.restarts} restarts.`,
                });
            }

            if (typeof service.pm2?.restarts === 'number' && service.pm2.restarts >= restartWarnCount) {
                warnings.push({
                    severity: 'warn',
                    title: `${service.name} restart loop suspected`,
                    detail: `PM2 restart counter is ${service.pm2.restarts}.`,
                    fix: 'Inspect logs and verify upstream dependencies.',
                });
            }

            if (typeof service.memoryBytes === 'number' && service.memoryBytes >= highMemoryBytes) {
                const mb = Math.round(service.memoryBytes / (1024 * 1024));
                warnings.push({
                    severity: service.id === 'fahrstuhl' ? 'critical' : 'warn',
                    title: `${service.name} high memory usage`,
                    detail: `${mb} MB RSS reported by PM2.`,
                });
            }

            if (service.deployState === 'failed') {
                warnings.push({
                    severity: 'critical',
                    title: `${service.name} deploy failed`,
                    detail: `Last deploy state is failed${service.lastDeployAt ? ` (${service.lastDeployAt})` : ''}.`,
                    fix: 'Check deploy-audit.log and webhook process logs.',
                });
            }
        }

        let discordBackupState = {
            available: false,
            enabledSchedules: 0,
            hasRunningJobs: false,
            lastBackupAt: null,
            lastSuccessfulJobAt: null,
            latestSuccessAt: null,
            minNextRunAt: null,
            maxLastRunAt: null,
            stale: true,
        };
        try {
            const { getPool } = require('../utils/db');
            const pool = getPool();
            const [[latestBackup]] = await pool.execute('SELECT MAX(created_at) AS last_created_at FROM discord_backups');
            const [[latestSuccessfulJob]] = await pool.execute("SELECT MAX(finished_at) AS last_finished_at FROM discord_backup_jobs WHERE status = 'done'");
            const [[enabledSchedule]] = await pool.execute('SELECT COUNT(*) AS c, MIN(next_run_at) AS min_next_run_at, MAX(last_run_at) AS max_last_run_at FROM discord_backup_schedules WHERE enabled = 1');
            const [[runningJob]] = await pool.execute("SELECT COUNT(*) AS c FROM discord_backup_jobs WHERE status = 'running'");

            const lastCreatedAt = Number(latestBackup?.last_created_at || 0) || null;
            const lastSuccessfulJobAt = Number(latestSuccessfulJob?.last_finished_at || 0) || null;
            const enabledSchedules = Number(enabledSchedule?.c || 0);
            const minNextRunAt = Number(enabledSchedule?.min_next_run_at || 0) || null;
            const maxLastRunAt = Number(enabledSchedule?.max_last_run_at || 0) || null;
            const hasRunningJobs = Number(runningJob?.c || 0) > 0;
            const latestSuccessAt = Math.max(lastCreatedAt || 0, lastSuccessfulJobAt || 0, maxLastRunAt || 0) || null;

            const now = Date.now();
            const staleAfterMs = 36 * 60 * 60 * 1000; // 36h default for Discord backup freshness
            const scheduleGraceMs = 90 * 60 * 1000; // avoid false stale around interval drift/restarts
            const scheduleOverdue = enabledSchedules > 0 && minNextRunAt
                ? now > (minNextRunAt + scheduleGraceMs)
                : false;
            const isStale = enabledSchedules > 0
                ? (!latestSuccessAt && !hasRunningJobs && scheduleOverdue)
                : (!latestSuccessAt || (now - latestSuccessAt > staleAfterMs));

            discordBackupState = {
                available: true,
                enabledSchedules,
                hasRunningJobs,
                lastBackupAt: lastCreatedAt,
                lastSuccessfulJobAt,
                latestSuccessAt,
                minNextRunAt,
                maxLastRunAt,
                stale: isStale,
            };
        } catch (_) {}

        for (const proc of pm2) {
            if (proc.status !== 'online') {
                warnings.push({
                    severity: proc.name === 'fahrstuhl' || proc.name === 'dashboard-php' ? 'critical' : 'warn',
                    title: `${proc.name} is ${proc.status}`,
                    detail: `PM2 reports ${proc.status}; restart count ${proc.restarts}.`,
                });
            }
        }

        if (!this.client.user) {
            warnings.push({ severity: 'critical', title: 'Discord client is not ready', detail: 'Bot user is unavailable.' });
        }

        if ((this.client.ws?.ping ?? 0) > 500) {
            warnings.push({ severity: 'warn', title: 'High Discord latency', detail: `${this.client.ws.ping}ms gateway ping.` });
        }

        if (health?.overall?.status && health.overall.status !== 'ok') {
            warnings.push({
                severity: health.overall.status === 'critical' ? 'critical' : 'warn',
                title: `Health checks ${health.overall.status}`,
                detail: `${health.overall.error || 0} errors, ${health.overall.degraded || 0} degraded.`,
            });
        }

        if (backup.lastBackupError) {
            warnings.push({ severity: 'warn', title: 'Latest backup failed', detail: String(backup.lastBackupError).slice(0, 180) });
        } else if ((discordBackupState.available && discordBackupState.stale) || (!discordBackupState.available && backup.stale)) {
            warnings.push({ severity: 'warn', title: 'Backup is stale', detail: 'No recent successful backup was recorded.' });
        } else if (backup.enabled && backup.verification && backup.verification.ok === false) {
            warnings.push({ severity: 'warn', title: 'Backup verification missing', detail: backup.verification.error || 'Latest backup has not been verified.' });
        }

        if (backup.system && backup.system.available === false) {
            warnings.push({ severity: 'warn', title: 'System backup status unavailable', detail: 'No whole-server backup status file found.' });
        } else if (backup.system?.stale) {
            warnings.push({ severity: 'warn', title: 'System backup is stale', detail: 'Whole-server backup did not run in the expected window.' });
        } else if (backup.system && backup.system.ok === false) {
            warnings.push({ severity: 'warn', title: 'System backup reported issues', detail: `Snapshot ${backup.system.snapshot || 'unknown'} is not fully healthy.` });
        }

        for (const warning of (nginx.warnings || []).filter(entry => entry.severity !== 'info')) {
            warnings.push(warning);
        }

        return {
            overall: {
                status: warnings.some(w => w.severity === 'critical') ? 'critical' : warnings.length ? 'warn' : 'ok',
                warnings: warnings.length,
                critical: warnings.filter(w => w.severity === 'critical').length,
            },
            checks: health?.checks || {},
            health: health?.overall || null,
            ops: opsSnapshot,
            backup,
            discordBackupState,
            nginx,
            pm2,
            warnings,
        };
    }

    async buildCockpitSnapshot() {
        const db = await analyticsDatabase.getInstance();
        const analyticsSummary = db.getSummary();
        const health = await this.buildHealthSummary();
        const premium = await this.buildPremiumCalendar(14);
        const mem = process.memoryUsage();
        const guilds = this.client.guilds.cache;
        const trolls = this.getActiveTrollSummary();
        const pm2 = getPm2Processes();

        return {
            bot: {
                username: this.client.user?.username ?? 'offline',
                tag: this.client.user?.tag ?? null,
                id: this.client.user?.id ?? null,
                ready: !!this.client.user,
                uptime: this.client.uptime ?? 0,
                wsPing: this.client.ws?.ping ?? null,
                guilds: guilds.size,
                totalMembers: guilds.reduce((sum, guild) => sum + (guild.memberCount || 0), 0),
            },
            api: {
                pid: process.pid,
                uptime: Math.round(process.uptime() * 1000),
                node: process.version,
                memory: {
                    rss: mem.rss,
                    heapUsed: mem.heapUsed,
                    heapTotal: mem.heapTotal,
                },
                git: getGitInfo(path.join(__dirname, '..')),
            },
            trolls,
            analytics: {
                totalCommands: analyticsSummary.totalExecutions,
                activeUsers: analyticsSummary.uniqueUsers,
                topCommand: analyticsSummary.topCommand,
                topCommandCount: analyticsSummary.topCommandCount,
                uniqueCommands: analyticsSummary.uniqueCommands,
                topCommands: db.getTopCommands(8),
                recent: db.getRecentExecutions(8),
            },
            premium: premium.summary,
            premiumExpiring: premium.users.filter(user => user.expiringSoon).slice(0, 8),
            revenue: monetizationStore.revenueSummary(),
            votes: monetizationStore.voteSummary(),
            deploy: {
                fahrstuhl: readJsonFile(deployStatusFile, {}).fahrstuhl || null,
            },
            health,
            pm2,
            audit: dashboardAudit.list({ limit: 8 }),
        };
    }

    async buildUserSearchRow(userId, analyticsRow = null) {
        const premiumManager = require('../utils/premiumManager');
        const stats = getUserStats(userId);
        const discordUser = await this.client.users.fetch(userId).catch(() => null);
        const premium = await premiumManager.getUserInfo(userId).catch(() => null);
        const shieldActive = (stats.activeShieldExpiry || 0) > Date.now();

        return {
            userId,
            username: discordUser?.username ?? null,
            globalName: discordUser?.globalName ?? null,
            avatar: discordUser?.avatar
                ? `https://cdn.discordapp.com/avatars/${userId}/${discordUser.avatar}.png?size=64`
                : null,
            commandCount: analyticsRow?.command_count || 0,
            lastUsed: analyticsRow?.last_used || null,
            premium: {
                active: !!premium?.is_premium,
                tier: premium?.tier || null,
                expiresAt: premium?.expires_at || null,
            },
            shields: {
                owned: stats.shieldsOwned || 0,
                active: shieldActive,
                expiresAt: shieldActive ? new Date(stats.activeShieldExpiry).toISOString() : null,
            },
        };
    }

    async searchUsers(query) {
        const normalized = String(query || '').trim().toLowerCase();
        const db = await analyticsDatabase.getInstance();
        const { users: analyticsUsers } = db.getAllUsers(500, 0);
        const rowsById = new Map(analyticsUsers.map(row => [row.user_id, row]));
        const ids = new Set();

        for (const row of analyticsUsers) {
            if (String(row.user_id).includes(normalized)) ids.add(row.user_id);
        }

        for (const user of this.client.users.cache.values()) {
            const haystack = `${user.id} ${user.username || ''} ${user.globalName || ''}`.toLowerCase();
            if (haystack.includes(normalized)) ids.add(user.id);
        }

        if (/^\d{17,19}$/.test(normalized)) {
            ids.add(normalized);
        }

        const results = [];
        for (const userId of ids) {
            if (results.length >= 30) break;
            results.push(await this.buildUserSearchRow(userId, rowsById.get(userId) || null));
        }

        return results.sort((a, b) => (b.commandCount || 0) - (a.commandCount || 0));
    }

    async buildUserDetail(userId) {
        const db = await analyticsDatabase.getInstance();
        const premiumManager = require('../utils/premiumManager');
        const notificationManager = require('../utils/notificationManager');
        const safeUserId = escapeSqlLiteral(userId);
        const discordUser = await this.client.users.fetch(userId).catch(() => null);
        const stats = getUserStats(userId);
        const premium = await premiumManager.getUserInfo(userId).catch(() => null);
        const blacklist = blacklistManager.getAll ? blacklistManager.getAll().filter(entry => entry.userId === userId) : [];
        const shieldActive = (stats.activeShieldExpiry || 0) > Date.now();

        const topCommandsResult = db.db ? db.db.exec(`
            SELECT command, COUNT(*) AS count,
                   SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) AS errors
            FROM command_executions
            WHERE user_id='${safeUserId}'
            GROUP BY command
            ORDER BY count DESC
            LIMIT 10
        `) : [];
        const guildsResult = db.db ? db.db.exec(`
            SELECT guild_id, COUNT(*) AS count, MAX(timestamp) AS last_used
            FROM command_executions
            WHERE user_id='${safeUserId}'
            GROUP BY guild_id
            ORDER BY count DESC
            LIMIT 10
        `) : [];
        const recentResult = db.db ? db.db.exec(`
            SELECT command, guild_id, timestamp, success, error_message
            FROM command_executions
            WHERE user_id='${safeUserId}'
            ORDER BY timestamp DESC
            LIMIT 30
        `) : [];

        const activeTrolls = [];
        for (const guild of this.client.guilds.cache.values()) {
            const key = `${guild.id}-${userId}`;
            if (this.trollManager?.activeMoves?.has(key)) activeTrolls.push({ guildId: guild.id, guildName: guild.name, type: 'elevator' });
            if (this.trollManager?.activeGhosts?.has(key)) activeTrolls.push({ guildId: guild.id, guildName: guild.name, type: 'ghost' });
            if (this.trollManager?.activeSilentPost?.has(key)) activeTrolls.push({ guildId: guild.id, guildName: guild.name, type: 'silentPost' });
            if (this.trollManager?.activeMirror?.has(key)) activeTrolls.push({ guildId: guild.id, guildName: guild.name, type: 'mirror' });
            if (this.trollManager?.activeDeafTroll?.has(key)) activeTrolls.push({ guildId: guild.id, guildName: guild.name, type: 'deafen' });
        }

        const votes = monetizationStore.listVotes({ limit: 20000 }).filter(vote => vote.userId === userId).slice(0, 25);
        const promoRedemptions = monetizationStore.listPromoCodes()
            .flatMap(promo => (promo.redemptions || [])
                .filter(redemption => redemption.userId === userId)
                .map(redemption => ({ code: promo.code, type: promo.type, tier: promo.tier, shields: promo.shields, days: promo.days, redeemedAt: redemption.redeemedAt })))
            .slice(0, 25);

        return {
            userId,
            username: discordUser?.username ?? null,
            globalName: discordUser?.globalName ?? null,
            tag: discordUser?.tag ?? null,
            avatar: discordUser?.avatar
                ? `https://cdn.discordapp.com/avatars/${userId}/${discordUser.avatar}.png?size=128`
                : null,
            createdAt: discordUser?.createdAt?.toISOString?.() ?? null,
            premium: {
                active: !!premium?.is_premium,
                tier: premium?.tier || null,
                expiresAt: premium?.expires_at || null,
                createdAt: premium?.created_at || null,
            },
            shields: {
                owned: stats.shieldsOwned || 0,
                active: shieldActive,
                expiresAt: shieldActive ? new Date(stats.activeShieldExpiry).toISOString() : null,
                lastClaim: stats.lastDailyClaim ? new Date(stats.lastDailyClaim).toISOString() : null,
            },
            notificationsEnabled: notificationManager.hasNotificationsEnabled(userId),
            blacklist,
            activeTrolls,
            analytics: {
                topCommands: topCommandsResult[0]?.values.map(row => ({ command: row[0], count: row[1], errors: row[2] || 0 })) || [],
                guilds: guildsResult[0]?.values.map(row => ({
                    guildId: row[0],
                    guildName: this.client.guilds.cache.get(row[0])?.name ?? 'Unknown',
                    count: row[1],
                    lastUsed: row[2],
                })) || [],
                recent: recentResult[0]?.values.map(row => ({
                    command: row[0],
                    guildId: row[1],
                    guildName: this.client.guilds.cache.get(row[1])?.name ?? 'Unknown',
                    timestamp: row[2],
                    success: !!row[3],
                    error: row[4] || null,
                })) || [],
            },
            votes,
            promoRedemptions,
        };
    }

    buildGuildPermissionChecks(guild, config) {
        const botMember = guild.members.me;
        const botPerms = botMember?.permissions;
        const botRolePosition = botMember?.roles?.highest?.position ?? 0;
        const checks = [
            {
                key: 'viewChannel',
                label: 'View Channels',
                ok: botPerms?.has(PermissionsBitField.Flags.ViewChannel) ?? false,
                impact: 'Bot kann Channels sonst nicht sehen.',
                fix: 'Gib der Bot-Rolle "View Channels" oder Administrator.',
            },
            {
                key: 'sendMessages',
                label: 'Send Messages',
                ok: botPerms?.has(PermissionsBitField.Flags.SendMessages) ?? false,
                impact: 'Welcome- und Info-Nachrichten können fehlschlagen.',
                fix: 'Gib der Bot-Rolle "Send Messages" in den relevanten Textchannels.',
            },
            {
                key: 'moveMembers',
                label: 'Move Members',
                ok: botPerms?.has(PermissionsBitField.Flags.MoveMembers) ?? false,
                impact: 'Elevator/Auto-Move funktioniert nicht zuverlässig.',
                fix: 'Aktiviere "Move Members" für die Bot-Rolle.',
            },
            {
                key: 'muteMembers',
                label: 'Mute Members',
                ok: botPerms?.has(PermissionsBitField.Flags.MuteMembers) ?? false,
                impact: 'Mute-Effekte funktionieren nicht.',
                fix: 'Aktiviere "Mute Members" für die Bot-Rolle.',
            },
            {
                key: 'deafenMembers',
                label: 'Deafen Members',
                ok: botPerms?.has(PermissionsBitField.Flags.DeafenMembers) ?? false,
                impact: 'Deafen-Effekte funktionieren nicht.',
                fix: 'Aktiviere "Deafen Members" für die Bot-Rolle.',
            },
            {
                key: 'manageNicknames',
                label: 'Manage Nicknames',
                ok: botPerms?.has(PermissionsBitField.Flags.ManageNicknames) ?? false,
                impact: 'Mirror/Nickname-Effekte können fehlschlagen.',
                fix: 'Aktiviere "Manage Nicknames" für die Bot-Rolle.',
            },
            {
                key: 'manageRoles',
                label: 'Manage Roles',
                ok: botPerms?.has(PermissionsBitField.Flags.ManageRoles) ?? false,
                impact: 'Rollenbasierte Automationen und Fixes sind eingeschränkt.',
                fix: 'Aktiviere "Manage Roles" für die Bot-Rolle.',
            },
            {
                key: 'trollRoleConfigured',
                label: 'Troll Role configured',
                ok: !!config.trollRoleId,
                impact: 'Ohne Troll Role ist unklar, wer Troll-Commands nutzen darf.',
                fix: 'Nutze im Server /settrollrole @Rolle.',
            },
        ];

        const configuredRoles = [
            config.trollRoleId ? guild.roles.cache.get(config.trollRoleId) : null,
            config.roleId ? guild.roles.cache.get(config.roleId) : null,
            config.autoMoveRoleId ? guild.roles.cache.get(config.autoMoveRoleId) : null,
        ].filter(Boolean);

        for (const role of configuredRoles) {
            checks.push({
                key: `rolePosition:${role.id}`,
                label: `Bot role above ${role.name}`,
                ok: botRolePosition > role.position,
                impact: `Bot kann Mitglieder mit ${role.name} sonst eventuell nicht verwalten.`,
                fix: `Ziehe die Fahrstuhl-Bot-Rolle in Discord über "${role.name}".`,
            });
        }

        return checks;
    }

    registerTempVoiceRoutes() {
        this.app.get('/guilds/:guildId/tempvoice', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to this guild'));

                const { getGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guild.id);
                const tempVoice = config.tempVoice && typeof config.tempVoice === 'object' ? config.tempVoice : {};

                const voiceChannels = guild.channels.cache
                    .filter(channel => channel.type === 2)
                    .map(channel => ({
                        id: channel.id,
                        name: channel.name,
                        parentId: channel.parentId || null,
                        members: channel.members?.size ?? 0,
                        position: channel.rawPosition ?? 0,
                    }))
                    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
                const categories = guild.channels.cache
                    .filter(channel => channel.type === 4)
                    .map(channel => ({
                        id: channel.id,
                        name: channel.name,
                        position: channel.rawPosition ?? 0,
                    }))
                    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));

                res.json(APIResponse.success({
                    guildId: guild.id,
                    guildName: guild.name,
                    voiceChannels,
                    categories,
                    permissions: {
                        manageChannels: guild.members.me?.permissions?.has(PermissionsBitField.Flags.ManageChannels) ?? false,
                        moveMembers: guild.members.me?.permissions?.has(PermissionsBitField.Flags.MoveMembers) ?? false,
                    },
                    settings: {
                        enabled: dashboardBoolean(tempVoice.enabled ?? config.modules?.tempVoice),
                        hubChannelId: tempVoice.hubChannelId || null,
                        categoryId: tempVoice.categoryId || null,
                        channelNameTemplate: tempVoice.channelNameTemplate || "{username}'s Channel",
                        userLimit: Math.max(0, Math.min(99, Number(tempVoice.userLimit) || 0)),
                        bitrate: Math.max(0, Math.min(384, Number(tempVoice.bitrate) || 0)),
                        allowRename: booleanWithDefault(tempVoice.allowRename, true),
                        allowLock: booleanWithDefault(tempVoice.allowLock, true),
                        allowLimit: booleanWithDefault(tempVoice.allowLimit, true),
                        deleteWhenEmpty: booleanWithDefault(tempVoice.deleteWhenEmpty, true),
                    },
                }, 'Temp voice settings fetched', 'TEMPVOICE_SETTINGS_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'TEMPVOICE_SETTINGS_FAILED'));
            }
        });

        this.app.post('/guilds/:guildId/tempvoice', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to this guild'));

                const hubChannelId = String(req.body?.hubChannelId || '').trim();
                const categoryId = String(req.body?.categoryId || '').trim();
                const hubChannel = hubChannelId ? await fetchGuildChannel(guild, hubChannelId) : null;
                const category = categoryId ? await fetchGuildChannel(guild, categoryId) : null;
                if (hubChannelId && (!hubChannel || hubChannel.type !== 2)) {
                    return res.status(400).json(APIResponse.badRequest('Hub channel must be a voice channel'));
                }
                if (categoryId && (!category || category.type !== 4)) {
                    return res.status(400).json(APIResponse.badRequest('Category not found'));
                }

                const { getGuildConfig, setGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guild.id);
                const enabled = dashboardBoolean(req.body?.enabled);
                if (enabled && !hubChannelId) {
                    return res.status(400).json(APIResponse.badRequest('Join-Hub voice channel is required when Temp Voice is enabled'));
                }
                const modules = { ...(config.modules || {}), tempVoice: enabled };
                const tempVoice = {
                    ...(config.tempVoice || {}),
                    enabled,
                    hubChannelId: hubChannelId || null,
                    categoryId: categoryId || null,
                    channelNameTemplate: String(req.body?.channelNameTemplate || "{username}'s Channel").slice(0, 80),
                    userLimit: Math.max(0, Math.min(99, Number(req.body?.userLimit) || 0)),
                    bitrate: Math.max(0, Math.min(384, Number(req.body?.bitrate) || 0)),
                    allowRename: dashboardBoolean(req.body?.allowRename ?? true),
                    allowLock: dashboardBoolean(req.body?.allowLock ?? true),
                    allowLimit: dashboardBoolean(req.body?.allowLimit ?? true),
                    deleteWhenEmpty: dashboardBoolean(req.body?.deleteWhenEmpty ?? true),
                };
                setGuildConfig(guild.id, { modules, tempVoice });
                res.json(APIResponse.success({ guildId: guild.id, tempVoice }, 'Temp voice settings updated', 'TEMPVOICE_SETTINGS_UPDATED'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'TEMPVOICE_SETTINGS_UPDATE_FAILED'));
            }
        });
    }

    registerSocialRoutes() {
        const normalizeSocialFeed = (feed = {}, index = 0) => {
            const type = ['youtube', 'twitch', 'rss'].includes(feed.type) ? feed.type : 'rss';
            return {
                id: String(feed.id || `feed-${Date.now().toString(36)}-${index}`).trim().slice(0, 60),
                enabled: dashboardBoolean(feed.enabled ?? true),
                type,
                label: String(feed.label || (type === 'twitch' ? 'Twitch' : type === 'youtube' ? 'YouTube' : 'RSS Feed')).trim().slice(0, 80),
                source: String(feed.source || '').trim().slice(0, 500),
                messageTemplate: String(feed.messageTemplate || '{mention}{source}: {title}\n{url}').trim().slice(0, 500),
                lastItemId: feed.lastItemId || null,
                lastLiveId: feed.lastLiveId || null,
                lastCheckedAt: feed.lastCheckedAt || null,
                lastPostedAt: feed.lastPostedAt || null,
            };
        };

        const normalizeSocialSettings = (body = {}, current = {}) => {
            const rawFeeds = Array.isArray(body.feeds) ? body.feeds : [];
            const byId = new Map((Array.isArray(current.feeds) ? current.feeds : []).map(feed => [String(feed.id || ''), feed]));
            const feeds = rawFeeds
                .map((feed, index) => {
                    const id = String(feed.id || '').trim();
                    return normalizeSocialFeed({ ...(id ? byId.get(id) : {}), ...feed }, index);
                })
                .filter(feed => feed.source)
                .slice(0, 10);

            return {
                ...(current && typeof current === 'object' ? current : {}),
                enabled: dashboardBoolean(body.enabled),
                announcementChannelId: String(body.announcementChannelId || '').trim() || null,
                mentionText: String(body.mentionText || '').trim().slice(0, 80),
                pollMinutes: Math.max(2, Math.min(60, Number(body.pollMinutes) || 5)),
                feeds,
            };
        };

        // ── Free Games API endpoints ────────────────────────────────────────
        this.app.get('/guilds/:guildId/freegames', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to this guild'));

                const { getGuildConfig } = require('../utils/config');
                const { normalizeFreeGamesConfig } = require('../utils/freeGamesNotifier');
                const config = getGuildConfig(guild.id);
                const settings = normalizeFreeGamesConfig(config);

                const channels = guild.channels.cache
                    .filter(c => c.type === 0 && !c.isThread?.())
                    .map(c => ({ id: c.id, name: c.name, position: c.rawPosition ?? 0, parentId: c.parentId || null }))
                    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
                const roles = guild.roles.cache
                    .filter(r => !r.managed && r.id !== guild.id)
                    .map(r => ({ id: r.id, name: r.name, color: r.hexColor }))
                    .sort((a, b) => b.position - a.position);

                res.json(APIResponse.success({
                    guildId: guild.id,
                    guildName: guild.name,
                    channels,
                    roles,
                    settings: {
                        enabled: settings.enabled,
                        channelId: settings.channelId,
                        mentionRoleId: settings.mentionRoleId,
                        filter: settings.filter,
                    },
                }, 'Free games settings fetched', 'FREEGAMES_SETTINGS_OK'));
            } catch (err) {
                res.status(500).json(APIResponse.error(err.message, 'FREEGAMES_SETTINGS_FAILED'));
            }
        });

        this.app.post('/guilds/:guildId/freegames', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to this guild'));

                const { getGuildConfig, setGuildConfig } = require('../utils/config');
                const { normalizeFreeGamesConfig } = require('../utils/freeGamesNotifier');
                const config = getGuildConfig(guild.id);
                const existing = normalizeFreeGamesConfig(config);

                const enabled = dashboardBoolean(req.body?.enabled ?? existing.enabled);
                const channelId = String(req.body?.channelId || existing.channelId || '').trim();
                const mentionRoleId = String(req.body?.mentionRoleId || '').trim() || null;
                const filter = req.body?.filter === 'serious' ? 'serious' : 'all';

                if (enabled && !channelId) {
                    return res.status(400).json(APIResponse.badRequest('Channel is required when Free Games notifications are enabled'));
                }
                if (channelId) {
                    const ch = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
                    if (!ch || ch.type !== 0 || ch.isThread?.()) {
                        return res.status(400).json(APIResponse.badRequest('Channel must be a text channel'));
                    }
                }

                const newSettings = { ...existing, enabled, channelId, mentionRoleId, filter, firstRunDone: false };
                setGuildConfig(guild.id, { freeGames: newSettings });

                // Post/update status embed in the target channel
                if (enabled && channelId) {
                    const ch = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
                    if (ch?.isTextBased()) {
                        const freeGamesNotifier = require('../utils/freeGamesNotifier');
                        await freeGamesNotifier.postStatusEmbed(ch, guild.id).catch(() => {});
                    }
                }

                res.json(APIResponse.success({ guildId: guild.id, settings: newSettings }, 'Free games settings updated', 'FREEGAMES_SETTINGS_UPDATED'));
            } catch (err) {
                res.status(500).json(APIResponse.error(err.message, 'FREEGAMES_SETTINGS_UPDATE_FAILED'));
            }
        });

        this.app.get('/guilds/:guildId/social', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to this guild'));

                const { getGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guild.id);
                const social = config.social && typeof config.social === 'object' ? config.social : {};
                const channels = guild.channels.cache
                    .filter(channel => channel.type === 0 && !channel.isThread?.())
                    .map(channel => ({
                        id: channel.id,
                        name: channel.name,
                        position: channel.rawPosition ?? 0,
                        parentId: channel.parentId || null,
                    }))
                    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));

                res.json(APIResponse.success({
                    guildId: guild.id,
                    guildName: guild.name,
                    channels,
                    twitchConfigured: !!(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET),
                    permissions: {
                        sendMessages: guild.members.me?.permissions?.has(PermissionsBitField.Flags.SendMessages) ?? false,
                        embedLinks: guild.members.me?.permissions?.has(PermissionsBitField.Flags.EmbedLinks) ?? false,
                    },
                    settings: {
                        enabled: dashboardBoolean(social.enabled ?? config.modules?.social),
                        announcementChannelId: social.announcementChannelId || null,
                        mentionText: social.mentionText || '',
                        pollMinutes: Math.max(2, Math.min(60, Number(social.pollMinutes) || 5)),
                        feeds: (Array.isArray(social.feeds) ? social.feeds : []).map(normalizeSocialFeed).slice(0, 10),
                    },
                }, 'Social settings fetched', 'SOCIAL_SETTINGS_OK'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'SOCIAL_SETTINGS_FAILED'));
            }
        });

        this.app.post('/guilds/:guildId/social', async (req, res) => {
            try {
                const guild = this.client.guilds.cache.get(req.params.guildId);
                if (!guild) return res.status(404).json(APIResponse.notFound('Guild not found'));
                const access = await this.getDashboardGuildAccess(req, guild.id);
                if (!access.allowed) return res.status(403).json(APIResponse.forbidden('No access to this guild'));

                const channelId = String(req.body?.announcementChannelId || '').trim();
                const enabled = dashboardBoolean(req.body?.enabled);
                if (enabled && !channelId) {
                    return res.status(400).json(APIResponse.badRequest('Announcement channel is required when Social Alerts are enabled'));
                }
                if (channelId) {
                    const channel = await fetchGuildChannel(guild, channelId);
                    if (!channel || channel.type !== 0 || channel.isThread?.()) {
                        return res.status(400).json(APIResponse.badRequest('Announcement channel must be a text channel'));
                    }
                    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
                    const perms = me ? channel.permissionsFor(me) : null;
                    if (!perms?.has(PermissionsBitField.Flags.SendMessages)) {
                        return res.status(400).json(APIResponse.badRequest('Fahrstuhl cannot send messages in this announcement channel'));
                    }
                    if (!perms?.has(PermissionsBitField.Flags.EmbedLinks)) {
                        return res.status(400).json(APIResponse.badRequest('Fahrstuhl needs Embed Links in this announcement channel'));
                    }
                }

                const { getGuildConfig, setGuildConfig } = require('../utils/config');
                const config = getGuildConfig(guild.id);
                const social = normalizeSocialSettings(req.body || {}, config.social || {});

                    const limits = await this.getGuildPremiumLimits(guild.id);
                    const activeFeedCount = (social.feeds || []).filter(f => f.source && String(f.source).trim()).length;
                if (limits.socialFeeds === 0) {
                    return res.status(403).json({ success: false, error: 'Feature limit reached', code: 'LIMIT_REACHED', limitKey: 'socialFeeds', limit: 0, current: activeFeedCount, upgrade: true });
                }
                    if (limits.socialFeeds >= 0 && activeFeedCount > limits.socialFeeds) {
                        return res.status(403).json({ success: false, error: 'Feature limit reached', code: 'LIMIT_REACHED', limitKey: 'socialFeeds', limit: limits.socialFeeds, current: activeFeedCount, upgrade: true });
                    }

                const modules = { ...(config.modules || {}), social: social.enabled };
                setGuildConfig(guild.id, { modules, social });
                res.json(APIResponse.success({ guildId: guild.id, social }, 'Social settings updated', 'SOCIAL_SETTINGS_UPDATED'));
            } catch (error) {
                res.status(500).json(APIResponse.error(error.message, 'SOCIAL_SETTINGS_UPDATE_FAILED'));
            }
        });
    }

    async buildGuildDetails(guild) {
        const { getGuildConfig } = require('../utils/config');
        const owner = await this.client.users.fetch(guild.ownerId).catch(() => null);
        const config = getGuildConfig(guild.id);
        const botMember = guild.members.me;
        const botPerms = botMember?.permissions;
        const trollRole = config.trollRoleId ? guild.roles.cache.get(config.trollRoleId) : null;
        const adminRole = config.adminRoleId ? guild.roles.cache.get(config.adminRoleId) : null;
        const activeTrolls = this.getGuildTrollDetails(guild.id);
        const analytics = await this.getGuildAnalytics(guild.id);
        const blacklist = blacklistManager.getAll ? blacklistManager.getAll() : [];

        const channels = {
            text: guild.channels.cache.filter(c => c.type === 0).size,
            voice: guild.channels.cache.filter(c => c.type === 2).size,
            categories: guild.channels.cache.filter(c => c.type === 4).size,
            stage: guild.channels.cache.filter(c => c.type === 13).size,
            forum: guild.channels.cache.filter(c => c.type === 15).size,
            total: guild.channels.cache.size,
        };

        const roles = guild.roles.cache
            .filter(role => role.name !== '@everyone')
            .map(role => ({
                id: role.id,
                name: role.name,
                color: role.hexColor,
                position: role.position,
                managed: role.managed,
            }))
            .sort((a, b) => b.position - a.position);

        return {
            id: guild.id,
            name: guild.name,
            icon: guild.icon,
            iconUrl: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128` : null,
            memberCount: guild.memberCount,
            ownerId: guild.ownerId,
            ownerName: owner?.username ?? 'Unknown',
            createdAt: guild.createdAt?.toISOString() ?? null,
            joinedAt: guild.joinedAt?.toISOString() ?? null,
            verificationLevel: guild.verificationLevel,
            premiumTier: guild.premiumTier,
            premiumSubscriptionCount: guild.premiumSubscriptionCount ?? 0,
            features: guild.features ?? [],
            channels,
            roles,
            roleCount: roles.length,
            config: {
                trollRoleId: config.trollRoleId ?? null,
                trollRoleName: trollRole?.name ?? null,
                adminRoleId: config.adminRoleId ?? null,
                adminRoleName: adminRole?.name ?? null,
                autoMoveRoleId: config.autoMoveRoleId ?? config.roleId ?? null,
                modules: buildModuleConfig(config),
                dashboardAccess: normalizeDashboardAccessConfig(config),
            },
            permissions: {
                administrator: botPerms?.has(PermissionsBitField.Flags.Administrator) ?? false,
                manageRoles: botPerms?.has(PermissionsBitField.Flags.ManageRoles) ?? false,
                manageNicknames: botPerms?.has(PermissionsBitField.Flags.ManageNicknames) ?? false,
                moveMembers: botPerms?.has(PermissionsBitField.Flags.MoveMembers) ?? false,
                muteMembers: botPerms?.has(PermissionsBitField.Flags.MuteMembers) ?? false,
                deafenMembers: botPerms?.has(PermissionsBitField.Flags.DeafenMembers) ?? false,
                sendMessages: botPerms?.has(PermissionsBitField.Flags.SendMessages) ?? false,
                viewChannel: botPerms?.has(PermissionsBitField.Flags.ViewChannel) ?? false,
                botRolePosition: botMember?.roles?.highest?.position ?? 0,
            },
            permissionChecks: this.buildGuildPermissionChecks(guild, config),
            activeTrolls,
            blacklistedInGuild: blacklist.filter(entry => entry.guildId === guild.id).length,
            analytics,
        };
    }

    async buildPremiumCalendar(days = 30) {
        const premiumManager = require('../utils/premiumManager');
        const rows = await premiumManager.getAllPremium();
        const now = Date.now();
        const horizon = now + (days * 24 * 60 * 60 * 1000);
        const users = [];

        for (const row of rows) {
            const expiresMs = row.expires_at ? new Date(row.expires_at).getTime() : 0;
            const expired = expiresMs > 0 && expiresMs < now;
            const daysRemaining = expiresMs ? Math.ceil((expiresMs - now) / (24 * 60 * 60 * 1000)) : null;
            const discordUser = this.client.users.cache.get(row.user_id)
                || await this.client.users.fetch(row.user_id).catch(() => null);

            users.push({
                userId: row.user_id,
                username: discordUser?.username ?? 'Unknown',
                displayName: discordUser?.globalName ?? discordUser?.username ?? 'Unknown',
                tier: row.tier || 'basic',
                expiresAt: row.expires_at,
                createdAt: row.created_at,
                daysRemaining,
                expired,
                expiringSoon: !expired && expiresMs > 0 && expiresMs <= horizon,
            });
        }

        users.sort((a, b) => new Date(a.expiresAt || 0) - new Date(b.expiresAt || 0));

        return {
            days,
            users,
            summary: {
                total: users.length,
                active: users.filter(user => !user.expired).length,
                expired: users.filter(user => user.expired).length,
                expiringSoon: users.filter(user => user.expiringSoon).length,
            },
            reminders: monetizationStore.listReminders({ limit: 100 }),
        };
    }

    pushGuildEvent(data) {
        const payload = `data: ${JSON.stringify(data)}\n\n`;
        for (const client of guildEventSseClients) {
            try { client.write(payload); } catch (e) { guildEventSseClients.delete(client); }
        }
    }

    emitActivityEvent(guildId, data = {}) {
        const safeGuildId = String(guildId || '').trim();
        if (!safeGuildId) return;
        const clients = activitySseClientsByGuild.get(safeGuildId);
        if (!clients || clients.size === 0) return;

        const item = {
            ...data,
            guildId: safeGuildId,
            createdAt: data.createdAt || new Date().toISOString(),
        };
        const payload = `event: activity\ndata: ${JSON.stringify({ type: 'activity', item })}\n\n`;

        for (const client of clients) {
            try {
                client.res.write(payload);
            } catch {
                clients.delete(client);
            }
        }

        if (clients.size === 0) activitySseClientsByGuild.delete(safeGuildId);
    }

    start(port = 3002) {
        this.server = this.app.listen(port, '0.0.0.0', () => {
            console.log(`\n✓ Bot API Server läuft auf Port ${port}`);
            console.log(`  Dashboard kommuniziert über: http://localhost:${port}\n`);
        });
        return this.server;
    }

    stop() {
        if (this.server) {
            this.server.close();
            console.log('✓ Bot API Server gestoppt');
        }
    }
}

module.exports = BotAPIServer;
