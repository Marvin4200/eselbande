// Mask sensitive information in logs

// Tokens have format: 'token.payload.signature' (3 parts separated by dots)
function maskToken(token) {
    if (typeof token !== 'string' || token.length === 0) return '[MASKED]';
    const parts = token.split('.');
    if (parts.length !== 3) return '[MASKED]';
    
    // Show first 5 and last 3 chars of the token part, hide the rest
    const tokenPart = parts[0];
    if (tokenPart.length <= 8) return '[MASKED]';
    return `${tokenPart.slice(0, 5)}...${tokenPart.slice(-3)}`;
}

// Mask database passwords
function maskPassword(password) {
    if (typeof password !== 'string' || password.length === 0) return '[MASKED]';
    if (password.length <= 3) return '[MASKED]';
    return `${password.slice(0, 2)}${'*'.repeat(Math.min(10, password.length - 5))}${password.slice(-2)}`;
}

// Mask JWT tokens
function maskJwt(jwt) {
    if (typeof jwt !== 'string') return '[MASKED]';
    const parts = jwt.split('.');
    if (parts.length !== 3) return '[MASKED]';
    
    return parts.map((part, i) => {
        if (part.length <= 5) return '[MASKED]';
        return `${part.slice(0, 3)}...${part.slice(-2)}`;
    }).join('.');
}

// Mask OAuth tokens
function maskOAuthToken(token) {
    if (typeof token !== 'string' || token.length === 0) return '[MASKED]';
    if (token.length <= 8) return '[MASKED]';
    return `${token.slice(0, 4)}${'*'.repeat(Math.min(10, token.length - 8))}${token.slice(-4)}`;
}

// Mask email addresses
function maskEmail(email) {
    if (typeof email !== 'string' || !email.includes('@')) return '[MASKED]';
    const [name, domain] = email.split('@');
    if (name.length <= 2) return `*@${domain}`;
    return `${name[0]}${'*'.repeat(name.length - 2)}${name[name.length - 1]}@${domain}`;
}

// Mask IP addresses
function maskIpAddress(ip) {
    if (typeof ip !== 'string') return '[MASKED]';
    const parts = ip.split('.');
    if (parts.length !== 4) return '[MASKED]';
    return `${parts[0]}.${parts[1]}.*.${parts[3]}`;
}

// Generic sensitive data masking - check if string looks like sensitive data
function maskSensitiveData(str) {
    if (typeof str !== 'string') return str;
    
    // Check for common sensitive patterns
    if (str.includes('secret') || str.includes('password') || str.includes('token')) return '[MASKED]';
    if (/^[A-Za-z0-9]{20,}$/.test(str)) return '[MASKED_TOKEN]'; // Likely a token
    if (str.includes('@')) return maskEmail(str); // Likely an email
    
    return str;
}

// Mask an entire object recursively, looking for sensitive keys
function maskObject(obj, depth = 0) {
    if (depth > 10) return obj; // Prevent infinite recursion
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    
    const sensitiveKeys = ['token', 'password', 'secret', 'apikey', 'privatekey', 'jwt'];
    
    if (Array.isArray(obj)) {
        return obj.map(item => maskObject(item, depth + 1));
    }
    
    const masked = {};
    for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        
        if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
            masked[key] = '[MASKED]';
        } else if (typeof value === 'object') {
            masked[key] = maskObject(value, depth + 1);
        } else {
            masked[key] = value;
        }
    }
    
    return masked;
}

module.exports = {
    maskToken,
    maskPassword,
    maskJwt,
    maskOAuthToken,
    maskEmail,
    maskIpAddress,
    maskSensitiveData,
    maskObject
};
