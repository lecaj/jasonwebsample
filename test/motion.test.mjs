/*
 * ELMA motion layer — behaviour tests.
 *
 *   node test/motion.test.mjs
 *
 * Covers assets/js/motion.js and the token contract in assets/css/motion.css.
 * jsdom has no layout, so nothing here asserts that an animation *looks*
 * right; what it does assert is that every animated surface ends in the
 * correct final state, that content is never left hidden behind a transition
 * that cannot run, and that the CSS tokens the JS depends on exist.
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'fs';
import path from 'path';

const SITE = process.env.SITE || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const read = f => readFileSync(path.join(SITE, f), 'utf8');

/* A controllable IntersectionObserver: nothing fires until the test says so. */
function fakeIO(w) {
  const instances = [];
  w.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; this.targets = new Set(); instances.push(this); }
    observe(el) { this.targets.add(el); }
    unobserve(el) { this.targets.delete(el); }
    disconnect() { this.targets.clear(); }
  };
  return {
    /* Report every observed element as fully in view. */
    triggerAll() {
      instances.forEach(io => {
        const entries = [...io.targets].map(target => ({
          target, isIntersecting: true, intersectionRatio: 1,
          boundingClientRect: { top: 0 },
        }));
        if (entries.length) io.cb(entries, io);
      });
    },
    observedCount: () => instances.reduce((n, io) => n + io.targets.size, 0),
    // Per-element rather than a global count, so an independent, deliberately
    // persistent observer (the ASHA-20 scrub fallback watches #ritual/#range
    // for as long as the page can scroll) doesn't read as a leaked one-shot
    // reveal observation.
    observes: el => instances.some(io => io.targets.has(el)),
  };
}

const store = {};
async function load(page, opts = {}) {
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => errs.push(e.message));
  vc.on('error', (...a) => errs.push(a.join(' ')));

  const dom = new JSDOM(read(page), {
    runScripts: 'outside-only', url: 'http://localhost:8000/' + page,
    virtualConsole: vc, pretendToBeVisual: true,
  });
  const w = dom.window;

  Object.defineProperty(w, 'localStorage', { value: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  }, configurable: true });

  Object.defineProperty(w, 'matchMedia', { value: q => ({
    media: q,
    matches: /reduce/.test(q) ? !!opts.reduce
      : (/hover: hover|pointer: fine/.test(q) ? opts.pointer !== false : false),
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  }), configurable: true });

  const io = opts.io ? fakeIO(w) : null;

  if (w.document.readyState === 'loading') {
    await new Promise(res => w.document.addEventListener('DOMContentLoaded', res));
  }
  w.eval(read('assets/js/products.js'));
  w.eval(read('assets/js/site.js'));
  w.eval(read('assets/js/motion.js'));
  for (const s of w.document.querySelectorAll('body script:not([src])')) w.eval(s.textContent);
  return { w, d: w.document, errs, io };
}

const frames = (w, n = 3) => new Promise(res => {
  let i = 0;
  const step = () => (++i >= n ? res() : w.requestAnimationFrame(step));
  w.requestAnimationFrame(step);
});
const wait = ms => new Promise(res => setTimeout(res, ms));
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));

/* ====================================================================== */
console.log('\n— motion: loading —');
{
  for (const page of ['index.html', 'shop.html', 'product.html', 'cart.html',
                      'checkout.html', 'faq.html', 'about.html', 'contact.html']) {
    const { w, errs } = await load(page);
    ok(errs.length === 0 && !!w.ELMA.motion, page + ': motion layer boots clean (' + errs.join('; ') + ')');
  }
  const { w } = await load('index.html');
  ok(typeof w.ELMA.motion.scan === 'function' && typeof w.ELMA.motion.toast === 'function',
    'exposes scan() and toast()');
}

