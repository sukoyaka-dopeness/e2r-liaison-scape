import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createServer } from "vite";
import { createDomTestEnvironment } from "./helpers/dom-test-environment.ts";
import type { Dataset } from "../src/models.ts";
import type { RelationLineStyle } from "../src/presentation-extension.ts";

const presentationExtensionId = "draft.github.sukoyaka-dopeness.liaisonscape-presentation";

function RelationDetailWorkflowProbe({ initialDataset, Dialog, useWorkflow, initialLocale = "en" }: { initialDataset: Dataset; Dialog: (props: Record<string, unknown>) => React.ReactElement; useWorkflow: (options: Record<string, unknown>) => Record<string, any>; initialLocale?: "en" | "ja" }) {
  const [dataset, setDataset] = React.useState(initialDataset);
  const [locale, setLocale] = React.useState<"en" | "ja">(initialLocale);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [selectedRelationId, setSelectedRelationId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState("");
  const [updateCount, setUpdateCount] = React.useState(0);
  const workflow = useWorkflow({
    dataset,
    locale,
    selectedId,
    selectedRelationId,
    onDatasetUpdate: (nextDataset) => { setDataset(nextDataset); setUpdateCount((value) => value + 1); },
    onMessage: setMessage,
    onSelectEntity: setSelectedId,
    onSelectRelation: setSelectedRelationId,
    onEntityDeleted: () => {},
    onRelationDeleted: () => {},
  });
  const detail = workflow.selectedRelationDetail;
  const entityEndpoints = detail !== null
    && dataset.entities.some(({ id }) => id === detail.sourceId)
    && dataset.entities.some(({ id }) => id === detail.targetId);
  const dialog = workflow.detailOpen && detail
    ? React.createElement(Dialog, {
      locale,
      relation: detail.relation,
      sourceId: detail.sourceId,
      targetId: detail.targetId,
      source: detail.source,
      target: detail.target,
      entities: dataset.entities,
      name: workflow.relationNameDraft,
      description: workflow.relationDescriptionDraft,
      arrowDisplay: workflow.relationArrowDisplayDraft,
      onArrowDisplayChange: workflow.changeRelationArrowDisplay,
      lineStyle: workflow.relationLineStyleDraft,
      onLineStyleChange: workflow.changeRelationLineStyle,
      saveDisabled: !workflow.meaningfulRelationDetailDraft,
      endpointEditing: entityEndpoints ? {
        entities: dataset.entities,
        sourceId: workflow.relationSourceDraft,
        targetId: workflow.relationTargetDraft,
        onSourceChange: workflow.setRelationSourceDraft,
        onTargetChange: workflow.setRelationTargetDraft,
      } : undefined,
      onNameChange: workflow.setRelationNameDraft,
      onDescriptionChange: workflow.setRelationDescriptionDraft,
      onSave: workflow.saveRelationDetails,
      onDelete: () => {},
      onClose: workflow.requestDetailDismissal,
    })
    : null;
  return React.createElement("div", null,
    React.createElement("button", { id: "probe-open", type: "button", onClick: () => workflow.openRelationDetail("relation") }, "Open"),
    React.createElement("button", { id: "probe-locale", type: "button", onClick: () => setLocale((value) => value === "en" ? "ja" : "en") }, "Locale"),
    React.createElement("button", { id: "probe-name-only", type: "button", onClick: () => workflow.setRelationNameDraft("Name only") }, "Name only"),
    React.createElement("button", { id: "probe-core-name", type: "button", onClick: () => workflow.setRelationNameDraft("Core changed") }, "Core changed"),
    React.createElement("button", { id: "probe-blocked-name", type: "button", onClick: () => workflow.setRelationNameDraft("Must not partially save") }, "Blocked name"),
    React.createElement("output", { id: "probe-state" }, JSON.stringify({ dataset, detailOpen: workflow.detailOpen, message, updateCount })),
    dialog,
    workflow.detailDismissal && React.createElement("div", { id: "probe-dismissal" },
      React.createElement("button", { type: "button", onClick: workflow.cancelDetailDismissal }, "Cancel"),
      React.createElement("button", { type: "button", onClick: workflow.discardDetailDraft }, "Discard")),
  );
}

async function withRelationDetailProbe(dataset: Dataset, callback: (environment: ReturnType<typeof createDomTestEnvironment>) => Promise<void>) {
  const environment = createDomTestEnvironment();
  environment.installGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = environment.document.createElement("div");
  environment.document.body.append(container);
  const root = createRoot(container);
  const server = await createServer({ root: process.cwd(), server: { middlewareMode: true, hmr: false }, appType: "custom" });
  try {
    const [{ RelationDetailDialog }, { useDetailDeletionWorkflow }] = await Promise.all([
      server.ssrLoadModule("/src/components/RelationDetailDialog.tsx"),
      server.ssrLoadModule("/src/hooks/useDetailDeletionWorkflow.ts"),
    ]);
    await act(async () => root.render(React.createElement(RelationDetailWorkflowProbe, { initialDataset: dataset, Dialog: RelationDetailDialog, useWorkflow: useDetailDeletionWorkflow })));
    await callback(environment);
  } finally {
    await act(async () => root.unmount());
    await server.close();
    await environment.cleanup();
  }
}

function probeSnapshot(environment: ReturnType<typeof createDomTestEnvironment>) {
  return JSON.parse(environment.document.querySelector("#probe-state")?.textContent ?? "{}") as { dataset: Dataset; detailOpen: boolean; message: string; updateCount: number };
}

async function changeProbeSelect(environment: ReturnType<typeof createDomTestEnvironment>, selector: string, value: string) {
  const select = environment.document.querySelector(selector) as HTMLSelectElement;
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new environment.window.Event("change", { bubbles: true }));
  });
}

async function changeProbeArrow(environment: ReturnType<typeof createDomTestEnvironment>, value: string) {
  await changeProbeSelect(environment, "#relation-arrow-display", value);
}

async function changeProbeLineStyle(environment: ReturnType<typeof createDomTestEnvironment>, value: RelationLineStyle) {
  await changeProbeSelect(environment, "#relation-line-style", value);
}

async function setProbeName(environment: ReturnType<typeof createDomTestEnvironment>, id: string) {
  await act(async () => { (environment.document.querySelector(`#${id}`) as HTMLButtonElement).click(); });
}

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

test("opens an exact targeted Relation inspection request on the existing Detail surface", async () => {
  const relationDataset = {
    version: "1.0",
    entities: [{ id: "entity-1", name: "Source" }, { id: "entity-2", name: "Target" }],
    events: [],
    relations: [{ id: "relation-target", sourceId: "entity-1", targetId: "entity-2", name: "Inspect me" }],
  };
  const environment = createDomTestEnvironment({
    url: "https://liaisonscape.test/#locale=ja&datasetUrl=https%3A%2F%2Fdata.example%2Fdataset.json&targetObjectId=relation-target&targetObjectType=Relation&requiredCapability=relation.inspect&targetContractVersion=1",
  });
  environment.installGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  environment.window.requestAnimationFrame = (callback: FrameRequestCallback) => { callback(0); return 0; };
  environment.window.cancelAnimationFrame = () => {};
  environment.window.scrollTo = () => {};
  environment.window.HTMLElement.prototype.scrollIntoView = () => {};
  environment.installGlobal("fetch", async () => ({ ok: true, text: async () => JSON.stringify(relationDataset) }));
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

    assert.ok(environment.document.querySelector("#relation-detail-title"));
    assert.match(environment.document.querySelector(".detail-object-id")?.textContent ?? "", /relation-target/);
    assert.deepEqual([environment.document.querySelector('label[for="relation-source"]')?.textContent, environment.document.querySelector('label[for="relation-target"]')?.textContent], ["Connected object", "Connected object"]);
    assert.equal(environment.document.querySelector(".confirmation-relation"), null);
    assert.equal(environment.document.querySelector(".confirmation-entity"), null);
    assert.match(environment.window.location.hash, /locale=ja/);
  } finally {
    await environment.cleanup();
  }
});

