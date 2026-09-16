import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../../../src/App.tsx";
import "../../../src/styles.css";
import { fingerprintPreviewPositions } from "../../../src/operation-local-product-preview.ts";
import priorArtifact from "../../product-node-label-relation-presentation-first-angular-escape1/result-summary.json";
import type { LabelRect, Point } from "../../../src/viewport.ts";

type Row = {
  fixture: string;
  dataset: unknown;
  positions: Record<string, Point>;
  arms: Record<string, { nodeLabels: Record<string, LabelRect> }>;
};

const params = new URLSearchParams(location.search);
const fixtureId = params.get("fixture") ?? "horizontal-label-capacity";
const armId = params.get("arm") ?? "current-previous";
const seed = params.get("seed") ?? "none";
const row = (priorArtifact.rows as Row[]).find(({ fixture }) => fixture === fixtureId);
if (!row) throw new Error(`Unknown recovery lifecycle fixture: ${fixtureId}`);
const previous = seed === "prior" ? row.arms[armId]?.nodeLabels : undefined;
if (seed === "prior" && !previous) throw new Error(`Unknown recovery lifecycle seed arm: ${armId}`);
const normalOffsets = params.get("relation-change") === "1" ? [-12, 0, 12] : undefined;
window.__liaisonScapeNodeLabelLifecycleEvents = [];
window.__liaisonScapeNodeLabelLifecycleSink = () => undefined;
const preview = {
  operationId: 1,
  generation: 1,
  snapshotIdentity: `product-node-label-recovery-lifecycle-source-parity1-${fixtureId}-${seed}`,
  candidateFingerprint: fingerprintPreviewPositions(row.positions),
  positions: row.positions,
};
document.title = `recovery lifecycle / ${fixtureId}`;

createRoot(document.getElementById("root")!).render(<StrictMode><App
  diagnosticDataset={row.dataset as never}
  operationLocalPreview={preview}
  diagnosticFeedbackEnabled={true}
  diagnosticNodeLabelRecoveryEnabled={true}
  diagnosticPreviousNodeLabelPlacements={previous}
  relationLabelNormalOffsets={normalOffsets}
/></StrictMode>);
