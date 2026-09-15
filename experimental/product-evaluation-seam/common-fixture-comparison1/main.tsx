import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../../../src/App.tsx";
import "../../../src/styles.css";
import { acceptanceFixturePath } from "../../../src/acceptance-fixture-access.ts";
import { fingerprintPreviewPositions } from "../../../src/operation-local-product-preview.ts";
import artifact from "../../common-fixture-cross-lineage-comparison1/result-summary.json";

type Point = { x: number; y: number };
type ComparisonRow = {
  fixture: string;
  candidates: {
    post: { positions: Record<string, Point> };
    fast: { positions: Record<string, Point> };
    labelCapacity: { positions: Record<string, Point> };
    occupiedGeometry: { positions: Record<string, Point> };
  };
};

const params = new URLSearchParams(location.search);
const requested = params.get("candidate");
const row = (artifact.rows as ComparisonRow[]).find(({ fixture }) => fixture === "lighthouse-en")!;
const candidate = requested === "label-capacity"
  ? row.candidates.labelCapacity
  : requested === "occupied-geometry"
    ? row.candidates.occupiedGeometry
    : requested === "fast"
      ? row.candidates.fast
      : row.candidates.post;
const response = await fetch(`${import.meta.env.BASE_URL}${acceptanceFixturePath({ name: "lighthouse", locale: "en" }).replace(/^\//, "")}`);
if (!response.ok) throw new Error(`Common-fixture smoke fixture failed: ${response.status}`);
const dataset = await response.json();
const preview = {
  operationId: 1,
  generation: 1,
  snapshotIdentity: `common-fixture-comparison1-${requested ?? "post-structural"}`,
  candidateFingerprint: fingerprintPreviewPositions(candidate.positions),
  positions: candidate.positions,
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App diagnosticDataset={dataset} operationLocalPreview={preview} />
  </StrictMode>,
);
