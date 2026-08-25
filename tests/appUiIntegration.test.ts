import assert from "node:assert/strict";
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

test("keeps Workspace secondary actions in More with native disclosure behavior", async () => {
  const environment = createDomTestEnvironment();
  environment.installGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  environment.window.requestAnimationFrame = (callback: FrameRequestCallback) => { callback(0); return 0; };
  environment.window.cancelAnimationFrame = () => {};
  environment.window.scrollTo = () => {};
  environment.window.HTMLElement.prototype.scrollIntoView = () => {};
  const container = environment.document.createElement("div");
  environment.document.body.append(container);

  try {
    const server = await createServer({ root: process.cwd(), server: { middlewareMode: true, hmr: false }, appType: "custom" });
    environment.addCleanup(() => server.close());
    const root = createRoot(container);
    environment.addCleanup(() => act(async () => root.unmount()));
    const { default: App } = await server.ssrLoadModule("/src/App.tsx");
    await act(async () => root.render(React.createElement(App)));

    const newDataset = [...environment.document.querySelectorAll("button")].find((button) => button.textContent === "New Dataset");
    assert.ok(newDataset);
    await act(async () => newDataset?.click());

    const actions = environment.document.querySelector(".dataset-actions__buttons");
    assert.ok(actions);
    assert.deepEqual([...actions.querySelectorAll(":scope > button")].map((button) => button.textContent), ["Add Entity", "Add Relation", "Save node coordinates"]);
    const menu = environment.document.querySelector(".maintenance-menu") as HTMLDetailsElement;
    const summary = menu.querySelector("summary") as HTMLElement;
    assert.deepEqual([...menu.querySelectorAll(".maintenance-menu__items > button")].map((button) => button.textContent), ["Open Dataset", "Export E2R JSON", "Save node coordinates", "Migrate Coordinate to Draft", "Migrate Linkscape coordinates to LiaisonScape"]);
    assert.equal(environment.document.querySelectorAll("button").length > 0, true);

    await act(async () => summary.click());
    assert.equal(menu.open, true);
    await act(async () => summary.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(menu.open, false);
    assert.equal(environment.document.activeElement, summary);

    await act(async () => summary.click());
    assert.equal(menu.open, true);
    await act(async () => environment.document.body.dispatchEvent(new environment.window.Event("pointerdown", { bubbles: true })));
    assert.equal(menu.open, false);
  } finally {
    await environment.cleanup();
  }
});
