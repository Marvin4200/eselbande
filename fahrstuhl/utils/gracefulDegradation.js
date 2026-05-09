// Graceful degradation system - continue functioning with limited data when DB is down

const fs = require('fs');
const path = require('path');

class GracefulDegradation {
    constructor(config = {}) {
        this.isDbDown = false;
        this.fallbackDataDir = config.fallbackDataDir || './fallback-data';
        this.fallbackTtl = config.fallbackTtl || 86400000; // 24 hours
        this.cache = new Map();
        this.cacheTimestamps = new Map();
        this.ensureFallbackDir();
    }

    // Ensure fallback directory exists
    ensureFallbackDir() {
        if (!fs.existsSync(this.fallbackDataDir)) {
            fs.mkdirSync(this.fallbackDataDir, { recursive: true });
        }
    }

    // Mark database as down
    setDbDown(reason = 'Connection failed') {
        if (!this.isDbDown) {
            console.warn(`⚠️ Database marked as down: ${reason}`);
            this.isDbDown = true;
        }
    }

    // Mark database as recovered
    setDbUp() {
        if (this.isDbDown) {
            console.log('✅ Database recovered');
            this.isDbDown = false;
        }
    }

    // Save data to fallback storage
    saveFallbackData(key, data) {
        try {
            const filePath = path.join(this.fallbackDataDir, `${key}.json`);
            fs.writeFileSync(filePath, JSON.stringify({
                data,
                timestamp: Date.now(),
                ttl: this.fallbackTtl
            }, null, 2));

            this.cache.set(key, data);
            this.cacheTimestamps.set(key, Date.now());
        } catch (error) {
            console.error(`Failed to save fallback data for ${key}:`, error.message);
        }
    }

    // Load data from fallback storage
    loadFallbackData(key) {
        try {
            // Check cache first
            const cached = this.cache.get(key);
            if (cached) {
                const timestamp = this.cacheTimestamps.get(key);
                if (Date.now() - timestamp < this.fallbackTtl) {
                    return cached;
                }
            }

            // Load from file
            const filePath = path.join(this.fallbackDataDir, `${key}.json`);
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                const { data, timestamp } = JSON.parse(content);

                // Check TTL
                if (Date.now() - timestamp > this.fallbackTtl) {
                    console.warn(`⚠️ Fallback data for ${key} is stale (${Date.now() - timestamp}ms old)`);
                    return null;
                }

                this.cache.set(key, data);
                this.cacheTimestamps.set(key, Date.now());
                return data;
            }

            return null;
        } catch (error) {
            console.error(`Failed to load fallback data for ${key}:`, error.message);
            return null;
        }
    }

    // Get data with fallback: try primary source, fall back to saved data
    async getWithFallback(key, primaryFn) {
        try {
            // Try primary source first
            const data = await primaryFn();
            if (data) {
                this.saveFallbackData(key, data);
                return { data, fromFallback: false };
            }
        } catch (error) {
            console.warn(`Primary source failed for ${key}: ${error.message}`);
            this.setDbDown(`Failed to fetch ${key}`);
        }

        // Try fallback
        const fallbackData = this.loadFallbackData(key);
        if (fallbackData) {
            console.warn(`⚠️ Using fallback data for ${key}`);
            return { data: fallbackData, fromFallback: true };
        }

        return { data: null, fromFallback: false };
    }

    // Check if data is from fallback
    isFallback(key) {
        const filePath = path.join(this.fallbackDataDir, `${key}.json`);
        return fs.existsSync(filePath);
    }

    // Get fallback data age (ms since saved)
    getFallbackAge(key) {
        try {
            const filePath = path.join(this.fallbackDataDir, `${key}.json`);
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                const { timestamp } = JSON.parse(content);
                return Date.now() - timestamp;
            }
        } catch (error) {
            console.error(`Failed to get fallback age for ${key}:`, error.message);
        }
        return null;
    }

    // Clean up stale fallback data
    cleanupStale() {
        try {
            const files = fs.readdirSync(this.fallbackDataDir);
            let removed = 0;

            for (const file of files) {
                if (!file.endsWith('.json')) continue;

                const filePath = path.join(this.fallbackDataDir, file);
                const content = fs.readFileSync(filePath, 'utf8');
                const { timestamp, ttl } = JSON.parse(content);

                if (Date.now() - timestamp > ttl) {
                    fs.unlinkSync(filePath);
                    removed++;
                }
            }

            if (removed > 0) {
                console.log(`✅ Cleaned up ${removed} stale fallback files`);
            }

            return removed;
        } catch (error) {
            console.error('Failed to cleanup stale fallback data:', error.message);
            return 0;
        }
    }

    // Clear all fallback data
    clearAll() {
        try {
            const files = fs.readdirSync(this.fallbackDataDir);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    fs.unlinkSync(path.join(this.fallbackDataDir, file));
                }
            }
            this.cache.clear();
            this.cacheTimestamps.clear();
            console.log('✅ Cleared all fallback data');
        } catch (error) {
            console.error('Failed to clear fallback data:', error.message);
        }
    }

    // Get status
    getStatus() {
        const files = fs.readdirSync(this.fallbackDataDir).filter(f => f.endsWith('.json'));
        
        return {
            dbDown: this.isDbDown,
            cacheSize: this.cache.size,
            fallbackFiles: files.length,
            fallbackDir: this.fallbackDataDir
        };
    }
}

module.exports = GracefulDegradation;
