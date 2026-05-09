/**
 * Query Cache - Cache frequently accessed data with TTL-based invalidation
 */

class QueryCache {
    constructor(config = {}) {
        this.cache = new Map();
        this.ttls = new Map();
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0
        };
        this.defaultTTL = config.defaultTTL || 300000; // 5 minutes
        this.maxSize = config.maxSize || 1000; // Max cache entries
        this.cleanupInterval = config.cleanupInterval || 60000; // 1 minute
        this.startCleanup();
    }

    /**
     * Get value from cache
     * @param {string} key - Cache key
     * @returns {*} - Cached value or null
     */
    get(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            this.stats.misses++;
            return null;
        }

        const ttl = this.ttls.get(key);
        if (ttl && Date.now() > ttl) {
            this.cache.delete(key);
            this.ttls.delete(key);
            this.stats.misses++;
            this.stats.evictions++;
            return null;
        }

        this.stats.hits++;
        return entry;
    }

    /**
     * Set value in cache
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {number} ttl - Time to live in milliseconds
     */
    set(key, value, ttl = this.defaultTTL) {
        // Evict oldest if cache is full
        if (this.cache.size >= this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
            this.ttls.delete(oldestKey);
            this.stats.evictions++;
        }

        this.cache.set(key, value);
        this.ttls.set(key, Date.now() + ttl);
    }

    /**
     * Get or set - fetch from cache or compute
     * @param {string} key - Cache key
     * @param {Function} fn - Function to compute value if cache miss
     * @param {number} ttl - TTL for new entries
     * @returns {Promise<*>}
     */
    async getOrSet(key, fn, ttl = this.defaultTTL) {
        const cached = this.get(key);
        if (cached !== null) {
            return cached;
        }

        const value = await fn();
        this.set(key, value, ttl);
        return value;
    }

    /**
     * Delete specific key
     * @param {string} key - Cache key
     */
    delete(key) {
        this.cache.delete(key);
        this.ttls.delete(key);
    }

    /**
     * Delete all keys matching pattern
     * @param {RegExp|string} pattern - Pattern to match
     * @returns {number} - Number of deleted entries
     */
    deletePattern(pattern) {
        let deleted = 0;
        const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                this.delete(key);
                deleted++;
            }
        }

        return deleted;
    }

    /**
     * Clear all cache
     */
    clear() {
        this.cache.clear();
        this.ttls.clear();
    }

    /**
     * Start periodic cleanup of expired entries
     */
    startCleanup() {
        this.cleanupIntervalId = setInterval(() => {
            this.cleanup();
        }, this.cleanupInterval);
    }

    /**
     * Stop cleanup
     */
    stopCleanup() {
        if (this.cleanupIntervalId) {
            clearInterval(this.cleanupIntervalId);
        }
    }

    /**
     * Cleanup expired entries
     */
    cleanup() {
        const now = Date.now();
        let removed = 0;

        for (const [key, ttl] of this.ttls) {
            if (now > ttl) {
                this.cache.delete(key);
                this.ttls.delete(key);
                removed++;
            }
        }

        return removed;
    }

    /**
     * Get cache statistics
     * @returns {Object}
     */
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) : 0;

        return {
            hits: this.stats.hits,
            misses: this.stats.misses,
            evictions: this.stats.evictions,
            hitRate: `${hitRate}%`,
            size: this.cache.size,
            maxSize: this.maxSize
        };
    }

    /**
     * Get memory usage estimate
     */
    getMemoryUsage() {
        return this.cache.size * 100; // Rough estimate: 100 bytes per entry
    }
}

module.exports = QueryCache;
