# ELMA — skin care storefront

A functional eight-page storefront for **ELMA**, built on the brand identity from
the original single-page landing site (Fraunces + Inter, oat/wine/blush/sage).

Static HTML, CSS, and vanilla JS. No build step, no framework, no bundler. The
only external request is Google Fonts.

## Run it

```bash
python3 -m http.server 8000    # or: npm start
```

Then visit http://localhost:8000

## Pages

| File | What it does |
| --- | --- |
| `index.html` | Home — hero, brand pillars, featured products, the four-step ritual, newsletter |
| `shop.html` | Full catalogue with category filters and sorting (both reflected in the URL) |
| `product.html` | Product detail, rendered from `?id=` — facts, ingredients, how-to-use, related items |
| `cart.html` | Line items, quantity editing, promo codes, live order summary |
| `checkout.html` | Validated checkout form → order confirmation with a reference number |
| `about.html` | Brand story and formulation principles |
| `faq.html` | Accordion FAQ |
| `contact.html` | Validated contact form and direct contact details |

## What actually works

- **Cart** persists in `localStorage`, survives navigation and reloads, and stays in
  sync across browser tabs. The nav badge updates everywhere.
- **Shop** filters by category and sorts by price or name, writing state to the URL
  so a filtered view is linkable (`shop.html?category=treat`).
- **Product pages** are data-driven — one template renders every product from
  `assets/js/products.js`, including title and meta description. Unknown ids get a
  not-found state instead of a blank page.
- **Order totals** cover subtotal, promo discount, free shipping over $60
  (otherwise $6 flat), and estimated tax.
- **Promo codes**: `RITUAL10` (10% off) and `FIRSTGLASS` ($15 off orders over $75).
  Case-insensitive; the minimum-spend rule is enforced.
- **Checkout** validates all nine fields on blur and on submit, focuses the first
  error, then clears the cart and shows a confirmation with an order reference.
- **Forms** (newsletter, contact) validate and give inline success/error feedback.
- Responsive down to 390px with a working mobile menu; keyboard-navigable with
  skip links, visible focus rings, ARIA state on the accordion, filters, and nav.

Checkout is front-end only — no payment is processed and nothing is sent to a
server. Every page says so.

## Motion

