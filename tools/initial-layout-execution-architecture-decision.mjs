import fs from "node:fs";

const rebaselinePath = "experimental/initial-layout-responsibility-rebaseline/audit.json";
const selfLoopPath = "experimental/self-loop-owner-local-pruning-fingerprint/audit.json";
const parallelPath = "experimental/parallel-relation-label-presentation-reevaluation/audit.json";

const read = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const rebaseline = read(rebaselinePath);
const selfLoop = read(selfLoopPath);
const parallel = read(parallelPath);

const placementMedians = rebaseline.cases.map(({ placement }) => placement.medianMs);
const presentationMedians = rebaseline.cases.map(({ presentation }) => presentation.medianMs);
const canonical = rebaseline.cases.filter(({ category }) => category === "canonical");
const dense = rebaseline.cases.filter(({ category }) => category === "dense");

const evidence = {
  rebaselineCases: rebaseline.summary.resultCount,
  deterministicPlacementCases: rebaseline.summary.resultCount - rebaseline.summary.deterministicFailures,
  placementMedianRangeMs: [Math.min(...placementMedians), Math.max(...placementMedians)],
  presentationMedianRangeMs: [Math.min(...presentationMedians), Math.max(...presentationMedians)],
  canonicalPresentationMedianRangeMs: [Math.min(...canonical.map(({ presentation }) => presentation.medianMs)), Math.max(...canonical.map(({ presentation }) => presentation.medianMs))],
  densePresentationMedianRangeMs: [Math.min(...dense.map(({ presentation }) => presentation.medianMs)), Math.max(...dense.map(({ presentation }) => presentation.medianMs))],
  placementOverlapCases: rebaseline.summary.placementOverlapCases,
  presentationCrossingCases: rebaseline.summary.presentationCrossingCases,
  denseRouteCrossings: dense.map(({ id, presentation }) => ({ id, crossings: presentation.routeCrossings, routeLabelHits: presentation.relationLabelRouteHits })),
  selfLoop: {
    correctedSingleLoopFalseNegatives: selfLoop.correction.correctedSingleLoopFalseNegativeCount,
    strategiesPassingOnlyLocalRetainedGate: selfLoop.summary.strategiesPassingFalseNegativeGate,
    strategiesEvaluated: selfLoop.summary.strategiesEvaluated,
    fullDomainEvaluatedGroups: selfLoop.summary.fullDomainEvaluatedGroupCount,
    fullDomainSkippedGroups: selfLoop.summary.fullDomainSkippedGroupCount,
  },
  parallel: {
    caseCount: parallel.rows.length,
    authority: parallel.authority,
    conclusion: "spacing-only retune does not close lane/label/outer-route/obstacle tradeoffs; group-level allocation remains diagnostic",
  },
};

const startupContract = {
  inputAuthority: "stored/authored coordinates remain authoritative; coordinate-less input uses current deterministic derived placement",
  placement: "fixed small deterministic computation with whole-result fallback; no Product-authoritative quality search at startup",
  baselinePresentation: "one bounded current Product routing/label/viewport derivation sufficient to make the graph inspectable",
  readiness: "interaction-ready only after one internally consistent baseline presentation snapshot is committed",
  degradation: "dense graphs may return lower quality, but must not start an unbounded candidate search or silently change authority",
  runtimeRequirement: "placement should remain within a small fixed budget; complete graph-ready latency needs a separately measured browser/main-thread budget",
};

