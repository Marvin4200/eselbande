    </main>
    </div>
    <footer class="footer">
        <p><?= t('footer.copyright') ?></p>
    </footer>

    <a href="https://discord.gg/zfzDHKcWDx" target="_blank" rel="noopener" title="<?= t('footer.help_title') ?>" style="
        position:fixed; bottom:1.5rem; right:1.5rem; z-index:9999;
        display:flex; align-items:center; gap:.6rem;
        background:linear-gradient(135deg,#5865f2,#7c83ff);
        color:#fff; text-decoration:none;
        padding:.7rem 1.1rem; border-radius:999px;
        font-size:.85rem; font-weight:700;
        box-shadow:0 4px 18px rgba(88,101,242,.45);
        transition:transform .18s, box-shadow .18s;
        " onmouseover="this.style.transform='scale(1.06)';this.style.boxShadow='0 6px 28px rgba(88,101,242,.65)'"
           onmouseout="this.style.transform='';this.style.boxShadow='0 4px 18px rgba(88,101,242,.45)'">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028z"/></svg>
        <?= t('footer.help') ?>
    </a>

    <script>var BASE_URL = '<?= BASE_URL ?>';</script>
    <script src="<?= BASE_URL ?>/assets/js/main.js"></script>

    <!-- Back-to-top button -->
    <button class="back-to-top" id="backToTop" aria-label="Nach oben scrollen" title="Nach oben">&#8593;</button>

    <script>
    (function () {
        /* ── Back-to-top ── */
        var btn = document.getElementById('backToTop');
        if (btn) {
            var scrollTarget = document.getElementById('main-content') || window;
            var onScroll = function () {
                var y = (scrollTarget === window) ? window.scrollY : scrollTarget.scrollTop;
                btn.classList.toggle('is-visible', y > 300);
            };
            scrollTarget.addEventListener('scroll', onScroll, { passive: true });
            btn.addEventListener('click', function () {
                if (scrollTarget === window) {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                    scrollTarget.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
        }

        /* ── Swipe-to-close sidebar (touch) ── */
        var sidebar = document.getElementById('dashboardSidebar');
        var overlay = document.getElementById('sidebarOverlay');
        var toggle  = document.getElementById('sidebarToggle');
        if (!sidebar) return;

        var touchStartX = 0;
        var touchStartY = 0;
        var SWIPE_THRESHOLD = 60;

        /* Swipe LEFT on open sidebar → close */
        sidebar.addEventListener('touchstart', function (e) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }, { passive: true });

        sidebar.addEventListener('touchend', function (e) {
            var dx = e.changedTouches[0].clientX - touchStartX;
            var dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
            if (dx < -SWIPE_THRESHOLD && dy < 60) {
                sidebar.classList.remove('is-open');
                if (overlay) overlay.classList.remove('active');
                if (toggle) toggle.setAttribute('aria-expanded', 'false');
            }
        }, { passive: true });

        /* Swipe RIGHT from left edge → open (anywhere on screen) */
        document.addEventListener('touchstart', function (e) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }, { passive: true });

        document.addEventListener('touchend', function (e) {
            var startedFromEdge = touchStartX < 20;
            var dx = e.changedTouches[0].clientX - touchStartX;
            var dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
            var isMobile = window.innerWidth <= 768;
            if (startedFromEdge && dx > SWIPE_THRESHOLD && dy < 60 && isMobile) {
                sidebar.classList.add('is-open');
                if (overlay) overlay.classList.add('active');
                if (toggle) toggle.setAttribute('aria-expanded', 'true');
            }
        }, { passive: true });
    })();
    </script>
</body>
</html>
