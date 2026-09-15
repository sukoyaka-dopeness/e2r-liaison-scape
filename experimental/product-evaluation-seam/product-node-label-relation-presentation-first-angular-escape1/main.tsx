import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../../../src/App.tsx";
import "../../../src/styles.css";
import { fingerprintPreviewPositions } from "../../../src/operation-local-product-preview.ts";
import artifact from "../../product-node-label-relation-presentation-first-angular-escape1/result-summary.json";

type Point = { x: number; y: number };
type Row = { fixture: string; dataset: unknown; positions: Record<string, Point>; nodeLabelAngularEscapeById: Record<string, { incidentRouteAngles: number[]; relationLabelAngles: number[]; halfAngle: number; incidentWeight: number; relationLabelWeight: number }>; arms: Record<string, unknown> };
const params = new URLSearchParams(location.search);
const fixtureId = params.get("fixture") ?? "horizontal-label-capacity";
const armId = params.get("arm") ?? "angular-fresh";
const row = (artifact.rows as Row[]).find(({ fixture }) => fixture === fixtureId);
if (!row) throw new Error(`Unknown angular-escape fixture: ${fixtureId}`);
if (!row.arms[armId]) throw new Error(`Unknown angular-escape arm: ${armId}`);
const policy = armId.startsWith("angular") ? row.nodeLabelAngularEscapeById : undefined;
const preview = {
  operationId: 1,
  generation: 1,
  snapshotIdentity: `product-node-label-relation-presentation-first-angular-escape1-${fixtureId}-${armId}`,
  candidateFingerprint: fingerprintPreviewPositions(row.positions),
  positions: row.positions,
};
document.title = `${armId} / ${fixtureId}`;
createRoot(document.getElementById("root")!).render(<StrictMode><App
  diagnosticDataset={row.dataset as never}
  operationLocalPreview={preview}
  nodeLabelAngularEscapeById={policy}
  diagnosticFeedbackEnabled={false}
/></StrictMode>);
