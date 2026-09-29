import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const app = readFileSync(join(root, "js/app-core.js"), "utf8");

test("desktop shell uses a sidebar and wide workspace", () => {
  assert.match(html, /@media \(min-width:900px\)\{/);
  assert.match(html, /body\{display:grid;grid-template-columns:220px minmax\(0,1fr\)/);
  assert.match(html, /\.tabbar\{grid-column:1;grid-row:2;width:220px;[^}]*flex-direction:column/);
  assert.match(html, /main\{grid-column:2;grid-row:2;max-width:1180px/);
  assert.match(html, /#page-now\.active\{display:grid;grid-template-columns:/);
});

test("playbook has the revised event-day order", () => {
  assert.match(html, /9:30<small>30 min<\/small>[\s\S]*All-team huddle \+ program run-through/);
  assert.doesNotMatch(html, /12:00<small>15 min<\/small>[\s\S]{0,200}program run-through/i);
  assert.match(html, /1:50<small>10 min<\/small>[\s\S]*Local minister prayers/);
});

test("live Now timeline matches the revised event-day order", () => {
  assert.match(app, /s:m\(9,30\),e:m\(10,0\),name:"All-Team Huddle \+ Run-Through"/);
  assert.doesNotMatch(app, /name:"Program Run-Through"/);
  assert.match(app, /s:m\(13,50\),e:m\(14,0\),name:"Local Minister Prayers"/);
});
