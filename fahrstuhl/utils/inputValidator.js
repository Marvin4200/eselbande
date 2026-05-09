/**
 * Input Validator
 * Validates Discord IDs, role IDs, and other critical inputs
 */

class InputValidator {
    /**
     * Validate Discord user ID (snowflake format)
     * @param {string} id - User ID to validate
     * @returns {boolean}
     */
    static isValidUserId(id) {
        if (!id) return false;
        // Discord snowflake: 18-digit number
        return /^\d{18}$/.test(id) || /^\d{17}$/.test(id) || /^\d{19}$/.test(id);
    }

    /**
     * Validate Discord guild ID
     * @param {string} id - Guild ID to validate
     * @returns {boolean}
     */
    static isValidGuildId(id) {
        return this.isValidUserId(id);
    }

    /**
     * Validate Discord role ID
     * @param {string} id - Role ID to validate
     * @returns {boolean}
     */
    static isValidRoleId(id) {
        return this.isValidUserId(id);
    }

    /**
     * Validate Discord channel ID
     * @param {string} id - Channel ID to validate
     * @returns {boolean}
     */
    static isValidChannelId(id) {
        return this.isValidUserId(id);
    }

    /**
     * Sanitize string input (remove special chars)
     * @param {string} input - String to sanitize
     * @param {number} maxLength - Max length
     * @returns {string|null}
     */
    static sanitizeString(input, maxLength = 100) {
        if (!input || typeof input !== 'string') return null;
        // Remove potentially dangerous characters
        const sanitized = input
            .replace(/[<>]/g, '') // Remove Discord mention characters
            .replace(/['"]/g, '') // Remove quotes
            .trim();
        
        if (sanitized.length === 0) return null;
        return sanitized.slice(0, maxLength);
    }

    /**
     * Validate number is within range
     * @param {number} value - Value to validate
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @returns {boolean}
     */
    static isInRange(value, min, max) {
        return typeof value === 'number' && value >= min && value <= max;
    }

    /**
     * Validate permission name
     * @param {string} permission - Permission to validate
     * @returns {boolean}
     */
    static isValidPermission(permission) {
        const validPermissions = [
            'SEND_MESSAGES',
            'MANAGE_MESSAGES',
            'MANAGE_GUILD',
            'MANAGE_ROLES',
            'MANAGE_CHANNELS',
            'KICK_MEMBERS',
            'BAN_MEMBERS',
            'MUTE_MEMBERS',
            'MOVE_MEMBERS',
            'EMBED_LINKS',
            'ATTACH_FILES',
            'READ_HISTORY',
            'CONNECT',
            'SPEAK',
            'DEAFEN_MEMBERS'
        ];
        return validPermissions.includes(permission);
    }

    /**
     * Validate email address
     * @param {string} email - Email to validate
     * @returns {boolean}
     */
    static isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Validate reason text (for bans, mutes, etc)
     * @param {string} reason - Reason text
     * @returns {string|null}
     */
    static sanitizeReason(reason) {
        if (!reason) return null;
        const sanitized = this.sanitizeString(reason, 512);
        if (!sanitized) return null;
        // Remove line breaks for DB storage
        return sanitized.replace(/\n/g, ' ');
    }

    /**
     * Batch validate all inputs for a command
     * @param {object} inputs - Object of input name -> value
     * @param {object} schema - Validation schema
     * @returns {object} { valid: boolean, errors: object }
     */
    static validateBatch(inputs, schema) {
        const errors = {};

        for (const [field, validation] of Object.entries(schema)) {
            const value = inputs[field];

            if (validation.required && !value) {
                errors[field] = 'Required';
                continue;
            }

            if (!value) continue;

            if (validation.type === 'userId' && !this.isValidUserId(value)) {
                errors[field] = 'Invalid user ID';
            }
            if (validation.type === 'roleId' && !this.isValidRoleId(value)) {
                errors[field] = 'Invalid role ID';
            }
            if (validation.type === 'guildId' && !this.isValidGuildId(value)) {
                errors[field] = 'Invalid guild ID';
            }
            if (validation.type === 'string' && typeof value !== 'string') {
                errors[field] = 'Must be a string';
            }
            if (validation.type === 'number' && typeof value !== 'number') {
                errors[field] = 'Must be a number';
            }
            if (validation.min !== undefined && value < validation.min) {
                errors[field] = `Minimum value is ${validation.min}`;
            }
            if (validation.max !== undefined && value > validation.max) {
                errors[field] = `Maximum value is ${validation.max}`;
            }
        }

        return {
            valid: Object.keys(errors).length === 0,
            errors
        };
    }
}

module.exports = InputValidator;
