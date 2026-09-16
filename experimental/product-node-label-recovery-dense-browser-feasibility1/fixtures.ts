import { solveAutoLayout } from "../../src/auto-layout.ts";
import type { Point } from "../../src/viewport.ts";

export type DenseFixtureDataset = {
  version: string;
  entities: Array<{ id: string; name: string; description?: string }>;
  events: unknown[];
  relations: Array<{ id: string; sourceId: string; targetId: string; name: string }>;
};

export type DenseFixture = {
  id: string;
  family: string;
  locale: "en" | "ja";
  dataset: DenseFixtureDataset;
  positions: Record<string, Point>;
};

function repeatText(seed: string, length: number) {
  return `${seed} ${"context detail ".repeat(Math.ceil(length / 15))}`.slice(0, length);
}

function nodeName(index: number, locale: "en" | "ja", long = false) {
  if (locale === "ja") return long ? repeatText(`ノード${index} 運用状態と関係情報`, 92) : `ノード${index}`;
  return long ? repeatText(`Node ${index} operational context`, 92) : `Node ${index}`;
}

function relationName(index: number, locale: "en" | "ja", long = false) {
  if (locale === "ja") return long ? repeatText(`関係${index} 詳細な説明と表示上の文脈`, 128) : `関係 ${index}`;
  return long ? repeatText(`Relation ${index} explanatory presentation context`, 128) : `Relation ${index}`;
}

function makeFixture(
  id: string,
  family: string,
  locale: "en" | "ja",
  nodeCount: number,
  buildRelations: (ids: string[]) => Array<[number, number, boolean]>,
  options: { longLabels?: boolean } = {},
): DenseFixture {
  const ids = Array.from({ length: nodeCount }, (_, index) => `${id}-node-${index}`);
  const relations = buildRelations(ids).map(([source, target, long], index) => ({
    id: `${id}-relation-${index}`,
    sourceId: ids[source]!,
    targetId: ids[target]!,
    name: relationName(index, locale, options.longLabels || long),
  }));
  const dataset: DenseFixtureDataset = {
    version: "1.0",
    entities: ids.map((entityId, index) => ({ id: entityId, name: nodeName(index, locale, options.longLabels), description: options.longLabels ? repeatText("Product entity description", 64) : "" })),
    events: [],
    relations,
  };
  const positions = solveAutoLayout({ entities: ids.map((entityId) => ({ id: entityId })), relations }, { iterations: 4 });
  return { id, family, locale, dataset, positions };
}

function lighthouse(): DenseFixture {
  const fixture = makeFixture("lighthouse", "lighthouse-ish", "en", 10, (ids) => [
    [0, 1, false], [1, 2, false], [2, 3, false], [3, 4, false], [4, 5, false],
    [0, 6, false], [6, 7, false], [7, 8, false], [8, 9, false],
    [2, 7, true], [3, 8, true], [1, 4, false], [5, 9, false], [0, 2, false],
  ]);
  fixture.dataset.entities = fixture.dataset.entities.map((entity, index) => ({ ...entity, name: ["Lighthouse", "Harbor", "Keeper", "Beacon", "Archive", "Visitor", "Coast", "Signal", "Map", "Log"][index]! }));
  return fixture;
}

function mediumDense(): DenseFixture {
  return makeFixture("medium-dense", "medium-dense", "en", 16, (ids) => {
    const result: Array<[number, number, boolean]> = [];
    for (let source = 0; source < ids.length; source += 1) for (const offset of [1, 2, 5]) result.push([source, (source + offset) % ids.length, false]);
    for (let index = 0; index < 4; index += 1) result.push([0, 1, true], [0, 1, true], [index + 4, index + 5, true]);
    for (let index = 0; index < 4; index += 1) result.push([index, index, true]);
    return result;
  });
}

function largeDense(): DenseFixture {
  return makeFixture("large-dense", "large-dense", "en", 28, (ids) => {
    const result: Array<[number, number, boolean]> = [];
    for (let source = 0; source < ids.length; source += 1) for (const offset of [1, 2, 4, 7, 11, 15]) result.push([source, (source + offset) % ids.length, false]);
    for (let index = 0; index < 8; index += 1) result.push([0, 1, true], [0, 1, true], [1, 2, true]);
    for (let index = 0; index < 8; index += 1) result.push([index * 2, index * 2, true]);
    return result;
  });
}

function highDegree(): DenseFixture {
  return makeFixture("high-degree", "high-degree-heavy", "en", 22, (ids) => {
    const result: Array<[number, number, boolean]> = [];
    for (let target = 1; target < ids.length; target += 1) result.push([0, target, false], [target, 0, false]);
    for (let target = 1; target <= 4; target += 1) for (let copy = 0; copy < 5; copy += 1) result.push([0, target, true]);
    return result;
  });
}

function labelHeavy(locale: "en" | "ja"): DenseFixture {
  return makeFixture(`label-heavy-${locale}`, `label-heavy-${locale}`, locale, 18, (ids) => {
    const result: Array<[number, number, boolean]> = [];
    for (let source = 0; source < ids.length; source += 1) for (const offset of [1, 3, 8]) result.push([source, (source + offset) % ids.length, true]);
    return result;
  }, { longLabels: true });
}

function parallelSelfLoop(): DenseFixture {
  return makeFixture("parallel-self-loop", "parallel-self-loop", "ja", 14, (ids) => {
    const result: Array<[number, number, boolean]> = [];
    for (let index = 0; index < ids.length - 1; index += 1) result.push([index, index + 1, false]);
    for (let copy = 0; copy < 12; copy += 1) result.push([0, 1, true]);
    for (let copy = 0; copy < 5; copy += 1) result.push([2, 3, true]);
    for (let index = 0; index < 8; index += 1) result.push([index, index, true]);
    return result;
  });
}

export function denseBrowserFixtures(): DenseFixture[] {
  return [lighthouse(), mediumDense(), largeDense(), highDegree(), labelHeavy("en"), labelHeavy("ja"), parallelSelfLoop()];
}
