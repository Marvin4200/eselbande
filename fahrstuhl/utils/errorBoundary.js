/**
 * Error Boundaries - Graceful error handling for critical operations
 */

/**
 * Wrap an async function with error boundary
 * @param {string} name - Operation name for logging
 * @param {Function} fn - Async function to wrap
 * @param {Object} context - Context object with logging functions
 * @returns {Promise<*>} - Result or fallback
 */
async function withErrorBoundary(name, fn, context = {}) {
    const { logError = console.error, fallbackValue = null } = context;

    try {
        const result = await fn();
        return result;
    } catch (error) {
        logError(`[ERROR_BOUNDARY] ${name} failed:`, {
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });

        return fallbackValue;
    }
}

/**
 * Wrap a sync function with error boundary
 * @param {string} name - Operation name for logging
 * @param {Function} fn - Sync function to wrap
 * @param {Object} context - Context object with logging functions
 * @returns {*} - Result or fallback
 */
function withErrorBoundarySync(name, fn, context = {}) {
    const { logError = console.error, fallbackValue = null } = context;

    try {
        return fn();
    } catch (error) {
        logError(`[ERROR_BOUNDARY] ${name} failed:`, {
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });

        return fallbackValue;
    }
}

/**
 * Create a safe version of a function that won't throw
 * @param {Function} fn - Function to make safe
 * @param {*} fallbackValue - Value to return on error
 * @returns {Function} - Safe version of function
 */
function makeSafe(fn, fallbackValue = null) {
    return async function safeFn(...args) {
        try {
            return await fn(...args);
        } catch (error) {
            console.error(`[SAFE_CALL] Error in ${fn.name}:`, error.message);
            return fallbackValue;
        }
    };
}

/**
 * Retry a function with exponential backoff
 * @param {string} name - Operation name
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} [options.maxRetries=3] - Maximum retry attempts
 * @param {number} [options.initialDelay=1000] - Initial delay in ms
 * @param {number} [options.maxDelay=30000] - Maximum delay in ms
 * @returns {Promise<*>} - Result or throws after all retries
 */
async function withRetry(name, fn, options = {}) {
    const { maxRetries = 3, initialDelay = 1000, maxDelay = 30000 } = options;

    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt < maxRetries) {
                const delay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay);
                console.warn(
                    `[RETRY] ${name} failed (attempt ${attempt}/${maxRetries}), ` +
                    `retrying in ${delay}ms...`
                );
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw new Error(
        `[RETRY_FAILED] ${name} failed after ${maxRetries} attempts: ${lastError.message}`
    );
}

/**
 * Timeout wrapper for promises
 * @param {string} name - Operation name
 * @param {Promise} promise - Promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<*>} - Promise that rejects if timeout exceeded
 */
function withTimeout(name, promise, timeoutMs) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(
                () => reject(new Error(`[TIMEOUT] ${name} exceeded ${timeoutMs}ms`)),
                timeoutMs
            )
        )
    ]);
}

/**
 * Create a circuit breaker for failing services
 * @param {string} name - Service name
 * @param {Object} options - Circuit breaker options
 * @param {number} [options.failureThreshold=5] - Failures before opening
 * @param {number} [options.resetTimeout=60000] - Time before attempting reset
 * @returns {Object} - Circuit breaker instance
 */
function createCircuitBreaker(name, options = {}) {
    const { failureThreshold = 5, resetTimeout = 60000 } = options;

    return {
        state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
        failures: 0,
        lastFailureTime: null,

        /**
         * Execute function through circuit breaker
         * @param {Function} fn - Function to execute
         * @returns {Promise<*>} - Result
         */
        async call(fn) {
            if (this.state === 'OPEN') {
                const timeSinceFailure = Date.now() - this.lastFailureTime;
                if (timeSinceFailure > resetTimeout) {
                    this.state = 'HALF_OPEN';
                    console.log(`[CIRCUIT_BREAKER] ${name} attempting reset...`);
                } else {
                    throw new Error(
                        `[CIRCUIT_OPEN] ${name} circuit is open, request rejected`
                    );
                }
            }

            try {
                const result = await fn();
                if (this.state === 'HALF_OPEN') {
                    this.state = 'CLOSED';
                    this.failures = 0;
                    console.log(`[CIRCUIT_BREAKER] ${name} recovered`);
                }
                return result;
            } catch (error) {
                this.failures++;
                this.lastFailureTime = Date.now();

                if (this.failures >= failureThreshold) {
                    this.state = 'OPEN';
                    console.error(
                        `[CIRCUIT_BREAKER] ${name} circuit opened after ` +
                        `${this.failures} failures`
                    );
                }

                throw error;
            }
        },

        /**
         * Manually reset the circuit breaker
         */
        reset() {
            this.state = 'CLOSED';
            this.failures = 0;
            this.lastFailureTime = null;
        }
    };
}

module.exports = {
    withErrorBoundary,
    withErrorBoundarySync,
    makeSafe,
    withRetry,
    withTimeout,
    createCircuitBreaker
};
