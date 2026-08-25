import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createServer } from "vite";

type TestEnvironment = {
  window: Window;
  document: Document;
  cleanup: () => void;
};

function createDomTestEnvironment(url = "https://liaisonscape.test/"): TestEnvironment {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url });
  const previousGlobals = new Map<string, PropertyDescriptor | undefined>();
  const globals: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    localStorage: dom.window.localStorage,
    sessionStorage: dom.window.sessionStorage,
    history: dom.window.history,
    location: dom.window.location,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
    KeyboardEvent: dom.window.KeyboardEvent,
    getComputedStyle: dom.window.getComputedStyle,
    IS_REACT_ACT_ENVIRONMENT: true,
  };

  dom.window.requestAnimationFrame = (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  };
  dom.window.cancelAnimationFrame = () => {};
  dom.window.scrollTo = () => {};
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};

  for (const [name, value] of Object.entries(globals)) {
    previousGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }

  return {
    window: dom.window,
    document: dom.window.document,
    cleanup() {
      for (const [name, descriptor] of previousGlobals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete (globalThis as Record<string, unknown>)[name];
      }
      dom.window.close();
    },
  };
}

test("renders the production LiaisonScape Home surface", async () => {
  const environment = createDomTestEnvironment();
  const container = environment.document.createElement("div");
  environment.document.body.append(container);
  const root = createRoot(container);
  const server = await createServer({
    root: process.cwd(),
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
  });

  try {
    const { default: App } = await server.ssrLoadModule("/src/App.tsx");
    await act(async () => {
      root.render(React.createElement(App));
    });

    assert.ok(environment.document.querySelector(".home-page"));
    assert.ok(environment.document.querySelector(".home-page h1"));
    assert.ok(environment.document.querySelector(".home-actions"));
  } finally {
    await act(async () => root.unmount());
    environment.cleanup();
    await server.close();
  }
});
