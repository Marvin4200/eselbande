const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../data');
const storePath = path.join(dataDir, 'monetization.json');

function emptyStore() {
    return {
        revenue: [],
        promoCodes: [],
        votes: [],
        reminders: [],
    };
}

function ensureStore() {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(storePath)) save(emptyStore());
}

function load() {
    ensureStore();
    try {
        return { ...emptyStore(), ...JSON.parse(fs.readFileSync(storePath, 'utf8')) };
    } catch {
        return emptyStore();
    }
}

function save(store) {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify({ ...emptyStore(), ...store }, null, 2), 'utf8');
}

function normalizeCode(code) {
    return String(code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

function createId(prefix) {
    return `${prefix}_${crypto.randomUUID()}`;
}

function createRandomCode() {
    return crypto.randomBytes(5).toString('hex').toUpperCase();
}

function addRevenue(entry) {
    const store = load();
    const row = {
        id: createId('rev'),
        userId: String(entry.userId || '').trim(),
        username: String(entry.username || '').trim(),
        amount: Number(entry.amount || 0),
        currency: String(entry.currency || 'EUR').toUpperCase(),
        source: String(entry.source || 'manual'),
        tier: String(entry.tier || ''),
        note: String(entry.note || ''),
        createdAt: new Date().toISOString(),
        createdBy: entry.createdBy || null,
    };
    store.revenue.push(row);
    save(store);
    return row;
}

function listRevenue({ limit = 500 } = {}) {
    const store = load();
    return store.revenue
        .slice()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, Math.min(Number(limit) || 500, 2000));
}

function removeRevenue(id) {
    const store = load();
    const before = store.revenue.length;
    store.revenue = store.revenue.filter(row => row.id !== id);
    save(store);
    return before !== store.revenue.length;
}

function revenueSummary() {
    const rows = listRevenue({ limit: 10000 });
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const monthly = rows
        .filter(row => String(row.createdAt || '').startsWith(month))
        .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const bySource = {};
    for (const row of rows) {
        const source = row.source || 'manual';
        bySource[source] = (bySource[source] || 0) + Number(row.amount || 0);
    }
    return { total, monthly, count: rows.length, bySource };
}

function createPromoCode(input) {
    const store = load();
    const code = normalizeCode(input.code) || createRandomCode();
    if (!code) throw new Error('Invalid promo code');
    if (store.promoCodes.some(row => row.code === code)) throw new Error('Promo code already exists');

    const type = input.type === 'shields' ? 'shields' : 'premium';
    const row = {
        id: createId('promo'),
        code,
        type,
        tier: type === 'premium' && input.tier === 'pro' ? 'pro' : 'basic',
        days: type === 'premium' ? Math.max(1, Number(input.days || 30)) : 0,
        shields: type === 'shields' ? Math.max(1, Number(input.shields || 1)) : 0,
        maxUses: Math.max(1, Number(input.maxUses || 1)),
        active: input.active !== false,
        expiresAt: input.expiresAt || null,
        note: String(input.note || ''),
        createdAt: new Date().toISOString(),
        createdBy: input.createdBy || null,
        redemptions: [],
    };
    store.promoCodes.push(row);
    save(store);
    return row;
}

function listPromoCodes() {
    const store = load();
    return store.promoCodes
        .slice()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function setPromoActive(code, active) {
    const store = load();
    const normalized = normalizeCode(code);
    const promo = store.promoCodes.find(row => row.code === normalized);
    if (!promo) throw new Error('Promo code not found');
    promo.active = !!active;
    promo.updatedAt = new Date().toISOString();
    save(store);
    return promo;
}

function validatePromo(code) {
    const normalized = normalizeCode(code);
    const promo = listPromoCodes().find(row => row.code === normalized);
    if (!promo) throw new Error('Promo code not found');
    if (!promo.active) throw new Error('Promo code is inactive');
    if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) throw new Error('Promo code is expired');
    if ((promo.redemptions || []).length >= promo.maxUses) throw new Error('Promo code usage limit reached');
    return promo;
}

function assertPromoRedeemable(promo, userId) {
    if (!promo.active) throw new Error('Promo code is inactive');
    if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) throw new Error('Promo code is expired');
    if ((promo.redemptions || []).length >= promo.maxUses) throw new Error('Promo code usage limit reached');
    if ((promo.redemptions || []).some(row => row.userId === String(userId))) {
        throw new Error('User already redeemed this code');
    }
}

