// Simple connection pooling for MySQL

const mysql = require('mysql2/promise');

class ConnectionPool {
    constructor(config) {
        this.config = config;
        this.pool = null;
        this.activeConnections = new Map();
        this.waitingQueue = [];
        this.stats = {
            created: 0,
            acquired: 0,
            released: 0,
            errors: 0
        };
    }

    async initialize() {
        try {
            this.pool = mysql.createPool({
                host: this.config.MYSQL_HOST,
                port: this.config.MYSQL_PORT,
                user: this.config.MYSQL_USER,
                password: this.config.MYSQL_PASSWORD,
                database: this.config.MYSQL_DATABASE,
                waitForConnections: true,
                connectionLimit: this.config.POOL_MAX || 20,
                queueLimit: this.config.QUEUE_LIMIT || 0,
                enableKeepAlive: true,
                keepAliveInitialDelayMs: 0,
                // Enable connection validation
                enableJavaScriptSupport: false
            });

            // Test connection
            const conn = await this.pool.getConnection();
            await conn.ping();
            conn.release();
            
            console.log('✅ Database connection pool initialized');
            return true;
        } catch (error) {
            this.stats.errors++;
            console.error('❌ Failed to initialize connection pool:', error.message);
            return false;
        }
    }

    async getConnection() {
        if (!this.pool) {
            throw new Error('Connection pool not initialized');
        }

        try {
            const conn = await this.pool.getConnection();
            this.stats.acquired++;
            const connId = `conn-${Date.now()}-${Math.random()}`;
            
            this.activeConnections.set(connId, {
                connection: conn,
                acquiredAt: Date.now()
            });

            // Wrap connection to track release
            const wrappedConn = new Proxy(conn, {
                get: (target, prop) => {
                    if (prop === 'release' || prop === 'end') {
                        return () => {
                            this.activeConnections.delete(connId);
                            this.stats.released++;
                            return target[prop]();
                        };
                    }
                    return target[prop];
                }
            });

            return wrappedConn;
        } catch (error) {
            this.stats.errors++;
            console.error('Failed to get connection:', error.message);
            throw error;
        }
    }

    async query(sql, values) {
        const conn = await this.getConnection();
        try {
            const [rows] = await conn.execute(sql, values);
            conn.release();
            return rows;
        } catch (error) {
            conn.release();
            this.stats.errors++;
            throw error;
        }
    }

    async execute(sql, values) {
        const conn = await this.getConnection();
        try {
            const [result] = await conn.execute(sql, values);
            conn.release();
            return result;
        } catch (error) {
            conn.release();
            this.stats.errors++;
            throw error;
        }
    }

    async close() {
        // Close all active connections
        for (const [, connData] of this.activeConnections) {
            try {
                connData.connection.release();
            } catch (e) {
                // Already closed
            }
        }
        this.activeConnections.clear();

        // Close the pool
        if (this.pool) {
            await this.pool.end();
            console.log('✅ Connection pool closed');
        }
    }

    getStats() {
        return {
            ...this.stats,
            activeConnections: this.activeConnections.size,
            waitingInQueue: this.waitingQueue.length
        };
    }

    resetStats() {
        this.stats = {
            created: 0,
            acquired: 0,
            released: 0,
            errors: 0
        };
    }
}

module.exports = ConnectionPool;