test("renders type-neutral Relation Detail roles for Event endpoints in both directions and locales", async () => {
  const environment = createDomTestEnvironment();
  environment.installGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = environment.document.createElement("div");
  environment.document.body.append(container);

  try {
    const server = await createServer({ root: process.cwd(), server: { middlewareMode: true, hmr: false }, appType: "custom" });
    environment.addCleanup(() => server.close());
    const root = createRoot(container);
    environment.addCleanup(() => act(async () => root.unmount()));
    const { RelationDetailDialog } = await server.ssrLoadModule("/src/components/RelationDetailDialog.tsx");
    const entity = { id: "entity-endpoint", name: "Entity endpoint" };
    const event = { id: "event-endpoint", name: "Event endpoint" };
    const renderDetail = async (locale: "en" | "ja", source: typeof entity | typeof event, target: typeof entity | typeof event) => {
      const relation = { id: "mixed-relation", sourceId: source.id, targetId: target.id, name: "Mixed Relation" };
      await act(async () => root.render(React.createElement(RelationDetailDialog, {
        locale,
        relation,
        sourceId: relation.sourceId,
        targetId: relation.targetId,
        source,
        target,
        entities: [entity],
        name: relation.name,
        description: "",
        arrowDisplay: "normal",
        onNameChange: () => {},
        onDescriptionChange: () => {},
        onArrowDisplayChange: () => {},
        saveDisabled: true,
        onSave: () => {},
        onDelete: () => {},
        onClose: () => {},
      })));
      return [...environment.document.querySelectorAll(".detail-fields > span > strong")].map((element) => element.textContent);
    };

    assert.deepEqual(await renderDetail("en", event, entity), ["Connected object", "Connected object"]);
    assert.match(environment.document.querySelector(".detail-fields")?.textContent ?? "", /Event endpoint.*Entity endpoint/s);
    assert.doesNotMatch([...environment.document.querySelectorAll(".detail-fields > span > strong")].map((element) => element.textContent).join(" "), /Entity/);
    assert.deepEqual(await renderDetail("ja", entity, event), ["つながり先", "つながり先"]);
    assert.match(environment.document.querySelector(".detail-fields")?.textContent ?? "", /Entity endpoint.*Event endpoint/s);
    assert.doesNotMatch([...environment.document.querySelectorAll(".detail-fields > span > strong")].map((element) => element.textContent).join(" "), /エンティティ/);
  } finally {
    await environment.cleanup();
  }
});

test("opens a targeted Relation deletion intent on the existing Detail surface without auto-confirming", async () => {
  const relationDataset = {
    version: "1.0",
    entities: [{ id: "entity-1", name: "Source" }, { id: "entity-2", name: "Target" }],
    events: [],
    relations: [{ id: "relation-delete-target", sourceId: "entity-1", targetId: "entity-2", name: "Delete intentionally" }],
  };
  const environment = createDomTestEnvironment({
    url: "https://liaisonscape.test/?handoff=delete#locale=ja&datasetUrl=https%3A%2F%2Fdata.example%2Fdataset.json&targetObjectId=relation-delete-target&targetObjectType=Relation&requiredCapability=relation.delete&targetContractVersion=1",
  });
  environment.installGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  environment.window.requestAnimationFrame = (callback: FrameRequestCallback) => { callback(0); return 0; };
  environment.window.cancelAnimationFrame = () => {};
  environment.window.scrollTo = () => {};
  environment.window.HTMLElement.prototype.scrollIntoView = () => {};
  environment.installGlobal("fetch", async () => ({ ok: true, text: async () => JSON.stringify(relationDataset) }));
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

    assert.ok(environment.document.querySelector("#relation-detail-title"));
    assert.match(environment.document.querySelector(".detail-object-id")?.textContent ?? "", /relation-delete-target/);
    assert.equal(environment.document.querySelector(".confirmation-relation"), null);
    assert.equal(environment.document.querySelector(".confirmation-entity"), null);
    const deleteButton = environment.document.querySelector(".relation-danger button");
    assert.ok(deleteButton);
    assert.notEqual(environment.document.activeElement, deleteButton);
    assert.match(environment.window.location.hash, /locale=ja/);

    await act(async () => (deleteButton as HTMLButtonElement).click());
    assert.ok(environment.document.querySelector(".confirmation-relation"));
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
  assert.ok(source.indexOf("</svg>") < source.lastIndexOf("graph.eventRelatedHiddenEdges"));
  assert.match(source, /setHoveredPlacement\(null\);\s*setContextMenu\(\{ \.\.\.createCanvasContextMenu/s);
  assert.match(source, /!contextMenu && hoveredPlacement &&/);
  assert.match(source, /event\.pointerType === "mouse" && event\.button !== 0\) return;/);
  assert.match(source, /event\.pointerType !== "mouse" \|\| event\.button !== 0/);
  assert.match(source, /contextMenuPosition/);
  assert.match(source, /contextMenuRef/);
  assert.match(source, /document\.documentElement\.clientWidth/);
  assert.match(source, /document\.documentElement\.clientHeight/);
  const styles = readFileSync("src/styles.css", "utf8");
  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(styles, /\.desktop-secondary-action \{ display: none !important; \}/);
  assert.match(styles, /\.mobile-secondary-action \{ display: block; \}/);
  assert.match(styles, /\.viewport-controls\.mobile-hide \{ display: none !important; \}/);
  assert.match(styles, /\.dataset-actions \{[^}]*flex-wrap: wrap;/);
  assert.match(styles, /\.dataset-actions__buttons, \.viewport-controls \{[^}]*flex-wrap: nowrap;/);
  assert.match(styles, /\.viewport-controls \{[^}]*width: max-content;/);
  assert.match(styles, /\.viewport-toolbar-actions \{[^}]*flex: 0 0 auto;[^}]*flex-wrap: nowrap;/);
  assert.match(styles, /\.viewport-toolbar-actions > button,\s*\.viewport-toolbar-actions > span \{[^}]*white-space: nowrap;/);
  assert.match(styles, /\.viewport-toolbar-handle-tooltip \{[^}]*position: absolute;[^}]*display: none;[^}]*pointer-events: none;/);
  assert.match(styles, /\.viewport-toolbar-handle-tooltip \{[^}]*font-weight: 600;[^}]*white-space: pre-line;/);
  assert.match(styles, /\.viewport-toolbar-handle:hover \+ \.viewport-toolbar-handle-tooltip,\s*\.viewport-toolbar-handle:focus-visible \+ \.viewport-toolbar-handle-tooltip \{[^}]*display: block;/);
  assert.match(styles, /@media \(max-width: 600px\)/);
});

