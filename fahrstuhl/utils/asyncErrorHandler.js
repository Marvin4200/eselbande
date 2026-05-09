/**
 * Async Error Handler Wrapper
 * Standardizes error handling across the bot
 */

class AsyncErrorHandler {
    /**
     * Wrap async function with error handling
     * @param {Function} fn - Async function to wrap
     * @param {string} context - Context for logging
     * @returns {Function} Wrapped function
     */
    static wrap(fn, context = 'Unknown') {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                console.error(`❌ Error in ${context}:`, error);
                throw error;
            }
        };
    }

    /**
     * Wrap async function with silent error handling
     * @param {Function} fn - Async function to wrap
     * @param {*} defaultValue - Value to return on error
     * @param {string} context - Context for logging
     * @returns {Function} Wrapped function
     */
    static wrapSilent(fn, defaultValue = null, context = 'Unknown') {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                console.debug(`⚠️ Error in ${context} (silenced):`, error.message);
                return defaultValue;
            }
        };
    }

    /**
     * Wrap async function with retry logic
     * @param {Function} fn - Async function to wrap
     * @param {number} maxRetries - Maximum retries
     * @param {number} delayMs - Delay between retries
     * @param {string} context - Context for logging
     * @returns {Function} Wrapped function
     */
    static wrapWithRetry(fn, maxRetries = 3, delayMs = 1000, context = 'Unknown') {
        return async (...args) => {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    return await fn(...args);
                } catch (error) {
                    if (attempt === maxRetries) {
                        console.error(`❌ Error in ${context} after ${maxRetries} retries:`, error);
                        throw error;
                    }
                    
                    const delay = delayMs * Math.pow(2, attempt - 1);
                    console.warn(`⚠️ Attempt ${attempt}/${maxRetries} failed in ${context}, retrying in ${delay}ms...`, error.message);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        };
    }

    /**
     * Handle Discord API error gracefully
     * @param {Error} error - Discord error
     * @param {object} context - Context object
     * @returns {string} User-friendly error message
     */
    static handleDiscordError(error, context = {}) {
        const message = error.message || '';
        const code = error.code;

        // Known Discord API error codes
        const errorCodes = {
            50013: 'Bot does not have permission to perform this action',
            50001: 'Bot is missing access to this resource',
            50002: 'Invalid token provided',
            50005: 'Invalid action on archived channel',
            50008: 'User is banned from this guild',
            50010: 'Channel not found',
            50011: 'Invalid form body',
            50013: 'Missing permissions',
            50014: 'Invalid authentication token',
            50026: 'Invalid API version',
            50035: 'Invalid form body',
            50050: 'Invalid request origin',
            50054: 'Invalid API version',
            50068: 'Invalid message type',
            100001: 'Invalid OAuth2 scope'
        };

        if (errorCodes[code]) {
            return errorCodes[code];
        }

        if (message.includes('Missing Permissions')) {
            return 'Bot is missing permissions to perform this action';
        }
        if (message.includes('Unknown User')) {
            return 'User not found';
        }
        if (message.includes('Unknown Guild')) {
            return 'Guild not found';
        }
        if (message.includes('Unknown Member')) {
            return 'Member not found';
        }
        if (message.includes('Unknown Role')) {
            return 'Role not found';
        }
        if (message.includes('Unknown Channel')) {
            return 'Channel not found';
        }
        if (message.includes('Invalid')) {
            return 'Invalid request';
        }

        return `An error occurred: ${message}`;
    }

    /**
     * Create safe callback handler
     * @param {Function} callback - Callback function
     * @param {string} context - Context for logging
     * @returns {Function} Safe callback
     */
    static createSafeCallback(callback, context = 'Callback') {
        return async (...args) => {
            try {
                await callback(...args);
            } catch (error) {
                console.error(`❌ Error in ${context}:`, error);
                // Don't throw - callback should be fire-and-forget
            }
        };
    }

    /**
     * Validate function parameters
     * @param {object} params - Parameters object
     * @param {string[]} required - Required parameter names
     * @throws {Error} If required parameter is missing
     */
    static validateParams(params, required = []) {
        for (const param of required) {
            if (!params[param]) {
                throw new Error(`Missing required parameter: ${param}`);
            }
        }
    }
}

module.exports = AsyncErrorHandler;
