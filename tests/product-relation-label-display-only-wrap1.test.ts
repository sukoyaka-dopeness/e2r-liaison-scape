import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { getRelationLabelTextGeometry, wrapRelationLabelText } from "../src/viewport.ts";
import { horizontalLabelCapacity, japaneseLabelCapacity, verticalLabelCapacity } from "../experimental/product-relation-label-display-only-wrap1/fixtures.mjs";

const artifact = JSON.parse(fs.readFileSync(new URL("../experimental/product-relation-label-display-only-wrap1/result-summary.json", import.meta.url), "utf8"));
const row = (id: string) => artifact.rows.find(({ fixture }: { fixture: string }) => fixture === id);
const policy = artifact.wrapPolicy;
const horizontalSamples = Array.from({ length: 41 }, (_, index) => ({ x: index * 4, y: 0 }));

test("default Relation-label geometry remains one-line and current-sized", () => {
  const geometry = getRelationLabelTextGeometry("Long horizontal relation label", horizontalSamples);
  assert.deepEqual(geometry.lines, ["Long horizontal relation label"]);
  assert.equal(geometry.height, 22);
  assert.equal(geometry.wrapped, false);
  assert.equal(geometry.width, geometry.oneLineWidth);
});

test("display-only wrap reduces horizontal owner span without changing source text", () => {
  const dataset = horizontalLabelCapacity();
  const before = JSON.stringify(dataset);
  const geometry = getRelationLabelTextGeometry(dataset.relations[1]!.name!, horizontalSamples, policy);
  assert.equal(JSON.stringify(dataset), before);
  assert.equal(geometry.wrapped, true);
  assert.equal(geometry.lines.length, 2);
  assert.ok(geometry.width < geometry.oneLineWidth);
  assert.equal(geometry.height, 34);
  assert.ok(geometry.lines.every((line) => line.length > 0));
});

test("Japanese wrap uses bounded character fallback and stays balanced", () => {
  const dataset = japaneseLabelCapacity();
  const before = JSON.stringify(dataset);
  const geometry = getRelationLabelTextGeometry(dataset.relations[1]!.name!, horizontalSamples, policy);
  assert.equal(JSON.stringify(dataset), before);
  assert.equal(geometry.wrapped, true);
  assert.equal(geometry.lines.length, 2);
  assert.ok(geometry.lines.every((line) => line.length > 0));
  const widths = geometry.lines.map((line) => Array.from(line).reduce((sum, character) => sum + (/[^\x00-\x7F]/u.test(character) ? 10 : 6.5), 0));
  assert.ok(Math.min(...widths) / Math.max(...widths) >= 0.6);
});

test("token and punctuation controls remain bounded to two lines", () => {
  for (const label of ["Supercalifragilisticexpialidocious", "supports:regional/restoration coordination"]) {
    const lines = wrapRelationLabelText(label, 92, 2);
    assert.ok(lines.length <= 2);
    assert.ok(lines.every((line) => line.length > 0));
  }
});

test("vertical controls do not wrap automatically and routing identities remain stable", () => {
  const vertical = row("vertical-label-capacity");
  assert.ok(vertical.arms["reference-wrap"].display.every(({ lineCount }: { lineCount: number }) => lineCount === 1));
  assert.deepEqual(vertical.arms["reference-one-line"].routeIds, vertical.arms["reference-wrap"].routeIds);
  assert.deepEqual(vertical.arms["reference-wrap"].ordinaryRouteChurn, { count: 0, ids: [] });
});

test("checkpoint remains diagnostic-only and preserves release holds", () => {
  assert.equal(artifact.contract, "LIAISONSCAPE-PRODUCT-RELATION-LABEL-DISPLAY-ONLY-WRAP-v1");
  assert.equal(artifact.diagnosticOnly, true);
  assert.equal(artifact.structuralPlacement, "unchanged");
  assert.equal(artifact.routingAuthority, "Product ordinary routing unchanged");
  assert.equal(artifact.relationLabelAuthority, "Product final Relation-label placement remains authoritative; wrap is diagnostic-only");
  assert.deepEqual(artifact.standing, { productDefault: "HOLD", productionProvider: "NOT ESTABLISHED", humanReview: "NOT READY", initialLayoutReleaseBlocker: "OPEN" });
});
