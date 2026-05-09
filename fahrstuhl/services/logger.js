const { EmbedBuilder } = require("discord.js");

function trimText(value, limit, fallback = null) {
    const text = String(value ?? "").trim();
    if (!text) return fallback;
    return text.length > limit ? `${text.slice(0, Math.max(0, limit - 3))}...` : text;
}

function normalizeField(field) {
    const name = trimText(field?.name, 256);
    const value = trimText(field?.value, 1024);
    if (!name || !value) return null;
    return { name, value, inline: Boolean(field?.inline) };
}

function createLogger({ client, DEV_GUILD_ID, DEV_CATEGORY_ID, LOG_CHANNELS }) {
    const activeLogChannels = new Map();
    let resolvedLogCategoryId = DEV_CATEGORY_ID;

    async function ensureLogCategory(devGuild) {
        await devGuild.channels.fetch();
        const existingById = resolvedLogCategoryId
            ? devGuild.channels.cache.get(resolvedLogCategoryId)
            : null;
        if (existingById && existingById.type === 4) {
            return existingById.id;
        }

        const categoryName = process.env.DEV_LOG_CATEGORY_NAME || 'fahrstuhl-logs';
        const existingByName = devGuild.channels.cache.find(c => c.type === 4 && c.name === categoryName);
        if (existingByName) {
            resolvedLogCategoryId = existingByName.id;
            return existingByName.id;
        }

        const created = await devGuild.channels.create({
            name: categoryName,
            type: 4,
            reason: 'Create missing log channel category safely',
        });
        resolvedLogCategoryId = created.id;
        return created.id;
    }

    async function logToMaster(data, type = "SYSTEM") {
        try {
            const channelId = activeLogChannels.get(type);
            if (!channelId) return;

            const logChannel = await client.channels.fetch(channelId).catch(() => null);
            if (!logChannel || !logChannel.isTextBased()) return;

            if (data && typeof data === "object" && Array.isArray(data.embeds)) {
                await logChannel.send(data);
                return;
            }

            const embed = new EmbedBuilder().setTimestamp();

            if (typeof data === "string") {
                embed.setDescription(trimText(data, 4096, "Log")).setColor(0x5865F2);
            } else {
                const { title, description, color, fields, footer, thumbnail, author } = data || {};
                if (title) embed.setTitle(trimText(title, 256));
                if (description) embed.setDescription(trimText(description, 4096));
                if (color) embed.setColor(color);
                else embed.setColor(0x2B2D31);

                if (Array.isArray(fields)) {
                    const safeFields = fields.map(normalizeField).filter(Boolean).slice(0, 25);
                    if (safeFields.length) embed.addFields(safeFields);
                }
                if (footer) {
                    const footerObject = typeof footer === "object" ? footer : {};
                    embed.setFooter({ ...footerObject, text: trimText(footerObject.text ?? footer, 2048, "Log") });
                }
                if (thumbnail) embed.setThumbnail(thumbnail);
                if (author && typeof author === "object") embed.setAuthor({ ...author, name: trimText(author.name, 256, "Fahrstuhl") });
            }

            await logChannel.send({ embeds: [embed] });
        } catch (err) {
            console.error("Error logging to master channel:", err);
        }
    }

    async function setupLogChannels() {
        const devGuild = await client.guilds.fetch(DEV_GUILD_ID).catch(() => null);
        if (!devGuild) return null;

        let categoryId = null;
        try {
            categoryId = await ensureLogCategory(devGuild);
        } catch (error) {
            console.warn('Failed to ensure log category, creating channels without parent:', error.message);
        }

        for (const [key, channelName] of Object.entries(LOG_CHANNELS)) {
            let channel = devGuild.channels.cache.find(c => c.name === channelName && c.parentId === categoryId);

            if (!channel) {
                channel = await devGuild.channels.create({
                    name: channelName,
                    type: 0,
                    ...(categoryId ? { parent: categoryId } : {}),
                    reason: "Automatisches Log-System"
                });
            }
            activeLogChannels.set(key, channel.id);
        }

        return { devGuild, logCategoryId: categoryId };
    }

    function getLogCategoryId() {
        return resolvedLogCategoryId;
    }

    return { logToMaster, setupLogChannels, activeLogChannels, getLogCategoryId };
}

module.exports = {
    createLogger
};
