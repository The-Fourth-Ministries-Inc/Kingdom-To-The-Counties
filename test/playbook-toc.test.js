/* Playbook "Jump to a section" chips (v1.19.7).
   Hash hrefs without preventDefault wrote history on top of
   pushState({k2cPage}). WKWebView then fired popstate with a null
   state — the listener treated that as Event Day and could exit the
   iOS app. Every chip must stay in-app, open the matching details,
   and scroll inside main. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createContext, runInContext } from "node:vm";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const js = readFileSync(join(root, "js/app-core.js"), "utf8");

const TOC_IDS = [
  "contacts", "culture", "before", "field", "events", "after",
  "media", "faqs", "altar", "newbirth", "followup", "ttt"
];
const REPORTED = ["field", "after", "media", "newbirth"];

function extractFunction(src, name) {
  const start = src.search(new RegExp("function\\s+" + name + "\\s*\\("));
  assert.ok(start >= 0, "missing function " + name);
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unclosed function " + name);
}

function playbookPage() {
  const m = html.match(/<section class="page" id="page-playbook">([\s\S]*?)<section class="page" id="page-handbook">/);
  assert.ok(m, "Ambassador Playbook page missing");
  return m[1];
}

function tocHrefs(page) {
  const nav = page.match(/<nav class="toc">([\s\S]*?)<\/nav>/);
  assert.ok(nav, "Playbook TOC nav missing");
  return [...nav[1].matchAll(/<a href="#([^"]+)">([^<]+)<\/a>/g)].map((m) => ({
    id: m[1],
    label: m[2]
  }));
}

test("every Jump-to-a-section chip has a matching <section> with <details>", () => {
  const page = playbookPage();
  const chips = tocHrefs(page);
  assert.deepEqual(chips.map((c) => c.id), TOC_IDS);
  for (const chip of chips) {
    const re = new RegExp('<section class="card" id="' + chip.id + '">\\s*<details>');
    assert.match(page, re, "section#" + chip.id + " must wrap a details");
  }
  for (const id of REPORTED) {
    assert.ok(chips.some((c) => c.id === id), "reported chip #" + id + " missing from TOC");
  }
});

test("old inline TOC handler that did not preventDefault is gone", () => {
  const page = playbookPage();
  assert.doesNotMatch(page, /querySelectorAll\(["']nav\.toc a["']\)\.forEach/);
  assert.doesNotMatch(page, /d\.open\s*=\s*true;\}\}\);/);
  assert.match(js, /function bindPlaybookToc\(/);
  assert.match(js, /function jumpPlaybookSection\(/);
  assert.match(extractFunction(js, "bindPlaybookToc"), /preventDefault/);
  assert.match(extractFunction(js, "boot"), /bindPlaybookToc\(\)/);
  assert.doesNotMatch(extractFunction(js, "jumpPlaybookSection"), /location\.hash/);
  assert.doesNotMatch(extractFunction(js, "bindPlaybookToc"), /location\.hash\s*=/);
});

test("Playbook TOC chips stay a 44px tap target", () => {
  const rule = html.match(/#page-playbook \.pb \.chips a\{([^}]+)\}/);
  assert.ok(rule, "chip CSS rule missing");
  assert.match(rule[1], /min-height:\s*44px/);
});

test("jumpPlaybookSection opens details and scrolls main, not the window", () => {
  const opened = {};
  const sections = {};
  TOC_IDS.forEach((id, i) => {
    const details = { open: false };
    sections[id] = {
      querySelector: (sel) => (sel === "details" ? details : null),
      getBoundingClientRect: () => ({ top: 400 + i * 80, bottom: 480 + i * 80 }),
      _details: details
    };
  });
  const page = {
    contains: (el) => Object.values(sections).indexOf(el) >= 0
  };
  const scrolled = [];
  const scroller = {
    scrollTop: 12,
    getBoundingClientRect: () => ({ top: 100 }),
    scrollTo: (opts) => { scrolled.push(opts); }
  };
  let windowScrolled = 0;
  const ctx = createContext({
    document: {
      getElementById: (id) => {
        if (id === "page-playbook") return page;
        return sections[id] || null;
      },
      querySelector: (sel) => (sel === "main" ? scroller : null),
      documentElement: { scrollTop: 0 }
    },
    window: { scrollTo: () => { windowScrolled++; } },
    location: { hash: "" }
  });
  const src = [
    extractFunction(js, "pageScroller"),
    extractFunction(js, "playbookJumpId"),
    extractFunction(js, "jumpPlaybookSection")
  ].join("\n");
  for (const id of TOC_IDS) {
    const ok = runInContext(src + "\nresult = jumpPlaybookSection('#" + id + "');", ctx);
    assert.equal(ok, true, "jump #" + id + " should succeed");
    assert.equal(sections[id]._details.open, true, "#" + id + " details must open");
    opened[id] = true;
  }
  assert.equal(Object.keys(opened).length, TOC_IDS.length);
  assert.equal(scrolled.length, TOC_IDS.length, "every chip must scroll main");
  assert.equal(ctx.location.hash, "", "hash must stay empty");
  assert.equal(windowScrolled, 0, "must not scroll the window");
  for (const opts of scrolled) {
    assert.equal(typeof opts.top, "number");
    assert.ok(opts.top >= 0);
  }
  const miss = runInContext("result = jumpPlaybookSection('#nope');", ctx);
  assert.equal(miss, false);
});

test("TOC click preventDefaults so hash never enters history", () => {
  const handlers = [];
  const links = TOC_IDS.map((id) => ({
    getAttribute: (n) => (n === "href" ? "#" + id : ""),
    addEventListener: (type, fn) => { if (type === "click") handlers.push({ id, fn }); }
  }));
  const jumped = [];
  const ctx = createContext({
    document: {
      getElementById: (id) => {
        if (id !== "page-playbook") return null;
        return {
          querySelectorAll: (sel) => {
            assert.equal(sel, "nav.toc a");
            return links;
          }
        };
      }
    },
    jumpPlaybookSection: (href) => { jumped.push(href); return true; }
  });
  runInContext(extractFunction(js, "bindPlaybookToc") + "\nbindPlaybookToc();", ctx);
  assert.equal(handlers.length, TOC_IDS.length);
  for (const { id, fn } of handlers) {
    let prevented = 0;
    let stopped = 0;
    const ev = {
      preventDefault: () => { prevented++; },
      stopPropagation: () => { stopped++; }
    };
    const ret = fn(ev);
    assert.equal(prevented, 1, "#" + id + " must preventDefault");
    assert.equal(stopped, 1, "#" + id + " must stopPropagation");
    assert.equal(ret, false);
  }
  assert.deepEqual(jumped, TOC_IDS.map((id) => "#" + id));
});
