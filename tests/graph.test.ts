import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { COORDINATE_DRAFT_EXTENSION_ID, COORDINATE_EXTENSION_ID, applyStoredCoordinates, buildEntityGraph, getEntityDetail, getRelationDetail, getStoredCoordinates, loadDataset, serializeDataset, updateEntityDetails, updateRelationDetails, validateDatasetForExport, type Dataset, type GraphEdge } from "../src/dataset.ts";
import { boundedDragContinuationOffset, bringToFront, centeredViewportTransform, clampScale, compareRouteGeometry, curveOffsetFromControlPoint, fitGraphView, getArrowheadGeometry, getEntityAttachment, graphEdgePath, nearestPolylineArcFraction, placeEdgeLabel, placeNodeLabel, pinchZoomScale, pointAtDistanceFromRouteEnd, pointAtPolylineArcFraction, routeGraphEdge, routeSamplesHaveNodeInfluence, shouldShowNodeLabelConnector, solveVisibleRouteOffset, truncateNodeText, wrapNodeLabel, zoomScale } from "../src/viewport.ts";
import { interpolateLabelRect, isLabelTransitionPathSafe, reconcileRelationLabelVisualState } from "../src/relation-label-presentation.ts";
import { deriveManualNodeLabelOffset, deriveManualRelationLabelAnchor, reconstructManualNodeLabelPosition, reconstructManualRelationLabelTarget } from "../src/relation-label-presentation.ts";
import { boundedHoverDescription, composeHoverLines, placementOwnership } from "../src/placement-ownership.ts";
import { buildRelatedRelationDisplay } from "../src/related-relation-display.ts";
import { buildEntityEndpointLabels } from "../src/entity-endpoint-display.ts";

