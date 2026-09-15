import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

type Point = { x: number; y: number };
type Dataset = { version: string; entities: Array<{ id: string; name?: string; description?: string }>; events: unknown[]; relations: Array<{ id: string; sourceId: string; targetId: string; name?: string }> };
type Fixture = { id: string; locale: "en" | "ja"; source: string; surface: "acceptance" | "synthetic" };
const root = process.cwd();
const outputDirectory = path.join(root, "experimental", "frontier-g3-post-current-source-comparison1");
const priorArtifact = JSON.parse(fs.readFileSync(path.join(root, "experimental", "frontier-actual-product-visual-sweep1", "result-summary.json"), "utf8")) as { rows: Array<{ fixture: string; source: string; elapsedMs: number; candidateCount: number; evaluationCount: number; presentationMs: number; selectedFamily: string; selectedPositionFingerprint: string; selectedMetrics: Record<string, unknown>; positions: Record<string, Point> }> };

function labelHeavyJa(): Dataset {
  const ids = Array.from({ length: 10 }, (_, index) => `label-n${index}`);
  return { version: "1.0", entities: ids.map((id, index) => ({ id, name: `日本語 長いノードラベル ${index} 障害対応確認`, description: "長い説明文を含む日本語の表示確認用ノード" })), events: [], relations: Array.from({ length: 20 }, (_, index) => ({ id: `label-r${index}`, sourceId: ids[index % ids.length]!, targetId: ids[(index * 3 + 1) % ids.length]!, name: `長い日本語Relationラベル ${index} の表示と所有関係を確認する` })) };
}

const fixtures: Fixture[] = [
  { id: "lighthouse-en", locale: "en", source: "../e2r-spec/examples/lighthouse-restoration-demo.en.e2r.json", surface: "acceptance" },
  { id: "lighthouse-ja", locale: "ja", source: "../e2r-spec/examples/lighthouse-restoration-demo.ja.e2r.json", surface: "acceptance" },
  { id: "apollo-en", locale: "en", source: "../e2r-spec/examples/apollo-11-mission.en.e2r.json", surface: "acceptance" },
  { id: "apollo-ja", locale: "ja", source: "../e2r-spec/examples/apollo-11-mission.ja.e2r.json", surface: "acceptance" },
  { id: "titanic-en", locale: "en", source: "../e2r-spec/examples/titanic-final-voyage.en.e2r.json", surface: "acceptance" },
  { id: "label-heavy-ja-10", locale: "ja", source: "synthetic:label-heavy-ja-10", surface: "synthetic" },
  { id: "dense-k7-7", locale: "en", source: "synthetic:k7-7", surface: "synthetic" },
];

function cleanEnvironment(extra: Record<string, string>) {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) if (key.startsWith("E2R_")) delete environment[key];
  return { ...environment, E2R_PRESENTATION_GEOMETRY_CACHE: "1", E2R_PRESENTATION_EXACT_CANDIDATE_REUSE: "1", E2R_RELAXATION_FINAL_CANONICALIZATION: "round-once", ...extra };
}

function runSearch(fixture: Fixture, arm: "post" | "global-placement3" | "frontier-12") {
  let fixturePath = fixture.source;
  let temporaryPath: string | null = null;
  if (fixture.source === "synthetic:label-heavy-ja-10") {
    temporaryPath = path.join(outputDirectory, `.tmp-${fixture.id}.json`);
    fs.mkdirSync(outputDirectory, { recursive: true });
    fs.writeFileSync(temporaryPath, JSON.stringify(labelHeavyJa()));
    fixturePath = temporaryPath;
  } else if (!fixture.source.startsWith("synthetic:")) fixturePath = path.resolve(root, fixture.source);
  const environment = arm === "frontier-12"
    ? { E2R_GLOBAL_PLACEMENT_ABLATION: "frontier-12", E2R_GLOBAL_PLACEMENT_MODE: "viewport-anisotropic", E2R_GLOBAL_SPACING_SCALE: ".88", E2R_GLOBAL_SPACING_Y: "1.12", E2R_GLOBAL_SPACING_STAGE2: "off" }
    : arm === "global-placement3"
      ? { E2R_GLOBAL_PLACEMENT_MODE: "viewport-anisotropic", E2R_GLOBAL_SPACING_SCALE: ".88", E2R_GLOBAL_SPACING_Y: "1.12", E2R_GLOBAL_SPACING_STAGE2: "off" }
      : {};
  const started = performance.now();
  const child = spawnSync(process.execPath, ["tools/generic-crossing-search.mjs", fixturePath], { cwd: root, encoding: "utf8", env: cleanEnvironment(environment), maxBuffer: 100 * 1024 * 1024, timeout: 30_000, killSignal: "SIGTERM" });
  if (temporaryPath) fs.rmSync(temporaryPath, { force: true });
  if (child.error?.code === "ETIMEDOUT") throw new Error(`${fixture.id}/${arm}: bounded search timed out`);
  if (child.status !== 0) throw new Error(`${fixture.id}/${arm}: ${child.stderr || child.error || `exit ${child.status}`}`);
  const result = JSON.parse(child.stdout) as { graph: { nodes: number; edges: number }; candidates?: Array<unknown>; selected: { family: string; positions: Record<string, Point>; metrics?: Record<string, unknown> }; selectedPositionFingerprint: string; profile: { fullPresentationEvaluations: number; presentationMs: number }; elapsedMs: number; searchBudget: Record<string, unknown> };
  return { lineage: arm, source: "current-source reconstruction", elapsedMs: Math.round(performance.now() - started), searchElapsedMs: result.elapsedMs, graph: result.graph, candidateCount: result.candidates?.length ?? 0, evaluationCount: result.profile.fullPresentationEvaluations, presentationMs: result.profile.presentationMs, selectedFamily: result.selected.family, selectedPositionFingerprint: result.selectedPositionFingerprint ?? fingerprint(result.selected.positions), selectedMetrics: result.selected.metrics ?? null, positions: result.selected.positions, searchBudget: result.searchBudget };
}

