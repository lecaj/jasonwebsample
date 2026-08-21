#!/usr/bin/env python3
"""
ELMA — product image generator
==============================

Renders the storefront's product imagery and all responsive derivatives, then
writes them into assets/img/. Run it from the repo root:

    python3 tools/generate-images.py

Requires Pillow (raster work) and ffmpeg (AVIF encode). Both are dev-time only —
the site itself stays a static, build-free set of HTML files.

WHY THIS EXISTS
---------------
The storefront shipped with zero photography: every product was a CSS/SVG shape.
Real photography is the right answer and is not ours to invent, so this script
produces *art-directed stand-ins* at the exact aspect ratios, filenames, and
derivative sizes the real photographs will use. Swapping in a real shoot means
dropping masters into tools/masters/<product-id>.<ext> and re-running — no
markup, CSS, or JS changes anywhere in the site.

These are rendered studio stills, not photographs, and the site says so. They
are generated here from primitives, so they carry no licence encumbrance.

OUTPUT CONTRACT (assets/js/products.js and assets/css/styles.css depend on it)
-----------------------------------------------------------------------------
    assets/img/products/<id>/square-{400,800}.{avif,webp,jpg}    1:1    framed
    assets/img/products/<id>/portrait-{600,1200}.{avif,webp,jpg} 1:1.05 framed
    assets/img/products/<id>/cutout-{300,600}.{avif,webp,png}    1:2    alpha

"framed" shots bake in the backdrop and are used wherever the product sits in a
tile (shop grid, PDP, cart lines). "cutout" shots are transparent and are used
wherever the product floats on the page (hero, about, ingredient panel).
"""

import json
import math
import os
import shutil
import subprocess
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_ROOT = os.path.join(ROOT, 'assets', 'img', 'products')

# --------------------------------------------------------------------------
# Brand palette — kept in lockstep with the :root tokens in styles.css
# --------------------------------------------------------------------------
OAT = (244, 237, 226)
OAT_DEEP = (234, 224, 207)
OAT_SOFT = (250, 246, 239)
WINE = (110, 42, 58)
WINE_DEEP = (74, 28, 40)
BLUSH = (231, 207, 192)
SAGE = (124, 138, 107)
INK = (42, 33, 29)

SERIF = '/usr/share/fonts/truetype/noto/NotoSerifDisplay-Regular.ttf'
SANS = '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'


# --------------------------------------------------------------------------
# colour helpers
# --------------------------------------------------------------------------
def clamp8(v):
    return max(0, min(255, int(round(v))))


def mix(a, b, t):
    return tuple(clamp8(a[i] + (b[i] - a[i]) * t) for i in range(3))


def tone(c, f):
    """Scale a colour by a lighting factor. f<1 darkens, f>1 lifts to white."""
    if f <= 1.0:
        return tuple(clamp8(v * f) for v in c)
    t = min(1.0, f - 1.0)
    return tuple(clamp8(v + (255 - v) * t * 0.85) for v in c)


# --------------------------------------------------------------------------
# gradient primitives (no numpy on this box — small images + resize instead)
# --------------------------------------------------------------------------
_RADIAL = ImageOps.invert(Image.radial_gradient('L'))  # 255 at centre → 0 at edge


def vgrad(size, top, bottom):
    """Vertical linear gradient."""
    g = Image.linear_gradient('L').resize(size, Image.BICUBIC)
    return Image.composite(Image.new('RGB', size, bottom), Image.new('RGB', size, top), g)


def pool_mask(size, center, radius, strength=1.0, falloff=1.7):
    """Soft circular mask — used for light pools and vignettes."""
    d = max(2, int(radius * 2))
    m = _RADIAL.resize((d, d), Image.BICUBIC)
    canvas = Image.new('L', size, 0)
    canvas.paste(m, (int(center[0] - radius), int(center[1] - radius)))
    return canvas.point(lambda v: clamp8((v / 255.0) ** falloff * 255 * strength))


