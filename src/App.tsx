import { useMemo, useRef, useState } from "react";
import { applyStoredCoordinates, buildEntityGraph, getEntityDetail, getStoredCoordinates, loadDataset, serializeDataset, type Dataset, type Diagnostic, validateDatasetForExport, type GraphNode } from "./dataset";
import { clampScale, zoomScale } from "./viewport";

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
  const graph = useMemo(() => dataset ? buildEntityGraph(dataset) : { nodes: [], edges: [], unsupportedEdges: 0 }, [dataset]);
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
  function nodeLabel(label: string) { return label.length > 14 ? `${label.slice(0, 13)}…` : label; }

  function edgePath(edge: { sourceId: string; targetId: string; parallelIndex: number; parallelCount: number }) {
    const source = nodePosition(nodeMap.get(edge.sourceId)!);
    const target = nodePosition(nodeMap.get(edge.targetId)!);
    if (edge.sourceId === edge.targetId) {
      const radius = 42 + edge.parallelIndex * 12;
      return `M ${source.x + 22} ${source.y - 22} C ${source.x + radius} ${source.y - radius}, ${source.x - radius} ${source.y - radius}, ${source.x - 22} ${source.y - 22}`;
    }
    const offset = (edge.parallelIndex - (edge.parallelCount - 1) / 2) * 24;
    const midX = (source.x + target.x) / 2;
    const midY = (source.y + target.y) / 2;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const controlX = midX - (dy / length) * offset;
    const controlY = midY + (dx / length) * offset;
    return `M ${source.x} ${source.y} Q ${controlX} ${controlY} ${target.x} ${target.y}`;
  }

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

  function resetView() {
    setScale(1);
    setPan({ x: 0, y: 0 });
    setSelectedId(null);
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
          <div className="viewport-controls" aria-label="Graph view controls">
            <button type="button" onClick={() => setScale((value) => zoomScale(value, "out"))}>Zoom out</button>
            <span aria-live="polite">{Math.round(scale * 100)}%</span>
            <button type="button" onClick={() => setScale((value) => zoomScale(value, "in"))}>Zoom in</button>
            <button type="button" onClick={resetView}>Reset view</button>
          </div>
          {graph.unsupportedEdges > 0 && <p role="status">{graph.unsupportedEdges} Relation(s) with an Event endpoint are not shown in the Entity-first MVP.</p>}
          <svg
            className="graph"
            viewBox="0 0 800 500"
            role="img"
            aria-label="Entity relationship graph"
            onWheel={(event) => { event.preventDefault(); setScale((value) => clampScale(value * (event.deltaY < 0 ? 1.1 : .9))); }}
            onPointerDown={(event) => { if (event.target === event.currentTarget) dragRef.current = { kind: "canvas", x: event.clientX, y: event.clientY }; }}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={() => { dragRef.current = null; }}
            onPointerLeave={() => { dragRef.current = null; }}
          >
            <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="currentColor" /></marker></defs>
            <g transform={`translate(${pan.x} ${pan.y}) scale(${scale})`}>
              {graph.edges.map((edge) => {
                return <path key={edge.id} d={edgePath(edge)} className="edge" markerEnd="url(#arrow)" />;
              })}
              {graph.nodes.map((node) => { const position = nodePosition(node); return (
                <g key={node.id} className={`node ${selectedId === node.id ? "selected" : ""}`} transform={`translate(${position.x} ${position.y})`} onClick={() => setSelectedId(node.id)} onPointerDown={(event) => { event.stopPropagation(); dragRef.current = { kind: "node", id: node.id, x: event.clientX, y: event.clientY }; }}>
                  <circle r="32" />
                  <title>{node.label}</title>
                  <text textAnchor="middle" dy="4">{nodeLabel(node.label)}</text>
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