const roundedEntityShape = { kind: "rounded-rectangle" as const, halfWidth: 32, halfHeight: 32, cornerRadius: 12 };
function assertClose(actual: number, expected: number, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not close to ${expected}`);
}

function routeWithCanonicalPriority(
  edges: GraphEdge[],
  positions: Record<string, { x: number; y: number }>,
  manualOffsets: Record<string, number | undefined> = {},
) {
  const occupiedPaths: Array<Array<{ x: number; y: number }>> = [];
  const routes = new Map<string, ReturnType<typeof routeGraphEdge>>();
  const compare = (left: GraphEdge, right: GraphEdge) => left.sourceId.localeCompare(right.sourceId)
    || left.targetId.localeCompare(right.targetId)
    || left.id.localeCompare(right.id);
  const fixed = edges.filter((edge) => manualOffsets[edge.id] !== undefined
    || edge.sourceId === edge.targetId
    || (positions[edge.sourceId]!.x === positions[edge.targetId]!.x && positions[edge.sourceId]!.y === positions[edge.targetId]!.y))
    .sort(compare);
  const automaticOrdinary = edges.filter((edge) => !fixed.some(({ id }) => id === edge.id)).sort(compare);
  for (const edge of [...fixed, ...automaticOrdinary]) {
    const source = positions[edge.sourceId]!;
    const target = positions[edge.targetId]!;
    const obstacles = Object.entries(positions)
      .filter(([id]) => id !== edge.sourceId && id !== edge.targetId)
      .map(([, position]) => position);
    const route = routeGraphEdge(source, target, edge.parallelIndex, edge.parallelCount, obstacles, occupiedPaths,
      edge.sourceId === edge.targetId, 0, manualOffsets[edge.id]);
    occupiedPaths.push(route.samples);
    routes.set(edge.id, route);
  }
  return { returnedOrder: edges.map(({ id }) => id), routes };
}

test("rounded rectangle attachment handles cardinal directions", () => {
  const cases = [
    [{ x: 1, y: 0 }, { x: 32, y: 0 }],
    [{ x: -1, y: 0 }, { x: -32, y: 0 }],
    [{ x: 0, y: -1 }, { x: 0, y: -32 }],
    [{ x: 0, y: 1 }, { x: 0, y: 32 }],
  ] as const;
  for (const [direction, point] of cases) {
    const attachment = getEntityAttachment({ center: { x: 0, y: 0 }, direction, shape: roundedEntityShape });
    assertClose(attachment.point.x, point.x);
    assertClose(attachment.point.y, point.y);
    assertClose(Math.hypot(attachment.outwardNormal.x, attachment.outwardNormal.y), 1);
    assertClose(attachment.distance, 32);
  }
});

test("rounded rectangle attachment follows the corner arc for diagonals", () => {
  const attachment = getEntityAttachment({ center: { x: 0, y: 0 }, direction: { x: 1, y: 1 }, shape: roundedEntityShape });
  assertClose(attachment.point.x, 28.48528137423857);
  assertClose(attachment.point.y, 28.48528137423857);
  assertClose(attachment.outwardNormal.x, Math.SQRT1_2);
  assertClose(attachment.outwardNormal.y, Math.SQRT1_2);
});

test("rounded rectangle attachment supports asymmetric shapes and non-normalized directions", () => {
  const attachment = getEntityAttachment({
    center: { x: 10, y: 20 },
    direction: { x: 0, y: 5 },
    shape: { kind: "rounded-rectangle", halfWidth: 40, halfHeight: 20, cornerRadius: 8 },
  });
  assert.deepEqual(attachment.point, { x: 10, y: 40 });
  assert.deepEqual(attachment.outwardNormal, { x: 0, y: 1 });
  assert.equal(attachment.distance, 20);
});

test("rounded rectangle attachment supports zero and maximum corner radius", () => {
  const square = getEntityAttachment({ center: { x: 0, y: 0 }, direction: { x: 1, y: 1 }, shape: { kind: "rounded-rectangle", halfWidth: 10, halfHeight: 10, cornerRadius: 0 } });
  assertClose(square.distance, Math.sqrt(200));
  const pillCorner = getEntityAttachment({ center: { x: 0, y: 0 }, direction: { x: 1, y: 0 }, shape: { kind: "rounded-rectangle", halfWidth: 10, halfHeight: 10, cornerRadius: 10 } });
  assertClose(pillCorner.distance, 10);
});

test("rounded rectangle attachment rejects degenerate or invalid inputs", () => {
  assert.throws(() => getEntityAttachment({ center: { x: 0, y: 0 }, direction: { x: 0, y: 0 }, shape: roundedEntityShape }), RangeError);
  assert.throws(() => getEntityAttachment({ center: { x: 0, y: 0 }, direction: { x: 1, y: 0 }, shape: { kind: "rounded-rectangle", halfWidth: 0, halfHeight: 32, cornerRadius: 12 } }), RangeError);
  assert.throws(() => getEntityAttachment({ center: { x: 0, y: 0 }, direction: { x: 1, y: 0 }, shape: { kind: "rounded-rectangle", halfWidth: 32, halfHeight: 32, cornerRadius: 33 } }), RangeError);
});

test("shape-agnostic attachment dispatches the rounded rectangle primitive", () => {
  const attachment = getEntityAttachment({ center: { x: 5, y: 7 }, direction: { x: -1, y: 0 }, shape: roundedEntityShape });
  assert.deepEqual(attachment.point, { x: -27, y: 7 });
});

test("route-end distance helper interpolates and clamps safely", () => {
  assert.deepEqual(pointAtDistanceFromRouteEnd([{ x: 0, y: 0 }, { x: 10, y: 0 }], 4), { x: 6, y: 0 });
  assert.deepEqual(pointAtDistanceFromRouteEnd([{ x: 0, y: 0 }, { x: 10, y: 0 }], 20), { x: 0, y: 0 });
  assert.deepEqual(pointAtDistanceFromRouteEnd([], 4), { x: 0, y: 0 });
});

test("explicit arrowhead preserves marker proportions and follows visible route approach", () => {
  const straight = getArrowheadGeometry([{ x: 0, y: 0 }, { x: 100, y: 0 }], 2);
  assert.deepEqual(straight.tip, { x: 100, y: 0 });
  assert.deepEqual(straight.baseA, { x: 84, y: 6 });
  assert.deepEqual(straight.baseB, { x: 84, y: -6 });
  const selected = getArrowheadGeometry([{ x: 0, y: 0 }, { x: 100, y: 0 }], 2.75);
  assert.equal(Math.hypot(selected.baseA.x - selected.baseB.x, selected.baseA.y - selected.baseB.y), 16.5);
  const curved = getArrowheadGeometry(routeGraphEdge({ x: 0, y: 0 }, { x: 100, y: 0 }, 1, 2).samples, 2);
  assert.ok(Number.isFinite(curved.baseA.x) && Number.isFinite(curved.baseB.y));
});

test("A2: builds Entity nodes and Relation edges without making Relations nodes", () => {
  const dataset: Dataset = {
    version: "1.0",
    entities: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
    events: [],
    relations: [{ id: "r", sourceId: "a", targetId: "b" }],
  };
  const graph = buildEntityGraph(dataset);
  assert.deepEqual(graph.nodes.map(({ id }) => id), ["a", "b"]);
  assert.deepEqual(graph.edges, [{ id: "r", sourceId: "a", targetId: "b", parallelIndex: 0, parallelCount: 1 }]);
  assert.equal(graph.unsupportedEdges, 0);
  assert.equal(graph.nodes.some(({ id }) => id === "r"), false);
});

test("A3/A8: omits Event endpoint edges from Entity graph and preserves direction", () => {
  const dataset: Dataset = {
    version: "1.0",
    entities: [{ id: "entity", name: "Entity" }],
    events: [{ id: "event", name: "Event" }],
    relations: [
      { id: "event-edge", sourceId: "event", targetId: "entity" },
      { id: "entity-edge", sourceId: "entity", targetId: "entity" },
    ],
  };
  const graph = buildEntityGraph(dataset);
  assert.deepEqual(graph.edges, [{ id: "entity-edge", sourceId: "entity", targetId: "entity", parallelIndex: 0, parallelCount: 1 }]);
  assert.equal(graph.edges[0]?.sourceId, "entity");
  assert.equal(graph.edges[0]?.targetId, "entity");
  assert.equal(graph.unsupportedEdges, 1);
  assert.equal(graph.eventRelatedHiddenEdges, 1);
  assert.equal(graph.otherUnsupportedEdges, 0);
});

test("counts only resolvable Event-related Relations in the hidden notice", () => {
  const dataset: Dataset = {
    version: "1.0",
    entities: [{ id: "entity" }],
    events: [{ id: "event" }],
    relations: [
      { id: "entity-event", sourceId: "entity", targetId: "event" },
      { id: "event-entity", sourceId: "event", targetId: "entity" },
      { id: "event-event", sourceId: "event", targetId: "event" },
      { id: "missing-source", sourceId: "missing", targetId: "entity" },
      { id: "event-missing", sourceId: "event", targetId: "missing" },
    ],
  };
  const graph = buildEntityGraph(dataset);
  assert.equal(graph.eventRelatedHiddenEdges, 3);
  assert.equal(graph.otherUnsupportedEdges, 2);
  assert.equal(graph.unsupportedEdges, 5);
});

test("A9: retains self-relations and distinguishes multiple edges", () => {
  const dataset: Dataset = { version: "1.0", entities: [{ id: "a" }, { id: "b" }], events: [], relations: [
    { id: "self", sourceId: "a", targetId: "a" },
    { id: "one", sourceId: "a", targetId: "b" },
    { id: "two", sourceId: "a", targetId: "b" },
  ] };
  const graph = buildEntityGraph(dataset);
  assert.equal(graph.edges.find((edge) => edge.id === "self")?.parallelCount, 1);
  assert.deepEqual(graph.edges.filter((edge) => edge.sourceId === "a" && edge.targetId === "b").map((edge) => edge.parallelIndex), [0, 1]);
  assert.equal(graph.edges.find((edge) => edge.id === "one")?.parallelCount, 2);
});

test("A7: Entity Detail resolves the selected Entity and its Relations", () => {
  const dataset: Dataset = {
    version: "1.0",
    entities: [{ id: "entity-1", name: "Apollo 11", description: "Mission" }],
    events: [],
    relations: [{ id: "relation-1", sourceId: "entity-1", targetId: "entity-1" }],
  };
  const detail = getEntityDetail(dataset, "entity-1");
  assert.equal(detail?.entity.name, "Apollo 11");
  assert.deepEqual(detail?.relationIds, ["relation-1"]);
  assert.deepEqual(detail?.visibleRelationIds, ["relation-1"]);
  assert.equal(getEntityDetail(dataset, "missing"), null);
});

test("Entity Detail distinguishes shown Entity Relations from Event Relations", () => {
  const dataset: Dataset = {
    version: "1.0",
    entities: [{ id: "entity-1" }, { id: "entity-2" }],
    events: [{ id: "event-1" }],
    relations: [
      { id: "shown", sourceId: "entity-1", targetId: "entity-2" },
      { id: "hidden", sourceId: "event-1", targetId: "entity-1" },
      { id: "self", sourceId: "entity-1", targetId: "entity-1" },
    ],
  };

  const detail = getEntityDetail(dataset, "entity-1");
  assert.deepEqual(detail?.relationIds, ["shown", "hidden", "self"]);
  assert.deepEqual(detail?.visibleRelationIds, ["shown", "self"]);
});

test("Related Relation display uses trimmed names and structured endpoint labels", () => {
  const dataset: Dataset = { version: "1.0", entities: [{ id: "entity-a", name: " Alice " }, { id: "entity-b", name: "Bob" }], events: [{ id: "event-a", name: " Launch " }], relations: [] };
  assert.deepEqual(buildRelatedRelationDisplay(dataset, { id: "relation", name: " Friends ", sourceId: "entity-a", targetId: "event-a" }), { relationId: "relation", relationName: "Friends", source: "Alice", target: "Launch" });
});

test("Related Relation display falls back to IDs and disambiguates duplicate names", () => {
  const dataset: Dataset = { version: "1.0", entities: [{ id: "12345678-a", name: "Alex" }, { id: "12345678-b", name: " Alex " }], events: [{ id: "event-missing-name", name: "   " }], relations: [] };
  assert.deepEqual(buildRelatedRelationDisplay(dataset, { id: "relation", name: "   ", sourceId: "12345678-a", targetId: "event-missing-name" }), { relationId: "relation", relationName: null, source: "Alex (12345678-a)", target: "event-missing-name" });
});

test("Entity endpoint labels keep unique names quiet and disambiguate duplicate names", () => {
  const labels = buildEntityEndpointLabels([
    { id: "alice", name: " Alice " },
    { id: "alex-entity-001", name: "Alex" },
    { id: "alex-entity-002", name: " Alex " },
    { id: "9f232f22-abcd", name: "Yoshi" },
    { id: "1a919cf4-efgh", name: "Yoshi" },
    { id: "abcdefgh-aaaa", name: "Dana" },
    { id: "ijklmnop-bbbb", name: "Dana" },
    { id: "short-a", name: "Short" },
    { id: "short-b", name: "Short" },
    { id: "abcdefgh-111111111111", name: "Chris" },
    { id: "abcdefgh-222222222222", name: "Chris" },
    { id: "abcdefgh-333333333333", name: "Chris" },
    { id: "blank", name: "" },
    { id: "space", name: "   " },
  ]);
  assert.deepEqual(Object.fromEntries(labels), {
    alice: "Alice",
    "alex-entity-001": "Alex (alex-entity-001)",
    "alex-entity-002": "Alex (alex-entity-002)",
    "9f232f22-abcd": "Yoshi (9f232f22)",
    "1a919cf4-efgh": "Yoshi (1a919cf4)",
    "abcdefgh-aaaa": "Dana (abcdefgh)",
    "ijklmnop-bbbb": "Dana (ijklmnop)",
    "short-a": "Short (short-a)",
    "short-b": "Short (short-b)",
    "abcdefgh-111111111111": "Chris (abcdefgh-1)",
    "abcdefgh-222222222222": "Chris (abcdefgh-2)",
    "abcdefgh-333333333333": "Chris (abcdefgh-3)",
    blank: "blank",
    space: "space",
  });
});

test("Entity Detail editing preserves unknown fields and Extensions", () => {
  const dataset: Dataset = {
    version: "1.0",
    entities: [{ id: "entity", name: "Old", extra: 1, extensions: { unknown: { value: true } } }],
    events: [],
    relations: [],
  };
  const updated = updateEntityDetails(dataset, "entity", { name: "New", description: "Details" });
  assert.deepEqual(updated.entities[0], {
    id: "entity",
    name: "New",
    description: "Details",
    extra: 1,
    extensions: { unknown: { value: true } },
  });
  assert.equal(dataset.entities[0]?.name, "Old");
  const cleared = updateEntityDetails(updated, "entity", { name: "", description: "" });
  assert.equal("name" in cleared.entities[0]!, false);
  assert.equal("description" in cleared.entities[0]!, false);
});

test("Relation Detail resolves its source and target objects", () => {
  const dataset: Dataset = {
    version: "1.0",
    entities: [{ id: "source", name: "Source" }, { id: "target", name: "Target" }],
    events: [],
    relations: [{ id: "relation", sourceId: "source", targetId: "target", name: "Connects" }],
  };
  const detail = getRelationDetail(dataset, "relation");
  assert.equal(detail?.source?.name, "Source");
  assert.equal(detail?.target?.name, "Target");
  assert.equal(detail?.relation.name, "Connects");
  assert.equal(getRelationDetail(dataset, "missing"), null);
});

test("Relation Detail editing preserves endpoints, unknown fields, and Extensions", () => {
  const dataset: Dataset = {
    version: "1.0",
    entities: [{ id: "source" }, { id: "target" }],
    events: [],
    relations: [{ id: "relation", sourceId: "source", targetId: "target", name: "Old", extra: 1, extensions: { unknown: { value: true } } }],
  };
  const updated = updateRelationDetails(dataset, "relation", { name: "New", description: "Details" });
  assert.deepEqual(updated.relations[0], {
    id: "relation",
    sourceId: "source",
    targetId: "target",
    name: "New",
    description: "Details",
    extra: 1,
    extensions: { unknown: { value: true } },
  });
  assert.equal(dataset.relations[0]?.name, "Old");
  const cleared = updateRelationDetails(updated, "relation", { name: "", description: "" });
  assert.equal("name" in cleared.relations[0]!, false);
  assert.equal("description" in cleared.relations[0]!, false);
});

test("A11/A13: restores prototype coordinates through a Dataset-defined Space without mutating input", () => {
  const dataset: Dataset = {
    version: "1.0",
    entities: [{ id: "entity-1", extensions: { [COORDINATE_EXTENSION_ID]: { coordinates: [
      { spaceId: "other-space", values: { x: 1, y: 2, future: 3 } },
      { spaceId: "linkscape-graph", values: { x: 12, y: 24 } },
    ] } } }],
    events: [], relations: [],
    extensions: { [COORDINATE_EXTENSION_ID]: { formatVersion: "0.1.0", spaces: [{
      id: "linkscape-graph",
      kind: "cartesian-2d",
      components: {
        x: { unit: "linkscape-user-unit", positiveDirection: "display-right" },
        y: { unit: "linkscape-user-unit", positiveDirection: "display-down" },
      },
    }] } },
  };
  assert.deepEqual(getStoredCoordinates(dataset), { "entity-1": { x: 12, y: 24 } });
  assert.equal(JSON.stringify(dataset).includes("future"), true);
});

test("prototype coordinates require the supported Space while legacy positions remain readable", () => {
  const unsupported: Dataset = {
    version: "1.0",
    entities: [{ id: "entity-1", extensions: { [COORDINATE_EXTENSION_ID]: { coordinates: [
      { spaceId: "linkscape-graph", values: { x: 12, y: 24 } },
    ] } } }],
    events: [], relations: [],
  };
  assert.deepEqual(getStoredCoordinates(unsupported), {});

  const legacy: Dataset = {
    version: "1.0",
    entities: [{ id: "entity-1", extensions: { coordinate: { positions: [
      { spaceId: "other", x: 1, y: 2 },
      { spaceId: "linkscape", x: 12, y: 24 },
    ] } } }],
    events: [], relations: [],
  };
  assert.deepEqual(getStoredCoordinates(legacy), { "entity-1": { x: 12, y: 24 } });
});

test("the neutral cross-application fixture opens and supplies its prototype Entity positions", async () => {
  const source = await readFile(
    new URL("../../e2r-spec/examples/cross-application-demo.json", import.meta.url),
    "utf8",
  );
  const loaded = loadDataset(source);
  assert.ok(loaded.dataset);
  assert.deepEqual(getStoredCoordinates(loaded.dataset!), {
    "entity-lighthouse": { x: 80, y: 156 },
    "entity-restoration-team": { x: 335, y: 156 },
    "entity-community": { x: 592, y: 156 },
    "entity-beacon-system": { x: 730, y: 156 },
  });
  assert.deepEqual(loaded.diagnostics, []);
});

test("A12: missing coordinates receive a temporary deterministic display position", () => {
  const dataset: Dataset = { version: "1.0", entities: [{ id: "entity-1" }], events: [], relations: [] };
  const graph = buildEntityGraph(dataset);
  assert.deepEqual(graph.nodes[0] && { x: graph.nodes[0].x, y: graph.nodes[0].y }, { x: 150, y: 130 });
  assert.equal(dataset.entities[0]?.extensions, undefined);
});

test("A14: legacy-only coordinate input fails closed without implicit adoption", () => {
  const dataset: Dataset = {
    version: "1.0",
    entities: [{ id: "entity-1", extensions: {
      coordinate: { positions: [{ spaceId: "other", x: 1, y: 2 }, { spaceId: "linkscape", x: 3, y: 4 }], future: true },
      [COORDINATE_EXTENSION_ID]: { coordinates: [{ spaceId: "other-space", values: { east: 5 } }], future: "keep" },
    } }],
    events: [{ id: "event-1", extensions: { [COORDINATE_EXTENSION_ID]: { coordinates: [{ spaceId: "linkscape-graph", values: { y: 320 } }] } } }],
    relations: [],
    extensions: {
      metadata: { title: "Example" },
      [COORDINATE_EXTENSION_ID]: {
        formatVersion: "0.1.0",
        spaces: [{ id: "other-space", components: { east: { unit: "metre" } } }],
      },
    },
  };
  const saved = applyStoredCoordinates(dataset, { "entity-1": { x: 80, y: 90 } });
  assert.deepEqual((dataset.entities[0]?.extensions as Record<string, unknown>).coordinate, {
    positions: [{ spaceId: "other", x: 1, y: 2 }, { spaceId: "linkscape", x: 3, y: 4 }],
    future: true,
  });
  assert.deepEqual(saved, dataset);
});

test("coordinate save extends an existing complete Specification declaration and refuses conflicts", () => {
  const specificationId = "draft.github.sukoyaka-dopeness.specification";
  const dataset: Dataset = {
    version: "1.0",
    entities: [{ id: "entity-1" }], events: [], relations: [],
    extensions: {
      metadata: { title: "Example" },
      [specificationId]: { specVersion: "0.1.0", uses: [{ extension: "metadata", version: "1.0.0" }] },
    },
  };
  const saved = applyStoredCoordinates(dataset, { "entity-1": { x: 10, y: 20 } });
  const uses = ((saved.extensions as Record<string, unknown>)[specificationId] as Record<string, unknown>).uses;
  assert.deepEqual(uses, [
    { extension: "metadata", version: "1.0.0" },
    { extension: COORDINATE_EXTENSION_ID, version: "0.1.0" },
  ]);

  const conflict = structuredClone(dataset);
  (conflict.extensions as Record<string, unknown>)[specificationId] = {
    specVersion: "0.1.0",
    uses: [
      { extension: "metadata", version: "1.0.0" },
      { extension: COORDINATE_EXTENSION_ID, version: "9.0.0" },
    ],
  };
  const conflictSaved = applyStoredCoordinates(conflict, { "entity-1": { x: 10, y: 20 } });
  assert.equal(conflictSaved, conflict);
  assert.equal((conflictSaved.extensions as Record<string, unknown>)[COORDINATE_EXTENSION_ID], undefined);
});

test("coordinate save does not overwrite an unsupported prototype version", () => {
  const dataset: Dataset = {
    version: "1.0",
    entities: [{ id: "entity-1" }], events: [], relations: [],
    extensions: { [COORDINATE_EXTENSION_ID]: { formatVersion: "9.0.0", future: true } },
  };
  const saved = applyStoredCoordinates(dataset, { "entity-1": { x: 10, y: 20 } });
  assert.equal(saved, dataset);
  assert.deepEqual((saved.extensions as Record<string, unknown>)[COORDINATE_EXTENSION_ID], {
    formatVersion: "9.0.0",
    future: true,
  });
});

test("supported Coordinate Draft data survives open and serialization without becoming Prototype data", async () => {
  const source = await readFile(
    new URL("../../e2r-spec/examples/coordinate-draft/basic.json", import.meta.url),
    "utf8",
  );
  const expected = JSON.parse(source);
  const loaded = loadDataset(source);

  assert.ok(loaded.dataset);
  assert.deepEqual(JSON.parse(serializeDataset(loaded.dataset!)), expected);
  assert.equal(
    (loaded.dataset!.extensions as Record<string, unknown>)[COORDINATE_EXTENSION_ID],
    undefined,
  );
});

test("coordinate save refuses to create Prototype data beside a supported Coordinate Draft", async () => {
  const source = await readFile(
    new URL("../../e2r-spec/examples/coordinate-draft/with-specification-declaration.json", import.meta.url),
    "utf8",
  );
  const loaded = loadDataset(source);
  assert.ok(loaded.dataset);

  const saved = applyStoredCoordinates(loaded.dataset!, { "entity-a": { x: 10, y: 20 } });
  assert.equal(saved, loaded.dataset);
  assert.deepEqual(JSON.parse(serializeDataset(saved)), JSON.parse(source));
  assert.equal(
    (saved.extensions as Record<string, unknown>)[COORDINATE_EXTENSION_ID],
    undefined,
  );
});

test("unsupported Coordinate Draft data remains opaque and blocks Prototype coordinate saving", () => {
  const dataset: Dataset = {
    version: "1.0",
    entities: [{
      id: "entity-1",
      extensions: {
        [COORDINATE_DRAFT_EXTENSION_ID]: {
          coordinates: [{
            spaceId: "future-space",
            values: { alpha: 12 },
            futureCoordinateField: { keep: true },
          }],
        },
      },
    }],
    events: [],
    relations: [],
    extensions: {
      [COORDINATE_DRAFT_EXTENSION_ID]: {
        specVersion: "9.0.0",
        spaces: [{
          id: "future-space",
          components: { alpha: { futureComponentField: [1, 2, 3] } },
          futureSpaceField: "keep",
        }],
        futureDatasetField: { keep: true },
      },
    },
  };
  const original = structuredClone(dataset);
  const loaded = loadDataset(JSON.stringify(dataset));

  assert.ok(loaded.dataset);
  assert.deepEqual(loaded.dataset, original);
  assert.equal(
    applyStoredCoordinates(loaded.dataset!, { "entity-1": { x: 10, y: 20 } }),
    loaded.dataset,
  );
  assert.deepEqual(JSON.parse(serializeDataset(loaded.dataset!)), original);
  assert.ok(validateDatasetForExport(loaded.dataset!).every(({ severity }) => severity === "warning"));
});

test("Core Detail editing leaves Coordinate Draft payloads byte-for-byte equivalent as JSON data", () => {
  const dataset: Dataset = {
    version: "1.0",
    entities: [{
      id: "entity-1",
      name: "Before",
      extensions: {
        [COORDINATE_DRAFT_EXTENSION_ID]: {
          coordinates: [{ spaceId: "diagram", values: { x: 1 }, future: ["keep"] }],
        },
      },
    }],
    events: [],
    relations: [],
    extensions: {
      [COORDINATE_DRAFT_EXTENSION_ID]: {
        specVersion: "0.1.0",
        spaces: [{ id: "diagram", components: { x: {} }, future: { keep: true } }],
      },
    },
  };
  const expectedDatasetDraft = structuredClone(
    (dataset.extensions as Record<string, unknown>)[COORDINATE_DRAFT_EXTENSION_ID],
  );
  const expectedEntityDraft = structuredClone(
    (dataset.entities[0]!.extensions as Record<string, unknown>)[COORDINATE_DRAFT_EXTENSION_ID],
  );

  const updated = updateEntityDetails(dataset, "entity-1", {
    name: "After",
    description: "Core edit",
  });

  assert.deepEqual(
    (updated.extensions as Record<string, unknown>)[COORDINATE_DRAFT_EXTENSION_ID],
    expectedDatasetDraft,
  );
  assert.deepEqual(
    (updated.entities[0]!.extensions as Record<string, unknown>)[COORDINATE_DRAFT_EXTENSION_ID],
    expectedEntityDraft,
  );
});

test("a Coordinate Draft occurrence on any Core object blocks Prototype coordinate saving", () => {
  for (const collection of ["entities", "events", "relations"] as const) {
    const dataset: Dataset = {
      version: "1.0",
      entities: [{ id: "entity-1" }],
      events: [],
      relations: [],
    };
    if (collection === "entities") {
      dataset.entities[0]!.extensions = { [COORDINATE_DRAFT_EXTENSION_ID]: { future: true } };
    } else if (collection === "events") {
      dataset.events = [{
        id: "event-1",
        extensions: { [COORDINATE_DRAFT_EXTENSION_ID]: { future: true } },
      }];
    } else {
      dataset.relations = [{
        id: "relation-1",
        sourceId: "entity-1",
        targetId: "entity-1",
        extensions: { [COORDINATE_DRAFT_EXTENSION_ID]: { future: true } },
      }];
    }

    assert.equal(
      applyStoredCoordinates(dataset, { "entity-1": { x: 10, y: 20 } }),
      dataset,
      collection,
    );
  }
});

test("coordinate save refuses incompatible or duplicate claims for Linkscape's Space", () => {
  const incompatibleSpace: Dataset = {
    version: "1.0",
    entities: [{ id: "entity-1" }], events: [], relations: [],
    extensions: { [COORDINATE_EXTENSION_ID]: {
      formatVersion: "0.1.0",
      spaces: [{
        id: "linkscape-graph",
        kind: "geographic-2d",
        components: {
          x: { unit: "degree", positiveDirection: "east" },
          y: { unit: "degree", positiveDirection: "north" },
        },
      }],
    } },
  };
  assert.equal(
    applyStoredCoordinates(incompatibleSpace, { "entity-1": { x: 10, y: 20 } }),
    incompatibleSpace,
  );

  const duplicateCoordinate: Dataset = {
    version: "1.0",
    entities: [{ id: "entity-1", extensions: { [COORDINATE_EXTENSION_ID]: {
      coordinates: [
        { spaceId: "linkscape-graph", values: { x: 1, y: 2 } },
        { spaceId: "linkscape-graph", values: { x: 3, y: 4 } },
      ],
    } } }],
    events: [], relations: [],
    extensions: { [COORDINATE_EXTENSION_ID]: {
      formatVersion: "0.1.0",
      spaces: [{
        id: "linkscape-graph",
        kind: "cartesian-2d",
        components: {
          x: { unit: "linkscape-user-unit", positiveDirection: "display-right" },
          y: { unit: "linkscape-user-unit", positiveDirection: "display-down" },
        },
      }],
    } },
  };
  assert.equal(
    applyStoredCoordinates(duplicateCoordinate, { "entity-1": { x: 10, y: 20 } }),
    duplicateCoordinate,
  );
});

test("coordinate save preserves supported fields added by another writer", () => {
  const dataset: Dataset = {
    version: "1.0",
    entities: [{ id: "entity-1", extensions: { [COORDINATE_EXTENSION_ID]: {
      coordinates: [
        { spaceId: "writer-space-before", values: { sequence: 1 } },
        {
        spaceId: "linkscape-graph",
        values: { x: 1, y: 2, confidence: 0.8 },
        writerNote: "preserve",
        },
        { spaceId: "writer-space-after", values: { sequence: 2 } },
      ],
    } } }],
    events: [], relations: [],
    extensions: { [COORDINATE_EXTENSION_ID]: {
      formatVersion: "0.1.0",
      spaces: [{
        id: "linkscape-graph",
        kind: "cartesian-2d",
        components: {
          x: { unit: "linkscape-user-unit", positiveDirection: "display-right" },
          y: { unit: "linkscape-user-unit", positiveDirection: "display-down" },
          confidence: {},
        },
      }, {
        id: "writer-space-before",
        components: { sequence: {} },
      }, {
        id: "writer-space-after",
        components: { sequence: {} },
      }],
    } },
  };
  const saved = applyStoredCoordinates(dataset, { "entity-1": { x: 10, y: 20 } });
  const payload = (saved.entities[0]?.extensions as Record<string, unknown>)[COORDINATE_EXTENSION_ID] as Record<string, unknown>;
  assert.deepEqual(payload.coordinates, [
    { spaceId: "writer-space-before", values: { sequence: 1 } },
    {
      spaceId: "linkscape-graph",
      values: { x: 10, y: 20, confidence: 0.8 },
      writerNote: "preserve",
    },
    { spaceId: "writer-space-after", values: { sequence: 2 } },
  ]);
});

test("legacy-only coordinate save preserves the legacy payload and declaration", () => {
  const specificationId = "draft.github.sukoyaka-dopeness.specification";
  const dataset: Dataset = {
    version: "1.0",
    entities: [{ id: "entity-1", extensions: { coordinate: { positions: [
      { spaceId: "linkscape", x: 1, y: 2 },
    ] } } }],
    events: [], relations: [],
    extensions: { [specificationId]: {
      specVersion: "0.1.0",
      uses: [{ extension: "coordinate", version: "0.0.0" }],
    } },
  };
  const saved = applyStoredCoordinates(dataset, { "entity-1": { x: 10, y: 20 } });
  assert.deepEqual((saved.entities[0]?.extensions as Record<string, unknown>).coordinate, {
    positions: [{ spaceId: "linkscape", x: 1, y: 2 }],
  });
  assert.deepEqual(((saved.extensions as Record<string, unknown>)[specificationId] as Record<string, unknown>).uses,
    [{ extension: "coordinate", version: "0.0.0" }]);
});

test("A15: fallback positions are deterministic for unchanged graph data", () => {
  const dataset: Dataset = { version: "1.0", entities: [{ id: "a" }, { id: "b" }, { id: "c" }], events: [], relations: [] };
  assert.deepEqual(buildEntityGraph(dataset).nodes, buildEntityGraph(dataset).nodes);
});

test("A6: viewport zoom remains bounded and is independent of Dataset data", () => {
  assert.equal(clampScale(10), 2.5);
  assert.equal(clampScale(0), 0.1);
  assert.equal(zoomScale(1, "in"), 1.1);
  assert.equal(zoomScale(1, "out"), 0.9);
});

test("recently touched graph objects move to the front of their layer", () => {
  assert.deepEqual(bringToFront(["a", "b", "c"], "b"), ["a", "c", "b"]);
  assert.deepEqual(bringToFront(["a", "b"], "c"), ["a", "b", "c"]);
});

test("viewport zoom uses the graph center rather than the top-left origin", () => {
  assert.equal(
    centeredViewportTransform(0.5, { x: 0, y: 0 }, 800, 500),
    "translate(400 250) scale(0.5) translate(-400 -250)",
  );
  assert.equal(
    centeredViewportTransform(1, { x: 20, y: -10 }, 800, 500),
    "translate(420 240) scale(1) translate(-400 -250)",
  );
});

test("pinch zoom follows pointer distance and remains bounded", () => {
  assert.equal(pinchZoomScale(1, 100, 150), 1.5);
  assert.equal(pinchZoomScale(1, 100, 5), 0.1);
  assert.equal(pinchZoomScale(2, 100, 200), 2.5);
  assert.equal(pinchZoomScale(1, 0, 200), 1);
});

test("graph fitting centers small graphs and scales large graphs into view", () => {
  assert.deepEqual(fitGraphView([], 800, 500), { scale: 1, pan: { x: 0, y: 0 } });
  assert.deepEqual(fitGraphView([{ x: 100, y: 100 }], 800, 500), {
    scale: 1,
    pan: { x: 300, y: 150 },
  });
  const largeGraphView = fitGraphView([{ x: 0, y: 0 }, { x: 1600, y: 800 }], 800, 500, 64);
  assert.ok(largeGraphView.scale < 0.5);
  assert.ok(largeGraphView.pan.x < 0);
  assert.ok(largeGraphView.pan.y < 0);
  assert.ok(fitGraphView([{ x: 0, y: 0 }, { x: 1600, y: 800 }], 800, 500, 96).scale < largeGraphView.scale);
});

test("Entity edges use visible deterministic curves outside node centers", () => {
  assert.equal(
    graphEdgePath({ x: 100, y: 100 }, { x: 300, y: 100 }, 0, 1),
    "M 132 100 L 268 100",
  );
  assert.match(graphEdgePath({ x: 100, y: 100 }, { x: 300, y: 100 }, 1, 2), / Q /u);
  const selfPath = graphEdgePath({ x: 100, y: 100 }, { x: 100, y: 100 }, 0, 1);
  assert.match(selfPath, /^M .* A 38 38 0 1 0 /u);
});

test("edge routes expose a stable midpoint for horizontal labels", () => {
  const route = routeGraphEdge({ x: 100, y: 100 }, { x: 300, y: 100 }, 0, 1);
  assert.deepEqual(
    route.labelPoint,
    { x: 200, y: 100 },
  );
  const selfLabelPoint = routeGraphEdge({ x: 100, y: 100 }, { x: 100, y: 100 }, 0, 1).labelPoint;
  assert.equal(selfLabelPoint.x, 100);
  assert.ok(selfLabelPoint.y < 10);
});

test("parallel slots are canonical while graph edge order follows Dataset order", () => {
  const first: Dataset = {
    version: "1.0", entities: [{ id: "a" }, { id: "b" }], events: [],
    relations: [{ id: "z", sourceId: "a", targetId: "b" }, { id: "a", sourceId: "a", targetId: "b" }],
  };
  const reversed = { ...first, relations: [...first.relations].reverse() };
  const firstGraph = buildEntityGraph(first);
  const reversedGraph = buildEntityGraph(reversed);
  assert.deepEqual(firstGraph.edges.map(({ id }) => id), ["z", "a"]);
  assert.deepEqual(reversedGraph.edges.map(({ id }) => id), ["a", "z"]);
  assert.deepEqual(
    Object.fromEntries(firstGraph.edges.map(({ id, parallelIndex }) => [id, parallelIndex])),
    Object.fromEntries(reversedGraph.edges.map(({ id, parallelIndex }) => [id, parallelIndex])),
  );
});

test("canonical routing makes self-loop and ordinary routes permutation-invariant", () => {
  const positions = { loop: { x: 100, y: 100 }, start: { x: -40, y: -80 }, end: { x: 160, y: 100 } };
  const first: Dataset = {
    version: "1.0", entities: Object.keys(positions).map((id) => ({ id })), events: [],
    relations: [{ id: "self", sourceId: "loop", targetId: "loop" }, { id: "ordinary", sourceId: "start", targetId: "end" }],
  };
  const reversed = { ...first, relations: [...first.relations].reverse() };
  const firstRoutes = routeWithCanonicalPriority(buildEntityGraph(first).edges, positions);
  const reversedRoutes = routeWithCanonicalPriority(buildEntityGraph(reversed).edges, positions);
  assert.equal(firstRoutes.routes.get("self")?.path, reversedRoutes.routes.get("self")?.path);
  assert.equal(firstRoutes.routes.get("ordinary")?.path, reversedRoutes.routes.get("ordinary")?.path);
});

test("canonical routing gives the same ordinary Relation the occupied-path avoidance route", () => {
  const positions = { a: { x: 0, y: 100 }, b: { x: 300, y: 100 }, c: { x: 50, y: 100 }, d: { x: 350, y: 100 } };
  const first: Dataset = {
    version: "1.0", entities: Object.keys(positions).map((id) => ({ id })), events: [],
    relations: [{ id: "r2", sourceId: "c", targetId: "d" }, { id: "r1", sourceId: "a", targetId: "b" }],
  };
  const reversed = { ...first, relations: [...first.relations].reverse() };
  const firstRoutes = routeWithCanonicalPriority(buildEntityGraph(first).edges, positions);
  const reversedRoutes = routeWithCanonicalPriority(buildEntityGraph(reversed).edges, positions);
  assert.equal(firstRoutes.routes.get("r1")?.path, reversedRoutes.routes.get("r1")?.path);
  assert.equal(firstRoutes.routes.get("r2")?.path, reversedRoutes.routes.get("r2")?.path);
  const baselineR1 = routeGraphEdge(positions.a, positions.b, 0, 1, [positions.c, positions.d]);
  const baselineR2 = routeGraphEdge(positions.c, positions.d, 0, 1, [positions.a, positions.b]);
  assert.equal(firstRoutes.routes.get("r1")?.path, baselineR1.path);
  assert.notEqual(firstRoutes.routes.get("r2")?.path, baselineR2.path);
  assert.deepEqual(firstRoutes.returnedOrder, ["r2", "r1"]);
});

test("manual ordinary routes are canonical occupied-path baselines", () => {
  const positions = { a: { x: 0, y: 100 }, b: { x: 300, y: 100 }, c: { x: 50, y: 100 }, d: { x: 350, y: 100 } };
  const first: Dataset = {
    version: "1.0", entities: Object.keys(positions).map((id) => ({ id })), events: [],
    relations: [{ id: "automatic", sourceId: "c", targetId: "d" }, { id: "manual", sourceId: "a", targetId: "b" }],
  };
  const reversed = { ...first, relations: [...first.relations].reverse() };
  const manualOffsets = { manual: 0 };
  const firstRoutes = routeWithCanonicalPriority(buildEntityGraph(first).edges, positions, manualOffsets);
  const reversedRoutes = routeWithCanonicalPriority(buildEntityGraph(reversed).edges, positions, manualOffsets);
  assert.equal(firstRoutes.routes.get("manual")?.path, reversedRoutes.routes.get("manual")?.path);
  assert.equal(firstRoutes.routes.get("automatic")?.path, reversedRoutes.routes.get("automatic")?.path);
  assert.match(firstRoutes.routes.get("manual")?.path ?? "", / L /u);
  assert.match(firstRoutes.routes.get("automatic")?.path ?? "", / Q /u);
});

test("automatic route generation uses a 12-unit intermediate offset", () => {
  const route = routeGraphEdge({ x: 100, y: 100 }, { x: 300, y: 100 }, 0, 1, [{ x: 200, y: 42 }]);

  assert.deepEqual(route.controlPoint, { x: 200, y: 112 });
});

test("automatic route generation stays within the 192-unit maximum search range", () => {
  const route = routeGraphEdge({ x: 100, y: 100 }, { x: 300, y: 100 }, 0, 1, [{ x: 200, y: 100 }]);

  assert.ok(Math.abs(route.controlPoint.y - 100) <= 192);
});

test("edge labels move along their paths to avoid an occupied midpoint", () => {
  const samples = Array.from({ length: 41 }, (_, index) => ({ x: index * 10, y: 100 }));
  const first = placeEdgeLabel(samples, "First", [], []);
  const second = placeEdgeLabel(samples, "Second", [first], []);

  assert.deepEqual(first, { x: 200, y: 100, width: 48, height: 22, directionX: 0, directionY: 1 });
  assert.notDeepEqual({ x: second.x, y: second.y }, { x: first.x, y: first.y });
});

test("edge labels recover toward a safe midpoint at the same normal offset", () => {
  const samples = Array.from({ length: 41 }, (_, index) => ({ x: index * 10, y: 100 }));
  const occupied = { x: 200, y: 100, width: 48, height: 22, directionX: 0, directionY: 1 };
  const placement = placeEdgeLabel(samples, "Midpoint", [occupied], [], [], undefined);

  assert.deepEqual({ x: placement.x, y: placement.y }, { x: 200, y: 76 });
});

test("edge-label recovery prefers the candidate with greater minimum Node clearance", () => {
  const samples = Array.from({ length: 41 }, (_, index) => ({ x: index * 10, y: 100 }));
  const occupied = { x: 200, y: 100, width: 48, height: 22, directionX: 0, directionY: 1 };
  const placement = placeEdgeLabel(samples, "Clearance", [occupied], [{ x: 200, y: 123 }], [], undefined);

  assert.deepEqual({ x: placement.x, y: placement.y }, { x: 40, y: 76 });
});

test("edge-label recovery retains the midpoint anchor outside local Node pressure", () => {
  const samples = Array.from({ length: 41 }, (_, index) => ({ x: index * 10, y: 100 }));
  const occupied = { x: 200, y: 100, width: 48, height: 22, directionX: 0, directionY: 1 };
  const placement = placeEdgeLabel(samples, "Anchor", [occupied], [{ x: 200, y: 200 }], [], undefined);

  assert.deepEqual({ x: placement.x, y: placement.y }, { x: 200, y: 76 });
});

test("edge labels move along their paths to avoid another edge", () => {
  const samples = Array.from({ length: 41 }, (_, index) => ({ x: index * 10, y: 100 }));
  const crossingEdge = Array.from({ length: 21 }, (_, index) => ({ x: 200, y: 50 + index * 5 }));
  const placement = placeEdgeLabel(samples, "Supports", [], [], [crossingEdge]);

  assert.notDeepEqual({ x: placement.x, y: placement.y }, { x: 200, y: 100 });
});

test("edge labels can move perpendicular to escape a nearby parallel edge", () => {
  const samples = Array.from({ length: 41 }, (_, index) => ({ x: index * 10, y: 100 }));
  const nearbyEdge = Array.from({ length: 41 }, (_, index) => ({ x: index * 10, y: 90 }));
  const placement = placeEdgeLabel(samples, "Parallel", [], [], [nearbyEdge]);

  assert.equal(placement.x, 200);
  assert.ok(placement.y > 100);
});

test("Relation-label visual state separates current position from logical target", () => {
  const first = { x: 0, y: 0, width: 48, height: 22, directionX: 0, directionY: 1 };
  const second = { ...first, x: 100 };
  const state = reconcileRelationLabelVisualState({ current: first, target: first }, second, false);

  assert.deepEqual(state.current, first);
  assert.deepEqual(state.target, second);
  assert.deepEqual(reconcileRelationLabelVisualState(undefined, second, false).current, second);
  assert.deepEqual(reconcileRelationLabelVisualState(state, second, true).current, second);
});

test("Relation-label visual state immediately follows every target without an active transition", () => {
  const first = { x: 0, y: 0, width: 48, height: 22, directionX: 0, directionY: 1 };
  const second = { ...first, x: 100, y: 20 };
  const state = reconcileRelationLabelVisualState({ current: first, target: first }, second, true);

  assert.deepEqual(state.current, second);
  assert.deepEqual(state.target, second);
});

test("Relation-label transition interpolation detects unsafe intermediate obstacles", () => {
  const start = { x: 0, y: 0, width: 20, height: 20, directionX: 0, directionY: 1 };
  const end = { ...start, x: 100 };
  assert.equal(isLabelTransitionPathSafe(start, end, { nodes: [{ x: 50, y: 0 }] }), false);
  assert.equal(isLabelTransitionPathSafe(start, end, { labels: [{ ...start, x: 50 }] }), false);
  assert.equal(isLabelTransitionPathSafe(start, end, { paths: [[{ x: 50, y: -20 }, { x: 50, y: 20 }]] }), false);
  assert.equal(isLabelTransitionPathSafe(start, end, { nodes: [{ x: 50, y: 100 }] }), true);
});

test("Relation-label interpolation preserves exact endpoints", () => {
  const start = { x: 0, y: 0, width: 20, height: 20, directionX: 0, directionY: 1 };
  const end = { x: 100, y: 40, width: 30, height: 22, directionX: 1, directionY: 0 };
  assert.deepEqual(interpolateLabelRect(start, end, 0), start);
  assert.deepEqual(interpolateLabelRect(start, end, 1), end);
});

test("manual Relation-label anchors use normalized route distance and reconstruct on a new route", () => {
  const route = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 50 }];
  const anchor = deriveManualRelationLabelAnchor(route, { x: 55, y: 10 });
  assert.ok(anchor.fraction > 0.5 && anchor.fraction < 0.7);
  const reconstructed = reconstructManualRelationLabelTarget([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 150, y: 50 }], anchor);
  assert.ok(reconstructed.x > 50);
  assert.ok(reconstructed.y > 0);
});

test("manual Relation-label anchor is independent of route sample density", () => {
  const coarse = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
  const fine = Array.from({ length: 11 }, (_, index) => ({ x: index * 10, y: 0 }));
  const coarseAnchor = deriveManualRelationLabelAnchor(coarse, { x: 25, y: 12 });
  const fineAnchor = deriveManualRelationLabelAnchor(fine, { x: 25, y: 12 });
  assert.ok(Math.abs(coarseAnchor.fraction - fineAnchor.fraction) < 0.001);
  assert.ok(Math.abs(coarseAnchor.normalOffset - fineAnchor.normalOffset) < 0.001);
});

test("manual Node-label offset follows its point-like owner", () => {
  const offset = deriveManualNodeLabelOffset({ x: 100, y: 80 }, { x: 140, y: 50 });
  assert.deepEqual(offset, { x: 40, y: -30 });
  assert.deepEqual(reconstructManualNodeLabelPosition({ x: 220, y: 180 }, offset), { x: 260, y: 150 });
});

test("placement ownership maps automatic and manual states consistently", () => {
  assert.equal(placementOwnership(false), "automatic");
  assert.equal(placementOwnership(true), "user");
});

test("hover descriptions are bounded and preserve empty descriptions", () => {
  assert.equal(boundedHoverDescription("  short description  "), "short description");
  assert.equal(boundedHoverDescription(""), "");
  assert.equal(boundedHoverDescription("x".repeat(20), 10).length, 10);
});

test("hover content keeps ownership on its own line", () => {
  assert.deepEqual(composeHoverLines("entity", { name: "Entity", ownership: "" }), ["Entity"]);
  assert.deepEqual(composeHoverLines("node-label", { description: "Description", ownership: "User placement" }), ["Description", "User placement"]);
  assert.deepEqual(composeHoverLines("node-label", { ownership: "Automatic placement" }), ["Automatic placement"]);
  assert.deepEqual(composeHoverLines("relation-label", { name: "Supports", ownership: "User placement" }), ["Supports", "User placement"]);
  assert.deepEqual(composeHoverLines("relation-label", { ownership: "Automatic placement" }), ["Automatic placement"]);
  assert.deepEqual(composeHoverLines("relation-route", { source: "A", target: "B", ownership: "Automatic placement" }), ["A", "B", "Automatic placement"]);
  assert.equal(composeHoverLines("node-label", { description: "x".repeat(200), ownership: "Automatic placement" })[0]!.length, 96);
});

test("self Relation hover content shows its Entity once", () => {
  assert.deepEqual(composeHoverLines("relation-route", { source: "System", target: "System", ownership: "Automatic placement", self: true }), ["System", "Automatic placement"]);
});

test("distinct same-name Relation endpoints remain two hover lines", () => {
  assert.deepEqual(composeHoverLines("relation-route", { source: "System", target: "System", ownership: "User placement" }), ["System", "System", "User placement"]);
});

test("a manual curve offset overrides automatic routing while keeping node-boundary attachments", () => {
  const source = { x: 100, y: 100 };
  const target = { x: 300, y: 100 };
  const route = routeGraphEdge(source, target, 0, 1, [], [], false, 0, -60);

  assert.match(route.path, / Q /);
  assert.deepEqual(route.controlPoint, { x: 200, y: 40 });
  assert.ok(route.samples[0]!.x > source.x && route.samples[0]!.y < source.y);
  assert.ok(route.samples.at(-1)!.x < target.x && route.samples.at(-1)!.y < target.y);
});

test("Entity edges deterministically curve around unrelated nodes", () => {
  const directCurve = graphEdgePath(
    { x: 100, y: 100 },
    { x: 300, y: 100 },
    0,
    1,
  );
  const avoidingCurve = graphEdgePath(
    { x: 100, y: 100 },
    { x: 300, y: 100 },
    0,
    1,
    [{ x: 200, y: 100 }],
  );
  assert.notEqual(avoidingCurve, directCurve);
  assert.equal(
    avoidingCurve,
    graphEdgePath({ x: 100, y: 100 }, { x: 300, y: 100 }, 0, 1, [{ x: 200, y: 100 }]),
  );
});

test("later Entity edges choose another route when an edge path is occupied", () => {
  const firstRoute = routeGraphEdge({ x: 100, y: 100 }, { x: 300, y: 100 }, 0, 1);
  const secondRoute = routeGraphEdge(
    { x: 100, y: 100 },
    { x: 300, y: 100 },
    0,
    1,
    [],
    [firstRoute.samples],
  );
  assert.notEqual(secondRoute.path, firstRoute.path);
  assert.ok(secondRoute.samples.length > 0);
});

test("a brief edge crossing does not curve an otherwise clear Relation", () => {
  const horizontal = routeGraphEdge({ x: 50, y: 100 }, { x: 350, y: 100 }, 0, 1);
  const vertical = routeGraphEdge(
    { x: 200, y: 0 },
    { x: 200, y: 200 },
    0,
    1,
    [],
    [horizontal.samples],
  );
  assert.equal(vertical.path, "M 200 32 L 200 168");
});

test("short nearby Relations keep ordered endpoints and avoid excessive curvature", () => {
  const shortRoute = routeGraphEdge({ x: 100, y: 100 }, { x: 150, y: 100 }, 0, 1);
  assert.equal(shortRoute.path, "M 115 100 L 135 100");
  const repeatedShortRoute = routeGraphEdge(
    { x: 100, y: 100 },
    { x: 150, y: 100 },
    0,
    1,
    [],
    [shortRoute.samples],
  );
  assert.equal(repeatedShortRoute.path, shortRoute.path);
});

test("unrelated nodes overlapping endpoints remain routing obstacles", () => {
  const source = { x: 100, y: 100 };
  const target = { x: 300, y: 100 };
  const endpointObstacles = [{ ...source }, { ...target }];
  const firstRoute = routeGraphEdge(source, target, 0, 1, endpointObstacles);
  const secondRoute = routeGraphEdge(
    source,
    target,
    0,
    1,
    endpointObstacles,
    [firstRoute.samples],
  );
  assert.match(firstRoute.path, / Q /u);
  assert.notEqual(secondRoute.path, firstRoute.path);
});

test("Relations between distinct overlapping nodes alternate curve direction", () => {
  const point = { x: 100, y: 100 };
  const firstRoute = routeGraphEdge(point, point, 0, 1, [], [], false);
  const secondRoute = routeGraphEdge(point, point, 0, 1, [], [firstRoute.samples], false, 1);
  assert.match(firstRoute.path, / C .* 52,/u);
  assert.match(secondRoute.path, / C .* 148,/u);
  assert.notEqual(firstRoute.path, secondRoute.path);
  assert.match(graphEdgePath(point, point, 0, 1), /^M .* A 38 38 0 1 0 /u);
});

test("parallel self-Relations use different radii and attachment points", () => {
  const point = { x: 100, y: 100 };
  const first = routeGraphEdge(point, point, 0, 2);
  const second = routeGraphEdge(point, point, 1, 2);
  assert.match(first.path, / A 38 38 /u);
  assert.match(second.path, / A 38 38 /u);
  assert.notEqual(first.path.split(" A ")[0], second.path.split(" A ")[0]);
  assert.notDeepEqual(first.labelPoint, second.labelPoint);
  const fourth = routeGraphEdge(point, point, 3, 4);
  assert.match(fourth.path, / A 52 52 /u);
  assert.ok(Math.abs(Math.hypot(first.samples[0]!.x - point.x, first.samples[0]!.y - point.y) - 32) > 0);
  assert.ok(first.samples.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)));
});

test("a manual self-Relation handle controls loop orientation and radius", () => {
  const point = { x: 100, y: 100 };
  const route = routeGraphEdge(point, point, 0, 1, [], [], true, 0, undefined, {
    orientation: 0,
    radius: 64,
  });

  assert.match(route.path, / A 64 64 /u);
  assert.ok(route.controlPoint.x > point.x);
  assert.ok(Math.abs(route.controlPoint.y - point.y) < 1e-9);
  assert.notEqual(route.path, routeGraphEdge(point, point, 0, 1).path);
});

test("automatic self-Relation keeps preferred orientation without Node pressure", () => {
  const preferred = routeGraphEdge({ x: 100, y: 100 }, { x: 100, y: 100 }, 0, 1);
  const repeated = routeGraphEdge({ x: 100, y: 100 }, { x: 100, y: 100 }, 0, 1);
  assert.equal(preferred.path, repeated.path);
  assert.equal(preferred.samples.length, 41);
});

test("automatic self-Relation rotates away from a nearby Node while preserving radius", () => {
  const point = { x: 100, y: 100 };
  const preferred = routeGraphEdge(point, point, 0, 1);
  const obstacle = preferred.samples[20]!;
  const avoided = routeGraphEdge(point, point, 0, 1, [obstacle]);
  assert.notEqual(avoided.path, preferred.path);
  assert.equal(avoided.path.match(/ A 38 38 /u)?.[0], " A 38 38 ");
  assert.equal(avoided.samples.length, 41);
  assert.ok(avoided.samples.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)));
});

test("automatic self-Relation uses the refined 10-degree full-circle candidate set", () => {
  const point = { x: 100, y: 100 };
  const preferred = routeGraphEdge(point, point, 0, 1);
  const nearTenDegree = routeGraphEdge(point, point, 0, 1, [{ x: preferred.samples[20]!.x + 12, y: preferred.samples[20]!.y + 12 }]);
  assert.equal(preferred.samples.length, 41);
  assert.ok(nearTenDegree.samples.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)));
});

test("manual self-Relation remains fixed when an unrelated Node moves", () => {
  const point = { x: 100, y: 100 };
  const manual = { orientation: 0, radius: 64 };
  const first = routeGraphEdge(point, point, 0, 1, [{ x: 132, y: 100 }], [], true, 0, undefined, manual);
  const second = routeGraphEdge(point, point, 0, 1, [{ x: 80, y: 100 }], [], true, 0, undefined, manual);
  assert.equal(first.path, second.path);
  assert.equal(first.path.match(/ A 64 64 /u)?.[0], " A 64 64 ");
});

test("long Entity labels wrap to at most two lines inside a node", () => {
  assert.deepEqual(wrapNodeLabel("Short name"), ["Short name"]);
  assert.deepEqual(wrapNodeLabel("長いエンティティ名"), ["長いエンテ", "ィティ名"]);
  assert.deepEqual(wrapNodeLabel("A very long Entity name"), ["A very", "long…"]);
  assert.deepEqual(wrapNodeLabel("Alpha Beta"), ["Alpha Beta"]);
  assert.deepEqual(wrapNodeLabel("Alpha Beta Gamma"), ["Alpha Beta", "Gamma"]);
});

test("external node text stays compact while preserving short values", () => {
  assert.equal(truncateNodeText("Short name", 12), "Short name");
  assert.equal(truncateNodeText("  Multiple   spaces  ", 30), "Multiple spaces");
  assert.equal(truncateNodeText("A very long Entity name", 12), "A very long…");
});

test("node labels choose a deterministic free direction around occupied space", () => {
  const defaultPlacement = placeNodeLabel({ x: 100, y: 100 }, "Node", "", [], [], []);
  assert.ok(defaultPlacement.y > 100);
  const occupiedBelow = { ...defaultPlacement };
  const alternatePlacement = placeNodeLabel({ x: 100, y: 100 }, "Node", "", [occupiedBelow], [], []);
  assert.notDeepEqual(alternatePlacement, defaultPlacement);
  assert.deepEqual(
    alternatePlacement,
    placeNodeLabel({ x: 100, y: 100 }, "Node", "", [occupiedBelow], [], []),
  );
});

test("node-label route halo ignores distant routes and preserves no-route placement", () => {
  const noRoute = placeNodeLabel({ x: 100, y: 100 }, "Node", "", [], [], []);
  assert.deepEqual(
    placeNodeLabel({ x: 100, y: 100 }, "Node", "", [], [], [[{ x: 1000, y: 1000 }]]),
    noRoute,
  );
});

test("node-label route halo anticipates a route just outside hard clearance", () => {
  const routeNearPreferredCandidate = [[{ x: 100, y: 165 }]];
  const first = placeNodeLabel({ x: 100, y: 100 }, "Node", "", [], [], routeNearPreferredCandidate);
  const second = placeNodeLabel({ x: 100, y: 100 }, "Node", "", [], [], routeNearPreferredCandidate);
  assert.notDeepEqual(first, { x: 100, y: 150, width: 48, height: 20, directionX: 0, directionY: 1 });
  assert.deepEqual(first, second);
});

test("node label connectors appear only when labels are outside the icon", () => {
  assert.equal(shouldShowNodeLabelConnector({ x: 0, y: 0 }), false);
  assert.equal(shouldShowNodeLabelConnector({ x: 32, y: 0 }), false);
  assert.equal(shouldShowNodeLabelConnector({ x: 47, y: 0 }), true);
});

test("polyline grab helpers use arc length and project onto segments", () => {
  const samples = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
  assert.equal(nearestPolylineArcFraction(samples, { x: 50, y: 8 }), 0.25);
  assert.deepEqual(pointAtPolylineArcFraction(samples, 0.75), { x: 100, y: 50 });
  assert.equal(nearestPolylineArcFraction([{ x: 1, y: 1 }, { x: 1, y: 1 }], { x: 2, y: 2 }), null);
});

test("visible route solver follows the grabbed point within one graph unit", () => {
  const source = { x: 0, y: 0 };
  const target = { x: 400, y: 0 };
  const routeAtOffset = (offset: number) => routeGraphEdge(source, target, 0, 1, [], [], false, 0, offset).samples;
  const startSamples = routeAtOffset(0);
  const solved = solveVisibleRouteOffset({
    startOffset: 0,
    startSamples,
    grabFraction: 0.5,
    normal: { x: 0, y: 1 },
    desiredNormalDelta: 50,
    routeAtOffset,
  });
  assert.ok(solved !== null);
  const start = pointAtPolylineArcFraction(startSamples, 0.5)!;
  const end = pointAtPolylineArcFraction(routeAtOffset(solved!), 0.5)!;
  assert.ok(Math.abs(end.y - start.y - 50) <= 1);
  assert.equal(solveVisibleRouteOffset({ startOffset: 0, startSamples, grabFraction: 0.5, normal: { x: 0, y: 1 }, desiredNormalDelta: 0, routeAtOffset }), 0);
});

test("solver failure continuation stays near the last valid offset", () => {
  assert.equal(boundedDragContinuationOffset({ lastOffset: 318, lastDesiredNormalDelta: 175, lastGain: 1 / 0.58, desiredNormalDelta: 180 }), 320.9);
  assert.equal(boundedDragContinuationOffset({ lastOffset: 318, lastDesiredNormalDelta: 175, lastGain: 0, desiredNormalDelta: 180 }), null);
});

test("parallel automatic routes retain their equivalent manual baseline", () => {
  const source = { x: 0, y: 0 };
  const target = { x: 400, y: 0 };
  for (const parallelCount of [2, 3]) {
    for (const index of Array.from({ length: parallelCount }, (_, value) => value)) {
      const automatic = routeGraphEdge(source, target, index, parallelCount);
      const offset = curveOffsetFromControlPoint(source, target, automatic.controlPoint);
      const expectedOffset = (index % 2 === 0 ? 1 : -1) * (40 + Math.floor(index / 2) * 24);
      assert.equal(offset, expectedOffset);
      const equivalent = routeGraphEdge(source, target, index, parallelCount, [], [], false, 0, offset!);
      assert.deepEqual(equivalent.samples, automatic.samples);
      for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
        assert.deepEqual(
          pointAtPolylineArcFraction(equivalent.samples, fraction),
          pointAtPolylineArcFraction(automatic.samples, fraction),
        );
      }
      assert.deepEqual(
        routeGraphEdge(source, target, index, parallelCount, [], [], false, 0, offset!).samples,
        automatic.samples,
        "a zero desired drag delta keeps the automatic geometry",
      );
    }
  }
  assert.equal(curveOffsetFromControlPoint(source, source, source), null);
});

test("parallel solver eligibility follows obstacle route effect for distant and active obstacles", () => {
  const source = { x: 0, y: 0 };
  const target = { x: 400, y: 0 };
  for (const parallelIndex of [0, 1]) {
    const occupiedPaths = Array.from({ length: parallelIndex }, (_, value) =>
      routeGraphEdge(source, target, value, 2).samples);
    const reference = routeGraphEdge(source, target, parallelIndex, 2, [], occupiedPaths);
    const distant = routeGraphEdge(source, target, parallelIndex, 2, [{ x: 0, y: 300 }, { x: 400, y: 300 }], occupiedPaths);
    const distantComparison = compareRouteGeometry(reference.samples, distant.samples);
    assert.equal(distantComparison.sampleCountEqual, true);
    assert.equal(distantComparison.maxDeviation, 0);
    assert.equal(distantComparison.equivalent, true);

    const active = routeGraphEdge(source, target, parallelIndex, 2, [{ x: 200, y: parallelIndex === 0 ? 40 : -40 }], occupiedPaths);
    const activeComparison = compareRouteGeometry(reference.samples, active.samples);
    assert.equal(activeComparison.sampleCountEqual, true);
    assert.ok(activeComparison.maxDeviation > 1);
    assert.equal(activeComparison.equivalent, false);
  }
});

test("route geometry equivalence tolerates floating point noise but rejects meaningful changes", () => {
  const reference = routeGraphEdge({ x: 0, y: 0 }, { x: 400, y: 0 }, 0, 1).samples;
  const noisy = reference.map((point) => ({ x: point.x + 1e-7, y: point.y - 1e-7 }));
  const changed = reference.map((point) => ({ x: point.x + 1, y: point.y }));
  assert.equal(compareRouteGeometry(reference, noisy).equivalent, true);
  assert.equal(compareRouteGeometry(reference, changed).equivalent, false);
});

test("parallel solver rejects candidates that enter Node influence", () => {
  const source = { x: 0, y: 0 };
  const target = { x: 400, y: 0 };
  const obstacle = { x: 200, y: 100 };
  const routeAtOffset = (offset: number) => routeGraphEdge(source, target, 0, 2, [], [], false, 0, offset).samples;
  const isCandidateSafe = (samples: ReturnType<typeof routeAtOffset>) => !routeSamplesHaveNodeInfluence(samples, [obstacle]);
  assert.equal(isCandidateSafe(routeAtOffset(40)), true);
  assert.equal(isCandidateSafe(routeAtOffset(100)), false);
  assert.equal(solveVisibleRouteOffset({
    startOffset: 40,
    startSamples: routeAtOffset(40),
    grabFraction: 0.5,
    normal: { x: 0, y: 1 },
    desiredNormalDelta: 60,
    routeAtOffset,
    isCandidateSafe,
  }), null);
});

test("clean parallel routes satisfy the visible-response solver contract", () => {
  const source = { x: 0, y: 0 };
  const target = { x: 400, y: 0 };
  const normal = { x: 0, y: 1 };
  for (const parallelCount of [2, 3]) {
    for (const parallelIndex of Array.from({ length: parallelCount }, (_, value) => value)) {
      const precedingPaths = Array.from({ length: parallelIndex }, (_, value) =>
        routeGraphEdge(source, target, value, parallelCount).samples);
      const automatic = routeGraphEdge(source, target, parallelIndex, parallelCount, [], precedingPaths);
      const withoutOccupiedPaths = routeGraphEdge(source, target, parallelIndex, parallelCount);
      assert.deepEqual(automatic.samples, withoutOccupiedPaths.samples, `${parallelIndex} clean slot changed by occupied paths`);
      const baseline = curveOffsetFromControlPoint(source, target, automatic.controlPoint)!;
      const routeAtOffset = (offset: number) => routeGraphEdge(source, target, parallelIndex, parallelCount, [], [], false, 0, offset).samples;
      const baselinePoint = pointAtPolylineArcFraction(automatic.samples, 0.5)!;
      let previousDisplacement = -Infinity;
      for (let offset = baseline - 200; offset <= baseline + 200; offset += 25) {
        const point = pointAtPolylineArcFraction(routeAtOffset(offset), 0.5)!;
        const displacement = (point.y - baselinePoint.y) * normal.y;
        assert.ok(Number.isFinite(displacement));
        assert.ok(displacement >= previousDisplacement - 1e-8, `${parallelIndex}:${offset} is not monotonic`);
        previousDisplacement = displacement;
      }
      for (const fraction of [0.25, 0.5, 0.75]) {
        const startSamples = automatic.samples;
        for (const desiredNormalDelta of [10, 20, 50, 100, -10, -20, -50]) {
          const solved = solveVisibleRouteOffset({
            startOffset: baseline,
            startSamples,
            grabFraction: fraction,
            normal,
            desiredNormalDelta,
            routeAtOffset,
          });
          assert.ok(solved !== null, `${parallelIndex}:${fraction}:${desiredNormalDelta} did not converge`);
          const start = pointAtPolylineArcFraction(startSamples, fraction)!;
          const end = pointAtPolylineArcFraction(routeAtOffset(solved!), fraction)!;
          assert.ok(Math.abs((end.y - start.y) - desiredNormalDelta) <= 1, `${parallelIndex}:${fraction}:${desiredNormalDelta} exceeded error budget`);
        }
      }
    }
  }
});
