import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "../../../src/App.tsx";
import { fingerprintPreviewPositions } from "../../../src/operation-local-product-preview.ts";
import type { PresentationTimingSample } from "../../../src/presentation-diagnostics.ts";
import type { DenseFixture } from "../../product-node-label-recovery-dense-browser-feasibility1/fixtures.ts";
import { denseBrowserFixtures } from "../../product-node-label-recovery-dense-browser-feasibility1/fixtures.ts";
import "../../../src/styles.css";

const fixtures = denseBrowserFixtures();
const params = new URLSearchParams(location.search);
const fixtureId = params.get("fixture") ?? "lighthouse";
const fixture = fixtures.find(({ id }) => id === fixtureId) ?? fixtures[0]!;
const candidate = params.get("node-label-recovery") === "candidate";

type BrowserEvidence = {
  fixture: string;
  mode: "baseline" | "product-candidate";
  startedAt: number;
  timingEvents: PresentationTimingSample[];
  longTasks: number[];
  rafGaps: number[];
  intervalGaps: number[];
  mutationTimes: number[];
  controls: Array<{ name: string; at: number }>;
};

const evidence: BrowserEvidence = {
  fixture: fixture.id,
  mode: candidate ? "product-candidate" : "baseline",
  startedAt: performance.now(),
  timingEvents: [],
  longTasks: [],
  rafGaps: [],
  intervalGaps: [],
  mutationTimes: [],
  controls: [],
};
const evidenceElement = document.createElement("pre");
evidenceElement.id = "browser-evidence";
evidenceElement.style.display = "none";
document.body.appendChild(evidenceElement);
const writeEvidence = () => {
  const max = (values: number[]) => Math.max(0, ...values);
  evidenceElement.textContent = JSON.stringify({
    fixture: evidence.fixture,
    mode: evidence.mode,
    timingEvents: evidence.timingEvents.map((sample) => ({
      durationMs: sample.durationMs,
      activeNodeDrag: sample.activeNodeDrag,
      feedbackApplied: sample.feedbackApplied,
      nodeLabelMs: Object.values(sample.profiler?.passes ?? {}).reduce((sum, pass) => sum + pass.nodeLabelMs, 0),
      relationLabelMs: Object.values(sample.profiler?.passes ?? {}).reduce((sum, pass) => sum + pass.relationLabelMs, 0),
      routeDecisions: Object.values(sample.profiler?.passes ?? {}).reduce((sum, pass) => sum + pass.routeDecisions, 0),
      recoveryComparisonMs: Object.values(sample.profiler?.passes ?? {}).reduce((sum, pass) => sum + pass.nodeLabel.recoveryComparisonMs, 0),
      recoveryCandidateRows: Object.values(sample.profiler?.passes ?? {}).reduce((sum, pass) => sum + pass.nodeLabel.recoveryCandidateRows, 0),
    })),
    longTaskMax: max(evidence.longTasks),
    rafGapMax: max(evidence.rafGaps),
    intervalGapMax: max(evidence.intervalGaps),
    mutationCount: evidence.mutationTimes.length,
    controls: evidence.controls,
  });
};
(window as Window & { __productNodeLabelRecoveryDenseEvidence?: BrowserEvidence }).__productNodeLabelRecoveryDenseEvidence = evidence;
window.__liaisonScapePresentationTimingSink = (sample) => { evidence.timingEvents.push(sample); writeEvidence(); };

let lastRaf: number | null = null;
let lastInterval: number | null = null;
const rafLoop = (at: number) => { if (lastRaf !== null) evidence.rafGaps.push(at - lastRaf); lastRaf = at; requestAnimationFrame(rafLoop); };
requestAnimationFrame(rafLoop);
window.setInterval(() => { const at = performance.now(); if (lastInterval !== null) evidence.intervalGaps.push(at - lastInterval); lastInterval = at; writeEvidence(); }, 10);
if (typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes.includes("longtask")) {
  new PerformanceObserver((list) => { for (const entry of list.getEntries()) evidence.longTasks.push(entry.duration); writeEvidence(); }).observe({ type: "longtask", buffered: true });
}
new MutationObserver(() => evidence.mutationTimes.push(performance.now())).observe(document.body, { childList: true, subtree: true, attributes: true });

function PreviewHarness({ selected }: { selected: DenseFixture }) {
  const [generation, setGeneration] = useState(1);
  const [relationChanged, setRelationChanged] = useState(false);
  const preview = {
    operationId: 1,
    generation,
    snapshotIdentity: `product-node-label-recovery-dense-browser-feasibility1-${selected.id}-${generation}`,
    candidateFingerprint: fingerprintPreviewPositions(selected.positions),
    positions: selected.positions,
  };
  const control = (name: string, callback: () => void) => () => { evidence.controls.push({ name, at: performance.now() }); writeEvidence(); callback(); };
  return <>
    <section data-diagnostic="product-node-label-recovery-dense-browser-feasibility1" style={{ position: "fixed", zIndex: 10, top: 8, left: 8, background: "#fff", padding: 8, border: "1px solid #bbb" }}>
      <strong>{selected.id} / {candidate ? "candidate" : "baseline"}</strong>
      <button id="recompute-same" onClick={control("recompute-same", () => setGeneration((value) => value + 1))}>Recompute same</button>
      <button id="relation-change" onClick={control("relation-change", () => { setRelationChanged((value) => !value); setGeneration((value) => value + 1); })}>Relation change</button>
    </section>
    <App diagnosticDataset={selected.dataset as never} operationLocalPreview={preview} relationLabelNormalOffsets={relationChanged ? [-12, 0, 12] : undefined} />
  </>;
}

document.title = `Product node-label recovery dense / ${fixture.id} / ${candidate ? "candidate" : "baseline"}`;
createRoot(document.getElementById("root")!).render(<StrictMode><PreviewHarness selected={fixture} /></StrictMode>);
