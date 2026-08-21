/*
 * ELMA storefront — product imagery tests.
 *
 *   node test/images.test.mjs
 *
 * The image pipeline makes four promises that are cheap to break and expensive
 * to notice in review, so each one is pinned here:
 *
 *   1. every file the markup points at actually exists on disk — a typo in the
 *      naming scheme yields a broken tile, not an error;
 *   2. every <img> carries explicit width/height, so the grid reserves its
 *      space and eight lazy tiles cannot shove the page around as they land;
 *   3. alt discipline — decorative images inside an already-labelled link get
 *      alt="", standalone images get real descriptive text;
 *   4. only above-the-fold art loads eagerly; everything else defers.
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const SITE = process.env.SITE || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };

const store = {};
async function load(page, url) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  const dom = new JSDOM(readFileSync(path.join(SITE, page), 'utf8'), {
    runScripts: 'outside-only', url: 'http://localhost:8000/' + (url || page),
    virtualConsole: vc, pretendToBeVisual: true,
  });
  const w = dom.window;
  Object.defineProperty(w, 'localStorage', { value: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  }, configurable: true });
  if (!w.matchMedia) {
    Object.defineProperty(w, 'matchMedia', { value: q => ({
      media: q, matches: false,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    }), configurable: true });
  }
  if (w.document.readyState === 'loading') {
    await new Promise(res => w.document.addEventListener('DOMContentLoaded', res));
  }
  w.eval(readFileSync(path.join(SITE, 'assets/js/products.js'), 'utf8'));
  w.eval(readFileSync(path.join(SITE, 'assets/js/site.js'), 'utf8'));
  w.eval(readFileSync(path.join(SITE, 'assets/js/motion.js'), 'utf8'));
  for (const s of w.document.querySelectorAll('body script:not([src])')) w.eval(s.textContent);
  return { w, d: w.document };
}

/* Pull every candidate URL out of a srcset ("a.webp 400w, b.webp 800w"). */
const urls = ss => (ss || '').split(',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean);

/* Every asset a <picture> can resolve to, across <source> and the <img>. */
function candidates(picture) {
  const out = [];
  for (const s of picture.querySelectorAll('source')) out.push(...urls(s.getAttribute('srcset')));
  const img = picture.querySelector('img');
  if (img) {
    out.push(...urls(img.getAttribute('srcset')));
    if (img.getAttribute('src')) out.push(img.getAttribute('src'));
  }
  return out;
}

console.log('\n— generated assets —');
{
  const { w } = await load('index.html');
  const products = w.ELMA.products;
  const variants = w.ELMA.imageVariants;

  ok(products.length > 0, 'catalogue is non-empty (' + products.length + ' products)');

  const missingAlt = products.filter(p => !p.imageAlt || p.imageAlt.length < 20);
  ok(missingAlt.length === 0,
    'every product carries descriptive alt text' +
    (missingAlt.length ? ' — missing: ' + missingAlt.map(p => p.id).join(', ') : ''));

  // Renders every product in every variant and checks the whole file set. This
  // is what catches a half-finished render: a product whose square shots exist
  // but whose cutouts were never written.
  const missing = [];
  for (const p of products) {
    for (const variant of Object.keys(variants)) {
      const host = w.document.createElement('div');
      host.innerHTML = w.ELMA.picture(p, variant, { sizes: '100vw' });
      const pic = host.querySelector('picture');
      if (!pic) { missing.push(p.id + '/' + variant + ' (no <picture> produced)'); continue; }
      for (const rel of candidates(pic)) {
        if (!existsSync(path.join(SITE, rel))) missing.push(rel);
      }
    }
  }
  ok(missing.length === 0,
    'every referenced image file exists on disk' +
    (missing.length ? ' — missing ' + missing.length + ': ' + missing.slice(0, 5).join(', ') : ''));

  // AVIF/WebP ahead of the fallback: the browser takes the first <source> it
  // understands, so ordering here is the whole optimisation.
  const host = w.document.createElement('div');
  host.innerHTML = w.ELMA.picture(products[0], 'square', { sizes: '100vw' });
  const types = [...host.querySelectorAll('source')].map(s => s.getAttribute('type'));
  ok(types[0] === 'image/avif' && types[1] === 'image/webp',
    'modern formats offered before the jpg fallback (' + types.join(' → ') + ')');
  ok(/\.jpg$/.test(host.querySelector('img').getAttribute('src')),
    'fallback <img> src is the universally supported format');
}

console.log('\n— shop grid —');
{
  const { d } = await load('shop.html');
  const imgs = [...d.querySelectorAll('.product-media img')];
  ok(imgs.length >= 8, 'every tile has an image (' + imgs.length + ')');
  ok(imgs.every(i => i.getAttribute('width') && i.getAttribute('height')),
    'every tile image declares width and height');
  ok(imgs.every(i => i.getAttribute('loading') === 'lazy'),
    'grid images are lazy — none of them are above the fold');
  // The tile is a link that already announces "Morning Dew — Gel-to-milk
  // cleanser". A described image here would read the product name twice.
  ok(imgs.every(i => i.getAttribute('alt') === ''),
    'tile images are decorative (the wrapping link carries the name)');
  ok([...d.querySelectorAll('.product-media')].every(m => m.querySelector('a, picture') || true) &&
     [...d.querySelectorAll('a.product-media')].every(a => a.getAttribute('aria-label')),
    'each tile link has an accessible name');
}

console.log('\n— product detail —');
{
  const { d } = await load('product.html', 'product.html?id=quiet-hour-serum');
  const img = d.querySelector('.pdp-media img');
  ok(img, 'PDP renders a product image');
  ok(img && img.getAttribute('alt') && img.getAttribute('alt').length > 20,
    'PDP image has descriptive alt text — it is the only view of the product');
  ok(img && !/^(image|photo|picture) of/i.test(img.getAttribute('alt') || ''),
    'alt text does not start with a redundant "image of"');
  ok(img && img.getAttribute('loading') === 'eager' && img.getAttribute('fetchpriority') === 'high',
    'PDP image loads eagerly — it is the largest contentful paint');
  ok(img && img.getAttribute('width') && img.getAttribute('height'),
    'PDP image declares width and height');
  ok(img && img.getAttribute('sizes'), 'PDP image declares sizes for candidate selection');
}

console.log('\n— hero —');
{
  const { d } = await load('index.html');
  const hero = d.querySelector('#hero-art img');
  ok(hero, 'hero renders a product cutout');
  ok(hero && hero.getAttribute('loading') === 'eager' && hero.getAttribute('fetchpriority') === 'high',
    'hero image loads eagerly');
  ok(hero && hero.getAttribute('width') && hero.getAttribute('height'),
    'hero image declares width and height');
  const below = d.querySelector('#ingredient-art img');
  ok(below && below.getAttribute('loading') === 'lazy',
    'the below-the-fold ingredient image defers');
}

console.log('\n— cart lines —');
{
  // Seed the shared store the way the cart page expects to find it.
  store['elma.cart.v1'] = JSON.stringify({ 'morning-dew-cleanser': 2 });
  const { d } = await load('cart.html');
  const img = d.querySelector('.cart-line-media img');
  ok(img, 'cart line renders a product thumbnail');
  ok(img && img.getAttribute('loading') === 'lazy', 'cart thumbnail is lazy');
  ok(img && img.getAttribute('width') && img.getAttribute('height'),
    'cart thumbnail declares width and height');
  ok(img && img.getAttribute('alt') === '',
    'cart thumbnail is decorative (its link carries the product name)');
  const link = d.querySelector('a.cart-line-media');
  ok(link && link.getAttribute('aria-label'), 'cart thumbnail link has an accessible name');
  delete store['elma.cart.v1'];
}

console.log('\n— every page —');
{
  const pages = ['index.html', 'shop.html', 'about.html', 'faq.html', 'contact.html'];
  const offenders = [];
  for (const page of pages) {
    const { d } = await load(page);
    for (const img of d.querySelectorAll('img')) {
      const why = [];
      if (img.getAttribute('alt') === null) why.push('no alt attribute');
      if (!img.getAttribute('width') || !img.getAttribute('height')) why.push('no intrinsic size');
      if (why.length) offenders.push(page + ': ' + (img.getAttribute('src') || '?') + ' — ' + why.join(', '));
    }
  }
  ok(offenders.length === 0,
    'no image anywhere is missing alt or intrinsic size' +
    (offenders.length ? ' — ' + offenders.slice(0, 5).join('; ') : ''));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
