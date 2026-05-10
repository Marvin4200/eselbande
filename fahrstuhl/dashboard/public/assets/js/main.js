// Fahrstuhl Dashboard - Main JavaScript
console.log('✓ Fahrstuhl Dashboard loaded');

// ── Toast notifications ──────────────────────────────────────────────────────
(function () {
    const container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);

    window.showToast = function (message, type = 'info', duration = 3500) {
        const toast = document.createElement('div');
        const icons = { success: '✅', error: '❌', info: 'ℹ️' };
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('toast-out');
            toast.addEventListener('animationend', () => toast.remove(), { once: true });
        }, duration);
    };
})();

// ── Count-up animation ───────────────────────────────────────────────────────
window.animateCountUp = function (el, target, duration = 900) {
    const start = performance.now();
    const from = 0;
    const isFloat = String(target).includes('.');
    function step(now) {
        const progress = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        const current = from + (target - from) * ease;
        el.textContent = isFloat ? current.toFixed(1) : Math.round(current).toLocaleString();
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
};

// ── Auto count-up on visible stat values ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const el = entry.target;
            const raw = el.dataset.countup;
            if (raw === undefined) return;
            const val = parseFloat(raw.replace(/,/g, ''));
            if (!isNaN(val)) animateCountUp(el, val, 800);
            observer.unobserve(el);
        });
    }, { threshold: 0.2 });

    document.querySelectorAll('[data-countup]').forEach(el => observer.observe(el));
});

// ── Live uptime ticker ────────────────────────────────────────────────────────
window.startLiveUptime = function (elId, startMs) {
    const el = document.getElementById(elId);
    if (!el) return;
    const origin = Date.now() - startMs;
    function render() {
        const ms = Date.now() - origin;
        const s = Math.floor(ms / 1000);
        const d = Math.floor(s / 86400);
        const h = Math.floor((s % 86400) / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        el.textContent = (d ? d + 'd ' : '') + String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0');
    }
    render();
    setInterval(render, 1000);
};

// ── AJAX form submit helper ───────────────────────────────────────────────────
// Usage: submitFormAjax(formEl, { onSuccess, onError })
window.submitFormAjax = function (formEl, options = {}) {
    if (!formEl) return;
    const data = new FormData(formEl);
    const url  = formEl.action || location.href;

    // Read CSRF token from FormData (hidden input in form) with DOM fallback
    const csrfToken = data.get('csrf_token') ||
        (document.querySelector('input[name="csrf_token"]') || {}).value || '';
    const reqHeaders = { 'X-Requested-With': 'XMLHttpRequest' };
    if (csrfToken) reqHeaders['X-CSRF-Token'] = csrfToken;

    return fetch(url, {
        method: 'POST',
        headers: reqHeaders,
        body: data,
    })
    .then(r => r.json())
    .then(json => {
        if (typeof options.onSuccess === 'function' && json.success) {
            options.onSuccess(json);
        } else if (typeof options.onError === 'function' && !json.success) {
            options.onError(json);
        }
        if (options.toast !== false) {
            const msg  = json.message || (json.success ? 'Gespeichert.' : 'Fehler.');
            const type = json.success ? (json.messageType || 'success') : 'error';
            showToast(msg, type);
        }
        return json;
    })
    .catch(err => {
        if (typeof options.onError === 'function') options.onError({ success: false, message: err.message });
        if (options.toast !== false) showToast('Netzwerkfehler.', 'error');
        throw err;
    });
};

// ── Button loading state helper ────────────────────────────────────────────────
// Usage: const restore = setButtonLoading(btn, 'Speichern…');
//        ... async work ...
//        restore();
window.setButtonLoading = function (btn, loadingText = '…') {
    if (!btn) return () => {};
    const orig = btn.textContent;
    const wasDisabled = btn.disabled;
    btn.disabled = true;
    btn.textContent = loadingText;
    return function restore() {
        btn.disabled = wasDisabled;
        btn.textContent = orig;
    };
};

// ── Auto-refresh countdown ────────────────────────────────────────────────────
window.startAutoRefresh = function (seconds, badgeId) {
    const badge = document.getElementById(badgeId);
    let remaining = seconds;
    function tick() {
        if (badge) badge.textContent = `↻ ${remaining}s`;
        if (remaining <= 0) {
            if (badge) { badge.classList.add('refreshing'); badge.textContent = '↻ Refreshing…'; }
            setTimeout(() => location.reload(), 200);
            return;
        }
        remaining--;
        setTimeout(tick, 1000);
    }
    tick();
};
