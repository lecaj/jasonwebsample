/* ==========================================================================
   ELMA — motion behaviour

   Ports the beUI motion set (https://beui.dev/components/motion) to vanilla
   JS. beUI is React + Motion; the curves and constants live in motion.css,
   and this file supplies the parts CSS cannot do on its own: viewport
   detection, cursor tracking, word splitting, and the toast queue.

   Loads after site.js. It attaches nothing that site.js depends on, and
   site.js degrades cleanly if this file is absent.
   ========================================================================== */
(function () {
  'use strict';

  var ELMA = (window.ELMA = window.ELMA || {});
  var motion = {};

  // Old webviews and non-browser DOMs have no matchMedia. Treat that as
  // "motion allowed, no fine pointer" — the same answer a phone gives.
  function mq(query) {
    return window.matchMedia ? window.matchMedia(query) : { matches: false };
  }
  var reduceQuery = mq('(prefers-reduced-motion: reduce)');
  var pointerQuery = mq('(hover: hover) and (pointer: fine)');
  function reduced() { return reduceQuery.matches; }
  function finePointer() { return pointerQuery.matches; }

  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  /* ======================================================================
     1. SCROLL REVEAL
     beUI ScrollReveal — 30% viewport threshold, fires once.

     A flat 0.3 ratio never resolves for elements taller than a third of the
     viewport, so the observer also accepts "top edge crossed 85% of the
     fold", which is what the 30% rule is actually trying to express.
     ====================================================================== */

  var REVEAL_GROUPS = [
    { sel: '.section-head' },
    { sel: '.page-head h1' },
    { sel: '.page-head p' },
    { sel: '.hero-eyebrow' },
    { sel: '.hero p' },
    { sel: '.hero-actions' },
    { sel: '.hero-visual' },
    { sel: '.pillars > .pillar', stagger: 80 },
    { sel: '.product-grid > .product-card', stagger: 70 },
    { sel: '.ritual-copy' },
    { sel: '.steps > .step', stagger: 70 },
    { sel: '.dark-eyebrow' },
    { sel: '.dark-stage' },
    { sel: '.dark-caption' },
    { sel: '.split-copy' },
    { sel: '.split-visual' },
    { sel: '.stat-row > .stat', stagger: 60 },
    { sel: '.accordion > .acc-item', stagger: 50 },
    { sel: '.cta-section h2' },
    // .form-msg is a live region — fading it in when its text changes would
    // fight the announcement, so it is deliberately excluded.
    { sel: '.cta-section > p:not(.form-msg)' },
    { sel: '.cta-section .email-form' },
    { sel: '.cta-section .btn-primary' },
    { sel: '.form-card' },
    { sel: '.contact-aside' },
    { sel: '.pdp-block', stagger: 60 },
    { sel: '.confirmation' }
  ];

  var STAGGER_CAP = 6; // past the sixth sibling the wait reads as a bug

  var revealObserver = null;
  function observer() {
    if (revealObserver || !('IntersectionObserver' in window)) return revealObserver;
    revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var fold = window.innerHeight || document.documentElement.clientHeight;
        var crossed = entry.boundingClientRect.top < fold * 0.85;
        if (entry.intersectionRatio >= 0.3 || (entry.isIntersecting && crossed)) {
          show(entry.target);
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: [0, 0.3], rootMargin: '0px 0px -8% 0px' });
    return revealObserver;
  }

  function show(el) {
    el.setAttribute('data-reveal', 'in');
    // will-change was only ever needed for the pending->in transition.
    window.setTimeout(function () { el.style.willChange = ''; }, 1000);
  }

  function armReveals(root) {
    var io = observer();

    REVEAL_GROUPS.forEach(function (group) {
      var seen = new Map();

      $$(group.sel, root).forEach(function (el) {
        if (el.hasAttribute('data-reveal') || el.hasAttribute('data-no-reveal')) return;

        if (group.stagger) {
          var index = seen.get(el.parentNode) || 0;
          seen.set(el.parentNode, index + 1);
          var delay = Math.min(index, STAGGER_CAP) * group.stagger;
          if (delay) el.style.setProperty('--reveal-delay', delay + 'ms');
        }

        el.setAttribute('data-reveal', 'pending');
        // No observer support, or motion is off: land in the final state
        // immediately rather than leaving content invisible.
        if (!io || reduced()) { show(el); return; }
        io.observe(el);
      });
    });
  }

  /* ======================================================================
     2. TEXT REVEAL
     beUI TextReveal — 0.09s per word, blur 12px, y 40%, spring {140,26,1.2}.
     ====================================================================== */

  var WORD_STAGGER = 90;

  function splitWords(node, counter) {
    // Walks a snapshot of childNodes so that replacing text nodes mid-loop
    // cannot make the iteration skip siblings. Element children are recursed
    // into, which keeps inline markup like <em> intact.
    Array.prototype.slice.call(node.childNodes).forEach(function (child) {
      if (child.nodeType === 3) {
        var parts = child.nodeValue.split(/(\s+)/).filter(function (s) { return s.length; });
        if (!parts.length) return;
        var frag = document.createDocumentFragment();
        parts.forEach(function (part) {
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          var span = document.createElement('span');
          span.className = 'tr-word';
          span.textContent = part;
          span.style.setProperty('--tr-delay', (counter.i * WORD_STAGGER) + 'ms');
          counter.i++;
          frag.appendChild(span);
        });
        node.replaceChild(frag, child);
      } else if (child.nodeType === 1) {
        splitWords(child, counter);
      }
    });
  }

  function initTextReveal() {
    var target = document.querySelector('.hero h1');
    if (!target || target.classList.contains('text-reveal')) return;

    target.classList.add('text-reveal');

    if (reduced()) { target.setAttribute('data-reveal', 'in'); return; }

    splitWords(target, { i: 0 });
    target.setAttribute('data-reveal', 'pending');
    // Above the fold on load — no observer needed, just wait a frame so the
    // initial state is painted before the transition starts.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { target.setAttribute('data-reveal', 'in'); });
    });
  }

  /* ======================================================================
     3. TILT
     beUI TiltCard — perspective 1000px, SPRING_MOUSE, cursor-tracked glare.
     Skipped on touch (phantom hover) and under reduced motion, per beUI.
     ====================================================================== */

  var TILT_SELECTOR = '.product-media, .pdp-media';

  function armTilt(root) {
    if (!finePointer() || reduced()) return;

    $$(TILT_SELECTOR, root).forEach(function (el) {
      if (el.getAttribute('data-tilt-bound') === 'true') return;
      el.setAttribute('data-tilt-bound', 'true');

      var max = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--tilt-max')
      ) || 6;

      el.addEventListener('pointermove', function (event) {
        if (event.pointerType !== 'mouse') return;
        var rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        var px = (event.clientX - rect.left) / rect.width;
        var py = (event.clientY - rect.top) / rect.height;

        el.setAttribute('data-tilting', 'true');
        // Cursor above centre tips the top of the tile toward the viewer,
        // so rotateX takes the inverted Y offset.
        el.style.setProperty('--tilt-x', (-(py - 0.5) * 2 * max).toFixed(2) + 'deg');
        el.style.setProperty('--tilt-y', ((px - 0.5) * 2 * max).toFixed(2) + 'deg');
        el.style.setProperty('--glare-x', (px * 100).toFixed(1) + '%');
        el.style.setProperty('--glare-y', (py * 100).toFixed(1) + '%');
      });

      function rest() {
        el.setAttribute('data-tilting', 'false');
        el.style.setProperty('--tilt-x', '0deg');
        el.style.setProperty('--tilt-y', '0deg');
      }
      el.addEventListener('pointerleave', rest);
      el.addEventListener('pointercancel', rest);
      // A tile can be dragged/clicked into a navigation; do not leave it tilted.
      el.addEventListener('blur', rest, true);
    });
  }

  /* ======================================================================
     4. SCROLL PROGRESS + NAV STATE
     beUI ScrollProgress — 2px bar, spring {120, 30, 0.6}.
     ====================================================================== */

  function initScrollProgress() {
    var nav = document.querySelector('nav.site-nav');
    if (!nav || nav.querySelector('.scroll-progress')) return;

    var bar = document.createElement('div');
    bar.className = 'scroll-progress';
    bar.setAttribute('aria-hidden', 'true');
    nav.appendChild(bar);

    var ticking = false;
    function update() {
      ticking = false;
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      bar.style.setProperty('--progress', progress.toFixed(4));
      nav.setAttribute('data-scrolled', window.scrollY > 8 ? 'true' : 'false');
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();
  }

  /* ======================================================================
     5. ACCORDION
     beUI BouncyAccordion timings, but height is done with the grid
     0fr -> 1fr technique in CSS. The only thing JS owes it is the inner
     wrapper that gets clipped, plus mirroring open state onto the row.
     ====================================================================== */

  function armAccordion(root) {
    $$('.acc-panel', root).forEach(function (panel) {
      if (panel.querySelector(':scope > .acc-panel-inner')) return;
      var inner = document.createElement('div');
      inner.className = 'acc-panel-inner';
      while (panel.firstChild) inner.appendChild(panel.firstChild);
      panel.appendChild(inner);
      if (!panel.getAttribute('data-open')) panel.setAttribute('data-open', 'false');
    });

    if (document.body.getAttribute('data-acc-bound') === 'true') return;
    document.body.setAttribute('data-acc-bound', 'true');

    // Delegated, and deliberately reading state rather than toggling it:
    // site.js owns aria-expanded, this only mirrors it onto .acc-item so the
    // row background can animate.
    document.addEventListener('click', function (event) {
      var trigger = event.target.closest('.acc-trigger');
      if (!trigger) return;
      var item = trigger.closest('.acc-item');
      if (item) {
        item.setAttribute('data-open', trigger.getAttribute('aria-expanded') === 'true'
          ? 'true' : 'false');
      }
    });
  }

  /* ======================================================================
     6. TOAST STACK
     beUI AnimatedToastStack — enter y 22px/scale 0.96/blur 10px, exit 0.18s,
     max 4 visible, 4200ms auto-dismiss.
     ====================================================================== */

  var MAX_TOASTS = 4;
  var TOAST_LIFE = 4200;
  var TOAST_EXIT = 180;

  function toastStack() {
    var stack = document.querySelector('.toast-stack');
    if (stack) return stack;
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
    // Announce only what changed; re-reading the whole stack on every add is
    // noise for a screen reader.
    stack.setAttribute('aria-atomic', 'false');
    document.body.appendChild(stack);
    return stack;
  }

  function restack(stack) {
    var toasts = $$('.toast:not([data-state="out"])', stack);
    // Newest sits at the bottom and is fully lit; older ones recede.
    toasts.slice().reverse().forEach(function (el, depth) {
      el.setAttribute('data-depth', String(Math.min(depth, 3)));
    });
  }

  function dismiss(el) {
    if (!el || el.getAttribute('data-state') === 'out') return;
    var stack = el.parentNode;
    window.clearTimeout(Number(el.getAttribute('data-timer')));
    el.setAttribute('data-state', 'out');
    window.setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
      if (stack) restack(stack);
    }, TOAST_EXIT);
  }

  function toast(message) {
    var stack = toastStack();

    var live = $$('.toast:not([data-state="out"])', stack);
    while (live.length >= MAX_TOASTS) dismiss(live.shift());

    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    el.setAttribute('data-state', 'pending');
    stack.appendChild(el);

    var timer = window.setTimeout(function () { dismiss(el); }, TOAST_LIFE);
    el.setAttribute('data-timer', String(timer));
    el.addEventListener('click', function () { dismiss(el); });

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        el.setAttribute('data-state', 'in');
        restack(stack);
      });
    });
  }

  /* ======================================================================
     7. NUMBER ANIMATION
     beUI Number — counts to the new value instead of snapping. Only worth it
     where the number is the point: cart and order totals.
     ====================================================================== */

  var NUMBER_DUR = 700;
  var lastNumbers = new Map();

  function money(n) { return '$' + (Math.round(n * 100) / 100).toFixed(2); }

  function countTo(el, key, to, format) {
    var from = lastNumbers.has(key) ? lastNumbers.get(key) : to;
    lastNumbers.set(key, to);

    if (reduced() || from === to) { el.textContent = format(to); return; }

    var start = null;
    function frame(now) {
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / NUMBER_DUR);
      // Quartic ease-out — the closest cheap match to beUI's EASE_OUT bezier.
      var eased = 1 - Math.pow(1 - t, 4);
      el.textContent = format(from + (to - from) * eased);
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function armNumbers(root) {
    $$('[data-number]', root).forEach(function (el) {
      var key = el.getAttribute('data-number');
      var to = parseFloat(el.getAttribute('data-number-value'));
      if (isNaN(to)) return;
      countTo(el, key, to, el.getAttribute('data-number-format') === 'money'
        ? money
        : function (n) { return String(Math.round(n)); });
    });
  }

  /* ======================================================================
     8. CART COUNT POP
     beUI SPRING_SWAP, the curve they use for content that changes under you.
     ====================================================================== */

  function initCartBump() {
    var previous = null;
    document.addEventListener('elma:cartchange', function () {
      $$('[data-cart-count]').forEach(function (el) {
        var next = el.textContent;
        if (previous !== null && next === previous) return;
        el.setAttribute('data-bump', 'true');
        window.setTimeout(function () { el.setAttribute('data-bump', 'false'); }, 140);
        previous = next;
      });
    });
  }

  /* ======================================================================
     BOOT
     ====================================================================== */

  // Called by site.js after any innerHTML render so injected nodes get wired.
  function scan(root) {
    armReveals(root || document);
    armTilt(root || document);
    armAccordion(root || document);
    armNumbers(root || document);
  }

  motion.scan = scan;
  motion.toast = toast;
  motion.dismissToasts = function () {
    $$('.toast', document).forEach(dismiss);
  };
  motion.reduced = reduced;
  ELMA.motion = motion;

  function boot() {
    initTextReveal();
    initScrollProgress();
    initCartBump();
    scan(document);

    // Turning reduced-motion on mid-session should take effect without a
    // reload, and must not strand anything mid-reveal.
    var onPref = function () {
      if (!reduced()) return;
      $$('[data-reveal="pending"]').forEach(show);
    };
    if (reduceQuery.addEventListener) reduceQuery.addEventListener('change', onPref);
    else if (reduceQuery.addListener) reduceQuery.addListener(onPref);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
