import { spawnSync } from "node:child_process";
import fs from "node:fs";

const cells = ["lighthouse-restoration-demo", "titanic-final-voyage", "apollo-11-mission"]
  .flatMap((fixture) => ["en", "ja"].map((locale) => `../e2r-spec/examples/${fixture}.${locale}.e2r.json`))
  .concat(["synthetic:k7-7", "synthetic:k6-8", "synthetic:k8-8", "synthetic:k5-9", "synthetic:k7-7-minus-one"]);
const rows = [];
for (const fixture of cells) {
  for (const arm of ["structural-native-v3", fixture.startsWith("synthetic:") ? "frontier-adaptive-12" : "frontier-12"]) {
    const run = spawnSync(process.execPath, ["tools/generic-crossing-search.mjs", fixture], {
      encoding: "utf8", maxBuffer: 100 * 1024 * 1024,
      env: { ...process.env, E2R_GLOBAL_PLACEMENT_ABLATION: arm, E2R_GLOBAL_PLACEMENT_MODE: "viewport-anisotropic", E2R_GLOBAL_SPACING_SCALE: ".88", E2R_GLOBAL_SPACING_Y: "1.12", E2R_GLOBAL_SPACING_STAGE2: "off", E2R_RELAXATION_FINAL_CANONICALIZATION: "round-once", E2R_PRESENTATION_GEOMETRY_CACHE: "1", E2R_PRESENTATION_EXACT_CANDIDATE_REUSE: "1" },
    });
    if (run.status !== 0) throw new Error(run.stderr || String(run.error));
    const output = JSON.parse(run.stdout);
    const keys = ["score", "crossings", "labelRouteHits", "labelNear20", "labelOverlap", "overlapPairs", "minimumSeparation", "extent", "aspectRatio", "fitScale", "routeMedian", "routeMax", "screenSpace"];
    const row = { fixture, arm, graph: output.graph, elapsedMs: output.elapsedMs, fullPresentationEvaluations: output.profile.fullPresentationEvaluations, family: output.selected.family, fingerprint: output.selectedPositionFingerprint, digest: output.selectedPresentation.digest, metrics: Object.fromEntries(keys.map((key) => [key, output.selected.metrics[key]])), positions: output.selected.positions, candidates: output.candidates.map((candidate) => ({ family: candidate.family, cheap: candidate.cheap, metrics: Object.fromEntries(keys.map((key) => [key, candidate.metrics[key]])) })) };
    rows.push(row); console.log(JSON.stringify({ ...row, positions: undefined, candidates: undefined }));
  }
}
fs.mkdirSync("experimental/structural-formulation3", { recursive: true });
fs.writeFileSync("experimental/structural-formulation3/audit.json", `${JSON.stringify(rows, null, 2)}\n`);
