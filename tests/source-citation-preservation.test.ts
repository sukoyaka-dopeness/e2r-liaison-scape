import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
import { loadDataset, serializeDataset } from "../src/dataset.ts";

test("preserves the Source/Citation research fixture through Linkscape load/save", async () => {
  const source = await readFile(
    new URL("../../e2r-spec/examples/research/source-citation/conceptual-roundtrip.json", import.meta.url),
    "utf8",
  );
  const original = JSON.parse(source);
  const result = loadDataset(source);

  assert.ok(result.dataset);
  assert.ok(result.diagnostics.some(({ code }) => code === "unknown_extension"));
  assert.deepEqual(JSON.parse(serializeDataset(result.dataset)), original);
});
