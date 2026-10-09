import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("More disclosure retains app actions and adopts the simple text-row presentation", async () => {
  const [app, styles] = await Promise.all([
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);

  assert.match(app, /<details ref=\{maintenanceMenuRef\} className="maintenance-menu"/);
  assert.match(app, /<summary ref=\{maintenanceMenuSummaryRef\}>\{translate\(locale, "more"\)\}<\/summary>/);
  assert.match(app, /translate\(locale, "openWorkspaceDataset"\)/);
  assert.match(app, /translate\(locale, "exportDataset"\)/);
  assert.match(app, /translate\(locale, "migrateCoordinateDraft"\)/);
  assert.match(app, /translate\(locale, "autoLayout"\)/);
  assert.match(styles, /\.maintenance-menu__items\s*\{[^}]*top:\s*calc\(100% \+ 8px\);[^}]*min-width:\s*12rem;[^}]*gap:\s*2px;[^}]*padding:\s*4px;[^}]*border-radius:\s*6px;/);
  assert.match(styles, /\.maintenance-menu__items > button\s*\{[^}]*min-height:\s*36px;[^}]*padding:\s*5px 9px;[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*font: inherit;[^}]*font-size:\s*15px;[^}]*line-height:\s*120%;[^}]*text-align:\s*start;/);
  assert.match(styles, /\.maintenance-menu summary \{[^}]*min-height: 38px;[^}]*font-size: 15px;[^}]*line-height: 120%;/);
  assert.ok(styles.lastIndexOf(".maintenance-menu__items > button {") > styles.indexOf(".maintenance-menu__items > button,", styles.indexOf("/* Bounded ordinary-control density experiment.")));
  assert.match(styles, /\.maintenance-menu__items > button:hover:not\(:disabled\)\s*\{[^}]*background:\s*#f5e9ff;/);
});

test("custom disclosure keyboard and focus behavior remains present", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /firstItem\?\.focus\(\)/);
  assert.match(app, /if \(event\.key === "Tab"\)\s*\{\s*closeMaintenanceMenu\(\);\s*return;/);
  assert.match(app, /if \(event\.key === "Escape"\)[\s\S]*closeMaintenanceMenu\(\);\s*maintenanceMenuSummaryRef\.current\?\.focus\(\)/);
  assert.match(app, /event\.key === "ArrowDown"/);
  assert.match(app, /event\.key === "ArrowUp"/);
});
