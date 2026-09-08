import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "../../../src/App";
import type { PresentationDiagnosticSnapshot } from "../../../src/presentation-diagnostics";
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
    <App />
  </>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><ActualProductInspection /></StrictMode>);