function reservePromoRedemption(code, input) {
    const store = load();
    const normalized = normalizeCode(code);
    const promo = store.promoCodes.find(row => row.code === normalized);
    if (!promo) throw new Error('Promo code not found');

    promo.redemptions = promo.redemptions || [];
    const userId = String(input.userId || '').trim();
    assertPromoRedeemable(promo, userId);

    const redemption = {
        id: createId('red'),
        userId,
        redeemedAt: new Date().toISOString(),
        redeemedBy: input.redeemedBy || null,
        pending: true,
    };
    promo.redemptions.push(redemption);
    promo.updatedAt = new Date().toISOString();
    save(store);

    return { promo, redemption };
}

function completePromoRedemption(code, redemptionId) {
    const store = load();
    const normalized = normalizeCode(code);
    const promo = store.promoCodes.find(row => row.code === normalized);
    if (!promo) throw new Error('Promo code not found');

    const redemption = (promo.redemptions || []).find(row => row.id === redemptionId);
    if (!redemption) throw new Error('Promo redemption not found');

    redemption.pending = false;
    redemption.completedAt = new Date().toISOString();
    promo.updatedAt = new Date().toISOString();
    save(store);
    return promo;
}

function cancelPromoRedemption(code, redemptionId) {
    const store = load();
    const normalized = normalizeCode(code);
    const promo = store.promoCodes.find(row => row.code === normalized);
    if (!promo) return false;

    const before = (promo.redemptions || []).length;
    promo.redemptions = (promo.redemptions || []).filter(row => row.id !== redemptionId);
    promo.updatedAt = new Date().toISOString();
    save(store);
    return before !== promo.redemptions.length;
}

function recordPromoRedemption(code, input) {
    const store = load();
    const normalized = normalizeCode(code);
    const promo = store.promoCodes.find(row => row.code === normalized);
    if (!promo) throw new Error('Promo code not found');
    promo.redemptions = promo.redemptions || [];
    promo.redemptions.push({
        userId: String(input.userId || '').trim(),
        redeemedAt: new Date().toISOString(),
        redeemedBy: input.redeemedBy || null,
    });
    promo.updatedAt = new Date().toISOString();
    save(store);
    return promo;
}

function recordVote(input) {
    const store = load();
    const row = {
        id: createId('vote'),
        userId: String(input.userId || '').trim(),
        type: String(input.type || 'upvote'),
        rewardedShields: Number(input.rewardedShields || 0),
        source: input.source || 'top.gg',
        createdAt: new Date().toISOString(),
    };
    store.votes.push(row);
    if (store.votes.length > 20000) store.votes = store.votes.slice(-20000);
    save(store);
    return row;
}

function listVotes({ limit = 500 } = {}) {
    const store = load();
    return store.votes
        .slice()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, Math.min(Number(limit) || 500, 2000));
}

function voteSummary() {
    const rows = listVotes({ limit: 20000 });
    const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;
    const byUser = {};
    for (const row of rows) {
        if (!byUser[row.userId]) byUser[row.userId] = { userId: row.userId, votes: 0, shields: 0, lastVoteAt: row.createdAt };
        byUser[row.userId].votes++;
        byUser[row.userId].shields += Number(row.rewardedShields || 0);
        if (new Date(row.createdAt) > new Date(byUser[row.userId].lastVoteAt)) byUser[row.userId].lastVoteAt = row.createdAt;
    }
    return {
        totalVotes: rows.length,
        votes24h: rows.filter(row => new Date(row.createdAt).getTime() >= cutoff24h).length,
        rewardsGiven: rows.reduce((sum, row) => sum + Number(row.rewardedShields || 0), 0),
        topUsers: Object.values(byUser).sort((a, b) => b.votes - a.votes).slice(0, 20),
    };
}

function recordReminder(input) {
    const store = load();
    const row = {
        id: createId('rem'),
        userId: String(input.userId || '').trim(),
        tier: input.tier || null,
        expiresAt: input.expiresAt || null,
        daysBefore: Number(input.daysBefore || 0),
        sentAt: new Date().toISOString(),
        success: input.success !== false,
        error: input.error || null,
        sentBy: input.sentBy || null,
    };
    store.reminders.push(row);
    if (store.reminders.length > 5000) store.reminders = store.reminders.slice(-5000);
    save(store);
    return row;
}

function listReminders({ limit = 500 } = {}) {
    const store = load();
    return store.reminders
        .slice()
        .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))
        .slice(0, Math.min(Number(limit) || 500, 1000));
}

module.exports = {
    addRevenue,
    listRevenue,
    removeRevenue,
    revenueSummary,
    createPromoCode,
    listPromoCodes,
    setPromoActive,
    validatePromo,
    reservePromoRedemption,
    completePromoRedemption,
    cancelPromoRedemption,
    recordPromoRedemption,
    recordVote,
    listVotes,
    voteSummary,
    recordReminder,
    listReminders,
};
