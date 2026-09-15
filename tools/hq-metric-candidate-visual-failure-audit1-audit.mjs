import assert from "node:assert/strict";
import fs from "node:fs";

const result = JSON.parse(fs.readFileSync("experimental/hq-metric-candidate-visual-failure-audit1/result-summary.json", "utf8"));
const visual = JSON.parse(fs.readFileSync("experimental/hq-metric-candidate-visual-failure-audit1/visual-smoke-summary.json", "utf8"));
assert.equal(result.classification, "C. METRIC AND CANDIDATE FORMULATION BOTH INSUFFICIENT");
assert.equal(result.metricMutation, false);
assert.equal(result.candidateGenerationMutation, false);
assert.equal(result.rows.length, 4);
assert.ok(result.rows.every((row) => row.candidates.length === row.candidateCount));
assert.ok(result.rows.find((row) => row.fixture === "dense").visualRiskDelta.totalLabelOverlapPairs < 0);
assert.ok(result.rows.find((row) => row.fixture === "label").visualRiskDelta.foreignRouteRelationLabelHits < 0);
assert.equal(visual.actualProductSurface, true);
assert.equal(visual.formalHumanReview, false);
assert.equal(visual.reviewedCandidates.filter(({ result }) => result === "FAIL").length, 4);
assert.equal(visual.reviewedCandidates.find(({ fixture }) => fixture === "self-loop").result, "PASS_SMOKE_ONLY");
console.log(JSON.stringify({ status: "PASS", classification: result.classification }));
