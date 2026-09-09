import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "../../../src/App";
import type { DragPointerProcessingSample, PresentationDiagnosticSnapshot, PresentationTimingSample } from "../../../src/presentation-diagnostics";
import "../../../src/styles.css";
import "./actual-inspection.css";
import { diagnoseRoute } from "./routing-diagnostics";

const diagnosticDatasetUrl = "https://diagnostic.liaisonscape.invalid/apollo-11-product-inspection.en.e2r.json";
const spacingVariant = new URL(window.location.href).searchParams.get("spacing") ?? "control";
const allowedSpacingVariants = new Set(["control", "108", "120", "132", "144", "160", "180", "200", "220"]);
const selectedSpacingVariant = allowedSpacingVariants.has(spacingVariant) ? spacingVariant : "control";
const localDatasetUrl = `${import.meta.env.BASE_URL}experimental/product-evaluation-seam/actual-inspection/fixtures/apollo-11-spacing-${selectedSpacingVariant}.en.e2r.json`;
const originalFetch = window.fetch.bind(window);
const diagnosticEvent = "liaisonscape:presentation-diagnostic";
let latestDiagnosticSnapshot: PresentationDiagnosticSnapshot | null = null;

type DragTimingReport = {
  nodeId: string;
  pointerMoves: number;
  presentationComputations: number;
  presentationDurationMs: { median: number; p95: number; max: number } | null;
  renderSamples: number;
  pointerToRenderMs: { median: number; p95: number; max: number } | null;
  processedToRenderMs: { median: number; p95: number; max: number } | null;
  pointerToNodeLagPx: { median: number; p95: number; max: number } | null;
  eventAgeMs: { median: number; p95: number; max: number } | null;
  processingAgeMs: { median: number; p95: number; max: number } | null;
  latestVsProcessedPointerPx: { median: number; p95: number; max: number } | null;
  coalescedEvents: number;
  longTaskDurationsMs: number[];
  durationMs: number;
};

type ActiveDragTiming = {
  pointerId: number;
  nodeId: string;
  startedAt: number;
  pointerMoves: number;
  computationDurations: number[];
  renderLatencies: number[];
  processedRenderLatencies: number[];
  nodeLagPixels: number[];
  eventAges: number[];
  processingAges: number[];
  latestVsProcessedPointerPixels: number[];
  coalescedEvents: number;
  longTaskDurationsMs: number[];
  latestPointer: { x: number; y: number };
  latestPointerAt: number;
  latestProcessedAt: number;
  grabOffset: { x: number; y: number };
  framePending: boolean;
};

let activeDragTiming: ActiveDragTiming | null = null;
let latestDragTimingReport: DragTimingReport | null = null;
const timingEvent = "liaisonscape:presentation-timing";

function percentile(values: number[], ratio: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))]!;
}

function summary(values: number[]): { median: number; p95: number; max: number } | null {
  if (!values.length) return null;
  return { median: percentile(values, 0.5)!, p95: percentile(values, 0.95)!, max: Math.max(...values) };
}

function performanceTimeStamp(timeStamp: number): number | null {
  if (!Number.isFinite(timeStamp)) return null;
  const now = performance.now();
  const relative = Math.abs(now - timeStamp) < 86400000 ? timeStamp : timeStamp - performance.timeOrigin;
  return Number.isFinite(relative) ? relative : null;
}

function nodeCenter(nodeId: string): { x: number; y: number } | null {
  const element = document.querySelector<SVGGElement>(`g[data-entity-id="${CSS.escape(nodeId)}"]`);
  if (!element) return null;
  const rect = element.querySelector<SVGRectElement>(".entity-body")?.getBoundingClientRect();
  if (!rect) return null;
  return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
}

function sampleRenderedDrag(): void {
  const drag = activeDragTiming;
  if (!drag) return;
  drag.framePending = false;
  const center = nodeCenter(drag.nodeId);
  if (center) {
    const expected = { x: drag.latestPointer.x + drag.grabOffset.x, y: drag.latestPointer.y + drag.grabOffset.y };
    drag.nodeLagPixels.push(Math.hypot(center.x - expected.x, center.y - expected.y));
    drag.renderLatencies.push(performance.now() - drag.latestPointerAt);
    drag.processedRenderLatencies.push(performance.now() - drag.latestProcessedAt);
  }
}

function scheduleRenderedDragSample(): void {
  const drag = activeDragTiming;
  if (!drag || drag.framePending) return;
  drag.framePending = true;
  window.requestAnimationFrame(() => window.requestAnimationFrame(sampleRenderedDrag));
}

