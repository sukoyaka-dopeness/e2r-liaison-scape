import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createServer } from "vite";
import { createDomTestEnvironment } from "./helpers/dom-test-environment.ts";

test("renders the production LiaisonScape Home surface", async () => {
  const environment = createDomTestEnvironment();
  environment.installGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  environment.window.requestAnimationFrame = (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  };
  environment.window.cancelAnimationFrame = () => {};
  environment.window.scrollTo = () => {};
  environment.window.HTMLElement.prototype.scrollIntoView = () => {};
  const container = environment.document.createElement("div");
  environment.document.body.append(container);

  try {
    const server = await createServer({
      root: process.cwd(),
      server: { middlewareMode: true, hmr: false },
      appType: "custom",
    });
    environment.addCleanup(() => server.close());

    const root = createRoot(container);
    environment.addCleanup(() => act(async () => root.unmount()));

    const { default: App } = await server.ssrLoadModule("/src/App.tsx");
    await act(async () => {
      root.render(React.createElement(App));
    });

    assert.ok(environment.document.querySelector(".home-page"));
    assert.ok(environment.document.querySelector(".home-page h1"));
    assert.ok(environment.document.querySelector(".home-actions"));
  } finally {
    await environment.cleanup();
  }
});

test("keeps the Workspace More keyboard contract and toolbar count local to the app", () => {
  const source = readFileSync("src/App.tsx", "utf8");
  assert.match(source, /firstItem\?\.focus\(\)/);
  for (const key of ["ArrowDown", "ArrowUp", "Home", "End", "Escape", "Tab"]) assert.match(source, new RegExp(`event\\.key === "${key}"`));
  assert.match(source, /onToggle=\{\(event\) => setMaintenanceMenuOpen\(event\.currentTarget\.open\)\}/);
  assert.match(source, /document\.addEventListener\("pointerdown"/);
  assert.match(source, /className="graph-summary toolbar-graph-summary"/);
  assert.equal((source.match(/className="graph-summary/g) ?? []).length, 1);
  assert.doesNotMatch(source, /formatLoadedDataset/);
  assert.doesNotMatch(source, /translate\(locale, "selectEntityOrRelation"\)/);
  assert.match(source, /formatUnsupportedEventRelations/);
  assert.ok(source.indexOf("</svg>") < source.lastIndexOf("{graph.unsupportedEdges"));
  const styles = readFileSync("src/styles.css", "utf8");
  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(styles, /\.desktop-secondary-action \{ display: none !important; \}/);
  assert.match(styles, /\.mobile-secondary-action \{ display: block; \}/);
});