test("implements the collapsible viewport toolbar interaction contract", async () => {
  const relationDataset = {
    version: "1.0",
    entities: [{ id: "entity-1", name: "Source" }, { id: "entity-2", name: "Target" }],
    events: [],
    relations: [{ id: "relation-toolbar", sourceId: "entity-1", targetId: "entity-2", name: "Toolbar" }],
  };
  const environment = createDomTestEnvironment({
    url: "https://liaisonscape.test/#locale=en&datasetUrl=https%3A%2F%2Fdata.example%2Fdataset.json",
  });
  environment.installGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  environment.window.requestAnimationFrame = (callback: FrameRequestCallback) => { callback(0); return 0; };
  environment.window.cancelAnimationFrame = () => {};
  environment.window.scrollTo = () => {};
  environment.window.HTMLElement.prototype.scrollIntoView = () => {};
  environment.window.HTMLElement.prototype.setPointerCapture = function setPointerCapture() {};
  environment.window.HTMLElement.prototype.releasePointerCapture = function releasePointerCapture() {};
  environment.window.HTMLElement.prototype.hasPointerCapture = function hasPointerCapture() { return true; };
  environment.installGlobal("fetch", async () => ({ ok: true, text: async () => JSON.stringify(relationDataset) }));
  const resizeCallbacks = new Set<() => void>();
  class TestResizeObserver {
    private readonly callback: () => void;

    constructor(callback: () => void) {
      this.callback = callback;
      resizeCallbacks.add(callback);
    }

    observe() {}
    disconnect() { resizeCallbacks.delete(this.callback); }
  }
  environment.installGlobal("ResizeObserver", TestResizeObserver);
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

    const toolbar = environment.document.querySelector(".viewport-controls") as HTMLDivElement;
    const graph = environment.document.querySelector(".graph") as SVGSVGElement;
    const handle = environment.document.querySelector(".viewport-toolbar-handle") as HTMLButtonElement;
    const tooltip = environment.document.querySelector(".viewport-toolbar-handle-tooltip") as HTMLSpanElement;
    const actions = environment.document.querySelector("#viewport-toolbar-actions") as HTMLDivElement;
    assert.ok(toolbar);
    assert.ok(graph);
    assert.ok(handle);
    assert.ok(tooltip);
    assert.ok(actions);
    assert.equal(handle.hasAttribute("title"), false);
    assert.equal(tooltip.getAttribute("role"), "tooltip");
    assert.equal(tooltip.getAttribute("aria-hidden"), "true");
    assert.equal(tooltip.textContent, "Move\nCollapse");
    assert.equal(handle.getAttribute("aria-expanded"), "true");
    assert.equal(actions.hidden, false);
    assert.equal(handle.getAttribute("aria-label"), "Move or collapse viewport controls");
    assert.equal(handle.getAttribute("aria-controls"), "viewport-toolbar-actions");

    let toolbarWidth = 360;
    Object.defineProperty(graph, "getBoundingClientRect", { configurable: true, value: () => ({ left: 0, top: 0, width: 800, height: 500 }) });
    Object.defineProperty(toolbar, "getBoundingClientRect", { configurable: true, value: () => ({ left: 0, top: 0, width: toolbarWidth, height: 50 }) });
    const dispatchPointer = async (type: string, pointerId: number, clientX: number, clientY: number) => {
      const event = new environment.window.Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        button: { value: 0 },
        clientX: { value: clientX },
        clientY: { value: clientY },
        isPrimary: { value: true },
        pointerId: { value: pointerId },
      });
      await act(async () => { handle.dispatchEvent(event); });
    };
    const consumePointerClick = async () => {
      await act(async () => { handle.dispatchEvent(new environment.window.MouseEvent("click", { bubbles: true, detail: 1 })); });
    };

    await dispatchPointer("pointerdown", 1, 10, 10);
    await dispatchPointer("pointermove", 1, 18, 10);
    await dispatchPointer("pointerup", 1, 18, 10);
    await consumePointerClick();
    assert.equal(handle.getAttribute("aria-expanded"), "false");
    assert.equal(actions.hidden, true);
    assert.equal(actions.querySelectorAll("button").length, 3);
    assert.equal(handle.getAttribute("aria-label"), "Move or expand viewport controls");
    assert.equal(tooltip.textContent, "Move\nExpand");

    await act(async () => { handle.click(); });
    assert.equal(handle.getAttribute("aria-expanded"), "true");
    assert.equal(handle.getAttribute("aria-label"), "Move or collapse viewport controls");
    assert.equal(tooltip.textContent, "Move\nCollapse");

    await dispatchPointer("pointerdown", 2, 10, 10);
    await dispatchPointer("pointermove", 2, 410, 10);
    await dispatchPointer("pointerup", 2, 410, 10);
    await consumePointerClick();
    assert.equal(handle.getAttribute("aria-expanded"), "true");
    assert.equal(toolbar.style.left, "400px");

    await dispatchPointer("pointerdown", 3, 410, 10);
    await dispatchPointer("pointercancel", 3, 410, 10);
    await consumePointerClick();
    assert.equal(handle.getAttribute("aria-expanded"), "true");

    toolbarWidth = 500;
    await act(async () => {
      for (const callback of resizeCallbacks) callback();
    });
    assert.equal(toolbar.style.left, "300px");

    const localeButton = environment.document.querySelector(".locale-button") as HTMLButtonElement;
    await act(async () => { localeButton.click(); });
    assert.equal(handle.getAttribute("aria-label"), "表示操作を移動またはたたむ");
    assert.equal(tooltip.textContent, "移動\nたたむ");
    assert.equal(toolbar.style.left, "300px");

    await act(async () => { handle.click(); });
    assert.equal(handle.getAttribute("aria-expanded"), "false");
    assert.equal(handle.getAttribute("aria-label"), "表示操作を移動または広げる");
    assert.equal(tooltip.textContent, "移動\n広げる");
  } finally {
    await environment.cleanup();
  }
});