const qualityPhaseContract = {
  trigger: "explicit user operation only",
  inputSnapshot: "Dataset identity/version, current session positions, stored-coordinate authority, manual route/label/Self-loop overrides, and presentation inputs",
  ownership: "proposes Node geometry and coarse spatial/angular capacity only",
  verification: "calls existing ordinary routing, Parallel/Incident, Self-loop, Relation-label, Node-label, endpoint-plan, and viewport authorities iteratively",
  execution: "budgeted asynchronous/cooperatively chunked job; Web Worker is an implementation option, not an adopted requirement",
  cancellation: "generation token plus cooperative cancellation; stale or input-invalidated results are discarded without mutating session state",
  preview: "candidate remains separate from current session positions until explicit acceptance",
  accept: "replaces session positions, marks adopted Entity coordinates and coordinatesDirty, preserves explicit Save Coordinates",
  rejectOrRevert: "restores the pre-operation session snapshot; automatic Dataset persistence is prohibited",
  manualConflict: "manual geometry/presentation edits during a run cancel or invalidate that run; manual route/label/Self-loop authority is retained in verification",
  repeatability: "same input snapshot, algorithm version, and budget policy must produce the same result",
};

const options = [
  {
    id: "A",
    name: "Single Initial Placement / single startup path",
    startupBoundedness: "strong for current placement, incomplete for quality-complete presentation",
    qualityCeiling: "weak: expensive coupled verification must remain in startup and tested bounded compression loses quality/recall",
    coordinateCompatibility: "simple, but every stronger search delays first interaction",
    mainThreadRisk: "high if Product-authoritative candidate evaluation is expanded at startup",
    evidence: "current placement is fast; dense route/label residuals and failed structural/Self-loop compression oppose a quality-complete single path",
    disposition: "HOLD AS QUALITY-COMPLETE ARCHITECTURE; RETAIN AS FAST BASELINE",
  },
  {
    id: "B",
    name: "Fast Initial Placement + explicit High-quality Auto Layout",
    startupBoundedness: "strong: retains current deterministic startup baseline",
    qualityCeiling: "potentially higher: explicit budget permits more Product-authoritative proposal/verification cycles",
    coordinateCompatibility: "compatible with current explicit Auto Layout and Save Coordinates separation if preview/accept/revert is added",
    mainThreadRisk: "manageable only with bounded asynchronous or cooperative execution and cancellation",
    evidence: "runtime separation, existing explicit operation boundary, and downstream coupling support the split; production quality solver is not established",
    disposition: "PROVISIONALLY ADOPT EXECUTION SPLIT / QUALITY SOLVER HOLD",
  },
  {
    id: "C",
    name: "Adaptive Initial Placement Cascade",
    startupBoundedness: "uncertain and input-dependent",
    qualityCeiling: "not shown to exceed explicit quality operation",
    coordinateCompatibility: "adds hidden policy and expectation complexity at startup",
    mainThreadRisk: "risk of variable latency and state-space growth",
    evidence: "no new evidence reactivates the hypothesis",
    disposition: "INACTIVE / INSUFFICIENT EVIDENCE",
  },
];

const artifact = {
  contract: "INITIAL-LAYOUT-EXECUTION-ARCHITECTURE-DECISION-v1",
  diagnosticOnly: true,
  evidence,
  startupContract,
  qualityPhaseContract,
  options,
  decision: {
    executionArchitecture: "B: Fast Initial Placement + explicit High-quality Auto Layout",
    executionDecisionStrength: "PROVISIONALLY ADOPT",
    qualitySolverReadiness: "HOLD / NOT ESTABLISHED",
    productIntegration: "HOLD; no provider/default or behavior change",
    adaptiveCascade: "INACTIVE",
    rationale: [
      "current placement is deterministic and negligible compared with Product presentation cost",
      "quality-complete startup would internalize expensive globally coupled routing/label/endpoint evaluation",
      "existing Product already has an explicit Auto Layout and explicit Save Coordinates boundary",
      "no tested quality solver safely closes dense, Parallel/label, or Self-loop residuals",
    ],
  },
};

fs.mkdirSync("experimental/initial-layout-execution-architecture-decision", { recursive: true });
fs.writeFileSync("experimental/initial-layout-execution-architecture-decision/decision.json", `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ evidence, options: options.map(({ id, name, disposition }) => ({ id, name, disposition })), decision: artifact.decision }, null, 2));
