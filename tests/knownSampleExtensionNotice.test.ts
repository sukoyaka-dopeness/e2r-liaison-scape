import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createDomTestEnvironment } from "./helpers/dom-test-environment.ts";
import { loadDataset } from "../src/dataset.ts";
import { isKnownDimensionAssessmentNotice } from "../src/known-sample-extension-notice.ts";

const id = "draft.github.sukoyaka-dopeness.dimension-assessment";
for (const locale of ["en", "ja"]) {
  test(`Lighthouse ${locale} has a bounded informational notice without changing diagnostics`, () => {
    const source = readFileSync(new URL(`../public/lighthouse-restoration-demo.${locale}.e2r.json`, import.meta.url), "utf8");
    const imported = loadDataset(source);
    assert.ok(imported.dataset);
    assert.equal(isKnownDimensionAssessmentNotice(imported.dataset, imported.diagnostics), true);
    const copy = structuredClone(imported.dataset);
    const extensions = copy.extensions as Record<string, Record<string, unknown>>;
    extensions[id].specVersion = "9.0.0";
    assert.equal(isKnownDimensionAssessmentNotice(copy, imported.diagnostics), false);
    extensions[id].specVersion = "0.2.0";
    const uses = extensions["draft.github.sukoyaka-dopeness.specification"].uses as Array<Record<string, unknown>>;
    uses[3].version = "9.0.0";
    assert.equal(isKnownDimensionAssessmentNotice(copy, imported.diagnostics), false);
    uses[3].version = "0.2.0";
    (extensions[id].assessments as Array<Record<string, unknown>>)[0].value = "invalid";
    assert.equal(isKnownDimensionAssessmentNotice(copy, imported.diagnostics), false);
    const unknown = structuredClone(imported.dataset);
    const unknownExtensions = unknown.extensions as Record<string, unknown>;
    unknownExtensions["example.unknown"] = unknownExtensions[id];
    delete unknownExtensions[id];
    assert.equal(isKnownDimensionAssessmentNotice(unknown, imported.diagnostics), false);
    const undeclared = structuredClone(imported.dataset);
    ((undeclared.extensions as Record<string, Record<string, unknown>>)["draft.github.sukoyaka-dopeness.specification"].uses as unknown[]).pop();
    assert.equal(isKnownDimensionAssessmentNotice(undeclared, imported.diagnostics), false);
    assert.equal(isKnownDimensionAssessmentNotice(imported.dataset, [...imported.diagnostics, { code: "other_warning", path: "/", severity: "warning" }]), false);
    assert.equal(isKnownDimensionAssessmentNotice(imported.dataset, [{ ...imported.diagnostics[0], severity: "error" }, imported.diagnostics[1]]), false);
  });
}

test("Current and Candidate notices keep EN/JA context and exact technical diagnostics behind a disclosure", async () => {
  const server = await createServer({ root: process.cwd(), server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try {
    const { SampleExtensionNotice } = await server.ssrLoadModule("/src/components/SampleExtensionNotice.tsx");
    for (const locale of ["en", "ja"] as const) {
      const imported = loadDataset(readFileSync(new URL(`../public/lighthouse-restoration-demo.${locale}.e2r.json`, import.meta.url), "utf8"));
      for (const scope of ["current", "candidate"] as const) {
        const html = renderToStaticMarkup(React.createElement(SampleExtensionNotice, {
          locale, diagnostics: imported.diagnostics, scope,
        }));
        assert.match(html, /<details class="sample-extension-notice"><summary>/);
        assert.match(html, /unknown_extension/);
        assert.match(html, /specification_unavailable/);
        assert.match(html, /Severity|重要度/);
        assert.match(html, /Path:|場所:/);
        assert.match(html, locale === "ja" ? /追加情報/ : /Additional information/);
      }
    }
  } finally {
    await server.close();
  }
});

test("Lighthouse Candidate disclosure stays in the replacement focus cycle", async () => {
  const imported = loadDataset(readFileSync(new URL("../public/lighthouse-restoration-demo.ja.e2r.json", import.meta.url), "utf8"));
  assert.ok(imported.dataset);
  const environment = createDomTestEnvironment();
  environment.installGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = environment.document.createElement("div");
  environment.document.body.append(container);
  const root = createRoot(container);
  const server = await createServer({ root: process.cwd(), server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  try {
    const { DatasetReplacementDialog } = await server.ssrLoadModule("/src/components/DatasetReplacementDialog.tsx");
    await act(async () => root.render(React.createElement(DatasetReplacementDialog, {
      locale: "ja", datasetModified: true, pendingUserWork: false, dataset: imported.dataset,
      diagnostics: imported.diagnostics, onCancel: () => {}, onDiscard: () => {},
      onExportAndContinue: () => {}, onExportDataset: () => {},
    })));
    const summary = environment.document.querySelector<HTMLElement>(".sample-extension-notice > summary");
    const technical = environment.document.querySelector<HTMLElement>(".sample-extension-technical > summary");
    const buttons = [...environment.document.querySelectorAll<HTMLElement>(".replacement-confirmation .detail-actions button")];
    assert.ok(summary);
    assert.ok(technical);
    assert.equal(environment.document.activeElement, summary);
    const pressTab = async (shiftKey = false) => act(async () => {
      environment.document.dispatchEvent(new environment.window.KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true }));
    });
    await pressTab();
    assert.equal(environment.document.activeElement, buttons[0]);
    await pressTab(true);
    assert.equal(environment.document.activeElement, summary);
    await act(async () => { (summary.parentElement as HTMLDetailsElement).open = true; });
    await pressTab();
    assert.equal(environment.document.activeElement, technical);
    await pressTab();
    assert.equal(environment.document.activeElement, buttons[0]);
  } finally {
    await act(async () => root.unmount());
    await server.close();
    environment.cleanup();
  }
});
