import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { buildEntityGraph } from "../src/dataset.ts";
import { generateFrontierCandidateSet } from "../src/frontier-candidate-generator.ts";

const root = process.cwd();
const outputDirectory = path.join(root, "experimental", "frontier-12-shared-candidate-generator-parity1");
const reviewed = JSON.parse(fs.readFileSync(path.join(root, "experimental", "frontier-actual-product-visual-sweep1", "result-summary.json"), "utf8"));

function syntheticBipartite(leftSize: number, rightSize: number) {
  const left = Array.from({ length: leftSize }, (_, index) => `left-${index + 1}`);
  const right = Array.from({ length: rightSize }, (_, index) => `right-${index + 1}`);
  return { version: "1.0", entities: [...left, ...right].map((id) => ({ id, name: id.replace("-", " ") })), events: [], relations: left.flatMap((sourceId) => right.map((targetId) => ({ id: `${sourceId}-${targetId}`, sourceId, targetId, name: "connected" }))) };
}

function candidateSetDigest(result: ReturnType<typeof generateFrontierCandidateSet>) {
  const signature = result.poolCandidates.map(({ family, identity, structuralCrossings, cheapScore, minNodeSeparation, meanNodeSeparation, medianEdge, maxEdge, width, height, aspect, featureVector, topologyFeatureVector, positions }) => ({ family, identity, structuralCrossings, cheapScore, minNodeSeparation, meanNodeSeparation, medianEdge, maxEdge, width, height, aspect, featureVector, topologyFeatureVector, positions }));
  return createHash("sha256").update(JSON.stringify(signature)).digest("hex");
}

function run(fixture: { id: string; source: string }) {
  const dataset = fixture.source.startsWith("synthetic:k") ? syntheticBipartite(...fixture.source.slice("synthetic:k".length).split("-").map(Number) as [number, number]) : JSON.parse(fs.readFileSync(path.resolve(root, fixture.source), "utf8"));
  const graph = buildEntityGraph(dataset);
  const input = { nodes: graph.nodes.map(({ id }) => ({ id })), edges: graph.edges.map(({ id, sourceId, targetId }) => ({ id, sourceId, targetId })) };
  const first = generateFrontierCandidateSet(input);
  const repeated = generateFrontierCandidateSet(input);
  if (first.status !== "completed" || repeated.status !== "completed") throw new Error(`${fixture.id}: candidate generation failed`);
  const fixturePath = fixture.source.startsWith("synthetic:") ? path.join(outputDirectory, `.tmp-${fixture.id}.json`) : path.resolve(root, fixture.source);
  if (fixture.source.startsWith("synthetic:")) {
    fs.mkdirSync(outputDirectory, { recursive: true });
    fs.writeFileSync(fixturePath, JSON.stringify(dataset));
  }
  const environment = { ...process.env, E2R_PRESENTATION_GEOMETRY_CACHE: "1", E2R_PRESENTATION_EXACT_CANDIDATE_REUSE: "1", E2R_RELAXATION_FINAL_CANONICALIZATION: "round-once", E2R_GLOBAL_PLACEMENT_ABLATION: "frontier-12", E2R_GLOBAL_PLACEMENT_MODE: "viewport-anisotropic", E2R_GLOBAL_SPACING_SCALE: ".88", E2R_GLOBAL_SPACING_Y: "1.12", E2R_GLOBAL_SPACING_STAGE2: "off" };
  for (const key of Object.keys(environment)) if (key.startsWith("E2R_") && !["E2R_PRESENTATION_GEOMETRY_CACHE", "E2R_PRESENTATION_EXACT_CANDIDATE_REUSE", "E2R_RELAXATION_FINAL_CANONICALIZATION", "E2R_GLOBAL_PLACEMENT_ABLATION", "E2R_GLOBAL_PLACEMENT_MODE", "E2R_GLOBAL_SPACING_SCALE", "E2R_GLOBAL_SPACING_Y", "E2R_GLOBAL_SPACING_STAGE2"].includes(key)) delete environment[key as keyof typeof environment];
  const child = spawnSync(process.execPath, ["--experimental-strip-types", "tools/generic-crossing-search.mjs", fixturePath], { cwd: root, encoding: "utf8", env: environment, maxBuffer: 100 * 1024 * 1024, timeout: 30_000 });
  if (fixture.source.startsWith("synthetic:")) fs.rmSync(fixturePath, { force: true });
  if (child.status !== 0) throw new Error(`${fixture.id}: ${child.stderr || child.error || `exit ${child.status}`}`);
  const output = JSON.parse(child.stdout);
  const expected = reviewed.rows.find((row: { fixture: string }) => row.fixture === fixture.id);
  return {
    fixture: fixture.id,
    source: fixture.source,
    status: "replayed",
    graph: output.graph,
    candidateStatus: first.status,
    poolCount: first.poolCandidates.length,
    frontierCount: first.frontierCandidates.length,
    representativeCount: first.representatives.length,
    deterministic: JSON.stringify(first) === JSON.stringify(repeated),
    candidateSetDigest: candidateSetDigest(first),
    representativeIdentities: first.representatives.map(({ identity }) => identity),
    selectedFamily: output.selected?.family ?? null,
    selectedPositionFingerprint: output.selectedPositionFingerprint ?? null,
    reviewedFamily: expected?.selectedFamily ?? null,
    reviewedPositionFingerprint: expected?.selectedPositionFingerprint ?? null,
    endToEndParity: output.selected?.family === expected?.selectedFamily && output.selectedPositionFingerprint === expected?.selectedPositionFingerprint,
    candidateGenerationMs: output.ablation?.cheapPlanning?.candidateGenerationMs ?? null,
    productPresentationMs: output.profile?.presentationMs ?? null,
  };
}

