/**
 * Null/Undefined Check Utilities
 * Defensive programming helpers
 */

/**
 * Safely access nested properties
 * @param {Object} obj - Object to access
 * @param {string} path - Path like 'user.profile.name'
 * @param {*} [fallback=null] - Fallback value
 * @returns {*} - Value or fallback
 * @example
 * const name = safePath(user, 'profile.name', 'Unknown');
 */
function safePath(obj, path, fallback = null) {
    if (!obj || typeof path !== 'string') return fallback;

    try {
        const value = path.split('.').reduce((curr, prop) => {
            return curr?.[prop];
        }, obj);

        return value ?? fallback;
    } catch {
        return fallback;
    }
}

/**
 * Require a value to be truthy
 * @param {*} value - Value to check
 * @param {string} name - Variable name for error message
 * @returns {*} - The value if truthy
 * @throws {Error} - If value is falsy
 */
function require(value, name = 'value') {
    if (!value) {
        throw new Error(`Required value "${name}" is missing or falsy`);
    }
    return value;
}

/**
 * Require a value to not be null/undefined
 * @param {*} value - Value to check
 * @param {string} name - Variable name for error message
 * @returns {*} - The value if not null/undefined
 * @throws {Error} - If value is null/undefined
 */
function requireDefined(value, name = 'value') {
    if (value === null || value === undefined) {
        throw new Error(`Required value "${name}" is null or undefined`);
    }
    return value;
}

/**
 * Check if value is safe to use (not null/undefined)
 * @param {*} value - Value to check
 * @returns {boolean}
 */
function isSafe(value) {
    return value !== null && value !== undefined;
}

/**
 * Coalesce - return first non-null/undefined value
 * @param {...*} values - Values to check
 * @returns {*} - First safe value or null
 */
function coalesce(...values) {
    return values.find(v => isSafe(v)) ?? null;
}

/**
 * Safely call a method
 * @param {Object} obj - Object
 * @param {string} method - Method name
 * @param {...*} args - Arguments
 * @returns {*} - Result or null if method doesn't exist
 */
function safeCall(obj, method, ...args) {
    if (!obj || typeof obj[method] !== 'function') {
        return null;
    }
    try {
        return obj[method](...args);
    } catch {
        return null;
    }
}

/**
 * Safely get array element
 * @param {Array} arr - Array
 * @param {number} index - Index
 * @param {*} [fallback=null] - Fallback value
 * @returns {*}
 */
function safeArrayAccess(arr, index, fallback = null) {
    if (!Array.isArray(arr) || index < 0 || index >= arr.length) {
        return fallback;
    }
    return arr[index] ?? fallback;
}

/**
 * Safely get map value
 * @param {Map} map - Map object
 * @param {*} key - Key
 * @param {*} [fallback=null] - Fallback value
 * @returns {*}
 */
function safeMapAccess(map, key, fallback = null) {
    if (!(map instanceof Map) || !map.has(key)) {
        return fallback;
    }
    return map.get(key) ?? fallback;
}

/**
 * Ensure value is an array
 * @param {*} value - Value to check
 * @returns {Array} - Array or empty array
 */
function ensureArray(value) {
    if (Array.isArray(value)) return value;
    if (isSafe(value)) return [value];
    return [];
}

/**
 * Ensure value is an object
 * @param {*} value - Value to check
 * @returns {Object} - Object or empty object
 */
function ensureObject(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    return {};
}

/**
 * Ensure value is a string
 * @param {*} value - Value to check
 * @param {string} [fallback=''] - Fallback value
 * @returns {string}
 */
function ensureString(value, fallback = '') {
    if (typeof value === 'string') return value;
    if (isSafe(value)) return String(value);
    return fallback;
}

/**
 * Ensure value is a number
 * @param {*} value - Value to check
 * @param {number} [fallback=0] - Fallback value
 * @returns {number}
 */
function ensureNumber(value, fallback = 0) {
    const num = Number(value);
    return isNaN(num) ? fallback : num;
}

/**
 * Validate object structure
 * @param {Object} obj - Object to validate
 * @param {Object} schema - Schema like { name: 'string', age: 'number' }
 * @returns {boolean} - True if valid
 */
function validateShape(obj, schema) {
    if (!obj || typeof obj !== 'object') return false;

    for (const [key, expectedType] of Object.entries(schema)) {
        const value = obj[key];
        const actualType = typeof value;

        if (actualType !== expectedType) {
            return false;
        }
    }

    return true;
}

/**
 * Assert condition
 * @param {boolean} condition - Condition to check
 * @param {string} message - Error message
 * @throws {Error} - If condition is false
 */
function assert(condition, message = 'Assertion failed') {
    if (!condition) {
        throw new Error(message);
    }
}

module.exports = {
    safePath,
    require,
    requireDefined,
    isSafe,
    coalesce,
    safeCall,
    safeArrayAccess,
    safeMapAccess,
    ensureArray,
    ensureObject,
    ensureString,
    ensureNumber,
    validateShape,
    assert
};
