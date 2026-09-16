import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../../../src/App.tsx";
import "../../../src/styles.css";
import { fingerprintPreviewPositions } from "../../../src/operation-local-product-preview.ts";
import priorArtifact from "../../product-node-label-hysteresis-recovery-attribution1/result-summary.json";
import type { Point } from "../../../src/viewport.ts";

type Row = {
  fixture: string;
  dataset: unknown;
  positions: Record<string, Point>;
};

const params = new URLSearchParams(location.search);
const fixtureId = params.get("fixture") ?? "horizontal-label-capacity";
const row = (priorArtifact.rows as Row[]).find(({ fixture }) => fixture === fixtureId);
if (!row) throw new Error(`Unknown recovery integration fixture: ${fixtureId}`);
const normalOffsets = params.get("relation-change") === "1" ? [-12, 0, 12] : undefined;
const preview = {
  operationId: 1,
  generation: 1,
  snapshotIdentity: `product-node-label-recovery-integration1-${fixtureId}`,
  candidateFingerprint: fingerprintPreviewPositions(row.positions),
  positions: row.positions,
};
document.title = `recovery integration / ${fixtureId}`;

// The recovery candidate is activated by the normal App URL switch:
// ?node-label-recovery=candidate. No diagnostic recovery prop or previous
// Node-label override is passed here.
createRoot(document.getElementById("root")!).render(<StrictMode><App
  diagnosticDataset={row.dataset as never}
  operationLocalPreview={preview}
  relationLabelNormalOffsets={normalOffsets}
/></StrictMode>);
