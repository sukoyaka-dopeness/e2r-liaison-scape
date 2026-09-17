import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../../src/App.tsx";
import "../../src/styles.css";
import { fingerprintPreviewPositions } from "../../src/operation-local-product-preview.ts";
import { bipartite } from "../diagnostic-fixtures.mjs";

type Point = { x: number; y: number };
const dataset = bipartite(7, 7);
const ids = dataset.entities.map(({ id }) => id).sort();
const control = new URLSearchParams(location.search).get("control") ?? "pileup";
const positions: Record<string, Point> = Object.fromEntries(ids.map((id, index) => {
  if (control === "micro-collapse") return [id, { x: 240 + (index % 7) * 2, y: 220 + Math.floor(index / 7) * 2 }];
  return [id, { x: 240, y: 220 }];
}));
const preview = {
  operationId: 1,
  generation: 1,
  snapshotIdentity: `catastrophic-boundary1-${control}`,
  candidateFingerprint: fingerprintPreviewPositions(positions),
  positions,
};
document.title = `catastrophic control / ${control}`;
createRoot(document.getElementById("root")!).render(<StrictMode><App diagnosticDataset={dataset} operationLocalPreview={preview} /></StrictMode>);
