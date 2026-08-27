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
  assert.match(styles, /@media \(max-width: 600px\)/);
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
  const confirmation = readFileSync("src/components/DetailDismissalConfirmation.tsx", "utf8");
  const i18n = readFileSync("src/i18n.ts", "utf8");
  assert.match(app, /function requestDetailDismissal\(\)/);
  assert.match(app, /meaningfulEntityDetailDraft/);
  assert.match(app, /meaningfulRelationDetailDraft/);
  assert.match(app, /onClose=\{requestDetailDismissal\}/);
  assert.match(app, /<DetailDismissalConfirmation/);
  assert.match(confirmation, /event\.key === "Escape"/);
  assert.match(confirmation, /cancelRef\.current\?\.focus\(\)/);
  assert.match(confirmation, /onDiscard/);
  assert.match(i18n, /detailDismissalTitle: "Discard unsaved changes\?"/);
  assert.match(i18n, /discardDetailDraft: "Discard Changes"/);
  assert.match(i18n, /detailDismissalTitle: "未保存の変更を破棄しますか？"/);
});
