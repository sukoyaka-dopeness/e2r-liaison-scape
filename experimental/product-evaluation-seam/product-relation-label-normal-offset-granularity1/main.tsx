import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../../../src/App.tsx";
import "../../../src/styles.css";
import { acceptanceFixturePath } from "../../../src/acceptance-fixture-access.ts";
import { fingerprintPreviewPositions } from "../../../src/operation-local-product-preview.ts";
import { parallelSelfLoop } from "../../diagnostic-fixtures.mjs";
import { higherMultiplicityParallel, mixedIncidentParallel } from "../../product-owned-parallel-bundle-generalization1/fixtures.mjs";
import { sharedEndpointBundles } from "../../product-owned-bundle-local-capacity1/fixtures.mjs";
import artifact from "../../product-relation-label-normal-offset-granularity1/result-summary.json";

type Point = { x: number; y: number };
type Dataset = { version: string; entities: Array<{ id: string; name?: string; description?: string }>; events: unknown[]; relations: Array<{ id: string; sourceId: string; targetId: string; name?: string }> };
type Arm = { normalOffsets: number[]; spacingByKey?: Record<string, number> };
type Row = { fixture: string; positions: Record<string, Point>; arms: Record<string, Arm> };
const FINE_NORMAL_OFFSETS = [0, -4, 4, -8, 8, -12, 12, -16, 16, -24, 24, -32, 32, -40, 40];
const params = new URLSearchParams(location.search);
const fixtureId = params.get("fixture") ?? "parallel-self-loop-control";
const armId = params.get("arm") ?? "current-coarse";
const row = (artifact.rows as Row[]).find(({ fixture }) => fixture === fixtureId);
if (!row) throw new Error(`Unknown normal-offset fixture: ${fixtureId}`);

function generatedDataset(id: string): Dataset | null {
  if (id === "parallel-self-loop-control") return parallelSelfLoop() as Dataset;
  if (id === "higher-multiplicity-5") return higherMultiplicityParallel() as Dataset;
  if (id === "mixed-incident-parallel") return mixedIncidentParallel() as Dataset;
  if (id === "shared-endpoint-multiple-bundle") return sharedEndpointBundles() as Dataset;
  return null;
}
async function loadDataset(id: string): Promise<Dataset> {
  const generated = generatedDataset(id);
  if (generated) return generated;
  const response = await fetch(`${import.meta.env.BASE_URL}${acceptanceFixturePath({ name: "lighthouse", locale: "en" }).replace(/^\//, "")}`);
  if (!response.ok) throw new Error(`Public fixture failed: ${response.status}`);
  return response.json();
}

const dataset = await loadDataset(fixtureId);
const arm = row.arms[armId];
if (!arm) throw new Error(`Unknown normal-offset arm: ${armId}`);
const preview = { operationId: 1, generation: 1, snapshotIdentity: `product-relation-label-normal-offset-granularity1-${fixtureId}-${armId}`, candidateFingerprint: fingerprintPreviewPositions(row.positions), positions: row.positions };
document.title = `${armId} / ${fixtureId}`;
createRoot(document.getElementById("root")!).render(<StrictMode><App diagnosticDataset={dataset} operationLocalPreview={preview} parallelBundleSpacingByKey={arm.spacingByKey} relationLabelNormalOffsets={armId.endsWith("fine") ? FINE_NORMAL_OFFSETS : undefined} /></StrictMode>);
