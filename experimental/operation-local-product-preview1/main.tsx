import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../../src/App.tsx";
import "../../src/styles.css";
import { fingerprintPreviewPositions } from "../../src/operation-local-product-preview.ts";

type Point = { x: number; y: number };
function positions(value: string): Record<string, Point> { return Object.fromEntries(value.split("|").map((item) => { const [id, pair] = item.split(":"); const [x, y] = pair!.split(",").map(Number); return [id!, { x, y }]; })); }
function makeCase(id: string, nodeCount: number, edgeCount: number, long = false) {
  const ids = Array.from({ length: nodeCount }, (_, index) => `${id}-n${index}`);
  const relations = Array.from({ length: edgeCount }, (_, index) => ({ id: `${id}-r${index}`, sourceId: ids[index % nodeCount]!, targetId: ids[(index * 3 + 1) % nodeCount]!, name: long ? `関係 ${index} — 長い日本語 Relation-label の可読性確認` : `Relation ${index}` }));
  return { version: "1.0", metadata: { title: `HQ preview ${id}` }, entities: ids.map((entityId, index) => ({ id: entityId, name: long ? `ノード ${index} — 長い日本語ラベル` : `Node ${index}`, description: long ? "説明文を含むラベル表示" : "" })), events: [], relations };
}
const candidates = {
  canonical: positions("canonical-n0:167.909,169.909|canonical-n1:323.411,168.615|canonical-n2:630.319,166.909|canonical-n3:785.821,165.615|canonical-n4:280.173,278.485|canonical-n5:162.539,322.352|canonical-n6:742.583,280.485|canonical-n7:633.950,319.352"),
  dense: positions("dense-n0:162.986,158.447|dense-n1:298.641,167.216|dense-n10:614.432,158.000|dense-n11:1059.706,170.600|dense-n12:257.565,277.336|dense-n13:156.514,326.550|dense-n2:1220.380,176.107|dense-n3:769.862,161.000|dense-n4:61.856,279.354|dense-n5:1187.348,275.618|dense-n6:1081.447,316.875|dense-n7:961.726,266.463|dense-n8:913.509,169.145|dense-n9:20.873,170.132"),
  label: positions("label-n0:173.820,167.462|label-n1:317.601,171.018|label-n2:624.604,158.000|label-n3:269.261,277.480|label-n4:176.315,321.356|label-n5:1098.381,167.462|label-n6:1242.163,171.018|label-n7:785.561,158.000|label-n8:1193.822,277.480|label-n9:1100.876,321.356"),
};
const id = new URLSearchParams(location.search).get("case") as keyof typeof candidates ?? "canonical";
const selected = candidates[id] ?? candidates.canonical;
const dataset = id === "dense" ? makeCase("dense", 14, 49) : id === "label" ? makeCase("label", 10, 20, true) : makeCase("canonical", 8, 10);
const previewRequested = new URLSearchParams(location.search).get("mode") === "hq";
const preview = previewRequested ? { operationId: 1, generation: 1, snapshotIdentity: `worker-parity-${id}`, candidateFingerprint: fingerprintPreviewPositions(selected), positions: selected } : undefined;
if (previewRequested) { const next = new URL(location.href); next.searchParams.delete("mode"); history.replaceState(history.state, "", next); }
createRoot(document.getElementById("root")!).render(<StrictMode><App diagnosticDataset={dataset} operationLocalPreview={preview} /></StrictMode>);
