import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../../../src/App.tsx";
import "../../../src/styles.css";
import { acceptanceFixturePath } from "../../../src/acceptance-fixture-access.ts";
import { fingerprintPreviewPositions } from "../../../src/operation-local-product-preview.ts";
import selectorArtifact from "../../cross-family-product-authoritative-auto-layout-portfolio-selector1/result-summary.json";
import comparisonArtifact from "../../frontier-g3-post-current-source-comparison1/result-summary.json";
import freeFormArtifact from "../../topology-aware-free-form-crossing-experiment1/result-summary.json";
import { bipartite as sharedBipartite, labelHeavyJa as sharedLabelHeavyJa } from "../../diagnostic-fixtures.mjs";

type Point = { x: number; y: number };
type Dataset = { version: string; entities: Array<{ id: string; name?: string; description?: string }>; events: unknown[]; relations: Array<{ id: string; sourceId: string; targetId: string; name?: string }> };
type SelectorRow = { fixture: string; locale: "en" | "ja"; source: string; oracle: { family: string }; selector: { family: string } };
type ComparisonRow = { fixture: string; locale: "en" | "ja"; source: string; candidates: Record<string, { positions: Record<string, Point> }> };
type FreeFormRow = { fixture: string; selected: { positions: Record<string, Point> } };
const BASE_URL = import.meta.env.BASE_URL;

function bipartite(leftSize: number, rightSize: number): Dataset {
  const left = Array.from({ length: leftSize }, (_, index) => `left-${index + 1}`);
  const right = Array.from({ length: rightSize }, (_, index) => `right-${index + 1}`);
  return { version: "1.0", entities: [...left, ...right].map((id) => ({ id, name: id.replace("-", " ") })), events: [], relations: left.flatMap((sourceId) => right.map((targetId) => ({ id: `${sourceId}-${targetId}`, sourceId, targetId, name: "connected" }))) };
}
function labelHeavyJa(): Dataset {
  const ids = Array.from({ length: 10 }, (_, index) => `label-n${index}`);
  return { version: "1.0", entities: ids.map((id, index) => ({ id, name: `譁ｰ譌･譛ｬ隱槭�繝ｩ繝吶Ν ${index}`, description: "髟ｷ縺ｪ譌･譛ｬ隱槭�陦ｨ遉ｺ遒ｺ隱咲畑" })), events: [], relations: Array.from({ length: 20 }, (_, index) => ({ id: `label-r${index}`, sourceId: ids[index % ids.length]!, targetId: ids[(index * 3 + 1) % ids.length]!, name: `譁ｰ譌･譛ｬ Relation繝ｩ繝吶Ν ${index} 縺ｮ陦ｨ遉ｺ` })) };
}
function generatedDataset(source: string): Dataset | null { const match = /^synthetic:k(\d+)-(\d+)$/.exec(source); if (match) return sharedBipartite(Number(match[1]), Number(match[2])); if (source === "synthetic:label-heavy-ja-10") return sharedLabelHeavyJa(); return null; }
async function loadDataset(row: SelectorRow): Promise<Dataset> { const generated = generatedDataset(row.source); if (generated) return generated; const name = row.fixture.startsWith("apollo-") ? "apollo-11" : row.fixture.replace(/-(en|ja)$/, ""); const response = await fetch(`${BASE_URL}${acceptanceFixturePath({ name: name as "titanic" | "apollo-11" | "lighthouse", locale: row.locale }).replace(/^\//, "")}`); if (!response.ok) throw new Error(`Portfolio fixture failed: ${response.status}`); return response.json(); }

const params = new URLSearchParams(location.search);
const requestedFixture = params.get("fixture") ?? "dense-k7-7";
const requestedCandidate = params.get("candidate") ?? "selected";
const selectorRow = (selectorArtifact.rows as SelectorRow[]).find(({ fixture }) => fixture === requestedFixture);
const comparisonRow = (comparisonArtifact.rows as ComparisonRow[]).find(({ fixture }) => fixture === requestedFixture);
const freeFormRow = (freeFormArtifact.rows as FreeFormRow[]).find(({ fixture }) => fixture === requestedFixture);
if (!selectorRow || !comparisonRow || !freeFormRow) throw new Error(`Unknown portfolio fixture: ${requestedFixture}`);
const family = requestedCandidate === "selected" ? selectorRow.selector.family : requestedCandidate === "oracle" ? selectorRow.oracle.family : requestedCandidate;
const positions = family === "free-form" ? freeFormRow.selected.positions : comparisonRow.candidates[family]?.positions;
if (!positions) throw new Error(`Unknown portfolio candidate: ${requestedCandidate}`);
const dataset = await loadDataset(selectorRow);
const preview = { operationId: 1, generation: 1, snapshotIdentity: `cross-family-product-authoritative-auto-layout-portfolio-selector1-${requestedFixture}-${requestedCandidate}`, candidateFingerprint: fingerprintPreviewPositions(positions), positions };
document.title = `${requestedCandidate} / ${requestedFixture}`;
createRoot(document.getElementById("root")!).render(<StrictMode><App diagnosticDataset={dataset} operationLocalPreview={preview} /></StrictMode>);
