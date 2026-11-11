"""Re-skin scene four's project cards with the site owner's own work.

The twelve card sprites in public/projects/ were cut from the template's
reference art by extract_s4.py, so they carry the template author's sample
projects. This keeps each sprite's frame, glow and soft edge exactly as cut,
and replaces only what is on the screen: a typographic card is drawn flat in
the site's fonts, warped onto the screen's measured quad (layout4.json) and
laid over the old artwork.

The untouched template sprites are kept in assets_src/projects_orig/ (copied
there on first run), so this is safe to re-run after editing CARDS below.

Run:  python tools/make_project_cards.py      (needs OpenCV, NumPy, Pillow)
"""

import json
import os
import shutil

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJ = os.path.join(ROOT, "public", "projects")
ORIG = os.path.join(ROOT, "assets_src", "projects_orig")
FONTS = os.path.join(ROOT, "public", "fonts")
SCALE = 2          # sprites are written at 2x the reference so type stays crisp
FLAT_H = 720       # working height of the flat card before warping

# id -> tag, title lines, sub line, true screen corners (TL, TR, BR, BL) in
# reference-frame px. Corners are given only where the measured outline is
# clipped by a neighbouring card; otherwise they are read from layout4.json.
CARDS = {
    "p01_timeless": ("Security · Admissions", ["AIMS", "Admission Portal"],
                     "51 of 51 DAST checks passed", None),
    "p02_game": ("Student Experience", ["DSU", "Student Portal"],
                 "Salesforce-connected feedback forms", None),
    "p03_build": ("Admissions · Payments", ["IIM Udaipur", "Executive Education"],
                  "Offline advance payments, validation and API security review",
                  None),
    "p04_driven": ("Production Support", ["DSU LMS", "Integration"],
                   "Course redirection and calendar fixes, verified in production",
                   [(1028, 205), (1362, 125), (1428, 442), (1030, 427)]),
    "p05_ideas": ("Admissions", ["Payment", "Workflows"], None, None),
    "p06_sound": ("Frontend", ["React", "& Ionic"], None, None),
    "p07_food": ("Backend", ["Node.js &", "REST APIs"], None, None),
    "p08_travel": ("VAPT · OWASP", ["Application", "Security"], None, None),
    "p09_space": ("Ionic · Electron", ["Mobile &", "Desktop"], None, None),
    "p10_play": ("Salesforce · Workflows", ["Enterprise", "Integrations"],
                 "Authentication, sessions and UAT support", None),
    "p11_cleaner": ("E2E · API · Regression", ["Testing", "& Delivery"],
                    "Checked across DEV, QA, UAT and Production",
                    [(148, 504), (432, 490), (433, 669), (163, 680)]),
    "p12_steps": ("Node.js Audit", ["Security", "Remediation"],
                  "Audit advisories cut from 30 to 3",
                  [(1169, 528), (1427, 508), (1434, 690), (1175, 670)]),
}


# Where a nearer card overlaps a screen, its copy is nudged clear of the
# overlap: (extra left margin, vertical shift), as fractions of the card.
NUDGE = {
    "p04_driven": (0.0, -0.13),     # lower edge sits behind its neighbour
    "p05_ideas": (0.2, 0.0),        # left edge sits behind its neighbour
}


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name + ".woff2"), int(size))


def fit(draw, lines, name, size, max_w):
    """Largest size at or below `size` at which every line fits max_w."""
    while size > 8:
        f = font(name, size)
        if max(draw.textlength(t, font=f) for t in lines) <= max_w:
            return f
        size -= 2
    return font(name, size)


def wrap(draw, text, f, max_w):
    out, cur = [], ""
    for word in text.split():
        trial = (cur + " " + word).strip()
        if draw.textlength(trial, font=f) <= max_w or not cur:
            cur = trial
        else:
            out.append(cur)
            cur = word
    return out + [cur]