def cyl_fill(size, base, spec=0.30, spec_w=0.115, spec_gain=0.55,
             edge=0.42, edge_pow=2.3, rim=0.30, rim_at=0.945, rim_w=0.05,
             top_f=1.05, bot_f=0.87):
    """
    A cylinder's worth of lighting as a flat image.

    Everything on this page is a bottle, and a bottle photographed head-on has
    the same luminance signature every time: dark at both edges, one bright
    specular band about a third in from the key light, and a thin rim light
    where the far edge catches the fill. Bake that into a horizontal ramp once
    and mask it to any shape and the shape reads as round.
    """
    w, h = max(1, size[0]), max(1, size[1])
    n = 384
    data = []
    for vf in (top_f, 1.0, bot_f):
        for i in range(n):
            t = (i + 0.5) / n
            f = 1.0 - edge * (abs(t - 0.5) * 2.0) ** edge_pow
            f += spec_gain * math.exp(-(((t - spec) / spec_w) ** 2))
            f += rim * math.exp(-(((t - rim_at) / rim_w) ** 2))
            data.append(tone(base, f * vf))
    strip = Image.new('RGB', (n, 3))
    strip.putdata(data)
    return strip.resize((w, h), Image.BICUBIC)


def grain(size, amount=7, seed=1):
    """Deterministic film grain. Real product shots are never perfectly flat."""
    w, h = max(1, size[0] // 2), max(1, size[1] // 2)
    state = seed * 2654435761 % (2 ** 32)
    px = []
    for _ in range(w * h):
        state = (1103515245 * state + 12345) % (2 ** 31)
        px.append(128 + ((state >> 8) % (2 * amount + 1)) - amount)
    n = Image.new('L', (w, h))
    n.putdata(px)
    return n.resize(size, Image.BICUBIC)


def apply_grain(img, amount=7, seed=1):
    g = grain(img.size, amount, seed).convert('RGB')
    return ImageChops.overlay(img, g)


# --------------------------------------------------------------------------
# vessel geometry
#
# Each form is described in a normalised 0..1 box. `scale` is how much of the
# frame's product height the form gets — a 50 ml jar has no business being as
# tall as a 200 ml toner bottle, and matching the real volumes is most of what
# makes a range shot look like a range shot.
# --------------------------------------------------------------------------
FORMS = {
    'dropper': {
        'aspect': 0.46, 'scale': 0.90, 'glass': True, 'liquid_top': 0.44,
        'label': (0.20, 0.52, 0.80, 0.79),
        'parts': [
            # a pipette bulb: wide flat crown over a knurled collar, not a pump
            ('cap', 'rrect', (0.22, 0.000, 0.78, 0.052), 0.09),
            ('cap', 'rrect', (0.28, 0.045, 0.72, 0.135), 0.05),
            ('neck', 'rrect', (0.36, 0.128, 0.64, 0.190), 0.03),
            ('body', 'rrect', (0.14, 0.180, 0.86, 1.000), 0.10),
        ],
    },
    'pump': {
        'aspect': 0.50, 'scale': 1.00, 'glass': True, 'liquid_top': 0.40,
        'label': (0.17, 0.47, 0.83, 0.75),
        'parts': [
            ('cap', 'rrect', (0.455, 0.000, 0.62, 0.040), 0.35),
            ('cap', 'rrect', (0.375, 0.032, 0.625, 0.082), 0.30),
            ('neck', 'rrect', (0.44, 0.078, 0.56, 0.130), 0.06),
            ('cap', 'rrect', (0.33, 0.122, 0.67, 0.180), 0.20),
            ('body', 'rrect', (0.10, 0.165, 0.90, 1.000), 0.11),
        ],
    },
    'bottle': {
        'aspect': 0.52, 'scale': 1.00, 'glass': True, 'liquid_top': 0.38,
        'label': (0.15, 0.47, 0.85, 0.77),
        'parts': [
            ('cap', 'rrect', (0.35, 0.000, 0.65, 0.080), 0.22),
            ('neck', 'rrect', (0.41, 0.072, 0.59, 0.135), 0.05),
            ('body', 'poly', [(0.41, 0.130), (0.59, 0.130), (0.90, 0.290),
                              (0.90, 1.000), (0.10, 1.000), (0.10, 0.290)], 0.0),
            ('body', 'rrect', (0.10, 0.270, 0.90, 1.000), 0.09),
        ],
    },
    'jar': {
        'aspect': 1.10, 'scale': 0.50, 'glass': True, 'liquid_top': 0.62,
        'label': (0.24, 0.66, 0.76, 0.90),
        'parts': [
            ('cap', 'rrect', (0.04, 0.000, 0.96, 0.300), 0.14),
            ('cap', 'rrect', (0.01, 0.255, 0.99, 0.360), 0.10),
            ('body', 'rrect', (0.06, 0.345, 0.94, 1.000), 0.10),
        ],
    },
    'tube': {
        'aspect': 0.44, 'scale': 0.92, 'glass': False, 'liquid_top': 0.14,
        'label': (0.20, 0.40, 0.80, 0.72),
        'parts': [
            ('cap', 'rrect', (0.36, 0.000, 0.64, 0.062), 0.22),
            ('neck', 'rrect', (0.43, 0.055, 0.57, 0.105), 0.04),
            ('body', 'poly', [(0.43, 0.100), (0.57, 0.100), (0.86, 0.215),
                              (0.86, 1.000), (0.14, 1.000), (0.14, 0.215)], 0.0),
            ('body', 'rrect', (0.14, 0.200, 0.86, 0.955), 0.07),
            ('cap', 'rrect', (0.135, 0.900, 0.865, 1.000), 0.02),
        ],
    },
}

# The set shot stages the four steps of the routine at their real relative
# heights. Entries name a catalogue product rather than a bare form, so the
# vessel in the group shot is drawn from the same tint, name and size as its
# own product page — the two can't drift apart.
#
# `cx` is the centre-x within the set box; the vessels overlap slightly, the
# way a real group shot stages them. `z` is paint order: lower numbers go down
# first, so the shortest vessel is drawn last and reads as nearest the camera.
SET_LAYOUT = [
    # (product id,            cx,     height mult, z)
    ('second-skin-cream',     0.1749, 1.00, 3),  # seal    — shortest, in front
    ('morning-dew-cleanser',  0.4411, 1.00, 0),  # cleanse — tallest, at the back
    ('daybreak-spf',          0.6652, 1.00, 1),  # protect
    ('quiet-hour-serum',      0.8643, 1.00, 2),  # hydrate
]


def rrect_mask(size, box, radius):
    """Rounded-rectangle mask in pixel coordinates."""
    m = Image.new('L', size, 0)
    d = ImageDraw.Draw(m)
    x0, y0, x1, y1 = box
    r = max(0, min(radius, (x1 - x0) / 2 - 1, (y1 - y0) / 2 - 1))
    if r <= 0:
        d.rectangle((x0, y0, x1, y1), fill=255)
    else:
        d.rounded_rectangle((x0, y0, x1, y1), radius=r, fill=255)
    return m


def poly_mask(size, pts):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    return m


def label_text(layer, box, name, sub, tint):
    """Draw the packaging label. At catalogue scale this is mostly texture."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    if w < 24 or h < 20:
        return

    plate = Image.new('RGBA', (int(w), int(h)), (0, 0, 0, 0))
    pd = ImageDraw.Draw(plate)
    paper = mix(OAT_SOFT, tint, 0.06)
    pd.rounded_rectangle((0, 0, w - 1, h - 1), radius=h * 0.06,
                         fill=paper + (238,))

    ink = mix(WINE_DEEP, paper, 0.08)

    def fit(path, text, start, max_w):
        """Shrink until the string clears the plate. Names vary in length."""
        for size in range(start, 5, -1):
            try:
                f = ImageFont.truetype(path, size)
            except OSError:
                return None
            if pd.textlength(text, font=f) <= max_w:
                return f
        return None

    sub_text = ' '.join(sub.upper())
    f_name = fit(SERIF, name, max(8, int(h * 0.235)), w * 0.84)
    f_sub = fit(SANS, sub_text, max(6, int(h * 0.090)), w * 0.62)

    if f_name:
        pd.text((w / 2, h * 0.36), name, font=f_name, fill=ink + (255,), anchor='mm')
        pd.line((w * 0.30, h * 0.585, w * 0.70, h * 0.585),
                fill=ink + (110,), width=max(1, int(h * 0.012)))
    if f_sub:
        pd.text((w / 2, h * 0.72), sub_text, font=f_sub, fill=ink + (190,), anchor='mm')

    layer.alpha_composite(plate, (int(x0), int(y0)))


def draw_vessel(size, box, form, tint, name, sub, seed=1):
    """
    Render one vessel into a transparent RGBA layer, plus its silhouette mask.

    Returns (layer, mask). The mask is what the contact shadow and the
    reflection are built from, so it has to be the union of every part.
    """
    W, H = size
    bx0, by0, bx1, by1 = box
    bw, bh = bx1 - bx0, by1 - by0

    def P(nx, ny):
        return (bx0 + nx * bw, by0 + ny * bh)

    spec = FORMS[form]
    layer = Image.new('RGBA', size, (0, 0, 0, 0))
    silhouette = Image.new('L', size, 0)

    cap_col = mix(WINE_DEEP, INK, 0.25)
    glass_col = mix(tint, OAT_SOFT, 0.62)

    # Resolve every part to a (mask, pixel box) pair up front, so the paint
    # order can differ from the declaration order.
    resolved = []
    for role, kind, geom, rad in spec['parts']:
        if kind == 'rrect':
            nx0, ny0, nx1, ny1 = geom
            px0, py0 = P(nx0, ny0)
            px1, py1 = P(nx1, ny1)
            m = rrect_mask(size, (px0, py0, px1, py1), rad * bw)
            part_box = (px0, py0, px1, py1)
        else:
            pts = [P(nx, ny) for nx, ny in geom]
            m = poly_mask(size, pts)
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            part_box = (min(xs), min(ys), max(xs), max(ys))

        if int(part_box[2] - part_box[0]) < 1 or int(part_box[3] - part_box[1]) < 1:
            continue
        silhouette = ImageChops.lighter(silhouette, m)
        resolved.append((role, m, part_box))

    def paint(role, m, part_box):
        px0, py0, px1, py1 = part_box
        pw, ph = int(px1 - px0), int(py1 - py0)

        if role == 'body':
            base = glass_col if spec['glass'] else tint
            fill = cyl_fill((pw, ph), base, spec_gain=0.60 if spec['glass'] else 0.42,
                            edge=0.46 if spec['glass'] else 0.38, rim=0.34)
            alpha = 150 if spec['glass'] else 252
        else:
            fill = cyl_fill((pw, ph), cap_col, spec=0.31, spec_w=0.09,
                            spec_gain=0.44, edge=0.50, rim=0.26, bot_f=0.92)
            alpha = 255

        patch = Image.new('RGBA', size, (0, 0, 0, 0))
        patch.paste(fill.convert('RGBA'), (int(px0), int(py0)))
        patch.putalpha(m.point(lambda v, al=alpha: v * al // 255))
        layer.alpha_composite(patch)

    body_masks = [(m, b) for role, m, b in resolved if role == 'body']
    for role, m, b in resolved:
        if role == 'body':
            paint(role, m, b)

    # ---- liquid --------------------------------------------------------
    if body_masks:
        union = Image.new('L', size, 0)
        for m, _ in body_masks:
            union = ImageChops.lighter(union, m)

        liq_top = by0 + spec['liquid_top'] * bh
        cut = Image.new('L', size, 0)
        ImageDraw.Draw(cut).rectangle((0, liq_top, W, H), fill=255)
        liq_mask = ImageChops.multiply(union, cut)

        bb = liq_mask.getbbox()
        if bb:
            lw, lh = bb[2] - bb[0], bb[3] - bb[1]
            liq = cyl_fill((lw, lh), tint, spec_gain=0.40, edge=0.50,
                           rim=0.24, top_f=1.10, bot_f=0.80)
            patch = Image.new('RGBA', size, (0, 0, 0, 0))
            patch.paste(liq.convert('RGBA'), (bb[0], bb[1]))
            patch.putalpha(liq_mask.point(lambda v: v * (232 if spec['glass'] else 255) // 255))
            layer.alpha_composite(patch)

            # meniscus — the bright line where liquid meets air sells the fill
            men = Image.new('L', size, 0)
            md = ImageDraw.Draw(men)
            th = max(2, int(bh * 0.008))
            md.rectangle((0, liq_top - th, W, liq_top + th), fill=255)
            men = ImageChops.multiply(union, men).filter(ImageFilter.GaussianBlur(th * 0.7))
            glow = Image.new('RGBA', size, mix(tint, (255, 255, 255), 0.72) + (0,))
            glow.putalpha(men.point(lambda v: v * 150 // 255))
            layer.alpha_composite(glow)

    # ---- caps ----------------------------------------------------------
    # After the liquid, not before: a tube's base crimp sits inside the body
    # outline, so painting it first would let the fill pass wipe it out.
    for role, m, b in resolved:
        if role != 'body':
            paint(role, m, b)

    # ---- label ---------------------------------------------------------
    lx0, ly0, lx1, ly1 = spec['label']
    label_text(layer, (P(lx0, ly0)[0], P(lx0, ly0)[1], P(lx1, ly1)[0], P(lx1, ly1)[1]),
               name, sub, tint)

    # ---- unifying light pass ------------------------------------------
    # Label, liquid and glass were each lit on their own. One more ramp over
    # the whole silhouette at low opacity puts them under a single key light.
    unify = cyl_fill((int(bw), int(bh)), (128, 128, 128), spec_gain=0.50,
                     edge=0.44, rim=0.30, top_f=1.04, bot_f=0.90)
    up = Image.new('RGB', size, (128, 128, 128))
    up.paste(unify, (int(bx0), int(by0)))
    lit = ImageChops.overlay(layer.convert('RGB'), up)
    layer = Image.merge('RGBA', lit.split() + (layer.getchannel('A'),))

    # ---- specular streak ----------------------------------------------
    streak = Image.new('L', size, 0)
    sd = ImageDraw.Draw(streak)
    sx = bx0 + bw * 0.235
    sw = max(2, bw * 0.055)
    sd.rounded_rectangle((sx - sw, by0 + bh * 0.22, sx + sw, by0 + bh * 0.86),
                         radius=sw, fill=255)
    streak = streak.filter(ImageFilter.GaussianBlur(sw * 1.5))
    streak = ImageChops.multiply(streak, silhouette)
    hl = Image.new('RGBA', size, (255, 253, 250, 0))
    hl.putalpha(streak.point(lambda v: v * 118 // 255))
    layer.alpha_composite(hl)

    return layer, silhouette


def draw_set(size, box, tint, name, sub):
    """The four steps of the routine staged as a group shot."""
    W, H = size
    bx0, by0, bx1, by1 = box
    bw, bh = bx1 - bx0, by1 - by0

    layer = Image.new('RGBA', size, (0, 0, 0, 0))
    silhouette = Image.new('L', size, 0)

    by_id = {p['id']: p for p in PRODUCTS}

    # Paint back to front so the overlaps stack correctly; the seed stays tied
    # to the layout slot, not the paint order, so re-ordering z does not
    # reshuffle every vessel's surface noise.
    for slot, (pid, cx, hm, z) in sorted(enumerate(SET_LAYOUT), key=lambda e: e[1][3]):
        product = by_id[pid]
        form = product['form']
        spec = FORMS[form]
        vh = bh * spec['scale'] * hm
        vw = vh * spec['aspect']
        vx = bx0 + cx * bw
        sub_box = (vx - vw / 2, by1 - vh, vx + vw / 2, by1)
        l, m = draw_vessel(size, sub_box, form, product['tint'],
                           product['name'], product['size'], seed=slot + 2)
        layer.alpha_composite(l)
        silhouette = ImageChops.lighter(silhouette, m)

    return layer, silhouette


# --------------------------------------------------------------------------
# scene assembly
# --------------------------------------------------------------------------
def backdrop(size, seed=1):
    W, H = size
    top = mix(BLUSH, OAT_SOFT, 0.42)
    bot = mix(OAT_DEEP, INK, 0.05)
    bg = vgrad(size, top, bot)

    horizon = int(H * 0.755)
    plane = vgrad((W, H - horizon), mix(OAT_DEEP, INK, 0.045), mix(OAT_DEEP, INK, 0.135))
    bg.paste(plane, (0, horizon))
    bg = bg.filter(ImageFilter.GaussianBlur(max(2, W * 0.004)))

    key = pool_mask(size, (W * 0.33, H * 0.19), W * 0.62, strength=0.85, falloff=1.9)
    bg = Image.composite(Image.new('RGB', size, mix(OAT_SOFT, (255, 255, 255), 0.30)), bg, key)

    vig = ImageOps.invert(pool_mask(size, (W * 0.5, H * 0.46), W * 0.86,
                                    strength=1.0, falloff=1.1))
    bg = Image.composite(Image.new('RGB', size, mix(WINE_DEEP, OAT_DEEP, 0.62)), bg,
                         vig.point(lambda v: v * 78 // 255))
    return bg, horizon


def contact_shadow(size, silhouette, base_y, spread):
    """Elliptical pool under the product plus a tight dark core at the base."""
    W, H = size
    bb = silhouette.getbbox()
    if not bb:
        return Image.new('L', size, 0)

    cx = (bb[0] + bb[2]) / 2
    half = (bb[2] - bb[0]) / 2

    sh = Image.new('L', size, 0)
    d = ImageDraw.Draw(sh)
    d.ellipse((cx - half * 2.4, base_y - spread * 0.55,
               cx + half * 2.4, base_y + spread * 1.05), fill=96)
    d.ellipse((cx - half * 1.15, base_y - spread * 0.20,
               cx + half * 1.15, base_y + spread * 0.42), fill=190)
    return sh.filter(ImageFilter.GaussianBlur(spread * 0.55))


def reflection(size, layer, base_y, strength=0.30):
    W, H = size
    # after the flip the product's foot sits at (H - base_y); slide it to base_y
    refl = layer.transpose(Image.FLIP_TOP_BOTTOM)
    refl = ImageChops.offset(refl, 0, int(2 * base_y - H))

    fade = Image.new('L', (1, H))
    fade.putdata([clamp8(255 * max(0.0, 1.0 - ((y - base_y) / (H * 0.20))) ** 1.8)
                  if y >= base_y else 0 for y in range(H)])
    fade = fade.resize(size, Image.BICUBIC)

    a = ImageChops.multiply(refl.getchannel('A'), fade)
    refl.putalpha(a.point(lambda v: clamp8(v * strength)))
    return refl.filter(ImageFilter.GaussianBlur(max(1, W * 0.004)))


SET_ASPECT = 1.72  # width/height of the staged four-vessel group


def place(form, size, base_y, prod_h, max_w_frac=0.86):
    """
    Bounding box for a product standing on `base_y`.

    Height is driven by the form's real volume so a range shot has honest
    relative scale, but nothing is allowed to run out of the frame — the tall
    1:2 crops would otherwise clip the set shot's outer bottles.
    """
    W, H = size
    aspect = SET_ASPECT if form == 'set' else FORMS[form]['aspect']
    scale = 1.0 if form == 'set' else FORMS[form]['scale']

    vh = prod_h * scale
    vw = vh * aspect
    if vw > W * max_w_frac:
        vw = W * max_w_frac
        vh = vw / aspect
    return (W * 0.5 - vw / 2, base_y - vh, W * 0.5 + vw / 2, base_y)


def build_product(product, size, box, seed):
    form = product['form']
    if form == 'set':
        return draw_set(size, box, WINE, product['name'], product['size'])
    return draw_vessel(size, box, form, product['tint'],
                       product['name'], product['size'], seed)


def render_framed(product, size, tight, seed=1):
    """A product in its frame: backdrop, shadow, reflection, product, grain."""
    W, H = size
    bg, horizon = backdrop(size, seed)

    base_y = int(H * (0.845 if tight else 0.815))
    prod_h = H * (0.74 if tight else 0.62)

    box = place(product['form'], size, base_y, prod_h)
    layer, sil = build_product(product, size, box, seed)

    sh = contact_shadow(size, sil, base_y, H * 0.045)
    bg = Image.composite(Image.new('RGB', size, mix(WINE_DEEP, INK, 0.35)), bg, sh)

    bg = bg.convert('RGBA')
    bg.alpha_composite(reflection(size, layer, base_y))
    bg.alpha_composite(layer)

    return apply_grain(bg.convert('RGB'), amount=6, seed=seed)


def render_cutout(product, size, seed=1):
    """
    Transparent-background product for the hero and editorial slots.

    Glass needs *something* behind it to be glass, so it is rendered over the
    page's oat background and then cut out — which is exactly the surface it
    lands on in the markup.
    """
    W, H = size
    plate = Image.new('RGB', size, OAT)

    # Cutouts are only ever shown on their own, never beside each other, so
    # here the product is fitted to the frame rather than scaled by volume —
    # a 50 ml jar should not float as a speck in a 1:2 hero slot.
    aspect = SET_ASPECT if product['form'] == 'set' else FORMS[product['form']]['aspect']
    vh = H * 0.84
    vw = vh * aspect
    if vw > W * 0.88:
        vw = W * 0.88
        vh = vw / aspect
    base_y = int(H * 0.5 + vh / 2)
    box = (W * 0.5 - vw / 2, base_y - vh, W * 0.5 + vw / 2, base_y)

    layer, sil = build_product(product, size, box, seed)

    plate = plate.convert('RGBA')
    plate.alpha_composite(layer)

    # alpha = the product, plus a soft drop shadow floating beneath it
    drop = sil.filter(ImageFilter.GaussianBlur(W * 0.055))
    drop = ImageChops.offset(drop, 0, int(H * 0.030))
    drop = drop.point(lambda v: v * 105 // 255)

    shadow = Image.new('RGBA', size, mix(WINE_DEEP, INK, 0.4) + (0,))
    shadow.putalpha(drop)

    out = Image.new('RGBA', size, (0, 0, 0, 0))
    out.alpha_composite(shadow)
    out.alpha_composite(Image.merge('RGBA', plate.convert('RGB').split() + (sil,)))
    return out


# --------------------------------------------------------------------------
# encoding
# --------------------------------------------------------------------------
def encode_avif(png_path, out_path, crf):
    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', png_path,
           '-c:v', 'libaom-av1', '-still-picture', '1', '-crf', str(crf),
           '-cpu-used', '4', '-pix_fmt', 'yuv420p', out_path]
    return subprocess.run(cmd, capture_output=True).returncode == 0


def write_derivatives(master, out_dir, variant, widths, alpha, quality, avif_crf):
    """Resize the master down to each delivery width and encode every format."""
    written = []
    for w in widths:
        h = int(round(w * master.height / master.width))
        im = master.resize((w, h), Image.LANCZOS)
        stem = os.path.join(out_dir, '%s-%d' % (variant, w))

        if alpha:
            im.save(stem + '.png', optimize=True)
            im.save(stem + '.webp', quality=quality, method=6)
            written += [stem + '.png', stem + '.webp']
            # AVIF via ffmpeg is yuv420p only here, so alpha shots stay
            # WebP+PNG. Both are universally supported; nothing regresses.
        else:
            rgb = im.convert('RGB')
            rgb.save(stem + '.jpg', quality=quality, optimize=True, progressive=True)
            rgb.save(stem + '.webp', quality=quality, method=6)
            tmp = stem + '.tmp.png'
            rgb.save(tmp)
            if encode_avif(tmp, stem + '.avif', avif_crf):
                written.append(stem + '.avif')
            os.remove(tmp)
            written += [stem + '.jpg', stem + '.webp']
    return written


# --------------------------------------------------------------------------
# catalogue — mirrors assets/js/products.js
# --------------------------------------------------------------------------
PRODUCTS = [
    dict(id='morning-dew-cleanser', name='Morning Dew', size='150 ml', form='pump',
         tint=mix(SAGE, OAT_SOFT, 0.62)),
    dict(id='soft-focus-toner', name='Soft Focus', size='200 ml', form='bottle',
         tint=mix(BLUSH, OAT_SOFT, 0.30)),
    dict(id='quiet-hour-serum', name='Quiet Hour', size='30 ml', form='dropper',
         tint=mix(OAT_SOFT, BLUSH, 0.40)),
    dict(id='slow-light-vitamin-c', name='Slow Light', size='30 ml', form='dropper',
         tint=(198, 138, 74)),
    dict(id='night-ritual-retinal', name='Night Ritual', size='30 ml', form='dropper',
         tint=WINE),
    dict(id='second-skin-cream', name='Second Skin', size='50 ml', form='jar',
         tint=mix(OAT_SOFT, BLUSH, 0.22)),
    dict(id='daybreak-spf', name='Daybreak', size='50 ml', form='tube',
         tint=mix(BLUSH, OAT_DEEP, 0.35)),
    dict(id='the-daily-ritual-set', name='The Daily Ritual', size='Set of four', form='set',
         tint=WINE),
]

VARIANTS = {
    'square':   dict(master=(1800, 1800), widths=[400, 800], alpha=False,
                     quality=82, avif_crf=32, tight=False),
    'portrait': dict(master=(2000, 2100), widths=[600, 1200], alpha=False,
                     quality=82, avif_crf=32, tight=True),
    'cutout':   dict(master=(1200, 2400), widths=[300, 600], alpha=True,
                     quality=88, avif_crf=34, tight=False),
}


def main():
    if shutil.which('ffmpeg') is None:
        print('warning: ffmpeg not found — AVIF derivatives will be skipped',
              file=sys.stderr)

    only = sys.argv[1:] or None
    manifest = {}
    total = 0

    for i, product in enumerate(PRODUCTS):
        if only and product['id'] not in only:
            continue
        out_dir = os.path.join(OUT_ROOT, product['id'])
        os.makedirs(out_dir, exist_ok=True)
        files = []

        for variant, cfg in VARIANTS.items():
            if variant == 'cutout':
                master = render_cutout(product, cfg['master'], seed=i + 1)
            else:
                master = render_framed(product, cfg['master'], cfg['tight'], seed=i + 1)
            files += write_derivatives(master, out_dir, variant, cfg['widths'],
                                       cfg['alpha'], cfg['quality'], cfg['avif_crf'])

        total += len(files)
        manifest[product['id']] = sorted(os.path.relpath(f, ROOT) for f in files)
        print('%-24s %2d files' % (product['id'], len(files)))

    index = os.path.join(ROOT, 'assets', 'img', 'manifest.json')
    if not only or len(manifest) == len(PRODUCTS):
        with open(index, 'w') as fh:
            json.dump({'generatedBy': 'tools/generate-images.py',
                       'variants': {k: {'widths': v['widths'],
                                        'formats': (['webp', 'png'] if v['alpha']
                                                    else ['avif', 'webp', 'jpg'])}
                                    for k, v in VARIANTS.items()},
                       'products': manifest}, fh, indent=2)
            fh.write('\n')
    print('\n%d files written to assets/img/products/' % total)


if __name__ == '__main__':
    main()
