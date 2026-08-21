import assert from "node:assert/strict";
import test from "node:test";
import { parseDatasetHandoffFragment, updateDatasetHandoffFragment } from "../src/dataset-handoff.ts";

test("parses absent and unrelated fragments as no handoff", () => {
  assert.deepEqual(parseDatasetHandoffFragment(""), { kind: "none" });
  assert.deepEqual(parseDatasetHandoffFragment("#"), { kind: "none" });
  assert.deepEqual(parseDatasetHandoffFragment("#foo=bar"), { kind: "none" });
});

test("accepts one absolute HTTPS dataset URL and ignores unknown parameters", () => {
  assert.deepEqual(
    parseDatasetHandoffFragment("#datasetUrl=https%3A%2F%2Fdata.example%2Fdataset.json"),
    { kind: "valid", datasetUrl: "https://data.example/dataset.json" },
  );
  assert.deepEqual(
    parseDatasetHandoffFragment("#foo=bar&datasetUrl=https%3A%2F%2Fdata.example%2Fdataset.json"),
    { kind: "valid", datasetUrl: "https://data.example/dataset.json" },
  );
});

test("rejects empty and duplicate datasetUrl parameters", () => {
  assert.deepEqual(parseDatasetHandoffFragment("#datasetUrl="), { kind: "invalid", reason: "empty-dataset-url" });
  assert.deepEqual(parseDatasetHandoffFragment("#datasetUrl=https%3A%2F%2Fa.example%2Fa&datasetUrl=https%3A%2F%2Fb.example%2Fb"), { kind: "invalid", reason: "duplicate-dataset-url" });
});

test("rejects relative, non-HTTPS, and credential-bearing URLs", () => {
  for (const [hash, reason] of [
    ["#datasetUrl=%2Fdataset.json", "invalid-url"],
    ["#datasetUrl=http%3A%2F%2Fdata.example%2Fdataset.json", "unsupported-scheme"],
    ["#datasetUrl=file%3A%2F%2F%2Fdataset.json", "unsupported-scheme"],
    ["#datasetUrl=data%3Aapplication%2Fjson%2C%257B%257D", "unsupported-scheme"],
    ["#datasetUrl=javascript%3Aalert(1)", "unsupported-scheme"],
    ["#datasetUrl=https%3A%2F%2Fuser%3Apass%40data.example%2Fdataset.json", "embedded-credentials"],
  ] as const) {
    assert.deepEqual(parseDatasetHandoffFragment(hash), { kind: "invalid", reason });
  }
});

test("removes datasetUrl while preserving unknown parameters", () => {
  assert.equal(updateDatasetHandoffFragment("#foo=bar&datasetUrl=https%3A%2F%2Fa.example%2Fa", null), "#foo=bar");
  assert.equal(updateDatasetHandoffFragment("#datasetUrl=https%3A%2F%2Fa.example%2Fa", null), "");
});

test("adds or replaces exactly one datasetUrl without erasing unrelated parameters", () => {
  assert.equal(updateDatasetHandoffFragment("#foo=bar", "https://data.example/dataset.json"), "#foo=bar&datasetUrl=https%3A%2F%2Fdata.example%2Fdataset.json");
  assert.equal(updateDatasetHandoffFragment("#foo=bar&datasetUrl=https%3A%2F%2Fa.example%2Fa&datasetUrl=https%3A%2F%2Fb.example%2Fb", "https://data.example/dataset.json"), "#foo=bar&datasetUrl=https%3A%2F%2Fdata.example%2Fdataset.json");
  assert.equal(updateDatasetHandoffFragment("#foo=bar&x=1", "https://data.example/a b.json"), "#foo=bar&x=1&datasetUrl=https%3A%2F%2Fdata.example%2Fa+b.json");
});
