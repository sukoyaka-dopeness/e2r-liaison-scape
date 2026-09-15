import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../../../src/App.tsx";
import "../../../src/styles.css";
import { acceptanceFixturePath } from "../../../src/acceptance-fixture-access.ts";
import { fingerprintPreviewPositions } from "../../../src/operation-local-product-preview.ts";
import artifact from "../../frontier-actual-product-visual-sweep1/result-summary.json";

type Point = { x: number; y: number };
type Dataset = { version: string; entities: Array<{ id: string; name?: string; description?: string }>; events: unknown[]; relations: Array<{ id: string; sourceId: string; targetId: string; name?: string }> };
type Row = { fixture: string; locale: "en" | "ja"; source: string; surface: string; positions: Record<string, Point> };
const BASE_URL = import.meta.env.BASE_URL;

function bipartite(leftSize: number, rightSize: number): Dataset {
  const left = Array.from({ length: leftSize }, (_, index) => `left-${index + 1}`);
  const right = Array.from({ length: rightSize }, (_, index) => `right-${index + 1}`);
  return { version: "1.0", entities: [...left, ...right].map((id) => ({ id, name: id.replace("-", " ") })), events: [], relations: left.flatMap((sourceId) => right.map((targetId) => ({ id: `${sourceId}-${targetId}`, sourceId, targetId, name: "connected" }))) };
}

function parallelSelfLoop(): Dataset {
  const ids = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"];
  const pairs = [["r-ab-1", "alpha", "beta", "relates"], ["r-ab-2", "alpha", "beta", "supports"], ["r-ba-1", "beta", "alpha", "returns"], ["r-ba-2", "beta", "alpha", "reverses"], ["r-cd-1", "gamma", "delta", "links"], ["r-cd-2", "gamma", "delta", "tracks"], ["r-loop", "epsilon", "epsilon", "self monitors"], ["r-ef", "epsilon", "zeta", "connects"], ["r-fg", "zeta", "eta", "connects"], ["r-gh", "eta", "theta", "connects"], ["r-he", "theta", "epsilon", "connects"]] as const;
  return { version: "1.0", entities: ids.map((id) => ({ id, name: id[0]!.toUpperCase() + id.slice(1) })), events: [], relations: pairs.map(([id, sourceId, targetId, name]) => ({ id, sourceId, targetId, name })) };
}

function labelHeavyJa(): Dataset {
  const ids = Array.from({ length: 10 }, (_, index) => `label-n${index}`);
  return { version: "1.0", entities: ids.map((id, index) => ({ id, name: `日本語 長いノードラベル ${index} 障害対応確認`, description: "長い説明文を含む日本語の表示確認用ノード" })), events: [], relations: Array.from({ length: 20 }, (_, index) => ({ id: `label-r${index}`, sourceId: ids[index % ids.length]!, targetId: ids[(index * 3 + 1) % ids.length]!, name: `長い日本語Relationラベル ${index} の表示と所有関係を確認する` })) };
}

function generatedDataset(source: string): Dataset | null {
  const match = /^synthetic:k(\d+)-(\d+)$/.exec(source);
  if (match) return bipartite(Number(match[1]), Number(match[2]));
  if (source === "synthetic:parallel-self-loop-control") return parallelSelfLoop();
  if (source === "synthetic:label-heavy-ja-10") return labelHeavyJa();
  return null;
}

async function loadDataset(row: Row): Promise<Dataset> {
  const generated = generatedDataset(row.source);
  if (generated) return generated;
  const acceptanceName = row.fixture.startsWith("apollo-") ? "apollo-11" : row.fixture.replace(/-(en|ja)$/, "");
  const file = row.source.includes("berlin-wall-history")
    ? `${BASE_URL}__frontier-sweep-fixtures/berlin-wall-history.${row.locale}.e2r.json`
    : `${BASE_URL}${acceptanceFixturePath({ name: acceptanceName as "titanic" | "apollo-11" | "lighthouse" | "ashen-crown", locale: row.locale }).replace(/^\//, "")}`;
  const response = await fetch(file);
  if (!response.ok) throw new Error(`Frontier visual sweep fixture failed: ${response.status} ${file}`);
  return response.json();
}

const params = new URLSearchParams(location.search);
const rows = artifact.rows as Row[];
const row = rows.find(({ fixture }) => fixture === (params.get("fixture") ?? "lighthouse-en"));
if (!row || !row.positions) throw new Error(`Unknown Frontier visual sweep fixture: ${params.get("fixture")}`);
const dataset = await loadDataset(row);
const preview = { operationId: 1, generation: 1, snapshotIdentity: `frontier-actual-product-visual-sweep1-${row.fixture}`, candidateFingerprint: fingerprintPreviewPositions(row.positions), positions: row.positions };
document.title = `Frontier visual sweep · ${row.fixture}`;

createRoot(document.getElementById("root")!).render(<StrictMode><App diagnosticDataset={dataset} operationLocalPreview={preview} /></StrictMode>);
