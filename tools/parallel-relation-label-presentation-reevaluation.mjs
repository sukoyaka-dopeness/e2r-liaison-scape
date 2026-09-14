// Reproducible checkpoint wrapper around the existing Product-authoritative
// Parallel / Relation-label attribution audit. It records the comparison
// without changing the Product route or label authorities.
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const run = spawnSync(process.execPath, ["tools/parallel-bundle-attribution-audit.mjs"], {
  encoding: "utf8",
  maxBuffer: 100 * 1024 * 1024,
  env: { ...process.env, E2R_PARALLEL_AUDIT_SUMMARY: "2" },
});
if (run.status !== 0) throw new Error(run.stderr || String(run.error));

const rows = JSON.parse(run.stdout);
const artifact = {
  contract: "PARALLEL-RELATION-LABEL-PRESENTATION-REEVALUATION-v1",
  diagnosticOnly: true,
  authority: {
    routing: "Product-owned deriveBoundedAutomaticPresentation",
    relationLabels: "Product-owned final Relation-label placement",
    endpointPlan: "existing bounded endpoint-plan evaluator",
    structuralPlacement: "fixed input geometry / counterfactual only",
  },
  method: {
    canonical: "six EN/JA canonical cells",
    difficult: "Titanic EN/JA and Product endpoint-plan shortage states",
    synthetic: "long labels, reverse direction, multiple ordinary incidents, shared bundles, conflicting bundles, mirror, rotation",
    measured: "crossings, lane separation, label clearance, ownership margin, outer ordinary clearance, side bias, obstacle influence, ordinary route changes, endpoint angular capacity, deterministic Product evaluation",
    smokeCheck: "Actual Product ECR3 surface inspected for Titanic JA corridor-aware and Titanic EN pair/bundle comparison; no formal acceptance claimed",
  },
  rows,
};

fs.mkdirSync("experimental/parallel-relation-label-presentation-reevaluation", { recursive: true });
fs.writeFileSync("experimental/parallel-relation-label-presentation-reevaluation/audit.json", `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify(rows.map(({ cell, arms }) => ({
  cell,
  arms: arms.map(({ arm, crossings, lane, label, ownership, outer, bias, obstacles, angle, ordinaryChanges, deterministic }) => ({ arm, crossings, lane, label, ownership, outer, bias, obstacles, angle, ordinaryChanges, deterministic })),
})), null, 2));
