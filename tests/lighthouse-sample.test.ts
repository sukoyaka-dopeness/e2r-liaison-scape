import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
import { loadDataset, serializeDataset } from "../src/dataset.ts";

const files = [
  "lighthouse-restoration-demo.en.e2r.json",
  "lighthouse-restoration-demo.ja.e2r.json",
] as const;

async function readSample(file: string) {
  const source = await readFile(new URL(`../public/${file}`, import.meta.url), "utf8");
  const parsed = JSON.parse(source);
  const loaded = loadDataset(source);
  assert.ok(loaded.dataset, `${file} should load as a Dataset`);
  assert.deepEqual(JSON.parse(serializeDataset(loaded.dataset)), parsed);
  assert.equal(loaded.diagnostics.filter(({ severity }) => severity === "error").length, 0);
  return parsed;
}

test("Lighthouse samples are valid, positioned, connected, and round-trip unchanged", async () => {
  const [english, japanese] = await Promise.all(files.map(readSample));

  for (const sample of [english, japanese]) {
    assert.equal(sample.entities.length, 10);
    assert.equal(sample.events.length, 11);
    assert.equal(sample.relations.length, 23);
    assert.equal(Object.keys(sample.entities.filter((entity: any) => entity.extensions?.["draft.github.sukoyaka-dopeness.coordinate"])).length, 10);
    assert.equal(sample.relations.filter((relation: any) => relation.sourceId === relation.targetId).length, 2);
    assert.equal(sample.relations.filter((relation: any) => relation.sourceId === "clara" && relation.targetId === "thomas").length, 2);
    assert.equal(sample.relations.filter((relation: any) => sample.events.some((event: any) => event.id === relation.sourceId)).length, 12);
    assert.ok(sample.entities.some((entity: any) => entity.id === "clara"));
    assert.ok(!sample.entities.some((entity: any) => entity.id === "entity-restoration-team"));
    assert.ok(!sample.entities.some((entity: any) => entity.id === "entity-harbor-community"));
  }

  assert.notEqual(english.extensions.metadata.datasetId, japanese.extensions.metadata.datasetId);
  assert.deepEqual(english.entities.map((entity: any) => entity.id), japanese.entities.map((entity: any) => entity.id));
  assert.deepEqual(english.events.map((event: any) => [event.id, event.extensions?.history]), japanese.events.map((event: any) => [event.id, event.extensions?.history]));
  assert.deepEqual(english.relations.map((relation: any) => [relation.id, relation.sourceId, relation.targetId]), japanese.relations.map((relation: any) => [relation.id, relation.sourceId, relation.targetId]));
});
