/**
 * Command Debouncing - Prevent duplicate command executions
 */

class CommandDebouncer {
    constructor(config = {}) {
        this.debouncedCommands = new Map(); // userId+commandName -> timestamp
        this.debounceTime = config.debounceTime || 500; // milliseconds
    }

    /**
     * Check if command should be debounced
     * @param {string} userId - Discord user ID
     * @param {string} commandName - Command name
     * @returns {boolean} - True if should skip (debounced)
     */
    shouldDebounce(userId, commandName) {
        const key = `${userId}:${commandName}`;
        const lastExecution = this.debouncedCommands.get(key);

        if (!lastExecution) {
            this.debouncedCommands.set(key, Date.now());
            return false;
        }

        const timeSinceLastExecution = Date.now() - lastExecution;
        if (timeSinceLastExecution < this.debounceTime) {
            return true; // Skip this execution
        }

        this.debouncedCommands.set(key, Date.now());
        return false;
    }

    /**
     * Cleanup old entries
     */
    cleanup() {
        const now = Date.now();
        let removed = 0;

        for (const [key, timestamp] of this.debouncedCommands) {
            if (now - timestamp > 60000) { // 1 minute old
                this.debouncedCommands.delete(key);
                removed++;
            }
        }

        return removed;
    }
}

module.exports = CommandDebouncer;
