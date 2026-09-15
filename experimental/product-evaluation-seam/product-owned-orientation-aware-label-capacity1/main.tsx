import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../../../src/App.tsx";
import "../../../src/styles.css";
import { acceptanceFixturePath } from "../../../src/acceptance-fixture-access.ts";
import { fingerprintPreviewPositions } from "../../../src/operation-local-product-preview.ts";
import { parallelSelfLoop } from "../../diagnostic-fixtures.mjs";
import { higherMultiplicityParallel, mixedIncidentParallel } from "../../product-owned-parallel-bundle-generalization1/fixtures.mjs";
import { sharedEndpointBundles } from "../../product-owned-bundle-local-capacity1/fixtures.mjs";
import { horizontalLabelCapacity, verticalLabelCapacity, diagonalLabelCapacity } from "../../product-owned-orientation-aware-label-capacity1/fixtures.mjs";
import artifact from "../../product-owned-orientation-aware-label-capacity1/result-summary.json";

type Point = { x: number; y: number };
type Dataset = { version: string; entities: Array<{ id: string; name?: string; description?: string }>; events: unknown[]; relations: Array<{ id: string; sourceId: string; targetId: string; name?: string }> };
type Candidate = { spacingByKey?: Record<string, number>; staggerByRelationId?: Record<string, number> };
type Row = { fixture: string; positions: Record<string, Point>; bundleLocalReference: Candidate; orientationAware: Candidate };
const params = new URLSearchParams(location.search);
const fixtureId = params.get("fixture") ?? "parallel-self-loop-control";
const candidateId = params.get("candidate") ?? "orientation-aware";
const row = (artifact.rows as Row[]).find(({ fixture }) => fixture === fixtureId);
if (!row) throw new Error(`Unknown orientation-aware fixture: ${fixtureId}`);

function generatedDataset(id: string): Dataset | null {
  if (id === "parallel-self-loop-control") return parallelSelfLoop() as Dataset;
  if (id === "higher-multiplicity-5") return higherMultiplicityParallel() as Dataset;
  if (id === "mixed-incident-parallel") return mixedIncidentParallel() as Dataset;
  if (id === "shared-endpoint-multiple-bundle") return sharedEndpointBundles() as Dataset;
  if (id === "horizontal-label-capacity") return horizontalLabelCapacity() as Dataset;
  if (id === "vertical-label-capacity") return verticalLabelCapacity() as Dataset;
  if (id === "diagonal-label-capacity") return diagonalLabelCapacity() as Dataset;
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
const preview = { operationId: 1, generation: 1, snapshotIdentity: `product-owned-orientation-aware-label-capacity1-${fixtureId}-${candidateId}`, candidateFingerprint: fingerprintPreviewPositions(row.positions), positions: row.positions };
const candidate = candidateId === "reference" ? row.bundleLocalReference : candidateId === "orientation-aware" ? row.orientationAware : {};
document.title = `${candidateId} / ${fixtureId}`;
createRoot(document.getElementById("root")!).render(<StrictMode><App diagnosticDataset={dataset} operationLocalPreview={preview} parallelBundleSpacingByKey={candidate.spacingByKey} relationLabelStaggerById={candidate.staggerByRelationId} /></StrictMode>);