test("keeps Dataset title editing connected to existing Dataset safety state", () => {
  const source = readFileSync("src/App.tsx", "utf8");
  const i18n = readFileSync("src/i18n.ts", "utf8");
  const styles = readFileSync("src/styles.css", "utf8");

  assert.match(i18n, /editDatasetTitle:/);
  assert.match(i18n, /saveDatasetTitle:/);
  assert.match(i18n, /datasetTitleVisible:/);
  assert.match(i18n, /saveDatasetTitleVisible:/);
  assert.match(i18n, /datasetTitleInput:/);
  assert.match(i18n, /datasetTitleInput: "Dataset title"/);
  assert.match(i18n, /datasetTitleVisible: "Title"/);
  assert.match(i18n, /saveDatasetTitleVisible: "Save"/);
  assert.match(source, /updateDatasetTitle\(dataset, datasetTitleDraft\)/);
  assert.match(source, /updateDataset\(updateDatasetTitle\(dataset, datasetTitleDraft\)\)/);
  assert.match(source, /meaningfulDatasetTitleDraft: datasetTitleEditing/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /restoreDatasetTitleFocusRef/);
  assert.match(source, /setDatasetTitleEditing\(false\);\s*setDatasetTitleDraft\(""\)/s);
  assert.match(source, /ref=\{datasetTitleInputRef\}/);
  assert.doesNotMatch(source, /ref=\{datasetTitleEditTriggerRef\}/);
  const exportFunction = source.slice(source.indexOf("function exportCurrentDataset"), source.indexOf("function exportAndContinueDatasetReplacement"));
  assert.doesNotMatch(exportFunction, /datasetTitleDraft/);
  assert.match(styles, /\.dataset-metadata \.dataset-title-editing/);
  assert.match(styles, /\.dataset-metadata > dt:first-of-type \+ dd > span \{ min-width: 0;/);
  assert.match(styles, /@media \(max-width: 600px\)/);
  assert.match(styles, /\.dataset-metadata \.dataset-title-editing input \{ flex-basis: 100%; \}/);
  assert.doesNotMatch(styles, /\.dataset-metadata \{ grid-template-columns:/);
});

test("keeps object IDs behind collapsed technical detail disclosures", () => {
  const entity = readFileSync("src/components/EntityDetailDialog.tsx", "utf8");
  const relation = readFileSync("src/components/RelationDetailDialog.tsx", "utf8");
  const i18n = readFileSync("src/i18n.ts", "utf8");
  const styles = readFileSync("src/styles.css", "utf8");
  for (const source of [entity, relation]) {
    assert.match(source, /<details className="detail-technical-details">/);
    assert.match(source, /<summary>\{translate\(locale, "technicalDetails"\)\}<\/summary>/);
    assert.match(source, /translate\(locale, "objectId"\)/);
    assert.match(source, /className="detail-object-id"/);
    assert.doesNotMatch(source, /<dt>\{translate\(locale, "id"\)\}<\/dt>/);
  }
  assert.doesNotMatch(entity, /dangerZone/);
  assert.match(entity, /formatEntityIncidentWarning/);
  assert.match(entity, /related-relations/);
  assert.doesNotMatch(relation, /dangerZone/);
  assert.match(relation, /className="detail-danger relation-danger"/);
  assert.match(styles, /\.detail-danger\.relation-danger \{ justify-content: flex-end; \}/);
  assert.match(styles, /\.detail-danger\.relation-danger button \{ width: 100%; \}/);
  assert.match(i18n, /technicalDetails: "Technical details"/);
  assert.match(i18n, /objectId: "Object ID"/);
  assert.match(i18n, /technicalDetails: "技術情報"/);
  assert.match(i18n, /entityDatasetRelations: "Relations in Dataset"/);
  assert.match(i18n, /entityDatasetRelations:/);
  assert.match(entity, /autoComplete="off"/);
  assert.match(relation, /autoComplete="off"/);
  assert.match(readFileSync("src/components/CreationDialog.tsx", "utf8"), /creation-name.*autoComplete="off"/s);
  assert.ok(entity.indexOf("detail-fields") < entity.indexOf("entityShownRelations"));
  assert.ok(entity.indexOf("entityShownRelations") < entity.indexOf("detail-technical-details"));
  assert.ok(relation.indexOf("detail-fields") < relation.indexOf("detail-technical-details"));
  assert.match(styles, /\.detail-technical-details/);
  assert.match(styles, /\.detail-object-id \{ overflow-wrap: anywhere; word-break: break-word; \}/);
  assert.match(styles, /container-type: inline-size/);
  assert.match(styles, /\.detail > dl:first-of-type \{ grid-template-columns: max-content minmax\(0, 1fr\)/);
  assert.match(styles, /@container \(max-width: 300px\)/);
  assert.match(i18n, /entityDetailSave: "Save Entity"/);
  assert.match(i18n, /relationDetailSave: "Save Relation"/);
  assert.match(entity, /translate\(locale, "entityDetailSave"\)/);
  assert.match(relation, /translate\(locale, "relationDetailSave"\)/);
  assert.match(styles, /\.detail-fields select \{ box-sizing: border-box; width: 100%; max-width: 100%; min-width: 0;/);
});

test("keeps Entity endpoint identity presentation shared across relation surfaces", () => {
  const creation = readFileSync("src/components/CreationDialog.tsx", "utf8");
  const relation = readFileSync("src/components/RelationDetailDialog.tsx", "utf8");
  const app = readFileSync("src/App.tsx", "utf8");
  assert.match(creation, /buildEntityEndpointLabels/);
  assert.match(relation, /buildEntityEndpointLabels/);
  assert.match(creation, /value=\{entity\.id\}/);
  assert.match(relation, /value=\{endpointEditing\.sourceId\}/);
  assert.match(relation, /value=\{endpointEditing\.targetId\}/);
  assert.match(relation, /endpointLabel\(source, sourceId\)/);
  assert.match(relation, /endpointLabel\(target, targetId\)/);
  assert.match(app, /entities=\{dataset\.entities\}/);
});

test("guards dirty Entity and Relation Detail dismissal without changing draft semantics", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const workflow = readFileSync("src/hooks/useDetailDeletionWorkflow.ts", "utf8");
  const confirmation = readFileSync("src/components/DetailDismissalConfirmation.tsx", "utf8");
  const i18n = readFileSync("src/i18n.ts", "utf8");
  assert.match(workflow, /function requestDetailDismissal\(\)/);
  assert.match(workflow, /const meaningfulEntityDetailDraft/);
  assert.match(workflow, /const meaningfulRelationDetailDraft/);
  assert.match(app, /onClose=\{requestDetailDismissal\}/);
  assert.match(app, /<DetailDismissalConfirmation/);
  assert.match(confirmation, /event\.key === "Escape"/);
  assert.match(confirmation, /cancelRef\.current\?\.focus\(\)/);
  assert.match(confirmation, /onDiscard/);
  assert.match(i18n, /detailDismissalTitle: "Discard unsaved changes\?"/);
  assert.match(i18n, /discardDetailDraft: "Discard Changes"/);
  assert.match(i18n, /detailDismissalTitle: "未保存の変更を破棄しますか？"/);
});

test("guards dirty Creation Escape while preserving explicit Cancel semantics", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const creation = readFileSync("src/components/CreationDialog.tsx", "utf8");
  const confirmation = readFileSync("src/components/CreationDismissalConfirmation.tsx", "utf8");
  const i18n = readFileSync("src/i18n.ts", "utf8");
  assert.match(app, /const meaningfulCreationDraft = creationMode !== null/);
  assert.match(app, /if \(meaningfulCreationDraft\) setCreationDismissal\(true\)/);
  assert.match(app, /onCancel=\{discardCreationDraft\}/);
  assert.match(app, /<CreationDismissalConfirmation/);
  assert.match(creation, /onCancel: \(\) => void/);
  assert.match(confirmation, /event\.key === "Escape"/);
  assert.match(confirmation, /cancelRef\.current\?\.focus\(\)/);
  assert.match(confirmation, /discardCreationDraft/);
  assert.match(i18n, /creationDismissalMessage: "You have unsaved changes for this new object\./);
  assert.match(i18n, /discardCreationDraft: "Discard and Close"/);
});

test("keeps Detail and deletion orchestration behind the bounded workflow controller", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const workflow = readFileSync("src/hooks/useDetailDeletionWorkflow.ts", "utf8");
  assert.match(workflow, /export function useDetailDeletionWorkflow/);
  assert.match(workflow, /const \[deleteConfirmation,/);
  assert.match(workflow, /assessEntityDeletion/);
  assert.match(workflow, /assessRelationDeletion/);
  assert.match(workflow, /function confirmDeletion\(\)/);
  assert.match(workflow, /onDatasetUpdate\(result\.dataset\)/);
  assert.match(workflow, /onEntityDeleted\(result\.deletedId\)/);
  assert.match(workflow, /onRelationDeleted\(result\.deletedId\)/);
  assert.match(app, /const \[selectedId, setSelectedId\]/);
  assert.match(app, /onDatasetUpdate: updateDataset/);
  assert.match(app, /onEntityDeleted: \(id\)/);
  assert.match(app, /onRelationDeleted: \(id\)/);
  assert.doesNotMatch(app, /assessEntityDeletion/);
  assert.doesNotMatch(app, /assessRelationDeletion/);
});

test("keeps Entity deletion blocker resolution explicit and Relation-scoped", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const workflow = readFileSync("src/hooks/useDetailDeletionWorkflow.ts", "utf8");
  const resolution = readFileSync("src/components/EntityDeletionResolutionDialog.tsx", "utf8");
  const entity = readFileSync("src/components/EntityDetailDialog.tsx", "utf8");
  const relationDisplay = readFileSync("src/related-relation-display.ts", "utf8");
  const i18n = readFileSync("src/i18n.ts", "utf8");

  assert.match(app, /<EntityDeletionResolutionDialog/);
  assert.match(app, /!detailOpen/);
  assert.match(workflow, /entityDeletionResolutionId/);
  assert.match(workflow, /function inspectBlockingRelation/);
  assert.match(workflow, /function returnToEntityDeletionResolution/);
  assert.match(workflow, /onRelationDeleted\(result\.deletedId\)/);
  assert.match(resolution, /buildRelationBlockerDisplays/);
  assert.match(resolution, /onInspectRelation/);
  assert.match(resolution, /onDeleteEntity/);
  assert.match(resolution, /keepEntityRef\.current\?\.focus\(\)/);
  assert.match(resolution, /previousRelationIds/);
  assert.match(entity, /incidents\.length > 0/);
  assert.match(entity, /onClick=\{onDelete\}/);
  assert.match(relationDisplay, /hiddenFromGraph/);
  assert.match(relationDisplay, /relationIdHint/);
  assert.match(i18n, /entityDeletionResolutionTitle:/);
  assert.match(i18n, /entityDeletionResolutionInspect:/);
});

test("keeps Entity deletion presentation safe-first and human-facing", () => {
  const resolution = readFileSync("src/components/EntityDeletionResolutionDialog.tsx", "utf8");
  const i18n = readFileSync("src/i18n.ts", "utf8");
  const styles = readFileSync("src/styles.css", "utf8");

  const header = resolution.slice(resolution.indexOf('<div className="detail-header">'), resolution.indexOf("</div>", resolution.indexOf('<div className="detail-header">')));
  assert.doesNotMatch(header, /entityDeletionResolutionKeep/);
  assert.match(resolution, /className="detail-actions entity-deletion-resolution__actions"/);
  assert.ok(resolution.indexOf('translate(locale, "entityDeletionResolutionKeep")') < resolution.indexOf('translate(locale, "entityDeleteAction")'));
  assert.doesNotMatch(i18n, /blocker/i);
  assert.match(i18n, /This Entity has connected Relations\. Remove these Relations before deleting the Entity\./);
  assert.match(i18n, /このエンティティに接続しているつながりがあります。エンティティを削除する前に、これらのつながりを削除してください。/);
  assert.match(i18n, /All Relations connected to this Entity have been removed\. You can now delete the Entity\./);
  assert.match(i18n, /このエンティティに接続しているつながりはすべて削除されました。このエンティティを削除できます。/);
  assert.match(styles, /\.entity-deletion-resolution__actions \{ gap: 12px; \}/);
  assert.match(styles, /\.entity-deletion-resolution__actions \{ align-items: stretch; flex-direction: column; gap: 8px; \}/);
  assert.match(styles, /\.entity-deletion-resolution__actions button \{ width: 100%; \}/);
});

test("renders Entity deletion blockers as labeled connected-object rows in both locales", async () => {
  const environment = createDomTestEnvironment();
  environment.installGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = environment.document.createElement("div");
  environment.document.body.append(container);
  const dataset = {
    version: "1.0",
    entities: [{ id: "entity-a", name: "A" }, { id: "entity-b", name: "B" }],
    events: [{ id: "event-1", name: "An event" }],
    relations: [
      { id: "self-relation", sourceId: "entity-a", targetId: "entity-a", name: "Self" },
      { id: "parallel-alpha", sourceId: "entity-a", targetId: "entity-b", name: "Parallel" },
      { id: "parallel-beta", sourceId: "entity-a", targetId: "entity-b", name: "Parallel" },
      { id: "event-relation", sourceId: "event-1", targetId: "entity-a", name: "Event link" },
    ],
  };

  try {
    const server = await createServer({ root: process.cwd(), server: { middlewareMode: true, hmr: false }, appType: "custom" });
    environment.addCleanup(() => server.close());
    const root = createRoot(container);
    environment.addCleanup(() => act(async () => root.unmount()));
    const { EntityDeletionResolutionDialog } = await server.ssrLoadModule("/src/components/EntityDeletionResolutionDialog.tsx");
    const render = async (locale: "en" | "ja") => {
      await act(async () => root.render(React.createElement(EntityDeletionResolutionDialog, {
        locale,
        dataset,
        entity: dataset.entities[0],
        relations: dataset.relations,
        onInspectRelation: () => {},
        onKeepEntity: () => {},
        onDeleteEntity: () => {},
        focusRequest: { relationId: null, requestId: 0 },
      })));
      return [...environment.document.querySelectorAll(".entity-deletion-resolution__relation")].map((card) => ({
        rows: [...card.querySelectorAll(".related-relation-field")].map((row) => [
          row.querySelector(".related-relation-label")?.textContent,
          row.querySelector(".related-relation-value")?.textContent,
        ]),
        text: card.textContent ?? "",
      }));
    };

    const english = await render("en");
    assert.equal(english.length, 4);
    assert.deepEqual(english[0]?.rows, [["Name", "Self"], ["Connected object", "A"], ["Connected object", "A"]]);
    assert.deepEqual(english[3]?.rows, [["Name", "Event link"], ["Connected object", "An event"], ["Connected object", "A"]]);
    assert.deepEqual(english.slice(1, 3).map(({ rows }) => rows.map(([label]) => label)), [
      ["Name", "Connected object", "Connected object"],
      ["Name", "Connected object", "Connected object"],
    ]);
    assert.ok(english.slice(1, 3).every(({ text }) => !text.includes("→")));
    assert.deepEqual(english.slice(1, 3).map(({ text }) => text.match(/parallel-[ab]/)?.[0]), ["parallel-a", "parallel-b"]);
    assert.match(environment.document.querySelector(".entity-deletion-resolution__actions")?.textContent ?? "", /Keep Entity/);
    assert.match(environment.document.querySelector('[data-relation-id="event-relation"]')?.textContent ?? "", /Inspect Relation/);

    const japanese = await render("ja");
    assert.equal(japanese.length, 4);
    assert.deepEqual(japanese[3]?.rows, [["名前", "Event link"], ["つながり先", "An event"], ["つながり先", "A"]]);
    assert.ok(japanese.every(({ rows }) => rows.every(([label]) => label === "名前" || label === "つながり先")));
    assert.ok(japanese.every(({ text }) => !text.includes("→")));
  } finally {
    await environment.cleanup();
  }
});

test("contains Entity deletion focus and restores safe workflow targets", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const workflow = readFileSync("src/hooks/useDetailDeletionWorkflow.ts", "utf8");
  const resolution = readFileSync("src/components/EntityDeletionResolutionDialog.tsx", "utf8");

  assert.match(app, /!entityDeletionResolution\) return/);
  assert.match(app, /dialogs\.at\(-1\)/);
  assert.match(app, /event\.shiftKey/);
  assert.match(app, /focusRequest=\{entityDeletionResolutionFocusRequest\}/);
  assert.match(workflow, /setEntityDeletionResolutionFocusRequest/);
  assert.match(workflow, /relationId: deleteConfirmation === "relation" \? selectedRelationId : null/);
  assert.match(resolution, /focusRequest\.requestId === 0/);
  assert.match(resolution, /relationTriggerRefs\.current\.get\(focusRequest\.relationId\)\?\.focus\(\)/);
  assert.match(resolution, /keepEntityRef\.current\?\.focus\(\)/);
});