Ported from the [beUI motion set](https://beui.dev/components/motion). beUI ships
React + Motion + Tailwind components; this site is vanilla, so what crossed over
is the **values** — easing curves, spring constants, enter/exit transforms — not
the code.

| Surface | beUI source | What it does here |
| --- | --- | --- |
| Scroll reveal | `ScrollReveal` | Sections, cards, and rows fade up 16px from an 8px blur as they enter view; siblings stagger 60–80ms |
| Hero headline | `TextReveal` | Split per word, 90ms apart, rising from 40% with a 12px blur |
| Buttons & chips | `Button` | Hover 1.02, press 0.93, fast on the way down and spring on the way back up |
| Product / PDP media | `TiltCard` | 6° cursor tilt with a tracked glare, mouse only |
| FAQ | `BouncyAccordion` | Real height animation with a bounced spring, plus a row tint |
| Toasts | `AnimatedToastStack` | Up to 4 stack with depth falloff instead of replacing each other |
| Nav | `ScrollProgress` | 2px spring-damped progress bar |
| Cart total | `Number` | Counts to the new total rather than snapping |

Two things worth knowing:

- **The springs are solved, not eyeballed.** Each `--spring-*` token in
  `motion.css` is the step response of a damped harmonic oscillator, computed
  from beUI's published stiffness/damping/mass and sampled into a CSS `linear()`
  curve. Bezier approximations sit behind an `@supports` guard for older engines.
- **The old stylesheet ran every transition at `.2s`.** That is now a four-tier
  scale — `--dur-micro` (120ms) for colour, `--dur-fast` (180ms) for
  background/border, `--dur-base` (260ms) for panels, `--dur-reveal` (600ms) for
  entrances — so small changes resolve faster than large ones.

Everything degrades: `prefers-reduced-motion` drops to opacity-only, tilt and
hover are gated behind `(hover: hover) and (pointer: fine)`, a missing
`IntersectionObserver` shows content immediately, and because `motion.js` is what
*adds* the reveal attributes, disabling JS leaves the page fully visible rather
than stuck at opacity 0.

## Imagery

The product shots are **rendered studio stills, not photographs.** They are
generated from primitives by `tools/generate-images.py`, so they carry no
licence encumbrance and no model release — and the site says as much rather
than passing them off as a shoot.

They exist to be replaced. Every shot is rendered at the exact aspect ratio,
filename and derivative size a real photograph will use, so swapping in a
client shoot is a drop-in: match the naming scheme below and no markup, CSS or
JS changes anywhere in the site.

```bash
npm run images                       # re-render all eight products
python3 tools/generate-images.py quiet-hour-serum   # or just one
```

Requires Pillow and ffmpeg — dev-time only. The site itself stays a
build-free set of static HTML files.

Three variants, because three art directions:

```
assets/img/products/<id>/square-{400,800}.{avif,webp,jpg}    1:1     framed
assets/img/products/<id>/portrait-{600,1200}.{avif,webp,jpg} 1:1.05  framed
assets/img/products/<id>/cutout-{300,600}.{webp,png}         1:2     alpha
```

**Framed** shots bake the backdrop into the pixels and fill their box — the
shop grid, the PDP, the cart lines, the 1:1 story panels. The CSS gradient
underneath is the same oat wash the render starts from, so it doubles as the
loading placeholder. **Cutout** shots carry alpha and are used where the
product floats rather than sits in a frame — currently the hero, where the
bottle has to sit inside the rings.

`ELMA.picture(product, variant, opts)` in `products.js` builds the `<picture>`:
AVIF then WebP then a universal fallback, a `srcset` per format, and `sizes`
from the caller since only the caller knows the slot's layout width. Every
`<img>` ships explicit `width`/`height` so the grid reserves its space before
a byte arrives — with eight tiles lazy-loading at once, that is the difference
between a calm page and a jumping one. Only the hero and the PDP shot load
eagerly; everything else defers.

On a browser that takes AVIF the whole eight-tile shop grid is about 17 KB.

## Structure

```
assets/
  css/styles.css      design tokens + all component styles
  css/motion.css      motion tokens, solved spring curves, animated components
  js/products.js      catalogue data, alt text, and the <picture> builder
  js/site.js          cart, shop, product, checkout, forms, nav
  js/motion.js        reveal observer, text split, tilt, toast stack, counters
  img/products/       generated product shots (see Imagery)
  favicon.svg
tools/generate-images.py  renders every product shot and derivative
test/site.test.mjs    62 end-to-end DOM tests
test/motion.test.mjs  76 motion-layer tests
test/images.test.mjs  26 imagery tests
```

`motion.js` loads after `site.js` and owns every animated surface. The coupling
is three optional hooks — `ELMA.motion.toast`, `ELMA.motion.scan` (called after
any re-render so injected nodes get wired), and the accordion's row state. Delete
`motion.js` and the site still works; it just stops moving.

To change the catalogue, edit `PRODUCTS` in `assets/js/products.js` — nothing else
needs to change. Swapping it for a real API only means replacing `ELMA.products`
and `ELMA.getProduct`.

## Tests

```bash
npm install    # jsdom, used only by the tests
npm test
```

164 assertions. `site.test.mjs` (62) covers add-to-cart, filtering, sorting,
quantity steppers, cart maths, promo codes, checkout validation, the
confirmation flow, the accordion, form validation, and internal links.
`motion.test.mjs` (76) covers the reveal observer and its fallbacks, stagger
timing and its cap, the hero word split, the toast stack, the accordion
rewrite, animated totals, and the CSS token contract.
`images.test.mjs` (26) resolves every image URL the markup can produce against
the files on disk — which is what catches a half-finished render — and pins the
things that are cheap to break and expensive to notice: intrinsic sizes on
every `<img>`, lazy everywhere except the two above-the-fold shots, format
ordering, and alt discipline (decorative inside an already-labelled link,
descriptive when standalone).

jsdom has no layout engine, so the motion tests assert **end states** — that
content always resolves to visible and never strands behind a transition that
cannot run. Appearance was verified separately in headless Chromium; note that
headless defaults `prefers-reduced-motion` to `reduce` and reports
`pointer: none`, so both need overriding to exercise the full-motion path.

## Source

Brand and original landing page imported from a Claude artifact:
https://claude.ai/public/artifacts/d2b66b1a-4720-495c-ba16-1bedc6d1c4de
