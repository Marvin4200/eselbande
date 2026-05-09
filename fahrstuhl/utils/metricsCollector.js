// Metrics collection system for performance monitoring

class MetricsCollector {
    constructor() {
        this.metrics = new Map(); // name -> values[]
        this.counters = new Map(); // name -> count
        this.timings = new Map(); // name -> durations[]
        this.maxDataPoints = 1000; // Keep last N data points
    }

    // Record a metric value
    recordMetric(name, value, tags = {}) {
        if (typeof value !== 'number') return;

        const key = this.buildKey(name, tags);
        if (!this.metrics.has(key)) {
            this.metrics.set(key, []);
        }

        const values = this.metrics.get(key);
        values.push({ value, timestamp: Date.now() });

        // Trim to keep memory bounded
        if (values.length > this.maxDataPoints) {
            values.shift();
        }
    }

    // Increment a counter
    incrementCounter(name, amount = 1, tags = {}) {
        const key = this.buildKey(name, tags);
        this.counters.set(key, (this.counters.get(key) || 0) + amount);
    }

    // Record a timing (duration in ms)
    recordTiming(name, duration, tags = {}) {
        if (typeof duration !== 'number') return;

        const key = this.buildKey(name, tags);
        if (!this.timings.has(key)) {
            this.timings.set(key, []);
        }

        const timings = this.timings.get(key);
        timings.push({ duration, timestamp: Date.now() });

        // Trim to keep memory bounded
        if (timings.length > this.maxDataPoints) {
            timings.shift();
        }
    }

    // Time an async function
    async timeAsync(name, fn, tags = {}) {
        const startTime = Date.now();
        try {
            const result = await fn();
            const duration = Date.now() - startTime;
            this.recordTiming(name, duration, tags);
            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            this.recordTiming(name, duration, { ...tags, error: true });
            throw error;
        }
    }

    // Time a sync function
    timeSync(name, fn, tags = {}) {
        const startTime = Date.now();
        try {
            const result = fn();
            const duration = Date.now() - startTime;
            this.recordTiming(name, duration, tags);
            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            this.recordTiming(name, duration, { ...tags, error: true });
            throw error;
        }
    }

    // Get metric statistics
    getMetricStats(name) {
        const values = Array.from(this.metrics.values())
            .filter(v => v.some(vv => this.buildKey(name) === name))
            .flat()
            .map(v => v.value);

        if (values.length === 0) return null;

        values.sort((a, b) => a - b);
        const sum = values.reduce((a, b) => a + b, 0);
        const avg = sum / values.length;
        const mid = Math.floor(values.length / 2);
        const median = values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;

        return {
            min: values[0],
            max: values[values.length - 1],
            avg: parseFloat(avg.toFixed(2)),
            median,
            p95: values[Math.floor(values.length * 0.95)],
            p99: values[Math.floor(values.length * 0.99)],
            count: values.length
        };
    }

    // Get timing statistics
    getTimingStats(name) {
        const durations = Array.from(this.timings.entries())
            .filter(([key]) => key.includes(name))
            .flatMap(([, v]) => v.map(vv => vv.duration));

        if (durations.length === 0) return null;

        durations.sort((a, b) => a - b);
        const sum = durations.reduce((a, b) => a + b, 0);
        const avg = sum / durations.length;
        const mid = Math.floor(durations.length / 2);
        const median = durations.length % 2 ? durations[mid] : (durations[mid - 1] + durations[mid]) / 2;

        return {
            min: durations[0],
            max: durations[durations.length - 1],
            avg: parseFloat(avg.toFixed(2)),
            median,
            p95: durations[Math.floor(durations.length * 0.95)],
            p99: durations[Math.floor(durations.length * 0.99)],
            count: durations.length,
            totalMs: sum
        };
    }

    // Get counter value
    getCounter(name) {
        return this.counters.get(name) || 0;
    }

    // Get all counters
    getAllCounters() {
        return Object.fromEntries(this.counters);
    }

    // Build a metric key from name and tags
    buildKey(name, tags = {}) {
        if (Object.keys(tags).length === 0) return name;
        const tagStr = Object.entries(tags)
            .sort()
            .map(([k, v]) => `${k}=${v}`)
            .join(',');
        return `${name}{${tagStr}}`;
    }

    // Get metrics summary
    getSummary() {
        const summary = {
            timestamp: Date.now(),
            metrics: {},
            counters: this.getAllCounters(),
            timings: {}
        };

        // Add metric stats
        const metricNames = new Set();
        for (const [key] of this.metrics) {
            const name = key.split('{')[0];
            metricNames.add(name);
        }
        for (const name of metricNames) {
            const stats = this.getMetricStats(name);
            if (stats) summary.metrics[name] = stats;
        }

        // Add timing stats
        const timingNames = new Set();
        for (const [key] of this.timings) {
            const name = key.split('{')[0];
            timingNames.add(name);
        }
        for (const name of timingNames) {
            const stats = this.getTimingStats(name);
            if (stats) summary.timings[name] = stats;
        }

        return summary;
    }

    // Clear all metrics
    clear() {
        this.metrics.clear();
        this.counters.clear();
        this.timings.clear();
    }

    // Get metrics size in memory (rough estimate)
    getMemoryUsage() {
        let bytes = 0;
        for (const values of this.metrics.values()) {
            bytes += values.length * 40; // ~40 bytes per value
        }
        for (const timings of this.timings.values()) {
            bytes += timings.length * 40;
        }
        bytes += this.counters.size * 40;
        return bytes;
    }
}

module.exports = MetricsCollector;
