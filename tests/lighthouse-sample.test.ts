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
    assert.equal(sample.relations.length, 28);
    assert.equal(Object.keys(sample.entities.filter((entity: any) => entity.extensions?.["draft.github.sukoyaka-dopeness.coordinate"])).length, 10);
    assert.equal(sample.relations.filter((relation: any) => relation.sourceId === relation.targetId).length, 2);
    assert.equal(sample.relations.filter((relation: any) => relation.sourceId === "clara" && relation.targetId === "thomas").length, 2);
    assert.equal(sample.relations.filter((relation: any) => sample.events.some((event: any) => event.id === relation.sourceId)).length, 14);
    assert.deepEqual(sample.relations.filter((relation: any) => relation.sourceId === "work-starts").map((relation: any) => relation.targetId), ["clara", "thomas", "maya", "beacon"]);
    assert.deepEqual(sample.relations.filter((relation: any) => relation.id === "authority-lighthouse").map((relation: any) => [relation.sourceId, relation.targetId]), [["authority", "lighthouse"]]);
    const entityIds = new Set(sample.entities.map((entity: any) => entity.id));
    const connectedEntityIds = new Set(sample.relations.filter((relation: any) => entityIds.has(relation.sourceId) && entityIds.has(relation.targetId)).flatMap((relation: any) => [relation.sourceId, relation.targetId]));
    assert.deepEqual([...connectedEntityIds].sort(), [...entityIds].sort());
    assert.ok(sample.entities.some((entity: any) => entity.id === "clara"));
    assert.ok(!sample.entities.some((entity: any) => entity.id === "entity-restoration-team"));
    assert.ok(!sample.entities.some((entity: any) => entity.id === "entity-harbor-community"));

    const friendship = sample.relations.filter((relation: any) => relation.id === "thomas-maya-friends");
    assert.equal(friendship.length, 1);
    assert.deepEqual(friendship[0], {
      id: "thomas-maya-friends",
      name: sample === english ? "friends with" : "友人",
      sourceId: "thomas",
      targetId: "maya",
    });
    const beaconInstallation = sample.relations.filter((relation: any) => relation.id === "beacon-lighthouse-installed-in");
    assert.equal(beaconInstallation.length, 1);
    assert.deepEqual(beaconInstallation[0], {
      id: "beacon-lighthouse-installed-in",
      name: sample === english ? "is installed in" : "設置されている",
      sourceId: "beacon",
      targetId: "lighthouse",
    });

    const presentation = sample.extensions?.["draft.github.sukoyaka-dopeness.liaisonscape-presentation"];
    assert.equal(presentation?.specVersion, "0.1.0");
    assert.deepEqual(presentation?.relations?.["clara-lighthouse"], { arrowDisplay: "reverse" });
    assert.equal(presentation?.relations?.["clara-thomas-supervises"], undefined);
    assert.deepEqual(presentation?.relations?.["thomas-maya-friends"], { arrowDisplay: "undirected", lineStyle: "dotted" });
    assert.deepEqual(presentation?.relations?.["clara-maya"], { arrowDisplay: "bidirectional" });
    assert.deepEqual(presentation?.relations?.["sofia-elias"], { lineStyle: "dashed" });
    const dashedRelationIds = Object.entries(presentation?.relations ?? {}).filter(([, value]: any) => value.lineStyle === "dashed").map(([relationId]) => relationId);
    assert.deepEqual(dashedRelationIds, ["sofia-elias"]);
    const dottedRelationIds = Object.entries(presentation?.relations ?? {}).filter(([, value]: any) => value.lineStyle === "dotted").map(([relationId]) => relationId);
    assert.deepEqual(dottedRelationIds, ["thomas-maya-friends"]);
    assert.equal(presentation?.relations?.["beacon-lighthouse-installed-in"], undefined);
    for (const record of Object.values(presentation?.relations ?? {}) as any[]) {
      assert.notEqual(record.arrowDisplay, "normal");
      assert.notEqual(record.lineStyle, "solid");
    }

    const specification = sample.extensions?.["draft.github.sukoyaka-dopeness.specification"];
    assert.equal(specification?.uses?.filter((use: any) => use.extension === "draft.github.sukoyaka-dopeness.liaisonscape-presentation" && use.version === "0.1.0").length, 1);
    assert.equal(specification?.uses?.some((use: any) => "features" in use), false);
  }

  assert.notEqual(english.extensions.metadata.datasetId, japanese.extensions.metadata.datasetId);
  assert.deepEqual(english.entities.map((entity: any) => entity.id), japanese.entities.map((entity: any) => entity.id));
  assert.deepEqual(english.events.map((event: any) => [event.id, event.extensions?.history]), japanese.events.map((event: any) => [event.id, event.extensions?.history]));
  assert.deepEqual(english.relations.map((relation: any) => [relation.id, relation.sourceId, relation.targetId]), japanese.relations.map((relation: any) => [relation.id, relation.sourceId, relation.targetId]));
  assert.deepEqual(english.extensions?.["draft.github.sukoyaka-dopeness.liaisonscape-presentation"], japanese.extensions?.["draft.github.sukoyaka-dopeness.liaisonscape-presentation"]);
});
