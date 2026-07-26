function initParallax() {
    jarallax(document.querySelectorAll('.has-parallax-feed .gh-card'), {
        speed: 0.8,
    });
}

(function () {
    if (!document.body.classList.contains('has-background-about')) return;

    const about = document.querySelector('.gh-about');
    if (!about) return;

    const image = about.querySelector('.gh-about-image');


})();

(function () {
    initParallax();
})();

(function () {
    const dismissBtn = document.getElementById('dismiss-cover');
    const content = document.getElementById('content');
    
    if (!dismissBtn || !content) return;

    dismissBtn.addEventListener('click', function () {
        content.scrollIntoView({ behavior: 'smooth' });
    });
})();

(function () {
    const toggle = document.querySelector('[data-toggle-comments]');
    if (!toggle) return;

    toggle.addEventListener('click', function () {
        document.body.classList.toggle('comments-opened');
    });
})();

(function () {
    const element = document.querySelector('.gh-article-excerpt');
    if (!element) return;

    let text = element.textContent;
    const emojiRE = /\p{EPres}|\p{ExtPict}/gu;

    const emojis = text.match(emojiRE);
    if (!emojis) return;

    emojis.forEach(function (emoji) {
        text = text.replace(emoji, `<span class="emoji">${emoji}</span>`);
    });

    element.innerHTML = text;
})();

(function () {
    pagination(true, initParallax);
})();

// Keep the CSS variable --announcement-height in sync with Ghost's native
// announcement bar height. The cover image uses this to stay at exactly 100dvh
// minus the bar so there's no excess at the bottom when the bar is visible.
(function () {
    var root = document.documentElement;

    function setAnnouncementHeight() {
        var bar = document.querySelector('.gh-announcement-bar');
        var h = (bar && bar.offsetHeight) ? bar.offsetHeight : 0;
        root.style.setProperty('--announcement-height', h + 'px');
    }

    function nodeContainsBar(node) {
        return node.nodeType === 1 && (
            node.classList.contains('gh-announcement-bar') ||
            (node.querySelector && node.querySelector('.gh-announcement-bar'))
        );
    }

    // Set on first load (bar may already be in the DOM).
    setAnnouncementHeight();

    // Re-measure on resize (bar wraps to two lines on narrow viewports).
    window.addEventListener('resize', setAnnouncementHeight, { passive: true });

    // Watch for the bar being injected (Ghost loads it async) OR dismissed.
    var observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            mutation.addedNodes.forEach(function (node) {
                if (nodeContainsBar(node)) {
                    // Bar just appeared — re-measure after it has painted.
                    requestAnimationFrame(setAnnouncementHeight);
                }
            });
            mutation.removedNodes.forEach(function (node) {
                if (nodeContainsBar(node)) {
                    setAnnouncementHeight();
                }
            });
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();

// Strip Ghost's inline min-height/padding from kg-header-card elements
// so our CSS rules (in screen.css) can control the layout instead.
(function () {
    function fixHeaderCards() {
        document.querySelectorAll('.kg-header-card').forEach(function (card) {
            // Strip Ghost's injected inline styles
            card.style.removeProperty('min-height');
            card.style.removeProperty('height');

            card.querySelectorAll('*').forEach(function (el) {
                el.style.removeProperty('min-height');
                el.style.removeProperty('height');

                if (
                    el.classList.contains('kg-header-card-content') ||
                    el.classList.contains('kg-header-card-text')
                ) {
                    el.style.removeProperty('padding');
                    el.style.removeProperty('padding-top');
                    el.style.removeProperty('padding-bottom');
                    el.style.removeProperty('padding-left');
                    el.style.removeProperty('padding-right');
                }
            });
        });
    }

    // Run immediately for cards already in the DOM
    fixHeaderCards();

    // Re-run after any dynamic content loads (e.g., pagination)
    document.addEventListener('ghost:card:loaded', fixHeaderCards);
})();

(function () {
    // Cover idle fade: hides overlay elements (header, about content, chevron)
    // after a period of inactivity, revealing only the cover image.
    if (!document.body.classList.contains('has-background-about')) return;

    const about = document.querySelector('.gh-about');
    if (!about) return;

    // Parse timeout from data attribute set by index.hbs / package.json config.
    // Format is "N seconds" (e.g. "15 seconds") or "Disabled".
    const rawTimeout = (about.dataset.idleTimeout || '').trim();
    if (!rawTimeout || rawTimeout === 'Disabled') return;

    const match = rawTimeout.match(/^(\d+)/);
    if (!match) return;
    const timeoutMs = parseInt(match[1], 10) * 1000;

    const FADE_CLASS = 'cover-ui-hidden';
    let idleTimer = null;
    let isHidden = false;
    let menuOpen = document.body.classList.contains('is-head-open');

    function hideUI() {
        if (window.scrollY > 50) return;

        isHidden = true;
        document.body.classList.add(FADE_CLASS);
    }

    function showUI() {
        if (isHidden) {
            isHidden = false;
            document.body.classList.remove(FADE_CLASS);
        }
        resetTimer();
    }

    function resetTimer() {
        clearTimeout(idleTimer);
        // Never schedule a fade-out while the burger menu is open.
        if (menuOpen) return;
        idleTimer = setTimeout(hideUI, timeoutMs);
    }

    const events = ['mousemove', 'mousedown', 'touchstart', 'touchmove', 'keydown', 'scroll', 'wheel'];
    events.forEach(function (evt) {
        window.addEventListener(evt, showUI, { passive: true });
    });

    // Keep the cover visible for as long as the burger menu is open, and
    // resume the normal idle countdown once it's closed.
    new MutationObserver(function () {
        const isOpen = document.body.classList.contains('is-head-open');
        if (isOpen === menuOpen) return;
        menuOpen = isOpen;

        if (menuOpen) {
            clearTimeout(idleTimer);
            if (isHidden) {
                isHidden = false;
                document.body.classList.remove(FADE_CLASS);
            }
        } else {
            resetTimer();
        }
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // Start the timer on load
    resetTimer();
})();

// Fix: clicking the "..." three-dots nav-more-toggle when the dropdown is already
// open should close it. Ghost's own dropdown.js only opens on click and closes
// on "outside click", so clicking the toggle again technically counts as the
// same element click and doesn't trigger the outside-click close handler.
// We intercept that case and fire a synthetic outside click ourselves.
(function () {
    document.addEventListener('click', function (e) {
        var toggle = e.target.closest('.nav-more-toggle');
        if (!toggle) return;

        // Check whether the dropdown is currently open using Ghost's own signals
        var isOpen = toggle.getAttribute('aria-expanded') === 'true' ||
                     document.body.classList.contains('is-dropdown-open') ||
                     (toggle.closest('li') && toggle.closest('li').classList.contains('is-dropdown-open'));

        if (isOpen) {
            // Prevent Ghost's handler from immediately reopening it
            e.stopPropagation();
            // Dispatch a synthetic click on the body to trigger Ghost's outside-click listener
            // We use setTimeout to ensure this runs after the current event bubbling finishes
            setTimeout(function() {
                document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            }, 0);
        }
    }, true); // useCapture=true so we run BEFORE Ghost's own listener
})();
