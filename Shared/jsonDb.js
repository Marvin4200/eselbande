const fs = require('fs');
const path = require('path');

/**
 * A simple JSON-based database that mimics the Enmap API.
 * This avoids the need for native build tools like better-sqlite3.
 */
class JsonDb {
    constructor(options = {}) {
        this.name = options.name || 'database';
        this.dataDir = options.dataDir || './dbs';
        this.filePath = path.join(this.dataDir, `${this.name}.json`);
        this.data = {};
        
        this._init();
    }

    _init() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
        if (fs.existsSync(this.filePath)) {
            try {
                const raw = fs.readFileSync(this.filePath, 'utf8');
                this.data = JSON.parse(raw);
            } catch (e) {
                console.error(`Error loading database ${this.name}:`, e);
                this.data = {};
            }
        } else {
            this._save();
        }
    }

    _save() {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
        } catch (e) {
            console.error(`Error saving database ${this.name}:`, e);
        }
    }

    set(key, value) {
        this.data[key] = value;
        this._save();
        return this;
    }

    get(key, path) {
        let val = this.data[key];
        if (path && val) {
            return val[path];
        }
        return val;
    }

    has(key) {
        return Object.prototype.hasOwnProperty.call(this.data, key);
    }

    ensure(key, defaultValue) {
        if (!this.has(key)) {
            this.set(key, defaultValue);
            return defaultValue;
        }
        return this.get(key);
    }

    push(key, value) {
        if (!this.has(key)) {
            this.set(key, [value]);
        } else if (Array.isArray(this.data[key])) {
            this.data[key].push(value);
            this._save();
        }
        return this;
    }

    delete(key) {
        delete this.data[key];
        this._save();
        return this;
    }

    get size() {
        return Object.keys(this.data).length;
    }

    filter(fn) {
        const results = {};
        for (const [key, val] of Object.entries(this.data)) {
            if (fn(val, key)) {
                results[key] = val;
            }
        }
        return results;
    }
}

module.exports = JsonDb;