function finishDragTiming(): void {
  const drag = activeDragTiming;
  if (!drag) return;
  activeDragTiming = null;
  latestDragTimingReport = {
    nodeId: drag.nodeId,
    pointerMoves: drag.pointerMoves,
    presentationComputations: drag.computationDurations.length,
    presentationDurationMs: summary(drag.computationDurations),
    renderSamples: drag.renderLatencies.length,
    pointerToRenderMs: summary(drag.renderLatencies),
    processedToRenderMs: summary(drag.processedRenderLatencies),
    pointerToNodeLagPx: summary(drag.nodeLagPixels),
    eventAgeMs: summary(drag.eventAges),
    processingAgeMs: summary(drag.processingAges),
    latestVsProcessedPointerPx: summary(drag.latestVsProcessedPointerPixels),
    coalescedEvents: drag.coalescedEvents,
    longTaskDurationsMs: drag.longTaskDurationsMs,
    durationMs: performance.now() - drag.startedAt,
  };
  window.dispatchEvent(new CustomEvent<DragTimingReport>(timingEvent, { detail: latestDragTimingReport }));
}

window.__liaisonScapePresentationTimingSink = (sample: PresentationTimingSample) => {
  if (activeDragTiming) activeDragTiming.computationDurations.push(sample.durationMs);
};

window.__liaisonScapeDragPointerProcessingSink = (sample: DragPointerProcessingSample) => {
  const drag = activeDragTiming;
  if (!drag || drag.nodeId !== sample.nodeId) return;
  drag.latestProcessedAt = sample.processedAt;
  const eventAt = performanceTimeStamp(sample.eventTimeStamp);
  if (eventAt !== null) drag.processingAges.push(sample.processedAt - eventAt);
  drag.latestVsProcessedPointerPixels.push(Math.hypot(drag.latestPointer.x - sample.clientX, drag.latestPointer.y - sample.clientY));
};

const longTaskObserver = typeof PerformanceObserver === "undefined" ? null : new PerformanceObserver((list) => {
  if (!activeDragTiming) return;
  for (const entry of list.getEntries()) activeDragTiming.longTaskDurationsMs.push(entry.duration);
});
try { longTaskObserver?.observe({ type: "longtask", buffered: false }); } catch { /* unsupported in this browser */ }

document.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  const node = (event.target as Element | null)?.closest<SVGGElement>("g[data-entity-id]");
  if (!node) return;
  const nodeId = node.dataset.entityId;
  const center = nodeId ? nodeCenter(nodeId) : null;
  if (!nodeId || !center) return;
  activeDragTiming = {
    pointerId: event.pointerId,
    nodeId,
    startedAt: performance.now(),
    pointerMoves: 0,
    computationDurations: [],
    renderLatencies: [],
    processedRenderLatencies: [],
    nodeLagPixels: [],
    eventAges: [],
    processingAges: [],
    latestVsProcessedPointerPixels: [],
    coalescedEvents: 0,
    longTaskDurationsMs: [],
    latestPointer: { x: event.clientX, y: event.clientY },
    latestPointerAt: performance.now(),
    latestProcessedAt: performance.now(),
    grabOffset: { x: center.x - event.clientX, y: center.y - event.clientY },
    framePending: false,
  };
}, true);

document.addEventListener("pointermove", (event) => {
  const drag = activeDragTiming;
  if (!drag || drag.pointerId !== event.pointerId) return;
  drag.pointerMoves += 1;
  const eventAt = performanceTimeStamp(event.timeStamp);
  if (eventAt !== null) drag.eventAges.push(performance.now() - eventAt);
  drag.coalescedEvents += typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents().length : 1;
  drag.latestPointer = { x: event.clientX, y: event.clientY };
  drag.latestPointerAt = performance.now();
  scheduleRenderedDragSample();
}, true);

document.addEventListener("pointerup", (event) => { if (activeDragTiming?.pointerId === event.pointerId) finishDragTiming(); }, true);
document.addEventListener("pointercancel", (event) => { if (activeDragTiming?.pointerId === event.pointerId) finishDragTiming(); }, true);

window.__liaisonScapePresentationDiagnosticSink = (snapshot) => {
  latestDiagnosticSnapshot = snapshot;
  window.dispatchEvent(new CustomEvent<PresentationDiagnosticSnapshot>(diagnosticEvent, { detail: snapshot }));
};

window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const requestedUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (requestedUrl === diagnosticDatasetUrl) return originalFetch(localDatasetUrl, init);
  return originalFetch(input, init);
}) as typeof window.fetch;

if (!window.location.hash.includes("datasetUrl=")) {
  window.location.hash = `datasetUrl=${encodeURIComponent(diagnosticDatasetUrl)}`;
}

function distance(value: number | null | undefined) {
  return value === null || value === undefined ? "n/a" : value.toFixed(1);
}