console.log('\n— motion: scroll reveal —');
{
  const { d, io } = await load('index.html', { io: true });
  const heads = [...d.querySelectorAll('.section-head')];
  ok(heads.length > 0 && heads.every(el => el.getAttribute('data-reveal') === 'pending'),
    'section heads start pending');
  ok(io.observedCount() > 0, 'pending elements are handed to the observer');

  io.triggerAll();
  ok(heads.every(el => el.getAttribute('data-reveal') === 'in'), 'reveal on intersection');
  ok(heads.every(el => !io.observes(el)), 'each element is unobserved once revealed (fires once)');
}
{
  // The regression that matters most: if the observer is unavailable, content
  // must land visible rather than sitting at opacity 0 forever.
  const { w, d } = await load('index.html');
  const revealed = [...d.querySelectorAll('[data-reveal]')];
  ok(revealed.length > 0, 'reveal targets found without IntersectionObserver');
  await frames(w, 4); // the hero headline reveals on a rAF rather than on intersection
  const stuck = revealed.filter(el => el.getAttribute('data-reveal') !== 'in');
  ok(stuck.length === 0,
    'no IntersectionObserver: everything falls back to visible ('
    + stuck.map(el => el.className || el.tagName).join(',') + ')');
}
{
  const { d } = await load('index.html', { io: true, reduce: true });
  const revealed = [...d.querySelectorAll('[data-reveal]')];
  ok(revealed.length > 0 && revealed.every(el => el.getAttribute('data-reveal') === 'in'),
    'reduced motion: content is shown immediately, not animated in');
}
{
  const { d } = await load('index.html', { io: true });
  const pillars = [...d.querySelectorAll('.pillars > .pillar')];
  const delays = pillars.map(el => el.style.getPropertyValue('--reveal-delay'));
  ok(delays[0] === '' && delays[1] === '80ms' && delays[2] === '160ms',
    'siblings stagger by 80ms (' + delays.join(',') + ')');

  const stats = [...d.querySelectorAll('.stat-row > .stat')];
  ok(stats.map(el => el.style.getPropertyValue('--reveal-delay')).join(',') === ',60ms,120ms,180ms',
    'stat row staggers by 60ms');
}
{
  // Stagger must plateau, or the last card in a long grid waits absurdly long.
  const { d } = await load('shop.html', { io: true });
  const cards = [...d.querySelectorAll('.product-grid > .product-card')];
  const delays = cards.map(el => parseInt(el.style.getPropertyValue('--reveal-delay') || '0', 10));
  ok(cards.length > 6, 'shop renders more than the stagger cap (' + cards.length + ' cards)');
  ok(Math.max(...delays) === 6 * 70, 'stagger caps at 6 steps (max ' + Math.max(...delays) + 'ms)');
}

console.log('\n— motion: hero text reveal —');
{
  const { w, d } = await load('index.html', { io: true });
  const h1 = d.querySelector('.hero h1');
  const words = [...h1.querySelectorAll('.tr-word')];
  ok(h1.classList.contains('text-reveal'), 'hero headline marked as text-reveal');
  ok(words.length === 8, 'headline split into 8 words (got ' + words.length + ')');
  ok(h1.textContent === 'Skin care for the morning you actually have.',
    'split preserves the exact sentence');
  ok(!!h1.querySelector('em .tr-word'), 'inline <em> markup survives the split');
  ok(words.map(el => el.style.getPropertyValue('--tr-delay')).join(',')
    === '0ms,90ms,180ms,270ms,360ms,450ms,540ms,630ms',
    'word delays step by 90ms and keep counting across the <em>');

  await frames(w, 4);
  ok(h1.getAttribute('data-reveal') === 'in', 'headline transitions in on load');
}
{
  const { d } = await load('index.html', { io: true, reduce: true });
  const h1 = d.querySelector('.hero h1');
  ok(h1.querySelectorAll('.tr-word').length === 0, 'reduced motion: headline is not split');
  ok(h1.getAttribute('data-reveal') === 'in', 'reduced motion: headline shown immediately');
  ok(h1.textContent.trim() === 'Skin care for the morning you actually have.',
    'reduced motion: headline text intact');
}

console.log('\n— motion: toast stack —');
{
  const { w, d } = await load('index.html');
  w.ELMA.motion.toast('one');
  const stack = d.querySelector('.toast-stack');
  ok(!!stack, 'stack container created on first toast');
  ok(stack.getAttribute('role') === 'status' && stack.getAttribute('aria-live') === 'polite',
    'stack is announced politely');
  ok(stack.getAttribute('aria-atomic') === 'false', 'only the new toast is announced, not the whole stack');

  ['two', 'three', 'four', 'five', 'six'].forEach(m => w.ELMA.motion.toast(m));
  const live = stack.querySelectorAll('.toast:not([data-state="out"])');
  ok(live.length === 4, 'stack caps at 4 live toasts (got ' + live.length + ')');
  ok([...live].map(t => t.textContent).join(',') === 'three,four,five,six',
    'oldest toasts are the ones dropped');

  await frames(w, 4);
  ok([...live].every(t => t.getAttribute('data-state') === 'in'), 'toasts transition to their in state');
  ok(live[3].getAttribute('data-depth') === '0' && live[0].getAttribute('data-depth') === '3',
    'newest toast sits at depth 0, oldest recedes');

  click(w, live[3]);
  ok(live[3].getAttribute('data-state') === 'out', 'clicking a toast dismisses it');
  await wait(240);
  ok(!stack.contains(live[3]), 'dismissed toast is removed from the DOM');
}
{
  // site.js must route through the stack rather than its own single toast.
  const { w, d } = await load('index.html');
  click(w, d.querySelector('[data-add-to-cart]'));
  const toasts = d.querySelectorAll('.toast-stack .toast');
  ok(toasts.length === 1, 'add-to-cart raises exactly one toast through the stack');
  ok(/added/.test(toasts[0].textContent), 'toast carries the add-to-cart message');
  ok(!d.querySelector('#toast'), 'the old single-toast fallback element is not used');
}

