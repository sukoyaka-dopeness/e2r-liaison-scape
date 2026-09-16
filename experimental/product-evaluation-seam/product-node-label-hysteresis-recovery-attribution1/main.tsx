import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../../../src/App.tsx";
import "../../../src/styles.css";
import { fingerprintPreviewPositions } from "../../../src/operation-local-product-preview.ts";
import artifact from "../../product-node-label-hysteresis-recovery-attribution1/result-summary.json";
import type { LabelRect, Point } from "../../../src/viewport.ts";

type Arm = "current-fresh" | "current-previous" | "hysteresis-ablation" | "bounded-recovery" | "drag-finalized";
type Row = {
  fixture: string;
  dataset: unknown;
  positions: Record<string, Point>;
  productDerivedPrevious: Record<string, LabelRect>;
  arms: Record<Arm, { labels: Record<string, LabelRect> }>;
};

const params = new URLSearchParams(location.search);
const fixtureId = params.get("fixture") ?? "horizontal-label-capacity";
const arm = (params.get("arm") ?? "bounded-recovery") as Arm;
const row = (artifact.rows as Row[]).find(({ fixture }) => fixture === fixtureId);
if (!row) throw new Error(`Unknown hysteresis fixture: ${fixtureId}`);
if (!row.arms[arm]) throw new Error(`Unknown hysteresis arm: ${arm}`);

const preview = {
  operationId: 1,
  generation: 1,
  snapshotIdentity: `product-node-label-hysteresis-recovery-attribution1-${fixtureId}-${arm}`,
  candidateFingerprint: fingerprintPreviewPositions(row.positions),
  positions: row.positions,
};
const usesPrevious = arm !== "current-fresh";
const usesOverride = arm === "bounded-recovery" || arm === "drag-finalized";
document.title = `${arm} / ${fixtureId}`;

createRoot(document.getElementById("root")!).render(<StrictMode><App
  diagnosticDataset={row.dataset as never}
  operationLocalPreview={preview}
  diagnosticFeedbackEnabled={false}
  diagnosticPreviousNodeLabelPlacements={usesPrevious ? row.productDerivedPrevious : undefined}
  diagnosticIgnoreNodeLabelMovementCost={arm === "hysteresis-ablation"}
  diagnosticNodeLabelOverrideById={usesOverride ? row.arms[arm].labels : undefined}
/></StrictMode>);