const fixtures = [
  ["lighthouse-en", "../e2r-spec/examples/lighthouse-restoration-demo.en.e2r.json"],
  ["lighthouse-ja", "../e2r-spec/examples/lighthouse-restoration-demo.ja.e2r.json"],
  ["apollo-en", "../e2r-spec/examples/apollo-11-mission.en.e2r.json"],
  ["apollo-ja", "../e2r-spec/examples/apollo-11-mission.ja.e2r.json"],
  ["berlin-wall-en", "../e2r-narrative-line/src/sample/berlin-wall-history.en.e2r.json"],
  ["berlin-wall-ja", "../e2r-narrative-line/src/sample/berlin-wall-history.ja.e2r.json"],
  ["ashen-crown-en", "../e2r-spec/examples/ashen-crown.en.e2r.json"],
  ["ashen-crown-ja", "../e2r-spec/examples/ashen-crown.ja.e2r.json"],
  ["titanic-en", "../e2r-spec/examples/titanic-final-voyage.en.e2r.json"],
  ["titanic-ja", "../e2r-spec/examples/titanic-final-voyage.ja.e2r.json"],
  ["dense-k7-7", "synthetic:k7-7"],
  ["dense-k6-8", "synthetic:k6-8"],
  ["dense-k8-8", "synthetic:k8-8"],
] as const;

const rows = fixtures.map(([id, source]) => run({ id, source }));
const artifact = {
  contract: "LIAISONSCAPE-FRONTIER-12-SHARED-CANDIDATE-GENERATOR-PARITY-1",
  diagnosticOnly: true,
  sourceRevision: "working-tree-after-structural-refactor",
  generator: "src/frontier-candidate-generator.ts::generateFrontierCandidateSet",
  consumer: "tools/generic-crossing-search.mjs::productionStructuralFrontier",
  normalizedInput: "graph.nodes -> {id}; graph.edges -> {id,sourceId,targetId}; nodes sorted by compareId; edge order preserved",
  config: { limit: 12, featureMode: "global", circularMaximum: 12, circularSeeds: 8, circularRounds: 80, gridSeeds: 16, gridRounds: 1200 },
  environment: { E2R_RELAXATION_FINAL_CANONICALIZATION: "round-once", E2R_GLOBAL_PLACEMENT_ABLATION: "frontier-12", E2R_GLOBAL_PLACEMENT_MODE: "viewport-anisotropic", E2R_GLOBAL_SPACING_SCALE: ".88", E2R_GLOBAL_SPACING_Y: "1.12", E2R_GLOBAL_SPACING_STAGE2: "off" },
  reviewedArtifact: "experimental/frontier-actual-product-visual-sweep1/result-summary.json",
  coverage: "10 file-backed + 3 dense synthetic controls; label-heavy-ja-10 and parallel-self-loop-control remain existing-sweep-only fixture constructors",
  rows,
  candidateSetDeterminism: rows.every((row) => row.deterministic),
  endToEndParity: rows.every((row) => row.endToEndParity),
  classification: rows.every((row) => row.endToEndParity) ? "PARITY GATE PASSED" : "PARITY GATE FAILED",
};
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, "result.json"), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify(artifact, null, 2));
