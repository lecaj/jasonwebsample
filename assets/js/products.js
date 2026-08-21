/* ==========================================================================
   ELMA — product catalogue
   Static data source for the storefront. Swap for an API call later; the
   rest of the site only reads through ELMA.getProduct / ELMA.products.
   ========================================================================== */
(function () {
  'use strict';

  var CATEGORIES = [
    { id: 'all', label: 'Everything' },
    { id: 'cleanse', label: 'Cleanse' },
    { id: 'treat', label: 'Treat' },
    { id: 'hydrate', label: 'Hydrate' },
    { id: 'protect', label: 'Protect' },
    { id: 'sets', label: 'Sets' }
  ];

  var PRODUCTS = [
    {
      id: 'morning-dew-cleanser',
      name: 'Morning Dew',
      type: 'Gel-to-milk cleanser',
      category: 'cleanse',
      price: 28,
      size: '150 ml',
      form: 'pump',
      badge: null,
      tagline: 'A low-foam cleanse that takes the night off without taking the barrier with it.',
      description:
        'Most cleansers are built to squeak. This one is built to leave your skin exactly where it started — comfortable, soft, and still holding its own moisture. Morning Dew starts as a light gel, turns to milk under water, and rinses without a film. No sulfates, no drying alcohols, no tightness at minute three.',
      skinTypes: 'All skin types, including sensitive',
      texture: 'Clear gel → soft milk',
      scent: 'Fragrance-free',
      ingredients: [
        { name: 'Glycerin 5%', note: 'Draws water into the skin while it cleanses' },
        { name: 'Coco-glucoside', note: 'Sugar-derived surfactant, sulfate-free' },
        { name: 'Oat kernel extract', note: 'Calms the flush that harsh cleansers leave behind' },
        { name: 'Panthenol (B5)', note: 'Barrier support, post-cleanse comfort' }
      ],
      howToUse: [
        'Massage a pump into dry or damp skin for thirty seconds.',
        'Add water — the gel turns to milk and lifts sunscreen and makeup.',
        'Rinse and move straight to serum while skin is still slightly damp.'
      ]
    },
    {
      id: 'soft-focus-toner',
      name: 'Soft Focus',
      type: 'PHA resurfacing toner',
      category: 'cleanse',
      price: 34,
      size: '200 ml',
      form: 'bottle',
      badge: null,
      tagline: 'Gentle acid resurfacing for people who have been burned by acids before.',
      description:
        'PHAs have a larger molecule than glycolic acid, so they work at the surface instead of racing to the bottom. That means the smoothing without the sting. Use it three nights a week and texture softens, tone evens, and everything you layer after it absorbs faster.',
      skinTypes: 'Normal, combination, congested — sensitive-friendly',
      texture: 'Watery, non-sticky',
      scent: 'Fragrance-free',
      ingredients: [
        { name: 'Gluconolactone 4%', note: 'PHA — resurfaces without deep-penetrating sting' },
        { name: 'Lactobionic acid 2%', note: 'Humectant PHA, holds water at the surface' },
        { name: 'Centella asiatica', note: 'Offsets irritation from the exfoliating step' },
        { name: 'Betaine', note: 'Keeps the acid step from dehydrating skin' }
      ],
      howToUse: [
        'Sweep over clean, dry skin with a cotton pad or fingertips.',
        'Start at three nights a week; build up only if skin stays calm.',
        'Always follow with SPF the next morning.'
      ]
    },
    {
      id: 'quiet-hour-serum',
      name: 'Quiet Hour',
      type: 'Hydrating serum',
      category: 'hydrate',
      price: 48,
      size: '30 ml',
      form: 'dropper',
      badge: 'Bestseller',
      tagline: 'Five weights of hyaluronic acid, one very calm result.',
      description:
        'Single-weight hyaluronic acid sits on top and evaporates. Quiet Hour uses five molecular weights so hydration lands at different depths and actually stays. Niacinamide steadies tone and oil, and the whole thing layers under cream or makeup without pilling.',
      skinTypes: 'All skin types, especially dehydrated',
      texture: 'Light, slightly slippy serum',
      scent: 'Fragrance-free',
      ingredients: [
        { name: 'Multi-weight hyaluronic acid', note: 'Five molecular weights for layered hydration' },
        { name: 'Niacinamide 4%', note: 'Evens tone and moderates oil without flushing' },
        { name: 'Ceramide NP', note: 'Replaces what the barrier loses daily' },
        { name: 'Panthenol (B5)', note: 'Soothes and holds water' }
      ],
      howToUse: [
        'Apply three to four drops to damp skin, morning and night.',
        'Press in — do not rub — while skin is still wet from cleansing.',
        'Seal with Second Skin so the water has somewhere to stay.'
      ]
    },
    {
      id: 'slow-light-vitamin-c',
      name: 'Slow Light',
      type: 'Stabilised vitamin C serum',
      category: 'treat',
      price: 54,
      size: '30 ml',
      form: 'dropper',
      badge: null,
      tagline: 'Brightening that does not oxidise into an orange mess by week three.',
      description:
        'L-ascorbic acid is effective and famously unstable. Slow Light uses a stabilised derivative at a meaningful dose, buffered with vitamin E and ferulic acid, in an opaque airless bottle. The result: visible tone work over eight to twelve weeks, with none of the tingle-and-toss cycle.',
      skinTypes: 'All skin types — dull, uneven, sun-marked',
      texture: 'Silky, fast-absorbing',
      scent: 'Fragrance-free',
      ingredients: [
        { name: 'THD ascorbate 10%', note: 'Oil-soluble vitamin C — stable and non-stinging' },
        { name: 'Ferulic acid', note: 'Extends antioxidant life in the bottle and on skin' },
        { name: 'Vitamin E', note: 'Works with C to buffer daily oxidative load' },
        { name: 'Squalane', note: 'Carries the actives without a greasy finish' }
      ],
      howToUse: [
        'Use in the morning, after cleansing, before moisturiser.',
        'Three to four drops across the face, neck, and back of hands.',
        'Follow with Daybreak SPF — vitamin C and sunscreen work as a pair.'
      ]
    },
    {
      id: 'night-ritual-retinal',
      name: 'Night Ritual',
      type: 'Encapsulated retinal treatment',
      category: 'treat',
      price: 62,
      size: '30 ml',
      form: 'dropper',
      badge: 'New',
      tagline: 'Retinal, released slowly, so the results arrive before the peeling does.',
      description:
        'Retinal converts to retinoic acid in one step instead of two, so it works faster than retinol at a lower dose. Encapsulating it slows the release across the night, which is the difference between a retinoid that works and a retinoid abandoned in a drawer after ten days of flaking.',
      skinTypes: 'Normal to resilient — introduce slowly if sensitive',
      texture: 'Cushiony fluid',
      scent: 'Fragrance-free',
      ingredients: [
        { name: 'Encapsulated retinal 0.05%', note: 'Time-released across the night' },
        { name: 'Bakuchiol 0.5%', note: 'Supports the retinoid effect, offsets irritation' },
        { name: 'Ceramide complex', note: 'Keeps the barrier intact through the adjustment weeks' },
        { name: 'Allantoin', note: 'Calms the first two weeks of use' }
      ],
      howToUse: [
        'Nights only. Start twice weekly and build to alternate nights.',
        'Apply to dry skin after cleansing, before moisturiser.',
        'Never skip SPF the following morning.',
        'Not for use during pregnancy — speak to your doctor.'
      ]
    },
    {
      id: 'second-skin-cream',
      name: 'Second Skin',
      type: 'Barrier repair cream',
      category: 'hydrate',
      price: 46,
      size: '50 ml',
      form: 'jar',
      badge: 'Bestseller',
      tagline: 'The ceramide ratio your barrier actually builds itself from.',
      description:
        'Healthy skin is roughly 3:1:1 ceramides, cholesterol, and fatty acids. Get the ratio wrong and a rich cream can slow repair down. Second Skin matches it. Rich enough to finish a winter routine, light enough that it disappears under makeup.',
      skinTypes: 'Dry, compromised, or post-retinoid skin',
      texture: 'Whipped cream, matte finish',
      scent: 'Fragrance-free',
      ingredients: [
        { name: 'Ceramides NP, AP, EOP', note: 'The three your barrier is mostly built from' },
        { name: 'Cholesterol + fatty acids', note: 'Held at the 3:1:1 physiological ratio' },
        { name: 'Squalane', note: 'Plant-derived, non-comedogenic emollient' },
        { name: 'Beta-glucan', note: 'Soothes reactive, over-exfoliated skin' }
      ],
      howToUse: [
        'Warm a pea-sized amount between fingertips.',
        'Press over serum as the last step of your evening routine.',
        'Use morning too if skin is dry or you are deep into retinoid weeks.'
      ]
    },
    {
      id: 'daybreak-spf',
      name: 'Daybreak',
      type: 'Mineral SPF 40',
      category: 'protect',
      price: 38,
      size: '50 ml',
      form: 'tube',
      badge: null,
      tagline: 'Mineral protection with no cast, no pilling, no argument at 7am.',
      description:
        'The best sunscreen is the one you will wear daily. Daybreak micronises zinc oxide into a tinted base that disappears across a wide range of skin tones, sits flat under makeup, and does not roll up when you layer it over serum. Broad spectrum SPF 40.',
      skinTypes: 'All skin types — the non-negotiable step',
      texture: 'Lightly tinted lotion, satin finish',
      scent: 'Fragrance-free',
      ingredients: [
        { name: 'Zinc oxide 14%', note: 'Broad-spectrum mineral filter, micronised' },
        { name: 'Iron oxides', note: 'Neutralises white cast, screens visible light' },
        { name: 'Vitamin E', note: 'Antioxidant support under daily exposure' },
        { name: 'Glycerin', note: 'Keeps the finish comfortable, not chalky' }
      ],
      howToUse: [
        'Two finger-lengths across face and neck, every morning.',
        'Apply as the final step, after moisturiser, before makeup.',
        'Reapply every two hours in direct sun.'
      ]
    },
    {
      id: 'the-daily-ritual-set',
      name: 'The Daily Ritual',
      type: 'Four-step routine set',
      category: 'sets',
      price: 148,
      compareAt: 180,
      size: 'Full sizes × 4',
      form: 'set',
      badge: 'Save $32',
      tagline: 'The whole routine, in the order it is meant to go on.',
      description:
        'Morning Dew, Quiet Hour, Second Skin, and Daybreak — cleanse, hydrate, seal, protect. It is the shortest routine we would actually recommend to someone starting from nothing, and the four products most of our customers end up repurchasing anyway. Full sizes, thirty-two dollars less than buying them apart.',
      skinTypes: 'All skin types — a complete starting routine',
      texture: 'Four full-size products',
      scent: 'Fragrance-free throughout',
      includes: ['morning-dew-cleanser', 'quiet-hour-serum', 'second-skin-cream', 'daybreak-spf'],
      ingredients: [
        { name: 'Morning Dew', note: 'Gel-to-milk cleanser, 150 ml' },
        { name: 'Quiet Hour', note: 'Hydrating serum, 30 ml' },
        { name: 'Second Skin', note: 'Barrier repair cream, 50 ml' },
        { name: 'Daybreak', note: 'Mineral SPF 40, 50 ml' }
      ],
      howToUse: [
        'Morning: cleanse, hydrate, seal, protect.',
        'Evening: cleanse, hydrate, seal — skip the SPF.',
        'Give it four weeks before you judge it. Skin turns over slowly.'
      ]
    }
  ];

  /* --- product artwork -------------------------------------------------
     Inline SVG rather than raster assets: no image pipeline, scales cleanly,
     and picks up the brand palette directly.
  --------------------------------------------------------------------- */
  function art(form) {
    var cap = '#4A1C28';
    var glass = 'rgba(110,42,58,0.32)';
    var liquid = '#6E2A3A';
    var label = 'rgba(244,237,226,0.92)';

    var shapes = {
      dropper:
        '<rect x="34" y="16" width="32" height="10" rx="3" fill="' + cap + '"/>' +
        '<rect x="44" y="26" width="12" height="18" fill="' + cap + '"/>' +
        '<rect x="24" y="44" width="52" height="130" rx="10" fill="' + glass + '"/>' +
        '<rect x="24" y="94" width="52" height="80" rx="10" fill="' + liquid + '" opacity="0.8"/>' +
        '<rect x="34" y="112" width="32" height="2" rx="1" fill="' + label + '"/>' +
        '<rect x="34" y="120" width="20" height="2" rx="1" fill="' + label + '" opacity="0.6"/>',
      pump:
        '<rect x="46" y="10" width="8" height="16" fill="' + cap + '"/>' +
        '<rect x="34" y="26" width="32" height="14" rx="4" fill="' + cap + '"/>' +
        '<rect x="22" y="40" width="56" height="140" rx="12" fill="' + glass + '"/>' +
        '<rect x="22" y="86" width="56" height="94" rx="12" fill="' + liquid + '" opacity="0.72"/>' +
        '<rect x="33" y="108" width="34" height="2" rx="1" fill="' + label + '"/>' +
        '<rect x="33" y="116" width="22" height="2" rx="1" fill="' + label + '" opacity="0.6"/>',
      bottle:
        '<rect x="40" y="12" width="20" height="14" rx="3" fill="' + cap + '"/>' +
        '<path d="M32 26h36l10 24v122a8 8 0 0 1-8 8H30a8 8 0 0 1-8-8V50z" fill="' + glass + '"/>' +
        '<path d="M22 96h56v76a8 8 0 0 1-8 8H30a8 8 0 0 1-8-8z" fill="' + liquid + '" opacity="0.68"/>' +
        '<rect x="33" y="116" width="34" height="2" rx="1" fill="' + label + '"/>' +
        '<rect x="33" y="124" width="20" height="2" rx="1" fill="' + label + '" opacity="0.6"/>',
      jar:
        '<rect x="18" y="52" width="64" height="18" rx="6" fill="' + cap + '"/>' +
        '<rect x="22" y="70" width="56" height="86" rx="10" fill="' + glass + '"/>' +
        '<rect x="22" y="102" width="56" height="54" rx="10" fill="' + liquid + '" opacity="0.6"/>' +
        '<rect x="34" y="122" width="32" height="2" rx="1" fill="' + label + '"/>' +
        '<rect x="34" y="130" width="18" height="2" rx="1" fill="' + label + '" opacity="0.6"/>',
      tube:
        '<rect x="42" y="14" width="16" height="12" rx="3" fill="' + cap + '"/>' +
        '<path d="M26 26h48v146a8 8 0 0 1-8 8H34a8 8 0 0 1-8-8z" fill="' + liquid + '" opacity="0.78"/>' +
        '<path d="M26 170h48v2a8 8 0 0 1-8 8H34a8 8 0 0 1-8-8z" fill="' + cap + '"/>' +
        '<rect x="36" y="96" width="28" height="2" rx="1" fill="' + label + '"/>' +
        '<rect x="36" y="104" width="18" height="2" rx="1" fill="' + label + '" opacity="0.6"/>',
      set:
        '<rect x="4" y="70" width="30" height="96" rx="8" fill="' + glass + '"/>' +
        '<rect x="4" y="110" width="30" height="56" rx="8" fill="' + liquid + '" opacity="0.66"/>' +
        '<rect x="12" y="58" width="14" height="12" rx="3" fill="' + cap + '"/>' +
        '<rect x="38" y="46" width="26" height="120" rx="8" fill="' + glass + '"/>' +
        '<rect x="38" y="98" width="26" height="68" rx="8" fill="' + liquid + '" opacity="0.74"/>' +
        '<rect x="44" y="34" width="14" height="12" rx="3" fill="' + cap + '"/>' +
        '<rect x="68" y="96" width="28" height="70" rx="8" fill="' + glass + '"/>' +
        '<rect x="68" y="126" width="28" height="40" rx="8" fill="' + liquid + '" opacity="0.6"/>' +
        '<rect x="66" y="84" width="32" height="12" rx="5" fill="' + cap + '"/>'
    };

    return (
      '<svg viewBox="0 0 100 200" role="img" aria-hidden="true" focusable="false" ' +
      'xmlns="http://www.w3.org/2000/svg">' +
      (shapes[form] || shapes.bottle) +
      '</svg>'
    );
  }

  window.ELMA = window.ELMA || {};
  window.ELMA.products = PRODUCTS;
  window.ELMA.categories = CATEGORIES;
  window.ELMA.art = art;
  window.ELMA.getProduct = function (id) {
    for (var i = 0; i < PRODUCTS.length; i++) {
      if (PRODUCTS[i].id === id) return PRODUCTS[i];
    }
    return null;
  };
})();
