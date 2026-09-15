import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../../../src/App.tsx";
import "../../../src/styles.css";
import { acceptanceFixturePath } from "../../../src/acceptance-fixture-access.ts";
import { fingerprintPreviewPositions } from "../../../src/operation-local-product-preview.ts";
import { parallelSelfLoop } from "../../diagnostic-fixtures.mjs";
import { higherMultiplicityParallel, mixedIncidentParallel } from "../../product-owned-parallel-bundle-generalization1/fixtures.mjs";
import { sharedEndpointBundles } from "../../product-owned-bundle-local-capacity1/fixtures.mjs";
import { diagonalLabelCapacity, englishTokenCapacity, horizontalLabelCapacity, japaneseLabelCapacity, verticalLabelCapacity } from "../../product-relation-label-display-only-wrap1/fixtures.mjs";
import artifact from "../../product-relation-label-display-only-wrap1/result-summary.json";

type Point = { x: number; y: number };
type Dataset = { version: string; entities: Array<{ id: string; name?: string; description?: string }>; events: unknown[]; relations: Array<{ id: string; sourceId: string; targetId: string; name?: string }> };
type Candidate = { spacingByKey?: Record<string, number>; staggerByRelationId?: Record<string, number>; wrapPolicy?: { maxLines?: number; maxLineWidth?: number; minimumWidth?: number; routeInset?: number; minimumDeficit?: number } | null };
type Row = { fixture: string; positions: Record<string, Point>; arms: Record<string, Candidate> };

const FINE_NORMAL_OFFSETS = [0, -4, 4, -8, 8, -12, 12, -16, 16, -24, 24, -32, 32, -40, 40];
const WRAP_POLICY = { maxLines: 2, maxLineWidth: 132, minimumWidth: 104, routeInset: 120, minimumDeficit: 12 };
const params = new URLSearchParams(location.search);
const fixtureId = params.get("fixture") ?? "horizontal-label-capacity";
const armId = params.get("arm") ?? "reference-wrap";
const row = (artifact.rows as Row[]).find(({ fixture }) => fixture === fixtureId);
if (!row) throw new Error(`Unknown display-wrap fixture: ${fixtureId}`);
const candidate = row.arms[armId];
if (!candidate) throw new Error(`Unknown display-wrap arm: ${armId}`);

function generatedDataset(id: string): Dataset | null {
  if (id === "parallel-self-loop-control") return parallelSelfLoop() as Dataset;
  if (id === "higher-multiplicity-5") return higherMultiplicityParallel() as Dataset;
  if (id === "mixed-incident-parallel") return mixedIncidentParallel() as Dataset;
  if (id === "shared-endpoint-multiple-bundle") return sharedEndpointBundles() as Dataset;
  if (id === "horizontal-label-capacity") return horizontalLabelCapacity() as Dataset;
  if (id === "japanese-label-capacity") return japaneseLabelCapacity() as Dataset;
  if (id === "english-token-punctuation") return englishTokenCapacity() as Dataset;
  if (id === "vertical-label-capacity") return verticalLabelCapacity() as Dataset;
  if (id === "diagonal-label-capacity") return diagonalLabelCapacity() as Dataset;
  return null;
}

async function loadDataset(id: string): Promise<Dataset> {
  const generated = generatedDataset(id);
  if (generated) return generated;
  const locale = id.endsWith("-ja") ? "ja" : "en";
  const response = await fetch(`${import.meta.env.BASE_URL}${acceptanceFixturePath({ name: "lighthouse", locale }).replace(/^\//, "")}`);
  if (!response.ok) throw new Error(`Public fixture failed: ${response.status}`);
  return response.json();
}

const dataset = await loadDataset(fixtureId);
const preview = { operationId: 1, generation: 1, snapshotIdentity: `product-relation-label-display-only-wrap1-${fixtureId}-${armId}`, candidateFingerprint: fingerprintPreviewPositions(row.positions), positions: row.positions };
const useWrap = armId === "reference-wrap" || armId === "orientation-wrap";
document.title = `${armId} / ${fixtureId}`;
createRoot(document.getElementById("root")!).render(<StrictMode><App
  diagnosticDataset={dataset}
  operationLocalPreview={preview}
  parallelBundleSpacingByKey={candidate.spacingByKey}
  relationLabelStaggerById={armId === "orientation-wrap" ? candidate.staggerByRelationId : undefined}
  relationLabelNormalOffsets={armId === "current-one-line" ? undefined : FINE_NORMAL_OFFSETS}
  relationLabelWrapPolicy={useWrap ? WRAP_POLICY : undefined}
/></StrictMode>);
