/* Graphics for Sharing: new fund + county flyers are real JPEGs with
   download hrefs that point at the committed files. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const sw = readFileSync(join(root, "sw.js"), "utf8");

const FILES = [
  {
    path: "assets/share-fund-28pct.jpg",
    download: "K2C-Build-His-Kingdom.jpg",
    title: "BUILD HIS KINGDOM",
    caption: "99 Days to Get the One until October 31, 2026",
  },
  {
    path: "assets/flyer-merrimack-county.jpg",
    download: "K2C-Merrimack-County.jpg",
    title: "Merrimack County · Flyer",
    caption: "Hugh Gallen Soccer Field, Concord NH",
  },
  {
    path: "assets/flyer-hillsborough-county.jpg",
    download: "K2C-Hillsborough-County.jpg",
    title: "Hillsborough County · Flyer",
    caption: "Derryfield Park, Manchester NH",
  },
];

test("share graphics are real JPEGs, listed on the Graphics page, and precached", () => {
  const gfx = html.match(/<section class="page" id="page-graphics">([\s\S]*?)<\/section>/);
  assert.ok(gfx, "Graphics for Sharing page missing");
  const page = gfx[1];

  FILES.forEach(function (f) {
    const bytes = readFileSync(join(root, f.path));
    assert.ok(bytes.length > 20000, f.path + " is too small to be a real flyer");
    assert.equal(bytes[0], 0xff);
    assert.equal(bytes[1], 0xd8);
    assert.equal(bytes[2], 0xff);
    assert.ok(statSync(join(root, f.path)).size === bytes.length);

    assert.match(page, new RegExp('src="' + f.path.replace(/\./g, "\\.") + '"'));
    assert.match(page, new RegExp('href="' + f.path.replace(/\./g, "\\.") + '"'));
    assert.match(page, new RegExp('download="' + f.download.replace(/\./g, "\\.") + '"'));
    assert.match(page, new RegExp(f.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(page, new RegExp(f.caption.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(sw, new RegExp('"' + f.path.replace(/\./g, "\\.") + '"'));
  });

  const fundIdx = page.indexOf("assets/share-fund-28pct.jpg");
  const merIdx = page.indexOf("assets/flyer-merrimack-county.jpg");
  const hilIdx = page.indexOf("assets/flyer-hillsborough-county.jpg");
  const rockIdx = page.indexOf("assets/flyer-rockingham-county.jpg");
  assert.ok(fundIdx > 0 && fundIdx < merIdx, "fund graphic should be easy to find near the top");
  assert.ok(merIdx < hilIdx && hilIdx < rockIdx, "upcoming county flyers sit in season order");
});