console.log('\n— motion: accordion —');
{
  const { w, d } = await load('faq.html', { io: true });
  const panels = [...d.querySelectorAll('.acc-panel')];
  ok(panels.length === 7, 'all 7 FAQ panels present');
  ok(panels.every(p => p.children.length === 1 && p.firstElementChild.classList.contains('acc-panel-inner')),
    'each panel gets exactly one clipping wrapper');
  ok(panels.every(p => p.getAttribute('data-open') === 'false'), 'panels start closed');
  ok(/thinnest to thickest/i.test(panels[0].textContent), 'wrapping preserves panel copy');
  ok(panels[0].querySelectorAll('p').length === 2, 'wrapping preserves child structure');

  const trigger = d.querySelector('.acc-trigger');
  const item = trigger.closest('.acc-item');
  click(w, trigger);
  ok(trigger.getAttribute('aria-expanded') === 'true', 'trigger reports expanded');
  ok(panels[0].getAttribute('data-open') === 'true', 'panel opens');
  ok(item.getAttribute('data-open') === 'true', 'open state mirrored onto the row for its background');

  click(w, trigger);
  ok(panels[0].getAttribute('data-open') === 'false', 'panel closes');
  ok(item.getAttribute('data-open') === 'false', 'row state follows it back');

  // A second scan must not double-wrap.
  w.ELMA.motion.scan(d);
  ok(panels.every(p => p.children.length === 1), 'rescanning does not nest another wrapper');
}

console.log('\n— motion: scroll progress —');
{
  const { d } = await load('index.html');
  const bar = d.querySelector('nav.site-nav .scroll-progress');
  ok(!!bar, 'progress bar injected into the nav');
  ok(bar.getAttribute('aria-hidden') === 'true', 'progress bar hidden from assistive tech');
  ok(bar.style.getPropertyValue('--progress') !== '', 'progress initialised on load');
  ok(d.querySelector('nav.site-nav').getAttribute('data-scrolled') === 'false', 'nav starts unscrolled');
}

console.log('\n— motion: animated numbers —');
{
  const { w, d } = await load('cart.html');
  const total = d.querySelector('[data-number="cart-total"]');
  ok(!!total, 'cart total is a number target');
  ok(total.getAttribute('data-number-format') === 'money', 'total formats as money');

  const t = w.ELMA.Cart.totals();
  ok(Math.abs(parseFloat(total.getAttribute('data-number-value')) - t.total) < 0.005,
    'declared value matches the computed total');
  ok(total.textContent === '$' + t.total.toFixed(2),
    'rendered text matches the total exactly on first paint (' + total.textContent + ')');
}

console.log('\n— motion: dynamic content —');
{
  // Cards injected by a filter change must be wired, not left un-animated.
  const { w, d } = await load('shop.html', { io: true });
  const chip = [...d.querySelectorAll('[data-cat]')].find(c => c.getAttribute('data-cat') !== 'all');
  click(w, chip);
  const cards = [...d.querySelectorAll('.product-grid > .product-card')];
  ok(cards.length > 0, 'filtering renders cards');
  ok(cards.every(c => c.hasAttribute('data-reveal')), 'filtered-in cards are armed for reveal');
}