function DiagnosticMap({ snapshot, routeId }: { snapshot: PresentationDiagnosticSnapshot; routeId: string }) {
  const diagnostic = diagnoseRoute(snapshot, routeId);
  if (!diagnostic) return null;
  const current = diagnostic.variants.find(({ name }) => name === "current")!;
  const straight = diagnostic.variants.find(({ name }) => name === "straight")!;
  const labels = [...snapshot.provisionalNodeLabels, ...snapshot.nodeLabels.map(([, label]) => label)];
  const xValues = [...snapshot.nodes.map((node) => (snapshot.positions[node.id] ?? node).x), ...labels.flatMap((label) => [label.x - label.width / 2, label.x + label.width / 2])];
  const yValues = [...snapshot.nodes.map((node) => (snapshot.positions[node.id] ?? node).y), ...labels.flatMap((label) => [label.y - label.height / 2, label.y + label.height / 2])];
  const minX = Math.min(...xValues) - 48;
  const minY = Math.min(...yValues) - 48;
  const width = Math.max(1, Math.max(...xValues) - minX + 48);
  const height = Math.max(1, Math.max(...yValues) - minY + 48);
  return <svg className="actual-inspection-diagnostic-map" viewBox={`${minX} ${minY} ${width} ${height}`} role="img" aria-label="Derived routing diagnostic map">
    {snapshot.provisionalNodeLabels.map((label, index) => <rect key={`provisional-${snapshot.nodes[index]!.id}`} className="actual-inspection-provisional-label" x={label.x - label.width / 2} y={label.y - label.height / 2} width={label.width} height={label.height} />)}
    {snapshot.nodeLabels.map(([id, label]) => <rect key={`final-${id}`} className="actual-inspection-final-label" x={label.x - label.width / 2} y={label.y - label.height / 2} width={label.width} height={label.height} />)}
    <path className="actual-inspection-straight-route" d={straight.geometry.path} />
    <path className="actual-inspection-current-route" d={current.geometry.path} />
    {diagnostic.crossings.map(({ relationId, point }) => <circle key={relationId} className="actual-inspection-crossing" cx={point.x} cy={point.y} r="5" />)}
    {snapshot.nodes.map((node) => { const position = snapshot.positions[node.id] ?? node; return <g key={node.id}><circle className="actual-inspection-node" cx={position.x} cy={position.y} r="16" /><text className="actual-inspection-node-text" x={position.x} y={position.y - 22}>{node.label}</text></g>; })}
  </svg>;
}

