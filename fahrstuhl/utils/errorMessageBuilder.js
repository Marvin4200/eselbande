/**
 * Error Message Helper
 * Converts technical errors into user-friendly messages
 */

class ErrorMessageBuilder {
    constructor() {
        this.errorMap = {
            'MISSING_PERMISSION': (context) => {
                const perm = context.permission || 'Unknown';
                const channel = context.channel ? ` in channel \`${context.channel}\`` : '';
                return `❌ **Missing Permission**: Bot needs \`${perm}\` permission${channel}`;
            },
            'ROLE_HIERARCHY': (context) => {
                const userRole = context.userRole || 'their role';
                return `❌ **Role Hierarchy**: Bot's role must be higher than ${userRole}`;
            },
            'TARGET_OWNER': (context) => {
                return `❌ **Can't troll server owner** - Only members can be trolled`;
            },
            'NOT_IN_VOICE': (context) => {
                return `❌ **Not in voice channel** - User must be in a voice channel`;
            },
            'BOT_NOT_IN_VOICE': (context) => {
                return `❌ **Bot not connected** - Bot must be in the same server`;
            },
            'NO_VOICE_CHANNELS': (context) => {
                return `❌ **No voice channels** - Server has no voice channels to move to`;
            },
            'PERMISSION_DENIED': (context) => {
                const action = context.action || 'perform this action';
                return `❌ **Permission Denied** - You don't have permission to ${action}`;
            },
            'USER_NOT_FOUND': (context) => {
                const identifier = context.identifier || 'user';
                return `❌ **User not found** - Could not find ${identifier}`;
            },
            'ROLE_NOT_FOUND': (context) => {
                return `❌ **Role not found** - Invalid role`;
            },
            'COOLDOWN_ACTIVE': (context) => {
                const retryTime = context.retryAfter || 'unknown';
                return `⏰ **Command on cooldown** - Try again in ${retryTime}`;
            },
            'PREMIUM_REQUIRED': (context) => {
                return `🔒 **Premium required** - This feature requires premium membership`;
            },
            'INVALID_INPUT': (context) => {
                const field = context.field || 'input';
                return `❌ **Invalid input** - ${field} is not valid`;
            },
            'BOT_NO_PERMISSION': (context) => {
                const action = context.action || 'perform this action';
                return `❌ **Bot restricted** - Bot doesn't have permission to ${action}`;
            }
        };
    }

    /**
     * Get human-friendly error message
     * @param {string} errorCode - Error code from errorMap
     * @param {object} context - Context object with additional details
     * @returns {string} User-friendly error message
     */
    getMessage(errorCode, context = {}) {
        const handler = this.errorMap[errorCode];
        if (!handler) {
            return `❌ **Error** - ${context.message || 'An unknown error occurred'}`;
        }
        return handler(context);
    }

    /**
     * Parse Discord API error and return friendly message
     * @param {Error} error - Discord.js error
     * @param {object} context - Additional context
     * @returns {string} User-friendly message
     */
    parseDiscordError(error, context = {}) {
        const message = error.message || '';
        const code = error.code;

        if (message.includes('Missing Permissions')) {
            return this.getMessage('MISSING_PERMISSION', context);
        }
        if (message.includes('hierarchy')) {
            return this.getMessage('ROLE_HIERARCHY', context);
        }
        if (message.includes('Owner')) {
            return this.getMessage('TARGET_OWNER', context);
        }
        if (code === 50013) {
            return this.getMessage('BOT_NO_PERMISSION', context);
        }
        
        return this.getMessage('INVALID_INPUT', { message: message.slice(0, 100) });
    }

    /**
     * Format permission requirement
     * @param {string} permission - Permission name
     * @returns {string} Formatted permission
     */
    formatPermission(permission) {
        const permissionNames = {
            'MUTE_MEMBERS': 'Mute Members',
            'MOVE_MEMBERS': 'Move Members',
            'MANAGE_GUILD': 'Manage Server',
            'MANAGE_ROLES': 'Manage Roles',
            'MANAGE_CHANNELS': 'Manage Channels',
            'BAN_MEMBERS': 'Ban Members',
            'KICK_MEMBERS': 'Kick Members'
        };
        return permissionNames[permission] || permission;
    }
}

module.exports = new ErrorMessageBuilder();
