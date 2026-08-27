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
