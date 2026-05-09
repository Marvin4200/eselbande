/**
 * Scheduled Operations - Schedule troll operations for specific times
 */

class ScheduledOperations {
    constructor() {
        this.schedules = new Map(); // scheduleId -> { operation, time, timezone, recurring, active }
        this.timers = new Map(); // scheduleId -> timeoutId
    }

    /**
     * Schedule an operation
     * @param {string} operationName - Operation name (troll command)
     * @param {string} guildId - Guild ID
     * @param {string} userId - Target user ID
     * @param {Date} executeAt - When to execute
     * @param {Object} options - Additional options (recurring, timezone, etc.)
     * @returns {string} - Schedule ID
     */
    scheduleOperation(operationName, guildId, userId, executeAt, options = {}) {
        const scheduleId = `${Date.now()}-${Math.random()}`;
        
        const schedule = {
            id: scheduleId,
            operation: operationName,
            guildId,
            userId,
            executeAt,
            timezone: options.timezone || 'UTC',
            recurring: options.recurring || null, // 'daily', 'weekly', 'monthly'
            active: true,
            createdAt: new Date().toISOString()
        };

        this.schedules.set(scheduleId, schedule);
        this.setupTimer(scheduleId, schedule);

        return scheduleId;
    }

    /**
     * Setup timer for schedule
     * @param {string} scheduleId - Schedule ID
     * @param {Object} schedule - Schedule config
     */
    setupTimer(scheduleId, schedule) {
        const now = new Date();
        const executeTime = new Date(schedule.executeAt);
        const delay = executeTime.getTime() - now.getTime();

        if (delay > 0) {
            const timerId = setTimeout(() => {
                this.executeSchedule(scheduleId);
            }, Math.max(0, delay));

            this.timers.set(scheduleId, timerId);
        }
    }

    /**
     * Execute a scheduled operation
     * @param {string} scheduleId - Schedule ID
     */
    executeSchedule(scheduleId) {
        const schedule = this.schedules.get(scheduleId);
        if (!schedule || !schedule.active) return;

        // TODO: Call actual troll operation handler
        console.log(`Executing scheduled operation: ${schedule.operation}`);

        // Handle recurring
        if (schedule.recurring) {
            const nextTime = this.calculateNextOccurrence(
                schedule.executeAt,
                schedule.recurring
            );
            schedule.executeAt = nextTime;
            this.setupTimer(scheduleId, schedule);
        } else {
            this.deleteSchedule(scheduleId);
        }
    }

    /**
     * Calculate next occurrence for recurring schedules
     * @param {Date} currentTime - Current scheduled time
     * @param {string} recurrence - Recurrence pattern
     * @returns {Date}
     */
    calculateNextOccurrence(currentTime, recurrence) {
        const next = new Date(currentTime);

        switch (recurrence) {
            case 'daily':
                next.setDate(next.getDate() + 1);
                break;
            case 'weekly':
                next.setDate(next.getDate() + 7);
                break;
            case 'monthly':
                next.setMonth(next.getMonth() + 1);
                break;
        }

        return next;
    }

    /**
     * Delete schedule
     * @param {string} scheduleId - Schedule ID
     */
    deleteSchedule(scheduleId) {
        const timerId = this.timers.get(scheduleId);
        if (timerId) {
            clearTimeout(timerId);
            this.timers.delete(scheduleId);
        }
        this.schedules.delete(scheduleId);
    }

    /**
     * Pause schedule
     * @param {string} scheduleId - Schedule ID
     */
    pauseSchedule(scheduleId) {
        const schedule = this.schedules.get(scheduleId);
        if (schedule) {
            schedule.active = false;
            const timerId = this.timers.get(scheduleId);
            if (timerId) {
                clearTimeout(timerId);
            }
        }
    }

    /**
     * Resume schedule
     * @param {string} scheduleId - Schedule ID
     */
    resumeSchedule(scheduleId) {
        const schedule = this.schedules.get(scheduleId);
        if (schedule) {
            schedule.active = true;
            this.setupTimer(scheduleId, schedule);
        }
    }

    /**
     * Get all schedules for guild
     * @param {string} guildId - Guild ID
     * @returns {Array<Object>}
     */
    getGuildSchedules(guildId) {
        return Array.from(this.schedules.values())
            .filter(s => s.guildId === guildId)
            .map(s => ({
                id: s.id,
                operation: s.operation,
                executeAt: s.executeAt,
                recurring: s.recurring,
                active: s.active
            }));
    }

    /**
     * Get all schedules
     * @returns {Array<Object>}
     */
    getAllSchedules() {
        return Array.from(this.schedules.values());
    }

    /**
     * Get schedule info
     * @param {string} scheduleId - Schedule ID
     * @returns {Object}
     */
    getScheduleInfo(scheduleId) {
        return this.schedules.get(scheduleId);
    }
}

module.exports = ScheduledOperations;
