import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createServer } from "vite";

import { createDomTestEnvironment } from "./helpers/dom-test-environment.ts";

test("renders Dataset-contained arrow display modes and line styles by Relation ID", async () => {
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
      { id: "r-explicit-solid", sourceId: "b", targetId: "a", name: "Explicit solid" },
      { id: "r-normal-dashed", sourceId: "a", targetId: "d", name: "Normal dashed" },
      { id: "r-normal-dotted", sourceId: "c", targetId: "b", name: "Normal dotted" },
      { id: "r-reverse", sourceId: "b", targetId: "c", name: "Reverse" },
      { id: "r-undirected", sourceId: "c", targetId: "d", name: "Undirected" },
      { id: "r-bidirectional", sourceId: "d", targetId: "a", name: "Bidirectional" },
      { id: "r-unknown", sourceId: "a", targetId: "c", name: "Unknown" },
      { id: "r-parallel-reverse", sourceId: "b", targetId: "d", name: "Parallel reverse" },
      { id: "r-parallel-bidirectional", sourceId: "b", targetId: "d", name: "Parallel bidirectional" },
      { id: "r-self", sourceId: "a", targetId: "a", name: "Self" },
    ],
    extensions: {
      "draft.github.sukoyaka-dopeness.liaisonscape-presentation": {
        specVersion: "0.1.0",
        relations: {
          "r-explicit-solid": { lineStyle: "solid" },
          "r-normal-dashed": { lineStyle: "dashed" },
          "r-normal-dotted": { lineStyle: "dotted" },
          "r-reverse": { arrowDisplay: "reverse", lineStyle: "dashed" },
          "r-undirected": { arrowDisplay: "undirected", lineStyle: "dotted" },
          "r-bidirectional": { arrowDisplay: "bidirectional", lineStyle: "dashed" },
          "r-unknown": { arrowDisplay: "future-mode" },
          "r-parallel-reverse": { arrowDisplay: "reverse", lineStyle: "solid" },
          "r-parallel-bidirectional": { arrowDisplay: "bidirectional", lineStyle: "dotted" },
          "r-self": { arrowDisplay: "bidirectional", lineStyle: "dotted" },
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
    assert.equal(arrowheadCount("r-explicit-solid"), 1);
    assert.equal(arrowheadCount("r-normal-dashed"), 1);
    assert.equal(arrowheadCount("r-normal-dotted"), 1);
    assert.equal(arrowheadCount("r-reverse"), 1);
    assert.equal(arrowheadCount("r-undirected"), 0);
    assert.equal(arrowheadCount("r-bidirectional"), 2);
    assert.equal(arrowheadCount("r-unknown"), 1);
    assert.equal(arrowheadCount("r-parallel-reverse"), 1);
    assert.equal(arrowheadCount("r-parallel-bidirectional"), 2);
    assert.equal(arrowheadCount("r-self"), 2);

    const edgeClass = (relationId: string) => edgeGroup(relationId)?.querySelector(".edge")?.getAttribute("class");
    assert.equal(edgeClass("r-normal"), "edge line-style-solid");
    assert.equal(edgeClass("r-explicit-solid"), "edge line-style-solid");
    assert.equal(edgeClass("r-normal-dashed"), "edge line-style-dashed");
    assert.equal(edgeClass("r-normal-dotted"), "edge line-style-dotted");
    assert.equal(edgeClass("r-reverse"), "edge line-style-dashed");
    assert.equal(edgeClass("r-undirected"), "edge line-style-dotted");
    assert.equal(edgeClass("r-bidirectional"), "edge line-style-dashed");
    assert.equal(edgeClass("r-unknown"), "edge line-style-solid");
    assert.equal(edgeClass("r-parallel-reverse"), "edge line-style-solid");
    assert.equal(edgeClass("r-parallel-bidirectional"), "edge line-style-dotted");
    assert.equal(edgeClass("r-self"), "edge line-style-dotted");

    for (const relationId of ["r-normal", "r-explicit-solid", "r-normal-dashed", "r-normal-dotted", "r-reverse", "r-undirected", "r-bidirectional", "r-unknown", "r-parallel-reverse", "r-parallel-bidirectional", "r-self"]) {
      const group = edgeGroup(relationId);
      assert.equal(group?.querySelectorAll(".edge").length, 1);
      assert.equal(group?.querySelectorAll(".edge-hit-area").length, 1);
      assert.equal(group?.querySelectorAll(".edge-halo").length, 1);
      assert.equal(group?.querySelector(".edge-hit-area")?.getAttribute("class")?.includes("line-style-"), false);
      assert.equal(group?.querySelector(".edge-halo")?.getAttribute("class")?.includes("line-style-"), false);
      assert.equal(group?.querySelector(".edge")?.getAttribute("d")?.includes("NaN"), false);
    }
    assert.notEqual(edgeGroup("r-parallel-reverse")?.querySelector(".edge")?.getAttribute("d"), edgeGroup("r-parallel-bidirectional")?.querySelector(".edge")?.getAttribute("d"));
  } finally {
    await environment.cleanup();
  }
});