console.log('\n— motion: scrubbed scroll (ASHA-20) —');
{
  // jsdom implements neither animation-timeline nor real layout, so loading
  // the page here exercises exactly the mandatory JS fallback path — the
  // one browsers without native scroll-driven animation support fall back
  // to. The native @supports (animation-timeline: view()) path is pure CSS
  // and is covered lower down, in the css token contract section.
  const { w, d } = await load('index.html');

  ok(!!d.querySelector('#ritual .ritual') && !!d.querySelector('#ritual .ritual-copy')
    && !!d.querySelector('#ritual .steps'),
    'pinned-ritual wrapper present: #ritual wraps .ritual, which still holds .ritual-copy and .steps');
  const steps = [...d.querySelectorAll('#ritual .step')];
  ok(steps.length === 4 && steps.every((s, i) => s.style.getPropertyValue('--i') === String(i)),
    'each step carries its index for the animation-range slice (' + steps.length + ')');
  ok(d.getElementById('ritual').style.getPropertyValue('--step-count') === '4',
    '#ritual declares --step-count matching the actual number of steps');

  ok(d.documentElement.getAttribute('data-scrub') === 'fallback',
    'no animation-timeline support in jsdom: JS fallback arms itself');

  const track = d.getElementById('ritual');
  const vh = w.innerHeight;
  const trackHeight = vh * steps.length;
  // Scrolled to the midpoint of step 0's own quarter of the track.
  track.getBoundingClientRect = () => ({ top: -(trackHeight - vh) * (0.5 / steps.length), height: trackHeight });
  w.dispatchEvent(new w.Event('scroll'));
  await frames(w, 2);
  ok(parseFloat(steps[0].style.opacity) > 0.9 && steps[0].style.transform.includes('0px'),
    'step 0 is fully in at the midpoint of its own slice (opacity ' + steps[0].style.opacity + ')');
  ok(parseFloat(steps[1].style.opacity) === 0, 'step 1 has not started yet (opacity ' + steps[1].style.opacity + ')');

  // Scroll back to the very top: the fallback must reverse cleanly, not
  // just play forward once — this is the "advances and reverses" acceptance
  // criterion, exercised on the JS path.
  track.getBoundingClientRect = () => ({ top: 0, height: trackHeight });
  w.dispatchEvent(new w.Event('scroll'));
  await frames(w, 2);
  ok(steps.every(s => parseFloat(s.style.opacity) === 0),
    'scrolling back to the top reverses every step to hidden');
}
{
  const { d } = await load('index.html', { reduce: true });
  ok(d.documentElement.getAttribute('data-scrub') !== 'fallback',
    'reduced motion: JS fallback never arms');
  const steps = [...d.querySelectorAll('#ritual .step')];
  ok(steps.every(s => s.style.opacity === '' && s.style.transform === ''),
    'reduced motion: steps carry no inline scrub styles — the CSS reduced-motion block owns the end state');
}
{
  const { d } = await load('index.html');
  ok(!!d.getElementById('range'), '#range id present — scopes the lineup-drift selector to the homepage range grid');
  const cards = [...d.querySelectorAll('#range .product-grid > .product-card')];
  ok(cards.length > 0, 'range section renders product cards for the lineup to drift (' + cards.length + ')');
}

