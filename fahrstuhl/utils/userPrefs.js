/**
 * userPrefs.js — lightweight per-user preference store
 * Persists to userPrefs.json alongside userStats.json
 * Fields: customTrollMessage, lastPremiumMonthlyBonus
 */

const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "userPrefs.json");

let cache = {};

function load() {
    if (fs.existsSync(FILE)) {
        try { cache = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { cache = {}; }
    }
}

function save() {
    try { fs.writeFileSync(FILE, JSON.stringify(cache, null, 2), "utf8"); } catch (e) {
        console.error("userPrefs save error:", e);
    }
}

load();

function getPrefs(userId) {
    if (!cache[userId]) cache[userId] = {};
    return cache[userId];
}

function setPrefs(userId, prefs) {
    cache[userId] = { ...getPrefs(userId), ...prefs };
    save();
}

function getCustomTrollMessage(userId) {
    return getPrefs(userId).customTrollMessage || null;
}

function setCustomTrollMessage(userId, message) {
    setPrefs(userId, { customTrollMessage: message || null });
}

function getLastPremiumMonthlyBonus(userId) {
    return Number(getPrefs(userId).lastPremiumMonthlyBonus || 0);
}

function setLastPremiumMonthlyBonus(userId, ts) {
    setPrefs(userId, { lastPremiumMonthlyBonus: ts });
}

module.exports = { getCustomTrollMessage, setCustomTrollMessage, getLastPremiumMonthlyBonus, setLastPremiumMonthlyBonus };
