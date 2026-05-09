// Input sanitization utilities to prevent injection attacks and unwanted characters

const MAX_STRING_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 2000;

// Sanitize text input: remove special characters, trim whitespace
function sanitizeText(input) {
    if (typeof input !== 'string') return '';
    return input
        .trim()
        .slice(0, MAX_STRING_LENGTH)
        .replace(/[<>@#&*`]/g, ''); // Remove Discord formatting chars and potential injection vectors
}

// Sanitize user input for logging (prevent log injection)
function sanitizeForLog(input) {
    if (typeof input !== 'string') return '';
    return input
        .trim()
        .slice(0, MAX_STRING_LENGTH)
        .replace(/[\n\r\t]/g, ' '); // Replace newlines/tabs with spaces
}

// Sanitize for database queries (basic - use parameterized queries!)
function sanitizeForDB(input) {
    if (typeof input !== 'string') return '';
    return input
        .trim()
        .slice(0, MAX_STRING_LENGTH)
        .replace(/'/g, "\\'") // Escape single quotes (use parameterized queries instead!)
        .replace(/"/g, '\\"'); // Escape double quotes
}

// Sanitize descriptions/longer text
function sanitizeDescription(input) {
    if (typeof input !== 'string') return '';
    return input
        .trim()
        .slice(0, MAX_DESCRIPTION_LENGTH);
}

// Sanitize numeric input
function sanitizeNumber(input) {
    const num = parseInt(input, 10);
    return isNaN(num) ? 0 : num;
}

// Sanitize Discord IDs
function sanitizeDiscordId(input) {
    if (typeof input !== 'string') return null;
    const id = input.trim().replace(/\D/g, '');
    return id.length > 0 && /^\d{17,19}$/.test(id) ? id : null;
}

// Sanitize boolean values
function sanitizeBoolean(input) {
    if (typeof input === 'boolean') return input;
    return String(input).toLowerCase() === 'true';
}

// Sanitize URL
function sanitizeUrl(input) {
    if (typeof input !== 'string') return null;
    try {
        const url = new URL(input);
        return url.toString();
    } catch {
        return null;
    }
}

module.exports = {
    sanitizeText,
    sanitizeForLog,
    sanitizeForDB,
    sanitizeDescription,
    sanitizeNumber,
    sanitizeDiscordId,
    sanitizeBoolean,
    sanitizeUrl
};