console.log('\n— motion: css token contract —');
{
  const css = read('assets/css/motion.css');

  // Brand tokens (--wine, --oat, ...) are declared in styles.css, which every
  // page loads first, so both files count as the definition set.
  const defined = new Set(
    [...(read('assets/css/styles.css') + css).matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]));
  const missing = [];
  for (const m of css.matchAll(/var\(\s*(--[a-z0-9-]+)\s*(,)?/g)) {
    if (!defined.has(m[1]) && !m[2]) missing.push(m[1]);
  }
  ok(missing.length === 0, 'every var() is defined or has a fallback (' + [...new Set(missing)].join(',') + ')');

  const springs = ['press', 'swap', 'mouse', 'text', 'progress', 'toast',
                   'acc-row', 'acc-open', 'acc-close', 'chevron'];
  ok(springs.every(s => defined.has('--spring-' + s) && defined.has('--spring-' + s + '-dur')),
    'all 10 springs have a curve and a duration');

  const curves = [...css.matchAll(/--spring-([a-z-]+):\s*(linear\([^;]+\));/g)];
  ok(curves.length === 10, '10 solved linear() curves present (got ' + curves.length + ')');

  const badEnds = curves.filter(([, name, curve]) => {
    const stops = curve.slice(7, -1).split(',').map(s => parseFloat(s.trim()));
    return stops[0] !== 0 || stops[stops.length - 1] !== 1;
  });
  ok(badEnds.length === 0, 'every curve runs 0 -> 1 (' + badEnds.map(b => b[1]).join(',') + ')');

  const notMonotonic = curves.filter(([, , curve]) => {
    const pcts = [...curve.matchAll(/([\d.]+)%/g)].map(m => parseFloat(m[1]));
    return pcts.some((p, i) => i > 0 && p <= pcts[i - 1]);
  });
  ok(notMonotonic.length === 0, 'curve stops advance monotonically');

  // The bezier fallbacks and the linear() curves must run for the same time,
  // or the two code paths feel different.
  ok(/@supports \(animation-timing-function: linear\(0, 1\)\)/.test(css),
    'linear() curves are behind an @supports guard');
  // Anchored to the at-rule so a mention of @supports in a comment does not
  // count as the override site.
  ok(css.search(/^@supports/m) > css.search(/--spring-press:\s*cubic-bezier/),
    'bezier fallbacks are declared before the @supports override');

  ok(/@media \(prefers-reduced-motion:reduce\)/.test(css), 'reduced-motion block present');
  ok(/@media \(hover:hover\) and \(pointer:fine\)/.test(css), 'hover states gated behind a real pointer');
}
{
  const styles = read('assets/css/styles.css');
  ok(!/\.acc-panel\{[^}]*display:none/.test(styles),
    'styles.css no longer hard-hides accordion panels (would defeat the height animation)');
  ok(!/\.acc-panel\[data-open="true"\]\{display:block/.test(styles),
    'no display override fighting the grid-rows animation');
}
{
  // ASHA-20 — scrubbed motion lives in styles.css, gated behind
  // @supports (animation-timeline: view()) with a JS-armed data-scrub
  // fallback for everything else, per the non-negotiables in the ticket.
  const styles = read('assets/css/styles.css');
  ok(/@supports \(animation-timeline: view\(\)\)/.test(styles),
    'scrubbed motion is progressively enhanced behind @supports (animation-timeline: view())');
  ok(/view-timeline-name:\s*--ritual-progress/.test(styles),
    'pinned ritual drives its steps off a named view-timeline');
  ok(/html\[data-scrub="fallback"\]/.test(styles),
    'a JS-armed [data-scrub="fallback"] path exists for browsers @supports rejects');

  const supportsBlock = styles.slice(
    styles.indexOf('@supports (animation-timeline: view()){\n  #ritual'));
  ok(/animation-range:/.test(supportsBlock), 'each pinned step gets its own animation-range slice');

  // Compositor-only, per the ticket: nothing animated here may be a
  // property that triggers layout. Check every declaration inside the two
  // new @keyframes blocks, not just skim for the word "transform".
  for (const name of ['ritual-step-beat', 'lineup-drift']) {
    const m = styles.match(new RegExp('@keyframes ' + name + '\\{([\\s\\S]*?)\\n  \\}'));
    ok(!!m, '@keyframes ' + name + ' present');
    const props = [...(m ? m[1] : '').matchAll(/([a-z-]+):/g)].map(x => x[1]);
    const offenders = props.filter(p => p !== 'opacity' && p !== 'transform' && p !== 'translate');
    ok(props.length > 0 && offenders.length === 0,
      '@keyframes ' + name + ' only animates compositor-safe properties (' + offenders.join(',') + ')');
  }

  // Reduced motion must collapse both new effects to a static end state —
  // the same house rule the rest of motion.css already enforces.
  const reducedBlocks = [...styles.matchAll(/@media \(prefers-reduced-motion:reduce\)\{([\s\S]*?)\n\}/g)]
    .map(x => x[1]).join('\n');
  ok(/#ritual\b/.test(reducedBlocks) && /animation:none\s*!important/.test(reducedBlocks),
    'reduced motion collapses the pinned ritual to its static end state');
  ok(/#range .product-grid > \.product-card\{translate:none\s*!important;animation:none\s*!important;\}/
    .test(reducedBlocks),
    'reduced motion strips the lineup drift entirely');

  // The lineup drift must animate `translate`, not `transform` — that
  // property already belongs to the hover lift (styles.css) and the reveal
  // entrance (motion.css), so a second owner would fight both. The
  // compositor-only check above already confirms @keyframes lineup-drift
  // never declares transform; this confirms the rule that plays it doesn't
  // either.
  ok(/#range \.product-grid > \.product-card\{\s*animation:lineup-drift linear both;\s*animation-timeline: view\(\);/
    .test(styles),
    'the lineup-drift rule itself sets no transform alongside the animation');
}
{
  // Every page must ship both halves of the motion layer.
  const pages = ['index.html', 'shop.html', 'product.html', 'cart.html',
                 'checkout.html', 'faq.html', 'about.html', 'contact.html'];
  const missingCss = pages.filter(p => !read(p).includes('assets/css/motion.css'));
  const missingJs = pages.filter(p => !read(p).includes('assets/js/motion.js'));
  ok(missingCss.length === 0, 'all pages link motion.css (' + missingCss.join(',') + ')');
  ok(missingJs.length === 0, 'all pages load motion.js (' + missingJs.join(',') + ')');
  ok(pages.every(p => {
    const s = read(p);
    return s.indexOf('assets/js/site.js') < s.indexOf('assets/js/motion.js');
  }), 'motion.js loads after site.js on every page');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
