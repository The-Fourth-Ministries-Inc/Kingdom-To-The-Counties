#!/usr/bin/env python3
"""Build web-sized trailer photos from the originals in assets/Trailer Photos/.

The originals are 3-6 MB phone shots (83 MB total) — unusable on field signal,
where this app is actually opened. This produces ~1100 px, quality-72 JPEGs
(~120-250 KB) into assets/trailer/, which is what the app loads.

Also applies EXIF orientation: the trailer shots were taken sideways, so
without this every photo renders rotated 90 degrees in the browser.

    pip install Pillow && python3 scripts/optimize-trailer-photos.py

Python (not .mjs like the other scripts) because there is no image library in
the Node dependency tree and this is a one-off asset pipeline, not app code.
Re-run it only when new photos are added; the outputs are committed.
"""
import os, re, sys
from PIL import Image, ImageOps

SRC = "assets/Trailer Photos"
OUT = "assets/trailer"
MAX_W = 1100
QUALITY = 72

# Explicit names -> stable slugs the roster maps onto. Anything not listed
# keeps a slugified version of its filename so nothing is silently dropped.
SLUGS = {
    "T4M-1_Left bay 1": "left-bay-1",
    "T4M-1_Left bay 2": "left-bay-2",
    "T4M-1_Left bay 3": "left-bay-3",
    "T4M-1_Left rear end": "left-rear-end",
    "T4M-1_Right rack": "right-rack",
    "T4M-1_Right Ark": "right-ark",
    "T4M-1_Right rear end": "right-rear-end",
    "T4M-1_Side door": "side-door",
    "T4M-1_Aisle from rear": "aisle-rear",
    "T4M-1_Aisle from nose": "aisle-nose",
    "T4M-1_Nose left": "nose-left",
    "T4M-1_Nose right": "nose-right",
    "T4M-1_Nose bucket": "nose-bucket",
    "T4M-1_Packouts": "packouts",
    "T4M-1_Packout Stack 1": "packout-stack-1",
    "T4M-1_Packout Stack 2": "packout-stack-2",
    "T4M-1_Packout Stack 3": "packout-stack-3",
}

def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")

def main():
    if not os.path.isdir(SRC):
        sys.exit("no " + SRC + " — nothing to do")
    os.makedirs(OUT, exist_ok=True)
    total_in = total_out = 0
    rows = []
    for root, _dirs, files in os.walk(SRC):
        for f in sorted(files):
            stem, ext = os.path.splitext(f)
            if ext.lower() not in (".jpg", ".jpeg", ".png"):
                continue
            src = os.path.join(root, f)
            chunk = os.path.basename(root).lower().replace(" ", "-")
            slug = SLUGS.get(stem) or (chunk + "-" + slugify(stem))
            dst = os.path.join(OUT, slug + ".jpg")
            im = Image.open(src)
            im = ImageOps.exif_transpose(im)      # phone shots are sideways
            if im.mode not in ("RGB", "L"):
                im = im.convert("RGB")
            if im.width > MAX_W:
                im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
            im.save(dst, "JPEG", quality=QUALITY, optimize=True, progressive=True)
            a, b = os.path.getsize(src), os.path.getsize(dst)
            total_in += a; total_out += b
            rows.append((slug, im.width, im.height, b // 1024))
    for slug, w, h, kb in sorted(rows):
        print("  %-28s %4dx%-4d %4d KB" % (slug, w, h, kb))
    print("\n%d photos: %.1f MB -> %.1f MB" % (len(rows), total_in / 1e6, total_out / 1e6))

if __name__ == "__main__":
    main()
