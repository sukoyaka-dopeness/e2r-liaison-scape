import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createServer } from "vite";

import { createDomTestEnvironment } from "./helpers/dom-test-environment.ts";

test("renders Dataset-contained arrow display modes by Relation ID", async () => {
  const dataset = {
    version: "1.0",
    entities: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
      { id: "c", name: "C" },
      { id: "d", name: "D" },
    ],
    events: [],
    relations: [
      { id: "r-normal", sourceId: "a", targetId: "b", name: "Normal" },
      { id: "r-reverse", sourceId: "b", targetId: "c", name: "Reverse" },
      { id: "r-undirected", sourceId: "c", targetId: "d", name: "Undirected" },
      { id: "r-bidirectional", sourceId: "d", targetId: "a", name: "Bidirectional" },
      { id: "r-unknown", sourceId: "a", targetId: "c", name: "Unknown" },
      { id: "r-parallel-reverse", sourceId: "b", targetId: "d", name: "Parallel reverse" },
      { id: "r-parallel-bidirectional", sourceId: "b", targetId: "d", name: "Parallel bidirectional" },
    ],
    extensions: {
      "draft.github.sukoyaka-dopeness.liaisonscape-presentation": {
        specVersion: "0.1.0",
        relations: {
          "r-reverse": { arrowDisplay: "reverse" },
          "r-undirected": { arrowDisplay: "undirected" },
          "r-bidirectional": { arrowDisplay: "bidirectional" },
          "r-unknown": { arrowDisplay: "future-mode" },
          "r-parallel-reverse": { arrowDisplay: "reverse" },
          "r-parallel-bidirectional": { arrowDisplay: "bidirectional" },
        },
      },
    },
  };
  const environment = createDomTestEnvironment({
    url: "https://liaisonscape.test/#datasetUrl=https%3A%2F%2Fdata.example%2Fpresentation.json",
  });
  environment.installGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  environment.window.requestAnimationFrame = (callback: FrameRequestCallback) => { callback(0); return 0; };
  environment.window.cancelAnimationFrame = () => {};
  environment.window.scrollTo = () => {};
  environment.window.HTMLElement.prototype.scrollIntoView = () => {};
  environment.installGlobal("fetch", async () => ({ ok: true, text: async () => JSON.stringify(dataset) }));
  const container = environment.document.createElement("div");
  environment.document.body.append(container);

  try {
    const server = await createServer({ root: process.cwd(), server: { middlewareMode: true, hmr: false }, appType: "custom" });
    environment.addCleanup(() => server.close());
    const root = createRoot(container);
    environment.addCleanup(() => act(async () => root.unmount()));
    const { default: App } = await server.ssrLoadModule("/src/App.tsx");
    await act(async () => root.render(React.createElement(App)));
    await act(async () => new Promise<void>((resolve) => setTimeout(resolve, 0)));

    const arrowheadCount = (relationId: string) =>
      environment.document.querySelectorAll(`.edge-group[data-relation-id="${relationId}"] .edge-arrowhead`).length;
    const edgeGroup = (relationId: string) => environment.document.querySelector(`.edge-group[data-relation-id="${relationId}"]`);
    assert.equal(arrowheadCount("r-normal"), 1);
    assert.equal(arrowheadCount("r-reverse"), 1);
    assert.equal(arrowheadCount("r-undirected"), 0);
    assert.equal(arrowheadCount("r-bidirectional"), 2);
    assert.equal(arrowheadCount("r-unknown"), 1);
    assert.equal(arrowheadCount("r-parallel-reverse"), 1);
    assert.equal(arrowheadCount("r-parallel-bidirectional"), 2);

    for (const relationId of ["r-normal", "r-reverse", "r-undirected", "r-bidirectional", "r-unknown"]) {
      assert.equal(edgeGroup(relationId)?.querySelectorAll(".edge").length, 1);
      assert.equal(edgeGroup(relationId)?.querySelectorAll(".edge-hit-area").length, 1);
    }
  } finally {
    await environment.cleanup();
  }
});
