import assert from "node:assert/strict";
import test from "node:test";
import { getDatasetExportFilename } from "../src/services/DatasetService.ts";
import type { Dataset } from "../src/models.ts";

test("Dataset export filename uses a safe title without changing Dataset data", () => {
  for (const [title, expected] of [
    ["星の記録", "星の記録.e2r.json"],
    ["  A: Dataset/Title?  ", "A- Dataset-Title.e2r.json"],
    ["CON", "e2r-dataset.e2r.json"],
    ["..", "e2r-dataset.e2r.json"],
    ["A\u0001B", "A-B.e2r.json"],
  ]) {
    const dataset = { version: "1.0", entities: [], events: [], relations: [], extensions: { metadata: { title, datasetId: "stable-id" } } } as Dataset;
    assert.equal(getDatasetExportFilename(dataset), expected);
    assert.equal((dataset.extensions as { metadata: { title: string; datasetId: string } }).metadata.title, title);
    assert.equal((dataset.extensions as { metadata: { title: string; datasetId: string } }).metadata.datasetId, "stable-id");
  }
  assert.equal(getDatasetExportFilename({ version: "1.0", entities: [], events: [], relations: [] } as Dataset), "e2r-dataset.e2r.json");
});

test("shortens only filenames over 180 UTF-8 bytes without changing Dataset data", () => {
  const filenameFor = (title: string): string => {
    const dataset = { version: "1.0", entities: [], events: [], relations: [], extensions: { metadata: { title, datasetId: "stable-id" } } } as Dataset;
    const filename = getDatasetExportFilename(dataset);
    assert.equal((dataset.extensions as { metadata: { title: string } }).metadata.title, title);
    assert.equal((dataset.extensions as { metadata: { datasetId: string } }).metadata.datasetId, "stable-id");
    assert.ok(new TextEncoder().encode(filename).length <= 180);
    assert.equal(filename, getDatasetExportFilename(dataset));
    return filename;
  };
  assert.equal(filenameFor("a".repeat(171)), `${"a".repeat(171)}.e2r.json`);
  assert.equal(filenameFor("界".repeat(57)), `${"界".repeat(57)}.e2r.json`);
  assert.equal(filenameFor("😀".repeat(42)), `${"😀".repeat(42)}.e2r.json`);
  for (const title of ["a".repeat(172), "界".repeat(58), "😀".repeat(43), "A/".repeat(100)]) {
    const filename = filenameFor(title);
    assert.match(filename, /^.+…-[0-9a-f]{8}\.e2r\.json$/u);
    assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(filename));
  }
  assert.notEqual(filenameFor("a".repeat(171) + "x"), filenameFor("a".repeat(171) + "y"));
  assert.equal(filenameFor("CON"), "e2r-dataset.e2r.json");
  assert.equal(filenameFor(".."), "e2r-dataset.e2r.json");
});
