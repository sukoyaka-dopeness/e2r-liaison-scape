import assert from "node:assert/strict";
import test from "node:test";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { createServer } from "vite";
import type { Dataset } from "../src/models.ts";
import { createDomTestEnvironment } from "./helpers/dom-test-environment.ts";

const initialDataset: Dataset = {
  version: "1.0",
  entities: [{ id: "entity-a", name: "A" }, { id: "entity-b", name: "B" }],
  events: [{ id: "event-1", name: "An event" }],
  relations: [
    { id: "self-relation", sourceId: "entity-a", targetId: "entity-a", name: "depends on" },
    { id: "parallel-alpha", sourceId: "entity-a", targetId: "entity-b", name: "connected" },
    { id: "event-relation", sourceId: "event-1", targetId: "entity-a", name: "caused by" },
  ],
};

function WorkflowHarness({ useWorkflow }: { useWorkflow: (options: any) => any }) {
  const [dataset, setDataset] = useState(initialDataset);
  const [selectedId, setSelectedId] = useState<string | null>("entity-a");
  const [selectedRelationId, setSelectedRelationId] = useState<string | null>(null);
  const workflow = useWorkflow({
    dataset,
    locale: "en",
    selectedId,
    selectedRelationId,
    onDatasetUpdate: setDataset,
    onMessage: () => {},
    onSelectEntity: setSelectedId,
    onSelectRelation: setSelectedRelationId,
    onEntityDeleted: () => {},
    onRelationDeleted: () => {},
  });

  const resolution = workflow.entityDeletionResolution;
  return React.createElement(React.Fragment, null,
    React.createElement("button", { "data-testid": "delete-entity", type: "button", onClick: workflow.removeSelectedEntity }, "Delete selected Entity"),
    resolution?.entity && !workflow.detailOpen ? React.createElement("section", { "data-testid": "resolution", className: "entity-deletion-resolution" },
      resolution.relations.length === 0 ? React.createElement("p", null, "All Relations connected to this Entity have been removed") : null,
      resolution.relations.map((relation) => React.createElement("article", { "data-relation-id": relation.id, key: relation.id },
        React.createElement("button", { type: "button", onClick: () => workflow.inspectBlockingRelation(relation.id) }, "Inspect Relation"),
      )),
      React.createElement("button", { type: "button", onClick: workflow.cancelEntityDeletionResolution }, "Keep Entity"),
      resolution.relations.length === 0 ? React.createElement("button", { type: "button", className: "danger-action", onClick: workflow.removeSelectedEntity }, "Delete Entity") : null,
    ) : null,
    workflow.detailOpen && workflow.selectedRelationDetail ? React.createElement("button", { "data-testid": "delete-relation", type: "button", onClick: workflow.removeSelectedRelation }, "Delete inspected Relation") : null,
    workflow.deleteConfirmation ? React.createElement("div", { className: `confirmation-${workflow.deleteConfirmation}` },
      React.createElement("button", { type: "button", className: "cancel", onClick: workflow.cancelDeletion }, "Cancel"),
      React.createElement("button", { type: "button", className: "danger-confirm", onClick: workflow.confirmDeletion }, "Delete"),
    ) : null,
    React.createElement("output", { "data-testid": "entity-count" }, dataset.entities.length),
    React.createElement("output", { "data-testid": "relation-count" }, dataset.relations.length),
    React.createElement("output", { "data-testid": "resolution-focus-request" }, JSON.stringify(workflow.entityDeletionResolutionFocusRequest)),
  );
}

function button(container: HTMLElement, selector: string): HTMLButtonElement {
  const element = container.querySelector(selector);
  assert.equal(element?.tagName, "BUTTON", `expected button ${selector}`);
  return element as HTMLButtonElement;
}

test("resolves each incident Relation before explicit Entity deletion", async () => {
  const environment = createDomTestEnvironment();
  environment.installGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = environment.document.createElement("div");
  environment.document.body.append(container);
  const root = createRoot(container);
  environment.addCleanup(() => act(async () => root.unmount()));

  try {
    const server = await createServer({ root: process.cwd(), server: { middlewareMode: true, hmr: false }, appType: "custom" });
    environment.addCleanup(() => server.close());
    const { useDetailDeletionWorkflow } = await server.ssrLoadModule("/src/hooks/useDetailDeletionWorkflow.ts");
    await act(async () => root.render(React.createElement(WorkflowHarness, { useWorkflow: useDetailDeletionWorkflow })));
    await act(async () => button(container, '[data-testid="delete-entity"]').click());

    assert.equal(container.querySelectorAll("[data-relation-id]").length, 3);
    assert.equal(container.querySelector('[data-testid="resolution"]') !== null, true);

    const inspect = (relationId: string) => button(container, `[data-relation-id="${relationId}"] button`).click();
    const deleteInspected = async (relationId: string) => {
      await act(async () => inspect(relationId));
      await act(async () => button(container, '[data-testid="delete-relation"]').click());
      assert.ok(container.querySelector(".confirmation-relation"));
      await act(async () => button(container, ".confirmation-relation .danger-confirm").click());
      assert.equal(container.querySelector(`[data-relation-id="${relationId}"]`), null);
    };

    await act(async () => inspect("self-relation"));
    await act(async () => button(container, '[data-testid="delete-relation"]').click());
    assert.ok(container.querySelector(".confirmation-relation"));
    await act(async () => button(container, ".confirmation-relation .cancel").click());
    assert.equal(container.querySelector('[data-relation-id="self-relation"]') !== null, true);
    assert.deepEqual(JSON.parse(container.querySelector('[data-testid="resolution-focus-request"]')?.textContent ?? "{}"), { relationId: "self-relation", requestId: 1 });

    await deleteInspected("self-relation");
    assert.equal(container.querySelectorAll("[data-relation-id]").length, 2);
    await deleteInspected("parallel-alpha");
    await deleteInspected("event-relation");

    assert.equal(container.querySelectorAll("[data-relation-id]").length, 0);
    assert.match(container.textContent ?? "", /All Relations connected to this Entity have been removed/);
    assert.equal(container.querySelector('[data-testid="entity-count"]')?.textContent, "2");

    await act(async () => button(container, ".entity-deletion-resolution .danger-action").click());
    assert.ok(container.querySelector(".confirmation-entity"));
    await act(async () => button(container, ".confirmation-entity .cancel").click());
    assert.equal(container.querySelector('[data-testid="entity-count"]')?.textContent, "2");
    assert.deepEqual(JSON.parse(container.querySelector('[data-testid="resolution-focus-request"]')?.textContent ?? "{}"), { relationId: null, requestId: 2 });
    await act(async () => button(container, ".entity-deletion-resolution .danger-action").click());
    await act(async () => button(container, ".confirmation-entity .danger-confirm").click());
    assert.equal(container.querySelector('[data-testid="entity-count"]')?.textContent, "1");
    assert.equal(container.querySelector('[data-testid="relation-count"]')?.textContent, "0");
  } finally {
    await environment.cleanup();
  }
});
