/**
 * Format milliseconds into a human-readable duration string.
 * @param {number} ms
 * @returns {string} e.g. "3:45" or "1:23:45"
 */
function formatDuration(ms) {
    if (!ms || ms === Infinity) return 'LIVE';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) {
        return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    }
    return `${m}:${String(s % 60).padStart(2, '0')}`;
}

module.exports = { formatDuration };
