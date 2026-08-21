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

## Structure

```
assets/
  css/styles.css      design tokens + all component styles
  js/products.js      catalogue data + inline SVG product artwork
  js/site.js          cart, shop, product, checkout, forms, nav
  favicon.svg
test/site.test.mjs    62 end-to-end DOM tests
```

To change the catalogue, edit `PRODUCTS` in `assets/js/products.js` — nothing else
needs to change. Swapping it for a real API only means replacing `ELMA.products`
and `ELMA.getProduct`.

## Tests

```bash
npm install    # jsdom, used only by the tests
npm test
```

62 assertions covering add-to-cart, filtering, sorting, quantity steppers, cart
maths, promo codes, checkout validation, the confirmation flow, the accordion,
form validation, and internal links.

## Source

Brand and original landing page imported from a Claude artifact:
https://claude.ai/public/artifacts/d2b66b1a-4720-495c-ba16-1bedc6d1c4de