function PresentationDiagnostics() {
  const [snapshot, setSnapshot] = useState<PresentationDiagnosticSnapshot | null>(latestDiagnosticSnapshot);
  const [routeId, setRouteId] = useState("entity-10");
  useEffect(() => {
    const receive = (event: Event) => setSnapshot((event as CustomEvent<PresentationDiagnosticSnapshot>).detail);
    window.addEventListener(diagnosticEvent, receive);
    if (latestDiagnosticSnapshot) setSnapshot(latestDiagnosticSnapshot);
    return () => window.removeEventListener(diagnosticEvent, receive);
  }, []);
  useEffect(() => {
    if (snapshot && !snapshot.edges.some((edge) => edge.id === routeId)) setRouteId(snapshot.edges[0]?.id ?? "");
  }, [routeId, snapshot]);
  useEffect(() => {
    for (const element of document.querySelectorAll(".edge-group.dev-route-diagnostic-selected")) element.classList.remove("dev-route-diagnostic-selected");
    if (!routeId) return;
    document.querySelector(`.edge-group[data-relation-id="${CSS.escape(routeId)}"]`)?.classList.add("dev-route-diagnostic-selected");
  }, [routeId, snapshot]);
  const diagnostic = useMemo(() => snapshot && routeId ? diagnoseRoute(snapshot, routeId) : null, [routeId, snapshot]);
  if (!snapshot || !diagnostic) return <p className="actual-inspection-diagnostic-loading">Loading exact Product presentation snapshot…</p>;
  const current = diagnostic.variants.find(({ name }) => name === "current")!;
  const straight = diagnostic.variants.find(({ name }) => name === "straight")!;
  return <details className="actual-inspection-diagnostics" open>
    <summary>Routing / label diagnostic — derived from the current actual Product state</summary>
    <p className="actual-inspection-diagnostic-note">Dev-only explanation. Orange = provisional node-label bounds used by routing; cyan = final node-label bounds; solid red = current Product route; dotted graphite = straight counterfactual.</p>
    <label>Inspect route <select value={routeId} onChange={(event) => setRouteId(event.target.value)} aria-label="Route diagnostic target">
      {snapshot.edges.map((edge) => {
        const source = snapshot.nodes.find(({ id }) => id === edge.sourceId)?.label ?? edge.sourceId;
        const target = snapshot.nodes.find(({ id }) => id === edge.targetId)?.label ?? edge.targetId;
        return <option key={edge.id} value={edge.id}>{source} → {target} — {edge.label || edge.id}</option>;
      })}
    </select></label>
    <div className="actual-inspection-diagnostic-grid">
      <DiagnosticMap snapshot={snapshot} routeId={routeId} />
      <div>
        <p><strong>{diagnostic.sourceLabel} → {diagnostic.targetLabel}</strong></p>
        <p>Current offset {distance(current.offset)}; straight length {straight.length.toFixed(1)}; current length {current.length.toFixed(1)}.</p>
        <ul>
          {diagnostic.variants.map((variant) => <li key={variant.name}><code>{variant.name}</code>: offset {distance(variant.offset)}, length {variant.length.toFixed(1)}, nearest provisional {variant.nearestProvisionalLabel ? `${variant.nearestProvisionalLabel.id} / ${variant.nearestProvisionalLabel.distance.toFixed(1)}` : "none"}, {variant.matchesCurrent ? "same as current" : "different geometry"}</li>)}
        </ul>
        <p>Final labels that moved after routing: {diagnostic.provisionalFinalMoves.slice(0, 4).map(({ id, distance: moved }) => `${id} ${moved.toFixed(1)}`).join(", ") || "none"}.</p>
        <p>Non-adjacent sampled crossings on this route: {diagnostic.crossings.map(({ relationId }) => relationId).join(", ") || "none"}.</p>
        <ul>{diagnostic.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      </div>
    </div>
  </details>;
}

function DragTimingDiagnostics() {
  const [report, setReport] = useState<DragTimingReport | null>(latestDragTimingReport);
  useEffect(() => {
    const receive = (event: Event) => setReport((event as CustomEvent<DragTimingReport>).detail);
    window.addEventListener(timingEvent, receive);
    return () => window.removeEventListener(timingEvent, receive);
  }, []);
  const format = (value: number | null | undefined, digits = 1) => value === null || value === undefined ? "n/a" : value.toFixed(digits);
  return <details className="actual-inspection-drag-timing" open>
    <summary>Dev-only drag timing diagnostic</summary>
    {report ? <p><strong>{report.nodeId}</strong>: {report.pointerMoves} pointermoves, {report.presentationComputations} presentation computations, {report.renderSamples} render samples, duration {format(report.durationMs)} ms.</p> : <p>No completed node drag measured yet.</p>}
    {report && <ul>
      <li>presentation duration median / p95 / max: {format(report.presentationDurationMs?.median)} / {format(report.presentationDurationMs?.p95)} / {format(report.presentationDurationMs?.max)} ms</li>
      <li>pointer→render median / p95 / max: {format(report.pointerToRenderMs?.median)} / {format(report.pointerToRenderMs?.p95)} / {format(report.pointerToRenderMs?.max)} ms</li>
      <li>processed pointer→render median / p95 / max: {format(report.processedToRenderMs?.median)} / {format(report.processedToRenderMs?.p95)} / {format(report.processedToRenderMs?.max)} ms</li>
      <li>pointer→node lag median / p95 / max: {format(report.pointerToNodeLagPx?.median)} / {format(report.pointerToNodeLagPx?.p95)} / {format(report.pointerToNodeLagPx?.max)} px</li>
      <li>event age / processing age median: {format(report.eventAgeMs?.median)} / {format(report.processingAgeMs?.median)} ms; latest-vs-processed pointer max: {format(report.latestVsProcessedPointerPx?.max)} px; coalesced samples: {report.coalescedEvents}</li>
      <li>Long Tasks during drag: {report.longTaskDurationsMs.length ? report.longTaskDurationsMs.map((duration) => `${duration.toFixed(1)} ms`).join(", ") : "none observed"}</li>
    </ul>}
  </details>;
}

function ActualProductInspection() {
  function changeSpacing(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value;
    window.location.href = `${window.location.pathname}?spacing=${encodeURIComponent(next)}`;
  }

  return <>
    <div className="actual-inspection-seam" aria-label="Diagnostic fixture controls">
      <span>Dev-only fixture input</span>
      <label>Spacing <select value={selectedSpacingVariant} onChange={changeSpacing} aria-label="Spacing candidate">
        <option value="control">control / 96</option>
        <option value="108">108</option>
        <option value="120">120</option>
        <option value="132">132</option>
        <option value="144">144</option>
        <option value="160">160</option>
        <option value="180">180</option>
        <option value="200">200</option>
        <option value="220">220</option>
      </select></label>
      <span className="actual-inspection-seam-note">Reloads the actual Product workspace with the selected diagnostic fixture.</span>
    </div>
    <PresentationDiagnostics />
    <DragTimingDiagnostics />
    <App />
  </>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><ActualProductInspection /></StrictMode>);