function fingerprint(positions: Record<string, Point>) { return createHash("sha256").update(JSON.stringify(Object.entries(positions).sort(([left], [right]) => left.localeCompare(right)))).digest("hex").slice(0, 12); }

const rows = fixtures.map((fixture) => {
  const prior = priorArtifact.rows.find(({ fixture: id }) => id === fixture.id);
  if (!prior) throw new Error(`Missing Frontier baseline for ${fixture.id}`);
  const frontier = { lineage: "frontier-12", source: "current-source Frontier-12 materialization from Frontier Actual-Product Visual Sweep 1", elapsedMs: prior.elapsedMs, searchElapsedMs: null, graph: null, candidateCount: prior.candidateCount, evaluationCount: prior.evaluationCount, presentationMs: prior.presentationMs, selectedFamily: prior.selectedFamily, selectedPositionFingerprint: prior.selectedPositionFingerprint, selectedMetrics: prior.selectedMetrics, positions: prior.positions, searchBudget: { globalPlacementAblation: "frontier-12" } };
  return { fixture: fixture.id, locale: fixture.locale, source: fixture.source, surface: fixture.surface, candidates: { frontier, g3: runSearch(fixture, "global-placement3"), post: runSearch(fixture, "post") } };
});

const artifact = { contract: "LIAISONSCAPE-FRONTIER-G3-POST-CURRENT-SOURCE-ACTUAL-PRODUCT-COMPARISON-1", diagnosticOnly: true, fixtureIdentity: "same current Dataset source, topology, Entity/Relation IDs, labels, locale, Product renderer, and Product authorities per row", candidateIdentity: "Frontier, G3, and Post are current-source reconstructions; no historical artifact replay and no Fast baseline", lineageDefinitions: { frontier: "Frontier-12 current-source materialization from the preceding sweep", g3: "Global Placement 3 current-source environment: viewport-anisotropic .88 / 1.12 spacing with Stage 2 off", post: "current-source generic-crossing-search default post-structural relaxation" }, visualInspectionRequired: true, productAuthoritiesChanged: false, rows, interpretationPending: true, readiness: { humanReview: "NOT READY", qualitySolver: "HOLD / NOT ESTABLISHED", productionProvider: "NOT ESTABLISHED", productIntegration: "HOLD", initialLayoutReleaseBlocker: "OPEN" } };
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, "result-summary.json"), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify(rows.map(({ fixture, candidates }) => ({ fixture, candidates: Object.fromEntries(Object.entries(candidates).map(([name, candidate]) => [name, { selectedFamily: candidate.selectedFamily, selectedPositionFingerprint: candidate.selectedPositionFingerprint, elapsedMs: candidate.elapsedMs, candidateCount: candidate.candidateCount, evaluationCount: candidate.evaluationCount, presentationMs: candidate.presentationMs, metrics: candidate.selectedMetrics ? { crossings: candidate.selectedMetrics.crossings, overlapPairs: candidate.selectedMetrics.overlapPairs, minimumSeparation: candidate.selectedMetrics.minimumSeparation, extent: candidate.selectedMetrics.extent, fitScale: candidate.selectedMetrics.fitScale, labelRouteHits: candidate.selectedMetrics.labelRouteHits, labelNear20: candidate.selectedMetrics.labelNear20, labelOverlap: candidate.selectedMetrics.labelOverlap, routeMedian: candidate.selectedMetrics.routeMedian, routeMax: candidate.selectedMetrics.routeMax } : null }])) })), null, 2));
