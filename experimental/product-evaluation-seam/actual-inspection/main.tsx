import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../../../src/App";
import "../../../src/styles.css";
import "./actual-inspection.css";

const diagnosticDatasetUrl = "https://diagnostic.liaisonscape.invalid/apollo-11-product-inspection.en.e2r.json";
const spacingVariant = new URL(window.location.href).searchParams.get("spacing") ?? "control";
const allowedSpacingVariants = new Set(["control", "108", "120", "132", "144"]);
const selectedSpacingVariant = allowedSpacingVariants.has(spacingVariant) ? spacingVariant : "control";
const localDatasetUrl = `${import.meta.env.BASE_URL}experimental/product-evaluation-seam/actual-inspection/fixtures/apollo-11-spacing-${selectedSpacingVariant}.en.e2r.json`;
const originalFetch = window.fetch.bind(window);

window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const requestedUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (requestedUrl === diagnosticDatasetUrl) return originalFetch(localDatasetUrl, init);
  return originalFetch(input, init);
}) as typeof window.fetch;

if (!window.location.hash.includes("datasetUrl=")) {
  window.location.hash = `datasetUrl=${encodeURIComponent(diagnosticDatasetUrl)}`;
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
      </select></label>
      <span className="actual-inspection-seam-note">Reloads the actual Product workspace with the selected diagnostic fixture.</span>
    </div>
    <App />
  </>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><ActualProductInspection /></StrictMode>);
