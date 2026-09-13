import { spawnSync } from "node:child_process";
import fs from "node:fs";
const cells = ["lighthouse-restoration-demo", "titanic-final-voyage", "apollo-11-mission"].flatMap((fixture) => ["en", "ja"].map((locale) => `../e2r-spec/examples/${fixture}.${locale}.e2r.json`));
const rows = cells.map((fixture) => {
  const run = spawnSync(process.execPath, ["tools/generic-crossing-search.mjs", fixture], { encoding: "utf8", maxBuffer: 100 * 1024 * 1024, env: { ...process.env, E2R_GLOBAL_PLACEMENT_ABLATION: "structural-native-discrete", E2R_GLOBAL_PLACEMENT_MODE: "viewport-anisotropic", E2R_GLOBAL_SPACING_STAGE2: "off", E2R_RELAXATION_FINAL_CANONICALIZATION: "round-once" } });
  if (run.status !== 0) throw new Error(run.stderr || String(run.error));
  const output = JSON.parse(run.stdout);
  return { fixture, graph: output.graph, family: output.selected.family, evaluations: output.profile.fullPresentationEvaluations, elapsedMs: output.elapsedMs, fingerprint: output.selectedPositionFingerprint, digest: output.selectedPresentation.digest, metrics: output.selected.metrics, candidateCount: output.candidates.length, cheap: output.candidates.find(({ family }) => family === output.selected.family)?.cheap ?? null };
});
fs.mkdirSync("experimental/discrete-placement-feasibility", { recursive: true });
fs.writeFileSync("experimental/discrete-placement-feasibility/product-audit.json", `${JSON.stringify(rows, null, 2)}\n`);
console.log(JSON.stringify(rows.map(({ fixture, graph, family, evaluations, elapsedMs, candidateCount, metrics, cheap }) => ({ fixture, graph, family, evaluations, elapsedMs, candidateCount, crossings: metrics.crossings, labelRouteHits: metrics.labelRouteHits, labelNear20: metrics.labelNear20, overlapPairs: metrics.overlapPairs, fitScale: metrics.fitScale, minimumSeparation: metrics.minimumSeparation, cheap })), null, 2));
