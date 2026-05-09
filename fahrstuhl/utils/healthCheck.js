// Bot health check system - monitor all critical components

class HealthCheckManager {
    constructor(dependencies = {}) {
        this.dependencies = dependencies;
        this.checks = new Map(); // name -> check function
        this.lastResults = new Map(); // name -> last result
        this.intervals = new Map(); // name -> interval ID
    }

    // Register a health check
    registerCheck(name, checkFn, interval = 30000) {
        if (typeof checkFn !== 'function') {
            throw new Error('Check function must be a function');
        }

        this.checks.set(name, { fn: checkFn, interval });
        this.lastResults.set(name, { status: 'unknown', timestamp: null, message: null });
    }

    // Run a single check
    async runCheck(name) {
        const check = this.checks.get(name);
        if (!check) return null;

        const startTime = Date.now();
        try {
            const result = await check.fn();
            const duration = Date.now() - startTime;

            let ok = true;
            let message = null;

            if (typeof result === "boolean") {
                ok = result;
            } else if (result && typeof result === "object") {
                if (typeof result.ok === "boolean") ok = result.ok;
                if (result.message !== undefined) message = result.message;
            } else if (result === null || result === undefined) {
                ok = false;
            }

            this.lastResults.set(name, {
                status: ok ? 'ok' : 'degraded',
                timestamp: Date.now(),
                message: message || null,
                duration
            });

            return this.lastResults.get(name);
        } catch (error) {
            const duration = Date.now() - startTime;
            this.lastResults.set(name, {
                status: 'error',
                timestamp: Date.now(),
                message: error.message,
                duration
            });

            return this.lastResults.get(name);
        }
    }

    // Run all checks
    async runAllChecks() {
        const results = {};
        for (const [name] of this.checks) {
            results[name] = await this.runCheck(name);
        }
        return results;
    }

    // Start periodic health checks
    startPeriodicChecks() {
        for (const [name, check] of this.checks) {
            // Run once immediately so dashboards don't sit at "unknown" after boot.
            this.runCheck(name).catch(console.error);

            const intervalId = setInterval(() => {
                this.runCheck(name).catch(console.error);
            }, check.interval);

            this.intervals.set(name, intervalId);
        }

        console.log('✅ Health checks started');
    }

    // Stop periodic health checks
    stopPeriodicChecks() {
        for (const [name, intervalId] of this.intervals) {
            clearInterval(intervalId);
        }
        this.intervals.clear();
        console.log('✅ Health checks stopped');
    }

    // Get overall health status
    getOverallHealth() {
        let ok = 0, degraded = 0, error = 0, unknown = 0;

        for (const [, result] of this.lastResults) {
            switch (result.status) {
                case 'ok': ok++; break;
                case 'degraded': degraded++; break;
                case 'error': error++; break;
                default: unknown++;
            }
        }

        const total = ok + degraded + error + unknown;
        const healthy = ok; // only "ok" counts as healthy

        return {
            status: error > 0 ? 'critical' : degraded > 0 ? 'degraded' : 'ok',
            ok,
            degraded,
            error,
            unknown,
            total,
            healthPercentage: total > 0 ? ((healthy / total) * 100).toFixed(2) : 0
        };
    }

    // Get result for specific check
    getCheckResult(name) {
        return this.lastResults.get(name);
    }

    // Get all results
    getAllResults() {
        const results = {};
        for (const [name, result] of this.lastResults) {
            results[name] = result;
        }
        return results;
    }

    // Create health summary for logging
    getSummary() {
        const overall = this.getOverallHealth();
        const results = this.getAllResults();

        return {
            timestamp: Date.now(),
            overall,
            checks: results
        };
    }
}

// Setup default health checks
function setupDefaultHealthChecks(healthManager, dependencies) {
    // Database connectivity check
    healthManager.registerCheck('database', async () => {
        try {
            if (dependencies.getDbStatus) {
                const status = await dependencies.getDbStatus();
                const ok = !!status?.ok;
                const message = ok
                    ? `Database connected (${status.pingMs ?? '?'}ms)`
                    : `Database error: ${status?.error || 'unknown'}`;
                return { ok, message };
            }
            return { ok: true, message: 'No DB dependency' };
        } catch (error) {
            throw new Error(`Database check failed: ${error.message}`);
        }
    }, 30000);

    // Cache health check
    healthManager.registerCheck('cache', async () => {
        try {
            if (dependencies.getCacheStatus) {
                const status = await dependencies.getCacheStatus();
                return { ok: status.healthy, message: `Cache: ${status.size} items` };
            }
            return { ok: true, message: 'No cache dependency' };
        } catch (error) {
            throw new Error(`Cache check failed: ${error.message}`);
        }
    }, 30000);

    // Voice connections health check
    healthManager.registerCheck('voice', async () => {
        try {
            if (dependencies.voiceTracker) {
                const health = dependencies.voiceTracker.getHealth();
                return { 
                    ok: health.healthy, 
                    message: `${health.healthyCount}/${health.connections} voice connections healthy`
                };
            }
            return { ok: true, message: 'No voice dependency' };
        } catch (error) {
            throw new Error(`Voice check failed: ${error.message}`);
        }
    }, 30000);

    // Rate limiter health check
    healthManager.registerCheck('rate_limiter', async () => {
        try {
            if (dependencies.rateLimiter) {
                const stats = dependencies.rateLimiter.getStats?.();
                return { 
                    ok: true, 
                    message: `Rate limiter: ${stats?.trackedUsers || 0} users tracked`
                };
            }
            return { ok: true, message: 'No rate limiter dependency' };
        } catch (error) {
            throw new Error(`Rate limiter check failed: ${error.message}`);
        }
    }, 30000);

    // Bot responsiveness check
    healthManager.registerCheck('responsiveness', async () => {
        try {
            if (dependencies.client) {
                const latency = dependencies.client.ws.ping;
                const ok = latency < 500; // Consider it bad if > 500ms
                return { 
                    ok, 
                    message: `Bot latency: ${latency}ms`
                };
            }
            return { ok: true, message: 'No client dependency' };
        } catch (error) {
            throw new Error(`Responsiveness check failed: ${error.message}`);
        }
    }, 30000);
}

module.exports = {
    HealthCheckManager,
    setupDefaultHealthChecks
};
