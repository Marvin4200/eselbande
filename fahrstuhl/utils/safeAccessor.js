/**
 * Null/Undefined Safety Checks
 * Provides safe accessors for Discord objects
 */

class SafeAccessor {
    /**
     * Safe member access with fallbacks
     * @param {GuildMember|null} member - Guild member object
     * @returns {object} Safe member object
     */
    static safeMember(member) {
        if (!member) {
            return {
                id: null,
                user: { id: null, username: 'Unknown', tag: 'Unknown#0000' },
                guild: null,
                displayName: 'Unknown',
                voice: { channel: null, mute: false, deaf: false }
            };
        }

        return {
            id: member.id,
            user: member.user || { id: member.id, username: 'Unknown', tag: 'Unknown#0000' },
            guild: member.guild,
            displayName: member.displayName || member.user?.username || 'Unknown',
            voice: member.voice || { channel: null, mute: false, deaf: false },
            roles: member.roles || { cache: new Map() },
            manageable: member.manageable ?? false,
            permissions: member.permissions || null
        };
    }

    /**
     * Safe user access
     * @param {User|null} user - User object
     * @returns {object} Safe user object
     */
    static safeUser(user) {
        if (!user) {
            return {
                id: null,
                username: 'Unknown',
                tag: 'Unknown#0000',
                avatar: null,
                bot: false,
                system: false
            };
        }

        return {
            id: user.id,
            username: user.username || 'Unknown',
            tag: user.tag || user.username || 'Unknown',
            avatar: user.avatar,
            bot: user.bot ?? false,
            system: user.system ?? false,
            displayAvatarURL: user.displayAvatarURL ? 
                user.displayAvatarURL({ extension: 'png', size: 1024 }) : 
                null
        };
    }

    /**
     * Safe guild access
     * @param {Guild|null} guild - Guild object
     * @returns {object} Safe guild object
     */
    static safeGuild(guild) {
        if (!guild) {
            return {
                id: null,
                name: 'Unknown Guild',
                memberCount: 0,
                available: false,
                members: { cache: new Map() },
                roles: { cache: new Map() },
                channels: { cache: new Map() }
            };
        }

        return {
            id: guild.id,
            name: guild.name || 'Unknown Guild',
            memberCount: guild.memberCount ?? 0,
            available: guild.available ?? false,
            members: guild.members || { cache: new Map() },
            roles: guild.roles || { cache: new Map() },
            channels: guild.channels || { cache: new Map() },
            owner: guild.ownerId,
            icon: guild.iconURL ? guild.iconURL({ extension: 'png', size: 1024 }) : null
        };
    }

    /**
     * Safe voice channel access
     * @param {VoiceChannel|null} channel - Voice channel object
     * @returns {object} Safe channel object
     */
    static safeVoiceChannel(channel) {
        if (!channel) {
            return {
                id: null,
                name: 'Unknown',
                guild: null,
                full: true,
                members: new Map()
            };
        }

        return {
            id: channel.id,
            name: channel.name || 'Unknown',
            guild: channel.guild,
            full: channel.full ?? false,
            userLimit: channel.userLimit ?? 0,
            members: channel.members || new Map(),
            joinable: channel.joinable ?? false,
            speakable: channel.speakable ?? false
        };
    }

    /**
     * Safe role access
     * @param {Role|null} role - Role object
     * @returns {object} Safe role object
     */
    static safeRole(role) {
        if (!role) {
            return {
                id: null,
                name: 'Unknown',
                color: 0,
                position: 0,
                managed: false,
                mentionable: false
            };
        }

        return {
            id: role.id,
            name: role.name || 'Unknown',
            color: role.color ?? 0,
            position: role.position ?? 0,
            managed: role.managed ?? false,
            mentionable: role.mentionable ?? false,
            permissions: role.permissions
        };
    }

    /**
     * Validate object has required properties
     * @param {object} obj - Object to validate
     * @param {string[]} properties - Required properties
     * @returns {boolean}
     */
    static hasProperties(obj, properties) {
        if (!obj || typeof obj !== 'object') return false;
        return properties.every(prop => obj[prop] !== null && obj[prop] !== undefined);
    }

    /**
     * Safe get nested property
     * @param {object} obj - Object to access
     * @param {string} path - Property path (e.g., 'user.guild.members')
     * @param {*} defaultValue - Value to return if path not found
     * @returns {*}
     */
    static deepGet(obj, path, defaultValue = null) {
        if (!obj || typeof obj !== 'object') return defaultValue;
        
        const keys = path.split('.');
        let current = obj;

        for (const key of keys) {
            if (current == null || typeof current !== 'object') {
                return defaultValue;
            }
            current = current[key];
        }

        return current ?? defaultValue;
    }

    /**
     * Create safe method caller
     * @param {object} obj - Object containing method
     * @param {string} methodName - Method name
     * @param {*} fallbackValue - Value to return if method fails
     * @returns {Function} Safe method caller
     */
    static createSafeMethod(obj, methodName, fallbackValue = null) {
        return async (...args) => {
            try {
                if (!obj || typeof obj[methodName] !== 'function') {
                    return fallbackValue;
                }
                return await obj[methodName](...args);
            } catch (error) {
                console.debug(`Safe method call failed for ${methodName}:`, error.message);
                return fallbackValue;
            }
        };
    }
}

module.exports = SafeAccessor;
