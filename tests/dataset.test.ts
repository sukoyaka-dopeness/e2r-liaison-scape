import test from "node:test";
import assert from "node:assert/strict";
import { loadDataset, serializeDataset, validateDatasetForExport } from "../src/dataset.ts";

const empty = JSON.stringify({ version: "1.0", entities: [], events: [], relations: [] });

test("A1: opens a valid minimal Dataset without inventing objects or coordinates", () => {
  const result = loadDataset(empty);
  assert.ok(result.dataset);
  assert.deepEqual(result.dataset?.entities, []);
  assert.deepEqual(result.dataset?.events, []);
  assert.deepEqual(result.dataset?.relations, []);
  assert.deepEqual(result.diagnostics, []);
});

test("A4: preserves invalid input while reporting validation diagnostics", () => {
  const raw = JSON.stringify({ version: "1.0", entities: [], events: [] });
  const result = loadDataset(raw);
  assert.equal(result.dataset, null);
  assert.equal(result.raw, raw);
  assert.ok(result.diagnostics.some(({ code }) => code === "relations_missing"));
});

test("A5: accepts and preserves unknown Extensions", () => {
  const dataset = JSON.parse(empty) as Record<string, unknown>;
  dataset.extensions = { "vendor.example": { opaque: [1, true, "value"] } };
  const result = loadDataset(JSON.stringify(dataset));
  assert.ok(result.dataset);
  assert.equal(result.diagnostics[0]?.severity, "warning");
  assert.deepEqual(result.dataset?.extensions, dataset.extensions);
});

test("A16-A17: preserves Core and Extension data through a save round trip", () => {
  const dataset = {
    version: "1.0",
    entities: [{ id: "entity-1", name: "Apollo 11", futureField: { keep: true } }],
    events: [],
    relations: [],
    extensions: {
      metadata: { title: "Example", futureField: ["keep"] },
      "vendor.example": { opaque: { keep: true } },
    },
  };
  const loaded = loadDataset(JSON.stringify(dataset));
  assert.ok(loaded.dataset);
  const saved = serializeDataset(loaded.dataset!);
  assert.deepEqual(JSON.parse(saved), dataset);
});

test("invalid JSON remains available for the caller to preserve", () => {
  const raw = "{ not valid JSON";
  const result = loadDataset(raw);
  assert.equal(result.dataset, null);
  assert.equal(result.raw, raw);
  assert.ok(result.parseError);
});

test("A19: validates the current Dataset before export and keeps warnings separate", () => {
  const dataset = JSON.parse(empty) as Record<string, unknown>;
  dataset.extensions = { "vendor.example": { keep: true } };
  const diagnostics = validateDatasetForExport(dataset as never);
  assert.equal(diagnostics[0]?.severity, "warning");
  assert.equal(validateDatasetForExport({ version: "1.0", entities: [], events: [] } as never)[0]?.severity, "error");
});

test("A10: rejects a Relation-to-Relation endpoint as a Core error", () => {
  const raw = JSON.stringify({ version: "1.0", entities: [{ id: "entity-1" }], events: [], relations: [
    { id: "relation-1", sourceId: "relation-2", targetId: "entity-1" },
    { id: "relation-2", sourceId: "entity-1", targetId: "entity-1" },
  ] });
  const result = loadDataset(raw);
  assert.equal(result.dataset, null);
  assert.ok(result.diagnostics.some(({ code }) => code === "relation_source_is_relation"));
});
