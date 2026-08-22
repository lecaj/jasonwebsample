/* ==========================================================================
   ELMA — site behaviour
   Cart (localStorage), shop filtering, product detail, checkout, forms.
   Vanilla JS, no build step. Every page loads products.js then this file.
   ========================================================================== */
(function () {
  'use strict';

  var ELMA = (window.ELMA = window.ELMA || {});

  var CART_KEY = 'elma.cart.v1';
  var ORDER_KEY = 'elma.lastOrder.v1';
  var FREE_SHIPPING_AT = 60;
  var SHIPPING_FLAT = 6;
  var TAX_RATE = 0.08;

  var PROMOS = {
    RITUAL10: { type: 'percent', value: 0.1, label: '10% off' },
    FIRSTGLASS: { type: 'fixed', value: 15, label: '$15 off', min: 75 }
  };

  /* ---------- helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function money(n) {
    return '$' + (Math.round(n * 100) / 100).toFixed(2);
  }
  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------- storage ---------- */
  function readJSON(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback; // private mode / disabled storage — degrade quietly
    }
  }
  function writeJSON(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }

  /* ---------- cart model ---------- */
  var Cart = {
    read: function () {
      var raw = readJSON(CART_KEY, {});
      var clean = {};
      if (raw && typeof raw === 'object') {
        Object.keys(raw).forEach(function (id) {
          var qty = parseInt(raw[id], 10);
          if (ELMA.getProduct(id) && qty > 0) clean[id] = Math.min(qty, 99);
        });
      }
      return clean;
    },
    write: function (items) {
      writeJSON(CART_KEY, items);
      document.dispatchEvent(new CustomEvent('elma:cartchange'));
    },
    add: function (id, qty) {
      var items = Cart.read();
      items[id] = Math.min((items[id] || 0) + (qty || 1), 99);
      Cart.write(items);
    },
    setQty: function (id, qty) {
      var items = Cart.read();
      if (qty <= 0) delete items[id];
      else items[id] = Math.min(qty, 99);
      Cart.write(items);
    },
    remove: function (id) {
      var items = Cart.read();
      delete items[id];
      Cart.write(items);
    },
    clear: function () { Cart.write({}); },
    count: function () {
      var items = Cart.read(), total = 0;
      Object.keys(items).forEach(function (id) { total += items[id]; });
      return total;
    },
    lines: function () {
      var items = Cart.read();
      return Object.keys(items).map(function (id) {
        var product = ELMA.getProduct(id);
        return { product: product, qty: items[id], lineTotal: product.price * items[id] };
      });
    },
    promo: function () {
      var code = readJSON(CART_KEY + '.promo', null);
      return code && PROMOS[code] ? code : null;
    },
    setPromo: function (code) {
      writeJSON(CART_KEY + '.promo', code);
      document.dispatchEvent(new CustomEvent('elma:cartchange'));
    },
    totals: function () {
      var subtotal = Cart.lines().reduce(function (sum, l) { return sum + l.lineTotal; }, 0);
      var code = Cart.promo();
      var promo = code ? PROMOS[code] : null;
      var discount = 0;

      if (promo && (!promo.min || subtotal >= promo.min)) {
        discount = promo.type === 'percent' ? subtotal * promo.value : Math.min(promo.value, subtotal);
      }

      var discounted = subtotal - discount;
      var shipping = discounted === 0 || discounted >= FREE_SHIPPING_AT ? 0 : SHIPPING_FLAT;
      var tax = discounted * TAX_RATE;

      return {
        subtotal: subtotal,
        discount: discount,
        discountLabel: promo ? promo.label : null,
        promoCode: code,
        shipping: shipping,
        tax: tax,
        total: discounted + shipping + tax,
        freeShippingGap: Math.max(0, FREE_SHIPPING_AT - discounted)
      };
    }
  };
  ELMA.Cart = Cart;

  /* ---------- motion hand-off ----------
     motion.js loads after this file and owns every animated surface. Each
     hook below is optional: with motion.js absent the site keeps working,
     it just stops moving. */
  function rescan(root) {
    if (ELMA.motion && ELMA.motion.scan) ELMA.motion.scan(root || document);
  }

  /* ---------- toast ---------- */
  var toastTimer = null;
  function toast(message) {
    if (ELMA.motion && ELMA.motion.toast) { ELMA.motion.toast(message); return; }

    // Fallback: single replaceable toast, no stack.
    var el = $('#toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.setAttribute('data-show', 'true');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      el.setAttribute('data-show', 'false');
    }, 2600);
  }
  ELMA.toast = toast;

  /* ---------- nav ---------- */
  function initNav() {
    var toggle = $('[data-nav-toggle]');
    var links = $('[data-nav-links]');
    if (toggle && links) {
      toggle.addEventListener('click', function () {
        var open = links.getAttribute('data-open') === 'true';
        links.setAttribute('data-open', open ? 'false' : 'true');
        toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
        toggle.textContent = open ? 'Menu' : 'Close';
      });
    }

    // Mark the current page in the nav. In-page anchors (index.html#ritual)
    // are navigation within a page, not a destination — leave those alone.
    var here = window.location.pathname.split('/').pop() || 'index.html';
    $$('[data-nav-links] a').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (href.indexOf('#') === -1 && href.split('?')[0] === here) {
        a.setAttribute('aria-current', 'page');
      }
    });

    $$('[data-cart-link]').forEach(function (btn) {
      btn.addEventListener('click', function () { window.location.href = 'cart.html'; });
    });
  }

  function renderCartCount() {
    var count = Cart.count();
    $$('[data-cart-count]').forEach(function (el) {
      el.textContent = count;
      el.setAttribute('data-empty', count === 0 ? 'true' : 'false');
    });
    $$('[data-cart-label]').forEach(function (el) {
      el.textContent = count === 1 ? '1 item in cart' : count + ' items in cart';
    });
  }

  /* ---------- add-to-cart delegation ---------- */
  function initAddToCart() {
    document.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-add-to-cart]');
      if (!btn) return;
      event.preventDefault();

      var id = btn.getAttribute('data-add-to-cart');
      var product = ELMA.getProduct(id);
      if (!product) return;

      var qty = 1;
      var qtyInput = btn.getAttribute('data-qty-source')
        ? $(btn.getAttribute('data-qty-source'))
        : null;
      if (qtyInput) qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);

      Cart.add(id, qty);
      toast(product.name + ' added — ' + Cart.count() + ' in cart');
    });
  }

  /* ---------- qty steppers ---------- */
  function initSteppers(root) {
    $$('[data-stepper]', root || document).forEach(function (stepper) {
      if (stepper.getAttribute('data-bound') === 'true') return;
      stepper.setAttribute('data-bound', 'true');

      var input = $('input', stepper);
      var min = parseInt(stepper.getAttribute('data-min'), 10);
      if (isNaN(min)) min = 1;

      function commit(next) {
        var value = Math.max(min, Math.min(99, next));
        input.value = value;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }

      $$('button', stepper).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var delta = btn.getAttribute('data-step') === 'up' ? 1 : -1;
          commit((parseInt(input.value, 10) || min) + delta);
        });
      });

      input.addEventListener('change', function () {
        var value = parseInt(input.value, 10);
        if (isNaN(value)) value = min;
        input.value = Math.max(min, Math.min(99, value));
      });
    });
  }

  /* ---------- product card markup ----------
     The tile is a link wrapping the image, so the image itself carries alt=""
     — the link already has an accessible name and a screen reader announcing
     both would read the product twice.
  ------------------------------------------ */
  var CARD_SIZES = '(max-width:640px) 90vw, (max-width:1100px) 45vw, 300px';

  function productCard(product) {
    return (
      '<article class="product-card">' +
        '<a class="product-media" href="product.html?id=' + esc(product.id) + '" ' +
          'aria-label="' + esc(product.name + ' — ' + product.type) + '">' +
          ELMA.picture(product, 'square', { sizes: CARD_SIZES, alt: '' }) +
          (product.badge ? '<span class="product-badge">' + esc(product.badge) + '</span>' : '') +
        '</a>' +
        '<div class="product-body">' +
          '<div class="product-cat">' + esc(product.type) + '</div>' +
          '<a class="product-name" href="product.html?id=' + esc(product.id) + '">' +
            esc(product.name) + '</a>' +
          '<p class="product-tagline">' + esc(product.tagline) + '</p>' +
          '<div class="product-meta">' +
            '<span class="product-price">' + money(product.price) + '</span>' +
            '<span class="product-size">' + esc(product.size) + '</span>' +
          '</div>' +
          '<div class="product-actions">' +
            '<button class="btn-primary" data-add-to-cart="' + esc(product.id) + '">Add to cart</button>' +
            '<a class="btn-outline" href="product.html?id=' + esc(product.id) + '">Details</a>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }
  ELMA.productCard = productCard;

  /* ---------- home: featured grid ---------- */
  function initFeatured() {
    var grid = $('[data-featured-grid]');
    if (!grid) return;
    var ids = (grid.getAttribute('data-featured-grid') || '').split(',').filter(Boolean);
    var list = ids.length
      ? ids.map(function (id) { return ELMA.getProduct(id.trim()); }).filter(Boolean)
      : ELMA.products.slice(0, 4);
    grid.innerHTML = list.map(productCard).join('');
    rescan(grid);
  }

  /* ---------- shop ---------- */
  function initShop() {
    var grid = $('[data-shop-grid]');
    if (!grid) return;

    var chipWrap = $('[data-filters]');
    var sortSelect = $('[data-sort]');
    var countEl = $('[data-result-count]');
    var params = new URLSearchParams(window.location.search);
    var activeCat = params.get('category') || 'all';
    var activeSort = params.get('sort') || 'featured';

    if (chipWrap) {
      chipWrap.innerHTML = ELMA.categories.map(function (cat) {
        return '<button class="filter-chip" data-cat="' + esc(cat.id) + '" ' +
          'aria-pressed="false">' + esc(cat.label) + '</button>';
      }).join('');
    }
    if (sortSelect) sortSelect.value = activeSort;

    function render() {
      var list = ELMA.products.filter(function (p) {
        return activeCat === 'all' || p.category === activeCat;
      });

      if (activeSort === 'price-asc') list.sort(function (a, b) { return a.price - b.price; });
      else if (activeSort === 'price-desc') list.sort(function (a, b) { return b.price - a.price; });
      else if (activeSort === 'name') list.sort(function (a, b) { return a.name.localeCompare(b.name); });

      $$('[data-cat]', chipWrap).forEach(function (chip) {
        chip.setAttribute('aria-pressed', chip.getAttribute('data-cat') === activeCat ? 'true' : 'false');
      });

      if (countEl) {
        countEl.textContent = list.length === 1
          ? '1 product'
          : list.length + ' products';
      }

      grid.innerHTML = list.length
        ? list.map(productCard).join('')
        : '<div class="empty-state"><h3>Nothing in this shelf yet</h3>' +
          '<p>We are building this category out. Try “Everything” in the meantime.</p></div>';
      rescan(grid);

      var url = new URL(window.location.href);
      if (activeCat === 'all') url.searchParams.delete('category');
      else url.searchParams.set('category', activeCat);
      if (activeSort === 'featured') url.searchParams.delete('sort');
      else url.searchParams.set('sort', activeSort);
      window.history.replaceState({}, '', url);
    }

    if (chipWrap) {
      chipWrap.addEventListener('click', function (event) {
        var chip = event.target.closest('[data-cat]');
        if (!chip) return;
        activeCat = chip.getAttribute('data-cat');
        render();
      });
    }
    if (sortSelect) {
      sortSelect.addEventListener('change', function () {
        activeSort = sortSelect.value;
        render();
      });
    }

    render();
  }

  /* ---------- product detail ---------- */
  function initProduct() {
    var root = $('[data-pdp]');
    if (!root) return;

    var id = new URLSearchParams(window.location.search).get('id');
    var product = id ? ELMA.getProduct(id) : null;

    if (!product) {
      root.innerHTML =
        '<div class="empty-state" style="grid-column:1/-1">' +
          '<h3>We could not find that product</h3>' +
          '<p>It may have been renamed or retired.</p>' +
          '<p style="margin-top:22px"><a class="btn-primary" href="shop.html">Back to the shop</a></p>' +
        '</div>';
      document.title = 'Not found — ELMA';
      return;
    }

    document.title = product.name + ' — ' + product.type + ' — ELMA';
    var desc = $('meta[name="description"]');
    if (desc) desc.setAttribute('content', product.tagline);

    root.innerHTML =
      '<div class="pdp-media">' +
        ELMA.picture(product, 'portrait', {
          sizes: '(max-width:900px) 92vw, 46vw',
          eager: true
        }) +
      '</div>' +
      '<div class="pdp-copy">' +
        '<nav class="breadcrumb" aria-label="Breadcrumb">' +
          '<a href="index.html">Home</a><span>/</span>' +
          '<a href="shop.html">Shop</a><span>/</span>' +
          esc(product.name) +
        '</nav>' +
        '<div class="section-eyebrow">' + esc(product.type) + '</div>' +
        '<h1>' + esc(product.name) + '</h1>' +
        '<p class="pdp-tagline">' + esc(product.tagline) + '</p>' +
        '<div class="pdp-price-row">' +
          '<span class="pdp-price">' + money(product.price) + '</span>' +
          (product.compareAt
            ? '<span class="product-size" style="text-decoration:line-through">' +
              money(product.compareAt) + '</span>'
            : '') +
          '<span class="product-size">' + esc(product.size) + '</span>' +
        '</div>' +
        '<p class="pdp-desc">' + esc(product.description) + '</p>' +
        '<div class="pdp-buy">' +
          '<div class="qty-stepper" data-stepper>' +
            '<button type="button" data-step="down" aria-label="Decrease quantity">−</button>' +
            '<input id="pdp-qty" type="number" value="1" min="1" max="99" ' +
              'aria-label="Quantity" inputmode="numeric">' +
            '<button type="button" data-step="up" aria-label="Increase quantity">+</button>' +
          '</div>' +
          '<button class="btn-primary" data-add-to-cart="' + esc(product.id) + '" ' +
            'data-qty-source="#pdp-qty">Add to cart — ' + money(product.price) + '</button>' +
        '</div>' +
        '<dl class="pdp-facts">' +
          '<div class="fact-row"><dt>Best for</dt><dd>' + esc(product.skinTypes) + '</dd></div>' +
          '<div class="fact-row"><dt>Texture</dt><dd>' + esc(product.texture) + '</dd></div>' +
          '<div class="fact-row"><dt>Scent</dt><dd>' + esc(product.scent) + '</dd></div>' +
          '<div class="fact-row"><dt>Size</dt><dd>' + esc(product.size) + '</dd></div>' +
        '</dl>' +
        '<div class="pdp-block">' +
          '<h3>' + (product.includes ? 'What is in the set' : 'Key ingredients') + '</h3>' +
          product.ingredients.map(function (ing) {
            return '<div class="ing-row"><span class="ing-name">' + esc(ing.name) + '</span>' +
              '<span class="ing-desc">' + esc(ing.note) + '</span></div>';
          }).join('') +
        '</div>' +
        '<div class="pdp-block">' +
          '<h3>How to use</h3>' +
          '<ol class="step-list">' +
            product.howToUse.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') +
          '</ol>' +
        '</div>' +
      '</div>';

    initSteppers(root);
    initMobileBuyBar(product);

    // "Pairs with" — same-category siblings, then fill from the rest.
    var related = $('[data-related-grid]');
    if (related) {
      var pool = ELMA.products.filter(function (p) { return p.id !== product.id; });
      pool.sort(function (a, b) {
        var aMatch = a.category === product.category ? 0 : 1;
        var bMatch = b.category === product.category ? 0 : 1;
        return aMatch - bMatch;
      });
      related.innerHTML = pool.slice(0, 3).map(productCard).join('');
    }

    rescan(document);
  }

  /* ---------- mobile buy bar ----------
     Below 900px the desktop sticky media column (see .pdp-media in
     styles.css) is dropped and the buy affordance — name, price, add to
     cart — would scroll away with it. This restores a persistent version:
     a fixed bottom bar that appears once the real .pdp-buy block scrolls
     out of view, and yields before the footer so it never sits on top of
     it. Reuses the existing [data-add-to-cart] delegation (initAddToCart)
     and toast, so add-to-cart behaviour and its aria-live announcement are
     unchanged — this is a new entry point, not new cart logic. */
  function initMobileBuyBar(product) {
    var bar = $('[data-mobile-buy-bar]');
    var buyBlock = $('.pdp-buy');
    if (!product || !bar || !buyBlock) return;

    bar.hidden = false;
    $('[data-mobile-buy-name]', bar).textContent = product.name;
    $('[data-mobile-buy-price]', bar).textContent = money(product.price);
    var cta = $('[data-mobile-buy-cta]', bar);
    cta.setAttribute('data-add-to-cart', product.id);
    cta.setAttribute('aria-label', 'Add ' + product.name + ' to cart — ' + money(product.price));

    // No IntersectionObserver support: rather than guess at scroll math,
    // leave the bar hidden. The desktop-width buy block is still reachable
    // by scrolling up, same as before this feature existed.
    if (!('IntersectionObserver' in window)) return;

    var buyBlockOut = false; // main buy block has scrolled above the viewport
    var nearFooter = false;  // footer is close enough to overlap the bar

    function sync() {
      var visible = buyBlockOut && !nearFooter;
      bar.setAttribute('data-visible', visible ? 'true' : 'false');
      document.body.setAttribute('data-mobile-buy-visible', visible ? 'true' : 'false');
    }

    new IntersectionObserver(function (entries) {
      var entry = entries[entries.length - 1];
      // isIntersecting alone can't tell "scrolled past" from "not reached
      // yet" (both read as not-intersecting) — the bar must stay hidden on
      // load until the block has actually scrolled above the viewport.
      buyBlockOut = !entry.isIntersecting && entry.boundingClientRect.bottom <= 0;
      sync();
    }, { threshold: 0 }).observe(buyBlock);

    var footer = $('.site-footer');
    if (footer) {
      // Positive bottom rootMargin fires this before the footer is actually
      // on screen, giving the .28s hide transition time to finish first.
      new IntersectionObserver(function (entries) {
        var entry = entries[entries.length - 1];
        nearFooter = entry.isIntersecting;
        sync();
      }, { threshold: 0, rootMargin: '0px 0px 240px 0px' }).observe(footer);
    }
  }

  /* ---------- cart page ---------- */
  function initCartPage() {
    var root = $('[data-cart-lines]');
    if (!root) return;

    var summary = $('[data-cart-summary]');
    var promoMsg = $('[data-promo-msg]');

    function renderSummary() {
      if (!summary) return;
      var t = Cart.totals();
      var empty = Cart.count() === 0;

      summary.innerHTML =
        '<h2>Order summary</h2>' +
        '<div class="summary-row"><span>Subtotal</span><span>' + money(t.subtotal) + '</span></div>' +
        (t.discount > 0
          ? '<div class="summary-row"><span class="discount">Promo ' + esc(t.promoCode) +
            ' · ' + esc(t.discountLabel) + '</span><span class="discount">−' +
            money(t.discount) + '</span></div>'
          : '') +
        '<div class="summary-row"><span>Shipping</span><span>' +
          (t.shipping === 0 ? (empty ? '—' : 'Free') : money(t.shipping)) + '</span></div>' +
        '<div class="summary-row"><span>Estimated tax</span><span>' + money(t.tax) + '</span></div>' +
        '<div class="summary-row total"><span>Total</span>' +
          '<span data-number="cart-total" data-number-format="money" ' +
            'data-number-value="' + t.total.toFixed(2) + '">' + money(t.total) + '</span></div>' +
        '<form class="promo-form" data-promo-form>' +
          '<input type="text" name="code" placeholder="Promo code" aria-label="Promo code" ' +
            'value="' + esc(t.promoCode || '') + '" autocomplete="off">' +
          '<button type="submit">Apply</button>' +
        '</form>' +
        '<p class="form-msg" data-promo-msg></p>' +
        '<a class="btn-primary btn-block" href="checkout.html" style="margin-top:20px"' +
          (empty ? ' aria-disabled="true" data-blocked' : '') + '>Checkout</a>' +
        '<p class="summary-note">' +
          (empty
            ? 'Add something to the cart to check out.'
            : t.freeShippingGap > 0
              ? 'You are ' + money(t.freeShippingGap) + ' from free shipping.'
              : 'Free shipping applied. Taxes estimated at checkout.') +
        '</p>';

      bindPromo();
      rescan(summary);
    }

    function bindPromo() {
      var form = $('[data-promo-form]');
      if (!form) return;
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var msg = $('[data-promo-msg]');
        var code = form.elements.code.value.trim().toUpperCase();

        if (!code) {
          Cart.setPromo(null);
          msg.textContent = 'Promo code removed.';
          msg.setAttribute('data-tone', 'ok');
          return;
        }
        if (!PROMOS[code]) {
          msg.textContent = 'That code is not valid.';
          msg.setAttribute('data-tone', 'err');
          return;
        }
        var promo = PROMOS[code];
        var subtotal = Cart.lines().reduce(function (s, l) { return s + l.lineTotal; }, 0);
        if (promo.min && subtotal < promo.min) {
          msg.textContent = code + ' needs a ' + money(promo.min) + ' subtotal.';
          msg.setAttribute('data-tone', 'err');
          return;
        }
        Cart.setPromo(code);
        toast(promo.label + ' applied');
      });
    }

    function render() {
      var lines = Cart.lines();

      if (!lines.length) {
        root.innerHTML =
          '<div class="empty-state">' +
            '<h3>Your cart is empty</h3>' +
            '<p>Nothing here yet — the routine starts with a cleanser.</p>' +
            '<p style="margin-top:22px"><a class="btn-primary" href="shop.html">Shop the range</a></p>' +
          '</div>';
      } else {
        root.innerHTML = lines.map(function (line) {
          var p = line.product;
          return '<div class="cart-line" data-line="' + esc(p.id) + '">' +
            '<a class="cart-line-media" href="product.html?id=' + esc(p.id) + '" ' +
              'aria-label="' + esc(p.name) + '">' +
              ELMA.picture(p, 'square', { sizes: '110px', alt: '' }) + '</a>' +
            '<div>' +
              '<a class="cart-line-name" href="product.html?id=' + esc(p.id) + '">' +
                esc(p.name) + '</a>' +
              '<div class="cart-line-sub">' + esc(p.type) + ' · ' + esc(p.size) +
                ' · ' + money(p.price) + ' each</div>' +
              '<div class="cart-line-controls">' +
                '<div class="qty-stepper" data-stepper>' +
                  '<button type="button" data-step="down" aria-label="Decrease quantity of ' +
                    esc(p.name) + '">−</button>' +
                  '<input type="number" value="' + line.qty + '" min="1" max="99" ' +
                    'inputmode="numeric" data-qty="' + esc(p.id) + '" ' +
                    'aria-label="Quantity of ' + esc(p.name) + '">' +
                  '<button type="button" data-step="up" aria-label="Increase quantity of ' +
                    esc(p.name) + '">+</button>' +
                '</div>' +
                '<button class="link-danger" data-remove="' + esc(p.id) + '">Remove</button>' +
              '</div>' +
            '</div>' +
            '<div class="cart-line-price">' + money(line.lineTotal) + '</div>' +
          '</div>';
        }).join('');
        initSteppers(root);
      }

      rescan(root);
      renderSummary();
    }

    root.addEventListener('change', function (event) {
      var input = event.target.closest('[data-qty]');
      if (!input) return;
      Cart.setQty(input.getAttribute('data-qty'), parseInt(input.value, 10) || 1);
    });

    root.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-remove]');
      if (!btn) return;
      var id = btn.getAttribute('data-remove');
      var product = ELMA.getProduct(id);
      Cart.remove(id);
      if (product) toast(product.name + ' removed');
    });

    document.addEventListener('click', function (event) {
      var blocked = event.target.closest('[data-blocked]');
      if (blocked) event.preventDefault();
    });

    document.addEventListener('elma:cartchange', render);
    render();
  }

  /* ---------- checkout ---------- */
  function orderRef() {
    var stamp = new Date().getTime().toString(36).toUpperCase();
    return 'ELMA-' + stamp.slice(-6);
  }

  function initCheckout() {
    var form = $('[data-checkout-form]');
    if (!form) return;

    var summary = $('[data-checkout-summary]');
    var done = $('[data-checkout-done]');
    var panel = $('[data-checkout-panel]');

    function renderSummary() {
      if (!summary) return;
      var lines = Cart.lines();
      var t = Cart.totals();

      if (!lines.length) {
        summary.innerHTML =
          '<h2>Order summary</h2>' +
          '<p class="summary-note">Your cart is empty. ' +
          '<a href="shop.html" style="border-bottom:1px solid">Shop the range</a>.</p>';
        return;
      }

      summary.innerHTML =
        '<h2>Order summary</h2>' +
        lines.map(function (l) {
          return '<div class="summary-row"><span>' + esc(l.product.name) + ' × ' + l.qty +
            '</span><span>' + money(l.lineTotal) + '</span></div>';
        }).join('') +
        '<div class="summary-row" style="border-top:1px solid var(--line);margin-top:10px;padding-top:16px">' +
          '<span>Subtotal</span><span>' + money(t.subtotal) + '</span></div>' +
        (t.discount > 0
          ? '<div class="summary-row"><span class="discount">Promo ' + esc(t.promoCode) +
            '</span><span class="discount">−' + money(t.discount) + '</span></div>'
          : '') +
        '<div class="summary-row"><span>Shipping</span><span>' +
          (t.shipping === 0 ? 'Free' : money(t.shipping)) + '</span></div>' +
        '<div class="summary-row"><span>Estimated tax</span><span>' + money(t.tax) + '</span></div>' +
        '<div class="summary-row total"><span>Total</span>' +
          '<span data-number="checkout-total" data-number-format="money" ' +
            'data-number-value="' + t.total.toFixed(2) + '">' + money(t.total) + '</span></div>' +
        '<p class="summary-note">This is a demo storefront — no card is charged and no ' +
        'payment details are transmitted anywhere.</p>';

      rescan(summary);
    }

    var RULES = {
      email: function (v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : 'Enter a valid email address.';
      },
      name: function (v) { return v.trim().length >= 2 ? '' : 'Enter your full name.'; },
      address: function (v) { return v.trim().length >= 5 ? '' : 'Enter a street address.'; },
      city: function (v) { return v.trim().length >= 2 ? '' : 'Enter a city.'; },
      postal: function (v) { return /^[A-Za-z0-9][A-Za-z0-9\s-]{2,9}$/.test(v.trim()) ? '' : 'Enter a valid postal code.'; },
      country: function (v) { return v ? '' : 'Select a country.'; },
      card: function (v) {
        return v.replace(/\D/g, '').length >= 12 ? '' : 'Enter a card number (any digits — demo only).';
      },
      expiry: function (v) { return /^\d{2}\s*\/\s*\d{2}$/.test(v.trim()) ? '' : 'Use MM/YY.'; },
      cvc: function (v) { return /^\d{3,4}$/.test(v.trim()) ? '' : '3 or 4 digits.'; }
    };

    function validateField(field) {
      var rule = RULES[field.getAttribute('data-rule')];
      if (!rule) return true;
      var error = rule(field.value);
      var slot = field.parentElement.querySelector('.field-error');
      if (slot) slot.textContent = error;
      field.setAttribute('aria-invalid', error ? 'true' : 'false');
      return !error;
    }

    $$('[data-rule]', form).forEach(function (field) {
      field.addEventListener('blur', function () { validateField(field); });
      field.addEventListener('input', function () {
        if (field.getAttribute('aria-invalid') === 'true') validateField(field);
      });
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      if (Cart.count() === 0) {
        toast('Your cart is empty');
        return;
      }

      var fields = $$('[data-rule]', form);
      var firstBad = null;
      fields.forEach(function (field) {
        if (!validateField(field) && !firstBad) firstBad = field;
      });

      if (firstBad) {
        firstBad.focus();
        toast('Check the highlighted fields');
        return;
      }

      var totals = Cart.totals();
      var ref = orderRef();
      var email = form.elements.email.value.trim();
      writeJSON(ORDER_KEY, {
        ref: ref,
        email: email,
        total: totals.total,
        lines: Cart.lines().map(function (l) {
          return { name: l.product.name, qty: l.qty, total: l.lineTotal };
        })
      });
      Cart.clear();
      Cart.setPromo(null);

      if (panel) panel.hidden = true;
      if (done) {
        done.hidden = false;
        $('[data-order-ref]', done).textContent = ref;
        $('[data-order-email]', done).textContent = email;
        $('[data-order-total]', done).textContent = money(totals.total);
        done.scrollIntoView({ behavior: 'smooth', block: 'start' });
        $('h1', done).focus();
      }
    });

    document.addEventListener('elma:cartchange', renderSummary);
    renderSummary();
  }

  /* ---------- newsletter + contact ---------- */
  function initSimpleForms() {
    $$('[data-newsletter]').forEach(function (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var input = $('input[type="email"]', form);
        var msg = form.parentElement.querySelector('.form-msg');
        var valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.value.trim());

        if (msg) {
          msg.textContent = valid
            ? 'You are on the list. Watch for a note about founding-member pricing.'
            : 'That email does not look right — check it and try again.';
          msg.setAttribute('data-tone', valid ? 'ok' : 'err');
        }
        input.setAttribute('aria-invalid', valid ? 'false' : 'true');
        if (valid) {
          form.reset();
          toast('Subscribed');
        }
      });
    });

    $$('[data-contact-form]').forEach(function (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var msg = form.querySelector('.form-msg');
        var ok = true;

        $$('[data-required]', form).forEach(function (field) {
          var value = field.value.trim();
          var bad = field.type === 'email'
            ? !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)
            : value.length < 2;
          var slot = field.parentElement.querySelector('.field-error');
          if (slot) slot.textContent = bad ? 'This field is required.' : '';
          field.setAttribute('aria-invalid', bad ? 'true' : 'false');
          if (bad) ok = false;
        });

        if (!ok) {
          if (msg) {
            msg.textContent = 'Please complete the highlighted fields.';
            msg.setAttribute('data-tone', 'err');
          }
          return;
        }

        form.reset();
        if (msg) {
          msg.textContent = 'Thank you — our team replies within one business day.';
          msg.setAttribute('data-tone', 'ok');
        }
        toast('Message sent');
      });
    });
  }

  /* ---------- accordion ---------- */
  function initAccordion() {
    $$('.acc-trigger').forEach(function (trigger) {
      trigger.addEventListener('click', function () {
        var panel = document.getElementById(trigger.getAttribute('aria-controls'));
        var open = trigger.getAttribute('aria-expanded') === 'true';
        trigger.setAttribute('aria-expanded', open ? 'false' : 'true');
        if (panel) panel.setAttribute('data-open', open ? 'false' : 'true');
      });
    });
  }

  /* ---------- boot ---------- */
  function boot() {
    initNav();
    initAddToCart();
    initSteppers();
    initFeatured();
    initShop();
    initProduct();
    initCartPage();
    initCheckout();
    initSimpleForms();
    initAccordion();
    renderCartCount();
    document.addEventListener('elma:cartchange', renderCartCount);
    // Cart edited in another tab — keep this one honest.
    window.addEventListener('storage', function (event) {
      if (event.key === CART_KEY) {
        renderCartCount();
        document.dispatchEvent(new CustomEvent('elma:cartchange'));
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
