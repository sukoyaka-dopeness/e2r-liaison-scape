import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../../../src/App.tsx";
import "../../../src/styles.css";
import { acceptanceFixturePath } from "../../../src/acceptance-fixture-access.ts";
import { fingerprintPreviewPositions } from "../../../src/operation-local-product-preview.ts";
import artifact from "../../frontier-g3-post-current-source-comparison1/result-summary.json";

type Point = { x: number; y: number };
type Dataset = { version: string; entities: Array<{ id: string; name?: string; description?: string }>; events: unknown[]; relations: Array<{ id: string; sourceId: string; targetId: string; name?: string }> };
type Row = { fixture: string; locale: "en" | "ja"; source: string; candidates: Record<string, { positions: Record<string, Point>; selectedFamily: string; selectedPositionFingerprint: string }> };
const BASE_URL = import.meta.env.BASE_URL;

function bipartite(leftSize: number, rightSize: number): Dataset { const left = Array.from({ length: leftSize }, (_, index) => `left-${index + 1}`); const right = Array.from({ length: rightSize }, (_, index) => `right-${index + 1}`); return { version: "1.0", entities: [...left, ...right].map((id) => ({ id, name: id.replace("-", " ") })), events: [], relations: left.flatMap((sourceId) => right.map((targetId) => ({ id: `${sourceId}-${targetId}`, sourceId, targetId, name: "connected" }))) }; }
function labelHeavyJa(): Dataset { const ids = Array.from({ length: 10 }, (_, index) => `label-n${index}`); return { version: "1.0", entities: ids.map((id, index) => ({ id, name: `日本語 長いノードラベル ${index} 障害対応確認`, description: "長い説明文を含む日本語の表示確認用ノード" })), events: [], relations: Array.from({ length: 20 }, (_, index) => ({ id: `label-r${index}`, sourceId: ids[index % ids.length]!, targetId: ids[(index * 3 + 1) % ids.length]!, name: `長い日本語Relationラベル ${index} の表示と所有関係を確認する` })) }; }
function generatedDataset(source: string): Dataset | null { const match = /^synthetic:k(\d+)-(\d+)$/.exec(source); if (match) return bipartite(Number(match[1]), Number(match[2])); if (source === "synthetic:label-heavy-ja-10") return labelHeavyJa(); return null; }
async function loadDataset(row: Row): Promise<Dataset> { const generated = generatedDataset(row.source); if (generated) return generated; const name = row.fixture.startsWith("apollo-") ? "apollo-11" : row.fixture.replace(/-(en|ja)$/, ""); const response = await fetch(`${BASE_URL}${acceptanceFixturePath({ name: name as "titanic" | "apollo-11" | "lighthouse" | "ashen-crown", locale: row.locale }).replace(/^\//, "")}`); if (!response.ok) throw new Error(`Comparison fixture failed: ${response.status}`); return response.json(); }

const params = new URLSearchParams(location.search); const requestedFixture = params.get("fixture") ?? "lighthouse-en"; const requestedCandidate = params.get("candidate") ?? "frontier"; const row = (artifact.rows as Row[]).find(({ fixture }) => fixture === requestedFixture); if (!row) throw new Error(`Unknown comparison fixture: ${requestedFixture}`); const candidate = row.candidates[requestedCandidate]; if (!candidate) throw new Error(`Unknown comparison candidate: ${requestedCandidate}`); const dataset = await loadDataset(row); const preview = { operationId: 1, generation: 1, snapshotIdentity: `frontier-g3-post-current-source-comparison1-${requestedFixture}-${requestedCandidate}`, candidateFingerprint: fingerprintPreviewPositions(candidate.positions), positions: candidate.positions }; document.title = `${requestedCandidate} · ${requestedFixture}`;
createRoot(document.getElementById("root")!).render(<StrictMode><App diagnosticDataset={dataset} operationLocalPreview={preview} /></StrictMode>);
