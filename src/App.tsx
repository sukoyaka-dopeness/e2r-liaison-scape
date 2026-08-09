import { useMemo, useRef, useState } from "react";
import { applyStoredCoordinates, buildEntityGraph, getEntityDetail, getStoredCoordinates, loadDataset, serializeDataset, type Dataset, type Diagnostic, validateDatasetForExport, type GraphNode } from "./dataset";

const emptyDataset: Dataset = { version: "1.0", entities: [], events: [], relations: [] };

export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [message, setMessage] = useState("Import an E2R Dataset to begin.");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [coordinatesDirty, setCoordinatesDirty] = useState(false);
  const dragRef = useRef<{ kind: "canvas" | "node"; id?: string; x: number; y: number } | null>(null);
  const graph = useMemo(() => dataset ? buildEntityGraph(dataset) : { nodes: [], edges: [] }, [dataset]);
  const nodeMap = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const selectedDetail = dataset && selectedId ? getEntityDetail(dataset, selectedId) : null;

  function open(raw: string) {
    const result = loadDataset(raw);
    setDiagnostics(result.diagnostics);
    if (result.parseError) {
      setDataset(null);
      setMessage(`Import failed: ${result.parseError}`);
      return;
    }
    if (!result.dataset) {
      setDataset(null);
      setMessage("Dataset is invalid according to the Core or supported Extensions.");
      return;
    }
    setDataset(result.dataset);
    setSelectedId(null);
    setPositions(getStoredCoordinates(result.dataset));
    setCoordinatesDirty(false);
    setPan({ x: 0, y: 0 });
    setScale(1);
    setMessage(`Loaded ${result.dataset.entities.length} Entities and ${result.dataset.relations.length} Relations.`);
  }

  function nodePosition(node: GraphNode) { return positions[node.id] ?? node; }

  function onCanvasPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (event.clientX - drag.x) / scale;
    const dy = (event.clientY - drag.y) / scale;
    dragRef.current = { ...drag, x: event.clientX, y: event.clientY };
    if (drag.kind === "canvas") setPan((value) => ({ x: value.x + dx * scale, y: value.y + dy * scale }));
    else if (drag.id) { setCoordinatesDirty(true); setPositions((value) => ({ ...value, [drag.id!]: { ...nodePosition(nodeMap.get(drag.id!)!), x: nodePosition(nodeMap.get(drag.id!)!).x + dx, y: nodePosition(nodeMap.get(drag.id!)!).y + dy } })); }
  }

  function saveCoordinates() {
    if (!dataset || !coordinatesDirty) return;
    setDataset(applyStoredCoordinates(dataset, positions));
    setCoordinatesDirty(false);
    setMessage("Entity coordinates saved to the Dataset.");
  }

  function exportDataset() {
    if (!dataset) return;
    const exportDiagnostics = validateDatasetForExport(dataset);
    setDiagnostics(exportDiagnostics);
    if (exportDiagnostics.some(({ severity }) => severity === "error")) {
      setMessage("Export blocked: the Dataset has validation errors.");
      return;
    }
    if (exportDiagnostics.length > 0) setMessage("Exporting with validation warnings.");
    const blob = new Blob([serializeDataset(dataset)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "e2r-dataset.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main>
      <h1>Linkscape</h1>
      <p>Entity-first E2R relationship graph.</p>
      <input
        type="file"
        accept="application/json,.json,.e2r.json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void file.text().then(open);
        }}
      />
      <button type="button" disabled={!dataset} onClick={exportDataset}>Export E2R JSON</button>
      <button type="button" disabled={!dataset || !coordinatesDirty} onClick={saveCoordinates}>Save coordinates</button>
      <p role="status">{message}</p>
      {diagnostics.length > 0 && (
        <ul aria-label="Validation diagnostics">
          {diagnostics.map((diagnostic, index) => (
            <li key={`${diagnostic.code}-${index}`}>{diagnostic.severity}: {diagnostic.code} ({diagnostic.path})</li>
          ))}
        </ul>
      )}
      {dataset && (
        <section>
          <h2>Entity graph</h2>
          <p>{graph.nodes.length} Entity nodes and {graph.edges.length} Entity-to-Entity edges.</p>
          <svg
            className="graph"
            viewBox="0 0 800 500"
            role="img"
            aria-label="Entity relationship graph"
            onWheel={(event) => { event.preventDefault(); setScale((value) => Math.min(2.5, Math.max(.5, value * (event.deltaY < 0 ? 1.1 : .9)))); }}
            onPointerDown={(event) => { if (event.target === event.currentTarget) dragRef.current = { kind: "canvas", x: event.clientX, y: event.clientY }; }}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={() => { dragRef.current = null; }}
            onPointerLeave={() => { dragRef.current = null; }}
          >
            <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor" /></marker></defs>
            <g transform={`translate(${pan.x} ${pan.y}) scale(${scale})`}>
              {graph.edges.map((edge) => {
                const source = nodePosition(nodeMap.get(edge.sourceId)!);
                const target = nodePosition(nodeMap.get(edge.targetId)!);
                return <line key={edge.id} x1={source.x} y1={source.y} x2={target.x} y2={target.y} className="edge" markerEnd="url(#arrow)" />;
              })}
              {graph.nodes.map((node) => { const position = nodePosition(node); return (
                <g key={node.id} className={`node ${selectedId === node.id ? "selected" : ""}`} transform={`translate(${position.x} ${position.y})`} onClick={() => setSelectedId(node.id)} onPointerDown={(event) => { event.stopPropagation(); dragRef.current = { kind: "node", id: node.id, x: event.clientX, y: event.clientY }; }}>
                  <circle r="32" />
                  <text textAnchor="middle" dy="4">{node.label}</text>
                </g>
              ); })}
            </g>
          </svg>
          <p role="status">{selectedId ? `Selected Entity: ${selectedId}` : "Select an Entity"}</p>
          <p>{coordinatesDirty ? "Moved coordinates are temporary until you save them." : "Stored coordinates are restored when available."}</p>
          {selectedDetail && (
            <aside className="detail" aria-label="Entity Detail">
              <h3>Entity Detail</h3>
              <dl>
                <dt>ID</dt><dd>{selectedDetail.entity.id}</dd>
                <dt>Name</dt><dd>{typeof selectedDetail.entity.name === "string" ? selectedDetail.entity.name : "(unnamed)"}</dd>
                {typeof selectedDetail.entity.description === "string" && <><dt>Description</dt><dd>{selectedDetail.entity.description}</dd></>}
                <dt>Relations</dt><dd>{selectedDetail.relationIds.length}</dd>
              </dl>
            </aside>
          )}
        </section>
      )}
    </main>
  );
}
