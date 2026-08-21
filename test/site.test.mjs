/*
 * ELMA storefront — end-to-end DOM tests.
 *
 *   npm install jsdom
 *   node test/site.test.mjs
 *
 * Loads each page in jsdom with a shared localStorage, so cart state carries
 * across "page loads" the way it does in a browser. Covers the shop filters,
 * product detail, cart maths, promo codes, checkout validation, and the forms.
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'fs';
import path from 'path';

// Site root defaults to the repo root (this file lives in test/).
const SITE = process.env.SITE || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };

const store = {};
async function load(page, url) {
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => errs.push(e.message));
  vc.on('error', (...a) => errs.push(a.join(' ')));
  const dom = new JSDOM(readFileSync(path.join(SITE, page), 'utf8'), {
    runScripts: 'outside-only', url: 'http://localhost:8000/' + (url || page), virtualConsole: vc,
    pretendToBeVisual: true, // motion.js needs requestAnimationFrame
  });
  const w = dom.window;
  // shared localStorage across "page loads" so cart persistence is exercised
  Object.defineProperty(w, 'localStorage', { value: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  }, configurable: true });
  // jsdom 27 ships no matchMedia; every target browser has one. Default to a
  // desktop pointer with motion allowed.
  if (!w.matchMedia) {
    Object.defineProperty(w, 'matchMedia', { value: q => ({
      media: q,
      matches: /hover: hover|pointer: fine/.test(q) && !/reduce/.test(q),
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    }), configurable: true });
  }
  if (w.document.readyState === 'loading') {
    await new Promise(res => w.document.addEventListener('DOMContentLoaded', res));
  }
  // Same order the pages load them in: products, site, motion, then inline.
  w.eval(readFileSync(path.join(SITE, 'assets/js/products.js'), 'utf8'));
  w.eval(readFileSync(path.join(SITE, 'assets/js/site.js'), 'utf8'));
  w.eval(readFileSync(path.join(SITE, 'assets/js/motion.js'), 'utf8'));
  for (const s of w.document.querySelectorAll('body script:not([src])')) w.eval(s.textContent);
  return { w, d: w.document, errs };
}
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));

console.log('\n— home —');
{
  const { w, d, errs } = await load('index.html');
  ok(errs.length === 0, 'no JS errors (' + errs.join('; ') + ')');
  ok(d.querySelectorAll('[data-featured-grid] .product-card').length === 4, 'renders 4 featured products');
  ok(d.querySelector('#hero-art svg') && d.querySelector('#ingredient-art svg'), 'hero + ingredient artwork injected');
  ok(d.querySelector('[data-nav-links] a[aria-current="page"]') === null, 'home: in-page anchors not mis-marked as current page');

  click(w, d.querySelector('[data-add-to-cart]'));
  ok(w.ELMA.Cart.count() === 1, 'add-to-cart from a card adds 1 item');
  ok(d.querySelector('[data-cart-count]').textContent === '1', 'nav badge updates to 1');

  const nl = d.querySelector('[data-newsletter]');
  nl.querySelector('input').value = 'nope';
  nl.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  ok(d.querySelector('.cta-section .form-msg').getAttribute('data-tone') === 'err', 'newsletter rejects a bad email');
  nl.querySelector('input').value = 'jason@example.com';
  nl.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  ok(d.querySelector('.cta-section .form-msg').getAttribute('data-tone') === 'ok', 'newsletter accepts a valid email');

  const toggle = d.querySelector('[data-nav-toggle]');
  click(w, toggle);
  ok(d.querySelector('[data-nav-links]').getAttribute('data-open') === 'true', 'mobile menu opens');
  click(w, toggle);
  ok(d.querySelector('[data-nav-links]').getAttribute('data-open') === 'false', 'mobile menu closes');
}

console.log('\n— shop —');
{
  const { w, d, errs } = await load('shop.html');
  ok(errs.length === 0, 'no JS errors (' + errs.join('; ') + ')');
  ok(d.querySelectorAll('[data-shop-grid] .product-card').length === w.ELMA.products.length, 'lists all ' + w.ELMA.products.length + ' products');
  ok(d.querySelector('[data-cart-count]').textContent === '1', 'cart persisted across page loads');
  ok(d.querySelector('[data-nav-links] a[aria-current="page"]')?.getAttribute('href') === 'shop.html', 'shop marked as current page in nav');

  click(w, d.querySelector('[data-cat="treat"]'));
  ok(d.querySelectorAll('[data-shop-grid] .product-card').length === 2, 'category filter narrows to 2 treatments');
  ok(d.querySelector('[data-result-count]').textContent === '2 products', 'result count updates');
  ok(w.location.search.includes('category=treat'), 'filter reflected in the URL');

  click(w, d.querySelector('[data-cat="all"]'));
  const sort = d.querySelector('[data-sort]');
  sort.value = 'price-asc';
  sort.dispatchEvent(new w.Event('change', { bubbles: true }));
  const prices = [...d.querySelectorAll('.product-price')].map(e => parseFloat(e.textContent.slice(1)));
  ok(prices.every((p, i) => i === 0 || prices[i - 1] <= p), 'sort by price ascending works');

  const empty = await load('shop.html', 'shop.html?category=nonexistent');
  ok(empty.d.querySelector('[data-shop-grid] .empty-state'), 'unknown category shows empty state, not a crash');
}

console.log('\n— product detail —');
{
  const { w, d, errs } = await load('product.html', 'product.html?id=night-ritual-retinal');
  ok(errs.length === 0, 'no JS errors (' + errs.join('; ') + ')');
  ok(d.querySelector('.pdp h1').textContent === 'Night Ritual', 'renders the right product');
  ok(d.title.includes('Night Ritual'), 'document title updated');
  ok(d.querySelectorAll('.ing-row').length === 4, 'ingredient list rendered');
  ok(d.querySelectorAll('.step-list li').length === 4, 'how-to-use steps rendered');
  ok(d.querySelectorAll('[data-related-grid] .product-card').length === 3, 'related products rendered');
  ok(d.querySelector('[data-related-grid] a[href*="night-ritual"]') === null, 'related grid excludes the current product');

  const before = w.ELMA.Cart.count();
  const up = d.querySelector('.pdp-buy [data-step="up"]');
  click(w, up); click(w, up);
  ok(d.querySelector('#pdp-qty').value === '3', 'qty stepper increments to 3');
  click(w, d.querySelector('.pdp-buy [data-step="down"]'));
  ok(d.querySelector('#pdp-qty').value === '2', 'qty stepper decrements');
  click(w, d.querySelector('[data-add-to-cart]'));
  ok(w.ELMA.Cart.count() === before + 2, 'adds the chosen quantity');

  const missing = await load('product.html', 'product.html?id=does-not-exist');
  ok(missing.d.querySelector('.pdp .empty-state'), 'unknown product id shows a not-found state');
}

console.log('\n— cart —');
{
  const { w, d, errs } = await load('cart.html');
  ok(errs.length === 0, 'no JS errors (' + errs.join('; ') + ')');
  ok(d.querySelectorAll('.cart-line').length === 2, 'two distinct line items');

  const qty = d.querySelector('[data-qty="night-ritual-retinal"]');
  qty.value = '5';
  qty.dispatchEvent(new w.Event('change', { bubbles: true }));
  ok(w.ELMA.Cart.read()['night-ritual-retinal'] === 5, 'editing quantity updates the cart');

  const t = w.ELMA.Cart.totals();
  ok(Math.abs(t.subtotal - (62 * 5 + 48)) < 0.01, 'subtotal maths correct ($' + t.subtotal + ')');
  ok(t.shipping === 0, 'free shipping applied over $60');

  const promo = d.querySelector('[data-promo-form]');
  promo.elements.code.value = 'bogus';
  promo.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  ok(d.querySelector('[data-promo-msg]').getAttribute('data-tone') === 'err', 'invalid promo code rejected');

  const promo2 = d.querySelector('[data-promo-form]');
  promo2.elements.code.value = 'ritual10';
  promo2.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  const t2 = w.ELMA.Cart.totals();
  ok(Math.abs(t2.discount - t2.subtotal * 0.1) < 0.01, 'RITUAL10 applies 10% (lowercase accepted)');
  ok(Math.abs(t2.total - (t2.subtotal - t2.discount) * 1.08) < 0.01, 'total = discounted subtotal + tax');

  click(w, d.querySelector('[data-remove="quiet-hour-serum"]'));
  ok(d.querySelectorAll('.cart-line').length === 1, 'remove drops the line');
  ok(!w.ELMA.Cart.read()['quiet-hour-serum'], 'removed item gone from storage');
}

console.log('\n— checkout —');
{
  const { w, d, errs } = await load('checkout.html');
  ok(errs.length === 0, 'no JS errors (' + errs.join('; ') + ')');
  ok(d.querySelector('[data-checkout-summary]').textContent.includes('Night Ritual'), 'summary lists cart contents');

  const form = d.querySelector('[data-checkout-form]');
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  ok(d.querySelector('[data-checkout-done]').hidden, 'empty form does not submit');
  ok(d.querySelectorAll('[aria-invalid="true"]').length === 9, 'all 9 fields flagged invalid');

  const fill = { email: 'jason@example.com', name: 'Jason Lee', address: '12 Rosemary Lane',
    city: 'Austin', postal: '78701', country: 'United States',
    card: '4242 4242 4242 4242', expiry: '11/29', cvc: '123' };
  for (const [k, v] of Object.entries(fill)) {
    form.elements[k].value = v;
    form.elements[k].dispatchEvent(new w.Event('blur', { bubbles: true }));
  }
  ok(d.querySelectorAll('[aria-invalid="true"]').length === 0, 'valid input clears every error');

  form.elements.expiry.value = '2029-11';
  form.elements.expiry.dispatchEvent(new w.Event('blur', { bubbles: true }));
  ok(form.elements.expiry.getAttribute('aria-invalid') === 'true', 'expiry format enforced');
  form.elements.expiry.value = '11/29';
  form.elements.expiry.dispatchEvent(new w.Event('blur', { bubbles: true }));

  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  ok(!d.querySelector('[data-checkout-done]').hidden, 'valid form shows the confirmation');
  ok(d.querySelector('[data-checkout-panel]').hidden, 'form panel hidden after order');
  ok(/^ELMA-[A-Z0-9]{6}$/.test(d.querySelector('[data-order-ref]').textContent), 'order reference generated');
  ok(d.querySelector('[data-order-email]').textContent === 'jason@example.com', 'confirmation echoes the email');
  ok(w.ELMA.Cart.count() === 0, 'cart cleared after checkout');
}

console.log('\n— faq / about / contact —');
{
  const { w, d, errs } = await load('faq.html');
  ok(errs.length === 0, 'faq: no JS errors (' + errs.join('; ') + ')');
  const trig = d.querySelector('.acc-trigger');
  const panel = d.getElementById(trig.getAttribute('aria-controls'));
  click(w, trig);
  ok(trig.getAttribute('aria-expanded') === 'true' && panel.getAttribute('data-open') === 'true', 'accordion opens');
  click(w, trig);
  ok(trig.getAttribute('aria-expanded') === 'false', 'accordion closes');
  ok([...d.querySelectorAll('.acc-trigger')].every(t => d.getElementById(t.getAttribute('aria-controls'))), 'every accordion trigger points at a real panel');

  const about = await load('about.html');
  ok(about.errs.length === 0, 'about: no JS errors (' + about.errs.join('; ') + ')');
  ok(about.d.querySelector('#story-art svg'), 'about artwork injected');

  const c = await load('contact.html');
  ok(c.errs.length === 0, 'contact: no JS errors (' + c.errs.join('; ') + ')');
  const cf = c.d.querySelector('[data-contact-form]');
  cf.dispatchEvent(new c.w.Event('submit', { bubbles: true, cancelable: true }));
  ok(cf.querySelector('.form-msg').getAttribute('data-tone') === 'err', 'contact form blocks empty submit');
  cf.elements.name.value = 'Jason'; cf.elements.email.value = 'jason@example.com'; cf.elements.message.value = 'Where do I start?';
  cf.dispatchEvent(new c.w.Event('submit', { bubbles: true, cancelable: true }));
  ok(cf.querySelector('.form-msg').getAttribute('data-tone') === 'ok', 'contact form accepts valid input');
  ok(cf.elements.message.value === '', 'contact form resets after send');
}

console.log('\n— links —');
{
  const pages = ['index.html','shop.html','product.html','cart.html','checkout.html','about.html','faq.html','contact.html'];
  const known = new Set(pages);
  let broken = [];
  for (const p of pages) {
    const { d } = await load(p);
    for (const a of d.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href');
      if (/^(https?:|mailto:|#)/.test(href)) continue;
      const file = href.split('?')[0].split('#')[0];
      if (file && !known.has(file)) broken.push(p + ' -> ' + href);
    }
  }
  ok(broken.length === 0, 'no broken internal links' + (broken.length ? ': ' + broken.join(', ') : ''));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