def flat_card(w, h, tag, title, sub, tint, nudge=(0.0, 0.0)):
    """The card as it would look face-on: dark screen, serif title, red rule."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    base = np.array([14, 12, 13], np.float32)
    glow = np.array([tint[0] * 150 + 40, tint[1] * 70, tint[2] * 70], np.float32)
    d = np.sqrt(((xx - w * 0.92) / w) ** 2 + ((yy - h * 0.1) / h) ** 2)
    k = np.clip(1.0 - d / 0.95, 0.0, 1.0)[..., None] ** 2.2
    img = Image.fromarray(np.clip(base + glow * k, 0, 255).astype(np.uint8))
    dr = ImageDraw.Draw(img)

    m = int(h * 0.11)
    small = sub is None                      # the far row: tag + title only
    red = (228, 40, 40)
    ink = (240, 236, 232)
    dim = (176, 170, 166)

    # mark, as on the template's cards
    r = int(h * 0.028)
    dr.ellipse([m, m, m + 2 * r, m + 2 * r], fill=red)
    dr.text((m + 3 * r, m + r), "MR", font=font("oswald-500", h * 0.05),
            fill=ink, anchor="lm")

    x0 = m + int(w * nudge[0])
    tf = fit(dr, title, "bodonimoda-500", h * (0.2 if small else 0.165),
             w - m - x0)
    lh = int(tf.size * 1.08)
    sf = font("oswald-400", h * 0.058)
    subs = wrap(dr, sub, sf, w - m - x0) if sub else []
    block = lh * len(title) + (int(h * 0.05) + len(subs) * int(sf.size * 1.4)
                               if subs else 0)
    y = int(h * 0.56 - block / 2) if not small else int(h * 0.6 - block / 2)
    y += int(h * nudge[1])

    gf = fit(dr, [tag.upper()], "oswald-500", h * (0.062 if small else 0.05),
             w - m - x0)
    dr.text((x0, y - int(h * 0.075)), tag.upper(), font=gf, fill=red, anchor="ls")
    for line in title:
        dr.text((x0, y), line, font=tf, fill=ink)
        y += lh
    if subs:
        y += int(h * 0.05)
        for line in subs:
            dr.text((x0, y), line, font=sf, fill=dim)
            y += int(sf.size * 1.4)
    dr.line([m, h - m, m + int(w * 0.16), h - m], fill=red,
            width=max(2, int(h * 0.008)))
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)


def corners(quad):
    """TL, TR, BR, BL of an unclipped 4- or 6-point outline (clockwise)."""
    if len(quad) == 4:
        return quad
    if len(quad) == 6:
        return [quad[0], quad[2], quad[3], quad[5]]
    raise ValueError("clipped outline needs explicit corners")


def main():
    layout = json.load(open(os.path.join(PROJ, "layout4.json"), encoding="utf-8"))
    os.makedirs(ORIG, exist_ok=True)
    for c in layout["cards"]:
        cid = next(k for k in CARDS if k.endswith("_" + c["name"]))
        tag, title, sub, fixed = CARDS[cid]
        path = os.path.join(PROJ, cid + ".png")
        keep = os.path.join(ORIG, cid + ".png")
        if not os.path.exists(keep):
            shutil.copy2(path, keep)
        sprite = cv2.imread(keep, cv2.IMREAD_UNCHANGED)
        sprite = cv2.resize(sprite, None, fx=SCALE, fy=SCALE,
                            interpolation=cv2.INTER_CUBIC).astype(np.float32)
        sh, sw = sprite.shape[:2]

        bx, by = c["box"][:2]
        to_local = lambda pts: np.float32(
            [[(x - bx) * SCALE, (y - by) * SCALE] for x, y in pts])
        cor = to_local(fixed or corners(c["quad"]))
        outline = to_local(c["quad"])

        top = np.linalg.norm(cor[1] - cor[0])
        bot = np.linalg.norm(cor[2] - cor[3])
        lef = np.linalg.norm(cor[3] - cor[0])
        rig = np.linalg.norm(cor[2] - cor[1])
        fw = int(FLAT_H * max(top, bot) / max(lef, rig))
        flat = flat_card(fw, FLAT_H, tag, title, sub, c["tint"],
                         NUDGE.get(cid, (0.0, 0.0)))

        src = np.float32([[0, 0], [fw, 0], [fw, FLAT_H], [0, FLAT_H]])
        M = cv2.getPerspectiveTransform(src, cor)
        warped = cv2.warpPerspective(flat, M, (sw, sh), flags=cv2.INTER_AREA)

        # only inside the measured outline (so a neighbour's overlap stays on
        # top), pulled in a touch so the sprite's own lit bezel survives
        mask = np.zeros((sh, sw), np.uint8)
        cv2.fillPoly(mask, [outline.astype(np.int32)], 255)
        mask = cv2.erode(mask, np.ones((3, 3), np.uint8), iterations=SCALE)
        mask = cv2.GaussianBlur(mask, (0, 0), 0.9 * SCALE).astype(np.float32) / 255

        # sit in the scene's light: a little of the old screen's shading
        # carries the reflections and falloff across the new face
        lum = cv2.GaussianBlur(sprite[:, :, :3].mean(2), (0, 0), 14 * SCALE)
        shade = np.clip(0.82 + (lum - lum[mask > 0.5].mean()) / 255.0 * 0.9,
                        0.6, 1.15)[..., None]
        m3 = mask[..., None]
        out = sprite.copy()
        out[:, :, :3] = sprite[:, :, :3] * (1 - m3) + warped * shade * m3
        out[:, :, 3] = np.maximum(sprite[:, :, 3], mask * 255)
        cv2.imwrite(path, np.clip(out, 0, 255).astype(np.uint8))
        print("%-13s %dx%d  %s" % (cid, sw, sh, " ".join(title)))


if __name__ == "__main__":
    main()