test("focuses the safe action when Delete Confirmation opens", () => {
  const confirmation = readFileSync("src/components/ConfirmationDialog.tsx", "utf8");
  assert.match(confirmation, /useRef/);
  assert.match(confirmation, /cancelRef\.current\?\.focus\(\)/);
  assert.match(confirmation, /<button ref=\{cancelRef\} type="button"/);
  assert.match(confirmation, /Cancel/);
  assert.match(confirmation, /danger-confirm/);
});

test("autofocuses only the Entity creation Name field", () => {
  const creation = readFileSync("src/components/CreationDialog.tsx", "utf8");
  assert.match(creation, /id="creation-name" autoFocus=\{mode === "entity"\}/);
  assert.doesNotMatch(creation, /id="creation-source"[^>]*autoFocus/);
  assert.doesNotMatch(creation, /id="creation-target"[^>]*autoFocus/);
  assert.doesNotMatch(creation, /id="creation-name" autoFocus=\{true\}/);
});

const relationDetailDataset: Dataset = {
  version: "1.0",
  entities: [{ id: "source", name: "Source" }, { id: "target", name: "Target" }],
  events: [],
  relations: [{ id: "relation", sourceId: "source", targetId: "target", name: "Original", description: "Description" }],
};

test("integrates the Relation Detail Arrow and Line style controls and field hierarchy", async () => {
  await withRelationDetailProbe(relationDetailDataset, async (environment) => {
    await act(async () => { (environment.document.querySelector("#probe-open") as HTMLButtonElement).click(); });
    assert.deepEqual([...environment.document.querySelectorAll(".detail-fields > label")].map((element) => element.textContent), ["Name", "Connected object", "Arrow display", "Line style", "Connected object", "Description"]);
    assert.deepEqual([...environment.document.querySelectorAll("#relation-arrow-display option")].map((element) => [element.getAttribute("value"), element.textContent]), [["normal", "→"], ["reverse", "←"], ["undirected", "—"], ["bidirectional", "↔"]]);
    assert.equal((environment.document.querySelector(".detail-actions button") as HTMLButtonElement).disabled, true);
    assert.deepEqual([...environment.document.querySelectorAll("#relation-line-style option")].map((element) => [element.getAttribute("value"), element.textContent]), [["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]]);

    await changeProbeArrow(environment, "reverse");
    await changeProbeLineStyle(environment, "dashed");
    assert.equal((environment.document.querySelector(".detail-actions button") as HTMLButtonElement).disabled, false);
    await act(async () => { (environment.document.querySelector("#probe-locale") as HTMLButtonElement).click(); });
    const japaneseLabels = [...environment.document.querySelectorAll(".detail-fields > label")].map((element) => element.textContent);
    assert.deepEqual(japaneseLabels, ["名前", "つながり先", "矢印の表示", japaneseLabels[3], "つながり先", "説明"]);
    assert.equal((environment.document.querySelector("#relation-arrow-display") as HTMLSelectElement).value, "reverse");
    assert.equal((environment.document.querySelector("#relation-line-style") as HTMLSelectElement).value, "dashed");
  });
});

test("saves Arrow display through one atomic workflow transaction and preserves its safety semantics", async () => {
  await withRelationDetailProbe(relationDetailDataset, async (environment) => {
    await act(async () => { (environment.document.querySelector("#probe-open") as HTMLButtonElement).click(); });
    await changeProbeArrow(environment, "reverse");
    await act(async () => { (environment.document.querySelector(".detail-actions button") as HTMLButtonElement).click(); });
    let snapshot = probeSnapshot(environment);
    assert.equal(snapshot.updateCount, 1);
    assert.equal(snapshot.detailOpen, false);
    assert.equal(snapshot.dataset.relations[0]?.name, "Original");
    assert.equal((snapshot.dataset.extensions?.[presentationExtensionId] as { relations: Record<string, { arrowDisplay: string }> }).relations.relation.arrowDisplay, "reverse");

    await act(async () => { (environment.document.querySelector("#probe-open") as HTMLButtonElement).click(); });
    await changeProbeArrow(environment, "undirected");
    await act(async () => { (environment.document.querySelector("#probe-locale") as HTMLButtonElement).click(); });
    assert.equal((environment.document.querySelector("#relation-arrow-display") as HTMLSelectElement).value, "undirected");
    await act(async () => { (environment.document.querySelector(".detail-header button") as HTMLButtonElement).click(); });
    assert.ok(environment.document.querySelector("#probe-dismissal"));
    await act(async () => { (environment.document.querySelector("#probe-dismissal button") as HTMLButtonElement).click(); });
    assert.equal((environment.document.querySelector("#relation-arrow-display") as HTMLSelectElement).value, "undirected");
    await act(async () => { (environment.document.querySelector(".detail-actions button") as HTMLButtonElement).click(); });
    snapshot = probeSnapshot(environment);
    assert.equal(snapshot.updateCount, 2);
    assert.equal(snapshot.detailOpen, false);
    assert.equal((snapshot.dataset.extensions?.[presentationExtensionId] as { relations: Record<string, { arrowDisplay: string }> }).relations.relation.arrowDisplay, "undirected");
  });

  const unknownDataset: Dataset = {
    ...relationDetailDataset,
    relations: [{ ...relationDetailDataset.relations[0], name: "Unknown original" }],
    extensions: {
      [presentationExtensionId]: {
        specVersion: "0.1.0",
        relations: { relation: { arrowDisplay: "future-mode", unknownField: "keep" } },
      },
    },
  };
  await withRelationDetailProbe(unknownDataset, async (environment) => {
    await act(async () => { (environment.document.querySelector("#probe-open") as HTMLButtonElement).click(); });
    await setProbeName(environment, "probe-name-only");
    await act(async () => { (environment.document.querySelector(".detail-actions button") as HTMLButtonElement).click(); });
    let snapshot = probeSnapshot(environment);
    const record = (snapshot.dataset.extensions?.[presentationExtensionId] as { relations: Record<string, Record<string, string>> }).relations.relation;
    assert.equal(record.arrowDisplay, "future-mode");
    assert.equal(record.unknownField, "keep");

    await act(async () => { (environment.document.querySelector("#probe-open") as HTMLButtonElement).click(); });
    await changeProbeArrow(environment, "reverse");
    await changeProbeArrow(environment, "normal");
    assert.equal((environment.document.querySelector(".detail-actions button") as HTMLButtonElement).disabled, false);
    await act(async () => { (environment.document.querySelector(".detail-actions button") as HTMLButtonElement).click(); });
    snapshot = probeSnapshot(environment);
    const normalizedRecord = (snapshot.dataset.extensions?.[presentationExtensionId] as { relations: Record<string, Record<string, string>> }).relations.relation;
    assert.equal(normalizedRecord.arrowDisplay, undefined);
    assert.equal(normalizedRecord.unknownField, "keep");
  });

  const reverseDataset: Dataset = {
    ...relationDetailDataset,
    extensions: { [presentationExtensionId]: { specVersion: "0.1.0", relations: { relation: { arrowDisplay: "reverse" } } } },
  };
  await withRelationDetailProbe(reverseDataset, async (environment) => {
    await act(async () => { (environment.document.querySelector("#probe-open") as HTMLButtonElement).click(); });
    await changeProbeArrow(environment, "reverse");
    assert.equal((environment.document.querySelector(".detail-actions button") as HTMLButtonElement).disabled, true);
    await act(async () => { (environment.document.querySelector(".detail-actions button") as HTMLButtonElement).click(); });
    assert.equal(probeSnapshot(environment).updateCount, 0);
  });
});

test("saves Line style atomically, preserves sibling Presentation values, and canonicalizes Solid", async () => {
  await withRelationDetailProbe(relationDetailDataset, async (environment) => {
    await act(async () => { (environment.document.querySelector("#probe-open") as HTMLButtonElement).click(); });
    assert.equal((environment.document.querySelector("#relation-line-style") as HTMLSelectElement).value, "solid");
    assert.equal((environment.document.querySelector(".detail-actions button") as HTMLButtonElement).disabled, true);
    await changeProbeLineStyle(environment, "dashed");
    assert.equal((environment.document.querySelector(".detail-actions button") as HTMLButtonElement).disabled, false);
    await act(async () => { (environment.document.querySelector(".detail-actions button") as HTMLButtonElement).click(); });
    let snapshot = probeSnapshot(environment);
    assert.equal(snapshot.updateCount, 1);
    assert.equal((snapshot.dataset.extensions?.[presentationExtensionId] as { relations: Record<string, { lineStyle: string }> }).relations.relation.lineStyle, "dashed");

    await act(async () => { (environment.document.querySelector("#probe-open") as HTMLButtonElement).click(); });
    await changeProbeLineStyle(environment, "dotted");
    await act(async () => { (environment.document.querySelector(".detail-actions button") as HTMLButtonElement).click(); });
    snapshot = probeSnapshot(environment);
    assert.equal(snapshot.updateCount, 2);
    assert.equal((snapshot.dataset.extensions?.[presentationExtensionId] as { relations: Record<string, { lineStyle: string }> }).relations.relation.lineStyle, "dotted");

    await act(async () => { (environment.document.querySelector("#probe-open") as HTMLButtonElement).click(); });
    await changeProbeLineStyle(environment, "solid");
    await act(async () => { (environment.document.querySelector(".detail-actions button") as HTMLButtonElement).click(); });
    snapshot = probeSnapshot(environment);
    assert.equal(snapshot.updateCount, 3);
    assert.equal(snapshot.dataset.extensions, undefined);
  });

  const combinedDataset: Dataset = {
    ...relationDetailDataset,
    extensions: { [presentationExtensionId]: { specVersion: "0.1.0", relations: { relation: { arrowDisplay: "reverse", lineStyle: "dashed" } } } },
  };
  await withRelationDetailProbe(combinedDataset, async (environment) => {
    await act(async () => { (environment.document.querySelector("#probe-open") as HTMLButtonElement).click(); });
    await changeProbeLineStyle(environment, "dotted");
    await act(async () => { (environment.document.querySelector(".detail-actions button") as HTMLButtonElement).click(); });
    let snapshot = probeSnapshot(environment);
    let record = (snapshot.dataset.extensions?.[presentationExtensionId] as { relations: Record<string, Record<string, string>> }).relations.relation;
    assert.equal(record.arrowDisplay, "reverse");
    assert.equal(record.lineStyle, "dotted");

    await act(async () => { (environment.document.querySelector("#probe-open") as HTMLButtonElement).click(); });
    await changeProbeArrow(environment, "bidirectional");
    await act(async () => { (environment.document.querySelector(".detail-actions button") as HTMLButtonElement).click(); });
    snapshot = probeSnapshot(environment);
    record = (snapshot.dataset.extensions?.[presentationExtensionId] as { relations: Record<string, Record<string, string>> }).relations.relation;
    assert.equal(record.arrowDisplay, "bidirectional");
    assert.equal(record.lineStyle, "dotted");

    await act(async () => { (environment.document.querySelector("#probe-open") as HTMLButtonElement).click(); });
    await changeProbeLineStyle(environment, "solid");
    await changeProbeArrow(environment, "normal");
    await act(async () => { (environment.document.querySelector(".detail-actions button") as HTMLButtonElement).click(); });
    snapshot = probeSnapshot(environment);
    assert.equal(snapshot.dataset.extensions, undefined);
  });
});

test("preserves unknown Presentation values across unrelated and sibling Line style saves", async () => {
  const unknownLineStyleDataset: Dataset = {
    ...relationDetailDataset,
    extensions: { [presentationExtensionId]: { specVersion: "0.1.0", relations: { relation: { lineStyle: "future-pattern", unknownField: "keep" } } } },
  };
  await withRelationDetailProbe(unknownLineStyleDataset, async (environment) => {
    await act(async () => { (environment.document.querySelector("#probe-open") as HTMLButtonElement).click(); });
    assert.equal((environment.document.querySelector("#relation-line-style") as HTMLSelectElement).value, "solid");
    await setProbeName(environment, "probe-name-only");
    await act(async () => { (environment.document.querySelector(".detail-actions button") as HTMLButtonElement).click(); });
    let snapshot = probeSnapshot(environment);
    let record = (snapshot.dataset.extensions?.[presentationExtensionId] as { relations: Record<string, Record<string, string>> }).relations.relation;
    assert.equal(record.lineStyle, "future-pattern");
    assert.equal(record.unknownField, "keep");

    await act(async () => { (environment.document.querySelector("#probe-open") as HTMLButtonElement).click(); });
    await changeProbeLineStyle(environment, "dashed");
    await act(async () => { (environment.document.querySelector(".detail-actions button") as HTMLButtonElement).click(); });
    snapshot = probeSnapshot(environment);
    record = (snapshot.dataset.extensions?.[presentationExtensionId] as { relations: Record<string, Record<string, string>> }).relations.relation;
    assert.equal(record.lineStyle, "dashed");
    assert.equal(record.unknownField, "keep");

    await act(async () => { (environment.document.querySelector("#probe-open") as HTMLButtonElement).click(); });
    await changeProbeLineStyle(environment, "solid");
    await act(async () => { (environment.document.querySelector(".detail-actions button") as HTMLButtonElement).click(); });
    snapshot = probeSnapshot(environment);
    record = (snapshot.dataset.extensions?.[presentationExtensionId] as { relations: Record<string, Record<string, string>> }).relations.relation;
    assert.equal(record.lineStyle, undefined);
    assert.equal(record.unknownField, "keep");
  });

  const unknownCrossPropertyDataset: Dataset = {
    ...relationDetailDataset,
    extensions: { [presentationExtensionId]: { specVersion: "0.1.0", relations: { relation: { arrowDisplay: "future-arrow-mode", lineStyle: "dashed" } } } },
  };
  await withRelationDetailProbe(unknownCrossPropertyDataset, async (environment) => {
    await act(async () => { (environment.document.querySelector("#probe-open") as HTMLButtonElement).click(); });
    await changeProbeLineStyle(environment, "dotted");
    await act(async () => { (environment.document.querySelector(".detail-actions button") as HTMLButtonElement).click(); });
    const record = (probeSnapshot(environment).dataset.extensions?.[presentationExtensionId] as { relations: Record<string, Record<string, string>> }).relations.relation;
    assert.equal(record.arrowDisplay, "future-arrow-mode");
    assert.equal(record.lineStyle, "dotted");
  });
});

test("protects explicit Line style drafts and refuses atomic Presentation writes", async () => {
  await withRelationDetailProbe(relationDetailDataset, async (environment) => {
    await act(async () => { (environment.document.querySelector("#probe-open") as HTMLButtonElement).click(); });
    await changeProbeLineStyle(environment, "dotted");
    await act(async () => { (environment.document.querySelector(".detail-header button") as HTMLButtonElement).click(); });
    assert.ok(environment.document.querySelector("#probe-dismissal"));
    await act(async () => { (environment.document.querySelector("#probe-dismissal button") as HTMLButtonElement).click(); });
    assert.equal((environment.document.querySelector("#relation-line-style") as HTMLSelectElement).value, "dotted");
    await act(async () => { (environment.document.querySelector(".detail-header button") as HTMLButtonElement).click(); });
    await act(async () => { (environment.document.querySelectorAll("#probe-dismissal button")[1] as HTMLButtonElement).click(); });
    assert.equal(probeSnapshot(environment).updateCount, 0);
    assert.equal(probeSnapshot(environment).detailOpen, false);
  });

  const unsupportedDataset: Dataset = {
    ...relationDetailDataset,
    extensions: { [presentationExtensionId]: { specVersion: "9.9.9", relations: { relation: { lineStyle: "dashed" } } } },
  };
  await withRelationDetailProbe(unsupportedDataset, async (environment) => {
    await act(async () => { (environment.document.querySelector("#probe-open") as HTMLButtonElement).click(); });
    await setProbeName(environment, "probe-core-name");
    await changeProbeLineStyle(environment, "dotted");
    await act(async () => { (environment.document.querySelector(".detail-actions button") as HTMLButtonElement).click(); });
    const snapshot = probeSnapshot(environment);
    assert.equal(snapshot.updateCount, 0);
    assert.equal(snapshot.detailOpen, true);
    assert.equal(snapshot.dataset.relations[0]?.name, "Original");
    assert.match(snapshot.message, /Could not save the display settings because this Dataset's display settings cannot be safely updated\./);
  });
});

test("refuses unsafe Arrow display writes atomically and protects unsaved Arrow dismissal", async () => {
  const unsupportedDataset: Dataset = {
    ...relationDetailDataset,
    extensions: { [presentationExtensionId]: { specVersion: "9.9.9", relations: { relation: { arrowDisplay: "reverse" } } } },
  };
  await withRelationDetailProbe(unsupportedDataset, async (environment) => {
    await act(async () => { (environment.document.querySelector("#probe-open") as HTMLButtonElement).click(); });
    await setProbeName(environment, "probe-core-name");
    await act(async () => { (environment.document.querySelector(".detail-actions button") as HTMLButtonElement).click(); });
    let snapshot = probeSnapshot(environment);
    assert.equal(snapshot.updateCount, 1);
    assert.equal(snapshot.dataset.relations[0]?.name, "Core changed");
    assert.equal((snapshot.dataset.extensions?.[presentationExtensionId] as { specVersion: string }).specVersion, "9.9.9");

    await act(async () => { (environment.document.querySelector("#probe-open") as HTMLButtonElement).click(); });
    await setProbeName(environment, "probe-blocked-name");
    await changeProbeArrow(environment, "reverse");
    await act(async () => { (environment.document.querySelector(".detail-actions button") as HTMLButtonElement).click(); });
    snapshot = probeSnapshot(environment);
    assert.equal(snapshot.updateCount, 1);
    assert.equal(snapshot.detailOpen, true);
    assert.equal(snapshot.dataset.relations[0]?.name, "Core changed");
    assert.match(snapshot.message, /Could not save the display settings because this Dataset's display settings cannot be safely updated\./);

    await act(async () => { (environment.document.querySelector(".detail-header button") as HTMLButtonElement).click(); });
    assert.ok(environment.document.querySelector("#probe-dismissal"));
    await act(async () => { (environment.document.querySelector("#probe-dismissal button") as HTMLButtonElement).click(); });
    assert.equal((environment.document.querySelector("#relation-arrow-display") as HTMLSelectElement).value, "reverse");
    await act(async () => { (environment.document.querySelector(".detail-header button") as HTMLButtonElement).click(); });
    await act(async () => { (environment.document.querySelectorAll("#probe-dismissal button")[1] as HTMLButtonElement).click(); });
    assert.equal(probeSnapshot(environment).updateCount, 1);
  });
});

test("routes a real Relation Detail Arrow save through App updateDataset and the dirty baseline", async () => {
  const environment = createDomTestEnvironment({
    url: "https://liaisonscape.test/#locale=en&datasetUrl=https%3A%2F%2Fdata.example%2Fdataset.json&targetObjectId=relation&targetObjectType=Relation&requiredCapability=relation.inspect&targetContractVersion=1",
  });
  environment.installGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  environment.window.requestAnimationFrame = (callback: FrameRequestCallback) => { callback(0); return 0; };
  environment.window.cancelAnimationFrame = () => {};
  environment.window.scrollTo = () => {};
  environment.window.HTMLElement.prototype.scrollIntoView = () => {};
  environment.installGlobal("fetch", async () => ({ ok: true, text: async () => JSON.stringify(relationDetailDataset) }));
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

    assert.deepEqual([...environment.document.querySelectorAll(".detail-fields > label")].map((element) => element.textContent), ["Name", "Connected object", "Arrow display", "Line style", "Connected object", "Description"]);
    const arrowDisplay = environment.document.querySelector("#relation-arrow-display") as HTMLSelectElement;
    arrowDisplay.value = "reverse";
    await act(async () => { arrowDisplay.dispatchEvent(new environment.window.Event("change", { bubbles: true })); });
    const lineStyle = environment.document.querySelector("#relation-line-style") as HTMLSelectElement;
    lineStyle.value = "dashed";
    await act(async () => { lineStyle.dispatchEvent(new environment.window.Event("change", { bubbles: true })); });
    await act(async () => { (environment.document.querySelector(".detail-actions button") as HTMLButtonElement).click(); });
    assert.equal(environment.document.querySelector("#relation-detail-title"), null);
    assert.equal(environment.document.querySelectorAll('.edge-group[data-relation-id="relation"] .edge-arrowhead').length, 1);
    assert.equal(environment.document.querySelector('.edge-group[data-relation-id="relation"] .edge')?.getAttribute("class"), "edge line-style-dashed");

    await act(async () => { (environment.document.querySelector(".header-home-button") as HTMLAnchorElement).click(); });
    const newDatasetButton = [...environment.document.querySelectorAll("button")].find((button) => button.textContent === "New Dataset");
    assert.ok(newDatasetButton);
    await act(async () => { newDatasetButton?.click(); });
    assert.ok(environment.document.querySelector(".replacement-confirmation"));
  } finally {
    await environment.cleanup();
  }
});
